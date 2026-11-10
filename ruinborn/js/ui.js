// Input glyphs (keyboard / Xbox / touch), spatial menu navigation, rumble.
const KB = { move: 'WASD', look: 'Mouse', fire: 'LMB', ads: 'RMB', reload: 'R', jump: 'Space', sprint: 'Shift', interact: 'E', craft: 'C', build: 'B', rotate: 'Q', place: 'LMB',
  cancel: 'RMB', eat: 'Q', drink: 'Z', meds: 'H', light: 'F', camera: 'V', mount: 'G', pause: 'Esc', photo: 'O', confirm: 'Enter', back: 'Esc', hud: 'P', switch: '1-9', up: 'Space', down: 'Ctrl' };
const PAD = { move: 'LS', look: 'RS', fire: 'RT', ads: 'LT', reload: 'Y', jump: 'A', sprint: 'LSC', interact: 'X', craft: 'DU', build: 'RB', rotate: 'LB', place: 'RT',
  cancel: 'B', eat: 'DL', drink: 'DR', meds: 'DLH', light: 'DD', camera: 'RSC', mount: 'B', pause: 'MENU', photo: 'VIEW', confirm: 'A', back: 'B', hud: 'VIEW', switch: 'LB', up: 'RB', down: 'LB' };
const TOUCH = { move: 'Stick', look: 'Drag', fire: 'FIRE', ads: 'AIM', reload: 'RLD', jump: 'JUMP', sprint: 'Push stick', interact: 'USE', craft: 'BAG', build: 'BUILD', rotate: '⟳', place: 'FIRE',
  cancel: 'BUILD', eat: 'EAT', drink: 'DRINK', meds: 'BAG', light: '☀', camera: 'CAM', mount: 'RIDE', pause: 'II', photo: 'II → Photo', confirm: 'Tap', back: 'Tap ✕', hud: '', switch: '⟳', up: 'JUMP', down: '' };
let mode = 'kb';
export const getMode = () => mode;
export function setMode(m) { if (m === mode) return false; mode = m; document.body.classList.remove('in-kb', 'in-pad', 'in-touch'); document.body.classList.add('in-' + m); return true; }
document.body.classList.add('in-kb');
const VIEW_SVG = '<svg viewBox="0 0 20 20" width="13" height="13"><rect x="2" y="3" width="10" height="8" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><rect x="8" y="9" width="10" height="8" rx="1.5" fill="currentColor"/></svg>';
const MENU_SVG = '<svg viewBox="0 0 20 20" width="13" height="13"><path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>';
const dpad = dir => `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" fill="#3a3f3a" stroke="#cfd8c8" stroke-width="1"/>${{ U: '<path d="M9 2h6v7H9z" fill="#e8ffe0"/>', D: '<path d="M9 15h6v7H9z" fill="#e8ffe0"/>', L: '<path d="M2 9h7v6H2z" fill="#e8ffe0"/>', R: '<path d="M15 9h7v6h-7z" fill="#e8ffe0"/>' }[dir]}</svg>`;
export function padGlyph(b) {
  switch (b) {
    case 'A': case 'B': case 'X': case 'Y': return `<span class="xb ${{ A: 'xa', B: 'xbB', X: 'xx', Y: 'xy' }[b]}">${b}</span>`;
    case 'LB': case 'RB': return `<span class="xb xbump">${b}</span>`;
    case 'LT': case 'RT': return `<span class="xb xtrig">${b}</span>`;
    case 'LS': case 'RS': return `<span class="xb xstick">${b[0]}</span>`;
    case 'LSC': case 'RSC': return `<span class="xb xstick press">${b[0]}</span>`;
    case 'VIEW': return `<span class="xb xsys">${VIEW_SVG}</span>`;
    case 'MENU': return `<span class="xb xsys">${MENU_SVG}</span>`;
    case 'DU': return `<span class="xb xdpad">${dpad('U')}</span>`; case 'DD': return `<span class="xb xdpad">${dpad('D')}</span>`;
    case 'DL': return `<span class="xb xdpad">${dpad('L')}</span>`; case 'DR': return `<span class="xb xdpad">${dpad('R')}</span>`;
    case 'DLH': return `<span class="xb xdpad">${dpad('L')}</span><small class="hold">hold</small>`;
  } return `<span class="xb">${b}</span>`;
}
export function G(action, m = mode) {
  if (m === 'pad') return padGlyph(PAD[action] || '?');
  if (m === 'touch') return `<span class="tg">${TOUCH[action] || action}</span>`;
  return `<kbd>${KB[action] || action}</kbd>`;
}
export const glyphLabel = (a, m = mode) => (m === 'pad' ? PAD : m === 'touch' ? TOUCH : KB)[a];

