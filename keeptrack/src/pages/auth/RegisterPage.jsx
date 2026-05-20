import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Crown, Eye, EyeOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function RegisterPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ username: '', email: '', password: '', confirm: '' })
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState(false)

  const validate = () => {
    if (form.username.length < 3)       return 'Username must be at least 3 characters.'
    if (!/\S+@\S+\.\S+/.test(form.email)) return 'Please enter a valid email.'
    if (form.password.length < 8)       return 'Password must be at least 8 characters.'
    if (form.password !== form.confirm) return 'Passwords do not match.'
    return null
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    const validationError = validate()
    if (validationError) { setError(validationError); return }

    setError('')
    setLoading(true)

    // Check username is unique
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', form.username)
      .maybeSingle()

    if (existing) {
      setError('Username already taken.')
      setLoading(false)
      return
    }

    // Sign up
    const { data, error: authError } = await supabase.auth.signUp({
      email:    form.email,
      password: form.password,
      options: {
        data: { username: form.username },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Create profile row
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id:       data.user.id,
        username: form.username,
        email:    form.email,
      })

      if (profileError) {
        // Auth user was created but profile failed — sign them out and show error
        await supabase.auth.signOut()
        setError('Account created but profile setup failed. Please try again or contact support.')
        setLoading(false)
        return
      }
    }

    setLoading(false)
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="min-h-[100dvh] bg-surface-0 flex items-center justify-center px-4">
        <div className="card p-8 max-w-sm w-full text-center animate-slide-up">
          <div className="w-14 h-14 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🎉</span>
          </div>
          <h2 className="font-display text-2xl text-white mb-2">You're in!</h2>
          <p className="text-white/40 text-sm mb-6">
            Check your email to confirm your account, then sign in.
          </p>
          <Link to="/login" className="btn-primary btn-lg w-full">Go to Sign In</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-surface-0 flex flex-col items-center justify-center px-4 py-12">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-sm relative animate-slide-up">
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-14 h-14 bg-brand-500 rounded-2xl flex items-center justify-center shadow-glow">
            <Crown size={26} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-4xl tracking-wide text-white">Keep Track</h1>
            <p className="text-white/40 text-sm mt-1">Create your account</p>
          </div>
        </div>

        <div className="card p-6">
          <h2 className="font-display text-2xl text-white mb-5">Sign Up</h2>
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <div>
              <label className="input-label">Username</label>
              <input
                className="input"
                type="text"
                placeholder="coolplayer99"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase().replace(/\s/g, '') }))}
                required
                autoComplete="username"
              />
            </div>

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
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                  autoComplete="new-password"
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

            <div>
              <label className="input-label">Confirm Password</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={form.confirm}
                onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                required
                autoComplete="new-password"
              />
            </div>

            {error && <p className="input-error">{error}</p>}

            <button type="submit" className="btn-primary btn-lg w-full mt-1" disabled={loading}>
              {loading ? <span className="spinner" /> : 'Create Account'}
            </button>
          </form>
        </div>

        <p className="text-center text-white/30 text-sm mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-brand-400 hover:text-brand-300 transition-colors font-600">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
