/**
 * rem.js — Guardia del generador REM 28 (svc_rem.gs) con planilla simulada.
 * Fixture calculado a mano: verifica ingresos/egresos por sexo-edad-diagnóstico,
 * eval intermedia (1 por día, excluye día de ingreso), sesiones KTR+KTM_CANT,
 * PTO (solo 1ª bipedestación del EPISODIO, aunque venga del archivo),
 * inicios de VMNI por transición y asistencias de vía aérea.
 */
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');

// ── Stubs de infraestructura ──
const DB = {};
global.repoLeerTodos = h => (DB[h] || []).slice();
global.repoUpsert = (h, k, v, fila) => { global._upsert = { h, k, v, fila }; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.ahoraTS = () => '2026-08-01 08:00';
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO' };
const escrituras = [];
global.SpreadsheetApp = { getActiveSpreadsheet: () => ({
  getSheetByName: () => null,
  insertSheet: () => ({
    clearContents(){}, getMaxColumns: () => 40, insertColumnsAfter(){}, setFrozenRows(){},
    getRange: (r, c, nr, nc) => ({ setValues: v => escrituras.push({ nr, nc, v }) }),
  }),
})};

eval(fs.readFileSync(path.join(v2, 'svc_stats.gs'), 'utf8'));   // _statISO
eval(fs.readFileSync(path.join(v2, 'svc_rem.gs'), 'utf8'));

// ── Fixture ──
const P1 = 'p1', P2 = 'p2', P3 = 'p3';
DB.CAMAS_ESTADO = [{ PATIENT_ID: P1, EDAD: 45, SEXO: 'M', DIAG_REM: 'ACV', OCUPADA: true }];
DB.ARCHIVO_PACIENTES = [
  { PATIENT_ID: P2, EDAD: 82, SEXO: 'F', DIAG_REM: '', FECHA_EGRESO: '2026-07-10', MOTIVO_EGRESO: 'Traslado a sala' },
  { PATIENT_ID: P3, EDAD: 60, SEXO: 'M', DIAG_REM: 'COVID-19', FECHA_EGRESO: '2026-07-20', MOTIVO_EGRESO: 'Fallecimiento' },
];
DB.EVOLUCIONES = [
  { PATIENT_ID: P1, FECHA: '2026-07-02', TURNO_KEY: '2026-07-02-Dia', ES_INGRESO: true,
    KTM_REALIZADA: true, KTM_NIVEL_KTR: '2', KTM_CANT: '1', RESP_KTR_CANT: 2, EVAL_T_MRC: '40', VENT_SOPORTE: 'VM' },
  { PATIENT_ID: P1, FECHA: '2026-07-03', TURNO_KEY: '2026-07-03-Dia',
    KTM_REALIZADA: true, KTM_NIVEL_KTR: '4', RESP_KTR_CANT: 3, EVAL_T_FSS: '28',
    KTM_EMS: true, EDU_REALIZADA: true, KTM_IMT: true, VENT_SOPORTE: 'VM' },
  { PATIENT_ID: P1, FECHA: '2026-07-03', TURNO_KEY: '2026-07-03-Noche',
    KTM_REALIZADA: true, KTM_NIVEL_KTR: '4', KTM_CANT: '2', RESP_KTR_CANT: 1, EVAL_T_PIM: '30', VENT_SOPORTE: 'VMNI' },
  { PATIENT_ID: P1, FECHA: '2026-07-04', TURNO_KEY: '2026-07-04-Dia',
    KTM_REALIZADA: true, KTM_NIVEL_KTR: '5', TQT_CAMBIO: true, INTUB_OCURRIO: true },
];
DB.EVOLUCIONES_ARCHIVO = [
  { PATIENT_ID: P2, FECHA: '2026-06-28', TURNO_KEY: '2026-06-28-Dia', ES_INGRESO: true, PAC_EDAD: 82, PAC_SEXO: 'F' },
  { PATIENT_ID: P2, FECHA: '2026-06-30', TURNO_KEY: '2026-06-30-Dia', KTM_REALIZADA: true, KTM_NIVEL_KTR: '4' },
  { PATIENT_ID: P2, FECHA: '2026-07-01', TURNO_KEY: '2026-07-01-Dia', KTM_REALIZADA: true, KTM_NIVEL_KTR: '4', RESP_KTR_CANT: 2 },
];
DB.REINTUBACIONES = [{ PATIENT_ID: P1, FECHA: '2026-07-05' }];

const r = generarREM('2026', '7', { email: 'x@y.cl' });
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + g + (okk ? '' : ' (esperado ' + w + ')')); if (!okk) fails.push(l); };

eq('genera ok', r.ok, true);
const d = r.data || {};
eq('ingresos del mes (P1; P2 ingresó en junio)', d.ingresos, 1);
eq('egresos por alta (P2, traslado cuenta)', d.egresosAlta, 1);
eq('egresos por fallecimiento (P3)', d.egresosFallecimiento, 1);
eq('eval inicial = ingresos', d.evalInicial, 1);
eq('eval intermedia: 1 día (03-jul; ingreso excluido, noche no duplica)', d.evalIntermedia, 1);
eq('KTR sumadas (2+3+1 de P1 + 2 de P2 archivada)', d.sumKTR, 8);
eq('KTM sumadas (1+1+2+1 P1 + 1 P2)', d.sumKTM, 6);
eq('sesiones totales KTR+KTM', d.sesiones, 14);
eq('B.6 EMS', d.turnosEMS, 1);
eq('B.6 educación', d.turnosEdu, 1);
eq('turnos IMT', d.turnosIMT, 1);
eq('PTO: solo P1 (la 1ª bipedestación de P2 fue en junio)', d.pto, 1);
eq('asistencias VA (1 IOT + 1 reintub + 1 inicio VMNI + 1 cánula)', d.asistenciasVA, 4);
eq('hoja escrita con filas', escrituras.length >= 1 && escrituras[0].v.length > 30, true);
eq('upsert mensual guardado', global._upsert && global._upsert.v, '2026-07');

console.log(fails.length ? '❌ ' + fails.length + ' FALLOS' : '✅ TODO OK');
process.exit(fails.length ? 1 : 0);
