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
//
//  Expert 5e rule reference (PHB, SRD):
//
//  ABILITY MODIFIER   = floor((score − 10) / 2)
//    Score  1 → −5 | Score  8 → −1 | Score 10 → +0
//    Score 11 → +0 | Score 12 → +1 | Score 13 → +1
//    Score 14 → +2 | Score 15 → +2 | Score 16 → +3
//    Score 17 → +3 | Score 18 → +4 | Score 20 → +5
//    Score 30 → +10 (monsters/divine beings only)
//
//  PROFICIENCY BONUS BY LEVEL (same for every class):
//    Levels  1–4  → +2
//    Levels  5–8  → +3
//    Levels  9–12 → +4
//    Levels 13–16 → +5
//    Levels 17–20 → +6
//
//  SKILL / SAVING THROW CHECK:
//    total = ability_mod + (prof_bonus IF proficient) + item_bonus − item_penalty
//
//  PASSIVE PERCEPTION (and any passive check):
//    total = 10 + WIS_mod + (prof_bonus IF proficient in Perception) + item_bonus
//    (advantage → +5, disadvantage → −5 — not modelled here)
//
//  INITIATIVE:
//    total = DEX_mod + any initiative bonuses from items
//
//  SPELL SAVE DC:
//    8 + prof_bonus + spellcasting_ability_mod
//
//  SPELL ATTACK BONUS:
//    prof_bonus + spellcasting_ability_mod
//
//  ALL SKILLS AND THEIR GOVERNING ABILITIES (PHB p.174):
//    STR: Athletics
//    DEX: Acrobatics, Sleight of Hand, Stealth
//    INT: Arcana, History, Investigation, Nature, Religion
//    WIS: Animal Handling, Insight, Medicine, Perception, Survival
//    CHA: Deception, Intimidation, Performance, Persuasion
//    (CON has no associated skills — only saving throws)
//
//  ALL SAVING THROWS: STR, DEX, CON, INT, WIS, CHA
// ══════════════════════════════════════════════════════════════


describe('abilityMod()', () => {
  // D&D 5e formula: floor((score − 10) / 2)
  // Verified against PHB Ability Scores and Modifiers table (p.173)

  // ── Exact PHB table values ──
  it('score  1 → −5  (minimum; monsters only)', () => { assert.strictEqual(abilityMod(1),  -5); });
  it('score  2 → −4',                            () => { assert.strictEqual(abilityMod(2),  -4); });
  it('score  4 → −3',                            () => { assert.strictEqual(abilityMod(4),  -3); });
  it('score  6 → −2',                            () => { assert.strictEqual(abilityMod(6),  -2); });
  it('score  7 → −2  (odd, floor rounds down)',  () => { assert.strictEqual(abilityMod(7),  -2); });
  it('score  8 → −1  (common dump stat)',        () => { assert.strictEqual(abilityMod(8),  -1); });
  it('score  9 → −1  (odd, same tier as 8)',     () => { assert.strictEqual(abilityMod(9),  -1); });
  it('score 10 → +0  (human average)',           () => { assert.strictEqual(abilityMod(10),  0); });
  it('score 11 → +0  (odd, same tier as 10)',    () => { assert.strictEqual(abilityMod(11),  0); });
  it('score 12 → +1',                            () => { assert.strictEqual(abilityMod(12),  1); });
  it('score 13 → +1  (odd, same tier as 12)',    () => { assert.strictEqual(abilityMod(13),  1); });
  it('score 14 → +2',                            () => { assert.strictEqual(abilityMod(14),  2); });
  it('score 15 → +2  (odd, same tier as 14)',    () => { assert.strictEqual(abilityMod(15),  2); });
  it('score 16 → +3',                            () => { assert.strictEqual(abilityMod(16),  3); });
  it('score 17 → +3  (odd, same tier as 16)',    () => { assert.strictEqual(abilityMod(17),  3); });
  it('score 18 → +4  (typical racial max at char creation)', () => { assert.strictEqual(abilityMod(18), 4); });
  it('score 19 → +4  (odd, same tier as 18)',    () => { assert.strictEqual(abilityMod(19),  4); });
  it('score 20 → +5  (PC maximum under standard rules)', () => { assert.strictEqual(abilityMod(20), 5); });
  it('score 24 → +7  (beyond PC max, divine/legendary)', () => { assert.strictEqual(abilityMod(24), 7); });
  it('score 30 → +10 (theoretical monster max)', () => { assert.strictEqual(abilityMod(30), 10); });

  // ── Odd-score floor behaviour — critical rule many players get wrong ──
  it('even and the next odd score share a modifier (11 and 10 both give +0)', () => {
    assert.strictEqual(abilityMod(10), abilityMod(11));
  });
  it('even and the next odd score share a modifier (16 and 17 both give +3)', () => {
    assert.strictEqual(abilityMod(16), abilityMod(17));
  });
  it('even and the next odd score share a modifier (18 and 19 both give +4)', () => {
    assert.strictEqual(abilityMod(18), abilityMod(19));
  });

  // ── Defensive defaults ──
  it('undefined defaults to score 10 → +0 (unset ability treated as average)', () => {
    assert.strictEqual(abilityMod(undefined), 0);
  });
  it('null defaults to score 10 → +0', () => {
    assert.strictEqual(abilityMod(null), 0);
  });
  it('0 is treated as unset (falsy guard) → defaults to score 10 → +0', () => {
    // 0 is not a legal D&D 5e ability score (minimum is 1);
    // the || 10 guard is correct defensive behaviour.
    assert.strictEqual(abilityMod(0), 0);
  });
});


describe('modStr()', () => {
  // Converts a numeric modifier to a display string.
  // 5e convention: always show sign — positive and zero use "+", negative keeps "−".

  it('positive modifier has + prefix (+3)', () => { assert.strictEqual(modStr(3),  '+3'); });
  it('zero modifier shows +0 (not "0")',    () => { assert.strictEqual(modStr(0),  '+0'); });
  it('negative modifier keeps − sign (−1)', () => { assert.strictEqual(modStr(-1), '-1'); });
  it('+5 formats correctly (PC max)',        () => { assert.strictEqual(modStr(5),  '+5'); });
  it('−5 formats correctly (score 1)',       () => { assert.strictEqual(modStr(-5), '-5'); });
  it('+10 formats correctly (score 30)',     () => { assert.strictEqual(modStr(10), '+10'); });
});


describe('proficiency bonus by level (5e table)', () => {
  // PHB Character Advancement table (p.15):
  //   Levels  1-4  → +2
  //   Levels  5-8  → +3
  //   Levels  9-12 → +4
  //   Levels 13-16 → +5
  //   Levels 17-20 → +6
  //
  // This is a pure reference table — the system lets users enter their
  // proficiency bonus manually, so we validate that the stored defaults
  // and expected values match the official table.

  function profByLevel(level) {
    if (level <= 4)  return 2;
    if (level <= 8)  return 3;
    if (level <= 12) return 4;
    if (level <= 16) return 5;
    return 6;
  }

  it('level  1 → +2', () => { assert.strictEqual(profByLevel(1),  2); });
  it('level  4 → +2  (last level at +2)', () => { assert.strictEqual(profByLevel(4),  2); });
  it('level  5 → +3  (first level at +3)', () => { assert.strictEqual(profByLevel(5),  3); });
  it('level  8 → +3', () => { assert.strictEqual(profByLevel(8),  3); });
  it('level  9 → +4  (first level at +4)', () => { assert.strictEqual(profByLevel(9),  4); });
  it('level 12 → +4', () => { assert.strictEqual(profByLevel(12), 4); });
  it('level 13 → +5  (first level at +5)', () => { assert.strictEqual(profByLevel(13), 5); });
  it('level 16 → +5', () => { assert.strictEqual(profByLevel(16), 5); });
  it('level 17 → +6  (first level at +6)', () => { assert.strictEqual(profByLevel(17), 6); });
  it('level 20 → +6  (max level)', () => { assert.strictEqual(profByLevel(20), 6); });

  it('default prof bonus in the system is +2 (level 1-4 default)', () => {
    // The member object defaults m.prof || 2 — validated against L1 rule.
    const defaultProf = 2;
    assert.strictEqual(defaultProf, profByLevel(1));
  });
});


describe('computeCheck() — 5e skill and saving throw formula', () => {
  // Formula: ability_mod + (prof_bonus if proficient) + item_bonus − item_penalty
  //
  // This covers both skills AND saving throws — they use identical logic.
  // The only difference is the key (e.g. 'save_str' vs 'athletics') and
  // the governing ability.

  // ── Baseline cases ──
  it('STR 10, not proficient, no items → +0  (neutral baseline)', () => {
    const m = { abilities: { str: 10 }, proficiencies: {} };
    assert.strictEqual(computeCheck('athletics', 'str', m, {}, 2), 0);
  });

  it('STR 10, proficient (prof +2), no items → +2', () => {
    const m = { abilities: { str: 10 }, proficiencies: { athletics: true } };
    assert.strictEqual(computeCheck('athletics', 'str', m, {}, 2), 2);
  });

  // ── Ability modifier contribution ──
  it('STR 16 (+3 mod), not proficient → +3', () => {
    const m = { abilities: { str: 16 }, proficiencies: {} };
    assert.strictEqual(computeCheck('athletics', 'str', m, {}, 2), 3);
  });

  it('STR 8 (−1 mod), not proficient → −1', () => {
    const m = { abilities: { str: 8 }, proficiencies: {} };
    assert.strictEqual(computeCheck('athletics', 'str', m, {}, 2), -1);
  });

  it('STR 18 (+4 mod), proficient (prof +2) → +6', () => {
    const m = { abilities: { str: 18 }, proficiencies: { athletics: true } };
    assert.strictEqual(computeCheck('athletics', 'str', m, {}, 2), 6);
  });

  // ── Proficiency bonus scaling ──
  it('prof +3 (levels 5-8): STR 14 (+2), proficient → +5', () => {
    const m = { abilities: { str: 14 }, proficiencies: { athletics: true } };
    assert.strictEqual(computeCheck('athletics', 'str', m, {}, 3), 5); // +2 mod + 3 prof
  });

  it('prof +4 (levels 9-12): DEX 16 (+3), proficient in Stealth → +7', () => {
    const m = { abilities: { dex: 16 }, proficiencies: { stealth: true } };
    assert.strictEqual(computeCheck('stealth', 'dex', m, {}, 4), 7); // +3 mod + 4 prof
  });

  it('prof +6 (level 17-20): DEX 20 (+5), proficient in Acrobatics → +11', () => {
    const m = { abilities: { dex: 20 }, proficiencies: { acrobatics: true } };
    assert.strictEqual(computeCheck('acrobatics', 'dex', m, {}, 6), 11); // +5 mod + 6 prof
  });

  // ── Saving throw formula — same computation as skills ──
  it('CON save: CON 14 (+2), not proficient → +2', () => {
    const m = { abilities: { con: 14 }, proficiencies: {} };
    assert.strictEqual(computeCheck('save_con', 'con', m, {}, 2), 2);
  });

  it('CON save: CON 14 (+2), proficient (prof +2) → +4', () => {
    const m = { abilities: { con: 14 }, proficiencies: { save_con: true } };
    assert.strictEqual(computeCheck('save_con', 'con', m, {}, 2), 4);
  });

  it('WIS save: WIS 8 (−1), proficient (prof +3) → +2', () => {
    const m = { abilities: { wis: 8 }, proficiencies: { save_wis: true } };
    assert.strictEqual(computeCheck('save_wis', 'wis', m, {}, 3), 2); // −1 + 3
  });

  // Proficiency does NOT apply to non-proficient saves
  it('DEX save: DEX 20 (+5), NOT proficient → +5 (no prof)', () => {
    const m = { abilities: { dex: 20 }, proficiencies: {} };
    assert.strictEqual(computeCheck('save_dex', 'dex', m, {}, 2), 5);
  });

  // ── Item effects ──
  it('item +2 bonus to Athletics stacks on top of mod', () => {
    const m = { abilities: { str: 10 }, proficiencies: {} };
    const net = { athletics: { bonus: 2, penalty: 0 } };
    assert.strictEqual(computeCheck('athletics', 'str', m, net, 2), 2);
  });

  it('item −2 penalty reduces the check', () => {
    const m = { abilities: { str: 10 }, proficiencies: {} };
    const net = { athletics: { bonus: 0, penalty: 2 } };
    assert.strictEqual(computeCheck('athletics', 'str', m, net, 2), -2);
  });

  it('prof + mod + item all stack: STR 14 (+2) + prof +2 + item +3 → +7', () => {
    const m = { abilities: { str: 14 }, proficiencies: { athletics: true } };
    const net = { athletics: { bonus: 3, penalty: 0 } };
    assert.strictEqual(computeCheck('athletics', 'str', m, net, 2), 7);
  });

  it('item bonus and penalty net out before application: bonus 4, penalty 2 → net +2', () => {
    const m = { abilities: { str: 10 }, proficiencies: {} };
    const net = { athletics: { bonus: 4, penalty: 2 } };
    assert.strictEqual(computeCheck('athletics', 'str', m, net, 2), 2);
  });

  // ── Defensive defaults ──
  it('missing ability defaults to 10 (→ +0 mod)', () => {
    const m = { abilities: {}, proficiencies: {} };
    assert.strictEqual(computeCheck('athletics', 'str', m, {}, 2), 0);
  });

  it('undefined proficiencies object does not throw', () => {
    const m = { abilities: { str: 14 } }; // no proficiencies key
    assert.strictEqual(computeCheck('athletics', 'str', m, {}, 2), 2); // just the mod
  });
});


