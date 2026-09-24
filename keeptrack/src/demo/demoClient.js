// In-memory stand-in for the Supabase client, used when VITE_DEMO_MODE=true.
//
// Implements the subset of supabase-js the app uses: PostgREST-style queries
// with nested embeds, auth, realtime channels and storage. Data comes from
// seed.json (generated from sql/keeptrack_demo_seed.sql) and lives only in
// memory, so every page load starts from the same demo state.

import seed from './seed.json'

const DAY_MS = 24 * 60 * 60 * 1000

// ── Build the in-memory database, resolving relative dates ──
const now = Date.now()
const resolveDates = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) =>
  [k, v && typeof v === 'object' && 'daysAgo' in v ? new Date(now - v.daysAgo * DAY_MS).toISOString() : v]))

const db = {}
for (const [table, rows] of Object.entries(seed)) {
  if (Array.isArray(rows)) db[table] = rows.map(resolveDates)
}

const DEMO_USER_ID = seed.demoUserId

// ── Relationships (mirrors the FKs in sql/keeptrack_01_schema.sql) ──
// kind 'one': this row holds the FK. kind 'many': the target rows hold it.
const RELATIONS = {
  games: {
    game_types:                      { kind: 'one',  table: 'game_types', fk: 'game_type_id' },
    groups:                          { kind: 'one',  table: 'groups',     fk: 'group_id' },
    'profiles!games_logged_by_fkey': { kind: 'one',  table: 'profiles',   fk: 'logged_by' },
    profiles:                        { kind: 'one',  table: 'profiles',   fk: 'logged_by' },
    game_teams:                      { kind: 'many', table: 'game_teams', fk: 'game_id' },
    game_participants:               { kind: 'many', table: 'game_participants', fk: 'game_id' },
  },
  game_teams: {
    games:             { kind: 'one',  table: 'games', fk: 'game_id' },
    game_participants: { kind: 'many', table: 'game_participants', fk: 'game_team_id' },
  },
  game_participants: {
    profiles:   { kind: 'one', table: 'profiles',   fk: 'user_id' },
    games:      { kind: 'one', table: 'games',      fk: 'game_id' },
    game_teams: { kind: 'one', table: 'game_teams', fk: 'game_team_id' },
  },
  group_members: {
    profiles: { kind: 'one', table: 'profiles', fk: 'user_id' },
    groups:   { kind: 'one', table: 'groups',   fk: 'group_id' },
  },
  group_invites: {
    groups:   { kind: 'one', table: 'groups',   fk: 'group_id' },
    profiles: { kind: 'one', table: 'profiles', fk: 'created_by' },
  },
  groups: {
    profiles:      { kind: 'one',  table: 'profiles',      fk: 'owner_id' },
    group_members: { kind: 'many', table: 'group_members', fk: 'group_id' },
    games:         { kind: 'many', table: 'games',         fk: 'group_id' },
    game_types:    { kind: 'many', table: 'game_types',    fk: 'group_id' },
  },
  game_types: {
    groups: { kind: 'one', table: 'groups', fk: 'group_id' },
  },
}

// Tables the app deletes from with ON DELETE CASCADE children
const CASCADES = {
  games:      [['game_teams', 'game_id'], ['game_participants', 'game_id']],
  game_teams: [['game_participants', 'game_team_id']],
  groups:     [['group_members', 'group_id'], ['group_invites', 'group_id'], ['games', 'group_id'], ['game_types', 'group_id']],
}

const uuid = () => crypto.randomUUID()
const clone = (v) => JSON.parse(JSON.stringify(v))

// ── Select-string parser: "id, name, alias:col, rel!hint ( ... )" ──
function parseSelect(src) {
  src = (src ?? '*').replace(/\s+/g, ' ').trim() || '*'
  const fields = []
  let i = 0
  function parseList() {
    const list = []
    while (i < src.length) {
      while (src[i] === ' ' || src[i] === ',') i++
      if (src[i] === ')' || i >= src.length) break
      let name = ''
      while (i < src.length && !/[,()]/.test(src[i])) name += src[i++]
      name = name.trim()
      let alias = null
      if (name.includes(':')) [alias, name] = name.split(':').map(s => s.trim())
      while (src[i] === ' ') i++
      if (src[i] === '(') {
        i++
        const children = parseList()
        i++ // ')'
        const [rel, hint] = name.split('!')
        list.push({ embed: true, name, rel, hint, alias, children })
      } else {
        list.push({ embed: false, name, alias })
      }
    }
    return list
  }
  fields.push(...parseList())
  return fields
}

