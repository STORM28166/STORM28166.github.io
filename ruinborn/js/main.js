// RUINBORN — vertical slice. Everything is procedural: no external assets.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildWorld, MAP, R } from './world.js';
import * as TX from './textures.js';
import { Sound } from './audio.js';
import { G, setMode, getMode, MenuNav, rumble, setRumble, padGlyph } from './ui.js';
import { buildPlayer, setGear, animatePlayer, applyLook, SKIN_TONES, HAIR_STYLES, HAIR_COLORS, DEFAULT_LOOK, HAIRS, hairFor } from './player.js';
import * as AS from './assets.js';
import * as CR from './creatures.js';
{ const pa = document.getElementById('pressany'); const t0 = pa ? pa.textContent : ''; if (pa) pa.textContent = 'LOADING SURVIVORS 0%';
  try { await AS.loadAll(f => { if (pa) pa.textContent = 'LOADING SURVIVORS ' + Math.round(f * 100) + '%'; }); } catch (e) { console.error('asset load failed', e); }
  if (pa) pa.textContent = t0; }
import { initTouch } from './touch.js';

const V3 = THREE.Vector3, $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- settings & difficulty
const DIFFS = {
  chill: { label: 'Chill', dmg: 0.5, drain: 0.6, mhp: 0.8, raid: 0.6, spawn: 0.7, rank: 0 },
  normal: { label: 'Normal', dmg: 1, drain: 1, mhp: 1, raid: 1, spawn: 1, rank: 1 },
  brutal: { label: 'Brutal', dmg: 1.6, drain: 1.4, mhp: 1.3, raid: 1.6, spawn: 1.4, rank: 2 },
};
const isIPad = /iPad/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isPhone = /iPhone|Android.+Mobile/.test(navigator.userAgent);
const settings = Object.assign({ aimAssist: true, rumble: true, sens: 1, invertY: false, volume: 0.7, camera: 'third', quality: isPhone ? 'medium' : 'high', showFps: false }, JSON.parse(localStorage.getItem('ruinborn.settings') || '{}'));
const saveSettings = () => localStorage.setItem('ruinborn.settings', JSON.stringify(settings));
let difficulty = 'normal', DIFF = DIFFS.normal;

// ---------------------------------------------------------------- renderer / scene
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x9aa69c, 0.014);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 600); camera.rotation.order = 'YXZ'; scene.add(camera);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.5, 0.55, 0.9); composer.addPass(bloom);
composer.addPass(new OutputPass());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); });

const sound = new Sound(); sound.vol = settings.volume;

