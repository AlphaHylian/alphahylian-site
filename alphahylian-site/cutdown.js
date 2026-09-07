/* =====================================================================
   CUTDOWN — cut the silence out of a video and even out its volume.

   Everything runs locally: ffmpeg compiled to WebAssembly does the
   decoding and encoding, and the silence analysis is plain JS over the
   decoded PCM (far faster than parsing ffmpeg's silencedetect log, and
   it lets the waveform update the instant a slider moves).

   Pipeline:
     file -> ffmpeg extracts 16k mono wav -> Web Audio decodes it
          -> JS finds the keep-ranges
          -> one ffmpeg pass: per-range trim/atrim -> concat -> levelling
   ===================================================================== */

// The ~32 MB wasm core comes from the CDN (fetched and handed over as a blob,
// which is fine cross-origin). The small loader lives in /vendor because
// ffmpeg.wasm spawns a Worker and Workers cannot be built from a cross-origin
// script — see vendor/README.md.
const CORE_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd';

/* Levelling chains, tuned by measurement against a fixture that alternates
   between full-scale and -24 dBFS. Spread = how far apart the loud and quiet
   passages end up; lower is more even.
       off 24.1 dB · gentle 14.7 · even 5.8 · aggressive 1.6
   speechnorm alone barely helps (it is peak driven) and dynaudnorm alone tops
   out around 17 dB, but the two in series do the job.
   alimiter's `level` defaults to ON, which re-normalises back to 0 dBFS and
   throws away the headroom — hence level=disabled, leaving a true -1 dBFS. */
const LEVELS = {
  off: null,
  gentle: 'speechnorm=e=12.5:r=0.001:l=1,dynaudnorm=f=200:g=9:p=0.9:m=8:r=0.9:n=0,alimiter=limit=0.891:level=disabled',
  even:   'speechnorm=e=25:r=0.002:l=1,dynaudnorm=f=150:g=7:p=0.9:m=14:r=0.9:n=0,alimiter=limit=0.891:level=disabled',
  hard:   'speechnorm=e=50:r=0.005:l=1,dynaudnorm=f=100:g=5:p=0.95:m=20:r=0.9:n=0,alimiter=limit=0.891:level=disabled'
};
const LOUDNORM = 'loudnorm=I=-16:TP=-1.5:LRA=11';

const QUALITY = {
  draft:  { preset: 'ultrafast', crf: '26' },
  normal: { preset: 'veryfast',  crf: '22' },
  high:   { preset: 'medium',    crf: '20' }
};

// A filter graph gets unwieldy long before ffmpeg refuses it; past this we ask
// for a longer minimum silence rather than building a 1200-filter command.
// The browser-encoder path builds no graph at all — it just walks the ranges —
// so it only needs a limit loose enough to catch a runaway setting.
const MAX_SEGMENTS = 400;
const MAX_SEGMENTS_FAST = 20000;
const MIN_CLIP = 0.12;     // seconds; drop keep-ranges shorter than this
const HOP_SECONDS = 0.02;  // analysis window

// Above this, the finished video is big enough that holding it in memory is a
// real risk, so the save-to-disk option gets ticked for you.
const DISK_SUGGEST_BYTES = 600 * 1024 * 1024;

/* ------------------------------------------------------------------ DOM */
const el = id => document.getElementById(id);
const dropEl = el('cd-drop');
const fileEl = el('cd-file');
const workEl = el('cd-work');
const videoEl = el('cd-video');
const filenameEl = el('cd-filename');
const waveEl = el('cd-wave');
const statsEl = el('cd-stats');
const goEl = el('cd-go');
const resetEl = el('cd-reset');
const progEl = el('cd-progress');
const barEl = el('cd-barfill');
const plabelEl = el('cd-plabel');
const plogEl = el('cd-plog');
const resultEl = el('cd-result');
const outEl = el('cd-out');
const downloadEl = el('cd-download');
const outinfoEl = el('cd-outinfo');
const errEl = el('cd-err');
const autoEl = el('cd-auto');
const autoNoteEl = el('cd-autonote');
const previewEl = el('cd-preview');
const engineEl = el('cd-engine');
const diskRowEl = el('cd-diskrow');
const diskHintEl = el('cd-diskhint');
const diskEl = el('cd-todisk');

const ctrl = {
  thr: el('cd-thr'), thrV: el('cd-thr-v'),
  min: el('cd-min'), minV: el('cd-min-v'),
  pad: el('cd-pad'), padV: el('cd-pad-v'),
  level: el('cd-level'), lufs: el('cd-lufs'),
  quality: el('cd-quality')
};

/* ---------------------------------------------------------------- state */
const state = {
  file: null,
  ext: 'mp4',
  duration: 0,
  env: null,          // Float32Array of per-hop peaks — all the waveform needs
  waveGain: 1,        // display-only scale so quiet recordings still show up
  audioRate: 0,       // source audio rate/channels, kept for the encoder
  audioChannels: 0,
  ffInput: false,     // has the source been copied into ffmpeg's filesystem yet
  frameDb: null,      // Float32Array of per-hop dBFS
  keep: [],           // [[start,end], ...] seconds
  level: 'even',
  quality: 'normal',
  busy: false,
  preview: false,
  outUrl: null
};

let ffmpeg = null;
let ffmpegReady = false;

/* -------------------------------------------------------------- helpers */
function showError(msg) {
  errEl.textContent = msg;
  errEl.classList.add('on');
}
function clearError() {
  errEl.classList.remove('on');
  errEl.textContent = '';
}
function fmtTime(s) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m + ':' + String(sec).padStart(2, '0');
}
function fmtSize(bytes) {
  if (bytes > 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  if (bytes > 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}
function themeColour(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name);
  return (v || '').trim() || fallback;
}

/* ------------------------------------------------------------- ffmpeg */
/* @ffmpeg/util's UMD bundle references a bare `exports` and throws
   "exports is not defined" when loaded as a plain <script>, so it never
   registers its global. Both helpers we need from it are three lines. */
async function toBlobURL(url, mime) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`could not fetch ${url} (${res.status})`);
  return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: mime }));
}
async function fetchFile(file) {
  return new Uint8Array(await file.arrayBuffer());
}