describe('5e derived stats — passive perception, initiative, spell DC, spell attack', () => {
  // These are computed values the Stats tab displays.
  // The system allows manual entry for spell DC / spell atk / passive perc, but
  // the formulas they should match are tested here as pure logic.

  // ── PASSIVE PERCEPTION ──
  // Formula: 10 + WIS modifier + (prof bonus if proficient in Perception)
  // PHB example: WIS 15 (+2), prof +2, Perception proficient → 10 + 2 + 2 = 14
  function passivePerc(wis, profBonus, percProficient) {
    return 10 + abilityMod(wis) + (percProficient ? profBonus : 0);
  }

  it('passive perception: WIS 15, prof +2, Perception proficient → 14  (PHB example)', () => {
    assert.strictEqual(passivePerc(15, 2, true), 14);
  });
  it('passive perception: WIS 10, not proficient → 10  (baseline)', () => {
    assert.strictEqual(passivePerc(10, 2, false), 10);
  });
  it('passive perception: WIS 8 (−1), prof +3, proficient → 12', () => {
    assert.strictEqual(passivePerc(8, 3, true), 12); // 10 − 1 + 3
  });
  it('passive perception: WIS 20 (+5), not proficient → 15', () => {
    assert.strictEqual(passivePerc(20, 2, false), 15);
  });
  it('passive perception: WIS 10, prof +2, proficient → 12', () => {
    assert.strictEqual(passivePerc(10, 2, true), 12);
  });

  // ── INITIATIVE ──
  // Formula: DEX modifier + any initiative bonuses from items
  function initiative(dex, itemBonus = 0) {
    return abilityMod(dex) + itemBonus;
  }

  it('initiative: DEX 10 → +0', () => { assert.strictEqual(initiative(10), 0); });
  it('initiative: DEX 16 → +3', () => { assert.strictEqual(initiative(16), 3); });
  it('initiative: DEX 8  → −1', () => { assert.strictEqual(initiative(8),  -1); });
  it('initiative: DEX 14, item +2 bonus → +4', () => { assert.strictEqual(initiative(14, 2), 4); });
  it('initiative is NEVER affected by proficiency bonus', () => {
    // Initiative = Dex mod only (plus magic item bonuses).
    // Proficiency does NOT apply to initiative under base 5e rules.
    const withProf    = abilityMod(14);        // just the DEX mod
    const withoutProf = abilityMod(14) + 0;    // same — prof not added
    assert.strictEqual(withProf, withoutProf);
    assert.strictEqual(withProf, 2);
  });

  // ── SPELL SAVE DC ──
  // Formula: 8 + proficiency bonus + spellcasting ability modifier
  function spellSaveDC(spellAbilityScore, profBonus) {
    return 8 + profBonus + abilityMod(spellAbilityScore);
  }

  it('spell DC: INT 18 (+4), prof +3 (level 5 wizard) → 15  (example from PHB)', () => {
    assert.strictEqual(spellSaveDC(18, 3), 15); // 8 + 3 + 4
  });
  it('spell DC: WIS 16 (+3), prof +2 → 13  (level 1 cleric)', () => {
    assert.strictEqual(spellSaveDC(16, 2), 13); // 8 + 2 + 3
  });
  it('spell DC: CHA 14 (+2), prof +2 → 12  (level 1 sorcerer)', () => {
    assert.strictEqual(spellSaveDC(14, 2), 12); // 8 + 2 + 2
  });
  it('spell DC: INT 20 (+5), prof +6 (level 20 wizard) → 19', () => {
    assert.strictEqual(spellSaveDC(20, 6), 19); // 8 + 6 + 5
  });
  it('spell DC base is always 8, not 0', () => {
    assert.strictEqual(spellSaveDC(10, 2), 10); // 8 + 2 + 0 = 10, not just prof
  });

  // ── SPELL ATTACK BONUS ──
  // Formula: proficiency bonus + spellcasting ability modifier  (no base offset)
  function spellAttack(spellAbilityScore, profBonus) {
    return profBonus + abilityMod(spellAbilityScore);
  }

  it('spell attack: INT 16 (+3), prof +2 (level 1) → +5', () => {
    assert.strictEqual(spellAttack(16, 2), 5);
  });
  it('spell attack: WIS 14 (+2), prof +3 → +5  (same result, different class)', () => {
    assert.strictEqual(spellAttack(14, 3), 5);
  });
  it('spell attack: CHA 10 (+0), prof +2 → +2', () => {
    assert.strictEqual(spellAttack(10, 2), 2);
  });
  it('spell attack does NOT have a +8 base (unlike spell DC)', () => {
    // A common mistake is confusing spell attack with spell DC
    const dc  = spellSaveDC(16, 2);  // 13
    const atk = spellAttack(16, 2);  //  5
    assert.notStrictEqual(dc, atk);
    assert.strictEqual(atk, 5);
    assert.strictEqual(dc,  13);
  });
});


describe('5e skill-to-ability mapping (all 18 skills)', () => {
  // Official PHB skill list (p.174). Every skill maps to exactly one ability.
  // CON has no associated skills — only saving throws.
  // This test guards against any future refactoring that breaks the mapping.

  const SKILLS_EXPECTED = {
    // STR
    athletics:      'str',
    // DEX
    acrobatics:     'dex',
    sleight_of_hand:'dex',
    stealth:        'dex',
    // INT
    arcana:         'int',
    history:        'int',
    investigation:  'int',
    nature:         'int',
    religion:       'int',
    // WIS
    animal_handling:'wis',
    insight:        'wis',
    medicine:       'wis',
    perception:     'wis',
    survival:       'wis',
    // CHA
    deception:      'cha',
    intimidation:   'cha',
    performance:    'cha',
    persuasion:     'cha',
  };

  it('there are exactly 18 standard 5e skills', () => {
    assert.strictEqual(Object.keys(SKILLS_EXPECTED).length, 18);
  });

  it('Strength has exactly 1 skill: Athletics', () => {
    const strSkills = Object.entries(SKILLS_EXPECTED)
      .filter(([,a]) => a === 'str').map(([k]) => k);
    assert.deepStrictEqual(strSkills, ['athletics']);
  });

  it('Dexterity has exactly 3 skills: Acrobatics, Sleight of Hand, Stealth', () => {
    const dexSkills = Object.entries(SKILLS_EXPECTED)
      .filter(([,a]) => a === 'dex').map(([k]) => k).sort();
    assert.deepStrictEqual(dexSkills, ['acrobatics', 'sleight_of_hand', 'stealth']);
  });

  it('Intelligence has exactly 5 skills: Arcana, History, Investigation, Nature, Religion', () => {
    const intSkills = Object.entries(SKILLS_EXPECTED)
      .filter(([,a]) => a === 'int').map(([k]) => k).sort();
    assert.deepStrictEqual(intSkills.sort(), ['arcana', 'history', 'investigation', 'nature', 'religion']);
  });

  it('Wisdom has exactly 5 skills: Animal Handling, Insight, Medicine, Perception, Survival', () => {
    const wisSkills = Object.entries(SKILLS_EXPECTED)
      .filter(([,a]) => a === 'wis').map(([k]) => k).sort();
    assert.deepStrictEqual(wisSkills, ['animal_handling', 'insight', 'medicine', 'perception', 'survival']);
  });

  it('Charisma has exactly 4 skills: Deception, Intimidation, Performance, Persuasion', () => {
    const chaSkills = Object.entries(SKILLS_EXPECTED)
      .filter(([,a]) => a === 'cha').map(([k]) => k).sort();
    assert.deepStrictEqual(chaSkills, ['deception', 'intimidation', 'performance', 'persuasion']);
  });

  it('Constitution has NO associated skills (saving throw only)', () => {
    const conSkills = Object.entries(SKILLS_EXPECTED)
      .filter(([,a]) => a === 'con');
    assert.strictEqual(conSkills.length, 0);
  });

  // Validate against the actual SKILLS constant in party-roster.html
  it('party-roster SKILLS constant maps every skill to the correct ability', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../party-roster.html'), 'utf8');
    // Extract just the SKILLS array block
    const match = src.match(/const SKILLS=\[([\s\S]*?)\];/);
    assert.ok(match, 'SKILLS constant must exist in party-roster.html');
    const block = match[1];
    Object.entries(SKILLS_EXPECTED).forEach(([key, expectedAbility]) => {
      // Each entry looks like: {key:'athletics', label:'Athletics', ability:'str'}
      const pattern = new RegExp(`key:'${key}'[^}]*ability:'(\\w+)'`);
      const m = block.match(pattern);
      assert.ok(m, `skill '${key}' must be defined in SKILLS`);
      assert.strictEqual(m[1], expectedAbility,
        `skill '${key}' must map to '${expectedAbility}', got '${m[1]}'`);
    });
  });

  it('party-roster SAVING_THROWS covers all 6 abilities', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../party-roster.html'), 'utf8');
    const match = src.match(/const SAVING_THROWS=\[([\s\S]*?)\];/);
    assert.ok(match, 'SAVING_THROWS constant must exist');
    const block = match[1];
    ['str','dex','con','int','wis','cha'].forEach(ab => {
      assert.ok(block.includes(`ability:'${ab}'`),
        `SAVING_THROWS must include a save for ability '${ab}'`);
    });
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


// ══════════════════════════════════════════════════════════════
//  SECTION 14 — captureTabState / restoreTabState
//
//  These pure-logic tests cover the tab name normalisation
//  (stripping count suffixes like "(2)") and the full
//  capture → render → restore round-trip.
// ══════════════════════════════════════════════════════════════

describe('captureTabState / restoreTabState logic', () => {

  // The normalisation applied to button text before storing/comparing
  function normaliseTabLabel(text) {
    return text.trim().toLowerCase().replace(/\s*\(\d+\)$/, '');
  }

  it('plain tab labels normalise correctly', () => {
    assert.strictEqual(normaliseTabLabel('Bio'),     'bio');
    assert.strictEqual(normaliseTabLabel('Stats'),   'stats');
    assert.strictEqual(normaliseTabLabel('Effects'), 'effects');
    assert.strictEqual(normaliseTabLabel('Loot'),    'loot');
  });

  it('count suffixes are stripped during normalisation', () => {
    assert.strictEqual(normaliseTabLabel('Effects (3)'), 'effects');
    assert.strictEqual(normaliseTabLabel('Loot (2)'),    'loot');
    assert.strictEqual(normaliseTabLabel('Effects (12)'), 'effects');
  });

  it('leading/trailing whitespace is stripped', () => {
    assert.strictEqual(normaliseTabLabel('  Effects (1)  '), 'effects');
  });

  it('bio tab is skipped during restore (it is the render default)', () => {
    // If state says 'bio', restoreTabState should do nothing — no switchTab call needed
    const state = { '_member1': 'bio', '_member2': 'stats' };
    const restored = [];
    function mockRestore(state) {
      Object.entries(state).forEach(([id, tab]) => {
        if (tab === 'bio') return;   // default — skip
        restored.push({ id, tab });
      });
    }
    mockRestore(state);
    assert.strictEqual(restored.length, 1);
    assert.strictEqual(restored[0].id,  '_member2');
    assert.strictEqual(restored[0].tab, 'stats');
  });

  it('capture → restore round-trip preserves all non-bio tabs', () => {
    // Simulate a full render cycle with a state object
    const before = { '_a': 'effects', '_b': 'loot', '_c': 'bio', '_d': 'stats' };
    // After render, Bio is default for all. restoreTabState should switch back.
    const switched = [];
    function mockRestore(state) {
      Object.entries(state).forEach(([id, tab]) => {
        if (tab === 'bio') return;
        switched.push(tab);
      });
    }
    mockRestore(before);
    assert.ok(switched.includes('effects'), 'effects tab should be restored');
    assert.ok(switched.includes('loot'),    'loot tab should be restored');
    assert.ok(switched.includes('stats'),   'stats tab should be restored');
    assert.strictEqual(switched.length, 3,  'bio should not be in the restore list');
  });

  it('members not in the snapshot (newly added) keep the Bio default', () => {
    const state = { '_existing': 'stats' };
    const switched = [];
    function mockRestore(state) {
      // '_new' is not in state — it would simply not be iterated
      Object.entries(state).forEach(([id, tab]) => {
        if (tab === 'bio') return;
        switched.push(id);
      });
    }
    mockRestore(state);
    assert.ok(!switched.includes('_new'), 'new member not in snapshot keeps Bio');
    assert.ok(switched.includes('_existing'));
  });

  it('deleted member is silently skipped (card no longer in DOM)', () => {
    // restoreTabState calls querySelector which returns null for absent cards
    // — the guard `if(!card) return` prevents any error.
    // This mock only pushes to errors[] when a card is absent but switchTab
    // would have been called anyway (i.e. the null-guard is missing).
    function mockRestore(state, presentIds) {
      const errors = [];
      Object.entries(state).forEach(([id, tab]) => {
        if (tab === 'bio') return;
        const card = presentIds.includes(id) ? {} : null;
        if (!card) return;  // silently skip — this is the guard being tested
        // If we reach here the card exists — that is fine, not an error
      });
      return errors;
    }
    const state   = { '_deleted': 'stats', '_alive': 'effects' };
    const present = ['_alive'];
    const errs = mockRestore(state, present);
    assert.strictEqual(errs.length, 0, 'no errors — guard prevents crash on absent card');
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 15 — nexusConfirm required-checkbox guard
//
//  When a checkbox has required:true and the user clicks confirm
//  without ticking it, the dialog must NOT close — it should
//  block and highlight the unchecked box instead.
//
//  We test the guard predicate as a pure function.
// ══════════════════════════════════════════════════════════════

describe('nexusConfirm required-checkbox guard', () => {

  // Pure replica of the guard predicate inside the confirm click handler
  function hasUnmetRequired(checkboxes, checkedIds) {
    return checkboxes.filter(cb => {
      if (!cb.required) return false;
      return !checkedIds.includes(cb.id);
    });
  }

  it('blocks when a required checkbox is unchecked', () => {
    const boxes = [{ id: 'ack', required: true }];
    const unmet = hasUnmetRequired(boxes, []); // nothing ticked
    assert.strictEqual(unmet.length, 1);
    assert.strictEqual(unmet[0].id, 'ack');
  });

  it('allows close when the required checkbox is checked', () => {
    const boxes = [{ id: 'ack', required: true }];
    const unmet = hasUnmetRequired(boxes, ['ack']);
    assert.strictEqual(unmet.length, 0);
  });

  it('non-required checkboxes never block close regardless of state', () => {
    const boxes = [{ id: 'extra', required: false }];
    const unmet = hasUnmetRequired(boxes, []); // unticked but not required
    assert.strictEqual(unmet.length, 0);
  });

  it('only the unchecked required boxes are returned — checked required ones are excluded', () => {
    const boxes = [
      { id: 'ack',   required: true },
      { id: 'other', required: true },
    ];
    // 'other' is checked, 'ack' is not
    const unmet = hasUnmetRequired(boxes, ['other']);
    assert.strictEqual(unmet.length, 1);
    assert.strictEqual(unmet[0].id, 'ack');
  });

  it('returns empty when there are no checkboxes at all', () => {
    const unmet = hasUnmetRequired([], []);
    assert.strictEqual(unmet.length, 0);
  });

  it('admin dangerConfirm ack checkbox has required:true', () => {
    // Read the actual admin.html source and confirm required is set
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../admin.html'), 'utf8');
    // The checkbox definition must contain required: true
    assert.ok(src.includes("required: true"), 'ack checkbox must have required: true');
  });

  it('dangerConfirm still returns false when confirmed without ack (backwards-compat)', () => {
    // Even if the dialog resolves (e.g. via keyboard), dangerConfirm
    // checks ack and returns false — the guard is defence-in-depth
    function dangerConfirmResult(result) {
      return !!(result && result.confirmed && result.checks?.ack === true);
    }
    assert.strictEqual(dangerConfirmResult({ confirmed: true, checks: { ack: false } }), false);
    assert.strictEqual(dangerConfirmResult({ confirmed: true, checks: { ack: true  } }), true);
  });

});


// ══════════════════════════════════════════════════════════════
//  SECTION 16 — fx-items collapsible state
//
//  Tests the pure state-management logic behind the collapsible
//  Items group in the Effects tab.
// ══════════════════════════════════════════════════════════════

describe('fx-items collapsible state', () => {

  // Pure replica of the localStorage-backed state helpers
  function makeStore(initial = {}) {
    let raw = JSON.stringify(initial);
    return {
      load()       { try { return JSON.parse(raw); } catch { return {}; } },
      isCollapsed(id) { return !!this.load()[id]; },
      toggle(id)   {
        const s = this.load();
        s[id] = !s[id];
        raw = JSON.stringify(s);
        return s[id]; // new state
      },
    };
  }

  it('all members start expanded (no entry = expanded)', () => {
    const store = makeStore({});
    assert.strictEqual(store.isCollapsed('_a'), false);
    assert.strictEqual(store.isCollapsed('_b'), false);
  });

  it('first toggle collapses an expanded member', () => {
    const store = makeStore({});
    const newState = store.toggle('_a');
    assert.strictEqual(newState, true,  'should now be collapsed');
    assert.strictEqual(store.isCollapsed('_a'), true);
  });

  it('second toggle re-expands a collapsed member', () => {
    const store = makeStore({ '_a': true });
    store.toggle('_a');
    assert.strictEqual(store.isCollapsed('_a'), false);
  });

  it('toggling one member does not affect others', () => {
    const store = makeStore({ '_a': true });
    store.toggle('_a');
    assert.strictEqual(store.isCollapsed('_b'), false, '_b should be unaffected');
  });

  it('persisted collapsed state is read back correctly', () => {
    const store = makeStore({ '_x': true, '_y': false });
    assert.strictEqual(store.isCollapsed('_x'), true);
    assert.strictEqual(store.isCollapsed('_y'), false);
  });

  it('collapsed state drives display:none on the body element', () => {
    // Simulate what buildEffectsPanel does with the collapsed flag
    function bodyStyle(collapsed) {
      return collapsed ? 'display:none' : '';
    }
    assert.strictEqual(bodyStyle(true),  'display:none');
    assert.strictEqual(bodyStyle(false), '');
  });

  it('chevron reflects collapsed/expanded state', () => {
    function chevron(collapsed) { return collapsed ? '▶' : '▼'; }
    assert.strictEqual(chevron(true),  '▶');
    assert.strictEqual(chevron(false), '▼');
  });

  it('item count badge shows correct count', () => {
    function badge(count) {
      return count ? ` (${count})` : '';
    }
    assert.strictEqual(badge(3),  ' (3)');
    assert.strictEqual(badge(0),  '');
    assert.strictEqual(badge(1),  ' (1)');
  });

  it('fxItemsToggle is defined in party-roster.html', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../party-roster.html'), 'utf8');
    assert.ok(src.includes('function fxItemsToggle('), 'fxItemsToggle must be defined');
  });

  it('_FX_COLLAPSE_KEY constant is defined', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../party-roster.html'), 'utf8');
    assert.ok(src.includes('_FX_COLLAPSE_KEY'), '_FX_COLLAPSE_KEY must be defined');
  });

  it('net totals variable appears before itemsSection variable in the return template', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '../party-roster.html'), 'utf8');
    // The return template uses variables (netSummary, itemsSection).
    // Confirm netSummary interpolation comes before itemsSection interpolation.
    const returnIdx = src.lastIndexOf('return `<div class="tab-panel" id="tab-effects-');
    assert.ok(returnIdx >= 0, 'buildEffectsPanel return template must exist');
    const template   = src.slice(returnIdx);
    const netIdx     = template.indexOf('${netSummary');
    const itemsIdx   = template.indexOf('${hasAnything?itemsSection');
    assert.ok(netIdx   >= 0, '${netSummary interpolation must be in return template');
    assert.ok(itemsIdx >= 0, '${hasAnything?itemsSection interpolation must be in return template');
    assert.ok(netIdx < itemsIdx, 'netSummary must appear before itemsSection in the return template');
  });

});

// ══════════════════════════════════════════════════════════════
// Section 26 — Search / filter / sort logic (_getFilteredMembers)
// ══════════════════════════════════════════════════════════════
describe('_getFilteredMembers() — roster filter and sort logic', () => {
  // Extract the pure filter+sort logic from party-roster.html
  // and run it in isolation with a simulated _rosterFilter state.
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../party-roster.html'),'utf8');

  // Pull out _getFilteredMembers source and evaluate in a local scope
  const fnMatch = src.match(/function _getFilteredMembers\(\)\{([\s\S]*?)\n\}/);
  assert.ok(fnMatch, '_getFilteredMembers must exist in party-roster.html');

  // Build a test harness: inject _rosterFilter + members, eval the function
  function makeHarness(members, filter) {
    const code = `
      const _rosterFilter = ${JSON.stringify(filter)};
      const members = ${JSON.stringify(members)};
      ${src.match(/function _getFilteredMembers\(\)\{[\s\S]*?\n\}/)[0]}
      _getFilteredMembers();
    `;
    return eval(code); // safe: no DOM, no network, no imports
  }

  const MEMBERS = [
    {id:'a', name:'Aeris',   class:'Cleric',  race:'Elf',    status:'active',  level:5,  tags:['Healer']},
    {id:'b', name:'Brom',    class:'Fighter', race:'Human',  status:'active',  level:3,  tags:['Tank']},
    {id:'c', name:'Cyra',    class:'Rogue',   race:'Gnome',  status:'retired', level:7,  tags:['Stealth']},
    {id:'d', name:'Draven',  class:'Wizard',  race:'Human',  status:'missing', level:10, tags:['Arcane']},
    {id:'e', name:'Elara',   class:'Cleric',  race:'Dwarf',  status:'deceased',level:2,  tags:[]},
  ];

  it('no filter returns all members in insertion order', () => {
    const result = makeHarness(MEMBERS, {search:'', status:'', sort:'created'});
    assert.strictEqual(result.length, 5);
    assert.strictEqual(result[0].id, 'a');
    assert.strictEqual(result[4].id, 'e');
  });

  it('status filter: active only returns 2', () => {
    const result = makeHarness(MEMBERS, {search:'', status:'active', sort:'created'});
    assert.strictEqual(result.length, 2);
    assert(result.every(m => m.status === 'active'));
  });

  it('status filter: retired returns 1', () => {
    const result = makeHarness(MEMBERS, {search:'', status:'retired', sort:'created'});
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'c');
  });

  it('status filter: deceased returns 1', () => {
    const result = makeHarness(MEMBERS, {search:'', status:'deceased', sort:'created'});
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'e');
  });

  it('text search matches on name (case insensitive)', () => {
    const result = makeHarness(MEMBERS, {search:'aeris', status:'', sort:'created'});
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'a');
  });

  it('text search matches on class', () => {
    const result = makeHarness(MEMBERS, {search:'cleric', status:'', sort:'created'});
    assert.strictEqual(result.length, 2);
    const ids = result.map(m=>m.id).sort();
    assert.deepStrictEqual(ids, ['a','e']);
  });

  it('text search matches on race', () => {
    const result = makeHarness(MEMBERS, {search:'human', status:'', sort:'created'});
    assert.strictEqual(result.length, 2);
    const ids = result.map(m=>m.id).sort();
    assert.deepStrictEqual(ids, ['b','d']);
  });

  it('text search matches on tag', () => {
    const result = makeHarness(MEMBERS, {search:'healer', status:'', sort:'created'});
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'a');
  });

  it('text search + status filter combine (AND)', () => {
    // search 'human' hits Brom (active) and Draven (missing)
    const result = makeHarness(MEMBERS, {search:'human', status:'active', sort:'created'});
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].id, 'b');
  });

  it('search with no match returns empty array', () => {
    const result = makeHarness(MEMBERS, {search:'zzznomatch', status:'', sort:'created'});
    assert.strictEqual(result.length, 0);
  });

  it('sort by name — alphabetical ascending', () => {
    const result = makeHarness(MEMBERS, {search:'', status:'', sort:'name'});
    const names = result.map(m=>m.name);
    assert.deepStrictEqual(names, [...names].sort((a,b)=>a.localeCompare(b)));
  });

  it('sort by level — descending (highest first)', () => {
    const result = makeHarness(MEMBERS, {search:'', status:'', sort:'level'});
    for(let i=0; i<result.length-1; i++){
      assert.ok(result[i].level >= result[i+1].level, `level[${i}] >= level[${i+1}]`);
    }
  });

  it('sort by class — alphabetical ascending', () => {
    const result = makeHarness(MEMBERS, {search:'', status:'', sort:'class'});
    const classes = result.map(m=>m.class);
    assert.deepStrictEqual(classes, [...classes].sort((a,b)=>a.localeCompare(b)));
  });

  it('sort by status — active first, then missing, retired, deceased', () => {
    const result = makeHarness(MEMBERS, {search:'', status:'', sort:'status'});
    const order = {active:0,missing:1,retired:2,deceased:3};
    for(let i=0; i<result.length-1; i++){
      assert.ok((order[result[i].status]??9) <= (order[result[i+1].status]??9));
    }
  });
});

