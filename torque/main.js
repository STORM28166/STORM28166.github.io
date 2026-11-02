// TORQUE v2 host logic (modular base). car.js physics is used as-is — nothing
// here re-implements handling. Steering direction is fixed in input.js only.
import * as THREE from "three";
import { World, cfg, CELL, height, cellType, setAniso, setNight } from "./world.js";
import { Car } from "./car.js";
import { makeSky, timeOfDay } from "./sky.js";
import { input, updateInput, isTouchDevice, showTouch } from "./input.js";
import { audio, initAudio, setMuted, updateAudio, setVolumes, setScreech, setEnginePaused, engineCrank, setEngineTest, isEngineTestActive, engineTestSpeed, resetEngineStart } from "./audio.js";
import { S, RES, DEN, PRESETS, loadSettings, bindPanel, resLabel } from "./settings.js";
import { Traffic } from "./traffic.js";

const $ = id => document.getElementById(id);
const PAINTS = [0xc8202a, 0x00c8e8, 0x101828, 0xa8e10c, 0xff6a00];
const PAINT_NAMES = ["Velocity Red", "Apex Cyan", "Night Falcon", "Volt Lime", "Ember Orange"];
const isTouch = isTouchDevice();
loadSettings(isTouch);
// Menu-music migration: older saves stored volM 0 (music off). This update turns it on.
if (S.volM < 50) S.volM = 70;

