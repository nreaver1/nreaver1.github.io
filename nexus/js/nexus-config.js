// ══════════════════════════════════════════════════════════════
//  js/nexus-config.js  —  Supabase connection + shared DB helpers
//  Include this FIRST in every page:
//    <script src="js/nexus-config.js"></script>
// ══════════════════════════════════════════════════════════════

// ┌─────────────────────────────────────────────────────────────┐
// │  PASTE YOUR SUPABASE CREDENTIALS HERE                       │
// │  Dashboard → Project Settings → API                        │
// └─────────────────────────────────────────────────────────────┘
const SUPABASE_URL  = 'https://qlckogwtpfznjsnjpqlx.supabase.co';
// This api key is public facing anyway so who cares
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsY2tvZ3d0cGZ6bmpzbmpwcWx4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3OTc0OTksImV4cCI6MjA4ODM3MzQ5OX0.fokbNPnEF0fBSj_GYc6XOzd4oXQd10lNuaLdCSKXMmM';

// ══════════════════════════════════════════════════════════════
//  Low-level fetch wrapper — talks directly to Supabase REST API
//  No SDK needed; works from plain HTML files.
// ══════════════════════════════════════════════════════════════
const db = {
  _headers() {
    return {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'Prefer':        'return=representation',
    };
  },

  // SELECT — returns array
  async select(table, opts = {}) {
    let url = `${SUPABASE_URL}/rest/v1/${table}?select=*`;
    if (opts.order)  url += `&order=${opts.order}`;
    if (opts.filter) url += `&${opts.filter}`;
    const r = await fetch(url, { headers: this._headers() });
    if (!r.ok) throw new Error(`DB select ${table}: ${await r.text()}`);
    return r.json();
  },

  // INSERT — single row, returns inserted row
  async insert(table, row) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method:  'POST',
      headers: this._headers(),
      body:    JSON.stringify(row),
    });
    if (!r.ok) throw new Error(`DB insert ${table}: ${await r.text()}`);
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : rows;
  },

  // UPSERT — insert or update by primary key
  async upsert(table, row) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method:  'POST',
      headers: { ...this._headers(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body:    JSON.stringify(row),
    });
    if (!r.ok) throw new Error(`DB upsert ${table}: ${await r.text()}`);
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : rows;
  },

  // UPDATE by id
  async update(table, id, changes) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method:  'PATCH',
      headers: this._headers(),
      body:    JSON.stringify(changes),
    });
    if (!r.ok) throw new Error(`DB update ${table}: ${await r.text()}`);
    const rows = await r.json();
    return Array.isArray(rows) ? rows[0] : rows;
  },

  // DELETE by id
  async delete(table, id) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
      method:  'DELETE',
      headers: this._headers(),
    });
    if (!r.ok) throw new Error(`DB delete ${table}: ${await r.text()}`);
  },

  // DELETE all rows matching a filter  e.g. filter='currency_id=eq.cr'
  async deleteWhere(table, filter) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
      method:  'DELETE',
      headers: this._headers(),
    });
    if (!r.ok) throw new Error(`DB deleteWhere ${table}: ${await r.text()}`);
  },

  // Batch upsert (array of rows)
  async upsertMany(table, rows) {
    if (!rows.length) return [];
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method:  'POST',
      headers: { ...this._headers(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body:    JSON.stringify(rows),
    });
    if (!r.ok) throw new Error(`DB upsertMany ${table}: ${await r.text()}`);
    return r.json();
  },
};

// ══════════════════════════════════════════════════════════════
//  Config check — warns in console if credentials not set
// ══════════════════════════════════════════════════════════════
if (SUPABASE_URL.includes('YOUR_PROJECT_REF') || SUPABASE_ANON.includes('YOUR_ANON')) {
  console.warn(
    '%c[NEXUS] Supabase credentials not configured.\n' +
    'Open js/nexus-config.js and paste your Project URL and anon key.',
    'color:#f0a832;font-weight:bold;font-size:13px'
  );
}

