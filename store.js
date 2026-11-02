// Prop Hunt store — currency only, local balance, simulated for now.
// Real Stripe Payment Links slot in later: fill STRIPE_LINKS after onboarding
// is finished, and the ?stripe_paid= handler below grants on return.
const PH_PACKS = [
  { price: 0.99, coins: 500 }, { price: 4.99, coins: 3000 },
  { price: 9.99, coins: 7000 }, { price: 24.99, coins: 20000 },
  { price: 49.99, coins: 45000 }, { price: 99.99, coins: 100000 },
];
const STRIPE_LINKS = {}; // e.g. { "0.99": "https://buy.stripe.com/..." } — empty until onboarding done
const PH_KEY = 'prophunt_store_v1';
function phLoad() { try { return JSON.parse(localStorage.getItem(PH_KEY)) || { balance: 0, customUsed: false }; } catch (e) { return { balance: 0, customUsed: false }; } }
function phSave(s) { localStorage.setItem(PH_KEY, JSON.stringify(s)); }
let phState = phLoad(), phBusy = false;
const fmt = n => n.toLocaleString('en-US');
function phRender() {
  document.getElementById('phBalance').textContent = fmt(phState.balance);
  const used = phState.customUsed;
  const cb = document.getElementById('phCustomBuy'); if (cb) { cb.disabled = used; cb.textContent = used ? 'USED' : 'BUY'; }
  document.getElementById('phCustomNote').textContent = used ? 'Custom 500x deal already used — one time only.' : 'One-time deal: use it once, then it is gone.';
  phCustomPreview();
}
function phCustomPreview() {
  const el = document.getElementById('phCustomAmt');
  const v = parseFloat(el.value || '0');
  document.getElementById('phCustomPreview').textContent =
    (!isNaN(v) && v >= 0.10) ? ('$' + v.toFixed(2) + '  →  ' + fmt(Math.round(v * 500)) + ' Prop Coins') : 'Enter $0.10 or more';
  document.getElementById('phCustomErr').textContent = '';
}
function phGrant(coins, label) {
  if (phBusy) return; phBusy = true;
  phState.balance += coins; phSave(phState);
  phRender(); phBusy = false;
  document.getElementById('phStatus').textContent = '+' + fmt(coins) + ' Prop Coins added. ' + label;
}
function phBuyPack(p) {
  if (!confirm('Buy ' + fmt(p.coins) + ' Prop Coins for $' + p.price.toFixed(2) + '?')) return;
  if (STRIPE_LINKS[String(p.price)]) { window.location.href = STRIPE_LINKS[String(p.price)]; return; }
  phGrant(p.coins, 'Simulated purchase — no real money charged yet.');
}
function phBuyCustom() {
  const v = parseFloat(document.getElementById('phCustomAmt').value || '0');
  if (isNaN(v) || v < 0.10) { document.getElementById('phCustomErr').textContent = 'Minimum $0.10.'; return; }
  if (v > 99.99) { document.getElementById('phCustomErr').textContent = 'Maximum $99.99 for a custom buy.'; return; }
  if (phState.customUsed) return;
  const coins = Math.round(v * 500);
  if (!confirm('Buy ' + fmt(coins) + ' Prop Coins for $' + v.toFixed(2) + ' (500x, one time)?')) return;
  phState.customUsed = true; phSave(phState);
  phGrant(coins, 'Custom 500x deal used — one time only.');
}
// Grant on Stripe return: ?stripe_paid=<coins> — once per session key, spoofable by design (quick route).
(function phReturnGrant() {
  const q = new URLSearchParams(location.search);
  const paid = q.get('stripe_paid');
  if (!paid) return;
  const key = 'ph_claimed_' + paid;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  const coins = parseInt(paid, 10);
  if (coins > 0) { phState.balance += coins; if (q.get('custom') === '1') phState.customUsed = true; phSave(phState); }
})();
document.addEventListener('DOMContentLoaded', () => {
  const on = (id, fn) => { const e = document.getElementById(id); if (e) e.addEventListener('click', fn); };
  on('btnStore', () => { document.getElementById('phStore').classList.add('show'); phRender(); });
  on('phClose', () => document.getElementById('phStore').classList.remove('show'));
  on('phBack', () => document.getElementById('phStore').classList.remove('show'));
  document.getElementById('phCustomAmt').addEventListener('input', phCustomPreview);
  document.getElementById('phMinus').addEventListener('click', () => { const e = document.getElementById('phCustomAmt'); e.value = Math.max(0.10, (parseFloat(e.value || '0') - 0.10)).toFixed(2); phCustomPreview(); });
  document.getElementById('phPlus').addEventListener('click', () => { const e = document.getElementById('phCustomAmt'); e.value = Math.min(99.99, (parseFloat(e.value || '0') + 0.10)).toFixed(2); phCustomPreview(); });
  document.getElementById('phCustomBuy').addEventListener('click', phBuyCustom);
  document.querySelectorAll('[data-pack]').forEach(b => b.addEventListener('click', () => phBuyPack(PH_PACKS[+b.dataset.pack])));
  phRender();
});
