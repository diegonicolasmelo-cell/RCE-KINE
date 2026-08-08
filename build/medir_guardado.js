/**
 * medir_guardado.js — Banco de VIAJES de la Ola 4 (guardado + cambio de modal).
 *
 * A diferencia del simulador (que dobla el repo), aquí corren `esquema.gs` y
 * `repo.gs` REALES sobre hojas en memoria que cuentan cada viaje a la API de
 * Sheets: getValues, setValues, deleteRow(s), insertRows. Lo que se mide es lo
 * que la Ola 1 demostró que manda en Apps Script: el NÚMERO de viajes (cada
 * getRange es un round-trip con costo fijo), no la complejidad del algoritmo.
 *
 * ⚠️ Esto NO mide segundos. Los milisegundos reales se miden en la planilla
 * con medirGuardado() (mantenimiento_manuel.gs), regla dura del proyecto.
 *
 * Uso:  node build/medir_guardado.js
 * API:  const { montar, medir, M } = require('./medir_guardado.js')  (guardias)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', 'v2');

/* ══ Contadores de viajes ═══════════════════════════════════════════════════ */
const M = {
  lecturas: 0, escrituras: 0, borrados: 0, inserciones: 0,
  celdasLeidas: 0, celdasEscritas: 0, meta: 0, log: [],
  reset() {
    this.lecturas = this.escrituras = this.borrados = this.inserciones = 0;
    this.celdasLeidas = this.celdasEscritas = this.meta = 0; this.log = [];
  },
  viajes() { return this.lecturas + this.escrituras + this.borrados + this.inserciones; },
};

/* ══ Hoja simulada (semántica de Sheets) ════════════════════════════════════ */
// data: matriz completa, encabezados incluidos. Como en Sheets real, escribir
// más allá de la última fila FÍSICA (maxRows) revienta — repoInsertar debe
// expandir antes, no confiar en una expansión automática que no existe.
function Hoja(nombre, headerRows, totalCols, maxRows) {
  this.nombre = nombre;
  this.header = headerRows;
  this.total = totalCols;
  this.data = [];
  for (let i = 0; i < maxRows; i++) this.data.push(new Array(totalCols).fill(''));
}
Hoja.prototype.getLastRow = function () {
  M.meta++;
  for (let i = this.data.length - 1; i >= 0; i--) {
    if (this.data[i].some(c => c !== '' && c !== null && c !== undefined)) return i + 1;
  }
  return 0;
};
Hoja.prototype.getMaxRows = function () { M.meta++; return this.data.length; };
Hoja.prototype.insertRowsAfter = function (fila, n) {
  M.inserciones++; M.log.push('insertRows:' + this.nombre + ' +' + n);
  const nuevas = [];
  for (let i = 0; i < n; i++) nuevas.push(new Array(this.total).fill(''));
  this.data.splice(fila, 0, ...nuevas);
  return this;
};
Hoja.prototype.deleteRow = function (fila) {
  M.borrados++; M.log.push('deleteRow:' + this.nombre + ' f' + fila);
  this.data.splice(fila - 1, 1);
  this.data.push(new Array(this.total).fill(''));   // Sheets conserva el grid
};
Hoja.prototype.deleteRows = function (fila, n) {
  M.borrados++; M.log.push('deleteRows:' + this.nombre + ' f' + fila + ' x' + n);
  this.data.splice(fila - 1, n);
  for (let i = 0; i < n; i++) this.data.push(new Array(this.total).fill(''));
};
Hoja.prototype.appendRow = function (vals) {
  M.escrituras++; M.log.push('appendRow:' + this.nombre);
  const fila = new Array(this.total).fill('');
  vals.forEach((v, i) => { fila[i] = v; });
  this.data.push(fila);   // appendRow SÍ expande el grid (así es en Sheets)
};
Hoja.prototype.getRange = function (fila, col, nFilas, nCols) {
  nFilas = nFilas || 1; nCols = nCols || 1;
  const h = this;
  if (fila + nFilas - 1 > h.data.length) {
    // Semántica real de Sheets: rango fuera del grid = excepción, no expansión.
    throw new Error('The coordinates or dimensions of the range are invalid. (' +
      h.nombre + ' f' + fila + '+' + nFilas + ' > maxRows ' + h.data.length + ')');
  }
  return {
    getValues() {
      M.lecturas++; M.celdasLeidas += nFilas * nCols;
      M.log.push('leer:' + h.nombre + ' f' + fila + ' c' + col + ' ' + nFilas + 'x' + nCols);
      const out = [];
      for (let i = 0; i < nFilas; i++) out.push(h.data[fila - 1 + i].slice(col - 1, col - 1 + nCols));
      return out;
    },
    setValues(vals) {
      M.escrituras++; M.celdasEscritas += nFilas * nCols;
      M.log.push('escribir:' + h.nombre + ' f' + fila + ' c' + col + ' ' + nFilas + 'x' + nCols);
      for (let i = 0; i < nFilas; i++) {
        for (let j = 0; j < nCols; j++) h.data[fila - 1 + i][col - 1 + j] = vals[i][j];
      }
      return this;
    },
    setValue(v) { return this.setValues([[v]]); },
  };
};

