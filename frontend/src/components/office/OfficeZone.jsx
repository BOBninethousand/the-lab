const ZONE_CONFIGS = {
  work: {
    label: 'WORK AREA',
    tint: 'rgba(59,111,204,0.06)',
    border: 'rgba(59,111,204,0.20)',
    glow: 'rgba(59,111,204,0.10)',
  },
  meeting: {
    label: 'MEETING ROOM',
    tint: 'rgba(245,158,11,0.06)',
    border: 'rgba(245,158,11,0.20)',
    glow: 'rgba(245,158,11,0.10)',
  },
  boss: {
    label: 'BOSS OFFICE',
    tint: 'rgba(139,92,246,0.07)',
    border: 'rgba(139,92,246,0.22)',
    glow: 'rgba(139,92,246,0.12)',
  },
  notion: {
    label: 'NOTION OUTBOX',
    tint: 'rgba(16,185,129,0.06)',
    border: 'rgba(16,185,129,0.20)',
    glow: 'rgba(16,185,129,0.10)',
  },
  server: {
    label: 'SERVER ROOM',
    tint: 'rgba(6,182,212,0.06)',
    border: 'rgba(6,182,212,0.18)',
    glow: 'rgba(6,182,212,0.10)',
  },
}

function MeetingTable() {
  return (
    <div className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', transformStyle: 'preserve-3d' }}>
      {/* Round table */}
      <div style={{
        width: 100, height: 100, borderRadius: '50%',
        background: 'linear-gradient(135deg, #1e1a28 0%, #16131e 100%)',
        border: '1.5px solid rgba(245,158,11,0.25)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)',
        transform: 'translateZ(20px)',
      }} />
      {/* Chairs */}
      {[0, 90, 180, 270].map(angle => (
        <div key={angle} className="absolute" style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'linear-gradient(135deg, #1a1824 0%, #121018 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          left: '50%', top: '50%',
          transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-66px) translateZ(12px)`,
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
        width: 200, height: 60,
        background: 'linear-gradient(135deg, #1e1830 0%, #151020 100%)',
        borderRadius: 5,
        border: '1.5px solid rgba(139,92,246,0.3)',
        boxShadow: '0 0 24px rgba(139,92,246,0.10), 0 6px 20px rgba(0,0,0,0.5)',
        transform: 'translateZ(28px)',
      }}>
        {/* Command monitors */}
        <div className="flex gap-1.5 justify-center pt-2">
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              width: 28, height: 18, borderRadius: 2,
              background: '#0a0814',
              border: '1px solid rgba(139,92,246,0.25)',
              boxShadow: '0 0 6px rgba(139,92,246,0.12)',
            }}>
              <div className="mt-1 mx-1 space-y-[3px]">
                <div style={{ height: 2, width: '70%', background: 'rgba(139,92,246,0.35)', borderRadius: 1 }} />
                <div style={{ height: 1, width: '50%', background: 'rgba(139,92,246,0.20)', borderRadius: 1 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Boss chair */}
      <div style={{
        position: 'absolute', bottom: -32, left: '50%', transform: 'translateX(-50%) translateZ(14px)',
        width: 34, height: 28, borderRadius: '50% 50% 30% 30%',
        background: 'linear-gradient(135deg, #201838 0%, #160e28 100%)',
        border: '1.5px solid rgba(139,92,246,0.25)',
      }} />
    </div>
  )
}

function FilingCabinet() {
  return (
    <div className="absolute" style={{ left: '50%', top: '50%', transform: 'translate(-50%, -50%)', transformStyle: 'preserve-3d' }}>
      {/* Cabinet stack */}
      <div className="flex gap-3 items-end">
        {[56, 64, 50].map((h, i) => (
          <div key={i} style={{
            width: 40, height: h, borderRadius: 4,
            background: 'linear-gradient(135deg, #162018 0%, #0e1810 100%)',
            border: '1px solid rgba(16,185,129,0.22)',
            transform: 'translateZ(20px)',
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5, padding: '0 6px',
          }}>
            {Array.from({ length: Math.floor(h / 14) }).map((_, j) => (
              <div key={j} style={{ height: 1.5, background: 'rgba(16,185,129,0.30)', borderRadius: 1 }} />
            ))}
          </div>
        ))}
      </div>
      {/* Outbox tray */}
      <div className="mt-2 mx-auto" style={{
        width: 60, height: 10, borderRadius: 3,
        background: 'linear-gradient(135deg, #142018 0%, #0c1610 100%)',
        border: '1px solid rgba(16,185,129,0.20)',
        transform: 'translateZ(24px)',
      }} />
    </div>
  )
}

function ServerRacks() {
  return (
    <div className="absolute inset-0 flex items-center justify-center gap-5" style={{ transformStyle: 'preserve-3d' }}>
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} style={{
          width: 30, height: 64, borderRadius: 4,
          background: 'linear-gradient(180deg, #0c1418 0%, #080e12 100%)',
          border: '1px solid rgba(6,182,212,0.18)',
          transform: 'translateZ(20px)',
          display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 4px',
        }}>
          {[0, 1, 2, 3].map(j => (
            <div key={j} className="flex items-center gap-[3px]">
              <div
                className={j === 0 && i < 3 ? 'animate-pulse' : ''}
                style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: j === 0 ? (i < 3 ? '#06b6d4' : '#6b7280') : 'rgba(6,182,212,0.20)',
                  boxShadow: j === 0 && i < 3 ? '0 0 6px rgba(6,182,212,0.6)' : 'none',
                }}
              />
              <div style={{ flex: 1, height: 1.5, background: 'rgba(6,182,212,0.12)', borderRadius: 1 }} />
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

export function OfficeZone({ type, style, children, count }) {
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
        boxShadow: `0 0 40px ${config.glow}, inset 0 1px 0 rgba(255,255,255,0.03)`,
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Zone label */}
      <div
        className="absolute"
        style={{
          top: 12, left: 16,
          transform: 'rotateZ(45deg) rotateX(-55deg) translateZ(4px)',
          transformStyle: 'preserve-3d',
        }}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
          color: config.border.replace(/[\d.]+\)$/, '0.7)'),
          fontFamily: '"JetBrains Mono", "SF Mono", "Fira Code", monospace',
          textTransform: 'uppercase',
        }}>
          {config.label}{count > 0 && ` (${count})`}
        </span>
      </div>

      {/* Zone furniture */}
      {Furniture && <Furniture />}

      {/* Children (agent desks placed here) */}
      {children}
    </div>
  )
}
