import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

const STATUS_COLORS = {
  working: '#10b981',
  error: '#ef4444',
  idle: '#4b5563',
}

export function AgentCharacter({ agent, color, position, onClick }) {
  const groupRef = useRef()
  const leftLegRef = useRef()
  const rightLegRef = useRef()
  const leftArmRef = useRef()
  const rightArmRef = useRef()
  const headRef = useRef()
  const statusRingRef = useRef()

  const isWorking = agent.status === 'working'
  const isError = agent.status === 'error'

  const bodyColor = useMemo(() => new THREE.Color(color), [color])
  const headColor = useMemo(() => new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.15), [color])
  const darkColor = useMemo(() => new THREE.Color(color).lerp(new THREE.Color('#000000'), 0.3), [color])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()

    if (!groupRef.current) return

    // Breathing bob (always)
    groupRef.current.position.y = position[1] + Math.sin(t * 0.8) * 0.015

    // Head subtle look
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.3) * 0.08
    }

    // Walking animation when working
    const legSwing = isWorking ? Math.sin(t * 4) * 0.35 : 0
    const armSwing = isWorking ? Math.sin(t * 4) * 0.25 : 0

    if (leftLegRef.current) leftLegRef.current.rotation.x = legSwing
    if (rightLegRef.current) rightLegRef.current.rotation.x = -legSwing
    if (leftArmRef.current) leftArmRef.current.rotation.x = -armSwing
    if (rightArmRef.current) rightArmRef.current.rotation.x = armSwing

    // Status ring pulse
    if (statusRingRef.current) {
      if (isWorking) {
        const pulse = (Math.sin(t * 3) + 1) / 2
        statusRingRef.current.scale.setScalar(0.8 + pulse * 0.4)
        statusRingRef.current.material.opacity = 0.2 + pulse * 0.3
      } else if (isError) {
        const pulse = (Math.sin(t * 5) + 1) / 2
        statusRingRef.current.material.opacity = 0.3 + pulse * 0.4
        statusRingRef.current.scale.setScalar(1)
      } else {
        statusRingRef.current.material.opacity = 0
      }
    }
  })

  return (
    <group
      ref={groupRef}
      position={position}
      onClick={(e) => { e.stopPropagation(); onClick?.(agent) }}
    >
      {/* Shadow on floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <circleGeometry args={[0.22, 16]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} />
      </mesh>

      {/* Status ring */}
      <mesh ref={statusRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <ringGeometry args={[0.28, 0.32, 24]} />
        <meshBasicMaterial
          color={isError ? '#ef4444' : color}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Legs */}
      <group position={[-0.06, 0.15, 0]} ref={leftLegRef}>
        <mesh position={[0, -0.07, 0]} castShadow>
          <boxGeometry args={[0.08, 0.22, 0.08]} />
          <meshStandardMaterial color={darkColor} roughness={0.8} />
        </mesh>
        {/* Shoe */}
        <mesh position={[0, -0.18, 0.02]} castShadow>
          <boxGeometry args={[0.09, 0.04, 0.12]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.9} />
        </mesh>
      </group>

      <group position={[0.06, 0.15, 0]} ref={rightLegRef}>
        <mesh position={[0, -0.07, 0]} castShadow>
          <boxGeometry args={[0.08, 0.22, 0.08]} />
          <meshStandardMaterial color={darkColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.18, 0.02]} castShadow>
          <boxGeometry args={[0.09, 0.04, 0.12]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.9} />
        </mesh>
      </group>

      {/* Torso */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <boxGeometry args={[0.22, 0.24, 0.14]} />
        <meshStandardMaterial color={bodyColor} roughness={0.7} metalness={0.05}
          emissive={isWorking ? color : '#000000'} emissiveIntensity={isWorking ? 0.15 : 0} />
      </mesh>

      {/* Arms */}
      <group position={[-0.16, 0.4, 0]} ref={leftArmRef}>
        <mesh position={[0, -0.1, 0]} castShadow>
          <boxGeometry args={[0.07, 0.2, 0.07]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
        {/* Hand */}
        <mesh position={[0, -0.22, 0]} castShadow>
          <boxGeometry args={[0.06, 0.06, 0.06]} />
          <meshStandardMaterial color="#d4a574" roughness={0.8} />
        </mesh>
      </group>

      <group position={[0.16, 0.4, 0]} ref={rightArmRef}>
        <mesh position={[0, -0.1, 0]} castShadow>
          <boxGeometry args={[0.07, 0.2, 0.07]} />
          <meshStandardMaterial color={bodyColor} roughness={0.8} />
        </mesh>
        <mesh position={[0, -0.22, 0]} castShadow>
          <boxGeometry args={[0.06, 0.06, 0.06]} />
          <meshStandardMaterial color="#d4a574" roughness={0.8} />
        </mesh>
      </group>

      {/* Neck */}
      <mesh position={[0, 0.49, 0]} castShadow>
        <boxGeometry args={[0.06, 0.04, 0.06]} />
        <meshStandardMaterial color="#d4a574" roughness={0.8} />
      </mesh>

      {/* Head */}
      <group ref={headRef} position={[0, 0.59, 0]}>
        <mesh castShadow>
          <boxGeometry args={[0.18, 0.18, 0.18]} />
          <meshStandardMaterial color={headColor} roughness={0.6} metalness={0.05} />
        </mesh>

        {/* Eyes */}
        <mesh position={[-0.04, 0.02, 0.091]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial color="#ffffff" roughness={0.3} />
        </mesh>
        <mesh position={[0.04, 0.02, 0.091]}>
          <sphereGeometry args={[0.025, 8, 8]} />
          <meshStandardMaterial color="#ffffff" roughness={0.3} />
        </mesh>
        {/* Pupils */}
        <mesh position={[-0.04, 0.02, 0.115]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.5} />
        </mesh>
        <mesh position={[0.04, 0.02, 0.115]}>
          <sphereGeometry args={[0.012, 8, 8]} />
          <meshStandardMaterial color="#1a1a2e" roughness={0.5} />
        </mesh>

        {/* Mouth */}
        <mesh position={[0, -0.04, 0.091]}>
          <boxGeometry args={[0.06, 0.015, 0.005]} />
          <meshStandardMaterial color="#9c4a4a" roughness={0.8} />
        </mesh>

        {/* Error exclamation */}
        {isError && (
          <mesh position={[0, 0.18, 0]}>
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.8} />
          </mesh>
        )}
      </group>

      {/* Name tag */}
      <Html position={[0, 0.85, 0]} center distanceFactor={8}>
        <div style={{
          padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap', pointerEvents: 'none',
          background: 'rgba(10,10,16,0.85)', border: `1px solid ${color}40`,
          backdropFilter: 'blur(8px)',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 700, color: color,
            fontFamily: '"JetBrains Mono", monospace', letterSpacing: '0.05em',
          }}>
            {agent.name}
          </span>
          <span style={{
            fontSize: 8, marginLeft: 6,
            color: STATUS_COLORS[agent.status] || STATUS_COLORS.idle,
          }}>
            {isWorking ? 'WORKING' : isError ? 'ERROR' : 'IDLE'}
          </span>
        </div>
      </Html>
    </group>
  )
}
