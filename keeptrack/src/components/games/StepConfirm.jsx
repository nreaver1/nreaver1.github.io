import { useState } from 'react'
import { Trophy, Minus, Calendar, FileText, CheckCircle } from 'lucide-react'

export default function StepConfirm({ gameType, teams, isTeamMode, isDrawn, members, onConfirm, loading }) {
  const [notes,     setNotes]     = useState('')
  const [playedAt,  setPlayedAt]  = useState(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset())
    return now.toISOString().slice(0, 16)
  })

  const winners = teams.filter(t => t.isWinner)
  const getName = (id) => members.find(m => m.id === id)?.username ?? id

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pb-4">

        {/* Game name */}
        <div className="card p-4 mb-4 text-center">
          <p className="text-white/40 text-xs uppercase tracking-wider font-600 mb-1">Game</p>
          <p className="font-display text-2xl text-white">{gameType.name}</p>
          <p className="text-white/30 text-xs mt-1">{gameType.category}</p>
        </div>

        {/* Result summary */}
        <div className="card p-4 mb-4">
          <p className="text-white/40 text-xs uppercase tracking-wider font-600 mb-3">Result</p>

          {isDrawn ? (
            <div className="flex items-center gap-2 text-yellow-400">
              <Minus size={16} />
              <span className="font-600">Draw</span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {teams.map(team => {
                const isWinner = team.isWinner
                return (
                  <div key={team.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl
                    ${isWinner ? 'bg-emerald-500/15 border border-emerald-500/25' : 'bg-surface-3 border border-surface-4'}`}>

                    {isWinner
                      ? <Trophy size={14} className="text-emerald-400 shrink-0" />
                      : <div className="w-3.5 h-3.5 rounded-full border border-white/20 shrink-0" />
                    }

                    <div className="flex-1 min-w-0">
                      {isTeamMode ? (
                        <>
                          <p className={`font-600 text-sm ${isWinner ? 'text-white' : 'text-white/50'}`}>
                            Team {team.key}
                          </p>
                          <p className="text-white/30 text-xs truncate">
                            {team.playerIds.map(getName).join(', ')}
                          </p>
                        </>
                      ) : (
                        <p className={`font-600 text-sm ${isWinner ? 'text-white' : 'text-white/50'}`}>
                          {team.playerIds.map(getName).join(', ')}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {team.score !== null && team.score !== undefined && (
                        <span className={`font-mono font-600 text-sm ${isWinner ? 'text-emerald-400' : 'text-white/40'}`}>
                          {team.score}
                        </span>
                      )}
                      {isWinner && (
                        <span className="text-emerald-400 text-xs font-600 bg-emerald-500/15 px-2 py-0.5 rounded-full">
                          WIN
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Date/time — supports backdating */}
        <div className="mb-4">
          <label className="input-label flex items-center gap-1.5">
            <Calendar size={12} /> Date & Time Played
          </label>
          <input
            type="datetime-local"
            className="input"
            value={playedAt}
            onChange={e => setPlayedAt(e.target.value)}
          />
          <p className="text-white/25 text-xs mt-1">You can backdate this if you forgot to log it earlier.</p>
        </div>

        {/* Notes */}
        <div className="mb-4">
          <label className="input-label flex items-center gap-1.5">
            <FileText size={12} /> Notes <span className="text-white/20 normal-case tracking-normal font-normal">(optional)</span>
          </label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder="e.g. Rematch after overtime, best of 3..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            maxLength={300}
          />
          <p className="text-white/20 text-xs mt-1 text-right">{notes.length}/300</p>
        </div>
      </div>

      {/* Save */}
      <div className="px-4 pb-4 pt-2 border-t border-surface-3 shrink-0">
        <button
          onClick={() => onConfirm({ notes, playedAt: new Date(playedAt).toISOString() })}
          className="btn-primary btn-lg w-full"
          disabled={loading}
        >
          {loading ? <span className="spinner" /> : <><CheckCircle size={18} /> Save Game</>}
        </button>
      </div>
    </div>
  )
}
