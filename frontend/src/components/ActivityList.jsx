import { formatDistanceToNow } from '../lib/time'

const eventTypeColors = {
  'task_started': '#6366f1',
  'task_completed': '#22c55e',
  'task_scheduled': '#f59e0b',
  'task_failed': '#ef4444',
  'agent_update': '#6b7280',
}

export function ActivityList({ events, isLoading }) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-6 bg-lab-elevated rounded animate-pulse" />
        ))}
      </div>
    )
  }

  if (!events || events.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-lab-text-faint">No activity yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {events.map((event, idx) => {
        const color = eventTypeColors[event.type] || eventTypeColors['agent_update']

        return (
          <div key={idx} className="flex items-center gap-2 py-1">
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-lab-text-secondary flex-1">
              {event.message || event.type}
            </span>
            <span className="text-xs text-lab-text-faint flex-shrink-0">
              {formatDistanceToNow(new Date(event.timestamp || Date.now()))}
            </span>
          </div>
        )
      })}
    </div>
  )
}
