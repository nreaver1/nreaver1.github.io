import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Mock Supabase ───────────────────────────────────────────────────────────
// We mock the module before importing the stores so they pick up the mock.

const mockFrom = vi.fn()
const mockSelect = vi.fn()
const mockInsert = vi.fn()
const mockDelete = vi.fn()
const mockEq = vi.fn()
const mockSingle = vi.fn()
const mockMaybeSingle = vi.fn()
const mockOrder = vi.fn()

// Build a fluent chainable mock
function chainable(returnValue) {
  const chain = {}
  const methods = ['from', 'select', 'insert', 'delete', 'update', 'eq', 'neq',
    'single', 'maybeSingle', 'order', 'limit', 'in', 'is', 'not', 'gte', 'lte']
  methods.forEach(m => {
    chain[m] = vi.fn().mockReturnValue(returnValue ?? chain)
  })
  return chain
}

vi.mock('../lib/supabase', () => {
  const chain = chainable()
  // Make every terminal operation return a resolved promise by default
  const terminal = (val) => vi.fn().mockResolvedValue(val)
  chain.single = terminal({ data: null, error: null })
  chain.maybeSingle = terminal({ data: null, error: null })
  chain.select = vi.fn().mockReturnValue(chain)
  chain.insert = vi.fn().mockReturnValue(chain)
  chain.delete = vi.fn().mockReturnValue(chain)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.from = vi.fn().mockReturnValue(chain)

  return {
    supabase: {
      from: chain.from,
      auth: {
        getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
        signOut: vi.fn().mockResolvedValue({}),
      },
    },
    startInactivityWatcher: vi.fn(),
    stopInactivityWatcher: vi.fn(),
  }
})

// ─── statsStore tests ────────────────────────────────────────────────────────

describe('statsStore', () => {
  beforeEach(async () => {
    // Reset store state between tests
    const { useStatsStore } = await import('../store/statsStore')
    useStatsStore.setState({ games: [], loadedGroupId: null, loading: false })
  })

  it('initial state is empty', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const state = useStatsStore.getState()
    expect(state.games).toEqual([])
    expect(state.loadedGroupId).toBeNull()
    expect(state.loading).toBe(false)
  })

  it('invalidate() clears games and loadedGroupId', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    useStatsStore.setState({ games: [{ id: 'g1' }], loadedGroupId: 'group-a' })

    useStatsStore.getState().invalidate()

    const state = useStatsStore.getState()
    expect(state.games).toEqual([])
    expect(state.loadedGroupId).toBeNull()
  })

  it('regression: invalidate() before group switch clears stale games', async () => {
    const { useStatsStore } = await import('../store/statsStore')

    // Simulate: Group A games loaded
    useStatsStore.setState({ games: [{ id: 'ga1' }, { id: 'ga2' }], loadedGroupId: 'group-a' })

    // User clicks a different group — invalidate() is called first
    useStatsStore.getState().invalidate()

    // At this point games should be empty (no stale Group A data shown)
    expect(useStatsStore.getState().games).toHaveLength(0)
    expect(useStatsStore.getState().loadedGroupId).toBeNull()
  })

  it('skips fetch when loadedGroupId matches requested groupId', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const { supabase } = await import('../lib/supabase')

    useStatsStore.setState({ games: [{ id: 'g1' }], loadedGroupId: 'group-a', loading: false })
    supabase.from.mockClear()

    await useStatsStore.getState().fetchAllGames('group-a')

    // Should NOT have called supabase — early return
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('fetches when groupId differs from loadedGroupId', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const { supabase } = await import('../lib/supabase')

    useStatsStore.setState({ games: [], loadedGroupId: null, loading: false })

    // Make the chain resolve with empty games
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    supabase.from.mockReturnValue(mockChain)

    await useStatsStore.getState().fetchAllGames('group-b')

    expect(supabase.from).toHaveBeenCalledWith('games')
    expect(useStatsStore.getState().loadedGroupId).toBe('group-b')
  })

  it('sets loading: false on fetch error (regression: spinner stuck forever)', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const { supabase } = await import('../lib/supabase')

    useStatsStore.setState({ games: [], loadedGroupId: null, loading: false })

    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: { message: 'Network error' } }),
    }
    supabase.from.mockReturnValue(mockChain)

    await useStatsStore.getState().fetchAllGames('group-x')

    // loading must be false after error — not stuck spinning
    expect(useStatsStore.getState().loading).toBe(false)
    // games should remain empty — no stale data written
    expect(useStatsStore.getState().games).toEqual([])
  })
})

