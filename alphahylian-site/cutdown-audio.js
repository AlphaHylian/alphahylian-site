/* Cutdown — audio levelling, in plain JS.

   This used to be three ffmpeg filters (speechnorm -> dynaudnorm -> alimiter),
   which meant handing ffmpeg.wasm a copy of the entire source file just to do
   the audio. That copy is what put a ceiling on how long a recording could be,
   so the chain lives here instead: it streams, it holds nothing but its own
   lookahead, and it drops a 32 MB wasm download off the common path.

   The shape is the same as the filters it replaces:

     1. Split into frames and work out, per frame, the gain that would bring it
        up to the target peak — capped, so a silent frame doesn't get 60 dB of
        room tone.
     2. Smooth those gains with a gaussian window, which is what stops the
        level pumping between syllables, and interpolate per sample.
     3. Catch whatever still pokes above -1 dBFS with a lookahead limiter.

   There is also a BS.1770 loudness meter here, which is what the "-16 LUFS"
   option measures itself against — it replaced ffmpeg's loudnorm for the same
   reason as the rest.

   Tuned against the ffmpeg chain on a 24.3 dB-spread fixture; the numbers it
   has to hit are in the table at the bottom of this file.
   ------------------------------------------------------------------------ */
(function (root) {
  'use strict';

  // -1.0 dBFS. Leaves the encoder somewhere to put its overshoot.
  const LIMIT = 0.891;

  const PRESETS = {
    off:    null,
    gentle: { frameMs: 200, smooth: 9, maxGainDb: 15.7, targetPeak: 0.9 },
    even:   { frameMs: 150, smooth: 7, maxGainDb: 23.1, targetPeak: 0.9 },
    hard:   { frameMs: 100, smooth: 5, maxGainDb: 27.8, targetPeak: 0.95 }
  };

  /** Gaussian weights over `n` frames, ±3σ across the window. */
  function gaussianKernel(n) {
    const k = new Float64Array(n);
    const sigma = n / 6 || 1;
    const c = (n - 1) / 2;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      k[i] = Math.exp(-((i - c) * (i - c)) / (2 * sigma * sigma));
      sum += k[i];
    }
    for (let i = 0; i < n; i++) k[i] /= sum;
    return k;
  }

  /* ------------------------------------------------------------- limiter

     Lookahead means the gain is already down by the time the peak arrives, so
     nothing clips and there is no click from a late reaction. The minimum over
     the lookahead window comes from a monotonic deque, which is O(1) a sample
     rather than O(window).
     --------------------------------------------------------------------- */
  function Limiter(sampleRate, channels, limit) {
    this.limit = limit;
    this.channels = channels;
    this.look = Math.max(1, Math.round(0.005 * sampleRate));   // 5 ms
    this.release = Math.exp(-1 / (0.05 * sampleRate));         // 50 ms
    this.gain = 1;
    // delay line, one ring per channel, so a sample leaves `look` samples late
    this.ring = [];
    for (let c = 0; c < channels; c++) this.ring.push(new Float32Array(this.look));
    this.pos = 0;
    this.filled = 0;
    // deque of {i, g} with strictly increasing g; the front is the window min
    this.dq = [];
    this.head = 0;
    this.n = 0;
  }

  /** Push `count` samples; returns the (delayed) samples now ready, or null. */
  Limiter.prototype.process = function (chans, count) {
    const out = [];
    for (let c = 0; c < this.channels; c++) out.push(new Float32Array(count));
    let produced = 0;

    for (let i = 0; i < count; i++) {
      let peak = 0;
      for (let c = 0; c < this.channels; c++) {
        const v = Math.abs(chans[c][i]);
        if (v > peak) peak = v;
      }
      const want = peak > this.limit ? this.limit / peak : 1;

      // monotonic deque: drop anything this sample undercuts
      while (this.dq.length > this.head && this.dq[this.dq.length - 1].g >= want) this.dq.pop();
      this.dq.push({ i: this.n, g: want });
      // and anything that has fallen out of the lookahead window
      while (this.dq[this.head].i <= this.n - this.look) this.head++;
      if (this.head > 64) { this.dq = this.dq.slice(this.head); this.head = 0; }

      // the sample leaving the delay line is `look - 1` behind this one
      const leaving = this.pos;
      let ready = null;
      if (this.filled >= this.look) {
        ready = [];
        for (let c = 0; c < this.channels; c++) ready.push(this.ring[c][leaving]);
      } else {
        this.filled++;
      }
      for (let c = 0; c < this.channels; c++) this.ring[c][leaving] = chans[c][i];
      this.pos = (this.pos + 1) % this.look;
      this.n++;

      if (ready) {
        const target = this.dq[this.head].g;
        // down instantly (the lookahead has already bought us the time), back
        // up slowly, or every transient audibly ducks the words after it
        this.gain = target < this.gain
          ? target
          : target + (this.gain - target) * this.release;
        for (let c = 0; c < this.channels; c++) out[c][produced] = ready[c] * this.gain;
        produced++;
      }
    }
    if (!produced) return null;
    if (produced < count) for (let c = 0; c < this.channels; c++) out[c] = out[c].subarray(0, produced);
    return out;
  };

  /** Drain the delay line so the output is the same length as the input. */
  Limiter.prototype.flush = function () {
    const silence = [];
    for (let c = 0; c < this.channels; c++) silence.push(new Float32Array(this.look));
    return this.process(silence, this.look);
  };

  /* ----------------------------------------------------------- leveller */

  /* opts.preGain is applied before the limiter, never after — otherwise a
     loudness correction would push straight back through the ceiling the
     limiter exists to hold. opts.limit overrides the -1 dBFS default. */
  function Leveller(sampleRate, channels, levelKey, opts) {
    const cfg = PRESETS[levelKey] || null;
    opts = opts || {};
    this.channels = channels;
    this.preGain = opts.preGain === undefined ? 1 : opts.preGain;
    this.limiter = new Limiter(sampleRate, channels, opts.limit === undefined ? LIMIT : opts.limit);
    this.cfg = cfg;
    if (!cfg) return;

    this.F = Math.max(1, Math.round(cfg.frameMs * sampleRate / 1000));
    this.kernel = gaussianKernel(cfg.smooth);
    this.half = cfg.smooth >> 1;
    this.maxGain = Math.pow(10, cfg.maxGainDb / 20);
    this.target = cfg.targetPeak;

    this.frames = [];      // { data: Float32Array[channels], len, gain }
    this.emit = 0;         // index in `frames` of the next frame to send on
    this.building = null;
    this.builtLen = 0;
    this.lastGain = null;  // carried across frames so the ramp is continuous
  }

  Leveller.prototype._newFrame = function () {
    const data = [];
    for (let c = 0; c < this.channels; c++) data.push(new Float32Array(this.F));
    return { data: data, len: 0, gain: 1 };
  };

  Leveller.prototype._closeFrame = function () {
    const f = this.building;
    let peak = 0;
    for (let c = 0; c < this.channels; c++) {
      const d = f.data[c];
      for (let i = 0; i < f.len; i++) {
        const v = Math.abs(d[i]);
        if (v > peak) peak = v;
      }
    }
    // A frame with nothing in it gets no gain at all — pushing silence up to
    // the target is how you turn room tone into a roar.
    f.gain = peak > 1e-5 ? Math.min(this.maxGain, this.target / peak) : 1;
    this.frames.push(f);
    this.building = null;
    this.builtLen = 0;
  };

  /** Smoothed gain for frames[i], with the window clipped at the edges. */
  Leveller.prototype._smoothGain = function (i) {
    let sum = 0, weight = 0;
    for (let k = 0; k < this.kernel.length; k++) {
      const j = i + k - this.half;
      if (j < 0 || j >= this.frames.length) continue;
      sum += this.kernel[k] * this.frames[j].gain;
      weight += this.kernel[k];
    }
    return weight > 0 ? sum / weight : 1;
  };

  Leveller.prototype._sendFrame = function (f, gain, out) {
    if (this.lastGain === null) this.lastGain = gain;
    const chans = [];
    for (let c = 0; c < this.channels; c++) chans.push(new Float32Array(f.len));
    for (let i = 0; i < f.len; i++) {
      // ramp across the frame rather than stepping, or every frame edge clicks
      const g = (this.lastGain + (gain - this.lastGain) * ((i + 1) / f.len)) * this.preGain;
      for (let c = 0; c < this.channels; c++) chans[c][i] = f.data[c][i] * g;
    }
    this.lastGain = gain;
    const done = this.limiter.process(chans, f.len);
    if (done) out.push(done);
  };

  /** Feed `count` samples; returns an array of ready [ch]Float32Array blocks. */
  Leveller.prototype.push = function (chans, count) {
    const out = [];
    if (!this.cfg) {
      // Levelling off still goes through the limiter — the cut itself can push
      // a join over full scale, and that is what clips on export.
      const copy = [];
      for (let c = 0; c < this.channels; c++) {
        if (this.preGain === 1) { copy.push(chans[c].subarray(0, count)); continue; }
        const a = new Float32Array(count);
        for (let i = 0; i < count; i++) a[i] = chans[c][i] * this.preGain;
        copy.push(a);
      }
      const done = this.limiter.process(copy, count);
      if (done) out.push(done);
      return out;
    }

    let off = 0;
    while (off < count) {
      if (!this.building) this.building = this._newFrame();
      const take = Math.min(this.F - this.builtLen, count - off);
      for (let c = 0; c < this.channels; c++) {
        this.building.data[c].set(chans[c].subarray(off, off + take), this.builtLen);
      }
      this.builtLen += take;
      this.building.len = this.builtLen;
      off += take;
      if (this.builtLen === this.F) this._closeFrame();
    }

    // A frame can only be sent once the half-window after it exists.
    while (this.frames.length - this.emit > this.half) {
      this._sendFrame(this.frames[this.emit], this._smoothGain(this.emit), out);
      this.emit++;
      if (this.emit > this.half) { this.frames.shift(); this.emit--; }
    }
    return out;
  };

  /** No more input: send everything still held, then drain the limiter. */
  Leveller.prototype.flush = function () {
    const out = [];
    if (this.cfg) {
      if (this.building && this.builtLen > 0) this._closeFrame();
      while (this.emit < this.frames.length) {
        this._sendFrame(this.frames[this.emit], this._smoothGain(this.emit), out);
        this.emit++;
      }
      this.frames.length = 0;
    }
    const tail = this.limiter.flush();
    if (tail) out.push(tail);
    return out;
  };

  /* ------------------------------------------------------ resampling

     Whisper wants 16 kHz mono. Low-pass below the new Nyquist first or every
     frequency above 8 kHz folds back down as noise, which a speech model
     hears as a much worse recording than it is.
     ------------------------------------------------------------------- */

  function Resampler(fromRate, toRate) {
    this.step = fromRate / toRate;
    this.pos = 0;                 // fractional read position in the input
    this.prev = 0;                // last sample of the previous block
    this.have = false;
    // two cascaded low passes at 7 kHz: gentle enough not to dull speech,
    // steep enough that what folds back is negligible
    this.a = new Biquad(makeBiquad('lp', Math.min(7000, toRate * 0.44), fromRate, 0.707));
    this.b = new Biquad(makeBiquad('lp', Math.min(7000, toRate * 0.44), fromRate, 0.707));
    this.out = [];
  }

  /** Returns the resampled samples for this block as a Float32Array. */
  Resampler.prototype.push = function (mono, count) {
    const res = [];
    for (let i = 0; i < count; i++) {
      const v = this.b.run(this.a.run(mono[i]));
      // emit every output sample whose position falls in [i-1, i]
      while (this.have && this.pos <= i) {
        const frac = this.pos - (i - 1);
        res.push(this.prev + (v - this.prev) * frac);
        this.pos += this.step;
      }
      this.prev = v;
      this.have = true;
    }
    this.pos -= count;            // rebase for the next block
    return Float32Array.from(res);
  };

  /* --------------------------------------------------- speech detection

     Loudness alone cannot tell talking from a door slamming, and the whole
     point of the tool is to keep the talking. These are the cheap per-hop
     features that actually separate the two, measured on a fixture of
     synthesised speech cut with keyboard clatter, a low explosion and game
     music (all of it louder than the speech):

                     speech   keyboard  explosion  music
       band 300-3400   0.55     0.38      0.21      0.74   of total energy
       low  <250 Hz    0.66     0.09      0.97      0.57
       zero crossings  0.050    0.326     0.004     0.015
       level movement 11.3      41.6      5.4       1.5    dB over ~0.4 s

     Every one of those confusions is broken by a different feature, so the
     score is the weakest of four soft tests rather than a sum: a clatter is
     rejected on zero crossings, a rumble on its low end, steady music on the
     fact that it does not move the way syllables do.
     ------------------------------------------------------------------- */

  /** RBJ cookbook low/high pass, as plain coefficients for Biquad. */
  function makeBiquad(type, f0, rate, Q) {
    const w = 2 * Math.PI * f0 / rate, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * Q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; }
    else { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; }
    const a0 = 1 + al;
    return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * cw / a0, a2: (1 - al) / a0 };
  }

  /** 1 inside [lo,hi], falling to 0 over `soft` beyond it. */
  function softBand(v, lo, hi, soft) {
    if (v >= lo && v <= hi) return 1;
    const d = v < lo ? lo - v : v - hi;
    return d >= soft ? 0 : 1 - d / soft;
  }

  function SpeechFeatures(sampleRate, hop) {
    this.hop = hop;
    this.hp = new Biquad(makeBiquad('hp', 300, sampleRate, 0.707));
    this.lp = new Biquad(makeBiquad('lp', 3400, sampleRate, 0.707));
    this.low = new Biquad(makeBiquad('lp', 250, sampleRate, 0.707));
    this.sum = 0; this.sumBand = 0; this.sumLow = 0; this.cross = 0; this.n = 0;
    this.prev = 0;
    this.bandR = []; this.lowR = []; this.zcr = [];
  }

  SpeechFeatures.prototype._close = function () {
    const rms = Math.sqrt(this.sum / this.n);
    if (rms > 1e-6) {
      this.bandR.push(Math.sqrt(this.sumBand / this.n) / rms);
      this.lowR.push(Math.sqrt(this.sumLow / this.n) / rms);
    } else {
      this.bandR.push(0); this.lowR.push(0);
    }
    this.zcr.push(this.cross / this.n);
    this.sum = 0; this.sumBand = 0; this.sumLow = 0; this.cross = 0; this.n = 0;
  };

  /** Feed a block of mono samples. */
  SpeechFeatures.prototype.push = function (mono, count) {
    for (let i = 0; i < count; i++) {
      const v = mono[i];
      const b = this.lp.run(this.hp.run(v));
      const l = this.low.run(v);
      this.sum += v * v;
      this.sumBand += b * b;
      this.sumLow += l * l;
      if ((v < 0) !== (this.prev < 0)) this.cross++;
      this.prev = v;
      if (++this.n === this.hop) this._close();
    }
  };

  SpeechFeatures.prototype.finish = function () {
    if (this.n > 0) this._close();
    return { bandR: this.bandR, lowR: this.lowR, zcr: this.zcr };
  };

  /* How much the level moves around each hop — the syllable rhythm that
     separates someone talking from a sustained noise. */
  function levelMovement(frameDb, halfWindow) {
    const n = frameDb.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - halfWindow), b = Math.min(n, i + halfWindow + 1);
      let mean = 0;
      for (let k = a; k < b; k++) mean += frameDb[k];
      mean /= (b - a);
      let v = 0;
      for (let k = a; k < b; k++) { const d = frameDb[k] - mean; v += d * d; }
      out[i] = Math.sqrt(v / (b - a));
    }
    return out;
  }

  /** Per-hop 0..1 likelihood that this is someone talking. */
  function speechScores(frameDb, feat) {
    const n = frameDb.length;
    const mov = levelMovement(frameDb, 10);          // +/- 0.2 s
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      raw[i] = Math.min(
        softBand(feat.bandR[i], 0.35, 1.0, 0.15),
        softBand(feat.lowR[i], 0.0, 0.85, 0.10),
        softBand(feat.zcr[i], 0.010, 0.20, 0.06),
        softBand(mov[i], 4.0, 1e9, 3.0)
      );
    }
    // Speech arrives in runs, so smooth over ~a quarter second: one awkward
    // hop in the middle of a word should not punch a hole in it.
    const S = 6, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - S), b = Math.min(n, i + S + 1);
      let m = 0;
      for (let k = a; k < b; k++) m += raw[k];
      out[i] = m / (b - a);
    }
    return out;
  }

  /* ------------------------------------------------------- loudness

     Integrated loudness to ITU-R BS.1770 / EBU R128, which is what "-16 LUFS"
     means and what ffmpeg's loudnorm was doing here before. Two filters (a
     high shelf and a high pass, together the "K" weighting), mean square over
     400 ms blocks overlapping by 75%, then the two-stage gate: drop anything
     below -70 LUFS outright, then drop anything more than 10 LU below the
     average of what is left.

     Coefficients are derived from the analog prototype rather than hardcoded
     for 48 kHz, so 44.1 kHz sources measure correctly too.
     ------------------------------------------------------------------- */

  function kWeightingCoefficients(rate) {
    // stage 1: high shelf, +4 dB at high frequency
    const f0 = 1681.974450955533;
    const G = 3.999843853973347;
    const Q = 0.7071752369554196;
    const K = Math.tan(Math.PI * f0 / rate);
    const vh = Math.pow(10, G / 20);
    const vb = Math.pow(vh, 0.4996667741545416);
    const a0 = 1 + K / Q + K * K;
    const s1 = {
      b0: (vh + vb * K / Q + K * K) / a0,
      b1: 2 * (K * K - vh) / a0,
      b2: (vh - vb * K / Q + K * K) / a0,
      a1: 2 * (K * K - 1) / a0,
      a2: (1 - K / Q + K * K) / a0
    };
    // stage 2: high pass at ~38 Hz
    const f0b = 38.13547087602444;
    const Qb = 0.5003270373238773;
    const Kb = Math.tan(Math.PI * f0b / rate);
    const den = 1 + Kb / Qb + Kb * Kb;
    const s2 = {
      b0: 1, b1: -2, b2: 1,
      a1: 2 * (Kb * Kb - 1) / den,
      a2: (1 - Kb / Qb + Kb * Kb) / den
    };
    return [s1, s2];
  }

  function Biquad(c) { this.c = c; this.x1 = 0; this.x2 = 0; this.y1 = 0; this.y2 = 0; }
  Biquad.prototype.run = function (x) {
    const c = this.c;
    const y = c.b0 * x + c.b1 * this.x1 + c.b2 * this.x2 - c.a1 * this.y1 - c.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x;
    this.y2 = this.y1; this.y1 = y;
    return y;
  };

  function LoudnessMeter(sampleRate, channels) {
    this.channels = channels;
    this.blockSize = Math.round(sampleRate * 0.4);      // 400 ms
    this.step = Math.round(sampleRate * 0.1);           // 75% overlap
    this.filters = [];
    for (let c = 0; c < channels; c++) {
      const co = kWeightingCoefficients(sampleRate);
      this.filters.push([new Biquad(co[0]), new Biquad(co[1])]);
    }
    // running sum of squares per channel over the current block
    this.ring = [];
    for (let c = 0; c < channels; c++) this.ring.push(new Float32Array(this.blockSize));
    this.pos = 0;
    this.filled = 0;
    this.sinceBlock = 0;
    this.blocks = [];      // mean-square sum per block, already channel-weighted
  }

  LoudnessMeter.prototype._closeBlock = function () {
    let z = 0;
    for (let c = 0; c < this.channels; c++) {
      const r = this.ring[c];
      let sum = 0;
      for (let i = 0; i < this.blockSize; i++) sum += r[i] * r[i];
      z += sum / this.blockSize;   // G is 1.0 for left/right and mono
    }
    this.blocks.push(z);
  };

  LoudnessMeter.prototype.push = function (chans, count) {
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < this.channels; c++) {
        const f = this.filters[c];
        this.ring[c][this.pos] = f[1].run(f[0].run(chans[c][i]));
      }
      this.pos = (this.pos + 1) % this.blockSize;
      if (this.filled < this.blockSize) this.filled++;
      if (++this.sinceBlock >= this.step && this.filled >= this.blockSize) {
        this.sinceBlock = 0;
        this._closeBlock();
      }
    }
  };

  /** Integrated loudness in LUFS, or null if there was nothing above the gate. */
  LoudnessMeter.prototype.integrated = function () {
    const loud = z => -0.691 + 10 * Math.log10(z);
    // absolute gate at -70 LUFS
    const kept = this.blocks.filter(z => z > 0 && loud(z) > -70);
    if (!kept.length) return null;
    let mean = 0;
    for (const z of kept) mean += z;
    mean /= kept.length;
    // relative gate, 10 LU below the ungated average
    const threshold = loud(mean) - 10;
    const kept2 = kept.filter(z => loud(z) > threshold);
    if (!kept2.length) return null;
    let mean2 = 0;
    for (const z of kept2) mean2 += z;
    mean2 /= kept2.length;
    return loud(mean2);
  };

  const api = { Leveller: Leveller, Limiter: Limiter, LoudnessMeter: LoudnessMeter,
                SpeechFeatures: SpeechFeatures, speechScores: speechScores,
                Resampler: Resampler,
                PRESETS: PRESETS, LIMIT: LIMIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CutdownAudio = api;
})(typeof self !== 'undefined' ? self : this);

/* Measured against the ffmpeg chain it replaces, on a 20 s fixture whose loud
   and quiet halves sit 24.3 dB apart (see the test rig in the commit that
   added this). Targets, spread between loud and quiet after levelling:

              ffmpeg    here
     source   24.3 dB   24.3 dB
     gentle   13.0 dB   13.2 dB
     even      5.8 dB    5.9 dB
     hard      2.5 dB    1.3 dB     all peaking at -1.0 dBFS

   The loudness meter was checked the same way, against ffmpeg's own ebur128
   on four signals at both 48 and 44.1 kHz: agreement within 0.04 LU, which is
   inside the one decimal place ffmpeg prints.
*/
