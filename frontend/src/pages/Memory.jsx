import { useState, useEffect } from 'react'
import { Plus, Search } from 'lucide-react'
import { getMemories, getJournals, createMemory, createJournal } from '../lib/api'
import { formatDate } from '../lib/time'

export function Memory() {
  const [activeTab, setActiveTab] = useState('journals')
  const [memories, setMemories] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    tags: '',
  })

  useEffect(() => {
    loadMemories()
  }, [])

  const loadMemories = async () => {
    setIsLoading(true)
    try {
      const data = await getMemories().catch(() => [])
      setMemories(Array.isArray(data) ? data : (data.memories || []))
    } catch (err) {
      console.error('Failed to load memories:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const journals = memories.filter(m => m.type === 'journal').sort((a, b) => new Date(b.date) - new Date(a.date))
  const memoryItems = memories.filter(m => m.type === 'memory').sort((a, b) => new Date(b.date) - new Date(a.date))
  const filteredMemories = memoryItems.filter(m =>
    m.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  )

  const allTags = [...new Set(memoryItems.flatMap(m => m.tags || []))]

  const handleAddMemory = async (e) => {
    e.preventDefault()
    if (!formData.title || !formData.content) return

    try {
      if (activeTab === 'journals') {
        await createJournal({
          title: formData.title,
          content: formData.content,
        })
      } else {
        await createMemory({
          content: formData.content,
          tags: formData.tags ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          source: 'manual',
        })
      }
      setFormData({ title: '', content: '', tags: '' })
      setShowAddModal(false)
      loadMemories()
    } catch (err) {
      console.error('Failed to create memory:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <div className="flex items-center gap-6 border-b border-lab-border pb-4">
        <button
          onClick={() => setActiveTab('journals')}
          className={`text-sm font-medium transition-subtle ${
            activeTab === 'journals'
              ? 'text-lab-text-primary border-b-2 border-lab-accent'
              : 'text-lab-text-muted hover:text-lab-text-secondary'
          }`}
        >
          Journals
        </button>
        <button
          onClick={() => setActiveTab('memories')}
          className={`text-sm font-medium transition-subtle ${
            activeTab === 'memories'
              ? 'text-lab-text-primary border-b-2 border-lab-accent'
              : 'text-lab-text-muted hover:text-lab-text-secondary'
          }`}
        >
          Memories
        </button>
      </div>

      {/* Journals Tab */}
      {activeTab === 'journals' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-section-label">Journal Entries</h2>
            <button
              onClick={() => {
                setFormData({ title: '', content: '', tags: '' })
                setShowAddModal(true)
              }}
              className="flex items-center gap-2 px-3 py-1.5 border border-lab-border-hover rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
            >
              <Plus size={14} />
              New Entry
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-lab-surface rounded animate-pulse" />
              ))}
            </div>
          ) : journals.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-lab-text-faint">No journal entries yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {journals.map(journal => (
                <div key={journal.id} className="border border-lab-border rounded-lg overflow-hidden">
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === journal.id ? null : journal.id)
                    }
                    className="w-full p-4 hover:bg-white/[0.02] transition-subtle text-left"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-sm font-medium text-lab-text-primary">
                          {formatDate(new Date(journal.date))}
                        </div>
                        <div className="text-xs text-lab-text-secondary mt-1">
                          {journal.title}
                        </div>
                      </div>
                      <div className="text-lab-text-muted">
                        {expandedId === journal.id ? '▼' : '▶'}
                      </div>
                    </div>
                  </button>

                  {expandedId === journal.id && (
                    <div className="px-4 py-3 border-t border-lab-border bg-white/[0.02]">
                      <p className="text-xs text-lab-text-secondary leading-relaxed">
                        {journal.content}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Memories Tab */}
      {activeTab === 'memories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-section-label">Memory Vault</h2>
            <button
              onClick={() => {
                setFormData({ title: '', content: '', tags: '' })
                setShowAddModal(true)
              }}
              className="flex items-center gap-2 px-3 py-1.5 border border-lab-border-hover rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
            >
              <Plus size={14} />
              Add Memory
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-lab-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search memories..."
              className="w-full bg-lab-surface border border-lab-border rounded-md pl-9 pr-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 transition-subtle"
            />
          </div>

          {/* Tags */}
          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSearchQuery(tag)}
                  className="px-3 py-1 bg-white/[0.05] text-xs text-lab-text-secondary rounded-full hover:bg-white/[0.1] transition-subtle"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {/* Memory list */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 bg-lab-surface rounded animate-pulse" />
              ))}
            </div>
          ) : filteredMemories.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-lab-text-faint">
                {searchQuery ? 'No memories match your search' : 'No memories yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredMemories.map(memory => (
                <button
                  key={memory.id}
                  onClick={() =>
                    setExpandedId(expandedId === memory.id ? null : memory.id)
                  }
                  className="w-full text-left p-4 border border-lab-border rounded-lg hover:bg-white/[0.02] transition-subtle"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="text-xs text-lab-text-muted">
                        {formatDate(new Date(memory.date))}
                      </div>
                      <div className="text-sm font-medium text-lab-text-primary mt-1">
                        {memory.title}
                      </div>
                    </div>
                    <div className="text-lab-text-muted">
                      {expandedId === memory.id ? '▼' : '▶'}
                    </div>
                  </div>

                  <p className="text-xs text-lab-text-secondary line-clamp-2">
                    {memory.content}
                  </p>

                  {memory.tags && memory.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {memory.tags.map(tag => (
                        <span
                          key={tag}
                          className="inline-block px-1.5 py-0.5 bg-white/[0.05] text-xs text-lab-text-muted rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {expandedId === memory.id && (
                    <div className="mt-3 pt-3 border-t border-lab-border">
                      <p className="text-xs text-lab-text-secondary leading-relaxed">
                        {memory.content}
                      </p>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card-elevated w-96">
            <h2 className="text-sm font-semibold text-lab-text-primary mb-4">
              {activeTab === 'journals' ? 'New Journal Entry' : 'Add Memory'}
            </h2>

            <form onSubmit={handleAddMemory} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                  {activeTab === 'journals' ? 'Entry Title' : 'Title'}
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
                  placeholder={activeTab === 'journals' ? 'Title' : 'Memory title'}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                  Content
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50 resize-none"
                  placeholder="Write your thoughts..."
                  rows={4}
                />
              </div>

              {activeTab === 'memories' && (
                <div>
                  <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                    Tags (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) =>
                      setFormData({ ...formData, tags: e.target.value })
                    }
                    className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
                    placeholder="research, important, follow-up"
                  />
                </div>
              )}

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
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
