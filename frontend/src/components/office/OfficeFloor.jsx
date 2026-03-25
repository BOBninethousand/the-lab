import { Html } from '@react-three/drei'

const ZONE_COLORS = {
  work:    { floor: '#1a1a2e', border: '#3b6fcc' },
  meeting: { floor: '#1e1a14', border: '#f59e0b' },
  boss:    { floor: '#1a142e', border: '#8b5cf6' },
  notion:  { floor: '#141e1a', border: '#10b981' },
  server:  { floor: '#141a1e', border: '#06b6d4' },
}

const ZONES = [
  { id: 'work',    label: 'WORK AREA',     x: -3.5, z: -2,   w: 6, h: 5 },
  { id: 'meeting', label: 'MEETING ROOM',  x: 4.5,  z: -2,   w: 5, h: 5 },
  { id: 'boss',    label: 'BOSS OFFICE',   x: -3.5, z: 4.5,  w: 6, h: 3 },
  { id: 'notion',  label: 'OUTBOX',        x: 4.5,  z: 4.5,  w: 5, h: 3 },
  { id: 'server',  label: 'SERVER ROOM',   x: 0.5,  z: 8.5,  w: 12, h: 2 },
]

function ZoneFloor({ zone }) {
  const colors = ZONE_COLORS[zone.id]
  return (
    <group position={[zone.x, 0, zone.z]}>
      {/* Zone floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
        <planeGeometry args={[zone.w, zone.h]} />
        <meshStandardMaterial color={colors.floor} roughness={0.9} metalness={0.05} />
      </mesh>

      {/* Zone border (4 thin strips) */}
      {[
        { pos: [0, 0.008, -zone.h / 2], size: [zone.w, 0.03] },
        { pos: [0, 0.008, zone.h / 2], size: [zone.w, 0.03] },
        { pos: [-zone.w / 2, 0.008, 0], size: [0.03, zone.h] },
        { pos: [zone.w / 2, 0.008, 0], size: [0.03, zone.h] },
      ].map((edge, i) => (
        <mesh key={i} position={edge.pos} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={edge.size} />
          <meshBasicMaterial color={colors.border} transparent opacity={0.5} />
        </mesh>
      ))}

      {/* Zone label */}
      <Html position={[-zone.w / 2 + 0.3, 0.02, -zone.h / 2 + 0.3]} transform={false}>
        <div style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.15em',
          color: colors.border, opacity: 0.6, whiteSpace: 'nowrap', pointerEvents: 'none',
          fontFamily: '"JetBrains Mono", "SF Mono", monospace',
        }}>
          {zone.label}
        </div>
      </Html>
    </group>
  )
}

