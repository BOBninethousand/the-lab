import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { X, Send, Trash2, Plus, FileText, Clock, Zap, Bot, Wifi } from 'lucide-react'
import { EmptyState } from '../components/EmptyState'
import { AvatarCircle } from '../components/AvatarCircle'
import { formatDistanceToNow, parseUTC } from '../lib/time'
import { getAgents, deleteAgent, createAgent, sendChat, getReports, getReportStats, createCorrection } from '../lib/api'

const API = import.meta.env.VITE_API_URL || ''

export function Agents() {
  const [agents, setAgents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [agentStats, setAgentStats] = useState({})
  const [settings, setSettings] = useState({})
  const [correctionMsg, setCorrectionMsg] = useState(null)
  const [correctionText, setCorrectionText] = useState('')
  const messagesEndRef = useRef(null)
  const chatContainerRef = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const chatParamHandled = useRef(false)

  // Auto-open chat when navigating from Office with ?chat=agentId
  useEffect(() => {
    if (chatParamHandled.current || agents.length === 0) return
    const chatId = searchParams.get('chat')
    if (chatId) {
      const agent = agents.find(a => a.id === chatId)
      if (agent) {
        handleSelectAgent(agent)
        setSearchParams({}, { replace: true })
        chatParamHandled.current = true
      }
    }
  }, [agents, searchParams])

  const handleCorrection = async () => {
    if (!correctionText.trim() || !correctionMsg || !selectedAgent) return
    try {
      await createCorrection({
        agent_id: selectedAgent.id,
        original_response: correctionMsg.content.slice(0, 500),
        correction: correctionText,
        tags: [],
      })
      setCorrectionMsg(null)
      setCorrectionText('')
    } catch (err) {
      console.error('Failed to log correction:', err)
    }
  }

  const [formData, setFormData] = useState({
    name: '',
    role: '',
    goal: '',
    backstory: '',
    provider: 'anthropic',
    model_name: 'claude-sonnet-4-20250514',
  })

  useEffect(() => {
    loadAgents()
    loadSettings()

    // Listen for WebSocket agent events
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`)
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'agent_status' && msg.data) {
          setAgents(prev => prev.map(a =>
            a.id === msg.data.id ? { ...a, status: msg.data.status, current_task: msg.data.current_task } : a
          ))
        }
        if (msg.type === 'agent_created' && msg.data) {
          setAgents(prev => {
            if (prev.some(a => a.id === msg.data.id)) return prev
            return [...prev, msg.data]
          })
        }
        if (msg.type === 'agent_deleted' && msg.data?.id) {
          setAgents(prev => prev.filter(a => a.id !== msg.data.id))
        }
      } catch (e) {
        // ignore
      }
    }
    return () => ws.close()
  }, [])

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [messages])

  const loadAgents = async () => {
    setIsLoading(true)
    try {
      const data = await getAgents().catch(() => [])
      const agentList = Array.isArray(data) ? data : (data.agents || [])
      setAgents(agentList)
      await loadAgentStats(agentList)
    } catch (err) {
      console.error('Failed to load agents:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadSettings = async () => {
    try {
      const res = await fetch(`${API}/api/settings`)
      if (res.ok) setSettings(await res.json())
    } catch (e) {
      // ignore
    }
  }

  const loadAgentStats = async (agentList) => {
    try {
      const [reportStatsData, costsRes] = await Promise.all([
        getReportStats().catch(() => ({ total: 0, unread: 0, today: 0, by_agent: {}, by_type: {} })),
        fetch(`${API}/api/costs/recent?limit=100`).then(r => r.ok ? r.json() : []).catch(() => []),
      ])

      const stats = {}
      for (const agent of agentList) {
        const agentCosts = Array.isArray(costsRes) ? costsRes.filter(c => c.agent_id === agent.id || c.agent_name === agent.name) : []
        const reportCount = reportStatsData.by_agent?.[agent.name] || 0

        // Get most recent report for this agent
        let lastReport = null
        try {
          const reports = await getReports({ agent_name: agent.name, limit: 1 })
          const reportList = Array.isArray(reports) ? reports : []
          if (reportList.length > 0) lastReport = reportList[0]
        } catch (e) {
          // ignore
        }

        let chatCount = 0
        try {
          const chatRes = await fetch(`${API}/api/chat/${agent.id}/history`)
          const chat = chatRes.ok ? await chatRes.json() : []
          chatCount = Array.isArray(chat) ? chat.filter(m => m.role === 'assistant').length : 0
        } catch (e) {
          // ignore
        }

        const lastCostTime = agentCosts.length > 0
          ? (agentCosts[0]?.timestamp || agentCosts[0]?.logged_at || null)
          : null
        const lastReportTime = lastReport?.created_at || null
        const times = [lastReportTime, lastCostTime].filter(Boolean).map(t => parseUTC(t).getTime())
        const lastActive = times.length > 0 ? new Date(Math.max(...times)).toISOString() : null

        stats[agent.id] = {
          reports: reportCount,
          responses: chatCount,
          apiCalls: agentCosts.length,
          lastActive,
          lastReportTitle: lastReport?.title || null,
        }
      }
      setAgentStats(stats)
    } catch (e) {
      console.error('Failed to load agent stats:', e)
    }
  }

  const handleSelectAgent = async (agent) => {
    setSelectedAgent(agent)
    setMessageInput('')
    // Start with a fresh greeting — don't load old Zeus prompts
    setMessages([{
      id: 'welcome',
      role: 'assistant',
      content: `Hi, I'm ${agent.name} — ${agent.role}. What would you like me to work on?`,
      timestamp: new Date(),
    }])
  }

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedAgent || isSending) return

    const userMessage = { id: Date.now(), role: 'user', content: messageInput, timestamp: new Date() }
    setMessages(prev => [...prev, userMessage])
    const prompt = messageInput
    setMessageInput('')
    setIsSending(true)

    // Optimistic status update
    setAgents(prev => prev.map(a =>
      a.id === selectedAgent.id ? { ...a, status: 'working', current_task: 'Responding to chat' } : a
    ))

    try {
      const result = await sendChat(selectedAgent.id, prompt)
      const route = result.route || ''
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: result.response || 'No response received.',
        route,
        timestamp: new Date(),
      }])
      loadAgentStats(agents)
    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now() + 1,
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: new Date(),
      }])
    } finally {
      setIsSending(false)
      setAgents(prev => prev.map(a =>
        a.id === selectedAgent.id ? { ...a, status: 'idle', current_task: null } : a
      ))
    }
  }

  const handleDeleteAgent = async (id) => {
    if (!window.confirm('Delete this agent?')) return
    try {
      await deleteAgent(id)
      setAgents(prev => prev.filter(a => a.id !== id))
      if (selectedAgent?.id === id) {
        setSelectedAgent(null)
        setMessages([])
      }
    } catch (err) {
      console.error('Failed to delete agent:', err)
    }
  }

  const handleAddAgent = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.role) return
    try {
      await createAgent({
        name: formData.name,
        role: formData.role,
        goal: formData.goal || formData.role,
        backstory: formData.backstory || `${formData.name} is a skilled AI agent specialising in ${formData.role.toLowerCase()}.`,
        provider: formData.provider,
        model_name: formData.model_name,
      })
      setFormData({ name: '', role: '', goal: '', backstory: '', provider: 'anthropic', model_name: 'claude-sonnet-4-20250514' })
      setShowAddModal(false)
      loadAgents()
    } catch (err) {
      console.error('Failed to create agent:', err)
    }
  }

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'No activity'
    return formatDistanceToNow(timestamp)
  }

  const isOpenClawActive = settings.openclaw_llm_active || settings.use_openclaw_for_agents || false

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main content — agent cards */}
      <div className="flex-1 overflow-y-auto pr-2">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-section-label">Manage Agents</h2>
            {isOpenClawActive ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] text-emerald-400 font-medium">
                <Wifi size={10} />
                Routing via OpenClaw
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] text-amber-400 font-medium">
                <Zap size={10} />
                Using API Keys
              </span>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-lab-border-hover rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
          >
            <Plus size={14} /> Add Agent
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-48 bg-lab-surface rounded animate-pulse" />)}
          </div>
        ) : agents.length === 0 ? (
          <EmptyState icon={Bot} title="No agents yet" description="Create your first agent to get started" action={{ label: 'Create agent', onClick: () => setShowAddModal(true) }} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {agents.map(agent => {
              const stats = agentStats[agent.id] || {}
              const isWorking = agent.status === 'working'
              return (
                <button
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent)}
                  className={`card transition-subtle cursor-pointer border-lab-border hover:border-lab-border-hover group text-left ${
                    selectedAgent?.id === agent.id ? 'border-lab-accent ring-1 ring-lab-accent/30' : ''
                  } ${isWorking ? 'ring-1 ring-blue-500/30 bg-blue-500/[0.02]' : ''}`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="relative">
                      <AvatarCircle name={agent.name} agent={agent.name} size={40} />
                      {isWorking && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-blue-500 rounded-full border-2 border-lab-surface animate-pulse" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-lab-text-primary truncate">{agent.name}</div>
                      <div className="text-xs text-lab-text-muted truncate">{agent.role}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isWorking ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/15 rounded text-[10px] text-blue-400">
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" /> Working
                        </span>
                      ) : agent.status === 'error' ? (
                        <span className="px-2 py-0.5 bg-red-500/15 rounded text-[10px] text-red-400">Error</span>
                      ) : (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/15 rounded text-[10px] text-emerald-400">
                          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Online
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteAgent(agent.id)
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-lab-error hover:bg-lab-error/10 rounded transition-subtle"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-lab-text-muted mb-4 line-clamp-2">{agent.goal || 'No description'}</p>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-lab-bg rounded px-2 py-1.5 text-center">
                      <div className="text-sm font-semibold text-lab-text-primary">{stats.reports || 0}</div>
                      <div className="text-[10px] text-lab-text-muted flex items-center justify-center gap-1"><FileText size={9} /> Reports</div>
                    </div>
                    <div className="bg-lab-bg rounded px-2 py-1.5 text-center">
                      <div className="text-sm font-semibold text-lab-text-primary">{stats.responses || 0}</div>
                      <div className="text-[10px] text-lab-text-muted flex items-center justify-center gap-1"><Bot size={9} /> Chats</div>
                    </div>
                    <div className="bg-lab-bg rounded px-2 py-1.5 text-center">
                      <div className="text-sm font-semibold text-lab-text-primary">{stats.apiCalls || 0}</div>
                      <div className="text-[10px] text-lab-text-muted flex items-center justify-center gap-1"><Zap size={9} /> Calls</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-lab-border/50">
                    <span className="px-2 py-0.5 bg-lab-elevated text-[10px] text-lab-text-muted rounded">
                      {isOpenClawActive ? 'openclaw' : agent.provider}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] text-lab-text-muted truncate max-w-[60%]">
                      <Clock size={9} className="flex-shrink-0" />
                      {stats.lastReportTitle
                        ? <span className="truncate">{stats.lastReportTitle}</span>
                        : formatTimeAgo(stats.lastActive)
                      }
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Chat panel — FIXED: proper scroll container with constrained height */}
      {selectedAgent && (
        <div className="w-full md:w-[360px] lg:w-[420px] flex-shrink-0 flex flex-col h-full border-l border-lab-border bg-lab-surface">
          {/* Header — fixed */}
          <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-lab-border">
            <div className="flex items-center gap-3">
              <AvatarCircle name={selectedAgent.name} agent={selectedAgent.agent_type} size={28} />
              <div>
                <div className="text-sm font-medium text-lab-text-primary">{selectedAgent.name}</div>
                <div className="text-[10px] text-lab-text-muted">{selectedAgent.role}</div>
              </div>
            </div>
            <button onClick={() => { setSelectedAgent(null); setMessages([]) }} className="p-1 hover:bg-white/[0.1] rounded transition-subtle">
              <X size={16} className="text-lab-text-secondary" />
            </button>
          </div>

          {/* Routing badge — fixed */}
          {isOpenClawActive && (
            <div className="flex-shrink-0 px-4 py-2 bg-emerald-500/5 border-b border-emerald-500/10 flex items-center gap-2">
              <Wifi size={11} className="text-emerald-400" />
              <span className="text-[10px] text-emerald-400">Via OpenClaw — no API cost</span>
            </div>
          )}

          {/* Messages — SCROLLABLE container */}
          <div
            ref={chatContainerRef}
            className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3"
            style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 220px)' }}
          >
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-lab-accent/10 text-lab-text-primary rounded-br-sm'
                      : 'bg-lab-elevated text-lab-text-secondary rounded-bl-sm'
                  }`}
                  style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}
                >
                  {msg.content}
                  {msg.route && (
                    <div className="mt-1 pt-1 border-t border-white/5 text-[9px] text-lab-text-muted opacity-60">
                      {msg.route}
                    </div>
                  )}
                  {msg.role === 'assistant' && msg.id !== 'welcome' && (
                    <div className="mt-1.5 pt-1 border-t border-white/5 flex justify-end">
                      {correctionMsg?.id === msg.id ? (
                        <div className="w-full mt-1 space-y-2">
                          <textarea
                            value={correctionText}
                            onChange={e => setCorrectionText(e.target.value)}
                            placeholder="What should the response have been?"
                            className="w-full bg-lab-bg border border-lab-border rounded px-2 py-1.5 text-[10px] text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 resize-none"
                            rows={2}
                            autoFocus
                          />
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => { setCorrectionMsg(null); setCorrectionText('') }}
                              className="px-2 py-0.5 text-[10px] text-lab-text-muted hover:text-lab-text-secondary transition-subtle">Cancel</button>
                            <button onClick={handleCorrection}
                              className="px-2 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded hover:bg-amber-500/30 transition-subtle">Submit</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setCorrectionMsg(msg); setCorrectionText('') }}
                          className="text-[9px] text-lab-text-muted hover:text-amber-400 transition-subtle opacity-50 hover:opacity-100"
                        >
                          Correct
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-lab-elevated px-4 py-3 rounded-lg flex items-center gap-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-lab-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <div className="w-1.5 h-1.5 bg-lab-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <div className="w-1.5 h-1.5 bg-lab-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-[10px] text-lab-text-muted">{selectedAgent.name} is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input — fixed at bottom */}
          <div className="flex-shrink-0 border-t border-lab-border p-4">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSendMessage()
                  }
                }}
                placeholder={`Message ${selectedAgent.name}...`}
                className="flex-1 bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 transition-subtle"
                disabled={isSending}
              />
              <button
                onClick={handleSendMessage}
                disabled={!messageInput.trim() || isSending}
                className="p-2 bg-lab-accent/10 hover:bg-lab-accent/20 disabled:opacity-30 rounded-md transition-subtle text-lab-accent"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Agent Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddModal(false)}>
          <div className="card-elevated w-96" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-lab-text-primary mb-4">Create New Agent</h2>
            <form onSubmit={handleAddAgent} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
                  placeholder="Agent name"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">Role</label>
                <input
                  type="text"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
                  placeholder="e.g. Research Agent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">Goal</label>
                <textarea
                  value={formData.goal}
                  onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 resize-none"
                  placeholder="What should this agent accomplish?"
                  rows={2}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-lab-text-secondary mb-2">Provider</label>
                  <select
                    value={formData.provider}
                    onChange={(e) => {
                      const prov = e.target.value
                      const model = prov === 'openai' ? 'gpt-4o' : prov === 'anthropic' ? 'claude-sonnet-4-20250514' : 'llama3'
                      setFormData({ ...formData, provider: prov, model_name: model })
                    }}
                    className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="anthropic">Anthropic</option>
                    <option value="ollama">Ollama (Local)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-lab-text-secondary mb-2">Model</label>
                  <select
                    value={formData.model_name}
                    onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                    className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50"
                  >
                    {formData.provider === 'openai' && <><option value="gpt-4o">GPT-4o</option><option value="gpt-4o-mini">GPT-4o Mini</option></>}
                    {formData.provider === 'anthropic' && <><option value="claude-sonnet-4-20250514">Claude Sonnet 4</option><option value="claude-haiku-3-5-20241022">Claude Haiku 3.5</option></>}
                    {formData.provider === 'ollama' && <><option value="llama3">Llama 3</option><option value="mistral">Mistral</option></>}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2 pt-4 border-t border-lab-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-3 py-2 border border-lab-border rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 bg-lab-accent text-white rounded-md text-xs font-medium hover:bg-lab-accent/90 transition-subtle"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
