// hepa_fijo_y_orden_texto.js — DOS PEDIDOS DE MANUEL DEL 22-ago-2026.
//
// 1 · EL CAMPO DEL HEPA SE APAGA CUANDO EL EQUIPO LO LLEVA FIJO.
//    La regla ya existía (v5.60, Diego: «PB1, PB980, AVEA no ocupan HEPA
//    intercambiable cada 3 días»): con un equipo de CONFIG HEPA_FIJO_EQUIPOS
//    el chip dice «Fija — no se cambia» y la entrega lo excluye. Pero el
//    INPUT seguía editable, así que el turno podía fecharlo igual y en pantalla
//    parecía que llevaba ciclo. Manuel pidió el paralelo de la humidificación
//    activa, que apaga el HME. Ahora el campo se deshabilita.
//    🔴 SE APAGA PERO NO SE BORRA. Esa fecha es la referencia de instalación
//    del filtro del equipo: vaciarla perdería un dato real y el chip dejaría de
//    distinguir «Fija — no se cambia» de «Fija (del equipo)». Un input
//    deshabilitado conserva su value, así que el guardado no cambia. Esta
//    guardia lo fija para que nadie lo «simplifique» a value=''.
//
// 2 · LAS OBSERVACIONES VAN ANTES DEL PLAN en el texto de la evolución.
//    El plan es lo que queda pendiente para el turno siguiente: cierra el
//    texto. Se cambió en el cliente y en su espejo del servidor, y las dos
//    tienen que decir lo mismo — si divergen, la evolución que ve el kine y la
//    que reconstruye el servidor quedan en distinto orden.
//    Ojo con `_B()`: la etiqueta de bloque viaja con su línea, o TEXTO_BLOQUES
//    deja de estar alineado 1:1 con TEXTO_AUTO.
//
// Uso: node build/checks/hepa_fijo_y_orden_texto.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const fs = require('fs');
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
  await p.waitForTimeout(500);
  // Puente tolerante: contra el código viejo el `disabled` no se toca nunca.
  await p.evaluate(() => {
    window.__val = id => { const e = document.getElementById(id); return e ? e.value : '(sin campo)'; };
    window.__dis = id => { const e = document.getElementById(id); return e ? !!e.disabled : '(sin campo)'; };
  });

  const fails = [];
  const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
  const si = (l, c) => eq(l, !!c, true);

  /* ══ 1 · EL EQUIPO DECIDE SI EL CAMPO SE PIDE ═════════════════════════ */
  console.log('1 · Con un equipo de filtro fijo, la fecha del HEPA se apaga');
  const H = await p.evaluate(() => {
    // La cama del panel manda: se monta con cada ventilador y se recalcula.
    const conEquipo = nom => {
      DB = [{ ID_CAMA: '5', OCUPADA: true, VM_TAG: nom, DISP_HEPA_FECHA: '2026-08-19' }];
      $('cBed').value = '5';
      $('fFecHEPA').value = '2026-08-19';
      calcInsumosDias();
      return { dis: __dis('fFecHEPA'), val: __val('fFecHEPA'),
               chip: (document.getElementById('sHEPADias') || {}).textContent || '' };
    };
    return { pb: conEquipo('PB 980 1'), pb2: conEquipo('PB 1'), avea: conEquipo('Avea 2'),
             vela: conEquipo('Vela 9'), mek: conEquipo('Mek 12'), sinEquipo: conEquipo('') };
  });
  si('PB 980 → el campo queda deshabilitado', H.pb.dis === true);
  si('PB 1 también (la regla es por prefijo, no por modelo)', H.pb2.dis === true);
  si('Avea también', H.avea.dis === true);
  eq('…y NO se borra la fecha: es la referencia de instalación', H.pb.val, '2026-08-19');
  si('el chip lo explica', /Fija/.test(H.pb.chip));

  console.log('\n2 · Los equipos que SÍ llevan ciclo no se tocan (no regresión)');
  si('Vela sigue editable', H.vela.dis === false);
  si('Mekics sigue editable', H.mek.dis === false);
  si('…y su chip sigue anunciando el ciclo', /Cambio|Cambiar|VENCIDO/.test(H.vela.chip));
  si('sin ventilador asignado, el campo tampoco se apaga', H.sinEquipo.dis === false);

  console.log('\n3 · Cambiar de equipo vuelve a habilitarlo');
  const R = await p.evaluate(() => {
    DB = [{ ID_CAMA: '5', OCUPADA: true, VM_TAG: 'PB 2', DISP_HEPA_FECHA: '2026-08-19' }];
    $('cBed').value = '5'; calcInsumosDias();
    const conPB = __dis('fFecHEPA');
    DB = [{ ID_CAMA: '5', OCUPADA: true, VM_TAG: 'Savina 1', DISP_HEPA_FECHA: '2026-08-19' }];
    calcInsumosDias();
    return { conPB, conSavina: __dis('fFecHEPA') };
  });
  si('con PB está apagado', R.conPB === true);
  si('…y al pasar a Savina vuelve a pedirse', R.conSavina === false);

  /* ══ 4 · EL ORDEN DEL TEXTO: OBSERVACIONES Y DESPUÉS EL PLAN ══════════ */
  console.log('\n4 · La evolución cierra con el plan');
  const T = await p.evaluate(() => {
    $('fPlanes').value = 'continuar KTR cada 6 h y sedente al borde de cama';
    $('fNota').value = 'paciente tolera bien, familia informada';
    const txt = String(genTexto() || '');
    const iN = txt.indexOf('Nota:'), iP = txt.indexOf('Plan:');
    // TEXTO_BLOQUES tiene que seguir alineado 1:1 con las líneas
    const lineas = txt.split('\n');
    const blq = (window._TXB_ULT || []);
    const idxN = lineas.findIndex(l => l.startsWith('Nota:'));
    const idxP = lineas.findIndex(l => l.startsWith('Plan:'));
    return { iN, iP, lineas: lineas.length, blq: blq.length,
             blqN: blq[idxN], blqP: blq[idxP],
             ultima: lineas[lineas.length - 1] };
  });
  si('la Nota aparece antes que el Plan', T.iN !== -1 && T.iP !== -1 && T.iN < T.iP);
  eq('y el Plan es la última línea del texto', T.ultima.slice(0, 5), 'Plan:');
  eq('TEXTO_BLOQUES sigue alineado 1:1 con las líneas', T.blq, T.lineas);
  eq('…la línea de la Nota lleva su etiqueta', T.blqN, 'nota');
  eq('…y la del Plan la suya', T.blqP, 'plan');

  console.log('\n5 · El servidor escribe el mismo orden que el cliente');
  const dom = fs.readFileSync(path.join(v2, 'dominio_texto.gs'), 'utf8');
  const iNs = dom.indexOf('txt.push(`Nota: ${nota}`)');
  const iPs = dom.indexOf('txt.push(`Plan: ${planes}`)');
  si('en dominio_texto.gs la Nota va antes que el Plan', iNs !== -1 && iPs !== -1 && iNs < iPs);

  const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
  const iNc = idx.indexOf("_B('nota')"), iPc = idx.indexOf("_B('plan')");
  si('…y en el cliente el _B() viaja con su línea, en el mismo orden', iNc < iPc);

  eq('sin errores JS', errs.join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} fallos: ${fails.join(' · ')}` : '\n✅ Todo OK');
  process.exit(fails.length ? 1 : 0);
})();
