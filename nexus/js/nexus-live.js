// ══════════════════════════════════════════════════════════════
//  js/nexus-live.js  —  Live updates between players
//  Include after nexus-utils.js (and nexus-cite.js when the page has it):
//    <script src="js/nexus-live.js"></script>
//
//  nexusLive(['loot_items', ...], async changed => { reload; render })
//  listens to Supabase Realtime and runs the page's refresh when a row
//  in one of those tables changes, from any browser. The tables must be
//  in the supabase_realtime publication (sql/supabase_realtime.sql).
//
//  The refresh waits while a modal, confirm dialog or popover is open,
//  while a form field has focus, and while the tab is hidden, so it
//  never wipes out something half-typed. Several changes in a row run
//  one refresh. The page's own saves come back too; refreshing then is
//  harmless because the data already matches.
//
//  Speaks the Phoenix channel protocol directly (no Supabase SDK). Off in
//  demo mode, which has no other browsers to hear from.
// ══════════════════════════════════════════════════════════════

const NEXUS_LIVE_BUSY_SELECTOR = '.modal-backdrop.open, .nxc-overlay, .transfer-popover';
const NEXUS_LIVE_DEBOUNCE_MS   = 400;
const NEXUS_LIVE_HEARTBEAT_MS  = 25000;
const NEXUS_LIVE_BACKOFF_MS    = [1000, 2000, 5000, 10000, 30000];

/** True while the person is in the middle of something a re-render would lose. */
function nexusLiveBusy(doc = document) {
  if (doc.hidden) return true;
  if (doc.querySelector(NEXUS_LIVE_BUSY_SELECTOR)) return true;
  const el = doc.activeElement;
  return !!el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable === true);
}

/**
 * nexusLiveJoinMessage(tables, token, ref) → the phx_join frame that
 * subscribes one channel to every change in `tables`.
 */
function nexusLiveJoinMessage(tables, token, ref = '1') {
  return {
    topic: 'realtime:nexus-live',
    event: 'phx_join',
    ref,
    join_ref: ref,
    payload: {
      config: {
        broadcast: { ack: false, self: false },
        presence: { key: '' },
        postgres_changes: tables.map(table => ({ event: '*', schema: 'public', table })),
        private: false,
      },
      access_token: token,
    },
  };
}

/** The table a server frame reports a change for, or null for anything else. */
function nexusLiveChangedTable(msg) {
  if (!msg || msg.event !== 'postgres_changes') return null;
  const data = msg.payload && msg.payload.data;
  return (data && data.table) || null;
}

function nexusLive(tables, refresh) {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') return null;
  if (typeof NEXUS_DEMO !== 'undefined' && NEXUS_DEMO) return null;
  if (!Array.isArray(tables) || !tables.length || typeof refresh !== 'function') return null;

  const pending = new Set();
  let ws = null, heartbeat = null, debounce = null, retry = 0, ref = 1;
  let token = null, everJoined = false, stopped = false, running = false;

  const nextRef = () => String(++ref);
  const send = msg => { if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };

  function schedule(table) {
    if (table) pending.add(table);
    clearTimeout(debounce);
    debounce = setTimeout(flush, NEXUS_LIVE_DEBOUNCE_MS);
  }

  async function flush() {
    if (!pending.size || stopped) return;
    if (running || nexusLiveBusy()) { debounce = setTimeout(flush, 1500); return; }
    const changed = new Set(pending);
    pending.clear();
    running = true;
    try { await refresh(changed); }
    catch (e) { console.error('[NEXUS live] Refresh failed:', e); }
    finally { running = false; }
  }

  async function currentToken() {
    try { return (typeof nexusAccessToken === 'function' && await nexusAccessToken()) || SUPABASE_ANON; }
    catch { return SUPABASE_ANON; }
  }

  async function connect() {
    if (stopped) return;
    token = await currentToken();
    const url = `${SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(SUPABASE_ANON)}&vsn=1.0.0`;
    try { ws = new WebSocket(url); }
    catch (e) { console.warn('[NEXUS live] Could not connect:', e); return reconnect(); }

    ws.onopen = () => {
      send(nexusLiveJoinMessage(tables, token, nextRef()));
      clearInterval(heartbeat);
      heartbeat = setInterval(async () => {
        send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() });
        // Signed-in tokens refresh hourly; hand the new one to the channel
        const fresh = await currentToken();
        if (fresh !== token) {
          token = fresh;
          send({ topic: 'realtime:nexus-live', event: 'access_token', payload: { access_token: token }, ref: nextRef() });
        }
      }, NEXUS_LIVE_HEARTBEAT_MS);
    };

    ws.onmessage = ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.event === 'phx_reply' && msg.topic === 'realtime:nexus-live' && msg.payload) {
        if (msg.payload.status === 'ok' && msg.payload.response && msg.payload.response.postgres_changes) {
          retry = 0;
          // Back after a dropped connection: catch up on whatever was missed
          if (everJoined) {
            tables.forEach(t => pending.add(t));
            schedule();
          }
          everJoined = true;
        } else if (msg.payload.status === 'error') {
          console.warn('[NEXUS live] Subscription refused:', msg.payload.response);
        }
        return;
      }
      if (msg.event === 'system' && msg.payload && msg.payload.status === 'error') {
        console.warn('[NEXUS live]', msg.payload.message || msg.payload);
        return;
      }
      const table = nexusLiveChangedTable(msg);
      if (table) schedule(table);
    };

    ws.onclose = () => { clearInterval(heartbeat); reconnect(); };
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  function reconnect() {
    if (stopped) return;
    const wait = NEXUS_LIVE_BACKOFF_MS[Math.min(retry++, NEXUS_LIVE_BACKOFF_MS.length - 1)];
    setTimeout(connect, wait);
  }

  // A deferred refresh runs as soon as the person is free again
  document.addEventListener('visibilitychange', () => { if (!document.hidden && pending.size) schedule(); });
  window.addEventListener('beforeunload', () => { stopped = true; try { ws && ws.close(); } catch {} });

  connect();
  return { stop() { stopped = true; clearInterval(heartbeat); try { ws && ws.close(); } catch {} } };
}

if (typeof module !== 'undefined') {
  module.exports = { nexusLive, nexusLiveBusy, nexusLiveJoinMessage, nexusLiveChangedTable, NEXUS_LIVE_BUSY_SELECTOR };
}