/* ══ Globals GAS (mismo prólogo que el simulador, sin doblar el repo) ═══════ */
const HOJAS = {};
global.SpreadsheetApp = {
  flush: () => {},
  getActiveSpreadsheet: () => ({ getSheetByName: n => HOJAS[n] || null }),
};
let uuidN = 0;
global.Utilities = {
  getUuid: () => 'uuid-' + (++uuidN),
  formatDate: (d, tz, fmt) => {
    const p = n => String(n).padStart(2, '0');
    const s = fmt
      .replace('yyyy', d.getFullYear()).replace('MM', p(d.getMonth() + 1)).replace('dd', p(d.getDate()))
      .replace('HH', p(d.getHours())).replace('mm', p(d.getMinutes())).replace('ss', p(d.getSeconds()));
    return s;
  },
  base64Decode: s => s, newBlob: (b, m, n) => ({ b, m, n }), sleep: () => {},
  computeDigest: () => [1, 2, 3], base64EncodeWebSafe: () => 'x',
  DigestAlgorithm: { SHA_256: 1 },
};
global.CacheService = { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) };
global.LockService = { getScriptLock: () => ({ tryLock: () => true, waitLock: () => {}, releaseLock: () => {} }) };
const PROPS = {};
global.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in PROPS ? PROPS[k] : null), setProperty: (k, v) => { PROPS[k] = String(v); }, deleteProperty: k => { delete PROPS[k]; } }) };
global.DriveApp = { getFolderById: () => ({ createFile: () => ({ getUrl: () => 'x' }) }) };
global.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) };
global.console.warn = () => {};   // silenciar avisos del servidor en la medición

/* ══ Código REAL del servidor (esquema y repo incluidos) ════════════════════ */
const ARCHIVOS = [
  'esquema.gs', 'repo.gs',
  'infra_respuesta.gs', 'infra_util.gs', 'infra_fechas.gs', 'infra_lock.gs', 'infra_log.gs', 'infra_auth.gs',
  'dominio_validacion.gs', 'dominio_calculos.gs', 'dominio_texto.gs',
  'svc_camas.gs', 'svc_evoluciones.gs', 'svc_procedimientos.gs', 'svc_timeline.gs',
  'svc_turnos.gs', 'svc_stats.gs', 'svc_indicadores.gs', 'svc_auditoria.gs',
  'svc_entrega.gs', 'svc_eventos.gs', 'svc_equipos.gs',
  'api.gs',
];
// Las `const` de esquema.gs (ESQUEMA/COL/…) no cuelgan de globalThis con eval
// indirecto — solo function/var lo hacen. El apéndice las exporta a mano.
(0, eval)(ARCHIVOS.map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n') +
  '\n;globalThis.ESQUEMA = ESQUEMA; globalThis.COL = COL; globalThis.TOTAL_COLS = TOTAL_COLS;' +
  ' globalThis.FILA_DATOS = FILA_DATOS; globalThis.SH = SH;');

// Reloj y uid FIJOS para el A/B (guardado_viajes.js): con RCE_RELOJ en el
// entorno, dos árboles distintos producen hojas comparables byte a byte.
if (process.env.RCE_RELOJ) {
  const ts = String(process.env.RCE_RELOJ);          // 'yyyy-MM-dd HH:mm:ss'
  global.hoyISO = () => ts.slice(0, 10);
  global.ahoraTS = () => ts;
  let _uidN = 0;
  global.uid = p => p + '_' + (++_uidN);
}

