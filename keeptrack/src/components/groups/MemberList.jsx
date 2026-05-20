import { useState } from 'react'
import { Crown, Shield, MoreVertical, UserMinus, ArrowUpDown, ArrowRightLeft } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useToast } from '../../components/ui/Toast'
import { useGroupStore } from '../../store/groupStore'

function Avatar({ username, size = 'md' }) {
  const s = size === 'sm' ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base'
  return (
    <div className={`${s} rounded-full bg-surface-4 border border-surface-5 flex items-center justify-center font-display text-white/60 shrink-0`}>
      {username?.[0]?.toUpperCase()}
    </div>
  )
}

export default function MemberList({ group }) {
  const { user } = useAuthStore()
  const { members, removeMember, updateRole, transferOwnership } = useGroupStore()
  const toast = useToast()
  const [openMenu, setOpenMenu] = useState(null)
  const [confirmAction, setConfirmAction] = useState(null) // { type, member }

  const myRole   = members.find(m => m.id === user?.id)?.role
  const isAdmin  = myRole === 'admin'
  const isOwner  = group.owner_id === user?.id

  const handleRemove = async (member) => {
    const username = member.username // capture before clearing state
    setConfirmAction(null)
    await removeMember(group.id, member.id, user.id)
    toast.success(`${username} removed from group.`)
  }

  const handleRoleToggle = async (member) => {
    setOpenMenu(null)
    const newRole = member.role === 'admin' ? 'member' : 'admin'
    await updateRole(group.id, member.id, newRole)
    toast.success(`${member.username} is now ${newRole === 'admin' ? 'an admin' : 'a member'}.`)
  }

  const handleTransfer = async (member) => {
    const username = member.username // capture before clearing state
    setConfirmAction(null)
    await transferOwnership(group.id, member.id, user.id)
    toast.success(`Ownership transferred to ${username}.`)
  }

  return (
    <div className="flex flex-col gap-1">
      {members.map(member => {
        const isSelf        = member.id === user?.id
        const isMemberOwner = member.id === group.owner_id
        const canManage     = isAdmin && !isSelf && !isMemberOwner

        return (
          <div key={member.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-3 transition-colors group">
            <Avatar username={member.username} />

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-600 text-white text-sm truncate">{member.username}</span>
                {isSelf && <span className="text-white/25 text-xs">(you)</span>}
                {isMemberOwner && <Crown size={12} className="text-brand-400 shrink-0" />}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                {member.role === 'admin'
                  ? <span className="badge-admin"><Shield size={9} /> Admin</span>
                  : <span className="badge-member">Member</span>
                }
              </div>
            </div>

            {/* Actions menu — only for admins managing others */}
            {canManage && (
              <div className="relative">
                <button
                  onClick={() => setOpenMenu(openMenu === member.id ? null : member.id)}
                  className="btn-icon btn-ghost opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreVertical size={15} />
                </button>

                {openMenu === member.id && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpenMenu(null)} />
                    <div className="absolute right-0 top-full mt-1 w-48 bg-surface-3 border border-surface-5 rounded-xl shadow-xl z-20 overflow-hidden animate-slide-down">
                      <button
                        onClick={() => { handleRoleToggle(member); setOpenMenu(null) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-surface-4 transition-colors text-left"
                      >
                        <ArrowUpDown size={14} />
                        {member.role === 'admin' ? 'Remove admin' : 'Make admin'}
                      </button>

                      {isOwner && (
                        <button
                          onClick={() => { setConfirmAction({ type: 'transfer', member }); setOpenMenu(null) }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-white/70 hover:text-white hover:bg-surface-4 transition-colors text-left"
                        >
                          <ArrowRightLeft size={14} />
                          Transfer ownership
                        </button>
                      )}

                      <div className="border-t border-surface-5" />
                      <button
                        onClick={() => { setConfirmAction({ type: 'remove', member }); setOpenMenu(null) }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
                      >
                        <UserMinus size={14} />
                        Remove from group
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })}

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-sm bg-surface-2 border border-surface-4 rounded-2xl p-5 animate-slide-up">
            {confirmAction.type === 'remove' && (
              <>
                <h3 className="font-display text-xl text-white mb-2">Remove Member</h3>
                <p className="text-white/50 text-sm mb-5">
                  Remove <span className="text-white font-600">{confirmAction.member.username}</span> from the group?
                  Their game history will be preserved.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmAction(null)} className="btn-secondary flex-1">Cancel</button>
                  <button onClick={() => handleRemove(confirmAction.member)} className="btn-danger flex-1">Remove</button>
                </div>
              </>
            )}
            {confirmAction.type === 'transfer' && (
              <>
                <h3 className="font-display text-xl text-white mb-2">Transfer Ownership</h3>
                <p className="text-white/50 text-sm mb-5">
                  Make <span className="text-white font-600">{confirmAction.member.username}</span> the new owner?
                  You will become a regular admin.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setConfirmAction(null)} className="btn-secondary flex-1">Cancel</button>
                  <button onClick={() => handleTransfer(confirmAction.member)} className="btn-primary flex-1">Transfer</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
