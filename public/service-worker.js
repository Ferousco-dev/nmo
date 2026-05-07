// Empty service worker. If a browser has an old SW registered for this
// origin (from a previous build or another local app on this port),
// loading this file lets it self-unregister.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    self.registration.unregister().then(() => self.clients.matchAll())
      .then((clients) => clients.forEach((c) => c.navigate(c.url)))
  );
});
