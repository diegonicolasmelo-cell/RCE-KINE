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

// Turno Día del 1-ago: mismo día calendario ⇒ día 1
let r = obtenerEntregaTurno(['1'], '2026-08-01', 'Dia');
let hme = r.data.fichas[0].dispositivos.find(d => d.n === 'HME');
eq('turno Día del 1-ago: el HME va en su día 1', hme.dia, 1);

// Turno NOCHE del 1-ago: efectiva 2-ago ⇒ día 2 (toca cambiar el HME)
r = obtenerEntregaTurno(['1'], '2026-08-01', 'Noche');
hme = r.data.fichas[0].dispositivos.find(d => d.n === 'HME');
const hepa = r.data.fichas[0].dispositivos.find(d => d.n === 'HEPA');
eq('turno Noche del 1-ago: el HME llega a su día 2', hme.dia, 2);
eq('…y avisa que toca cambiarlo', hme.estado, 'cambiar');
eq('el HEPA (3 días) todavía está en regla', hepa.estado, 'ok');

// Turno NOCHE del 2-ago: efectiva 3-ago ⇒ HEPA en su día 3
r = obtenerEntregaTurno(['1'], '2026-08-02', 'Noche');
eq('turno Noche del 2-ago: el HEPA llega a su día 3', r.data.fichas[0].dispositivos.find(d => d.n === 'HEPA').estado, 'cambiar');

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
    // ── Turno DÍA del 1-ago: el mismo circuito sigue en su día 1 ──
    $('gDate').value = '2026-08-01'; SHIFT = 'Dia';
    calcInsumosDias();
    r.diaHME_1ago = $('sHMEDias') ? $('sHMEDias').textContent : '';
    // ── Turno NOCHE del 1-ago (efectiva 2-ago): día 2, toca cambiar ──
    SHIFT = 'Noche'; calcInsumosDias();
    r.diaHME_1agoNoche = $('sHMEDias') ? $('sHMEDias').textContent : '';
    return r;
  });
  eq('cliente: fecha efectiva del turno Noche = día siguiente', R.efNoche, '2026-08-01');
  eq('cliente: en turno Día no se corre la fecha', R.efDia, '2026-07-31');
  eq('el circuito instalado la noche del 31 se fecha el 1 de agosto',
    R.fechado.hme === '2026-08-01' && R.fechado.hepa === '2026-08-01' && R.fechado.tc === '2026-08-01', true);
  eq('esa misma noche el HME va en su día 1 (antes marcaba 2)', /Día 1\/2/.test(R.diaHME), true);
  eq('el turno Día del 1-ago lo mantiene en día 1', /Día 1\/2/.test(R.diaHME_1ago), true);
  eq('la noche del 1-ago pasa a día 2 y avisa el cambio', /Día 2\/2 · cambiar/.test(R.diaHME_1agoNoche), true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
