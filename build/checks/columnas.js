/**
 * columnas.js — Guardia de la lectura por columnas (Ola 3, ago-2026).
 *
 * El tablero bajaba las 386 columnas de EVOLUCIONES *y* de EVOLUCIONES_ARCHIVO
 * para usar 21. Ahora pide solo esas 21 (`_CAMPOS_INDICADORES` +
 * `repoLeerColumnas`). El trato tiene una letra chica peligrosa: **el campo que
 * no se pide no explota, llega vacío**. Un indicador que dependa de un campo
 * olvidado marcaría 0 y nadie lo notaría — es exactamente el tipo de error que
 * este proyecto no puede permitirse.
 *
 * Por eso esta guardia no confía en que la lista esté bien, la verifica contra
 * el código, y además comprueba que la verificación tenga poder de detección:
 *   1. Todo `e.CAMPO` que el cálculo toca está declarado (lista derivada del
 *      fuente, no de la memoria de quien la escribió).
 *   2. Nadie accede a columnas por nombre calculado sin declararlas — la
 *      trampa que ya existe en el REM con `_REM_EVAL_CAMPOS` (15 campos que
 *      ningún análisis de `.CAMPO` puede ver).
 *   3. A/B con el repo REAL sobre una hoja de 386 columnas: leer por columnas
 *      y leer entero dan el MISMO resultado, y se mide cuánto se ahorra.
 *   4. Mutación: si a la lista le falta un campo, el A/B TIENE que fallar. Una
 *      guardia que pasa igual con la lista rota no protege nada.
 *   5. Con pocos datos cae a la lectura completa (un viaje sale más barato).
 *
 * Límite anotado a propósito: el punto 3 prueba que el número no CAMBIÓ, nunca
 * que el número esté bien; de eso se ocupa `checks/indicadores.js`.
 *
 * Uso: node build/checks/columnas.js
 */
const fs = require('fs');
const path = require('path');
const v2dir = path.join(__dirname, '..', '..', 'v2');
const v2 = f => fs.readFileSync(path.join(v2dir, f), 'utf8');

const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l);
};
const si = (l, cond, detalle) => {
  console.log((cond ? '✅' : '❌') + ' ' + l + (detalle ? ': ' + detalle : ''));
  if (!cond) fails.push(l);
};

/* ─────────────────────────────────────────────────────────────────────────
 * Motor: carga los .gs reales sobre una hoja falsa que cuenta lo que baja.
 * ───────────────────────────────────────────────────────────────────────── */
let VIAJES = 0, CELDAS = 0;
let HOJAS = {};   // nombre → { filas: [][], ancho }

const SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: (n) => {
      const H = HOJAS[n];
      if (!H) return null;
      return {
        getLastRow: () => H.filas.length + 3,   // 3 filas de encabezado
        getRange: (fila, col, nFilas, nCols) => ({
          getValues: () => {
            VIAJES++; CELDAS += nFilas * nCols;
            const out = [];
            for (let i = 0; i < nFilas; i++) {
              const src = H.filas[fila - 4 + i] || [];
              const row = [];
              for (let j = 0; j < nCols; j++) row.push(src[col - 1 + j] === undefined ? '' : src[col - 1 + j]);
              out.push(row);
            }
            return out;
          },
          setValues: () => {},
        }),
      };
    },
  }),
};

