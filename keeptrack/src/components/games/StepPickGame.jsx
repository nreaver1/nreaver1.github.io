import { useState, useMemo } from 'react'
import { Search, Plus, ChevronRight, Gamepad2 } from 'lucide-react'

const CATEGORY_ORDER = [
  'Table & Paddle',
  'Card Games',
  'Board & Dice',
  'Video Games',
  'Physical & Backyard',
  'Drinking & Party',
  'Trivia & Word',
  'Custom',
]

const CATEGORY_ICONS = {
  'Table & Paddle':    '🏓',
  'Card Games':        '🃏',
  'Board & Dice':      '🎲',
  'Video Games':       '🎮',
  'Physical & Backyard': '🏀',
  'Drinking & Party':  '🍺',
  'Trivia & Word':     '🧠',
  'Custom':            '⚡',
}

export default function StepPickGame({ gameTypes, onSelect, onCreateCustom }) {
  const [search, setSearch] = useState('')

  const grouped = useMemo(() => {
    const q = search.toLowerCase().trim()
    const filtered = q
      ? gameTypes.filter(g => g.name.toLowerCase().includes(q) || g.category?.toLowerCase().includes(q))
      : gameTypes

    return CATEGORY_ORDER.reduce((acc, cat) => {
      const games = filtered.filter(g => (g.category || 'Custom') === cat)
      if (games.length) acc[cat] = games
      return acc
    }, {})
  }, [gameTypes, search])

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-4 pt-2 pb-3 sticky top-0 bg-surface-0 z-10">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            className="input pl-9"
            placeholder="Search games..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Game list */}
      <div className="flex-1 overflow-y-auto px-4 pb-6">
        {/* Create custom game */}
        <button
          onClick={onCreateCustom}
          className="w-full flex items-center gap-3 px-3 py-3 mb-4 rounded-xl border border-dashed border-brand-500/40 hover:border-brand-500/70 hover:bg-brand-500/5 transition-all text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-brand-500/20 flex items-center justify-center shrink-0">
            <Plus size={15} className="text-brand-400" />
          </div>
          <div>
            <p className="text-brand-400 font-600 text-sm">Create custom game</p>
            <p className="text-white/30 text-xs">Add a game your crew made up</p>
          </div>
        </button>

        {Object.keys(grouped).length === 0 && (
          <div className="empty-state py-12">
            <Gamepad2 size={28} className="empty-state-icon" />
            <p className="empty-state-title">No games found</p>
            <p className="empty-state-desc">Try a different search or create a custom game.</p>
          </div>
        )}

        {Object.entries(grouped).map(([category, games]) => (
          <div key={category} className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{CATEGORY_ICONS[category] ?? '🎯'}</span>
              <p className="text-white/40 text-xs uppercase tracking-wider font-600">{category}</p>
            </div>
            <div className="flex flex-col gap-1">
              {games.map(game => (
                <button
                  key={game.id}
                  onClick={() => onSelect(game)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-surface-3 active:bg-surface-4 transition-colors text-left group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-600 text-white text-sm">{game.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-white/30 text-xs">{game.default_format}</span>
                      <span className="text-white/15 text-xs">·</span>
                      <span className="text-white/30 text-xs">
                        {game.scoring_type === 'numeric' ? 'Score' : 'Win/Loss'}
                      </span>
                      {game.allows_draws && (
                        <>
                          <span className="text-white/15 text-xs">·</span>
                          <span className="text-white/30 text-xs">Draws</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-white/20 group-hover:text-white/40 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
