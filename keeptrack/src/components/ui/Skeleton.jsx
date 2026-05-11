// Reusable skeleton blocks for loading states

function Skeleton({ className = '' }) {
  return (
    <div className={`bg-surface-3 rounded-xl animate-pulse ${className}`} />
  )
}

export function StatCardSkeleton() {
  return (
    <div className="stat-card">
      <Skeleton className="h-8 w-12" />
      <Skeleton className="h-3 w-10 mt-1" />
    </div>
  )
}

export function LeaderboardSkeleton({ rows = 5 }) {
  return (
    <div className="w-full rounded-2xl border border-surface-4 overflow-hidden">
      <div className="bg-surface-2 px-4 py-3 border-b border-surface-4">
        <Skeleton className="h-3 w-48" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-surface-4 last:border-0">
          <Skeleton className="w-6 h-6 rounded-md" />
          <Skeleton className="w-8 h-8 rounded-full" />
          <Skeleton className="h-4 flex-1 max-w-[120px]" />
          <Skeleton className="h-4 w-12 ml-auto" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-8" />
        </div>
      ))}
    </div>
  )
}

export function GameCardSkeleton({ count = 4 }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card px-4 py-3 flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
          <div className="flex-1 flex flex-col gap-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-3 w-12" />
        </div>
      ))}
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center gap-4">
        <Skeleton className="w-16 h-16 rounded-2xl shrink-0" />
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[1,2,3].map(i => <StatCardSkeleton key={i} />)}
      </div>
      <Skeleton className="h-32 w-full rounded-2xl" />
    </div>
  )
}

export default Skeleton
