// pve_horas.js — El gate de PVE informa, no bloquea (ago-2026).
//
// REPORTE DE DIEGO: el botón "Sí" de PVE se ocultaba/deshabilitaba con
// DIAS_VM<1 (días de CALENDARIO contra la fecha del turno) — pero un día de
// calendario no mide 24 horas exactas, así que bloqueó a una colega que por
// horas REALES sí cumplía protocolo. Ahora "Sí" queda SIEMPRE disponible; el
// gate solo INFORMA las horas reales de VM (TS_INICIO_SOPORTE, mismo
// mecanismo del ciclo de prono) y deja la decisión al criterio clínico.
//
// Uso: node build/checks/pve_horas.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(()=>{
    window.google={script:{run:{withSuccessHandler(ok){return{withFailureHandler(){return{
      api(a,d){ setTimeout(()=>ok({ok:true,data:(a==='GET_CONFIG_UI'?{NUM_CAMAS:12,BANNERS:{}}:null)}),5); }
    };}};}}}};
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  // Reloj cliente fijo: se sobreescribe _horaAhoraCli (usada por _pveHorasVM)
  // para que el resultado no dependa de la hora real en que corre el test.
  await p.evaluate(() => { window._horaAhoraCli = () => '10:00'; });

  /* ── 1 · Bajo 24 h reales: informa, NO bloquea el botón "Sí" ── */
  const bajo = await p.evaluate(() => {
    $('sp').classList.add('on'); $('kf').reset(); $('cIng').value = 'false'; $('cBed').value = '3';
    $('gDate').value = '2026-08-04'; SHIFT = 'Dia';
    DB = [{ ID_CAMA: '3', VIA_AEREA: 'TOT', SOPORTE: 'VM', TS_INICIO_SOPORTE: '2026-08-04 05:00' }];
    $('fVA').value = 'TOT'; updateVAUI();
    const b = $('btnPVESi'), n = $('dPVEfueraProto');
    return { disabled: b.disabled, display: b.style.display, oculto: n.classList.contains('hidden'), texto: n.textContent };
  });
  eq('bajo 24 h · el botón "Sí" NO se deshabilita', bajo.disabled, false);
  eq('…ni se oculta', bajo.display, '');
  eq('la nota de horas reales se muestra', bajo.oculto, false);
  eq('…con las 5 h reales calculadas (05:00→10:00)', /Lleva 5 h en VM/.test(bajo.texto), true);
  eq('…y la advertencia de <24 h', /≥24 h/.test(bajo.texto), true);

  /* ── 2 · Sobre 24 h reales: informa (positivo), tampoco bloquea ── */
  const sobre = await p.evaluate(() => {
    DB = [{ ID_CAMA: '3', VIA_AEREA: 'TOT', SOPORTE: 'VM', TS_INICIO_SOPORTE: '2026-08-02 08:00' }];
    updateVAUI();
    const b = $('btnPVESi'), n = $('dPVEfueraProto');
    return { disabled: b.disabled, oculto: n.classList.contains('hidden'), texto: n.textContent };
  });
  eq('sobre 24 h · el botón "Sí" sigue disponible', sobre.disabled, false);
  eq('la nota informa las horas (50 h) sin advertir bloqueo', /Lleva 50 h en VM/.test(sobre.texto), true);
  eq('…sin la frase de "fuera de protocolo" (ya cumple)', /fuera de protocolo/.test(sobre.texto), false);

  /* ── 3 · Sin TS_INICIO_SOPORTE (paciente sin ese dato): sin nota, sin bloqueo ── */
  const sinDato = await p.evaluate(() => {
    DB = [{ ID_CAMA: '3', VIA_AEREA: 'TOT', SOPORTE: 'VM' }];
    updateVAUI();
    const b = $('btnPVESi'), n = $('dPVEfueraProto');
    return { disabled: b.disabled, oculto: n.classList.contains('hidden') };
  });
  eq('sin TS_INICIO_SOPORTE · botón disponible igual', sinDato.disabled, false);
  eq('…y la nota queda oculta (nada que informar)', sinDato.oculto, true);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ pve_horas OK');
  process.exit(fails.length ? 1 : 0);
})();
