// ══════════════════════════════════════════════════════════════
//  nexus.test.js  —  NEXUS Campaign System Test Suite
//
//  Covers all pure functions in js/nexus-utils.js.
//  Run with:   node --test tests/nexus.test.js
//
//  Uses Node's built-in test runner (node:test) — no dependencies.
//  Output is TAP format. Each section is clearly labelled with:
//    - what function is being tested
//    - what each test expects
//    - any edge cases being guarded against
// ══════════════════════════════════════════════════════════════

'use strict';

const { describe, it } = require('node:test');
const assert           = require('node:assert/strict');
const {
  uid,
  fmt,
  esc,
  abilityMod,
  modStr,
  computeCheck,
  computeNetEffects,
  recalcVaultFromLedger,
  calcSplitShares,
  getMemberNetWorth,
  LOOT_GROUP_EMOJI,
  lootTypeEmoji,
} = require('../js/nexus-utils.js');


// ══════════════════════════════════════════════════════════════
//  SECTION 1 — GENERAL HELPERS
//  uid, fmt, esc
// ══════════════════════════════════════════════════════════════

describe('uid()', () => {

  // Expected: always starts with '_' and is at least a few chars long
  it('starts with an underscore prefix', () => {
    assert.match(uid(), /^_/);
  });

  // Expected: long enough to be reasonably unique (9 base-36 chars)
  it('is at least 5 characters long', () => {
    assert.ok(uid().length >= 5);
  });

  // Expected: each call returns a different value (probabilistic but reliable)
  it('generates unique values on successive calls', () => {
    const ids = new Set(Array.from({ length: 100 }, uid));
    assert.strictEqual(ids.size, 100, 'all 100 generated IDs should be unique');
  });

});


describe('fmt()', () => {

  // Expected: adds thousand separators
  it('formats large numbers with commas', () => {
    // Note: toLocaleString is locale-dependent; we test the round-trip
    // rather than a hardcoded string to stay locale-agnostic
    const result = fmt(1234567);
    assert.ok(result.includes('1') && result.includes('234'));
  });

  // Expected: small numbers pass through cleanly
  it('formats small numbers without separators', () => {
    assert.strictEqual(fmt(42), '42');
  });

  // Expected: zero formats cleanly
  it('formats zero as "0"', () => {
    assert.strictEqual(fmt(0), '0');
  });

  // Expected: strings that are valid numbers get formatted too
  it('coerces numeric strings', () => {
    assert.strictEqual(fmt('99'), '99');
  });

});


