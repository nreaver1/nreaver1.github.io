// ══════════════════════════════════════════════════════════════
//  js/nexus-utils.js  —  Pure utility functions shared across all
//  NEXUS modules. No DOM access, no Supabase, no side effects.
//
//  These functions are:
//    1. Included in every page via <script src="js/nexus-utils.js">
//    2. Exported via module.exports for the test suite (Node only)
//
//  If you add or change any function here, run the tests:
//    node --test nexus.test.js
// ══════════════════════════════════════════════════════════════


// ──────────────────────────────────────────────────────────────
//  GENERAL HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * uid()
 * Generates a short random ID string prefixed with '_'.
 * Used everywhere a new record needs a client-side id before
 * it hits Supabase.
 * Example: '_k7fzx2q4m'
 */
function uid() {
  return '_' + Math.random().toString(36).slice(2, 11);
}

/**
 * fmt(n)
 * Formats a number with locale-appropriate thousand separators.
 * Example: fmt(1234567) → "1,234,567"
 */
function fmt(n) {
  return Number(n).toLocaleString();
}

/**
 * esc(s)
 * HTML-escapes a string so it can be safely injected into innerHTML
 * or used inside HTML attribute values without XSS risk.
 * Converts &, <, >, " and ' to their HTML entities.
 * NOT enough for inline JS: the browser decodes entities in onclick="…"
 * before running it, so f('${esc(name)}') still breaks on an apostrophe.
 * Put user text in a data-* attribute and read this.dataset.x instead.
 * Example: esc('<b>"bold"</b>') → '&lt;b&gt;&quot;bold&quot;&lt;/b&gt;'
 */
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


// ──────────────────────────────────────────────────────────────
//  D&D 5E MATH
// ──────────────────────────────────────────────────────────────

/**
 * abilityMod(score)
 * Computes the D&D 5e ability modifier from an ability score.
 * Formula: floor((score - 10) / 2)
 *
 * Score → Modifier reference:
 *   1  → -5    8  → -1    10 → +0    12 → +1
 *   14 → +2    16 → +3    18 → +4    20 → +5
 *
 * If score is falsy (undefined, null, 0) it defaults to 10 (+0).
 */
function abilityMod(score) {
  return Math.floor(((score || 10) - 10) / 2);
}

/**
 * modStr(n)
 * Formats a modifier number as a signed string for display.
 * Positive and zero values get an explicit '+' prefix.
 * Example: modStr(3) → "+3",  modStr(-1) → "-1",  modStr(0) → "+0"
 */
function modStr(n) {
  return n >= 0 ? `+${n}` : String(n);
}

/**
 * computeCheck(key, ability, member, net, profBonus)
 * Calculates a saving throw or skill check value for a party member.
 *
 * Steps:
 *   1. Start with the ability modifier for the relevant ability
 *   2. Add proficiency bonus if the member is proficient in this check
 *   3. Apply any item bonuses / penalties from the net effects map
 *
 * Parameters:
 *   key       — the check key, e.g. 'athletics', 'save_str'
 *   ability   — the governing ability, e.g. 'str', 'dex'
 *   member    — party member object { abilities: {str:N,...}, proficiencies: {...} }
 *   net       — item effects map from computeNetEffects()
 *   profBonus — the member's proficiency bonus (e.g. 2 at levels 1–4)
 */
function computeCheck(key, ability, member, net, profBonus) {
  let base = abilityMod(member.abilities?.[ability] || 10);
  if (member.proficiencies?.[key]) base += profBonus;
  const n = net[key];
  if (n) { base += (n.bonus || 0); base -= (n.penalty || 0); }
  return base;
}

/**
 * DAMAGE_TYPES
 * All 13 official D&D 5e damage types, used for the optional
 * damageType field on stat effects (primarily damage_rolls /
 * spell_damage effects). Exported so the loot tracker UI and
 * any other page can build selects from the same canonical list.
 */
const DAMAGE_TYPES = [
  'acid', 'bludgeoning', 'cold', 'fire', 'force',
  'lightning', 'necrotic', 'piercing', 'poison',
  'psychic', 'radiant', 'slashing', 'thunder',
];

