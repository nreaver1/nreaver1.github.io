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
