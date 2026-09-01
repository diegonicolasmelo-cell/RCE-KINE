/**
 * rem_mes_transicion.js — Guardia del mes de transición del REM 28.
 *
 * EL CASO REAL (agosto 2026): al arrancar el sistema el 1-ago, el censo de la
 * unidad se cargó marcando ES_INGRESO a pacientes que ya estaban hospitalizados
 * desde julio. Julio ya los había reportado como ingresos en la planilla, así
 * que contarlos otra vez en agosto es doble conteo entre meses.
 * Medido el 25-ago por gviz: de 72 eventos ES_INGRESO en agosto, 12 pertenecen
 * a episodios que empezaron antes del 1-ago (DIA_ESTADIA ≥ 1 en la fila misma).
 *
 * LA REGLA: un ES_INGRESO cuenta como ingreso del mes solo si la FECHA_INGRESO
 * real del episodio (ficha del archivo → cama) cae dentro del mes. Si no se
 * conoce ninguna fecha de ingreso, SÍ cuenta: se excluye solo con evidencia, para
 * que una ficha incompleta nunca haga desaparecer un ingreso verdadero.
 *
 * EL LADO SIMÉTRICO, que es lo que esta guardia cuida de verdad: al heredado se
 * le deja de contar el INGRESO, pero sus atenciones, evaluaciones y sesiones de
 * agosto siguen siendo suyas y tienen que seguir apareciendo. Perderlas sería
 * cambiar un número inflado por uno mutilado.
 */
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');

