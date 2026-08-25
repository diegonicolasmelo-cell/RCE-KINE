/**
 * rem.js — Guardia del generador REM 28 (svc_rem.gs) con planilla simulada.
 * Fixture calculado a mano: verifica ingresos/egresos por sexo-edad-diagnóstico,
 * eval intermedia (1 por día, excluye día de ingreso), sesiones KTR+KTM_CANT,
 * PTO (solo 1ª bipedestación del EPISODIO, aunque venga del archivo),
 * inicios de VNI por transición (el catálogo guarda 'VNI', no 'VMNI') y asistencias de vía aérea.
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
const escrituras = []; let matrizEscrita = null, fondosEscritos = null, fuentesEscritas = null,
  tamanosEscritos = null, coloresLetra = null, mergesHechos = 0, bordesAplicados = 0, tramosAltura = 0;
const rangoStub = (fila, col) => ({
  setValues(v){ escrituras.push({ fila, col, v }); if (v.length > 100) matrizEscrita = { fila, col, v }; return this; },
  setValue(){ return this; }, setBackgrounds(m){ fondosEscritos = m; return this; },
  setFontWeights(){ return this; }, setFontColors(m){ coloresLetra = m; return this; },
  setFontFamilies(m){ fuentesEscritas = m; return this; }, setFontSizes(m){ tamanosEscritos = m; return this; },
  setHorizontalAlignments(){ return this; }, setWraps(){ return this; },
  setBackground(){ return this; }, setFontWeight(){ return this; }, setFontColor(){ return this; },
  breakApart(){ return this; }, merge(){ mergesHechos++; return this; },
  setBorder(){ bordesAplicados++; return this; },
});
global.SpreadsheetApp = { BorderStyle: { SOLID_MEDIUM: 'SM', DOUBLE: 'DBL' },
  getActiveSpreadsheet: () => ({
  getSheetByName: () => null,
  insertSheet: () => ({
    clear(){}, clearContents(){}, getMaxColumns: () => 40, getMaxRows: () => 1000,
    insertColumnsAfter(){}, insertRowsAfter(){}, setFrozenRows(){}, setColumnWidth(){},
    setRowHeights(){ tramosAltura++; }, getRange: (r, c) => rangoStub(r, c),
  }),
})};

// Un solo eval: en GAS los archivos comparten ámbito global (los const de un
// eval separado no se verían desde el siguiente).
eval(['svc_stats.gs', 'svc_rem_plantilla.gs', 'svc_rem.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

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
    KTM_REALIZADA: true, KTM_NIVEL_KTR: '4', KTM_CANT: '2', RESP_KTR_CANT: 1, EVAL_T_PIM: '30', VENT_SOPORTE: 'VNI' },
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
eq('asistencias VA (1 IOT + 1 reintub + 1 inicio VNI + 1 cánula)', d.asistenciasVA, 4);
// ── Copia exacta del formulario, desplazada para comenzar en la fila 4 ──
eq('el informe comienza en la fila 4', matrizEscrita && matrizEscrita.fila, 4);
const celda = (fila, col) => matrizEscrita.v[fila - 24][col - 1];   // fila = numeración del Excel original
eq('D27 Total ingresos', celda(27, 4), 1);
eq('D28 Ingresos con PTI (= total, atención cerrada)', celda(28, 4), 1);
eq('fila ACV (29): D=1 y rango 45-49 Hombres (col 19)', celda(29, 4) + '/' + celda(29, 19), '1/1');
eq('AJ27 atención Cerrado = total', celda(27, 36), 1);
eq('D57 Egresos por alta (traslado de P2)', celda(57, 4), 1);
eq('D59 Egresos por fallecimiento', celda(59, 4), 1);
eq('B.2 Kinesiólogo D67 = ingresos', celda(67, 4), 1);
eq('B.3 Kinesiólogo D79 = 1 día evaluado', celda(79, 4), 1);
eq('B.4 Kinesiólogo D90 = 14 sesiones', celda(90, 4), 14);
eq('B.4 col Y (UPC) = 14', celda(90, 25), 14);
eq('B.6 Ejercicios terapéuticos D100 = KTM', celda(100, 4), 6);
eq('B.6 Terapia respiratoria D120 = KTR+IMT', celda(120, 4), 9);
eq('código 601101 fila 129: E=F=G=J', [celda(129,5),celda(129,6),celda(129,7),celda(129,10)].join(','), '1,1,1,1');
eq('código 102501 fila 174: E=turnos IMT, F=pacientes', celda(174,5) + '/' + celda(174,6), '1/1');
eq('código 601171 fila 170: E=4 asistencias VA', celda(170, 5), 4);
eq('texto de una casilla del formulario intacto (C30 TEC)', celda(30, 3), 'Traumatismo encéfalo craneano (TEC)');
eq('fondos aplicados (matriz misma dimensión)', fondosEscritos && fondosEscritos.length === matrizEscrita.v.length, true);
eq('tipografías por celda aplicadas', fuentesEscritas && fuentesEscritas.length === matrizEscrita.v.length, true);
eq('tamaños de letra aplicados', tamanosEscritos && tamanosEscritos[0].length === 37, true);
eq('color de letra azul del original presente', coloresLetra && coloresLetra.some(f => f.some(c => c === '#0070c0')), true);
eq('tipografía del original (Verdana en etiquetas)', fuentesEscritas && fuentesEscritas.some(f => f.indexOf('Verdana') >= 0), true);
eq('bordes aplicados (147 rectángulos del original)', bordesAplicados, 147);
eq('alturas de fila aplicadas por tramos', tramosAltura > 0, true);
eq('merges del original aplicados (43)', mergesHechos, 43);
eq('upsert mensual guardado', global._upsert && global._upsert.v, '2026-07');

console.log(fails.length ? '❌ ' + fails.length + ' FALLOS' : '✅ TODO OK');
process.exit(fails.length ? 1 : 0);
