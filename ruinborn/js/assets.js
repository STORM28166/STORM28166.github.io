// RUINBORN asset layer: vendored CC0 rigged GLB characters & creatures (Quaternius), modular part swapping, rugged procedural material layer.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skClone } from 'three/addons/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
export function smoothGeo(g) { if (g.userData.smooth) return g.userData.smooth; const c = g.clone(); c.deleteAttribute('normal'); const m = mergeVertices(c, 1e-4); m.computeVertexNormals(); g.userData.smooth = m; return m; }
export const OUTFITS = { m: ['adventurer', 'casual_hoodie', 'punk', 'swat', 'worker'], f: ['adventurer', 'worker', 'soldier', 'punk'] };
export const LIB = { m: {}, f: {}, creatures: {} };
const loader = new GLTFLoader();
export async function loadAll(onProgress, base = 'assets/') {
  const jobs = [['m', 'base', 'chars/m_base.glb'], ['f', 'base', 'chars/f_base.glb'], ...OUTFITS.m.map(o => ['m', o, `chars/m_${o}.glb`]), ...OUTFITS.f.map(o => ['f', o, `chars/f_${o}.glb`]), ['creatures', 'bull', 'creatures/bull.glb'], ['creatures', 'wolf', 'creatures/wolf.glb']];
  let done = 0;
  await Promise.all(jobs.map(async ([g, k, url]) => { const gl = await loader.loadAsync(base + url); LIB[g][k] = gl; done++; onProgress && onProgress(done / jobs.length); }));
}
// ---- rugged material layer: object-space value noise -> grime, wear, bump (no UVs needed), optional scars on skin
const NOISE = `
float rbH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float rbN(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(rbH(i), rbH(i + vec3(1,0,0)), f.x), mix(rbH(i + vec3(0,1,0)), rbH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(rbH(i + vec3(0,0,1)), rbH(i + vec3(1,0,1)), f.x), mix(rbH(i + vec3(0,1,1)), rbH(i + vec3(1,1,1)), f.x), f.y), f.z); }
float rbF(vec3 p){ return rbN(p) * 0.5 + rbN(p * 2.03) * 0.25 + rbN(p * 4.1) * 0.125 + rbN(p * 8.3) * 0.0625; }
vec3 rbPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = dFdx(surf_pos); vec3 vSigmaY = dFdy(surf_pos); vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN); vec3 R2 = cross(vN, vSigmaX); float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2); return normalize(abs(fDet) * surf_norm - vGrad); }`;
// opts: { dirt 0..1, bump strength, freq, scars 0/1, veins color, wet }
export function rugged(mat, o = {}) {
  const u = { rbDirt: { value: o.dirt ?? 0.5 }, rbBump: { value: o.bump ?? 0.6 }, rbFreq: { value: o.freq ?? 9 }, rbScar: { value: o.scars ? 1 : 0 }, rbVein: { value: new THREE.Color(o.vein ?? 0x000000) }, rbVeinK: { value: o.veinK ?? 0 }, rbGlow: { value: o.veinGlow ?? 0 }, rbUnit: { value: o.unit ?? mat.userData.unit ?? 1 } };
  mat.userData.rb = u; mat.roughness = Math.max(mat.roughness ?? 0.8, o.rough ?? 0.82); mat.metalness = Math.min(mat.metalness ?? 0, o.metal ?? 0.05);
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRbP; uniform float rbUnit;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRbP = position * rbUnit;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vRbP; uniform float rbDirt, rbBump, rbFreq, rbScar, rbVeinK, rbGlow; uniform vec3 rbVein;\n${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float rbn = rbF(vRbP * rbFreq); float rbg = smoothstep(0.52, 0.8, rbF(vRbP * 2.2 + 7.0)) * (0.6 + 0.4 * smoothstep(0.9, 0.2, vRbP.y));
        diffuseColor.rgb *= mix(1.0, 0.7 + 0.5 * rbn, 0.45 * rbDirt);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.45, 0.38, 0.3), rbg * 0.7 * rbDirt);
        float rbv = 1.0 - smoothstep(0.0, 0.045, abs(rbN(vRbP * 5.0 + 3.0) - 0.5)); diffuseColor.rgb = mix(diffuseColor.rgb, rbVein, rbv * rbVeinK);
        if (rbScar > 0.5) { float s = 1.0 - smoothstep(0.0, 0.012, abs(fract(vRbP.x * 7.0 + vRbP.y * 3.0 + rbN(vRbP * 4.0) * 0.6) - 0.5)); s *= step(0.82, rbN(vRbP * 1.7 + 11.0)); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.6, 0.55), s * 0.8); }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (rbF(vRbP * rbFreq) - 0.5) * 0.25, 0.3, 1.0);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n{ float rbv2 = 1.0 - smoothstep(0.0, 0.045, abs(rbN(vRbP * 5.0 + 3.0) - 0.5)); totalEmissiveRadiance += rbVein * rbv2 * rbGlow; }`);
  };
  mat.customProgramCacheKey = () => 'rb' + (o.scars ? 1 : 0);
  mat.flatShading = false; mat.needsUpdate = true; return mat;
}
// ---- humans: base skeleton + modular parts (Head / Body / Legs / Feet) from any outfit of the same gender
const PART_RE = { head: /_Head$/, body: /_Body$/, legs: /_Legs$/, feet: /_Feet$/, extra: /Backpack/ };
function partMeshes(gltf, kind) { let node = null; gltf.scene.traverse(o => { if (!node && PART_RE[kind].test(o.name)) node = o; }); if (!node) return []; const out = []; node.traverse(o => { if (o.isSkinnedMesh) out.push(o); }); return out; }
export function makeHuman(g) {
  const src = LIB[g].base, root = skClone(src.scene); const bones = {};
  root.traverse(o => { if (o.isBone) bones[o.name] = o; });
  const toRemove = []; root.traverse(o => { if (o.isSkinnedMesh) toRemove.push(o); }); toRemove.forEach(o => o.parent.remove(o));
  const mixer = new THREE.AnimationMixer(root); const actions = {}; for (const c of src.animations) actions[c.name] = mixer.clipAction(c);
  if (!LIB[g].unit) { const bb = new THREE.Box3(); src.scene.traverse(o => { if (o.isSkinnedMesh) { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox); } }); const sz = bb.getSize(new THREE.Vector3()); LIB[g].unit = 1.8 / Math.max(sz.x, sz.y, sz.z); }
  return { g, root, bones, mixer, actions, parts: {}, unit: LIB[g].unit, meshParent: bones.Root ? bones.Root.parent : root };
}
// set a part from outfit `o` ('base' or OUTFITS name); returns the cloned materials for tinting
export function setPart(H, kind, o) {
  (H.parts[kind] || []).forEach(m => m.parent && m.parent.remove(m)); H.parts[kind] = [];
  if (!o) return [];
  const list = partMeshes(LIB[H.g][o] || LIB[H.g].base, kind); const mats = [];
  for (const sm of list) {
    const mat = Array.isArray(sm.material) ? sm.material.map(x => x.clone()) : sm.material.clone();
    const m = new THREE.SkinnedMesh(smoothGeo(sm.geometry), mat); m.name = sm.name; (Array.isArray(mat) ? mat : [mat]).forEach(x => x.userData.unit = H.unit);
    sm.updateWorldMatrix(true, false); const pinv = new THREE.Matrix4(); // place relative to armature like in the source file
    const srcParent = sm.parent; let rel = new THREE.Matrix4().copy(sm.matrixWorld); const arm = (() => { let a = null; LIB[H.g][o] && (LIB[H.g][o].scene.traverse(x => { if (!a && x.isBone && x.name === 'Root') a = x.parent; })); return a; })();
    if (arm) { arm.updateWorldMatrix(true, false); rel = pinv.copy(arm.matrixWorld).invert().multiply(sm.matrixWorld); }
    rel.decompose(m.position, m.quaternion, m.scale);
    const sk = new THREE.Skeleton(sm.skeleton.bones.map(b => H.bones[b.name]), sm.skeleton.boneInverses);
    H.meshParent.add(m); m.bind(sk, sm.bindMatrix); m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    H.parts[kind].push(m); (Array.isArray(mat) ? mat : [mat]).forEach(x => mats.push(x));
  }
  return mats;
}
export function geoUnit(geo, meters, _k, mat) { if (!geo.boundingBox) geo.computeBoundingBox(); const sz = geo.boundingBox.getSize(new THREE.Vector3()); const u = meters / Math.max(sz.x, sz.y, sz.z) ; (Array.isArray(mat) ? mat : [mat]).forEach(x => x.userData.unit = u * (geo.userData.unitK || 1)); return u; }
export function play(H, name, fade = 0.22, opts = {}) {
  const a = H.actions[name]; if (!a || H.cur === name) return a; const prev = H.cur && H.actions[H.cur];
  a.reset(); a.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = !!opts.once; a.timeScale = opts.speed || 1; a.enabled = true; a.setEffectiveWeight(1);
  if (prev) a.crossFadeFrom(prev, fade, true); a.play(); H.cur = name; return a;
}
// ---- creatures: cloned rigged animal with its own mixer
export function makeCreature(kind) {
  const src = LIB.creatures[kind], root = skClone(src.scene); const bones = {}, meshes = [];
  root.traverse(o => { if (o.isBone) bones[o.name] = o; if (o.isSkinnedMesh) { meshes.push(o); o.geometry = smoothGeo(o.geometry); o.castShadow = true; o.frustumCulled = false; o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone(); } });
  const mixer = new THREE.AnimationMixer(root); const actions = {}; for (const c of src.animations) actions[c.name] = mixer.clipAction(c);
  return { root, bones, meshes, mixer, actions, cur: null };
}
export function matsOf(obj) { const out = []; obj.traverse(o => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => out.push(m)); }); return out; }

// CPU displacement for creature skin: real bumps/warts along the normal in bind pose (works with skinning)
export function displace(geo, amp, freq, seed = 0) {
  const p = geo.attributes.position, n = geo.attributes.normal; const v = new THREE.Vector3();
  const h = (x, y, z) => { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + seed) * 43758.5453; return s - Math.floor(s); };
  const vn = (x, y, z) => { const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz; const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz); const L = (a, b, t) => a + (b - a) * t;
    return L(L(L(h(ix, iy, iz), h(ix + 1, iy, iz), sx), L(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), sx), sy), L(L(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), sx), L(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), sx), sy), sz); };
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const f = vn(v.x * freq, v.y * freq, v.z * freq) * 0.65 + vn(v.x * freq * 2.7, v.y * freq * 2.7, v.z * freq * 2.7) * 0.35; const w = Math.pow(f, 2.2) * amp; p.setXYZ(i, v.x + n.getX(i) * w, v.y + n.getY(i) * w, v.z + n.getZ(i) * w); }
  p.needsUpdate = true; geo.computeVertexNormals(); return geo;
}