describe('esc()', () => {

  // Expected: the three dangerous HTML characters are escaped
  it('escapes ampersands', () => {
    assert.strictEqual(esc('Rations & Rope'), 'Rations &amp; Rope');
  });

  it('escapes less-than signs', () => {
    assert.strictEqual(esc('<script>'), '&lt;script&gt;');
  });

  it('escapes a full XSS-style payload', () => {
    assert.strictEqual(
      esc('<img src=x onerror="alert(1)">'),
      '&lt;img src=x onerror="alert(1)"&gt;'
    );
  });

  // Expected: safe strings pass through unchanged
  it('leaves safe strings unchanged', () => {
    assert.strictEqual(esc('Thalindra'), 'Thalindra');
  });

  // Expected: null/undefined should not throw — defaults to empty string
  it('handles null without throwing', () => {
    assert.strictEqual(esc(null), '');
  });

  it('handles undefined without throwing', () => {
    assert.strictEqual(esc(undefined), '');
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 2 — D&D 5E MATH
//  abilityMod, modStr, computeCheck, computeNetEffects
// ══════════════════════════════════════════════════════════════

describe('abilityMod()', () => {
  // D&D 5e formula: floor((score - 10) / 2)
  // This is fundamental — every check, save, and combat stat depends on it.

  it('score 10 → modifier +0  (the neutral baseline)', () => {
    assert.strictEqual(abilityMod(10), 0);
  });

  it('score 12 → modifier +1', () => {
    assert.strictEqual(abilityMod(12), 1);
  });

  it('score 14 → modifier +2  (verified manually: (14-10)/2 = 2)', () => {
    assert.strictEqual(abilityMod(14), 2);
  });

  it('score 16 → modifier +3', () => {
    assert.strictEqual(abilityMod(16), 3);
  });

  it('score 18 → modifier +4  (common for a primary stat)', () => {
    assert.strictEqual(abilityMod(18), 4);
  });

  it('score 20 → modifier +5  (maximum standard score)', () => {
    assert.strictEqual(abilityMod(20), 5);
  });

  // Odd scores: floor() means 11 and 12 both give +1
  it('score 11 → modifier +0  (floor rounds down for odd scores)', () => {
    assert.strictEqual(abilityMod(11), 0);
  });

  it('score 13 → modifier +1  (not +1.5)', () => {
    assert.strictEqual(abilityMod(13), 1);
  });

  // Below-average scores
  it('score 8  → modifier -1', () => {
    assert.strictEqual(abilityMod(8), -1);
  });

  it('score 6  → modifier -2', () => {
    assert.strictEqual(abilityMod(6), -2);
  });

  it('score 1  → modifier -5  (minimum possible score)', () => {
    assert.strictEqual(abilityMod(1), -5);
  });

  // Edge: unset abilities default to 10 (+0) — prevents NaN in display
  it('undefined score defaults to 10, giving +0', () => {
    assert.strictEqual(abilityMod(undefined), 0);
  });

  it('null score defaults to 10, giving +0', () => {
    assert.strictEqual(abilityMod(null), 0);
  });

  it('score 0 defaults to 10 (falsy guard), giving +0', () => {
    // 0 is not a valid D&D score; the || 10 guard treats it as unset
    assert.strictEqual(abilityMod(0), 0);
  });

});


describe('modStr()', () => {
  // Converts a raw modifier number to a display string.
  // Positive and zero always show '+', negative keeps '-'.

  it('positive modifier gets a + prefix', () => {
    assert.strictEqual(modStr(3), '+3');
  });

  it('zero modifier shows +0, not just "0"', () => {
    assert.strictEqual(modStr(0), '+0');
  });

  it('negative modifier keeps its minus sign', () => {
    assert.strictEqual(modStr(-2), '-2');
  });

  it('+5 formats correctly', () => {
    assert.strictEqual(modStr(5), '+5');
  });

  it('-5 formats correctly', () => {
    assert.strictEqual(modStr(-5), '-5');
  });

});


describe('computeCheck()', () => {
  // A check value = ability mod + (proficiency bonus if proficient) + item bonuses - item penalties

  // Base case: STR 10, no prof, no items → +0
  it('returns +0 for ability score 10 with no proficiency or items', () => {
    const member = { abilities: { str: 10 }, proficiencies: {} };
    assert.strictEqual(computeCheck('athletics', 'str', member, {}, 2), 0);
  });

  // STR 16 = +3 mod, no prof → +3
  it('returns ability modifier when not proficient', () => {
    const member = { abilities: { str: 16 }, proficiencies: {} };
    assert.strictEqual(computeCheck('athletics', 'str', member, {}, 2), 3);
  });

  // STR 16 = +3 mod, proficient (prof=2) → +5
  it('adds proficiency bonus when the member is proficient', () => {
    const member = { abilities: { str: 16 }, proficiencies: { athletics: true } };
    assert.strictEqual(computeCheck('athletics', 'str', member, {}, 2), 5);
  });

  // Proficiency bonus 3 (levels 5-8)
  it('uses the correct proficiency bonus value — not always 2', () => {
    const member = { abilities: { str: 14 }, proficiencies: { athletics: true } };
    assert.strictEqual(computeCheck('athletics', 'str', member, {}, 3), 5); // +2 mod + 3 prof
  });

  // Item gives +2 bonus to athletics
  it('adds item bonus from the net effects map', () => {
    const member = { abilities: { str: 10 }, proficiencies: {} };
    const net = { athletics: { bonus: 2, penalty: 0 } };
    assert.strictEqual(computeCheck('athletics', 'str', member, net, 2), 2);
  });

  // Item gives -2 penalty
  it('subtracts item penalty from the net effects map', () => {
    const member = { abilities: { str: 10 }, proficiencies: {} };
    const net = { athletics: { bonus: 0, penalty: 2 } };
    assert.strictEqual(computeCheck('athletics', 'str', member, net, 2), -2);
  });

  // Prof + item bonus stacking
  it('stacks proficiency and item bonus correctly', () => {
    const member = { abilities: { str: 14 }, proficiencies: { athletics: true } };
    const net = { athletics: { bonus: 3, penalty: 0 } };
    // +2 (mod) + 2 (prof) + 3 (item) = +7
    assert.strictEqual(computeCheck('athletics', 'str', member, net, 2), 7);
  });

  // Missing ability — should default to 10 → +0 mod
  it('defaults to +0 when the ability is not set on the member', () => {
    const member = { abilities: {}, proficiencies: {} };
    assert.strictEqual(computeCheck('athletics', 'str', member, {}, 2), 0);
  });

});


describe('computeNetEffects()', () => {
  // Aggregates item stat effects for a named member.
  // Items held by 'Party' apply to everyone.

  it('returns empty net when member has no items', () => {
    const { net, relevant } = computeNetEffects('Thalindra', []);
    assert.deepStrictEqual(net, {});
    assert.strictEqual(relevant.length, 0);
  });

  it('applies a bonus from an item the member holds', () => {
    const items = [{
      name: 'Ring of Strength', holder: 'Thalindra', rarity: 'rare',
      statEffects: [{ stat: 'str', type: 'bonus', value: 4 }],
    }];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.str.bonus, 4);
  });

  it('applies a penalty correctly', () => {
    const items = [{
      name: 'Cursed Gauntlets', holder: 'Thalindra', rarity: 'uncommon',
      statEffects: [{ stat: 'dex', type: 'penalty', value: 2 }],
    }];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.dex.penalty, 2);
  });

  it('stacks bonuses from multiple items on the same stat', () => {
    const items = [
      { name: 'Belt of STR',  holder: 'Thalindra', rarity: 'rare',     statEffects: [{ stat: 'str', type: 'bonus', value: 2 }] },
      { name: 'Gauntlets',    holder: 'Thalindra', rarity: 'uncommon', statEffects: [{ stat: 'str', type: 'bonus', value: 1 }] },
    ];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.str.bonus, 3); // 2 + 1
  });

  it('applies Party-held items to all members regardless of name', () => {
    const items = [{
      name: 'Party Amulet', holder: 'Party', rarity: 'uncommon',
      statEffects: [{ stat: 'ac', type: 'bonus', value: 1 }],
    }];
    const { net: netT } = computeNetEffects('Thalindra', items);
    const { net: netR } = computeNetEffects('Ragnar',    items);
    // Both members receive the party item's bonus
    assert.strictEqual(netT.ac.bonus, 1);
    assert.strictEqual(netR.ac.bonus, 1);
  });

  it('does NOT apply another member\'s item to the wrong member', () => {
    const items = [{
      name: 'Ragnar\'s Axe', holder: 'Ragnar', rarity: 'uncommon',
      statEffects: [{ stat: 'str', type: 'bonus', value: 3 }],
    }];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.str, undefined);
  });

  it('matching is case-insensitive for holder name', () => {
    const items = [{
      name: 'Magic Boots', holder: 'THALINDRA', rarity: 'uncommon',
      statEffects: [{ stat: 'speed', type: 'bonus', value: 10 }],
    }];
    const { net } = computeNetEffects('thalindra', items);
    assert.strictEqual(net.speed.bonus, 10);
  });

  it('counts advantage and disadvantage flags', () => {
    const items = [
      { name: 'Lucky Charm', holder: 'Thalindra', rarity: 'common', statEffects: [{ stat: 'perception', type: 'advantage' }] },
      { name: 'Blindfold',   holder: 'Thalindra', rarity: 'common', statEffects: [{ stat: 'perception', type: 'disadvantage' }] },
    ];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.perception.advantage,    1);
    assert.strictEqual(net.perception.disadvantage, 1);
  });

  it('tracks source references for each applied effect', () => {
    const items = [{
      name: 'Ring of STR', holder: 'Thalindra', rarity: 'rare',
      statEffects: [{ stat: 'str', type: 'bonus', value: 4 }],
    }];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.str.sources[0].itemName, 'Ring of STR');
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 3 — TREASURY MATH
//  recalcVaultFromLedger, calcSplitShares, getMemberNetWorth
// ══════════════════════════════════════════════════════════════

describe('recalcVaultFromLedger()', () => {
  // The vault balance is the sum of all gains minus all spends.
  // This is the single most important financial calculation in NEXUS.

  it('empty ledger returns an empty vault', () => {
    assert.deepStrictEqual(recalcVaultFromLedger([]), {});
  });

  it('a single gain adds to the vault', () => {
    const ledger = [{ type: 'gain', coins: { cr: 100 } }];
    assert.deepStrictEqual(recalcVaultFromLedger(ledger), { cr: 100 });
  });

  it('a single spend subtracts from the vault', () => {
    const ledger = [{ type: 'spend', coins: { cr: 40 } }];
    assert.deepStrictEqual(recalcVaultFromLedger(ledger), { cr: -40 });
  });

  it('gain then spend results in the correct net balance', () => {
    const ledger = [
      { type: 'gain',  coins: { cr: 200 } },
      { type: 'spend', coins: { cr: 75  } },
    ];
    assert.deepStrictEqual(recalcVaultFromLedger(ledger), { cr: 125 });
  });

  it('multiple transactions accumulate correctly', () => {
    const ledger = [
      { type: 'gain',  coins: { cr: 500 } },
      { type: 'spend', coins: { cr: 100 } },
      { type: 'gain',  coins: { cr: 50  } },
      { type: 'spend', coins: { cr: 200 } },
    ];
    // 500 - 100 + 50 - 200 = 250
    assert.deepStrictEqual(recalcVaultFromLedger(ledger), { cr: 250 });
  });

  it('tracks multiple currencies independently', () => {
    const ledger = [
      { type: 'gain',  coins: { cr: 1000, vs: 5 } },
      { type: 'spend', coins: { cr: 300            } },
    ];
    assert.deepStrictEqual(recalcVaultFromLedger(ledger), { cr: 700, vs: 5 });
  });

  it('vault CAN go negative — debt is allowed', () => {
    const ledger = [
      { type: 'gain',  coins: { cr: 50  } },
      { type: 'spend', coins: { cr: 120 } },
    ];
    assert.deepStrictEqual(recalcVaultFromLedger(ledger), { cr: -70 });
  });

  it('transactions with missing coins field are skipped safely', () => {
    const ledger = [
      { type: 'gain',  coins: { cr: 100 } },
      { type: 'spend'                     },  // no coins property
    ];
    assert.deepStrictEqual(recalcVaultFromLedger(ledger), { cr: 100 });
  });

  it('zero-amount coin entries have no effect on balance', () => {
    const ledger = [
      { type: 'gain',  coins: { cr: 100, vs: 0 } },
    ];
    // vs is zero — balance should reflect that
    assert.deepStrictEqual(recalcVaultFromLedger(ledger), { cr: 100, vs: 0 });
  });

});


describe('calcSplitShares()', () => {
  // Divides currency amounts among N recipients using integer math.
  // The remainder (from non-even division) is returned separately
  // and goes to the party vault.
  //
  // CRITICAL INVARIANT: perShare[cid] * n + remainder[cid] === coins[cid]
  // This must hold for every currency in every case — no currency is lost.

  it('100 CR split 4 ways → 25 each, 0 remainder', () => {
    const { perShare, remainder } = calcSplitShares({ cr: 100 }, 4);
    assert.strictEqual(perShare.cr,  25);
    assert.strictEqual(remainder.cr, 0);
  });

  it('7 CR split 3 ways → 2 each, 1 remainder', () => {
    const { perShare, remainder } = calcSplitShares({ cr: 7 }, 3);
    assert.strictEqual(perShare.cr,  2);
    assert.strictEqual(remainder.cr, 1);
  });

  it('1 CR split 4 ways → 0 each, 1 remainder (entire amount goes to vault)', () => {
    const { perShare, remainder } = calcSplitShares({ cr: 1 }, 4);
    assert.strictEqual(perShare.cr,  0);
    assert.strictEqual(remainder.cr, 1);
  });

  it('0 CR split 3 ways → 0 each, 0 remainder', () => {
    const { perShare, remainder } = calcSplitShares({ cr: 0 }, 3);
    assert.strictEqual(perShare.cr,  0);
    assert.strictEqual(remainder.cr, 0);
  });

  // Negative amounts represent debt being distributed
  it('negative: -7 CR split 3 ways → -2 each, -1 remainder', () => {
    const { perShare, remainder } = calcSplitShares({ cr: -7 }, 3);
    assert.strictEqual(perShare.cr,  -2);
    assert.strictEqual(remainder.cr, -1); // remainder has same sign as original
  });

  it('negative: -100 CR split 4 ways → -25 each, 0 remainder', () => {
    const { perShare, remainder } = calcSplitShares({ cr: -100 }, 4);
    assert.strictEqual(perShare.cr,  -25);
    assert.strictEqual(remainder.cr, 0);
  });

  it('handles multiple currencies in one split', () => {
    const { perShare, remainder } = calcSplitShares({ cr: 10, vs: 7 }, 3);
    assert.strictEqual(perShare.cr,   3);
    assert.strictEqual(remainder.cr,  1);
    assert.strictEqual(perShare.vs,   2);
    assert.strictEqual(remainder.vs,  1);
  });

  // THE INVARIANT — verified for many cases
  it('invariant holds: perShare * n + remainder === original, for all inputs', () => {
    const cases = [
      { coins: { cr: 100 },       n: 4  },
      { coins: { cr: 7   },       n: 3  },
      { coins: { cr: -7  },       n: 3  },
      { coins: { cr: 1   },       n: 4  },
      { coins: { cr: 0   },       n: 5  },
      { coins: { cr: 999 },       n: 6  },
      { coins: { cr: 10, vs: 7 }, n: 3  },
      { coins: { cr: -100},       n: 4  },
    ];

    for (const { coins, n } of cases) {
      const { perShare, remainder } = calcSplitShares(coins, n);
      for (const [cid, amt] of Object.entries(coins)) {
        const reconstructed = perShare[cid] * n + remainder[cid];
        assert.strictEqual(
          reconstructed, amt,
          `INVARIANT FAILED for ${cid}=${amt} split ${n} ways: ` +
          `${perShare[cid]} × ${n} + ${remainder[cid]} = ${reconstructed}, expected ${amt}`
        );
      }
    }
  });

});


describe('getMemberNetWorth()', () => {
  // Converts a member's multi-currency holdings to a single
  // base-currency total using each currency's exchange rate.

  it('returns null when no currencies have rates set', () => {
    const vaults     = { Thalindra: { cr: 100 } };
    const currencies = [{ id: 'cr', rate: null }]; // rate not set
    assert.strictEqual(getMemberNetWorth('Thalindra', vaults, currencies), null);
  });

  it('returns 0 for a member with no holdings', () => {
    const vaults     = {};
    const currencies = [{ id: 'cr', rate: 1 }];
    assert.strictEqual(getMemberNetWorth('Thalindra', vaults, currencies), 0);
  });

  it('single currency: amount × rate gives correct total', () => {
    const vaults     = { Thalindra: { cr: 250 } };
    const currencies = [{ id: 'cr', rate: 1 }];
    assert.strictEqual(getMemberNetWorth('Thalindra', vaults, currencies), 250);
  });

  it('multi-currency: sums each currency × its rate', () => {
    // 200 CR (rate 1) + 5 VS (rate 10 CR each) = 250 CR total
    const vaults     = { Thalindra: { cr: 200, vs: 5 } };
    const currencies = [{ id: 'cr', rate: 1 }, { id: 'vs', rate: 10 }];
    assert.strictEqual(getMemberNetWorth('Thalindra', vaults, currencies), 250);
  });

  it('negative holdings (debt) give negative net worth', () => {
    const vaults     = { Thalindra: { cr: -50 } };
    const currencies = [{ id: 'cr', rate: 1 }];
    assert.strictEqual(getMemberNetWorth('Thalindra', vaults, currencies), -50);
  });

  it('only includes currencies that have a rate set', () => {
    // cr has a rate, mystery_coin does not — only cr should count
    const vaults     = { Thalindra: { cr: 100, mystery: 999 } };
    const currencies = [
      { id: 'cr',      rate: 1    },
      { id: 'mystery', rate: null },
    ];
    assert.strictEqual(getMemberNetWorth('Thalindra', vaults, currencies), 100);
  });

  it('returns 0 for a member that exists in the party but has no wallet entry', () => {
    const vaults     = { Ragnar: { cr: 50 } };
    const currencies = [{ id: 'cr', rate: 1 }];
    // Thalindra has no entry in vaults at all
    assert.strictEqual(getMemberNetWorth('Thalindra', vaults, currencies), 0);
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 4 — LOOT TRACKER
//  lootTypeEmoji, LOOT_GROUP_EMOJI
// ══════════════════════════════════════════════════════════════

describe('lootTypeEmoji()', () => {
  // Maps item type strings to display emojis via keyword matching.
  // Matching is case-insensitive and substring-based.

  it('null input returns the Other emoji ✨', () => {
    assert.strictEqual(lootTypeEmoji(null), LOOT_GROUP_EMOJI['Other']);
  });

  it('undefined input returns the Other emoji ✨', () => {
    assert.strictEqual(lootTypeEmoji(undefined), LOOT_GROUP_EMOJI['Other']);
  });

  it('unrecognised type returns the Other emoji ✨', () => {
    assert.strictEqual(lootTypeEmoji('Bizarre Artifact'), LOOT_GROUP_EMOJI['Other']);
  });

  // Weapon category
  it('"Melee Weapon" maps to ⚔️', () => {
    assert.strictEqual(lootTypeEmoji('Melee Weapon'), LOOT_GROUP_EMOJI['Weapon']);
  });

  it('"Ranged Weapon" maps to ⚔️', () => {
    assert.strictEqual(lootTypeEmoji('Ranged Weapon'), LOOT_GROUP_EMOJI['Weapon']);
  });

  it('"Ammunition" maps to ⚔️', () => {
    assert.strictEqual(lootTypeEmoji('Ammunition'), LOOT_GROUP_EMOJI['Weapon']);
  });

  // Armor category
  it('"Light Armor" maps to 🛡️', () => {
    assert.strictEqual(lootTypeEmoji('Light Armor'), LOOT_GROUP_EMOJI['Armor & Shield']);
  });

  it('"Shield" maps to 🛡️', () => {
    assert.strictEqual(lootTypeEmoji('Shield'), LOOT_GROUP_EMOJI['Armor & Shield']);
  });

  it('"Heavy Armor" maps to 🛡️', () => {
    assert.strictEqual(lootTypeEmoji('Heavy Armor'), LOOT_GROUP_EMOJI['Armor & Shield']);
  });

  // Potion
  it('"Potion" maps to 🧪', () => {
    assert.strictEqual(lootTypeEmoji('Potion'), LOOT_GROUP_EMOJI['Potion']);
  });

  it('"Healing Potion" maps to 🧪 (substring match)', () => {
    assert.strictEqual(lootTypeEmoji('Healing Potion'), LOOT_GROUP_EMOJI['Potion']);
  });

  // Scroll
  it('"Scroll" maps to 📜', () => {
    assert.strictEqual(lootTypeEmoji('Scroll'), LOOT_GROUP_EMOJI['Scroll']);
  });

  it('"Spell Scroll" maps to 📜', () => {
    assert.strictEqual(lootTypeEmoji('Spell Scroll'), LOOT_GROUP_EMOJI['Scroll']);
  });

  // Wand/Staff/Rod
  it('"Wand" maps to 🪄', () => {
    assert.strictEqual(lootTypeEmoji('Wand'), LOOT_GROUP_EMOJI['Wand, Staff & Rod']);
  });

  it('"Staff" maps to 🪄', () => {
    assert.strictEqual(lootTypeEmoji('Staff'), LOOT_GROUP_EMOJI['Wand, Staff & Rod']);
  });

  it('"Rod" maps to 🪄', () => {
    assert.strictEqual(lootTypeEmoji('Rod'), LOOT_GROUP_EMOJI['Wand, Staff & Rod']);
  });

  // Worn / Carried
  it('"Ring" maps to 💍', () => {
    assert.strictEqual(lootTypeEmoji('Ring'), LOOT_GROUP_EMOJI['Worn / Carried']);
  });

  it('"Cloak" maps to 💍', () => {
    assert.strictEqual(lootTypeEmoji('Cloak'), LOOT_GROUP_EMOJI['Worn / Carried']);
  });

  it('"Wondrous Item" maps to 💍', () => {
    assert.strictEqual(lootTypeEmoji('Wondrous Item'), LOOT_GROUP_EMOJI['Worn / Carried']);
  });

  it('"Boots" maps to 💍', () => {
    assert.strictEqual(lootTypeEmoji('Boots'), LOOT_GROUP_EMOJI['Worn / Carried']);
  });

  it('"Amulet" maps to 💍', () => {
    assert.strictEqual(lootTypeEmoji('Amulet'), LOOT_GROUP_EMOJI['Worn / Carried']);
  });

  // Adventuring Gear
  it('"Bag" maps to 🎒', () => {
    assert.strictEqual(lootTypeEmoji('Bag'), LOOT_GROUP_EMOJI['Adventuring Gear']);
  });

  it('"Adventuring Gear" maps to 🎒', () => {
    assert.strictEqual(lootTypeEmoji('Adventuring Gear'), LOOT_GROUP_EMOJI['Adventuring Gear']);
  });

  it('"Musical Instrument" maps to 🎒', () => {
    assert.strictEqual(lootTypeEmoji('Musical Instrument'), LOOT_GROUP_EMOJI['Adventuring Gear']);
  });

  // Case-insensitivity
  it('matching is case-insensitive: "POTION" maps to 🧪', () => {
    assert.strictEqual(lootTypeEmoji('POTION'), LOOT_GROUP_EMOJI['Potion']);
  });

  it('matching is case-insensitive: "melee weapon" maps to ⚔️', () => {
    assert.strictEqual(lootTypeEmoji('melee weapon'), LOOT_GROUP_EMOJI['Weapon']);
  });

  // Integrity check: every emoji in the map is a real string
  it('LOOT_GROUP_EMOJI has a non-empty string for every key', () => {
    for (const [key, emoji] of Object.entries(LOOT_GROUP_EMOJI)) {
      assert.ok(typeof emoji === 'string' && emoji.length > 0,
        `LOOT_GROUP_EMOJI['${key}'] should be a non-empty string`);
    }
  });

});
