import { useState, useEffect } from 'react'
import { Users, Info, RefreshCw, CheckCircle } from 'lucide-react'

// Team configuration — colours and labels cycle in this order
const TEAM_CONFIGS = [
  { key: 'none',   label: 'Not playing', color: 'bg-surface-4',     text: 'text-white/30',   border: 'border-surface-5'      },
  { key: 'A',      label: 'Team A',      color: 'bg-brand-500/20',  text: 'text-brand-400',  border: 'border-brand-500/30'   },
  { key: 'B',      label: 'Team B',      color: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30'  },
  { key: 'C',      label: 'Team C',      color: 'bg-emerald-500/20',text: 'text-emerald-400',border: 'border-emerald-500/30' },
  { key: 'D',      label: 'Team D',      color: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30'  },
]

// FFA mode uses only 'in' or 'out'
const FFA_CONFIGS = [
  { key: 'none', label: 'Not playing', color: 'bg-surface-4',    text: 'text-white/30',  border: 'border-surface-5'    },
  { key: 'A',    label: 'Playing',     color: 'bg-brand-500/20', text: 'text-brand-400', border: 'border-brand-500/30' },
]

function PlayerCard({ member, assignment, teamConfig, onTap, isTeamMode }) {
  const cfg = teamConfig

  return (
    <button
      onClick={onTap}
      className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-all duration-200 active:scale-95 text-left
        ${cfg.color} ${cfg.border}`}
    >
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-full border flex items-center justify-center font-display text-sm shrink-0
        ${cfg.border} ${cfg.color}`}>
        <span className={cfg.text}>{member.username[0].toUpperCase()}</span>
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className={`font-600 text-sm truncate ${assignment === 'none' ? 'text-white/40' : 'text-white'}`}>
          {member.username}
        </p>
        <p className={`text-xs mt-0.5 ${cfg.text}`}>{cfg.label}</p>
      </div>

      {/* Tap hint on unassigned */}
      {assignment === 'none' && (
        <span className="text-white/20 text-xs shrink-0">Tap to add</span>
      )}

      {/* Team badge */}
      {assignment !== 'none' && (
        <div className={`w-6 h-6 rounded-md flex items-center justify-center text-xs font-display ${cfg.color} ${cfg.text} border ${cfg.border} shrink-0`}>
          {isTeamMode ? assignment : '✓'}
        </div>
      )}
    </button>
  )
}

export default function StepSelectPlayers({ members, gameType, onConfirm }) {
  // assignments: { [userId]: 'none' | 'A' | 'B' | 'C' | 'D' }
  const [assignments, setAssignments] = useState(() =>
    Object.fromEntries(members.map(m => [m.id, 'A'])) // default everyone to Team A (FFA)
  )
  const [isTeamMode, setIsTeamMode] = useState(false)
  const [showHelp, setShowHelp]     = useState(false)
  const [error, setError]           = useState('')

  // When switching modes, reset assignments sensibly
  useEffect(() => {
    if (isTeamMode) {
      // Move everyone to Team A when first switching to team mode
      setAssignments(prev => Object.fromEntries(
        Object.entries(prev).map(([id, val]) => [id, val === 'none' ? 'none' : 'A'])
      ))
    } else {
      // In FFA mode, only A or none
      setAssignments(prev => Object.fromEntries(
        Object.entries(prev).map(([id, val]) => [id, val === 'none' ? 'none' : 'A'])
      ))
    }
  }, [isTeamMode])

  const handleTap = (memberId) => {
    setError('')
    const configs = isTeamMode ? TEAM_CONFIGS : FFA_CONFIGS
    setAssignments(prev => {
      const current = prev[memberId]
      const idx     = configs.findIndex(c => c.key === current)
      const next    = configs[(idx + 1) % configs.length].key
      return { ...prev, [memberId]: next }
    })
  }

  const getConfig = (assignment) => {
    const configs = isTeamMode ? TEAM_CONFIGS : FFA_CONFIGS
    return configs.find(c => c.key === assignment) ?? configs[0]
  }

  // Group members by team for the summary
  const teamGroups = members.reduce((acc, m) => {
    const team = assignments[m.id]
    if (team === 'none') return acc
    if (!acc[team]) acc[team] = []
    acc[team].push(m)
    return acc
  }, {})

  const activePlayers = members.filter(m => assignments[m.id] !== 'none')
  const teams         = Object.keys(teamGroups).sort()

  const handleConfirm = () => {
    if (activePlayers.length < 2) {
      setError('You need at least 2 players to log a game.')
      return
    }
    if (isTeamMode && teams.length < 2) {
      setError('Assign players to at least 2 different teams.')
      return
    }

    // Build teams array for the game store
    const teamsPayload = isTeamMode
      ? teams.map(teamKey => ({
          key:       teamKey,
          label:     `Team ${teamKey}`,
          playerIds: teamGroups[teamKey].map(m => m.id),
          isWinner:  false,
          score:     null,
        }))
      : activePlayers.map(m => ({
          key:       m.id,
          label:     null,
          playerIds: [m.id],
          isWinner:  false,
          score:     null,
        }))

    onConfirm({ teams: teamsPayload, isTeamMode, activePlayers })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pb-4">

        {/* Mode toggle */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex bg-surface-2 border border-surface-4 rounded-xl p-1 gap-1">
            <button
              onClick={() => setIsTeamMode(false)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-600 transition-all
                ${!isTeamMode ? 'bg-brand-500 text-white shadow-glow-sm' : 'text-white/40 hover:text-white'}`}
            >
              <Users size={13} /> FFA
            </button>
            <button
              onClick={() => setIsTeamMode(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-600 transition-all
                ${isTeamMode ? 'bg-brand-500 text-white shadow-glow-sm' : 'text-white/40 hover:text-white'}`}
            >
              <Users size={13} /> Teams
            </button>
          </div>

          <button
            onClick={() => setShowHelp(h => !h)}
            className="btn-icon btn-ghost text-white/40 hover:text-white/70"
          >
            <Info size={16} />
          </button>
        </div>

        {/* Help text */}
        {showHelp && (
          <div className="bg-surface-2 border border-surface-4 rounded-xl p-3 mb-4 animate-slide-down">
            <p className="text-white/70 text-sm font-600 mb-1">How to assign players</p>
            {!isTeamMode ? (
              <p className="text-white/40 text-xs leading-relaxed">
                In <span className="text-white/60 font-600">FFA (Free for All)</span> mode, every player competes individually.
                Tap any player to toggle them in or out of the game. Everyone shown in orange is participating.
              </p>
            ) : (
              <p className="text-white/40 text-xs leading-relaxed">
                In <span className="text-white/60 font-600">Teams</span> mode, tap a player to cycle them through teams —
                <span className="text-brand-400"> Team A</span> →
                <span className="text-purple-400"> Team B</span> →
                <span className="text-emerald-400"> Team C</span> → Not playing → and back again.
                Uneven teams (3v2, 4v1, etc.) are fully supported.
              </p>
            )}
          </div>
        )}

        {/* Tap hint banner — always visible, dismisses after first tap */}
        <div className="flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-xl px-3 py-2.5 mb-4">
          <RefreshCw size={13} className="text-brand-400 shrink-0" />
          <p className="text-brand-300 text-xs">
            {isTeamMode
              ? 'Tap each player to cycle their team assignment'
              : 'Tap a player to toggle them in or out of the game'
            }
          </p>
        </div>

        {/* Player cards */}
        <div className="flex flex-col gap-2 mb-4">
          {members.map(member => (
            <PlayerCard
              key={member.id}
              member={member}
              assignment={assignments[member.id]}
              teamConfig={getConfig(assignments[member.id])}
              onTap={() => handleTap(member.id)}
              isTeamMode={isTeamMode}
            />
          ))}
        </div>

        {/* Team summary (teams mode only) */}
        {isTeamMode && teams.length >= 2 && (
          <div className="card p-3 mb-4">
            <p className="text-white/40 text-xs uppercase tracking-wider font-600 mb-2">Team Summary</p>
            <div className="flex flex-col gap-2">
              {teams.map(teamKey => {
                const cfg = TEAM_CONFIGS.find(c => c.key === teamKey)
                return (
                  <div key={teamKey} className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-md flex items-center justify-center text-xs font-display ${cfg.color} ${cfg.text} border ${cfg.border} shrink-0`}>
                      {teamKey}
                    </div>
                    <p className={`text-sm font-600 ${cfg.text}`}>Team {teamKey}</p>
                    <p className="text-white/30 text-xs ml-auto">
                      {teamGroups[teamKey]?.map(m => m.username).join(', ')}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {error && <p className="input-error mb-3">{error}</p>}

        {/* Active player count */}
        <p className="text-white/30 text-xs text-center mb-1">
          {activePlayers.length} player{activePlayers.length !== 1 ? 's' : ''} in this game
        </p>
      </div>

      {/* Confirm */}
      <div className="px-4 pb-4 pt-2 border-t border-surface-3 shrink-0">
        <button
          onClick={handleConfirm}
          className="btn-primary btn-lg w-full"
          disabled={activePlayers.length < 2}
        >
          <CheckCircle size={18} />
          Continue with {activePlayers.length} Players
        </button>
      </div>
    </div>
  )
}
