// disp_fecha.js — Guardia de la FECHA EFECTIVA en los relojes de dispositivos
// (v5.20, reporte de Diego ago-2026): «si es noche del 31 se anota con la
// fecha del día siguiente (01), por lo que tendrían 1 día y no 2». El turno
// Noche transcurre casi entero en el día siguiente, así que HME/HEPA/Trach
// Care se fechan y se cuentan contra esa fecha efectiva — el mismo criterio
// que ya usaban los eventos rápidos.
// Uso: node build/checks/disp_fecha.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

/* ── Parte 1 · servidor: la entrega de turno mide contra la fecha efectiva ── */
const DB = { CAMAS_ESTADO: [], EVOLUCIONES: [], PROCEDIMIENTOS: [], ENTREGAS_TURNO: [] };
global.repoLeerTodos = (h, c, val) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(val)); return f; };
global.repoLeerFiltrado = (h, colKey, pred) => (DB[h] || []).filter(r => pred(r[colKey]));
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoActualizar = () => true; global.repoUpsert = () => 'crear';
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d; global.conLock = fn => fn(); global.uid = p => p + '_1';
global.hoyISO = () => '2026-08-01';
global.ahoraTS = () => '2026-08-01 10:00:00';
global._tz = () => 'America/Santiago';
global.Utilities = { getUuid: () => 'u1' };
global.SpreadsheetApp = { flush: () => {} };
global.ok = d => ({ ok: true, data: d }); global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE' };
global._statISO = f => String(f || '').slice(0, 10);
eval(['infra_fechas.gs', 'svc_eventos.gs', 'svc_entrega.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

eq('turno Día: la fecha efectiva es la del propio turno', _fechaEfectivaTurno('2026-07-31', 'Dia'), '2026-07-31');
eq('turno Noche del 31: la fecha efectiva es el 1 de agosto', _fechaEfectivaTurno('2026-07-31', 'Noche'), '2026-08-01');

// Circuito instalado el 31 en la noche (fecha efectiva 01-ago)
DB.CAMAS_ESTADO = [{ ID_CAMA: '1', OCUPADA: 'TRUE', PATIENT_ID: 'p1', NOMBRE: 'Prueba',
  SOPORTE: 'VM', VIA_AEREA: 'TOT', FECHA_INGRESO: '2026-07-31',
  DISP_HME_FECHA: '2026-08-01', DISP_HEPA_FECHA: '2026-08-01', DISP_TC_FECHA: '2026-08-01' }];
// Desde la v5.60 el HEPA solo aplica con ventilador asignado, y si es de la
// lista fija (PB/Avea) no cicla: esta guardia mide el CICLO, así que la cama
// lleva una Vela. La categoría vive en svc_equipos.gs; se copia lo mínimo.
DB.VENTILADORES = [{ NOMBRE: 'Vela 9', ACTIVO: 'TRUE', UBIC_TIPO: 'CAMA', UBIC_DETALLE: '1', CATEGORIA: 'VM' }];
global._vmCategoria = x => String(x.CATEGORIA || 'VM').trim().toUpperCase();
global._vmEsDeCama = c => String(c) === 'VM';
_ventPorCamaMemo = null;

// Turno Día del 1-ago: mismo día calendario ⇒ día 1
let r = obtenerEntregaTurno(['1'], '2026-08-01', 'Dia');
let hme = r.data.fichas[0].dispositivos.find(d => d.n === 'HME');
eq('turno Día del 1-ago: el HME va en su día 1', hme.dia, 1);

// REGLA VIGENTE (corregida el 10-ago-2026, reporte de Manuel desde el turno):
// etiqueta = día 0, `cambio` = etiqueta + frec, y ese cambio se EJECUTA en la
// madrugada de esa fecha, o sea en el turno NOCHE de la víspera. El HME
// etiquetado 01-ago se cambia en la madrugada del 03 ⇒ el aviso sale la noche
// del 02, con frec-1 días cumplidos.
//   🪤 La entrega de turno tenía `dias === frec` y avisaba una noche TARDE:
//   quedó fuera de la corrección que sí recibieron estadoDispositivos, la hoja
//   de filtros y el chip de la Hoja UCI, y durante unas horas dos papeles de la
//   misma unidad dieron fechas distintas del mismo filtro.
r = obtenerEntregaTurno(['1'], '2026-08-01', 'Noche');
hme = r.data.fichas[0].dispositivos.find(d => d.n === 'HME');
const hepa = r.data.fichas[0].dispositivos.find(d => d.n === 'HEPA');
eq('turno Noche del 1-ago: el HME recién etiquetado NO se cambia aún', hme.estado, 'ok');
eq('…y la entrega trae su fecha EXACTA de cambio (01+2 = 03-08)', hme.cambio, '03-08');
eq('el HEPA tampoco (cambia el 04-08)', hepa.estado + '/' + hepa.cambio, 'ok/04-08');

// La VÍSPERA del cambio: la entrega del 02 avisa el HME para esa madrugada
r = obtenerEntregaTurno(['1'], '2026-08-02', 'Noche');
eq('entrega del 02-ago: el HME sale «cambiar» (madrugada del 03)', r.data.fichas[0].dispositivos.find(d => d.n === 'HME').estado, 'cambiar');
eq('…y el HEPA sigue ok (su madrugada es la del 04)', r.data.fichas[0].dispositivos.find(d => d.n === 'HEPA').estado, 'ok');

// Llegada la fecha de cambio sin cambiarlo, aparece vencido
r = obtenerEntregaTurno(['1'], '2026-08-03', 'Noche');
eq('entrega del 03-ago: el HME sin cambiar sale VENCIDO', r.data.fichas[0].dispositivos.find(d => d.n === 'HME').estado, 'vencido');
eq('…y el HEPA llega a su noche de aviso', r.data.fichas[0].dispositivos.find(d => d.n === 'HEPA').estado, 'cambiar');

// ── La propiedad, no la lista de fechas ─────────────────────────────────────
// Un solo ciclo se ve bien con la regla al revés: el error solo aparece al
// ENCADENAR, porque el filtro cambiado de madrugada se etiqueta D+1. Esto mide
// lo que de verdad importa: cuántos días pasan entre dos cambios consecutivos.
const nocheDeAviso = (etiqueta, frec) => {
  DB.CAMAS_ESTADO[0].DISP_HME_FECHA = etiqueta;
  for (let k = 0; k <= frec + 3; k++) {
    const f = new Date(etiqueta + 'T12:00:00'); f.setDate(f.getDate() + k);
    const iso = f.toISOString().slice(0, 10);
    const e = obtenerEntregaTurno(['1'], iso, 'Noche').data.fichas[0].dispositivos.find(d => d.n === 'HME');
    if (e && e.estado === 'cambiar') return iso;          // la noche en que avisa
  }
  return null;
};
const efectiva = iso => { const f = new Date(iso + 'T12:00:00'); f.setDate(f.getDate() + 1); return f.toISOString().slice(0, 10); };
const dif = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
const et1 = '2026-08-01';
const et2 = efectiva(nocheDeAviso(et1, 2));   // se cambia esa madrugada ⇒ etiqueta D+1
const et3 = efectiva(nocheDeAviso(et2, 2));
eq('🎯 entre dos cambios de HME pasan exactamente 2 días', dif(et1, et2), 2);
eq('🎯 y del segundo al tercero, otros 2', dif(et2, et3), 2);
DB.CAMAS_ESTADO[0].DISP_HME_FECHA = '2026-08-01';        // restaurar el escenario

/* ── Parte 2 · cliente: el formulario fecha y cuenta con la efectiva ── */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(v2, 'index.html'));
  await p.waitForTimeout(500);

  const R = await p.evaluate(async () => {
    const r = {};
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    $('gDate').value = '2026-07-31';
    // ── Turno NOCHE del 31: los dispositivos se fechan el 1 de agosto ──
    SHIFT = 'Noche';
    r.efNoche = _fechaEfTurno('2026-07-31');
    r.efDia = _fechaEfTurno('2026-07-31', 'Dia');
    $('fVA').value = 'TOT'; cascadeVA();
    $('fSop').value = 'VM'; cascadeSop();
    ['fFecHME', 'fFecHEPA', 'fFecSonda'].forEach(id => { if ($(id)) $(id).value = ''; });
    autoFechasDispositivos(false, true);
    r.fechado = { hme: v('fFecHME'), hepa: v('fFecHEPA'), tc: v('fFecSonda') };
    r.diaHME = $('sHMEDias') ? $('sHMEDias').textContent : '';
    // ── Turno DÍA del 2-ago: víspera del cambio (etiqueta 01 + 2 = 03) ──
    $('gDate').value = '2026-08-02'; SHIFT = 'Dia';
    calcInsumosDias();
    r.hme02 = $('sHMEDias') ? $('sHMEDias').textContent : '';
    // ── El 3-ago ES el día de cambio del HME (su noche) ──
    $('gDate').value = '2026-08-03'; SHIFT = 'Noche'; calcInsumosDias();
    r.hme03 = $('sHMEDias') ? $('sHMEDias').textContent : '';
    r.hepa03 = $('sHEPADias') ? $('sHEPADias').textContent : '';
    // ── El 4-ago, sin cambio registrado, queda vencido ──
    $('gDate').value = '2026-08-04'; SHIFT = 'Dia'; calcInsumosDias();
    r.hme04 = $('sHMEDias') ? $('sHMEDias').textContent : '';
    return r;
  });
  eq('cliente: fecha efectiva del turno Noche = día siguiente', R.efNoche, '2026-08-01');
  eq('cliente: en turno Día no se corre la fecha', R.efDia, '2026-07-31');
  eq('el circuito instalado la noche del 31 se ETIQUETA el 1 de agosto',
    R.fechado.hme === '2026-08-01' && R.fechado.hepa === '2026-08-01' && R.fechado.tc === '2026-08-01', true);
  // SEMÁNTICA NUEVA (ago-2026, validada por Diego): el chip muestra la FECHA
  // EXACTA de cambio, no un contador de días.
  eq('esa misma noche el chip trae la fecha exacta (01+2 = 03-08)', /Cambio: 03-08/.test(R.diaHME), true);
  eq('el 2-ago avisa que el cambio es mañana en la noche', /Cambio: 03-08 \(mañana en la noche\)/.test(R.hme02), true);
  eq('la noche del 3-ago dice CAMBIAR ESTA NOCHE', /Cambiar ESTA NOCHE \(03-08\)/.test(R.hme03), true);
  eq('…y el HEPA de la misma cama aún no (su noche es la del 4)', /Cambio: 04-08/.test(R.hepa03), true);
  // v5.60 (Diego): el vencido dice CAMBIAR HOY primero — la fecha del cambio
  // real se corre a hoy; la que se saltó queda como dato, no como plan.
  eq('el 4-ago sin cambio queda VENCIDO: cambiar hoy (debió el 03-08)', /VENCIDO — cambiar hoy \(debió el 03-08\)/.test(R.hme04), true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
