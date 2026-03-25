import { useState, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { getAgents } from '../lib/api'
import { useWebSocket } from '../hooks/useWebSocket'
import { OfficeFloor, DESK_POSITIONS } from '../components/office/OfficeFloor'
import { AgentCharacter } from '../components/office/AgentCharacter'
import { AgentPopup } from '../components/office/AgentPopup'
import { OfficeCss } from './OfficeCss'

function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch { return false }
}

const AGENT_COLORS = {
  Scout: '#3b6fcc',
  Quill: '#c4682d',
  Forge: '#7c5bbf',
  Radar: '#1d8fa0',
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

function getCharacterPosition(agent, idx, zone) {
  const positions = DESK_POSITIONS[zone]
  if (!positions) return [0, 0, 0]
  // For work zone, use home desk. For other zones, use visitor slots.
  const slotIdx = zone === 'work' ? idx : 0
  const deskPos = positions[slotIdx % positions.length]
  // Place character next to desk (offset to the side)
  return [deskPos[0] + 0.7, 0, deskPos[2] + 0.5]
}

export function Office() {
  const webglSupported = useMemo(() => hasWebGL(), [])

  if (!webglSupported) return <OfficeCss />

  return <Office3D />
}

function Office3D() {
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
        setSelectedAgent(prev =>
          prev?.id === lastEvent.agent_id
            ? { ...prev, status: lastEvent.status || prev.status, current_task: lastEvent.current_task ?? prev.current_task }
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

  // Compute zones and track visitor slot counters
  const zoneSlotCounters = {}
  const agentZones = {}
  agents.forEach((agent, idx) => {
    const zone = getAgentZone(agent)
    const slot = zone !== 'work' ? (zoneSlotCounters[zone] = (zoneSlotCounters[zone] || 0) + 1) - 1 : idx
    agentZones[agent.id] = { zone, slot }
  })

  const activeCount = agents.filter(a => a.status === 'working').length

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
      </div>

      {/* Three.js Canvas */}
      <Canvas
        shadows
        camera={{ position: [14, 12, 14], fov: 42 }}
        onPointerMissed={() => setSelectedAgent(null)}
        style={{ background: '#08080e' }}
      >
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[8, 14, 6]}
          intensity={0.7}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-camera-far={40}
          shadow-camera-left={-12}
          shadow-camera-right={12}
          shadow-camera-top={12}
          shadow-camera-bottom={-12}
        />
        <directionalLight position={[-6, 8, -4]} intensity={0.15} />
        <hemisphereLight args={['#1a1a3e', '#0a0a14', 0.2]} />

        <OrbitControls
          target={[0, 0, 2]}
          maxPolarAngle={Math.PI / 2.2}
          minPolarAngle={0.3}
          minDistance={5}
          maxDistance={28}
          enableDamping
          dampingFactor={0.05}
        />

        <OfficeFloor agents={agents} agentZones={agentZones} agentColors={AGENT_COLORS} />

        {agents.map((agent, idx) => {
          const { zone, slot } = agentZones[agent.id] || { zone: 'work', slot: idx }
          const pos = getCharacterPosition(agent, zone === 'work' ? idx : slot, zone)
          const color = AGENT_COLORS[agent.name] || agent.avatar_color || '#666'

          return (
            <AgentCharacter
              key={agent.id}
              agent={agent}
              color={color}
              position={pos}
              onClick={(a) => setSelectedAgent(prev => prev?.id === a.id ? null : a)}
            />
          )
        })}

        <fog attach="fog" args={['#08080e', 18, 35]} />
      </Canvas>

      {/* Agent detail popup (HTML overlay) */}
      <AgentPopup
        agent={selectedAgent}
        color={AGENT_COLORS[selectedAgent?.name] || selectedAgent?.avatar_color || '#666'}
        zone={selectedAgent ? agentZones[selectedAgent.id]?.zone : 'work'}
        onClose={() => setSelectedAgent(null)}
      />
    </div>
  )
}
