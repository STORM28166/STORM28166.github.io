// Simple traffic cars (v2, new file). They are NOT Car instances: a light extruded
// body + cylinder wheels, driven along the 500 m road grid (roads run at multiples
// of 500 m, 12 m wide; lanes offset ±3 m). No BoxGeometry is used here.
import * as THREE from "three";
import { height } from "./world.js";

const CELL = 500;
const COLORS = [0xd8dee4, 0x2244aa, 0x888888, 0x228844, 0xdddddd, 0xaa2222, 0x333333, 0xe8a020];

function extrudeBody(pts, width, mat) {
  const s = new THREE.Shape();
  pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2, curveSegments: 4 });
  g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}

function buildTrafficCar(color) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.4 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1118, metalness: 0.5, roughness: 0.1, transparent: true, opacity: 0.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x111214, roughness: 0.85 });
  g.add(extrudeBody([[-2.1, 0.35], [-2.1, 0.75], [-1.7, 0.9], [1.7, 0.9], [2.1, 0.7], [2.1, 0.35]], 1.7, paint));
  g.add(extrudeBody([[-1.1, 0.9], [-0.7, 1.35], [0.3, 1.35], [0.9, 0.9]], 1.45, glass));
  const wheels = [];
  const tireG = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 18).rotateZ(Math.PI / 2);
  const rimG = new THREE.CylinderGeometry(0.2, 0.2, 0.25, 14).rotateZ(Math.PI / 2);
  const rimM = new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.8, roughness: 0.3 });
  for (const [x, z] of [[0.8, 1.35], [-0.8, 1.35], [0.8, -1.35], [-0.8, -1.35]]) {
    const spin = new THREE.Group(); spin.position.set(x, 0.33, z);
    spin.add(new THREE.Mesh(tireG, dark)); spin.add(new THREE.Mesh(rimG, rimM));
    g.add(spin); wheels.push(spin);
  }
  // Always-on tail glow so traffic reads at dusk.
  const tl = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff2020, emissiveIntensity: 0.8 });
  for (const x of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10).rotateX(Math.PI / 2), tl);
    t.position.set(x, 0.72, -2.12); g.add(t);
  }
  return { group: g, wheels };
}

const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class Traffic {
  constructor(scene) {
    this.scene = scene; this.group = new THREE.Group(); scene.add(this.group);
    this.cars = []; this.enabled = true;
    const lines = [-1000, -500, 0, 500, 1000];
    for (let i = 0; i < 10; i++) {
      const axis = i % 2 ? "x" : "z";
      const line = lines[i % lines.length] + (i % 3 === 0 ? 3 : -3);
      const c = buildTrafficCar(COLORS[i % COLORS.length]);
      this.group.add(c.group);
      this.cars.push({ ...c, axis, line, along: -1000 + i * 211, dir: i % 4 < 2 ? 1 : -1, cruise: 11 + (i % 5) * 1.5, speed: 0, h: 0, th: 0, lastTurn: -1e9 });
    }
  }
  setEnabled(on) { this.enabled = on; this.group.visible = on; }
  update(dt, px, pz) {
    if (!this.enabled) return;
    for (const c of this.cars) {
      // Slow down when the player is close ahead; otherwise cruise.
      const dx = px - (c.axis === "x" ? c.along : c.line), dz = pz - (c.axis === "z" ? c.along : c.line);
      const dist = Math.hypot(dx, dz);
      const fx = Math.sin(c.h), fz = Math.cos(c.h);
      const ahead = (dx * fx + dz * fz) > 0;
      const target = (dist < 14 && ahead) ? 0 : c.cruise;
      c.speed += Math.max(-14 * dt, Math.min(6 * dt, target - c.speed));
      c.along += c.dir * c.speed * dt;
      // At intersections (multiples of 500 m) sometimes turn onto the crossing road.
      const near = Math.abs(c.along - Math.round(c.along / CELL) * CELL) < 1.5;
      if (near && Math.abs(c.along - c.lastTurn) > 60 && Math.random() < 0.3) {
        const nl = Math.round(c.along / CELL) * CELL, oldLine = c.line;
        c.lastTurn = c.along;
        c.dir = Math.random() < 0.5 ? 1 : -1;
        // New lateral coordinate = intersection + lane offset (±3 m); new
        // longitudinal coordinate = where the car was on the old road.
        if (c.axis === "x") { c.axis = "z"; c.line = nl + (c.dir > 0 ? 3 : -3); c.along = oldLine; }
        else { c.axis = "x"; c.line = nl + (c.dir > 0 ? 3 : -3); c.along = oldLine; }
      }
      if (Math.abs(c.along) > 2200) c.dir *= -1;
      const x = c.axis === "x" ? c.along : c.line, z = c.axis === "z" ? c.along : c.line;
      c.px = x; c.pz = z;
      c.th = c.axis === "x" ? (c.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (c.dir > 0 ? 0 : Math.PI);
      c.h += angDiff(c.th, c.h) * Math.min(1, dt * 3);
      c.group.position.set(x, height(x, z) + 0.04, z);
      c.group.rotation.y = c.h;
      for (const w of c.wheels) w.rotation.x += c.speed * dt / 0.33;
    }
  }
}
