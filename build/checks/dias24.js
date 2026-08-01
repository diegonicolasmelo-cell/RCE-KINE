// dias24.js — Guardia del conteo de días por BLOQUES DE 24 HORAS (v5.19,
// pedido de Diego ago-2026): «un paciente que llegó hace un par de horas no
// puede aparecer con Día 1 frente a los médicos». Desde la hora de ingreso se
// cuentan bloques de 24 h reales, igual que el sistema del hospital. Sin hora
// registrada se mantiene el conteo por días calendario (lo ya guardado no
// cambia). El REM y los indicadores NO dependen de este número.
// Uso: node build/checks/dias24.js
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
// Reloj simulado: se mueve durante la prueba
let AHORA = { fecha: '2026-08-01', hora: '10:00' };
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

/* ── 1 · La aritmética de los bloques de 24 h ── */
eq('mismo día, 2 h después → Día 0', diasBloques24('2026-08-01 08:00', '2026-08-01', '2026-08-01', '10:00'), 0);
eq('cruza la medianoche pero lleva 12 h → Día 0', diasBloques24('2026-07-31 22:00', '2026-07-31', '2026-08-01', '10:00'), 0);
eq('23 h 59 min → todavía Día 0', diasBloques24('2026-07-31 10:01', '2026-07-31', '2026-08-01', '10:00'), 0);
eq('24 h exactas → Día 1', diasBloques24('2026-07-31 10:00', '2026-07-31', '2026-08-01', '10:00'), 1);
eq('49 h → Día 2', diasBloques24('2026-07-30 09:00', '2026-07-30', '2026-08-01', '10:00'), 2);
eq('sin momento registrado cae al conteo por días calendario', diasBloques24('', '2026-07-31', '2026-08-01', '10:00'), 1);
eq('momento inválido no rompe (cae a días calendario)', diasBloques24('xx', '2026-07-31', '2026-08-01', '10:00'), 1);
eq('la hora escrita a mano toma la ocurrencia más reciente', _tsDesdeHora('02:00'), '2026-08-01 02:00');
eq('referencia del turno Día = mitad de la tarde', JSON.stringify(refTurno('2026-08-01', 'Dia')), '{"fecha":"2026-08-01","hora":"15:00"}');
eq('referencia del turno Noche = madrugada del día siguiente', JSON.stringify(refTurno('2026-07-31', 'Noche')), '{"fecha":"2026-08-01","hora":"03:00"}');

/* ── 2 · El caso real de Diego: ingreso en el turno «31 · Noche» a las 02:00 ── */
DB.CAMAS_ESTADO = [{ ID_CAMA: '1', OCUPADA: '', STATUS_CAMA: '' }];
AHORA = { fecha: '2026-08-01', hora: '02:00' };
let r = ingresarPaciente({ idCama: '1', nombre: 'Paciente Nocturno', edad: 70, sexo: 'M',
  fechaIngreso: '2026-07-31', viaAerea: 'TOT', soporte: 'VM', modo: 'ACVC' }, { firma: 'DMV' });
eq('ingreso guardado', r.ok, true);
const cama = DB.CAMAS_ESTADO[0];
eq('el MOMENTO real del ingreso queda registrado (1-ago 02:00, no 31-jul)', cama.TS_INGRESO, '2026-08-01 02:00');
eq('…y también el de inicio de VM', cama.TS_INICIO_SOPORTE, '2026-08-01 02:00');
eq('la FECHA del turno sigue siendo la del 31 (REM/estadística intactos)', cama.FECHA_INGRESO, '2026-07-31');

AHORA = { fecha: '2026-08-01', hora: '04:00' };
let censo = obtenerTodasLasCamas();
eq('a las 2 h de llegar el tablero dice Día 0', censo.data[0].DIA_ESTADIA, 0);
eq('…y 0 días de VM', censo.data[0].DIAS_VM, 0);

AHORA = { fecha: '2026-08-01', hora: '10:00' };
censo = obtenerTodasLasCamas();
eq('a las 8 h SIGUE en Día 0 (antes decía 1)', censo.data[0].DIA_ESTADIA, 0);

