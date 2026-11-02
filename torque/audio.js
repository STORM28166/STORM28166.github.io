// Engine + crash sound (WebAudio). `muted` is the single source of truth for sound.
export const audio = { muted: localStorage.getItem("or_muted") === "1", ctx: null };
let master, o1, o2, filt, g, wind, windG, noiseBuf, fxGain, musicGain, scrGain, scrSrc;
let volS = 0.8, volM = 0, volE = 0.8;
// v2: separate sound (master) / effects (wind+crash+screech) / music gains.
export function setVolumes(snd, mus, eff) {
  volS = snd / 100; volM = mus / 100; volE = eff / 100;
  if (master) master.gain.value = audio.muted ? 0 : volS;
  if (fxGain) fxGain.gain.value = volE;
  if (musicGain) musicGain.gain.value = volM;
  if (volM > 0) startMusic(); else stopMusic();
}
// ---- Menu music: ORIGINAL Tokyo-drift-STYLE loop, never stops on its own ----
// Not the actual Teriyaki Boyz track (that's copyrighted and can't be shipped
// in a game) — this is an original high-energy loop in that style: 138 BPM,
// four-on-the-floor kick, driving bass, and a minor-pentatonic synth lead.
// A lookahead scheduler keeps it seamless forever; it only stops if the
// music volume is set to 0 or the game is muted.
let musicTimer = null, musicStep = 0, musicNext = 0, enginePaused = false;
export function setEnginePaused(p) {
  enginePaused = p;
  if (!audio.ctx) return;
  if (p) { try { g.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.02); windG.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.02); scrGain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.02); } catch (e) {} }
}
function musicNote(freq, t, dur, type, vol, filterFreq) {
  const o = audio.ctx.createOscillator(), e = audio.ctx.createGain(), f = audio.ctx.createBiquadFilter();
  o.type = type; o.frequency.value = freq; f.type = "lowpass"; f.frequency.value = filterFreq || 3000;
  e.gain.setValueAtTime(vol, t); e.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f); f.connect(e); e.connect(musicGain); o.start(t); o.stop(t + dur + 0.05);
}
function musicDrum(t, kind) {
  const src = audio.ctx.createBufferSource(); src.buffer = noiseBuf;
  const f = audio.ctx.createBiquadFilter(), e = audio.ctx.createGain();
  if (kind === "kick") { const o = audio.ctx.createOscillator(), oe = audio.ctx.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    oe.gain.setValueAtTime(0.5, t); oe.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
    o.connect(oe); oe.connect(musicGain); o.start(t); o.stop(t + 0.25); return; }
  f.type = "bandpass"; f.frequency.value = kind === "snare" ? 1800 : 7000; f.Q.value = 1;
  e.gain.setValueAtTime(kind === "snare" ? 0.22 : 0.08, t); e.gain.exponentialRampToValueAtTime(0.001, t + (kind === "snare" ? 0.18 : 0.05));
  src.connect(f); f.connect(e); e.connect(musicGain); src.start(t); src.stop(t + 0.2);
}
function startMusic() {
  if (!audio.ctx || musicTimer) return;
  // A-minor pentatonic lead riff (original) + driving bass, 4 bars looping.
  const BASS = [55, 0, 55, 0, 65.41, 0, 55, 0, 49, 0, 49, 0, 58.27, 0, 65.41, 0,
                55, 0, 55, 0, 65.41, 0, 55, 0, 73.42, 0, 65.41, 0, 58.27, 0, 49, 0];
  const LEAD = [220, 0, 261.63, 293.66, 0, 329.63, 293.66, 261.63,
                220, 0, 261.63, 0, 329.63, 0, 392, 329.63,
                293.66, 261.63, 220, 0, 196, 220, 261.63, 0,
                329.63, 293.66, 261.63, 220, 196, 0, 220, 0];
  const STEP = 60 / 138 / 2; // 8th note at 138 BPM
  musicNext = audio.ctx.currentTime + 0.1;
  musicTimer = setInterval(() => {
    if (!audio.ctx || audio.ctx.state !== "running" || volM <= 0) return;
    try {
      while (musicNext < audio.ctx.currentTime + 0.35) {
        const i = musicStep % 32, t = musicNext;
        if (i % 4 === 0) musicDrum(t, "kick");
        if (i % 2 === 1) musicDrum(t, "hat");
        if (i === 8 || i === 24) musicDrum(t, "snare");
        if (BASS[i]) musicNote(BASS[i], t, 0.2, "sawtooth", 0.20, 700);
        if (LEAD[i]) musicNote(LEAD[i], t, 0.24, "square", 0.07, 3800);
        musicStep++; musicNext += STEP;
      }
    } catch (err) { /* ignore */ }
  }, 100);
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
  if (!audio.ctx || enginePaused) return;
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
