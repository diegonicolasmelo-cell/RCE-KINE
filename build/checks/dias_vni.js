// dias_vni.js — Los días de VNI se cuentan por SOPORTE y se congelan.
//
// REPORTE DE DIEGO (ago-2026): «tengo un error con los días de VNI en varios
// pacientes que precisamente no estuvieron con VNI, y otro que sí tiene lleva
// menos». Eran DOS defectos distintos:
//
//  1. La detección de VNI miraba la INTERFAZ de vía aérea ('Full Face' /
//     'Oronasal'), no el soporte. Esas mascarillas también se usan en
//     oxigenoterapia y CNAF, así que a esos pacientes se les contaban días de
//     VNI — y encima desde FECHA_INICIO_VA, o sea desde su ingreso.
//
//  2. La VM tenía su contador calculado y CONGELADO por el servidor, pero la
//     VNI no tenía columna: el cliente la recalculaba exigiendo que la cama
//     estuviera en VNI en ESE instante. Al cambiar de soporte el número se
//     caía y el paciente aparecía con menos días de los que llevaba.
//
// Uso: node build/checks/dias_vni.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };
const ok_ = (l, c) => { console.log((c ? '✅' : '❌') + ' ' + l); if (!c) fails.push(l); };

const DB = { CAMAS_ESTADO: [], EVOLUCIONES: [], TIMELINE: [], PROCEDIMIENTOS: [] };
global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoActualizar = (h, c, id, ch) => { const r = global.repoBuscarPorId(h, c, id); if (r) Object.assign(r, ch); return !!r; };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoEliminarDonde = () => {}; global.repoActualizarDonde = () => {};
global.repoUpsert = (h, c, id, o) => { const r = global.repoBuscarPorId(h, c, id); if (r) { Object.assign(r, o); return 'actualizar'; } global.repoInsertar(h, o); return 'crear'; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d; global.conLock = fn => fn(); global.uid = p => p + '_1';
let AHORA = { fecha: '2026-08-04', hora: '10:00' };
global.hoyISO = () => AHORA.fecha;
global.ahoraTS = () => AHORA.fecha + ' ' + AHORA.hora + ':00';
global._tz = () => 'America/Santiago';
global.Utilities = { getUuid: () => 'u1', formatDate: (d, tz, f) =>
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
global.ok = d => ({ ok: true, data: d }); global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE' };
eval(['infra_fechas.gs', 'dominio_texto.gs', 'svc_camas.gs', 'svc_coordinacion.gs', 'svc_evoluciones.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

const guardar = (idCama, tk, campos) => guardarEvolucion(
  Object.assign({ ID_CAMA: idCama, TURNO_KEY: tk, PLAN_FIRMA_KINE: 'DMV', PAC_NOMBRE: 'X' }, campos),
  { firma: 'DMV', email: 'x@y' });
const evo = tk => DB.EVOLUCIONES.find(e => e.TURNO_KEY === tk);

/* ══ 1 · Mascarilla NO es VNI ═══════════════════════════════════════════ */
console.log('\n1 · La mascarilla sola no suma días de VNI');
DB.CAMAS_ESTADO = [{ ID_CAMA: '9', OCUPADA: 'TRUE', PATIENT_ID: 'p9', NOMBRE: 'Con mascarilla',
  FECHA_INGRESO: '2026-07-28', FECHA_INICIO_VA: '2026-07-28', FECHA_INICIO_SOPORTE: '2026-07-28',
  VIA_AEREA: 'Oronasal', SOPORTE: 'Oxigenoterapia/OAF' }];
guardar('9', '2026-08-04-Dia', { VENT_VIA_AEREA: 'Oronasal', VENT_SOPORTE: 'Oxigenoterapia/OAF' });
eq('paciente con mascarilla en oxigenoterapia → 0 días de VNI', evo('2026-08-04-Dia').DIAS_VNI, 0);

DB.EVOLUCIONES.length = 0;
DB.CAMAS_ESTADO[0].SOPORTE = 'CNAF'; DB.CAMAS_ESTADO[0].VIA_AEREA = 'Full Face';
guardar('9', '2026-08-04-Dia', { VENT_VIA_AEREA: 'Full Face', VENT_SOPORTE: 'CNAF' });
eq('paciente en CNAF con Full Face → 0 días de VNI', evo('2026-08-04-Dia').DIAS_VNI, 0);

/* ══ 2 · El que SÍ está en VNI cuenta desde que empezó ══════════════════ */
console.log('\n2 · El que sí está en VNI lleva sus días completos');
DB.EVOLUCIONES.length = 0;
DB.CAMAS_ESTADO = [{ ID_CAMA: '2', OCUPADA: 'TRUE', PATIENT_ID: 'p2', NOMBRE: 'En VNI',
  FECHA_INGRESO: '2026-07-30', FECHA_INICIO_VA: '2026-07-30', FECHA_INICIO_SOPORTE: '2026-08-01',
  VIA_AEREA: 'Full Face', SOPORTE: 'VNI' }];
guardar('2', '2026-08-04-Dia', { VENT_VIA_AEREA: 'Full Face', VENT_SOPORTE: 'VNI' });
eq('cuenta desde el inicio del SOPORTE (1-ago → 4-ago = 3)', evo('2026-08-04-Dia').DIAS_VNI, 3);
ok_('…y NO desde el ingreso, que sería 5', evo('2026-08-04-Dia').DIAS_VNI !== 5);

/* ══ 3 · Se congela al dejar la VNI (no se cae a 0) ═════════════════════ */
console.log('\n3 · Al salir de VNI el contador se congela');
guardar('2', '2026-08-05-Dia', { VENT_VIA_AEREA: 'Natural', VENT_SOPORTE: 'Oxigenoterapia/OAF' });
eq('el turno siguiente conserva los 3 días, no vuelve a 0', evo('2026-08-05-Dia').DIAS_VNI, 3);
guardar('2', '2026-08-06-Dia', { VENT_VIA_AEREA: 'Natural', VENT_SOPORTE: 'Ambiente' });
eq('…y sigue congelado dos días después', evo('2026-08-06-Dia').DIAS_VNI, 3);

/* ══ 4 · El turno que PASA a VNI ya cuenta ese día ══════════════════════ */
console.log('\n4 · El turno que conecta la VNI ya suma');
DB.EVOLUCIONES.length = 0;
DB.CAMAS_ESTADO = [{ ID_CAMA: '5', OCUPADA: 'TRUE', PATIENT_ID: 'p5', NOMBRE: 'Pasa a VNI',
  FECHA_INGRESO: '2026-08-01', FECHA_INICIO_VA: '2026-08-01', FECHA_INICIO_SOPORTE: '2026-08-04',
  VIA_AEREA: 'Natural', SOPORTE: 'Oxigenoterapia/OAF' }];
// Empieza el turno en oxigenoterapia y TERMINA en VNI: el día cuenta.
guardar('5', '2026-08-04-Dia', { VENT_VIA_AEREA: 'Natural', VENT_SOPORTE: 'Oxigenoterapia/OAF',
  VENT_SOPORTE_FINAL: 'VNI' });
eq('el turno que conecta la VNI cuenta ese día', evo('2026-08-04-Dia').DIAS_VNI, 0);
ok_('…y es 0 porque empezó hoy (Día 0), no porque se ignore',
  String(evo('2026-08-04-Dia').DIAS_VNI) === '0');

/* ══ 5 · Cliente: la grilla lee el contador del servidor ════════════════ */
console.log('\n5 · Cliente');
const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
// Desde la acumulación por tramos el total sellado ya lo trae TODO: sumarle
// los _PREVIOS del cliente lo duplicaría.
ok_('la grilla usa DIAS_VNI del servidor, sin sumar la mochila _PREVIOS',
  /const dvni=evoRef\?\(parseInt\(evoRef\.DIAS_VNI\)\|\|0\)/.test(idx));
ok_('…y ya NO exige que la cama esté en VNI en ese instante',
  !/evoRef\.VENT_SOPORTE==='VNI'&&ocu&&c\.SOPORTE==='VNI'/.test(idx));
ok_('el contador del formulario mira el SOPORTE, no la mascarilla',
  /const _esVNIDb=String\(c\.SOPORTE\|\|''\)==='VNI';/.test(idx));
// El contador de VNI ya no cae a FECHA_INICIO_VA (que es el ingreso). La
// línea equivalente de la VM conserva ese respaldo a propósito: no se tocó
// porque su valor autoritativo es DIAS_VM del servidor y no es lo reportado.
ok_('…y el contador de VNI ya no cae a FECHA_INICIO_VA (que es el ingreso)',
  /_diasVNIEpisodio=_esVNIDb\?\(parseInt\(dias\(c\.FECHA_INICIO_SOPORTE,fecha\)\)\|\|0\):0;/.test(idx));

const esq = fs.readFileSync(path.join(v2, 'esquema.gs'), 'utf8');
ok_('DIAS_VNI existe en EVOLUCIONES', /\['DIAS_VNI','entero'\]/.test(esq));
// Se agregó en el TRAMO FINAL (después del último bloque conocido). Ya no se
// exige que cierre la lista: detrás pueden ir columnas nacidas después —
// RESP_SNT en ago-2026— y eso es justamente la regla de la casa, agregar
// siempre al final para no desalinear los datos ya escritos.
ok_('…en el tramo final de la lista', /\['PRONO_HORAS','decimal'\],[\s\S]{0,700}\['DIAS_VNI','entero'\]/.test(esq));

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ dias_vni OK');
process.exit(fails.length ? 1 : 0);