AHORA = { fecha: '2026-08-02', hora: '01:00' };
censo = obtenerTodasLasCamas();
eq('23 h después todavía Día 0', censo.data[0].DIA_ESTADIA, 0);
AHORA = { fecha: '2026-08-02', hora: '03:00' };
censo = obtenerTodasLasCamas();
eq('cumplidas las 24 h pasa a Día 1', censo.data[0].DIA_ESTADIA, 1);

/* ── 3 · La evolución guardada usa una referencia estable del turno ── */
AHORA = { fecha: '2026-08-01', hora: '05:00' };
r = guardarEvolucion({ ID_CAMA: '1', TURNO_KEY: '2026-07-31-Noche', PLAN_FIRMA_KINE: 'DMV',
  ES_INGRESO: true, PAC_NOMBRE: 'Paciente Nocturno',
  VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC' }, { firma: 'DMV', email: 'x@y' });
eq('la evolución del turno de ingreso se guarda', r.ok, true);
const evoIng = DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-07-31-Noche');
eq('…y queda como Día 0', evoIng.DIA_ESTADIA, 0);
eq('…con 0 días de VM (menos de 24 h: extubación fuera de protocolo)', evoIng.DIAS_VM, 0);

// Turno siguiente (1-ago Día, referencia 15:00 → 13 h desde el ingreso)
AHORA = { fecha: '2026-08-01', hora: '16:00' };
r = guardarEvolucion({ ID_CAMA: '1', TURNO_KEY: '2026-08-01-Dia', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Nocturno', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC' },
  { firma: 'DMV', email: 'x@y' });
const evoDia = DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-01-Dia');
eq('el turno Día siguiente sigue siendo Día 0 (13 h de estadía)', evoDia.DIA_ESTADIA, 0);

// Turno noche del 1-ago (referencia 03:00 del 2 → 25 h)
AHORA = { fecha: '2026-08-02', hora: '02:00' };
r = guardarEvolucion({ ID_CAMA: '1', TURNO_KEY: '2026-08-01-Noche', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Nocturno', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC' },
  { firma: 'DMV', email: 'x@y' });
const evoNoc = DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-01-Noche');
eq('la noche siguiente ya son 25 h → Día 1', evoNoc.DIA_ESTADIA, 1);

// Re-editar NO cambia el número (referencia determinista por turno)
AHORA = { fecha: '2026-08-05', hora: '11:00' };
guardarEvolucion({ ID_CAMA: '1', TURNO_KEY: '2026-08-01-Dia', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Nocturno', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
  RESP_KTR_CANT: 2 }, { firma: 'DMV', email: 'x@y' });
eq('re-editar días después NO altera los días de ese turno',
  DB.EVOLUCIONES.find(e => e.TURNO_KEY === '2026-08-01-Dia').DIA_ESTADIA, 0);

/* ── 4 · Compatibilidad: episodio SIN hora (lo ya registrado) ── */
DB.CAMAS_ESTADO.push({ ID_CAMA: '2', OCUPADA: 'TRUE', PATIENT_ID: 'p2', NOMBRE: 'Antiguo',
  FECHA_INGRESO: '2026-07-30', TS_INGRESO: '', VIA_AEREA: 'Natural', SOPORTE: 'Ambiente' });
AHORA = { fecha: '2026-08-01', hora: '10:00' };
censo = obtenerTodasLasCamas();
const antiguo = censo.data.find(c => c.ID_CAMA === '2');
eq('sin hora, el paciente antiguo mantiene su conteo por días', antiguo.DIA_ESTADIA, 2);

/* ── 5 · La hora se puede corregir a mano desde el formulario ── */
AHORA = { fecha: '2026-08-01', hora: '12:00' };
guardarEvolucion({ ID_CAMA: '2', TURNO_KEY: '2026-08-01-Dia', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Antiguo', PAC_HORA_INGRESO: '23:30',
  VENT_VIA_AEREA: 'Natural', VENT_SOPORTE: 'Ambiente' }, { firma: 'DMV', email: 'x@y' });
eq('la hora indicada en el formulario fija el momento del episodio',
  DB.CAMAS_ESTADO.find(c => c.ID_CAMA === '2').TS_INGRESO, '2026-07-31 23:30');
censo = obtenerTodasLasCamas();
eq('…y el conteo se ajusta a ella (31-07 23:30 → 1-08 12:00 = 0 días)',
  censo.data.find(c => c.ID_CAMA === '2').DIA_ESTADIA, 0);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
