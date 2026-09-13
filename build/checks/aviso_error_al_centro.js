// aviso_error_al_centro.js — el aviso de error se ve al centro y no se escapa.
//
// PEDIDO DE MANUEL (13-sep-2026, lo sufre en turno): «quiero que el aviso de
// error de carga o error de guardado de la evolución aparezca en la pantalla
// al centro, en un cuadrado, por lo menos de unos 3 × 6 y 3 × 7. Que sea un
// rectángulo grande visible que diga claramente "No se guardó", con opción de
// "Reintentar"». Hasta 7.03 el fallo de guardado era una píldora de ~1 cm en
// la cabecera: a las 3 de la mañana no se ve, y la evolución se pierde.
//
// Esta guardia mide la PROPIEDAD, no una lista de píxeles que vi una vez:
//   · que el cuadro está CENTRADO en el viewport (no «a 640 px del borde»),
//   · que es GRANDE y ANCHO (proporción ~1:2, el «3 × 7» del pedido),
//   · que el de GUARDADO no se cierra ni con Escape ni con un clic fuera
//     (cerrarlo de un manotazo es justo lo que hace perder la evolución),
//   · que el de CARGA sí se cierra,
//   · y — regla «¿qué dato VERDADERO deja de verse?» — que la píldora
//     #gEstadoGuardado SIGUE ahí de rastro cuando el cuadro se cierra. Esa
//     píldora es el estado PERSISTENTE del PRD y la mide sin_guardar.js.
//
// Llama a las FUNCIONES REALES del index (_marcaGuardadoError, avisoErrorCarga,
// reintentarGuardado). No monta HTML inventado: si mañana alguien cambia el
// markup y deja de llamarlas, esto tiene que ponerse rojo.
//
// 🪤 Todas las lecturas del DOM son TOLERANTES a que el nodo no exista. Nació
// con locator.innerText() y contra el código sin arreglar moría por timeout en
// el tercer assert: una guardia que revienta no dice QUÉ falta, dice nada.
//
// Uso: node build/checks/aviso_error_al_centro.js
const { chromium } = require('playwright-core');
const path = require('path');

const VW = 1280, VH = 900;

