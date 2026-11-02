import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { roadTexture, plainAsphalt, detailTexture, windowTextures } from "./textures.js";

export const CELL = 500, ROAD_W = 12;
export const cfg = { seg: 40, den: 1, shadows: false, aniso: 8, radius: 2 };

// ---------- deterministic noise ----------
function hash2(x, z) { let h = (Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function rngFrom(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, o) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, z * f); f *= 2; a *= 0.5; } return s; }
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- terrain model ----------
export function roadDist(x, z) {
  const mx = ((x % CELL) + CELL) % CELL, mz = ((z % CELL) + CELL) % CELL;
  return Math.min(Math.min(mx, CELL - mx), Math.min(mz, CELL - mz));
}
// v2: flat, dense city core around spawn (|x|,|z| < 800 m): gentle terrain so the
// downtown sits on level ground instead of hillsides.
function amplitude(x, z) { if (Math.abs(x) < 800 && Math.abs(z) < 800) return 2; return 2 + 80 * sstep(0.45, 0.66, fbm(x / 1800 + 11, z / 1800 + 7, 3)); }
export function height(x, z) {
  const rd = roadDist(x, z);
  if (rd < 9) return 0;
  const A = amplitude(x, z);
  let h = Math.max(0, fbm(x / 700, z / 700, 5) - 0.3) * A * 2.5 + (vnoise(x / 18, z / 18) - 0.5) * 0.5 * sstep(4, 20, A);
  return h * sstep(9, 60, rd);
}
const typeCache = new Map();
export function cellType(i, j) {
  const k = i + "," + j; let t = typeCache.get(k);
  if (!t) {
    // v2: the 3x3 cells around spawn are always city — a dense driveable downtown
    // core (1500 m across) instead of leaving the core to the random draw.
    if (Math.abs(i) <= 1 && Math.abs(j) <= 1) t = "city";
    else {
      const A = amplitude((i + 0.5) * CELL, (j + 0.5) * CELL), r = hash2(i * 7 + 3, j * 13 + 5);
      t = A < 14 && r < 0.7 ? "city" : A < 42 && r < 0.8 ? "forest" : A >= 42 ? "wild" : "open";
    }
    typeCache.set(k, t);
  }
  return t;
}

