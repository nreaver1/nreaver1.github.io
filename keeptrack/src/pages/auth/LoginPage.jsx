import { useState } from 'react'
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom'
import { Crown, Eye, EyeOff, LogIn, Clock } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const navigate  = useNavigate()
  const location  = useLocation()
  const [searchParams] = useSearchParams()
  const timedOut  = searchParams.get('reason') === 'inactivity'
  const sessionExp = searchParams.get('reason') === 'session_expired'
  const redirectTo = location.state?.from ?? '/dashboard'
  const [form, setForm]       = useState({ email: '', password: '' })
  const [mfaCode, setMfaCode] = useState('')
  const [step, setStep]       = useState('login') // 'login' | 'mfa'
  const [showPw, setShowPw]   = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')
  const [factorId,   setFactorId]   = useState(null)
  const [challengeId, setChallengeId] = useState(null)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email:    form.email,
      password: form.password,
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Check if MFA is required
    if (data?.session?.user) {
      const { data: factors } = await supabase.auth.mfa.listFactors()
      const totp = factors?.totp?.find(f => f.status === 'verified')

      if (totp) {
        const { data: challenge } = await supabase.auth.mfa.challenge({ factorId: totp.id })
        setFactorId(totp.id)
        setChallengeId(challenge.id)
        setStep('mfa')
        setLoading(false)
        return
      }
    }

    setLoading(false)
    navigate(redirectTo, { replace: true })
  }

  const handleMfa = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: mfaError } = await supabase.auth.mfa.verify({
      factorId,
      challengeId,
      code: mfaCode.replace(/\s/g, ''),
    })

    if (mfaError) {
      setError('Invalid code. Please try again.')
      setLoading(false)
      return
    }

    setLoading(false)
    navigate(redirectTo, { replace: true })
  }

  return (
    <div className="min-h-[100dvh] bg-surface-0 flex flex-col items-center justify-center px-4 py-12">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative animate-slide-up">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center shadow-glow">
            <Crown size={26} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-4xl tracking-wide text-white">Keep Track</h1>
            <p className="text-white/40 text-sm mt-1">Your crew. Your stats.</p>
          </div>
        </div>

        {/* Inactivity notice */}
        {timedOut && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4 animate-slide-down">
            <Clock size={15} className="text-amber-400 shrink-0" />
            <p className="text-amber-300 text-sm">You were signed out after 30 minutes of inactivity.</p>
          </div>
        )}

        {sessionExp && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4 animate-slide-down">
            <Clock size={15} className="text-amber-400 shrink-0" />
            <p className="text-amber-300 text-sm">Your session expired after 7 days. Please sign in again.</p>
          </div>
        )}

        {/* Card */}
        <div className="card p-6">
          {step === 'login' ? (
            <>
              <h2 className="font-display text-2xl text-white mb-5">Sign In</h2>
              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <div>
                  <label className="input-label">Email</label>
                  <input
                    className="input"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    required
                    autoComplete="email"
                  />
                </div>

                <div>
                  <label className="input-label">Password</label>
                  <div className="relative">
                    <input
                      className="input pr-11"
                      type={showPw ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                    >
                      {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && <p className="input-error">{error}</p>}

                <button type="submit" className="btn-primary btn-lg w-full mt-1" disabled={loading}>
                  {loading ? <span className="spinner" /> : <><LogIn size={18} /> Sign In</>}
                </button>
              </form>
            </>
          ) : (
            <>
              <h2 className="font-display text-2xl text-white mb-2">Two-Factor Auth</h2>
              <p className="text-white/40 text-sm mb-5">Enter the 6-digit code from your authenticator app.</p>
              <form onSubmit={handleMfa} className="flex flex-col gap-4">
                <div>
                  <label className="input-label">Verification Code</label>
                  <input
                    className="input text-center text-xl tracking-widest font-mono"
                    type="text"
                    inputMode="numeric"
                    placeholder="000 000"
                    maxLength={7}
                    value={mfaCode}
                    onChange={e => setMfaCode(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                {error && <p className="input-error">{error}</p>}

                <button type="submit" className="btn-primary btn-lg w-full" disabled={loading}>
                  {loading ? <span className="spinner" /> : 'Verify'}
                </button>

                <button type="button" className="btn-ghost text-sm" onClick={() => setStep('login')}>
                  ← Back to sign in
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-white/30 text-sm mt-4">
          No account?{' '}
          <Link to="/register" className="text-brand-400 hover:text-brand-300 transition-colors font-600">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
