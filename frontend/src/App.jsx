import { lazy, Suspense, Component } from 'react'
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
      <div className="text-sm text-lab-text-muted">Loading 3D Office...</div>
    </div>
  )
}

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <p className="text-sm text-lab-text-secondary mb-2">3D Office failed to load</p>
            <button onClick={() => this.setState({ hasError: false })} className="text-xs text-lab-accent hover:underline">Try again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/office" element={
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <Office />
              </Suspense>
            </ErrorBoundary>
          } />
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