// ---------------------------------------------------------------- lights & sky
const hemi = new THREE.HemisphereLight(0xbfd4e0, 0x3a4a2a, 0.8); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 3); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 320 });
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; scene.add(sun, sun.target);
const skyMat = new THREE.ShaderMaterial({
  uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new V3(0, 1, 0) }, sunCol: { value: new THREE.Color() }, moonDir: { value: new V3() }, night: { value: 0 } },
  vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform vec3 top,bottom,sunDir,sunCol,moonDir; uniform float night; varying vec3 vP;
    void main(){ float h = clamp(vP.y*1.6+0.05,0.,1.); vec3 c = mix(bottom, top, pow(h,0.6));
      float s = max(dot(vP,sunDir),0.); c += sunCol*(pow(s,900.)*6.0 + pow(s,12.)*0.35 + pow(s,3.)*0.08);
      float m = max(dot(vP,moonDir),0.); c += vec3(0.6,0.7,0.9)*(pow(m,1500.)*2.0 + pow(m,40.)*0.06)*night;
      gl_FragColor = vec4(c,1.); }`,
  side: THREE.BackSide, depthWrite: false, fog: false,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 32, 16), skyMat); sky.renderOrder = -10; scene.add(sky);
const stars = (() => { const n = 1600, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const v = new V3(R(-1, 1), R(0.05, 1), R(-1, 1)).normalize().multiplyScalar(430); p.set([v.x, v.y, v.z], i * 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, sizeAttenuation: false, color: 0xdde6ff, transparent: true, opacity: 0, fog: false, depthWrite: false })); })();
scene.add(stars);

// ---------------------------------------------------------------- world
const W = buildWorld(scene);
const colliders = W.colliders;
const glowTex = W.tex.glow;

// god rays: soft additive shafts aligned with the sun, slotted between towers
const rayMat = new THREE.ShaderMaterial({
  uniforms: { col: { value: new THREE.Color(0xffd9a0) }, op: { value: 0.2 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  vertexShader: 'varying vec3 vN; varying vec3 vV; varying float vY; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = normalize(-mv.xyz); vY = uv.y; gl_Position = projectionMatrix*mv; }',
  fragmentShader: 'uniform vec3 col; uniform float op; varying vec3 vN; varying vec3 vV; varying float vY; void main(){ float e = pow(abs(dot(vN,vV)),2.5); float f = smoothstep(0.,0.35,vY)*smoothstep(1.,0.55,vY); gl_FragColor = vec4(col*e*f*op,1.); }',
});
const rays = [];
for (let i = 0; i < 22; i++) {
  let x, z, k = 0; do { x = R(-95, 95); z = R(-95, 95); k++; } while (W.inside(x, z, 3) && k < 30);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(R(1.5, 3), R(3, 6), 90, 20, 1, true), rayMat); m.userData.base = new V3(x, 0, z); m.frustumCulled = false; scene.add(m); rays.push(m);
}
// floating dust / fireflies
const motes = (() => { const n = 700, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) p.set([R(-35, 35), R(0, 14), R(-35, 35)], i * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, map: glowTex, color: 0xfff2d0, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending })); m.frustumCulled = false; return m; })();
scene.add(motes);

// ---------------------------------------------------------------- light pools (fixed count => no shader recompiles)
function mkPoint(c, i, d) { const l = new THREE.PointLight(c, 0, d, 2); scene.add(l); return l; }
const muzzleLight = mkPoint(0xffc070, 0, 14);
const droneLight = mkPoint(0x60e0ff, 0, 7);
const firePool = [mkPoint(0xff8a3a, 0, 22), mkPoint(0xff8a3a, 0, 22)];
const spotPool = [];
for (let i = 0; i < 4; i++) { const s = new THREE.SpotLight(0xffc98a, 0, 60, 0.75, 0.55, 1.6); scene.add(s, s.target); spotPool.push({ light: s, used: false }); }
const flashlight = new THREE.SpotLight(0xfff1d6, 0, 50, 0.42, 0.5, 1.8); camera.add(flashlight); flashlight.position.set(0.1, 0, -0.9); flashlight.target.position.set(0, 0, -10); camera.add(flashlight.target);

// ---------------------------------------------------------------- particles & tracers
class Particles {
  constructor(n, size, additive) {
    this.n = n; this.i = 0; this.pos = new Float32Array(n * 3).fill(-999); this.col = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n); this.base = new Float32Array(n * 3);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ size, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, alphaTest: additive ? 0 : 0.2 }));
    this.points.frustumCulled = false; this.additive = additive; scene.add(this.points);
  }
  emit(p, v, color, life, grav = 9) {
    const i = this.i; this.i = (this.i + 1) % this.n; const c = new THREE.Color(color);
    this.pos.set([p.x, p.y, p.z], i * 3); this.vel.set([v.x, v.y, v.z], i * 3); this.base.set([c.r, c.g, c.b], i * 3); this.col.set([c.r, c.g, c.b], i * 3); this.life[i] = this.max[i] = life; this.grav[i] = grav;
  }
  burst(p, n, color, speed, life, grav = 9, up = 0) { for (let k = 0; k < n; k++) this.emit(p, new V3(R(-1, 1), R(-0.3, 1) + up, R(-1, 1)).normalize().multiplyScalar(speed * R(0.4, 1)), Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color, life * R(0.6, 1.2), grav); }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue; this.life[i] -= dt; const j = i * 3;
      if (this.life[i] <= 0) { this.pos[j + 1] = -999; continue; }
      this.vel[j + 1] -= this.grav[i] * dt; this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      if (this.pos[j + 1] < 0.03) { this.pos[j + 1] = 0.03; this.vel[j] *= 0.6; this.vel[j + 2] *= 0.6; this.vel[j + 1] *= -0.3; }
      const f = this.additive ? this.life[i] / this.max[i] : 1; this.col[j] = this.base[j] * f; this.col[j + 1] = this.base[j + 1] * f; this.col[j + 2] = this.base[j + 2] * f;
    }
    this.points.geometry.attributes.position.needsUpdate = true; this.points.geometry.attributes.color.needsUpdate = true;
  }
}
const sparks = new Particles(900, 0.22, true);
const debris = new Particles(900, 0.28, false);

const tracerGeo = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true); tracerGeo.translate(0, 0.5, 0);
const tracers = [];
function tracer(a, b, color = 0xffd27a, width = 0.018, life = 0.06) {
  let t = tracers.find(t => t.life <= 0);
  if (!t) { t = { mesh: new THREE.Mesh(tracerGeo, new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })), life: 0 }; scene.add(t.mesh); tracers.push(t); }
  const d = b.clone().sub(a), len = d.length(); t.mesh.position.copy(a); t.mesh.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); t.mesh.scale.set(width, len, width);
  t.mesh.material.color.set(color); t.mesh.material.opacity = 1; t.mesh.visible = true; t.life = t.max = life;
}
function updateTracers(dt) { for (const t of tracers) if (t.life > 0) { t.life -= dt; t.mesh.material.opacity = Math.max(0, t.life / t.max); if (t.life <= 0) t.mesh.visible = false; } }

// ---------------------------------------------------------------- player state
const EYE = 1.65;
const P = { pos: new V3(0, 0, 7), vel: new V3(), yaw: 0, pitch: 0, onGround: true, hp: 100, hunger: 85, thirst: 80, stam: 100, exhausted: false, sick: false, wellFed: 0,
  dead: false, clip: 24, reserve: 60, reloading: 0, fireCD: 0, recoil: 0, light: false, staminaDelay: 0, bob: 0, shake: 0, hurtFlash: 0, dmgTick: 0, ads: 0, sprinting: false, mount: null };
const PLAYER = { kind: 'player' };
const inv = { scrap: 14, meat: 2, meal: 0, water: 2, meds: 1, parts: 0, veg: 0, seeds: 2 };
const ITEM_NAMES = { scrap: 'Scrap', meat: 'Raw Meat', meal: 'Cooked Meal', water: 'Water', meds: 'Medicine', parts: 'Mutant Parts', veg: 'Vegetables', seeds: 'Seeds' };
const gear = { head: null, torso: null, legs: null };
const RARITY = [
  { n: 'Common', c: '#b9b9b0', w: 50, a: 1 }, { n: 'Uncommon', c: '#6fd46a', w: 28, a: 2 }, { n: 'Rare', c: '#4fa3ff', w: 14, a: 4 },
  { n: 'Epic', c: '#b86bff', w: 6, a: 6 }, { n: 'Legendary', c: '#ffc23d', w: 2, a: 9 }];
const CLOTH = { head: ['Rag Hood', 'Patched Beanie', 'Riot Helmet', 'Plated Visor', 'Gasmask Rig'], torso: ['Torn Shirt', 'Patched Jacket', 'Plated Vest', 'Chitin Harness', 'Scavver Duster'], legs: ['Ripped Jeans', 'Cargo Pants', 'Plated Greaves', 'Strapped Joggers'] };
const UNIQUE = ['Glowing trim: +10% move speed', 'Vine-woven: +regen', 'Chitin-lined: -10% charge damage'];
function rollClothing() {
  const slot = ['head', 'torso', 'legs'][(Math.random() * 3) | 0]; let r = Math.random() * 100, ri = 0;
  for (let i = 0; i < RARITY.length; i++) { r -= RARITY[i].w; if (r <= 0) { ri = i; break; } }
  const names = CLOTH[slot]; return { slot, name: names[(Math.random() * names.length) | 0], rarity: ri, armor: RARITY[ri].a + ((Math.random() * 2) | 0), warmth: 1 + ri + ((Math.random() * 3) | 0), effect: ri === 4 ? UNIQUE[(Math.random() * 3) | 0] : null };
}
function armorTotal() { let a = 0; const items = Object.values(gear).filter(Boolean); items.forEach(g => a += g.armor); if (items.length === 3 && items.every(g => g.rarity === items[0].rarity) && items[0].rarity >= 1) a *= 1.15; return a; }
const setBonus = () => { const it = Object.values(gear); return it.every(Boolean) && it.every(g => g.rarity === it[0].rarity) && it[0].rarity >= 1 ? RARITY[it[0].rarity].n + ' set: +15% armor' : null; };
const hasEffect = s => Object.values(gear).some(g => g && g.effect && g.effect.startsWith(s));

// ---------------------------------------------------------------- first-person viewmodel
const vm = new THREE.Group(); camera.add(vm); vm.position.set(0.24, -0.22, -0.45);
const gunMetal = new THREE.MeshStandardMaterial({ color: 0x2a2d2e, metalness: 0.75, roughness: 0.45 });
const gunRust = new THREE.MeshStandardMaterial({ map: W.tex.rust, metalness: 0.4, roughness: 0.7 });
const clothMat = new THREE.MeshStandardMaterial({ color: 0x8a7a5a, roughness: 1 });
const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x5a4a38, roughness: 1, emissive: 0x000000 });
const skinMat = new THREE.MeshStandardMaterial({ color: 0x9a7560, roughness: 0.9 });
const vmParts = [
  [new THREE.BoxGeometry(0.07, 0.09, 0.42), gunMetal, [0, 0, 0]], [new THREE.CylinderGeometry(0.016, 0.016, 0.36, 8).rotateX(Math.PI / 2), gunMetal, [0, 0.015, -0.36]],
  [new THREE.BoxGeometry(0.06, 0.12, 0.05), gunRust, [0, -0.09, -0.06]], [new THREE.BoxGeometry(0.055, 0.08, 0.2), gunRust, [0, -0.02, 0.25]],
  [new THREE.BoxGeometry(0.075, 0.05, 0.12), clothMat, [0, 0.0, -0.17]], [new THREE.BoxGeometry(0.04, 0.045, 0.1), gunMetal, [0, 0.07, -0.02]],
];
vmParts.forEach(([g, m, p]) => { const o = new THREE.Mesh(g, m); o.position.set(...p); vm.add(o); });
const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); dot.position.set(0, 0.07, -0.075); vm.add(dot);
const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.42), sleeveMat); sleeve.position.set(0.03, -0.12, 0.28); sleeve.rotation.x = 0.5; vm.add(sleeve);
const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.1), skinMat); hand.position.set(0, -0.08, 0.06); vm.add(hand);
const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.015, -0.56); vm.add(muzzle);
const flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb050, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); flashSprite.scale.set(0.25, 0.25, 1); flashSprite.visible = false; muzzle.add(flashSprite);
vm.traverse(o => { if (o.isMesh) o.castShadow = false; });
function refreshSleeve() { const t = gear.torso; sleeveMat.color.set(t ? RARITY[t.rarity].c : '#5a4a38').multiplyScalar(t ? 0.55 : 1); sleeveMat.emissive.set(t && t.rarity >= 3 ? RARITY[t.rarity].c : '#000').multiplyScalar(0.35); }

// ---------------------------------------------------------------- drone companion
const drone = (() => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), new THREE.MeshStandardMaterial({ color: 0x30363a, metalness: 0.8, roughness: 0.35 })); g.add(body);
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x113344, emissive: 0x40d8ff, emissiveIntensity: 2.2 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 24), ringMat); ring.rotation.x = Math.PI / 2; g.add(ring);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0x9ff4ff })); eye.position.z = -0.14; g.add(eye);
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.02, 0.04), body.material); arm.position.x = s * 0.24; g.add(arm); const rot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.01, 12), new THREE.MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.25 })); rot.position.set(s * 0.38, 0.03, 0); g.add(rot); }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x40d8ff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 })); halo.scale.set(0.6, 0.6, 1); g.add(halo);
  g.scale.setScalar(0.75); scene.add(g); return { g, ringMat, eye, cd: 0, laser: false, pos: g.position, target: null };
})();
const bolts = [];
const boltGeo = new THREE.SphereGeometry(0.07, 8, 6);
function fireBolt(from, target) {
  let b = bolts.find(b => !b.alive);
  if (!b) { const m = new THREE.Mesh(boltGeo, new THREE.MeshBasicMaterial({ color: 0x8ff0ff })); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x40d8ff, blending: THREE.AdditiveBlending, depthWrite: false })); s.scale.set(0.6, 0.6, 1); m.add(s); scene.add(m); b = { mesh: m }; bolts.push(b); }
  b.alive = true; b.mesh.visible = true; b.mesh.position.copy(from); b.target = target; b.life = 1.2; b.vel = aimPoint(target).sub(from).normalize().multiplyScalar(42);
}

// ---------------------------------------------------------------- structures
const structs = []; let core = null;
const scrapMat = new THREE.MeshStandardMaterial({ map: W.tex.scrap, roughness: 0.75, metalness: 0.5 });
const darkMetal = new THREE.MeshStandardMaterial({ color: 0x24282a, metalness: 0.8, roughness: 0.5 });
const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
const SDEF = {
  wall: { name: 'Scrap Wall', hp: 250, fp: [2, 0.3], radius: 1.2 }, turret: { name: 'Auto Turret', hp: 160, fp: [0.6, 0.6], radius: 0.7 },
  campfire: { name: 'Campfire', hp: 60, fp: null, radius: 0.6 }, floodlight: { name: 'Floodlight', hp: 80, fp: [0.3, 0.3], radius: 0.4 }, core: { name: 'Base Core', hp: 600, fp: [1.2, 1.2], radius: 1.4 },
};
const STRUCT_MESH = {}, STRUCT_UPD = {};
function makeStructMesh(type) {
  if (STRUCT_MESH[type]) return STRUCT_MESH[type]();
  const g = new THREE.Group();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  if (type === 'wall') {
    add(new THREE.BoxGeometry(4, 2.6, 0.3), scrapMat, 0, 1.3, 0);
    for (const x of [-1.9, 0, 1.9]) add(new THREE.BoxGeometry(0.16, 2.9, 0.45), darkMetal, x, 1.45, 0);
    add(new THREE.BoxGeometry(4.4, 0.14, 0.14), darkMetal, 0, 1.2, 0.2, 0, 0, 0.5);
    for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(R(0.6, 1.2), R(0.5, 0.9), 0.05), gunRust, R(-1.4, 1.4), R(0.5, 2.1), 0.17);
    for (let i = 0; i < 7; i++) add(new THREE.ConeGeometry(0.06, 0.5, 4), darkMetal, -1.8 + i * 0.6, 2.8, 0);
  } else if (type === 'turret') {
    add(new THREE.CylinderGeometry(0.35, 0.5, 0.7, 8), darkMetal, 0, 0.35, 0);
    for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(0.08, 0.9, 0.08), darkMetal, Math.cos(i * 2.1) * 0.45, 0.3, Math.sin(i * 2.1) * 0.45, Math.sin(i * 2.1) * 0.5, 0, -Math.cos(i * 2.1) * 0.5);
    const head = new THREE.Group(); head.rotation.order = 'YXZ'; head.position.y = 0.95; g.add(head);
    const hb = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.6), scrapMat); hb.castShadow = true; head.add(hb);
    const br = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.8, 8).rotateX(Math.PI / 2), darkMetal); br.position.set(0.1, 0.02, 0.6); head.add(br);
    const br2 = br.clone(); br2.position.x = -0.1; head.add(br2);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05), new THREE.MeshBasicMaterial({ color: 0xff3030 })); eye.position.set(0, 0.12, 0.31); head.add(eye);
    const laser = new THREE.Mesh(tracerGeo, laserMat); laser.rotation.x = Math.PI / 2; laser.position.set(0, 0.12, 0.31); laser.scale.set(0.008, 25, 0.008); head.add(laser);
    g.userData.head = head; g.userData.laser = laser;
  } else if (type === 'campfire') {
    const stone = new THREE.MeshStandardMaterial({ color: 0x55534d, roughness: 1, flatShading: true });
    for (let i = 0; i < 9; i++) add(new THREE.DodecahedronGeometry(0.16), stone, Math.cos(i / 9 * 6.28) * 0.55, 0.08, Math.sin(i / 9 * 6.28) * 0.55);
    const wood = new THREE.MeshStandardMaterial({ color: 0x3b2a1c, roughness: 1 });
    for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.06, 0.07, 0.9), wood, 0, 0.18, 0, 1.3, i * 1.05, 0);
    const f1 = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0xff7a20, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })); f1.position.y = 0.5; g.add(f1);
    const f2 = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 8), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); f2.position.y = 0.4; g.add(f2);
    g.userData.flames = [f1, f2];
  } else if (type === 'floodlight') {
    add(new THREE.CylinderGeometry(0.08, 0.12, 6, 8), darkMetal, 0, 3, 0);
    add(new THREE.BoxGeometry(1.4, 0.1, 0.1), darkMetal, 0, 5.9, 0);
    const lamp = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffd9a0, emissiveIntensity: 0 });
    for (const x of [-0.5, 0.5]) add(new THREE.BoxGeometry(0.45, 0.35, 0.25), lamp, x, 6.1, 0.1, 0.5);
    g.userData.lamp = lamp;
  } else if (type === 'core') {
    add(new THREE.BoxGeometry(2.4, 0.5, 2.4), darkMetal, 0, 0.25, 0);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new THREE.BoxGeometry(0.14, 2.2, 0.14), scrapMat, x, 1.4, z);
    add(new THREE.BoxGeometry(2.3, 0.2, 2.3), scrapMat, 0, 2.5, 0);
    const glow = new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff8a2a, emissiveIntensity: 1.1 });
    add(new THREE.CylinderGeometry(0.35, 0.35, 1.7, 16), glow, 0, 1.35, 0);
    add(new THREE.CylinderGeometry(0.04, 0.04, 2.5), darkMetal, 0.8, 3.7, 0.8);
    const blink = new THREE.Mesh(new THREE.SphereGeometry(0.08), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); blink.position.set(0.8, 5, 0.8); g.add(blink);
    g.userData.glow = glow; g.userData.blink = blink;
  }
  return g;
}
function footprint(type, x, z, rot) { const fp = SDEF[type].fp; if (!fp) return null; const swap = Math.round(rot / (Math.PI / 2)) % 2 !== 0; const hx = swap ? fp[1] : fp[0], hz = swap ? fp[0] : fp[1]; return [x - hx, x + hx, z - hz, z + hz]; }
function createStruct(type, x, z, rot = 0) {
  const g = makeStructMesh(type); g.position.set(x, 0, z); g.rotation.y = rot; scene.add(g);
  const s = { kind: 'struct', type, group: g, pos: g.position, hp: SDEF[type].hp, maxHp: SDEF[type].hp, radius: SDEF[type].radius, cd: 0, destroyed: false };
  const fp = footprint(type, x, z, rot); if (fp) { s.collider = W.addCollider(...fp, type === 'wall' ? 2.8 : 2.5, 'struct', s); }
  if (type === 'campfire') { const l = firePool.find(l => !l.userData.used); if (l) { l.userData.used = true; s.light = l; l.position.set(x, 1, z); } }
  if (type === 'floodlight') { const sp = spotPool.find(s => !s.used); if (sp) { sp.used = true; s.spot = sp; sp.light.position.set(x, 6.1, z); const f = new V3(0, 0, 1).applyAxisAngle(new V3(0, 1, 0), rot); sp.light.target.position.set(x + f.x * 14, 0, z + f.z * 14); } }
  if (type === 'core') core = s;
  structs.push(s); return s;
}
function hurtStruct(s, dmg) {
  if (s.destroyed) return; s.hp -= dmg; s.flash = 0.15;
  if (s === core && (!s.warned || now - s.warned > 6)) { s.warned = now; toast('⚠ Your base core is under attack!', '#ff7a5a'); }
  if (s.hp <= 0) destroyStruct(s);
}
function destroyStruct(s) {
  s.destroyed = true; scene.remove(s.group); const i = colliders.indexOf(s.collider); if (i >= 0) colliders.splice(i, 1); structs.splice(structs.indexOf(s), 1);
  if (s.light) { s.light.intensity = 0; s.light.userData.used = false; } if (s.spot) { s.spot.light.intensity = 0; s.spot.used = false; }
  debris.burst(new V3(s.pos.x, 1, s.pos.z), 40, [0x5e5a52, 0x6b3d22, 0x333333], 6, 1.4, 12); sound.boom(); if (s.pos.distanceTo(P.pos) < 30) rumble(pad, 0.8, 0.6, 300);
  if (s === core) { core = null; banner('YOUR BASE HAS FALLEN', 'Not game over. Craft a new Base Core anywhere and rebuild stronger.'); raidActive = false; for (const m of mutants) m.raid = false; }
  else toast(SDEF[s.type].name + ' destroyed', '#ff7a5a');
}
// starting camp in the plaza
createStruct('core', 0, 0, 0);
createStruct('floodlight', -6, -5, Math.PI * 0.75);
createStruct('floodlight', 6, 5, -Math.PI * 0.25);
createStruct('campfire', 3.5, -2.5);
(() => { // bedroll + tarp + crates dressing
  const bed = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 2), new THREE.MeshStandardMaterial({ color: 0x5a4a3a, roughness: 1 })); bed.position.set(-3.5, 0.06, 3.2); bed.rotation.y = 0.3; bed.receiveShadow = true; scene.add(bed);
})();
const BED = new V3(-3.5, 0, 3.2);

// ---------------------------------------------------------------- mutants
const SPECIES = {
  ravager: { name: 'Ravager', hp: 170, speed: 3.4, dmg: 16, reach: 2.4, atkCD: 1.4, aggro: 32, radius: 1.3, food: 'meat', w: [0.3, 0.25],
    desc: 'Hulking, vine-wrapped beast. Rears up, then charges through rubble in a straight line. Sidestep it.', tame: 'Weaken it, then feed it Raw Meat.' },
  thornling: { name: 'Thornling', hp: 55, speed: 6.2, dmg: 8, reach: 1.5, atkCD: 0.7, aggro: 16, radius: 0.55, food: 'water', w: [0.45, 0.3],
    desc: 'A burrowing plant. Travels unseen underground and bursts out in a spray of dirt and petals. Tunnels under walls.', tame: 'Weaken it, then give it Water.' },
  hollow: { name: 'Hollow', hp: 95, speed: 6.8, dmg: 14, reach: 2.1, atkCD: 1.1, aggro: 42, radius: 0.55, food: 'meal', w: [0.25, 0.45],
    desc: 'Gaunt fog-stalker with hollow glowing eyes. Freezes while you watch it. Never look away.', tame: 'Weaken it, then offer a Cooked Meal.' },
};
const bestiary = { ravager: { seen: false, tamed: 0 }, thornling: { seen: false, tamed: 0 }, hollow: { seen: false, tamed: 0 } };
const mutants = [];
function stdMat(color, opts = {}) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, flatShading: true }, opts)); }
function buildRavager() {
  const body = new THREE.Group(), legs = [];
  const skin = stdMat(0x4a3a2c), vine = stdMat(0x2f5a22), bone = stdMat(0xcfc3a8, { roughness: 0.6 });
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, parent = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; };
  add(new THREE.SphereGeometry(1, 12, 9), skin, 0, 1.55, 0, 1.15, 0.95, 1.6);
  add(new THREE.SphereGeometry(1, 10, 8), skin, 0, 2.2, -0.2, 0.9, 0.7, 1.0);
  const head = new THREE.Group(); head.position.set(0, 1.55, 1.65); body.add(head);
  add(new THREE.BoxGeometry(0.95, 0.75, 1.0), skin, 0, 0, 0.2, 1, 1, 1, head);
  const jaw = add(new THREE.BoxGeometry(0.85, 0.22, 0.85), skin, 0, -0.45, 0.25, 1, 1, 1, head);
  for (const s of [-1, 1]) { const h = add(new THREE.ConeGeometry(0.12, 0.8, 6), bone, s * 0.45, 0.45, 0.1, 1, 1, 1, head); h.rotation.set(-0.6, 0, s * -0.5);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xffa030 })); e.position.set(s * 0.28, 0.12, 0.71); head.add(e); }
  for (let i = 0; i < 6; i++) { const sp = add(new THREE.ConeGeometry(0.13, R(0.5, 0.9), 5), bone, R(-0.3, 0.3), 2.75 - i * 0.05, 0.6 - i * 0.35); sp.rotation.x = -0.4; }
  for (let i = 0; i < 4; i++) { const t = add(new THREE.TorusGeometry(R(1.1, 1.35), 0.07, 5, 18), vine, 0, 1.6, R(-0.9, 0.9)); t.rotation.set(R(-0.3, 0.3), R(-0.3, 0.3), 0); }
  for (let i = 0; i < 10; i++) add(new THREE.IcosahedronGeometry(0.18, 0), vine, R(-1.1, 1.1), R(1.2, 2.4), R(-1.4, 1.4), 1, 0.5, 1);
  for (const [x, z] of [[0.75, 0.9], [-0.75, 0.9], [0.75, -0.9], [-0.75, -0.9]]) {
    const l = new THREE.Group(); l.position.set(x, 1.25, z); body.add(l); add(new THREE.CylinderGeometry(0.26, 0.18, 1.3, 7), skin, 0, -0.6, 0, 1, 1, 1, l); legs.push(l);
  }
  return { body, legs, head, jaw, mats: [skin, vine], hit: [[0, 1.6, 0, 1.25, 1], [0, 1.55, 1.75, 0.6, 1.6]], height: 3 };
}
function buildThornling() {
  const body = new THREE.Group(), legs = [];
  const stem = stdMat(0x3b5a24), petal = stdMat(0xd2507e, { side: THREE.DoubleSide }), thorn = stdMat(0x9a8a5a);
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; body.add(m); return m; };
  add(new THREE.SphereGeometry(0.42, 10, 8), stem, 0, 0.72, 0, 1, 1.25, 1);
  const head = new THREE.Group(); head.position.y = 1.18; body.add(head);
  for (let i = 0; i < 7; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 4), petal); p.scale.set(0.5, 0.12, 1); const a = i / 7 * 6.28; p.position.set(Math.cos(a) * 0.25, 0, Math.sin(a) * 0.25); p.rotation.set(0, -a + Math.PI / 2, 0.5); p.rotation.order = 'YXZ'; head.add(p); }
  const c = new THREE.Mesh(new THREE.SphereGeometry(0.12), new THREE.MeshStandardMaterial({ color: 0x664400, emissive: 0xffd040, emissiveIntensity: 1.6 })); head.add(c);
  for (let i = 0; i < 12; i++) { const t = add(new THREE.ConeGeometry(0.04, 0.22, 4), thorn, 0, 0.72, 0); const d = new V3(R(-1, 1), R(-0.6, 1), R(-1, 1)).normalize(); t.position.add(d.clone().multiplyScalar(0.45)); t.quaternion.setFromUnitVectors(new V3(0, 1, 0), d); }
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; const l = new THREE.Group(); l.position.set(Math.cos(a) * 0.25, 0.45, Math.sin(a) * 0.25); l.rotation.set(Math.sin(a) * 0.7, 0, -Math.cos(a) * 0.7); body.add(l); const r = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.02, 0.7, 5), stem); r.position.y = -0.3; l.add(r); legs.push(l); }
  return { body, legs, head, mats: [stem, petal], hit: [[0, 0.75, 0, 0.55, 1], [0, 1.18, 0, 0.35, 1.8]], height: 1.5 };
}
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xc8fbff, fog: false });
function buildHollow() {
  const body = new THREE.Group(), legs = [];
  const skin = new THREE.MeshStandardMaterial({ color: 0x1b1e22, roughness: 0.55, metalness: 0.1, transparent: true, opacity: 0.92 });
  const add = (geo, x, y, z, parent = body) => { const m = new THREE.Mesh(geo, skin); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  const torso = new THREE.Group(); torso.position.y = 1.3; torso.rotation.x = 0.35; body.add(torso);
  add(new THREE.BoxGeometry(0.42, 1.05, 0.26), 0, 0.5, 0, torso);
  for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.5, 0.04, 0.3), 0, 0.2 + i * 0.18, 0.02, torso);
  const head = new THREE.Group(); head.position.set(0, 1.25, 0.12); torso.add(head);
  const hm = add(new THREE.SphereGeometry(0.2, 10, 8), 0, 0, 0, head); hm.scale.set(0.8, 1.35, 0.95);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat); e.position.set(s * 0.075, 0.05, 0.17); head.add(e);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x7ff0ff, blending: THREE.AdditiveBlending, fog: false, depthWrite: false })); gl.scale.set(0.5, 0.5, 1); e.add(gl);
    const arm = new THREE.Group(); arm.position.set(s * 0.27, 0.95, 0); torso.add(arm); const a = add(new THREE.CylinderGeometry(0.05, 0.035, 1.6, 6), 0, -0.8, 0, arm);
    const claw = add(new THREE.ConeGeometry(0.07, 0.3, 4), 0, -1.7, 0.03, arm); claw.rotation.x = Math.PI; legs.push(arm);
    const leg = new THREE.Group(); leg.position.set(s * 0.13, 1.3, 0); body.add(leg); add(new THREE.CylinderGeometry(0.07, 0.045, 1.3, 6), 0, -0.65, 0, leg); legs.push(leg);
  }
  return { body, legs, head, mats: [skin], hit: [[0, 1.8, 0.2, 0.42, 1], [0, 0.8, 0, 0.32, 1], [0, 2.45, 0.55, 0.24, 2.5]], height: 3 };
}
const hpBg = new THREE.SpriteMaterial({ color: 0x000000, opacity: 0.6, transparent: true, fog: false, depthWrite: false });
const BUILDERS = { ravager: () => buildRavager(), thornling: () => buildThornling(), hollow: () => buildHollow() };
function spawnMutant(sp, x, z, opts = {}) {
  const def = SPECIES[sp]; const b = BUILDERS[sp]();
  const g = new THREE.Group(); g.add(b.body); g.position.set(x, 0, z); scene.add(g);
  const alpha = opts.alpha ?? (!def.noTame && Math.random() < 0.06), shiny = opts.shiny ?? (!def.noTame && Math.random() < 0.04);
  const sc = alpha ? 1.6 : 1; g.scale.setScalar(sc);
  if (shiny) b.mats.forEach(m => { m.color.lerp(new THREE.Color(0xd4a640), 0.6); m.emissive = new THREE.Color(0xffb020); m.emissiveIntensity = 0.35; m.metalness = 0.6; });
  const bar = new THREE.Group(); const bg = new THREE.Sprite(hpBg); bg.scale.set(1.2, 0.09, 1); const fg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xd9463b, fog: false, depthWrite: false })); fg.center.set(0, 0.5); fg.position.x = -0.6; fg.scale.set(1.2, 0.07, 1); fg.renderOrder = 2; bar.add(bg, fg); bar.position.y = b.height + 0.4; bar.visible = false; g.add(bar);
  let mound = null;
  if (sp === 'thornling') {
    mound = new THREE.Group(); const mm = new THREE.Mesh(new THREE.SphereGeometry(0.7, 9, 6), stdMat(0x4a3826)); mm.scale.y = 0.25; mm.receiveShadow = true; mound.add(mm);
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.3, 4), stdMat(0x3f6a26)); s.position.set(R(-0.3, 0.3), 0.2, R(-0.3, 0.3)); mound.add(s); }
    g.add(mound);
  }
  const hp = def.hp * DIFF.mhp * (alpha ? 2 : 1);
  const m = { kind: 'mutant', sp, def, g, pos: g.position, b, bar, fg, mound, hp, maxHp: hp, alpha, shiny, scale: sc, state: 'move', t: R(0, 10), cd: 0, raid: !!opts.raid, tamed: false, atBase: false, ko: false,
    wasStunned: false, stunT: 0, yaw: R(0, 6.28), target: null, retarget: 0, chargeCD: 2, stateT: 0, lastHit: -99, wander: R(0, 6.28), wanderT: 0, idleT: 0, stuckT: 0, detourT: 0, detour: 0, bond: 0, seen: false, deadT: 0, frozen: false, shrieked: false, trail: 0 };
  if (sp === 'thornling') { m.state = 'burrowed'; b.body.position.y = -1.6; }
  if (def.init) def.init(m, opts);
  mutants.push(m); return m;
}
const posOf = t => t === PLAYER ? P.pos : t.pos;
const radiusOf = t => t === PLAYER ? 0.4 : t.kind === 'mutant' ? t.def.radius * t.scale : t.radius;
const aliveT = t => t === PLAYER ? !P.dead : t.kind === 'struct' ? !t.destroyed : !t.dead && !(t.tamed && t.ko);
const isThreat = m => !m.dead && !m.tamed && m.state !== 'burrowed' && m.state !== 'stunned';
function aimPoint(m) { const h = m.b.hit[0]; return m.b.body.localToWorld(new V3(h[0], h[1], h[2])); }
function hitSpheres(m) { return m.b.hit.map(h => ({ c: m.b.body.localToWorld(new V3(h[0], h[1], h[2])), r: h[3] * m.scale, mult: h[4] })); }

function damageTarget(t, dmg, src) { if (t === PLAYER) hurtPlayer(dmg, src); else if (t.kind === 'struct') hurtStruct(t, dmg); else damageMutant(t, dmg, src); }
function damageMutant(m, dmg, src) {
  if (m.dead || m.state === 'burrowed') return false;
  if (m.tamed) { if (m.ko) return; m.hp -= dmg; m.lastHit = now; if (m.hp <= 0) koTame(m); return true; }
  m.hp -= dmg; m.lastHit = now; m.bar.visible = true;
  if (src === 'player' || src === 'drone') m.provoked = now;
  debris.burst(aimPoint(m), 6, [0x6aa02a, 0x8acb3a], 3, 0.6, 9);
  if (!m.wasStunned && !m.def.noTame && m.hp <= m.maxHp * 0.25) { m.hp = Math.max(m.hp, 1); stun(m); }
  else if (m.hp <= 0) killMutant(m, src);
  return true;
}
function stun(m) {
  m.wasStunned = true; m.state = 'stunned'; m.stunT = 15; sound.growl(m.sp === 'thornling' ? 2 : 0.8);
  const food = ITEM_NAMES[m.def.food];
  toast(`${m.def.name} is weakened. Feed it ${food} to tame it ${G('interact')}`, '#e6d17a');
}
function killMutant(m, src) {
  m.dead = true; m.state = 'dead'; m.deadT = 0; m.bar.visible = false; sound.growl(m.sp === 'thornling' ? 2.2 : 0.6);
  debris.burst(aimPoint(m), 30, [0x6aa02a, 0x8acb3a, 0x3a5a1a], 5, 1.2, 10);
  const loot = { parts: m.alpha ? 3 : 1 };
  if (m.def.loot) Object.assign(loot, m.def.loot(m)); if (m.def.onDeath) m.def.onDeath(m, src);
  if (m.sp === 'ravager') loot.meat = 2; if (m.sp === 'hollow' && Math.random() < 0.6) loot.meat = 1; if (m.sp === 'thornling' && Math.random() < 0.5) loot.water = 1;
  if (src !== 'turret' || Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 40) { for (const k in loot) inv[k] += loot[k]; toast(`${m.alpha ? 'Alpha ' : ''}${m.shiny ? 'Shiny ' : ''}${m.def.name} down: ` + Object.entries(loot).map(([k, v]) => `+${v} ${ITEM_NAMES[k]}`).join(', ')); }
  if (activeTame && !activeTame.ko && src === 'tame') { activeTame.bond++; if (activeTame.bond === 4 && !activeTame.evolved) toast(`${activeTame.def.name} is ready to evolve. Visit your base core.`, '#b86bff'); }
}
function tameMutant(m) {
  m.tamed = true; m.raid = false; m.state = 'move'; m.hp = m.maxHp; m.b.body.rotation.z = 0; m.fg.material.color.set(0x6fd46a);
  bestiary[m.sp].tamed++;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(m.def.radius * 1.2, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color: 0x6fff6a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; m.g.add(ring); m.ring = ring;
  if (!activeTame) { activeTame = m; toast(`${m.def.name} tamed! It follows you and fights at your side.`, '#6fd46a'); banner('TAMED', `${m.def.name} bonded with you`); }
  else { m.atBase = true; toast(`${m.def.name} tamed! Your party is full (you, one tame, drone), so it guards your base.`, '#6fd46a'); }
  sparks.burst(new V3(m.pos.x, 1.5, m.pos.z), 40, [0x6fff6a, 0xd0ffb0], 4, 1, 2); sound.tame();
}
function koTame(m) {
  m.ko = true; m.hp = 0; m.state = 'ko'; const home = core ? core.pos : P.pos;
  m.pos.set(home.x + R(-3, 3), 0, home.z + R(2.5, 4)); m.b.body.rotation.z = 1.4; m.bar.visible = false;
  toast(`${m.def.name} was knocked out. Revive it at your base core ${G('interact')}.`, '#ff7a5a');
}
let activeTame = null;

// ---------------------------------------------------------------- collision & rays
function resolve(pos, r, opts = {}) {
  let hit = null;
  for (const c of colliders) {
    if (opts.noStructs && c.kind === 'struct') continue;
    if (opts.feet !== undefined && opts.feet > c.h) continue;
    const cx = clamp(pos.x, c.x0, c.x1), cz = clamp(pos.z, c.z0, c.z1); const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; }
    else { const l = pos.x - c.x0, rr = c.x1 - pos.x, b = pos.z - c.z0, f = c.z1 - pos.z, m = Math.min(l, rr, b, f);
      if (m === l) pos.x = c.x0 - r; else if (m === rr) pos.x = c.x1 + r; else if (m === b) pos.z = c.z0 - r; else pos.z = c.z1 + r; }
    hit = c;
  }
  pos.x = clamp(pos.x, -MAP, MAP); pos.z = clamp(pos.z, -MAP, MAP); return hit;
}
function rayBox(o, d, c) {
  let tmin = 0, tmax = 1e9; const lo = [c.x0, 0, c.z0], hi = [c.x1, c.h, c.z1], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) { if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < lo[i] || oo[i] > hi[i]) return Infinity; continue; }
    let t1 = (lo[i] - oo[i]) / dd[i], t2 = (hi[i] - oo[i]) / dd[i]; if (t1 > t2) [t1, t2] = [t2, t1]; tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return Infinity; }
  return tmin;
}
function raySphere(o, d, c, r) { const oc = o.clone().sub(c), b = oc.dot(d), q = oc.lengthSq() - r * r, h = b * b - q; if (h < 0) return Infinity; const t = -b - Math.sqrt(h); return t >= 0 ? t : Infinity; }
function losClear(a, b, ignoreStructs = true) { const d = b.clone().sub(a), len = d.length(); d.normalize(); for (const c of colliders) { if (c.kind !== 'building' && (ignoreStructs || c.kind !== 'struct')) continue; if (rayBox(a, d, c) < len - 0.5) return false; } return true; }
function worldRay(o, d, maxD = 150, skip = null) {
  let best = { t: maxD, m: null };
  for (const c of colliders) { if (c.kind === 'tree') continue; const t = rayBox(o, d, c); if (t < best.t) best = { t, collider: c, m: null }; }
  if (d.y < 0) { const t = -o.y / d.y; if (t < best.t) best = { t, ground: true, m: null }; }
  for (const m of mutants) { if (m.dead || m === skip || m.tamed || m.state === 'burrowed') continue; if (m.pos.distanceToSquared(o) > (best.t + 4) ** 2) continue;
    for (const s of hitSpheres(m)) { const t = raySphere(o, d, s.c, s.r); if (t < best.t) best = { t, m, mult: s.mult }; } }
  best.point = o.clone().addScaledVector(d, best.t); return best;
}

// ---------------------------------------------------------------- mutant AI
let now = 0, nightF = 0, isNight = false;
const camFwd = new V3();
function pickTarget(m) {
  let best = null, bd = Infinity; const night = isNight ? 1.3 : 1;
  const dP = Math.hypot(P.pos.x - m.pos.x, P.pos.z - m.pos.z);
  const aggro = m.def.aggro * night * (m.alpha ? 1.2 : 1);
  if (!P.dead && (dP < aggro || now - (m.provoked || -99) < 10 || (m.raid && dP < 16))) { best = PLAYER; bd = dP; }
  for (const t of mutants) if (t.tamed && !t.ko && !t.dead) { const d = Math.hypot(t.pos.x - m.pos.x, t.pos.z - m.pos.z); if (d < Math.min(aggro, 14) && d < bd) { best = t; bd = d; } }
  if (m.raid && !best) for (const s of structs) { const d = Math.hypot(s.pos.x - m.pos.x, s.pos.z - m.pos.z) * (s === core ? 0.7 : 1); if (d < bd) { best = s; bd = d; } }
  return best;
}
function steer(m, tx, tz, speed, dt, opts = {}) {
  let dx = tx - m.pos.x, dz = tz - m.pos.z; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
  if (m.detourT > 0) { m.detourT -= dt; const a = m.detour; const c = Math.cos(a), s = Math.sin(a); [dx, dz] = [dx * c - dz * s, dx * s + dz * c]; }
  const ox = m.pos.x, oz = m.pos.z; m.pos.x += dx * speed * dt; m.pos.z += dz * speed * dt;
  const hit = resolve(m.pos, m.def.radius * m.scale * 0.8, opts);
  const moved = Math.hypot(m.pos.x - ox, m.pos.z - oz);
  if (speed > 0.5 && moved < speed * dt * 0.3) { m.stuckT += dt; if (m.stuckT > 0.4 && m.detourT <= 0) { m.detour = (Math.random() < 0.5 ? -1 : 1) * R(1.2, 1.7); m.detourT = R(0.8, 1.6); m.stuckT = 0; } } else m.stuckT = 0;
  m.yaw += angDiff(Math.atan2(dx, dz), m.yaw) * Math.min(1, dt * 8); m.moveSpeed = moved / dt;
  return hit;
}
function face(m, tx, tz, dt) { m.yaw += angDiff(Math.atan2(tx - m.pos.x, tz - m.pos.z), m.yaw) * Math.min(1, dt * 8); }
function emerge(m) {
  m.state = 'emerge'; m.stateT = 0.45; sound.burst(); if (m.mound) m.mound.visible = false;
  const p = new V3(m.pos.x, 0.3, m.pos.z);
  debris.burst(p, 45, [0x4a3826, 0x5e4630, 0x2e2418], 7, 1.4, 14, 1.8); debris.burst(p, 30, [0xd2507e, 0xf08ab0, 0xffd040], 4, 2.2, 2.5, 1.5);
  if (Math.hypot(P.pos.x - m.pos.x, P.pos.z - m.pos.z) < 8) { P.shake = 0.4; rumble(pad, 0.6, 0.3, 220); }
}
function animate(m, dt) {
  const sp = m.moveSpeed || 0, f = clamp(sp / 4, 0, 1.4); m.t += dt * (2 + sp * 1.6);
  if (m.sp === 'ravager' && !m.b.legJ) { m.b.legs.forEach((l, i) => l.rotation.x = Math.sin(m.t + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 * f); m.b.jaw.rotation.x = m.state === 'windup' ? 0.5 : Math.max(0, Math.sin(m.t * 0.5)) * 0.15; }
  if (m.sp === 'thornling' && !m.b.petals) { m.b.legs.forEach((l, i) => l.children[0].rotation.x = Math.sin(m.t * 2 + i) * 0.5 * (0.3 + f)); m.b.head.rotation.y += dt * (1 + f * 4); m.b.body.scale.y = 1 + Math.sin(m.t * 2) * 0.06; }
  if (m.sp === 'hollow') { if (!m.b.armJ) m.b.legs.forEach((l, i) => l.rotation.x = Math.sin(m.t + i * Math.PI / 2) * (i % 2 ? 0.7 : 0.35) * f + (m.lunge > 0 && !(i % 2) ? -1.4 : 0));
    m.b.head.rotation.z = m.frozen ? Math.sin(now * 40) * 0.08 : Math.sin(m.t * 0.3) * 0.25; for (const mat of m.b.mats) mat.opacity = 0.78 + 0.16 * Math.sin(now * 9 + m.t) * (isNight ? 1 : 0.4); }
  if (m.def.anim) m.def.anim(m, dt);
  if (m.lunge > 0) m.lunge -= dt;
  m.g.rotation.y = m.yaw;
}
function meleeOrChase(m, t, tp, dist, dt, speed, opts) {
  if (dist > m.def.reach) { const hit = steer(m, tp.x, tp.z, speed, dt, opts); if (hit && hit.kind === 'struct' && !m.tamed && m.cd <= 0) { hurtStruct(hit.ref, m.def.dmg * (m.alpha ? 1.5 : 1)); m.cd = m.def.atkCD; m.lunge = 0.25; debris.burst(new V3(m.pos.x, 1.2, m.pos.z), 6, 0x6b5a4a, 3, 0.5); } }
  else { m.moveSpeed = 0; face(m, tp.x, tp.z, dt); if (m.cd <= 0) { m.cd = m.def.atkCD; m.lunge = 0.25; const bondMul = (m.tamed ? 1 + 0.15 * Math.floor(m.bond / 3) : 1) * (m.dmgMul || 1); damageTarget(t, m.def.dmg * (m.alpha ? 1.5 : 1) * bondMul * (m.tamed ? 1.2 : 1), m.tamed ? 'tame' : 'mutant'); } }
}
function updateMutant(m, dt) {
  if (m.dead) { m.deadT += dt; if (!CR.dieGLB(m.b, dt)) m.b.body.rotation.z = Math.min(1.5, m.deadT * 4); if (m.deadT > 2) m.pos.y -= dt * 0.6; if (m.deadT > 5) { scene.remove(m.g); m.remove = true; } return; }
  m.cd -= dt; m.chargeCD -= dt;
  if (m.bar.visible) { m.fg.scale.x = 1.2 * clamp(m.hp / m.maxHp, 0, 1); if (!m.tamed && m.state !== 'stunned' && now - m.lastHit > 5) m.bar.visible = false; }
  if (!m.seen && !m.dead) { const d = m.pos.distanceTo(P.pos); if (d < 38) { const dir = m.pos.clone().sub(camera.position).normalize(); if (dir.dot(camFwd) > 0.75 && m.state !== 'burrowed') { m.seen = true; if (!bestiary[m.sp].seen) { bestiary[m.sp].seen = true; toast(`Bestiary entry unlocked: ${m.def.name}`, '#9fc48a'); } } } }
  if (m.tamed) return updateTame(m, dt);
  if (m.state === 'stunned') { m.stunT -= dt; m.b.body.rotation.z = lerp(m.b.body.rotation.z, 1.3, dt * 5); m.bar.visible = true; if (m.stunT <= 0) { m.state = 'move'; m.hp = m.maxHp * 0.4; m.b.body.rotation.z = 0; toast(`The ${m.def.name} recovered.`); } return; }
  m.retarget -= dt; if (m.retarget <= 0) { m.target = pickTarget(m); m.retarget = 0.4; }
  let t = m.target; if (t && !aliveT(t)) t = m.target = null;
  const tp = t ? posOf(t) : null; const dist = t ? Math.hypot(tp.x - m.pos.x, tp.z - m.pos.z) - radiusOf(t) : Infinity;
  const D = m.def;
  if (D.ai) { D.ai(m, t, tp, dist, dt); animate(m, dt); return; }
  if (m.sp === 'thornling') {
    if (m.state === 'burrowed') {
      m.b.body.position.y = lerp(m.b.body.position.y, -1.6, dt * 6); if (m.mound) m.mound.visible = true;
      if (t && dist < 2.8) emerge(m);
      else if (t && (dist < D.aggro || m.raid)) { steer(m, tp.x, tp.z, 4.6, dt, { noStructs: true }); m.trail -= dt; if (m.trail <= 0) { m.trail = 0.08; debris.emit(new V3(m.pos.x + R(-.3, .3), 0.1, m.pos.z + R(-.3, .3)), new V3(R(-1, 1), R(1, 3), R(-1, 1)), 0x4a3826, 0.7, 10); } if (m.mound) m.mound.rotation.y += dt * 4; }
      else m.moveSpeed = 0;
      animate(m, dt); return;
    }
    if (m.state === 'emerge') { m.stateT -= dt; m.b.body.position.y = lerp(m.b.body.position.y, 0, dt * 14); if (m.stateT <= 0) { m.state = 'move'; m.b.body.position.y = 0; } animate(m, dt); return; }
    if (!m.raid && (!t || dist > 20)) { m.idleT += dt; if (m.idleT > 6) { m.state = 'burrowed'; m.idleT = 0; debris.burst(new V3(m.pos.x, 0.3, m.pos.z), 20, 0x4a3826, 4, 1, 12); } } else m.idleT = 0;
  }
  if (m.sp === 'ravager') {
    if (m.state === 'windup') { m.stateT -= dt; m.moveSpeed = 0; m.b.body.rotation.x = lerp(m.b.body.rotation.x, -0.35, dt * 8); if (tp) face(m, tp.x, tp.z, dt); if (m.stateT <= 0) { m.state = 'charge'; m.stateT = 1.15; m.chargeHit = false; m.chargeDir = new V3(Math.sin(m.yaw), 0, Math.cos(m.yaw)); } animate(m, dt); return; }
    if (m.state === 'charge') {
      m.stateT -= dt; m.b.body.rotation.x = lerp(m.b.body.rotation.x, 0.18, dt * 10);
      const ox = m.pos.x, oz = m.pos.z; m.pos.addScaledVector(m.chargeDir, 15 * dt); const hit = resolve(m.pos, D.radius * m.scale * 0.8); m.moveSpeed = 15;
      if (Math.random() < 0.6) debris.emit(new V3(m.pos.x + R(-1, 1), 0.2, m.pos.z + R(-1, 1)), new V3(R(-2, 2), R(1, 3), R(-2, 2)), 0x6b6050, 0.8, 8);
      for (const tt of [PLAYER, ...mutants.filter(x => x.tamed && !x.ko)]) { if (!aliveT(tt) || m.chargeHit) continue; const p = posOf(tt); if (Math.hypot(p.x - m.pos.x, p.z - m.pos.z) < D.radius * m.scale + 1.1) { m.chargeHit = true; damageTarget(tt, D.dmg * 2.2 * (hasEffect('Chitin') && tt === PLAYER ? 0.9 : 1), 'charge'); if (tt === PLAYER) { P.vel.addScaledVector(m.chargeDir, 14); P.vel.y = 4; P.onGround = false; } } }
      if (hit || m.stateT <= 0 || Math.hypot(m.pos.x - ox, m.pos.z - oz) < 0.05) { if (hit && hit.kind === 'struct') hurtStruct(hit.ref, 70); if (hit) { P.shake = Math.max(P.shake, m.pos.distanceTo(P.pos) < 15 ? 0.3 : 0); debris.burst(new V3(m.pos.x, 1, m.pos.z), 20, [0x6b6a63, 0x4a3a2c], 5, 1, 12); } m.state = 'move'; m.chargeCD = R(4, 6); m.cd = hit ? 1.5 : 0.6; }
      animate(m, dt); return;
    }
    m.b.body.rotation.x = lerp(m.b.body.rotation.x, 0, dt * 5);
    if (t && dist > 5 && dist < 20 && m.chargeCD <= 0 && losClear(new V3(m.pos.x, 1.5, m.pos.z), new V3(tp.x, 1.5, tp.z))) { m.state = 'windup'; m.stateT = 0.85; sound.growl(0.7); animate(m, dt); return; }
  }
  let speed = D.speed * (m.alpha ? 1.1 : 1);
  if (m.sp === 'hollow') {
    m.frozen = false;
    if (t === PLAYER && dist > 4) { const dir = new V3(m.pos.x, 2.3 * m.scale, m.pos.z).sub(camera.position); const dd = dir.length(); dir.normalize(); if (dir.dot(camFwd) > 0.94 && losClear(camera.position, new V3(m.pos.x, 2.2, m.pos.z))) { m.frozen = true; speed = 0; } }
    if (isNight) speed *= 1.25;
    if (t === PLAYER && dist < 9 && !m.shrieked) { m.shrieked = true; sound.shriek(); }
  }
  if (t) { if (m.frozen) { m.moveSpeed = 0; face(m, tp.x, tp.z, dt); } else meleeOrChase(m, t, tp, dist, dt, speed); }
  else { m.wanderT -= dt; if (m.wanderT <= 0) { m.wander = R(0, 6.28); m.wanderT = R(2, 5); } steer(m, m.pos.x + Math.sin(m.wander) * 5, m.pos.z + Math.cos(m.wander) * 5, speed * 0.25, dt); }
  if (t === PLAYER && Math.random() < dt * 0.15) sound.growl(m.sp === 'thornling' ? 2 : m.sp === 'hollow' ? 1.5 : 0.7);
  animate(m, dt);
}
function updateTame(m, dt) {
  if (P.mount === m) { m.pos.set(P.pos.x, 0, P.pos.z); m.yaw = P.yaw + Math.PI; m.moveSpeed = P.mountSpeed || 0; m.bar.visible = false; animate(m, dt); return; }
  if (m.ko) { m.moveSpeed = 0; m.b.body.rotation.z = 1.4; m.bar.visible = false; return; }
  m.bar.visible = true; m.b.body.position.y = lerp(m.b.body.position.y, 0, dt * 8); if (m.mound) m.mound.visible = false; m.b.body.rotation.x = 0;
  const home = m.atBase && core ? core.pos : P.pos;
  m.retarget -= dt;
  if (m.retarget <= 0) { m.retarget = 0.4; let best = null, bd = m.atBase ? 26 : 18; for (const e of mutants) { if (!isThreat(e)) continue; const d = Math.hypot(e.pos.x - home.x, e.pos.z - home.z); if (d < bd) { bd = d; best = e; } } m.target = best; }
  const t = m.target && aliveT(m.target) && isThreat(m.target) ? m.target : null;
  if (t) { const tp = t.pos; const dist = Math.hypot(tp.x - m.pos.x, tp.z - m.pos.z) - radiusOf(t); meleeOrChase(m, t, tp, dist, dt, m.def.speed * 1.25); }
  else {
    m.hp = Math.min(m.maxHp, m.hp + dt * 3);
    let gx, gz; if (m.atBase) { m.wanderT -= dt; if (m.wanderT <= 0) { m.wander = R(0, 6.28); m.wanderT = R(3, 6); } gx = home.x + Math.sin(m.wander) * 6; gz = home.z + Math.cos(m.wander) * 6; }
    else { const off = (m.followOff || new V3(1.8, 0, 2.5)).clone().applyAxisAngle(new V3(0, 1, 0), P.yaw); gx = P.pos.x + off.x; gz = P.pos.z + off.z; }
    const d = Math.hypot(gx - m.pos.x, gz - m.pos.z);
    if (!m.atBase && d > 45) { m.pos.set(gx, 0, gz); }
    if (d > 1.2) steer(m, gx, gz, Math.min(m.def.speed * 1.4, d * 1.5), dt); else m.moveSpeed = 0;
  }
  m.fg.scale.x = 1.2 * clamp(m.hp / m.maxHp, 0, 1);
  animate(m, dt);
}

// ---------------------------------------------------------------- drone & turret logic
const droneTmp = new V3();
function updateDrone(dt) {
  const right = new V3(Math.cos(P.yaw), 0, -Math.sin(P.yaw)), fwd = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw));
  const want = (thirdPerson() && state === 'play' ? new V3(P.pos.x, P.pos.y + 2.05 + (P.mount ? 2 : 0), P.pos.z).addScaledVector(right, -1.1).addScaledVector(fwd, -0.2) : camera.position.clone().addScaledVector(right, 1.15).addScaledVector(fwd, 2.1).add(new V3(0, 0.8, 0))).add(new V3(0, Math.sin(now * 2.2) * 0.07, 0));
  if (drone.pos.distanceTo(want) > 12) drone.pos.copy(want); else drone.pos.lerp(want, Math.min(1, dt * 6));
  drone.ringMat.emissiveIntensity = 1.8 + Math.sin(now * 7) * 0.5; droneLight.position.copy(drone.pos); droneLight.intensity = 1.5 + nightF * 2;
  drone.cd -= dt; let best = null, bd = drone.laser ? 26 : 22;
  for (const m of mutants) { if (!isThreat(m)) continue; const d = m.pos.distanceTo(P.pos); if (d < bd && losClear(drone.pos, aimPoint(m))) { bd = d; best = m; } }
  if (best) { drone.g.lookAt(aimPoint(best)); drone.g.rotateY(Math.PI); } else drone.g.rotation.set(0, P.yaw, Math.sin(now * 1.3) * 0.15);
  if (best && drone.cd <= 0) {
    if (drone.laser) { drone.cd = 0.28; const ap = aimPoint(best); tracer(drone.pos.clone(), ap, 0xff5a2a, 0.035, 0.12); sparks.burst(ap, 8, [0xff8a3a, 0xffd060], 3, 0.4, 3); damageMutant(best, 10, 'drone'); sound.droneShot(true); }
    else { drone.cd = 0.42; fireBolt(drone.pos.clone(), best); sound.droneShot(false); }
  }
  for (const b of bolts) { if (!b.alive) continue; b.life -= dt; b.mesh.position.addScaledVector(b.vel, dt);
    const t = b.target; if (t && !t.dead && t.state !== 'burrowed' && b.mesh.position.distanceTo(aimPoint(t)) < t.def.radius * t.scale + 0.3) { damageMutant(t, 6, 'drone'); sparks.burst(b.mesh.position, 10, [0x60e0ff, 0xd0ffff], 3, 0.35, 3); b.alive = false; }
    if (b.life <= 0 || b.mesh.position.y < 0) b.alive = false; if (!b.alive) b.mesh.visible = false; }
}
function updateStructs(dt) {
  for (const s of structs) {
    if (s.flash > 0) s.flash -= dt;
    if (s.type === 'turret') {
      s.cd -= dt; const head = s.group.userData.head, laser = s.group.userData.laser; let best = null, bd = 27; const hp = new V3(s.pos.x, 1.07, s.pos.z);
      for (const m of mutants) { if (!isThreat(m)) continue; const d = m.pos.distanceTo(s.pos); if (d < bd && losClear(hp, aimPoint(m))) { bd = d; best = m; } }
      if (best) {
        const ap = aimPoint(best); const ly = Math.atan2(ap.x - s.pos.x, ap.z - s.pos.z) - s.group.rotation.y; head.rotation.y += angDiff(ly, head.rotation.y) * Math.min(1, dt * 10);
        head.rotation.x = -Math.atan2(ap.y - 1.07, Math.hypot(ap.x - s.pos.x, ap.z - s.pos.z)); laser.scale.y = bd;
        if (s.cd <= 0 && Math.abs(angDiff(ly, head.rotation.y)) < 0.15) { s.cd = 0.32 * (typeof powerOK === 'function' && !powerOK() ? 2.5 : 1); const mz = new V3(0, 0, 0.9).applyEuler(new THREE.Euler(head.rotation.x, head.rotation.y + s.group.rotation.y, 0, 'YXZ')).add(hp); tracer(mz, ap, 0xffb060, 0.02); sparks.burst(ap, 5, 0xffc070, 3, 0.3); damageMutant(best, 9, 'turret'); if (bd < 35) sound.turret(); }
      } else { head.rotation.y += dt * 0.6; head.rotation.x = 0; laser.scale.y = 25; }
    }
    if (s.type === 'campfire') { const fl = s.group.userData.flames; const k = 1 + Math.sin(now * 17 + s.pos.x) * 0.1 + Math.sin(now * 29) * 0.06; fl[0].scale.set(1, k, 1); fl[1].scale.set(1, 2 - k, 1); if (s.light) s.light.intensity = (22 + Math.sin(now * 23) * 4) * (0.5 + nightF); if (Math.random() < dt * 8) sparks.emit(new V3(s.pos.x, 0.8, s.pos.z), new V3(R(-.3, .3), R(1, 2), R(-.3, .3)), 0xff8a3a, 1.2, -0.5); }
    if (STRUCT_UPD[s.type]) STRUCT_UPD[s.type](s, dt);
    if (s.type === 'floodlight') { const on = nightF > 0.15 && (typeof powerOK !== 'function' || powerOK()); s.group.userData.lamp.emissiveIntensity = on ? 3 : 0; if (s.spot) s.spot.light.intensity = on ? 130 * nightF * (Math.random() < 0.004 ? 0.2 : 1) : 0; }
    if (s.type === 'core') { s.group.userData.glow.emissiveIntensity = 1.0 + Math.sin(now * 2) * 0.25 + (s.flash > 0 ? 3 : 0); s.group.userData.blink.visible = Math.sin(now * 4) > 0; }
  }
}

// ---------------------------------------------------------------- loot piles
const loots = [];
const crateMat = new THREE.MeshStandardMaterial({ color: 0x5a4630, roughness: 0.9 });
const tarpMat = new THREE.MeshStandardMaterial({ color: 0x46503e, roughness: 1, side: THREE.DoubleSide });
function makeLoot(x, z, guaranteedCloth) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = R(0, 6.28);
  const c = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.6, 0.6), crateMat); c.position.y = 0.3; c.castShadow = true; g.add(c);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.06, 0.62), crateMat); lid.position.set(0, 0.63, 0); g.add(lid);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), scrapMat); c2.position.set(0.7, 0.2, 0.2); c2.rotation.y = 0.5; c2.castShadow = true; g.add(c2);
  const t = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1), tarpMat); t.position.set(-0.3, 0.5, -0.1); t.rotation.set(-1.2, 0, 0.3); g.add(t);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe0a0, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5 })); sp.scale.set(0.5, 0.5, 1); sp.position.y = 0.9; g.add(sp);
  scene.add(g); loots.push({ g, lid, sp, pos: g.position, looted: false, cloth: guaranteedCloth });
}
makeLoot(5.5, -6.5, true);
W.lootSpots.forEach(([x, z], i) => { if (!W.inside(x, z, 1.5) && Math.hypot(x, z) > 12) makeLoot(x, z, i === 3); });
function lootPile(l) {
  l.looted = true; l.sp.visible = false; l.lid.position.set(0.4, 0.35, 0.3); l.lid.rotation.z = 1.1; sound.pickup();
  const got = { scrap: 2 + ((Math.random() * 4) | 0) };
  if (Math.random() < 0.45) got.meat = 1; if (Math.random() < 0.25) got.meal = 1; if (Math.random() < 0.5) got.water = 1 + (Math.random() < 0.3 ? 1 : 0);
  if (Math.random() < 0.45) { const a = 12 + ((Math.random() * 18) | 0); P.reserve += a; toast(`+${a} Rifle Ammo`); }
  if (Math.random() < 0.18) got.meds = 1;
  for (const k in got) inv[k] += got[k];
  toast('Scavenged: ' + Object.entries(got).map(([k, v]) => `+${v} ${ITEM_NAMES[k]}`).join(', '));
  if (l.cloth || Math.random() < 0.35) giveClothing(rollClothing());
}
function giveClothing(c) {
  const cur = gear[c.slot]; const col = RARITY[c.rarity].c;
  if (!cur || c.armor > cur.armor) { gear[c.slot] = c; toast(`<b style="color:${col}">${RARITY[c.rarity].n} ${c.name}</b> equipped (+${c.armor} armor, +${c.warmth} warmth)${c.effect ? ' · ' + c.effect : ''}`, col); refreshGear(); }
  else { inv.scrap += 1 + c.rarity; toast(`<span style="color:${col}">${RARITY[c.rarity].n} ${c.name}</span> is worse than yours. Salvaged for scrap.`, col); }
}
// ---------------------------------------------------------------- data logs (no quest markers: find them yourself)
const LOGS = [
  { title: 'VERDANT LABS · RESEARCH MEMO 0211', text: 'The regrowth agent works. A lichen that digests concrete.\nCanopy cover in weeks, not decades.\n\nThe board wants a city-scale field trial. Everyone else on the\nteam said no. Too fast, too hungry, no off-switch.\n\nI signed the authorization anyway.\n\n— Lead Researcher, badge #0001' },
  { title: 'SECURITY TERMINAL · ACCESS LOG', text: '03:14  RELEASE VALVE 7 ......... OPENED     badge #0001\n03:15  CONTAINMENT ALARM ....... SILENCED   badge #0001\n03:16  EVACUATION ORDER ........ NOT ISSUED\n03:41  BADGE #0001 ............. EXITED FACILITY\n\nNo other personnel were on site.' },
  { title: 'VOICE MEMO · AUTO-TRANSCRIBED', text: '"...the animals aren\'t dying. They\'re changing. The agent\nrewrites anything that breathes it.\n\nIf this is what I think it is, I\'m taking the memory\nsuppressant tonight. Nobody should have to remember doing this.\nLeast of all me."\n\n[ The voice on the recording is yours. ]' },
  { title: 'BUNKER WALL · SCRAWLED IN RUST', text: 'WE SAW YOU OPEN IT.\nTHE ONE IN THE WHITE COAT. NO NAME, JUST A NUMBER.\nYOU WALKED OUT. WE COULDN\'T.\n\nIf you\'re reading this and you don\'t remember,\nlook at your badge.\n\n[ The cracked badge on your jacket reads #0001. ]' },
];
const logs = [];
(() => {
  const inner = W.buildings.filter(b => Math.hypot(b.cx, b.cz) < 100 && b.h > 10);
  const picks = [[1, 1], [-1, -1], [1, -1]].map(([sx, sz]) => inner.filter(b => Math.sign(b.cx) === sx && Math.sign(b.cz) === sz).sort((a, b) => Math.hypot(a.cx, a.cz) - Math.hypot(b.cx, b.cz))[1] || inner[0]);
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x3a3c3a, roughness: 0.7, metalness: 0.4 });
  picks.forEach((b, i) => {
    const toC = new V3(-b.cx, 0, -b.cz); const ax = Math.abs(toC.x) > Math.abs(toC.z);
    const x = ax ? b.cx + Math.sign(toC.x) * (b.w / 2 + 0.9) : b.cx, z = ax ? b.cz : b.cz + Math.sign(toC.z) * (b.d / 2 + 0.9);
    const g = new THREE.Group(); g.position.set(x, 0, z); g.lookAt(x + (ax ? Math.sign(toC.x) : 0), 0, z + (ax ? 0 : Math.sign(toC.z)));
    const desk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.7), deskMat); desk.position.y = 0.4; desk.castShadow = true; g.add(desk);
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.08), deskMat); mon.position.set(0, 1.08, -0.1); mon.rotation.x = -0.1; g.add(mon);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.42), new THREE.MeshBasicMaterial({ map: TX.screenTexture(['VERDANT//OS', '> LOG ' + (i + 1) + ' OF 4', '> badge #0001', '_']), toneMapped: false })); scr.position.set(0, 1.08, -0.055); scr.rotation.x = -0.1; g.add(scr);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x40ff60, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35 })); gl.scale.set(1.6, 1.2, 1); gl.position.set(0, 1.08, 0); g.add(gl);
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.5), deskMat); chair.position.set(0.5, 0.45, 0.7); chair.rotation.z = 1.4; chair.position.y = 0.25; g.add(chair);
    scene.add(g); logs.push({ i, pos: g.position, found: false, g });
  });
  // bunker in the north-west park: skeleton + rust scrawl
  const bx = -40, bz = 40 - 10; const conc = new THREE.MeshStandardMaterial({ map: W.tex.roof, roughness: 1 });
  const g = new THREE.Group(); g.position.set(bx, 0, bz);
  const shell = new THREE.Mesh(new THREE.BoxGeometry(7, 2.6, 5), conc); shell.position.y = 1.0; shell.castShadow = shell.receiveShadow = true; g.add(shell);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 0.2), gunRust); door.position.set(0, 1.0, 2.55); door.rotation.y = 0.5; g.add(door);
  const scrawl = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 2.2), new THREE.MeshBasicMaterial({ map: TX.scrawlTexture('WE SAW YOU\nOPEN IT'), transparent: true })); scrawl.position.set(0, 1.4, 2.52); g.add(scrawl);
  const boneM = new THREE.MeshStandardMaterial({ color: 0xd8d0bc, roughness: 0.7 });
  const sk = new THREE.Group(); sk.position.set(1.8, 0, 3.4); const skull = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), boneM); skull.position.set(0, 0.6, -0.3); sk.add(skull);
  for (let i = 0; i < 5; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.015, 4, 10, Math.PI), boneM); rib.position.set(0, 0.35 - i * 0.07, -0.2 + i * 0.02); rib.rotation.set(0.3, 0, 0); sk.add(rib); }
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.7), boneM); l.rotation.x = 1.5; l.position.set(s * 0.12, 0.05, 0.3); sk.add(l); }
  sk.rotation.y = 0.4; g.add(sk); scene.add(g);
  W.addCollider(bx - 3.5, bx + 3.5, bz - 2.5, bz + 2.5, 2.4, 'building');
  logs.push({ i: 3, pos: new V3(bx, 0, bz + 3.4), found: false, g });
})();
const foundLogs = () => logs.filter(l => l.found).length;

// ---------------------------------------------------------------- HUD helpers
function toast(html, color = '#9fc48a') { const d = document.createElement('div'); d.className = 'toast'; d.style.borderColor = color; d.innerHTML = html; $('toasts').prepend(d); setTimeout(() => d.remove(), 5200); while ($('toasts').children.length > 6) $('toasts').lastChild.remove(); }
let bannerT = null;
function banner(big, small = '', ms = 4200) { const b = $('banner'); b.innerHTML = big + (small ? `<small>${small}</small>` : ''); b.style.opacity = 1; clearTimeout(bannerT); bannerT = setTimeout(() => b.style.opacity = 0, ms); }
function hurtPlayer(dmg, src) {
  if (P.dead || now < (P.invuln || 0)) return; const real = dmg * DIFF.dmg * (1 - Math.min(0.6, armorTotal() * 0.03)); P.hp -= real; P.hurtFlash = 0.6; P.shake = Math.max(P.shake, 0.15 + real / 60); sound.hurt(); rumble(pad, Math.min(1, 0.35 + real / 30), 0.5, 160 + real * 4);
  if (P.hp <= 0) die();
}

// ---------------------------------------------------------------- input (keyboard/mouse, Xbox controller, touch)
const updaters = [], interactHooks = [], mapMarkers = [];
const keys = {}; let mouseDown = false, rmbDown = false, mdx = 0, mdy = 0, locked = false, lastInput = 'kb';
let pad = null, padPrev = [], padLook = { x: 0, y: 0 }, padMove = { x: 0, y: 0 }, padRepeat = 0, padDirPrev = '', dlHold = -1;
const touchIn = { move: { x: 0, y: 0 }, lookDX: 0, lookDY: 0, fire: false, ads: false, sprint: false, jump: false };
const photo = { on: false };
let renderScale = 1, state = 'title', titleSub = 'attract', panelReturn = 'title';
const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
function setInput(m) { if (m === lastInput) return; lastInput = m; setMode(m); onModeChange(); }
function onModeChange() {
  renderKeysBar(); renderPadStatus();
  $('touch').classList.toggle('hidden', !(lastInput === 'touch' && state === 'play' && !openP && !photo.on));
  if (openP === 'craft') renderCraft(); if (openP === 'controls') renderControls(); if (openP === 'settings') renderSettings();
  if (lastInput === 'pad') nav.ensure(); else nav.clear();
}
addEventListener('keydown', e => {
  if (e.repeat) return; keys[e.code] = true; setInput('kb'); sound.init(); sound.resume();
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  onKey(e.code);
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('pointermove', e => { if (e.pointerType === 'mouse') { if (locked) { mdx += e.movementX; mdy += e.movementY; } if (Math.abs(e.movementX) + Math.abs(e.movementY) > 2) setInput('kb'); } });
addEventListener('pointerdown', e => { sound.init(); sound.resume(); if (e.pointerType === 'touch') setInput('touch'); else if (e.pointerType === 'mouse') setInput('kb'); if (state === 'title' && titleSub === 'attract') revealMenu(); }, true);
canvas.addEventListener('mousedown', e => {
  if (state !== 'play' || lastInput === 'touch') return; if (photo.on) return;
  if (!locked && !anyPanel()) { lockMouse(); return; }
  if (e.button === 0) { mouseDown = true; if (build.active) placeBuild(); }
  if (e.button === 2) { if (build.active) exitBuild(); else rmbDown = true; }
});
addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; if (e.button === 2) rmbDown = false; });
addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => { if (build.active) build.rot += Math.PI / 2 * Math.sign(e.deltaY); if (photo.on) photoFov(Math.sign(e.deltaY) * 3); }, { passive: true });
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === canvas; if (!locked && state === 'play' && !anyPanel() && !P.dead && !photo.on && lastInput === 'kb') openPanel('pause'); });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
addEventListener('gamepadconnected', e => { renderPadStatus(); if (state === 'play') toast(`🎮 Controller connected: ${e.gamepad.id.split('(')[0].trim().slice(0, 40)}`, '#9dff2e'); setInput('pad'); rumble(e.gamepad, 0.3, 0.3, 150); });
addEventListener('gamepaddisconnected', () => { renderPadStatus(); if (state === 'play') { toast('Controller disconnected', '#ff7a5a'); if (!openP) openPanel('pause'); } });
function lockMouse() { if (lastInput !== 'kb' || isTouchDevice && !matchMedia('(pointer:fine)').matches) return; try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { } }
function unlockMouse() { if (document.pointerLockElement) document.exitPointerLock(); }

// ---------------------------------------------------------------- panels + controller navigation
const nav = new MenuNav(); nav.onMove = () => sound.uiMove();
const PANELS = ['pause', 'craft', 'reader', 'settings', 'controls', 'dead', 'saves', 'gallery', 'dlg', 'creator'];
let openP = null;
const anyPanel = () => !!openP;
const BACKS = {
  pause: () => closePanels(), craft: () => closePanels(), reader: () => closePanels(), dlg: () => closePanels(),
  settings: () => backToReturn(), controls: () => backToReturn(), saves: () => backToReturn(), gallery: () => galleryBack(), dead: () => {}, creator: () => creatorBack(),
};
const PREFER = { creator: '#ccBegin', pause: '[data-act=resume]', dead: '#respawn', reader: '#readerClose' };
function openPanel(id, ret) {
  closePanels(true); openP = id; if (ret) panelReturn = ret; $(id).classList.remove('hidden'); unlockMouse(); mouseDown = rmbDown = false;
  $('touch').classList.add('hidden');
  if (id === 'craft') renderCraft(); if (id === 'settings') renderSettings(); if (id === 'controls') renderControls();
  if (state === 'title') $('menu').classList.add('hidden');
  nav.setRoot($(id), BACKS[id], PREFER[id]); sound.uiSelect && sound.ctx && sound.uiMove();
}
function closePanels(silent) {
  PANELS.forEach(p => $(p).classList.add('hidden')); const was = openP; openP = null; nav.clear();
  if (state === 'title') { if (!silent && titleSub === 'menu') showTitleMenu(); return; }
  if (!silent && state === 'play' && was) { lockMouse(); sound.uiBack(); }
  $('touch').classList.toggle('hidden', !(lastInput === 'touch' && state === 'play' && !photo.on));
}
function backToReturn() { sound.uiBack(); if (panelReturn === 'pause' && state === 'play') openPanel('pause'); else { closePanels(true); showTitleMenu(); } }
document.querySelectorAll('.panel .back').forEach(b => b.addEventListener('click', () => { const p = b.closest('.panel'); (BACKS[p.id] || closePanels)(); }));

// central action dispatcher shared by keyboard, controller and touch
function doAction(a) {
  if (state !== 'play' || P.dead && a !== 'pause') return;
  if (photo.on) return;
  switch (a) {
    case 'reload': reload(); break; case 'interact': interact(); break; case 'craft': openPanel('craft'); break;
    case 'build': build.active ? exitBuild() : enterBuild(build.type || 'wall'); break;
    case 'rotate': if (build.active) build.rot += Math.PI / 2; break;
    case 'cycleBuild': if (build.active) { const ids = RECIPES.filter(r => r.build && (!r.cond || r.cond())).map(r => r.id); enterBuild(ids[(ids.indexOf(build.type) + 1) % ids.length]); } break;
    case 'eat': eat(); break; case 'drink': drink(); break; case 'meds': useMeds(); break;
    case 'light': P.light = !P.light; sound.click(); break;
    case 'camera': settings.camera = settings.camera === 'first' ? 'third' : 'first'; saveSettings(); toast(settings.camera === 'first' ? 'First-person camera' : 'Third-person camera'); break;
    case 'pause': openPanel('pause', 'pause'); break;
    case 'photo': enterPhoto(); break;
    case 'mount': toggleMount(); break;
    case 'hud': $('hud').classList.toggle('hidden'); break;
  }
}
function onKey(code) {
  if (state === 'title') {
    if (titleSub === 'attract') { revealMenu(); return; }
    return menuKey(code);
  }
  if (photo.on) { if (code === 'Escape' || code === 'KeyO') exitPhoto(); if (code === 'KeyH') togglePhotoUI(); if (code === 'KeyF') photoFilter(1); if (code === 'Enter' || code === 'KeyK') photoShot(); return; }
  if (openP) {
    if (openP === 'reader' && (code === 'KeyE' || code === 'Space')) return closePanels();
    if (openP === 'craft' && (code === 'KeyC' || code === 'Tab')) return closePanels();
    if (openP === 'pause' && code === 'Escape') return closePanels();
    return menuKey(code);
  }
  if (code === 'Escape') { if (build.active) exitBuild(); return; }
  const map = { KeyR: 'reload', KeyE: 'interact', KeyC: 'craft', Tab: 'craft', KeyB: 'build', KeyZ: 'drink', KeyH: 'meds', KeyF: 'light', KeyV: 'camera', KeyO: 'photo', KeyG: 'mount', KeyP: 'hud' };
  if (code === 'KeyQ') return doAction(build.active ? 'rotate' : 'eat');
  if (map[code]) doAction(map[code]);
  if (build.active && /^Digit[1-9]$/.test(code)) { const ids = RECIPES.filter(r => r.build).map(r => r.id); const id = ids[+code.slice(5) - 1]; if (id) enterBuild(id); }
}
function menuKey(code) {
  if (code === 'ArrowUp' || code === 'KeyW') nav.move(0, -1); if (code === 'ArrowDown' || code === 'KeyS') nav.move(0, 1);
  if (code === 'ArrowLeft' || code === 'KeyA') nav.move(-1, 0); if (code === 'ArrowRight' || code === 'KeyD') nav.move(1, 0);
  if (code === 'Enter' || code === 'Space') { if (nav.cur) { sound.uiSelect(); nav.activate(); } }
  if (code === 'Escape' || code === 'Backspace') nav.back();
}
const padP = i => pad && pad.buttons[i] && pad.buttons[i].pressed;
function padPressed(i) { return padP(i) && !padPrev[i]; }
function padReleased(i) { return !padP(i) && padPrev[i]; }
function pollPad(dt) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : []; pad = null; for (const p of pads) if (p && p.connected) { pad = p; break; }
  if (!pad) { padLook.x = padLook.y = padMove.x = padMove.y = 0; return; }
  const dz = v => Math.abs(v) < 0.14 ? 0 : (v - Math.sign(v) * 0.14) / 0.86;
  padMove.x = dz(pad.axes[0] || 0); padMove.y = dz(pad.axes[1] || 0); padLook.x = dz(pad.axes[2] || 0); padLook.y = dz(pad.axes[3] || 0);
  const anyBtn = pad.buttons.some((b, i) => b.pressed && !padPrev[i]);
  if (Math.abs(padMove.x) + Math.abs(padMove.y) + Math.abs(padLook.x) + Math.abs(padLook.y) > 0.3 || anyBtn) setInput('pad');
  const inMenu = state === 'title' || openP;
  if (state === 'title' && titleSub === 'attract') { if (anyBtn) revealMenu(); }
  else if (inMenu) {
    // directional navigation with key-repeat
    let dir = ''; if (padP(12) || padMove.y < -0.6) dir = 'U'; else if (padP(13) || padMove.y > 0.6) dir = 'D'; else if (padP(14) || padMove.x < -0.6) dir = 'L'; else if (padP(15) || padMove.x > 0.6) dir = 'R';
    padRepeat -= dt;
    if (dir && (dir !== padDirPrev || padRepeat <= 0)) { padRepeat = dir !== padDirPrev ? 0.38 : 0.11; nav.move(dir === 'L' ? -1 : dir === 'R' ? 1 : 0, dir === 'U' ? -1 : dir === 'D' ? 1 : 0); }
    padDirPrev = dir;
    if (openP === 'craft' || openP === 'gallery' || openP === 'controls') { const ry = padLook.y; if (Math.abs(ry) > 0.2) { const el = $(openP).querySelector('.cbox,.tbox'); if (el) el.scrollTop += ry * 600 * dt; } }
    if (padPressed(0)) { sound.uiSelect(); nav.activate(); }
    if (padPressed(1)) nav.back();
    if (padPressed(9) && openP === 'pause') closePanels();
    if (padPressed(9) && openP === 'craft') closePanels();
  } else if (photo.on) {
    if (padPressed(1) || padPressed(8)) exitPhoto(); if (padPressed(0)) photoShot(); if (padPressed(2)) photoFilter(1); if (padPressed(3)) togglePhotoUI();
  } else if (state === 'play') {
    if (padPressed(2)) doAction('interact'); if (padPressed(3)) doAction(build.active ? 'cycleBuild' : 'reload'); if (padPressed(9)) doAction('pause'); if (padPressed(8)) doAction('photo');
    if (padPressed(12)) doAction('craft'); if (padPressed(13)) doAction('light'); if (padPressed(15)) doAction('drink'); if (padPressed(11)) doAction('camera');
    if (padPressed(14)) dlHold = 0; if (dlHold >= 0) { dlHold += dt; if (dlHold > 0.45) { doAction('meds'); dlHold = -1; } else if (padReleased(14)) { doAction('eat'); dlHold = -1; } }
    if (padPressed(5)) doAction('build');
    if (build.active) { if (padPressed(4)) doAction('rotate'); if (padPressed(1)) exitBuild(); if (padPressed(7)) placeBuild(); }
    else if (padPressed(1)) doAction('mount');
  }
  padPrev = pad.buttons.map(b => b.pressed);
}
// ---------------------------------------------------------------- aim assist (controller only, light, on by default)
function aimTarget(maxA) {
  let best = null, ba = maxA;
  for (const m of mutants) { if (!isThreat(m)) continue; const ap = aimPoint(m), d = ap.clone().sub(camera.position), L = d.length(); if (L > 60) continue; d.divideScalar(L); const a = Math.acos(clamp(d.dot(camFwd), -1, 1)); if (a < ba && losClear(camera.position, ap)) { ba = a; best = d; } }
  return best;
}
function aimAssist(dt, lookMag, moving) {
  if (!settings.aimAssist || lastInput !== 'pad' || !pad) return 1;
  const best = aimTarget(P.ads > 0.5 ? 0.09 : 0.13); if (!best) return 1;
  if (lookMag > 0.1 || moving) { const ty = Math.atan2(-best.x, -best.z), tp = Math.asin(clamp(best.y, -1, 1)); const k = Math.min(1, dt * 2.2); P.yaw += angDiff(ty, P.yaw) * k; P.pitch += (tp - P.pitch) * k * 0.6; }
  return P.ads > 0.5 ? 0.55 : 0.65;
}
function adsSnap() { if (!settings.aimAssist || lastInput !== 'pad') return; const best = aimTarget(0.16); if (!best) return; P.yaw += angDiff(Math.atan2(-best.x, -best.z), P.yaw) * 0.35; P.pitch += (Math.asin(clamp(best.y, -1, 1)) - P.pitch) * 0.35; }

// ---------------------------------------------------------------- player model + cameras
const playerModel = buildPlayer(RARITY, { cloth: TX.clothTexture(), rust: W.tex.rust });
scene.add(playerModel.root); playerModel.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
const modelFlash = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffb050, blending: THREE.AdditiveBlending, depthWrite: false })); modelFlash.scale.set(0.45, 0.45, 1); modelFlash.visible = false; playerModel.muzzle.add(modelFlash);
function refreshGear() { refreshSleeve(); const it = Object.values(gear); const full = it.every(Boolean) && it.every(g => g.rarity === it[0].rarity) && it[0].rarity >= 1 ? it[0].rarity : 0; setGear(playerModel, gear, full); }
refreshGear();
const thirdPerson = () => settings.camera !== 'first';
const camTmp = new V3();
function cameraCollide(from, to) {
  const d = to.clone().sub(from), len = d.length(); d.normalize(); let t = len;
  for (const c of colliders) { if (c.kind === 'tree') continue; const tt = rayBox(from, d, c); if (tt < t) t = tt; }
  return Math.max(0.3, t - 0.25);
}
function updateCamera(dt, hs, sprint) {
  const adsK = P.ads; const tp = thirdPerson();
  camera.fov = lerp(camera.fov, photo.on ? photo.fov : lerp(72, tp ? 52 : 46, adsK) + (sprint ? 4 : 0), Math.min(1, dt * 10)); camera.updateProjectionMatrix();
  if (photo.on) return;
  const shake = R(-1, 1) * P.shake * 0.03, sway = P.hunger < 20 ? (1 - P.hunger / 20) * 0.012 : 0, breathe = P.stam < 30 ? (1 - P.stam / 30) * 0.01 : 0;
  const pitch = P.pitch + Math.sin(now * 1.3) * sway + Math.sin(now * 5) * breathe + shake, yaw = P.yaw + Math.sin(now * 0.9) * sway + shake;
  const mountY = P.mount ? P.mount.def.radius * P.mount.scale * 1.3 + 0.6 : 0;
  if (tp) {
    const fwd = new V3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)), right = new V3(Math.cos(yaw), 0, -Math.sin(yaw));
    const pivot = new V3(P.pos.x, P.pos.y + 1.55 + mountY, P.pos.z);
    const dist = lerp(P.mount ? 5 : 3.3, 1.55, adsK), side = lerp(0.95, 0.68, adsK);
    const shoulder = pivot.clone().addScaledVector(right, side).add(new V3(0, 0.22, 0));
    const desired = shoulder.clone().addScaledVector(fwd, -dist); desired.y = Math.max(0.35, desired.y);
    const t = cameraCollide(shoulder, desired); const dir = desired.clone().sub(shoulder).normalize();
    camTmp.copy(shoulder).addScaledVector(dir, t);
    camera.position.lerp(camTmp, Math.min(1, dt * 18)); if (camera.position.distanceTo(camTmp) > 3) camera.position.copy(camTmp);
    camera.rotation.set(pitch, yaw, 0);
    vm.visible = false; playerModel.root.visible = true;
  } else {
    camera.position.set(P.pos.x, P.pos.y + EYE + mountY + Math.sin(P.bob * 2) * 0.05 * Math.min(1, hs / 5) + Math.sin(now * 5) * breathe * 3, P.pos.z);
    camera.rotation.set(pitch, yaw, 0);
    vm.visible = !P.dead; playerModel.root.visible = false;
  }
  playerModel.root.position.set(P.pos.x, P.pos.y + mountY, P.pos.z); playerModel.root.rotation.y = P.yaw;
  animatePlayer(playerModel, dt, { speed: P.mount ? 0 : hs, sprint, ads: adsK > 0.5, pitch: P.pitch, grounded: P.onGround || !!P.mount, recoil: P.recoil, reloading: P.reloading > 0, mounted: !!P.mount, dead: P.dead });
}
function muzzleWorld() { return (thirdPerson() ? playerModel.muzzle : muzzle).getWorldPosition(new V3()); }

// ---------------------------------------------------------------- player update
function reload() { if (P.reloading > 0 || P.clip >= 24 || P.reserve <= 0) return; P.reloading = 1.3; sound.reload(); }
function fire() {
  if (P.reloading > 0 || P.fireCD > 0 || build.active) return;
  if (P.clip <= 0) { sound.click(); P.fireCD = 0.3; reload(); return; }
  P.clip--; P.fireCD = 0.12; P.recoil = 1;
  const moving = Math.hypot(P.vel.x, P.vel.z) > 1; const sprint = P.sprinting;
  const spread = (0.0035 + (moving ? 0.008 : 0) + (sprint ? 0.03 : 0) + (P.hunger < 20 ? 0.02 : 0) + (P.stam < 15 ? 0.012 : 0) + (!P.onGround && !P.mount ? 0.02 : 0)) * (1 - P.ads * 0.6);
  const dir = camFwd.clone().add(new V3(R(-1, 1), R(-1, 1), R(-1, 1)).multiplyScalar(spread)).normalize();
  let o = camera.position.clone();
  if (thirdPerson()) { const pivot = new V3(P.pos.x, P.pos.y + 1.5, P.pos.z); const t0 = Math.max(0, pivot.sub(o).dot(dir)); o.addScaledVector(dir, t0); }
  let hit = worldRay(o, dir, 160, P.mount);
  const mz = muzzleWorld();
  if (thirdPerson()) { // the muzzle must also see the point, or the round hits cover
    const d2 = hit.point.clone().sub(mz), L = d2.length(); d2.normalize(); let tb = L;
    for (const c of colliders) { if (c.kind === 'tree') continue; const t = rayBox(mz, d2, c); if (t < tb - 0.3) tb = t; }
    if (tb < L - 0.3) hit = { point: mz.clone().addScaledVector(d2, tb), m: null };
  }
  tracer(mz, hit.point, 0xffd27a, 0.014, 0.05);
  flashSprite.visible = modelFlash.visible = true; flashSprite.material.rotation = R(0, 6); muzzleLight.position.copy(mz); muzzleLight.intensity = 25; sound.shot();
  rumble(pad, 0.25, 0.45, 70);
  if (hit.m) { const dmg = 19 * (hit.mult || 1); if (damageMutant(hit.m, dmg, 'player')) { $('hitmark').style.opacity = 1; $('hitmark').style.color = hit.mult > 1.2 ? '#ff6a4a' : '#fff'; setTimeout(() => $('hitmark').style.opacity = 0, 90); sound.hit(); } }
  else { sparks.burst(hit.point, 7, [0xffd080, 0xffffff], 4, 0.25, 9); debris.burst(hit.point, 4, 0x6b6a63, 2, 0.6, 9); }
  P.pitch += 0.009 * (1 - P.ads * 0.5); P.yaw += R(-0.003, 0.003);
}
let adsPrev = false;
function updatePlayer(dt) {
  if (P.dead) { updateCamera(dt, 0, false); return; }
  const sens = 0.0022 * settings.sens * (1 - P.ads * 0.4), inv = settings.invertY ? -1 : 1;
  P.yaw -= mdx * sens; P.pitch -= mdy * sens * inv; mdx = mdy = 0;
  P.yaw -= touchIn.lookDX * 0.0055 * settings.sens * (1 - P.ads * 0.4); P.pitch -= touchIn.lookDY * 0.0055 * settings.sens * inv * (1 - P.ads * 0.4); touchIn.lookDX = touchIn.lookDY = 0;
  const lookMag = Math.hypot(padLook.x, padLook.y); const moveIn = new V3();
  if (keys.KeyW) moveIn.z -= 1; if (keys.KeyS) moveIn.z += 1; if (keys.KeyA) moveIn.x -= 1; if (keys.KeyD) moveIn.x += 1;
  moveIn.x += padMove.x + touchIn.move.x; moveIn.z += padMove.y + touchIn.move.y; if (moveIn.lengthSq() > 1) moveIn.normalize();
  // ADS: LT / RMB / touch AIM
  const adsHeld = (pad && pad.buttons[6] && pad.buttons[6].value > 0.3) || rmbDown || touchIn.ads;
  const wantADS = adsHeld && !build.active && !P.sprinting && P.reloading <= 0;
  if (wantADS && !adsPrev) adsSnap(); adsPrev = wantADS;
  P.ads = lerp(P.ads || 0, wantADS ? 1 : 0, Math.min(1, dt * 12)); document.body.classList.toggle('ads', P.ads > 0.5);
  const slow = aimAssist(dt, lookMag, moveIn.lengthSq() > 0.01);
  // response curve for the right stick: precise near centre, fast at the edge
  const lx = Math.sign(padLook.x) * padLook.x ** 2, ly = Math.sign(padLook.y) * padLook.y ** 2;
  P.yaw -= lx * 3.0 * dt * slow * settings.sens * (1 - P.ads * 0.45); P.pitch -= ly * 2.1 * dt * slow * settings.sens * inv * (1 - P.ads * 0.45);
  P.pitch = clamp(P.pitch, -1.35, 1.35);
  if (P.mount) { updateMounted(dt, moveIn); return; }
  const sprintHeld = keys.ShiftLeft || keys.ShiftRight || padP(10) || touchIn.sprint;
  if (padPressed(10)) P.sprintLatch = true; if (moveIn.lengthSq() < 0.04) P.sprintLatch = false;
  const wantSprint = (sprintHeld || P.sprintLatch) && moveIn.z < -0.2 && !P.exhausted && P.stam > 0 && !build.active && P.ads < 0.5;
  P.sprinting = wantSprint;
  let spd = (wantSprint ? 8.6 : 5.0) * (hasEffect('Glowing') ? 1.1 : 1) * (P.hunger <= 0 || P.thirst <= 0 ? 0.8 : 1) * (1 - P.ads * 0.4);
  const wish = moveIn.clone().applyAxisAngle(new V3(0, 1, 0), P.yaw).multiplyScalar(spd);
  const acc = P.onGround ? 12 : 3; P.vel.x = lerp(P.vel.x, wish.x, Math.min(1, acc * dt)); P.vel.z = lerp(P.vel.z, wish.z, Math.min(1, acc * dt));
  const jump = keys.Space || padP(0) || touchIn.jump;
  if (jump && P.onGround && P.stam > 8) { P.vel.y = 5.6; P.onGround = false; P.stam -= 8; touchIn.jump = false; }
  P.vel.y -= 16 * dt; P.pos.addScaledVector(P.vel, dt);
  if (P.pos.y <= 0) { P.pos.y = 0; P.vel.y = 0; P.onGround = true; }
  resolve(P.pos, 0.4, { feet: P.pos.y });
  const hs = Math.hypot(P.vel.x, P.vel.z);
  if (wantSprint && hs > 3) { P.stam -= 20 * dt; P.staminaDelay = 1; if (P.stam <= 0) { P.stam = 0; P.exhausted = true; rumble(pad, 0.2, 0.1, 200); } }
  else { P.staminaDelay -= dt; if (P.staminaDelay <= 0) P.stam = Math.min(100, P.stam + 14 * dt * (P.wellFed > 0 ? 1.6 : 1) * (P.hunger < 15 ? 0.5 : 1)); }
  if (P.exhausted && P.stam > 30) P.exhausted = false;
  survival(dt, wantSprint);
  weapon(dt);
  P.bob += hs * dt * (wantSprint ? 1.5 : 1.9);
  vm.position.set(lerp(0.24, 0.0, P.ads) + Math.cos(P.bob) * 0.012 * Math.min(1, hs / 5), lerp(-0.22, -0.155, P.ads) + Math.abs(Math.sin(P.bob)) * 0.012 - (P.reloading > 0 ? 0.12 : 0) - (wantSprint ? 0.05 : 0), -0.45 + P.recoil * 0.05);
  vm.rotation.set(P.recoil * 0.08 + (P.reloading > 0 ? -0.6 : 0), wantSprint ? 0.5 : 0, P.reloading > 0 ? 0.4 : 0);
  updateCamera(dt, hs, wantSprint);
}
function survival(dt, sprinting) {
  const drain = DIFF.drain * (P.sick ? 1.8 : 1) * (sprinting ? 1.5 : 1) * (typeof seasonDrain === 'function' ? seasonDrain() : 1);
  P.hunger = Math.max(0, P.hunger - 0.22 * dt * drain); P.thirst = Math.max(0, P.thirst - 0.3 * dt * drain);
  P.wellFed = Math.max(0, P.wellFed - dt);
  if (P.hunger <= 0 || P.thirst <= 0) P.hp -= 1.2 * dt; else if (P.hunger > 50 && P.thirst > 50 && !P.sick) P.hp = Math.min(100, P.hp + dt * (0.5 + (P.wellFed > 0 ? 1 : 0) + (hasEffect('Vine') ? 0.5 : 0)));
  if (P.sick && P.hp > 10) P.hp -= 0.3 * dt;
  if (P.hp <= 0) die();
  P.recoil = Math.max(0, P.recoil - dt * 9); P.shake = Math.max(0, P.shake - dt); P.hurtFlash = Math.max(0, P.hurtFlash - dt);
  sound.breath(P.stam < 30 ? 1 - P.stam / 30 : 0, now);
  flashlight.intensity = P.light ? 45 : 0;
}
function weapon(dt) {
  P.fireCD -= dt; if (P.reloading > 0) { P.reloading -= dt; if (P.reloading <= 0) { const n = Math.min(24 - P.clip, P.reserve); P.clip += n; P.reserve -= n; } }
  const trig = mouseDown || (pad && pad.buttons[7] && pad.buttons[7].value > 0.5 && !build.active) || touchIn.fire;
  if (trig && !openP && state === 'play' && !build.active) fire();
  if (touchIn.fire && build.active && !P.touchPlaced) { placeBuild(); P.touchPlaced = true; } if (!touchIn.fire) P.touchPlaced = false;
  flashSprite.visible = modelFlash.visible = P.fireCD > 0.07; muzzleLight.intensity = flashSprite.visible ? muzzleLight.intensity * 0.6 : 0;
}
function eat() {
  if (inv.meal > 0) { inv.meal--; P.hunger = Math.min(100, P.hunger + 45); P.hp = Math.min(100, P.hp + 10); P.wellFed = 120; toast('Ate a Cooked Meal. <b>Well Fed</b>: faster stamina & health regen.', '#e6d17a'); sound.pickup(); }
  else if (inv.veg > 0) { inv.veg--; P.hunger = Math.min(100, P.hunger + 22); toast('Ate fresh vegetables.'); sound.pickup(); }
  else if (inv.meat > 0) { inv.meat--; P.hunger = Math.min(100, P.hunger + 25); sound.pickup(); if (Math.random() < 0.35) { P.sick = true; toast(`You ate raw meat... you feel <b style="color:#9fd44a">sick</b>. ${G('meds')} medicine or sleep cures it.`, '#9fd44a'); } else toast('Ate Raw Meat. Risky. Cook it at a campfire next time.'); }
  else toast('No food. Scavenge, farm or hunt.', '#ff7a5a');
}
function drink() { if (inv.water > 0) { inv.water--; P.thirst = Math.min(100, P.thirst + 40); toast('Drank water.'); sound.pickup(); } else toast('No water.', '#ff7a5a'); }
function useMeds() { if (inv.meds > 0) { inv.meds--; P.sick = false; P.hp = Math.min(100, P.hp + 35); toast('Used Medicine. Sickness cured.', '#6fd46a'); sound.pickup(); } else toast('No medicine.', '#ff7a5a'); }
// mounting (placeholder until mountable tames are enabled)
function toggleMount() { if (typeof mountToggle === 'function') mountToggle(); }
function updateMounted(dt, moveIn) { if (typeof mountUpdate === 'function') mountUpdate(dt, moveIn); }
// ---------------------------------------------------------------- death & respawn
let deathBag = null;
function die() {
  if (P.dead) return; P.dead = true; P.hp = 0; sound.hurt();
  const items = {}; for (const k of Object.keys(inv)) { if (inv[k] > 0) items[k] = inv[k]; inv[k] = 0; }
  if (deathBag) scene.remove(deathBag.g);
  const g = new THREE.Group(); const bag = new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 6), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1 })); bag.scale.y = 0.7; bag.position.y = 0.3; g.add(bag);
  const mk = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff4030, blending: THREE.AdditiveBlending, depthWrite: false })); mk.scale.set(0.8, 0.8, 1); mk.position.y = 0.9; g.add(mk);
  g.position.set(P.pos.x, 0, P.pos.z); scene.add(g); deathBag = { g, pos: g.position, items, expires: dayNo + 3 };
  setTimeout(() => openPanel('dead'), 900);
}
function respawn() {
  if (P.mount && typeof mountToggle === 'function') mountToggle(true);
  const rp = typeof respawnPoint === 'function' ? respawnPoint() : null; const sp = rp ? rp.pos : core ? core.pos : new V3(0, 0, 0); P.pos.set(sp.x + 2, 0, sp.z + 3.5); P.vel.set(0, 0, 0);
  P.dead = false; P.hp = 60; P.invuln = now + 4; P.hunger = Math.max(P.hunger, 50); P.thirst = Math.max(P.thirst, 50); P.stam = 100; P.sick = false;
  closePanels(); toast(`You wake again at ${rp ? rp.name : 'your base'}. Your pack is marked on the map. It rots in 3 days.`, '#ff7a5a');
}

// ---------------------------------------------------------------- interaction
function nearestInteract() {
  const p = P.pos; let best = null, bd = 3.2;
  const consider = (d, o) => { if (d < bd) { bd = d; best = o; } };
  for (const m of mutants) if (!m.dead && !m.tamed && m.state === 'stunned') consider(Math.hypot(m.pos.x - p.x, m.pos.z - p.z) - m.def.radius * m.scale, { type: 'feed', m });
  for (const l of loots) if (!l.looted) consider(l.pos.distanceTo(p), { type: 'loot', l });
  for (const l of logs) consider(Math.hypot(l.pos.x - p.x, l.pos.z - p.z) - 0.6, { type: 'log', l });
  if (deathBag) consider(deathBag.pos.distanceTo(p), { type: 'bag' });
  const ko = mutants.filter(m => m.tamed && m.ko);
  if (core && ko.length) consider(Math.hypot(core.pos.x - p.x, core.pos.z - p.z) - 1.8, { type: 'revive', m: ko[0] });
  for (const h of interactHooks) h(p, consider);
  if (Math.hypot(BED.x - p.x, BED.z - p.z) < 2.4 || (core && Math.hypot(core.pos.x - p.x, core.pos.z - p.z) < 2.8)) consider(2.5, { type: 'sleep' });
  return best;
}
function promptText(it) {
  if (!it) return '';
  if (it.type === 'feed') { const f = it.m.def.food; return inv[f] > 0 ? `${G('interact')} Feed ${ITEM_NAMES[f]} to tame the ${it.m.def.name}` : `The ${it.m.def.name} wants <b>${ITEM_NAMES[f]}</b>. You have none`; }
  if (it.type === 'hook') return typeof it.label === 'function' ? it.label() : it.label;
  if (it.type === 'loot') return `${G('interact')} Search the debris`;
  if (it.type === 'log') return `${G('interact')} ${it.l.found ? 'Re-read' : 'Read'}`;
  if (it.type === 'bag') return `${G('interact')} Recover your pack`;
  if (it.type === 'revive') return `${G('interact')} Revive ${it.m.def.name} (1 food)`;
  if (it.type === 'sleep') return !isNight ? 'You can only sleep at night' : raidActive ? 'Can\'t sleep during a raid' : (tod > 0.6 && lastRaidDay !== dayNo && core) ? 'Hold out. The raid is coming' : `${G('interact')} Sleep until morning`;
}
function interact() {
  const it = nearestInteract(); if (!it) return;
  if (it.type === 'feed') { const f = it.m.def.food; if (inv[f] > 0) { inv[f]--; tameMutant(it.m); } else toast(`Needs ${ITEM_NAMES[f]}.`, '#ff7a5a'); }
  if (it.type === 'hook') it.act();
  if (it.type === 'loot') lootPile(it.l);
  if (it.type === 'log') readLog(it.l);
  if (it.type === 'bag') { for (const k in deathBag.items) inv[k] += deathBag.items[k]; scene.remove(deathBag.g); deathBag = null; toast('Recovered your pack.', '#6fd46a'); sound.pickup(); }
  if (it.type === 'revive') { const k = inv.meat > 0 ? 'meat' : inv.meal > 0 ? 'meal' : null; if (!k) return toast('Need 1 food to revive.', '#ff7a5a'); inv[k]--; const m = it.m; m.ko = false; m.hp = m.maxHp * 0.6; m.state = 'move'; m.b.body.rotation.z = 0; toast(`${m.def.name} is back on its feet.`, '#6fd46a'); sound.tame(); }
  if (it.type === 'sleep') { if (isNight && !raidActive && !(tod > 0.6 && lastRaidDay !== dayNo && core)) sleep(); }
}
function readLog(l) {
  const first = !l.found; l.found = true; const L = LOGS[l.i]; $('rtitle').textContent = L.title; $('rtext').textContent = L.text; openPanel('reader'); sound.click();
  if (first) { toast(`Data recovered (${foundLogs()}/4)`, '#8fe08a'); if (foundLogs() === 4) setTimeout(() => banner('YOU CAUSED THE FALL', 'The Verdant Heart still beats beneath Verdant Labs. The gold bunker in Verdant Heights leads there. Redeem yourself... or embrace it.', 9000), 600); }
}
function sleep() {
  $('sleepfade').style.opacity = 1; paused = true;
  setTimeout(() => { if (tod > 0.5) dayNo++; tod = 0.26; P.hp = 100; P.sick = false; P.stam = 100; P.hunger = Math.max(5, P.hunger - 15); P.thirst = Math.max(5, P.thirst - 20); lastRaidDay = dayNo - 1;
    for (const m of mutants) if (!m.tamed && !m.dead && m.pos.distanceTo(P.pos) < 40) { scene.remove(m.g); m.remove = true; }
    $('sleepfade').style.opacity = 0; paused = false; banner('DAY ' + dayNo, 'Rested. Fully healed.'); }, 1200);
}

// ---------------------------------------------------------------- build mode
const build = { active: false, type: 'wall', rot: 0, ghost: null, valid: false };
const ghostOK = new THREE.MeshBasicMaterial({ color: 0x7dff7a, transparent: true, opacity: 0.35, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.35, depthWrite: false });
const RECIPES = [
  { id: 'wall', name: 'Scrap Wall', desc: 'Blocks mutants. 250 HP. Stack them into a perimeter.', cost: { scrap: 4 }, build: true },
  { id: 'turret', name: 'Auto Turret', desc: 'Tracks targets with a red laser sight.', cost: { scrap: 10, parts: 2 }, build: true },
  { id: 'campfire', name: 'Campfire', desc: 'Warm light. Cook meals within 5 m.', cost: { scrap: 2 }, build: true },
  { id: 'floodlight', name: 'Floodlight', desc: 'Cuts through the night. Max 4.', cost: { scrap: 6 }, build: true, cond: () => structs.filter(s => s.type === 'floodlight').length < 4 },
  { id: 'core', name: 'Base Core', desc: 'Your main base. Raids hit it every night.', cost: { scrap: 15 }, build: true, cond: () => !core },
  { id: 'meal', name: 'Cooked Meal', desc: 'Safe food + Well Fed buff. Needs a campfire nearby.', cost: { meat: 1 }, cond: () => structs.some(s => s.type === 'campfire' && s.pos.distanceTo(P.pos) < 5), why: 'stand near a campfire' },
  { id: 'ammo', name: 'Rifle Ammo ×20', desc: 'Hand-pressed from scrap.', cost: { scrap: 3 } },
  { id: 'meds', name: 'Medicine', desc: 'Cures sickness, +35 HP.', cost: { scrap: 2, water: 1 } },
  { id: 'laser', name: 'Drone: Laser Emitter', desc: 'Upgrades your drone from rattling bolts to a searing laser.', cost: { scrap: 8, parts: 5 }, cond: () => !drone.laser, why: 'installed' },
];
const afford = c => Object.entries(c).every(([k, v]) => inv[k] >= v);
const pay = c => Object.entries(c).forEach(([k, v]) => inv[k] -= v);
function doRecipe(r) {
  if (!afford(r.cost) || (r.cond && !r.cond())) { sound.click(); return; }
  if (r.build) { closePanels(); enterBuild(r.id); return; }
  pay(r.cost); sound.build();
  if (r.act) r.act();
  if (r.id === 'meal') { inv.meal++; toast('Cooked a meal over the fire.'); }
  if (r.id === 'ammo') { P.reserve += 20; toast('+20 Rifle Ammo'); }
  if (r.id === 'meds') { inv.meds++; toast('Brewed Medicine.'); }
  if (r.id === 'laser') { drone.laser = true; drone.ringMat.emissive.set(0xff6a2a); drone.eye.material.color.set(0xffb080); toast('Drone upgraded: <b>Laser Emitter</b>', '#ff8a4a'); }
  renderCraft();
}
function enterBuild(type) {
  const r = RECIPES.find(r => r.id === type); if (r.cond && !r.cond()) { toast(`Can't build ${r.name} right now.`, '#ff7a5a'); return; }
  exitBuild(); build.active = true; build.type = type; build.ghost = makeStructMesh(type); build.ghost.traverse(o => { if (o.isMesh) { o.material = ghostOK; o.castShadow = false; } }); scene.add(build.ghost);
  $('buildhint').style.display = 'block';
}
function exitBuild() { if (build.ghost) scene.remove(build.ghost); build.ghost = null; build.active = false; $('buildhint').style.display = 'none'; }
function updateBuild() {
  if (!build.active) return; const f = new V3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)); const d = build.type === 'wall' ? 4 : 3;
  const x = Math.round((P.pos.x + f.x * d) * 2) / 2, z = Math.round((P.pos.z + f.z * d) * 2) / 2; build.ghost.position.set(x, 0, z); build.ghost.rotation.y = build.rot;
  const r = RECIPES.find(r => r.id === build.type); const fp = footprint(build.type, x, z, build.rot) || [x - 0.6, x + 0.6, z - 0.6, z + 0.6];
  const blocked = colliders.some(c => fp[0] < c.x1 && fp[1] > c.x0 && fp[2] < c.z1 && fp[3] > c.z0) || (fp[0] < P.pos.x + 0.4 && fp[1] > P.pos.x - 0.4 && fp[2] < P.pos.z + 0.4 && fp[3] > P.pos.z - 0.4);
  build.valid = !blocked && afford(r.cost) && (!r.cond || r.cond());
  build.ghost.traverse(o => { if (o.isMesh) o.material = build.valid ? ghostOK : ghostBad; });
  $('buildhint').innerHTML = `BUILD: <b>${r.name}</b> (${Object.entries(r.cost).map(([k, v]) => `${v} ${ITEM_NAMES[k]}`).join(', ')}) · ${G('place')} place · ${G('rotate')} rotate · ${G('cancel')} exit${blocked ? ' · <span style="color:#ff7a5a">blocked</span>' : !afford(r.cost) ? ' · <span style="color:#ff7a5a">not enough materials</span>' : ''}`;
}
function placeBuild() {
  if (!build.active || !build.valid) { sound.click(); return; } rumble(pad, 0.3, 0.2, 80); const r = RECIPES.find(r => r.id === build.type); pay(r.cost);
  const p = build.ghost.position; createStruct(build.type, p.x, p.z, build.rot); sound.build(); debris.burst(new V3(p.x, 0.5, p.z), 15, [0x6b6a63, 0x5e5a52], 3, 0.7);
  if (build.type === 'core') { toast('New Base Core raised. This is your main base now.', '#ff9a4a'); exitBuild(); }
  if (!afford(r.cost)) exitBuild();
}

