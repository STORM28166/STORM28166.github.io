// Engine + crash sound (WebAudio). `muted` is the single source of truth for sound.
export const audio = { muted: localStorage.getItem("or_muted") === "1", ctx: null };
let master, o1, o2, filt, g, wind, windG, noiseBuf, fxGain, musicGain, scrGain, scrSrc;
let volS = 0.8, volM = 0, volE = 0.8;
// ---- Realistic engine sound system (all generated in code, no audio files) ----
// One speed value drives everything: 0 = idle, 1 = full speed. All changes are
// smoothed with setTargetAtTime so there are no clicks or pops.
let engBase, engSub, engGrowl, engGain, engFilt, engHiss, engHissGain, turboOsc, turboGain;
let engStarted = false, engSmooth = 0, engPrev = 0, engLastGear = 0, engShiftDrop = 1, engTest = null, engCranked = false;
export function isEngineTestActive() { return engTest !== null; }
export function engineTestSpeed() { return engTest; }
export function resetEngineStart() { engCranked = false; engStarted = false; }
export function setEngineTest(v) { // v: 0..1, or null to hand control back to the car
  engTest = (v === null || v === undefined) ? null : Math.min(1, Math.max(0, v));
  if (engTest !== null) enginePaused = false;
  if (engTest !== null && audio.ctx && !engCranked) engineCrank();
}
export function uiClick() { // short lobby button click, so taps give instant sound feedback
  if (!audio.ctx || audio.ctx.state !== "running") return;
  try {
    const t = audio.ctx.currentTime, o = audio.ctx.createOscillator(), e = audio.ctx.createGain();
    o.type = "triangle"; o.frequency.setValueAtTime(880, t); o.frequency.exponentialRampToValueAtTime(660, t + 0.07);
    e.gain.setValueAtTime(0.18, t); e.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(e); e.connect(master); o.start(t); o.stop(t + 0.1);
  } catch (err) {}
}
export function engineCrank() { // start-up crank: starter sputter, then the engine catches
  if (!audio.ctx || engCranked) return; engCranked = true; engStarted = true;
  try {
    const c = audio.ctx, t0 = c.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = c.createOscillator(), e = c.createGain();
      o.type = "square"; o.frequency.value = 82;
      e.gain.setValueAtTime(0, t0 + i * 0.22); e.gain.linearRampToValueAtTime(0.14, t0 + i * 0.22 + 0.03);
      e.gain.setValueAtTime(0.14, t0 + i * 0.22 + 0.14); e.gain.linearRampToValueAtTime(0, t0 + i * 0.22 + 0.2);
      o.connect(e); e.connect(master); o.start(t0 + i * 0.22); o.stop(t0 + i * 0.22 + 0.22);
    }
  } catch (e) {}
}
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
  if (p) { try { if (engGain) engGain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.02); windG.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.02); scrGain.gain.setTargetAtTime(0, audio.ctx.currentTime, 0.02); } catch (e) {} }
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
    oe.gain.setValueAtTime(0.65, t); oe.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
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
        if (BASS[i]) musicNote(BASS[i], t, 0.2, "sawtooth", 0.30, 700);
        if (LEAD[i]) musicNote(LEAD[i], t, 0.24, "square", 0.14, 3800);
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
  // Layered engine: deep base (saw) + sub (sine, octave down) + mid growl
  // (detuned square) through one lowpass, plus filtered noise for air/exhaust hiss.
  engFilt = c.createBiquadFilter(); engFilt.type = "lowpass"; engFilt.frequency.value = 400; engFilt.Q.value = 0.8;
  engGain = c.createGain(); engGain.gain.value = 0; engFilt.connect(engGain); engGain.connect(master);
  engBase = c.createOscillator(); engBase.type = "sawtooth"; engBase.frequency.value = 50;
  engSub = c.createOscillator(); engSub.type = "sine"; engSub.frequency.value = 25;
  engGrowl = c.createOscillator(); engGrowl.type = "square"; engGrowl.frequency.value = 75; engGrowl.detune.value = 7;
  const bg = c.createGain(); bg.gain.value = 0.55; const sg = c.createGain(); sg.gain.value = 0.6; const gg = c.createGain(); gg.gain.value = 0.3;
  engBase.connect(bg); bg.connect(engFilt); engSub.connect(sg); sg.connect(engFilt); engGrowl.connect(gg); gg.connect(engFilt);
  engBase.start(); engSub.start(); engGrowl.start();
  // Exhaust hiss (looped noise -> bandpass) and turbo whistle (high sine).
  engHiss = c.createBufferSource(); engHiss.buffer = null; // buffer set below after noiseBuf exists
  engHissGain = c.createGain(); engHissGain.gain.value = 0;
  turboOsc = c.createOscillator(); turboOsc.type = "sine"; turboOsc.frequency.value = 1200;
  turboGain = c.createGain(); turboGain.gain.value = 0; turboOsc.connect(turboGain); turboGain.connect(master); turboOsc.start();
  noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  wind = c.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
  const wf = c.createBiquadFilter(); wf.type = "bandpass"; wf.frequency.value = 500;
  windG = c.createGain(); windG.gain.value = 0; wind.connect(wf); wf.connect(windG); windG.connect(fxGain); wind.start();
  if (engHiss) { const hf = c.createBiquadFilter(); hf.type = "bandpass"; hf.frequency.value = 900; hf.Q.value = 0.6;
    engHiss.buffer = noiseBuf; engHiss.loop = true; engHiss.connect(hf); hf.connect(engHissGain); engHissGain.connect(master); engHiss.start(); }
  // Tyre screech: looped noise through a high bandpass, gain driven by setScreech().
  scrSrc = c.createBufferSource(); scrSrc.buffer = noiseBuf; scrSrc.loop = true;
  const sf = c.createBiquadFilter(); sf.type = "bandpass"; sf.frequency.value = 1400; sf.Q.value = 2;
  scrGain = c.createGain(); scrGain.gain.value = 0; scrSrc.connect(sf); sf.connect(scrGain); scrGain.connect(fxGain); scrSrc.start();
  applyMute();
}
function applyMute() { if (master) master.gain.value = audio.muted ? 0 : volS; }
export function setMuted(on) { audio.muted = on; localStorage.setItem("or_muted", on ? "1" : "0"); applyMute(); }