// ══════════════════════════════════════════════════════════════
//  NEXUS CONFIRM DIALOG  — shared across all modules
//  Usage:
//    const confirmed = await nexusConfirm({
//      title:   'Remove Spell Scroll',          // bold top line
//      name:    'Scroll of Fireball',            // highlighted subject
//      message: 'This will permanently delete this loot item.',
//      danger:  true,                            // red confirm btn (default true)
//      confirmLabel: 'Remove',                   // button text (default 'Remove')
//      cancelLabel:  'Keep It',                  // button text (default 'Cancel')
//    });
//    if (!confirmed) return;
// ══════════════════════════════════════════════════════════════
function nexusConfirm({ title, name, message, danger = true, confirmLabel = 'Remove', cancelLabel = 'Cancel', checkboxes = null } = {}) {
  return new Promise(resolve => {
    // Remove any existing dialog
    const existing = document.getElementById('nexusConfirmOverlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'nexusConfirmOverlay';
    overlay.className = 'nxc-overlay';
    overlay.innerHTML = `
      <div class="nxc-dialog" role="alertdialog" aria-modal="true" aria-labelledby="nxcTitle">
        <div class="nxc-header">
          <span class="nxc-icon">${danger ? '⚠' : '?'}</span>
          <span class="nxc-title" id="nxcTitle">${title || 'Confirm'}</span>
        </div>
        ${name ? `<div class="nxc-name">${name}</div>` : ''}
        ${message ? `<div class="nxc-message">${message}</div>` : ''}
        ${checkboxes && checkboxes.length ? `<div class="nxc-checkboxes">${checkboxes.map(cb =>
          `<label class="nxc-check-label">
            <input type="checkbox" class="nxc-checkbox" id="nxcCheck_${cb.id}" ${cb.checked ? 'checked' : ''} onchange="this.closest('.nxc-check-label').classList.remove('nxc-required-warn')" />
            <span class="nxc-check-text">${cb.label}</span>
          </label>`
        ).join('')}</div>` : ''}
        <div class="nxc-actions">
          <button class="nxc-btn nxc-cancel" id="nxcCancel">${cancelLabel}</button>
          <button class="nxc-btn ${danger ? 'nxc-danger' : 'nxc-confirm'}" id="nxcConfirm">${confirmLabel}</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Animate in
    requestAnimationFrame(() => overlay.classList.add('nxc-open'));

    function close(result) {
      overlay.classList.remove('nxc-open');
      overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
      resolve(result);
    }

    document.getElementById('nxcConfirm').addEventListener('click', () => {
      if (checkboxes && checkboxes.length) {
        // Block close if any required checkbox is unchecked — highlight and shake it
        const unmetRequired = checkboxes.filter(cb => {
          if (!cb.required) return false;
          const el = document.getElementById('nxcCheck_' + cb.id);
          return el && !el.checked;
        });
        if (unmetRequired.length) {
          unmetRequired.forEach(cb => {
            const label = document.querySelector(`label[for="nxcCheck_${cb.id}"], .nxc-check-label:has(#nxcCheck_${cb.id})`);
            if (!label) return;
            label.classList.remove('nxc-shake');           // reset so animation re-triggers
            void label.offsetWidth;                        // force reflow
            label.classList.add('nxc-required-warn', 'nxc-shake');
            label.addEventListener('animationend', () => label.classList.remove('nxc-shake'), { once: true });
          });
          return;  // do NOT close the dialog
        }
        const checks = {};
        checkboxes.forEach(cb => {
          const el = document.getElementById('nxcCheck_' + cb.id);
          checks[cb.id] = el ? el.checked : false;
        });
        close({ confirmed: true, checks });
      } else {
        close(true);
      }
    });
    document.getElementById('nxcCancel').addEventListener('click',  () => close(false));
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', function handler(e) {
      if (e.key === 'Escape')  { close(false); document.removeEventListener('keydown', handler); }
      if (e.key === 'Enter')   { close(true);  document.removeEventListener('keydown', handler); }
    });

    // Focus confirm button
    setTimeout(() => document.getElementById('nxcConfirm')?.focus(), 50);
  });
}

// ══════════════════════════════════════════════════════════════
//  TERM MAPPINGS  — rename modules / labels campaign-wide
//  Loaded from Supabase nexus_settings table at startup.
//  Use t('partyRoster') anywhere in HTML/JS to get the current name.
// ══════════════════════════════════════════════════════════════