function project(table, row, fields) {
  const out = {}
  for (const f of fields) {
    if (!f.embed) {
      if (f.name === '*') Object.assign(out, row)
      else out[f.alias ?? f.name] = row[f.name] ?? null
      continue
    }
    const rels = RELATIONS[table] ?? {}
    const hint = f.hint && !['inner', 'left'].includes(f.hint) ? `${f.rel}!${f.hint}` : f.rel
    const rel = rels[hint] ?? rels[f.rel]
    if (!rel) throw new Error(`demo: no relation ${table} -> ${f.name}`)
    const key = f.alias ?? f.rel
    if (rel.kind === 'one') {
      const target = db[rel.table].find(r => r.id === row[rel.fk])
      out[key] = target ? project(rel.table, target, f.children) : null
    } else {
      out[key] = db[rel.table].filter(r => r[rel.fk] === row.id).map(r => project(rel.table, r, f.children))
    }
  }
  return out
}

// ── Filter helpers ──
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const coerce = (v) => (v === 'true' ? true : v === 'false' ? false : v === 'null' ? null : v)
const OPS = {
  eq:  (a, b) => a === b || String(a) === String(b),
  neq: (a, b) => !(a === b || String(a) === String(b)),
  gt:  (a, b) => a != null && a > b,
  gte: (a, b) => a != null && a >= b,
  lt:  (a, b) => a != null && a < b,
  lte: (a, b) => a != null && a <= b,
  is:  (a, b) => a === b,
  in:  (a, b) => b.includes(a),
}

// ── Query builder (thenable, like PostgrestFilterBuilder) ──
class Query {
  constructor(table) {
    this.table = table
    this.action = 'select'
    this.fields = parseSelect('*')
    this.filters = []
    this.orders = []
    this.limitN = null
    this.mode = 'many'
    this.returning = false
    this.countOpt = null
    this.head = false
  }

  select(cols, opts = {}) {
    this.fields = parseSelect(cols)
    if (this.action !== 'select') this.returning = true
    this.countOpt = opts.count ?? null
    this.head = !!opts.head
    return this
  }
  insert(values) { this.action = 'insert'; this.payload = values; return this }
  upsert(values) { this.action = 'upsert'; this.payload = values; return this }
  update(values) { this.action = 'update'; this.payload = values; return this }
  delete()       { this.action = 'delete'; return this }

  _add(op, col, val) { this.filters.push(row => OPS[op](row[col], val)); return this }
  eq(c, v)  { return this._add('eq', c, v) }
  neq(c, v) { return this._add('neq', c, v) }
  gt(c, v)  { return this._add('gt', c, v) }
  gte(c, v) { return this._add('gte', c, v) }
  lt(c, v)  { return this._add('lt', c, v) }
  lte(c, v) { return this._add('lte', c, v) }
  is(c, v)  { return this._add('is', c, v) }
  in(c, v)  { return this._add('in', c, v) }
  match(obj) { Object.entries(obj).forEach(([c, v]) => this.eq(c, v)); return this }
  or(expr) {
    const parts = expr.split(',').map(p => {
      const [col, op, ...rest] = p.split('.')
      return row => OPS[op](row[col], coerce(rest.join('.')))
    })
    this.filters.push(row => parts.some(fn => fn(row)))
    return this
  }
  order(col, { ascending = true, nullsFirst = false } = {}) {
    this.orders.push({ col, ascending, nullsFirst }); return this
  }
  limit(n) { this.limitN = n; return this }
  single()      { this.mode = 'single'; return this }
  maybeSingle() { this.mode = 'maybe'; return this }
  abortSignal() { return this }

  _matches() { return db[this.table].filter(r => this.filters.every(f => f(r))) }

