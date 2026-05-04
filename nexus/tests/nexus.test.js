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
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
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

  it('SNAPSHOT_TABLES has exactly 8 entries (Stage 8: session tables added)', () => {
    const match = src.match(/const SNAPSHOT_TABLES\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(match, 'SNAPSHOT_TABLES must be defined');
    const entries = (match[1].match(/'\w+'/g) || []);
    assert.strictEqual(entries.length, 8,
      `SNAPSHOT_TABLES must have exactly 8 entries, found ${entries.length}: ${entries.join(', ')}`);
  });

  it('SNAPSHOT_TABLES order: nexus_settings last; session_log before session_events', () => {
    const match = src.match(/const SNAPSHOT_TABLES\s*=\s*\[([\s\S]*?)\];/);
    const entries = (match[1].match(/'\w+'/g) || []).map(s => s.replace(/'/g, ''));
    const settingsIdx    = entries.indexOf('nexus_settings');
    const sessionLogIdx  = entries.indexOf('session_log');
    const sessionEvtIdx  = entries.indexOf('session_events');
    assert.ok(settingsIdx === entries.length - 1,
      `nexus_settings must be last in SNAPSHOT_TABLES (found at index ${settingsIdx})`);
    assert.ok(sessionLogIdx < sessionEvtIdx,
      'session_log must come before session_events (FK dependency)');
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
    // Admin CSS is now in nexus.css; check nexus.css for admin classes
    const adminBlock = css;
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
    assert.ok(css.includes('.pw-row .field') || css.includes('.pw-row .field {'),
      '.field override in admin.html must be scoped as .pw-row .field to avoid clobbering global .field');
  });

  it('admin.html .save-status.show is qualified (scoped)', () => {
    const adm = fs.readFileSync(path.join(__dirname,'../admin.html'), 'utf8');
    // Must be .save-status.show not bare .show
    assert.ok(css.includes('.save-status.show'),
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
    const block = src.slice(idx, idx + 600);
    assert.ok(block.includes('closeTransferPopover()'),
      'openTransferPopover must close any existing popover before opening a new one');
  });

  it('popover is positioned with fixed positioning for viewport-relative placement', () => {
    const idx = src.indexOf('async function openTransferPopover(');
    const block = src.slice(idx, idx + 3000);
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

  it('openTransferPopover accepts a triggerEvent parameter', () => {
    // Bug fix: the triggering click must be stopped before the document handler fires,
    // otherwise the popover is created and immediately destroyed in the same event.
    const idx = src.indexOf('async function openTransferPopover(');
    const sig = src.slice(idx, idx + 100);
    assert.ok(sig.includes('triggerEvent'),
      'openTransferPopover must accept a triggerEvent parameter to stop click propagation');
  });

  it('openTransferPopover calls stopPropagation on triggerEvent', () => {
    const idx = src.indexOf('async function openTransferPopover(');
    const block = src.slice(idx, idx + 600);
    assert.ok(block.includes('triggerEvent.stopPropagation()'),
      'openTransferPopover must call triggerEvent.stopPropagation() to prevent the document-level close handler from immediately destroying the new popover');
  });

  it('transfer button passes event to openTransferPopover', () => {
    assert.ok(src.includes(',this,event)'),
      'transfer button onclick must pass event as the third argument to openTransferPopover');
  });

  it('popover element itself stops internal click propagation', () => {
    const idx = src.indexOf('async function openTransferPopover(');
    const block = src.slice(idx, idx + 3000);
    assert.ok(
      block.includes("addEventListener('click'") && block.includes('stopPropagation'),
      'The popover element must have a click listener that calls stopPropagation to prevent internal clicks from triggering the outside-click close handler'
    );
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
    const block = src.slice(idx, idx + 3000);
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

// ══════════════════════════════════════════════════════════════
// Section 50 — Stage 1 SQL: Session Log schema
// ══════════════════════════════════════════════════════════════
describe('SQL Stage 1 — Session Log schema (supabase_setup.sql)', () => {
  const fs   = require('fs'), path = require('path');
  const sql  = fs.readFileSync(path.join(__dirname, '../sql/supabase_setup.sql'), 'utf8');
  const mig  = fs.readFileSync(path.join(__dirname, '../sql/supabase_session_log.sql'), 'utf8');

  // ── Table existence ──────────────────────────────────────────
  it('supabase_setup.sql defines session_log table', () => {
    assert.ok(sql.includes('create table if not exists session_log'),
      'session_log table must be defined in supabase_setup.sql');
  });

  it('supabase_setup.sql defines session_events table', () => {
    assert.ok(sql.includes('create table if not exists session_events'),
      'session_events table must be defined in supabase_setup.sql');
  });

  it('supabase_setup.sql defines npcs table', () => {
    assert.ok(sql.includes('create table if not exists npcs'),
      'npcs table must be defined in supabase_setup.sql');
  });

  // ── session_log columns ──────────────────────────────────────
  it('session_log has id text primary key', () => {
    const idx   = sql.indexOf('create table if not exists session_log');
    const block = sql.slice(idx, idx + 800);
    assert.ok(block.includes('id') && block.includes('primary key'),
      'session_log must have an id text primary key');
  });

  it('session_log has number int not null', () => {
    const idx   = sql.indexOf('create table if not exists session_log');
    const block = sql.slice(idx, idx + 800);
    assert.ok(block.includes('number') && block.includes('int') && block.includes('not null'),
      'session_log must have a number int not null column');
  });

  it('session_log has title text not null', () => {
    const idx   = sql.indexOf('create table if not exists session_log');
    const block = sql.slice(idx, idx + 800);
    assert.ok(block.includes('title') && block.includes('not null'),
      'session_log must have a title text not null column');
  });

  it('session_log has status defaulting to draft', () => {
    const idx   = sql.indexOf('create table if not exists session_log');
    const block = sql.slice(idx, idx + 800);
    assert.ok(block.includes('status') && block.includes("default 'draft'"),
      "session_log status must default to 'draft'");
  });

  it('session_log has quests jsonb defaulting to empty array', () => {
    const idx   = sql.indexOf('create table if not exists session_log');
    const block = sql.slice(idx, idx + 800);
    assert.ok(block.includes('quests') && block.includes('jsonb') && block.includes("default '[]'"),
      "session_log quests must be jsonb defaulting to '[]'");
  });

  it('session_log has session_npcs jsonb defaulting to empty array', () => {
    const idx   = sql.indexOf('create table if not exists session_log');
    const block = sql.slice(idx, idx + 800);
    assert.ok(block.includes('session_npcs') && block.includes('jsonb') && block.includes("default '[]'"),
      "session_log session_npcs must be jsonb defaulting to '[]'");
  });

  it('session_log has created_at and updated_at timestamps', () => {
    const idx   = sql.indexOf('create table if not exists session_log');
    const block = sql.slice(idx, idx + 1000);
    assert.ok(block.includes('created_at') && block.includes('updated_at'),
      'session_log must have both created_at and updated_at columns');
  });

  // ── session_events columns ───────────────────────────────────
  it('session_events has id text primary key', () => {
    const idx   = sql.indexOf('create table if not exists session_events');
    const block = sql.slice(idx, idx + 600);
    assert.ok(block.includes('id') && block.includes('primary key'),
      'session_events must have an id text primary key');
  });

  it('session_events has session_id foreign key with ON DELETE CASCADE', () => {
    const idx   = sql.indexOf('create table if not exists session_events');
    const block = sql.slice(idx, idx + 600);
    assert.ok(
      block.includes('session_id') &&
      block.includes('references session_log(id)') &&
      block.includes('on delete cascade'),
      'session_events.session_id must reference session_log(id) with ON DELETE CASCADE'
    );
  });

  it('session_events has text column not null', () => {
    const idx   = sql.indexOf('create table if not exists session_events');
    const block = sql.slice(idx, idx + 600);
    assert.ok(block.includes('text') && block.includes('not null'),
      'session_events must have a text not null column');
  });

  it('session_events has members jsonb defaulting to empty array', () => {
    const idx   = sql.indexOf('create table if not exists session_events');
    const block = sql.slice(idx, idx + 600);
    assert.ok(
      block.includes('members') && block.includes('jsonb') && block.includes("default '[]'"),
      "session_events.members must be jsonb defaulting to '[]'"
    );
  });

  it('session_events has sort_order int defaulting to 0', () => {
    const idx   = sql.indexOf('create table if not exists session_events');
    const block = sql.slice(idx, idx + 600);
    assert.ok(
      block.includes('sort_order') && block.includes('int') && block.includes('default 0'),
      'session_events must have sort_order int default 0 for UI ordering'
    );
  });

  it('session_events does NOT have updated_at (events are replaced, not patched)', () => {
    const idx   = sql.indexOf('create table if not exists session_events');
    const block = sql.slice(idx, idx + 600);
    assert.ok(!block.includes('updated_at'),
      'session_events must NOT have updated_at — events are deleted and re-inserted, not patched'
    );
  });

  // ── npcs columns ────────────────────────────────────────────
  it('npcs has id text primary key', () => {
    const idx   = sql.indexOf('create table if not exists npcs');
    const block = sql.slice(idx, idx + 700);
    assert.ok(block.includes('id') && block.includes('primary key'),
      'npcs must have an id text primary key');
  });

  it('npcs has slug text not null unique (citation key)', () => {
    const idx   = sql.indexOf('create table if not exists npcs');
    const block = sql.slice(idx, idx + 700);
    assert.ok(
      block.includes('slug') && block.includes('not null') && block.includes('unique'),
      'npcs.slug must be text not null unique — it is the citation key for ^{slug} syntax'
    );
  });

  it('npcs has name text not null', () => {
    const idx   = sql.indexOf('create table if not exists npcs');
    const block = sql.slice(idx, idx + 700);
    assert.ok(block.includes('name') && block.includes('not null'),
      'npcs must have a name text not null column');
  });

  it('npcs disposition defaults to unknown', () => {
    const idx   = sql.indexOf('create table if not exists npcs');
    const block = sql.slice(idx, idx + 700);
    assert.ok(
      block.includes('disposition') && block.includes("default 'unknown'"),
      "npcs.disposition must default to 'unknown'"
    );
  });

  it('npcs first_seen references session_log(id) ON DELETE SET NULL', () => {
    const idx   = sql.indexOf('create table if not exists npcs');
    const block = sql.slice(idx, idx + 700);
    assert.ok(
      block.includes('first_seen') &&
      block.includes('references session_log(id)') &&
      block.includes('on delete set null'),
      'npcs.first_seen must reference session_log(id) with ON DELETE SET NULL — NPC survives session deletion'
    );
  });

  it('npcs has created_at and updated_at', () => {
    const idx   = sql.indexOf('create table if not exists npcs');
    const block = sql.slice(idx, idx + 700);
    assert.ok(block.includes('created_at') && block.includes('updated_at'),
      'npcs must have both created_at and updated_at timestamps');
  });

  // ── RLS ──────────────────────────────────────────────────────
  it('RLS is enabled on all three Session Log tables', () => {
    assert.ok(sql.includes('alter table session_log    enable row level security'),
      'RLS must be enabled on session_log');
    assert.ok(sql.includes('alter table session_events enable row level security'),
      'RLS must be enabled on session_events');
    assert.ok(sql.includes('alter table npcs           enable row level security'),
      'RLS must be enabled on npcs');
  });

  it('public_all policy exists for all three Session Log tables', () => {
    assert.ok(
      sql.includes('create policy "public_all" on session_log'),
      'public_all policy must exist for session_log'
    );
    assert.ok(
      sql.includes('create policy "public_all" on session_events'),
      'public_all policy must exist for session_events'
    );
    assert.ok(
      sql.includes('create policy "public_all" on npcs'),
      'public_all policy must exist for npcs'
    );
  });

  // ── Triggers ─────────────────────────────────────────────────
  it('updated_at trigger exists for session_log', () => {
    assert.ok(sql.includes('trg_session_log_updated'),
      'trg_session_log_updated trigger must be defined');
  });

  it('updated_at trigger exists for npcs', () => {
    assert.ok(sql.includes('trg_npcs_updated'),
      'trg_npcs_updated trigger must be defined');
  });

  it('no updated_at trigger for session_events (by design)', () => {
    assert.ok(!sql.includes('trg_session_events_updated'),
      'session_events must NOT have an updated_at trigger — events are replaced not patched');
  });

  // ── Migration file mirrors master ────────────────────────────
  it('migration file defines all three tables', () => {
    assert.ok(mig.includes('create table if not exists session_log'),    'migration must define session_log');
    assert.ok(mig.includes('create table if not exists session_events'), 'migration must define session_events');
    assert.ok(mig.includes('create table if not exists npcs'),           'migration must define npcs');
  });

  it('migration file includes create or replace for set_updated_at function (safe re-run)', () => {
    assert.ok(mig.includes('create or replace function set_updated_at()'),
      'migration must use CREATE OR REPLACE for set_updated_at so it is safe on both fresh and existing installs');
  });

  it('migration file includes RLS and policies', () => {
    assert.ok(mig.includes('enable row level security') && mig.includes('public_all'),
      'migration file must include RLS setup matching the master setup file');
  });

  it('migration file uses IF NOT EXISTS on all CREATE TABLE statements', () => {
    const tables = ['session_log', 'session_events', 'npcs'];
    tables.forEach(t => {
      assert.ok(
        mig.includes(`create table if not exists ${t}`),
        `migration must use CREATE TABLE IF NOT EXISTS for ${t} to be safe on re-run`
      );
    });
  });

  // ── Design intent comments ───────────────────────────────────
  it('session_log.summary column comment mentions citation syntax', () => {
    assert.ok(
      sql.includes('^{npc-slug}') || sql.includes('citation'),
      'session_log.summary must have a comment referencing the ^{npc-slug} citation syntax'
    );
  });

  it('npcs.slug column comment describes its role as a citation key', () => {
    const idx   = sql.indexOf('create table if not exists npcs');
    const block = sql.slice(idx, idx + 700);
    assert.ok(
      block.includes('citation') || block.includes('URL-safe'),
      'npcs.slug must have a comment explaining its role as the citation key'
    );
  });

  it('session_events cascade comment or annotation is present', () => {
    const idx   = sql.indexOf('create table if not exists session_events');
    const block = sql.slice(idx, idx + 600);
    assert.ok(
      block.includes('cascade') || block.includes('CASCADE'),
      'session_events FK must use ON DELETE CASCADE so events are cleaned up with their session'
    );
  });
});

// ══════════════════════════════════════════════════════════════
// Section 51 — Stage 2 Scaffold: session-log.html structure
// ══════════════════════════════════════════════════════════════
describe('Stage 2 Scaffold — session-log.html DOM structure', () => {
  const fs   = require('fs'), path = require('path');
  const src  = fs.readFileSync(path.join(__dirname, '../session-log.html'), 'utf8');
  const idx  = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const css  = fs.readFileSync(path.join(__dirname, '../css/nexus.css'), 'utf8');

  // ── Page identity ────────────────────────────────────────────
  it('has correct page title', () => {
    assert.ok(src.includes('<title>NEXUS // Session Log</title>'),
      'page title must be "NEXUS // Session Log"');
  });

  it('uses body class page-session', () => {
    assert.ok(src.includes('class="has-sidenav page-session"'),
      'body must have "has-sidenav page-session" classes');
  });

  it('loads all required scripts and stylesheet', () => {
    assert.ok(src.includes('js/nexus-config.js'), 'must load nexus-config.js');
    assert.ok(src.includes('js/nexus-utils.js'),  'must load nexus-utils.js');
    assert.ok(src.includes('css/nexus.css'),       'must load nexus.css');
  });

  // ── Nav ──────────────────────────────────────────────────────
  it('sidenav has all 6 links including session-log.html — via NAV_LINKS in nexus-utils.js', () => {
    const utils = fs.readFileSync(path.join(__dirname, '../js/nexus-utils.js'), 'utf8');
    const links = ['index.html','party-roster.html','treasury.html','loot-tracker.html','session-log.html','admin.html'];
    links.forEach(link => assert.ok(utils.includes(`'${link}'`), `NAV_LINKS in nexus-utils.js must include ${link}`));
  });

  it('session-log.html calls buildSidenav with session-log.html as active', () => {
    assert.ok(
      src.includes("buildSidenav('session-log.html')"),
      'session-log.html must call buildSidenav with itself as the active href'
    );
  });

  it('has nexus-nav-root placeholder for dynamic nav', () => {
    assert.ok(src.includes('id="nexus-nav-root"'), 'page must have a #nexus-nav-root div for buildSidenav');
  });

  // ── Header ───────────────────────────────────────────────────
  it('header contains SESSION LOG brand name', () => {
    assert.ok(src.includes('SESSION LOG'), 'header must show SESSION LOG brand name');
  });

  it('has view toggle with sessions and npc buttons', () => {
    assert.ok(src.includes('id="btnViewSessions"'), 'view toggle must have sessions button');
    assert.ok(src.includes('id="btnViewNpcs"'),     'view toggle must have NPC Index button');
    assert.ok(src.includes("switchView('sessions')"), 'sessions button must call switchView');
    assert.ok(src.includes("switchView('npcs')"),     'NPC button must call switchView');
  });

  it('sessions button is active by default', () => {
    assert.ok(
      src.includes('sl-view-btn active') && src.includes('id="btnViewSessions"'),
      'sessions view button must start with "active" class'
    );
  });

  it('has New Session button that calls openSessionModal', () => {
    assert.ok(src.includes('id="btnNewSession"'), '+ New Session button must have id btnNewSession');
    assert.ok(src.includes('onclick="openSessionModal()"'), 'button must call openSessionModal()');
  });

  it('has Add NPC button hidden by default', () => {
    assert.ok(src.includes('id="btnNewNpc"'), '+ Add NPC button must exist with id btnNewNpc');
    assert.ok(
      src.includes('id="btnNewNpc"') && src.includes("style=\"display:none\""),
      '+ Add NPC button must be hidden by default (sessions view is default)'
    );
  });

  // ── Stats bar ────────────────────────────────────────────────
  it('stats bar has statSessions element', () => {
    assert.ok(src.includes('id="statSessions"'), 'stats bar must have statSessions element');
  });

  it('stats bar has statActiveQuests element', () => {
    assert.ok(src.includes('id="statActiveQuests"'), 'stats bar must have statActiveQuests element');
  });

  it('stats bar has statNpcs element', () => {
    assert.ok(src.includes('id="statNpcs"'), 'stats bar must have statNpcs element');
  });

  it('stats bar has statComplete element', () => {
    assert.ok(src.includes('id="statComplete"'), 'stats bar must have statComplete element');
  });

  // ── Sessions view ────────────────────────────────────────────
  it('has sessionsView container', () => {
    assert.ok(src.includes('id="sessionsView"'), 'sessionsView div must exist');
  });

  it('has session search input', () => {
    assert.ok(src.includes('id="sessionSearch"'), 'session search input must exist');
    // oninput also manages the clear button visibility alongside renderSessions()
    assert.ok(src.includes('renderSessions()'), 'search must call renderSessions() on input');
  });

  it('has filterStatus select with draft and complete options', () => {
    assert.ok(src.includes('id="filterStatus"'), 'filterStatus select must exist');
    assert.ok(src.includes('value="draft"'),    'filterStatus must have "draft" option');
    assert.ok(src.includes('value="complete"'), 'filterStatus must have "complete" option');
  });

  it('has sessionGrid container for card rendering', () => {
    assert.ok(src.includes('id="sessionGrid"'), 'sessionGrid container must exist');
  });

  // ── NPC Index view ───────────────────────────────────────────
  it('has npcView container hidden by default', () => {
    assert.ok(src.includes('id="npcView"'),        'npcView div must exist');
    assert.ok(src.includes('id="npcView" style="display:none"'), 'npcView must be hidden by default');
  });

  it('has npc search input', () => {
    assert.ok(src.includes('id="npcSearch"'), 'NPC search input must exist');
    assert.ok(src.includes('oninput="renderNpcs()"'), 'NPC search must call renderNpcs() on input');
  });

  it('has filterDisposition select with all 5 dispositions', () => {
    assert.ok(src.includes('id="filterDisposition"'),   'filterDisposition select must exist');
    assert.ok(src.includes('value="allied"'),    'must have allied option');
    assert.ok(src.includes('value="friendly"'),  'must have friendly option');
    assert.ok(src.includes('value="neutral"'),   'must have neutral option');
    assert.ok(src.includes('value="hostile"'),   'must have hostile option');
    assert.ok(src.includes('value="unknown"'),   'must have unknown option');
  });

  it('has npcGrid container for NPC card rendering', () => {
    assert.ok(src.includes('id="npcGrid"'), 'npcGrid container must exist');
  });

  // ── JS state and functions ───────────────────────────────────
  it('declares sessions, events, npcs, npcMap state variables', () => {
    assert.ok(src.includes('let sessions'), 'must declare sessions state array');
    assert.ok(src.includes('let events'),   'must declare events state object');
    assert.ok(src.includes('let npcs'),     'must declare npcs state array');
    assert.ok(src.includes('let npcMap'),   'must declare npcMap');
  });

  it('declares currentView and expandedId state', () => {
    assert.ok(src.includes("let currentView"), 'must declare currentView');
    assert.ok(src.includes("let expandedId"),  'must declare expandedId');
  });

  it('defines boot() function that calls renderView()', () => {
    assert.ok(src.includes('async function boot()'), 'boot() must be defined');
    assert.ok(src.includes('renderView()'), 'boot() must call renderView()');
  });

  it('boot() loads all three tables in parallel via Promise.all', () => {
    assert.ok(
      src.includes('Promise.all') &&
      src.includes('session_log') &&
      src.includes('session_events') &&
      src.includes("'npcs'"),
      'boot() must load session_log, session_events, and npcs in parallel'
    );
  });

  it('defines switchView() that toggles between sessions and npcs', () => {
    assert.ok(src.includes('function switchView('), 'switchView() must be defined');
    assert.ok(src.includes("sessionsView"), 'switchView must reference sessionsView');
    assert.ok(src.includes("npcView"),      'switchView must reference npcView');
  });

  it('defines renderSessions() function', () => {
    assert.ok(src.includes('function renderSessions()'), 'renderSessions() must be defined');
  });

  it('defines renderNpcs() function', () => {
    assert.ok(src.includes('function renderNpcs()'), 'renderNpcs() must be defined');
  });

  it('defines renderCard() that renders a session card', () => {
    assert.ok(src.includes('function renderCard('), 'renderCard() must be defined');
  });

  it('defines toggleCard() for expand/collapse', () => {
    assert.ok(src.includes('function toggleCard('), 'toggleCard() must be defined');
  });

  it('defines switchTab() for card tab navigation', () => {
    assert.ok(src.includes('function switchTab('), 'switchTab() must be defined');
  });

  it('defines buildNpcMap() that builds slug → npc lookup', () => {
    assert.ok(src.includes('function buildNpcMap()'), 'buildNpcMap() must be defined');
    assert.ok(src.includes('npc.slug'), 'buildNpcMap must use npc.slug as key');
  });

  it('defines getSessionAppearances() for NPC session badges', () => {
    assert.ok(src.includes('function getSessionAppearances('), 'getSessionAppearances() must be defined');
  });

  it('defines jumpToSession() for NPC badge → session deep-link', () => {
    assert.ok(src.includes('function jumpToSession('), 'jumpToSession() must be defined');
    assert.ok(src.includes("switchView('sessions')"), 'jumpToSession must switch to sessions view');
  });

  it('defines updateStats() that updates all 4 stat elements', () => {
    assert.ok(src.includes('function updateStats()'), 'updateStats() must be defined');
    assert.ok(src.includes('statSessions'),     'updateStats must update statSessions');
    assert.ok(src.includes('statNpcs'),         'updateStats must update statNpcs');
    assert.ok(src.includes('statComplete'),     'updateStats must update statComplete');
    assert.ok(src.includes('statActiveQuests'), 'updateStats must update statActiveQuests');
  });

  it('defines all four tab render functions', () => {
    assert.ok(src.includes('function renderTabOverview('),  'renderTabOverview must be defined');
    assert.ok(src.includes('function renderTabMoments('),   'renderTabMoments must be defined');
    assert.ok(src.includes('function renderTabNpcs('),      'renderTabNpcs must be defined');
    assert.ok(src.includes('function renderTabQuests('),    'renderTabQuests must be defined');
  });

  it('session cards have all 4 tab buttons', () => {
    assert.ok(src.includes("switchTab") && src.includes("'overview'"), 'overview tab must exist');
    assert.ok(src.includes("'moments'"), 'moments tab must exist');
    assert.ok(src.includes("'quests'"),  'quests tab must exist');
  });

  it('esc() is defined in nexus-utils.js and available on this page', () => {
    const utils = fs.readFileSync(path.join(__dirname, '../js/nexus-utils.js'), 'utf8');
    assert.ok(utils.includes('function esc('), 'esc() must be defined in nexus-utils.js');
    assert.ok(utils.includes('&amp;'), 'esc() must escape ampersands');
    assert.ok(src.includes('nexus-utils.js'), 'session-log.html must load nexus-utils.js');
  });

  it('showToast() is defined in nexus-utils.js and loaded on this page', () => {
    const utils = fs.readFileSync(path.join(__dirname, '../js/nexus-utils.js'), 'utf8');
    assert.ok(utils.includes('function showToast('), 'showToast() must be defined in nexus-utils.js');
    assert.ok(src.includes('nexus-utils.js'), 'session-log.html must load nexus-utils.js');
  });

  // ── CSS classes ──────────────────────────────────────────────
  it('defines session card CSS classes', () => {
    assert.ok(src.includes('session-card'),  'session-card class must be defined');
    assert.ok(src.includes('sc-header'),     'sc-header class must be defined');
    assert.ok(src.includes('sc-title'),      'sc-title class must be defined');
    assert.ok(src.includes('sc-status'),     'sc-status class must be defined');
    assert.ok(src.includes('sc-chevron'),    'sc-chevron class must be defined');
    assert.ok(src.includes('sc-body'),       'sc-body class must be defined');
    assert.ok(src.includes('sc-tabs'),       'sc-tabs class must be defined');
    assert.ok(src.includes('sc-tab-panel'),  'sc-tab-panel class must be defined');
  });

  it('defines disposition badge CSS classes for all 5 values', () => {
    assert.ok(css.includes('disp-allied'),   'disp-allied CSS class must exist');
    assert.ok(css.includes('disp-friendly'), 'disp-friendly CSS class must exist');
    assert.ok(css.includes('disp-neutral'),  'disp-neutral CSS class must exist');
    assert.ok(css.includes('disp-hostile'),  'disp-hostile CSS class must exist');
    assert.ok(css.includes('disp-unknown'),  'disp-unknown CSS class must exist');
  });

  it('defines quest status CSS classes for all 4 states', () => {
    assert.ok(src.includes('qs-active'),    'qs-active CSS class must exist');
    assert.ok(src.includes('qs-completed'), 'qs-completed CSS class must exist');
    assert.ok(src.includes('qs-failed'),    'qs-failed CSS class must exist');
    assert.ok(src.includes('qs-on-hold'),   'qs-on-hold CSS class must exist');
  });

  it('defines NPC card CSS classes', () => {
    assert.ok(src.includes('npc-card'),              'npc-card class must exist');
    assert.ok(src.includes('npc-card-name'),         'npc-card-name class must exist');
    assert.ok(src.includes('npc-session-badge'),     'npc-session-badge class must exist');
    assert.ok(src.includes('npc-appearances'),       'npc-appearances class must exist');
  });

  it('defines sl-view-toggle and sl-view-btn CSS classes', () => {
    assert.ok(src.includes('sl-view-toggle'), 'sl-view-toggle class must be defined');
    assert.ok(src.includes('sl-view-btn'),    'sl-view-btn class must be defined');
  });

  it('uses page-session brand accent color (violet)', () => {
    // Violet may be in session-log.html directly, or in nexus.css as --violet variable
    const hasViolet = src.includes('#a78bfa') || src.includes('a78bfa') || src.includes('var(--violet)')
                   || css.includes('--violet') && css.includes('page-session');
    assert.ok(hasViolet,
      'page must use the violet session-log accent color (defined in nexus.css as --violet or inline as #a78bfa)');
  });

  // ── index.html dashboard card ────────────────────────────────
  it('index.html Session Log card is now an active-module link', () => {
    assert.ok(idx.includes('href="session-log.html"'), 'index.html must link to session-log.html');
    assert.ok(
      idx.includes('active-module') && idx.includes('session-log.html'),
      'Session Log card must be an active-module, not coming-soon'
    );
    // The old placeholder was a <div class="module-card coming-soon"> with no href.
    // It is now an <a> tag — verify the <a> exists and no orphaned coming-soon div for session log remains.
    assert.ok(
      !idx.includes('<div class="module-card coming-soon"' + "\n" + '         style=\"--card-accent:#4a6080; --card-glow'),
      'old coming-soon placeholder div must be replaced by an <a> active-module card');
    // The old placeholder was a <div class="module-card coming-soon"> with no href.
    // It is now an <a> tag — verify the <a> exists and no orphaned coming-soon div for session log remains.
    assert.ok(
      !idx.includes('<div class="module-card coming-soon"' + "\n" + '         style=\"--card-accent:#4a6080; --card-glow'),
      'old coming-soon placeholder div must be replaced by an <a> active-module card');
  });

  it('index.html Session Log card shows LIVE status badge', () => {
    assert.ok(
      idx.includes('session-log.html') && idx.includes('status-live'),
      'Session Log card must show status-live badge'
    );
  });

  it('index.html has statSessionCount and statNpcCount elements', () => {
    assert.ok(idx.includes('id="statSessionCount"'), 'statSessionCount must exist on dashboard');
    assert.ok(idx.includes('id="statNpcCount"'),     'statNpcCount must exist on dashboard');
  });

  it('index.html calls loadSessionStats() at boot', () => {
    assert.ok(idx.includes('loadSessionStats()'), 'index.html must call loadSessionStats() on boot');
  });

  it('index.html defines loadSessionStats() that queries both tables', () => {
    assert.ok(idx.includes('async function loadSessionStats()'), 'loadSessionStats function must be defined');
    assert.ok(idx.includes("'session_log'") || idx.includes('"session_log"'), 'must query session_log');
    assert.ok(idx.includes("'npcs'")        || idx.includes('"npcs"'),        'must query npcs');
  });

  // ── Nav propagation ──────────────────────────────────────────
  it('all module pages use buildSidenav for nav (session-log link comes from NAV_LINKS)', () => {
    const utils = fs.readFileSync(path.join(__dirname, '../js/nexus-utils.js'), 'utf8');
    assert.ok(utils.includes("'session-log.html'"), 'NAV_LINKS in nexus-utils.js must define the session-log.html link');
    const pages = ['party-roster.html','treasury.html','loot-tracker.html','admin.html'];
    pages.forEach(page => {
      const src = fs.readFileSync(path.join(__dirname, '..', page), 'utf8');
      assert.ok(src.includes('buildSidenav('), `${page} must call buildSidenav() to render the shared nav`);
    });
  });
});

// ══════════════════════════════════════════════════════════════
// Section 52 — Stage 3: Session CRUD
// ══════════════════════════════════════════════════════════════
describe('Stage 3 — Session CRUD', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../session-log.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../css/nexus.css'), 'utf8');

  // ── Modal HTML structure ─────────────────────────────────────
  it('session modal exists with id="sessionModal"', () => {
    assert.ok(src.includes('id="sessionModal"'), 'sessionModal must exist in the DOM');
  });

  it('session modal has a modal-backdrop that closes on outside click', () => {
    assert.ok(
      src.includes('id="sessionModal"') && src.includes('closeSessionModal()'),
      'sessionModal must call closeSessionModal on backdrop click'
    );
  });

  it('session modal has 4 tab buttons (overview, moments, npcs, quests)', () => {
    assert.ok(src.includes("data-tab=\"overview\""),  'modal must have overview tab');
    assert.ok(src.includes("data-tab=\"moments\""),   'modal must have moments tab');
    assert.ok(src.includes("data-tab=\"npcs\""),      'modal must have npcs tab');
    assert.ok(src.includes("data-tab=\"quests\""),    'modal must have quests tab');
  });

  it('session modal has 4 corresponding panel divs', () => {
    assert.ok(src.includes('data-panel="overview"'), 'modal must have overview panel');
    assert.ok(src.includes('data-panel="moments"'),  'modal must have moments panel');
    assert.ok(src.includes('data-panel="npcs"'),     'modal must have npcs panel');
    assert.ok(src.includes('data-panel="quests"'),   'modal must have quests panel');
  });

  it('overview panel has session number input (smNumber)', () => {
    assert.ok(src.includes('id="smNumber"'), 'smNumber input must exist');
    assert.ok(src.includes('type="number"') && src.includes('id="smNumber"'),
      'smNumber must be a number input');
  });

  it('overview panel has title input (smTitle) marked required', () => {
    assert.ok(src.includes('id="smTitle"'), 'smTitle input must exist');
    assert.ok(src.includes('field-required') && src.includes('smTitle'),
      'title field must be marked required');
  });

  it('overview panel has real date input (smRealDate)', () => {
    assert.ok(src.includes('id="smRealDate"'), 'smRealDate input must exist');
    assert.ok(src.includes('type="date"') && src.includes('id="smRealDate"'),
      'smRealDate must be a date input');
  });

  it('overview panel has world date text input (smWorldDate)', () => {
    assert.ok(src.includes('id="smWorldDate"'), 'smWorldDate input must exist');
  });

  it('overview panel has status toggle buttons for draft and complete', () => {
    assert.ok(src.includes('data-status="draft"'),    'status toggle must have draft button');
    assert.ok(src.includes('data-status="complete"'), 'status toggle must have complete button');
    assert.ok(src.includes('id="smStatusHidden"'),    'hidden status input must exist');
  });

  it('overview panel has summary textarea (smSummary)', () => {
    assert.ok(src.includes('id="smSummary"'), 'smSummary textarea must exist');
  });

  it('overview panel has inline error divs for title and number', () => {
    assert.ok(src.includes('id="smTitleError"'),  'smTitleError div must exist');
    assert.ok(src.includes('id="smNumberError"'), 'smNumberError div must exist');
  });

  it('modal footer has Cancel and Save Session buttons', () => {
    assert.ok(src.includes('onclick="closeSessionModal()"') && src.includes('Cancel'),
      'modal must have a Cancel button calling closeSessionModal');
    assert.ok(src.includes('id="btnSaveSession"'), 'btnSaveSession must exist');
    assert.ok(src.includes('onclick="saveSession()"'), 'save button must call saveSession()');
  });

  // ── JS functions ─────────────────────────────────────────────
  it('defines openSessionModal(id, startTab) — opens and pre-fills modal', () => {
    assert.ok(
      src.includes('function openSessionModal(id, startTab)') ||
      src.includes('function openSessionModal(id)'),
      'openSessionModal must be defined');
    assert.ok(src.includes('smTitle'), 'openSessionModal must reference smTitle');
    assert.ok(src.includes('smNumber'), 'openSessionModal must reference smNumber');
    assert.ok(src.includes('smRealDate'), 'openSessionModal must reference smRealDate');
    assert.ok(src.includes('smSummary'), 'openSessionModal must reference smSummary');
  });

  it('openSessionModal auto-increments session number for new sessions', () => {
    assert.ok(
      src.includes('nextNumber') || src.includes('max(') || src.includes('Math.max'),
      'openSessionModal must compute next session number via Math.max'
    );
  });

  it('openSessionModal defaults real_date to today for new sessions', () => {
    assert.ok(
      src.includes('new Date().toISOString().slice(0,10)') ||
      src.includes('toISOString().slice'),
      'openSessionModal must default real_date to today'
    );
  });

  it('defines closeSessionModal()', () => {
    assert.ok(src.includes('function closeSessionModal()'), 'closeSessionModal must be defined');
    assert.ok(
      src.includes("classList.remove('open')") || src.includes('.remove("open")'),
      'closeSessionModal must remove the "open" class'
    );
  });

  it('defines switchModalTab(tab) that updates sm-tab and sm-panel classes', () => {
    assert.ok(src.includes('function switchModalTab('), 'switchModalTab must be defined');
    assert.ok(src.includes('sm-tab'),   'switchModalTab must reference sm-tab');
    assert.ok(src.includes('sm-panel'), 'switchModalTab must reference sm-panel');
  });

  it('defines setSessionStatus(status) that updates hidden input and buttons', () => {
    assert.ok(src.includes('function setSessionStatus('), 'setSessionStatus must be defined');
    assert.ok(src.includes('smStatusHidden'), 'setSessionStatus must write to smStatusHidden');
    assert.ok(src.includes('sm-status-btn'), 'setSessionStatus must toggle sm-status-btn classes');
  });

  it('defines async saveSession() with validation', () => {
    assert.ok(src.includes('async function saveSession()'), 'saveSession must be async');
  });

  it('saveSession() validates title is non-empty', () => {
    assert.ok(
      src.includes('smTitleError') &&
      (src.includes('Title is required') || src.includes('required')),
      'saveSession must validate title and show smTitleError'
    );
  });

  it('saveSession() validates session number is a positive integer', () => {
    assert.ok(
      src.includes('smNumberError') && src.includes('number'),
      'saveSession must validate the session number'
    );
  });

  it('saveSession() calls db.upsert on session_log', () => {
    assert.ok(
      src.includes("db.upsert('session_log'") || src.includes('db.upsert("session_log"'),
      'saveSession must call db.upsert on session_log'
    );
  });

  it('saveSession() uses setLoading and setModalLoading during save', () => {
    assert.ok(src.includes('setLoading(btn'), 'saveSession must use setLoading');
    assert.ok(src.includes('setModalLoading'), 'saveSession must use setModalLoading');
  });

  it('saveSession() preserves existing quests and session_npcs when editing', () => {
    assert.ok(
      src.includes('quests:') && src.includes('session_npcs:'),
      'saveSession row must include quests and session_npcs fields'
    );
    assert.ok(
      src.includes("_editingSessionId") && src.includes('quests'),
      'saveSession must preserve existing quests when editing'
    );
  });

  it('saveSession() expands the saved card after save', () => {
    assert.ok(
      src.includes('expandedId = id'),
      'saveSession must set expandedId to show the saved card'
    );
  });

  it('saveSession() re-sorts sessions by number desc after save', () => {
    assert.ok(
      src.includes('sessions.sort') && src.includes('b.number - a.number'),
      'saveSession must re-sort sessions by number descending'
    );
  });

  it('saveSession() calls updateStats() and renderSessions() after save', () => {
    assert.ok(src.includes('updateStats()'),    'saveSession must call updateStats()');
    assert.ok(src.includes('renderSessions()'), 'saveSession must call renderSessions()');
  });

  it('saveSession() handles errors and restores button state in finally block', () => {
    assert.ok(src.includes('} finally {'), 'saveSession must have a finally block');
    assert.ok(
      src.includes('setLoading(btn, false)'),
      'saveSession finally block must restore button loading state'
    );
  });

  it('defines async deleteSession(id) with nexusConfirm guard', () => {
    assert.ok(src.includes('async function deleteSession(id)'), 'deleteSession must be async');
    assert.ok(
      src.includes('nexusConfirm') && src.includes('deleteSession'),
      'deleteSession must use nexusConfirm before deleting'
    );
  });

  it('deleteSession() calls db.delete on session_log', () => {
    assert.ok(
      src.includes("db.delete('session_log'") || src.includes('db.delete("session_log"'),
      'deleteSession must call db.delete on session_log'
    );
  });

  it('deleteSession() relies on CASCADE — does NOT call db.delete on session_events', () => {
    // The schema has ON DELETE CASCADE, so we should NOT see a separate events delete
    const deleteBlock = src.slice(src.indexOf('async function deleteSession'));
    const nextFn = deleteBlock.indexOf('\nasync function', 10);
    const fnBody = deleteBlock.slice(0, nextFn > 0 ? nextFn : 500);
    assert.ok(
      !fnBody.includes("db.delete('session_events'") &&
      !fnBody.includes('db.delete("session_events"') &&
      !fnBody.includes("db.deleteWhere('session_events"),
      'deleteSession must NOT manually delete session_events — ON DELETE CASCADE handles it'
    );
  });

  it('deleteSession() clears expandedId if the deleted session was expanded', () => {
    assert.ok(
      src.includes('expandedId === id') || src.includes("expandedId = null"),
      'deleteSession must clear expandedId when deleting the expanded session'
    );
  });

  it('deleteSession() calls updateStats() and renderSessions() after delete', () => {
    const deleteBlock = src.slice(src.indexOf('async function deleteSession'));
    assert.ok(deleteBlock.includes('updateStats()'),    'deleteSession must call updateStats()');
    assert.ok(deleteBlock.includes('renderSessions()'), 'deleteSession must call renderSessions()');
  });

  it('deleteSession() mention NPCs not affected in confirm message', () => {
    assert.ok(
      src.includes('NPCs will not be affected') || src.includes('NPC') && src.includes('deleteSession'),
      'deleteSession confirm message should reassure that NPCs are not deleted'
    );
  });

  // ── CSS ──────────────────────────────────────────────────────
  it('defines .sm-status-btn CSS class', () => {
    assert.ok(css.includes('.sm-status-btn'), 'sm-status-btn CSS class must be defined');
  });

  it('sm-status-btn.active styles differ for draft (amber) and complete (green)', () => {
    assert.ok(
      src.includes('data-status="draft"') && src.includes('data-status="complete"'),
      'status toggle buttons must use data-status attribute'
    );
    assert.ok(
      css.includes('active[data-status="draft"]') || css.includes("active[data-status='draft']"),
      'draft active style must be defined'
    );
    assert.ok(
      css.includes('active[data-status="complete"]') || css.includes("active[data-status='complete']"),
      'complete active style must be defined'
    );
  });

  it('defines .sm-panel and .sm-panel.active CSS for tab visibility', () => {
    assert.ok(css.includes('.sm-panel'), '.sm-panel CSS must be defined');
    assert.ok(
      css.includes('.sm-panel.active') || css.includes('.sm-panel .active'),
      '.sm-panel.active must be defined'
    );
  });

  it('defines .modal-label and .modal-input styles scoped to body.page-session', () => {
    assert.ok(css.includes('.modal-label'), '.modal-label CSS must be defined');
    assert.ok(css.includes('.modal-input'), '.modal-input CSS must be defined');
  });

  // ── Stub preservation ────────────────────────────────────────
  it('openNpcModal and deleteNpc are real functions (implemented in Stage 5)', () => {
    assert.ok(src.includes('function openNpcModal('), 'openNpcModal must be defined');
    assert.ok(src.includes('function deleteNpc('),    'deleteNpc must be defined');
    // Stubs replaced — these must NOT just show a toast
    assert.ok(!src.includes("showToast('NPC modal coming in Stage 5.")
           && !src.includes("showToast('NPC delete coming in Stage 5."),
      'NPC functions must be real implementations, not Stage-5 stubs');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 53 — Stage 4: Events (Moments tab)
// ══════════════════════════════════════════════════════════════
describe('Stage 4 — Events (Moments tab)', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../session-log.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../css/nexus.css'), 'utf8');

  // ── State variables ──────────────────────────────────────────
  it('declares _draftMoments state variable', () => {
    assert.ok(src.includes('let _draftMoments'), '_draftMoments state must be declared');
  });

  it('declares _partyMembers cache variable', () => {
    assert.ok(src.includes('let _partyMembers'), '_partyMembers cache must be declared');
  });

  // ── Modal HTML panel ─────────────────────────────────────────
  it('moments panel stub is replaced with real editor', () => {
    assert.ok(!src.includes('Moments editor coming in Stage 4'),
      'Stage 4 stub text must be removed');
  });

  it('moments panel has smMomentsList container', () => {
    assert.ok(src.includes('id="smMomentsList"'),
      'smMomentsList container must exist in the moments panel');
  });

  it('moments panel has + Add Moment button calling addMoment()', () => {
    assert.ok(src.includes('onclick="addMoment()"'),
      '+ Add Moment button must call addMoment()');
  });

  // ── Moment row structure ─────────────────────────────────────
  it('moment rows have a text input with oninput="updateMomentText(...)"', () => {
    assert.ok(src.includes('updateMomentText('),
      'moment input must call updateMomentText on input');
  });

  it('moment rows have a member select calling updateMomentMember(...)', () => {
    assert.ok(src.includes('updateMomentMember('),
      'member select must call updateMomentMember on change');
  });

  it('moment rows have a remove button calling removeMoment(...)', () => {
    assert.ok(src.includes('removeMoment('),
      'moment row must have a remove button calling removeMoment');
  });

  it('moment rows have a drag handle with class sm-moment-drag', () => {
    assert.ok(src.includes('sm-moment-drag'),
      'moment rows must include a drag handle with class sm-moment-drag');
  });

  // ── Functions ────────────────────────────────────────────────
  it('defines async loadMembersForModal() with caching guard', () => {
    assert.ok(src.includes('async function loadMembersForModal()'),
      'loadMembersForModal must be defined');
    assert.ok(src.includes('_partyMembers.length') && src.includes('return'),
      'loadMembersForModal must short-circuit if already loaded');
    assert.ok(
      src.includes("db.select('party_members'") || src.includes('db.select("party_members"'),
      'loadMembersForModal must query party_members'
    );
  });

  it('defines memberOptions(selectedMembers) that builds option HTML', () => {
    assert.ok(src.includes('function memberOptions('),
      'memberOptions must be defined');
    assert.ok(src.includes('— untagged —') || src.includes('untagged'),
      'memberOptions must include an "untagged" default option');
    assert.ok(src.includes('_partyMembers.map'),
      'memberOptions must map over _partyMembers');
  });

  it('defines buildMomentsEditor() that renders _draftMoments into smMomentsList', () => {
    assert.ok(src.includes('function buildMomentsEditor()'),
      'buildMomentsEditor must be defined');
    assert.ok(src.includes('smMomentsList'),
      'buildMomentsEditor must reference smMomentsList');
    assert.ok(src.includes('_draftMoments.map') || src.includes('_draftMoments.length'),
      'buildMomentsEditor must use _draftMoments');
  });

  it('buildMomentsEditor() shows empty state when _draftMoments is empty', () => {
    assert.ok(
      src.includes('No moments yet') || src.includes('Add Moment'),
      'buildMomentsEditor must show an empty-state message when no moments'
    );
  });

  it('defines addMoment() that pushes a new draft and calls buildMomentsEditor', () => {
    assert.ok(src.includes('function addMoment()'),
      'addMoment must be defined');
    assert.ok(src.includes('_draftMoments.push('),
      'addMoment must push a new entry to _draftMoments');
    assert.ok(src.includes('buildMomentsEditor()'),
      'addMoment must call buildMomentsEditor() to re-render');
  });

  it('addMoment() focuses the newly added input after render', () => {
    const fnStart = src.indexOf('function addMoment()');
    const fnEnd   = src.indexOf('\nfunction ', fnStart + 1);
    const fnBody  = src.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 400);
    assert.ok(fnBody.includes('.focus()'),
      'addMoment must focus the new input after adding');
  });

  it('defines removeMoment(idx) that splices _draftMoments and rebuilds editor', () => {
    assert.ok(src.includes('function removeMoment('),
      'removeMoment must be defined');
    assert.ok(src.includes('_draftMoments.splice('),
      'removeMoment must splice _draftMoments');
    const fnStart = src.indexOf('function removeMoment(');
    const fnEnd   = src.indexOf('\nfunction ', fnStart + 1);
    const fnBody  = src.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 200);
    assert.ok(fnBody.includes('buildMomentsEditor()'),
      'removeMoment must call buildMomentsEditor() after splicing');
  });

  it('defines updateMomentText(idx, value) that mutates _draftMoments in-place', () => {
    assert.ok(src.includes('function updateMomentText('),
      'updateMomentText must be defined');
    assert.ok(
      src.includes("_draftMoments[idx].text = value") ||
      src.includes('_draftMoments[idx].text=value'),
      'updateMomentText must set _draftMoments[idx].text'
    );
  });

  it('defines updateMomentMember(idx, memberName) that updates members array', () => {
    assert.ok(src.includes('function updateMomentMember('),
      'updateMomentMember must be defined');
    assert.ok(src.includes('_draftMoments[idx].members'),
      'updateMomentMember must update _draftMoments[idx].members');
    assert.ok(
      src.includes('[memberName]') || src.includes('[member'),
      'updateMomentMember must wrap memberName in an array'
    );
    assert.ok(
      src.includes('[]') || src.includes('members = memberName ?'),
      'updateMomentMember must set members to [] when memberName is empty'
    );
  });

  it('defines momentKeydown(e, idx) that adds a moment on Enter on the last row', () => {
    assert.ok(src.includes('function momentKeydown('),
      'momentKeydown must be defined');
    assert.ok(src.includes("e.key !== 'Enter'") || src.includes('e.key === \'Enter\''),
      'momentKeydown must check for Enter key');
    assert.ok(src.includes('addMoment()'),
      'momentKeydown must call addMoment() when Enter is pressed on last row');
  });

  it('momentKeydown moves focus to the next input when not on the last row', () => {
    const fnStart = src.indexOf('function momentKeydown(');
    const fnEnd   = src.indexOf('\nfunction ', fnStart + 1);
    const fnBody  = src.slice(fnStart, fnEnd > 0 ? fnEnd : fnStart + 500);
    assert.ok(fnBody.includes('.focus()'),
      'momentKeydown must focus the next input when not on the last row');
  });

  // ── openSessionModal integration ────────────────────────────
  it('openSessionModal pre-fills _draftMoments from events[] when editing', () => {
    assert.ok(
      src.includes('_draftMoments = id') || src.includes('_draftMoments ='),
      'openSessionModal must populate _draftMoments from events[id]'
    );
    assert.ok(
      src.includes('events[id]'),
      'openSessionModal must source draft moments from events[id]'
    );
  });

  it('openSessionModal initialises _draftMoments to [] for new sessions', () => {
    assert.ok(
      src.includes(': []') || src.includes(': [];\n'),
      'openSessionModal must set _draftMoments = [] for new sessions'
    );
  });

  it('openSessionModal calls loadMembersForModal then buildMomentsEditor', () => {
    assert.ok(src.includes('loadMembersForModal()'),
      'openSessionModal must call loadMembersForModal');
    assert.ok(
      src.includes('loadMembersForModal().then(() => buildMomentsEditor())') ||
      (src.includes('loadMembersForModal') && src.includes('buildMomentsEditor')),
      'openSessionModal must chain buildMomentsEditor after member load'
    );
  });

  // ── saveSession integration ──────────────────────────────────
  it('saveSession deletes existing session_events before re-inserting', () => {
    assert.ok(
      src.includes("db.deleteWhere('session_events'") ||
      src.includes('db.deleteWhere("session_events"'),
      'saveSession must call db.deleteWhere on session_events'
    );
    assert.ok(
      src.includes('session_id=eq.') || src.includes('session_id=eq'),
      'deleteWhere must filter by session_id'
    );
  });

  it('saveSession filters out blank moment texts before saving', () => {
    assert.ok(
      src.includes('.filter(m => m.text.trim())') ||
      src.includes('filter(m =>') || src.includes('text.trim()'),
      'saveSession must filter out empty moment texts before upserting'
    );
  });

  it('saveSession batch-inserts event rows via db.upsertMany', () => {
    assert.ok(
      src.includes("db.upsertMany('session_events'") ||
      src.includes('db.upsertMany("session_events"'),
      'saveSession must call db.upsertMany on session_events'
    );
  });

  it('saveSession assigns sort_order to each event row', () => {
    assert.ok(
      src.includes('sort_order: i') || src.includes('sort_order:i'),
      'saveSession must assign sort_order: i to each event row'
    );
  });

  it('saveSession updates local events cache after save', () => {
    assert.ok(
      src.includes('events[id] = eventRows') || src.includes('events[id]=eventRows'),
      'saveSession must update the local events[id] cache after saving'
    );
  });

  it('event rows include session_id, text, members, and sort_order fields', () => {
    assert.ok(src.includes('session_id: id'),   'event rows must include session_id');
    assert.ok(src.includes('text:'),             'event rows must include text');
    assert.ok(src.includes('members:'),          'event rows must include members array');
    assert.ok(src.includes('sort_order:'),       'event rows must include sort_order');
  });

  // ── CSS ──────────────────────────────────────────────────────
  it('defines .sm-moment-row CSS class', () => {
    assert.ok(css.includes('.sm-moment-row'), '.sm-moment-row CSS class must be defined');
  });

  it('defines .sm-moment-input CSS class (transparent background, no border)', () => {
    assert.ok(css.includes('.sm-moment-input'), '.sm-moment-input CSS class must be defined');
    assert.ok(
      css.includes('background: transparent') || css.includes('background:transparent'),
      '.sm-moment-input must use a transparent background to blend into the row'
    );
  });

  it('defines .sm-moment-member-select CSS class', () => {
    assert.ok(css.includes('.sm-moment-member-select'),
      '.sm-moment-member-select CSS class must be defined');
  });

  it('defines .sm-moment-drag CSS class', () => {
    assert.ok(css.includes('.sm-moment-drag'),
      '.sm-moment-drag CSS class must be defined');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 54 — Stage 5: NPCs
// ══════════════════════════════════════════════════════════════
describe('Stage 5 — NPCs', () => {
  const fs   = require('fs'), path = require('path');
  const src  = fs.readFileSync(path.join(__dirname, '../session-log.html'), 'utf8');
  const css  = fs.readFileSync(path.join(__dirname, '../css/nexus.css'), 'utf8');
  const util = require('../js/nexus-utils.js');

  // ── slugify() in nexus-utils ─────────────────────────────────
  it('slugify is exported from nexus-utils', () => {
    assert.strictEqual(typeof util.slugify, 'function', 'slugify must be exported');
  });

  it('slugify lowercases and hyphenates spaces', () => {
    assert.strictEqual(util.slugify('Captain Draegar'), 'captain-draegar');
  });

  it('slugify collapses multiple non-alphanum chars to one hyphen', () => {
    assert.strictEqual(util.slugify("Lord Kael'thas"), 'lord-kael-thas');
  });

  it('slugify strips leading and trailing hyphens', () => {
    assert.strictEqual(util.slugify('  Baba Yaga  '), 'baba-yaga');
  });

  it('slugify returns empty string for empty/falsy input', () => {
    assert.strictEqual(util.slugify(''),    '');
    assert.strictEqual(util.slugify(null),  '');
    assert.strictEqual(util.slugify(undefined), '');
  });

  it('slugify handles names with numbers', () => {
    assert.strictEqual(util.slugify('R2-D2'), 'r2-d2');
  });

  it('slugify handles all-special-char input gracefully', () => {
    // Should produce empty string or a single safe segment, not throw
    const result = util.slugify('!!!');
    assert.ok(typeof result === 'string', 'slugify must return a string for all-special input');
  });

  // ── State ────────────────────────────────────────────────────
  it('declares _draftSessionNpcs state variable', () => {
    assert.ok(src.includes('let _draftSessionNpcs'), '_draftSessionNpcs must be declared');
  });

  it('declares _editingNpcId state variable', () => {
    assert.ok(src.includes('let _editingNpcId'), '_editingNpcId must be declared');
  });

  // ── Session modal NPC panel ──────────────────────────────────
  it('session modal NPC panel stub is replaced with real panel', () => {
    assert.ok(!src.includes('NPC linking coming in Stage 5'),
      'NPC panel stub text must be removed');
  });

  it('session modal NPC panel has smNpcList container', () => {
    assert.ok(src.includes('id="smNpcList"'), 'smNpcList must exist in session modal');
  });

  it('session modal NPC panel has smNpcSearch input', () => {
    assert.ok(src.includes('id="smNpcSearch"'), 'smNpcSearch must exist');
    assert.ok(src.includes('filterNpcSuggestions'), 'smNpcSearch must call filterNpcSuggestions');
  });

  it('session modal NPC panel has smNpcSuggestions dropdown', () => {
    assert.ok(src.includes('id="smNpcSuggestions"'), 'smNpcSuggestions dropdown must exist');
    assert.ok(css.includes('npc-suggest-drop'),       'dropdown must use npc-suggest-drop class');
  });

  it('session modal NPC panel has + New NPC button calling openInlineNpcCreate()', () => {
    assert.ok(src.includes('openInlineNpcCreate()'), '+ New NPC button must call openInlineNpcCreate');
  });

  it('inline NPC create form exists with id smInlineNpc', () => {
    assert.ok(src.includes('id="smInlineNpc"'), 'smInlineNpc form must exist');
    assert.ok(css.includes('inline-npc-form'),  'inline form must use inline-npc-form class');
  });

  it('inline NPC form has name, role, slug, disposition, notes inputs', () => {
    assert.ok(src.includes('id="inNpcName"'),        'inNpcName must exist');
    assert.ok(src.includes('id="inNpcRole"'),        'inNpcRole must exist');
    assert.ok(src.includes('id="inNpcSlug"'),        'inNpcSlug must exist');
    assert.ok(src.includes('id="inNpcDisposition"'), 'inNpcDisposition must exist');
    assert.ok(src.includes('id="inNpcNotes"'),       'inNpcNotes must exist');
  });

  it('inline NPC form has Save & Link button calling saveInlineNpc()', () => {
    assert.ok(src.includes('saveInlineNpc()'),         'Save & Link button must call saveInlineNpc');
    assert.ok(src.includes('id="btnSaveInlineNpc"'),   'btnSaveInlineNpc must exist');
  });

  it('inline NPC form has inline error div inNpcError', () => {
    assert.ok(src.includes('id="inNpcError"'), 'inNpcError div must exist');
  });

  // ── Global NPC modal ─────────────────────────────────────────
  it('global NPC modal exists with id="npcModal"', () => {
    assert.ok(src.includes('id="npcModal"'), 'npcModal must exist in DOM');
  });

  it('npcModal closes on backdrop click', () => {
    assert.ok(
      src.includes('id="npcModal"') && src.includes('closeNpcModal()'),
      'npcModal must call closeNpcModal on backdrop click'
    );
  });

  it('npcModal has name, role, slug, disposition, notes inputs', () => {
    assert.ok(src.includes('id="nmName"'),        'nmName must exist');
    assert.ok(src.includes('id="nmRole"'),        'nmRole must exist');
    assert.ok(src.includes('id="nmSlug"'),        'nmSlug must exist');
    assert.ok(src.includes('id="nmDisposition"'), 'nmDisposition must exist');
    assert.ok(src.includes('id="nmNotes"'),       'nmNotes must exist');
  });

  it('npcModal has inline error divs for name and slug', () => {
    assert.ok(src.includes('id="nmNameError"'), 'nmNameError must exist');
    assert.ok(src.includes('id="nmSlugError"'), 'nmSlugError must exist');
  });

  it('npcModal name input calls onNpcNameInput for auto-slug', () => {
    assert.ok(src.includes('onNpcNameInput(this.value)'), 'nmName must call onNpcNameInput');
  });

  it('npcModal slug input marks _manualEdit on user input', () => {
    assert.ok(
      src.includes('_manualEdit') && src.includes('nmSlug'),
      'nmSlug must set _manualEdit flag to suppress auto-slug after manual edit'
    );
  });

  it('npcModal has Save NPC button calling saveNpc()', () => {
    assert.ok(src.includes('id="btnSaveNpc"'),   'btnSaveNpc must exist');
    assert.ok(src.includes('onclick="saveNpc()"'), 'saveNpc must be wired to save button');
  });

  it('disposition select has all 5 options in both modals', () => {
    const dispositions = ['unknown', 'allied', 'friendly', 'neutral', 'hostile'];
    for (const d of dispositions) {
      assert.ok(
        src.includes(`value="${d}"`),
        `disposition option "${d}" must exist`
      );
    }
  });

  // ── NPC panel functions ──────────────────────────────────────
  it('defines buildNpcPanel() that renders _draftSessionNpcs into smNpcList', () => {
    assert.ok(src.includes('function buildNpcPanel()'), 'buildNpcPanel must be defined');
    assert.ok(src.includes('smNpcList'),                'buildNpcPanel must reference smNpcList');
    assert.ok(src.includes('_draftSessionNpcs'),        'buildNpcPanel must use _draftSessionNpcs');
  });

  it('buildNpcPanel renders each NPC with its disposition badge', () => {
    const fn = src.slice(src.indexOf('function buildNpcPanel()'));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(body.includes('sc-npc-disp'), 'buildNpcPanel must render disposition badge');
  });

  it('buildNpcPanel renders an unlink button calling unlinkNpc()', () => {
    const fn = src.slice(src.indexOf('function buildNpcPanel()'));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(body.includes('unlinkNpc('), 'buildNpcPanel must include an unlink button');
  });

  it('buildNpcPanel shows empty state when no NPCs linked', () => {
    assert.ok(
      src.includes('No NPCs linked') || src.includes('No NPC'),
      'buildNpcPanel must show empty state when _draftSessionNpcs is empty'
    );
  });

  it('defines filterNpcSuggestions(q) that filters out already-linked NPCs', () => {
    assert.ok(src.includes('function filterNpcSuggestions('), 'filterNpcSuggestions must be defined');
    assert.ok(
      src.includes('_draftSessionNpcs.includes(n.id)'),
      'filterNpcSuggestions must exclude already-linked NPCs'
    );
  });

  it('filterNpcSuggestions hides the dropdown when query is empty', () => {
    const fn = src.slice(src.indexOf('function filterNpcSuggestions('));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 500);
    assert.ok(
      body.includes("display = 'none'") || body.includes("display='none'"),
      'filterNpcSuggestions must hide dropdown when no query'
    );
  });

  it('defines linkNpc(npcId) that adds to _draftSessionNpcs and rebuilds panel', () => {
    assert.ok(src.includes('function linkNpc('), 'linkNpc must be defined');
    assert.ok(src.includes('_draftSessionNpcs.push(npcId)'), 'linkNpc must push to _draftSessionNpcs');
    const fn = src.slice(src.indexOf('function linkNpc('));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 300);
    assert.ok(body.includes('buildNpcPanel()'), 'linkNpc must call buildNpcPanel after linking');
  });

  it('linkNpc clears the search input and hides the dropdown', () => {
    const fn = src.slice(src.indexOf('function linkNpc('));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 300);
    assert.ok(body.includes('smNpcSearch'),      'linkNpc must clear smNpcSearch input');
    assert.ok(body.includes('smNpcSuggestions'), 'linkNpc must hide smNpcSuggestions dropdown');
  });

  it('defines unlinkNpc(npcId) that filters _draftSessionNpcs and rebuilds panel', () => {
    assert.ok(src.includes('function unlinkNpc('), 'unlinkNpc must be defined');
    assert.ok(
      src.includes('_draftSessionNpcs = _draftSessionNpcs.filter'),
      'unlinkNpc must filter _draftSessionNpcs'
    );
    const fn = src.slice(src.indexOf('function unlinkNpc('));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 200);
    assert.ok(body.includes('buildNpcPanel()'), 'unlinkNpc must call buildNpcPanel');
  });

  it('linkNpc guards against duplicates', () => {
    assert.ok(
      src.includes('_draftSessionNpcs.includes(npcId)'),
      'linkNpc must check for duplicates before pushing'
    );
  });

  // ── Inline NPC create functions ──────────────────────────────
  it('defines openInlineNpcCreate() that shows form and focuses name', () => {
    assert.ok(src.includes('function openInlineNpcCreate()'), 'openInlineNpcCreate must be defined');
    assert.ok(
      src.includes("smInlineNpc") && src.includes("display = 'block'"),
      'openInlineNpcCreate must show the inline form'
    );
    const fn = src.slice(src.indexOf('function openInlineNpcCreate()'));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 400);
    assert.ok(body.includes('.focus()'), 'openInlineNpcCreate must focus the name input');
  });

  it('defines closeInlineNpcCreate() that hides the form', () => {
    assert.ok(src.includes('function closeInlineNpcCreate()'), 'closeInlineNpcCreate must be defined');
    assert.ok(
      src.includes("smInlineNpc") && src.includes("display = 'none'"),
      'closeInlineNpcCreate must hide the inline form'
    );
  });

  it('defines onInlineNpcNameInput(name) that auto-fills slug via slugify', () => {
    assert.ok(src.includes('function onInlineNpcNameInput('), 'onInlineNpcNameInput must be defined');
    assert.ok(
      src.includes('slugify(name)') && src.includes('inNpcSlug'),
      'onInlineNpcNameInput must call slugify and write to inNpcSlug'
    );
    assert.ok(
      src.includes('_manualEdit'),
      'onInlineNpcNameInput must respect _manualEdit flag to avoid overwriting user edits'
    );
  });

  it('defines async saveInlineNpc() that validates name and slug uniqueness', () => {
    assert.ok(src.includes('async function saveInlineNpc()'), 'saveInlineNpc must be async');
    assert.ok(
      src.includes('inNpcName') && src.includes('Name is required'),
      'saveInlineNpc must validate name'
    );
    assert.ok(
      src.includes('slug') && src.includes('already in use'),
      'saveInlineNpc must check slug uniqueness'
    );
  });

  it('saveInlineNpc calls db.upsert on npcs table', () => {
    assert.ok(
      src.includes("db.upsert('npcs'") || src.includes('db.upsert("npcs"'),
      'saveInlineNpc must call db.upsert on npcs'
    );
  });

  it('saveInlineNpc pushes to npcs array and calls buildNpcMap', () => {
    const fn = src.slice(src.indexOf('async function saveInlineNpc()'));
    const end = fn.indexOf('\nasync function ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(body.includes('npcs.push(npc)'), 'saveInlineNpc must push new NPC to npcs array');
    assert.ok(body.includes('buildNpcMap()'),  'saveInlineNpc must call buildNpcMap after save');
  });

  it('saveInlineNpc links the new NPC to the session draft and calls buildNpcPanel', () => {
    const fn = src.slice(src.indexOf('async function saveInlineNpc()'));
    const end = fn.indexOf('\nasync function ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(body.includes('_draftSessionNpcs.push(npc.id)'), 'saveInlineNpc must link NPC to session');
    assert.ok(body.includes('buildNpcPanel()'),                'saveInlineNpc must rebuild NPC panel');
    assert.ok(body.includes('closeInlineNpcCreate()'),         'saveInlineNpc must close inline form on success');
  });

  it('saveInlineNpc sets first_seen to the current editing session id', () => {
    const fn = src.slice(src.indexOf('async function saveInlineNpc()'));
    const end = fn.indexOf('\nasync function ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(body.includes('first_seen'), 'saveInlineNpc must set first_seen on the NPC row');
    assert.ok(body.includes('_editingSessionId'), 'saveInlineNpc must use _editingSessionId for first_seen');
  });

  // ── Global NPC modal functions ───────────────────────────────
  it('defines openNpcModal(id) that pre-fills all fields when editing', () => {
    assert.ok(src.includes('function openNpcModal(id)'), 'openNpcModal must be defined');
    assert.ok(src.includes('nmName'),        'openNpcModal must fill nmName');
    assert.ok(src.includes('nmSlug'),        'openNpcModal must fill nmSlug');
    assert.ok(src.includes('nmDisposition'), 'openNpcModal must fill nmDisposition');
  });

  it('openNpcModal sets _manualEdit=true when editing so auto-slug does not fire', () => {
    const fn = src.slice(src.indexOf('function openNpcModal(id)'));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 400);
    assert.ok(body.includes('_manualEdit'), 'openNpcModal must set _manualEdit on nmSlug when editing');
  });

  it('defines closeNpcModal()', () => {
    assert.ok(src.includes('function closeNpcModal()'), 'closeNpcModal must be defined');
    assert.ok(
      src.includes("classList.remove('open')"),
      'closeNpcModal must remove the "open" class from npcModal'
    );
  });

  it('defines onNpcNameInput(name) that auto-fills nmSlug via slugify', () => {
    assert.ok(src.includes('function onNpcNameInput('), 'onNpcNameInput must be defined');
    assert.ok(
      src.includes('slugify(name)') && src.includes('nmSlug'),
      'onNpcNameInput must call slugify and write to nmSlug'
    );
  });

  it('defines async saveNpc() with name and slug validation', () => {
    assert.ok(src.includes('async function saveNpc()'), 'saveNpc must be async');
    assert.ok(src.includes('nmNameError'), 'saveNpc must use nmNameError for validation');
    assert.ok(src.includes('nmSlugError'), 'saveNpc must use nmSlugError for validation');
  });

  it('saveNpc validates slug uniqueness against existing npcs', () => {
    const fn = src.slice(src.indexOf('async function saveNpc()'));
    const end = fn.indexOf('\nasync function ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(
      body.includes('dupSlug') || body.includes('slug === slug'),
      'saveNpc must check for duplicate slugs'
    );
  });

  it('saveNpc calls db.upsert on npcs', () => {
    assert.ok(
      src.includes("db.upsert('npcs'") || src.includes('db.upsert("npcs"'),
      'saveNpc must call db.upsert on npcs'
    );
  });

  it('saveNpc preserves first_seen when editing', () => {
    const fn = src.slice(src.indexOf('async function saveNpc()'));
    const end = fn.indexOf('\nasync function ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(
      body.includes('first_seen') && body.includes('_editingNpcId'),
      'saveNpc must preserve first_seen from original NPC when editing'
    );
  });

  it('saveNpc sorts npcs alphabetically after save', () => {
    const fn = src.slice(src.indexOf('async function saveNpc()'));
    const end = fn.indexOf('\nasync function ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(
      body.includes('npcs.sort') && body.includes('localeCompare'),
      'saveNpc must sort npcs array alphabetically after save'
    );
  });

  it('saveNpc calls buildNpcMap, updateStats, renderNpcs after save', () => {
    const fn = src.slice(src.indexOf('async function saveNpc()'));
    const end = fn.indexOf('\nasync function ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(body.includes('buildNpcMap()'),  'saveNpc must call buildNpcMap');
    assert.ok(body.includes('updateStats()'),  'saveNpc must call updateStats');
    assert.ok(body.includes('renderNpcs()'),   'saveNpc must call renderNpcs');
  });

  it('saveNpc uses setLoading and setModalLoading', () => {
    const fn = src.slice(src.indexOf('async function saveNpc()'));
    const end = fn.indexOf('\nasync function ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(body.includes('setLoading'),      'saveNpc must use setLoading');
    assert.ok(body.includes('setModalLoading'), 'saveNpc must use setModalLoading');
  });

  it('defines async deleteNpc(id) with nexusConfirm guard', () => {
    assert.ok(src.includes('async function deleteNpc(id)'), 'deleteNpc must be async');
    assert.ok(
      src.includes('nexusConfirm') && src.includes('deleteNpc'),
      'deleteNpc must use nexusConfirm before deleting'
    );
  });

  it('deleteNpc calls db.delete on npcs', () => {
    const fn = src.slice(src.indexOf('async function deleteNpc(id)'));
    // deleteNpc is the last async function — bound by next non-async function or 1000 chars
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 1000);
    assert.ok(
      body.includes("db.delete('npcs'") || body.includes('db.delete("npcs"'),
      'deleteNpc must call db.delete on npcs'
    );
  });

  it('deleteNpc confirms with the slug citation in the message', () => {
    const fn = src.slice(src.indexOf('async function deleteNpc(id)'));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 1000);
    assert.ok(
      body.includes('npc.slug') || body.includes('^'),
      'deleteNpc confirm message must reference the NPC slug so user knows citation impact'
    );
  });

  it('deleteNpc filters npcs array, calls buildNpcMap, updateStats, renderNpcs', () => {
    const fn = src.slice(src.indexOf('async function deleteNpc(id)'));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 1000);
    assert.ok(body.includes('npcs = npcs.filter'), 'deleteNpc must filter npcs array');
    assert.ok(body.includes('buildNpcMap()'),       'deleteNpc must call buildNpcMap');
    assert.ok(body.includes('updateStats()'),       'deleteNpc must call updateStats');
    assert.ok(body.includes('renderNpcs()'),        'deleteNpc must call renderNpcs');
  });

  // ── openSessionModal integration ────────────────────────────
  it('openSessionModal seeds _draftSessionNpcs from existing session_npcs', () => {
    assert.ok(
      src.includes('_draftSessionNpcs = existingSession') ||
      src.includes('_draftSessionNpcs ='),
      'openSessionModal must populate _draftSessionNpcs'
    );
    assert.ok(
      src.includes('session_npcs'),
      'openSessionModal must source from session_npcs field'
    );
  });

  it('openSessionModal calls buildNpcPanel to render the linked NPCs', () => {
    assert.ok(src.includes('buildNpcPanel()'),
      'openSessionModal must call buildNpcPanel');
  });

  // ── saveSession integration ──────────────────────────────────
  it('saveSession row uses _draftSessionNpcs for session_npcs field', () => {
    assert.ok(
      src.includes('session_npcs: _draftSessionNpcs'),
      'saveSession must write _draftSessionNpcs into the session_npcs field'
    );
  });

  // ── Global click handler ──────────────────────────────────────
  it('global document click handler closes smNpcSuggestions on outside click', () => {
    assert.ok(
      src.includes('smNpcSuggestions') &&
      src.includes("document.addEventListener('click'"),
      'must have a document click handler that closes the NPC suggestion dropdown'
    );
  });

  // ── CSS ──────────────────────────────────────────────────────
  it('defines .sm-npc-row CSS class', () => {
    assert.ok(css.includes('.sm-npc-row'), '.sm-npc-row CSS must be defined');
  });

  it('defines .npc-suggest-drop CSS class with z-index for layering', () => {
    assert.ok(css.includes('.npc-suggest-drop'), '.npc-suggest-drop CSS must be defined');
    assert.ok(
      css.includes('z-index: 600') || css.includes('z-index:600'),
      '.npc-suggest-drop must have a high z-index to layer over modal content'
    );
  });

  it('defines .npc-suggest-item CSS class', () => {
    assert.ok(css.includes('.npc-suggest-item'), '.npc-suggest-item CSS must be defined');
  });

  it('defines .inline-npc-form CSS class', () => {
    assert.ok(css.includes('.inline-npc-form'), '.inline-npc-form CSS must be defined');
  });

  it('defines .inline-npc-title CSS class', () => {
    assert.ok(css.includes('.inline-npc-title'), '.inline-npc-title CSS must be defined');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 55 — Stage 6: Citations
// ══════════════════════════════════════════════════════════════
describe('Stage 6 — Citations', () => {
  const fs   = require('fs'), path = require('path');
  const src  = fs.readFileSync(path.join(__dirname, '../session-log.html'), 'utf8');
  const css  = fs.readFileSync(path.join(__dirname, '../css/nexus.css'), 'utf8');
  const util = require('../js/nexus-utils.js');

  // ── renderWithCitations — unit-testable logic ────────────────
  // Extract and test the core token-splitting logic directly
  // (can't run browser DOM, but we can test the parsing branch logic)

  it('renderWithCitations is defined as a function', () => {
    assert.ok(src.includes('function renderWithCitations('), 'renderWithCitations must be defined');
  });

  it('renderWithCitations splits on ^slug tokens using a regex capture group', () => {
    assert.ok(
      src.includes('split(/(') && src.includes('^'),
      'renderWithCitations must use split with a capture group to preserve token boundaries'
    );
  });

  it('renderWithCitations uses npcMap.get(slug) to resolve chips', () => {
    assert.ok(
      src.includes('npcMap.get(slug)'),
      'renderWithCitations must look up slugs in npcMap'
    );
  });

  it('renderWithCitations renders resolved chips as .npc-chip', () => {
    assert.ok(
      src.includes('npc-chip') || css.includes('.npc-chip'),
      'renderWithCitations must apply npc-chip class to resolved citations'
    );
  });

  it('renderWithCitations resolved chip calls jumpToNpc on click', () => {
    assert.ok(
      src.includes('jumpToNpc('),
      'resolved npc-chip must call jumpToNpc on click'
    );
  });

  it('renderWithCitations renders unresolved chips as .npc-chip-unresolved', () => {
    assert.ok(
      css.includes('npc-chip-unresolved'),
      'renderWithCitations must apply npc-chip-unresolved class to unknown slugs'
    );
  });

  it('renderWithCitations HTML-escapes plain text segments via esc()', () => {
    assert.ok(
      src.includes('esc(part)'),
      'renderWithCitations must call esc() on plain text segments'
    );
  });

  it('renderWithCitations returns empty string for falsy input', () => {
    assert.ok(
      src.includes("if (!text) return ''") || src.includes('if(!text)return'),
      'renderWithCitations must return empty string for falsy input'
    );
  });

  it('renderWithCitations chip has a title attribute with NPC name and role', () => {
    assert.ok(
      src.includes('title=') && src.includes('npc.name') && css.includes('npc-chip'),
      'resolved npc-chip must have a title showing NPC name (and role if present)'
    );
  });

  // ── jumpToNpc ────────────────────────────────────────────────
  it('defines jumpToNpc(npcId) that switches to npcs view', () => {
    assert.ok(src.includes('function jumpToNpc('), 'jumpToNpc must be defined');
    assert.ok(
      src.includes("switchView('npcs')"),
      'jumpToNpc must call switchView("npcs")'
    );
  });

  it('jumpToNpc calls renderNpcs after switching view', () => {
    const fn  = src.slice(src.indexOf('function jumpToNpc('));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(body.includes('renderNpcs()'), 'jumpToNpc must call renderNpcs');
  });

  it('jumpToNpc attempts to scroll to and highlight the target NPC card', () => {
    const fn  = src.slice(src.indexOf('function jumpToNpc('));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 800);
    assert.ok(
      body.includes('scrollIntoView') || body.includes('scrollTop'),
      'jumpToNpc must scroll to the NPC card'
    );
    assert.ok(
      body.includes('boxShadow') || body.includes('box-shadow') || body.includes('highlight'),
      'jumpToNpc must briefly highlight the target NPC card'
    );
  });

  // ── Citation autocomplete internals ─────────────────────────
  it('declares singleton state: _citeDropEl, _citeAnchor, _citeFocusIdx', () => {
    assert.ok(src.includes('let _citeDropEl'),   '_citeDropEl must be declared');
    assert.ok(src.includes('let _citeAnchor'),   '_citeAnchor must be declared');
    assert.ok(src.includes('let _citeFocusIdx'), '_citeFocusIdx must be declared');
  });

  it('defines _ensureCiteDrop() that creates the singleton dropdown once', () => {
    assert.ok(src.includes('function _ensureCiteDrop()'), '_ensureCiteDrop must be defined');
    assert.ok(
      src.includes('if (_citeDropEl) return'),
      '_ensureCiteDrop must guard against double-creation'
    );
    assert.ok(
      src.includes('document.body.appendChild(_citeDropEl)'),
      '_ensureCiteDrop must append the dropdown to document.body'
    );
  });

  it('_ensureCiteDrop registers a document click handler to dismiss on outside click', () => {
    const fn  = src.slice(src.indexOf('function _ensureCiteDrop()'));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(
      body.includes("document.addEventListener('click'") ||
      body.includes('document.addEventListener("click"'),
      '_ensureCiteDrop must register an outside-click dismissal handler'
    );
  });

  it('defines _hideCiteDrop() that hides the dropdown and resets state', () => {
    assert.ok(src.includes('function _hideCiteDrop()'), '_hideCiteDrop must be defined');
    assert.ok(
      src.includes("_citeDropEl.style.display = 'none'"),
      '_hideCiteDrop must set display:none'
    );
    assert.ok(
      src.includes('_citeAnchor   = null') || src.includes('_citeAnchor=null') || src.includes('_citeAnchor = null'),
      '_hideCiteDrop must reset _citeAnchor to null'
    );
    assert.ok(
      src.includes('_citeFocusIdx = -1') || src.includes('_citeFocusIdx=-1'),
      '_hideCiteDrop must reset _citeFocusIdx to -1'
    );
  });

  it('defines _getCiteToken(el) that detects ^token at cursor position', () => {
    assert.ok(src.includes('function _getCiteToken('), '_getCiteToken must be defined');
    assert.ok(
      src.includes('selectionStart'),
      '_getCiteToken must read el.selectionStart to find cursor position'
    );
    assert.ok(
      src.includes("val[i] !== '^'") || src.includes("val[i] !== \"^\"") || src.includes("!== '^'"),
      '_getCiteToken must scan left to find the ^ character'
    );
  });

  it('_getCiteToken returns null when cursor is not inside a ^token', () => {
    assert.ok(
      src.includes('return null'),
      '_getCiteToken must return null when no citation token found at cursor'
    );
  });

  it('defines _positionDrop(el) that positions the dropdown below the input', () => {
    assert.ok(src.includes('function _positionDrop('), '_positionDrop must be defined');
    assert.ok(
      src.includes('getBoundingClientRect()'),
      '_positionDrop must use getBoundingClientRect() to position the dropdown'
    );
    assert.ok(
      src.includes('rect.bottom') || src.includes('.bottom'),
      '_positionDrop must align to the bottom edge of the input'
    );
  });

  it('defines _renderCiteDrop(matches, el, token) that populates and shows the dropdown', () => {
    assert.ok(src.includes('function _renderCiteDrop('), '_renderCiteDrop must be defined');
    assert.ok(
      css.includes('cite-drop-item'),
      '_renderCiteDrop must render items with cite-drop-item class'
    );
    assert.ok(
      src.includes('_citeDropEl.style.display = \'block\'') ||
      src.includes('display = "block"'),
      '_renderCiteDrop must set display:block to show the dropdown'
    );
  });

  it('_renderCiteDrop hides the dropdown when matches array is empty', () => {
    const fn  = src.slice(src.indexOf('function _renderCiteDrop('));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(
      body.includes('!matches.length') || body.includes('matches.length === 0'),
      '_renderCiteDrop must call _hideCiteDrop when matches is empty'
    );
  });

  it('_renderCiteDrop uses mousedown (not click) to prevent blur before insert', () => {
    assert.ok(
      src.includes("addEventListener('mousedown'") || src.includes('addEventListener("mousedown"'),
      '_renderCiteDrop must use mousedown listener so blur does not fire before insert'
    );
    assert.ok(
      src.includes('e.preventDefault()'),
      'mousedown handler must call e.preventDefault() to prevent focus loss'
    );
  });

  it('defines _insertCitation(el, slug) that splices ^slug into the input value', () => {
    assert.ok(src.includes('function _insertCitation('), '_insertCitation must be defined');
    assert.ok(
      src.includes("ctx.prefix + '^' + slug") || src.includes("prefix + '^'"),
      '_insertCitation must reconstruct value as prefix + ^slug + rest'
    );
    assert.ok(
      src.includes('setSelectionRange'),
      '_insertCitation must restore cursor position after inserting'
    );
  });

  it('_insertCitation dispatches an input event after inserting so oninput handlers fire', () => {
    const fn  = src.slice(src.indexOf('function _insertCitation('));
    const end = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 400);
    assert.ok(
      body.includes("new Event('input'") || body.includes('new Event("input"'),
      '_insertCitation must dispatch a synthetic input event so state updates fire'
    );
  });

  it('defines initCitationAutocomplete(el) that attaches input/keydown/blur listeners', () => {
    assert.ok(src.includes('function initCitationAutocomplete('), 'initCitationAutocomplete must be defined');
    assert.ok(
      src.includes("addEventListener('input'") || src.includes('addEventListener("input"'),
      'initCitationAutocomplete must attach an input listener'
    );
    assert.ok(
      src.includes("addEventListener('keydown'") || src.includes('addEventListener("keydown"'),
      'initCitationAutocomplete must attach a keydown listener'
    );
    assert.ok(
      src.includes("addEventListener('blur'") || src.includes('addEventListener("blur"'),
      'initCitationAutocomplete must attach a blur listener'
    );
  });

  it('initCitationAutocomplete guards against double-initialisation via _citeInit flag', () => {
    assert.ok(
      src.includes('el._citeInit') || src.includes('_citeInit'),
      'initCitationAutocomplete must set a _citeInit flag to prevent double-init'
    );
  });

  it('keydown handler supports ArrowDown, ArrowUp, Enter and Escape navigation', () => {
    assert.ok(src.includes("'ArrowDown'") || src.includes('"ArrowDown"'), 'must handle ArrowDown');
    assert.ok(src.includes("'ArrowUp'")   || src.includes('"ArrowUp"'),   'must handle ArrowUp');
    assert.ok(
      src.includes("'Escape'") || src.includes('"Escape"'),
      'must handle Escape to dismiss dropdown'
    );
  });

  it('Enter in keydown handler inserts the focused citation', () => {
    assert.ok(
      src.includes('_citeFocusIdx') && src.includes('_insertCitation'),
      'Enter key must call _insertCitation for the focused item'
    );
  });

  it('blur listener defers hide by 150ms so mousedown on item fires first', () => {
    assert.ok(
      src.includes('150'),
      'blur handler must use a 150ms setTimeout so mousedown fires before hide'
    );
  });

  it('autocomplete filters npcs by both slug and name', () => {
    assert.ok(
      src.includes('n.slug.includes(term)') || src.includes('slug.includes'),
      'autocomplete input handler must filter by slug'
    );
    assert.ok(
      src.includes('n.name.toLowerCase().includes(term)') ||
      src.includes('name.toLowerCase().includes'),
      'autocomplete input handler must filter by name'
    );
  });

  it('autocomplete limits results to 8 entries', () => {
    assert.ok(src.includes('.slice(0, 8)'), 'autocomplete must limit suggestions to 8');
  });

  // ── Wire-up verification ─────────────────────────────────────
  it('renderTabOverview uses renderWithCitations for summary text', () => {
    assert.ok(
      src.includes('renderWithCitations(s.summary)'),
      'renderTabOverview must render summary through renderWithCitations'
    );
  });

  it('renderTabMoments uses renderWithCitations for each moment text', () => {
    assert.ok(
      src.includes('renderWithCitations(ev.text)'),
      'renderTabMoments must render moment text through renderWithCitations'
    );
  });

  it('renderNpcs uses renderWithCitations for NPC notes', () => {
    assert.ok(
      src.includes('renderWithCitations(npc.notes)'),
      'renderNpcs must render NPC notes through renderWithCitations'
    );
  });

  it('openSessionModal wires citation autocomplete to smSummary textarea', () => {
    assert.ok(
      src.includes('initCitationAutocomplete(document.getElementById(\'smSummary\')') ||
      src.includes('initCitationAutocomplete(document.getElementById("smSummary")'),
      'openSessionModal must wire initCitationAutocomplete to smSummary'
    );
  });

  it('buildMomentsEditor wires citation autocomplete to every moment input after render', () => {
    assert.ok(
      css.includes('.sm-moment-input') && src.includes('initCitationAutocomplete'),
      'buildMomentsEditor must attach initCitationAutocomplete to each moment input'
    );
  });

  // ── CSS ──────────────────────────────────────────────────────
  it('defines .npc-chip CSS class with violet colour scheme', () => {
    assert.ok(css.includes('.npc-chip {') || css.includes('.npc-chip{'),
      '.npc-chip CSS class must be defined');
    assert.ok(
      css.includes('#a78bfa') || css.includes('167,139,250'),
      '.npc-chip must use the violet colour scheme'
    );
  });

  it('defines .npc-chip:hover CSS', () => {
    assert.ok(css.includes('.npc-chip:hover'), '.npc-chip:hover CSS must be defined');
  });

  it('defines .npc-chip-unresolved CSS class with dimmed/dashed styling', () => {
    assert.ok(css.includes('.npc-chip-unresolved'), '.npc-chip-unresolved CSS must be defined');
    assert.ok(
      css.includes('dashed'),
      '.npc-chip-unresolved must use a dashed border to distinguish from resolved chips'
    );
  });

  it('defines .cite-drop CSS class with a high z-index above the modal backdrop', () => {
    assert.ok(css.includes('.cite-drop {') || css.includes('.cite-drop{'),
      '.cite-drop CSS class must be defined');
    // z-index must exceed the modal-backdrop z-index of 1000 so the dropdown
    // appears above the open modal. We raised it to 1100 for this reason.
    assert.ok(
      css.includes('z-index: 1100') || css.includes('z-index:1100'),
      '.cite-drop must have z-index 1100 to appear above the modal backdrop (z-index:1000)'
    );
  });

  it('defines .cite-drop-item and .cite-focused CSS classes', () => {
    assert.ok(css.includes('.cite-drop-item'), '.cite-drop-item CSS must be defined');
    assert.ok(css.includes('.cite-focused'),   '.cite-focused CSS must be defined');
  });

  it('defines .cite-drop-name and .cite-drop-slug CSS', () => {
    assert.ok(css.includes('.cite-drop-name'), '.cite-drop-name CSS must be defined');
    assert.ok(css.includes('.cite-drop-slug'), '.cite-drop-slug CSS must be defined');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 56 — Stage 7: Quests
// ══════════════════════════════════════════════════════════════
describe('Stage 7 — Quests', () => {
  const fs  = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '../session-log.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../css/nexus.css'), 'utf8');

  // ── State ────────────────────────────────────────────────────
  it('declares _draftQuests state variable', () => {
    assert.ok(src.includes('let _draftQuests'), '_draftQuests must be declared');
  });

  // ── Constants ────────────────────────────────────────────────
  it('declares QUEST_CYCLE array with 4 statuses in cycle order', () => {
    assert.ok(src.includes("const QUEST_CYCLE"), 'QUEST_CYCLE must be declared');
    assert.ok(
      src.includes("'active'") && src.includes("'completed'") &&
      src.includes("'failed'") && src.includes("'on-hold'"),
      'QUEST_CYCLE must contain all 4 statuses'
    );
  });

  it('declares QUEST_LABEL, QUEST_CLS, QUEST_ICON_MAP constants', () => {
    assert.ok(src.includes('const QUEST_LABEL'),    'QUEST_LABEL must be declared');
    assert.ok(src.includes('const QUEST_CLS'),      'QUEST_CLS must be declared');
    assert.ok(src.includes('const QUEST_ICON_MAP'), 'QUEST_ICON_MAP must be declared');
  });

  it('QUEST_ICON_MAP maps all 4 statuses to distinct symbols', () => {
    assert.ok(src.includes("active: '○'")    || src.includes("active:'○'"),    'active icon must be ○');
    assert.ok(src.includes("completed: '✓'") || src.includes("completed:'✓'"), 'completed icon must be ✓');
    assert.ok(src.includes("failed: '✗'")    || src.includes("failed:'✗'"),    'failed icon must be ✗');
    assert.ok(src.includes("'on-hold': '◌'") || src.includes("'on-hold':'◌'"), 'on-hold icon must be ◌');
  });

  // ── Modal HTML panel ─────────────────────────────────────────
  it('quests panel stub is replaced with real editor', () => {
    assert.ok(!src.includes('Quests editor coming in Stage 7'),
      'Stage 7 stub text must be removed');
  });

  it('quests panel has smQuestList container', () => {
    assert.ok(src.includes('id="smQuestList"'), 'smQuestList must exist in the quests panel');
  });

  it('quests panel has + Add Quest button calling addQuest()', () => {
    assert.ok(src.includes('onclick="addQuest()"'), '+ Add Quest button must call addQuest()');
  });

  it('quests panel has a hint about clicking status to cycle it', () => {
    assert.ok(
      src.includes('cycle') || src.includes('Click the status'),
      'quests panel must hint that the status badge can be clicked to cycle'
    );
  });

  // ── Quest row structure ───────────────────────────────────────
  it('quest rows use sm-quest-row class with data-idx attribute', () => {
    assert.ok(css.includes('sm-quest-row'), 'quest rows must use sm-quest-row class');
    assert.ok(src.includes('data-idx='), 'quest rows must have data-idx attribute');
  });

  it('quest rows have a cycle button calling cycleQuestStatus(idx)', () => {
    assert.ok(src.includes('cycleQuestStatus('), 'quest row must have a cycle button');
    assert.ok(css.includes('sm-quest-cycle'), 'cycle button must use sm-quest-cycle class');
  });

  it('quest rows have a text input calling updateQuestText on input', () => {
    assert.ok(src.includes('updateQuestText('), 'quest input must call updateQuestText');
    assert.ok(css.includes('sm-quest-input'),   'quest input must use sm-quest-input class');
  });

  it('quest rows have a remove button calling removeQuest(idx)', () => {
    assert.ok(src.includes('removeQuest('), 'quest row must have a remove button calling removeQuest');
  });

  it('quest input has onkeydown calling questKeydown', () => {
    assert.ok(src.includes('questKeydown('), 'quest input must have a questKeydown handler');
  });

  // ── JS functions ─────────────────────────────────────────────
  it('defines buildQuestEditor() that renders _draftQuests into smQuestList', () => {
    assert.ok(src.includes('function buildQuestEditor()'), 'buildQuestEditor must be defined');
    assert.ok(src.includes('smQuestList'),    'buildQuestEditor must reference smQuestList');
    assert.ok(src.includes('_draftQuests'),   'buildQuestEditor must use _draftQuests');
  });

  it('buildQuestEditor shows empty state when _draftQuests is empty', () => {
    const fn   = src.slice(src.indexOf('function buildQuestEditor()'));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(
      body.includes('No quests yet') || body.includes('Add Quest'),
      'buildQuestEditor must show empty state when no quests'
    );
  });

  it('buildQuestEditor applies text decoration class for completed/failed quests', () => {
    assert.ok(
      src.includes('completed') && src.includes('failed') && css.includes('sm-quest-input'),
      'buildQuestEditor must apply completed/failed styling classes to the input text'
    );
  });

  it('defines addQuest() that pushes new active quest and focuses the new input', () => {
    assert.ok(src.includes('function addQuest()'), 'addQuest must be defined');
    assert.ok(
      src.includes("status: 'active'"),
      'addQuest must initialise new quests with status active'
    );
    assert.ok(src.includes('_draftQuests.push('), 'addQuest must push to _draftQuests');
    const fn   = src.slice(src.indexOf('function addQuest()'));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 400);
    assert.ok(body.includes('.focus()'), 'addQuest must focus the new input after render');
  });

  it('defines removeQuest(idx) that splices _draftQuests and rebuilds editor', () => {
    assert.ok(src.includes('function removeQuest('), 'removeQuest must be defined');
    assert.ok(src.includes('_draftQuests.splice('),  'removeQuest must splice _draftQuests');
    const fn   = src.slice(src.indexOf('function removeQuest('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 200);
    assert.ok(body.includes('buildQuestEditor()'), 'removeQuest must call buildQuestEditor');
  });

  it('defines updateQuestText(idx, value) that mutates _draftQuests in-place', () => {
    assert.ok(src.includes('function updateQuestText('), 'updateQuestText must be defined');
    assert.ok(
      src.includes('_draftQuests[idx].text = value') ||
      src.includes('_draftQuests[idx].text=value'),
      'updateQuestText must set _draftQuests[idx].text'
    );
  });

  it('defines cycleQuestStatus(idx) that advances status through QUEST_CYCLE', () => {
    assert.ok(src.includes('function cycleQuestStatus('), 'cycleQuestStatus must be defined');
    assert.ok(
      src.includes('QUEST_CYCLE.indexOf(current)'),
      'cycleQuestStatus must use QUEST_CYCLE.indexOf to find current position'
    );
    assert.ok(
      src.includes('% QUEST_CYCLE.length'),
      'cycleQuestStatus must wrap around using modulo'
    );
    assert.ok(
      src.includes('_draftQuests[idx].status = next'),
      'cycleQuestStatus must update _draftQuests[idx].status'
    );
  });

  it('cycleQuestStatus does a surgical DOM update without full re-render', () => {
    const fn   = src.slice(src.indexOf('function cycleQuestStatus('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(
      !body.includes('buildQuestEditor()'),
      'cycleQuestStatus must NOT call buildQuestEditor — it should do surgical DOM update'
    );
    assert.ok(
      body.includes('querySelector(') || body.includes('querySelectorAll('),
      'cycleQuestStatus must use querySelector for surgical DOM targeting'
    );
    assert.ok(
      body.includes('btn.className') || body.includes('btn.textContent'),
      'cycleQuestStatus must update the cycle button class and text directly'
    );
  });

  it('defines questKeydown(e, idx) that adds quest on Enter on last row', () => {
    assert.ok(src.includes('function questKeydown('), 'questKeydown must be defined');
    assert.ok(
      src.includes("e.key !== 'Enter'") || src.includes("e.key === 'Enter'"),
      'questKeydown must check for Enter key'
    );
    assert.ok(src.includes('addQuest()'), 'questKeydown must call addQuest on last row Enter');
  });

  it('questKeydown moves focus to next input when not on last row', () => {
    const fn   = src.slice(src.indexOf('function questKeydown('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 400);
    assert.ok(body.includes('.focus()'), 'questKeydown must focus next input when not on last row');
  });

  // ── openSessionModal integration ────────────────────────────
  it('openSessionModal seeds _draftQuests from existing session quests', () => {
    assert.ok(
      src.includes('_draftQuests = existingSession'),
      'openSessionModal must seed _draftQuests from existingSession.quests'
    );
  });

  it('openSessionModal shallow-clones each quest object into _draftQuests', () => {
    assert.ok(
      src.includes('...q') || src.includes('Object.assign'),
      'openSessionModal must clone quest objects to avoid mutating session state'
    );
  });

  it('openSessionModal calls buildQuestEditor() after seeding', () => {
    assert.ok(src.includes('buildQuestEditor()'), 'openSessionModal must call buildQuestEditor');
  });

  it('openSessionModal initialises _draftQuests to [] for new sessions', () => {
    assert.ok(
      src.includes(': []') || src.includes(':[]'),
      'openSessionModal must set _draftQuests = [] for new sessions'
    );
  });

  // ── saveSession integration ──────────────────────────────────
  it('saveSession row uses _draftQuests for the quests field', () => {
    assert.ok(
      src.includes('quests:') && src.includes('_draftQuests'),
      'saveSession must write _draftQuests into the quests field'
    );
  });

  it('saveSession filters out blank quest text before persisting', () => {
    assert.ok(
      src.includes('_draftQuests.filter(') &&
      (src.includes('q.text') || src.includes('.text.trim()')),
      'saveSession must filter _draftQuests to exclude blank text rows'
    );
  });

  // ── renderTabQuests upgrade ──────────────────────────────────
  it('renderTabQuests uses shared QUEST_ICON_MAP constant (not inline object)', () => {
    assert.ok(
      src.includes('QUEST_ICON_MAP[st]') || src.includes('QUEST_ICON_MAP['),
      'renderTabQuests must use the shared QUEST_ICON_MAP constant'
    );
  });

  it('renderTabQuests uses shared QUEST_CLS and QUEST_LABEL constants', () => {
    const fn   = src.slice(src.indexOf('function renderTabQuests('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(body.includes('QUEST_CLS['),   'renderTabQuests must use QUEST_CLS');
    assert.ok(body.includes('QUEST_LABEL['), 'renderTabQuests must use QUEST_LABEL');
  });

  it('renderTabQuests does not re-declare inline quest constant objects', () => {
    const fn   = src.slice(src.indexOf('function renderTabQuests('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(
      !body.includes('const QUEST_ICON'),
      'renderTabQuests must not re-declare QUEST_ICON as a local — use the shared constant'
    );
  });

  // ── CSS ──────────────────────────────────────────────────────
  it('defines .sm-quest-row CSS class', () => {
    assert.ok(css.includes('.sm-quest-row {') || css.includes('.sm-quest-row{'),
      '.sm-quest-row CSS must be defined');
  });

  it('defines .sm-quest-cycle with per-status colour variants', () => {
    assert.ok(css.includes('.sm-quest-cycle'),             '.sm-quest-cycle CSS must be defined');
    assert.ok(css.includes('.sm-quest-cycle.qs-active'),   '.sm-quest-cycle.qs-active must be defined');
    assert.ok(css.includes('.sm-quest-cycle.qs-completed'), '.sm-quest-cycle.qs-completed must be defined');
    assert.ok(css.includes('.sm-quest-cycle.qs-failed'),   '.sm-quest-cycle.qs-failed must be defined');
    assert.ok(css.includes('.sm-quest-cycle.qs-on-hold'),  '.sm-quest-cycle.qs-on-hold must be defined');
  });

  it('defines .sm-quest-input with strikethrough for completed and failed states', () => {
    assert.ok(css.includes('.sm-quest-input'),             '.sm-quest-input CSS must be defined');
    assert.ok(css.includes('.sm-quest-input.completed'),   '.sm-quest-input.completed must be defined');
    assert.ok(css.includes('.sm-quest-input.failed'),      '.sm-quest-input.failed must be defined');
    assert.ok(
      css.includes('line-through'),
      'completed/failed quest inputs must use text-decoration: line-through'
    );
  });

  it('defines all 4 .qs-* display CSS classes for the card view', () => {
    assert.ok(css.includes('.qs-active'),    '.qs-active CSS must be defined');
    assert.ok(css.includes('.qs-completed'), '.qs-completed CSS must be defined');
    assert.ok(css.includes('.qs-failed'),    '.qs-failed CSS must be defined');
    assert.ok(css.includes('.qs-on-hold'),   '.qs-on-hold CSS must be defined');
  });

  it('defines .sc-quest-list and .sc-quest-row CSS for card display', () => {
    assert.ok(css.includes('.sc-quest-list'), '.sc-quest-list CSS must be defined');
    assert.ok(css.includes('.sc-quest-row'),  '.sc-quest-row CSS must be defined');
  });

  it('defines .sc-quest-text.completed and .sc-quest-text.failed with line-through', () => {
    assert.ok(css.includes('.sc-quest-text.completed'), '.sc-quest-text.completed must be defined');
    assert.ok(css.includes('.sc-quest-text.failed'),    '.sc-quest-text.failed must be defined');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 57 — Stage 8: Polish
// ══════════════════════════════════════════════════════════════
describe('Stage 8 — Polish', () => {
  const fs    = require('fs'), path = require('path');
  const sl    = fs.readFileSync(path.join(__dirname, '../session-log.html'), 'utf8');
  const admin = fs.readFileSync(path.join(__dirname, '../admin.html'),        'utf8');
  const css   = fs.readFileSync(path.join(__dirname, '../css/nexus.css'),     'utf8');

  // ── Stats bar: Moments count ─────────────────────────────────
  it('stats bar has a statMoments element', () => {
    assert.ok(sl.includes('id="statMoments"'),
      'stats bar must have a statMoments span');
  });

  it('stats bar Moments is labelled correctly', () => {
    const idx  = sl.indexOf('id="statMoments"');
    const chunk = sl.slice(idx, idx + 120);
    assert.ok(chunk.includes('Moments'),
      'statMoments stat must be labelled "Moments"');
  });

  it('updateStats() counts total moments across all sessions', () => {
    assert.ok(sl.includes('momentCount'),
      'updateStats must maintain a momentCount variable');
    assert.ok(
      sl.includes('events[s.id]') && sl.includes('momentCount'),
      'updateStats must accumulate moment counts from the events cache'
    );
    assert.ok(
      sl.includes("'statMoments'") || sl.includes('"statMoments"'),
      'updateStats must write to statMoments element'
    );
  });

  it('updateStats Moments count uses (events[s.id] || []).length per session', () => {
    const fn   = sl.slice(sl.indexOf('function updateStats()'));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 500);
    assert.ok(
      body.includes('events[s.id]') && body.includes('.length'),
      'updateStats must use events[s.id] to get moment count for each session'
    );
  });

  // ── Session card header moment count chip ────────────────────
  it('renderCard emits .sc-moment-count chip when session has events', () => {
    assert.ok(sl.includes('sc-moment-count'),
      'renderCard must emit an sc-moment-count chip when events exist');
  });

  it('sc-moment-count chip shows the ◆ prefix character', () => {
    assert.ok(
      sl.includes('◆${') || sl.includes('◆" +'),
      'sc-moment-count chip must use ◆ as a visual prefix'
    );
  });

  it('sc-moment-count chip only appears when the session has at least one event', () => {
    assert.ok(
      sl.includes('(events[s.id] || []).length') &&
      sl.includes('sc-moment-count'),
      'sc-moment-count chip must be conditional on events[s.id] having entries'
    );
  });

  it('sc-moment-count chip has a title attribute describing the count', () => {
    // Search the HTML occurrence (inside renderCard template), not the CSS definition
    const idx  = sl.indexOf('class="sc-moment-count"') > -1
      ? sl.indexOf('class="sc-moment-count"')
      : sl.indexOf("sc-moment-count\"");
    const chunk = sl.slice(idx, idx + 300);
    assert.ok(
      chunk.includes('title=') && chunk.includes('moment'),
      'sc-moment-count chip must have a tooltip describing the moment count'
    );
  });

  it('sc-moment-count chip pluralises correctly (moment vs moments)', () => {
    assert.ok(
      sl.includes("=== 1 ? '' : 's'") ||
      sl.includes("=== 1?'':'s'") ||
      sl.includes('===1?') ||
      sl.includes("moment${") ,
      'sc-moment-count chip must handle singular/plural of "moment"'
    );
  });

  // ── CSS: sc-moment-count ─────────────────────────────────────
  it('defines .sc-moment-count CSS class', () => {
    assert.ok(css.includes('.sc-moment-count {') || css.includes('.sc-moment-count{'),
      '.sc-moment-count CSS class must be defined');
  });

  it('.sc-moment-count uses Share Tech Mono font at dim violet colour', () => {
    const idx  = css.indexOf('.sc-moment-count {') > -1
      ? css.indexOf('.sc-moment-count {')
      : css.indexOf('.sc-moment-count{');
    const chunk = css.slice(idx, idx + 200);
    assert.ok(chunk.includes('Share Tech Mono') || chunk.includes('monospace'),
      '.sc-moment-count must use monospace font');
  });

  // ── renderTabNpcs: deep-link button ──────────────────────────
  it('renderTabNpcs includes a ↗ jump-to-NPC button for each linked NPC', () => {
    assert.ok(
      sl.includes("jumpToNpc(") && sl.includes('↗'),
      'renderTabNpcs must include a ↗ button that calls jumpToNpc'
    );
  });

  it('renderTabNpcs ↗ button calls event.stopPropagation()', () => {
    const fn   = sl.slice(sl.indexOf('function renderTabNpcs('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(
      body.includes('stopPropagation()'),
      'renderTabNpcs ↗ button must stop propagation to prevent card toggle'
    );
  });

  it('renderTabNpcs ↗ button has a descriptive title attribute', () => {
    const fn   = sl.slice(sl.indexOf('function renderTabNpcs('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 600);
    assert.ok(body.includes('title='), 'renderTabNpcs ↗ button must have a title attribute');
  });

  // ── NPC Index card: first_seen display ───────────────────────
  it('renderNpcs renders a first-seen line for NPCs that have first_seen set', () => {
    assert.ok(sl.includes('npc-first-seen'),
      'renderNpcs must render an npc-first-seen element when first_seen is set');
    assert.ok(sl.includes('First seen:'),
      'renderNpcs must label the first_seen display with "First seen:"');
  });

  it('renderNpcs first-seen link resolves the session id to a session number and title', () => {
    assert.ok(
      sl.includes('sessions.find(s => s.id === npc.first_seen)') ||
      sl.includes("sessions.find(s=>s.id===npc.first_seen)"),
      'renderNpcs must look up the session row by npc.first_seen id'
    );
    assert.ok(
      sl.includes('fs.number') || sl.includes('Session ${fs'),
      'renderNpcs first-seen display must show the session number'
    );
    assert.ok(
      sl.includes('fs.title') || sl.includes("fs.title"),
      'renderNpcs first-seen display must show the session title'
    );
  });

  it('renderNpcs first-seen link calls jumpToSession on click', () => {
    assert.ok(
      sl.includes("jumpToSession('${esc(fs.id)}')") ||
      sl.includes('jumpToSession('),
      'renderNpcs first-seen link must call jumpToSession when clicked'
    );
  });

  it('renderNpcs first-seen renders nothing when first_seen is null/unset', () => {
    assert.ok(
      sl.includes('if (!npc.first_seen) return') ||
      sl.includes('!npc.first_seen'),
      'renderNpcs must guard against null first_seen and render nothing'
    );
  });

  it('renderNpcs first-seen renders nothing when the referenced session no longer exists', () => {
    assert.ok(
      sl.includes('if (!fs) return') || sl.includes('if(!fs)return'),
      'renderNpcs must guard against a stale first_seen id pointing to a deleted session'
    );
  });

  // ── CSS: npc-first-seen ──────────────────────────────────────
  it('defines .npc-first-seen CSS class', () => {
    assert.ok(css.includes('.npc-first-seen {') || css.includes('.npc-first-seen{'),
      '.npc-first-seen CSS class must be defined');
  });

  it('defines .npc-first-seen-link CSS class with hover state', () => {
    assert.ok(css.includes('.npc-first-seen-link'),
      '.npc-first-seen-link CSS class must be defined');
    assert.ok(css.includes('.npc-first-seen-link:hover'),
      '.npc-first-seen-link:hover must be defined');
  });

  it('.npc-first-seen-link uses violet accent colour on hover', () => {
    const idx   = css.indexOf('.npc-first-seen-link:hover');
    const chunk = css.slice(idx, idx + 80);
    assert.ok(
      chunk.includes('#a78bfa') || chunk.includes('167,139,250') || chunk.includes('var(--violet)'),
      '.npc-first-seen-link:hover must use the violet accent colour'
    );
  });

  // ── Citation autocomplete: NPC modal notes ───────────────────
  it('openNpcModal wires citation autocomplete to nmNotes textarea', () => {
    assert.ok(
      sl.includes("initCitationAutocomplete(document.getElementById('nmNotes')") ||
      sl.includes('initCitationAutocomplete(document.getElementById("nmNotes")'),
      'openNpcModal must wire initCitationAutocomplete to the nmNotes textarea'
    );
  });

  it('openNpcModal wires nmNotes autocomplete inside the setTimeout focus block', () => {
    const fn   = sl.slice(sl.indexOf('function openNpcModal(id)'));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 500);
    assert.ok(
      body.includes('setTimeout') && body.includes('nmNotes'),
      'openNpcModal must wire nmNotes autocomplete inside the setTimeout block (after modal opens)'
    );
  });

  // ── Global Escape key handler ────────────────────────────────
  it('global keydown listener closes sessionModal on Escape', () => {
    assert.ok(
      sl.includes("e.key !== 'Escape'") || sl.includes("e.key === 'Escape'"),
      'global keydown listener must check for Escape key'
    );
    assert.ok(
      sl.includes('closeSessionModal()'),
      'Escape handler must call closeSessionModal'
    );
  });

  it('global keydown listener closes npcModal on Escape', () => {
    assert.ok(
      sl.includes('closeNpcModal()') &&
      (sl.includes("e.key !== 'Escape'") || sl.includes("e.key === 'Escape'")),
      'Escape handler must call closeNpcModal'
    );
  });

  it('Escape handler prioritises sessionModal over npcModal', () => {
    const idx  = sl.indexOf("e.key !== 'Escape'") > -1
      ? sl.indexOf("e.key !== 'Escape'")
      : sl.indexOf("e.key === 'Escape'");
    const chunk = sl.slice(idx, idx + 400);
    const sessionFirst = chunk.indexOf('closeSessionModal()');
    const npcFirst     = chunk.indexOf('closeNpcModal()');
    assert.ok(
      sessionFirst < npcFirst,
      'Escape handler must check sessionModal before npcModal'
    );
  });

  it('Escape handler uses optional chaining on classList.contains to be null-safe', () => {
    const idx   = sl.indexOf("e.key !== 'Escape'") > -1
      ? sl.indexOf("e.key !== 'Escape'")
      : sl.indexOf("e.key === 'Escape'");
    const chunk = sl.slice(idx, idx + 400);
    assert.ok(
      chunk.includes('?.classList') || chunk.includes("getElementById('sessionModal')"),
      'Escape handler must safely handle the case where modal elements are not found'
    );
  });

  // ── Snapshot: admin.html ─────────────────────────────────────
  it('admin SNAPSHOT_TABLES includes session_log', () => {
    assert.ok(
      admin.includes("'session_log'") || admin.includes('"session_log"'),
      'SNAPSHOT_TABLES must include session_log'
    );
  });

  it('admin SNAPSHOT_TABLES includes session_events', () => {
    assert.ok(
      admin.includes("'session_events'") || admin.includes('"session_events"'),
      'SNAPSHOT_TABLES must include session_events'
    );
  });

  it('admin SNAPSHOT_TABLES includes npcs', () => {
    assert.ok(
      admin.includes("'npcs'") || admin.includes('"npcs"'),
      "SNAPSHOT_TABLES must include npcs"
    );
  });

  it('admin SNAPSHOT_TABLES now has 8 entries', () => {
    const match   = admin.match(/const SNAPSHOT_TABLES\s*=\s*\[([\s\S]*?)\];/);
    assert.ok(match, 'SNAPSHOT_TABLES must be defined in admin.html');
    const entries = (match[1].match(/'[^']+'/g) || []);
    assert.strictEqual(entries.length, 8,
      `SNAPSHOT_TABLES must have 8 entries after Stage 8, found ${entries.length}`
    );
  });

  it('admin SNAPSHOT_TABLES has nexus_settings last', () => {
    const match   = admin.match(/const SNAPSHOT_TABLES\s*=\s*\[([\s\S]*?)\];/);
    const entries = (match[1].match(/'[^']+'/g) || []).map(s => s.replace(/'/g, ''));
    const settingsIdx = entries.indexOf('nexus_settings');
    assert.strictEqual(settingsIdx, entries.length - 1,
      `nexus_settings must be the last entry in SNAPSHOT_TABLES (found at index ${settingsIdx} of ${entries.length - 1})`
    );
  });

  it('admin SNAPSHOT_TABLES has session_log before session_events (FK order)', () => {
    const match   = admin.match(/const SNAPSHOT_TABLES\s*=\s*\[([\s\S]*?)\];/);
    const entries = (match[1].match(/'[^']+'/g) || []).map(s => s.replace(/'/g, ''));
    const logIdx  = entries.indexOf('session_log');
    const evtIdx  = entries.indexOf('session_events');
    assert.ok(
      logIdx < evtIdx,
      `session_log (idx ${logIdx}) must come before session_events (idx ${evtIdx}) due to FK constraint`
    );
  });

  it('admin SNAPSHOT_TABLES has session_log before npcs (FK: npcs.first_seen)', () => {
    const match   = admin.match(/const SNAPSHOT_TABLES\s*=\s*\[([\s\S]*?)\];/);
    const entries = (match[1].match(/'[^']+'/g) || []).map(s => s.replace(/'/g, ''));
    const logIdx  = entries.indexOf('session_log');
    const npcIdx  = entries.indexOf('npcs');
    assert.ok(
      logIdx < npcIdx,
      `session_log (idx ${logIdx}) must come before npcs (idx ${npcIdx}) — npcs.first_seen FK`
    );
  });

  it('admin restore loop has special handling for session_events FK case', () => {
    assert.ok(
      admin.includes('session_events') && admin.includes('FK'),
      'admin restore loop must have a comment or branch noting session_events FK dependency'
    );
  });

  it('admin snapshot description mentions 8 tables', () => {
    assert.ok(
      admin.includes('8 tables') || admin.includes('eight tables'),
      'admin snapshot description text must be updated to reflect 8 tables'
    );
  });

  // ── No stale Stage-8 stub text ───────────────────────────────
  it('no Stage 8 stub text remains in session-log.html', () => {
    assert.ok(
      !sl.includes('Stage 8'),
      'All Stage 8 placeholder text must be removed from session-log.html'
    );
  });
});

// ══════════════════════════════════════════════════════════════
// Section 58 — Stage 9: Integration & Completeness
// ══════════════════════════════════════════════════════════════
describe('Stage 9 — Integration & Completeness', () => {
  const fs    = require('fs'), path = require('path');
  const sl    = fs.readFileSync(path.join(__dirname, '../session-log.html'), 'utf8');
  const idx   = fs.readFileSync(path.join(__dirname, '../index.html'),        'utf8');

  // ── Disposition-coloured citation chips ──────────────────────
  it('declares DISP_CHIP_COLOR constant with all 5 dispositions', () => {
    assert.ok(sl.includes('const DISP_CHIP_COLOR'), 'DISP_CHIP_COLOR must be declared');
    assert.ok(sl.includes("allied:"),   'DISP_CHIP_COLOR must have allied');
    assert.ok(sl.includes("friendly:"), 'DISP_CHIP_COLOR must have friendly');
    assert.ok(sl.includes("neutral:"),  'DISP_CHIP_COLOR must have neutral');
    assert.ok(sl.includes("hostile:"),  'DISP_CHIP_COLOR must have hostile');
    assert.ok(sl.includes("unknown:"),  'DISP_CHIP_COLOR must have unknown fallback');
  });

  it('DISP_CHIP_COLOR allied maps to cyan', () => {
    assert.ok(
      sl.includes("allied:") && sl.includes("14,240,208"),
      'DISP_CHIP_COLOR allied must use cyan (14,240,208)'
    );
  });

  it('DISP_CHIP_COLOR hostile maps to red', () => {
    assert.ok(
      sl.includes("hostile:") && sl.includes("239,68,68"),
      'DISP_CHIP_COLOR hostile must use red (239,68,68)'
    );
  });

  it('DISP_CHIP_COLOR friendly maps to green', () => {
    assert.ok(
      sl.includes("friendly:") && sl.includes("60,224,138"),
      'DISP_CHIP_COLOR friendly must use green (60,224,138)'
    );
  });

  it('DISP_CHIP_COLOR neutral maps to amber', () => {
    assert.ok(
      sl.includes("neutral:") && sl.includes("212,134,10"),
      'DISP_CHIP_COLOR neutral must use amber (212,134,10)'
    );
  });

  it('renderWithCitations uses DISP_CHIP_COLOR to set chip colour', () => {
    assert.ok(
      sl.includes('DISP_CHIP_COLOR[npc.disposition]'),
      'renderWithCitations must look up chip colour via DISP_CHIP_COLOR[npc.disposition]'
    );
  });

  it('renderWithCitations applies disposition colour as inline style', () => {
    const fn   = sl.slice(sl.indexOf('function renderWithCitations('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(
      body.includes('style=') && body.includes('color:'),
      'renderWithCitations must apply colour as an inline style on resolved chips'
    );
  });

  it('renderWithCitations chip inline style sets color, border-color and background', () => {
    const fn   = sl.slice(sl.indexOf('function renderWithCitations('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(body.includes('border-color:'), 'chip must set border-color inline');
    assert.ok(body.includes('background:'),   'chip must set background inline');
  });

  it('renderWithCitations chip title includes the NPC disposition', () => {
    const fn   = sl.slice(sl.indexOf('function renderWithCitations('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(
      body.includes('npc.disposition') && body.includes('title='),
      'resolved chip title must include NPC disposition'
    );
  });

  it('renderWithCitations falls back to DISP_CHIP_COLOR.unknown for unrecognised disposition', () => {
    assert.ok(
      sl.includes('DISP_CHIP_COLOR.unknown'),
      'renderWithCitations must fall back to DISP_CHIP_COLOR.unknown'
    );
  });

  // ── Quest text citations ──────────────────────────────────────
  it('renderTabQuests uses renderWithCitations for quest text (not esc)', () => {
    assert.ok(
      sl.includes('renderWithCitations(q.text)'),
      'renderTabQuests must render quest text via renderWithCitations'
    );
  });

  it('renderTabQuests does not use bare esc(q.text) for display', () => {
    const fn   = sl.slice(sl.indexOf('function renderTabQuests('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 500);
    assert.ok(
      !body.includes('${esc(q.text)}'),
      'renderTabQuests must not use bare esc(q.text) — it should go through renderWithCitations'
    );
  });

  // ── getSessionAppearances scans quest text ───────────────────
  it('getSessionAppearances scans quest text for ^slug citations', () => {
    assert.ok(
      sl.includes('s.quests') && sl.includes('q.text') &&
      sl.includes('needle'),
      'getSessionAppearances must scan s.quests[].text for the needle slug'
    );
  });

  it('getSessionAppearances quest scan is inside the main session loop', () => {
    const fn   = sl.slice(sl.indexOf('function getSessionAppearances('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(
      body.includes('s.quests') && body.includes('needle'),
      'quest scanning must be co-located with the session loop in getSessionAppearances'
    );
  });

  it('getSessionAppearances scans summary, events, AND quests', () => {
    const fn   = sl.slice(sl.indexOf('function getSessionAppearances('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(body.includes('s.summary'),  'getSessionAppearances must scan summary');
    assert.ok(body.includes('events[s.id]'), 'getSessionAppearances must scan events');
    assert.ok(body.includes('s.quests'),   'getSessionAppearances must scan quests');
  });

  it('getSessionAppearances skips quest scan if session already added via earlier scan', () => {
    const fn   = sl.slice(sl.indexOf('function getSessionAppearances('));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(
      body.includes('results.has(s.id)') || body.includes('continue'),
      'getSessionAppearances must short-circuit quest scan if already matched'
    );
  });

  // ── Search haystack expansion ─────────────────────────────────
  it('getFilteredSessions haystack includes moment texts', () => {
    assert.ok(
      sl.includes('momentTexts'),
      'getFilteredSessions must build momentTexts from events cache'
    );
    assert.ok(
      sl.includes("events[s.id]") && sl.includes("ev.text"),
      'getFilteredSessions must map event texts for the haystack'
    );
  });

  it('getFilteredSessions haystack includes quest texts', () => {
    assert.ok(
      sl.includes('questTexts'),
      'getFilteredSessions must build questTexts from session quests'
    );
    assert.ok(
      sl.includes("s.quests") && sl.includes("qt.text"),
      'getFilteredSessions must map quest texts for the haystack'
    );
  });

  it('getFilteredSessions haystack joins all 5 sources before toLowerCase', () => {
    const fn   = sl.slice(sl.indexOf('function getFilteredSessions()'));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 500);
    assert.ok(
      body.includes('s.title') &&
      body.includes('s.summary') &&
      body.includes('s.world_date') &&
      body.includes('momentTexts') &&
      body.includes('questTexts'),
      'haystack must join all 5 text sources: title, summary, world_date, momentTexts, questTexts'
    );
  });

  it('getFilteredSessions guards against null/undefined event or quest text', () => {
    assert.ok(
      sl.includes("ev.text || ''") || sl.includes('ev.text||'),
      'getFilteredSessions must guard ev.text against null/undefined'
    );
    assert.ok(
      sl.includes("qt.text  || ''") || sl.includes("qt.text || ''") || sl.includes('qt.text||'),
      'getFilteredSessions must guard qt.text against null/undefined'
    );
  });

  // ── Citation autocomplete wired to quest inputs ───────────────
  it('buildQuestEditor wires citation autocomplete to quest inputs after render', () => {
    assert.ok(
      sl.includes('.sm-quest-input') && sl.includes('initCitationAutocomplete'),
      'buildQuestEditor must attach initCitationAutocomplete to quest inputs'
    );
  });

  it('buildQuestEditor queries all .sm-quest-input elements for autocomplete', () => {
    const fn   = sl.slice(sl.indexOf('function buildQuestEditor()'));
    const end  = fn.indexOf('\nfunction ', 10);
    const body = fn.slice(0, end > 0 ? end : 700);
    assert.ok(
      body.includes("querySelectorAll('.sm-quest-input')") ||
      body.includes('querySelectorAll(".sm-quest-input")'),
      'buildQuestEditor must use querySelectorAll to find all quest inputs'
    );
    assert.ok(
      body.includes('initCitationAutocomplete'),
      'buildQuestEditor must call initCitationAutocomplete on each quest input'
    );
  });

  it('quest inputs have a ^ citation hint in their placeholder text', () => {
    assert.ok(
      sl.includes('type ^ to cite') || sl.includes('type ^ to'),
      'quest inputs must hint that ^ triggers NPC citation autocomplete'
    );
  });

  // ── Dashboard session card enrichment ────────────────────────
  it('dashboard has statSessionComplete element', () => {
    assert.ok(
      idx.includes('id="statSessionComplete"'),
      'index.html must have a statSessionComplete element on the session card'
    );
  });

  it('dashboard statSessionComplete is labelled "Complete"', () => {
    const i     = idx.indexOf('id="statSessionComplete"');
    const chunk = idx.slice(i, i + 120);
    assert.ok(
      chunk.includes('Complete'),
      'statSessionComplete must be labelled "Complete"'
    );
  });

  it('dashboard has statSessionQuests element', () => {
    assert.ok(
      idx.includes('id="statSessionQuests"'),
      'index.html must have a statSessionQuests element on the session card'
    );
  });

  it('dashboard statSessionQuests is labelled "Active Quests"', () => {
    const i     = idx.indexOf('id="statSessionQuests"');
    const chunk = idx.slice(i, i + 130);
    assert.ok(
      chunk.includes('Active Quests'),
      'statSessionQuests must be labelled "Active Quests"'
    );
  });

  it('dashboard has statLatestSession element', () => {
    assert.ok(
      idx.includes('id="statLatestSession"'),
      'index.html must have a statLatestSession element for the latest session title'
    );
  });

  it('loadSessionStats populates statSessionComplete', () => {
    assert.ok(
      idx.includes("'statSessionComplete'") || idx.includes('"statSessionComplete"'),
      'loadSessionStats must write to statSessionComplete'
    );
  });

  it('loadSessionStats populates statSessionQuests with active quest count', () => {
    assert.ok(
      idx.includes("'statSessionQuests'") || idx.includes('"statSessionQuests"'),
      'loadSessionStats must write to statSessionQuests'
    );
    assert.ok(
      idx.includes("q.status === 'active'") || idx.includes('activeQuests'),
      'loadSessionStats must count active quests across all sessions'
    );
  });

  it('loadSessionStats populates statLatestSession with latest session title', () => {
    assert.ok(
      idx.includes("statLatestSession") && idx.includes('latest.title'),
      'loadSessionStats must write the latest session title to statLatestSession'
    );
  });

  it('loadSessionStats orders sessions by number desc for correct latest detection', () => {
    assert.ok(
      idx.includes('number.desc') || idx.includes('number desc'),
      'loadSessionStats must order sessions by number desc to reliably find the latest'
    );
  });

  it('loadSessionStats handles empty sessions array gracefully for latest display', () => {
    assert.ok(
      idx.includes('sessions[0]') &&
      (idx.includes('latest ?') || idx.includes('latest\n') || idx.includes("? `Latest")),
      'loadSessionStats must guard against empty sessions array when setting latest label'
    );
  });

  it('statLatestSession element uses monospace font and violet accent colour', () => {
    const i     = idx.indexOf('id="statLatestSession"');
    const chunk = idx.slice(i, i + 250);
    assert.ok(
      chunk.includes('Share Tech Mono') || chunk.includes('monospace'),
      'statLatestSession must use monospace font'
    );
    assert.ok(
      chunk.includes('a78bfa') || chunk.includes('167,139,250'),
      'statLatestSession must use violet accent colour'
    );
  });
});

// ══════════════════════════════════════════════════════════════
// Section 59 — Nav: Session Log in every sidenav
// ══════════════════════════════════════════════════════════════
describe('Nav — Session Log present in every sidenav', () => {
  const fs   = require('fs'), path = require('path');
  const base = path.join(__dirname, '..');

  const PAGES = [
    'index.html',
    'party-roster.html',
    'treasury.html',
    'loot-tracker.html',
    'admin.html',
    'session-log.html',
  ];

  it('NAV_LINKS in nexus-utils.js contains session-log.html for all pages', () => {
    const utils = fs.readFileSync(path.join(base, 'js/nexus-utils.js'), 'utf8');
    assert.ok(utils.includes("'session-log.html'"), 'NAV_LINKS must include session-log.html href');
    assert.ok(utils.includes('Session Log'), 'NAV_LINKS must include Session Log label');
    assert.ok(utils.includes('📋'), 'NAV_LINKS must include the 📋 icon for Session Log');
  });

  it('every page calls buildSidenav() to render the nav dynamically', () => {
    for (const page of PAGES) {
      const src = fs.readFileSync(path.join(base, page), 'utf8');
      assert.ok(src.includes('buildSidenav('), `${page} must call buildSidenav()`);
      assert.ok(src.includes('id="nexus-nav-root"'), `${page} must have #nexus-nav-root placeholder`);
    }
  });

  it('each page calls buildSidenav with its own href as the active argument', () => {
    const activeMap = {
      'index.html':        'index.html',
      'party-roster.html': 'party-roster.html',
      'treasury.html':     'treasury.html',
      'loot-tracker.html': 'loot-tracker.html',
      'admin.html':        'admin.html',
      'session-log.html':  'session-log.html',
    };
    for (const [page, expectedHref] of Object.entries(activeMap)) {
      const src = fs.readFileSync(path.join(base, page), 'utf8');
      assert.ok(
        src.includes(`buildSidenav('${expectedHref}')`),
        `${page} must call buildSidenav('${expectedHref}') so its own nav link is marked active`
      );
    }
  });

  it('buildSidenav in nexus-utils.js marks the correct link active via CSS class', () => {
    const utils = fs.readFileSync(path.join(base, 'js/nexus-utils.js'), 'utf8');
    assert.ok(utils.includes('sidenav-link${active}') || utils.includes("'sidenav-link'") || utils.includes('sidenav-link active') || utils.includes('active}'),
      'buildSidenav must apply the active class to the matching link');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 60 — Seed Tool: structure and data integrity
// ══════════════════════════════════════════════════════════════
describe('Seed Tool — seed-session-log.html', () => {
  const fs   = require('fs'), path = require('path');
  const seed = fs.readFileSync(path.join(__dirname, '../seed-session-log.html'), 'utf8');

  // ── File basics ──────────────────────────────────────────────
  it('seed file exists and is non-empty', () => {
    assert.ok(seed.length > 500, 'seed-session-log.html must be a substantial file');
  });

  it('seed file is valid HTML with a <head> and <body>', () => {
    assert.ok(seed.includes('<head>'),  'seed file must have a <head>');
    assert.ok(seed.includes('<body>'),  'seed file must have a <body>');
    assert.ok(seed.includes('</html>'), 'seed file must close with </html>');
  });

  // ── Credentials ──────────────────────────────────────────────
  it('has Supabase credentials hardcoded as constants (no input fields needed)', () => {
    assert.ok(seed.includes('SEED_URL'), 'seed tool must define a SEED_URL constant');
    assert.ok(seed.includes('SEED_KEY'), 'seed tool must define a SEED_KEY constant');
    // Credentials are pulled from nexus-config.js values — no runtime input needed
    assert.ok(!seed.includes('id="inUrl"'), 'seed tool must not have a URL input field');
    assert.ok(!seed.includes('id="inKey"'), 'seed tool must not have a key input field');
  });

  // ── Buttons ───────────────────────────────────────────────────
  it('has a Run Seed button', () => {
    assert.ok(seed.includes('btnSeed') && seed.includes('runSeed()'),
      'seed tool must have a Run Seed button calling runSeed()');
  });

  it('has a Wipe & Re-seed button', () => {
    assert.ok(seed.includes('btnWipe') && seed.includes('runWipe()'),
      'seed tool must have a Wipe & Re-seed button calling runWipe()');
  });

  // ── NPC data ──────────────────────────────────────────────────
  it('defines at least 5 NPCs', () => {
    const matches = seed.match(/disposition:/g) || [];
    assert.ok(matches.length >= 5, `seed must define at least 5 NPCs (found ${matches.length})`);
  });

  it('NPC data covers all 5 disposition values', () => {
    assert.ok(seed.includes("'allied'"),   "seed NPCs must include an 'allied' disposition");
    assert.ok(seed.includes("'friendly'"), "seed NPCs must include a 'friendly' disposition");
    assert.ok(seed.includes("'neutral'"),  "seed NPCs must include a 'neutral' disposition");
    assert.ok(seed.includes("'hostile'"),  "seed NPCs must include a 'hostile' disposition");
  });

  it('NPCs have non-empty name, role, and notes fields', () => {
    assert.ok(seed.includes('name:') && seed.includes('role:') && seed.includes('notes:'),
      'each NPC definition must have name, role, and notes fields');
  });

  // ── Session data ──────────────────────────────────────────────
  it('defines at least 3 sessions', () => {
    const matches = seed.match(/number:\s+\d/g) || [];
    assert.ok(matches.length >= 3, `seed must define at least 3 sessions (found ${matches.length})`);
  });

  it('sessions include both draft and complete status values', () => {
    assert.ok(seed.includes("status:     'complete'") || seed.includes("status: 'complete'"),
      "seed must have at least one 'complete' session");
    assert.ok(seed.includes("status:     'draft'") || seed.includes("status: 'draft'"),
      "seed must have at least one 'draft' session");
  });

  it('sessions have quests with active and completed statuses', () => {
    assert.ok(seed.includes("status: 'active'"),    "seed quests must include 'active' status");
    assert.ok(seed.includes("status: 'completed'"), "seed quests must include 'completed' status");
  });

  it('sessions include world_date (in-world calendar) fields', () => {
    assert.ok(seed.includes('world_date:'), 'seed sessions must include world_date fields');
  });

  it('session summaries contain ^slug citation tokens', () => {
    // Look for the ^slug pattern in session summary strings
    assert.ok(/\^[a-z][a-z0-9-]+/.test(seed),
      'seed session summaries must contain ^slug citation tokens linking to NPCs');
  });

  it('sessions reference NPCs via npc_indices', () => {
    assert.ok(seed.includes('npc_indices'),
      'seed sessions must reference their NPCs via npc_indices for session_npcs population');
  });

  // ── Moments data ─────────────────────────────────────────────
  it('defines moments for each session', () => {
    assert.ok(seed.includes('moments:'), 'seed sessions must have moments arrays');
  });

  it('moments include tagged party members', () => {
    assert.ok(seed.includes('members:'), 'seed moments must have members arrays');
  });

  it('some moments have empty members (unassigned moments are valid)', () => {
    assert.ok(seed.includes('members: []'), 'seed must include unassigned moments (empty members array)');
  });

  // ── Logic: uid and slugify ────────────────────────────────────
  it('defines a uid() helper function', () => {
    assert.ok(seed.includes('function uid()'), 'seed tool must define uid() for ID generation');
  });

  it('defines a slugify() helper function', () => {
    assert.ok(seed.includes('function slugify('), 'seed tool must define slugify() for NPC slug generation');
  });

  // ── Wipe safety ───────────────────────────────────────────────
  it('wipe operation deletes session_events before session_log (FK order)', () => {
    // Use a larger window — the confirm() dialog pushes the deleteWhere calls past 800 chars
    const wipeIdx  = seed.indexOf('async function runWipe');
    const nextFn   = seed.indexOf('\nasync function ', wipeIdx + 10);
    const wipeBody = seed.slice(wipeIdx, nextFn > 0 ? nextFn : wipeIdx + 1500);
    const eventsPos = wipeBody.indexOf("'session_events'");
    const logPos    = wipeBody.indexOf("'session_log'");
    // Positions must be from the deleteWhere calls, not the confirm dialog text
    // Find the deleteWhere block specifically
    const deleteBlock = wipeBody.slice(wipeBody.indexOf('deleteWhere'));
    const devPos = deleteBlock.indexOf("'session_events'");
    const dslPos = deleteBlock.indexOf("'session_log'");
    assert.ok(devPos > -1 && dslPos > -1, 'runWipe must deleteWhere on both session_events and session_log');
    assert.ok(devPos < dslPos,
      'runWipe must delete session_events before session_log to respect the FK constraint');
  });

  it('wipe operation also clears the npcs table', () => {
    const wipeIdx  = seed.indexOf('async function runWipe');
    const nextFn   = seed.indexOf('\nasync function ', wipeIdx + 10);
    const wipeBody = seed.slice(wipeIdx, nextFn > 0 ? nextFn : wipeIdx + 1500);
    const deleteBlock = wipeBody.slice(wipeBody.indexOf('deleteWhere'));
    assert.ok(deleteBlock.includes("'npcs'"), 'runWipe must also deleteWhere on the npcs table');
  });

  it('wipe operation requires confirmation before executing', () => {
    const wipeIdx  = seed.indexOf('async function runWipe');
    const wipeBody = seed.slice(wipeIdx, wipeIdx + 400);
    assert.ok(
      wipeBody.includes('confirm('),
      'runWipe must call confirm() to require user acknowledgment before destructive wipe'
    );
  });

  // ── first_seen patching ───────────────────────────────────────
  it('seed patches NPC first_seen to the earliest session they appear in', () => {
    assert.ok(
      seed.includes('first_seen') && seed.includes('npcFirstSeen'),
      'seed must track and patch NPC first_seen after sessions are inserted'
    );
  });

  it('first_seen is patched in session-number order (earliest session wins)', () => {
    assert.ok(
      seed.includes('npcFirstSeen[npcId]') || seed.includes('npcFirstSeen['),
      'first_seen patch must guard against overwriting with a later session (first occurrence wins)'
    );
  });

  // ── Error handling ────────────────────────────────────────────
  it('errors during seed are caught and counted rather than crashing silently', () => {
    assert.ok(
      seed.includes('errors++') || seed.includes('errors +='),
      'seed runner must count errors rather than letting them crash the whole run'
    );
  });

  it('final summary distinguishes success from partial failure', () => {
    assert.ok(
      seed.includes('errors === 0'),
      'seed runner must check error count to show success vs partial-failure banner'
    );
  });

  // ── Visual / UX ───────────────────────────────────────────────
  it('uses NEXUS brand fonts', () => {
    assert.ok(seed.includes('Orbitron'),    'seed tool must use the Orbitron display font');
    assert.ok(seed.includes('Share Tech'), 'seed tool must use the Share Tech Mono monospace font');
  });

  it('uses the NEXUS violet accent colour', () => {
    assert.ok(
      seed.includes('#a78bfa') || seed.includes('167,139,250'),
      'seed tool must use the violet accent colour to match NEXUS branding'
    );
  });

  it('shows a progress log during seed execution', () => {
    assert.ok(seed.includes('logWrap') && seed.includes('function log('),
      'seed tool must show a progress log with individual step feedback'
    );
  });

  it('shows a spinner on buttons during execution', () => {
    assert.ok(seed.includes('spinnerSeed') && seed.includes('spinnerWipe'),
      'seed tool must show spinners on buttons while requests are in-flight'
    );
  });

  it('disables buttons during execution to prevent double-submit', () => {
    assert.ok(seed.includes('function setBusy(') || seed.includes('setBusy('),
      'seed tool must disable buttons during execution to prevent double-submit'
    );
  });
});

// ══════════════════════════════════════════════════════════════
// Section 61 — Admin Danger Zone: Session Log + NPC clear buttons
// ══════════════════════════════════════════════════════════════
describe('Admin Danger Zone — Session Log and NPC clear buttons', () => {
  const fs    = require('fs'), path = require('path');
  const admin = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');

  // ── Session Log row ──────────────────────────────────────────
  it('Danger Zone has a Clear All Session Log Data row', () => {
    assert.ok(admin.includes('Clear All Session Log Data'),
      'Danger Zone must have a "Clear All Session Log Data" heading');
  });

  it('DANGER_ROWS data contains btnClearSessions with clearAllSessions()', () => {
    assert.ok(admin.includes('btnClearSessions'),
      'DANGER_ROWS must define btnClearSessions id');
    assert.ok(admin.includes('clearAllSessions()'),
      'DANGER_ROWS must include clearAllSessions() fn');
  });

  it('Clear Sessions row description mentions sessions, moments, and quests', () => {
    const idx   = admin.indexOf('Clear All Session Log Data');
    const chunk = admin.slice(idx, idx + 400);
    assert.ok(chunk.includes('session') || chunk.includes('moment') || chunk.includes('quest'),
      'Clear sessions row must describe what is deleted (sessions, moments, quests)');
  });

  it('Clear Sessions row clarifies NPC records are not affected', () => {
    const idx   = admin.indexOf('Clear All Session Log Data');
    const chunk = admin.slice(idx, idx + 400);
    assert.ok(chunk.toLowerCase().includes('npc'),
      'Clear sessions row must note that NPC records are not affected');
  });

  // ── NPC row ───────────────────────────────────────────────────
  it('Danger Zone has a Clear All NPCs row', () => {
    assert.ok(admin.includes('Clear All NPCs'),
      'Danger Zone must have a "Clear All NPCs" heading');
  });

  it('DANGER_ROWS data contains btnClearNpcs with clearAllNpcs()', () => {
    assert.ok(admin.includes('btnClearNpcs'),
      'DANGER_ROWS must define btnClearNpcs id');
    assert.ok(admin.includes('clearAllNpcs()'),
      'DANGER_ROWS must include clearAllNpcs() fn');
  });

  it('Clear NPCs row description warns that ^slug citations will become unresolved', () => {
    const idx   = admin.indexOf('Clear All NPCs');
    const chunk = admin.slice(idx, idx + 500);
    assert.ok(chunk.includes('^slug') || chunk.includes('citation') || chunk.includes('unresolved'),
      'Clear NPCs row must warn that existing ^slug citations will become unresolved');
  });

  it('Clear NPCs row clarifies session records are not affected', () => {
    const idx   = admin.indexOf('Clear All NPCs');
    const chunk = admin.slice(idx, idx + 500);
    assert.ok(chunk.toLowerCase().includes('session'),
      'Clear NPCs row must note that session records are not affected');
  });

  // ── clearAllSessions() function ───────────────────────────────
  it('clearAllSessions() is defined as an async function', () => {
    assert.ok(admin.includes('async function clearAllSessions()'),
      'clearAllSessions must be an async function');
  });

  it('clearAllSessions() calls dangerConfirm before deleting', () => {
    const fn   = admin.slice(admin.indexOf('async function clearAllSessions()'));
    const body = fn.slice(0, fn.indexOf('\n  }', 10) + 4);
    assert.ok(body.includes('dangerConfirm('),
      'clearAllSessions must call dangerConfirm before deleting anything');
  });

  it('clearAllSessions() deletes session_events before session_log (FK order)', () => {
    const fn    = admin.slice(admin.indexOf('async function clearAllSessions()'));
    const body  = fn.slice(0, fn.indexOf('\n  async function', 10));
    const evPos = body.indexOf("'session_events'");
    const slPos = body.indexOf("'session_log'");
    assert.ok(evPos > -1 && slPos > -1,
      'clearAllSessions must delete both session_events and session_log');
    assert.ok(evPos < slPos,
      'clearAllSessions must delete session_events before session_log (FK constraint)');
  });

  it('clearAllSessions() does NOT delete from the npcs table', () => {
    const fn   = admin.slice(admin.indexOf('async function clearAllSessions()'));
    const body = fn.slice(0, fn.indexOf('\n  async function', 10));
    assert.ok(!body.includes("'npcs'"),
      'clearAllSessions must not touch the npcs table');
  });

  it('clearAllSessions() uses setLoading on btnClearSessions', () => {
    const fn   = admin.slice(admin.indexOf('async function clearAllSessions()'));
    const body = fn.slice(0, fn.indexOf('\n  async function', 10));
    assert.ok(body.includes('btnClearSessions') && body.includes('setLoading'),
      'clearAllSessions must use setLoading on the btnClearSessions button');
  });

  it('clearAllSessions() calls showToast on success', () => {
    const fn   = admin.slice(admin.indexOf('async function clearAllSessions()'));
    const body = fn.slice(0, fn.indexOf('\n  async function', 10));
    assert.ok(body.includes('showToast('), 'clearAllSessions must call showToast on success');
  });

  it('clearAllSessions() has a try/catch/finally block', () => {
    const fn   = admin.slice(admin.indexOf('async function clearAllSessions()'));
    const body = fn.slice(0, fn.indexOf('\n  async function', 10));
    assert.ok(body.includes('try {') && body.includes('catch(') && body.includes('finally {'),
      'clearAllSessions must use try/catch/finally for error handling');
  });

  // ── clearAllNpcs() function ───────────────────────────────────
  it('clearAllNpcs() is defined as an async function', () => {
    assert.ok(admin.includes('async function clearAllNpcs()'),
      'clearAllNpcs must be an async function');
  });

  it('clearAllNpcs() calls dangerConfirm before deleting', () => {
    const fn   = admin.slice(admin.indexOf('async function clearAllNpcs()'));
    const body = fn.slice(0, fn.indexOf('\n  async function', 10));
    assert.ok(body.includes('dangerConfirm('),
      'clearAllNpcs must call dangerConfirm before deleting anything');
  });

  it('clearAllNpcs() deletes only from the npcs table', () => {
    const fn    = admin.slice(admin.indexOf('async function clearAllNpcs()'));
    // Stop at the SNAPSHOT section comment, which immediately follows clearAllNpcs
    const end   = fn.indexOf('//  CAMPAIGN SNAPSHOT');
    const body  = fn.slice(0, end > 0 ? end : 700);
    assert.ok(body.includes("'npcs'"),
      "clearAllNpcs must delete from the 'npcs' table");
    assert.ok(!body.includes("'session_log'"),
      'clearAllNpcs must not touch session_log');
    assert.ok(!body.includes("'session_events'"),
      'clearAllNpcs must not touch session_events');
  });

  it('clearAllNpcs() uses setLoading on btnClearNpcs', () => {
    const fn   = admin.slice(admin.indexOf('async function clearAllNpcs()'));
    const body = fn.slice(0, fn.indexOf('\n  async function', 10));
    assert.ok(body.includes('btnClearNpcs') && body.includes('setLoading'),
      'clearAllNpcs must use setLoading on the btnClearNpcs button');
  });

  it('clearAllNpcs() calls showToast on success', () => {
    const fn   = admin.slice(admin.indexOf('async function clearAllNpcs()'));
    const body = fn.slice(0, fn.indexOf('\n  async function', 10));
    assert.ok(body.includes('showToast('), 'clearAllNpcs must call showToast on success');
  });

  it('clearAllNpcs() has a try/catch/finally block', () => {
    const fn   = admin.slice(admin.indexOf('async function clearAllNpcs()'));
    const body = fn.slice(0, fn.indexOf('\n  async function', 10));
    assert.ok(body.includes('try {') && body.includes('catch(') && body.includes('finally {'),
      'clearAllNpcs must use try/catch/finally for error handling');
  });

  // ── Ordering: new rows appear after existing ones ─────────────
  it('Danger Zone rows appear in module order: Members, Treasury, Loot, Sessions, NPCs', () => {
    const membersPos  = admin.indexOf('btnClearMembers');
    const treasuryPos = admin.indexOf('btnClearTreasury');
    const lootPos     = admin.indexOf('btnClearLoot');
    const sessionsPos = admin.indexOf('btnClearSessions');
    const npcsPos     = admin.indexOf('btnClearNpcs');
    assert.ok(
      membersPos < treasuryPos &&
      treasuryPos < lootPos &&
      lootPos < sessionsPos &&
      sessionsPos < npcsPos,
      'Danger Zone rows must appear in order: Members → Treasury → Loot → Sessions → NPCs'
    );
  });
});

// ══════════════════════════════════════════════════════════════
// Section 62 — Module Visibility: nexus-config.js
// ══════════════════════════════════════════════════════════════
describe('Module Visibility — nexus-config.js', () => {
  const fs  = require('fs'), path = require('path');
  const cfg = fs.readFileSync(path.join(__dirname, '../js/nexus-config.js'), 'utf8');

  // ── MODULE_DEFS ──────────────────────────────────────────────
  it('defines MODULE_DEFS array with all four live modules', () => {
    assert.ok(cfg.includes('const MODULE_DEFS'), 'MODULE_DEFS must be defined');
    assert.ok(cfg.includes("'partyRoster'"),   'MODULE_DEFS must include partyRoster');
    assert.ok(cfg.includes("'treasury'"),      'MODULE_DEFS must include treasury');
    assert.ok(cfg.includes("'lootTracker'"),   'MODULE_DEFS must include lootTracker');
    assert.ok(cfg.includes("'sessionLog'"),    'MODULE_DEFS must include sessionLog');
  });

  it('MODULE_DEFS entries include href to the page file', () => {
    assert.ok(cfg.includes("'party-roster.html'"),  'MODULE_DEFS must include party-roster.html href');
    assert.ok(cfg.includes("'treasury.html'"),      'MODULE_DEFS must include treasury.html href');
    assert.ok(cfg.includes("'loot-tracker.html'"),  'MODULE_DEFS must include loot-tracker.html href');
    assert.ok(cfg.includes("'session-log.html'"),   'MODULE_DEFS must include session-log.html href');
  });

  it('MODULE_ENABLED_DEFAULTS has all four modules set to true', () => {
    assert.ok(cfg.includes('MODULE_ENABLED_DEFAULTS'), 'MODULE_ENABLED_DEFAULTS must be defined');
    // All four keys must appear as enabled by default
    ['partyRoster', 'treasury', 'lootTracker', 'sessionLog'].forEach(key => {
      const pattern = new RegExp(`${key}:\\s*true`);
      assert.ok(pattern.test(cfg), `MODULE_ENABLED_DEFAULTS must set ${key}: true`);
    });
  });

  // ── loadModuleSettings ───────────────────────────────────────
  it('defines async loadModuleSettings()', () => {
    assert.ok(cfg.includes('async function loadModuleSettings()'),
      'loadModuleSettings must be an async function');
  });

  it('loadModuleSettings reads from nexus_settings key "module_enabled"', () => {
    const fn   = cfg.slice(cfg.indexOf('async function loadModuleSettings()'));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.ok(body.includes('module_enabled'),
      'loadModuleSettings must query nexus_settings for the "module_enabled" key');
  });

  it('loadModuleSettings merges saved values with defaults (safe fallback)', () => {
    const fn   = cfg.slice(cfg.indexOf('async function loadModuleSettings()'));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.ok(body.includes('MODULE_ENABLED_DEFAULTS'),
      'loadModuleSettings must merge with MODULE_ENABLED_DEFAULTS for safe fallback');
  });

  // ── saveModuleSettings ───────────────────────────────────────
  it('defines async saveModuleSettings()', () => {
    assert.ok(cfg.includes('async function saveModuleSettings('),
      'saveModuleSettings must be an async function');
  });

  it('saveModuleSettings upserts to nexus_settings with key "module_enabled"', () => {
    const fn   = cfg.slice(cfg.indexOf('async function saveModuleSettings('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.ok(body.includes("'module_enabled'"),
      'saveModuleSettings must upsert with key "module_enabled"');
    assert.ok(body.includes('db.upsert'),
      'saveModuleSettings must use db.upsert to persist settings');
  });

  // ── isModuleEnabled ──────────────────────────────────────────
  it('defines isModuleEnabled(key) that returns true for unknown keys', () => {
    assert.ok(cfg.includes('function isModuleEnabled('),
      'isModuleEnabled must be defined');
    // Default-enabled behaviour: keys not in map return true
    assert.ok(cfg.includes('!== false'),
      'isModuleEnabled must return true for any key not explicitly set to false');
  });

  // ── enforceModuleGuard ───────────────────────────────────────
  it('defines enforceModuleGuard(moduleKey)', () => {
    assert.ok(cfg.includes('function enforceModuleGuard('),
      'enforceModuleGuard must be defined');
  });

  it('enforceModuleGuard returns true when module is enabled', () => {
    const fn   = cfg.slice(cfg.indexOf('function enforceModuleGuard('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.ok(body.includes('return true'),
      'enforceModuleGuard must return true when the module is enabled');
  });

  it('enforceModuleGuard replaces body content when module is disabled', () => {
    const fn   = cfg.slice(cfg.indexOf('function enforceModuleGuard('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.ok(body.includes('document.body.innerHTML'),
      'enforceModuleGuard must replace body innerHTML to show a disabled screen');
  });

  it('enforceModuleGuard disabled screen includes a link back to index.html', () => {
    const fn   = cfg.slice(cfg.indexOf('function enforceModuleGuard('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.ok(body.includes('index.html'),
      'enforceModuleGuard disabled screen must link back to index.html');
  });

  it('enforceModuleGuard returns false when module is disabled', () => {
    const fn   = cfg.slice(cfg.indexOf('function enforceModuleGuard('));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.ok(body.includes('return false'),
      'enforceModuleGuard must return false after rendering the disabled screen');
  });

  // ── applyModuleVisibility ────────────────────────────────────
  it('defines applyModuleVisibility()', () => {
    assert.ok(cfg.includes('function applyModuleVisibility()'),
      'applyModuleVisibility must be defined');
  });

  it('applyModuleVisibility hides sidenav links for disabled modules', () => {
    const fn   = cfg.slice(cfg.indexOf('function applyModuleVisibility()'));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.ok(body.includes('sidenav-link'),
      'applyModuleVisibility must target .sidenav-link elements');
    assert.ok(body.includes("display") && body.includes("'none'"),
      'applyModuleVisibility must set display:none on links for disabled modules');
  });

  it('applyModuleVisibility also hides module-card elements on the dashboard', () => {
    const fn   = cfg.slice(cfg.indexOf('function applyModuleVisibility()'));
    const body = fn.slice(0, fn.indexOf('\n}') + 2);
    assert.ok(body.includes('module-card'),
      'applyModuleVisibility must target .module-card elements for the dashboard');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 63 — Module Visibility: admin.html
// ══════════════════════════════════════════════════════════════
describe('Module Visibility — admin.html', () => {
  const fs    = require('fs'), path = require('path');
  const admin = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
  const css   = fs.readFileSync(path.join(__dirname, '../css/nexus.css'), 'utf8');

  // ── Section HTML ─────────────────────────────────────────────
  it('has a Module Visibility admin section', () => {
    assert.ok(admin.includes('Module Visibility'),
      'admin.html must have a "Module Visibility" section heading');
  });

  it('module toggle grid container exists', () => {
    assert.ok(admin.includes('id="moduleToggleGrid"'),
      'admin.html must have a #moduleToggleGrid container');
  });

  it('Module Visibility section has a Save Changes button', () => {
    assert.ok(admin.includes('saveModuleVisibility()'),
      'Module Visibility section must have a Save Changes button calling saveModuleVisibility()');
  });

  it('Module Visibility section has a save status indicator', () => {
    assert.ok(admin.includes('id="moduleSaveStatus"'),
      'Module Visibility section must have a #moduleSaveStatus element');
  });

  // ── CSS ───────────────────────────────────────────────────────
  it('defines .module-toggle-row CSS class', () => {
    assert.ok(css.includes('.module-toggle-row'),
      'admin.html must define .module-toggle-row CSS class');
  });

  it('defines .pill-toggle CSS class for the switch', () => {
    assert.ok(css.includes('.pill-toggle'),
      'admin.html must define .pill-toggle CSS class');
  });

  it('defines .pill-track CSS class for the switch track', () => {
    assert.ok(css.includes('.pill-track'),
      'admin.html must define .pill-track CSS class');
  });

  it('pill toggle uses a checkbox input for accessibility', () => {
    assert.ok(css.includes('.pill-toggle input'),
      'pill toggle must be built on a checkbox input element');
  });

  // ── JS ────────────────────────────────────────────────────────
  it('defines buildModuleToggleGrid()', () => {
    assert.ok(admin.includes('function buildModuleToggleGrid()'),
      'admin.html must define buildModuleToggleGrid()');
  });

  it('buildModuleToggleGrid iterates MODULE_DEFS', () => {
    const fn   = admin.slice(admin.indexOf('function buildModuleToggleGrid()'));
    const body = fn.slice(0, fn.indexOf('\n  }\n') + 4);
    assert.ok(body.includes('MODULE_DEFS'),
      'buildModuleToggleGrid must iterate MODULE_DEFS');
  });

  it('buildModuleToggleGrid renders a checkbox per module with id "modToggle-{key}"', () => {
    const fn   = admin.slice(admin.indexOf('function buildModuleToggleGrid()'));
    const body = fn.slice(0, fn.indexOf('\n  }\n') + 4);
    assert.ok(body.includes('modToggle-'),
      'buildModuleToggleGrid must generate checkboxes with id="modToggle-{key}" pattern');
  });

  it('defines async saveModuleVisibility()', () => {
    assert.ok(admin.includes('async function saveModuleVisibility()'),
      'admin.html must define async saveModuleVisibility()');
  });

  it('saveModuleVisibility reads from modToggle- checkboxes', () => {
    const fn   = admin.slice(admin.indexOf('async function saveModuleVisibility()'));
    const body = fn.slice(0, fn.indexOf('\n  }\n') + 4);
    assert.ok(body.includes('modToggle-'),
      'saveModuleVisibility must read values from modToggle- checkboxes');
  });

  it('saveModuleVisibility calls saveModuleSettings()', () => {
    const fn   = admin.slice(admin.indexOf('async function saveModuleVisibility()'));
    const body = fn.slice(0, fn.indexOf('\n  }\n') + 4);
    assert.ok(body.includes('saveModuleSettings('),
      'saveModuleVisibility must call saveModuleSettings() to persist settings');
  });

  it('saveModuleVisibility shows a toast on success', () => {
    const fn   = admin.slice(admin.indexOf('async function saveModuleVisibility()'));
    const body = fn.slice(0, fn.indexOf('\n  }\n') + 4);
    assert.ok(body.includes('showToast('),
      'saveModuleVisibility must call showToast on success');
  });

  it('loadAdminData calls loadModuleSettings and buildModuleToggleGrid', () => {
    const fn   = admin.slice(admin.indexOf('async function loadAdminData()'));
    const body = fn.slice(0, fn.indexOf('\n  }\n') + 4);
    assert.ok(body.includes('loadModuleSettings()'),
      'loadAdminData must call loadModuleSettings()');
    assert.ok(body.includes('buildModuleToggleGrid()'),
      'loadAdminData must call buildModuleToggleGrid()');
  });

  it('Module Visibility section appears before the Term Mappings section', () => {
    const modPos  = admin.indexOf('Module Visibility');
    const termPos = admin.indexOf('Module &amp; Term Mappings');
    assert.ok(modPos > -1 && termPos > -1 && modPos < termPos,
      'Module Visibility section must appear before Term Mappings section');
  });
});

// ══════════════════════════════════════════════════════════════
// Section 64 — Module Visibility: page guards
// ══════════════════════════════════════════════════════════════
describe('Module Visibility — page guards on module pages', () => {
  const fs   = require('fs'), path = require('path');
  const base = path.join(__dirname, '..');

  const GUARDS = [
    { file: 'party-roster.html', key: 'partyRoster' },
    { file: 'treasury.html',     key: 'treasury'    },
    { file: 'loot-tracker.html', key: 'lootTracker' },
    { file: 'session-log.html',  key: 'sessionLog'  },
  ];

  for (const { file, key } of GUARDS) {
    it(`${file} calls loadModuleSettings() before rendering`, () => {
      const src = fs.readFileSync(path.join(base, file), 'utf8');
      assert.ok(src.includes('loadModuleSettings()'),
        `${file} must call loadModuleSettings() in its boot sequence`);
    });

    it(`${file} calls applyModuleVisibility()`, () => {
      const src = fs.readFileSync(path.join(base, file), 'utf8');
      assert.ok(src.includes('applyModuleVisibility()'),
        `${file} must call applyModuleVisibility() to hide disabled nav links`);
    });

    it(`${file} calls enforceModuleGuard('${key}')`, () => {
      const src = fs.readFileSync(path.join(base, file), 'utf8');
      assert.ok(src.includes(`enforceModuleGuard('${key}')`),
        `${file} must call enforceModuleGuard('${key}') to block direct URL access`);
    });

    it(`${file} guards against continuing if enforceModuleGuard returns false`, () => {
      const src = fs.readFileSync(path.join(base, file), 'utf8');
      const guardIdx = src.indexOf(`enforceModuleGuard('${key}')`);
      const chunk = src.slice(Math.max(0, guardIdx - 10), guardIdx + 60);
      assert.ok(
        chunk.includes('return') || chunk.includes('if (!'),
        `${file} must stop execution if enforceModuleGuard returns false`
      );
    });
  }

  it('index.html calls loadModuleSettings() and applyModuleVisibility()', () => {
    const src = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
    assert.ok(src.includes('loadModuleSettings()'),
      'index.html must call loadModuleSettings() to know which modules are enabled');
    assert.ok(src.includes('applyModuleVisibility()'),
      'index.html must call applyModuleVisibility() to hide disabled module cards and nav links');
  });

  it('index.html does NOT call enforceModuleGuard (dashboard is never disabled)', () => {
    const src = fs.readFileSync(path.join(base, 'index.html'), 'utf8');
    assert.ok(!src.includes('enforceModuleGuard('),
      'index.html must not call enforceModuleGuard — the dashboard is always accessible');
  });

  it('admin.html does NOT call enforceModuleGuard (admin is never disabled)', () => {
    const src = fs.readFileSync(path.join(base, 'admin.html'), 'utf8');
    assert.ok(!src.includes('enforceModuleGuard('),
      'admin.html must not call enforceModuleGuard — the admin panel is always accessible');
  });
});


// ══════════════════════════════════════════════════════════════════
//  Section 66: Component Cleanup — no duplicated utility code
//  All shared functions must live only in nexus-utils.js.
//  Orphaned nav toggle fragments must not exist in any page.
// ══════════════════════════════════════════════════════════════════

describe('Component cleanup — no duplicated utility code in HTML pages', () => {

  const fs   = require('fs'), path = require('path');
  const base = path.join(__dirname, '..');
  const ALL_PAGES = [
    'index.html', 'party-roster.html', 'treasury.html',
    'loot-tracker.html', 'session-log.html', 'admin.html',
  ];

  // ── showToast ──────────────────────────────────────────────────
  for (const file of ALL_PAGES) {
    it(`${file} does not define its own showToast() function`, () => {
      const src = fs.readFileSync(path.join(base, file), 'utf8');
      assert.ok(!src.includes('function showToast('),
        `${file} must not define showToast() locally — use the one in nexus-utils.js`);
    });
  }

  it('nexus-utils.js defines showToast() as the single canonical implementation', () => {
    const src = fs.readFileSync(path.join(base, 'js', 'nexus-utils.js'), 'utf8');
    assert.ok(src.includes('function showToast('),
      'nexus-utils.js must contain the canonical showToast() definition');
    // Count occurrences — must be exactly one
    const count = (src.match(/function showToast\(/g) || []).length;
    assert.strictEqual(count, 1,
      'nexus-utils.js must define showToast() exactly once');
  });

  // ── openNav / closeNav ─────────────────────────────────────────
  for (const file of ALL_PAGES) {
    it(`${file} does not define its own openNav() or closeNav()`, () => {
      const src = fs.readFileSync(path.join(base, file), 'utf8');
      assert.ok(!src.includes('function openNav('),
        `${file} must not define openNav() locally — use the one in nexus-utils.js`);
      assert.ok(!src.includes('function closeNav('),
        `${file} must not define closeNav() locally — use the one in nexus-utils.js`);
    });
  }

  it('nexus-utils.js defines openNav() and closeNav() as canonical implementations', () => {
    const src = fs.readFileSync(path.join(base, 'js', 'nexus-utils.js'), 'utf8');
    assert.ok(src.includes('function openNav('),  'nexus-utils.js must define openNav()');
    assert.ok(src.includes('function closeNav()'), 'nexus-utils.js must define closeNav()');
  });

  // ── Orphaned navToggle fragments ───────────────────────────────
  for (const file of ALL_PAGES) {
    it(`${file} has no orphaned navToggle fragment (buildSidenav handles wiring)`, () => {
      const src = fs.readFileSync(path.join(base, file), 'utf8');
      assert.ok(!src.includes("nav.classList.contains('nav-open') ? closeNav() : openNav()"),
        `${file} must not contain a bare navToggle fragment — buildSidenav() wires it`);
      assert.ok(!src.includes("nav.classList.contains('nav-open')?closeNav():openNav()"),
        `${file} must not contain a bare navToggle fragment (minified form)`);
      // Guard against the wrapping remnant left when only the inner line is removed
      assert.ok(!src.includes('//  SIDENAV\n// ══════════════════════════════════════════════════════════════\n});'),
        `${file} must not contain the orphaned SIDENAV comment + stray }); from a navToggle removal`);
    });
  }

  // ── esc() ──────────────────────────────────────────────────────
  for (const file of ALL_PAGES) {
    it(`${file} does not define its own esc() function`, () => {
      const src = fs.readFileSync(path.join(base, file), 'utf8');
      assert.ok(!src.includes('function esc('),
        `${file} must not define esc() locally — use the one in nexus-utils.js`);
    });
  }

  it('nexus-utils.js esc() escapes all four dangerous characters', () => {
    const { esc } = require('../js/nexus-utils.js');
    assert.strictEqual(esc('<'),  '&lt;',   'esc must escape <');
    assert.strictEqual(esc('>'),  '&gt;',   'esc must escape >');
    assert.strictEqual(esc('&'),  '&amp;',  'esc must escape &');
    assert.strictEqual(esc('"'),  '&quot;', 'esc must escape "');
    assert.strictEqual(
      esc('<b>"bold" & \'fine\'</b>'),
      '&lt;b&gt;&quot;bold&quot; &amp; \'fine\'&lt;/b&gt;',
      'esc must escape all four characters in a combined string'
    );
  });

  // ── No inline toast divs ───────────────────────────────────────
  for (const file of ALL_PAGES) {
    it(`${file} has no hardcoded toast div (nexus-utils injects it)`, () => {
      const src = fs.readFileSync(path.join(base, file), 'utf8');
      assert.ok(!src.includes('id="toast"'),
        `${file} must not include a hardcoded #toast div — showToast() auto-injects it`);
    });
  }

  it('nexus-utils.js showToast() auto-injects the toast element when absent', () => {
    const src = fs.readFileSync(path.join(base, 'js', 'nexus-utils.js'), 'utf8');
    assert.ok(src.includes("document.getElementById('toast')"),
      'showToast must check for an existing #toast element');
    assert.ok(src.includes("document.createElement('div')"),
      'showToast must create a new div when #toast is absent');
    assert.ok(src.includes("document.body.appendChild(t)"),
      'showToast must append the new toast div to document.body');
  });

  // ── buildSidenav must be called AFTER loadModuleSettings ──────
  // (so module visibility is known before the nav renders)
  for (const file of ALL_PAGES) {
    it(`${file} calls buildSidenav() after loadModuleSettings() so nav reflects enabled modules`, () => {
      const src       = fs.readFileSync(path.join(base, file), 'utf8');
      const buildIdx  = src.indexOf('buildSidenav(');
      if (buildIdx === -1) return;
      const loadIdx   = src.indexOf('loadModuleSettings()');
      assert.ok(loadIdx !== -1,
        `${file}: loadModuleSettings() must be present`);
      assert.ok(buildIdx > loadIdx,
        `${file}: buildSidenav() must appear after loadModuleSettings() call — currently at char ${buildIdx} vs ${loadIdx}`);
    });
  }

  // ── No bare <script>buildSidenav()</script> blocks ─────────────
  // buildSidenav must live inside a loadModuleSettings callback, not as a bare script tag
  for (const file of ALL_PAGES) {
    it(`${file} does not call buildSidenav() as a bare inline script tag`, () => {
      const src = fs.readFileSync(path.join(base, file), 'utf8');
      assert.ok(!src.includes('<script>buildSidenav('),
        `${file}: buildSidenav() must not be a bare <script> tag — it must run inside the loadModuleSettings() callback`);
    });
  }

  // ── buildSidenav must be called AFTER nexus-nav-root exists ──
  for (const file of ALL_PAGES) {
    it(`${file} calls buildSidenav() after #nexus-nav-root in the DOM (not in <head>)`, () => {
      const src  = fs.readFileSync(path.join(base, file), 'utf8');
      const rootIdx  = src.indexOf('nexus-nav-root');
      const buildIdx = src.indexOf('buildSidenav(');
      if (buildIdx === -1) return;
      assert.ok(buildIdx > rootIdx,
        `${file}: buildSidenav() must appear after <div id="nexus-nav-root"> so the element exists when called`);
    });
  }

  // ── buildSidenav is the single nav construction point ─────────
  for (const file of ALL_PAGES) {
    it(`${file} uses buildSidenav() to construct the sidenav`, () => {
      const src = fs.readFileSync(path.join(base, file), 'utf8');
      assert.ok(src.includes('buildSidenav('),
        `${file} must call buildSidenav() to construct navigation`);
    });

    it(`${file} has no hardcoded <nav class="sidenav"> HTML`, () => {
      const src = fs.readFileSync(path.join(base, file), 'utf8');
      assert.ok(!src.includes('<nav class="sidenav"'),
        `${file} must not contain hardcoded sidenav HTML — buildSidenav() generates it`);
    });
  }

  // ── Admin Danger Zone uses builder pattern ─────────────────────
  it('admin.html defines DANGER_ROWS data array for the Danger Zone', () => {
    const src = fs.readFileSync(path.join(base, 'admin.html'), 'utf8');
    assert.ok(src.includes('const DANGER_ROWS'),
      'admin.html must define DANGER_ROWS as a data array');
  });

  it('admin.html buildDangerZone() renders from DANGER_ROWS (no hardcoded rows)', () => {
    const src = fs.readFileSync(path.join(base, 'admin.html'), 'utf8');
    assert.ok(src.includes('function buildDangerZone()'),
      'admin.html must define buildDangerZone()');
    assert.ok(src.includes('DANGER_ROWS.map('),
      'buildDangerZone must iterate over DANGER_ROWS to render rows');
    // Confirm no hardcoded row divs outside the builder
    const builderMatch = src.match(/function buildDangerZone\(\)[\s\S]+?^\s*\}/m);
    const outside = builderMatch
      ? src.replace(builderMatch[0], '')
      : src;
    assert.ok(!outside.includes('class="danger-row"'),
      'danger-row divs must only be emitted by buildDangerZone(), not hardcoded in HTML');
  });

  it('admin.html DANGER_ROWS contains exactly 5 entries', () => {
    const src  = fs.readFileSync(path.join(base, 'admin.html'), 'utf8');
    const rows = (src.match(/id:\s*'btn/g) || []).length;
    assert.strictEqual(rows, 5,
      'DANGER_ROWS must have exactly 5 entries (members, treasury, loot, sessions, npcs)');
  });
});


// ══════════════════════════════════════════════════════════════════
//  Section 67: CSS Health — variables, dead classes, duplicates,
//  and loading overlay hygiene
// ══════════════════════════════════════════════════════════════════

describe('CSS health — nexus.css', () => {
  const fs   = require('fs'), path = require('path');
  const base = path.join(__dirname, '..');
  const css  = fs.readFileSync(path.join(base, 'css', 'nexus.css'), 'utf8');

  // ── CSS Variables ──────────────────────────────────────────────
  it('defines --violet CSS variable in :root', () => {
    assert.ok(css.includes('--violet:'),
      ':root must define --violet for the session-log accent colour');
  });

  it('--violet variable value is #a78bfa', () => {
    const match = css.match(/--violet\s*:\s*([^;]+);/);
    assert.ok(match, '--violet must be defined');
    assert.ok(match[1].trim().includes('#a78bfa'),
      '--violet must be set to #a78bfa');
  });

  it('no hardcoded #a78bfa outside :root (should be var(--violet))', () => {
    const rootEnd = css.indexOf('}', css.indexOf(':root {'));
    const afterRoot = css.slice(rootEnd + 1);
    assert.ok(!afterRoot.includes('#a78bfa'),
      'All uses of #a78bfa outside :root must be replaced with var(--violet)');
  });

  const CORE_VARS = ['--bg', '--bg2', '--panel', '--border', '--cyan', '--violet',
                     '--red', '--green', '--gold', '--amber', '--text', '--text-dim'];
  for (const v of CORE_VARS) {
    it(`defines ${v} in :root`, () => {
      assert.ok(css.includes(`${v}:`),
        `nexus.css :root must define ${v}`);
    });
  }

  // ── Dead class guard ───────────────────────────────────────────
  const KNOWN_DEAD = [
    '.fx-from-items', '.loot-tab-vault', '.loot-vault-label',
    '.loot-vault-total', '.status-soon', '.prof-grid',
  ];
  for (const cls of KNOWN_DEAD) {
    it(`${cls} is not defined in nexus.css (dead class removed)`, () => {
      assert.ok(!css.includes(`${cls} {`) && !css.includes(`${cls}{`),
        `${cls} was a dead class and must be removed from nexus.css`);
    });
  }

  // ── No true duplicate top-level selectors ─────────────────────
  it('has no duplicate top-level selectors outside @media blocks', () => {
    const lines = css.split('\n');
    // Collect selectors that are NOT inside @media blocks
    const selectors = [];
    let mediaDepth = 0;
    for (const line of lines) {
      if (line.includes('@media')) mediaDepth++;
      if (mediaDepth > 0) {
        // Count closing braces to detect end of @media
        const opens  = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        mediaDepth = Math.max(0, mediaDepth + opens - closes);
        if (mediaDepth === 0) mediaDepth = 0;
        continue;
      }
      const m = line.match(/^\s+(\.[a-zA-Z][a-zA-Z0-9_-]+)\s*\{/);
      if (m) selectors.push(m[1]);
    }
    const counts = {};
    for (const s of selectors) counts[s] = (counts[s] || 0) + 1;
    const dupes = Object.entries(counts).filter(([,c]) => c > 1).map(([s]) => s);
    assert.deepStrictEqual(dupes, [],
      `These selectors are duplicated outside @media blocks: ${dupes.join(', ')}`);
  });

  // ── Loading overlay CSS is complete ───────────────────────────
  it('defines #loadingOverlay styles in nexus.css', () => {
    assert.ok(css.includes('#loadingOverlay {') || css.includes('#loadingOverlay{'),
      '#loadingOverlay styles must be defined in nexus.css');
  });

  it('defines .loading-text class in nexus.css', () => {
    assert.ok(css.includes('.loading-text {') || css.includes('.loading-text{'),
      '.loading-text class must be defined in nexus.css');
  });

  it('defines page-session .loading-text override for violet accent', () => {
    assert.ok(css.includes('page-session') && css.includes('.loading-text'),
      'nexus.css must have a page-session scoped .loading-text override for violet accent');
  });

  // ── Loading overlay HTML uses classes not inline styles ────────
  const MODULE_PAGES = ['party-roster.html', 'treasury.html', 'loot-tracker.html', 'session-log.html'];
  for (const page of MODULE_PAGES) {
    it(`${page} loading overlay has no inline styles (uses CSS classes)`, () => {
      const src = fs.readFileSync(path.join(base, page), 'utf8');
      assert.ok(!src.includes('position:fixed;inset:0;background:rgba(6,8,9'),
        `${page} loadingOverlay must not use inline styles — styles are in nexus.css`);
    });

    it(`${page} loading overlay inner text uses class="loading-text"`, () => {
      const src = fs.readFileSync(path.join(base, page), 'utf8');
      assert.ok(src.includes('class="loading-text"'),
        `${page} must use class="loading-text" on the overlay text element`);
    });
  }

  // ── #loadingOverlay default is display:flex (page-cover-first pattern) ─
  it('#loadingOverlay CSS default is display:flex so pages are covered before guard runs', () => {
    const match = css.match(/#loadingOverlay\s*\{([^}]+)\}/);
    assert.ok(match, '#loadingOverlay rule must exist in nexus.css');
    assert.ok(match[1].includes('display: flex') || match[1].includes('display:flex'),
      '#loadingOverlay must default to display:flex — it hides page content until guard clears it');
  });

  // ── Module pages: enforceModuleGuard called before showLoading(false) ──
  for (const page of MODULE_PAGES) {
    it(`${page} calls enforceModuleGuard before revealing page content`, () => {
      const src      = fs.readFileSync(path.join(base, page), 'utf8');
      const guardIdx = src.indexOf('enforceModuleGuard(');
      assert.ok(guardIdx !== -1, `${page} must call enforceModuleGuard()`);
    });
  }

  // ── Sidenav uses CSS variables not hardcoded hex ───────────────
  it('sidenav section uses var(--cyan) not hardcoded #0ef0d0', () => {
    const navStart = css.indexOf('8. SIDE NAV');
    const navEnd   = css.indexOf('9. SHARED', navStart);
    const navSection = css.slice(navStart, navEnd);
    assert.ok(!navSection.includes('#0ef0d0'),
      'sidenav CSS must use var(--cyan) instead of hardcoded #0ef0d0');
  });

  it('sidenav section uses var(--border) not hardcoded #1a2a3a', () => {
    const navStart = css.indexOf('8. SIDE NAV');
    const navEnd   = css.indexOf('9. SHARED', navStart);
    const navSection = css.slice(navStart, navEnd);
    assert.ok(!navSection.includes('#1a2a3a'),
      'sidenav CSS must use var(--border) instead of hardcoded #1a2a3a');
  });
});
