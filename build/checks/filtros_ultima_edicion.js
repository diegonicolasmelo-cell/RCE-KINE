// filtros_ultima_edicion.js — Guardia de «LAS DOS PUERTAS ESCRIBEN» (Diego,
// 14-sep-2026): las fechas de Trachcare/HEPA/HME se escriben desde la
// evolución Y desde la lista de ventiladores por cama, sobre el MISMO dato.
//
// El choque que fija: un colega abre su panel (que carga las fechas de la
// cama), otro corrige una desde la lista, y el primero guarda sin haber tocado
// ese campo. Su panel todavía tiene la fecha vieja: sin esta regla la pisaría
// — la trampa de la cama 17 con los días de VM, otra vez.
//
// 🔴 La regla es «manda la ÚLTIMA EDICIÓN», no «manda la fecha mayor». Si la
// corrección de la lista fue a una fecha MÁS ANTIGUA (porque la etiqueta real
// lo era), «la mayor manda» habría conservado la equivocada. Esta guardia usa
// justo ese caso.
//
// Uso: node build/checks/filtros_ultima_edicion.js
const fails = [];
const eq = (l, g, w) => { const ok = String(g) === String(w);
  console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g));
  if (!ok) { fails.push(l); console.log('   esperado: ' + JSON.stringify(w)); } };
const si = (l, g) => eq(l, !!g, 'true');
const { api, DB, SIM, CONFIG } = require('../sim/sim_srv.js');

console.log('\n1 · La regla, pura');
const R = global._dispRespetaEdicion;
eq('★ no tocado y la cama cambió a una fecha MÁS ANTIGUA ⇒ manda la cama (última edición, no la mayor)',
  R('hme', '2026-07-05', '2026-07-03', { hme: '2026-07-05' }), '2026-07-03');
eq('no tocado y la cama cambió a una más nueva ⇒ también la cama',
  R('hme', '2026-07-03', '2026-07-05', { hme: '2026-07-03' }), '2026-07-05');
eq('tocado por el colega ⇒ manda lo que escribió, aunque la cama haya cambiado',
  R('hme', '2026-07-06', '2026-07-03', { hme: '2026-07-05' }), '2026-07-06');
eq('no tocado y la cama sigue igual ⇒ lo de siempre (el payload)',
  R('hme', '2026-07-05', '2026-07-05', { hme: '2026-07-05' }), '2026-07-05');
eq('payload viejo sin original ⇒ lo de siempre', R('hme', '2026-07-05', '2026-07-03', null), '2026-07-05');
eq('original sin esa clave ⇒ lo de siempre', R('tc', '2026-07-05', '2026-07-03', { hme: '2026-07-05' }), '2026-07-05');
eq('la cama borró la fecha después (no tocado) ⇒ queda vacía', R('hme', '2026-07-05', '', { hme: '2026-07-05' }), '');
const datos = { DISP_HME_FECHA: '2026-07-05', DISP_HEPA_FECHA: '2026-07-04', VENT_FECHA_SONDA: '2026-07-02',
  DISP_ORIG_JSON: JSON.stringify({ hme: '2026-07-05', hepa: '2026-07-04', tc: '2026-07-02' }) };
const cama = { DISP_HME_FECHA: '2026-07-03', DISP_HEPA_FECHA: '2026-07-04', DISP_TC_FECHA: '2026-07-06' };
const corr = global._dispAplicarUltimaEdicion(datos, cama);
eq('se corrigen EN EL PAYLOAD solo los que otro editó después', corr.join(), 'hme,tc');
eq('…HME toma la de la cama', datos.DISP_HME_FECHA, '2026-07-03');
eq('…Trach Care toma la de la cama', datos.VENT_FECHA_SONDA, '2026-07-06');
eq('…el HEPA no se toca', datos.DISP_HEPA_FECHA, '2026-07-04');
const sello = JSON.parse(global._dispSelloEdicion(
  { DISP_HME_FECHA: '2026-07-03', DISP_HEPA_FECHA: '2026-07-04', DISP_EDIT_JSON: JSON.stringify({ hme: { f: 'MCC', o: 'grilla' } }) },
  { DISP_HME_FECHA: '2026-07-03', DISP_HEPA_FECHA: '2026-07-07', PLAN_FIRMA_KINE: 'DMV' }, '2026-07-07'));
eq('el sello conserva la firma de quien escribió el HME (no cambió)', sello.hme.f + '/' + sello.hme.o, 'MCC/grilla');
eq('…y firma el HEPA que este turno SÍ cambió', sello.hepa.f + '/' + sello.hepa.o, 'DMV/evolucion');

