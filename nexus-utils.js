// ══════════════════════════════════════════════════════════════
//  nexus-utils.js  —  Pure utility functions shared across all
//  NEXUS modules. No DOM access, no Supabase, no side effects.
//
//  These functions are:
//    1. Included in every page via <script src="nexus-utils.js">
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
 * without XSS risk. Converts &, <, > to their HTML entities.
 * Example: esc('<b>bold</b>') → '&lt;b&gt;bold&lt;/b&gt;'
 */
function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
 * computeNetEffects(memberName, items)
 * Aggregates all stat effects from items held by a party member
 * (or tagged as 'Party') into a net effects map.
 *
 * Returns: { net, relevant }
 *   net      — { statKey: { bonus, penalty, advantage, disadvantage, sources[] } }
 *   relevant — the filtered array of items that apply to this member
 *
 * Matching is case-insensitive. Items held by 'Party' apply to all members.
 */
function computeNetEffects(memberName, items) {
  const relevant = items.filter(it => {
    const h = (it.holder || '').toLowerCase().trim();
    const n = (memberName || '').toLowerCase().trim();
    return h === n || h === 'party';
  });

  const net = {};
  for (const item of relevant) {
    for (const fx of (item.statEffects || [])) {
      if (!fx.stat) continue;
      if (!net[fx.stat]) net[fx.stat] = { bonus: 0, penalty: 0, advantage: 0, disadvantage: 0, sources: [] };
      if (fx.type === 'bonus')       net[fx.stat].bonus      += (fx.value || 0);
      if (fx.type === 'penalty')     net[fx.stat].penalty    += (fx.value || 0);
      if (fx.type === 'advantage')   net[fx.stat].advantage++;
      if (fx.type === 'disadvantage') net[fx.stat].disadvantage++;
      net[fx.stat].sources.push({ itemName: item.name, itemRarity: item.rarity, fx });
    }
  }
  return { net, relevant };
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
//  MODULE EXPORT (Node / test runner only)
//  When loaded in a browser via <script>, module is undefined
//  and this block is skipped safely.
// ──────────────────────────────────────────────────────────────
if (typeof module !== 'undefined') {
  module.exports = {
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
  };
}
