/**
 * ktm_otro_pantalla.js — LO QUE VE EL COLEGA EN EL TURNO cuando la KTM no se
 * hace: el catálogo ya no ofrece cajones de sastre, «Otro» pide su fundamento a
 * la vista, y un motivo viejo fuera de catálogo NO desaparece de la pantalla.
 *
 * 🔴 POR QUÉ NO BASTA CON LA GUARDIA DEL SERVIDOR. `validarKTM` rechaza el
 * guardado, pero si la pantalla no dice QUÉ falta ni DÓNDE, el turno se topa con
 * un error al final y no sabe qué arreglar. Lo que se fija acá es lo que se ve.
 *
 * 🪤 Y LA LECCIÓN DEL LOGIN ILEGIBLE (20-ago-2026): una guardia que monta el
 * escenario con `innerHTML` o que mira solo el DOM se mide a sí misma. Acá se
 * usan las RUTAS REALES —`setKTMstate('n')`, el select con su evento `change`,
 * el input con su `input`— y el aviso se comprueba con `getComputedStyle`, que
 * es lo único que dice si el rojo llegó al píxel.
 *
 * ⚖️ EL LADO SIMÉTRICO: que «Otro» bloquee no puede convertir las otras siete
 * razones en obligatorias. Cada una se prueba explícitamente por su nombre.
 *
 * Uso: node build/checks/ktm_otro_pantalla.js (requiere playwright-core)
 */