console.log('\n2 · De punta a punta: la evolución no pisa lo que la lista corrigió');
SIM.fecha = '2026-07-07'; SIM.hora = '10:00:00';
CONFIG.NUM_CAMAS = '4';
global.repoActualizar('CAMAS_ESTADO', 'ID_CAMA', '2', { OCUPADA: true, PATIENT_ID: 'pf', NOMBRE: 'PRUEBA FILTROS', VIA_AEREA: 'TOT', SOPORTE: 'VM', MODO: 'ACVC',
  FECHA_INGRESO: '2026-07-01', DISP_HME_FECHA: '2026-07-06', DISP_HEPA_FECHA: '2026-07-05', DISP_TC_FECHA: '2026-07-05', DISP_EDIT_JSON: '' });
const C = () => DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === '2');
const base = extra => Object.assign({
  idCama: '2', turnoKey: '2026-07-07-Dia', FECHA: '2026-07-07', TURNO: 'Dia', firmaKine: 'DMV',
  VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC', VENT_VT: 450, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 50,
  SED_TIPO: 'Escalón 2', SED_SAS: '2', HEMO_ESTADO: 'Estable', PLAN_PLANES: 'x', PLAN_FIRMA_KINE: 'DMV',
}, extra || {});
// El colega abre el panel a las 10:00: carga HME 06, HEPA 05, TC 05.
const orig = { hme: '2026-07-06', hepa: '2026-07-05', tc: '2026-07-05' };
// A las 10:10 otro corrige el HME desde la lista: la etiqueta real era del 04 (MÁS ANTIGUA).
SIM.hora = '10:10:00';
let r = api('EQUIPO_FILTRO_FECHA', { idCama: '2', k: 'hme', fecha: '2026-07-04', firmaKine: 'MCC' }, '');
si('la lista corrige el HME al 04', r.ok);
// A las 10:30 el primero guarda: HME sin tocar (sigue diciendo 06), HEPA lo cambió al 07.
SIM.hora = '10:30:00';
r = api('GUARDAR_EVOLUCION', base({ DISP_HME_FECHA: '2026-07-06', DISP_HEPA_FECHA: '2026-07-07', VENT_FECHA_SONDA: '2026-07-05',
  DISP_ORIG_JSON: JSON.stringify(orig) }), '');
si('la evolución guarda', r.ok);
eq('★ el HME de la cama sigue en el 04 (la corrección de la lista NO se pisó)', String(C().DISP_HME_FECHA).slice(0, 10), '2026-07-04');
eq('★ el HEPA sí tomó lo que el colega escribió (07)', String(C().DISP_HEPA_FECHA).slice(0, 10), '2026-07-07');
eq('el Trach Care, sin tocar y sin cambio, sigue igual', String(C().DISP_TC_FECHA).slice(0, 10), '2026-07-05');
const evo = DB.EVOLUCIONES.find(e => String(e.ID_CAMA) === '2' && e.TURNO_KEY === '2026-07-07-Dia');
eq('★ la fila del turno dice lo mismo que la cama (HME 04), no lo que tenía el panel', String(evo.DISP_HME_FECHA).slice(0, 10), '2026-07-04');
si('DISP_ORIG_JSON no es columna de EVOLUCIONES (transitorio, como PAC_RUT)',
  !/DISP_ORIG_JSON/.test(require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'v2', 'esquema.gs'), 'utf8')));
const s2 = JSON.parse(C().DISP_EDIT_JSON || '{}');
eq('el sello del HME sigue diciendo MCC desde la lista', s2.hme.f + '/' + s2.hme.o, 'MCC/grilla');
eq('el sello del HEPA dice DMV desde la evolución', s2.hepa.f + '/' + s2.hepa.o, 'DMV/evolucion');

console.log('\n3 · Un payload viejo (sin original) se comporta como siempre');
SIM.hora = '11:00:00';
r = api('EQUIPO_FILTRO_FECHA', { idCama: '2', k: 'hme', fecha: '2026-07-03', firmaKine: 'MCC' }, '');
r = api('GUARDAR_EVOLUCION', base({ DISP_HME_FECHA: '2026-07-06', DISP_HEPA_FECHA: '2026-07-07', VENT_FECHA_SONDA: '2026-07-05' }), '');
si('guarda', r.ok);
eq('sin DISP_ORIG_JSON el payload manda (comportamiento anterior, para clientes viejos)', String(C().DISP_HME_FECHA).slice(0, 10), '2026-07-06');

console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS: ' + fails.join(' | ') : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
