// Keyboard + touch controls. Everything reads/writes the one `input` object.
import { S } from "./settings.js";
export const input = { steer: 0, gas: 0, brake: 0, hand: 0, cam: () => {}, reset: () => {}, menu: () => {} };
const keys = new Set(), touch = { steer: 0, gas: 0, brake: 0, hand: 0 };
let keySteer = 0, btnSteer = 0;
// STEERING SIGN (v2 fix, Nov 2 2026 — verified against the chase cam, see report):
// car.js turns +steer toward screen-RIGHT (yawRate = -vf*tan(steer)/L, camera behind
// at -forward). The old mapping sent LEFT -> +1, i.e. left turned right on screen.
// Fixed here, in the input layer only: RIGHT = +1, LEFT = -1. car.js is untouched,
// so its handling/takeoff feel is byte-identical; only the direction mapping changed.
export function setBtnSteer(v) { btnSteer = v; }

export function isTouchDevice() {
  try {
    if (!(("ontouchstart" in window) || (navigator.maxTouchPoints || 0) > 0)) return false;
    return !(window.matchMedia && matchMedia("(any-pointer: fine)").matches);
  } catch (e) { return false; }
}
export function showTouch(on) { document.body.classList.toggle("touch", on); }

addEventListener("keydown", e => {
  if (e.repeat) return;
  const k = e.code; keys.add(k);
  if (k === "KeyC") input.cam(); else if (k === "KeyR") input.reset(); else if (k === "Escape") input.menu();
  if (k === "Space" || k.startsWith("Arrow")) e.preventDefault();
});
addEventListener("keyup", e => keys.delete(e.code));
addEventListener("blur", () => keys.clear());

export function updateInput(dt) {
  const L = keys.has("KeyA") || keys.has("ArrowLeft"), R = keys.has("KeyD") || keys.has("ArrowRight");
  const target = (R ? 1 : 0) - (L ? 1 : 0);
  keySteer += (target - keySteer) * Math.min(1, dt * (target ? 5 : 9));
  const raw = Math.abs(touch.steer) > 0.02 ? touch.steer : (btnSteer || keySteer);
  const sens = (S.sens || 100) / 100;
  input.steer = Math.max(-1, Math.min(1, raw * sens)) * (S.invert ? -1 : 1);
  input.gas = Math.max(touch.gas, keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0);
  input.brake = Math.max(touch.brake, keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
  input.hand = touch.hand || keys.has("Space") ? 1 : 0;
}

function hold(id, key) {
  const el = document.getElementById(id), ids = new Set();
  const set = () => { touch[key] = ids.size ? 1 : 0; el.classList.toggle("on", !!ids.size); };
  el.addEventListener("pointerdown", e => { e.preventDefault(); el.setPointerCapture(e.pointerId); ids.add(e.pointerId); set(); if (navigator.vibrate) navigator.vibrate(8); });
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(t, e => { ids.delete(e.pointerId); set(); });
}
hold("bGas", "gas"); hold("bBrake", "brake"); hold("bHand", "hand");
document.getElementById("bReset").addEventListener("pointerdown", e => { e.preventDefault(); input.reset(); });

const pad = document.getElementById("steer"), knob = document.getElementById("knob");
function padMove(e) {
  const r = pad.getBoundingClientRect(), half = r.width / 2 - 40;
  const v = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / half));
  touch.steer = v; knob.style.transform = `translateX(${v * half}px)`; // drag RIGHT = +1 = right turn (sign fix)
}
pad.addEventListener("pointerdown", e => { e.preventDefault(); pad.setPointerCapture(e.pointerId); padMove(e); });
pad.addEventListener("pointermove", e => { if (pad.hasPointerCapture(e.pointerId)) padMove(e); });
for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) pad.addEventListener(t, () => { touch.steer = 0; knob.style.transform = ""; });

// Arrow-button steering (v2 host): hold left = -1, hold right = +1 (sign-fixed).
export function bindSteerButton(id, dir) {
  const el = document.getElementById(id); if (!el) return;
  const on = e => { e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (err) {} setBtnSteer(dir); el.classList.add("on"); if (navigator.vibrate) navigator.vibrate(8); };
  const off = () => { setBtnSteer(0); el.classList.remove("on"); };
  el.addEventListener("pointerdown", on);
  for (const t of ["pointerup", "pointercancel", "lostpointercapture"]) el.addEventListener(t, off);
}
bindSteerButton("bLeft", -1); bindSteerButton("bRight", 1);
