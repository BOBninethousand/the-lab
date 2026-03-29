import { useState, useEffect } from 'react'
import { TrendingUp, Zap, Activity, BarChart3 } from 'lucide-react'
import { getCostSummary, getCostScorecard, getCostToday } from '../lib/api'
import { EmptyState } from '../components/EmptyState'

function MiniBar({ value, max, color = 'bg-lab-accent' }) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="w-full h-1.5 bg-white/[0.05] rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all duration-500 ${color}`}
        style={{ width: `${width}%` }}
      />
    </div>
  )
}

export function Costs() {
  const [summary, setSummary] = useState(null)
  const [scorecard, setScorecard] = useState(null)
  const [today, setToday] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [period, setPeriod] = useState(30)

  useEffect(() => {
    loadData()
  }, [period])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [summaryData, scorecardData, todayData] = await Promise.all([
        getCostSummary(period).catch(() => null),
        getCostScorecard(7).catch(() => null),
        getCostToday().catch(() => null),
      ])
      if (summaryData) setSummary(summaryData)
      if (scorecardData) setScorecard(scorecardData)
      if (todayData) setToday(todayData)
    } catch (err) {
      console.error('Failed to load usage data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 bg-lab-surface rounded animate-pulse" />
          ))}
        </div>
        <div className="h-48 bg-lab-surface rounded animate-pulse" />
      </div>
    )
  }

  // Count today's calls from daily_spend
  const todayCalls = summary?.daily_spend?.length > 0
    ? summary.daily_spend[summary.daily_spend.length - 1]?.calls || 0
    : 0

  return (
    <div className="space-y-8">
      {/* Top stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-lab-text-muted" />
            <span className="text-xs text-lab-text-muted">Today</span>
          </div>
          <div className="text-stat text-xl">
            {summary?.total_calls || 0}
          </div>
          <div className="text-xs text-lab-text-faint mt-2">
            API calls in {period}d period
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-lab-text-muted" />
            <span className="text-xs text-lab-text-muted">{period}d Total</span>
          </div>
          <div className="text-stat text-xl">
            {(summary?.total_calls || 0).toLocaleString()}
          </div>
          <div className="text-xs text-lab-text-faint mt-2">
            {((summary?.total_input_tokens || 0) + (summary?.total_output_tokens || 0)).toLocaleString()} tokens
          </div>
        </div>

        <div className="card">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={14} className="text-lab-text-muted" />
            <span className="text-xs text-lab-text-muted">Tokens Used</span>
          </div>
          <div className="text-stat text-xl">
            {((summary?.total_input_tokens || 0) + (summary?.total_output_tokens || 0)).toLocaleString()}
          </div>
          <div className="text-xs text-lab-text-faint mt-2">
            {(summary?.total_input_tokens || 0).toLocaleString()} in / {(summary?.total_output_tokens || 0).toLocaleString()} out
          </div>
        </div>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2">
        {[7, 14, 30].map(d => (
          <button
            key={d}
            onClick={() => setPeriod(d)}
            className={`px-3 py-1.5 text-xs rounded-md transition-subtle ${
              period === d
                ? 'bg-lab-accent text-white'
                : 'text-lab-text-muted hover:bg-white/[0.03] border border-lab-border'
            }`}
          >
            {d}d
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Usage by Agent */}
        <div>
          <h2 className="text-section-label mb-4">Usage by Agent</h2>
          <div className="space-y-3">
            {(summary?.by_agent || []).length === 0 ? (
              <EmptyState icon={BarChart3} title="No usage data yet" description="Usage data will appear as agents run tasks" />
            ) : (
              summary.by_agent.map(agent => (
                <div key={agent.name} className="border border-lab-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-lab-text-primary">{agent.name}</span>
                    <span className="text-sm font-medium text-lab-text-primary">{agent.calls} calls</span>
                  </div>
                  <MiniBar
                    value={agent.calls}
                    max={summary.by_agent[0]?.calls || 1}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-lab-text-muted">{agent.tokens.toLocaleString()} tokens</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Usage by Provider */}
        <div>
          <h2 className="text-section-label mb-4">Usage by Provider</h2>
          <div className="space-y-3">
            {(summary?.by_provider || []).length === 0 ? (
              <EmptyState icon={BarChart3} title="No usage data yet" description="Usage data will appear as agents run tasks" />
            ) : (
              summary.by_provider.map(prov => (
                <div key={prov.provider} className="border border-lab-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-lab-text-primary capitalize">{prov.provider}</span>
                    <span className="text-sm font-medium text-lab-text-primary">{prov.calls} calls</span>
                  </div>
                  <MiniBar
                    value={prov.calls}
                    max={summary.by_provider[0]?.calls || 1}
                    color={prov.provider === 'ollama' ? 'bg-lab-success' : 'bg-lab-accent'}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-lab-text-muted">
                      {prov.source_api} API / {prov.source_oauth} OAuth
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Agent Scorecard */}
      <div>
        <h2 className="text-section-label mb-4">Agent Scorecard (7 Days)</h2>
        <div className="border border-lab-border rounded-lg overflow-hidden">
          {/* Header */}
          <div className="grid grid-cols-10 gap-4 px-4 py-3 border-b border-lab-border text-xs font-semibold uppercase tracking-wider text-lab-text-muted">
            <div className="col-span-3">Agent</div>
            <div className="col-span-2 text-right">API Calls</div>
            <div className="col-span-2 text-right">Tasks Done</div>
            <div className="col-span-3">Activity</div>
          </div>

          {(scorecard?.agents || []).length === 0 ? (
            <EmptyState icon={BarChart3} title="No usage data yet" description="Usage data will appear as agents run tasks" />
          ) : (
            scorecard.agents.map(agent => (
              <div
                key={agent.name}
                className="grid grid-cols-10 gap-4 px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-subtle last:border-0"
              >
                <div className="col-span-3 text-sm font-medium text-lab-text-primary">
                  {agent.name}
                </div>
                <div className="col-span-2 text-sm text-lab-text-secondary text-right">
                  {agent.calls}
                </div>
                <div className="col-span-2 text-sm text-lab-text-secondary text-right">
                  {agent.tasks_completed}
                </div>
                <div className="col-span-3">
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(agent.task_breakdown || {}).map(([type, count]) => (
                      <span
                        key={type}
                        className="inline-block px-1.5 py-0.5 bg-lab-elevated text-xs text-lab-text-muted rounded"
                      >
                        {type}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}

          {scorecard && (
            <div className="grid grid-cols-10 gap-4 px-4 py-3 bg-lab-surface text-xs font-medium">
              <div className="col-span-3 text-lab-text-muted">Total</div>
              <div className="col-span-2 text-lab-text-secondary text-right">{scorecard.total_calls}</div>
              <div className="col-span-2 text-lab-text-secondary text-right">
                {scorecard.agents.reduce((s, a) => s + a.tasks_completed, 0)}
              </div>
              <div className="col-span-3" />
            </div>
          )}
        </div>
      </div>

      {/* Daily Activity Chart */}
      {summary?.daily_spend?.length > 0 && (
        <div>
          <h2 className="text-section-label mb-4">Daily Activity</h2>
          <div className="border border-lab-border rounded-lg p-4">
            <div className="flex items-end gap-1 h-32">
              {summary.daily_spend.map(day => {
                const maxCalls = Math.max(...summary.daily_spend.map(d => d.calls || 1), 1)
                const height = Math.max(4, ((day.calls || 0) / maxCalls) * 100)
                return (
                  <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                      className="w-full bg-lab-accent/60 hover:bg-lab-accent rounded-t transition-subtle"
                      style={{ height: `${height}%` }}
                    />
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-subtle bg-lab-elevated border border-lab-border rounded px-2 py-1 text-xs text-lab-text-secondary whitespace-nowrap z-10">
                      {day.date}: {day.calls || 0} calls
                    </div>
                  </div>
                )
              })}
            </div>
            <div className="flex justify-between mt-2 text-xs text-lab-text-faint">
              <span>{summary.daily_spend[0]?.date}</span>
              <span>{summary.daily_spend[summary.daily_spend.length - 1]?.date}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
