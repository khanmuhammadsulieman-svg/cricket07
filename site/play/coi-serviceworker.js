/* Cross-Origin Isolation Service Worker fallback for /play/.
 * When the host already serves COOP/COEP headers (Vercel, Netlify, server.mjs),
 * window.crossOriginIsolated is already true and this script is a no-op.
 * If a CDN or static host omits COOP/COEP headers, this worker injects them
 * on same-origin responses and reloads once to enable SharedArrayBuffer/WASM threads.
 */
if (typeof window === 'undefined') {
  self.addEventListener('install', () => self.skipWaiting());
  self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
  self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.cache === 'only-if-cached' && req.mode !== 'same-origin') return;
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.status === 0 || res.type === 'opaque') return res;
          const headers = new Headers(res.headers);
          headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
          headers.set('Cross-Origin-Opener-Policy', 'same-origin');
          if (!headers.has('Cross-Origin-Resource-Policy')) {
            headers.set('Cross-Origin-Resource-Policy', 'same-origin');
          }
          return new Response(res.body, {
            status: res.status,
            statusText: res.statusText,
            headers,
          });
        })
        .catch((err) => {
          throw err;
        }),
    );
  });
} else {
  (() => {
    if (window.crossOriginIsolated) {
      try { sessionStorage.removeItem('c07_coi_reloaded'); } catch {}
      return;
    }
    // Embedded iframes cannot gain crossOriginIsolated via a service worker.
    if (window.self !== window.top) return;
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return;

    let alreadyReloaded = false;
    try { alreadyReloaded = sessionStorage.getItem('c07_coi_reloaded') === '1'; } catch {}
    if (alreadyReloaded) return;

    window.__c07CoiReloading = true;
    const swUrl = new URL('coi-serviceworker.js', window.location.href).href;

    const triggerReload = () => {
      try { sessionStorage.setItem('c07_coi_reloaded', '1'); } catch {}
      window.location.reload();
    };

    navigator.serviceWorker
      .register(swUrl)
      .then((reg) => {
        if (reg.active && !navigator.serviceWorker.controller) {
          triggerReload();
          return;
        }
        const worker = reg.installing || reg.waiting;
        if (worker) {
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') triggerReload();
          });
        } else {
          window.__c07CoiReloading = false;
        }
      })
      .catch(() => {
        window.__c07CoiReloading = false;
      });
  })();
}