// ---------- per-cell object data (also used for collisions) ----------
const dataCache = new Map();
export function clearData() { dataCache.clear(); }
function cellData(i, j) {
  const key = i + "," + j; let d = dataCache.get(key);
  if (d) return d;
  if (dataCache.size > 120) dataCache.clear();
  const type = cellType(i, j), rnd = rngFrom(Math.imul(i, 73856093) ^ Math.imul(j, 19349663) ^ 0x9e37);
  const x0 = i * CELL, z0 = j * CELL, M = 28;
  d = { type, buildings: [], trees: [], rocks: [], lamps: [] };
  if (type === "city") {
    for (let a = M; a < CELL - M - 40; a += 52) for (let b = M; b < CELL - M - 40; b += 52) {
      if (rnd() < 0.2) continue;
      const w = 18 + rnd() * 20, dd = 18 + rnd() * 20, x = x0 + a + 26 + (rnd() - 0.5) * 8, z = z0 + b + 26 + (rnd() - 0.5) * 8;
      const cd = Math.hypot(x - x0 - CELL / 2, z - z0 - CELL / 2) / (CELL * 0.7);
      const h = 10 + Math.pow(rnd(), 1.6) * 100 * (1.1 - cd);
      d.buildings.push({ x, z, w, d: dd, h: Math.max(9, h), y: height(x, z) - 4 });
    }
    for (let n = 0; n < 40 * cfg.den; n++) {
      const x = x0 + M + rnd() * (CELL - 2 * M), z = z0 + M + rnd() * (CELL - 2 * M);
      if (!d.buildings.some(b => Math.abs(x - b.x) < b.w / 2 + 3 && Math.abs(z - b.z) < b.d / 2 + 3)) d.trees.push({ x, z, s: 0.6 + rnd() * 0.5, r: 0.4, y: height(x, z), t: 0 });
    }
  } else {
    const n = Math.floor((type === "forest" ? 1100 : type === "open" ? 90 : 35) * cfg.den);
    for (let k = 0; k < n; k++) {
      const x = x0 + M + rnd() * (CELL - 2 * M), z = z0 + M + rnd() * (CELL - 2 * M);
      if (type === "forest" && vnoise(x / 70, z / 70) < 0.3) continue;
      const y = height(x, z), s = 0.7 + rnd() * 0.9;
      if (y > 85) continue;
      d.trees.push({ x, z, s, r: 0.45 * s, y, t: y > 30 || rnd() < 0.5 ? 1 : 0 });
    }
    const nr = Math.floor((type === "wild" ? 90 : 25) * Math.min(cfg.den, 1.5));
    for (let k = 0; k < nr; k++) {
      const x = x0 + M + rnd() * (CELL - 2 * M), z = z0 + M + rnd() * (CELL - 2 * M), s = 0.6 + rnd() * rnd() * 3;
      d.rocks.push({ x, z, s, r: s * 0.9, y: height(x, z) });
    }
  }
  if (cfg.den > 0) for (let p = 20; p < CELL - 10; p += 50) for (const o of [-8, 8]) {
    d.lamps.push({ x: x0 + p, z: z0 + o, rot: o > 0 ? Math.PI : 0 }, { x: x0 + o, z: z0 + p + 25, rot: o > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
  dataCache.set(key, d);
  return d;
}

// Push a circle out of whatever it overlaps in its cell. Returns {nx,nz,pen} or null.
export function collide(x, z, r) {
  const d = cellData(Math.floor(x / CELL), Math.floor(z / CELL));
  for (const b of d.buildings) {
    if (Math.abs(x - b.x) > b.w / 2 + r || Math.abs(z - b.z) > b.d / 2 + r) continue;
    const cx = clamp(x, b.x - b.w / 2, b.x + b.w / 2), cz = clamp(z, b.z - b.d / 2, b.z + b.d / 2);
    const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= r * r) continue;
    if (d2 > 1e-6) { const q = Math.sqrt(d2); return { nx: dx / q, nz: dz / q, pen: r - q }; }
    const ex = b.w / 2 - Math.abs(x - b.x), ez = b.d / 2 - Math.abs(z - b.z);
    return ex < ez ? { nx: Math.sign(x - b.x) || 1, nz: 0, pen: ex + r } : { nx: 0, nz: Math.sign(z - b.z) || 1, pen: ez + r };
  }
  for (const list of [d.trees, d.rocks]) for (const t of list) {
    const dx = x - t.x, dz = z - t.z;
    if (Math.abs(dx) > t.r + r || Math.abs(dz) > t.r + r) continue;
    const q = Math.hypot(dx, dz);
    if (q < t.r + r) return { nx: dx / (q || 1), nz: dz / (q || 1), pen: t.r + r - q };
  }
  return null;
}

// ---------- materials & shared geometry ----------
const win = windowTextures();
const detail = detailTexture(), road = roadTexture(), plain = plainAsphalt();
const mats = {
  terrain: new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 1, metalness: 0 }),
  road: new THREE.MeshStandardMaterial({ map: road, roughness: 0.82, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  plain: new THREE.MeshStandardMaterial({ map: plain, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  building: new THREE.MeshStandardMaterial({ map: win.map, emissiveMap: win.emissive, emissive: 0x000000, vertexColors: true, roughness: 0.55, metalness: 0.15 }),
  trunk: new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 1 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }),
  rock: new THREE.MeshStandardMaterial({ color: 0x77746d, roughness: 1, flatShading: true }),
  pole: new THREE.MeshStandardMaterial({ color: 0x555a60, roughness: 0.5, metalness: 0.6 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0x000000, roughness: 0.4 }),
};
export function setAniso(a) { for (const t of [detail, road, plain, win.map, win.emissive]) { t.anisotropy = a; t.needsUpdate = true; } }
export function setNight(n) { mats.building.emissive.setScalar(n * 0.9); mats.lamp.emissive.setRGB(n * 1.0, n * 0.8, n * 0.45); }

const G = {};
{
  const strip = (len, rotY) => {
    const g = new THREE.PlaneGeometry(ROAD_W, len); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * len / 16);
    if (rotY) g.rotateY(Math.PI / 2); g.translate(0, 0.04, 0); return g;
  };
  G.stripX = strip(CELL - ROAD_W, true); G.stripZ = strip(CELL - ROAD_W, false);
  G.cross = new THREE.PlaneGeometry(ROAD_W, ROAD_W); G.cross.rotateX(-Math.PI / 2); G.cross.translate(0, 0.04, 0);
  G.trunk = new THREE.CylinderGeometry(0.22, 0.34, 4, 6).translate(0, 2, 0);
  const cone = (r, h, y) => new THREE.ConeGeometry(r, h, 8).translate(0, y, 0);
  G.pine = mergeGeometries([cone(2.6, 4.6, 5), cone(2, 4, 7.6), cone(1.3, 3.2, 9.8)]);
  G.broad = new THREE.IcosahedronGeometry(3.3, 1).scale(1, 0.85, 1).translate(0, 6.6, 0);
  G.rock = new THREE.DodecahedronGeometry(1, 0);
  G.pole = new THREE.CylinderGeometry(0.08, 0.12, 8, 6).translate(0, 4, 0);
  G.lamp = new THREE.BoxGeometry(0.4, 0.2, 1.4).translate(0, 8.1, 1);
}

function buildTerrain(i, j, seg, type) {
  const cs = [0]; for (let k = 0; k <= seg; k++) cs.push(8 + (CELL - 16) * k / seg); cs.push(CELL);
  const n = cs.length, x0 = i * CELL, z0 = j * CELL;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3), nor = new Float32Array(n * n * 3), uv = new Float32Array(n * n * 2);
  const city = type === "city";
  for (let b = 0, v = 0; b < n; b++) for (let a = 0; a < n; a++, v++) {
    const x = x0 + cs[a], z = z0 + cs[b], h = height(x, z);
    pos[v * 3] = cs[a]; pos[v * 3 + 1] = h; pos[v * 3 + 2] = cs[b]; uv[v * 2] = x / 6; uv[v * 2 + 1] = z / 6;
    const hx = height(x + 2, z) - height(x - 2, z), hz = height(x, z + 2) - height(x, z - 2);
    const il = 1 / Math.hypot(hx, 4, hz); nor[v * 3] = -hx * il; nor[v * 3 + 1] = 4 * il; nor[v * 3 + 2] = -hz * il;
    const rd = roadDist(x, z), nz = vnoise(x / 25, z / 25), steep = 1 - nor[v * 3 + 1] * 1;
    let r, g, bl;
    if (city) { const c = 0.42 + nz * 0.1; r = c; g = c; bl = c + 0.02; }
    else {
      r = 0.2 + nz * 0.12; g = 0.36 + nz * 0.12; bl = 0.12 + nz * 0.05;
      const rock = Math.max(sstep(0.25, 0.5, steep), sstep(40, 60, h) * 0.8);
      r += (0.42 - r) * rock; g += (0.4 - g) * rock; bl += (0.38 - bl) * rock;
      const snow = sstep(78, 92, h); r += (0.95 - r) * snow; g += (0.96 - g) * snow; bl += (0.98 - bl) * snow;
    }
    const sh = 1 - sstep(6.5, 9, rd); r += (0.4 - r) * sh; g += (0.37 - g) * sh; bl += (0.32 - bl) * sh;
    col[v * 3] = r; col[v * 3 + 1] = g; col[v * 3 + 2] = bl;
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6); let p = 0;
  for (let b = 0; b < n - 1; b++) for (let a = 0; a < n - 1; a++) {
    const i00 = b * n + a, i10 = i00 + 1, i01 = i00 + n, i11 = i01 + 1;
    idx[p++] = i00; idx[p++] = i01; idx[p++] = i10; idx[p++] = i10; idx[p++] = i01; idx[p++] = i11;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3)); g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeBoundingSphere();
  return g;
}

