import * as THREE from 'three';
import * as T from './textures.js';
export const R = (a, b) => a + Math.random() * (b - a);
export const MAP = 115;

// Seeded RNG so the city layout is identical every run.
let seed = 1337; function srand() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
const S = (a, b) => a + srand() * (b - a);

export function buildWorld(scene) {
  const windUniform = { value: 0 }, windStrength = { value: 0.3 };
  const colliders = [], buildings = [], lootSpots = [], treeSpots = [];
  const tex = {
    facades: [0, 1, 2, 3].map(i => T.facadeTexture(i)), roof: T.roofTexture(), ground: T.groundTexture(),
    vine: T.vineTexture(), rust: T.rustTexture(), scrap: T.scrapTexture(), glow: T.glowSprite(), mist: T.mistTexture(),
    dConc: T.detail('concrete', 512, 4), dRust: T.detail('rust', 256, 5), dMoss: T.detail('moss', 256, 4), dBark: T.detail('bark', 256, 6), dGround: T.detail('ground', 512, 3),
    bark: T.barkTexture(), moss: T.mossTexture(), leaf: T.leafCardTexture(), grassCard: T.grassCardTexture(), strand: T.vineStrandTexture(),
  };
  const dens = []; // instanced meshes whose .count follows the quality preset
  const swayMats = [];
  // wind sway in the vertex shader. mode 0: grows up (sway by height), 1: hangs down (sway by distance below top)
  function sway(mat, mode, amp) {
    mat.onBeforeCompile = sh => { sh.uniforms.uTime = windUniform; sh.uniforms.uWind = windStrength;
      sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3].x*0.37 + instanceMatrix[3].z*0.23;
        float k = ${mode === 0 ? 'max(position.y,0.0)' : '(1.0-uv.y)*(1.0-uv.y)'} * ${amp.toFixed(3)} * (0.6 + uWind);
        transformed.x += sin(uTime*1.7+ph + position.y*0.4)*k; transformed.z += cos(uTime*1.3+ph*1.3)*k*0.7;`); };
    swayMats.push(mat); return mat;
  }
  // two crossed quads, base at y=0
  function crossQuad(w, h) {
    const a = new THREE.PlaneGeometry(w, h); a.translate(0, h / 2, 0); const b = a.clone(); b.rotateY(Math.PI / 2);
    const pos = [], uv = [], nor = [], idx = []; let o = 0;
    for (const gg of [a, b]) { pos.push(...gg.attributes.position.array); uv.push(...gg.attributes.uv.array); nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0); idx.push(...Array.from(gg.index.array, i => i + o)); o += 4; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setIndex(idx); return geo;
  }
  // ---- ground
  tex.ground.repeat.set(9, 9);
  tex.dGround.normalMap.repeat.set(40, 40); tex.dGround.roughnessMap.repeat.set(40, 40);
  const groundMat = new THREE.MeshStandardMaterial({ map: tex.ground, roughness: 1, color: 0xb0b0a8, normalMap: tex.dGround.normalMap, normalScale: new THREE.Vector2(0.8, 0.8), roughnessMap: tex.dGround.roughnessMap });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(MAP * 2 + 60, MAP * 2 + 60), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  const roofMat = new THREE.MeshStandardMaterial({ map: tex.roof, roughness: 0.95 });
  const vineMat = new THREE.MeshStandardMaterial({ map: tex.vine, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8, color: 0xa8c890 });
  tex.dConc.normalMap.repeat.set(3, 6); tex.dConc.roughnessMap.repeat.set(3, 6);
  const concrete = new THREE.MeshStandardMaterial({ color: 0x6b6a63, roughness: 1, normalMap: tex.dConc.normalMap, roughnessMap: tex.dConc.roughnessMap });
  const ledgeMat = new THREE.MeshStandardMaterial({ color: 0x5f5e58, roughness: 1, normalMap: tex.dConc.normalMap });
  const unitMat = new THREE.MeshStandardMaterial({ color: 0x6c706a, roughness: 0.6, metalness: 0.5, normalMap: tex.dRust.normalMap });
  const tankMat = new THREE.MeshStandardMaterial({ map: tex.rust, roughness: 0.8, metalness: 0.3, normalMap: tex.dRust.normalMap });
  const ledgeGeo = new THREE.BoxGeometry(1, 0.28, 1), unitGeo = new THREE.BoxGeometry(1.8, 1.1, 1.3), tankGeo = new THREE.CylinderGeometry(1.4, 1.4, 2.6, 14), legGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.6, 5);
  const vineSpots = []; // [x, yTop, z, length, rotY]
  const rebarMat = new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: 0.7, metalness: 0.6 });

  function addCollider(x0, x1, z0, z1, h, kind, ref) { const c = { x0, x1, z0, z1, h, kind, ref }; colliders.push(c); return c; }

  function building(cx, cz, w, d, h, opts = {}) {
    const g = new THREE.Group(); g.position.set(cx, 0, cz);
    const ft = tex.facades[(srand() * 4) | 0].clone(); ft.needsUpdate = true; ft.repeat.set(Math.max(1, Math.round(w / 9)), Math.max(1, h / 22));
    const fm = new THREE.MeshStandardMaterial({ map: ft, roughness: 1, metalness: 0.05, normalMap: tex.dConc.normalMap, normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: tex.dConc.roughnessMap });
    const fm2 = fm.clone(); const ft2 = ft.clone(); ft2.needsUpdate = true; ft2.repeat.set(Math.max(1, Math.round(d / 9)), Math.max(1, h / 22)); fm2.map = ft2;
    const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [fm2, fm2, roofMat, concrete, fm, fm]);
    box.position.y = h / 2; box.castShadow = box.receiveShadow = true; g.add(box);
    // broken crown: jagged slabs + rebar
    if (opts.broken) {
      for (let i = 0; i < 6; i++) {
        const sw = S(2, w * 0.5), sh = S(1, 5), sd = S(2, d * 0.5);
        const s = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, sd), concrete); s.position.set(S(-w / 2 + sw / 2, w / 2 - sw / 2), h + sh / 2 - 0.5, S(-d / 2 + sd / 2, d / 2 - sd / 2));
        s.rotation.set(S(-0.4, 0.4), S(0, 3), S(-0.4, 0.4)); s.castShadow = true; g.add(s);
      }
      for (let i = 0; i < 10; i++) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, S(2, 5)), rebarMat); r.position.set(S(-w / 2, w / 2), h + 1.5, S(-d / 2, d / 2)); r.rotation.set(S(-0.6, 0.6), 0, S(-0.6, 0.6)); g.add(r); }
    }
    // vines down faces
    const nv = 2 + ((srand() * 4) | 0);
    for (let i = 0; i < nv; i++) {
      const face = (srand() * 4) | 0, vw = S(4, Math.min(12, (face < 2 ? d : w) * 0.8)), vh = S(h * 0.3, h * 0.95);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(vw, vh), vineMat);
      const off = 0.08; const along = S(-0.5, 0.5);
      if (face === 0) { v.position.set(w / 2 + off, h - vh / 2, along * (d - vw)); v.rotation.y = Math.PI / 2; }
      if (face === 1) { v.position.set(-w / 2 - off, h - vh / 2, along * (d - vw)); v.rotation.y = -Math.PI / 2; }
      if (face === 2) { v.position.set(along * (w - vw), h - vh / 2, d / 2 + off); }
      if (face === 3) { v.position.set(along * (w - vw), h - vh / 2, -d / 2 - off); v.rotation.y = Math.PI; }
      g.add(v);
    }
    // floor ledges / cornices
    if (h > 10) { const nl = Math.min(4, Math.floor(h / 12)); for (let i = 1; i <= nl; i++) { const l = new THREE.Mesh(ledgeGeo, ledgeMat); l.scale.set(w + 0.35, 1, d + 0.35); l.position.y = h * i / (nl + 1) + 0.4; l.castShadow = l.receiveShadow = true; g.add(l); } }
    const top = new THREE.Mesh(ledgeGeo, ledgeMat); top.scale.set(w + 0.5, 2.2, d + 0.5); top.position.y = h + 0.3; top.receiveShadow = true; g.add(top);
    // rooftop units on intact roofs
    if (!opts.broken) {
      for (let i = 0, n = 1 + ((srand() * 3) | 0); i < n; i++) { const u = new THREE.Mesh(unitGeo, unitMat); u.position.set(S(-w / 3, w / 3), h + 0.55 + 0.55, S(-d / 3, d / 3)); u.rotation.y = S(0, 3); u.castShadow = true; g.add(u); }
      if (srand() < 0.6) { const t = new THREE.Mesh(tankGeo, tankMat); const tx = S(-w / 4, w / 4), tz = S(-d / 4, d / 4); t.position.set(tx, h + 2.9, tz); t.castShadow = true; g.add(t);
        for (const [lx, lz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) { const lg = new THREE.Mesh(legGeo, unitMat); lg.position.set(tx + lx, h + 1.1, tz + lz); g.add(lg); } }
    }
    // hanging vine strands along roof edges (skip leaning towers so strands stay attached)
    if (!opts.lean && h < 80) for (let i = 0, n = 4 + ((srand() * 8) | 0); i < n; i++) {
      const face = (srand() * 4) | 0, L = S(3, Math.min(16, h * 0.6)), a = S(-0.45, 0.45);
      const fx = face === 0 ? w / 2 + 0.3 : face === 1 ? -w / 2 - 0.3 : a * w, fz = face === 2 ? d / 2 + 0.3 : face === 3 ? -d / 2 - 0.3 : a * d;
      vineSpots.push([cx + fx, h + 0.2, cz + fz, L, face < 2 ? Math.PI / 2 : 0]);
    }
    if (opts.lean) { g.rotation.z = opts.lean; g.rotation.x = opts.lean * 0.4; }
    scene.add(g);
    const c = addCollider(cx - w / 2, cx + w / 2, cz - d / 2, cz + d / 2, h, 'building', g);
    buildings.push({ cx, cz, w, d, h, c });
    // rubble skirt
    for (let i = 0; i < 14; i++) rubbleList.push([cx + S(-w / 2 - 3, w / 2 + 3), cz + (srand() < 0.5 ? -1 : 1) * (d / 2 + S(0, 3)), S(0.3, 1.4)]);
    if (opts.broken && h < 30) for (let i = 0; i < 2; i++) treeSpots.push([cx + S(-w / 3, w / 3), h, cz + S(-d / 3, d / 3), S(0.7, 1.1)]);
    return g;
  }
  const rubbleList = [];

  // ---- city blocks on a 40m grid; centre block is the plaza/base, two blocks are parks
  const parks = new Set(['-40,40', '40,-40', '-80,-80', '80,80']);
  for (const bx of [-80, -40, 0, 40, 80]) for (const bz of [-80, -40, 0, 40, 80]) {
    if (bx === 0 && bz === 0) continue;
    if (parks.has(bx + ',' + bz)) {
      for (let i = 0; i < 10; i++) treeSpots.push([bx + S(-12, 12), 0, bz + S(-12, 12), S(0.9, 1.5)]);
      if (srand() < 0.7) { const ruin = S(6, 10); building(bx + S(-6, 6), bz + S(-6, 6), ruin, ruin, S(4, 8), { broken: true }); }
      continue;
    }
    const n = 1 + ((srand() * 2.3) | 0);
    if (n === 1) { const w = S(14, 24), d = S(14, 24), h = S(25, 75); building(bx, bz, w, d, h, { broken: srand() < 0.6, lean: srand() < 0.35 ? S(-0.12, 0.12) : 0 }); }
    else {
      const split = srand() < 0.5;
      for (let k = 0; k < 2; k++) {
        const w = split ? S(9, 12) : S(18, 24), d = split ? S(18, 24) : S(9, 12);
        const ox = split ? (k ? 7 : -7) : 0, oz = split ? 0 : (k ? 7 : -7);
        const h = srand() < 0.3 ? S(6, 14) : S(18, 60);
        building(bx + ox, bz + oz, w, d, h, { broken: srand() < 0.65 || h < 15, lean: srand() < 0.25 ? S(-0.1, 0.1) : 0 });
      }
    }
    for (let i = 0; i < 2; i++) lootSpots.push([bx + S(-16, 16) * (srand() < .5 ? 1 : -1) * 0 + (srand() < .5 ? -1 : 1) * S(15, 18), bz + S(-12, 12)]);
  }
  // perimeter ring of tall towers to frame the horizon
  for (let a = 0; a < 26; a++) {
    const ang = a / 26 * Math.PI * 2, r = S(128, 150);
    building(Math.cos(ang) * r, Math.sin(ang) * r, S(14, 26), S(14, 26), S(40, 110), { broken: srand() < 0.5, lean: srand() < 0.3 ? S(-0.15, 0.15) : 0 });
  }
  // street-level loot
  for (let i = 0; i < 14; i++) lootSpots.push([((srand() * 5 | 0) - 2) * 40 + 20 * (srand() < .5 ? 1 : -1), S(-100, 100)]);

  // ---- rubble (instanced)
  {
    const geo = new THREE.DodecahedronGeometry(1, 0); const mat = new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true });
    for (let i = 0; i < 260; i++) rubbleList.push([S(-MAP, MAP), S(-MAP, MAP), S(0.15, 0.6)]);
    const im = new THREE.InstancedMesh(geo, mat, rubbleList.length); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), col = new THREE.Color();
    rubbleList.forEach(([x, z, s], i) => {
      q.setFromEuler(e.set(S(0, 3), S(0, 3), S(0, 3))); m.compose(new THREE.Vector3(x, s * 0.3, z), q, new THREE.Vector3(s, s * S(0.5, 1), s)); im.setMatrixAt(i, m);
      im.setColorAt(i, srand() < 0.3 ? col.setHSL(0.25, 0.35, S(0.18, 0.28)) : col.setHSL(0.1, 0.05, S(0.3, 0.45)));
    });
    im.castShadow = im.receiveShadow = true; scene.add(im);
  }
  // ---- trees (instanced trunks + foliage clumps); some grow straight out of collapsed roofs
  for (let i = 0; i < 40; i++) { const x = S(-MAP, MAP), z = S(-MAP, MAP); if (!inside(x, z, 2) && Math.hypot(x, z) > 14) treeSpots.push([x, 0, z, S(0.7, 1.3)]); }
  treeSpots.push([-11, 0, 9, 1.2], [12, 0, -10, 1.0]);
  {
    const tg = new THREE.CylinderGeometry(0.25, 0.5, 1, 7); tg.translate(0, 0.5, 0);
    const fg = new THREE.IcosahedronGeometry(1, 1);
    tex.bark.repeat.set(2, 3);
    const trunks = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ map: tex.bark, roughness: 1, normalMap: tex.dBark.normalMap, normalScale: new THREE.Vector2(1.2, 1.2) }), treeSpots.length);
    const fol = new THREE.InstancedMesh(fg, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), treeSpots.length * 6);
    const CARDS = 40; const cardMat = sway(new THREE.MeshStandardMaterial({ map: tex.leaf, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9 }), 0, 0.12);
    const cards = new THREE.InstancedMesh(crossQuad(2.4, 2.4), cardMat, treeSpots.length * CARDS); let ci = 0;
    const e2 = new THREE.Euler(), q2 = new THREE.Quaternion();
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(); let fi = 0;
    treeSpots.forEach(([x, y, z, s], i) => {
      const h = 7 * s; q.setFromEuler(new THREE.Euler(S(-0.1, 0.1), 0, S(-0.1, 0.1)));
      m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, h, s)); trunks.setMatrixAt(i, m);
      for (let k = 0; k < 6; k++) {
        const r = S(1.2, 2.1) * s; m.compose(new THREE.Vector3(x + S(-2, 2) * s, y + h * S(0.75, 1.05), z + S(-2, 2) * s), q, new THREE.Vector3(r, r * 0.75, r));
        fol.setMatrixAt(fi, m); fol.setColorAt(fi, col.setHSL(S(0.2, 0.3), S(0.35, 0.55), S(0.1, 0.19))); fi++;
      }
      for (let k = 0; k < CARDS; k++) {
        const a = S(0, 6.28), r = Math.sqrt(srand()) * 3.0 * s, yy = y + h * S(0.68, 1.12) + (1 - r / (3 * s)) * 1.2 * s, cs = S(1.0, 1.7) * s;
        q2.setFromEuler(e2.set(S(-0.6, 0.6), S(0, 6.28), S(-0.6, 0.6))); m.compose(new THREE.Vector3(x + Math.cos(a) * r, yy, z + Math.sin(a) * r), q2, new THREE.Vector3(cs, cs, cs));
        cards.setMatrixAt(ci, m); cards.setColorAt(ci, col.setHSL(S(0.2, 0.29), S(0.35, 0.55), S(0.2, 0.34))); ci++;
      }
      if (y === 0) addCollider(x - 0.5, x + 0.5, z - 0.5, z + 0.5, h, 'tree');
    });
    trunks.castShadow = fol.castShadow = cards.castShadow = true; fol.receiveShadow = cards.receiveShadow = true; scene.add(trunks, fol, cards); dens.push({ m: cards, max: ci, min: 0.45 });
  }
  // ---- grass & weeds pushing through cracks (instanced, wind-swayed in the vertex shader)
  {
    const geo = new THREE.ConeGeometry(0.07, 0.7, 3); geo.translate(0, 0.35, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    sway(mat, 0, 0.16);
    const N = 16000; const im = new THREE.InstancedMesh(geo, mat, N); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    let placed = 0;
    const centres = []; for (let i = 0; i < 160; i++) centres.push([S(-MAP, MAP), S(-MAP, MAP), S(2, 8)]);
    parks.forEach(p => { const [x, z] = p.split(',').map(Number); for (let i = 0; i < 8; i++) centres.push([x + S(-12, 12), z + S(-12, 12), 9]); });
    let guard = 0;
    while (placed < N && guard++ < N * 3) {
      const c = centres[(srand() * centres.length) | 0]; const a = srand() * 6.28, r = Math.sqrt(srand()) * c[2];
      const x = c[0] + Math.cos(a) * r, z = c[1] + Math.sin(a) * r; if (inside(x, z, 0)) continue;
      const s = S(0.5, 1.6); q.setFromEuler(new THREE.Euler(S(-0.3, 0.3), S(0, 3), S(-0.3, 0.3))); m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * S(0.6, 1.4), s));
      im.setMatrixAt(placed, m); im.setColorAt(placed, col.setHSL(S(0.18, 0.28), S(0.4, 0.6), S(0.18, 0.32))); placed++;
    }
    im.count = placed; im.receiveShadow = true; scene.add(im); dens.push({ m: im, max: placed, min: 0.35 });
    // grass cards: soft clumps between the blades
    const NC = 9000; const cm = sway(new THREE.MeshStandardMaterial({ map: tex.grassCard, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }), 0, 0.2);
    const gc = new THREE.InstancedMesh(crossQuad(0.9, 0.7), cm, NC); let pc = 0; guard = 0;
    while (pc < NC && guard++ < NC * 3) {
      const c = centres[(srand() * centres.length) | 0]; const a = srand() * 6.28, r = Math.sqrt(srand()) * c[2] * 1.1;
      const x = c[0] + Math.cos(a) * r, z = c[1] + Math.sin(a) * r; if (inside(x, z, 0)) continue;
      const s = S(0.6, 1.5); q.setFromEuler(new THREE.Euler(0, S(0, 3), 0)); m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(s, s * S(0.7, 1.3), s));
      gc.setMatrixAt(pc, m); gc.setColorAt(pc, col.setHSL(S(0.17, 0.27), S(0.35, 0.55), S(0.22, 0.36))); pc++;
    }
    gc.count = pc; gc.receiveShadow = true; scene.add(gc); dens.push({ m: gc, max: pc, min: 0.25 });
  }
  function inside(x, z, pad) { for (const c of colliders) if (c.kind === 'building' && x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad) return true; return false; }

  // ---- rusted cars swallowed by moss
  const rustMat = new THREE.MeshStandardMaterial({ map: tex.rust, roughness: 0.85, metalness: 0.45, normalMap: tex.dRust.normalMap, normalScale: new THREE.Vector2(1.2, 1.2), roughnessMap: tex.dRust.roughnessMap });
  const mossMat = new THREE.MeshStandardMaterial({ map: tex.moss, color: 0xb8d0a0, roughness: 1, normalMap: tex.dMoss.normalMap, normalScale: new THREE.Vector2(1.5, 1.5) });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x1a2428, roughness: 0.2, metalness: 0.6 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 1 });
  function car(x, z, rot, flipped) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.9, 1.9), rustMat); body.position.y = 0.75; g.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.75, 1.75), glassMat); cab.position.set(-0.2, 1.55, 0); g.add(cab);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.08, 1.7), rustMat); roof.position.set(-0.2, 1.95, 0); g.add(roof);
    for (const [wx, wz] of [[1.35, 0.95], [-1.35, 0.95], [1.35, -0.95], [-1.35, -0.95]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10), tireMat); w.rotation.x = Math.PI / 2; w.position.set(wx, 0.35, wz); g.add(w); }
    for (let i = 0; i < 4; i++) { const mo = new THREE.Mesh(new THREE.IcosahedronGeometry(S(0.4, 0.9), 0), mossMat); mo.scale.y = 0.4; mo.position.set(S(-1.5, 1.5), flipped ? 0.4 : S(1.2, 2.0), S(-0.7, 0.7)); g.add(mo); }
    if (flipped) { g.rotation.z = Math.PI; g.position.y = 2.1; }
    g.position.x = x; g.position.z = z; g.rotation.y = rot; g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    scene.add(g);
    const cs = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot)); const hx = 2.1 * cs + 0.95 * sn, hz = 2.1 * sn + 0.95 * cs;
    addCollider(x - hx, x + hx, z - hz, z + hz, 2, 'car');
  }
  for (let i = 0; i < 26; i++) {
    const alongX = srand() < 0.5, lane = ((srand() * 6) | 0) * 40 - 100, p = S(-105, 105);
    const x = alongX ? p : lane + S(-3, 3), z = alongX ? lane + S(-3, 3) : p;
    if (Math.hypot(x, z) < 16 || inside(x, z, 2.5)) continue;
    car(x, z, (alongX ? 0 : Math.PI / 2) + S(-0.5, 0.5), srand() < 0.12);
  }
  // ---- concrete barriers & lamp posts for street dressing
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2c302c, roughness: 0.6, metalness: 0.7 });
  for (let i = 0; i < 30; i++) {
    const x = S(-MAP, MAP), z = ((srand() * 6) | 0) * 40 - 100 + (srand() < .5 ? -5.5 : 5.5); if (inside(x, z, 1)) continue;
    const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, 7, 6), postMat); p.position.y = 3.5; g.add(p);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), postMat); arm.position.set(0.7, 7, 0); g.add(arm);
    const lean = srand() < 0.3; if (!lean) { const ry0 = S(0, 6); g.userData.ry = ry0; vineSpots.push([x + Math.cos(-ry0) * 1.3, 7, z + Math.sin(-ry0) * 1.3, S(2, 5), S(0, 3)]); }
    g.position.set(x, 0, z); g.rotation.z = lean ? S(-0.4, 0.4) : 0; g.rotation.y = g.userData.ry ?? S(0, 6); g.traverse(o => o.castShadow = true); scene.add(g);
  }
  // ---- hanging vines (instanced strands, swaying from the top)
  {
    const geo = new THREE.PlaneGeometry(0.9, 1); geo.translate(0, -0.5, 0);
    const mat = sway(new THREE.MeshStandardMaterial({ map: tex.strand, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 }), 1, 0.35);
    const n = vineSpots.length * 2; const im = new THREE.InstancedMesh(geo, mat, n); const m = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color(); let k = 0;
    for (const [x, y, z, L, ry] of vineSpots) for (let j = 0; j < 2; j++) {
      q.setFromEuler(new THREE.Euler(0, ry + S(-0.3, 0.3), 0)); const LL = L * S(0.6, 1);
      m.compose(new THREE.Vector3(x + S(-0.5, 0.5), y, z + S(-0.5, 0.5)), q, new THREE.Vector3(S(0.8, 1.3), LL, 1)); im.setMatrixAt(k, m); im.setColorAt(k, col.setHSL(S(0.2, 0.28), 0.45, S(0.22, 0.32))); k++;
    }
    im.count = k; im.castShadow = true; scene.add(im); dens.push({ m: im, max: k, min: 0.4 });
  }
  // ---- puddles in street potholes (shine in rain)
  const puddleMat = new THREE.MeshStandardMaterial({ color: 0x141a1e, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  {
    const geo = new THREE.CircleGeometry(1, 18); const pa = geo.attributes.position; for (let i = 1; i < pa.count; i++) { const f = 0.75 + Math.sin(i * 1.7) * 0.15 + Math.cos(i * 0.9) * 0.1; pa.setXY(i, pa.getX(i) * f, pa.getY(i) * f); }
    for (let i = 0; i < 70; i++) {
      const alongX = srand() < 0.5, lane = ((srand() * 6) | 0) * 40 - 100 + S(-4, 4), p = S(-105, 105); const x = alongX ? p : lane, z = alongX ? lane : p;
      if (inside(x, z, 1)) continue; const pm = new THREE.Mesh(geo, puddleMat); pm.rotation.x = -Math.PI / 2; pm.rotation.z = S(0, 6); pm.scale.set(S(0.8, 3), S(0.6, 2), 1); pm.position.set(x, 0.025, z); pm.receiveShadow = true; scene.add(pm);
    }
  }
  // ---- low drifting ground mist
  const mists = [];
  const mistMat = new THREE.MeshBasicMaterial({ map: tex.mist, transparent: true, depthWrite: false, opacity: 0.5, color: 0xc8d0c8 });
  for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), mistMat); m.rotation.x = -Math.PI / 2; m.position.set(S(-MAP, MAP), S(0.15, 0.7), S(-MAP, MAP)); m.userData.v = S(0.2, 0.6); scene.add(m); mists.push(m); }

  return { colliders, buildings, lootSpots, tex, windUniform, windStrength, mists, inside, addCollider, vineMat, dens, groundMat, puddleMat, facadeMats: [], concrete };
}
