// asincronia.js — Guardia de la regla clínica v5.11 (pedido de Diego,
// ago-2026): la presión plateau (Ppl) y el AutoPEEP exigen un paciente
// PASIVO. Si la interacción P-VM es «Asincrónico», Ppl no se puede medir
// (y con ella caen DP y Cest) y el AutoPEEP no es fidedigno: los campos se
// inhabilitan y una nota lo explica. La regla sobrevive al re-dibujado del
// módulo y NO borra datos al re-aplicarse en réplicas/cargas (solo cuando
// el usuario cambia el selector con la mano).
// Uso: node build/checks/asincronia.js
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  const R = await p.evaluate(async () => {
    const r = {};
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    $('fVA').value = 'TOT'; cascadeVA();
    $('fSop').value = 'VM'; cascadeSop();
    $('fModo').value = 'ACVC'; renderParams();
    // Paciente sincrónico: todo medible
    $('r_vt').value = '400'; $('r_peep').value = '8'; $('r_ppl').value = '20'; $('r_autopeep').value = '2';
    calcResp($('r_ppl'));
    r.dpConPpl = $('l_dp').textContent;
    r.sincHabilitado = !$('r_ppl').disabled && !$('r_autopeep').disabled;
    r.notaOculta = $('adaptNota').classList.contains('hidden');

    // El usuario declara ASINCRÓNICO → Ppl/AutoPEEP se inhabilitan y limpian
    $('sAdapt').value = 'Asincrónico';
    $('sAdapt').dispatchEvent(new Event('change'));
    r.pplDes = $('r_ppl').disabled; r.pplVacio = v('r_ppl');
    r.autoDes = $('r_autopeep').disabled; r.autoVacio = v('r_autopeep');
    r.dpSinPpl = $('l_dp').textContent; r.cesrSinPpl = $('l_cesr').textContent;
    r.notaVisible = !$('adaptNota').classList.contains('hidden');

    // La regla sobrevive al re-dibujado del módulo (cambio de modo)
    $('fModo').value = 'ACPC'; renderParams();
    r.acpcSigueAsinc = v('sAdapt');
    r.acpcAutoDes = $('r_autopeep').disabled;

    // Vuelta a ACVC y a SINCRÓNICO: los campos se recuperan
    $('fModo').value = 'ACVC'; renderParams();
    $('sAdapt').value = 'Sincrónico';
    $('sAdapt').dispatchEvent(new Event('change'));
    r.vuelveHabilitado = !$('r_ppl').disabled && !$('r_autopeep').disabled;
    r.notaSeOculta = $('adaptNota').classList.contains('hidden');

    // Re-aplicación PROGRAMÁTICA (réplica/carga): inhabilita pero NO borra
    $('r_ppl').value = '19';
    $('sAdapt').value = 'Asincrónico'; hAdapt();
    r.replicaDes = $('r_ppl').disabled;
    r.replicaConserva = v('r_ppl');
    return r;
  });
  eq('sincrónico: Ppl y AutoPEEP habilitados', R.sincHabilitado, true);
  eq('sincrónico: DP se calcula (Ppl 20 − PEEPtot 10)', R.dpConPpl, 'DP: 10');
  eq('sincrónico: sin nota de advertencia', R.notaOculta, true);
  eq('asincrónico: Ppl inhabilitada', R.pplDes, true);
  eq('asincrónico: Ppl se limpia (el usuario la declaró no medible)', R.pplVacio, '');
  eq('asincrónico: AutoPEEP inhabilitado', R.autoDes, true);
  eq('asincrónico: AutoPEEP se limpia', R.autoVacio, '');
  eq('asincrónico: DP queda sin calcular', R.dpSinPpl, '--');
  eq('asincrónico: Cest queda sin calcular', R.cesrSinPpl, '--');
  eq('asincrónico: nota visible', R.notaVisible, true);
  eq('el re-dibujado (ACVC→ACPC) conserva la elección', R.acpcSigueAsinc, 'Asincrónico');
  eq('y el AutoPEEP sigue inhabilitado tras re-dibujar', R.acpcAutoDes, true);
  eq('volver a sincrónico recupera los campos', R.vuelveHabilitado, true);
  eq('y esconde la nota', R.notaSeOculta, true);
  eq('réplica/carga: inhabilita sin borrar lo escrito', R.replicaDes && R.replicaConserva === '19', true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
