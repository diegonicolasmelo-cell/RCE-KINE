// anotaciones_turno.js — 📌 ANOTACIONES DEL TURNO (v5.97, Diego 5-sep-2026):
// «agregar información que no sume a estadística, como el Otro de Manuel,
// pero que aparezca en la evolución» — hechos con hora OPCIONAL, desde el
// formulario, encima de la Nota.
//
// LO QUE FIJA:
//  1. Cliente: el bloque existe, agrega/quita, viaja en ANOTACIONES_JSON y
//     se narra ANTES de la Nota («EEG a las 14:00.» / sin hora «EEG.»).
//  2. Servidor: dominio_texto narra IGUAL (paridad) y cada anotación deja
//     su hito 📌 tipo 'nota' — tipo auto: el re-guardado REEMPLAZA, no
//     duplica.
//  3. JAMÁS tocan PROCEDIMIENTOS: son constancia, no estadística.
// Uso: node build/checks/anotaciones_turno.js (requiere playwright-core)
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

/* ── 1 · Servidor: narración en paridad + hito por anotación ── */
console.log('1 · El texto del servidor narra antes de la Nota');
global.esVerdadero = x => x === true || x === 'TRUE' || x === 'true';
eval(fs.readFileSync(path.join(v2, 'dominio_texto.gs'), 'utf8'));
const d = { ANOTACIONES_JSON: JSON.stringify([{ t: 'EEG realizado', h: '14:00' }, { t: 'Evaluado por neurología', h: '' }]),
  PLAN_NOTA_TURNO: 'familia informada', PLAN_PLANES: 'seguir igual' };
const txt = generarTextoEvolucion(d);
si('con hora: «EEG realizado a las 14:00.»', /EEG realizado a las 14:00\./.test(txt));
si('sin hora: la frase sola con su punto', /Evaluado por neurología\./.test(txt));
si('★ las anotaciones van ANTES de la Nota y del Plan',
  txt.indexOf('EEG realizado') < txt.indexOf('Nota:') && txt.indexOf('Nota:') < txt.indexOf('Plan:'));

console.log('\n2 · Cada anotación deja hito y ninguna toca PROCEDIMIENTOS');
const evoSrc = fs.readFileSync(path.join(v2, 'svc_evoluciones.gs'), 'utf8');
si('el guardado convierte ANOTACIONES_JSON en hitos tipo nota',
  /ANOTACIONES_JSON \|\| '\[\]'/.test(evoSrc) && /hitosExtra\.push\(\{ tipo: 'nota',/.test(evoSrc));
const tlSrc = fs.readFileSync(path.join(v2, 'svc_timeline.gs'), 'utf8');
si("★ 'nota' es tipo AUTO: el re-guardado reemplaza, no duplica",
  /_TIPOS_HITO_AUTO = \['via_aerea', 'procedimiento', 'kine', 'general', 'nota'\]/.test(tlSrc));
si('★ el bloque de anotaciones NO escribe en PROCEDIMIENTOS',
  !/ANOTACIONES[\s\S]{0,600}?repoInsertar\('PROCEDIMIENTOS'/.test(evoSrc));

/* ── 3 · Cliente ── */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window._ll = [];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, dd) { window._ll.push({ a, d: dd }); setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2, 'index.html'));
  await p.waitForTimeout(500);

  const R = await p.evaluate(() => {
    const r = {};
    DB = [{ ID_CAMA: '3', OCUPADA: true, NOMBRE: 'PACIENTE PRUEBA' }];
    $('kf').reset(); $('cBed').value = '3'; _anotCargar('[]');
    // Agregar dos: una con hora, otra sin
    $('anotTxt').value = 'EEG realizado'; $('anotHora').value = '14:00'; anotAgregar();
    $('anotTxt').value = 'Evaluado por neurología'; $('anotHora').value = ''; anotAgregar();
    r.filas = document.querySelectorAll('#anotLista > div').length;
    r.estado = JSON.parse(JSON.stringify(ANOTS));
    // El texto las narra antes de la Nota
    $('fNota').value = 'familia informada'; $('fPlanes').value = 'seguir igual';
    const t = genTexto();
    r.conHora = /EEG realizado a las 14:00\./.test(t);
    r.sinHora = /Evaluado por neurología\./.test(t);
    r.orden = t.indexOf('EEG realizado') < t.indexOf('Nota:');
    // TEXTO_BLOQUES sigue alineado y la línea lleva su etiqueta
    const lineas = t.split('\n'), blq = (window._TXB_ULT || []);
    r.alineado = blq.length === lineas.length;
    r.etiqueta = blq[lineas.findIndex(l => l.indexOf('EEG realizado') === 0)];
    // Quitar una
    anotQuitar(0);
    r.trasQuitar = ANOTS.length;
    r.textoSin = !/EEG realizado/.test(genTexto());
    // Vacía no entra
    $('anotTxt').value = '   '; anotAgregar();
    r.vaciaNoEntra = ANOTS.length === 1;
    // El reset del panel las limpia y _anotCargar las repone
    _anotCargar(JSON.stringify([{ t: 'Pabellón: craniectomía descompresiva', h: '16:30' }]));
    r.recargada = ANOTS.length === 1 && document.querySelectorAll('#anotLista > div').length === 1;
    return r;
  });
  console.log('\n3 · El bloque del formulario');
  eq('★ dos anotaciones agregadas y pintadas', R.filas, 2);
  si('…con su estado {t,h} correcto', R.estado[0].t === 'EEG realizado' && R.estado[0].h === '14:00' && R.estado[1].h === '');
  si('★ el texto narra con hora: «EEG realizado a las 14:00.»', R.conHora);
  si('…y sin hora: «Evaluado por neurología.»', R.sinHora);
  si('★ antes de la Nota', R.orden);
  si('TEXTO_BLOQUES sigue alineado 1:1', R.alineado);
  eq("…y la línea lleva la etiqueta 'anotacion'", R.etiqueta, 'anotacion');
  si('quitar la saca del estado y del texto', R.trasQuitar === 1 && R.textoSin);
  si('una anotación vacía no entra', R.vaciaNoEntra);
  si('el cargado desde el turno guardado repone la lista', R.recargada);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
