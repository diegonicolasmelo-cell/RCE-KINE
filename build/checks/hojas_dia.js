// hojas_dia.js — Guardia de las HOJAS DEL DÍA y la HOJA PVE (v5.27):
//   · La hoja de registro kinésico sale UNA por paciente hospitalizado, en
//     DOS carillas, con la franja prellenada (cama · edad · nombre · RUT ·
//     días · fecha) — reemplaza el recorte diario de la lista.
//   · La grilla va EN BLANCO y conserva las secciones oficiales del V0.2
//     (vía aérea, monitorización, terapia ventilatoria, laboratorio, MRC-ss,
//     FSS-ICU, protocolo de weaning).
//   · La PVE prellena SOLO nombre y RUT («deja solo rut siempre y cuando se
//     haya completado») y trae PVE 1/2/3 + las dos reevaluaciones.
//   · Ambas se imprimen en VERTICAL: @page portrait inyectado que se retira
//     tras el afterprint (el @page global de la app es apaisado).
// Uso: node build/checks/hojas_dia.js
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
    window.print = () => { window._PRINTS = (window._PRINTS || 0) + 1; };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  const R = await p.evaluate(() => {
    const r = {};
    /* ── Hoja de registro por paciente ── */
    const c = { ID_CAMA: '7', EDAD: 64, NOMBRE: 'Ignacio Pepito', RUT: '13.233.431-4',
                FECHA_INGRESO: '2026-07-29', TS_INGRESO: '2026-07-29 14:00', OCUPADA: true };
    const h = rkHojaHTML(c, '2026-08-02');
    r.dosCarillas = (h.match(/class="rk-page"/g) || []).length;
    r.franja = ['>7<', '>64<', 'IGNACIO PEPITO', '13.233.431-4', '02/08/2026'].every(x => h.indexOf(x) !== -1);
    r.dias = />4</.test(h);   // 4 bloques de 24 h entre el 29-jul 14:00 y el 2-ago
    r.secciones = ['CUIDADOS RESPIRATORIOS', 'TURNO DÍA', 'TURNO NOCHE', 'VÍA AÉREA ARTIFICIAL',
      'MONITORIZACIÓN', 'TERAPIA VENTILATORIA', 'LABORATORIO', 'Trachcare',
      'CUIDADOS NEUROMUSCULARES DIURNOS', 'MRC-ss', 'FSS-ICU', 'PROTOCOLO DE WEANING',
      'DEBILIDAD ADQUIRIDA EN UCI'].every(x => h.indexOf(x) !== -1);
    r.sinDatosClinicos = h.indexOf('undefined') === -1 && h.indexOf('null') === -1;
    // Sin RUT ni TS: la franja no revienta y deja los espacios en blanco
    const h2 = rkHojaHTML({ ID_CAMA: '3', NOMBRE: 'Sin Datos', OCUPADA: true }, '2026-08-02');
    r.sinRutOk = h2.indexOf('undefined') === -1;

    /* ── Hojas del día: una por ocupada, ninguna por libre ── */
    DB = [
      { ID_CAMA: '2', OCUPADA: true, NOMBRE: 'Uno', EDAD: 50, RUT: '1-9', FECHA_INGRESO: '2026-08-01' },
      { ID_CAMA: '1', OCUPADA: 'TRUE', NOMBRE: 'Dos', EDAD: 60, RUT: '2-7', FECHA_INGRESO: '2026-08-02' },
      { ID_CAMA: '3', OCUPADA: false, NOMBRE: '', EDAD: '', RUT: '' },
    ];
    imprimirHojasDelDia();
    r.imprimio = window._PRINTS === 1;
    const html = $('rkPrint').innerHTML;
    r.paginas = (html.match(/class="rk-page"/g) || []).length;    // 2 pacientes × 2 carillas
    r.ordenCamas = html.indexOf('>Dos<'.toUpperCase()) < html.indexOf('>Uno<'.toUpperCase())
      || html.indexOf('DOS') < html.indexOf('UNO');               // cama 1 antes que cama 2
    r.libreExcluida = html.indexOf('Sin Datos') === -1;
    r.claseRk = document.body.classList.contains('print-rk');
    r.portrait = !!$('pgVertical') && $('pgVertical').textContent.indexOf('portrait') !== -1;
    window.dispatchEvent(new Event('afterprint'));
    r.limpioTras = !document.body.classList.contains('print-rk') && !$('pgVertical');

    /* ── Hoja PVE ── */
    const pv = pveHojaHTML('13.233.431-4', 'Ignacio Pepito');
    r.pveTitulo = pv.indexOf('HOJA REGISTRO PRUEBA DE VENTILACI') !== -1;
    r.pveRut = pv.indexOf('Rut/CP:') !== -1 && pv.indexOf('13.233.431-4') !== -1;
    r.pveCols = ['PVE 1', 'PVE 2', 'PVE 3'].every(x => pv.indexOf(x) !== -1) &&
                (pv.match(/INICIO/g) || []).length === 3 && (pv.match(/30 MIN/g) || []).length >= 3;
    r.pveReeval = (pv.match(/REEVALUACIÓN POST EXTUBACIÓN/g) || []).length === 2;
    r.pveFalla = (pv.match(/FALLA POST EXTUBACIÓN/g) || []).length === 2;
    r.pveLogos = (pv.match(/data:image\/png;base64,/g) || []).length === 3;
    const pv2 = pveHojaHTML('', '');
    r.pveSinRut = pv2.indexOf('undefined') === -1;
    // Desde el historial
    TLC = '7'; DB = [{ ID_CAMA: '7', RUT: '13.233.431-4', NOMBRE: 'Ignacio Pepito' }];
    imprimirHojaPVE();
    r.pveImprime = window._PRINTS === 2;
    r.pveClase = document.body.classList.contains('print-pve');
    window.dispatchEvent(new Event('afterprint'));
    r.pveLimpio = !document.body.classList.contains('print-pve') && !$('pgVertical');
    return r;
  });

  console.log('── Hoja de registro por paciente ──');
  eq('dos carillas por paciente', R.dosCarillas, 2);
  eq('franja: cama·edad·nombre·RUT·fecha', R.franja, true);
  eq('días por bloques de 24 h (día 4)', R.dias, true);
  eq('todas las secciones del V0.2 presentes', R.secciones, true);
  eq('sin residuos undefined/null', R.sinDatosClinicos, true);
  eq('paciente sin RUT/TS no revienta', R.sinRutOk, true);

  console.log('\n── Hojas del día ──');
  eq('se abrió la impresión', R.imprimio, true);
  eq('2 pacientes ⇒ 4 carillas', R.paginas, 4);
  eq('la cama libre NO se imprime', R.libreExcluida, true);
  eq('clase print-rk activa', R.claseRk, true);
  eq('se inyecta @page VERTICAL', R.portrait, true);
  eq('afterprint limpia clase y estilo', R.limpioTras, true);

  console.log('\n── Hoja PVE ──');
  eq('título oficial', R.pveTitulo, true);
  eq('Rut/CP prellenado', R.pveRut, true);
  eq('PVE 1/2/3 con INICIO y 30 MIN', R.pveCols, true);
  eq('DOS reevaluaciones post extubación', R.pveReeval, true);
  eq('…con su FALLA POST EXTUBACIÓN', R.pveFalla, true);
  eq('tres logos incrustados', R.pveLogos, true);
  eq('sin RUT no revienta', R.pveSinRut, true);
  eq('imprime desde el historial', R.pveImprime, true);
  eq('clase print-pve activa y limpia después', R.pveClase && R.pveLimpio, true);

  eq('sin errores de página', errs.length ? errs[0] : 0, 0);
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