const { chromium } = require('playwright-core');
const path = require('path');
const v2 = path.resolve(__dirname, '..', '..', 'v2');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2, 'index.html'));
  await p.waitForTimeout(600);

  const fails = [];
  const eq = (l, got, want) => {
    const okk = JSON.stringify(got) === JSON.stringify(want);
    console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(got) + (okk ? '' : ' (esperado ' + JSON.stringify(want) + ')'));
    if (!okk) fails.push(l);
  };
  const si = (l, c) => eq(l, !!c, true);

  /* ══ 1 · EL CATÁLOGO ES SOLO CLÍNICO ═══════════════════════════════════ */
  console.log('\n1 · El catálogo de contraindicación no tiene cajones de sastre');
  const cat = await p.evaluate(() => {
    poblarKTMcontra();
    const sel = document.getElementById('fKTMcontra');
    return {
      valores: [...sel.options].map(o => o.value).filter(Boolean),
      grupos: [...sel.querySelectorAll('optgroup')].map(g => g.label),
    };
  });
  eq('«KTMC manual» ya no se ofrece', cat.valores.includes('KTMC manual'), false);
  eq('«Decisión médica» ya no se ofrece como contraindicación', cat.valores.includes('Decisión médica'), false);
  eq('no queda ninguna categoría «Otra»', cat.grupos.filter(g => / Otra$/.test(g)), []);
  si('y el catálogo clínico sigue completo (≥ 18 ítems)', cat.valores.length >= 18);
  si('siguen los ítems del protocolo', cat.valores.includes('PAM <60 mmHg') && cat.valores.includes('PEEP >14 cmH₂O'));

  /* ══ 2 · UN MOTIVO VIEJO NO DESAPARECE DE LA PANTALLA ══════════════════ */
  // Sacar un ítem del catálogo no puede borrar de la vista las evoluciones que
  // ya lo guardaron: `select.value = <algo que no existe>` deja el desplegable
  // EN BLANCO, o sea el dato sigue en la planilla y el turno ve un hueco.
  console.log('\n2 · Compatibilidad: los motivos históricos se siguen viendo');
  const hist = await p.evaluate(() => {
    const sel = document.getElementById('fKTMcontra');
    _ktmContraSel('KTMC manual');
    const sel1 = { val: sel.value, texto: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '' };
    _ktmContraSel('AET Grupo IIIC');          // la ruta automática de AET/BNM
    const sel2 = { val: sel.value, texto: sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '' };
    _ktmContraSel('PAM <60 mmHg');            // uno del catálogo vigente
    const sel3 = { val: sel.value };
    _ktmContraSel('');                        // vaciar sigue vaciando
    const sel4 = { val: sel.value };
    return { sel1, sel2, sel3, sel4, hists: sel.querySelectorAll('optgroup[data-hist="1"] option').length };
  });
  eq('el ítem histórico queda SELECCIONADO, no en blanco', hist.sel1.val, 'KTMC manual');
  eq('y se LEE en el desplegable', hist.sel1.texto, 'KTMC manual');
  eq('la razón automática de AET IIIC también', hist.sel2.val, 'AET Grupo IIIC');
  eq('un ítem vigente no crea duplicado histórico', hist.hists, 2);
  eq('el catálogo vigente sigue funcionando', hist.sel3.val, 'PAM <60 mmHg');
  eq('vaciar sigue vaciando', hist.sel4.val, '');

  /* ══ 2b · EL DESPLEGABLE DE RAZÓN, FUSIONADO ═══════════════════════════ */
  console.log('\n2b · «Indicación médica» absorbió a «Decisión médica»');
  const raz = await p.evaluate(() => {
    const sel = document.getElementById('fKTMnoRaz');
    const antes = [...sel.options].map(o => o.value).filter(Boolean);
    _ktmNoRazonSel('Decisión médica');                 // valor histórico
    const hist = { val: sel.value, texto: sel.options[sel.selectedIndex].textContent };
    _ktmNoRazonSel('Rechazo familiar');                // uno vigente
    const vig = sel.value;
    return { opciones: antes, hist, vig, nHist: sel.querySelectorAll('option[data-hist="1"]').length };
  });
  eq('«Decisión médica» ya no se ofrece', raz.opciones.indexOf('Decisión médica'), -1);
  eq('«Indicación médica» sí', raz.opciones.indexOf('Indicación médica') !== -1, true);
  eq('el catálogo queda en 7 razones', raz.opciones.length, 7);
  eq('un valor histórico se sigue viendo, no en blanco', raz.hist.val, 'Decisión médica');
  eq('y se marca como histórico', raz.hist.texto, 'Decisión médica (histórico)');
  eq('el vigente sigue funcionando', raz.vig, 'Rechazo familiar');

  /* ══ 3 · «OTRO» PIDE SU FUNDAMENTO, POR LA RUTA REAL ═══════════════════ */
  console.log('\n3 · «No realizada · Otro» pide el fundamento a la vista');
  // 🪤 El color se mide DESPUÉS de la transición. `.col input` lleva
  // `transition:border-color .15s`, así que leer `getComputedStyle` en el mismo
  // tick devuelve el valor INTERPOLADO —o sea el de partida— y la guardia
  // reporta "no cambió" sobre un código que sí cambia. Costó una vuelta
  // entera creerle al falso rojo (28-ago-2026).
  const poner = async (razon, fundamento) => {
    await p.evaluate(([r, f]) => {
      setKTMstate('n');
      const sel = document.getElementById('fKTMnoRaz');
      sel.value = r; sel.dispatchEvent(new Event('change'));          // ruta real
      const inp = document.getElementById('fKTMnoCom');
      inp.value = f; inp.dispatchEvent(new Event('input'));            // ruta real
      if (typeof rielRender === 'function') rielRender();
    }, [razon, fundamento]);
    await p.waitForTimeout(260);                                      // > .15s
    return p.evaluate(() => {
      const inp = document.getElementById('fKTMnoCom');
      const lbl = document.getElementById('lblKTMnoCom');
      return {
        falta: !!_ktmOtroSinFundamento(),
        faltaEsElInput: _ktmOtroSinFundamento() === inp,
        etiqueta: lbl.textContent,
        colorEtiqueta: getComputedStyle(lbl).color,
        bordeInput: getComputedStyle(inp).borderTopColor,
        aviso: (document.getElementById('gFalta') || {}).textContent || '',
        visible: document.getElementById('bKTMn').offsetParent !== null,
      };
    });
  };

  const vacio = await poner('Otro', '');
  si('el bloque está a la vista (si no, la prueba no probaría nada)', vacio.visible);
  eq('«Otro» sin fundamento → falta', vacio.falta, true);
  eq('y lo que se enfoca es el campo del fundamento', vacio.faltaEsElInput, true);
  eq('la etiqueta lo dice', vacio.etiqueta, 'Fundamento (obligatorio)');
  si('el aviso del riel lo nombra', /fundamento/i.test(vacio.aviso));

  const lleno = await poner('Otro', 'En hemodiálisis durante todo el turno');
  eq('con el fundamento escrito → ya no falta', lleno.falta, false);
  eq('la etiqueta sigue diciendo que es obligatorio', lleno.etiqueta, 'Fundamento (obligatorio)');
  si('el aviso del riel se apaga', !/fundamento/i.test(lleno.aviso));

  /* ══ 4 · EL ROJO LLEGA AL PÍXEL ════════════════════════════════════════ */
  // No basta con que el texto cambie: si el aviso se pinta del mismo color que
  // lo normal, para el ojo del turno no cambió nada. (Lección del login.)
  console.log('\n4 · El aviso se VE (color computado, no clase CSS)');
  si('la etiqueta se pinta distinto cuando falta', vacio.colorEtiqueta !== lleno.colorEtiqueta);
  si('el borde del campo también', vacio.bordeInput !== lleno.bordeInput);
  const rojo = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(vacio.colorEtiqueta);
  si('y el color de alerta es realmente rojo (R claramente > G y > B)',
    rojo && +rojo[1] > +rojo[2] + 40 && +rojo[1] > +rojo[3] + 40);

  /* ══ 5 · EL LADO SIMÉTRICO: las otras razones no se vuelven obligatorias ═ */
  console.log('\n5 · Solo «Otro» obliga: las otras seis no piden fundamento');
  // 🔴 «Indicación médica» se probó obligatoria y se revirtió (Manuel, 28-ago-2026):
  // es legítima y frecuente, y el campo obligatorio le cobra un trámite al turno
  // en un caso que se entiende. Aquí se fija que NO obliga y que su etiqueta lo
  // dice — si alguien la vuelve a meter en la lista, esto se pone rojo.
  const indMed = await poner('Indicación médica', '');
  eq('«Indicación médica» sin fundamento NO bloquea', indMed.falta, false);
  eq('y su etiqueta dice que es opcional', indMed.etiqueta, 'Comentario (opcional)');
  for (const r of ['Motivo ingreso', 'Rechazo del paciente',
                   'Rechazo familiar', 'Procedimiento concurrente (pabellón / imagenología)',
                   'Sin equipo o tiempo disponible']) {
    const st = await poner(r, '');
    eq('«' + r + '» sin comentario no bloquea', st.falta, false);
    eq('  y su etiqueta vuelve a ser opcional', st.etiqueta, 'Comentario (opcional)');
  }

  /* ══ 6 · SIN ESTADO NO SE EXIGE NADA ═══════════════════════════════════ */
  console.log('\n6 · Con la KTM realizada o sin declarar, no se exige fundamento');
  const otroEstado = await p.evaluate(() => {
    setKTMstate('n');
    const sel = document.getElementById('fKTMnoRaz');
    sel.value = 'Otro'; sel.dispatchEvent(new Event('change'));
    document.getElementById('fKTMnoCom').value = '';
    setKTMstate('r');                       // se pasa a «realizada»
    const conR = !!_ktmOtroSinFundamento();
    setKTMstate(null);                      // sin estado declarado
    const sinEstado = !!_ktmOtroSinFundamento();
    return { conR, sinEstado };
  });
  eq('KTM realizada → no exige', otroEstado.conR, false);
  eq('sin estado declarado → no exige', otroEstado.sinEstado, false);

  /* ══ 7 · LOS DOS MOTORES DICEN LO MISMO ════════════════════════════════ */
  // Las MISMAS frases están fijadas en `ktm_otro_fundamento.js` contra el motor
  // del servidor. Si alguien cambia uno solo, una de las dos guardias cae — que
  // es exactamente lo que faltó en agosto, cuando cliente y servidor redactaban
  // la contraindicación distinto y nadie lo veía.
  console.log('\n7 · El texto del cliente con «Otro» (paridad con el servidor)');
  const texto = (razon, fund) => p.evaluate(([r, f]) => {
    setKTMstate('n');
    const sel = document.getElementById('fKTMnoRaz');
    sel.value = r; sel.dispatchEvent(new Event('change'));
    const inp = document.getElementById('fKTMnoCom');
    inp.value = f; inp.dispatchEvent(new Event('input'));
    const t = String(genTexto() || '');
    return (t.split('\n').find(l => /KTM no realizada/.test(l)) || '(no hay línea)').trim();
  }, [razon, fund]);

  eq('«Otro» narra el fundamento y se salta la etiqueta',
    await texto('Otro', 'En hemodiálisis todo el turno'),
    'KTM no realizada: En hemodiálisis todo el turno.');
  eq('un fundamento que ya trae punto no lo duplica',
    await texto('Otro', 'Estaba en pabellón.'),
    'KTM no realizada: Estaba en pabellón.');
  eq('«Motivo ingreso» se sigue narrando natural',
    await texto('Motivo ingreso', ''),
    'KTM no realizada por ingreso reciente.');
  eq('y con comentario, el comentario va como oración aparte',
    await texto('Rechazo familiar', 'La hija pidió esperar'),
    'KTM no realizada por rechazo familiar. La hija pidió esperar.');

  /* ══ CIERRE ════════════════════════════════════════════════════════════ */
  eq('sin errores de JavaScript en la página', errs, []);
  console.log('\n' + (fails.length ? '❌ FALLA (' + fails.length + '): ' + fails.join(' · ')
                                   : '✅ ktm_otro_pantalla: todo verde'));
  await b.close();
  process.exit(fails.length ? 1 : 0);
})();
