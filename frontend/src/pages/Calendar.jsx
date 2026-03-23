import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { getSchedule, getCalendar, getAgents, createSchedule, runSchedule, updateSchedule } from '../lib/api'

export function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2)) // March 2026
  const [schedule, setSchedule] = useState([])
  const [calendarData, setCalendarData] = useState([])
  const [agents, setAgents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    cron_expression: '0 9 * * *',
    prompt: '',
    agent_id: '',
  })

  useEffect(() => {
    loadSchedule()
  }, [])

  const loadSchedule = async () => {
    setIsLoading(true)
    try {
      const [schedData, calData, agentsData] = await Promise.all([
        getSchedule().catch(() => []),
        getCalendar(60).catch(() => []),
        getAgents().catch(() => []),
      ])
      setSchedule(Array.isArray(schedData) ? schedData : (schedData.schedule || []))
      setCalendarData(Array.isArray(calData) ? calData : [])
      setAgents(Array.isArray(agentsData) ? agentsData : (agentsData.agents || []))
    } catch (err) {
      console.error('Failed to load schedule:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // Build a map of date -> jobs for calendar dots
  const dateJobMap = {}
  calendarData.forEach(entry => {
    dateJobMap[entry.date] = entry.jobs || []
  })

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
  }

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay()
  }

  const handleAddJob = async (e) => {
    e.preventDefault()
    if (!formData.name || !formData.prompt) return

    try {
      await createSchedule(formData)
      setFormData({
        name: '',
        description: '',
        cron_expression: '0 9 * * *',
        prompt: '',
        agent_id: '',
      })
      setShowAddModal(false)
      loadSchedule()
    } catch (err) {
      console.error('Failed to create schedule:', err)
    }
  }

  const handleToggle = async (id, enabled) => {
    try {
      await updateSchedule(id, { enabled: !enabled })
      setSchedule(prev =>
        prev.map(s => (s.id === id ? { ...s, enabled: !enabled } : s))
      )
    } catch (err) {
      console.error('Failed to update schedule:', err)
    }
  }

  const handleRunNow = async (id) => {
    try {
      await runSchedule(id)
    } catch (err) {
      console.error('Failed to run schedule:', err)
    }
  }

  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const daysInMonth = getDaysInMonth(currentDate)
  const firstDay = getFirstDayOfMonth(currentDate)

  const days = []
  for (let i = 0; i < firstDay; i++) {
    days.push(null)
  }
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(i)
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  return (
    <div className="space-y-8">
      {/* Month navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() =>
              setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1))
            }
            className="p-1 hover:bg-white/[0.03] rounded transition-subtle"
          >
            <ChevronLeft size={16} className="text-lab-text-secondary" />
          </button>
          <h2 className="text-section-label min-w-40">{monthName}</h2>
          <button
            onClick={() =>
              setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1))
            }
            className="p-1 hover:bg-white/[0.03] rounded transition-subtle"
          >
            <ChevronRight size={16} className="text-lab-text-secondary" />
          </button>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="card bg-transparent border-0 p-0">
        {/* Day names */}
        <div className="grid grid-cols-7 mb-2">
          {dayNames.map(day => (
            <div key={day} className="text-center text-xs font-medium text-lab-text-faint py-2">
              {day}
            </div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 gap-px border border-lab-border rounded-lg overflow-hidden">
          {days.map((day, idx) => (
            <div
              key={idx}
              className="min-h-20 p-2 border-b border-white/[0.04] bg-transparent"
            >
              {day && (
                <>
                  <div className="text-xs font-medium text-lab-text-secondary mb-1">
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {(() => {
                      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                      const jobs = dateJobMap[dateStr] || []
                      return jobs.slice(0, 3).map((j, jIdx) => (
                        <div
                          key={jIdx}
                          className="w-1.5 h-1.5 rounded-full bg-lab-accent"
                          title={`${j.name} at ${j.time}`}
                        />
                      ))
                    })()}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Scheduled jobs */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-section-label">Scheduled Jobs</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-lab-border-hover rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
          >
            <Plus size={14} />
            Add Job
          </button>
        </div>

        <div className="card bg-transparent border-0 p-0">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-12 bg-lab-surface rounded animate-pulse" />
              ))}
            </div>
          ) : schedule.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-lab-text-faint">No scheduled jobs</p>
            </div>
          ) : (
            <div className="space-y-px border border-lab-border rounded-lg overflow-hidden">
              {schedule.map(job => (
                <div
                  key={job.id}
                  className="flex items-center gap-4 px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-subtle last:border-0"
                >
                  <input
                    type="checkbox"
                    checked={job.enabled !== false}
                    onChange={(e) => handleToggle(job.id, job.enabled !== false)}
                    className="w-4 h-4 rounded border-lab-border bg-lab-bg cursor-pointer"
                  />

                  <div className="flex-1">
                    <div className="text-sm font-medium text-lab-text-primary">
                      {job.name}
                    </div>
                    <div className="text-xs text-lab-text-muted">
                      {job.cron_expression} • {job.agent_id}
                    </div>
                  </div>

                  <button
                    onClick={() => handleRunNow(job.id)}
                    className="text-xs text-lab-accent hover:text-lab-accent/80 transition-subtle"
                  >
                    Run Now
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Add Job Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card-elevated w-96">
            <h2 className="text-sm font-semibold text-lab-text-primary mb-4">
              Create Scheduled Job
            </h2>

            <form onSubmit={handleAddJob} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                  Job Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
                  placeholder="Job name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                  Schedule (cron)
                </label>
                <input
                  type="text"
                  value={formData.cron_expression}
                  onChange={(e) =>
                    setFormData({ ...formData, cron_expression: e.target.value })
                  }
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
                  placeholder="0 9 * * *"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                  Prompt
                </label>
                <textarea
                  value={formData.prompt}
                  onChange={(e) =>
                    setFormData({ ...formData, prompt: e.target.value })
                  }
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 resize-none"
                  placeholder="What should this job do?"
                  rows={4}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                  Agent
                </label>
                <select
                  value={formData.agent_id}
                  onChange={(e) =>
                    setFormData({ ...formData, agent_id: e.target.value })
                  }
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50"
                >
                  <option value="">Select agent...</option>
                  {agents.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.provider})</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-4 border-t border-lab-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 px-3 py-2 border border-lab-border rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 bg-lab-accent text-white rounded-md text-xs font-medium hover:bg-lab-accent/90 transition-subtle"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
