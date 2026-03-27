import { useState, useEffect } from 'react'
import { StatCard } from '../components/StatCard'
import { AgentRow } from '../components/AgentRow'
import { ActivityList } from '../components/ActivityList'
import { useWebSocket } from '../hooks/useWebSocket'
import { getAgents, getSchedule, getCrews, getTasks, getReports, getReportStats, getNotionStatus, getValueMetrics, getStrategies } from '../lib/api'
import { formatDistanceToNow } from '../lib/time'
import { AvatarCircle } from '../components/AvatarCircle'
import { Link, useNavigate } from 'react-router-dom'
import { Clock, FileText, Zap, Bot, ExternalLink, Target, Brain, ShieldCheck } from 'lucide-react'

const AGENT_COLORS = {
  Scout: '#3b6fcc',
  Quill: '#c4682d',
  Forge: '#7c5bbf',
  Radar: '#1d8fa0',
}

const AGENT_SCHEDULE = [
  { agent: 'Forge', task: 'Tech Report', time: '07:00', days: 'Daily', type: 'tech_report' },
  { agent: 'Scout', task: 'Weekly Opportunities', time: '07:00', days: 'Mon', type: 'briefing' },
  { agent: 'Scout', task: 'Morning Briefing', time: '08:00', days: 'Daily', type: 'briefing' },
  { agent: 'Quill', task: 'Daily Content', time: '09:00', days: 'Daily', type: 'content' },
  { agent: 'Radar', task: 'Outreach Package', time: '10:00', days: 'Daily', type: 'outreach' },
  { agent: 'Quill', task: 'Content Calendar', time: '20:00', days: 'Sun', type: 'content_calendar' },
]

function getNextRun(time, days) {
  const now = new Date()
  const [h, m] = time.split(':').map(Number)
  const target = new Date(now)
  target.setHours(h, m, 0, 0)

  if (days === 'Daily') {
    if (target <= now) target.setDate(target.getDate() + 1)
  } else {
    const dayMap = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 }
    const targetDay = dayMap[days]
    if (targetDay !== undefined) {
      const currentDay = now.getDay()
      let daysUntil = (targetDay - currentDay + 7) % 7
      if (daysUntil === 0 && target <= now) daysUntil = 7
      target.setDate(target.getDate() + daysUntil)
    } else if (target <= now) {
      target.setDate(target.getDate() + 1)
    }
  }
  return target
}