const TERM_DEFAULTS = {
  // Module names (shown in nav, cards, page titles)
  partyRoster:    'Party Roster',
  treasury:       'Treasury',
  lootTracker:    'Loot Tracker',
  sessionLog:     'Session Log',
  worldMap:       'World Map',
  bestiary:       'Bestiary',
  diceRoller:     'Dice Roller',
  // Generic labels used across modules
  member:         'Member',
  members:        'Members',
  currency:       'Currency',
  item:           'Item',
  items:          'Items',
  session:        'Session',
  creature:       'Creature',
  // Shared holder labels (display only — DB/logic still uses canonical strings)
  partyInventory: 'Party Inventory',
  partyVault:     'Party Vault',
  // Campaign identity
  campaignName:   'NEXUS',
  campaignSub:    'campaign system',
};

// Mutable working copy — gets overwritten when settings load
let TERMS = { ...TERM_DEFAULTS };

// Lookup helper — falls back to default, then the key itself
function t(key) {
  return TERMS[key] ?? TERM_DEFAULTS[key] ?? key;
}

// Load settings from Supabase (call once at page startup)
async function loadTerms() {
  try {
    const rows = await db.select('nexus_settings', { filter: 'key=eq.term_mappings' });
    if (rows && rows.length && rows[0].value) {
      const saved = typeof rows[0].value === 'string'
        ? JSON.parse(rows[0].value)
        : rows[0].value;
      TERMS = { ...TERM_DEFAULTS, ...saved };
    }
  } catch(e) {
    // Settings table may not exist yet — silently use defaults
    console.info('[NEXUS] Term settings not loaded, using defaults:', e.message);
  }
}

// Persist settings to Supabase
async function saveTerms(newTerms) {
  TERMS = { ...TERM_DEFAULTS, ...newTerms };
  await db.upsert('nexus_settings', { key: 'term_mappings', value: JSON.stringify(TERMS) });
}


// ══════════════════════════════════════════════════════════════
//  MODULE VISIBILITY SETTINGS
//  Stored in nexus_settings under key 'module_enabled'.
//  Controls which module pages are accessible to users.
//
//  Usage:
//    await loadModuleSettings();          // call once at page boot
//    isModuleEnabled('partyRoster')       // → true/false
//    enforceModuleGuard('partyRoster')    // redirects if disabled
// ══════════════════════════════════════════════════════════════

// Which modules can be toggled. Key matches TERMS key; href is the page file.
const MODULE_DEFS = [
  { key: 'partyRoster', label: 'Party Roster',  href: 'party-roster.html',  icon: '👥' },
  { key: 'treasury',    label: 'Treasury',       href: 'treasury.html',      icon: '💰' },
  { key: 'lootTracker', label: 'Loot Tracker',   href: 'loot-tracker.html',  icon: '⚔️' },
  { key: 'sessionLog',  label: 'Session Log',    href: 'session-log.html',   icon: '📋' },
];

// Defaults — all enabled
const MODULE_ENABLED_DEFAULTS = {
  partyRoster: true,
  treasury:    true,
  lootTracker: true,
  sessionLog:  true,
};

// Mutable working copy
let MODULE_ENABLED = { ...MODULE_ENABLED_DEFAULTS };

// Load from Supabase
async function loadModuleSettings() {
  try {
    const rows = await db.select('nexus_settings', { filter: 'key=eq.module_enabled' });
    if (rows && rows.length && rows[0].value) {
      const saved = typeof rows[0].value === 'string'
        ? JSON.parse(rows[0].value)
        : rows[0].value;
      MODULE_ENABLED = { ...MODULE_ENABLED_DEFAULTS, ...saved };
    }
  } catch(e) {
    console.info('[NEXUS] Module settings not loaded, using defaults:', e.message);
  }
}

// Persist to Supabase
async function saveModuleSettings(settings) {
  MODULE_ENABLED = { ...MODULE_ENABLED_DEFAULTS, ...settings };
  await db.upsert('nexus_settings', {
    key:   'module_enabled',
    value: JSON.stringify(MODULE_ENABLED),
  });
}

