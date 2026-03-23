import { useState, useEffect, useRef } from 'react'
import {
  Wifi,
  WifiOff,
  RefreshCw,
  MessageSquare,
  Send,
  Activity,
  Terminal,
  Plus,
  ChevronRight,
  Loader2,
  CheckCircle,
  AlertCircle,
  Shield,
  Key,
} from 'lucide-react'
import { api } from '../lib/api'

// OpenClaw API helpers
async function getOpenClawStatus() {
  return api('/api/openclaw/status')
}

async function connectOpenClaw() {
  return api('/api/openclaw/connect', { method: 'POST' })
}

async function disconnectOpenClaw() {
  return api('/api/openclaw/disconnect', { method: 'POST' })
}

async function getOpenClawSessions() {
  return api('/api/openclaw/sessions')
}

async function getSessionHistory(sessionId) {
  return api(`/api/openclaw/sessions/${sessionId}/history`)
}

async function sendOpenClawMessage(sessionId, message) {
  return api(`/api/openclaw/sessions/${sessionId}/send`, {
    method: 'POST',
    body: JSON.stringify({ message }),
  })
}

async function createOpenClawSession(name) {
  return api('/api/openclaw/sessions', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

async function getOpenClawActivity(limit = 50) {
  return api(`/api/openclaw/activity?limit=${limit}`)
}

async function updateOpenClawSettings(data) {
  return api('/api/openclaw/settings', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

async function getOpenClawProviders() {
  return api('/api/openclaw/providers')
}

export function OpenClaw() {
  const [status, setStatus] = useState(null)
  const [sessions, setSessions] = useState([])
  const [activity, setActivity] = useState([])
  const [selectedSession, setSelectedSession] = useState(null)
  const [history, setHistory] = useState([])
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [providerInfo, setProviderInfo] = useState(null)
  const [activeTab, setActiveTab] = useState('sessions')
  const [showSettings, setShowSettings] = useState(false)
  const [gatewayUrl, setGatewayUrl] = useState('ws://127.0.0.1:18789')
  const [gatewayToken, setGatewayToken] = useState('')
  const chatEndRef = useRef(null)

  useEffect(() => {
    loadStatus()
    const interval = setInterval(loadStatus, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (status?.connected) {
      loadSessions()
      loadActivity()
      loadProviders()
    }
  }, [status?.connected])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [history])

  const loadStatus = async () => {
    try {
      const data = await getOpenClawStatus()
      setStatus(data)
      if (data.gateway_url) setGatewayUrl(data.gateway_url)
    } catch {
      setStatus({ connected: false })
    }
  }

  const loadSessions = async () => {
    try {
      const data = await getOpenClawSessions()
      setSessions(Array.isArray(data) ? data : [])
    } catch {
      setSessions([])
    }
  }

  const loadActivity = async () => {
    try {
      const data = await getOpenClawActivity()
      setActivity(Array.isArray(data) ? data : [])
    } catch {
      setActivity([])
    }
  }

  const loadProviders = async () => {
    try {
      const data = await getOpenClawProviders()
      setProviderInfo(data)
    } catch {
      setProviderInfo(null)
    }
  }

  const loadHistory = async (sessionId) => {
    try {
      const data = await getSessionHistory(sessionId)
      setHistory(Array.isArray(data) ? data : [])
    } catch {
      setHistory([])
    }
  }

  const handleConnect = async () => {
    setIsConnecting(true)
    try {
      const data = await connectOpenClaw()
      setStatus(data)
    } catch {}
    setIsConnecting(false)
  }

  const handleDisconnect = async () => {
    try {
      await disconnectOpenClaw()
      setStatus({ connected: false })
      setSessions([])
      setActivity([])
    } catch {}
  }

  const handleSelectSession = async (session) => {
    setSelectedSession(session)
    await loadHistory(session.id)
  }

  const handleSend = async () => {
    if (!message.trim() || !selectedSession || isSending) return
    setIsSending(true)
    try {
      await sendOpenClawMessage(selectedSession.id, message)
      setMessage('')
      // Reload history after a moment
      setTimeout(() => loadHistory(selectedSession.id), 1500)
    } catch {}
    setIsSending(false)
  }

  const handleCreateSession = async () => {
    try {
      await createOpenClawSession(`Lab Session ${sessions.length + 1}`)
      await loadSessions()
    } catch {}
  }

  const handleSaveSettings = async () => {
    try {
      const data = await updateOpenClawSettings({
        gateway_url: gatewayUrl,
        gateway_token: gatewayToken || undefined,
      })
      setStatus(data)
      setShowSettings(false)
    } catch {}
  }

  const categoryIcon = (cat) => {
    switch (cat) {
      case 'agent': return '🤖'
      case 'tool': return '🔧'
      case 'session': return '💬'
      case 'user': return '👤'
      case 'approval': return '⚠️'
      case 'system': return '⚡'
      default: return '📋'
    }
  }

  const isConnected = status?.connected

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div className={`flex items-center justify-between p-4 rounded-lg border ${
        isConnected
          ? 'border-lab-success/30 bg-lab-success/5'
          : 'border-lab-border bg-lab-surface'
      }`}>
        <div className="flex items-center gap-3">
          {isConnected ? (
            <Wifi size={18} className="text-lab-success" />
          ) : (
            <WifiOff size={18} className="text-lab-text-muted" />
          )}
          <div>
            <div className="text-sm font-medium text-lab-text-primary">
              OpenClaw Gateway {isConnected ? '— Connected' : '— Offline'}
            </div>
            <div className="text-xs text-lab-text-muted mt-0.5">
              {isConnected
                ? `${status.sessions || 0} active sessions · ${status.activity_count || 0} events logged`
                : `Expecting gateway at ${gatewayUrl}`
              }
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="px-3 py-1.5 border border-lab-border rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
          >
            Configure
          </button>
          {isConnected ? (
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 border border-lab-border rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
            >
              Disconnect
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="px-3 py-1.5 bg-lab-accent text-white rounded-md text-xs font-medium hover:bg-lab-accent/90 transition-subtle disabled:opacity-50 flex items-center gap-2"
            >
              {isConnecting && <Loader2 size={12} className="animate-spin" />}
              Connect
            </button>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="p-4 border border-lab-border rounded-lg bg-lab-surface space-y-3">
          <h3 className="text-sm font-medium text-lab-text-primary">Gateway Settings</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-lab-text-muted mb-1">Gateway URL</label>
              <input
                type="text"
                value={gatewayUrl}
                onChange={e => setGatewayUrl(e.target.value)}
                className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50"
                placeholder="ws://127.0.0.1:18789"
              />
            </div>
            <div>
              <label className="block text-xs text-lab-text-muted mb-1">Token (optional)</label>
              <input
                type="password"
                value={gatewayToken}
                onChange={e => setGatewayToken(e.target.value)}
                className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50"
                placeholder="OPENCLAW_GATEWAY_TOKEN"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowSettings(false)}
              className="px-3 py-1.5 border border-lab-border rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03]"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSettings}
              className="px-3 py-1.5 bg-lab-accent text-white rounded-md text-xs font-medium hover:bg-lab-accent/90"
            >
              Save & Reconnect
            </button>
          </div>
        </div>
      )}

      {/* Provider Status Cards (shown when connected) */}
      {isConnected && providerInfo && (
        <div className="grid grid-cols-3 gap-4">
          {/* Primary Model */}
          <div className="p-4 border border-lab-border rounded-lg bg-lab-surface">
            <div className="flex items-center gap-2 mb-2">
              <Terminal size={14} className="text-lab-accent" />
              <span className="text-xs font-medium text-lab-text-muted uppercase tracking-wide">Primary Model</span>
            </div>
            <div className="text-sm font-medium text-lab-text-primary">
              {providerInfo.primary_model || 'Not configured'}
            </div>
            {providerInfo.primary_model?.includes('codex') && (
              <span className="inline-block mt-1.5 px-2 py-0.5 bg-lab-success/10 border border-lab-success/20 rounded text-xs text-lab-success">
                OAuth — Subscription
              </span>
            )}
          </div>

          {/* OAuth Profiles */}
          <div className="p-4 border border-lab-border rounded-lg bg-lab-surface">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={14} className="text-lab-success" />
              <span className="text-xs font-medium text-lab-text-muted uppercase tracking-wide">OAuth Profiles</span>
            </div>
            {providerInfo.oauth_profiles?.length > 0 ? (
              <div className="space-y-1">
                {providerInfo.oauth_profiles.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle size={12} className="text-lab-success" />
                    <span className="text-sm text-lab-text-primary">{p}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <AlertCircle size={12} className="text-lab-warning" />
                <span className="text-sm text-lab-text-muted">None detected</span>
              </div>
            )}
          </div>

          {/* API Key Providers */}
          <div className="p-4 border border-lab-border rounded-lg bg-lab-surface">
            <div className="flex items-center gap-2 mb-2">
              <Key size={14} className="text-lab-text-muted" />
              <span className="text-xs font-medium text-lab-text-muted uppercase tracking-wide">API Key Providers</span>
            </div>
            {providerInfo.api_key_providers?.length > 0 ? (
              <div className="space-y-1">
                {providerInfo.api_key_providers.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <CheckCircle size={12} className="text-lab-text-muted" />
                    <span className="text-sm text-lab-text-primary">{p}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-sm text-lab-text-muted">None — using OAuth only</span>
            )}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-lab-border pb-3">
        {['sessions', 'activity'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`text-sm font-medium transition-subtle capitalize ${
              activeTab === tab
                ? 'text-lab-text-primary border-b-2 border-lab-accent'
                : 'text-lab-text-muted hover:text-lab-text-secondary'
            }`}
          >
            {tab === 'sessions' ? (
              <span className="flex items-center gap-2">
                <MessageSquare size={14} /> Sessions
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Activity size={14} /> Activity Feed
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div className="grid grid-cols-3 gap-4" style={{ minHeight: 400 }}>
          {/* Session List */}
          <div className="col-span-1 border border-lab-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-lab-border bg-white/[0.02]">
              <span className="text-xs font-medium text-lab-text-secondary">Sessions</span>
              <button
                onClick={handleCreateSession}
                disabled={!isConnected}
                className="p-1 rounded hover:bg-white/[0.05] text-lab-text-muted disabled:opacity-30"
              >
                <Plus size={14} />
              </button>
            </div>
            <div className="overflow-y-auto" style={{ maxHeight: 360 }}>
              {sessions.length === 0 ? (
                <div className="text-center py-8">
                  <Terminal size={24} className="mx-auto text-lab-text-muted mb-2 opacity-40" />
                  <p className="text-xs text-lab-text-faint">
                    {isConnected ? 'No sessions yet' : 'Connect to see sessions'}
                  </p>
                </div>
              ) : (
                sessions.map(session => (
                  <button
                    key={session.id}
                    onClick={() => handleSelectSession(session)}
                    className={`w-full text-left px-3 py-2.5 border-b border-lab-border hover:bg-white/[0.03] transition-subtle ${
                      selectedSession?.id === session.id ? 'bg-white/[0.05]' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-medium text-lab-text-primary truncate">
                        {session.name || session.id?.slice(0, 12) || 'Session'}
                      </div>
                      <ChevronRight size={12} className="text-lab-text-muted flex-shrink-0" />
                    </div>
                    <div className="text-xs text-lab-text-muted mt-0.5">
                      {session.channel || 'direct'} · {session.messageCount || 0} messages
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Chat View */}
          <div className="col-span-2 border border-lab-border rounded-lg flex flex-col overflow-hidden">
            {selectedSession ? (
              <>
                <div className="px-4 py-2.5 border-b border-lab-border bg-white/[0.02] flex items-center justify-between">
                  <div>
                    <div className="text-xs font-medium text-lab-text-primary">
                      {selectedSession.name || selectedSession.id?.slice(0, 16)}
                    </div>
                    <div className="text-xs text-lab-text-muted">
                      {selectedSession.channel || 'direct session'}
                    </div>
                  </div>
                  <button
                    onClick={() => loadHistory(selectedSession.id)}
                    className="p-1 rounded hover:bg-white/[0.05] text-lab-text-muted"
                  >
                    <RefreshCw size={12} />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 300 }}>
                  {history.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-xs text-lab-text-faint">No messages yet</p>
                    </div>
                  ) : (
                    history.map((msg, i) => (
                      <div
                        key={i}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg px-3 py-2 text-xs leading-relaxed ${
                            msg.role === 'user'
                              ? 'bg-lab-accent/20 text-lab-text-primary'
                              : 'bg-white/[0.04] text-lab-text-secondary'
                          }`}
                        >
                          {msg.content?.slice(0, 600)}
                          {msg.content?.length > 600 && '...'}
                        </div>
                      </div>
                    ))
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Message input */}
                <div className="border-t border-lab-border p-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={message}
                      onChange={e => setMessage(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSend()}
                      placeholder="Send a message to OpenClaw..."
                      className="flex-1 bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!message.trim() || isSending}
                      className="p-2 bg-lab-accent text-white rounded-md hover:bg-lab-accent/90 disabled:opacity-40 transition-subtle"
                    >
                      {isSending ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Send size={14} />
                      )}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare size={32} className="mx-auto text-lab-text-muted mb-3 opacity-30" />
                  <p className="text-xs text-lab-text-faint">
                    {isConnected
                      ? 'Select a session or create a new one'
                      : 'Connect to OpenClaw Gateway to start'
                    }
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Activity Tab */}
      {activeTab === 'activity' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-lab-text-muted">{activity.length} events</span>
            <button
              onClick={loadActivity}
              disabled={!isConnected}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-lab-border rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] disabled:opacity-30"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          {activity.length === 0 ? (
            <div className="text-center py-12 border border-lab-border rounded-lg">
              <Activity size={28} className="mx-auto text-lab-text-muted mb-3 opacity-30" />
              <p className="text-xs text-lab-text-faint">
                {isConnected
                  ? 'No activity yet — send a message or run a task in OpenClaw'
                  : 'Connect to OpenClaw to see real-time activity'
                }
              </p>
            </div>
          ) : (
            <div className="border border-lab-border rounded-lg overflow-hidden">
              {activity.map((item, i) => (
                <div
                  key={item.id || i}
                  className={`flex items-start gap-3 px-4 py-3 ${
                    i > 0 ? 'border-t border-lab-border' : ''
                  } hover:bg-white/[0.02]`}
                >
                  <span className="text-sm mt-0.5">{categoryIcon(item.category)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-lab-text-primary">{item.description}</div>
                    {item.detail?.text && (
                      <div className="text-xs text-lab-text-muted mt-0.5 truncate">
                        {item.detail.text}
                      </div>
                    )}
                    {item.detail?.tool && (
                      <span className="inline-block mt-1 px-2 py-0.5 bg-white/[0.05] rounded text-xs text-lab-text-muted">
                        {item.detail.tool}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-lab-text-faint whitespace-nowrap">
                    {item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Quick-Start Guide (shown when disconnected) */}
      {!isConnected && (
        <div className="space-y-4">
          {/* Step 1: Install & Run OpenClaw */}
          <div className="border border-lab-border rounded-lg p-5 bg-white/[0.01]">
            <h3 className="text-sm font-medium text-lab-text-primary mb-3">Step 1 — Install & Start OpenClaw</h3>
            <div className="space-y-3 text-xs text-lab-text-secondary leading-relaxed">
              <pre className="bg-lab-bg border border-lab-border rounded-md px-4 py-3 text-xs text-lab-text-secondary font-mono overflow-x-auto">
{`# Install OpenClaw (if not already installed)
npx openclaw@latest

# The Gateway starts automatically at ws://localhost:18789
# Verify it's running:
openclaw gateway status`}
              </pre>
            </div>
          </div>

          {/* Step 2: Set up ChatGPT OAuth / Codex */}
          <div className="border border-lab-accent/20 rounded-lg p-5 bg-lab-accent/5">
            <h3 className="text-sm font-medium text-lab-text-primary mb-1">Step 2 — Set Up ChatGPT OAuth (Codex)</h3>
            <p className="text-xs text-lab-text-muted mb-3">Use your ChatGPT subscription instead of pay-per-token API keys — flat rate, no surprise bills.</p>
            <div className="space-y-3 text-xs text-lab-text-secondary leading-relaxed">
              <pre className="bg-lab-bg border border-lab-border rounded-md px-4 py-3 text-xs text-lab-text-secondary font-mono overflow-x-auto">
{`# Option A: Full onboard wizard (recommended for first time)
openclaw onboard --auth-choice openai-codex

# Option B: Direct login if OpenClaw is already set up
openclaw models auth login --provider openai-codex`}
              </pre>
              <p>This opens a browser window — log in with your ChatGPT account and authorise OpenClaw. Your OAuth token is saved to <code className="bg-lab-elevated px-1.5 py-0.5 rounded text-lab-text-muted">~/.openclaw/auth-profiles/openai-codex.json</code> and refreshes automatically.</p>
              <pre className="bg-lab-bg border border-lab-border rounded-md px-4 py-3 text-xs text-lab-text-secondary font-mono overflow-x-auto">
{`# Set Codex as your default model in ~/.openclaw/openclaw.json:
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai-codex/gpt-5.4"
      }
    }
  }
}`}
              </pre>
              <div className="mt-2 flex items-start gap-2 p-3 border border-lab-success/20 rounded-md bg-lab-success/5">
                <CheckCircle size={14} className="text-lab-success flex-shrink-0 mt-0.5" />
                <div className="text-xs text-lab-text-secondary">
                  <strong className="text-lab-text-primary">Why OAuth?</strong> Your ChatGPT Plus/Pro subscription covers all Codex usage at a flat monthly rate — no per-token API charges. OpenClaw routes through your subscription instead of burning API credits.
                </div>
              </div>
            </div>
          </div>

          {/* Step 3: Connect */}
          <div className="border border-lab-border rounded-lg p-5 bg-white/[0.01]">
            <h3 className="text-sm font-medium text-lab-text-primary mb-3">Step 3 — Connect The Lab</h3>
            <div className="space-y-3 text-xs text-lab-text-secondary leading-relaxed">
              <p>Click <strong className="text-lab-text-primary">Connect</strong> above. The Lab connects to OpenClaw's Gateway and displays all sessions, activity, and chat in real time. If your Gateway uses a custom port or token, click <strong className="text-lab-text-primary">Configure</strong> first.</p>
            </div>
          </div>

          {/* Optional: Embeddings note */}
          <div className="flex items-start gap-2 p-4 border border-lab-warning/20 rounded-lg bg-lab-warning/5">
            <AlertCircle size={14} className="text-lab-warning flex-shrink-0 mt-0.5" />
            <div className="text-xs text-lab-text-secondary">
              <strong className="text-lab-text-primary">Note:</strong> Codex OAuth doesn't include embeddings. If you need search/RAG features, add an OpenAI API key in your <code className="bg-lab-elevated px-1.5 py-0.5 rounded text-lab-text-muted">.env</code> for <code className="bg-lab-elevated px-1.5 py-0.5 rounded text-lab-text-muted">text-embedding-3-small</code> — costs pennies.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
