import { useState, useEffect, useRef, Suspense } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import { getAgents } from '../lib/api'
import { useWebSocket } from '../hooks/useWebSocket'

const AGENT_COLORS = {
  Scout: '#3b6fcc',
  Quill: '#c4682d',
  Forge: '#7c5bbf',
  Radar: '#1d8fa0',
}

const DESK_POSITIONS = [
  [-3, 0, -1.5],
  [3, 0, -1.5],
  [-3, 0, 3],
  [3, 0, 3],
]

function OfficeFloor() {
  return (
    <group>
      {/* Main floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 1]} receiveShadow>
        <planeGeometry args={[16, 12]} />
        <meshStandardMaterial color="#151518" />
      </mesh>
      {/* Grid lines */}
      <gridHelper args={[16, 16, '#1a1a1f', '#1a1a1f']} position={[0, 0, 1]} />
      {/* Floor accent border */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.005, 1]}>
        <ringGeometry args={[7.5, 8, 64]} />
        <meshStandardMaterial color="#1e293b" transparent opacity={0.15} />
      </mesh>
    </group>
  )
}

function Desk({ position }) {
  return (
    <group position={position}>
      {/* Desktop surface */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[2.2, 0.08, 1.2]} />
        <meshStandardMaterial color="#1e1e24" />
      </mesh>
      {/* Legs */}
      {[[-0.9, 0, -0.4], [0.9, 0, -0.4], [-0.9, 0, 0.4], [0.9, 0, 0.4]].map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.37, pos[2]]} castShadow>
          <boxGeometry args={[0.06, 0.74, 0.06]} />
          <meshStandardMaterial color="#28282e" />
        </mesh>
      ))}
      {/* Monitor */}
      <group position={[0, 1.15, -0.3]}>
        <mesh>
          <boxGeometry args={[0.9, 0.55, 0.04]} />
          <meshStandardMaterial color="#0a0a0c" />
        </mesh>
        {/* Screen glow */}
        <mesh position={[0, 0, 0.025]}>
          <planeGeometry args={[0.8, 0.45]} />
          <meshStandardMaterial color="#0f172a" emissive="#1e3a5f" emissiveIntensity={0.3} />
        </mesh>
        {/* Monitor stand */}
        <mesh position={[0, -0.35, 0]}>
          <boxGeometry args={[0.08, 0.15, 0.08]} />
          <meshStandardMaterial color="#28282e" />
        </mesh>
      </group>
      {/* Chair */}
      <group position={[0, 0, 0.9]}>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.5, 0.06, 0.5]} />
          <meshStandardMaterial color="#1a1a20" />
        </mesh>
        <mesh position={[0, 0.7, -0.22]}>
          <boxGeometry args={[0.5, 0.55, 0.06]} />
          <meshStandardMaterial color="#1a1a20" />
        </mesh>
      </group>
    </group>
  )
}

