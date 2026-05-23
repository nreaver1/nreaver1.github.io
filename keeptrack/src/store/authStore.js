import { create } from 'zustand'
import { supabase, startInactivityWatcher, stopInactivityWatcher } from '../lib/supabase'
import { useNotifStore } from './notifStore'

export const useAuthStore = create((set, get) => ({
  user:    null,
  profile: null,
  session: null,
  loading: true,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) {
      const profile = await get().fetchProfile(session.user.id)
      set({ session, user: session.user, profile, loading: false })
      startInactivityWatcher()
    } else {
      set({ loading: false })
    }

    supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session) {
        const profile = await get().fetchProfile(session.user.id)
        set({ session, user: session.user, profile })
        startInactivityWatcher()
      } else {
        stopInactivityWatcher()
        set({ session: null, user: null, profile: null })
      }
    })
  },

  // .maybeSingle() returns null (not a 406 error) when no row is found
  fetchProfile: async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    return data
  },

  setProfile: (profile) => set({ profile }),

  signOut: async () => {
    stopInactivityWatcher()
    await supabase.auth.signOut()
    useNotifStore.getState().reset()
    set({ user: null, profile: null, session: null })
  },
}))
