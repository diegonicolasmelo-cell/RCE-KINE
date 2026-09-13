// confirma_guardado.js — PRD «que no quede ninguna evolución sin guardar», O3.
//
// El toast ✅ de siempre (3,2 s) SE MANTIENE, y además la franja del botón 💾
// queda con una confirmación PERSISTENTE y CON HORA — «✓ Guardado hh:mm» —
// que sigue a la vista después de que el toast se apagó y que NO es un overlay
// sobre el formulario (no tapa ningún campo).
//
// Uso: node build/checks/confirma_guardado.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const IDX = path.resolve(__dirname, '..', '..', 'v2', 'index.html');

(async () => {
  const fails = [];
  const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!ok) fails.push(l); };

  const src = fs.readFileSync(IDX, 'utf8');
  eq('el toast de éxito sigue existiendo (no se perdió en el camino)', /toast\('✅ Evolución guardada correctamente'\)/.test(src), true);
  eq('el éxito marca la franja con hora (_marcaGuardadoOK)', /_marcaGuardadoOK\(\)/.test(src), true);

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

  /* ── Guardado REAL que termina bien (api simulada) ── */
  const ok = await p.evaluate(async () => {
    localStorage.clear();
    window.__toasts = []; const _t = window.toast; window.toast = m => { window.__toasts.push(m); };
    $('sp').classList.add('on'); $('cBed').value = '6'; $('cIng').value = 'false';
    const f = $('fFirma'); f.innerHTML = '<option value="KIN">KIN</option>'; f.value = 'KIN';
    const va = $('fVA'); va.value = [...va.options].map(o => o.value).filter(Boolean)[0];
    $('fPlanes').value = 'movilización pasiva'; _formDirty = true;
    window.api = () => Promise.resolve({ TEXTO_GENERADO: 'texto del servidor' });
    window.gs = (a, d, ok) => ok([]);   // refresco de fondo: censo vacío en el banco de pruebas
    guardar();
    await new Promise(r => setTimeout(r, 300));
    const e = $('gEstadoGuardado');
    const r = window.getComputedStyle(e);
    return {
      toastExito: window.__toasts.some(m => /✅ Evolución guardada correctamente/.test(m)),
      visible: !e.classList.contains('hidden'),
      estado: e.dataset.estado,
      texto: e.textContent.trim(),
      dirty: _formDirty,
      abierto: !!document.querySelector('#sp.on'),
      posicion: r.position,
      dentroBarra: !!e.closest('.act-bar'),
    };
  });
  eq('el toast ✅ de siempre sigue saliendo', ok.toastExito, true);
  eq('la franja de confirmación queda visible', ok.visible, true);
  eq('…en estado «ok»', ok.estado, 'ok');
  eq('…con hora, formato «✓ Guardado hh:mm»', /^✓ Guardado \d{2}:\d{2}$/.test(ok.texto), true);
  eq('…dentro de la barra del botón 💾 (no es un overlay)', ok.dentroBarra, true);
  eq('…sin posicionamiento que tape campos', /static|relative/.test(ok.posicion), true);
  eq('el guardado con el botón 💾 normal deja el panel ABIERTO', ok.abierto, true);
  eq('_formDirty vuelve a false', ok.dirty, false);

  /* ── Persiste más allá de los 3,2 s del toast ── */
  const persiste = await p.evaluate(async () => {
    await new Promise(r => setTimeout(r, 3600));
    const e = $('gEstadoGuardado');
    return { visible: !e.classList.contains('hidden'), texto: e.textContent.trim() };
  });
  eq('sigue a la vista pasados los 3,2 s del toast', persiste.visible, true);
  eq('…con el mismo texto', /^✓ Guardado \d{2}:\d{2}$/.test(persiste.texto), true);

  /* ── La franja «⚠️ Sin guardar» conserva su sitio y su texto (NO1) ── */
  const noTocada = await p.evaluate(() => {
    _formDirty = true; _tickSinGuardar();
    return { visible: !$('gSinGuardar').classList.contains('hidden'), texto: $('gSinGuardar').textContent.trim() };
  });
  eq('la franja «⚠️ Sin guardar» sigue intacta (NO1)', noTocada.texto, '⚠️ Sin guardar');
  eq('…y sigue apareciendo con cambios sin guardar', noTocada.visible, true);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ confirma_guardado OK');
  process.exit(fails.length ? 1 : 0);
})();
