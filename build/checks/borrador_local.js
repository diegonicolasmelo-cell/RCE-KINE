// borrador_local.js — PRD «que no quede ninguna evolución sin guardar», O7.
//
// Cerrar conservando escribe un borrador local con la llave
// CAMA_<idCama>_<turnoKey>; reabrir esa cama en el MISMO turno lo restaura con
// su franja y hora; un guardado exitoso lo borra; el de un turno que ya pasó se
// limpia y no se ofrece nunca. 🔴 Y el borrador NO contiene nombre ni RUT: el
// PC de la unidad es compartido (Ley 19.628). Se prueba con un paciente
// sembrado de nombre y RUT conocidos (datos SINTÉTICOS).
//
// Uso: node build/checks/borrador_local.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');
const IDX = path.resolve(__dirname, '..', '..', 'v2', 'index.html');

(async () => {
  const fails = [];
  const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!ok) fails.push(l); };

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : []) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + IDX);
  await p.waitForTimeout(500);

  /* ── 1 · La llave tiene la forma de idEvolucion y guarda lo escrito ── */
  const guardado = await p.evaluate(() => {
    localStorage.clear();
    $('sp').classList.add('on'); $('cBed').value = '6';
    // Paciente SEMBRADO (datos sintéticos) para la prueba de privacidad
    $('fNombre').value = 'PACIENTE DE PRUEBA SINTETICO';
    $('fRut').value = '11.111.111-1';
    $('fEdad').value = '66'; $('fDx').value = 'Shock séptico';
    $('fPlanes').value = 'KTR: sedente + KTM asistida'; $('fNota').value = 'tolera bien';
    PROCS = ['Aspiración de secreciones']; FASES_SEL = new Set(['Destete']);
    _formDirty = true;
    const okEscrito = _borradorGuardar();
    const llaves = Object.keys(localStorage);
    const esperada = 'CAMA_6_' + ((v('gDate') || hoy()) + '-' + SHIFT);
    const crudo = localStorage.getItem(esperada) || '';
    return { okEscrito, n: llaves.length, llave: llaves[0], esperada, crudo };
  });
  eq('cerrar conservando escribe UNA llave', guardado.n, 1);
  eq('…con la forma CAMA_<idCama>_<turnoKey>', guardado.llave, guardado.esperada);

  /* ── 2 · Privacidad: ni nombre, ni RUT, ni edad, ni diagnóstico libre ── */
  eq('el borrador NO lleva el nombre del paciente', /PACIENTE DE PRUEBA SINTETICO/.test(guardado.crudo), false);
  eq('el borrador NO lleva RUT (ningún patrón de RUT)', /\d{1,2}\.\d{3}\.\d{3}-[\dkK]/.test(guardado.crudo), false);
  eq('…tampoco el RUT sin puntos', /\b\d{7,8}-[\dkK]\b/.test(guardado.crudo), false);
  eq('el borrador NO lleva el diagnóstico libre', /Shock séptico/.test(guardado.crudo), false);
  eq('…pero SÍ lleva los datos clínicos del turno', /KTR: sedente/.test(guardado.crudo), true);

  /* ── 3 · Reabrir esa cama en el MISMO turno lo restaura, con franja y hora ── */
  const vuelta = await p.evaluate(() => {
    // El formulario se limpia como si se hubiera reabierto la cama
    $('fPlanes').value = ''; $('fNota').value = ''; PROCS = []; FASES_SEL = new Set();
    _formDirty = false; _estadoGuardado(null);
    const ok = _borradorRestaurar('6');
    const e = $('gEstadoGuardado');
    return {
      ok, planes: $('fPlanes').value, nota: $('fNota').value,
      procs: (PROCS || []).join(','), fases: [...FASES_SEL].join(','),
      dirty: _formDirty, estado: e.dataset.estado, texto: e.textContent.trim(),
    };
  });
  eq('reabrir en el mismo turno restaura el borrador', vuelta.ok, true);
  eq('…el texto vuelve donde quedó', vuelta.planes, 'KTR: sedente + KTM asistida');
  eq('…la nota del turno también', vuelta.nota, 'tolera bien');
  eq('…los procedimientos marcados vuelven', vuelta.procs, 'Aspiración de secreciones');
  eq('…y los selects/fases también', vuelta.fases, 'Destete');
  eq('sigue siendo trabajo SIN guardar (_formDirty en true)', vuelta.dirty, true);
  eq('…con la franja de recuperación y su hora', /^📝 Borrador sin guardar recuperado \d{2}:\d{2}/.test(vuelta.texto), true);
  eq('…en estado «borrador»', vuelta.estado, 'borrador');

  /* ── 4 · Un guardado con éxito lo mata ── */
  const trasGuardar = await p.evaluate(async () => {
    const f = $('fFirma'); f.innerHTML = '<option value="KIN">KIN</option>'; f.value = 'KIN';
    const va = $('fVA'); va.value = [...va.options].map(o => o.value).filter(Boolean)[0];
    window.toast = () => {}; window.gs = (a, d, ok) => ok([]);
    window.api = () => Promise.resolve({ TEXTO_GENERADO: 'ok' });
    guardar();
    await new Promise(r => setTimeout(r, 300));
    return { llaves: Object.keys(localStorage).filter(k => /^CAMA_6_/.test(k)).length, ofrece: _borradorRestaurar('6') };
  });
  eq('guardar con éxito descarta el borrador de esa cama y turno', trasGuardar.llaves, 0);
  eq('…y reabrir ya no lo ofrece', trasGuardar.ofrece, false);

  /* ── 5 · El borrador de un turno que ya pasó se limpia y no se ofrece ── */
  const viejo = await p.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('CAMA_9_2001-01-01-Noche', JSON.stringify({ v: 1, hora: '03:10', campos: { fPlanes: 'de otro turno' } }));
    localStorage.setItem('otra_cosa_que_no_es_borrador', 'x');
    const borrados = _borradoresPurgar();
    return {
      borrados,
      queda: !!localStorage.getItem('CAMA_9_2001-01-01-Noche'),
      ajena: !!localStorage.getItem('otra_cosa_que_no_es_borrador'),
    };
  });
  eq('el borrador de un turnoKey viejo se limpia al arrancar', viejo.borrados, 1);
  eq('…y ya no está', viejo.queda, false);
  eq('la purga no toca llaves ajenas', viejo.ajena, true);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ borrador_local OK');
  process.exit(fails.length ? 1 : 0);
})();
