/**
 * RCE-KINE · rediseño — backend mínimo del prototipo por bloques.
 * Escribe SOLO en REDISENO_TURNOS / REDISENO_LOG. No toca EVOLUCIONES.
 * Dejar SPREADSHEET_ID = '' para usar la planilla contenedora del script.
 */
var SPREADSHEET_ID = '';
var H_TURNOS = 'REDISENO_TURNOS';
var H_LOG = 'REDISENO_LOG';
/* Separación en tres niveles (Diego, ago-2026): la FICHA DEL EPISODIO (datos
   personales + estado pre-UCI) vive en su propia hoja, separada del registro
   clínico del turno — así los datos personales no se replican fila a fila y
   una exportación anonimizada simplemente NO incluye esta hoja. Las
   EVALUACIONES funcionales van como entradas FECHADAS (serie temporal), no
   como columnas del turno. */
var H_EPISODIO = 'REDISENO_EPISODIO';
var H_EVAL = 'REDISENO_EVAL';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('RCE-KINE · rediseño')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function _ss() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function _hoja(nombre, cabecera) {
  var ss = _ss(), h = ss.getSheetByName(nombre);
  if (!h) { h = ss.insertSheet(nombre); h.appendRow(cabecera); h.setFrozenRows(1); }
  return h;
}

function _hojaTurnos() { return _hoja(H_TURNOS, ['ID', 'ID_CAMA', 'TURNO_KEY', 'DATA_JSON', 'LOG_JSON', 'TS_ULT', 'AUTOR_EMAIL']); }
function _hojaLog() { return _hoja(H_LOG, ['TS', 'ID_CAMA', 'TURNO_KEY', 'BLOQUE', 'FIRMA', 'AUTOR_EMAIL', 'CAMPOS_JSON']); }
function _hojaEpisodio() { return _hoja(H_EPISODIO, ['ID_CAMA', 'FICHA_JSON', 'TS_ULT', 'FIRMA', 'AUTOR_EMAIL']); }
function _hojaEval() { return _hoja(H_EVAL, ['TS', 'ID_CAMA', 'FECHA', 'DATOS_JSON', 'FIRMA', 'AUTOR_EMAIL']); }

/**
 * Guarda/actualiza la FICHA DEL EPISODIO (una fila por cama-episodio).
 * payload = {idCama, firma, ficha:{...}}. Los datos personales viven SOLO
 * aquí: el registro del turno viaja sin nombre.
 */
function redisGuardarFicha(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!payload || !payload.firma) throw new Error('Firma obligatoria para guardar.');
    var h = _hojaEpisodio();
    var email = Session.getActiveUser().getEmail() || '';
    var ts = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd HH:mm:ss');
    var datos = h.getDataRange().getValues(), fila = -1;
    for (var i = 1; i < datos.length; i++) if (datos[i][0] === payload.idCama) { fila = i + 1; break; }
    var valores = [payload.idCama, JSON.stringify(payload.ficha), ts, payload.firma, email];
    if (fila > 0) h.getRange(fila, 1, 1, 5).setValues([valores]); else h.appendRow(valores);
    return { ok: true, ts: ts };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Agrega UNA evaluación funcional FECHADA (serie temporal, nunca sobrescribe).
 * payload = {idCama, fecha, firma, datos:{MRC, FSS, DINAMO, PMANT, ...}}
 */
function redisGuardarEval(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!payload || !payload.firma) throw new Error('Firma obligatoria para guardar.');
    var email = Session.getActiveUser().getEmail() || '';
    var ts = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd HH:mm:ss');
    _hojaEval().appendRow([ts, payload.idCama, payload.fecha || ts.slice(0, 10), JSON.stringify(payload.datos), payload.firma, email]);
    return { ok: true, ts: ts };
  } finally {
    lock.releaseLock();
  }
}

/** Carga el turno guardado (o null) para cama+turnoKey. */
function redisCargar(idCama, turnoKey) {
  var h = _hojaTurnos(), id = idCama + '_' + turnoKey;
  var datos = h.getDataRange().getValues();
  for (var i = 1; i < datos.length; i++) {
    if (datos[i][0] === id) {
      return { data: JSON.parse(datos[i][3] || '{}'), log: JSON.parse(datos[i][4] || '[]') };
    }
  }
  return null;
}

/**
 * Guarda UN bloque: merge de campos en la fila del turno (upsert, nunca duplica)
 * + entrada de historial en REDISENO_LOG (timestamp, firma, campos cambiados).
 * payload = {idCama, turnoKey, bloque, firma, campos:{...}}
 */
function redisGuardarBloque(payload) {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (!payload || !payload.firma) throw new Error('Firma obligatoria para guardar.');
    var h = _hojaTurnos(), id = payload.idCama + '_' + payload.turnoKey;
    var email = Session.getActiveUser().getEmail() || '';
    var ts = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd HH:mm:ss');
    var datos = h.getDataRange().getValues(), fila = -1;
    for (var i = 1; i < datos.length; i++) if (datos[i][0] === id) { fila = i + 1; break; }
    var data = {}, log = [];
    if (fila > 0) {
      data = JSON.parse(h.getRange(fila, 4).getValue() || '{}');
      log = JSON.parse(h.getRange(fila, 5).getValue() || '[]');
    }
    Object.keys(payload.campos).forEach(function (k) { data[k] = payload.campos[k]; });
    log.push({ ts: ts, bloque: payload.bloque, firma: payload.firma, campos: Object.keys(payload.campos) });
    var valores = [id, payload.idCama, payload.turnoKey, JSON.stringify(data), JSON.stringify(log), ts, email];
    if (fila > 0) h.getRange(fila, 1, 1, 7).setValues([valores]); else h.appendRow(valores);
    _hojaLog().appendRow([ts, payload.idCama, payload.turnoKey, payload.bloque, payload.firma, email, JSON.stringify(payload.campos)]);
    return { ok: true, ts: ts };
  } finally {
    lock.releaseLock();
  }
}

/**
 * MAPA_ESQUEMA — nombre del campo del prototipo → columna canónica de EVOLUCIONES
 * (ESQUEMA.md §4). Referencia para la migración; el prototipo no lo usa.
 * Los campos no listados llevan ya su nombre canónico.
 */
var MAPA_ESQUEMA = {
  VIA: 'VENT_VIA_AEREA', SOPORTE: 'VENT_SOPORTE', MODO: 'VENT_MODO',
  VT: 'VENT_VT', FR: 'VENT_FR', PEEP: 'VENT_PEEP', FIO2: 'VENT_FIO2', SPO2: 'VENT_SPO2',
  PMAX: 'VENT_PMAX', PPL: 'VENT_PPL', PINSP: 'VENT_PINSP', PS: 'VENT_PS',
  IPAP: 'VENT_IPAP', EPAP: 'VENT_EPAP', IPAP_MIN: 'VENT_IPAP_MIN', IPAP_MAX: 'VENT_IPAP_MAX',
  VT_ASEG: 'VENT_VT_ASEG', LITROS: 'VENT_LITROS', TEMP: 'VENT_TEMP', TI: 'VENT_TI',
  AUTOPEEP: 'VENT_AUTOPEEP', P01: 'VENT_P01', DPOCC: 'VENT_DPOCC', PMUSC: 'VENT_PMUSC',
  ADAPTADO: 'VENT_ADAPTADO', HUMIDIF: 'VENT_H_ACTIVA',
  TOT_NUM: 'VENT_TOT_NUM', TOT_CM: 'VENT_TOT_CM', TQT_TIPO: 'VENT_TQT_TIPO', TQT_CALIBRE: 'VENT_TQT_CALIBRE'
};
