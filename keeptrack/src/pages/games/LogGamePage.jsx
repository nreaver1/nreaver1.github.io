import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useGroupStore } from '../../store/groupStore'
import { useGameStore }  from '../../store/gameStore'
import { useStatsStore } from '../../store/statsStore'
import { useToast } from '../../components/ui/Toast'
import { usePageTitle } from '../../hooks/usePageTitle'
import StepPickGame      from '../../components/games/StepPickGame'
import StepSelectPlayers from '../../components/games/StepSelectPlayers'
import StepEnterResult   from '../../components/games/StepEnterResult'
import StepConfirm       from '../../components/games/StepConfirm'
import CreateGameTypeModal from '../../components/games/CreateGameTypeModal'

const STEPS = ['Game', 'Players', 'Result', 'Confirm']

export default function LogGamePage() {
  const navigate  = useNavigate()
  usePageTitle('Log Game')
  const { user }  = useAuthStore()
  const { groups, members, activeGroup, fetchGroups, fetchMembers } = useGroupStore()
  const { gameTypes, fetchGameTypes, logGame, loading } = useGameStore()
  const { invalidate } = useStatsStore()
  const toast = useToast()

  const [step,          setStep]          = useState(0)
  const [selectedGame,  setSelectedGame]  = useState(null)
  const [playerData,    setPlayerData]    = useState(null)   // { teams, isTeamMode, activePlayers }
  const [resultData,    setResultData]    = useState(null)   // { teams (with winners/scores), isDrawn }
  const [showCustom,    setShowCustom]    = useState(false)
  const [successGameId, setSuccessGameId] = useState(null)

  const group = activeGroup ?? groups[0]

  useEffect(() => {
    if (user && groups.length === 0) fetchGroups(user.id)
  }, [user])

  useEffect(() => {
    if (group) {
      fetchGameTypes(group.id)
      fetchMembers(group.id)
    }
  }, [group?.id])

  // ── Step handlers ──

  const handlePickGame = (gameType) => {
    setSelectedGame(gameType)
    setStep(1)
  }

  const handlePlayersConfirm = (data) => {
    // Hydrate team playerIds with member names for display in later steps
    const hydrated = {
      ...data,
      teams: data.teams.map(t => ({
        ...t,
        _members: members,
        // For FFA: replace the uuid key with the username for display
        playerIds: t.playerIds,
        displayNames: t.playerIds.map(id => members.find(m => m.id === id)?.username ?? id),
      }))
    }
    setPlayerData(hydrated)
    setStep(2)
  }

  const handleResultConfirm = (data) => {
    setResultData(data)
    setStep(3)
  }

  const handleSave = async ({ notes, playedAt }) => {
    const result = await logGame({
      groupId:    group.id,
      gameTypeId: selectedGame.id,
      loggedBy:   user.id,
      playedAt,
      isDrawn:    resultData.isDrawn,
      notes,
      teams:      resultData.teams,
    })

    if (result) {
      invalidate()
      toast.success('Game logged successfully!')
      setSuccessGameId(result.id)
    }
  }

  const goBack = () => {
    if (step > 0) setStep(s => s - 1)
    else navigate(-1)
  }

  // ── No group fallback ──
  if (!group) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <p className="empty-state-title">No group selected</p>
        <p className="empty-state-desc mb-4">You need to be in a group to log a game.</p>
        <button onClick={() => navigate('/groups')} className="btn-primary">Go to Groups</button>
      </div>
    )
  }

  // ── Success screen ──
  if (successGameId) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center animate-slide-up">
        <div className="text-6xl mb-4">🏆</div>
        <h2 className="font-display text-3xl text-white mb-2">Game Logged!</h2>
        <p className="text-white/40 text-sm mb-6">
          {selectedGame?.name} has been recorded for <span className="text-white">{group.name}</span>.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <button
            onClick={() => { setStep(0); setSelectedGame(null); setPlayerData(null); setResultData(null); setSuccessGameId(null) }}
            className="btn-primary btn-lg w-full"
          >
            Log Another Game
          </button>
          <button onClick={() => navigate('/dashboard')} className="btn-secondary btn-lg w-full">
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-surface-3 shrink-0">
        <button onClick={goBack} className="btn-icon btn-ghost shrink-0">
          <ChevronLeft size={20} />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-white/40 text-xs font-600 uppercase tracking-wider">
            {group.name}
          </p>
          <h1 className="font-display text-xl text-white leading-tight">
            {step === 0 && 'Pick a Game'}
            {step === 1 && `Players — ${selectedGame?.name}`}
            {step === 2 && 'Enter Result'}
            {step === 3 && 'Confirm & Save'}
          </h1>
        </div>

        <button onClick={() => navigate(-1)} className="btn-icon btn-ghost text-white/30 shrink-0">
          <X size={18} />
        </button>
      </div>

      {/* Step progress bar */}
      <div className="flex gap-1 px-4 py-2.5 shrink-0">
        {STEPS.map((label, idx) => (
          <div key={label} className="flex-1 flex flex-col gap-1">
            <div className={`h-1 rounded-full transition-all duration-300 ${
              idx < step  ? 'bg-brand-500' :
              idx === step ? 'bg-brand-500/60' :
              'bg-surface-4'
            }`} />
          </div>
        ))}
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {step === 0 && (
          <StepPickGame
            gameTypes={gameTypes}
            onSelect={handlePickGame}
            onCreateCustom={() => setShowCustom(true)}
          />
        )}

        {step === 1 && selectedGame && (
          <StepSelectPlayers
            members={members}
            gameType={selectedGame}
            onConfirm={handlePlayersConfirm}
          />
        )}

        {step === 2 && playerData && (
          <StepEnterResult
            teams={playerData.teams}
            isTeamMode={playerData.isTeamMode}
            gameType={selectedGame}
            onConfirm={handleResultConfirm}
          />
        )}

        {step === 3 && resultData && (
          <StepConfirm
            gameType={selectedGame}
            teams={resultData.teams}
            isTeamMode={playerData.isTeamMode}
            isDrawn={resultData.isDrawn}
            members={members}
            onConfirm={handleSave}
            loading={loading}
          />
        )}
      </div>

      {/* Custom game type modal */}
      {showCustom && (
        <CreateGameTypeModal
          groupId={group.id}
          onClose={() => setShowCustom(false)}
          onCreated={(gameType) => {
            setShowCustom(false)
            handlePickGame(gameType)
          }}
        />
      )}
    </div>
  )
}