export function updateAudio(rpm, gas, kmh, impact, gear) {
  if (!audio.ctx || enginePaused) return;
  const t = audio.ctx.currentTime;
  // One speed value: 0 = idle, 1 = full speed. Test slider overrides the car.
  const carNorm = Math.min(1, Math.max(0, (kmh || 0) / 270));
  const target = engTest !== null ? engTest : carNorm;
  const gasEff = engTest !== null ? (engTest > 0.03 ? 0.8 : 0) : (gas || 0);
  engSmooth += (target - engSmooth) * 0.12; // smoothing: no jumps, no clicks
  const sp = engSmooth;
  // GEAR SHIFTS: pitch drops sharply at a shift, then climbs again + throttle cut.
  if (gear !== undefined && engLastGear !== 0 && gear > engLastGear && sp > 0.12) engShiftDrop = 0.62;
  if (gear !== undefined) engLastGear = gear;
  engShiftDrop += (1 - engShiftDrop) * 0.08; // recovers smoothly after the cut
  // IDLE lope: slight uneven wobble at low speed so it never sounds like a loop.
  const lope = sp < 0.1 ? 1 + (Math.random() - 0.5) * 0.07 : 1;
  const lopeGain = sp < 0.1 ? 0.88 + Math.random() * 0.14 : 1;
  // Pitch: low rumble at idle, smooth rise with speed, sharper with throttle.
  const freq = (48 + sp * 175 + gasEff * 22) * lope * engShiftDrop;
  const tc = 0.09;
  engBase.frequency.setTargetAtTime(freq, t, tc);
  engSub.frequency.setTargetAtTime(freq * 0.5, t, tc);
  engGrowl.frequency.setTargetAtTime(freq * 1.5, t, tc);
  engFilt.frequency.setTargetAtTime(320 + sp * 1900 + gasEff * 900, t, 0.12);
  // Volume: idle rumble, louder + sharper as you rev; throttle cut dips it on shifts.
  const cut = 1 - (1 - engShiftDrop) * 0.55;
  const vol = engStarted ? (0.055 + sp * 0.13 + gasEff * 0.05) * cut * lopeGain : 0;
  engGain.gain.setTargetAtTime(vol, t, 0.1);
  engHissGain.gain.setTargetAtTime(0.004 + sp * 0.045 + gasEff * 0.02, t, 0.15);
  // TURBO WHISTLE at higher speeds, only on throttle.
  const turbo = sp > 0.55 && gasEff > 0.1 ? (sp - 0.55) * 0.14 : 0;
  turboOsc.frequency.setTargetAtTime(1100 + sp * 2400, t, 0.15);
  turboGain.gain.setTargetAtTime(turbo, t, 0.2);
  // LETTING OFF + DECEL: falling pitch/volume is automatic via smoothing above.
  // Exhaust burble/pop sometimes, and a backfire crackle on hard decel.
  const decel = engPrev - sp;
  if (gasEff < 0.05 && decel > 0.004 && sp > 0.15 && sp < 0.7 && Math.random() < 0.10) {
    const o = audio.ctx.createBufferSource(); o.buffer = noiseBuf;
    const f = audio.ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 380;
    const e = audio.ctx.createGain(); e.gain.setValueAtTime(0.16, t); e.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(f); f.connect(e); e.connect(master); o.start(t); o.stop(t + 0.1);
  }
  if (gasEff < 0.05 && decel > 0.02 && Math.random() < 0.03) { // backfire crackle: 3 rapid pops
    for (let k = 0; k < 3; k++) {
      const o = audio.ctx.createBufferSource(); o.buffer = noiseBuf;
      const f = audio.ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1400; f.Q.value = 1;
      const e = audio.ctx.createGain(), tt = t + k * 0.05;
      e.gain.setValueAtTime(0.22, tt); e.gain.exponentialRampToValueAtTime(0.001, tt + 0.05);
      o.connect(f); f.connect(e); e.connect(master); o.start(tt); o.stop(tt + 0.06);
    }
  }
  engPrev = sp;
  // Wind + crash (unchanged from before).
  windG.gain.setTargetAtTime(Math.min(0.12, kmh / 1500), t, 0.1);
  if (impact > 2.5) {
    const s2 = audio.ctx.createBufferSource(), e = audio.ctx.createGain(); s2.buffer = noiseBuf;
    e.gain.setValueAtTime(Math.min(1, impact / 15), t); e.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    const lp = audio.ctx.createBiquadFilter(); lp.frequency.value = 700; s2.connect(lp); lp.connect(e); e.connect(fxGain); s2.start(); s2.stop(t + 0.5);
  }
}
