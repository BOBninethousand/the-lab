import { useState, useEffect } from 'react'
import { EmptyState } from '../components/EmptyState'
import { StatCard } from '../components/StatCard'
import { AgentRow } from '../components/AgentRow'
import { ActivityList } from '../components/ActivityList'
import { useWebSocket } from '../hooks/useWebSocket'
import { getAgents, getSchedule, getReports, getReportStats, getNotionStatus, getValueMetrics, getStrategies, getCostToday, getCostSummary } from '../lib/api'
import { formatDistanceToNow } from '../lib/time'
import { AvatarCircle } from '../components/AvatarCircle'
import { Link, useNavigate } from 'react-router-dom'
import { Clock, FileText, Zap, Bot, ExternalLink, Target, Brain, ShieldCheck, CheckCircle2, XCircle, AlertCircle } from 'lucide-react'

const AGENT_COLORS = {
  Scout: '#3b6fcc',
  Quill: '#c4682d',
  Forge: '#7c5bbf',
  Radar: '#1d8fa0',
}

function formatCountdown(isoTimestamp) {
  if (!isoTimestamp) return null
  const diff = Math.max(0, new Date(isoTimestamp) - new Date())
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export function Dashboard() {
  const [agents, setAgents] = useState([])
  const [schedule, setSchedule] = useState([])
  const [latestReports, setLatestReports] = useState([])
  const [reportStats, setReportStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [notionStatus, setNotionStatus] = useState(null)
  const [valueMetrics, setValueMetrics] = useState(null)
  const [strategies, setStrategies] = useState([])
  const [costToday, setCostToday] = useState(null)
  const [costSummary, setCostSummary] = useState(null)
  const { events, isConnected } = useWebSocket()
  const navigate = useNavigate()

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [agentsData, scheduleData, reportsData, rStatsData, nStatus, vMetrics, stratData, cToday, cSummary] = await Promise.all([
        getAgents().catch(() => []),
        getSchedule().catch(() => []),
        getReports({ limit: 4 }).catch(() => []),
        getReportStats().catch(() => null),
        getNotionStatus().catch(() => null),
        getValueMetrics().catch(() => null),
        getStrategies().catch(() => []),
        getCostToday().catch(() => null),
        getCostSummary(7).catch(() => null),
      ])

      setAgents(Array.isArray(agentsData) ? agentsData : (agentsData.agents || []))
      setSchedule(Array.isArray(scheduleData) ? scheduleData : (scheduleData.schedule || []))
      setLatestReports(Array.isArray(reportsData) ? reportsData : [])
      if (rStatsData) setReportStats(rStatsData)
      if (nStatus) setNotionStatus(nStatus)
      if (vMetrics) setValueMetrics(vMetrics)
      setStrategies(Array.isArray(stratData) ? stratData : [])
      if (cToday) setCostToday(cToday)
      if (cSummary) setCostSummary(cSummary)
    } catch (err) {
      console.error('Failed to load dashboard data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  // Reactive state updates on WebSocket events — no full reloads
  useEffect(() => {
    if (events.length === 0) return
    const e = events[0]
    setActivity(events)

    if (e.type === 'agent_created' && e.data) {
      setAgents(prev => prev.some(a => a.id === e.data.id) ? prev : [...prev, e.data])
    } else if (e.type === 'agent_deleted' && e.data?.id) {
      setAgents(prev => prev.filter(a => a.id !== e.data.id))
    } else if (e.type === 'agent_status' && e.data?.id) {
      setAgents(prev => prev.map(a => a.id === e.data.id ? { ...a, status: e.data.status, current_task: e.data.current_task } : a))
    } else if (e.type === 'report_created' && e.data) {
      setLatestReports(prev => [e.data, ...prev].slice(0, 4))
      setReportStats(prev => prev ? { ...prev, total: prev.total + 1, today: prev.today + 1 } : prev)
    } else if (e.type === 'schedule_changed') {
      getSchedule().catch(() => []).then(d => setSchedule(Array.isArray(d) ? d : []))
    } else if (e.type === 'strategy_changed') {
      getStrategies().catch(() => []).then(d => setStrategies(Array.isArray(d) ? d : []))
    } else if (e.type === 'report_updated') {
      getReports({ limit: 4 }).catch(() => []).then(d => setLatestReports(Array.isArray(d) ? d : []))
    }
  }, [events])

  const workingAgents = agents.filter(a => a.status === 'working').length
  const enabledJobs = schedule.filter(j => j.enabled !== false)
  const nextJob = enabledJobs
    .filter(j => j.next_run)
    .sort((a, b) => new Date(a.next_run) - new Date(b.next_run))[0]

  const TYPE_LABELS = { briefing: 'Briefing', content: 'Content', tech_report: 'Tech Report', outreach: 'Outreach', weekly_review: 'Weekly Review', content_calendar: 'Calendar' }

  // 7-day chart data
  const chartDays = (() => {
    const days = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date()
      d.setDate(d.getDate() - i)
      days.push(d.toISOString().slice(0, 10))
    }
    const spendMap = {}
    if (costSummary?.daily_spend) {
      costSummary.daily_spend.forEach(d => { spendMap[d.date] = d.cost_usd })
    }
    return days.map(date => ({
      label: new Date(date + 'T00:00').toLocaleDateString('en', { weekday: 'short' }),
      value: spendMap[date] || 0,
    }))
  })()
  const chartMax = Math.max(...chartDays.map(d => d.value), 0.01)

  const budgetPct = costToday && costToday.budget_usd > 0
    ? Math.min(100, (costToday.spend_usd / costToday.budget_usd) * 100)
    : 0

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Agents"
          value={workingAgents > 0 ? `${workingAgents} working` : `${agents.length} idle`}
          isLoading={isLoading}
        />
        <StatCard label="Reports Today" value={reportStats?.today ?? 0} isLoading={isLoading} />
        <div className="card">
          <div className="text-xs font-semibold uppercase tracking-wider text-lab-text-muted mb-3">
            Today's Spend
          </div>
          {isLoading ? (
            <div className="h-7 bg-lab-elevated rounded animate-pulse" />
          ) : (
            <>
              <div className="text-stat">
                ${costToday ? costToday.spend_usd.toFixed(2) : '0.00'}
              </div>
              {costToday && costToday.budget_usd > 0 && (
                <div className="mt-2">
                  <div className="w-full h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        budgetPct > 90 ? 'bg-lab-error' : budgetPct > 70 ? 'bg-lab-warning' : 'bg-lab-success'
                      }`}
                      style={{ width: `${budgetPct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-lab-text-faint mt-1">
                    of ${costToday.budget_usd.toFixed(2)} budget
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <StatCard label="Unread" value={reportStats?.unread ?? 0} isLoading={isLoading} />
      </div>

      {/* Next Up */}
      {nextJob && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-lab-accent/20 bg-lab-accent/[0.03]">
          <AvatarCircle name={nextJob.agent_name} agent={nextJob.agent_name} size={24} />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-lab-text-muted">Next up</span>
            <div className="text-sm font-medium text-lab-text-primary truncate">{nextJob.name}</div>
          </div>
          <div className="text-sm font-semibold text-lab-accent">
            in {formatCountdown(nextJob.next_run)}
          </div>
        </div>
      )}

      {/* 7-Day Activity */}
      {costSummary && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-section-label">7-Day Spend</h2>
            <Link to="/costs" className="text-xs text-lab-text-muted hover:text-lab-text-secondary transition-subtle">
              View details
            </Link>
          </div>
          <div className="card p-4">
            <div className="flex items-end gap-1.5 h-16">
              {chartDays.map((day, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                  <div className="w-full flex items-end justify-center" style={{ height: '48px' }}>
                    <div
                      className="w-full max-w-[28px] rounded-sm bg-lab-accent/60 hover:bg-lab-accent transition-subtle"
                      style={{ height: `${Math.max(2, (day.value / chartMax) * 48)}px` }}
                      title={`$${day.value.toFixed(2)}`}
                    />
                  </div>
                  <span className="text-[9px] text-lab-text-faint">{day.label}</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-lab-border">
              <span className="text-[10px] text-lab-text-muted">7-day total</span>
              <span className="text-xs font-semibold text-lab-text-primary">
                ${costSummary.total_cost_usd?.toFixed(2) ?? '0.00'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Notion Activity */}
      {notionStatus && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-section-label">Notion</h2>
              {notionStatus.connected ? (
                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Connected — {notionStatus.database_name}
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-red-400">
                  <span className="w-1.5 h-1.5 bg-red-400 rounded-full" /> Not connected
                </span>
              )}
            </div>
          </div>

          {!notionStatus.connected ? (
            <div className="card p-4">
              <p className="text-xs text-lab-text-secondary mb-2">{notionStatus.reason}</p>
              <p className="text-[10px] text-lab-text-muted">Set NOTION_API_KEY and NOTION_DATABASE_ID in .env, then share the page with The Lab integration.</p>
            </div>
          ) : (
            (() => {
              const publishedReports = latestReports.filter(r => r.notion_page_url)
              return publishedReports.length > 0 ? (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {publishedReports.slice(0, 4).map(r => (
                    <a key={r.id} href={r.notion_page_url} target="_blank" rel="noopener noreferrer"
                      className="flex-shrink-0 w-56 p-3 border border-emerald-500/20 bg-emerald-500/[0.03] rounded-lg hover:bg-emerald-500/[0.06] transition-subtle">
                      <div className="flex items-center gap-2 mb-1">
                        <AvatarCircle name={r.agent_name} agent={r.agent_name} size={18} />
                        <span className="text-[10px] text-lab-text-muted">{r.agent_name}</span>
                        <ExternalLink size={10} className="text-emerald-400 ml-auto" />
                      </div>
                      <p className="text-xs text-lab-text-primary font-medium truncate">{r.title}</p>
                      <p className="text-[10px] text-lab-text-muted mt-0.5">{formatDistanceToNow(r.created_at)}</p>
                    </a>
                  ))}
                </div>
              ) : (
                <div className="card"><EmptyState icon={FileText} title="No published reports" description="Reports auto-publish to Notion when agents generate them" /></div>
              )
            })()
          )}
        </div>
      )}

      {/* Active Strategies */}
      {strategies.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-section-label">Active Strategies</h2>
            <Link
              to="/strategy"
              className="text-xs text-lab-text-muted hover:text-lab-text-secondary transition-subtle"
            >
              View all
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {strategies.filter(s => s.status === 'active').slice(0, 3).map(strategy => (
              <Link
                key={strategy.id}
                to="/strategy"
                className="card p-3 hover:bg-white/[0.02] transition-subtle"
              >
                <div className="flex items-center gap-2 mb-2">
                  <Target size={14} className="text-lab-accent" />
                  <span className="text-xs font-medium text-lab-text-primary truncate">{strategy.title}</span>
                </div>
                {strategy.problem && (
                  <p className="text-[10px] text-lab-text-muted line-clamp-2 mb-2">{strategy.problem}</p>
                )}
                <div className="flex items-center gap-1.5">
                  {(strategy.agent_ids || []).slice(0, 3).map((aid, i) => {
                    const agent = agents.find(a => a.id === aid)
                    return agent ? (
                      <AvatarCircle key={i} name={agent.name} agent={agent.name} size={16} />
                    ) : null
                  })}
                  <span className="text-[10px] text-lab-text-faint ml-1">
                    {(strategy.agent_ids || []).length} agents
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* System Overview */}
      {valueMetrics && (
        <div>
          <div className="mb-4">
            <h2 className="text-section-label">System Overview</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText size={12} className="text-lab-text-muted" />
                <span className="text-[10px] text-lab-text-muted">Total Reports</span>
              </div>
              <div className="text-lg font-semibold text-lab-text-primary">{valueMetrics.total_reports}</div>
            </div>
            <div className="card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Brain size={12} className="text-lab-text-muted" />
                <span className="text-[10px] text-lab-text-muted">Knowledge</span>
              </div>
              <div className="text-lg font-semibold text-lab-text-primary">{valueMetrics.knowledge_entries + valueMetrics.agent_memories}</div>
            </div>
            <div className="card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ShieldCheck size={12} className="text-lab-text-muted" />
                <span className="text-[10px] text-lab-text-muted">Guardrails</span>
              </div>
              <div className="text-lg font-semibold text-emerald-400">{valueMetrics.auto_rules}</div>
            </div>
            <div className="card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Target size={12} className="text-lab-text-muted" />
                <span className="text-[10px] text-lab-text-muted">Strategies</span>
              </div>
              <div className="text-lg font-semibold text-lab-text-primary">{valueMetrics.strategies_count}</div>
            </div>
            <div className="card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Zap size={12} className="text-lab-text-muted" />
                <span className="text-[10px] text-lab-text-muted">30d Spend</span>
              </div>
              <div className="text-lg font-semibold text-lab-text-primary">${typeof valueMetrics.total_cost_30d === 'number' ? valueMetrics.total_cost_30d.toFixed(2) : '0.00'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Latest Reports */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-section-label">Latest Reports</h2>
          <Link
            to="/documents"
            className="text-xs text-lab-text-muted hover:text-lab-text-secondary transition-subtle"
          >
            View all
          </Link>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-lab-surface rounded animate-pulse" />
            ))}
          </div>
        ) : latestReports.length === 0 ? (
          <div className="card"><EmptyState icon={FileText} title="No reports yet" description="Agents are scheduled and will produce reports automatically" /></div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {latestReports.map(report => (
              <button
                key={report.id}
                onClick={() => navigate(`/documents?report=${report.id}`)}
                className="card text-left hover:bg-white/[0.02] transition-subtle p-3"
                style={{ borderLeft: `3px solid ${AGENT_COLORS[report.agent_name] || '#6b7280'}` }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <AvatarCircle name={report.agent_name} agent={report.agent_name} size={20} />
                  <span className="text-[11px] text-lab-text-muted">{report.agent_name}</span>
                  <span className="text-[10px] text-lab-text-faint ml-auto">{formatDistanceToNow(report.created_at)}</span>
                </div>
                <div className="text-xs font-medium text-lab-text-primary truncate mb-1">{report.title}</div>
                <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/[0.06] text-lab-text-muted mb-1.5">
                  {TYPE_LABELS[report.report_type] || report.report_type}
                </span>
                <p className="text-[11px] text-lab-text-muted line-clamp-2 leading-relaxed">
                  {report.content?.replace(/[#*_\n]/g, ' ').trim().slice(0, 120)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — Agents + Schedule */}
        <div className="col-span-2 space-y-6">
          {/* Agents */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-section-label">Agents</h2>
              <Link
                to="/agents"
                className="text-xs text-lab-text-muted hover:text-lab-text-secondary transition-subtle"
              >
                View all
              </Link>
            </div>
            <div className="card bg-transparent border-0 p-0">
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-12 bg-lab-surface rounded animate-pulse" />
                  ))}
                </div>
              ) : agents.length === 0 ? (
                <EmptyState icon={Bot} title="No agents online" description="Create agents to get started" />
              ) : (
                <div className="border border-lab-border rounded-md overflow-hidden">
                  {agents.map(agent => (
                    <AgentRow key={agent.id} agent={agent} onClick={() => navigate('/agents')} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Agent Schedule — real data from API */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-section-label">Agent Schedule</h2>
              <Link
                to="/calendar"
                className="text-xs text-lab-text-muted hover:text-lab-text-secondary transition-subtle"
              >
                Manage
              </Link>
            </div>
            {isLoading ? (
              <div className="card p-0 overflow-hidden">
                <div className="space-y-0">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-11 border-b border-lab-border animate-pulse bg-lab-surface" />
                  ))}
                </div>
              </div>
            ) : enabledJobs.length === 0 ? (
              <div className="card"><EmptyState icon={Clock} title="No scheduled jobs" description="Create jobs in the Calendar tab" /></div>
            ) : (
              <div className="card p-0 overflow-hidden">
                <div className="divide-y divide-lab-border">
                  {enabledJobs.slice(0, 8).map(job => {
                    const countdown = formatCountdown(job.next_run)
                    return (
                      <div key={job.id} className="flex items-center gap-3 px-4 py-2.5">
                        <AvatarCircle name={job.agent_name} agent={job.agent_name} size={22} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-lab-text-primary">{job.name}</span>
                        </div>
                        {job.last_status === 'success' ? (
                          <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0" />
                        ) : job.last_status === 'failed' ? (
                          <XCircle size={12} className="text-lab-error flex-shrink-0" />
                        ) : (
                          <AlertCircle size={12} className="text-lab-text-faint flex-shrink-0" />
                        )}
                        <span className="text-[10px] text-lab-text-muted px-2 py-0.5 bg-lab-elevated rounded flex-shrink-0">
                          {job.human_schedule || job.cron_expression}
                        </span>
                        {countdown && (
                          <span className="text-[10px] text-lab-text-secondary font-medium w-14 text-right flex-shrink-0">
                            in {countdown}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
                {enabledJobs.length > 8 && (
                  <div className="px-4 py-2 border-t border-lab-border">
                    <Link to="/calendar" className="text-[10px] text-lab-text-muted hover:text-lab-text-secondary transition-subtle">
                      +{enabledJobs.length - 8} more jobs
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right column — Activity */}
        <div className="col-span-1">
          <div className="mb-4">
            <h2 className="text-section-label">Activity</h2>
          </div>
          <div className="card">
            <ActivityList events={activity} isLoading={isLoading} />
          </div>
        </div>
      </div>
    </div>
  )
}
