// sin_minimizar.js — PRD «que no quede ninguna evolución sin guardar», O1.
//
// El minimizar se eliminó entero: esquivaba la confirmación de cierre, se
// llevaba el borrador a un array en memoria (_minStack) que moría con la
// pestaña, y el kinesiólogo creía que «lo dejó abierto». Esta guardia es la que
// impide que el botón vuelva la próxima vez que alguien quiera «no perder lo
// escrito»: para eso están ahora el modal de tres acciones y el borrador local.
//
// Uso: node build/checks/sin_minimizar.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const IDX = path.resolve(__dirname, '..', '..', 'v2', 'index.html');

(async () => {
  const fails = [];
  const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!ok) fails.push(l); };

  /* ── 1 · Ninguna de las cadenas del mecanismo sobrevive ── */
  const src = fs.readFileSync(IDX, 'utf8');
  ['minimizarPanel', 'restaurarDesdeMin', '_renderMinTray', '_minStack', 'minTray', 'min-pill', '_restaurarMin', '_snapPanel']
    .forEach(c => eq('no queda ninguna «' + c + '» en v2/index.html', src.includes(c), false));

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

  /* ── 2 · Ni las funciones ni la bandeja existen en runtime ── */
  const vivo = await p.evaluate(() => ({
    funciones: ['minimizarPanel', 'restaurarDesdeMin', '_renderMinTray', '_restaurarMin', '_snapPanel'].filter(f => typeof window[f] === 'function'),
    bandeja: !!document.getElementById('minTray'),
    pastillas: document.querySelectorAll('.min-pill').length,
  }));
  eq('ninguna función del minimizar quedó viva', vivo.funciones.join(','), '');
  eq('la bandeja de minimizados no existe', vivo.bandeja, false);
  eq('no hay pastillas abajo a la izquierda', vivo.pastillas, 0);

  /* ── 3 · En la barra del panel queda SOLO la ✕ ── */
  const barra = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('#sp .phdr button')];
    return {
      n: btns.length,
      textos: btns.map(x => (x.textContent || '').trim()).join('|'),
      titulos: btns.map(x => (x.title || '')).join('|'),
      hayMinimizar: btns.some(x => /Minimizar/i.test(x.title || '') || (x.textContent || '').trim() === '−'),
    };
  });
  eq('la barra del panel tiene un solo botón', barra.n, 1);
  eq('…y es la ✕', /×|✕/.test(barra.textos), true);
  eq('no hay ningún botón «Minimizar» ni «−»', barra.hayMinimizar, false);

  /* ── 4 · No queda ninguna salida del panel que esquive la guardia de cambios
     sin guardar: con _formDirty, cerrar SIEMPRE pasa por el modal ── */
  const unicaSalida = await p.evaluate(async () => {
    $('sp').classList.add('on'); $('cBed').value = '6'; _formDirty = true;
    cerrarPanel();
    await new Promise(r => setTimeout(r, 140));
    return { modal: $('ucOvl').classList.contains('on'), abierto: !!document.querySelector('#sp.on') };
  });
  eq('cerrar con cambios abre el modal (no hay atajo que lo esquive)', unicaSalida.modal, true);
  eq('…y el panel no se fue solo', unicaSalida.abierto, true);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ sin_minimizar OK');
  process.exit(fails.length ? 1 : 0);
})();
