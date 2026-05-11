// ─────────────────────────────────────────────────────────────
// Keep Track — Stats Engine
// Pure functions. No Supabase calls. Takes raw game records
// (as returned by gameStore.fetchRecentGames) and derives
// every stat the UI needs.
// ─────────────────────────────────────────────────────────────

// Points system: win = 3, draw = 1, loss = 0
export const POINTS = { win: 3, draw: 1, loss: 0 }

// ── Build a per-player record from a list of games ──────────
// Returns a map: { [userId]: PlayerRecord }
export function buildPlayerRecords(games, filterGameTypeId = null) {
  const records = {}

  const filtered = filterGameTypeId
    ? games.filter(g => g.game_types?.id === filterGameTypeId)
    : games

  for (const game of filtered) {
    if (!game.game_teams) continue

    for (const team of game.game_teams) {
      if (!team.game_participants) continue

      for (const participant of team.game_participants) {
        const uid = participant.user_id
        if (!records[uid]) {
          records[uid] = {
            userId:   uid,
            username: participant.profiles?.username ?? uid,
            avatar:   participant.profiles?.avatar_url ?? null,
            wins:     0,
            losses:   0,
            draws:    0,
            points:   0,
            played:   0,
            games:    [], // chronological for streak calc
          }
        }

        records[uid].played++

        if (game.is_draw) {
          records[uid].draws++
          records[uid].points += POINTS.draw
          records[uid].games.push('draw')
        } else if (team.is_winner) {
          records[uid].wins++
          records[uid].points += POINTS.win
          records[uid].games.push('win')
        } else {
          records[uid].losses++
          records[uid].points += POINTS.loss
          records[uid].games.push('loss')
        }
      }
    }
  }

  // Compute derived fields
  for (const rec of Object.values(records)) {
    rec.winPct       = rec.played > 0 ? (rec.wins / rec.played) * 100 : 0
    rec.currentStreak = computeCurrentStreak(rec.games)
    rec.bestStreak    = computeBestStreak(rec.games)
  }

  return records
}

// ── Sort a records array by the given column ────────────────
export function sortRecords(records, sortBy = 'winPct') {
  return [...records].sort((a, b) => {
    switch (sortBy) {
      case 'winPct':  return b.winPct  - a.winPct  || b.wins - a.wins
      case 'wins':    return b.wins    - a.wins     || b.winPct - a.winPct
      case 'losses':  return b.losses  - a.losses   || a.winPct - b.winPct
      case 'played':  return b.played  - a.played   || b.winPct - a.winPct
      case 'points':  return b.points  - a.points   || b.winPct - a.winPct
      default:        return b.winPct  - a.winPct
    }
  })
}

// ── Current streak (most recent consecutive same result) ────
// games is chronological oldest→newest
export function computeCurrentStreak(games) {
  if (!games.length) return { type: null, count: 0 }
  const reversed = [...games].reverse()
  const type     = reversed[0]
  let count      = 0
  for (const g of reversed) {
    if (g === type) count++
    else break
  }
  return { type, count }
}

// ── Best win streak ever ────────────────────────────────────
export function computeBestStreak(games) {
  let best = 0, current = 0
  for (const g of games) {
    if (g === 'win') { current++; best = Math.max(best, current) }
    else current = 0
  }
  return best
}

// ── Head-to-head between two players ───────────────────────
// Returns { aWins, bWins, draws, total, games[] }
export function headToHead(games, userAId, userBId, filterGameTypeId = null) {
  const result = { aWins: 0, bWins: 0, draws: 0, total: 0, recentGames: [] }

  const filtered = filterGameTypeId
    ? games.filter(g => g.game_types?.id === filterGameTypeId)
    : games

  for (const game of filtered) {
    if (!game.game_teams) continue

    // Check both players participated in this game
    const allParticipants = game.game_teams.flatMap(t => t.game_participants ?? [])
    const aPlayed = allParticipants.some(p => p.user_id === userAId)
    const bPlayed = allParticipants.some(p => p.user_id === userBId)
    if (!aPlayed || !bPlayed) continue

    result.total++

    if (game.is_draw) {
      result.draws++
      result.recentGames.push({ game, outcome: 'draw' })
      continue
    }

    // Find which team each player is on
    const aTeam = game.game_teams.find(t => t.game_participants?.some(p => p.user_id === userAId))
    const bTeam = game.game_teams.find(t => t.game_participants?.some(p => p.user_id === userBId))

    if (aTeam?.is_winner) {
      result.aWins++
      result.recentGames.push({ game, outcome: 'aWin' })
    } else if (bTeam?.is_winner) {
      result.bWins++
      result.recentGames.push({ game, outcome: 'bWin' })
    }
  }

  result.aWinPct = result.total > 0 ? Math.round((result.aWins / result.total) * 100) : 0
  result.bWinPct = result.total > 0 ? Math.round((result.bWins / result.total) * 100) : 0

  return result
}

// ── Format a streak for display ─────────────────────────────
export function formatStreak(streak) {
  if (!streak.type || streak.count === 0) return { label: '—', color: 'text-white/30' }
  const icons = { win: '🔥', loss: '❄️', draw: '➖' }
  const colors = { win: 'text-emerald-400', loss: 'text-red-400', draw: 'text-yellow-400' }
  return {
    label: `${icons[streak.type]} ${streak.count}`,
    color: colors[streak.type],
  }
}

// ── Format win % for display ─────────────────────────────────
export function fmtPct(n) {
  return `${Math.round(n)}%`
}
