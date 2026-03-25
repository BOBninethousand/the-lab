import { lazy, Suspense, Component } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Agents } from './pages/Agents'
import { Calendar } from './pages/Calendar'

const Office = lazy(() => import('./pages/Office').then(m => ({ default: m.Office })))
const OfficeCssFallback = lazy(() => import('./pages/OfficeCss').then(m => ({ default: m.OfficeCss })))

class OfficeErrorBoundary extends Component {
  state = { hasError: false }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return <Suspense fallback={null}><OfficeCssFallback /></Suspense>
    }
    return this.props.children
  }
}
import { Memory } from './pages/Memory'
import { Documents } from './pages/Documents'
import { Teams } from './pages/Teams'
import { Costs } from './pages/Costs'
import { OpenClaw } from './pages/OpenClaw'
import { Settings } from './pages/Settings'

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/office" element={<OfficeErrorBoundary><Suspense fallback={<div className="flex items-center justify-center h-full text-white/30 text-sm">Loading 3D Office...</div>}><Office /></Suspense></OfficeErrorBoundary>} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/memory" element={<Memory />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/costs" element={<Costs />} />
          <Route path="/openclaw" element={<OpenClaw />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </Router>
  )
}
