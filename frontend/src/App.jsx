import { lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Agents } from './pages/Agents'
import { Calendar } from './pages/Calendar'
import { Memory } from './pages/Memory'
import { Documents } from './pages/Documents'
import { Teams } from './pages/Teams'
import { Costs } from './pages/Costs'
import { OpenClaw } from './pages/OpenClaw'
import { Settings } from './pages/Settings'

// Lazy load Office (Three.js is ~1MB — only load when visiting Office tab)
const Office = lazy(() => import('./pages/Office').then(m => ({ default: m.Office })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="text-sm text-lab-text-muted">Loading...</div>
    </div>
  )
}

export default function App() {
  return (
    <Router>
      <Layout>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/office" element={<Office />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/memory" element={<Memory />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/costs" element={<Costs />} />
            <Route path="/openclaw" element={<OpenClaw />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </Suspense>
      </Layout>
    </Router>
  )
}
