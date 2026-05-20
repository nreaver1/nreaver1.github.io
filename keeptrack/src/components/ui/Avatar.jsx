// Shared Avatar component
// Shows profile image if available, falls back to colored initial
// Usage: <Avatar username="nick" avatarUrl="https://..." size="md" />

const SIZE_MAP = {
  xs:  'w-6 h-6 text-xs',
  sm:  'w-8 h-8 text-sm',
  md:  'w-10 h-10 text-base',
  lg:  'w-12 h-12 text-lg',
  xl:  'w-16 h-16 text-2xl',
}

export default function Avatar({ username, avatarUrl, size = 'md', className = '' }) {
  const s        = SIZE_MAP[size] ?? SIZE_MAP.md
  const initial  = username?.[0]?.toUpperCase() ?? '?'

  if (avatarUrl) {
    return (
      <div className={`${s} rounded-full overflow-hidden border border-surface-4 shrink-0 ${className}`}>
        <img
          src={avatarUrl}
          alt={username}
          className="w-full h-full object-cover"
          onError={e => {
            // Swap to initial fallback on broken URL
            e.currentTarget.style.display = 'none'
            const fallback = e.currentTarget.parentElement
            fallback.innerHTML = `<span class="font-display text-brand-400 w-full h-full flex items-center justify-center bg-brand-500/20">${initial}</span>`
          }}
        />
      </div>
    )
  }

  return (
    <div className={`${s} rounded-full bg-brand-500/20 border border-brand-500/20
      flex items-center justify-center font-display text-brand-400 shrink-0 ${className}`}>
      {initial}
    </div>
  )
}
