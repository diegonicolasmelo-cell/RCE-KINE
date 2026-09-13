// beforeunload_sin_stack.js — PRD «que no quede ninguna evolución sin guardar».
//
// Punto 11 del inventario: el beforeunload avisaba por «_formDirty && panel
// abierto» O POR la pila de minimizados. Sin minimizar, esa segunda condición
// quedaría mintiendo (avisaría por algo que ya no existe) o, peor, dejaría de
// avisar. Aquí se exige que el aviso del navegador siga saliendo con el panel
// abierto y cambios sin guardar, y que NO salga cuando ya se guardó.
//
// Uso: node build/checks/beforeunload_sin_stack.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const IDX = path.resolve(__dirname, '..', '..', 'v2', 'index.html');

(async () => {
  const fails = [];
  const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!ok) fails.push(l); };

  const src = fs.readFileSync(IDX, 'utf8');
  const i = src.indexOf("addEventListener('beforeunload'");
  const bloque = src.slice(i, i + 260);
  eq('el beforeunload existe', i > 0, true);
  eq('…y ya no menciona la pila de minimizados', /_minStack/.test(bloque), false);
  eq('…y sigue mirando _formDirty', /_formDirty/.test(bloque), true);
  eq('…y que el panel esté abierto', /#sp\.on/.test(bloque), true);

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

  // El evento se dispara a mano y se mira si alguien lo canceló (que es lo que
  // hace aparecer el diálogo nativo «¿Salir del sitio?»).
  const caso = (estado) => p.evaluate((st) => {
    if (st.abierto) $('sp').classList.add('on'); else $('sp').classList.remove('on');
    _formDirty = st.dirty;
    const ev = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(ev);
    return ev.defaultPrevented;
  }, estado);

  eq('panel abierto CON cambios · el navegador avisa', await caso({ abierto: true, dirty: true }), true);
  eq('panel abierto ya guardado · no molesta', await caso({ abierto: true, dirty: false }), false);
  eq('panel cerrado · no molesta', await caso({ abierto: false, dirty: true }), false);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ beforeunload_sin_stack OK');
  process.exit(fails.length ? 1 : 0);
})();
