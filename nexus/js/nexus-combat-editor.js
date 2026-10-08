// ══════════════════════════════════════════════════════════════
//  js/nexus-combat-editor.js  —  shared add/edit modal for
//  combat_options (attacks, spells, features).
//
//  Used by combat.html (any kind) and party-roster.html (Spells tab).
//  One editor means a spell added on the roster and a spell added on
//  the Combat sheet are the same record, and a weapon added here can
//  also be created in the Loot Tracker and linked.
//
//  Load after nexus-config.js, nexus-utils.js and nexus-srd.js.
//
//  CombatEditor.open({ member, items, option, kind, onSaved })
//    member  — party_members row the option belongs to
//    items   — loot items in computeNetEffects shape ({id,name,type,holder,statEffects})
//    option  — existing combat_options row to edit, or null to add
//    kind    — preset kind for a new option ('spell' from the roster)
//    onSaved({ option, isNew, lootItem }) — lootItem is set when a Loot
//              Tracker item was created for a new weapon
//  CombatEditor.remove(option, onDeleted)
// ══════════════════════════════════════════════════════════════

const CombatEditor = (() => {
  let ctx = null;       // { member, items, option, onSaved }
  let srdLootType = null; // Loot Tracker type guessed from an SRD weapon pick
  const $ = id => document.getElementById(id);

  const ABILITY_OPTS = '<option value="str">STR</option><option value="dex">DEX</option><option value="con">CON</option>' +
    '<option value="int">INT</option><option value="wis">WIS</option><option value="cha">CHA</option>';

  const MARKUP = `
<div class="modal-backdrop" id="ceModal">
  <div class="modal">
    <div class="modal-header">
      <span class="modal-title" id="ceTitle">⚔ ADD OPTION</span>
      <button class="btn-icon" data-ce="close" aria-label="Close">✕</button>
    </div>
    <div class="modal-body">
      <div class="field-row">
        <div class="field"><label for="ce-name">Name<span class="field-required">*</span></label>
          <input type="text" id="ce-name" maxlength="80" placeholder="Start typing to search the SRD…" /></div>
        <div class="field ce-kind-field"><label for="ce-kind">Kind</label>
          <select id="ce-kind">
            <option value="weapon">Weapon</option>
            <option value="spell">Spell</option>
            <option value="feature">Feature</option>
          </select>
        </div>
      </div>
      <div class="field" id="ce-item-wrap">
        <label for="ce-item">Linked weapon <span class="optional">(loot)</span></label>
        <select id="ce-item"></select>
      </div>
      <label class="cb-check" id="ce-addloot-wrap"><input type="checkbox" id="ce-addloot" /> Also add to the Loot Tracker (held by this character)</label>

      <div id="ce-spell-box">
        <div class="field-row">
          <div class="field"><label for="ce-level">Spell level</label>
            <select id="ce-level">
              <option value="">Not a spell</option>
              <option value="0">Cantrip</option>
              <option value="1">1st</option><option value="2">2nd</option><option value="3">3rd</option>
              <option value="4">4th</option><option value="5">5th</option><option value="6">6th</option>
              <option value="7">7th</option><option value="8">8th</option><option value="9">9th</option>
            </select>
          </div>
          <div class="field"><label for="ce-school">School</label><input type="text" id="ce-school" placeholder="Evocation" /></div>
          <div class="field"><label for="ce-cast">Casting time</label><input type="text" id="ce-cast" placeholder="1 action" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label for="ce-components">Components</label><input type="text" id="ce-components" placeholder="V, S, M" /></div>
          <div class="field"><label for="ce-duration">Duration</label><input type="text" id="ce-duration" placeholder="Instantaneous" /></div>
        </div>
        <div class="field" id="ce-material-wrap"><label for="ce-material">Material <span class="optional">(M component)</span></label><input type="text" id="ce-material" /></div>
        <div class="cb-checks">
          <label class="cb-check"><input type="checkbox" id="ce-prepared" /> Prepared</label>
          <label class="cb-check"><input type="checkbox" id="ce-conc" /> Concentration</label>
          <label class="cb-check"><input type="checkbox" id="ce-ritual" /> Ritual</label>
        </div>
      </div>

      <div class="modal-section">In combat</div>
      <div class="field-row">
        <div class="field"><label for="ce-action">Uses</label>
          <select id="ce-action">
            <option value="action">Action</option>
            <option value="bonus">Bonus Action</option>
            <option value="reaction">Reaction</option>
          </select>
        </div>
        <div class="field"><label for="ce-resolve">Resolves by</label>
          <select id="ce-resolve">
            <option value="attack">Attack roll</option>
            <option value="save">Saving throw</option>
            <option value="auto">Auto-hit</option>
            <option value="none">No roll (utility)</option>
          </select>
        </div>
        <div class="field"><label for="ce-ability">Ability</label>
          <select id="ce-ability">${ABILITY_OPTS}<option value="spell">Spellcasting</option></select>
        </div>
      </div>
      <div class="field-row" id="ce-save-row">
        <div class="field"><label for="ce-save">Target saves with</label>
          <select id="ce-save"><option value="">—</option>${ABILITY_OPTS}</select>
        </div>
        <label class="cb-check"><input type="checkbox" id="ce-half" /> Half damage on a save</label>
      </div>
      <div class="field-row">
        <div class="field"><label for="ce-dice">Damage dice</label><input type="text" id="ce-dice" placeholder="1d8, 8d6, 3d4+3" /></div>
        <div class="field"><label for="ce-extra">Extra damage <span class="optional">(rider)</span></label><input type="text" id="ce-extra" placeholder="1d8" /></div>
        <div class="field"><label for="ce-dtype">Damage type</label><select id="ce-dtype"></select></div>
      </div>
      <div class="field"><label for="ce-range">Range <span class="optional">(optional)</span></label><input type="text" id="ce-range" placeholder="5 ft, 120 ft, 20 ft radius" /></div>
      <div class="cb-checks">
        <label class="cb-check" id="ce-addmod-wrap"><input type="checkbox" id="ce-addmod" /> Add ability mod to damage</label>
        <label class="cb-check" id="ce-scales-wrap"><input type="checkbox" id="ce-scales" /> Cantrip dice scale at 5 / 11 / 17</label>
        <label class="cb-check"><input type="checkbox" id="ce-aoe" /> Area of effect</label>
      </div>
      <div class="field"><label for="ce-notes">Notes <span class="optional">(optional)</span></label><textarea id="ce-notes" rows="2"></textarea></div>
      <div class="field" id="ce-desc-wrap"><label for="ce-desc">Spell description <span class="optional">(optional)</span></label><textarea id="ce-desc" rows="4"></textarea></div>
      <div class="cb-preview" id="cePreview"></div>
      <div class="cb-form-error" id="ceError" role="alert"></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-ghost" data-ce="close">Cancel</button>
      <button class="btn btn-primary" id="ceSave" data-ce="save">Save</button>
    </div>
  </div>
</div>`;

  // ── small formatting helpers for the preview line ──
  const fmt1 = x => (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, '');
  const target = () => (typeof COMBAT_TARGET !== 'undefined' && COMBAT_TARGET) || normalizeCombatTarget({});

  function ensureMarkup() {
    if ($('ceModal')) return;
    document.body.insertAdjacentHTML('beforeend', MARKUP);
    $('ce-dtype').innerHTML = '<option value="">—</option>' +
      DAMAGE_TYPES.map(d => `<option value="${d}">${d[0].toUpperCase() + d.slice(1)}</option>`).join('');

    $('ceModal').addEventListener('click', e => {
      if (e.target.id === 'ceModal') close();
      const btn = e.target.closest('[data-ce]');
      if (btn?.dataset.ce === 'close') close();
      if (btn?.dataset.ce === 'save') save();
    });
    $('ce-kind').addEventListener('change', e => {
      if (!ctx?.option) applyKindDefaults(e.target.value);
      sync();
    });
    $('ce-item').addEventListener('change', () => { applyLinkedItem(); sync(); });
    for (const id of ['ce-resolve', 'ce-ability', 'ce-level', 'ce-components']) $(id).addEventListener('change', sync);
    $('ceModal').addEventListener('input', updatePreview);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && $('ceModal').classList.contains('open')) close();
    });

    attachSrdSearch($('ce-name'), {
      kind: () => ({ spell: 'spells', weapon: 'weapons' })[$('ce-kind').value] || null,
      onPick: applySrd,
    });
  }

  // ── form <-> row ──
  function write(o) {
    $('ce-name').value       = o.name || '';
    $('ce-kind').value       = o.kind || 'weapon';
    $('ce-action').value     = o.action || 'action';
    $('ce-resolve').value    = o.resolve || 'attack';
    $('ce-ability').value    = o.ability || 'str';
    $('ce-save').value       = o.save_ability || '';
    $('ce-half').checked     = !!o.half_on_save;
    $('ce-dice').value       = o.dice || '';
    $('ce-extra').value      = o.extra_dice || '';
    $('ce-dtype').value      = o.damage_type || '';
    $('ce-level').value      = o.spell_level == null ? '' : String(o.spell_level);
    $('ce-range').value      = o.range || '';
    $('ce-addmod').checked   = o.add_mod !== false;
    $('ce-scales').checked   = !!o.scales;
    $('ce-aoe').checked      = !!o.aoe;
    $('ce-notes').value      = o.notes || '';
    $('ce-school').value     = o.school || '';
    $('ce-cast').value       = o.casting_time || '';
    $('ce-components').value = o.components || '';
    $('ce-material').value   = o.material || '';
    $('ce-duration').value   = o.duration || '';
    $('ce-prepared').checked = o.prepared !== false;
    $('ce-conc').checked     = !!o.concentration;
    $('ce-ritual').checked   = !!o.ritual;
    $('ce-desc').value       = o.description || '';
  }

  // Form → combat_options row (without id / member_id / sort_order)
  function read() {
    const kind    = $('ce-kind').value;
    const resolve = $('ce-resolve').value;
    const ability = $('ce-ability').value;
    const level   = $('ce-level').value;
    const text    = id => $(id).value.trim() || null;
    const isSpell = kind === 'spell';
    return {
      name:          $('ce-name').value.trim(),
      kind,
      action:        $('ce-action').value,
      resolve,
      ability,
      save_ability:  resolve === 'save' ? ($('ce-save').value || null) : null,
      dice:          text('ce-dice'),
      extra_dice:    text('ce-extra'),
      damage_type:   $('ce-dtype').value || null,
      add_mod:       ability !== 'spell' && $('ce-addmod').checked,
      spell_level:   level === '' ? null : parseInt(level, 10),
      scales:        level === '0' && $('ce-scales').checked,
      half_on_save:  resolve === 'save' && $('ce-half').checked,
      aoe:           $('ce-aoe').checked,
      range:         text('ce-range'),
      notes:         text('ce-notes'),
      loot_item_id:  $('ce-item').value || null,
      school:        isSpell ? text('ce-school') : null,
      components:    isSpell ? text('ce-components') : null,
      material:      isSpell && /\bM\b/.test($('ce-components').value) ? text('ce-material') : null,
      casting_time:  isSpell ? text('ce-cast') : null,
      duration:      isSpell ? text('ce-duration') : null,
      concentration: isSpell && $('ce-conc').checked,
      ritual:        isSpell && $('ce-ritual').checked,
      description:   isSpell ? text('ce-desc') : null,
      prepared:      !isSpell || $('ce-prepared').checked,
      srd_index:     $('ce-name').dataset.srdIndex || ctx?.option?.srd_index || null,
    };
  }

  // Show only the fields that matter for the current choices
  function sync() {
    const kind = $('ce-kind').value;
    const isSpell = kind === 'spell';
    const isNewWeapon = kind === 'weapon' && !ctx?.option;
    $('ce-spell-box').style.display     = isSpell ? '' : 'none';
    $('ce-desc-wrap').style.display     = isSpell ? '' : 'none';
    $('ce-material-wrap').style.display = /\bM\b/.test($('ce-components').value) ? '' : 'none';
    $('ce-save-row').style.display      = $('ce-resolve').value === 'save' ? '' : 'none';
    $('ce-addmod-wrap').style.display   = $('ce-ability').value === 'spell' ? 'none' : '';
    $('ce-scales-wrap').style.display   = $('ce-level').value === '0' ? '' : 'none';
    $('ce-addloot-wrap').style.display  = isNewWeapon && !$('ce-item').value ? '' : 'none';
    $('ce-name').placeholder = isSpell || kind === 'weapon' ? 'Start typing to search the SRD…' : 'Breath Weapon, Sneak Attack…';
    updatePreview();
  }

  function applyKindDefaults(kind) {
    if (kind === 'weapon') {
      $('ce-ability').value = 'str'; $('ce-resolve').value = 'attack';
      $('ce-level').value = ''; $('ce-addmod').checked = true;
    } else if (kind === 'spell') {
      $('ce-ability').value = 'spell'; $('ce-addmod').checked = false;
      if ($('ce-level').value === '') { $('ce-level').value = '0'; $('ce-scales').checked = true; }
    } else {
      $('ce-level').value = '';
    }
  }

  // Weapons this member can link: their own plus the party's
  function linkableWeapons() {
    const name = (ctx.member?.name || '').toLowerCase().trim();
    return (ctx.items || []).filter(it => {
      const h = (it.holder || '').toLowerCase().trim();
      return isWeaponItem(it) && (h === name || h === 'party');
    });
  }

  function fillItemSelect(currentId) {
    const list = linkableWeapons();
    // Keep a link to a weapon that has since changed hands, so editing doesn't silently drop it
    const current = currentId && !list.some(it => it.id === currentId) ? (ctx.items || []).find(it => it.id === currentId) : null;
    const opts = [...list, ...(current ? [current] : [])];
    $('ce-item').innerHTML = '<option value="">— none —</option>' +
      opts.map(it => `<option value="${esc(it.id)}">${esc(it.name)}${it === current ? ' (not held)' : ''}</option>`).join('');
    $('ce-item').value = currentId || '';
    $('ce-item-wrap').style.display = opts.length ? '' : 'none';
  }

  // Picking a weapon from loot fills in what we can guess from it
  function applyLinkedItem() {
    const it = (ctx.items || []).find(i => i.id === $('ce-item').value);
    if (!it) return;
    if (!$('ce-name').value.trim()) $('ce-name').value = it.name;
    $('ce-kind').value     = 'weapon';
    $('ce-resolve').value  = 'attack';
    $('ce-level').value    = '';
    $('ce-ability').value  = /ranged/i.test(it.type || '') ? 'dex' : 'str';
    $('ce-addmod').checked = true;
  }

  // An SRD pick overwrites the form with the SRD values (all still editable)
  function applySrd(detail) {
    const kind = $('ce-kind').value;
    const mapped = kind === 'spell' ? srdSpellToOption(detail) : srdWeaponToOption(detail, ctx.member);
    srdLootType = mapped.lootType || null;
    write({ ...read(), ...mapped, loot_item_id: $('ce-item').value || null, prepared: $('ce-prepared').checked });
    $('ce-name').dataset.srdIndex = mapped.srd_index || '';
    if (kind === 'weapon' && !ctx.option && !$('ce-item').value) $('ce-addloot').checked = true;
    sync();
  }

  function updatePreview() {
    const el = $('cePreview');
    if (!ctx?.member) { el.innerHTML = ''; return; }
    const draft = { id: ctx.option?.id || '_draft', ...read() };
    if (draft.dice && !parseDice(draft.dice)) { el.innerHTML = ''; return; }
    const c = combatContext(ctx.member, ctx.items || [], draft, target());
    const b = combatBreakdown(draft, c);
    const exp = expectedDamage(draft, c, b);
    const how = b.toHit ? (b.toHit.missing ? '<em>set Spell Atk on the roster</em>' : modStr(b.toHit.total) + ' to hit')
      : b.dc ? (b.dc.missing ? '<em>set Spell DC on the roster</em>' : `DC ${b.dc.total}`)
      : draft.resolve === 'auto' ? 'auto-hit' : 'utility';
    const dmg = b.damage ? ` · ${esc(b.damage.diceText)}${draft.damage_type ? ' ' + esc(draft.damage_type) : ''} · ${fmt1(b.damage.perHit)} avg` : '';
    const unprepared = !isPrepared(draft) ? ' · <em>not prepared, not ranked</em>' : '';
    el.innerHTML = `<span class="cb-preview-k">Preview</span> ${how}${dmg}` +
      (exp > 0 && isPrepared(draft) ? ` · <strong>~${fmt1(exp)}</strong> vs AC ${target().ac}` : '') + unprepared;
  }

  function open({ member, items, option = null, kind = null, onSaved = null }) {
    if (!member) return;
    ensureMarkup();
    ctx = { member, items: items || [], option, onSaved };
    srdLootType = null;
    $('ce-name').dataset.srdIndex = '';
    const noun = option ? (option.kind === 'spell' ? 'SPELL' : 'OPTION') : (kind === 'spell' ? 'SPELL' : 'OPTION');
    $('ceTitle').textContent = `${option ? '✎ EDIT' : '⚔ ADD'} ${noun} — ${String(member.name || '').toUpperCase()}`;
    fillItemSelect(option?.loot_item_id || null);
    const blank = kind === 'spell'
      ? { kind: 'spell', action: 'action', resolve: 'none', ability: 'spell', add_mod: false, spell_level: 0, scales: true, prepared: true }
      : { kind: 'weapon', action: 'action', resolve: 'attack', ability: 'str', add_mod: true };
    write(option || blank);
    $('ce-addloot').checked = false;
    $('ceError').textContent = '';
    sync();
    $('ceModal').classList.add('open');
    $('ce-name').focus();
  }

  function close() {
    $('ceModal')?.classList.remove('open');
    ctx = null;
  }

  // Loot Tracker row for a weapon added from the editor
  function lootRowFor(row) {
    const lootType = srdLootType || (/\d+\/\d+/.test(row.range || '') ? 'Ranged Weapon' : 'Melee Weapon');
    return {
      id: uid(), name: row.name, type: lootType, rarity: 'common',
      holder: ctx.member.name, attunement: 'none',
      description: row.notes || null, stat_effects: [], quantity: 1,
    };
  }

  async function save() {
    if (!(await nexusGate())) return;
    if (!ctx) return;
    const row = read();
    const err = validateCombatOption(row);
    $('ceError').textContent = err || '';
    if (err) return;

    const btn = $('ceSave');
    setLoading(btn, true);
    try {
      let lootItem = null;
      const isNew = !ctx.option;
      if (isNew && row.kind === 'weapon' && !row.loot_item_id && $('ce-addloot').checked) {
        const loot = lootRowFor(row);
        await db.insert('loot_items', loot);
        row.loot_item_id = loot.id;
        lootItem = { id: loot.id, name: loot.name, type: loot.type, rarity: loot.rarity, holder: loot.holder, statEffects: [] };
      }
      let saved;
      if (isNew) {
        saved = { id: uid(), member_id: ctx.member.id, sort_order: Date.now() % 1e9, ...row };
        await db.insert('combat_options', saved);
      } else {
        await db.update('combat_options', ctx.option.id, row);
        saved = { ...ctx.option, ...row };
      }
      const done = ctx.onSaved;
      showToast(`${row.name} ${isNew ? 'added' : 'updated'}${lootItem ? ' (and added to the Loot Tracker)' : ''}`);
      close();
      done && done({ option: saved, isNew, lootItem });
    } catch (e) {
      console.error(e);
      $('ceError').textContent = 'Save failed — run sql/supabase_combat.sql in Supabase if you have not since this update.';
    } finally {
      setLoading(btn, false);
    }
  }

  async function remove(option, onDeleted) {
    if (!(await nexusGate())) return;
    if (!option) return;
    const ok = await nexusConfirm({
      title:        option.kind === 'spell' ? 'Remove Spell' : 'Remove Combat Option',
      name:         option.name,
      message:      'This removes it from the character’s spells and combat sheet. Linked loot items are not affected.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    try {
      await db.delete('combat_options', option.id);
      showToast(`${option.name} removed`);
      onDeleted && onDeleted(option);
    } catch (e) {
      console.error(e);
      showToast('Delete failed — check Supabase config.');
    }
  }

  return { open, close, remove };
})();
