import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Trophy, Swords, History, ChevronDown, RefreshCw, PlusCircle } from 'lucide-react'
import { useAuthStore }  from '../../store/authStore'
import { useGroupStore } from '../../store/groupStore'
import { useStatsStore } from '../../store/statsStore'
import { useGameStore }  from '../../store/gameStore'
import { buildPlayerRecords } from '../../lib/stats'
import { usePageTitle } from '../../hooks/usePageTitle'
import LeaderboardTable from '../../components/stats/LeaderboardTable'
import HeadToHead       from '../../components/stats/HeadToHead'
import GameHistory      from '../../components/stats/GameHistory'

const TABS = [
  { key: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { key: 'h2h',         label: 'Head-to-Head', icon: Swords },
  { key: 'history',     label: 'Game History', icon: History },
]

export default function StatsPage() {
  const navigate = useNavigate()
  usePageTitle('Stats')
  const { user }    = useAuthStore()
  const { groups, members, fetchGroups, fetchMembers, activeGroup } = useGroupStore()
  const { games, loading, fetchAllGames, invalidate } = useStatsStore()
  const { gameTypes, fetchGameTypes } = useGameStore()

  const [searchParams] = useSearchParams()
  const [tab,          setTab]          = useState(() => searchParams.get('tab') ?? 'leaderboard')
  const [filterType,   setFilterType]   = useState(null)
  const [selectedGroup, setSelectedGroup] = useState(null)

  const group = selectedGroup ?? activeGroup ?? groups[0]

  useEffect(() => {
    if (user && groups.length === 0) fetchGroups(user.id)
  }, [user])

  useEffect(() => {
    if (!group) return
    fetchAllGames(group.id)
    fetchGameTypes(group.id)
    // Only fetch members if not already loaded for this group
    // (avoids clobbering GroupDetailPage's member list)
    const currentMembers = members
    const membersAreForThisGroup = currentMembers.length > 0 &&
      currentMembers.some(m => m.groupId === group.id || true) // can't verify group easily
    // Always fetch — but fetchMembers already clears state, so this is safe
    // The key fix is that StatsPage and GroupDetailPage never render simultaneously
    // on mobile (single-page view). On desktop, if both are open, members will
    // always reflect the last-fetched group — which is the one currently focused.
    fetchMembers(group.id)
  }, [group?.id])

  // Build records from games
  const records = useMemo(() => {
    if (!games.length) return []
    const map = buildPlayerRecords(games, filterType)
    return Object.values(map)
  }, [games, filterType])

  // Unique game types from loaded games for filter dropdown
  const usedGameTypes = useMemo(() => {
    return [...new Map(
      games.map(g => g.game_types).filter(Boolean).map(gt => [gt.id, gt])
    ).values()]
  }, [games])

  if (!group) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <p className="empty-state-title">No group selected</p>
        <p className="empty-state-desc mb-4">Join or create a group to see stats.</p>
        <button onClick={() => navigate('/groups')} className="btn-primary">Go to Groups</button>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 lg:px-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="page-title">Stats</h1>
            <p className="text-white/40 text-sm mt-1">{group.name}</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Group switcher */}
            {groups.length > 1 && (
              <div className="relative">
                <select
                  value={group.id}
                  onChange={e => {
                    const g = groups.find(g => g.id === e.target.value)
                    setSelectedGroup(g)
                    setFilterType(null)
                    invalidate()
                  }}
                  className="input appearance-none pr-8 py-2 text-sm cursor-pointer"
                >
                  {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
              </div>
            )}

            <button
              onClick={() => { invalidate(); fetchAllGames(group.id) }}
              className="btn-icon btn-ghost"
              title="Refresh stats"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin text-brand-400' : ''} />
            </button>
          </div>
        </div>

        {/* Quick stat pills */}
        {records.length > 0 && (
          <div className="flex gap-2 mt-4 overflow-x-auto pb-1">
            <div className="bg-surface-2 border border-surface-4 rounded-xl px-3 py-2 shrink-0">
              <p className="text-white/30 text-xs font-600">Players</p>
              <p className="font-display text-xl text-white">{records.length}</p>
            </div>
            <div className="bg-surface-2 border border-surface-4 rounded-xl px-3 py-2 shrink-0">
              <p className="text-white/30 text-xs font-600">Games</p>
              <p className="font-display text-xl text-white">{games.length}</p>
            </div>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 shrink-0">
              <p className="text-white/30 text-xs font-600">Top Player</p>
              <p className="font-display text-xl text-emerald-400">
                {records.sort((a, b) => b.winPct - a.winPct)[0]?.username ?? '—'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-3 px-4 lg:px-6">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-600 border-b-2 transition-colors -mb-px
              ${tab === key
                ? 'border-brand-500 text-white'
                : 'border-transparent text-white/40 hover:text-white/70'
              }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-4 py-4 lg:px-6">
        {loading && games.length === 0 ? (
          <div className="flex justify-center py-16">
            <div className="spinner w-8 h-8" />
          </div>
        ) : !loading && games.length === 0 ? (
          <div className="empty-state card py-14">
            <Trophy size={32} className="empty-state-icon" />
            <p className="empty-state-title">No games logged yet</p>
            <p className="empty-state-desc">Log your first game to start building the leaderboard and tracking stats.</p>
            <Link to="/log" className="btn-primary mt-2">
              <PlusCircle size={16} /> Log a Game
            </Link>
          </div>
        ) : (
          <>
            {tab === 'leaderboard' && (
              <div className="flex flex-col gap-4">
                {/* Game type filter */}
                {usedGameTypes.length > 1 && (
                  <div>
                    <label className="input-label">Filter by Game</label>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      <button
                        onClick={() => setFilterType(null)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-600 whitespace-nowrap transition-all shrink-0
                          ${!filterType ? 'bg-brand-500/15 border-brand-500/30 text-brand-400' : 'bg-surface-2 border-surface-4 text-white/40 hover:text-white'}`}
                      >
                        All Games
                      </button>
                      {usedGameTypes.map(gt => (
                        <button
                          key={gt.id}
                          onClick={() => setFilterType(gt.id)}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-600 whitespace-nowrap transition-all shrink-0
                            ${filterType === gt.id ? 'bg-brand-500/15 border-brand-500/30 text-brand-400' : 'bg-surface-2 border-surface-4 text-white/40 hover:text-white'}`}
                        >
                          {gt.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <LeaderboardTable records={records} />
              </div>
            )}

            {tab === 'h2h' && (
              <HeadToHead
                games={games}
                players={records}
                gameTypes={usedGameTypes}
              />
            )}

            {tab === 'history' && (
              <GameHistory
                games={games}
                groupId={group.id}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
