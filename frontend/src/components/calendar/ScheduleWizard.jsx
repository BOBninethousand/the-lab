import { useState, useEffect } from 'react'
import { AvatarCircle } from '../AvatarCircle'
import { X, ChevronRight, ChevronLeft, Check, Sparkles } from 'lucide-react'
import { createScheduleSimple, previewCron } from '../../lib/api'

const FREQ_OPTIONS = [
  { value: 'daily', label: 'Every day', desc: 'Runs once a day at a set time' },
  { value: 'weekdays', label: 'Weekdays only', desc: 'Monday to Friday' },
  { value: 'weekly', label: 'Once a week', desc: 'Pick a day and time' },
  { value: 'monthly', label: 'Once a month', desc: 'Pick a day of the month' },
]

const DAY_OPTIONS = [
  { value: 'mon', label: 'Mon' },
  { value: 'tue', label: 'Tue' },
  { value: 'wed', label: 'Wed' },
  { value: 'thu', label: 'Thu' },
  { value: 'fri', label: 'Fri' },
  { value: 'sat', label: 'Sat' },
  { value: 'sun', label: 'Sun' },
]

const TIME_PRESETS = [
  { value: '07:00', label: 'Early morning', desc: '07:00' },
  { value: '09:00', label: 'Morning', desc: '09:00' },
  { value: '12:00', label: 'Midday', desc: '12:00' },
  { value: '17:00', label: 'End of day', desc: '17:00' },
  { value: '20:00', label: 'Evening', desc: '20:00' },
]

const PROMPT_TEMPLATES = {
  Scout: 'Research the latest trends and opportunities in [topic]. Focus on actionable insights, competitor movements, and potential leads.',
  Quill: 'Create compelling content about [topic]. Include key messaging, call-to-action suggestions, and SEO considerations.',
  Forge: 'Review and report on the technical health of [system]. Check for issues, performance concerns, and improvement opportunities.',
  Radar: 'Identify and draft personalised outreach to potential leads in [market]. Include context for each lead and suggested approach.',
}

