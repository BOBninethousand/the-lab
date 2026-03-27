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

export async function createScheduleSimple(data) {
  return api('/api/schedule/simple', { method: 'POST', body: JSON.stringify(data) })
}

export async function getJobExecutions(jobId, limit = 20) {
  return api(`/api/schedule/${jobId}/executions?limit=${limit}`)
}

export async function getJobExecution(jobId, execId) {
  return api(`/api/schedule/${jobId}/executions/${execId}`)
}

export async function submitJobFeedback(jobId, execId, data) {
  return api(`/api/schedule/${jobId}/executions/${execId}/feedback`, {
    method: 'POST', body: JSON.stringify(data)
  })
}

export async function previewCron(params) {
  const query = new URLSearchParams(params).toString()
  return api(`/api/schedule/cron-preview?${query}`)
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

// Reports
export async function getReports(params = {}) {
  const query = new URLSearchParams(params).toString()
  return api(`/api/reports?${query}`)
}

export async function getReport(id) {
  return api(`/api/reports/${id}`)
}

export async function createReport(data) {
  return api('/api/reports', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateReport(id, data) {
  return api(`/api/reports/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteReport(id) {
  return api(`/api/reports/${id}`, { method: 'DELETE' })
}

export async function getReportStats() {
  return api('/api/reports/stats')
}

export async function generateReport(data) {
  return api('/api/reports/generate', { method: 'POST', body: JSON.stringify(data) })
}

export async function publishReportToNotion(reportId) {
  return api(`/api/reports/${reportId}/publish`, { method: 'POST' })
}

// Knowledge Base
export async function getKnowledge(params = {}) {
  const query = new URLSearchParams(params).toString()
  return api(`/api/knowledge?${query}`)
}

export async function createKnowledge(data) {
  return api('/api/knowledge', { method: 'POST', body: JSON.stringify(data) })
}

export async function updateKnowledge(id, data) {
  return api(`/api/knowledge/${id}`, { method: 'PUT', body: JSON.stringify(data) })
}

export async function deleteKnowledge(id) {
  return api(`/api/knowledge/${id}`, { method: 'DELETE' })
}

export async function searchKnowledge(query) {
  return api(`/api/knowledge/search?q=${encodeURIComponent(query)}`)
}

export async function bulkImportKnowledge(entries) {
  return api('/api/knowledge/bulk', { method: 'POST', body: JSON.stringify(entries) })
}

// Agent Memories
export async function getAgentMemories(agentId) {
  return api(`/api/agents/${agentId}/memories`)
}

export async function searchAgentMemories(agentId, query) {
  return api(`/api/agents/${agentId}/memories/search?q=${encodeURIComponent(query)}`)
}

export async function deleteAgentMemory(agentId, memoryId) {
  return api(`/api/agents/${agentId}/memories/${memoryId}`, { method: 'DELETE' })
}

// Corrections
export async function createCorrection(data) {
  return api('/api/corrections', { method: 'POST', body: JSON.stringify(data) })
}

export async function getCorrections(agentId) {
  return api(`/api/corrections/${agentId}`)
}

export async function getCorrectionRules(agentId) {
  return api(`/api/corrections/${agentId}/rules`)
}

// Memory Stats
export async function getMemoryStats() {
  return api('/api/memory/stats')
}

// Notion Integration
export async function getNotionStatus() {
  return api('/api/notion/status')
}

export async function syncNotion() {
  return api('/api/notion/sync', { method: 'POST' })
}

export async function getNotionTasks() {
  return api('/api/notion/tasks')
}

export async function runNotionTask(pageId, agentId) {
  return api(`/api/notion/tasks/${pageId}/run`, {
    method: 'POST', body: JSON.stringify({ agent_id: agentId })
  })
}

export async function pushNotionResult(pageId, result, agentName) {
  return api('/api/notion/push-result', {
    method: 'POST', body: JSON.stringify({ page_id: pageId, result, agent_name: agentName })
  })
}

export async function syncNotionKnowledge(pageId) {
  return api('/api/notion/sync-knowledge', {
    method: 'POST', body: JSON.stringify({ page_id: pageId })
  })
}

// Strategies
export async function getStrategies() {
  return api('/api/strategies')
}

export async function createStrategy(data) {
  return api('/api/strategies', { method: 'POST', body: JSON.stringify(data) })
}

export async function getStrategy(id) {
  return api(`/api/strategies/${id}`)
}

export async function updateStrategy(id, data) {
  return api(`/api/strategies/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
}

export async function deleteStrategy(id) {
  return api(`/api/strategies/${id}`, { method: 'DELETE' })
}

export async function getStrategyProgress(id) {
  return api(`/api/strategies/${id}/progress`)
}

// Value Metrics
export async function getValueMetrics() {
  return api('/api/dashboard/value-metrics')
}

// Directory scanning (for co-work import)
export async function scanDirectory(directory) {
  return api('/api/knowledge/scan-directory', {
    method: 'POST', body: JSON.stringify({ directory })
  })
}

export async function importKnowledgeFiles(entries) {
  return api('/api/knowledge/import-files', {
    method: 'POST', body: JSON.stringify(entries)
  })
}

// Master Chat
export async function sendMasterChat(message) {
  return api('/api/master-chat', { method: 'POST', body: JSON.stringify({ message }) })
}

export async function getMasterChatHistory() {
  return api('/api/master-chat/history')
}

export async function clearMasterChatHistory() {
  return api('/api/master-chat/history', { method: 'DELETE' })
}

export async function getMasterChatConfig() {
  return api('/api/master-chat/config')
}

export async function updateMasterChatConfig(data) {
  return api('/api/master-chat/config', { method: 'PATCH', body: JSON.stringify(data) })
}
