// movil_panel.js — Guardia del panel de evolución EN EL CELULAR (ago-2026,
// pedido de Diego: «hoy está difícil utilizar»). Lo que se midió antes de
// tocar nada, a 390×844: la tarjeta Respiratorio abierta medía 1.325 px con
// 133 campos, las once secciones se veían idénticas (sin resumen ni estado) y
// el nombre del paciente no aparecía en ninguna parte del panel.
//
// Lo que esta guardia fija:
//   1. Cabecera del paciente: cama, nombre y el estado clínico del turno.
//   2. Cada sección del acordeón dice QUÉ TIENE ADENTRO y en qué estado está
//      (✓ con datos · ! falta algo obligatorio · — sin registrar), con el
//      MISMO criterio de obligatorios que el riel del escritorio.
//   3. 🔴 El resumen lee las secciones PLEGADAS. Es el error que ya se cometió
//      una vez al escribirlo: si se mira `offsetParent`, una tarjeta cerrada
//      parece vacía y el encabezado dice «sin registrar» encima de datos que
//      sí están. Lo que NO corresponde (un gate cerrado) sigue fuera.
//   4. Opción B de Diego: Respiratorio se parte en sub-bloques DENTRO del
//      acordeón, y —lo que más importa— **sin mover ni un bloque de sitio**.
//      El orden de la sábana es una decisión clínica tomada (la TQT antes del
//      módulo ventilatorio, v5.1; el prono al inicio de la terapia, v5.44).
//   5. Nada de esto existe en el escritorio, que tiene su riel lateral.
//
// Uso: node build/checks/movil_panel.js
const path = require('path');
const { chromium } = require('playwright-core');

const PUENTE = () => {
  window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
    api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
  }; } }; } } } };
};

/** Deja el panel abierto con un paciente ventilado y algunos datos puestos. */
const MONTAR = () => {
  DB.length = 0;
  DB.push({ ID_CAMA: '1', OCUPADA: 'TRUE', NOMBRE: 'Rosa Pérez Muñoz', EDAD: 67, SEXO: 'F',
    DIAGNOSTICO: 'Shock séptico', FECHA_INGRESO: '2026-08-04', VIA_AEREA: 'TOT',
    SOPORTE: 'VM', PATIENT_ID: 'p1' });
  $('kf').reset();
  $('cBed').value = '1'; $('cIng').value = 'false';
  $('ovl').classList.add('on'); $('sp').classList.add('on');
  $('fNombre').value = 'Rosa Pérez Muñoz'; $('fDias').value = '6'; $('fBarthel').value = '85';
  $('fVA').value = 'TOT'; cascadeVA('VM'); cascadeSop('ACVC');
  $('fSed').value = 'Escalón 2';
  $('r_vt').value = '420'; $('r_peep').value = '8'; $('r_fio2').value = '40';
  $('fKTRcnt').value = '2';
  mAcordeonInit(); rielRender();
};

