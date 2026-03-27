import { useState, useEffect, useRef } from 'react'
import { FlaskConical, Send, Loader2, Copy, Check, Plus, Zap, Bot, CalendarDays, BookOpen, DollarSign, Sparkles } from 'lucide-react'
import { sendMasterChat, getMasterChatHistory, clearMasterChatHistory, getSkills, getAgents, getSchedule, getCostSummary } from '../lib/api'

const QUICK_ACTIONS = [
  { label: 'Morning Briefing', prompt: 'Run morning briefing', icon: Sparkles, description: 'Status, schedule, reports, costs' },
  { label: 'Deploy Agent', prompt: 'Deploy a new agent called ', icon: Bot, description: 'Create, schedule, and verify' },
  { label: 'Weekly Audit', prompt: 'Run weekly audit', icon: CalendarDays, description: 'Full review with Notion publish' },
  { label: 'Onboard Knowledge', prompt: 'Onboard knowledge about ', icon: BookOpen, description: 'Search, add, assign to agents' },
]

export function MasterChatPage() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [skills, setSkills] = useState([])
  const [labStats, setLabStats] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    loadHistory()
    loadSidebar()
    setTimeout(() => inputRef.current?.focus(), 200)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadHistory = async () => {
    try {
      const data = await getMasterChatHistory().catch(() => [])
      setMessages(Array.isArray(data) ? data : [])
    } catch {}
  }

  const loadSidebar = async () => {
    try {
      const [skillsData, agentsData, scheduleData, costData] = await Promise.all([
        getSkills().catch(() => []),
        getAgents().catch(() => []),
        getSchedule().catch(() => []),
        getCostSummary(7).catch(() => null),
      ])
      setSkills(Array.isArray(skillsData) ? skillsData : [])
      setLabStats({
        agents: Array.isArray(agentsData) ? agentsData.length : 0,
        schedules: Array.isArray(scheduleData) ? scheduleData.length : 0,
        spend: costData?.today_spend_usd ?? 0,
        budget: costData?.daily_budget_usd ?? 5,
      })
    } catch {}
  }

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || isLoading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: new Date().toISOString() }])
    setIsLoading(true)

    try {
      const data = await sendMasterChat(msg)
      setMessages(prev => [...prev, { role: 'assistant', content: data.response, timestamp: new Date().toISOString() }])
      loadSidebar()
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message || 'Failed to reach Master Chat'}`, timestamp: new Date().toISOString() }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleClear = async () => {
    try {
      await clearMasterChatHistory()
      setMessages([])
    } catch {}
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleQuickAction = (prompt) => {
    setInput(prompt)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden -m-4 md:-m-6 lg:-m-8">
      {/* Left Panel */}
      <div className="w-[280px] border-r border-lab-border bg-lab-surface/30 flex flex-col overflow-y-auto hidden lg:flex">
        <div className="p-4 space-y-5">
          {/* New Chat */}
          <button
            onClick={handleClear}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-lab-border hover:border-lab-border-hover bg-lab-elevated hover:bg-white/[0.03] transition-subtle text-sm text-lab-text-secondary"
          >
            <Plus size={14} />
            New Chat
          </button>

          {/* Quick Actions */}
          <div>
            <div className="text-[10px] font-medium uppercase tracking-widest text-lab-text-faint mb-2.5">Quick Actions</div>
            <div className="space-y-1.5">
              {QUICK_ACTIONS.map((action, i) => {
                const Icon = action.icon
                return (
                  <button
                    key={i}
                    onClick={() => handleQuickAction(action.prompt)}
                    className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-subtle group"
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={13} className="text-lab-text-muted group-hover:text-lab-accent transition-subtle flex-shrink-0" />
                      <span className="text-xs font-medium text-lab-text-secondary">{action.label}</span>
                    </div>
                    <p className="text-[10px] text-lab-text-faint mt-0.5 ml-[21px]">{action.description}</p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Skills */}
          {skills.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-lab-text-faint mb-2.5">Skills</div>
              <div className="space-y-1">
                {skills.map((skill) => (
                  <button
                    key={skill.name}
                    onClick={() => handleQuickAction(`Run skill ${skill.name}`)}
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-white/[0.03] transition-subtle flex items-center gap-2"
                  >
                    <Zap size={11} className="text-lab-text-faint flex-shrink-0" />
                    <span className="text-[11px] text-lab-text-muted truncate">{skill.name}</span>
                    {skill.builtin && <span className="text-[8px] px-1 py-0.5 rounded bg-lab-accent/10 text-lab-accent flex-shrink-0">built-in</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Lab Status */}
          {labStats && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-widest text-lab-text-faint mb-2.5">Lab Status</div>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-lab-elevated">
                  <span className="text-lab-text-muted">Agents</span>
                  <span className="text-lab-text-secondary font-medium">{labStats.agents}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-lab-elevated">
                  <span className="text-lab-text-muted">Schedules</span>
                  <span className="text-lab-text-secondary font-medium">{labStats.schedules}</span>
                </div>
                <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-lab-elevated">
                  <span className="text-lab-text-muted">Today</span>
                  <span className="text-lab-text-secondary font-medium">${labStats.spend.toFixed(2)} / ${labStats.budget.toFixed(0)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-lab-bg">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[720px] mx-auto px-6 py-6 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-20">
                <FlaskConical size={32} className="mx-auto text-lab-text-muted/20 mb-4" />
                <h2 className="text-lg font-semibold text-lab-text-primary mb-1">Master Chat</h2>
                <p className="text-sm text-lab-text-muted mb-6 max-w-sm mx-auto">
                  Control The Lab with natural language. Create agents, run skills, schedule jobs, manage knowledge — all from here.
                </p>
                <div className="grid grid-cols-2 gap-2 max-w-md mx-auto">
                  {[
                    'What agents do I have?',
                    'Run morning briefing',
                    'Create a strategy to find leads',
                    'Have Scout research IIPA members',
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => handleQuickAction(suggestion)}
                      className="text-left px-3 py-2.5 text-xs text-lab-text-secondary rounded-lg border border-lab-border hover:bg-white/[0.02] hover:border-lab-border-hover transition-subtle"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-lab-accent/15 text-lab-text-primary'
                      : 'bg-lab-elevated text-lab-text-secondary border border-lab-border'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  <div className="flex items-center justify-between mt-2 gap-4">
                    {msg.timestamp && (
                      <div className="text-[10px] text-lab-text-faint">
                        {new Date(msg.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content)
                          setCopiedId(i)
                          setTimeout(() => setCopiedId(null), 1500)
                        }}
                        className="p-1 rounded text-lab-text-faint hover:text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
                        title="Copy response"
                      >
                        {copiedId === i ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-lab-elevated border border-lab-border rounded-lg px-4 py-3 flex items-center gap-2">
                  <Loader2 size={14} className="text-lab-accent animate-spin" />
                  <span className="text-sm text-lab-text-muted">Working...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="border-t border-lab-border px-6 py-4 bg-lab-bg">
          <div className="max-w-[720px] mx-auto flex items-end gap-3">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask The Lab anything..."
              rows={1}
              className="flex-1 bg-lab-elevated border border-lab-border rounded-lg px-4 py-3 text-sm text-lab-text-primary placeholder:text-lab-text-faint focus:outline-none focus:border-lab-accent/50 resize-none max-h-32 transition-subtle"
              style={{ minHeight: '48px' }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-3 rounded-lg bg-lab-accent text-white hover:bg-lab-accent/90 transition-subtle disabled:opacity-30 flex-shrink-0"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