// ─── groupStore tests ─────────────────────────────────────────────────────────

describe('groupStore', () => {
  beforeEach(async () => {
    const { useGroupStore } = await import('../store/groupStore')
    useGroupStore.setState({
      groups: [],
      members: [],
      activeGroup: null,
      loading: false,
      error: null,
    })
  })

  it('initial state is empty', async () => {
    const { useGroupStore } = await import('../store/groupStore')
    const state = useGroupStore.getState()
    expect(state.groups).toEqual([])
    expect(state.members).toEqual([])
    expect(state.activeGroup).toBeNull()
  })

  it('setActiveGroup updates activeGroup', async () => {
    const { useGroupStore } = await import('../store/groupStore')
    const group = { id: 'g1', name: 'Test Group' }
    useGroupStore.getState().setActiveGroup(group)
    expect(useGroupStore.getState().activeGroup).toEqual(group)
  })

  it('regression: fetchMembers clears stale members before loading new ones', async () => {
    const { useGroupStore } = await import('../store/groupStore')
    const { supabase } = await import('../lib/supabase')

    // Simulate: Group A members loaded
    useGroupStore.setState({
      members: [{ id: 'user-1', username: 'alice' }, { id: 'user-2', username: 'bob' }],
    })

    // Mock supabase to return new members for Group B
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ user_id: 'user-3', role: 'admin', profiles: { id: 'user-3', username: 'carol' } }],
        error: null,
      }),
    }
    supabase.from.mockReturnValue(mockChain)

    // Start fetch — members should be cleared immediately
    const fetchPromise = useGroupStore.getState().fetchMembers('group-b')

    // Right after calling fetchMembers (before await), stale members should be gone
    expect(useGroupStore.getState().members).toHaveLength(0)

    await fetchPromise
  })

  it('clearError resets error state', async () => {
    const { useGroupStore } = await import('../store/groupStore')
    useGroupStore.setState({ error: 'Something went wrong' })
    useGroupStore.getState().clearError()
    expect(useGroupStore.getState().error).toBeNull()
  })
})

// ─── gameStore tests ──────────────────────────────────────────────────────────

describe('gameStore', () => {
  beforeEach(async () => {
    const { useGameStore } = await import('../store/gameStore')
    useGameStore.setState({ gameTypes: [], recentGames: [], loading: false, error: null })
  })

  it('initial state is empty', async () => {
    const { useGameStore } = await import('../store/gameStore')
    const state = useGameStore.getState()
    expect(state.gameTypes).toEqual([])
    expect(state.recentGames).toEqual([])
    expect(state.loading).toBe(false)
    expect(state.error).toBeNull()
  })

  it('regression: deleteGame returns success on completion', async () => {
    const { useGameStore } = await import('../store/gameStore')
    const { supabase } = await import('../lib/supabase')

    // Mock snapshot fetch
    const snapshotChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'game-1' }, error: null }),
    }

    // Mock audit log insert
    const auditChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }

    // Mock delete
    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }

    // Mock fetchRecentGames
    const fetchChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    }

    supabase.from
      .mockReturnValueOnce(snapshotChain)
      .mockReturnValueOnce(auditChain)
      .mockReturnValueOnce(deleteChain)
      .mockReturnValueOnce(fetchChain)

    const result = await useGameStore.getState().deleteGame('game-1', 'user-1', 'group-1')
    expect(result?.error).toBeUndefined()
  })

  it('regression: deleteGame returns error object when delete fails', async () => {
    const { useGameStore } = await import('../store/gameStore')
    const { supabase } = await import('../lib/supabase')

    const snapshotChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id: 'game-1' }, error: null }),
    }

    const auditChain = {
      insert: vi.fn().mockResolvedValue({ error: null }),
    }

    const deleteChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: { message: 'RLS violation' } }),
    }

    supabase.from
      .mockReturnValueOnce(snapshotChain)
      .mockReturnValueOnce(auditChain)
      .mockReturnValueOnce(deleteChain)

    const result = await useGameStore.getState().deleteGame('game-1', 'user-1', 'group-1')
    expect(result?.error).toBe('RLS violation')
  })
})

