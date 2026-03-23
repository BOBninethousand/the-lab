import { useState, useEffect } from 'react'
import { StatCard } from '../components/StatCard'
import { AgentRow } from '../components/AgentRow'
import { ActivityList } from '../components/ActivityList'
import { useWebSocket } from '../hooks/useWebSocket'
import { getAgents, getSchedule, getCrews, getCostToday, getTasks } from '../lib/api'
import { Link } from 'react-router-dom'

export function Dashboard() {
  const [agents, setAgents] = useState([])
  const [schedule, setSchedule] = useState([])
  const [crews, setCrews] = useState([])
  const [tasks, setTasks] = useState([])
  const [costToday, setCostToday] = useState(null)
  const [activity, setActivity] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const { events, isConnected } = useWebSocket()

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      try {
        const [agentsData, scheduleData, crewsData, tasksData, costData] = await Promise.all([
          getAgents().catch(() => []),
          getSchedule().catch(() => []),
          getCrews().catch(() => []),
          getTasks().catch(() => []),
          getCostToday().catch(() => null),
        ])

        setAgents(Array.isArray(agentsData) ? agentsData : (agentsData.agents || []))
        setSchedule(Array.isArray(scheduleData) ? scheduleData : (scheduleData.schedule || []))
        setCrews(Array.isArray(crewsData) ? crewsData : (crewsData.crews || []))
        setTasks(Array.isArray(tasksData) ? tasksData : (tasksData.tasks || []))
        if (costData) setCostToday(costData)
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
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Active Agents" value={`${activeAgents}/${agents.length}`} isLoading={isLoading} />
        <StatCard label="Tasks Completed" value={tasksCompleted} isLoading={isLoading} />
        <StatCard label="Scheduled Jobs" value={scheduledJobs} isLoading={isLoading} />
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
