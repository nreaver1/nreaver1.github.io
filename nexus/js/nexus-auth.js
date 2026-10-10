// ══════════════════════════════════════════════════════════════
//  js/nexus-auth.js  —  Sign-in (Supabase Auth, emailed links)
//  Include after nexus-demo.js and BEFORE nexus-config.js:
//    <script src="js/nexus-demo.js"></script>
//    <script src="js/nexus-auth.js"></script>
//    <script src="js/nexus-config.js"></script>
//
//  Who can edit is decided by the database, not this file:
//  sql/supabase_auth.sql lets anyone read, and only emails listed in
//  campaign_members write (role 'gm' also manages nexus_settings).
//  This file keeps the browser's session, sends the user's token on
//  REST calls (see db._headers in nexus-config.js) and mirrors those
//  rules in the UI so people aren't offered buttons that would fail.
//
//  Until supabase_auth.sql has been run (no campaign_members table),
//  the site keeps the old behaviour: site lock + admin password.
// ══════════════════════════════════════════════════════════════

const NEXUS_AUTH_KEY = 'nexus_auth';   // localStorage: { access_token, refresh_token, expires_at, email }

// ── Pure helpers (tested) ─────────────────────────────────────

/**
 * decodeJwtPayload(token) → claims object, or null if it isn't a JWT.
 */
