// integridad.js — Guardia de PERSISTENCIA (pedido de Diego, ago-2026):
// «me interesa que se guarde realmente lo que se evoluciona y no se pierda
// información — eso sería un grave error». Corre el SERVIDOR REAL completo
// (sim_srv: los .gs en Node, hojas en memoria) y lo ataca con los escenarios
// donde una app mal diseñada pierde datos:
//   1. Re-guardado PARCIAL del mismo turno (el cliente omite secciones con
//      gate cerrado) ⇒ lo ya guardado se PRESERVA, campo por campo.
//   2. Vaciar un campo A PROPÓSITO ('' explícito) ⇒ sí se borra (respeta al
//      usuario) — distinto de omitirlo.
//   3. Eventos únicos (extubación) + edición posterior sin las claves del
//      evento ⇒ el evento queda.
//   4. Guardado repetido (el reintento automático) ⇒ una sola fila.
//   5. Traslado de cama a mitad de episodio ⇒ ni una evolución se pierde y
//      el re-guardado postraslado sigue encontrando su fila.
//   6. Egreso ⇒ TODAS las evoluciones viajan al archivo (conteo exacto,
//      contenido incluido) y el original se limpia recién después.
//   7. Fallo del archivo a mitad de egreso ⇒ las evoluciones ORIGINALES no
//      se borran (nada se pierde aunque el egreso falle).
//   8. Doble guardado del MISMO turno por dos colegas ⇒ una fila, y el
//      segundo hereda lo del primero que él no tocó.
// Uso: node build/checks/integridad.js
const path = require('path');
const S = require(path.join(__dirname, '..', 'sim', 'sim_srv.js'));
const { api, DB, SIM } = S;
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };
SIM.fecha = '2026-08-02'; SIM.hora = '10:00:00';

const evoDe = tk => DB.EVOLUCIONES.find(e => String(e.TURNO_KEY) === tk);

