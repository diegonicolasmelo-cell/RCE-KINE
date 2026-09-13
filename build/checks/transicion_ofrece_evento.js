// transicion_ofrece_evento.js — PRD «que no quede ninguna evolución sin guardar», O5 (tanda 4).
//
// `_avisosTransicion()` ya detectaba que el estado de vía aérea cambió sin que
// nadie anotara el evento, y ahí moría: informaba. Lo que esta guardia vigila
// es la ACCIÓN — que cada discordancia de la tabla del PRD §5 llegue con una
// salida, y que la salida sea la correcta para ese evento.
//
// 🔴 Mide la PROPIEDAD, no la lista de textos que se vieron en pantalla:
//   · toda transición detectada trae acción (anotar u orientar), ninguna queda muda;
//   · anotar deja el evento como si lo hubiera marcado el kine (casilla + hora
//     real) y el aviso se apaga solo;
//   · los tres eventos que NO se autocompletan siguen sin autocompletarse —
//     porque marcarlos por cuenta propia escondería un dato verdadero;
//   · rechazar la oferta NO impide guardar (el aviso nunca fue un candado),
//     aunque desde la v7 cuesta un motivo escrito cuando cambió la vía aérea;
//   · ni nombre ni RUT salen en el aviso.
//
// Uso: node build/checks/transicion_ofrece_evento.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');
const IDX = path.resolve(__dirname, '..', '..', 'v2', 'index.html');

// Paciente SINTÉTICO. El RUT 11.111.111-1 es el de las demás guardias.
const NOMBRE_SEMILLA = 'ZZPRUEBA SINTETICA SEMILLA';
const RUT_SEMILLA = '11.111.111-1';

