// Combines src/helper.js, src/ui.js and src/helper.css into one script and builds
// the Tampermonkey userscript, the bookmarklet and the install page from it (dist/).
// Usage: node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const write = (p, s) => writeFileSync(join(root, p), s);

const css = read('src/helper.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{2,}/g, '\n').trim();
const parts = read('src/helper.js') + '\n' + read('src/ui.js');
if (!parts.includes("'@CSS@'")) throw new Error('CSS placeholder missing in src/helper.js');
const core = `(() => {\n  'use strict';\n${parts}})();\n`.replace("'@CSS@'", () => JSON.stringify(css));
const version = core.match(/const VERSION = '([^']+)'/)[1];

const userscript = `// ==UserScript==
// @name         PortalPlus Helper
// @namespace    portalplus-helfer
// @version      ${version}
// @description  “Today” buttons for date fields and automatic copying between linked fields
// @match        https://portal.portalplus.bayern/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

${core}`;

// The bookmarklet gets by with fewer characters: drop whole comment lines and indentation.
// Line breaks stay (as %0A) so JavaScript’s automatic semicolon rules don’t change.
const compact = core.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('//')).join('\n');
const bookmarklet = 'javascript:' + encodeURIComponent(compact);

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const page = read('src/install.html')
  .replaceAll('{{VERSION}}', () => version)
  .replaceAll('{{BOOKMARKLET}}', () => esc(bookmarklet))
  .replace('{{USERSCRIPT}}', () => esc(userscript));

mkdirSync(join(root, 'dist'), { recursive: true });
write('dist/portalplus-helper.user.js', userscript);
write('dist/bookmarklet.txt', bookmarklet);
write('dist/index.html', page);
console.log(`v${version}: userscript ${userscript.length} chars, bookmarklet ${bookmarklet.length} chars`);
