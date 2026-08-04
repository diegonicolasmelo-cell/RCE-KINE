/**
 * eventos.js — Guardia de eventos rápidos + reloj de dispositivos
 * (svc_eventos.gs). Fixture a mano: fecha efectiva del turno Noche (día
 * siguiente), cambio de HME/HEPA/sonda reinicia el reloj y confirma,
 * procedimiento exige evolución guardada y suma a PROC_JSON + PROCEDIMIENTOS,
 * cultivo/otro → hito, confirmarDispositivos con y sin fecha, y
 * estadoDispositivos (vence / vence mañana).
 */
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');

// ── Stubs de infraestructura ──
const DB = {};
const HITOS = [];
global.repoLeerTodos = h => (DB[h] || []).slice();
global.repoBuscarPorId = (h, campo, id) =>
  (DB[h] || []).find(r => String(r[campo]) === String(id)) || null;
global.repoActualizar = (h, campo, id, cambios) => {
  const r = global.repoBuscarPorId(h, campo, id);
  if (r) Object.assign(r, cambios);
  return !!r;
};
global.repoInsertar = (h, obj) => { (DB[h] = DB[h] || []).push(obj); return obj; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.conLock = fn => fn();
global.uid = p => p + '_x' + Math.random().toString(36).slice(2, 8);
global.hoyISO = () => '2026-07-27';
global.ahoraTS = () => '2026-07-27 16:30';
global._agregarHitoInterno = h => { HITOS.push(h); return h; };
global.SpreadsheetApp = { flush: () => {} };
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO' };
// _fechaEfectivaTurno vive en infra_fechas.gs (se mudó allí en ago-2026, al
// empezar a usarla también los días de estadía). Se copia aquí en vez de
// cargar infra_fechas entero: ese archivo trae hoyISO/ahoraTS reales y pisaría
// los stubs de reloj de este arnés.
global._fechaEfectivaTurno = (fecha, turno) => {
  const f = String(fecha || '').slice(0, 10);
  if (String(turno) !== 'Noche') return f;
  const d = new Date(f + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

// svc_stats.gs aporta _statISO (misma normalización de fechas de producción).
eval(['svc_stats.gs', 'svc_eventos.gs'].map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + g + (okk ? '' : ' (esperado ' + w + ')'));
  if (!okk) fails.push(l);
};
const CTX = { firma: 'DMV', email: 'diego@test' };

// ── 1. Fecha efectiva del turno ──
eq('fecha efectiva Día 27 = 27', _fechaEfectivaTurno('2026-07-27', 'Dia'), '2026-07-27');
eq('fecha efectiva Noche 27 = 28 (el turno termina al día siguiente)', _fechaEfectivaTurno('2026-07-27', 'Noche'), '2026-07-28');
eq('fecha efectiva Noche fin de mes 31-jul = 01-ago', _fechaEfectivaTurno('2026-07-31', 'Noche'), '2026-08-01');

// ── 2. Cambio de dispositivo reinicia el reloj (turno Noche → fecha efectiva) ──
DB.CAMAS_ESTADO = [{
  ID_CAMA: '3', OCUPADA: true, PATIENT_ID: 'p9', SOPORTE: 'VM',
  DISP_HME_FECHA: '2026-07-25', DISP_HEPA_FECHA: '2026-07-25', DISP_TC_FECHA: '2026-07-25',
  DISP_CONFIRMADO: false,
}];
let r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Noche', tipo: 'hme', hora: '02:30' }, CTX);
eq('cambio HME ok', r.ok, true);
eq('HME resetea a la fecha EFECTIVA (28, no 27)', DB.CAMAS_ESTADO[0].DISP_HME_FECHA, '2026-07-28');
eq('HEPA no se toca', DB.CAMAS_ESTADO[0].DISP_HEPA_FECHA, '2026-07-25');
eq('cambio de dispositivo confirma el reloj', DB.CAMAS_ESTADO[0].DISP_CONFIRMADO, true);
eq('hito de dispositivo con hora y firma', HITOS[0].tipo === 'dispositivo' && HITOS[0].texto.indexOf('02:30 hrs') > -1 && HITOS[0].texto.indexOf('· DMV') > -1, true);

r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'sonda' }, CTX);
eq('cambio sonda usa DISP_TC_FECHA (turno Día = mismo día)', DB.CAMAS_ESTADO[0].DISP_TC_FECHA, '2026-07-27');

// ── 3. Procedimiento: exige evolución guardada, suma a PROC_JSON y PROCEDIMIENTOS ──
r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'procedimiento', proc: 'ECOGRAFÍA' }, CTX);
eq('procedimiento SIN evolución → rechazado', r.ok, false);
eq('mensaje pide guardar la evolución primero', /Primero guarda la evoluci/.test(r.error), true);

