// ══════════════════════════════════════════════════════════════
//  js/nexus-srd.js  —  D&D 5e (2014) SRD lookup
//
//  Name search + auto-fill for spells, weapons and magic items from
//  the free dnd5eapi.co API (CORS-enabled, SRD 5.1 content only —
//  non-SRD spells/items such as Booming Blade are typed in by hand).
//
//  Load after nexus-utils.js on pages that need it:
//    <script src="js/nexus-srd.js"></script>
//
//  Mapping functions (srd*To*, parseSrdItemEffects, srdFilter, library*)
//  are pure and exported for the test suite. Fetching, CampaignLibrary and
//  the dropdown are browser-only.
//
//  CAMPAIGN LIBRARY: non-SRD content (Tasha's, Xanathar's, homebrew) that
//  the DM types in once is saved to the campaign_library table and then
//  shows up in the same search dropdowns, tagged "Campaign". Search kinds
//  'campaign:spell' | 'campaign:weapon' | 'campaign:item' | 'campaign:feature'
//  read from it; the other kinds read the SRD API.
// ══════════════════════════════════════════════════════════════

// parseDice comes from nexus-utils.js (a global in the browser, required under Node)
const _srdParseDice = typeof parseDice === 'function' ? parseDice : require('./nexus-utils.js').parseDice;

const SRD_API = 'https://www.dnd5eapi.co';
const SRD_LISTS = {
  spells:        '/api/2014/spells',
  'magic-items': '/api/2014/magic-items',
  weapons:       '/api/2014/equipment-categories/weapon',
};
const SRD_ABILITY_NAMES = {
  strength: 'str', dexterity: 'dex', constitution: 'con',
  intelligence: 'int', wisdom: 'wis', charisma: 'cha',
};

// ──────────────────────────────────────────────────────────────
//  PURE HELPERS
// ──────────────────────────────────────────────────────────────

/**
 * srdFilter(list, query, limit)
 * Case/punctuation-insensitive name search over [{index, name, url}].
 * Names starting with the query rank first, then word starts, then
 * anywhere; ties alphabetical. Empty query → [].
 */
function srdFilter(list, query, limit = 8) {
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9+ ]/g, '').replace(/\s+/g, ' ').trim();
  const q = norm(query);
  if (!q) return [];
  const scored = [];
  for (const entry of list || []) {
    const n = norm(entry.name);
    let score = -1;
    if (n.startsWith(q)) score = 0;
    else if (n.split(' ').some(w => w.startsWith(q))) score = 1;
    else if (n.includes(q)) score = 2;
    if (score >= 0) scored.push({ entry, score });
  }
  scored.sort((a, b) => (a.score - b.score) || a.entry.name.localeCompare(b.entry.name));
  return scored.slice(0, limit).map(s => s.entry);
}

function _srdFeet(text) {
  return String(text || '').replace(/\bfeet\b/gi, 'ft').replace(/\bfoot\b/gi, 'ft');
}

/**
 * srdSpellToOption(spell)
 * dnd5eapi spell JSON → combat_options fields (kind 'spell').
 * Damage dice come from the base slot level (or level-1 cantrip damage);
 * "+ MOD" is stripped and called out in notes because the sheet does not
 * add the spellcasting modifier to spell damage automatically.
 */
