// neuro_dve_pic.js — LOS DISPOSITIVOS DE NEUROMONITOREO MANDAN SOBRE SUS CAMPOS,
// Y LA TARJETA APARECE TAMBIÉN CON LA FASE «NEUROPROTECCIÓN».
//
// 🔴 DE DÓNDE SALE (22-ago-2026, pedido de Manuel): la tarjeta 🧠 Neurología
// tenía PIC y PPC sueltas, sin decir con qué se están midiendo, y no había
// dónde registrar la DVE ni su altura — que es el dato que decide si el
// paciente se puede movilizar y a qué presión está drenando. Ahora la DVE abre
// su altura y el captor de PIC abre PIC y PPC EN CONJUNTO: sin captor no hay
// PIC que anotar. Decisión de Manuel: PIC/PPC dependen SOLO del captor (no de
// una DVE transducida), y la DVE registra solo la altura (sin pinzada/débito).
//
// 🔴 LO QUE ESTA GUARDIA VIGILA DE VERDAD — EL DATO QUE PODRÍA DESAPARECER:
// esconder un campo detrás de una casilla nueva es exactamente el movimiento
// que borra datos viejos en silencio. Las evoluciones anteriores a la 5.72
// tienen PIC guardada y la columna del captor VACÍA: si al cargarlas se
// ocultaran y limpiaran, un re-guardado escribiría el vacío encima de una PIC
// real. Por eso `hNeuroDisp(false)` (carga) muestra lo que tiene valor aunque
// su casilla venga apagada, y solo `hNeuroDisp(true)` (clic del colega) limpia.
// Es la misma familia del rescate de la FiO₂ de la Venturi (5.71).
//
// Uso: node build/checks/neuro_dve_pic.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const v2 = path.resolve(__dirname, '..', '..', 'v2');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window._ll = [];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) { window._ll.push({ a, d }); setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2, 'index.html'));
  await p.waitForTimeout(500);

  // 🪤 Puente tolerante: contra el código viejo no existen ni los campos nuevos
  // ni hNeuroDisp(). Sin esto el arnés revienta en la sección 2 y las de NO
  // REGRESIÓN (que deben salir VERDES en el base) nunca llegan a correr.
  await p.evaluate(() => {
    window.__chk = (id, v) => { const e = document.getElementById(id); if (e) e.checked = !!v; };
    window.__set = (id, v) => { const e = document.getElementById(id); if (e) e.value = String(v); };
    window.__val = id => { const e = document.getElementById(id); return e ? e.value : '(sin campo)'; };
    window.__H = x => { if (typeof hNeuroDisp === 'function') hNeuroDisp(x); };
  });

  const fails = [];
  const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
  const si = (l, c) => eq(l, !!c, true);
  const oculto = id => p.evaluate(i => { const e = document.getElementById(i); return !e || e.classList.contains('hidden'); }, id);

  /* ══ 1 · LA TARJETA APARECE POR FASE, SIN PERDER EL DISPARADOR VIEJO ══ */
  console.log('1 · Cuándo se ve la tarjeta 🧠 Neurología');
  const T = await p.evaluate(() => {
    const estado = () => document.getElementById('fcNeuro').classList.contains('hidden');
    $('fDx').value = 'NAC grave'; FASES_SEL = new Set(); aplicarGatesNeuro();
    const sinNada = estado();
    FASES_SEL = new Set(['Neuroprotección']); aplicarGatesNeuro();
    const conFase = estado();
    FASES_SEL = new Set(); $('fDx').value = 'TEC grave'; aplicarGatesNeuro();
    const conDx = estado();
    $('fDx').value = 'HSA Fisher IV'; FASES_SEL = new Set(['Protección pulmonar']); aplicarGatesNeuro();
    const conDxYOtraFase = estado();
    return { sinNada, conFase, conDx, conDxYOtraFase };
  });
  si('sin Dx neuro ni fase, la tarjeta NO se ve', T.sinNada);
  si('con la fase «Neuroprotección» aparece', !T.conFase);
  si('con Dx neuro sigue apareciendo como siempre (no regresión)', !T.conDx);
  si('…y con Dx neuro aunque la fase sea otra', !T.conDxYOtraFase);

  /* ══ 2 · LOS DISPOSITIVOS ABREN Y CIERRAN SUS CAMPOS ══════════════════ */
  console.log('\n2 · DVE ↔ altura · captor ↔ PIC y PPC');
  await p.evaluate(() => { $('fDx').value = 'TEC grave'; FASES_SEL = new Set(); aplicarGatesNeuro();
    __chk('cDVE', false); __chk('cPICcaptor', false); __H(); });
  si('sin DVE no se pide la altura', await oculto('gDVEalt'));
  si('sin captor no se pide la PIC', await oculto('gPIC'));
  si('…ni la PPC', await oculto('gPPC'));

  await p.evaluate(() => { __chk('cDVE', true); __H(); });
  si('con DVE aparece la altura', !(await oculto('gDVEalt')));
  si('…y la PIC sigue cerrada: la DVE no la habilita (decisión de Manuel)', await oculto('gPIC'));

  await p.evaluate(() => { __chk('cPICcaptor', true); __H(); });
  si('con captor aparece la PIC', !(await oculto('gPIC')));
  si('…y la PPC con ella, en conjunto', !(await oculto('gPPC')));

  /* ══ 3 · AL DESMARCAR SE LIMPIA (si no, el valor viaja escondido) ══════ */
  console.log('\n3 · Desmarcar limpia lo que ya no aplica');
  const D = await p.evaluate(() => {
    __set('fDVEalt', '15'); __set('fPIC', '12'); __set('fPPC', '70');
    __chk('cPICcaptor', false); __H();
    const trasCaptor = { pic: __val('fPIC'), ppc: __val('fPPC'), alt: __val('fDVEalt') };
    __chk('cDVE', false); __H();
    return { trasCaptor, alt: __val('fDVEalt') };
  });
  eq('al quitar el captor se vacía la PIC', D.trasCaptor.pic, '');
  eq('…y la PPC', D.trasCaptor.ppc, '');
  eq('pero NO la altura de la DVE, que es de otro dispositivo', D.trasCaptor.alt, '15');
  eq('al quitar la DVE se vacía su altura', D.alt, '');

  /* ══ 4 · EL DATO VIEJO NO DESAPARECE (lo que de verdad importa) ═══════ */
  console.log('\n4 · Una evolución anterior a la 5.72 conserva su PIC');
  const V = await p.evaluate(() => {
    // Evolución guardada ANTES de este cambio: PIC/PPC con valor y las columnas
    // de los dispositivos vacías. Es la ruta real: chk + set y luego hNeuroDisp(false).
    const chk = (id, val) => { const e = document.getElementById(id); if (e) e.checked = (val === true || val === 'TRUE'); };
    const set = (id, val) => { const e = document.getElementById(id); if (e && val !== undefined && val !== '') e.value = String(val); };
    __chk('cDVE', false); __chk('cPICcaptor', false);
    __set('fPIC', ''); __set('fPPC', ''); __set('fDVEalt', '');
    const s = { HEMO_PIC: 14, HEMO_PPC: 68, NEURO_DVE: '', NEURO_DVE_ALTURA: '', NEURO_PIC_CAPTOR: '' };
    set('fPIC', s.HEMO_PIC); set('fPPC', s.HEMO_PPC);
    chk('cDVE', s.NEURO_DVE); set('fDVEalt', s.NEURO_DVE_ALTURA); chk('cPICcaptor', s.NEURO_PIC_CAPTOR);
    __H(false);
    const gp = document.getElementById('gPIC');
    return { pic: __val('fPIC'), ppc: __val('fPPC'),
             // sin la casilla nueva, el campo estaba siempre a la vista: eso es
             // justamente lo que NO puede empeorar
             picVisible: gp ? !gp.classList.contains('hidden') : !!document.getElementById('fPIC'),
             captor: !!document.getElementById('cPICcaptor')?.checked };
  });
  eq('la PIC guardada sigue ahí', V.pic, '14');
  eq('…y la PPC', V.ppc, '68');
  si('…y se VEN, aunque la casilla del captor venga vacía', V.picVisible);
  si('sin inventar que había captor (no se marca solo)', V.captor === false);

  /* ══ 5 · EL DATO NUEVO LLEGA AL SERVIDOR ══════════════════════════════ */
  console.log('\n5 · Lo registrado viaja al guardado');
  const G = await p.evaluate(async () => {
    $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    const opt = document.createElement('option'); opt.value = 'Klgo. Test'; opt.textContent = 'Klgo. Test';
    $('fFirma').appendChild(opt); $('fFirma').value = 'Klgo. Test';
    $('fVA').value = 'Natural'; $('fDx').value = 'HSA'; aplicarGatesNeuro();
    __chk('cDVE', true); __chk('cPICcaptor', true); __H();
    __set('fDVEalt', '15'); __set('fPIC', '12'); __set('fPPC', '70');
    _transAvisoOk = true; window._ll.length = 0; guardar();
    await new Promise(r => setTimeout(r, 80));
    const c = _ll.find(x => x.a === 'GUARDAR_EVOLUCION');
    return c ? { dve: c.d.NEURO_DVE, alt: c.d.NEURO_DVE_ALTURA, cap: c.d.NEURO_PIC_CAPTOR, pic: c.d.HEMO_PIC } : {};
  });
  eq('NEURO_DVE viaja', G.dve, 'true');
  eq('NEURO_DVE_ALTURA viaja', G.alt, '15');
  eq('NEURO_PIC_CAPTOR viaja', G.cap, 'true');
  eq('y la PIC sigue viajando como siempre', G.pic, '12');

  /* ══ 6 · EL TEXTO CLÍNICO LO NARRA, Y EN LOS DOS LADOS IGUAL ══════════ */
  console.log('\n6 · La evolución lo cuenta (cliente y servidor en paridad)');
  const TXT = await p.evaluate(() => {
    __chk('cDVE', true); __set('fDVEalt', '15'); __H();
    return String(genTexto() || '');   // la función real que arma la evolución
  });
  si('el cliente escribe la DVE con su altura',
    /Derivaci[oó]n ventricular externa \(DVE\) a 15 cmH2O/.test(TXT));

  // Servidor: mismo texto desde dominio_texto.gs, con los helpers reales.
  const src = fs.readFileSync(path.join(v2, 'dominio_texto.gs'), 'utf8');
  const mCli = /Derivación ventricular externa \(DVE\)/.test(fs.readFileSync(path.join(v2, 'index.html'), 'utf8'));
  const mSrv = /Derivación ventricular externa \(DVE\)/.test(src);
  si('el servidor usa exactamente la misma frase que el cliente', mCli && mSrv);
  si('el servidor la condiciona a NEURO_DVE', /esVerdadero\(d\.NEURO_DVE\)/.test(src));
  si('…y lee la altura de su columna', /vn\('NEURO_DVE_ALTURA'\)/.test(src));

  /* ══ 7 · EL ESQUEMA DECLARA LAS TRES COLUMNAS, AL FINAL ═══════════════ */
  console.log('\n7 · Esquema: columnas nuevas al final y total al día');
  const esq = fs.readFileSync(path.join(v2, 'esquema.gs'), 'utf8');
  const evo = esq.slice(esq.indexOf('const _COLS_EVOLUCIONES'), esq.indexOf('const ESQUEMA'));
  ['NEURO_DVE', 'NEURO_DVE_ALTURA', 'NEURO_PIC_CAPTOR'].forEach(c => {
    si(`${c} declarada`, new RegExp(`\\['${c}'`).test(evo));
  });
  const iSed = evo.indexOf("'SED_FARMACOS'"), iNeu = evo.indexOf("'NEURO_DVE'");
  si('van al FINAL de la lista (insertarlas al medio desalinea la hoja)', iNeu > iSed && iSed !== -1);
  // v5.97 sumó ANOTACIONES_JSON ⇒ 394. Esta guardia acompaña al total.
  si('el total escrito a mano de testEsquema subió a 394',
    /TOTAL_COLS\.EVOLUCIONES !== 394/.test(esq));

  eq('sin errores JS', errs.join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} fallos: ${fails.join(' · ')}` : '\n✅ Todo OK');
  process.exit(fails.length ? 1 : 0);
})();
