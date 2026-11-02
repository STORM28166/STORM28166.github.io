// Engine + crash sound (WebAudio). `muted` is the single source of truth for sound.
export const audio = { muted: localStorage.getItem("or_muted") === "1", ctx: null };
let master, o1, o2, filt, g, wind, windG, noiseBuf, fxGain, musicGain, scrGain, scrSrc;
let volS = 0.8, volM = 0, volE = 0.8, musicTimer = null, musicStep = 0;
// v2: separate sound (master) / effects (wind+crash+screech) / music gains.
export function setVolumes(snd, mus, eff) {
  volS = snd / 100; volM = mus / 100; volE = eff / 100;
  if (master) master.gain.value = audio.muted ? 0 : volS;
  if (fxGain) fxGain.gain.value = volE;
  if (musicGain) musicGain.gain.value = volM;
  if (volM > 0) startMusic(); else stopMusic();
}
function startMusic() {
  if (!audio.ctx || musicTimer) return;
  const notes = [110, 110, 130.81, 98, 110, 130.81, 146.83, 130.81];
  musicTimer = setInterval(() => {
    if (!audio.ctx || audio.ctx.state !== "running" || volM <= 0) return;
    try {
      const t = audio.ctx.currentTime, o = audio.ctx.createOscillator(), e = audio.ctx.createGain();
      o.type = "triangle"; o.frequency.value = notes[musicStep++ % notes.length];
      e.gain.setValueAtTime(0.12, t); e.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
      o.connect(e); e.connect(musicGain); o.start(t); o.stop(t + 0.4);
    } catch (err) { /* ignore */ }
  }, 400);
}
function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
export function setScreech(v) { if (scrGain && audio.ctx) scrGain.gain.setTargetAtTime(v ? 0.09 * volE : 0, audio.ctx.currentTime, 0.05); }

export function initAudio() {
  if (audio.ctx) { audio.ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const c = audio.ctx = new AC();
  master = c.createGain(); master.connect(c.destination);
  fxGain = c.createGain(); fxGain.gain.value = volE; fxGain.connect(master);
  musicGain = c.createGain(); musicGain.gain.value = volM; musicGain.connect(master);
  filt = c.createBiquadFilter(); filt.type = "lowpass"; filt.frequency.value = 600;
  g = c.createGain(); g.gain.value = 0; o1 = c.createOscillator(); o1.type = "sawtooth"; o2 = c.createOscillator(); o2.type = "square";
  o1.connect(filt); o2.connect(filt); filt.connect(g); g.connect(master); o1.start(); o2.start();
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  wind = c.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
  const wf = c.createBiquadFilter(); wf.type = "bandpass"; wf.frequency.value = 500;
  windG = c.createGain(); windG.gain.value = 0; wind.connect(wf); wf.connect(windG); windG.connect(fxGain); wind.start();
  // Tyre screech: looped noise through a high bandpass, gain driven by setScreech().
  scrSrc = c.createBufferSource(); scrSrc.buffer = noiseBuf; scrSrc.loop = true;
  const sf = c.createBiquadFilter(); sf.type = "bandpass"; sf.frequency.value = 1400; sf.Q.value = 2;
  scrGain = c.createGain(); scrGain.gain.value = 0; scrSrc.connect(sf); sf.connect(scrGain); scrGain.connect(fxGain); scrSrc.start();
  applyMute();
}
function applyMute() { if (master) master.gain.value = audio.muted ? 0 : volS; }
export function setMuted(on) { audio.muted = on; localStorage.setItem("or_muted", on ? "1" : "0"); applyMute(); }

export function updateAudio(rpm, gas, kmh, impact) {
  if (!audio.ctx) return;
  applyMute();
  const t = audio.ctx.currentTime, f = rpm / 60 * 2;
  o1.frequency.setTargetAtTime(f, t, 0.03); o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
  filt.frequency.setTargetAtTime(350 + rpm * 0.35 + gas * 500, t, 0.05);
  g.gain.setTargetAtTime(0.05 + gas * 0.07, t, 0.05);
  windG.gain.setTargetAtTime(Math.min(0.12, kmh / 1500), t, 0.1);
  if (impact > 2.5) {
    const s = audio.ctx.createBufferSource(), e = audio.ctx.createGain(); s.buffer = noiseBuf;
    e.gain.setValueAtTime(Math.min(1, impact / 15), t); e.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    const lp = audio.ctx.createBiquadFilter(); lp.frequency.value = 700; s.connect(lp); lp.connect(e); e.connect(fxGain); s.start(); s.stop(t + 0.5);
  }
}
