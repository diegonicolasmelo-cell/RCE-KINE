/**
 * convenciones.js — Guardias estáticas del proyecto (sin navegador):
 *  1. Cero confirm() nativos en index (la convención es uiConfirm, que no
 *     bloquea el iframe de Apps Script).
 *  2. Cero '<' o '>' crudos fuera de <script> (rompían el bootstrap de
 *     Google: la saga «Invalid regular expression: missing /»).
 *  3. Cero caracteres invisibles peligrosos (U+2028/2029/FEFF/200B…).
 *  4. Sintaxis Node válida en todos los v2/*.gs.
 *
 * Uso: node build/checks/convenciones.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const v2 = path.join(__dirname, '..', '..', 'v2');
let fallos = 0;
const rep = (ok, msg) => { console.log((ok ? '✅ ' : '❌ ') + msg); if (!ok) fallos++; };

const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');

const confirms = idx.split('\n')
  .filter(l => !/^\s*(\/\/|\/\*|\*|<!--)/.test(l))
  .filter(l => /[^a-zA-Z_.]confirm\(/.test(l)).length;
rep(confirms === 0, 'confirm() nativos en index (fuera de comentarios): ' + confirms);

let inScript = false; const hostiles = [];
idx.split('\n').forEach((l, i) => {
  if (/<script[\s>]/.test(l)) inScript = true;
  if (!inScript && (/< |<\d/.test(l) || /\w+="[^"]*[<>][^"]*"/.test(l))) hostiles.push(i + 1);
  if (/<\/script>/.test(l)) inScript = false;
});
rep(hostiles.length === 0, "'<' o '>' crudos fuera de <script>: " + (hostiles.length ? 'líneas ' + hostiles.join(',') : '0'));

const invisibles = [0x2028, 0x2029, 0xFEFF, 0x200B, 0x00AD, 0x200E, 0x200F]
  .filter(cp => idx.includes(String.fromCharCode(cp)));
rep(invisibles.length === 0, 'caracteres invisibles: ' + (invisibles.length ? invisibles.map(c => 'U+' + c.toString(16)).join(',') : 'limpio'));

let sintaxisOk = true;
for (const f of fs.readdirSync(v2).filter(f => f.endsWith('.gs'))) {
  const tmp = path.join(require('os').tmpdir(), 'chk_' + f + '.js');
  fs.writeFileSync(tmp, fs.readFileSync(path.join(v2, f)));
  try { execFileSync('node', ['--check', tmp], { stdio: 'pipe' }); }
  catch (e) { sintaxisOk = false; console.error('  sintaxis inválida en ' + f + ': ' + e.stderr); }
}
rep(sintaxisOk, 'sintaxis de los .gs');

process.exit(fallos ? 1 : 0);
