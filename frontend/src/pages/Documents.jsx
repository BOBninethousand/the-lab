import { useState, useEffect, useCallback } from 'react'
import { Search, Star, FileText, Copy, Trash2, X, ChevronDown, Circle, ExternalLink, Upload } from 'lucide-react'
import { getReports, getReportStats, updateReport, deleteReport, publishReportToNotion, getNotionStatus, getAgents } from '../lib/api'
import { formatDistanceToNow, parseUTC } from '../lib/time'
import { AvatarCircle } from '../components/AvatarCircle'
import { useWebSocket } from '../hooks/useWebSocket'
import { useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'


const REPORT_TYPES = [
  { value: null, label: 'All Reports' },
  { value: 'briefing', label: 'Briefings' },
  { value: 'content', label: 'Content Pieces' },
  { value: 'tech_report', label: 'Tech Reports' },
  { value: 'outreach', label: 'Outreach Packages' },
  { value: 'weekly_review', label: 'Weekly Reviews' },
  { value: 'content_calendar', label: 'Content Calendar' },
]

const TYPE_LABELS = {
  briefing: 'Briefing',
  content: 'Content',
  tech_report: 'Tech Report',
  outreach: 'Outreach',
  weekly_review: 'Weekly Review',
  content_calendar: 'Calendar',
}

function formatFullDate(date) {
  return parseUTC(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

export function Documents() {
  const [reports, setReports] = useState([])
  const [stats, setStats] = useState({ total: 0, unread: 0, today: 0, by_agent: {}, by_type: {} })
  const [isLoading, setIsLoading] = useState(true)
  const [selectedReport, setSelectedReport] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [agentFilter, setAgentFilter] = useState(null)
  const [typeFilter, setTypeFilter] = useState(null)
  const [starredFilter, setStarredFilter] = useState(false)
  const [unreadFilter, setUnreadFilter] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [toast, setToast] = useState(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [mobileViewerOpen, setMobileViewerOpen] = useState(false)
  const [notionStatus, setNotionStatus] = useState(null)
  const [publishing, setPublishing] = useState(null)
  const [allAgents, setAllAgents] = useState([])
  const { events } = useWebSocket()
  const [searchParams] = useSearchParams()

  const LIMIT = 50

  useEffect(() => {
    getAgents()
      .then(data => setAllAgents(Array.isArray(data) ? data : data.agents || []))
      .catch(() => {})
  }, [])

  const agentColor = (name) => {
    const agent = allAgents.find(a => a.name === name)
    if (agent?.color) return agent.color
    let hash = 0
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
    return `hsl(${Math.abs(hash) % 360}, 60%, 50%)`
  }

  const loadReports = useCallback(async (reset = true) => {
    if (reset) setIsLoading(true)
    try {
      const params = { limit: LIMIT, offset: reset ? 0 : offset }
      if (agentFilter) params.agent_name = agentFilter
      if (typeFilter) params.report_type = typeFilter
      if (starredFilter) params.starred = true
      if (searchQuery) params.search = searchQuery

      const [data, statsData] = await Promise.all([
        getReports(params).catch(() => []),
        getReportStats().catch(() => stats),
      ])

      const reportList = Array.isArray(data) ? data : []
      if (reset) {
        setReports(reportList)
        setOffset(LIMIT)
      } else {
        setReports(prev => [...prev, ...reportList])
        setOffset(prev => prev + LIMIT)
      }
      setHasMore(reportList.length === LIMIT)
      setStats(statsData)
    } catch (err) {
      console.error('Failed to load reports:', err)
    } finally {
      setIsLoading(false)
    }
  }, [agentFilter, typeFilter, starredFilter, searchQuery, offset, stats])

  useEffect(() => {
    loadReports(true)
    getNotionStatus().then(s => setNotionStatus(s)).catch(() => {})
  }, [agentFilter, typeFilter, starredFilter, searchQuery])

  const handlePublish = async (reportId) => {
    setPublishing(reportId)
    try {
      const result = await publishReportToNotion(reportId)
      if (result.notion_page_url) {
        setReports(prev => prev.map(r =>
          r.id === reportId ? { ...r, notion_page_url: result.notion_page_url } : r
        ))
        if (selectedReport?.id === reportId) {
          setSelectedReport(prev => ({ ...prev, notion_page_url: result.notion_page_url }))
        }
        setToast('Published to Notion')
        setTimeout(() => setToast(null), 3000)
      }
    } catch (err) {
      setToast('Failed to publish')
      setTimeout(() => setToast(null), 3000)
    } finally { setPublishing(null) }
  }

  // Open report from URL param (e.g. navigated from Dashboard)
  // Also support ?agent=Scout to pre-filter by agent (e.g. from Strategy page)
  useEffect(() => {
    const reportId = searchParams.get('report')
    if (reportId && reports.length > 0) {
      const found = reports.find(r => r.id === reportId)
      if (found) handleSelectReport(found)
    }
    const agentParam = searchParams.get('agent')
    if (agentParam && !agentFilter) {
      setAgentFilter(agentParam)
    }
  }, [searchParams, reports])

  // WebSocket: listen for new reports
  useEffect(() => {
    if (events.length > 0) {
      const latest = events[0]
      if (latest.type === 'report_created' && latest.data) {
        setReports(prev => {
          if (prev.some(r => r.id === latest.data.id)) return prev
          return [latest.data, ...prev]
        })
        setStats(prev => ({
          ...prev,
          total: prev.total + 1,
          unread: prev.unread + 1,
          today: prev.today + 1,
        }))
        setToast(`New report from ${latest.data.agent_name}`)
        setTimeout(() => setToast(null), 4000)
      }
      if (latest.type === 'report_updated') {
        loadReports()
      }
      if (latest.type === 'notion_publish_failed' && latest.data) {
        setToast(`Notion publish failed: ${latest.data.agent_name} — ${latest.data.error?.slice(0, 80)}`)
        setTimeout(() => setToast(null), 6000)
      }
    }
  }, [events])

  const handleSelectReport = async (report) => {
    setSelectedReport(report)
    setMobileViewerOpen(true)
    if (!report.read) {
      try {
        await updateReport(report.id, { read: true })
        setReports(prev => prev.map(r => r.id === report.id ? { ...r, read: true } : r))
        setStats(prev => ({ ...prev, unread: Math.max(0, prev.unread - 1) }))
      } catch {}
    }
  }

  const handleStar = async (e, report) => {
    e.stopPropagation()
    const newStarred = !report.starred
    try {
      await updateReport(report.id, { starred: newStarred })
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, starred: newStarred } : r))
      if (selectedReport?.id === report.id) {
        setSelectedReport(prev => ({ ...prev, starred: newStarred }))
      }
    } catch {}
  }

  const handleDelete = async () => {
    if (!selectedReport) return
    try {
      await deleteReport(selectedReport.id)
      setReports(prev => prev.filter(r => r.id !== selectedReport.id))
      setStats(prev => ({ ...prev, total: prev.total - 1 }))
      setSelectedReport(null)
      setMobileViewerOpen(false)
      setDeleteConfirm(false)
    } catch {}
  }

  const handleCopy = async () => {
    if (!selectedReport) return
    try {
      await navigator.clipboard.writeText(selectedReport.content)
      setToast('Copied to clipboard')
      setTimeout(() => setToast(null), 2000)
    } catch {}
  }


  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-lab-elevated border border-lab-border-hover rounded-md px-4 py-2 text-xs text-lab-text-primary shadow-lg animate-pulse-subtle">
          {toast}
        </div>
      )}

      {/* Left Panel — Filters */}
      <div className="hidden lg:flex flex-col w-60 flex-shrink-0 border-r border-lab-border bg-lab-bg overflow-y-auto">
        <div className="p-4 space-y-5">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-lab-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reports..."
              className="w-full bg-lab-surface border border-lab-border rounded-md pl-8 pr-3 py-1.5 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
            />
          </div>

          {/* Agent Filter */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-lab-text-muted mb-2">Agents</div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setAgentFilter(null)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-subtle ${
                  !agentFilter ? 'text-white' : 'text-lab-text-secondary hover:bg-white/[0.03]'
                }`}
                style={!agentFilter ? { backgroundColor: 'rgba(255,255,255,0.1)' } : {}}
              >
                All
              </button>
              {allAgents.map(agent => {
                const filterNames = agentFilter ? agentFilter.split(',').map(n => n.trim()) : []
                const isActive = agentFilter === agent.name || filterNames.includes(agent.name)
                return (
                  <button
                    key={agent.id}
                    onClick={() => setAgentFilter(agent.name)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-subtle ${
                      isActive ? 'text-white bg-lab-accent/80' : 'text-lab-text-secondary hover:bg-white/[0.03]'
                    }`}
                  >
                    <AvatarCircle name={agent.name} agent={agent.name} size={14} />
                    {agent.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Type Filter */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-lab-text-muted mb-2">Type</div>
            <div className="space-y-0.5">
              {REPORT_TYPES.map(t => (
                <button
                  key={t.label}
                  onClick={() => setTypeFilter(t.value)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-subtle ${
                    typeFilter === t.value
                      ? 'bg-white/[0.06] text-lab-text-primary font-medium'
                      : 'text-lab-text-secondary hover:bg-white/[0.03]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Filters */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-lab-text-muted mb-2">Quick Filters</div>
            <div className="space-y-0.5">
              <button
                onClick={() => setStarredFilter(!starredFilter)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center gap-2 transition-subtle ${
                  starredFilter ? 'bg-white/[0.06] text-lab-text-primary' : 'text-lab-text-secondary hover:bg-white/[0.03]'
                }`}
              >
                <Star size={12} className={starredFilter ? 'fill-yellow-400 text-yellow-400' : ''} />
                Starred only
              </button>
              <button
                onClick={() => setUnreadFilter(!unreadFilter)}
                className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs flex items-center gap-2 transition-subtle ${
                  unreadFilter ? 'bg-white/[0.06] text-lab-text-primary' : 'text-lab-text-secondary hover:bg-white/[0.03]'
                }`}
              >
                <Circle size={8} className={unreadFilter ? 'fill-blue-400 text-blue-400' : ''} />
                Unread only
              </button>
            </div>
          </div>

          {/* Stats Widget */}
          <div className="border-t border-lab-border pt-4 space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-lab-text-muted mb-2">Stats</div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-lab-text-secondary">Total</span>
              <span className="text-lab-text-primary font-medium">{stats.total}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-lab-text-secondary">Unread</span>
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-500/20 text-blue-400 text-xs font-medium">
                {stats.unread}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-lab-text-secondary">Today</span>
              <span className="text-lab-text-primary font-medium">{stats.today}</span>
            </div>
          </div>

          {/* Notion Publish Health */}
          {notionStatus && (
            <div className="border-t border-lab-border pt-4 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-lab-text-muted mb-2">Notion</div>
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${notionStatus.connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                <span className="text-lab-text-secondary">{notionStatus.connected ? 'Connected' : 'Disconnected'}</span>
              </div>
              {notionStatus.publish_stats && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-lab-text-secondary">Published</span>
                    <span className="text-emerald-400 font-medium">{notionStatus.publish_stats.successes}</span>
                  </div>
                  {notionStatus.publish_stats.failures > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-lab-text-secondary">Failed</span>
                      <span className="text-red-400 font-medium" title={notionStatus.publish_stats.last_error || ''}>
                        {notionStatus.publish_stats.failures}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Centre Panel — Report List */}
      <div className={`flex-1 overflow-y-auto ${selectedReport && !mobileViewerOpen ? 'hidden md:block' : ''} ${selectedReport ? 'md:max-w-[50%] lg:max-w-none lg:flex-1' : ''}`}>
        {/* Mobile search bar */}
        <div className="lg:hidden p-3 border-b border-lab-border">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-lab-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search reports..."
              className="w-full bg-lab-surface border border-lab-border rounded-md pl-8 pr-3 py-1.5 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-lab-surface rounded animate-pulse" />
            ))}
          </div>
        ) : reports.length === 0 ? (
          <EmptyState icon={FileText} title="No reports yet" description="Reports will appear here as agents complete their scheduled tasks" />
        ) : (
          <div>
            {reports.map(report => (
              <button
                key={report.id}
                onClick={() => handleSelectReport(report)}
                className={`w-full text-left border-b border-lab-border hover:bg-white/[0.02] transition-subtle ${
                  selectedReport?.id === report.id ? 'bg-white/[0.03]' : ''
                }`}
              >
                <div className="flex" style={{ borderLeft: `4px solid ${agentColor(report.agent_name)}` }}>
                  <div className="flex-1 px-4 py-3 min-w-0">
                    <div className="flex items-start gap-3">
                      {/* Unread dot */}
                      <div className="flex-shrink-0 w-2 pt-2">
                        {!report.read && (
                          <div className="w-2 h-2 rounded-full bg-blue-400" />
                        )}
                      </div>
                      <AvatarCircle name={report.agent_name} agent={report.agent_name} size={28} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className={`text-sm truncate ${!report.read ? 'font-semibold text-lab-text-primary' : 'font-medium text-lab-text-secondary'}`}>
                            {report.title}
                          </span>
                          <span className="flex-shrink-0 inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-lab-text-muted">
                            {TYPE_LABELS[report.report_type] || report.report_type}
                          </span>
                          {report.notion_page_url && (
                            <a href={report.notion_page_url} target="_blank" rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-subtle">
                              <ExternalLink size={8} /> Notion
                            </a>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-lab-text-muted">{report.agent_name}</span>
                          <span className="text-lab-text-faint text-[10px]">&middot;</span>
                          <span className="text-[11px] text-lab-text-muted">{formatDistanceToNow(report.created_at)}</span>
                        </div>
                        <p className="text-xs text-lab-text-muted mt-1 truncate">
                          {report.content?.replace(/[#*_\n]/g, ' ').slice(0, 120)}
                        </p>
                      </div>
                      {/* Star */}
                      <button
                        onClick={(e) => handleStar(e, report)}
                        className="flex-shrink-0 p-1 hover:bg-white/[0.05] rounded transition-subtle"
                      >
                        <Star
                          size={14}
                          className={report.starred ? 'fill-yellow-400 text-yellow-400' : 'text-lab-text-faint'}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </button>
            ))}

            {hasMore && (
              <button
                onClick={() => loadReports(false)}
                className="w-full py-3 text-xs text-lab-text-muted hover:text-lab-text-secondary hover:bg-white/[0.02] transition-subtle flex items-center justify-center gap-1"
              >
                <ChevronDown size={14} />
                Load more
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right Panel — Report Viewer */}
      {selectedReport && (
        <div className={`${mobileViewerOpen ? 'fixed inset-0 z-40 bg-lab-bg' : 'hidden'} md:relative md:flex md:flex-col md:w-1/2 md:block border-l border-lab-border overflow-y-auto`}>
          {/* Header */}
          <div className="sticky top-0 bg-lab-bg/95 backdrop-blur-sm border-b border-lab-border z-10">
            <div className="px-5 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <AvatarCircle name={selectedReport.agent_name} agent={selectedReport.agent_name} size={36} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-lab-text-primary">{selectedReport.agent_name}</span>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.06] text-lab-text-muted">
                        {TYPE_LABELS[selectedReport.report_type] || selectedReport.report_type}
                      </span>
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-white/[0.04] text-lab-text-faint capitalize">
                        {selectedReport.source}
                      </span>
                    </div>
                    <div className="text-[11px] text-lab-text-muted mt-0.5">
                      {formatFullDate(selectedReport.created_at)}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { setSelectedReport(null); setMobileViewerOpen(false) }}
                  className="p-1 hover:bg-white/[0.05] rounded transition-subtle flex-shrink-0"
                >
                  <X size={16} className="text-lab-text-muted" />
                </button>
              </div>

              {/* Action bar */}
              <div className="flex items-center gap-1 mt-3">
                <button
                  onClick={(e) => handleStar(e, selectedReport)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
                >
                  <Star size={12} className={selectedReport.starred ? 'fill-yellow-400 text-yellow-400' : ''} />
                  {selectedReport.starred ? 'Starred' : 'Star'}
                </button>
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
                >
                  <Copy size={12} />
                  Copy
                </button>
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-lab-error/80 hover:bg-lab-error/10 transition-subtle"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
                <div className="flex-1" />
                {selectedReport.notion_page_url ? (
                  <a href={selectedReport.notion_page_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-subtle">
                    <ExternalLink size={12} /> View in Notion
                  </a>
                ) : notionStatus?.connected ? (
                  <button
                    onClick={() => handlePublish(selectedReport.id)}
                    disabled={publishing === selectedReport.id}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs text-lab-accent bg-lab-accent/10 hover:bg-lab-accent/20 transition-subtle disabled:opacity-50"
                  >
                    <Upload size={12} />
                    {publishing === selectedReport.id ? 'Publishing...' : 'Publish to Notion'}
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-5 py-5">
            <h1 className="text-lg font-bold text-lab-text-primary mb-4">{selectedReport.title}</h1>
            <div className="prose prose-invert prose-sm max-w-none
              prose-headings:text-lab-text-primary prose-headings:font-semibold
              prose-p:text-lab-text-secondary prose-p:leading-relaxed
              prose-strong:text-lab-text-primary
              prose-a:text-lab-accent prose-a:no-underline hover:prose-a:underline
              prose-code:text-lab-text-secondary prose-code:bg-lab-elevated prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
              prose-pre:bg-lab-elevated prose-pre:border prose-pre:border-lab-border prose-pre:rounded-md
              prose-li:text-lab-text-secondary
              prose-table:border-collapse prose-th:border prose-th:border-lab-border prose-th:px-3 prose-th:py-1.5 prose-th:text-lab-text-primary prose-th:bg-lab-surface
              prose-td:border prose-td:border-lab-border prose-td:px-3 prose-td:py-1.5 prose-td:text-lab-text-secondary
              prose-blockquote:border-lab-border prose-blockquote:text-lab-text-muted
              prose-hr:border-lab-border
            ">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {selectedReport.content}
              </ReactMarkdown>
            </div>
          </div>

          {/* Delete Confirmation Modal */}
          {deleteConfirm && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
              <div className="card-elevated w-80">
                <p className="text-sm text-lab-text-primary mb-4">Delete this report?</p>
                <p className="text-xs text-lab-text-muted mb-4">This action cannot be undone.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="flex-1 px-3 py-2 border border-lab-border rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    className="flex-1 px-3 py-2 bg-lab-error text-white rounded-md text-xs font-medium hover:bg-lab-error/90 transition-subtle"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