(async () => {
  const fails = [];
  const si = (l, c, d) => { console.log((c ? '✅' : '❌') + ' ' + l + (d !== undefined ? ': ' + d : '')); if (!c) fails.push(l); };

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: VW, height: VH } });
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });

  const txt = sel => p.evaluate(q => { const e = document.querySelector(q); return e ? (e.textContent || '').trim() : ''; }, sel);
  const hay = sel => p.evaluate(q => !!document.querySelector(q), sel);
  const css = (sel, pr) => p.evaluate(([q, k]) => { const e = document.querySelector(q); return e ? getComputedStyle(e)[k] : ''; }, [sel, pr]);
  const abierto = () => p.evaluate(() => !!document.getElementById('avErrOvl')?.classList.contains('on'));
  const clic = async sel => { try { await p.click(sel, { timeout: 1500 }); } catch (_) {} };

  // Puente simulado, igual que sin_guardar.js: lo que se prueba es el aviso,
  // no el arranque. Sin esto el boot se queda en el overlay de reconexión.
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(600);
  await p.evaluate(() => { const o = document.getElementById('loginOvl'); if (o) o.style.display = 'none'; });

  /* ── 0 · El cuadro existe y NACE cerrado (no molesta a nadie) ───────────── */
  si('el cuadro central existe en el documento', await hay('#avErrOvl'));
  si('…y arranca cerrado', (await hay('#avErrOvl')) && !(await abierto()));

  /* ── 1 · FALLO DE GUARDADO por la función real ──────────────────────────── */
  const arranque = await p.evaluate(() => {
    if (typeof _marcaGuardadoError !== 'function') return { falta: true };
    try { _marcaGuardadoError('El servidor no respondió (prueba)'); } catch (e) { return { falta: false, err: e.message }; }
    return { falta: false };
  });
  await p.waitForTimeout(300);
  si('_marcaGuardadoError() existe y abre el cuadro',
    arranque.falta !== true && !arranque.err && (await abierto()), arranque.err || undefined);

  /* ── 2 · Dice lo que Manuel pidió que dijera ────────────────────────────── */
  const tit = await txt('#avErrTit');
  si('el título dice exactamente «No se guardó»', tit === 'No se guardó', JSON.stringify(tit));
  const tam = await css('#avErrTit', 'fontSize');
  si('…y se lee grande (≥ 24 px de tipografía)', parseFloat(tam || 0) >= 24, tam || '(no existe)');
  const det = await txt('#avErrMsg');
  si('el detalle del error viaja al cuadro', /no respondió/i.test(det), JSON.stringify(det.slice(0, 60)));

  si('hay un botón «Reintentar» y está visible',
    (await hay('#avErrReint'))
    && (await p.evaluate(() => { const e = document.getElementById('avErrReint'); return !!e && e.offsetWidth > 0 && e.offsetHeight > 0; }))
    && (await txt('#avErrReint')) === 'Reintentar');
  si('…y un botón para seguir editando sin perder nada',
    (await txt('#avErrSec')) === 'Seguir editando', JSON.stringify(await txt('#avErrSec')));

  /* ── 3 · GEOMETRÍA REAL: centrado y rectángulo ancho ────────────────────── */
  const g = await p.evaluate(() => {
    const c = document.getElementById('avErrCard');
    if (!c) return { w: 0, h: 0, cx: -9999, cy: -9999, vw: innerWidth, vh: innerHeight };
    const r = c.getBoundingClientRect();
    return { w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2, vw: innerWidth, vh: innerHeight };
  });
  const dx = Math.abs(g.cx - g.vw / 2), dy = Math.abs(g.cy - g.vh / 2);
  si('está CENTRADO en el viewport (±2 px en los dos ejes)', g.w > 0 && dx <= 2 && dy <= 2,
    g.w > 0 ? 'desvío ' + dx.toFixed(1) + ' × ' + dy.toFixed(1) + ' px' : '(no hay cuadro)');
  si('es un rectángulo GRANDE (≥ 480 × 200 px)', g.w >= 480 && g.h >= 200,
    Math.round(g.w) + ' × ' + Math.round(g.h) + ' px');
  const ratio = g.h > 0 ? g.w / g.h : 0;
  si('…y ANCHO, en la proporción que pidió Manuel (1:2 a 1:2,4)',
    ratio >= 2.0 && ratio <= 2.4, '1:' + ratio.toFixed(2));
  si('no se sale de la pantalla', g.w > 0 && g.w <= g.vw && g.h <= g.vh);

  /* ── 4 · Es BLOQUEANTE: ni Escape ni clic fuera lo cierran ──────────────── */
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  si('Escape NO cierra el cuadro de guardado', (await abierto()) === true);

  await p.mouse.click(24, 24);   // el overlay, bien lejos del cuadro
  await p.waitForTimeout(200);
  si('un clic fuera TAMPOCO lo cierra', (await abierto()) === true);

  /* ── 5 · La píldora del PRD sigue viva (no la reemplazó el cuadro) ──────── */
  const pil = await p.evaluate(() => {
    const e = document.getElementById('gEstadoGuardado');
    return { existe: !!e, oculta: e ? e.classList.contains('hidden') : null,
             estado: e ? e.dataset.estado : null, txt: e ? e.textContent : '' };
  });
  si('la píldora #gEstadoGuardado sigue existiendo y visible', pil.existe === true && pil.oculta === false);
  si('…y sigue marcando el error', pil.estado === 'error' && /NO se guardó/.test(pil.txt), pil.estado);

  /* ── 6 · «Seguir editando» cierra el cuadro y DEJA el rastro ────────────── */
  await clic('#avErrSec');
  await p.waitForTimeout(200);
  const tras = await p.evaluate(() => {
    const o = document.getElementById('avErrOvl'), e = document.getElementById('gEstadoGuardado');
    return { cerrado: !!o && !o.classList.contains('on'),
             pildora: e ? e.dataset.estado : null,
             oculta: e ? e.classList.contains('hidden') : null };
  });
  si('«Seguir editando» cierra el cuadro', tras.cerrado === true);
  si('…y la píldora roja QUEDA de rastro', tras.pildora === 'error' && tras.oculta === false, tras.pildora);

  /* ── 7 · «Reintentar» corre el reintento real y cierra el cuadro ────────── */
  const rt = await p.evaluate(() => {
    window.__corrio = 0;
    try { _reintentoGuardado = () => { window.__corrio++; }; _marcaGuardadoError('otra vez'); } catch (_) {}
    return !!document.getElementById('avErrOvl')?.classList.contains('on');
  });
  si('el cuadro vuelve a abrirse en un segundo fallo', rt === true);
  await p.waitForTimeout(200);
  await clic('#avErrReint');
  await p.waitForTimeout(250);
  const post = await p.evaluate(() => {
    const o = document.getElementById('avErrOvl');
    return { corrio: window.__corrio, cerrado: !!o && !o.classList.contains('on') };
  });
  si('«Reintentar» remanda los MISMOS datos (corre el reintento pendiente)', post.corrio === 1, post.corrio);
  si('…y cierra el cuadro', post.cerrado === true);

  /* ── 8 · MISMO componente para el error de CARGA, con su propio título ──── */
  const carga = await p.evaluate(() => {
    if (typeof avisoErrorCarga !== 'function') return { falta: true, nCuadros: document.querySelectorAll('#avErrOvl').length };
    window.__recarga = 0;
    try { avisoErrorCarga('Ventiladores — sin conexión', () => { window.__recarga++; }); } catch (_) {}
    const o = document.getElementById('avErrOvl'), t = document.getElementById('avErrTit'), s = document.getElementById('avErrSec');
    return { falta: false, on: !!o && o.classList.contains('on'),
             tit: t ? t.textContent.trim() : '', sec: s ? s.textContent.trim() : '',
             nCuadros: document.querySelectorAll('#avErrOvl').length };
  });
  si('avisoErrorCarga() existe y usa EL MISMO cuadro (no duplica markup)',
    carga.falta !== true && carga.on === true && carga.nCuadros === 1);
  si('…con su propio título «No se pudo cargar»', carga.tit === 'No se pudo cargar', JSON.stringify(carga.tit));
  si('…y su botón secundario dice «Cerrar», no «Seguir editando»', carga.sec === 'Cerrar', JSON.stringify(carga.sec));

  await p.waitForTimeout(200);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(200);
  si('el de CARGA SÍ se cierra con Escape (no hay nada escrito que perder)',
    carga.falta !== true && (await abierto()) === false);

  /* ── 9 · El sello de versión de esta entrega ────────────────────────────── */
  const sello = await p.evaluate(() => (document.querySelector('meta[name="rce-version"]') || {}).content || '');
  si('el meta rce-version lleva el sello de esta entrega', /^7\.04-/.test(sello), sello || '(sin meta)');

  si('sin errores JS en toda la corrida', errs.filter(e => !/favicon/.test(e)).length === 0, errs.join(' | '));

  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ aviso de error al centro OK');
  process.exit(fails.length ? 1 : 0);
})();
