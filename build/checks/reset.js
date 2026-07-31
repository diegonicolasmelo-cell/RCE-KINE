// reset.js — Guardia del reseteo para el inicio real (v5.0). Es la operación
// más destructiva del sistema: se verifica que el simulacro NO toque nada, que
// sin respaldo previo se cancele, que borre exactamente las hojas de datos y
// conserve la configuración, y que las camas queden libres.
// Uso: node build/checks/reset.js
const fs = require('fs');
const path = require('path');

const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

const HOJAS_DATOS = ['EVOLUCIONES', 'EVOLUCIONES_ARCHIVO', 'PROCEDIMIENTOS', 'TIMELINE',
  'ENTREGAS_TURNO', 'ARCHIVO_PACIENTES', 'REINTUBACIONES', 'VENTILADORES', 'MOVIMIENTOS_VM',
  'FALLAS_VM', 'ESTADISTICAS_REM', 'TURNOS', 'AUDIT_LOG', 'IMPORTAR'];
const HOJAS_CONFIG = ['CONFIG', 'CATALOGOS', 'CAT_MATRICES', 'KINESIOLOGOS', 'INDICADORES_HISTORICO'];

/** Planilla simulada: cada hoja parte con encabezados + N filas de datos. */
function planilla() {
  const mk = (nombre, headerRows, filasDatos) => {
    const filas = [];
    for (let i = 0; i < headerRows; i++) filas.push(['ENCABEZADO_' + nombre]);
    for (let i = 0; i < filasDatos; i++) filas.push(['dato' + i]);
    return {
      nombre, headerRows, filas,
      getLastRow() { return this.filas.length; },
      deleteRows(desde, n) { this.filas.splice(desde - 1, n); },
      getRange() { return { setValues() {}, setValue() {}, getValues: () => [[]], setNumberFormat() {} }; },
      getMaxRows() { return this.filas.length; },
    };
  };
  const hojas = {};
  HOJAS_DATOS.forEach(n => { hojas[n] = mk(n, n.indexOf('EVOLUCIONES') === 0 ? 3 : 1, 5); });
  HOJAS_CONFIG.forEach(n => { hojas[n] = mk(n, 1, 4); });
  hojas.CAMAS_ESTADO = mk('CAMAS_ESTADO', 2, 18);
  return { hojas, getSheetByName(n) { return this.hojas[n] || null; } };
}

function cargar(ss, opciones) {
  opciones = opciones || {};
  const estado = { sembrado: 0, auditado: [], cacheLimpio: false, backups: 0 };
  const FILA_DATOS = {};
  Object.values(ss.hojas).forEach(h => { FILA_DATOS[h.nombre] = h.headerRows + 1; });
  const sandbox = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, flush() {} },
    FILA_DATOS,
    backupDiario: () => {
      estado.backups++;
      if (opciones.backupFalla) return { ok: false, error: 'Drive sin permiso' };
      if (opciones.backupLanza) throw new Error('Drive caído');
      return { ok: true, data: { url: 'https://drive/backup1', nombre: 'RCE_KINE_backup_2026-08-01' } };
    },
    _sembrar: () => { estado.sembrado++; },
    auditar: a => estado.auditado.push(a),
    CacheService: { getScriptCache: () => ({ removeAll() { estado.cacheLimpio = true; } }) },
    console: { log() {}, warn() {}, error() {} },
  };
  const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'v2', 'mantenimiento.gs'), 'utf8');
  const fn = new Function(...Object.keys(sandbox),
    src + '\n;return { resetearBaseDeDatos, resetearBaseDeDatosCONFIRMAR };');
  return { api: fn(...Object.values(sandbox)), estado };
}

const filasDe = (ss, n) => ss.hojas[n].filas.length - ss.hojas[n].headerRows;

/* ── 1 · Simulacro: informa pero NO toca nada ── */
{
  const ss = planilla();
  const { api, estado } = cargar(ss);
  const r = api.resetearBaseDeDatos();
  eq('simulacro responde ok', r.ok && r.simulacro === true, true);
  eq('simulacro cuenta las filas a borrar (14 hojas × 5)', r.filas, 70);
  eq('simulacro NO borra ninguna fila', HOJAS_DATOS.every(n => filasDe(ss, n) === 5), true);
  eq('simulacro NO toca las camas', filasDe(ss, 'CAMAS_ESTADO'), 18);
  eq('simulacro NO genera respaldo ni siembra', estado.backups === 0 && estado.sembrado === 0, true);
}

