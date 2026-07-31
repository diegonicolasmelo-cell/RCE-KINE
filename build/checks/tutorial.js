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

  // ── v4.9 · Mascota, saludo de la primera vez y marca de agua ──
  const MASC = await p.evaluate(async () => {
    const fab = $('tutBtn').querySelector('img');
    const glo = $('tutGlobo').querySelector('.tg-masc');
    const lov = document.querySelector('#lov .lov-masc');
    const marca = getComputedStyle(document.documentElement).getPropertyValue('--marca-agua');
    const logo = document.querySelector('.hlogo');
    // el display real solo se puede medir con el recorrido ya desplegado
    tutAbrir(); await new Promise(r => setTimeout(r, 220));
    const flex = getComputedStyle($('tutGlobo')).display === 'flex';
    const altoMasc = $('tutGlobo').querySelector('.tg-masc').getBoundingClientRect().height;
    tutCerrar();
    return {
      globoFlex: flex, mascVisible: altoMasc > 40,
      fabImg: !!fab && fab.src.indexOf('data:image/png;base64,') === 0,
      fabSinTexto: $('tutBtn').textContent.trim() === '',
      globoImg: !!glo && glo.src.indexOf('data:image/png;base64,') === 0,
      cargaImg: !!lov && lov.src.indexOf('data:image/png;base64,') === 0,
      marcaAgua: marca.indexOf('data:image/png;base64,') > -1,
      logoIncrustado: !!logo && logo.src.indexOf('data:image/png;base64,') === 0,
    };
  });
  eq('mascota incrustada en el botón (sin depender de internet)', MASC.fabImg, true);
  eq('el botón ya no muestra el signo de interrogación', MASC.fabSinTexto, true);
  eq('mascota acompañando los globos del recorrido', MASC.globoImg, true);
  eq('mascota en la pantalla de carga', MASC.cargaImg, true);
  eq('marca de agua institucional incrustada', MASC.marcaAgua, true);
  eq('logo del encabezado incrustado', MASC.logoIncrustado, true);
  eq('el globo es contenedor flex (mascota + texto)', MASC.globoFlex, true);
  eq('la mascota se ve dentro del globo en escritorio', MASC.mascVisible, true);

  const HOLA = await p.evaluate(async () => {
    localStorage.removeItem('rce_tut_saludo');
    tutHolaMostrar();
    await new Promise(r => setTimeout(r, 2100));
    const visible = !$('tutHola').classList.contains('hidden');
    const sinVelo = $('tutVelo').classList.contains('hidden');   // no interrumpe
    tutHolaCerrar();
    const cerrado = $('tutHola').classList.contains('hidden');
    const marcado = localStorage.getItem('rce_tut_saludo') === '1';
    // segunda visita: ya no debe salir
    tutHolaMostrar();
    await new Promise(r => setTimeout(r, 2100));
    const noRepite = $('tutHola').classList.contains('hidden');
    return { visible, sinVelo, cerrado, marcado, noRepite };
  });
  eq('saludo de la primera vez aparece solo', HOLA.visible, true);
  eq('el saludo NO bloquea la app (sin velo)', HOLA.sinVelo, true);
  eq('la ✕ lo cierra', HOLA.cerrado, true);
  eq('queda marcado como visto', HOLA.marcado, true);
  eq('no vuelve a aparecer en la siguiente visita', HOLA.noRepite, true);

  const DESDE_HOLA = await p.evaluate(async () => {
    localStorage.removeItem('rce_tut_saludo');
    tutHolaMostrar(); await new Promise(r => setTimeout(r, 2100));
    tutAbrir(); await new Promise(r => setTimeout(r, 220));
    const r = { holaCerrado: $('tutHola').classList.contains('hidden'), tourAbierto: !$('tutGlobo').classList.contains('hidden') };
    tutCerrar();
    return r;
  });
  eq('abrir el tutorial cierra el saludo', DESDE_HOLA.holaCerrado, true);
  eq('y arranca el recorrido', DESDE_HOLA.tourAbierto, true);

  // ── v5.2 · Servi, el ventilador: estático junto a la mascota, duerme de noche ──
  const SERVI = await p.evaluate(async () => {
    const vis = id => { const e = $(id); return !!(e && e.offsetParent !== null); };
    const r = {};
    r.existe = !!$('servi');
    r.sinMarca = !/MAQUET|Servo-?u/i.test($('servi').innerHTML);
    r.nombre = /Servi/.test($('servi').innerHTML);
    r.vectorial = !!$('servi').querySelector('svg');   // no depende de imágenes externas
    r.estatico = getComputedStyle($('servi')).animationName === 'none';
    SHIFT = 'Dia'; serviEstado();
    r.diaDespierto = vis('serviOn') && !vis('serviOff');
    SHIFT = 'Noche'; serviEstado();
    r.nocheDuerme = vis('serviOff') && !vis('serviOn');
    SHIFT = 'Dia'; serviEstado();
    r.vuelve = vis('serviOn');
    const s = $('servi').getBoundingClientRect(), m = $('tutBtn').getBoundingClientRect();
    r.noTapaLaMascota = s.right <= m.left + 4;
    r.mismaFranja = Math.abs(s.bottom - m.bottom) < 40;
    return r;
  });
  eq('Servi está en la interfaz', SERVI.existe, true);
  eq('Servi es vectorial (no depende de archivos externos)', SERVI.vectorial, true);
  eq('Servi lleva su nombre', SERVI.nombre, true);
  eq('sin marcas comerciales (MAQUET / Servo-u)', SERVI.sinMarca, true);
  eq('Servi queda QUIETO (no flota como la mascota)', SERVI.estatico, true);
  eq('de día está despierto', SERVI.diaDespierto, true);
  eq('en turno noche duerme', SERVI.nocheDuerme, true);
  eq('al volver a turno día despierta', SERVI.vuelve, true);
  eq('Servi no tapa a la mascota', SERVI.noTapaLaMascota, true);
  eq('ambos en la misma franja inferior', SERVI.mismaFranja, true);

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
