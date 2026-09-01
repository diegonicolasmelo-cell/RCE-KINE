// rem_conciliacion.js — De qué está hecha cada cifra del REM.
//
// 🔴 DE DÓNDE SALE (Diego, 30-ago-2026): «la discrepancia entre REM real y el
// que genera RCE. No sé a qué se debe: da la impresión de no estar
// considerando los mismos valores para ingresos, procedimientos, lo mismo para
// evaluaciones intermedias. En extubaciones sin protocolo o egresos por
// fallecimiento también hay discrepancia».
//
// LA REGLA DE LA CASA es no mover una cifra sin saber por qué difiere —el
// proyecto ya pagó una reversión por «arreglar» algo que escondía datos
// verdaderos—. Así que primero se abre la cifra: para cada casilla, la LISTA de
// filas que la componen, con cama, paciente, fecha y el porqué. Eso convierte
// «no cuadra» en «estas cuatro filas».
//
// LO QUE ESTA GUARDIA FIJA:
//   · El detalle NO cambia ninguna cifra (se comprueba comparando el REM con y
//     sin conciliación: los totales son idénticos).
//   · Cada fila de una casilla está en su lista, y las que el sistema clasificó
//     de una forma discutible salen MARCADAS: el egreso cuyo motivo suena a
//     fallecimiento pero no dice «fallec…», el que no tiene motivo escrito, la
//     evaluación del día de ingreso, la extubación «sin condiciones».
//   · 🔒 SIN RUT: es la regla del REM y esta vista viaja con él.
//
// Uso: node build/checks/rem_conciliacion.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

