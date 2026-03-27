import { useState, useEffect, useRef, useCallback } from 'react'
import { FlaskConical, Send, Loader2, Copy, Check, Plus, Trash2, Pencil, MessageSquare, Sparkles, Bot, CalendarDays, BookOpen, X } from 'lucide-react'
import { listConversations, createConversation, getConversation, deleteConversation, renameConversation, chatInConversation } from '../lib/api'
import { parseUTC } from '../lib/time'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

const QUICK_ACTIONS = [
  { label: 'Morning Briefing', prompt: 'Run morning briefing', icon: Sparkles },
  { label: 'Deploy Agent', prompt: 'Deploy a new agent called ', icon: Bot },
  { label: 'Weekly Audit', prompt: 'Run weekly audit', icon: CalendarDays },
  { label: 'Onboard Knowledge', prompt: 'Onboard knowledge about ', icon: BookOpen },
]

export function MasterChatPage() {
  const [conversations, setConversations] = useState([])
  const [activeConvoId, setActiveConvoId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [copiedId, setCopiedId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editTitle, setEditTitle] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const textareaRef = useRef(null)

  // Load conversation list on mount
  useEffect(() => {
    loadConversations()
  }, [])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + 'px'
    }
  }, [input])

  const loadConversations = async () => {
    try {
      const data = await listConversations().catch(() => [])
      setConversations(Array.isArray(data) ? data : [])
    } catch {}
  }

  const loadConversation = async (convoId) => {
    try {
      const data = await getConversation(convoId)
      if (data) {
        setActiveConvoId(data.id)
        setMessages(data.messages || [])
        setTimeout(() => inputRef.current?.focus(), 100)
      }
    } catch {}
  }

  const handleNewChat = async () => {
    try {
      const convo = await createConversation()
      setConversations(prev => [{ id: convo.id, title: convo.title, created_at: convo.created_at, updated_at: convo.updated_at, message_count: 0 }, ...prev])
      setActiveConvoId(convo.id)
      setMessages([])
      setTimeout(() => inputRef.current?.focus(), 100)
    } catch {}
  }

  const handleDeleteConvo = async (convoId, e) => {
    e.stopPropagation()
    try {
      await deleteConversation(convoId)
      setConversations(prev => prev.filter(c => c.id !== convoId))
      if (activeConvoId === convoId) {
        setActiveConvoId(null)
        setMessages([])
      }
    } catch {}
  }

  const handleStartRename = (convo, e) => {
    e.stopPropagation()
    setEditingId(convo.id)
    setEditTitle(convo.title)
  }

  const handleFinishRename = async (convoId) => {
    if (editTitle.trim()) {
      await renameConversation(convoId, editTitle.trim())
      setConversations(prev => prev.map(c => c.id === convoId ? { ...c, title: editTitle.trim() } : c))
    }
    setEditingId(null)
  }

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg || isLoading) return

    // Create a conversation if none active
    let convoId = activeConvoId
    if (!convoId) {
      try {
        const convo = await createConversation()
        convoId = convo.id
        setActiveConvoId(convoId)
        setConversations(prev => [{ id: convo.id, title: convo.title, created_at: convo.created_at, updated_at: convo.updated_at, message_count: 0 }, ...prev])
      } catch {
        return
      }
    }

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg, timestamp: new Date().toISOString() }])
    setIsLoading(true)

    try {
      const data = await chatInConversation(convoId, msg)
      setMessages(prev => [...prev, { role: 'assistant', content: data.response, timestamp: new Date().toISOString() }])
      // Update sidebar title if first message
      setConversations(prev => prev.map(c =>
        c.id === convoId
          ? { ...c, title: c.title === 'New Chat' ? msg.slice(0, 60) : c.title, message_count: (c.message_count || 0) + 2, updated_at: new Date().toISOString() }
          : c
      ))
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.message || 'Failed to reach Master Chat'}`, timestamp: new Date().toISOString() }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleQuickAction = (prompt) => {
    setInput(prompt)
    setTimeout(() => {
      inputRef.current?.focus()
      if (textareaRef.current) {
        textareaRef.current.selectionStart = prompt.length
        textareaRef.current.selectionEnd = prompt.length
      }
    }, 50)
  }

  const formatDate = (ts) => {
    if (!ts) return ''
    const d = parseUTC(ts)
    const now = new Date()
    const diff = now - d
    if (diff < 86400000) return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    if (diff < 604800000) return d.toLocaleDateString('en-GB', { weekday: 'short' })
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden -m-4 md:-m-6 lg:-m-8">
      {/* Conversation Sidebar */}
      {sidebarOpen && (
        <div className="w-[280px] border-r border-lab-border bg-lab-surface/30 flex flex-col overflow-hidden">
          {/* New Chat Button */}
          <div className="p-3 border-b border-lab-border">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-lab-border hover:border-lab-border-hover bg-lab-elevated hover:bg-white/[0.04] transition-subtle text-sm text-lab-text-secondary"
            >
              <Plus size={14} />
              New Chat
            </button>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <div className="text-center py-12 px-4">
                <MessageSquare size={20} className="mx-auto text-lab-text-faint/30 mb-2" />
                <p className="text-xs text-lab-text-faint">No conversations yet</p>
              </div>
            ) : (
              <div className="py-2">
                {conversations.map(convo => (
                  <div
                    key={convo.id}
                    onClick={() => loadConversation(convo.id)}
                    className={`group flex items-center gap-2 mx-2 px-3 py-2.5 rounded-lg cursor-pointer transition-subtle ${
                      activeConvoId === convo.id
                        ? 'bg-lab-accent/10 text-lab-text-primary'
                        : 'text-lab-text-secondary hover:bg-white/[0.03]'
                    }`}
                  >
                    <MessageSquare size={13} className={`flex-shrink-0 ${activeConvoId === convo.id ? 'text-lab-accent' : 'text-lab-text-faint'}`} />
                    <div className="flex-1 min-w-0">
                      {editingId === convo.id ? (
                        <input
                          autoFocus
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onBlur={() => handleFinishRename(convo.id)}
                          onKeyDown={e => e.key === 'Enter' && handleFinishRename(convo.id)}
                          className="w-full bg-transparent text-xs text-lab-text-primary outline-none border-b border-lab-accent"
                          onClick={e => e.stopPropagation()}
                        />
                      ) : (
                        <p className="text-xs truncate">{convo.title || 'New Chat'}</p>
                      )}
                      <p className="text-[9px] text-lab-text-faint mt-0.5">{formatDate(convo.updated_at)}</p>
                    </div>
                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity">
                      <button onClick={e => handleStartRename(convo, e)} className="p-1 rounded hover:bg-white/[0.06]" title="Rename">
                        <Pencil size={11} className="text-lab-text-faint" />
                      </button>
                      <button onClick={e => handleDeleteConvo(convo.id, e)} className="p-1 rounded hover:bg-white/[0.06]" title="Delete">
                        <Trash2 size={11} className="text-lab-text-faint hover:text-lab-error" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="border-t border-lab-border p-3">
            <div className="text-[9px] font-medium uppercase tracking-widest text-lab-text-faint mb-2">Quick Actions</div>
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_ACTIONS.map((action, i) => {
                const Icon = action.icon
                return (
                  <button
                    key={i}
                    onClick={() => handleQuickAction(action.prompt)}
                    className="flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] text-lab-text-muted hover:text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
                  >
                    <Icon size={11} className="flex-shrink-0" />
                    {action.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-lab-bg min-w-0">
        {/* Toggle sidebar (mobile) */}
        <div className="lg:hidden flex items-center px-4 py-2 border-b border-lab-border">
          <button onClick={() => setSidebarOpen(p => !p)} className="text-lab-text-muted hover:text-lab-text-secondary">
            <MessageSquare size={16} />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[760px] mx-auto px-6 py-6 space-y-5">
            {/* Empty State */}
            {messages.length === 0 && !activeConvoId && (
              <div className="text-center py-20">
                <FlaskConical size={36} className="mx-auto text-lab-text-muted/15 mb-5" />
                <h2 className="text-xl font-semibold text-lab-text-primary mb-2">Master Chat</h2>
                <p className="text-sm text-lab-text-muted mb-8 max-w-md mx-auto leading-relaxed">
                  Control The Lab with natural language. Create agents, run skills, schedule jobs, manage knowledge — all from here.
                </p>
                <div className="grid grid-cols-2 gap-3 max-w-lg mx-auto">
                  {[
                    'What agents do I have?',
                    'Run morning briefing',
                    'Create a strategy to find leads',
                    'Have Scout research IIPA members',
                    'Deploy an agent for social media',
                    'Check my spending this week',
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => handleQuickAction(suggestion)}
                      className="text-left px-4 py-3 text-sm text-lab-text-secondary rounded-lg border border-lab-border hover:bg-white/[0.02] hover:border-lab-border-hover transition-subtle"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Empty conversation */}
            {messages.length === 0 && activeConvoId && (
              <div className="text-center py-20">
                <FlaskConical size={28} className="mx-auto text-lab-text-muted/20 mb-3" />
                <p className="text-sm text-lab-text-muted">Start typing to begin this conversation.</p>
              </div>
            )}

            {/* Message List */}
            {messages.map((msg, i) => (
              <div key={msg.id || i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`rounded-xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-lab-accent/12 text-lab-text-primary px-5 py-3 max-w-[75%]'
                      : 'bg-lab-elevated text-lab-text-secondary border border-lab-border px-5 py-4 max-w-[85%]'
                  }`}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose-chat">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  )}

                  {/* Footer: timestamp + copy */}
                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-white/[0.04]">
                    <span className="text-[10px] text-lab-text-faint">
                      {msg.timestamp && parseUTC(msg.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content)
                          setCopiedId(i)
                          setTimeout(() => setCopiedId(null), 2000)
                        }}
                        className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-lab-text-faint hover:text-lab-text-secondary hover:bg-white/[0.04] transition-subtle"
                      >
                        {copiedId === i ? (
                          <><Check size={11} className="text-lab-success" /> Copied</>
                        ) : (
                          <><Copy size={11} /> Copy</>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-lab-elevated border border-lab-border rounded-xl px-5 py-3 flex items-center gap-2.5">
                  <Loader2 size={14} className="text-lab-accent animate-spin" />
                  <span className="text-sm text-lab-text-muted">Thinking...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-lab-border px-6 py-4 bg-lab-bg">
          <div className="max-w-[760px] mx-auto">
            <div className="flex items-end gap-3 bg-lab-elevated border border-lab-border rounded-xl px-4 py-3 focus-within:border-lab-accent/40 transition-subtle">
              <textarea
                ref={el => { textareaRef.current = el; inputRef.current = el }}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message Master Chat..."
                rows={1}
                className="flex-1 bg-transparent text-sm text-lab-text-primary placeholder:text-lab-text-faint focus:outline-none resize-none leading-relaxed"
                style={{ minHeight: '24px', maxHeight: '200px' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="p-2 rounded-lg bg-lab-accent text-white hover:bg-lab-accent/90 transition-subtle disabled:opacity-30 flex-shrink-0"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="text-[10px] text-lab-text-faint mt-2 text-center">
              Shift+Enter for new line. Master Chat can create agents, run skills, and manage The Lab.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
