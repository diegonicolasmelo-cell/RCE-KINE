/**
 * arranque.js — Verifica que un index (fuente, minificado o cohete) arranca
 * en Chromium con el puente google.script.run simulado: pestañas renderizadas,
 * funciones clave definidas y cero errores de JavaScript.
 *
 * Uso: node build/checks/arranque.js [ruta.html]   (por defecto v2/index.html)
 * Requiere playwright-core (npm install --prefix build --no-save playwright-core)
 * y el Chromium preinstalado del entorno (/opt/pw-browsers/chromium).
 */
const path = require('path');
const { chromium } = require('playwright-core');
const archivo = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'v2', 'index.html'));

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) { setTimeout(() => ok({ ok: true, data:
        a === 'WHOAMI' ? { email: 'x@y.cl', firma: 'DMV', dev: true } :
        a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {}, CAT_DEF: {} } :
        a === 'GET_TODAS_CAMAS' ? [] : null }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + archivo);
  await p.waitForTimeout(2500);
  const R = await p.evaluate(() => ({
    tabs: !!document.querySelector('.tabs'),
    fns: [typeof fillFormReplica, typeof vmzChipTap, typeof confirmarFaseHeredada, typeof aplicarBanners],
  }));
  await b.close();
  const okFns = R.fns.every(t => t === 'function');
  console.log((R.tabs ? '✅' : '❌') + ' pestañas renderizadas');
  console.log((okFns ? '✅' : '❌') + ' funciones clave: ' + R.fns.join(','));
  console.log(errs.length ? '❌ ERRORES JS:\n' + errs.join('\n') : '✅ sin errores JS');
  process.exit(R.tabs && okFns && !errs.length ? 0 : 1);
})();
