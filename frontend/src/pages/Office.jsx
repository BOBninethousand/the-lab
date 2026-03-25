import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { AvatarCircle } from '../components/AvatarCircle'
import { getAgents } from '../lib/api'
import { useWebSocket } from '../hooks/useWebSocket'

export function Office() {
  const [agents, setAgents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [popupPos, setPopupPos] = useState(null)
  const { events } = useWebSocket()

  useEffect(() => {
    loadAgents()
  }, [])

  useEffect(() => {
    // Update agents from WebSocket events
    if (events.length > 0) {
      const lastEvent = events[0]
      if (lastEvent.agent_id) {
        setAgents(prev =>
          prev.map(a =>
            a.id === lastEvent.agent_id
              ? { ...a, status: lastEvent.status, current_task: lastEvent.current_task }
              : a
          )
        )
      }
    }
  }, [events])

  const loadAgents = async () => {
    setIsLoading(true)
    try {
      const data = await getAgents().catch(() => [])
      setAgents(Array.isArray(data) ? data : (data.agents || []))
    } catch (err) {
      console.error('Failed to load agents:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const activeCount = agents.filter(a => a.status === 'working').length
  const taskCount = agents.filter(a => a.current_task).length

  // Position agents on grid
  const deskPositions = agents.map((agent, idx) => ({
    agent,
    row: Math.floor(idx / 3),
    col: idx % 3,
  }))

  return (
    <div className="space-y-6">
      {/* Status bar */}
      <div className="flex items-center gap-6">
        <span className="text-xs text-lab-text-muted">
          {activeCount} agents active · {taskCount} tasks in progress
        </span>
      </div>

      {/* Office floor */}
      <div className="relative bg-[#0E0E10] rounded-lg border border-lab-border p-8 overflow-auto" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }}>
        <div className="relative w-full min-h-96">
          {deskPositions.length === 0 ? (
            <div className="flex items-center justify-center h-96">
              <p className="text-sm text-lab-text-faint">No agents available</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 lg:gap-12">
              {deskPositions.map(({ agent, row, col }) => (
                <div key={agent.id} className="relative">
                  {/* Desk */}
                  <div className="w-28 h-[70px] bg-lab-elevated border border-white/[0.06] rounded-md flex items-center justify-center relative group">
                    {/* Agent avatar */}
                    <button
                      onClick={(e) => {
                        setSelectedAgent(agent)
                        const rect = e.currentTarget.getBoundingClientRect()
                        setPopupPos({
                          x: rect.left,
                          y: rect.top - 10,
                        })
                      }}
                      className="cursor-pointer transition-subtle"
                    >
                      <AvatarCircle name={agent.name} agent={agent.agent_type} size={36} />
                    </button>

                    {/* Status indicator */}
                    {agent.status === 'working' && (
                      <div className="absolute top-1 right-1 flex gap-1">
                        <div className="w-1 h-1 bg-lab-success rounded-full animate-dot-blink animate-dot-blink-1" />
                        <div className="w-1 h-1 bg-lab-success rounded-full animate-dot-blink animate-dot-blink-2" />
                        <div className="w-1 h-1 bg-lab-success rounded-full animate-dot-blink animate-dot-blink-3" />
                      </div>
                    )}

                    {agent.status === 'error' && (
                      <div className="absolute top-1 right-1 text-xs text-lab-error">!</div>
                    )}
                  </div>

                  {/* Name label */}
                  <div className="text-center mt-2">
                    <p className="text-xs font-medium text-lab-text-secondary">
                      {agent.name}
                    </p>
                  </div>

                  {/* Glow effect for working agents */}
                  {agent.status === 'working' && (
                    <div className="absolute inset-0 border border-lab-success/20 rounded-lg animate-pulse-subtle -z-10" />
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent popup */}
      {selectedAgent && popupPos && (
        <div
          className="fixed z-50 card-elevated w-60 p-4"
          style={{
            left: `${popupPos.x}px`,
            top: `${popupPos.y}px`,
          }}
        >
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-lab-text-primary">
                {selectedAgent.name}
              </p>
              <p className="text-xs text-lab-text-muted">{selectedAgent.role}</p>
            </div>
            <button
              onClick={() => setSelectedAgent(null)}
              className="p-1 hover:bg-white/[0.1] rounded transition-subtle"
            >
              <X size={14} className="text-lab-text-secondary" />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div>
              <p className="text-lab-text-muted">Provider</p>
              <p className="text-lab-text-secondary">{selectedAgent.provider}</p>
            </div>
            {selectedAgent.model && (
              <div>
                <p className="text-lab-text-muted">Model</p>
                <p className="text-lab-text-secondary">{selectedAgent.model}</p>
              </div>
            )}
            <div>
              <p className="text-lab-text-muted">Status</p>
              <p className={selectedAgent.status === 'working' ? 'text-lab-success' : 'text-lab-text-secondary'}>
                {selectedAgent.status || 'idle'}
              </p>
            </div>
            {selectedAgent.current_task && (
              <div>
                <p className="text-lab-text-muted">Current Task</p>
                <p className="text-lab-text-secondary truncate" title={selectedAgent.current_task}>
                  {selectedAgent.current_task}
                </p>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-lab-border">
            <button className="flex-1 px-2 py-1.5 text-xs font-medium text-lab-accent hover:bg-lab-accent/10 rounded transition-subtle">
              Chat
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
