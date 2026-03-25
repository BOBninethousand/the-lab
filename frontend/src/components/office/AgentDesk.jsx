import { Search, PenTool, Hammer, Radio } from 'lucide-react'

const ROLE_ICONS = { Scout: Search, Quill: PenTool, Forge: Hammer, Radar: Radio }

const DESK_STYLES = {
  Scout: { monitors: 2, decoration: 'globe' },
  Quill: { monitors: 1, decoration: 'books' },
  Forge: { monitors: 3, decoration: 'gears' },
  Radar: { monitors: 1, decoration: 'antenna', wide: true },
}

function CssCharacter({ color, name, isWorking, isError }) {
  const darkColor = color + 'cc'
  const lighterColor = color + 'ee'

  return (
    <div
      className="absolute flex flex-col items-center"
      style={{
        bottom: 10, right: 10,
        transform: 'translateZ(18px)',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Shadow */}
      <div className="absolute" style={{
        bottom: -5, width: 34, height: 8, borderRadius: '50%',
        background: 'rgba(0,0,0,0.5)', filter: 'blur(3px)',
      }} />

      {/* Body */}
      <div style={{
        width: 28, height: 16, borderRadius: '2px 2px 5px 5px',
        background: `linear-gradient(180deg, ${darkColor} 0%, ${color}99 100%)`,
        marginTop: -3,
      }} />

      {/* Head */}
      <div
        className={isWorking ? 'animate-subtle-bob' : ''}
        style={{
          width: 32, height: 32, borderRadius: 8,
          background: `linear-gradient(135deg, ${lighterColor} 0%, ${color} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', marginBottom: -3,
          boxShadow: isWorking
            ? `0 0 16px ${color}80, 0 2px 8px rgba(0,0,0,0.4)`
            : `0 0 8px ${color}40, 0 2px 6px rgba(0,0,0,0.3)`,
          order: -1,
        }}
      >
        {/* Eyes */}
        <div className="flex gap-[5px]" style={{ marginTop: 2 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.95)' }} />
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.95)' }} />
        </div>
      </div>

      {/* Status halo */}
      {isWorking && (
        <div className="absolute animate-ping-slow" style={{
          top: -6, left: '50%', transform: 'translateX(-50%)',
          width: 44, height: 44, borderRadius: '50%',
          border: `2px solid ${color}50`,
        }} />
      )}

      {/* Error indicator */}
      {isError && (
        <div className="absolute" style={{
          top: -12, left: '50%', transform: 'translateX(-50%)',
          fontSize: 14, lineHeight: 1, fontWeight: 'bold',
        }}>
          <span style={{ color: '#ef4444', textShadow: '0 0 8px rgba(239,68,68,0.6)' }}>!</span>
        </div>
      )}
    </div>
  )
}

function DeskMonitors({ count, wide, color, isWorking }) {
  const w = wide ? 55 : count === 1 ? 44 : 30
  const h = wide ? 24 : 30
  return (
    <div className="flex gap-1 justify-center" style={{ paddingTop: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          width: w, height: h, borderRadius: 3,
          background: isWorking ? '#060c18' : '#0a0a12',
          border: `1px solid ${isWorking ? color + '50' : 'rgba(255,255,255,0.08)'}`,
          boxShadow: isWorking ? `0 0 8px ${color}25` : 'none',
          transition: 'all 0.4s ease',
          overflow: 'hidden',
        }}>
          {isWorking ? (
            <div className="p-1 space-y-[3px]">
              {[70, 45, 80, 55].slice(0, wide ? 3 : 4).map((w2, j) => (
                <div
                  key={j}
                  className="animate-pulse"
                  style={{
                    height: 2, width: `${w2}%`, borderRadius: 1,
                    background: `${color}${70 - j * 12}`,
                    animationDelay: `${j * 0.15}s`,
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="p-1 space-y-[3px]">
              {[60, 40].map((w2, j) => (
                <div key={j} style={{
                  height: 1, width: `${w2}%`, borderRadius: 1,
                  background: 'rgba(255,255,255,0.04)',
                }} />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function DeskDecoration({ type, color }) {
  if (type === 'globe') {
    return (
      <div className="absolute" style={{ top: 10, left: 10, transform: 'translateZ(22px)' }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%',
          border: `1.5px solid ${color}50`,
          background: `radial-gradient(circle at 30% 30%, ${color}25, transparent)`,
        }} />
      </div>
    )
  }
  if (type === 'books') {
    return (
      <div className="absolute flex gap-[2px]" style={{ bottom: 12, left: 10, transform: 'translateZ(22px)' }}>
        {[14, 16, 12].map((h, i) => (
          <div key={i} style={{
            width: 4, height: h, borderRadius: 1,
            background: [`${color}60`, `${color}40`, `${color}50`][i],
          }} />
        ))}
      </div>
    )
  }
  if (type === 'gears') {
    return (
      <div className="absolute" style={{ top: 10, left: 10, transform: 'translateZ(22px)' }}>
        <div style={{
          width: 16, height: 16, borderRadius: 3,
          border: `1.5px solid ${color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: `${color}50` }} />
        </div>
      </div>
    )
  }
  if (type === 'antenna') {
    return (
      <div className="absolute" style={{ top: 6, right: 10, transform: 'translateZ(26px)' }}>
        <div style={{ width: 2, height: 18, background: `${color}50`, margin: '0 auto' }} />
        <div className="animate-pulse" style={{
          width: 10, height: 10, borderRadius: '50%',
          background: `${color}30`, border: `1.5px solid ${color}50`,
          marginTop: -2, marginLeft: -4,
        }} />
      </div>
    )
  }
  return null
}

export function AgentDesk({ agent, color, isSelected, onClick, style, dimmed }) {
  const isWorking = agent.status === 'working'
  const isError = agent.status === 'error'
  const deskStyle = DESK_STYLES[agent.name] || DESK_STYLES.Scout
  const RoleIcon = ROLE_ICONS[agent.name]

  return (
    <div
      className={`absolute cursor-pointer group ${dimmed ? 'opacity-30 pointer-events-none' : ''}`}
      style={{ ...style, transformStyle: 'preserve-3d', transition: 'opacity 0.6s ease' }}
      onClick={onClick}
    >
      {/* Desk surface */}
      <div
        className="relative transition-all duration-300 group-hover:scale-[1.04]"
        style={{
          width: 180, height: 110,
          transformStyle: 'preserve-3d',
          filter: dimmed ? 'grayscale(0.8)' : 'none',
        }}
      >
        {/* Desk top */}
        <div style={{
          width: 180, height: 110, position: 'relative',
          background: `linear-gradient(135deg, #1c1c28 0%, #14141e 100%)`,
          borderRadius: 6,
          border: `1px solid ${isSelected ? color + '70' : isWorking ? color + '60' : 'rgba(255,255,255,0.08)'}`,
          boxShadow: isWorking
            ? `0 0 30px ${color}35, 0 8px 24px rgba(0,0,0,0.5)`
            : isSelected
              ? `0 0 24px ${color}20, 0 8px 24px rgba(0,0,0,0.4)`
              : '0 8px 20px rgba(0,0,0,0.35)',
          transform: 'translateZ(28px)',
          transition: 'all 0.3s ease',
        }}>
          <DeskMonitors
            count={deskStyle.monitors}
            wide={deskStyle.wide}
            color={color}
            isWorking={isWorking}
          />
          <DeskDecoration type={deskStyle.decoration} color={color} />

          {/* Role badge */}
          {RoleIcon && (
            <div className="absolute" style={{
              top: 8, right: 8, transform: 'translateZ(4px)',
              width: 20, height: 20, borderRadius: 4,
              background: `${color}30`,
              border: `1px solid ${color}40`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RoleIcon size={12} style={{ color: `${color}cc` }} />
            </div>
          )}

          {/* Agent character */}
          {!dimmed && (
            <CssCharacter
              color={color}
              name={agent.name}
              isWorking={isWorking}
              isError={isError}
            />
          )}

          {/* Status dot */}
          <div
            className={isWorking ? 'animate-ping-slow' : ''}
            style={{
              position: 'absolute', top: 8, left: 8,
              width: 6, height: 6, borderRadius: '50%',
              background: isError ? '#ef4444' : isWorking ? '#10b981' : '#4b5563',
              boxShadow: isWorking ? '0 0 8px #10b981aa' : isError ? '0 0 8px #ef4444aa' : 'none',
              transition: 'all 0.3s ease',
            }}
          />
        </div>

        {/* Desk legs */}
        <div style={{
          position: 'absolute', bottom: -14, left: 10,
          width: 160, height: 14,
          background: 'linear-gradient(to bottom, #101016 0%, #08080c 100%)',
          borderRadius: '0 0 4px 4px',
          transform: 'translateZ(14px)',
        }} />
      </div>

      {/* Name + status label */}
      <div
        className="mt-2.5 text-center"
        style={{
          transform: 'rotateZ(45deg) rotateX(-55deg) translateZ(28px)',
          transformStyle: 'preserve-3d',
        }}
      >
        <p className="text-[11px] font-semibold text-white/90 tracking-wide"
          style={{ fontFamily: '"JetBrains Mono", "SF Mono", monospace' }}>
          {agent.name}
        </p>
        <p className="text-[9px] mt-0.5 font-medium" style={{
          color: isWorking ? '#10b981' : isError ? '#ef4444' : 'rgba(255,255,255,0.35)',
        }}>
          {isWorking ? 'WORKING' : isError ? 'ERROR' : 'ONLINE'}
        </p>
        {isWorking && agent.current_task && (
          <p className="text-[8px] text-white/30 mt-0.5 max-w-[120px] truncate mx-auto">
            {agent.current_task}
          </p>
        )}
      </div>
    </div>
  )
}
