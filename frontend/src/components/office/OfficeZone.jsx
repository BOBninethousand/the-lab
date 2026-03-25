const ZONE_CONFIGS = {
  work: {
    label: 'WORK AREA',
    tint: 'rgba(59,111,204,0.04)',
    border: 'rgba(59,111,204,0.12)',
    glow: 'rgba(59,111,204,0.06)',
  },
  meeting: {
    label: 'MEETING ROOM',
    tint: 'rgba(245,158,11,0.04)',
    border: 'rgba(245,158,11,0.12)',
    glow: 'rgba(245,158,11,0.06)',
  },
  boss: {
    label: 'BOSS OFFICE',
    tint: 'rgba(139,92,246,0.05)',
    border: 'rgba(139,92,246,0.15)',
    glow: 'rgba(139,92,246,0.08)',
  },
  notion: {
    label: 'NOTION OUTBOX',
    tint: 'rgba(16,185,129,0.04)',
    border: 'rgba(16,185,129,0.12)',
    glow: 'rgba(16,185,129,0.06)',
  },
  server: {
    label: 'SERVER ROOM',
    tint: 'rgba(6,182,212,0.04)',
    border: 'rgba(6,182,212,0.10)',
    glow: 'rgba(6,182,212,0.05)',
  },
}

function MeetingTable() {
  return (
    <div className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', transformStyle: 'preserve-3d' }}>
      {/* Round table */}
      <div style={{
        width: 80, height: 80, borderRadius: '50%',
        background: 'linear-gradient(135deg, #1e1a28 0%, #16131e 100%)',
        border: '1px solid rgba(245,158,11,0.15)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.03)',
        transform: 'translateZ(20px)',
      }} />
      {/* Chairs */}
      {[0, 90, 180, 270].map(angle => (
        <div key={angle} className="absolute" style={{
          width: 16, height: 16, borderRadius: '50%',
          background: 'linear-gradient(135deg, #1a1824 0%, #121018 100%)',
          border: '1px solid rgba(255,255,255,0.05)',
          left: '50%', top: '50%',
          transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-54px) translateZ(12px)`,
        }} />
      ))}
    </div>
  )
}

function BossDesk() {
  return (
    <div className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', transformStyle: 'preserve-3d' }}>
      {/* L-shaped desk */}
      <div style={{
        width: 160, height: 50,
        background: 'linear-gradient(135deg, #1e1830 0%, #151020 100%)',
        borderRadius: 4,
        border: '1px solid rgba(139,92,246,0.2)',
        boxShadow: '0 0 20px rgba(139,92,246,0.06), 0 6px 20px rgba(0,0,0,0.4)',
        transform: 'translateZ(28px)',
      }}>
        {/* Command monitors */}
        <div className="flex gap-1 justify-center pt-1.5">
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 22, height: 14, borderRadius: 2,
              background: '#0a0814',
              border: '1px solid rgba(139,92,246,0.15)',
              boxShadow: '0 0 4px rgba(139,92,246,0.08)',
            }}>
              <div className="mt-[3px] mx-[3px] space-y-[2px]">
                <div style={{ height: 1, width: '70%', background: 'rgba(139,92,246,0.25)', borderRadius: 1 }} />
                <div style={{ height: 1, width: '50%', background: 'rgba(139,92,246,0.15)', borderRadius: 1 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Boss chair */}
      <div style={{
        position: 'absolute', bottom: -28, left: '50%', transform: 'translateX(-50%) translateZ(14px)',
        width: 28, height: 24, borderRadius: '50% 50% 30% 30%',
        background: 'linear-gradient(135deg, #201838 0%, #160e28 100%)',
        border: '1px solid rgba(139,92,246,0.2)',
      }} />
    </div>
  )
}

function FilingCabinet() {
  return (
    <div className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', transformStyle: 'preserve-3d' }}>
      {/* Cabinet stack */}
      <div className="flex gap-3 items-end">
        {[48, 56, 42].map((h, i) => (
          <div key={i} style={{
            width: 30, height: h, borderRadius: 3,
            background: 'linear-gradient(135deg, #162018 0%, #0e1810 100%)',
            border: '1px solid rgba(16,185,129,0.15)',
            transform: 'translateZ(20px)',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 4, padding: '0 4px',
          }}>
            {Array.from({ length: Math.floor(h / 14) }).map((_, j) => (
              <div key={j} style={{ height: 1, background: 'rgba(16,185,129,0.2)', borderRadius: 1 }} />
            ))}
          </div>
        ))}
      </div>
      {/* Outbox tray */}
      <div className="mt-2 mx-auto" style={{
        width: 50, height: 8, borderRadius: 2,
        background: 'linear-gradient(135deg, #142018 0%, #0c1610 100%)',
        border: '1px solid rgba(16,185,129,0.12)',
        transform: 'translateZ(24px)',
      }} />
    </div>
  )
}

function ServerRacks() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-4" style={{ transformStyle: 'preserve-3d' }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: 24, height: 52, borderRadius: 3,
          background: 'linear-gradient(180deg, #0c1418 0%, #080e12 100%)',
          border: '1px solid rgba(6,182,212,0.12)',
          transform: 'translateZ(20px)',
          display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 3px',
        }}>
          {[0, 1, 2, 3].map(j => (
            <div key={j} className="flex items-center gap-[2px]">
              <div
                className={j === 0 && i < 3 ? 'animate-pulse' : ''}
                style={{
                  width: 3, height: 3, borderRadius: '50%',
                  background: j === 0 ? (i < 3 ? '#06b6d4' : '#6b7280') : 'rgba(6,182,212,0.15)',
                  boxShadow: j === 0 && i < 3 ? '0 0 4px rgba(6,182,212,0.5)' : 'none',
                }}
              />
              <div style={{ flex: 1, height: 1, background: 'rgba(6,182,212,0.08)', borderRadius: 1 }} />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

const FURNITURE = {
  meeting: MeetingTable,
  boss: BossDesk,
  notion: FilingCabinet,
  server: ServerRacks,
}

export function OfficeZone({ type, style, children }) {
  const config = ZONE_CONFIGS[type] || ZONE_CONFIGS.work
  const Furniture = FURNITURE[type]

  return (
    <div
      className="absolute"
      style={{
        ...style,
        background: config.tint,
        borderRadius: 8,
        border: `1px solid ${config.border}`,
        boxShadow: `0 0 30px ${config.glow}, inset 0 1px 0 rgba(255,255,255,0.02)`,
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Zone label */}
      <div
        className="absolute"
        style={{
          top: 10, left: 14,
          transform: 'rotateZ(45deg) rotateX(-55deg) translateZ(4px)',
          transformStyle: 'preserve-3d',
        }}
      >
        <span style={{
          fontSize: 8, fontWeight: 700, letterSpacing: '0.2em',
          color: config.border.replace(/[\d.]+\)$/, '0.5)'),
          fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
          textTransform: 'uppercase',
        }}>
          {config.label}
        </span>
      </div>

      {/* Zone furniture */}
      {Furniture && <Furniture />}

      {/* Children (agent desks placed here) */}
      {children}
    </div>
  )
}