/* ══ Siembra: volumen de la planilla real (ago-2026) ════════════════════════ */
// EVOLUCIONES 136 filas · archivo 90 · 12 camas ocupadas de 18 · TIMELINE ~260
// hitos · PROCEDIMIENTOS ~190 · AUDIT_LOG ~600. El margen de filas físicas es
// generoso (como una hoja real recién reparada).
function montar(opts) {
  opts = opts || {};
  uuidN = 0;
  for (const k of Object.keys(HOJAS)) delete HOJAS[k];
  const margen = opts.margen !== undefined ? opts.margen : 900;
  const margenDe = n => (opts.margenHoja && opts.margenHoja[n] !== undefined) ? opts.margenHoja[n] : margen;
  for (const nombre of Object.keys(global.ESQUEMA)) {
    const head = global.ESQUEMA[nombre].headerRows || 1;
    HOJAS[nombre] = new Hoja(nombre, head, global.TOTAL_COLS[nombre], head + margenDe(nombre));
  }
  const fila = (hoja, obj) => {
    const h = HOJAS[hoja];
    const r = Math.max(h.getLastRowSinContar ? h.getLastRowSinContar() : _lastRowSil(h), global.FILA_DATOS[hoja] - 1) + 1;
    const vals = global.esquemaObjetoAFila(hoja, obj);
    for (let j = 0; j < vals.length; j++) h.data[r - 1][j] = vals[j];
  };
  function _lastRowSil(h) {
    for (let i = h.data.length - 1; i >= 0; i--) {
      if (h.data[i].some(c => c !== '' && c !== null && c !== undefined)) return i + 1;
    }
    return 0;
  }

  // CONFIG (col A clave, col B valor — _cfgTabla la lee directo)
  const cfg = Object.assign({
    AUTH_DEV_MODE: 'TRUE', NUM_CAMAS: '18', TIMEZONE: 'America/Santiago',
    TURNO_DIA_INICIO: '9', TURNO_NOCHE_INICIO: '21',
  }, opts.config || {});
  let cr = 2;
  for (const k of Object.keys(cfg)) {
    HOJAS.CONFIG.data[cr - 1][0] = k; HOJAS.CONFIG.data[cr - 1][1] = cfg[k]; cr++;
  }

  ['Reanimación inicial', 'Protección pulmonar', 'Weaning', 'Rehabilitación']
    .forEach((f, i) => fila('CATALOGOS', { TIPO: 'FASE_CLINICA', VALOR: f, ORDEN: i + 1, ACTIVO: true }));
  fila('KINESIOLOGOS', { FIRMA: 'DMV', NOMBRE: 'Diego Melo', TRATAMIENTO: 'Klgo.', EMAIL: 'diego@sim', ACTIVO: true });
  fila('KINESIOLOGOS', { FIRMA: 'MFB', NOMBRE: 'Manuel Fuentes', TRATAMIENTO: 'Klgo.', EMAIL: 'manuel@sim', ACTIVO: true });
  fila('KINESIOLOGOS', { FIRMA: 'CSR', NOMBRE: 'Carla Soto', TRATAMIENTO: 'Klga.', EMAIL: 'carla@sim', ACTIVO: true });

  // 18 camas, 12 ocupadas. La cama 5 lleva un episodio largo en VM.
  for (let c = 1; c <= 18; c++) {
    const ocupada = c <= 12;
    const base = {
      ID_CAMA: String(c), OCUPADA: ocupada, STATUS_CAMA: ocupada ? 'Ocupada' : 'Libre',
    };
    if (ocupada) {
      Object.assign(base, {
        PATIENT_ID: 'pid-' + c, COD_PACIENTE: 'P' + c, NOMBRE: 'Paciente ' + c,
        EDAD: 50 + c, SEXO: c % 2 ? 'M' : 'F', TALLA_CM: 170, PESO_IDEAL_KG: 65,
        DIAGNOSTICO: 'Neumonía grave', VIA_AEREA: c % 3 ? 'TOT' : 'Natural',
        SOPORTE: c % 3 ? 'VM' : 'Ambiente', MODO: c % 3 ? 'ACVC' : '',
        FECHA_INGRESO: '2026-08-01', TS_INGRESO: '2026-08-01 10:00',
        FECHA_INICIO_SOPORTE: c % 3 ? '2026-08-01' : '', FECHA_INICIO_VA: c % 3 ? '2026-08-01' : '',
        ULTIMO_TURNO_KEY: '2026-08-07-Noche', FIRMA_KINE: 'DMV',
      });
    }
    fila('CAMAS_ESTADO', base);
  }

  // Episodios: ~136 evoluciones vivas (12 camas × ~11 turnos: 1..7-ago D/N)
  const turnos = [];
  for (let d = 1; d <= 7; d++) {
    turnos.push('2026-08-0' + d + '-Dia');
    turnos.push('2026-08-0' + d + '-Noche');
  }
  let nEvos = 0;
  for (let c = 1; c <= 12 && nEvos < 136; c++) {
    const nTurnosCama = c <= 4 ? 14 : 11;   // episodios de largo desigual
    for (let t = 0; t < nTurnosCama && nEvos < 136; t++) {
      const tk = turnos[t];
      const p = tk.split('-');
      fila('EVOLUCIONES', {
        ID_EVOLUCION: 'CAMA_' + c + '_' + tk, ID_CAMA: String(c), PATIENT_ID: 'pid-' + c,
        COD_PACIENTE: 'P' + c, TURNO_KEY: tk, FECHA: p[0] + '-' + p[1] + '-' + p[2], TURNO: p[3],
        PAC_NOMBRE: 'Paciente ' + c, PAC_EDAD: 50 + c, PAC_SEXO: c % 2 ? 'M' : 'F',
        PAC_TALLA: 170, PAC_PESO_IDEAL: 65, PAC_DIAGNOSTICO: 'Neumonía grave',
        VENT_VIA_AEREA: c % 3 ? 'TOT' : 'Natural', VENT_SOPORTE: c % 3 ? 'VM' : 'Ambiente',
        VENT_MODO: c % 3 ? 'ACVC' : '', VENT_VT: 420, VENT_FR: 16, VENT_PEEP: 8,
        VENT_FIO2: 40, VENT_SPO2: 96, DIAS_VM: c % 3 ? Math.floor(t / 2) : 0,
        DIA_ESTADIA: Math.floor(t / 2), DIAS_VA: c % 3 ? Math.floor(t / 2) : 0,
        KTM_REALIZADA: t % 2 === 0, KTM_NIVEL_KTR: t % 2 === 0 ? '2' : '',
        RESP_KTR_CANT: 1, PROC_RESUMEN: '', PLAN_FIRMA_KINE: 'DMV',
        TIMESTAMP: p[0] + '-' + p[1] + '-' + p[2] + ' 12:00:00',
      });
      nEvos++;
    }
  }
  // Archivo: 90 filas de episodios pasados
  for (let i = 0; i < 90; i++) {
    const c = (i % 12) + 1;
    fila('EVOLUCIONES_ARCHIVO', {
      ID_EVOLUCION: 'ARCH_' + i, ID_CAMA: String(c), PATIENT_ID: 'pid-arch-' + Math.floor(i / 8),
      TURNO_KEY: '2026-07-' + String(10 + (i % 18)).padStart(2, '0') + '-Dia',
      FECHA: '2026-07-' + String(10 + (i % 18)).padStart(2, '0'), TURNO: 'Dia',
      VENT_SOPORTE: i % 2 ? 'VM' : 'Ambiente', PLAN_FIRMA_KINE: 'MFB',
    });
  }
  // TIMELINE ~260 · PROCEDIMIENTOS ~190 · AUDIT_LOG ~600
  for (let i = 0; i < 260; i++) {
    const c = (i % 12) + 1;
    fila('TIMELINE', {
      ID_HITO: 'H' + i, ID_CAMA: String(c), PATIENT_ID: 'pid-' + c,
      FECHA: '2026-08-0' + ((i % 7) + 1), TURNO: i % 2 ? 'Dia' : 'Noche',
      TIPO: ['ingreso', 'via_aerea', 'procedimiento', 'kine'][i % 4],
      TEXTO: 'Hito ' + i, AUTOR: 'DMV', TIMESTAMP: '2026-08-0' + ((i % 7) + 1) + ' 10:0' + (i % 10) + ':00',
    });
  }
  for (let i = 0; i < 190; i++) {
    const c = (i % 12) + 1;
    fila('PROCEDIMIENTOS', {
      ID_PROC: 'PR' + i, ID_EVOLUCION: 'CAMA_' + c + '_2026-08-0' + ((i % 7) + 1) + '-Dia',
      ID_CAMA: String(c), PATIENT_ID: 'pid-' + c, FECHA: '2026-08-0' + ((i % 7) + 1),
      TURNO: 'Dia', TIPO_PROC: 'kine', NOMBRE_PROC: 'KTR', TIMESTAMP: '2026-08-01 10:00:00',
    });
  }
  for (let i = 0; i < 600; i++) {
    fila('AUDIT_LOG', { TIMESTAMP: '2026-08-01 10:00:00', EMAIL: 'x@sim', FIRMA: 'DMV', ACCION: 'GUARDAR_EVOLUCION', ENTIDAD: 'EVOLUCIONES', RESUMEN: 'x' });
  }
  if (typeof global._memoReset === 'function') global._memoReset();
  return HOJAS;
}

