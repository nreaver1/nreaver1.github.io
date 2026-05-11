import { useState } from 'react'
import { Trophy, Minus, Trash2, ChevronDown, ChevronUp, Shield } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useGroupStore } from '../../store/groupStore'
import { useGameStore }  from '../../store/gameStore'
import { useStatsStore } from '../../store/statsStore'
import { useToast } from '../../components/ui/Toast'

function GameCard({ game, isAdmin, onDelete }) {
  const [expanded, setExpanded] = useState(false)

  const teams    = game.game_teams ?? []
  const winners  = teams.filter(t => t.is_winner)
  const gameName = game.game_types?.name ?? 'Unknown'
  const date     = new Date(game.played_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
  const time = new Date(game.played_at).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit'
  })

  return (
    <div className="card overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-3 transition-colors text-left"
      >
        {/* Result icon */}
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0
          ${game.is_draw ? 'bg-yellow-500/20' : 'bg-emerald-500/20'}`}>
          {game.is_draw
            ? <Minus size={14} className="text-yellow-400" />
            : <Trophy size={14} className="text-emerald-400" />
          }
        </div>

        {/* Game info */}
        <div className="flex-1 min-w-0">
          <p className="font-600 text-white text-sm truncate">{gameName}</p>
          <p className="text-white/30 text-xs mt-0.5">
            {date} · {time}
          </p>
        </div>

        {/* Winner names (collapsed) */}
        {!expanded && !game.is_draw && winners.length > 0 && (
          <div className="text-right shrink-0 hidden sm:block">
            <p className="text-emerald-400 text-xs font-600">
              {winners.flatMap(t => t.game_participants ?? [])
                .map(p => p.profiles?.username)
                .filter(Boolean)
                .join(', ')} won
            </p>
          </div>
        )}
        {!expanded && game.is_draw && (
          <span className="text-yellow-400 text-xs font-600 shrink-0">Draw</span>
        )}

        {expanded
          ? <ChevronUp   size={14} className="text-white/30 shrink-0" />
          : <ChevronDown size={14} className="text-white/30 shrink-0" />
        }
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-surface-4 pt-3 animate-slide-down">
          <div className="flex flex-col gap-2 mb-3">
            {teams.map((team, idx) => {
              const players = (team.game_participants ?? [])
                .map(p => p.profiles?.username)
                .filter(Boolean)
                .join(', ')

              return (
                <div key={team.id} className={`flex items-center gap-3 px-3 py-2 rounded-xl
                  ${team.is_winner && !game.is_draw ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-surface-3'}`}>
                  {team.is_winner && !game.is_draw
                    ? <Trophy size={12} className="text-emerald-400 shrink-0" />
                    : game.is_draw
                      ? <Minus  size={12} className="text-yellow-400 shrink-0" />
                      : <div className="w-3 h-3 rounded-full border border-white/20 shrink-0" />
                  }
                  <span className={`text-sm flex-1 truncate ${team.is_winner && !game.is_draw ? 'text-white font-600' : 'text-white/60'}`}>
                    {players || 'Unknown'}
                  </span>
                  {team.score !== null && team.score !== undefined && (
                    <span className={`font-mono text-sm font-600 shrink-0
                      ${team.is_winner && !game.is_draw ? 'text-emerald-400' : 'text-white/40'}`}>
                      {team.score}
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {game.notes && (
            <p className="text-white/40 text-xs italic mb-3">"{game.notes}"</p>
          )}

          <div className="flex items-center justify-between">
            <p className="text-white/20 text-xs">
              Logged by {game.profiles?.username}
            </p>
            {isAdmin && (
              <button
                onClick={() => onDelete(game)}
                className="btn-danger btn-sm gap-1"
              >
                <Trash2 size={12} /> Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function GameHistory({ games, groupId }) {
  const { user }    = useAuthStore()
  const { members } = useGroupStore()
  const { deleteGame } = useGameStore()
  const { invalidate } = useStatsStore()

  const toast = useToast()
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting]           = useState(false)
  const [filterType, setFilterType]       = useState(null)

  const myRole  = members.find(m => m.id === user?.id)?.role
  const isAdmin = myRole === 'admin'

  // Unique game types in this history for filter
  const gameTypes = [...new Map(
    games.map(g => g.game_types).filter(Boolean).map(gt => [gt.id, gt])
  ).values()]

  const filtered = filterType
    ? games.filter(g => g.game_types?.id === filterType)
    : games

  const handleDelete = async () => {
    if (!confirmDelete) return
    setDeleting(true)
    await deleteGame(confirmDelete.id, user.id, groupId)
    invalidate()
    setDeleting(false)
    setConfirmDelete(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Game type filter */}
      {gameTypes.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            onClick={() => setFilterType(null)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-600 whitespace-nowrap transition-all shrink-0
              ${!filterType ? 'bg-brand-500/15 border-brand-500/30 text-brand-400' : 'bg-surface-2 border-surface-4 text-white/40 hover:text-white'}`}
          >
            All Games
          </button>
          {gameTypes.map(gt => (
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
      )}

      {/* Games */}
      {filtered.length === 0 ? (
        <div className="empty-state py-12">
          <Trophy size={28} className="empty-state-icon" />
          <p className="empty-state-title">No games found</p>
          <p className="empty-state-desc">
            {filterType ? 'No games of this type yet.' : 'Log your first game to see history here.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map(game => (
            <GameCard
              key={game.id}
              game={game}
              isAdmin={isAdmin}
              onDelete={setConfirmDelete}
            />
          ))}
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-surface-2 border border-surface-4 rounded-2xl p-5 animate-slide-up">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={16} className="text-brand-400" />
              <h3 className="font-display text-xl text-white">Delete Game?</h3>
            </div>
            <p className="text-white/50 text-sm mb-1">
              This will permanently delete the <span className="text-white font-600">{confirmDelete.game_types?.name}</span> game
              from {new Date(confirmDelete.played_at).toLocaleDateString()}.
            </p>
            <p className="text-white/30 text-xs mb-5">This action is logged and cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleDelete} className="btn-danger flex-1" disabled={deleting}>
                {deleting ? <span className="spinner" /> : <><Trash2 size={14} /> Delete</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
