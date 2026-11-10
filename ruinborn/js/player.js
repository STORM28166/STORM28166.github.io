// RUINBORN survivor v4: rigged, skinned CC0 Quaternius characters (modular head/body/legs/feet on one skeleton),
// AnimationMixer with cross-faded clips, gear/rarity-driven outfit layering, rugged grime/scar material layer.
import * as THREE from 'three';
import { makeHuman, setPart, play, rugged } from './assets.js';
export const SKIN_TONES = ['#f0cfb0', '#d9a882', '#b47a52', '#8c5a3a', '#5e3b26', '#3e2618'];
export const HAIR_COLORS = ['#17110c', '#3a2414', '#6a4020', '#a07040', '#c8b090', '#8a8a86', '#7a2a1a', '#4a6a2a'];
export const HAIRS = { male: [['crop', 'base', 'SHORT CROP'], ['swept', 'adventurer', 'SWEPT BACK'], ['messy', 'casual_hoodie', 'MESSY'], ['mohawk', 'punk', 'MOHAWK']],
  female: [['bob', 'base', 'BOB'], ['tied', 'soldier', 'TIED BACK'], ['short', 'adventurer', 'CROPPED'], ['mohawk', 'punk', 'MOHAWK']] };
export const HAIR_STYLES = [...new Set([...HAIRS.male, ...HAIRS.female].map(h => h[0]))];
export const DEFAULT_LOOK = { body: 'male', skin: 2, hair: 'messy', hairColor: 1, scars: 1 };
export function hairFor(look) { const L = HAIRS[look.body] || HAIRS.male; return L.find(h => h[0] === look.hair) || L[0]; }
const GN = b => (b === 'female' ? 'f' : 'm');
// torso / legs gear -> outfit source per gender
const TORSO = { m: { none: 'base', 'Torn Shirt': 'base', 'Patched Jacket': 'casual_hoodie', 'Plated Vest': 'swat', 'Chitin Harness': 'punk', 'Scavver Duster': 'adventurer' },
  f: { none: 'base', 'Torn Shirt': 'base', 'Patched Jacket': 'adventurer', 'Plated Vest': 'soldier', 'Chitin Harness': 'punk', 'Scavver Duster': 'adventurer' } };
const LEGS = { m: { none: 'punk', 'Ripped Jeans': 'base', 'Cargo Pants': 'worker', 'Plated Greaves': 'swat', 'Strapped Joggers': 'adventurer' },
  f: { none: 'punk', 'Ripped Jeans': 'base', 'Cargo Pants': 'worker', 'Plated Greaves': 'soldier', 'Strapped Joggers': 'adventurer' } };
