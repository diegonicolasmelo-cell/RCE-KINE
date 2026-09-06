// guardado_por_episodio.js — LA EVOLUCIÓN SE GUARDA POR EPISODIO (v5.99).
//
// 🔴 DE DÓNDE SALE. Auditoría del guardado (5-sep-2026), hallazgo R1: la fila
// de EVOLUCIONES se ubicaba por la clave 'CAMA_<n>_<turno>', que no lleva
// paciente. Si una cama rotaba SIN alta y el nuevo ocupante se guardaba en el
// mismo turno, `_otroEpisodio` saltaba la fusión… y el upsert final caía
// igual en la fila del anterior: su evolución se pisaba entera. Manuel había
// medido 39 camas con dos episodios en el mismo turno en agosto. Diego, 6-sep:
// «creo que debería crear fila nueva».
//
// LO QUE FIJA:
//  1. Rotación sin alta ⇒ el nuevo abre una fila APARTE (ID con sufijo del
//     episodio) y la del anterior queda idéntica.
//  2. Re-guardar el propio turno NO abre otra fila: sigue fusionando en la
//     suya (una sola fila por episodio y turno).
//  3. GET_EVO_TURNO devuelve la fila del ocupante ACTUAL, no la del anterior.
//  4. El AUDIT_LOG deja la huella «fila aparte» (la busca auditoriaIntegridad).
//  5. La campana avisa «evoluciones de un paciente anterior sin archivar».
//  6. auditoriaIntegridad() es de SOLO lectura y encuentra la cama con ajenas.
//  7. Candados: coordCorregirFicha y guardarAsignacionTurno van en conLock
//     (hallazgos C1/C2); el traslado conserva el sufijo del ID.
//
// Uso: node build/checks/guardado_por_episodio.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const { api, DB } = require('../sim/sim_srv.js');

const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l);
};
const si = (l, c) => eq(l, !!c, true);
const cama = id => DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === String(id)) || {};
const TK = '2026-08-01-Dia';
const filasTurno = (idCama, tk) => DB.EVOLUCIONES.filter(e => String(e.ID_CAMA) === String(idCama) && String(e.TURNO_KEY) === (tk || TK));
const evoBase = (idCama, nombre, extra) => Object.assign({
  idCama: idCama, turnoKey: TK, FECHA: '2026-08-01', TURNO: 'Dia',
  PAC_NOMBRE: nombre, VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
  VENT_VT: 450, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 50,
  SED_TIPO: 'Escalón 2', SED_SAS: '2', HEMO_ESTADO: 'Estable',
  PLAN_PLANES: 'Protección pulmonar', PLAN_FIRMA_KINE: 'DMV',
}, extra || {});

/* ═══ 1 · La rotación sin alta abre fila aparte y no pisa la anterior ═══ */
console.log('\n1 · Rotación sin alta: fila aparte, la anterior intacta');
let r = api('INGRESAR_PACIENTE', { idCama: '6', nombre: 'Paciente Alfa', edad: 61, sexo: 'M',
  diagnostico: 'NAC grave', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM',
  modo: 'ACVC', firmaKine: 'DMV' }, null);
eq('ingresa A en la cama 6', r.ok, true);
const PID_A = cama('6').PATIENT_ID;
r = api('GUARDAR_EVOLUCION', evoBase('6', 'Paciente Alfa', { RESP_KTR_CANT: 2, PLAN_NOTA_TURNO: 'nota de A' }), null);
eq('se guarda el turno de A', r.ok, true);
eq('la fila de A lleva la clave base', filasTurno('6')[0].ID_EVOLUCION, 'CAMA_6_' + TK);
const fotoA = JSON.stringify(filasTurno('6')[0]);

// La cama se limpia a mano SIN archivar (efecto de limpiarCamasManual).
const c6 = cama('6'); c6.OCUPADA = false; c6.PATIENT_ID = ''; c6.NOMBRE = '';
r = api('INGRESAR_PACIENTE', { idCama: '6', nombre: 'Paciente Bravo', edad: 47, sexo: 'F',
  diagnostico: 'Shock séptico', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM',
  modo: 'ACVC', firmaKine: 'DMV' }, null);
