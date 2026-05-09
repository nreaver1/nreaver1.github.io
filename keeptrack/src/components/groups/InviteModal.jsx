import { useState, useEffect } from 'react'
import { X, Link, Copy, Check, Trash2, Clock } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useGroupStore } from '../../store/groupStore'

function timeUntil(dateStr) {
  const ms = new Date(dateStr) - new Date()
  if (ms <= 0) return 'Expired'
  const hours = Math.floor(ms / 1000 / 60 / 60)
  if (hours < 24) return `${hours}h remaining`
  const days = Math.floor(hours / 24)
  return `${days}d remaining`
}

export default function InviteModal({ group, onClose }) {
  const { user } = useAuthStore()
  const { invites, fetchInvites, createInvite, revokeInvite } = useGroupStore()
  const [generating, setGenerating] = useState(false)
  const [copiedId, setCopiedId]     = useState(null)

  useEffect(() => {
    fetchInvites(group.id)
  }, [group.id])

  const handleGenerate = async () => {
    setGenerating(true)
    await createInvite(group.id, user.id)
    await fetchInvites(group.id)
    setGenerating(false)
  }

  const handleCopy = async (invite) => {
    const url = `${window.location.origin}/invite/${invite.token}`
    await navigator.clipboard.writeText(url)
    setCopiedId(invite.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRevoke = async (inviteId) => {
    await revokeInvite(inviteId, group.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-surface-2 border border-surface-4 rounded-2xl rounded-b-none sm:rounded-b-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-4">
          <div>
            <h2 className="font-display text-xl text-white">Invite to {group.name}</h2>
            <p className="text-white/40 text-xs mt-0.5">Links expire after 7 days</p>
          </div>
          <button onClick={onClose} className="btn-icon btn-ghost"><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          {/* Generate button */}
          <button onClick={handleGenerate} className="btn-primary w-full" disabled={generating}>
            {generating ? <span className="spinner" /> : <><Link size={16} /> Generate New Invite Link</>}
          </button>

          {/* Active invites */}
          {invites.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-white/40 text-xs uppercase tracking-wider font-600">Active Links</p>
              {invites.map(invite => (
                <div key={invite.id} className="bg-surface-3 border border-surface-5 rounded-xl p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-white/60 text-xs font-mono truncate">
                      {window.location.origin}/invite/{invite.token.slice(0, 16)}...
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <Clock size={10} className="text-white/30" />
                      <span className="text-white/30 text-xs">{timeUntil(invite.expires_at)}</span>
                      <span className="text-white/20 text-xs mx-1">·</span>
                      <span className="text-white/30 text-xs">by {invite.profiles?.username}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleCopy(invite)}
                    className="btn-secondary btn-sm shrink-0 gap-1"
                  >
                    {copiedId === invite.id ? <><Check size={12} className="text-emerald-400" /> Copied</> : <><Copy size={12} /> Copy</>}
                  </button>
                  <button
                    onClick={() => handleRevoke(invite.id)}
                    className="btn-icon btn-ghost text-red-400/60 hover:text-red-400 shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {invites.length === 0 && (
            <p className="text-center text-white/30 text-sm py-2">No active invite links. Generate one above.</p>
          )}

          <button onClick={onClose} className="btn-secondary w-full">Done</button>
        </div>
      </div>
    </div>
  )
}
