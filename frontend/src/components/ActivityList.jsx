import { formatDistanceToNow } from '../lib/time'

function formatEvent(event) {
  const data = event.data || {}
  const agentName = data.agent_name || data.name || ''

  switch (event.type) {
    case 'report_created':
      return { message: `${agentName || 'Agent'} generated "${data.title || 'report'}"`, color: '#22c55e' }
    case 'agent_status':
      if (data.status === 'working')
        return { message: `${agentName || data.name || 'Agent'} is working${data.current_task ? ': ' + data.current_task : '...'}`, color: '#6366f1', pulse: true }
      if (data.status === 'error')
        return { message: `${agentName || data.name || 'Agent'} encountered an error`, color: '#ef4444' }
      return { message: `${agentName || data.name || 'Agent'} completed task`, color: '#6b7280' }
    case 'job_completed':
      return { message: `Scheduled: ${data.job_name || 'job'} completed`, color: '#22c55e' }
    case 'task_completed':
      return { message: `${agentName || 'Agent'} completed ${data.task || 'task'}`, color: '#22c55e' }
    case 'agent_created':
      return { message: `New agent created: ${agentName || data.name}`, color: '#6366f1' }
    case 'document_created':
      return { message: `Document saved: ${data.title || 'untitled'}`, color: '#f59e0b' }
    case 'memory_added':
      return { message: `Memory logged`, color: '#6b7280' }
    default:
      return { message: event.type?.replace(/_/g, ' ') || 'Event', color: '#6b7280' }
  }
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
        <p className="text-xs text-lab-text-faint">Waiting for agent activity...</p>
        <p className="text-[10px] text-lab-text-faint mt-1">Events appear here in real-time</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {events.map((event, idx) => {
        const { message, color, pulse } = formatEvent(event)
        return (
          <div key={idx} className="flex items-start gap-2 py-1">
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5 ${pulse ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: color }}
            />
            <span className="text-xs text-lab-text-secondary flex-1 leading-relaxed">
              {message}
            </span>
            <span className="text-[10px] text-lab-text-faint flex-shrink-0 mt-0.5">
              {formatDistanceToNow(event.timestamp || new Date())}
            </span>
          </div>
        )
      })}
    </div>
  )
}
