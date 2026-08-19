// memo_episodio.js — Guardia de la OLA 1 (ago-2026): el episodio de una cama se
// baja UNA sola vez por petición.
//
// De dónde sale. Al abrir un paciente, la app le hacía a la planilla TRES veces
// la misma pregunta —«dame todas las evoluciones de esta cama»— dentro de la
// misma acción, y la planilla se las mandaba enteras las tres veces. En el
// guardado del protocolo de decanulación (BDT + test de apnea + decanulación en
// el mismo turno) llegaban a ser SIETE. Medido: abrir un paciente bajaba 398.638
// celdas para usar unas pocas decenas de filas.
//
// La regla que fija esta guardia. Dentro de UNA petición, y mientras no haya
// ninguna escritura a EVOLUCIONES de por medio, esas lecturas son por fuerza
// idénticas: se hace una y se pasa el resultado. Esto NO es cachear datos
// clínicos —lo que está prohibido en este proyecto— porque nada sobrevive a la
// petición: el memo del guardado es local a la invocación y el de configuración
// lo borra api() al entrar.
//
// Si alguien vuelve a leer el episodio de más, esta guardia falla.
// Uso: node build/checks/memo_episodio.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l);
};

/* ══ 0 · El campo muerto no puede volver ════════════════════════════════════ */
console.log('\n0 · _PRONO_ABIERTO_TS quedó retirado');
// Costaba una bajada COMPLETA de EVOLUCIONES por apertura de paciente y no lo
// leía nadie: ni el servidor, ni el index, ni el cohete desplegado.
const gs = fs.readdirSync(v2).filter(f => f.endsWith('.gs'));
// Se busca la ASIGNACIÓN, no el nombre: el comentario que explica por qué se
// retiró sí lo menciona, y debe poder seguir haciéndolo.
const enServidor = gs.filter(f => /_PRONO_ABIERTO_TS\s*=/.test(fs.readFileSync(path.join(v2, f), 'utf8')));
eq('ningún .gs vuelve a escribirlo', enServidor.join(',') || 'ninguno', 'ninguno');
const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
eq('el index no lo consume', idx.indexOf('_PRONO_ABIERTO_TS') === -1, true);
// Control positivo: el campo que SÍ se usa sigue ahí (si no, la prueba de
// arriba pasaría por estar mirando el archivo equivocado).
eq('control: pronoAbierto sigue vivo en el index', (idx.match(/pronoAbierto/g) || []).length > 0, true);

/* ══ Arnés: capa repo contada ═══════════════════════════════════════════════ */
let DB = {};
let OPS = [];
const cuenta = k => OPS.push(k);
const lecturasEpisodio = () => OPS.filter(k => k === 'leer:EVOLUCIONES/ID_CAMA').length;

