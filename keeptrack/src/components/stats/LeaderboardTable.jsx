import { useState } from 'react'
import { ArrowUp, ArrowDown, Minus, Trophy, Flame } from 'lucide-react'
import { sortRecords, formatStreak, fmtPct } from '../../lib/stats'

const COLUMNS = [
  { key: 'winPct',  label: 'Win %',   title: 'Win percentage (points)' },
  { key: 'wins',    label: 'W',       title: 'Wins' },
  { key: 'losses',  label: 'L',       title: 'Losses' },
  { key: 'draws',   label: 'D',       title: 'Draws' },
  { key: 'played',  label: 'GP',      title: 'Games played' },
  { key: 'points',  label: 'Pts',     title: 'Points (W=3, D=1, L=0)' },
]

const RANK_COLORS = [
  'text-yellow-400',   // 1st
  'text-white/60',     // 2nd
  'text-amber-600',    // 3rd
]

function RankBadge({ rank }) {
  if (rank === 1) return <span className="text-lg">🥇</span>
  if (rank === 2) return <span className="text-lg">🥈</span>
  if (rank === 3) return <span className="text-lg">🥉</span>
  return <span className={`font-display text-base text-white/30`}>{rank}</span>
}

function SortIcon({ col, sortBy, sortDir }) {
  if (sortBy !== col) return <ArrowUp size={10} className="text-white/20" />
  return sortDir === 'desc'
    ? <ArrowDown size={10} className="text-brand-400" />
    : <ArrowUp   size={10} className="text-brand-400" />
}

export default function LeaderboardTable({ records, onPlayerClick }) {
  const [sortBy,  setSortBy]  = useState('winPct')
  const [sortDir, setSortDir] = useState('desc')

  const handleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    else { setSortBy(col); setSortDir('desc') }
  }

  const sorted = (() => {
    const s = sortRecords(records, sortBy)
    return sortDir === 'asc' ? s.reverse() : s
  })()

  if (sorted.length === 0) {
    return (
      <div className="empty-state py-12">
        <Trophy size={28} className="empty-state-icon" />
        <p className="empty-state-title">No games yet</p>
        <p className="empty-state-desc">Log some games to build the leaderboard.</p>
      </div>
    )
  }

  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-surface-4">
      <table className="w-full text-sm border-collapse min-w-[520px]">
        <thead>
          <tr className="border-b border-surface-4 bg-surface-2">
            <th className="text-left px-4 py-3 text-white/30 text-xs font-600 uppercase tracking-wider w-8">#</th>
            <th className="text-left px-3 py-3 text-white/30 text-xs font-600 uppercase tracking-wider">Player</th>
            {COLUMNS.map(col => (
              <th key={col.key} title={col.title}
                className={`px-2 py-3 text-xs font-600 uppercase tracking-wider cursor-pointer select-none transition-colors
                  ${sortBy === col.key ? 'text-brand-400' : 'text-white/30 hover:text-white/60'}`}
                onClick={() => handleSort(col.key)}
              >
                <div className="flex items-center justify-end gap-1">
                  {col.label}
                  <SortIcon col={col.key} sortBy={sortBy} sortDir={sortDir} />
                </div>
              </th>
            ))}
            <th className="px-3 py-3 text-white/30 text-xs font-600 uppercase tracking-wider text-right">Streak</th>
          </tr>
        </thead>

        <tbody>
          {sorted.map((rec, idx) => {
            const streak = formatStreak(rec.currentStreak)
            const isTop  = idx === 0

            return (
              <tr
                key={rec.userId}
                onClick={() => onPlayerClick?.(rec)}
                className={`border-b border-surface-4 last:border-0 transition-colors cursor-pointer
                  ${isTop ? 'bg-brand-500/5' : 'hover:bg-surface-3'}`}
              >
                {/* Rank */}
                <td className="px-4 py-3 w-8">
                  <RankBadge rank={idx + 1} />
                </td>

                {/* Player */}
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar username={rec.username} avatarUrl={rec.avatar} size="sm" />
                    <span className={`font-600 truncate ${isTop ? 'text-white' : 'text-white/80'}`}>
                      {rec.username}
                    </span>
                    {isTop && <Trophy size={12} className="text-brand-400 shrink-0" />}
                  </div>
                </td>

                {/* Win % */}
                <td className="px-2 py-3 text-right">
                  <div className="flex flex-col items-end">
                    <span className={`font-display text-base leading-tight ${isTop ? 'text-brand-400' : 'text-white'}`}>
                      {fmtPct(rec.winPct)}
                    </span>
                    <span className="text-white/25 text-xs">({rec.points}pts)</span>
                  </div>
                </td>

                {/* Wins */}
                <td className="px-2 py-3 text-right">
                  <span className="text-emerald-400 font-600">{rec.wins}</span>
                </td>

                {/* Losses */}
                <td className="px-2 py-3 text-right">
                  <span className="text-red-400 font-600">{rec.losses}</span>
                </td>

                {/* Draws */}
                <td className="px-2 py-3 text-right">
                  <span className="text-yellow-400/70 font-600">{rec.draws}</span>
                </td>

                {/* Games played */}
                <td className="px-2 py-3 text-right">
                  <span className="text-white/50">{rec.played}</span>
                </td>

                {/* Points */}
                <td className="px-2 py-3 text-right">
                  <span className={`font-600 ${isTop ? 'text-brand-400' : 'text-white/70'}`}>{rec.points}</span>
                </td>

                {/* Streak */}
                <td className="px-3 py-3 text-right">
                  <span className={`font-600 text-sm ${streak.color}`}>{streak.label}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
