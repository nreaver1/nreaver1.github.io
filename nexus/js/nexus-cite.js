/* ══════════════════════════════════════════════════════════════
   NEXUS — ^npc-slug citations, on every page
   ──────────────────────────────────────────────────────────────
   Any <textarea>/<input> with a data-cite attribute gets the ^
   autocomplete (attached on first focus, so modals built later
   work too). Render saved text with renderWithCitations(text).

   Pages: add loadCiteNpcs() to boot()'s Promise.all so chips
   resolve on first render. The session log feeds its own list
   in with setCiteNpcs(npcs) whenever it changes.

   Load order: after nexus-utils.js (uses esc, renderCitations,
   citeTokenAt, citeMatches) and nexus-config.js (db).
   ══════════════════════════════════════════════════════════════ */

let _citeNpcs   = [];          // NPC rows the autocomplete searches
let _citeNpcMap = new Map();   // slug → npc, for rendering chips

function setCiteNpcs(list) {
  _citeNpcs   = list || [];
  _citeNpcMap = new Map(_citeNpcs.map(n => [n.slug, n]));
}

/** Loads the NPC index for chips/autocomplete. Never rejects: a missing table just means no NPCs. */
async function loadCiteNpcs() {
  try {
    setCiteNpcs(await db.select('npcs', { order: 'name.asc' }));
  } catch (e) {
    console.warn('Citations: could not load NPCs', e);
    setCiteNpcs([]);
  }
  return _citeNpcs;
}

/** Escaped HTML with ^slug tokens turned into NPC chips. */
function renderWithCitations(text) {
  return renderCitations(text, _citeNpcMap);
}

// ══════════════════════════════════════════════════════════════
//  CITATION AUTOCOMPLETE
//  When the user types '^' followed by letters, a floating
//  dropdown of matching NPCs appears. Selecting an item replaces
//  the partial token with the full ^slug token.
//
//  initCitationAutocomplete(inputEl) attaches it by hand; any
//  element with data-cite gets it automatically on focus.
//  Works for both <textarea> and <input type="text">.
//  One shared singleton dropdown element is reused.
// ══════════════════════════════════════════════════════════════
let _citeDropEl  = null;   // singleton dropdown DOM element
let _citeAnchor  = null;   // element the drop is currently attached to
let _citeFocusIdx = -1;    // keyboard-nav index into current results

function _ensureCiteDrop() {
  if (_citeDropEl) return;
  _citeDropEl = document.createElement('div');
  _citeDropEl.className = 'cite-drop';
  _citeDropEl.style.display = 'none';
  document.body.appendChild(_citeDropEl);

  // Hide on outside click
  document.addEventListener('click', e => {
    if (_citeDropEl &&
        _citeAnchor && !_citeAnchor.contains(e.target) &&
        !_citeDropEl.contains(e.target)) {
      _hideCiteDrop();
    }
  }, true);
}

function _hideCiteDrop() {
  if (_citeDropEl) _citeDropEl.style.display = 'none';
  _citeAnchor   = null;
  _citeFocusIdx = -1;
}

function _getCiteToken(el) {
  // Returns { prefix, token, after } for the partial ^xxx at the cursor,
  // or null if the cursor is not inside a citation token.
  const val = el.value;
  const hit = citeTokenAt(val, el.selectionStart);
  if (!hit) return null;
  return { prefix: val.slice(0, hit.start), token: hit.token, after: val.slice(el.selectionStart), caretStart: hit.start };
}

function _positionDrop(el) {
  // Use fixed positioning with raw viewport coordinates so the dropdown
  // escapes any overflow:hidden/auto ancestor (including modals).
  const rect = el.getBoundingClientRect();
  const dropH = 220; // max-height of the dropdown
  const spaceBelow = window.innerHeight - rect.bottom;
  // Flip above the input if there's not enough room below
  if (spaceBelow < dropH && rect.top > dropH) {
    _citeDropEl.style.top    = 'auto';
    _citeDropEl.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
  } else {
    _citeDropEl.style.bottom = 'auto';
    _citeDropEl.style.top    = (rect.bottom + 4) + 'px';
  }
  _citeDropEl.style.left     = rect.left + 'px';
  _citeDropEl.style.position = 'fixed';
}

