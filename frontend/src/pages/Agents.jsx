import { useState, useEffect, useRef } from 'react'
import { X, Send, Trash2, Plus, FileText, Clock, Zap, Bot, Wifi } from 'lucide-react'
import { AvatarCircle } from '../components/AvatarCircle'
import { getAgents, deleteAgent, createAgent, sendChat } from '../lib/api'

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
  const messagesEndRef = useRef(null)

  const [formData, setFormData] = useState({
    name: '',
    role: '',
    goal: '',
    backstory: '',
    provider: 'openai',
    model_name: 'gpt-4o',
  })

  useEffect(() => {
    loadAgents()
    loadSettings()
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
      const docsRes = await fetch(`${API}/api/documents`)
      const docs = docsRes.ok ? await docsRes.json() : []

      const costsRes = await fetch(`${API}/api/costs/recent?limit=100`)
      const costs = costsRes.ok ? await costsRes.json() : []

      const stats = {}
      for (const agent of agentList) {
        const agentDocs = Array.isArray(docs) ? docs.filter(d => d.agent_id === agent.id) : []
        const agentCosts = Array.isArray(costs)
          ? costs.filter(c => c.agent_id === agent.id || c.agent_name === agent.name)
          : []

        let chatCount = 0
        try {
          const chatRes = await fetch(`${API}/api/chat/${agent.id}/history`)
          const chat = chatRes.ok ? await chatRes.json() : []
          chatCount = Array.isArray(chat) ? chat.filter(m => m.role === 'assistant').length : 0
        } catch (e) {
          // ignore
        }

        const lastActivity = agentCosts.length > 0
          ? (agentCosts[0]?.timestamp || agentCosts[0]?.logged_at || null)
          : null

        stats[agent.id] = {
          documents: agentDocs.length,
          responses: chatCount,
          apiCalls: agentCosts.length,
          lastActive: lastActivity,
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
    try {
      const res = await fetch(`${API}/api/chat/${agent.id}/history`)
      const history = res.ok ? await res.json() : []
      if (Array.isArray(history) && history.length > 0) {
        setMessages(history.map((m, i) => ({
          id: m.id || i,
          role: m.role,
          content: m.content,
          route: m.route,
          timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
        })))
      } else {
        setMessages([
          {
            id: 1,
            role: 'assistant',
            content: `Hi, I'm ${agent.name}. How can I help you?`,
            timestamp: new Date(),
          },
        ])
      }
    } catch (e) {
      setMessages([
        {
          id: 1,
          role: 'assistant',
          content: `Hi, I'm ${agent.name}. How can I help you?`,
          timestamp: new Date(),
        },
      ])
    }
  }

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedAgent) return

    const userMessage = {
      id: messages.length + 1,
      role: 'user',
      content: messageInput,
      timestamp: new Date(),
    }

    setMessages(prev => [...prev, userMessage])
    const prompt = messageInput
    setMessageInput('')
    setIsSending(true)

    try {
      const result = await sendChat(selectedAgent.id, prompt)
      const route = result.route || 'unknown'
      setMessages(prev => [
        ...prev,
        {
          id: prev.length + 1,
          role: 'assistant',
          content: result.response || 'No response received.',
          route,
          timestamp: new Date(),
        },
      ])
      loadAgentStats(agents)
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: prev.length + 1,
          role: 'assistant',
          content: `Error: ${err.message}`,
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsSending(false)
    }
  }

  const handleDeleteAgent = async (id) => {
    if (!window.confirm('Delete this agent?')) return
    try {
      await deleteAgent(id)
      setAgents(prev => prev.filter(a => a.id !== id))
      if (selectedAgent?.id === id) {
        setSelectedAgent(null)
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
      setFormData({ name: '', role: '', goal: '', backstory: '', provider: 'openai', model_name: 'gpt-4o' })
      setShowAddModal(false)
      loadAgents()
    } catch (err) {
      console.error('Failed to create agent:', err)
    }
  }

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'No activity yet'
    const now = new Date()
    const then = new Date(timestamp)
    const diff = Math.floor((now - then) / 1000)
    if (diff < 60) return 'Just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  const isOpenClawActive = settings.openclaw_llm_active || false

  return (
    <div className="flex h-full gap-6">
      <div className={`flex-1 ${selectedAgent ? '' : ''}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-section-label">Manage Agents</h2>
            {isOpenClawActive ? (
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] text-emerald-400">
                <Wifi size={10} />
                Routing via OpenClaw
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] text-amber-400">
                <Zap size={10} />
                Using API Keys
              </span>
            )}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-lab-border-hover rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
          >
            <Plus size={14} />
            Add Agent
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-48 bg-lab-surface rounded animate-pulse" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-lab-text-faint mb-4">No agents available</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs text-lab-accent hover:text-lab-accent/80 transition-subtle"
            >
              Create your first agent
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {agents.map(agent => {
              const stats = agentStats[agent.id] || {}
              return (
                <button
                  key={agent.id}
                  onClick={() => handleSelectAgent(agent)}
                  className={`card transition-subtle cursor-pointer border-lab-border hover:border-lab-border-hover group ${
                    selectedAgent?.id === agent.id ? 'border-lab-accent' : ''
                  }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <AvatarCircle name={agent.name} agent={agent.agent_type} size={36} />
                    <div className="flex-1 text-left">
                      <div className="text-sm font-medium text-lab-text-primary">{agent.name}</div>
                      <div className="text-xs text-lab-text-muted">{agent.role}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {agent.status === 'working' ? (
                        <span className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 rounded text-[10px] text-blue-400">
                          <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                          Working
                        </span>
                      ) : agent.status === 'error' ? (
                        <span className="px-2 py-0.5 bg-red-500/10 rounded text-[10px] text-red-400">Error</span>
                      ) : (
                        <span className="px-2 py-0.5 bg-lab-elevated rounded text-[10px] text-lab-text-muted">Idle</span>
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

                  <p className="text-xs text-lab-text-secondary mb-4 line-clamp-2 text-left">
                    {agent.goal || 'No description'}
                  </p>

                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-lab-bg/50 rounded px-2 py-1.5 text-center">
                      <div className="text-sm font-semibold text-lab-text-primary">{stats.documents || 0}</div>
                      <div className="text-[10px] text-lab-text-muted flex items-center justify-center gap-1">
                        <FileText size={9} />
                        Docs
                      </div>
                    </div>
                    <div className="bg-lab-bg/50 rounded px-2 py-1.5 text-center">
                      <div className="text-sm font-semibold text-lab-text-primary">{stats.responses || 0}</div>
                      <div className="text-[10px] text-lab-text-muted flex items-center justify-center gap-1">
                        <Bot size={9} />
                        Chats
                      </div>
                    </div>
                    <div className="bg-lab-bg/50 rounded px-2 py-1.5 text-center">
                      <div className="text-sm font-semibold text-lab-text-primary">{stats.apiCalls || 0}</div>
                      <div className="text-[10px] text-lab-text-muted flex items-center justify-center gap-1">
                        <Zap size={9} />
                        Calls
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-lab-border/50">
                    <span className="inline-block px-2 py-0.5 bg-lab-elevated text-[10px] text-lab-text-muted rounded">
                      {isOpenClawActive ? 'openclaw' : agent.provider}
                    </span>
                    <div className="flex items-center gap-1 text-[10px] text-lab-text-muted">
                      <Clock size={9} />
                      {formatTimeAgo(stats.lastActive)}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {selectedAgent && (
        <div className="w-[420px] flex flex-col border-l border-lab-border bg-lab-surface">
          <div className="flex items-center justify-between p-4 border-b border-lab-border">
            <div className="flex items-center gap-3">
              <AvatarCircle name={selectedAgent.name} agent={selectedAgent.agent_type} size={28} />
              <div>
                <div className="text-sm font-medium text-lab-text-primary">{selectedAgent.name}</div>
                <div className="text-[10px] text-lab-text-muted">{selectedAgent.role}</div>
              </div>
            </div>
            <button
              onClick={() => {
                setSelectedAgent(null)
                setMessages([])
              }}
              className="p-1 hover:bg-white/[0.1] rounded transition-subtle"
            >
              <X size={16} className="text-lab-text-secondary" />
            </button>
          </div>

          {isOpenClawActive && (
            <div className="px-4 py-2 bg-emerald-500/5 border-b border-emerald-500/10 flex items-center gap-2">
              <Wifi size={11} className="text-emerald-400" />
              <span className="text-[10px] text-emerald-400">
                Responses routed via OpenClaw — using your subscription (no API cost)
              </span>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-lab-accent/10 text-lab-text-primary rounded-br-sm'
                      : 'bg-lab-elevated text-lab-text-secondary rounded-bl-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                  {msg.route && (
                    <div className="mt-1 pt-1 border-t border-white/5 text-[9px] text-lab-text-muted">
                      {msg.route}
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

          <div className="border-t border-lab-border p-4">
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

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card-elevated w-96">
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
                      const defaultModel = prov === 'openai' ? 'gpt-4o' : prov === 'anthropic' ? 'claude-sonnet-4-20250514' : 'llama3'
                      setFormData({ ...formData, provider: prov, model_name: defaultModel })
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
                    {formData.provider === 'openai' && (
                      <>
                        <option value="gpt-4o">GPT-4o</option>
                        <option value="gpt-4o-mini">GPT-4o Mini</option>
                      </>
                    )}
                    {formData.provider === 'anthropic' && (
                      <>
                        <option value="claude-sonnet-4-20250514">Claude Sonnet 4</option>
                        <option value="claude-haiku-3-5-20241022">Claude Haiku 3.5</option>
                      </>
                    )}
                    {formData.provider === 'ollama' && (
                      <>
                        <option value="llama3">Llama 3</option>
                        <option value="mistral">Mistral</option>
                        <option value="codellama">Code Llama</option>
                      </>
                    )}
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