// ---------------------------------------------------------------- time, raids & spawns
const DAY_LEN = 300; let tod = 0.28, dayNo = 1, raidActive = false, lastRaidDay = 0, spawnT = 2, paused = false;
function pickSpecies() { const r = Math.random(), w = Object.values(SPECIES).map(s => s.w[isNight ? 1 : 0]); const tot = w.reduce((a, b) => a + b); let x = r * tot; const ks = Object.keys(SPECIES); for (let i = 0; i < ks.length; i++) { x -= w[i]; if (x <= 0) return ks[i]; } return ks[0]; }
function freeSpot(cx, cz, rmin, rmax) { for (let k = 0; k < 30; k++) { const a = R(0, 6.28), r = R(rmin, rmax), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (Math.abs(x) < MAP - 3 && Math.abs(z) < MAP - 3 && !W.inside(x, z, 2) && !colliders.some(c => x > c.x0 - 1.5 && x < c.x1 + 1.5 && z > c.z0 - 1.5 && z < c.z1 + 1.5)) return [x, z]; } return null; }
function startRaid() {
  lastRaidDay = dayNo; raidActive = true; const n = Math.max(3, Math.round((3 + dayNo * 2) * DIFF.raid));
  for (let i = 0; i < n; i++) { const s = freeSpot(core.pos.x, core.pos.z, 55, 75); if (!s) continue; const sp = i % 3 === 0 ? 'ravager' : i % 3 === 1 ? 'hollow' : 'thornling'; spawnMutant(sp, s[0], s[1], { raid: true }); }
  banner(`NIGHT ${dayNo}: RAID`, `${n} mutants are coming for your base`, 5000); sound.horn(); rumble(pad, 0.4, 0.4, 600);
}
function updateWorldTime(dt) {
  tod += dt / DAY_LEN; if (tod >= 1) { tod -= 1; dayNo++; }
  if (core && !raidActive && tod >= 0.78 && lastRaidDay !== dayNo && tod < 0.95) startRaid();
  if (raidActive) { const left = mutants.filter(m => m.raid && !m.dead).length; if (left === 0) { raidActive = false; inv.scrap += 6; banner('RAID REPELLED', '+6 Scrap salvaged from the wreckage. Sleep to skip to morning.'); } }
  if (deathBag && dayNo >= deathBag.expires) { scene.remove(deathBag.g); deathBag = null; toast('Your dropped pack has rotted away.'); }
  spawnT -= dt; if (spawnT <= 0) { spawnT = 3;
    const wild = mutants.filter(m => !m.tamed && !m.raid && !m.dead); const target = Math.round((isNight ? 9 : 6) * DIFF.spawn);
    for (const m of wild) if (m.pos.distanceTo(P.pos) > 120 && !m.def.boss) { scene.remove(m.g); m.remove = true; }
    if (wild.length < target) { const s = freeSpot(P.pos.x, P.pos.z, 40, 85); if (s && (!core || Math.hypot(s[0] - core.pos.x, s[1] - core.pos.z) > 28)) spawnMutant(pickSpecies(), s[0], s[1]); }
  }
}
// sky keyframes: [t, skyTop, horizon/fog, sunColor, sunIntensity, hemiIntensity, fogDensity]
const KEYS = [
  [0.00, '#03050b', '#0a0f14', '#6f86b0', 0.28, 0.16, 0.02], [0.21, '#060a14', '#10161c', '#6f86b0', 0.25, 0.16, 0.022],
  [0.25, '#24344e', '#6c6660', '#ff9a6a', 0.6, 0.35, 0.026], [0.29, '#3f5f82', '#9a8a78', '#ffb57a', 1.9, 0.5, 0.021],
  [0.36, '#4d7aa6', '#7f8f84', '#ffe0b0', 2.9, 0.7, 0.011], [0.5, '#4a7db5', '#8a9c92', '#fff0d8', 3.4, 0.8, 0.008],
  [0.66, '#4d70a0', '#998f7a', '#ffd59a', 2.8, 0.7, 0.01], [0.73, '#344670', '#b0683e', '#ff8040', 1.6, 0.45, 0.014],
  [0.775, '#121a2e', '#3a262c', '#a06a70', 0.4, 0.22, 0.018], [0.8, '#05080f', '#0b1016', '#6f86b0', 0.28, 0.16, 0.02], [1.0, '#03050b', '#0a0f14', '#6f86b0', 0.28, 0.16, 0.02]];
