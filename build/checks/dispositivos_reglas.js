// dispositivos_reglas.js — CADA DISPOSITIVO SIGUE A LO QUE LE DA SENTIDO
// (v5.60, decisiones de Diego del 14-ago-2026).
//
// 🔴 DE DÓNDE SALE. Dos reportes de Diego el mismo día:
//   1. «PB1, PB980, AVEA no ocupan HEPA intercambiable cada 3 días. En
//      realidad este se mantiene desde su instalación, por lo que no requiere
//      cambio de HEPA.» Y al preguntarle los bordes: la Vela SIGUE con el
//      ciclo; una cama sin ventilador asignado NO aplica HEPA; podría ser HME
//      si está con TQT o tubo a HME; y con vía aérea artificial podría tener
//      Trach Care.
//   2. «Noté un problema con la instalación de la humidificación activa: AL
//      INSTALARLA no borra la fecha del HME y sigue manteniendo la fecha de
//      cambio. Esto no es correcto porque el HME se retira.» La causa era
//      ESTADO REDUNDANTE: la humidificación vive en un checkbox
//      (VENT_H_ACTIVA) y en una fecha (DISP_HUMID_FECHA), y el retiro del HME
//      solo escuchaba al checkbox — fechar sin marcar dejaba el filtro
//      retirado pidiendo cambio.
//
// LAS REGLAS QUE ESTA GUARDIA FIJA (espejo en estadoDispositivos de
// svc_eventos.gs, la entrega, _dispAplicaCama del index y el sync de
// svc_evoluciones.gs):
//   · HEPA = del VENTILADOR: solo VM con equipo asignado; si el equipo está
//     en CONFIG HEPA_FIJO_EQUIPOS (defecto PB,Avea — por prefijo) es FIJO:
//     su fecha es referencia de instalación y JAMÁS vence ni pide cambio.
//   · HME = del CIRCUITO DE GAS: VM sin humidificación activa, o respirando
//     por HME (modo HME con TOT/TQT, aunque no haya VM).
//   · Trach Care = de la VÍA AÉREA artificial (TOT/TQT, esté o no en VM).
//   · Humidificación: fecha ⇔ checkbox son EL MISMO hecho — cualquiera de los
//     dos la activa (y retira el HME); desmarcarla la retira de verdad (antes
//     val() la resucitaba desde el episodio).
//   · Al salir de VM: HEPA se descarta siempre; TC sobrevive si queda TOT/TQT;
//     HME sobrevive si queda respirando por HME.
//
// Uso: node build/checks/dispositivos_reglas.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