/* ══ Medición por escenario ═════════════════════════════════════════════════ */
function medir(etiqueta, fn, verbose) {
  M.reset();
  const r = fn();
  const okTxt = r && r.ok === false ? '  ⚠️ ERROR: ' + r.error : '';
  console.log(
    etiqueta.padEnd(52) +
    String(M.viajes()).padStart(4) + ' viajes  (' +
    M.lecturas + ' lect ' + M.celdasLeidas + ' celdas · ' +
    M.escrituras + ' escr · ' + M.borrados + ' borr · ' + M.inserciones + ' ins)' + okTxt);
  if (verbose) M.log.forEach(l => console.log('     · ' + l));
  return { r, viajes: M.viajes(), lecturas: M.lecturas, escrituras: M.escrituras, borrados: M.borrados, celdas: M.celdasLeidas, log: M.log.slice() };
}

/* ══ Payloads clínicos de los escenarios ════════════════════════════════════ */
function payloadBase(idCama, turnoKey) {
  return {
    idCama: idCama, turnoKey: turnoKey, PLAN_FIRMA_KINE: 'DMV',
    PAC_NOMBRE: 'Paciente ' + idCama, PAC_EDAD: 55, PAC_SEXO: 'M', PAC_TALLA: 170,
    PAC_DIAGNOSTICO: 'Neumonía grave',
    VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
    VENT_VT: 420, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 40, VENT_SPO2: 96,
    PVE_VAL: 'no', PVE_SC_RAZON: 'Sedación profunda',
    KTM_REALIZADA: true, KTM_NIVEL_KTR: '2', RESP_KTR_CANT: 1,
    SED_TIPO: 'Sedado', SED_SAS: '3', HEMO_ESTADO: 'Estable', HEMO_DVA: 'Sin requerimientos',
    PROC_JSON: JSON.stringify(['KTR', 'ECOGRAFÍA']), PROC_RESUMEN: 'KTR, ECOGRAFÍA', PROC_CANTIDAD: 2,
  };
}

