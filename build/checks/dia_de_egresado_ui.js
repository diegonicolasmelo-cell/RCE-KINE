// dia_de_egresado_ui.js — La TABLA del Registro Diario no habla por el
// ocupante de hoy cuando se mira una fecha pasada.
//
// POR QUÉ EXISTE, HABIENDO YA UNA GUARDIA DE VISTA RETROSPECTIVA:
// `retro_camas.js` (v5.8) cubre la GRILLA de camas, y ahí el arreglo estaba
// bien hecho: la cama sin evolución dice «Sin registro ese día». Pero la
// pestaña 📋 Registro Diario es otra pantalla, con su propio render, y ahí
// quedó la línea vieja:
//     const nombre = (evoRef && evoRef.PAC_NOMBRE) || (ocu ? c.NOMBRE : '');
// «si no hay evolución, el ocupante actual». Escrito cuando «no hay» solo
// significaba «no se registró»; desde que el alta archiva las evoluciones
// también significa «esa persona ya egresó». Manuel pidió la cama 1 del 1 de
// agosto y le salió el nombre de la paciente que ocupa esa cama HOY, con los
// días de estadía contados desde el ingreso de ella (20-ago-2026).
//
// 👉 La regla de la casa: una regla vive en 3-4 sitios y hay que buscarla en
// TODOS. Aquí vivía en dos pantallas y solo una estaba arreglada.
//
// Uso: node build/checks/dia_de_egresado_ui.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 4, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
  const si = (l, c) => eq(l, !!c, true);

  // Camas de HOY. La 1 la ocupa Elizabeth desde el 11; el 1 de agosto estaba
  // Francisca, que ya egresó. La 2 está ocupada y ese día no se registró.
  const CAMAS = [
    { ID_CAMA: '1', OCUPADA: true, NOMBRE: 'Elizabeth Ocupante Hoy', SEXO: 'F', EDAD: 54,
      DIAGNOSTICO: 'ACV', SOPORTE: 'VM', FECHA_INGRESO: '2026-08-11' },
    { ID_CAMA: '2', OCUPADA: true, NOMBRE: 'Otro Paciente Vivo', SEXO: 'M', EDAD: 61,
      DIAGNOSTICO: 'NAC', SOPORTE: 'VM', FECHA_INGRESO: '2026-07-20' },
    { ID_CAMA: '3', OCUPADA: true, NOMBRE: 'Registro Del Dia', SEXO: 'F', EDAD: 70,
      DIAGNOSTICO: 'EPOC', SOPORTE: 'VNI', FECHA_INGRESO: '2026-07-25' },
    { ID_CAMA: '4', OCUPADA: false },
  ];

  /* ══ 1 · FECHA PASADA ══════════════════════════════════════════════════ */
  console.log('1 · El 1 de agosto muestra a quien estaba, no a quien está hoy');
  const RETRO = await p.evaluate((CAMAS) => {
    ATAB = 'P'; SHIFT = 'Noche';
    $('gDate').value = '2026-08-01';
    $('gDate').classList.remove('turno-hoy');       // vista retrospectiva
    DB = CAMAS;
    // Lo que devuelve el servidor ya arreglado: la evolución ARCHIVADA de
    // Francisca vuelve a venir. La cama 2 no tiene nada ese día.
    EVOS_DIA = [
      { ID_CAMA: '1', TURNO_KEY: '2026-08-01-Noche', PAC_NOMBRE: 'Francisca Egresada',
        PAC_SEXO: 'F', PAC_EDAD: 67, PAC_DIAGNOSTICO: 'SDRA', VENT_SOPORTE: 'VM',
        DIA_ESTADIA: 15, DIAS_VM: 11, PLAN_FIRMA_KINE: 'MFB' },
      { ID_CAMA: '3', TURNO_KEY: '2026-08-01-Noche', PAC_NOMBRE: 'Registro Del Dia',
        PAC_SEXO: 'F', PAC_EDAD: 70, PAC_DIAGNOSTICO: 'EPOC', VENT_SOPORTE: 'VNI',
        DIA_ESTADIA: 7, DIAS_VM: 0 },
    ];
    EVO_SET = new Set(['1', '3']);
    renderTabla();
    const filas = [...document.querySelectorAll('#notionTable tbody tr')]
      .map(tr => [...tr.cells].map(td => td.textContent.replace(/[\u2795\u{1F512}]/gu, '').replace(/\s+/g, ' ').trim()));
    const txt = $('notionTable').textContent;
    return {
      texto: txt,
      cama1: filas.find(f => f[0] === '1') || [],
      cama2: filas.find(f => f[0] === '2') || [],
      cama4: filas.find(f => f[0] === '4') || [],
    };
  }, CAMAS);

  eq('la cama 1 muestra a la paciente de ese día', RETRO.cama1[1], 'Francisca Egresada');
  eq('con SUS días de estadía, no los de la ocupante de hoy', RETRO.cama1[4], '15');
  eq('y sus días de ventilación', RETRO.cama1[5], '11');
  si('la ocupante de HOY no aparece por ninguna parte',
    RETRO.texto.indexOf('Elizabeth Ocupante Hoy') === -1);

  console.log('\n2 · La cama sin registro ese día lo DICE, no rellena con el ocupante');
  eq('la cama 2 no muestra a su ocupante actual', RETRO.cama2[1], 'Sin registro ese día');
  si('…y tampoco lo declara vacía («Disponible» afirmaría que no había nadie)',
    RETRO.texto.indexOf('Disponible') === -1);
  eq('sin inventarle días de estadía (la raya del proyecto)', RETRO.cama2[4], '-');
  eq('ni de ventilación', RETRO.cama2[5], '-');
  eq('la cama libre de hoy tampoco afirma nada del pasado', RETRO.cama4[1], 'Sin registro ese día');

  /* ══ 3 · HOY NO CAMBIA (la regresión que hay que evitar) ═══════════════ */
  console.log('\n3 · En el día de hoy todo sigue como estaba');
  const HOY = await p.evaluate((CAMAS) => {
    ATAB = 'P'; SHIFT = 'Dia';
    $('gDate').value = '2026-08-20';
    $('gDate').classList.add('turno-hoy');          // día de hoy
    DB = CAMAS;
    EVOS_DIA = [];                                  // aún no se registra el turno
    EVO_SET = new Set();
    _regEgrKey = '2026-08-20';                      // sin egresos que consultar
    renderTabla();
    const filas = [...document.querySelectorAll('#notionTable tbody tr')]
      .map(tr => [...tr.cells].map(td => td.textContent.replace(/[\u2795\u{1F512}]/gu, '').replace(/\s+/g, ' ').trim()));
    return {
      texto: $('notionTable').textContent,
      cama1: filas.find(f => f[0] === '1') || [],
      cama4: filas.find(f => f[0] === '4') || [],
    };
  }, CAMAS);

  eq('la cama ocupada sigue mostrando a su paciente aunque no haya evolución', HOY.cama1[1], 'Elizabeth Ocupante Hoy');
  eq('la cama libre sigue diciendo «Disponible»', HOY.cama4[1], 'Disponible');
  si('y no aparece el rótulo de la vista retrospectiva',
    HOY.texto.indexOf('Sin registro ese día') === -1);

  eq('sin errores de página', errs.length, 0);
  await b.close();
  console.log('\n' + (fails.length ? '❌ FALLARON ' + fails.length + ': ' + fails.join(' · ')
    : '✅ dia_de_egresado_ui: todo en orden'));
  process.exit(fails.length ? 1 : 0);
})();
