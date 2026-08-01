/**
 * movil.js — Guardia de la versión móvil (≤740px): barra inferior visible y
 * pestañas clásicas ocultas, hoja «Más», acordeón de módulos en el panel de
 * evolución con botonera de guardado a la vista, y regresión en escritorio
 * (nada de lo móvil aparece en pantallas grandes).
 */
const path = require('path');
const { chromium } = require('playwright-core');
const archivo = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'v2', 'index.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };
  const boot = async (vp) => {
    const p = await b.newPage({ viewport: vp });
    p.on('pageerror', e => { console.log('❌ error JS: ' + e.message); fails.push('js'); });
    await p.addInitScript(() => {
      window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
        api(a, d) { setTimeout(() => ok({ ok: true, data:
          a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {}, CAT_DEF: {} } :
          a === 'GET_TODAS_CAMAS' ? [] : null }), 5); }
      }; } }; } } } };
    });
    await p.goto('file://' + archivo);
    await p.waitForTimeout(600);
    return p;
  };

  // ── Móvil (390×844) ──
  const m = await boot({ width: 390, height: 844 });
  const vis = id => m.evaluate(x => { const e = document.querySelector(x); if (!e) return false; const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden'; }, id);
  eq('móvil: barra inferior visible', await vis('.mnav'), true);
  eq('móvil: pestañas clásicas ocultas', await vis('.tabs'), false);
  await m.evaluate(() => setTab('P'));
  eq('móvil: Registro activa su botón', await m.evaluate(() => $('mnavP').classList.contains('on') && !$('mnavG').classList.contains('on')), true);
  await m.evaluate(() => mSheet(true));
  eq('móvil: hoja «Más» se despliega', await m.evaluate(() => $('msheet').classList.contains('on') && !$('mvelo').classList.contains('hidden')), true);
  await m.evaluate(() => { mSheet(false); setTab('A'); });
  eq('móvil: Archivados enciende «Más»', await m.evaluate(() => $('mnavMas').classList.contains('on')), true);
  /* ── v5.13 · Encabezado móvil «barra mínima» (opción C de Diego): logo
        chico EN LÍNEA con la marca y el reloj; ◀ fecha ▶ juntos en su propia
        fila (jamás una flecha huérfana); turno solo con íconos; buscador a
        todo el ancho. Y el aviso retrospectivo ahora es corto. ── */
  const HDR = await m.evaluate(() => {
    const r = {};
    const fila = e => Math.round(e.getBoundingClientRect().top);
    const lg = document.querySelector('.hlogo'), ck = $('clk');
    r.logoChico = lg.getBoundingClientRect().height <= 32;
    r.logoConReloj = Math.abs(fila(lg) - fila(ck)) < 20;
    const bts = [...document.querySelectorAll('.hnav .hbtn')];
    const gd = $('gDate'), tg = $('sTgl');
    r.flechasConFecha = bts.length === 2 && bts.every(x => Math.abs(fila(x) - fila(gd)) < 8);
    r.turnoEnLaFila = Math.abs(fila(tg) - fila(gd)) < 8;
    r.fechaAncha = gd.getBoundingClientRect().width > innerWidth * 0.35;
    r.turnoSoloIconos = [...document.querySelectorAll('.stxt')].every(x => getComputedStyle(x).display === 'none');
    r.filaFechaBajoMarca = fila(gd) > fila(lg);
    const bu = document.querySelector('.hsearch input');
    r.buscadorAbajoYAncho = fila(bu) > fila(gd) && bu.getBoundingClientRect().width > innerWidth * 0.5;
    // nada del encabezado se sale de la pantalla
    r.sinDesborde = [lg, ck, gd, tg, bu, ...bts].every(x => Math.round(x.getBoundingClientRect().right) <= innerWidth)
      && document.documentElement.scrollWidth <= innerWidth;
    // aviso retrospectivo CORTO
    $('gDate').value = '2026-07-28'; onFechaChange(); actualizarRetroBar();
    r.retroCorto = $('retroTxt').textContent.trim();
    volverAHoy();
    return r;
  });
  eq('móvil: logo chico (≤32 px)', HDR.logoChico, true);
  eq('móvil: logo en línea con el reloj', HDR.logoConReloj, true);
  eq('móvil: ◀ y ▶ flanquean la fecha en UNA fila', HDR.flechasConFecha, true);
  eq('móvil: el turno acompaña esa fila', HDR.turnoEnLaFila, true);
  eq('móvil: la fecha respira (>35% del ancho)', HDR.fechaAncha, true);
  eq('móvil: turno solo con íconos ☀️/🌙', HDR.turnoSoloIconos, true);
  eq('móvil: la fila de fecha va bajo la marca', HDR.filaFechaBajoMarca, true);
  eq('móvil: buscador abajo, a todo el ancho', HDR.buscadorAbajoYAncho, true);
  eq('móvil: nada se desborda de la pantalla', HDR.sinDesborde, true);
  eq('aviso retrospectivo corto («Estás viendo …»)', /^Estás viendo /.test(HDR.retroCorto) && HDR.retroCorto.length < 70, true);

  await m.evaluate(() => { setTab('G'); DB = [{ ID_CAMA: '3' }]; abrirPanel('3', false); });
  await m.waitForTimeout(200);
  const acc = await m.evaluate(() => {
    const cards = [...document.querySelectorAll('#sp .fcard')].filter(f => !f.classList.contains('hidden') && f.offsetParent !== null);
    const colapsadas = cards.filter(f => f.classList.contains('mcol')).length;
    const primera = cards.find(f => f.id !== 'fcId');
    primera.querySelector('.fcard-hdr').click();
    const abierta = !primera.classList.contains('mcol');
    const act = document.querySelector('.act-bar');
    const r = act.getBoundingClientRect();
    return { total: cards.length, colapsadas, abierta, guardarALaVista: r.top < window.innerHeight };
  });
  eq('móvil: módulos parten colapsados', acc.colapsadas >= acc.total - 1, true);
  eq('móvil: tocar el encabezado abre el módulo', acc.abierta, true);
  eq('móvil: botonera Guardar a la vista (sticky)', acc.guardarALaVista, true);
  await m.close();

  // ── Escritorio (1200×900): regresión ──
  const d = await boot({ width: 1200, height: 900 });
  const visD = id => d.evaluate(x => { const e = document.querySelector(x); if (!e) return false; const s = getComputedStyle(e); return s.display !== 'none'; }, id);
  eq('escritorio: barra inferior oculta', await visD('.mnav'), false);
  eq('escritorio: pestañas clásicas visibles', await visD('.tabs'), true);
  await d.evaluate(() => { DB = [{ ID_CAMA: '3' }]; abrirPanel('3', false); });
  await d.waitForTimeout(200);
  eq('escritorio: sin acordeón (módulos extendidos)', await d.evaluate(() => document.querySelectorAll('#sp .fcard.mcol').length), 0);
  await d.close();

  await b.close();
  console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
