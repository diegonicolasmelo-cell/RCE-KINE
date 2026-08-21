// dia_cero.js — El DÍA 0 de soporte se muestra como «0», no como raya
// (ago-2026).
//
// REPORTE DE DIEGO (4-ago): FOXTROT ingresa y se intuba el MISMO día. La grilla
// del Registro Diario mostraba «0» en días de estadía (correcto) pero «-» en
// días de VM. Causa: la celda hacía `${dvm||'-'}` y en JavaScript el 0 es
// FALSO, así que el Día 0 caía en la raya. La celda de estadía, dos líneas
// más abajo, ya lo distinguía bien con `${dEst!==''?dEst:'-'}`.
//
// La raya sigue siendo correcta para quien NUNCA tuvo ese soporte: 0 y «no
// aplica» son cosas distintas y la grilla tiene que poder decir las dos.
//
// Uso: node build/checks/dia_cero.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(()=>{
    window.google={script:{run:{withSuccessHandler(ok){return{withFailureHandler(){return{
      api(a,d){ setTimeout(()=>ok({ok:true,data:(a==='GET_CONFIG_UI'?{NUM_CAMAS:6,BANNERS:{}}:null)}),5); }
    };}};}}}};
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

  const filas = await p.evaluate(() => {
    ATAB = 'P';
    $('gDate').value = '2026-08-04'; SHIFT = 'Dia';
    DB = [
      // 1 · FOXTROT: ingresa y se intuba HOY ⇒ Día 0 de estadía y de VM
      { ID_CAMA: '1', OCUPADA: true, NOMBRE: 'FOXTROT DE PRUEBA', SEXO: 'F', EDAD: 70,
        FECHA_INGRESO: '2026-08-04', FECHA_INICIO_SOPORTE: '2026-08-04', VIA_AEREA: 'TOT', SOPORTE: 'VM' },
      // 2 · Paciente ventilado hace días
      { ID_CAMA: '2', OCUPADA: true, NOMBRE: 'GOLF DE PRUEBA', SEXO: 'F', EDAD: 73,
        FECHA_INGRESO: '2026-07-29', FECHA_INICIO_SOPORTE: '2026-07-29', VIA_AEREA: 'TOT', SOPORTE: 'VM' },
      // 3 · NUNCA estuvo en VM (ambiente) ⇒ la raya es lo correcto
      { ID_CAMA: '3', OCUPADA: true, NOMBRE: 'Sin Soporte', SEXO: 'M', EDAD: 60,
        FECHA_INGRESO: '2026-08-02', VIA_AEREA: 'Natural', SOPORTE: 'Ambiente' },
      // 4 · cama vacía ⇒ raya
      { ID_CAMA: '4', OCUPADA: false },
    ];
    EVOS_DIA = [
      // FOXTROT evolucionada: el servidor selló DIAS_VM = 0 (día 0), soporte VM
      { ID_CAMA: '1', TURNO_KEY: '2026-08-04-Dia', DIA_ESTADIA: 0, DIAS_VM: 0, DIAS_VNI: 0,
        VENT_SOPORTE: 'VM', VENT_SOPORTE_FINAL: 'VM', PAC_NOMBRE: 'FOXTROT DE PRUEBA' },
      { ID_CAMA: '2', TURNO_KEY: '2026-08-04-Dia', DIA_ESTADIA: 6, DIAS_VM: 6, DIAS_VNI: 0,
        VENT_SOPORTE: 'VM', VENT_SOPORTE_FINAL: 'VM', PAC_NOMBRE: 'GOLF DE PRUEBA' },
      { ID_CAMA: '3', TURNO_KEY: '2026-08-04-Dia', DIA_ESTADIA: 2, DIAS_VM: 0, DIAS_VNI: 0,
        VENT_SOPORTE: 'Ambiente', VENT_SOPORTE_FINAL: 'Ambiente', PAC_NOMBRE: 'Sin Soporte' },
    ];
    EVO_SET = new Set(['1', '2', '3']);
    renderTabla();
    return [...document.querySelectorAll('#notionTable tr')].map(tr =>
      [...tr.querySelectorAll('td')].slice(0, 6).map(td => td.textContent.trim()));
  });

  // columnas: cama · paciente · sexo · edad · DÍAS ESTADÍA · DÍAS VM
  const rosa = filas.find(f => /FOXTROT/.test(f[1] || ''));
  const maria = filas.find(f => /GOLF/.test(f[1] || ''));
  const sinSop = filas.find(f => /Sin Soporte/.test(f[1] || ''));

  eq('FOXTROT · estadía Día 0 se ve como «0»', rosa && rosa[4], '0');
  eq('FOXTROT · VM Día 0 se ve como «0», NO como raya', rosa && rosa[5], '0');
  eq('GOLF · sus 6 días de VM siguen intactos', maria && maria[5], '6');
  eq('quien nunca tuvo VM conserva la raya (0 ≠ no aplica)', sinSop && sinSop[5], '-');

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ dia_cero OK');
  process.exit(fails.length ? 1 : 0);
})();
