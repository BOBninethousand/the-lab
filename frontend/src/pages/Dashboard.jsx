import { useState, useEffect } from 'react'
import { StatCard } from '../components/StatCard'
import { AgentRow } from '../components/AgentRow'
import { ActivityList } from '../components/ActivityList'
import { useWebSocket } from '../hooks/useWebSocket'
import { getAgents, getSchedule, getCrews, getTasks, getReports, getReportStats, getNotionStatus, syncNotion, getNotionTasks, runNotionTask } from '../lib/api'
import { formatDistanceToNow } from '../lib/time'
import { AvatarCircle } from '../components/AvatarCircle'
import { Link, useNavigate } from 'react-router-dom'
import { Clock, FileText, Zap, Bot, RefreshCw, Play, ExternalLink } from 'lucide-react'

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
  const [notionTasks, setNotionTasks] = useState([])
  const [notionSyncing, setNotionSyncing] = useState(false)
  const [notionRunning, setNotionRunning] = useState(null)
  const [notionAgentMap, setNotionAgentMap] = useState({})
  const { events, isConnected } = useWebSocket()
  const navigate = useNavigate()

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const [agentsData, scheduleData, crewsData, tasksData, reportsData, rStatsData] = await Promise.all([
          getAgents().catch(() => []),
          getSchedule().catch(() => []),
          getCrews().catch(() => []),
          getTasks().catch(() => []),
          getReports({ limit: 4 }).catch(() => []),
          getReportStats().catch(() => null),
        ])

        setAgents(Array.isArray(agentsData) ? agentsData : (agentsData.agents || []))
        setSchedule(Array.isArray(scheduleData) ? scheduleData : (scheduleData.schedule || []))
        setCrews(Array.isArray(crewsData) ? crewsData : (crewsData.crews || []))
        setTasks(Array.isArray(tasksData) ? tasksData : (tasksData.tasks || []))
        setLatestReports(Array.isArray(reportsData) ? reportsData : [])
        if (rStatsData) setReportStats(rStatsData)

        // Load Notion status + tasks
        const [nStatus, nTasks] = await Promise.all([
          getNotionStatus().catch(() => null),
          getNotionTasks().catch(() => []),
        ])
        if (nStatus) setNotionStatus(nStatus)
        setNotionTasks(Array.isArray(nTasks) ? nTasks : [])
      } catch (err) {
        console.error('Failed to load dashboard data:', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [])

  // Update activity when WebSocket events arrive
  useEffect(() => {
    if (events.length > 0) {
      setActivity(events)
    }
  }, [events])

  const onlineAgents = agents.length

  const TYPE_LABELS = { briefing: 'Briefing', content: 'Content', tech_report: 'Tech Report', outreach: 'Outreach', weekly_review: 'Weekly Review', content_calendar: 'Calendar' }

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Agents Online" value={`${onlineAgents}/${onlineAgents}`} isLoading={isLoading} />
        <StatCard label="Total Reports" value={reportStats?.total ?? 0} isLoading={isLoading} />
        <StatCard label="Reports Today" value={reportStats?.today ?? 0} isLoading={isLoading} />
        <StatCard label="Unread" value={reportStats?.unread ?? 0} isLoading={isLoading} />
      </div>

      {/* Notion Tasks */}
      {notionStatus?.connected && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="text-section-label">Notion Tasks</h2>
              <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> {notionStatus.database_name}
              </span>
              {notionStatus.last_sync && (
                <span className="text-[10px] text-lab-text-muted">
                  Synced {formatDistanceToNow(new Date(notionStatus.last_sync))}
                </span>
              )}
            </div>
            <button
              onClick={async () => {
                setNotionSyncing(true)
                try {
                  const result = await syncNotion()
                  setNotionTasks(result.tasks || [])
                  const status = await getNotionStatus().catch(() => null)
                  if (status) setNotionStatus(status)
                } catch {} finally { setNotionSyncing(false) }
              }}
              disabled={notionSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-lab-border-hover rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle disabled:opacity-50"
            >
              <RefreshCw size={12} className={notionSyncing ? 'animate-spin' : ''} />
              {notionSyncing ? 'Syncing...' : 'Sync Now'}
            </button>
          </div>

          {notionTasks.length === 0 ? (
            <div className="card text-center py-6">
              <p className="text-sm text-lab-text-faint">No new tasks in Notion. Click Sync to check.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notionTasks.map(task => (
                <div key={task.notion_page_id} className="flex items-center gap-3 p-3 border border-lab-border rounded-lg hover:bg-white/[0.02] transition-subtle">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-lab-text-primary">{task.title}</span>
                      {task.priority && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                          task.priority.includes('Urgent') ? 'text-red-400 bg-red-400/10' :
                          task.priority.includes('Low') ? 'text-lab-text-muted bg-white/[0.05]' :
                          'text-amber-400 bg-amber-400/10'
                        }`}>{task.priority}</span>
                      )}
                      {task.project && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] text-lab-text-muted bg-white/[0.05]">{task.project}</span>
                      )}
                    </div>
                    {task.handoff_notes && (
                      <p className="text-[10px] text-lab-text-muted line-clamp-1">{task.handoff_notes}</p>
                    )}
                  </div>

                  <select
                    value={notionAgentMap[task.notion_page_id] || ''}
                    onChange={e => setNotionAgentMap(prev => ({ ...prev, [task.notion_page_id]: e.target.value }))}
                    className="bg-lab-bg border border-lab-border rounded px-2 py-1 text-[10px] text-lab-text-primary focus:outline-none focus:border-lab-accent/50 w-28"
                  >
                    <option value="">Assign agent</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>

                  <button
                    onClick={async () => {
                      const agentId = notionAgentMap[task.notion_page_id]
                      if (!agentId) return
                      setNotionRunning(task.notion_page_id)
                      try {
                        await runNotionTask(task.notion_page_id, agentId)
                        // Remove from list after completion
                        setNotionTasks(prev => prev.filter(t => t.notion_page_id !== task.notion_page_id))
                      } catch (err) {
                        console.error('Notion task failed:', err)
                      } finally { setNotionRunning(null) }
                    }}
                    disabled={!notionAgentMap[task.notion_page_id] || notionRunning === task.notion_page_id}
                    className="flex items-center gap-1 px-2.5 py-1 bg-lab-accent/10 text-lab-accent rounded text-[10px] hover:bg-lab-accent/20 transition-subtle disabled:opacity-30"
                  >
                    <Play size={10} />
                    {notionRunning === task.notion_page_id ? 'Running...' : 'Run'}
                  </button>

                  {task.url && (
                    <a href={task.url} target="_blank" rel="noopener noreferrer"
                      className="text-lab-text-muted hover:text-lab-text-secondary transition-subtle">
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
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
                  <span className="text-[10px] text-lab-text-faint ml-auto">{formatDistanceToNow(new Date(report.created_at))}</span>
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
      <div className="grid grid-cols-3 gap-6">
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
