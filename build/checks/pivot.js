// pivot.js — Guardia de la tabla dinámica (v4): el servicio entrega SOLO la
// lista blanca (jamás nombre ni RUT), filtra por fecha, trunca a 2.500; el
// orden de las secciones de Estadísticas es Indicadores → General → Tabla
// dinámica → REM → Control de calidad; y el cruce del cliente calcula bien
// conteo, suma y promedio con decimales de coma.
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');

/* ── Parte 1: servicio (node puro) ── */
const DB = {};
global.repoLeerTodos = h => (DB[h] || []).slice();
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO' };
eval(fs.readFileSync(path.join(v2, 'svc_stats.gs'), 'utf8'));

const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

DB.EVOLUCIONES = [
  { TURNO_KEY: '2026-07-10-Dia', FECHA: '2026-07-10', TURNO: 'Dia', ID_CAMA: '3',
    PAC_NOMBRE: 'Juan Pérez Soto', PAC_RUT: '12.345.678-5', PAC_SEXO: 'M', PAC_EDAD: 60,
    PAC_DIAG_REM: 'Neumonía', FASE_JSON: '["Weaning"]', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM',
    VENT_MODO: 'ACVC', DIA_ESTADIA: 3, RESP_KTR_CANT: 3, KTM_REALIZADA: true, KTM_NIVEL_KTR: '2',
    KTM_IMT: true, EVAL_IMS: 4, PVE_VAL: 'si', PVE_RESULTADO: 'superada', VENT_FIO2: 40,
    VENT_CUFF_EST: 'rango', VENT_PAFI: 280, EVAL_T_MRC: 42 },
  { TURNO_KEY: '2026-07-10-Noche', FECHA: '2026-07-10', TURNO: 'Noche', ID_CAMA: '3',
    PAC_NOMBRE: 'Juan Pérez Soto', PAC_SEXO: 'M', RESP_KTR_CANT: 2, VENT_SOPORTE: 'VM' },
  { TURNO_KEY: '2026-08-01-Dia', FECHA: '2026-08-01', TURNO: 'Dia', ID_CAMA: '4', RESP_KTR_CANT: 1 },
];
DB.EVOLUCIONES_ARCHIVO = [
  { TURNO_KEY: '2026-07-02-Dia', FECHA: '2026-07-02', TURNO: 'Dia', ID_CAMA: '9',
    PAC_NOMBRE: 'Otra Persona', PAC_SEXO: 'F', RESP_KTR_CANT: 4, KTM_SUSPENDIDA: true },
];

let r = datosPivot('2026-07-01', '2026-07-31');
eq('responde ok', r.ok, true);
eq('filtra por rango (agosto queda fuera; archivadas entran)', r.data.filas.length, 3);
const f0 = r.data.filas.find(x => x.FECHA === '2026-07-10' && x.TURNO === 'Dia');
eq('lista blanca: JAMÁS viajan nombre ni RUT',
   r.data.filas.every(x => !('PAC_NOMBRE' in x) && !('NOMBRE' in x) && !('PAC_RUT' in x) && !('RUT' in x) && !('PATIENT_ID' in x)), true);
eq('ni escondidos en los valores', JSON.stringify(r.data.filas).indexOf('Juan Pérez') === -1 && JSON.stringify(r.data.filas).indexOf('12.345.678') === -1, true);
eq('MES derivado de la fecha', f0.MES, '2026-07');
eq('KTM legible (Sí/Suspendida/No)', f0.KTM === 'Sí' && r.data.filas.find(x => x.CAMA === '9').KTM === 'Suspendida', true);
eq('extubación vacía si no ocurrió', f0.EXTUBACION, '');
eq('numéricos presentes (KTR, PaFi, MRC)', f0.KTR === 3 && String(f0.PAFI) === '280' && String(f0.MRC) === '42', true);

DB.EVOLUCIONES = []; DB.EVOLUCIONES_ARCHIVO = [];
for (let i = 0; i < 2600; i++) DB.EVOLUCIONES.push({ TURNO_KEY: '2026-07-10-Dia', FECHA: '2026-07-10', TURNO: 'Dia', ID_CAMA: '1' });
r = datosPivot('', '');
eq('tope de 2.500 filas con aviso', r.data.filas.length === 2500 && r.data.truncado === true && r.data.total === 2600, true);

/* ── Parte 2: UI (Chromium): orden de secciones + cruce ── */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window._ll = [];
    const FILAS = [
      { MES: '2026-06', TURNO: 'Dia', KTR: 3, PAFI: '250' }, { MES: '2026-06', TURNO: 'Noche', KTR: 2, PAFI: '' },
      { MES: '2026-07', TURNO: 'Dia', KTR: 1, PAFI: '300' }, { MES: '2026-07', TURNO: 'Dia', KTR: 2, PAFI: '200' },
    ];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) { window._ll.push({ a, d }); setTimeout(() => okF({ ok: true, data: (a === 'GET_PIVOT' ? { filas: FILAS, total: 4, truncado: false } : (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null)) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(v2, 'index.html'));
  await p.waitForTimeout(500);

  const O = await p.evaluate(() => {
    const hijos = [...document.querySelectorAll('#tcD #indBox, #tcD #dashBody, #tcD #pivBox, #tcD #remBox, #tcD #audBox')].map(e => e.id);
    return { orden: hijos.join('>') };
  });
  eq('orden: Indicadores → General → Tabla dinámica → REM → Control de calidad',
     O.orden, 'indBox>dashBody>pivBox>remBox>audBox');

  const U = await p.evaluate(async () => {
    pivCargar();
    await new Promise(r2 => setTimeout(r2, 80));
    const r = {};
    r.info = $('pivInfo').textContent;
    r.llamada = _ll.some(x => x.a === 'GET_PIVOT');
    // conteo MES × TURNO
    $('pivF').value = 'MES'; $('pivC').value = 'TURNO'; $('pivV').value = ''; pivRender();
    const celdas = [...document.querySelectorAll('#pivOut td')].map(t => t.textContent.trim());
    r.conteo = celdas.join('|');
    // suma de KTR por MES
    $('pivC').value = ''; $('pivV').value = 'S:KTR'; pivRender();
    r.suma = [...document.querySelectorAll('#pivOut td')].map(t => t.textContent.trim()).join('|');
    // promedio de PaFi (los vacíos no cuentan en el divisor)
    $('pivV').value = 'P:PAFI'; pivRender();
    r.prom = [...document.querySelectorAll('#pivOut td')].map(t => t.textContent.trim()).join('|');
    return r;
  });
  eq('carga con GET_PIVOT y muestra el conteo sin identidad', U.llamada && /4 turnos cargados/.test(U.info) && /sin nombre ni RUT/.test(U.info), true);
  eq('conteo 2026-06: Día 1 · Noche 1 · total 2', /2026-06\|1\|1\|2/.test(U.conteo), true);
  eq('conteo 2026-07: Día 2 · sin noche · total 2', /2026-07\|2\|—\|2/.test(U.conteo), true);
  eq('suma de KTR por mes (5 y 3, total 8)', /2026-06\|5\|5/.test(U.suma) && /2026-07\|3\|3/.test(U.suma) && /TOTAL\|8\|8/.test(U.suma), true);
  eq('promedio de PaFi ignora vacíos (250 y 250)', /2026-06\|250\|250/.test(U.prom) && /2026-07\|250\|250/.test(U.prom), true);

  console.log(errs.length ? ('\nERRORES JS:\n' + errs.join('\n')) : '\nsin errores JS');
  await b.close();
  console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
  process.exit(fails.length || errs.length ? 1 : 0);
})();
