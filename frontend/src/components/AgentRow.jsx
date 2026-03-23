import { AvatarCircle } from './AvatarCircle'

export function AgentRow({ agent, onClick }) {
  const statusText = agent.status || 'Idle'
  const isWorking = statusText === 'working'
  const statusColor =
    statusText === 'working'
      ? 'text-lab-success'
      : 'text-lab-text-muted'

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-subtle text-left"
    >
      <AvatarCircle name={agent.name} agent={agent.agent_type} size={28} />

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-lab-text-primary">
            {agent.name}
          </span>
          <span className="text-lab-text-faint">•</span>
          <span className="text-sm text-lab-text-muted">{agent.role}</span>
        </div>
        {isWorking && (
          <div className="text-xs text-lab-text-muted mt-0.5">
            {agent.current_task}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className={`text-xs ${statusColor}`}>{statusText}</span>
        <span className="text-xs text-lab-text-faint ml-2">{agent.provider}</span>
      </div>
    </button>
  )
}
