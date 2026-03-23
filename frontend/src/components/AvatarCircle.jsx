const gradients = {
  scout: 'from-[#2d5a9e] to-[#1e3f6e]',
  quill: 'from-[#9e5520] to-[#6e3b15]',
  forge: 'from-[#5e3f9e] to-[#3e2a6e]',
  radar: 'from-[#156e80] to-[#0e4f5e]',
  default: 'from-[#4b5563] to-[#3a4250]',
}

export function AvatarCircle({ name, agent, size = 28 }) {
  const initial = (name || agent || 'A').charAt(0).toUpperCase()

  // Determine gradient based on agent name
  let gradientKey = 'default'
  if (agent) {
    const lowerAgent = agent.toLowerCase()
    if (lowerAgent.includes('scout')) gradientKey = 'scout'
    else if (lowerAgent.includes('quill')) gradientKey = 'quill'
    else if (lowerAgent.includes('forge')) gradientKey = 'forge'
    else if (lowerAgent.includes('radar')) gradientKey = 'radar'
  }

  const gradient = gradients[gradientKey]

  return (
    <div
      className={`flex-shrink-0 flex items-center justify-center rounded-full font-bold text-white bg-gradient-to-br ${gradient}`}
      style={{ width: `${size}px`, height: `${size}px`, minWidth: `${size}px` }}
    >
      <span style={{ fontSize: `${size * 0.4}px` }}>{initial}</span>
    </div>
  )
}
