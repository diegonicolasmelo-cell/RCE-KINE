// sin_guardar.js — Aviso de "sin guardar" reforzado (ago-2026).
//
// REPORTE DE DIEGO: Eduardo generó el texto de una evolución (con firma) pero
// aparentemente nunca apretó "Guardar" — la evolución no quedó en EVOLUCIONES.
// Ya existía _formDirty + confirmación al cerrar el panel + beforeunload, pero
// un cierre que no dispara beforeunload (equipo apagado a la fuerza) se salta
// todo eso. Se agrega una franja SIEMPRE visible junto al botón Guardar
// mientras haya cambios sin guardar, y un recordatorio único a los 10 min.
// El texto SIGUE en vivo (sin botón manual de "Generar texto" — decisión
// explícita: revertirlo reabriría el bug que v5.34 cerró).
//
// Uso: node build/checks/sin_guardar.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(()=>{
    window.google={script:{run:{withSuccessHandler(ok){return{withFailureHandler(){return{
      api(a,d){ setTimeout(()=>ok({ok:true,data:(a==='GET_CONFIG_UI'?{NUM_CAMAS:12,BANNERS:{}}:null)}),5); }
    };}};}}}};
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  /* ── 1 · Panel cerrado: el indicador no molesta aunque _formDirty sea true ── */
  const cerrado = await p.evaluate(() => {
    $('sp').classList.remove('on'); _formDirty = true;
    _tickSinGuardar();
    return $('gSinGuardar').classList.contains('hidden');
  });
  eq('panel CERRADO · el indicador queda oculto (no aplica)', cerrado, true);

  /* ── 2 · Panel abierto, sin cambios: oculto ── */
  const limpio = await p.evaluate(() => {
    $('sp').classList.add('on'); _formDirty = false;
    _tickSinGuardar();
    return $('gSinGuardar').classList.contains('hidden');
  });
  eq('panel abierto, SIN cambios · indicador oculto', limpio, true);

  /* ── 3 · Panel abierto con cambios: aparece de inmediato ── */
  const sucio = await p.evaluate(() => {
    _formDirty = true;
    _tickSinGuardar();
    return { oculto: $('gSinGuardar').classList.contains('hidden'), texto: $('gSinGuardar').textContent };
  });
  eq('panel abierto CON cambios · el indicador aparece', sucio.oculto, false);
  eq('…con el texto de aviso', /Sin guardar/.test(sucio.texto), true);

  /* ── 4 · Guardar (_formDirty vuelve a false) lo oculta de nuevo ── */
  const guardado = await p.evaluate(() => {
    _formDirty = false;   // lo que hace guardar() al confirmar éxito
    _tickSinGuardar();
    return $('gSinGuardar').classList.contains('hidden');
  });
  eq('tras "guardar" · el indicador se oculta', guardado, true);

  /* ── 5 · 10 minutos con cambios sin guardar → UN recordatorio, no más ── */
  const nagg = await p.evaluate(() => {
    const toasts = [];
    window.toast = (msg) => toasts.push(msg);
    _formDirty = true; _tickSinGuardar();               // abre la racha (ts = ahora)
    _sinGuardarDesde = Date.now() - 11 * 60 * 1000;      // simula 11 min transcurridos
    _tickSinGuardar();                                    // dispara el aviso
    _tickSinGuardar(); _tickSinGuardar();                 // no debe repetirse
    return { n: toasts.length, msg: toasts[0] || '' };
  });
  eq('a los 10 min aparece EXACTAMENTE un recordatorio', nagg.n, 1);
  eq('…con el texto esperado', /sin guardar/i.test(nagg.msg), true);

  /* ── 6 · Al guardar (racha se cierra) y volver a ensuciar, el aviso puede
     repetirse en la RACHA SIGUIENTE (no queda apagado para siempre) ── */
  const rachaNueva = await p.evaluate(() => {
    const toasts = [];
    window.toast = (msg) => toasts.push(msg);
    _formDirty = false; _tickSinGuardar();                // cierra la racha (guardó)
    _formDirty = true; _tickSinGuardar();                  // abre una NUEVA racha
    _sinGuardarDesde = Date.now() - 11 * 60 * 1000;
    _tickSinGuardar();
    return toasts.length;
  });
  eq('una racha NUEVA puede volver a avisar (no se apaga para siempre)', rachaNueva, 1);

  /* ── 7 · El texto vivo sigue sin botón manual (no se revirtió v5.34) ── */
  const vivo = await p.evaluate(() => ({
    // btnRegenTexto (🔄 "Regenerar", ya existía desde v5.23: descarta un retoque
    // manual y vuelve al texto del motor) NO cuenta — lo que se descartó fue
    // agregar un botón de "Generar texto" que sea REQUISITO para que el texto
    // aparezca la primera vez (eso es lo que _rtxtLive ya hace solo).
    sinBotonGenerar: !document.getElementById('btnGenerarTexto') && !document.getElementById('btnGenTexto'),
    listenerInput: typeof _rtxtLive === 'function',
  }));
  eq('no se agregó un botón manual de "Generar texto"', vivo.sinBotonGenerar, true);
  eq('_rtxtLive (regeneración en vivo) sigue existiendo', vivo.listenerInput, true);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ sin_guardar OK');
  process.exit(fails.length ? 1 : 0);
})();