/* ── Ingreso base ── */
let r = api('INGRESAR_PACIENTE', { idCama: '3', nombre: 'Integridad Uno', edad: 61, sexo: 'M',
  diagnostico: 'NAC grave', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM', modo: 'ACVC', firmaKine: 'DMV' }, null);
eq('ingreso ok', r.ok, true);
const PID = DB.CAMAS_ESTADO.find(c => c.ID_CAMA === '3').PATIENT_ID;

/* ── 1 · Guardado completo, luego re-guardado PARCIAL ── */
r = api('GUARDAR_EVOLUCION', { idCama: '3', turnoKey: '2026-08-01-Dia', FECHA: '2026-08-01', TURNO: 'Dia',
  PAC_NOMBRE: 'Integridad Uno', VENT_VIA_AEREA: 'TOT', VENT_TOT_NUM: '8.0', VENT_TOT_CM: '22',
  VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC', VENT_VT: 450, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 50,
  VENT_PPL: 19, VENT_PMAX: 24, SED_TIPO: 'Escalón 2', SED_SAS: '2', SED_GCS_TOT: 8,
  HEMO_ESTADO: 'Estable', RESP_KTR_CANT: 2, RESP_SECR_QTY: '++', EVAL_T_MRC: 40,
  PLAN_PLANES: 'Protección pulmonar', PLAN_FIRMA_KINE: 'DMV' }, null);
eq('guardado completo ok', r.ok, true);
eq('una fila en EVOLUCIONES', DB.EVOLUCIONES.length, 1);

// Re-guardado que solo trae 3 campos (como un cliente con secciones cerradas)
r = api('GUARDAR_EVOLUCION', { idCama: '3', turnoKey: '2026-08-01-Dia', FECHA: '2026-08-01', TURNO: 'Dia',
  VENT_FIO2: 45, PLAN_NOTA_TURNO: 'Se agrega nota tardía', PLAN_FIRMA_KINE: 'DMV' }, null);
eq('re-guardado parcial ok', r.ok, true);
let e1 = evoDe('2026-08-01-Dia');
eq('sigue habiendo UNA fila (upsert, no duplicado)', DB.EVOLUCIONES.length, 1);
eq('lo nuevo entró (FiO2 45)', e1.VENT_FIO2, 45);
eq('la nota tardía entró', e1.PLAN_NOTA_TURNO, 'Se agrega nota tardía');
eq('el Vt guardado antes SE PRESERVA', e1.VENT_VT, 450);
eq('la Ppl se preserva', e1.VENT_PPL, 19);
eq('la sedación se preserva', e1.SED_TIPO, 'Escalón 2');
eq('el KTR se preserva', e1.RESP_KTR_CANT, 2);
eq('el MRC se preserva', e1.EVAL_T_MRC, 40);
eq('el plan se preserva', e1.PLAN_PLANES, 'Protección pulmonar');

/* ── 2 · Vaciar a propósito ≠ omitir ── */
r = api('GUARDAR_EVOLUCION', { idCama: '3', turnoKey: '2026-08-01-Dia', FECHA: '2026-08-01', TURNO: 'Dia',
  PLAN_NOTA_TURNO: '', PLAN_FIRMA_KINE: 'DMV' }, null);
e1 = evoDe('2026-08-01-Dia');
eq('el campo vaciado EXPLÍCITAMENTE se borra', String(e1.PLAN_NOTA_TURNO || ''), '');
eq('…y los demás siguen intactos', e1.VENT_VT, 450);

/* ── 3 · Evento único sobrevive a la re-edición ── */
SIM.fecha = '2026-08-02';
r = api('GUARDAR_EVOLUCION', { idCama: '3', turnoKey: '2026-08-02-Dia', FECHA: '2026-08-02', TURNO: 'Dia',
  VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'PSV', VENT_VT: 480, VENT_FIO2: 35,
  PVE_VAL: 'si', PVE_RESULTADO: 'superada', EXT_OCURRIO: true, EXT_HORA: '11:30',
  EXT_TIPO: 'programada', EXT_PE_SOP: 'CNAF', VENT_VIA_AEREA_FINAL: 'Natural',
  VENT_SOPORTE_FINAL: 'CNAF', PLAN_FIRMA_KINE: 'MFB' }, null);
eq('turno con extubación ok', r.ok, true);
// Re-edición SIN ninguna clave del evento (así viaja desde el cliente)
r = api('GUARDAR_EVOLUCION', { idCama: '3', turnoKey: '2026-08-02-Dia', FECHA: '2026-08-02', TURNO: 'Dia',
  RESP_KTR_CANT: 3, PLAN_FIRMA_KINE: 'MFB' }, null);
let e2 = evoDe('2026-08-02-Dia');
eq('la extubación SIGUE registrada', String(e2.EXT_OCURRIO), 'true');
eq('…con su hora', e2.EXT_HORA, '11:30');
eq('…y su resultado de PVE', e2.PVE_RESULTADO, 'superada');
eq('…y el estado final', e2.VENT_VIA_AEREA_FINAL, 'Natural');
eq('el KTR nuevo entró', e2.RESP_KTR_CANT, 3);

/* ── 4 · El reintento automático no duplica ── */
const payload = { idCama: '3', turnoKey: '2026-08-02-Noche', FECHA: '2026-08-02', TURNO: 'Noche',
  VENT_SOPORTE: 'CNAF', VENT_FIO2: 40, PLAN_FIRMA_KINE: 'CSR' };
api('GUARDAR_EVOLUCION', payload, null);
api('GUARDAR_EVOLUCION', payload, null);   // segundo intento idéntico (retry)
eq('dos envíos idénticos ⇒ una fila', DB.EVOLUCIONES.filter(e => e.TURNO_KEY === '2026-08-02-Noche').length, 1);

/* ── 5 · Traslado a cama vacía a mitad de episodio ── */
const antesTraslado = DB.EVOLUCIONES.filter(e => e.PATIENT_ID === PID).length;
r = api('MOVER_A_CAMA_VACIA', { idOrigen: '3', idDestino: '7' }, null);
eq('traslado ok', r.ok, true);
eq('NI UNA evolución se perdió en el traslado', DB.EVOLUCIONES.filter(e => e.PATIENT_ID === PID).length, antesTraslado);
eq('todas quedaron re-estampadas a la cama 7', DB.EVOLUCIONES.filter(e => e.PATIENT_ID === PID).every(e => e.ID_CAMA === '7'), true);
// re-guardar un turno ANTIGUO tras el traslado: encuentra su fila, no duplica
r = api('GUARDAR_EVOLUCION', { idCama: '7', turnoKey: '2026-08-01-Dia', FECHA: '2026-08-01', TURNO: 'Dia',
  PLAN_NOTA_TURNO: 'corregida postraslado', PLAN_FIRMA_KINE: 'DMV' }, null);
eq('re-guardado postraslado ok', r.ok, true);
eq('sin duplicar la fila', DB.EVOLUCIONES.filter(e => e.PATIENT_ID === PID).length, antesTraslado);
eq('…y conserva el Vt original', DB.EVOLUCIONES.find(e => e.PATIENT_ID === PID && e.TURNO_KEY === '2026-08-01-Dia').VENT_VT, 450);

/* ── 6 · Egreso: la historia viaja COMPLETA al archivo ── */
const nEvos = DB.EVOLUCIONES.filter(e => e.PATIENT_ID === PID).length;
const vtOriginal = DB.EVOLUCIONES.find(e => e.PATIENT_ID === PID && e.TURNO_KEY === '2026-08-01-Dia').VENT_VT;
r = api('DAR_ALTA', { idCama: '7', motivoEgreso: 'Traslado a sala', fechaEgreso: '2026-08-02', firma: 'DMV' }, null);
eq('egreso ok', r.ok, true);
eq('el archivo recibió TODAS las evoluciones', DB.EVOLUCIONES_ARCHIVO.filter(e => e.PATIENT_ID === PID).length, nEvos);
eq('…con su contenido intacto (Vt del primer turno)', DB.EVOLUCIONES_ARCHIVO.find(e => e.PATIENT_ID === PID && e.TURNO_KEY === '2026-08-01-Dia').VENT_VT, vtOriginal);
eq('la hoja viva quedó limpia de ese episodio', DB.EVOLUCIONES.filter(e => e.PATIENT_ID === PID).length, 0);
eq('el resumen del egreso quedó en ARCHIVO_PACIENTES', DB.ARCHIVO_PACIENTES.filter(a => a.PATIENT_ID === PID).length, 1);

/* ── 7 · Si el archivo FALLA a mitad de egreso, nada se borra ── */
api('INGRESAR_PACIENTE', { idCama: '5', nombre: 'Integridad Dos', edad: 70, sexo: 'F',
  diagnostico: 'TEC grave', fechaIngreso: '2026-08-02', viaAerea: 'TOT', soporte: 'VM', modo: 'ACVC', firmaKine: 'DMV' }, null);
const PID2 = DB.CAMAS_ESTADO.find(c => c.ID_CAMA === '5').PATIENT_ID;
api('GUARDAR_EVOLUCION', { idCama: '5', turnoKey: '2026-08-02-Dia', FECHA: '2026-08-02', TURNO: 'Dia',
  VENT_SOPORTE: 'VM', VENT_VT: 400, PLAN_FIRMA_KINE: 'DMV' }, null);
const insertarReal = global.repoInsertar;
let bomba = 0;
global.repoInsertar = (h, o) => {
  if (h === 'EVOLUCIONES_ARCHIVO' && ++bomba === 1) throw new Error('cuota de Sheets (simulada)');
  return insertarReal(h, o);
};
r = api('DAR_ALTA', { idCama: '5', motivoEgreso: 'Fallecido', fechaEgreso: '2026-08-02', firma: 'DMV' }, null);
global.repoInsertar = insertarReal;
eq('el egreso reporta el fallo (no lo esconde)', r.ok, false);
eq('las evoluciones ORIGINALES siguen ahí — nada se perdió', DB.EVOLUCIONES.filter(e => e.PATIENT_ID === PID2).length, 1);

/* ── 8 · Dos colegas guardan el MISMO turno ── */
api('GUARDAR_EVOLUCION', { idCama: '5', turnoKey: '2026-08-02-Noche', FECHA: '2026-08-02', TURNO: 'Noche',
  VENT_SOPORTE: 'VM', VENT_VT: 380, VENT_PEEP: 10, SED_TIPO: 'Escalón 3', PLAN_FIRMA_KINE: 'DMV' }, null);
api('GUARDAR_EVOLUCION', { idCama: '5', turnoKey: '2026-08-02-Noche', FECHA: '2026-08-02', TURNO: 'Noche',
  VENT_FIO2: 60, PLAN_FIRMA_KINE: 'CSR' }, null);
const e8 = DB.EVOLUCIONES.find(e => e.PATIENT_ID === PID2 && e.TURNO_KEY === '2026-08-02-Noche');
eq('una sola fila del turno', DB.EVOLUCIONES.filter(e => e.PATIENT_ID === PID2 && e.TURNO_KEY === '2026-08-02-Noche').length, 1);
eq('lo del primero se conserva (Vt 380)', e8.VENT_VT, 380);
eq('…y el PEEP', e8.VENT_PEEP, 10);
eq('lo del segundo entró (FiO2 60)', e8.VENT_FIO2, 60);
eq('la firma vigente es la del último', e8.PLAN_FIRMA_KINE, 'CSR');

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