// Returns true if a module is currently enabled
function isModuleEnabled(key) {
  // If the key is not in the map at all, default to enabled
  return MODULE_ENABLED[key] !== false;
}

// Call this at the top of each module page's boot sequence.
// If the module is disabled, replaces the page body with a
// "module disabled" screen and stops execution.
// Returns true if the module is enabled (caller should continue),
// false if it is disabled (caller should stop).
function enforceModuleGuard(moduleKey) {
  if (isModuleEnabled(moduleKey)) return true;
  // Replace body content with a friendly disabled screen
  document.body.innerHTML = `
    <style>
      body { background:#060809; color:#8b949e; font-family:'Share Tech Mono',monospace;
             display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; }
      .guard-box { text-align:center; max-width:400px; padding:2rem; }
      .guard-icon { font-size:2.5rem; margin-bottom:1rem; opacity:0.3; }
      .guard-title { font-family:'Orbitron',sans-serif; font-size:0.8rem; font-weight:700;
                     letter-spacing:0.2em; color:#4a5568; margin-bottom:0.8rem; }
      .guard-msg { font-size:0.7rem; line-height:1.7; color:#4a5568; margin-bottom:1.5rem; }
      .guard-link { display:inline-block; font-size:0.65rem; letter-spacing:0.12em;
                    color:#a78bfa; text-decoration:none; border:1px solid rgba(167,139,250,0.3);
                    padding:0.5rem 1.2rem; border-radius:3px;
                    transition:opacity 0.15s; }
      .guard-link:hover { opacity:0.7; }
    </style>
    <div class="guard-box">
      <div class="guard-icon">🔒</div>
      <div class="guard-title">Module Disabled</div>
      <div class="guard-msg">
        This module has been turned off by the campaign administrator.
        Contact your GM if you think this is an error.
      </div>
      <a class="guard-link" href="index.html">← Return to Dashboard</a>
    </div>`;
  return false;
}

// Apply module visibility to the current page's sidenav and (on index) module cards.
// Call after loadModuleSettings() on every page.
function applyModuleVisibility() {
  MODULE_DEFS.forEach(mod => {
    const enabled = isModuleEnabled(mod.key);

    // Sidenav links — hide entirely when disabled (no broken nav links)
    document.querySelectorAll(`.sidenav-link[href="${mod.href}"]`).forEach(el => {
      el.style.display = enabled ? '' : 'none';
    });

    // Dashboard module cards (index.html only)
    const card = document.querySelector(`.module-card[data-module="${mod.key}"]`);
    if (!card) return;

    const badge = card.querySelector('.card-status');
    const arrow = card.querySelector('.card-arrow');

    if (enabled) {
      // Restore to active state
      card.classList.remove('module-disabled');
      card.setAttribute('href', mod.href);
      if (badge) { badge.className = 'card-status status-live'; badge.textContent = 'LIVE'; }
      if (arrow) arrow.style.display = '';
    } else {
      // Show as inactive — visible but not clickable
      card.classList.add('module-disabled');
      card.removeAttribute('href');
      if (badge) { badge.className = 'card-status status-inactive'; badge.textContent = 'INACTIVE'; }
      if (arrow) arrow.style.display = 'none';
    }
  });
}

// ══════════════════════════════════════════════════════════════
//  BUTTON LOADING STATE  — shared across all modules
//
//  setLoading(btn, true)   — disables btn, shows spinner text
//  setLoading(btn, false)  — restores original text, re-enables
//
//  Usage:
//    const btn = document.getElementById('mySaveBtn');
//    setLoading(btn, true);
//    try { await doWork(); } finally { setLoading(btn, false); }
// ══════════════════════════════════════════════════════════════
function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = '<span class="btn-spinner"></span>' + (btn.dataset.loadingText || 'Processing…');
    btn.disabled = true;
    btn.classList.add('btn-loading');
  } else {
    btn.innerHTML = btn.dataset.origText || btn.innerHTML;
    btn.disabled = false;
    btn.classList.remove('btn-loading');
  }
}