(async () => {
  const idx = 'file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const fails = [];
  const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  // ── CELULAR ────────────────────────────────────────────────────────────
  const m = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const errs = []; m.on('pageerror', e => errs.push(e.message));
  await m.addInitScript(PUENTE);
  await m.goto(idx);
  await m.waitForTimeout(500);
  await m.evaluate(MONTAR);

  console.log('1 · Cabecera del paciente');
  const R1 = await m.evaluate(() => {
    const el = $('mPac');
    return {
      visible: el.offsetParent !== null,
      cama: el.querySelector('.cama') ? el.querySelector('.cama').textContent : '',
      nombre: el.querySelector('.nom') ? el.querySelector('.nom').textContent : '',
      chips: [...el.querySelectorAll('.ch')].map(c => c.textContent).join(' | '),
      clinico: el.querySelector('.ch.vm') ? el.querySelector('.ch.vm').textContent : '',
      // el nombre largo trunca, no desborda
      sinDesborde: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    };
  });
  eq('la cabecera del paciente se ve', R1.visible, true);
  eq('dice la cama', R1.cama, 'CAMA 1');
  eq('…y el nombre, que antes no aparecía en ninguna parte', R1.nombre, 'Rosa Pérez Muñoz');
  eq('trae el estado clínico del turno', R1.clinico, 'TOT · VM · ACVC');
  eq('…y los días de estadía', /Día 6/.test(R1.chips), true);
  eq('nada se desborda de la pantalla', R1.sinDesborde, true);

  console.log('\n2 · Cada sección dice qué tiene adentro');
  const R2 = await m.evaluate(() => {
    const porTitulo = {};
    document.querySelectorAll('#kf .fcard').forEach(c => {
      const t = (c.querySelector('.fcard-title') || {}).textContent || '';
      const st = c.querySelector('.fcard-hdr .mst'), rs = c.querySelector('.fcard-hdr .mres');
      porTitulo[t.trim()] = { st: st ? st.textContent : null, cls: st ? st.className : null,
        res: rs ? rs.textContent : null };
    });
    const k = Object.keys(porTitulo);
    const sed = porTitulo[k.find(x => /Sedaci/i.test(x))];
    const aus = porTitulo[k.find(x => /Auscultaci/i.test(x))];
    const plan = porTitulo[k.find(x => /Planes/i.test(x))];
    const disp = porTitulo[k.find(x => /Dispositivos/i.test(x))];
    return { sed, aus, plan, disp, todas: k.length };
  });
  eq('la sección con datos queda en ✓', R2.sed.st, '✓');
  eq('…y resume lo registrado', /Escalón 2/.test(R2.sed.res), true);
  eq('la sección vacía queda en —', R2.aus.st, '—');
  eq('…y lo dice sin inventar', R2.aus.res, 'sin registrar');
  eq('la que tiene un obligatorio pendiente queda en !', R2.plan.st, '!');
  eq('…y nombra lo que falta', /falta la firma/.test(R2.plan.res), true);
  eq('las fechas se resumen legibles (dd-mm) y con su etiqueta',
    /HME \d{2}-\d{2}/.test(R2.disp.res), true);

  console.log('\n3 · ★ El resumen lee las secciones PLEGADAS');
  const R3 = await m.evaluate(() => {
    const c = $('fSed').closest('.fcard');
    return {
      estaPlegada: c.classList.contains('mcol'),
      camposInvisibles: $('fSed').offsetParent === null,
      resumenIgual: c.querySelector('.fcard-hdr .mres').textContent,
    };
  });
  eq('la tarjeta está plegada', R3.estaPlegada, true);
  eq('…y sus campos no se ven', R3.camposInvisibles, true);
  eq('★ aun así el resumen los muestra', /Escalón 2/.test(R3.resumenIgual), true);

  console.log('\n4 · Lo que NO corresponde sigue fuera del resumen');
  const R4 = await m.evaluate(() => {
    // Con vía aérea TOT hay bloques que su gate deja cerrados porque NO APLICAN
    // a este paciente: decanulación y desvinculación son de traqueostomía, y la
    // reintubación exige historial. Sus campos no son «datos sin registrar»:
    // simplemente no existen para él, y no deben aparecer en el resumen.
    // (La TQT sí se muestra con TOT, y está bien: desde un TOT se puede
    // traqueostomizar en este turno.)
    const cerrados = ['dDecanSec', 'dDesvincSec', 'dReintubSec']
      .filter(id => $(id).classList.contains('hidden'));
    const res = $('msEvt').querySelector('.mres').textContent;
    return { cerrados: cerrados.length, res,
      contamina: /decanul|desvincul|reintub/i.test(res),
      tqtVisible: !$('dTqtSec').classList.contains('hidden'),
      resVent: $('msVent').querySelector('.mres').textContent };
  });
  eq('con TOT hay tres bloques cerrados por su gate', R4.cerrados, 3);
  eq('…y ninguno ensucia el resumen de eventos', R4.contamina, false);
  eq('la TQT sí se ofrece con TOT (se puede traqueostomizar hoy)', R4.tqtVisible, true);
  eq('el resumen de ventilación trae lo del turno', /VM · ACVC/.test(R4.resVent), true);

  console.log('\n5 · Opción B — Respiratorio en sub-bloques, SIN reordenar');
  const R5 = await m.evaluate(() => {
    const card = $('fSop').closest('.fcard');
    const subs = [...card.querySelectorAll('.msub')];
    // El orden de los bloques dentro de la tarjeta debe ser EXACTAMENTE el de
    // antes de agrupar: se comparan los ids en el orden en que aparecen.
    const orden = [...card.querySelectorAll('.msub-b > [id]')].map(x => x.id);
    return {
      n: subs.length,
      ids: subs.map(s => s.id).join(','),
      titulos: subs.map(s => s.querySelector('.msub-t').textContent).join(' | '),
      // Ventilación abierta (es la que se usa siempre), el resto plegado
      ventAbierto: !$('msVent').classList.contains('cerrado'),
      evtCerrado: $('msEvt').classList.contains('cerrado'),
      manCerrado: $('msMan').classList.contains('cerrado'),
      orden: orden.join(','),
      // los gates siguen mandando dentro del sub-bloque
      ventBloqueVive: !!$('dVentBloque') && $('dVentBloque').closest('.msub') === $('msVent'),
    };
  });
  eq('son tres sub-bloques', R5.n, 3);
  eq('…con los nombres de la ronda', R5.titulos,
    '💨 Ventilación | ✂️ Eventos de vía aérea | 🫁 Manejo respiratorio');
  eq('★ el orden de la sábana NO cambió',
    R5.orden.indexOf('dTqtSec,avisoVentTqt,dPronoStrip,dVentBloque'), 0);
  eq('…y los eventos van después, como estaban',
    /dDesvincSec,dDecanSec,dExtSec/.test(R5.orden), true);
  eq('Ventilación arranca abierta', R5.ventAbierto, true);
  eq('…y los otros dos plegados', R5.evtCerrado && R5.manCerrado, true);
  eq('el módulo ventilatorio quedó dentro de su sub-bloque', R5.ventBloqueVive, true);

  console.log('\n6 · Plegar un sub-bloque no borra nada');
  const R6 = await m.evaluate(() => {
    mSubToggle($('msVent').querySelector('.msub-h'));
    const cerrado = $('msVent').classList.contains('cerrado');
    const vtInvisible = $('r_vt').offsetParent === null;
    const vtValor = $('r_vt').value;          // ★ el dato sigue en el formulario
    const resumenSigue = $('msVent').querySelector('.mres').textContent;
    mSubToggle($('msVent').querySelector('.msub-h'));
    return { cerrado, vtInvisible, vtValor, resumenSigue,
             reabre: !$('msVent').classList.contains('cerrado') };
  });
  eq('se pliega', R6.cerrado, true);
  eq('…sus campos dejan de verse', R6.vtInvisible, true);
  eq('★ pero el valor sigue en el formulario (viaja igual al guardar)', R6.vtValor, '420');
  eq('…y el resumen lo sigue mostrando', /420/.test(R6.resumenSigue), true);
  eq('vuelve a abrirse', R6.reabre, true);

  console.log('\n7 · El encabezado no se desarma con un título largo');
  const R7 = await m.evaluate(() => {
    const h = $('fSop').closest('.fcard').querySelector('.fcard-hdr');
    const hr = h.getBoundingClientRect();
    const st = h.querySelector('.mst').getBoundingClientRect();
    const ti = h.querySelector('.fcard-title').getBoundingClientRect();
    return { alto: Math.round(hr.height), mismaLinea: Math.abs(st.top - ti.top) < 16 };
  });
  eq('el ✓ y el título van en la misma línea', R7.mismaLinea, true);
  eq('el encabezado no se dispara de alto (<95 px)', R7.alto < 95, true);

  const errsM = errs.slice();
  await m.close();

  // ── ESCRITORIO: nada de esto aparece ───────────────────────────────────
  console.log('\n8 · En el escritorio no existe (allá manda el riel)');
  const d = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errsD = []; d.on('pageerror', e => errsD.push(e.message));
  await d.addInitScript(PUENTE);
  await d.goto(idx);
  await d.waitForTimeout(500);
  await d.evaluate(MONTAR);
  const R8 = await d.evaluate(() => ({
    pacOculto: $('mPac').offsetParent === null,
    sinSubs: document.querySelectorAll('#kf .msub').length,
    stOculto: [...document.querySelectorAll('#kf .mst')].every(x => x.offsetParent === null),
    resOculto: [...document.querySelectorAll('#kf .mres')].every(x => x.offsetParent === null),
    rielVive: document.querySelectorAll('#spRiel .riel-i').length > 5,
    // y el orden de la sábana en escritorio es el de siempre
    ventDirecto: !!$('dVentBloque') && !$('dVentBloque').closest('.msub'),
  }));
  eq('la cabecera móvil no se ve', R8.pacOculto, true);
  eq('no se arman sub-bloques', R8.sinSubs, 0);
  eq('los ✓ del acordeón no se ven', R8.stOculto, true);
  eq('los resúmenes tampoco', R8.resOculto, true);
  eq('el riel lateral sigue haciendo su trabajo', R8.rielVive, true);
  eq('el módulo ventilatorio queda suelto, como siempre', R8.ventDirecto, true);
  await d.close();

  await b.close();
  const todos = errsM.concat(errsD);
  if (todos.length) { console.log('❌ errores JS: ' + todos.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
