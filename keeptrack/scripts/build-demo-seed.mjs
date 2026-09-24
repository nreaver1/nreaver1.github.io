// Converts sql/keeptrack_demo_seed.sql into src/demo/seed.json for demo mode.
// Run with: node scripts/build-demo-seed.mjs
//
// The SQL seed is the source of truth; this keeps the demo data identical to
// what the real database is seeded with. Dates are stored as "days ago" and
// resolved against the current time when the demo client boots.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sql  = readFileSync(resolve(root, 'sql/keeptrack_demo_seed.sql'), 'utf8')

// ── Split the DO block body into statements (quote-aware) ──
const body = sql.slice(sql.indexOf('\nbegin') + 6, sql.lastIndexOf('end $$'))
  .split('\n').filter(l => !l.trim().startsWith('--')).join('\n')

const statements = []
let cur = '', inStr = false
for (let i = 0; i < body.length; i++) {
  const c = body[i]
  if (c === "'") {
    if (inStr && body[i + 1] === "'") { cur += "''"; i++; continue }
    inStr = !inStr
  }
  if (c === ';' && !inStr) { statements.push(cur.trim()); cur = '' } else cur += c
}

// ── Tuple parser: turns "(a, 'b', null), (...)" into arrays of values ──
function parseTuples(src) {
  const tuples = []
  let i = 0
  const skipWs = () => { while (/\s/.test(src[i])) i++ }
  function value() {
    skipWs()
    if (src[i] === "'") {
      let s = ''; i++
      while (i < src.length) {
        if (src[i] === "'" && src[i + 1] === "'") { s += "'"; i += 2; continue }
        if (src[i] === "'") { i++; break }
        s += src[i++]
      }
      return s
    }
    let depth = 0, raw = ''
    while (i < src.length && !(depth === 0 && (src[i] === ',' || src[i] === ')'))) {
      if (src[i] === '(') depth++
      if (src[i] === ')') depth--
      if (src[i] === "'") {                       // string inside an expression
        raw += src[i++]
        while (src[i] !== "'") raw += src[i++]
      }
      raw += src[i++]
    }
    raw = raw.trim()
    if (raw === 'null') return null
    if (raw === 'true') return true
    if (raw === 'false') return false
    if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
    const ago = raw.match(/^now\(\)\s*-\s*interval\s*'(\d+)\s*(day|days|hour|hours)'$/)
    if (ago) return { daysAgo: ago[2].startsWith('hour') ? Number(ago[1]) / 24 : Number(ago[1]) }
    if (raw === 'now()') return { daysAgo: 0 }
    if (raw === 'gen_random_uuid()') return { newId: true }
    return { ref: raw }
  }
  while (i < src.length) {
    skipWs()
    if (src[i] !== '(') { i++; continue }
    i++
    const row = []
    for (;;) {
      row.push(value()); skipWs()
      if (src[i] === ',') { i++; continue }
      if (src[i] === ')') { i++; break }
      throw new Error(`Unexpected "${src.slice(i, i + 20)}"`)
    }
    tuples.push(row)
  }
  return tuples
}

// ── Deterministic ids so demo URLs are stable between loads ──
let counter = 0
const vars  = {}
const newId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`
const idOf  = (v) => {
  if (v && v.newId) return newId()
  if (v && v.ref) return (vars[v.ref] ??= newId())
  return v
}

const db = {
  profiles: [], groups: [], group_members: [], group_invites: [],
  game_types: [], games: [], game_teams: [], game_participants: [], audit_log: [],
}

const insertRe = /^insert into (\w+)\s*\(([^)]*)\)\s*values([\s\S]*?)(on conflict[\s\S]*)?$/i
const gtLookup = {} // var name -> game type name

for (const st of statements) {
  let m
  if ((m = st.match(/^select id into (\w+)\s+from game_types where name = '([^']+)'/i))) {
    gtLookup[m[1]] = m[2]
    continue
  }
  if ((m = st.match(insertRe))) {
    const [, table, colList, values] = m
    const cols = colList.split(',').map(c => c.trim())
    for (const tuple of parseTuples(values)) {
      const row = {}
      cols.forEach((c, idx) => {
        const v = tuple[idx]
        row[c] = (v && (v.ref || v.newId)) ? idOf(v) : v
      })
      if (!row.id) row.id = newId()
      db[table].push(row)
    }
    continue
  }
  // insert into game_participants (...) select v_game, id, <users> from game_teams where game_id = v_game [and team_label = 'X'] [order by ...]
  if ((m = st.match(/^insert into game_participants[\s\S]*?select\s+(\w+),\s*id,\s*([\s\S]+?)\s+from game_teams where game_id = (\w+)(?:\s+and team_label = '((?:[^']|'')*)')?(?:\s+order by ([\s\S]+))?$/i))) {
    const [, , usersExpr, gameVar, label, orderBy] = m
    const gameId = vars[gameVar]
    const users = usersExpr.startsWith('unnest')
      ? usersExpr.match(/\[([^\]]*)\]/)[1].split(',').map(s => s.trim())
      : [usersExpr.trim()]
    let teams = db.game_teams.filter(t => t.game_id === gameId)
    if (label != null) {
      const team = teams.find(t => t.team_label === label.replace(/''/g, "'"))
      users.forEach(u => db.game_participants.push({ id: newId(), game_id: gameId, game_team_id: team.id, user_id: vars[u] }))
    } else {
      // FFA: the i-th player gets the i-th team in the query's sort order
      if (orderBy && /score desc/i.test(orderBy)) {
        teams = [...teams].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity))
      } else if (orderBy && /is_winner desc/i.test(orderBy)) {
        teams = [...teams].sort((a, b) => Number(b.is_winner) - Number(a.is_winner))
      }
      users.forEach((u, idx) => db.game_participants.push({ id: newId(), game_id: gameId, game_team_id: teams[idx].id, user_id: vars[u] }))
    }
    continue
  }
  if (st) throw new Error(`Unhandled statement:\n${st.slice(0, 200)}`)
}

// Resolve preset game type ids referenced by games (v_gt_* vars point at presets by name)
for (const [varName, name] of Object.entries(gtLookup)) {
  const preset = db.game_types.find(t => t.name === name && t.is_preset)
  const placeholder = vars[varName]
  for (const g of db.games) if (g.game_type_id === placeholder) g.game_type_id = preset.id
}

// Fill column defaults the SQL leaves to Postgres
const oldest = Math.max(...db.games.map(g => g.played_at?.daysAgo ?? 0)) + 3
for (const p of db.profiles) p.created_at = { daysAgo: oldest }
for (const g of db.groups) g.created_at = { daysAgo: oldest }
for (const m of db.group_members) m.joined_at = { daysAgo: oldest }
for (const g of db.games) { g.created_at = g.played_at; g.notes ??= null }
for (const t of db.game_types) { t.created_at = { daysAgo: oldest }; t.description ??= null }
for (const i of db.group_invites) i.created_at = { daysAgo: 8 }

const out = resolve(root, 'src/demo/seed.json')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ demoUserId: vars.v_nick, ...db }) + '\n')

console.log(`Wrote ${out}`)
for (const [t, rows] of Object.entries(db)) console.log(`  ${t.padEnd(18)} ${rows.length}`)