const FEET = { m: { none: 'base', base: 'punk', worker: 'worker', swat: 'swat', adventurer: 'adventurer', punk: 'worker' }, f: { none: 'base', base: 'punk', worker: 'worker', soldier: 'soldier', adventurer: 'adventurer', punk: 'worker' } };
const ACCENT = /Gold|Yellow|Red|Pink|Purple|LightGreen|Visor|Orange/;
const std = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.85 }, o));
const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent && parent.add(m); return m; };
export function buildPlayer(RARITY, tex, look) {
  const P = { root: new THREE.Group(), RARITY, tex, gearMeshes: [], t: 0, look: Object.assign({}, DEFAULT_LOOK, look || {}), phase: 0 };
  P.metal = std(0x3a3e40, { metalness: 0.7, roughness: 0.45 });
  // scrap rifle (held at the right hand, aimed along the view)
  const rifle = new THREE.Group(); P.rifle = rifle; P.root.add(rifle);
  const gun = std(0x26292a, { metalness: 0.7, roughness: 0.5 }), rust = std(0xffffff, { map: tex.rust, metalness: 0.4, roughness: 0.75 }), wrap = std(0x5a4a30, { map: tex.cloth });
  mesh(new THREE.BoxGeometry(0.05, 0.08, 0.5), gun, rifle, 0, 0, -0.12); mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 10), gun, rifle, 0, 0.012, -0.52).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.045, 0.12, 0.05), rust, rifle, 0, -0.085, -0.05).rotation.x = 0.25; mesh(new THREE.BoxGeometry(0.045, 0.09, 0.2), rust, rifle, 0, -0.02, 0.2);
  mesh(new THREE.BoxGeometry(0.035, 0.045, 0.11), gun, rifle, 0, 0.06, -0.1); mesh(new THREE.BoxGeometry(0.058, 0.055, 0.15), wrap, rifle, 0, -0.005, -0.3);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.006), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); dot.position.set(0, 0.086, -0.13); rifle.add(dot);
  P.muzzle = new THREE.Object3D(); P.muzzle.position.set(0, 0.012, -0.7); rifle.add(P.muzzle);
  rifle.traverse(o => { if (o.isMesh) o.castShadow = true; });
  construct(P); return P;
}
function construct(P) {
  if (P.H) P.root.remove(P.H.root);
  const g = GN(P.look.body), H = makeHuman(g); P.H = H; H.root.rotation.y = Math.PI; P.root.add(H.root); // GLB faces +Z, game forward is -Z
  P.headGroup = new THREE.Group(); H.bones.Head.add(P.headGroup);
  H.root.updateMatrixWorld(true); const qb = new THREE.Quaternion(), sb = new THREE.Vector3(), qr = new THREE.Quaternion(), sr = new THREE.Vector3();
  H.bones.Head.matrixWorld.decompose(new THREE.Vector3(), qb, sb); H.root.matrixWorld.decompose(new THREE.Vector3(), qr, sr);
  P.headGroup.quaternion.copy(qb.invert().multiply(qr)); P.headGroup.scale.setScalar(sr.x / sb.x);
  H.cur = null; play(H, 'Idle_Gun', 0);
}
export function applyLook(P, look) { Object.assign(P.look, look || {}); const vis = P.root.visible; construct(P); P.root.visible = vis; setGear(P, P.lastGear || { head: null, torso: null, legs: null }, P.lastFull || 0); }
function tintCloth(m, rarity, RR, worn) {
  const base = m.color.clone(); const gray = base.r * 0.3 + base.g * 0.59 + base.b * 0.11;
  if (gray > 0.55 || /white|yellow|pink|vest/i.test(m.name)) { m.color.lerp(new THREE.Color(/vest/i.test(m.name) ? 0x3f3a2a : 0x5e5444), 0.8); }
  m.color.lerp(new THREE.Color(gray, gray * 0.95, gray * 0.85), worn ? 0.55 : 0.3).multiplyScalar(worn ? 0.62 : 0.82);
  if (rarity) m.color.lerp(new THREE.Color(RR[rarity].c), 0.08 + rarity * 0.04);
  if (rarity >= 3 && ACCENT.test(m.name)) { m.emissive = new THREE.Color(RR[rarity].c); m.emissiveIntensity = rarity >= 4 ? 1.6 : 1.0; }
  rugged(m, { dirt: worn ? 1 : 0.65 - rarity * 0.08, rough: 0.85 });
}
export function setGear(P, gear, fullSet) {
  P.lastGear = gear; P.lastFull = fullSet; const RR = P.RARITY, H = P.H, g = H.g, L = P.look;
  const t = gear.torso, l = gear.legs, h = gear.head;
  const tSrc = TORSO[g][t ? t.name : 'none'] || 'base', lSrc = LEGS[g][l ? l.name : 'none'] || 'base', fSrc = FEET[g][l ? lSrc : 'none'] || 'base';
  const helmet = h && h.name === 'Riot Helmet' && g === 'm';
  const hSrc = helmet ? 'swat' : hairFor(L)[1];
  const skin = new THREE.Color(SKIN_TONES[L.skin % SKIN_TONES.length]), hair = new THREE.Color(HAIR_COLORS[L.hairColor % HAIR_COLORS.length]);
  const fix = (mats, rarity, worn) => mats.forEach(m => {
    if (/^Skin/.test(m.name)) { m.color.copy(skin); if (/Darker/.test(m.name)) m.color.multiplyScalar(0.8); rugged(m, { dirt: 0.75, scars: !!L.scars, rough: 0.7 }); }
    else if (/Hair|Eyebrows|Moustache/.test(m.name)) { m.color.copy(hair); rugged(m, { dirt: 0.3, rough: 0.8 }); }
    else if (/^Eye$|Black/.test(m.name)) { rugged(m, { dirt: 0.2, rough: 0.6 }); }
    else tintCloth(m, rarity, RR, worn);
  });
  fix(setPart(H, 'head', hSrc), h ? h.rarity : 0, false);
  fix(setPart(H, 'body', tSrc), t ? t.rarity : 0, !t || t.name === 'Torn Shirt');
  fix(setPart(H, 'legs', lSrc), l ? l.rarity : 0, !l);
  fix(setPart(H, 'feet', fSrc), l ? l.rarity : 0, !l);
  fix(setPart(H, 'extra', t && t.name === 'Scavver Duster' ? 'adventurer' : null), t ? t.rarity : 0, false);
  // procedural head gear on the Head bone (helmet uses the real SWAT head on male)
  P.gearMeshes.forEach(m => m.parent && m.parent.remove(m)); P.gearMeshes = []; const A = m => (P.gearMeshes.push(m), m); const hg = P.headGroup;
  const HY = 0.14, HZ = 0.01; // head centre above the Head bone (metres)
  if (h && !helmet) {
    const col = new THREE.Color(h.name.includes('Helmet') || h.name.includes('Visor') ? 0x3e4446 : 0x5a5040).lerp(new THREE.Color(RR[h.rarity].c), 0.1 + h.rarity * 0.04);
    const mat = rugged(std(col.getHex(), { map: P.tex.cloth }), { dirt: 0.8 });
    if (h.name.includes('Hood')) { A(mesh(new THREE.SphereGeometry(0.15, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), mat, hg, 0, HY, HZ - 0.01)).scale.set(1, 1.08, 1.12); const c = A(mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.12, 16, 1, true), mat, hg, 0, HY - 0.1, HZ + 0.02)); c.material = mat; }
    if (h.name.includes('Beanie')) { A(mesh(new THREE.SphereGeometry(0.135, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), mat, hg, 0, HY + 0.02, HZ)).scale.set(1, 0.95, 1.05); A(mesh(new THREE.TorusGeometry(0.128, 0.018, 6, 22), mat, hg, 0, HY + 0.03, HZ)).rotation.x = Math.PI / 2; }
    if (h.name.includes('Helmet')) { A(mesh(new THREE.SphereGeometry(0.145, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), std(col.getHex(), { metalness: 0.55, roughness: 0.4 }), hg, 0, HY + 0.01, HZ)).scale.set(1, 1, 1.08); A(mesh(new THREE.BoxGeometry(0.2, 0.06, 0.03), std(0x0d1418, { metalness: 0.9, roughness: 0.15 }), hg, 0, HY - 0.02, HZ + 0.14)); }
    if (h.name.includes('Visor')) { A(mesh(new THREE.TorusGeometry(0.128, 0.022, 6, 26), P.metal, hg, 0, HY + 0.0, HZ)).rotation.x = Math.PI / 2; A(mesh(new THREE.BoxGeometry(0.17, 0.03, 0.03), h.rarity >= 3 ? std(0x111111, { emissive: RR[h.rarity].c, emissiveIntensity: 1.8 }) : std(0xff3a2a, { emissive: 0xff2a1a, emissiveIntensity: 1 }), hg, 0, HY + 0.0, HZ + 0.125)); }
    if (h.name.includes('Gasmask')) { A(mesh(new THREE.SphereGeometry(0.07, 14, 10), rugged(std(0x262626), { dirt: 0.6 }), hg, 0, HY - 0.06, HZ + 0.09)).scale.set(1.2, 1, 0.8); for (const s of [-1, 1]) { const c = A(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.06, 12), P.metal, hg, s * 0.065, HY - 0.09, HZ + 0.11)); c.rotation.set(Math.PI / 2, 0, s * 0.5); A(mesh(new THREE.SphereGeometry(0.03, 10, 8), std(0x1a2a2a, { metalness: 0.8, roughness: 0.1 }), hg, s * 0.045, HY + 0.0, HZ + 0.115)).scale.z = 0.5; } }
    if (h.rarity >= 4) A(mesh(new THREE.SphereGeometry(0.015, 8, 6), std(0x111111, { emissive: RR[h.rarity].c, emissiveIntensity: 2 }), hg, 0, HY + 0.15, HZ + 0.05));
  }
  if (fullSet) { const tm = std(0x111111, { emissive: RR[fullSet].c, emissiveIntensity: 2 }); A(mesh(new THREE.TorusGeometry(0.11, 0.01, 6, 24), tm, hg, 0, HY - 0.2, HZ)).rotation.x = Math.PI / 2; }
  P.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
}
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
// clip choice + blended transitions, then procedural layers: aim pitch on the spine, recoil, rifle placement
export function animatePlayer(P, dt, o) {
  P.t += dt; const H = P.H, sp = o.speed || 0;
  let clip = 'Idle_Gun', speed = 1;
  if (o.dead) clip = 'Death';
  else if (o.relaxed) clip = 'Idle';
  else if (o.mounted) clip = 'Idle_Gun_Pointing';
  else if (!o.grounded) { clip = 'Run'; speed = 0.25; }
  else if (o.reloading) clip = sp > 0.5 ? 'Run_Shoot' : 'Interact';
  else if (o.sprint && sp > 0.5) { clip = 'Run'; speed = Math.max(0.8, sp / 7); }
  else if (sp > 0.5) { clip = o.ads || sp > 3.2 ? 'Run_Shoot' : 'Walk'; speed = clip === 'Walk' ? Math.max(0.6, sp / 2.2) : Math.max(0.55, sp / 5.5); }
  else if (o.ads || (o.recoil || 0) > 0.05) clip = 'Idle_Gun_Pointing';
  const a = play(H, clip, clip === 'Death' ? 0.15 : 0.22, { once: clip === 'Death' }); if (a && clip !== 'Death') a.timeScale = speed;
  H.mixer.update(dt);
  const B = H.bones; // spine aim: split pitch over torso + chest; local X is the lateral axis on this rig
  if (!o.dead && !o.relaxed) { const pt = (o.sprint ? 0.1 : -o.pitch) * 0.5; B.Torso.rotation.x += pt * 0.5; B.Chest.rotation.x += pt * 0.5 - (o.recoil || 0) * 0.05; B.Head.rotation.x += -o.pitch * 0.15; }
  if (o.mounted) { for (const s of ['L', 'R']) { B['UpperLeg' + s].rotation.x -= 1.2; B['LowerLeg' + s].rotation.x += 1.3; B['UpperLeg' + s].rotation.z += (s === 'L' ? -1 : 1) * 0.45; } }
  // rifle in the right hand, pointing where the player aims
  const rf = P.rifle; rf.visible = !o.relaxed && !o.dead;
  if (rf.visible) { P.root.updateMatrixWorld(true); B.WristR.getWorldPosition(_v); P.root.worldToLocal(_v);
    const hold = clip === 'Run' ? 0 : 1; rf.position.copy(_v).add(_v.set(0, 0.03, hold ? -0.05 : 0));
    if (hold) rf.rotation.set(o.pitch + (o.recoil || 0) * 0.06, 0.04, 0); else rf.rotation.set(0.6, 0.6, 0.4); }
}
