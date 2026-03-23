import { useState, useEffect } from 'react'
import { Plus, ChevronRight } from 'lucide-react'
import { AvatarCircle } from '../components/AvatarCircle'
import { AgentRow } from '../components/AgentRow'
import { getCrews, getAgents, createCrew } from '../lib/api'

export function Teams() {
  const [crews, setCrews] = useState([])
  const [agents, setAgents] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [step, setStep] = useState(1)
  const [selectedAgents, setSelectedAgents] = useState([])
  const [formData, setFormData] = useState({
    name: '',
    process_type: 'sequential',
    tasks: [''],
  })

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [crewsData, agentsData] = await Promise.all([
        getCrews().catch(() => []),
        getAgents().catch(() => []),
      ])

      setCrews(Array.isArray(crewsData) ? crewsData : (crewsData.crews || []))
      setAgents(Array.isArray(agentsData) ? agentsData : (agentsData.agents || []))
    } catch (err) {
      console.error('Failed to load teams data:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddCrew = async (e) => {
    e.preventDefault()
    if (!formData.name || selectedAgents.length === 0) return

    try {
      await createCrew({
        ...formData,
        agent_ids: selectedAgents,
      })
      resetForm()
      loadData()
    } catch (err) {
      console.error('Failed to create crew:', err)
    }
  }

  const resetForm = () => {
    setFormData({ name: '', process_type: 'sequential', tasks: [''] })
    setSelectedAgents([])
    setStep(1)
    setShowAddModal(false)
  }

  const activeCrew = crews.filter(c => c.status === 'active')

  return (
    <div className="space-y-8">
      {/* Active Crews */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-section-label">Active Crews</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-3 py-1.5 border border-lab-border-hover rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
          >
            <Plus size={14} />
            Create Crew
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-24 bg-lab-surface rounded animate-pulse" />
            ))}
          </div>
        ) : activeCrew.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-lab-text-faint mb-4">No active crews</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-xs text-lab-accent hover:text-lab-accent/80 transition-subtle"
            >
              Create your first crew
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            {activeCrew.map(crew => (
              <div key={crew.id} className="card">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium text-lab-text-primary">
                      {crew.name}
                    </h3>
                    <p className="text-xs text-lab-text-muted mt-1">
                      {crew.process_type} • {crew.agents?.length || 0} agents
                    </p>
                  </div>
                  <div className="px-2 py-1 bg-lab-success/10 rounded text-xs text-lab-success font-medium">
                    Active
                  </div>
                </div>

                {crew.agents && crew.agents.length > 0 && (
                  <div className="flex items-center gap-2 mb-3">
                    {crew.agents.slice(0, 3).map((agent, idx) => (
                      <div
                        key={agent.id}
                        style={{ marginLeft: idx > 0 ? '-10px' : '0' }}
                        className="relative z-10"
                      >
                        <AvatarCircle
                          name={agent.name}
                          agent={agent.agent_type}
                          size={24}
                        />
                      </div>
                    ))}
                    {crew.agents.length > 3 && (
                      <span className="text-xs text-lab-text-muted">
                        +{crew.agents.length - 3}
                      </span>
                    )}
                  </div>
                )}

                <button className="w-full mt-3 px-3 py-1.5 border border-lab-border rounded-md text-xs text-lab-accent hover:bg-lab-accent/10 transition-subtle flex items-center justify-center gap-1">
                  View
                  <ChevronRight size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent Roster */}
      <div>
        <h2 className="text-section-label mb-4">Agent Roster</h2>

        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-lab-surface rounded animate-pulse" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-lab-text-faint">No agents available</p>
          </div>
        ) : (
          <div className="card bg-transparent border-0 p-0 border border-lab-border rounded-md overflow-hidden">
            {agents.map(agent => (
              <AgentRow
                key={agent.id}
                agent={agent}
                onClick={() => {
                  // Navigate to agent detail
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Crew Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card-elevated w-96 max-h-96 overflow-y-auto">
            <h2 className="text-sm font-semibold text-lab-text-primary mb-4">
              Create New Crew
            </h2>

            {/* Step indicator */}
            <div className="flex items-center justify-between mb-6">
              {[1, 2, 3, 4].map(s => (
                <div key={s} className="flex items-center">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-subtle ${
                      step === s
                        ? 'bg-lab-accent text-white'
                        : step > s
                          ? 'bg-lab-success text-white'
                          : 'bg-white/[0.05] text-lab-text-muted'
                    }`}
                  >
                    {step > s ? '✓' : s}
                  </div>
                  {s < 4 && (
                    <div
                      className={`w-8 h-0.5 transition-subtle ${
                        step > s ? 'bg-lab-success' : 'bg-white/[0.05]'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Step content */}
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (step < 4) {
                  setStep(step + 1)
                } else {
                  handleAddCrew(e)
                }
              }}
              className="space-y-4"
            >
              {step === 1 && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                      Crew Name
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
                      placeholder="e.g. Research Squad"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                      Process Type
                    </label>
                    <select
                      value={formData.process_type}
                      onChange={(e) =>
                        setFormData({ ...formData, process_type: e.target.value })
                      }
                      className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50"
                    >
                      <option value="sequential">Sequential</option>
                      <option value="hierarchical">Hierarchical</option>
                    </select>
                  </div>
                </>
              )}

              {step === 2 && (
                <div>
                  <label className="block text-xs font-medium text-lab-text-secondary mb-3">
                    Select Agents
                  </label>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {agents.map(agent => (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => {
                          setSelectedAgents(prev =>
                            prev.includes(agent.id)
                              ? prev.filter(id => id !== agent.id)
                              : [...prev, agent.id]
                          )
                        }}
                        className={`w-full flex items-center gap-3 p-2 rounded-md transition-subtle ${
                          selectedAgents.includes(agent.id)
                            ? 'bg-lab-accent/10 border border-lab-accent/30'
                            : 'hover:bg-white/[0.03]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedAgents.includes(agent.id)}
                          readOnly
                          className="w-4 h-4 rounded border-lab-border bg-lab-bg cursor-pointer"
                        />
                        <AvatarCircle
                          name={agent.name}
                          agent={agent.agent_type}
                          size={20}
                        />
                        <div className="flex-1 text-left">
                          <p className="text-xs font-medium text-lab-text-primary">
                            {agent.name}
                          </p>
                          <p className="text-xs text-lab-text-muted">{agent.role}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                    Define Tasks
                  </label>
                  <div className="space-y-2">
                    {formData.tasks.map((task, idx) => (
                      <textarea
                        key={idx}
                        value={task}
                        onChange={(e) => {
                          const newTasks = [...formData.tasks]
                          newTasks[idx] = e.target.value
                          setFormData({ ...formData, tasks: newTasks })
                        }}
                        className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 resize-none"
                        placeholder={`Task ${idx + 1}...`}
                        rows={2}
                      />
                    ))}
                  </div>
                </div>
              )}

              {step === 4 && (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-lab-text-secondary mb-1">Crew Name</p>
                    <p className="text-sm text-lab-text-primary">{formData.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-lab-text-secondary mb-1">
                      Agents ({selectedAgents.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedAgents.map(id => {
                        const agent = agents.find(a => a.id === id)
                        return (
                          <span
                            key={id}
                            className="inline-block px-2 py-1 bg-lab-accent/10 text-xs text-lab-accent rounded-md"
                          >
                            {agent?.name}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 pt-4 border-t border-lab-border">
                <button
                  type="button"
                  onClick={() => {
                    if (step > 1) {
                      setStep(step - 1)
                    } else {
                      resetForm()
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-lab-border rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
                >
                  {step === 1 ? 'Cancel' : 'Back'}
                </button>
                <button
                  type="submit"
                  className="flex-1 px-3 py-2 bg-lab-accent text-white rounded-md text-xs font-medium hover:bg-lab-accent/90 transition-subtle"
                >
                  {step === 4 ? 'Launch' : 'Next'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
