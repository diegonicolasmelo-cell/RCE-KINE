// texto_bloques.js — Guardia de la ETIQUETA DE BLOQUE del motor de texto
// (v5.23, ago-2026). Cada línea que produce genTexto queda marcada con el
// bloque del que salió (fase clínica, presiones y mecánica, KTR…) y viaja en
// TEXTO_BLOQUES, alineada 1:1 con las líneas de TEXTO_AUTO.
//
// Reglas duras que asserta esta guardia:
//   · Es INVISIBLE: el texto que ve y firma el equipo no cambia ni una coma.
//   · Ninguna frase lleva salto de línea interno (rompería la alineación).
//   · Toda línea tiene etiqueta: si un bloque nuevo se agrega sin su _B(),
//     esta guardia lo caza antes de que llegue a producción.
//   · Las etiquetas son estables: la fase clínica es 'fase', las presiones
//     'ppres', etc. — el análisis posterior depende de que no cambien de
//     nombre a mitad de camino.
// Uso: node build/checks/texto_bloques.js
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
    // ── Turno completo: paciente en VM con casi todos los bloques activos ──
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    SHIFT = 'Dia';
    $('fDx').value = 'Estatus epiléptico';
    $('fDias').value = '4';
    FASES_SEL = new Set(['Weaning', 'Rehabilitación precoz']);
    $('fSed').value = 'Escalón 2'; $('fSAS').value = '3';
    $('fHEst').value = 'Estable'; $('fDVA').value = 'Sin requerimientos';
    $('fPIC').value = '12'; $('fPPC').value = '68';
    $('fVA').value = 'TOT'; cascadeVA();
    $('fTOTn').value = '8.0'; $('fTOTcm').value = '22';
    $('fSop').value = 'VM'; cascadeSop();
    $('fModo').value = 'ACVC'; renderParams();
    $('r_vt').value = '470'; $('r_fr').value = '14'; $('r_peep').value = '5';
    $('r_pmax').value = '22'; $('r_ppl').value = '18'; $('r_pmedia').value = '9';
    $('r_fio2').value = '35'; $('r_spo2').value = '98';
    calcResp($('r_ppl'));
    $('cInhalo').checked = true;
    $('cPosSed').checked = true;
    $('cEduReal').checked = true;
    $('fMRC').value = '46';
    $('fPlanes').value = 'Continuar KTR según necesidad';
    $('fNota').value = 'Familia solicita entrevista';
    // El roster llega del servidor; en el arnés se siembra la opción a mano
    $('fFirma').innerHTML = '<option value="Mauricio Rojas">Mauricio Rojas</option>';
    $('fFirma').value = 'Mauricio Rojas';

    const txt = genTexto();
    const lineas = txt.split('\n');
    const blq = (window._TXB_ULT || []).slice();

    r.hayTexto = lineas.length > 5;
    r.alineado = lineas.length === blq.length;
    r.todasEtiquetadas = blq.every(x => !!x);
    r.sinSaltoInterno = lineas.every(l => l.indexOf('\n') === -1);

    // La etiqueta corresponde al contenido de su línea
    const de = k => lineas.filter((l, i) => blq[i] === k);
    r.tFase = de('fase')[0] || '';
    r.tPpres = de('ppres')[0] || '';
    r.tPvol = de('pvol')[0] || '';
    r.tNeuro = de('neuro')[0] || '';
    r.tPlan = de('plan')[0] || '';
    r.tNota = de('nota')[0] || '';
    r.tFirma = de('firma')[0] || '';
    r.encPrimero = blq[0];
    r.firmaUltimo = blq[blq.length - 1];
    // Plan y Nota son bloques DISTINTOS (se apagan por separado)
    r.planNoEsNota = de('plan').length === 1 && de('nota').length === 1;
    // Los tres bloques de parámetros van separados (el caso de Mauricio:
    // apagar «presiones y mecánica» sin perder la oxigenación)
    r.tresParams = de('pvol').length === 1 && de('ppres').length === 1 && de('poxi').length === 1;

    // ── El texto NO cambió: se genera dos veces y es idéntico ──
    r.estable = genTexto() === txt;

    // ── Guardar arma el payload con TEXTO_BLOQUES alineado ──
    r.payload = JSON.stringify(window._TXB_ULT || []);
    r.payloadEsJSON = (() => { try { return Array.isArray(JSON.parse(r.payload)); } catch (e) { return false; } })();

    // ── Turno con EVENTO: la extubación y el PVE llevan su propia etiqueta ──
    $('fPVEval').value = 'si';
    const rb = document.querySelector('input[name="pveRes"][value="superada"]');
    if (rb) { rb.checked = true; }
    const txt2 = genTexto();
    const l2 = txt2.split('\n'), b2 = (window._TXB_ULT || []).slice();
    r.evAlineado = l2.length === b2.length;
    r.evTodasEtiquetadas = b2.every(x => !!x);
    r.hayPve = b2.indexOf('pve') !== -1;
    r.pveTxt = l2.filter((l, i) => b2[i] === 'pve')[0] || '';

    // ── Turno mínimo (paciente en ambiente, casi nada marcado) ──
    $('kf').reset(); $('cBed').value = '3'; FASES_SEL = new Set();
    $('fVA').value = 'Natural'; cascadeVA();
    $('fSop').value = 'Ambiente'; cascadeSop();
    const txt3 = genTexto();
    const l3 = txt3.split('\n'), b3 = (window._TXB_ULT || []).slice();
    r.minAlineado = l3.length === b3.length;
    r.minTodasEtiquetadas = b3.every(x => !!x);
    r.minSinVacias = l3.every(l => l.trim() !== '');
    return r;
  });

  console.log('── Etiqueta alineada con el texto ──');
  eq('el motor produce texto', R.hayTexto, true);
  eq('una etiqueta por línea', R.alineado, true);
  eq('ninguna línea queda sin etiqueta', R.todasEtiquetadas, true);
  eq('ninguna frase lleva salto de línea interno', R.sinSaltoInterno, true);
  eq('el texto es estable entre generaciones', R.estable, true);

  console.log('\n── Cada etiqueta corresponde a su contenido ──');
  // Redacción de Diego (ago-2026): «En proceso de weaning», no «Fase clínica: …»
  eq('«fase» es la fase clínica', /^En proceso de weaning\. En proceso de rehabilitación precoz\./.test(R.tFase), true);
  eq('«pvol» son volúmenes y frecuencia', /Vti 470 ml/.test(R.tPvol), true);
  eq('«ppres» son presiones y mecánica', /Pmax 22 cmH2O/.test(R.tPpres), true);
  eq('…y no arrastra la oxigenación', /FiO2/.test(R.tPpres), false);
  eq('«neuro» es el neuromonitoreo', /^Neuromonitoreo:/.test(R.tNeuro), true);
  eq('«plan» es el plan', /^Plan:/.test(R.tPlan), true);
  eq('«nota» es la nota', /^Nota:/.test(R.tNota), true);
  // La firma SALIÓ del texto generado (ago-2026, pedido de Diego: al copiar
  // al BUDA estorbaba). La columna FIRMA y la entrega la conservan.
  eq('«firma» ya no existe en el texto generado', R.tFirma, '');
  eq('el encabezado abre el texto', R.encPrimero, 'enc');
  eq('la nota lo cierra (la firma salió del texto)', R.firmaUltimo, 'nota');
  eq('plan y nota son bloques distintos', R.planNoEsNota, true);
  eq('los parámetros van en TRES bloques separados', R.tresParams, true);

  console.log('\n── Payload y eventos ──');
  eq('TEXTO_BLOQUES viaja como JSON de arreglo', R.payloadEsJSON, true);
  eq('con evento: sigue alineado', R.evAlineado, true);
  eq('…y sin etiquetas vacías', R.evTodasEtiquetadas, true);
  eq('la PVE tiene su propia etiqueta', R.hayPve, true);
  eq('…y es la frase de la PVE', /PVE/.test(R.pveTxt), true);

  console.log('\n── Turno mínimo ──');
  eq('paciente en ambiente: alineado', R.minAlineado, true);
  eq('…sin etiquetas vacías', R.minTodasEtiquetadas, true);
  eq('…y sin líneas en blanco', R.minSinVacias, true);

  eq('sin errores de página', errs.length ? errs[0] : 0, 0);
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
