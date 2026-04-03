import { useState, useEffect, useMemo } from 'react'
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
  'Dr Bob': '#2196F3',
  'Agent Bob': '#4CAF50',
  'Agent Alice': '#9C27B0',
  'Agent Charlie': '#FF9800',
  'Agent Diana': '#F44336',
  'Agent Echo': '#00BCD4',
}

// Home desk positions within work zone (2 cols x 4 rows, fits 600px height)
const HOME_POSITIONS = [
  { left: 20, top: 30 },
  { left: 250, top: 30 },
  { left: 20, top: 165 },
  { left: 250, top: 165 },
  { left: 20, top: 300 },
  { left: 250, top: 300 },
  { left: 20, top: 435 },
  { left: 250, top: 435 },
]

// Visitor positions per zone (fit within new zone dimensions)
const ZONE_VISITOR_POS = {
  meeting: [
    { left: 40, top: 30 },
    { left: 200, top: 30 },
    { left: 40, top: 130 },
    { left: 200, top: 130 },
  ],
  boss: [
    { left: 50, top: 25 },
    { left: 210, top: 25 },
  ],
  notion: [
    { left: 60, top: 20 },
    { left: 210, top: 20 },
  ],
  server: [
    { left: 120, top: 30 },
    { left: 380, top: 30 },
    { left: 640, top: 30 },
  ],
}

