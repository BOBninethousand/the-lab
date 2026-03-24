import { AvatarCircle } from './AvatarCircle'

export function AgentRow({ agent, onClick }) {
  const isWorking = agent.status === 'working'
  const isError = agent.status === 'error'

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-subtle text-left"
    >
      <AvatarCircle name={agent.name} agent={agent.name} size={28} />

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
        {isWorking ? (
          <span className="flex items-center gap-1 text-xs text-blue-400">
            <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" /> Working
          </span>
        ) : isError ? (
          <span className="text-xs text-lab-error">Error</span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Online
          </span>
        )}
      </div>
    </button>
  )
}