const cA = new THREE.Color(), cB = new THREE.Color();
function sampleKeys(t) { let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1][0] <= t) i++; const a = KEYS[i], b = KEYS[i + 1]; const f = (t - a[0]) / (b[0] - a[0]);
  const col = j => cA.set(a[j]).lerp(cB.set(b[j]), f).clone(); return { top: col(1), hor: col(2), sunC: col(3), sunI: lerp(a[4], b[4], f), hemiI: lerp(a[5], b[5], f), fog: lerp(a[6], b[6], f) }; }
function updateEnvironment(dt) {
  const k = sampleKeys(tod); weatherTint(k, dt); const ang = (tod - 0.25) * Math.PI * 2; const sunDir = new V3(Math.cos(ang) * 0.85, Math.sin(ang), 0.42).normalize();
  isNight = tod > 0.77 || tod < 0.23; nightF = 1 - smooth(0.2, 0.28, tod) + smooth(0.72, 0.8, tod); nightF = clamp(nightF, 0, 1);
  const lightDir = sunDir.y > -0.05 ? sunDir : sunDir.clone().negate();
  skyMat.uniforms.top.value.copy(k.top); skyMat.uniforms.bottom.value.copy(k.hor); skyMat.uniforms.sunDir.value.copy(sunDir); skyMat.uniforms.sunCol.value.copy(k.sunC).multiplyScalar(sunDir.y > -0.1 ? 1 : 0);
  skyMat.uniforms.moonDir.value.copy(sunDir).negate(); skyMat.uniforms.night.value = nightF;
  scene.fog.color.copy(k.hor); scene.fog.density = k.fog * (raidActive ? 1.1 : 1);
  sun.color.copy(k.sunC); sun.intensity = k.sunI; hemi.intensity = k.hemiI; hemi.color.copy(k.top).lerp(new THREE.Color(0xffffff), 0.5); hemi.groundColor.set(0x2a3320).multiplyScalar(0.5 + k.hemiI);
  const fc = camera.position; sun.position.copy(fc).addScaledVector(lightDir, 150); sun.target.position.copy(fc);
  sky.position.copy(fc); stars.position.copy(fc); stars.material.opacity = nightF * 0.9;
  const rayOp = clamp(sunDir.y * 3, 0, 1) * (1 - nightF) * (1 - weather.cloud) * (0.35 + 0.65 * smooth(0.008, 0.022, k.fog));
  rayMat.uniforms.op.value = rayOp * 0.32; rayMat.uniforms.col.value.copy(k.sunC);
  for (const r of rays) { r.visible = rayOp > 0.01; if (r.visible) { r.quaternion.setFromUnitVectors(new V3(0, 1, 0), sunDir); r.position.copy(r.userData.base).addScaledVector(sunDir, 45); } }
  motes.position.set(Math.floor(P.pos.x / 70) * 0, 0, 0);
  const mp = motes.geometry.attributes.position; for (let i = 0; i < mp.count; i++) { let x = mp.getX(i) + Math.sin(now * 0.3 + i) * dt * 0.3, y = mp.getY(i) + Math.sin(now * 0.5 + i * 1.7) * dt * 0.2, z = mp.getZ(i) + Math.cos(now * 0.25 + i) * dt * 0.3;
    if (x - P.pos.x > 35) x -= 70; if (x - P.pos.x < -35) x += 70; if (z - P.pos.z > 35) z -= 70; if (z - P.pos.z < -35) z += 70; mp.setXYZ(i, x, y, z); } mp.needsUpdate = true;
  motes.material.color.set(nightF > 0.5 ? 0xb8ff70 : 0xfff2d0); motes.material.size = nightF > 0.5 ? 0.07 : 0.06; motes.material.opacity = nightF > 0.5 ? 0.9 : 0.5 * (1 - nightF);
  for (const m of W.mists) { m.position.x += m.userData.v * dt; if (m.position.x > MAP) m.position.x = -MAP; m.material.opacity = 0.08 + 0.25 * smooth(0.012, 0.03, k.fog); }
  W.windUniform.value = now;
  renderer.toneMappingExposure = 1.18 + nightF * 0.12 - weather.cloud * 0.05;
  if (sound.ctx) sound.setNight(nightF);
  updateWeatherFX(dt);
}

// ---------------------------------------------------------------- HUD & minimap
const mm = $('minimap').getContext('2d');
let hudT = 0;
function updateHUD(dt) {
  hudT -= dt; $('hurt').style.opacity = clamp(P.hurtFlash + (P.hp < 30 ? 0.35 + Math.sin(now * 4) * 0.1 : 0), 0, 1); $('sick').style.opacity = P.sick ? 0.8 : 0;
  if (hudT > 0) return; hudT = 0.1;
  $('b-hp').style.width = clamp(P.hp, 0, 100) + '%'; $('b-hu').style.width = P.hunger + '%'; $('b-th').style.width = P.thirst + '%'; $('b-st').style.width = P.stam + '%';
  $('b-st').style.background = P.exhausted ? '#8a6a3a' : '#d9cf6a';
  const hrs = (tod * 24) % 24, hh = Math.floor(hrs), mi = Math.floor((hrs - hh) * 60);
  $('dayno').textContent = 'DAY ' + dayNo; $('time').textContent = String(hh).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  $('phase').textContent = raidActive ? 'RAID' : isNight ? 'NIGHT' : tod < 0.33 ? 'DAWN' : tod > 0.7 ? 'DUSK' : 'DAY'; $('phase').style.color = raidActive ? '#ff6a4a' : isNight ? '#8aa0d0' : '#9fc48a';
  $('logcount').textContent = foundLogs() ? `Recovered logs ${foundLogs()}/4` : '';
  const fx = []; if (P.sick) fx.push('<span style="color:#9fd44a">SICK</span>'); if (P.wellFed > 0) fx.push('WELL FED'); if (P.exhausted) fx.push('<span style="color:#d98b3b">EXHAUSTED</span>');
  if (P.hunger < 20) fx.push('<span style="color:#d98b3b">STARVING (shaky aim)</span>'); if (P.thirst < 20) fx.push('<span style="color:#3b9ad9">PARCHED</span>');
  const a = armorTotal(); if (a) fx.push(`ARMOR ${a.toFixed(0)}`); $('effects').innerHTML = fx.join(' · ');
  if (settings.showFps) $('fps').textContent = Math.round(fps) + ' fps · ' + (renderScale * 100 | 0) + '% res'; else $('fps').textContent = '';
  $('res').innerHTML = ['scrap', 'meat', 'meal', 'water', 'meds', 'parts'].map(k => `<span>${ITEM_NAMES[k]} <b>${inv[k]}</b></span>`).join('');
  $('ammo').innerHTML = (P.reloading > 0 ? '<span style="opacity:.5">RELOADING</span>' : P.clip) + ` <small>/ ${P.reserve}</small>`; $('wname').textContent = 'SCRAP RIFLE' + (drone.laser ? ' · DRONE: LASER' : ' · DRONE: BOLTS');
  const t = activeTame; $('tameinfo').innerHTML = t ? `◆ ${t.alpha ? 'Alpha ' : ''}${t.shiny ? 'Shiny ' : ''}${t.def.name} · ${t.ko ? '<span style="color:#ff7a5a">KNOCKED OUT</span>' : Math.round(t.hp / t.maxHp * 100) + '%'} · Bond ${1 + Math.floor(t.bond / 3)}` + (mutants.filter(m => m.tamed && m.atBase).length ? `<br><small>${mutants.filter(m => m.tamed && m.atBase).length} guarding base</small>` : '') : '';
  const it = state === 'play' && !build.active && !openP && !photo.on ? nearestInteract() : null; const pt = promptText(it); $('prompt').style.display = pt ? 'block' : 'none'; $('prompt').innerHTML = pt;
  drawMinimap();
}
function drawMinimap() {
  const S = 100 / 62; mm.clearRect(0, 0, 200, 200);
  const g = mm.createRadialGradient(100, 100, 10, 100, 100, 100); g.addColorStop(0, 'rgba(18,28,18,0.85)'); g.addColorStop(1, 'rgba(6,10,6,0.9)'); mm.fillStyle = g; mm.fillRect(0, 0, 200, 200);
  mm.save(); mm.translate(100, 100); mm.rotate(P.yaw); mm.scale(S, S); mm.translate(-P.pos.x, -P.pos.z);
  for (const c of colliders) { if (Math.abs(c.x0 - P.pos.x) > 90 || Math.abs(c.z0 - P.pos.z) > 90) continue;
    mm.fillStyle = c.kind === 'building' ? 'rgba(120,130,110,0.55)' : c.kind === 'car' ? 'rgba(140,80,40,0.6)' : c.kind === 'struct' ? '#c9b07a' : 'rgba(60,110,40,0.5)'; mm.fillRect(c.x0, c.z0, c.x1 - c.x0, c.z1 - c.z0); }
  const dotf = (x, z, r, col) => { mm.fillStyle = col; mm.beginPath(); mm.arc(x, z, r, 0, 7); mm.fill(); };
  for (const s of structs) { if (s.type === 'turret') dotf(s.pos.x, s.pos.z, 1.2, '#ff4a3a'); if (s.type === 'campfire' || s.type === 'floodlight') dotf(s.pos.x, s.pos.z, 1, '#ffb060'); }
  if (core) { dotf(core.pos.x, core.pos.z, 2.6, '#ff8a2a'); }
  for (const m of mutants) { if (m.dead) continue; const col = m.tamed ? '#6fff6a' : m.state === 'stunned' ? '#ffd040' : m.state === 'burrowed' ? 'rgba(170,120,70,0.8)' : m.raid ? '#ff3030' : '#e04a3a';
    dotf(m.pos.x, m.pos.z, (m.sp === 'ravager' ? 1.8 : 1.3) * (m.alpha ? 1.4 : 1), col); }
  for (const mk of mapMarkers) { if (mk.hidden && mk.hidden()) continue; const col = typeof mk.col === 'function' ? mk.col() : mk.col; mm.fillStyle = col; mm.save(); mm.translate(mk.x, mk.z); mm.rotate(Math.PI / 4); const r = mk.r || 2.2; mm.fillRect(-r, -r, r * 2, r * 2); mm.strokeStyle = 'rgba(0,0,0,0.7)'; mm.lineWidth = 0.6; mm.strokeRect(-r, -r, r * 2, r * 2); mm.restore(); }
  if (deathBag) { mm.strokeStyle = '#ff4030'; mm.lineWidth = 0.8; const { x, z } = deathBag.pos; mm.beginPath(); mm.moveTo(x - 2, z - 2); mm.lineTo(x + 2, z + 2); mm.moveTo(x + 2, z - 2); mm.lineTo(x - 2, z + 2); mm.stroke(); }
  mm.restore();
  mm.fillStyle = '#fff'; mm.beginPath(); mm.moveTo(100, 93); mm.lineTo(105, 105); mm.lineTo(100, 102); mm.lineTo(95, 105); mm.fill();
  const n = $('mapN'); n.style.left = (100 + Math.sin(P.yaw) * 88) + 'px'; n.style.top = (94 - Math.cos(P.yaw) * 88) + 'px'; n.style.transform = 'none';
}

// ---------------------------------------------------------------- menus & panels
function renderKeysBar() {
  const m = lastInput === 'pad' ? 'pad' : lastInput === 'touch' ? 'touch' : 'kb';
  $('keys').innerHTML = [['move', 'move'], ['look', 'aim'], ['fire', 'fire'], ['ads', 'aim down sights'], ['interact', 'use'], ['reload', 'reload'], ['craft', 'craft'], ['build', 'build'], ['camera', 'camera'], ['photo', 'photo'], ['pause', 'menu']].map(([a, l]) => `${G(a, m)} ${l}`).join(' &nbsp; ');
  $('craftFoot').innerHTML = lastInput === 'pad' ? `${G('confirm')} select &nbsp; ${G('back')} close &nbsp; ${padGlyph('RS')} scroll` : `${G('craft')} / ${G('back')} close`;
  const pa = $('pressany'); if (pa) pa.innerHTML = lastInput === 'pad' ? `PRESS ${padGlyph('A')} TO START` : isTouchDevice ? 'TAP TO START' : 'PRESS ANY BUTTON';
}
function renderPadStatus() {
  const p = navigator.getGamepads ? [...navigator.getGamepads()].find(p => p && p.connected) : null;
  $('padStatus').innerHTML = p ? `🎮 Controller connected · ${padGlyph('A')} select ${padGlyph('B')} back` : 'Controller? Press any button on it to connect';
}
const CONTROL_ROWS = [['Move', 'move'], ['Look / aim', 'look'], ['Fire', 'fire'], ['Aim down sights', 'ads'], ['Reload', 'reload'], ['Jump', 'jump'], ['Sprint', 'sprint'], ['Interact / loot / feed / sleep', 'interact'],
  ['Craft & inventory', 'craft'], ['Build mode', 'build'], ['Rotate piece', 'rotate'], ['Place piece', 'place'], ['Exit build', 'cancel'], ['Eat', 'eat'], ['Drink', 'drink'], ['Medicine', 'meds'], ['Flashlight', 'light'],
  ['Toggle 1st / 3rd person', 'camera'], ['Mount / dismount tame', 'mount'], ['Photo mode', 'photo'], ['Pause menu', 'pause']];
function renderControls() {
  $('ctrlTable').innerHTML = `<table><tr><th>ACTION</th><th>KEYBOARD & MOUSE</th><th>XBOX CONTROLLER</th><th>TOUCH</th></tr>${CONTROL_ROWS.map(([l, a]) => `<tr><td>${l}</td><td>${G(a, 'kb')}</td><td>${G(a, 'pad')}</td><td>${G(a, 'touch')}</td></tr>`).join('')}</table>
  <p class="dim">Aim assist is light and only applies to controllers. It slows the reticle near targets and gently follows them. Toggle it in Settings.<br>On iPad, connect an Xbox controller over Bluetooth, then press any button. Touch controls hide automatically while the controller is in use.</p>`;
}
const QUALITIES = ['low', 'medium', 'high', 'ultra'];
const SETTINGS_SPEC = [
  { k: 'quality', label: 'Graphics quality', type: 'cycle', opts: QUALITIES, names: { low: 'LOW', medium: 'MEDIUM', high: 'HIGH', ultra: 'ULTRA' } },
  { k: 'camera', label: 'Camera', type: 'cycle', opts: ['third', 'first'], names: { third: 'THIRD PERSON', first: 'FIRST PERSON' } },
  { k: 'aimAssist', label: 'Aim assist <small>(controller only, light)</small>', type: 'bool' },
  { k: 'rumble', label: 'Controller rumble', type: 'bool' },
  { k: 'sens', label: 'Look sensitivity', type: 'range', min: 0.3, max: 2.5, step: 0.05 },
  { k: 'invertY', label: 'Invert Y', type: 'bool' },
  { k: 'volume', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05 },
  { k: 'dynRes', label: 'Dynamic resolution <small>(holds frame rate)</small>', type: 'bool' },
  { k: 'showFps', label: 'Show FPS / resolution', type: 'bool' },
];
function renderSettings() {
  const rows = SETTINGS_SPEC.map(s => {
    const v = settings[s.k];
    if (s.type === 'cycle') return `<div class="row"><span>${s.label}</span><button class="cyc" data-cycle data-k="${s.k}">◀ ${s.names[v] || v} ▶</button></div>`;
    if (s.type === 'bool') return `<label class="row"><span>${s.label}</span><input type="checkbox" data-k="${s.k}" ${v ? 'checked' : ''}></label>`;
    return `<label class="row"><span>${s.label}</span><input type="range" data-k="${s.k}" min="${s.min}" max="${s.max}" step="${s.step}" value="${v}"></label>`;
  });
  if (state === 'play') rows.push(`<div class="row"><span>Difficulty <small>(can only be lowered mid-game)</small></span><button class="cyc" data-cycle data-k="difficulty">◀ ${DIFF.label.toUpperCase()} ▶</button></div>`);
  const focusK = nav.cur && nav.cur.dataset.k;
  $('setRows').innerHTML = rows.join('');
  $('setRows').querySelectorAll('[data-k]').forEach(el => {
    const k = el.dataset.k, spec = SETTINGS_SPEC.find(s => s.k === k);
    const cyc = dir => {
      if (k === 'difficulty') { const ks = Object.keys(DIFFS); const ni = clamp(ks.indexOf(difficulty) + dir, 0, DIFF.rank); if (ks[ni] !== difficulty) { difficulty = ks[ni]; DIFF = DIFFS[difficulty]; toast('Difficulty lowered to ' + DIFF.label); } else toast('Difficulty can only be lowered mid-game.', '#e6d17a'); }
      else { const o = spec.opts; settings[k] = o[(o.indexOf(settings[k]) + dir + o.length) % o.length]; }
      afterSetting(k); renderSettings(); sound.uiMove();
    };
    if (el.dataset.cycle !== undefined) { el.onclick = () => cyc(1); el.addEventListener('cycle', e => cyc(e.detail)); }
    else if (el.type === 'checkbox') el.onchange = () => { settings[k] = el.checked; afterSetting(k); };
    else el.oninput = () => { settings[k] = +el.value; afterSetting(k); };
  });
  if (focusK && lastInput === 'pad') nav.focus($('setRows').querySelector(`[data-k="${focusK}"]`));
}
function afterSetting(k) { saveSettings(); if (k === 'volume') sound.setVolume(settings.volume); if (k === 'rumble') setRumble(settings.rumble); if (k === 'quality' && typeof applyQuality === 'function') applyQuality(); }
function renderCraft() {
  const fk = nav.cur && nav.cur.dataset.key;
  $('recipes').innerHTML = RECIPES.filter(r => !r.hidden || r.hidden()).map((r, i) => { const ok = afford(r.cost) && (!r.cond || r.cond());
    return `<button class="rec ${ok ? '' : 'no'}" data-key="r-${r.id}" data-id="${r.id}"><div><b>${r.name}</b><small>${r.desc}${r.cond && !r.cond() && r.why ? ' (' + r.why + ')' : ''}</small></div><div class="cost">${Object.entries(r.cost).map(([k, v]) => `<span style="color:${inv[k] >= v ? '#cfe8a0' : '#ff7a5a'}">${v} ${ITEM_NAMES[k]}</span>`).join('<br>')}${r.build ? '<br><small>BUILD</small>' : ''}</div></button>`; }).join('');
  $('recipes').querySelectorAll('.rec').forEach(el => el.onclick = () => doRecipe(RECIPES.find(r => r.id === el.dataset.id)));
  const use = { meat: 'eat', meal: 'eat', veg: 'eat', water: 'drink', meds: 'meds' };
  $('inv').innerHTML = Object.keys(ITEM_NAMES).map(k => `<div class="il"><span>${ITEM_NAMES[k]}</span><span><b>${inv[k] || 0}</b>${use[k] && inv[k] > 0 ? `<button data-key="u-${k}" data-use="${k}">${use[k] === 'eat' ? 'EAT' : use[k] === 'drink' ? 'DRINK' : 'USE'}</button>` : ''}</span></div>`).join('') + `<div class="il"><span>Rifle Ammo</span><b>${P.clip} + ${P.reserve}</b></div>`;
  $('inv').querySelectorAll('[data-use]').forEach(b => b.onclick = () => { const k = b.dataset.use; if (k === 'water') drink(); else if (k === 'meds') useMeds(); else eatSpecific(k); renderCraft(); });
  $('gear').innerHTML = ['head', 'torso', 'legs'].map(s => { const g = gear[s]; return `<div class="gear">${s.toUpperCase()}: ${g ? `<b style="color:${RARITY[g.rarity].c}">${RARITY[g.rarity].n} ${g.name}</b> <small>armor ${g.armor} · warmth ${g.warmth}${g.effect ? ' · ' + g.effect : ''}</small>` : '<small>rags</small>'}</div>`; }).join('') + `<div class="gear"><small>Total armor ${armorTotal().toFixed(0)} (−${Math.round(Math.min(60, armorTotal() * 3))}% damage)${setBonus() ? ' · ' + setBonus() : ''}</small></div>`;
  $('cards').innerHTML = typeof cardsHTML === 'function' ? cardsHTML() : '<div class="dim">None</div>';
  const SP = Object.entries(SPECIES).filter(([, s]) => !s.noBestiary);
  $('bestiary').innerHTML = SP.map(([k, s]) => bestiary[k].seen ? `<div class="be"><b>${s.name}</b>${bestiary[k].tamed ? ` <span style="color:#6fd46a">· tamed ×${bestiary[k].tamed}</span>` : ''}<br>${s.desc}<br><span style="color:#e6d17a">Favorite food: ${ITEM_NAMES[s.food]}</span> · ${s.tame}</div>` : `<div class="be"><b>???</b><br><span class="dim">Not yet encountered.</span></div>`).join('') + `<div class="dim">Species: ${SP.filter(([k]) => bestiary[k].seen).length}/${SP.length} seen · ${SP.filter(([k]) => bestiary[k].tamed).length}/${SP.length} tamed</div>`;
  $('logs').innerHTML = logs.filter(l => l.found).sort((a, b) => a.i - b.i).map(l => `<button class="lg" data-key="l-${l.i}" data-i="${l.i}">▸ ${LOGS[l.i].title}</button>`).join('') || '<div class="dim">Nothing yet. The past is buried in the ruins.</div>';
  $('logs').querySelectorAll('.lg').forEach(el => el.onclick = () => readLog(logs.find(l => l.i === +el.dataset.i)));
  if (openP === 'craft') { nav.root = $('craft'); const el = fk && $('craft').querySelector(`[data-key="${fk}"]`); if (el) nav.focus(el); else if (lastInput === 'pad') nav.focusFirst(); }
  renderKeysBar();
}
function eatSpecific(k) { if (k === 'meal' || (k === 'veg' && inv.meal === 0) || (k === 'meat' && inv.meal === 0 && !inv.veg)) return eat(); const save = {}; for (const o of ['meal', 'veg', 'meat']) if (o !== k) { save[o] = inv[o]; inv[o] = 0; } eat(); Object.assign(inv, save); }
$('respawn').onclick = () => respawn();
$('readerClose').onclick = () => closePanels();
$('pause').querySelectorAll('[data-act]').forEach(b => b.onclick = () => pauseAct(b.dataset.act));
function pauseAct(a) {
  if (a === 'resume') closePanels();
  if (a === 'settings') openPanel('settings', 'pause'); if (a === 'controls') openPanel('controls', 'pause');
  if (a === 'save') openSaves('save', 'pause'); if (a === 'load') openSaves('load', 'pause');
  if (a === 'photo') { closePanels(true); enterPhoto(); }
  if (a === 'quit') { if (typeof autosave === 'function') autosave(); sound.uiBack(); $('sleepfade').style.opacity = 1; setTimeout(() => location.reload(), 700); }
}
// generic dialog (trader, travel, endings...)
function dialog(title, body, buttons) {
  $('dlgTitle').innerHTML = title; $('dlgBody').innerHTML = body;
  $('dlgBtns').innerHTML = buttons.map((b, i) => `<button class="big ${i ? 'ghost' : ''}" data-i="${i}" ${b.disabled ? 'disabled' : ''}>${b.label}</button>`).join('');
  $('dlgBtns').querySelectorAll('button').forEach(el => el.onclick = () => { const b = buttons[+el.dataset.i]; if (b.keep) b.fn(); else { closePanels(); b.fn && b.fn(); } });
  openPanel('dlg');
}

// ---------------------------------------------------------------- title screen (cinematic)
(() => { const L = 'RUINBORN'; $('logo').innerHTML = [...L].map((c, i) => `<span class="${i === 4 ? 'broken' : ''}" style="animation-delay:${(Math.random() * 6).toFixed(2)}s">${c}</span>`).join(''); })();
setInterval(() => { if (state === 'title' && Math.random() < 0.5) { const l = $('logo'); l.classList.add('glitch'); setTimeout(() => l.classList.remove('glitch'), 260); } }, 2600);
document.body.classList.add('cine');
const menuBtns = [...$('menu').querySelectorAll('[data-act]')];
function diffLabel() { $('diffVal').textContent = DIFFS[difficulty].label.toUpperCase(); $('diffDesc').textContent = { chill: 'Gentle drain, weaker mutants, small raids', normal: 'The intended experience', brutal: 'Harsh survival, huge raids. Can only be lowered later.' }[difficulty]; }
diffLabel();
function revealMenu() {
  if (titleSub !== 'attract') return; titleSub = 'menu'; sound.init(); sound.resume(); sound.whoosh();
  $('pressany').classList.add('hidden'); showTitleMenu();
}
function showTitleMenu() {
  $('menu').classList.remove('hidden'); $('title').classList.remove('hidden');
  const has = typeof latestSave === 'function' && latestSave(); const c = $('menu').querySelector('[data-act=continue]');
  c.disabled = !has; $('contInfo').textContent = has ? `Day ${has.dayNo} · ${DIFFS[has.difficulty].label} · ${new Date(has.at).toLocaleString()}` : 'No save yet';
  nav.setRoot($('menu'), () => {}, has ? '[data-act=continue]' : '[data-act=new]'); if (lastInput !== 'pad') nav.clear();
}
menuBtns.forEach(b => {
  b.addEventListener('mouseenter', () => sound.uiMove());
  const act = dir => {
    const a = b.dataset.act; sound.uiSelect();
    if (a === 'new') openCreator(); if (a === 'continue') { const s = latestSave(); if (s) startGame(s); }
    if (a === 'difficulty') { const ks = Object.keys(DIFFS); difficulty = ks[(ks.indexOf(difficulty) + (dir || 1) + 3) % 3]; diffLabel(); }
    if (a === 'settings') openPanel('settings', 'title'); if (a === 'controls') openPanel('controls', 'title');
    if (a === 'load') openSaves('load', 'title'); if (a === 'gallery') openGallery('title');
  };
  b.onclick = () => act(1); b.addEventListener('cycle', e => act(e.detail));
});
const SHOTS = [
  { a: [20, 1.7, 62], b: [20, 2.6, 26], la: [20, 9, -30], lb: [21, 11, -30], tod: 0.3 },
  { a: [-14, 0.55, 16], b: [-6, 0.9, 10], la: [0, 2.2, 0], lb: [0, 2.2, 0], tod: 0.3 },
  { a: [-21, 2, 40], b: [-21, 24, 34], la: [-40, 12, -40], lb: [-20, 8, -60], tod: 0.33 },
  { orbit: true, tod: 0.81 },
];
let titleT = 0;
function titleCam(dt) {
  titleT += dt; const D = 10, k = Math.floor(titleT / D) % SHOTS.length, f = (titleT % D) / D, sh = SHOTS[k];
  const e = f * f * (3 - 2 * f);
  if (sh.orbit) { const a = titleT * 0.05; camera.position.set(Math.sin(a) * 24, 7 + Math.sin(titleT * 0.2) * 1.5, Math.cos(a) * 24); camera.lookAt(0, 2.5, 0); }
  else { camera.position.set(lerp(sh.a[0], sh.b[0], e), lerp(sh.a[1], sh.b[1], e), lerp(sh.a[2], sh.b[2], e)); camera.lookAt(lerp(sh.la[0], sh.lb[0], e), lerp(sh.la[1], sh.lb[1], e), lerp(sh.la[2], sh.lb[2], e)); }
  tod = sh.tod + f * 0.01; camera.fov = 60; camera.updateProjectionMatrix();
  $('sleepfade').style.transition = 'none'; $('sleepfade').style.opacity = Math.max(0, 1 - f / 0.06, (f - 0.94) / 0.06);
  camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion); vm.visible = false; playerModel.root.visible = false;
}

