#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════
   NEXUS — cache-busting stamps for js/ and css/ links
   ──────────────────────────────────────────────────────────────
   GitHub Pages lets browsers reuse a file for 10 minutes, so after a
   deploy a browser can mix a new nexus-cite.js with an old
   nexus-utils.js. Every local <script src="js/…"> and
   <link href="css/…"> carries ?v=<hash of that file>, so a changed
   file gets a new URL and is fetched fresh.

   Run after editing anything in js/ or css/ (CI fails otherwise):
     node tools/stamp-assets.js
   ══════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const ASSET_REF = /(\s(?:src|href)=")((?:js|css)\/[^"?#]+)(?:\?v=[^"]*)?(")/g;

/** First 8 hex of the file's sha256, line endings normalised (CRLF checkouts hash the same). */
function assetVersion(rel) {
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 8);
}

/** Returns html with every js/ and css/ reference stamped with its current version. */
function stampHtml(html, versionOf = assetVersion) {
  return html.replace(ASSET_REF, (_, pre, rel, post) => `${pre}${rel}?v=${versionOf(rel)}${post}`);
}

function htmlPages() {
  return fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
}

if (require.main === module) {
  let changed = 0;
  for (const page of htmlPages()) {
    const file = path.join(ROOT, page);
    const before = fs.readFileSync(file, 'utf8');
    const after = stampHtml(before);
    if (after !== before) { fs.writeFileSync(file, after); changed++; console.log('stamped', page); }
  }
  console.log(changed ? `${changed} page(s) updated.` : 'All pages already up to date.');
}

module.exports = { ASSET_REF, assetVersion, stampHtml, htmlPages };
