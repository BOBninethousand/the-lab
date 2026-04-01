import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Dashboard } from './pages/Dashboard'
import { Agents } from './pages/Agents'
import { Office } from './pages/Office'
import { Calendar } from './pages/Calendar'
import { Memory } from './pages/Memory'
import { Documents } from './pages/Documents'
import { Teams } from './pages/Teams'
import { Costs } from './pages/Costs'
import { OpenClaw } from './pages/OpenClaw'
import { Settings } from './pages/Settings'
import { Strategy } from './pages/Strategy'
import { MasterChatPage } from './pages/MasterChatPage'
import { MasterChat } from './components/MasterChat'
import { LoginPage } from './pages/LoginPage'
import { useAuth } from './hooks/useAuth'

export default function App() {
  const { isAuthenticated, isChecking, login, logout } = useAuth()

  if (isChecking) {
    return (
      <div className="h-screen w-screen bg-lab-bg flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-lab-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={login} />
  }

  return (
    <ErrorBoundary>
      <Router>
        <MasterChat />
        <Layout onLogout={logout}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/master-chat" element={<MasterChatPage />} />
            <Route path="/strategy" element={<Strategy />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/office" element={<Office />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/costs" element={<Costs />} />
            <Route path="/openclaw" element={<OpenClaw />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </Router>
    </ErrorBoundary>
  )
}