// ---------------------------------------------------------------- game state
function startGame(save) {
  if (state === 'play') return;
  if (lastInput === 'touch' && !navigator.standalone && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {}); sound.init(); sound.setVolume(settings.volume); sound.whoosh();
  $('sleepfade').style.transition = 'opacity .7s'; $('sleepfade').style.opacity = 1;
  setTimeout(() => {
    DIFF = DIFFS[difficulty]; state = 'play'; closePanels(true);
    $('title').classList.add('hidden'); document.body.classList.remove('cine'); $('hud').classList.remove('hidden');
    tod = 0.28; P.pos.set(0, 0, 7); P.yaw = 0; P.pitch = 0; camera.position.set(0, 2, 11);
    mutants.forEach(m => { if (m.pos.distanceTo(P.pos) < 30) { scene.remove(m.g); m.remove = true; } });
    for (const m of mutants) if (!m.remove) m.maxHp = m.hp = m.def.hp * DIFF.mhp * (m.alpha ? 2 : 1);
    if (save && typeof applySave === 'function') applySave(save);
    lockMouse(); onModeChange();
    $('sleepfade').style.opacity = 0;
    if (!save) {
      banner('RUINBORN', 'You wake alone in the ruins. No memory. A cracked badge on your jacket, the number scratched away.', 6500);
      const hints = [[7, () => `Scavenge debris piles ${G('interact')} for scrap, food, water, ammo and clothing.`], [15, () => `Craft ${G('craft')} and build ${G('build')} at your camp. Night brings a raid.`], [24, () => 'Weaken a mutant to 25%, then feed it its favorite food to tame it.'], [34, () => 'Old VERDANT terminals glow green somewhere in the city...']];
      hints.forEach(([s, h]) => setTimeout(() => toast(h(), '#c9e3a0'), s * 1000));
    } else banner('DAY ' + dayNo, 'Welcome back.');
  }, 750);
}
// ---------------------------------------------------------------- M4: quality presets, dynamic resolution, weather FX
const QPRESET = {
  low: { pr: 0.75, maxPr: 1, msaa: 0, shadow: 1024, soft: false, bloom: false, dens: 0.0, rain: 0.35, aniso: 2 },
  medium: { pr: 1, maxPr: 1.5, msaa: 2, shadow: 2048, soft: true, bloom: true, dens: 0.5, rain: 0.6, aniso: 4 },
  high: { pr: 1, maxPr: 2, msaa: 4, shadow: 2048, soft: true, bloom: true, dens: 0.85, rain: 0.85, aniso: 8 },
  ultra: { pr: 1, maxPr: 4, msaa: 4, shadow: 4096, soft: true, bloom: true, dens: 1, rain: 1, aniso: 16 },
};
let Q = QPRESET[settings.quality] || QPRESET.high, basePR = 1, dynT = 0;
if (settings.dynRes === undefined) settings.dynRes = true;
function applyQuality() {
  Q = QPRESET[settings.quality] || QPRESET.high;
  basePR = Math.min(devicePixelRatio || 1, Q.maxPr) * Q.pr; renderScale = 1; setPR();
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) { if (rt.samples !== Q.msaa) { rt.samples = Q.msaa; rt.dispose(); } }
  if (sun.shadow.mapSize.x !== Q.shadow) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  const st = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap; if (renderer.shadowMap.type !== st) { renderer.shadowMap.type = st; renderer.shadowMap.needsUpdate = true; }
  bloom.enabled = Q.bloom;
  for (const d of W.dens) d.m.count = Math.max(1, Math.round(d.max * (d.min + (1 - d.min) * Q.dens)));
  rainMesh.geometry.setDrawRange(0, Math.round(RAIN_N * Q.rain) * 2); snowPts.geometry.setDrawRange(0, Math.round(SNOW_N * Q.rain));
}
function setPR() { const pr = Math.max(0.5, basePR * renderScale); renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight); }
function dynamicResolution(f) {
  if (!settings.dynRes || state !== 'play') { if (renderScale !== 1 && !settings.dynRes) { renderScale = 1; setPR(); } return; }
  dynT++; if (dynT < 2) return; dynT = 0;
  const target = 50;
  if (f < target - 6 && renderScale > 0.6) { renderScale = Math.max(0.6, renderScale - 0.1); setPR(); }
  else if (f > target + 8 && renderScale < 1) { renderScale = Math.min(1, renderScale + 0.05); setPR(); }
}
function QUALITY_BLOOM() { return true; } // composer always (OutputPass does tone mapping); bloom pass toggles itself

