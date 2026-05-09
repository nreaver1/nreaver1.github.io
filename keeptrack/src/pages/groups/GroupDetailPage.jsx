import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Users, Link as LinkIcon, Trophy, Settings,
  LogOut, ChevronLeft, Crown, Shield
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useGroupStore } from '../../store/groupStore'
import MemberList from '../../components/groups/MemberList'
import InviteModal from '../../components/groups/InviteModal'

const TABS = ['Members', 'Leaderboard', 'Games']

export default function GroupDetailPage() {
  const { groupId } = useParams()
  const navigate    = useNavigate()
  const { user }    = useAuthStore()
  const { groups, members, fetchGroups, fetchMembers, leaveGroup } = useGroupStore()

  const [tab, setTab]             = useState('Members')
  const [showInvite, setShowInvite] = useState(false)
  const [showLeave, setShowLeave]   = useState(false)
  const [leaving, setLeaving]       = useState(false)

  const group  = groups.find(g => g.id === groupId)
  const myRole = members.find(m => m.id === user?.id)?.role
  const isAdmin = myRole === 'admin'
  const isOwner = group?.owner_id === user?.id

  useEffect(() => {
    if (user && groups.length === 0) fetchGroups(user.id)
  }, [user])

  useEffect(() => {
    if (groupId) fetchMembers(groupId)
  }, [groupId])

  const handleLeave = async () => {
    if (isOwner) return // Owner must transfer first
    setLeaving(true)
    await leaveGroup(groupId, user.id)
    navigate('/groups')
  }

  if (!group) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="spinner w-8 h-8" />
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
          {/* Group avatar */}
          <div className="w-14 h-14 rounded-2xl bg-brand-500/20 border border-brand-500/20 flex items-center justify-center shrink-0">
            <span className="font-display text-2xl text-brand-400">
              {group.name[0].toUpperCase()}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-3xl text-white">{group.name}</h1>
              {isOwner && <Crown size={16} className="text-brand-400" />}
              {isAdmin && !isOwner && <span className="badge-admin"><Shield size={10} /> Admin</span>}
            </div>
            {group.description && (
              <p className="text-white/40 text-sm mt-1">{group.description}</p>
            )}
            <p className="text-white/25 text-xs mt-1">
              {members.length} {members.length === 1 ? 'member' : 'members'}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-4 flex-wrap">
          <button onClick={() => setShowInvite(true)} className="btn-secondary btn-sm">
            <LinkIcon size={13} /> Invite
          </button>
          {isOwner && (
            <button className="btn-secondary btn-sm">
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
          <div className="empty-state py-16">
            <Trophy size={32} className="empty-state-icon" />
            <p className="empty-state-title">Leaderboard coming soon</p>
            <p className="empty-state-desc">Log some games to start building the rankings.</p>
          </div>
        )}

        {tab === 'Games' && (
          <div className="empty-state py-16">
            <Trophy size={32} className="empty-state-icon" />
            <p className="empty-state-title">No games yet</p>
            <p className="empty-state-desc">Log your first game to see it here.</p>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <InviteModal group={group} onClose={() => setShowInvite(false)} />
      )}

      {/* Leave confirm */}
      {showLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-surface-2 border border-surface-4 rounded-2xl p-5 animate-slide-up">
            <h3 className="font-display text-xl text-white mb-2">Leave Group?</h3>
            <p className="text-white/50 text-sm mb-5">
              You'll lose access to <span className="text-white font-600">{group.name}</span>.
              Your game history will be preserved. You can rejoin with a new invite link.
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

      {/* Owner can't leave warning */}
      {isOwner && showLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-surface-2 border border-surface-4 rounded-2xl p-5">
            <h3 className="font-display text-xl text-white mb-2">Transfer Ownership First</h3>
            <p className="text-white/50 text-sm mb-5">
              You're the owner of this group. Before leaving, go to the Members tab and transfer
              ownership to another member.
            </p>
            <button onClick={() => setShowLeave(false)} className="btn-primary w-full">Got it</button>
          </div>
        </div>
      )}
    </div>
  )
}
