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

  function Leveller(sampleRate, channels, levelKey) {
    const cfg = PRESETS[levelKey] || null;
    this.channels = channels;
    this.limiter = new Limiter(sampleRate, channels, LIMIT);
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
      const g = this.lastGain + (gain - this.lastGain) * ((i + 1) / f.len);
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
      for (let c = 0; c < this.channels; c++) copy.push(chans[c].subarray(0, count));
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

  const api = { Leveller: Leveller, Limiter: Limiter, PRESETS: PRESETS, LIMIT: LIMIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CutdownAudio = api;
})(typeof self !== 'undefined' ? self : this);

/* Measured against the ffmpeg chain it replaces, on a 20 s fixture whose loud
   and quiet halves sit 24.3 dB apart (see the test rig in the commit that
   added this). Targets, spread between loud and quiet after levelling:

     source   24.3 dB
     gentle   13.0 dB   ffmpeg      peak -1.0 dBFS
     even      5.8 dB   ffmpeg      peak -1.0 dBFS
     hard      2.5 dB   ffmpeg      peak -1.0 dBFS
*/