function buildBuildings(list, rnd) {
  const parts = [], tints = [[1, 1, 1], [0.9, 0.85, 0.78], [0.75, 0.8, 0.9], [0.8, 0.8, 0.82], [0.95, 0.75, 0.65]];
  for (const b of list) {
    const H = b.h + 4, g = new THREE.BoxGeometry(b.w, H, b.d), uv = g.attributes.uv;
    for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
      const q = f * 4 + k;
      if (f === 2 || f === 3) { uv.setXY(q, 0.02, 0.02); continue; }
      const fw = f < 2 ? b.d : b.w; uv.setXY(q, uv.getX(q) * fw / 16, uv.getY(q) * H / 14);
    }
    const t = tints[Math.floor(rnd() * tints.length)], c = new Float32Array(24 * 3);
    for (let k = 0; k < 24; k++) { c[k * 3] = t[0]; c[k * 3 + 1] = t[1]; c[k * 3 + 2] = t[2]; }
    g.setAttribute("color", new THREE.BufferAttribute(c, 3));
    g.translate(b.x, b.y + H / 2, b.z); parts.push(g);
  }
  return parts.length ? mergeGeometries(parts) : null;
}

const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
function instanced(geo, mat, items, place, colorFn) {
  if (!items.length) return null;
  const m = new THREE.InstancedMesh(geo, mat, items.length);
  items.forEach((it, k) => { place(dummy, it); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix); if (colorFn) m.setColorAt(k, colorFn(tmpC, it)); });
  m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; m.userData.own = true;
  return m;
}

