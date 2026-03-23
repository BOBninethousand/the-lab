import { useState, useEffect } from 'react'
import { X, Send, Trash2, Plus } from 'lucide-react'
import { AvatarCircle } from '../components/AvatarCircle'
import { getAgents, deleteAgent, createAgent, sendChat } from '../lib/api'

export function Agents() {
  const [agents, setAgents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [isSending, setIsSending] = useState(false)
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
  }, [])

  const loadAgents = async () => {
    setIsLoading(true)
    try {
      const data = await getAgents().catch(() => [])
      setAgents(Array.isArray(data) ? data : (data.agents || []))
    } catch (err) {
      console.error('Failed to load agents:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectAgent = (agent) => {
    setSelectedAgent(agent)
    setMessages([
      {
        id: 1,
        role: 'assistant',
        content: `Hi, I'm ${agent.name}. How can I help you?`,
        timestamp: new Date()
      }
    ])
    setMessageInput('')
  }

  const handleSendMessage = async () => {
    if (!messageInput.trim() || !selectedAgent) return

    const userMessage = {
      id: messages.length + 1,
      role: 'user',
      content: messageInput,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    const prompt = messageInput
    setMessageInput('')
    setIsSending(true)

    try {
      const result = await sendChat(selectedAgent.id, prompt)
      setMessages(prev => [
        ...prev,
        {
          id: prev.length + 1,
          role: 'assistant',
          content: result.response || 'No response received.',
          timestamp: new Date()
        }
      ])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: prev.length + 1,
          role: 'assistant',
          content: `Error: ${err.message}. Check your API keys in .env.`,
          timestamp: new Date()
        }
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

  return (
    <div className="flex h-full gap-6">
      {/* Main content */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-section-label">Manage Agents</h2>
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
              <div key={i} className="h-40 bg-lab-surface rounded animate-pulse" />
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
            {agents.map(agent => (
              <button
                key={agent.id}
                onClick={() => handleSelectAgent(agent)}
                className={`card transition-subtle cursor-pointer border-lab-border hover:border-lab-border-hover ${
                  selectedAgent?.id === agent.id ? 'border-lab-accent' : ''
                }`}
              >
                <div className="flex items-start gap-3 mb-3">
                  <AvatarCircle name={agent.name} agent={agent.agent_type} size={32} />
                  <div className="flex-1 text-left">
                    <div className="text-sm font-medium text-lab-text-primary">
                      {agent.name}
                    </div>
                    <div className="text-xs text-lab-text-muted">{agent.role}</div>
                  </div>
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

                <p className="text-xs text-lab-text-secondary mb-3 line-clamp-2">
                  {agent.goal || 'No description'}
                </p>

                <div className="flex items-center gap-2">
                  <span className="inline-block px-2 py-0.5 bg-lab-elevated text-xs text-lab-text-muted rounded">
                    {agent.provider}
                  </span>
                  <div className="flex-1" />
                  <div className="text-xs text-lab-text-muted">
                    {agent.status || 'idle'}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Chat panel */}
      {selectedAgent && (
        <div className="w-[400px] flex flex-col border-l border-lab-border bg-lab-surface">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-lab-border">
            <div>
              <div className="text-sm font-medium text-lab-text-primary">
                {selectedAgent.name}
              </div>
              <div className="text-xs text-lab-text-muted">{selectedAgent.role}</div>
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

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map(msg => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-xs px-3 py-2 rounded-md text-xs whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-lab-accent/10 text-lab-text-primary'
                      : 'bg-lab-elevated text-lab-text-secondary'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            {isSending && (
              <div className="flex justify-start">
                <div className="bg-lab-elevated px-3 py-2 rounded-md flex gap-1">
                  <div className="w-1.5 h-1.5 bg-lab-text-muted rounded-full animate-dot-blink animate-dot-blink-1" />
                  <div className="w-1.5 h-1.5 bg-lab-text-muted rounded-full animate-dot-blink animate-dot-blink-2" />
                  <div className="w-1.5 h-1.5 bg-lab-text-muted rounded-full animate-dot-blink animate-dot-blink-3" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
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
                className="flex-1 bg-lab-bg border border-lab-border rounded-md px-3 py-1.5 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 transition-subtle"
              />
              <button
                onClick={handleSendMessage}
                disabled={!messageInput.trim()}
                className="p-1.5 bg-lab-accent/10 hover:bg-lab-accent/20 disabled:opacity-50 rounded-md transition-subtle text-lab-accent"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Agent Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card-elevated w-96">
            <h2 className="text-sm font-semibold text-lab-text-primary mb-4">
              Create New Agent
            </h2>

            <form onSubmit={handleAddAgent} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                  Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
                  placeholder="Agent name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                  Role
                </label>
                <input
                  type="text"
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
                  placeholder="e.g. Research Agent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                  Goal
                </label>
                <textarea
                  value={formData.goal}
                  onChange={(e) =>
                    setFormData({ ...formData, goal: e.target.value })
                  }
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 resize-none"
                  placeholder="What should this agent accomplish?"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                    Provider
                  </label>
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
                  <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                    Model
                  </label>
                  <select
                    value={formData.model_name}
                    onChange={(e) =>
                      setFormData({ ...formData, model_name: e.target.value })
                    }
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
