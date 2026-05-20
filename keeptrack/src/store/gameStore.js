import { create } from 'zustand'
import { supabase } from '../lib/supabase'

export const useGameStore = create((set, get) => ({
  gameTypes:   [],
  recentGames: [],
  loading:     false,
  error:       null,

  // ── Fetch all game types available to a group ──
  // Returns global presets + group-scoped custom games
  fetchGameTypes: async (groupId) => {
    const { data, error } = await supabase
      .from('game_types')
      .select('*')
      .or(`is_preset.eq.true,group_id.eq.${groupId}`)
      .order('category', { ascending: true })
      .order('name',     { ascending: true })

    if (!error) set({ gameTypes: data || [] })
  },

  // ── Create a custom game type for a group ──
  createGameType: async (groupId, userId, { name, category, scoring_type, allows_draws, default_format }) => {
    const { data, error } = await supabase
      .from('game_types')
      .insert({
        group_id:       groupId,
        name:           name.trim(),
        category:       category?.trim() || 'Custom',
        scoring_type,
        allows_draws:   allows_draws ?? false,
        default_format: default_format ?? 'FFA',
        is_preset:      false,
        created_by:     userId,
      })
      .select()
      .single()

    if (error) return null
    await get().fetchGameTypes(groupId)
    return data
  },

  // ── Log a completed game ──
  logGame: async ({ groupId, gameTypeId, loggedBy, playedAt, isDrawn, notes, teams }) => {
    set({ loading: true, error: null })

    // 1. Insert the game record
    const { data: game, error: gameError } = await supabase
      .from('games')
      .insert({
        group_id:     groupId,
        game_type_id: gameTypeId,
        logged_by:    loggedBy,
        played_at:    playedAt,
        is_draw:      isDrawn,
        notes:        notes?.trim() || null,
      })
      .select()
      .single()

    if (gameError) { set({ loading: false, error: gameError.message }); return null }

    // Helper to clean up orphaned game row if any subsequent insert fails
    const rollback = async () => {
      await supabase.from('games').delete().eq('id', game.id)
    }

    // 2. Insert each team and its participants
    for (const team of teams) {
      const { data: gameTeam, error: teamError } = await supabase
        .from('game_teams')
        .insert({
          game_id:    game.id,
          team_label: team.label ?? null,
          is_winner:  team.isWinner ?? false,
          score:      team.score    ?? null,
        })
        .select()
        .single()

      if (teamError) {
        await rollback()
        set({ loading: false, error: teamError.message })
        return null
      }

      // 3. Insert participants for this team
      const participants = team.playerIds.map(userId => ({
        game_id:      game.id,
        game_team_id: gameTeam.id,
        user_id:      userId,
      }))

      const { error: partError } = await supabase
        .from('game_participants')
        .insert(participants)

      if (partError) {
        await rollback()
        set({ loading: false, error: partError.message })
        return null
      }
    }

    set({ loading: false })
    return game
  },

  // ── Fetch recent games for a group ──
  fetchRecentGames: async (groupId, limit = 20) => {
    const { data, error } = await supabase
      .from('games')
      .select(`
        id, played_at, is_draw, notes, created_at,
        game_types ( id, name, category, scoring_type, allows_draws ),
        profiles!games_logged_by_fkey ( username ),
        game_teams (
          id, team_label, is_winner, score,
          game_participants (
            user_id,
            profiles ( id, username, avatar_url )
          )
        )
      `)
      .eq('group_id', groupId)
      .order('played_at', { ascending: false })
      .limit(limit)

    if (!error) set({ recentGames: data || [] })
    return data || []
  },

  // ── Delete a game (admin only — caller must verify role) ──
  deleteGame: async (gameId, deletedBy, groupId) => {
    // Snapshot for audit log
    const { data: snapshot } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()

    // Best-effort audit log — don't block deletion if this fails
    const { error: auditError } = await supabase.from('audit_log').insert({
      action:        'delete',
      table_name:    'games',
      record_id:     gameId,
      changed_by:    deletedBy,
      previous_data: snapshot,
    })
    if (auditError) console.error('audit_log insert failed:', auditError.message)

    const { error: deleteError } = await supabase.from('games').delete().eq('id', gameId)
    if (deleteError) {
      console.error('deleteGame failed:', deleteError.message)
      return { error: deleteError.message }
    }

    await get().fetchRecentGames(groupId)
    return { success: true }
  },

  clearError: () => set({ error: null }),
}))
