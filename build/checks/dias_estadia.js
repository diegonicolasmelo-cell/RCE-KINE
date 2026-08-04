// dias_estadia.js — Guardia del conteo de días: EL MISMO NÚMERO QUE LA LISTA
// OFICIAL DEL HOSPITAL (BUDA).
//
// La unidad suma un día de estadía por cada día de CALENDARIO y el día de
// ingreso es Día 0. Verificado contra la «Lista de hospitalizados UCI» del
// 3-ago-2026 (foto que mandó Diego): las 17 camas cuadran exactamente con
// `fecha de la lista − fecha de ingreso`.
//
// Reemplaza a dias24.js: la v5.19 contaba BLOQUES DE 24 h sobre un supuesto
// equivocado —se creía que BUDA contaba así— y la app se despegaba hasta en un
// día del papel que el equipo lee en la reunión. Decisión de Diego (ago-2026):
// manda la lista oficial. La hora sigue guardándose en TS_INGRESO; es un dato
// válido, simplemente ya no decide el número que se ve.
//
// Uso: node build/checks/dias_estadia.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

const DB = { CAMAS_ESTADO: [], EVOLUCIONES: [], TIMELINE: [], PROCEDIMIENTOS: [] };
global.repoLeerTodos = (h, c, val) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(val)); return f; };
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoActualizar = (h, c, id, ch) => { const r = global.repoBuscarPorId(h, c, id); if (r) Object.assign(r, ch); return !!r; };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoEliminarDonde = () => {}; global.repoActualizarDonde = () => {};
global.repoUpsert = (h, c, id, o) => { const r = global.repoBuscarPorId(h, c, id); if (r) { Object.assign(r, o); return 'actualizar'; } global.repoInsertar(h, o); return 'crear'; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d; global.conLock = fn => fn(); global.uid = p => p + '_1';
let AHORA = { fecha: '2026-08-03', hora: '09:01' };
global.hoyISO = () => AHORA.fecha;
global.ahoraTS = () => AHORA.fecha + ' ' + AHORA.hora + ':00';
global._tz = () => 'America/Santiago';
global.Utilities = { getUuid: () => 'u1', formatDate: (d, tz, f) =>
  f === 'HH:mm' ? AHORA.hora
  : (String(f).indexOf('HH') > -1 ? AHORA.fecha + ' ' + AHORA.hora + ':00' : AHORA.fecha) };
global.SpreadsheetApp = { flush: () => {} };
global.validarPayloadEvolucion = () => []; global.validarPayloadIngreso = () => [];
global.generarCodPaciente = () => 'PAC'; global._codUnico = c => c; global._rutNormal = r => String(r || '');
global._agregarHitoInterno = () => {}; global._guardarProcedimientosInterno = () => {}; global._crearHitosDesdeProcedimientos = () => {};
global._registrarReintubacion = () => {}; global.calcularPI = () => 60; global.calcularRespiratorio = () => ({});
global.ok = d => ({ ok: true, data: d }); global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE' };
eval(['infra_fechas.gs', 'dominio_texto.gs', 'svc_camas.gs', 'svc_evoluciones.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

/* ── 1 · LA LISTA OFICIAL DEL 3-AGO-2026 ────────────────────────────────────
   Las 17 camas del papel. Si alguna deja de cuadrar, la app se despegó de BUDA
   y hay que averiguar por qué ANTES de entregar. */
console.log('\n1 · Lista de hospitalizados del 3-ago-2026 (BUDA)');
const LISTA = [
  ['1', '2026-07-17', 17], ['2', '2026-07-29', 5],  ['3', '2026-07-22', 12],
  ['4', '2026-07-29', 5],  ['5', '2026-08-01', 2],  ['6', '2026-07-27', 7],
  ['7', '2026-07-31', 3],  ['8', '2026-08-01', 2],  ['9', '2026-07-30', 4],
  ['10', '2026-08-02', 1], ['11', '2026-07-27', 7], ['13', '2026-07-28', 6],
  ['14', '2026-07-31', 3], ['15', '2026-07-30', 4], ['16', '2026-07-24', 10],
  ['17', '2026-07-25', 9], ['18', '2026-07-28', 6],
];
let cuadran = 0;
LISTA.forEach(f => { if (diasEntre(f[1], '2026-08-03') === f[2]) cuadran++;
  else { console.log('   ❌ cama ' + f[0] + ': ingreso ' + f[1] + ' → la app dice ' +
    diasEntre(f[1], '2026-08-03') + ', la lista dice ' + f[2]); } });
eq('las 17 camas de la lista oficial cuadran', cuadran, 17);

/* ── 2 · LA HORA YA NO MUEVE EL NÚMERO ───────────────────────────────────────
   Es el corazón de la corrección: un paciente que llegó anoche a las 23:00
   aparece con 1 día a la mañana siguiente, igual que en el papel. Con los
   bloques de 24 h de la v5.19 decía 0 y no calzaba con la reunión. */
console.log('\n2 · La hora de ingreso no cambia el número');
DB.CAMAS_ESTADO = [{ ID_CAMA: '1', OCUPADA: '', STATUS_CAMA: '' }];
AHORA = { fecha: '2026-08-02', hora: '23:00' };
let r = ingresarPaciente({ idCama: '1', nombre: 'Paciente Nocturno', edad: 70, sexo: 'M',
  fechaIngreso: '2026-08-02', viaAerea: 'TOT', soporte: 'VM', modo: 'ACVC' }, { firma: 'DMV' });
eq('ingreso guardado', r.ok, true);
const cama = DB.CAMAS_ESTADO[0];
eq('el momento real SIGUE guardándose (no se perdió el dato)', cama.TS_INGRESO, '2026-08-02 23:00');

AHORA = { fecha: '2026-08-02', hora: '23:30' };
eq('el día que ingresa es Día 0', obtenerTodasLasCamas().data[0].DIA_ESTADIA, 0);
AHORA = { fecha: '2026-08-03', hora: '09:01' };
eq('a la mañana siguiente es Día 1, aunque lleve 10 h (como BUDA)',
  obtenerTodasLasCamas().data[0].DIA_ESTADIA, 1);
AHORA = { fecha: '2026-08-04', hora: '09:01' };
eq('al día siguiente, Día 2', obtenerTodasLasCamas().data[0].DIA_ESTADIA, 2);

/* ── 3 · LOS DOS TURNOS DEL MISMO DÍA INFORMAN EL MISMO NÚMERO ──────────────
   El número se anota una vez al día; Día y Noche del 3-ago son «día 1». */
console.log('\n3 · Día y Noche del mismo día dan el mismo número');
AHORA = { fecha: '2026-08-03', hora: '16:00' };
guardarEvolucion({ ID_CAMA: '1', TURNO_KEY: '2026-08-03-Dia', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Nocturno', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC' },
  { firma: 'DMV', email: 'x@y' });
AHORA = { fecha: '2026-08-04', hora: '02:00' };
guardarEvolucion({ ID_CAMA: '1', TURNO_KEY: '2026-08-03-Noche', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Nocturno', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC' },
  { firma: 'DMV', email: 'x@y' });
const eD = DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-03-Dia');
const eN = DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-03-Noche');
eq('turno Día del 3-ago → Día 1', eD.DIA_ESTADIA, 1);
eq('turno Noche del 3-ago → Día 1 también', eN.DIA_ESTADIA, 1);
eq('…y los dos cuentan 1 día de VM', String(eD.DIAS_VM) + '/' + String(eN.DIAS_VM), '1/1');

/* ── 4 · LOS DÍAS DE VM SE CONGELAN AL EXTUBAR ──────────────────────────────
   «Se para el día que se extuba» (Diego). Antes caían a 0 y se perdía de vista
   cuántos días estuvo ventilado — dato que el REM necesita. */
console.log('\n4 · Los días de VM se congelan al extubar');
AHORA = { fecha: '2026-08-05', hora: '16:00' };
guardarEvolucion({ ID_CAMA: '1', TURNO_KEY: '2026-08-05-Dia', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Nocturno', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC' },
  { firma: 'DMV', email: 'x@y' });
eq('en VM al 5-ago → 3 días de VM',
  DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-05-Dia').DIAS_VM, 3);

// Turno que EXTUBA: empieza en VM y termina sin ella ⇒ ese día SÍ cuenta.
AHORA = { fecha: '2026-08-06', hora: '16:00' };
guardarEvolucion({ ID_CAMA: '1', TURNO_KEY: '2026-08-06-Dia', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Nocturno', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
  EXT_OCURRIO: true, VENT_VIA_AEREA_FINAL: 'Natural', VENT_SOPORTE_FINAL: 'Oxigenoterapia/OAF' },
  { firma: 'DMV', email: 'x@y' });
eq('el turno que extuba SÍ suma su día (estuvo ventilado en él)',
  DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-06-Dia').DIAS_VM, 4);

// Turnos posteriores: ya sin VM ⇒ el contador queda CONGELADO en 4.
AHORA = { fecha: '2026-08-07', hora: '16:00' };
guardarEvolucion({ ID_CAMA: '1', TURNO_KEY: '2026-08-07-Dia', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Nocturno', VENT_VIA_AEREA: 'Natural', VENT_SOPORTE: 'Oxigenoterapia/OAF' },
  { firma: 'DMV', email: 'x@y' });
eq('el día siguiente NO vuelve a 0: queda congelado',
  DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-07-Dia').DIAS_VM, 4);
AHORA = { fecha: '2026-08-08', hora: '16:00' };
guardarEvolucion({ ID_CAMA: '1', TURNO_KEY: '2026-08-08-Dia', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Nocturno', VENT_VIA_AEREA: 'Natural', VENT_SOPORTE: 'Oxigenoterapia/OAF' },
  { firma: 'DMV', email: 'x@y' });
eq('…y sigue congelado dos días después (no crece ni cae)',
  DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-08-Dia').DIAS_VM, 4);
eq('la estadía, en cambio, SIGUE sumando',
  DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-08-Dia').DIA_ESTADIA, 6);

/* ── 5 · RE-EDITAR NO CAMBIA LOS DÍAS DE ESE TURNO ─────────────────────────── */
console.log('\n5 · Re-editar no altera los días');
AHORA = { fecha: '2026-08-20', hora: '11:00' };
guardarEvolucion({ ID_CAMA: '1', TURNO_KEY: '2026-08-03-Dia', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Nocturno', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
  RESP_KTR_CANT: 2 }, { firma: 'DMV', email: 'x@y' });
eq('re-editar semanas después deja el día del turno intacto',
  DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-03-Dia').DIA_ESTADIA, 1);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ dias_estadia OK');
process.exit(fails.length ? 1 : 0);
