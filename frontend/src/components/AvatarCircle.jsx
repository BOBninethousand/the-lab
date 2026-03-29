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

const DEFAULT_COLOR = '#6b7280'
const SIZE_ALIASES = { sm: 20, md: 28, lg: 40 }

function resolveColor(agent, name) {
  const str = typeof agent === 'string' ? agent : typeof name === 'string' ? name : ''
  if (AGENT_COLORS[str]) return AGENT_COLORS[str]
  const lower = str.toLowerCase()
  const match = Object.keys(AGENT_COLORS).find(k => lower.includes(k.toLowerCase()))
  return match ? AGENT_COLORS[match] : DEFAULT_COLOR
}

export function AvatarCircle({ name, agent, size = 28 }) {
  const px = typeof size === 'number' ? size : (SIZE_ALIASES[size] || 28)
  const color = resolveColor(agent, name)
  const eye = Math.max(2, px * 0.16)
  const gap = Math.max(1, px * 0.15)

  return (
    <div
      className="flex-shrink-0 flex items-center justify-center"
      style={{
        width: px, height: px, minWidth: px,
        borderRadius: px * 0.25,
        background: `linear-gradient(135deg, ${color}ee 0%, ${color} 100%)`,
        boxShadow: `0 0 ${px * 0.25}px ${color}40`,
      }}
    >
      <div style={{ display: 'flex', gap, marginTop: px * 0.07 }}>
        <div style={{ width: eye, height: eye, borderRadius: '50%', background: 'rgba(255,255,255,0.95)' }} />
        <div style={{ width: eye, height: eye, borderRadius: '50%', background: 'rgba(255,255,255,0.95)' }} />
      </div>
    </div>
  )
}