// Se recuerdan los objetos del episodio y las claves con que nacieron, para
// poder auditar después qué les inyectó el guardado (ver bloque 5).
let EPISODIO_ENTREGADO = [];
global.repoLeerTodos = (h, c, v) => {
  cuenta('leer:' + h + (c !== undefined ? '/' + c : ''));
  let f = (DB[h] || []).map(r => Object.assign({}, r));
  if (c !== undefined) f = f.filter(r => String(r[c]) === String(v));
  if (h === 'EVOLUCIONES' && c === 'ID_CAMA') {
    f.forEach(o => EPISODIO_ENTREGADO.push({ obj: o, claves: Object.keys(o).slice() }));
  }
  return f;
};
global.repoLeerFiltrado = (h, colKey, pred) => {
  cuenta('leerFiltrado:' + h);
  return (DB[h] || []).filter(r => pred(r[colKey])).map(r => Object.assign({}, r));
};
global.repoBuscarPorId = (h, c, id) => {
  cuenta('buscar:' + h + '/' + c);
  const r = (DB[h] || []).find(x => String(x[c]) === String(id));
  return r ? Object.assign({}, r) : null;
};
global.repoBuscarFila = (h, c, id) => {
  const i = (DB[h] || []).findIndex(r => String(r[c]) === String(id));
  return i === -1 ? -1 : i + 2;
};
const vivo = (h, c, id) => (DB[h] || []).find(x => String(x[c]) === String(id)) || null;
global.repoActualizar = (h, c, id, ch) => { cuenta('actualizar:' + h); const r = vivo(h, c, id); if (r) Object.assign(r, ch); return !!r; };
global.repoActualizarDonde = (h, fil, mut) => { cuenta('actualizarDonde:' + h); (DB[h] || []).forEach(r => { if (fil(r)) Object.assign(r, mut(r)); }); };
global.repoInsertar = (h, o) => { cuenta('insertar:' + h); (DB[h] = DB[h] || []).push(o); return o; };
global.repoEliminarDonde = (h, fn) => { cuenta('eliminar:' + h); DB[h] = (DB[h] || []).filter(r => !fn(r)); };
global.repoUpsert = (h, c, id, o) => {
  cuenta('upsert:' + h);
  const r = vivo(h, c, id);
  if (r) { DB[h][DB[h].indexOf(r)] = Object.assign({}, o); return 'actualizar'; }
  (DB[h] = DB[h] || []).push(Object.assign({}, o)); return 'crear';
};
// Primitivas de la Ola 4, contadas con las mismas etiquetas del arnés.
// repoLeerFila trae UNA fila (el turno), no el episodio: no suma a
// lecturasEpisodio() — que es exactamente lo que esta guardia vigila.
global.repoLeerFila = (h, f2) => { cuenta('leerFila:' + h); return Object.assign({}, DB[h][f2 - 2]); };
const _reemplazarFila = (h, f2, o) => { const r = DB[h][f2 - 2]; Object.keys(r).forEach(k => delete r[k]); Object.assign(r, o); };
global.repoUpsertEnFila = (h, f2, o) => {
  cuenta('upsert:' + h);
  if (f2 === -1) { (DB[h] = DB[h] || []).push(Object.assign({}, o)); return 'crear'; }
  _reemplazarFila(h, f2, o); return 'actualizar';
};
global.repoEscribirFila = (h, f2, o) => { cuenta('actualizar:' + h); _reemplazarFila(h, f2, o); };
global.repoLeerTodosConFila = h => { cuenta('leerTodosConFila:' + h); return (DB[h] || []).map((r, i) => ({ obj: Object.assign({}, r), fila: i + 2 })); };
global.repoEliminarFilas = (h, fl) => { cuenta('eliminar:' + h); (fl || []).map(f2 => f2 - 2).sort((a, b) => b - a).forEach(i => DB[h].splice(i, 1)); return (fl || []).length; };
global.repoEliminarPorCols = (h, cs, pred) => {
  cuenta('eliminar:' + h);
  const a = (DB[h] || []).length;
  DB[h] = (DB[h] || []).filter(r => { const o = {}; cs.forEach(c => { o[c] = r[c]; }); return !pred(o); });
  return a - DB[h].length;
};
global.repoInsertarVarios = (h, os) => { cuenta('insertar:' + h); (os || []).forEach(o => (DB[h] = DB[h] || []).push(Object.assign({}, o))); return (os || []).length; };

const CONFIG = { AUTH_DEV_MODE: 'TRUE' };
global.leerConfig = (k, d) => (k in CONFIG ? String(CONFIG[k]) : d);
global.escribirConfig = (k, v) => { CONFIG[k] = v; };
global.conLock = fn => fn();
global.auditar = () => {};
global.Logger = { log: () => {} };
console.warn = () => {};
global._tz = () => 'America/Santiago';
const AHORA = { fecha: '2026-08-04', hora: '10:00' };
global.SpreadsheetApp = { flush: () => {} };
global.Utilities = {
  getUuid: () => 'uuid',
  formatDate: (d, tz, f) => (f === 'HH:mm' ? AHORA.hora
    : (String(f).indexOf('HH') > -1 ? AHORA.fecha + ' ' + AHORA.hora + ':00' : AHORA.fecha)),
};
global.CacheService = { getScriptCache: () => ({ get: () => null, put: () => {} }) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) };

