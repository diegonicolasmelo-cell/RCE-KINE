// texto_congelado.js — El texto de la evolución NO se reescribe solo.
//
// 🔴 DE DÓNDE SALE (Diego, 30-ago-2026, desde el uso): «necesito que el texto
// guardado se guarde tal cual, sin comparaciones ni nada por el estilo: lo que
// se modifica se edita. En ocasiones pasa que se vuelve a hacer click y se
// reinicia el texto».
//
// LA CAUSA, encontrada leyendo el código: el texto se regeneraba EN VIVO con
// cada cambio del formulario, y para saber si podía hacerlo comparaba LETRA POR
// LETRA lo que había en pantalla contra lo último que había producido el motor.
// Dos fugas reales:
//   1. Un turno YA GUARDADO sin marca de edición manual volvía como «texto del
//      generador»: el primer clic en cualquier casilla lo reescribía entero, y
//      ahí desaparecía lo que el colega había dejado escrito.
//   2. Si la edición volvía a coincidir con lo generado —una coma puesta y
//      sacada— el sistema concluía que no habías editado nada y retomaba el
//      control del texto.
//
// LA REGLA NUEVA, sin comparaciones: en cuanto alguien TOCA el texto, o el
// turno YA ESTÁ GUARDADO, el texto queda CONGELADO y nada vuelve a
// reescribirlo solo. Volver al automático es un acto explícito (🔄 Regenerar,
// con confirmación). Y la barra de acciones queda con UN botón: Guardar.
//
// Uso: node build/checks/texto_congelado.js [ruta.html]
const path = require('path');
const { chromium } = require('playwright-core');
const archivo = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'v2', 'index.html'));
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

