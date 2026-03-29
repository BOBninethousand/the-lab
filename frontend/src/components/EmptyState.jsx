export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      {Icon && (
        <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center mb-3">
          <Icon size={20} className="text-lab-text-muted" />
        </div>
      )}
      {title && (
        <p className="text-sm font-medium text-lab-text-secondary mb-1">{title}</p>
      )}
      {description && (
        <p className="text-xs text-lab-text-muted text-center max-w-[280px]">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-4 px-4 py-1.5 text-xs font-medium text-lab-accent hover:bg-lab-accent/10 border border-lab-accent/30 rounded-md transition-subtle"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
