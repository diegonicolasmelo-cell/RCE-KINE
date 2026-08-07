// panel_ux.js — Guardia del panel v5.25 (versión de PRUEBA de Diego):
//   1. Riel de secciones: se arma desde las .fcard visibles, marca ✓ las que
//      tienen datos, salta a la sección al tocar y NO agrega obligaciones.
//   2. #gFalta anuncia firma/vía aérea ANTES de apretar Guardar.
//   3. Reintento automático del guardado: si el primer intento falla, se
//      reintenta UNA vez a los ~3 s; si el segundo funciona, la evolución
//      queda guardada sin intervención del usuario.
//   4. El enlace «Abrir histórico» aparece en el detalle del archivado SOLO
//      cuando el año del egreso está cerrado (GET_HISTORICOS) y el episodio
//      ya no tiene evoluciones en la planilla de trabajo.
// Uso: node build/checks/panel_ux.js
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window._GUARDAR_INTENTOS = 0;
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler(failF) { return {
      api(a, d) {
        if (a === 'GUARDAR_EVOLUCION') {
          window._GUARDAR_INTENTOS++;
          // Primer intento: la red "parpadea". Segundo: funciona.
          if (window._GUARDAR_INTENTOS === 1) { setTimeout(() => failF(new Error('timeout de red')), 5); return; }
          setTimeout(() => okF({ ok: true, data: { TEXTO_GENERADO: 'TEXTO OK' } }), 5);
          return;
        }
        if (a === 'GET_HISTORICOS') { setTimeout(() => okF({ ok: true, data: { 2026: 'https://docs.google.com/spreadsheets/d/HIST2026' } }), 5); return; }
        if (a === 'GET_HISTORIAL_PACIENTE') { setTimeout(() => okF({ ok: true, data: { hitos: [], evoluciones: [] } }), 5); return; }
        if (a === 'GET_ARCHIVADOS') { setTimeout(() => okF({ ok: true, data: [] }), 5); return; }
        setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5);
      }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  /* ── 1 · Riel de secciones ── */
  const R1 = await p.evaluate(() => {
    const r = {};
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    $('ovl').classList.add('on'); $('sp').classList.add('on');   // panel visible
    rielRender();
    const items = document.querySelectorAll('#spRiel .riel-i');
    r.hayRiel = items.length >= 8;
    r.faltaInicial = $('gFalta').textContent;
    r.ningunaVerde = document.querySelectorAll('#spRiel .riel-st.ok').length === 0
      || document.querySelectorAll('#spRiel .riel-st.ok').length < items.length; // el form recién reseteado no está "todo verde"
    // Datos en una sección → su punto se pone verde
    $('fVA').value = 'TOT'; cascadeVA(); $('fTOTn').value = '8.0';
    rielRender();
    r.verdesConDatos = document.querySelectorAll('#spRiel .riel-st.ok').length > 0;
    r.faltaSoloFirma = $('gFalta').textContent;
    // Con TOT la PVE pasó a ser obligatoria de declarar (ago-2026): se contesta
    // «no» y, con la firma puesta, el aviso desaparece
    $('fPVEval').value = 'no';
    $('fFirma').innerHTML = '<option value="Diego Melo">Diego Melo</option>';
    $('fFirma').value = 'Diego Melo';
    rielRender();
    r.faltaVacio = $('gFalta').textContent;
    // Saltar a una sección no revienta
    try { rielIr(2); r.saltaOk = true; } catch (e) { r.saltaOk = false; }
    return r;
  });
  console.log('── Riel de secciones ──');
  eq('el riel lista las secciones del formulario', R1.hayRiel, true);
  eq('al abrir en blanco anuncia lo obligatorio', R1.faltaInicial, 'Falta: firma y vía aérea');
  eq('sin datos no está todo verde', R1.ningunaVerde, true);
  eq('una sección con datos se marca ✓', R1.verdesConDatos, true);
  // Con el paciente en TOT la PVE es obligatoria de declarar (ago-2026)
  eq('con vía aérea quedan la firma y la PVE', R1.faltaSoloFirma, 'Falta: firma y PVE sí/no');
  eq('con firma y PVE declarada el aviso desaparece', R1.faltaVacio, '');
  eq('tocar un ítem salta sin error', R1.saltaOk, true);

  /* ── 2 · Reintento automático del guardado ── */
  const R2 = await p.evaluate(async () => {
    const r = {};
    // El formulario quedó válido (firma + vía aérea) del paso anterior
    guardar();
    await new Promise(res => setTimeout(res, 400));
    r.intentosTras1 = window._GUARDAR_INTENTOS;          // primer intento ya falló
    r.botonReintentando = $('btnGuardar').textContent;
    await new Promise(res => setTimeout(res, 3400));      // pasa la espera de 3 s
    r.intentosTras2 = window._GUARDAR_INTENTOS;
    r.botonFinal = $('btnGuardar').textContent;
    r.textoServidor = $('rtxt').value;
    return r;
  });
  console.log('\n── Reintento automático ──');
  eq('el primer intento salió (y falló)', R2.intentosTras1, 1);
  eq('el botón avisa que reintenta', R2.botonReintentando, '⏳ Reintentando…');
  eq('a los 3 s sale el segundo intento', R2.intentosTras2, 2);
  eq('…y queda guardado', R2.botonFinal, '✅ Guardado');
  eq('el texto confirmado por el servidor quedó en pantalla', R2.textoServidor, 'TEXTO OK');

  /* ── 3 · Enlace al histórico en el archivado de año cerrado ── */
  const R3 = await p.evaluate(async () => {
    const r = {};
    ARC_HIST = { 2026: 'https://docs.google.com/spreadsheets/d/HIST2026' };
    ARC_VIEW = [
      { nombre: 'Cerrado 2026', cod: 'C1', cama: '4', patientId: 'p1', fEgreso: '2026-11-10' },
      { nombre: 'Año sin cierre', cod: 'C2', cama: '5', patientId: 'p2', fEgreso: '2027-02-01' },
    ];
    arcDetalle(0);
    await new Promise(res => setTimeout(res, 300));
    r.banner2026 = $('arcEvos').innerHTML.indexOf('Histórico 2026') !== -1;
    r.enlace = $('arcEvos').innerHTML.indexOf('HIST2026') !== -1;
    arcCerrar();
    arcDetalle(1);
    await new Promise(res => setTimeout(res, 300));
    r.sinBanner2027 = $('arcEvos').textContent.indexOf('Sin evoluciones registradas') !== -1;
    arcCerrar();
    return r;
  });
  console.log('\n── Enlace al histórico ──');
  eq('episodio de año cerrado: banner con el histórico', R3.banner2026, true);
  eq('…con el enlace a la planilla', R3.enlace, true);
  eq('año sin cierre: mensaje normal, sin enlace', R3.sinBanner2027, true);

  eq('sin errores de página', errs.length ? errs[0] : 0, 0);
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