// ---------------------------------------------------------------- weather
// type: clear | cloudy | rain | storm | snow. intensity eases toward the target so transitions are gradual
const WEATHERS = { clear: { cloud: 0, rain: 0, fog: 1, wind: 0.25 }, cloudy: { cloud: 0.55, rain: 0, fog: 1.4, wind: 0.5 }, rain: { cloud: 0.8, rain: 0.7, fog: 1.9, wind: 0.8 }, storm: { cloud: 1, rain: 1, fog: 2.3, wind: 1.6 }, snow: { cloud: 0.7, rain: 0, snow: 1, fog: 2.0, wind: 0.5 } };
const weather = { type: 'clear', t: 90, cloud: 0, rain: 0, snow: 0, fogM: 1, wind: 0.25, flash: 0, nextBolt: 6, wet: 0 };
function pickWeather() {
  const s = typeof seasonWeights === 'function' ? seasonWeights() : { clear: 4, cloudy: 3, rain: 2, storm: 1, snow: 0 };
  const tot = Object.values(s).reduce((a, b) => a + b, 0); let x = Math.random() * tot; for (const k in s) { x -= s[k]; if (x <= 0) return k; } return 'clear';
}
function setWeather(type, dur) { weather.type = type; weather.t = dur || R(70, 160); if (type === 'storm' && state === 'play') { banner('STORM', 'Lightning and heavy rain. Find shelter or light the base.', 3500); } }
const RAIN_N = 7000, SNOW_N = 4000;
const rainUni = { uTime: { value: 0 }, uCam: { value: new V3() }, uAmt: { value: 0 }, uWind: { value: new THREE.Vector2(0.15, 0.05) }, uCol: { value: new THREE.Color(0xaabbc8) } };
const rainMesh = (() => {
  const base = new Float32Array(RAIN_N * 2 * 3), end = new Float32Array(RAIN_N * 2);
  for (let i = 0; i < RAIN_N; i++) { const x = R(0, 44), y = R(0, 26), z = R(0, 44); base.set([x, y, z, x, y, z], i * 6); end[i * 2] = 0; end[i * 2 + 1] = 1; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(base, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
  const m = new THREE.ShaderMaterial({ uniforms: rainUni, transparent: true, depthWrite: false, fog: false,
    vertexShader: `uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; attribute float aEnd; varying float vA;
      void main(){ vec3 p = position; float sp = 22.0 + fract(p.x*7.13)*6.0;
        p.y = mod(p.y - uTime*sp, 26.0); p.x = mod(p.x - uCam.x + uWind.x*p.y, 44.0) - 22.0 + uCam.x; p.z = mod(p.z - uCam.z + uWind.y*p.y, 44.0) - 22.0 + uCam.z; p.y += uCam.y - 8.0;
        p += vec3(uWind.x, 1.0, uWind.y) * aEnd * 0.55; vA = aEnd; gl_Position = projectionMatrix * viewMatrix * vec4(p,1.0); }`,
    fragmentShader: `uniform float uAmt; uniform vec3 uCol; varying float vA; void main(){ gl_FragColor = vec4(uCol, uAmt * 0.38 * vA); }` });
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false; l.visible = false; scene.add(l); return l;
})();
const snowUni = { uTime: { value: 0 }, uCam: { value: new V3() }, uAmt: { value: 0 }, uMap: { value: glowTex } };
const snowPts = (() => {
  const p = new Float32Array(SNOW_N * 3); for (let i = 0; i < SNOW_N; i++) p.set([R(0, 40), R(0, 22), R(0, 40)], i * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const m = new THREE.ShaderMaterial({ uniforms: snowUni, transparent: true, depthWrite: false, fog: false,
    vertexShader: `uniform float uTime; uniform vec3 uCam; void main(){ vec3 p = position; float ph = p.x*3.1+p.z*1.7;
      p.y = mod(p.y - uTime*(1.4+fract(ph)*0.8), 22.0); p.x += sin(uTime*0.8+ph)*0.6; p.x = mod(p.x - uCam.x, 40.0) - 20.0 + uCam.x; p.z = mod(p.z - uCam.z, 40.0) - 20.0 + uCam.z; p.y += uCam.y - 6.0;
      vec4 mv = viewMatrix*vec4(p,1.0); gl_PointSize = clamp(90.0 / -mv.z, 1.5, 14.0); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform float uAmt; uniform sampler2D uMap; void main(){ float a = texture2D(uMap, gl_PointCoord).a; gl_FragColor = vec4(vec3(0.92,0.95,1.0), a*uAmt*0.85); }` });
  const pt = new THREE.Points(g, m); pt.frustumCulled = false; pt.visible = false; scene.add(pt); return pt;
})();
const cloudCol = new THREE.Color(0x5d666c), stormCol = new THREE.Color(0x2a3036);
// called by updateEnvironment with the sampled sky keyframe; tints it for clouds/rain
function weatherTint(k, dt) {
  if (state === 'play' && !photo.on) { weather.t -= dt; if (weather.t <= 0) setWeather(pickWeather()); }
  const w = WEATHERS[weather.type], e = 1 - Math.exp(-dt * 0.25);
  weather.cloud = lerp(weather.cloud, w.cloud, e); weather.rain = lerp(weather.rain, w.rain, e); weather.snow = lerp(weather.snow, w.snow || 0, e);
  weather.fogM = lerp(weather.fogM, w.fog, e); weather.wind = lerp(weather.wind, w.wind, e);
  weather.wet = clamp(weather.wet + (weather.rain > 0.2 ? dt * 0.03 : -dt * 0.006), 0, 1);
  const c = weather.cloud, grey = weather.type === 'storm' ? stormCol : cloudCol;
  const lum = k.hor.r * 0.3 + k.hor.g * 0.59 + k.hor.b * 0.11;
  k.top.lerp(cA.copy(grey).multiplyScalar(0.5 + lum * 2.2), c * 0.92); k.hor.lerp(cB.copy(grey).multiplyScalar(0.6 + lum * 2.0), c * 0.75);
  k.sunI *= 1 - c * 0.72; k.hemiI *= 1 - c * 0.2; k.fog *= weather.fogM; k.sunC.lerp(cA.set(0xc8ccd0), c * 0.5);
  // lightning
  if (weather.flash > 0) weather.flash = Math.max(0, weather.flash - dt * 5);
  if (weather.type === 'storm' && weather.rain > 0.6 && !photo.on) { weather.nextBolt -= dt; if (weather.nextBolt <= 0) { weather.nextBolt = R(4, 14); weather.flash = 1; const d = R(0.4, 2.2); setTimeout(() => { sound.thunder(); if (state === 'play') rumble(pad, 0.25, 0.1, 400); }, d * 1000); } }
  if (weather.flash > 0) { const f = weather.flash * (0.6 + Math.random() * 0.4); k.hemiI += f * 2.5; k.top.lerp(cA.set(0xdfe8ff), f * 0.6); k.hor.lerp(cB.set(0xb8c4d8), f * 0.5); }
}
function updateWeatherFX(dt) {
  const t = now;
  rainUni.uTime.value = t; rainUni.uCam.value.copy(camera.position); rainUni.uAmt.value = weather.rain * (1 - nightF * 0.4); rainUni.uWind.value.set(weather.wind * 0.35, weather.wind * 0.12);
  rainMesh.visible = weather.rain > 0.02; snowUni.uTime.value = t; snowUni.uCam.value.copy(camera.position); snowUni.uAmt.value = weather.snow; snowPts.visible = weather.snow > 0.02;
  W.windStrength.value = weather.wind;
  const wet = weather.wet; W.groundMat.roughness = 1 - wet * 0.45; W.groundMat.color.setScalar(0.69 - wet * 0.22).lerp(cA.setRGB(2.4, 2.45, 2.6), weather.snowCover || 0); W.groundMat.emissive.setRGB(0.16, 0.17, 0.19).multiplyScalar((weather.snowCover || 0) * (isNight ? 0.25 : 1)); W.puddleMat.opacity = 0.3 + wet * 0.6; W.puddleMat.roughness = 0.05 + weather.rain * 0.12;
  $('flash').style.opacity = weather.flash > 0.5 ? (weather.flash - 0.5) * 0.5 : 0;
  if (sound.ctx) sound.setRain(weather.rain);
  if (state === 'play') { const ic = { clear: '☀ CLEAR', cloudy: '☁ OVERCAST', rain: '☂ RAIN', storm: '⚡ STORM', snow: '❄ SNOW' }[weather.type]; const s = (typeof seasonName === 'function' ? seasonName() + ' · ' : '') + ic; if ($('season').textContent !== s) $('season').textContent = s; }
}
applyQuality();
// ---------------------------------------------------------------- M5: saves (autosave + manual slots), photo mode, gallery
const saveHooks = []; // later systems push { save(o), load(o) }
const SLOT_KEYS = ['auto', '1', '2', '3'];
const slotKey = k => 'ruinborn.save.' + k;
let loadingSave = false, autoT = 60;
function readSlot(k) { try { return JSON.parse(localStorage.getItem(slotKey(k)) || 'null'); } catch (e) { return null; } }
function latestSave() { let best = null; for (const k of SLOT_KEYS) { const s = readSlot(k); if (s && (!best || s.at > best.at)) best = s; } return best; }
function serialize() {
  const o = { v: 2, at: Date.now(), difficulty, tod, dayNo, lastRaidDay,
    P: { x: P.pos.x, z: P.pos.z, yaw: P.yaw, hp: P.hp, hunger: P.hunger, thirst: P.thirst, stam: P.stam, clip: P.clip, reserve: P.reserve, sick: P.sick, wellFed: P.wellFed, light: P.light },
    inv: { ...inv }, gear: JSON.parse(JSON.stringify(gear)), laser: !!drone.laser,
    structs: structs.filter(s => !s.destroyed).map(s => ({ e: s.extra, t: s.type, x: +s.pos.x.toFixed(2), z: +s.pos.z.toFixed(2), r: +s.group.rotation.y.toFixed(3), hp: Math.round(s.hp) })),
    tames: mutants.filter(m => m.tamed && !m.dead).map(m => ({ sp: m.sp, x: m.pos.x, z: m.pos.z, alpha: m.alpha, shiny: m.shiny, bond: m.bond, evolved: !!m.evolved, active: m === activeTame, ko: !!m.ko, atBase: !!m.atBase })),
    bestiary: JSON.parse(JSON.stringify(bestiary)), logs: logs.filter(l => l.found).map(l => l.i), loots: loots.map((l, i) => l.looted ? i : -1).filter(i => i >= 0),
    weather: weather.type, where: districtName ? districtName(P.pos) : '' };
  for (const h of saveHooks) h.save && h.save(o);
  return o;
}
function districtName(p) { return typeof districtOf === 'function' ? districtOf(p.x, p.z) : (Math.hypot(p.x, p.z) < 20 ? 'The Plaza' : p.z < 0 ? 'North Ruins' : 'South Ruins'); }
function writeSlot(k, quiet) {
  if (state !== 'play' || P.dead) return false;
  try { localStorage.setItem(slotKey(k), JSON.stringify(serialize())); } catch (e) { toast('Save failed: storage is full.', '#ff7a5a'); return false; }
  if (!quiet) toast(k === 'auto' ? 'Autosaved' : `Saved to slot ${k}`, '#9dff2e'); saveIcon(); return true;
}
function autosave() { return writeSlot('auto', true); }
function saveIcon() { let el = $('saveIcon'); if (!el) { el = document.createElement('div'); el.id = 'saveIcon'; el.innerHTML = '<i></i>SAVING'; $('hud').appendChild(el); } el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); }
updaters.push(dt => { autoT -= dt; if (autoT <= 0) { autoT = 60; autosave(); } });
addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') autosave(); });
addEventListener('pagehide', () => { if (state === 'play') autosave(); });
function quietRemoveStruct(s) { scene.remove(s.group); const i = colliders.indexOf(s.collider); if (i >= 0) colliders.splice(i, 1); structs.splice(structs.indexOf(s), 1); if (s.light) { s.light.intensity = 0; s.light.userData.used = false; } if (s.spot) { s.spot.light.intensity = 0; s.spot.used = false; } if (s === core) core = null; }
function applySave(o) {
  loadingSave = true;
  difficulty = o.difficulty in DIFFS ? o.difficulty : 'normal'; DIFF = DIFFS[difficulty];
  tod = o.tod; dayNo = o.dayNo; lastRaidDay = o.lastRaidDay || 0; raidActive = false;
  Object.assign(P, { hp: o.P.hp, hunger: o.P.hunger, thirst: o.P.thirst, stam: o.P.stam, clip: o.P.clip, reserve: o.P.reserve, sick: o.P.sick, wellFed: o.P.wellFed || 0, light: o.P.light, yaw: o.P.yaw, pitch: 0 });
  P.pos.set(o.P.x, 0, o.P.z); camera.position.set(o.P.x, 2, o.P.z + 4);
  Object.assign(inv, o.inv); for (const s of ['head', 'torso', 'legs']) gear[s] = o.gear[s] || null; refreshGear();
  if (o.laser && !drone.laser) { drone.laser = true; drone.ringMat.emissive.set(0xff6a2a); drone.eye.material.color.set(0xffb080); }
  [...structs].forEach(quietRemoveStruct); for (const s of o.structs) { const st = createStruct(s.t, s.x, s.z, s.r); st.hp = Math.min(st.maxHp, s.hp); if (s.e) Object.assign(st.extra || (st.extra = {}), s.e); }
  for (const m of mutants) { if (m.pos.distanceTo(P.pos) < 30 || m.tamed) { scene.remove(m.g); m.remove = true; } }
  activeTame = null;
  for (const t of o.tames || []) { const m = spawnMutant(t.sp, t.x, t.z, { alpha: t.alpha, shiny: t.shiny }); if (m.sp === 'thornling') { m.state = 'move'; m.b.body.position.y = 0; } tameMutantQuiet(m); m.bond = t.bond || 0; if (t.evolved && typeof evolveMutant === 'function') evolveMutant(m, true); if (t.active && !activeTame) { activeTame = m; m.atBase = false; } else m.atBase = true; if (t.ko) koTameQuiet(m); }
  Object.assign(bestiary, o.bestiary || {});
  for (const i of o.logs || []) { const l = logs.find(l => l.i === i); if (l) l.found = true; }
  for (const i of o.loots || []) { const l = loots[i]; if (l && !l.looted) { l.looted = true; l.sp.visible = false; l.lid.position.set(0.4, 0.35, 0.3); l.lid.rotation.z = 1.1; } }
  if (o.weather && WEATHERS[o.weather]) setWeather(o.weather);
  for (const h of saveHooks) h.load && h.load(o);
  loadingSave = false;
  setTimeout(() => banner('DAY ' + dayNo, 'Welcome back. Your progress has been restored.', 3500), 300);
}
function tameMutantQuiet(m) {
  m.tamed = true; m.raid = false; m.state = 'move'; m.hp = m.maxHp; m.fg.material.color.set(0x6fd46a);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(m.def.radius * 1.2, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color: 0x6fff6a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.05; m.g.add(ring); m.ring = ring;
}
function koTameQuiet(m) { m.ko = true; m.hp = 0; m.state = 'ko'; m.b.body.rotation.z = 1.4; m.bar.visible = false; }
// saves panel
let savesMode = 'load';
function openSaves(mode, ret) { savesMode = mode; openPanel('saves', ret); renderSaves(); }
function slotLabel(k) { return k === 'auto' ? 'AUTOSAVE' : 'SLOT ' + k; }
function renderSaves() {
  $('savesTitle').textContent = savesMode === 'save' ? 'SAVE GAME' : 'LOAD GAME';
  $('slotList').innerHTML = SLOT_KEYS.map(k => {
    const s = readSlot(k); const dis = (savesMode === 'save' && k === 'auto') || (savesMode === 'load' && !s);
    const info = s ? `Day ${s.dayNo} · ${String(Math.floor(s.tod * 24)).padStart(2, '0')}:${String(Math.floor(s.tod * 1440 % 60)).padStart(2, '0')} · ${DIFFS[s.difficulty]?.label || ''} · ${s.where || ''}<br><small>${new Date(s.at).toLocaleString()} · ${s.tames?.length || 0} tames · ${s.structs?.length || 0} structures</small>` : '<small>Empty</small>';
    return `<div class="slotrow"><button class="slot" data-slot="${k}" ${dis ? 'disabled' : ''}><b>${slotLabel(k)}</b><span>${info}</span></button>${s && k !== 'auto' ? `<button class="slotdel" data-del="${k}" title="Delete">✕</button>` : ''}</div>`;
  }).join('') + '<p class="dim">Saves live in this browser (localStorage). Autosave runs every minute and when the app is backgrounded.</p>';
  $('slotList').querySelectorAll('[data-slot]').forEach(b => b.onclick = () => {
    const k = b.dataset.slot;
    if (savesMode === 'save') { const s = readSlot(k); const go = () => { writeSlot(k); renderSaves(); nav.ensure(); }; if (s) dialog('OVERWRITE ' + slotLabel(k) + '?', `Day ${s.dayNo} will be replaced.`, [{ label: 'OVERWRITE', fn: () => { openSaves('save', panelReturn); go(); } }, { label: 'CANCEL', fn: () => openSaves('save', panelReturn) }]); else go(); }
    else { const s = readSlot(k); if (!s) return; if (state === 'title') { closePanels(true); startGame(s); } else { sessionStorage.setItem('ruinborn.pending', JSON.stringify(s)); $('sleepfade').style.opacity = 1; setTimeout(() => location.reload(), 500); } }
  });
  $('slotList').querySelectorAll('[data-del]').forEach(b => b.onclick = () => { const k = b.dataset.del; dialog('DELETE ' + slotLabel(k) + '?', 'This cannot be undone.', [{ label: 'DELETE', fn: () => { localStorage.removeItem(slotKey(k)); openSaves(savesMode, panelReturn); } }, { label: 'CANCEL', fn: () => openSaves(savesMode, panelReturn) }]); });
  nav.setRoot($('saves'), BACKS.saves, '.slot:not([disabled])');
}
// resume a load requested mid-game (we reload the page for a clean world, then apply)
const pendingLoad = (() => { try { const s = sessionStorage.getItem('ruinborn.pending'); sessionStorage.removeItem('ruinborn.pending'); return s ? JSON.parse(s) : null; } catch (e) { return null; } })();

// ---------------------------------------------------------------- photo mode
const gradePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, mode: { value: 0 }, time: { value: 0 }, vig: { value: 0.35 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform int mode; uniform float time, vig; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
    void main(){ vec2 uv = vUv; vec3 c = texture2D(tDiffuse, uv).rgb; float l = dot(c, vec3(0.299,0.587,0.114));
      if (mode == 1) { c = vec3(smoothstep(0.03, 0.95, l)); c = pow(c, vec3(1.15)); }
      else if (mode == 2) { c = vec3(l) * vec3(1.12, 0.96, 0.74) + vec3(0.03, 0.01, 0.0); }
      else if (mode == 3) { c = mix(c, vec3(l), 0.35) * vec3(0.85, 1.0, 1.18); }
      else if (mode == 4) { c = mix(c, vec3(l) * vec3(0.55, 1.25, 0.45), 0.55); c += vec3(0.0, 0.03, 0.0); }
      else if (mode == 5) { float o = 0.0025; c.r = texture2D(tDiffuse, uv + vec2(o, 0.)).r; c.b = texture2D(tDiffuse, uv - vec2(o, 0.)).b; c *= 0.9 + 0.1 * sin(uv.y * 900.0); c = mix(c, vec3(l), 0.15) * vec3(1.05, 1.0, 0.92); }
      else if (mode == 6) { c = mix(c, vec3(l), 0.55); c = (c - 0.5) * 1.35 + 0.5; }
      vec2 d = uv - 0.5; c *= 1.0 - dot(d, d) * vig * 2.2;
      if (mode >= 1) c += (rnd(uv * 1000.0) - 0.5) * 0.035;
      gl_FragColor = vec4(clamp(c, 0., 1.), 1.); }`,
});
gradePass.enabled = false; composer.addPass(gradePass);
const FILTERS = ['NONE', 'NOIR', 'SEPIA', 'COLD', 'TOXIC', 'VHS', 'BLEACH'];
Object.assign(photo, { cam: new V3(), yaw: 0, pitch: 0, roll: 0, fov: 60, filter: 0, ui: true, pinch: 0, ptrs: new Map(), ret: null });
function enterPhoto() {
  if (state !== 'play' || P.dead || photo.on) return;
  photo.on = true; photo.cam.copy(camera.position); const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ'); photo.yaw = e.y; photo.pitch = e.x; photo.roll = 0; photo.fov = camera.fov; photo.prevFov = camera.fov;
  photo.ui = true; $('hud').classList.add('hidden'); $('photo').classList.remove('hidden'); $('touch').classList.add('hidden'); $('photoBar').classList.remove('hidden');
  mouseDown = rmbDown = false; if (build.active) exitBuild(); photoFilter(0); photoHints(); sound.whoosh();
}
function exitPhoto() {
  if (!photo.on) return; photo.on = false; gradePass.enabled = false; camera.fov = photo.prevFov; camera.rotation.z = 0; camera.updateProjectionMatrix();
  $('photo').classList.add('hidden'); $('hud').classList.remove('hidden'); onModeChange(); lockMouse(); sound.uiBack();
}
function photoHints() {
  const m = lastInput; const g = a => G(a, m);
  $('photoHints').innerHTML = m === 'pad' ? `${padGlyph('LS')} move ${padGlyph('RS')} look ${padGlyph('LT')}${padGlyph('RT')} down/up ${padGlyph('LB')}${padGlyph('RB')} FOV ${padGlyph('A')} capture ${padGlyph('X')} filter ${padGlyph('Y')} hide UI ${padGlyph('B')} exit`
    : m === 'touch' ? 'Drag to look · pinch to move · buttons below'
    : '<kbd>WASD</kbd> move <kbd>Mouse</kbd> look <kbd>Q</kbd>/<kbd>E</kbd> down/up <kbd>Wheel</kbd> FOV <kbd>Enter</kbd> capture <kbd>F</kbd> filter <kbd>H</kbd> hide UI <kbd>Esc</kbd> exit';
}
function photoFov(d) { photo.fov = clamp(photo.fov + d, 15, 100); }
function photoFilter(d) { photo.filter = (photo.filter + d + FILTERS.length) % FILTERS.length; gradePass.enabled = photo.filter > 0; gradePass.uniforms.mode.value = photo.filter; $('photoFilter').textContent = 'FILTER: ' + FILTERS[photo.filter] + ' · FOV ' + Math.round(photo.fov); if (d) sound.uiMove(); }
function togglePhotoUI() { photo.ui = !photo.ui; $('photoBar').classList.toggle('hidden', !photo.ui); if (!photo.ui) toastHint(); }
function toastHint() { }
function updatePhoto(dt) {
  const f = new V3(-Math.sin(photo.yaw), 0, -Math.cos(photo.yaw)), r = new V3(Math.cos(photo.yaw), 0, -Math.sin(photo.yaw));
  let mx = 0, mz = 0, my = 0, ly = 0, lp = 0;
  if (lastInput === 'kb') { mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0); mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0); my = (keys.KeyE || keys.Space ? 1 : 0) - (keys.KeyQ || keys.ControlLeft ? 1 : 0); ly = -mdx * 0.0022 * settings.sens; lp = -mdy * 0.0022 * settings.sens * (settings.invertY ? -1 : 1); mdx = mdy = 0; }
  if (pad) { mx += padMove.x; mz -= padMove.y; my += (pad.buttons[7]?.value || 0) - (pad.buttons[6]?.value || 0); ly -= padLook.x * 2.0 * dt * settings.sens; lp -= padLook.y * 1.6 * dt * settings.sens * (settings.invertY ? -1 : 1);
    if (padP(4)) photoFov(-30 * dt); if (padP(5)) photoFov(30 * dt); if (padP(14)) photo.roll += dt * 0.6; if (padP(15)) photo.roll -= dt * 0.6; if (padPressed(12) || padPressed(13)) photo.roll = 0; }
  ly += photo.tdx || 0; lp += photo.tdy || 0; photo.tdx = photo.tdy = 0; mz += photo.tmz || 0; photo.tmz = 0;
  photo.yaw += ly; photo.pitch = clamp(photo.pitch + lp, -1.5, 1.5);
  const sp = (keys.ShiftLeft || (pad && padP(10)) ? 14 : 5) * dt;
  photo.cam.addScaledVector(f, mz * sp).addScaledVector(r, mx * sp); photo.cam.y += my * sp;
  // tethered to the player so photo mode cannot be used to scout the map
  const off = photo.cam.clone().sub(P.pos); off.y = 0; if (off.length() > 30) { off.setLength(30); photo.cam.x = P.pos.x + off.x; photo.cam.z = P.pos.z + off.z; }
  photo.cam.y = clamp(photo.cam.y, 0.25, 40); resolve(photo.cam, 0.25);
  camera.position.copy(photo.cam); camera.rotation.set(photo.pitch, photo.yaw, photo.roll); camera.fov = photo.fov; camera.updateProjectionMatrix();
  gradePass.uniforms.time.value = performance.now() / 1000 % 100;
  $('photoFilter').textContent = 'FILTER: ' + FILTERS[photo.filter] + ' · FOV ' + Math.round(photo.fov) + (photo.roll ? ' · ROLL ' + Math.round(photo.roll * 57.3) + '°' : '');
}
// touch look / pinch-dolly on the canvas while in photo mode
canvas.addEventListener('pointerdown', e => { if (!photo.on || e.pointerType !== 'touch') return; photo.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); photo.pinch = 0; });
canvas.addEventListener('pointermove', e => { if (!photo.on || !photo.ptrs.has(e.pointerId)) return; const p = photo.ptrs.get(e.pointerId);
  if (photo.ptrs.size === 1) { photo.tdx = (photo.tdx || 0) - (e.clientX - p.x) * 0.005; photo.tdy = (photo.tdy || 0) - (e.clientY - p.y) * 0.005; }
  p.x = e.clientX; p.y = e.clientY;
  if (photo.ptrs.size === 2) { const [a, b] = [...photo.ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); if (photo.pinch) photo.tmz = (photo.tmz || 0) + (d - photo.pinch) * 0.02; photo.pinch = d; } });
const endPtr = e => { photo.ptrs.delete(e.pointerId); photo.pinch = 0; };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
canvas.addEventListener('mousedown', () => { if (photo.on && !locked && lastInput === 'kb') lockMouse(); });
document.querySelectorAll('#photo [data-p]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); sound.uiSelect();
  const a = b.dataset.p; if (a === 'filter') photoFilter(1); if (a === 'fovm') photoFov(-5); if (a === 'fovp') photoFov(5); if (a === 'ui') togglePhotoUI(); if (a === 'shot') photoShot(); if (a === 'gallery') openGallery('photo'); if (a === 'exit') exitPhoto(); }));
// tap anywhere with the UI hidden to bring it back on touch
canvas.addEventListener('click', () => { if (photo.on && !photo.ui && lastInput === 'touch') togglePhotoUI(); });
function photoShot() {
  if (!photo.on || photo.capture) return;
  const prev = renderer.getPixelRatio(); const hi = Math.min(Math.max(prev, (devicePixelRatio || 1)) * 1.5, 3, 4096 / innerWidth);
  renderer.setPixelRatio(hi); composer.setPixelRatio(hi); composer.setSize(innerWidth, innerHeight);
  const fname = FILTERS[photo.filter];
  photo.capture = () => {
    photo.capture = null; const src = renderer.domElement; const W2 = src.width, H2 = src.height;
    const c = document.createElement('canvas'); c.width = W2; c.height = H2; const g = c.getContext('2d'); g.drawImage(src, 0, 0);
    renderer.setPixelRatio(prev); composer.setPixelRatio(prev); composer.setSize(innerWidth, innerHeight);
    const fs = Math.round(H2 * 0.034); g.font = `${fs}px Bebas, Impact, sans-serif`; g.textAlign = 'right'; g.shadowColor = '#7dff2e'; g.shadowBlur = fs * 0.5; g.fillStyle = 'rgba(190,255,120,0.85)';
    g.fillText('RUINBORN', W2 - fs * 0.9, H2 - fs * 0.9); g.shadowBlur = 0; g.font = `${Math.round(fs * 0.42)}px "Barlow C", sans-serif`; g.fillStyle = 'rgba(220,235,210,0.7)';
    g.fillText(`DAY ${dayNo} · ${fname}`, W2 - fs * 0.9, H2 - fs * 0.35);
    c.toBlob(blob => { if (!blob) return; const t = document.createElement('canvas'); t.width = 320; t.height = Math.round(320 * H2 / W2); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
      t.toBlob(thumb => galPut({ at: Date.now(), blob, thumb, w: W2, h: H2, day: dayNo, filter: fname }).then(() => toast(`📷 Photo saved to gallery (${W2}×${H2})`, '#9dff2e')).catch(() => toast('Could not store photo', '#ff7a5a')), 'image/jpeg', 0.8);
      photo.lastBlob = blob; }, 'image/png');
    $('flash').style.transition = 'none'; $('flash').style.opacity = 0.7; requestAnimationFrame(() => { $('flash').style.transition = 'opacity .5s'; $('flash').style.opacity = 0; });
    sound.click(); rumble(pad, 0.15, 0.3, 90);
  };
}
// gallery in IndexedDB
let galDB = null;
function galOpen() { if (galDB) return Promise.resolve(galDB); return new Promise((res, rej) => { const r = indexedDB.open('ruinborn', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id', autoIncrement: true }); r.onsuccess = () => res(galDB = r.result); r.onerror = () => rej(r.error); }); }
const galTx = (mode, fn) => galOpen().then(db => new Promise((res, rej) => { const tx = db.transaction('photos', mode); const st = tx.objectStore('photos'); const out = fn(st); tx.oncomplete = () => res(out && out.result !== undefined ? out.result : out); tx.onerror = () => rej(tx.error); }));
const galPut = p => galTx('readwrite', st => st.add(p));
const galAll = () => galTx('readonly', st => st.getAll());
const galDelete = id => galTx('readwrite', st => st.delete(id));
let galURLs = [], galCur = null;
function openGallery(ret) { openPanel('gallery', ret); $('galView').classList.add('hidden'); $('galGrid').classList.remove('hidden'); renderGallery(); }
function renderGallery() {
  galURLs.forEach(u => URL.revokeObjectURL(u)); galURLs = [];
  galAll().then(list => {
    list.sort((a, b) => b.at - a.at);
    $('galGrid').innerHTML = list.length ? list.map(p => { const u = URL.createObjectURL(p.thumb || p.blob); galURLs.push(u); return `<button class="gthumb" data-id="${p.id}"><img src="${u}" alt=""><span>Day ${p.day} · ${p.filter} · ${new Date(p.at).toLocaleDateString()}</span></button>`; }).join('') : '<p class="dim">No photos yet. Open photo mode from the pause menu, then capture.</p>';
    $('galGrid').querySelectorAll('.gthumb').forEach(b => b.onclick = () => showPhoto(list.find(p => p.id === +b.dataset.id)));
    nav.setRoot($('gallery'), BACKS.gallery, '.gthumb');
  }).catch(() => { $('galGrid').innerHTML = '<p class="dim">Gallery storage is unavailable in this browser.</p>'; });
}
function showPhoto(p) {
  galCur = p; const u = URL.createObjectURL(p.blob); galURLs.push(u); $('galImg').src = u; $('galGrid').classList.add('hidden'); $('galView').classList.remove('hidden');
  nav.setRoot($('galView'), () => galleryBack(), '#galDl');
}
$('galDl').onclick = () => { if (!galCur) return; const a = document.createElement('a'); a.href = URL.createObjectURL(galCur.blob); a.download = `ruinborn-day${galCur.day}-${galCur.at}.png`; document.body.appendChild(a); a.click(); a.remove(); toast('Saved to device', '#9dff2e'); };
$('galDel').onclick = () => { if (!galCur) return; galDelete(galCur.id).then(() => { galCur = null; $('galView').classList.add('hidden'); $('galGrid').classList.remove('hidden'); renderGallery(); }); };
$('galClose').onclick = () => galleryBack();
function galleryBack() {
  if (!$('galView').classList.contains('hidden')) { $('galView').classList.add('hidden'); $('galGrid').classList.remove('hidden'); renderGallery(); sound.uiBack(); return; }
  if (panelReturn === 'photo' && photo.on) { closePanels(true); $('hud').classList.add('hidden'); sound.uiBack(); return; }
  backToReturn();
}
// ---------------------------------------------------------------- M6a: seasons, crops + greenhouse, traps, hybrid power
const SEASONS = ['SPRING', 'SUMMER', 'AUTUMN', 'WINTER'], SEASON_DAYS = 3; // design: 14-day seasons; shortened for the prototype
const seasonIdx = () => Math.floor((dayNo - 1) / SEASON_DAYS) % 4;
function seasonName() { return SEASONS[seasonIdx()] + ' ' + (((dayNo - 1) % SEASON_DAYS) + 1) + '/' + SEASON_DAYS; }
function seasonWeights() { return [{ clear: 3, cloudy: 3, rain: 3, storm: 1, snow: 0 }, { clear: 6, cloudy: 2, rain: 1, storm: 2, snow: 0 }, { clear: 2, cloudy: 4, rain: 3, storm: 2, snow: 0 }, { clear: 2, cloudy: 3, rain: 0, storm: 0, snow: 5 }][seasonIdx()]; }
const warmth = () => Object.values(gear).reduce((a, g) => a + (g ? g.warmth : 0), 0);
function seasonDrain() { const s = seasonIdx(); if (s === 3) return 1 + Math.max(0, 0.45 - warmth() * 0.035) + (isNight ? 0.15 : 0); if (s === 1) return 1.1; return 1; }
const SEASON_TINT = [new THREE.Color(1, 1, 1), new THREE.Color(1.05, 1.02, 0.8), new THREE.Color(1.35, 0.85, 0.42), new THREE.Color(0.85, 0.9, 0.95)];
const tintNow = new THREE.Color(1, 1, 1); let lastSeason = -1;
weather.snowCover = 0;
updaters.push(dt => {
  const si = seasonIdx(); tintNow.lerp(SEASON_TINT[si], Math.min(1, dt * 0.2));
  for (const d of W.dens) if (d.m.material.map) d.m.material.color.copy(tintNow);
  if (si !== lastSeason) { if (lastSeason >= 0) banner(SEASONS[si], ['Crops grow fast again. Rain returns.', 'Long days. Water drains faster. Storms build.', 'Leaves turn. Harvest before the cold.', 'Snow. Wear warm clothing or freeze. Crops need a greenhouse.'][si], 5000); lastSeason = si; }
  weather.snowCover = clamp(weather.snowCover + (weather.snow > 0.3 ? dt * 0.015 : -dt * (si === 3 ? 0.002 : 0.02)), 0, 1);
});
// ---- shared struct helpers
const sAdd = (g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
const soilMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1, normalMap: W.tex.dMoss.normalMap });
const plantMat = new THREE.MeshStandardMaterial({ color: 0x4f8a2a, roughness: 0.8, flatShading: true });
const fruitMat = new THREE.MeshStandardMaterial({ color: 0xc83a1a, roughness: 0.5, emissive: 0x401000 });
const glassMat2 = new THREE.MeshStandardMaterial({ color: 0xbfe8d0, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a2a4a, roughness: 0.15, metalness: 0.7, emissive: 0x0a1428 });
const cellMat = new THREE.MeshStandardMaterial({ color: 0x223322, emissive: 0x9dff2e, emissiveIntensity: 0.6 });
Object.assign(SDEF, {
  crop: { name: 'Crop Plot', hp: 60, fp: null, radius: 0.9 }, greenhouse: { name: 'Greenhouse', hp: 200, fp: null, radius: 2.5 }, spikes: { name: 'Spike Trap', hp: 120, fp: null, radius: 1 },
  solar: { name: 'Solar Panel', hp: 90, fp: [0.9, 0.6], radius: 0.9 }, generator: { name: 'Generator', hp: 140, fp: [0.7, 0.5], radius: 0.8 }, battery: { name: 'Battery Bank', hp: 100, fp: [0.5, 0.4], radius: 0.6 },
});
STRUCT_MESH.crop = () => { const g = new THREE.Group(); sAdd(g, new THREE.BoxGeometry(1.8, 0.22, 1.8), soilMat, 0, 0.11, 0); for (const x of [-0.95, 0.95]) sAdd(g, new THREE.BoxGeometry(0.1, 0.3, 1.9), darkMetal, x, 0.15, 0);
  const plants = new THREE.Group(); plants.position.y = 0.22; g.add(plants); const fruits = [];
  for (let i = 0; i < 9; i++) { const p = new THREE.Group(); p.position.set((i % 3 - 1) * 0.55, 0, (Math.floor(i / 3) - 1) * 0.55); plants.add(p);
    for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.55, 4), plantMat); l.position.y = 0.27; l.rotation.set(Math.cos(k * 1.6) * 0.5, k, Math.sin(k * 1.6) * 0.5); l.castShadow = true; p.add(l); }
    const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), fruitMat); f.position.set(0.08, 0.42, 0); f.visible = false; p.add(f); fruits.push(f); }
  g.userData.plants = plants; g.userData.fruits = fruits; return g; };
STRUCT_MESH.greenhouse = () => { const g = new THREE.Group(); const W2 = 5, D2 = 5, H2 = 2.6;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) sAdd(g, new THREE.BoxGeometry(0.1, H2, 0.1), darkMetal, x * W2 / 2, H2 / 2, z * D2 / 2);
  for (const z of [-1, 1]) { const w = sAdd(g, new THREE.PlaneGeometry(W2, H2), glassMat2, 0, H2 / 2, z * D2 / 2); w.castShadow = false; }
  for (const x of [-1, 1]) { const w = sAdd(g, new THREE.PlaneGeometry(D2, H2), glassMat2, x * W2 / 2, H2 / 2, 0, 0, Math.PI / 2); w.castShadow = false; }
  for (const s of [-1, 1]) { const r = sAdd(g, new THREE.PlaneGeometry(W2, D2 / 2 * 1.15), glassMat2, 0, H2 + 0.6, s * D2 / 4, -Math.PI / 2 + s * 0.45); r.castShadow = false; }
  sAdd(g, new THREE.BoxGeometry(0.1, 0.1, D2), darkMetal, 0, H2 + 1.2, 0); for (const s of [-1, 1]) sAdd(g, new THREE.BoxGeometry(W2, 0.08, 0.08), darkMetal, 0, H2, s * D2 / 2);
  return g; };
STRUCT_MESH.spikes = () => { const g = new THREE.Group(); sAdd(g, new THREE.BoxGeometry(2, 0.08, 2), scrapMat, 0, 0.04, 0);
  for (let i = 0; i < 16; i++) { const c = sAdd(g, new THREE.ConeGeometry(0.06, 0.45, 4), darkMetal, (i % 4 - 1.5) * 0.48, 0.28, (Math.floor(i / 4) - 1.5) * 0.48); c.rotation.set(R(-0.2, 0.2), 0, R(-0.2, 0.2)); }
  return g; };
STRUCT_MESH.solar = () => { const g = new THREE.Group(); sAdd(g, new THREE.CylinderGeometry(0.06, 0.08, 1.2), darkMetal, 0, 0.6, 0); const p = sAdd(g, new THREE.BoxGeometry(1.8, 0.05, 1.1), panelMat, 0, 1.25, 0, -0.5);
  for (let i = 0; i < 3; i++) sAdd(g, new THREE.BoxGeometry(0.02, 0.06, 1.1), darkMetal, -0.6 + i * 0.6, 1.25, 0, -0.5); return g; };
STRUCT_MESH.generator = () => { const g = new THREE.Group(); sAdd(g, new THREE.BoxGeometry(1.3, 0.8, 0.9), scrapMat, 0, 0.45, 0); sAdd(g, new THREE.CylinderGeometry(0.3, 0.3, 1.1, 10), gunRust, 0, 0.55, 0, 0, 0, Math.PI / 2);
  sAdd(g, new THREE.CylinderGeometry(0.06, 0.06, 0.6), darkMetal, 0.45, 1.1, 0.25); const l = new THREE.Mesh(new THREE.SphereGeometry(0.06), new THREE.MeshBasicMaterial({ color: 0x9dff2e })); l.position.set(-0.5, 0.9, 0.46); g.add(l); g.userData.lamp = l; return g; };
STRUCT_MESH.battery = () => { const g = new THREE.Group(); sAdd(g, new THREE.BoxGeometry(0.9, 1.2, 0.7), darkMetal, 0, 0.6, 0);
  const bars = []; for (let i = 0; i < 4; i++) bars.push(sAdd(g, new THREE.BoxGeometry(0.6, 0.18, 0.02), cellMat.clone(), 0, 0.25 + i * 0.25, 0.36)); g.userData.bars = bars; return g; };
// ---- power grid
const grid = { supply: 0, demand: 0, stored: 0, cap: 0, ok: true };
function powerOK() { return grid.ok; }
updaters.push(dt => {
  const sunF = clamp(sun.intensity / 3.2, 0, 1) * (1 - weather.cloud * 0.6) * (isNight ? 0 : 1);
  let sup = core ? 1 : 0, dem = 0, cap = 0, gens = [];
  for (const s of structs) { const e = s.extra || (s.extra = {});
    if (s.type === 'solar') sup += 1.6 * sunF;
    if (s.type === 'generator') { if (e.fuel === undefined) e.fuel = 100; if (e.fuel > 0) { sup += 2; gens.push(s); } }
    if (s.type === 'battery') { cap += 40; if (e.charge === undefined) e.charge = 20; }
    if (s.type === 'floodlight' && nightF > 0.15) dem += 1; if (s.type === 'turret') dem += 0.5; if (s.type === 'greenhouse') dem += 0.5; }
  const bats = structs.filter(s => s.type === 'battery'); let stored = bats.reduce((a, b) => a + b.extra.charge, 0);
  const net = sup - dem; let ok = net >= 0;
  if (net >= 0) { const add = Math.min(net * dt * 0.5, cap - stored); stored += add; } else if (stored > 0) { stored = Math.max(0, stored + net * dt * 0.5); ok = stored > 0; }
  if (bats.length) for (const b of bats) b.extra.charge = stored / bats.length;
  if (dem > 0) for (const gs of gens) gs.extra.fuel = Math.max(0, gs.extra.fuel - dt / 12);
  Object.assign(grid, { supply: sup, demand: dem, stored, cap, ok });
  const near = core && P.pos.distanceTo(core.pos) < 45; const el = $('power');
  if (el) { el.style.display = near ? 'block' : 'none'; if (near) el.innerHTML = `<span style="color:${ok ? '#9dff2e' : '#ff7a5a'}">⚡ ${sup.toFixed(1)} / ${dem.toFixed(1)}</span>${cap ? ` · 🔋 ${Math.round(stored / cap * 100)}%` : ''}${gens.length || structs.some(s => s.type === 'generator') ? ` · ⛽ ${Math.round(Math.max(0, ...structs.filter(s => s.type === 'generator').map(s => s.extra.fuel || 0)))}%` : ''}${ok ? '' : ' · LOW POWER'}`; }
});
STRUCT_UPD.generator = s => { s.group.userData.lamp.material.color.set(s.extra && s.extra.fuel > 0 ? 0x9dff2e : 0xff3020); if (s.extra && s.extra.fuel > 0 && Math.random() < 0.05) debris.emit(new V3(s.pos.x + 0.45, 1.4, s.pos.z + 0.25), new V3(R(-0.2, 0.2), 1.2, R(-0.2, 0.2)), 0x333333, 1.2, -0.5); };
STRUCT_UPD.battery = s => { const f = grid.cap ? grid.stored / grid.cap : 0; s.group.userData.bars.forEach((b, i) => b.material.emissiveIntensity = f * 4 > i ? 1.2 : 0.05); };
STRUCT_UPD.solar = s => { };
// ---- crops
const nearGreenhouse = p => structs.some(s => s.type === 'greenhouse' && Math.abs(s.pos.x - p.x) < 2.6 && Math.abs(s.pos.z - p.z) < 2.6);
STRUCT_UPD.crop = (s, dt) => { const e = s.extra || (s.extra = {}); if (e.grow === undefined) e.grow = 0;
  const gh = nearGreenhouse(s.pos); const sm = gh ? (grid.ok ? 1.5 : 1) : [1, 1.2, 0.8, 0.12][seasonIdx()]; const wet = weather.rain > 0.3 ? 1.3 : 1;
  e.grow = Math.min(1, e.grow + dt / 420 * sm * wet); const k = 0.15 + e.grow * 0.85; s.group.userData.plants.scale.set(k, k, k);
  s.group.userData.fruits.forEach(f => f.visible = e.grow >= 1); };
interactHooks.push((p, consider) => { for (const s of structs) if (s.type === 'crop') { const e = s.extra || {}; consider(Math.hypot(s.pos.x - p.x, s.pos.z - p.z) - 0.6, { type: 'hook', label: () => (e.grow || 0) >= 1 ? `${G('interact')} Harvest vegetables` : `Crops growing ${Math.round((e.grow || 0) * 100)}%${seasonIdx() === 3 && !nearGreenhouse(s.pos) ? ' · <span style="color:#7ad0ff">frozen: needs a greenhouse</span>' : ''}`, act: () => { if ((e.grow || 0) < 1) return; e.grow = 0; const n = 3 + (Math.random() < 0.3 ? 1 : 0); inv.veg += n; const sd = Math.random() < 0.5 ? 1 : 0; inv.seeds += sd; toast(`Harvested +${n} Vegetables${sd ? ', +1 Seeds' : ''}`, '#9dff2e'); sound.pickup(); } }); }
  for (const s of structs) if (s.type === 'generator') { const e = s.extra || {}; consider(Math.hypot(s.pos.x - p.x, s.pos.z - p.z) - 0.8, { type: 'hook', label: () => `${G('interact')} Refuel generator (2 Scrap) · fuel ${Math.round(e.fuel ?? 100)}%`, act: () => { if (inv.scrap < 2) return toast('Need 2 Scrap.', '#ff7a5a'); if ((e.fuel ?? 100) > 95) return toast('Tank is full.'); inv.scrap -= 2; e.fuel = Math.min(100, (e.fuel ?? 100) + 50); sound.build(); toast('Generator refuelled.'); } }); } });
// ---- traps
STRUCT_UPD.spikes = (s, dt) => { for (const m of mutants) { if (m.dead || m.tamed || m.state === 'burrowed' || m.def.boss) continue; if (Math.abs(m.pos.x - s.pos.x) < 1.2 + m.def.radius * 0.5 && Math.abs(m.pos.z - s.pos.z) < 1.2 + m.def.radius * 0.5) {
  damageMutant(m, 28 * dt, 'turret'); m.pos.x -= (m.pos.x - s.pos.x) * 0; s.hp -= 3 * dt; if (Math.random() < dt * 10) debris.emit(new V3(m.pos.x, 0.4, m.pos.z), new V3(R(-1, 1), 2, R(-1, 1)), 0x8acb3a, 0.5, 9); if (s.hp <= 0) { destroyStruct(s); return; } } } };
// ---- recipes
RECIPES.push(
  { id: 'crop', name: 'Crop Plot', desc: 'Grows vegetables in ~7 min. Slow in autumn, frozen in winter without a greenhouse.', cost: { scrap: 2, seeds: 1 }, build: true },
  { id: 'greenhouse', name: 'Greenhouse', desc: 'Crops inside grow year-round, faster when powered (0.5 ⚡).', cost: { scrap: 12, parts: 1 }, build: true },
  { id: 'spikes', name: 'Spike Trap', desc: 'Shreds mutants that cross it. Wears down with use.', cost: { scrap: 5 }, build: true },
  { id: 'solar', name: 'Solar Panel', desc: 'Free power by day (up to 1.6 ⚡, less under cloud).', cost: { scrap: 8, parts: 1 }, build: true },
  { id: 'generator', name: 'Generator', desc: 'Steady 2 ⚡ while fuelled. Refuel with scrap.', cost: { scrap: 10 }, build: true },
  { id: 'battery', name: 'Battery Bank', desc: 'Stores surplus power for the night.', cost: { scrap: 6, parts: 2 }, build: true },
);
createStruct('generator', -4.5, -2, 0.6);
// ---------------------------------------------------------------- M6b: districts, outposts + fast travel, trader, keycard bunkers, raiders, new species, evolution, mounting
function districtOf(x, z) { if (Math.hypot(x, z) < 50) return 'Old Downtown'; if (z > 0) return 'Drowned Market'; return x > 0 ? 'Rustworks' : 'Verdant Heights'; }
function findFree(cx, cz, pad = 2.5) { for (let r = 0; r < 30; r += 1.5) for (let a = 0; a < 6.28; a += 0.5) { const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r; if (!colliders.some(c => x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad)) return [x, z]; } return [cx, cz]; }
let flags = { cards: { bronze: false, silver: false, gold: false }, bunkers: { bronze: false, silver: false, gold: false }, outposts: [], lootN: 0, turretLaser: false, ending: null, bossDone: false };
saveHooks.push({ save: o => { o.flags = flags; }, load: o => { if (o.flags) { flags = Object.assign(flags, o.flags); outposts.forEach((op, i) => setOutpost(op, flags.outposts.includes(i), true)); bunkers.forEach(b => { if (flags.bunkers[b.tier]) openBunkerVisual(b); }); if (typeof afterFlagsLoaded === 'function') afterFlagsLoaded(); } } });
let wakePending = -1;
updaters.push(dt => { if (wakePending > 0 && !openP) { wakePending -= dt; if (wakePending <= 0 && typeof wakeHeart === 'function') wakeHeart(); } });
const beaconRed = new THREE.Color(0xff3020), beaconGreen = new THREE.Color(0x9dff2e);
// ---- outposts (landmark radio towers)
const outposts = [['Rustworks Relay', 60, -60], ['Market Spire', -60, 60], ['Heights Mast', -60, -20]].map(([name, cx, cz], i) => {
  const [x, z] = findFree(cx, cz, 3); const g = new THREE.Group(); g.position.set(x, 0, z);
  const H = 22; for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const l = sAdd(g, new THREE.CylinderGeometry(0.07, 0.12, H, 5), darkMetal, lx * 0.9, H / 2, lz * 0.9, lz * 0.04, 0, -lx * 0.04); }
  for (let y = 2; y < H; y += 2.5) { const w = 1.8 * (1 - y / H * 0.35); for (let k = 0; k < 4; k++) { const b = sAdd(g, new THREE.BoxGeometry(w * 1.15, 0.05, 0.05), darkMetal, 0, y, 0); b.rotation.y = k * Math.PI / 2; b.position.set(Math.sin(k * Math.PI / 2) * w / 2, y, Math.cos(k * Math.PI / 2) * w / 2); b.rotation.z = 0.5 * (k % 2 ? 1 : -1); } }
  sAdd(g, new THREE.BoxGeometry(2.4, 0.15, 2.4), scrapMat, 0, H, 0); sAdd(g, new THREE.CylinderGeometry(0.03, 0.03, 6), darkMetal, 0, H + 3, 0);
  const bm = new THREE.MeshBasicMaterial({ color: beaconRed.clone() }); const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), bm); bulb.position.y = H + 6.1; g.add(bulb);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: beaconRed.clone(), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); halo.scale.set(6, 6, 1); halo.position.y = H + 6.1; g.add(halo);
  // shelter + terminal
  const tarp = sAdd(g, new THREE.BoxGeometry(3.4, 0.08, 2.4), tarpMat, 3, 2.3, 0, 0, 0, 0.12); for (const [px, pz] of [[1.5, -1.1], [4.5, -1.1], [1.5, 1.1], [4.5, 1.1]]) sAdd(g, new THREE.CylinderGeometry(0.05, 0.05, 2.3), darkMetal, px, 1.15, pz);
  const term = sAdd(g, new THREE.BoxGeometry(0.8, 1.2, 0.5), darkMetal, 2.4, 0.6, 0.6); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshBasicMaterial({ map: TX.screenTexture(['RELAY ' + (i + 1), '> OFFLINE', '_'], '#ff7050'), toneMapped: false })); scr.position.set(2.4, 1.0, 0.86); g.add(scr);
  scene.add(g); W.addCollider(x - 1.1, x + 1.1, z - 1.1, z + 1.1, H, 'building');
  const op = { i, name, pos: new V3(x + 2.4, 0, z + 1.6), base: new V3(x, 0, z), g, bm, halo, scr, active: false };
  mapMarkers.push({ x, z, r: 2.6, col: () => op.active ? '#9dff2e' : '#ff5030' }); return op;
});
function setOutpost(op, on, quiet) {
  op.active = on; op.bm.color.copy(on ? beaconGreen : beaconRed); op.halo.material.color.copy(on ? beaconGreen : beaconRed);
  op.scr.material.map = TX.screenTexture(['RELAY ' + (op.i + 1), on ? '> ONLINE' : '> OFFLINE', on ? '> SAFE ZONE' : '_'], on ? '#7dff7a' : '#ff7050'); op.scr.material.needsUpdate = true;
  if (on && !flags.outposts.includes(op.i)) flags.outposts.push(op.i);
  if (on && !quiet) { banner('OUTPOST ONLINE', `${op.name} · ${districtOf(op.base.x, op.base.z)}. Safe zone, fast travel and respawn point unlocked.`, 5000); sound.horn(); rumble(pad, 0.3, 0.5, 300); autosave(); }
}
function respawnPoint() { let best = null, bd = Infinity; for (const op of outposts) if (op.active) { const d = op.pos.distanceTo(P.pos); if (d < bd) { bd = d; best = op; } } const dc = core ? core.pos.distanceTo(P.pos) : Infinity; if (core && dc <= bd) return { pos: core.pos, name: 'your base' }; return best ? { pos: best.pos, name: best.name } : null; }
// safe zones: wild mutants are pushed out of active outposts
updaters.push(() => { for (const op of outposts) if (op.active) for (const m of mutants) { if (m.tamed || m.dead || m.def.boss) continue; const dx = m.pos.x - op.base.x, dz = m.pos.z - op.base.z, d = Math.hypot(dx, dz); if (d < 14) { m.pos.x = op.base.x + dx / (d || 1) * 14; m.pos.z = op.base.z + dz / (d || 1) * 14; if (m.target === PLAYER) m.target = null; m.retarget = 2; } } });
const inSafeZone = p => outposts.some(op => op.active && Math.hypot(p.x - op.base.x, p.z - op.base.z) < 14);
function travelMenu(from) {
  const dests = [...(core ? [{ name: 'Your Base', pos: core.pos }] : []), ...outposts.filter(o => o.active && o !== from).map(o => ({ name: o.name, pos: o.pos }))];
  const atBase = mutants.filter(m => m.tamed && !m.dead && m.atBase && !m.ko && m.def.name);
  dialog('RELAY · ' + from.name.toUpperCase(), `Fast travel between active outposts and your base. Your active tame travels with you.${atBase.length ? '<br>Swap your active tame with one guarding your base.' : ''}`,
    [...dests.map(d => ({ label: 'TRAVEL: ' + d.name.toUpperCase(), fn: () => fastTravel(d) })), ...atBase.slice(0, 3).map(m => ({ label: 'SWAP IN: ' + (m.dispName || m.def.name).toUpperCase(), fn: () => swapTame(m) })), { label: 'CLOSE', fn: () => {} }]);
}
function fastTravel(d) {
  $('sleepfade').style.transition = 'opacity .5s'; $('sleepfade').style.opacity = 1; sound.whoosh(); if (P.mount) mountToggle(true);
  setTimeout(() => { P.pos.set(d.pos.x + 1.5, 0, d.pos.z + 2.5); P.vel.set(0, 0, 0); camera.position.set(P.pos.x, 2, P.pos.z + 4); if (activeTame && !activeTame.ko) activeTame.pos.set(P.pos.x + 2, 0, P.pos.z + 2);
    for (const m of mutants) if (!m.tamed && !m.def.boss && m.pos.distanceTo(P.pos) < 25) { scene.remove(m.g); m.remove = true; }
    $('sleepfade').style.opacity = 0; toast('Arrived: ' + d.name, '#9dff2e'); autosave(); }, 600);
}
function swapTame(m) { if (activeTame) { activeTame.atBase = true; } m.atBase = false; activeTame = m; m.pos.set(P.pos.x + 2, 0, P.pos.z + 2); toast(`${m.dispName || m.def.name} joins you. The other tame returns to guard your base.`, '#6fd46a'); }
interactHooks.push((p, consider) => { for (const op of outposts) consider(Math.hypot(op.pos.x - p.x, op.pos.z - p.z) - 0.8, { type: 'hook', label: op.active ? `${G('interact')} Relay terminal: fast travel / swap tame` : `${G('interact')} Bring ${op.name} online`, act: () => op.active ? travelMenu(op) : setOutpost(op, true) }); });
// ---- trader (Rustworks)
const trader = (() => { const op = outposts[0]; const m = buildPlayer(RARITY, { cloth: TX.clothTexture(), rust: W.tex.rust }); setGear(m, { head: { name: 'Gasmask Rig', rarity: 2 }, torso: { name: 'Scavver Duster', rarity: 3 }, legs: { name: 'Cargo Pants', rarity: 1 } }, false);
  m.root.position.set(op.base.x + 4.2, 0, op.base.z + 0.3); m.root.rotation.y = -Math.PI / 2; scene.add(m.root);
  const crate = sAdd(new THREE.Group(), new THREE.BoxGeometry(1.2, 0.7, 0.8), crateMat, 0, 0.35, 0); crate.parent.position.set(op.base.x + 3.2, 0, op.base.z - 0.6); scene.add(crate.parent);
  return { m, pos: m.root.position, name: 'Rook the Trader' }; })();
updaters.push(dt => animatePlayer(trader.m, dt, { speed: 0, sprint: false, ads: false, pitch: Math.sin(now * 0.4) * 0.1, grounded: true, recoil: 0, reloading: false, mounted: false }));
mapMarkers.push({ x: trader.pos.x, z: trader.pos.z, r: 1.4, col: '#ffc23d' });
const TRADES = [
  { give: { scrap: 5 }, get: 'Rifle Ammo ×30', fn: () => P.reserve += 30 }, { give: { scrap: 4 }, get: 'Medicine', fn: () => inv.meds++ }, { give: { scrap: 3 }, get: 'Seeds ×2', fn: () => inv.seeds += 2 },
  { give: { parts: 3 }, get: 'Scrap ×8', fn: () => inv.scrap += 8 }, { give: { veg: 3 }, get: 'Water ×2', fn: () => inv.water += 2 },
  { give: { scrap: 14, parts: 4 }, get: 'Rare clothing', fn: () => giveClothing(Object.assign(rollClothing(), { rarity: 2 + (Math.random() < 0.4 ? 1 : 0) })) },
];
function traderMenu() {
  const cost = c => Object.entries(c).map(([k, v]) => `${v} ${ITEM_NAMES[k]}`).join(' + ');
  dialog('ROOK THE TRADER', `"Scrap talks, friend. Everything else walks."<br><small>You have ${inv.scrap} Scrap · ${inv.parts} Parts · ${inv.veg} Veg</small>`,
    [...TRADES.map(t => ({ label: `${t.get} ← ${cost(t.give)}`, disabled: !afford(t.give), keep: true, fn: () => { if (!afford(t.give)) return; pay(t.give); t.fn(); sound.pickup(); toast('Traded for ' + t.get, '#ffc23d'); traderMenu(); } })), { label: 'LEAVE', fn: () => {} }]);
}
interactHooks.push((p, consider) => consider(Math.hypot(trader.pos.x - p.x, trader.pos.z - p.z) - 0.8, { type: 'hook', label: `${G('interact')} Trade with Rook`, act: traderMenu }));
// ---- keycard bunkers
const TIER = { bronze: { col: 0xc0783a, css: '#d08a4a', name: 'Bronze' }, silver: { col: 0xc8d0d8, css: '#d8e0e8', name: 'Silver' }, gold: { col: 0xffc23d, css: '#ffc23d', name: 'Gold' } };
const bunkers = [['bronze', -20, 100], ['silver', 100, -20], ['gold', -100, -100]].map(([tier, cx, cz]) => {
  const [x, z] = findFree(cx, cz, 4); const g = new THREE.Group(); g.position.set(x, 0, z); const T2 = TIER[tier];
  const conc = new THREE.MeshStandardMaterial({ color: 0x5a5a55, roughness: 1, normalMap: W.tex.dConc.normalMap });
  sAdd(g, new THREE.BoxGeometry(6, 2.4, 5), conc, 0, 1.0, 0); sAdd(g, new THREE.BoxGeometry(6.6, 0.5, 5.6), conc, 0, 2.3, 0);
  const frame = sAdd(g, new THREE.BoxGeometry(2.2, 2.2, 0.3), darkMetal, 0, 1.1, 2.55);
  const doorMat = new THREE.MeshStandardMaterial({ color: T2.col, metalness: 0.8, roughness: 0.35 }); const door = sAdd(g, new THREE.BoxGeometry(1.7, 1.9, 0.12), doorMat, 0, 0.95, 2.72);
  const stripe = sAdd(g, new THREE.BoxGeometry(1.7, 0.12, 0.13), new THREE.MeshBasicMaterial({ color: 0x111111 }), 0, 1.3, 2.73);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07), new THREE.MeshBasicMaterial({ color: 0xff3020 })); lamp.position.set(1.25, 1.3, 2.75); g.add(lamp);
  sAdd(g, new THREE.BoxGeometry(0.25, 0.35, 0.08), darkMetal, 1.25, 1.05, 2.72);
  for (let i = 0; i < 6; i++) { const v = new THREE.Mesh(new THREE.PlaneGeometry(R(1, 2), R(1.5, 2.4)), W.vineMat); v.position.set(R(-2.8, 2.8), 1.3, 2.52); g.add(v); }
  scene.add(g); W.addCollider(x - 3, x + 3, z - 2.5, z + 2.5, 2.6, 'building');
  const b = { tier, pos: new V3(x, 0, z + 3.3), g, door, lamp, opened: false };
  mapMarkers.push({ x, z, r: 2, col: () => b.opened ? '#555' : T2.css, hidden: () => !flags.cards[tier] && !b.seen });
  return b;
});
updaters.push(() => { for (const b of bunkers) if (!b.seen && b.pos.distanceTo(P.pos) < 30) b.seen = true; });
function openBunkerVisual(b) { b.opened = true; b.door.position.y = 2.9; b.lamp.material.color.set(0x9dff2e); }
const REWARD = {
  bronze: () => { flags.turretLaser = true; inv.scrap += 10; inv.parts += 4; return 'Blueprint: <b>Turret Laser Retrofit</b> (all turrets now fire searing lasers) · +10 Scrap · +4 Parts'; },
  silver: () => { flags.cards.gold = true; giveClothing({ slot: 'torso', name: 'Chitin Harness', rarity: 4, armor: 14, warmth: 6, effect: 'Chitin-lined: -10% charge damage' }); inv.meds += 3; return '<b style="color:#ffc23d">Gold Keycard</b> · Legendary Chitin Harness · +3 Medicine'; },
  gold: () => { wakePending = 2.5; return 'A lift shaft drops into the dark. Far below, something enormous starts to beat.'; },
};
function openBunker(b) {
  if (b.opened) return; if (!flags.cards[b.tier]) return toast(`Locked. Needs a ${TIER[b.tier].name} Keycard.`, '#ff7a5a');
  openBunkerVisual(b); flags.bunkers[b.tier] = true; sound.boom(); rumble(pad, 0.4, 0.4, 400); debris.burst(new V3(b.pos.x, 1.5, b.pos.z - 0.6), 30, [0x555555, 0x3a5a22], 4, 1.2, 8);
  const txt = REWARD[b.tier](); dialog(TIER[b.tier].name.toUpperCase() + ' BUNKER OPENED', txt, [{ label: 'CONTINUE', fn: () => {} }]); autosave();
}
interactHooks.push((p, consider) => { for (const b of bunkers) if (!b.opened) consider(Math.hypot(b.pos.x - p.x, b.pos.z - p.z) - 0.6, { type: 'hook', label: flags.cards[b.tier] ? `${G('interact')} Swipe ${TIER[b.tier].name} Keycard` : `<span style="color:${TIER[b.tier].css}">${TIER[b.tier].name.toUpperCase()} BUNKER</span> · needs a ${TIER[b.tier].name} Keycard`, act: () => openBunker(b) }); });
function giveCard(tier, how) { if (flags.cards[tier]) return; flags.cards[tier] = true; banner(TIER[tier].name.toUpperCase() + ' KEYCARD', how, 5000); sound.tame(); }
function cardsHTML() { return Object.keys(TIER).map(t => `<div class="gear"><b style="color:${flags.cards[t] ? TIER[t].css : '#555'}">▰ ${TIER[t].name} Keycard</b> <small>${flags.bunkers[t] ? 'used' : flags.cards[t] ? 'ready' : t === 'bronze' ? 'scavenge the ruins' : t === 'silver' ? 'raider captains carry one' : 'locked behind silver'}</small></div>`).join(''); }
// bronze card turns up in debris (guaranteed by the 4th pile)
{ const orig = lootPile; lootPile = function (l) { orig(l); flags.lootN++; if (!flags.cards.bronze && (flags.lootN >= 4 || Math.random() < 0.2)) giveCard('bronze', 'Found in the debris. The bronze bunker lies in the Drowned Market, to the south.'); }; }
// turret laser retrofit
{ const origUpd = STRUCT_UPD.turret; STRUCT_UPD.turret = (s, dt) => { if (flags.turretLaser && !s.lz) { s.lz = true; s.group.userData.laser.material = s.group.userData.laser.material.clone(); s.group.userData.laser.material.color.set(0xff6a2a); s.group.userData.laser.scale.x = s.group.userData.laser.scale.z = 0.02; } }; }
// ---- new species
function buildSkitter() {
  const body = new THREE.Group(), legs = []; const shell = stdMat(0x2a3a22, { metalness: 0.3, roughness: 0.5 }), glow = new THREE.MeshStandardMaterial({ color: 0x223300, emissive: 0xb8ff3a, emissiveIntensity: 1.4 });
  const ab = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 8), shell); ab.scale.set(1, 0.7, 1.3); ab.position.set(0, 0.55, -0.3); ab.castShadow = true; body.add(ab);
  const th = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), shell); th.position.set(0, 0.5, 0.25); body.add(th);
  const head = new THREE.Group(); head.position.set(0, 0.5, 0.48); body.add(head); for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.05), glow); e.position.set(s * 0.08, 0.05, 0.06); head.add(e); const f = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.25, 4), shell); f.position.set(s * 0.07, -0.08, 0.1); f.rotation.x = 1.9; head.add(f); }
  for (let i = 0; i < 4; i++) { const sp = new THREE.Mesh(new THREE.SphereGeometry(0.06), glow); sp.position.set(R(-0.2, 0.2), 0.78, -0.3 + R(-0.3, 0.3)); body.add(sp); }
  for (let i = 0; i < 6; i++) { const s = i < 3 ? -1 : 1, k = i % 3; const l = new THREE.Group(); l.position.set(s * 0.2, 0.5, 0.25 - k * 0.22); l.rotation.y = s * (0.4 - k * 0.4); body.add(l);
    const u = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.025, 0.55, 4), shell); u.rotation.z = s * 1.0; u.position.set(s * 0.24, 0.12, 0); l.add(u); const d = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.01, 0.6, 4), shell); d.position.set(s * 0.5, -0.2, 0); d.rotation.z = -s * 0.35; l.add(d); legs.push(l); }
  return { body, legs, head, mats: [shell], hit: [[0, 0.55, -0.2, 0.45, 1], [0, 0.5, 0.45, 0.2, 1.8]], height: 1.0 };
}
function buildBloater() {
  const body = new THREE.Group(), legs = []; const skin = stdMat(0x6a6a3a, { roughness: 0.6 }), pus = new THREE.MeshStandardMaterial({ color: 0x334400, emissive: 0xc8ff2a, emissiveIntensity: 1.2, transparent: true, opacity: 0.9 });
  const sac = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), skin); sac.position.y = 1.5; sac.scale.set(1.05, 0.95, 1.05); sac.castShadow = true; body.add(sac);
  for (let i = 0; i < 14; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(R(0.1, 0.22), 8, 6), pus); const d = new V3(R(-1, 1), R(-0.3, 1), R(-1, 1)).normalize(); p.position.copy(d).multiplyScalar(0.98).add(new V3(0, 1.5, 0)); body.add(p); }
  const head = new THREE.Group(); head.position.set(0, 1.4, 0.95); body.add(head); const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 6, 12), stdMat(0x3a2a1a)); head.add(mouth);
  for (const [x, z] of [[0.5, 0.4], [-0.5, 0.4], [0.5, -0.4], [-0.5, -0.4]]) { const l = new THREE.Group(); l.position.set(x, 0.7, z); body.add(l); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.08, 0.75, 6), skin); c.position.y = -0.35; l.add(c); legs.push(l); }
  return { body, legs, head, sac, mats: [skin, pus], hit: [[0, 1.5, 0, 1.05, 1], [0, 1.4, 1.0, 0.3, 2]], height: 2.6 };
}
const gasClouds = [];
function gasCloud(x, z, r, dur, friendly) { gasClouds.push({ x, z, r, t: dur, friendly }); for (let i = 0; i < 40; i++) debris.emit(new V3(x + R(-r, r) * 0.6, R(0.3, 1.6), z + R(-r, r) * 0.6), new V3(R(-1, 1), R(0.2, 0.8), R(-1, 1)), [0x9acb3a, 0xc8ff5a, 0x6a8a2a][i % 3], dur * 0.6, -0.4); sound.burst(); }
updaters.push(dt => { for (let i = gasClouds.length - 1; i >= 0; i--) { const c = gasClouds[i]; c.t -= dt; if (c.t <= 0) { gasClouds.splice(i, 1); continue; }
  if (Math.random() < dt * 12) debris.emit(new V3(c.x + R(-c.r, c.r) * 0.7, 0.3, c.z + R(-c.r, c.r) * 0.7), new V3(R(-0.5, 0.5), 0.6, R(-0.5, 0.5)), 0xb8e04a, 1.4, -0.3);
  if (!c.friendly && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < c.r) { hurtPlayer(9 * dt, 'gas'); if (!hasEffect('Gasmask') && !(gear.head && gear.head.name === 'Gasmask Rig') && Math.random() < dt * 0.3) { P.sick = true; } }
  for (const m of mutants) if (!m.dead && (c.friendly ? !m.tamed : m.tamed) && Math.hypot(m.pos.x - c.x, m.pos.z - c.z) < c.r + 0.5) damageMutant(m, 14 * dt, c.friendly ? 'tame' : 'mutant'); } });
Object.assign(BUILDERS, { skitter: buildSkitter, bloater: buildBloater });
Object.assign(SPECIES, {
  skitter: { name: 'Skitter', hp: 38, speed: 7.8, dmg: 6, reach: 1.3, atkCD: 0.55, aggro: 26, radius: 0.5, food: 'veg', w: [0.3, 0.4], pack: 3,
    desc: 'Glow-backed scavenger that hunts in packs of three. Fast, fragile, relentless. Moonlight makes its spots blaze.', tame: 'Weaken it, then offer Vegetables.',
    anim: (m, dt) => { const f = clamp((m.moveSpeed || 0) / 4, 0, 1.5); m.b.legs.forEach((l, i) => l.rotation.x = Math.sin(m.t * 3 + i * 1.1) * 0.5 * f); } },
  bloater: { name: 'Bloater', hp: 130, speed: 2.1, dmg: 0, reach: 2.6, atkCD: 6, aggro: 22, radius: 1.1, food: 'meds', w: [0.15, 0.15],
    desc: 'A waddling sac of fermenting spores. Swells, then bursts into a toxic cloud. Gasmasks help. Shoot it from range.', tame: 'Weaken it, then give it Medicine to settle the rot. Tamed, it gasses your enemies.',
    init: m => { m.swell = 0; },
    anim: (m, dt) => { const f = clamp((m.moveSpeed || 0) / 2, 0, 1); m.b.legs.forEach((l, i) => l.rotation.x = Math.sin(m.t * 2 + i * Math.PI / 2) * 0.4 * f); const s = 1 + Math.sin(now * 3 + m.t) * 0.03 + (m.swell || 0) * 0.35; m.b.sac.scale.set(1.05 * s, 0.95 * s, 1.05 * s); },
    ai: (m, t, tp, dist, dt) => {
      if (m.tamed) return;
      if (m.swell > 0) { m.swell += dt * 1.1; m.moveSpeed = 0; if (m.swell > 1) { gasCloud(m.pos.x, m.pos.z, 4.2, 6, false); m.swell = 0; m.hp = 0; killMutant(m, 'self'); } return; }
      if (t && dist < 2.8) { m.swell = 0.01; sound.growl(0.4); return; }
      if (t) steer(m, tp.x, tp.z, m.def.speed * (isNight ? 1.2 : 1), dt); else { m.wanderT -= dt; if (m.wanderT <= 0) { m.wander = R(0, 6.28); m.wanderT = R(3, 6); } steer(m, m.pos.x + Math.sin(m.wander) * 5, m.pos.z + Math.cos(m.wander) * 5, 0.6, dt); }
    },
    onDeath: (m, src) => { if (src !== 'self' && !m.tamed) gasCloud(m.pos.x, m.pos.z, 3.5, 4, false); } },
});
Object.assign(bestiary, { skitter: { seen: false, tamed: 0 }, bloater: { seen: false, tamed: 0 } });
// tamed bloater: gas puffs around it instead of melee
updaters.push(dt => { for (const m of mutants) if (m.tamed && !m.ko && m.sp === 'bloater') { m.gasCD = (m.gasCD || 0) - dt; if (m.gasCD <= 0 && mutants.some(e => isThreat(e) && e.pos.distanceTo(m.pos) < 4)) { m.gasCD = 6; gasCloud(m.pos.x, m.pos.z, 3.5, 3, true); } } });
// skitters arrive in packs
{ const origSpawn = spawnMutant; spawnMutant = function (sp, x, z, opts = {}) { const m = origSpawn(sp, x, z, opts); if (SPECIES[sp].pack && !opts.packed && !opts.raid) for (let i = 1; i < SPECIES[sp].pack; i++) origSpawn(sp, x + R(-2, 2), z + R(-2, 2), Object.assign({}, opts, { packed: true })); return m; }; }
// ---- raiders (ranged humans)
function buildRaider(captain) {
  const body = new THREE.Group(); const cloth = stdMat(captain ? 0x5a1a14 : 0x3a3a30, { flatShading: false }), skin = stdMat(0x8a6a50), metal = stdMat(0x2a2d2e, { metalness: 0.7 }), mask = stdMat(0xa82a1a);
  const add = (geo, mat, x, y, z, p = body) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  const legs = []; for (const s of [-1, 1]) { const l = new THREE.Group(); l.position.set(s * 0.12, 0.9, 0); body.add(l); add(new THREE.BoxGeometry(0.16, 0.9, 0.18), cloth, 0, -0.45, 0, l); legs.push(l); }
  add(new THREE.BoxGeometry(0.48, 0.62, 0.28), cloth, 0, 1.22, 0); if (captain) { add(new THREE.BoxGeometry(0.62, 0.12, 0.34), metal, 0, 1.52, 0); for (let i = 0; i < 5; i++) add(new THREE.ConeGeometry(0.03, 0.18, 4), metal, -0.24 + i * 0.12, 1.65, 0); }
  const head = new THREE.Group(); head.position.set(0, 1.7, 0); body.add(head); add(new THREE.BoxGeometry(0.24, 0.27, 0.24), skin, 0, 0, 0, head); add(new THREE.BoxGeometry(0.26, 0.12, 0.26), mask, 0, -0.04, 0.01, head); add(new THREE.BoxGeometry(0.27, 0.07, 0.27), stdMat(0x1a1a1a), 0, 0.1, 0, head);
  const arm = new THREE.Group(); arm.position.set(0.25, 1.45, 0.05); body.add(arm); add(new THREE.BoxGeometry(0.12, 0.12, 0.5), cloth, 0, -0.08, 0.2, arm); const gun = add(new THREE.BoxGeometry(0.07, 0.1, 0.8), metal, -0.1, -0.05, 0.45, arm); legs.push(arm);
  return { body, legs, head, arm, mats: [cloth], hit: [[0, 1.25, 0, 0.36, 1], [0, 1.72, 0, 0.17, 2.2], [0, 0.55, 0, 0.3, 0.8]], height: 2.0 };
}
BUILDERS.raider = () => buildRaider(false); BUILDERS.captain = () => buildRaider(true);
const raiderAI = (m, t, tp, dist, dt) => {
  if (m.tamed) return; m.fireCD = (m.fireCD ?? R(1, 2)) - dt;
  if (!t) { m.wanderT -= dt; if (m.wanderT <= 0) { m.wander = R(0, 6.28); m.wanderT = R(3, 6); } steer(m, m.pos.x + Math.sin(m.wander) * 5, m.pos.z + Math.cos(m.wander) * 5, 1.4, dt); return; }
  const eye = new V3(m.pos.x, 1.6, m.pos.z), tgt = t === PLAYER ? new V3(P.pos.x, 1.3, P.pos.z) : aimPoint(t); const los = losClear(eye, tgt);
  const want = m.alpha ? 14 : 12; m.strafe = m.strafe ?? (Math.random() < 0.5 ? 1 : -1); if (Math.random() < dt * 0.4) m.strafe *= -1;
  if (dist > want + 6 || !los) steer(m, tp.x, tp.z, m.def.speed, dt);
  else { const dx = tp.x - m.pos.x, dz = tp.z - m.pos.z, L = Math.hypot(dx, dz) || 1; const back = dist < want - 4 ? -1 : 0; steer(m, m.pos.x + (-dz / L * m.strafe + dx / L * back) * 4, m.pos.z + (dx / L * m.strafe + dz / L * back) * 4, m.def.speed * 0.6, dt); face(m, tp.x, tp.z, dt * 3); }
  if (los && dist < 34 && m.fireCD <= 0) {
    m.fireCD = R(1.1, 1.9) * (m.alpha ? 0.8 : 1); const muz = new V3(0.2, 1.45, 1.0).applyAxisAngle(new V3(0, 1, 0), m.yaw).add(m.pos);
    const moving = Math.hypot(P.vel.x, P.vel.z) > 3; const hitChance = t === PLAYER ? (moving ? 0.32 : 0.55) * (P.sprinting ? 0.6 : 1) * (inSafeZone(P.pos) ? 0 : 1) : 0.6;
    const hit = Math.random() < hitChance; const end = tgt.clone().add(hit ? new V3() : new V3(R(-1.5, 1.5), R(-0.5, 1.2), R(-1.5, 1.5)));
    tracer(muz, end, 0xff7a3a, 0.02, 0.07); sound.enemyShot && sound.enemyShot(Math.max(0.15, 1 - m.pos.distanceTo(P.pos) / 50)); sparks.burst(muz, 4, 0xffb060, 2, 0.15, 0);
    if (hit) damageTarget(t, m.def.dmg * (m.alpha ? 1.3 : 1), 'raider');
  }
};
const raiderAnim = (m, dt) => { const f = clamp((m.moveSpeed || 0) / 3, 0, 1.3); m.b.legs[0].rotation.x = Math.sin(m.t * 1.4) * 0.6 * f; m.b.legs[1].rotation.x = -Math.sin(m.t * 1.4) * 0.6 * f; m.b.arm.rotation.x = -0.15; };
Object.assign(SPECIES, {
  raider: { name: 'Raider', hp: 70, speed: 4.2, dmg: 7, reach: 1.5, atkCD: 1, aggro: 38, radius: 0.45, food: 'scrap', w: [0, 0], noTame: true, noBestiary: true, ai: raiderAI, anim: raiderAnim, loot: () => { P.reserve += 8; return { scrap: 3 }; }, desc: '', tame: '' },
  captain: { name: 'Raider Captain', hp: 150, speed: 4.4, dmg: 9, reach: 1.5, atkCD: 1, aggro: 42, radius: 0.5, food: 'scrap', w: [0, 0], noTame: true, noBestiary: true, ai: raiderAI, anim: raiderAnim,
    loot: () => { P.reserve += 15; return { scrap: 6, meds: 1 }; }, onDeath: () => giveCard('silver', 'Taken from the Raider Captain. The silver bunker is in the Rustworks, to the east.'), desc: '', tame: '' },
});
Object.assign(bestiary, { raider: { seen: false, tamed: 0 }, captain: { seen: false, tamed: 0 } });
let raidGroupT = 70;
updaters.push(dt => {
  if (isNight || flags.ending === 'redeem' && Math.random() < 0.5) return; raidGroupT -= dt; if (raidGroupT > 0) return; raidGroupT = R(80, 140);
  if (mutants.filter(m => (m.sp === 'raider' || m.sp === 'captain') && !m.dead).length >= 3) return;
  const s = freeSpot(P.pos.x, P.pos.z, 45, 70); if (!s || inSafeZone(new V3(s[0], 0, s[1])) || (core && Math.hypot(s[0] - core.pos.x, s[1] - core.pos.z) < 30)) return;
  const n = 2 + (Math.random() < 0.4 ? 1 : 0); for (let i = 0; i < n; i++) spawnMutant(i === 0 && !flags.cards.silver ? 'captain' : 'raider', s[0] + R(-3, 3), s[1] + R(-3, 3));
  toast('Voices and gunfire in the distance. <b>Raiders</b> are nearby.', '#ff9a4a');
});
// ---- evolution
function evolveMutant(m, quiet) {
  if (m.evolved) return; m.evolved = true; m.scale *= 1.2; m.g.scale.setScalar(m.scale); m.maxHp *= 1.6; m.hp = m.maxHp; m.dmgMul = 1.4; m.dispName = 'Elder ' + m.def.name;
  m.b.mats.slice(-1).forEach(mt => { mt.color.lerp(new THREE.Color(0x3a2a50), 0.5); mt.emissive = new THREE.Color(0x6a3aa0); mt.emissiveIntensity = 0.12; }); m.b.mats[0].color.lerp(new THREE.Color(0x3a2a44), 0.35);
  if (!quiet) { banner('EVOLVED', `${m.def.name} became an Elder ${m.def.name}: bigger, tougher, hits harder.`, 5000); sparks.burst(new V3(m.pos.x, 1.5, m.pos.z), 80, [0xb86bff, 0xe0c0ff, 0x9dff2e], 6, 1.5, 1); sound.tame(); rumble(pad, 0.5, 0.5, 400); }
}
RECIPES.push({ id: 'evolve', name: 'Evolve Active Tame', desc: 'Feeds mutant parts to a tame with 4+ kills. It grows into an Elder form.', cost: { parts: 4, scrap: 3 },
  cond: () => activeTame && !activeTame.ko && activeTame.bond >= 4 && !activeTame.evolved && core && P.pos.distanceTo(core.pos) < 8, why: 'needs a bonded tame (4 kills) and your core nearby', act: () => evolveMutant(activeTame) });
// ---- mounting (Ravagers, Elder tames, the Heartspawn)
const canMount = m => m && !m.ko && !m.dead && (m.sp === 'ravager' || m.evolved || m.sp === 'heartspawn');
function mountToggle(force) {
  if (P.mount) { const m = P.mount; P.mount = null; P.mountSpeed = 0; const side = new V3(Math.cos(P.yaw), 0, -Math.sin(P.yaw)); P.pos.addScaledVector(side, m.def.radius * m.scale + 0.8); resolve(P.pos, 0.4); if (!force) toast('Dismounted'); return; }
  const cands = mutants.filter(m => m.tamed && canMount(m) && Math.hypot(m.pos.x - P.pos.x, m.pos.z - P.pos.z) < 4 + m.def.radius * m.scale);
  if (!cands.length) { const t = activeTame; toast(t ? (canMount(t) ? `Get closer to your ${t.dispName || t.def.name} to ride it.` : `${t.def.name}s can't be ridden. Ravagers and Elder tames can.`) : 'No mount nearby. Tame a Ravager.', '#e6d17a'); return; }
  const m = cands[0]; P.mount = m; P.vel.set(0, 0, 0); P.pos.set(m.pos.x, 0, m.pos.z); toast(`Riding ${m.dispName || m.def.name} · sprint to charge through enemies`, '#6fd46a'); sound.growl(0.7); rumble(pad, 0.3, 0.3, 200);
}
function mountUpdate(dt, moveIn) {
  const m = P.mount; if (!canMount(m)) { mountToggle(true); return; }
  const sprint = (keys.ShiftLeft || padP(10) || touchIn.sprint || P.sprintLatch) && moveIn.z < -0.2; if (padPressed(10)) P.sprintLatch = true; if (moveIn.lengthSq() < 0.04) P.sprintLatch = false;
  const spd = (sprint ? 13 : 8.5) * (m.sp === 'heartspawn' ? 1.15 : 1);
  const wish = moveIn.clone().applyAxisAngle(new V3(0, 1, 0), P.yaw).multiplyScalar(spd); P.vel.x = lerp(P.vel.x, wish.x, Math.min(1, dt * 5)); P.vel.z = lerp(P.vel.z, wish.z, Math.min(1, dt * 5)); P.vel.y = 0;
  P.pos.addScaledVector(P.vel, dt); P.pos.y = 0; resolve(P.pos, m.def.radius * m.scale * 0.8); const hs = Math.hypot(P.vel.x, P.vel.z); P.mountSpeed = hs; P.sprinting = sprint;
  if (sprint && hs > 9) { m.ramCD = (m.ramCD || 0) - dt; for (const e of mutants) { if (!isThreat(e) || e.ramT > now) continue; if (Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z) < m.def.radius * m.scale + e.def.radius * e.scale + 0.6) { e.ramT = now + 0.8; damageMutant(e, 35 * (m.dmgMul || 1), 'tame'); const k = new V3(e.pos.x - P.pos.x, 0, e.pos.z - P.pos.z).normalize().multiplyScalar(3); e.pos.add(k); P.shake = 0.3; rumble(pad, 0.7, 0.4, 180); sound.boom(); } } }
  if (sprint && Math.random() < 0.5) debris.emit(new V3(P.pos.x + R(-1, 1), 0.2, P.pos.z + R(-1, 1)), new V3(R(-2, 2), R(1, 3), R(-2, 2)), 0x6b6050, 0.8, 8);
  P.stam = Math.min(100, P.stam + 10 * dt); survival(dt, false); weapon(dt); updateCamera(dt, hs, sprint);
}
// ---------------------------------------------------------------- M6c: final boss (the Verdant Heart) and the redeem / embrace ending
const ARENA = (() => { const [x, z] = findFree(-80, -80, 3); return new V3(x, 0, z); })();
function buildHeart() {
  const body = new THREE.Group(); const vein = new THREE.MeshStandardMaterial({ color: 0x1a3a10, emissive: 0x9dff2e, emissiveIntensity: 1.2, roughness: 0.5 });
  const flesh = new THREE.MeshStandardMaterial({ color: 0x3a1a1a, roughness: 0.45, metalness: 0.1, normalMap: W.tex.dMoss.normalMap, normalScale: new THREE.Vector2(2, 2) });
  const bark = new THREE.MeshStandardMaterial({ map: W.tex.bark, normalMap: W.tex.dBark.normalMap, roughness: 1 });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 3), flesh); core.position.y = 3.2; core.castShadow = true; body.add(core);
  for (let i = 0; i < 9; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.07, 6, 30, R(2, 4.5)), vein); t.position.y = 3.2; t.rotation.set(R(0, 6), R(0, 6), R(0, 6)); body.add(t); }
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; const r = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.7, 5, 6), bark); r.position.set(Math.cos(a) * 2.6, 1.6, Math.sin(a) * 2.6); r.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6); r.castShadow = true; body.add(r); }
  const tentacles = []; for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + 0.3; const segs = []; let parent = body; const root = new THREE.Group(); root.position.set(Math.cos(a) * 2, 3.6, Math.sin(a) * 2); root.rotation.y = -a + Math.PI / 2; body.add(root); parent = root;
    for (let k = 0; k < 7; k++) { const s = new THREE.Group(); s.position.z = k ? 1.05 : 0; parent.add(s); const m = new THREE.Mesh(new THREE.SphereGeometry(0.42 - k * 0.045, 8, 6), k % 2 ? flesh : bark); m.scale.z = 1.6; m.castShadow = true; s.add(m); segs.push(s); parent = s; }
    tentacles.push({ root, segs, a, slam: 0 }); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9dff2e, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 })); glow.scale.set(9, 9, 1); glow.position.y = 3.2; body.add(glow);
  return { body, legs: [], head: core, core, vein, flesh, glow, tentacles, mats: [flesh], hit: [[0, 3.2, 0, 2.3, 1]], height: 6 };
}
BUILDERS.heart = buildHeart;
const ringGeo = new THREE.RingGeometry(0.85, 1, 40); ringGeo.rotateX(-Math.PI / 2);
const slams = [], spores = [];
const sporeGeo = new THREE.SphereGeometry(0.3, 10, 8), sporeMat = new THREE.MeshBasicMaterial({ color: 0xc8ff5a });
function heartAI(m, t, tp, dist, dt) {
  const b = m.b; const enr = m.hp < m.maxHp * 0.5; if (enr && !m.enraged) { m.enraged = true; banner('THE HEART RAGES', 'It knows who you are.', 3500); b.vein.emissive.set(0xff5a2a); b.glow.material.color.set(0xff6a3a); sound.shriek(); rumble(pad, 0.8, 0.8, 600); }
  const pulse = 1 + Math.sin(now * (enr ? 7 : 4.5)) * 0.05; b.core.scale.setScalar(pulse); b.vein.emissiveIntensity = 1 + Math.sin(now * (enr ? 7 : 4.5)) * 0.6;
  if (Math.sin(now * (enr ? 7 : 4.5)) > 0.98 && m.pos.distanceTo(P.pos) < 40) sound.growl(0.25);
  b.tentacles.forEach((tn, i) => { tn.segs.forEach((s, k) => { s.rotation.x = Math.sin(now * 1.3 + i + k * 0.6) * 0.18 + (tn.slam > 0 ? (tn.slam > 0.5 ? -0.35 : 0.5) : 0.12); s.rotation.y = Math.cos(now * 1.1 + i * 2 + k * 0.5) * 0.15; }); if (tn.slam > 0) tn.slam -= dt; });
  const dP = Math.hypot(P.pos.x - m.pos.x, P.pos.z - m.pos.z); if (dP > 60 || P.dead) return;
  m.cd -= 0; m.slamT = (m.slamT ?? 2) - dt; m.sporeT = (m.sporeT ?? 4) - dt; m.sumT = (m.sumT ?? 10) - dt;
  if (m.slamT <= 0) { m.slamT = enr ? 1.6 : 2.6; const tgt = new V3(P.pos.x + P.vel.x * 0.5, 0.03, P.pos.z + P.vel.z * 0.5); if (tgt.distanceTo(m.pos) < 16) { const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })); ring.position.copy(tgt); ring.scale.setScalar(2.6); scene.add(ring); slams.push({ ring, pos: tgt, t: 1.1 }); const tn = b.tentacles[(Math.random() * 6) | 0]; tn.slam = 1.1; } }
  if (m.sporeT <= 0) { m.sporeT = enr ? 2.2 : 3.6; for (let k = 0; k < (enr ? 3 : 2); k++) { const s = new THREE.Mesh(sporeGeo, sporeMat); s.position.set(m.pos.x + R(-1, 1), 5.5, m.pos.z + R(-1, 1)); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x9dff2e, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.set(1.6, 1.6, 1); s.add(sp); scene.add(s); spores.push({ mesh: s, vel: new V3(R(-3, 3), 6, R(-3, 3)), t: 6 }); } }
  if (m.sumT <= 0) { m.sumT = enr ? 14 : 20; for (let k = 0; k < 2; k++) { const a = R(0, 6.28); const th = spawnMutant(Math.random() < 0.5 ? 'thornling' : 'skitter', m.pos.x + Math.cos(a) * 7, m.pos.z + Math.sin(a) * 7, { raid: true, packed: true }); th.provoked = now; } }
}
updaters.push(dt => {
  for (let i = slams.length - 1; i >= 0; i--) { const s = slams[i]; s.t -= dt; s.ring.material.opacity = 0.4 + Math.sin(now * 30) * 0.3; s.ring.scale.setScalar(2.6 * (0.6 + 0.4 * (1 - s.t / 1.1)));
    if (s.t <= 0) { scene.remove(s.ring); slams.splice(i, 1); debris.burst(new V3(s.pos.x, 0.3, s.pos.z), 40, [0x4a3826, 0x3a5a22, 0x9dff2e], 7, 1.2, 12, 1); sound.boom(); if (Math.hypot(P.pos.x - s.pos.x, P.pos.z - s.pos.z) < 2.6) { hurtPlayer(28, 'boss'); P.vel.y = 4; P.onGround = false; } else if (P.pos.distanceTo(s.pos) < 12) { P.shake = 0.35; rumble(pad, 0.5, 0.3, 180); } } }
  for (let i = spores.length - 1; i >= 0; i--) { const s = spores[i]; s.t -= dt; const to = new V3(P.pos.x, 1.2, P.pos.z).sub(s.mesh.position); s.vel.addScaledVector(to.normalize(), dt * 9); s.vel.multiplyScalar(1 - dt * 0.5); if (s.vel.length() > 9) s.vel.setLength(9); s.mesh.position.addScaledVector(s.vel, dt);
    const hitP = s.mesh.position.distanceTo(new V3(P.pos.x, 1.2, P.pos.z)) < 0.9; if (hitP || s.t <= 0 || s.mesh.position.y < 0.2) { if (hitP) hurtPlayer(10, 'spore'); sparks.burst(s.mesh.position, 14, [0x9dff2e, 0xc8ff5a], 3, 0.5, 2); scene.remove(s.mesh); spores.splice(i, 1); } }
  const boss = heart && !heart.dead ? heart : null; const show = boss && boss.pos.distanceTo(P.pos) < 60 && state === 'play';
  $('bossbar').classList.toggle('hidden', !show); if (show) $('b-boss').style.width = (boss.hp / boss.maxHp * 100) + '%';
});
// spores can be shot down: piggyback on the player's hitscan by treating them as tiny targets
{ const origRay = worldRay; worldRay = function (o, d, maxD, skip) { const best = origRay(o, d, maxD, skip); for (let i = spores.length - 1; i >= 0; i--) { const s = spores[i]; const t = raySphere(o, d, s.mesh.position, 0.55); if (t < best.t) { sparks.burst(s.mesh.position, 14, [0x9dff2e], 3, 0.4, 2); scene.remove(s.mesh); spores.splice(i, 1); } } return best; }; }
let heart = null;
SPECIES.heart = { name: 'The Verdant Heart', hp: 2600, speed: 0, dmg: 0, reach: 0, atkCD: 9, aggro: 70, radius: 2.6, food: 'meds', w: [0, 0], noTame: true, noBestiary: true, boss: true, ai: heartAI, desc: '', tame: '',
  init: m => { m.provoked = now; }, loot: () => ({ parts: 20 }), onDeath: m => { setTimeout(heartEnding, 1800); } };
