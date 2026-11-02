// Prop Hunt STORE v3 — REAL money via Stripe Payment Links. No simulation.
// Existing variables (do not hardcode elsewhere): PH_PACKS, CUSTOM_RATE,
// CUSTOM_MIN, CUSTOM_MAX. Credits are added exactly once per Stripe return.
const PH_PACKS = [
  { price: 0.99, coins: 500 }, { price: 4.99, coins: 3000 },
  { price: 9.99, coins: 7000 }, { price: 24.99, coins: 20000 },
  { price: 49.99, coins: 45000 }, { price: 99.99, coins: 100000 },
];
const CUSTOM_RATE = 500; // Prop Coins per $1, custom amount only
const CUSTOM_MIN = 0.10, CUSTOM_MAX = 99.99;
const RESET_ONE_TIME = false; // set true to re-test the one-time offer, then set back to false
const MOST_POPULAR_INDEX = 2; // $9.99 pack
const BEST_VALUE_INDEX = 5;   // $99.99 pack
// Fill these in after creating the links in the Stripe Dashboard.
// Packs: after_completion redirect must be https://storm28166.github.io/?stripe_paid=<coins>
// Custom: "Customers choose what to pay" link, min $0.10 max $99.99,
//   redirect https://storm28166.github.io/?stripe_custom=1
const STRIPE_LINKS = {}; // e.g. { "0.99": "https://buy.stripe.com/..." }
const CUSTOM_STRIPE_LINK = '';
const PH_KEY = 'prophunt_store_v1';
const fmt = n => Math.round(n).toLocaleString('en-US');
const money = v => '$' + v.toFixed(2);
function phLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(PH_KEY)) || { balance: 0, customUsed: false };
    if (RESET_ONE_TIME) { s.customUsed = false; localStorage.setItem(PH_KEY, JSON.stringify(s)); }
    return s;
  } catch (e) { return { balance: 0, customUsed: false }; }
}
function phSave(s) { localStorage.setItem(PH_KEY, JSON.stringify(s)); }
let phState = phLoad();
function phSoundOK() {
  try { const s = JSON.parse(localStorage.getItem('prophunt.settings') || '{}'); return s.music !== false; } catch (e) { return true; }
}
function phChime() {
  if (!phSoundOK()) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = new AC(), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 880; g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}