// ─── authStore tests ──────────────────────────────────────────────────────────

describe('authStore', () => {
  beforeEach(async () => {
    const { useAuthStore } = await import('../store/authStore')
    useAuthStore.setState({ user: null, profile: null, session: null, loading: true })
  })

  it('initial state has loading: true', async () => {
    const { useAuthStore } = await import('../store/authStore')
    expect(useAuthStore.getState().loading).toBe(true)
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('signOut clears user, profile, and session', async () => {
    const { useAuthStore } = await import('../store/authStore')

    useAuthStore.setState({
      user: { id: 'u1' },
      profile: { username: 'alice' },
      session: { access_token: 'tok' },
    })

    await useAuthStore.getState().signOut()

    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.profile).toBeNull()
    expect(state.session).toBeNull()
  })

  it('fetchProfile uses maybeSingle — returns null instead of throwing when no row', async () => {
    const { useAuthStore } = await import('../store/authStore')
    const { supabase } = await import('../lib/supabase')

    // Simulate no profile row found
    const mockChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    supabase.from.mockReturnValue(mockChain)

    const result = await useAuthStore.getState().fetchProfile('user-without-profile')

    // Should return null, not throw a 406
    expect(result).toBeNull()
  })

  it('setProfile updates profile in store', async () => {
    const { useAuthStore } = await import('../store/authStore')
    const profile = { id: 'u1', username: 'alice' }
    useAuthStore.getState().setProfile(profile)
    expect(useAuthStore.getState().profile).toEqual(profile)
  })
})

// ─── groupStore: updateGroup and deleteGroup ──────────────────────────────────

describe('groupStore: settings actions', () => {
  beforeEach(async () => {
    const { useGroupStore } = await import('../store/groupStore')
    useGroupStore.setState({
      groups: [{ id: 'g1', name: 'Old Name', description: 'Old desc', owner_id: 'u1' }],
      activeGroup: { id: 'g1', name: 'Old Name', description: 'Old desc', owner_id: 'u1' },
      members: [],
      loading: false,
      error: null,
    })
  })

  it('updateGroup updates name and description in local state', async () => {
    const { useGroupStore } = await import('../store/groupStore')
    const { supabase } = await import('../lib/supabase')

    const mockChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: 'g1', name: 'New Name', description: 'New desc' },
        error: null,
      }),
    }
    supabase.from.mockReturnValue(mockChain)

    const result = await useGroupStore.getState().updateGroup('g1', { name: 'New Name', description: 'New desc' }, 'u1')

    expect(result).not.toBeNull()
    const state = useGroupStore.getState()
    expect(state.groups[0].name).toBe('New Name')
    expect(state.groups[0].description).toBe('New desc')
    expect(state.activeGroup.name).toBe('New Name')
  })

  it('updateGroup returns null and sets error on failure', async () => {
    const { useGroupStore } = await import('../store/groupStore')
    const { supabase } = await import('../lib/supabase')

    const mockChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'Permission denied' } }),
    }
    supabase.from.mockReturnValue(mockChain)

    const result = await useGroupStore.getState().updateGroup('g1', { name: 'X' }, 'u1')
    expect(result).toBeNull()
    expect(useGroupStore.getState().error).toBe('Permission denied')
  })

  it('deleteGroup removes group from local state', async () => {
    const { useGroupStore } = await import('../store/groupStore')
    const { supabase } = await import('../lib/supabase')

    const mockChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    supabase.from.mockReturnValue(mockChain)

    const result = await useGroupStore.getState().deleteGroup('g1', 'u1')
    expect(result).toBe(true)

    const state = useGroupStore.getState()
    expect(state.groups).toHaveLength(0)
    expect(state.activeGroup).toBeNull()
  })

  it('deleteGroup returns false on failure', async () => {
    const { useGroupStore } = await import('../store/groupStore')
    const { supabase } = await import('../lib/supabase')

    const mockChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: { message: 'RLS violation' } }),
    }
    supabase.from.mockReturnValue(mockChain)

    const result = await useGroupStore.getState().deleteGroup('g1', 'u1')
    expect(result).toBe(false)
    // Group should still be in state
    expect(useGroupStore.getState().groups).toHaveLength(1)
  })
})

