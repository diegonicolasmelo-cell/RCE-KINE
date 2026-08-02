/**
 * sim_srv.js — Servidor GAS REAL corriendo en Node con hojas EN MEMORIA.
 * Evalúa los .gs de v2/ (dominio + servicios + api) reemplazando solo la capa
 * repo/infra que depende de Google (Sheets, Lock, Auth, Drive). Expone:
 *   api(accion, datos, token) — el dispatcher real
 *   DB      — las "hojas" en memoria (inspectables)
 *   SIM     — reloj simulado { fecha, hora } (hoyISO/ahoraTS lo leen)
 *   CONFIG  — mapa de configuración
 */
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');

// ── Hojas en memoria ──
const DB = {
  CAMAS_ESTADO: [], EVOLUCIONES: [], EVOLUCIONES_ARCHIVO: [], PROCEDIMIENTOS: [],
  TIMELINE: [], ARCHIVO_PACIENTES: [], VENTILADORES: [], MOVIMIENTOS_VM: [],
  FALLAS_VM: [], CATALOGOS: [], KINESIOLOGOS: [], CONFIG: [], AUDIT_LOG: [],
  REINTUBACIONES: [], ENTREGAS_TURNO: [], TURNOS_ASIGNACION: [], CAT_MATRICES: [],
  INDICADORES_HISTORICO: [], REM_MENSUAL: [], EVENTOS_ANEXOS: [],
};
const CONFIG = { AUTH_DEV_MODE: 'TRUE', NUM_CAMAS: '12' };
const SIM = { fecha: '2026-07-01', hora: '10:00:00' };

// ── Capa repo en memoria (misma semántica que repo.gs) ──
global.repoLeerTodos = (h, campo, valor) => {
  let filas = (DB[h] || []).slice();
  if (campo !== undefined) filas = filas.filter(r => String(r[campo]) === String(valor));
  return filas;
};
// Misma semántica que repo.gs: el predicado recibe el valor de la columna.
// (Faltaba desde v5.21: sin él, obtenerEvosDelDia fallaba en silencio dentro
// de la simulación y el registro diario simulado quedaba sin cobertura.)
global.repoLeerFiltrado = (h, colKey, pred) =>
  (DB[h] || []).filter(r => pred(r[colKey]));
// FOTO, no referencia viva: en producción repoBuscarPorId materializa la fila
// desde la hoja, así que mutar la base después NO cambia lo ya leído. La
// simulación debe comportarse igual (una referencia viva escondía el orden
// exacto de operaciones en los traslados).
global.repoBuscarPorId = (h, campo, id) => {
  const r = (DB[h] || []).find(x => String(x[campo]) === String(id));
  return r ? Object.assign({}, r) : null;
};
global.repoBuscarFila = (h, campo, id) => {
  const i = (DB[h] || []).findIndex(r => String(r[campo]) === String(id));
  return i === -1 ? -1 : i + 2;
};
// Las ESCRITURAS sí operan sobre la fila viva (interno, no expuesto a los .gs)
const _filaViva = (h, campo, id) => (DB[h] || []).find(x => String(x[campo]) === String(id)) || null;
global.repoActualizar = (h, campo, id, cambios) => {
  const r = _filaViva(h, campo, id);
  if (r) Object.assign(r, cambios);
  return !!r;
};
global.repoActualizarDonde = (h, fil, mut) =>
  (DB[h] || []).forEach(r => { if (fil(r)) Object.assign(r, mut(r)); });
global.repoInsertar = (h, obj) => { (DB[h] = DB[h] || []).push(obj); return obj; };
global.repoEliminarDonde = (h, fn) => { DB[h] = (DB[h] || []).filter(r => !fn(r)); };
global.repoUpsert = (h, campo, id, obj) => {
  const r = _filaViva(h, campo, id);
  // Como repo.gs: la fila se REESCRIBE completa (no merge) — un upsert con
  // menos campos borra los que no vengan, igual que en producción.
  if (r) {
    const idx = DB[h].indexOf(r);
    DB[h][idx] = Object.assign({}, obj);
    return 'actualizar';
  }
  global.repoInsertar(h, obj); return 'crear';
};

