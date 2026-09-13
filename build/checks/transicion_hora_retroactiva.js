// transicion_hora_retroactiva.js — PRD «que no quede ninguna evolución sin
// guardar», O5 (tanda 4): la hora del evento olvidado.
//
// La razón de esta guardia está en una sola frase del PRD: «Nunca una hora
// inventada en TIMELINE». El evento se anota con la hora REAL en que ocurrió,
// y por eso hay exactamente dos cosas que no pueden pasar:
//   · que se acepte una hora FUTURA — un evento que todavía no ocurrió;
//   · que se acepte una hora de OTRO turno — eso corrompe los días de VM, que
//     es el número que esta unidad reporta.
//
// 🪤 EL RELOJ VA FIJADO. El escenario depende del calendario: sin fijarlo, la
// guardia diría cosas distintas a las 10 de la mañana y a las 11 de la noche.
// `_transHoraValida(hhmm, ahora)` acepta el reloj inyectado justamente para esto.
//
// Uso: node build/checks/transicion_hora_retroactiva.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');
const IDX = path.resolve(__dirname, '..', '..', 'v2', 'index.html');

(async () => {
  const fails = [];
  const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!ok) fails.push(l); };

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : []) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + IDX);
  await p.waitForTimeout(500);

  // Turno DÍA del 2026-09-10. Ventana del turno: 09:00–20:59 (TURNO_DIA_INICIO 9,
  // TURNO_NOCHE_INICIO 21). Reloj FIJADO a las 18:00 de ese mismo día.
  const RELOJ_DIA = [2026, 8, 10, 18, 0];
  await p.evaluate(() => { SHIFT = 'Dia'; $('gDate').value = '2026-09-10'; window.CFG = window.CFG || {}; });

  const probar = (hhmm, reloj) => p.evaluate(([h, r]) =>
    _transHoraValida(h, new Date(r[0], r[1], r[2], r[3], r[4], 0, 0)), [hhmm, reloj]);

  /* ── 1 · Turno día: qué se acepta ── */
  eq('14:30 (dentro del turno y ya pasó) se acepta', (await probar('14:30', RELOJ_DIA)).ok, true);
  eq('09:00 (borde de entrada del turno) se acepta', (await probar('09:00', RELOJ_DIA)).ok, true);
  eq('18:00 (justo ahora) se acepta', (await probar('18:00', RELOJ_DIA)).ok, true);

  /* ── 2 · NO puede ser futura — el corazón de esta guardia ── */
  const fut = await probar('18:01', RELOJ_DIA);
  eq('18:01 con el reloj en 18:00 se RECHAZA', fut.ok, false);
  eq('…y lo dice por ser futura', /futura|todavía no ocurre/i.test(fut.motivo || ''), true);
  const fut2 = await probar('20:30', RELOJ_DIA);
  eq('20:30 (aún dentro del turno, pero futura) se RECHAZA', fut2.ok, false);
  eq('…también por futura, no por el turno', /futura|todavía no ocurre/i.test(fut2.motivo || ''), true);

  /* ── 3 · NO puede caer fuera del turno que se está guardando ── */
  const madrugada = await probar('03:00', RELOJ_DIA);
  eq('03:00 en un turno DÍA se RECHAZA', madrugada.ok, false);
  eq('…y lo dice por el turno', /turno/i.test(madrugada.motivo || ''), true);
  const nocturna = await probar('22:00', RELOJ_DIA);
  eq('22:00 en un turno DÍA se RECHAZA', nocturna.ok, false);
  eq('…y lo dice por el turno', /turno/i.test(nocturna.motivo || ''), true);
  eq('08:59 (un minuto antes del turno) se RECHAZA', (await probar('08:59', RELOJ_DIA)).ok, false);

  /* ── 4 · Turno NOCHE: la ventana cruza la medianoche y la madrugada es del día
     siguiente a la fecha del turno. Turno noche del 2026-09-10, reloj fijado a
     las 02:00 del 11 (ya dentro de la madrugada de ese mismo turno). ── */
  await p.evaluate(() => { SHIFT = 'Noche'; $('gDate').value = '2026-09-10'; });
  const RELOJ_NOCHE = [2026, 8, 11, 2, 0];
  eq('23:00 del turno noche se acepta', (await probar('23:00', RELOJ_NOCHE)).ok, true);
  eq('01:30 (madrugada del mismo turno) se acepta', (await probar('01:30', RELOJ_NOCHE)).ok, true);
  const nocheFut = await probar('05:00', RELOJ_NOCHE);
  eq('05:00 con el reloj en 02:00 se RECHAZA por futura', nocheFut.ok, false);
  eq('…y lo dice', /futura|todavía no ocurre/i.test(nocheFut.motivo || ''), true);
  eq('15:00 en un turno NOCHE se RECHAZA', (await probar('15:00', RELOJ_NOCHE)).ok, false);

  /* ── 5 · Basura y vacío no pasan ── */
  for (const mala of ['', '  ', 'ayer', '25:00', '14:70', '1430']) {
    eq('«' + mala + '» se rechaza', (await probar(mala, RELOJ_DIA)).ok, false);
  }

  /* ── 6 · La propiedad de fondo: una hora rechazada NO deja rastro en el
     formulario. Nada de anotar el evento «casi». ── */
  await p.evaluate(() => {
    SHIFT = 'Dia'; $('gDate').value = '2026-09-10'; $('cIng').value = 'false';
    _iniVA = 'TOT'; _iniSop = 'VM'; $('fVA').value = 'TQT'; $('fSop').value = 'VM';
    $('cTqtO').checked = false; $('fTqtHora').value = '';
    if (typeof PROCS !== 'undefined') PROCS.length = 0;
    _mostrarTransAviso(_avisosPreGuardado());
    transOfAbrir('tqt');
  });
  const rastro = await p.evaluate(() => {
    $('trOfHora_tqt').value = '23:45';                       // fuera del turno día
    const ok = transOfRegistrar('tqt', new Date(2026, 8, 10, 18, 0, 0));
    return { ok, casilla: !!$('cTqtO').checked, hora: $('fTqtHora').value,
             err: ($('trOfErr_tqt').textContent || '').trim(),
             errVisible: $('trOfErr_tqt').style.display !== 'none',
             sigueElAviso: _avisosTransicion().some(a => a.ev === 'tqt') };
  });
  eq('una hora fuera del turno no registra', rastro.ok, false);
  eq('…no marca la casilla', rastro.casilla, false);
  eq('…no escribe la hora en el bloque', rastro.hora, '');
  eq('…muestra el motivo en pantalla', rastro.errVisible && rastro.err.length > 10, true);
  eq('…y el aviso sigue en pie', rastro.sigueElAviso, true);

  /* ── 7 · Y una hora válida sí registra, en el mismo escenario ── */
  const buena = await p.evaluate(() => {
    $('trOfHora_tqt').value = '16:20';
    const ok = transOfRegistrar('tqt', new Date(2026, 8, 10, 18, 0, 0));
    return { ok, casilla: !!$('cTqtO').checked, hora: $('fTqtHora').value };
  });
  eq('una hora válida registra', buena.ok, true);
  eq('…con la hora real, no la del guardado', buena.casilla + '/' + buena.hora, 'true/16:20');

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ transicion_hora_retroactiva OK');
  process.exit(fails.length ? 1 : 0);
})();
