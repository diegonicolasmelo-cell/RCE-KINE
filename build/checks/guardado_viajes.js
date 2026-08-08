// guardado_viajes.js — Guardia de la OLA 4 (ago-2026): el guardado y el cambio
// de paciente hacen MENOS viajes a Sheets y devuelven EXACTAMENTE lo mismo.
//
// De dónde sale. Guardar una evolución costaba 24-39 viajes: la fila del turno
// se buscaba hasta tres veces (fusión, BDT, apnea), CAMAS_ESTADO se escribía
// hasta cinco veces por guardado, PROCEDIMIENTOS y TIMELINE se bajaban ENTERAS
// para reemplazar los 2-4 registros de un turno, y cada hito/procedimiento
// insertado pagaba su propio viaje. Con el arreglo: 13-17 viajes, y el costo
// deja de crecer con el año acumulado.
//
// Cómo verifica. Corre build/medir_guardado.js (los .gs REALES sobre hojas
// simuladas que cuentan viajes) DOS veces: en este árbol y en un worktree del
// commit BASE (e664f3e, cierre de la Ola 3), con reloj y uid congelados. Exige:
//   1. la MISMA respuesta de la API en cada escenario;
//   2. las MISMAS hojas resultantes (EVOLUCIONES byte a byte — es la
//      estadística; TIMELINE/PROCEDIMIENTOS como conjunto, porque los ids
//      autogenerados y el orden físico de inserción cambian de mecanismo);
//   3. MENOS viajes en cada guardado, con techo anotado;
//   4. el guardado sobrevive a una hoja al borde de sus filas físicas
//      (_repoAsegurarFilas) — en el base eso revienta;
//   5. el cache TIMELINE_JSON queda coherente también cuando el re-guardado
//      QUITA todos los procedimientos (en el base quedaba con hitos fantasma:
//      la tarjeta de la cama seguía mostrando hitos ya borrados).
//
// ⚠️ Límite, dicho sin adorno: es un A/B — prueba que nada CAMBIÓ, no que
// esté clínicamente bien. Y los VIAJES son un proxy: los milisegundos reales
// se miden en la planilla con medirGuardado() (regla dura del proyecto).
// Uso: node build/checks/guardado_viajes.js
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.join(__dirname, '..', '..');
const BASE_COMMIT = 'e664f3e';   // cierre de la Ola 3 — el mundo sin esta ola
const RELOJ = '2026-08-08 12:00:00';

const fails = [];
const si = (l, c, extra) => {
  console.log((c ? '✅' : '❌') + ' ' + l + (extra !== undefined ? ': ' + extra : ''));
  if (!c) fails.push(l);
};

/* ── 1 · Worktree del commit base ─────────────────────────────────────────── */
const baseDir = path.join(os.tmpdir(), 'rce_base_guardado_' + BASE_COMMIT);
if (!fs.existsSync(path.join(baseDir, 'v2'))) {
  try { execFileSync('git', ['-C', REPO, 'worktree', 'remove', '--force', baseDir], { stdio: 'ignore' }); } catch (e) {}
  execFileSync('git', ['-C', REPO, 'worktree', 'add', '--detach', baseDir, BASE_COMMIT], { stdio: 'ignore' });
}
// El banco es de esta ola (no existe en el base): ambos árboles corren el MISMO.
fs.mkdirSync(path.join(baseDir, 'build'), { recursive: true });
fs.copyFileSync(path.join(REPO, 'build', 'medir_guardado.js'), path.join(baseDir, 'build', 'medir_guardado.js'));

