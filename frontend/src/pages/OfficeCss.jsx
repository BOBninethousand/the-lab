import { useState, useEffect } from 'react'
import { RotateCcw } from 'lucide-react'
import { getAgents } from '../lib/api'
import { useWebSocket } from '../hooks/useWebSocket'
import { useOfficeCamera } from '../components/office/useOfficeCamera'
import { OfficeZone } from '../components/office/OfficeZone'
import { AgentDesk } from '../components/office/AgentDesk'
import { AgentPopup } from '../components/office/AgentPopup'

const AGENT_COLORS = {
  Scout: '#3b6fcc',
  Quill: '#c4682d',
  Forge: '#7c5bbf',
  Radar: '#1d8fa0',
}

// Home desk positions within work zone (spaced for 180x110 desks)
const HOME_POSITIONS = [
  { left: 20, top: 30 },
  { left: 250, top: 30 },
  { left: 20, top: 185 },
  { left: 250, top: 185 },
]

// Visitor positions per zone
const ZONE_VISITOR_POS = {
  meeting: [
    { left: 60, top: 40 },
    { left: 220, top: 40 },
    { left: 60, top: 170 },
    { left: 220, top: 170 },
  ],
  boss: [
    { left: 50, top: 30 },
    { left: 210, top: 30 },
  ],
  notion: [
    { left: 60, top: 30 },
    { left: 210, top: 30 },
  ],
  server: [
    { left: 120, top: 20 },
    { left: 320, top: 20 },
    { left: 520, top: 20 },
  ],
}

function getAgentZone(agent) {
  if (agent.status !== 'working') return 'work'
  const task = (agent.current_task || '').toLowerCase()
  if (task.includes('crew') || task.includes('meeting') || task.includes('collaborate')) return 'meeting'
  if (task.includes('notion') || task.includes('publish')) return 'notion'
  if (task.includes('report') || task.includes('brief')) return 'boss'
  if (task.includes('sync') || task.includes('index') || task.includes('infra') || task.includes('embed')) return 'server'
  return 'work'
}

