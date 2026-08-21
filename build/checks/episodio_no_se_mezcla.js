// episodio_no_se_mezcla.js — LO DE UN PACIENTE NO TERMINA EN LA FICHA DE OTRO.
//
// 🔴 DE DÓNDE SALE (20-ago-2026). La clave de una evolución es
// `CAMA_<n>_<turnoKey>` y NO LLEVA PACIENTE DENTRO. Todo el sistema resuelve por
// esa clave mientras atribuye por `PATIENT_ID`. Cuando una cama rota sin
// archivar —traslado a cama vacía, limpieza manual— la fila del ocupante
// anterior sigue viva bajo la clave que el siguiente va a usar. De ahí salían
// dos pérdidas distintas, las dos medidas en la planilla real:
//
//   · La fusión de `guardarEvolucion` copiaba de la fila previa TODA clave
//     ausente del payload, `PATIENT_ID` incluido, y `datos.PATIENT_ID ||
//     cama.PATIENT_ID` hacía GANAR al pid heredado ⇒ el episodio del ocupante
//     NUEVO quedaba atribuido al paciente ANTERIOR, y `_syncCamaDesdeEvolucion`
//     le escribía ese pid al censo. El historial se lee por pid: mezclaba dos
//     personas.
//   · `_guardarProcedimientosInterno` borraba por `ID_EVOLUCION` a secas ⇒ el
//     guardado rutinario del ocupante nuevo BORRABA los procedimientos ya
//     registrados del anterior. Dato clínico verdadero, perdido en silencio.
//
// Medido el 20-ago sobre la planilla real: **12 filas de PROCEDIMIENTOS con un
// paciente distinto al de su evolución** y 1 clave duplicada entre la hoja viva
// y el archivo. No era una hipótesis: ya había pasado.
//
// POR QUÉ ESTA GUARDIA MONTA EL ESCENARIO CON RUTAS REALES y no escribiendo
// filas en DB: una guardia que fabrica a mano el estado que dice cazar solo se
// mide a sí misma. El bloque 2 usa MOVER_A_CAMA_VACIA, que es un botón de la
// app. El bloque 1 tiene que simular la limpieza manual de cama porque
// `mantenimiento.gs` no se carga dentro de sim_srv — queda declarado ahí mismo.
//
// Uso: node build/checks/episodio_no_se_mezcla.js
const { api, DB } = require('../sim/sim_srv.js');

const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l);
};
const si = (l, c) => eq(l, !!c, true);

const camas = () => DB.CAMAS_ESTADO;
const cama = id => camas().find(c => String(c.ID_CAMA) === String(id)) || {};
const evosDe = clave => DB.EVOLUCIONES.filter(e => String(e.ID_EVOLUCION) === String(clave));
const procsDe = clave => DB.PROCEDIMIENTOS.filter(p => String(p.ID_EVOLUCION) === String(clave));

const TK = '2026-08-01-Dia';
const evoBase = (idCama, nombre, extra) => Object.assign({
  idCama: idCama, turnoKey: TK, FECHA: '2026-08-01', TURNO: 'Dia',
  PAC_NOMBRE: nombre, VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
  VENT_VT: 450, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 50,
  SED_TIPO: 'Escalón 2', SED_SAS: '2', HEMO_ESTADO: 'Estable',
  PLAN_PLANES: 'Protección pulmonar', PLAN_FIRMA_KINE: 'DMV',
}, extra || {});

