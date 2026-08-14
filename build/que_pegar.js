#!/usr/bin/env node
/**
 * que_pegar.js — QUÉ archivos del editor hay que pegar, calculado del diff.
 *
 * 🔴 POR QUÉ EXISTE (14-ago-2026). Diego iba a pegar la v5.58 y la entrega que
 * yo le había armado tenía DOS archivos: index y servicios. Faltaban TRES:
 *   · `esquema` — donde viven las 3 columnas nuevas del SAS. Sin él,
 *     `crearORepararEstructura()` no las crea y el formulario manda datos a
 *     columnas que no existen: se pierden EN SILENCIO.
 *   · `dominio` — la narrativa del servidor. Sin él, lo que se archiva en la
 *     evolución dice una cosa y lo que el colega leyó en pantalla, otra.
 *   · `mantenimiento` — la rutina para corregir el tiempo extubado.
 *
 * El error es fácil de cometer y difícil de ver: el repo tiene 31 `.gs` y el
 * editor 9, así que «cambié svc_entrega.gs» no dice a simple vista si además
 * se movió algo de otro grupo. Eso no se recuerda: se calcula.
 *
 * Uso:
 *   node build/que_pegar.js                 → contra la versión publicada (main)
 *   node build/que_pegar.js <rama|commit>   → contra otra referencia
 */
const { execFileSync } = require('child_process');
const path = require('path');
const REPO = path.join(__dirname, '..');

// El MISMO mapa que usa `paquete_migracion.js`. Se importa de allá para que no
// puedan separarse: si alguien agrega un grupo nuevo al paquete y no lo agrega
// aquí, esta herramienta mentiría — que es justo el fallo que viene a evitar.
const { GRUPOS } = require('./paquete_migracion.js');

const ref = process.argv[2] || 'origin/main';
let cambiados;
try {
  cambiados = execFileSync('git', ['-C', REPO, 'diff', '--name-only', ref, '--', 'v2/'],
    { encoding: 'utf8' }).trim().split('\n').filter(Boolean).map(f => f.replace(/^v2\//, ''));
} catch (e) {
  console.error('No se pudo comparar contra «' + ref + '». ¿Existe esa rama?');
  process.exit(2);
}

if (!cambiados.length) {
  console.log('Nada cambió respecto de ' + ref + ': no hay que pegar nada.');
  process.exit(0);
}

// Fuente del repo → archivo del editor
const destinoDe = {};
GRUPOS.forEach(([destino, fuentes]) => fuentes.forEach(f => { destinoDe[f] = destino; }));
destinoDe['index.html'] = 'index.html';
// `servicios.gs` y el cohete NO están en GRUPOS: los arman sus propios scripts
// (`fusionar_servicios.js` toma los svc_* por glob, así que la cifra sube sola
// al agregar un servicio). Esa es la razón de que el glob se replique aquí en
// vez de listar los 15 a mano — listarlos sería la copia que se desincroniza.
const esServicio = f => /^svc_.*\.gs$/.test(f);

const porDestino = {};
const huerfanos = [];
cambiados.forEach(f => {
  const d = esServicio(f) ? 'servicios.gs' : destinoDe[f];
  if (!d) { huerfanos.push(f); return; }
  (porDestino[d] = porDestino[d] || []).push(f);
});

const nombreEditor = d => d.replace(/\.gs$/, '').replace('index.html', 'index');

console.log('\nCambios respecto de ' + ref + ': ' + cambiados.length + ' archivo(s) del repo\n');
console.log('HAY QUE PEGAR ' + Object.keys(porDestino).length + ' ARCHIVO(S) EN EL EDITOR:\n');
Object.keys(porDestino).sort().forEach(d => {
  console.log('  · ' + nombreEditor(d).padEnd(22) + '  ← ' + porDestino[d].join(', '));
});

// El esquema es el que decide si hay que correr la reparación: si cambió, hay
// columnas nuevas o cambiadas y alguien tiene que ejecutarla A MANO.
if (porDestino['esquema.gs']) {
  console.log('\n⚠️  CAMBIÓ EL ESQUEMA → hay que correr `crearORepararEstructura()`');
  console.log('    desde el editor. No se puede automatizar y sin eso las');
  console.log('    columnas nuevas no existen: el formulario mandaría datos');
  console.log('    a ninguna parte, sin avisar.');
}

if (huerfanos.length) {
  console.log('\n❌ SIN MAPA (no viajan en el paquete y deberían):');
  huerfanos.forEach(f => console.log('    · ' + f));
  console.log('    Revisa GRUPOS en build/paquete_migracion.js.');
  process.exit(1);
}

console.log('\nArma los archivos con:  node build/paquete_migracion.js');
console.log('y toma de `build/paquete_migracion/` solo los de la lista de arriba.\n');