function buildCell(i, j, seg) {
  const d = cellData(i, j), grp = new THREE.Group(), owned = [], x0 = i * CELL, z0 = j * CELL;
  const rnd = rngFrom(i * 31 + j * 17 + 5);
  const tg = buildTerrain(i, j, seg, d.type); owned.push(tg);
  const terr = new THREE.Mesh(tg, mats.terrain); terr.position.set(x0, 0, z0); terr.receiveShadow = true; terr.userData.ground = true; grp.add(terr);
  const sx = new THREE.Mesh(G.stripX, mats.road); sx.position.set(x0 + CELL / 2, 0, z0); sx.receiveShadow = true;
  const sz = new THREE.Mesh(G.stripZ, mats.road); sz.position.set(x0, 0, z0 + CELL / 2); sz.receiveShadow = true;
  const cr = new THREE.Mesh(G.cross, mats.plain); cr.position.set(x0, 0, z0); cr.receiveShadow = true;
  grp.add(sx, sz, cr);
  const bg = buildBuildings(d.buildings, rnd);
  if (bg) { owned.push(bg); const m = new THREE.Mesh(bg, mats.building); m.frustumCulled = false; grp.add(m); }
  const pines = d.trees.filter(t => t.t), broads = d.trees.filter(t => !t.t);
  const pl = (o, t) => { o.position.set(t.x, t.y, t.z); o.rotation.set(0, t.x * 7.1, 0); o.scale.setScalar(t.s); o.updateMatrix; };
  const green = (c, t) => c.setHSL(0.27 + ((t.x * 13.7) % 1) * 0.06 - 0.03 + (t.t ? 0.02 : -0.01), 0.45, 0.2 + ((t.z * 7.3) % 1) * 0.1);
  for (const m of [
    instanced(G.trunk, mats.trunk, d.trees, pl),
    instanced(G.pine, mats.leaf, pines, pl, green),
    instanced(G.broad, mats.leaf, broads, pl, green),
    instanced(G.rock, mats.rock, d.rocks, (o, r) => { o.position.set(r.x, r.y + r.s * 0.2, r.z); o.rotation.set(r.x, r.z, 0); o.scale.set(r.s, r.s * 0.6, r.s * 0.9); }),
    instanced(G.pole, mats.pole, d.lamps, (o, l) => { o.position.set(l.x, 0, l.z); o.rotation.set(0, l.rot, 0); o.scale.setScalar(1); }),
    instanced(G.lamp, mats.lamp, d.lamps, (o, l) => { o.position.set(l.x, 0, l.z); o.rotation.set(0, l.rot, 0); o.scale.setScalar(1); }),
  ]) if (m) grp.add(m);
  grp.traverse(o => { if (o.isMesh && !o.userData.ground && o.material !== mats.road && o.material !== mats.plain) o.castShadow = cfg.shadows; });
  return { grp, owned, seg };
}

export class World {
  constructor(scene) { this.scene = scene; this.cells = new Map(); this.shadow = false; }
  key(i, j) { return i + "," + j; }
  drop(k) {
    const c = this.cells.get(k); if (!c) return;
    this.scene.remove(c.grp); c.owned.forEach(g => g.dispose());
    c.grp.traverse(o => { if (o.userData.own) o.dispose(); });
    this.cells.delete(k);
  }
  reset() { for (const k of [...this.cells.keys()]) this.drop(k); clearData(); }
  setShadows(on) { cfg.shadows = on; for (const c of this.cells.values()) c.grp.traverse(o => { if (o.isMesh && !o.userData.ground && o.material !== mats.road && o.material !== mats.plain) o.castShadow = on; }); }
  // Builds at most `budget` missing cells (nearest first); returns true when everything in range exists.
  update(px, pz, ms = 6) {
    const ci = Math.floor(px / CELL), cj = Math.floor(pz / CELL), R = cfg.radius, need = [];
    for (let a = -R - 1; a <= R + 1; a++) for (let b = -R - 1; b <= R + 1; b++) {
      const dist = Math.max(Math.abs(a), Math.abs(b)), k = this.key(ci + a, cj + b);
      if (dist > R) { if (dist > R + 1) this.drop(k); continue; }
      if (!this.cells.has(k)) need.push([Math.hypot(a, b), ci + a, cj + b, dist]);
    }
    need.sort((p, q) => p[0] - q[0]);
    const t0 = performance.now();
    for (let n = 0; n < need.length && (n === 0 || performance.now() - t0 < ms); n++) {
      const [, i, j, dist] = need[n], seg = dist >= 2 ? Math.max(16, Math.round(cfg.seg * 0.6)) : cfg.seg;
      const c = buildCell(i, j, seg); this.scene.add(c.grp); this.cells.set(this.key(i, j), c);
    }
    return need.length === 0;
  }
}