bestiary.heart = { seen: false, tamed: 0 };
function wakeHeart() {
  if (heart && !heart.dead || flags.bossDone) return;
  heart = spawnMutant('heart', ARENA.x, ARENA.z, { alpha: false, shiny: false }); heart.g.position.y = -6;
  document.body.classList.add('cine'); banner('THE VERDANT HEART', 'Beneath Verdant Labs, the thing you made is still alive. It has been waiting for you.', 6500); sound.horn(); P.shake = 0.8; rumble(pad, 1, 1, 900);
  let k = 0; const rise = setInterval(() => { k++; heart.g.position.y = Math.min(0, -6 + k * 0.12); debris.burst(new V3(ARENA.x + R(-3, 3), 0.5, ARENA.z + R(-3, 3)), 8, [0x4a3826, 0x3a5a22], 6, 1.2, 12); if (k >= 50) { clearInterval(rise); document.body.classList.remove('cine'); } }, 50);
  mapMarkers.push({ x: ARENA.x, z: ARENA.z, r: 3.5, col: '#ff3a2a', hidden: () => !heart || heart.dead });
}
function heartEnding() {
  flags.bossDone = true; document.body.classList.add('cine'); const knows = foundLogs() >= 4;
  dialog('THE HEART IS STILL', (knows ? 'Badge #0001. Lead researcher. You opened Valve 7, silenced the alarm and walked out. Then you erased yourself.' : 'It does not die. It waits, and it knows your face.') +
    '<br><br>The Heart beats once more under your hand. It is offering you something.<br><br><b style="color:#9dff2e">REDEEM</b>: burn it out. The city slowly heals, and the green loses its hunger.<br><b style="color:#b86bff">EMBRACE</b>: take what you made. Become its keeper. Its first child walks at your side.',
    [{ label: 'REDEEM: BURN IT OUT', fn: () => endGame('redeem') }, { label: 'EMBRACE: BECOME ITS KEEPER', fn: () => endGame('embrace') }]);
}
function endGame(choice) {
  flags.ending = choice; document.body.classList.remove('cine'); applyEnding(false);
  if (choice === 'redeem') banner('REDEEMED', 'The fire takes the Heart. For the first time in years the fog thins. Wild mutants grow calmer. The ruins are yours to rebuild. Thank you for playing RUINBORN.', 11000);
  else banner('EMBRACED', 'The Heart folds into you. A Heartspawn rises from the roots and kneels. It is the exception to every rule. Thank you for playing RUINBORN.', 11000);
  sound.tame(); rumble(pad, 0.6, 0.6, 800); autosave();
}
function applyEnding(loading) {
  if (flags.ending === 'redeem') { DIFF = Object.assign({}, DIFF, { spawn: DIFF.spawn * 0.6 }); }
  if (flags.ending === 'embrace' && !loading) { const m = spawnMutant('heartspawn', ARENA.x + 4, ARENA.z + 4); tameMutantQuiet(m); bestiary.heartspawn.tamed++; m.atBase = false; m.followOff = new V3(-2.4, 0, 3.2); toast('The <b>Heartspawn</b> follows you. It does not count toward your party cap, and you can ride it.', '#b86bff'); }
}
function afterFlagsLoaded() { applyEnding(true); if (flags.ending === 'embrace') { const hs = mutants.find(m => m.tamed && m.sp === 'heartspawn' && !m.remove); if (hs) { hs.atBase = false; hs.followOff = new V3(-2.4, 0, 3.2); } }
  if (flags.bunkers.gold && !flags.bossDone) setTimeout(wakeHeart, 1500); }
BUILDERS.heartspawn = () => { const b = buildRavager(); b.mats.forEach(m => { m.color.lerp(new THREE.Color(0x2a4a1a), 0.6); m.emissive = new THREE.Color(0x9dff2e); m.emissiveIntensity = 0.18; });
  const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 2), new THREE.MeshStandardMaterial({ color: 0x3a1a1a, emissive: 0x9dff2e, emissiveIntensity: 1.5 })); h.position.set(0, 2.5, -0.2); b.body.add(h); return b; };
