import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { FlaskConical, Send, X, Trash2, Loader2, Copy, Check, Wrench, Paperclip } from 'lucide-react'
import { sendMasterChat, getMasterChatHistory, clearMasterChatHistory, sendMasterChatWithImage } from '../lib/api'
import { parseUTC } from '../lib/time'
import { useWebSocket } from '../hooks/useWebSocket'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

export function MasterChat() {
  const location = useLocation()
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [progressMessages, setProgressMessages] = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const [copiedId, setCopiedId] = useState(null)
  const { events } = useWebSocket()
  const lastEventCountRef = useRef(0)

  useEffect(() => {
    if (isOpen) {
      loadHistory()
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Process WebSocket progress events during loading
  useEffect(() => {
    if (!isLoading) {
      if (progressMessages.length > 0) setProgressMessages([])
      lastEventCountRef.current = events.length
      return
    }
    if (events.length > lastEventCountRef.current) {
      const newEvents = events.slice(0, events.length - lastEventCountRef.current)
      const progress = newEvents.filter(e => e.type === 'master_chat_progress').map(e => e.data)
      if (progress.length > 0) {
        setProgressMessages(prev => [...prev, ...progress.reverse()])
        lastEventCountRef.current = events.length
      }
    }
  }, [events, isLoading])

  // Auto-grow textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 150) + 'px'
    }
  }, [input])

  // Hide on Office page (Claw3D has own chat) and Master Chat page (already full-screen)
  if (location.pathname === '/office' || location.pathname === '/master-chat') return null

  const loadHistory = async () => {
    try {
      const data = await getMasterChatHistory().catch(() => [])
      setMessages(Array.isArray(data) ? data : [])
    } catch {}
  }

  const handleImageSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) { alert('Image too large. Maximum 10MB.'); return }
      setSelectedImage(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (items) {
      for (let item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile()
          setSelectedImage(file)
          setImagePreview(URL.createObjectURL(file))
          e.preventDefault()
          break
        }
      }
    }
  }

  const clearImage = () => {
    setSelectedImage(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSend = async () => {
    const msg = input.trim()
    if (!msg && !selectedImage) return
    if (isLoading) return

    const messageText = msg || 'Analyse this image'
    const currentImagePreview = imagePreview
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: messageText, timestamp: new Date().toISOString(), image: currentImagePreview }])
    setIsLoading(true)

    try {
      let data
      if (selectedImage) {
        data = await sendMasterChatWithImage(messageText, selectedImage)
        clearImage()
      } else {
        data = await sendMasterChat(messageText)
      }
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.response,
        timestamp: new Date().toISOString(),
        tools_used: data.tools_used || [],
      }])
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
                  {/* Tool call pills */}
                  {msg.tools_used && msg.tools_used.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2 pb-2 border-b border-white/[0.04]">
                      {msg.tools_used.map((t, j) => (
                        <span key={j} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-lab-accent/10 text-[9px] text-lab-accent">
                          <Wrench size={8} />
                          {t.summary}
                        </span>
                      ))}
                    </div>
                  )}
                  {msg.role === 'assistant' ? (
                    <div className="prose-chat text-xs">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                        components={{
                          a: ({ href, children, ...props }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer" {...props}>{children}</a>
                          )
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  ) : (
                    <>
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                      {msg.image && (
                        <img src={msg.image} alt="Upload" className="max-w-[200px] rounded-lg mt-1.5 border border-lab-border" />
                      )}
                    </>
                  )}
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
                <div className="bg-lab-elevated border border-lab-border rounded-lg px-3 py-2 min-w-[160px]">
                  {progressMessages.length === 0 ? (
                    <div className="flex items-center gap-2">
                      <Loader2 size={12} className="text-lab-accent animate-spin" />
                      <span className="text-[11px] text-lab-text-muted">Working...</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {progressMessages.map((msg, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-[11px] animate-fadeIn">
                          {(msg.stage === 'tool_start' || msg.stage === 'agent_turn') ? (
                            <>
                              <span className="text-lab-accent animate-pulse">●</span>
                              <span className="text-lab-text-secondary">{msg.description}</span>
                            </>
                          ) : (
                            <>
                              <span className="text-lab-success">✓</span>
                              <span className="text-lab-text-muted">{(msg.description || msg.tool || '').replace('...', '')} done</span>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-lab-border px-3 py-3">
            {imagePreview && (
              <div className="relative inline-block mb-2">
                <img src={imagePreview} alt="Preview" className="max-h-20 rounded-lg border border-lab-border" />
                <button
                  onClick={clearImage}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px] hover:bg-red-600"
                >
                  <X size={10} />
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-1.5 text-lab-text-muted hover:text-lab-text-secondary rounded hover:bg-white/[0.04] transition-subtle flex-shrink-0"
                title="Attach image"
              >
                <Paperclip size={13} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                className="hidden"
                onChange={handleImageSelect}
              />
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder="Ask The Lab anything..."
                rows={1}
                className="flex-1 bg-lab-elevated border border-lab-border rounded-lg px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-faint focus:outline-none focus:border-lab-accent resize-none max-h-[150px]"
                style={{ minHeight: '36px' }}
              />
              <button
                onClick={handleSend}
                disabled={(!input.trim() && !selectedImage) || isLoading}
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
