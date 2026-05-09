import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useGroupStore } from '../../store/groupStore'

export default function CreateGroupModal({ onClose, onCreated }) {
  const { user } = useAuthStore()
  const { createGroup, loading } = useGroupStore()
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { setError('Group name is required.'); return }
    setError('')
    const group = await createGroup(user.id, { name, description: desc })
    if (group) onCreated(group)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-surface-2 border border-surface-4 rounded-2xl sm:rounded-2xl rounded-b-none sm:rounded-b-2xl animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-4">
          <h2 className="font-display text-xl text-white">Create Group</h2>
          <button onClick={onClose} className="btn-icon btn-ghost">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div>
            <label className="input-label">Group Name <span className="text-brand-500">*</span></label>
            <input
              className="input"
              placeholder="e.g. Friday Night Crew"
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={50}
              autoFocus
            />
          </div>
          <div>
            <label className="input-label">Description <span className="text-white/20">(optional)</span></label>
            <input
              className="input"
              placeholder="e.g. Game nights at Jake's place"
              value={desc}
              onChange={e => setDesc(e.target.value)}
              maxLength={120}
            />
          </div>

          {error && <p className="input-error">{error}</p>}

          <div className="flex gap-3 mt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" className="btn-primary flex-1" disabled={loading}>
              {loading ? <span className="spinner" /> : <><Plus size={16} /> Create</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
