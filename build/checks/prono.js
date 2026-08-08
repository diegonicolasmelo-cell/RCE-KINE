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
  // Ola 4: los hitos del guardado ya no pasan uno a uno por
  // _agregarHitoInternoSinSync — nacen juntos y viajan juntos en un lote.
  global.repoLeerTodosConFila = () => [];
  global.repoEliminarFilas = () => 0;
  global.repoInsertarVarios = (h, os) => { (os || []).forEach(o => HITOS.push(o.TEXTO)); return (os || []).length; };
  global.ahoraTS = () => '2026-08-01 12:00:00';
  global._agregarHitoInternoSinSync = h => HITOS.push(h.texto);
  global._sincronizarTimelineCama = () => {};
  global.Utilities = { getUuid: () => 'u' };
  (0, eval)(src);

  _timelineDelGuardado('4', '2026-08-01', 'Dia',
    ['PRONO 19:00 HRS', 'SUPINACIÓN 07:30 HRS', 'RCP 3 CICLOS', 'INTUBACIÓN'], 'MJ', '', 'pidX', []);
  eq('la pronación CON hora genera su hito', HITOS.indexOf('Decúbito prono') > -1, true);
  eq('la supinación con hora también', HITOS.indexOf('Decúbito supino') > -1, true);
  eq('el RCP con n° de ciclos también', HITOS.indexOf('Reanimación cardiopulmonar (RCP)') > -1, true);
  eq('y lo que ya funcionaba sigue igual', HITOS.indexOf('Intubación orotraqueal') > -1, true);
  eq('la clave ignora la hora pegada', _procClaveHito('PRONO 19:00 HRS'), 'PRONO');
  eq('y traduce SUPINACIÓN al hito SUPINO', _procClaveHito('SUPINACIÓN 07:30 HRS'), 'SUPINO');

  // ── Parte 1b · Ciclo de prono con FECHA REAL (puede durar varios días) ───
  const srcF = fs.readFileSync(path.join(V2, 'infra_fechas.gs'), 'utf8');
  global.Utilities = { getUuid: () => 'u', formatDate: (d) => d.toISOString().slice(0, 10) };
  global._tz = () => 'UTC';
  (0, eval)(srcF);

  eq('turno Día: la hora es del día del turno', _tsEventoTurno('2026-08-01', 'Dia', '19:00'), '2026-08-01 19:00');
  eq('turno Noche 22:00 sigue siendo del día del turno', _tsEventoTurno('2026-07-31', 'Noche', '22:00'), '2026-07-31 22:00');
  eq('turno Noche 03:00 ya es del día siguiente', _tsEventoTurno('2026-07-31', 'Noche', '03:00'), '2026-08-01 03:00');
  eq('sin hora cae a la referencia del turno', _tsEventoTurno('2026-08-01', 'Noche', ''), '2026-08-02 03:00');
  // el caso de Diego: prono el 1-ago 19:00, supino el 3-ago 07:30 → 36,5 h (día completo + 12,5)
  eq('el ciclo cruza varios días', _horasEntreTS('2026-08-01 19:00', '2026-08-03 07:30'), 36.5);
  eq('cruzar la medianoche sin días de por medio', _horasEntreTS('2026-08-01 19:00', '2026-08-02 07:30'), 12.5);
  eq('una supinación anterior al prono no inventa horas', _horasEntreTS('2026-08-02 19:00', '2026-08-01 07:30'), '');
  eq('sin marca de inicio no hay cuenta', _horasEntreTS('', '2026-08-02 07:30'), '');

  // Cierre del ciclo en el guardado, con la pronación de OTRO turno y OTRO colega
  const FILAS = [
    { ID_CAMA: '4', TURNO_KEY: '2026-08-01-Dia', RESP_POS_PRONO: true, RESP_PRONO_EVENTO: true, PRONO_INICIO_TS: '2026-08-01 19:00' },
    { ID_CAMA: '4', TURNO_KEY: '2026-08-01-Noche', RESP_POS_PRONO: true },   // solo describe
    { ID_CAMA: '4', TURNO_KEY: '2026-08-02-Dia', RESP_POS_PRONO: true },     // solo describe
  ];
  global.repoLeerTodos = (h, col, val2) => (h === 'EVOLUCIONES' ? FILAS.filter(f => !col || String(f[col]) === String(val2)) : []);
  const srcE = fs.readFileSync(path.join(V2, 'svc_evoluciones.gs'), 'utf8');
  const cuerpo = srcE.slice(srcE.indexOf('// ── Ciclo de prono'));
  (0, eval)(cuerpo);

  eq('encuentra la pronación abierta de otro turno', _pronoAbiertoTS('4', '2026-08-03-Dia'), '2026-08-01 19:00');
  const d1 = { RESP_POS_SUPINO: true, RESP_SUPINO_EVENTO: true, RESP_SUPINO_HORA: '07:30' };
  _pronoSellarCiclo('4', '2026-08-03-Dia', '2026-08-03', 'Dia', d1);
  eq('cierra el ciclo de 36,5 h aunque supine otro colega', d1.PRONO_HORAS, 36.5);
  eq('y sella el momento de la supinación', d1.SUPINO_TS, '2026-08-03 07:30');
  // ya supinado: una supinación posterior no reabre la cuenta
  FILAS.push({ ID_CAMA: '4', TURNO_KEY: '2026-08-03-Dia', RESP_SUPINO_EVENTO: true });
  eq('tras supinar no queda pronación abierta', _pronoAbiertoTS('4', '2026-08-04-Dia'), '');
  const d2 = { RESP_POS_SUPINO: true, RESP_SUPINO_EVENTO: true, RESP_SUPINO_HORA: '10:00' };
  _pronoSellarCiclo('4', '2026-08-04-Dia', '2026-08-04', 'Dia', d2);
  eq('sin pronación abierta no se inventan horas', d2.PRONO_HORAS, '');
  // pronar y supinar en el mismo turno
  const d3 = { RESP_PRONO_EVENTO: true, RESP_PRONO_HORA: '08:00',
               RESP_SUPINO_EVENTO: true, RESP_SUPINO_HORA: '20:00' };
  _pronoSellarCiclo('4', '2026-08-05-Dia', '2026-08-05', 'Dia', d3);
  eq('prono y supino en el mismo turno cuentan bien', d3.PRONO_HORAS, 12);
  // describir la posición NO abre ciclo
  const d4 = { RESP_POS_PRONO: true };
  _pronoSellarCiclo('4', '2026-08-06-Dia', '2026-08-06', 'Dia', d4);
  eq('describir la posición no sella ningún momento', d4.PRONO_INICIO_TS === undefined, true);

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

    // El texto narra el cierre del ciclo con la pronación abierta del episodio
    abrirPanel('4');
    SHIFT = 'Dia'; $('gDate').value = '2026-08-03';
    window._pronoAbierto = '2026-08-01 19:00';
    $('cSupino').checked = true; hPosEspecial('supino');
    $('fSupinoHora').value = '07:30'; $('cSupinoEv').checked = true;
    r.horasCliente = _pronoHorasCiclo();
    r.txtSupino = (genTexto() || '').split('\n').filter(l => /supina/i.test(l)).join(' ');
    // sin pronación abierta el texto no inventa horas
    window._pronoAbierto = '';
    r.txtSinCiclo = (genTexto() || '').split('\n').filter(l => /supina/i.test(l)).join(' ');
    // turno Noche: la madrugada pertenece al día siguiente
    SHIFT = 'Noche'; $('gDate').value = '2026-08-02';
    window._pronoAbierto = '2026-08-01 19:00';
    $('fSupinoHora').value = '03:00';
    r.horasNoche = _pronoHorasCiclo();
    SHIFT = 'Dia';
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
  eq('el cliente cuenta el mismo ciclo que el servidor', R.horasCliente, 36.5);
  eq('el texto narra las horas en prono', /tras 36,5 h en prono/.test(R.txtSupino), true);
  eq('sin ciclo abierto el texto no inventa horas', /en prono/.test(R.txtSinCiclo), false);
  eq('de noche la madrugada cuenta al día siguiente', R.horasNoche, 32);

  if (errs.length) { console.log('❌ errores JS:', errs.join(' | ')); fails.push('errores JS'); }
  else console.log('\nsin errores JS');
  await b.close();

  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
