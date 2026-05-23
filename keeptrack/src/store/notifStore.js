import { create } from 'zustand'
import { supabase } from '../lib/supabase'

const STORAGE_KEY = 'kt_last_seen' // { [groupId]: ISO timestamp }

function loadLastSeen() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
  catch { return {} }
}

function saveLastSeen(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export const useNotifStore = create((set, get) => ({
  // { [groupId]: count }
  unread:      {},
  lastSeen:    loadLastSeen(),
  loading:     false,

  // ── Fetch unread counts for all groups ──────────────────
  // Called once on app load after groups are fetched.
  // For each group, counts games played_at > lastSeen[groupId].
  fetchUnread: async (groups) => {
    if (!groups?.length) return
    set({ loading: true })

    const lastSeen = get().lastSeen

    // Build per-group queries in parallel
    const results = await Promise.all(
      groups.map(async (g) => {
        const since = lastSeen[g.id] ?? g.joinedAt ?? '1970-01-01'
        const { count } = await supabase
          .from('games')
          .select('id', { count: 'exact', head: true })
          .eq('group_id', g.id)
          .gt('played_at', since)
        return { groupId: g.id, count: count ?? 0 }
      })
    )

    const unread = {}
    for (const r of results) unread[r.groupId] = r.count
    set({ unread, loading: false })
  },

  // ── Mark a group as read (called when entering a group) ──
  markRead: (groupId) => {
    const now      = new Date().toISOString()
    const lastSeen = { ...get().lastSeen, [groupId]: now }
    saveLastSeen(lastSeen)
    set({
      lastSeen,
      unread: { ...get().unread, [groupId]: 0 },
    })
  },

  // ── Increment unread count (called from realtime handler) ──
  increment: (groupId) => {
    const current = get().unread[groupId] ?? 0
    set({ unread: { ...get().unread, [groupId]: current + 1 } })
  },

  // ── Total unread across all groups ───────────────────────
  totalUnread: () => Object.values(get().unread).reduce((a, b) => a + b, 0),

  // ── Clear all (on sign out) ───────────────────────────────
  reset: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ unread: {}, lastSeen: {} })
  },
}))
