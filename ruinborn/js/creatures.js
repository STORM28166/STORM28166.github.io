// RUINBORN mutants v2: rigged CC0 Quaternius animals/humans with mutation layers (bone spikes, vines, moss, chitin, pustules, glowing eyes),
// displaced bumpy skin, matte rugged materials, AnimationMixer clips. Every builder returns the game's body contract.
import * as THREE from 'three';
import { makeCreature, makeHuman, setPart, play, rugged, displace, matsOf, smoothGeo } from './assets.js';
const V3 = THREE.Vector3;
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const R = (a, b) => a + Math.random() * (b - a);
const M = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.9, metalness: 0 }, o));
const add = (p, geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; p.add(m); return m; };
// group parented to a bone but expressed in the creature root's axes/units
export function anchor(bone, root) { const g = new THREE.Group(); bone.add(g); root.updateMatrixWorld(true); const qb = new THREE.Quaternion(), sb = new V3(), qr = new THREE.Quaternion(), sr = new V3();
  bone.matrixWorld.decompose(new V3(), qb, sb); root.matrixWorld.decompose(new V3(), qr, sr); g.quaternion.copy(qb.invert().multiply(qr)); g.scale.setScalar(sr.x / sb.x); return g; }
function eyes(a, x, y, z, r, col, glowS) { for (const s of [-1, 1]) { const e = add(a, new THREE.SphereGeometry(r, 12, 10), new THREE.MeshBasicMaterial({ color: col }), s * x, y, z); const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: col, blending: THREE.AdditiveBlending, depthWrite: false })); gl.scale.set(glowS, glowS, 1); e.add(gl); } }
function lumpy(r, detail, amp, freq, seed) { const g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('uv'); const m = smoothGeo(g); return displace(m, amp, freq, seed); }
const spike = (h, r) => new THREE.ConeGeometry(r, h, 7);
function tube(p, pts, r, mat) { return add(p, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(q => new V3(...q))), 40, r, 7, false), mat); }
function wrap(c, sx, sy, sz) { // body group = creature root scaled to target size
  const body = new THREE.Group(); body.add(c.root); c.root.scale.set(sx, sy, sz); return body; }
