self.addEventListener('push', event => {
  const data = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'MT4 Report Viewer', {
      body: data.body ?? '',
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: data.tag ?? 'loss-alert',
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const win = list.find(w => w.focused) ?? list[0]
      return win ? win.focus() : clients.openWindow(event.notification.data?.url ?? '/')
    })
  )
})