eq('ingresa B en la misma cama, mismo turno', r.ok, true);
const PID_B = cama('6').PATIENT_ID;
r = api('GUARDAR_EVOLUCION', evoBase('6', 'Paciente Bravo', { RESP_KTR_CANT: 3 }), null);
eq('se guarda el turno de B', r.ok, true);
eq('★ ahora hay DOS filas en la cama 6 para ese turno', filasTurno('6').length, 2);
const filaA = filasTurno('6').find(e => e.PATIENT_ID === PID_A);
const filaB = filasTurno('6').find(e => e.PATIENT_ID === PID_B);
si('★ LA FILA DE A ESTÁ IDÉNTICA, byte a byte', filaA && JSON.stringify(filaA) === fotoA);
si('la fila de B nació con ID propio (clave base + sufijo del episodio)',
  filaB && /^CAMA_6_2026-08-01-Dia~[A-Za-z0-9]{1,8}$/.test(String(filaB.ID_EVOLUCION)));
eq('B no heredó nada de A', String(filaB.PLAN_NOTA_TURNO || ''), '');
eq('el guardado devolvió el ID real de la fila de B', r.data.idEvolucion, filaB.ID_EVOLUCION);
si('★ el AUDIT_LOG deja la huella «fila aparte»',
  DB.AUDIT_LOG.some(a => a.accion === 'GUARDAR_EVOLUCION' && a.patientId === PID_B && /fila aparte/.test(String(a.resumen))));

/* ═══ 2 · Re-guardar el propio turno no duplica ═══ */
console.log('\n2 · Re-guardar el propio turno sigue en la misma fila');
r = api('GUARDAR_EVOLUCION', { idCama: '6', turnoKey: TK, PLAN_FIRMA_KINE: 'DMV', RESP_KTR_CANT: 4 }, null);
eq('re-guardado parcial de B ok', r.ok, true);
eq('★ siguen siendo DOS filas (no se abrió una tercera)', filasTurno('6').length, 2);
const filaB2 = filasTurno('6').find(e => e.PATIENT_ID === PID_B);
eq('el dato nuevo entró en la fila de B', String(filaB2.RESP_KTR_CANT), '4');
eq('y B conservó lo que no venía (fusión normal)', String(filaB2.PAC_NOMBRE || ''), 'Paciente Bravo');
eq('el ID de B no cambió al re-guardar', filaB2.ID_EVOLUCION, filaB.ID_EVOLUCION);
si('A sigue idéntica después del re-guardado de B', JSON.stringify(filasTurno('6').find(e => e.PATIENT_ID === PID_A)) === fotoA);

/* ═══ 3 · Lo que se abre es lo del ocupante actual ═══ */
console.log('\n3 · GET_EVO_TURNO devuelve la fila del ocupante actual');
r = api('GET_EVO_TURNO', { idCama: '6', turnoKey: TK, patientId: PID_B }, null);   // el cliente manda el pid de la tarjeta
eq('responde', r.ok, true);
eq('★ el turno abierto es el de B, no el de A', r.data.actual && r.data.actual.PATIENT_ID, PID_B);
r = api('GET_EVO_TURNO', { idCama: '6', turnoKey: TK }, null);
eq('un cliente viejo (sin pid) sigue recibiendo respuesta', r.ok, true);

/* ═══ 4 · Un turno NUEVO de B en la cama (otro día) usa la clave base ═══ */
console.log('\n4 · Un turno sin colisión sigue con la clave de siempre');
r = api('GUARDAR_EVOLUCION', evoBase('6', 'Paciente Bravo', { turnoKey: '2026-08-02-Dia', FECHA: '2026-08-02' }), null);
eq('turno del día siguiente ok', r.ok, true);
eq('sin colisión, la clave es la base', filasTurno('6', '2026-08-02-Dia')[0].ID_EVOLUCION, 'CAMA_6_2026-08-02-Dia');
// OJO: los contadores del episodio (días de VM, prono abierto, previa) SIGUEN
// leyéndose por cama, sin filtrar por pid — decisión documentada en
// checks/prono_paciente.js (filtrar escondía datos reales de un paciente
// re-ingresado). Lo que esta guardia fija es que NADA se pisa.

