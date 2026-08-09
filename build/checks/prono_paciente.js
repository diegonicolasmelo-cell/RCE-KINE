// prono_paciente.js — LA PRONACIÓN HEREDADA: cerrada por el alta (bloque 10),
// todavía alcanzable por la limpieza manual de camas (bloques 1, 2 y 9).
//
// ⚠️ ESTA GUARDIA MEZCLA DOS COSAS A PROPÓSITO. Léela antes de tocarla:
//   1. FIJA EL ARREGLO (bloque 10). Regla clínica de Manuel, ago-2026: al dar
//      de alta no puede sobrevivir el conteo de horas de prono. `darAltaPaciente`
//      archiva ahora TODAS las filas de la cama —también sin PATIENT_ID y
//      también las huérfanas de un ocupante anterior— vía
//      `_archivarEvolucionesDeCama`. La otra mitad de la regla, cerrar el ciclo
//      al marcar el supino, ya la cumplía `_pronoAbiertoTS` (bloque 3).
//   2. DOCUMENTA lo que sigue vivo (bloques 1, 2 y 9), midiéndolo con su número
//      (87 h de otro paciente). La ruta que queda es `limpiarCamasManual`, que a
//      propósito NO archiva: es una herramienta de reparación y puede correrse
//      con el paciente todavía en la cama, donde borrarle sus evoluciones sería
//      peor que el problema. Ahora avisa por consola cuando deja filas vivas.
//      Si algún día estos bloques fallan, alguien cerró también esa ruta: ven
//      aquí, lee por qué se dejó abierta, y actualiza la guardia a conciencia.
//   3. PROTEGE las rutas sanas (bloques 3, 4, 5 y 8) para que nada de lo
//      anterior las rompa: el mismo paciente ve su prono, el traslado se lo
//      lleva a la cama nueva, y abrir el panel sigue costando una sola bajada.
//
// EL BUG: `_pronoAbiertoTS`, `obtenerEvolucionPrevia` y `obtenerEvolucionesRecientes`
// buscan las filas del episodio filtrando SOLO por ID_CAMA. Una cama es un
// mueble: por ella pasan pacientes distintos y sus evoluciones conviven en la
// hoja mientras no se archiven. Dos rutas liberan la cama SIN archivar:
//   (a) la limpieza manual (limpiarCama / limpiarCamasManual) vacía
//       CAMAS_ESTADO y no toca EVOLUCIONES;
//   (b) el alta solo borra las filas `if (pid)` — un episodio sin PATIENT_ID
//       queda entero en la hoja.
// Clínicamente: el siguiente ocupante hereda la pronación ABIERTA del anterior,
// la app le dice «lleva X horas en prono» a quien nunca se pronó, y al supinarlo
// le sella esas horas inventadas. Se supina a quien no corresponde o se buscan
// lesiones por presión que no existen.
//
// 🧪 POR QUÉ NO SE ARREGLÓ FILTRANDO POR PACIENTE (probado el 6-ago-2026 y
// REVERTIDO — no reintentarlo sin leer esto). Se implementó, pasó esta guardia
// entera y pasó las 54 del harness. Se revirtió porque el riesgo es SIMÉTRICO y
// el otro lado es peor: `ingresarPaciente` genera un PATIENT_ID nuevo SIEMPRE,
// así que a un paciente pronado al que se le repara la cama con
// `limpiarCamasManual` y se le re-ingresa —el uso para el que esa herramienta
// existe— el filtro le ESCONDE su propia pronación en curso: `pronoAbierto`
// pasa de '2026-08-01 19:00' a '', y un ciclo real de 36,5 h no queda
// registrado. Basta UNA fila escrita a mano para lo mismo. No saber cuántas
// horas lleva prono un paciente es tan peligroso como creer las de otro.
// El camino que sigue en pie es atacar la CAUSA: que la limpieza de cama
// archive como el alta. Decisión de Diego. Detalle completo en CLAUDE.md.
//
// Uso: node build/checks/prono_paciente.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l);
};

