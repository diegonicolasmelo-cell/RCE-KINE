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

// ── 6. estadoDispositivos — SEMÁNTICA VALIDADA POR DIEGO (ago-2026) ──
// Etiqueta = día 0; el cambio se hace en el TURNO NOCHE del día etiqueta+frec.
// «Vencido» SOLO si amaneció después de esa noche sin cambio. La regla vieja
// (vence cuando dias >= frec) avisaba UN DÍA ANTES: ese era el desfase que el
// equipo reportó en terreno.
const cama = { SOPORTE: 'VM', DISP_HME_FECHA: '2026-07-25', DISP_HEPA_FECHA: '2026-07-26', DISP_TC_FECHA: '' };
const est = estadoDispositivos(cama, '2026-07-27');
const hme = est.find(d => d.k === 'hme'), hepa = est.find(d => d.k === 'hepa'), tc = est.find(d => d.k === 'sonda');
eq('HME etiqueta hace 2 días (frec 2) → se cambia ESTA NOCHE, no vencido', hme.cambiaEstaNoche && !hme.vence, true);
eq('…y trae la fecha EXACTA del cambio (etiqueta+2)', hme.fechaCambio, '2026-07-27');
eq('HEPA hace 1 día (frec 3) → ni esta noche ni vencido', !hepa.vence && !hepa.cambiaEstaNoche, true);
eq('HEPA días=1', hepa.dias, 1);
eq('…con fecha de cambio etiqueta+3', hepa.fechaCambio, '2026-07-29');
eq('sonda sin fecha → no aplica', tc.aplica, false);
const est2 = estadoDispositivos({ SOPORTE: 'VM', DISP_HME_FECHA: '2026-07-26', DISP_HEPA_FECHA: '2026-07-25', DISP_TC_FECHA: '2026-07-24' }, '2026-07-27');
eq('HME de ayer (frec 2) → cambia MAÑANA en la noche', est2.find(d => d.k === 'hme').venceManana, true);
eq('HEPA hace 2 días (frec 3) → cambia mañana', est2.find(d => d.k === 'hepa').venceManana, true);
eq('TC hace 3 días (frec 3) → se cambia ESTA NOCHE', est2.find(d => d.k === 'sonda').cambiaEstaNoche, true);
const est4 = estadoDispositivos({ SOPORTE: 'VM', DISP_HME_FECHA: '2026-07-24' }, '2026-07-27');
eq('HME hace 3 días (frec 2): pasó su noche sin cambio → AHORA sí vencido', est4.find(d => d.k === 'hme').vence, true);
const est3 = estadoDispositivos({ SOPORTE: 'VMNI', DISP_HME_FECHA: '2026-07-20' }, '2026-07-27');
eq('sin VM → nada aplica ni vence', est3.every(d => !d.aplica && !d.vence), true);

// ── 6b. cambiosEstaNoche: el ejemplo de VALIDACIÓN de Diego, fecha a fecha ──
// Paciente ingresa el 04/08: sus 3 dispositivos quedan etiquetados 04/08.
DB.CAMAS_ESTADO = [
  { ID_CAMA: '5', OCUPADA: 'TRUE', NOMBRE: 'Paciente Ejemplo', SOPORTE: 'VM',
    DISP_HME_FECHA: '2026-08-04', DISP_HEPA_FECHA: '2026-08-04', DISP_TC_FECHA: '2026-08-04' },
  { ID_CAMA: '6', OCUPADA: 'TRUE', NOMBRE: 'Sin VM', SOPORTE: 'Ambiente',
    DISP_HME_FECHA: '2026-08-01' },
];
// Noche del 05/08: nada suyo se cambia todavía.
let cn = cambiosEstaNoche('2026-08-05');
eq('ejemplo · noche del 05/08: nada que cambiar', cn.data.camas.length, 0);
// Noche del 06/08: se cambia el HME (etiqueta 04/08 = D-2). HEPA y TC no.
cn = cambiosEstaNoche('2026-08-06');
eq('ejemplo · noche del 06/08: una cama con cambios', cn.data.camas.length, 1);
eq('…y es SOLO el HME', cn.data.camas[0].dispositivos.map(d => d.k).join(','), 'hme');
eq('…marcado para esta noche, no vencido', cn.data.camas[0].dispositivos[0].estado, 'esta_noche');
// El HME cambiado esa noche se etiqueta 07/08 (fecha efectiva, mecanismo existente).
DB.CAMAS_ESTADO[0].DISP_HME_FECHA = '2026-08-07';
// Noche del 07/08: se cambian HEPA y TC (etiqueta 04/08 = D-3). El HME nuevo no.
cn = cambiosEstaNoche('2026-08-07');
eq('ejemplo · noche del 07/08: HEPA y TC', cn.data.camas[0].dispositivos.map(d => d.k).sort().join(','), 'hepa,sonda');
DB.CAMAS_ESTADO[0].DISP_HEPA_FECHA = '2026-08-08';
DB.CAMAS_ESTADO[0].DISP_TC_FECHA = '2026-08-08';
// Noche del 09/08: vuelve a tocar el HME (etiqueta 07/08 = D-2)…
cn = cambiosEstaNoche('2026-08-09');
eq('ejemplo · noche del 09/08: el HME de nuevo', cn.data.camas[0].dispositivos.map(d => d.k).join(','), 'hme');
// …y si esa noche NADIE lo cambia, al día siguiente aparece VENCIDO.
cn = cambiosEstaNoche('2026-08-10');
const hmeV = cn.data.camas[0].dispositivos.find(d => d.k === 'hme');
eq('ejemplo · 10/08 sin cambio: el HME sale VENCIDO con 1 día de atraso', hmeV.estado + '/' + hmeV.diasAtraso, 'vencido/1');

console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
process.exit(fails.length ? 1 : 0);
