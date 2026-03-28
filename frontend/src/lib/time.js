// Server-client clock offset (ms). Compensates for Docker VM clock drift.
// Updated on every API call from the server's Date header.
let serverOffset = 0

export function calibrateServerTime(serverDateStr) {
  if (!serverDateStr) return
  const serverMs = new Date(serverDateStr).getTime()
  if (isNaN(serverMs)) return
  serverOffset = serverMs - Date.now()
}

export function serverNow() {
  return new Date(Date.now() + serverOffset)
}

export function parseUTC(dateStr) {
  if (typeof dateStr === 'string' && !dateStr.endsWith('Z') && !/[+-]\d{2}:\d{2}$/.test(dateStr)) {
    return new Date(dateStr + 'Z')
  }
  return new Date(dateStr)
}

export function formatDistanceToNow(date) {
  const now = serverNow()
  const parsed = date instanceof Date ? date : parseUTC(date)
  const seconds = Math.floor((now - parsed) / 1000)

  if (seconds < 0) return 'now'
  if (seconds < 60) return 'now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  return `${weeks}w`
}

export function formatDate(date) {
  return parseUTC(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

export function formatTime(date) {
  return parseUTC(date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function isSameDay(date1, date2) {
  return date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
}