/* ══ Arnés: capa repo contada (mismo patrón que cama_limpia / memo_episodio) ══ */
let DB = {};
let OPS = [];
const cuenta = k => OPS.push(k);
const lecturasEpisodio = () => OPS.filter(k => k === 'leer:EVOLUCIONES/ID_CAMA').length;
const busquedasCama = () => OPS.filter(k => k === 'buscar:CAMAS_ESTADO/ID_CAMA').length;

global.repoLeerTodos = (h, c, v) => {
  cuenta('leer:' + h + (c !== undefined ? '/' + c : ''));
  let f = (DB[h] || []).map(r => Object.assign({}, r));
  if (c !== undefined) f = f.filter(r => String(r[c]) === String(v));
  return f;
};
global.repoLeerFiltrado = (h, colKey, pred) => (DB[h] || []).filter(r => pred(r[colKey])).map(r => Object.assign({}, r));
global.repoBuscarPorId = (h, c, id) => {
  cuenta('buscar:' + h + '/' + c);
  const r = (DB[h] || []).find(x => String(x[c]) === String(id));
  return r ? Object.assign({}, r) : null;
};
global.repoBuscarFila = (h, c, id) => { const i = (DB[h] || []).findIndex(r => String(r[c]) === String(id)); return i === -1 ? -1 : i + 2; };
const vivo = (h, c, id) => (DB[h] || []).find(x => String(x[c]) === String(id)) || null;
global.repoActualizar = (h, c, id, ch) => { const r = vivo(h, c, id); if (r) Object.assign(r, ch); return !!r; };
global.repoActualizarDonde = (h, fil, mut) => { (DB[h] || []).forEach(r => { if (fil(r)) Object.assign(r, mut(r)); }); };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoEliminarDonde = (h, fn) => { DB[h] = (DB[h] || []).filter(r => !fn(r)); };
global.repoUpsert = (h, c, id, o) => {
  const r = vivo(h, c, id);
  if (r) { DB[h][DB[h].indexOf(r)] = Object.assign({}, o); return 'actualizar'; }
  (DB[h] = DB[h] || []).push(Object.assign({}, o)); return 'crear';
};
// Primitivas de la Ola 4 (guardado con menos viajes) — esta guardia nació en
// la rama del prono, ANTES de la ola, así que su arnés no las traía y el
// guardado entero fallaba. Mismos dobles que en las demás guardias:
// fila = índice + 2, reemplazo conservando la identidad del objeto.
global.repoLeerFila = (h, f2) => Object.assign({}, DB[h][f2 - 2]);
const _reemplazarFila = (h, f2, o) => { const r = DB[h][f2 - 2]; Object.keys(r).forEach(k => delete r[k]); Object.assign(r, o); };
global.repoUpsertEnFila = (h, f2, o) => { if (f2 === -1) { (DB[h] = DB[h] || []).push(Object.assign({}, o)); return 'crear'; } _reemplazarFila(h, f2, o); return 'actualizar'; };
global.repoEscribirFila = (h, f2, o) => _reemplazarFila(h, f2, o);
global.repoLeerTodosConFila = h => { cuenta('leer:' + h); return (DB[h] || []).map((r, i) => ({ obj: Object.assign({}, r), fila: i + 2 })); };
global.repoEliminarFilas = (h, fl) => { (fl || []).map(f2 => f2 - 2).sort((a, b) => b - a).forEach(i => DB[h].splice(i, 1)); return (fl || []).length; };
global.repoEliminarPorCols = (h, cs, pred) => { const a = (DB[h] || []).length; DB[h] = (DB[h] || []).filter(r => { const o = {}; cs.forEach(c => { o[c] = r[c]; }); return !pred(o); }); return a - DB[h].length; };
global.repoInsertarVarios = (h, os) => { (os || []).forEach(o => (DB[h] = DB[h] || []).push(Object.assign({}, o))); return (os || []).length; };
global.repoLeerColumnas = (h, campos) => (DB[h] || []).map(o => { if (!campos || !campos.length) return Object.assign({}, o); const r = {}; campos.forEach(c => { r[c] = (o[c] === undefined) ? '' : o[c]; }); return r; });

