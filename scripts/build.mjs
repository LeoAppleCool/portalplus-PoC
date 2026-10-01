// Setzt src/helfer.js, src/oberflaeche.js und src/helfer.css zu einem Skript zusammen und baut daraus
// das Tampermonkey-Userscript, das Lesezeichen und die Installationsseite (dist/).
// Aufruf: node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const write = (p, s) => writeFileSync(join(root, p), s);

const css = read('src/helfer.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{2,}/g, '\n').trim();
const parts = read('src/helfer.js') + '\n' + read('src/oberflaeche.js');
if (!parts.includes("'@CSS@'")) throw new Error('Platzhalter für CSS fehlt in src/helfer.js');
const core = `(() => {\n  'use strict';\n${parts}})();\n`.replace("'@CSS@'", () => JSON.stringify(css));
const version = core.match(/const VERSION = '([^']+)'/)[1];

const userscript = `// ==UserScript==
// @name         PortalPlus-Helfer
// @namespace    portalplus-helfer
// @version      ${version}
// @description  „Heute“-Buttons an Datumsfeldern und automatisches Übernehmen von Feldinhalten
// @match        https://portal.portalplus.bayern/*
// @grant        none
// @run-at       document-idle
// @noframes
// ==/UserScript==

${core}`;

// Fürs Lesezeichen reichen weniger Zeichen: ganze Kommentarzeilen und Einrückung weg.
// Zeilenumbrüche bleiben erhalten (als %0A), damit die Semikolon-Regeln von JavaScript gleich bleiben.
const compact = core.split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('//')).join('\n');
const bookmarklet = 'javascript:' + encodeURIComponent(compact);

const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const page = read('src/installieren.html')
  .replaceAll('{{VERSION}}', () => version)
  .replaceAll('{{BOOKMARKLET}}', () => esc(bookmarklet))
  .replace('{{USERSCRIPT}}', () => esc(userscript));

mkdirSync(join(root, 'dist'), { recursive: true });
write('dist/portalplus-helfer.user.js', userscript);
write('dist/lesezeichen.txt', bookmarklet);
write('dist/index.html', page);
console.log(`v${version}: Userscript ${userscript.length} Zeichen, Lesezeichen ${bookmarklet.length} Zeichen`);