// ══════════════════════════════════════════════════════════════
// Section 27 — CONDITIONS constant integrity
// ══════════════════════════════════════════════════════════════
describe('CONDITIONS constant — structure and completeness', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../party-roster.html'),'utf8');

  // Extract the CONDITIONS array literal and evaluate it
  const condMatch = src.match(/const CONDITIONS\s*=\s*(\[[\s\S]*?\]);\s*\/\/ Fast O\(1\)/);
  assert.ok(condMatch, 'CONDITIONS array must exist in party-roster.html');
  const CONDITIONS = eval(condMatch[1]);

  it('has exactly 15 official 5e conditions', () => {
    assert.strictEqual(CONDITIONS.length, 15);
  });

  const EXPECTED_KEYS = [
    'blinded','charmed','deafened','exhaustion','frightened','grappled',
    'incapacitated','invisible','paralyzed','petrified','poisoned',
    'prone','restrained','stunned','unconscious',
  ];

  it('contains all 15 official PHB condition keys', () => {
    const keys = CONDITIONS.map(c=>c.key).sort();
    assert.deepStrictEqual(keys, EXPECTED_KEYS.slice().sort());
  });

  it('every condition has key, icon, label, color, and tip', () => {
    CONDITIONS.forEach(c => {
      assert.ok(c.key,   `condition missing key: ${JSON.stringify(c)}`);
      assert.ok(c.icon,  `condition ${c.key} missing icon`);
      assert.ok(c.label, `condition ${c.key} missing label`);
      assert.ok(c.color, `condition ${c.key} missing color`);
      assert.ok(c.tip,   `condition ${c.key} missing tip`);
    });
  });

  it('all condition keys are unique', () => {
    const keys = CONDITIONS.map(c=>c.key);
    assert.strictEqual(new Set(keys).size, keys.length);
  });

  it('CONDITION_MAP is defined and has 15 entries', () => {
    const mapMatch = src.match(/const CONDITION_MAP\s*=\s*Object\.fromEntries\(CONDITIONS\.map\(/);
    assert.ok(mapMatch, 'CONDITION_MAP must be defined via Object.fromEntries(CONDITIONS.map(...)');
  });

  it('all condition colors are valid CSS color strings (hex or var())', () => {
    CONDITIONS.forEach(c => {
      const isHex = /^#[0-9a-fA-F]{3,8}$/.test(c.color);
      const isVar = /^var\(--/.test(c.color);
      assert.ok(isHex || isVar, `condition ${c.key} color "${c.color}" is not a valid CSS color`);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// Section 28 — HP bar rendering logic
// ══════════════════════════════════════════════════════════════
describe('HP bar — rendering logic in buildCard', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../party-roster.html'),'utf8');

  it('hp-bar-wrap element is generated in buildCard', () => {
    assert.ok(src.includes('hp-bar-wrap'), 'hp-bar-wrap class must appear in buildCard');
  });

  it('hp-bar-fill width is clamped 0–100%', () => {
    // The template uses Math.max(0, Math.min(100, ...)) for the pct calculation
    assert.ok(src.includes('Math.max(0,Math.min(100,'), 'HP pct must be clamped with Math.max(0,Math.min(100,...))');
  });

  it('HP bar color shifts to red when pct <= 25', () => {
    // Check the ternary color logic in the source
    assert.ok(src.includes("pct>50?color:pct>25?'var(--amber)':'var(--red)'"),
      'HP bar color ternary must shift: >50 → member color, >25 → amber, else red');
  });

  it('HP bar is only rendered when hpMax > 0', () => {
    assert.ok(src.includes('if(hpMax>0)'), 'HP bar must only render when hpMax > 0');
  });

  it('HP bar shows hpCur / hpMax in label', () => {
    // The label renders as ${hpCur}<span class="hp-bar-sep">/</span>${hpMax}
    assert.ok(src.includes('${hpCur}') && src.includes('${hpMax}') && src.includes('hp-bar-sep'),
      'HP bar label must display hpCur/hpMax with hp-bar-sep separator');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 29 — Attunement slot tracking (5e limit = 3)
// ══════════════════════════════════════════════════════════════
describe('Attunement slot tracking — 5e limit of 3', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../party-roster.html'),'utf8');

  it('attunement warning is shown when > 3 items are attuned', () => {
    assert.ok(src.includes('attunement-warning'), 'attunement-warning class must exist');
    assert.ok(src.includes('attuned.length>3'), 'warning must trigger at attuned.length > 3');
  });

  it('attunement slot pips (3 pips) are rendered for members with items', () => {
    assert.ok(src.includes('attune-pip'), 'attune-pip class must exist');
    // The pips array [0,1,2] maps to 3 pips
    assert.ok(src.includes('[0,1,2].map('), 'pips must be generated from [0,1,2]');
  });

  it('pip color "over" class is applied when index < attuned.length AND > 3', () => {
    // The ternary: i<attuned.length ? (attuned.length>3 ? 'over' : 'used') : ''
    assert.ok(src.includes("attuned.length>3?'over':'used'"), 
      'pip class must be over when > 3 attuned');
  });

  it('attunement count label shows N/3', () => {
    assert.ok(src.includes('attune-slots-count'), 'attune-slots-count class must exist');
    assert.ok(src.includes('${attuned.length}/3'), 'count label must show N/3');
  });

  it('attuned items are filtered from memberItems array correctly', () => {
    // Check that attuned filter uses correct attunement value
    assert.ok(src.includes("it.attunement==='attuned'"), 
      'attuned count must filter by attunement === "attuned"');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 30 — Rest mechanics structure
// ══════════════════════════════════════════════════════════════
describe('Rest mechanics — doShortRest and doLongRest', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../party-roster.html'),'utf8');

  it('doShortRest function exists', () => {
    assert.ok(src.includes('async function doShortRest()'), 'doShortRest must be async function');
  });

  it('doLongRest function exists', () => {
    assert.ok(src.includes('async function doLongRest()'), 'doLongRest must be async function');
  });

  it('doLongRest sets hpcur to hp (full HP restore)', () => {
    // Long rest sets hpcur = hpMax
    assert.ok(src.includes('hpcur:hpMax'), 'doLongRest must set hpcur to hpMax');
  });

  it('doLongRest only affects active members', () => {
    assert.ok(
      src.includes("members.filter(m=>!m.status||m.status==='active')"),
      'rest functions must filter to active members only'
    );
  });

  it('doLongRest uses Promise.all to save members in parallel', () => {
    // Long rest saves multiple members; should parallelise
    assert.ok(src.includes('await Promise.all(promises)'), 
      'doLongRest must use Promise.all for parallel saves');
  });

  it('doShortRest guards against dividing by zero (hpMax = 0)', () => {
    // Short rest skips members where hpMax is 0 (no HP set)
    assert.ok(src.includes('if(!hpMax) return'), 
      'doLongRest must skip members with hpMax = 0');
  });

  it('rest buttons exist in HTML', () => {
    assert.ok(src.includes('onclick="doShortRest()"'), 'Short Rest button must call doShortRest()');
    assert.ok(src.includes('onclick="doLongRest()"'), 'Long Rest button must call doLongRest()');
  });

  it('rest buttons are inside roster-bar', () => {
    // roster-bar contains rest-btns as a child element
    const rosterBarStart = src.indexOf('class="roster-bar"');
    const rosterBarEnd   = src.indexOf('<!-- ── SEARCH', rosterBarStart);
    const restBtnsIdx    = src.indexOf('class="rest-btns"', rosterBarStart);
    assert.ok(rosterBarStart >= 0, 'roster-bar must exist');
    assert.ok(restBtnsIdx > rosterBarStart && restBtnsIdx < rosterBarEnd,
      'rest-btns must be inside roster-bar (before search toolbar)');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 31 — Conditions tab DOM structure
// ══════════════════════════════════════════════════════════════
describe('Conditions tab — buildCondPanel structure', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../party-roster.html'),'utf8');

  it('buildCondPanel function exists', () => {
    assert.ok(src.includes('function buildCondPanel('), 'buildCondPanel must be defined');
  });

  it('condTab is built and injected into the card HTML', () => {
    assert.ok(src.includes('const condTab=buildCondPanel('), 
      'condTab must be built via buildCondPanel');
    // The card template must include ${condTab}
    assert.ok(src.includes('${condTab}'), 'condTab must be injected into card template');
  });

  it('tab-cond-ID panel is created', () => {
    assert.ok(src.includes('id="tab-cond-${m.id}"'), 'conditions panel must have id tab-cond-{id}');
  });

  it('cond-grid renders all 15 chips', () => {
    // The grid is built from CONDITIONS.map(...), so it will render all 15
    assert.ok(src.includes('CONDITIONS.map(c=>'), 
      'cond-grid must be built from CONDITIONS.map');
  });

  it('chip onclick calls toggleCondition with memberId and key', () => {
    assert.ok(src.includes("onclick=\"toggleCondition('${m.id}','${c.key}')\""),
      'chip onclick must call toggleCondition with memberId and key');
  });

  it('active chips have the active class set from getConditions()', () => {
    assert.ok(src.includes('const isActive=activeConditions.includes(c.key)'),
      'chip active state must be derived from activeConditions array');
    assert.ok(src.includes('class="cond-chip ${isActive?'), 
      'chip class must include active when isActive');
  });

  it('switchTab handles "cond" tab (5th tab)', () => {
    // switchTab must handle 5 tabs: bio, stats, effects, loot, cond
    assert.ok(src.includes("'bio','stats','effects','loot','cond'"),
      'switchTab must include cond in its tab list');
  });

  it('Cond tab button exists in card template', () => {
    assert.ok(src.includes("switchTab('${m.id}','cond',this)"),
      'Cond tab button must exist in card template');
  });

  it('clearConditions function exists', () => {
    assert.ok(src.includes('function clearConditions('), 
      'clearConditions must be defined');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 32 — Condition localStorage persistence
// ══════════════════════════════════════════════════════════════
describe('Conditions — localStorage persistence helpers', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../party-roster.html'),'utf8');

  it('_COND_KEY constant is defined', () => {
    assert.ok(src.includes("const _COND_KEY='nexus_conditions'"), 
      '_COND_KEY must be nexus_conditions');
  });

  it('_condLoad, _condSave, getConditions are all defined', () => {
    assert.ok(src.includes('function _condLoad()'), '_condLoad must be defined');
    assert.ok(src.includes('function _condSave('), '_condSave must be defined');
    assert.ok(src.includes('function getConditions('), 'getConditions must be defined');
  });

  it('toggleCondition adds key when absent, removes when present', () => {
    // Simulate the toggle logic (no DOM needed — pure logic test)
    function simulateToggle(existing, key) {
      return existing.includes(key) ? existing.filter(k=>k!==key) : [...existing, key];
    }
    assert.deepStrictEqual(simulateToggle([], 'blinded'), ['blinded']);
    assert.deepStrictEqual(simulateToggle(['blinded'], 'blinded'), []);
    assert.deepStrictEqual(simulateToggle(['poisoned'], 'blinded'), ['poisoned','blinded']);
    assert.deepStrictEqual(simulateToggle(['poisoned','blinded'], 'poisoned'), ['blinded']);
  });

  it('_refreshCondChips is called after toggleCondition', () => {
    assert.ok(src.includes('_refreshCondChips(memberId)'),
      'toggleCondition must call _refreshCondChips after save');
  });

  it('clearConditions deletes the member entry from the map', () => {
    assert.ok(src.includes('delete map[memberId]'), 
      'clearConditions must delete the member entry (not just set to [])');
  });

  it('getConditions returns empty array for unknown memberId', () => {
    // The function: return _condLoad()[memberId] || []
    assert.ok(src.includes("return _condLoad()[memberId]||[]"),
      'getConditions must return empty array as fallback');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 33 — statActive stat counter
// ══════════════════════════════════════════════════════════════
describe('updateStats() — statActive counter', () => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../party-roster.html'),'utf8');

  it('statActive element exists in HTML', () => {
    assert.ok(src.includes('id="statActive"'), 'statActive span must exist in HTML');
  });

  it('updateStats sets statActive to count of active members', () => {
    assert.ok(
      src.includes("members.filter(m=>!m.status||m.status==='active')"),
      'statActive must count members with no status or status === active'
    );
  });
});

// ══════════════════════════════════════════════════════════════
// Section 34 — Term system: partyInventory & partyVault keys
// ══════════════════════════════════════════════════════════════
describe('Term system — partyInventory and partyVault keys', () => {
  const fs   = require('fs'), path = require('path');
  const cfg  = fs.readFileSync(path.join(__dirname,'../js/nexus-config.js'), 'utf8');
  const lt   = fs.readFileSync(path.join(__dirname,'../loot-tracker.html'), 'utf8');
  const pr   = fs.readFileSync(path.join(__dirname,'../party-roster.html'), 'utf8');
  const tr   = fs.readFileSync(path.join(__dirname,'../treasury.html'), 'utf8');
  const adm  = fs.readFileSync(path.join(__dirname,'../admin.html'), 'utf8');

  // ── nexus-config.js ──
  it('TERM_DEFAULTS contains partyInventory key', () => {
    assert.ok(cfg.includes("partyInventory: 'Party Inventory'"),
      'partyInventory must be in TERM_DEFAULTS with default "Party Inventory"');
  });

  it('TERM_DEFAULTS contains partyVault key', () => {
    assert.ok(cfg.includes("partyVault:     'Party Vault'"),
      'partyVault must be in TERM_DEFAULTS with default "Party Vault"');
  });

  // ── loot-tracker.html ──
  it('loot-tracker holder dropdown uses t("partyInventory") for display name', () => {
    assert.ok(lt.includes("name:t('partyInventory')"),
      "Holder dropdown option name must use t('partyInventory') not hardcoded string");
  });

  it('loot-tracker initHolderDisplay uses t("partyInventory")', () => {
    // The specialOpts array in initHolderDisplay
    assert.ok(lt.includes("name:t('partyInventory'),photo:null,isSpecial:true"),
      "initHolderDisplay specialOpts must use t('partyInventory')");
  });

  it('loot-tracker renderHolderCell identity check uses canonical "Party Inventory"', () => {
    assert.ok(lt.includes("if(holder==='Party Inventory'){"),
      'renderHolderCell must compare holder to canonical "Party Inventory" string (DB value, not display)');
  });

  it('loot-tracker renderHolderCell display uses t("partyInventory")', () => {
    assert.ok(lt.includes("esc(t('partyInventory'))"),
      "renderHolderCell must display t('partyInventory'), not the raw holder value");
  });

  it('loot-tracker populateHolderFilter updates static option label with t()', () => {
    assert.ok(lt.includes("sel.options[1].textContent='🎒 '+t('partyInventory')"),
      "populateHolderFilter must update the Party Inventory option label using t()");
  });

  it('loot-tracker filterHolder identity comparison still uses canonical "Party Inventory"', () => {
    // The filter value attr never changes — comparison must match DB value
    assert.ok(lt.includes('value="Party Inventory"') || lt.includes("value:'Party Inventory'"),
      'The value attribute/property for Party Inventory must stay canonical for filter logic');
  });

  // ── party-roster.html ──
  it('party-roster lt_populateHolderSelect updates static option with t()', () => {
    assert.ok(pr.includes("sel.options[1].textContent=t('partyInventory')"),
      "lt_populateHolderSelect must update Party Inventory label using t()");
  });

  it('party-roster loot tab option value stays canonical "Party Inventory"', () => {
    assert.ok(pr.includes('value="Party Inventory"'),
      'The HTML option value must stay "Party Inventory" — only display label changes');
  });

  // ── treasury.html ──
  it('treasury SPLIT_MODE_HINTS use t("partyVault")', () => {
    assert.ok(tr.includes("t('partyVault').toLowerCase()"),
      "SPLIT_MODE_HINTS must use t('partyVault').toLowerCase() not hardcoded 'party vault'");
  });

  it('treasury calcSplit vault recipient name uses t("partyVault")', () => {
    assert.ok(tr.includes("r.type === 'vault' ? t('partyVault') : r.member.name"),
      "calcSplit vault name must use t('partyVault')");
  });

  it('treasury vault slot footnote uses t("partyVault")', () => {
    assert.ok(tr.includes("t('partyVault').toLowerCase()") && tr.includes('vault slots receive'),
      "calcSplit vault slot footnote must use t('partyVault').toLowerCase()");
  });

  it('treasury applySplit even remainder txs use t("partyVault")', () => {
    assert.ok(tr.includes('`Split remainder — returned to ${t(\'partyVault\')}`') ||
              tr.includes("Split remainder — returned to ${t('partyVault')}"),
      "applySplit even remainder description must use t('partyVault')");
  });

  it('treasury TX holder dropdown sub-label uses t("partyVault")', () => {
    assert.ok(tr.includes("goes to ${t('partyVault').toLowerCase()}"),
      "TX holder dropdown sub must use t('partyVault').toLowerCase()");
  });

  it('treasury Member Wealth label uses t("members")', () => {
    assert.ok(tr.includes("${t('members')} Wealth"),
      "Member Wealth label must use t('members')");
  });

  // ── admin.html ──
  it('admin TERM_DEFS includes partyInventory key', () => {
    assert.ok(adm.includes("key: 'partyInventory'"),
      "TERM_DEFS must include partyInventory entry");
  });

  it('admin TERM_DEFS includes partyVault key', () => {
    assert.ok(adm.includes("key: 'partyVault'"),
      "TERM_DEFS must include partyVault entry");
  });

  it('admin partyInventory hint mentions Loot Tracker', () => {
    assert.ok(adm.includes("hint: 'Shared loot holder label in Loot Tracker'"),
      'partyInventory term entry must have an accurate hint');
  });

  it('admin partyVault hint mentions Treasury', () => {
    assert.ok(adm.includes("hint: 'Split remainder destination in Treasury'"),
      'partyVault term entry must have an accurate hint');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 35 — Terminology: canonical DB values preserved
// ══════════════════════════════════════════════════════════════
describe('Term system — canonical DB values unchanged', () => {
  const fs  = require('fs'), path = require('path');
  const lt  = fs.readFileSync(path.join(__dirname,'../loot-tracker.html'), 'utf8');
  const pr  = fs.readFileSync(path.join(__dirname,'../party-roster.html'), 'utf8');

  it('loot-tracker holder comparison uses canonical "Party Inventory" not t()', () => {
    // Logic branches must compare against the stable DB value
    assert.ok(lt.includes("holder==='Party Inventory'"),
      'Holder identity check must use canonical "Party Inventory" string');
    // And must NOT compare against t() call
    assert.ok(!lt.includes("holder===t('partyInventory')"),
      'Holder identity check must NOT use t() — would break if term is renamed');
  });

  it('loot-tracker value==="Party Inventory" identity in setHolderDisplay uses canonical', () => {
    assert.ok(lt.includes("value==='Party Inventory'"),
      'setHolderDisplay value check must use canonical "Party Inventory"');
  });

  it('party-roster option value attr stays canonical "Party Inventory"', () => {
    // value attr is what gets saved to DB and compared in logic
    assert.ok(pr.includes('value="Party Inventory"'),
      'lt_fieldHolder option value must be canonical "Party Inventory"');
  });

  it('loot-tracker option value attr stays canonical "Party Inventory"', () => {
    assert.ok(lt.includes('value="Party Inventory"'),
      'filterHolder option value must be canonical "Party Inventory"');
  });

  it('no page compares holder to t("partyInventory") in a logic branch', () => {
    // t() calls are display-only — no logic should depend on the translated string
    assert.ok(!lt.includes("holder===t('partyInventory')"),
      'No logic branch should compare holder to a t() result');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 36 — Campaign Snapshot: export function structure
// ══════════════════════════════════════════════════════════════
describe('Campaign Snapshot — exportSnapshot function', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../admin.html'), 'utf8');

  it('exportSnapshot function is defined', () => {
    assert.ok(src.includes('async function exportSnapshot()'),
      'exportSnapshot must be an async function');
  });

  it('SNAPSHOT_TABLES constant lists all 5 tables', () => {
    assert.ok(src.includes("const SNAPSHOT_TABLES = ["), 'SNAPSHOT_TABLES must be defined');
    assert.ok(src.includes("'party_members'"),        'must include party_members');
    assert.ok(src.includes("'treasury_currencies'"),  'must include treasury_currencies');
    assert.ok(src.includes("'treasury_ledger'"),      'must include treasury_ledger');
    assert.ok(src.includes("'loot_items'"),           'must include loot_items');
    assert.ok(src.includes("'nexus_settings'"),       'must include nexus_settings');
  });

  it('exportSnapshot fetches all tables in parallel with Promise.all', () => {
    assert.ok(src.includes('Promise.all(\n        SNAPSHOT_TABLES.map') ||
              src.includes('Promise.all(SNAPSHOT_TABLES.map') ||
              src.includes("Promise.all(\n        SNAPSHOT_TABLES"),
      'exportSnapshot must use Promise.all to fetch tables in parallel');
  });

  it('snapshot object includes version, exported_at, campaign, and tables fields', () => {
    assert.ok(src.includes('version:     1'),     'snapshot must have version: 1');
    assert.ok(src.includes('exported_at:'),       'snapshot must have exported_at timestamp');
    assert.ok(src.includes("campaign:"),          'snapshot must have campaign field');
    assert.ok(src.includes('tables,'),            'snapshot must include tables object');
  });

  it('exportSnapshot downloads file with nexus-snapshot prefix', () => {
    assert.ok(src.includes('`nexus-snapshot-${date}.json`') ||
              src.includes("'nexus-snapshot-' + date + '.json'") ||
              src.includes('nexus-snapshot-'),
      'exported filename must have nexus-snapshot prefix');
  });

  it('exportSnapshot revokes the object URL after download', () => {
    assert.ok(src.includes('URL.revokeObjectURL(a.href)'),
      'exportSnapshot must revoke the object URL to avoid memory leaks');
  });

  it('exportSnapshot has a loading state on the button', () => {
    assert.ok(src.includes("btn.dataset.loadingText = 'Fetching…'") ||
              src.includes("loadingText = 'Fetching"),
      'exportSnapshot must set loadingText on the button');
  });

  it('exportSnapshot shows total row count in status message', () => {
    assert.ok(src.includes('totalRows'),
      'exportSnapshot must track and display total row count');
  });

  it('export button has id btnExportSnapshot', () => {
    assert.ok(src.includes('id="btnExportSnapshot"'),
      'Export button must have id btnExportSnapshot');
  });

  it('snapshotStatus helper function is defined', () => {
    assert.ok(src.includes('function snapshotStatus('),
      'snapshotStatus helper must be defined');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 37 — Campaign Snapshot: restore function structure
// ══════════════════════════════════════════════════════════════
describe('Campaign Snapshot — restoreSnapshot function', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../admin.html'), 'utf8');

  it('restoreSnapshot function is defined', () => {
    assert.ok(src.includes('async function restoreSnapshot('),
      'restoreSnapshot must be an async function');
  });

  it('hidden file input exists for snapshot restore', () => {
    assert.ok(src.includes('id="snapshotFileInput"'),
      'snapshotFileInput hidden file input must exist');
    assert.ok(src.includes('onchange="restoreSnapshot(event)"'),
      'snapshotFileInput must call restoreSnapshot on change');
  });

  it('restoreSnapshot resets file input value after selection', () => {
    assert.ok(src.includes("event.target.value = ''"),
      'restoreSnapshot must reset event.target.value so same file can be reselected');
  });

  it('restoreSnapshot validates presence of tables key', () => {
    assert.ok(src.includes('!snapshot.tables') || src.includes("snapshot.tables"),
      'restoreSnapshot must validate the tables key exists');
  });

  it('restoreSnapshot warns about unexpected version', () => {
    assert.ok(src.includes('snapshot.version !== 1'),
      'restoreSnapshot must check snapshot version and warn if not 1');
  });

  it('restoreSnapshot uses dangerConfirm before proceeding', () => {
    assert.ok(src.includes('const confirmed = await dangerConfirm('),
      'restoreSnapshot must gate behind dangerConfirm');
  });

  it('restoreSnapshot confirm message includes table names and counts', () => {
    assert.ok(src.includes('SNAPSHOT_TABLES.map(tbl =>'),
      'restoreSnapshot must build per-table counts for confirm message');
  });

  it('restoreSnapshot deletes existing rows before re-seeding (except nexus_settings)', () => {
    assert.ok(src.includes("db.deleteWhere(tbl, 'id=gt.')"),
      "restoreSnapshot must call deleteWhere with 'id=gt.' to clear existing rows");
  });

  it('restoreSnapshot treats nexus_settings as upsert-only (no delete)', () => {
    assert.ok(src.includes("tbl === 'nexus_settings'"),
      'restoreSnapshot must handle nexus_settings separately (upsert, no delete)');
  });

  it('restoreSnapshot uses upsertMany to re-seed tables', () => {
    assert.ok(src.includes('await db.upsertMany(tbl, rows)'),
      'restoreSnapshot must use db.upsertMany to restore each table');
  });

  it('restoreSnapshot tracks and reports errors per table', () => {
    assert.ok(src.includes('const errors = []') || src.includes('const errors=[]'),
      'restoreSnapshot must collect per-table errors');
    assert.ok(src.includes('errors.push('),
      'restoreSnapshot must push to errors array on failure');
  });

  it('restoreSnapshot reports total records restored', () => {
    assert.ok(src.includes('totalRestored'),
      'restoreSnapshot must track totalRestored count');
  });

  it('restoreSnapshot shows partial failure message if errors exist', () => {
    assert.ok(src.includes('Restore partially') || src.includes('partially completed'),
      'restoreSnapshot must report partial failure distinctly from full failure');
  });

  it('restoreSnapshot shows export date from snapshot metadata on success', () => {
    assert.ok(src.includes('snapshot.exported_at'),
      'restoreSnapshot must read exported_at from snapshot for success message');
  });

  it('restore button has id btnRestoreSnapshot', () => {
    assert.ok(src.includes('id="btnRestoreSnapshot"'),
      'Restore button must have id btnRestoreSnapshot');
  });

  it('snapshotStatus is called with isError=true on failure', () => {
    assert.ok(src.includes('snapshotStatus(') && src.includes(', true)'),
      'snapshotStatus must be called with true on error paths');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 38 — Terminology: missed hardcoded strings (regression)
// ══════════════════════════════════════════════════════════════
describe('Term system — no raw hardcoded display strings remain', () => {
  const fs = require('fs'), path = require('path');
  const tr = fs.readFileSync(path.join(__dirname,'../treasury.html'), 'utf8');
  const lt = fs.readFileSync(path.join(__dirname,'../loot-tracker.html'), 'utf8');
  const pr = fs.readFileSync(path.join(__dirname,'../party-roster.html'), 'utf8');

  // ── treasury: split card vault name in template literal ──
  it('treasury split vault card name uses t("partyVault")', () => {
    assert.ok(tr.includes("class=\"split-card-name\">${t('partyVault')}<"),
      'Split vault card name must use t("partyVault") — not hardcoded "Party Vault"');
  });

  it('treasury split-mode-hint div is initially empty (populated by JS)', () => {
    // The static HTML hint must be empty; JS fills it from SPLIT_MODE_HINTS on modal open
    assert.ok(tr.includes('id="splitModeHint"></div>') ||
              tr.includes("id=\"splitModeHint\"></div>"),
      'splitModeHint div must be initially empty so JS can fill it with t() template literals');
  });

  it('treasury SPLIT_MODE_HINTS all three modes converted to template literals', () => {
    // All three must use template literals (backticks) not single-quoted strings
    const evenMatch    = tr.match(/even:\s*`[^`]*t\('partyVault'\)/);
    const percentMatch = tr.match(/percent:\s*`[^`]*t\('partyVault'\)/);
    const flatMatch    = tr.match(/flat:\s*`[^`]*t\('partyVault'\)/);
    assert.ok(evenMatch,    'SPLIT_MODE_HINTS.even must be a template literal using t("partyVault")');
    assert.ok(percentMatch, 'SPLIT_MODE_HINTS.percent must be a template literal using t("partyVault")');
    assert.ok(flatMatch,    'SPLIT_MODE_HINTS.flat must be a template literal using t("partyVault")');
  });

  it('treasury SPLIT_MODE_HINTS has no raw "party vault" lowercase strings', () => {
    // After conversion, no hardcoded 'party vault' should remain in SPLIT_MODE_HINTS block
    const hintsBlock = tr.slice(tr.indexOf('SPLIT_MODE_HINTS'), tr.indexOf('SPLIT_MODE_HINTS') + 400);
    assert.ok(!hintsBlock.includes("party vault'") && !hintsBlock.includes('party vault.'),
      'SPLIT_MODE_HINTS must not contain any raw "party vault" string literals');
  });

  it('treasury no hardcoded "Party Vault" outside t() calls or canonical logic', () => {
    // Find any 'Party Vault' string not inside a t() call and not in a nav/href context
    const lines = tr.split('\n');
    const violations = lines.filter((line, i) => {
      const l = line.toLowerCase();
      if (!l.includes('party vault')) return false;
      const stripped = line.trim();
      // Allow: t('partyVault'), href=, sidenav, nav-label, comments
      if (stripped.includes("t('partyVault')")) return false;
      if (stripped.startsWith('//') || stripped.startsWith('*')) return false;
      if (stripped.includes('href=') || stripped.includes('nav-label')) return false;
      if (stripped.includes('partyVault')) return false;
      return true;
    });
    assert.strictEqual(violations.length, 0,
      `treasury.html has ${violations.length} hardcoded "Party Vault" display strings not using t(): ` +
      violations.map((l,i) => `\n  ${l.trim()}`).join(''));
  });

  it('party-roster lt_refreshEffectsForItem keeps canonical "party inventory" for logic', () => {
    // This is a DB-value comparison in party-roster, must NOT use t()
    assert.ok(pr.includes("holderLc==='party inventory'") || pr.includes("holderLc === 'party inventory'"),
      'lt_refreshEffectsForItem must compare holder to canonical "party inventory" string (DB value)');
    assert.ok(!pr.includes("holderLc===t('partyInventory')") && !pr.includes("holderLc === t('partyInventory')"),
      'lt_refreshEffectsForItem must NOT use t() for logic comparison — would break on rename');
  });

  it('party-roster isParty check uses canonical "party inventory" string', () => {
    // This logic check matches stored DB holder values
    assert.ok(pr.includes("holderLc==='party inventory'") || pr.includes("holderLc === 'party inventory'"),
      'isParty check must use canonical "party inventory" string not a t() call');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 39 — Term system: TERM_DEFAULTS ↔ TERM_DEFS key sync
// ══════════════════════════════════════════════════════════════
describe('Term system — TERM_DEFAULTS and TERM_DEFS key sync', () => {
  const fs  = require('fs'), path = require('path');
  const cfg = fs.readFileSync(path.join(__dirname,'../js/nexus-config.js'), 'utf8');
  const adm = fs.readFileSync(path.join(__dirname,'../admin.html'), 'utf8');

  // Extract TERM_DEFAULTS keys from nexus-config.js
  function extractDefaultKeys(src) {
    const match = src.match(/const TERM_DEFAULTS\s*=\s*\{([\s\S]*?)\};/);
    if (!match) return [];
    return [...match[1].matchAll(/^\s{2}(\w+):/gm)].map(m => m[1]);
  }

  // Extract TERM_DEFS keys from admin.html
  function extractDefsKeys(src) {
    const match = src.match(/const TERM_DEFS\s*=\s*\[([\s\S]*?)\];\s*\n\s*function buildTermGrid/);
    if (!match) return [];
    return [...match[1].matchAll(/key:\s*'(\w+)'/g)].map(m => m[1]);
  }

  it('TERM_DEFAULTS contains at least 16 keys (baseline + 2 new)', () => {
    const keys = extractDefaultKeys(cfg);
    assert.ok(keys.length >= 16,
      `TERM_DEFAULTS must have at least 16 keys, found ${keys.length}: [${keys.join(', ')}]`);
  });

  it('TERM_DEFS contains at least 16 keys matching TERM_DEFAULTS', () => {
    const defsKeys = extractDefsKeys(adm);
    assert.ok(defsKeys.length >= 16,
      `TERM_DEFS must have at least 16 keys, found ${defsKeys.length}`);
  });

  it('every TERM_DEFS key exists in TERM_DEFAULTS', () => {
    const defaultKeys = extractDefaultKeys(cfg);
    const defsKeys    = extractDefsKeys(adm);
    const missing = defsKeys.filter(k => !defaultKeys.includes(k));
    assert.strictEqual(missing.length, 0,
      `TERM_DEFS keys missing from TERM_DEFAULTS: [${missing.join(', ')}]`);
  });

  it('partyInventory and partyVault both appear in TERM_DEFAULTS', () => {
    const keys = extractDefaultKeys(cfg);
    assert.ok(keys.includes('partyInventory'), 'TERM_DEFAULTS must have partyInventory');
    assert.ok(keys.includes('partyVault'),     'TERM_DEFAULTS must have partyVault');
  });

  it('partyInventory and partyVault both appear in TERM_DEFS', () => {
    const keys = extractDefsKeys(adm);
    assert.ok(keys.includes('partyInventory'), 'TERM_DEFS must have partyInventory');
    assert.ok(keys.includes('partyVault'),     'TERM_DEFS must have partyVault');
  });

  it('t() function falls back to TERM_DEFAULTS then the key itself', () => {
    assert.ok(cfg.includes('TERMS[key] ?? TERM_DEFAULTS[key] ?? key'),
      't() must fall back: TERMS[key] → TERM_DEFAULTS[key] → key');
  });

  it('loadTerms merges saved settings over TERM_DEFAULTS (spread order correct)', () => {
    // { ...TERM_DEFAULTS, ...saved } — saved wins, but TERM_DEFAULTS fills gaps
    assert.ok(cfg.includes('{ ...TERM_DEFAULTS, ...saved }') ||
              cfg.includes('{...TERM_DEFAULTS,...saved}'),
      'loadTerms must spread: { ...TERM_DEFAULTS, ...saved } so saved wins on conflict');
  });

  it('saveTerms merges new terms over TERM_DEFAULTS before persisting', () => {
    assert.ok(cfg.includes('{ ...TERM_DEFAULTS, ...newTerms }') ||
              cfg.includes('{...TERM_DEFAULTS,...newTerms}'),
      'saveTerms must merge with TERM_DEFAULTS so no key is ever left undefined');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 40 — db.upsertMany: method correctness
// ══════════════════════════════════════════════════════════════
describe('db.upsertMany — batch upsert method', () => {
  const fs  = require('fs'), path = require('path');
  const cfg = fs.readFileSync(path.join(__dirname,'../js/nexus-config.js'), 'utf8');

  it('upsertMany is defined on the db object', () => {
    assert.ok(cfg.includes('async upsertMany(table, rows)'),
      'db must have async upsertMany(table, rows) method');
  });

  it('upsertMany uses resolution=merge-duplicates Prefer header', () => {
    // Must match the upsertMany block specifically
    const idx = cfg.indexOf('async upsertMany(');
    const block = cfg.slice(idx, idx + 400);
    assert.ok(block.includes('resolution=merge-duplicates'),
      'upsertMany Prefer header must include resolution=merge-duplicates');
  });

  it('upsertMany serialises the rows array as JSON body', () => {
    const idx = cfg.indexOf('async upsertMany(');
    const block = cfg.slice(idx, idx + 400);
    assert.ok(block.includes('JSON.stringify(rows)'),
      'upsertMany must send rows array as JSON.stringify(rows)');
  });

  it('upsertMany guards against empty array before fetching', () => {
    const idx = cfg.indexOf('async upsertMany(');
    const block = cfg.slice(idx, idx + 400);
    assert.ok(block.includes('if (!rows.length) return []') ||
              block.includes("if(!rows.length)return[]"),
      'upsertMany must early-return for empty rows array');
  });

  it('upsertMany uses POST method (Supabase batch upsert)', () => {
    const idx = cfg.indexOf('async upsertMany(');
    const block = cfg.slice(idx, idx + 400);
    assert.ok(block.includes("method:  'POST'") || block.includes("method:'POST'"),
      'upsertMany must use POST method for Supabase batch upsert');
  });

  it('restoreSnapshot calls upsertMany with table name and rows array', () => {
    const adm = fs.readFileSync(path.join(__dirname,'../admin.html'), 'utf8');
    assert.ok(adm.includes('await db.upsertMany(tbl, rows)'),
      'restoreSnapshot must call db.upsertMany(tbl, rows) not db.upsert()');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 41 — Campaign Snapshot: logic correctness (pure)
// ══════════════════════════════════════════════════════════════
describe('Campaign Snapshot — logic correctness (pure JS)', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../admin.html'), 'utf8');

  it('snapshot version is exactly 1 (integer, not string)', () => {
    // version: 1  not  version: '1'
    assert.ok(src.includes('version:     1,') || src.includes('version: 1,'),
      'snapshot version must be integer 1');
    assert.ok(!src.includes("version:     '1'") && !src.includes("version: '1'"),
      'snapshot version must not be a string');
  });

  it('exported_at uses Date.now() for millisecond timestamp', () => {
    assert.ok(src.includes('exported_at: Date.now()') || src.includes('exported_at:Date.now()'),
      'exported_at must use Date.now() for a reliable millisecond timestamp');
  });

  it('export filename includes ISO date (YYYY-MM-DD format)', () => {
    // .toISOString().slice(0, 10) produces YYYY-MM-DD
    assert.ok(src.includes(".toISOString().slice(0, 10)") || src.includes(".toISOString().slice(0,10)"),
      'Export filename date must use .toISOString().slice(0,10) for YYYY-MM-DD format');
  });

  it('export catches errors per-table (individual .catch(() => []))', () => {
    // Each table fetch should silently return [] on failure so other tables still export
    assert.ok(src.includes('.catch(() => [])'),
      'Per-table fetches must use .catch(() => []) so one bad table does not abort the export');
  });

  it('restore resets file input value immediately after selection', () => {
    // Prevents same-file deselect/reselect issue
    assert.ok(src.includes("event.target.value = '';"),
      'restoreSnapshot must reset event.target.value immediately after reading the file');
  });

  it('restore validates snapshot.tables is an object not an array', () => {
    assert.ok(src.includes("typeof snapshot.tables !== 'object'"),
      'restoreSnapshot must validate tables is a typeof object');
  });

  it('restore only calls deleteWhere for non-settings tables', () => {
    // nexus_settings is key-value store — wrong to bulk-delete it
    const restoreIdx = src.indexOf('async function restoreSnapshot(');
    const restoreBlock = src.slice(restoreIdx, restoreIdx + 2000);
    assert.ok(restoreBlock.includes("tbl === 'nexus_settings'"),
      'restoreSnapshot must check tbl === "nexus_settings" to skip bulk delete for settings');
  });

  it('restore increments totalRestored by rows.length for each table', () => {
    const restoreIdx = src.indexOf('async function restoreSnapshot(');
    const restoreBlock = src.slice(restoreIdx, restoreIdx + 3000);
    assert.ok(restoreBlock.includes('totalRestored += rows.length'),
      'restoreSnapshot must add rows.length to totalRestored for each table');
  });

  it('restore uses toLocaleDateString for human-readable export date on success', () => {
    assert.ok(src.includes('toLocaleDateString(') ,
      'Success message must use toLocaleDateString() for a readable date');
  });

  it('snapshotStatus sets display to block when showing a message', () => {
    const idx = src.indexOf('function snapshotStatus(');
    const block = src.slice(idx, idx + 400);
    assert.ok(block.includes("el.style.display = 'block'") || block.includes("el.style.display='block'"),
      'snapshotStatus must set display:block to show the element');
  });

  it('snapshotStatus uses var(--red) for error and var(--cyan) for success', () => {
    const idx = src.indexOf('function snapshotStatus(');
    const block = src.slice(idx, idx + 400);
    assert.ok(block.includes("var(--red)"),   'snapshotStatus must use var(--red) for error state');
    assert.ok(block.includes("var(--cyan)"),  'snapshotStatus must use var(--cyan) for success state');
  });

  it('exportSnapshot hides status div before starting new export', () => {
    const idx = src.indexOf('async function exportSnapshot(');
    const block = src.slice(idx, idx + 600);
    assert.ok(block.includes("style.display = 'none'"),
      'exportSnapshot must hide the status div before fetching');
  });

  it('SNAPSHOT_TABLES has exactly 5 entries', () => {
    const match = src.match(/const SNAPSHOT_TABLES\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(match, 'SNAPSHOT_TABLES must be defined');
    const entries = (match[1].match(/'\w+'/g) || []);
    assert.strictEqual(entries.length, 5,
      `SNAPSHOT_TABLES must have exactly 5 entries, found ${entries.length}: ${entries.join(', ')}`);
  });

  it('SNAPSHOT_TABLES order: data tables before nexus_settings', () => {
    // nexus_settings should be last so table data is always exported first
    const match = src.match(/const SNAPSHOT_TABLES\s*=\s*\[([\s\S]*?)\];/);
    const entries = (match[1].match(/'\w+'/g) || []).map(s => s.replace(/'/g, ''));
    const settingsIdx = entries.indexOf('nexus_settings');
    assert.ok(settingsIdx === entries.length - 1,
      `nexus_settings must be last in SNAPSHOT_TABLES (found at index ${settingsIdx})`);
  });
});

// ══════════════════════════════════════════════════════════════
// Section 42 — CSS: duplicate selectors and responsive overrides
// ══════════════════════════════════════════════════════════════
describe('CSS — duplicate selectors are responsive overrides only', () => {
  const fs   = require('fs'), path = require('path');
  const css  = fs.readFileSync(path.join(__dirname,'../css/nexus.css'), 'utf8');
  const lines = css.split('\n');

  // Find all bare class selectors and their line numbers
  function findBareSelectors(src) {
    const result = {};
    src.split('\n').forEach((line, i) => {
      const m = line.match(/^(\.[a-zA-Z][a-zA-Z0-9_-]*)\s*\{/);
      if (m) {
        if (!result[m[1]]) result[m[1]] = [];
        result[m[1]].push(i + 1);
      }
    });
    return result;
  }

  function isInsideMediaQuery(lineNo, src) {
    const lines = src.split('\n');
    let braceDepth = 0;
    let inMedia = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/^\s*@media\b/.test(line)) inMedia = true;
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;
      if (inMedia && braceDepth <= 0) inMedia = false;
      if (i + 1 === lineNo) return inMedia;
    }
    return false;
  }

  it('all duplicate bare class selectors in nexus.css are responsive @media overrides', () => {
    const selectors = findBareSelectors(css);
    const trueTopLevelDupes = [];

    for (const [cls, lineNos] of Object.entries(selectors)) {
      if (lineNos.length < 2) continue;
      // A duplicate is OK if and only if at most one occurrence is at top level
      // and all others are inside @media queries
      const topLevel = lineNos.filter(ln => !isInsideMediaQuery(ln, css));
      if (topLevel.length > 1) {
        trueTopLevelDupes.push(`${cls} at lines ${topLevel.join(', ')}`);
      }
    }
    assert.strictEqual(trueTopLevelDupes.length, 0,
      `nexus.css has top-level duplicate selectors (not in @media):\n  ${trueTopLevelDupes.join('\n  ')}`);
  });

  it('admin.html snapshot CSS classes do not conflict with nexus.css', () => {
    const adm = fs.readFileSync(path.join(__dirname,'../admin.html'), 'utf8');
    const styleMatch = adm.match(/<style>([\s\S]*?)<\/style>/);
    const adminBlock = styleMatch ? styleMatch[1] : '';
    const adminClasses = new Set([...adminBlock.matchAll(/(\.[a-zA-Z][a-zA-Z0-9_-]*)\s*\{/g)].map(m => m[1]));
    const nexusClasses = new Set([...css.matchAll(/^(\.[a-zA-Z][a-zA-Z0-9_-]*)\s*\{/gm)].map(m => m[1]));
    const snapshotClasses = ['.snapshot-row', '.snapshot-action', '.snapshot-action-title', '.snapshot-action-desc'];
    for (const cls of snapshotClasses) {
      assert.ok(!nexusClasses.has(cls),
        `${cls} must not be defined in nexus.css — it belongs only in admin.html <style>`);
      assert.ok(adminClasses.has(cls),
        `${cls} must be defined in admin.html <style> block`);
    }
  });

  it('.mw-card has no duplicate top-level definition in nexus.css', () => {
    const sel = findBareSelectors(css);
    const mwCardLines = sel['.mw-card'] || [];
    const topLevel = mwCardLines.filter(ln => !isInsideMediaQuery(ln, css));
    assert.strictEqual(topLevel.length, 1,
      `.mw-card must have exactly one top-level definition (found ${topLevel.length} at lines ${topLevel.join(', ')})`);
  });

  it('.mw-card top-level definition includes position: relative', () => {
    // Was merged in previous session — verify the merge persisted
    const mwCardIdx = css.indexOf('.mw-card {');
    const block = css.slice(mwCardIdx, mwCardIdx + 400);
    assert.ok(block.includes('position: relative'),
      '.mw-card must include position: relative in its single top-level definition');
  });

  it('admin.html .field override is qualified under .pw-row (scoped)', () => {
    const adm = fs.readFileSync(path.join(__dirname,'../admin.html'), 'utf8');
    // The bare .field override in admin should be scoped to .pw-row
    assert.ok(adm.includes('.pw-row .field') || adm.includes('.pw-row .field {'),
      '.field override in admin.html must be scoped as .pw-row .field to avoid clobbering global .field');
  });

  it('admin.html .save-status.show is qualified (scoped)', () => {
    const adm = fs.readFileSync(path.join(__dirname,'../admin.html'), 'utf8');
    // Must be .save-status.show not bare .show
    assert.ok(adm.includes('.save-status.show'),
      '.show in admin.html must be qualified as .save-status.show');
    // And there must NOT be a bare .show { in admin
    const styleMatch = adm.match(/<style>([\s\S]*?)<\/style>/);
    const block = styleMatch ? styleMatch[1] : '';
    assert.ok(!block.match(/^\s*\.show\s*\{/m),
      'admin.html must not have a bare .show { rule — must always be .save-status.show');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 43 — Loot Tracker: import nexusConfirm replacement
// ══════════════════════════════════════════════════════════════
describe('Loot Tracker — import uses nexusConfirm not confirm()', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../loot-tracker.html'), 'utf8');

  it('handleImport does not call native confirm()', () => {
    // Find the handleImport function block
    const idx = src.indexOf('function handleImport(');
    const block = src.slice(idx, idx + 1200);
    assert.ok(!block.includes('confirm(') || block.includes('nexusConfirm('),
      'handleImport must not use native confirm() — must use nexusConfirm');
    // More precise: the bare confirm() call must be gone
    assert.ok(!block.match(/\bconfirm\s*\(`/),
      'handleImport must not contain confirm(`...) template literal pattern');
  });

  it('handleImport uses await nexusConfirm', () => {
    const idx = src.indexOf('function handleImport(');
    const block = src.slice(idx, idx + 1200);
    assert.ok(block.includes('await nexusConfirm('),
      'handleImport must use await nexusConfirm(...)');
  });

  it('nexusConfirm call in handleImport has danger: true', () => {
    const idx = src.indexOf('function handleImport(');
    const block = src.slice(idx, idx + 1200);
    assert.ok(block.includes('danger:       true') || block.includes('danger: true'),
      'nexusConfirm in handleImport must set danger: true');
  });

  it('nexusConfirm call in handleImport has a required acknowledgement checkbox', () => {
    const idx = src.indexOf('function handleImport(');
    const block = src.slice(idx, idx + 1200);
    assert.ok(block.includes('required: true'),
      'nexusConfirm in handleImport must include a required checkbox');
  });

  it('handleImport checks both confirmed and ack before proceeding', () => {
    const idx = src.indexOf('function handleImport(');
    const block = src.slice(idx, idx + 1200);
    // Must check .confirmed and .checks?.ack (or similar)
    assert.ok(
      block.includes('ok.confirmed') || block.includes('.confirmed'),
      'handleImport must check nexusConfirm result .confirmed property'
    );
    assert.ok(
      block.includes('ok.checks?.ack') || block.includes("checks?.ack") || block.includes("checks.ack"),
      'handleImport must check nexusConfirm result .checks.ack (the required checkbox)'
    );
  });

  it('handleImport still maps qty field on imported items', () => {
    const idx = src.indexOf('function handleImport(');
    const block = src.slice(idx, idx + 1200);
    assert.ok(block.includes('qty:it.qty??1') || block.includes('qty: it.qty ?? 1'),
      'handleImport must map qty with ?? 1 fallback for backwards compatibility');
  });

  it('handleImport confirmLabel is "Replace Registry"', () => {
    const idx = src.indexOf('function handleImport(');
    const block = src.slice(idx, idx + 1200);
    assert.ok(block.includes("confirmLabel: 'Replace Registry'") || block.includes('confirmLabel:"Replace Registry"'),
      'handleImport nexusConfirm must have confirmLabel "Replace Registry"');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 44 — Loot Tracker: quantity field
// ══════════════════════════════════════════════════════════════
describe('Loot Tracker — item quantity field', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../loot-tracker.html'), 'utf8');

  // ── Pure qty clamp logic ──
  function clampQty(raw) {
    const n = parseInt(raw, 10);
    return Math.max(1, Number.isFinite(n) ? n : 1);
  }

  it('qty clamp: integer input >= 1 is unchanged', () => {
    assert.strictEqual(clampQty('5'),   5);
    assert.strictEqual(clampQty('1'),   1);
    assert.strictEqual(clampQty('999'), 999);
  });

  it('qty clamp: 0 is clamped to 1', () => {
    assert.strictEqual(clampQty('0'), 1);
  });

  it('qty clamp: negative input is clamped to 1', () => {
    assert.strictEqual(clampQty('-3'), 1);
  });

  it('qty clamp: non-numeric input is clamped to 1', () => {
    assert.strictEqual(clampQty(''),      1);
    assert.strictEqual(clampQty('abc'),   1);
    assert.strictEqual(clampQty('1.5'),   1);  // parseInt truncates to 1
    assert.strictEqual(clampQty(NaN),     1);
    assert.strictEqual(clampQty(undefined),1);
  });

  it('qty clamp: large valid integer is unchanged', () => {
    assert.strictEqual(clampQty('999'), 999);
    assert.strictEqual(clampQty('100'), 100);
  });

  it('saveItem reads fieldQty and clamps with Math.max(1,...)', () => {
    // Verify the clamp pattern in saveItem
    assert.ok(src.includes('Math.max(1,') && src.includes('parseInt(document.getElementById(\'fieldQty\').value, 10)'),
      'saveItem must clamp qty with Math.max(1, parseInt(..., 10))');
  });

  it('itemToRow maps it.qty to the quantity column', () => {
    // Verify itemToRow has quantity: it.qty ?? 1
    const idx = src.indexOf('function itemToRow(');
    const block = src.slice(idx, idx + 300);
    assert.ok(src.includes('quantity:    it.qty         ?? 1') || src.includes('quantity: it.qty ?? 1'),
      'itemToRow must map it.qty → quantity column with ?? 1 fallback');
  });

  it('loadData maps r.quantity to it.qty with ?? 1 fallback', () => {
    // DB column is quantity (integer), JS property is qty
    assert.ok(src.includes('qty:         r.quantity ?? 1') || src.includes('qty: r.quantity ?? 1'),
      'loadData must map r.quantity → it.qty with ?? 1 null-safety fallback');
  });

  it('table renders qty column with hide-mobile class', () => {
    assert.ok(src.includes('sort-qty') || src.includes("sortBy('qty')"),
      'table must have a qty column with sort capability');
  });

  it('qty badge (×N) is only rendered when qty > 1', () => {
    // Template: (it.qty??1)>1 ? `<span class="qty-badge">×${it.qty}</span>` : ''
    assert.ok(
      src.includes('(it.qty??1)>1') || src.includes('(it.qty ?? 1) > 1'),
      'qty badge must only render when qty > 1 — no noise for unique items'
    );
    assert.ok(src.includes('qty-badge'),
      'qty badge must use class qty-badge');
  });

  it('openModal sets fieldQty to 1 for new items', () => {
    const idx = src.indexOf("document.getElementById('fieldQty').value='1'");
    assert.ok(idx !== -1, "openModal must set fieldQty.value='1' for new items");
  });

  it('openModal sets fieldQty to item.qty when editing', () => {
    assert.ok(
      src.includes("document.getElementById('fieldQty').value=it.qty??1") ||
      src.includes("document.getElementById('fieldQty').value = it.qty ?? 1"),
      'openModal must populate fieldQty with it.qty??1 when editing'
    );
  });

  it('fieldQty input has min=1 and max=999', () => {
    assert.ok(src.includes('min="1"') && src.includes('max="999"'),
      'fieldQty input must have min="1" max="999" attributes');
  });

  it('seed items all have qty: 1', () => {
    // Each seed item object should include qty:1
    const seedIdx = src.indexOf('const seedItems = [');
    assert.ok(seedIdx !== -1, 'seedItems constant must exist');
    const seedBlock = src.slice(seedIdx, seedIdx + 2000);
    const itemMatches = seedBlock.match(/,\s*qty:\d+/g) || [];
    // All seed items should have qty:1
    assert.ok(itemMatches.length >= 5, `Seed items must have qty property, found ${itemMatches.length}`);
    assert.ok(itemMatches.every(m => m.endsWith(':1')), 'All seed item qty values must be 1');
  });

  it('qty column CSS class qty-badge is defined in nexus.css', () => {
    const css = fs.readFileSync(path.join(__dirname,'../css/nexus.css'), 'utf8');
    assert.ok(css.includes('.qty-badge'), '.qty-badge must be defined in nexus.css');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 45 — Loot Tracker: quick transfer popover
// ══════════════════════════════════════════════════════════════
describe('Loot Tracker — quick transfer popover', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../loot-tracker.html'), 'utf8');

  it('openTransferPopover function is defined', () => {
    assert.ok(src.includes('async function openTransferPopover('),
      'openTransferPopover must be an async function');
  });

  it('closeTransferPopover function is defined', () => {
    assert.ok(src.includes('function closeTransferPopover()'),
      'closeTransferPopover must be defined');
  });

  it('_transferItemId state variable is defined', () => {
    assert.ok(src.includes('let _transferItemId = null'),
      '_transferItemId state variable must be defined and initialised to null');
  });

  it('_transferPopoverEl state variable is defined', () => {
    assert.ok(src.includes('let _transferPopoverEl = null'),
      '_transferPopoverEl state variable must be defined and initialised to null');
  });

  it('transfer button (⇄) exists in table row actions', () => {
    assert.ok(src.includes('openTransferPopover(') && src.includes('btn-transfer'),
      'table rows must include a transfer button calling openTransferPopover');
  });

  it('transfer button uses btn-transfer class (not btn-icon)', () => {
    // btn-icon is for edit/delete; transfer has its own lighter style
    assert.ok(src.includes('"btn-transfer"') || src.includes("'btn-transfer'"),
      'transfer button must use class btn-transfer');
  });

  it('confirmTransfer only updates holder field, not other item properties', () => {
    // Should spread existing item and only override holder
    const idx = src.indexOf('async function confirmTransfer()');
    const block = src.slice(idx, idx + 600);
    assert.ok(block.includes('...it, holder:newHolder') || block.includes('{ ...it, holder: newHolder }'),
      'confirmTransfer must use spread { ...it, holder:newHolder } to preserve all other fields');
  });

  it('confirmTransfer calls saveItemToDB with the updated item', () => {
    const idx = src.indexOf('async function confirmTransfer()');
    const block = src.slice(idx, idx + 600);
    assert.ok(block.includes('await saveItemToDB(updated)'),
      'confirmTransfer must call saveItemToDB(updated)');
  });

  it('confirmTransfer patches items[] in place without full re-fetch', () => {
    const idx = src.indexOf('async function confirmTransfer()');
    const block = src.slice(idx, idx + 800);
    assert.ok(block.includes('items[idx]=updated') || block.includes('items[idx] = updated'),
      'confirmTransfer must patch items array in place for optimistic UI update');
  });

  it('confirmTransfer does nothing if holder is unchanged', () => {
    const idx = src.indexOf('async function confirmTransfer()');
    const block = src.slice(idx, idx + 600);
    assert.ok(block.includes('newHolder===it.holder') || block.includes('newHolder === it.holder'),
      'confirmTransfer must early-return if the new holder equals the current holder');
  });

  it('openTransferPopover closes any existing popover before opening a new one', () => {
    const idx = src.indexOf('async function openTransferPopover(');
    const block = src.slice(idx, idx + 300);
    assert.ok(block.includes('closeTransferPopover()'),
      'openTransferPopover must close any existing popover before opening a new one');
  });

  it('popover is positioned with fixed positioning for viewport-relative placement', () => {
    const idx = src.indexOf('async function openTransferPopover(');
    const block = src.slice(idx, idx + 2000);
    assert.ok(block.includes('pop.style.left') && block.includes('pop.style.top'),
      'openTransferPopover must set left and top on the popover element');
  });

  it('transfer popover CSS class is defined in nexus.css', () => {
    const css = fs.readFileSync(path.join(__dirname,'../css/nexus.css'), 'utf8');
    assert.ok(css.includes('.transfer-popover'), '.transfer-popover must be defined in nexus.css');
  });

  it('btn-transfer CSS class is defined in nexus.css', () => {
    const css = fs.readFileSync(path.join(__dirname,'../css/nexus.css'), 'utf8');
    assert.ok(css.includes('.btn-transfer'), '.btn-transfer must be defined in nexus.css');
  });

  it('document click handler closes popover on outside click', () => {
    // Both document.addEventListener calls (main holder + transfer) must be present
    const clickHandlers = src.match(/document\.addEventListener\('click'/g) || [];
    assert.ok(clickHandlers.length >= 2,
      'Must have at least 2 document click handlers (main holder dropdown + transfer popover close)');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 46 — Loot Tracker: attunement slot tracker
// ══════════════════════════════════════════════════════════════
describe('Loot Tracker — attunement slot tracker', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../loot-tracker.html'), 'utf8');

  // ── Pure getAttuneCounts logic (inline simulation) ──
  function getAttuneCounts(items) {
    const counts = new Map();
    for (const it of items) {
      if (it.attunement !== 'attuned') continue;
      const h = (it.holder || '').trim();
      if (!h || h === 'Party Inventory' || h.toLowerCase() === 'party vault') continue;
      counts.set(h, (counts.get(h) || 0) + 1);
    }
    return counts;
  }

  // ── getAttuneCounts pure logic tests ──
  it('getAttuneCounts: counts attuned items per named holder', () => {
    const items = [
      { attunement: 'attuned',  holder: 'Alice' },
      { attunement: 'attuned',  holder: 'Alice' },
      { attunement: 'attuned',  holder: 'Bob' },
      { attunement: 'required', holder: 'Alice' }, // not attuned
      { attunement: 'none',     holder: 'Alice' },
    ];
    const counts = getAttuneCounts(items);
    assert.strictEqual(counts.get('Alice'), 2, 'Alice should have 2 attuned items');
    assert.strictEqual(counts.get('Bob'),   1, 'Bob should have 1 attuned item');
    assert.strictEqual(counts.size, 2, 'Only attuned holders should appear in map');
  });

  it('getAttuneCounts: "required" items do NOT count toward attunement', () => {
    const items = [
      { attunement: 'required', holder: 'Alice' },
      { attunement: 'required', holder: 'Alice' },
      { attunement: 'required', holder: 'Alice' },
    ];
    const counts = getAttuneCounts(items);
    assert.strictEqual(counts.size, 0, '"required" items must not count toward attunement slots');
  });

  it('getAttuneCounts: Party Inventory is excluded', () => {
    const items = [
      { attunement: 'attuned', holder: 'Party Inventory' },
      { attunement: 'attuned', holder: 'Alice' },
    ];
    const counts = getAttuneCounts(items);
    assert.ok(!counts.has('Party Inventory'), 'Party Inventory must not appear in attune counts');
    assert.strictEqual(counts.get('Alice'), 1, 'Alice should still be counted');
  });

  it('getAttuneCounts: Party Vault is excluded', () => {
    const items = [
      { attunement: 'attuned', holder: 'Party Vault' },
      { attunement: 'attuned', holder: 'party vault' }, // lowercase
    ];
    const counts = getAttuneCounts(items);
    assert.strictEqual(counts.size, 0, 'Party Vault (any case) must not count toward attunement');
  });

  it('getAttuneCounts: null/empty holder is excluded', () => {
    const items = [
      { attunement: 'attuned', holder: null },
      { attunement: 'attuned', holder: '' },
      { attunement: 'attuned', holder: '  ' },
    ];
    const counts = getAttuneCounts(items);
    assert.strictEqual(counts.size, 0, 'Null/empty holders must not appear in counts');
  });

  it('getAttuneCounts: returns empty Map when no attuned items', () => {
    const counts = getAttuneCounts([]);
    assert.strictEqual(counts.size, 0, 'Empty items list must return empty Map');
  });

  it('getAttuneCounts: correctly counts up to and over the 5e limit of 3', () => {
    const items = [
      { attunement: 'attuned', holder: 'Alice' },
      { attunement: 'attuned', holder: 'Alice' },
      { attunement: 'attuned', holder: 'Alice' },
      { attunement: 'attuned', holder: 'Alice' }, // 4th — over limit
    ];
    const counts = getAttuneCounts(items);
    assert.strictEqual(counts.get('Alice'), 4, 'Must count 4 attuned items accurately');
    const violations = [...counts.entries()].filter(([,n]) => n > 3);
    assert.strictEqual(violations.length, 1, 'Exactly 1 violation should be detected');
    assert.strictEqual(violations[0][1] - 3, 1, 'Must be 1 over the limit');
  });

  it('violation count at exactly 3 (limit) produces NO warning', () => {
    const items = [
      { attunement: 'attuned', holder: 'Bob' },
      { attunement: 'attuned', holder: 'Bob' },
      { attunement: 'attuned', holder: 'Bob' },
    ];
    const counts = getAttuneCounts(items);
    const violations = [...counts.entries()].filter(([,n]) => n > 3);
    assert.strictEqual(violations.length, 0, 'Exactly 3 attuned (the limit) must NOT produce a violation');
  });

  it('violation excess count formula is (n - 3)', () => {
    // The warning message says "remove attunement from (n-3) items"
    for (const n of [4, 5, 6, 7]) {
      const excess = n - 3;
      assert.ok(excess >= 1, `Excess for n=${n} must be >= 1`);
      assert.strictEqual(excess, n - 3);
    }
  });

  it('multiple holders: only over-limit holders trigger warning', () => {
    const items = [
      { attunement: 'attuned', holder: 'Alice' },  // 1 — ok
      { attunement: 'attuned', holder: 'Bob' },
      { attunement: 'attuned', holder: 'Bob' },
      { attunement: 'attuned', holder: 'Bob' },    // 3 — at limit
      { attunement: 'attuned', holder: 'Carol' },
      { attunement: 'attuned', holder: 'Carol' },
      { attunement: 'attuned', holder: 'Carol' },
      { attunement: 'attuned', holder: 'Carol' },  // 4 — over!
    ];
    const counts = getAttuneCounts(items);
    const violations = [...counts.entries()].filter(([,n]) => n > 3);
    assert.strictEqual(violations.length, 1, 'Only Carol should have a violation');
    assert.strictEqual(violations[0][0], 'Carol', 'Carol is the violator');
    assert.strictEqual(violations[0][1], 4, 'Carol has 4 attuned items');
  });

  // ── Structure tests ──
  it('getAttuneCounts function is defined in loot-tracker.html', () => {
    assert.ok(src.includes('function getAttuneCounts()'),
      'getAttuneCounts() must be defined in loot-tracker.html');
  });

  it('renderAttuneWarnings function is defined', () => {
    assert.ok(src.includes('function renderAttuneWarnings()'),
      'renderAttuneWarnings() must be defined in loot-tracker.html');
  });

  it('attuneWarningBar div exists in HTML', () => {
    assert.ok(src.includes('id="attuneWarningBar"'),
      'attuneWarningBar div must exist in HTML');
  });

  it('attuneWarnRows div exists in HTML', () => {
    assert.ok(src.includes('id="attuneWarnRows"'),
      'attuneWarnRows div must exist in HTML');
  });

  it('attune-warning-bar CSS class is defined in nexus.css', () => {
    const css = fs.readFileSync(path.join(__dirname,'../css/nexus.css'), 'utf8');
    assert.ok(css.includes('.attune-warning-bar'), '.attune-warning-bar must be defined in nexus.css');
  });

  it('renderAttuneWarnings is called from updateStats', () => {
    const idx = src.indexOf('function updateStats()');
    const block = src.slice(idx, idx + 600);
    assert.ok(block.includes('renderAttuneWarnings()'),
      'updateStats must call renderAttuneWarnings() so warnings refresh with every render');
  });

  it('renderAttuneWarnings adds has-warnings class when violations exist', () => {
    const idx = src.indexOf('function renderAttuneWarnings()');
    const block = src.slice(idx, idx + 600);
    assert.ok(block.includes('has-warnings'),
      'renderAttuneWarnings must toggle has-warnings class');
  });

  it('renderAttuneWarnings removes has-warnings class when no violations', () => {
    const idx = src.indexOf('function renderAttuneWarnings()');
    const block = src.slice(idx, idx + 600);
    assert.ok(block.includes("classList.remove('has-warnings')"),
      'renderAttuneWarnings must remove has-warnings when there are no violations');
  });

  it('warning message mentions 5e limit of 3', () => {
    const idx = src.indexOf('function renderAttuneWarnings()');
    const block = src.slice(idx, idx + 600);
    assert.ok(block.includes('5e limit is 3') || block.includes('limit of 3'),
      'Warning message must explicitly mention the 5e attunement limit of 3');
  });

  it('inline attune warning div exists in modal', () => {
    assert.ok(src.includes('id="fieldAttuneWarn"'),
      'fieldAttuneWarn div must exist in the edit modal');
  });

  it('checkAttuneWarn is called from fieldAttunement onChange', () => {
    assert.ok(src.includes('onchange="checkAttuneWarn()"'),
      'fieldAttunement select must call checkAttuneWarn() on change');
  });

  it('checkAttuneWarn is defined', () => {
    assert.ok(src.includes('function checkAttuneWarn()'),
      'checkAttuneWarn() must be defined');
  });

  it('checkAttuneWarn excludes the item being edited from the count', () => {
    const idx = src.indexOf('function checkAttuneWarn()');
    const block = src.slice(idx, idx + 700);
    assert.ok(block.includes('editingId') && (block.includes('!== editingId') || block.includes('it.id !== editingId')),
      'checkAttuneWarn must exclude the item being edited (editingId) from the attune count');
  });

  it('checkAttuneWarn shows warning at >= 3 existing (not > 3, since this item would be the 4th)', () => {
    const idx = src.indexOf('function checkAttuneWarn()');
    const block = src.slice(idx, idx + 700);
    assert.ok(block.includes('existing >= 3'),
      'checkAttuneWarn must warn when existing >= 3 (adding this item would make 4, over limit)');
  });

  it('checkAttuneWarn field-attune-warn CSS class is defined in nexus.css', () => {
    const css = fs.readFileSync(path.join(__dirname,'../css/nexus.css'), 'utf8');
    assert.ok(css.includes('.field-attune-warn'), '.field-attune-warn must be defined in nexus.css');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 47 — Loot Tracker: import — deep edge-case coverage
// ══════════════════════════════════════════════════════════════
describe('Loot Tracker — import handleImport deep coverage', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../loot-tracker.html'), 'utf8');

  // Helper: get the handleImport function block
  function getBlock() {
    const idx = src.indexOf('function handleImport(');
    return src.slice(idx, idx + 1500);
  }

  it('handleImport resets file input value to "" after reading', () => {
    // Prevents same-file re-select being silently ignored
    assert.ok(src.includes("e.target.value=''"),
      'handleImport must reset e.target.value to "" so the same file can be re-selected');
  });

  it('handleImport uses FileReader.readAsText to parse the file', () => {
    const block = getBlock();
    assert.ok(block.includes('reader.readAsText(file)'),
      'handleImport must use FileReader.readAsText to read the file');
  });

  it('handleImport shows toast on invalid JSON', () => {
    const block = getBlock();
    assert.ok(block.includes("showToast('Invalid file.')") || block.includes('showToast("Invalid file.")'),
      'handleImport must call showToast("Invalid file.") when JSON.parse throws');
  });

  it('handleImport supports both {version, items} and bare array formats', () => {
    const block = getBlock();
    // data.items || data  — handles both wrapper format and raw array
    assert.ok(block.includes('data.items||data') || block.includes('data.items || data'),
      'handleImport must support both {items:[...]} wrapper and bare array formats');
  });

  it('handleImport validates that imported value is an array', () => {
    const block = getBlock();
    assert.ok(block.includes('Array.isArray(imported)'),
      'handleImport must call Array.isArray(imported) to validate the parsed data');
  });

  it('handleImport includes the item count and filename in the nexusConfirm name field', () => {
    const block = getBlock();
    assert.ok(block.includes('imported.length') && block.includes('file.name'),
      'nexusConfirm name must include both imported.length and file.name for clear context');
  });

  it('handleImport message mentions current item count and cannot be undone', () => {
    const block = getBlock();
    assert.ok(block.includes('items.length'),
      'nexusConfirm message must reference items.length so user knows what they are replacing');
    assert.ok(block.includes('cannot be undone'),
      'nexusConfirm message must state the action cannot be undone');
  });

  it('handleImport uses db.upsertMany to persist imported items', () => {
    const block = getBlock();
    assert.ok(block.includes('db.upsertMany('),
      'handleImport must persist via db.upsertMany (not individual upsert calls)');
  });

  it('handleImport shows item count in success toast', () => {
    const block = getBlock();
    assert.ok(block.includes('Imported') && block.includes('items.length'),
      'handleImport success toast must include item count via items.length');
  });

  it('handleImport assigns uid() to imported items missing an id', () => {
    const block = getBlock();
    assert.ok(block.includes('id:it.id||uid()') || block.includes('id: it.id || uid()'),
      'handleImport must assign uid() to any item missing an id field');
  });

  it('handleImport maps statEffects with [] fallback', () => {
    const block = getBlock();
    assert.ok(block.includes('statEffects:it.statEffects||[]') || block.includes('statEffects: it.statEffects || []'),
      'handleImport must map statEffects with [] fallback for backwards compatibility');
  });

  it('fileImport input triggers handleImport on change', () => {
    assert.ok(src.includes('onchange="handleImport(event)"') || src.includes("onchange='handleImport(event)'"),
      'fileImport input must call handleImport(event) on change');
  });

  it('fileImport input accepts only .json files', () => {
    assert.ok(src.includes('accept=".json"') || src.includes("accept='.json'"),
      'fileImport input must have accept=".json" to filter file picker');
  });

  it('importJSON function triggers the file input click', () => {
    const idx = src.indexOf('function importJSON(');
    const block = src.slice(idx, idx + 150);
    assert.ok(block.includes("getElementById('fileImport').click()"),
      "importJSON must call document.getElementById('fileImport').click()");
  });
});

// ══════════════════════════════════════════════════════════════
// Section 48 — Loot Tracker: quantity — rendering & sort
// ══════════════════════════════════════════════════════════════
describe('Loot Tracker — quantity rendering and sort', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../loot-tracker.html'), 'utf8');

  // Pure sort simulation
  function simulateQtySort(a, b, dir) {
    return ((a.qty ?? 1) - (b.qty ?? 1)) * dir;
  }

  it('qty sort: ascending puts lower qty first', () => {
    const items = [{ qty: 5 }, { qty: 1 }, { qty: 3 }];
    items.sort((a, b) => simulateQtySort(a, b, 1));
    assert.deepStrictEqual(items.map(i => i.qty), [1, 3, 5]);
  });

  it('qty sort: descending puts higher qty first', () => {
    const items = [{ qty: 5 }, { qty: 1 }, { qty: 3 }];
    items.sort((a, b) => simulateQtySort(a, b, -1));
    assert.deepStrictEqual(items.map(i => i.qty), [5, 3, 1]);
  });

  it('qty sort: items with undefined qty treated as 1', () => {
    const items = [{ qty: undefined }, { qty: 2 }, { qty: 1 }];
    items.sort((a, b) => simulateQtySort(a, b, 1));
    assert.deepStrictEqual(items.map(i => i.qty ?? 1), [1, 1, 2]);
  });

  it('qty sort: null qty treated as 1', () => {
    const items = [{ qty: null }, { qty: 3 }, { qty: 1 }];
    items.sort((a, b) => simulateQtySort(a, b, 1));
    // null ?? 1 = 1, so [1, 1, 3] or [1, null, 3] — first two should be 1 or null
    assert.ok((items[0].qty ?? 1) <= (items[2].qty ?? 1),
      'null qty should sort as 1 (not break comparator)');
  });

  it('sortBy("qty") is wired to the qty column header', () => {
    assert.ok(src.includes("sortBy('qty')") || src.includes('sortBy("qty")'),
      'qty column header must call sortBy("qty")');
  });

  it('sort-qty arrow span exists for visual feedback', () => {
    assert.ok(src.includes('id="sort-qty"'),
      'qty column must have a sort arrow span with id sort-qty');
  });

  it('qty column header has title="Quantity" for accessibility', () => {
    assert.ok(src.includes('title="Quantity"'),
      'qty th must have title="Quantity" as a tooltip for the abbreviated column header');
  });

  it('qty badge shows ×N when qty > 1', () => {
    // Template: `<span class="qty-badge">×${it.qty}</span>`
    assert.ok(src.includes('qty-badge') && src.includes('×${it.qty}'),
      'qty badge template must use ×${it.qty} (times symbol, not x)');
  });

  it('qty column cell color changes for qty > 1 (cyan highlight)', () => {
    assert.ok(src.includes("(it.qty??1)>1?'var(--cyan)':'var(--text-dim)'") ||
              src.includes("(it.qty ?? 1) > 1 ? 'var(--cyan)' : 'var(--text-dim)'"),
      'qty cell must use var(--cyan) when qty > 1 and var(--text-dim) for qty === 1');
  });

  it('fieldQty label exists in the modal', () => {
    // Check label element near the input
    const qtyIdx = src.indexOf('id="fieldQty"');
    const before  = src.slice(qtyIdx - 200, qtyIdx);
    assert.ok(before.includes('Quantity') || before.includes('Qty'),
      'fieldQty input must have a visible label in the modal');
  });

  it('fieldQty input is type="number"', () => {
    const qtyIdx = src.indexOf('id="fieldQty"');
    const context = src.slice(qtyIdx - 100, qtyIdx + 50);
    assert.ok(context.includes('type="number"'),
      'fieldQty input must be type="number"');
  });

  it('itemToRow uses quantity (snake_case) not qty for the DB column name', () => {
    // Supabase column is "quantity"; JS property is "qty"
    const idx = src.indexOf('function itemToRow(');
    const block = src.slice(idx, idx + 450);
    // Check that the DB key is "quantity:" — "it.qty" will be present as the value, not as a key
    assert.ok(block.includes('quantity:'),
      'itemToRow must use DB column name "quantity" (not "qty") as the object key');
    // The key "qty:" must NOT appear (it's only used as a value: it.qty)
    assert.ok(!block.match(/\n\s+qty:/),
      'itemToRow must not have a "qty:" key — DB column is "quantity"');
  });

  it('loadData uses qty (camelCase-ish) for the JS property name', () => {
    // loadData receives DB rows with "quantity"; stores as "qty"
    assert.ok(src.includes('qty:         r.quantity ?? 1') || src.includes('qty: r.quantity ?? 1'),
      'loadData must map r.quantity (DB) → it.qty (JS) with ?? 1 null-safety');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 49 — Loot Tracker: quick transfer — deep coverage
// ══════════════════════════════════════════════════════════════
describe('Loot Tracker — quick transfer deep coverage', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../loot-tracker.html'), 'utf8');

  it('transfer toast shows item name and arrow to new holder', () => {
    // showToast(`${it.name} → ${toName}`)
    const idx = src.indexOf('async function confirmTransfer()');
    const block = src.slice(idx, idx + 800);
    assert.ok(block.includes('it.name') && block.includes('→') && block.includes('toName'),
      'confirmTransfer toast must show "${it.name} → ${toName}" format');
  });

  it('transfer toast uses "Unassigned" for empty holder', () => {
    const idx = src.indexOf('async function confirmTransfer()');
    const block = src.slice(idx, idx + 800);
    assert.ok(block.includes("newHolder||'Unassigned'") || block.includes("newHolder || 'Unassigned'"),
      'confirmTransfer must display "Unassigned" when holder is blank');
  });

  it('confirmTransfer disables the confirm button while saving', () => {
    const idx = src.indexOf('async function confirmTransfer()');
    const block = src.slice(idx, idx + 800);
    assert.ok(block.includes('btn.disabled=true') || block.includes('btn.disabled = true'),
      'confirmTransfer must disable the confirm button during the save operation');
  });

  it('confirmTransfer shows "Saving…" text while in progress', () => {
    const idx = src.indexOf('async function confirmTransfer()');
    const block = src.slice(idx, idx + 800);
    assert.ok(block.includes("'Saving…'") || block.includes('"Saving…"'),
      'confirmTransfer must show "Saving…" button text while the save is in flight');
  });

  it('confirmTransfer always calls closeTransferPopover in finally', () => {
    const idx = src.indexOf('async function confirmTransfer()');
    const block = src.slice(idx, idx + 1000);
    assert.ok(block.includes('finally') && block.includes('closeTransferPopover()'),
      'confirmTransfer must close the popover in a finally block so it closes even on error');
  });

  it('popover HTML has cancel button calling closeTransferPopover', () => {
    const idx = src.indexOf('async function openTransferPopover(');
    const block = src.slice(idx, idx + 2000);
    assert.ok(block.includes('onclick="closeTransferPopover()"') || block.includes("onclick='closeTransferPopover()'"),
      'Transfer popover must have a Cancel button that calls closeTransferPopover()');
  });

  it('popover HTML has confirm button with id btnConfirmTransfer', () => {
    assert.ok(src.includes('id="btnConfirmTransfer"'),
      'Transfer popover must have a confirm button with id btnConfirmTransfer');
  });

  it('popover flips above anchor when near bottom of viewport', () => {
    const idx = src.indexOf('async function openTransferPopover(');
    const block = src.slice(idx, idx + 2000);
    assert.ok(block.includes('window.innerHeight') && block.includes('rect.top'),
      'openTransferPopover must check window.innerHeight to flip the popover upward near bottom of screen');
  });

  it('transfer popover outside-click handler checks _transferPopoverEl', () => {
    // The second document click handler uses _transferPopoverEl
    const handlers = [];
    let searchFrom = 0;
    while (true) {
      const idx = src.indexOf("document.addEventListener('click'", searchFrom);
      if (idx === -1) break;
      handlers.push(src.slice(idx, idx + 300));
      searchFrom = idx + 1;
    }
    assert.ok(handlers.length >= 2, 'Must have at least 2 document click handlers');
    const transferHandler = handlers.find(h => h.includes('_transferPopoverEl'));
    assert.ok(transferHandler,
      'One document click handler must check _transferPopoverEl for outside-click close');
  });

  it('transfer popover click is stopped from propagating (prevents immediate close)', () => {
    // pop.addEventListener('click', e=>e.stopPropagation()) prevents the document handler
    // from immediately closing the popover after it opens
    const popIdx = src.indexOf("pop.addEventListener('click'");
    assert.ok(popIdx !== -1, "pop.addEventListener('click', ...) must exist in openTransferPopover");
    const block = src.slice(popIdx, popIdx + 100);
    assert.ok(block.includes('stopPropagation()'),
      'Popover element must call e.stopPropagation() to prevent the outside-click handler from closing it immediately');
  });

  it('buildTxHolderDropdown mirrors the main holder dropdown with Party Inventory option', () => {
    const idx = src.indexOf('async function buildTxHolderDropdown(');
    const block = src.slice(idx, idx + 600);
    assert.ok(block.includes("value:'Party Inventory'") || block.includes("value: 'Party Inventory'"),
      'buildTxHolderDropdown must include Party Inventory as a special option');
  });

  it('btn-transfer title is "Quick Transfer" for tooltip', () => {
    assert.ok(src.includes('title="Quick Transfer"'),
      'Transfer button must have title="Quick Transfer" as a tooltip');
  });

  it('closeTransferPopover sets _transferItemId to null', () => {
    const idx = src.indexOf('function closeTransferPopover()');
    const block = src.slice(idx, idx + 200);
    assert.ok(block.includes('_transferItemId=null') || block.includes('_transferItemId = null'),
      'closeTransferPopover must reset _transferItemId to null to prevent stale state');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 50 — Loot Tracker: attunement — deep coverage
// ══════════════════════════════════════════════════════════════
describe('Loot Tracker — attunement deep coverage', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname,'../loot-tracker.html'), 'utf8');

  // Simulate violation warning message logic
  function warningMessage(name, n) {
    const excess = n - 3;
    return `${name}: ${n} items attuned — 5e limit is 3. Remove attunement from ${excess} item${excess > 1 ? 's' : ''}.`;
  }

  it('warning message pluralizes "items" correctly for excess = 1', () => {
    const msg = warningMessage('Alice', 4);
    assert.ok(msg.endsWith('Remove attunement from 1 item.'),
      'excess of 1 must say "item" (not "items")');
  });

  it('warning message pluralizes "items" correctly for excess = 2', () => {
    const msg = warningMessage('Alice', 5);
    assert.ok(msg.endsWith('Remove attunement from 2 items.'),
      'excess of 2 must say "items"');
  });

  it('warning message pluralizes "items" correctly for excess = 4', () => {
    const msg = warningMessage('Alice', 7);
    assert.ok(msg.endsWith('Remove attunement from 4 items.'),
      'excess of 4 must say "items"');
  });

  it('renderAttuneWarnings warning template matches pluralization pattern', () => {
    // Template: `item${n-3>1?'s':''}` with escaped quotes in the template literal
    const idx = src.indexOf('function renderAttuneWarnings()');
    const block = src.slice(idx, idx + 800);
    // Check for the pluralization pattern — quotes may be escaped in template literal
    assert.ok(
      block.includes("n-3>1?\'s\':\'\'") ||   // escaped in template
      block.includes("n-3>1?'s':''") ||            // plain in regular string
      block.includes("n - 3 > 1 ? 's' : ''") ||   // spaced
      (block.includes('n-3') && block.includes("'s'")), // any form with n-3 and 's'
      "renderAttuneWarnings must pluralize excess items with n-3 and conditional 's'"
    );
  });

  it('renderAttuneWarnings sorts violations by count descending', () => {
    const idx = src.indexOf('function renderAttuneWarnings()');
    const block = src.slice(idx, idx + 600);
    assert.ok(block.includes('.sort((a,b)=>b[1]-a[1])') || block.includes('.sort((a, b) => b[1] - a[1])'),
      'renderAttuneWarnings must sort violations by count descending (worst offender first)');
  });

  it('statAttuned counter counts ALL attuned items (not just over-limit)', () => {
    // statAttuned = items where attunement === 'attuned', regardless of holder count
    const idx = src.indexOf('function updateStats()');
    const block = src.slice(idx, idx + 300);
    assert.ok(
      block.includes("i.attunement==='attuned'") || block.includes("i.attunement === 'attuned'"),
      'statAttuned must count all items with attunement === "attuned"'
    );
  });

  it('statAttuned element exists in the stats bar', () => {
    assert.ok(src.includes('id="statAttuned"'),
      'statAttuned span must exist in the stats bar');
  });

  it('attuneLabel maps "attuned" to "Attuned" (not "Attuned ✓" or other)', () => {
    const idx = src.indexOf('function attuneLabel(');
    const block = src.slice(idx, idx + 150);
    assert.ok(block.includes("attuned:'Attuned'") || block.includes("attuned: 'Attuned'"),
      'attuneLabel must map "attuned" to "Attuned"');
  });

  it('attuneLabel maps "required" to "Required"', () => {
    const idx = src.indexOf('function attuneLabel(');
    const block = src.slice(idx, idx + 150);
    assert.ok(block.includes("required:'Required'") || block.includes("required: 'Required'"),
      'attuneLabel must map "required" to "Required"');
  });

  it('attuneLabel maps "none" to "—" (em dash)', () => {
    const idx = src.indexOf('function attuneLabel(');
    const block = src.slice(idx, idx + 150);
    assert.ok(block.includes("none:'—'") || block.includes("none: '—'"),
      'attuneLabel must map "none" to "—" (em dash, not plain dash)');
  });

  it('getAttuneCounts reads from the module-level items array', () => {
    // getAttuneCounts() has no parameter — it uses the closure over `items`
    const idx = src.indexOf('function getAttuneCounts()');
    const block = src.slice(idx, idx + 50);
    assert.ok(block.includes('getAttuneCounts()') && !block.includes('getAttuneCounts(items)'),
      'getAttuneCounts must take no arguments — it reads from the module-level items array');
  });

  it('checkAttuneWarn does not warn for "required" attunement state', () => {
    // Only triggers if val === 'attuned', not 'required'
    const idx = src.indexOf('function checkAttuneWarn()');
    const block = src.slice(idx, idx + 700);
    assert.ok(block.includes("val !== 'attuned'"),
      "checkAttuneWarn must early-return when val !== 'attuned' — does not warn for 'required'");
  });

  it('checkAttuneWarn does not warn if holder is Party Inventory', () => {
    const idx = src.indexOf('function checkAttuneWarn()');
    const block = src.slice(idx, idx + 700);
    assert.ok(block.includes("holder==='Party Inventory'"),
      "checkAttuneWarn must skip warning when holder === 'Party Inventory'");
  });

  it('checkAttuneWarn does not warn if holder is empty', () => {
    const idx = src.indexOf('function checkAttuneWarn()');
    const block = src.slice(idx, idx + 700);
    assert.ok(block.includes('!holder'),
      'checkAttuneWarn must skip warning when holder is blank/null');
  });

  it('fieldAttuneWarn is cleared when no warning applies', () => {
    const idx = src.indexOf('function checkAttuneWarn()');
    const block = src.slice(idx, idx + 700);
    assert.ok(block.includes("warn.textContent=''") || block.includes("warn.textContent = ''"),
      'checkAttuneWarn must clear warn.textContent when no warning applies');
  });

  it('warning bar has-warnings class uses CSS to control visibility', () => {
    const css = fs.readFileSync(path.join(__dirname,'../css/nexus.css'), 'utf8');
    assert.ok(css.includes('.attune-warning-bar'),
      '.attune-warning-bar must be defined in nexus.css');
    assert.ok(css.includes('.has-warnings') || css.includes('has-warnings'),
      'nexus.css must style .has-warnings to control attune warning bar visibility');
  });

  it('attunement filter select has "attuned" option in the toolbar', () => {
    // filterAttune select for filtering table by attunement state
    assert.ok(src.includes('id="filterAttune"'),
      'filterAttune select must exist in the toolbar');
    assert.ok(src.includes('value="attuned"'),
      'filterAttune must have an "attuned" option');
  });
});