export function OfficeCss() {
  const [agents, setAgents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const { events } = useWebSocket()
  const { zoom, panX, panY, isDragging, reset, viewportRef, wasDragging, handlers } = useOfficeCamera()

  useEffect(() => { loadAgents() }, [])

  useEffect(() => {
    if (events.length > 0) {
      const lastEvent = events[0]
      if (lastEvent.type === 'agent_status' && lastEvent.data?.id) {
        const { id, status, current_task } = lastEvent.data
        setAgents(prev =>
          prev.map(a =>
            a.id === id
              ? { ...a, status: status || a.status, current_task: current_task ?? a.current_task }
              : a
          )
        )
        setSelectedAgent(prev =>
          prev?.id === id
            ? { ...prev, status: status || prev.status, current_task: current_task ?? prev.current_task }
            : prev
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

  // Compute zones for each agent
  const agentZones = {}
  agents.forEach((agent, idx) => {
    agentZones[agent.id] = { zone: getAgentZone(agent), homeIdx: idx }
  })

  const activeCount = agents.filter(a => a.status === 'working').length
  const zoomPct = Math.round(zoom * 100)

  const handleAgentClick = (agent) => {
    if (isDragging || wasDragging()) return
    setSelectedAgent(prev => prev?.id === agent.id ? null : agent)
  }

  // Track visitor slot assignment per zone
  const zoneSlotCounters = {}

  return (
    <div className="h-[calc(100vh-80px)] relative overflow-hidden select-none bg-[#08080e]">
      {/* Status bar */}
      <div className="absolute top-3 left-3 z-20 flex items-center gap-3">
        <div className="flex items-center gap-3 px-3 py-1.5 rounded-lg"
          style={{
            background: 'rgba(10,10,16,0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
          <span className="text-[10px] text-white/50"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
            {agents.length} AGENTS
          </span>
          <div className="w-px h-3 bg-white/10" />
          <span className="text-[10px]" style={{
            color: activeCount > 0 ? '#10b981' : 'rgba(255,255,255,0.3)',
            fontFamily: '"JetBrains Mono", monospace',
          }}>
            {activeCount} ACTIVE
          </span>
        </div>

        {/* Camera controls */}
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg"
          style={{
            background: 'rgba(10,10,16,0.85)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}>
          <button onClick={() => reset()} className="p-1 rounded hover:bg-white/[0.06] transition-colors" title="Reset view">
            <RotateCcw size={12} className="text-white/30" />
          </button>
          <span className="text-[9px] text-white/30 w-8 text-center"
            style={{ fontFamily: '"JetBrains Mono", monospace' }}>
            {zoomPct}%
          </span>
        </div>
      </div>

      {/* Viewport (captures mouse events for camera) */}
      <div
        ref={viewportRef}
        className="absolute inset-0"
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        {...handlers}
      >
        {/* Camera rig (pan + zoom, outside isometric rotation) */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
            transition: isDragging ? 'none' : 'transform 0.08s ease-out',
            willChange: 'transform',
          }}
        >
          {/* Isometric transform */}
          <div
            className="relative"
            style={{
              transform: 'rotateX(55deg) rotateZ(-45deg)',
              transformStyle: 'preserve-3d',
            }}
          >
            {/* Main floor */}
            <div
              className="relative"
              style={{
                width: 1100,
                height: 820,
                background: 'linear-gradient(135deg, #0e0e16 0%, #0a0a10 100%)',
                borderRadius: 10,
                boxShadow: '0 60px 120px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.02)',
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)',
                backgroundSize: '50px 50px',
              }}
            >
              {/* Floor label */}
              <div
                className="absolute"
                style={{
                  top: 16, left: 24,
                  transform: 'rotateZ(45deg) rotateX(-55deg) translateZ(2px)',
                  transformStyle: 'preserve-3d',
                }}
              >
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.35em',
                  color: 'rgba(255,255,255,0.06)',
                  fontFamily: '"JetBrains Mono", "SF Mono", monospace',
                  textTransform: 'uppercase',
                }}>
                  The Lab HQ
                </span>
              </div>

              {/* === ZONES === */}

              {/* Work Area — top left */}
              <OfficeZone
                type="work"
                style={{ left: 40, top: 40, width: 500, height: 360 }}
              >
                {agents.map((agent, idx) => {
                  const zone = agentZones[agent.id]?.zone
                  const pos = HOME_POSITIONS[idx] || { left: 30 + (idx % 2) * 190, top: 40 + Math.floor(idx / 2) * 140 }
                  const color = AGENT_COLORS[agent.name] || agent.avatar_color || '#666'
                  const isDimmed = zone !== 'work'

                  return (
                    <AgentDesk
                      key={agent.id}
                      agent={agent}
                      color={color}
                      isSelected={selectedAgent?.id === agent.id}
                      onClick={() => handleAgentClick(agent)}
                      style={{ left: pos.left, top: pos.top }}
                      dimmed={isDimmed}
                    />
                  )
                })}
              </OfficeZone>

              {/* Meeting Room — top right */}
              <OfficeZone
                type="meeting"
                style={{ left: 560, top: 40, width: 480, height: 340 }}
              >
                {agents.map((agent, idx) => {
                  const zone = agentZones[agent.id]?.zone
                  if (zone !== 'meeting') return null
                  if (!zoneSlotCounters.meeting) zoneSlotCounters.meeting = 0
                  const slot = zoneSlotCounters.meeting++
                  const vPos = ZONE_VISITOR_POS.meeting[slot % ZONE_VISITOR_POS.meeting.length]
                  const color = AGENT_COLORS[agent.name] || agent.avatar_color || '#666'

                  return (
                    <AgentDesk
                      key={`meeting-${agent.id}`}
                      agent={agent}
                      color={color}
                      isSelected={selectedAgent?.id === agent.id}
                      onClick={() => handleAgentClick(agent)}
                      style={{ left: vPos.left, top: vPos.top }}
                    />
                  )
                })}
              </OfficeZone>

              {/* Boss Office — bottom left */}
              <OfficeZone
                type="boss"
                style={{ left: 40, top: 420, width: 460, height: 190 }}
              >
                {agents.map((agent) => {
                  const zone = agentZones[agent.id]?.zone
                  if (zone !== 'boss') return null
                  if (!zoneSlotCounters.boss) zoneSlotCounters.boss = 0
                  const slot = zoneSlotCounters.boss++
                  const vPos = ZONE_VISITOR_POS.boss[slot % ZONE_VISITOR_POS.boss.length]
                  const color = AGENT_COLORS[agent.name] || agent.avatar_color || '#666'

                  return (
                    <AgentDesk
                      key={`boss-${agent.id}`}
                      agent={agent}
                      color={color}
                      isSelected={selectedAgent?.id === agent.id}
                      onClick={() => handleAgentClick(agent)}
                      style={{ left: vPos.left, top: vPos.top }}
                    />
                  )
                })}
              </OfficeZone>

              {/* Notion Outbox — bottom right */}
              <OfficeZone
                type="notion"
                style={{ left: 560, top: 420, width: 480, height: 190 }}
              >
                {agents.map((agent) => {
                  const zone = agentZones[agent.id]?.zone
                  if (zone !== 'notion') return null
                  if (!zoneSlotCounters.notion) zoneSlotCounters.notion = 0
                  const slot = zoneSlotCounters.notion++
                  const vPos = ZONE_VISITOR_POS.notion[slot % ZONE_VISITOR_POS.notion.length]
                  const color = AGENT_COLORS[agent.name] || agent.avatar_color || '#666'

                  return (
                    <AgentDesk
                      key={`notion-${agent.id}`}
                      agent={agent}
                      color={color}
                      isSelected={selectedAgent?.id === agent.id}
                      onClick={() => handleAgentClick(agent)}
                      style={{ left: vPos.left, top: vPos.top }}
                    />
                  )
                })}
              </OfficeZone>

              {/* Server Room — bottom */}
              <OfficeZone
                type="server"
                style={{ left: 40, top: 650, width: 1000, height: 130 }}
              >
                {agents.map((agent) => {
                  const zone = agentZones[agent.id]?.zone
                  if (zone !== 'server') return null
                  if (!zoneSlotCounters.server) zoneSlotCounters.server = 0
                  const slot = zoneSlotCounters.server++
                  const vPos = ZONE_VISITOR_POS.server[slot % ZONE_VISITOR_POS.server.length]
                  const color = AGENT_COLORS[agent.name] || agent.avatar_color || '#666'

                  return (
                    <AgentDesk
                      key={`server-${agent.id}`}
                      agent={agent}
                      color={color}
                      isSelected={selectedAgent?.id === agent.id}
                      onClick={() => handleAgentClick(agent)}
                      style={{ left: vPos.left, top: vPos.top }}
                    />
                  )
                })}
              </OfficeZone>
            </div>
          </div>
        </div>
      </div>

      {/* Agent detail popup */}
      <AgentPopup
        agent={selectedAgent}
        color={AGENT_COLORS[selectedAgent?.name] || selectedAgent?.avatar_color || '#666'}
        zone={selectedAgent ? agentZones[selectedAgent.id]?.zone : 'work'}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  )
}