function formatCountdown(target) {
  const diff = Math.max(0, target - new Date())
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${mins}m`
  return `${mins}m`
}

export function Dashboard() {
  const [agents, setAgents] = useState([])
  const [schedule, setSchedule] = useState([])
  const [crews, setCrews] = useState([])
  const [tasks, setTasks] = useState([])
  const [latestReports, setLatestReports] = useState([])
  const [reportStats, setReportStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [notionStatus, setNotionStatus] = useState(null)
  const [valueMetrics, setValueMetrics] = useState(null)
  const [strategies, setStrategies] = useState([])
  const { events, isConnected } = useWebSocket()
  const navigate = useNavigate()

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [agentsData, scheduleData, crewsData, tasksData, reportsData, rStatsData, nStatus, vMetrics, stratData] = await Promise.all([
        getAgents().catch(() => []),
        getSchedule().catch(() => []),
        getCrews().catch(() => []),
        getTasks().catch(() => []),
        getReports({ limit: 4 }).catch(() => []),
        getReportStats().catch(() => null),
        getNotionStatus().catch(() => null),
        getValueMetrics().catch(() => null),
        getStrategies().catch(() => []),
      ])

      setAgents(Array.isArray(agentsData) ? agentsData : (agentsData.agents || []))
      setSchedule(Array.isArray(scheduleData) ? scheduleData : (scheduleData.schedule || []))
      setCrews(Array.isArray(crewsData) ? crewsData : (crewsData.crews || []))
      setTasks(Array.isArray(tasksData) ? tasksData : (tasksData.tasks || []))
      setLatestReports(Array.isArray(reportsData) ? reportsData : [])
      if (rStatsData) setReportStats(rStatsData)
      if (nStatus) setNotionStatus(nStatus)
      if (vMetrics) setValueMetrics(vMetrics)
      setStrategies(Array.isArray(stratData) ? stratData : [])
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
    // skill_completed, knowledge_changed, correction_added, task_completed — activity feed only, no data reload needed
  }, [events])

  const onlineAgents = agents.length

  const TYPE_LABELS = { briefing: 'Briefing', content: 'Content', tech_report: 'Tech Report', outreach: 'Outreach', weekly_review: 'Weekly Review', content_calendar: 'Calendar' }

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Agents Online" value={`${onlineAgents}/${onlineAgents}`} isLoading={isLoading} />
        <StatCard label="Total Reports" value={reportStats?.total ?? 0} isLoading={isLoading} />
        <StatCard label="Reports Today" value={reportStats?.today ?? 0} isLoading={isLoading} />
        <StatCard label="Unread" value={reportStats?.unread ?? 0} isLoading={isLoading} />
      </div>

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
                <div className="card text-center py-4">
                  <p className="text-xs text-lab-text-faint">Reports auto-publish to Notion. Generate a report to see it here.</p>
                </div>
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

      {/* Value Metrics */}
      {valueMetrics && (
        <div>
          <div className="mb-4">
            <h2 className="text-section-label">Agent Value</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <FileText size={12} className="text-lab-text-muted" />
                <span className="text-[10px] text-lab-text-muted">Reports</span>
              </div>
              <div className="text-lg font-semibold text-lab-text-primary">{valueMetrics.total_reports}</div>
            </div>
            <div className="card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Brain size={12} className="text-lab-text-muted" />
                <span className="text-[10px] text-lab-text-muted">Memories</span>
              </div>
              <div className="text-lg font-semibold text-lab-text-primary">{valueMetrics.agent_memories}</div>
            </div>
            <div className="card p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ShieldCheck size={12} className="text-lab-text-muted" />
                <span className="text-[10px] text-lab-text-muted">Auto Rules</span>
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
                <span className="text-[10px] text-lab-text-muted">30d Cost</span>
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
          <div className="card text-center py-6">
            <Bot size={20} className="mx-auto text-lab-text-muted mb-2" />
            <p className="text-xs text-lab-text-secondary">Agents are scheduled and will produce reports automatically</p>
            <p className="text-[10px] text-lab-text-faint mt-1">First reports arrive at the next scheduled time</p>
          </div>
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
                <div className="text-center py-8">
                  <p className="text-sm text-lab-text-faint">No agents available</p>
                </div>
              ) : (
                <div className="border border-lab-border rounded-md overflow-hidden">
                  {agents.map(agent => (
                    <AgentRow key={agent.id} agent={agent} onClick={() => navigate('/agents')} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Agent Schedule */}
          <div>
            <div className="mb-4">
              <h2 className="text-section-label">Agent Schedule</h2>
            </div>
            <div className="card p-0 overflow-hidden">
              <div className="divide-y divide-lab-border">
                {AGENT_SCHEDULE.map((job, idx) => {
                  const nextRun = getNextRun(job.time, job.days)
                  const countdown = formatCountdown(nextRun)
                  return (
                    <div key={idx} className="flex items-center gap-3 px-4 py-2.5">
                      <AvatarCircle name={job.agent} agent={job.agent} size={22} />
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-lab-text-primary">{job.task}</span>
                      </div>
                      <span className="text-[10px] text-lab-text-muted px-2 py-0.5 bg-lab-elevated rounded">
                        {job.days} {job.time}
                      </span>
                      <span className="text-[10px] text-lab-text-secondary font-medium w-14 text-right">
                        in {countdown}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
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
