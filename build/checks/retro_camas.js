// retro_camas.js — Guardia de la VISTA RETROSPECTIVA de camas (v5.8).
// BUG reportado por Diego (ago-2026): al viajar a una fecha pasada las tarjetas
// seguían mostrando al paciente que ocupa la cama HOY. En un registro clínico
// eso es información falsa. Ahora se reconstruyen con lo registrado ese día.
// Uso: node build/checks/retro_camas.js
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) {
        // HOY: Caamaño en la cama 1. El 28 de julio esa cama la ocupaba otro paciente.
        const HOY = [
          { ID_CAMA: '1', OCUPADA: true, NOMBRE: 'Caamaño Pérez', EDAD: 70, SEXO: 'M', DIAGNOSTICO: 'NAC', VIA_AEREA: 'TOT', SOPORTE: 'VM', MODO: 'ACVC', FECHA_INGRESO: '2026-07-30' },
          { ID_CAMA: '2', OCUPADA: true, NOMBRE: 'Rosa Rojas', EDAD: 66, SEXO: 'F', DIAGNOSTICO: 'EPOC', VIA_AEREA: 'Natural', SOPORTE: 'CNAF', FECHA_INGRESO: '2026-07-29' },
          { ID_CAMA: '3', OCUPADA: false }];
        const EVOS28 = [{ ID_CAMA: '1', TURNO_KEY: '2026-07-28-Dia', PAC_NOMBRE: 'Luis Antiguo Soto',
          PAC_EDAD: 58, PAC_SEXO: 'M', PAC_DIAGNOSTICO: 'SDRA', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
          VENT_MODO: 'ACVC', DIA_ESTADIA: 6, DIAS_VM: 6, PLAN_FIRMA_KINE: 'DMV',
          PATIENT_ID: 'P-ANTIGUO', COD_PACIENTE: 'LAS58' }];
        const R = { GET_CONFIG_UI: { NUM_CAMAS: 3, BANNERS: {} }, GET_TODAS_CAMAS: HOY, GET_CATALOGO: [],
          GET_EVOS_DEL_DIA: (d && d.fecha === '2026-07-28') ? EVOS28 : [] };
        setTimeout(() => ok({ ok: true, data: R[a] !== undefined ? R[a] : null }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(900);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  const HOY = await p.evaluate(() => ({
    caamano: $('bedGrid').textContent.indexOf('Caamaño') > -1,
    egreso: $('bedGrid').textContent.indexOf('Egr.') > -1,
    mover: !!document.querySelector('#bedGrid .bmov:not(.hidden)'),
  }));
  eq('hoy: la cama muestra a su ocupante actual', HOY.caamano, true);
  eq('hoy: se ofrece egresar', HOY.egreso, true);
  eq('hoy: se ofrece mover de cama', HOY.mover, true);

  const RETRO = await p.evaluate(async () => {
    $('gDate').value = '2026-07-28'; onFechaChange();
    await new Promise(r => setTimeout(r, 420));
    const cards = [...document.querySelectorAll('#bedGrid .bcard')];
    const txt = $('bedGrid').textContent;
    return {
      ocupanteDeHoy: txt.indexOf('Caamaño') > -1,
      pacienteDeEseDia: txt.indexOf('Luis Antiguo Soto') > -1,
      diasDeEseDia: /Día 6/.test(txt),        // 6 días de estadía AL 28, no los de hoy
      codDeEseDia: txt.indexOf('LAS58') > -1,
      sinRegistro: (txt.match(/Sin registro ese día/g) || []).length,
      botones: [...cards[0].querySelectorAll('.bfoot button')].map(x => x.textContent.trim()),
      egreso: txt.indexOf('Egr.') > -1,
      eventoPosterior: txt.indexOf('➕') > -1,
      mover: !!document.querySelector('#bedGrid .bmov:not(.hidden)'),
      sinEvoDeshabilitado: !!cards[1].querySelector('button[disabled]'),
    };
  });
  eq('el ocupante de HOY ya NO aparece en la fecha pasada', RETRO.ocupanteDeHoy, false);
  eq('aparece el paciente que estaba ese día', RETRO.pacienteDeEseDia, true);
  eq('los contadores son los de esa fecha (día 6 de estadía)', RETRO.diasDeEseDia, true);
  eq('y el código del paciente de ese día', RETRO.codDeEseDia, true);
  eq('las camas sin evolución dicen «Sin registro ese día»', RETRO.sinRegistro, 2);
  eq('esas camas no permiten crear evolución hacia atrás', RETRO.sinEvoDeshabilitado, true);
  eq('la cama con registro deja ver/editar lo guardado', RETRO.botones.join('|'), '✏️ Ver / editar|⏱️ Hist.');
  eq('en el pasado no se ofrece egresar', RETRO.egreso, false);
  eq('ni anotar eventos posteriores', RETRO.eventoPosterior, false);
  eq('ni mover de cama', RETRO.mover, false);

  const VUELTA = await p.evaluate(async () => {
    volverAHoy();
    await new Promise(r => setTimeout(r, 420));
    const txt = $('bedGrid').textContent;
    return { caamano: txt.indexOf('Caamaño') > -1, egreso: txt.indexOf('Egr.') > -1,
      sinRegistro: txt.indexOf('Sin registro ese día') > -1 };
  });
  eq('al volver a hoy reaparece el ocupante actual', VUELTA.caamano, true);
  eq('y vuelven las acciones normales', VUELTA.egreso, true);
  eq('sin rastros de la vista retrospectiva', VUELTA.sinRegistro, false);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