async function loadFFmpeg(onNote) {
  if (ffmpegReady) return ffmpeg;
  if (!window.FFmpegWASM) {
    throw new Error('ffmpeg failed to load from the CDN — check your connection and reload.');
  }
  const { FFmpeg } = window.FFmpegWASM;

  onNote && onNote('Fetching the video engine (~32 MB, once per visit)…');
  ffmpeg = new FFmpeg();
  ffmpeg.on('log', ({ message }) => { plogEl.textContent = message; });

  await ffmpeg.load({
    coreURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${CORE_BASE}/ffmpeg-core.wasm`, 'application/wasm')
    // no classWorkerURL: /vendor/ffmpeg.js resolves its worker chunk to
    // /vendor/814.ffmpeg.js, same-origin, which is what Worker requires.
  });
  ffmpegReady = true;
  return ffmpeg;
}

/* -------------------------------------------------- silence analysis */
/**
 * Turn the dB envelope into ranges worth keeping.
 * threshold dBFS, minSilence/pad in seconds.
 */
function findKeep(frameDb, threshold, minSilence, pad, duration) {
  const n = frameDb.length;
  if (!n) return [[0, duration]];
  const hop = HOP_SECONDS;
  const minSilenceFrames = Math.max(1, Math.round(minSilence / hop));

  // 1. loud / quiet per frame
  const loud = new Uint8Array(n);
  for (let i = 0; i < n; i++) loud[i] = frameDb[i] > threshold ? 1 : 0;

  // 2. A quiet run shorter than the minimum isn't worth cutting — fill it in,
  //    which is what keeps natural breaths and beats between words.
  //    Runs touching the very start or end are deliberately NOT filled: dead
  //    air at the top and tail of a take always goes, however short it is.
  let i = 0;
  while (i < n) {
    if (loud[i]) { i++; continue; }
    let j = i;
    while (j < n && !loud[j]) j++;
    if (j - i < minSilenceFrames && i > 0 && j < n) {
      for (let k = i; k < j; k++) loud[k] = 1;
    }
    i = j;
  }

  // 3. maximal loud runs -> ranges, padded outward
  const ranges = [];
  i = 0;
  while (i < n) {
    if (!loud[i]) { i++; continue; }
    let j = i;
    while (j < n && loud[j]) j++;
    ranges.push([
      Math.max(0, i * hop - pad),
      Math.min(duration, j * hop + pad)
    ]);
    i = j;
  }
  if (!ranges.length) return [[0, duration]];   // nothing detected: keep it all

  // 4. merge anything that now overlaps, then drop slivers
  const merged = [ranges[0]];
  for (let k = 1; k < ranges.length; k++) {
    const last = merged[merged.length - 1];
    if (ranges[k][0] <= last[1]) last[1] = Math.max(last[1], ranges[k][1]);
    else merged.push(ranges[k]);
  }
  const kept = merged.filter(r => r[1] - r[0] >= MIN_CLIP);
  return kept.length ? kept : [[0, duration]];
}

/**
 * Guess sensible settings from the audio itself. The threshold is the one
 * nobody can pick blind: it has to sit above whatever the room noise floor is
 * but clearly below the level the speech sits at.
 */
function autoSettings(frameDb) {
  const sorted = Float32Array.from(frameDb).sort();
  const pct = p => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];
  const floor = pct(0.10);    // room tone / digital silence
  const speech = pct(0.85);   // where the talking actually sits

  // above the floor, but never so close to speech that words get chopped
  let thr = Math.max(floor + 8, speech - 22);
  thr = Math.min(thr, speech - 8);
  thr = Math.max(-60, Math.min(-20, thr));

  return {
    threshold: Math.round(thr),
    minSilence: 0.35,
    pad: 0.08,
    floor: floor,
    speech: speech
  };
}

function keptDuration(keep) {
  return keep.reduce((a, r) => a + (r[1] - r[0]), 0);
}

/* ------------------------------------------------------------ waveform */
// Absolute level says nothing useful here — a quietly recorded take would draw
// as a flat line. Scale the display so the loudest peak fills the panel.
function waveGainFor(env) {
  let peak = 0;
  for (let i = 0; i < env.length; i++) if (env[i] > peak) peak = env[i];
  return peak > 0.001 ? 1 / peak : 1;
}

/* Per-hop RMS and peak, accumulated as the audio decodes.

   Keeping the decoded samples around instead would cost about half a gigabyte
   for a two-hour recording, and nothing downstream actually wants them: the
   cut detector needs one dB figure per 20 ms hop and the waveform needs one
   peak per hop, so both get built on the way past and the samples are dropped.
   ------------------------------------------------------------------------ */
function Analyser(sampleRate) {
  this.hop = Math.max(1, Math.round(sampleRate * HOP_SECONDS));
  this.sum = 0;
  this.peak = 0;
  this.n = 0;
  this.db = [];
  this.env = [];
  this.total = 0;
}

Analyser.prototype._closeHop = function () {
  const rms = Math.sqrt(this.sum / this.hop);
  this.db.push(rms > 1e-7 ? 20 * Math.log10(rms) : -120);
  this.env.push(this.peak);
  this.sum = 0; this.peak = 0; this.n = 0;
};

Analyser.prototype.push = function (chans, count) {
  const ch = chans.length;
  for (let i = 0; i < count; i++) {
    let v = 0;
    for (let c = 0; c < ch; c++) v += chans[c][i];
    v /= ch;
    const a = v < 0 ? -v : v;
    if (a > this.peak) this.peak = a;
    this.sum += v * v;
    if (++this.n === this.hop) this._closeHop();
  }
  this.total += count;
};

Analyser.prototype.finish = function () {
  // A partial last hop is scaled as if it were full, so a tail that is half a
  // hop long doesn't read as suddenly quiet and get trimmed.
  if (this.n > 0) {
    const rms = Math.sqrt(this.sum / this.n);
    this.db.push(rms > 1e-7 ? 20 * Math.log10(rms) : -120);
    this.env.push(this.peak);
  }
  return { frameDb: Float32Array.from(this.db), env: Float32Array.from(this.env), samples: this.total };
};

function drawWave() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = waveEl.clientWidth, h = waveEl.clientHeight;
  if (!w || !h) return;
  waveEl.width = Math.round(w * dpr);
  waveEl.height = Math.round(h * dpr);
  const g = waveEl.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const panelAlt = themeColour('--panel-alt', '#1c1c20');
  const accent = themeColour('--accent', '#8a6cf2');
  const faint = themeColour('--text-faint', '#6b6a72');

  g.fillStyle = panelAlt;
  g.fillRect(0, 0, w, h);

  if (!state.env || !state.duration) return;

  // Shade every stretch that is going to be removed, and rule a line at each
  // cut, so what survives is obvious at a glance rather than implied.
  const border = themeColour('--border', '#27272c');
  let prevEnd = 0;
  const shadeCut = (from, to) => {
    const x0 = (from / state.duration) * w, x1 = (to / state.duration) * w;
    if (x1 - x0 < 0.5) return;
    g.fillStyle = border;
    g.globalAlpha = 0.5;
    g.fillRect(x0, 0, x1 - x0, h);
    g.globalAlpha = 1;
    g.fillStyle = themeColour('--text-faint', '#6b6a72');
    g.fillRect(x0, 0, 1, h);
    g.fillRect(x1 - 1, 0, 1, h);
  };
  for (const [s0, e0] of state.keep) { shadeCut(prevEnd, s0); prevEnd = e0; }
  shadeCut(prevEnd, state.duration);
  const env = state.env;
  const mid = h / 2;
  const perPx = env.length / w;

  // cut regions get a dim wash so the kept parts read as the signal
  const inKeep = new Uint8Array(w);
  for (const [s, e] of state.keep) {
    const a = Math.max(0, Math.floor(s / state.duration * w));
    const b = Math.min(w, Math.ceil(e / state.duration * w));
    for (let x = a; x < b; x++) inKeep[x] = 1;
  }

  for (let x = 0; x < w; x++) {
    const start = Math.floor(x * perPx);
    const end = Math.max(start + 1, Math.min(env.length, Math.floor((x + 1) * perPx)));
    let peak = 0;
    for (let i = start; i < end; i++) if (env[i] > peak) peak = env[i];
    const amp = Math.max(1, Math.min(mid, peak * state.waveGain * mid * 0.95));
    g.fillStyle = inKeep[x] ? accent : faint;
    g.globalAlpha = inKeep[x] ? 0.95 : 0.25;
    g.fillRect(x, mid - amp, 1, amp * 2);
  }
  g.globalAlpha = 1;

  // playhead
  if (videoEl.duration && videoEl.currentTime > 0) {
    const px = (videoEl.currentTime / state.duration) * w;
    g.fillStyle = themeColour('--accent-glow', '#a888ff');
    g.fillRect(px - 1, 0, 2, h);
  }
}

function renderStats() {
  if (!state.keep.length) { statsEl.innerHTML = ''; return; }
  const kept = keptDuration(state.keep);
  const saved = state.duration - kept;
  const cuts = Math.max(0, state.keep.length - 1);
  const pct = state.duration ? Math.round(saved / state.duration * 100) : 0;
  statsEl.innerHTML =
    `<span>Original <b>${fmtTime(state.duration)}</b></span>` +
    `<span>After cuts <b>${fmtTime(kept)}</b></span>` +
    `<span class="good">Saved <b>${fmtTime(saved)}</b> (${pct}%)</span>` +
    `<span>Cuts <b>${cuts}</b></span>`;
}

// Push auto-picked values into the controls. Called once when a file lands and
// again whenever the Auto button is pressed.
function applyAuto(quiet) {
  if (!state.frameDb) return;
  const a = autoSettings(state.frameDb);
  ctrl.thr.value = a.threshold;
  ctrl.min.value = a.minSilence;
  ctrl.pad.value = a.pad;
  syncControlLabels();
  if (!quiet) recompute();
  autoNoteEl.textContent =
    `Auto: noise floor ${Math.round(a.floor)} dB, speech ${Math.round(a.speech)} dB ` +
    `→ threshold ${a.threshold} dB`;
}

function syncControlLabels() {
  ctrl.thrV.textContent = `${ctrl.thr.value} dB`.replace('-', '−');
  ctrl.minV.textContent = `${(+ctrl.min.value).toFixed(2)} s`;
  ctrl.padV.textContent = `${(+ctrl.pad.value).toFixed(2)} s`;
}

function recompute() {
  if (!state.frameDb) return;
  const thr = parseFloat(ctrl.thr.value);
  const min = parseFloat(ctrl.min.value);
  const pad = parseFloat(ctrl.pad.value);
  state.keep = findKeep(state.frameDb, thr, min, pad, state.duration);
  renderStats();
  drawWave();

  const cap = (fastPathPossible() && state.audioRate > 0) ? MAX_SEGMENTS_FAST : MAX_SEGMENTS;
  if (state.keep.length > cap) {
    showError(`That produces ${state.keep.length} separate clips, which is more than ` +
      `Cutdown will stitch in one pass. Raise "min silence to cut" a little.`);
    goEl.disabled = true;
  } else {
    clearError();
    goEl.disabled = state.busy;
  }
}

/* ----------------------------------------------------------- file load */
async function handleFile(file) {
  if (!file) return;
  clearError();
  resultEl.classList.remove('on');
  if (state.outUrl) { URL.revokeObjectURL(state.outUrl); state.outUrl = null; }

  state.file = file;
  state.ffInput = false;
  const dot = file.name.lastIndexOf('.');
  state.ext = dot > -1 ? file.name.slice(dot + 1).toLowerCase() : 'mp4';
  filenameEl.textContent = `${file.name} · ${fmtSize(file.size)}`;
  offerDiskSave(file);

  videoEl.src = URL.createObjectURL(file);
  workEl.classList.add('on');
  dropEl.style.display = 'none';

  goEl.disabled = true;
  progEl.classList.add('on');
  barEl.style.width = '0%';

  try {
    let analysed = false;
    if (fastPathPossible()) {
      // No ffmpeg at all on this path: no 32 MB download, and no second copy
      // of the source sitting in a wasm heap.
      try {
        plabelEl.textContent = 'Reading the audio…';
        barEl.style.width = '15%';
        const a = await analyseWithWebCodecs(file, p => {
          barEl.style.width = (15 + 75 * p).toFixed(0) + '%';
        });
        state.frameDb = a.frameDb;
        state.env = a.env;
        state.audioRate = a.sampleRate;
        state.audioChannels = a.channels;
        state.duration = a.duration;
        state.waveGain = waveGainFor(a.env);
        analysed = true;
      } catch (err) {
        // An .mp4 that isn't one, or a codec this browser won't decode. ffmpeg
        // sniffs the actual contents rather than trusting the extension, so
        // let it have a go before giving up on the file.
        if (/no audio track/.test(err && err.message)) throw err;
        console.warn('[cutdown] fast analysis unavailable, using ffmpeg:', err);
        state.audioRate = 0;
      }
    }
    if (!analysed) {
      plabelEl.textContent = 'Loading the video engine…';
      await loadFFmpeg(msg => { plabelEl.textContent = msg; });

      plabelEl.textContent = 'Reading the audio…';
      barEl.style.width = '35%';
      await ensureFFmpegInput();

      // 16 kHz mono is plenty for level analysis and keeps this pass quick.
      await ffmpeg.exec(['-i', 'input.' + state.ext, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', 'probe.wav']);
      const wav = await ffmpeg.readFile('probe.wav');

      plabelEl.textContent = 'Analysing…';
      barEl.style.width = '75%';
      const AC = window.AudioContext || window.webkitAudioContext;
      const actx = new AC();
      // slice() because decodeAudioData detaches the buffer it is handed
      const audio = await actx.decodeAudioData(wav.buffer.slice(0));
      actx.close();

      const pcm = audio.getChannelData(0);
      const an = new Analyser(audio.sampleRate);
      an.push([pcm], pcm.length);
      const done = an.finish();
      state.frameDb = done.frameDb;
      state.env = done.env;
      state.duration = audio.duration;
      state.waveGain = waveGainFor(done.env);

      await ffmpeg.deleteFile('probe.wav');
    }

    applyAuto(true);

    barEl.style.width = '100%';
    progEl.classList.remove('on');
    recompute();
  } catch (err) {
    progEl.classList.remove('on');
    console.error(err);
    const msg = err && err.message ? err.message : String(err);
    showError(/no audio track/.test(msg)
      ? 'That file has no audio track, so there is nothing to cut on.'
      : 'Could not read that file: ' + msg + ' — try an MP4 or MOV.');
  }
}

/* ------------------------------------------------------------ process */
function buildFilterGraph(keep, levelKey, wantLufs) {
  const parts = [];
  const labels = [];
  keep.forEach(([s, e], i) => {
    const ss = s.toFixed(3), ee = e.toFixed(3);
    parts.push(`[0:v]trim=${ss}:${ee},setpts=PTS-STARTPTS[v${i}]`);
    parts.push(`[0:a]atrim=${ss}:${ee},asetpts=PTS-STARTPTS[a${i}]`);
    labels.push(`[v${i}][a${i}]`);
  });
  parts.push(`${labels.join('')}concat=n=${keep.length}:v=1:a=1[vout][araw]`);

  const chain = [];
  if (LEVELS[levelKey]) chain.push(LEVELS[levelKey]);
  if (wantLufs) chain.push(LOUDNORM);
  if (chain.length) parts.push(`[araw]${chain.join(',')}[aout]`);

  return { graph: parts.join(';'), audioLabel: chain.length ? '[aout]' : '[araw]' };
}

/** ffmpeg fallback: one pass, trim+concat+level, re-encoding with libx264. */
async function processWithFFmpeg(onProgress) {
  const { graph, audioLabel } = buildFilterGraph(state.keep, state.level, ctrl.lufs.checked);
  const q = QUALITY[state.quality];
  const inName = 'input.' + state.ext;

  await ensureFFmpegInput();
  const relay = ({ progress }) => onProgress(Math.max(0, Math.min(1, progress || 0)), 'Encoding…');
  ffmpeg.on('progress', relay);
  try {
    await ffmpeg.exec([
      '-i', inName,
      '-filter_complex', graph,
      '-map', '[vout]', '-map', audioLabel,
      '-c:v', 'libx264', '-preset', q.preset, '-crf', q.crf, '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '160k',
      '-movflags', '+faststart',
      'output.mp4'
    ]);
    const out = await ffmpeg.readFile('output.mp4');
    if (!out || !out.length) throw new Error('ffmpeg produced an empty file');
    const blob = new Blob([out.buffer], { type: 'video/mp4' });
    await ffmpeg.deleteFile('output.mp4');
    return blob;
  } finally {
    if (ffmpeg.off) ffmpeg.off('progress', relay);
  }
}

async function process() {
  if (state.busy || !state.file || !state.keep.length) return;

  // The save dialog has to be the very first thing we await: it needs the
  // activation from the click that got us here, and that doesn't survive a
  // trip through the encoder setup.
  let sink = null;
  if (diskEl.checked && diskSaveAvailable()) {
    try {
      sink = await openDiskSink();
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // they closed the dialog
      showError('Could not open that file for writing: ' + (err && err.message ? err.message : err));
      return;
    }
  }

  state.busy = true;
  goEl.disabled = true;
  clearError();
  setPreview(false);
  resultEl.classList.remove('on');
  progEl.classList.add('on');
  barEl.style.width = '0%';

  const onProgress = (p, label) => {
    barEl.style.width = (Math.max(0, Math.min(1, p)) * 100).toFixed(1) + '%';
    plabelEl.textContent = `${label} ${Math.round(p * 100)}%`;
  };

  const started = performance.now();
  let blob = null, engine = '', savedTo = null;

  // The fast path needs an MP4/MOV the browser can decode; everything else
  // (MKV, WebM, exotic codecs) goes to ffmpeg.
  const fastEligible = fastPathPossible() && state.audioRate > 0;

  try {
    if (fastEligible) {
      try {
        engineEl.textContent = 'Using the browser’s own video encoder';
        const r = await processFast(onProgress, sink);
        blob = r.blob;
        savedTo = r.savedTo || null;
        engine = `browser encoder · ${r.stats.decoded} frames read, ${r.stats.encoded} kept`;
      } catch (err) {
        console.warn('[cutdown] fast path unavailable, falling back to ffmpeg:', err);
        engineEl.textContent = 'Browser encoder could not handle this file (' +
          (err && err.message ? err.message : err) + ') — using ffmpeg, which is slower.';
        blob = null;
        // a half-written file is no use to ffmpeg; start it over
        if (sink) await resetDiskSink(sink);
      }
    } else if (!webCodecsAvailable()) {
      engineEl.textContent = 'This browser has no video encoder API — using ffmpeg, which is slower.';
    } else {
      engineEl.textContent = 'That container needs ffmpeg, which is slower. MP4 or MOV is much faster.';
    }

    if (!blob) {
      blob = await processWithFFmpeg(onProgress);
      engine = engine || 'ffmpeg.wasm';
      // ffmpeg builds the whole file before handing it over, so the most we
      // can do for the disk option here is put it where they asked.
      if (sink) {
        onProgress(0.99, 'Saving…');
        await sink.stream.write(blob);
        await sink.stream.close();
        blob = await sink.handle.getFile();
        savedTo = sink.handle.name;
      }
    }

    if (state.outUrl) URL.revokeObjectURL(state.outUrl);
    state.outUrl = URL.createObjectURL(blob);
    outEl.src = state.outUrl;
    downloadEl.href = state.outUrl;
    downloadEl.download = outputName();
    downloadEl.hidden = !!savedTo;   // already on disk; a second copy helps nobody
    const secs = (performance.now() - started) / 1000;
    outinfoEl.textContent =
      (savedTo ? `Saved as ${savedTo} · ` : '') +
      `${fmtTime(keptDuration(state.keep))} · ${fmtSize(blob.size)} · took ${fmtTime(secs)}`;
    engineEl.textContent = engine;

    resultEl.classList.add('on');
    progEl.classList.remove('on');
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    console.error(err);
    progEl.classList.remove('on');
    if (sink) { try { await sink.stream.close(); } catch (_) { /* nothing to save */ } }
    showError('Encoding failed: ' + (err && err.message ? err.message : err) +
      ' — a shorter clip or Draft quality usually gets through.');
  } finally {
    state.busy = false;
    goEl.disabled = false;
  }
}

/* ------------------------------------------------------------- preview */
// Play the source but jump over everything that is going to be removed, so you
// can hear the result before committing to an encode.
function nextKeepAfter(t) {
  for (const [s0] of state.keep) if (s0 > t + 0.01) return s0;
  return null;
}
function inKeep(t) {
  return state.keep.some(([s0, e0]) => t >= s0 - 0.01 && t <= e0 + 0.01);
}

function onPreviewTick() {
  if (!state.preview || !state.keep.length || videoEl.paused) return;
  const t = videoEl.currentTime;
  if (inKeep(t)) return;
  const next = nextKeepAfter(t);
  if (next == null) { videoEl.pause(); videoEl.currentTime = state.keep[0][0]; }
  else videoEl.currentTime = next;
}

function setPreview(on) {
  state.preview = on;
  previewEl.setAttribute('aria-pressed', String(on));
  previewEl.textContent = on ? 'Previewing cuts' : 'Preview cuts';
  if (on) {
    // jump forward to the next surviving section rather than back to the top
    if (!inKeep(videoEl.currentTime)) {
      const next = nextKeepAfter(videoEl.currentTime);
      videoEl.currentTime = next != null ? next : (state.keep.length ? state.keep[0][0] : 0);
    }
    videoEl.play().catch(() => {});
  } else {
    videoEl.pause();
  }
}

/* --------------------------------------------------- captions hook ----
   A future subtitles pass slots in here: run Whisper over the *cut* audio
   (silence already removed, so its timestamps line up with output.mp4),
   write an .srt, then either offer it as a download or mux it back in with
   `-c copy -c:s mov_text`. Nothing above needs to change.
   -------------------------------------------------------------------- */

/* --------------------------------------------------------------- wire */
dropEl.addEventListener('dragover', e => { e.preventDefault(); dropEl.classList.add('over'); });
dropEl.addEventListener('dragleave', () => dropEl.classList.remove('over'));
dropEl.addEventListener('drop', e => {
  e.preventDefault();
  dropEl.classList.remove('over');
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  if (f) handleFile(f);
});
fileEl.addEventListener('change', () => handleFile(fileEl.files && fileEl.files[0]));

['thr', 'min', 'pad'].forEach(key => {
  ctrl[key].addEventListener('input', () => {
    syncControlLabels();
    autoNoteEl.textContent = '';
    recompute();
  });
});

function wireSegmented(group, onPick) {
  group.addEventListener('click', e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    [...group.querySelectorAll('button')].forEach(b =>
      b.setAttribute('aria-pressed', String(b === btn)));
    onPick(btn.dataset.v);
  });
}
wireSegmented(ctrl.level, v => { state.level = v; });
wireSegmented(ctrl.quality, v => { state.quality = v; });

goEl.addEventListener('click', process);
resetEl.addEventListener('click', () => {
  if (state.busy) return;
  if (state.outUrl) URL.revokeObjectURL(state.outUrl);
  Object.assign(state, {
    file: null, pcm: null, frameDb: null, keep: [], duration: 0, outUrl: null
  });
  videoEl.removeAttribute('src');
  outEl.removeAttribute('src');
  workEl.classList.remove('on');
  resultEl.classList.remove('on');
  progEl.classList.remove('on');
  dropEl.style.display = '';
  fileEl.value = '';
  clearError();
});

autoEl.addEventListener('click', () => applyAuto(false));
previewEl.addEventListener('click', () => setPreview(!state.preview));
videoEl.addEventListener('pause', () => { if (state.preview) setPreview(false); });

videoEl.addEventListener('timeupdate', () => { onPreviewTick(); drawWave(); });
waveEl.addEventListener('click', e => {
  if (!state.duration) return;
  const r = waveEl.getBoundingClientRect();
  videoEl.currentTime = ((e.clientX - r.left) / r.width) * state.duration;
});
window.addEventListener('resize', drawWave);

/* ------------------------------------------------- ambient background */
(function background() {
  const bg = document.getElementById('bg-canvas');
  const bx = bg.getContext('2d');
  let w, h, dots = [];
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const accent = themeColour('--accent', '#8a6cf2');
  function size() {
    w = bg.width = window.innerWidth;
    h = bg.height = window.innerHeight;
    dots = Array.from({ length: Math.min(110, Math.floor(w * h / 18000)) }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.1, vy: (Math.random() - 0.5) * 0.1,
      s: Math.random() < 0.8 ? 1 : 2
    }));
  }
  size();
  window.addEventListener('resize', size);
  (function tick() {
    bx.clearRect(0, 0, w, h);
    bx.fillStyle = accent;
    bx.globalAlpha = 0.2;
    for (const d of dots) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0) d.x += w; else if (d.x > w) d.x -= w;
      if (d.y < 0) d.y += h; else if (d.y > h) d.y -= h;
      bx.fillRect(d.x, d.y, d.s, d.s);
    }
    bx.globalAlpha = 1;
    if (!reduce) requestAnimationFrame(tick);
  })();
})();

/* expose the pure analysis for the headless test harness */
window.__cutdown = { findKeep, buildFilterGraph, Analyser, state, HOP_SECONDS };

/* =====================================================================
   FAST PATH — WebCodecs
   ffmpeg.wasm encodes H.264 at roughly 1.5 fps, which makes a long
   recording hopeless (a 2 h 60 fps video would be days). Browsers ship a
   hardware video encoder; driving it directly measured ~646 fps end to
   end on the same clip, so this is the default whenever the input is an
   MP4/MOV the browser can decode. Anything else falls back to ffmpeg.
   Video goes demux -> decode -> drop cut frames -> encode -> mux; the
   audio still goes through ffmpeg, because the levelling filters are the
   measured ones and audio-only ffmpeg is cheap.
   ===================================================================== */

/* ------------------------------------------------------------ disk sink

   The muxer will happily assemble the whole output in memory, which is fine
   for a clip and hopeless for a two-hour recording. Where the browser has the
   File System Access API we instead ask for the save location up front and
   stream the muxed bytes into it, so peak memory stays flat no matter how long
   the video is. Firefox and Safari don't have the API, and fall back to the
   in-memory path.
   ------------------------------------------------------------------------ */

/** MP4-ish container the browser can handle end to end without ffmpeg. */
function fastPathPossible() {
  return webCodecsAvailable() && typeof AudioDecoder !== 'undefined' &&
         /^(mp4|m4v|mov)$/i.test(state.ext);
}

/** ffmpeg only ever sees the source if something actually needs ffmpeg. */
async function ensureFFmpegInput() {
  if (state.ffInput) return;
  await loadFFmpeg(msg => { plabelEl.textContent = msg; });
  await ffmpeg.writeFile('input.' + state.ext, await fetchFile(state.file));
  state.ffInput = true;
}

function diskSaveAvailable() {
  return typeof window.showSaveFilePicker === 'function';
}

/** Show (and pre-tick, for big files) the save-to-disk option. */
function offerDiskSave(file) {
  if (!diskSaveAvailable()) return;
  diskRowEl.hidden = false;
  diskHintEl.hidden = false;
  if (file.size >= DISK_SUGGEST_BYTES) diskEl.checked = true;
}

function outputName() {
  return `${state.file.name.replace(/\.[^.]+$/, '')} (cutdown).mp4`;
}

/** Must be called straight out of the click — the picker needs that gesture. */
async function openDiskSink() {
  const handle = await window.showSaveFilePicker({
    suggestedName: outputName(),
    types: [{ description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } }]
  });
  return { handle, stream: await handle.createWritable() };
}

/** Reopen after a failed attempt; createWritable truncates, so this is clean. */
async function resetDiskSink(sink) {
  try { await sink.stream.close(); } catch (_) { /* already broken */ }
  sink.stream = await sink.handle.createWritable();
}

// Bits per pixel per frame — resolution and frame rate then set the bitrate.
const BPP = { draft: 0.06, normal: 0.10, high: 0.16 };

function webCodecsAvailable() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined' &&
         typeof AudioEncoder !== 'undefined' && typeof window.MP4Box !== 'undefined' &&
         typeof window.Mp4Muxer !== 'undefined';
}

/** How much time has been cut away before each keep-range starts. */
function cumulativeOffsets(keep) {
  const offsets = new Float64Array(keep.length);
  offsets[0] = keep[0][0];
  for (let i = 1; i < keep.length; i++) {
    offsets[i] = offsets[i - 1] + (keep[i][0] - keep[i - 1][1]);
  }
  return offsets;
}

/** Which keep-range covers time t (seconds), or -1. Ranges are sorted. */
function keepIndexAt(keep, t) {
  let lo = 0, hi = keep.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (t < keep[mid][0]) hi = mid - 1;
    else if (t >= keep[mid][1]) lo = mid + 1;
    else return mid;
  }
  return -1;
}

// The decoder wants the codec's own setup payload as `description`: the
// avcC/hvcC box for video, and for AAC the AudioSpecificConfig buried in esds.
function codecDescription(trak) {
  const DS = window.DataStream || window.MP4Box.DataStream;
  for (const entry of trak.mdia.minf.stbl.stsd.entries) {
    const box = entry.avcC || entry.hvcC || entry.vpcC || entry.av1C;
    if (box) {
      const stream = new DS(undefined, 0, DS.BIG_ENDIAN);
      box.write(stream);
      return new Uint8Array(stream.buffer, 8);   // strip the box header
    }
    if (entry.esds) {
      try {
        const asc = entry.esds.esd.descs[0].descs[0].data;
        if (asc && asc.length) return new Uint8Array(asc);
      } catch (_) { /* no decoder-specific info; the decoder may cope without */ }
    }
  }
  return null;
}

/* Streaming demuxer.

   The obvious version reads the whole file into an ArrayBuffer and keeps every
   sample in an array — which is two full copies of a recording that can be
   tens of gigabytes. Instead we feed mp4box the file a slice at a time and
   hand each sample to the decoder as it appears, releasing it straight after.
   mp4box tells us which byte it wants next, so a file with its moov at the end
   (anything not written with faststart) jumps there instead of buffering the
   whole mdat on the way. */

const DEMUX_CHUNK = 8 * 1024 * 1024;

async function openDemuxer(file, kind) {
  kind = kind || 'video';
  const mp4 = window.MP4Box.createFile();
  let info = null, failed = null;
  mp4.onError = e => { failed = new Error('demux: ' + e); };
  mp4.onReady = i => { info = i; };

  // Append until the moov turns up. appendBuffer returns the offset it wants
  // next, which is how a moov-at-the-end file gets found in two reads.
  let next = 0;
  while (info === null && next < file.size) {
    const start = next;
    const buf = await file.slice(start, Math.min(file.size, start + DEMUX_CHUNK)).arrayBuffer();
    buf.fileStart = start;
    const want = mp4.appendBuffer(buf);
    if (failed) throw failed;
    next = (typeof want === 'number' && want > start) ? want : start + DEMUX_CHUNK;
  }
  if (!info) throw new Error('no moov box — not a readable MP4');
  const tracks = kind === 'audio' ? info.audioTracks : info.videoTracks;
  if (!tracks || !tracks.length) throw new Error('no ' + kind + ' track found');

  const track = tracks[0];
  const description = codecDescription(mp4.getTrackById(track.id));

  /** Pull every sample through `onSample`; it may return a promise to push back. */
  async function stream(onSample) {
    let pending = [];
    mp4.onSamples = (id, user, samples) => {
      for (const sample of samples) pending.push(sample);
    };
    mp4.setExtractionOptions(track.id, null, { nbSamples: 200 });
    mp4.start();

    const drain = async () => {
      while (pending.length) {
        const batch = pending;
        pending = [];
        for (const sample of batch) await onSample(sample);
        // Only now: releaseUsedSamples nulls out sample.data, so calling it any
        // earlier hands the decoder an empty chunk.
        mp4.releaseUsedSamples(track.id, batch[batch.length - 1].number);
        for (const sample of batch) sample.data = null;
      }
    };

    // Whatever was already buffered during the search for the moov has
    // produced samples; take those before reading any more of the file.
    await drain();

    let pos = 0;
    while (pos < file.size) {
      const buf = await file.slice(pos, Math.min(file.size, pos + DEMUX_CHUNK)).arrayBuffer();
      buf.fileStart = pos;
      const want = mp4.appendBuffer(buf);
      if (failed) throw failed;
      await drain();
      pos = (typeof want === 'number' && want > pos) ? want : pos + DEMUX_CHUNK;
    }
    mp4.flush();
    await drain();
  }

  return { track, description, stream, total: track.nb_samples };
}

/* ----------------------------------------------------------- audio decode

   The audio track goes through the browser's own decoder, a block at a time,
   exactly like the video. Nothing here holds more than the block in hand, so
   the length of the recording stops mattering.
   ------------------------------------------------------------------------ */

/** Decode the whole audio track, handing each block to `onBlock(chans, n)`. */
async function decodeAudioTrack(file, onBlock, onProgress, onTick) {
  const dm = await openDemuxer(file, 'audio');
  const t = dm.track;
  const channels = t.audio.channel_count;
  const cfg = {
    codec: t.codec,
    sampleRate: t.audio.sample_rate,
    numberOfChannels: channels
  };
  if (dm.description) cfg.description = dm.description;
  const support = await AudioDecoder.isConfigSupported(cfg);
  if (!support.supported) throw new Error('browser cannot decode ' + t.codec);

  let failure = null;
  const dec = new AudioDecoder({
    output: data => {
      try {
        const n = data.numberOfFrames;
        const chans = [];
        for (let c = 0; c < data.numberOfChannels; c++) {
          const a = new Float32Array(n);
          data.copyTo(a, { planeIndex: c, format: 'f32-planar' });
          chans.push(a);
        }
        onBlock(chans, n);
      } catch (err) {
        failure = err;
      } finally {
        data.close();
      }
    },
    error: e => { failure = e; }
  });
  dec.configure(cfg);

  let read = 0;
  await dm.stream(async sample => {
    if (failure) throw failure;
    dec.decode(new EncodedAudioChunk({
      type: sample.is_sync ? 'key' : 'delta',
      timestamp: (sample.cts / sample.timescale) * 1e6,
      duration: (sample.duration / sample.timescale) * 1e6,
      data: sample.data
    }));
    if (dec.decodeQueueSize > 48) {
      await new Promise(r => setTimeout(r, 0));
      while (dec.decodeQueueSize > 24) await new Promise(r => setTimeout(r, 2));
    }
    read++;
    // awaited, so a caller can use this to drain its own encoder queue
    if (onTick && (read & 15) === 0) await onTick();
    if (onProgress && (read & 127) === 0 && dm.total) onProgress(read / dm.total);
  });
  await dec.flush();
  dec.close();
  if (failure) throw failure;
  return { sampleRate: cfg.sampleRate, channels: channels };
}

/** Load-time analysis with no ffmpeg involved at all. */
async function analyseWithWebCodecs(file, onProgress) {
  const probe = await openDemuxer(file, 'audio');
  const rate = probe.track.audio.sample_rate;
  const an = new Analyser(rate);
  const info = await decodeAudioTrack(file, (chans, n) => an.push(chans, n), onProgress);
  const done = an.finish();
  if (!done.samples) throw new Error('the audio track decoded to nothing');
  return {
    frameDb: done.frameDb,
    env: done.env,
    sampleRate: info.sampleRate,
    channels: info.channels,
    duration: done.samples / info.sampleRate
  };
}

/** Cut + level the audio with ffmpeg (audio only, so it's quick) -> AudioBuffer. */
async function buildAudioTrack(keep, levelKey, wantLufs, inName) {
  const parts = [];
  keep.forEach(([s, e], i) => {
    parts.push(`[0:a]atrim=${s.toFixed(3)}:${e.toFixed(3)},asetpts=PTS-STARTPTS[a${i}]`);
  });
  parts.push(`${keep.map((_, i) => `[a${i}]`).join('')}concat=n=${keep.length}:v=0:a=1[araw]`);
  const chain = [];
  if (LEVELS[levelKey]) chain.push(LEVELS[levelKey]);
  if (wantLufs) chain.push(LOUDNORM);
  if (chain.length) parts.push(`[araw]${chain.join(',')}[aout]`);

  await ffmpeg.exec([
    '-i', inName,
    '-filter_complex', parts.join(';'),
    '-map', chain.length ? '[aout]' : '[araw]',
    '-ac', '2', '-ar', '48000', '-c:a', 'pcm_s16le', 'cut.wav'
  ]);
  const wav = await ffmpeg.readFile('cut.wav');
  const actx = new (window.AudioContext || window.webkitAudioContext)();
  const audio = await actx.decodeAudioData(wav.buffer.slice(0));
  actx.close();
  await ffmpeg.deleteFile('cut.wav');
  return audio;
}

/* Cut, level and encode the audio in one streaming pass.

   The keep-ranges are applied in sample space, the levelling is the JS chain
   in cutdown-audio.js, and each block goes straight to the AAC encoder — so
   nothing bigger than a decoded block is ever held. */
/** Encode an already-finished AudioBuffer (the ffmpeg LUFS route). */
async function encodeAudioBuffer(muxer, audio, rate, channels) {
  const aacCfg = { codec: 'mp4a.40.2', sampleRate: rate, numberOfChannels: channels, bitrate: 160000 };
  if (!(await AudioEncoder.isConfigSupported(aacCfg)).supported) throw new Error('no AAC encoder');
  let failure = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: e => { failure = e; }
  });
  enc.configure(aacCfg);

  const FRAME = 1024;
  const chData = [];
  for (let c = 0; c < channels; c++) chData.push(audio.getChannelData(Math.min(c, audio.numberOfChannels - 1)));
  const planar = new Float32Array(FRAME * channels);
  for (let off = 0; off < audio.length; off += FRAME) {
    const n = Math.min(FRAME, audio.length - off);
    for (let c = 0; c < channels; c++) planar.set(chData[c].subarray(off, off + n), c * n);
    enc.encode(new AudioData({
      format: 'f32-planar', sampleRate: rate, numberOfFrames: n,
      numberOfChannels: channels, timestamp: Math.round((off / rate) * 1e6),
      data: planar.subarray(0, n * channels)
    }));
    if (enc.encodeQueueSize > 32) await new Promise(r => setTimeout(r, 0));
  }
  await enc.flush();
  enc.close();
  if (failure) throw failure;
}

async function encodeAudioPass(muxer, keep, levelKey, rate, channels, onProgress) {
  const aacCfg = { codec: 'mp4a.40.2', sampleRate: rate, numberOfChannels: channels, bitrate: 160000 };
  if (!(await AudioEncoder.isConfigSupported(aacCfg)).supported) throw new Error('no AAC encoder');

  let failure = null;
  const enc = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: e => { failure = e; }
  });
  enc.configure(aacCfg);

  const lev = new window.CutdownAudio.Leveller(rate, channels, levelKey);
  let outPos = 0;
  // The decoder hands us blocks from a callback we cannot await inside, so
  // they queue here and go to the encoder from the awaitable tick instead.
  let queued = [];
  const emit = blocks => { for (const b of blocks) if (b[0].length) queued.push(b); };
  const drain = async () => {
    while (queued.length) {
      const batch = queued;
      queued = [];
      for (const b of batch) {
        const n = b[0].length;
        const planar = new Float32Array(n * channels);
        for (let c = 0; c < channels; c++) planar.set(b[c], c * n);
        enc.encode(new AudioData({
          format: 'f32-planar', sampleRate: rate, numberOfFrames: n,
          numberOfChannels: channels, timestamp: Math.round((outPos / rate) * 1e6),
          data: planar
        }));
        outPos += n;
      }
      if (enc.encodeQueueSize > 32) {
        await new Promise(r => setTimeout(r, 0));
        while (enc.encodeQueueSize > 16) await new Promise(r => setTimeout(r, 2));
      }
    }
  };

  // keep-ranges in samples, walked in step with the decoder
  const ranges = keep.map(r => [Math.round(r[0] * rate), Math.round(r[1] * rate)]);
  let first = 0, pos = 0;

  await decodeAudioTrack(state.file, (chans, n) => {
    if (failure) return;
    const p0 = pos, p1 = pos + n;
    pos = p1;
    while (first < ranges.length && ranges[first][1] <= p0) first++;
    for (let k = first; k < ranges.length && ranges[k][0] < p1; k++) {
      const a = Math.max(p0, ranges[k][0]), b = Math.min(p1, ranges[k][1]);
      if (b <= a) continue;
      const slice = [];
      for (let c = 0; c < channels; c++) {
        // a mono source feeds both output channels
        slice.push(chans[Math.min(c, chans.length - 1)].subarray(a - p0, b - p0));
      }
      emit(lev.push(slice, b - a));
    }
  }, onProgress, drain);

  emit(lev.flush());
  await drain();
  await enc.flush();
  enc.close();
  if (failure) throw failure;
  return outPos;
}

async function processFast(onProgress, sink) {
  const keep = state.keep;
  const offsets = cumulativeOffsets(keep);
  const inName = 'input.' + state.ext;

  onProgress(0.02, 'Reading the video…');
  const dm = await openDemuxer(state.file);
  const { track, description } = dm;
  if (!dm.total) throw new Error('no video samples');

  const width = track.video.width, height = track.video.height;
  const fps = track.nb_samples / (track.duration / track.timescale) || 30;
  const bitrate = Math.round(BPP[state.quality] * width * height * Math.min(fps, 60));

  const encCfg = {
    codec: width * height > 1280 * 720 ? 'avc1.4d0033' : 'avc1.4d001f',
    width, height, bitrate, framerate: Math.round(fps), avc: { format: 'avc' }
  };
  if (!(await VideoEncoder.isConfigSupported(encCfg)).supported) {
    throw new Error('no supported H.264 encoder config');
  }
  const decCfg = { codec: track.codec, codedWidth: width, codedHeight: height };
  if (description) decCfg.description = description;
  if (!(await VideoDecoder.isConfigSupported(decCfg)).supported) {
    throw new Error('browser cannot decode ' + track.codec);
  }

  // Matching a LUFS target is the one thing still done by ffmpeg, so ticking
  // it brings the old whole-file-in-memory route back with it.
  const wantLufs = ctrl.lufs.checked;
  let legacyAudio = null;
  if (wantLufs) {
    onProgress(0.05, 'Levelling the audio…');
    await ensureFFmpegInput();
    legacyAudio = await buildAudioTrack(keep, state.level, true, inName);
  }
  const aRate = legacyAudio ? legacyAudio.sampleRate : state.audioRate;
  const aChannels = Math.min(2, legacyAudio ? legacyAudio.numberOfChannels : state.audioChannels);
  if (!aRate || !aChannels) throw new Error('no audio track to work with');

  // Streaming to disk means the moov box lands at the end of the file rather
  // than the front; for a local file that costs nothing, and it is what lets
  // the muxer let go of each sample as soon as it is written.
  const target = sink
    ? new window.Mp4Muxer.FileSystemWritableFileStreamTarget(sink.stream, { chunkSize: 8 * 1024 * 1024 })
    : new window.Mp4Muxer.ArrayBufferTarget();

  const muxer = new window.Mp4Muxer.Muxer({
    target,
    video: { codec: 'avc', width, height },
    audio: { codec: 'aac', sampleRate: aRate, numberOfChannels: aChannels },
    fastStart: sink ? false : 'in-memory',
    firstTimestampBehavior: 'offset'
  });

  // ---- audio ----
  if (!legacyAudio) {
    onProgress(0.05, 'Levelling the audio…');
    await encodeAudioPass(muxer, keep, state.level, aRate, aChannels,
      p => onProgress(0.05 + 0.03 * p, 'Levelling the audio…'));
  }

  // ---- video ----
  let encoded = 0, decoded = 0, lastIdx = -1;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => { encoded++; muxer.addVideoChunk(chunk, meta); },
    error: e => { throw e; }
  });
  encoder.configure(encCfg);

  const decoder = new VideoDecoder({
    output: frame => {
      decoded++;
      const t = frame.timestamp / 1e6;
      const idx = keepIndexAt(keep, t);
      if (idx < 0) { frame.close(); return; }
      const shifted = new VideoFrame(frame, { timestamp: Math.max(0, Math.round((t - offsets[idx]) * 1e6)) });
      frame.close();
      // a keyframe at every splice, so each surviving section starts clean
      encoder.encode(shifted, { keyFrame: idx !== lastIdx });
      lastIdx = idx;
      shifted.close();
    },
    error: e => { throw e; }
  });
  decoder.configure(decCfg);

  const total = dm.total;
  let read = 0;
  await dm.stream(async s => {
    decoder.decode(new EncodedVideoChunk({
      type: s.is_sync ? 'key' : 'delta',
      timestamp: (s.cts / s.timescale) * 1e6,
      duration: (s.duration / s.timescale) * 1e6,
      data: s.data
    }));
    // keep the queues bounded or a long video eats all the memory
    if (decoder.decodeQueueSize > 24 || encoder.encodeQueueSize > 24) {
      await new Promise(r => setTimeout(r, 0));
      while (decoder.decodeQueueSize > 12 || encoder.encodeQueueSize > 12) {
        await new Promise(r => setTimeout(r, 4));
      }
    }
    if ((read & 63) === 0) onProgress(0.08 + 0.82 * (read / total), 'Cutting video…');
    read++;
  });
  await decoder.flush();
  await encoder.flush();
  decoder.close();
  encoder.close();

  // The LUFS route produced a finished AudioBuffer rather than streaming, so
  // it is encoded here at the end instead.
  if (legacyAudio) {
    onProgress(0.92, 'Encoding audio…');
    await encodeAudioBuffer(muxer, legacyAudio, aRate, aChannels);
  }

  muxer.finalize();

  if (sink) {
    onProgress(0.99, 'Finishing the file…');
    await sink.stream.close();
    // getFile() hands back a disk-backed File, so playing it back afterwards
    // doesn't pull the whole thing into memory again.
    return { blob: await sink.handle.getFile(), savedTo: sink.handle.name, stats: { decoded, encoded, fps } };
  }

  onProgress(1, 'Done');
  return {
    blob: new Blob([muxer.target.buffer], { type: 'video/mp4' }),
    stats: { decoded, encoded, fps }
  };
}
