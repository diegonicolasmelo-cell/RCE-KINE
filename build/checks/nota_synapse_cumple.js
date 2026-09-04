// nota_synapse_cumple.js — La tanda del 2-sep-2026, en sus tres piezas.
//
// DE DÓNDE SALE CADA UNA (Diego, 2-sep):
//  1. 📌 «Que deje una nota, aparezca algo así como nota al timeline de título
//     con el ícono del pinchito». La nota YA era el texto libre propio del
//     turno; solo le faltaba dejar rastro en el historial. Por eso NO se creó
//     un bloque nuevo: se le dio salida a lo que ya se escribe.
//  2. 🩻 Synapse: «que copie de forma automática al hacer clic en el ícono el
//     RUT». Medido ese día: Synapse manda X-Frame-Options 'sameorigin', así
//     que NO se puede embeber — el botón abre otra pestaña.
//  3. 🎂 «El día que esté de cumpleaños alguien, la mascota aparezca con gorro
//     y globos… y ahí que aparezca hoy está de cumpleaños tal».
//
// Uso: node build/checks/nota_synapse_cumple.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const V2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (ok ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!ok) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

(async () => {
  /* ══ 1 · SERVIDOR · la nota deja hito, y se REEMPLAZA al re-guardar ══ */
  console.log('\n1 · La nota del turno deja su 📌 en la línea de tiempo');
  const src = ['infra_respuesta.gs', 'infra_util.gs', 'svc_timeline.gs']
    .map(f => fs.readFileSync(path.join(V2, f), 'utf8')).join('\n;\n');
  let FILAS = [];
  global.repoLeerTodos = () => [];
  global.repoInsertar = () => {};
  global.repoLeerTodosConFila = () => FILAS.map((o, i) => ({ obj: o, fila: i + 2 }));
  global.repoEliminarFilas = (h, filas) => {
    const set = new Set(filas);
    FILAS = FILAS.filter((_, i) => !set.has(i + 2));
    return filas.length;
  };
  const INSERT = [];
  global.repoInsertarVarios = (h, os) => { (os || []).forEach(o => { INSERT.push(o); FILAS.push(o); }); return (os || []).length; };
  global.ahoraTS = () => '2026-09-02 12:00:00';
  global._sincronizarTimelineCama = () => {};
  global.Utilities = { getUuid: () => 'u' + INSERT.length };
  (0, eval)(src);

  // 🪤 La constante NO se lee del runtime: `(0,eval)` deja los `const` en un
  // ámbito que el módulo no alcanza (misma trampa ya pagada en otras guardias).
  // Se mira el archivo, y más abajo se prueba el COMPORTAMIENTO, que es lo que
  // de verdad importa: re-guardar reemplaza el hito en vez de duplicarlo.
  si('★ «nota» está entre los hitos que se reemplazan al re-guardar',
     /_TIPOS_HITO_AUTO\s*=\s*\[[^\]]*'nota'/.test(fs.readFileSync(path.join(V2, 'svc_timeline.gs'), 'utf8')));

  const nota = t => ({ tipo: 'nota', texto: '📌 Nota: ' + t, autor: 'DMV' });
  _timelineDelGuardado('4', '2026-09-02', 'Dia', [], 'DMV', '', 'pid1', [nota('TAC de tórax: derrame nuevo')]);
  const h1 = INSERT.filter(h => h.TIPO === 'nota');
  eq('se crea UN hito de nota', h1.length, 1);
  si('★ lleva el pinchito y el título «Nota»', /^📌 Nota: /.test(h1[0].TEXTO));
  si('…con el texto que escribió el colega', /derrame nuevo/.test(h1[0].TEXTO));
  eq('queda en el turno y la cama correctos', h1[0].ID_CAMA + '|' + h1[0].TURNO, '4|Dia');

  // Re-guardar con la nota corregida: reemplaza, no duplica.
  _timelineDelGuardado('4', '2026-09-02', 'Dia', [], 'DMV', '', 'pid1', [nota('TAC de tórax: derrame DERECHO nuevo')]);
  const vivas = FILAS.filter(h => h.TIPO === 'nota');
  eq('★ corregir la nota NO duplica el hito', vivas.length, 1);
  si('★ …y el que queda es el corregido', /DERECHO/.test(vivas[0].TEXTO));

  // Sin nota no se inventa nada.
  _timelineDelGuardado('5', '2026-09-02', 'Dia', [], 'DMV', '', 'pid2', []);
  eq('una evolución sin nota no deja hito', FILAS.filter(h => String(h.ID_CAMA) === '5').length, 0);

  /* ══ 2 · SERVIDOR · cumpleaños del día ══════════════════════════════ */
  console.log('\n2 · Quién cumple hoy');
  const KIN = [
    { FIRMA: 'DMV', NOMBRE: 'Diego Melo Villagrán', ACTIVO: true,  CUMPLE: '02-09' },
    { FIRMA: 'MCC', NOMBRE: 'Magdalena Contardo',   ACTIVO: true,  CUMPLE: '2/9' },      // sin cero, con barra
    { FIRMA: 'MFB', NOMBRE: 'Manuel Fuentes',       ACTIVO: true,  CUMPLE: '15-11' },
    { FIRMA: 'AWE', NOMBRE: 'Álvaro Wilson',        ACTIVO: false, CUMPLE: '02-09' },    // ya no está
    { FIRMA: 'RC',  NOMBRE: 'Rodrigo Caamaño',      ACTIVO: true,  CUMPLE: '' },
  ];
  global.repoLeerTodos = h => (h === 'KINESIOLOGOS' ? KIN : []);
  global.hoyISO = () => '2026-09-02';
  const api = fs.readFileSync(path.join(V2, 'api.gs'), 'utf8');
  const fn = api.slice(api.indexOf('function cumpleanosDeHoy'));
  (0, eval)(fn.slice(0, fn.indexOf('\n/** Config de interfaz')));

  const hoy = cumpleanosDeHoy('2026-09-02').map(c => c.firma);
  console.log('   cumplen hoy: ' + JSON.stringify(hoy));
  si('★ encuentra al que cumple hoy', hoy.indexOf('DMV') !== -1);
  si('★ acepta también «2/9» sin cero a la izquierda', hoy.indexOf('MCC') !== -1);
  si('no saluda a quien cumple otro día', hoy.indexOf('MFB') === -1);
  si('★ no saluda a quien ya no está en la unidad', hoy.indexOf('AWE') === -1);
  eq('un día sin cumpleaños devuelve lista vacía', cumpleanosDeHoy('2026-03-04').length, 0);
  eq('sin columna CUMPLE no revienta', (global.repoLeerTodos = () => { throw new Error('x'); }, cumpleanosDeHoy('2026-09-02').length), 0);

  /* ══ 3 · CLIENTE · botón 🩻 y mascota de cumpleaños ══════════════════ */
  console.log('\n3 · En pantalla');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.__abiertas = [];
    const _open = window.open;
    window.open = (u) => { window.__abiertas.push(u); return { focus() {} }; };
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) {
        const R = { GET_BOOT: { ahora: '2026-09-02 10:00:00', yo: { email: '', firma: 'DMV', dev: true },
          config: { NUM_CAMAS: 12, BANNERS: {}, SYNAPSE_URL: 'https://ejemplo.cl/login' },
          fases: ['Weaning'], camas: [
            { ID_CAMA: '4', OCUPADA: true, NOMBRE: 'PACIENTE PRUEBA', EDAD: 60, RUT: '11111111-1', VIA_AEREA: 'TOT' },
            { ID_CAMA: '5', OCUPADA: true, NOMBRE: 'PACIENTE SIN RUT', EDAD: 70, RUT: '', VIA_AEREA: 'Natural' },
          ], evos: [], asignacion: { team: [], assign: {} },
          cumples: [{ firma: 'DMV', nombre: 'Diego Melo Villagrán' }] } };
        setTimeout(() => ok({ ok: true, data: R[a] !== undefined ? R[a] : null }), 5);
      } }; } }; } } } };
  });
  await p.goto('file://' + path.join(V2, 'index.html'));
  await p.waitForTimeout(3000);

  const R = await p.evaluate(() => ({
    // 🪤 Se cuentan los BOTONES, no las apariciones del texto: el JS de la app
    // vive en un <script> dentro del body, así que un regex sobre innerHTML
    // encuentra también el literal del código y da un falso rojo.
    conRut:  document.querySelectorAll('.pname-img').length,
    gorro:   document.getElementById('tutBtn').classList.contains('cumple'),
    texto:   document.getElementById('cumpleTxt').textContent,
  }));
  eq('★ el botón 🩻 sale UNA vez: solo en la cama con RUT', R.conRut, 1);
  si('★ la mascota está de cumpleaños (gorro y globos)', R.gorro);
  si('★ el globo saluda por el nombre de pila', /Hoy está de cumpleaños Diego/.test(R.texto));

  // El clic: copia el RUT y abre Synapse en otra pestaña
  await p.evaluate(() => abrirSynapse('4'));
  await p.waitForTimeout(200);
  const abiertas = await p.evaluate(() => window.__abiertas);
  eq('★ abre Synapse en otra pestaña', abiertas[abiertas.length - 1], 'https://ejemplo.cl/login');

  // 🪤 EL ORDEN (reporte de Diego, 4-sep-2026: «entro bien a Synapse pero no
  // copia el RUT»). window.open CONSUME la activación transitoria del clic y
  // execCommand('copy') después de eso devuelve false en silencio: copiar va
  // PRIMERO, siempre. Se instrumentan los dos y se exige la secuencia.
  const orden = await p.evaluate(() => {
    window.__sec = [];
    const _ex = document.execCommand.bind(document);
    document.execCommand = c => { if (c === 'copy') window.__sec.push('copy'); return _ex(c); };
    window.open = u => { window.__sec.push('open'); window.__abiertas.push(u); return { focus() {} }; };
    abrirSynapse('4');
    return window.__sec.join('-');
  });
  eq('★ copia el RUT ANTES de abrir (window.open consume el permiso del clic)', orden, 'copy-open');

  // Sin URL configurada, el botón no existe
  const sinUrl = await p.evaluate(() => {
    CFG.SYNAPSE_URL = ''; renderGrid();
    return document.querySelectorAll('.pname-img').length;
  });
  eq('★ sin SYNAPSE_URL en CONFIG no aparece ningún botón', sinUrl, 0);

  // Sin cumpleaños, la mascota vuelve a la ayuda de siempre
  const sinCumple = await p.evaluate(() => {
    cumpleAplicar([]);
    return { gorro: document.getElementById('tutBtn').classList.contains('cumple'),
             globo: document.getElementById('cumpleGlobo').classList.contains('hidden') };
  });
  si('un día normal la mascota no lleva gorro', !sinCumple.gorro);
  si('…y el globo queda escondido', sinCumple.globo);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
