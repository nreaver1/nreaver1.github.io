import { createClient } from '@supabase/supabase-js'
import { demoClient }   from '../demo/demoClient'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY

// Demo mode runs on in-memory seed data with no Supabase project behind it
export const isDemo = import.meta.env.VITE_DEMO_MODE === 'true'

if (!isDemo && (!supabaseUrl || !supabaseAnon)) {
  document.body.style.cssText = 'margin:0;background:#0a0a0f;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;'
  document.body.innerHTML = `
    <div style="text-align:center;padding:2rem;max-width:480px;">
      <div style="font-size:2.5rem;margin-bottom:1rem">⚠️</div>
      <h2 style="color:#f97316;font-size:1.25rem;margin:0 0 0.75rem">Missing Environment Variables</h2>
      <p style="color:#ffffff80;font-size:0.875rem;line-height:1.6;margin:0 0 1.25rem">
        The app can't start because your <code style="color:#fb923c;background:#ffffff10;padding:2px 6px;border-radius:4px">.env</code> file is missing or incomplete.
      </p>
      <div style="background:#ffffff08;border:1px solid #ffffff15;border-radius:8px;padding:1rem;text-align:left;font-size:0.8rem;color:#ffffff60;font-family:monospace;line-height:1.8">
        VITE_SUPABASE_URL=https://your-project.supabase.co<br/>
        VITE_SUPABASE_ANON_KEY=your-anon-key-here
      </div>
      <p style="color:#ffffff40;font-size:0.75rem;margin:1rem 0 0">
        Copy <code style="color:#fb923c">.env.example</code> to <code style="color:#fb923c">.env</code> and fill in your Supabase keys, then restart the dev server.
      </p>
    </div>
  `
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — see instructions above.')
}

export const supabase = isDemo ? demoClient : createClient(supabaseUrl, supabaseAnon, {
  auth: {
    persistSession:     true,
    autoRefreshToken:   true,
    detectSessionInUrl: true,
  },
})

// ── Session timeouts ─────────────────────────────────────────
// Inactivity: sign out after 30 min of no user interaction (NIST SP 800-63B)
// Hard cap:   sign out after 7 days regardless of activity
const INACTIVITY_MS   = 30 * 60 * 1000       // 30 minutes
const SESSION_MAX_MS  = 7 * 24 * 60 * 60 * 1000 // 7 days
const SESSION_START_KEY = 'kt_session_start'

let inactivityTimer = null
let hardCapTimer    = null

const signOutWithReason = async (reason) => {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    await supabase.auth.signOut()
    window.location.href = `/login?reason=${reason}`
  }
}

const resetInactivityTimer = () => {
  clearTimeout(inactivityTimer)
  inactivityTimer = setTimeout(() => signOutWithReason('inactivity'), INACTIVITY_MS)
}

const startHardCapTimer = () => {
  clearTimeout(hardCapTimer)
  const sessionStart = parseInt(localStorage.getItem(SESSION_START_KEY) ?? '0', 10)
  const now = Date.now()
  const elapsed = now - sessionStart
  const remaining = SESSION_MAX_MS - elapsed

  if (remaining <= 0) {
    // Already exceeded 7 days — sign out immediately
    signOutWithReason('session_expired')
    return
  }
  hardCapTimer = setTimeout(() => signOutWithReason('session_expired'), remaining)
}

const ACTIVITY_EVENTS = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click']

export const startInactivityWatcher = () => {
  if (isDemo) return
  // Record session start time if not already set
  if (!localStorage.getItem(SESSION_START_KEY)) {
    localStorage.setItem(SESSION_START_KEY, Date.now().toString())
  }
  ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, resetInactivityTimer, { passive: true }))
  resetInactivityTimer()
  startHardCapTimer()
}

export const stopInactivityWatcher = () => {
  clearTimeout(inactivityTimer)
  clearTimeout(hardCapTimer)
  localStorage.removeItem(SESSION_START_KEY)
  ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, resetInactivityTimer))
}
