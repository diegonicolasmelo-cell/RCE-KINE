/**
 * fusionar_servicios.js — Fusiona los 11 svc_*.gs en un solo servicios.gs.
 *
 * El proyecto de Apps Script de producción usa un layout de 9 archivos .gs
 * (menos pegado manual); este script genera el servicios.gs entregable desde
 * los fuentes separados del repo, que siguen siendo la verdad. Falla si
 * detecta funciones o consts top-level duplicadas (una duplicada pisaría a
 * la otra en silencio al fusionar).
 *
 * Uso: node build/fusionar_servicios.js [salida.gs]
 */
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'v2');
const salida = process.argv[2] || path.join(__dirname, 'servicios.gs');

const svcs = fs.readdirSync(dir).filter(f => f.startsWith('svc_') && f.endsWith('.gs')).sort();
let out = '/**\n * servicios.gs — TODOS los servicios en un solo archivo (fusión de los ' + svcs.length + ' svc_*.gs).\n * En Apps Script los archivos comparten un único espacio global, así que esta\n * fusión es puramente organizativa: mismo código, menos pegado.\n */\n';
for (const f of svcs) {
  out += '\n\n// ════════════════════════════════════════════════════════════════════\n// ── ' + f + ' ──\n// ════════════════════════════════════════════════════════════════════\n\n' + fs.readFileSync(path.join(dir, f), 'utf8').trim() + '\n';
}

let fallo = false;
for (const [tipo, re] of [['function', /^function\s+([A-Za-z_$][\w$]*)/gm], ['const', /^const\s+([A-Za-z_$][\w$]*)/gm]]) {
  const n = [...out.matchAll(re)].map(m => m[1]);
  const dup = [...new Set(n.filter((x, i) => n.indexOf(x) !== i))];
  if (dup.length) { console.error('DUPLICADOS (' + tipo + '): ' + dup.join(', ')); fallo = true; }
}
if (fallo) process.exit(1);
fs.writeFileSync(salida, out);
console.log('servicios.gs generado: ' + salida + ' (' + out.length + ' caracteres, ' + svcs.length + ' servicios)');