/* ═══════════════════════════════════════════════════════════════════════════
   1 · LA IDENTIDAD NO SE HEREDA DE LA FILA QUE HABÍA BAJO LA MISMA CLAVE
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n1 · El episodio nuevo no hereda el paciente del anterior');

let r = api('INGRESAR_PACIENTE', { idCama: '6', nombre: 'Paciente Alfa', edad: 61, sexo: 'M',
  diagnostico: 'NAC grave', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM',
  modo: 'ACVC', firmaKine: 'DMV' }, null);
eq('ingresa A en la cama 6', r.ok, true);
const PID_A = cama('6').PATIENT_ID;
si('A tiene PATIENT_ID', !!PID_A);

r = api('GUARDAR_EVOLUCION', evoBase('6', 'Paciente Alfa', {
  RESP_KTR_CANT: 2, PROC_JSON: JSON.stringify(['ECOGRAFÍA', 'IMAGENOLOGÍA']),
}), null);
eq('se guarda el turno de A', r.ok, true);
eq('la evolución de A quedó con SU paciente', evosDe('CAMA_6_' + TK)[0].PATIENT_ID, PID_A);
eq('y sus 2 procedimientos', procsDe('CAMA_6_' + TK).length, 2);

// La cama se limpia a mano SIN archivar: es lo que hace `limpiarCamasManual`
// (mantenimiento.gs), que a propósito no archiva porque puede correrse con el
// paciente dentro. No se carga en sim_srv, así que se reproduce su efecto: la
// fila de la cama queda libre y la evolución de A sigue viva bajo la clave.
const c6 = cama('6');
c6.OCUPADA = false; c6.PATIENT_ID = ''; c6.NOMBRE = '';
si('la evolución de A sigue viva bajo la clave de la cama', evosDe('CAMA_6_' + TK).length === 1);

r = api('INGRESAR_PACIENTE', { idCama: '6', nombre: 'Paciente Bravo', edad: 47, sexo: 'F',
  diagnostico: 'Shock séptico', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM',
  modo: 'ACVC', firmaKine: 'DMV' }, null);
eq('ingresa B en la misma cama', r.ok, true);
const PID_B = cama('6').PATIENT_ID;
si('B tiene un PATIENT_ID propio, distinto al de A', !!PID_B && PID_B !== PID_A);

r = api('GUARDAR_EVOLUCION', evoBase('6', 'Paciente Bravo', { RESP_KTR_CANT: 3 }), null);
eq('se guarda el turno de B', r.ok, true);

// 🔴 EL ASSERT QUE IMPORTA. Antes del arreglo esto devolvía el pid de A.
const filaB = evosDe('CAMA_6_' + TK).find(e => String(e.PAC_NOMBRE || '').indexOf('Bravo') > -1)
           || evosDe('CAMA_6_' + TK)[0];
eq('LA EVOLUCIÓN DE B LLEVA EL PACIENTE DE B, no el de A', filaB.PATIENT_ID, PID_B);
eq('…y el censo de la cama también', cama('6').PATIENT_ID, PID_B);
si('…y el nombre del censo es el de B', String(cama('6').NOMBRE || '').indexOf('Bravo') > -1);

// Lo simétrico: no basta con no robarle el pid a A; tampoco se le pueden colar
// a B los datos clínicos de A por la fusión.
eq('B no heredó el KTR de A', String(filaB.RESP_KTR_CANT), '3');

/* ═══════════════════════════════════════════════════════════════════════════
   2 · LOS PROCEDIMIENTOS DEL ANTERIOR SOBREVIVEN — ruta 100% de interfaz
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n2 · El guardado del ocupante nuevo no borra lo del anterior');

// Escenario canónico, todo con botones que existen en la app:
// ingresar en la 9 → guardar con procedimientos → trasladar 9→10 → ingresar en
// la 9 → guardar. El traslado re-etiqueta EVOLUCIONES a la cama nueva pero NO
// re-etiqueta PROCEDIMIENTOS, así que las filas del trasladado se quedan bajo
// la clave vieja: justo la que el nuevo ocupante va a reemplazar.
r = api('INGRESAR_PACIENTE', { idCama: '9', nombre: 'Paciente Charlie', edad: 70, sexo: 'M',
  diagnostico: 'SDRA', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM',
  modo: 'ACVC', firmaKine: 'DMV' }, null);
eq('ingresa C en la cama 9', r.ok, true);
const PID_C = cama('9').PATIENT_ID;

r = api('GUARDAR_EVOLUCION', evoBase('9', 'Paciente Charlie', {
  PROC_JSON: JSON.stringify(['ECOGRAFÍA', 'PABELLÓN']),
}), null);
eq('se guarda el turno de C con 2 procedimientos', r.ok, true);
const procsC = procsDe('CAMA_9_' + TK).length;
eq('C tiene sus 2 filas en PROCEDIMIENTOS', procsC, 2);

r = api('MOVER_A_CAMA_VACIA', { idOrigen: '9', idDestino: '10' }, null);
eq('C se traslada de la cama 9 a la 10', r.ok, true);
si('la cama 9 quedó libre', !cama('9').OCUPADA);

r = api('INGRESAR_PACIENTE', { idCama: '9', nombre: 'Paciente Delta', edad: 55, sexo: 'F',
  diagnostico: 'TEP', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM',
  modo: 'ACVC', firmaKine: 'DMV' }, null);
eq('ingresa D en la cama 9', r.ok, true);
const PID_D = cama('9').PATIENT_ID;

r = api('GUARDAR_EVOLUCION', evoBase('9', 'Paciente Delta', {
  PROC_JSON: JSON.stringify(['RCP']),
}), null);
eq('se guarda el turno de D', r.ok, true);

// 🔴 EL ASSERT QUE IMPORTA. Antes del arreglo, las 2 filas de C desaparecían.
const deC = DB.PROCEDIMIENTOS.filter(p => String(p.PATIENT_ID) === String(PID_C));
eq('LOS PROCEDIMIENTOS DE C SIGUEN AHÍ', deC.length, 2);
si('…y son los suyos', deC.map(p => p.NOMBRE_PROC).sort().join('|') === 'ECOGRAFÍA|PABELLÓN');
const deD = DB.PROCEDIMIENTOS.filter(p => String(p.PATIENT_ID) === String(PID_D));
eq('…y los de D también se guardaron', deD.length, 1);
si('nunca se mezclan: ninguna fila de D lleva el paciente de C',
  deD.every(p => String(p.PATIENT_ID) === String(PID_D)));

/* ═══════════════════════════════════════════════════════════════════════════
   3 · EL CASO DE TODOS LOS DÍAS NO GANA NI UNA FRICCIÓN
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n3 · Re-editar el propio turno del propio paciente sigue fusionando');

r = api('GUARDAR_EVOLUCION', { idCama: '9', turnoKey: TK, FECHA: '2026-08-01', TURNO: 'Dia',
  RESP_KTR_CANT: 4, PLAN_FIRMA_KINE: 'DMV' }, null);
eq('re-guardado parcial ok', r.ok, true);
const filaD = evosDe('CAMA_9_' + TK).find(e => String(e.PATIENT_ID) === String(PID_D));
eq('el dato nuevo entró', String(filaD.RESP_KTR_CANT), '4');
si('y lo que no venía en el payload se conservó', String(filaD.VENT_SOPORTE) === 'VM');
eq('el paciente sigue siendo el mismo', filaD.PATIENT_ID, PID_D);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS:\n  - ${fails.join('\n  - ')}` : '\n✅ episodio_no_se_mezcla OK');
process.exit(fails.length ? 1 : 0);
