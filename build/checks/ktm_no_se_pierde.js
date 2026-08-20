// ktm_no_se_pierde.js — LA KTM NO SE BORRA SOLA, Y SUS REGLAS VIVEN EN EL SERVIDOR.
//
// 🔑 ESTA ES LA GUARDIA DEL BUG QUE ORIGINÓ TODO (20-ago-2026). Manuel lo trajo
// del terreno así: «en la ficha de papel escriben KTM con nivel, pero no está
// registrado en RCE». No era que se les olvidara anotarla — el sistema se la
// borraba:
//
//   El formulario neutraliza el trío de KTM en CADA reapertura (deliberado:
//   «ACCIÓN DIARIA: siempre parte sin estado seleccionado») y manda las claves
//   presentes pero VACÍAS. La fusión del servidor solo repone lo AUSENTE. Así
//   que un turno con KTM realizada, nivel 3 y 2 sesiones quedaba en nivel '' y
//   cantidad '' porque un colega reabrió esa evolución para corregir la FiO₂.
//
// Medido en la planilla real ese día: **52 filas con nivel presente y el estado
// apagado**, más que las 36 con KTM realizada. 21 de ellas de turno DÍA.
//
// La regla que fija esta guardia (decisión de Manuel): si el payload no declara
// ningún estado del trío, el turno no dice «no hubo KTM», dice «de esto no
// opino» ⇒ se conserva lo que había. Para borrar hay que declararlo.
//
// Y las reglas clínicas de KTM (razón obligatoria, exclusividad, KTM nocturna)
// pasan a vivir en el SERVIDOR: hasta hoy estaban solo en un toast del
// navegador, y el botón ➕ del Registro Diario —por donde va a entrar la
// corrección retroactiva— no pasa por ese formulario.
//
// 🪤 ESTA GUARDIA NO PUEDE STUBEAR `validarPayloadEvolucion`. Seis de las diez
// guardias de servidor lo hacen; con ese stub, ésta se mediría a sí misma para
// siempre. Por eso el primer assert comprueba que `validarKTM` existe de verdad.
//
// Uso: node build/checks/ktm_no_se_pierde.js
const { api, DB } = require('../sim/sim_srv.js');

const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l);
};
const si = (l, c) => eq(l, !!c, true);

// Assert 0: si `validarKTM` no existe, todo lo de abajo mediría humo.
si('validarKTM existe en el servidor (no es un stub)', typeof validarKTM === 'function');

const cama = id => DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === String(id)) || {};
const fila = (id, tk) => DB.EVOLUCIONES.find(e => String(e.ID_EVOLUCION) === 'CAMA_' + id + '_' + tk) || {};

const base = (idCama, tk, turno, extra) => Object.assign({
  idCama, turnoKey: tk, FECHA: tk.slice(0, 10), TURNO: turno,
  VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
  VENT_VT: 450, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 50,
  SED_TIPO: 'Escalón 2', SED_SAS: '2', HEMO_ESTADO: 'Estable',
  PLAN_PLANES: 'Protección pulmonar', PLAN_FIRMA_KINE: 'DMV',
}, extra || {});

let r = api('INGRESAR_PACIENTE', { idCama: '2', nombre: 'Paciente Prueba', edad: 61, sexo: 'M',
  diagnostico: 'NAC grave', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM',
  modo: 'ACVC', firmaKine: 'DMV' }, null);
eq('ingreso de prueba ok', r.ok, true);

