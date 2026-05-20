import { useState } from 'react'
import { X, Trash2, Save, AlertTriangle } from 'lucide-react'
import { useGroupStore } from '../../store/groupStore'
import { useToast } from '../../components/ui/Toast'

export default function GroupSettingsModal({ group, onClose, onDeleted }) {
  const { updateGroup, deleteGroup, loading } = useGroupStore()
  const toast = useToast()

  const [name,        setName]        = useState(group.name)
  const [description, setDescription] = useState(group.description ?? '')
  const [showDelete,  setShowDelete]  = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [error,       setError]       = useState('')

  const isDirty = name.trim() !== group.name || description.trim() !== (group.description ?? '')
  const deleteMatch = deleteConfirm.trim().toLowerCase() === group.name.trim().toLowerCase()

  const handleSave = async () => {
    if (!name.trim()) { setError('Group name is required.'); return }
    if (name.trim().length < 2) { setError('Name must be at least 2 characters.'); return }
    setError('')
    setSaving(true)
    const result = await updateGroup(group.id, { name, description })
    setSaving(false)
    if (!result) {
      setError('Failed to save changes. Please try again.')
      return
    }
    toast.success('Group settings saved.')
    onClose()
  }

  const handleDelete = async () => {
    if (!deleteMatch) return
    setDeleting(true)
    const success = await deleteGroup(group.id)
    if (!success) {
      setDeleting(false)
      setError('Failed to delete group. Please try again.')
      return
    }
    toast.success(`"${group.name}" has been deleted.`)
    onDeleted()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-surface-2 border border-surface-4 rounded-2xl shadow-2xl animate-slide-up">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-surface-3">
          <h2 className="font-display text-2xl text-white">Group Settings</h2>
          <button onClick={onClose} className="btn-icon btn-ghost">
            <X size={18} />
          </button>
        </div>

        {!showDelete ? (
          <>
            {/* Edit form */}
            <div className="px-5 py-4 flex flex-col gap-4">
              <div>
                <label className="input-label">Group Name</label>
                <input
                  className="input"
                  type="text"
                  value={name}
                  maxLength={50}
                  onChange={e => setName(e.target.value)}
                  placeholder="My Friend Group"
                />
              </div>

              <div>
                <label className="input-label">Description <span className="text-white/30 font-400">(optional)</span></label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  value={description}
                  maxLength={200}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="What games do you play?"
                />
                <p className="text-white/25 text-xs mt-1 text-right">{description.length}/200</p>
              </div>

              {error && <p className="input-error">{error}</p>}
            </div>

            {/* Footer */}
            <div className="px-5 pb-5 flex flex-col gap-3">
              <div className="flex gap-3">
                <button onClick={onClose} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  className="btn-primary flex-1"
                  disabled={!isDirty || saving}
                >
                  {saving ? <span className="spinner" /> : <><Save size={14} /> Save Changes</>}
                </button>
              </div>

              {/* Danger zone */}
              <div className="border-t border-surface-3 pt-3">
                <button
                  onClick={() => setShowDelete(true)}
                  className="btn-danger w-full text-sm"
                >
                  <Trash2 size={14} /> Delete Group
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Delete confirmation */}
            <div className="px-5 py-4 flex flex-col gap-4">
              <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                <AlertTriangle size={18} className="text-red-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-white font-600 text-sm">This cannot be undone</p>
                  <p className="text-white/50 text-sm mt-1">
                    Deleting <span className="text-white font-600">{group.name}</span> will permanently
                    remove all games, stats, and members. Game history is lost forever.
                  </p>
                </div>
              </div>

              <div>
                <label className="input-label">
                  Type <span className="text-white font-600">{group.name}</span> to confirm
                </label>
                <input
                  className="input"
                  type="text"
                  value={deleteConfirm}
                  onChange={e => setDeleteConfirm(e.target.value)}
                  placeholder={group.name}
                  autoFocus
                />
              </div>

              {error && <p className="input-error">{error}</p>}
            </div>

            <div className="px-5 pb-5 flex gap-3">
              <button
                onClick={() => { setShowDelete(false); setDeleteConfirm('') }}
                className="btn-secondary flex-1"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="btn-danger flex-1"
                disabled={!deleteMatch || deleting}
              >
                {deleting ? <span className="spinner" /> : <><Trash2 size={14} /> Delete Forever</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
