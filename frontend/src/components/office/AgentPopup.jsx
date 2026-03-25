import { useState, useEffect } from 'react'
import { X, MessageSquare, FileText } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { getReportStats, getReports } from '../../lib/api'

const AGENT_EMOJIS = { Scout: '\uD83D\uDD0D', Quill: '\u270F\uFE0F', Forge: '\uD83D\uDD28', Radar: '\uD83D\uDCE1' }

const ZONE_LABELS = {
  work: 'Work Area',
  meeting: 'Meeting Room',
  boss: 'Boss Office',
  notion: 'Notion Outbox',
  server: 'Server Room',
}

export function AgentPopup({ agent, color, zone, onClose }) {
  const navigate = useNavigate()
  const [reportCount, setReportCount] = useState(null)
  const [lastReport, setLastReport] = useState(null)

  useEffect(() => {
    if (!agent) return
    let cancelled = false

    Promise.all([
      getReportStats().catch(() => ({ by_agent: {} })),
      getReports({ agent_name: agent.name, limit: 1 }).catch(() => []),
    ]).then(([stats, reports]) => {
      if (cancelled) return
      setReportCount(stats.by_agent?.[agent.name] || 0)
      if (Array.isArray(reports) && reports.length > 0) setLastReport(reports[0])
    })

    return () => { cancelled = true }
  }, [agent?.id])

  if (!agent) return null

  const isWorking = agent.status === 'working'
  const isError = agent.status === 'error'

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[380px] animate-slide-up">
      <div style={{
        background: 'linear-gradient(135deg, rgba(18,18,26,0.97) 0%, rgba(12,12,18,0.98) 100%)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${color}25`,
        borderRadius: 14,
        boxShadow: `0 0 40px rgba(0,0,0,0.6), 0 0 20px ${color}08`,
        overflow: 'hidden',
      }}>
        {/* Top accent line */}
        <div style={{ height: 2, background: `linear-gradient(90deg, transparent, ${color}60, transparent)` }} />

        <div className="p-4">
          {/* Header */}
          <div className="flex items-center gap-3 mb-3">
            <div style={{
              width: 40, height: 40, borderRadius: 10,
              background: `linear-gradient(135deg, ${color}ee, ${color}aa)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, boxShadow: `0 4px 12px ${color}30`,
            }}>
              {AGENT_EMOJIS[agent.name] || agent.name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white tracking-wide"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                {agent.name}
              </p>
              <p className="text-[10px] text-white/40 truncate">{agent.role}</p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-colors"
            >
              <X size={14} className="text-white/30" />
            </button>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <InfoCell
              label="Status"
              value={agent.status || 'idle'}
              valueColor={isWorking ? '#10b981' : isError ? '#ef4444' : 'rgba(255,255,255,0.6)'}
            />
            <InfoCell label="Provider" value={agent.provider} />
            <InfoCell label="Model" value={agent.model_name?.split('/').pop() || '—'} />
            <InfoCell
              label="Zone"
              value={ZONE_LABELS[zone] || 'Work Area'}
              valueColor={color + 'cc'}
            />
          </div>

          {/* Reports row */}
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-3"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <FileText size={12} className="text-white/25 shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] text-white/40">
                {reportCount !== null ? `${reportCount} reports` : 'Loading...'}
              </span>
              {lastReport && (
                <p className="text-[10px] text-white/55 truncate mt-0.5">
                  Latest: {lastReport.title}
                </p>
              )}
            </div>
          </div>

          {/* Current task */}
          {isWorking && agent.current_task && (
            <div className="px-2.5 py-2 rounded-lg mb-3"
              style={{ background: `${color}08`, border: `1px solid ${color}15` }}>
              <p className="text-[9px] text-white/30 uppercase tracking-wider mb-0.5"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}>
                Current Task
              </p>
              <p className="text-[11px] text-white/70">{agent.current_task}</p>
            </div>
          )}

          {/* Chat button */}
          <button
            onClick={() => navigate(`/agents?chat=${agent.id}`)}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: `linear-gradient(135deg, ${color}20, ${color}10)`,
              border: `1px solid ${color}30`,
            }}
          >
            <MessageSquare size={13} style={{ color: color + 'cc' }} />
            <span className="text-[11px] font-medium" style={{ color: color + 'cc' }}>
              Chat with {agent.name}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

function InfoCell({ label, value, valueColor }) {
  return (
    <div className="px-2.5 py-1.5 rounded-lg"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.03)' }}>
      <p className="text-[8px] text-white/30 uppercase tracking-wider mb-0.5"
        style={{ fontFamily: '"JetBrains Mono", monospace' }}>
        {label}
      </p>
      <p className="text-[11px] font-medium truncate"
        style={{ color: valueColor || 'rgba(255,255,255,0.6)' }}>
        {value}
      </p>
    </div>
  )
}
