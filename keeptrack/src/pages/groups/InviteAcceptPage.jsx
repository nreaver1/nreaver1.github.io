import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Crown, Users, CheckCircle, XCircle } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useGroupStore } from '../../store/groupStore'

export default function InviteAcceptPage() {
  const { token }  = useParams()
  const navigate   = useNavigate()
  const { user }   = useAuthStore()
  const { joinByToken } = useGroupStore()

  const [status, setStatus]   = useState('loading') // loading | success | error | already
  const [message, setMessage] = useState('')
  const [group, setGroup]     = useState(null)

  useEffect(() => {
    if (!user || !token) return
    const join = async () => {
      const result = await joinByToken(token, user.id)
      if (result.success) {
        setGroup(result.group)
        setStatus('success')
      } else if (result.alreadyMember) {
        setGroup(result.group)
        setStatus('already')
      } else {
        setMessage(result.error)
        setStatus('error')
      }
    }
    join()
  }, [user, token])

  return (
    <div className="min-h-[100dvh] bg-surface-0 flex items-center justify-center px-4">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative animate-slide-up">
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center shadow-glow">
            <Crown size={26} className="text-white" />
          </div>
        </div>

        <div className="card p-6 text-center">
          {status === 'loading' && (
            <>
              <div className="spinner w-8 h-8 mx-auto mb-4" />
              <p className="text-white/50 text-sm">Checking your invite...</p>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle size={40} className="text-emerald-400 mx-auto mb-3" />
              <h2 className="font-display text-2xl text-white mb-2">You're in!</h2>
              <p className="text-white/50 text-sm mb-1">You've joined</p>
              <p className="font-display text-xl text-brand-400 mb-5">{group?.name}</p>
              <button onClick={() => navigate(`/groups`)} className="btn-primary btn-lg w-full">
                <Users size={18} /> Go to Group
              </button>
            </>
          )}

          {status === 'already' && (
            <>
              <Users size={40} className="text-brand-400 mx-auto mb-3" />
              <h2 className="font-display text-2xl text-white mb-2">Already a member</h2>
              <p className="text-white/50 text-sm mb-5">
                You're already in <span className="text-white font-600">{group?.name}</span>.
              </p>
              <button onClick={() => navigate('/groups')} className="btn-primary btn-lg w-full">
                Go to Group
              </button>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle size={40} className="text-red-400 mx-auto mb-3" />
              <h2 className="font-display text-2xl text-white mb-2">Invalid Invite</h2>
              <p className="text-white/50 text-sm mb-5">
                {message || 'This invite link is invalid or has expired.'}
              </p>
              <button onClick={() => navigate('/groups')} className="btn-secondary btn-lg w-full">
                Back to Groups
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