/* ── 2 · Correr el banco en los dos mundos ────────────────────────────────── */
function correr(dir) {
  const out = execFileSync(process.execPath, [path.join(dir, 'build', 'medir_guardado.js'), '--json'],
    { env: Object.assign({}, process.env, { RCE_RELOJ: RELOJ }), maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(out.toString());
}
const A = correr(baseDir);   // base (Ola 3)
const B = correr(REPO);      // esta ola

/* ── 3 · Normalizaciones (ids autogenerados y orden físico de inserción) ──── */
// TIMELINE y PROCEDIMIENTOS: mismos registros, otro mecanismo — el lote cambia
// ID_* y el orden de fila. Se comparan como CONJUNTO sin la columna de id.
const ordenar = filas => filas.map(f => f.join('')).sort();
function normalizada(hoja, filas, colmapNombre) {
  const sinId = {
    TIMELINE: 0,        // ID_HITO
    PROCEDIMIENTOS: 0,  // ID_PROC
    AUDIT_LOG: 0,       // ID del registro: infra_log lo genera con reloj real
  };
  if (!(hoja in sinId)) return filas.map(f => f.join(''));
  return ordenar(filas.map(f => { const c = f.slice(); c[sinId[hoja]] = '#'; return c; }));
}
// CAMAS_ESTADO: exacta salvo TIMELINE_JSON (col variable): el cache lleva los
// mismos hitos pero con ids/orden del mecanismo — se compara normalizado.
function camasComparables(filas, colTimeline) {
  return filas.map(f => {
    const c = f.slice();
    let tl = [];
    try { tl = JSON.parse(c[colTimeline - 1] || '[]') || []; } catch (e) {}
    c[colTimeline - 1] = JSON.stringify(tl.map(h =>
      [h.FECHA, h.TURNO, h.TIPO, h.TEXTO, h.AUTOR, String(h.ID_CAMA), h.PATIENT_ID].join('|')).sort());
    return c.join('');
  });
}
// La columna de TIMELINE_JSON en CAMAS_ESTADO se lee del esquema real:
const esquemaSrc = fs.readFileSync(path.join(REPO, 'v2', 'esquema.gs'), 'utf8');
const colsCamas = /CAMAS_ESTADO:\s*{[\s\S]*?cols:\s*\[([\s\S]*?)\]\s*}/.exec(esquemaSrc)[1];
const nombresCamas = Array.from(colsCamas.matchAll(/\['([A-Z_0-9]+)'/g)).map(m => m[1]);
const COL_TL = nombresCamas.indexOf('TIMELINE_JSON') + 1;
si('la columna TIMELINE_JSON se ubicó en el esquema', COL_TL > 0, 'col ' + COL_TL);

/* ── 4 · Escenario por escenario ──────────────────────────────────────────── */
const TECHOS = { abrir: 3, reabrir: 3, guardarNuevo: 14, reGuardar: 18, ingreso: 14, decan: 14, reintub: 15, sinProcs: 18 };
for (const esc of Object.keys(TECHOS)) {
  const a = A[esc], b = B[esc];
  console.log('\n— ' + esc + ' (base ' + a.viajes + ' → ahora ' + b.viajes + ' viajes) —');
  si(esc + ' · las dos respuestas son ok', a.respuesta.ok === true && b.respuesta.ok === true);
  si(esc + ' · la respuesta de la API es IDÉNTICA',
    JSON.stringify(a.respuesta) === JSON.stringify(b.respuesta));

  const hojasA = a.hojas, hojasB = b.hojas;
  const nombres = new Set(Object.keys(hojasA).concat(Object.keys(hojasB)));
  for (const hoja of Array.from(nombres).sort()) {
    const fa = hojasA[hoja] || [], fb = hojasB[hoja] || [];
    if (hoja === 'CAMAS_ESTADO') {
      // sinProcs es EL bug arreglado: el base retiene hitos fantasma en el
      // cache — ahí se exige la coherencia interna, no la igualdad (abajo).
      if (esc === 'sinProcs') continue;
      si(esc + ' · CAMAS_ESTADO igual (cache de timeline normalizado)',
        JSON.stringify(camasComparables(fa, COL_TL)) === JSON.stringify(camasComparables(fb, COL_TL)));
    } else {
      si(esc + ' · ' + hoja + ' igual',
        JSON.stringify(normalizada(hoja, fa)) === JSON.stringify(normalizada(hoja, fb)));
    }
  }
  si(esc + ' · hace MENOS viajes que el base', b.viajes < a.viajes, b.viajes + ' < ' + a.viajes);
  si(esc + ' · respeta el techo de ' + TECHOS[esc], b.viajes <= TECHOS[esc], String(b.viajes));
}

/* ── 5 · El bug del cache con hitos fantasma quedó cerrado ────────────────── */
console.log('\n— el cache de timeline cuando el re-guardado quita TODOS los procedimientos —');
{
  const filaCama5 = f => f.find(x => x[0] === '5' || x[1] === '5');   // ID_CAMA es col 1 en CAMAS_ESTADO
  const camaB = (B.sinProcs.hojas.CAMAS_ESTADO || []).find(f => String(f[0]) === '5');
  si('la cama 5 existe en la foto', !!camaB);
  let tlB = [];
  try { tlB = JSON.parse(camaB[COL_TL - 1] || '[]'); } catch (e) {}
  // Coherencia interna: el cache = exactamente los hitos VIVOS de la cama 5.
  const vivos = (B.sinProcs.hojas.TIMELINE || []).filter(f => String(f[1]) === '5');
  si('el cache tiene tantos hitos como la hoja (sin fantasmas)',
    tlB.length === Math.min(30, vivos.length), tlB.length + ' vs ' + vivos.length + ' vivos');
  const camaA = (A.sinProcs.hojas.CAMAS_ESTADO || []).find(f => String(f[0]) === '5');
  let tlA = [];
  try { tlA = JSON.parse(camaA[COL_TL - 1] || '[]'); } catch (e) {}
  const vivosA = (A.sinProcs.hojas.TIMELINE || []).filter(f => String(f[1]) === '5');
  si('control: en el BASE el cache sí quedaba desfasado (el bug existía)',
    tlA.length !== Math.min(30, vivosA.length), tlA.length + ' vs ' + vivosA.length + ' vivos');
}

/* ── 6 · El borde de las filas físicas ya no tumba el guardado ────────────── */
console.log('\n— hoja al borde de sus filas físicas —');
{
  let okB = true, msg = '';
  try {
    execFileSync(process.execPath, [path.join(REPO, 'build', 'medir_guardado.js'), '--borde'],
      { env: Object.assign({}, process.env, { RCE_RELOJ: RELOJ }), stdio: 'pipe' });
  } catch (e) { okB = false; msg = String(e.stdout || e.message).slice(0, 120); }
  si('con el arreglo: expande y guarda', okB, msg);
  let okA = true;
  try {
    execFileSync(process.execPath, [path.join(baseDir, 'build', 'medir_guardado.js'), '--borde'],
      { env: Object.assign({}, process.env, { RCE_RELOJ: RELOJ }), stdio: 'pipe' });
  } catch (e) { okA = false; }
  si('control: en el BASE ese guardado revienta (el riesgo era real)', !okA);
}

console.log('\n' + (fails.length ? '❌ FALLAN ' + fails.length + ': ' + fails.join(' · ') : '✅ Guardado con menos viajes y respuestas idénticas.'));
process.exit(fails.length ? 1 : 0);
