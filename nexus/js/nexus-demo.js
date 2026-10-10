// ══════════════════════════════════════════════════════════════
//  js/nexus-demo.js  —  Demo mode
//  Include this BEFORE nexus-config.js on every page:
//    <script src="js/nexus-demo.js"></script>
//
//  Open any page with ?demo and that browser tab runs on the sample
//  campaign in demo/demo-data.json instead of Supabase. Visitors can
//  edit freely: changes live in sessionStorage for that tab only and
//  never reach the real database. ?demo=off leaves demo mode.
//
//  Table shapes (primary keys, column defaults, FK cascades) are read
//  from sql/supabase_setup.sql at runtime, so the demo behaves like the
//  real schema without a second copy of it to maintain.
//
//  To refresh the demo data: open ?demo, add sample rows through the
//  UI, then Admin → Export Snapshot and save the file over
//  demo/demo-data.json. See CLAUDE.md → Demo mode.
// ══════════════════════════════════════════════════════════════

const DEMO_FLAG_KEY    = 'nexus_demo';
const DEMO_STATE_KEY   = 'nexus_demo_db';
const DEMO_DATA_URL    = 'demo/demo-data.json';
const DEMO_SCHEMA_URL  = 'sql/supabase_setup.sql';

// ── Mode flag ─────────────────────────────────────────────────
// ?demo / ?demo=1 turns it on for this tab, ?demo=off / ?demo=0 turns it
// off. The flag lives in sessionStorage so plain sidenav links keep it.
function isNexusDemo() {
  if (typeof window === 'undefined') return false;
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.has('demo')) {
      const v = (p.get('demo') || '').toLowerCase();
      if (v === 'off' || v === '0' || v === 'false') sessionStorage.removeItem(DEMO_FLAG_KEY);
      else sessionStorage.setItem(DEMO_FLAG_KEY, '1');
    }
    return sessionStorage.getItem(DEMO_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

// ── Schema from supabase_setup.sql ────────────────────────────
/**
 * parseDemoSchema(sql)
 * Reads `create table` blocks into
 *   { table: { pk, columns: { name: { type, def } }, fks: [{ column, table, onDelete }] } }
 * def is the parsed column default: a JS value, DEMO_NOW for now(), or
 * undefined when the column has none.
 */
const DEMO_NOW = { now: true };

function _parseSqlDefault(raw, type) {
  if (raw == null) return undefined;
  const r = raw.trim();
  if (/^now\(\)$/i.test(r)) return DEMO_NOW;
  if (/^null$/i.test(r)) return null;
  if (/^true$/i.test(r)) return true;
  if (/^false$/i.test(r)) return false;
  if (/^-?\d+(\.\d+)?$/.test(r)) return Number(r);
  const m = r.match(/^'((?:[^']|'')*)'$/);
  if (!m) return undefined;
  const s = m[1].replace(/''/g, "'");
  if (/^jsonb?$/i.test(type)) { try { return JSON.parse(s); } catch { return s; } }
  return s;
}

function parseDemoSchema(sql) {
  const schema = {};
  const tableRe = /create\s+table\s+if\s+not\s+exists\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\s*\);/gi;
  let tm;
  while ((tm = tableRe.exec(sql))) {
    const [, table, body] = tm;
    const t = { pk: null, columns: {}, fks: [] };
    for (let line of body.split('\n')) {
      line = line.replace(/--.*$/, '').trim().replace(/,$/, '');
      if (!line) continue;
      const cm = line.match(/^(\w+)\s+(\w+)/);
      if (!cm || /^(constraint|primary|unique|foreign|check)$/i.test(cm[1])) continue;
      const [, name, type] = cm;
      const dm = line.match(/\bdefault\s+('(?:[^']|'')*'|now\(\)|[-\w.]+)/i);
      t.columns[name] = { type: type.toLowerCase(), def: _parseSqlDefault(dm && dm[1], type) };
      if (/\bprimary\s+key\b/i.test(line)) t.pk = name;
      const fm = line.match(/\breferences\s+(?:public\.)?(\w+)\s*\(\s*\w+\s*\)(?:\s+on\s+delete\s+(cascade|set\s+null))?/i);
      if (fm) t.fks.push({ column: name, table: fm[1], onDelete: (fm[2] || 'restrict').toLowerCase().replace(/\s+/, ' ') });
    }
    schema[table] = t;
  }
  return schema;
}

// ── PostgREST-style filters and ordering ──────────────────────
/** 'a=eq.x&b=in.(1,2)' → [{ column, op, value }] */
function parseDemoFilter(filter) {
  if (!filter) return [];
  return String(filter).split('&').filter(Boolean).map(part => {
    const eq = part.indexOf('=');
    const column = part.slice(0, eq);
    const rest = part.slice(eq + 1);
    const dot = rest.indexOf('.');
    const op = rest.slice(0, dot);
    let value = decodeURIComponent(rest.slice(dot + 1));
    if (op === 'in') value = value.replace(/^\(|\)$/g, '').split(',').map(v => v.replace(/^"|"$/g, ''));
    return { column, op, value };
  });
}

