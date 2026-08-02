// cierre_anio.js — Guardia del CIERRE DE AÑO (v5.22, pedido de Diego
// ago-2026): trasladar el historial del año a una planilla aparte «dejando a
// los pacientes que están que completen su estadía y así no perder su
// historial». Reglas duras:
//   · Se mueve por EPISODIO EGRESADO (historia completa del paciente), no por
//     fecha suelta: quien ingresó en diciembre y egresó en enero viaja entero
//     en el cierre del año en que se fue.
//   · Los pacientes HOSPITALIZADOS no se tocan jamás.
//   · El resumen del egreso (ARCHIVO_PACIENTES) se queda: indicadores, REM y
//     detección de reingresos siguen funcionando.
//   · Sin respaldo previo no se mueve nada, y solo se borra tras verificar
//     que la copia quedó completa.
// Uso: node build/checks/cierre_anio.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

const DB = { CAMAS_ESTADO: [], ARCHIVO_PACIENTES: [], EVOLUCIONES: [], EVOLUCIONES_ARCHIVO: [], AUDIT_LOG: [] };
const CFG = {};
global.repoLeerTodos = (h, c, val) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(val)); return f; };
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoActualizar = () => true; global.repoActualizarDonde = () => 0;
global.repoEliminarDonde = (h, fn) => { const antes = (DB[h] || []).length; DB[h] = (DB[h] || []).filter(r => !fn(r)); return antes - DB[h].length; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => (CFG[k] !== undefined ? CFG[k] : d);
global.escribirConfig = (k, v) => { CFG[k] = v; };
global.hoyISO = () => HOY;
global.ahoraTS = () => HOY + ' 10:00:00';
global._statISO = f => String(f || '').slice(0, 10);
global.auditar = o => DB.AUDIT_LOG.push(o);
global.TOTAL_COLS = { EVOLUCIONES: 379, EVOLUCIONES_ARCHIVO: 379 };
global.ESQUEMA = { EVOLUCIONES_ARCHIVO: { cols: [['ID_EVOLUCION'], ['PATIENT_ID'], ['FECHA'], ['PAC_NOMBRE']] } };
global.ok = d => ({ ok: true, data: d }); global.err = m => ({ ok: false, error: m });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global.Utilities = { formatDate: () => '2027-01-05_10-00' };
// Planilla histórica simulada
const HOJA = { filas: [], getLastRow() { return this.filas.length ? this.filas.length + 1 : 1; },
  getRange(f, c, nf, nc) { const self = this; return { setValues(vals) { vals.forEach((v, i) => { self.filas[f - 2 + i] = v; }); } }; },
  setName() { return this; } };
let creada = 0;
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getId: () => 'ID_TRABAJO' }),
  create: (n) => { creada++; return { getId: () => 'ID_HIST', getName: () => n, getUrl: () => 'https://hist', getSheetByName: () => HOJA, getSheets: () => [HOJA] }; },
  openById: () => ({ getId: () => 'ID_HIST', getName: () => 'RCE-KINE — Histórico 2026', getUrl: () => 'https://hist', getSheetByName: () => HOJA, getSheets: () => [HOJA] }),
  flush: () => {},
};
global.DriveApp = { getFileById: () => ({ makeCopy: () => ({ getName: () => 'b', getId: () => 'x', getUrl: () => 'u' }), moveTo: () => {} }) };
let BACKUP_OK = true;
global.backupDiario = () => (BACKUP_OK ? ok({ nombre: 'respaldo' }) : err('sin permiso'));
global._obtenerCarpetaBackup = () => ({ getUrl: () => 'c' });
let HOY = '2027-01-05';
const mant = fs.readFileSync(path.join(v2, 'mantenimiento.gs'), 'utf8');
eval(mant.slice(mant.indexOf('//  CIERRE DE AÑO')));

