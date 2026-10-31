// Prop Hunt service worker: offline packs in Cache Storage. Built into the site root by tools/build-site.mjs
// (3fe25d9b85 = hash of packs.json). One cache 'ph-files' holds every downloaded file under its URL; the
// manifest (packs.json, never cached by the browser) carries a content hash per file. Freshness rules:
//  - navigations are network-first (cached index.html only when offline)
//  - on every navigation and on activate the SW reconciles: any cached file whose hash no longer matches the
//    live manifest, or that left the manifest, is deleted before the page can ask for it (no stale assets)
//  - everything else is cache-first, falling back to the network (so non-downloaded files stream normally)
const VERSION = '__VERSION__', CACHE = 'ph-files', META = 'ph-meta';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE && k !== META) await caches.delete(k);
  await reconcile().catch(() => {});
  await self.clients.claim();
})()));
async function reconcile() {
  const r = await fetch('packs.json', { cache: 'no-store' }); if (!r.ok) return;
  const man = await r.json(), want = new Map();
  for (const p of man.packs) for (const f of p.files) want.set(new URL(f.u, self.registration.scope).href, f.h);
  const meta = await caches.open(META), mr = await meta.match('hashes'), have = mr ? await mr.json() : {};
  const c = await caches.open(CACHE); let n = 0;
  for (const req of await c.keys()) { if (want.get(req.url) !== have[req.url]) { await c.delete(req); delete have[req.url]; n++; } }
  await meta.put('hashes', new Response(JSON.stringify(have)));
  await meta.put('manifest', new Response(JSON.stringify(man)));
  return n;
}
let lastRec = 0;
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  if (url.pathname.endsWith('/packs.json') || url.pathname.endsWith('/sw.js')) return; // always live
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      if (Date.now() - lastRec > 5000) { lastRec = Date.now(); await Promise.race([reconcile().catch(() => {}), new Promise(r => setTimeout(r, 2500))]); }
      try { return await fetch(req); }
      catch (err) { const c = await caches.open(CACHE); return (await c.match(new URL('index.html', self.registration.scope).href)) || (await c.match(req, { ignoreSearch: true })) || Response.error(); }
    })());
    return;
  }
  e.respondWith((async () => {
    const c = await caches.open(CACHE), hit = await c.match(req, { ignoreSearch: true });
    if (hit) return hit;
    return fetch(req);
  })());
});
self.addEventListener('message', e => { if (e.data === 'reconcile') e.waitUntil(reconcile().then(n => e.source && e.source.postMessage({ reconciled: n }))); });