/* ═══ 5 · La campana avisa la cama con evoluciones ajenas ═══ */
console.log('\n5 · La campana avisa «evoluciones de un paciente anterior sin archivar»');
global.notifRegistrar = () => ({ ok: true });
global._sumarDiasISO = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
if (typeof global.estadoDispositivos !== 'function') global.estadoDispositivos = () => [];
eval(fs.readFileSync(path.join(v2, 'svc_notificaciones.gs'), 'utf8'));
const AL = alertasUnidad('2026-08-02');
const aj = AL.find(a => /paciente anterior sin archivar/.test(a.titulo));
si('★ hay alerta ámbar para la cama 6', aj && aj.cama === '6' && aj.nivel === 'ambar');
si('…con el conteo (1 fila de A)', aj && /\(1\)/.test(aj.titulo));

/* ═══ 6 · auditoriaIntegridad(): solo lectura, encuentra la huella ═══ */
console.log('\n6 · auditoriaIntegridad() encuentra la cama y no escribe');
global.Logger = { log: () => {} };
const mto = fs.readFileSync(path.join(v2, 'mantenimiento.gs'), 'utf8');
const ini = mto.indexOf('function auditoriaIntegridad()');
const fin = mto.indexOf('\n}\n', ini) + 3;
// AUDIT_LOG del sim guarda {accion, patientId, resumen, idEntidad}; la rutina
// lee las columnas de la hoja real: se traduce el registro al esquema.
DB.AUDIT_LOG = DB.AUDIT_LOG.map(a => ({ ACCION: a.accion, PATIENT_ID: a.patientId, RESUMEN: a.resumen,
  ID_ENTIDAD: a.idEntidad, TIMESTAMP: a.TS, FIRMA: a.firma }));
const antes = JSON.stringify([DB.EVOLUCIONES, DB.CAMAS_ESTADO, DB.AUDIT_LOG]);
eval(mto.slice(ini, fin));
const ai = auditoriaIntegridad();
eq('responde ok', ai.ok, true);
eq('★ B · la cama 6 tiene evoluciones ajenas', ai.data.B_camasConAjenas.length && ai.data.B_camasConAjenas[0].cama, '6');
eq('C · cuenta la fila abierta aparte desde la v5.99', ai.data.C_filasAparteDesdeV599, 1);
eq('A · sin claves repetidas en la hoja viva', ai.data.A_clavesRepetidas.length, 0);
si('★ NO ESCRIBIÓ NADA', JSON.stringify([DB.EVOLUCIONES, DB.CAMAS_ESTADO, DB.AUDIT_LOG]) === antes);
si('el informe no lleva nombres de pacientes', !/Alfa|Bravo/.test(ai.data.mensaje));

/* ═══ 7 · Candados y traslado (estático) ═══ */
console.log('\n7 · Candados C1/C2 y el traslado conserva el sufijo');
const coord = fs.readFileSync(path.join(v2, 'svc_coordinacion.gs'), 'utf8');
const turnos = fs.readFileSync(path.join(v2, 'svc_turnos.gs'), 'utf8');
const camasSrc = fs.readFileSync(path.join(v2, 'svc_camas.gs'), 'utf8');
si('coordCorregirFicha corre dentro de conLock', /function coordCorregirFicha\(datos\) \{[\s\S]{0,600}?return conLock\(/.test(coord));
si('guardarAsignacionTurno corre dentro de conLock', /function guardarAsignacionTurno\(datos\) \{[\s\S]{0,400}?return conLock\(/.test(turnos));
si('el traslado re-etiqueta solo el tramo de la cama del ID', /replace\(\/\^CAMA_\[\^_\]\+_\/, 'CAMA_' \+ nueva \+ '_'\)/.test(camasSrc));
r = api('MOVER_A_CAMA_VACIA', { idOrigen: '6', idDestino: '11' }, null);
eq('B se traslada de la 6 a la 11', r.ok, true);
const enOnce = DB.EVOLUCIONES.filter(e => String(e.ID_CAMA) === '11' && String(e.TURNO_KEY) === TK);
eq('la fila de B viaja a la 11 con el sufijo intacto', enOnce.length && enOnce[0].ID_EVOLUCION, 'CAMA_11_' + TK + '~' + String(PID_B).replace(/-/g, '').slice(0, 8));
si('la de A se quedó en la 6 (no es del episodio trasladado)', filasTurno('6').length === 1 && filasTurno('6')[0].PATIENT_ID === PID_A);

console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS:\n' + fails.map(f => '  - ' + f).join('\n') : '\n✅ guardado_por_episodio: todo verde');
process.exit(fails.length ? 1 : 0);