// ── Stubs de infraestructura (mismos que rem.js) ──
const DB = {};
global.repoLeerTodos = h => (DB[h] || []).slice();
global.repoUpsert = (h, k, v, fila) => { global._upsert = { h, k, v, fila }; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.ahoraTS = () => '2026-09-01 08:00';
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO' };
let matrizEscrita = null;
const rangoStub = () => ({
  setValues(v){ if (v.length > 100) matrizEscrita = { v }; return this; },
  setValue(){ return this; }, setBackgrounds(){ return this; },
  setFontWeights(){ return this; }, setFontColors(){ return this; },
  setFontFamilies(){ return this; }, setFontSizes(){ return this; },
  setHorizontalAlignments(){ return this; }, setWraps(){ return this; },
  setBackground(){ return this; }, setFontWeight(){ return this; }, setFontColor(){ return this; },
  breakApart(){ return this; }, merge(){ return this; }, setBorder(){ return this; },
});
global.SpreadsheetApp = { BorderStyle: { SOLID_MEDIUM: 'SM', DOUBLE: 'DBL' },
  getActiveSpreadsheet: () => ({
    getSheetByName: () => null,
    insertSheet: () => ({
      clear(){}, clearContents(){}, getMaxColumns: () => 40, getMaxRows: () => 1000,
      insertColumnsAfter(){}, insertRowsAfter(){}, setFrozenRows(){}, setColumnWidth(){},
      setRowHeights(){}, getRange: () => rangoStub(),
    }),
  })};

eval(['svc_stats.gs', 'svc_rem_plantilla.gs', 'svc_rem.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

// ── Fixture: el 1-ago se marcó ES_INGRESO a todo el censo ──
const HEREDADO_ARCH = 'pa';   // venía del 25-jul, egresa en agosto → NO es ingreso de agosto
const HEREDADO_VIVO = 'pb';   // venía del 28-jul, sigue en cama    → NO es ingreso de agosto
const REAL_VIVO     = 'pc';   // ingresó el 5-ago                   → SÍ
const REAL_ARCH     = 'pd';   // ingresó el 10-ago, ya egresó       → SÍ
const SIN_FICHA     = 'pe';   // sin FECHA_INGRESO en ningún lado   → SÍ (no se excluye sin evidencia)

DB.CAMAS_ESTADO = [
  { PATIENT_ID: HEREDADO_VIVO, EDAD: 70, SEXO: 'M', DIAG_REM: 'ACV', OCUPADA: true, FECHA_INGRESO: '2026-07-28' },
  { PATIENT_ID: REAL_VIVO,     EDAD: 45, SEXO: 'M', DIAG_REM: 'ACV', OCUPADA: true, FECHA_INGRESO: '2026-08-05' },
  { PATIENT_ID: SIN_FICHA,     EDAD: 50, SEXO: 'F', DIAG_REM: 'ACV', OCUPADA: true },
];
DB.ARCHIVO_PACIENTES = [
  { PATIENT_ID: HEREDADO_ARCH, EDAD: 65, SEXO: 'M', DIAG_REM: 'ACV',
    FECHA_INGRESO: '2026-07-25', FECHA_EGRESO: '2026-08-20', MOTIVO_EGRESO: 'Traslado a sala' },
  { PATIENT_ID: REAL_ARCH, EDAD: 55, SEXO: 'F', DIAG_REM: 'ACV',
    FECHA_INGRESO: '2026-08-10', FECHA_EGRESO: '2026-08-22', MOTIVO_EGRESO: 'Traslado a sala' },
];
DB.EVOLUCIONES = [
  // El heredado vivo: marcado como ingreso el 1-ago por el arranque…
  { PATIENT_ID: HEREDADO_VIVO, FECHA: '2026-08-01', TURNO_KEY: '2026-08-01-Dia', ES_INGRESO: true,
    DIA_ESTADIA: 4, RESP_KTR_CANT: 2, EVAL_T_MRC: '40' },
  // …y con atención propia de agosto, que NO se puede perder.
  { PATIENT_ID: HEREDADO_VIVO, FECHA: '2026-08-02', TURNO_KEY: '2026-08-02-Dia',
    DIA_ESTADIA: 5, RESP_KTR_CANT: 3, EVAL_T_FSS: '28' },
  { PATIENT_ID: REAL_VIVO, FECHA: '2026-08-05', TURNO_KEY: '2026-08-05-Dia', ES_INGRESO: true,
    DIA_ESTADIA: 0, RESP_KTR_CANT: 1 },
  { PATIENT_ID: SIN_FICHA, FECHA: '2026-08-12', TURNO_KEY: '2026-08-12-Dia', ES_INGRESO: true,
    DIA_ESTADIA: 0, RESP_KTR_CANT: 1 },
];
DB.EVOLUCIONES_ARCHIVO = [
  { PATIENT_ID: HEREDADO_ARCH, FECHA: '2026-08-01', TURNO_KEY: '2026-08-01-Dia', ES_INGRESO: true,
    DIA_ESTADIA: 7, RESP_KTR_CANT: 2 },
  { PATIENT_ID: REAL_ARCH, FECHA: '2026-08-10', TURNO_KEY: '2026-08-10-Dia', ES_INGRESO: true,
    DIA_ESTADIA: 0, RESP_KTR_CANT: 1 },
];
DB.REINTUBACIONES = [];

const r = generarREM('2026', '8', { email: 'x@y.cl' });
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + g + (okk ? '' : ' (esperado ' + w + ')')); if (!okk) fails.push(l); };

eq('genera ok', r.ok, true);
const d = r.data || {};

console.log('\n── Lo que la corrección quita ──');
eq('ingresos del mes: 3 reales, no los 5 eventos ES_INGRESO', d.ingresos, 3);
eq('B.2 evaluación inicial sigue igualada a los ingresos', d.evalInicial, 3);

console.log('\n── El lado simétrico: al heredado no se le pierde nada de agosto ──');
eq('sesiones KTR completas (2+3 del heredado vivo + 1 + 1 + 2 del heredado arch. + 1)', d.sumKTR, 10);
eq('B.3: los 2 días evaluados del heredado vivo siguen contando', d.evalIntermedia, 2);
eq('egresos por alta: los 2 de agosto, herede o no', d.egresosAlta, 2);

console.log('\n── La casilla impresa y los códigos que arrastran nIngresos ──');
const celda = (fila, col) => matrizEscrita.v[fila - 24][col - 1];
eq('D27 Total ingresos', celda(27, 4), 3);
eq('D28 Ingresos con PTI', celda(28, 4), 3);
eq('B.2 Kinesiólogo D67', celda(67, 4), 3);
eq('código 601101 (fila 129)', celda(129, 5), 3);
eq('código 601104 (fila 131)', celda(131, 5), 3);
eq('código 601024 (fila 165)', celda(165, 5), 3);
eq('código 601030 (fila 168)', celda(168, 5), 3);

console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS' : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