/**
 * computeNetEffects(memberName, items)
 * Aggregates all stat effects from items held by a party member
 * (or tagged as 'Party') into a net effects map.
 *
 * Returns: { net, relevant }
 *   net — {
 *     statKey: {
 *       bonus:        number,   // total across ALL types (untyped + all damage types)
 *       penalty:      number,   // total across ALL types
 *       advantage:    number,   // count
 *       disadvantage: number,   // count
 *       sources:      array,
 *       byType: {              // only present when any bonus/penalty effect exists
 *         'acid':    { bonus: N, penalty: N },
 *         'fire':    { bonus: N, penalty: N },
 *         'untyped': { bonus: N, penalty: N },  // effects with no damageType
 *       }
 *     }
 *   }
 *   relevant — the filtered array of items that apply to this member
 *
 * Matching is case-insensitive. Items held by 'Party' apply to all members.
 * The top-level bonus/penalty totals always reflect the grand total so
 * existing code that reads net[stat].bonus continues to work unchanged.
 *
 * opts.excludeWeaponAttackFx — skip attack_rolls / damage_rolls effects on
 *   weapon-type items (isWeaponItem). A +1 longsword's bonus belongs to
 *   attacks made with that sword, not to the holder's bow; the Combat sheet
 *   adds it back per option via combatContext(). Default false.
 */
function computeNetEffects(memberName, items, opts = {}) {
  const relevant = items.filter(it => {
    const h = (it.holder || '').toLowerCase().trim();
    const n = (memberName || '').toLowerCase().trim();
    return h === n || h === 'party';
  });

  const net = {};
  for (const item of relevant) {
    const weaponOnly = opts.excludeWeaponAttackFx && isWeaponItem(item);
    for (const fx of (item.statEffects || [])) {
      if (!fx.stat) continue;
      if (weaponOnly && WEAPON_SCOPED_STATS.includes(fx.stat)) continue;
      if (!net[fx.stat]) net[fx.stat] = { bonus: 0, penalty: 0, advantage: 0, disadvantage: 0, sources: [] };

      // ── Top-level totals (unchanged behaviour) ──
      if (fx.type === 'bonus')        net[fx.stat].bonus       += (fx.value || 0);
      if (fx.type === 'penalty')      net[fx.stat].penalty     += (fx.value || 0);
      if (fx.type === 'advantage')    net[fx.stat].advantage++;
      if (fx.type === 'disadvantage') net[fx.stat].disadvantage++;
      net[fx.stat].sources.push({ itemName: item.name, itemRarity: item.rarity, fx });

      // ── Per-damage-type breakdown (new) ──
      // Track bonus/penalty in byType buckets keyed by damageType (or 'untyped').
      // byType is always built for bonus/penalty effects so the display layer
      // can show typed breakdowns when relevant.
      if (fx.type === 'bonus' || fx.type === 'penalty') {
        if (!net[fx.stat].byType) net[fx.stat].byType = {};
        const bucket = fx.damageType
          ? fx.damageType.toLowerCase()
          : 'untyped';
        if (!net[fx.stat].byType[bucket]) {
          net[fx.stat].byType[bucket] = { bonus: 0, penalty: 0 };
        }
        if (fx.type === 'bonus')   net[fx.stat].byType[bucket].bonus   += (fx.value || 0);
        if (fx.type === 'penalty') net[fx.stat].byType[bucket].penalty += (fx.value || 0);
      }
    }
  }
  return { net, relevant };
}


// ──────────────────────────────────────────────────────────────
//  COMBAT MATH  (2014 5e)
//  Powers the Combat reference sheet: per-option to-hit / DC /
//  damage, expected damage vs the DM's target, and the ranking.
// ──────────────────────────────────────────────────────────────

const COMBAT_ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

/**
 * parseDice(str)
 * Parses a damage expression like '2d6+1d4+3', 'd8', '1d8 - 1' or '5'.
 * Returns { dice: [{n, s}], flat } or null for empty/invalid input.
 * Negative dice, d0 and absurd sizes (>100) are rejected.
 */
function parseDice(str) {
  const s = String(str == null ? '' : str).replace(/\s+/g, '').toLowerCase();
  if (!s || !/^[+-]?(\d*d\d+|\d+)([+-](\d*d\d+|\d+))*$/.test(s)) return null;
  const dice = [];
  let flat = 0;
  for (const [, sign, term] of s.matchAll(/([+-]?)(\d*d\d+|\d+)/g)) {
    if (term.includes('d')) {
      const [nRaw, sRaw] = term.split('d');
      const n = nRaw === '' ? 1 : parseInt(nRaw, 10);
      const sides = parseInt(sRaw, 10);
      if (sign === '-' || n < 1 || n > 100 || sides < 1 || sides > 100) return null;
      dice.push({ n, s: sides });
    } else {
      flat += (sign === '-' ? -1 : 1) * parseInt(term, 10);
    }
  }
  return { dice, flat };
}

