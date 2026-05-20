import { describe, it, expect } from 'vitest'
import {
  buildPlayerRecords,
  computeCurrentStreak,
  computeBestStreak,
  sortRecords,
  headToHead,
  formatStreak,
  fmtPct,
  POINTS,
} from '../lib/stats'

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeGame({ id, is_draw = false, played_at, gameTypeId = 'gt1', gameTypeName = 'Test Game', teams }) {
  return {
    id: id ?? crypto.randomUUID(),
    is_draw,
    played_at: played_at ?? new Date().toISOString(),
    game_types: { id: gameTypeId, name: gameTypeName },
    game_teams: teams.map((t, i) => ({
      id: `team-${id}-${i}`,
      is_winner: t.is_winner,
      score: t.score ?? null,
      game_participants: t.players.map(uid => ({
        user_id: uid,
        profiles: { id: uid, username: uid, avatar_url: null },
      })),
    })),
  }
}

const ALICE = 'user-alice'
const BOB   = 'user-bob'
const CAROL = 'user-carol'

// ─── buildPlayerRecords ──────────────────────────────────────────────────────

describe('buildPlayerRecords', () => {
  it('returns empty object for no games', () => {
    expect(buildPlayerRecords([])).toEqual({})
  })

  it('counts a win correctly', () => {
    const games = [
      makeGame({ id: 'g1', teams: [
        { is_winner: true,  players: [ALICE] },
        { is_winner: false, players: [BOB] },
      ]}),
    ]
    const records = buildPlayerRecords(games)
    expect(records[ALICE].wins).toBe(1)
    expect(records[ALICE].losses).toBe(0)
    expect(records[ALICE].points).toBe(POINTS.win)
    expect(records[BOB].wins).toBe(0)
    expect(records[BOB].losses).toBe(1)
    expect(records[BOB].points).toBe(POINTS.loss)
  })

  it('counts a draw correctly', () => {
    const games = [
      makeGame({ id: 'g1', is_draw: true, teams: [
        { is_winner: false, players: [ALICE] },
        { is_winner: false, players: [BOB] },
      ]}),
    ]
    const records = buildPlayerRecords(games)
    expect(records[ALICE].draws).toBe(1)
    expect(records[ALICE].wins).toBe(0)
    expect(records[ALICE].points).toBe(POINTS.draw)
    expect(records[BOB].draws).toBe(1)
  })

  it('calculates winPct correctly', () => {
    const games = [
      makeGame({ id: 'g1', teams: [{ is_winner: true,  players: [ALICE] }, { is_winner: false, players: [BOB] }] }),
      makeGame({ id: 'g2', teams: [{ is_winner: false, players: [ALICE] }, { is_winner: true,  players: [BOB] }] }),
      makeGame({ id: 'g3', teams: [{ is_winner: true,  players: [ALICE] }, { is_winner: false, players: [BOB] }] }),
    ]
    const records = buildPlayerRecords(games)
    expect(records[ALICE].winPct).toBeCloseTo(66.67, 1)
    expect(records[ALICE].played).toBe(3)
  })

  it('handles FFA games (each player own team)', () => {
    const games = [
      makeGame({ id: 'g1', teams: [
        { is_winner: true,  players: [ALICE] },
        { is_winner: false, players: [BOB] },
        { is_winner: false, players: [CAROL] },
      ]}),
    ]
    const records = buildPlayerRecords(games)
    expect(records[ALICE].wins).toBe(1)
    expect(records[BOB].losses).toBe(1)
    expect(records[CAROL].losses).toBe(1)
  })

  it('handles team games — all players on winning team get a win', () => {
    const games = [
      makeGame({ id: 'g1', teams: [
        { is_winner: true,  players: [ALICE, BOB] },
        { is_winner: false, players: [CAROL] },
      ]}),
    ]
    const records = buildPlayerRecords(games)
    expect(records[ALICE].wins).toBe(1)
    expect(records[BOB].wins).toBe(1)
    expect(records[CAROL].losses).toBe(1)
  })

  it('filters by gameTypeId when provided', () => {
    const games = [
      makeGame({ id: 'g1', gameTypeId: 'gt-smash', teams: [
        { is_winner: true,  players: [ALICE] },
        { is_winner: false, players: [BOB] },
      ]}),
      makeGame({ id: 'g2', gameTypeId: 'gt-kart', teams: [
        { is_winner: false, players: [ALICE] },
        { is_winner: true,  players: [BOB] },
      ]}),
    ]
    const records = buildPlayerRecords(games, 'gt-smash')
    expect(records[ALICE].wins).toBe(1)
    expect(records[ALICE].played).toBe(1) // only 1 game, not 2
    expect(records[BOB].wins).toBe(0)     // BOB played in gt-smash but lost
    expect(records[BOB].losses).toBe(1)
    expect(records[BOB].played).toBe(1)   // only 1 game counted, not 2
  })

  it('skips games with no game_teams', () => {
    const games = [{ id: 'g1', is_draw: false, game_types: null, game_teams: null }]
    expect(buildPlayerRecords(games)).toEqual({})
  })

  it('points system: W=3 D=1 L=0', () => {
    expect(POINTS.win).toBe(3)
    expect(POINTS.draw).toBe(1)
    expect(POINTS.loss).toBe(0)
  })
})

