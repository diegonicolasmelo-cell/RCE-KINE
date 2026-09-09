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

/* 🔴 PRIVACIDAD: la dirección del LIS es una IP interna del hospital y este
   repo es público. Nace vacía en el esquema y la pega Diego en la planilla. */
const _esq = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'v2', 'esquema.gs'), 'utf8');

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

  eq('★ LIS_URL nace VACÍA en el esquema (la dirección no vive en el repo)',
    /\['LIS_URL',\s*''\]/.test(_esq), 'true');
  eq('★ …y no hay ninguna IP interna escrita en el esquema',
    /\b(?:10|172|192)\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/.test(_esq), 'false');

  // ── 🧪 EL LABORATORIO (v6.21, 9-sep-2026) ─────────────────────────────
  // Mismo atajo, otro destino. Salió de un hallazgo de terreno: Diego usaba el
  // botón de Synapse SOLO para copiar el RUT, con el LIS abierto al lado. Y de
  // una medición: el LIS solo se usaba en Firefox, pero en Chrome CARGA (con
  // una extensión instalada). Como en un PC sin esa extensión la pestaña puede
  // no servir, el copiado tiene que ocurrir SÍ o SÍ — de ahí que el orden se
  // vigile igual de fuerte que en Synapse.
  const dosBotones = await p.evaluate(() => {
    CFG.LIS_URL = 'http://ejemplo-lis.local/inicio'; renderGrid();
    const bs = [...document.querySelectorAll('.pname-img')];
    return { total: bs.length,
             svg: bs.filter(b => b.querySelector('svg')).length,
             cobas: /cobas/i.test(document.querySelector('.lis-ico')?.textContent || '') };
  });
  eq('★ con las dos URL, la cama con RUT muestra los DOS botones', dosBotones.total, 2);
  // 🪤 Los dos íconos son SVG dibujado a mano, NUNCA emoji: el Chrome del
  // hospital (Windows 10) no trae los posteriores a 2019 y salen como cuadrado.
  // Si alguien cambia uno por un emoji «para simplificar», esta guardia lo caza.
  eq('★ los dos íconos son SVG, no emoji (el Chrome del hospital no los dibuja)',
    dosBotones.svg, 2);
  eq('★ el del laboratorio lleva la marca de cobas, que es la que el equipo reconoce',
    dosBotones.cobas, 'true');

  const lis = await p.evaluate(() => {
    window.__sec = [];
    abrirLIS('4');
    return { sec: window.__sec.join('-'), url: window.__abiertas[window.__abiertas.length - 1] };
  });
  eq('★ abre el laboratorio en otra pestaña', lis.url, 'http://ejemplo-lis.local/inicio');
  eq('★ …y copia el RUT ANTES de abrir, igual que Synapse', lis.sec, 'copy-open');

  const sinLis = await p.evaluate(() => {
    CFG.LIS_URL = ''; renderGrid();
    return document.querySelectorAll('.pname-img').length;
  });
  eq('★ sin LIS_URL en CONFIG vuelve a quedar solo el de Synapse', sinLis, 1);

  // Sin URL configurada, el botón no existe
  const sinUrl = await p.evaluate(() => {
    CFG.SYNAPSE_URL = ''; renderGrid();
    return document.querySelectorAll('.pname-img').length;
  });
  eq('★ sin SYNAPSE_URL en CONFIG no aparece ningún botón', sinUrl, 0);

  // 🎂 v5.90: con la mascota PERSONA, el cumpleaños usa la pose real de Don
  // Mauri (festejo + gorro compuesto) y el emoji-gorro queda solo para Servi.
  const pose = await p.evaluate(() => {
    try { localStorage.setItem(MASC_KEY, 'persona'); } catch (e) {}
    mascAplicar();
    cumpleAplicar([{ firma: 'DMV', nombre: 'Diego Melo Villagrán' }]);
    const img = document.querySelector('#tutBtn .masc-persona');
    const gorro = document.querySelector('#tutBtn .cump-gorro');
    const conCumple = { esPose: !!img && img.src === mauriSrc('cumple'),
                        emojiOculto: getComputedStyle(gorro).display === 'none' };
    cumpleAplicar([]);
    const vuelve = !!img && img.src !== mauriSrc('cumple');
    try { localStorage.setItem(MASC_KEY, 'servi'); } catch (e) {}
    mascAplicar(); cumpleAplicar([{ firma: 'DMV', nombre: 'Diego Melo Villagrán' }]);
    const serviEmoji = getComputedStyle(gorro).display !== 'none';
    cumpleAplicar([]);
    return { ...conCumple, vuelve, serviEmoji };
  });
  si('★ con la persona, el cumpleaños pone la POSE cumple de Don Mauri', pose.esPose);
  si('…y el emoji-gorro se esconde (la pose ya trae el suyo)', pose.emojiOculto);
  si('…al pasar el cumpleaños vuelve la pose normal', pose.vuelve);
  si('★ Servi conserva el gorro de emoji', pose.serviEmoji);

  /* 🎂 v6.13 (Diego, 7-sep-2026): la PANTALLA DE CARGA también celebra, con la
     pose FESTEJO (la que él aprobó) más gorro, globos y confeti; y el que
     ANUNCIA quién cumple va más grande, «porque se ve muy pequeño». */
  const fiesta = await p.evaluate(() => {
    try { localStorage.setItem(MASC_KEY, 'persona'); } catch (e) {}
    mascAplicar();
    const lov = document.getElementById('lov');
    const lovImg = lov.querySelector('.masc-persona');
    const btnImg = document.querySelector('#tutBtn .masc-persona');
    // Antes del cumpleaños: telón sobrio.
    cumpleAplicar([]);
    const sobrio = { clase: lov.classList.contains('cumple'),
                     pose: lovImg.src === mauriSrc('sofa'),
                     confeti: getComputedStyle(document.getElementById('lovConfeti')).display,
                     alto: getComputedStyle(btnImg).height };
    cumpleAplicar([{ firma: 'DMV', nombre: 'Diego Melo Villagrán' }]);
    const conf = document.querySelectorAll('#lovConfeti span');
    const fest = { clase: lov.classList.contains('cumple'),
                   pose: lovImg.src === mauriSrc('festejo'),
                   gorro: getComputedStyle(lov.querySelector('.cump-gorro')).display,
                   confeti: getComputedStyle(document.getElementById('lovConfeti')).display,
                   piezas: conf.length,
                   emoji: [...conf].every(x => x.textContent === '🎊'),
                   sueltas: new Set([...conf].map(x => x.style.animationDelay)).size,
                   alto: getComputedStyle(btnImg).height,
                   dia: (function () { try { return localStorage.getItem('rce_cumple_dia'); } catch (e) { return ''; } })() };
    // Y el recuerdo se borra cuando ya no hay nadie de cumpleaños.
    cumpleAplicar([]);
    let borrado = ''; try { borrado = localStorage.getItem('rce_cumple_dia') || ''; } catch (e) {}
    return { sobrio, fest, borrado, hoy: hoy() };
  });
  si('un día normal la pantalla de carga NO celebra (sofá, sin confeti)',
    !fiesta.sobrio.clase && fiesta.sobrio.pose && fiesta.sobrio.confeti === 'none');
  si('★ con cumpleaños la pantalla de carga usa la pose FESTEJO', fiesta.fest.clase && fiesta.fest.pose);
  si('★ …con el gorro encima y el confeti cayendo',
    fiesta.fest.gorro !== 'none' && fiesta.fest.confeti !== 'none' && fiesta.fest.piezas >= 6);
  si('★ el confeti es 🎊 (emoji de 2010: el Chrome del hospital lo dibuja)', fiesta.fest.emoji);
  si('…y cada pieza cae con su propio retardo (si no, sería una fila)', fiesta.fest.sueltas >= 4);
  si('★ el que ANUNCIA crece de 62 a 92 px (Diego: «se ve muy pequeño»)',
    fiesta.sobrio.alto === '62px' && fiesta.fest.alto === '92px');
  si('★ el día queda anotado, porque el boot llega DESPUÉS de pintar la carga',
    fiesta.fest.dia === fiesta.hoy);
  si('…y se borra solo cuando ya no hay cumpleaños', fiesta.borrado === '');
  si('el globo del saludo sube para no chocar con la mascota crecida',
    /#cumpleGlobo\{position:fixed;right:14px;bottom:112px;/.test(fs.readFileSync(path.join(V2, 'index.html'), 'utf8')));

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
