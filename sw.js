// Service worker do Estúdio Genesis: só recebe notificações (Web Push) e abre o app no lugar certo.
// Não guarda cache da página (assim o site publicado aparece sempre na versão nova).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: 'Estúdio Genesis', texto: e.data?.text() || '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Estúdio Genesis', {
    body: d.texto || '',
    tag: d.tag || 'estudio',
    renotify: true,
    icon: 'icones/icone-180.png',
    badge: 'icones/icone-180.png',
    data: { url: d.url || './' },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const alvo = new URL(e.notification.data?.url || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const abertas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of abertas) {
      if (c.url.startsWith(self.registration.scope)) { await c.focus(); c.postMessage({ abrir: alvo }); return; }
    }
    await self.clients.openWindow(alvo);
  })());
});
