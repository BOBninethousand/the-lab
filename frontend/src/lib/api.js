const BASE = ''

export async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    ...options,
  })

  if (!res.ok) {
    throw new Error(`API error: ${res.status}`)
  }

  return res.json()
}

export async function getAgents() {
  return api('/api/agents')
}

export async function getSchedule() {
  return api('/api/schedule')
}

export async function getCrews() {
  return api('/api/crews')
}

export async function getCrew(id) {
  return api(`/api/crews/${id}`)
}

export async function createAgent(data) {
  return api('/api/agents', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function deleteAgent(id) {
  return api(`/api/agents/${id}`, {
    method: 'DELETE'
  })
}

export async function createCrew(data) {
  return api('/api/crews', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function createSchedule(data) {
  return api('/api/schedule', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function updateSchedule(id, data) {
  return api(`/api/schedule/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  })
}

export async function runSchedule(id) {
  return api(`/api/schedule/${id}/run`, {
    method: 'POST'
  })
}

export async function getMemories() {
  return api('/api/memory')
}

export async function getDocuments() {
  return api('/api/documents')
}

export async function getActivity() {
  // Activity is derived from WebSocket events on the frontend
  // No dedicated backend endpoint needed — return empty array
  return []
}

export async function getJournals() {
  return api('/api/memory/journals')
}

export async function createJournal(data) {
  return api('/api/memory/journals', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function createMemory(data) {
  return api('/api/memory', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function createDocument(data) {
  return api('/api/documents', {
    method: 'POST',
    body: JSON.stringify(data)
  })
}

export async function sendChat(agentId, message) {
  return api('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ agent_id: agentId, message })
  })
}

export async function getChatHistory(agentId) {
  return api(`/api/chat/${agentId}/history`)
}

export async function getCalendar(days = 30) {
  return api(`/api/calendar?days=${days}`)
}

export async function deleteSchedule(id) {
  return api(`/api/schedule/${id}`, { method: 'DELETE' })
}

export async function getTasks() {
  return api('/api/tasks')
}

// Cost tracking
export async function getCostSummary(days = 30) {
  return api(`/api/costs/summary?days=${days}`)
}

export async function getCostRecent(limit = 50) {
  return api(`/api/costs/recent?limit=${limit}`)
}

export async function getCostScorecard(days = 7) {
  return api(`/api/costs/scorecard?days=${days}`)
}

export async function getCostToday() {
  return api('/api/costs/today')
}

// Settings
export async function getSettings() {
  return api('/api/settings')
}

export async function updateBudget(dailyBudget) {
  return api('/api/settings/budget', {
    method: 'POST',
    body: JSON.stringify({ daily_budget_usd: dailyBudget })
  })
}
