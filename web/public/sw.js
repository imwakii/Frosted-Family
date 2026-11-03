// Shows the alerts server/notify.py sends. Handles nothing else: no fetch handler, so the app loads as it always has.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))

self.addEventListener('push', (e) => {
  const d = e.data ? e.data.json() : {}
  e.waitUntil(self.registration.showNotification(d.title || 'Frosted', { body: d.body, icon: '/app-icon-192.png', data: { url: d.url || '' } }))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const url = '/' + (e.notification.data?.url || '')
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((open) => {
    if (!open.length) return self.clients.openWindow(url)
    return open[0].focus().then((c) => c.navigate(url))
  }))
})
