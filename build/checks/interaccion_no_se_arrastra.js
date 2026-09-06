// interaccion_no_se_arrastra.js — LA INTERACCIÓN P-VM ES DE ESTE TURNO.
//
// 🔴 DE DÓNDE SALE (Diego, 6-sep-2026): «hay un detalle con la sincronía
// paciente-ventilador: de un turno a otro se arrastra como asincrónico… en el
// texto queda mal». Dos rendijas, las dos cerradas en la v6.04:
//   1. El selector vive dentro de renderParams y se re-dibujaba con el valor
//      que tenía de la CAMA ANTERIOR abierta en la misma sesión.
//   2. fillFormReplica lo copiaba del turno anterior, como si fuera un dato
//      heredable. Es una observación del turno: parte vacío (nada se afirma
//      hasta que alguien elija), y solo al REABRIR un turno guardado vuelve.
//
// Uso: node build/checks/interaccion_no_se_arrastra.js (requiere playwright-core)
const path = require('path');
const { chromium } = require('playwright-core');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2 = path.resolve(__dirname, '..', '..', 'v2'), 'index.html'));
  await p.waitForTimeout(500);
  const R = await p.evaluate(() => {
    const r = {};
    DB = [{ ID_CAMA: '1', OCUPADA: true, NOMBRE: 'A', PATIENT_ID: 'p1' }, { ID_CAMA: '2', OCUPADA: true, NOMBRE: 'B', PATIENT_ID: 'p2' }];
    const vm = () => { $('fVA').value = 'TOT'; cascadeVA(); $('fSop').value = 'VM'; cascadeSop(); $('fModo').value = 'ACVC'; renderParams(); };
    // 1 · cama 1 con asincrónico declarado
    abrirPanel('1', false, false); vm();
    $('sAdapt').value = 'Asincrónico'; $('sAdapt').dispatchEvent(new Event('change'));
    r.cama1 = v('sAdapt');
    r.textoCama1 = /inadecuada interacción/.test(genTexto());
    // 2 · se abre OTRA cama: el selector tiene que partir vacío
    cerrarPanel && cerrarPanel();
    abrirPanel('2', false, false); vm();
    r.cama2 = v('sAdapt');
    r.textoCama2 = /interacción P-VM/.test(genTexto());
    // 3 · réplica del turno anterior con asincrónico guardado: NO se hereda
    fillFormReplica({ VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC', VENT_ADAPTADO: 'FALSE', VENT_VT: 450 });
    r.replica = v('sAdapt');
    r.textoReplica = /interacción P-VM/.test(genTexto());
    // 4 · reabrir un turno GUARDADO sí recupera lo registrado
    fillForm({ VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC', VENT_ADAPTADO: 'FALSE', VENT_VT: 450, PLAN_FIRMA_KINE: 'DMV' });
    r.guardado = v('sAdapt');
    return r;
  });
  eq('cama 1: el colega declara asincrónico y el texto lo narra', R.cama1 + '|' + R.textoCama1, 'Asincrónico|true');
  eq('★ al abrir OTRA cama el selector parte vacío', R.cama2, '');
  eq('…y el texto no afirma ninguna interacción', R.textoCama2, false);
  eq('★ la réplica del turno anterior NO arrastra el asincrónico', R.replica, '');
  eq('…y el texto replicado tampoco lo narra', R.textoReplica, false);
  eq('reabrir un turno guardado sí recupera lo que se registró', R.guardado, 'Asincrónico');
  eq('sin errores de página', errs.length, 0);
  await b.close();
  console.log(fails.length ? '❌ ' + fails.length + ' FALLOS' : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