function decodeJwtPayload(token) {
  try {
    const part = String(token).split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const json = typeof atob === 'function'
      ? decodeURIComponent(Array.from(atob(b64), c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join(''))
      : Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * parseAuthRedirect(hash) — reads the fragment Supabase appends when a
 * sign-in link lands back on the site.
 *   '#access_token=…&refresh_token=…&expires_at=…' → { session }
 *   '#error=…&error_description=…'                → { error }
 *   anything else                                  → null
 */
function parseAuthRedirect(hash) {
  const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
  if (p.get('error') || p.get('error_description')) {
    return { error: (p.get('error_description') || p.get('error')).replace(/\+/g, ' ') };
  }
  const access = p.get('access_token'), refresh = p.get('refresh_token');
  if (!access || !refresh) return null;
  const claims = decodeJwtPayload(access) || {};
  const expiresAt = Number(p.get('expires_at')) || claims.exp
    || Math.floor(Date.now() / 1000) + (Number(p.get('expires_in')) || 3600);
  return { session: { access_token: access, refresh_token: refresh, expires_at: expiresAt, email: (claims.email || '').toLowerCase() } };
}

/** True when the access token expires within skewMs (or is unusable). */
function sessionNeedsRefresh(session, nowMs = Date.now(), skewMs = 60000) {
  if (!session || !session.access_token) return false;
  if (!session.expires_at) return true;
  return session.expires_at * 1000 - nowMs < skewMs;
}

/**
 * nexusAccess(state) → { mode, canEdit, isGm }
 * The single place that decides what the UI lets someone do.
 *   demo   — sandbox: everything allowed
 *   auth   — supabase_auth.sql is installed: role from campaign_members
 *   legacy — not installed yet: old site lock + admin password
 */
function nexusAccess({ demo, authInstalled, role, siteLocked, adminFlag }) {
  if (demo) return { mode: 'demo', canEdit: true, isGm: true };
  if (authInstalled) {
    return { mode: 'auth', canEdit: role === 'gm' || role === 'player', isGm: role === 'gm' };
  }
  return { mode: 'legacy', canEdit: !siteLocked || !!adminFlag, isGm: !!adminFlag };
}

// ── Browser session ───────────────────────────────────────────
const NexusAuth = {
  url: null,
  key: null,
  session: null,
  installed: false,   // campaign_members exists → auth mode
  role: null,         // 'gm' | 'player' | null
  error: null,        // message from a failed sign-in link
  _refreshing: null,
};

function _saveSession(session) {
  NexusAuth.session = session;
  try {
    if (session) localStorage.setItem(NEXUS_AUTH_KEY, JSON.stringify(session));
    else localStorage.removeItem(NEXUS_AUTH_KEY);
  } catch { /* private mode: session lasts for this page only */ }
}

async function _refreshSession() {
  const s = NexusAuth.session;
  const r = await fetch(`${NexusAuth.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: NexusAuth.key },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!r.ok) { _saveSession(null); return; }   // revoked or expired: signed out
  const data = await r.json();
  const claims = decodeJwtPayload(data.access_token) || {};
  _saveSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at || claims.exp,
    email: (claims.email || s.email || '').toLowerCase(),
  });
}

/** The signed-in user's access token (refreshed if needed), or null. */
async function nexusAccessToken() {
  if (!NexusAuth.session) return null;
  if (sessionNeedsRefresh(NexusAuth.session)) {
    NexusAuth._refreshing = NexusAuth._refreshing || _refreshSession().finally(() => { NexusAuth._refreshing = null; });
    await NexusAuth._refreshing;
  }
  return NexusAuth.session ? NexusAuth.session.access_token : null;
}

function nexusAuthEmail() {
  return NexusAuth.session ? NexusAuth.session.email : null;
}

/**
 * nexusAuthInit(url, key) — called once by nexus-config.js. Picks up a
 * sign-in redirect, restores the saved session, then asks the database
 * whether auth is installed and what this user's role is.
 */
function nexusAuthInit(url, key) {
  NexusAuth.url = url;
  NexusAuth.key = key;

  // Synchronous part first, so the very first db call already has the token.
  const redirect = parseAuthRedirect(typeof location !== 'undefined' ? location.hash : '');
  if (redirect) {
    if (redirect.session) _saveSession(redirect.session);
    else NexusAuth.error = redirect.error;
    try { history.replaceState(null, '', location.pathname + location.search); } catch {}
  } else {
    try { NexusAuth.session = JSON.parse(localStorage.getItem(NEXUS_AUTH_KEY) || 'null'); } catch {}
  }

  return (async () => {
    try {
      const token = await nexusAccessToken();
      const email = nexusAuthEmail();
      const q = email ? `email=eq.${encodeURIComponent(email)}` : 'limit=1';
      const r = await fetch(`${url}/rest/v1/campaign_members?select=role&${q}`, {
        headers: { apikey: key, Authorization: `Bearer ${token || key}` },
      });
      if (r.status === 401 && token) {          // stale token: drop it, stay a viewer
        _saveSession(null);
        NexusAuth.installed = true;
        return;
      }
      NexusAuth.installed = r.ok;               // 404 → supabase_auth.sql not run yet
      if (r.ok && email) {
        const rows = await r.json();
        NexusAuth.role = rows[0] ? rows[0].role : null;
      }
    } catch (e) {
      console.info('[NEXUS] auth check failed, using defaults:', e.message);
    }
  })();
}

/** Emails a sign-in link that returns to this page. */
async function nexusSendSignInLink(email) {
  const redirectTo = location.origin + location.pathname;
  const r = await fetch(`${NexusAuth.url}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: NexusAuth.key },
    body: JSON.stringify({ email: String(email).trim().toLowerCase(), create_user: true }),
  });
  if (!r.ok) {
    let msg = 'Could not send the sign-in email.';
    try { const j = await r.json(); msg = j.msg || j.error_description || j.message || msg; } catch {}
    throw new Error(msg);
  }
}

async function nexusSignOut() {
  const token = NexusAuth.session && NexusAuth.session.access_token;
  _saveSession(null);
  if (token) {
    try {
      await fetch(`${NexusAuth.url}/auth/v1/logout`, {
        method: 'POST', headers: { apikey: NexusAuth.key, Authorization: `Bearer ${token}` },
      });
    } catch { /* already signed out locally */ }
  }
  location.reload();
}

if (typeof module !== 'undefined') {
  module.exports = { decodeJwtPayload, parseAuthRedirect, sessionNeedsRefresh, nexusAccess };
}
