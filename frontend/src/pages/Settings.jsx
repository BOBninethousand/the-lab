import { useState, useEffect } from 'react'
import { Shield, DollarSign, Server, Key, CheckCircle, AlertCircle } from 'lucide-react'
import { getSettings, updateBudget } from '../lib/api'

export function Settings() {
  const [settings, setSettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [budgetInput, setBudgetInput] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    setIsLoading(true)
    try {
      const data = await getSettings().catch(() => null)
      if (data) {
        setSettings(data)
        setBudgetInput(String(data.daily_budget_usd || 5))
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveBudget = async () => {
    const val = parseFloat(budgetInput)
    if (isNaN(val) || val < 0) return

    try {
      await updateBudget(val)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      loadSettings()
    } catch (err) {
      console.error('Failed to update budget:', err)
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

      {/* Budget Control */}
      <div>
        <h2 className="text-section-label mb-4">Budget Control</h2>
        <div className="border border-lab-border rounded-lg p-5">
          <div className="flex items-start gap-4">
            <DollarSign size={16} className="text-lab-text-muted flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-lab-text-primary mb-1">
                Daily API Spending Limit
              </p>
              <p className="text-xs text-lab-text-muted mb-4">
                The Lab will warn when daily API spend exceeds this amount. Helps prevent runaway costs when agents are working.
              </p>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <span className="absolute left-3 top-2 text-xs text-lab-text-muted">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.50"
                    value={budgetInput}
                    onChange={(e) => setBudgetInput(e.target.value)}
                    className="w-32 bg-lab-bg border border-lab-border rounded-md pl-7 pr-3 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50 transition-subtle"
                  />
                </div>
                <span className="text-xs text-lab-text-muted">USD / day</span>
                <button
                  onClick={handleSaveBudget}
                  className="px-4 py-2 bg-lab-accent text-white rounded-md text-xs font-medium hover:bg-lab-accent/90 transition-subtle"
                >
                  {saved ? 'Saved!' : 'Save'}
                </button>
              </div>
            </div>
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

# Optional: set daily budget (default $5)
DAILY_API_BUDGET=5.00

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