function srdSpellToOption(spell) {
  const s = spell || {};
  const castingTime = s.casting_time || '';
  const action = /bonus action/i.test(castingTime) ? 'bonus'
    : /reaction/i.test(castingTime) ? 'reaction'
    : 'action';

  const dmg = (s.damage && !Array.isArray(s.damage)) ? s.damage : (Array.isArray(s.damage) ? s.damage[0] : null);
  let dice = null, scales = false, modNote = false;
  if (dmg) {
    const bySlot = dmg.damage_at_slot_level;
    const byChar = dmg.damage_at_character_level;
    let raw = null;
    if (bySlot) raw = bySlot[String(s.level)] ?? bySlot[Object.keys(bySlot).sort((a, b) => a - b)[0]];
    else if (byChar) { raw = byChar['1'] ?? byChar[Object.keys(byChar).sort((a, b) => a - b)[0]]; scales = true; }
    if (raw) {
      if (/\+\s*MOD/i.test(raw)) modNote = true;
      const cleaned = String(raw).replace(/\+\s*MOD/i, '').replace(/\s+/g, '').replace(/\+$/, '');
      dice = _srdParseDice(cleaned) ? cleaned : null;
    }
  }

  const resolve = s.dc ? 'save' : s.attack_type ? 'attack' : dice ? 'auto' : 'none';
  const notes = [];
  if (modNote) notes.push('Add your spellcasting modifier to the damage (not included above).');
  if (dmg && !dice) notes.push('Damage could not be read from the SRD entry; enter the dice by hand.');

  return {
    name:          s.name || '',
    kind:          'spell',
    action,
    resolve,
    ability:       'spell',
    save_ability:  s.dc?.dc_type?.index || null,
    half_on_save:  s.dc?.dc_success === 'half',
    dice,
    extra_dice:    null,
    damage_type:   dmg?.damage_type?.index || null,
    add_mod:       false,
    spell_level:   Number.isInteger(s.level) ? s.level : null,
    scales,
    aoe:           !!s.area_of_effect,
    range:         s.range ? _srdFeet(s.range) + (s.area_of_effect ? ` (${s.area_of_effect.size} ft ${s.area_of_effect.type})` : '') : null,
    notes:         notes.join(' ') || null,
    school:        s.school?.name || null,
    components:    Array.isArray(s.components) && s.components.length ? s.components.join(', ') : null,
    material:      s.material || null,
    casting_time:  castingTime || null,
    duration:      s.duration || null,
    concentration: !!s.concentration,
    ritual:        !!s.ritual,
    description:   [...(s.desc || []), ...(s.higher_level || []).map(h => 'At higher levels: ' + h)].join('\n\n') || null,
    srd_index:     s.index || null,
  };
}

/**
 * srdWeaponToOption(weapon, member?)
 * dnd5eapi equipment (weapon) JSON → combat_options fields (kind 'weapon')
 * plus lootType for the Loot Tracker. Finesse weapons use DEX when the
 * member's DEX beats their STR.
 */
function srdWeaponToOption(weapon, member) {
  const w = weapon || {};
  const props = (w.properties || []).map(p => p.index);
  const ranged = w.weapon_range === 'Ranged';
  const abs = member?.abilities || {};
  const ability = ranged ? 'dex'
    : props.includes('finesse') && (abs.dex || 10) > (abs.str || 10) ? 'dex'
    : 'str';

  let range = props.includes('reach') ? '10 ft' : '5 ft';
  if (ranged && w.range) range = `${w.range.normal}${w.range.long ? '/' + w.range.long : ''} ft`;
  else if (props.includes('thrown') && w.throw_range) range += `, thrown ${w.throw_range.normal}/${w.throw_range.long} ft`;

  const noteBits = (w.properties || []).map(p => p.name);
  if (w.two_handed_damage?.damage_dice) noteBits.push(`two-handed ${w.two_handed_damage.damage_dice}`);

  return {
    name:        w.name || '',
    kind:        'weapon',
    action:      'action',
    resolve:     'attack',
    ability,
    dice:        w.damage?.damage_dice || null,
    extra_dice:  null,
    damage_type: w.damage?.damage_type?.index || null,
    add_mod:     true,
    spell_level: null,
    range,
    notes:       noteBits.length ? noteBits.join(', ') : null,
    srd_index:   w.index || null,
    lootType:    ranged ? 'Ranged Weapon' : 'Melee Weapon',
  };
}

/**
 * parseSrdItemEffects(text)
 * Reads the common SRD phrasings into Nexus stat effects:
 *   "Your Strength score is 19"               → { str, set, 19 }
 *   "+1 bonus to attack and damage rolls"     → attack_rolls + damage_rolls
 *   "+1 bonus to AC and saving throws"        → ac + all six saves
 *   "+2 bonus to AC"                          → ac
 *   "+1 bonus to spell attack rolls"          → spell_attack
 *   "+1 bonus to saving throws"               → all six saves
 *   "increases your Wisdom score by 2"        → wis bonus 2
 * Anything else is left for the user to add by hand.
 */
