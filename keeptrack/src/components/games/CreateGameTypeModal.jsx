import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useGameStore } from '../../store/gameStore'

export default function CreateGameTypeModal({ groupId, onClose, onCreated }) {
  const { user } = useAuthStore()
  const { createGameType } = useGameStore()

  const [form, setForm] = useState({
    name:           '',
    category:       'Custom',
    scoring_type:   'win_loss',
    allows_draws:   false,
    default_format: 'FFA',
  })
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Game name is required.'); return }
    setError('')
    setLoading(true)
    const gameType = await createGameType(groupId, user.id, form)
    setLoading(false)
    if (gameType) onCreated(gameType)
    else setError('Failed to create game. Try again.')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-md bg-surface-2 border border-surface-4 rounded-2xl rounded-b-none sm:rounded-b-2xl animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-4">
          <h2 className="font-display text-xl text-white">Custom Game</h2>
          <button onClick={onClose} className="btn-icon btn-ghost"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-4">
          <div>
            <label className="input-label">Game Name <span className="text-brand-500">*</span></label>
            <input
              className="input"
              placeholder="e.g. Snappa, Kan Jam..."
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              autoFocus
            />
          </div>

          <div>
            <label className="input-label">Category <span className="text-white/20">(optional)</span></label>
            <input
              className="input"
              placeholder="e.g. Backyard, Card Game..."
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
            />
          </div>

          <div>
            <label className="input-label">Scoring Type</label>
            <div className="flex gap-2">
              {['win_loss', 'numeric'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, scoring_type: type }))}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-600 transition-all
                    ${form.scoring_type === type
                      ? 'bg-brand-500/15 border-brand-500/30 text-brand-400'
                      : 'bg-surface-3 border-surface-5 text-white/40 hover:text-white'
                    }`}
                >
                  {type === 'win_loss' ? 'Win / Loss' : 'Numeric Score'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="input-label">Default Format</label>
            <div className="flex gap-2 flex-wrap">
              {['FFA', '1v1', '2v2', 'Team'].map(fmt => (
                <button
                  key={fmt}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, default_format: fmt }))}
                  className={`px-3 py-2 rounded-xl border text-sm font-600 transition-all
                    ${form.default_format === fmt
                      ? 'bg-brand-500/15 border-brand-500/30 text-brand-400'
                      : 'bg-surface-3 border-surface-5 text-white/40 hover:text-white'
                    }`}
                >
                  {fmt}
                </button>
              ))}
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, allows_draws: !f.allows_draws }))}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all
                ${form.allows_draws
                  ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400'
                  : 'bg-surface-3 border-surface-5 text-white/50 hover:text-white'
                }`}
            >
              <span className="font-600 text-sm">Allow Draws</span>
              <div className={`w-10 h-5 rounded-full transition-all relative ${form.allows_draws ? 'bg-yellow-500' : 'bg-surface-5'}`}>
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${form.allows_draws ? 'left-5' : 'left-0.5'}`} />
              </div>
            </button>
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