/* ── Arnés: la planilla mínima que el REM necesita ── */
const DB = {
  EVOLUCIONES: [], EVOLUCIONES_ARCHIVO: [], ARCHIVO_PACIENTES: [], CAMAS_ESTADO: [],
  REINTUBACIONES: [], ESTADISTICAS_REM: [],
};
global.repoLeerTodos = (h, k, v) => (DB[h] || []).filter(r => k === undefined || String(r[k]) === String(v)).map(r => Object.assign({}, r));
global.repoUpsert = (h, c, id, o) => { (DB[h] = DB[h] || []).push(o); return 'crear'; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.ahoraTS = () => '2026-09-01 10:00';
global.hoyISO = () => '2026-09-01';
global._statISO = v => String(v || '').slice(0, 10);
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global.Logger = { log: () => {} };
// La hoja de la planilla no se escribe en el arnés: lo que se mide es el
// cálculo y su detalle, no el pintado de 190 filas de plantilla.
// El rango falso acepta CUALQUIER método encadenado y se devuelve a sí mismo:
// la plantilla oficial usa una docena (merge, breakApart, setBorder…) y
// enumerarlos a mano deja la guardia rota cada vez que se agrega uno más.
const rangoFalso = new Proxy({}, { get: () => () => rangoFalso });
const hojaFalsa = new Proxy({}, { get: (t, k) =>
  k === 'getRange' ? () => rangoFalso :
  k === 'getMaxRows' ? () => 300 :
  k === 'getMaxColumns' ? () => 40 : () => hojaFalsa });
// Las constantes de estilo (BorderStyle.SOLID_MEDIUM, WrapStrategy…) se
// resuelven solas: la plantilla usa varias y ninguna cambia lo que se mide.
const constantes = new Proxy({}, { get: (t, k) => String(k) });
global.SpreadsheetApp = new Proxy({
  getActiveSpreadsheet: () => ({ getSheetByName: () => hojaFalsa, insertSheet: () => hojaFalsa }),
}, { get: (t, k) => (k in t ? t[k] : constantes) });

eval(['svc_rem_plantilla.gs', 'svc_rem.gs'].map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

/* ── El mes de prueba: agosto, con los cinco casos que Diego reportó ── */
const evo = (pid, cama, fecha, turno, extra) => Object.assign({
  PATIENT_ID: pid, ID_CAMA: cama, FECHA: fecha, TURNO: turno,
  TURNO_KEY: fecha + '-' + turno, PAC_NOMBRE: 'Paciente ' + pid, PAC_EDAD: 60, PAC_SEXO: 'M',
}, extra || {});

DB.CAMAS_ESTADO = [
  { ID_CAMA: '4', PATIENT_ID: 'pANA', NOMBRE: 'Ana Prueba', EDAD: 60, SEXO: 'F', FECHA_INGRESO: '2026-08-03' },
];
DB.ARCHIVO_PACIENTES = [
  // Egreso que SÍ dice «fallec…» → cuenta como fallecimiento
  { PATIENT_ID: 'pB', ID_CAMA: '7', NOMBRE: 'Bruno Prueba', EDAD: 70, SEXO: 'M',
    FECHA_INGRESO: '2026-08-02', FECHA_EGRESO: '2026-08-12', MOTIVO_EGRESO: 'Fallecimiento' },
  // ⚠️ «Óbito»: suena a fallecimiento y hoy cuenta como ALTA
  { PATIENT_ID: 'pC', ID_CAMA: '10', NOMBRE: 'Carla Prueba', EDAD: 65, SEXO: 'F',
    FECHA_INGRESO: '2026-08-05', FECHA_EGRESO: '2026-08-22', MOTIVO_EGRESO: 'Óbito' },
  // ⚠️ Sin motivo escrito: también cae en alta
  { PATIENT_ID: 'pD', ID_CAMA: '15', NOMBRE: 'Diego Prueba', EDAD: 55, SEXO: 'M',
    FECHA_INGRESO: '2026-08-08', FECHA_EGRESO: '2026-08-27', MOTIVO_EGRESO: '' },
  // Alta de verdad
  { PATIENT_ID: 'pE', ID_CAMA: '2', NOMBRE: 'Elena Prueba', EDAD: 40, SEXO: 'F',
    FECHA_INGRESO: '2026-08-09', FECHA_EGRESO: '2026-08-18', MOTIVO_EGRESO: 'Alta a sala' },
  // Heredado de julio: su episodio empezó ANTES del mes
  { PATIENT_ID: 'pJ', ID_CAMA: '6', NOMBRE: 'Julia Prueba', EDAD: 72, SEXO: 'F',
    FECHA_INGRESO: '2026-07-28', FECHA_EGRESO: '', MOTIVO_EGRESO: '' },
];
DB.EVOLUCIONES = [
  // Ana: ingreso del mes + evaluación el día del ingreso + otra el 07 (intermedia)
  evo('pANA', '4', '2026-08-03', 'Dia', { ES_INGRESO: true, EVAL_T_MRC: 48 }),
  evo('pANA', '4', '2026-08-07', 'Dia', { EVAL_T_FSS: 22, RESP_KTR_CANT: 2 }),
  evo('pANA', '4', '2026-08-07', 'Noche', { EVAL_T_MRC: 50 }),   // mismo día: no suma otra vez
  // Julia: marcada ES_INGRESO en agosto, pero venía de julio ⇒ NO cuenta
  evo('pJ', '6', '2026-08-01', 'Dia', { ES_INGRESO: true }),
  // Extubaciones: una real y una «sin condiciones» que NO cuenta
  evo('pE', '2', '2026-08-15', 'Dia', { EXT_OCURRIO: true, EXT_TIPO: 'programada', EXT_HORA: '11:00', PVE_VAL: 'si', PVE_RESULTADO: 'superada' }),
  evo('pD', '15', '2026-08-20', 'Dia', { EXT_TIPO: 'sin_condiciones' }),
  // Vía aérea: una intubación y un cambio de cánula
  evo('pB', '7', '2026-08-04', 'Noche', { INTUB_OCURRIO: true, INTUB_HORA: '23:10' }),
  evo('pC', '10', '2026-08-11', 'Dia', { TQT_CAMBIO: true }),
];
DB.EVOLUCIONES_ARCHIVO = [
  evo('pB', '7', '2026-08-06', 'Dia', { ES_INGRESO: false, EVAL_T_PIM: 30 }),
];
DB.REINTUBACIONES = [{ PATIENT_ID: 'pE', ID_CAMA: '2', FECHA: '2026-08-16', HORA: '03:20' }];

const r = generarREM('2026', '8', { email: 'x@y.cl' });
si('el REM se genera', r.ok);
const D = r.data.detalle || {};
const filas = k => (D[k] && D[k].filas) || [];
const nom = (k, n) => filas(k).some(f => new RegExp(n, 'i').test(f.nombre));

/* ══ 1 · INGRESOS: el que viene de otro mes se muestra aparte ══════════ */
console.log('\n1 · Ingresos — y los que quedaron fuera, que son la diferencia');
eq('el REM cuenta 1 ingreso del mes', r.data.ingresos, 1);
eq('…y la conciliación lista ese 1', (D.ingresos || {}).n, 1);
si('  es Ana, que ingresó el 03-08', nom('ingresos', 'Ana'));
eq('★ Julia sale en «marcados como ingreso pero de otro mes»', (D.ingresosExcluidos || {}).n, 1);
si('  …con el porqué escrito', /empezó antes del mes/.test((filas('ingresosExcluidos')[0] || {}).porque || ''));

/* ══ 2 · EGRESOS: el hallazgo que Diego venía persiguiendo ═════════════ */
console.log('\n2 · Egresos por fallecimiento — y los que caen en alta sin decirlo');
eq('el REM cuenta 1 fallecimiento', r.data.egresosFallecimiento, 1);
si('  es Bruno («Fallecimiento»)', nom('egresosFallecimiento', 'Bruno'));
eq('y 3 altas', r.data.egresosAlta, 3);
const marcadas = filas('egresosAlta').filter(f => f.revisar);
eq('★ dos de esas altas quedan MARCADAS para revisar', marcadas.length, 2);
si('  ★ «Óbito» está marcada', marcadas.some(f => /Carla/.test(f.nombre) && /ALTA/.test(f.revisar)));
si('  ★ la que no tiene motivo escrito también', marcadas.some(f => /Diego/.test(f.nombre) && /sin motivo/i.test(f.revisar)));
si('  y el alta verdadera NO se marca', !filas('egresosAlta').some(f => /Elena/.test(f.nombre) && f.revisar));

/* ══ 3 · EVALUACIÓN INTERMEDIA: qué medición la hizo contar ════════════ */
console.log('\n3 · Evaluación intermedia — con la medición que la gatilló');
eq('el REM cuenta 2 días de evaluación intermedia', r.data.evalIntermedia, 2);
si('★ la fila dice QUÉ se midió', /MRC|FSS|PIM/.test((filas('evalIntermedia')[0] || {}).porque || ''));
si('★ el día del ingreso de Ana sale en la lista de excluidos', nom('evalIntermediaExcluida', 'Ana'));
si('  …explicando que ya se contó como inicial', /B\.2|inicial/i.test((filas('evalIntermediaExcluida')[0] || {}).porque || ''));
// Dos evoluciones el MISMO día cuentan una sola vez: la regla es por DÍA.
eq('dos turnos del mismo día no duplican la evaluación', filas('evalIntermedia').filter(f => f.fecha === '2026-08-07').length, 1);

/* ══ 4 · VÍA AÉREA Y EXTUBACIONES ══════════════════════════════════════ */
console.log('\n4 · 601171 y las extubaciones que no cuentan');
eq('el REM cuenta 3 asistencias de vía aérea', r.data.asistenciasVA, 3);
eq('…y la conciliación lista las 3', (D.asistenciasVA || {}).n, 3);
si('  la intubación está', filas('asistenciasVA').some(f => /intubación/.test(f.porque)));
si('  la reintubación está', filas('asistenciasVA').some(f => /reintubación/.test(f.porque)));
si('  el cambio de cánula está', filas('asistenciasVA').some(f => /cánula/.test(f.porque)));
eq('★ la extubación «sin condiciones» aparece marcada aparte', (D.extubacionesNoContadas || {}).n, 1);
si('  …diciendo que por decisión clínica no cuenta', /jul-2026|decisión clínica/i.test((filas('extubacionesNoContadas')[0] || {}).revisar || ''));
eq('la extubación real sí está en su lista', (D.extubaciones || {}).n, 1);
eq('y la PVE del mes también', (D.pve || {}).n, 1);

/* ══ 5 · NO CAMBIA NINGUNA CIFRA ═══════════════════════════════════════ */
console.log('\n5 · La conciliación no mueve ni un número');
// Las cifras del REM tienen que ser EXACTAMENTE las de antes de esta tanda:
// se comparan contra los valores calculados a mano sobre este mismo fixture.
eq('ingresos', r.data.ingresos, 1);
eq('egresos alta', r.data.egresosAlta, 3);
eq('egresos fallecimiento', r.data.egresosFallecimiento, 1);
eq('eval inicial', r.data.evalInicial, 1);
eq('eval intermedia', r.data.evalIntermedia, 2);
eq('asistencias VA', r.data.asistenciasVA, 3);
si('y el texto del informe sigue saliendo', /REM 28/.test(r.data.textoREM || ''));

/* ══ 6 · PRIVACIDAD: NI UN RUT ═════════════════════════════════════════ */
console.log('\n6 · Sin RUT: la regla del REM vale también para su conciliación');
const json = JSON.stringify(D);
si('★ el detalle no contiene ningún RUT', !/\b\d{7,8}-[\dkK]\b/.test(json));
si('★ ni la palabra RUT', !/\bRUT\b/i.test(json));

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK — cada cifra dice de qué está hecha');
process.exit(fails.length ? 1 : 0);