(0, eval)([
  'infra_respuesta.gs', 'infra_util.gs', 'infra_fechas.gs',
  'dominio_validacion.gs', 'dominio_calculos.gs', 'dominio_texto.gs',
  'svc_camas.gs', 'svc_coordinacion.gs', 'svc_evoluciones.gs', 'svc_procedimientos.gs', 'svc_timeline.gs',
].map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

let _n = 0;
global.uid = p => p + '_' + (++_n);
global.hoyISO = () => AHORA.fecha;
global.ahoraTS = () => AHORA.fecha + ' ' + AHORA.hora + ':00';

// Un episodio de 10 días en la cama 7, con las otras 17 camas intercaladas.
const TURNOS = [];
for (let d = 0; d < 10; d++) {
  const fecha = '2026-07-' + String(22 + d).padStart(2, '0');   // 22 al 31 de julio
  ['Dia', 'Noche'].forEach(t => TURNOS.push({ fecha, turno: t, tk: fecha + '-' + t }));
}
const PRONO_TS = TURNOS[6].fecha + ' 19:00:00';   // se prona en el turno 6 y no se supina
function sembrar() {
  const EVOS = [];
  TURNOS.forEach((T, i) => {
    for (let c = 1; c <= 18; c++) {
      if (c === 7) continue;
      EVOS.push({ ID_EVOLUCION: 'CAMA_' + c + '_' + T.tk, ID_CAMA: String(c), PATIENT_ID: 'p' + c,
        TURNO_KEY: T.tk, FECHA: T.fecha, TURNO: T.turno, VENT_SOPORTE: 'VM', DIAS_VM: i });
    }
    const ult4 = i >= TURNOS.length - 4;
    EVOS.push({
      ID_EVOLUCION: 'CAMA_7_' + T.tk, ID_CAMA: '7', PATIENT_ID: 'p7', COD_PACIENTE: 'PAC7',
      TURNO_KEY: T.tk, FECHA: T.fecha, TURNO: T.turno, PAC_NOMBRE: 'Paciente Siete',
      VENT_SOPORTE: i < 12 ? 'VM' : 'VNI', VENT_VIA_AEREA: 'TQT',
      DIAS_VM: Math.min(i, 12), DIAS_VNI: i < 12 ? 0 : i - 12, DIAS_VA: i,
      VENT_MODO: ult4 ? 'Válvula de fonación' : 'PSV', VFON_USADA: ult4 ? 'TRUE' : '',
      RESP_PRONO_EVENTO: i === 6 ? 'TRUE' : '', PRONO_INICIO_TS: i === 6 ? PRONO_TS : '',
      PLAN_FIRMA_KINE: 'DMV',
    });
  });
  EPISODIO_ENTREGADO = [];
  DB = {
    CAMAS_ESTADO: [{ ID_CAMA: '7', OCUPADA: 'TRUE', PATIENT_ID: 'p7', COD_PACIENTE: 'PAC7',
      NOMBRE: 'Paciente Siete', FECHA_INGRESO: '2026-07-25', TS_INGRESO: '2026-07-25 08:00:00',
      VIA_AEREA: 'TQT', SOPORTE: 'VNI', FECHA_INICIO_SOPORTE: '2026-08-01', FECHA_INICIO_VA: '2026-07-25' }],
    EVOLUCIONES: EVOS, TIMELINE: [], PROCEDIMIENTOS: [], REINTUBACIONES: [], ARCHIVO_PACIENTES: [],
  };
  OPS = []; _n = 0;
}
const TK = '2026-08-04-Dia';
const payload = extra => Object.assign({
  ID_CAMA: '7', TURNO_KEY: TK, PLAN_FIRMA_KINE: 'DMV', PAC_NOMBRE: 'Paciente Siete',
  VENT_SOPORTE: 'VNI', VENT_VIA_AEREA: 'TQT', VENT_MODO: 'Válvula de fonación',
}, extra);

/* ══ 1 · Abrir un paciente ══════════════════════════════════════════════════ */
console.log('\n1 · Abrir un paciente baja el episodio UNA vez');
sembrar();
const abierto = obtenerEvoTurno('7', TK);
eq('el episodio se lee 1 sola vez (antes 3)', lecturasEpisodio(), 1);
eq('sigue devolviendo la previa', !!(abierto.data && abierto.data.previa), true);
eq('…que es el turno inmediatamente anterior', abierto.data.previa.TURNO_KEY, TURNOS[19].tk);
eq('la pronación abierta sigue viajando', abierto.data.pronoAbierto, PRONO_TS);
eq('la racha de válvula de fonación se conserva', abierto.data.previa._VFON_HORAS, 48);
eq('y la previa de turno Día también', abierto.data.previa._PREVIA_DIA.TURNO_KEY, TURNOS[18].tk);

console.log('\n1b · Re-editar un turno ya guardado');
sembrar();
const reedit = obtenerEvoTurno('7', TURNOS[19].tk);
eq('el episodio se lee 1 sola vez', lecturasEpisodio(), 1);
eq('trae el turno actual', !!(reedit.data && reedit.data.actual), true);
eq('y la pronación abierta (la supinación puede llegar ahora)', reedit.data.pronoAbierto, PRONO_TS);

/* ══ 2 · Guardar ════════════════════════════════════════════════════════════ */
console.log('\n2 · Guardar baja el episodio UNA vez, incluso en el protocolo completo');
sembrar();
guardarEvolucion(payload({}), { firma: 'DMV', email: 'd@h' });
eq('guardado normal: 1 lectura del episodio', lecturasEpisodio(), 1);

sembrar();
const rProto = guardarEvolucion(payload({
  EVAL_T_BDT_POS: 'TRUE', APNEA_TEST: 'Positivo', DECAN_OCURRIO: 'TRUE', VFON_USADA: 'TRUE',
}), { firma: 'DMV', email: 'd@h' });
eq('protocolo de decanulación: 1 lectura (antes 7)', lecturasEpisodio(), 1);
eq('el guardado sale bien', rProto.ok, true);
const fila = DB.EVOLUCIONES.find(e => e.ID_EVOLUCION === 'CAMA_7_' + TK);
eq('el histórico de BDT quedó escrito', JSON.parse(fila.BDT_JSON).length > 0, true);
eq('…con el resultado de este turno', JSON.parse(fila.BDT_JSON).pop().resultado, '+');
eq('el histórico de apnea también', JSON.parse(fila.APNEA_JSON).pop().resultado, 'Positivo');
// La racha de válvula alimenta la frase «Cumple ~X h con válvula de fonación».
// 4 turnos previos con válvula (48 h) + este turno con válvula = 60.
eq('las horas de válvula de fonación siguen contando', fila._VFON_HORAS, 60);

/* ══ 3 · Los hitos ya no vuelven a la hoja a buscar el paciente ═════════════ */
console.log('\n3 · Los hitos de procedimientos llevan el PATIENT_ID puesto');
sembrar();
guardarEvolucion(payload({
  PROC_JSON: JSON.stringify(['ASPIRACIÓN DE SECRECIONES', 'INTUBACIÓN', 'RCP 3 CICLOS']),
}), { firma: 'DMV', email: 'd@h' });
const hitos = DB.TIMELINE;
eq('se crearon los hitos', hitos.length > 0, true);
eq('todos con el paciente correcto', hitos.every(h => h.PATIENT_ID === 'p7'), true);
// Antes, cada hito costaba una búsqueda extra en CAMAS_ESTADO para averiguar el
// PATIENT_ID que el guardado ya tenía en la mano.
const busquedasCama = OPS.filter(k => k === 'buscar:CAMAS_ESTADO/ID_CAMA').length;
eq('sin una búsqueda de cama por cada hito (≤2)', busquedasCama <= 2, true);

/* ══ 4 · Y sigue siendo un dato fresco, no un caché ═════════════════════════ */
console.log('\n4 · Nada sobrevive a la petición');
sembrar();
obtenerEvoTurno('7', TK);
const antes = lecturasEpisodio();
// Otro colega guarda una evolución nueva; la siguiente petición DEBE verla.
DB.EVOLUCIONES.push({ ID_EVOLUCION: 'CAMA_7_2026-08-03-Noche', ID_CAMA: '7', PATIENT_ID: 'p7',
  TURNO_KEY: '2026-08-03-Noche', FECHA: '2026-08-03', TURNO: 'Noche', RESP_SUPINO_EVENTO: 'TRUE' });
const despues = obtenerEvoTurno('7', TK);
eq('la petición siguiente vuelve a leer la hoja', lecturasEpisodio() > antes, true);
eq('…y ve la supinación que acaba de escribir otro colega', despues.data.pronoAbierto, '');
eq('…y su previa es la evolución nueva', despues.data.previa.TURNO_KEY, '2026-08-03-Noche');

/* ══ 5 · La mina que hay que desactivar antes de que exista ═════════════════ */
console.log('\n5 · Lo que el guardado le inyecta al episodio compartido');
// Al compartir una sola lectura, los objetos del episodio pasan por varias
// manos: `_epiPrev` calcula los días de VM/VNI/VA con ellos y
// `obtenerEvolucionPrevia` les pega campos transitorios (_PREVIA_DIA,
// _VFON_HORAS). Hoy es inocuo por dos razones que NO son evidentes: el cálculo
// de días corre ANTES de la primera mutación, y ninguna columna del esquema
// empieza con «_», así que lo inyectado nunca llega a la hoja.
// Si mañana alguien inyecta un transitorio con nombre de columna REAL (p. ej.
// `mejor.DIAS_VM = …`), los días de ventilación mecánica saldrían mal en
// silencio. Esta guardia lo caza antes de que ocurra.
sembrar();
guardarEvolucion(payload({
  EVAL_T_BDT_POS: 'TRUE', APNEA_TEST: 'Positivo', DECAN_OCURRIO: 'TRUE', VFON_USADA: 'TRUE',
}), { firma: 'DMV', email: 'd@h' });
const inyectadas = new Set();
EPISODIO_ENTREGADO.forEach(({ obj, claves }) => {
  Object.keys(obj).forEach(k => { if (claves.indexOf(k) === -1) inyectadas.add(k); });
});
const lista = Array.from(inyectadas).sort();
console.log('   claves inyectadas: ' + (lista.join(', ') || 'ninguna'));
eq('toda clave inyectada es transitoria (empieza con «_»)', lista.every(k => k.charAt(0) === '_'), true);
eq('…y son solo las dos conocidas', lista.join(',') || 'ninguna', '_PREVIA_DIA,_VFON_HORAS');
// Y lo que de verdad importa: que los días no se hayan contaminado.
const filaProto = DB.EVOLUCIONES.find(e => e.ID_EVOLUCION === 'CAMA_7_' + TK);
eq('los días de VM sobreviven intactos', filaProto.DIAS_VM, 12);
eq('los días de vía aérea también', filaProto.DIAS_VA > 0, true);

console.log('');
if (fails.length) { console.log('❌ FALLARON ' + fails.length + ':\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('✅ TODO OK');