// ── Infra que no se evalúa: config, lock, auth, log ──
global.leerConfig = (k, d) => (k in CONFIG && String(CONFIG[k]).trim() !== '') ? String(CONFIG[k]) : d;
global.escribirConfig = (k, v) => { CONFIG[k] = v; };
global.configVal = (k, d) => (k in CONFIG) ? String(CONFIG[k]) : (d !== undefined ? d : '');
global.conLock = fn => fn();
global.autorizar = (t, firmaDecl) => ({ ok: true, email: 'sim@rce.cl', firma: firmaDecl || 'Klgo. Simulador', dev: true });
global.auditar = a => { DB.AUDIT_LOG.push(Object.assign({ TS: SIM.fecha + ' ' + SIM.hora }, a)); };
global._tz = () => 'America/Santiago';

// ── GAS globals ──
global.SpreadsheetApp = { flush: () => {}, getActiveSpreadsheet: () => { throw new Error('sim: sin Sheets'); } };
let uuidN = 0;
global.Utilities = {
  getUuid: () => 'uuid-' + (++uuidN),
  formatDate: () => { throw new Error('sim: formatDate no debe usarse (hoyISO/ahoraTS overrideados)'); },
  base64Decode: s => s, newBlob: (b, m, n) => ({ b, m, n }),
  sleep: () => {},
};
global.DriveApp = {
  getFolderById: () => ({ createFile: () => ({ getUrl: () => 'https://drive.sim/f/1' }) }),
  createFolder: () => ({ getId: () => 'SIM_FOLDER', createFile: () => ({ getUrl: () => 'https://drive.sim/f/1' }) }),
};
global.CacheService = { getScriptCache: () => ({ get: () => null, put: () => {} }) };
global.LockService = { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) };
const PROPS = {};
global.PropertiesService = { getScriptProperties: () => ({ getProperty: k => (k in PROPS ? PROPS[k] : null), setProperty: (k, v) => { PROPS[k] = String(v); }, deleteProperty: k => { delete PROPS[k]; } }) };

// ── Evaluar el código REAL del servidor ──
const ARCHIVOS = [
  'infra_respuesta.gs', 'infra_util.gs', 'infra_fechas.gs',
  'dominio_validacion.gs', 'dominio_calculos.gs', 'dominio_texto.gs',
  'svc_camas.gs', 'svc_evoluciones.gs', 'svc_procedimientos.gs', 'svc_timeline.gs',
  'svc_turnos.gs', 'svc_stats.gs', 'svc_indicadores.gs', 'svc_auditoria.gs',
  'svc_entrega.gs', 'svc_eventos.gs', 'svc_equipos.gs', 'svc_rem.gs',
  'api.gs',
];
const codigo = ARCHIVOS.map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n');
(0, eval)(codigo);   // eval indirecto → define en global

// Reloj simulado: hoyISO/ahoraTS del servidor leen SIM (pisan infra_fechas)
global.hoyISO = () => SIM.fecha;
global.ahoraTS = () => SIM.fecha + ' ' + SIM.hora;

// ── Semillas (mismas que crearORepararEstructura) ──
['Reanimación inicial', 'Protección pulmonar', 'Neuroprotección', 'Postoperatorio inmediato',
 'Espera de second look', 'Weaning', 'Consolidación de weaning', 'Rehabilitación', 'Cuidados postparo']
  .forEach((f, i) => DB.CATALOGOS.push({ TIPO: 'FASE_CLINICA', VALOR: f, ORDEN: i + 1, ACTIVO: true }));
for (let i = 1; i <= 12; i++) DB.CAMAS_ESTADO.push({ ID_CAMA: String(i), OCUPADA: false });
DB.KINESIOLOGOS.push(
  { FIRMA: 'DMV', NOMBRE: 'Diego Melo Villagrán', TRATAMIENTO: 'Klgo.', EMAIL: 'diego@sim', ACTIVO: true },
  { FIRMA: 'MFB', NOMBRE: 'Manuel Fuentes Blanco', TRATAMIENTO: 'Klgo.', EMAIL: 'manuel@sim', ACTIVO: true },
  { FIRMA: 'CSR', NOMBRE: 'Carla Soto Rojas', TRATAMIENTO: 'Klga.', EMAIL: 'carla@sim', ACTIVO: true },
);
DB.VENTILADORES.push(
  { ID_VM: 'vm1', NOMBRE: 'AVEA-01', MARCA: 'Vyaire', ESTADO: 'Operativo', ACTIVO: true, UBIC_TIPO: 'BODEGA', UBIC_DETALLE: '' },
  { ID_VM: 'vm2', NOMBRE: 'PB-840', MARCA: 'Medtronic', ESTADO: 'Operativo', ACTIVO: true, UBIC_TIPO: 'BODEGA', UBIC_DETALLE: '' },
);

module.exports = { api: global.api, DB, SIM, CONFIG };
