// dias_soporte.js — DÍAS DE SOPORTE POR TRAMOS: acumulados y sin solaparse.
//
// HALLAZGO DE DIEGO (4-ago-2026), con la historia real de María del Carmen
// (cama 3 → trasladada a la 7): ingresa intubada el 22-jul, se extuba con
// protocolo A VNI el 23, se reintuba el 25, y el 30 una extubación ACCIDENTAL
// la deja en VNI hasta hoy. Su estadística manual sumaba VM 8 + VNI 7 = 15
// días en una estadía de 13: el día de cada transición se contaba PARA LOS
// DOS soportes («días falsos»). Y Ricardo Flores egresó con más días de VM
// que de estadía por el mismo defecto en el archivo.
//
// LA REGLA: cada TRAMO aporta diasEntre(inicio, fin). El día de la transición
// pertenece al soporte SALIENTE (el turno que extuba aún estuvo ventilado) y
// es el Día 0 del entrante. Los tramos consecutivos SUMAN EXACTO la estadía:
// imposible el día doble, imposible el día perdido. Y una reintubación NO
// reinicia la cuenta: los tramos anteriores se acumulan.
//
// Uso: node build/checks/dias_soporte.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

const DB = { CAMAS_ESTADO: [], EVOLUCIONES: [], TIMELINE: [], PROCEDIMIENTOS: [], REINTUBACIONES: [], ARCHIVO_PACIENTES: [] };
global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoActualizar = (h, c, id, ch) => { const r = global.repoBuscarPorId(h, c, id); if (r) Object.assign(r, ch); return !!r; };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoEliminarDonde = () => {}; global.repoActualizarDonde = () => {};
global.repoUpsert = (h, c, id, o) => { const r = global.repoBuscarPorId(h, c, id); if (r) { Object.assign(r, o); return 'actualizar'; } global.repoInsertar(h, o); return 'crear'; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d; global.conLock = fn => fn();
let _n = 0; global.uid = p => p + '_' + (++_n);
let AHORA = { fecha: '2026-08-04', hora: '10:00' };
global.hoyISO = () => AHORA.fecha;
global.ahoraTS = () => AHORA.fecha + ' ' + AHORA.hora + ':00';
global._tz = () => 'America/Santiago';
global.Utilities = { getUuid: () => 'u' + (++_n), formatDate: (d, tz, f) =>
  f === 'HH:mm' ? AHORA.hora : (String(f).indexOf('HH') > -1 ? AHORA.fecha + ' ' + AHORA.hora + ':00' : AHORA.fecha) };
global.SpreadsheetApp = { flush: () => {} };
global.validarPayloadEvolucion = () => []; global.validarPayloadIngreso = () => [];
global.generarCodPaciente = () => 'PAC'; global._codUnico = c => c; global._rutNormal = r => String(r || '');
global._agregarHitoInterno = () => {}; global._guardarProcedimientosInterno = () => {}; global._timelineDelGuardado = () => '[]';
// Primitivas de la Ola 4 (guardado con menos viajes): filas vivas del arnés
// (fila = indice + 2), reemplazo completo conservando la identidad del objeto.
global.repoBuscarFila = (h, c, id) => { const i = (DB[h] || []).findIndex(r => String(r[c]) === String(id)); return i === -1 ? -1 : i + 2; };
global.repoLeerFila = (h, f2) => Object.assign({}, DB[h][f2 - 2]);
const _reemplazarFila = (h, f2, o) => { const r = DB[h][f2 - 2]; Object.keys(r).forEach(k => delete r[k]); Object.assign(r, o); };
global.repoUpsertEnFila = (h, f2, o) => { if (f2 === -1) { global.repoInsertar(h, o); return 'crear'; } _reemplazarFila(h, f2, o); return 'actualizar'; };
global.repoEscribirFila = (h, f2, o) => _reemplazarFila(h, f2, o);
global.repoLeerTodosConFila = h => (DB[h] || []).map((r, i) => ({ obj: Object.assign({}, r), fila: i + 2 }));
global.repoEliminarFilas = (h, fl) => { (fl || []).map(f2 => f2 - 2).sort((a, b) => b - a).forEach(i => DB[h].splice(i, 1)); return (fl || []).length; };
global.repoEliminarPorCols = (h, cs, pred) => { const a = (DB[h] || []).length; DB[h] = (DB[h] || []).filter(r => { const o = {}; cs.forEach(c => { o[c] = r[c]; }); return !pred(o); }); return a - DB[h].length; };
global.repoInsertarVarios = (h, os) => { (os || []).forEach(o => (DB[h] = DB[h] || []).push(o)); return (os || []).length; };
global._registrarReintubacion = () => {}; global.calcularPI = () => 60; global.calcularRespiratorio = () => ({});
global.auditar = () => {}; global.Logger = { log: () => {} };
global.ok = d => ({ ok: true, data: d }); global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE' };
eval(['infra_fechas.gs', 'dominio_texto.gs', 'svc_stats.gs', 'svc_camas.gs', 'svc_evoluciones.gs', 'mantenimiento_manuel.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

const guardar = (idCama, tk, campos) => guardarEvolucion(
  Object.assign({ ID_CAMA: idCama, TURNO_KEY: tk, PLAN_FIRMA_KINE: 'DMV', PAC_NOMBRE: 'X' }, campos),
  { firma: 'DMV', email: 'x@y' });
const evo = tk => DB.EVOLUCIONES.find(e => String(e.TURNO_KEY) === tk);

/* ══ 1 · LA HISTORIA DE MARÍA DEL CARMEN, TURNO A TURNO ═════════════════ */
console.log('\n1 · María del Carmen: dos tramos de VM y dos de VNI');
DB.CAMAS_ESTADO = [{ ID_CAMA: '7', OCUPADA: 'TRUE', PATIENT_ID: 'pM', NOMBRE: 'Maria del Carmen',
  FECHA_INGRESO: '2026-07-22', FECHA_INICIO_VA: '2026-07-22', FECHA_INICIO_SOPORTE: '2026-07-22',
  VIA_AEREA: 'TOT', SOPORTE: 'VM' }];
const sync = (va, sop, fVa, fSop) => Object.assign(DB.CAMAS_ESTADO[0],
  { VIA_AEREA: va, SOPORTE: sop, FECHA_INICIO_VA: fVa, FECHA_INICIO_SOPORTE: fSop });

// 22-jul: ingresa intubada, en VM
AHORA = { fecha: '2026-07-22', hora: '16:00' };
guardar('7', '2026-07-22-Dia', { VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM' });
eq('22-jul (ingresa intubada): VM Día 0', evo('2026-07-22-Dia').DIAS_VM, 0);

// 23-jul: se extuba CON PROTOCOLO a VNI (el turno de la extubación aún estuvo en VM)
AHORA = { fecha: '2026-07-23', hora: '16:00' };
guardar('7', '2026-07-23-Dia', { VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM',
  EXT_OCURRIO: true, VENT_VIA_AEREA_FINAL: 'Full Face', VENT_SOPORTE_FINAL: 'VNI' });
eq('23-jul (extubación a VNI): el día cuenta para la VM saliente → VM 1', evo('2026-07-23-Dia').DIAS_VM, 1);
eq('…y es el Día 0 de la VNI entrante', evo('2026-07-23-Dia').DIAS_VNI, 0);
sync('Full Face', 'VNI', '2026-07-23', '2026-07-23');

// 24-jul: sigue en VNI
AHORA = { fecha: '2026-07-24', hora: '16:00' };
guardar('7', '2026-07-24-Dia', { VENT_VIA_AEREA: 'Full Face', VENT_SOPORTE: 'VNI' });
eq('24-jul: VNI 1', evo('2026-07-24-Dia').DIAS_VNI, 1);
eq('…y la VM queda congelada en 1', evo('2026-07-24-Dia').DIAS_VM, 1);

// 25-jul: evolución tórpida → REINTUBACIÓN (alcanzó 2 días de VNI)
AHORA = { fecha: '2026-07-25', hora: '16:00' };
guardar('7', '2026-07-25-Dia', { VENT_VIA_AEREA: 'Full Face', VENT_SOPORTE: 'VNI',
  EXT_REINTUB: true, VENT_VIA_AEREA_FINAL: 'TOT', VENT_SOPORTE_FINAL: 'VM' });
eq('25-jul (reintubación): la VNI cierra con sus 2 días', evo('2026-07-25-Dia').DIAS_VNI, 2);
eq('…y la VM REANUDA desde su tramo anterior (1 + Día 0)', evo('2026-07-25-Dia').DIAS_VM, 1);
sync('TOT', 'VM', '2026-07-25', '2026-07-25');

// 26 al 29-jul: ventilada
for (let d = 26; d <= 29; d++) {
  AHORA = { fecha: '2026-07-' + d, hora: '16:00' };
  guardar('7', '2026-07-' + d + '-Dia', { VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM' });
}
eq('29-jul: VM acumula tramo 1 + tramo 2 (1+4=5)', evo('2026-07-29-Dia').DIAS_VM, 5);
eq('…la reintubación NO reinició la cuenta', evo('2026-07-29-Dia').DIAS_VM !== 4, true);

// 30-jul: EXTUBACIÓN ACCIDENTAL → VNI hasta hoy
AHORA = { fecha: '2026-07-30', hora: '16:00' };
guardar('7', '2026-07-30-Dia', { VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM',
  EXT_OCURRIO: true, EXT_TIPO: 'accidental', VENT_VIA_AEREA_FINAL: 'Full Face', VENT_SOPORTE_FINAL: 'VNI' });
eq('30-jul (ext. accidental): VM cierra en 6 (1+5)', evo('2026-07-30-Dia').DIAS_VM, 6);
eq('…y la VNI reanuda desde sus 2 (2 + Día 0)', evo('2026-07-30-Dia').DIAS_VNI, 2);
sync('Full Face', 'VNI', '2026-07-30', '2026-07-30');

// 31-jul al 4-ago: en VNI
['2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].forEach(f => {
  AHORA = { fecha: f, hora: '16:00' };
  guardar('7', f + '-Dia', { VENT_VIA_AEREA: 'Full Face', VENT_SOPORTE: 'VNI' });
});
const hoy4 = evo('2026-08-04-Dia');
console.log('\n   — El cuadre final de María al 4-ago —');
eq('estadía 13 (22-jul → 4-ago)', hoy4.DIA_ESTADIA, 13);
eq('VM 6 (tramos 1+5, congelada)', hoy4.DIAS_VM, 6);
eq('VNI 7 (tramos 2+5, corriendo)', hoy4.DIAS_VNI, 7);
eq('VM + VNI = ESTADÍA — ni un día doble ni uno perdido',
  (parseInt(hoy4.DIAS_VM) + parseInt(hoy4.DIAS_VNI)), 13);
// La VA cuenta la vía aérea NO natural (semántica histórica: la mascarilla
// también cuenta) — continua desde el ingreso pese al re-estampado del reloj.
eq('la vía aérea no natural corre continua desde el ingreso (13)', hoy4.DIAS_VA, 13);

/* ══ 2 · EL RE-SELLADO CORRIGE LO YA GUARDADO ═══════════════════════════ */
console.log('\n2 · resellarDiasSoporte repara los números viejos');
// Se sabotean los valores sellados como los dejaba la lógica antigua
DB.EVOLUCIONES.forEach(e => { e.DIAS_VM = 0; e.DIAS_VNI = ''; });
const sim = resellarDiasSoporteSIMULACRO();
eq('el simulacro detecta evoluciones por re-sellar', /a re-sellar: \d+ evolucion/.test(sim) && !/a re-sellar: 0 /.test(sim), true);
resellarDiasSoporteCONFIRMAR();
eq('tras confirmar, el 4-ago vuelve a VM 6', evo('2026-08-04-Dia').DIAS_VM, 6);
eq('…y VNI 7', evo('2026-08-04-Dia').DIAS_VNI, 7);
eq('y el 25-jul (reintubación) quedó con VNI 2 · VM 1',
  String(evo('2026-07-25-Dia').DIAS_VNI) + '·' + String(evo('2026-07-25-Dia').DIAS_VM), '2·1');
const sim2 = resellarDiasSoporteSIMULACRO();
eq('es idempotente: una segunda pasada no cambia nada', /a re-sellar: 0 /.test(sim2), true);

/* ══ 3 · EL EGRESO ARCHIVA EL TOTAL SELLADO (caso Ricardo) ══════════════ */
console.log('\n3 · El egreso ya no puede archivar más VM que estadía');
_n = 100;
DB.CAMAS_ESTADO = [{ ID_CAMA: '10', OCUPADA: 'TRUE', PATIENT_ID: 'pR', NOMBRE: 'Ricardo F.',
  FECHA_INGRESO: '2026-08-02', FECHA_INICIO_VA: '2026-08-02', FECHA_INICIO_SOPORTE: '2026-08-02',
  VIA_AEREA: 'TOT', SOPORTE: 'VM', COD_PACIENTE: 'RF70', EDAD: 70, SEXO: 'M' }];
DB.EVOLUCIONES.length = 0;
AHORA = { fecha: '2026-08-02', hora: '10:00' };
guardar('10', '2026-08-02-Dia', { VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM',
  EXT_OCURRIO: true, EXT_TIPO: 'protocolo', VENT_VIA_AEREA_FINAL: 'Natural',
  VENT_SOPORTE_FINAL: 'Oxigenoterapia/OAF' });
Object.assign(DB.CAMAS_ESTADO[0], { VIA_AEREA: 'Natural', SOPORTE: 'Oxigenoterapia/OAF' });
AHORA = { fecha: '2026-08-03', hora: '16:00' };
guardar('10', '2026-08-03-Dia', { VENT_VIA_AEREA: 'Natural', VENT_SOPORTE: 'Oxigenoterapia/OAF' });
DB.CAMAS_ESTADO[0].DIA_ESTADIA = 1; DB.CAMAS_ESTADO[0].DIAS_VM = 0; DB.CAMAS_ESTADO[0].DIAS_VA = 0;
AHORA = { fecha: '2026-08-03', hora: '18:00' };
const rEg = darAltaPaciente({ idCama: '10', motivo: 'Alta a sala', destino: 'Medicina' }, { firma: 'DMV' });
eq('el egreso se procesa', rEg.ok === true ? true : rEg.error, true);
const arch = DB.ARCHIVO_PACIENTES[DB.ARCHIVO_PACIENTES.length - 1];
eq('archiva VM 0 (ingresó y se extubó el MISMO día: Día 0, como BUDA)', arch.DIAS_VM_TOTAL, 0);
eq('…y no los «2 días tocados» que hacían VM > estadía', arch.DIAS_VM_TOTAL <= 1, true);

/* ══ 4 · SEMBRADO DE HISTORIA PRE-APP (Francisca y María reales) ═════════
   5-ago: ambas fueron cargadas al RCE DESPUÉS de que ocurriera su historia
   real (reintubaciones, extubaciones). Sus evoluciones en la app solo
   empiezan cuando alguien las evolucionó por primera vez — ya en su tramo
   ACTUAL, sin ningún rastro de las transiciones previas. El re-sellado
   normal (que solo camina evoluciones) ancla el tramo a esa primera
   evolución (muy tarde); _MTO_SEED_TRAMOS le da el punto de partida real. */
console.log('\n4 · Sembrado de historia pre-app (Francisca y María reales)');

// Francisca (cama 1): su primera evolución en la app YA la muestra en VM
// continua desde el 1-ago — nada indica que la reintubación real fue el
// 21-jul, ni que hubo un intento de VM el 18-jul que se autocanceló.
_n = 200;
DB.CAMAS_ESTADO = [{ ID_CAMA: '1', OCUPADA: 'TRUE', PATIENT_ID: 'pFco', NOMBRE: 'FRANCISCA ESTELA ARAYA VELIZ',
  VIA_AEREA: 'TOT', SOPORTE: 'VM' }];
DB.EVOLUCIONES = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].map(f => ({
  ID_EVOLUCION: 'ef' + f, PATIENT_ID: 'pFco', TURNO_KEY: f + '-Dia', FECHA: f,
  VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT', DIAS_VM: 0, DIAS_VNI: '', DIAS_VA: 0 }));
const simSemb1 = resellarDiasSoporteSIMULACRO();
eq('el simulacro anuncia el sembrado de Francisca', /historial pre-existente sembrado/.test(simSemb1), true);
resellarDiasSoporteCONFIRMAR();
const fco4 = DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-04-Dia');
eq('Francisca al 4-ago: VM 14 (0 del tramo autocancelado + 14 desde el 21-jul)', fco4.DIAS_VM, 14);
eq('…y vía aérea artificial también 14 (TOT desde la misma reintubación)', fco4.DIAS_VA, 14);

// María (cama 7): su primera evolución en la app YA la muestra en VNI
// continua — invisibles para la app sus tramos previos (VM 22-23, VNI 23-25,
// VM 25-30) que ocurrieron enteramente antes de que existiera un turno
// evolucionado para ella en el sistema.
_n = 300;
DB.CAMAS_ESTADO = [{ ID_CAMA: '7', OCUPADA: 'TRUE', PATIENT_ID: 'pMar', NOMBRE: 'MARIA RAMIREZ CORTES',
  VIA_AEREA: 'Full Face', SOPORTE: 'VNI' }];
DB.EVOLUCIONES = ['2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04'].map(f => ({
  ID_EVOLUCION: 'em' + f, PATIENT_ID: 'pMar', TURNO_KEY: f + '-Dia', FECHA: f,
  VENT_SOPORTE: 'VNI', VENT_VIA_AEREA: 'Full Face', DIAS_VM: 0, DIAS_VNI: 0, DIAS_VA: 0 }));
resellarDiasSoporteCONFIRMAR();
const mar4 = DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-04-Dia');
eq('María al 4-ago con el sembrado: VM 6 (tramos pre-app 1+5, cerrado)', mar4.DIAS_VM, 6);
eq('…VNI 7 (base 2 del primer tramo + 5 del tramo abierto desde el 30-jul)', mar4.DIAS_VNI, 7);
eq('…VA 13 (no-natural continua desde el ingreso, nunca ha estado Natural)', mar4.DIAS_VA, 13);
const simSemb2 = resellarDiasSoporteSIMULACRO();
eq('sembrado + re-sellado es idempotente', /a re-sellar: 0 /.test(simSemb2), true);

/* ══ 5 · MORELIA: INGRESO CORREGIDO 30→31-jul + VM SEMBRADA ═════════════
   5-ago: Diego reversó su primera conclusión — Morelia ingresó el 31-jul a
   las 23:00 (BUDA muestra 30-jul por SU PROPIO error de tipeo). Sin sembrado,
   el re-sellado ancla la VM a su primera evolución en la app (1-ago) y da
   VM 1 en vez de 2; con el sembrado (ini:'2026-07-31') cierra justo en su
   extubación del 2-ago con los 2 días reales — los mismos que decía la
   planilla manual desde el principio. */
console.log('\n5 · Morelia: ingreso 31-jul sembrado (no 1-ago, la primera evolución)');
_n = 400;
DB.CAMAS_ESTADO = [{ ID_CAMA: '9', OCUPADA: 'TRUE', PATIENT_ID: 'pMo', NOMBRE: 'MORELIA OLIVARES TAPIA',
  FECHA_INGRESO: '2026-07-31', FECHA_INICIO_VA: '', FECHA_INICIO_SOPORTE: '',
  VIA_AEREA: 'Natural', SOPORTE: 'Oxigenoterapia/OAF' }];
DB.EVOLUCIONES = [
  { ID_EVOLUCION: 'emo1', PATIENT_ID: 'pMo', TURNO_KEY: '2026-08-01-Dia', FECHA: '2026-08-01',
    VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT', DIA_ESTADIA: 2, DIAS_VM: 2, DIAS_VA: 2 },
  { ID_EVOLUCION: 'emo2', PATIENT_ID: 'pMo', TURNO_KEY: '2026-08-02-Dia', FECHA: '2026-08-02',
    VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT', EXT_OCURRIO: true, EXT_TIPO: 'protocolo',
    VENT_VIA_AEREA_FINAL: 'Natural', VENT_SOPORTE_FINAL: 'Oxigenoterapia/OAF',
    DIA_ESTADIA: 3, DIAS_VM: 3, DIAS_VA: 3 },
  { ID_EVOLUCION: 'emo5', PATIENT_ID: 'pMo', TURNO_KEY: '2026-08-05-Dia', FECHA: '2026-08-05',
    VENT_SOPORTE: 'Oxigenoterapia/OAF', VENT_VIA_AEREA: 'Natural', DIA_ESTADIA: 6, DIAS_VM: 3, DIAS_VA: 3 },
];
const simMo = resellarDiasSoporteSIMULACRO();
eq('el simulacro anuncia el sembrado de Morelia', /historial pre-existente sembrado/.test(simMo), true);
resellarDiasSoporteCONFIRMAR();
const mo5 = DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-05-Dia');
eq('Morelia al 5-ago: VM 2, congelada tras la extubación del 2-ago (31-jul→2-ago)', mo5.DIAS_VM, 2);
eq('…y VA 2 (misma lógica: TOT desde el 31-jul, cierra el 2-ago)', mo5.DIAS_VA, 2);
const simMo2 = resellarDiasSoporteSIMULACRO();
eq('sembrado + re-sellado es idempotente', /a re-sellar: 0 /.test(simMo2), true);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ dias_soporte OK');
process.exit(fails.length ? 1 : 0);