function parseSrdItemEffects(text) {
  const t = String(text || '');
  const out = [];
  const add = (stat, type, value) => {
    if (!out.some(f => f.stat === stat && f.type === type)) out.push({ stat, type, value });
  };
  const saves = v => ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(a => add('save_' + a, 'bonus', v));
  let m;

  const setRe = /\b(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) score (?:is|becomes|changes to)(?: a)? (\d+)/gi;
  while ((m = setRe.exec(t))) add(SRD_ABILITY_NAMES[m[1].toLowerCase()], 'set', parseInt(m[2], 10));

  const incRe = /increases? your (Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma) score by (\d+)/gi;
  while ((m = incRe.exec(t))) add(SRD_ABILITY_NAMES[m[1].toLowerCase()], 'bonus', parseInt(m[2], 10));

  if ((m = /\+(\d+) bonus to attack and damage rolls/i.exec(t))) {
    add('attack_rolls', 'bonus', +m[1]);
    add('damage_rolls', 'bonus', +m[1]);
  }
  if ((m = /\+(\d+) bonus to (?:AC|Armor Class) and saving throws/i.exec(t))) {
    add('ac', 'bonus', +m[1]);
    saves(+m[1]);
  } else {
    if ((m = /\+(\d+) bonus to (?:AC|Armor Class)\b/i.exec(t))) add('ac', 'bonus', +m[1]);
    if ((m = /\+(\d+) bonus to (?:all )?saving throws/i.exec(t))) saves(+m[1]);
  }
  if ((m = /\+(\d+) bonus to spell attack rolls/i.exec(t))) add('spell_attack', 'bonus', +m[1]);
  if ((m = /\+(\d+) bonus to (?:your )?spell save DC/i.exec(t))) add('spell_dc', 'bonus', +m[1]);
  return out;
}

const _SRD_WONDROUS_TYPES = [
  [/\bcloak|mantle|cape\b/i, 'Cloak'],
  [/\bboots|slippers\b/i, 'Boots'],
  [/\bgloves|gauntlets\b/i, 'Gloves'],
  [/\bhelm|hat|circlet|headband|crown\b/i, 'Helm'],
  [/\bamulet|necklace|periapt|medallion|brooch\b/i, 'Amulet'],
  [/\bbelt\b/i, 'Belt'],
  [/\bbracers\b/i, 'Bracers'],
  [/\bbag|haversack|pouch\b/i, 'Bag'],
];

/**
 * srdItemToLoot(item)
 * dnd5eapi magic-item JSON → Loot Tracker fields:
 *   { name, type, rarity, attunement, desc, statEffects }
 * type is one of the Loot Tracker's type options (the page falls back to
 * 'Other' if a value is missing from its select).
 */
function srdItemToLoot(item) {
  const it = item || {};
  const desc = it.desc || [];
  const header = desc[0] || '';
  const body = desc.slice(1).join('\n\n');
  const cat = it.equipment_category?.index || '';
  const name = it.name || '';

  let type = 'Wondrous Item';
  if (cat === 'weapon' || cat === 'ammunition') type = cat === 'ammunition' ? 'Ammunition' : 'Other Weapon';
  else if (cat === 'armor') type = /shield/i.test(name) ? 'Shield' : 'Other Armor';
  else if (cat === 'potion') type = /^Potion of /i.test(name) ? name : 'Other Potion';
  else if (cat === 'scroll') type = 'Spell Scroll';
  else if (cat === 'wand') type = 'Wand';
  else if (cat === 'staff') type = 'Staff';
  else if (cat === 'rod') type = 'Rod';
  else if (cat === 'ring') type = 'Ring';
  else {
    const hit = _SRD_WONDROUS_TYPES.find(([re]) => re.test(name));
    if (hit) type = hit[1];
  }

  const r = String(it.rarity?.name || '').toLowerCase().replace(/\s+/g, '-');
  const rarity = ['common', 'uncommon', 'rare', 'very-rare', 'legendary', 'artifact'].includes(r) ? r : null;

  return {
    name,
    type,
    rarity,
    attunement: /requires attunement/i.test(header) ? 'required' : 'none',
    desc: body || header,
    statEffects: parseSrdItemEffects(body || header),
    srdIndex: it.index || null,
  };
}

// ──────────────────────────────────────────────────────────────
//  CAMPAIGN LIBRARY — pure helpers
// ──────────────────────────────────────────────────────────────
const LIBRARY_KINDS = ['spell', 'weapon', 'item', 'feature'];

// combat_options fields worth reusing for another character (no ids,
// owner, loot link or per-character prepared state)
const LIBRARY_OPTION_FIELDS = [
  'kind', 'action', 'resolve', 'ability', 'save_ability', 'dice', 'extra_dice', 'damage_type',
  'add_mod', 'spell_level', 'scales', 'half_on_save', 'aoe', 'range', 'notes',
  'school', 'components', 'material', 'casting_time', 'duration', 'concentration', 'ritual', 'description',
];

/**
 * libraryEntryFromOption(row, lootType)
 * combat_options row → { kind, name, data } for campaign_library.
 * Weapons remember which Loot Tracker type they are (lootType).
 */