/**
 * diceAvg(parsed)
 * Average of a parsed expression: n·(s+1)/2 per die group, plus flat.
 * Example: diceAvg(parseDice('2d6+3')) → 10
 */
function diceAvg(parsed) {
  if (!parsed) return 0;
  return parsed.dice.reduce((t, d) => t + d.n * (d.s + 1) / 2, 0) + (parsed.flat || 0);
}

/**
 * formatDice(parsed)
 * Turns a parsed expression back into text: { dice:[{n:2,s:6}], flat:3 } → '2d6+3'.
 */
function formatDice(parsed) {
  if (!parsed) return '';
  const text = parsed.dice.map(d => `${d.n}d${d.s}`).join('+');
  const flat = parsed.flat || 0;
  if (!text) return String(flat);
  if (!flat) return text;
  return text + (flat > 0 ? `+${flat}` : String(flat));
}

/**
 * profFromLevel(level)
 * PHB proficiency bonus: +2 at 1–4, +3 at 5–8, +4 at 9–12, +5 at 13–16, +6 at 17+.
 * Missing/invalid level → +2.
 */
function profFromLevel(level) {
  const lvl = parseInt(level, 10);
  if (!lvl || lvl < 1) return 2;
  return Math.min(6, 2 + Math.floor((lvl - 1) / 4));
}

/**
 * cantripTier(level)
 * Cantrip damage-dice multiplier: ×1 below 5, ×2 at 5, ×3 at 11, ×4 at 17.
 */
function cantripTier(level) {
  const lvl = parseInt(level, 10) || 1;
  if (lvl >= 17) return 4;
  if (lvl >= 11) return 3;
  if (lvl >= 5)  return 2;
  return 1;
}

/**
 * hitChance(attackBonus, ac)
 * Chance that d20 + attackBonus ≥ AC. Clamped to 5–95% because a
 * natural 1 always misses and a natural 20 always hits.
 */
function hitChance(attackBonus, ac) {
  const p = (21 - ((ac || 0) - (attackBonus || 0))) / 20;
  return Math.min(0.95, Math.max(0.05, p));
}

/**
 * saveFailChance(dc, saveBonus)
 * Chance that d20 + saveBonus < DC. Clamped to 0–100%: in 2014 rules a
 * natural 1/20 does NOT auto-fail/succeed a saving throw.
 */
function saveFailChance(dc, saveBonus) {
  const p = ((dc || 0) - 1 - (saveBonus || 0)) / 20;
  return Math.min(1, Math.max(0, p));
}

// Net bonus − penalty for one stat key, or 0.
function _netVal(net, key) {
  const n = net && net[key];
  return n ? (n.bonus || 0) - (n.penalty || 0) : 0;
}

/**
 * effectiveProf(member, net)
 * Proficiency bonus used for combat: the higher of the stored `prof`
 * and the level table (the column defaults to 2 and is often never
 * updated), plus any prof_bonus item effects.
 */
function effectiveProf(member, net) {
  const base = Math.max(parseInt(member?.prof, 10) || 0, profFromLevel(member?.level));
  return base + _netVal(net, 'prof_bonus');
}

/**
 * effectiveAbilityMod(member, net, ability)
 * Ability modifier after item bonuses/penalties to the score itself.
 */
function effectiveAbilityMod(member, net, ability) {
  return abilityMod((member?.abilities?.[ability] || 10) + _netVal(net, ability));
}

/**
 * isAtWill(option)
 * Weapons and cantrips can be used every turn; leveled spells and
 * features are assumed to cost a slot or a use.
 */
function isAtWill(option) {
  return option?.kind === 'weapon' || option?.spell_level === 0;
}

/**
 * combatBreakdown(option, ctx)
 * Works out every number on a combat option, with the parts that make
 * it up so the UI can explain "+7 = STR +4, Prof +3".
 *
 * option — a combat_options row: { kind, action, resolve, ability, dice,
 *          extra_dice, add_mod, spell_level, scales, half_on_save }
 * ctx    — { member, net } where net comes from computeNetEffects()
 *
 * ability 'spell' uses the member's stored Spell Atk / Spell DC
 * (combat.spellatk / combat.spelldc) plus spell_attack / spell_dc /
 * spell_damage item effects. Any other ability uses mod + prof plus
 * attack_rolls / damage_rolls effects. Spells never add an ability mod
 * to damage automatically; put the flat bonus in the dice ('1d10+4').
 *
 * Returns {
 *   toHit:  { total, parts:[{label, value}] } | null   (resolve 'attack')
 *   dc:     { total, parts }                  | null   (resolve 'save')
 *   damage: { dice, extra, diceText, perHit, diceOnly, parts } | null
 *   attacks: number   (Extra Attack multiplier; weapons on the Action only)
 * }
 */
