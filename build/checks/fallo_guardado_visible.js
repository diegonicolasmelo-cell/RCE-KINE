// fallo_guardado_visible.js — PRD «que no quede ninguna evolución sin guardar», O3b.
//
// Requisito de Manuel (13-sep-2026): un guardado que FALLA no puede avisarse
// solo con un toast de 3,2 s — si el kinesiólogo estaba mirando al paciente, el
// error se apaga solo y el botón vuelve a decir «💾 Guardar Evolución» como si
// nada. Aquí se fuerza el fallo del intento Y del reintento automático de 3 s y
// se exige: franja de error PERSISTENTE con «Reintentar», _formDirty en true,
// el texto del formulario intacto, y un reintento manual que remande los MISMOS
// datos sin duplicar viajes.
//
// Uso: node build/checks/fallo_guardado_visible.js (requiere playwright-core)
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

  /* ── Fallo del intento y del reintento automático ── */
  const fallo = await p.evaluate(async () => {
    localStorage.clear();
    window.__toasts = []; window.toast = m => window.__toasts.push(m);
    window.__viajes = 0;
    $('sp').classList.add('on'); $('cBed').value = '11'; $('cIng').value = 'false';
    const f = $('fFirma'); f.innerHTML = '<option value="KIN">KIN</option>'; f.value = 'KIN';
    const va = $('fVA'); va.value = [...va.options].map(o => o.value).filter(Boolean)[0];
    $('fPlanes').value = 'bipedestación asistida'; _formDirty = true;
    window.gs = (a, d, ok) => ok([]);
    window.api = () => { window.__viajes++; return Promise.reject(new Error('red caída')); };
    guardar();
    await new Promise(r => setTimeout(r, 3500));   // intento + reintento automático de 3 s
    const e = $('gEstadoGuardado');
    return {
      viajes: window.__viajes,
      toastError: window.__toasts.some(m => /No se pudo guardar/.test(m)),
      visible: !e.classList.contains('hidden'),
      estado: e.dataset.estado,
      texto: e.textContent.replace(/\s+/g, ' ').trim(),
      hayReintentar: !!e.querySelector('button'),
      botonVolvio: $('btnGuardar').textContent.trim(),
      dirty: _formDirty,
      sinGuardarVisible: (_tickSinGuardar(), !$('gSinGuardar').classList.contains('hidden')),
      texto_form: $('fPlanes').value,
      borrador: Object.keys(localStorage).filter(k => /^CAMA_11_/.test(k)).length,
    };
  });
  eq('un intento + un reintento automático: dos viajes, no más', fallo.viajes, 2);
  eq('el toast ❌ sigue avisando al tiro', fallo.toastError, true);
  eq('la franja del botón 💾 queda en estado de ERROR', fallo.estado, 'error');
  eq('…visible', fallo.visible, true);
  eq('…con el texto «NO se guardó»', /NO se guardó/.test(fallo.texto), true);
  eq('…y su botón Reintentar', fallo.hayReintentar && /Reintentar/.test(fallo.texto), true);
  eq('_formDirty SIGUE en true', fallo.dirty, true);
  eq('…así que «⚠️ Sin guardar» no se apagó', fallo.sinGuardarVisible, true);
  eq('el texto escrito no se tocó', fallo.texto_form, 'bipedestación asistida');
  eq('se dejó borrador local por si el equipo se apaga ahora', fallo.borrador, 1);

  /* ── El error NO se desvanece como el toast ── */
  const persiste = await p.evaluate(async () => {
    await new Promise(r => setTimeout(r, 3600));
    const e = $('gEstadoGuardado');
    return { visible: !e.classList.contains('hidden'), estado: e.dataset.estado };
  });
  eq('el estado de error sigue ahí pasados los 3,2 s del toast', persiste.visible, true);
  eq('…y sigue siendo «error» (no se apaga solo)', persiste.estado, 'error');

  /* ── Reintentar manual: los MISMOS datos, y al salir bien la franja pasa a ✓ ── */
  const reintento = await p.evaluate(async () => {
    window.__viajes = 0; window.__payload = null;
    window.api = (a, d) => { window.__viajes++; window.__payload = d; return Promise.resolve({ TEXTO_GENERADO: 'ok' }); };
    $('gEstadoGuardado').querySelector('button').click();
    await new Promise(r => setTimeout(r, 400));
    const e = $('gEstadoGuardado');
    return {
      viajes: window.__viajes,
      mismosDatos: !!(window.__payload && window.__payload.PLAN_PLANES === 'bipedestación asistida'),
      estado: e.dataset.estado,
      texto: e.textContent.trim(),
      dirty: _formDirty,
      borrador: Object.keys(localStorage).filter(k => /^CAMA_11_/.test(k)).length,
    };
  });
  eq('Reintentar manda UN viaje (no se suma al automático)', reintento.viajes, 1);
  eq('…con los MISMOS datos del intento fallido', reintento.mismosDatos, true);
  eq('al salir bien la franja pasa a la confirmación con hora', /^✓ Guardado \d{2}:\d{2}$/.test(reintento.texto), true);
  eq('…en estado «ok»', reintento.estado, 'ok');
  eq('…_formDirty vuelve a false', reintento.dirty, false);
  eq('…y el borrador local se descarta (ya está en el servidor)', reintento.borrador, 0);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ fallo_guardado_visible OK');
  process.exit(fails.length ? 1 : 0);
})();