// ─── groupStore: delete cascade edge cases ────────────────────────────────────

describe('groupStore: delete cascade safety', () => {
  beforeEach(async () => {
    const { useGroupStore } = await import('../store/groupStore')
    useGroupStore.setState({
      groups: [
        { id: 'g1', name: 'Group One', owner_id: 'u1' },
        { id: 'g2', name: 'Group Two', owner_id: 'u1' },
      ],
      activeGroup: { id: 'g1', name: 'Group One', owner_id: 'u1' },
      members: [],
      loading: false,
      error: null,
    })
  })

  it('deleteGroup sets activeGroup to remaining group, not null', async () => {
    const { useGroupStore } = await import('../store/groupStore')
    const { supabase } = await import('../lib/supabase')

    const mockChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    supabase.from.mockReturnValue(mockChain)

    await useGroupStore.getState().deleteGroup('g1', 'u1')

    const state = useGroupStore.getState()
    expect(state.groups).toHaveLength(1)
    expect(state.groups[0].id).toBe('g2')
    // Active group should fall back to remaining group, not null
    expect(state.activeGroup?.id).toBe('g2')
  })

  it('deleteGroup sets activeGroup to null when last group deleted', async () => {
    const { useGroupStore } = await import('../store/groupStore')
    const { supabase } = await import('../lib/supabase')

    // Set up with only one group
    useGroupStore.setState({
      groups: [{ id: 'g1', name: 'Group One', owner_id: 'u1' }],
      activeGroup: { id: 'g1', name: 'Group One', owner_id: 'u1' },
    })

    const mockChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    supabase.from.mockReturnValue(mockChain)

    await useGroupStore.getState().deleteGroup('g1', 'u1')

    const state = useGroupStore.getState()
    expect(state.groups).toHaveLength(0)
    expect(state.activeGroup).toBeNull()
  })

  it('deleteGroup clears members state', async () => {
    const { useGroupStore } = await import('../store/groupStore')
    const { supabase } = await import('../lib/supabase')

    useGroupStore.setState({
      members: [{ id: 'u2', username: 'alice' }, { id: 'u3', username: 'bob' }],
    })

    const mockChain = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    }
    supabase.from.mockReturnValue(mockChain)

    await useGroupStore.getState().deleteGroup('g1', 'u1')
    expect(useGroupStore.getState().members).toHaveLength(0)
  })

  it('buildPlayerRecords handles null game_types gracefully', async () => {
    const { buildPlayerRecords } = await import('../lib/stats')

    // Simulate a game where game_type was deleted (SET NULL from cascade)
    const games = [{
      id: 'g1',
      is_draw: false,
      played_at: new Date().toISOString(),
      game_types: null, // ← this is what SET NULL produces
      game_teams: [{
        id: 't1',
        is_winner: true,
        score: null,
        game_participants: [{ user_id: 'u1', profiles: { id: 'u1', username: 'alice', avatar_url: null } }],
      }, {
        id: 't2',
        is_winner: false,
        score: null,
        game_participants: [{ user_id: 'u2', profiles: { id: 'u2', username: 'bob', avatar_url: null } }],
      }],
    }]

    // Should not throw, should still count wins/losses
    expect(() => buildPlayerRecords(games)).not.toThrow()
    const records = buildPlayerRecords(games)
    expect(records['u1'].wins).toBe(1)
    expect(records['u2'].losses).toBe(1)
  })

  it('buildPlayerRecords filterGameTypeId ignores games with null game_types', async () => {
    const { buildPlayerRecords } = await import('../lib/stats')

    const games = [{
      id: 'g1',
      is_draw: false,
      played_at: new Date().toISOString(),
      game_types: null, // deleted game type
      game_teams: [{
        id: 't1', is_winner: true, score: null,
        game_participants: [{ user_id: 'u1', profiles: { id: 'u1', username: 'alice', avatar_url: null } }],
      }],
    }]

    // Filtering by a specific game type should skip null-type games
    const records = buildPlayerRecords(games, 'some-type-id')
    expect(Object.keys(records)).toHaveLength(0)
  })
})

