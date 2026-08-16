// texto_manual.js — Lo redactado a mano NO se pierde al guardar, y guardar
// NO se detiene a preguntar (regla vigente desde el 15-ago-2026).
//
// HISTORIA EN DOS CAPÍTULOS:
//  · ago-2026, reporte de Diego: «el texto se reinicia al guardar y no queda
//    lo editado a mano». La culpa era el aviso de desfase binario de la
//    v5.34: el único camino que guardaba REGENERABA. Se arregló con un cuadro
//    de TRES salidas cuya primaria conservaba lo escrito.
//  · 15-ago-2026, Diego pide eliminar la fricción: ese cuadro detenía CADA
//    guardado con texto editado para proteger un caso raro. Regla nueva:
//    guardar guarda AL TIRO lo que está en pantalla (lo escrito a mano es
//    exactamente lo que se guarda; la salida del motor viaja aparte en
//    TEXTO_AUTO), y el desfase se avisa con un toast que NO bloquea.
//    Regenerar sigue existiendo y sigue pidiendo confirmación, porque ese SÍ
//    destruye la redacción.
//
// La invariante que las dos épocas comparten y esta guardia fija: LO ESCRITO
// A MANO JAMÁS SE DESCARTA SIN QUE ALGUIEN LO ELIJA EXPLÍCITAMENTE.
//
// De pasada fija la geometría nueva de la botonera (mismo pedido de Diego):
// la barra de guardar vive DESPUÉS del texto y pegada abajo (sticky), para no
// tener que devolverse a buscar el botón mientras se lee o edita el texto.
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
  const preparar = () => p.evaluate(() => {
    window.__guardado = null;
    $('rarea').classList.remove('hidden');
    $('cBed').value = '4'; $('gDate').value = '2026-08-04';
    $('fFirma').innerHTML = '<option value="DMV">DMV</option>'; $('fFirma').value = 'DMV';
    $('fVA').value = 'TOT';
    setKTMstate('s'); $('fKTMraz').value = 'inestabilidad hemodinámica';
    $('rtxt').value = genTexto(); _marcarTextoGenerado($('rtxt').value);
  });

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

  /* ══ 1 · Guardar con desfase: SIN cuadro, guarda lo escrito a mano ═══ */
  console.log('\n1 · Guardar no se detiene: se guarda la redacción del colega');
  await preparar(); await editarYDesfasar();
  eq('la edición manual queda marcada', await p.evaluate(() => _textoManual), true);
  eq('tocar el formulario NO pisa lo escrito a mano', await p.evaluate(() => $('rtxt').value), MANUAL);
  await p.evaluate(() => guardar());
  await p.waitForTimeout(700);
  const cons = await p.evaluate(() => ({
    dialogo: !!$('ucOvl') && $('ucOvl').classList.contains('on'),
    guardado: window.__guardado ? String(window.__guardado.TEXTO_GENERADO || '') : '(no se guardó)',
    manual: window.__guardado ? window.__guardado.TEXTO_MANUAL : null,
    auto: window.__guardado ? String(window.__guardado.TEXTO_AUTO || '') : '',
    pantalla: $('rtxt').value,
    toast: $('toast') ? $('toast').textContent : (document.querySelector('.toast') ? document.querySelector('.toast').textContent : ''),
  }));
  eq('★ NO se abre ningún cuadro', cons.dialogo, false);
  eq('★ lo que viaja al servidor es la redacción del colega', cons.guardado, MANUAL);
  eq('queda marcada como texto manual', cons.manual, true);
  eq('la pantalla NO se reinicia con el texto del servidor', cons.pantalla, MANUAL);
  eq('la salida del motor viaja aparte (trazabilidad)', /KTM/i.test(cons.auto), true);
  eq('★ y el desfase se AVISA sin bloquear (toast)', /tu texto tal como está/i.test(cons.toast), true);

  /* ══ 2 · Regenerar sigue pidiendo permiso (ese SÍ destruye) ══════════ */
  console.log('\n2 · Regenerar: solo con confirmación explícita');
  await preparar(); await editarYDesfasar();
  await p.evaluate(() => regenerarTexto());
  await p.waitForTimeout(250);
  const dlg = await p.evaluate(() => ({
    abierto: !!$('ucOvl') && $('ucOvl').classList.contains('on'),
    avisa: $('ucOvl') ? /descartan tus retoques/i.test($('ucOvl').textContent) : false,
  }));
  eq('regenerar abre confirmación', dlg.abierto, true);
  eq('…y avisa que descarta los retoques', dlg.avisa, true);
  await p.evaluate(() => $('ucCancel').click());
  await p.waitForTimeout(300);
  eq('cancelar conserva la redacción', await p.evaluate(() => $('rtxt').value), MANUAL);
  await p.evaluate(() => regenerarTexto());
  await p.waitForTimeout(250);
  await p.evaluate(() => $('ucOk').click());
  await p.waitForTimeout(300);
  const regen = await p.evaluate(() => ({ pantalla: $('rtxt').value, manual: _textoManual }));
  eq('aceptar regenera desde el motor (menciona la KTM)', /KTM/i.test(regen.pantalla), true);
  eq('…y deja de estar marcado como manual', regen.manual, false);

  /* ══ 3 · Sin edición manual el guardado no cambia ════════════════════ */
  console.log('\n3 · Sin retoques a mano, el flujo de siempre');
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

  /* ══ 4 · La botonera vive DESPUÉS del texto y pegada abajo ═══════════ */
  console.log('\n4 · El botón de guardar, abajo del texto y siempre a la vista');
  const barra = await p.evaluate(() => {
    const act = document.querySelector('.act-bar'), ra = $('rarea');
    const pos = ra.compareDocumentPosition(act);
    const st = getComputedStyle(act);
    const r = act.getBoundingClientRect();
    return {
      despuesDelTexto: !!(pos & Node.DOCUMENT_POSITION_FOLLOWING),
      sticky: st.position === 'sticky',
      aLaVista: r.top < window.innerHeight && r.bottom > 0,
      grande: document.getElementById('btnGuardar').getBoundingClientRect().height >= 50,
    };
  });
  eq('★ la barra está DESPUÉS del texto en el flujo', barra.despuesDelTexto, true);
  eq('★ y es pegajosa (sticky)', barra.sticky, true);
  eq('…o sea queda a la vista', barra.aLaVista, true);
  eq('★ el botón de guardar es grande (≥50px)', barra.grande, true);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ texto_manual OK — guarda al tiro y no pierde nada');
  process.exit(fails.length ? 1 : 0);
})();