const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !!S.aa, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 0.2, 2000);
const sky = makeSky(); scene.add(sky.mesh);
const hemi = new THREE.HemisphereLight(0xaac8ff, 0x3a3a30, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 3); scene.add(sun, sun.target);
Object.assign(sun.shadow.camera, { left: -150, right: 150, top: 150, bottom: -150, near: 1, far: 700 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06; sun.shadow.camera.updateProjectionMatrix();
scene.fog = new THREE.Fog(0xb9d4ef, 100, 1000);

const world = new World(scene), car = new Car(scene, PAINTS[S.paint] || PAINTS[0]);
car.x = 60; car.z = 3.2; car.h = Math.PI / 2;
const traffic = new Traffic(scene);

let envTex = null, cur = { w: 0, h: 0 }, started = false, panelOpen = false, paused = false, mapOpen = false;
let hours = S.tod, appliedTod = S.tod, camMode = 0, camH = car.h, shake = 0;
let lastAA = S.aa, driftScore = 0, driftBest = 0, lowCount = 0, mapN = 0, lastRender = 0;

function getEnv() {
  if (envTex) return envTex;
  const sc = new THREE.Scene(), s = makeSky();
  s.u.top.value.set(0x3a78d8); s.u.hor.value.set(0xb9d4ef); s.u.sunDir.value.set(0.3, 0.9, 0.3).normalize(); s.u.sunCol.value.set(0xfff4e0);
  sc.add(s.mesh);
  envTex = new THREE.PMREMGenerator(renderer).fromScene(sc, 0, 0.1, 100).texture;
  return envTex;
}
function applyBtnSize() {
  const eff = Math.min(S.btnSize, Math.max(52, Math.floor((innerWidth - 48) / 4)));
  document.documentElement.style.setProperty("--btn", eff + "px");
  document.body.classList.toggle("mirror", !!S.mirror);
}
function resize() {
  const aspect = innerWidth / innerHeight, max = renderer.capabilities.maxTextureSize;
  let h = RES[S.res], w = Math.round(h * aspect);
  if (w > max) { w = max; h = Math.round(w / aspect); }
  renderer.setSize(w, h, false); cur = { w, h };
  camera.aspect = aspect; camera.updateProjectionMatrix();
  $("resLbl").textContent = resLabel(S.res, w, h);
  applyBtnSize();
}
function badge(msg, ms) {
  const b = $("badge"); b.textContent = msg;
  clearTimeout(badge._t); badge._t = setTimeout(() => { b.textContent = ""; }, ms || 3000);
}
function apply() {
  resize();
  cfg.radius = S.vd;
  if (cfg.seg !== S.seg || cfg.den !== DEN[S.den]) { cfg.seg = S.seg; cfg.den = DEN[S.den]; world.reset(); }
  setAniso(Math.min(S.af, renderer.capabilities.getMaxAnisotropy()));
  const on = S.sh > 0 && !!S.rtSh; sun.castShadow = on;
  if (on && sun.shadow.mapSize.x !== S.sh) { sun.shadow.mapSize.set(S.sh, S.sh); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  world.setShadows(on);
  scene.environment = (S.refl && S.rtRefl) ? getEnv() : null;
  renderer.toneMappingExposure = S.bloom ? 1.0 : 0.92;
  const far = Math.max(400, S.vd * CELL);
  scene.fog.near = far * (0.15 + (1 - S.fog) * 0.7); scene.fog.far = far;
  camera.far = far * 1.1 + 100; camera.updateProjectionMatrix();
  showTouch(S.tc === "on" || (S.tc === "auto" && isTouch));
  $("info").style.display = S.fps ? "flex" : "none";
  traffic.setEnabled(!!S.traffic);
  if (car.paintMat) car.paintMat.color.set(PAINTS[S.paint] || PAINTS[0]);
  setVolumes(S.volS, S.volM, S.volE);
  if (S.aa !== lastAA) { lastAA = S.aa; badge("Anti-aliasing applies on next load"); }
  syncPaint();
}
function onApply() {
  if (S.tod !== appliedTod) { hours = S.tod; appliedTod = S.tod; }
  apply();
}
const sync = bindPanel(onApply, { resText: () => resLabel(S.res, cur.w, cur.h) });
apply(); sync();
addEventListener("resize", () => { resize(); sync(); });

// ---- paint / cars ----
function syncPaint() {
  const n = PAINT_NAMES[S.paint] || PAINT_NAMES[0];
  const a = $("carName"); if (a) a.textContent = n;
  const b = $("carName2"); if (b) b.textContent = n;
  document.querySelectorAll("#carSwatches button").forEach(el => el.classList.toggle("on", +el.dataset.paint === S.paint));
}
function setPaint(i) { S.paint = ((i % PAINTS.length) + PAINTS.length) % PAINTS.length; if (car.paintMat) car.paintMat.color.set(PAINTS[S.paint]); sync(); syncPaint(); }

// ---- UI state machine: menu / playing / paused / settings / map ----
function setPanel(open) { panelOpen = open; $("panel").hidden = !open; if (open) sync(); }
function setPaused(p) {
  if (!started) p = false;
  paused = p; $("pause").style.display = p ? "flex" : "none";
  // Menu music NEVER stops: pause silences the engine only, music keeps looping.
  setEnginePaused(p); if (!p && audio.ctx) audio.ctx.resume();
  setScreech(0);
}
function openMap() { mapOpen = true; $("mapview").style.display = "flex"; drawMap(); }
function closeMap() { mapOpen = false; $("mapview").style.display = "none"; }
function toggleMap() { mapOpen ? closeMap() : openMap(); }
function startDrive() {
  started = true; $("start").style.display = "none";
  $("hud").style.display = "block"; $("touch").style.display = "flex"; // flex, NOT block: block stacks the two control columns vertically over the screen
  initAudio(); setEngineTest(null); engineCrank(); setVolumes(S.volS, S.volM, S.volE); muteLbl(); setEnginePaused(false); setPaused(false);
}
function quitToMenu() {
  started = false; setPaused(false); setPanel(false); closeMap();
  $("hud").style.display = "none"; $("touch").style.display = "none"; $("pause").style.display = "none";
  $("start").style.display = "flex"; resetEngineStart();
  // Back in the menu: engine silent, menu music keeps looping (never stops).
  setEnginePaused(true); if (audio.ctx) audio.ctx.resume();
  setScreech(0);
}
input.menu = () => { if (panelOpen) setPanel(false); else if (started) setPaused(!paused); };
input.reset = () => { if (started) car.reset(); };
input.cam = () => { camMode = (camMode + 1) % 3; };
function syncMusicBtn() { const b = $("btnMusic"); if (b) b.textContent = S.volM > 0 ? "MUSIC: ON" : "MUSIC: OFF"; }
$("btnMusic").onclick = () => { S.volM = S.volM > 0 ? 0 : 70; setVolumes(S.volS, S.volM, S.volE); sync(); syncMusicBtn(); };
syncMusicBtn();
// First tap anywhere on the start menu unlocks audio (iOS rule) so the
// menu music can start looping before DRIVE is pressed.
$("start").addEventListener("pointerdown", () => { initAudio(); setVolumes(S.volS, S.volM, S.volE); if (audio.ctx) audio.ctx.resume(); }, { passive: true });
// Engine test slider (in Settings): drag to hear idle -> mid -> fast live.
// Audio starts on this tap (browser rule); driving hands control back to the car.
const et = $("engineTest");
if (et) et.addEventListener("input", () => {
  initAudio(); setVolumes(S.volS, S.volM, S.volE); if (audio.ctx) audio.ctx.resume();
  setEngineTest(Number(et.value) / 100);
  const lbl = $("engineTestLbl"); if (lbl) lbl.textContent = Number(et.value) <= 2 ? "Idle" : Number(et.value) < 60 ? "Mid" : "Fast";
});
$("btnStart").onclick = startDrive;
$("btnStartSet").onclick = () => setPanel(true);
$("btnStartMap").onclick = () => openMap();
$("btnCar").onclick = () => setPaint(S.paint + 1);
$("btnPause").onclick = () => setPaused(true);
$("btnMap").onclick = () => toggleMap();
$("btnCam").onclick = input.cam;
const muteLbl = () => { $("btnMute").textContent = audio.muted ? "MUTED" : "SOUND"; };
$("btnMute").onclick = () => { setMuted(!audio.muted); muteLbl(); }; muteLbl();
$("btnResume").onclick = () => { setEngineTest(null); setPaused(false); };
$("btnRestart").onclick = () => { car.reset(); setPaused(false); };
$("btnPauseSet").onclick = () => setPanel(true);
$("btnPauseCar").onclick = () => setPaint(S.paint + 1);
$("btnPauseMap").onclick = () => openMap();
$("btnQuit").onclick = quitToMenu;
$("btnClose").onclick = () => setPanel(false);
$("btnCloseMap").onclick = () => closeMap();
document.querySelectorAll("#carSwatches button").forEach(b => b.onclick = () => setPaint(+b.dataset.paint));
addEventListener("keydown", e => {
  if (e.code === "KeyP" && started && !panelOpen) setPaused(!paused);
  if (e.code === "KeyM" && started) toggleMap();
});
document.addEventListener("visibilitychange", () => { if (document.hidden && started && !paused) setPaused(true); });

// ---- smoke (pooled round sprites) ----
function smokeTexture() {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d"), g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, "rgba(255,255,255,0.85)"); g.addColorStop(0.5, "rgba(220,225,235,0.45)"); g.addColorStop(1, "rgba(220,225,235,0)");
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const smokeTex = smokeTexture(), smokePool = [];
function puff(x, y, z, big) {
  let p = smokePool.find(q => !q.on);
  if (!p) {
    if (smokePool.length >= 48) return;
    p = { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.6, depthWrite: false })), on: false, life: 0, big: false };
    scene.add(p.s); smokePool.push(p);
  }
  p.on = true; p.life = 0; p.big = big; p.s.position.set(x, y, z); p.s.scale.set(1, 1, 1);
}
function updateSmoke(dt) {
  for (const p of smokePool) {
    if (!p.on) continue;
    p.life += dt;
    if (p.life > 0.9) { p.on = false; p.s.material.opacity = 0; continue; }
    const s = (p.big ? 2.2 : 1.3) + p.life * 3;
    p.s.scale.set(s, s, 1); p.s.position.y += dt * 1.4;
    p.s.material.opacity = 0.6 * (1 - p.life / 0.9);
  }
}

// ---- camera ----
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const v3 = new THREE.Vector3();
function updateCamera(dt) {
  const sp = car.speed, sh = shake > 0.01 ? (Math.random() - 0.5) * shake : 0; shake *= Math.max(0, 1 - dt * 6);
  const fovRate = S.blur ? 1.8 : 3;
  if (camMode === 1) {
    car.root.updateMatrixWorld(true); camera.position.copy(car.root.localToWorld(v3.set(0.4, 1.22, 0.15)));
    camera.quaternion.copy(car.root.quaternion); camera.rotateY(Math.PI); camera.rotateX(sh);
    camera.fov += (74 + sp * 0.15 - camera.fov) * Math.min(1, dt * fovRate);
  } else {
    camH += angDiff(car.h, camH) * Math.min(1, dt * (camMode ? 2 : 3.2));
    const dist = camMode ? 16 + sp * 0.05 : 6.4 + Math.min(sp, 60) * 0.035, up = camMode ? 8 : 2.1 + sp * 0.008;
    const x = car.x - Math.sin(camH) * dist, z = car.z - Math.cos(camH) * dist;
    camera.position.set(x + sh, Math.max(car.y + up, height(x, z) + 1.2) + sh, z);
    camera.lookAt(car.x + Math.sin(camH) * 3, car.y + (camMode ? 0.5 : 1.2), car.z + Math.cos(camH) * 3);
    const blurBoost = S.blur ? 6 * Math.min(sp, 70) / 70 : 0;
    camera.fov += ((camMode ? 55 : 62) + Math.min(sp, 70) * 0.28 + blurBoost - camera.fov) * Math.min(1, dt * fovRate);
    camera.rotateZ(THREE.MathUtils.clamp(car.rd, -0.1, 0.1) * 0.6); // gentle bank with the car
  }
  camera.near = camMode === 1 ? 0.1 : 0.3; camera.updateProjectionMatrix();
}

// ---- lighting / time of day ----
const moon = new THREE.Color(0x6f88c8), white = new THREE.Color(0xfff4e0), orange = new THREE.Color(0xff9a50);
function updateLighting() {
  const t = timeOfDay(hours);
  sky.u.top.value.copy(t.top); sky.u.hor.value.copy(t.hor); sky.u.sunDir.value.copy(t.dir); sky.u.sunCol.value.copy(t.sunCol); sky.u.night.value = t.night;
  scene.fog.color.copy(t.hor).multiplyScalar(0.92); renderer.setClearColor(scene.fog.color);
  const ld = t.elev > -0.05 ? t.dir.clone() : t.dir.clone().negate(); ld.y = Math.max(ld.y, 0.15); ld.normalize();
  sun.position.set(car.x, car.y, car.z).addScaledVector(ld, 300); sun.target.position.set(car.x, car.y, car.z);
  sun.intensity = t.day * 3.4 + t.night * 0.3;
  sun.color.copy(white).lerp(orange, 1 - Math.min(1, Math.max(0, t.elev) * 3)).lerp(moon, t.night);
  hemi.intensity = (0.15 + 0.55 * t.day + 0.12 * t.night) * (S.refl ? 0.6 : 1) * (S.rtGI ? 1 : 0.7);
  hemi.color.copy(t.top).lerp(white, 0.4);
  scene.environmentIntensity = (0.05 + 0.95 * t.day) * (S.rtRefl ? 1 : 0.3);
  setNight(t.night * (S.bloom ? 1.1 : 0.9));
  car.setNight(S.headlights ? 1 : t.night);
}

// ---- HUD / minimap / live map ----
const mini = $("mini").getContext("2d"), TYPE_COL = { city: "#6b6f78", forest: "#2c5a2c", wild: "#7a6a58", open: "#6d9a4a" };
function drawMini() {
  const c = mini, S2 = 8; c.clearRect(0, 0, 140, 140); c.save(); c.translate(70, 70); c.rotate(car.h + Math.PI);
  const ci = Math.floor(car.x / CELL), cj = Math.floor(car.z / CELL);
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
    const i = ci + a, j = cj + b, x = (i * CELL - car.x) / S2, y = (j * CELL - car.z) / S2;
    c.fillStyle = TYPE_COL[cellType(i, j)]; c.fillRect(x, y, CELL / S2 + 1, CELL / S2 + 1);
    c.fillStyle = "#222"; c.fillRect(x - 1.5, y, 3, CELL / S2); c.fillRect(x, y - 1.5, CELL / S2, 3);
  }
  c.restore(); c.fillStyle = "#fff"; c.strokeStyle = "#e8453c"; c.lineWidth = 2;
  c.beginPath(); c.moveTo(70, 60); c.lineTo(76, 78); c.lineTo(70, 74); c.lineTo(64, 78); c.closePath(); c.fill(); c.stroke();
}
function drawMap() {
  const cv = $("mapcanvas"); if (!cv) return;
  const x = cv.getContext("2d"), w = cv.width, h = cv.height;
  const range = 1250, sc = Math.min(w, h) / (range * 2), ox = w / 2, oy = h / 2;
  const X = v => ox + (v - car.x) * sc, Y = v => oy + (v - car.z) * sc;
  x.clearRect(0, 0, w, h); x.fillStyle = "#0c141c"; x.fillRect(0, 0, w, h);
  const ci = Math.floor(car.x / CELL), cj = Math.floor(car.z / CELL);
  for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) {
    const i = ci + a, j = cj + b;
    x.fillStyle = TYPE_COL[cellType(i, j)];
    x.fillRect(X(i * CELL), Y(j * CELL), CELL * sc, CELL * sc);
  }
  x.strokeStyle = "#d8dee4"; x.lineWidth = 2;
  for (let k = -3; k <= 3; k++) {
    const gx = (ci + k) * CELL, gz = (cj + k) * CELL;
    x.beginPath(); x.moveTo(X(gx), Y(car.z - range)); x.lineTo(X(gx), Y(car.z + range)); x.stroke();
    x.beginPath(); x.moveTo(X(car.x - range), Y(gz)); x.lineTo(X(car.x + range), Y(gz)); x.stroke();
  }
  x.fillStyle = "#ff4444";
  for (const t of traffic.cars) { if (t.px === undefined) continue; x.beginPath(); x.arc(X(t.px), Y(t.pz), 5, 0, 7); x.fill(); }
  x.save(); x.translate(X(car.x), Y(car.z)); x.rotate(Math.PI - car.h);
  x.fillStyle = "#00e5ff"; x.beginPath(); x.moveTo(0, -11); x.lineTo(8, 9); x.lineTo(-8, 9); x.closePath(); x.fill(); x.restore();
}
function hud() {
  $("mph").textContent = Math.round(car.speed * 2.23694);
  $("gear").textContent = car.label;
  $("rpm").style.width = Math.max(0, Math.min(100, (car.rpm - 900) / 62)) + "%";
  $("driftScore").textContent = `DRIFT ${Math.round(driftScore)} • BEST ${Math.round(driftBest)}`;
  if (S.fps) $("pos").textContent = `x ${car.x.toFixed(0)}  z ${car.z.toFixed(0)}  alt ${car.y.toFixed(0)}m  trip ${(car.odo / 1609.34).toFixed(2)} mi  ${cur.w}×${cur.h}`;
  drawMini();
}

