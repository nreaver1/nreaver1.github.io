import { useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trophy, Users, TrendingUp, PlusCircle } from 'lucide-react'
import { useAuthStore }  from '../../store/authStore'
import { useGroupStore } from '../../store/groupStore'
import { useStatsStore } from '../../store/statsStore'
import { useGameStore }  from '../../store/gameStore'
import { buildPlayerRecords, formatStreak } from '../../lib/stats'
import OnboardingPage from '../groups/OnboardingPage'
import { usePageTitle } from '../../hooks/usePageTitle'

export default function DashboardPage() {
  usePageTitle('Dashboard')
  const { user, profile }  = useAuthStore()
  const { groups, loading: groupsLoading, fetchGroups, setActiveGroup, activeGroup } = useGroupStore()
  const { games, fetchAllGames } = useStatsStore()
  const { gameTypes, fetchGameTypes } = useGameStore()
  const navigate = useNavigate()

  const group = activeGroup ?? groups[0]

  useEffect(() => { if (user) fetchGroups(user.id) }, [user])
  useEffect(() => {
    if (group) { fetchAllGames(group.id); fetchGameTypes(group.id) }
  }, [group?.id])

  // My stats in the active group
  const myRecord = useMemo(() => {
    if (!games.length || !user) return null
    const records = buildPlayerRecords(games)
    return records[user.id] ?? null
  }, [games, user])

  const streak = myRecord ? formatStreak(myRecord.currentStreak) : null

  // Recent games (newest 5)
  const recentGames = useMemo(() => [...games].reverse().slice(0, 5), [games])

  if (!groupsLoading && groups.length === 0) return <OnboardingPage />

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto lg:px-6 lg:py-8 animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <p className="text-white/40 text-sm font-600 uppercase tracking-wider mb-1">Welcome back</p>
        <h1 className="page-title">{profile?.username ?? 'Player'}</h1>
      </div>

      {/* Group switcher */}
      {groups.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white/40 text-xs uppercase tracking-wider font-600">Active Group</p>
            <Link to="/groups" className="text-brand-400 text-xs font-600 hover:text-brand-300 transition-colors">Switch →</Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {groups.map(g => (
              <button
                key={g.id}
                onClick={() => setActiveGroup(g)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-600 whitespace-nowrap transition-all shrink-0
                  ${group?.id === g.id
                    ? 'bg-brand-500/15 border-brand-500/30 text-white'
                    : 'bg-surface-2 border-surface-4 text-white/50 hover:text-white'}`}
              >
                <span className="w-5 h-5 rounded-md bg-brand-500/20 flex items-center justify-center text-brand-400 font-display text-xs">
                  {g.name[0].toUpperCase()}
                </span>
                {g.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* My stats */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <div className="stat-card">
          <span className="stat-value text-emerald-400">{myRecord?.wins ?? '—'}</span>
          <span className="stat-label">Wins</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-red-400">{myRecord?.losses ?? '—'}</span>
          <span className="stat-label">Losses</span>
        </div>
        <div className="stat-card">
          <span className="stat-value text-brand-400">
            {myRecord ? `${Math.round(myRecord.winPct)}%` : '—'}
          </span>
          <span className="stat-label">Win %</span>
        </div>
        <div className="stat-card">
          <span className={`stat-value ${streak?.color ?? 'text-white/30'}`}>
            {streak?.label ?? '—'}
          </span>
          <span className="stat-label">Streak</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <Link to="/log" className="card-hover p-4 flex flex-col gap-2">
          <div className="w-9 h-9 bg-brand-500/20 rounded-xl flex items-center justify-center">
            <PlusCircle size={18} className="text-brand-400" />
          </div>
          <p className="font-600 text-white text-sm">Log a Game</p>
          <p className="text-white/30 text-xs">Record a new result</p>
        </Link>

        <Link to="/groups" className="card-hover p-4 flex flex-col gap-2">
          <div className="w-9 h-9 bg-purple-500/20 rounded-xl flex items-center justify-center">
            <Users size={18} className="text-purple-400" />
          </div>
          <p className="font-600 text-white text-sm">My Groups</p>
          <p className="text-white/30 text-xs">View your crews</p>
        </Link>

        <Link to="/stats" className="card-hover p-4 flex flex-col gap-2">
          <div className="w-9 h-9 bg-yellow-500/20 rounded-xl flex items-center justify-center">
            <Trophy size={18} className="text-yellow-400" />
          </div>
          <p className="font-600 text-white text-sm">Leaderboard</p>
          <p className="text-white/30 text-xs">See who's on top</p>
        </Link>

        <Link to="/stats?tab=h2h" className="card-hover p-4 flex flex-col gap-2">
          <div className="w-9 h-9 bg-sky-500/20 rounded-xl flex items-center justify-center">
            <TrendingUp size={18} className="text-sky-400" />
          </div>
          <p className="font-600 text-white text-sm">Head-to-Head</p>
          <p className="text-white/30 text-xs">Your rivalries</p>
        </Link>
      </div>

      {/* Recent games */}
      <div className="mb-2 flex items-center justify-between">
        <h2 className="section-title">Recent Games</h2>
        <Link to="/stats" className="text-brand-400 text-sm font-600 hover:text-brand-300 transition-colors">See all</Link>
      </div>

      {recentGames.length === 0 ? (
        <div className="empty-state card">
          <Trophy size={32} className="empty-state-icon" />
          <p className="empty-state-title">No games yet</p>
          <p className="empty-state-desc">Log your first game to start tracking wins and losses.</p>
          <Link to="/log" className="btn-primary mt-2">Log a Game</Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {recentGames.map(game => {
            const winners = (game.game_teams ?? []).filter(t => t.is_winner)
            const winnerNames = winners
              .flatMap(t => t.game_participants ?? [])
              .map(p => p.profiles?.username)
              .filter(Boolean)
              .join(', ')

            return (
              <div key={game.id} className="card px-4 py-3 flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
                  ${game.is_draw ? 'bg-yellow-500/20' : 'bg-emerald-500/20'}`}>
                  <Trophy size={14} className={game.is_draw ? 'text-yellow-400' : 'text-emerald-400'} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-600 text-white text-sm truncate">{game.game_types?.name}</p>
                  <p className="text-white/30 text-xs truncate">
                    {game.is_draw ? 'Draw' : winnerNames ? `${winnerNames} won` : ''}
                  </p>
                </div>
                <p className="text-white/25 text-xs shrink-0">
                  {new Date(game.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
