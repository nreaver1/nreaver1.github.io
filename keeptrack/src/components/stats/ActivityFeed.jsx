import { Trophy, UserPlus, Minus, Clock, Swords } from 'lucide-react'

// ── Time formatting ──────────────────────────────────────────
function timeAgo(ts) {
  const seconds = Math.floor((Date.now() - new Date(ts)) / 1000)
  if (seconds < 60)               return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)               return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24)                 return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7)                   return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ── Parse game event into display-friendly shape ─────────────
function parseGameEvent(game) {
  const teams = game.game_teams ?? []

  if (game.is_draw) {
    const allPlayers = teams
      .flatMap(t => t.game_participants ?? [])
      .map(p => p.profiles?.username)
      .filter(Boolean)
    return {
      emoji:   '🤝',
      color:   'text-yellow-400',
      bg:      'bg-yellow-500/15 border-yellow-500/20',
      headline: allPlayers.length <= 3
        ? `${allPlayers.join(' & ')} drew`
        : `${allPlayers.slice(0, 2).join(', ')} +${allPlayers.length - 2} drew`,
      sub:     game.game_types?.name ?? 'Unknown game',
    }
  }

  const winnerTeam  = teams.find(t => t.is_winner)
  const loserTeams  = teams.filter(t => !t.is_winner)
  const winners     = (winnerTeam?.game_participants ?? []).map(p => p.profiles?.username).filter(Boolean)
  const losers      = loserTeams.flatMap(t => t.game_participants ?? []).map(p => p.profiles?.username).filter(Boolean)

  const winnerStr = winners.length === 0
    ? 'Someone'
    : winners.length <= 2
      ? winners.join(' & ')
      : `${winners[0]} +${winners.length - 1}`

  const loserStr = losers.length === 0
    ? ''
    : losers.length <= 2
      ? ` beat ${losers.join(' & ')}`
      : ` beat ${losers[0]} +${losers.length - 1}`

  // Build score string if any team has a score
  const scores = teams.map(t => t.score).filter(s => s !== null && s !== undefined)
  const winnerScore = winnerTeam?.score
  const topLoserScore = loserTeams[0]?.score
  const scoreStr = (winnerScore != null && topLoserScore != null)
    ? ` (${winnerScore}–${topLoserScore})`
    : ''

  return {
    emoji:    '🏆',
    color:    'text-emerald-400',
    bg:       'bg-emerald-500/15 border-emerald-500/20',
    headline: `${winnerStr}${loserStr}${scoreStr}`,
    sub:      game.game_types?.name ?? 'Unknown game',
  }
}

// ── Single activity item ─────────────────────────────────────
function ActivityItem({ event, compact = false }) {
  if (event.type === 'join') {
    return (
      <div className={`flex items-center gap-3 ${compact ? 'py-2.5' : 'py-3'}`}>
        <div className="w-8 h-8 rounded-full bg-purple-500/20 border border-purple-500/20 flex items-center justify-center shrink-0">
          <UserPlus size={13} className="text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm leading-snug">
            <span className="font-600">{event.profile?.username ?? 'Someone'}</span>
            <span className="text-white/40"> joined the group</span>
          </p>
        </div>
        <span className="text-white/25 text-xs shrink-0">{timeAgo(event.timestamp)}</span>
      </div>
    )
  }

  const parsed = parseGameEvent(event.game)

  return (
    <div className={`flex items-center gap-3 ${compact ? 'py-2.5' : 'py-3'}`}>
      <div className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 text-sm ${parsed.bg}`}>
        {parsed.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm leading-snug truncate">
          <span className="font-600">{parsed.headline}</span>
        </p>
        <p className="text-white/35 text-xs mt-0.5 truncate">{parsed.sub}</p>
      </div>
      <span className="text-white/25 text-xs shrink-0">{timeAgo(event.timestamp)}</span>
    </div>
  )
}

// ── Main feed component ──────────────────────────────────────
export default function ActivityFeed({ activity, loading, compact = false, limit }) {
  if (loading) {
    return (
      <div className={compact ? '' : 'card'}>
        {[...Array(compact ? 4 : 6)].map((_, i) => (
          <div key={i} className="flex items-center gap-3 py-3 px-4">
            <div className="w-8 h-8 rounded-full bg-surface-4 animate-pulse shrink-0" />
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="h-3 bg-surface-4 rounded animate-pulse w-3/4" />
              <div className="h-2.5 bg-surface-4 rounded animate-pulse w-1/2" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const items = limit ? activity.slice(0, limit) : activity

  if (!items.length) {
    return (
      <div className={`${compact ? '' : 'card'} flex flex-col items-center justify-center py-10 px-4 text-center`}>
        <Swords size={28} className="text-white/15 mb-3" />
        <p className="text-white/40 text-sm font-600">No activity yet</p>
        <p className="text-white/25 text-xs mt-1">Games and new members will appear here.</p>
      </div>
    )
  }

  return (
    <div className={compact ? '' : 'card overflow-hidden'}>
      {items.map((event, i) => (
        <div key={event.id}>
          <div className={compact ? '' : 'px-4'}>
            <ActivityItem event={event} compact={compact} />
          </div>
          {i < items.length - 1 && (
            <div className={`border-b border-surface-3 ${compact ? '' : 'mx-4'}`} />
          )}
        </div>
      ))}
    </div>
  )
}
