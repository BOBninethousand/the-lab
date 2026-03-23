import { useState, useEffect } from 'react'
import { Plus, FileText } from 'lucide-react'
import { getDocuments, createDocument } from '../lib/api'
import { formatDate } from '../lib/time'

export function Documents() {
  const [documents, setDocuments] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'markdown',
  })

  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    setIsLoading(true)
    try {
      const data = await getDocuments().catch(() => [])
      setDocuments(Array.isArray(data) ? data : (data.documents || []))
    } catch (err) {
      console.error('Failed to load documents:', err)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddDocument = async (e) => {
    e.preventDefault()
    if (!formData.title || !formData.content) return

    try {
      await createDocument({
        title: formData.title,
        content: formData.content,
        doc_type: formData.type,
      })
      setFormData({ title: '', content: '', type: 'markdown' })
      setShowAddModal(false)
      loadDocuments()
    } catch (err) {
      console.error('Failed to create document:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-section-label">Documents</h2>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-3 py-1.5 border border-lab-border-hover rounded-md text-xs text-lab-text-secondary hover:bg-white/[0.03] transition-subtle"
        >
          <Plus size={14} />
          Create Document
        </button>
      </div>

      {/* Table */}
      <div className="card bg-transparent border-0 p-0">
        {/* Headers */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-4 py-3 border-b border-lab-border text-xs font-semibold uppercase tracking-wider text-lab-text-muted">
          <div className="col-span-4">Title</div>
          <div className="col-span-2">Type</div>
          <div className="col-span-3">Agent</div>
          <div className="col-span-3">Date</div>
        </div>

        {/* Rows */}
        {isLoading ? (
          <div className="space-y-3 p-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-lab-surface rounded animate-pulse" />
            ))}
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={24} className="mx-auto text-lab-text-muted mb-3" />
            <p className="text-sm text-lab-text-faint">No documents yet</p>
          </div>
        ) : (
          <div className="divide-y divide-lab-border">
            {documents.map(doc => (
              <div key={doc.id}>
                <button
                  onClick={() =>
                    setExpandedId(expandedId === doc.id ? null : doc.id)
                  }
                  className="w-full px-4 py-3 hover:bg-white/[0.02] transition-subtle text-left border-b border-white/[0.04] last:border-0"
                >
                  <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                    <div className="col-span-4">
                      <div className="text-sm font-medium text-lab-text-primary">
                        {doc.title}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="inline-block px-2 py-0.5 bg-lab-elevated text-xs text-lab-text-muted rounded">
                        {doc.type || 'markdown'}
                      </span>
                    </div>
                    <div className="col-span-3">
                      <div className="text-xs text-lab-text-secondary">
                        {doc.agent || '-'}
                      </div>
                    </div>
                    <div className="col-span-3 text-right">
                      <div className="text-xs text-lab-text-muted">
                        {formatDate(new Date(doc.date))}
                      </div>
                    </div>
                  </div>

                  {/* Mobile view */}
                  <div className="md:hidden">
                    <div className="text-sm font-medium text-lab-text-primary mb-1">
                      {doc.title}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-lab-text-muted">{doc.type || 'markdown'}</span>
                      <span className="text-lab-text-faint">•</span>
                      <span className="text-lab-text-muted">
                        {formatDate(new Date(doc.date))}
                      </span>
                    </div>
                  </div>
                </button>

                {expandedId === doc.id && (
                  <div className="px-4 py-4 bg-white/[0.02] border-t border-lab-border">
                    <div className="prose prose-invert max-w-none">
                      <pre className="bg-lab-bg border border-lab-border rounded-md p-4 text-xs text-lab-text-secondary overflow-auto max-h-96">
                        <code>{doc.content}</code>
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Document Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card-elevated w-96">
            <h2 className="text-sm font-semibold text-lab-text-primary mb-4">
              Create Document
            </h2>

            <form onSubmit={handleAddDocument} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                  Title
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary placeholder:text-lab-text-muted focus:outline-none focus:border-lab-accent/50"
                  placeholder="Document title"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-lab-text-secondary mb-2">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  className="w-full bg-lab-bg border border-lab-border rounded-md px-3 py-2 text-xs text-lab-text-primary focus:outline-none focus:border-lab-accent/50"
                >
                  <option value="markdown">Markdown</option>
                  <option value="text">Text</option>
                  <option value="code">Code</option>
                  <option value="pdf">PDF</option>
                </select>
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
                  placeholder="Document content..."
                  rows={6}
                />
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