function combatBreakdown(option, ctx) {
  const member = ctx?.member || {};
  const net    = ctx?.net || {};
  const weapon = ctx?.weapon || null;   // { name, attack, damage } from the linked loot weapon
  const prof   = effectiveProf(member, net);
  const cs     = member.combat || {};
  const isSpellAbility = option.ability === 'spell';
  const ab     = COMBAT_ABILITIES.includes(option.ability) ? option.ability : null;
  const mod    = ab ? effectiveAbilityMod(member, net, ab) : 0;
  const AB     = ab ? ab.toUpperCase() : '';

  let toHit = null;
  if (option.resolve === 'attack') {
    const parts = [];
    if (isSpellAbility) {
      parts.push({ label: 'Spell Atk', value: parseInt(cs.spellatk, 10) || 0 });
      const fx = _netVal(net, 'spell_attack');
      if (fx) parts.push({ label: 'Items', value: fx });
    } else {
      parts.push({ label: AB || 'Ability', value: mod });
      parts.push({ label: 'Prof', value: prof });
      if (weapon?.attack) parts.push({ label: weapon.name, value: weapon.attack });
      const fx = _netVal(net, 'attack_rolls');
      if (fx) parts.push({ label: 'Items', value: fx });
    }
    toHit = { total: parts.reduce((t, p) => t + p.value, 0), parts };
  }

  let dc = null;
  if (option.resolve === 'save') {
    const parts = [];
    if (isSpellAbility) {
      parts.push({ label: 'Spell DC', value: parseInt(cs.spelldc, 10) || 0 });
      const fx = _netVal(net, 'spell_dc');
      if (fx) parts.push({ label: 'Items', value: fx });
    } else {
      parts.push({ label: 'Base', value: 8 });
      parts.push({ label: 'Prof', value: prof });
      parts.push({ label: AB || 'Ability', value: mod });
    }
    dc = { total: parts.reduce((t, p) => t + p.value, 0), parts };
  }

  let damage = null;
  const main = parseDice(option.dice);
  if (main) {
    if (option.spell_level === 0 && option.scales) {
      const tier = cantripTier(member.level);
      main.dice = main.dice.map(d => ({ n: d.n * tier, s: d.s }));
    }
    const extra = parseDice(option.extra_dice);
    const parts = [{ label: formatDice(main), value: diceAvg(main) }];
    if (extra) parts.push({ label: formatDice(extra), value: diceAvg(extra) });
    if (!isSpellAbility && ab && option.add_mod !== false) parts.push({ label: AB, value: mod });
    if (!isSpellAbility && weapon?.damage) parts.push({ label: weapon.name, value: weapon.damage });
    // Weapon-based spells (Booming Blade on STR) take weapon damage bonuses.
    const fx = _netVal(net, isSpellAbility ? 'spell_damage' : 'damage_rolls');
    if (fx) parts.push({ label: 'Items', value: fx });

    const perHit   = Math.max(0, parts.reduce((t, p) => t + p.value, 0));
    const diceOnly = diceAvg({ dice: main.dice, flat: 0 }) + (extra ? diceAvg({ dice: extra.dice, flat: 0 }) : 0);
    const diceText = [formatDice(main), extra ? formatDice(extra) : ''].filter(Boolean).join(' + ');
    damage = { dice: main, extra, diceText, perHit, diceOnly, parts };
  }

  const attacks = option.kind === 'weapon' && option.action === 'action'
    ? Math.max(1, parseInt(cs.attacks, 10) || 1)
    : 1;

  return { toHit, dc, damage, attacks };
}

/**
 * expectedDamage(option, ctx)
 * Average damage per use against ctx.target = { ac, save }.
 *   attack: hit% × perHit + 5% crit × dice-only avg (crits double dice)
 *   save:   fail% × perHit + success% × (half_on_save ? perHit/2 : 0)
 *   auto:   perHit
 * Multiplied by the Extra Attack count for weapons on the Action.
 * Options with no damage or resolve 'none' return 0.
 */
function expectedDamage(option, ctx, breakdown) {
  const b = breakdown || combatBreakdown(option, ctx);
  if (!b.damage) return 0;
  const target = ctx?.target || {};
  const { perHit, diceOnly } = b.damage;
  let per = 0;
  if (option.resolve === 'attack' && b.toHit) {
    per = hitChance(b.toHit.total, target.ac) * perHit + 0.05 * diceOnly;
  } else if (option.resolve === 'save' && b.dc) {
    const fail = saveFailChance(b.dc.total, target.save);
    per = fail * perHit + (1 - fail) * (option.half_on_save ? perHit / 2 : 0);
  } else if (option.resolve === 'auto') {
    per = perHit;
  }
  return per * b.attacks;
}