// ---------------- rumble
let rumbleOn = true; export const setRumble = v => rumbleOn = v;
export function rumble(pad, strong = 0.5, weak = 0.5, ms = 120) {
  if (!rumbleOn) return;
  try {
    const a = pad && (pad.vibrationActuator || (pad.hapticActuators && pad.hapticActuators[0]));
    if (a && a.playEffect) a.playEffect('dual-rumble', { startDelay: 0, duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) }).catch(() => {});
    else if (a && a.pulse) a.pulse(strong, ms);
    else if (!pad && navigator.vibrate && mode === 'touch') navigator.vibrate(Math.min(ms, 60));
  } catch (e) { }
}

// ---------------- spatial menu navigation with toxic-green focus
const SEL = 'button:not([disabled]), input, select, [data-nav]';
export class MenuNav {
  constructor() { this.root = null; this.cur = null; this.onBack = null; this.onMove = null; }
  setRoot(root, onBack, prefer) {
    this.root = root; this.onBack = onBack; this.clear();
    if (mode === 'pad' || prefer) this.focusFirst(prefer);
  }
  items() { if (!this.root) return []; return [...this.root.querySelectorAll(SEL)].filter(e => e.offsetParent !== null && !e.closest('.hidden') && !e.classList.contains('no-nav')); }
  clear() { document.querySelectorAll('.pad-focus').forEach(e => e.classList.remove('pad-focus')); this.cur = null; }
  focus(el) { if (!el) return; this.clear(); this.cur = el; el.classList.add('pad-focus'); el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); if (this.onMove) this.onMove(el); }
  focusFirst(prefer) { const it = this.items(); const p = prefer && this.root.querySelector(prefer); this.focus(p && p.offsetParent !== null ? p : it[0]); }
  ensure() { if (!this.cur || !this.cur.isConnected || this.cur.offsetParent === null || !this.root || !this.root.contains(this.cur)) this.focusFirst(); }
  move(dx, dy) {
    this.ensure(); const it = this.items(); if (!it.length) return;
    if (this.cur && this.cur.type === 'range' && dx) { const s = +this.cur.step || 0.1; this.cur.value = +this.cur.value + dx * s; this.cur.dispatchEvent(new Event('input')); return; }
    if (this.cur && this.cur.dataset.cycle !== undefined && dx) { this.cur.dispatchEvent(new CustomEvent('cycle', { detail: dx })); return; }
    const r0 = this.cur.getBoundingClientRect(), cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
    let best = null, bs = Infinity;
    for (const e of it) { if (e === this.cur) continue; const r = e.getBoundingClientRect(), x = r.left + r.width / 2 - cx, y = r.top + r.height / 2 - cy;
      const along = x * dx + y * dy; if (along <= 4) continue; const perp = Math.abs(dx ? y : x); const s = along + perp * 2.5; if (s < bs) { bs = s; best = e; } }
    if (!best) { // wrap vertically
      if (dy) { const sorted = it.slice().sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top); best = dy > 0 ? sorted[0] : sorted[sorted.length - 1]; }
    }
    if (best) this.focus(best);
  }
  activate() { this.ensure(); const e = this.cur; if (!e) return; if (e.type === 'checkbox') { e.checked = !e.checked; e.dispatchEvent(new Event('change')); } else if (e.type === 'range') { } else e.click(); }
  back() { if (this.onBack) this.onBack(); }
}