function phCoinSVG(tier) {
  const g = '<defs><linearGradient id="phGold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd97a"/><stop offset="1" stop-color="#e09a1f"/></linearGradient></defs>';
  const c = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="url(#phGold)" stroke="#7a5200" stroke-width="1.5"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="13" font-weight="800" fill="#1a1200">P</text>`;
  if (tier === 0) return `<svg class="ph-coin-svg" viewBox="0 0 60 48">${g}${c(30, 24, 18)}</svg>`;
  if (tier === 1) return `<svg class="ph-coin-svg" viewBox="0 0 60 48">${g}${c(22, 28, 14)}${c(38, 22, 14)}</svg>`;
  if (tier === 2) return `<svg class="ph-coin-svg" viewBox="0 0 60 48">${g}${c(18, 30, 12)}${c(30, 24, 12)}${c(42, 30, 12)}${c(24, 16, 12)}${c(36, 16, 12)}</svg>`;
  if (tier === 3) return `<svg class="ph-coin-svg" viewBox="0 0 60 48">${g}<path d="M22 10 L38 10 L44 26 Q44 40 30 40 Q16 40 16 26 Z" fill="url(#phGold)" stroke="#7a5200" stroke-width="1.5"/><path d="M24 10 Q30 2 36 10" fill="none" stroke="#7a5200" stroke-width="2"/></svg>`;
  if (tier === 4) return `<svg class="ph-coin-svg" viewBox="0 0 60 48">${g}<rect x="12" y="18" width="36" height="22" rx="3" fill="url(#phGold)" stroke="#7a5200" stroke-width="1.5"/><path d="M12 18 Q30 4 48 18 Z" fill="url(#phGold)" stroke="#7a5200" stroke-width="1.5"/><rect x="26" y="26" width="8" height="8" rx="1" fill="#7a5200"/></svg>`;
  return `<svg class="ph-coin-svg" viewBox="0 0 60 48">${g}<rect x="10" y="8" width="40" height="32" rx="4" fill="url(#phGold)" stroke="#7a5200" stroke-width="1.5"/><circle cx="30" cy="24" r="9" fill="none" stroke="#7a5200" stroke-width="2.5"/><circle cx="30" cy="24" r="2.5" fill="#7a5200"/></svg>`;
}
function phRenderPacks() {
  const grid = document.getElementById('phPacksGrid'); if (!grid) return;
  const base = PH_PACKS[0].coins / PH_PACKS[0].price;
  grid.innerHTML = '';
  PH_PACKS.forEach((p, i) => {
    const bonus = (p.coins / p.price / base - 1) * 100;
    const card = document.createElement('div');
    card.className = 'ph-card' + (i === MOST_POPULAR_INDEX ? ' popular' : '') + (i === BEST_VALUE_INDEX ? ' best' : '');
    card.innerHTML = (i === MOST_POPULAR_INDEX ? '<span class="ph-ribbon">MOST POPULAR</span>' : '') +
      (i === BEST_VALUE_INDEX ? '<span class="ph-ribbon">BEST VALUE</span>' : '') +
      phCoinSVG(i) + `<div class="ph-amount">${fmt(p.coins)}</div><div class="ph-unit">Prop Coins</div>` +
      `<div class="ph-tag">${bonus > 0.5 ? '+' + Math.round(bonus) + '% more' : ''}</div>` +
      `<button class="ph-price-btn" data-pack="${i}">${money(p.price)}</button>`;
    grid.appendChild(card);
  });
  grid.querySelectorAll('[data-pack]').forEach(b => b.addEventListener('click', () => phBuyPack(PH_PACKS[+b.dataset.pack])));
}
function phRenderBalance(pulse) {
  const b = document.getElementById('phBalance'); if (b) b.textContent = fmt(phState.balance);
  if (pulse) { const pill = document.querySelector('.ph-balance'); if (pill) { pill.classList.remove('pulse'); void pill.offsetWidth; pill.classList.add('pulse'); } }
}
function phRenderCustom() {
  const rl = document.getElementById('phCustomRateLine');
  if (rl) rl.textContent = 'Pick any amount from ' + money(CUSTOM_MIN) + '. You get ' + CUSTOM_RATE + ' Prop Coins for every $1. Available once per account.';
  const used = phState.customUsed;
  const wrap = document.getElementById('phCustomCard'); if (wrap) wrap.classList.toggle('locked', used);
  ['phMinus', 'phPlus', 'phCustomAmt', 'phCustomBuy'].forEach(id => { const e = document.getElementById(id); if (e) e.disabled = used; });
  document.querySelectorAll('.ph-chip').forEach(c => c.disabled = used);
  const buy = document.getElementById('phCustomBuy');
  if (buy && used) buy.textContent = 'USED';
  const usedEl = document.getElementById('phUsedMsg');
  if (usedEl) usedEl.style.display = used ? 'flex' : 'none';
  phCustomPreview();
}
let phTweenRAF = null, phDisplayedCoins = 0, phFirstPreview = true;
function phCustomPreview() {
  const el = document.getElementById('phCustomAmt'); if (!el) return 0;
  const v = parseFloat(el.value || '0');
  const err = document.getElementById('phCustomErr');
  const buy = document.getElementById('phCustomBuy');
  if (isNaN(v) || v < CUSTOM_MIN) { if (err) err.textContent = 'Minimum ' + money(CUSTOM_MIN) + '.'; if (buy && !phState.customUsed) buy.disabled = true; return 0; }
  if (v > CUSTOM_MAX) { if (err) err.textContent = 'Maximum ' + money(CUSTOM_MAX) + ' for a custom buy.'; if (buy && !phState.customUsed) buy.disabled = true; return 0; }
  if (err) err.textContent = '';
  if (buy && !phState.customUsed) { buy.disabled = false; buy.textContent = 'Pay ' + money(v); }
  const target = Math.round(v * CUSTOM_RATE);
  const res = document.getElementById('phCustomResult'); if (!res) return target;
  if (phFirstPreview) { phFirstPreview = false; phDisplayedCoins = target; res.textContent = money(v) + ' = ' + fmt(target) + ' Prop Coins'; return target; }
  if (phTweenRAF) cancelAnimationFrame(phTweenRAF);
  const start = phDisplayedCoins, t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / 200);
    const cur = Math.round(start + (target - start) * k);
    res.textContent = money(v) + ' = ' + fmt(cur) + ' Prop Coins';
    phDisplayedCoins = cur;
    if (k < 1) phTweenRAF = requestAnimationFrame(step);
  };
  phTweenRAF = requestAnimationFrame(step);
  return target;
}
function phSetStatus(t) { const e = document.getElementById('phStatus'); if (e) e.textContent = t || ''; }
function phBuyPack(p) {
  const url = STRIPE_LINKS[String(p.price)];
  if (!url) { phSetStatus('Real checkout link for ' + money(p.price) + ' is not set yet — create it in the Stripe Dashboard and send me the URL.'); return; }
  window.location.href = url; // Stripe checkout; return grants via ?stripe_paid=
}
function phBuyCustom() {
  if (phState.customUsed) return;
  const v = parseFloat(document.getElementById('phCustomAmt').value || '0');
  if (isNaN(v) || v < CUSTOM_MIN || v > CUSTOM_MAX) { phCustomPreview(); return; }
  if (!CUSTOM_STRIPE_LINK) { phSetStatus('Real checkout link for custom amounts is not set yet — create a "Customers choose what to pay" link in Stripe and send me the URL.'); return; }
  // Store the game-side amount so the return can grant it. Enter the SAME amount on Stripe.
  try { localStorage.setItem('prophunt_store_pending_custom', JSON.stringify({ coins: Math.round(v * CUSTOM_RATE), amount: v, at: Date.now() })); } catch (e) {}
  window.location.href = CUSTOM_STRIPE_LINK;
}
function phCountUp(oldBal, newBal) {
  const b = document.getElementById('phBalance'); if (!b) return;
  const t0 = performance.now();
  const step = t => {
    const k = Math.min(1, (t - t0) / 800);
    b.textContent = fmt(Math.round(oldBal + (newBal - oldBal) * k));
    if (k < 1) requestAnimationFrame(step); else phRenderBalance(true);
  };
  requestAnimationFrame(step);
}
function phReturnGrant() {
  const q = new URLSearchParams(location.search);
  const paid = q.get('stripe_paid'), isCustom = q.get('stripe_custom') === '1';
  if (!paid && !isCustom) return;
  const key = 'ph_claimed_' + (paid || 'custom') + '_' + (q.get('session_id') || '1');
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  let coins = 0, custom = false;
  if (paid) { coins = parseInt(paid, 10); }
  if (isCustom) {
    try { const pend = JSON.parse(localStorage.getItem('prophunt_store_pending_custom') || 'null'); if (pend) { coins = pend.coins; custom = true; localStorage.removeItem('prophunt_store_pending_custom'); } } catch (e) {}
  }
  if (!coins || coins <= 0) return;
  const oldBal = phState.balance;
  phState.balance += coins; if (custom) phState.customUsed = true; phSave(phState);
  const s = document.getElementById('phSuccess');
  if (s) { s.innerHTML = '<span style="color:var(--ph-green);font-size:20px">✓</span><span>Payment complete — +' + fmt(coins) + ' Prop Coins added</span>'; s.classList.add('show'); }
  history.replaceState(null, '', location.pathname);
  phCountUp(oldBal, phState.balance); phChime(); phRenderCustom();
}
document.addEventListener('DOMContentLoaded', () => {
  phRenderPacks(); phRenderBalance(false); phRenderCustom(); phReturnGrant();
  const on = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('click', fn); };
  on('btnStore', () => { const s = document.getElementById('phStore'); if (s) { s.classList.add('show'); phRenderBalance(false); phRenderCustom(); } });
  on('phClose', () => { const s = document.getElementById('phStore'); if (s) s.classList.remove('show'); });
  const amt = document.getElementById('phCustomAmt');
  if (amt) amt.addEventListener('input', () => { amt.value = amt.value.replace(/[^0-9.]/g, ''); phCustomPreview(); });
  on('phMinus', () => { if (!amt) return; amt.value = Math.max(CUSTOM_MIN, (parseFloat(amt.value || '0') - 0.10)).toFixed(2); phCustomPreview(); });
  on('phPlus', () => { if (!amt) return; amt.value = Math.min(CUSTOM_MAX, (parseFloat(amt.value || '0') + 0.10)).toFixed(2); phCustomPreview(); });
  document.querySelectorAll('.ph-chip').forEach(c => c.addEventListener('click', () => { if (!amt) return; amt.value = parseFloat(c.dataset.chip).toFixed(2); phCustomPreview(); }));
  on('phCustomBuy', phBuyCustom);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { const s = document.getElementById('phStore'); if (s) s.classList.remove('show'); } });
});