const MANUAL = 'TEXTO ESCRITO A MANO POR EL COLEGA EN EL TURNO.';
const GUARDADO = 'TEXTO QUE QUEDO GUARDADO AYER EN LA EVOLUCION.';

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 950 } });
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

  // Deja el panel en condiciones de guardar, con el texto del motor en pantalla.
  const preparar = () => p.evaluate(() => {
    window.__guardado = null;
    $('rarea').classList.remove('hidden');
    $('cBed').value = '4'; $('gDate').value = '2026-08-30';
    $('fFirma').innerHTML = '<option value="DMV">DMV</option>'; $('fFirma').value = 'DMV';
    $('fVA').value = 'TOT';
    setKTMstate('s'); $('fKTMraz').value = 'inestabilidad hemodinámica';
    _marcarTextoGenerado('');            // panel limpio: texto en vivo
    $('rtxt').value = genTexto(); _marcarTextoGenerado($('rtxt').value);
  });
  // Toca una casilla del formulario y espera el debounce del texto en vivo.
  const tocarFormulario = async () => {
    await p.evaluate(() => $('bKTMr').click());
    await p.waitForTimeout(450);
  };

  // 🪤 La barra se mide AHORA, con el panel limpio: más abajo el bloque 4
  // guarda y el botón pasa a decir «✅ Guardado». El estado que deja una
  // sección anterior es parte del escenario, no ruido — medirlo al final daba
  // un falso rojo sobre una barra correcta.
  const barra = await p.evaluate(() => {
    const act = document.querySelector('.act-bar');
    const btns = [...act.querySelectorAll('button')].filter(x => x.offsetParent !== null);
    return { textos: btns.map(x => x.textContent.trim()), n: btns.length };
  });

  /* ══ 1 · LO QUE SE ESCRIBE ES TUYO, y basta con tocarlo UNA vez ═══════ */
  console.log('\n1 · Escribir el texto lo congela: ninguna casilla lo pisa');
  await preparar();
  const antes = await p.evaluate(() => $('rtxt').value);
  si('el texto se arma solo mientras nadie lo toca', antes.length > 0);
  await tocarFormulario();
  si('…y sigue vivo: tocar una casilla lo actualiza', await p.evaluate(() => $('rtxt').value) !== antes);
  await p.evaluate((M) => { const t = $('rtxt'); t.value = M; t.dispatchEvent(new Event('input', { bubbles: true })); }, MANUAL);
  si('★ al escribir queda marcado como manual', await p.evaluate(() => _textoManual));
  await tocarFormulario();
  eq('★ y tocar el formulario YA NO lo reescribe', await p.evaluate(() => $('rtxt').value), MANUAL);

  /* ══ 2 · SIN COMPARACIÓN LETRA POR LETRA ═════════════════════════════ */
  // La fuga vieja: si la edición volvía a coincidir con lo generado, el sistema
  // «se desmarcaba» y retomaba el control. Ahora tocar es irreversible.
  console.log('\n2 · Volver a escribir lo mismo no le devuelve el control a la app');
  await preparar();
  const gen = await p.evaluate(() => $('rtxt').value);
  await p.evaluate((G) => {
    const t = $('rtxt');
    t.value = G + ' x'; t.dispatchEvent(new Event('input', { bubbles: true }));
    t.value = G;        t.dispatchEvent(new Event('input', { bubbles: true }));   // vuelve a coincidir
  }, gen);
  si('★ sigue marcado como manual aunque el texto coincida', await p.evaluate(() => _textoManual));
  await tocarFormulario();
  eq('★ …y no se regenera', await p.evaluate(() => $('rtxt').value), gen);

  /* ══ 3 · UN TURNO GUARDADO NO SE REESCRIBE (el caso de Diego) ════════ */
  console.log('\n3 · Reabrir un turno guardado: su texto es intocable');
  await preparar();
  // Turno guardado SIN marca manual: es el caso exacto que se perdía.
  await p.evaluate((G) => _mostrarEditorTexto({ TEXTO_GENERADO: G, TEXTO_AUTO: G, TEXTO_MANUAL: false }), GUARDADO);
  eq('el texto guardado se muestra tal cual', await p.evaluate(() => $('rtxt').value), GUARDADO);
  si('★ …y queda congelado aunque no sea «manual»', await p.evaluate(() => (typeof _textoCongelado !== 'undefined' ? _textoCongelado : '(no existe la marca de congelado)')));
  await tocarFormulario();
  eq('★ tocar una casilla NO lo reinicia (el bug reportado)', await p.evaluate(() => $('rtxt').value), GUARDADO);
  si('…y no se marca como editado a mano (sería mentir)', await p.evaluate(() => !_textoManual));

  /* ══ 4 · DESPUÉS DE GUARDAR TAMPOCO ══════════════════════════════════ */
  console.log('\n4 · Guardar deja el texto quieto');
  await preparar();
  await p.evaluate(() => guardar());
  await p.waitForTimeout(700);
  const guardadoTxt = await p.evaluate(() => $('rtxt').value);
  si('el guardado salió', await p.evaluate(() => !!window.__guardado));
  si('★ el texto queda congelado tras guardar', await p.evaluate(() => (typeof _textoCongelado !== 'undefined' ? _textoCongelado : '(no existe la marca de congelado)')));
  await tocarFormulario();
  eq('★ y seguir llenando el formulario no lo reescribe', await p.evaluate(() => $('rtxt').value), guardadoTxt);

  /* ══ 5 · UN PANEL NUEVO VUELVE A ESTAR EN VIVO ═══════════════════════ */
  // Congelar de más sería el error simétrico: el turno siguiente tiene que
  // volver a armarse solo, o habría que escribir todo a mano.
  console.log('\n5 · El paciente siguiente parte con el texto en vivo');
  await preparar();
  si('un panel recién preparado NO está congelado', await p.evaluate(() => (typeof _textoCongelado !== 'undefined' ? (!_textoCongelado && !_textoManual) : '(no existe la marca de congelado)')));
  await tocarFormulario();
  si('★ y su texto sí se actualiza solo', await p.evaluate(() => $('rtxt').value).then(v => v.length > 0));

  /* ══ 6 · LA BARRA TIENE UN SOLO BOTÓN ════════════════════════════════ */
  console.log('\n6 · Solamente el botón de guardar');
  si('★ el 👁️ Preview salió de la barra', !barra.textos.some(t => /Preview/i.test(t)));
  si('…y el que queda es Guardar', barra.textos.some(t => /Guardar/i.test(t)));
  eq('un solo botón visible antes de guardar', barra.n, 1);

  /* ══ 7 · «Deterioro», no «Alteración» ════════════════════════════════ */
  console.log('\n7 · La contraindicación dice «Deterioro del nivel de consciencia»');
  const cat = await p.evaluate(() => {
    poblarKTMcontra();
    const ops = [...$('fKTMcontra').options].map(o => o.value);
    return { deterioro: ops.includes('Deterioro del nivel de consciencia'),
             alteracion: ops.includes('Alteración del nivel de consciencia') };
  });
  si('★ está «Deterioro del nivel de consciencia»', cat.deterioro);
  si('…y ya no está la redacción vieja', !cat.alteracion);
  // Y una evolución vieja con la palabra antigua NO puede quedar en blanco.
  const hist = await p.evaluate(() => {
    poblar('fKTMcontra', [], 'Alteración del nivel de consciencia');
    return $('fKTMcontra').value;
  });
  si('★ una evolución vieja conserva su valor (no se borra)', /Alteración del nivel/.test(hist));

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK — el texto es de quien lo escribe');
  process.exit(fails.length ? 1 : 0);
})();