/* ══ Corrida ════════════════════════════════════════════════════════════════ */
function correr(verbose) {
  console.log('\n══ VIAJES POR ACCIÓN — volumen real (136 evos + 90 arch, 12/18 camas) ══\n');

  console.log('— El ciclo del kinesiólogo: abrir → guardar → cambiar de paciente —');
  montar();
  const r1 = medir('GET_EVO_TURNO (abrir paciente, turno nuevo)', () => global.api('GET_EVO_TURNO', { idCama: '5', turnoKey: '2026-08-08-Dia' }, null), verbose);
  const r2 = medir('GET_EVO_TURNO (reabrir turno ya guardado)', () => global.api('GET_EVO_TURNO', { idCama: '5', turnoKey: '2026-08-06-Dia' }, null), verbose);

  montar();
  const r3 = medir('GUARDAR_EVOLUCION (turno nuevo, 2 procs)', () => global.api('GUARDAR_EVOLUCION', payloadBase('5', '2026-08-08-Dia'), null), verbose);
  const r4 = medir('GUARDAR_EVOLUCION (re-guardar el mismo turno)', () => global.api('GUARDAR_EVOLUCION', payloadBase('5', '2026-08-08-Dia'), null), verbose);

  montar();
  const pIng = Object.assign(payloadBase('13', '2026-08-08-Dia'), { ES_INGRESO: true, PAC_HORA_INGRESO: '09:30' });
  HOJAS.CAMAS_ESTADO.data[global.FILA_DATOS.CAMAS_ESTADO - 1 + 12][global.COL.CAMAS_ESTADO.OCUPADA - 1] = true;
  const r5 = medir('GUARDAR_EVOLUCION (ingreso: cama sin fechas)', () => global.api('GUARDAR_EVOLUCION', pIng, null), verbose);

  montar();
  const pDecan = Object.assign(payloadBase('5', '2026-08-08-Dia'), {
    VENT_VIA_AEREA: 'TQT', VENT_MODO: 'Válvula de fonación',
    EVAL_T_BDT_NEG: true, APNEA_TEST: 'Negativo',
    DECAN_OCURRIO: true, DECAN_TIPO: 'Programada',
    PROC_JSON: JSON.stringify(['KTR', 'BDT', 'TEST APNEA', 'DECANULACIÓN']),
    PROC_RESUMEN: 'KTR, BDT, TEST APNEA, DECANULACIÓN', PROC_CANTIDAD: 4,
  });
  const r6 = medir('GUARDAR_EVOLUCION (decanulación: BDT+apnea+4 procs)', () => global.api('GUARDAR_EVOLUCION', pDecan, null), verbose);

  montar();
  const pReint = Object.assign(payloadBase('5', '2026-08-08-Dia'), {
    EXT_REINTUB: true, EXT_REINTUB_RAZ: 'Estridor', REINTUB_HORA: '11:00',
    PROC_JSON: JSON.stringify(['REINTUBACIÓN']), PROC_RESUMEN: 'REINTUBACIÓN', PROC_CANTIDAD: 1,
  });
  const r7 = medir('GUARDAR_EVOLUCION (reintubación sin EXT_TS)', () => global.api('GUARDAR_EVOLUCION', pReint, null), verbose);

  console.log('\n— La recarga que dispara cada guardado (recargarSilencioso) —');
  montar();
  const r8 = medir('GET_TODAS_CAMAS', () => global.api('GET_TODAS_CAMAS', {}, null), verbose);
  const r9 = medir('GET_EVOS_DEL_DIA', () => global.api('GET_EVOS_DEL_DIA', { fecha: '2026-08-07' }, null), verbose);

  console.log('\n— Costo fijo de CADA llamada autenticada (producción, GIS) —');
  const r10 = medir('firmaDeEmail (por llamada, sin caché)', () => ({ ok: true, data: global.firmaDeEmail('manuel@sim') }), verbose);

  return { abrir: r1, reabrir: r2, guardarNuevo: r3, reGuardar: r4, ingreso: r5, decan: r6, reintub: r7, camas: r8, evosDia: r9, firma: r10 };
}

