import { useState, useMemo } from 'react'
import { Swords, ChevronDown } from 'lucide-react'
import { headToHead, fmtPct } from '../../lib/stats'
import Avatar from '../ui/Avatar'

function PlayerPicker({ players, value, onChange, exclude }) {
  return (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={e => onChange(e.target.value || null)}
        className="input appearance-none pr-8 cursor-pointer"
      >
        <option value="">Pick a player...</option>
        {players
          .filter(p => p.userId !== exclude)
          .map(p => (
            <option key={p.userId} value={p.userId}>{p.username}</option>
          ))
        }
      </select>
      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
    </div>
  )
}

export default function HeadToHead({ games, players, gameTypes }) {
  const [playerA,    setPlayerA]    = useState(null)
  const [playerB,    setPlayerB]    = useState(null)
  const [filterType, setFilterType] = useState(null)

  const result = useMemo(() => {
    if (!playerA || !playerB) return null
    return headToHead(games, playerA, playerB, filterType)
  }, [games, playerA, playerB, filterType])

  const pA = players.find(p => p.userId === playerA)
  const pB = players.find(p => p.userId === playerB)

  return (
    <div className="flex flex-col gap-4">
      {/* Player pickers */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="input-label">Player 1</label>
          <PlayerPicker players={players} value={playerA} onChange={setPlayerA} exclude={playerB} />
        </div>
        <div>
          <label className="input-label">Player 2</label>
          <PlayerPicker players={players} value={playerB} onChange={setPlayerB} exclude={playerA} />
        </div>
      </div>

      {/* Game type filter */}
      <div>
        <label className="input-label">Filter by Game <span className="text-white/20 normal-case tracking-normal font-normal">(optional)</span></label>
        <div className="relative">
          <select
            value={filterType ?? ''}
            onChange={e => setFilterType(e.target.value || null)}
            className="input appearance-none pr-8 cursor-pointer"
          >
            <option value="">All games</option>
            {gameTypes.map(gt => (
              <option key={gt.id} value={gt.id}>{gt.name}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
        </div>
      </div>

      {/* No selection */}
      {(!playerA || !playerB) && (
        <div className="empty-state py-8 card">
          <Swords size={28} className="empty-state-icon" />
          <p className="empty-state-title">Select two players</p>
          <p className="empty-state-desc">Pick players above to see their head-to-head record.</p>
        </div>
      )}

      {/* No games between them */}
      {result && result.total === 0 && (
        <div className="card p-5 text-center">
          <p className="text-white/50 text-sm">
            {pA?.username} and {pB?.username} haven't played each other yet
            {filterType ? ' in that game' : ''}.
          </p>
        </div>
      )}

      {/* H2H result */}
      {result && result.total > 0 && (
        <div className="flex flex-col gap-3 animate-slide-up">
          {/* Score card */}
          <div className="card p-5">
            <div className="flex items-center justify-between gap-4">
              {/* Player A */}
              <div className="flex-1 text-center">
                <div className="mx-auto mb-2 flex justify-center">
                  <Avatar username={pA?.username} avatarUrl={pA?.avatar_url} size="lg" />
                </div>
                <p className="font-600 text-white text-sm truncate">{pA?.username}</p>
                <p className="font-display text-4xl text-white mt-1">{result.aWins}</p>
                <p className="text-brand-400 text-sm font-600">{fmtPct(result.aWinPct)}</p>
              </div>

              {/* VS */}
              <div className="flex flex-col items-center gap-1 shrink-0">
                <Swords size={20} className="text-white/20" />
                <span className="font-display text-lg text-white/20">VS</span>
                {result.draws > 0 && (
                  <span className="text-yellow-400/60 text-xs font-600">{result.draws}D</span>
                )}
                <span className="text-white/20 text-xs">{result.total} games</span>
              </div>

              {/* Player B */}
              <div className="flex-1 text-center">
                <div className="mx-auto mb-2 flex justify-center">
                  <Avatar username={pB?.username} avatarUrl={pB?.avatar_url} size="lg" />
                </div>
                <p className="font-600 text-white text-sm truncate">{pB?.username}</p>
                <p className="font-display text-4xl text-white mt-1">{result.bWins}</p>
                <p className="text-purple-400 text-sm font-600">{fmtPct(result.bWinPct)}</p>
              </div>
            </div>

            {/* Win bar */}
            <div className="mt-4 h-2 rounded-full bg-surface-4 overflow-hidden flex">
              <div
                className="h-full bg-brand-500 transition-all duration-500 rounded-l-full"
                style={{ width: `${result.aWinPct}%` }}
              />
              {result.draws > 0 && (
                <div
                  className="h-full bg-yellow-500 transition-all duration-500"
                  style={{ width: `${Math.round((result.draws / result.total) * 100)}%` }}
                />
              )}
              <div
                className="h-full bg-purple-500 transition-all duration-500 rounded-r-full flex-1"
              />
            </div>

            {/* Dominant message */}
            <p className="text-center text-white/40 text-xs mt-3">
              {result.aWins > result.bWins
                ? <><span className="text-white font-600">{pA?.username}</span> leads this rivalry</>
                : result.bWins > result.aWins
                  ? <><span className="text-white font-600">{pB?.username}</span> leads this rivalry</>
                  : 'Perfectly even rivalry'
              }
              {filterType && gameTypes.find(g => g.id === filterType)
                ? <> in <span className="text-white font-600">{gameTypes.find(g => g.id === filterType)?.name}</span></>
                : null
              }
            </p>
          </div>

          {/* Recent shared games */}
          {result.recentGames.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-white/40 text-xs uppercase tracking-wider font-600">Recent Matchups</p>
              {result.recentGames.slice(0, 5).reverse().map(({ game, outcome }) => (
                <div key={game.id} className="card px-4 py-3 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full shrink-0
                    ${outcome === 'aWin'  ? 'bg-brand-500'  :
                      outcome === 'bWin'  ? 'bg-purple-500' : 'bg-yellow-500'}`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-white/70 text-sm font-600">{game.game_types?.name}</p>
                    <p className="text-white/30 text-xs">
                      {new Date(game.played_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`text-xs font-600
                    ${outcome === 'aWin'  ? 'text-brand-400'  :
                      outcome === 'bWin'  ? 'text-purple-400' : 'text-yellow-400'}`}>
                    {outcome === 'aWin'  ? `${pA?.username} won` :
                     outcome === 'bWin'  ? `${pB?.username} won` : 'Draw'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