function _renderCiteDrop(matches, el, token) {
  if (!matches.length) { _hideCiteDrop(); return; }
  _citeFocusIdx = -1;
  _citeDropEl.innerHTML = matches.map((npc, i) => `
    <div class="cite-drop-item" data-i="${i}" data-slug="${esc(npc.slug)}">
      <span class="cite-drop-name">${esc(npc.name)}</span>
      <span class="cite-drop-slug">^${esc(npc.slug)}</span>
    </div>`).join('');

  _citeDropEl.querySelectorAll('.cite-drop-item').forEach(item => {
    item.addEventListener('mousedown', e => {
      e.preventDefault(); // prevent blur before insert
      _insertCitation(el, item.dataset.slug);
    });
  });

  _positionDrop(el);
  _citeDropEl.style.display = 'block';
  _citeAnchor = el;
}

function _insertCitation(el, slug) {
  const ctx = _getCiteToken(el);
  if (!ctx) { _hideCiteDrop(); return; }
  const newVal = ctx.prefix + '^' + slug + ' ' + ctx.after;
  el.value = newVal;
  // Place cursor after the inserted token + space
  const newPos = ctx.prefix.length + slug.length + 2; // +2 for ^ and space
  el.setSelectionRange(newPos, newPos);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  _hideCiteDrop();
  el.focus();
}

function initCitationAutocomplete(el) {
  if (!el || el._citeInit) return;
  el._citeInit = true;
  _ensureCiteDrop();

  el.addEventListener('input', () => {
    const ctx = _getCiteToken(el);
    if (!ctx) { _hideCiteDrop(); return; }
    _renderCiteDrop(citeMatches(_citeNpcs, ctx.token), el, ctx.token);
  });

  el.addEventListener('keydown', e => {
    if (!_citeDropEl || _citeDropEl.style.display === 'none') return;
    const items = _citeDropEl.querySelectorAll('.cite-drop-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _citeFocusIdx = Math.min(_citeFocusIdx + 1, items.length - 1);
      items.forEach((it, i) => it.classList.toggle('cite-focused', i === _citeFocusIdx));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _citeFocusIdx = Math.max(_citeFocusIdx - 1, 0);
      items.forEach((it, i) => it.classList.toggle('cite-focused', i === _citeFocusIdx));
    } else if (e.key === 'Enter' && _citeFocusIdx >= 0) {
      e.preventDefault();
      e.stopPropagation(); // don't submit the surrounding form/modal
      const slug = items[_citeFocusIdx].dataset.slug;
      _insertCitation(el, slug);
    } else if (e.key === 'Escape') {
      e.stopPropagation(); // close the dropdown, not the modal
      _hideCiteDrop();
    }
  });

  el.addEventListener('blur', () => {
    // Defer hide so mousedown on item fires first
    setTimeout(() => {
      if (_citeAnchor === el) _hideCiteDrop();
    }, 150);
  });
}

// Any data-cite field gets the autocomplete the first time it's focused.
// focusin fires before the first keystroke, so nothing is missed.
document.addEventListener('focusin', e => {
  const el = e.target;
  if (el && el.matches && el.matches('textarea[data-cite], input[data-cite]')) initCitationAutocomplete(el);
});

// Chips are links to session-log.html?npc=slug. On the session log itself,
// jump in place instead of reloading. Capture phase, so a chip inside a
// clickable row/card doesn't also trigger the row's own onclick.
document.addEventListener('click', e => {
  const chip = e.target.closest && e.target.closest('a.npc-chip[data-npc-slug]');
  if (!chip) return;
  e.stopPropagation();
  if (typeof jumpToNpc !== 'function') return; // follow the link
  const npc = _citeNpcMap.get(chip.dataset.npcSlug);
  if (!npc) return;
  e.preventDefault();
  jumpToNpc(npc.id);
}, true);