  _run() {
    const table = db[this.table]
    if (!table) return { data: null, error: { message: `demo: unknown table ${this.table}` } }
    let rows

    if (this.action === 'insert' || this.action === 'upsert') {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]).map(v => {
        const stamp = new Date().toISOString()
        const row = { id: uuid(), created_at: stamp, ...clone(v) }
        if (this.table === 'games') row.played_at ??= stamp
        if (this.table === 'group_members') row.joined_at ??= stamp
        if (this.action === 'upsert') {
          const idx = table.findIndex(r => r.id === row.id)
          if (idx >= 0) { table[idx] = { ...table[idx], ...row }; return table[idx] }
        }
        table.push(row)
        emit(this.table, 'INSERT', row, null)
        return row
      })
      rows = list
    } else if (this.action === 'update') {
      rows = this._matches()
      rows.forEach(r => Object.assign(r, clone(this.payload), { updated_at: new Date().toISOString() }))
    } else if (this.action === 'delete') {
      rows = this._matches()
      rows.forEach(r => removeRow(this.table, r))
    } else {
      rows = this._matches()
    }

    if (this.action !== 'select' && !this.returning) return { data: null, error: null, count: null }

    const count = rows.length
    if (this.orders.length) {
      rows = [...rows].sort((a, b) => {
        for (const { col, ascending, nullsFirst } of this.orders) {
          const av = a[col], bv = b[col]
          if (av == null || bv == null) {
            if (av == null && bv == null) continue
            return (av == null) === nullsFirst ? -1 : 1
          }
          const c = cmp(av, bv)
          if (c) return ascending ? c : -c
        }
        return 0
      })
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN)
    if (this.head) return { data: null, error: null, count }

    const data = rows.map(r => clone(project(this.table, r, this.fields)))
    if (this.mode === 'single') {
      if (data.length !== 1) return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } }
      return { data: data[0], error: null }
    }
    if (this.mode === 'maybe') return { data: data[0] ?? null, error: null }
    return { data, error: null, count: this.countOpt ? count : null }
  }

  then(resolve, reject) {
    let result
    try { result = this._run() } catch (err) { result = { data: null, error: { message: err.message } } }
    return Promise.resolve(result).then(resolve, reject)
  }
}

function removeRow(table, row) {
  const idx = db[table].indexOf(row)
  if (idx < 0) return
  db[table].splice(idx, 1)
  emit(table, 'DELETE', null, row)
  for (const [child, fk] of CASCADES[table] ?? []) {
    db[child].filter(r => r[fk] === row.id).forEach(r => removeRow(child, r))
  }
}

// ── Realtime: channels receive the demo's own inserts/deletes ──
const channels = new Set()

function emit(table, event, newRow, oldRow) {
  const row = newRow ?? oldRow
  for (const ch of channels) {
    for (const { filter, cb } of ch.handlers) {
      if (filter.table !== table || filter.event !== event) continue
      if (filter.filter) {
        const [col, rest] = filter.filter.split('=')
        const val = rest.replace(/^eq\./, '')
        if (String(row[col]) !== val) continue
      }
      // Defer like a network push so the writer's own flow finishes first
      setTimeout(() => cb({ new: newRow ?? {}, old: oldRow ?? {} }), 50)
    }
  }
}

function channel() {
  const ch = {
    handlers: [],
    on(_type, filter, cb) { ch.handlers.push({ filter, cb }); return ch },
    subscribe(cb) { channels.add(ch); setTimeout(() => cb?.('SUBSCRIBED'), 0); return ch },
    unsubscribe() { channels.delete(ch) },
  }
  return ch
}

// ── Auth: always signed in as the demo user ──
const demoUser = () => {
  const p = db.profiles.find(r => r.id === DEMO_USER_ID)
  return { id: DEMO_USER_ID, email: p.email, user_metadata: { username: p.username }, aud: 'authenticated' }
}
const demoSession = () => ({ access_token: 'demo', token_type: 'bearer', user: demoUser() })
const ok = (data = {}) => Promise.resolve({ data, error: null })
const notInDemo = (what) => Promise.resolve({ data: null, error: { message: `${what} is disabled in the demo.` } })

const auth = {
  getSession:         () => ok({ session: demoSession() }),
  getUser:            () => ok({ user: demoUser() }),
  onAuthStateChange:  () => ({ data: { subscription: { unsubscribe() {} } } }),
  signInWithPassword: () => ok({ user: demoUser(), session: demoSession() }),
  signUp:             () => notInDemo('Creating accounts'),
  // Signing out would strand visitors on the login page with no way back in
  signOut:            () => { window.location.href = '/dashboard'; return ok() },
  mfa: {
    listFactors: () => ok({ all: [], totp: [] }),
    enroll:      () => notInDemo('Two-factor setup'),
    challenge:   () => notInDemo('Two-factor setup'),
    verify:      () => notInDemo('Two-factor setup'),
    unenroll:    () => notInDemo('Two-factor setup'),
  },
}

// ── Storage: uploads become in-memory object URLs ──
const uploads = new Map()
const storage = {
  from: () => ({
    upload: (path, file) => { uploads.set(path, URL.createObjectURL(file)); return ok({ path }) },
    getPublicUrl: (path) => ({ data: { publicUrl: uploads.get(path) ?? '' } }),
    remove: () => ok([]),
  }),
}

export const demoClient = {
  from: (table) => new Query(table),
  auth,
  storage,
  channel,
  removeChannel: (ch) => { channels.delete(ch); return ok('ok') },
}
