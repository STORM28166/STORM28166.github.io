// On-screen touch controls for iPhone / iPad: floating move stick, drag-to-look, action buttons.
export function initTouch(root, T, onAction, isBuild) {
  root.innerHTML = `<div class="tz" id="tLeft"></div><div class="tz" id="tLook"></div>
  <div class="tstick hidden" id="tStick"><div class="tknob" id="tKnob"></div></div>`;
  const css = (el, o) => Object.assign(el.style, o);
  const S = 'env(safe-area-inset-right,0px)', B = 'env(safe-area-inset-bottom,0px)', TOP = 'env(safe-area-inset-top,0px)';
  const btn = (id, label, cls, pos) => { const b = document.createElement('div'); b.className = 'tbtn ' + (cls || ''); b.id = id; b.innerHTML = label; css(b, pos); root.appendChild(b); return b; };
  const fire = btn('tFire', 'FIRE', 'big', { right: `calc(28px + ${S})`, bottom: `calc(36px + ${B})` });
  const aim = btn('tAim', 'AIM', '', { right: `calc(138px + ${S})`, bottom: `calc(26px + ${B})` });
  const jump = btn('tJump', 'JUMP', '', { right: `calc(128px + ${S})`, bottom: `calc(108px + ${B})` });
  const use = btn('tUse', 'USE', '', { right: `calc(40px + ${S})`, bottom: `calc(146px + ${B})` });
  const rld = btn('tRld', 'RLD', '', { right: `calc(212px + ${S})`, bottom: `calc(60px + ${B})` });
  const row = [['tBag', 'BAG', 'craft'], ['tBuild', 'BUILD', 'build'], ['tRot', '⟳', 'rotate'], ['tEat', 'EAT', 'eat'], ['tDrink', 'DRINK', 'drink'], ['tLight', '☀', 'light'], ['tCam', 'CAM', 'camera'], ['tRide', 'RIDE', 'mount'], ['tPause', 'II', 'pause']];
  row.forEach(([id, l, a], i) => { const b = btn(id, l, 'sm', { top: `calc(12px + ${TOP})`, left: `calc(50% + ${(i - row.length / 2) * 54}px)` }); tap(b, () => onAction(a)); });
  function tap(el, fn) { el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); el.classList.add('on'); fn(); }); el.addEventListener('pointerup', () => el.classList.remove('on')); el.addEventListener('pointercancel', () => el.classList.remove('on')); }
  tap(use, () => onAction('interact')); tap(rld, () => onAction('reload'));
  tap(jump, () => { T.jump = true; setTimeout(() => T.jump = false, 180); });
  aim.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); T.ads = !T.ads; aim.classList.toggle('on', T.ads); });
  // FIRE: hold to shoot, drag while holding to keep aiming
  let fireId = null, fx = 0, fy = 0;
  fire.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fireId = e.pointerId; fx = e.clientX; fy = e.clientY; T.fire = true; fire.classList.add('on'); fire.setPointerCapture(e.pointerId); });
  fire.addEventListener('pointermove', e => { if (e.pointerId !== fireId) return; T.lookDX += (e.clientX - fx) * 0.8; T.lookDY += (e.clientY - fy) * 0.8; fx = e.clientX; fy = e.clientY; });
  const fireUp = e => { if (e.pointerId !== fireId) return; fireId = null; T.fire = false; fire.classList.remove('on'); };
  fire.addEventListener('pointerup', fireUp); fire.addEventListener('pointercancel', fireUp);
  // move stick (floating: appears where the thumb lands)
  const left = root.querySelector('#tLeft'), stick = root.querySelector('#tStick'), knob = root.querySelector('#tKnob');
  let sid = null, ox = 0, oy = 0; const R = 60;
  left.addEventListener('pointerdown', e => { e.preventDefault(); sid = e.pointerId; ox = e.clientX; oy = e.clientY; stick.classList.remove('hidden'); css(stick, { left: ox + 'px', top: oy + 'px' }); left.setPointerCapture(e.pointerId); });
  left.addEventListener('pointermove', e => { if (e.pointerId !== sid) return; let dx = e.clientX - ox, dy = e.clientY - oy; const L = Math.hypot(dx, dy);
    T.sprint = dy < -R * 1.2 && Math.abs(dx) < R; if (L > R) { dx *= R / L; dy *= R / L; } knob.style.transform = `translate(${dx}px,${dy}px)`; T.move.x = dx / R; T.move.y = dy / R; knob.style.background = T.sprint ? 'rgba(255,200,80,.6)' : ''; });
  const stUp = e => { if (e.pointerId !== sid) return; sid = null; T.move.x = T.move.y = 0; T.sprint = false; stick.classList.add('hidden'); knob.style.transform = ''; };
  left.addEventListener('pointerup', stUp); left.addEventListener('pointercancel', stUp);
  // drag-to-look anywhere on the right side
  const look = root.querySelector('#tLook'); const lk = new Map();
  look.addEventListener('pointerdown', e => { e.preventDefault(); lk.set(e.pointerId, [e.clientX, e.clientY]); look.setPointerCapture(e.pointerId); });
  look.addEventListener('pointermove', e => { const p = lk.get(e.pointerId); if (!p) return; T.lookDX += e.clientX - p[0]; T.lookDY += e.clientY - p[1]; p[0] = e.clientX; p[1] = e.clientY; });
  const lkUp = e => lk.delete(e.pointerId); look.addEventListener('pointerup', lkUp); look.addEventListener('pointercancel', lkUp);
  return { refresh() { root.querySelector('#tRot').style.opacity = isBuild() ? 1 : 0.35; fire.textContent = isBuild() ? 'PLACE' : 'FIRE'; aim.classList.toggle('on', T.ads); } };
}
