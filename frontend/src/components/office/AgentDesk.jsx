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
        bottom: 6, right: 8,
        transform: 'translateZ(18px)',
        transformStyle: 'preserve-3d',
      }}
    >
      {/* Shadow */}
      <div className="absolute" style={{
        bottom: -4, width: 22, height: 6, borderRadius: '50%',
        background: 'rgba(0,0,0,0.4)', filter: 'blur(2px)',
      }} />

      {/* Body */}
      <div style={{
        width: 18, height: 12, borderRadius: '2px 2px 4px 4px',
        background: `linear-gradient(180deg, ${darkColor} 0%, ${color}99 100%)`,
        marginTop: -2,
      }} />

      {/* Head */}
      <div
        className={isWorking ? 'animate-subtle-bob' : ''}
        style={{
          width: 20, height: 20, borderRadius: 5,
          background: `linear-gradient(135deg, ${lighterColor} 0%, ${color} 100%)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', marginBottom: -2,
          boxShadow: isWorking
            ? `0 0 12px ${color}60, 0 2px 8px rgba(0,0,0,0.3)`
            : '0 2px 6px rgba(0,0,0,0.3)',
          order: -1,
        }}
      >
        {/* Eyes */}
        <div className="flex gap-[3px]" style={{ marginTop: 1 }}>
          <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.9)' }} />
          <div style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.9)' }} />
        </div>

        {/* Initial fallback on top */}
        <span className="absolute text-[7px] font-bold text-white/0 select-none">{name[0]}</span>
      </div>

      {/* Status halo */}
      {isWorking && (
        <div className="absolute animate-ping-slow" style={{
          top: -4, left: '50%', transform: 'translateX(-50%)',
          width: 28, height: 28, borderRadius: '50%',
          border: `1px solid ${color}40`,
        }} />
      )}

      {/* Error indicator */}
      {isError && (
        <div className="absolute" style={{
          top: -8, left: '50%', transform: 'translateX(-50%)',
          fontSize: 10, lineHeight: 1,
        }}>
          <span style={{ color: '#ef4444', textShadow: '0 0 6px rgba(239,68,68,0.5)' }}>!</span>
        </div>
      )}
    </div>
  )
}

function DeskMonitors({ count, wide, color, isWorking }) {
  const w = wide ? 40 : count === 1 ? 32 : 22
  return (
    <div className="flex gap-[3px] justify-center" style={{ paddingTop: 6 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{
          width: w, height: wide ? 18 : 22, borderRadius: 2,
          background: isWorking ? '#060c18' : '#08080e',
          border: `1px solid ${isWorking ? color + '30' : 'rgba(255,255,255,0.04)'}`,
          boxShadow: isWorking ? `0 0 6px ${color}12` : 'none',
          transition: 'all 0.4s ease',
          overflow: 'hidden',
        }}>
          {isWorking && (
            <div className="p-[3px] space-y-[2px]">
              {[70, 45, 80, 30].slice(0, wide ? 2 : 3).map((w2, j) => (
                <div
                  key={j}
                  className="animate-pulse"
                  style={{
                    height: 1, width: `${w2}%`, borderRadius: 1,
                    background: `${color}${50 - j * 10}`,
                    animationDelay: `${j * 0.15}s`,
                  }}
                />
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
      <div className="absolute" style={{ top: 8, left: 8, transform: 'translateZ(22px)' }}>
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          border: `1px solid ${color}30`,
          background: `radial-gradient(circle at 30% 30%, ${color}15, transparent)`,
        }} />
      </div>
    )
  }
  if (type === 'books') {
    return (
      <div className="absolute flex gap-[1px]" style={{ bottom: 10, left: 8, transform: 'translateZ(22px)' }}>
        {[10, 12, 8].map((h, i) => (
          <div key={i} style={{
            width: 3, height: h, borderRadius: 1,
            background: [`${color}40`, `${color}25`, `${color}35`][i],
          }} />
        ))}
      </div>
    )
  }
  if (type === 'gears') {
    return (
      <div className="absolute" style={{ top: 8, left: 8, transform: 'translateZ(22px)' }}>
        <div style={{
          width: 10, height: 10, borderRadius: 2,
          border: `1px solid ${color}25`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: `${color}30` }} />
        </div>
      </div>
    )
  }
  if (type === 'antenna') {
    return (
      <div className="absolute" style={{ top: 4, right: 8, transform: 'translateZ(26px)' }}>
        <div style={{ width: 1, height: 14, background: `${color}30`, margin: '0 auto' }} />
        <div className="animate-pulse" style={{
          width: 6, height: 6, borderRadius: '50%',
          background: `${color}20`, border: `1px solid ${color}30`,
          marginTop: -1, marginLeft: -2.5,
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
        className="relative transition-all duration-300 group-hover:scale-[1.03]"
        style={{
          width: 140, height: 90,
          transformStyle: 'preserve-3d',
          filter: dimmed ? 'grayscale(0.8)' : 'none',
        }}
      >
        {/* Desk top */}
        <div style={{
          width: 140, height: 90, position: 'relative',
          background: `linear-gradient(135deg, #1c1c28 0%, #14141e 100%)`,
          borderRadius: 5,
          border: `1px solid ${isSelected ? color + '60' : isWorking ? color + '30' : 'rgba(255,255,255,0.04)'}`,
          boxShadow: isWorking
            ? `0 0 24px ${color}15, 0 8px 24px rgba(0,0,0,0.4)`
            : isSelected
              ? `0 0 20px ${color}10, 0 8px 24px rgba(0,0,0,0.4)`
              : '0 8px 20px rgba(0,0,0,0.3)',
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
              top: 6, right: 6, transform: 'translateZ(4px)',
              width: 14, height: 14, borderRadius: 3,
              background: `${color}15`,
              border: `1px solid ${color}20`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <RoleIcon size={8} style={{ color: `${color}80` }} />
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
              position: 'absolute', top: 6, left: 6,
              width: 5, height: 5, borderRadius: '50%',
              background: isError ? '#ef4444' : isWorking ? '#10b981' : '#4b5563',
              boxShadow: isWorking ? '0 0 6px #10b98180' : isError ? '0 0 6px #ef444480' : 'none',
              transition: 'all 0.3s ease',
            }}
          />
        </div>

        {/* Desk legs */}
        <div style={{
          position: 'absolute', bottom: -12, left: 8,
          width: 124, height: 12,
          background: 'linear-gradient(to bottom, #101016 0%, #08080c 100%)',
          borderRadius: '0 0 3px 3px',
          transform: 'translateZ(14px)',
        }} />
      </div>

      {/* Name + status label */}
      <div
        className="mt-2 text-center"
        style={{
          transform: 'rotateZ(45deg) rotateX(-55deg) translateZ(28px)',
          transformStyle: 'preserve-3d',
        }}
      >
        <p className="text-[10px] font-semibold text-white/80 tracking-wide"
          style={{ fontFamily: '"JetBrains Mono", "SF Mono", monospace' }}>
          {agent.name}
        </p>
        <p className="text-[8px] mt-0.5" style={{
          color: isWorking ? '#10b981' : isError ? '#ef4444' : 'rgba(255,255,255,0.3)',
        }}>
          {isWorking ? 'WORKING' : isError ? 'ERROR' : 'ONLINE'}
        </p>
        {isWorking && agent.current_task && (
          <p className="text-[7px] text-white/20 mt-0.5 max-w-[100px] truncate mx-auto">
            {agent.current_task}
          </p>
        )}
      </div>
    </div>
  )
}