/* ── 2 · Sin respaldo válido NO se borra nada (todo o nada) ── */
for (const [caso, op] of [['el respaldo falla', { backupFalla: true }], ['el respaldo lanza error', { backupLanza: true }]]) {
  const ss = planilla();
  const { api } = cargar(ss, op);
  const r = api.resetearBaseDeDatosCONFIRMAR();
  eq(`si ${caso}: cancela`, r.ok, false);
  eq(`si ${caso}: no borró nada`, HOJAS_DATOS.every(n => filasDe(ss, n) === 5), true);
  eq(`si ${caso}: explica el motivo`, /respaldo/i.test(r.error), true);
}

/* ── 3 · Reseteo real ── */
{
  const ss = planilla();
  const { api, estado } = cargar(ss);
  const r = api.resetearBaseDeDatosCONFIRMAR();
  eq('reseteo responde ok', r.ok, true);
  eq('respaldo generado ANTES de borrar', estado.backups, 1);
  eq('todas las hojas de datos quedan vacías', HOJAS_DATOS.every(n => filasDe(ss, n) === 0), true);
  eq('los encabezados se conservan', HOJAS_DATOS.every(n => ss.hojas[n].filas.length === ss.hojas[n].headerRows), true);
  eq('la configuración NO se toca', HOJAS_CONFIG.every(n => filasDe(ss, n) === 4), true);
  eq('los ventiladores se borran (se cargan los reales)', filasDe(ss, 'VENTILADORES'), 0);
  eq('la serie histórica de indicadores se conserva', filasDe(ss, 'INDICADORES_HISTORICO'), 4);
  eq('el roster de kinesiólogos se conserva', filasDe(ss, 'KINESIOLOGOS'), 4);
  eq('las camas se vacían y se vuelven a sembrar', filasDe(ss, 'CAMAS_ESTADO') === 0 && estado.sembrado === 1, true);
  eq('se limpia el caché del servidor', estado.cacheLimpio, true);
  eq('queda constancia en la auditoría', estado.auditado.length === 1 && estado.auditado[0].accion === 'RESETEO_INICIAL', true);
  eq('la constancia nombra el respaldo', /RCE_KINE_backup/.test(estado.auditado[0].resumen), true);
  eq('devuelve la URL del respaldo', /^https:/.test(r.respaldo), true);
}

/* ── 4 · Idempotente: repetirlo sobre una base ya vacía no rompe ── */
{
  const ss = planilla();
  const { api } = cargar(ss);
  api.resetearBaseDeDatosCONFIRMAR();
  const r2 = api.resetearBaseDeDatosCONFIRMAR();
  eq('repetir el reseteo no falla', r2.ok, true);
  eq('y no borra de más (encabezados intactos)', HOJAS_DATOS.every(n => ss.hojas[n].filas.length === ss.hojas[n].headerRows), true);
}

/* ── 5 · Coherencia con el esquema: ninguna hoja queda sin clasificar ── */
{
  const esq = fs.readFileSync(path.resolve(__dirname, '..', '..', 'v2', 'esquema.gs'), 'utf8');
  const bloque = esq.match(/const ESQUEMA\s*=\s*{[\s\S]*?\n};/)[0];
  const hojas = [...new Set([...bloque.matchAll(/^ {2}([A-Z_0-9]+):/gm)].map(m => m[1]))];
  const man = fs.readFileSync(path.resolve(__dirname, '..', '..', 'v2', 'mantenimiento.gs'), 'utf8');
  const lista = k => (man.match(new RegExp('const ' + k + ' = \\[([\\s\\S]*?)\\];'))[1].match(/'([A-Z_0-9]+)'/g) || []).map(s => s.replace(/'/g, ''));
  const clasificadas = new Set([...lista('_RESET_VACIAR'), ...lista('_RESET_CONSERVAR'), 'CAMAS_ESTADO']);
  eq('toda hoja del esquema está clasificada (borrar/conservar)', hojas.filter(h => !clasificadas.has(h)).join(',') || 'ninguna sin clasificar', 'ninguna sin clasificar');
  eq('no se clasifican hojas inexistentes', [...clasificadas].filter(h => !hojas.includes(h)).join(',') || 'ninguna', 'ninguna');
}

console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
process.exit(fails.length ? 1 : 0);
