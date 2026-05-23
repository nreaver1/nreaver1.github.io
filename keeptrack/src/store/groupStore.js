import { create } from 'zustand'
import { supabase }       from '../lib/supabase'
import { useNotifStore }  from './notifStore'

export const useGroupStore = create((set, get) => ({
  groups:        [],
  activeGroup:   null,
  members:       [],
  invites:       [],
  loading:       false,
  error:         null,

  // ── Fetch all groups the current user belongs to ──
  fetchGroups: async (userId) => {
    set({ loading: true, error: null })
    const { data, error } = await supabase
      .from('group_members')
      .select(`
        role,
        joined_at,
        groups (
          id, name, description, owner_id, created_at
        )
      `)
      .eq('user_id', userId)

    if (error) { set({ loading: false, error: error.message }); return }

    const groups = data.map(row => ({ ...row.groups, myRole: row.role, joinedAt: row.joined_at }))
    set({ groups, loading: false })
    // Fetch unread notification counts for all groups
    useNotifStore.getState().fetchUnread(groups)

    // Auto-set active group if none selected
    if (!get().activeGroup && groups.length > 0) {
      get().setActiveGroup(groups[0])
    }
  },

  // ── Set the currently viewed group ──
  setActiveGroup: async (group) => {
    set({ activeGroup: group })
    if (group) {
      await get().fetchMembers(group.id)
    }
  },

  // ── Fetch members for a group ──
  fetchMembers: async (groupId) => {
    set({ members: [] }) // clear stale members immediately
    const { data, error } = await supabase
      .from('group_members')
      .select(`
        id, role, joined_at,
        profiles ( id, username, email, avatar_url )
      `)
      .eq('group_id', groupId)
      .order('joined_at', { ascending: true })

    if (!error) {
      set({ members: data.map(m => ({ ...m.profiles, role: m.role, joinedAt: m.joined_at, memberId: m.id })) })
    }
  },

  // ── Create a new group ──
  createGroup: async (userId, { name, description }) => {
    set({ loading: true, error: null })

    const { data: group, error: groupError } = await supabase
      .from('groups')
      .insert({ name: name.trim(), description: description?.trim() || null, owner_id: userId })
      .select()
      .single()

    if (groupError) { set({ loading: false, error: groupError.message }); return null }

    // Add creator as admin member
    await supabase.from('group_members').insert({
      group_id: group.id,
      user_id:  userId,
      role:     'admin',
    })

    await get().fetchGroups(userId)
    set({ loading: false })
    return group
  },

  // ── Generate an invite link ──
  createInvite: async (groupId, createdBy) => {
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('group_invites')
      .insert({ group_id: groupId, created_by: createdBy, token, expires_at: expiresAt, revoked: false })
      .select()
      .single()

    if (error) return null
    return data
  },

  // ── Fetch active invites for a group ──
  fetchInvites: async (groupId) => {
    const { data, error } = await supabase
      .from('group_invites')
      .select('*, profiles(username)')
      .eq('group_id', groupId)
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })

    if (!error) set({ invites: data || [] })
  },

  // ── Revoke an invite ──
  revokeInvite: async (inviteId, groupId) => {
    await supabase.from('group_invites').update({ revoked: true }).eq('id', inviteId)
    await get().fetchInvites(groupId)
  },

  // ── Join a group via token ──
  joinByToken: async (token, userId) => {
    // Look up the invite
    const { data: invite, error } = await supabase
      .from('group_invites')
      .select('*, groups(id, name, description, owner_id)')
      .eq('token', token)
      .eq('revoked', false)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (error || !invite) return { error: 'Invite link is invalid or has expired.' }

    // Check if already a member
    const { data: existing } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', invite.group_id)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) return { error: 'You are already a member of this group.', alreadyMember: true, group: invite.groups }

    // Join the group
    const { error: joinError } = await supabase
      .from('group_members')
      .insert({ group_id: invite.group_id, user_id: userId, role: 'member' })

    if (joinError) return { error: joinError.message }

    await get().fetchGroups(userId)
    return { success: true, group: invite.groups }
  },

  // ── Remove a member (admin only) ──
  removeMember: async (groupId, targetUserId, requestingUserId) => {
    await supabase
      .from('group_members')
      .delete()
      .eq('group_id', groupId)
      .eq('user_id', targetUserId)

    await get().fetchMembers(groupId)
  },

  // ── Update a member's role (admin only) ──
  updateRole: async (groupId, targetUserId, newRole) => {
    await supabase
      .from('group_members')
      .update({ role: newRole })
      .eq('group_id', groupId)
      .eq('user_id', targetUserId)

    await get().fetchMembers(groupId)
  },

  // ── Transfer ownership ──
  transferOwnership: async (groupId, newOwnerId, currentUserId) => {
    // Update the groups table owner
    await supabase.from('groups').update({ owner_id: newOwnerId }).eq('id', groupId)
    // Promote new owner to admin, demote old owner to member
    await supabase.from('group_members').update({ role: 'admin' }).eq('group_id', groupId).eq('user_id', newOwnerId)
    await supabase.from('group_members').update({ role: 'member' }).eq('group_id', groupId).eq('user_id', currentUserId)

    await get().fetchGroups(currentUserId)
    await get().fetchMembers(groupId)
  },

  // ── Leave a group ──
  leaveGroup: async (groupId, userId) => {
    await supabase.from('group_members').delete().eq('group_id', groupId).eq('user_id', userId)
    const remaining = get().groups.filter(g => g.id !== groupId)
    set({ groups: remaining, activeGroup: remaining[0] || null, members: [] })
  },

  // ── Update group name/description (admin only) ──
  updateGroup: async (groupId, { name, description }, userId) => {
    set({ loading: true, error: null })
    const { data, error } = await supabase
      .from('groups')
      .update({ name: name.trim(), description: description?.trim() || null })
      .eq('id', groupId)
      .select()
      .single()

    if (error) { set({ loading: false, error: error.message }); return null }

    // Update the group in local state
    const groups = get().groups.map(g => g.id === groupId ? { ...g, name: data.name, description: data.description } : g)
    const activeGroup = get().activeGroup?.id === groupId
      ? { ...get().activeGroup, name: data.name, description: data.description }
      : get().activeGroup
    set({ groups, activeGroup, loading: false })
    return data
  },

  // ── Delete a group (owner only) ──
  deleteGroup: async (groupId, userId) => {
    set({ loading: true, error: null })
    const { error } = await supabase.from('groups').delete().eq('id', groupId)
    if (error) { set({ loading: false, error: error.message }); return false }

    const remaining = get().groups.filter(g => g.id !== groupId)
    set({
      groups: remaining,
      activeGroup: remaining[0] || null,
      members: [],
      loading: false,
    })
    return true
  },

  clearError: () => set({ error: null }),
  setMembers: (updater) => set(state => ({
    members: typeof updater === 'function' ? updater(state.members) : updater,
  })),

}))
