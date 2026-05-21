import { useState, useMemo } from 'react'
import { Trophy, Minus, Trash2, ChevronDown, ChevronUp, Shield, Share2, Copy, Check, Filter } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useGroupStore } from '../../store/groupStore'
import { useGameStore }  from '../../store/gameStore'
import { useStatsStore } from '../../store/statsStore'
import { useToast }      from '../../components/ui/Toast'
import Avatar            from '../ui/Avatar'

const PAGE_SIZE = 15

function buildShareText(game) {
  const teams    = game.game_teams ?? []
  const gameName = game.game_types?.name ?? 'a game'
  if (game.is_draw) {
    const players = teams.flatMap(t => t.game_participants ?? []).map(p => p.profiles?.username).filter(Boolean)
    return `🤝 ${players.join(', ')} drew at ${gameName} · Keep Track`
  }
  const winnerTeam  = teams.find(t => t.is_winner)
  const loserTeams  = teams.filter(t => !t.is_winner)
  const winners     = (winnerTeam?.game_participants ?? []).map(p => p.profiles?.username).filter(Boolean)
  const losers      = loserTeams.flatMap(t => t.game_participants ?? []).map(p => p.profiles?.username).filter(Boolean)
  const winStr      = winners.length ? winners.join(' & ') : 'Someone'
  const loseStr     = losers.length  ? ` beat ${losers.join(' & ')}` : ''
  const scoreStr    = (winnerTeam?.score != null && loserTeams[0]?.score != null) ? ` ${winnerTeam.score}–${loserTeams[0].score}` : ''
  return `🏆 ${winStr}${loseStr}${scoreStr} at ${gameName} · Keep Track`
}

function ShareButton({ game }) {
  const [shared, setShared] = useState(false)
  const handle = async (e) => {
    e.stopPropagation()
    const text = buildShareText(game)
    if (navigator.share) {
      try { await navigator.share({ text }) } catch (_) {}
    } else {
      await navigator.clipboard.writeText(text)
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    }
  }
  return (
    <button onClick={handle} className="btn-ghost btn-sm text-white/30 hover:text-white/70 gap-1" title="Share result">
      {shared ? <Check size={12} className="text-emerald-400" /> : navigator.share ? <Share2 size={12} /> : <Copy size={12} />}
    </button>
  )
}