const CONFIG = { AUTH_DEV_MODE: 'TRUE' };
global.leerConfig = (k, d) => (k in CONFIG ? String(CONFIG[k]) : d);
global.escribirConfig = (k, v) => { CONFIG[k] = v; };
global.conLock = fn => fn();
global.auditar = () => {};
global.Logger = { log: () => {} };
console.warn = () => {};
global._tz = () => 'America/Santiago';
const AHORA = { fecha: '2026-08-05', hora: '10:00' };
global.SpreadsheetApp = { flush: () => {} };
let _uuid = 0;
global.Utilities = {
  getUuid: () => 'pidNuevo' + (++_uuid),
  formatDate: (d, tz, f) => (f === 'HH:mm' ? AHORA.hora
    : (String(f).indexOf('HH') > -1 ? AHORA.fecha + ' ' + AHORA.hora + ':00' : AHORA.fecha)),
};
global.CacheService = { getScriptCache: () => ({ get: () => null, put: () => {} }) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) };

(0, eval)([
  'infra_respuesta.gs', 'infra_util.gs', 'infra_fechas.gs',
  'dominio_validacion.gs', 'dominio_calculos.gs', 'dominio_texto.gs',
  'svc_camas.gs', 'svc_evoluciones.gs', 'svc_procedimientos.gs', 'svc_timeline.gs',
].map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

let _n = 0;
global.uid = p => p + '_' + (++_n);
global.hoyISO = () => AHORA.fecha;
global.ahoraTS = () => AHORA.fecha + ' ' + AHORA.hora + ':00';
// _statISO vive en svc_stats.gs, que aquí no hace falta entero (mismo atajo que
// stock.js / disp_fecha.js): las fechas de este escenario ya son ISO.
global._statISO = f => String(f || '').slice(0, 10);

/* ══ Escenario: cama 4. El paciente A se prona el 1-ago 19:00 y NO se supina ══ */
const PRONO_TS = '2026-08-01 19:00';
const TK_NUEVO = '2026-08-05-Dia';   // primer turno del paciente que llega después
function sembrar() {
  DB = {
    CAMAS_ESTADO: [
      { ID_CAMA: '4', OCUPADA: 'TRUE', PATIENT_ID: 'pA', COD_PACIENTE: 'PACA', NOMBRE: 'Paciente Antiguo',
        FECHA_INGRESO: '2026-07-30', TS_INGRESO: '2026-07-30 08:00', VIA_AEREA: 'TOT', SOPORTE: 'VM',
        MODO: 'ACVC', FECHA_INICIO_SOPORTE: '2026-07-30', FECHA_INICIO_VA: '2026-07-30' },
      { ID_CAMA: '9', OCUPADA: false, PATIENT_ID: '' },
    ],
    EVOLUCIONES: [
      { ID_EVOLUCION: 'CAMA_4_2026-08-01-Dia', ID_CAMA: '4', PATIENT_ID: 'pA', TURNO_KEY: '2026-08-01-Dia',
        FECHA: '2026-08-01', TURNO: 'Dia', PAC_NOMBRE: 'Paciente Antiguo', VENT_SOPORTE: 'VM',
        VENT_VIA_AEREA: 'TOT', RESP_PRONO_EVENTO: 'TRUE', PRONO_INICIO_TS: PRONO_TS, DIAS_VM: 2 },
      { ID_EVOLUCION: 'CAMA_4_2026-08-01-Noche', ID_CAMA: '4', PATIENT_ID: 'pA', TURNO_KEY: '2026-08-01-Noche',
        FECHA: '2026-08-01', TURNO: 'Noche', PAC_NOMBRE: 'Paciente Antiguo', VENT_SOPORTE: 'VM',
        VENT_VIA_AEREA: 'TOT', RESP_POS_PRONO: 'TRUE', DIAS_VM: 2 },   // solo describe: sigue prono
    ],
    TIMELINE: [], PROCEDIMIENTOS: [], REINTUBACIONES: [], ARCHIVO_PACIENTES: [], EVOLUCIONES_ARCHIVO: [],
  };
  OPS = [];
}
const ingresarB = () => ingresarPaciente({
  idCama: '4', nombre: 'Paciente Nuevo', edad: 60, sexo: 'M', talla: 170, fechaIngreso: '2026-08-05',
  viaAerea: 'Natural', soporte: 'Ambiente', firmaKine: 'MF', diagnostico: 'NAC', barthel: 100,
}, { firma: 'MF', email: 'm@h' });
const supinaB = () => guardarEvolucion({
  ID_CAMA: '4', TURNO_KEY: TK_NUEVO, PLAN_FIRMA_KINE: 'MF', PAC_NOMBRE: 'Paciente Nuevo',
  VENT_SOPORTE: 'Ambiente', VENT_VIA_AEREA: 'Natural',
  RESP_POS_SUPINO: true, RESP_SUPINO_EVENTO: true, RESP_SUPINO_HORA: '10:00',
}, { firma: 'MF', email: 'm@h' });
const filaDe = tk => DB.EVOLUCIONES.find(e => e.ID_EVOLUCION === 'CAMA_4_' + tk) || {};

/* ══ 1 · LA PRUEBA DEL BUG: limpieza manual + ingreso del siguiente ══════════ */
console.log('\n1 · Rendija (a): la cama se limpia a mano y entra otro paciente');
sembrar();
limpiarCamasManual('4');
// Informativo, NO assert: la guardia fija que el siguiente ocupante no las VEA,
// no que sigan ahí — así no bloquea un archivado futuro de esta ruta.
console.log('   (filas del anterior que sobreviven a la limpieza: ' + DB.EVOLUCIONES.length + ')');
eq('el ingreso del paciente nuevo sale bien', ingresarB().ok, true);

OPS = [];
const B = obtenerEvoTurno('4', TK_NUEVO);
// CARACTERIZACIÓN del bug: hoy el paciente nuevo SÍ hereda. Si estas dos
// aserciones fallan, alguien lo arregló: lee la cabecera antes de tocar nada.
eq('BUG VIVO · el paciente nuevo hereda la pronación ajena', B.data.pronoAbierto, PRONO_TS);
eq('BUG VIVO · y se le replica el turno del paciente anterior', B.data.previa.TURNO_KEY, '2026-08-01-Noche');

// El número, no solo la presencia: al supinar se le sellan 87 h que no son suyas.
const g = supinaB();
eq('su guardado sale bien', g.ok, true);
eq('BUG VIVO · al supinar se le sellan horas de otro (87)', filaDe(TK_NUEVO).PRONO_HORAS, 87);
eq('su evolución sí queda bajo SU paciente', filaDe(TK_NUEVO).PATIENT_ID !== 'pA', true);

/* ══ 2 · Rendija (b): cama sin paciente identificado, filas con paciente ═════ */
console.log('\n2 · Rendija (b): limpieza manual SIN reingreso formal');
// Este es el caso que OBLIGA a la igualdad estricta: si el filtro se
// «simplificara» con un `if (pid)` (no filtrar cuando la cama no tiene
// paciente), el bug sobreviviría entero justo en esta ventana.
sembrar();
limpiarCamasManual('4');
const sinPid = obtenerEvoTurno('4', TK_NUEVO);
eq('BUG VIVO · cama vacía sigue mostrando el prono de las filas huérfanas', sinPid.data.pronoAbierto, PRONO_TS);
eq('BUG VIVO · y su previa', sinPid.data.previa.TURNO_KEY, '2026-08-01-Noche');

/* ══ 3 · Control positivo: el MISMO paciente conserva su ciclo ═══════════════ */
console.log('\n3 · Control positivo: el mismo paciente sigue prono entre turnos');
// Imprescindible: un filtro de más apagaría la funcionalidad real (la frase
// «tras X h en prono» y el conteo del ciclo que puede durar días).
sembrar();
const mismo = obtenerEvoTurno('4', '2026-08-02-Dia');
eq('la pronación abierta del propio paciente SÍ se ve', mismo.data.pronoAbierto, PRONO_TS);
eq('y su turno previo se replica', mismo.data.previa.TURNO_KEY, '2026-08-01-Noche');
// Y al supinar, la cuenta se cierra: 1-ago 19:00 → 3-ago 07:30 = 36,5 h.
sembrar();
const gSup = guardarEvolucion({
  ID_CAMA: '4', TURNO_KEY: '2026-08-03-Dia', PLAN_FIRMA_KINE: 'MF', PAC_NOMBRE: 'Paciente Antiguo',
  VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
  RESP_POS_SUPINO: true, RESP_SUPINO_EVENTO: true, RESP_SUPINO_HORA: '07:30',
}, { firma: 'MF', email: 'm@h' });
eq('el ciclo real se sigue cerrando (36,5 h)', (gSup.ok && filaDe('2026-08-03-Dia').PRONO_HORAS), 36.5);

/* ══ 4 · Traslado: el ciclo viaja CON el paciente ════════════════════════════ */
console.log('\n4 · Traslado a cama vacía');
sembrar();
eq('el traslado 4→9 sale bien', moverACamaVacia('4', '9', { firma: 'MF', email: 'm@h' }).ok, true);
const trasl = obtenerEvoTurno('9', '2026-08-02-Dia');
eq('la pronación sigue viva en la cama nueva', trasl.data.pronoAbierto, PRONO_TS);
eq('y la previa también', trasl.data.previa.TURNO_KEY, '2026-08-01-Noche');
const viejo = obtenerEvoTurno('4', TK_NUEVO);
eq('la cama de origen queda sin ciclo abierto', viejo.data.pronoAbierto, '');

/* ══ 5 · Alta con PATIENT_ID: la ruta sana sigue igual ═══════════════════════ */
console.log('\n5 · Alta formal del paciente (ruta que SÍ archiva)');
sembrar();
const alta = darAltaPaciente({ idCama: '4', motivoEgreso: 'Traslado a sala' }, { firma: 'MF', email: 'm@h' });
eq('el alta sale bien', alta.ok, true);
eq('las evoluciones del episodio se archivaron', DB.EVOLUCIONES_ARCHIVO.length, 2);
eq('…y ya no están en la hoja viva', DB.EVOLUCIONES.length, 0);
eq('el ingreso siguiente parte limpio', ingresarB().ok, true);
const trasAlta = obtenerEvoTurno('4', TK_NUEVO);
eq('sin pronación heredada tras el alta', trasAlta.data.pronoAbierto, '');
eq('y sin previa heredada', trasAlta.data.previa, null);

/* ══ 6 · Datos viejos SIN PATIENT_ID: se comportan como hoy ══════════════════ */
console.log('\n6 · Compatibilidad histórica (filas anteriores a PATIENT_ID)');
// Cama sin paciente y filas sin paciente: todas son «igualmente anónimas», así
// que se siguen viendo. Es el comportamiento de antes del arreglo, a propósito.
sembrar();
DB.CAMAS_ESTADO[0].PATIENT_ID = '';
DB.EVOLUCIONES.forEach(e => { e.PATIENT_ID = ''; });
const legado = obtenerEvoTurno('4', '2026-08-02-Dia');
eq('sin PATIENT_ID en ningún lado, la pronación se conserva', legado.data.pronoAbierto, PRONO_TS);
eq('…y la previa también', legado.data.previa.TURNO_KEY, '2026-08-01-Noche');
// CONTROL POSITIVO que hoy se cumple y que cualquier arreglo debe preservar:
// cama CON paciente y filas SIN él (escritas o reparadas a mano en la hoja —
// nadie teclea un UUID). Son del MISMO paciente y tienen que seguir viéndose.
// Es justo el caso que hizo revertir el filtro por PATIENT_ID: allí desaparecían.
sembrar();
DB.EVOLUCIONES.forEach(e => { e.PATIENT_ID = ''; });
const huerfanas = obtenerEvoTurno('4', '2026-08-02-Dia');
eq('filas anónimas del propio paciente NO se pierden', huerfanas.data.pronoAbierto, PRONO_TS);
eq('…y su previa tampoco', huerfanas.data.previa.TURNO_KEY, '2026-08-01-Noche');

/* ══ 7 · Contrato de firma con la Ola 1 ═════════════════════════════════════ */
console.log('\n7 · Contrato de _pronoAbiertoTS (3 argumentos, Ola 1)');
// prono.js evalúa solo el tramo «Ciclo de prono» del archivo y llama con 3
// argumentos. El tercero es el episodio ya leído, para no bajar la hoja dos
// veces en la misma petición: es la optimización de la Ola 1 y no se toca.
sembrar();
const evosCama = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', '4');
eq('con el episodio ya leído da el mismo resultado', _pronoAbiertoTS('4', TK_NUEVO, evosCama), PRONO_TS);
OPS = [];
_pronoAbiertoTS('4', TK_NUEVO, evosCama);
eq('…y no vuelve a bajar la hoja', lecturasEpisodio(), 0);

/* ══ 8 · Anti-regresión de costo (Ola 1) ════════════════════════════════════ */
console.log('\n8 · Abrir el panel sigue costando UNA bajada del episodio');
sembrar();
OPS = [];
obtenerEvoTurno('4', '2026-08-02-Dia');
eq('el episodio se baja 1 sola vez', lecturasEpisodio(), 1);
eq('y el dueño de la cama cuesta ≤1 búsqueda', busquedasCama() <= 1, true);

/* ══ 9 · La cama rota DENTRO del mismo turno ════════════════════════════════ */
console.log('\n9 · Colisión de turno (alta y ingreso el mismo día y turno)');
// ID_EVOLUCION es CAMA_<cama>_<turnoKey>: la fila del anterior y la del nuevo
// comparten clave, y la fusión con la fila previa le inyectaba al nuevo el
// PATIENT_ID del que se fue — con eso el filtro por episodio apuntaba al
// paciente equivocado y la herencia volvía por la ventana.
sembrar();
DB.EVOLUCIONES.push({ ID_EVOLUCION: 'CAMA_4_' + TK_NUEVO, ID_CAMA: '4', PATIENT_ID: 'pA',
  TURNO_KEY: TK_NUEVO, FECHA: '2026-08-05', TURNO: 'Dia', PAC_NOMBRE: 'Paciente Antiguo',
  PAC_DIAGNOSTICO: 'SDRA', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT' });
limpiarCamasManual('4');
ingresarB();
supinaB();
const colision = filaDe(TK_NUEVO);
// CARACTERIZACIÓN: hay un CUARTO lector, y es el que escribe. obtenerEvolucion
// busca por ID_EVOLUCION = CAMA_<cama>_<turnoKey>, sin paciente, y
// guardarEvolucion fusiona esa fila en el payload. Por eso filtrar en los tres
// lectores de lectura NO cerraba esta ventana: aquí el pid ajeno entra por la
// escritura. Documentado para quien intente el arreglo por la causa.
eq('BUG VIVO · en la colisión de turno se le sellan las horas ajenas', colision.PRONO_HORAS, 87);
console.log('   (y la fusión le arrastra el diagnóstico del anterior: ' + JSON.stringify(colision.PAC_DIAGNOSTICO || '') + ')');
console.log('   (PATIENT_ID que queda en la fila: ' + JSON.stringify(colision.PATIENT_ID || '') + ')');

/* ══ 10 · REGLA CLÍNICA: el alta borra el conteo de prono ════════════════════ */
console.log('\n10 · Al dar de alta no puede sobrevivir el conteo de horas de prono');
// Regla de Manuel (ago-2026). Antes el archivado vivía dentro de un `if (pid)`:
// un episodio sin PATIENT_ID se quedaba entero en la hoja viva y el siguiente
// ocupante heredaba su pronación abierta.

// (a) Alta de un episodio SIN PATIENT_ID.
sembrar();
DB.CAMAS_ESTADO[0].PATIENT_ID = '';
DB.EVOLUCIONES.forEach(e => { e.PATIENT_ID = ''; });
const altaSinPid = darAltaPaciente({ idCama: '4', motivoEgreso: 'Fallecimiento' }, { firma: 'MF', email: 'm@h' });
eq('el alta sin PATIENT_ID sale bien', altaSinPid.ok, true);
eq('sus evoluciones se archivaron igual', DB.EVOLUCIONES_ARCHIVO.length, 2);
eq('…y no quedó ninguna en la hoja viva', DB.EVOLUCIONES.length, 0);
eq('el ingreso siguiente parte limpio', ingresarB().ok, true);
const trasSinPid = obtenerEvoTurno('4', TK_NUEVO);
eq('el paciente nuevo NO hereda la pronación', trasSinPid.data.pronoAbierto, '');
eq('…ni la previa', trasSinPid.data.previa, null);
eq('y al supinarlo no se le sellan horas ajenas', (supinaB().ok && filaDe(TK_NUEVO).PRONO_HORAS), '');

// (b) Alta CON pid pero con una fila huérfana de un ocupante anterior.
sembrar();
DB.EVOLUCIONES.push({ ID_EVOLUCION: 'CAMA_4_2026-07-20-Dia', ID_CAMA: '4', PATIENT_ID: '',
  TURNO_KEY: '2026-07-20-Dia', FECHA: '2026-07-20', TURNO: 'Dia', PAC_NOMBRE: 'Ocupante Anterior',
  VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT', RESP_PRONO_EVENTO: 'TRUE',
  PRONO_INICIO_TS: '2026-07-20 08:00' });
eq('el alta con pid sale bien', darAltaPaciente({ idCama: '4', motivoEgreso: 'Traslado a sala' }, { firma: 'MF', email: 'm@h' }).ok, true);
eq('la cama queda sin ninguna evolución viva', DB.EVOLUCIONES.length, 0);
eq('y nada se perdió: las 3 están archivadas', DB.EVOLUCIONES_ARCHIVO.length, 3);
eq('el ingreso siguiente parte limpio', ingresarB().ok, true);
eq('sin rastro del prono más viejo', obtenerEvoTurno('4', TK_NUEVO).data.pronoAbierto, '');

// (c) El traslado NO se toca: ahí las filas se reetiquetan, no se archivan.
sembrar();
eq('el traslado sigue saliendo bien', moverACamaVacia('4', '9', { firma: 'MF', email: 'm@h' }).ok, true);
eq('el traslado NO archivó nada', DB.EVOLUCIONES_ARCHIVO.length, 0);
eq('y el paciente conserva su pronación en la cama nueva', obtenerEvoTurno('9', '2026-08-02-Dia').data.pronoAbierto, PRONO_TS);

console.log('');
if (fails.length) { console.log('❌ FALLARON ' + fails.length + ':\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log("✅ prono_paciente OK — el alta ya borra el conteo de prono; la limpieza manual sigue siendo la ruta abierta (bloques 1, 2 y 9)");
process.exit(0);