// Disable/enable ALL action buttons inside a container (modal, panel)
// Useful for locking the whole modal while a request is in-flight
function setModalLoading(modalEl, loading) {
  if (!modalEl) return;
  modalEl.querySelectorAll('button').forEach(b => {
    if (loading) { b.disabled = true; b.classList.add('btn-modal-locked'); }
    else         { b.disabled = false; b.classList.remove('btn-modal-locked'); }
  });
}

// ══════════════════════════════════════════════════════════════
//  ADMIN AUTH WRAPPER
//  A Higher-Order Function that gates any async action behind
//  the admin password prompt. Decoupled from all specific assets.
//
//  Usage:
//    const safeDelete = requireAdmin(deletePartyMember);
//    safeDelete(memberId);          // prompts, then calls deletePartyMember(memberId)
//
//    Or inline (no intermediate variable needed):
//    onclick="requireAdmin(deleteCurrencyType)(currencyId)"
//
//  The hash is read at call-time from window.NEXUS_ADMIN_HASH so
//  each page only needs to set that one constant. If the session
//  is already authenticated (nexus_admin = '1') the prompt is
//  skipped entirely.
// ══════════════════════════════════════════════════════════════

async function _nexusSha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function requireAdmin(fn) {
  return async function (...args) {
    // Skip prompt if already authenticated this session
    if (sessionStorage.getItem('nexus_admin') === '1') return fn(...args);

    const pw = await new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'nxc-overlay';
      overlay.innerHTML = `
        <div class="nxc-dialog" role="dialog" aria-modal="true">
          <div class="nxc-header">
            <span class="nxc-icon">🔒</span>
            <span class="nxc-title">Admin Required</span>
          </div>
          <div class="nxc-message" style="margin-top:0.9rem">Enter the admin password to continue.</div>
          <div style="padding:0.6rem 1.3rem 0">
            <input id="_nxaInput" type="password" placeholder="Password"
              style="width:100%;box-sizing:border-box;background:var(--bg);border:1px solid var(--border);
                     border-radius:3px;color:var(--text);font-family:'Share Tech Mono',monospace;
                     font-size:1rem;padding:0.45rem 0.7rem;outline:none" />
            <div id="_nxaErr" style="font-family:'Share Tech Mono',monospace;font-size:0.8rem;
                                     color:var(--red);min-height:1.2em;margin-top:0.35rem"></div>
          </div>
          <div class="nxc-actions">
            <button class="nxc-btn nxc-cancel"  id="_nxaCancel">Cancel</button>
            <button class="nxc-btn nxc-danger"   id="_nxaConfirm">Confirm</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('nxc-open'));

      const input   = overlay.querySelector('#_nxaInput');
      const errEl   = overlay.querySelector('#_nxaErr');
      const btnOk   = overlay.querySelector('#_nxaConfirm');
      const btnCancel = overlay.querySelector('#_nxaCancel');

      function dismiss(value) {
        overlay.classList.remove('nxc-open');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
        resolve(value);
      }

      btnCancel.addEventListener('click', () => dismiss(null));
      overlay.addEventListener('click', e => { if (e.target === overlay) dismiss(null); });

      async function attempt() {
        const hash = await _nexusSha256(input.value);
        if (hash === (window.NEXUS_ADMIN_HASH || '')) {
          sessionStorage.setItem('nexus_admin', '1');
          dismiss(input.value);
        } else {
          errEl.textContent = 'Incorrect password.';
          input.value = '';
          setTimeout(() => { errEl.textContent = ''; }, 2500);
          input.focus();
        }
      }

      btnOk.addEventListener('click', attempt);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  attempt();
        if (e.key === 'Escape') dismiss(null);
      });

      setTimeout(() => input.focus(), 50);
    });

    if (pw === null) return;   // user cancelled — action aborted
    return fn(...args);
  };
}

// ──────────────────────────────────────────────────────────────
//  EXAMPLE (do not call — for reference only)
//
//  async function deleteWidget(id) {
//    await db.delete('widgets', id);
//    widgets = widgets.filter(w => w.id !== id);
//    render();
//  }
//
//  // One-liner to protect it:
//  const safeDeleteWidget = requireAdmin(deleteWidget);
//
//  // Then call exactly like the original:
//  safeDeleteWidget(widgetId);
//
// ──────────────────────────────────────────────────────────────
