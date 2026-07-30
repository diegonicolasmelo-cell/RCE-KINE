// tutorial.js — Guardia del ❓ Tutorial anclado (v4.8): botón flotante,
// recorrido de globos con anillo-foco, cambio de pestaña por paso, fallback
// centrado cuando el ancla no existe, cierre con Salir/Escape y regreso a
// CAMAS. Uso: node build/checks/tutorial.js
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) { setTimeout(() => ok({ ok: true, data: null }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  const BASE = await p.evaluate(() => ({
    fab: !!$('tutBtn') && !$('tutBtn').classList.contains('hidden'),
    enMas: [...document.querySelectorAll('#msheet .mit')].some(x => x.textContent.indexOf('Tutorial') > -1),
    pasos: TUT_PASOS.length,
    cerrado: $('tutGlobo').classList.contains('hidden') && $('tutVelo').classList.contains('hidden'),
  }));
  eq('botón ❓ flotante visible', BASE.fab, true);
  eq('entrada «❓ Tutorial» en la hoja Más del móvil', BASE.enMas, true);
  eq('recorrido de 8 pasos', BASE.pasos, 8);
  eq('parte cerrado (sin globo ni velo)', BASE.cerrado, true);

  const P1 = await p.evaluate(async () => {
    tutAbrir(); await new Promise(r => setTimeout(r, 200));
    const g = $('tutGlobo'), ring = $('tutRing');
    return {
      abierto: !g.classList.contains('hidden') && !$('tutVelo').classList.contains('hidden'),
      titulo: $('tutTit').textContent, contador: $('tutN').textContent,
      anillo: !ring.classList.contains('hidden') && parseFloat(ring.style.width) > 100,
      botonSig: $('tutSig').textContent,
    };
  });
  eq('paso 1 abre globo y velo', P1.abierto, true);
  eq('paso 1 apunta a las pestañas', P1.titulo.indexOf('pestañas') > -1, true);
  eq('contador «1 de 8»', P1.contador, '1 de 8');
  eq('anillo-foco dibujado sobre la barra de pestañas', P1.anillo, true);
  eq('botón dice Siguiente', P1.botonSig.indexOf('Siguiente') > -1, true);

  const P5 = await p.evaluate(async () => {
    tutSiguiente(); tutSiguiente(); tutSiguiente(); tutSiguiente(); // pasos 2..5
    await new Promise(r => setTimeout(r, 220));
    return { tab: ATAB, titulo: $('tutTit').textContent };
  });
  eq('paso 5 cambia a la pestaña REGISTRO', P5.tab, 'P');
  eq('paso 5 presenta el Registro Diario', P5.titulo.indexOf('Registro Diario') > -1, true);

  const P7 = await p.evaluate(async () => {
    tutSiguiente(); tutSiguiente(); // 6 y 7
    await new Promise(r => setTimeout(r, 220));
    // el anillo anima 0,25 s: se compara el destino (style), no el rect en tránsito
    const rl = parseFloat($('tutRing').style.left), b2 = $('btnDocs').getBoundingClientRect();
    return { titulo: $('tutTit').textContent, sobreDocs: Math.abs((rl + 6) - b2.left) < 3 };
  });
  eq('paso 7 presenta 📂 Documentos', P7.titulo.indexOf('Documentos') > -1, true);
  eq('el anillo encuadra el botón de Documentos', P7.sobreDocs, true);

  const FIN = await p.evaluate(async () => {
    tutSiguiente(); await new Promise(r => setTimeout(r, 220));
    const t = { ultimoBtn: $('tutSig').textContent, tabFinal: ATAB };
    tutSiguiente(); await new Promise(r => setTimeout(r, 60));
    t.cerrado = $('tutGlobo').classList.contains('hidden') && $('tutVelo').classList.contains('hidden') && $('tutRing').classList.contains('hidden');
    t.tabTrasCerrar = ATAB;
    return t;
  });
  eq('último paso ofrece «Terminar ✓»', FIN.ultimoBtn, 'Terminar ✓');
  eq('el cierre regresa a CAMAS', FIN.tabTrasCerrar, 'G');
  eq('terminar limpia globo, velo y anillo', FIN.cerrado, true);

  const ESC = await p.evaluate(async () => {
    tutAbrir(); await new Promise(r => setTimeout(r, 200));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await new Promise(r => setTimeout(r, 60));
    return $('tutGlobo').classList.contains('hidden') && $('tutVelo').classList.contains('hidden');
  });
  eq('Escape cierra el recorrido', ESC, true);

  const SIN = await p.evaluate(async () => {
    // ancla inexistente → globo centrado con velo oscuro, sin anillo
    TUT_PASOS.unshift({ tab: 'G', sel: '#noExiste', t: 'X', d: 'Y' });
    tutAbrir(); await new Promise(r => setTimeout(r, 200));
    const r = { anillo: !$('tutRing').classList.contains('hidden'), dim: $('tutVelo').classList.contains('dim') };
    tutCerrar(); TUT_PASOS.shift();
    return r;
  });
  eq('ancla inexistente: sin anillo y con velo oscuro (globo centrado)', !SIN.anillo && SIN.dim, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS:', errs.join(' | ')); fails.push('errores JS'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
