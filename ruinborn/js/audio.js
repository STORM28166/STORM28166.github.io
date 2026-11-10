// Fully synthesized audio: dark ambient drones, wind, gunfire, growls.
export class Sound {
  constructor() { this.ctx = null; this.vol = 0.7; }
  init() {
    if (this.ctx) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC(); this.master = ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(ctx.destination);
    const n = ctx.sampleRate * 2, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.noise = buf;
    // drone pad
    this.pad = ctx.createGain(); this.pad.gain.value = 0.07; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.Q.value = 3;
    [41.2, 41.6, 61.7, 82.1].forEach((f, i) => { const o = ctx.createOscillator(); o.type = i % 2 ? 'sawtooth' : 'triangle'; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = i > 1 ? 0.35 : 0.6; o.connect(g); g.connect(lp); o.start(); });
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05; const lg = ctx.createGain(); lg.gain.value = 140; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    lp.connect(this.pad); this.pad.connect(this.master);
    // wind
    const ws = ctx.createBufferSource(); ws.buffer = buf; ws.loop = true; const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8;
    this.wind = ctx.createGain(); this.wind.gain.value = 0.05; ws.connect(bp); bp.connect(this.wind); this.wind.connect(this.master); ws.start();
    const wl = ctx.createOscillator(); wl.frequency.value = 0.08; const wg = ctx.createGain(); wg.gain.value = 300; wl.connect(wg); wg.connect(bp.frequency); wl.start();
    // breathing channel
    this.breathG = ctx.createGain(); this.breathG.gain.value = 0; const bs = ctx.createBufferSource(); bs.buffer = buf; bs.loop = true; const bf = ctx.createBiquadFilter(); bf.type = 'bandpass'; bf.frequency.value = 900; bf.Q.value = 1.2;
    bs.connect(bf); bf.connect(this.breathG); this.breathG.connect(this.master); bs.start();
  }
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.value = v; }
  _env(node, t, a, peak, dec) { node.gain.setValueAtTime(0.0001, t); node.gain.exponentialRampToValueAtTime(peak, t + a); node.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
  _noise(dur, freq, type, peak, q = 1) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); this._env(g, t, 0.003, peak, dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.1);
  }
  _tone(type, f0, f1, dur, peak, delay = 0) {
    if (!this.ctx) return; const ctx = this.ctx, t = ctx.currentTime + delay, o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain(); this._env(g, t, 0.005, peak, dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.1);
  }
  shot() { this._noise(0.18, 1800, 'lowpass', 0.5); this._tone('sine', 120, 40, 0.15, 0.5); }
  droneShot(laser) { this._tone('square', laser ? 2200 : 1400, laser ? 900 : 500, 0.07, 0.05); }
  turret() { this._noise(0.1, 2500, 'bandpass', 0.18, 2); }
  hit() { this._tone('triangle', 900, 600, 0.05, 0.12); }
  pickup() { this._tone('sine', 600, 1200, 0.12, 0.12); this._tone('sine', 900, 1800, 0.12, 0.08, 0.08); }
  reload() { this._noise(0.05, 3000, 'highpass', 0.15); this._noise(0.06, 2000, 'bandpass', 0.2, 3); }
  click() { this._tone('square', 300, 200, 0.03, 0.05); }
  growl(p = 1) { if (!this.ctx) return; this._tone('sawtooth', 90 * p, 45 * p, 0.7, 0.12); this._noise(0.6, 300 * p, 'bandpass', 0.15, 4); }
  shriek() { this._tone('sawtooth', 1400, 500, 0.5, 0.06); this._tone('sine', 1900, 700, 0.6, 0.05); }
  burst() { this._noise(0.5, 400, 'lowpass', 0.4); this._tone('sine', 80, 30, 0.4, 0.3); }
  hurt() { this._tone('sine', 200, 90, 0.2, 0.25); this._noise(0.1, 600, 'lowpass', 0.2); }
  build() { this._noise(0.15, 900, 'bandpass', 0.35, 2); this._tone('square', 140, 90, 0.12, 0.1); }
  horn() { this._tone('sawtooth', 70, 62, 2.5, 0.2); this._tone('sawtooth', 105, 93, 2.5, 0.1); }
  tame() { [0, 0.12, 0.24].forEach((d, i) => this._tone('sine', 500 + i * 200, 800 + i * 200, 0.25, 0.12, d)); }
  uiMove() { this._tone('sine', 1200, 1500, 0.04, 0.04); }
  uiSelect() { this._tone('square', 300, 900, 0.12, 0.05); this._noise(0.35, 1200, 'bandpass', 0.08, 1.5); }
  uiBack() { this._tone('sine', 700, 300, 0.1, 0.06); }
  whoosh() { this._noise(1.2, 500, 'bandpass', 0.18, 0.8); this._tone('sine', 60, 30, 1.2, 0.2); }
  boom() { this._noise(1.0, 300, 'lowpass', 0.6); this._tone('sine', 70, 25, 0.9, 0.5); }
  thunder() { if (!this.ctx) return; this._noise(2.5, 160, 'lowpass', 0.55); this._noise(0.4, 900, 'lowpass', 0.3); }
  enemyShot() { this._noise(0.14, 1300, 'lowpass', 0.25); }
  setRain(v) { if (!this.ctx) return; if (!this.rainG) { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; const f = this.ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500; this.rainG = this.ctx.createGain(); this.rainG.gain.value = 0; s.connect(f); f.connect(this.rainG); this.rainG.connect(this.master); s.start(); } this.rainG.gain.setTargetAtTime(v * 0.09, this.ctx.currentTime, 0.8); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }
  breath(level, t) { if (!this.breathG) return; const v = level > 0 ? level * 0.12 * (0.5 + 0.5 * Math.sin(t * 5)) : 0; this.breathG.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setNight(f) { if (!this.pad) return; this.pad.gain.setTargetAtTime(0.06 + f * 0.06, this.ctx.currentTime, 1); this.wind.gain.setTargetAtTime(0.04 + f * 0.03, this.ctx.currentTime, 1); }
}
