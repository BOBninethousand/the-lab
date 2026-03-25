import { useState, useEffect, useCallback } from 'react'
import { Plus, Search, Brain, BookOpen, ShieldCheck, Trash2, X, ChevronDown, Lightbulb, GraduationCap, Heart, Database, AlertTriangle, Upload } from 'lucide-react'
import {
  getKnowledge, createKnowledge, searchKnowledge, deleteKnowledge,
  getAgentMemories, searchAgentMemories, deleteAgentMemory,
  getCorrections, getCorrectionRules, createCorrection,
  getMemoryStats, getAgents, bulkImportKnowledge,
} from '../lib/api'
import { formatDate } from '../lib/time'

const CATEGORIES = [
  { value: null, label: 'All' },
  { value: 'rule', label: 'Rules' },
  { value: 'fact', label: 'Facts' },
  { value: 'reference', label: 'References' },
  { value: 'preference', label: 'Preferences' },
]

const CATEGORY_COLORS = {
  rule: 'text-amber-400 bg-amber-400/10',
  fact: 'text-blue-400 bg-blue-400/10',
  reference: 'text-purple-400 bg-purple-400/10',
  preference: 'text-emerald-400 bg-emerald-400/10',
}

const MEMORY_TYPE_ICONS = {
  insight: Lightbulb,
  learning: GraduationCap,
  preference: Heart,
  fact: Database,
}

const MEMORY_TYPE_COLORS = {
  insight: 'text-yellow-400 bg-yellow-400/10',
  learning: 'text-blue-400 bg-blue-400/10',
  preference: 'text-pink-400 bg-pink-400/10',
  fact: 'text-emerald-400 bg-emerald-400/10',
}