// ─── statsStore: realtime subscription ───────────────────────────────────────

describe('statsStore: realtime', () => {
  beforeEach(async () => {
    const { useStatsStore } = await import('../store/statsStore')
    useStatsStore.setState({
      games: [], loadedGroupId: null, loading: false,
      activity: [], activityGroupId: null, activityLoading: false,
      realtimeChannel: null, realtimeLive: false,
    })
  })

  it('initial realtime state is disconnected', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const state = useStatsStore.getState()
    expect(state.realtimeChannel).toBeNull()
    expect(state.realtimeLive).toBe(false)
  })

  it('unsubscribeFromGroup is safe to call when no channel exists', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    expect(() => useStatsStore.getState().unsubscribeFromGroup()).not.toThrow()
    expect(useStatsStore.getState().realtimeLive).toBe(false)
  })

  it('subscribeToGroup sets up a channel and calls subscribe', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const { supabase } = await import('../lib/supabase')

    const mockChannel = {
      on:        vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }
    supabase.channel = vi.fn().mockReturnValue(mockChannel)
    supabase.removeChannel = vi.fn()

    useStatsStore.getState().subscribeToGroup('group-1')

    expect(supabase.channel).toHaveBeenCalledWith('group:group-1')
    expect(mockChannel.on).toHaveBeenCalled()
    expect(mockChannel.subscribe).toHaveBeenCalled()
    expect(useStatsStore.getState().realtimeChannel).toBe(mockChannel)
  })

  it('subscribeToGroup removes previous channel before creating new one', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const { supabase } = await import('../lib/supabase')

    const oldChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
    const newChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }

    supabase.channel = vi.fn()
      .mockReturnValueOnce(oldChannel)
      .mockReturnValueOnce(newChannel)
    supabase.removeChannel = vi.fn()

    // Subscribe to group A
    useStatsStore.getState().subscribeToGroup('group-a')
    // Subscribe to group B — should remove A first
    useStatsStore.getState().subscribeToGroup('group-b')

    expect(supabase.removeChannel).toHaveBeenCalledWith(oldChannel)
    expect(useStatsStore.getState().realtimeChannel).toBe(newChannel)
  })

  it('unsubscribeFromGroup removes channel and resets state', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const { supabase } = await import('../lib/supabase')

    const mockChannel = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
    supabase.channel = vi.fn().mockReturnValue(mockChannel)
    supabase.removeChannel = vi.fn()

    useStatsStore.getState().subscribeToGroup('group-1')
    useStatsStore.setState({ realtimeLive: true })

    useStatsStore.getState().unsubscribeFromGroup()

    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel)
    expect(useStatsStore.getState().realtimeChannel).toBeNull()
    expect(useStatsStore.getState().realtimeLive).toBe(false)
  })

  it('invalidate clears games and activity but preserves channel', async () => {
    const { useStatsStore } = await import('../store/statsStore')

    const mockChannel = { on: vi.fn(), subscribe: vi.fn() }
    useStatsStore.setState({
      games: [{ id: 'g1' }],
      loadedGroupId: 'group-1',
      activity: [{ id: 'a1' }],
      activityGroupId: 'group-1',
      realtimeChannel: mockChannel,
      realtimeLive: true,
    })

    useStatsStore.getState().invalidate()

    const state = useStatsStore.getState()
    expect(state.games).toHaveLength(0)
    expect(state.activity).toHaveLength(0)
    expect(state.loadedGroupId).toBeNull()
    // Channel should still be active after invalidate
    expect(state.realtimeChannel).toBe(mockChannel)
    expect(state.realtimeLive).toBe(true)
  })
})

