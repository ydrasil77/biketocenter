const CACHE = 'dark-velocity-v1'
const SHELL = [
  '/',
  '/manifest.json',
  '/phantom-bike.png',
  '/insert-coin.png',
  '/landing-bike.png',
  '/landing-bike2.png',
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(SHELL))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const { request } = event
  const url = new URL(request.url)

  // Never intercept socket.io or external requests
  if (!url.origin.startsWith(self.location.origin) || url.pathname.startsWith('/socket.io')) return

  // Network-first for navigation (always get fresh HTML)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/'))
    )
    return
  }

  // Cache-first for static assets
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(response => {
        if (!response || response.status !== 200) return response
        const clone = response.clone()
        caches.open(CACHE).then(cache => cache.put(request, clone))
        return response
      })
    })
  )
})