function libraryEntryFromOption(row, lootType) {
  const kind = row.kind === 'spell' ? 'spell' : row.kind === 'feature' ? 'feature' : 'weapon';
  const data = { name: String(row.name || '').trim() };
  for (const f of LIBRARY_OPTION_FIELDS) if (row[f] !== undefined) data[f] = row[f];
  if (kind === 'weapon') data.lootType = lootType || (/\d+\/\d+/.test(row.range || '') ? 'Ranged Weapon' : 'Melee Weapon');
  return { kind, name: data.name, data };
}

/**
 * libraryEntryFromLoot(item)
 * Loot Tracker item → { kind: 'item', name, data } (no holder / quantity).
 */
function libraryEntryFromLoot(item) {
  const name = String(item.name || '').trim();
  return {
    kind: 'item',
    name,
    data: {
      name,
      type: item.type || null,
      rarity: item.rarity || null,
      attunement: item.attunement || 'none',
      desc: item.desc || '',
      statEffects: (item.statEffects || []).map(fx => ({ ...fx })),
    },
  };
}

/** Same kind and same name, ignoring case and outer spaces. */
function findLibraryMatch(entries, kind, name) {
  const n = String(name || '').trim().toLowerCase();
  return (entries || []).find(e => e.kind === kind && String(e.name || '').trim().toLowerCase() === n) || null;
}

/** Library rows of one kind in the {index, name, url} shape srdFilter expects. */
function librarySearchList(entries, kind) {
  return (entries || [])
    .filter(e => e.kind === kind)
    .map(e => ({ index: e.id, name: e.name, url: null, campaign: true, entry: e }));
}

/**
 * libraryWeaponToLoot(data)
 * A library weapon (option-shaped data) → Loot Tracker fields, the same
 * way an SRD weapon fills the Loot form.
 */
function libraryWeaponToLoot(data) {
  const d = data || {};
  return {
    name: d.name || '',
    type: d.lootType || 'Melee Weapon',
    rarity: 'common',
    attunement: 'none',
    desc: [d.dice && `${d.dice} ${d.damage_type || ''}`.trim(), d.range, d.notes].filter(Boolean).join(' · '),
    statEffects: [],
  };
}

// ──────────────────────────────────────────────────────────────
//  FETCHING (browser) — lists are cached for the session
// ──────────────────────────────────────────────────────────────
const _srdMem = {};

async function srdList(kind) {
  if (String(kind).startsWith('campaign:')) {
    return librarySearchList(await CampaignLibrary.load(), kind.slice('campaign:'.length));
  }
  if (_srdMem[kind]) return _srdMem[kind];
  const key = 'nexus_srd_' + kind;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return (_srdMem[kind] = JSON.parse(cached));
  } catch (e) { /* storage unavailable */ }
  const r = await fetch(SRD_API + SRD_LISTS[kind]);
  if (!r.ok) throw new Error(`SRD list ${kind}: ${r.status}`);
  const json = await r.json();
  const list = (json.results || json.equipment || []).map(e => ({ index: e.index, name: e.name, url: e.url }));
  _srdMem[kind] = list;
  try { sessionStorage.setItem(key, JSON.stringify(list)); } catch (e) { /* quota / private mode */ }
  return list;
}

async function srdGet(url) {
  if (_srdMem[url]) return _srdMem[url];
  const r = await fetch(SRD_API + url);
  if (!r.ok) throw new Error(`SRD ${url}: ${r.status}`);
  return (_srdMem[url] = await r.json());
}

/**
 * CampaignLibrary — the campaign_library table, loaded once per page.
 * save() upserts by kind + name. Callers run nexusGate() first.
 * A missing table (SQL not run yet) just means an empty library.
 */
const CampaignLibrary = {
  _rows: null,
  missing: false,

  async load(force) {
    if (this._rows && !force) return this._rows;
    try {
      this._rows = await db.select('campaign_library', { order: 'name.asc' });
      this.missing = false;
    } catch (e) {
      console.info('[NEXUS] campaign_library not available:', e.message);
      this._rows = [];
      this.missing = true;
    }
    return this._rows;
  },

  async save(entry) {
    await this.load();
    if (this.missing) throw new Error('campaign_library table missing — run sql/supabase_library.sql');
    const hit = findLibraryMatch(this._rows, entry.kind, entry.name);
    if (hit) {
      await db.update('campaign_library', hit.id, { name: entry.name, data: entry.data });
      Object.assign(hit, { name: entry.name, data: entry.data });
      return hit;
    }
    const row = { id: uid(), kind: entry.kind, name: entry.name, data: entry.data };
    await db.insert('campaign_library', row);
    this._rows.push(row);
    return row;
  },

  async remove(id) {
    await db.delete('campaign_library', id);
    if (this._rows) this._rows = this._rows.filter(r => r.id !== id);
  },
};