(async () => {
  const fails = [];
  const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!ok) fails.push(l); };

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window.__guardados = [];
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) { if (a === 'GUARDAR_EVOLUCION') window.__guardados.push(d);
        setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : []) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + IDX);
  await p.waitForTimeout(500);

  // Escenario base: turno DÍA del 2026-09-10, reloj fijado a las 18:00.
  await p.addInitScript(() => {});
  const preparar = async (iniVA, iniSop, va, sop) => p.evaluate(([iniVA, iniSop, va, sop, nom, rut]) => {
    SHIFT = 'Dia';
    $('gDate').value = '2026-09-10';
    $('cIng').value = 'false';
    _iniVA = iniVA; _iniSop = iniSop;
    $('fVA').value = va; $('fSop').value = sop;
    $('fNombre').value = nom; $('fRut').value = rut;
    ['cTqtO', 'cDesvinc', 'cDecanOcurrio', 'cIntubO', 'cReintubT'].forEach(id => { const e = $(id); if (e) e.checked = false; });
    ['fTqtHora', 'fDesvincHora'].forEach(id => { const e = $(id); if (e) e.value = ''; });
    if (typeof PROCS !== 'undefined') PROCS.length = 0;
    _transAvisoOk = false;
    return true;
  }, [iniVA, iniSop, va, sop, NOMBRE_SEMILLA, RUT_SEMILLA]);

  /* ── 1 · Las cinco transiciones de la tabla del PRD §5 se detectan Y traen acción ── */
  const casos = [
    ['TOT→TQT sin traqueostomía',        'TOT', 'VM', 'TQT', 'VM', 'tqt'],
    ['TOT→sin vía aérea sin extubación', 'TOT', 'VM', 'Natural', 'Ambiente', 'ext'],
    ['TQT→sin vía aérea sin decanulación', 'TQT', 'VM', 'Natural', 'Ambiente', 'decan'],
    ['sin vía aérea→TOT sin intubación', 'Natural', 'Ambiente', 'TOT', 'VM', 'intub'],
    ['VM→no VM en TQT sin desvinculación', 'TQT', 'VM', 'TQT', 'Oxigenoterapia/OAF', 'desvinc'],
  ];
  for (const [label, iVA, iSop, va, sop, ev] of casos) {
    await preparar(iVA, iSop, va, sop);
    const r = await p.evaluate(() => {
      const avs = _avisosTransicion();
      _mostrarTransAviso(avs);
      return {
        eventos: avs.map(a => a.ev),
        // La propiedad: TODO aviso de transición ofrece una salida clicable.
        sinAccion: avs.filter(a => a.ev && !document.querySelector(
          `#transAvisoLista [onclick*="'${a.ev}'"]`)).map(a => a.ev),
        html: $('transAvisoLista').innerHTML,
      };
    });
    eq(label + ' → se detecta', r.eventos.includes(ev), true);
    eq(label + ' → trae acción', r.sinAccion.join(','), '');
    eq(label + ' → sin nombre en el aviso', r.html.includes(NOMBRE_SEMILLA), false);
    eq(label + ' → sin RUT en el aviso', /\d{1,2}\.\d{3}\.\d{3}-[\dkK]/.test(r.html), false);
  }

  /* ── 2 · Anotar deja el evento como lo dejaría el kine, y el aviso se apaga ── */
  await preparar('TOT', 'VM', 'TQT', 'VM');
  const tqt = await p.evaluate(() => {
    _mostrarTransAviso(_avisosPreGuardado());
    transOfAbrir('tqt');
    $('trOfHora_tqt').value = '14:30';
    const okReg = transOfRegistrar('tqt', new Date(2026, 8, 10, 18, 0, 0));
    return {
      okReg,
      casilla: !!$('cTqtO').checked,
      hora: $('fTqtHora').value,
      // El espejo: sin él, VENT_SOPORTE_FINAL escribiría 'VM' por defecto.
      sopEspejo: $('poTqtSop').value,
      sucio: _formDirty === true,
      // El aviso resuelto ya no está en la lista repintada.
      quedan: _avisosTransicion().map(a => a.ev).join(','),
      // Y el procedimiento existe: de ahí sale el hito de TIMELINE.
      procs: _autoProcs().join('|'),
    };
  });
  eq('anotar la traqueostomía devuelve true', tqt.okReg, true);
  eq('…marca la casilla del bloque', tqt.casilla, true);
  eq('…con la hora real que escribió la persona', tqt.hora, '14:30');
  eq('…espeja el soporte final (no inventa «VM»)', tqt.sopEspejo, 'VM');
  eq('…deja el formulario sucio', tqt.sucio, true);
  eq('…y el aviso de esa transición desaparece', tqt.quedan.includes('tqt'), false);
  eq('…el procedimiento TQT existe (es lo que genera el hito)', tqt.procs.includes('TQT'), true);

  /* ── 2b · Lo mismo para la desvinculación de VM ── */
  await preparar('TQT', 'VM', 'TQT', 'Oxigenoterapia/OAF');
  const dsv = await p.evaluate(() => {
    _mostrarTransAviso(_avisosPreGuardado());
    transOfAbrir('desvinc');
    $('trOfHora_desvinc').value = '11:15';
    const okReg = transOfRegistrar('desvinc', new Date(2026, 8, 10, 18, 0, 0));
    return { okReg, casilla: !!$('cDesvinc').checked, hora: $('fDesvincHora').value,
             quedan: _avisosTransicion().map(a => a.ev).join(','), procs: _autoProcs().join('|') };
  });
  eq('anotar la desvinculación devuelve true', dsv.okReg, true);
  eq('…marca la casilla y la hora real', dsv.casilla + '/' + dsv.hora, 'true/11:15');
  eq('…el aviso desaparece', dsv.quedan.includes('desvinc'), false);
  eq('…y deja el procedimiento DESVINCULACIÓN', dsv.procs.includes('DESVINCULACI'), true);

  /* ── 3 · Los tres que NO se autocompletan siguen SIN autocompletarse ──
     No es un capricho: marcar la casilla por cuenta propia escondería un dato
     verdadero (una reintubación contada como intubación, un tipo de extubación
     inventado, un aviso de decanulación apagado sin dejar hito). */
  const noAuto = await p.evaluate(() => ({
    modos: ['ext', 'intub', 'decan'].map(k => k + ':' + _TRANS_EVENTOS[k].modo).join(' '),
    conRazon: ['ext', 'intub', 'decan'].every(k => String(_TRANS_EVENTOS[k].razon || '').length > 30),
    registrarNoHace: ['ext', 'intub', 'decan'].map(k => transOfRegistrar(k, new Date())).join(','),
    intubIntacta: !!document.getElementById('cIntubO').checked,
    decanIntacta: !!document.getElementById('cDecanOcurrio').checked,
  }));
  eq('extubación, intubación y decanulación no se autocompletan', noAuto.modos, 'ext:ir intub:ir decan:ir');
  eq('…y cada una dice por escrito por qué', noAuto.conRazon, true);
  eq('…transOfRegistrar se niega a tocarlas', noAuto.registrarNoHace, 'false,false,false');
  eq('…la casilla de intubación sigue sin marcar', noAuto.intubIntacta, false);
  eq('…la de decanulación también', noAuto.decanIntacta, false);

  /* ── 4 · Rechazar la oferta NO impide guardar (el aviso no es un candado) ── */
  await preparar('TOT', 'VM', 'Natural', 'Ambiente');
  const guardaIgual = await p.evaluate(async () => {
    window.__guardados.length = 0;
    $('sp').classList.add('on'); $('cBed').value = '6';
    // La firma es obligatoria y es un <select>: hay que sembrarle la opción.
    const sf = $('fFirma');
    if (sf) { const o = document.createElement('option'); o.value = 'KTST'; o.textContent = 'KTST'; sf.appendChild(o); sf.value = 'KTST'; }
    guardar();                                   // 1.º intento: sale el aviso, no guarda
    await new Promise(r => setTimeout(r, 120));
    const traGuardarBloqueado = window.__guardados.length;
    const abierto = $('transAviso').classList.contains('on');
    // 🪤 Fusión 7.03: este escenario (TOT → Natural sin extubación) es un CAMBIO
    // DE VÍA AÉREA sin evento, y la v7 «episodio y turno» exige ahí un motivo
    // escrito (≥5 letras). El aviso sigue sin ser un candado —se puede guardar
    // sin declarar el evento—, pero ahora cuesta una razón, y esa razón viaja al
    // hito del episodio. Se mide en ese orden: sin motivo no pasa, con motivo sí.
    const boxMotivo = !$('transMotivoBox').classList.contains('hidden');
    $('transMotivo').value = '';
    transAvisoGuardar();
    await new Promise(r => setTimeout(r, 200));
    const sinMotivoNoGuarda = window.__guardados.length === 0 && _transAvisoOk === false;
    $('transMotivo').value = 'llegó ya extubado desde pabellón';
    transAvisoGuardar();                          // se rechaza la oferta y se guarda con motivo
    await new Promise(r => setTimeout(r, 400));
    return { traGuardarBloqueado, abierto, boxMotivo, sinMotivoNoGuarda,
             traRechazo: window.__guardados.length,
             gateAbierto: _transAvisoOk === true,
             motivoViaja: _transMotivo === 'llegó ya extubado desde pabellón',
             cerrado: !$('transAviso').classList.contains('on') };
  });
  eq('el aviso interrumpe el primer guardado', guardaIgual.traGuardarBloqueado, 0);
  eq('…y se ve', guardaIgual.abierto, true);
  eq('…y pide el motivo del cambio de vía aérea (v7)', guardaIgual.boxMotivo, true);
  eq('…sin motivo escrito NO deja guardar', guardaIgual.sinMotivoNoGuarda, true);
  eq('rechazar la oferta abre el paso al guardado', guardaIgual.gateAbierto, true);
  eq('rechazar la oferta guarda igual (con el motivo escrito)', guardaIgual.traRechazo >= 1, true);
  eq('…y el motivo viaja al hito', guardaIgual.motivoViaja, true);
  eq('…y cierra el aviso', guardaIgual.cerrado, true);

  /* ── 5 · La regla vive en UN solo sitio: guardar() y el repintado usan la misma
     lista, así que anotar un evento no borra el aviso de valores heredados ── */
  const unaSolaRegla = await p.evaluate(() => {
    const src = document.documentElement.innerHTML;
    return {
      fabrica: typeof _avisosPreGuardado === 'function',
      // el conteo de heredados se arma en una sola función, no en dos
      vecesHeredados: (src.match(/valores heredados del turno anterior sin revisar/g) || []).length,
    };
  });
  eq('existe una sola fábrica de avisos previos al guardado', unaSolaRegla.fabrica, true);
  eq('…y el texto de heredados está escrito una sola vez', unaSolaRegla.vecesHeredados, 1);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ transicion_ofrece_evento OK');
  process.exit(fails.length ? 1 : 0);
})();