// ------------------------------------------------------------------ Ravager: hulking mutated bull (~2.8 m)
export function buildRavager() {
  const c = makeCreature('bull'); const mats = [];
  for (const m of c.meshes) { displace(m.geometry = m.geometry.clone(), 0.07, 2.2, 1); for (const mt of [].concat(m.material)) {
    if (/Main/.test(mt.name)) { mt.color.set(/Light/.test(mt.name) ? 0x4a3c30 : 0x3a2e24); rugged(mt, { dirt: 0.9, vein: 0x6a1a14, veinK: 0.3, rough: 0.92 }); mats.unshift(mt); }
    else if (/Horn/.test(mt.name)) { mt.color.set(0xcfc2a2); rugged(mt, { dirt: 0.6, rough: 0.7 }); }
    else if (/Eye/.test(mt.name)) { mt.color.set(0x1a0a04); }
    else if (/Muzzle/.test(mt.name)) { mt.color.set(0x4a2420); rugged(mt, { dirt: 0.8, vein: 0x8a2a1a, veinK: 0.4 }); }
    else { mt.color.multiplyScalar(0.55); rugged(mt, { dirt: 0.8 }); } } }
  const bone = M(0xd8ccb0, { roughness: 0.65 }), vine = rugged(M(0x1f3a16), { dirt: 0.7 }), moss = rugged(M(0x2c4a1c), { dirt: 0.7 }), flesh = rugged(M(0x6a2a24, { emissive: 0x220604 }), { vein: 0xff5a2a, veinK: 0.5, veinGlow: 0.4 });
  const B = c.bones, rt = c.root;
  [['Neck2', 3], ['Neck1', 4], ['Torso3', 6], ['Torso2', 6], ['Torso', 5], ['Back', 4]].forEach(([bn, n]) => { const a = anchor(B[bn], rt); for (let i = 0; i < n; i++) { const h = R(0.7, 1.4); const sx = R(-0.55, 0.55); const s = add(a, spike(h * (1 - Math.abs(sx)), R(0.1, 0.18)), bone, sx, 0.8 + h * 0.3 - Math.abs(sx) * 0.4, R(-0.5, 0.5)); s.rotation.set(R(-0.7, -0.3), 0, -sx * 0.9); }
    const pl = add(a, lumpy(0.5, 2, 0.1, 3, 5), bone, 0, 0.62, 0); pl.scale.set(1.2, 0.3, 1.1);
    for (let i = 0; i < 3; i++) { const p = add(a, lumpy(R(0.25, 0.45), 2, 0.12, 4, i), moss, R(-0.7, 0.7), R(0.5, 0.85), R(-0.6, 0.6)); p.scale.y = 0.45; } });
  { const a = anchor(B.Torso2, rt); for (let k = 0; k < 3; k++) { const z0 = R(-0.8, 0.8), ph = R(0, 6.28), pts = []; for (let i = 0; i <= 12; i++) { const t = ph + i / 12 * 6.28; pts.push([Math.cos(t) * 1.25, 0.05 + Math.sin(t) * 1.15, z0 + i * 0.05]); } tube(a, pts, 0.035 + k * 0.01, vine); }
    for (let i = 0; i < 6; i++) add(a, lumpy(R(0.1, 0.18), 1, 0.05, 6, i), flesh, R(-1.1, 1.1), R(-0.6, 0.4), R(-0.9, 0.9)); }
  { const a = anchor(B.Head, rt); eyes(a, 0.42, 0.25, 0.55, 0.075, 0xff8a20, 0.5);
    for (const s of [-1, 1]) { const t = add(a, spike(0.6, 0.09), bone, s * 0.32, -0.45, 0.95); t.rotation.set(-1.9, 0, s * 0.35); } }
  const body = wrap(c, 0.7, 0.62, 0.62);
  return { body, glb: c, mixer: c.mixer, legs: [], legJ: [], head: new THREE.Group(), jaw: new THREE.Group(), tail: [], torso: new THREE.Group(), mats, hit: [[0, 1.55, 0, 1.35, 1], [0, 1.85, 2.4, 0.65, 1.6]], height: 2.9,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Gallop', attack: 'Attack_Headbutt', death: 'Death', hit: 'Idle_HitReact1' }, walkRef: 1.6, runRef: 6 };
}
// ------------------------------------------------------------------ Skitter: low, wide, chitin-plated pack hunter (~0.8 m)
export function buildSkitter() {
  const c = makeCreature('wolf'); const mats = [];
  for (const m of c.meshes) { displace(m.geometry = m.geometry.clone(), 0.05, 3, 2); for (const mt of [].concat(m.material)) { if (/Main/.test(mt.name)) { mt.color.set(/Light/.test(mt.name) ? 0x4a5a32 : 0x26301c); rugged(mt, { dirt: 0.7, vein: 0x7a9a3a, veinK: 0.08, veinGlow: 0.02, rough: 0.8 }); mats.unshift(mt); } else { mt.color.multiplyScalar(0.4); rugged(mt, { dirt: 0.6 }); } } }
  const shell = rugged(M(0x1e2618, { roughness: 0.55 }), { dirt: 0.5, rough: 0.55 }), glow = M(0x223300, { emissive: 0xb8ff3a, emissiveIntensity: 1.5 });
  const B = c.bones, rt = c.root;
  [['Torso3', 0.9], ['Torso2', 1.0], ['Torso', 0.95], ['Back', 0.8]].forEach(([bn, w]) => { const a = anchor(B[bn], rt); const pl = add(a, new THREE.SphereGeometry(0.62 * w, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), shell, 0, 0.18, 0); pl.scale.set(1.2, 0.7, 0.9);
    for (let i = 0; i < 2; i++) add(a, new THREE.SphereGeometry(0.07, 8, 6), glow, R(-0.3, 0.3), 0.52, R(-0.3, 0.3)); });
  { const a = anchor(B.Head, rt); eyes(a, 0.18, 0.15, 0.45, 0.05, 0xc8ff4a, 0.35); for (const s of [-1, 1]) { const f = add(a, spike(0.5, 0.05), shell, s * 0.16, -0.2, 0.8); f.rotation.set(1.6, 0, -s * 0.35); } }
  const body = wrap(c, 0.6, 0.32, 0.38);
  return { body, glb: c, mixer: c.mixer, legs: [], head: new THREE.Group(), mats: [mats[0] || shell, shell], hit: [[0, 0.5, 0, 0.5, 1], [0, 0.55, 0.85, 0.24, 1.8]], height: 0.95,
    clips: { idle: 'Idle', walk: 'Walk', run: 'Gallop', attack: 'Attack', death: 'Death', hit: 'Idle_HitReact1' }, walkRef: 1.4, runRef: 5.5 };
}
// ------------------------------------------------------------------ humanoid mutants share the survivor rig
function humanoid(g, parts, skinCol, opts = {}) {
  const H = makeHuman(g); const all = [];
  for (const [k, src] of Object.entries(parts)) setPart(H, k, src).forEach(m => all.push(m));
  return { H, all };
}
// Hollow: tall gaunt fog-stalker (~2.25 m), charcoal skin, pale veins, long claws, cold glowing eyes
export function buildHollow() {
  const { H, all } = humanoid('m', { head: 'base', body: 'base', legs: 'punk', feet: 'base' });
  const skin = []; all.forEach(m => { const isSkin = /^Skin/.test(m.name); m.color.set(isSkin ? 0x23272b : 0x141618); m.transparent = true; m.opacity = 0.93;
    rugged(m, { dirt: 0.5, vein: 0x6a8a94, veinK: isSkin ? 0.3 : 0.05, veinGlow: isSkin ? 0.05 : 0, rough: 0.8 }); skin.push(m); });
  const bone = M(0x3a3c40, { roughness: 0.6 });
  { const a = anchor(H.bones.Head, H.root); eyes(a, 0.045, 0.16, 0.1, 0.02, 0xc8fbff, 0.14); add(a, new THREE.SphereGeometry(0.045, 10, 8), M(0x050607), 0, 0.03, 0.11).scale.set(1.4, 0.5, 0.5); }
  for (const s of ['L', 'R']) { const a = anchor(H.bones['Wrist' + s], H.root); for (let f = 0; f < 3; f++) { const cl = add(a, spike(0.26, 0.014), bone, (f - 1) * 0.022, -0.2, 0.02); cl.rotation.x = Math.PI; } }
  { const a = anchor(H.bones.Chest, H.root); for (let i = 0; i < 4; i++) { const rb = add(a, new THREE.TorusGeometry(0.15 - i * 0.008, 0.008, 4, 18, Math.PI * 0.8), bone, 0, -0.02 - i * 0.07, 0.035); rb.rotation.set(0, 0, Math.PI * 1.1); rb.scale.z = 0.4; } }
  const body = new THREE.Group(); body.add(H.root); H.root.scale.set(0.82, 1.25, 0.82);
  return { body, glb: H, mixer: H.mixer, legs: [], armJ: [], head: new THREE.Group(), jaw: new THREE.Group(), torso: new THREE.Group(), mats: skin, hit: [[0, 1.65, 0, 0.36, 1], [0, 0.8, 0, 0.3, 1], [0, 2.1, 0.05, 0.2, 2.5]], height: 2.3,
    clips: { idle: 'Idle_Neutral', walk: 'Walk', run: 'Run', attack: 'Punch_Right', death: 'Death', hit: 'HitRecieve' }, walkRef: 1.5, runRef: 5 };
}
// Bloater: swollen, waddling rot-sac with legs, arms and a face (~2 m, very wide)
export function buildBloater() {
  const { H, all } = humanoid('m', { head: 'worker', body: 'punk', legs: 'punk', feet: 'worker' });
  const skinM = []; all.forEach(m => { const isSkin = /^Skin/.test(m.name); if (/Worker_Yellow/.test(m.name)) m.visible = false;
    m.color.set(isSkin ? 0x7a7a46 : 0x3a3424); rugged(m, { dirt: 1, vein: 0x4a6a1a, veinK: isSkin ? 0.5 : 0.1, rough: 0.9 }); skinM.push(m); });
  // hide the hard hat material by darkening it into a rotten cap
    // swell the actual skinned body: belly, back and upper arms bulge outward with warty bumps (no balloon attachments)
  for (const kind of ['body', 'legs']) for (const sm of H.parts[kind]) { const g = sm.geometry = sm.geometry.clone(); const p = g.attributes.position, n = g.attributes.normal; const u = H.unit;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i) * u, y = p.getY(i) * u, z = p.getZ(i) * u;
      const belly = Math.exp(-((y - 1.0) ** 2 / 0.06 + x * x / 0.09)) * (z > -0.02 ? 1 : 0.55), hump = Math.exp(-((y - 1.32) ** 2 / 0.02 + (x - 0.05) ** 2 / 0.03)) * (z < 0 ? 1 : 0);
      const w = (belly * 0.2 + hump * 0.09) / u; p.setXYZ(i, p.getX(i) + n.getX(i) * w, p.getY(i) + n.getY(i) * w, p.getZ(i) + n.getZ(i) * w); }
    p.needsUpdate = true; g.computeVertexNormals(); displace(g, 0.025 / u, 9 * u, 4); }
  const sacMat = skinM.find(m => /^Skin/.test(m.name)) || skinM[0], pus = M(0x334400, { emissive: 0xa8d82a, emissiveIntensity: 0.7, roughness: 0.6 });
  { const a = anchor(H.bones.Abdomen, H.root); for (let i = 0; i < 14; i++) { const t = R(-1.2, 1.2), y = R(-0.1, 0.25); add(a, new THREE.SphereGeometry(R(0.012, 0.03), 8, 6), pus, Math.sin(t) * 0.26, y, Math.cos(t) * 0.24 + 0.02); } }
  { const b = anchor(H.bones.Head, H.root); eyes(b, 0.045, 0.14, 0.11, 0.016, 0xd8ff5a, 0.12); }
  const body = new THREE.Group(), inner = new THREE.Group(); body.add(inner); inner.add(H.root); inner.scale.set(1.25, 1.05, 1.2);
  return { body, glb: H, mixer: H.mixer, legs: [], head: new THREE.Group(), sac: H.root, mats: [sacMat, ...skinM, pus], hit: [[0, 1.15, 0.25, 0.75, 1], [0, 1.85, 0.05, 0.22, 2]], height: 2.1,
    clips: { idle: 'Idle_Neutral', walk: 'Walk', run: 'Walk', attack: 'Punch_Right', death: 'Death', hit: 'HitRecieve' }, walkRef: 1.2, runRef: 2.5 };
}
// Raider / Captain: survivors gone bad (real outfits + red rag masks)
export function buildRaider(captain) {
  const g = Math.random() < 0.4 ? 'f' : 'm';
  const parts = captain ? (g === 'm' ? { head: 'swat', body: 'swat', legs: 'swat', feet: 'swat' } : { head: 'soldier', body: 'soldier', legs: 'soldier', feet: 'soldier' })
    : { head: g === 'm' ? ['base', 'punk', 'casual_hoodie'][(Math.random() * 3) | 0] : ['base', 'punk', 'adventurer'][(Math.random() * 3) | 0], body: g === 'm' ? 'punk' : 'worker', legs: 'worker', feet: 'worker' };
  const { H, all } = humanoid(g, parts);
  all.forEach(m => { if (!/^Skin|Hair|Eye/.test(m.name)) { m.color.multiplyScalar(0.7); if (captain && /Swat$/.test(m.name)) m.color.lerp(new THREE.Color(0x6a1a14), 0.5); } rugged(m, { dirt: 0.85, scars: /^Skin/.test(m.name) }); });
  const mask = rugged(M(captain ? 0x7a1a12 : 0xa82a1a), { dirt: 0.7 });
  if (!(captain && g === 'm')) { const a = anchor(H.bones.Head, H.root); const bd = add(a, new THREE.CylinderGeometry(0.11, 0.1, 0.09, 16, 1, true), mask, 0, 0.09, 0.02); bd.material.side = THREE.DoubleSide; }
  const gun = new THREE.Group(); const gm = M(0x26292a, { metalness: 0.6, roughness: 0.5 }); add(gun, new THREE.BoxGeometry(0.06, 0.09, 0.6), gm, 0, 0, 0.1); add(gun, new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8), gm, 0, 0.01, 0.5).rotation.x = Math.PI / 2;
  const body = new THREE.Group(); body.add(H.root); body.add(gun);
  return { body, glb: H, mixer: H.mixer, gun, legs: [{ rotation: {} }, { rotation: {} }], arm: { rotation: {} }, head: new THREE.Group(), mats: all.slice(0, 2), hit: [[0, 1.25, 0, 0.36, 1], [0, 1.65, 0, 0.17, 2.2], [0, 0.55, 0, 0.3, 0.8]], height: 2.0,
    clips: { idle: 'Idle_Gun', walk: 'Run_Shoot', run: 'Run_Shoot', attack: 'Gun_Shoot', death: 'Death', hit: 'HitRecieve' }, walkRef: 2.5, runRef: 4.5 };
}
// shared clip driver: state -> clip with cross-fades; speed-matched playback
export function animGLB(b, m, dt) {
  if (!b.mixer) return; const C = b.clips, sp = m.moveSpeed || 0; let clip = C.idle, ts = 1;
  if (m.frozen) ts = 0;
  if (m.lunge > 0 || m.state === 'windup' || (b.fireT || 0) > 0) clip = C.attack;
  else if (m.state === 'charge') { clip = C.run; ts = 1.5; }
  else if (sp > b.runRef * 0.55) { clip = C.run; ts = Math.max(0.7, sp / b.runRef); }
  else if (sp > 0.25) { clip = C.walk; ts = Math.max(0.5, sp / b.walkRef); }
  const a = play(b.glb, clip, 0.25); const cur = b.glb.actions[b.glb.cur]; if (cur) cur.timeScale = m.frozen ? 0 : ts;
  b.mixer.update(dt);
  if (b.gun) { const w = b.glb.bones.WristR; b.body.updateMatrixWorld(true); const p = w.getWorldPosition(new V3()); b.body.worldToLocal(p); b.gun.position.copy(p); b.gun.rotation.set(0, 0, 0); }
}
export function dieGLB(b, dt) { if (!b.mixer) return false; if (!b.died) { b.died = true; play(b.glb, b.clips.death, 0.15, { once: true }); } b.mixer.update(dt); return true; }