let frameN = 0, fpsT = performance.now(), fpsC = 0, last = performance.now(), warm = true;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (S.frameCap > 0 && S.frameCap < 120) {
    if (now - lastRender < 1000 / S.frameCap) return;
    lastRender = now;
  }
  updateInput(dt);
  if (!started && isEngineTestActive()) {
    const tv = engineTestSpeed();
    updateAudio(900 + tv * 6100, tv > 0.03 ? 0.8 : 0, tv * 270, 0, Math.min(5, Math.floor(tv * 6)));
  }
  if (started && !paused) {
    const n = Math.max(1, Math.ceil(dt / 0.01)); for (let i = 0; i < n; i++) car.step(dt / n, input);
    hours = (hours + dt / 60) % 24; if (car.impact > 2) shake = Math.min(0.5, car.impact * 0.03);
    updateAudio(car.rpm, input.gas, car.kmh, car.impact, car.gear);
    traffic.update(dt, car.x, car.z);
    // Keep the player from ghost-driving through traffic (outside car.js).
    for (const t of traffic.cars) {
      if (t.px === undefined) continue;
      const dx = car.x - t.px, dz = car.z - t.pz, d2 = dx * dx + dz * dz;
      if (d2 < 3.4 * 3.4 && d2 > 1e-6) {
        const d = Math.sqrt(d2), nx = dx / d, nz = dz / d;
        car.x = t.px + nx * 3.4; car.z = t.pz + nz * 3.4;
        const vn = car.vx * nx + car.vz * nz;
        if (vn < 0) { car.vx -= vn * nx; car.vz -= vn * nz; }
        shake = Math.min(0.3, shake + 0.08);
      }
    }
    const drifting = input.hand && car.speed > 8, burnout = input.gas > 0 && input.brake > 0 && car.speed < 5;
    if (drifting || burnout) {
      const fx = Math.sin(car.h), fz = Math.cos(car.h), sx = Math.cos(car.h), sz = -Math.sin(car.h);
      for (const s of [-0.8, 0.8]) puff(car.x - fx * 1.35 + sx * s, car.y + 0.4, car.z - fz * 1.35 + sz * s, burnout);
      if (drifting) { driftScore += dt * car.speed * 0.6; driftBest = Math.max(driftBest, driftScore); }
    }
    setScreech(drifting || burnout ? 1 : 0);
    updateSmoke(dt);
  } else setScreech(0);
  world.update(car.x, car.z, warm ? 40 : 6);
  if (warm && world.cells.size >= 9) warm = false;
  updateLighting(); updateCamera(dt);
  renderer.render(scene, camera);
  if (mapOpen && ++mapN % 12 === 0) drawMap();
  if (++frameN % 4 === 0) hud();
  fpsC++;
  if (now - fpsT > 500) {
    const fpsVal = Math.round(fpsC * 1000 / (now - fpsT));
    if (S.fps) $("fps").textContent = fpsVal + " FPS";
    fpsC = 0; fpsT = now;
    if (S.autoQ && started && !paused && fpsVal > 0 && fpsVal < 38) {
      if (++lowCount >= 10) {
        lowCount = 0;
        const order = ["low", "medium", "high", "ultra"], idx = order.indexOf(S.preset);
        if (idx > 0) {
          S.preset = order[idx - 1]; Object.assign(S, PRESETS[S.preset]);
          apply(); sync(); badge("Auto quality → " + S.preset.toUpperCase());
        }
      }
    } else lowCount = 0;
  }
}
requestAnimationFrame(frame);
window.__game = { car, world, S, scene, renderer, traffic, input, start: startDrive, setPaused, isPaused: () => paused };