export function ScheduleWizard({ agents, onClose, onCreated }) {
  const [step, setStep] = useState(1)
  const [isCreating, setIsCreating] = useState(false)
  const [cronPreview, setCronPreview] = useState(null)

  const [form, setForm] = useState({
    agent_id: '',
    agent_name: '',
    name: '',
    prompt: '',
    frequency: 'daily',
    time: '09:00',
    day_of_week: 'mon',
    day_of_month: 1,
    description: '',
  })

  const selectedAgent = agents.find(a => a.id === form.agent_id)

  // Load cron preview when schedule changes
  useEffect(() => {
    if (step !== 3) return
    const timer = setTimeout(async () => {
      try {
        const params = { frequency: form.frequency, time: form.time }
        if (form.frequency === 'weekly') params.day_of_week = form.day_of_week
        if (form.frequency === 'monthly') params.day_of_month = form.day_of_month
        const preview = await previewCron(params).catch(() => null)
        setCronPreview(preview)
      } catch {}
    }, 200)
    return () => clearTimeout(timer)
  }, [form.frequency, form.time, form.day_of_week, form.day_of_month, step])

  const selectAgent = (agent) => {
    const template = PROMPT_TEMPLATES[agent.name] || ''
    setForm(prev => ({
      ...prev,
      agent_id: agent.id,
      agent_name: agent.name,
      prompt: prev.prompt || template,
      name: prev.name || `${agent.name} — `,
    }))
    setStep(2)
  }

  const handleCreate = async () => {
    if (!form.agent_id || !form.prompt || !form.name) return
    setIsCreating(true)
    try {
      await createScheduleSimple(form)
      onCreated?.()
      onClose()
    } catch (err) {
      console.error('Failed to create schedule:', err)
    } finally {
      setIsCreating(false)
    }
  }

  const canProceed = () => {
    if (step === 1) return !!form.agent_id
    if (step === 2) return !!form.prompt.trim() && !!form.name.trim()
    return true
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-lab-bg border border-lab-border rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-lab-border">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-lab-accent" />
            <span className="text-sm font-semibold text-lab-text-primary">Create Schedule</span>
          </div>
          <div className="flex items-center gap-3">
            {/* Step indicators */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map(n => (
                <div
                  key={n}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    n === step ? 'w-4 bg-lab-accent' : n < step ? 'bg-lab-accent/50' : 'bg-lab-text-muted/30'
                  }`}
                />
              ))}
            </div>
            <button onClick={onClose} className="text-lab-text-muted hover:text-lab-text-secondary transition-subtle">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5">
          {/* Step 1: Pick Agent */}
          {step === 1 && (
            <div>
              <div className="mb-4">
                <h3 className="text-sm font-medium text-lab-text-primary">Which agent should handle this?</h3>
                <p className="text-[11px] text-lab-text-muted mt-0.5">Pick the agent best suited for the task</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {agents.map(agent => (
                  <button
                    key={agent.id}
                    onClick={() => selectAgent(agent)}
                    className={`p-3 rounded-lg border text-left transition-subtle ${
                      form.agent_id === agent.id
                        ? 'border-lab-accent bg-lab-accent/5'
                        : 'border-lab-border hover:bg-white/[0.02] hover:border-lab-border-hover'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <AvatarCircle name={agent.name} agent={agent.name} size={24} />
                      <span className="text-sm font-medium text-lab-text-primary">{agent.name}</span>
                    </div>
                    <p className="text-[10px] text-lab-text-muted line-clamp-2">{agent.role}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Describe Task */}
          {step === 2 && (
            <div>
              <div className="mb-4">
                <h3 className="text-sm font-medium text-lab-text-primary">What should {form.agent_name} do?</h3>
                <p className="text-[11px] text-lab-text-muted mt-0.5">Give a clear name and detailed instructions</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-1.5">Job Name</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g. Morning Market Briefing"
                    className="w-full bg-lab-elevated border border-lab-border rounded-md px-3 py-2 text-sm text-lab-text-primary placeholder:text-lab-text-faint focus:outline-none focus:border-lab-accent"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-1.5">Instructions</label>
                  <textarea
                    value={form.prompt}
                    onChange={e => setForm(prev => ({ ...prev, prompt: e.target.value }))}
                    placeholder="Describe what the agent should do in detail..."
                    rows={5}
                    className="w-full bg-lab-elevated border border-lab-border rounded-md px-3 py-2 text-sm text-lab-text-primary placeholder:text-lab-text-faint focus:outline-none focus:border-lab-accent resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Pick Frequency */}
          {step === 3 && (
            <div>
              <div className="mb-4">
                <h3 className="text-sm font-medium text-lab-text-primary">How often?</h3>
                <p className="text-[11px] text-lab-text-muted mt-0.5">Choose when this job should run</p>
              </div>
              <div className="space-y-4">
                {/* Frequency cards */}
                <div className="grid grid-cols-2 gap-2">
                  {FREQ_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setForm(prev => ({ ...prev, frequency: opt.value }))}
                      className={`p-2.5 rounded-lg border text-left transition-subtle ${
                        form.frequency === opt.value
                          ? 'border-lab-accent bg-lab-accent/5'
                          : 'border-lab-border hover:bg-white/[0.02]'
                      }`}
                    >
                      <div className="text-xs font-medium text-lab-text-primary">{opt.label}</div>
                      <div className="text-[10px] text-lab-text-muted">{opt.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Time presets */}
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-2">Time</div>
                  <div className="flex flex-wrap gap-2">
                    {TIME_PRESETS.map(t => (
                      <button
                        key={t.value}
                        onClick={() => setForm(prev => ({ ...prev, time: t.value }))}
                        className={`px-2.5 py-1.5 rounded-md text-xs transition-subtle border ${
                          form.time === t.value
                            ? 'border-lab-accent bg-lab-accent/10 text-lab-text-primary'
                            : 'border-lab-border text-lab-text-secondary hover:bg-white/[0.03]'
                        }`}
                      >
                        {t.label} <span className="text-lab-text-muted ml-1">{t.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Day picker for weekly */}
                {form.frequency === 'weekly' && (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-2">Day</div>
                    <div className="flex gap-1.5">
                      {DAY_OPTIONS.map(d => (
                        <button
                          key={d.value}
                          onClick={() => setForm(prev => ({ ...prev, day_of_week: d.value }))}
                          className={`px-2.5 py-1.5 rounded-md text-xs transition-subtle border ${
                            form.day_of_week === d.value
                              ? 'border-lab-accent bg-lab-accent/10 text-lab-text-primary'
                              : 'border-lab-border text-lab-text-secondary hover:bg-white/[0.03]'
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Day of month for monthly */}
                {form.frequency === 'monthly' && (
                  <div>
                    <div className="text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-2">Day of month</div>
                    <select
                      value={form.day_of_month}
                      onChange={e => setForm(prev => ({ ...prev, day_of_month: parseInt(e.target.value) }))}
                      className="bg-lab-elevated border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent"
                    >
                      {Array.from({ length: 28 }, (_, i) => (
                        <option key={i + 1} value={i + 1}>{i + 1}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Preview */}
                {cronPreview && (
                  <div className="p-2.5 bg-lab-accent/5 border border-lab-accent/20 rounded-lg">
                    <div className="text-xs text-lab-accent font-medium">{cronPreview.human}</div>
                    {cronPreview.next_runs?.length > 0 && (
                      <div className="text-[10px] text-lab-text-muted mt-1">
                        Next: {cronPreview.next_runs.slice(0, 3).join(' / ')}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-lab-border bg-white/[0.01]">
          <button
            onClick={() => step > 1 ? setStep(step - 1) : onClose()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-lab-text-secondary hover:bg-white/[0.03] rounded-md transition-subtle"
          >
            <ChevronLeft size={14} />
            {step > 1 ? 'Back' : 'Cancel'}
          </button>

          {step < 3 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-lab-accent text-white rounded-md hover:bg-lab-accent/90 transition-subtle disabled:opacity-40"
            >
              Next
              <ChevronRight size={14} />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={isCreating || !canProceed()}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-lab-accent text-white rounded-md hover:bg-lab-accent/90 transition-subtle disabled:opacity-40"
            >
              <Check size={14} />
              {isCreating ? 'Creating...' : 'Create Schedule'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
