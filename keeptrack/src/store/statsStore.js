import { create } from 'zustand'
import { supabase } from '../lib/supabase'

// Full game fetch with all nested data needed for stats
const GAME_SELECT = `
  id, played_at, is_draw, notes, created_at,
  game_types ( id, name, category, scoring_type, allows_draws ),
  profiles!games_logged_by_fkey ( id, username ),
  game_teams (
    id, team_label, is_winner, score,
    game_participants (
      user_id,
      profiles ( id, username, avatar_url )
    )
  )
`

export const useStatsStore = create((set, get) => ({
  games:          [],
  loadedGroupId:  null,
  loading:        false,

  // ── Fetch ALL games for a group (no limit — needed for accurate stats) ──
  fetchAllGames: async (groupId) => {
    if (get().loadedGroupId === groupId) return // already loaded
    set({ loading: true })

    const { data, error } = await supabase
      .from('games')
      .select(GAME_SELECT)
      .eq('group_id', groupId)
      .order('played_at', { ascending: true }) // oldest first for streak calc

    if (!error) set({ games: data ?? [], loadedGroupId: groupId })
    set({ loading: false })
  },

  // ── Force refresh (called after a new game is logged) ──
  invalidate: () => set({ loadedGroupId: null, games: [] }),
}))
