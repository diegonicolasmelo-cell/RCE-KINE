// cierre_tres_acciones.js — PRD «que no quede ninguna evolución sin guardar», O2.
//
// Cerrar el panel con cambios sin guardar abre un MODAL PROPIO de tres acciones
// —«Guardar y cerrar» (por defecto), «Seguir editando», «Cerrar y conservar
// borrador»— y NINGUNA de las tres pierde lo escrito. Falla si vuelve un
// confirm() nativo en ese camino, si reaparece una salida destructiva
// («Cerrar y descartar») o si alguna acción pide una segunda confirmación.
//
// Uso: node build/checks/cierre_tres_acciones.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const IDX = path.resolve(__dirname, '..', '..', 'v2', 'index.html');

(async () => {
  const fails = [];
  const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!ok) fails.push(l); };

  /* ── 1 · Estático: el camino de cierre no usa confirm() nativo ni descarta ── */
  const src = fs.readFileSync(IDX, 'utf8');
  const bruto = src.slice(src.indexOf('function cerrarPanel(force)'), src.indexOf('function cerrarPanel(force)') + 2200);
  // Sin los comentarios: ahí la palabra aparece a propósito ("jamás confirm() nativo").
  const cuerpo = bruto.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n').replace(/uiConfirm/g, 'uiOK');
  eq('cerrarPanel no llama al confirm() nativo', /[^.\w]confirm\s*\(/.test(cuerpo), false);
  eq('cerrarPanel usa el modal propio (uiConfirm)', /uiOK\s*\(/.test(cuerpo), true);
  eq('ya NO existe la salida destructiva que descartaba lo escrito', /confirmar\s*:\s*'Cerrar y descartar'/.test(src), false);

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
    // El confirm() nativo está prohibido en este camino: si alguien lo repone,
    // la guardia lo caza aquí además de en el análisis estático.
    window.__nativo = 0;
    window.confirm = () => { window.__nativo++; return true; };
  });
  await p.goto('file://' + IDX);
  await p.waitForTimeout(500);

  /* ── 2 · Con cambios sin guardar: sale el modal propio, con las tres acciones ── */
  const modal = await p.evaluate(async () => {
    localStorage.clear();
    $('cBed').value = '6'; $('sp').classList.add('on'); _formDirty = true;
    cerrarPanel();
    await new Promise(r => setTimeout(r, 140));
    const vis = $('ucOvl').classList.contains('on');
    const alt = $('ucAlt');
    return {
      visible: vis,
      nativo: window.__nativo,
      ok: $('ucOk').textContent.trim(),
      cancel: $('ucCancel').textContent.trim(),
      alterno: (alt.textContent || '').trim(),
      altVisible: alt.style.display !== 'none',
      foco: document.activeElement && document.activeElement.id,
      panelSigueAbierto: !!document.querySelector('#sp.on'),
    };
  });
  eq('con cambios sin guardar se abre el modal propio', modal.visible, true);
  eq('…y NO se usó el confirm() del navegador', modal.nativo, 0);
  eq('acción 1 · «Guardar y cerrar»', modal.ok, 'Guardar y cerrar');
  eq('acción 2 · «Seguir editando»', modal.cancel, 'Seguir editando');
  eq('acción 3 · «Cerrar y conservar borrador»', modal.alterno, 'Cerrar y conservar borrador');
  eq('…la tercera acción está a la vista', modal.altVisible, true);
  eq('«Guardar y cerrar» es la acción por defecto (tiene el foco)', modal.foco, 'ucOk');
  eq('el panel sigue abierto mientras se decide', modal.panelSigueAbierto, true);

  /* ── 3 · «Seguir editando» no cierra ni toca lo escrito ── */
  const seguir = await p.evaluate(async () => {
    $('fPlanes').value = 'sedente al borde de cama';
    $('ucCancel').click();
    await new Promise(r => setTimeout(r, 120));
    return { abierto: !!document.querySelector('#sp.on'), dirty: _formDirty, texto: $('fPlanes').value, modal: $('ucOvl').classList.contains('on'), borradores: Object.keys(localStorage).length };
  });
  eq('«Seguir editando» deja el panel abierto', seguir.abierto, true);
  eq('…con los cambios intactos', seguir.texto, 'sedente al borde de cama');
  eq('…y _formDirty sigue en true', seguir.dirty, true);
  eq('…sin dejar borrador (no cerró)', seguir.borradores, 0);

  /* ── 4 · «Cerrar y conservar borrador»: cierra al tiro, SIN segunda
     confirmación, y lo escrito queda en localStorage ── */
  const conservar = await p.evaluate(async () => {
    _formDirty = true; $('sp').classList.add('on');
    cerrarPanel();
    await new Promise(r => setTimeout(r, 140));
    $('ucAlt').click();
    await new Promise(r => setTimeout(r, 200));
    const llaves = Object.keys(localStorage).filter(k => /^CAMA_6_/.test(k));
    return {
      abierto: !!document.querySelector('#sp.on'),
      segundaConfirmacion: $('ucOvl').classList.contains('on'),
      llaves: llaves.length,
      texto: llaves.length ? (JSON.parse(localStorage.getItem(llaves[0])).campos.fPlanes || '') : '',
      nativo: window.__nativo,
    };
  });
  eq('«Cerrar y conservar borrador» cierra el panel', conservar.abierto, false);
  eq('…SIN segunda confirmación (ya no hay pérdida que confirmar)', conservar.segundaConfirmacion, false);
  eq('…y deja el borrador de esa cama y ese turno', conservar.llaves, 1);
  eq('…con lo escrito dentro', conservar.texto, 'sedente al borde de cama');
  eq('…sin confirm() nativo en ningún momento', conservar.nativo, 0);

  /* ── 5 · Sin cambios: cierra al tiro, sin preguntar ni dejar borrador ── */
  const limpio = await p.evaluate(async () => {
    localStorage.clear();
    $('sp').classList.add('on'); _formDirty = false;
    cerrarPanel();
    await new Promise(r => setTimeout(r, 140));
    return { abierto: !!document.querySelector('#sp.on'), modal: $('ucOvl').classList.contains('on'), borradores: Object.keys(localStorage).length };
  });
  eq('sin cambios · cierra de inmediato', limpio.abierto, false);
  eq('…sin preguntar nada', limpio.modal, false);
  eq('…y sin dejar borrador', limpio.borradores, 0);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ cierre_tres_acciones OK');
  process.exit(fails.length ? 1 : 0);
})();
