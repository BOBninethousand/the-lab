import React from 'react'
import { useLocation, Link } from 'react-router-dom'
import {
  LayoutDashboard,
  Target,
  Users,
  Building2,
  CalendarDays,
  Brain,
  FileText,
  BookOpen,
  GitBranch,
  FlaskConical,
  Zap,
  Plug,
  Settings,
  LogOut
} from 'lucide-react'
import { useWebSocket } from '../hooks/useWebSocket'

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { label: 'Master Chat', icon: FlaskConical, path: '/master-chat' },
  { label: 'Strategy', icon: Target, path: '/strategy' },
  { label: 'Agents', icon: Users, path: '/agents' },
  { label: 'Office', icon: Building2, path: '/office' },
  { label: 'Calendar', icon: CalendarDays, path: '/calendar' },
  { label: 'Memory', icon: Brain, path: '/memory' },
  { label: 'Notion', icon: BookOpen, path: '/documents' },
  { label: 'Teams', icon: GitBranch, path: '/teams' },
  { label: 'Usage', icon: Zap, path: '/costs' },
  { label: 'OpenClaw', icon: Plug, path: '/openclaw' },
]

const bottomNavItems = [
  { label: 'Settings', icon: Settings, path: '/settings' },
]

const pageNames = {
  '/': 'Dashboard',
  '/master-chat': 'Master Chat',
  '/strategy': 'Strategy',
  '/agents': 'Agents',
  '/office': 'Office',
  '/calendar': 'Calendar',
  '/memory': 'Memory',
  '/documents': 'Documents',
  '/teams': 'Teams',
  '/costs': 'Usage',
  '/openclaw': 'OpenClaw',
  '/settings': 'Settings',
}

export function Layout({ children }) {
  const location = useLocation()
  const { isConnected, events } = useWebSocket()

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }
  const [toast, setToast] = React.useState(null)

  // Show toast on skill_completed events
  React.useEffect(() => {
    if (events.length > 0) {
      const latest = events[0]
      if (latest.type === 'skill_completed' && latest.data) {
        const { skill, ok, total } = latest.data
        setToast(`Skill "${skill}" completed — ${ok}/${total} steps`)
        setTimeout(() => setToast(null), 5000)
      }
      if (latest.type === 'agent_collaboration' && latest.data) {
        if (latest.data.action === 'started') {
          setToast(`Collaboration started: ${latest.data.agent_names.join(', ')} working on "${latest.data.task}"`)
          setTimeout(() => setToast(null), 5000)
        } else if (latest.data.action === 'completed') {
          setToast(`Collaboration complete: ${latest.data.agent_names.join(', ')} finished`)
          setTimeout(() => setToast(null), 5000)
        }
      }
    }
  }, [events])

  const currentPageName = pageNames[location.pathname] || 'Dashboard'

  return (
    <div className="flex h-screen bg-lab-bg text-lab-text-primary">
      {/* Sidebar */}
      <div className="w-[220px] border-r border-lab-border flex flex-col">
        {/* Branding */}
        <div className="px-4 py-5 border-b border-lab-border flex items-center gap-3">
          <FlaskConical size={16} className="text-lab-text-muted flex-shrink-0" />
          <span className="text-sm font-semibold tracking-tight">The Lab</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-6">
          <div className="px-3 mb-3">
            <span className="text-xs font-medium uppercase tracking-widest text-lab-text-faint">
              Navigation
            </span>
          </div>

          <div className="space-px-3">
            {navItems.map(item => {
              const Icon = item.icon
              const isActive = location.pathname === item.path
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center gap-2.5 h-9 px-4 rounded-md mx-1 transition-subtle ${
                    isActive
                      ? 'text-lab-text-primary bg-white/[0.05]'
                      : 'text-lab-text-secondary hover:bg-white/[0.03]'
                  }`}
                >
                  <Icon
                    size={16}
                    className={isActive ? 'text-lab-accent' : 'text-lab-text-muted'}
                  />
                  <span className="text-sm font-medium">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Bottom nav */}
        <div className="border-t border-lab-border py-3">
          {bottomNavItems.map(item => {
            const Icon = item.icon
            const isActive = location.pathname === item.path
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-2.5 h-9 px-4 rounded-md mx-1 transition-subtle ${
                  isActive
                    ? 'text-lab-text-primary bg-white/[0.05]'
                    : 'text-lab-text-secondary hover:bg-white/[0.03]'
                }`}
              >
                <Icon
                  size={16}
                  className={isActive ? 'text-lab-accent' : 'text-lab-text-muted'}
                />
                <span className="text-sm font-medium">{item.label}</span>
              </Link>
            )
          })}
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 h-9 px-4 rounded-md mx-1 transition-subtle text-lab-text-secondary hover:bg-white/[0.03] w-full"
          >
            <LogOut size={16} className="text-lab-text-muted" />
            <span className="text-sm font-medium">Sign out</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top bar */}
        <div className="h-12 border-b border-lab-border flex items-center justify-between px-8">
          <h1 className="text-page-title">{currentPageName}</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? 'bg-lab-success' : 'bg-lab-text-muted'
                }`}
              />
              <span className="text-xs text-lab-text-muted">
                {isConnected ? 'Connected' : 'Offline'}
              </span>
            </div>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 lg:p-8">{children}</div>
        </div>
      </div>

      {/* Skill completion toast */}
      {toast && (
        <div className="fixed bottom-20 right-6 z-50 bg-lab-surface border border-lab-accent/30 text-lab-text-primary px-4 py-3 rounded-lg shadow-lg text-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-lab-accent" />
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  )
}
