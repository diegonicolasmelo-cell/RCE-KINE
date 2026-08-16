// smartevo_rescates.js — Los tres rescates del SmartEvo (v5.61, 15-ago-2026).
//
// 🔴 DE DÓNDE SALE: Diego trajo el SmartEvoGen v10 (el generador de texto que
// usaba el equipo antes de la plataforma) y pidió comparar y «hacer algo mejor
// uniendo criterios». De la comparación se rescataron tres cosas y se
// descartó el resto (su «coherencia clínica» cambia datos sola, mezcla vía
// aérea con soporte, y todos sus días van digitados a mano). Lo rescatado:
//
//   1. El TERCER ESTADO de secreciones — «tose, moviliza y deglute» — con la
//      redacción textual de Diego y SOLO con vía aérea artificial. (La
//      paridad de sus 4 consumidores la vigila secreciones.js sección 5;
//      aquí se prueba el COMPORTAMIENTO en el navegador.)
//   2. FiO₂ escrita como fracción se convierte sola a porcentaje (0.4 → 40)
//      al salir del campo, en vez de rebotar recién al guardar.
//   3. La rueda del mouse sobre un campo numérico enfocado lo desenfoca en
//      vez de cambiarle el valor (un scroll distraído movía un PEEP).
//
// Uso: node build/checks/smartevo_rescates.js
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'));
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(v2, 'index.html'));
  await p.waitForTimeout(500);

  const R = await p.evaluate(async () => {
    const r = {};
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    const disparar = (el, tipo) => el.dispatchEvent(new Event(tipo, { bubbles: true }));

    // ── 1 · El tercer estado, con su candado de vía aérea ──
    // Regla corregida por Diego el mismo 15-ago: con TOT/TQT las secreciones
    // SE ASPIRAN y se ven — el manejo autónomo es del paciente SIN vía
    // aérea artificial (extubado/decanulado).
    $('fVA').value = 'TQT'; cascadeVA();
    r.ocultoTQT = $('sqBtn4').classList.contains('hidden');
    $('fVA').value = 'Natural'; cascadeVA();
    r.visibleNatural = !$('sqBtn4').classList.contains('hidden');
    // Con características cargadas, marcar «tose y deglute» las apaga y limpia
    $('fSecrCar').value = 'Mucosas'; hSecrCond();
    hSecrQty('auto');
    r.qtyAuto = v('fSecrQty');
    r.carApagada = $('fSecrCar').disabled && $('fSecrCar').value === '';
    r.reolApagada = $('fSecrReol').disabled;
    // Si aparece una vía aérea artificial, el estado se desmarca solo
    $('fVA').value = 'TOT'; cascadeVA();
    r.autoDesmarcado = v('fSecrQty') === '' && $('sqBtn4').classList.contains('hidden');
    r.carVuelve = !$('fSecrCar').disabled;

    // ── 2 · FiO₂: fracción → porcentaje al salir del campo ──
    const gsa = $('fGsaFio2');
    gsa.value = '0.5'; disparar(gsa, 'change');
    r.fio2Convertida = gsa.value;
    gsa.value = '55'; disparar(gsa, 'change');     // un porcentaje normal no se toca
    r.fio2Intacta = gsa.value;
    gsa.value = '1'; disparar(gsa, 'change');      // FiO₂ 1 = 100%
    r.fio2Uno = gsa.value;
    // La coma («0,21») no se puede probar en fGsaFio2: es type=number y el
    // navegador rechaza la asignación. Se prueba en un campo de texto con
    // «fio2» en el id — el conversor es delegado y agarra cualquiera.
    const tf = document.createElement('input');
    tf.type = 'text'; tf.id = 'arnesFio2'; document.body.appendChild(tf);
    tf.value = '0,21'; disparar(tf, 'change');
    r.fio2Coma = tf.value;
    tf.remove();

    // ── 3 · La rueda no cambia números: desenfoca ──
    // Campo numérico propio del arnés: fPIM y compañía viven dentro de
    // <details> cerrados y no reciben foco.
    const tn = document.createElement('input');
    tn.type = 'number'; tn.id = 'arnesNum'; document.body.appendChild(tn);
    tn.focus();
    r.enfocado = document.activeElement === tn;
    document.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    r.desenfocado = document.activeElement !== tn;
    tn.remove();
    return r;
  });

  console.log('── 1 · «Tose, moviliza y deglute» solo SIN vía aérea artificial ──');
  eq('con TQT el botón no existe (ahí se aspira y se ve)', R.ocultoTQT, true);
  eq('con vía Natural aparece', R.visibleNatural, true);
  eq("marcarlo guarda 'auto'", R.qtyAuto, 'auto');
  eq('★ y apaga características (limpias)', R.carApagada, true);
  eq('★ …y reología', R.reolApagada, true);
  eq('★ si aparece un TOT se desmarca y se esconde solo', R.autoDesmarcado, true);
  eq('…y las características se reactivan', R.carVuelve, true);

  console.log('── 2 · FiO₂ como fracción se convierte sola ──');
  eq('★ 0.5 → 50', R.fio2Convertida, '50');
  eq('0,21 (con coma) → 21', R.fio2Coma, '21');
  eq('55 se queda en 55', R.fio2Intacta, '55');
  eq('1 → 100', R.fio2Uno, '100');

  console.log('── 3 · La rueda del mouse no mueve valores ──');
  eq('el campo numérico estaba enfocado', R.enfocado, true);
  eq('★ la rueda lo desenfoca en vez de cambiarlo', R.desenfocado, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK — lo bueno del SmartEvo, sin sus vicios');
  process.exit(fails.length ? 1 : 0);
})();
