/*
 * Ironed Out "Invite your group" button, v1.
 *
 * Put the URL from POST /api/v1/widget-tokens in a plain link and load this script:
 *
 *   <a href="https://…/w/TOKEN" data-ironed-out>Invite your group</a>
 *   <script src="https://…/widget/v1.js" async></script>
 *
 * Without the script the link still works. With it, the link becomes a styled button inside a
 * shadow root (so neither page's CSS leaks into the other) and opens in a new tab. Only links that
 * point at this script's own /w/ pages are touched. Links added or re-rendered later (single-page
 * apps, React hydration) are picked up automatically; window.IronedOut.mount() forces a pass.
 * Works under a strict CSP: allow this origin in script-src; no inline styles or innerHTML are
 * used. No cookies, no tracking, no network requests.
 */
(function () {
  'use strict';
  var script = document.currentScript;
  var origin = script && script.src ? new URL(script.src).origin : null;
  if (!origin) return;

  var CSS =
    ':host{display:inline-block;vertical-align:middle}' +
    'a{box-sizing:border-box;display:inline-flex;align-items:center;gap:10px;min-height:48px;' +
    'padding:10px 20px;background:#3F7A3A;color:#FFFFFF;border:2px solid #2B2A26;' +
    'border-radius:14px 5px 13px 6px/6px 13px 5px 14px;box-shadow:3px 3px 0 #2B2A26;' +
    'font:600 17px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;text-decoration:none;' +
    'cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    'a:hover{background:#2F5E2C}' +
    'a:active{transform:translate(2px,2px);box-shadow:1px 1px 0 #2B2A26}' +
    'a:focus-visible{outline:3px solid #F2C14E;outline-offset:3px}' +
    'svg{flex:none}' +
    'small{display:block;font-weight:400;font-size:13px;opacity:.9}' +
    '@media (prefers-reduced-motion:reduce){a:active{transform:none}}';

  // Flag on a green, drawn like the app's illustrations. Built with DOM calls rather than
  // innerHTML so pages that enforce Trusted Types still work.
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var ICON_PATHS = [
    {
      d: 'M3 21c3-3 15-3 18 0',
      fill: '#A8CC94',
      stroke: '#2B2A26',
      'stroke-width': '2',
      'stroke-linecap': 'round',
    },
    { d: 'M12 19V3', fill: 'none', stroke: '#FFFFFF', 'stroke-width': '2', 'stroke-linecap': 'round' },
    {
      d: 'M12 3l7 3-7 3z',
      fill: '#C0392B',
      stroke: '#2B2A26',
      'stroke-width': '1.5',
      'stroke-linejoin': 'round',
    },
  ];

  function icon() {
    var svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '22');
    svg.setAttribute('height', '22');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (var i = 0; i < ICON_PATHS.length; i++) {
      var path = document.createElementNS(SVG_NS, 'path');
      for (var k in ICON_PATHS[i]) path.setAttribute(k, ICON_PATHS[i][k]);
      svg.appendChild(path);
    }
    return svg;
  }

  // A constructed stylesheet isn't subject to the host page's style-src CSP; <style> is the fallback.
  var sheet = null;
  function addStyles(root) {
    try {
      if ('adoptedStyleSheets' in root && 'replaceSync' in CSSStyleSheet.prototype) {
        if (!sheet) {
          sheet = new CSSStyleSheet();
          sheet.replaceSync(CSS);
        }
        root.adoptedStyleSheets = [sheet];
        return;
      }
    } catch {
      // fall through
    }
    var style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
  }

  function isOurs(href) {
    try {
      var u = new URL(href, document.baseURI);
      return u.origin === origin && /^\/w\/[\w.-]+$/.test(u.pathname);
    } catch {
      return false;
    }
  }

  // link → its button. Frameworks (React hydration, SPA re-renders) may drop our button or swap
  // the link for a new node; mount() re-attaches or rebuilds, and removes buttons whose link is gone.
  var hosts = typeof WeakMap === 'function' ? new WeakMap() : null;
  var built = [];

  function upgrade(link) {
    if (!hosts || !link.parentNode || !isOurs(link.href)) return;
    var existing = hosts.get(link);
    if (existing) {
      if (existing.nextSibling !== link) link.parentNode.insertBefore(existing, link);
      link.hidden = true;
      return;
    }
    var host = document.createElement('span');
    if (!host.attachShadow) return;
    host.className = 'ironed-out-button';
    var root = host.attachShadow({ mode: 'open' });
    addStyles(root);
    var a = document.createElement('a');
    a.href = link.href;
    a.target = '_blank';
    a.rel = 'noopener';
    a.appendChild(icon());
    var text = (link.textContent || '').trim() || 'Invite your group';
    var label = document.createElement('span');
    label.textContent = text;
    var sub = link.getAttribute('data-ironed-out-subtitle');
    if (sub) {
      var small = document.createElement('small');
      small.textContent = sub;
      label.appendChild(small);
    }
    a.appendChild(label);
    a.setAttribute('aria-label', text + (sub ? ', ' + sub : '') + ' (opens in a new tab)');
    root.appendChild(a);
    link.setAttribute('data-ironed-out-ready', '1');
    link.hidden = true;
    link.parentNode.insertBefore(host, link);
    hosts.set(link, host);
    built.push({ host: host, link: link });
  }

  function mount(scope) {
    var links = (scope || document).querySelectorAll('a[data-ironed-out]');
    for (var i = 0; i < links.length; i++) upgrade(links[i]);
    built = built.filter(function (b) {
      if (b.link.isConnected) return true;
      if (b.host.parentNode) b.host.parentNode.removeChild(b.host);
      return false;
    });
  }

  var queued = false;
  function mountSoon() {
    if (queued) return;
    queued = true;
    setTimeout(function () {
      queued = false;
      mount();
    }, 50);
  }

  window.IronedOut = { mount: mount, version: 1 };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      mount();
    });
  } else {
    mount();
  }
  // Pick up buttons added (or re-rendered) later. Our own insertions settle on the next pass.
  if (typeof MutationObserver === 'function') {
    new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        if (records[i].addedNodes.length || records[i].removedNodes.length) return mountSoon();
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
})();
