import { useState, useEffect, useCallback } from 'react'
import { Plus, Play, Trash2, ChevronDown, Star, Clock, CheckCircle, XCircle, AlertTriangle, X } from 'lucide-react'
import { AvatarCircle } from '../components/AvatarCircle'
import {
  getSchedule, getAgents, createScheduleSimple, runSchedule, updateSchedule, deleteSchedule,
  getJobExecutions, submitJobFeedback, previewCron,
} from '../lib/api'
import { formatDistanceToNow } from '../lib/time'

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom (cron)' },
]

const DAYS = [
  { value: 'mon', label: 'Monday' },
  { value: 'tue', label: 'Tuesday' },
  { value: 'wed', label: 'Wednesday' },
  { value: 'thu', label: 'Thursday' },
  { value: 'fri', label: 'Friday' },
  { value: 'sat', label: 'Saturday' },
  { value: 'sun', label: 'Sunday' },
]

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTES = ['00', '15', '30', '45']

export function Calendar() {
  const [jobs, setJobs] = useState([])
  const [agents, setAgents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedJob, setSelectedJob] = useState(null)
  const [executions, setExecutions] = useState([])
  const [expandedExec, setExpandedExec] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [runningJob, setRunningJob] = useState(null)
  const [feedbackExec, setFeedbackExec] = useState(null)
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackText, setFeedbackText] = useState('')

  // Schedule builder form
  const [form, setForm] = useState({
    name: '', description: '', frequency: 'daily',
    time: '09:00', day_of_week: 'mon', day_of_month: 1,
    cron_expression: '0 9 * * *', prompt: '', agent_id: '',
  })
  const [cronPreview, setCronPreview] = useState(null)

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    if (selectedJob) loadExecutions(selectedJob.id)
  }, [selectedJob])

  // Live cron preview when schedule builder changes
  useEffect(() => {
    if (!showAddForm) return
    const timer = setTimeout(async () => {
      try {
        const params = { frequency: form.frequency, time: form.time }
        if (form.frequency === 'weekly') params.day_of_week = form.day_of_week
        if (form.frequency === 'monthly') params.day_of_month = form.day_of_month
        const preview = await previewCron(params).catch(() => null)
        setCronPreview(preview)
      } catch {}
    }, 300)
    return () => clearTimeout(timer)
  }, [form.frequency, form.time, form.day_of_week, form.day_of_month, showAddForm])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [jobsData, agentsData] = await Promise.all([
        getSchedule().catch(() => []),
        getAgents().catch(() => []),
      ])
      setJobs(Array.isArray(jobsData) ? jobsData : [])
      setAgents(Array.isArray(agentsData) ? agentsData : [])
      if (!form.agent_id && agentsData.length > 0) {
        setForm(f => ({ ...f, agent_id: agentsData[0].id }))
      }
    } catch {} finally { setIsLoading(false) }
  }

  const loadExecutions = async (jobId) => {
    try {
      const data = await getJobExecutions(jobId).catch(() => [])
      setExecutions(Array.isArray(data) ? data : [])
    } catch {}
  }

  const getAgent = (id) => agents.find(a => a.id === id)

  const handleCreateJob = async (e) => {
    e.preventDefault()
    if (!form.name || !form.prompt || !form.agent_id) return
    try {
      await createScheduleSimple(form)
      setForm({ name: '', description: '', frequency: 'daily', time: '09:00', day_of_week: 'mon', day_of_month: 1, cron_expression: '0 9 * * *', prompt: '', agent_id: agents[0]?.id || '' })
      setShowAddForm(false)
      loadData()
    } catch (err) { console.error('Failed to create job:', err) }
  }

  const handleRunNow = async (jobId) => {
    setRunningJob(jobId)
    try {
      await runSchedule(jobId)
      loadData()
      if (selectedJob?.id === jobId) loadExecutions(jobId)
    } catch {} finally { setRunningJob(null) }
  }

  const handleToggle = async (jobId) => {
    try {
      await updateSchedule(jobId, {})
      loadData()
    } catch {}
  }

  const handleDelete = async (jobId) => {
    try {
      await deleteSchedule(jobId)
      if (selectedJob?.id === jobId) setSelectedJob(null)
      loadData()
    } catch {}
  }

  const handleFeedback = async () => {
    if (!feedbackExec || feedbackRating === 0) return
    try {
      await submitJobFeedback(selectedJob.id, feedbackExec.id, {
        rating: feedbackRating,
        feedback: feedbackText,
      })
      setFeedbackExec(null)
      setFeedbackRating(0)
      setFeedbackText('')
      loadExecutions(selectedJob.id)
    } catch {}
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-120px)]">
      {/* Left Panel — Job List */}
      <div className="w-80 flex-shrink-0 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-section-label">Scheduled Jobs</h2>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-lab-border-hover rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
          >
            <Plus size={14} /> Add Job
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {isLoading ? (
            [...Array(3)].map((_, i) => <div key={i} className="h-20 bg-lab-surface rounded animate-pulse" />)
          ) : jobs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-lab-text-faint">No scheduled jobs yet</p>
            </div>
          ) : (
            jobs.map(job => {
              const agent = getAgent(job.agent_id)
              const isSelected = selectedJob?.id === job.id
              return (
                <button
                  key={job.id}
                  onClick={() => setSelectedJob(job)}
                  className={`w-full text-left p-3 rounded-lg border transition-subtle ${
                    isSelected
                      ? 'border-lab-accent/40 bg-lab-accent/5'
                      : 'border-lab-border hover:bg-white/[0.02]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {agent && <AvatarCircle agent={agent.name} size="sm" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-lab-text-primary truncate">{job.name}</span>
                        {!job.enabled && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] text-lab-text-muted bg-white/[0.05]">OFF</span>
                        )}
                      </div>
                      <div className="text-[10px] text-lab-text-muted mt-0.5">
                        {job.human_schedule || job.cron_expression}
                      </div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <StatusBadge status={job.last_status} />
                        {job.last_run && (
                          <span className="text-[10px] text-lab-text-muted">
                            {formatDistanceToNow(new Date(job.last_run))}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right Panel — Detail / Add Form */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {showAddForm ? (
          <div className="max-w-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-lab-text-primary">New Scheduled Job</h2>
              <button onClick={() => setShowAddForm(false)} className="text-lab-text-muted hover:text-lab-text-secondary">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateJob} className="space-y-4">
              <Field label="Job Name">
                <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50" placeholder="e.g. Morning Market Briefing" />
              </Field>

              <Field label="Agent">
                <select value={form.agent_id} onChange={e => setForm({ ...form, agent_id: e.target.value })} className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50">
                  {agents.map(a => <option key={a.id} value={a.id}>{a.name} — {a.role}</option>)}
                </select>
              </Field>

              <Field label="Schedule">
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <select value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} className="bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50 w-40">
                      {FREQUENCIES.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                    {form.frequency !== 'custom' && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-lab-text-muted">at</span>
                        <select value={form.time.split(':')[0]} onChange={e => setForm({ ...form, time: `${e.target.value}:${form.time.split(':')[1]}` })} className="bg-lab-bg border border-lab-border rounded-md px-2 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50 w-16">
                          {HOURS.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                        <span className="text-xs text-lab-text-muted">:</span>
                        <select value={form.time.split(':')[1]} onChange={e => setForm({ ...form, time: `${form.time.split(':')[0]}:${e.target.value}` })} className="bg-lab-bg border border-lab-border rounded-md px-2 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50 w-16">
                          {MINUTES.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    )}
                  </div>

                  {form.frequency === 'weekly' && (
                    <select value={form.day_of_week} onChange={e => setForm({ ...form, day_of_week: e.target.value })} className="bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50 w-40">
                      {DAYS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  )}

                  {form.frequency === 'monthly' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-lab-text-muted">Day</span>
                      <select value={form.day_of_month} onChange={e => setForm({ ...form, day_of_month: parseInt(e.target.value) })} className="bg-lab-bg border border-lab-border rounded-md px-2 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50 w-20">
                        {Array.from({ length: 28 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                      </select>
                    </div>
                  )}

                  {form.frequency === 'custom' && (
                    <input type="text" value={form.cron_expression} onChange={e => setForm({ ...form, cron_expression: e.target.value })}
                      className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50" placeholder="0 9 * * *" />
                  )}

                  {cronPreview && (
                    <div className="p-2 bg-white/[0.03] rounded border border-lab-border text-[10px]">
                      <div className="text-lab-accent font-medium">{cronPreview.human}</div>
                      {cronPreview.next_runs?.length > 0 && (
                        <div className="text-lab-text-muted mt-1">
                          Next: {cronPreview.next_runs.slice(0, 3).join(' / ')}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Field>

              <Field label="Prompt">
                <textarea value={form.prompt} onChange={e => setForm({ ...form, prompt: e.target.value })}
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 resize-none" rows={4} placeholder="What should the agent do?" />
              </Field>

              <Field label="Description (optional)">
                <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50" placeholder="Brief description of this job" />
              </Field>

              <div className="flex gap-2 pt-4 border-t border-lab-border">
                <button type="button" onClick={() => setShowAddForm(false)}
                  className="flex-1 px-3 py-2 border border-lab-border rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-1 px-3 py-2 bg-lab-accent text-white rounded-md text-xs font-medium hover:bg-lab-accent/90 transition-subtle">
                  Create Job
                </button>
              </div>
            </form>
          </div>
        ) : selectedJob ? (
          <div>
            {/* Job Header */}
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-sm font-semibold text-lab-text-primary">{selectedJob.name}</h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-lab-text-muted">{selectedJob.human_schedule || selectedJob.cron_expression}</span>
                  <span className="text-xs text-lab-text-muted">{getAgent(selectedJob.agent_id)?.name || 'Unknown Agent'}</span>
                </div>
                {selectedJob.description && (
                  <p className="text-xs text-lab-text-secondary mt-2">{selectedJob.description}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRunNow(selectedJob.id)}
                  disabled={runningJob === selectedJob.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-lab-accent/10 text-lab-accent rounded-md text-xs hover:bg-lab-accent/20 transition-subtle disabled:opacity-50"
                >
                  <Play size={12} /> {runningJob === selectedJob.id ? 'Running...' : 'Run Now'}
                </button>
                <button onClick={() => handleToggle(selectedJob.id)}
                  className={`px-3 py-1.5 rounded-md text-xs transition-subtle ${
                    selectedJob.enabled
                      ? 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                      : 'bg-white/[0.05] text-lab-text-muted hover:bg-white/[0.1]'
                  }`}>
                  {selectedJob.enabled ? 'Enabled' : 'Disabled'}
                </button>
                <button onClick={() => handleDelete(selectedJob.id)}
                  className="p-1.5 text-lab-text-muted hover:text-red-400 transition-subtle">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Prompt Preview */}
            <div className="mb-6 p-3 bg-white/[0.02] border border-lab-border rounded-lg">
              <div className="text-[10px] text-lab-text-muted uppercase tracking-wider mb-1">Prompt</div>
              <p className="text-xs text-lab-text-secondary leading-relaxed whitespace-pre-wrap">{selectedJob.prompt}</p>
            </div>

            {/* Execution History */}
            <div>
              <h3 className="text-xs font-semibold text-lab-text-secondary uppercase tracking-wider mb-3 flex items-center gap-2">
                <Clock size={12} /> Execution History
              </h3>

              {executions.length === 0 ? (
                <div className="text-center py-8 border border-lab-border rounded-lg">
                  <p className="text-sm text-lab-text-faint">No executions yet. Click Run Now or wait for the next scheduled run.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {executions.map(exec => (
                    <div key={exec.id} className="border border-lab-border rounded-lg overflow-hidden">
                      <button
                        onClick={() => setExpandedExec(expandedExec === exec.id ? null : exec.id)}
                        className="w-full p-3 hover:bg-white/[0.02] transition-subtle text-left"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <StatusBadge status={exec.status} />
                            <span className="text-xs text-lab-text-primary">{exec.agent_name}</span>
                            <span className="text-[10px] text-lab-text-muted">
                              {new Date(exec.executed_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {exec.rating && <RatingStars rating={exec.rating} size={10} />}
                            <ChevronDown size={14} className={`text-lab-text-muted transition-transform ${expandedExec === exec.id ? 'rotate-180' : ''}`} />
                          </div>
                        </div>
                        <p className="text-[10px] text-lab-text-muted mt-1 line-clamp-2">{exec.result_preview || exec.error}</p>
                      </button>

                      {expandedExec === exec.id && (
                        <div className="px-3 py-3 border-t border-lab-border bg-white/[0.02]">
                          {exec.error ? (
                            <div className="p-2 bg-red-500/5 border border-red-500/20 rounded text-xs text-red-400">{exec.error}</div>
                          ) : (
                            <p className="text-xs text-lab-text-secondary leading-relaxed whitespace-pre-wrap">{exec.result_preview}</p>
                          )}

                          {/* Feedback Section */}
                          <div className="mt-3 pt-3 border-t border-lab-border">
                            {exec.feedback ? (
                              <div className="flex items-start gap-2">
                                <RatingStars rating={exec.rating} size={12} />
                                <p className="text-[10px] text-lab-text-muted">{exec.feedback}</p>
                              </div>
                            ) : feedbackExec?.id === exec.id ? (
                              <div className="space-y-2">
                                <div className="flex items-center gap-1">
                                  {[1, 2, 3, 4, 5].map(n => (
                                    <button key={n} onClick={() => setFeedbackRating(n)}
                                      className={`transition-subtle ${n <= feedbackRating ? 'text-amber-400' : 'text-lab-text-muted/30 hover:text-amber-400/50'}`}>
                                      <Star size={16} fill={n <= feedbackRating ? 'currentColor' : 'none'} />
                                    </button>
                                  ))}
                                </div>
                                <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
                                  placeholder="What should improve?" rows={2}
                                  className="w-full bg-lab-bg border border-lab-border rounded px-2 py-1.5 text-[10px] text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 resize-none" />
                                <div className="flex gap-1 justify-end">
                                  <button onClick={() => { setFeedbackExec(null); setFeedbackRating(0); setFeedbackText('') }}
                                    className="px-2 py-0.5 text-[10px] text-lab-text-muted hover:text-lab-text-secondary transition-subtle">Cancel</button>
                                  <button onClick={handleFeedback} disabled={feedbackRating === 0}
                                    className="px-2 py-0.5 text-[10px] bg-lab-accent/20 text-lab-accent rounded hover:bg-lab-accent/30 transition-subtle disabled:opacity-30">Submit</button>
                                </div>
                              </div>
                            ) : (
                              <button onClick={() => { setFeedbackExec(exec); setFeedbackRating(0); setFeedbackText('') }}
                                className="text-[10px] text-lab-text-muted hover:text-lab-accent transition-subtle">
                                Rate this result
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-lab-text-faint">Select a job to view details and execution history</p>
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }) {
  if (status === 'success') return (
    <span className="flex items-center gap-1 text-[10px] text-emerald-400"><CheckCircle size={10} /> Success</span>
  )
  if (status === 'failed') return (
    <span className="flex items-center gap-1 text-[10px] text-red-400"><XCircle size={10} /> Failed</span>
  )
  return <span className="flex items-center gap-1 text-[10px] text-lab-text-muted">No runs yet</span>
}

function RatingStars({ rating, size = 12 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(n => (
        <Star key={n} size={size} className={n <= rating ? 'text-amber-400' : 'text-lab-text-muted/20'}
          fill={n <= rating ? 'currentColor' : 'none'} />
      ))}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-lab-text-secondary mb-2">{label}</label>
      {children}
    </div>
  )
}
