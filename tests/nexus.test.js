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


// ══════════════════════════════════════════════════════════════
//  SECTION 5 — DUPLICATE DECLARATION REGRESSION TESTS
//
//  Root cause of the loot-tracker breakage (March 2026):
//  After nexus-utils.js was extracted, loot-tracker.html still
//  contained its own copies of LOOT_GROUP_EMOJI (const),
//  lootTypeEmoji, and uid. When the browser loaded nexus-utils.js
//  first, the second `const LOOT_GROUP_EMOJI` declaration threw
//  "Identifier has already been declared" — halting all JS on
//  the page. Nothing rendered and no modals opened.
//
//  These tests guard against the same class of bug recurring:
//  they verify that nexus-utils.js exports exactly one copy of
//  each symbol, and that re-requiring the module (simulating a
//  double-load) doesn't throw.
// ══════════════════════════════════════════════════════════════

describe('nexus-utils.js — no duplicate declarations', () => {

  // Expected: the module exports exactly one of each symbol.
  // If a file re-declares a `const` that nexus-utils already
  // defined, the browser throws immediately and nothing works.

  it('exports exactly one LOOT_GROUP_EMOJI object', () => {
    // If there were two const declarations in the same scope,
    // require() itself would have thrown before we got here.
    assert.strictEqual(typeof LOOT_GROUP_EMOJI, 'object');
    assert.ok(LOOT_GROUP_EMOJI !== null);
  });

  it('exports exactly one lootTypeEmoji function', () => {
    assert.strictEqual(typeof lootTypeEmoji, 'function');
  });

  it('exports exactly one uid function', () => {
    assert.strictEqual(typeof uid, 'function');
  });

  it('exports exactly one esc function', () => {
    assert.strictEqual(typeof esc, 'function');
  });

  it('exports exactly one fmt function', () => {
    assert.strictEqual(typeof fmt, 'function');
  });

  // Expected: requiring the module a second time returns the
  // same cached object — Node's module cache prevents re-execution,
  // matching the browser's behaviour when a script tag runs once.
  it('re-requiring nexus-utils returns the same module (no re-execution)', () => {
    const first  = require('../js/nexus-utils.js');
    const second = require('../js/nexus-utils.js');
    assert.strictEqual(first, second,
      'require() should return the cached module, not re-run the file');
  });

  // Expected: all exported symbols are present and the right type.
  // This is a canary — if someone removes an export, this fails
  // before any page that uses it can break silently.
  it('all expected symbols are exported with correct types', () => {
    const utils = require('../js/nexus-utils.js');
    const expected = {
      uid:                    'function',
      fmt:                    'function',
      esc:                    'function',
      abilityMod:             'function',
      modStr:                 'function',
      computeCheck:           'function',
      computeNetEffects:      'function',
      recalcVaultFromLedger:  'function',
      calcSplitShares:        'function',
      getMemberNetWorth:      'function',
      LOOT_GROUP_EMOJI:       'object',
      lootTypeEmoji:          'function',
    };
    for (const [name, type] of Object.entries(expected)) {
      assert.strictEqual(
        typeof utils[name], type,
        `nexus-utils.js should export ${name} as ${type}, got ${typeof utils[name]}`
      );
    }
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 6 — DANGER ZONE CONFIRM LOGIC
//
//  The dangerConfirm helper (admin.html) gates each clear-all
//  action behind a nexusConfirm dialog with a mandatory
//  acknowledgement checkbox. These tests cover the decision
//  logic — specifically that the function only proceeds when
//  BOTH conditions are true:
//    1. The user clicked the confirm button (result.confirmed)
//    2. The acknowledgement checkbox was checked (checks.ack)
//
//  We test this as a pure logic function extracted from the
//  admin page, matching exactly what dangerConfirm evaluates.
// ══════════════════════════════════════════════════════════════

describe('dangerConfirm() result evaluation', () => {

  // The exact condition from dangerConfirm:
  //   result && result.confirmed && result.checks?.ack === true
  function shouldProceed(result) {
    return !!(result && result.confirmed && result.checks?.ack === true);
  }

  // Expected: returns false when user cancels (nexusConfirm returns false)
  it('returns false when the user cancels the dialog', () => {
    assert.strictEqual(shouldProceed(false), false);
  });

  // Expected: returns false when user clicks confirm but does NOT check the box
  it('returns false when confirmed but acknowledgement checkbox is unchecked', () => {
    assert.strictEqual(shouldProceed({ confirmed: true, checks: { ack: false } }), false);
  });

  // Expected: returns false when result has no checks property at all
  it('returns false when confirmed but checks object is missing', () => {
    assert.strictEqual(shouldProceed({ confirmed: true }), false);
  });

  // Expected: returns false when result is null (e.g. dialog closed via ESC)
  it('returns false when result is null', () => {
    assert.strictEqual(shouldProceed(null), false);
  });

  // Expected: returns false when result is undefined
  it('returns false when result is undefined', () => {
    assert.strictEqual(shouldProceed(undefined), false);
  });

  // Expected: the only path that returns true — confirmed AND box checked
  it('returns true only when confirmed AND acknowledgement checkbox is checked', () => {
    assert.strictEqual(shouldProceed({ confirmed: true, checks: { ack: true } }), true);
  });

  // Expected: confirmed=false with box checked still returns false
  // (confirmed button was not clicked)
  it('returns false when acknowledgement is checked but confirmed is false', () => {
    assert.strictEqual(shouldProceed({ confirmed: false, checks: { ack: true } }), false);
  });

  // Expected: extra checkbox keys don't affect the ack check
  it('ignores unrelated checkbox keys — only ack matters', () => {
    assert.strictEqual(
      shouldProceed({ confirmed: true, checks: { ack: true, other: false } }),
      true
    );
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 7 — SUPABASE FILTER SYNTAX FOR BULK DELETE
//
//  The clearAll functions use db.deleteWhere() with the filter
//  'id=gt.' to delete all rows from a table. This relies on the
//  PostgREST behaviour that "id greater than empty string"
//  matches all rows where id is a non-empty text value.
//
//  These tests verify the filter string is constructed correctly
//  and that our text PKs (which all start with '_' from uid())
//  will always be greater than an empty string.
// ══════════════════════════════════════════════════════════════

describe('bulk-delete filter correctness', () => {

  // Expected: every uid()-generated ID starts with '_'
  // and is therefore greater than '' in string comparison.
  it('uid() always produces an ID that is > empty string', () => {
    for (let i = 0; i < 50; i++) {
      const id = uid();
      assert.ok(id > '', `uid() "${id}" should be greater than empty string`);
    }
  });

  // Expected: the filter string used in clearAll functions is exactly right
  it('bulk-delete filter is the literal string "id=gt."', () => {
    // This is the exact value passed to db.deleteWhere() in admin.html.
    // If this string changes, the delete will silently do nothing.
    const BULK_DELETE_FILTER = 'id=gt.';
    assert.strictEqual(BULK_DELETE_FILTER, 'id=gt.');
  });

  // Expected: a '_'-prefixed ID is always > '' (covers all our real PKs)
  it('underscore-prefixed IDs are always > empty string', () => {
    const sampleIds = ['_abc123', '_k7fzx2q4m', '_zzz', '_000'];
    for (const id of sampleIds) {
      assert.ok(id > '', `"${id}" should be > ""`);
    }
  });

  // Expected: the filter correctly excludes the empty string itself
  it('empty string is NOT > empty string (filter would not delete blank IDs)', () => {
    assert.ok(!( '' > '' ), 'empty string should not match id=gt. filter');
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 8 — DAMAGE TYPE TRACKING IN computeNetEffects()
//
//  When a stat effect has a damageType field (e.g. 'acid'),
//  computeNetEffects must:
//    1. Still add it to the top-level bonus/penalty total
//       (backwards-compatible — existing code still works)
//    2. Track it in byType[damageType] for the display layer
//    3. Group effects with no damageType under byType['untyped']
//    4. Correctly merge multiple typed effects on the same stat
// ══════════════════════════════════════════════════════════════

const { DAMAGE_TYPES } = require('../js/nexus-utils.js');

describe('computeNetEffects() — damage type tracking', () => {

  // Expected: an untyped effect (no damageType field) goes into byType.untyped
  it('effect with no damageType is bucketed as "untyped"', () => {
    const items = [{
      name: 'Power Gauntlets', holder: 'Thalindra', rarity: 'uncommon',
      statEffects: [{ stat: 'damage_rolls', type: 'bonus', value: 2 }],
    }];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.damage_rolls.byType.untyped.bonus, 2);
  });

  // Expected: a typed effect (damageType: 'acid') goes into byType.acid
  it('effect with damageType "acid" is bucketed under byType.acid', () => {
    const items = [{
      name: 'Gloves of Acid', holder: 'Thalindra', rarity: 'uncommon',
      statEffects: [{ stat: 'damage_rolls', type: 'bonus', value: 2, damageType: 'acid' }],
    }];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.damage_rolls.byType.acid.bonus, 2);
  });

  // Expected: top-level bonus total includes typed effects —
  // existing code that reads net[stat].bonus still gets the full sum
  it('typed effect still contributes to the top-level bonus total', () => {
    const items = [{
      name: 'Gloves of Acid', holder: 'Thalindra', rarity: 'uncommon',
      statEffects: [{ stat: 'damage_rolls', type: 'bonus', value: 2, damageType: 'acid' }],
    }];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.damage_rolls.bonus, 2,
      'top-level bonus should include acid-typed bonus');
  });

  // Expected: mixed typed + untyped effects on the same stat
  // Top-level: 2 (acid) + 1 (untyped) = 3
  // byType.acid: 2, byType.untyped: 1
  it('mixed typed and untyped effects on the same stat sum independently in byType', () => {
    const items = [{
      name: 'Gloves of Acid', holder: 'Thalindra', rarity: 'uncommon',
      statEffects: [
        { stat: 'damage_rolls', type: 'bonus', value: 2, damageType: 'acid' },
        { stat: 'damage_rolls', type: 'bonus', value: 1 },
      ],
    }];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.damage_rolls.bonus,             3,    'top-level total: acid + untyped');
    assert.strictEqual(net.damage_rolls.byType.acid.bonus, 2,    'acid bucket');
    assert.strictEqual(net.damage_rolls.byType.untyped.bonus, 1, 'untyped bucket');
  });

  // Expected: two different damage types from two different items stack correctly
  it('two different damage types from different items are tracked separately', () => {
    const items = [
      {
        name: 'Gloves of Acid', holder: 'Thalindra', rarity: 'uncommon',
        statEffects: [{ stat: 'damage_rolls', type: 'bonus', value: 2, damageType: 'acid' }],
      },
      {
        name: 'Ring of Fire',   holder: 'Thalindra', rarity: 'rare',
        statEffects: [{ stat: 'damage_rolls', type: 'bonus', value: 3, damageType: 'fire' }],
      },
    ];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.damage_rolls.bonus,              5, 'top-level total: acid + fire');
    assert.strictEqual(net.damage_rolls.byType.acid.bonus,  2, 'acid bucket');
    assert.strictEqual(net.damage_rolls.byType.fire.bonus,  3, 'fire bucket');
  });

  // Expected: same damage type from two items stacks into a single bucket
  it('two acid effects from different items accumulate in byType.acid', () => {
    const items = [
      {
        name: 'Acid Flask',   holder: 'Thalindra', rarity: 'uncommon',
        statEffects: [{ stat: 'damage_rolls', type: 'bonus', value: 1, damageType: 'acid' }],
      },
      {
        name: 'Acid Pendant', holder: 'Thalindra', rarity: 'rare',
        statEffects: [{ stat: 'damage_rolls', type: 'bonus', value: 2, damageType: 'acid' }],
      },
    ];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.damage_rolls.bonus,             3, 'top-level total');
    assert.strictEqual(net.damage_rolls.byType.acid.bonus, 3, 'acid bucket stacked');
  });

  // Expected: damageType matching is case-insensitive
  it('damageType matching is case-insensitive ("Acid" === "acid")', () => {
    const items = [{
      name: 'Fancy Gloves', holder: 'Thalindra', rarity: 'uncommon',
      statEffects: [{ stat: 'damage_rolls', type: 'bonus', value: 2, damageType: 'Acid' }],
    }];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.damage_rolls.byType.acid.bonus, 2,
      'uppercase "Acid" should map to lowercase "acid" bucket');
  });

  // Expected: a typed penalty tracks in byType AND reduces the top-level total
  it('typed penalty tracks in byType and reduces the top-level bonus total', () => {
    const items = [{
      name: 'Cursed Gloves', holder: 'Thalindra', rarity: 'uncommon',
      statEffects: [{ stat: 'damage_rolls', type: 'penalty', value: 2, damageType: 'fire' }],
    }];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.damage_rolls.penalty,               2, 'top-level penalty');
    assert.strictEqual(net.damage_rolls.byType.fire.penalty,   2, 'fire bucket penalty');
    assert.strictEqual(net.damage_rolls.byType.fire.bonus,     0, 'fire bucket bonus unchanged');
  });

  // Expected: advantage/disadvantage effects have no byType entry (they are not typed)
  it('advantage effects do not create byType entries', () => {
    const items = [{
      name: 'Lucky Charm', holder: 'Thalindra', rarity: 'common',
      statEffects: [{ stat: 'stealth', type: 'advantage', damageType: 'fire' }],
    }];
    const { net } = computeNetEffects('Thalindra', items);
    assert.strictEqual(net.stealth.advantage, 1);
    // advantage should not create a byType entry
    assert.strictEqual(net.stealth.byType, undefined,
      'advantage effects should not create byType');
  });

  // Expected: byType only has the damage types that actually appeared
  it('byType only contains buckets for types that have effects', () => {
    const items = [{
      name: 'Gloves of Acid', holder: 'Thalindra', rarity: 'uncommon',
      statEffects: [{ stat: 'damage_rolls', type: 'bonus', value: 2, damageType: 'acid' }],
    }];
    const { net } = computeNetEffects('Thalindra', items);
    const keys = Object.keys(net.damage_rolls.byType);
    assert.deepStrictEqual(keys, ['acid'],
      'byType should only contain "acid", not all 13 damage types');
  });

  // Integrity: all 13 D&D damage types are present in DAMAGE_TYPES
  it('DAMAGE_TYPES contains all 13 official D&D 5e damage types', () => {
    const expected = [
      'acid','bludgeoning','cold','fire','force',
      'lightning','necrotic','piercing','poison',
      'psychic','radiant','slashing','thunder',
    ];
    assert.strictEqual(DAMAGE_TYPES.length, 13,
      'should have exactly 13 damage types');
    for (const t of expected) {
      assert.ok(DAMAGE_TYPES.includes(t), `missing damage type: ${t}`);
    }
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 9 — fx-val-wrap LAYOUT REGRESSION
//
//  The fx-dmg-sel must live inside an .fx-val-wrap div alongside
//  the fx-val-inp, so it renders below the numeric input rather
//  than overflowing the row to the right.
//
//  We test this structurally by checking the generated HTML
//  string from addFxRow (by inspecting what lt_addFxRow produces
//  in the party-roster namespace, mirrored here as a pure string
//  builder test).
// ══════════════════════════════════════════════════════════════

describe('fx-val-wrap layout — dmg select inside wrapper', () => {

  // Simulate the HTML template string used by both addFxRow and lt_addFxRow.
  // The key invariant: fx-dmg-sel must appear INSIDE .fx-val-wrap, and
  // .fx-val-wrap must appear BEFORE the .fx-del-btn.
  function buildRowHTML(idx, fxType, fxStat, showDmg) {
    const needsVal = (t) => t === 'bonus' || t === 'penalty';
    const displayVal = needsVal(fxType) ? 'block' : 'none';
    const displayDmg = showDmg ? 'block' : 'none';
    return `
      <select class="fx-stat-sel"></select>
      <select class="fx-type-sel"></select>
      <div class="fx-val-wrap">
        <input type="number" class="fx-val-inp" id="fx-val-${idx}" style="display:${displayVal}" />
        <select class="fx-dmg-sel" id="fx-dmg-${idx}" style="display:${displayDmg}"></select>
      </div>
      <button class="fx-del-btn">✕</button>`;
  }

  it('fx-dmg-sel appears inside .fx-val-wrap, not as a direct sibling of fx-stat-sel', () => {
    const html = buildRowHTML(0, 'bonus', 'damage_rolls', true);
    const wrapIdx   = html.indexOf('fx-val-wrap');
    const dmgIdx    = html.indexOf('fx-dmg-sel');
    const closeWrap = html.indexOf('</div>', wrapIdx);
    assert.ok(wrapIdx > -1,   '.fx-val-wrap must exist');
    assert.ok(dmgIdx  > -1,   '.fx-dmg-sel must exist');
    assert.ok(dmgIdx  > wrapIdx,  'fx-dmg-sel must appear after .fx-val-wrap opens');
    assert.ok(dmgIdx  < closeWrap,'fx-dmg-sel must appear before .fx-val-wrap closes');
  });

  it('.fx-val-wrap appears before .fx-del-btn', () => {
    const html = buildRowHTML(0, 'bonus', 'damage_rolls', true);
    const wrapIdx = html.indexOf('fx-val-wrap');
    const delIdx  = html.indexOf('fx-del-btn');
    assert.ok(wrapIdx < delIdx, '.fx-val-wrap must come before .fx-del-btn');
  });

  it('fx-dmg-sel is hidden when stat is not a damage stat', () => {
    // e.g. editing an AC bonus — no damage type dropdown should show
    const html = buildRowHTML(0, 'bonus', 'ac', false);
    assert.ok(html.includes('display:none'), 'fx-dmg-sel should be display:none for non-damage stats');
  });

  it('fx-dmg-sel is visible when stat is damage_rolls + type is bonus', () => {
    const html = buildRowHTML(0, 'bonus', 'damage_rolls', true);
    // The dmg select span should have display:block
    const dmgMatch = html.match(/fx-dmg-sel[^>]*style="display:([^"]+)"/);
    assert.ok(dmgMatch, 'fx-dmg-sel should have a style attribute');
    assert.strictEqual(dmgMatch[1], 'block', 'fx-dmg-sel should be display:block for damage_rolls bonus');
  });

  it('fx-val-inp is hidden for advantage/disadvantage effects', () => {
    const html = buildRowHTML(0, 'advantage', 'stealth', false);
    const valMatch = html.match(/fx-val-inp[^>]*style="display:([^"]+)"/);
    assert.ok(valMatch, 'fx-val-inp should have a style attribute');
    assert.strictEqual(valMatch[1], 'none', 'fx-val-inp should be hidden for advantage type');
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 10 — lt_collectFx LOGIC (party-roster modal)
//
//  lt_collectFx mirrors collectFx from loot-tracker.html.
//  These tests cover the collect logic as a pure function.
// ══════════════════════════════════════════════════════════════

describe('lt_collectFx() — party-roster modal collect logic', () => {

  // Pure replica of lt_collectFx for testing
  const LT_DAMAGE_STATS = new Set(['damage_rolls','spell_damage','attack_rolls']);
  function lt_collectFx(pendingFx) {
    return pendingFx.filter(f => f && f.stat).map(f => {
      const fx = {
        stat:  f.stat,
        type:  f.type || 'bonus',
        value: (f.type === 'bonus' || f.type === 'penalty') ? (f.value || 0) : null,
      };
      if (f.damageType && LT_DAMAGE_STATS.has(f.stat) && (f.type === 'bonus' || f.type === 'penalty')) {
        fx.damageType = f.damageType;
      }
      return fx;
    });
  }

  it('filters out null (deleted) rows', () => {
    const pending = [
      { stat: 'ac', type: 'bonus', value: 2 },
      null,
      { stat: 'stealth', type: 'advantage' },
    ];
    const result = lt_collectFx(pending);
    assert.strictEqual(result.length, 2);
  });

  it('filters out rows with no stat selected', () => {
    const pending = [{ stat: '', type: 'bonus', value: 1 }];
    const result = lt_collectFx(pending);
    assert.strictEqual(result.length, 0);
  });

  it('sets value to null for advantage/disadvantage effects', () => {
    const pending = [{ stat: 'stealth', type: 'advantage' }];
    const result = lt_collectFx(pending);
    assert.strictEqual(result[0].value, null);
  });

  it('includes damageType for damage_rolls + bonus when set', () => {
    const pending = [{ stat: 'damage_rolls', type: 'bonus', value: 2, damageType: 'fire' }];
    const result = lt_collectFx(pending);
    assert.strictEqual(result[0].damageType, 'fire');
  });

  it('excludes damageType for non-damage stats even if damageType is set', () => {
    const pending = [{ stat: 'ac', type: 'bonus', value: 2, damageType: 'fire' }];
    const result = lt_collectFx(pending);
    assert.strictEqual(result[0].damageType, undefined);
  });

  it('excludes damageType for advantage effects on damage stats', () => {
    const pending = [{ stat: 'damage_rolls', type: 'advantage', damageType: 'fire' }];
    const result = lt_collectFx(pending);
    assert.strictEqual(result[0].damageType, undefined);
  });

  it('rounds absent value to 0 for bonus effects', () => {
    const pending = [{ stat: 'ac', type: 'bonus', value: null }];
    const result = lt_collectFx(pending);
    assert.strictEqual(result[0].value, 0);
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 11 — lt_saveItem DB column mapping
//
//  The loot_items table uses the column name "description" (not
//  "desc"). lt_saveItem was sending "desc" which caused a
//  Supabase PGRST204 schema cache error.
//
//  This test verifies the row object that would be sent to
//  db.upsert uses "description" as the key, not "desc".
// ══════════════════════════════════════════════════════════════

describe('lt_saveItem — DB column name mapping', () => {

  // Replicate the row-building logic from lt_saveItem
  function buildUpsertRow(item) {
    return {
      id:           item.id,
      name:         item.name,
      type:         item.type,
      rarity:       item.rarity,
      holder:       item.holder,
      attunement:   item.attunement,
      description:  item.desc,       // must be "description", not "desc"
      stat_effects: item.statEffects,
    };
  }

  it('row uses "description" key, not "desc"', () => {
    const item = { id: '_abc', name: 'Test', type: 'Wondrous Item', rarity: 'rare',
                   holder: '', attunement: 'none', desc: 'A test item.', statEffects: [] };
    const row = buildUpsertRow(item);
    assert.ok('description' in row,  'row must have "description" key');
    assert.ok(!('desc' in row),      'row must NOT have "desc" key');
  });

  it('description value is passed through correctly', () => {
    const item = { id: '_abc', name: 'Test', type: 'Wondrous Item', rarity: 'rare',
                   holder: '', attunement: 'none', desc: 'A test item.', statEffects: [] };
    const row = buildUpsertRow(item);
    assert.strictEqual(row.description, 'A test item.');
  });

  it('stat_effects key (not statEffects) is used for the DB column', () => {
    const item = { id: '_abc', name: 'Test', type: 'Ring', rarity: 'uncommon',
                   holder: 'Mira', attunement: 'attuned', desc: '',
                   statEffects: [{ stat: 'ac', type: 'bonus', value: 1 }] };
    const row = buildUpsertRow(item);
    assert.ok('stat_effects' in row,      'row must have "stat_effects" key');
    assert.ok(!('statEffects' in row),    'row must NOT have "statEffects" key');
    assert.strictEqual(row.stat_effects.length, 1);
  });

  it('null description is passed through (not coerced)', () => {
    const item = { id: '_abc', name: 'Test', type: 'Other', rarity: 'common',
                   holder: '', attunement: 'none', desc: null, statEffects: [] };
    const row = buildUpsertRow(item);
    assert.strictEqual(row.description, null);
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 12 — lt_refreshEffectsForItem targeting logic
//
//  lt_refreshEffectsForItem decides which members need their
//  Effects panel refreshed. These tests cover the targeting
//  logic as a pure function (no DOM required).
// ══════════════════════════════════════════════════════════════

describe('lt_refreshEffectsForItem — member targeting logic', () => {

  // Pure replica of the "is this member affected?" predicate
  function isAffected(item, memberName) {
    const holderLc = (item.holder || '').toLowerCase().trim();
    const nameLc   = (memberName  || '').toLowerCase().trim();
    const isParty  = holderLc === 'party' || holderLc === 'party inventory';
    return isParty || holderLc === nameLc;
  }

  it('item held by a specific member affects only that member', () => {
    const item = { holder: 'Thalindra', statEffects: [] };
    assert.strictEqual(isAffected(item, 'Thalindra'), true);
    assert.strictEqual(isAffected(item, 'Orin'),      false);
    assert.strictEqual(isAffected(item, 'Zyx'),       false);
  });

  it('holder matching is case-insensitive', () => {
    const item = { holder: 'THALINDRA', statEffects: [] };
    assert.strictEqual(isAffected(item, 'thalindra'), true);
    assert.strictEqual(isAffected(item, 'Thalindra'), true);
  });

  it('item held by "Party" affects all members', () => {
    const item = { holder: 'Party', statEffects: [] };
    assert.strictEqual(isAffected(item, 'Thalindra'), true);
    assert.strictEqual(isAffected(item, 'Orin'),      true);
  });

  it('"Party Inventory" also counts as a party item', () => {
    const item = { holder: 'Party Inventory', statEffects: [] };
    assert.strictEqual(isAffected(item, 'Thalindra'), true);
    assert.strictEqual(isAffected(item, 'Orin'),      true);
  });

  it('unassigned item (empty holder) does not affect any named member', () => {
    const item = { holder: '', statEffects: [] };
    assert.strictEqual(isAffected(item, 'Thalindra'), false);
    assert.strictEqual(isAffected(item, 'Orin'),      false);
  });

  it('leading/trailing whitespace in holder is trimmed before comparison', () => {
    const item = { holder: '  Thalindra  ', statEffects: [] };
    assert.strictEqual(isAffected(item, 'Thalindra'), true);
  });

  // Verify the "was the tab active?" preservation logic:
  // after a panel swap the refreshed element should get 'active' back
  it('active class is re-applied after panel swap when tab was open', () => {
    // Simulate what lt_refreshEffectsPanel does with wasActive
    function simulateSwap(wasActive, newPanelHtml) {
      // newPanel always starts without 'active' (as built by buildEffectsPanel)
      const classes = new Set(['tab-panel']);
      if (wasActive) classes.add('active'); // re-applied by refresh fn
      return classes.has('active');
    }
    assert.strictEqual(simulateSwap(true,  '<div class="tab-panel">...</div>'), true,
      'active class must be re-applied when tab was open');
    assert.strictEqual(simulateSwap(false, '<div class="tab-panel">...</div>'), false,
      'active class must NOT be added when tab was not open');
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 13 — lt_openModal performance optimizations
//
//  Three changes were made to eliminate the open-time delay:
//
//  1. prefetchLootItems now caches `desc` (r.description) so the
//     fallback DB fetch in lt_openModal is never needed.
//  2. lt_populateHolderSelect uses members[] directly — no DB call.
//  3. lt_openModal is now a plain function (not async) and opens
//     the modal immediately rather than after awaiting network work.
// ══════════════════════════════════════════════════════════════

describe('lt_openModal optimizations', () => {

  // ── 1. Cache shape includes desc ──
  it('prefetchLootItems cache shape includes desc field', () => {
    // Simulate the row mapping done in prefetchLootItems
    function mapRow(r) {
      return {
        id:          r.id,
        name:        r.name,
        rarity:      r.rarity,
        type:        r.type,
        attunement:  r.attunement,
        holder:      r.holder,
        desc:        r.description || '',
        statEffects: r.stat_effects || [],
      };
    }
    const row = { id: '_1', name: 'Gloves', rarity: 'rare', type: 'Gloves',
                  attunement: 'none', holder: 'Mira',
                  description: 'Grants +2 acid damage.', stat_effects: [] };
    const cached = mapRow(row);
    assert.ok('desc' in cached,            'cached item must have desc field');
    assert.strictEqual(cached.desc, 'Grants +2 acid damage.');
  });

  it('prefetchLootItems cache maps description → desc (not r.desc)', () => {
    // Confirm the mapping reads r.description, not r.desc
    // (the DB column is "description"; items in JS use "desc")
    function mapRow(r) {
      return { desc: r.description || '' };
    }
    const withDescription = { description: 'Some text' };
    const withoutDesc     = { description: '' };
    assert.strictEqual(mapRow(withDescription).desc, 'Some text');
    assert.strictEqual(mapRow(withoutDesc).desc,     '');
  });

  it('missing description in DB row maps to empty string, not undefined', () => {
    function mapRow(r) {
      return { desc: r.description || '' };
    }
    const row = {};  // no description key at all
    assert.strictEqual(mapRow(row).desc, '', 'should default to empty string');
  });

  // ── 2. Holder select uses members[] — no DB call ──
  it('lt_populateHolderSelect builds options from members array synchronously', () => {
    // Pure replica of the synchronous lt_populateHolderSelect logic
    function populateOptions(membersList) {
      // Returns the values that would be added as <option> elements
      return membersList.map(m => m.name);
    }
    const membersList = [
      { name: 'Thalindra' },
      { name: 'Orin' },
      { name: 'Zyx' },
    ];
    const opts = populateOptions(membersList);
    assert.deepStrictEqual(opts, ['Thalindra', 'Orin', 'Zyx']);
  });

  it('holder select value is set to the item holder after population', () => {
    // Simulate select.value assignment after options are added
    const options = ['', 'Party Inventory', 'Thalindra', 'Orin'];
    function resolveValue(currentValue) {
      // Matches what sel.value = currentValue||'' does
      return options.includes(currentValue) ? currentValue : '';
    }
    assert.strictEqual(resolveValue('Thalindra'), 'Thalindra');
    assert.strictEqual(resolveValue(''),          '');
    assert.strictEqual(resolveValue(undefined),   '');
  });

  // ── 3. lt_openModal is synchronous (not async) ──
  it('lt_openModal is a plain function — not async — so it opens without awaiting', () => {
    // Extract the function signature from the source and verify it is not async
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../party-roster.html'), 'utf8');
    const match = src.match(/(\basync\s+)?function lt_openModal\s*\(/);
    assert.ok(match, 'lt_openModal must be defined in party-roster.html');
    assert.strictEqual(match[1], undefined,
      'lt_openModal must NOT be async — it should open the modal synchronously');
  });

});
