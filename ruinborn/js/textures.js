import * as THREE from 'three';
const R = (a, b) => a + Math.random() * (b - a);
function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function finish(c, repeat = true) {
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
function speckle(g, w, h, n, cols, smin = 1, smax = 3) {
  for (let i = 0; i < n; i++) { g.fillStyle = cols[(Math.random() * cols.length) | 0]; const s = R(smin, smax); g.fillRect(Math.random() * w, Math.random() * h, s, s); }
}
function blob(g, x, y, r, col, a) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col.replace('A', a)); gr.addColorStop(1, col.replace('A', 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
}
function crack(g, x, y, len, w) {
  g.strokeStyle = 'rgba(10,10,10,0.7)'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y);
  let a = R(0, 6.28); for (let i = 0; i < len; i++) { a += R(-0.6, 0.6); x += Math.cos(a) * 6; y += Math.sin(a) * 6; g.lineTo(x, y); } g.stroke();
}
// Facade: concrete with a broken window grid, grime streaks, moss creeping up from the street.
export function facadeTexture(variant) {
  const W = 512, H = 1024; const [c, g] = cnv(W, H);
  const bases = ['#7d7a72', '#6f7470', '#8a8274', '#5f6663'];
  g.fillStyle = bases[variant % 4]; g.fillRect(0, 0, W, H);
  speckle(g, W, H, 9000, ['rgba(0,0,0,0.08)', 'rgba(255,255,255,0.05)', 'rgba(60,50,40,0.1)']);
  const cols = 6, rows = 12, cw = W / cols, rh = H / rows;
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    const x = k * cw + cw * 0.15, y = r * rh + rh * 0.18, w = cw * 0.7, h = rh * 0.55;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 3, y - 3, w + 6, h + 8);
    const roll = Math.random();
    if (roll < 0.45) { g.fillStyle = '#07090b'; g.fillRect(x, y, w, h); }
    else {
      const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, '#3d5560'); gr.addColorStop(0.5, '#1a2830'); gr.addColorStop(1, '#2c4048');
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      if (roll < 0.8) { g.fillStyle = '#07090b'; g.beginPath(); g.moveTo(x + R(0, w), y); g.lineTo(x + w, y + R(0, h)); g.lineTo(x + R(0, w), y + h); g.lineTo(x, y + R(0, h)); g.fill(); }
    }
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y + h, w, 4);
  }
  for (let i = 0; i < 40; i++) { const x = R(0, W); const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, 'rgba(20,18,14,0)'); gr.addColorStop(R(0.2, 1), 'rgba(20,18,14,0.25)'); gr.addColorStop(1, 'rgba(20,18,14,0)'); g.fillStyle = gr; g.fillRect(x, R(0, H * 0.5), R(3, 14), R(100, 600)); }
  for (let i = 0; i < 14; i++) crack(g, R(0, W), R(0, H), 20, R(1, 2.5));
  const mg = g.createLinearGradient(0, H, 0, H * 0.55); mg.addColorStop(0, 'rgba(48,82,30,0.85)'); mg.addColorStop(1, 'rgba(48,82,30,0)'); g.fillStyle = mg; g.fillRect(0, H * 0.55, W, H * 0.45);
  for (let i = 0; i < 60; i++) blob(g, R(0, W), R(0, H) ** 1 * (Math.random() < 0.6 ? 1 : 0.4) + (Math.random() < 0.5 ? H * 0.4 : 0), R(10, 60), 'rgba(58,92,34,A)', 0.55);
  return finish(c);
}
export function roofTexture() {
  const [c, g] = cnv(512, 512); g.fillStyle = '#4b5045'; g.fillRect(0, 0, 512, 512);
  speckle(g, 512, 512, 6000, ['rgba(0,0,0,0.12)', 'rgba(255,255,255,0.04)']);
  for (let i = 0; i < 40; i++) blob(g, R(0, 512), R(0, 512), R(20, 90), 'rgba(62,98,36,A)', 0.8);
  for (let i = 0; i < 8; i++) crack(g, R(0, 512), R(0, 512), 25, 2);
  return finish(c);
}
export function groundTexture() {
  const S = 1024; const [c, g] = cnv(S, S); g.fillStyle = '#3a3b37'; g.fillRect(0, 0, S, S);
  speckle(g, S, S, 40000, ['rgba(0,0,0,0.15)', 'rgba(255,255,255,0.05)', 'rgba(80,70,50,0.12)'], 1, 4);
  for (let i = 0; i < 30; i++) crack(g, R(0, S), R(0, S), 40, R(1.5, 3));
  for (let i = 0; i < 90; i++) blob(g, R(0, S), R(0, S), R(20, 110), 'rgba(52,80,28,A)', R(0.4, 0.85));
  for (let i = 0; i < 50; i++) blob(g, R(0, S), R(0, S), R(10, 50), 'rgba(70,58,38,A)', 0.5);
  g.fillStyle = 'rgba(200,190,140,0.18)'; for (let y = 0; y < S; y += 80) g.fillRect(S / 2 - 4, y, 8, 44);
  return finish(c);
}
export function vineTexture() {
  const W = 256, H = 512; const [c, g] = cnv(W, H);
  for (let s = 0; s < 9; s++) {
    let x = R(10, W - 10), y = 0; const len = R(H * 0.4, H);
    g.strokeStyle = `rgb(${R(30, 50) | 0},${R(55, 80) | 0},${R(20, 30) | 0})`; g.lineWidth = R(2, 4); g.beginPath(); g.moveTo(x, y);
    const pts = [];
    while (y < len) { x += R(-6, 6); y += R(6, 12); g.lineTo(x, y); pts.push([x, y]); }
    g.stroke();
    for (const [px, py] of pts) for (let l = 0; l < 2; l++) {
      g.fillStyle = `rgb(${R(40, 80) | 0},${R(85, 140) | 0},${R(25, 50) | 0})`;
      g.save(); g.translate(px + R(-8, 8), py + R(-4, 4)); g.rotate(R(0, 6.28)); g.beginPath(); g.ellipse(0, 0, R(5, 10), R(3, 5), 0, 0, 7); g.fill(); g.restore();
    }
  }
  const t = finish(c, false); return t;
}
export function rustTexture() {
  const [c, g] = cnv(256, 256); g.fillStyle = '#6b3d22'; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 5000, ['rgba(140,70,30,0.4)', 'rgba(30,20,15,0.3)', 'rgba(170,100,50,0.25)'], 1, 5);
  for (let i = 0; i < 20; i++) blob(g, R(0, 256), R(0, 256), R(10, 40), 'rgba(40,25,18,A)', 0.6);
  for (let i = 0; i < 8; i++) blob(g, R(0, 256), R(0, 256), R(8, 30), 'rgba(55,85,30,A)', 0.6);
  return finish(c);
}
export function scrapTexture() {
  const [c, g] = cnv(256, 256); g.fillStyle = '#5e5a52'; g.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, 0, 4, 256); g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(x + 6, 0, 3, 256); }
  for (let i = 0; i < 6; i++) { g.fillStyle = ['#7a4426', '#4c5a50', '#6e6450'][i % 3]; g.globalAlpha = 0.6; g.fillRect(R(0, 200), R(0, 200), R(40, 120), R(40, 100)); }
  g.globalAlpha = 1; speckle(g, 256, 256, 3000, ['rgba(120,60,20,0.35)', 'rgba(0,0,0,0.2)'], 1, 4);
  g.fillStyle = '#222'; for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(R(0, 256), R(0, 256), 2, 0, 7); g.fill(); }
  return finish(c);
}
export function glowSprite() {
  const [c, g] = cnv(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t;
}
export function mistTexture() {
  const [c, g] = cnv(256, 256);
  for (let i = 0; i < 40; i++) blob(g, R(40, 216), R(40, 216), R(30, 80), 'rgba(255,255,255,A)', 0.12);
  return new THREE.CanvasTexture(c);
}
export function screenTexture(lines, color = '#7dff7a') {
  const [c, g] = cnv(256, 160); g.fillStyle = '#03140a'; g.fillRect(0, 0, 256, 160);
  g.fillStyle = color; g.font = 'bold 18px monospace'; lines.forEach((l, i) => g.fillText(l, 12, 30 + i * 24));
  g.fillStyle = 'rgba(0,0,0,0.25)'; for (let y = 0; y < 160; y += 3) g.fillRect(0, y, 256, 1);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function scrawlTexture(text) {
  const [c, g] = cnv(512, 256); g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#8a1a12'; g.font = 'bold 54px Impact, sans-serif'; g.save(); g.translate(20, 90); g.rotate(-0.05);
  text.split('\n').forEach((l, i) => g.fillText(l, 0, i * 70)); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function clothTexture() {
  const [c, g] = cnv(128, 128); g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) { g.fillStyle = `rgba(0,0,0,${R(0.03, 0.1)})`; g.fillRect(0, y, 128, 1); }
  for (let x = 0; x < 128; x += 2) { g.fillStyle = `rgba(255,255,255,${R(0.02, 0.06)})`; g.fillRect(x, 0, 1, 128); }
  for (let i = 0; i < 12; i++) blob(g, R(0, 128), R(0, 128), R(6, 20), 'rgba(60,50,35,A)', 0.35);
  const t = finish(c); return t;
}

// ---------------------------------------------------------------- detail maps (v0.2): procedural height -> normal + roughness
function heightField(kind, S) {
  const [c, g] = cnv(S, S);
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  if (kind === 'concrete') {
    speckle(g, S, S, S * 40, ['rgba(0,0,0,0.25)', 'rgba(255,255,255,0.22)'], 1, 3);
    for (let i = 0; i < 40; i++) blob(g, R(0, S), R(0, S), R(10, 60), 'rgba(0,0,0,A)', 0.25);
    for (let i = 0; i < 18; i++) crack(g, R(0, S), R(0, S), 30, R(1, 3));
    g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < S; y += S / 4) g.fillRect(0, y, S, 3);
  } else if (kind === 'rust') {
    speckle(g, S, S, S * 30, ['rgba(0,0,0,0.4)', 'rgba(255,255,255,0.3)'], 1, 5);
    for (let i = 0; i < 70; i++) blob(g, R(0, S), R(0, S), R(4, 22), 'rgba(0,0,0,A)', 0.6);
    for (let i = 0; i < 40; i++) blob(g, R(0, S), R(0, S), R(6, 30), 'rgba(255,255,255,A)', 0.35);
  } else if (kind === 'moss') {
    for (let i = 0; i < 900; i++) blob(g, R(0, S), R(0, S), R(3, 12), 'rgba(255,255,255,A)', 0.35);
    speckle(g, S, S, S * 20, ['rgba(0,0,0,0.3)'], 1, 2);
  } else if (kind === 'bark') {
    for (let x = 0; x < S; x += R(3, 9)) { g.fillStyle = `rgba(0,0,0,${R(0.3, 0.7)})`; let y = 0; g.beginPath(); g.moveTo(x, 0); while (y < S) { y += 12; g.lineTo(x + Math.sin(y * 0.05 + x) * 3, y); } g.lineWidth = R(1, 3); g.strokeStyle = g.fillStyle; g.stroke(); }
    speckle(g, S, S, S * 10, ['rgba(255,255,255,0.2)', 'rgba(0,0,0,0.2)'], 1, 3);
  } else if (kind === 'ground') {
    speckle(g, S, S, S * 60, ['rgba(0,0,0,0.3)', 'rgba(255,255,255,0.25)'], 1, 4);
    for (let i = 0; i < 30; i++) crack(g, R(0, S), R(0, S), 40, R(2, 4));
    for (let i = 0; i < 60; i++) blob(g, R(0, S), R(0, S), R(20, 80), 'rgba(255,255,255,A)', 0.2);
  }
  return [c, g];
}
function normalFrom(c, strength) {
  const S = c.width, src = c.getContext('2d').getImageData(0, 0, S, S).data;
  const [o, og] = cnv(S, S); const img = og.createImageData(S, S); const d = img.data;
  const h = (x, y) => src[(((y + S) % S) * S + ((x + S) % S)) * 4] / 255;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4;
    d[i] = (-dx / l * 0.5 + 0.5) * 255; d[i + 1] = (dy / l * 0.5 + 0.5) * 255; d[i + 2] = (1 / l * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  og.putImageData(img, 0, 0); return o;
}
function linearTex(c) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; }
const detailCache = {};
export function detail(kind, size = 512, strength = 3) {
  if (detailCache[kind]) return detailCache[kind];
  const [hc, hg] = heightField(kind, size);
  const normalMap = linearTex(normalFrom(hc, strength));
  // roughness: invert-ish height so crevices are rougher, ridges slightly smoother
  const [rc, rg] = cnv(size, size); rg.drawImage(hc, 0, 0); rg.globalCompositeOperation = 'difference'; rg.fillStyle = '#ffffff'; rg.fillRect(0, 0, size, size);
  rg.globalCompositeOperation = 'source-over'; rg.fillStyle = 'rgba(230,230,230,0.55)'; rg.fillRect(0, 0, size, size);
  const roughnessMap = linearTex(rc);
  return (detailCache[kind] = { normalMap, roughnessMap });
}
export function barkTexture() {
  const [c, g] = cnv(256, 512); g.fillStyle = '#3b2c20'; g.fillRect(0, 0, 256, 512);
  for (let x = 0; x < 256; x += R(3, 8)) { g.fillStyle = `rgba(${R(10, 40) | 0},${R(8, 30) | 0},${R(5, 20) | 0},0.6)`; g.fillRect(x, 0, R(1, 3), 512); }
  for (let i = 0; i < 30; i++) blob(g, R(0, 256), R(0, 512), R(10, 40), 'rgba(60,92,32,A)', 0.55);
  return finish(c);
}
export function mossTexture() {
  const [c, g] = cnv(256, 256); g.fillStyle = '#3f6b28'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) blob(g, R(0, 256), R(0, 256), R(3, 10), Math.random() < 0.5 ? 'rgba(90,140,50,A)' : 'rgba(30,55,20,A)', 0.6);
  return finish(c);
}
// leaf cluster card (alpha): used on crossed quads around tree canopies
export function leafCardTexture() {
  const [c, g] = cnv(256, 256);
  for (let i = 0; i < 140; i++) {
    const a = R(0, 6.28), r = Math.sqrt(Math.random()) * 100, x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r;
    g.fillStyle = `rgb(${R(150, 215) | 0},${R(185, 245) | 0},${R(120, 170) | 0})`;
    g.save(); g.translate(x, y); g.rotate(R(0, 6.28)); g.beginPath(); g.ellipse(0, 0, R(9, 16), R(4, 7), 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(60,80,40,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-12, 0); g.lineTo(12, 0); g.stroke(); g.restore();
  }
  const t = finish(c, false); return t;
}
export function grassCardTexture() {
  const [c, g] = cnv(128, 128);
  for (let i = 0; i < 26; i++) {
    const x = R(10, 118), h = R(50, 125), bend = R(-20, 20);
    g.strokeStyle = `rgb(${R(150, 210) | 0},${R(190, 240) | 0},${R(110, 160) | 0})`; g.lineWidth = R(2, 4);
    g.beginPath(); g.moveTo(x, 128); g.quadraticCurveTo(x + bend * 0.3, 128 - h * 0.6, x + bend, 128 - h); g.stroke();
  }
  return finish(c, false);
}
export function vineStrandTexture() {
  const W = 64, H = 512; const [c, g] = cnv(W, H);
  g.strokeStyle = '#4c6a2a'; g.lineWidth = 2.5; g.beginPath(); let x = 32; g.moveTo(x, 0);
  const pts = []; for (let y = 0; y < H; y += 8) { x = 32 + Math.sin(y * 0.03) * 8; g.lineTo(x, y); pts.push([x, y]); } g.stroke();
  for (const [px, py] of pts) for (let l = 0; l < 2; l++) {
    if (Math.random() < 0.15 * (py / H)) continue;
    g.fillStyle = `rgb(${R(150, 210) | 0},${R(190, 240) | 0},${R(110, 160) | 0})`;
    g.save(); g.translate(px + R(-12, 12), py); g.rotate(R(-1, 1)); g.beginPath(); g.ellipse(0, 0, R(5, 9), R(3, 5), 0, 0, 7); g.fill(); g.restore();
  }
  return finish(c, false);
}
