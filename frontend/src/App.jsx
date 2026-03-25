import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { Agents } from './pages/Agents'
import { OfficeCss as Office } from './pages/OfficeCss'
import { Calendar } from './pages/Calendar'
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
          <Route path="/office" element={<Office />} />
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