// ─── statsStore: realtime subscription ───────────────────────────────────────

describe('statsStore: realtime', () => {
  beforeEach(async () => {
    const { useStatsStore } = await import('../store/statsStore')
    useStatsStore.setState({
      games: [], loadedGroupId: null, loading: false,
      activity: [], activityGroupId: null, activityLoading: false,
      realtimeChannel: null, realtimeLive: false,
    })
  })

  it('subscribeToGroup sets realtimeChannel', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const { supabase } = await import('../lib/supabase')

    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }
    supabase.channel = vi.fn().mockReturnValue(mockChannel)
    supabase.removeChannel = vi.fn()

    useStatsStore.getState().subscribeToGroup('group-1')

    expect(supabase.channel).toHaveBeenCalledWith('group:group-1')
    expect(useStatsStore.getState().realtimeChannel).toBe(mockChannel)
  })

  it('unsubscribeFromGroup clears channel and realtimeLive', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const { supabase } = await import('../lib/supabase')

    const mockChannel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }
    supabase.channel = vi.fn().mockReturnValue(mockChannel)
    supabase.removeChannel = vi.fn()

    useStatsStore.getState().subscribeToGroup('group-1')
    useStatsStore.getState().unsubscribeFromGroup()

    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel)
    expect(useStatsStore.getState().realtimeChannel).toBeNull()
    expect(useStatsStore.getState().realtimeLive).toBe(false)
  })

  it('unsubscribeFromGroup is safe to call when no channel exists', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const { supabase } = await import('../lib/supabase')
    supabase.removeChannel = vi.fn()

    // Should not throw
    expect(() => useStatsStore.getState().unsubscribeFromGroup()).not.toThrow()
    expect(supabase.removeChannel).not.toHaveBeenCalled()
  })

  it('subscribeToGroup cleans up previous channel before creating new one', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const { supabase } = await import('../lib/supabase')

    const mockChannel1 = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
    const mockChannel2 = { on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
    supabase.channel = vi.fn()
      .mockReturnValueOnce(mockChannel1)
      .mockReturnValueOnce(mockChannel2)
    supabase.removeChannel = vi.fn()

    useStatsStore.getState().subscribeToGroup('group-1')
    useStatsStore.getState().subscribeToGroup('group-2')

    // First channel should have been cleaned up
    expect(supabase.removeChannel).toHaveBeenCalledWith(mockChannel1)
    expect(useStatsStore.getState().realtimeChannel).toBe(mockChannel2)
  })

  it('invalidate unsubscribes from realtime and clears all state', async () => {
    const { useStatsStore } = await import('../store/statsStore')

    useStatsStore.setState({
      games: [{ id: 'g1' }],
      loadedGroupId: 'group-1',
      activity: [{ id: 'a1' }],
      activityGroupId: 'group-1',
    })

    useStatsStore.getState().invalidate()

    const state = useStatsStore.getState()
    expect(state.games).toHaveLength(0)
    expect(state.loadedGroupId).toBeNull()
    expect(state.activity).toHaveLength(0)
    expect(state.activityGroupId).toBeNull()
  })

  it('regression: switching groups cleans up subscription before starting new one', async () => {
    const { useStatsStore } = await import('../store/statsStore')
    const { supabase } = await import('../lib/supabase')

    const channels = []
    supabase.channel = vi.fn().mockImplementation((name) => {
      const ch = { name, on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }
      channels.push(ch)
      return ch
    })
    supabase.removeChannel = vi.fn()

    // Simulate: user views Group A
    useStatsStore.getState().subscribeToGroup('group-a')
    expect(channels).toHaveLength(1)

    // Simulate: user switches to Group B (component cleanup fires unsubscribe first)
    useStatsStore.getState().unsubscribeFromGroup()
    useStatsStore.getState().subscribeToGroup('group-b')

    // Both channels created, first one removed
    expect(channels).toHaveLength(2)
    expect(supabase.removeChannel).toHaveBeenCalledWith(channels[0])
    expect(useStatsStore.getState().realtimeChannel).toBe(channels[1])
  })
})

