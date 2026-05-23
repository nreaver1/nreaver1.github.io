import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import {
  Users, Link as LinkIcon, Trophy, Settings,
  LogOut, ChevronLeft, Crown, Shield
} from 'lucide-react'
import { useAuthStore }  from '../../store/authStore'
import { useToast }       from '../../components/ui/Toast'
import { useGroupStore } from '../../store/groupStore'
import { useStatsStore } from '../../store/statsStore'
import { useGameStore }  from '../../store/gameStore'
import { buildPlayerRecords } from '../../lib/stats'
import MemberList       from '../../components/groups/MemberList'
import InviteModal      from '../../components/groups/InviteModal'
import LeaderboardTable from '../../components/stats/LeaderboardTable'
import GameHistory         from '../../components/stats/GameHistory'
import ActivityFeed       from '../../components/stats/ActivityFeed'
import GroupSettingsModal from '../../components/groups/GroupSettingsModal'

const TABS = ['Members', 'Leaderboard', 'Games', 'Activity']

export default function GroupDetailPage() {
  const { groupId } = useParams()
  const navigate    = useNavigate()
  const { user }    = useAuthStore()
  const toast       = useToast()
  const { groups, members, loading: groupsLoading, fetchGroups, fetchMembers, setMembers, leaveGroup, updateGroup, deleteGroup } = useGroupStore()
  const { games, loading: statsLoading, fetchAllGames, invalidate, activity, activityLoading, fetchActivity, subscribeToGroup, unsubscribeFromGroup, realtimeLive } = useStatsStore()
  const { fetchGameTypes } = useGameStore()

  const [searchParams] = useSearchParams()
  const [tab,         setTab]         = useState(() => {
    const t = searchParams.get('tab')
    return TABS.includes(t) ? t : 'Members'
  })
  const [showInvite,  setShowInvite]  = useState(false)
  const [showLeave,    setShowLeave]   = useState(false)
  const [leaving,      setLeaving]     = useState(false)
  const [showSettings, setShowSettings] = useState(false)

  const group   = groups.find(g => g.id === groupId)
  const myRole  = members.find(m => m.id === user?.id)?.role
  const isAdmin = myRole === 'admin'
  const isOwner = group?.owner_id === user?.id

  useEffect(() => {
    if (user && groups.length === 0) fetchGroups(user.id)
  }, [user])

  useEffect(() => {
    if (groupId) {
      invalidate()
      fetchMembers(groupId)
      fetchAllGames(groupId)
      fetchGameTypes(groupId)
      fetchActivity(groupId)

      // Subscribe to real-time updates for this group
      subscribeToGroup(groupId, {
        onNewGame: (game) => {
          if (game.logged_by !== user?.id) {
            const winners = (game.game_teams ?? [])
              .filter(t => t.is_winner)
              .flatMap(t => t.game_participants ?? [])
              .map(p => p.profiles?.username)
              .filter(Boolean)
            const gameName = game.game_types?.name ?? 'a game'
            const msg = game.is_draw
              ? `🤝 Draw logged in ${gameName}`
              : winners.length
                ? `🏆 ${winners.slice(0, 2).join(' & ')} won at ${gameName}`
                : `New game logged: ${gameName}`
            toast.info(msg)
          }
        },
        onMemberJoined: (newMember) => {
          setMembers(prev => {
            const already = (Array.isArray(prev) ? prev : []).some(m => m.id === newMember.id)
            return already ? prev : [...(Array.isArray(prev) ? prev : []), newMember]
          })
          toast.info(`${newMember.username} joined the group`)
        },
      })
    }

    // Unsubscribe when leaving the group page
    return () => unsubscribeFromGroup()
  }, [groupId])

  const records = useMemo(() => {
    if (!games.length) return []
    return Object.values(buildPlayerRecords(games))
  }, [games])

  const handleLeave = async () => {
    if (isOwner) return
    setLeaving(true)
    await leaveGroup(groupId, user.id)
    navigate('/groups')
  }

  if (!group) {
    if (groupsLoading) {
      return (
        <div className="flex items-center justify-center py-24">
          <div className="spinner w-8 h-8" />
        </div>
      )
    }
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
        <p className="empty-state-title">Group not found</p>
        <p className="empty-state-desc mb-4">This group may have been deleted or you no longer have access.</p>
        <button onClick={() => navigate('/groups')} className="btn-primary">Back to Groups</button>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 lg:px-6">
        <button
          onClick={() => navigate('/groups')}
          className="flex items-center gap-1 text-white/40 hover:text-white text-sm font-600 mb-4 transition-colors"
        >
          <ChevronLeft size={16} /> Groups
        </button>

        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-500/20 border border-brand-500/20 flex items-center justify-center shrink-0">
            <span className="font-display text-2xl text-brand-400">
              {group.name[0].toUpperCase()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl text-white">{group.name}</h1>
          {realtimeLive && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/25">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 text-[10px] font-600 uppercase tracking-wider">Live</span>
            </span>
          )}
        </div>
          {realtimeLive && (
            <span className="flex items-center gap-1 text-emerald-400 text-xs font-600 mt-1" title="Live updates active">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              live
            </span>
          )}
        </div>
              {isOwner && <Crown size={16} className="text-brand-400" />}
              {isAdmin && !isOwner && <span className="badge-admin"><Shield size={10} /> Admin</span>}
            </div>
            {group.description && (
              <p className="text-white/40 text-sm mt-1">{group.description}</p>
            )}
            <p className="text-white/25 text-xs mt-1">
              {members.length} {members.length === 1 ? 'member' : 'members'}
              {games.length > 0 && <> · {games.length} games</>}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-4 flex-wrap">
          <button onClick={() => setShowInvite(true)} className="btn-secondary btn-sm">
            <LinkIcon size={13} /> Invite
          </button>
          {isAdmin && (
            <button onClick={() => setShowSettings(true)} className="btn-secondary btn-sm">
              <Settings size={13} /> Settings
            </button>
          )}
          {!isOwner && (
            <button onClick={() => setShowLeave(true)} className="btn-danger btn-sm">
              <LogOut size={13} /> Leave Group
            </button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-surface-3 px-4 lg:px-6">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-600 border-b-2 transition-colors -mb-px
              ${tab === t
                ? 'border-brand-500 text-white'
                : 'border-transparent text-white/40 hover:text-white/70'
              }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="px-4 py-4 lg:px-6">
        {tab === 'Members' && (
          <div className="card p-2">
            <MemberList group={group} />
          </div>
        )}

        {tab === 'Leaderboard' && (
          statsLoading && records.length === 0 ? (
            <div className="flex justify-center py-16"><div className="spinner w-8 h-8" /></div>
          ) : (
            <LeaderboardTable records={records} />
          )
        )}

        {tab === 'Games' && (
          statsLoading && games.length === 0 ? (
            <div className="flex justify-center py-16"><div className="spinner w-8 h-8" /></div>
          ) : (
            <GameHistory games={games} groupId={groupId} />
          )
        )}

        {tab === 'Activity' && (
          <ActivityFeed activity={activity} loading={activityLoading} />
        )}
      </div>

      {/* Settings modal */}
      {showSettings && (
        <GroupSettingsModal
          group={group}
          onClose={() => setShowSettings(false)}
          onDeleted={() => navigate('/groups')}
        />
      )}

      {/* Invite modal */}
      {showInvite && (
        <InviteModal group={group} onClose={() => setShowInvite(false)} />
      )}

      {/* Leave confirm */}
      {showLeave && !isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-surface-2 border border-surface-4 rounded-2xl p-5 animate-slide-up">
            <h3 className="font-display text-xl text-white mb-2">Leave Group?</h3>
            <p className="text-white/50 text-sm mb-5">
              You'll lose access to <span className="text-white font-600">{group.name}</span>.
              Your game history will be preserved.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowLeave(false)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleLeave} className="btn-danger flex-1" disabled={leaving}>
                {leaving ? <span className="spinner" /> : 'Leave Group'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Owner can't leave */}
      {showLeave && isOwner && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-surface-2 border border-surface-4 rounded-2xl p-5 animate-slide-up">
            <h3 className="font-display text-xl text-white mb-2">Transfer Ownership First</h3>
            <p className="text-white/50 text-sm mb-5">
              You're the owner. Go to the Members tab and transfer ownership to another member before leaving.
            </p>
            <button onClick={() => setShowLeave(false)} className="btn-primary w-full">Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}
