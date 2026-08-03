// prono.js — Guardia de ESTADO vs EVENTO en el posicionamiento (v5.32).
//
// Nació de un reporte de Diego: la paciente de la cama 4 se pronó UNA vez a
// las 19:00 (turno de María José) y apareció una segunda pronación en el turno
// siguiente (Mauricio), que solo había descrito que el paciente SEGUÍA prono.
// La casilla «Prono» hacía las dos cosas: describir la posición y registrar el
// procedimiento.
//
// Cubre: (1) el formulario ya no deriva el procedimiento de la posición sino de
// la casilla del turno; (2) re-editar una evolución NO pierde el
// posicionamiento (bug encontrado de paso); (3) el hito del historial se crea
// aunque el procedimiento traiga la hora pegada; (4) la entrega de turno no
// repite el prono turno a turno.
// Uso: node build/checks/prono.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const V2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

(async () => {
  // ── Parte 1 · Servidor: hitos y entrega ──────────────────────────────────
  const src = ['infra_respuesta.gs', 'infra_util.gs', 'svc_timeline.gs']
    .map(f => fs.readFileSync(path.join(V2, f), 'utf8')).join('\n;\n');
  const HITOS = [];
  global.repoEliminarDonde = () => {};
  global.repoLeerTodos = () => [];
  global.repoInsertar = () => {};
  global._agregarHitoInternoSinSync = h => HITOS.push(h.texto);
  global._sincronizarTimelineCama = () => {};
  global.Utilities = { getUuid: () => 'u' };
  (0, eval)(src);

  global._agregarHitoInternoSinSync = h => HITOS.push(h.texto);
  _crearHitosDesdeProcedimientos('4', '2026-08-01', 'Dia',
    ['PRONO 19:00 HRS', 'SUPINACIÓN 07:30 HRS', 'RCP 3 CICLOS', 'INTUBACIÓN'], 'MJ', '');
  eq('la pronación CON hora genera su hito', HITOS.indexOf('Decúbito prono') > -1, true);
  eq('la supinación con hora también', HITOS.indexOf('Decúbito supino') > -1, true);
  eq('el RCP con n° de ciclos también', HITOS.indexOf('Reanimación cardiopulmonar (RCP)') > -1, true);
  eq('y lo que ya funcionaba sigue igual', HITOS.indexOf('Intubación orotraqueal') > -1, true);
  eq('la clave ignora la hora pegada', _procClaveHito('PRONO 19:00 HRS'), 'PRONO');
  eq('y traduce SUPINACIÓN al hito SUPINO', _procClaveHito('SUPINACIÓN 07:30 HRS'), 'SUPINO');

  // ── Parte 2 · Cliente: el formulario ─────────────────────────────────────
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { const R = { GET_BOOT: { ahora: '2026-08-02 10:00:00', yo: { email: '', firma: 'DEV', dev: true },
        config: { NUM_CAMAS: 12, BANNERS: {} }, fases: ['Weaning'], camas: [], evos: [], asignacion: { team: [], assign: {} } } };
        setTimeout(() => ok({ ok: true, data: R[a] !== undefined ? R[a] : null }), 4); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(V2, 'index.html'));
  await p.waitForTimeout(800);

  const R = await p.evaluate(() => {
    const r = {};
    // Turno de María José: pronación real a las 19:00
    abrirPanel('4');
    $('cProno').checked = true; hPosEspecial('prono');
    r.soloPosicion = _autoProcs().filter(x => /PRONO/.test(x));      // aún sin declarar el evento
    $('fPronoHora').value = '19:00';
    $('cPronoEv').checked = true;
    r.conEvento = _autoProcs().filter(x => /PRONO/.test(x));
    const guardado = { RESP_POS_PRONO: true, RESP_PRONO_EVENTO: true, RESP_PRONO_HORA: '19:00',
                       RESP_POS_SED: true, RESP_POS_LIBRE: 'almohadas bajo tórax',
                       RESP_PRONO_TS: '1754000000000' };

    // Turno de Mauricio: replica y describe que SIGUE en prono
    abrirPanel('4');
    fillFormReplica(guardado);
    r.replicaNoArrastra = !$('cProno').checked && !$('cPronoEv').checked;
    $('cProno').checked = true; hPosEspecial('prono');
    r.describirNoSuma = _autoProcs().filter(x => /PRONO/.test(x));
    r.eventoDesmarcado = !$('cPronoEv').checked;

    // Re-edición de la evolución de María José: nada se pierde
    abrirPanel('4');
    fillForm(guardado);
    r.reedProno = !!$('cProno').checked;
    r.reedEvento = !!$('cPronoEv').checked;
    r.reedHora = $('fPronoHora').value;
    r.reedSed = !!$('cPosSed').checked;
    r.reedLibre = $('fPosLibre').value;
    r.reedProcs = _autoProcs().filter(x => /PRONO/.test(x));
    // desmarcar la posición apaga también el evento
    $('cProno').checked = false; hPosEspecial('prono');
    r.apagaEvento = !$('cPronoEv').checked;
    // supino excluye prono y su evento
    $('cProno').checked = true; hPosEspecial('prono'); $('cPronoEv').checked = true;
    $('cSupino').checked = true; hPosEspecial('supino');
    r.supinoLimpiaProno = !$('cProno').checked && !$('cPronoEv').checked;
    return r;
  });

  eq('marcar la posición NO registra procedimiento', R.soloPosicion.length, 0);
  eq('declarar el evento sí lo registra, con hora', R.conEvento.join('|'), 'PRONO 19:00 HRS');
  eq('la réplica del turno siguiente no arrastra la posición', R.replicaNoArrastra, true);
  eq('describir que sigue en prono NO suma una pronación', R.describirNoSuma.length, 0);
  eq('y el evento parte desmarcado', R.eventoDesmarcado, true);
  eq('re-editar conserva la posición', R.reedProno, true);
  eq('re-editar conserva el evento declarado', R.reedEvento, true);
  eq('re-editar conserva la hora', R.reedHora, '19:00');
  eq('re-editar conserva el resto del posicionamiento', R.reedSed, true);
  eq('re-editar conserva el texto libre', R.reedLibre, 'almohadas bajo tórax');
  eq('re-editar NO duplica ni pierde el procedimiento', R.reedProcs.join('|'), 'PRONO 19:00 HRS');
  eq('quitar la posición apaga el evento', R.apagaEvento, true);
  eq('supinar limpia el prono y su evento', R.supinoLimpiaProno, true);

  if (errs.length) { console.log('❌ errores JS:', errs.join(' | ')); fails.push('errores JS'); }
  else console.log('\nsin errores JS');
  await b.close();

  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
