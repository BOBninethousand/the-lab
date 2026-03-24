import { useState, useEffect } from 'react'
import { Server, Key, CheckCircle, AlertCircle } from 'lucide-react'
import { getSettings } from '../lib/api'

export function Settings() {
  const [settings, setSettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadSettings()
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
