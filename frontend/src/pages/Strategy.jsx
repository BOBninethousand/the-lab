import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { AvatarCircle } from '../components/AvatarCircle'
import { parseUTC, serverNow } from '../lib/time'
import { StatCard } from '../components/StatCard'
import { useWebSocket } from '../hooks/useWebSocket'
import {
  getStrategies,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  getStrategyProgress,
  getAgents,
  getSchedule,
  getReport,
} from '../lib/api'
import {
  Target,
  Plus,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit3,
  Check,
  X,
  Pause,
  Play,
  FileText,
  Zap,
  Calendar,
  Link2,
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  DollarSign,
} from 'lucide-react'

const STATUS_COLOURS = {
  active: 'bg-emerald-500/20 text-emerald-400',
  paused: 'bg-amber-500/20 text-amber-400',
  completed: 'bg-blue-500/20 text-blue-400',
}

const STATUS_LABELS = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Done',
}

export function Strategy() {
  const [strategies, setStrategies] = useState([])
  const [agents, setAgents] = useState([])
  const [schedules, setSchedules] = useState([])
  const [progress, setProgress] = useState({})
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [statusFilter, setStatusFilter] = useState(null) // null = all
  const [error, setError] = useState(null)

  // Create form state
  const [form, setForm] = useState({
    title: '',
    problem: '',
    approach: '',
    agent_ids: [],
    schedule_ids: [],
    tags: [],
  })

  const [agentStatuses, setAgentStatuses] = useState({})
  const [viewingReport, setViewingReport] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)

  const navigate = useNavigate()
  const { events } = useWebSocket()

  // Track agent running/idle status via WebSocket
  useEffect(() => {
    if (events.length > 0) {
      const e = events[0]
      if (e.type === 'agent_status' && e.data?.id) {
        setAgentStatuses(prev => ({ ...prev, [e.data.id]: { status: e.data.status, current_task: e.data.current_task } }))
      }
      if (e.type === 'strategy_changed') {
        getStrategies().catch(() => []).then(d => setStrategies(Array.isArray(d) ? d : []))
      } else if (e.type === 'agent_created' && e.data) {
        setAgents(prev => prev.some(a => a.id === e.data.id) ? prev : [...prev, e.data])
      } else if (e.type === 'agent_deleted' && e.data?.id) {
        setAgents(prev => prev.filter(a => a.id !== e.data.id))
      } else if (e.type === 'schedule_changed') {
        getSchedule().catch(() => []).then(d => setSchedule(Array.isArray(d) ? d : []))
      }
    }
  }, [events])

  const handleViewReport = async (reportId) => {
    setLoadingReport(true)
    try {
      const report = await getReport(reportId)
      setViewingReport(report)
    } catch { showError('Failed to load report') }
    finally { setLoadingReport(false) }
  }

  const timeAgo = (isoStr) => {
    if (!isoStr) return ''
    const diff = serverNow().getTime() - parseUTC(isoStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  const getHealthColour = (prog) => {
    if (!prog || prog.success_rate_7d === null || prog.success_rate_7d === undefined) return 'bg-lab-text-muted/30'
    const lastExecMs = prog.last_execution_at ? serverNow().getTime() - parseUTC(prog.last_execution_at).getTime() : Infinity
    const within48h = lastExecMs < 48 * 60 * 60 * 1000
    const within7d = lastExecMs < 7 * 24 * 60 * 60 * 1000
    if (prog.success_rate_7d >= 80 && within48h) return 'bg-emerald-500'
    if (prog.success_rate_7d >= 50 || within7d) return 'bg-amber-500'
    return 'bg-red-500'
  }

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [strats, agentsData, schedData] = await Promise.all([
        getStrategies().catch(() => []),
        getAgents().catch(() => []),
        getSchedule().catch(() => []),
      ])
      setStrategies(Array.isArray(strats) ? strats : [])
      setAgents(Array.isArray(agentsData) ? agentsData : agentsData.agents || [])
      setSchedules(Array.isArray(schedData) ? schedData : schedData.schedule || [])
    } catch (err) {
      console.error('Failed to load strategy data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // Load progress when a strategy is expanded
  useEffect(() => {
    if (expandedId) {
      getStrategyProgress(expandedId)
        .then(p => setProgress(prev => ({ ...prev, [expandedId]: p })))
        .catch(() => {})
    }
  }, [expandedId])

  const showError = (msg) => {
    setError(msg)
    setTimeout(() => setError(null), 4000)
  }

  const handleCreate = async () => {
    if (!form.title.trim()) return
    try {
      await createStrategy(form)
      setForm({ title: '', problem: '', approach: '', agent_ids: [], schedule_ids: [], tags: [] })
      setShowCreate(false)
      loadData()
    } catch { showError('Failed to create strategy') }
  }

  const handleUpdate = async (id) => {
    try {
      await updateStrategy(id, form)
      setEditingId(null)
      setForm({ title: '', problem: '', approach: '', agent_ids: [], schedule_ids: [], tags: [] })
      loadData()
    } catch { showError('Failed to update strategy') }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this strategy? This cannot be undone.')) return
    try {
      await deleteStrategy(id)
      if (expandedId === id) setExpandedId(null)
      loadData()
    } catch { showError('Failed to delete strategy') }
  }

  const handleStatusToggle = async (strategy) => {
    const cycle = { active: 'paused', paused: 'completed', completed: 'active' }
    const nextStatus = cycle[strategy.status] || 'active'
    try {
      await updateStrategy(strategy.id, { status: nextStatus })
      loadData()
    } catch { showError('Failed to update status') }
  }

  const startEdit = (strategy) => {
    setEditingId(strategy.id)
    setForm({
      title: strategy.title,
      problem: strategy.problem || '',
      approach: strategy.approach || '',
      agent_ids: strategy.agent_ids || [],
      schedule_ids: strategy.schedule_ids || [],
      tags: strategy.tags || [],
    })
  }

  const toggleAgentId = (agentId) => {
    setForm(prev => ({
      ...prev,
      agent_ids: prev.agent_ids.includes(agentId)
        ? prev.agent_ids.filter(id => id !== agentId)
        : [...prev.agent_ids, agentId],
    }))
  }

  const toggleScheduleId = (schedId) => {
    setForm(prev => ({
      ...prev,
      schedule_ids: prev.schedule_ids.includes(schedId)
        ? prev.schedule_ids.filter(id => id !== schedId)
        : [...prev.schedule_ids, schedId],
    }))
  }

  const getAgentName = (id) => {
    const a = agents.find(a => a.id === id)
    return a ? a.name : id.slice(0, 8)
  }

  const activeCount = strategies.filter(s => s.status === 'active').length
  const totalAgentsLinked = new Set(strategies.flatMap(s => s.agent_ids || [])).size
  // Use auto-detected schedule counts from progress data when available
  const totalSchedulesLinked = Object.values(progress).reduce((sum, p) => sum + (p.schedule_count || 0), 0)

  return (
    <div className="space-y-8">
      {/* Header stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Strategies" value={strategies.length} isLoading={isLoading} />
        <StatCard label="Active" value={activeCount} isLoading={isLoading} />
        <StatCard label="Agents Linked" value={totalAgentsLinked} isLoading={isLoading} />
        <StatCard label="Schedules Linked" value={totalSchedulesLinked} isLoading={isLoading} />
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2.5 bg-red-500/90 text-white text-xs font-medium rounded-lg shadow-lg">
          {error}
        </div>
      )}

      {/* Header + Add button */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-section-label">Business Problems</h2>
          <p className="text-xs text-lab-text-muted mt-1">
            Define what you're solving, assign agents, and track progress
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(!showCreate); setEditingId(null) }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-lab-accent/20 text-lab-accent hover:bg-lab-accent/30 transition-subtle"
        >
          <Plus size={14} />
          New Strategy
        </button>
      </div>

      {/* Create / Edit form */}
      {(showCreate || editingId) && (
        <div className="card p-5 space-y-4 border border-lab-accent/30">
          <div className="text-xs font-semibold uppercase tracking-wider text-lab-text-muted">
            {editingId ? 'Edit Strategy' : 'New Strategy'}
          </div>

          <input
            type="text"
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Strategy title (e.g. Find qualified leads)"
            className="w-full bg-lab-elevated border border-lab-border rounded-md px-3 py-2 text-sm text-lab-text-primary placeholder:text-lab-text-faint focus:outline-none focus:border-lab-accent"
          />

          <textarea
            value={form.problem}
            onChange={e => setForm(prev => ({ ...prev, problem: e.target.value }))}
            placeholder="What problem does this solve? What's the current pain?"
            rows={2}
            className="w-full bg-lab-elevated border border-lab-border rounded-md px-3 py-2 text-sm text-lab-text-primary placeholder:text-lab-text-faint focus:outline-none focus:border-lab-accent resize-none"
          />

          <textarea
            value={form.approach}
            onChange={e => setForm(prev => ({ ...prev, approach: e.target.value }))}
            placeholder="How will agents tackle this? What's the approach?"
            rows={2}
            className="w-full bg-lab-elevated border border-lab-border rounded-md px-3 py-2 text-sm text-lab-text-primary placeholder:text-lab-text-faint focus:outline-none focus:border-lab-accent resize-none"
          />

          {/* Agent picker */}
          <div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-2">
              Assigned Agents
            </div>
            <div className="flex flex-wrap gap-2">
              {agents.map(agent => (
                <button
                  key={agent.id}
                  onClick={() => toggleAgentId(agent.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-subtle border ${
                    form.agent_ids.includes(agent.id)
                      ? 'border-lab-accent bg-lab-accent/10 text-lab-text-primary'
                      : 'border-lab-border bg-lab-elevated text-lab-text-secondary hover:bg-white/[0.03]'
                  }`}
                >
                  <AvatarCircle name={agent.name} agent={agent.name} size={16} />
                  {agent.name}
                </button>
              ))}
            </div>
          </div>

          {/* Schedule picker */}
          {schedules.length > 0 && (
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-2">
                Linked Schedules
              </div>
              <div className="flex flex-wrap gap-2">
                {schedules.map(sched => (
                  <button
                    key={sched.id}
                    onClick={() => toggleScheduleId(sched.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs transition-subtle border ${
                      form.schedule_ids.includes(sched.id)
                        ? 'border-lab-accent bg-lab-accent/10 text-lab-text-primary'
                        : 'border-lab-border bg-lab-elevated text-lab-text-secondary hover:bg-white/[0.03]'
                    }`}
                  >
                    <Calendar size={12} />
                    {sched.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => editingId ? handleUpdate(editingId) : handleCreate()}
              disabled={!form.title.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-lab-accent text-white hover:bg-lab-accent/90 transition-subtle disabled:opacity-40"
            >
              <Check size={14} />
              {editingId ? 'Save' : 'Create'}
            </button>
            <button
              onClick={() => { setShowCreate(false); setEditingId(null); setForm({ title: '', problem: '', approach: '', agent_ids: [], schedule_ids: [], tags: [] }) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
            >
              <X size={14} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Status filter */}
      {strategies.length > 0 && (
        <div className="flex items-center gap-1.5">
          {[
            { value: null, label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
            { value: 'completed', label: 'Done' },
          ].map(opt => (
            <button
              key={opt.label}
              onClick={() => setStatusFilter(opt.value)}
              className={`px-2.5 py-1 rounded-md text-xs transition-subtle ${
                statusFilter === opt.value
                  ? 'bg-lab-accent/15 text-lab-accent font-medium'
                  : 'text-lab-text-muted hover:bg-white/[0.03]'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Strategy list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 bg-lab-surface rounded animate-pulse" />
          ))}
        </div>
      ) : strategies.length === 0 ? (
        <div className="card text-center py-12">
          <Target size={28} className="mx-auto text-lab-text-muted mb-3" />
          <p className="text-sm text-lab-text-secondary mb-1">No strategies yet</p>
          <p className="text-xs text-lab-text-muted">
            Define the business problems you want agents to solve
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {strategies.filter(s => !statusFilter || s.status === statusFilter).map(strategy => {
            const isExpanded = expandedId === strategy.id
            const prog = progress[strategy.id]
            const agentNames = (strategy.agent_ids || []).map(getAgentName)

            return (
              <div key={strategy.id} className="card p-0 overflow-hidden">
                {/* Header row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : strategy.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.01] transition-subtle"
                >
                  {isExpanded
                    ? <ChevronDown size={14} className="text-lab-text-muted flex-shrink-0" />
                    : <ChevronRight size={14} className="text-lab-text-muted flex-shrink-0" />
                  }
                  <Target size={16} className="text-lab-accent flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-lab-text-primary">{strategy.title}</div>
                    {strategy.problem && (
                      <div className="text-[11px] text-lab-text-muted mt-0.5 truncate">
                        {strategy.problem}
                      </div>
                    )}
                  </div>

                  {/* Agent avatars */}
                  <div className="flex -space-x-1.5 mr-2">
                    {agentNames.slice(0, 4).map((name, i) => (
                      <AvatarCircle key={i} name={name} agent={name} size={20} />
                    ))}
                  </div>

                  {/* Status badge */}
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLOURS[strategy.status] || STATUS_COLOURS.active}`}>
                    {STATUS_LABELS[strategy.status] || 'Active'}
                  </span>
                </button>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="border-t border-lab-border">
                    {/* Health bar */}
                    <div className={`h-[3px] ${getHealthColour(prog)} transition-all duration-500`} />

                    <div className="px-5 py-4 space-y-4">
                      {/* Health label + last run */}
                      {prog && (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {prog.success_rate_7d !== null && prog.success_rate_7d !== undefined && (
                              <span className={`text-[11px] font-medium ${prog.success_rate_7d >= 80 ? 'text-emerald-400' : prog.success_rate_7d >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
                                {prog.success_rate_7d}% success rate (7d)
                              </span>
                            )}
                            {prog.total_cost_7d > 0 && (
                              <span className="flex items-center gap-1 text-[11px] text-lab-text-muted">
                                <DollarSign size={10} />${prog.total_cost_7d.toFixed(2)}
                              </span>
                            )}
                          </div>
                          {prog.last_execution_at && (
                            <span className="flex items-center gap-1 text-[11px] text-lab-text-muted">
                              <Clock size={10} />
                              Last run {timeAgo(prog.last_execution_at)}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Approach */}
                      {strategy.approach && (
                        <div>
                          <div className="text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-1">
                            Approach
                          </div>
                          <p className="text-xs text-lab-text-secondary leading-relaxed">
                            {strategy.approach}
                          </p>
                        </div>
                      )}

                      {/* Assigned Agents with status dots */}
                      {agentNames.length > 0 && (
                        <div>
                          <div className="text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-2">
                            Assigned Agents
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(strategy.agent_ids || []).map((id, i) => {
                              const name = getAgentName(id)
                              const status = agentStatuses[id]
                              const isWorking = status?.status === 'working'
                              return (
                                <span key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-lab-elevated text-lab-text-secondary border border-lab-border">
                                  <span className="relative flex-shrink-0">
                                    <AvatarCircle name={name} agent={name} size={14} />
                                    <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-lab-surface ${isWorking ? 'bg-emerald-400 animate-pulse' : 'bg-lab-text-muted/40'}`} />
                                  </span>
                                  {name}
                                  {isWorking && status.current_task && (
                                    <span className="text-[10px] text-emerald-400/70 ml-1">{status.current_task}</span>
                                  )}
                                </span>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Schedules */}
                      {prog?.schedules?.length > 0 && (
                        <div>
                          <div className="text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-2">
                            Schedules
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {prog.schedules.map(sched => (
                              <button
                                key={sched.id}
                                onClick={() => navigate('/calendar')}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs bg-lab-elevated text-lab-text-secondary border border-lab-border hover:bg-white/[0.03] transition-subtle"
                              >
                                <Calendar size={12} className="text-lab-text-muted" />
                                <span>{sched.name}</span>
                                <span className="text-[10px] text-lab-text-faint">{sched.cron}</span>
                                {!sched.enabled && (
                                  <span className="px-1 py-0.5 rounded text-[9px] text-lab-text-muted bg-white/[0.05]">OFF</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* No schedules hint */}
                      {prog && prog.schedule_count === 0 && agentNames.length > 0 && (
                        <div className="p-3 rounded-lg border border-amber-500/20 bg-amber-500/5">
                          <p className="text-xs text-amber-400/80">
                            No scheduled jobs found for {agentNames.join(' or ')}. Create jobs in Calendar so agents produce reports automatically.
                          </p>
                          <button
                            onClick={() => navigate('/calendar')}
                            className="mt-2 flex items-center gap-1.5 px-3 py-1 text-[11px] font-medium rounded-md bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-subtle"
                          >
                            <Calendar size={12} />
                            Go to Calendar
                          </button>
                        </div>
                      )}

                      {/* Activity Timeline — last 5 executions */}
                      {prog?.recent_executions?.length > 0 && (
                        <div>
                          <div className="text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-2">
                            Recent Activity
                          </div>
                          <div className="space-y-1.5">
                            {prog.recent_executions.map((exec, i) => (
                              <div key={exec.id || i} className="flex items-start gap-2 p-2 rounded-md bg-lab-elevated/50 border border-lab-border/50">
                                {exec.status === 'success'
                                  ? <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                                  : <XCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                                }
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-lab-text-primary truncate">
                                      {exec.agent_name} — {exec.job_name}
                                    </span>
                                    <span className="text-[10px] text-lab-text-faint flex-shrink-0">{timeAgo(exec.executed_at)}</span>
                                  </div>
                                  {exec.status === 'failed' && exec.error ? (
                                    <p className="text-[11px] text-red-400/80 mt-0.5 truncate">{exec.error}</p>
                                  ) : exec.result_preview ? (
                                    <p className="text-[11px] text-lab-text-muted mt-0.5 line-clamp-2">{exec.result_preview.slice(0, 150)}</p>
                                  ) : null}
                                </div>
                                {exec.result_document_id && (
                                  <button
                                    onClick={() => handleViewReport(exec.result_document_id)}
                                    className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-lab-accent hover:bg-lab-accent/10 rounded transition-subtle flex-shrink-0"
                                  >
                                    <Eye size={10} /> View
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Recent Reports — last 3 */}
                      {prog?.recent_reports?.length > 0 && (
                        <div>
                          <div className="text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-2">
                            Latest Reports
                          </div>
                          <div className="space-y-1.5">
                            {prog.recent_reports.map((rpt, i) => (
                              <div key={rpt.id || i} className="flex items-center gap-2 p-2 rounded-md bg-lab-elevated/50 border border-lab-border/50">
                                <AvatarCircle name={rpt.agent_name} agent={rpt.agent_name} size={16} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs text-lab-text-primary truncate">{rpt.title}</div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-lab-text-muted">{rpt.agent_name}</span>
                                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-white/[0.04] text-lab-text-faint">{rpt.report_type}</span>
                                  </div>
                                </div>
                                <span className="text-[10px] text-lab-text-faint flex-shrink-0">{timeAgo(rpt.created_at)}</span>
                                <button
                                  onClick={() => handleViewReport(rpt.id)}
                                  className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] text-lab-accent hover:bg-lab-accent/10 rounded transition-subtle flex-shrink-0"
                                >
                                  <Eye size={10} /> View
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Summary stats row */}
                      {prog && (prog.reports_count > 0 || prog.executions_total > 0) && (
                        <div className="flex flex-wrap items-center gap-4 text-[11px] text-lab-text-muted py-1">
                          <span className="flex items-center gap-1">
                            <FileText size={11} /> {prog.reports_count} reports ({prog.reports_this_week} this week)
                          </span>
                          <span className="flex items-center gap-1">
                            <Zap size={11} /> {prog.executions_successful}/{prog.executions_total} executions
                          </span>
                          <span className="flex items-center gap-1">
                            <Link2 size={11} /> {prog.schedule_count} schedules
                          </span>
                        </div>
                      )}

                      {/* Quick links */}
                      <div className="flex flex-wrap gap-2">
                        {agentNames.length > 0 && (
                          <button
                            onClick={() => navigate(`/documents?agent=${agentNames.join(',')}`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md bg-lab-accent/10 text-lab-accent hover:bg-lab-accent/20 transition-subtle"
                          >
                            <FileText size={12} />
                            View All Reports {prog ? `(${prog.reports_count})` : ''}
                          </button>
                        )}
                        {prog?.schedule_count > 0 && (
                          <button
                            onClick={() => navigate('/calendar')}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md bg-white/[0.04] text-lab-text-secondary hover:bg-white/[0.06] transition-subtle"
                          >
                            <Calendar size={12} />
                            View Schedules ({prog.schedule_count})
                          </button>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 pt-2 border-t border-lab-border">
                        <button
                          onClick={() => handleStatusToggle(strategy)}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
                        >
                          {strategy.status === 'active'
                            ? <><Pause size={12} /> Pause</>
                            : strategy.status === 'paused'
                            ? <><Check size={12} /> Complete</>
                            : <><Play size={12} /> Reactivate</>
                          }
                        </button>
                        <button
                          onClick={() => startEdit(strategy)}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
                        >
                          <Edit3 size={12} /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(strategy.id)}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] rounded-md text-red-400/70 hover:bg-red-500/10 transition-subtle ml-auto"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Report viewer modal */}
      {viewingReport && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setViewingReport(null)}>
          <div className="card-elevated w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-lab-border flex-shrink-0">
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-lab-text-primary truncate">{viewingReport.title}</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[11px] text-lab-text-muted">{viewingReport.agent_name}</span>
                  {viewingReport.report_type && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-white/[0.04] text-lab-text-faint">{viewingReport.report_type}</span>
                  )}
                </div>
              </div>
              <button onClick={() => setViewingReport(null)} className="p-1 hover:bg-white/[0.05] rounded transition-subtle">
                <X size={16} className="text-lab-text-muted" />
              </button>
            </div>
            <div className="overflow-y-auto px-5 py-5">
              <div className="prose prose-invert prose-sm max-w-none
                prose-headings:text-lab-text-primary prose-headings:font-semibold
                prose-p:text-lab-text-secondary prose-p:leading-relaxed
                prose-strong:text-lab-text-primary
                prose-a:text-lab-accent prose-a:no-underline hover:prose-a:underline
                prose-code:text-lab-text-secondary prose-code:bg-lab-elevated prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                prose-pre:bg-lab-elevated prose-pre:border prose-pre:border-lab-border prose-pre:rounded-md
                prose-li:text-lab-text-secondary
                prose-table:border-collapse prose-th:border prose-th:border-lab-border prose-th:px-3 prose-th:py-1.5 prose-th:text-lab-text-primary prose-th:bg-lab-surface
                prose-td:border prose-td:border-lab-border prose-td:px-3 prose-td:py-1.5 prose-td:text-lab-text-secondary
                prose-blockquote:border-lab-border prose-blockquote:text-lab-text-muted
                prose-hr:border-lab-border
              ">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {viewingReport.content || 'No content available.'}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Loading overlay for report fetch */}
      {loadingReport && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="card-elevated px-6 py-4 text-xs text-lab-text-secondary">Loading report...</div>
        </div>
      )}
    </div>
  )
}