function AgentCharacter({ agent, position, onClick }) {
  const meshRef = useRef()
  const glowRef = useRef()
  const color = AGENT_COLORS[agent.name] || '#666'
  const isWorking = agent.status === 'working'
  const isError = agent.status === 'error'

  useFrame((state) => {
    if (!meshRef.current) return
    const t = state.clock.elapsedTime

    if (isWorking) {
      // Working: bob up and down faster
      meshRef.current.position.y = 1.15 + Math.sin(t * 3) * 0.05
      meshRef.current.rotation.y = Math.sin(t * 2) * 0.1
    } else {
      // Idle: gentle breathing
      meshRef.current.position.y = 1.15 + Math.sin(t * 0.8) * 0.015
      meshRef.current.rotation.y = 0
    }

    // Glow pulse for working agents
    if (glowRef.current) {
      glowRef.current.material.opacity = isWorking
        ? 0.15 + Math.sin(t * 2) * 0.1
        : 0
    }
  })

  return (
    <group position={[position[0], 0, position[2]]}>
      <Desk position={[0, 0, 0]} />

      {/* Agent body - sitting at desk */}
      <group ref={meshRef} position={[0, 1.15, 0.6]} onClick={onClick}>
        {/* Torso */}
        <mesh castShadow>
          <boxGeometry args={[0.4, 0.45, 0.25]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 0.35, 0]} castShadow>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshStandardMaterial color={color} />
        </mesh>
        {/* Initial on body */}
        <Html position={[0, 0, 0.13]} center>
          <span className="text-white font-bold text-sm select-none pointer-events-none">{agent.name[0]}</span>
        </Html>

        {/* Status indicator above head */}
        {isWorking && (
          <mesh position={[0, 0.65, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color="#10b981" emissive="#10b981" emissiveIntensity={2} />
          </mesh>
        )}
        {isError && (
          <mesh position={[0, 0.65, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={2} />
          </mesh>
        )}
      </group>

      {/* Ground glow for working agents */}
      <mesh ref={glowRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0.5]}>
        <circleGeometry args={[1.2, 32]} />
        <meshStandardMaterial color={color} transparent opacity={0} />
      </mesh>

      {/* Name label */}
      <Html position={[0, -0.15, 0.6]} center>
        <div className="text-center pointer-events-none select-none">
          <p className="text-[10px] font-semibold text-white/80 whitespace-nowrap">{agent.name}</p>
          <p className="text-[8px] text-white/40 whitespace-nowrap">
            {isWorking ? agent.current_task?.slice(0, 25) || 'Working...' : 'Idle'}
          </p>
        </div>
      </Html>
    </group>
  )
}

function BossDesk() {
  return (
    <group position={[0, 0, -4]}>
      {/* Bigger desk */}
      <mesh position={[0, 0.75, 0]} castShadow>
        <boxGeometry args={[3, 0.1, 1.5]} />
        <meshStandardMaterial color="#1a1520" />
      </mesh>
      {[[-1.2, 0, -0.5], [1.2, 0, -0.5], [-1.2, 0, 0.5], [1.2, 0, 0.5]].map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.37, pos[2]]}>
          <boxGeometry args={[0.08, 0.74, 0.08]} />
          <meshStandardMaterial color="#28282e" />
        </mesh>
      ))}
      {/* Nameplate */}
      <Html position={[0, 1.1, 0]} center>
        <div className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-[9px] text-white/50 whitespace-nowrap pointer-events-none">
          BOSS DESK
        </div>
      </Html>
    </group>
  )
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[8, 12, 5]} intensity={0.6} castShadow shadow-mapSize={1024} />
      <pointLight position={[-5, 6, -3]} intensity={0.3} color="#3b82f6" />
      <pointLight position={[5, 6, 3]} intensity={0.3} color="#8b5cf6" />
    </>
  )
}

function Scene({ agents, onAgentClick }) {
  return (
    <>
      <Lights />
      <OfficeFloor />
      <BossDesk />
      {agents.map((agent, idx) => (
        <AgentCharacter
          key={agent.id}
          agent={agent}
          position={DESK_POSITIONS[idx] || [idx * 3 - 4.5, 0, 2]}
          onClick={() => onAgentClick(agent)}
        />
      ))}
      <OrbitControls
        maxPolarAngle={Math.PI / 2.3}
        minPolarAngle={Math.PI / 6}
        minDistance={5}
        maxDistance={18}
        target={[0, 0, 1]}
        enableDamping
        dampingFactor={0.05}
      />
    </>
  )
}

export function Office() {
  const [agents, setAgents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState(null)
  const { events } = useWebSocket()

  useEffect(() => {
    loadAgents()
  }, [])

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
    <div className="h-[calc(100vh-80px)] relative">
      {/* Status bar */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-4 px-3 py-1.5 bg-black/40 backdrop-blur-sm rounded-lg border border-white/5">
        <span className="text-[10px] text-white/60">
          {agents.length} agents · {activeCount} active
        </span>
        <span className="text-[10px] text-white/30">Orbit: drag · Zoom: scroll</span>
      </div>

      {/* 3D Canvas */}
      <Canvas
        shadows
        camera={{ position: [0, 10, 12], fov: 45 }}
        style={{ background: '#0a0a0c' }}
      >
        <Suspense fallback={null}>
          <Scene agents={agents} onAgentClick={setSelectedAgent} />
        </Suspense>
      </Canvas>

      {/* Agent detail popup */}
      {selectedAgent && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 bg-lab-elevated/95 backdrop-blur-md border border-white/10 rounded-xl p-4 w-72 shadow-2xl">
          <div className="flex items-center gap-3 mb-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: AGENT_COLORS[selectedAgent.name] || '#666' }}
            >
              {selectedAgent.name[0]}
            </div>
            <div>
              <p className="text-sm font-semibold text-white">{selectedAgent.name}</p>
              <p className="text-[10px] text-white/50">{selectedAgent.role}</p>
            </div>
            <button
              onClick={() => setSelectedAgent(null)}
              className="ml-auto text-white/30 hover:text-white/60 text-lg"
            >
              x
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