/**
 * attachSrdSearch(input, { kind, onPick })
 * Turns a text input into an SRD name search. kind is a string, an array
 * of strings (searched together), or a function returning either —
 * 'spells' | 'weapons' | 'magic-items' — or null to switch search off
 * (e.g. for features). onPick(detailJson) runs after the user
 * picks a result; typing a name that isn't in the SRD just keeps the text.
 * Safe to call once per input; returns a detach function.
 */
function attachSrdSearch(input, { kind, onPick }) {
  if (!input || input._srdAttached) return () => {};
  input._srdAttached = true;
  input.setAttribute('autocomplete', 'off');
  const box = document.createElement('div');
  box.className = 'srd-results';
  box.setAttribute('role', 'listbox');
  input.insertAdjacentElement('afterend', box);
  const wrap = input.parentElement;
  if (wrap && getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';

  let results = [], active = -1, timer = null, seq = 0;
  const currentKind = () => (typeof kind === 'function' ? kind() : kind);
  const close = () => { box.classList.remove('open'); box.innerHTML = ''; results = []; active = -1; };

  const draw = msg => {
    if (msg) { box.innerHTML = `<div class="srd-msg">${esc(msg)}</div>`; box.classList.add('open'); return; }
    if (!results.length) { close(); return; }
    box.innerHTML = results.map((r, i) =>
      `<div class="srd-opt${i === active ? ' active' : ''}" role="option" data-i="${i}">${esc(r.name)}` +
      `${r.campaign ? '<span class="srd-tag">Campaign</span>' : ''}</div>`
    ).join('') + '<div class="srd-msg">SRD 5e + campaign library · not listed? just type it</div>';
    box.classList.add('open');
  };

  const pick = async i => {
    const r = results[i];
    if (!r) return;
    input.value = r.name;
    close();
    if (r.campaign) {
      // Library entries are already in Nexus shape — no fetch
      onPick && onPick({ __campaign: true, kind: r.entry.kind, name: r.entry.name, data: r.entry.data });
      return;
    }
    try {
      const detail = await srdGet(r.url);
      onPick && onPick(detail);
    } catch (e) {
      console.error(e);
      if (typeof showToast === 'function') showToast('Could not load SRD details — fill the fields in by hand.');
    }
  };

  const search = async () => {
    const kinds = [].concat(currentKind() || []);
    const q = input.value.trim();
    if (!kinds.length || q.length < 2) { close(); return; }
    const mine = ++seq;
    try {
      const list = (await Promise.all(kinds.map(srdList))).flat();
      if (mine !== seq) return;
      results = srdFilter(list, q, 8);
      active = -1;
      draw();
    } catch (e) {
      console.error(e);
      if (mine === seq) draw('SRD lookup unavailable — type the details in');
    }
  };

  const onInput = () => { clearTimeout(timer); timer = setTimeout(search, 150); };
  const onKey = e => {
    if (!box.classList.contains('open') || !results.length) return;
    if (e.key === 'ArrowDown') { active = (active + 1) % results.length; draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = (active - 1 + results.length) % results.length; draw(); e.preventDefault(); }
    else if (e.key === 'Enter' && active >= 0) { pick(active); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === 'Escape') { close(); e.stopPropagation(); }
  };
  const onDown = e => {
    const opt = e.target.closest('.srd-opt');
    if (opt) { e.preventDefault(); pick(+opt.dataset.i); }
  };
  const onBlur = () => setTimeout(close, 150);

  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKey);
  input.addEventListener('blur', onBlur);
  box.addEventListener('mousedown', onDown);
  return () => {
    input.removeEventListener('input', onInput);
    input.removeEventListener('keydown', onKey);
    input.removeEventListener('blur', onBlur);
    box.remove();
    input._srdAttached = false;
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    SRD_API,
    SRD_LISTS,
    srdFilter,
    srdSpellToOption,
    srdWeaponToOption,
    srdItemToLoot,
    parseSrdItemEffects,
    LIBRARY_KINDS,
    LIBRARY_OPTION_FIELDS,
    libraryEntryFromOption,
    libraryEntryFromLoot,
    findLibraryMatch,
    librarySearchList,
    libraryWeaponToLoot,
    CampaignLibrary,
    srdList,
    srdGet,
    attachSrdSearch,
  };
}