DB.EVOLUCIONES = [{ ID_EVOLUCION: 'CAMA_3_2026-07-27-Dia', PROC_JSON: JSON.stringify(['KTR']), PROC_CANTIDAD: 1 }];
DB.PROCEDIMIENTOS = [];
r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'procedimiento', proc: 'ECOGRAFÍA', hora: '16:30', detalle: 'derrame leve' }, CTX);
eq('procedimiento anexo ok', r.ok, true);
eq('PROC_JSON acumula', DB.EVOLUCIONES[0].PROC_JSON, JSON.stringify(['KTR', 'ECOGRAFÍA']));
eq('PROC_CANTIDAD = 2', DB.EVOLUCIONES[0].PROC_CANTIDAD, 2);
eq('PROC_RESUMEN legible', DB.EVOLUCIONES[0].PROC_RESUMEN, 'KTR, ECOGRAFÍA');
eq('fila en PROCEDIMIENTOS tipo anexo', DB.PROCEDIMIENTOS.length === 1 && DB.PROCEDIMIENTOS[0].TIPO_PROC === 'anexo' && DB.PROCEDIMIENTOS[0].NOMBRE_PROC === 'ECOGRAFÍA', true);
eq('procedimiento sin nombre → rechazado', anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'procedimiento' }, CTX).ok, false);

// ── 4. Cultivo y otro ──
r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'cultivo', cultTipo: 'Aspirado traqueal' }, CTX);
eq('cultivo sin hallazgo → "resultado pendiente"', r.ok && r.data.texto.indexOf('resultado pendiente') > -1, true);
r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'cultivo', cultTipo: 'Aspirado traqueal', cultHallazgo: 'K. pneumoniae' }, CTX);
eq('cultivo con hallazgo lo incluye', r.ok && r.data.texto.indexOf('K. pneumoniae') > -1, true);
eq('cultivo sin tipo → rechazado', anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'cultivo' }, CTX).ok, false);
r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'otro', detalle: 'Familia informada' }, CTX);
eq('otro con detalle ok', r.ok, true);
eq('otro sin detalle → rechazado', anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'otro' }, CTX).ok, false);
eq('tipo desconocido → rechazado', anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'zzz' }, CTX).ok, false);
eq('turnoKey inválido → rechazado', anexarEventoRapido({ idCama: '3', turnoKey: '27/07/2026', tipo: 'otro', detalle: 'x' }, CTX).ok, false);
eq('cama desocupada → rechazado', anexarEventoRapido({ idCama: '99', turnoKey: '2026-07-27-Dia', tipo: 'otro', detalle: 'x' }, CTX).ok, false);

// ── 5. confirmarDispositivos: con y sin fecha ──
DB.CAMAS_ESTADO[0].DISP_CONFIRMADO = false;
r = confirmarDispositivos({ idCama: '3' }, CTX);
eq('confirmar sin fecha ok', r.ok, true);
eq('confirma sin tocar fechas', DB.CAMAS_ESTADO[0].DISP_CONFIRMADO === true && DB.CAMAS_ESTADO[0].DISP_HME_FECHA === '2026-07-28', true);
r = confirmarDispositivos({ idCama: '3', fecha: '2026-07-26' }, CTX);
eq('confirmar con fecha ajusta los 3 relojes', DB.CAMAS_ESTADO[0].DISP_HME_FECHA === '2026-07-26' && DB.CAMAS_ESTADO[0].DISP_HEPA_FECHA === '2026-07-26' && DB.CAMAS_ESTADO[0].DISP_TC_FECHA === '2026-07-26', true);

// ── 6. estadoDispositivos: vence / vence mañana / no aplica ──
const cama = { SOPORTE: 'VM', DISP_HME_FECHA: '2026-07-25', DISP_HEPA_FECHA: '2026-07-26', DISP_TC_FECHA: '' };
const est = estadoDispositivos(cama, '2026-07-27');
const hme = est.find(d => d.k === 'hme'), hepa = est.find(d => d.k === 'hepa'), tc = est.find(d => d.k === 'sonda');
eq('HME instalado hace 2 días (frec 2) → VENCE', hme.vence, true);
eq('HEPA hace 1 día (frec 3) → no vence ni mañana', !hepa.vence && !hepa.venceManana, true);
eq('HEPA días=1', hepa.dias, 1);
eq('sonda sin fecha → no aplica', tc.aplica, false);
const est2 = estadoDispositivos({ SOPORTE: 'VM', DISP_HME_FECHA: '2026-07-26', DISP_HEPA_FECHA: '2026-07-25', DISP_TC_FECHA: '2026-07-25' }, '2026-07-27');
eq('HME de ayer (frec 2) → vence MAÑANA', est2.find(d => d.k === 'hme').venceManana, true);
eq('HEPA hace 2 días (frec 3) → vence mañana', est2.find(d => d.k === 'hepa').venceManana, true);
const est3 = estadoDispositivos({ SOPORTE: 'VMNI', DISP_HME_FECHA: '2026-07-20' }, '2026-07-27');
eq('sin VM → nada aplica ni vence', est3.every(d => !d.aplica && !d.vence), true);

console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
process.exit(fails.length ? 1 : 0);
