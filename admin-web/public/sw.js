// Network-only: never cache private student records, credentials or API responses.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => new Response('Please reconnect to the internet to open My School ID Card.', {status:503, headers:{'Content-Type':'text/plain; charset=utf-8'}})));
  }
});
