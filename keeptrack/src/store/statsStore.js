import { create } from 'zustand'
import { supabase }       from '../lib/supabase'
import { useNotifStore }  from './notifStore'

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
  realtimeChannel:     null,
  realtimeLive:        false, // true when subscription is active

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

    let gamesRes, membersRes
    try {
      ;[gamesRes, membersRes] = await Promise.all([
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
    } catch (err) {
      console.error('fetchActivity error:', err)
      set({ activityLoading: false })
      return
    }

    if (gamesRes.error || membersRes.error) {
      console.error('fetchActivity query error:', gamesRes.error?.message ?? membersRes.error?.message)
      set({ activityLoading: false })
      return
    }

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

  // ── Subscribe to real-time updates for a group ────────────
  // Listens for new games and new members, updates state live
  subscribeToGroup: (groupId, { onMemberJoined, onNewGame } = {}) => {
    // Clean up any existing subscription first
    get().unsubscribeFromGroup()

    const channel = supabase
      .channel(`group:${groupId}`)

      // New game logged by anyone in the group
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'games',
        filter: `group_id=eq.${groupId}`,
      }, async (payload) => {
        // Fetch the full game record with all nested data
        const { data: game } = await supabase
          .from('games')
          .select(GAME_SELECT)
          .eq('id', payload.new.id)
          .single()

        if (!game) return

        // Append to games (maintain chronological order for stats)
        const current = get().games
        const alreadyExists = current.some(g => g.id === game.id)
        if (!alreadyExists) {
          set({ games: [...current, game] })
          // Increment unread for groups the user isn't currently viewing
          useNotifStore.getState().increment(groupId)
          // Notify component so it can show a toast
          if (onNewGame) onNewGame(game)
        }

        // Prepend to activity feed
        const newEvent = { type: 'game', id: game.id, timestamp: game.played_at, game }
        const activity = get().activity
        const activityExists = activity.some(a => a.id === game.id)
        if (!activityExists) {
          set({ activity: [newEvent, ...activity].slice(0, 40) })
        }
      })

      // New member joined the group
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'group_members',
        filter: `group_id=eq.${groupId}`,
      }, async (payload) => {
        // Fetch their profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, username, avatar_url, email')
          .eq('id', payload.new.user_id)
          .maybeSingle()

        if (!profile) return

        // Notify GroupDetailPage to update its members list
        if (onMemberJoined) {
          onMemberJoined({
            ...profile,
            role:     payload.new.role,
            joinedAt: payload.new.joined_at,
            memberId: payload.new.id,
          })
        }

        // Prepend to activity feed
        const joinId = `join-${profile.id}`
        const activity = get().activity
        const alreadyInFeed = activity.some(a => a.id === joinId)
        if (!alreadyInFeed) {
          const newEvent = {
            type:      'join',
            id:        joinId,
            timestamp: payload.new.joined_at,
            profile,
          }
          set({ activity: [newEvent, ...activity].slice(0, 40) })
        }
      })

      .on('postgres_changes', {
        event:  'DELETE',
        schema: 'public',
        table:  'games',
        filter: `group_id=eq.${groupId}`,
      }, (payload) => {
        // Remove deleted game from both games and activity
        set({
          games:    get().games.filter(g => g.id !== payload.old.id),
          activity: get().activity.filter(a => a.id !== payload.old.id),
        })
      })

      .subscribe((status) => {
        set({ realtimeLive: status === 'SUBSCRIBED' })
      })

    set({ realtimeChannel: channel })
  },

  unsubscribeFromGroup: () => {
    const channel = get().realtimeChannel
    if (channel) {
      supabase.removeChannel(channel)
      set({ realtimeChannel: null, realtimeLive: false })
    }
  },

  // ── Force refresh (called after a new game is logged) ──
  invalidate: () => set({ loadedGroupId: null, games: [], activityGroupId: null, activity: [] }),
}))
