import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crown, Users, Plus, Link as LinkIcon, ChevronRight, Trophy, BarChart2, Swords } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { useGroupStore } from '../../store/groupStore'

const HELP_ITEMS = [
  {
    icon: Users,
    color: 'purple',
    title: 'Groups are your crew',
    desc: 'A group is a shared space for a set of friends. Everyone in the group can log games, view the leaderboard, and track head-to-head records together.',
  },
  {
    icon: Trophy,
    color: 'yellow',
    title: 'Log any game you play',
    desc: 'Pick from 70+ preset games or create your own. Record who played, who won, and the score. It takes about 10 seconds.',
  },
  {
    icon: Swords,
    color: 'red',
    title: 'Head-to-head rivalries',
    desc: 'See exactly how you stack up against each friend — win rate, streaks, and score history across every game type.',
  },
  {
    icon: BarChart2,
    color: 'sky',
    title: 'Stats that actually matter',
    desc: 'Group leaderboards, win percentages, current streaks, and lifetime stats on your personal profile.',
  },
]

export default function OnboardingPage() {
  const { user } = useAuthStore()
  const { createGroup, loading } = useGroupStore()
  const navigate = useNavigate()

  const [mode, setMode] = useState(null) // null | 'create' | 'join'
  const [groupName, setGroupName] = useState('')
  const [groupDesc, setGroupDesc] = useState('')
  const [inviteToken, setInviteToken] = useState('')
  const [error, setError] = useState('')

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!groupName.trim()) { setError('Group name is required.'); return }
    setError('')
    const group = await createGroup(user.id, { name: groupName, description: groupDesc })
    if (group) navigate('/groups')
  }

  const handleJoinNavigate = (e) => {
    e.preventDefault()
    const token = inviteToken.trim()
    if (!token) { setError('Paste an invite link or code.'); return }
    // Extract token from full URL if pasted
    const match = token.match(/invite\/([a-zA-Z0-9]+)/)
    navigate(`/invite/${match ? match[1] : token}`)
  }

  return (
    <div className="min-h-[100dvh] bg-surface-0 flex flex-col items-center justify-center px-4 py-12">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-96 bg-brand-500/8 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-lg relative animate-slide-up">

        {/* Logo + welcome */}
        <div className="flex flex-col items-center gap-3 mb-8 text-center">
          <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center shadow-glow">
            <Crown size={26} className="text-white" />
          </div>
          <div>
            <h1 className="font-display text-4xl tracking-wide text-white">Welcome to Keep Track</h1>
            <p className="text-white/40 text-sm mt-1">You're in. Now let's get your crew set up.</p>
          </div>
        </div>

        {/* How it works */}
        {!mode && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {HELP_ITEMS.map(({ icon: Icon, color, title, desc }) => (
              <div key={title} className="card p-4 flex flex-col gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center
                  ${color === 'purple' ? 'bg-purple-500/20' : ''}
                  ${color === 'yellow' ? 'bg-yellow-500/20' : ''}
                  ${color === 'red'    ? 'bg-red-500/20'    : ''}
                  ${color === 'sky'    ? 'bg-sky-500/20'    : ''}
                `}>
                  <Icon size={16} className={`
                    ${color === 'purple' ? 'text-purple-400' : ''}
                    ${color === 'yellow' ? 'text-yellow-400' : ''}
                    ${color === 'red'    ? 'text-red-400'    : ''}
                    ${color === 'sky'    ? 'text-sky-400'    : ''}
                  `} />
                </div>
                <p className="font-600 text-white text-sm">{title}</p>
                <p className="text-white/40 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Action selection */}
        {!mode && (
          <div className="flex flex-col gap-3">
            <p className="text-center text-white/30 text-xs uppercase tracking-wider font-600 mb-1">
              To get started, choose one:
            </p>
            <button
              onClick={() => setMode('create')}
              className="card-hover p-4 flex items-center gap-4"
            >
              <div className="w-10 h-10 bg-brand-500/20 rounded-xl flex items-center justify-center shrink-0">
                <Plus size={20} className="text-brand-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-600 text-white text-sm">Create a group</p>
                <p className="text-white/40 text-xs mt-0.5">Start a new group and invite your friends</p>
              </div>
              <ChevronRight size={16} className="text-white/20" />
            </button>

            <button
              onClick={() => setMode('join')}
              className="card-hover p-4 flex items-center gap-4"
            >
              <div className="w-10 h-10 bg-purple-500/20 rounded-xl flex items-center justify-center shrink-0">
                <LinkIcon size={20} className="text-purple-400" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-600 text-white text-sm">Join with an invite link</p>
                <p className="text-white/40 text-xs mt-0.5">Someone sent you a link? Paste it here</p>
              </div>
              <ChevronRight size={16} className="text-white/20" />
            </button>
          </div>
        )}

        {/* Create group form */}
        {mode === 'create' && (
          <div className="card p-6 animate-slide-up">
            <button onClick={() => { setMode(null); setError('') }} className="text-white/30 hover:text-white text-xs font-600 mb-4 flex items-center gap-1 transition-colors">
              ← Back
            </button>
            <h2 className="font-display text-2xl text-white mb-1">Create a Group</h2>
            <p className="text-white/40 text-sm mb-5">Give your crew a name. You can always change it later.</p>

            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div>
                <label className="input-label">Group Name <span className="text-brand-500">*</span></label>
                <input
                  className="input"
                  placeholder="e.g. Friday Night Crew"
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  maxLength={50}
                  autoFocus
                />
              </div>
              <div>
                <label className="input-label">Description <span className="text-white/20">(optional)</span></label>
                <input
                  className="input"
                  placeholder="e.g. Game nights at Jake's place"
                  value={groupDesc}
                  onChange={e => setGroupDesc(e.target.value)}
                  maxLength={120}
                />
              </div>

              {error && <p className="input-error">{error}</p>}

              <button type="submit" className="btn-primary btn-lg w-full mt-1" disabled={loading}>
                {loading ? <span className="spinner" /> : <><Plus size={18} /> Create Group</>}
              </button>
            </form>
          </div>
        )}

        {/* Join group form */}
        {mode === 'join' && (
          <div className="card p-6 animate-slide-up">
            <button onClick={() => { setMode(null); setError('') }} className="text-white/30 hover:text-white text-xs font-600 mb-4 flex items-center gap-1 transition-colors">
              ← Back
            </button>
            <h2 className="font-display text-2xl text-white mb-1">Join a Group</h2>
            <p className="text-white/40 text-sm mb-5">
              Paste the invite link or code that someone shared with you.
            </p>

            <form onSubmit={handleJoinNavigate} className="flex flex-col gap-4">
              <div>
                <label className="input-label">Invite Link or Code</label>
                <input
                  className="input font-mono text-sm"
                  placeholder="https://keeptrack.gg/invite/abc123..."
                  value={inviteToken}
                  onChange={e => setInviteToken(e.target.value)}
                  autoFocus
                />
              </div>

              {error && <p className="input-error">{error}</p>}

              <button type="submit" className="btn-primary btn-lg w-full mt-1">
                <LinkIcon size={18} /> Continue
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  )
}
