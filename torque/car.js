import * as THREE from "three";
import { height, roadDist, collide } from "./world.js";

const L = 2.7, TRACK = 0.8, FRONT_Z = 1.4, REAR_Z = -1.3, WR = 0.33;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const GEAR_MAX = [12.5, 22, 33, 44, 57, 75];

function extrude(pts, width, mat) {
  const s = new THREE.Shape(); pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1]))); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.06, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}
function box(w, h, d, x, y, z, mat, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; }

export class Car {
  // paintColor is additive only (default = the original red); physics in step() is untouched.
  constructor(scene, paintColor = 0xc8202a) {
    this.root = new THREE.Group(); this.body = new THREE.Group(); this.root.add(this.body);
    const paint = new THREE.MeshPhysicalMaterial({ color: paintColor, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05 });
    this.paintMat = paint;
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0c1118, metalness: 0.6, roughness: 0.05, transparent: true, opacity: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0d0d0f, roughness: 0.7 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dade, metalness: 1, roughness: 0.15 });
    this.tail = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff0000, emissiveIntensity: 0.3 });
    this.head = new THREE.MeshStandardMaterial({ color: 0xeeeeee, emissive: 0xfff3d0, emissiveIntensity: 0.15 });
    const b = this.body;
    b.add(extrude([[-2.25, 0.34], [-2.25, 0.82], [-1.95, 0.97], [-0.9, 1.0], [0.55, 1.03], [1.5, 0.95], [2.1, 0.8], [2.25, 0.62], [2.25, 0.4], [1.95, 0.3], [-1.9, 0.3]], 1.7, paint));
    b.add(extrude([[-1.2, 1.0], [-0.78, 1.46], [0.3, 1.48], [0.98, 1.03]], 1.5, glass));
    box(1.52, 0.05, 1.05, 0, 1.5, -0.25, paint, b).castShadow = true;
    for (const x of [-0.76, 0.76]) { box(0.05, 0.5, 0.05, x, 1.25, -0.82, paint, b).rotation.x = 0.6; box(0.05, 0.5, 0.05, x, 1.25, 0.72, paint, b).rotation.x = -0.9; }
    box(1.74, 0.16, 0.3, 0, 0.42, 2.2, dark, b); box(1.74, 0.16, 0.3, 0, 0.42, -2.2, dark, b);
    box(1.0, 0.22, 0.08, 0, 0.68, 2.3, dark, b); box(1.0, 0.04, 0.02, 0, 0.74, 2.35, chrome, b);
    box(1.6, 0.06, 0.5, 0, 0.3, 2.2, dark, b);
    for (const x of [-0.65, 0.65]) { box(0.38, 0.12, 0.12, x, 0.84, 2.2, this.head, b).rotation.x = 0.35; box(0.42, 0.1, 0.1, x, 0.85, -2.28, this.tail, b); }
    box(0.5, 0.14, 0.02, 0, 0.55, -2.33, chrome, b);
    box(1.0, 0.04, 0.3, 0, 1.07, -2.05, paint, b); for (const x of [-0.5, 0.5]) box(0.05, 0.12, 0.06, x, 1.0, -2.0, dark, b);
    for (const x of [-0.97, 0.97]) { box(0.14, 0.1, 0.2, x, 1.05, 0.7, paint, b); box(0.02, 0.5, 1.9, x * 0.89, 0.65, 0, dark, b).scale.y = 0.02; for (const z of [-0.5, 0.45]) box(0.02, 0.55, 0.02, x * 0.9, 0.78, z, dark, b); }
    box(1.0, 0.04, 1.4, 0, 1.03, 1.1, dark, b).visible = false;
    for (const x of [-0.4, 0.4]) { box(0.45, 0.1, 0.45, x, 0.6, -0.15, dark, b); box(0.45, 0.5, 0.1, x, 0.85, -0.4, dark, b); }
    box(1.3, 0.14, 0.4, 0, 1.0, 0.75, dark, b);
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.02, 8, 20), dark); sw.position.set(0.4, 1.1, 0.5); sw.rotation.x = 1.1; b.add(sw);
    // ---- v2 detail (new geometry only; no BoxGeometry added) ----
    // Brake discs spin with the wheels; calipers ride on the steer groups (no spin).
    const discG = new THREE.CylinderGeometry(0.2, 0.2, 0.05, 20).rotateZ(Math.PI / 2);
    const discM = new THREE.MeshStandardMaterial({ color: 0x9aa2ab, roughness: 0.35, metalness: 0.8 });
    const calM = new THREE.MeshStandardMaterial({ color: 0xd8232a, roughness: 0.5 });
    const calG = new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10);
    this.detailDiscs = [];
    // Exhaust tips (chrome cylinders), door handles, light housings, side skirts.
    for (const x of [-0.55, 0.55]) { const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 12).rotateX(Math.PI / 2), chrome); ex.position.set(x, 0.32, -2.32); b.add(ex); }
    for (const x of [-0.87, 0.87]) { const hd = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.28, 8).rotateX(Math.PI / 2), dark); hd.position.set(x, 0.98, -0.1); b.add(hd); }
    for (const x of [-0.65, 0.65]) {
      const hh = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.06, 16).rotateX(Math.PI / 2), dark); hh.position.set(x, 0.84, 2.18); b.add(hh);
      const th = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 16).rotateX(Math.PI / 2), dark); th.position.set(x, 0.85, -2.26); b.add(th);
    }
    for (const x of [-0.88, 0.88]) { const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 10), dark); sk.scale.set(0.14, 0.16, 2.5); sk.position.set(x, 0.38, 0); b.add(sk); }
    this.wheels = [];
    const tireG = new THREE.CylinderGeometry(WR, WR, 0.26, 28).rotateZ(Math.PI / 2);
    const tireM = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.95 });
    const rimG = new THREE.CylinderGeometry(0.22, 0.22, 0.27, 24).rotateZ(Math.PI / 2);
    const linG = new THREE.CylinderGeometry(0.42, 0.42, 0.2, 24).rotateZ(Math.PI / 2);
    const spokeG = new THREE.BoxGeometry(0.28, 0.04, 0.4);
    for (const [x, z, front] of [[TRACK, FRONT_Z, 1], [-TRACK, FRONT_Z, 1], [TRACK, REAR_Z, 0], [-TRACK, REAR_Z, 0]]) {
      const steer = new THREE.Group(); steer.position.set(x + Math.sign(x) * 0.05, WR, z);
      const spin = new THREE.Group(); steer.add(spin);
      const t = new THREE.Mesh(tireG, tireM); t.castShadow = true; spin.add(t); spin.add(new THREE.Mesh(rimG, chrome));
      spin.add(new THREE.Mesh(discG, discM));
      const cal = new THREE.Mesh(calG, calM); cal.position.set(0, 0.19, 0); steer.add(cal);
      for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(spokeG, dark); s.rotation.x = k * Math.PI * 2 / 5; s.position.x = Math.sign(x) * 0.14; spin.add(s); }
      const liner = new THREE.Mesh(linG, dark); liner.position.set(Math.sign(x) * -0.02, 0, 0); steer.add(liner);
      this.root.add(steer); this.wheels.push({ steer, spin, front });
    }
    this.lights = [];
    for (const x of [-0.65, 0.65]) {
      const s = new THREE.SpotLight(0xfff0d0, 0, 140, 0.5, 0.6, 1.2); s.position.set(x, 0.9, 2.2);
      const tg = new THREE.Object3D(); tg.position.set(x, 0.3, 30); this.body.add(s, tg); s.target = tg; this.lights.push(s);
    }
    scene.add(this.root);
    Object.assign(this, { x: 0, z: 6, h: Math.PI / 2, vx: 0, vz: 0, steer: 0, y: 0.04, pitch: 0, roll: 0, rpm: 900, gear: 0, speed: 0, kmh: 0, odo: 0, offroad: false, impact: 0, braking: false, label: "N", yawRate: 0, pd: 0, rd: 0 });
    this.root.rotation.order = "YXZ";
  }
  setNight(n) {
    this.lights.forEach(l => (l.intensity = n * 900)); this.head.emissiveIntensity = 0.15 + n * 2.5; this.tail.userData.n = 0.4 + n * 0.8;
  }
  reset() {
    const mx = ((this.x % 500) + 500) % 500, mz = ((this.z % 500) + 500) % 500;
    const dx = Math.min(mx, 500 - mx), dz = Math.min(mz, 500 - mz);
    const dirs = dx < dz ? [0, Math.PI] : [Math.PI / 2, -Math.PI / 2];
    if (dx < dz) this.x = Math.round(this.x / 500) * 500 + 3.5; else this.z = Math.round(this.z / 500) * 500 + 3.5;
    this.h = Math.abs(Math.atan2(Math.sin(dirs[0] - this.h), Math.cos(dirs[0] - this.h))) < Math.PI / 2 ? dirs[0] : dirs[1];
    this.vx = this.vz = 0; this.steer = 0;
  }
  step(dt, inp) {
    const fx = Math.sin(this.h), fz = Math.cos(this.h), sx = Math.cos(this.h), sz = -Math.sin(this.h);
    let vf = this.vx * fx + this.vz * fz, vl = this.vx * sx + this.vz * sz;
    const rd = roadDist(this.x, this.z); this.offroad = rd > 8 || false;
    const hf = height(this.x + fx * FRONT_Z, this.z + fz * FRONT_Z), hr = height(this.x + fx * REAR_Z, this.z + fz * REAR_Z);
    const hl = height(this.x + sx * TRACK, this.z + sz * TRACK), hrr = height(this.x - sx * TRACK, this.z - sz * TRACK);
    const slope = (hf - hr) / L;
    const tgt = inp.steer * 0.62 / (1 + Math.pow(Math.abs(vf) / 14, 1.5));
    this.steer += (tgt - this.steer) * Math.min(1, dt * 7);
    const sp = Math.abs(vf);
    this.yawRate = -vf * Math.tan(this.steer) / L * (inp.hand ? 1.35 : 1);
    this.h += this.yawRate * dt;
    // re-project velocity onto the new heading so sliding emerges naturally
    const nfx = Math.sin(this.h), nfz = Math.cos(this.h), nsx = Math.cos(this.h), nsz = -Math.sin(this.h);
    vf = this.vx * nfx + this.vz * nfz; vl = this.vx * nsx + this.vz * nsz;
    let af = 0; this.braking = false;
    if (inp.gas > 0 && vf > -0.5) af += inp.gas * 7.2 * (1 - Math.pow(Math.min(sp, 75) / 75, 1.6));
    else if (inp.gas > 0) af += 9;
    if (inp.brake > 0) {
      if (vf > 0.4) { af -= 9.5 * inp.brake; this.braking = true; } else if (vf > -9) af -= 3.6 * inp.brake * (vf > 0 ? 3 : 1);
      if (vf <= 0.4) this.braking = vf > 0.1;
    }
    if (inp.hand) af -= Math.sign(vf) * 3;
    af -= Math.sign(vf) * (inp.gas > 0 ? 0.2 : 1.6) + vf * Math.abs(vf) * 0.0006;
    if (this.offroad) af -= Math.sign(vf) * 1.6 + vf * 0.15;
    af -= 9.81 * slope;
    const vf0 = vf; vf += af * dt;
    if (!inp.gas && !inp.brake && vf0 * vf < 0) vf = 0;
    if (inp.brake > 0 && vf0 > 0 && vf < 0 && inp.gas === 0 && vf0 < 0.4) vf = 0;
    const mu = (this.offroad ? 0.6 : 1.05) * (inp.hand ? 0.45 : 1), grip = inp.hand ? 2.2 : this.offroad ? 5 : 9;
    vl += clamp(-vl * grip, -mu * 9.81, mu * 9.81) * dt;
    this.vx = nfx * vf + nsx * vl; this.vz = nfz * vf + nsz * vl;
    this.x += this.vx * dt; this.z += this.vz * dt;
    this.odo += Math.hypot(this.vx, this.vz) * dt;
    // collisions: two circles along the car
    this.impact = 0;
    for (const off of [1.45, -1.35, 0]) {
      const c = collide(this.x + nfx * off, this.z + nfz * off, off ? 0.95 : 0.9);
      if (c) {
        this.x += c.nx * c.pen; this.z += c.nz * c.pen;
        const vn = this.vx * c.nx + this.vz * c.nz;
        if (vn < 0) { this.vx -= 1.2 * vn * c.nx; this.vz -= 1.2 * vn * c.nz; this.vx *= 0.9; this.vz *= 0.9; this.impact = Math.max(this.impact, -vn); }
      }
    }
    this.speed = Math.hypot(this.vx, this.vz); this.kmh = this.speed * 3.6;
    // gears / rpm
    const fa = Math.abs(vf); let g = 0; while (g < 5 && fa > GEAR_MAX[g]) g++;
    const lo = g ? GEAR_MAX[g - 1] * 0.6 : 0, frac = clamp((fa - lo) / (GEAR_MAX[g] - lo), 0, 1);
    const trpm = Math.max(900 + frac * 6100, 900 + inp.gas * (g ? 0 : 2800));
    this.rpm += (trpm - this.rpm) * Math.min(1, dt * 10); this.gear = g;
    this.label = vf < -0.5 ? "R" : fa < 0.3 && !inp.gas ? "N" : String(g + 1);
    // pose
    const ty = (hf + hr + hl + hrr) / 4 + 0.04, tp = Math.atan2(hr - hf, L), tr = Math.atan2(hl - hrr, TRACK * 2);
    this.y += (ty - this.y) * Math.min(1, dt * 30); this.pitch += (tp - this.pitch) * Math.min(1, dt * 14); this.roll += (tr - this.roll) * Math.min(1, dt * 14);
    this.pd += (-af * 0.007 - this.pd) * Math.min(1, dt * 5); this.rd += (this.yawRate * vf * 0.0035 - this.rd) * Math.min(1, dt * 5);
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.set(this.pitch, this.h, this.roll);
    this.body.rotation.set(this.pd, 0, clamp(this.rd, -0.1, 0.1));
    for (const w of this.wheels) { w.spin.rotation.x += vf * dt / WR; if (w.front) w.steer.rotation.y = -this.steer; }
    this.tail.emissiveIntensity = this.braking || inp.brake > 0 ? 3 : this.tail.userData.n || 0.4;
  }
}
