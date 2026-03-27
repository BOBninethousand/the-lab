import { useState, useEffect } from 'react'
import { Server, Key, CheckCircle, AlertCircle, FlaskConical } from 'lucide-react'
import { getSettings, getMasterChatConfig, updateMasterChatConfig } from '../lib/api'

export function Settings() {
  const [settings, setSettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [mcConfig, setMcConfig] = useState({ provider: 'openai', model_name: 'gpt-4o' })
  const [mcSaved, setMcSaved] = useState(false)

  useEffect(() => {
    loadSettings()
    loadMasterChatConfig()
  }, [])

  const loadSettings = async () => {
    setIsLoading(true)
    try {
      const data = await getSettings().catch(() => null)
      if (data) {
        setSettings(data)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const loadMasterChatConfig = async () => {
    try {
      const data = await getMasterChatConfig().catch(() => null)
      if (data) setMcConfig(data)
    } catch {}
  }

  const MODEL_OPTIONS = [
    { label: 'GPT-5.4 (OpenAI)', provider: 'openai', model: 'gpt-5.4' },
    { label: 'GPT-4o (OpenAI)', provider: 'openai', model: 'gpt-4o' },
    { label: 'Claude Sonnet 4', provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    { label: 'Claude Haiku 3.5', provider: 'anthropic', model: 'claude-haiku-3-5-20241022' },
    { label: 'Ollama (Free/Local)', provider: 'ollama', model: 'llama3' },
  ]

  const handleMcModelChange = async (e) => {
    const opt = MODEL_OPTIONS[parseInt(e.target.value)]
    const newConfig = { provider: opt.provider, model_name: opt.model }
    setMcConfig(newConfig)
    try {
      await updateMasterChatConfig(newConfig)
      setMcSaved(true)
      setTimeout(() => setMcSaved(false), 2000)
    } catch {}
  }

  const currentModelIdx = MODEL_OPTIONS.findIndex(
    o => o.provider === mcConfig.provider && o.model === mcConfig.model_name
  )

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-lab-surface rounded animate-pulse" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-2xl">
      {/* API Keys Status */}
      <div>
        <h2 className="text-section-label mb-4">API Configuration</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-4 p-4 border border-lab-border rounded-lg">
            <Key size={16} className="text-lab-text-muted flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-lab-text-primary">OpenAI API Key</p>
              <p className="text-xs text-lab-text-muted mt-0.5">
                Required for Scout and Radar agents (GPT-4o)
              </p>
            </div>
            <div className="flex items-center gap-2">
              {settings?.openai_key_set ? (
                <>
                  <CheckCircle size={14} className="text-lab-success" />
                  <span className="text-xs text-lab-success">Configured</span>
                </>
              ) : (
                <>
                  <AlertCircle size={14} className="text-lab-warning" />
                  <span className="text-xs text-lab-warning">Not set</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 border border-lab-border rounded-lg">
            <Key size={16} className="text-lab-text-muted flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-lab-text-primary">Anthropic API Key</p>
              <p className="text-xs text-lab-text-muted mt-0.5">
                Required for Quill and Forge agents (Claude)
              </p>
            </div>
            <div className="flex items-center gap-2">
              {settings?.anthropic_key_set ? (
                <>
                  <CheckCircle size={14} className="text-lab-success" />
                  <span className="text-xs text-lab-success">Configured</span>
                </>
              ) : (
                <>
                  <AlertCircle size={14} className="text-lab-warning" />
                  <span className="text-xs text-lab-warning">Not set</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-4 p-4 border border-lab-border rounded-lg">
            <Server size={16} className="text-lab-text-muted flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-lab-text-primary">Ollama (Local)</p>
              <p className="text-xs text-lab-text-muted mt-0.5">
                {settings?.ollama_base_url || 'http://localhost:11434'} — free local inference
              </p>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle size={14} className="text-lab-text-muted" />
              <span className="text-xs text-lab-text-muted">No key needed</span>
            </div>
          </div>

          <p className="text-xs text-lab-text-faint mt-2">
            API keys are configured in the <code className="bg-lab-elevated px-1.5 py-0.5 rounded text-lab-text-muted">.env</code> file in the backend directory. Restart the server after changes.
          </p>
        </div>
      </div>

      {/* Master Chat Model */}
      <div>
        <h2 className="text-section-label mb-4">Master Chat</h2>
        <div className="border border-lab-border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-4">
            <FlaskConical size={16} className="text-lab-accent flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-lab-text-primary">AI Model</p>
              <p className="text-xs text-lab-text-muted mt-0.5">
                The LLM powering the floating Master Chat command centre
              </p>
            </div>
          </div>

          <select
            value={currentModelIdx >= 0 ? currentModelIdx : 0}
            onChange={handleMcModelChange}
            className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50"
          >
            {MODEL_OPTIONS.map((opt, i) => (
              <option key={i} value={i}>{opt.label}</option>
            ))}
          </select>

          <div className="flex items-center justify-between">
            <p className="text-[10px] text-lab-text-faint">
              Current: {mcConfig.provider} / {mcConfig.model_name}
            </p>
            {mcSaved && (
              <span className="text-[10px] text-emerald-400 flex items-center gap-1">
                <CheckCircle size={10} /> Saved
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Server Info */}
      <div>
        <h2 className="text-section-label mb-4">Server</h2>
        <div className="border border-lab-border rounded-lg p-5">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <p className="text-lab-text-muted mb-1">Host</p>
              <p className="text-lab-text-secondary font-mono">{settings?.server_host || '0.0.0.0'}</p>
            </div>
            <div>
              <p className="text-lab-text-muted mb-1">Port</p>
              <p className="text-lab-text-secondary font-mono">{settings?.server_port || 8000}</p>
            </div>
          </div>
        </div>
      </div>

      {/* How to set API keys */}
      <div>
        <h2 className="text-section-label mb-4">Quick Setup</h2>
        <div className="border border-lab-border rounded-lg p-5 bg-lab-surface/50">
          <pre className="text-xs text-lab-text-secondary leading-relaxed font-mono overflow-x-auto">
{`# Edit backend/.env and add your keys:
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

# Optional: Ollama for free local models
OLLAMA_BASE_URL=http://localhost:11434

# OpenClaw integration (auto-connects if running)
OPENCLAW_GATEWAY_URL=ws://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=

# Then restart The Lab:
./start.sh`}
          </pre>
        </div>
      </div>
    </div>
  )
}
