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
const MAX_SEGMENTS = 400;
const MIN_CLIP = 0.12;     // seconds; drop keep-ranges shorter than this
const HOP_SECONDS = 0.02;  // analysis window

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
  pcm: null,          // Float32Array, mono
  waveGain: 1,        // display-only scale so quiet recordings still show up
  sampleRate: 0,
  frameDb: null,      // Float32Array of per-hop dBFS
  keep: [],           // [[start,end], ...] seconds
  level: 'even',
  quality: 'normal',
  busy: false,
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
// Per-hop RMS in dBFS. Done once per file; the sliders only re-run findKeep().
function computeFrameDb(pcm, sampleRate) {
  const hop = Math.max(1, Math.round(sampleRate * HOP_SECONDS));
  const n = Math.floor(pcm.length / hop);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const start = i * hop;
    for (let j = 0; j < hop; j++) { const v = pcm[start + j]; sum += v * v; }
    const rms = Math.sqrt(sum / hop);
    out[i] = rms > 1e-7 ? 20 * Math.log10(rms) : -120;
  }
  return out;
}

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

function keptDuration(keep) {
  return keep.reduce((a, r) => a + (r[1] - r[0]), 0);
}

/* ------------------------------------------------------------ waveform */
// Absolute level says nothing useful here — a quietly recorded take would draw
// as a flat line. Scale the display so the loudest peak fills the panel.
function waveGainFor(pcm) {
  let peak = 0;
  const step = Math.max(1, Math.floor(pcm.length / 200000));
  for (let i = 0; i < pcm.length; i += step) {
    const v = Math.abs(pcm[i]);
    if (v > peak) peak = v;
  }
  return peak > 0.001 ? 1 / peak : 1;
}

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

  if (!state.pcm || !state.duration) return;
  const pcm = state.pcm;
  const mid = h / 2;
  const perPx = pcm.length / w;

  // cut regions get a dim wash so the kept parts read as the signal
  const inKeep = new Uint8Array(w);
  for (const [s, e] of state.keep) {
    const a = Math.max(0, Math.floor(s / state.duration * w));
    const b = Math.min(w, Math.ceil(e / state.duration * w));
    for (let x = a; x < b; x++) inKeep[x] = 1;
  }

  for (let x = 0; x < w; x++) {
    const start = Math.floor(x * perPx);
    const end = Math.min(pcm.length, Math.floor((x + 1) * perPx));
    let peak = 0;
    for (let i = start; i < end; i++) { const v = Math.abs(pcm[i]); if (v > peak) peak = v; }
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

function recompute() {
  if (!state.frameDb) return;
  const thr = parseFloat(ctrl.thr.value);
  const min = parseFloat(ctrl.min.value);
  const pad = parseFloat(ctrl.pad.value);
  state.keep = findKeep(state.frameDb, thr, min, pad, state.duration);
  renderStats();
  drawWave();

  if (state.keep.length > MAX_SEGMENTS) {
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
  const dot = file.name.lastIndexOf('.');
  state.ext = dot > -1 ? file.name.slice(dot + 1).toLowerCase() : 'mp4';
  filenameEl.textContent = `${file.name} · ${fmtSize(file.size)}`;

  videoEl.src = URL.createObjectURL(file);
  workEl.classList.add('on');
  dropEl.style.display = 'none';

  goEl.disabled = true;
  progEl.classList.add('on');
  barEl.style.width = '0%';

  try {
    plabelEl.textContent = 'Loading the video engine…';
    await loadFFmpeg(msg => { plabelEl.textContent = msg; });

    plabelEl.textContent = 'Reading the audio…';
    barEl.style.width = '35%';
    const inName = 'input.' + state.ext;
    await ffmpeg.writeFile(inName, await fetchFile(file));

    // 16 kHz mono is plenty for level analysis and keeps this pass quick.
    await ffmpeg.exec(['-i', inName, '-vn', '-ac', '1', '-ar', '16000', '-f', 'wav', 'probe.wav']);
    const wav = await ffmpeg.readFile('probe.wav');

    plabelEl.textContent = 'Analysing…';
    barEl.style.width = '75%';
    const AC = window.AudioContext || window.webkitAudioContext;
    const actx = new AC();
    // slice() because decodeAudioData detaches the buffer it is handed
    const audio = await actx.decodeAudioData(wav.buffer.slice(0));
    actx.close();

    state.pcm = audio.getChannelData(0);
    state.sampleRate = audio.sampleRate;
    state.duration = audio.duration;
    state.frameDb = computeFrameDb(state.pcm, state.sampleRate);
    state.waveGain = waveGainFor(state.pcm);

    await ffmpeg.deleteFile('probe.wav');

    barEl.style.width = '100%';
    progEl.classList.remove('on');
    recompute();
  } catch (err) {
    progEl.classList.remove('on');
    console.error(err);
    showError('Could not read that file: ' + (err && err.message ? err.message : err) +
      ' — try an MP4 or MOV.');
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

async function process() {
  if (state.busy || !state.file || !state.keep.length) return;
  state.busy = true;
  goEl.disabled = true;
  clearError();
  resultEl.classList.remove('on');
  progEl.classList.add('on');
  barEl.style.width = '0%';

  const targetOut = keptDuration(state.keep);
  plabelEl.textContent = 'Cutting and encoding…';

  const onProgress = ({ progress }) => {
    // progress is a fraction of the expected output duration; it can overshoot
    // slightly on filter graphs, so clamp it.
    const p = Math.max(0, Math.min(1, progress || 0));
    barEl.style.width = (p * 100).toFixed(1) + '%';
    plabelEl.textContent = `Cutting and encoding… ${Math.round(p * 100)}%`;
  };
  ffmpeg.on('progress', onProgress);

  try {
    const { graph, audioLabel } = buildFilterGraph(state.keep, state.level, ctrl.lufs.checked);
    const q = QUALITY[state.quality];
    const inName = 'input.' + state.ext;

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
    if (state.outUrl) URL.revokeObjectURL(state.outUrl);
    state.outUrl = URL.createObjectURL(blob);

    outEl.src = state.outUrl;
    downloadEl.href = state.outUrl;
    const base = state.file.name.replace(/\.[^.]+$/, '');
    downloadEl.download = `${base} (cutdown).mp4`;
    outinfoEl.textContent = `${fmtTime(targetOut)} · ${fmtSize(blob.size)}`;

    await ffmpeg.deleteFile('output.mp4');
    resultEl.classList.add('on');
    progEl.classList.remove('on');
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (err) {
    console.error(err);
    progEl.classList.remove('on');
    showError('Encoding failed: ' + (err && err.message ? err.message : err) +
      ' — a shorter clip or Draft quality usually gets through.');
  } finally {
    ffmpeg.off && ffmpeg.off('progress', onProgress);
    state.busy = false;
    goEl.disabled = false;
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

[['thr', v => `${v} dB`], ['min', v => `${(+v).toFixed(2)} s`], ['pad', v => `${(+v).toFixed(2)} s`]]
  .forEach(([key, fmt]) => {
    ctrl[key].addEventListener('input', () => {
      ctrl[key + 'V'].textContent = fmt(ctrl[key].value).replace('-', '−');
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

videoEl.addEventListener('timeupdate', drawWave);
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
window.__cutdown = { findKeep, computeFrameDb, buildFilterGraph, state, HOP_SECONDS };
