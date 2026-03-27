import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { FlaskConical, Send, X, Trash2, Loader2, Copy, Check } from 'lucide-react'
import { sendMasterChat, getMasterChatHistory, clearMasterChatHistory } from '../lib/api'
import { parseUTC } from '../lib/time'

export function MasterChat() {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    if (isOpen) {
      loadHistory()
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Hide on Office page (Claw3D has own chat) and Master Chat page (already full-screen)
  if (location.pathname === '/office' || location.pathname === '/master-chat') return null

  const loadHistory = async () => {
    try {
      const data = await getMasterChatHistory().catch(() => [])
      setMessages(Array.isArray(data) ? data : [])
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

  return (
    <>
      {/* Floating button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-12 h-12 rounded-full bg-lab-accent shadow-lg shadow-lab-accent/20 flex items-center justify-center hover:bg-lab-accent/90 transition-all hover:scale-105"
        >
          <FlaskConical size={20} className="text-white" />
        </button>
      )}

      {/* Chat panel */}
      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 w-[400px] h-[540px] bg-lab-bg border border-lab-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-lab-border bg-lab-surface/50">
            <div className="flex items-center gap-2">
              <FlaskConical size={14} className="text-lab-accent" />
              <span className="text-sm font-semibold text-lab-text-primary">Master Chat</span>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-lab-accent/15 text-lab-accent font-medium">AI</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleClear}
                className="p-1.5 text-lab-text-muted hover:text-lab-text-secondary transition-subtle rounded"
                title="Clear chat"
              >
                <Trash2 size={13} />
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 text-lab-text-muted hover:text-lab-text-secondary transition-subtle rounded"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-8">
                <FlaskConical size={24} className="mx-auto text-lab-text-muted/30 mb-3" />
                <p className="text-xs text-lab-text-muted mb-1">Master Chat</p>
                <p className="text-[10px] text-lab-text-faint leading-relaxed max-w-[260px] mx-auto">
                  Control The Lab with natural language. Create strategies, run agents, schedule jobs, search knowledge — all from here.
                </p>
                <div className="mt-4 space-y-1.5">
                  {[
                    'What agents do I have?',
                    'Create a strategy to find leads',
                    'Have Scout research IIPA members',
                    'Morning briefing',
                  ].map((suggestion, i) => (
                    <button
                      key={i}
                      onClick={() => { setInput(suggestion); inputRef.current?.focus() }}
                      className="block w-full text-left px-3 py-1.5 text-[11px] text-lab-text-secondary rounded-md border border-lab-border hover:bg-white/[0.02] transition-subtle"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`group flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-xs leading-relaxed relative ${
                    msg.role === 'user'
                      ? 'bg-lab-accent/15 text-lab-text-primary'
                      : 'bg-lab-elevated text-lab-text-secondary border border-lab-border'
                  }`}
                >
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                  <div className="flex items-center justify-between mt-1">
                    {msg.timestamp && (
                      <div className="text-[9px] text-lab-text-faint">
                        {parseUTC(msg.timestamp).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                    {msg.role === 'assistant' && (
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content)
                          setCopiedId(i)
                          setTimeout(() => setCopiedId(null), 1500)
                        }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 text-lab-text-faint hover:text-lab-text-secondary"
                        title="Copy response"
                      >
                        {copiedId === i ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-lab-elevated border border-lab-border rounded-lg px-3 py-2 flex items-center gap-2">
                  <Loader2 size={12} className="text-lab-accent animate-spin" />
                  <span className="text-[11px] text-lab-text-muted">Working...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-lab-border px-3 py-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask The Lab anything..."
                rows={1}
                className="flex-1 bg-lab-elevated border border-lab-border rounded-lg px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-faint focus:outline-none focus:border-lab-accent resize-none max-h-20"
                style={{ minHeight: '36px' }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="p-2 rounded-lg bg-lab-accent text-white hover:bg-lab-accent/90 transition-subtle disabled:opacity-30 flex-shrink-0"
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