/* ── Escenario: cierre de 2026 con un paciente aún hospitalizado ── */
function sembrar() {
  DB.ARCHIVO_PACIENTES = [
    { PATIENT_ID: 'pA', NOMBRE: 'Egresó en marzo', FECHA_INGRESO: '2026-03-01', FECHA_EGRESO: '2026-03-10' },
    { PATIENT_ID: 'pB', NOMBRE: 'Ingresó en dic y egresó en enero', FECHA_INGRESO: '2026-12-28', FECHA_EGRESO: '2027-01-04' },
    { PATIENT_ID: 'pC', NOMBRE: 'Egresó en noviembre', FECHA_INGRESO: '2026-11-01', FECHA_EGRESO: '2026-11-20' },
  ];
  DB.EVOLUCIONES_ARCHIVO = [
    { ID_EVOLUCION: 'a1', PATIENT_ID: 'pA', FECHA: '2026-03-01', PAC_NOMBRE: 'Egresó en marzo' },
    { ID_EVOLUCION: 'a2', PATIENT_ID: 'pA', FECHA: '2026-03-02', PAC_NOMBRE: 'Egresó en marzo' },
    { ID_EVOLUCION: 'c1', PATIENT_ID: 'pC', FECHA: '2026-11-02', PAC_NOMBRE: 'Egresó en noviembre' },
    // El que cruzó el año: sus evoluciones son de DICIEMBRE 2026 pero egresó en 2027
    { ID_EVOLUCION: 'b1', PATIENT_ID: 'pB', FECHA: '2026-12-28', PAC_NOMBRE: 'Cruza el año' },
    { ID_EVOLUCION: 'b2', PATIENT_ID: 'pB', FECHA: '2027-01-02', PAC_NOMBRE: 'Cruza el año' },
  ];
  // Paciente todavía en la unidad, ingresado en diciembre de 2026
  DB.CAMAS_ESTADO = [{ ID_CAMA: '5', OCUPADA: 'TRUE', PATIENT_ID: 'pD', NOMBRE: 'Sigue hospitalizado', FECHA_INGRESO: '2026-12-20' }];
  DB.EVOLUCIONES = [{ ID_EVOLUCION: 'd1', PATIENT_ID: 'pD', FECHA: '2026-12-20' }];
  HOJA.filas = [];
}
sembrar();

/* 1 · Simulacro: informa y NO toca nada */
const antesEvos = DB.EVOLUCIONES_ARCHIVO.length;
const sim = archivarAnioHistorico(2026);
eq('el simulacro cuenta los egresos del año', sim.egresados, 2);
eq('…y sus evoluciones (las del que cruza el año NO entran)', sim.evoluciones, 3);
eq('…informa cuántos siguen hospitalizados', sim.hospitalizados, 1);
eq('el simulacro no movió nada', DB.EVOLUCIONES_ARCHIVO.length, antesEvos);
eq('ni creó planilla histórica', creada, 0);

/* 2 · Sin respaldo NO se mueve nada */
BACKUP_OK = false;
const fallo = archivarAnioHistoricoCONFIRMAR(2026);
eq('sin respaldo el traslado se cancela', fallo.error, 'respaldo');
eq('…y la planilla de trabajo queda intacta', DB.EVOLUCIONES_ARCHIVO.length, antesEvos);
BACKUP_OK = true;

/* 3 · Traslado real */
const r = archivarAnioHistoricoCONFIRMAR(2026);
eq('traslada las evoluciones de los egresados de 2026', r.movidas, 3);
eq('la planilla histórica recibió esas filas', HOJA.filas.length, 3);
eq('quedan solo las del paciente que cruzó el año', DB.EVOLUCIONES_ARCHIVO.length, 2);
eq('…y son las suyas (historia completa, sin partir)',
  DB.EVOLUCIONES_ARCHIVO.every(e => e.PATIENT_ID === 'pB'), true);
eq('el PACIENTE HOSPITALIZADO no se tocó', DB.EVOLUCIONES.length, 1);
eq('el resumen de los egresos se queda (REM, indicadores, reingresos)', DB.ARCHIVO_PACIENTES.length, 3);
eq('queda constancia en la auditoría', DB.AUDIT_LOG.some(a => a.accion === 'CIERRE_ANIO'), true);
eq('y el cierre queda marcado en la configuración', !!CFG['CIERRE_2026'], true);

/* 4 · Repetirlo no duplica ni rompe */
const r2 = archivarAnioHistoricoCONFIRMAR(2026);
eq('correrlo de nuevo no mueve nada', r2.movidas, 0);
eq('…y la histórica no se duplica', HOJA.filas.length, 3);

/* 5 · Aviso automático de cierre */
CFG['CIERRE_2026'] = '';   // como si aún no se hubiera hecho
sembrar();
HOY = '2026-08-15';
eq('en agosto NO molesta con el aviso', avisoCierreAnio(), null);
HOY = '2026-12-26';
let av = avisoCierreAnio();
eq('el 26 de diciembre avisa del año en curso', av && av.anio, 2026);
eq('…con las evoluciones que se trasladarían', av && av.evoluciones, 3);
eq('…y cuántos pacientes siguen hospitalizados', av && av.hospitalizados, 1);
HOY = '2027-01-05';
av = avisoCierreAnio();
eq('en enero avisa del año anterior', av && av.anio, 2026);
CFG['CIERRE_2026'] = '2027-01-05 10:00:00';
eq('una vez hecho el cierre, el aviso desaparece', avisoCierreAnio(), null);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