// ─── computeCurrentStreak ────────────────────────────────────────────────────

describe('computeCurrentStreak', () => {
  it('returns null type for empty array', () => {
    expect(computeCurrentStreak([]).type).toBeNull()
    expect(computeCurrentStreak([]).count).toBe(0)
  })

  it('counts consecutive wins from most recent', () => {
    const result = computeCurrentStreak(['loss', 'win', 'win', 'win'])
    expect(result.type).toBe('win')
    expect(result.count).toBe(3)
  })

  it('counts a single loss streak', () => {
    const result = computeCurrentStreak(['win', 'win', 'loss'])
    expect(result.type).toBe('loss')
    expect(result.count).toBe(1)
  })

  it('handles all draws', () => {
    const result = computeCurrentStreak(['draw', 'draw', 'draw'])
    expect(result.type).toBe('draw')
    expect(result.count).toBe(3)
  })

  it('stops counting when streak breaks', () => {
    const result = computeCurrentStreak(['win', 'loss', 'win', 'win', 'loss', 'win'])
    expect(result.type).toBe('win')
    expect(result.count).toBe(1)
  })
})

// ─── computeBestStreak ───────────────────────────────────────────────────────

describe('computeBestStreak', () => {
  it('returns 0 for empty array', () => {
    expect(computeBestStreak([])).toBe(0)
  })

  it('returns the longest win streak', () => {
    expect(computeBestStreak(['win', 'win', 'loss', 'win', 'win', 'win'])).toBe(3)
  })

  it('ignores loss and draw streaks', () => {
    expect(computeBestStreak(['loss', 'loss', 'loss', 'win'])).toBe(1)
    expect(computeBestStreak(['draw', 'draw', 'draw'])).toBe(0)
  })

  it('handles single win', () => {
    expect(computeBestStreak(['loss', 'win', 'loss'])).toBe(1)
  })
})

// ─── sortRecords ─────────────────────────────────────────────────────────────

describe('sortRecords', () => {
  const records = [
    { userId: 'a', wins: 2, losses: 1, draws: 0, played: 3, points: 6,  winPct: 66 },
    { userId: 'b', wins: 3, losses: 0, draws: 0, played: 3, points: 9,  winPct: 100 },
    { userId: 'c', wins: 1, losses: 2, draws: 0, played: 3, points: 3,  winPct: 33 },
  ]

  it('sorts by winPct descending by default', () => {
    const sorted = sortRecords(records, 'winPct')
    expect(sorted[0].userId).toBe('b')
    expect(sorted[2].userId).toBe('c')
  })

  it('sorts by wins', () => {
    const sorted = sortRecords(records, 'wins')
    expect(sorted[0].userId).toBe('b')
    expect(sorted[2].userId).toBe('c')
  })

  it('sorts by losses', () => {
    const sorted = sortRecords(records, 'losses')
    expect(sorted[0].userId).toBe('c')
  })

  it('sorts by points', () => {
    const sorted = sortRecords(records, 'points')
    expect(sorted[0].userId).toBe('b')
    expect(sorted[0].points).toBe(9)
  })

  it('does not mutate original array', () => {
    const original = [...records]
    sortRecords(records, 'wins')
    expect(records).toEqual(original)
  })
})

// ─── headToHead ──────────────────────────────────────────────────────────────