/**
 * validateCombatOption(row)
 * Checks a combat_options row before it is saved. Returns an error
 * message string, or null when the row is fine. Options without dice
 * are allowed (Hold Person, Shield); they just never rank.
 */
const COMBAT_KINDS    = ['weapon', 'spell', 'feature'];
const COMBAT_ACTIONS  = ['action', 'bonus', 'reaction'];
const COMBAT_RESOLVES = ['attack', 'save', 'auto', 'none'];

function validateCombatOption(row) {
  if (!row || !String(row.name || '').trim()) return 'Name is required.';
  if (String(row.name).length > 80) return 'Name is too long (80 characters max).';
  if (!COMBAT_KINDS.includes(row.kind)) return 'Pick weapon, spell or feature.';
  if (!COMBAT_ACTIONS.includes(row.action)) return 'Pick action, bonus action or reaction.';
  if (!COMBAT_RESOLVES.includes(row.resolve)) return 'Pick how it resolves.';
  if (row.ability !== 'spell' && !COMBAT_ABILITIES.includes(row.ability)) return 'Pick an ability.';
  if (row.dice && !parseDice(row.dice)) return `Damage "${row.dice}" isn't a dice expression like 2d6+3.`;
  if (row.extra_dice && !parseDice(row.extra_dice)) return `Extra damage "${row.extra_dice}" isn't a dice expression like 1d8.`;
  if (row.extra_dice && !row.dice) return 'Add the main damage dice before extra damage.';
  if (row.spell_level != null && !(Number.isInteger(row.spell_level) && row.spell_level >= 0 && row.spell_level <= 9)) {
    return 'Spell level must be cantrip or 1–9.';
  }
  return null;
}

/**
 * weaponBonus(item)
 * The attack/damage bonus a weapon item gives to attacks made with it:
 * { name, attack, damage }, each bonus − penalty over its
 * attack_rolls / damage_rolls effects.
 */
const WEAPON_SCOPED_STATS = ['attack_rolls', 'damage_rolls'];

function weaponBonus(item) {
  const sum = stat => (item?.statEffects || [])
    .filter(fx => fx.stat === stat)
    .reduce((t, fx) => t + (fx.type === 'bonus' ? (fx.value || 0) : fx.type === 'penalty' ? -(fx.value || 0) : 0), 0);
  return { name: item?.name || 'Weapon', attack: sum('attack_rolls'), damage: sum('damage_rolls') };
}

/**
 * combatContext(member, items, option, target)
 * Everything combatBreakdown / expectedDamage / rankCombatOptions need for
 * one option: net effects WITHOUT weapon-item attack/damage bonuses, plus
 * the bonus of the weapon the option is linked to (loot_item_id), but only
 * while this member or the Party holds it. Items use the computeNetEffects
 * shape ({ id, name, type, holder, statEffects }).
 */
function combatContext(member, items, option, target) {
  const { net, relevant } = computeNetEffects(member?.name, items || [], { excludeWeaponAttackFx: true });
  const linked = option?.loot_item_id ? relevant.find(it => it.id === option.loot_item_id) : null;
  const weapon = linked && isWeaponItem(linked) ? weaponBonus(linked) : null;
  return { member, net, weapon, target };
}

/**
 * isWeaponItem(item)
 * True for loot items whose type is a weapon ('Melee Weapon',
 * 'Ranged Weapon', 'Thrown Weapon', 'Other Weapon', legacy 'Weapon')
 * or 'Ammunition'. Their attack/damage effects belong to the weapon
 * itself, not to every attack the holder makes.
 */
function isWeaponItem(item) {
  return /weapon|ammunition/i.test(item?.type || '');
}

/**
 * COMBAT_TARGET_DEFAULTS / normalizeCombatTarget(target)
 * The DM's single target (nexus_settings 'combat_target'). Coerces
 * AC to 1–40 and the save bonus to −5..+20, whole numbers, falling
 * back to the defaults for anything missing or non-numeric.
 */
const COMBAT_TARGET_DEFAULTS = { ac: 15, save: 2 };