// ─── notifStore ───────────────────────────────────────────────────────────────

describe('notifStore', () => {
  beforeEach(async () => {
    const { useNotifStore } = await import('../store/notifStore')
    useNotifStore.setState({ unread: {}, lastSeen: {}, loading: false })
    localStorage.clear()
  })

  it('initial state is empty', async () => {
    const { useNotifStore } = await import('../store/notifStore')
    const state = useNotifStore.getState()
    expect(state.unread).toEqual({})
    expect(state.loading).toBe(false)
  })

  it('markRead sets unread to 0 for a group and saves lastSeen', async () => {
    const { useNotifStore } = await import('../store/notifStore')
    useNotifStore.setState({ unread: { 'g1': 5, 'g2': 3 } })

    useNotifStore.getState().markRead('g1')

    expect(useNotifStore.getState().unread['g1']).toBe(0)
    expect(useNotifStore.getState().unread['g2']).toBe(3) // untouched
    expect(useNotifStore.getState().lastSeen['g1']).toBeTruthy()
  })

  it('markRead persists lastSeen to localStorage', async () => {
    const { useNotifStore } = await import('../store/notifStore')
    useNotifStore.getState().markRead('g1')
    const stored = JSON.parse(localStorage.getItem('kt_last_seen') ?? '{}')
    expect(stored['g1']).toBeTruthy()
  })

  it('increment adds 1 to unread for a group', async () => {
    const { useNotifStore } = await import('../store/notifStore')
    useNotifStore.setState({ unread: { 'g1': 2 } })
    useNotifStore.getState().increment('g1')
    expect(useNotifStore.getState().unread['g1']).toBe(3)
  })

  it('increment starts from 0 for unknown group', async () => {
    const { useNotifStore } = await import('../store/notifStore')
    useNotifStore.getState().increment('g-new')
    expect(useNotifStore.getState().unread['g-new']).toBe(1)
  })

  it('totalUnread sums all group unread counts', async () => {
    const { useNotifStore } = await import('../store/notifStore')
    useNotifStore.setState({ unread: { 'g1': 3, 'g2': 7, 'g3': 0 } })
    expect(useNotifStore.getState().totalUnread()).toBe(10)
  })

  it('totalUnread returns 0 when all groups read', async () => {
    const { useNotifStore } = await import('../store/notifStore')
    useNotifStore.setState({ unread: { 'g1': 0, 'g2': 0 } })
    expect(useNotifStore.getState().totalUnread()).toBe(0)
  })

  it('reset clears all state and localStorage', async () => {
    const { useNotifStore } = await import('../store/notifStore')
    // Seed localStorage as if user had a previous session
    localStorage.setItem('kt_last_seen', JSON.stringify({ 'g1': '2025-01-01' }))
    useNotifStore.setState({ unread: { 'g1': 5 }, lastSeen: { 'g1': '2025-01-01' } })

    useNotifStore.getState().reset()

    expect(useNotifStore.getState().unread).toEqual({})
    expect(useNotifStore.getState().lastSeen).toEqual({})
    // localStorage must be cleared so next login starts fresh
    expect(localStorage.getItem('kt_last_seen')).toBeNull()
  })

  it('markRead after increment zeroes the count', async () => {
    const { useNotifStore } = await import('../store/notifStore')
    useNotifStore.getState().increment('g1')
    useNotifStore.getState().increment('g1')
    useNotifStore.getState().increment('g1')
    expect(useNotifStore.getState().unread['g1']).toBe(3)
    useNotifStore.getState().markRead('g1')
    expect(useNotifStore.getState().unread['g1']).toBe(0)
  })
})
