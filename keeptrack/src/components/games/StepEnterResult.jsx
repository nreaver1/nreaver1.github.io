import { useState } from 'react'
import { Trophy, Minus, CheckCircle } from 'lucide-react'

const TEAM_COLORS = {
  A: { bg: 'bg-brand-500/20',   border: 'border-brand-500/30',   text: 'text-brand-400',   win: 'bg-brand-500',   winText: 'text-white' },
  B: { bg: 'bg-purple-500/20',  border: 'border-purple-500/30',  text: 'text-purple-400',  win: 'bg-purple-500',  winText: 'text-white' },
  C: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400', win: 'bg-emerald-500', winText: 'text-white' },
  D: { bg: 'bg-yellow-500/20',  border: 'border-yellow-500/30',  text: 'text-yellow-400',  win: 'bg-yellow-500',  winText: 'text-white' },
}

// For FFA — each player is their own "team", use index-based colors
const FFA_COLORS = [
  { bg: 'bg-brand-500/20',   border: 'border-brand-500/30',   text: 'text-brand-400',   win: 'bg-brand-500',   winText: 'text-white' },
  { bg: 'bg-purple-500/20',  border: 'border-purple-500/30',  text: 'text-purple-400',  win: 'bg-purple-500',  winText: 'text-white' },
  { bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400', win: 'bg-emerald-500', winText: 'text-white' },
  { bg: 'bg-yellow-500/20',  border: 'border-yellow-500/30',  text: 'text-yellow-400',  win: 'bg-yellow-500',  winText: 'text-white' },
  { bg: 'bg-sky-500/20',     border: 'border-sky-500/30',     text: 'text-sky-400',     win: 'bg-sky-500',     winText: 'text-white' },
  { bg: 'bg-pink-500/20',    border: 'border-pink-500/30',    text: 'text-pink-400',    win: 'bg-pink-500',    winText: 'text-white' },
]

export default function StepEnterResult({ teams, isTeamMode, gameType, onConfirm }) {
  const isNumeric    = gameType.scoring_type === 'numeric'
  const allowsDraws  = gameType.allows_draws

  const [winners,  setWinners]  = useState(new Set())
  const [scores,   setScores]   = useState({})
  const [isDraw,   setIsDraw]   = useState(false)
  const [error,    setError]    = useState('')

  const getColor = (team, idx) => {
    if (isTeamMode) return TEAM_COLORS[team.key] ?? TEAM_COLORS.A
    return FFA_COLORS[idx % FFA_COLORS.length]
  }

  const toggleWinner = (teamKey) => {
    if (isDraw) return
    setError('')
    setWinners(prev => {
      const next = new Set(prev)
      next.has(teamKey) ? next.delete(teamKey) : next.add(teamKey)
      return next
    })
  }

  const handleDraw = () => {
    setIsDraw(d => {
      if (!d) setWinners(new Set()) // clear winners when enabling draw
      return !d
    })
  }

  const handleConfirm = () => {
    if (!isDraw && winners.size === 0) {
      setError('Mark at least one winner, or select Draw.')
      return
    }

    const resultTeams = teams.map(team => ({
      ...team,
      isWinner: isDraw ? false : winners.has(team.key),
      score:    isNumeric ? (parseFloat(scores[team.key]) || null) : null,
    }))

    onConfirm({ teams: resultTeams, isDrawn: isDraw })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pb-4">

        {/* Draw toggle */}
        {allowsDraws && (
          <button
            onClick={handleDraw}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border mb-4 transition-all
              ${isDraw
                ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                : 'bg-surface-2 border-surface-4 text-white/50 hover:text-white'
              }`}
          >
            <div className="flex items-center gap-2">
              <Minus size={16} />
              <span className="font-600 text-sm">Mark as Draw</span>
            </div>
            <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all
              ${isDraw ? 'bg-yellow-500 border-yellow-500' : 'border-surface-5'}`}>
              {isDraw && <CheckCircle size={12} className="text-white" />}
            </div>
          </button>
        )}

        {/* Instruction */}
        <div className="flex items-center gap-2 bg-surface-2 border border-surface-4 rounded-xl px-3 py-2.5 mb-4">
          <Trophy size={13} className="text-white/40 shrink-0" />
          <p className="text-white/50 text-xs">
            {isDraw
              ? 'Draw selected — no winners will be recorded.'
              : isTeamMode
                ? 'Tap a team to mark them as winner. Multiple winners allowed.'
                : 'Tap a player to mark them as winner. Multiple winners allowed.'
            }
          </p>
        </div>

        {/* Team / player result cards */}
        <div className="flex flex-col gap-3">
          {teams.map((team, idx) => {
            const color     = getColor(team, idx)
            const isWinner  = winners.has(team.key)
            const playerNames = team.playerIds
              .map(id => team._members?.find(m => m.id === id)?.username ?? id)
              .join(' & ')

            return (
              <div
                key={team.key}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden
                  ${isWinner && !isDraw
                    ? `${color.win} border-transparent`
                    : `${color.bg} ${color.border}`
                  }`}
              >
                {/* Winner toggle header */}
                <button
                  onClick={() => toggleWinner(team.key)}
                  disabled={isDraw}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                    ${isDraw ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  {/* Win indicator */}
                  <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all shrink-0
                    ${isWinner && !isDraw
                      ? 'border-white/60 bg-white/10'
                      : `border-current ${color.text}`
                    }`}>
                    {isWinner && !isDraw && <Trophy size={13} className="text-white" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    {isTeamMode ? (
                      <>
                        <p className={`font-display text-lg leading-tight ${isWinner && !isDraw ? 'text-white' : color.text}`}>
                          Team {team.key}
                        </p>
                        <p className={`text-xs truncate ${isWinner && !isDraw ? 'text-white/70' : 'text-white/40'}`}>
                          {team.playerIds.join(', ')}
                        </p>
                      </>
                    ) : (
                      <p className={`font-display text-lg leading-tight ${isWinner && !isDraw ? 'text-white' : color.text}`}>
                        {team.playerIds[0]}
                      </p>
                    )}
                  </div>

                  {isWinner && !isDraw && (
                    <span className="text-white/80 text-xs font-600 bg-white/15 px-2 py-0.5 rounded-full shrink-0">
                      WINNER
                    </span>
                  )}
                </button>

                {/* Score input */}
                {isNumeric && (
                  <div className={`px-4 pb-3 border-t ${isWinner && !isDraw ? 'border-white/20' : color.border}`}>
                    <label className={`block text-xs font-600 uppercase tracking-wider mt-2 mb-1.5
                      ${isWinner && !isDraw ? 'text-white/60' : 'text-white/30'}`}>
                      Score
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      placeholder="0"
                      value={scores[team.key] ?? ''}
                      onChange={e => setScores(s => ({ ...s, [team.key]: e.target.value }))}
                      className={`w-full bg-black/20 border rounded-lg px-3 py-2 text-white text-sm font-mono
                        placeholder-white/20 focus:outline-none focus:ring-1 focus:ring-white/20
                        ${isWinner && !isDraw ? 'border-white/20' : color.border}`}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {error && <p className="input-error mt-3">{error}</p>}
      </div>

      {/* Confirm */}
      <div className="px-4 pb-4 pt-2 border-t border-surface-3 shrink-0">
        <button onClick={handleConfirm} className="btn-primary btn-lg w-full">
          <CheckCircle size={18} /> Continue
        </button>
      </div>
    </div>
  )
}