export function Memory() {
  const [activeTab, setActiveTab] = useState('knowledge')
  const [isLoading, setIsLoading] = useState(true)
  const [stats, setStats] = useState(null)
  const [agents, setAgents] = useState([])

  // Knowledge Base state
  const [knowledge, setKnowledge] = useState([])
  const [knowledgeSearch, setKnowledgeSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [showAddKnowledge, setShowAddKnowledge] = useState(false)

  // Agent Memories state
  const [selectedAgent, setSelectedAgent] = useState(null)
  const [agentMemories, setAgentMemories] = useState([])
  const [memorySearch, setMemorySearch] = useState('')

  // Corrections state
  const [correctionAgent, setCorrectionAgent] = useState(null)
  const [corrections, setCorrections] = useState([])
  const [rules, setRules] = useState([])
  const [showAddCorrection, setShowAddCorrection] = useState(false)

  // Import state
  const [isImporting, setIsImporting] = useState(false)
  const [importResult, setImportResult] = useState(null)

  // Form state
  const [form, setForm] = useState({ title: '', content: '', tags: '', category: 'fact' })
  const [correctionForm, setCorrectionForm] = useState({ agent_id: '', original_response: '', correction: '', tags: '' })

  useEffect(() => {
    loadStats()
    loadAgents()
  }, [])

  useEffect(() => {
    if (activeTab === 'knowledge') loadKnowledge()
  }, [activeTab, categoryFilter])

  useEffect(() => {
    if (activeTab === 'agent' && selectedAgent) loadAgentMemories()
  }, [activeTab, selectedAgent])

  useEffect(() => {
    if (activeTab === 'corrections' && correctionAgent) loadCorrections()
  }, [activeTab, correctionAgent])

  const loadStats = async () => {
    try {
      const data = await getMemoryStats().catch(() => null)
      setStats(data)
    } catch {}
  }

  const loadAgents = async () => {
    try {
      const data = await getAgents().catch(() => [])
      setAgents(Array.isArray(data) ? data : [])
      if (data.length > 0) {
        setSelectedAgent(data[0].id)
        setCorrectionAgent(data[0].id)
        setCorrectionForm(f => ({ ...f, agent_id: data[0].id }))
      }
    } catch {}
  }

  const loadKnowledge = async () => {
    setIsLoading(true)
    try {
      const params = {}
      if (categoryFilter) params.category = categoryFilter
      const data = await getKnowledge(params).catch(() => [])
      setKnowledge(Array.isArray(data) ? data : [])
    } catch {} finally { setIsLoading(false) }
  }

  const handleKnowledgeSearch = useCallback(async () => {
    if (!knowledgeSearch.trim()) { loadKnowledge(); return }
    setIsLoading(true)
    try {
      const data = await searchKnowledge(knowledgeSearch).catch(() => [])
      setKnowledge(Array.isArray(data) ? data : [])
    } catch {} finally { setIsLoading(false) }
  }, [knowledgeSearch])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'knowledge') handleKnowledgeSearch()
    }, 400)
    return () => clearTimeout(timer)
  }, [knowledgeSearch])

  const loadAgentMemories = async () => {
    if (!selectedAgent) return
    setIsLoading(true)
    try {
      const fn = memorySearch.trim() ? searchAgentMemories : getAgentMemories
      const args = memorySearch.trim() ? [selectedAgent, memorySearch] : [selectedAgent]
      const data = await fn(...args).catch(() => [])
      setAgentMemories(Array.isArray(data) ? data : [])
    } catch {} finally { setIsLoading(false) }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      if (activeTab === 'agent' && selectedAgent) loadAgentMemories()
    }, 400)
    return () => clearTimeout(timer)
  }, [memorySearch])

  const loadCorrections = async () => {
    if (!correctionAgent) return
    setIsLoading(true)
    try {
      const [corr, rul] = await Promise.all([
        getCorrections(correctionAgent).catch(() => []),
        getCorrectionRules(correctionAgent).catch(() => []),
      ])
      setCorrections(Array.isArray(corr) ? corr : [])
      setRules(Array.isArray(rul) ? rul : [])
    } catch {} finally { setIsLoading(false) }
  }

  const handleAddKnowledge = async (e) => {
    e.preventDefault()
    if (!form.title || !form.content) return
    try {
      await createKnowledge({
        title: form.title,
        content: form.content,
        tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
        category: form.category,
      })
      setForm({ title: '', content: '', tags: '', category: 'fact' })
      setShowAddKnowledge(false)
      loadKnowledge()
      loadStats()
    } catch (err) { console.error('Failed to add knowledge:', err) }
  }

  const handleDeleteKnowledge = async (id) => {
    try {
      await deleteKnowledge(id)
      loadKnowledge()
      loadStats()
    } catch {}
  }

  const handleImportJSON = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setIsImporting(true)
    setImportResult(null)
    try {
      const text = await file.text()
      const entries = JSON.parse(text)
      if (!Array.isArray(entries)) throw new Error('JSON must be an array of entries')
      const result = await bulkImportKnowledge(entries)
      setImportResult(result)
      loadKnowledge()
      loadStats()
    } catch (err) {
      setImportResult({ error: err.message })
    } finally {
      setIsImporting(false)
    }
  }

  const handleDeleteMemory = async (agentId, memoryId) => {
    try {
      await deleteAgentMemory(agentId, memoryId)
      loadAgentMemories()
      loadStats()
    } catch {}
  }

  const handleAddCorrection = async (e) => {
    e.preventDefault()
    if (!correctionForm.original_response || !correctionForm.correction) return
    try {
      await createCorrection({
        agent_id: correctionForm.agent_id || correctionAgent,
        original_response: correctionForm.original_response,
        correction: correctionForm.correction,
        tags: correctionForm.tags ? correctionForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      })
      setCorrectionForm({ agent_id: correctionAgent, original_response: '', correction: '', tags: '' })
      setShowAddCorrection(false)
      loadCorrections()
      loadStats()
    } catch (err) { console.error('Failed to log correction:', err) }
  }

  const getAgentName = (id) => agents.find(a => a.id === id)?.name || id

  const tabs = [
    { id: 'knowledge', label: 'Knowledge Base', icon: BookOpen },
    { id: 'agent', label: 'Agent Memories', icon: Brain },
    { id: 'corrections', label: 'Corrections & Rules', icon: ShieldCheck },
  ]

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Knowledge" value={stats.knowledge_count} />
          <StatCard label="Agent Memories" value={stats.agent_memory_count} />
          <StatCard label="Corrections" value={stats.correction_count} />
          <StatCard label="Active Rules" value={stats.rules_count} accent />
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-4 md:gap-6 border-b border-lab-border pb-4 overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 text-sm font-medium transition-subtle ${
                activeTab === tab.id
                  ? 'text-lab-text-primary border-b-2 border-lab-accent'
                  : 'text-lab-text-muted hover:text-lab-text-secondary'
              }`}
            >
              <Icon size={14} />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Knowledge Base Tab */}
      {activeTab === 'knowledge' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {CATEGORIES.map(cat => (
                <button
                  key={cat.label}
                  onClick={() => { setCategoryFilter(cat.value); setKnowledgeSearch('') }}
                  className={`px-3 py-1 rounded-full text-xs transition-subtle ${
                    categoryFilter === cat.value
                      ? 'bg-lab-accent/20 text-lab-accent'
                      : 'bg-white/[0.05] text-lab-text-secondary hover:bg-white/[0.1]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                id="kb-import-file"
                accept=".json"
                onChange={handleImportJSON}
                className="hidden"
              />
              <button
                onClick={() => document.getElementById('kb-import-file').click()}
                disabled={isImporting}
                className="flex items-center gap-2 px-3 py-1.5 border border-lab-border-hover rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle disabled:opacity-50"
              >
                <Upload size={14} /> {isImporting ? 'Importing...' : 'Import JSON'}
              </button>
              <button
                onClick={() => { setForm({ title: '', content: '', tags: '', category: 'fact' }); setShowAddKnowledge(true) }}
                className="flex items-center gap-2 px-3 py-1.5 border border-lab-border-hover rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
              >
                <Plus size={14} /> Add Knowledge
              </button>
            </div>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-lab-text-muted" />
            <input
              type="text"
              value={knowledgeSearch}
              onChange={(e) => setKnowledgeSearch(e.target.value)}
              placeholder="Semantic search across knowledge base..."
              className="w-full bg-lab-surface border border-lab-border rounded-md pl-9 pr-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 transition-subtle"
            />
          </div>

          {importResult && (
            <div className={`p-3 rounded-lg text-xs flex items-center justify-between ${
              importResult.error
                ? 'bg-red-500/10 border border-red-500/20 text-red-400'
                : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            }`}>
              <span>
                {importResult.error
                  ? `Import failed: ${importResult.error}`
                  : `Imported ${importResult.created} entries${importResult.skipped ? `, ${importResult.skipped} skipped (duplicates)` : ''}${importResult.errors?.length ? `, ${importResult.errors.length} errors` : ''}`
                }
              </span>
              <button onClick={() => setImportResult(null)} className="ml-2 hover:opacity-70">
                <X size={14} />
              </button>
            </div>
          )}

          {isLoading ? (
            <LoadingSkeleton />
          ) : knowledge.length === 0 ? (
            <EmptyState message={knowledgeSearch ? 'No results found' : 'No knowledge entries yet. Add facts, rules, and references that agents should know.'} />
          ) : (
            <div className="space-y-2">
              {knowledge.map(entry => (
                <div key={entry.id} className="border border-lab-border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    className="w-full p-4 hover:bg-white/[0.02] transition-subtle text-left"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium uppercase ${CATEGORY_COLORS[entry.category] || 'text-lab-text-muted bg-white/[0.05]'}`}>
                            {entry.category}
                          </span>
                          {entry.notion_page_id && (
                            <span className="text-[10px] text-lab-text-muted">Notion</span>
                          )}
                        </div>
                        <div className="text-sm font-medium text-lab-text-primary">{entry.title}</div>
                        <div className="text-xs text-lab-text-muted mt-1 line-clamp-1">{entry.content}</div>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <span className="text-[10px] text-lab-text-muted">{formatDate(new Date(entry.created_at))}</span>
                        <ChevronDown size={14} className={`text-lab-text-muted transition-transform ${expandedId === entry.id ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    {entry.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {entry.tags.map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 bg-white/[0.05] text-[10px] text-lab-text-muted rounded">{tag}</span>
                        ))}
                      </div>
                    )}
                  </button>
                  {expandedId === entry.id && (
                    <div className="px-4 py-3 border-t border-lab-border bg-white/[0.02]">
                      <p className="text-xs text-lab-text-secondary leading-relaxed whitespace-pre-wrap">{entry.content}</p>
                      <div className="flex justify-end mt-3">
                        <button onClick={() => handleDeleteKnowledge(entry.id)} className="flex items-center gap-1 text-[10px] text-red-400/70 hover:text-red-400 transition-subtle">
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Agent Memories Tab */}
      {activeTab === 'agent' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <select
              value={selectedAgent || ''}
              onChange={(e) => { setSelectedAgent(e.target.value); setMemorySearch('') }}
              className="bg-lab-surface border border-lab-border rounded-md px-3 py-1.5 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50"
            >
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-lab-text-muted" />
            <input
              type="text"
              value={memorySearch}
              onChange={(e) => setMemorySearch(e.target.value)}
              placeholder={`Search ${getAgentName(selectedAgent)}'s memories...`}
              className="w-full bg-lab-surface border border-lab-border rounded-md pl-9 pr-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 transition-subtle"
            />
          </div>

          {isLoading ? (
            <LoadingSkeleton />
          ) : agentMemories.length === 0 ? (
            <EmptyState message={memorySearch ? 'No matching memories' : `No memories yet. Start chatting with ${getAgentName(selectedAgent)} and memories will be captured automatically.`} />
          ) : (
            <div className="space-y-2">
              {agentMemories.map(mem => {
                const TypeIcon = MEMORY_TYPE_ICONS[mem.memory_type] || Lightbulb
                const typeColor = MEMORY_TYPE_COLORS[mem.memory_type] || MEMORY_TYPE_COLORS.insight
                return (
                  <div key={mem.id} className="p-4 border border-lab-border rounded-lg hover:bg-white/[0.02] transition-subtle">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium ${typeColor}`}>
                            <TypeIcon size={10} />
                            {mem.memory_type}
                          </span>
                          <span className="text-[10px] text-lab-text-muted">{formatDate(new Date(mem.created_at))}</span>
                        </div>
                        <p className="text-xs text-lab-text-secondary leading-relaxed">{mem.content}</p>
                        {mem.tags?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {mem.tags.map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 bg-white/[0.05] text-[10px] text-lab-text-muted rounded">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => handleDeleteMemory(selectedAgent, mem.id)} className="ml-2 text-lab-text-muted hover:text-red-400 transition-subtle">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Corrections & Rules Tab */}
      {activeTab === 'corrections' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <select
              value={correctionAgent || ''}
              onChange={(e) => setCorrectionAgent(e.target.value)}
              className="bg-lab-surface border border-lab-border rounded-md px-3 py-1.5 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50"
            >
              {agents.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button
              onClick={() => { setCorrectionForm({ agent_id: correctionAgent, original_response: '', correction: '', tags: '' }); setShowAddCorrection(true) }}
              className="flex items-center gap-2 px-3 py-1.5 border border-lab-border-hover rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
            >
              <Plus size={14} /> Log Correction
            </button>
          </div>

          {isLoading ? (
            <LoadingSkeleton />
          ) : (
            <div className="space-y-6">
              {/* Active Rules */}
              {rules.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                    <ShieldCheck size={12} /> Active Rules ({rules.length})
                  </h3>
                  {rules.map(rule => (
                    <div key={rule.id} className="p-4 border border-emerald-500/20 bg-emerald-500/[0.03] rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 rounded text-[10px] font-medium text-emerald-400 bg-emerald-400/10">
                              AUTO-RULE
                            </span>
                            <span className="text-[10px] text-lab-text-muted">Triggered {rule.occurrence_count}x</span>
                          </div>
                          <p className="text-xs text-lab-text-primary font-medium">{rule.correction}</p>
                          <p className="text-[10px] text-lab-text-muted mt-1 line-clamp-2">Original: {rule.original_response}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Logged Corrections */}
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-lab-text-secondary uppercase tracking-wider flex items-center gap-2">
                  <AlertTriangle size={12} /> Logged Corrections ({corrections.filter(c => c.occurrence_count < 2).length})
                </h3>
                {corrections.filter(c => c.occurrence_count < 2).length === 0 ? (
                  <EmptyState message={`No corrections logged for ${getAgentName(correctionAgent)} yet.`} />
                ) : (
                  corrections.filter(c => c.occurrence_count < 2).map(corr => (
                    <div key={corr.id} className="p-4 border border-lab-border rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-medium text-amber-400 bg-amber-400/10">
                          1x — needs 1 more to become rule
                        </span>
                        <span className="text-[10px] text-lab-text-muted">{formatDate(new Date(corr.created_at))}</span>
                      </div>
                      <p className="text-xs text-lab-text-primary font-medium mb-1">{corr.correction}</p>
                      <p className="text-[10px] text-lab-text-muted line-clamp-2">Original: {corr.original_response}</p>
                      {corr.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {corr.tags.map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 bg-white/[0.05] text-[10px] text-lab-text-muted rounded">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Knowledge Modal */}
      {showAddKnowledge && (
        <Modal title="Add Knowledge" onClose={() => setShowAddKnowledge(false)}>
          <form onSubmit={handleAddKnowledge} className="space-y-4">
            <FormField label="Title">
              <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50" placeholder="What should agents know?" />
            </FormField>
            <FormField label="Category">
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50">
                <option value="fact">Fact</option>
                <option value="rule">Rule</option>
                <option value="reference">Reference</option>
                <option value="preference">Preference</option>
              </select>
            </FormField>
            <FormField label="Content">
              <textarea value={form.content} onChange={e => setForm({ ...form, content: e.target.value })}
                className="form-input resize-none" placeholder="Detailed information..." rows={4} />
            </FormField>
            <FormField label="Tags (comma-separated)">
              <input type="text" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })}
                className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50" placeholder="marketing, strategy, important" />
            </FormField>
            <ModalActions onCancel={() => setShowAddKnowledge(false)} submitLabel="Save" />
          </form>
        </Modal>
      )}

      {/* Add Correction Modal */}
      {showAddCorrection && (
        <Modal title="Log Correction" onClose={() => setShowAddCorrection(false)}>
          <form onSubmit={handleAddCorrection} className="space-y-4">
            <FormField label="Agent">
              <select value={correctionForm.agent_id} onChange={e => setCorrectionForm({ ...correctionForm, agent_id: e.target.value })} className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50">
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </FormField>
            <FormField label="What was wrong?">
              <textarea value={correctionForm.original_response} onChange={e => setCorrectionForm({ ...correctionForm, original_response: e.target.value })}
                className="form-input resize-none" placeholder="The agent said or did..." rows={3} />
            </FormField>
            <FormField label="What should it have done?">
              <textarea value={correctionForm.correction} onChange={e => setCorrectionForm({ ...correctionForm, correction: e.target.value })}
                className="form-input resize-none" placeholder="Instead, the agent should..." rows={3} />
            </FormField>
            <FormField label="Tags (comma-separated)">
              <input type="text" value={correctionForm.tags} onChange={e => setCorrectionForm({ ...correctionForm, tags: e.target.value })}
                className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50" placeholder="tone, accuracy, formatting" />
            </FormField>
            <ModalActions onCancel={() => setShowAddCorrection(false)} submitLabel="Log Correction" />
          </form>
        </Modal>
      )}
    </div>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div className="p-3 border border-lab-border rounded-lg bg-lab-surface/50">
      <div className={`text-lg font-semibold ${accent ? 'text-emerald-400' : 'text-lab-text-primary'}`}>{value}</div>
      <div className="text-[10px] text-lab-text-muted uppercase tracking-wider">{label}</div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-16 bg-lab-surface rounded animate-pulse" />
      ))}
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="text-center py-8">
      <p className="text-sm text-lab-text-faint">{message}</p>
    </div>
  )
}

function Modal({ title, children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card-elevated w-full max-w-md mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-lab-text-primary">{title}</h2>
          <button onClick={onClose} className="text-lab-text-muted hover:text-lab-text-secondary transition-subtle">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function FormField({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-medium text-lab-text-secondary mb-2">{label}</label>
      {children}
    </div>
  )
}

function ModalActions({ onCancel, submitLabel }) {
  return (
    <div className="flex items-center gap-2 pt-4 border-t border-lab-border">
      <button type="button" onClick={onCancel}
        className="flex-1 px-3 py-2 border border-lab-border rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle">
        Cancel
      </button>
      <button type="submit"
        className="flex-1 px-3 py-2 bg-lab-accent text-white rounded-md text-xs font-medium hover:bg-lab-accent/90 transition-subtle">
        {submitLabel}
      </button>
    </div>
  )
}