/** Foto de las hojas con contenido (para el A/B de guardado_viajes.js). */
function fotoHojas() {
  const out = {};
  for (const n of Object.keys(HOJAS).sort()) {
    const h = HOJAS[n];
    const filas = [];
    for (let i = 0; i < h.data.length; i++) {
      if (h.data[i].some(c => c !== '' && c !== null && c !== undefined)) {
        filas.push(h.data[i].map(c => String(c)));
      }
    }
    if (filas.length) out[n] = filas;
  }
  return out;
}

module.exports = { montar, medir, M, HOJAS, payloadBase, correr, fotoHojas };

if (require.main === module) {
  if (process.argv.includes('--borde')) {
    // La hoja al borde de sus filas físicas: PROCEDIMIENTOS queda casi llena
    // (190 datos en 192 físicas) y el guardado necesita las filas 192 Y 193.
    // Sin _repoAsegurarFilas la segunda es "The coordinates or dimensions of
    // the range are invalid" — el guardado ENTERO devuelve error, el día que
    // cualquier hoja de crecimiento llegue a su tope.
    // (Se prueba en PROCEDIMIENTOS a propósito: AUDIT_LOG es la hoja que más
    // rápido crece pero su try/catch se traga el error — ahí el borde no tumba
    // el guardado, solo PIERDE LA TRAZA DE AUDITORÍA en silencio. El arreglo
    // de repoInsertar cubre ambas.)
    montar({ margenHoja: { PROCEDIMIENTOS: 191 } });
    const r = global.api('GUARDAR_EVOLUCION', payloadBase('5', '2026-08-08-Dia'), null);
    const okk = r && r.ok === true;
    console.log((okk ? '✅' : '❌') + ' guardado con PROCEDIMIENTOS al borde de sus filas físicas: ' +
      (okk ? 'expande y guarda' : (r && r.error)));
    process.exit(okk ? 0 : 1);
  }
  if (process.argv.includes('--json')) {
    // Modo A/B: cada escenario reporta respuesta, viajes y la foto de las
    // hojas tras ejecutarlo (montaje limpio por escenario). Sin log humano.
    const conFoto = (nombre, fn) => {
      montar();
      M.reset();
      const r = fn();
      return {
        respuesta: r, viajes: M.viajes(), lecturas: M.lecturas,
        escrituras: M.escrituras, borrados: M.borrados, celdas: M.celdasLeidas,
        hojas: fotoHojas(),
      };
    };
    const out = {};
    out.abrir = conFoto('abrir', () => global.api('GET_EVO_TURNO', { idCama: '5', turnoKey: '2026-08-08-Dia' }, null));
    out.reabrir = conFoto('reabrir', () => global.api('GET_EVO_TURNO', { idCama: '5', turnoKey: '2026-08-06-Dia' }, null));
    out.guardarNuevo = conFoto('guardarNuevo', () => global.api('GUARDAR_EVOLUCION', payloadBase('5', '2026-08-08-Dia'), null));
    out.reGuardar = conFoto('reGuardar', () => {
      global.api('GUARDAR_EVOLUCION', payloadBase('5', '2026-08-08-Dia'), null);
      M.reset();
      return global.api('GUARDAR_EVOLUCION', payloadBase('5', '2026-08-08-Dia'), null);
    });
    out.ingreso = conFoto('ingreso', () => {
      HOJAS.CAMAS_ESTADO.data[global.FILA_DATOS.CAMAS_ESTADO - 1 + 12][global.COL.CAMAS_ESTADO.OCUPADA - 1] = true;
      const p = Object.assign(payloadBase('13', '2026-08-08-Dia'), { ES_INGRESO: true, PAC_HORA_INGRESO: '09:30' });
      return global.api('GUARDAR_EVOLUCION', p, null);
    });
    out.decan = conFoto('decan', () => {
      const p = Object.assign(payloadBase('5', '2026-08-08-Dia'), {
        VENT_VIA_AEREA: 'TQT', VENT_MODO: 'Válvula de fonación',
        EVAL_T_BDT_NEG: true, APNEA_TEST: 'Negativo',
        DECAN_OCURRIO: true, DECAN_TIPO: 'Programada',
        PROC_JSON: JSON.stringify(['KTR', 'BDT', 'TEST APNEA', 'DECANULACIÓN']),
        PROC_RESUMEN: 'KTR, BDT, TEST APNEA, DECANULACIÓN', PROC_CANTIDAD: 4,
      });
      return global.api('GUARDAR_EVOLUCION', p, null);
    });
    out.reintub = conFoto('reintub', () => {
      const p = Object.assign(payloadBase('5', '2026-08-08-Dia'), {
        EXT_REINTUB: true, EXT_REINTUB_RAZ: 'Estridor', REINTUB_HORA: '11:00',
        PROC_JSON: JSON.stringify(['REINTUBACIÓN']), PROC_RESUMEN: 'REINTUBACIÓN', PROC_CANTIDAD: 1,
      });
      return global.api('GUARDAR_EVOLUCION', p, null);
    });
    out.sinProcs = conFoto('sinProcs', () => {
      // Re-guardado que QUITA todos los procedimientos: el caso del cache de
      // timeline que antes quedaba con hitos fantasma.
      global.api('GUARDAR_EVOLUCION', payloadBase('5', '2026-08-08-Dia'), null);
      M.reset();
      const p = Object.assign(payloadBase('5', '2026-08-08-Dia'), {
        PROC_JSON: '[]', PROC_RESUMEN: '', PROC_CANTIDAD: 0,
      });
      return global.api('GUARDAR_EVOLUCION', p, null);
    });
    // Sin process.exit(): sobre un PIPE (execFileSync de la guardia) el write
    // es asíncrono y exit() lo trunca a 64 KB — el proceso debe drenar solo.
    process.stdout.write(JSON.stringify(out));
    process.exitCode = 0;
    return;
  }
  const res = correr(process.argv.includes('-v'));
  const falla = Object.values(res).some(x => x.r && x.r.ok === false);
  console.log('\n' + (falla ? '❌ Algún escenario devolvió error — revisar arriba.' : '✅ Todos los escenarios respondieron ok.'));
  process.exit(falla ? 1 : 0);
}