function Desk({ position, color, isWorking, monitorCount = 2 }) {
  const emissiveIntensity = isWorking ? 0.3 : 0
  return (
    <group position={position}>
      {/* Desk surface */}
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.06, 0.7]} />
        <meshStandardMaterial color="#1c1c28" roughness={0.8} metalness={0.1} />
      </mesh>

      {/* Desk legs */}
      {[[-0.5, 0, -0.25], [0.5, 0, -0.25], [-0.5, 0, 0.25], [0.5, 0, 0.25]].map((pos, i) => (
        <mesh key={i} position={[pos[0], 0.27, pos[2]]} castShadow>
          <boxGeometry args={[0.05, 0.54, 0.05]} />
          <meshStandardMaterial color="#121218" roughness={0.9} />
        </mesh>
      ))}

      {/* Monitors */}
      {Array.from({ length: monitorCount }).map((_, i) => {
        const offsetX = monitorCount === 1 ? 0 : (i - (monitorCount - 1) / 2) * 0.35
        return (
          <group key={i} position={[offsetX, 0.78, -0.15]}>
            {/* Monitor frame */}
            <mesh castShadow>
              <boxGeometry args={[0.3, 0.22, 0.02]} />
              <meshStandardMaterial color="#0c0c14" roughness={0.7} metalness={0.2} />
            </mesh>
            {/* Screen */}
            <mesh position={[0, 0, 0.011]}>
              <planeGeometry args={[0.26, 0.18]} />
              <meshStandardMaterial
                color={isWorking ? '#060818' : '#08080c'}
                emissive={isWorking ? color : '#000000'}
                emissiveIntensity={emissiveIntensity}
                roughness={0.5}
              />
            </mesh>
            {/* Stand */}
            <mesh position={[0, -0.15, 0]}>
              <boxGeometry args={[0.04, 0.08, 0.04]} />
              <meshStandardMaterial color="#101018" roughness={0.9} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function MeetingTable({ position }) {
  return (
    <group position={position}>
      {/* Table top */}
      <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.8, 0.8, 0.06, 24]} />
        <meshStandardMaterial color="#1e1a28" roughness={0.7} metalness={0.15} />
      </mesh>
      {/* Table leg */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.12, 0.5, 8]} />
        <meshStandardMaterial color="#14101e" roughness={0.9} />
      </mesh>
      {/* Chairs */}
      {[0, Math.PI / 2, Math.PI, Math.PI * 1.5].map((angle, i) => (
        <mesh
          key={i}
          position={[Math.sin(angle) * 1.2, 0.3, Math.cos(angle) * 1.2]}
          castShadow
        >
          <boxGeometry args={[0.3, 0.05, 0.3]} />
          <meshStandardMaterial color="#1a1824" roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

function BossDeskFurniture({ position }) {
  return (
    <group position={position}>
      {/* Large L-desk */}
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[2, 0.06, 0.8]} />
        <meshStandardMaterial color="#1e1830" roughness={0.7} metalness={0.15}
          emissive="#8b5cf6" emissiveIntensity={0.02} />
      </mesh>
      {/* Triple monitors */}
      {[-0.5, 0, 0.5].map((x, i) => (
        <group key={i} position={[x, 0.78, -0.2]}>
          <mesh castShadow>
            <boxGeometry args={[0.35, 0.25, 0.02]} />
            <meshStandardMaterial color="#0a0814" roughness={0.7} metalness={0.2} />
          </mesh>
          <mesh position={[0, 0, 0.011]}>
            <planeGeometry args={[0.3, 0.2]} />
            <meshStandardMaterial color="#0a0614" emissive="#8b5cf6" emissiveIntensity={0.08} roughness={0.5} />
          </mesh>
        </group>
      ))}
      {/* Boss chair */}
      <mesh position={[0, 0.35, 0.6]} castShadow>
        <boxGeometry args={[0.4, 0.6, 0.4]} />
        <meshStandardMaterial color="#201838" roughness={0.8} />
      </mesh>
    </group>
  )
}

function ServerRack({ position, index }) {
  return (
    <group position={position}>
      <mesh castShadow>
        <boxGeometry args={[0.4, 0.9, 0.5]} />
        <meshStandardMaterial color="#0c1418" roughness={0.85} metalness={0.1} />
      </mesh>
      {/* LEDs */}
      {[0.25, 0.1, -0.05, -0.2].map((y, j) => (
        <mesh key={j} position={[0.201, y, 0]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial
            color={j === 0 && index < 3 ? '#06b6d4' : '#333'}
            emissive={j === 0 && index < 3 ? '#06b6d4' : '#000'}
            emissiveIntensity={j === 0 && index < 3 ? 0.8 : 0}
          />
        </mesh>
      ))}
    </group>
  )
}

function FilingCabinets({ position }) {
  return (
    <group position={position}>
      {[[-0.5, 0.6], [0, 0.75], [0.5, 0.5]].map(([x, h], i) => (
        <mesh key={i} position={[x, h / 2, 0]} castShadow>
          <boxGeometry args={[0.4, h, 0.4]} />
          <meshStandardMaterial color="#162018" roughness={0.85}
            emissive="#10b981" emissiveIntensity={0.02} />
        </mesh>
      ))}
    </group>
  )
}

// Desk positions per agent slot within each zone
export const DESK_POSITIONS = {
  work: [
    [-5.5, 0, -3.5], [-2.5, 0, -3.5],
    [-5.5, 0, -0.5], [-2.5, 0, -0.5],
  ],
  meeting: [
    [3.5, 0, -3.2], [5.5, 0, -3.2],
    [3.5, 0, -0.8], [5.5, 0, -0.8],
  ],
  boss: [
    [-4.5, 0, 4.2], [-2.5, 0, 4.2],
  ],
  notion: [
    [3.5, 0, 4.2], [5.5, 0, 4.2],
  ],
  server: [
    [-2, 0, 8.2], [1, 0, 8.2], [4, 0, 8.2],
  ],
}

export function OfficeFloor({ agents, agentZones, agentColors }) {
  return (
    <group>
      {/* Main floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[16, 14]} />
        <meshLambertMaterial color="#0e0e16" />
      </mesh>

      {/* Grid lines */}
      {Array.from({ length: 16 }).map((_, i) => (
        <mesh key={`h${i}`} position={[0, 0.002, -7 + i]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[16, 0.005]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.03} />
        </mesh>
      ))}
      {Array.from({ length: 18 }).map((_, i) => (
        <mesh key={`v${i}`} position={[-8 + i, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.005, 14]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.03} />
        </mesh>
      ))}

      {/* Zones */}
      {ZONES.map(zone => <ZoneFloor key={zone.id} zone={zone} />)}

      {/* Agent desks in work zone */}
      {agents.map((agent, idx) => {
        const pos = DESK_POSITIONS.work[idx] || DESK_POSITIONS.work[0]
        const color = agentColors[agent.name] || '#666'
        const isWorking = agent.status === 'working'
        const monitorCount = { Scout: 2, Quill: 1, Forge: 3, Radar: 1 }[agent.name] || 2
        return <Desk key={`desk-${agent.id}`} position={pos} color={color} isWorking={isWorking} monitorCount={monitorCount} />
      })}

      {/* Meeting table */}
      <MeetingTable position={[4.5, 0, -2]} />

      {/* Boss desk furniture */}
      <BossDeskFurniture position={[-3.5, 0, 4.5]} />

      {/* Filing cabinets */}
      <FilingCabinets position={[4.5, 0, 4.5]} />

      {/* Server racks */}
      {[0, 1, 2, 3, 4].map(i => (
        <ServerRack key={i} position={[-3 + i * 1.5, 0.45, 8.5]} index={i} />
      ))}

      {/* Walls */}
      {[
        { pos: [0, 0.5, -7], size: [16, 1, 0.1] },
        { pos: [0, 0.5, 10], size: [16, 1, 0.1] },
        { pos: [-8, 0.5, 1.5], size: [0.1, 1, 17] },
        { pos: [8, 0.5, 1.5], size: [0.1, 1, 17] },
      ].map((wall, i) => (
        <mesh key={i} position={wall.pos} receiveShadow>
          <boxGeometry args={wall.size} />
          <meshStandardMaterial color="#1a1a24" roughness={0.9} emissive="#1a1a24" emissiveIntensity={0.1} />
        </mesh>
      ))}
    </group>
  )
}
