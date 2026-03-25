import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { getAgents } from '../lib/api'
import { useWebSocket } from '../hooks/useWebSocket'

const AGENT_COLORS = {
  Scout: '#3b6fcc',
  Quill: '#c4682d',
  Forge: '#7c5bbf',
  Radar: '#1d8fa0',
}

const AGENT_EMOJIS = {
  Scout: '🔍',
  Quill: '✏️',
  Forge: '🔨',
  Radar: '📡',
}

export function Office() {
  const [agents, setAgents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const { events } = useWebSocket()

  useEffect(() => { loadAgents() }, [])

  useEffect(() => {
    if (events.length > 0) {
      const lastEvent = events[0]
      if (lastEvent.agent_id) {
        setAgents(prev =>
          prev.map(a =>
            a.id === lastEvent.agent_id
              ? { ...a, status: lastEvent.status || a.status, current_task: lastEvent.current_task ?? a.current_task }
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
      setAgents(Array.isArray(data) ? data : [])
    } catch {} finally { setIsLoading(false) }
  }

  const activeCount = agents.filter(a => a.status === 'working').length

  return (
    <div className="h-[calc(100vh-80px)] relative overflow-hidden select-none" style={{ perspective: '1200px' }}>
      {/* Status bar */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-4 px-3 py-1.5 bg-black/50 backdrop-blur-sm rounded-lg border border-white/5">
        <span className="text-[10px] text-white/60">{agents.length} agents · {activeCount} active</span>
      </div>

      {/* Isometric Office Floor */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div
          className="relative"
          style={{
            transform: 'rotateX(55deg) rotateZ(-45deg)',
            transformStyle: 'preserve-3d',
          }}
        >
          {/* Floor */}
          <div
            className="relative"
            style={{
              width: '600px',
              height: '500px',
              background: 'linear-gradient(135deg, #12121a 0%, #0e0e14 100%)',
              borderRadius: '8px',
              boxShadow: '0 40px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)',
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px)',
              backgroundSize: '50px 50px',
            }}
          >
            {/* Office label */}
            <div
              className="absolute text-[10px] font-bold tracking-[0.3em] text-white/10 uppercase"
              style={{ top: '20px', left: '30px', transform: 'rotateZ(45deg) rotateX(-55deg)', transformStyle: 'preserve-3d' }}
            >
              The Lab HQ
            </div>

            {/* Agent Desks */}
            {agents.map((agent, idx) => {
              const positions = [
                { left: '80px', top: '80px' },
                { left: '320px', top: '80px' },
                { left: '80px', top: '280px' },
                { left: '320px', top: '280px' },
              ]
              const pos = positions[idx] || { left: `${80 + (idx % 2) * 240}px`, top: `${80 + Math.floor(idx / 2) * 200}px` }
              const color = AGENT_COLORS[agent.name] || '#666'
              const isWorking = agent.status === 'working'
              const isError = agent.status === 'error'

              return (
                <div
                  key={agent.id}
                  className="absolute cursor-pointer group"
                  style={{ ...pos, transformStyle: 'preserve-3d' }}
                  onClick={() => setSelectedAgent(agent)}
                >
                  {/* Desk surface */}
                  <div
                    className="relative transition-all duration-300"
                    style={{
                      width: '160px',
                      height: '100px',
                      transformStyle: 'preserve-3d',
                    }}
                  >
                    {/* Desk top */}
                    <div style={{
                      width: '160px',
                      height: '100px',
                      background: 'linear-gradient(135deg, #1e1e28 0%, #16161e 100%)',
                      borderRadius: '6px',
                      border: `1px solid ${isWorking ? color + '40' : 'rgba(255,255,255,0.05)'}`,
                      boxShadow: isWorking ? `0 0 20px ${color}20, 0 8px 24px rgba(0,0,0,0.4)` : '0 8px 24px rgba(0,0,0,0.3)',
                      transition: 'all 0.3s ease',
                      position: 'relative',
                      transform: 'translateZ(30px)',
                    }}>
                      {/* Monitor */}
                      <div style={{
                        position: 'absolute',
                        top: '10px',
                        left: '50%',
                        transform: 'translateX(-50%) translateZ(20px)',
                        width: '60px',
                        height: '35px',
                        background: isWorking ? '#0a1628' : '#0a0a10',
                        borderRadius: '3px',
                        border: `1px solid ${isWorking ? color + '30' : 'rgba(255,255,255,0.05)'}`,
                        boxShadow: isWorking ? `0 0 8px ${color}15` : 'none',
                        transition: 'all 0.3s ease',
                      }}>
                        {/* Screen content lines */}
                        {isWorking && (
                          <div className="p-1.5 space-y-1">
                            <div className="h-[2px] rounded-full animate-pulse" style={{ width: '70%', background: color + '60' }} />
                            <div className="h-[2px] rounded-full animate-pulse" style={{ width: '50%', background: color + '40', animationDelay: '0.2s' }} />
                            <div className="h-[2px] rounded-full animate-pulse" style={{ width: '85%', background: color + '30', animationDelay: '0.4s' }} />
                          </div>
                        )}
                      </div>

                      {/* Agent avatar */}
                      <div
                        className={`absolute transition-all duration-500 ${isWorking ? 'animate-bounce' : ''}`}
                        style={{
                          bottom: '8px',
                          right: '12px',
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '14px',
                          fontWeight: 'bold',
                          color: 'white',
                          boxShadow: isWorking
                            ? `0 0 12px ${color}80, 0 2px 8px rgba(0,0,0,0.3)`
                            : '0 2px 8px rgba(0,0,0,0.3)',
                          transform: `translateZ(15px)`,
                          animationDuration: isWorking ? '1.5s' : '0s',
                        }}
                      >
                        {agent.name[0]}
                      </div>

                      {/* Status dot */}
                      <div
                        className={isWorking ? 'animate-ping' : ''}
                        style={{
                          position: 'absolute',
                          top: '8px',
                          right: '8px',
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          background: isError ? '#ef4444' : isWorking ? '#10b981' : '#6b7280',
                          boxShadow: isWorking ? '0 0 6px #10b981' : isError ? '0 0 6px #ef4444' : 'none',
                        }}
                      />
                    </div>

                    {/* Desk legs (3D effect) */}
                    <div style={{
                      position: 'absolute',
                      bottom: '-16px',
                      left: '10px',
                      width: '140px',
                      height: '16px',
                      background: 'linear-gradient(to bottom, #121218 0%, #0a0a0e 100%)',
                      borderRadius: '0 0 4px 4px',
                      transform: 'translateZ(14px)',
                    }} />
                  </div>

                  {/* Name + Status label */}
                  <div
                    className="mt-3 text-center"
                    style={{ transform: 'rotateZ(45deg) rotateX(-55deg) translateZ(30px)', transformStyle: 'preserve-3d' }}
                  >
                    <p className="text-xs font-semibold text-white/80">{agent.name}</p>
                    <p className="text-[9px] text-white/40">
                      {isWorking ? '⚡ Working' : isError ? '⚠ Error' : '● Online'}
                    </p>
                    {isWorking && agent.current_task && (
                      <p className="text-[8px] text-white/25 mt-0.5 max-w-[120px] truncate mx-auto">
                        {agent.current_task}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Boss Desk */}
            <div
              className="absolute"
              style={{
                left: '200px',
                bottom: '30px',
                width: '200px',
                height: '60px',
                background: 'linear-gradient(135deg, #1a1428 0%, #14101e 100%)',
                borderRadius: '6px',
                border: '1px solid rgba(139,92,246,0.15)',
                boxShadow: '0 0 15px rgba(139,92,246,0.05), 0 8px 24px rgba(0,0,0,0.3)',
                transform: 'translateZ(30px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                className="text-[9px] font-bold tracking-wider text-white/20 uppercase"
                style={{ transform: 'rotateZ(45deg) rotateX(-55deg)', transformStyle: 'preserve-3d' }}
              >
                Boss Desk
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Agent detail popup */}
      {selectedAgent && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-lab-elevated/95 backdrop-blur-md border border-white/10 rounded-xl p-4 w-72 shadow-2xl">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: AGENT_COLORS[selectedAgent.name] || '#666' }}
            >
              {AGENT_EMOJIS[selectedAgent.name] || selectedAgent.name[0]}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{selectedAgent.name}</p>
              <p className="text-[10px] text-white/50">{selectedAgent.role}</p>
            </div>
            <button onClick={() => setSelectedAgent(null)} className="ml-auto text-white/30 hover:text-white/60">
              <X size={16} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div className="px-2 py-1.5 bg-white/5 rounded">
              <p className="text-white/40">Status</p>
              <p className={`font-medium ${selectedAgent.status === 'working' ? 'text-emerald-400' : selectedAgent.status === 'error' ? 'text-red-400' : 'text-white/70'}`}>
                {selectedAgent.status || 'idle'}
              </p>
            </div>
            <div className="px-2 py-1.5 bg-white/5 rounded">
              <p className="text-white/40">Provider</p>
              <p className="text-white/70 font-medium">{selectedAgent.provider}</p>
            </div>
          </div>

          {selectedAgent.current_task && (
            <div className="mt-2 px-2 py-1.5 bg-white/5 rounded text-[10px]">
              <p className="text-white/40">Current Task</p>
              <p className="text-white/70">{selectedAgent.current_task}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
