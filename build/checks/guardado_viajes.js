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

/* ── 2b · Campos nacidos DESPUÉS de la ola ────────────────────────────────
   Esta guardia es un A/B contra un commit fijo, así que cada columna que se
   agregue al esquema más adelante la haría fallar por una diferencia que no
   tiene nada que ver con la ola (pasó con RESP_SNT en ago-2026: la fila del
   mundo nuevo trae una celda más y la respuesta de la API una clave más).
   La lista NO se escribe a mano: se deriva comparando el esquema de los dos
   árboles, y esos campos se descuentan antes de comparar. Todo lo demás sigue
   exigiéndose byte a byte. */
function colsEvoluciones(dir) {
  const src = fs.readFileSync(path.join(dir, 'v2', 'esquema.gs'), 'utf8');
  const lista = /_COLS_EVOLUCIONES\s*=\s*\[([\s\S]*?)\n\];/.exec(src);
  return lista ? Array.from(lista[1].matchAll(/\['([A-Z_0-9]+)'/g)).map(m => m[1]) : [];
}
const COLS_BASE = colsEvoluciones(baseDir);
const COLS_HOY = colsEvoluciones(REPO);
const NUEVOS = COLS_HOY.filter(c => COLS_BASE.indexOf(c) === -1);
// Índices (1-based, como los usa el banco) de las columnas nuevas
const IDX_NUEVOS = NUEVOS.map(c => COLS_HOY.indexOf(c)).sort((a, b) => b - a);
si('el esquema de EVOLUCIONES se pudo leer en los dos árboles',
  COLS_BASE.length > 0 && COLS_HOY.length >= COLS_BASE.length,
  COLS_BASE.length + ' → ' + COLS_HOY.length + ' columnas');
if (NUEVOS.length) console.log('   (campos posteriores a la ola, descontados: ' + NUEVOS.join(', ') + ')');
/** Quita las claves nuevas de cualquier objeto de la respuesta, a cualquier nivel. */
function sinCamposNuevos(x) {
  if (Array.isArray(x)) return x.map(sinCamposNuevos);
  if (x && typeof x === 'object') {
    const o = {};
    Object.keys(x).forEach(k => { if (NUEVOS.indexOf(k) === -1) o[k] = sinCamposNuevos(x[k]); });
    return o;
  }
  return x;
}
/* ── 2c · La NARRATIVA evoluciona; los viajes y los datos no ──────────────
   Esta guardia vigila que la Ola 4 no cambiara comportamiento: viajes, filas y
   respuestas. El TEXTO de la evolución es otra cosa — se reescribe cada vez que
   Diego pide una frase distinta, y tiene sus propias guardias (texto_bloques,
   reporte_colega, sas_real…). Compararlo byte a byte aquí haría fallar esta
   guardia con cada ajuste de redacción, por una diferencia que no es la que
   vigila. Así que los campos de texto se descuentan del byte a byte y el cambio
   se verifica APARTE, abajo — demostrado en vez de disimulado, igual que se
   hizo con la evolución previa de GET_EVO_TURNO. */
const COLS_TEXTO = ['TEXTO_GENERADO', 'TEXTO_AUTO', 'TEXTO_MANUAL'];

/* 🔴 KTM_CANT — cambio DELIBERADO del 20-ago-2026, descontado del byte a byte y
   demostrado aparte (bloque «KTM_CANT» al final), igual que se hizo con el texto.
   El servidor no acotaba la cantidad de sesiones de KTM en NINGUNA parte: la
   fórmula vivía solo en el navegador, así que por API (y por el botón ➕, que no
   pasa por el formulario) entraba cualquier valor —o ninguno— al REM B.4.
   Ahora el servidor rellena 1 cuando la KTM está realizada y acota a 1..9, que
   es exactamente lo que el front ya hacía. Comparar esta columna byte a byte
   contra el base haría fallar esta guardia por el arreglo que se quería. */
const COLS_KTM = ['KTM_CANT'];
const IDX_KTM = COLS_KTM.map(c => COLS_HOY.indexOf(c)).filter(i => i >= 0);
const IDX_KTM_BASE = COLS_KTM.map(c => COLS_BASE.indexOf(c)).filter(i => i >= 0);
const IDX_TEXTO = COLS_TEXTO.map(c => COLS_HOY.indexOf(c)).filter(i => i >= 0);
const IDX_TEXTO_BASE = COLS_TEXTO.map(c => COLS_BASE.indexOf(c)).filter(i => i >= 0);

/** Quita las celdas de las columnas nuevas de las filas de EVOLUCIONES. */
function sinColumnasNuevas(hoja, filas) {
  if (!/^EVOLUCIONES/.test(hoja)) return filas;
  return filas.map(f => {
    const c = f.slice();
    IDX_NUEVOS.forEach(i => { if (i < c.length) c.splice(i, 1); });
    return c;
  });
}
/** Vacía las columnas de texto (se comparan aparte, ver 2c). El índice es el
 *  del árbol al que pertenece la fila: la base tiene menos columnas. */
function sinTextos(hoja, filas, idx) {
  if (!/^EVOLUCIONES/.test(hoja) || !idx.length) return filas;
  return filas.map(f => { const c = f.slice(); idx.forEach(i => { if (i < c.length) c[i] = '(texto aparte)'; }); return c; });
}

/** Neutraliza KTM_CANT (se demuestra aparte, ver arriba). */
function sinKtmCant(hoja, filas, idx) {
  if (!/^EVOLUCIONES/.test(hoja) || !idx.length) return filas;
  return filas.map(f => { const c = f.slice(); idx.forEach(i => { if (i < c.length) c[i] = '(ktm aparte)'; }); return c; });
}

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
    // CAMAS_ESTADO guarda una copia del TEXTO de la evolución del turno
    // (TEXTO_EVO_DIA / TEXTO_EVO_NOCHE) para pintar la tarjeta sin volver a
    // leer EVOLUCIONES. Se descuenta por la misma razón que en 2c: la
    // narrativa evoluciona y tiene sus propias guardias.
    IDX_TEXTO_CAMAS.forEach(i => { if (i < c.length) c[i] = '(texto aparte)'; });
    let tl = [];
    try { tl = JSON.parse(c[colTimeline - 1] || '[]') || []; } catch (e) {}
    c[colTimeline - 1] = JSON.stringify(tl.map(h =>
      [h.FECHA, h.TURNO, h.TIPO, h.TEXTO, h.AUTOR, String(h.ID_CAMA), h.PATIENT_ID].join('|')).sort());
    // Las columnas nacidas DESPUES de la ola se QUITAN de la fila, no se
    // rellenan con un marcador: el arbol base no las tiene, asi que dejarles
    // cualquier contenido las haria MAS distintas, no menos. IDX_CAMAS_NUEVAS
    // viene en orden descendente para que un splice no desplace al siguiente.
    IDX_CAMAS_NUEVAS.forEach(i => { if (i < c.length) c.splice(i, 1); });
    return c.join('');
  });
}
// La columna de TIMELINE_JSON en CAMAS_ESTADO se lee del esquema real:
const camasDe = dir => {
  const src = fs.readFileSync(path.join(dir, 'v2', 'esquema.gs'), 'utf8');
  const m = /CAMAS_ESTADO:\s*{[\s\S]*?cols:\s*\[([\s\S]*?)\]\s*}/.exec(src);
  return m ? Array.from(m[1].matchAll(/\['([A-Z_0-9]+)'/g)).map(x => x[1]) : [];
};
const esquemaSrc = fs.readFileSync(path.join(REPO, 'v2', 'esquema.gs'), 'utf8');
const nombresCamas = camasDe(REPO);
// Columnas de CAMAS_ESTADO nacidas DESPUÉS de la ola — mismo criterio que en
// 2b para EVOLUCIONES, que solo cubría esa hoja: la lista se DERIVA comparando
// los dos árboles, nunca se escribe a mano. Sin esto, agregar una columna a
// CAMAS_ESTADO (CORRECCIONES_JSON, ago-2026) ponía roja la comparación por una
// diferencia que no tiene nada que ver con los viajes que esta guardia mide.
const CAMAS_BASE = camasDe(baseDir);
const IDX_CAMAS_NUEVAS = nombresCamas
  .map((c, i) => (CAMAS_BASE.indexOf(c) === -1 ? i : -1)).filter(i => i >= 0)
  .sort((a, b) => b - a);
if (IDX_CAMAS_NUEVAS.length) {
  console.log('   (columnas de CAMAS_ESTADO posteriores a la ola, descontadas: ' +
    IDX_CAMAS_NUEVAS.map(i => nombresCamas[i]).join(', ') + ')');
}
const COL_TL = nombresCamas.indexOf('TIMELINE_JSON') + 1;
const IDX_TEXTO_CAMAS = ['TEXTO_EVO_DIA', 'TEXTO_EVO_NOCHE']
  .map(c => nombresCamas.indexOf(c)).filter(i => i >= 0);
si('la columna TIMELINE_JSON se ubicó en el esquema', COL_TL > 0, 'col ' + COL_TL);

/* ── 4 · Escenario por escenario ──────────────────────────────────────────── */
const TECHOS = { abrir: 3, reabrir: 3, guardarNuevo: 14, reGuardar: 18, ingreso: 14, decan: 14, reintub: 15, sinProcs: 18 };
for (const esc of Object.keys(TECHOS)) {
  const a = A[esc], b = B[esc];
  console.log('\n— ' + esc + ' (base ' + a.viajes + ' → ahora ' + b.viajes + ' viajes) —');
  si(esc + ' · las dos respuestas son ok', a.respuesta.ok === true && b.respuesta.ok === true);
  // DIFERENCIA INTENCIONAL (ago-2026): GET_EVO_TURNO manda la evolución previa
  // TAMBIÉN cuando el turno ya está guardado — antes solo la mandaba si no
  // existía. La usa la línea «Antes: X → Y» de los campos de estado, y al
  // re-editar es justo cuando se mira qué cambió. No cuesta ninguna lectura
  // más: recorre el mismo episodio que ya está en memoria. Se descuenta del
  // byte a byte y se verifica APARTE, abajo, para que quede demostrada en vez
  // de disimulada.
  const sinPrevia = r => { const c = JSON.parse(JSON.stringify(sinCamposNuevos(r)));
    if (c && c.data && 'previa' in c.data) c.data.previa = '(comparada aparte)';
    // El texto viaja en la respuesta del guardado: mismo criterio que 2c.
    if (c && c.data && 'TEXTO_GENERADO' in c.data) c.data.TEXTO_GENERADO = '(texto aparte)';
    return c; };
  si(esc + ' · la respuesta de la API es IDÉNTICA',
    JSON.stringify(sinPrevia(a.respuesta)) === JSON.stringify(sinPrevia(b.respuesta)));
  if (esc === 'reabrir') {
    si('reabrir · el BASE no mandaba la previa (control)', a.respuesta.data.previa === null);
    si('reabrir · ahora sí viaja, y es el turno anterior de verdad',
      !!(b.respuesta.data.previa && b.respuesta.data.previa.TURNO_KEY),
      b.respuesta.data.previa && b.respuesta.data.previa.TURNO_KEY);
  }
  if (esc === 'abrir') {
    si('abrir · la previa del turno nuevo no cambió',
      JSON.stringify(sinCamposNuevos(a.respuesta.data.previa)) ===
      JSON.stringify(sinCamposNuevos(b.respuesta.data.previa)));
  }

  const hojasA = a.hojas, hojasB = b.hojas;
  const nombres = new Set(Object.keys(hojasA).concat(Object.keys(hojasB)));
  for (const hoja of Array.from(nombres).sort()) {
    const fa = hojasA[hoja] || [], fb = hojasB[hoja] || [];
    if (hoja === 'CAMAS_ESTADO') {
      // sinProcs es EL bug arreglado: el base retiene hitos fantasma en el
      // cache — ahí se exige la coherencia interna, no la igualdad (abajo).
      if (esc === 'sinProcs') continue;
      si(esc + ' · CAMAS_ESTADO igual (cache y narrativa aparte)',
        JSON.stringify(camasComparables(fa, COL_TL)) === JSON.stringify(camasComparables(fb, COL_TL)));
    } else if (hoja === 'KINESIOLOGOS') {
      // 🎂 2-sep-2026: se agregó la columna CUMPLE **al final** de la hoja.
      // El base escribe una columna menos, así que el byte a byte fallaría por
      // una celda vacía añadida — no por un cambio de comportamiento. Se
      // comparan las columnas que YA existían, recortando ambas al mismo ancho:
      // si alguna de ésas cambiara, la guardia sigue cazándolo.
      const corte = f => f.map(r => r.slice(0, Math.min(
        (fa[0] || []).length || r.length, (fb[0] || []).length || r.length)));
      si(esc + ' · KINESIOLOGOS igual en las columnas que ya existían',
        JSON.stringify(corte(fa)) === JSON.stringify(corte(fb)));
    } else {
      si(esc + ' · ' + hoja + ' igual (narrativa y KTM aparte)',
        JSON.stringify(normalizada(hoja, sinColumnasNuevas(hoja, sinKtmCant(hoja, sinTextos(hoja, fa, IDX_TEXTO_BASE), IDX_KTM_BASE)))) ===
        JSON.stringify(normalizada(hoja, sinColumnasNuevas(hoja, sinKtmCant(hoja, sinTextos(hoja, fb, IDX_TEXTO), IDX_KTM)))));
    }
  }
  si(esc + ' · hace MENOS viajes que el base', b.viajes < a.viajes, b.viajes + ' < ' + a.viajes);
  si(esc + ' · respeta el techo de ' + TECHOS[esc], b.viajes <= TECHOS[esc], String(b.viajes));
}

/* ── 4b · La narrativa cambió A PROPÓSITO, y aquí se demuestra ──────────────
   Los campos de texto se descuentan del byte a byte (ver 2c) para que un
   ajuste de redacción no haga fallar una guardia que vigila viajes y datos.
   Descontarlos sin más los volvería un punto ciego, así que el cambio se
   verifica aquí: el árbol base narraba el único SAS como si fuera la META, y
   el de hoy narra el SAS ACTUAL con la meta al lado (ago-2026, Diego: paciente
   en 6 con meta 4 — con un solo número no había forma de escribir la verdad).
   Si algún día los dos textos vuelven a ser iguales, este bloque avisa. */
console.log('\n— la narrativa: descontada del byte a byte, comprobada aquí —');
{
  const txt = r => String((r && r.data && r.data.TEXTO_GENERADO) || '');
  const tA = txt(A.guardarNuevo.respuesta), tB = txt(B.guardarNuevo.respuesta);
  si('el base narraba el SAS como meta', /para meta SAS/.test(tA), tA.slice(0, 0) || 'sí');
  si('ahora narra el SAS actual', /con SAS \d/.test(tB), 'sí');
  si('y los dos textos NO son iguales (el cambio existe)', tA !== tB);
  // Control: lo que NO se tocó del texto sigue igual palabra por palabra.
  const linea = (t, re) => (t.split('\n').find(l => re.test(l)) || '');
  si('el resto de la narrativa quedó intacta (HDN)',
    linea(tA, /HDN/) === linea(tB, /HDN/), linea(tB, /HDN/));
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

/* ── 7 · KTM_CANT: el cambio que se descontó arriba, DEMOSTRADO ──────────────
   La columna se neutraliza en el byte a byte porque cambió a propósito. Aquí se
   prueba QUÉ cambió, para que quede demostrado en vez de disimulado — el mismo
   trato que se le dio al texto de la evolución. */
console.log('\n— KTM_CANT: el servidor rellena y acota (antes solo lo hacía el navegador) —');
{
  const { api: apiK, DB: DBK } = require('../sim/sim_srv.js');
  const filaK = tk => (DBK.EVOLUCIONES.find(e => String(e.ID_EVOLUCION) === 'CAMA_8_' + tk) || {});
  const baseK = (tk, extra) => Object.assign({
    idCama: '8', turnoKey: tk, FECHA: tk.slice(0, 10), TURNO: 'Dia',
    VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
    VENT_VT: 450, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 50,
    SED_TIPO: 'Escalón 2', SED_SAS: '2', HEMO_ESTADO: 'Estable',
    PLAN_PLANES: 'Protección pulmonar', PLAN_FIRMA_KINE: 'DMV',
  }, extra || {});
  apiK('INGRESAR_PACIENTE', { idCama: '8', nombre: 'Paciente KTM', edad: 60, sexo: 'M',
    diagnostico: 'NAC', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM',
    modo: 'ACVC', firmaKine: 'DMV' }, null);

  apiK('GUARDAR_EVOLUCION', baseK('2026-08-01-Dia', { KTM_REALIZADA: true, KTM_NIVEL_KTR: '3' }), null);
  si('KTM realizada sin cantidad declarada → el servidor pone 1',
    String(filaK('2026-08-01-Dia').KTM_CANT) === '1', String(filaK('2026-08-01-Dia').KTM_CANT));

  apiK('GUARDAR_EVOLUCION', baseK('2026-08-05-Dia', { KTM_REALIZADA: true, KTM_NIVEL_KTR: '2', KTM_CANT: 99 }), null);
  si('una cantidad absurda se acota a 9',
    String(filaK('2026-08-05-Dia').KTM_CANT) === '9', String(filaK('2026-08-05-Dia').KTM_CANT));

  apiK('GUARDAR_EVOLUCION', baseK('2026-08-06-Dia', { KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Pabellón' }), null);
  si('sin KTM realizada la cantidad NO se inventa',
    String(filaK('2026-08-06-Dia').KTM_CANT || '') === '', String(filaK('2026-08-06-Dia').KTM_CANT));
}

console.log('\n' + (fails.length ? '❌ FALLAN ' + fails.length + ': ' + fails.join(' · ') : '✅ Guardado con menos viajes y respuestas idénticas.'));
process.exit(fails.length ? 1 : 0);
