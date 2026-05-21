import { useState, useEffect, useMemo } from 'react'
import {
  User, Mail, Camera, Shield, ShieldCheck, ShieldOff,
  LogOut, Save, Trophy, TrendingUp, Swords, Star, ChevronRight
} from 'lucide-react'
import { useAuthStore }  from '../../store/authStore'
import { useGroupStore } from '../../store/groupStore'
import { useStatsStore } from '../../store/statsStore'
import { supabase }      from '../../lib/supabase'
import { buildPlayerRecords, formatStreak, fmtPct } from '../../lib/stats'
import { useToast }      from '../../components/ui/Toast'
import { usePageTitle }   from '../../hooks/usePageTitle'
import { ProfileSkeleton }  from '../../components/ui/Skeleton'
import AvatarUpload         from '../../components/ui/AvatarUpload'

// ── MFA Section ───────────────────────────────────────────────
function MFASection() {
  const toast = useToast()
  const [factors,   setFactors]   = useState([])
  const [step,      setStep]      = useState('idle')  // idle | setup | verify | disable
  const [qr,        setQr]        = useState(null)
  const [secret,    setSecret]    = useState(null)
  const [factorId,  setFactorId]  = useState(null)
  const [code,      setCode]      = useState('')
  const [loading,   setLoading]   = useState(false)

  const loadFactors = async () => {
    const { data } = await supabase.auth.mfa.listFactors()
    setFactors(data?.totp ?? [])
  }

  useEffect(() => { loadFactors() }, [])

  const verified = factors.find(f => f.status === 'verified')

  const handleEnroll = async () => {
    setLoading(true)
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: 'Keep Track' })
    if (error) { toast.error('Failed to start MFA setup.'); setLoading(false); return }
    setQr(data.totp.qr_code)
    setSecret(data.totp.secret)
    setFactorId(data.id)
    setStep('setup')
    setLoading(false)
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    setLoading(true)
    const { data: challengeData } = await supabase.auth.mfa.challenge({ factorId })
    const { error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: code.replace(/\s/g, ''),
    })
    if (error) { toast.error('Invalid code. Try again.'); setLoading(false); return }
    toast.success('Two-factor authentication enabled!')
    setStep('idle')
    setCode('')
    await loadFactors()
    setLoading(false)
  }

  const handleDisable = async () => {
    setLoading(true)
    await supabase.auth.mfa.unenroll({ factorId: verified.id })
    toast.success('Two-factor authentication disabled.')
    setStep('idle')
    await loadFactors()
    setLoading(false)
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center
          ${verified ? 'bg-emerald-500/20' : 'bg-surface-4'}`}>
          {verified
            ? <ShieldCheck size={18} className="text-emerald-400" />
            : <Shield      size={18} className="text-white/40" />
          }
        </div>
        <div>
          <p className="font-600 text-white text-sm">Two-Factor Authentication</p>
          <p className={`text-xs ${verified ? 'text-emerald-400' : 'text-white/40'}`}>
            {verified ? 'Enabled — your account is protected' : 'Not enabled'}
          </p>
        </div>
      </div>

      {step === 'idle' && (
        verified ? (
          <button onClick={() => setStep('disable')} className="btn-danger btn-sm w-full">
            <ShieldOff size={14} /> Disable 2FA
          </button>
        ) : (
          <button onClick={handleEnroll} className="btn-secondary w-full" disabled={loading}>
            {loading ? <span className="spinner" /> : <><ShieldCheck size={14} /> Enable 2FA</>}
          </button>
        )
      )}

      {step === 'setup' && qr && (
        <div className="flex flex-col gap-4 animate-slide-down">
          <div className="divider pt-4" />
          <p className="text-white/60 text-sm">
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.),
            then enter the 6-digit code to confirm.
          </p>
          <div className="flex justify-center">
            <div className="bg-white p-3 rounded-xl inline-block">
              <img src={qr} alt="MFA QR Code" className="w-40 h-40" />
            </div>
          </div>
          <div className="bg-surface-3 border border-surface-5 rounded-xl px-3 py-2 text-center">
            <p className="text-white/30 text-xs mb-1">Or enter this code manually:</p>
            <p className="font-mono text-white/70 text-sm tracking-widest break-all">{secret}</p>
          </div>
          <form onSubmit={handleVerify} className="flex flex-col gap-3">
            <div>
              <label className="input-label">Verification Code</label>
              <input
                className="input text-center text-xl tracking-widest font-mono"
                type="text"
                inputMode="numeric"
                placeholder="000 000"
                maxLength={7}
                value={code}
                onChange={e => setCode(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setStep('idle')} className="btn-secondary flex-1">Cancel</button>
              <button type="submit" className="btn-primary flex-1" disabled={loading}>
                {loading ? <span className="spinner" /> : 'Verify & Enable'}
              </button>
            </div>
          </form>
        </div>
      )}

      {step === 'disable' && (
        <div className="flex flex-col gap-3 animate-slide-down">
          <div className="divider pt-2" />
          <p className="text-white/50 text-sm">
            Are you sure? Disabling 2FA makes your account less secure.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setStep('idle')} className="btn-secondary flex-1">Cancel</button>
            <button onClick={handleDisable} className="btn-danger flex-1" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Disable 2FA'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Lifetime stat card ────────────────────────────────────────
function LifetimeStat({ label, value, color = 'text-white', sub }) {
  return (
    <div className="stat-card">
      <span className={`stat-value ${color}`}>{value}</span>
      <span className="stat-label">{label}</span>
      {sub && <span className="text-white/25 text-xs mt-0.5">{sub}</span>}
    </div>
  )
}

// ── Main profile page ─────────────────────────────────────────
export default function ProfilePage() {
  usePageTitle('Profile')
  const toast = useToast()
  const { user, profile, setProfile, signOut } = useAuthStore()
  const { groups, fetchGroups } = useGroupStore()
  const { games, fetchAllGames } = useStatsStore()

  const [editing,   setEditing]   = useState(false)
  const [username,  setUsername]  = useState(profile?.username ?? '')
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? '')
  const [saving,    setSaving]    = useState(false)
  const [allGames,  setAllGames]  = useState([])
  const [loadingStats, setLoadingStats] = useState(true)

  useEffect(() => {
    if (user) fetchGroups(user.id)
  }, [user])

  // Fetch games from all groups for lifetime stats
  useEffect(() => {
    if (!groups.length) return
    const load = async () => {
      setLoadingStats(true)
      const results = await Promise.all(
        groups.map(g =>
          supabase
            .from('games')
            .select(`
              id, played_at, is_draw,
              game_types ( id, name, category ),
              game_teams (
                id, is_winner,
                game_participants (
                  user_id,
                  profiles ( id, username, avatar_url )
                )
              )
            `)
            .eq('group_id', g.id)
            .order('played_at', { ascending: true })
            .then(r => r.data ?? [])
        )
      )
      setAllGames(results.flat())
      setLoadingStats(false)
    }
    load()
  }, [groups.length])

  // Lifetime stats across all groups
  const lifetimeRecord = useMemo(() => {
    if (!allGames.length || !user) return null
    return buildPlayerRecords(allGames)[user.id] ?? null
  }, [allGames, user])

  // Most played game type
  const mostPlayed = useMemo(() => {
    if (!allGames.length || !user) return null
    const counts = {}
    for (const game of allGames) {
      const participated = (game.game_teams ?? [])
        .flatMap(t => t.game_participants ?? [])
        .some(p => p.user_id === user.id)
      if (!participated) continue
      const name = game.game_types?.name
      if (name) counts[name] = (counts[name] ?? 0) + 1
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1])
    return sorted[0] ? { name: sorted[0][0], count: sorted[0][1] } : null
  }, [allGames, user])

  const streak = lifetimeRecord ? formatStreak(lifetimeRecord.currentStreak) : null

  const handleSave = async () => {
    if (!username.trim()) { toast.error('Username cannot be empty.'); return }
    setSaving(true)

    // Check username uniqueness (skip if unchanged)
    if (username !== profile?.username) {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username.trim())
        .neq('id', user.id)
        .maybeSingle()
      if (existing) { toast.error('Username already taken.'); setSaving(false); return }
    }

    // Strip cache-bust param before persisting
    const cleanAvatarUrl = avatarUrl.trim()
      ? avatarUrl.trim().split('?')[0]
      : null

    const { data, error } = await supabase
      .from('profiles')
      .update({ username: username.trim(), avatar_url: cleanAvatarUrl })
      .eq('id', user.id)
      .select()
      .single()

    if (error) { toast.error('Failed to save profile.'); setSaving(false); return }
    setProfile(data)
    setEditing(false)
    toast.success('Profile updated!')
    setSaving(false)
  }

  if (loadingStats && !profile) return <ProfileSkeleton />

  return (
    <div className="px-4 py-6 max-w-lg mx-auto lg:px-6 lg:py-8 animate-fade-in">

      {/* Avatar + name */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative shrink-0">
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.username}
              className="w-16 h-16 rounded-2xl object-cover border border-surface-4"
              onError={e => {
                e.currentTarget.style.display = 'none'
                e.currentTarget.nextElementSibling?.style.removeProperty('display')
              }}
            />
          ) : null}
          <div className={`w-16 h-16 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center ${profile?.avatar_url ? 'hidden' : ''}`}>
            <span className="font-display text-3xl text-brand-400">
              {profile?.username?.[0]?.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-3xl text-white truncate">{profile?.username}</h1>
          <p className="text-white/40 text-sm truncate">{profile?.email}</p>
          <p className="text-white/25 text-xs mt-0.5">
            {groups.length} {groups.length === 1 ? 'group' : 'groups'}
          </p>
        </div>
        <button
          onClick={() => { setEditing(e => !e); setUsername(profile?.username ?? ''); setAvatarUrl(profile?.avatar_url ?? '') }}
          className="btn-secondary btn-sm shrink-0"
        >
          {editing ? 'Cancel' : <><Camera size={13} /> Edit</>}
        </button>
      </div>

      {/* Edit form */}
      {editing && (
        <div className="card p-5 mb-5 animate-slide-down">
          <h2 className="font-display text-lg text-white mb-4">Edit Profile</h2>
          <div className="flex flex-col gap-4">

            {/* Avatar upload */}
            <AvatarUpload
              userId={user?.id}
              currentUrl={avatarUrl}
              username={username}
              onUpload={url => setAvatarUrl(url ?? '')}
            />

            <div className="divider" />

            <div>
              <label className="input-label"><User size={11} className="inline mr-1" />Username</label>
              <input
                className="input"
                value={username}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                maxLength={30}
              />
            </div>

            <button onClick={handleSave} className="btn-primary w-full" disabled={saving}>
              {saving ? <span className="spinner" /> : <><Save size={15} /> Save Changes</>}
            </button>
          </div>
        </div>
      )}

      {/* Lifetime stats */}
      <div className="mb-5">
        <h2 className="section-title mb-3">Lifetime Stats</h2>
        {loadingStats ? (
          <div className="grid grid-cols-2 gap-3">
            {[1,2,3,4].map(i => (
              <div key={i} className="stat-card animate-pulse">
                <div className="h-8 w-12 bg-surface-4 rounded-lg" />
                <div className="h-3 w-10 bg-surface-4 rounded mt-1" />
              </div>
            ))}
          </div>
        ) : lifetimeRecord ? (
          <div className="grid grid-cols-2 gap-3">
            <LifetimeStat label="Win %" value={fmtPct(lifetimeRecord.winPct)} color="text-brand-400"
              sub={`${lifetimeRecord.points} pts`} />
            <LifetimeStat label="Record" color="text-white"
              value={`${lifetimeRecord.wins}W ${lifetimeRecord.losses}L${lifetimeRecord.draws ? ` ${lifetimeRecord.draws}D` : ''}`} />
            <LifetimeStat label="Games Played" value={lifetimeRecord.played} color="text-sky-400" />
            <LifetimeStat
              label="Streak"
              value={streak?.label ?? '—'}
              color={streak?.color ?? 'text-white/30'}
              sub={`Best: ${lifetimeRecord.bestStreak}W`}
            />
          </div>
        ) : (
          <div className="card p-5 text-center">
            <p className="text-white/40 text-sm">No games recorded yet. Log your first game to see stats.</p>
          </div>
        )}

        {mostPlayed && (
          <div className="card p-4 mt-3 flex items-center gap-3">
            <Star size={16} className="text-yellow-400 shrink-0" />
            <div>
              <p className="text-white/40 text-xs font-600 uppercase tracking-wider">Most Played</p>
              <p className="font-600 text-white text-sm">{mostPlayed.name}</p>
            </div>
            <span className="ml-auto text-white/30 text-xs">{mostPlayed.count} games</span>
          </div>
        )}
      </div>

      {/* Per-group breakdown */}
      {groups.length > 0 && (
        <div className="mb-5">
          <h2 className="section-title mb-3">Groups</h2>
          <div className="flex flex-col gap-2">
            {groups.map(g => (
              <div key={g.id} className="card px-4 py-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-brand-500/20 border border-brand-500/20 flex items-center justify-center shrink-0">
                  <span className="font-display text-sm text-brand-400">{g.name[0].toUpperCase()}</span>
                </div>
                <p className="font-600 text-white text-sm flex-1 truncate">{g.name}</p>
                <span className={`text-xs font-600 px-2 py-0.5 rounded-full
                  ${g.myRole === 'admin' ? 'bg-brand-500/20 text-brand-400' : 'bg-surface-4 text-white/40'}`}>
                  {g.myRole}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Security */}
      <div className="mb-5">
        <h2 className="section-title mb-3">Security</h2>
        <MFASection />
      </div>

      {/* Sign out */}
      <div className="divider mb-5" />
      <button
        onClick={async () => {
          await signOut()
        }}
        className="btn-danger w-full"
      >
        <LogOut size={16} /> Sign Out
      </button>
    </div>
  )
}
