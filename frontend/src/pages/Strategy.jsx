import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AvatarCircle } from '../components/AvatarCircle'
import { StatCard } from '../components/StatCard'
import {
  getStrategies,
  createStrategy,
  updateStrategy,
  deleteStrategy,
  getStrategyProgress,
  getAgents,
  getSchedule,
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
  Brain,
  Calendar,
  Link2,
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

  const navigate = useNavigate()

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
                  <div className="border-t border-lab-border px-5 py-4 space-y-4">
                    {/* Problem & Approach */}
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

                    {/* Linked agents */}
                    {agentNames.length > 0 && (
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-2">
                          Assigned Agents
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {agentNames.map((name, i) => (
                            <span key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-lab-elevated text-lab-text-secondary border border-lab-border">
                              <AvatarCircle name={name} agent={name} size={14} />
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Schedules (auto-detected from agents + manually linked) */}
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

                    {/* Progress metrics */}
                    {prog && (prog.reports_count > 0 || prog.executions_total > 0) && (
                      <div>
                        <div className="text-[10px] font-medium uppercase tracking-wider text-lab-text-muted mb-2">
                          Progress
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="bg-lab-elevated rounded-md p-3 border border-lab-border">
                            <div className="flex items-center gap-1.5 mb-1">
                              <FileText size={12} className="text-lab-text-muted" />
                              <span className="text-[10px] text-lab-text-muted">Reports</span>
                            </div>
                            <div className="text-lg font-semibold text-lab-text-primary">{prog.reports_count}</div>
                          </div>
                          <div className="bg-lab-elevated rounded-md p-3 border border-lab-border">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Zap size={12} className="text-lab-text-muted" />
                              <span className="text-[10px] text-lab-text-muted">Executions</span>
                            </div>
                            <div className="text-lg font-semibold text-lab-text-primary">{prog.executions_successful}/{prog.executions_total}</div>
                          </div>
                          <div className="bg-lab-elevated rounded-md p-3 border border-lab-border">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Brain size={12} className="text-lab-text-muted" />
                              <span className="text-[10px] text-lab-text-muted">Agents</span>
                            </div>
                            <div className="text-lg font-semibold text-lab-text-primary">{prog.agent_count}</div>
                          </div>
                          <div className="bg-lab-elevated rounded-md p-3 border border-lab-border">
                            <div className="flex items-center gap-1.5 mb-1">
                              <Link2 size={12} className="text-lab-text-muted" />
                              <span className="text-[10px] text-lab-text-muted">Schedules</span>
                            </div>
                            <div className="text-lg font-semibold text-lab-text-primary">{prog.schedule_count}</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Quick links to results */}
                    <div className="flex flex-wrap gap-2">
                      {agentNames.length > 0 && (
                        <button
                          onClick={() => navigate(`/documents?agent=${agentNames.join(',')}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md bg-lab-accent/10 text-lab-accent hover:bg-lab-accent/20 transition-subtle"
                        >
                          <FileText size={12} />
                          View Reports {prog ? `(${prog.reports_count})` : ''}
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
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