const sandbox = {
  SpreadsheetApp,
  Utilities: { formatDate: (d) => d.toISOString().slice(0, 10) },
  console,
  ok: d => ({ ok: true, data: d }),
  err: (m, c) => ({ ok: false, error: m, codigo: c }),
  ERR: { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO' },
  _rutNormal: rut => {
    const s = String(rut || '').toUpperCase().replace(/[^0-9K]/g, '');
    return s.length < 2 ? '' : s.slice(0, -1) + '-' + s.slice(-1);
  },
};
const fuente = ['infra_util.gs', 'esquema.gs', 'repo.gs', 'svc_stats.gs', 'svc_indicadores.gs']
  .map(v2).join('\n;\n') +
  '\n;return { calcularIndicadores, _CAMPOS_INDICADORES, repoLeerColumnas, repoLeerTodos,' +
  ' COL, TOTAL_COLS, FILA_DATOS, _colsTramos, maxTramos: () => _COLS_MAX_TRAMOS,' +
  ' ponerTecho: v => { _COLS_MAX_TRAMOS = v; },' +
  ' repoInsertar, repoUpsert, repoActualizar, _colsEsParcial,' +
  ' auditar: v => { _COLS_AUDIT = v; _COLS_AUDIT_HITS = {}; },' +
  ' hits: () => _COLS_AUDIT_HITS,' +
  ' apagarColumnas: v => { _COLS_OFF = v; } };';
const API = new Function(...Object.keys(sandbox), fuente)(...Object.values(sandbox));

const COLS_EVO = API.COL.EVOLUCIONES;
const TOTAL = API.TOTAL_COLS.EVOLUCIONES;

/* ─────────────────────────────────────────────────────────────────────────
 * 1 · La lista declarada cubre todos los `.CAMPO` que el cálculo toca.
 * ───────────────────────────────────────────────────────────────────────── */
console.log('\n── 1 · La lista sale del código, no de la memoria ──');
const srcInd = v2('svc_indicadores.gs');
// Se excluye la declaración de la propia lista para no medirse a sí misma.
const cuerpo = srcInd.replace(/const _CAMPOS_INDICADORES = \[[\s\S]*?\];/, '');
const usados = new Set();
let m; const re = /\.([A-Z][A-Z0-9_]{2,})\b/g;
while ((m = re.exec(cuerpo))) if (COLS_EVO[m[1]]) usados.add(m[1]);
const declarados = new Set(API._CAMPOS_INDICADORES);
const faltan = [...usados].filter(c => !declarados.has(c));
si('todo campo de EVOLUCIONES que toca el cálculo está declarado',
  faltan.length === 0, faltan.length ? 'FALTAN: ' + faltan.join(', ') : usados.size + ' campos vistos en el fuente');
eq('la lista no tiene nombres inventados',
  API._CAMPOS_INDICADORES.filter(c => !COLS_EVO[c]).length, 0);
si('vale la pena: se piden muchas menos columnas de las que tiene la hoja',
  API._CAMPOS_INDICADORES.length < TOTAL / 4,
  API._CAMPOS_INDICADORES.length + ' de ' + TOTAL);

/* ─────────────────────────────────────────────────────────────────────────
 * 2 · Nadie lee columnas por nombre calculado sin declararlas.
 *     (En el REM esto SÍ pasa: _REM_EVAL_CAMPOS son 15 columnas que ningún
 *     análisis de `.CAMPO` puede ver. Por eso el REM no usa este camino.)
 * ───────────────────────────────────────────────────────────────────────── */
console.log('\n── 2 · Sin columnas por nombre calculado ──');
// Dos formas de esquivar el análisis de `.CAMPO`, y las dos se revisan:
// `e[variable]` (imposible de resolver leyendo: se rechaza) y `e['CAMPO']`
// (resoluble: basta con que esté declarado).
function detectarDinamicos(txt) {
  const porVariable = [], porLiteral = [];
  const reIdx = /\be\s*\[\s*([^\]]{1,40}?)\s*\]/g;
  let x;
  while ((x = reIdx.exec(txt))) {
    const dentro = x[1];
    const lit = dentro.match(/^['"]([A-Za-z_][A-Za-z0-9_]*)['"]$/);
    if (lit) { if (!declarados.has(lit[1]) && COLS_EVO[lit[1]]) porLiteral.push(lit[1]); }
    else if (/^[A-Za-z_]/.test(dentro)) porVariable.push(dentro);
  }
  return { porVariable, porLiteral };
}
// El detector se prueba con las dos trampas antes de creerle su «ninguno».
const cebo = detectarDinamicos("evos.forEach(e => { const a = e[campo]; const b = e['VENT_PEEP']; });");
si('el detector reconoce las dos formas de esquivarlo',
  cebo.porVariable.length === 1 && cebo.porLiteral.length === 1,
  'e[variable] y e[\'CAMPO\'] sin declarar');
const { porVariable, porLiteral } = detectarDinamicos(cuerpo);
si('el cálculo no accede a la evolución con e[variable]', porVariable.length === 0,
  porVariable.length ? 'hay e[' + porVariable.join('], e[') + ']: declara esos campos o no uses lectura por columnas' : 'ninguno');
si('los accesos e[\'CAMPO\'] están declarados', porLiteral.length === 0,
  porLiteral.length ? 'sin declarar: ' + porLiteral.join(', ') : 'ninguno');
// Arrays literales de nombres de columna (el patrón de _REM_EVAL_CAMPOS).
const listasSueltas = [];
const reArr = /\[([^\[\]]{10,400}?)\]/g;
while ((m = reArr.exec(cuerpo))) {
  const items = m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
  if (items.length < 2) continue;
  if (!items.every(s => /^[A-Z][A-Z0-9_]{2,}$/.test(s) && COLS_EVO[s])) continue;
  items.forEach(s => { if (!declarados.has(s)) listasSueltas.push(s); });
}
si('ninguna lista de nombres de columna queda fuera de la declarada',
  listasSueltas.length === 0, listasSueltas.length ? 'sin declarar: ' + listasSueltas.join(', ') : 'ninguna');

/* ─────────────────────────────────────────────────────────────────────────
 * 3 · A/B con el repo real sobre 386 columnas: mismo resultado, menos celdas.
 * ───────────────────────────────────────────────────────────────────────── */
console.log('\n── 3 · Mismo resultado leyendo por columnas que leyendo entero ──');
// Hoja grande de verdad: TODAS las columnas con valor, para que olvidar una
// se note. 200 filas × 386 columnas supera el umbral de la lectura completa.
const NOMBRES = Object.keys(COLS_EVO).sort((a, b) => COLS_EVO[a] - COLS_EVO[b]);
function filaSintetica(i) {
  const f = new Array(TOTAL).fill('');
  NOMBRES.forEach((n, j) => { f[j] = 'x' + n + i; });   // relleno distinto por columna
  const set = (campo, val) => { f[COLS_EVO[campo] - 1] = val; };
  // 7 pacientes recorriendo 28 días cada uno (el día NO depende del paciente:
  // si ambos salieran del mismo módulo, cada paciente viviría siempre los
  // mismos días y varios indicadores dejarían de discriminar).
  const pid = 'p' + (i % 7);
  const nDia = 1 + (Math.floor(i / 7) % 28);
  const dia = String(nDia).padStart(2, '0');
  set('PATIENT_ID', pid);
  set('FECHA', '2026-07-' + dia);
  set('TURNO_KEY', '2026-07-' + dia + (i % 2 ? '-Dia' : '-Noche'));
  // p1 existe para separar las DOS definiciones de día-VM que conviven en el
  // cálculo: la estrecha (VENT_SOPORTE) manda en diasVM y la ancha (que suma
  // VENT_SOPORTE_FINAL) manda en VM prolongada y en la mediana pre-TQT. Sus
  // 2 días estrechos + 8 anchos cruzan el umbral de 7 solo con la ancha.
  let soporte = 'VMNI', soporteFinal = '';
  if (pid === 'p1') { if (nDia <= 2) soporte = 'VM'; else if (nDia <= 10) soporteFinal = 'VM'; }
  else if (i % 3 === 0) soporte = 'VM';
  set('VENT_SOPORTE', soporte);
  set('VENT_SOPORTE_FINAL', soporteFinal);
  set('VENT_VIA_AEREA', i % 4 === 0 ? 'TOT' : 'TQT');
  set('VENT_CUFF_EST', i % 3 === 0 ? 'rango' : (i % 3 === 1 ? 'ajuste' : 'desinflado'));
  set('EXT_OCURRIO', i % 11 === 0 ? 'TRUE' : '');
  set('EXT_TIPO', i % 22 === 0 ? 'sin_protocolo' : 'protocolo');
  set('EXT_HORA', '10:00');
  set('EXT_MOTIVO', 'Agitación');
  set('PVE_VAL', i % 6 === 0 ? 'si' : 'no');
  set('TQT_OCURRIO', (pid === 'p1' && nDia === 12) ? 'TRUE' : (i % 17 === 0 ? 'TRUE' : ''));
  set('KTM_REALIZADA', i % 2 === 0 ? 'TRUE' : '');
  set('KTM_CANT', String(1 + (i % 3)));
  set('RESP_KTR_CANT', String(i % 4));
  set('DESVINC_OCURRIO', i % 9 === 0 ? 'TRUE' : '');
  set('DESVINC_RECONEXION', i % 18 === 0 ? 'TRUE' : '');
  set('DESVINC_HORAS', '3,5');
  set('VFON_USADA', i % 13 === 0 ? 'TRUE' : '');
  set('VFON_MIN', '30');
  return f;
}
function montarHojas(nEvo, nArch) {
  const evo = [], arch = [];
  for (let i = 0; i < nEvo; i++) evo.push(filaSintetica(i));
  for (let i = 0; i < nArch; i++) arch.push(filaSintetica(1000 + i));
  HOJAS = {
    EVOLUCIONES: { filas: evo },
    EVOLUCIONES_ARCHIVO: { filas: arch },
    ARCHIVO_PACIENTES: { filas: [] },
    CAMAS_ESTADO: { filas: [] },
    REINTUBACIONES: { filas: [] },
    INDICADORES_HISTORICO: { filas: [] },
  };
}
function corrida(porColumnas) {
  API.apagarColumnas(!porColumnas);
  VIAJES = 0; CELDAS = 0;
  const r = API.calcularIndicadores('2026-07-01', '2026-07-31');
  return { r, viajes: VIAJES, celdas: CELDAS };
}

montarHojas(200, 200);
const entero = corrida(false);
const porCol = corrida(true);
eq('la lectura completa calcula sin error', entero.r.ok, true);
eq('la lectura por columnas calcula sin error', porCol.r.ok, true);
const jsonEntero = JSON.stringify(entero.r.data);
const jsonPorCol = JSON.stringify(porCol.r.data);
si('resultado IDÉNTICO campo por campo', jsonEntero === jsonPorCol,
  jsonEntero === jsonPorCol ? Object.keys(entero.r.data).length + ' campos del tablero' : 'DIFIEREN');
if (jsonEntero !== jsonPorCol) {
  Object.keys(entero.r.data).forEach(k => {
    const a = JSON.stringify(entero.r.data[k]), b = JSON.stringify(porCol.r.data[k]);
    if (a !== b) console.log('     · ' + k + ': entero=' + a + '  porColumnas=' + b);
  });
}
si('baja bastantes menos celdas', porCol.celdas < entero.celdas / 3,
  entero.celdas.toLocaleString('es-CL') + ' → ' + porCol.celdas.toLocaleString('es-CL') +
  ' celdas (' + (entero.celdas / porCol.celdas).toFixed(1) + '× menos), ' +
  entero.viajes + ' → ' + porCol.viajes + ' viajes');

/* ─────────────────────────────────────────────────────────────────────────
 * 4 · Mutación: con la lista incompleta, el A/B TIENE que fallar.
 * ───────────────────────────────────────────────────────────────────────── */
console.log('\n── 4 · La prueba detecta una lista incompleta ──');
const original = API._CAMPOS_INDICADORES.slice();
// Las columnas se leen por BLOQUES contiguos, así que un campo olvidado que
// caiga dentro de un bloque que ya se baja por sus vecinos se lee igual, y el
// A/B no puede verlo. Eso NO es un agujero de datos —el valor llega bien— pero
// sí un límite del A/B: quién protege a esos campos es el punto 1. Aquí se
// separa un grupo del otro y se exige detección solo donde es exigible.
// Se usa el agrupador REAL del repo: duplicarlo aquí sería inventar una
// segunda verdad que podría dejar de coincidir con la que corre en la UCI.
const tramosDe = campos => API._colsTramos(campos.map(c => COLS_EVO[c]).sort((a, b) => a - b));
const visibles = [], tapados = [];
original.forEach(campo => {
  const resto = original.filter(c => c !== campo);
  const p = COLS_EVO[campo];
  (tramosDe(resto).some(t => p >= t[0] && p <= t[1]) ? tapados : visibles).push(campo);
});
const detectados = [];
visibles.forEach(campo => {
  API._CAMPOS_INDICADORES.length = 0;
  original.filter(c => c !== campo).forEach(c => API._CAMPOS_INDICADORES.push(c));
  const roto = corrida(true);
  const cambia = JSON.stringify(roto.r.data) !== jsonEntero;
  detectados.push(campo + (cambia ? ' ✓' : ' ✗'));
  if (!cambia) fails.push('quitar ' + campo + ' pasa desapercibido');
});
API._CAMPOS_INDICADORES.length = 0;
original.forEach(c => API._CAMPOS_INDICADORES.push(c));
si('olvidar un campo suelto rompe el resultado (y se ve)',
  !fails.some(f => f.indexOf('pasa desapercibido') >= 0), detectados.join('  '));
console.log('   ℹ ' + tapados.length + ' de ' + original.length +
  ' campos viajan dentro del bloque de un vecino, así que el A/B no puede verlos' +
  (tapados.length ? ' (' + tapados.join(', ') + ')' : '') + '. Su red es el punto 1.');

/* ─────────────────────────────────────────────────────────────────────────
 * 5 · Con pocos datos, la hoja entera en un viaje sale más barata.
 * ───────────────────────────────────────────────────────────────────────── */
console.log('\n── 5 · Con pocas filas no se paga el peaje de varios viajes ──');
montarHojas(20, 0);
const chicaEntero = corrida(false);
const chicaPorCol = corrida(true);
si('mismo resultado con hoja chica',
  JSON.stringify(chicaEntero.r.data) === JSON.stringify(chicaPorCol.r.data), 'idéntico');
eq('la hoja chica se lee de una sola vez', chicaPorCol.viajes, chicaEntero.viajes);

/* ─────────────────────────────────────────────────────────────────────────
 * 6 · El agrupador aguanta los extremos.
 * ───────────────────────────────────────────────────────────────────────── */
console.log('\n── 6 · El agrupador no se cuelga con un techo raro ──');
const idxDemo = API._CAMPOS_INDICADORES.map(c => COLS_EVO[c]).sort((a, b) => a - b);
const techoNormal = API.maxTramos();
eq('una sola columna pedida da un tramo', API._colsTramos([50]).length, 1);
eq('con techo 1 queda un solo bloque de punta a punta',
  (API.ponerTecho(1), API._colsTramos(idxDemo).length), 1);
// Un techo de 0 dejaría el bucle fusionando un tramo con el siguiente, que no
// existe: se trata como 1 en vez de reventar.
let extremo;
try { API.ponerTecho(0); extremo = API._colsTramos(idxDemo).length; }
catch (e) { extremo = 'EXCEPCIÓN: ' + e.message; }
eq('un techo de 0 no revienta', extremo, 1);
API.ponerTecho(techoNormal);

/* ─────────────────────────────────────────────────────────────────────────
 * 7 · Un registro leído a medias NO puede llegar a la hoja.
 *     Este es el daño de verdad: 21 columnas leídas y 365 en blanco, guardadas
 *     tal cual, BORRAN esas 365. Hoy nadie escribe desde el tablero; esto
 *     existe para que siga siendo verdad sin que nadie tenga que acordarse.
 * ───────────────────────────────────────────────────────────────────────── */
console.log('\n── 7 · La escritura rechaza lo leído a medias ──');
montarHojas(200, 0);
API.apagarColumnas(false);
const parciales = API.repoLeerColumnas('EVOLUCIONES', API._CAMPOS_INDICADORES);
si('la lectura por columnas devuelve filas', parciales.length === 200, parciales.length + ' filas');
si('vienen marcadas como leídas a medias', API._colsEsParcial(parciales[0]), 'sí');
const completa = API.repoLeerTodos('EVOLUCIONES');
si('la lectura completa NO viene marcada', !API._colsEsParcial(completa[0]), 'sí');

['repoInsertar', 'repoUpsert', 'repoActualizar'].forEach(fn => {
  let msg = '';
  try {
    if (fn === 'repoInsertar') API.repoInsertar('EVOLUCIONES', parciales[0]);
    else if (fn === 'repoUpsert') API.repoUpsert('EVOLUCIONES', 'PATIENT_ID', 'p0', parciales[0]);
    else API.repoActualizar('EVOLUCIONES', 'PATIENT_ID', 'p0', parciales[0]);
  } catch (e) { msg = e.message; }
  si(fn + ' se niega a guardarlo', /le[íi]do a medias/.test(msg), msg ? 'lo frena' : 'LO DEJÓ PASAR');
});
let okCompleta = true, errCompleta = '';
try { API.repoInsertar('EVOLUCIONES', completa[0]); } catch (e) { okCompleta = false; errCompleta = e.message; }
si('una fila completa sí se puede guardar', okCompleta, okCompleta ? 'sin trabas' : errCompleta);

// La marca no puede ensuciar el dato: ni en las claves ni en el JSON.
eq('la marca no aparece entre las claves',
  Object.keys(parciales[0]).indexOf('_PARCIAL'), -1);
eq('la marca no aparece en el JSON',
  JSON.stringify(parciales[0]).indexOf('_PARCIAL'), -1);
eq('el objeto trae las 386 claves del esquema, no 21',
  Object.keys(parciales[0]).length, TOTAL);

/* ─────────────────────────────────────────────────────────────────────────
 * 8 · La auditoría caza el campo que hoy llega «de puro suerte».
 * ───────────────────────────────────────────────────────────────────────── */
console.log('\n── 8 · La auditoría ve lo que el A/B no puede ver ──');
API.auditar(true);
const auditadas = API.repoLeerColumnas('EVOLUCIONES', API._CAMPOS_INDICADORES);
const _decl = auditadas[0].VENT_SOPORTE;          // declarado: no debe registrarse
const _colado = auditadas[0].VENT_PEEP;           // NO declarado: debe registrarse
const hits = API.hits();
API.auditar(false);
si('registra el campo no declarado', !!hits['EVOLUCIONES.VENT_PEEP'], 'VENT_PEEP');
si('no molesta con los declarados', !hits['EVOLUCIONES.VENT_SOPORTE'], 'VENT_SOPORTE limpio');
si('el valor sigue llegando igual con la auditoría puesta',
  String(_decl) === String(completa[0].VENT_SOPORTE), JSON.stringify(_decl));

/* ─────────────────────────────────────────────────────────────────────────
 * 9 · Quién usa la lectura por columnas, y que no sea nadie que escriba.
 * ───────────────────────────────────────────────────────────────────────── */
console.log('\n── 9 · La lectura por columnas no se cuela en una ruta de escritura ──');
const PERMITIDOS = ['svc_indicadores.gs'];   // ampliar solo tras revisar que NO escribe
const usuarios = fs.readdirSync(v2dir)
  .filter(f => f.endsWith('.gs') && f !== 'repo.gs')
  .filter(f => /repoLeerColumnas\s*\(/.test(v2(f)));
const noRevisados = usuarios.filter(f => PERMITIDOS.indexOf(f) < 0);
si('solo la usan los archivos revisados', noRevisados.length === 0,
  noRevisados.length
    ? 'sin revisar: ' + noRevisados.join(', ') + ' — comprobar que no guarden lo que leen y agregarlos a PERMITIDOS'
    : usuarios.join(', '));
const escribe = /repoInsertar|repoUpsert|repoActualizar|setValues|deleteRow/;
const sospechosos = usuarios.filter(f => escribe.test(v2(f)));
si('ninguno de ellos escribe en hojas', sospechosos.length === 0,
  sospechosos.length ? 'REVISAR: ' + sospechosos.join(', ') : 'ninguno escribe');

/* ── Cierre ── */
console.log('');
if (fails.length) { console.log('❌ FALLAN ' + fails.length + ': ' + fails.join(' · ')); process.exit(1); }
console.log('✅ TODO OK');