SPECIES.heartspawn = { name: 'Heartspawn', hp: 420, speed: 6, dmg: 22, reach: 2.6, atkCD: 1.1, aggro: 30, radius: 1.35, food: 'meds', w: [0, 0], noBestiary: false,
  desc: 'First child of the Heart. Obeys only its keeper. Rideable and fast.', tame: 'Cannot be tamed. It chooses you.',
  anim: (m, dt) => { const f = clamp((m.moveSpeed || 0) / 4, 0, 1.4); m.b.legs.forEach((l, i) => l.rotation.x = Math.sin(m.t + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 * f); } };
bestiary.heartspawn = { seen: false, tamed: 0 };
// ---------------------------------------------------------------- M7: character creator (male / female survivor)
let look = (() => { try { return Object.assign({}, DEFAULT_LOOK, JSON.parse(localStorage.getItem('ruinborn.look') || '{}')); } catch (e) { return Object.assign({}, DEFAULT_LOOK); } })();
let creatorOn = false, ccYaw = Math.PI - 0.45, ccDrag = null;
applyLook2(look);
function applyLook2(l) { const kids = [...playerModel.muzzle.children]; applyLook(playerModel, l); kids.forEach(k => playerModel.muzzle.add(k)); }
saveHooks.push({ save: o => { o.look = { ...look }; }, load: o => { if (o.look) { look = Object.assign({}, DEFAULT_LOOK, o.look); applyLook2(look); } } });
const HAIR_NAMES = { messy: 'MESSY CROP', buzz: 'BUZZ CUT', undercut: 'UNDERCUT', ponytail: 'PONYTAIL', long: 'LONG & MATTED', bun: 'SCRAPPY BUN', mohawk: 'MOHAWK', shaved: 'SHAVED' };
const HAIR_CNAMES = ['BLACK', 'DARK BROWN', 'CHESTNUT', 'DIRTY BLOND', 'ASH', 'GREY', 'RUST RED', 'MOSS DYE'];
const CC_ROWS = [
  { k: 'body', label: 'Body', opts: ['male', 'female'], name: v => v.toUpperCase() },
  { k: 'skin', label: 'Skin tone', opts: SKIN_TONES.map((_, i) => i), name: v => `<i class="sw" style="background:${SKIN_TONES[v]}"></i>TONE ${v + 1}` },
  { k: 'hair', label: 'Hair', opts: () => HAIRS[look.body].map(h => h[0]), name: v => hairFor(look)[2] },
  { k: 'hairColor', label: 'Hair color', opts: HAIR_COLORS.map((_, i) => i), name: v => `<i class="sw" style="background:${HAIR_COLORS[v]}"></i>${HAIR_CNAMES[v]}` },
  { k: 'scars', label: 'Scars & grime', opts: [0, 1], name: v => v ? 'BATTLE-WORN' : 'LIGHT' },
];
function renderCreator() {
  const fk = nav.cur && nav.cur.dataset.k;
  $('ccRows').innerHTML = CC_ROWS.map(r => `<div class="row"><span>${r.label}</span><button class="cyc" data-cycle data-k="${r.k}">◀ ${r.name(look[r.k])} ▶</button></div>`).join('');
  $('ccRows').querySelectorAll('[data-k]').forEach(el => { const r = CC_ROWS.find(r => r.k === el.dataset.k);
    const cyc = d => { const o = typeof r.opts === 'function' ? r.opts() : r.opts; look[r.k] = o[(o.indexOf(look[r.k]) + d + o.length) % o.length]; ccChanged(); };
    el.onclick = () => cyc(1); el.addEventListener('cycle', e => cyc(e.detail)); });
  $('ccHint').innerHTML = lastInput === 'pad' ? `D-pad / LS choose · ◀ ▶ change · Right stick rotates` : lastInput === 'touch' ? 'Tap an option to change it · drag the survivor to rotate' : 'Click options or use ← → · drag to rotate';
  nav.setRoot($('creator'), BACKS.creator, fk ? `[data-k="${fk}"]` : '#ccBegin');
  if (lastInput !== 'pad') nav.clear();
}
function ccChanged() { look.hair = hairFor(look)[0]; localStorage.setItem('ruinborn.look', JSON.stringify(look)); applyLook2(look); refreshGear(); renderCreator(); sound.uiMove(); }
function openCreator() {
  look = Object.assign({}, DEFAULT_LOOK, look); creatorOn = true; document.body.classList.add('creating'); sound.whoosh();
  for (const s of ['head', 'torso', 'legs']) gear[s] = null; refreshGear(); // new survivors start in rags
  openPanel('creator', 'title'); renderCreator();
}
function ccOff() { ccKey.intensity = ccRim.intensity = 0; }
function creatorBack() { ccOff(); creatorOn = false; document.body.classList.remove('creating'); sound.uiBack(); closePanels(true); showTitleMenu(); }
$('ccBegin').onclick = () => { sound.uiSelect(); ccOff(); creatorOn = false; document.body.classList.remove('creating'); startGame(null); };
$('ccRand').onclick = () => { const pk = a => a[(Math.random() * a.length) | 0]; look.body = pk(['male', 'female']); look.skin = (Math.random() * SKIN_TONES.length) | 0; look.hair = pk(HAIRS[look.body])[0]; look.hairColor = (Math.random() * HAIR_COLORS.length) | 0; look.scars = Math.random() < 0.7 ? 1 : 0; ccChanged(); };
renderer.domElement.addEventListener('pointerdown', e => { if (creatorOn) ccDrag = e.clientX; });
addEventListener('pointermove', e => { if (creatorOn && ccDrag != null) { ccYaw += (e.clientX - ccDrag) * 0.01; ccDrag = e.clientX; } });
addEventListener('pointerup', () => { ccDrag = null; });
$('creator').addEventListener('pointerdown', e => { if (e.target.id === 'creator') ccDrag = e.clientX; });
const CC_STAGE = new THREE.Vector3(-3, 0, 12);
const ccKey = new THREE.PointLight(0xffe2c4, 0, 9, 2), ccRim = new THREE.PointLight(0x9dff6a, 0, 7, 2); scene.add(ccKey, ccRim);
function creatorCam(dt) {
  if (openP !== 'creator') { creatorOn = false; ccOff(); document.body.classList.remove('creating'); titleCam(dt); return; }
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (gp && Math.abs(gp.axes[2] || 0) > 0.2) ccYaw += gp.axes[2] * dt * 2.5; else if (ccDrag == null) ccYaw += dt * 0.15;
  ccKey.position.set(CC_STAGE.x + 1.6, 2.3, CC_STAGE.z + 2.2); ccKey.intensity = 14; ccRim.position.set(CC_STAGE.x - 1.2, 1.9, CC_STAGE.z - 1.6); ccRim.intensity = 6;
  tod = 0.33; const pm = playerModel; pm.root.visible = true; vm.visible = false;
  pm.root.position.copy(CC_STAGE); pm.root.rotation.y = ccYaw;
  animatePlayer(pm, dt, { speed: 0, sprint: false, ads: false, pitch: 0, grounded: true, recoil: 0, reloading: false, mounted: false, relaxed: true });
  const narrow = innerWidth < 760; const side = narrow ? 0 : 0.62;
  camera.fov = narrow ? 42 : 34; camera.updateProjectionMatrix();
  camera.position.set(CC_STAGE.x + side, narrow ? 1.25 : 1.15, CC_STAGE.z + (narrow ? 5.2 : 4.6)); camera.lookAt(CC_STAGE.x + side, narrow ? 0.5 : 0.92, CC_STAGE.z);
  $('sleepfade').style.transition = 'none'; $('sleepfade').style.opacity = 0;
  camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
}
// trader gets her own look
if (typeof trader !== 'undefined') { applyLook(trader.m, { body: 'female', skin: 4, hair: 'tied', hairColor: 5, scars: 1 }); setGear(trader.m, { head: { name: 'Gasmask Rig', rarity: 2 }, torso: { name: 'Scavver Duster', rarity: 3 }, legs: { name: 'Cargo Pants', rarity: 1 } }, false); }
// showcase companion (debug / screenshots): a second survivor standing beside you
let showcaseM = null;
function showcase(lk, g, off = [1.6, 0, -0.6]) {
  if (!showcaseM) { showcaseM = buildPlayer(RARITY, { cloth: TX.clothTexture(), rust: W.tex.rust }, lk); scene.add(showcaseM.root); updaters.push(dt => { if (!showcaseM) return; const s = showcaseM.off, c = Math.cos(P.yaw), sn = Math.sin(P.yaw); showcaseM.root.position.set(P.pos.x + s[0] * c + s[2] * sn, 0, P.pos.z - s[0] * sn + s[2] * c); showcaseM.root.rotation.y = P.yaw + (s[3] || 0); animatePlayer(showcaseM, dt, { speed: 0, sprint: false, ads: false, pitch: 0, grounded: true, recoil: 0, reloading: false, mounted: false, relaxed: !!s[4] }); }); }
  else applyLook(showcaseM, lk);
  showcaseM.off = off; setGear(showcaseM, g || { head: null, torso: null, legs: null }, 0); showcaseM.root.traverse(o => { if (o.isMesh) o.castShadow = true; }); return showcaseM;
}
// ---------------------------------------------------------------- M7: organic mutant models + jointed animation
const orgMat = (c, kind, o = {}) => { const d = TX.detail ? TX.detail(kind) : null; return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.78 }, d ? { normalMap: d.normalMap, normalScale: new THREE.Vector2(0.35, 0.35) } : {}, o)); };
function oAdd(parent, geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m; }
const oSph = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const oCap = (r, l, s = 12) => new THREE.CapsuleGeometry(r, l, 6, s);
function tube(parent, pts, r, mat, seg = 24) { const c = new THREE.CatmullRomCurve3(pts.map(p => new V3(...p))); return oAdd(parent, new THREE.TubeGeometry(c, seg, r, 6, false), mat, 0, 0, 0); }
// limb: hip group -> upper capsule -> knee group -> lower capsule -> foot; returns {root, knee, foot}
function limb(parent, x, y, z, r1, l1, r2, l2, mat, footMat) {
  const root = new THREE.Group(); root.position.set(x, y, z); parent.add(root);
  oAdd(root, oCap(r1, l1), mat, 0, -l1 / 2 - r1 * 0.3, 0);
  const knee = new THREE.Group(); knee.position.y = -l1 - r1 * 0.4; root.add(knee); oAdd(knee, oSph(r1 * 0.85, 12, 10), mat, 0, 0, 0);
  oAdd(knee, oCap(r2, l2), mat, 0, -l2 / 2 - r2 * 0.3, 0);
  const foot = new THREE.Group(); foot.position.y = -l2 - r2 * 0.6; knee.add(foot);
  if (footMat) for (let i = -1; i <= 1; i++) { const c = oAdd(foot, new THREE.ConeGeometry(r2 * 0.35, r2 * 1.4, 6), footMat, i * r2 * 0.55, -r2 * 0.2, r2 * 0.6); c.rotation.x = Math.PI / 2 + 0.5; }
  return { root, knee, foot };
}
function buildRavager2() {
  const body = new THREE.Group(), legs = [];
  const skin = orgMat(0x5a4232, 'concrete', { roughness: 0.62 }), vine = orgMat(0x2f5a22, 'moss'), bone = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.45 }), flesh = new THREE.MeshStandardMaterial({ color: 0x6a2a24, roughness: 0.5, emissive: 0x2a0806 });
  const torso = new THREE.Group(); torso.position.y = 1.5; body.add(torso);
  // hunched spine: big shoulder hump tapering to hips
  [[0, 0.35, 0.9, 1.0, 0.95, 0.9], [0, 0.15, 0.2, 0.95, 0.85, 0.95], [0, 0.05, -0.55, 0.82, 0.72, 0.85], [0, 0.1, -1.05, 0.7, 0.62, 0.62]].forEach(([x, y, z, sx, sy, sz]) => oAdd(torso, oSph(1), skin, x, y, z, sx, sy, sz));
  oAdd(torso, oSph(0.6), flesh, 0, -0.42, 0.45, 1.1, 0.5, 1.4); // exposed belly
  for (let i = 0; i < 5; i++) { const rb = oAdd(torso, new THREE.TorusGeometry(0.78, 0.045, 6, 20, Math.PI * 0.9), bone, 0, -0.05, 0.75 - i * 0.28, 1.05, 1, 1); rb.rotation.set(0, Math.PI / 2, Math.PI * 1.05); rb.rotation.order = 'YZX'; }
  for (let i = 0; i < 7; i++) { const sp = oAdd(torso, new THREE.ConeGeometry(0.11, 0.5 + Math.sin(i * 0.9) * 0.25 + 0.2, 7), bone, 0, 1.12 - i * 0.12, 0.85 - i * 0.3); sp.rotation.x = -0.55; }
  // vines wrapping the body
  for (let k = 0; k < 4; k++) { const pts = []; const z0 = R(-1.1, 0.9), ph = R(0, 6.28); for (let i = 0; i <= 10; i++) { const a = ph + i / 10 * 6.28; pts.push([Math.cos(a) * 1.0, 0.25 + Math.sin(a) * 0.98, z0 + i * 0.06]); } tube(torso, pts, 0.07, vine, 40); }
  for (let i = 0; i < 9; i++) oAdd(torso, oSph(0.14, 10, 8), vine, R(-0.8, 0.8), R(0.4, 1.0), R(-1.1, 1.0), 1.2, 0.5, 1);
  // tail
  const tail = new THREE.Group(); tail.position.set(0, 0.15, -1.55); torso.add(tail); let tp = tail; const tailSeg = [];
  for (let i = 0; i < 4; i++) { const s = new THREE.Group(); s.position.z = i ? -0.42 : 0; tp.add(s); oAdd(s, oSph(0.26 - i * 0.05, 12, 10), skin, 0, 0, -0.2, 1, 0.9, 1.6); tailSeg.push(s); tp = s; }
  // neck + head
  const head = new THREE.Group(); head.position.set(0, 0.05, 1.7); torso.add(head);
  oAdd(torso, oCap(0.42, 0.5), skin, 0, 0.12, 1.35).rotation.x = Math.PI / 2 - 0.35;
  oAdd(head, oSph(0.5), skin, 0, 0.05, 0.1, 1, 0.85, 1.05); oAdd(head, oCap(0.3, 0.45), skin, 0, -0.05, 0.55, 1.2, 0.85, 1).rotation.x = Math.PI / 2; // snout
  oAdd(head, oSph(0.12, 10, 8), skin, 0, 0.22, 0.88, 1.6, 0.6, 1); // nose ridge
  const jaw = new THREE.Group(); jaw.position.set(0, -0.2, 0.15); head.add(jaw);
  oAdd(jaw, oCap(0.24, 0.5), skin, 0, -0.1, 0.38, 1.25, 0.65, 1).rotation.x = Math.PI / 2;
  oAdd(jaw, oSph(0.2, 12, 8), flesh, 0, 0.02, 0.42, 1.2, 0.35, 1.6);
  for (let i = 0; i < 6; i++) { const s = i < 3 ? -1 : 1, j = i % 3; oAdd(head, new THREE.ConeGeometry(0.035, 0.16, 5), bone, s * (0.22 - j * 0.04), -0.3, 0.55 + j * 0.15).rotation.x = Math.PI; oAdd(jaw, new THREE.ConeGeometry(0.03, 0.13, 5), bone, s * (0.2 - j * 0.04), 0.06, 0.55 + j * 0.12); }
  for (const s of [-1, 1]) {
    const tusk = oAdd(jaw, new THREE.ConeGeometry(0.07, 0.42, 7), bone, s * 0.26, 0.1, 0.7); tusk.rotation.set(-0.4, 0, s * -0.5);
    const horn = new THREE.Group(); horn.position.set(s * 0.32, 0.38, -0.05); head.add(horn); tube(horn, [[0, 0, 0], [s * 0.25, 0.25, -0.1], [s * 0.45, 0.25, -0.45], [s * 0.42, 0.05, -0.7]], 0.065, bone, 12);
    const e = new THREE.Mesh(oSph(0.065, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa030 })); e.position.set(s * 0.27, 0.14, 0.52); head.add(e);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a20, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.set(0.28, 0.28, 1); e.add(gl);
  }
  // four jointed legs: front pillars, rear digitigrade
  const legJ = [];
  for (const [x, z, front] of [[0.72, 0.85, 1], [-0.72, 0.85, 1], [0.66, -0.95, 0], [-0.66, -0.95, 0]]) {
    const L = limb(torso, x, -0.1, z, front ? 0.27 : 0.25, 0.55, front ? 0.2 : 0.17, 0.62, skin, bone);
    if (!front) { L.root.rotation.x = 0.35; L.knee.rotation.x = -0.7; L.foot.rotation.x = 0.35; }
    legs.push(L.root); legJ.push(Object.assign(L, { front, bx: L.root.rotation.x, bk: L.knee.rotation.x }));
  }
  torso.position.y = 1.62;
  return { body, legs, legJ, head, jaw, torso, tail: tailSeg, mats: [skin, vine], hit: [[0, 1.6, 0, 1.25, 1], [0, 1.55, 1.75, 0.6, 1.6]], height: 3 };
}
function buildThornling2() {
  const body = new THREE.Group(), legs = [];
  const stem = orgMat(0x3f6226, 'moss'), petal = new THREE.MeshStandardMaterial({ color: 0xd2507e, roughness: 0.6, side: THREE.DoubleSide }), inner = new THREE.MeshStandardMaterial({ color: 0xf08ab0, roughness: 0.5, side: THREE.DoubleSide }), thorn = new THREE.MeshStandardMaterial({ color: 0xb0a070, roughness: 0.5 });
  // bulb body (lathe) with bark-like stem
  const prof = [[0.05, 0.3], [0.3, 0.38], [0.44, 0.6], [0.42, 0.85], [0.28, 1.02], [0.14, 1.12], [0.1, 1.2]].map(([r, y]) => new THREE.Vector2(r, y));
  oAdd(body, new THREE.LatheGeometry(prof, 18), stem, 0, 0, 0);
  for (let k = 0; k < 5; k++) { const a = k / 5 * 6.28; tube(body, [[Math.cos(a) * 0.2, 0.34, Math.sin(a) * 0.2], [Math.cos(a) * 0.46, 0.7, Math.sin(a) * 0.46], [Math.cos(a + 0.4) * 0.15, 1.12, Math.sin(a + 0.4) * 0.15]], 0.035, stem, 10); }
  for (let i = 0; i < 16; i++) { const d = new V3(R(-1, 1), R(-0.3, 1), R(-1, 1)).normalize(); const t = oAdd(body, new THREE.ConeGeometry(0.035, 0.2, 5), thorn, d.x * 0.43, 0.72 + d.y * 0.3, d.z * 0.43); t.quaternion.setFromUnitVectors(new V3(0, 1, 0), d); }
  const head = new THREE.Group(); head.position.y = 1.2; body.add(head);
  const petals = [];
  for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 7; i++) { const a = (i + ring * 0.5) / 7 * 6.28; const pv = new THREE.Group(); pv.rotation.y = -a; head.add(pv);
    const pt = new THREE.Group(); pt.rotation.x = ring ? -0.9 : -0.55; pv.add(pt);
    const g = new THREE.SphereGeometry(0.3 - ring * 0.08, 10, 6, 0, Math.PI, 0, Math.PI); const p = oAdd(pt, g, ring ? inner : petal, 0, 0, 0.18 - ring * 0.04, 0.55, 0.12, 1); p.rotation.x = Math.PI / 2; petals.push(pt); }
  const c = new THREE.Mesh(oSph(0.13, 14, 10), new THREE.MeshStandardMaterial({ color: 0x664400, emissive: 0xffd040, emissiveIntensity: 1.6 })); head.add(c);
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; oAdd(head, new THREE.ConeGeometry(0.012, 0.12, 4), thorn, Math.cos(a) * 0.08, 0.07, Math.sin(a) * 0.08); }
  // root legs: 2-joint tendrils
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; const l = new THREE.Group(); l.position.set(Math.cos(a) * 0.22, 0.42, Math.sin(a) * 0.22); l.rotation.set(Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8); body.add(l);
    const r = new THREE.Group(); l.add(r); oAdd(r, oCap(0.05, 0.25, 8), stem, 0, -0.17, 0); const k = new THREE.Group(); k.position.y = -0.33; r.add(k); oAdd(k, new THREE.ConeGeometry(0.04, 0.32, 6), stem, 0, -0.14, 0).rotation.x = Math.PI; r.userData.k = k; legs.push(l); }
  return { body, legs, head, petals, mats: [stem, petal], hit: [[0, 0.75, 0, 0.55, 1], [0, 1.18, 0, 0.35, 1.8]], height: 1.5 };
}
function buildHollow2() {
  const body = new THREE.Group(), legs = [];
  const skin = new THREE.MeshStandardMaterial({ color: 0x1d2024, roughness: 0.5, metalness: 0.1, transparent: true, opacity: 0.92 });
  const bone = new THREE.MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.45, transparent: true, opacity: 0.92 });
  const torso = new THREE.Group(); torso.position.y = 1.32; torso.rotation.x = 0.38; body.add(torso);
  oAdd(torso, new THREE.LatheGeometry([[0.08, 0], [0.16, 0.08], [0.13, 0.35], [0.2, 0.7], [0.24, 0.95], [0.12, 1.08], [0.05, 1.14]].map(([r, y]) => new THREE.Vector2(r, y)), 16), skin, 0, 0, 0, 1, 1, 0.62);
  for (let i = 0; i < 5; i++) { const rb = oAdd(torso, new THREE.TorusGeometry(0.2 - Math.abs(i - 1.5) * 0.015, 0.016, 5, 16, Math.PI * 1.1), bone, 0, 0.5 + i * 0.1, 0, 1, 1, 0.72); rb.rotation.set(Math.PI / 2, 0, -Math.PI * 0.05 - Math.PI / 2 + Math.PI * 0.95); }
  for (let i = 0; i < 9; i++) oAdd(torso, oSph(0.035, 8, 6), bone, 0, 0.12 + i * 0.11, -0.13, 1, 1, 0.8); // spine knuckles
  const neck = new THREE.Group(); neck.position.set(0, 1.12, 0.02); torso.add(neck); oAdd(neck, oCap(0.04, 0.12, 8), skin, 0, 0.07, 0);
  const head = new THREE.Group(); head.position.set(0, 0.2, 0.08); neck.add(head);
  oAdd(head, oSph(0.18, 18, 14), skin, 0, 0.04, -0.03, 0.82, 1.35, 1.05);
  const jaw = new THREE.Group(); jaw.position.set(0, -0.1, 0.05); head.add(jaw); oAdd(jaw, oSph(0.1, 12, 8), bone, 0, -0.08, 0.04, 0.8, 1.4, 0.8);
  for (const s of [-1, 1]) {
    const sock = oAdd(head, oSph(0.05, 10, 8), new THREE.MeshBasicMaterial({ color: 0x050607 }), s * 0.07, 0.06, 0.13, 1, 1.3, 0.6);
    const e = new THREE.Mesh(oSph(0.032, 8, 6), eyeMat); e.position.set(s * 0.07, 0.06, 0.15); head.add(e);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0x7ff0ff, blending: THREE.AdditiveBlending, fog: false, depthWrite: false })); gl.scale.set(0.5, 0.5, 1); e.add(gl);
  }
  const armJ = [], legJ = [];
  for (const s of [-1, 1]) {
    const A = limb(torso, s * 0.24, 0.98, 0, 0.042, 0.72, 0.034, 0.75, skin, null);
    for (let f = 0; f < 3; f++) { const cl = oAdd(A.foot, new THREE.ConeGeometry(0.018, 0.3, 5), bone, (f - 1) * 0.03, -0.12, 0.02); cl.rotation.set(Math.PI - 0.3, 0, (f - 1) * 0.2); }
    A.root.rotation.z = s * 0.08; legs.push(A.root); armJ.push(A);
    const L = limb(body, s * 0.13, 1.34, 0, 0.065, 0.6, 0.05, 0.6, skin, bone); L.knee.rotation.x = 0.0; legs.push(L.root); legJ.push(L);
  }
  return { body, legs, head, jaw, torso, armJ, legJ, mats: [skin, bone], hit: [[0, 1.8, 0.2, 0.42, 1], [0, 0.8, 0, 0.32, 1], [0, 2.45, 0.55, 0.24, 2.5]], height: 3 };
}
Object.assign(BUILDERS, { ravager: buildRavager2, thornling: buildThornling2, hollow: buildHollow2 });
// secondary jointed animation layered over the base animate()
SPECIES.ravager.anim = (m, dt) => { const b = m.b; if (!b.legJ) return; const f = clamp((m.moveSpeed || 0) / 4, 0, 1.4), chg = m.state === 'charge' ? 1 : 0;
  b.legJ.forEach((L, i) => { const p = m.t + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0); L.root.rotation.x = L.bx + Math.sin(p) * (0.55 + chg * 0.3) * f; L.knee.rotation.x = L.bk + (L.front ? -1 : 1) * Math.max(0, Math.sin(p + 1.2)) * 0.7 * f; L.foot.rotation.x = (L.front ? 0 : 0.35) - Math.sin(p) * 0.3 * f; });
  const br = 1 + Math.sin(now * 2.2 + m.t * 0.2) * 0.025; b.torso.scale.set(br, br, 1); b.torso.position.y = 1.62 + Math.abs(Math.sin(m.t)) * 0.08 * f - chg * 0.12;
  b.head.rotation.x = Math.sin(m.t * 0.5) * 0.06 + (m.state === 'windup' ? -0.35 : 0) + chg * 0.25; b.head.rotation.y = Math.sin(now * 0.7 + m.t) * 0.15 * (1 - f);
  b.tail.forEach((s, i) => { s.rotation.y = Math.sin(now * 2 + m.t - i * 0.7) * (0.15 + f * 0.1); s.rotation.x = -0.12 + Math.sin(now * 1.3 - i) * 0.05; }); };
SPECIES.thornling.anim = (m, dt) => { const b = m.b; if (!b.petals) return; const f = clamp((m.moveSpeed || 0) / 4, 0, 1.4), atk = m.lunge > 0 ? 1 : 0;
  b.legs.forEach((l, i) => { const r = l.children[0]; r.rotation.x = Math.sin(m.t * 2 + i) * 0.5 * (0.3 + f); r.userData.k.rotation.x = Math.sin(m.t * 2 + i + 1) * 0.6 * (0.3 + f); });
  const open = 0.35 + Math.sin(now * 1.5 + m.t) * 0.12 + atk * 0.6; b.petals.forEach((p, i) => p.rotation.x = -(i >= 7 ? 0.9 : 0.55) - open * (i >= 7 ? 0.4 : 0.8));
  b.head.rotation.x = Math.sin(m.t * 1.3) * 0.15; };
SPECIES.hollow.anim = (m, dt) => { const b = m.b; if (!b.armJ) return; const f = clamp((m.moveSpeed || 0) / 4, 0, 1.4), lg = m.lunge > 0 ? 1 : 0, fr = m.frozen ? 1 : 0;
  b.legJ.forEach((L, i) => { const p = m.t + i * Math.PI; L.root.rotation.x = Math.sin(p) * 0.6 * f; L.knee.rotation.x = Math.max(0, Math.sin(p + 1.4)) * 1.0 * f + 0.12; L.foot.rotation.x = -0.1; });
  b.armJ.forEach((A, i) => { const p = m.t + i * Math.PI + Math.PI; A.root.rotation.x = (lg ? -1.5 : Math.sin(p) * 0.35 * f - 0.15) + (fr ? -0.6 : 0); A.knee.rotation.x = -(lg ? 0.2 : 0.45 + Math.sin(now * 1.7 + i) * 0.1); });
  b.jaw.rotation.x = 0.15 + (lg ? 0.6 : Math.max(0, Math.sin(now * 0.9 + m.t)) * 0.25); b.torso.rotation.x = 0.38 + (fr ? -0.15 : 0) + Math.sin(m.t * 2) * 0.03 * f; };
// Heartspawn uses the organic Ravager body, tinted by the Heart
BUILDERS.heartspawn = () => { const b = buildRavager2(); b.mats.forEach(m => { m.color.lerp(new THREE.Color(0x2a4a1a), 0.6); m.emissive = new THREE.Color(0x9dff2e); m.emissiveIntensity = 0.18; });
  const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 2), new THREE.MeshStandardMaterial({ color: 0x3a1a1a, emissive: 0x9dff2e, emissiveIntensity: 1.5 })); h.position.set(0, 1.35, -0.25); b.torso.add(h); return b; };
SPECIES.heartspawn.anim = (m, dt) => SPECIES.ravager.anim(m, dt);
// ---------------------------------------------------------------- M8: rigged CC0 mutants (GLB) + size/hitbox/speed pass
Object.assign(BUILDERS, { ravager: CR.buildRavager, skitter: CR.buildSkitter, hollow: CR.buildHollow, bloater: CR.buildBloater, raider: () => CR.buildRaider(false), captain: () => CR.buildRaider(true) });
BUILDERS.heartspawn = () => { const b = CR.buildRavager(); b.mats.forEach(m => { m.color.lerp(new THREE.Color(0x24401a), 0.6); m.emissive = new THREE.Color(0x9dff2e); m.emissiveIntensity = 0.08; });
  const h = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 3), new THREE.MeshStandardMaterial({ color: 0x3a1a1a, emissive: 0x9dff2e, emissiveIntensity: 1.4, roughness: 0.7 })); h.position.set(0, 2.55, -0.3); b.body.add(h); return b; };
const glbAnim = extra => (m, dt) => { CR.animGLB(m.b, m, dt); extra && extra(m, dt); };
SPECIES.ravager.anim = glbAnim(); SPECIES.heartspawn.anim = glbAnim(); SPECIES.hollow.anim = glbAnim(); SPECIES.skitter.anim = glbAnim();
SPECIES.bloater.anim = glbAnim((m, dt) => { const s = 1 + Math.sin(now * 3 + m.t) * 0.025 + (m.swell || 0) * 0.3; m.b.sac.scale.set(s, 1 + (s - 1) * 0.4, s); });
const raiderGLB = glbAnim((m, dt) => { if ((m.fireCD ?? 0) > (m._lfc ?? 0) + 0.3) m.b.fireT = 0.35; m._lfc = m.fireCD; m.b.fireT = Math.max(0, (m.b.fireT || 0) - dt); });
SPECIES.raider.anim = raiderGLB; SPECIES.captain.anim = raiderGLB;
// sizes relative to the 1.8 m survivor: radius (collision), speed
Object.assign(SPECIES.ravager, { radius: 1.6, speed: 3.6 }); Object.assign(SPECIES.heartspawn, { radius: 1.6 });
Object.assign(SPECIES.thornling, { radius: 0.42, speed: 6.8 }); Object.assign(SPECIES.hollow, { radius: 0.5, speed: 6.4 });
Object.assign(SPECIES.skitter, { radius: 0.6, speed: 8.2 }); Object.assign(SPECIES.bloater, { radius: 0.95, speed: 1.8 });
// Thornling: small and quick (~0.9 m), matte bark/moss skin
{ const base = BUILDERS.thornling; BUILDERS.thornling = () => { const b = base(); b.body.scale.setScalar(0.6); b.hit = [[0, 0.75, 0, 0.55 * 0.6, 1], [0, 1.18, 0, 0.35 * 0.6, 1.8]]; b.height = 0.95;
  b.mats.forEach(m => CR && AS.rugged(m, { dirt: 0.6, rough: 0.85 })); b.body.traverse(o => { if (o.isMesh && o.material && o.material.roughness < 0.6) o.material.roughness = 0.7; }); return b; }; }
// boss: bigger, lumpy flesh with a toothed maw and eye cluster instead of a smooth orb
{ const base = BUILDERS.heart || (() => buildHeart()); BUILDERS.heart = () => { const b = base(); const core = b.core;
  core.geometry = AS.displace(AS.smoothGeo((() => { const g = new THREE.IcosahedronGeometry(2.2, 6); g.deleteAttribute('uv'); g.scale(1.05, 1.25, 0.95); return g; })()), 0.9, 0.7, 7); AS.displace(core.geometry, 0.25, 2.4, 3);
  for (let i = 0; i < 9; i++) { const tg = AS.displace(AS.smoothGeo(new THREE.IcosahedronGeometry(R(0.5, 0.95), 4)), 0.18, 2, i); const t = new THREE.Mesh(tg, b.flesh); const a = R(0, 6.28), y = R(-1.2, 1.8); t.position.set(Math.cos(a) * 2.0, y, Math.sin(a) * 1.8); core.add(t); }
  const bone = new THREE.MeshStandardMaterial({ color: 0xbfb294, roughness: 0.85 }); AS.rugged(bone, { dirt: 0.7 });
  for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(2.45, 0.11, 6, 20, 2.2), bone); r.rotation.set(0, Math.PI / 2 + 0.25, 0); r.rotateZ(-1.1); r.position.y = -0.9 + i * 0.55; r.scale.setScalar(1 - Math.abs(i - 2.5) * 0.07); core.add(r); }
  b.flesh.metalness = 0; b.flesh.roughness = 0.9; AS.rugged(b.flesh, { dirt: 0.8, vein: 0x9dff2e, veinK: 0.5, veinGlow: 0.6, rough: 0.9 });
  const tooth = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.6 });
  for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28; const t = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 6), tooth); t.position.set(Math.cos(a) * 0.9, Math.sin(a) * 0.9, 2.05); t.rotation.set(Math.PI / 2 - Math.sin(a) * 0.5, 0, 0); t.rotation.z = -a; core.add(t); }
  const maw = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), new THREE.MeshBasicMaterial({ color: 0x120404 })); maw.position.z = 2.0; core.add(maw);
  for (let i = 0; i < 7; i++) { const e = new THREE.Mesh(new THREE.SphereGeometry(R(0.12, 0.22), 12, 10), new THREE.MeshBasicMaterial({ color: 0xc8ff5a })); const a = R(-1.2, 1.2), y = R(0.9, 1.7); e.position.set(Math.sin(a) * 1.9, y, Math.cos(a) * 1.4); core.add(e); }
  b.body.traverse(o => { if (o.isMesh && o.material && o.material.isMeshStandardMaterial && o.material !== b.vein) o.material.metalness = 0; }); return b; };
  const ini = SPECIES.heart.init; SPECIES.heart.init = (m, o) => { ini && ini(m, o); m.scale = 1.4; m.g.scale.setScalar(1.4); }; }
// debug: swap back to the M7 procedural builders for before/after shots
const NEW_B = { ...BUILDERS }, OLD_B = { ravager: buildRavager2, thornling: buildThornling2, hollow: buildHollow2, skitter: buildSkitter, bloater: buildBloater };
function useOldMutants(on) { Object.assign(BUILDERS, on ? OLD_B : NEW_B); }
// ---------------------------------------------------------------- stubs filled in by later systems
// initial wild population (also visible behind the title screen)
for (let i = 0; i < 7; i++) { const s = freeSpot(0, 0, 35, 95); if (s) spawnMutant(['ravager', 'thornling', 'hollow'][i % 3], s[0], s[1]); }

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock(); let fpsAcc = 0, fpsN = 0, fps = 60;
function render() { if (QUALITY_BLOOM()) composer.render(); else renderer.render(scene, camera); }
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05); fpsAcc += dt; fpsN++; if (fpsAcc > 1) { fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; if (typeof dynamicResolution === 'function') dynamicResolution(fps); }
  pollPad(dt);
  if (state === 'title') {
    now += dt; if (creatorOn) creatorCam(dt); else titleCam(dt);
    for (const m of mutants) updateMutant(m, dt);
  } else if (photo.on) { now += 0; updatePhoto(dt); }
  else if (!paused && !openP) {
    now += dt;
    camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
    updateWorldTime(dt); updatePlayer(dt); updateBuild();
    for (const m of mutants) updateMutant(m, dt);
    for (let i = mutants.length - 1; i >= 0; i--) if (mutants[i].remove) { if (mutants[i] === activeTame) activeTame = null; mutants.splice(i, 1); }
    updateDrone(dt); updateStructs(dt); for (const u of updaters) u(dt);
    for (const l of loots) if (!l.looted) l.sp.material.opacity = 0.25 + Math.sin(now * 2 + l.pos.x) * 0.2;
    if (deathBag) deathBag.g.children[1].material.opacity = 0.6 + Math.sin(now * 4) * 0.4;
  }
  if (state === 'play' && (paused || openP)) camFwd.set(0, 0, -1).applyQuaternion(camera.quaternion);
  if ((!paused && !openP && !photo.on) || state === 'title') { sparks.update(dt); debris.update(dt); updateTracers(dt); }
  updateEnvironment(photo.on ? 0 : dt);
  if (state === 'play' && !photo.on) updateHUD(dt);
  render();
  if (photo.capture) photo.capture();
}
renderKeysBar(); renderPadStatus(); setRumble(settings.rumble);
const touchUI = initTouch($('touch'), touchIn, a => { sound.init(); sound.resume(); doAction(a); }, () => build.active);
updaters.push(() => { if (lastInput === 'touch') touchUI.refresh(); });
if (isTouchDevice && !matchMedia('(pointer:fine)').matches) setInput('touch');
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
loop();
if (pendingLoad) { revealMenu(); setTimeout(() => startGame(pendingLoad), 50); }

// debug / test hooks (used by the headless screenshot scripts)
window.RB = { P, inv, gear, mutants, structs, logs, loots, settings, camera, get state() { return state; }, get fps() { return fps; }, get tod() { return tod; }, get openP() { return openP; },
  reveal: () => revealMenu(), start: d => { if (d) difficulty = d; startGame(null); }, setTime: t => { tod = t; }, raid: () => core && startRaid(), spawn: (sp, x, z, o) => spawnMutant(sp, x, z, o), openCraft: () => openPanel('craft'), close: () => closePanels(true),
  open: id => openPanel(id), look: (yaw, pitch) => { P.yaw = yaw; P.pitch = pitch; }, tame: m => tameMutant(m), cloth: (o) => giveClothing(Object.assign(rollClothing(), o || {})), build: (t, x, z, r) => createStruct(t, x, z, r || 0), read: i => readLog(logs[i]), fire: () => fire(),
  setInput: m => setInput(m), setting: (k, v) => { settings[k] = v; afterSetting(k); }, doAction: a => doAction(a),
  sim: s => { for (let i = 0; i < s * 30; i++) { now += 1 / 30; updateWorldTime(1 / 30); for (const m of mutants) updateMutant(m, 1 / 30); updateDrone(1 / 30); updateStructs(1 / 30); for (const u of updaters) u(1 / 30); } },
  weather: (t, snap) => { setWeather(t, 9999); if (snap) { const w = WEATHERS[t]; Object.assign(weather, { cloud: w.cloud, rain: w.rain, snow: w.snow || 0, fogM: w.fog, wind: w.wind, wet: w.rain ? 1 : 0 }); if (w.snow) weather.snowCover = 1; } }, get weatherState() { return weather; },
  quality: q => { settings.quality = q; applyQuality(); }, get renderInfo() { return { pr: renderer.getPixelRatio(), calls: renderer.info.render.calls, tris: renderer.info.render.triangles, shadow: sun.shadow.mapSize.x, samples: composer.renderTarget1.samples, bloom: bloom.enabled }; },
  save: k => writeSlot(k || '1'), latest: () => latestSave(), saves: m => openSaves(m || 'load', 'pause'), photo: () => enterPhoto(), unphoto: () => exitPhoto(), shot: () => photoShot(), filter: n => { photoFilter(n); }, photoMove: (x, y, z, yaw, pitch) => { photo.cam.set(x, y, z); photo.yaw = yaw; photo.pitch = pitch; }, gallery: () => openGallery('photo'), galCount: () => galAll().then(l => l.length), get photoOn() { return photo.on; },
  m6: { get flags() { return flags; }, get wake() { return wakePending; }, get paused() { return paused; }, outposts, bunkers, trader, ARENA, grid, wakeHeart, giveCard, endGame, mount: () => mountToggle(), evolve: m => evolveMutant(m), get heart() { return heart; }, travel: i => fastTravel(outposts[i]), online: i => setOutpost(outposts[i], true), openBunker: t => openBunker(bunkers.find(b => b.tier === t)), traderMenu, day: d => { dayNo = d; }, get active() { return activeTame; }, damage: (m, d) => damageMutant(m, d, 'player'), interact: () => interact(), prompt: () => promptText(nearestInteract()) },
  m8: { useOldMutants },
  m7: { get look() { return look; }, setLook: l => { Object.assign(look, l); applyLook2(look); refreshGear(); }, creator: () => openCreator(), showcase, studio: (x, z, k = 14) => { ccKey.position.set(x + 1.6, 2.4, z + 2.4); ccKey.intensity = k; ccRim.position.set(x - 1.2, 2, z - 1.6); ccRim.intensity = k * 0.4; }, photoFov: f => { photo.fov = f; }, photoUI: () => togglePhotoUI(), get on() { return creatorOn; }, giveGear: (slot, name, rarity) => { gear[slot] = { slot, name, rarity, armor: 2, warmth: 2, effect: null }; refreshGear(); } },
  frame: () => { updatePlayer(1 / 60); updateEnvironment(1 / 60); } };
