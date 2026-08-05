// texto_manual.js — Lo redactado a mano NO se pierde al guardar (ago-2026).
//
// REPORTE DE DIEGO: «el texto se reinicia al momento de guardar y no queda el
// texto editado a mano». REPRODUCIDO: la culpa era del aviso de desfase que
// se agregó en v5.34. Ese aviso compara bloque a bloque el texto retocado
// contra lo que registró el formulario y — bien — deja decidir al colega.
// Pero uiConfirm es binario, así que las salidas reales eran:
//    · «🔄 Actualizar el texto y guardar»  → REGENERA (borra lo escrito)
//    · Cancelar                            → no guarda nada
// Es decir: el ÚNICO camino que guardaba destruía la redacción, y encima el
// botón se leía como «guardar». El colega perdía su evolución por apretar lo
// que parecía correcto.
//
// AHORA son TRES salidas y la que conserva es la primaria. Regla: lo escrito
// a mano jamás se descarta sin que alguien lo elija explícitamente.
//
// Uso: node build/checks/texto_manual.js [ruta.html]
const path = require('path');
const { chromium } = require('playwright-core');
const archivo = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'v2', 'index.html'));

const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

const MANUAL = 'EVOLUCION REDACTADA A MANO POR EL COLEGA - no debe perderse.';

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.__guardado = null;
    window.google = { script: { run: { withSuccessHandler(k) { return { withFailureHandler() { return {
      api(a, d) {
        if (a === 'GUARDAR_EVOLUCION') window.__guardado = d;
        setTimeout(() => k({ ok: true, data:
          a === 'WHOAMI' ? { email: 'x@y.cl', firma: 'DMV', dev: true } :
          a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {}, CAT_DEF: {} } :
          a === 'GET_TODAS_CAMAS' ? [] :
          a === 'GUARDAR_EVOLUCION' ? { TEXTO_GENERADO: 'TEXTO QUE DEVUELVE EL SERVIDOR' } : null }), 5);
      }
    }; } }; } } } };
  });
  await p.goto('file://' + archivo);
  await p.waitForTimeout(2200);

  // Deja el panel listo para guardar y con el texto del motor en pantalla.
  const preparar = () => p.evaluate((MAN) => {
    window.__guardado = null;
    $('rarea').classList.remove('hidden');
    $('cBed').value = '4'; $('gDate').value = '2026-08-04';
    $('fFirma').innerHTML = '<option value="DMV">DMV</option>'; $('fFirma').value = 'DMV';
    $('fVA').value = 'TOT';
    setKTMstate('s'); $('fKTMraz').value = 'inestabilidad hemodinámica';
    $('rtxt').value = genTexto(); _marcarTextoGenerado($('rtxt').value);
    _txtDesfaseVisto = false;
  }, MANUAL);

  // El colega redacta a mano y DESPUÉS cambia el formulario (desfase).
  const editarYDesfasar = async () => {
    await p.evaluate((MAN) => {
      const t = $('rtxt');
      t.value = MAN;
      t.dispatchEvent(new Event('input', { bubbles: true }));
    }, MANUAL);
    await p.evaluate(() => $('bKTMr').click());
    await p.waitForTimeout(450);   // debounce de _rtxtLive
  };

  /* ══ 1 · El aviso aparece y ofrece TRES salidas ══════════════════════ */
  console.log('\n1 · El aviso de desfase ofrece conservar, regenerar o volver');
  await preparar(); await editarYDesfasar();
  eq('la edición manual queda marcada', await p.evaluate(() => _textoManual), true);
  eq('tocar el formulario NO pisa lo escrito a mano', await p.evaluate(() => $('rtxt').value), MANUAL);
  await p.evaluate(() => guardar());
  await p.waitForTimeout(250);
  // Null-safe a propósito: contra el código anterior #ucAlt NO existe, y la
  // guardia tiene que decirlo con un ❌ legible en vez de reventar.
  const dlg = await p.evaluate(() => ({
    abierto: !!$('ucOvl') && $('ucOvl').classList.contains('on'),
    ok: $('ucOk') ? $('ucOk').textContent : '(no existe)',
    alt: $('ucAlt') ? $('ucAlt').textContent : '(no existe la tercera salida)',
    altVisible: !!$('ucAlt') && $('ucAlt').style.display !== 'none',
    cancel: $('ucCancel') ? $('ucCancel').textContent : '(no existe)',
  }));
  eq('se abre el aviso', dlg.abierto, true);
  eq('la salida PRIMARIA conserva lo redactado', /mi texto tal como está/i.test(dlg.ok), true);
  eq('hay una tercera salida visible', dlg.altVisible, true);
  eq('…que es la de regenerar', /texto actualizado/i.test(dlg.alt), true);
  eq('y sigue existiendo volver atrás', /cancelar/i.test(dlg.cancel), true);

  /* ══ 2 · La salida primaria GUARDA lo escrito a mano ═════════════════ */
  console.log('\n2 · Conservar: se guarda la redacción, no la del motor');
  await p.evaluate(() => $('ucOk').click());
  await p.waitForTimeout(700);
  const cons = await p.evaluate(() => ({
    guardado: window.__guardado ? String(window.__guardado.TEXTO_GENERADO || '') : '(no se guardó)',
    manual: window.__guardado ? window.__guardado.TEXTO_MANUAL : null,
    pantalla: $('rtxt').value,
  }));
  eq('lo que viaja al servidor es la redacción del colega', cons.guardado, MANUAL);
  eq('queda marcada como texto manual', cons.manual, true);
  eq('la pantalla NO se reinicia con el texto del servidor', cons.pantalla, MANUAL);

  /* ══ 3 · La salida alterna SÍ regenera (pero hay que elegirla) ═══════ */
  console.log('\n3 · Regenerar: solo si el colega lo elige explícitamente');
  await preparar(); await editarYDesfasar();
  await p.evaluate(() => guardar());
  await p.waitForTimeout(250);
  await p.evaluate(() => { if ($('ucAlt')) $('ucAlt').click(); else $('ucOk').click(); });
  await p.waitForTimeout(700);
  const regen = await p.evaluate(() => ({
    guardado: window.__guardado ? String(window.__guardado.TEXTO_GENERADO || '') : '(no se guardó)',
    manual: window.__guardado ? window.__guardado.TEXTO_MANUAL : null,
  }));
  eq('al elegir regenerar, la redacción se reemplaza', regen.guardado !== MANUAL, true);
  eq('…y el texto sale del motor (menciona la KTM realizada)', /KTM/i.test(regen.guardado), true);
  eq('…y deja de estar marcado como manual', regen.manual, false);

  /* ══ 4 · Cancelar no guarda NADA y conserva lo escrito ═══════════════ */
  console.log('\n4 · Cancelar: vuelve a editar, sin guardar ni perder');
  await preparar(); await editarYDesfasar();
  await p.evaluate(() => guardar());
  await p.waitForTimeout(250);
  await p.evaluate(() => $('ucCancel').click());
  await p.waitForTimeout(500);
  const canc = await p.evaluate(() => ({
    guardado: window.__guardado, pantalla: $('rtxt').value, manual: _textoManual,
  }));
  eq('no se guardó nada', canc.guardado, null);
  eq('la redacción sigue en pantalla', canc.pantalla, MANUAL);
  eq('y sigue marcada como manual', canc.manual, true);

  /* ══ 5 · Sin edición manual el guardado no cambia ════════════════════ */
  console.log('\n5 · Sin retoques a mano, el flujo de siempre');
  await preparar();
  await p.evaluate(() => { $('bKTMr').click(); });
  await p.waitForTimeout(450);
  await p.evaluate(() => guardar());
  await p.waitForTimeout(700);
  const auto = await p.evaluate(() => ({
    hubodialogo: $('ucOvl').classList.contains('on'),
    manual: window.__guardado ? window.__guardado.TEXTO_MANUAL : null,
    guardado: !!window.__guardado,
  }));
  eq('no aparece ningún aviso', auto.hubodialogo, false);
  eq('guarda directo', auto.guardado, true);
  eq('y no queda marcado como manual', auto.manual, false);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ texto_manual OK');
  process.exit(fails.length ? 1 : 0);
})();
