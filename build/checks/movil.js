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
