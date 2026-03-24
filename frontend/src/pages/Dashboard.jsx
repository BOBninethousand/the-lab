import { useState, useEffect } from 'react'
import { StatCard } from '../components/StatCard'
import { AgentRow } from '../components/AgentRow'
import { ActivityList } from '../components/ActivityList'
import { useWebSocket } from '../hooks/useWebSocket'
import { getAgents, getSchedule, getCrews, getCostToday, getTasks, getReports, getReportStats } from '../lib/api'
import { formatDistanceToNow } from '../lib/time'
import { AvatarCircle } from '../components/AvatarCircle'
import { Link, useNavigate } from 'react-router-dom'

export function Dashboard() {
  const [agents, setAgents] = useState([])
  const [schedule, setSchedule] = useState([])
  const [crews, setCrews] = useState([])
  const [tasks, setTasks] = useState([])
  const [costToday, setCostToday] = useState(null)
  const [latestReports, setLatestReports] = useState([])
  const [reportStats, setReportStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const { events, isConnected } = useWebSocket()
  const navigate = useNavigate()

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const [agentsData, scheduleData, crewsData, tasksData, costData, reportsData, rStatsData] = await Promise.all([
          getAgents().catch(() => []),
          getSchedule().catch(() => []),
          getCrews().catch(() => []),
          getTasks().catch(() => []),
          getCostToday().catch(() => null),
          getReports({ limit: 4 }).catch(() => []),
          getReportStats().catch(() => null),
        ])

        setAgents(Array.isArray(agentsData) ? agentsData : (agentsData.agents || []))
        setSchedule(Array.isArray(scheduleData) ? scheduleData : (scheduleData.schedule || []))
        setCrews(Array.isArray(crewsData) ? crewsData : (crewsData.crews || []))
        setTasks(Array.isArray(tasksData) ? tasksData : (tasksData.tasks || []))
        if (costData) setCostToday(costData)
        setLatestReports(Array.isArray(reportsData) ? reportsData : [])
        if (rStatsData) setReportStats(rStatsData)
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

  const activeAgents = agents.filter(a => a.status === 'working').length
  const tasksCompleted = tasks.filter(t => t.status === 'completed').length
  const scheduledJobs = schedule.length
  const budgetUsed = costToday
    ? ((costToday.spend_usd / Math.max(costToday.budget_usd, 0.01)) * 100).toFixed(0)
    : 0

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard label="Active Agents" value={`${activeAgents}/${agents.length}`} isLoading={isLoading} />
        <StatCard label="Tasks Completed" value={tasksCompleted} isLoading={isLoading} />
        <StatCard label="Scheduled Jobs" value={scheduledJobs} isLoading={isLoading} />
        <StatCard label="Reports Today" value={reportStats?.today ?? 0} isLoading={isLoading} />
        <div className="card">
          {isLoading ? (
            <div className="h-12 bg-lab-surface rounded animate-pulse" />
          ) : (
            <>
              <div className="text-xs text-lab-text-muted mb-1">Today's Spend</div>
              <div className="flex items-baseline gap-2">
                <span className={`text-stat text-xl ${costToday?.over_budget ? 'text-lab-error' : ''}`}>
                  ${costToday?.spend_usd?.toFixed(2) || '0.00'}
                </span>
                <span className="text-xs text-lab-text-faint">
                  / ${costToday?.budget_usd?.toFixed(2) || '5.00'}
                </span>
              </div>
              <div className="mt-2 w-full h-1 bg-white/[0.05] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    costToday?.over_budget ? 'bg-lab-error' : 'bg-lab-success'
                  }`}
                  style={{ width: `${Math.min(100, budgetUsed)}%` }}
                />
              </div>
            </>
          )}
        </div>
      </div>

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
              <div key={i} className="h-24 bg-lab-surface rounded animate-pulse" />
            ))}
          </div>
        ) : latestReports.length === 0 ? (
          <div className="card text-center py-6">
            <p className="text-xs text-lab-text-faint">No reports yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {latestReports.map(report => {
              const TYPE_LABELS = { briefing: 'Briefing', content: 'Content', tech_report: 'Tech Report', outreach: 'Outreach', weekly_review: 'Weekly Review', content_calendar: 'Calendar' }
              return (
                <button
                  key={report.id}
                  onClick={() => navigate(`/documents?report=${report.id}`)}
                  className="card text-left hover:bg-white/[0.02] transition-subtle p-3"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <AvatarCircle name={report.agent_name} agent={report.agent_name} size={20} />
                    <span className="text-[11px] text-lab-text-muted">{report.agent_name}</span>
                    <span className="text-[10px] text-lab-text-faint ml-auto">{formatDistanceToNow(new Date(report.created_at))}</span>
                  </div>
                  <div className="text-xs font-medium text-lab-text-primary truncate mb-1">{report.title}</div>
                  <div className="flex items-center gap-2">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-medium bg-white/[0.06] text-lab-text-muted">
                      {TYPE_LABELS[report.report_type] || report.report_type}
                    </span>
                  </div>
                  <p className="text-[11px] text-lab-text-muted mt-1.5 line-clamp-1">
                    {report.content?.replace(/[#*_\n]/g, ' ').slice(0, 80)}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Main content grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Agents section - spans 2 columns */}
        <div className="col-span-2">
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
                  <div
                    key={i}
                    className="h-12 bg-lab-surface rounded animate-pulse"
                  />
                ))}
              </div>
            ) : agents.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-lab-text-faint">No agents available</p>
              </div>
            ) : (
              <div className="border border-lab-border rounded-md overflow-hidden">
                {agents.map(agent => (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    onClick={() => {}}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Activity section */}
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
