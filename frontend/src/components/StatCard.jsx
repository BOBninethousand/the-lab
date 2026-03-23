export function StatCard({ label, value, isLoading }) {
  return (
    <div className="card">
      <div className="text-xs font-semibold uppercase tracking-wider text-lab-text-muted mb-3">
        {label}
      </div>
      {isLoading ? (
        <div className="h-7 bg-lab-elevated rounded animate-pulse" />
      ) : (
        <div className="text-stat">{value}</div>
      )}
    </div>
  )
}