/* ── Arnés (mismo patrón de dias_soporte.js) ── */
const DB = { CAMAS_ESTADO: [], EVOLUCIONES: [], TIMELINE: [], PROCEDIMIENTOS: [], REINTUBACIONES: [], ARCHIVO_PACIENTES: [], VENTILADORES: [] };
const CONFIG = {};
global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoLeerFiltrado = (h, col, pred) => (DB[h] || []).filter(r => pred(r[col]));
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoActualizar = (h, c, id, ch) => { const r = global.repoBuscarPorId(h, c, id); if (r) Object.assign(r, ch); return !!r; };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoEliminarDonde = () => {}; global.repoActualizarDonde = () => {};
global.repoUpsert = (h, c, id, o) => { const r = global.repoBuscarPorId(h, c, id); if (r) { Object.assign(r, o); return 'actualizar'; } global.repoInsertar(h, o); return 'crear'; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => (CONFIG[k] !== undefined ? CONFIG[k] : d);
global.conLock = fn => fn();
let _n = 0; global.uid = p => p + '_' + (++_n);
const AHORA = { fecha: '2026-08-14', hora: '10:00' };
global.hoyISO = () => AHORA.fecha;
global.ahoraTS = () => AHORA.fecha + ' ' + AHORA.hora + ':00';
global._tz = () => 'America/Santiago';
global.Utilities = { getUuid: () => 'u' + (++_n), formatDate: (d, tz, f) =>
  f === 'HH:mm' ? AHORA.hora : (String(f).indexOf('HH') > -1 ? AHORA.fecha + ' ' + AHORA.hora + ':00' : AHORA.fecha) };
global.SpreadsheetApp = { flush: () => {} };
global.validarPayloadEvolucion = () => []; global.validarPayloadIngreso = () => [];
global.generarCodPaciente = () => 'PAC'; global._codUnico = c => c; global._rutNormal = r => String(r || '');
global._agregarHitoInterno = () => {}; global._guardarProcedimientosInterno = () => {}; global._timelineDelGuardado = () => '[]';
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
// La categoría del equipo vive en svc_equipos.gs; se copia lo mínimo que usa
// _ventNombreDeCama (la regla real la vigila equipos_categoria.js).
global._vmCategoria = x => String(x.CATEGORIA || 'VM').trim().toUpperCase();
global._vmEsDeCama = c => String(c) === 'VM';
eval(['infra_fechas.gs', 'dominio_texto.gs', 'svc_stats.gs', 'svc_camas.gs', 'svc_evoluciones.gs', 'svc_eventos.gs', 'svc_entrega.gs', 'mantenimiento_manuel.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

// Inventario con los nombres REALES del hospital (mantenimiento.gs): un PB
// (HEPA fijo), un Avea (fijo), una Vela (de ciclo) y una cama sin equipo.
DB.VENTILADORES = [
  { NOMBRE: 'PB 1',   ACTIVO: 'TRUE', UBIC_TIPO: 'CAMA', UBIC_DETALLE: '1', CATEGORIA: 'VM' },
  { NOMBRE: 'Avea 3', ACTIVO: 'TRUE', UBIC_TIPO: 'CAMA', UBIC_DETALLE: '2', CATEGORIA: 'VM' },
  { NOMBRE: 'Vela 9', ACTIVO: 'TRUE', UBIC_TIPO: 'CAMA', UBIC_DETALLE: '3', CATEGORIA: 'VM' },
];
_ventPorCamaMemo = null;

/* ══ 1 · estadoDispositivos: LA REGLA DE CADA DISPOSITIVO ═══════════════ */
console.log('\n1 · HEPA fijo, HME por circuito, Trach Care por vía aérea');
const F = { DISP_HME_FECHA: '2026-08-10', DISP_HEPA_FECHA: '2026-08-08', DISP_TC_FECHA: '2026-08-10' };
const d1 = (cama, ref) => { const m = {}; estadoDispositivos(cama, ref || '2026-08-14').forEach(x => { m[x.k] = x; }); return m; };

// PB en VM: el HEPA aplica (se ve) pero es FIJO — jamás vence ni pide cambio.
let e = d1(Object.assign({ ID_CAMA: '1', SOPORTE: 'VM', VIA_AEREA: 'TOT' }, F));
eq('PB · el HEPA aplica (se muestra como referencia)', e.hepa.aplica, true);
eq('★ PB · el HEPA es FIJO', e.hepa.fija, true);
eq('★ PB · con etiqueta de hace 6 días NO vence ni cambia esta noche',
  e.hepa.vence || e.hepa.cambiaEstaNoche || e.hepa.venceManana, false);
eq('★ PB · sin fecha de cambio anunciada', e.hepa.fechaCambio, '');
eq('PB · el HME de la misma cama sigue ciclando normal', e.hme.vence, true);

// Avea: misma regla por prefijo.
e = d1(Object.assign({ ID_CAMA: '2', SOPORTE: 'VM', VIA_AEREA: 'TOT' }, F));
eq('Avea · el HEPA también es fijo', e.hepa.fija, true);

// Vela: sigue con el ciclo de siempre (etiqueta 08 + frec 3 → vencida el 14).
e = d1(Object.assign({ ID_CAMA: '3', SOPORTE: 'VM', VIA_AEREA: 'TOT' }, F));
eq('Vela · el HEPA NO es fijo', e.hepa.fija, false);
eq('Vela · y su ciclo sigue corriendo (vencido)', e.hepa.vence, true);

// Cama sin ventilador asignado: no hay dónde poner un HEPA.
e = d1(Object.assign({ ID_CAMA: '9', SOPORTE: 'VM', VIA_AEREA: 'TOT' }, F));
eq('★ sin ventilador asignado · el HEPA no aplica', e.hepa.aplica, false);
eq('  …pero el HME sí (es del circuito, no del equipo)', e.hme.aplica, true);

// Humidificación activa puesta: el HME está retirado.
e = d1(Object.assign({ ID_CAMA: '3', SOPORTE: 'VM', VIA_AEREA: 'TOT', DISP_HUMID_FECHA: '2026-08-13' }, F));
eq('★ con humidificación activa · el HME no aplica ni vence', e.hme.aplica || e.hme.vence, false);
eq('  …y el Trach Care no se inmuta', e.tc === undefined ? e.sonda.aplica : e.tc.aplica, true);

// TQT respirando por HME, SIN VM: HME y Trach Care ciclan; HEPA no existe.
e = d1(Object.assign({ ID_CAMA: '3', SOPORTE: 'Oxigenoterapia/OAF', MODO: 'HME', VIA_AEREA: 'TQT' }, F));
eq('★ TQT a HME sin VM · el HME aplica y cicla', e.hme.aplica && e.hme.vence, true);
eq('★ TQT sin VM · el Trach Care aplica y cicla', e.sonda.aplica && e.sonda.vence, true);
eq('  …y el HEPA no aplica (no hay VM)', e.hepa.aplica, false);

// Vía aérea natural: nada de Trach Care.
e = d1(Object.assign({ ID_CAMA: '3', SOPORTE: 'Oxigenoterapia/OAF', VIA_AEREA: 'Natural' }, F));
eq('vía aérea natural · el Trach Care no aplica', e.sonda.aplica, false);

// La lista es de CONFIG, no de código: si Diego escribe otra, manda la suya.
CONFIG.HEPA_FIJO_EQUIPOS = 'Vela';
e = d1(Object.assign({ ID_CAMA: '3', SOPORTE: 'VM', VIA_AEREA: 'TOT' }, F));
eq('★ CONFIG manda: con HEPA_FIJO_EQUIPOS=Vela, la Vela pasa a fija', e.hepa.fija, true);
e = d1(Object.assign({ ID_CAMA: '1', SOPORTE: 'VM', VIA_AEREA: 'TOT' }, F));
eq('  …y el PB deja de serlo', e.hepa.fija, false);
delete CONFIG.HEPA_FIJO_EQUIPOS;

/* ══ 2 · cambiosEstaNoche: EL HEPA FIJO NO ENTRA A LA RONDA ═════════════ */
console.log('\n2 · La ronda de la noche ignora el HEPA fijo');
DB.CAMAS_ESTADO = [
  Object.assign({ ID_CAMA: '1', OCUPADA: 'TRUE', NOMBRE: 'Con PB', SOPORTE: 'VM', VIA_AEREA: 'TOT' }, F),
  Object.assign({ ID_CAMA: '3', OCUPADA: 'TRUE', NOMBRE: 'Con Vela', SOPORTE: 'VM', VIA_AEREA: 'TOT' }, F),
];
let cn = cambiosEstaNoche('2026-08-14').data.camas;
const porCama = id => (cn.find(c => c.idCama === id) || { dispositivos: [] }).dispositivos.map(d => d.k).sort().join(',');
eq('★ cama con PB: la ronda pide HME y sonda, NUNCA su HEPA', porCama('1'), 'hme,sonda');
eq('cama con Vela: la ronda sí incluye el HEPA vencido', porCama('3'), 'hepa,hme,sonda');

/* ══ 3 · EL BUG DE LA HUMIDIFICACIÓN, DE PUNTA A PUNTA ══════════════════ */
console.log('\n3 · Fechar la humidificación retira el HME (con o sin checkbox)');
const guardar = (idCama, tk, campos) => guardarEvolucion(
  Object.assign({ ID_CAMA: idCama, TURNO_KEY: tk, PLAN_FIRMA_KINE: 'DMV', PAC_NOMBRE: 'X' }, campos),
  { firma: 'DMV', email: 'x@y' });
const cama0 = () => DB.CAMAS_ESTADO[0];

DB.EVOLUCIONES = []; DB.TIMELINE = [];
DB.CAMAS_ESTADO = [{ ID_CAMA: '3', OCUPADA: 'TRUE', PATIENT_ID: 'pH', NOMBRE: 'Humid Prueba',
  FECHA_INGRESO: '2026-08-10', FECHA_INICIO_VA: '2026-08-10', FECHA_INICIO_SOPORTE: '2026-08-10',
  VIA_AEREA: 'TOT', SOPORTE: 'VM',
  DISP_HME_FECHA: '2026-08-13', DISP_HEPA_FECHA: '2026-08-12', DISP_TC_FECHA: '2026-08-13' }];

// EL CASO DE DIEGO: se fecha la humidificación pero el checkbox quedó sin
// marcar. Antes el HME conservaba su fecha y seguía pidiendo cambio.
let r = guardar('3', '2026-08-14-Dia', { VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM',
  VENT_H_ACTIVA: '', DISP_HUMID_FECHA: '2026-08-14' });
eq('el guardado corre', r.ok, true);
eq('★ la humidificación quedó instalada en la cama', cama0().DISP_HUMID_FECHA, '2026-08-14');
eq('★ y la fecha del HME se BORRÓ (el filtro se retira)', cama0().DISP_HME_FECHA, '');
eq('  el HEPA y el Trach Care no se tocan',
  cama0().DISP_HEPA_FECHA + '/' + cama0().DISP_TC_FECHA, '2026-08-12/2026-08-13');

// Y AL REVÉS: retirarla (checkbox e fecha vacíos) la retira DE VERDAD — antes
// val('') hacía arrastre desde el episodio y la resucitaba.
r = guardar('3', '2026-08-14-Noche', { VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM',
  VENT_H_ACTIVA: '', DISP_HUMID_FECHA: '', DISP_HME_FECHA: '2026-08-15' });
eq('★ desmarcada y sin fecha: la humidificación sale de la cama', cama0().DISP_HUMID_FECHA, '');
eq('  y el HME nuevo que se instaló queda fechado', cama0().DISP_HME_FECHA, '2026-08-15');

// El checkbox solo (sin fecha) también instala, con la fecha del turno.
r = guardar('3', '2026-08-15-Dia', { VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM',
  VENT_H_ACTIVA: 'TRUE', DISP_HUMID_FECHA: '' });
eq('checkbox sin fecha: instala igual (fecha del turno)', cama0().DISP_HUMID_FECHA, '2026-08-15');
eq('  …y vuelve a retirar el HME', cama0().DISP_HME_FECHA, '');

/* ══ 4 · AL SALIR DE VM, CADA UNO A LO SUYO ═════════════════════════════ */
console.log('\n4 · Extubación vs weaning por TQT: qué sobrevive del circuito');
// Extubado a oxigenoterapia: vía aérea natural ⇒ se descarta TODO el circuito.
DB.EVOLUCIONES = []; DB.TIMELINE = [];
DB.CAMAS_ESTADO = [{ ID_CAMA: '3', OCUPADA: 'TRUE', PATIENT_ID: 'pE', NOMBRE: 'Extubada',
  FECHA_INGRESO: '2026-08-10', FECHA_INICIO_VA: '2026-08-10', FECHA_INICIO_SOPORTE: '2026-08-10',
  VIA_AEREA: 'TOT', SOPORTE: 'VM',
  DISP_HME_FECHA: '2026-08-13', DISP_HEPA_FECHA: '2026-08-12', DISP_TC_FECHA: '2026-08-13' }];
r = guardar('3', '2026-08-14-Dia', { VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM',
  EXT_OCURRIO: 'TRUE', VENT_VIA_AEREA_FINAL: 'Natural', VENT_SOPORTE_FINAL: 'Oxigenoterapia/OAF', VENT_MODO_FINAL: 'MMV' });
eq('extubación · HME, HEPA y Trach Care quedan vacíos',
  cama0().DISP_HME_FECHA + '|' + cama0().DISP_HEPA_FECHA + '|' + cama0().DISP_TC_FECHA, '||');

// Weaning por TQT a HME: la vía aérea SIGUE artificial y respira POR el HME
// ⇒ Trach Care y HME sobreviven; el HEPA (del ventilador) se descarta.
DB.EVOLUCIONES = []; DB.TIMELINE = [];
DB.CAMAS_ESTADO = [{ ID_CAMA: '3', OCUPADA: 'TRUE', PATIENT_ID: 'pW', NOMBRE: 'Weaning TQT',
  FECHA_INGRESO: '2026-08-10', FECHA_INICIO_VA: '2026-08-10', FECHA_INICIO_SOPORTE: '2026-08-10',
  VIA_AEREA: 'TQT', SOPORTE: 'VM',
  DISP_HME_FECHA: '2026-08-13', DISP_HEPA_FECHA: '2026-08-12', DISP_TC_FECHA: '2026-08-13' }];
r = guardar('3', '2026-08-14-Dia', { VENT_VIA_AEREA: 'TQT', VENT_SOPORTE: 'VM',
  VENT_SOPORTE_FINAL: 'Oxigenoterapia/OAF', VENT_MODO_FINAL: 'HME' });
eq('★ weaning TQT a HME · el Trach Care sobrevive', cama0().DISP_TC_FECHA, '2026-08-13');
eq('★ weaning TQT a HME · el HME sobrevive', cama0().DISP_HME_FECHA, '2026-08-13');
eq('★ weaning TQT a HME · el HEPA se descarta (era del ventilador)', cama0().DISP_HEPA_FECHA, '');

/* ══ 5 · LA ENTREGA DE TURNO DICE LO MISMO ══════════════════════════════ */
console.log('\n5 · La entrega: por dispositivo, no «solo VM»');
DB.EVOLUCIONES = []; DB.TIMELINE = []; DB.PROCEDIMIENTOS = []; DB.ENTREGAS_TURNO = [];
DB.CAMAS_ESTADO = [
  Object.assign({ ID_CAMA: '1', OCUPADA: 'TRUE', PATIENT_ID: 'p1', NOMBRE: 'Con PB',
    FECHA_INGRESO: '2026-08-10', SOPORTE: 'VM', VIA_AEREA: 'TOT' }, F),
  Object.assign({ ID_CAMA: '3', OCUPADA: 'TRUE', PATIENT_ID: 'p3', NOMBRE: 'Con Vela',
    FECHA_INGRESO: '2026-08-10', SOPORTE: 'VM', VIA_AEREA: 'TOT' }, F),
  { ID_CAMA: '5', OCUPADA: 'TRUE', PATIENT_ID: 'p5', NOMBRE: 'TQT decanulando',
    FECHA_INGRESO: '2026-08-10', SOPORTE: 'Oxigenoterapia/OAF', MODO: 'HME', VIA_AEREA: 'TQT',
    DISP_HME_FECHA: '2026-08-13', DISP_TC_FECHA: '2026-08-13' },
];
r = obtenerEntregaTurno(['1', '3', '5'], '2026-08-14', 'Dia');
const dispDe = id => (r.data.fichas.find(x => x.idCama === id).dispositivos || []).map(d => d.n).sort().join(',');
eq('★ cama con PB: la entrega NO lista su HEPA fijo', dispDe('1'), 'HME,T.Care');
eq('cama con Vela: la entrega lista los 3', dispDe('3'), 'HEPA,HME,T.Care');
eq('★ TQT sin VM: la entrega lista HME y T.Care (antes salía vacío)', dispDe('5'), 'HME,T.Care');

/* ══ 6 · EL ESPEJO DEL CLIENTE (estático) ═══════════════════════════════ */
console.log('\n6 · El index dice lo mismo que el servidor');
const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
eq('_dispAplicaCama existe', /function _dispAplicaCama\(cama,k\)\{/.test(idx), true);
eq('…y la hoja de filtros la usa', /_dispAplicaCama\(cama,def\.k\)/.test(idx), true);
eq('el espejo del HEPA fijo existe con el mismo defecto PB,Avea',
  /function _hepaFijoEquipo\(nom\)\{/.test(idx) && idx.includes("CFG.HEPA_FIJO_EQUIPOS)||'PB,Avea'"), true);
eq('la celda de la hoja de filtros imprime FIJA', /FIJA \(del equipo\)/.test(idx), true);
eq('la hoja diaria marca «fija (no se cambia)» en vez de fecha de cambio',
  /fija<\/b> \(no se cambia\)/.test(idx), true);
eq('★ fechar la humidificación marca el checkbox (el hoyo del reporte)',
  /id="fFecHumid" onchange="humidFechaManual\(this\.value\)"/.test(idx) &&
  /function humidFechaManual\(val\)\{/.test(idx), true);
eq('…y activar la humidificación sigue borrando el HME del formulario',
  /hme\.disabled=on; if\(on\) hme\.value='';/.test(idx), true);
eq('la Hoja UCI no muestra reloj de HME en turnos con humidificación activa',
  /dispo:\['DISP_HME_FECHA','FREC_HME_DIAS',2\], si:e=>!_hjT\(e\.VENT_H_ACTIVA\)/.test(idx), true);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK — cada dispositivo sigue a lo suyo');
process.exit(fails.length ? 1 : 0);
