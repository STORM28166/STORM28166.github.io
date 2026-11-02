import * as THREE from "three";

function canvas(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")]; }
function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function speckle(g, w, h, n, base) {
  for (let i = 0; i < n; i++) {
    const v = base + (Math.random() - 0.5) * 50;
    g.fillStyle = `rgb(${v},${v},${v + 2})`;
    g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

// 12 m wide x 16 m long road tile: edge lines, dashed centre line, worn wheel tracks.
export function roadTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#3b3e43"; g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 9000, 62);
  g.fillStyle = "rgba(0,0,0,.14)"; g.fillRect(52, 0, 36, 256); g.fillRect(168, 0, 36, 256);
  g.fillStyle = "#e9e9e2"; g.fillRect(10, 0, 6, 256); g.fillRect(240, 0, 6, 256);
  g.fillRect(125, 0, 6, 128);
  g.fillStyle = "rgba(0,0,0,.25)";
  for (let i = 0; i < 6; i++) g.fillRect(Math.random() * 250, Math.random() * 250, 2, 30 + Math.random() * 60);
  return tex(c);
}
export function plainAsphalt() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = "#3b3e43"; g.fillRect(0, 0, 64, 64); speckle(g, 64, 64, 900, 62);
  return tex(c);
}
// Grayscale noise, multiplied over the terrain colours (tiles every 6 m).
export function detailTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#d8d8d8"; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 14000; i++) {
    const v = 170 + Math.random() * 85;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  return tex(c);
}
// 16 m x 14 m facade tile with 4x4 windows; a second texture holds which are lit.
export function windowTextures() {
  const [c, g] = canvas(256, 256), [e, h] = canvas(256, 256);
  g.fillStyle = "#d6d6d2"; g.fillRect(0, 0, 256, 256); speckle(g, 256, 256, 3000, 205);
  h.fillStyle = "#000"; h.fillRect(0, 0, 256, 256);
  g.fillStyle = "rgba(0,0,0,0.10)"; for (let px = 0; px < 256; px += 51) g.fillRect(px, 0, 3, 256);
  for (let r = 0; r < 5; r++) for (let q = 0; q < 5; q++) {
    const x = q * 51 + 7, y = r * 51 + 8;
    const gr = g.createLinearGradient(x, y, x + 38, y + 34);
    gr.addColorStop(0, "#3c5878"); gr.addColorStop(0.5, "#1b2a3d"); gr.addColorStop(1, "#2c445f");
    g.fillStyle = gr; g.fillRect(x, y, 38, 34);
    g.fillStyle = "#b9b9b3"; g.fillRect(x - 2, y + 34, 42, 3);
    if (Math.random() < 0.45) { h.fillStyle = Math.random() < .5 ? "#ffd98a" : "#fff1c8"; h.fillRect(x, y, 38, 34); }
  }
  return { map: tex(c), emissive: tex(e) };
}