function _demoCompare(a, b) {
  const na = Number(a), nb = Number(b);
  if (a !== '' && b !== '' && a != null && b != null && !isNaN(na) && !isNaN(nb)
      && typeof a !== 'boolean' && typeof b !== 'boolean') return na - nb;
  const sa = String(a), sb = String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function _demoMatches(row, conds) {
  return conds.every(({ column, op, value }) => {
    const v = row[column];
    switch (op) {
      case 'eq':  return v != null && String(v) === value;
      case 'neq': return v == null || String(v) !== value;
      case 'gt':  return v != null && _demoCompare(v, value) > 0;
      case 'gte': return v != null && _demoCompare(v, value) >= 0;
      case 'lt':  return v != null && _demoCompare(v, value) < 0;
      case 'lte': return v != null && _demoCompare(v, value) <= 0;
      case 'in':  return v != null && value.includes(String(v));
      case 'is':  return value === 'null' ? v == null : String(v) === value;
      default: throw new Error(`demo filter: unsupported operator "${op}"`);
    }
  });
}

/** Sorts in place by 'a.asc,b.desc' (PostgREST default: nulls last on asc, first on desc). */
function sortDemoRows(rows, order) {
  if (!order) return rows;
  const keys = String(order).split(',').map(k => {
    const [column, dir = 'asc'] = k.trim().split('.');
    return { column, desc: dir === 'desc' };
  });
  return rows.sort((x, y) => {
    for (const { column, desc } of keys) {
      const a = x[column], b = y[column];
      if (a == null && b == null) continue;
      if (a == null) return desc ? -1 : 1;
      if (b == null) return desc ? 1 : -1;
      const c = _demoCompare(a, b);
      if (c) return desc ? -c : c;
    }
    return 0;
  });
}

// ── In-memory tables ──────────────────────────────────────────
const _demoClone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/**
 * DemoStore — synchronous in-memory tables with the parts of PostgREST
 * NEXUS relies on: filters, ordering, column defaults, unknown-column
 * errors, upsert-merge on the primary key, and FK cascade / set null.
 */
class DemoStore {
  constructor(schema, tables, now = () => new Date().toISOString()) {
    this.schema = schema;
    this.now = now;
    this.tables = {};
    for (const name of Object.keys(schema)) this.tables[name] = _demoClone((tables || {})[name] || []);
  }

  _table(table, verb) {
    if (!this.schema[table] || !this.tables[table]) {
      throw new Error(`DB ${verb} ${table}: relation "${table}" does not exist (demo)`);
    }
    return this.tables[table];
  }

  _pk(table) { return this.schema[table].pk || 'id'; }

  _checkColumns(table, row, verb) {
    const cols = this.schema[table].columns;
    for (const c of Object.keys(row)) {
      if (!cols[c]) throw new Error(`DB ${verb} ${table}: column "${c}" does not exist (demo)`);
    }
  }

  _withDefaults(table, row) {
    const out = {};
    for (const [name, col] of Object.entries(this.schema[table].columns)) {
      if (row[name] !== undefined) out[name] = _demoClone(row[name]);
      else if (col.def === DEMO_NOW) out[name] = this.now();
      else if (col.def !== undefined) out[name] = _demoClone(col.def);
      else out[name] = null;
    }
    return out;
  }

  _touch(table, row) {
    if (this.schema[table].columns.updated_at) row.updated_at = this.now();
  }

  select(table, { order, filter } = {}) {
    const rows = this._table(table, 'select').filter(r => _demoMatches(r, parseDemoFilter(filter)));
    return sortDemoRows(_demoClone(rows), order);
  }

  insert(table, rows) {
    const list = this._table(table, 'insert');
    const pk = this._pk(table);
    const added = [];
    for (const row of [].concat(rows)) {
      this._checkColumns(table, row, 'insert');
      const full = this._withDefaults(table, row);
      if (full[pk] == null) throw new Error(`DB insert ${table}: null value in column "${pk}" (demo)`);
      if (list.some(r => String(r[pk]) === String(full[pk]))) {
        throw new Error(`DB insert ${table}: duplicate key value violates unique constraint (demo)`);
      }
      list.push(full);
      added.push(_demoClone(full));
    }
    return added;
  }

  upsert(table, rows) {
    const list = this._table(table, 'upsert');
    const pk = this._pk(table);
    const out = [];
    for (const row of [].concat(rows)) {
      this._checkColumns(table, row, 'upsert');
      const hit = list.find(r => row[pk] != null && String(r[pk]) === String(row[pk]));
      if (hit) {
        Object.assign(hit, _demoClone(row));
        this._touch(table, hit);
        out.push(_demoClone(hit));
      } else {
        out.push(...this.insert(table, row));
      }
    }
    return out;
  }

  update(table, id, changes) {
    const list = this._table(table, 'update');
    this._checkColumns(table, changes, 'update');
    const hits = list.filter(r => String(r.id) === String(id));
    for (const r of hits) { Object.assign(r, _demoClone(changes)); this._touch(table, r); }
    return _demoClone(hits);
  }

  deleteWhere(table, filter) {
    const list = this._table(table, 'delete');
    const conds = parseDemoFilter(filter);
    const pk = this._pk(table);
    const gone = list.filter(r => _demoMatches(r, conds));
    this.tables[table] = list.filter(r => !gone.includes(r));
    if (gone.length) this._cascade(table, gone.map(r => String(r[pk])));
  }

  delete(table, id) {
    this.deleteWhere(table, `id=eq.${encodeURIComponent(id)}`);
  }

  // Follow every FK that points at `table`: cascade deletes, or null out.
  _cascade(table, ids) {
    for (const [child, def] of Object.entries(this.schema)) {
      for (const fk of def.fks) {
        if (fk.table !== table) continue;
        const refs = this.tables[child].filter(r => r[fk.column] != null && ids.includes(String(r[fk.column])));
        if (!refs.length) continue;
        if (fk.onDelete === 'cascade') {
          const pk = this._pk(child);
          this.tables[child] = this.tables[child].filter(r => !refs.includes(r));
          this._cascade(child, refs.map(r => String(r[pk])));
        } else if (fk.onDelete === 'set null') {
          for (const r of refs) { r[fk.column] = null; this._touch(child, r); }
        }
      }
    }
  }
}

// ── Browser adapter: same API as the Supabase `db` object ─────
/**
 * createDemoDb() → { select, insert, upsert, update, delete, deleteWhere, upsertMany }
 * Loads the schema + demo data once, keeps the working copy in
 * sessionStorage (so it survives page navigation in this tab), and
 * resets it whenever demo/demo-data.json is republished.
 */
function createDemoDb() {
  let store = null;
  let version = null;
  let persistWarned = false;

  const ready = (async () => {
    const [sqlRes, dataRes] = await Promise.all([fetch(DEMO_SCHEMA_URL), fetch(DEMO_DATA_URL)]);
    if (!sqlRes.ok || !dataRes.ok) throw new Error('Demo data could not be loaded.');
    const schema = parseDemoSchema(await sqlRes.text());
    const data = await dataRes.json();
    version = String(data.exported_at || '');
    let tables = data.tables;
    try {
      const saved = JSON.parse(sessionStorage.getItem(DEMO_STATE_KEY) || 'null');
      if (saved && saved.version === version) tables = saved.tables;
    } catch { /* corrupt or blocked storage: start from the file */ }
    store = new DemoStore(schema, tables);
  })();

  function persist() {
    try {
      sessionStorage.setItem(DEMO_STATE_KEY, JSON.stringify({ version, tables: store.tables }));
    } catch (e) {
      if (!persistWarned) console.warn('[NEXUS demo] Changes will not survive a page change:', e.message);
      persistWarned = true;
    }
  }

  async function run(fn, write) {
    await ready;
    const result = fn(store);
    if (write) persist();
    return result;
  }

  return {
    demo:        true,
    select:      (table, opts)       => run(s => s.select(table, opts)),
    insert:      (table, row)        => run(s => s.insert(table, row)[0], true),
    upsert:      (table, row)        => run(s => { const r = s.upsert(table, row); return Array.isArray(row) ? r : r[0]; }, true),
    upsertMany:  (table, rows)       => rows.length ? run(s => s.upsert(table, rows), true) : Promise.resolve([]),
    update:      (table, id, ch)     => run(s => s.update(table, id, ch)[0], true),
    delete:      (table, id)         => run(s => { s.delete(table, id); }, true),
    deleteWhere: (table, filter)     => run(s => { s.deleteWhere(table, filter); }, true),
  };
}

/** Throws away this tab's demo edits and reloads from demo/demo-data.json. */
function resetNexusDemo() {
  try { sessionStorage.removeItem(DEMO_STATE_KEY); } catch {}
  window.location.reload();
}

// ── Banner ────────────────────────────────────────────────────
function applyDemoBanner() {
  if (!isNexusDemo() || document.getElementById('nexusDemoBanner')) return;
  const banner = document.createElement('div');
  banner.id = 'nexusDemoBanner';
  banner.className = 'nexus-demo-banner';
  banner.innerHTML =
    '🧪 Demo campaign: sample data. Edits stay in this browser tab only. ' +
    '<button type="button" class="nexus-demo-reset" onclick="resetNexusDemo()">Reset demo</button>';
  document.body.prepend(banner);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  isNexusDemo(); // apply ?demo / ?demo=off as early as possible
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyDemoBanner);
  else applyDemoBanner();
}

if (typeof module !== 'undefined') {
  module.exports = {
    DEMO_NOW,
    parseDemoSchema,
    parseDemoFilter,
    sortDemoRows,
    DemoStore,
    isNexusDemo,
  };
}
