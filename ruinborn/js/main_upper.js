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

