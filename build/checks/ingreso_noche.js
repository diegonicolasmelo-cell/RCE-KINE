// ingreso_noche.js — El ingreso de turno Noche pasada la medianoche fecha al
// día SIGUIENTE, como la lista oficial del hospital (BUDA).
//
// REPORTE DE DIEGO (5-ago-2026): un ingreso real registrado en turno Noche
// después de la medianoche quedaba fechado con el día del TURNO (p.ej. la
// noche del 3 se anotaba «03-ago» aunque el paciente llegó a las 04:00 del
// 4). BUDA fecha eso el día siguiente. La app ya pedía la hora de ingreso
// («Hora ingreso» del formulario, PAC_HORA_INGRESO) pero solo la usaba para
// TS_INGRESO (con _tsDesdeHora, relativo a AHORA, no al turno) — FECHA_INGRESO
// (la que cuenta para BUDA/REM/DIA_ESTADIA) caía siempre en la fecha del
// turno, sin mirar la hora.
//
// LA REGLA (igual que el ciclo de prono, v5.33): con _tsEventoTurno, un turno
// Noche con hora escrita <12:00 pertenece al día SIGUIENTE del turno; con hora
// ≥12:00 (o de la tarde/noche) pertenece al mismo día del turno. Turno Día
// nunca cruza medianoche: no cambia.
//
// Uso: node build/checks/ingreso_noche.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

const DB = { CAMAS_ESTADO: [], EVOLUCIONES: [], TIMELINE: [], PROCEDIMIENTOS: [] };
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
global.validarPayloadEvolucion = () => [];
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
eval(['infra_fechas.gs', 'dominio_texto.gs', 'svc_camas.gs', 'svc_evoluciones.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

const cama = idCama => DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === String(idCama));
const nuevaCama = idCama => { DB.CAMAS_ESTADO.push({ ID_CAMA: idCama, OCUPADA: false }); };
const ingresar = (idCama, tk, horaIngreso) => guardarEvolucion({
  ID_CAMA: idCama, TURNO_KEY: tk, ES_INGRESO: true, PAC_NOMBRE: 'X',
  PAC_HORA_INGRESO: horaIngreso, PLAN_FIRMA_KINE: 'DMV', VENT_VIA_AEREA: 'Natural', VENT_SOPORTE: 'Ambiente',
}, { firma: 'DMV', email: 'x@y' });

/* ══ 1 · Turno Noche, hora de madrugada → día SIGUIENTE ═════════════════ */
console.log('\n1 · Turno Noche del 3-ago, ingreso real a las 04:00 (ya el día 4)');
nuevaCama('20');
AHORA = { fecha: '2026-08-04', hora: '09:00' };
const r1 = ingresar('20', '2026-08-03-Noche', '04:00');
eq('guardarEvolucion ok', r1.ok, true);
eq('FECHA_INGRESO → 04-ago (no la fecha del turno, 03-ago)', cama('20').FECHA_INGRESO, '2026-08-04');
eq('TS_INGRESO con la hora real, ya en el día 4', cama('20').TS_INGRESO, '2026-08-04 04:00');

/* ══ 2 · Turno Noche, hora de la tarde/noche → mismo día del turno ══════ */
console.log('\n2 · Turno Noche del 3-ago, ingreso real a las 23:00 (sigue siendo el día 3)');
nuevaCama('21');
const r2 = ingresar('21', '2026-08-03-Noche', '23:00');
eq('guardarEvolucion ok', r2.ok, true);
eq('FECHA_INGRESO → 03-ago (la fecha del turno, sin cruzar)', cama('21').FECHA_INGRESO, '2026-08-03');
eq('TS_INGRESO con la hora real del mismo día', cama('21').TS_INGRESO, '2026-08-03 23:00');

/* ══ 3 · Turno Día: nunca cruza medianoche, no cambia ═══════════════════ */
console.log('\n3 · Turno Día del 4-ago, ingreso a las 10:00');
nuevaCama('22');
const r3 = ingresar('22', '2026-08-04-Dia', '10:00');
eq('guardarEvolucion ok', r3.ok, true);
eq('FECHA_INGRESO → 04-ago (la fecha del turno, sin cambio de comportamiento)', cama('22').FECHA_INGRESO, '2026-08-04');
eq('TS_INGRESO → 04-ago 10:00', cama('22').TS_INGRESO, '2026-08-04 10:00');

/* ══ 4 · Sin hora escrita: cae al registro (comportamiento previo, intacto) ══ */
console.log('\n4 · Sin hora de ingreso escrita');
nuevaCama('23');
AHORA = { fecha: '2026-08-04', hora: '11:30' };
const r4 = ingresar('23', '2026-08-04-Dia', '');
eq('guardarEvolucion ok', r4.ok, true);
eq('FECHA_INGRESO → fecha del turno (sin hora, no hay nada que resolver)', cama('23').FECHA_INGRESO, '2026-08-04');
eq('TS_INGRESO cae al momento del registro', cama('23').TS_INGRESO, '2026-08-04 11:30');

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ ingreso_noche OK');
process.exit(fails.length ? 1 : 0);