describe('headToHead', () => {
  const games = [
    makeGame({ id: 'g1', teams: [{ is_winner: true,  players: [ALICE] }, { is_winner: false, players: [BOB] }] }),
    makeGame({ id: 'g2', teams: [{ is_winner: false, players: [ALICE] }, { is_winner: true,  players: [BOB] }] }),
    makeGame({ id: 'g3', teams: [{ is_winner: true,  players: [ALICE] }, { is_winner: false, players: [BOB] }] }),
    // Game where CAROL plays but not ALICE or BOB — should be excluded
    makeGame({ id: 'g4', teams: [{ is_winner: true, players: [CAROL] }, { is_winner: false, players: [BOB] }] }),
  ]

  it('counts correct wins for each player', () => {
    const result = headToHead(games, ALICE, BOB)
    expect(result.aWins).toBe(2)
    expect(result.bWins).toBe(1)
    expect(result.total).toBe(3)
  })

  it('excludes games where only one of the two played', () => {
    const result = headToHead(games, ALICE, BOB)
    expect(result.total).toBe(3) // g4 excluded
  })

  it('handles draws', () => {
    const drawGames = [
      makeGame({ id: 'd1', is_draw: true, teams: [
        { is_winner: false, players: [ALICE] },
        { is_winner: false, players: [BOB] },
      ]}),
    ]
    const result = headToHead(drawGames, ALICE, BOB)
    expect(result.draws).toBe(1)
    expect(result.aWins).toBe(0)
    expect(result.bWins).toBe(0)
  })

  it('returns zero totals when players have never faced each other', () => {
    const result = headToHead(games, ALICE, CAROL)
    expect(result.total).toBe(0)
    expect(result.aWins).toBe(0)
  })

  it('filters by gameTypeId', () => {
    const mixedGames = [
      makeGame({ id: 'm1', gameTypeId: 'gt-a', teams: [{ is_winner: true, players: [ALICE] }, { is_winner: false, players: [BOB] }] }),
      makeGame({ id: 'm2', gameTypeId: 'gt-b', teams: [{ is_winner: false, players: [ALICE] }, { is_winner: true, players: [BOB] }] }),
    ]
    const result = headToHead(mixedGames, ALICE, BOB, 'gt-a')
    expect(result.total).toBe(1)
    expect(result.aWins).toBe(1)
  })

  it('calculates win percentages', () => {
    const result = headToHead(games, ALICE, BOB)
    expect(result.aWinPct).toBe(67) // 2/3 rounded
    expect(result.bWinPct).toBe(33) // 1/3 rounded
  })
})

// ─── formatStreak ────────────────────────────────────────────────────────────

describe('formatStreak', () => {
  it('returns em dash for null/zero streak', () => {
    expect(formatStreak({ type: null, count: 0 }).label).toBe('—')
    expect(formatStreak({ type: 'win', count: 0 }).label).toBe('—')
  })

  it('returns fire emoji for win streak', () => {
    const result = formatStreak({ type: 'win', count: 5 })
    expect(result.label).toBe('🔥 5')
    expect(result.color).toBe('text-emerald-400')
  })

  it('returns ice emoji for loss streak', () => {
    const result = formatStreak({ type: 'loss', count: 2 })
    expect(result.label).toBe('❄️ 2')
    expect(result.color).toBe('text-red-400')
  })

  it('returns minus emoji for draw streak', () => {
    const result = formatStreak({ type: 'draw', count: 1 })
    expect(result.label).toBe('➖ 1')
  })
})

// ─── fmtPct ──────────────────────────────────────────────────────────────────

describe('fmtPct', () => {
  it('formats integer percentage', () => {
    expect(fmtPct(100)).toBe('100%')
    expect(fmtPct(0)).toBe('0%')
  })

  it('rounds decimals', () => {
    expect(fmtPct(66.66)).toBe('67%')
    expect(fmtPct(33.33)).toBe('33%')
  })
})

// ─── Regression: stale cache / group switching ────────────────────────────────
// These tests document the exact conditions that caused the group-switching bug.

describe('regression: group switching data isolation', () => {
  it('buildPlayerRecords produces different results for different game sets', () => {
    const groupAGames = [
      makeGame({ id: 'a1', teams: [{ is_winner: true, players: [ALICE] }, { is_winner: false, players: [BOB] }] }),
      makeGame({ id: 'a2', teams: [{ is_winner: true, players: [ALICE] }, { is_winner: false, players: [BOB] }] }),
    ]
    const groupBGames = [
      makeGame({ id: 'b1', teams: [{ is_winner: false, players: [ALICE] }, { is_winner: true, players: [BOB] }] }),
    ]

    const recordsA = buildPlayerRecords(groupAGames)
    const recordsB = buildPlayerRecords(groupBGames)

    // If the cache bug existed, recordsB would still show ALICE winning
    expect(recordsA[ALICE].wins).toBe(2)
    expect(recordsB[ALICE].wins).toBe(0)
    expect(recordsB[BOB].wins).toBe(1)
  })

  it('empty games array produces empty records (what invalidate() causes)', () => {
    const records = buildPlayerRecords([])
    expect(Object.keys(records)).toHaveLength(0)
  })

  it('filterType from old group produces empty records when game type does not exist', () => {
    const games = [
      makeGame({ id: 'g1', gameTypeId: 'gt-new-group', teams: [
        { is_winner: true, players: [ALICE] },
        { is_winner: false, players: [BOB] },
      ]}),
    ]
    // Simulates: user had filterType='gt-old-group' from previous group,
    // then switched groups without resetting the filter
    const records = buildPlayerRecords(games, 'gt-old-group')
    expect(Object.keys(records)).toHaveLength(0) // should be empty, not stale data
  })
})
