import { useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { useGroupStore } from '../store/groupStore'

export function useGroups() {
  const { user } = useAuthStore()
  const store    = useGroupStore()

  useEffect(() => {
    if (user) store.fetchGroups(user.id)
  }, [user?.id])

  return store
}