function normalizeCombatTarget(target) {
  const ac   = parseInt(target?.ac, 10);
  const save = parseInt(target?.save, 10);
  return {
    ac:   Number.isFinite(ac)   ? Math.min(40, Math.max(1, ac))    : COMBAT_TARGET_DEFAULTS.ac,
    save: Number.isFinite(save) ? Math.min(20, Math.max(-5, save)) : COMBAT_TARGET_DEFAULTS.save,
  };
}

/**
 * rankCombatOptions(options, ctx)
 * Scores every damaging option and sorts best-first (ties by name).
 * ctx is either one shared context or a function option → context
 * (so each option can carry its own linked-weapon bonus).
 * Returns {
 *   ranked:     [{ option, breakdown, expected }]   damaging options only
 *   top:        first 3 of ranked
 *   bestAtWill: best weapon/cantrip, only when none is in top; else null
 * }
 */
function rankCombatOptions(options, ctx) {
  const ranked = (options || [])
    .filter(o => o && o.resolve && o.resolve !== 'none')
    .map(option => {
      const c = typeof ctx === 'function' ? ctx(option) : ctx;
      const breakdown = combatBreakdown(option, c);
      return { option, breakdown, expected: expectedDamage(option, c, breakdown) };
    })
    .filter(r => r.breakdown.damage && r.expected > 0)
    .sort((a, b) => (b.expected - a.expected) || String(a.option.name || '').localeCompare(String(b.option.name || '')));
  const top = ranked.slice(0, 3);
  const bestAtWill = top.some(r => isAtWill(r.option))
    ? null
    : (ranked.find(r => isAtWill(r.option)) || null);
  return { ranked, top, bestAtWill };
}


// ──────────────────────────────────────────────────────────────
//  TREASURY MATH
// ──────────────────────────────────────────────────────────────

/**
 * recalcVaultFromLedger(ledger)
 * Pure version of recalcVault() — takes a ledger array and returns
 * a fresh vault object without touching any global state.
 *
 * Each transaction contributes:
 *   type === 'gain'  → positive amounts added to vault
 *   type === 'spend' → amounts subtracted from vault
 *
 * Vault values can go negative (debt is allowed).
 *
 * Returns: { currencyId: number, ... }
 */
function recalcVaultFromLedger(ledger) {
  const vault = {};
  for (const tx of ledger) {
    const sign = tx.type === 'spend' ? -1 : 1;
    for (const [cid, amt] of Object.entries(tx.coins || {})) {
      vault[cid] = (vault[cid] || 0) + sign * (amt || 0);
    }
  }
  return vault;
}

/**
 * calcSplitShares(coins, n)
 * Given an amount of currency to distribute and a recipient count,
 * calculates the integer per-share amount and remainder for each currency.
 *
 * Uses Math.trunc (truncates toward zero) so negative splits work
 * correctly — debt shares are negative, and remainder matches sign.
 *
 * The invariant that MUST always hold:
 *   perShare[cid] * n + remainder[cid] === coins[cid]
 *
 * Parameters:
 *   coins — { currencyId: amount, ... }
 *   n     — number of recipients (must be >= 1)
 *
 * Returns: { perShare: { cid: number }, remainder: { cid: number } }
 */
function calcSplitShares(coins, n) {
  const perShare  = {};
  const remainder = {};
  for (const [cid, amt] of Object.entries(coins)) {
    perShare[cid]  = Math.trunc(amt / n);
    remainder[cid] = amt - perShare[cid] * n;
  }
  return { perShare, remainder };
}

/**
 * getMemberNetWorth(memberName, memberVaults, currencies)
 * Pure version of getMemberNetWorth() — calculates the total value
 * of a party member's holdings converted to base currency units.
 *
 * Each currency's amount is multiplied by its exchange rate to get
 * a comparable base-currency value, then all are summed.
 *
 * Returns null if no currency has a rate set (can't convert).
 * Returns a number (possibly negative for indebted members) otherwise.
 *
 * Parameters:
 *   memberName    — string
 *   memberVaults  — { memberName: { currencyId: amount } }
 *   currencies    — array of { id, rate } objects
 */
function getMemberNetWorth(memberName, memberVaults, currencies) {
  const v = memberVaults[memberName] || {};
  let total = 0;
  let hasRate = false;
  for (const cur of currencies) {
    const amt = v[cur.id] || 0;
    if (cur.rate != null) { total += amt * cur.rate; hasRate = true; }
  }
  return hasRate ? total : null;
}


// ──────────────────────────────────────────────────────────────
//  LOOT TRACKER
// ──────────────────────────────────────────────────────────────

/**
 * LOOT_GROUP_EMOJI
 * Maps loot category names to their display emoji.
 * Used in table rows, filter dropdowns, and optgroup labels.
 */
