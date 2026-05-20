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
  games:               [],
  loadedGroupId:       null,
  loading:             false,
  activity:            [],
  activityGroupId:     null,
  activityLoading:     false,

  // ── Fetch ALL games for a group (no limit — needed for accurate stats) ──
  fetchAllGames: async (groupId) => {
    if (get().loadedGroupId === groupId) return // already loaded
    set({ loading: true })

    const { data, error } = await supabase
      .from('games')
      .select(GAME_SELECT)
      .eq('group_id', groupId)
      .order('played_at', { ascending: true }) // oldest first for streak calc

    if (error) {
      console.error('fetchAllGames error:', error.message)
      set({ loading: false })
      return
    }
    set({ games: data ?? [], loadedGroupId: groupId, loading: false })
  },

  // ── Fetch activity feed for a group ──
  // Returns last 30 events: game results + member joins, newest first
  fetchActivity: async (groupId) => {
    if (get().activityGroupId === groupId) return
    set({ activityLoading: true })

    const [gamesRes, membersRes] = await Promise.all([
      supabase
        .from('games')
        .select(`
          id, played_at, is_draw, notes,
          game_types ( id, name ),
          profiles!games_logged_by_fkey ( id, username ),
          game_teams (
            id, is_winner, score,
            game_participants (
              user_id,
              profiles ( id, username )
            )
          )
        `)
        .eq('group_id', groupId)
        .order('played_at', { ascending: false })
        .limit(30),
      supabase
        .from('group_members')
        .select('joined_at, profiles ( id, username )')
        .eq('group_id', groupId)
        .order('joined_at', { ascending: false })
        .limit(20),
    ])

    const gameEvents = (gamesRes.data ?? []).map(g => ({
      type:      'game',
      id:        g.id,
      timestamp: g.played_at,
      game:      g,
    }))

    const joinEvents = (membersRes.data ?? []).map(m => ({
      type:      'join',
      id:        `join-${m.profiles?.id}`,
      timestamp: m.joined_at,
      profile:   m.profiles,
    }))

    // Merge and sort newest first
    const activity = [...gameEvents, ...joinEvents]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 40)

    set({ activity, activityGroupId: groupId, activityLoading: false })
  },

  invalidateActivity: () => set({ activityGroupId: null, activity: [] }),

  // ── Force refresh (called after a new game is logged) ──
  invalidate: () => set({ loadedGroupId: null, games: [], activityGroupId: null, activity: [] }),
}))
