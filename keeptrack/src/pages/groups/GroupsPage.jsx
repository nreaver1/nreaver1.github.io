import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Users, ChevronRight, Crown, Shield } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useGroupStore } from '../../store/groupStore'
import CreateGroupModal from '../../components/groups/CreateGroupModal'

export default function GroupsPage() {
  const { user } = useAuthStore()
  const { groups, loading, fetchGroups, setActiveGroup } = useGroupStore()
  const navigate = useNavigate()
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    if (user) fetchGroups(user.id)
  }, [user])

  const handleGroupClick = (group) => {
    setActiveGroup(group)
    navigate(`/groups/${group.id}`)
  }

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto lg:px-6 lg:py-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title">Groups</h1>
          <p className="text-white/40 text-sm mt-1">Your crews and their leaderboards</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus size={16} /> New Group
        </button>
      </div>

      {/* Groups list */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="spinner w-8 h-8" />
        </div>
      ) : groups.length === 0 ? (
        <div className="empty-state card">
          <Users size={32} className="empty-state-icon" />
          <p className="empty-state-title">No groups yet</p>
          <p className="empty-state-desc">Create a group or join one with an invite link.</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-2">
            <Plus size={16} /> Create Group
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map(group => (
            <button
              key={group.id}
              onClick={() => handleGroupClick(group)}
              className="card-hover p-4 flex items-center gap-4 text-left w-full"
            >
              {/* Group avatar */}
              <div className="w-12 h-12 rounded-2xl bg-brand-500/20 border border-brand-500/20 flex items-center justify-center shrink-0">
                <span className="font-display text-xl text-brand-400">
                  {group.name[0].toUpperCase()}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-600 text-white truncate">{group.name}</p>
                  {group.myRole === 'admin' && (
                    <span className="badge-admin shrink-0">
                      <Shield size={10} /> Admin
                    </span>
                  )}
                  {group.owner_id === user?.id && (
                    <Crown size={12} className="text-brand-400 shrink-0" />
                  )}
                </div>
                {group.description && (
                  <p className="text-white/40 text-xs mt-0.5 truncate">{group.description}</p>
                )}
              </div>

              <ChevronRight size={16} className="text-white/20 shrink-0" />
            </button>
          ))}
        </div>
      )}

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={(group) => {
            setShowCreate(false)
            navigate(`/groups/${group.id}`)
          }}
        />
      )}
    </div>
  )
}
