const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return null
  try {
    return await navigator.serviceWorker.register('/sw.js')
  } catch {
    return null
  }
}

export async function requestAndSubscribe(registration) {
  if (!registration || !VAPID_PUBLIC_KEY) return null
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return null
  try {
    const existing = await registration.pushManager.getSubscription()
    if (existing) return existing
    return await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  } catch (e) {
    console.warn('Push subscription failed:', e)
    return null
  }
}

export async function unsubscribeFromPush(registration) {
  if (!registration) return null
  const sub = await registration.pushManager.getSubscription()
  if (!sub) return null
  await sub.unsubscribe()
  return sub.endpoint
}

export function getNotificationPermission() {
  if (!('Notification' in window) || !('serviceWorker' in navigator) || location.protocol === 'file:') {
    return 'unsupported'
  }
  return Notification.permission
}