function GameCard({ game, isAdmin, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const teams        = game.game_teams ?? []
  const winners      = teams.filter(t => t.is_winner)
  const gameName     = game.game_types?.name ?? 'Unknown'
  const date         = new Date(game.played_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const time         = new Date(game.played_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const winnerTeam   = teams.find(t => t.is_winner)
  const topLoserTeam = teams.filter(t => !t.is_winner)[0]
  const scoreStr     = (winnerTeam?.score != null && topLoserTeam?.score != null) ? `${winnerTeam.score}–${topLoserTeam.score}` : null

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setExpanded(e => !e)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-3 transition-colors text-left">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${game.is_draw ? 'bg-yellow-500/20' : 'bg-emerald-500/20'}`}>
          {game.is_draw ? <Minus size={14} className="text-yellow-400" /> : <Trophy size={14} className="text-emerald-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-600 text-white text-sm truncate">{gameName}</p>
          <p className="text-white/30 text-xs mt-0.5">{date} · {time}</p>
        </div>
        {!expanded && (
          <div className="text-right shrink-0 hidden sm:block">
            {game.is_draw ? (
              <span className="text-yellow-400 text-xs font-600">Draw</span>
            ) : winners.length > 0 && (
              <div className="flex flex-col items-end gap-0.5">
                <p className="text-emerald-400 text-xs font-600 max-w-[120px] truncate">
                  {winners.flatMap(t => t.game_participants ?? []).map(p => p.profiles?.username).filter(Boolean).slice(0, 2).join(', ')}{winners.flatMap(t => t.game_participants ?? []).length > 2 ? ' +more' : ''} won
                </p>
                {scoreStr && <span className="text-white/30 text-xs font-mono">{scoreStr}</span>}
              </div>
            )}
          </div>
        )}
        {expanded ? <ChevronUp size={14} className="text-white/30 shrink-0" /> : <ChevronDown size={14} className="text-white/30 shrink-0" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-4 pt-3 animate-slide-down">
          <div className="flex flex-col gap-2 mb-3">
            {teams.map(team => {
              const players = team.game_participants ?? []
              return (
                <div key={team.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${team.is_winner && !game.is_draw ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-surface-3'}`}>
                  {team.is_winner && !game.is_draw ? <Trophy size={12} className="text-emerald-400 shrink-0" /> : game.is_draw ? <Minus size={12} className="text-yellow-400 shrink-0" /> : <div className="w-3 h-3 rounded-full border border-white/20 shrink-0" />}
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <div className="flex -space-x-1.5">
                      {players.slice(0, 4).map(p => (
                        <Avatar key={p.user_id} username={p.profiles?.username} avatarUrl={p.profiles?.avatar_url} size="xs" className="ring-1 ring-surface-2" />
                      ))}
                    </div>
                    <span className={`text-sm truncate ${team.is_winner && !game.is_draw ? 'text-white font-600' : 'text-white/60'}`}>
                      {players.map(p => p.profiles?.username).filter(Boolean).join(', ') || 'Unknown'}
                    </span>
                  </div>
                  {team.score !== null && team.score !== undefined && (
                    <span className={`font-mono text-sm font-600 shrink-0 ${team.is_winner && !game.is_draw ? 'text-emerald-400' : 'text-white/40'}`}>{team.score}</span>
                  )}
                </div>
              )
            })}
          </div>
          {game.notes && <p className="text-white/40 text-xs italic mb-3">"{game.notes}"</p>}
          <div className="flex items-center justify-between">
            <p className="text-white/20 text-xs">Logged by {game.profiles?.username}</p>
            <div className="flex items-center gap-1">
              <ShareButton game={game} />
              {isAdmin && (
                <button onClick={() => onDelete(game)} className="btn-danger btn-sm gap-1">
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function GameHistory({ games, groupId }) {
  const { user }       = useAuthStore()
  const { members }    = useGroupStore()
  const { deleteGame } = useGameStore()
  const { invalidate } = useStatsStore()
  const toast          = useToast()

  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting,      setDeleting]      = useState(false)
  const [filterType,    setFilterType]    = useState(null)
  const [filterPlayer,  setFilterPlayer]  = useState(null)
  const [page,          setPage]          = useState(1)

  const myRole  = members.find(m => m.id === user?.id)?.role
  const isAdmin = myRole === 'admin'

  const gameTypes = useMemo(() => [...new Map(
    games.map(g => g.game_types).filter(Boolean).map(gt => [gt.id, gt])
  ).values()], [games])

  const players = useMemo(() => {
    const map = new Map()
    for (const g of games) {
      for (const team of g.game_teams ?? []) {
        for (const p of team.game_participants ?? []) {
          if (p.profiles && !map.has(p.user_id)) {
            map.set(p.user_id, { id: p.user_id, username: p.profiles.username, avatar_url: p.profiles.avatar_url })
          }
        }
      }
    }
    return [...map.values()].sort((a, b) => a.username.localeCompare(b.username))
  }, [games])

  const showFilters = gameTypes.length > 1 || players.length > 2

  const filtered = useMemo(() => {
    let result = [...games].reverse()
    if (filterType)   result = result.filter(g => g.game_types?.id === filterType)
    if (filterPlayer) result = result.filter(g => (g.game_teams ?? []).some(t => (t.game_participants ?? []).some(p => p.user_id === filterPlayer)))
    return result
  }, [games, filterType, filterPlayer])

  const paginated    = filtered.slice(0, page * PAGE_SIZE)
  const hasMore      = paginated.length < filtered.length
  const activeFilters = [filterType, filterPlayer].filter(Boolean).length

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    const result = await deleteGame(confirmDelete.id, user.id, groupId)
    if (result?.error) { toast.error('Failed to delete game.') } else { invalidate(); toast.success('Game deleted.') }
    setDeleting(false)
    setConfirmDelete(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {showFilters && (
        <div className="flex flex-col gap-2">
          {gameTypes.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button onClick={() => { setFilterType(null); setPage(1) }} className={`px-3 py-1.5 rounded-xl border text-xs font-600 whitespace-nowrap transition-all shrink-0 ${!filterType ? 'bg-brand-500/15 border-brand-500/30 text-brand-400' : 'bg-surface-2 border-surface-4 text-white/40 hover:text-white'}`}>All Games</button>
              {gameTypes.map(gt => (
                <button key={gt.id} onClick={() => { setFilterType(gt.id); setPage(1) }} className={`px-3 py-1.5 rounded-xl border text-xs font-600 whitespace-nowrap transition-all shrink-0 ${filterType === gt.id ? 'bg-brand-500/15 border-brand-500/30 text-brand-400' : 'bg-surface-2 border-surface-4 text-white/40 hover:text-white'}`}>{gt.name}</button>
              ))}
            </div>
          )}
          {players.length > 2 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button onClick={() => { setFilterPlayer(null); setPage(1) }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-600 whitespace-nowrap transition-all shrink-0 ${!filterPlayer ? 'bg-surface-3 border-surface-4 text-white/60' : 'bg-surface-2 border-surface-4 text-white/30 hover:text-white'}`}><Filter size={10} /> All Players</button>
              {players.map(p => (
                <button key={p.id} onClick={() => { setFilterPlayer(p.id); setPage(1) }} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-600 whitespace-nowrap transition-all shrink-0 ${filterPlayer === p.id ? 'bg-purple-500/15 border-purple-500/30 text-purple-400' : 'bg-surface-2 border-surface-4 text-white/40 hover:text-white'}`}>
                  <Avatar username={p.username} avatarUrl={p.avatar_url} size="xs" />{p.username}
                </button>
              ))}
            </div>
          )}
          {activeFilters > 0 && (
            <button onClick={() => { setFilterType(null); setFilterPlayer(null); setPage(1) }} className="text-white/30 text-xs hover:text-white/60 transition-colors self-start">Clear filters ×</button>
          )}
        </div>
      )}

      {(filterType || filterPlayer) && (
        <p className="text-white/25 text-xs">{filtered.length} {filtered.length === 1 ? 'game' : 'games'} found</p>
      )}

      {filtered.length === 0 ? (
        <div className="empty-state py-12">
          <Trophy size={28} className="empty-state-icon" />
          <p className="empty-state-title">No games found</p>
          <p className="empty-state-desc">{filterType || filterPlayer ? 'Try clearing your filters.' : 'Log your first game to see history here.'}</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {paginated.map(game => <GameCard key={game.id} game={game} isAdmin={isAdmin} onDelete={setConfirmDelete} />)}
          </div>
          {hasMore && (
            <button onClick={() => setPage(p => p + 1)} className="btn-secondary w-full">
              Show more ({filtered.length - paginated.length} remaining)
            </button>
          )}
        </>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-surface-2 border border-surface-4 rounded-2xl p-5 animate-slide-up">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={16} className="text-brand-400" />
              <h3 className="font-display text-xl text-white">Delete Game?</h3>
            </div>
            <p className="text-white/50 text-sm mb-1">This will permanently delete the <span className="text-white font-600">{confirmDelete.game_types?.name}</span> game from {new Date(confirmDelete.played_at).toLocaleDateString()}.</p>
            <p className="text-white/30 text-xs mb-5">This action is logged and cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleDelete} className="btn-danger flex-1" disabled={deleting}>{deleting ? <span className="spinner" /> : <><Trash2 size={14} /> Delete</>}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