const LOOT_GROUP_EMOJI = {
  'Weapon':            '⚔️',
  'Armor & Shield':    '🛡️',
  'Potion':            '🧪',
  'Scroll':            '📜',
  'Wand, Staff & Rod': '🪄',
  'Worn / Carried':    '💍',
  'Adventuring Gear':  '🎒',
  'Other':             '✨',
};

/**
 * lootTypeEmoji(type)
 * Returns the emoji for a given item type string by substring-matching
 * against known category keywords (case-insensitive).
 * Falls back to the 'Other' emoji if no keywords match.
 *
 * Examples:
 *   lootTypeEmoji('Melee Weapon')  → '⚔️'
 *   lootTypeEmoji('Light Armor')   → '🛡️'
 *   lootTypeEmoji('Healing Potion')→ '🧪'
 *   lootTypeEmoji(null)            → '✨'
 *   lootTypeEmoji('Weird Thing')   → '✨'
 */
function lootTypeEmoji(type) {
  if (!type) return LOOT_GROUP_EMOJI['Other'];
  const t = type.toLowerCase();
  if (t.includes('weapon') || t.includes('melee') || t.includes('ranged') ||
      t.includes('thrown') || t.includes('ammunition'))          return LOOT_GROUP_EMOJI['Weapon'];
  if (t.includes('armor') || t.includes('armour') || t.includes('shield') ||
      t.includes('light armor') || t.includes('medium armor') ||
      t.includes('heavy armor'))                                  return LOOT_GROUP_EMOJI['Armor & Shield'];
  if (t.includes('potion'))                                       return LOOT_GROUP_EMOJI['Potion'];
  if (t.includes('scroll'))                                       return LOOT_GROUP_EMOJI['Scroll'];
  if (t.includes('wand') || t.includes('staff') || t.includes('rod')) return LOOT_GROUP_EMOJI['Wand, Staff & Rod'];
  if (t.includes('bag') || t.includes('container') || t.includes('instrument') ||
      t.includes('tool') || t.includes('vehicle') || t.includes('gear'))
                                                                  return LOOT_GROUP_EMOJI['Adventuring Gear'];
  if (t.includes('ring') || t.includes('cloak') || t.includes('boots') ||
      t.includes('gloves') || t.includes('helm') || t.includes('amulet') ||
      t.includes('belt') || t.includes('bracers') || t.includes('wondrous') ||
      t.includes('worn') || t.includes('carried'))               return LOOT_GROUP_EMOJI['Worn / Carried'];
  return LOOT_GROUP_EMOJI['Other'];
}


// ──────────────────────────────────────────────────────────────
//  SESSION LOG
// ──────────────────────────────────────────────────────────────

/**
 * slugify(name)
 * Converts a display name into a URL/citation-safe slug.
 *
 * Steps:
 *   1. Lowercase
 *   2. Replace any run of non-alphanumeric characters with a single hyphen
 *   3. Strip leading/trailing hyphens
 *
 * Used to auto-generate the ^citation key for new NPCs.
 *
 * Examples:
 *   slugify('Captain Draegar')  → 'captain-draegar'
 *   slugify("Lord Kael'thas")   → 'lord-kael-thas'
 *   slugify('  Baba Yaga  ')    → 'baba-yaga'
 *   slugify('')                 → ''
 */
function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}


// ──────────────────────────────────────────────────────────────
//  MODULE EXPORT (Node / test runner only)
//  When loaded in a browser via <script>, module is undefined
//  and this block is skipped safely.
// ──────────────────────────────────────────────────────────────


// ══════════════════════════════════════════════════════════════
//  TOAST NOTIFICATION
//  showToast(msg, dur?)
//
//  Shows a brief notification at the bottom of the screen.
//  Injects the #toast div into the document body on first call
//  so pages don't need to include the element themselves.
// ══════════════════════════════════════════════════════════════

function showToast(msg, dur = 2800) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._to);
  t._to = setTimeout(() => t.classList.remove('show'), dur);
}

// ══════════════════════════════════════════════════════════════
//  SIDENAV COMPONENT
//  buildSidenav(activeHref)
//
//  Writes the full sidenav HTML into #nexus-nav-root and wires
//  up the hamburger toggle and overlay.  Call once per page:
//
//    buildSidenav('party-roster.html');
//
//  Module links are hidden when their module is disabled via
//  MODULE_ENABLED (set by loadModuleSettings in nexus-config.js).
//  Admin and Dashboard are always visible.
// ══════════════════════════════════════════════════════════════