/* ═══════════════════════════════════════════════════════════════════════════
   1 · EL BUG DEL TERRENO: reabrir el turno NO borra la KTM
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n1 · Reabrir el turno para corregir otra cosa no borra la KTM');

const TK = '2026-08-01-Dia';
r = api('GUARDAR_EVOLUCION', base('2', TK, 'Dia', {
  KTM_REALIZADA: true, KTM_NIVEL_KTR: '3', KTM_CANT: 2, KTM_ASISTENCIA: 'Mínima',
}), null);
eq('se guarda el turno con KTM nivel 3 y 2 sesiones', r.ok, true);
eq('quedó el nivel', String(fila('2', TK).KTM_NIVEL_KTR), '3');
eq('quedó la cantidad', String(fila('2', TK).KTM_CANT), '2');

// Un colega reabre para corregir la FiO₂. El formulario manda el trío VACÍO —
// no ausente: vacío. Esto es exactamente lo que hace la pantalla real.
r = api('GUARDAR_EVOLUCION', base('2', TK, 'Dia', {
  VENT_FIO2: 45,
  KTM_REALIZADA: false, KTM_SUSPENDIDA: false, KTM_NO_REALIZADA: '',
  KTM_NIVEL_KTR: '', KTM_CANT: '',
}), null);
eq('el re-guardado ok', r.ok, true);
eq('la FiO₂ corregida entró', String(fila('2', TK).VENT_FIO2), '45');

// 🔴 LOS ASSERTS QUE IMPORTAN. Antes del arreglo: nivel '' y cantidad ''.
eq('LA KTM SIGUE AHÍ — nivel', String(fila('2', TK).KTM_NIVEL_KTR), '3');
eq('LA KTM SIGUE AHÍ — cantidad', String(fila('2', TK).KTM_CANT), '2');
si('…y el estado sigue en realizada', esVerdadero(fila('2', TK).KTM_REALIZADA));

/* ═══════════════════════════════════════════════════════════════════════════
   2 · PERO EL SILENCIO NO ES LA ÚNICA VÍA: declarar sí borra
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n2 · Para borrar una KTM hay que declararlo');

r = api('GUARDAR_EVOLUCION', base('2', TK, 'Dia', {
  KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Paciente en pabellón',
}), null);
eq('declarar «no realizada» con razón se acepta', r.ok, true);
si('el estado cambió', !esVerdadero(fila('2', TK).KTM_REALIZADA));
eq('…y el NIVEL FÓSIL se limpió solo', String(fila('2', TK).KTM_NIVEL_KTR || ''), '');
eq('…y la cantidad también', String(fila('2', TK).KTM_CANT || ''), '');

/* ═══════════════════════════════════════════════════════════════════════════
   3 · LAS REGLAS CLÍNICAS, EN EL SERVIDOR
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n3 · Las reglas de KTM ya no dependen del navegador');

const TK2 = '2026-08-02-Dia';
r = api('GUARDAR_EVOLUCION', base('2', TK2, 'Dia', { KTM_NO_REALIZADA: true, KTM_NO_RAZON: '' }), null);
eq('«no realizada» SIN razón → rechazado', r.ok, false);
r = api('GUARDAR_EVOLUCION', base('2', TK2, 'Dia', { KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Inestable' }), null);
eq('…y con razón puesta → aceptado', r.ok, true);

r = api('GUARDAR_EVOLUCION', base('2', TK2, 'Dia', { KTM_SUSPENDIDA: true }), null);
eq('«suspendida» SIN razón → rechazado', r.ok, false);
r = api('GUARDAR_EVOLUCION', base('2', TK2, 'Dia', { KTM_SUSPENDIDA: true, KTM_CONTRA_MANUAL: 'PIC elevada' }), null);
eq('…y con razón manual → aceptado', r.ok, true);

r = api('GUARDAR_EVOLUCION', base('2', TK2, 'Dia', { KTM_REALIZADA: true, KTM_SUSPENDIDA: true }), null);
eq('dos estados a la vez → rechazado', r.ok, false);

// La KTM nocturna: confirmado con la planilla real (las 36 realizadas son todas
// de día) y con Manuel (20-ago): en la unidad no se hace KTM de noche.
const TKN = '2026-08-02-Noche';
r = api('GUARDAR_EVOLUCION', base('2', TKN, 'Noche', { KTM_REALIZADA: true, KTM_NIVEL_KTR: '4' }), null);
eq('KTM realizada en turno NOCHE → rechazado', r.ok, false);

/* ═══════════════════════════════════════════════════════════════════════════
   4 · LO QUE NO SE PUEDE ROMPER: la noche normal y el ingreso
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n4 · El camino de todos los días sigue pasando');

// 🪤 EL ASSERT QUE IMPIDE VOLVER A BLOQUEAR LA NOCHE. De noche el nivel se
// hereda de la cama y nadie lo limpia, con la tarjeta oculta: si alguna vez se
// rechaza «nivel sin estado», TODA evolución nocturna de un paciente con KTM de
// día queda sin poder guardarse, y sin salida desde la pantalla.
r = api('GUARDAR_EVOLUCION', base('2', '2026-08-03-Noche', 'Noche', {
  KTM_NIVEL_KTR: '3', KTM_REALIZADA: false, KTM_SUSPENDIDA: false, KTM_NO_REALIZADA: '',
}), null);
eq('evolución NOCTURNA con nivel heredado y sin estado → SE GUARDA', r.ok, true);
eq('…y el nivel heredado queda limpio', String(fila('2', '2026-08-03-Noche').KTM_NIVEL_KTR || ''), '');

r = api('INGRESAR_PACIENTE', { idCama: '3', nombre: 'Paciente Ingreso', edad: 55, sexo: 'F',
  diagnostico: 'TEP', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM',
  modo: 'ACVC', firmaKine: 'DMV' }, null);
r = api('GUARDAR_EVOLUCION', base('3', TK, 'Dia', {
  ES_INGRESO: true, PAC_NOMBRE: 'Paciente Ingreso',
  KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Motivo ingreso',
}), null);
eq('el flujo de INGRESO sigue guardando', r.ok, true);

// La cantidad se acota en el servidor: por API entraba cualquier número al REM.
r = api('GUARDAR_EVOLUCION', base('3', '2026-08-04-Dia', 'Dia', {
  KTM_REALIZADA: true, KTM_NIVEL_KTR: '2', KTM_CANT: 99,
}), null);
eq('una cantidad absurda se acota', String(fila('3', '2026-08-04-Dia').KTM_CANT), '9');

console.log(fails.length ? `\n❌ ${fails.length} FALLOS:\n  - ${fails.join('\n  - ')}` : '\n✅ ktm_no_se_pierde OK');
process.exit(fails.length ? 1 : 0);