function getAgentZone(agent, collaboration) {
  if (collaboration?.agents?.includes(agent.name)) return 'meeting'
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
  const [collaboration, setCollaboration] = useState(null)
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
      if (lastEvent.type === 'agent_created' && lastEvent.data) {
        setAgents(prev => {
          if (prev.some(a => a.id === lastEvent.data.id)) return prev
          return [...prev, lastEvent.data]
        })
      }
      if (lastEvent.type === 'agent_deleted' && lastEvent.data?.id) {
        setAgents(prev => prev.filter(a => a.id !== lastEvent.data.id))
      }
      if (lastEvent.type === 'agent_collaboration' && lastEvent.data) {
        const { action, agent_names, collaboration_id } = lastEvent.data
        if (action === 'started') {
          setCollaboration({ id: collaboration_id, agents: agent_names })
        } else if (action === 'completed') {
          setTimeout(() => setCollaboration(null), 3000)
        }
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

  // Pre-compute zone assignments, counts, and slot indices
  const { agentZones, zoneCounts, zoneSlots } = useMemo(() => {
    const zones = {}
    const counts = { work: 0, meeting: 0, boss: 0, notion: 0, server: 0 }
    const slots = {}
    const counters = { meeting: 0, boss: 0, notion: 0, server: 0 }

    agents.forEach((agent, idx) => {
      const zone = getAgentZone(agent, collaboration)
      zones[agent.id] = { zone, homeIdx: idx }
      counts[zone] = (counts[zone] || 0) + 1
      if (zone !== 'work' && counters[zone] !== undefined) {
        slots[agent.id] = counters[zone]++
      }
    })

    return { agentZones: zones, zoneCounts: counts, zoneSlots: slots }
  }, [agents, collaboration])

  const activeCount = agents.filter(a => a.status === 'working').length
  const zoomPct = Math.round(zoom * 100)

  const handleAgentClick = (agent) => {
    if (isDragging || wasDragging()) return
    setSelectedAgent(prev => prev?.id === agent.id ? null : agent)
  }

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

        {collaboration && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg animate-pulse"
            style={{
              background: 'rgba(16,185,129,0.1)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(16,185,129,0.2)',
            }}>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-[10px] text-emerald-400"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              COLLABORATING: {collaboration.agents.join(' + ')}
            </span>
          </div>
        )}

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

      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/10 border-t-white/40" />
            <p className="text-[11px] text-white/30" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              Loading office...
            </p>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && agents.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="flex flex-col items-center gap-3">
            <p className="text-[12px] text-white/40" style={{ fontFamily: '"JetBrains Mono", monospace' }}>
              No agents online
            </p>
            <p className="text-[10px] text-white/20">Create agents from the Agents tab to populate the office</p>
          </div>
        </div>
      )}

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
                height: 900,
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

              {/* Work Area — left column */}
              <OfficeZone
                type="work"
                style={{ left: 40, top: 40, width: 500, height: 600 }}
                count={zoneCounts.work}
              >
                {agents.map((agent, idx) => {
                  if (agentZones[agent.id]?.zone !== 'work') return null
                  const pos = HOME_POSITIONS[idx] || { left: 30 + (idx % 2) * 190, top: 40 + Math.floor(idx / 2) * 140 }
                  const color = AGENT_COLORS[agent.name] || agent.avatar_color || '#666'
                  return (
                    <AgentDesk
                      key={agent.id}
                      agent={agent}
                      color={color}
                      isSelected={selectedAgent?.id === agent.id}
                      onClick={() => handleAgentClick(agent)}
                      style={{ left: pos.left, top: pos.top }}
                    />
                  )
                })}
              </OfficeZone>

              {/* Meeting Room — top right */}
              <OfficeZone
                type="meeting"
                style={{ left: 560, top: 40, width: 500, height: 250 }}
                count={zoneCounts.meeting}
              >
                {agents.map((agent) => {
                  if (agentZones[agent.id]?.zone !== 'meeting') return null
                  const slot = zoneSlots[agent.id] || 0
                  const vPos = ZONE_VISITOR_POS.meeting[slot % ZONE_VISITOR_POS.meeting.length]
                  const color = AGENT_COLORS[agent.name] || agent.avatar_color || '#666'
                  return (
                    <AgentDesk
                      key={agent.id}
                      agent={agent}
                      color={color}
                      isSelected={selectedAgent?.id === agent.id}
                      onClick={() => handleAgentClick(agent)}
                      style={{ left: vPos.left, top: vPos.top }}
                    />
                  )
                })}
              </OfficeZone>

              {/* Boss Office — middle right */}
              <OfficeZone
                type="boss"
                style={{ left: 560, top: 310, width: 500, height: 160 }}
                count={zoneCounts.boss}
              >
                {agents.map((agent) => {
                  if (agentZones[agent.id]?.zone !== 'boss') return null
                  const slot = zoneSlots[agent.id] || 0
                  const vPos = ZONE_VISITOR_POS.boss[slot % ZONE_VISITOR_POS.boss.length]
                  const color = AGENT_COLORS[agent.name] || agent.avatar_color || '#666'
                  return (
                    <AgentDesk
                      key={agent.id}
                      agent={agent}
                      color={color}
                      isSelected={selectedAgent?.id === agent.id}
                      onClick={() => handleAgentClick(agent)}
                      style={{ left: vPos.left, top: vPos.top }}
                    />
                  )
                })}
              </OfficeZone>

              {/* Notion Outbox — lower right */}
              <OfficeZone
                type="notion"
                style={{ left: 560, top: 490, width: 500, height: 150 }}
                count={zoneCounts.notion}
              >
                {agents.map((agent) => {
                  if (agentZones[agent.id]?.zone !== 'notion') return null
                  const slot = zoneSlots[agent.id] || 0
                  const vPos = ZONE_VISITOR_POS.notion[slot % ZONE_VISITOR_POS.notion.length]
                  const color = AGENT_COLORS[agent.name] || agent.avatar_color || '#666'
                  return (
                    <AgentDesk
                      key={agent.id}
                      agent={agent}
                      color={color}
                      isSelected={selectedAgent?.id === agent.id}
                      onClick={() => handleAgentClick(agent)}
                      style={{ left: vPos.left, top: vPos.top }}
                    />
                  )
                })}
              </OfficeZone>

              {/* Server Room — bottom full width */}
              <OfficeZone
                type="server"
                style={{ left: 40, top: 660, width: 1020, height: 200 }}
                count={zoneCounts.server}
              >
                {agents.map((agent) => {
                  if (agentZones[agent.id]?.zone !== 'server') return null
                  const slot = zoneSlots[agent.id] || 0
                  const vPos = ZONE_VISITOR_POS.server[slot % ZONE_VISITOR_POS.server.length]
                  const color = AGENT_COLORS[agent.name] || agent.avatar_color || '#666'
                  return (
                    <AgentDesk
                      key={agent.id}
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