const NAV_LINKS = [
  { href: 'index.html',        icon: '⬡',  label: 'Dashboard'    },
  { href: 'party-roster.html', icon: '👥', label: 'Party Roster' },
  { href: 'treasury.html',     icon: '💰', label: 'Treasury'     },
  { href: 'loot-tracker.html', icon: '⚔️', label: 'Loot Tracker' },
  { href: 'session-log.html',  icon: '📋', label: 'Session Log'  },
  { href: 'combat.html',       icon: '🗡️', label: 'Combat'       },
  { href: 'admin.html',        icon: '⚙',  label: 'Admin'        },
];

// Maps page hrefs to their MODULE_ENABLED key (Dashboard+Admin have none)
const NAV_MODULE_KEY = {
  'party-roster.html': 'partyRoster',
  'treasury.html':     'treasury',
  'loot-tracker.html': 'lootTracker',
  'session-log.html':  'sessionLog',
  'combat.html':       'combat',
};

function buildSidenav(activeHref) {
  const root = document.getElementById('nexus-nav-root');
  if (!root) return;

  const linksHtml = NAV_LINKS.map(link => {
    const modKey = NAV_MODULE_KEY[link.href];
    // Module links respect visibility; Dashboard + Admin always shown
    const hidden = (modKey && typeof isModuleEnabled === 'function' && !isModuleEnabled(modKey))
      ? ' style="display:none"' : '';
    const active = link.href === activeHref ? ' active' : '';
    return (
      `    <a class="sidenav-link${active}" href="${link.href}"${hidden}>\n` +
      `      <span class="nav-icon">${link.icon}</span>\n` +
      `      <span class="nav-label">${link.label}</span>\n` +
      `      <span class="nav-pip"></span>\n` +
      `    </a>`
    );
  }).join('\n');

  root.innerHTML =
    `<button class="nav-toggle" id="navToggle" aria-label="Toggle navigation">\n` +
    `  <span></span><span></span><span></span>\n` +
    `</button>\n` +
    `<div class="nav-overlay" id="navOverlay"></div>\n` +
    `<nav class="sidenav" id="sidenav">\n` +
    `  <a class="sidenav-logo" href="index.html">\n` +
    `    <div class="sidenav-logo-top">⚙ nexus</div>\n` +
    `    <div class="sidenav-logo-name">NEXUS</div>\n` +
    `    <div class="sidenav-logo-sub">campaign system</div>\n` +
    `  </a>\n` +
    `  <div class="sidenav-section">Modules</div>\n` +
    `  <div class="sidenav-links">\n` +
    linksHtml + '\n' +
    `  </div>\n` +
    `  <div class="sidenav-bottom">nexus // v1.0.0</div>\n` +
    `</nav>`;

  // Wire toggle and overlay now that they exist in the DOM
  document.getElementById('navToggle').addEventListener('click', () => {
    document.getElementById('sidenav').classList.contains('nav-open')
      ? closeNav() : openNav();
  });
  document.getElementById('navOverlay').addEventListener('click', closeNav);
}

function openNav() {
  document.getElementById('sidenav').classList.add('nav-open');
  document.getElementById('navOverlay').classList.add('nav-open');
}

function closeNav() {
  document.getElementById('sidenav').classList.remove('nav-open');
  document.getElementById('navOverlay').classList.remove('nav-open');
}

if (typeof module !== 'undefined') {
  module.exports = {
    uid,
    fmt,
    esc,
    showToast,
    openNav,
    closeNav,
    buildSidenav,
    NAV_LINKS,
    NAV_MODULE_KEY,
    abilityMod,
    modStr,
    computeCheck,
    computeNetEffects,
    COMBAT_ABILITIES,
    parseDice,
    diceAvg,
    formatDice,
    profFromLevel,
    cantripTier,
    hitChance,
    saveFailChance,
    effectiveProf,
    effectiveAbilityMod,
    isAtWill,
    combatBreakdown,
    expectedDamage,
    rankCombatOptions,
    COMBAT_KINDS,
    COMBAT_ACTIONS,
    COMBAT_RESOLVES,
    validateCombatOption,
    isWeaponItem,
    WEAPON_SCOPED_STATS,
    weaponBonus,
    combatContext,
    COMBAT_TARGET_DEFAULTS,
    normalizeCombatTarget,
    recalcVaultFromLedger,
    calcSplitShares,
    getMemberNetWorth,
    LOOT_GROUP_EMOJI,
    DAMAGE_TYPES,
    lootTypeEmoji,
    slugify,
  };
}
