// ══════════════════════════════════════════════════════════════
//  nexus-config.js  —  Supabase connection + shared DB helpers
//  Include this FIRST in every page:
//    <script src="nexus-config.js"></script>
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
    'Open nexus-config.js and paste your Project URL and anon key.',
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
function nexusConfirm({ title, name, message, danger = true, confirmLabel = 'Remove', cancelLabel = 'Cancel' } = {}) {
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

    document.getElementById('nxcConfirm').addEventListener('click', () => close(true));
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
