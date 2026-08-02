// tutorial.js — Guardia del ❓ Tutorial anclado (v4.8): botón flotante,
// recorrido de globos con anillo-foco, cambio de pestaña por paso, fallback
// centrado cuando el ancla no existe, cierre con Salir/Escape y regreso a
// CAMAS. Uso: node build/checks/tutorial.js
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) { setTimeout(() => ok({ ok: true, data: null }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  const BASE = await p.evaluate(() => ({
    fab: !!$('tutBtn') && !$('tutBtn').classList.contains('hidden'),
    enMas: [...document.querySelectorAll('#msheet .mit')].some(x => x.textContent.indexOf('Tutorial') > -1),
    pasos: TUT_PASOS.length,
    recorridos: Object.keys(TUT_RECORRIDOS).length,
    pasosEvo: TUT_RECORRIDOS.evolucion.pasos.length,
    cerrado: $('tutGlobo').classList.contains('hidden') && $('tutVelo').classList.contains('hidden'),
  }));
  eq('botón ❓ flotante visible', BASE.fab, true);
  eq('entrada «❓ Tutorial» en la hoja Más del móvil', BASE.enMas, true);
  eq('recorrido «Lo esencial» de 12 pasos', BASE.pasos, 12);
  // v5.28: se sumó «Mover ventiladores y equipos» (con VM de práctica)
  eq('hay TRES recorridos', BASE.recorridos, 3);
  eq('el segundo recorrido tiene 8 pasos', BASE.pasosEvo, 8);
  eq('parte cerrado (sin globo ni velo)', BASE.cerrado, true);

  const P1 = await p.evaluate(async () => {
    tutAbrir(); await new Promise(r => setTimeout(r, 200));
    const g = $('tutGlobo'), ring = $('tutRing');
    return {
      abierto: !g.classList.contains('hidden') && !$('tutVelo').classList.contains('hidden'),
      titulo: $('tutTit').textContent, contador: $('tutN').textContent,
      anillo: !ring.classList.contains('hidden') && parseFloat(ring.style.width) > 100,
      botonSig: $('tutSig').textContent,
    };
  });
  eq('paso 1 abre globo y velo', P1.abierto, true);
  eq('paso 1 apunta a las pestañas', P1.titulo.indexOf('pestañas') > -1, true);
  eq('contador «1 de 12»', P1.contador, '1 de 12');
  eq('anillo-foco dibujado sobre la barra de pestañas', P1.anillo, true);
  eq('botón dice Siguiente', P1.botonSig.indexOf('Siguiente') > -1, true);

  const P5 = await p.evaluate(async () => {
    tutSiguiente(); tutSiguiente(); tutSiguiente(); tutSiguiente(); tutSiguiente(); // pasos 2..6
    await new Promise(r => setTimeout(r, 220));
    return { tab: ATAB, titulo: $('tutTit').textContent };
  });
  eq('paso 6 cambia a la pestaña REGISTRO', P5.tab, 'P');
  eq('paso 6 presenta el Registro Diario', P5.titulo.indexOf('Registro Diario') > -1, true);

  const P7 = await p.evaluate(async () => {
    tutSiguiente(); tutSiguiente(); // 7 y 8
    await new Promise(r => setTimeout(r, 220));
    // el anillo anima 0,25 s: se compara el destino (style), no el rect en tránsito
    const rl = parseFloat($('tutRing').style.left), b2 = $('btnDocs').getBoundingClientRect();
    return { titulo: $('tutTit').textContent, sobreDocs: Math.abs((rl + 6) - b2.left) < 3 };
  });
  eq('paso 8 presenta 📂 Documentos', P7.titulo.indexOf('Documentos') > -1, true);
  eq('el anillo encuadra el botón de Documentos', P7.sobreDocs, true);

  const P10 = await p.evaluate(async () => {
    tutSiguiente(); tutSiguiente(); // 9 (entrega) y 10 (archivados)
    await new Promise(r => setTimeout(r, 220));
    return { tab: ATAB, titulo: $('tutTit').textContent };
  });
  eq('paso 10 cambia a la pestaña ARCHIVADOS', P10.tab, 'A');
  eq('y presenta a los pacientes egresados', P10.titulo.indexOf('archivados') > -1, true);

  const FIN = await p.evaluate(async () => {
    tutSiguiente(); tutSiguiente(); await new Promise(r => setTimeout(r, 260));
    const t = { ultimoBtn: $('tutSig').textContent, tabFinal: ATAB,
      ofreceSegundo: !$('tutMas').classList.contains('hidden') };
    tutSiguiente(); await new Promise(r => setTimeout(r, 60));
    t.cerrado = $('tutGlobo').classList.contains('hidden') && $('tutVelo').classList.contains('hidden') && $('tutRing').classList.contains('hidden');
    t.tabTrasCerrar = ATAB;
    return t;
  });
  eq('último paso ofrece «Terminar ✓»', FIN.ultimoBtn, 'Terminar ✓');
  eq('y ofrece pasar al recorrido del formulario', FIN.ofreceSegundo, true);
  eq('el cierre regresa a CAMAS', FIN.tabTrasCerrar, 'G');
  eq('terminar limpia globo, velo y anillo', FIN.cerrado, true);

  const ESC = await p.evaluate(async () => {
    tutAbrir(); await new Promise(r => setTimeout(r, 200));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await new Promise(r => setTimeout(r, 60));
    return $('tutGlobo').classList.contains('hidden') && $('tutVelo').classList.contains('hidden');
  });
  eq('Escape cierra el recorrido', ESC, true);

  // ── v4.9 · Mascota, saludo de la primera vez y marca de agua ──
  const MASC = await p.evaluate(async () => {
    const fab = $('tutBtn').querySelector('img');
    const glo = $('tutGlobo').querySelector('.tg-masc');
    const lov = document.querySelector('#lov .lov-masc');
    const marca = getComputedStyle(document.documentElement).getPropertyValue('--marca-agua');
    const logo = document.querySelector('.hlogo');
    // el display real solo se puede medir con el recorrido ya desplegado
    tutAbrir(); await new Promise(r => setTimeout(r, 220));
    const flex = getComputedStyle($('tutGlobo')).display === 'flex';
    const altoMasc = Math.max(...[...$('tutGlobo').querySelectorAll('.tg-masc')]
      .map(e => e.getBoundingClientRect().height));
    tutCerrar();
    return {
      globoFlex: flex, mascVisible: altoMasc > 40,
      fabImg: !!fab && fab.src.indexOf('data:image/png;base64,') === 0,
      fabSinInterrogacion: $('tutBtn').textContent.indexOf('?') === -1,
      globoImg: !!glo && glo.src.indexOf('data:image/png;base64,') === 0,
      cargaImg: !!lov && lov.src.indexOf('data:image/png;base64,') === 0,
      marcaAgua: marca.indexOf('data:image/png;base64,') > -1,
      logoIncrustado: !!logo && logo.src.indexOf('data:image/png;base64,') === 0,
    };
  });
  eq('mascota incrustada en el botón (sin depender de internet)', MASC.fabImg, true);
  eq('el botón ya no muestra el signo de interrogación', MASC.fabSinInterrogacion, true);
  eq('mascota acompañando los globos del recorrido', MASC.globoImg, true);
  eq('mascota en la pantalla de carga', MASC.cargaImg, true);
  eq('marca de agua institucional incrustada', MASC.marcaAgua, true);
  eq('logo del encabezado incrustado', MASC.logoIncrustado, true);
  eq('el globo es contenedor flex (mascota + texto)', MASC.globoFlex, true);
  eq('la mascota se ve dentro del globo en escritorio', MASC.mascVisible, true);

  const HOLA = await p.evaluate(async () => {
    localStorage.removeItem('rce_tut_saludo');
    tutHolaMostrar();
    await new Promise(r => setTimeout(r, 2800));
    const visible = !$('tutHola').classList.contains('hidden');
    const sinVelo = $('tutVelo').classList.contains('hidden');   // no interrumpe
    tutHolaCerrar();
    const cerrado = $('tutHola').classList.contains('hidden');
    const marcado = localStorage.getItem('rce_tut_saludo') === '1';
    // segunda visita: ya no debe salir
    tutHolaMostrar();
    await new Promise(r => setTimeout(r, 2800));
    const noRepite = $('tutHola').classList.contains('hidden');
    return { visible, sinVelo, cerrado, marcado, noRepite };
  });
  eq('saludo de la primera vez aparece solo', HOLA.visible, true);
  eq('el saludo NO bloquea la app (sin velo)', HOLA.sinVelo, true);
  eq('la ✕ lo cierra', HOLA.cerrado, true);
  eq('queda marcado como visto', HOLA.marcado, true);
  eq('no vuelve a aparecer en la siguiente visita', HOLA.noRepite, true);

  const DESDE_HOLA = await p.evaluate(async () => {
    localStorage.removeItem('rce_tut_saludo');
    tutHolaMostrar(); await new Promise(r => setTimeout(r, 2800));
    tutAbrir(); await new Promise(r => setTimeout(r, 220));
    const r = { holaCerrado: $('tutHola').classList.contains('hidden'), tourAbierto: !$('tutGlobo').classList.contains('hidden') };
    tutCerrar();
    return r;
  });
  eq('abrir el tutorial cierra el saludo', DESDE_HOLA.holaCerrado, true);
  eq('y arranca el recorrido', DESDE_HOLA.tourAbierto, true);

  // ── v5.3 · Mascota SELECCIONABLE: Servi por defecto, el kinesiólogo opcional ──
  const MASCSEL = await p.evaluate(async () => {
    localStorage.removeItem('rce_mascota');
    mascAplicar();
    const vis = s => { const e = document.querySelector(s); return !!(e && e.offsetParent !== null); };
    const r = {};
    r.porDefecto = document.documentElement.dataset.masc;
    r.soloServi = vis('#tutBtn .masc-servi') && !vis('#tutBtn .masc-persona');
    // la ilustración es la que aportó Diego: va incrustada, sin URL externa
    r.incrustada = [...$('tutBtn').querySelectorAll('.masc-servi img')]
      .every(i => i.src.indexOf('data:image/png;base64,') === 0);
    r.dosPoses = !!$('serviOn') && !!$('serviOff');
    r.nombre = MASC_NOMBRE;
    r.servikQuieto = getComputedStyle($('tutBtn')).animationName === 'none';
    r.haySelector = !!$('mascBtn');
    // cambiar a la persona
    mascToggle();
    r.trasCambiar = document.documentElement.dataset.masc;
    r.soloPersona = vis('#tutBtn .masc-persona') && !vis('#tutBtn .masc-servi');
    r.personaFlota = getComputedStyle($('tutBtn')).animationName !== 'none';
    r.persistido = localStorage.getItem('rce_mascota');
    // y volver a Servi
    mascToggle();
    r.vuelveAServi = document.documentElement.dataset.masc === 'servi' && vis('#tutBtn .masc-servi');
    // Servi duerme en turno noche
    SHIFT = 'Noche'; serviEstado();
    r.nocheDuerme = vis('#serviOff') && !vis('#serviOn');
    SHIFT = 'Dia'; serviEstado();
    r.diaDespierto = vis('#serviOn') && !vis('#serviOff');
    return r;
  });
  eq('la mascota por defecto es Servi', MASCSEL.porDefecto, 'servi');
  eq('se ve UNA sola mascota (Servi)', MASCSEL.soloServi, true);
  eq('la ilustración va incrustada (sin depender de internet)', MASCSEL.incrustada, true);
  eq('tiene pose despierta y dormida', MASCSEL.dosPoses, true);
  eq('la mascota se llama Servi U', MASCSEL.nombre, 'Servi U');
  eq('Servi U va quieto', MASCSEL.servikQuieto, true);
  eq('hay control para cambiar de mascota', MASCSEL.haySelector, true);
  eq('al cambiar queda el kinesiólogo', MASCSEL.trasCambiar, 'persona');
  eq('y se ve solo él', MASCSEL.soloPersona, true);
  eq('el kinesiólogo sí flota', MASCSEL.personaFlota, true);
  eq('la elección se recuerda', MASCSEL.persistido, 'persona');
  eq('se puede volver a Servi', MASCSEL.vuelveAServi, true);
  eq('Servi U duerme en turno noche', MASCSEL.nocheDuerme, true);
  eq('y despierta en turno día', MASCSEL.diaDespierto, true);

  // Marca de agua protagónica al centro y logo grande
  const IDENT = await p.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.tc-wrap'), ':before');
    const logo = document.querySelector('.hlogo');
    document.documentElement.dataset.piel = 'inst';
    const hLogo = parseFloat(getComputedStyle(logo).height);
    return { pos: cs.position, w: parseFloat(cs.width),
      centrada: Math.abs(parseFloat(cs.left) - innerWidth / 2) < 2, logo: hLogo,
      reloj: parseFloat(getComputedStyle($('clk')).fontSize),
      fecha: parseFloat(getComputedStyle($('gDate')).fontSize) };
  });
  eq('marca de agua centrada en pantalla', IDENT.pos === 'fixed' && IDENT.centrada, true);
  eq('marca de agua protagónica (ancho > 400 px)', IDENT.w > 400, true);
  eq('logo institucional grande (>= 46 px)', IDENT.logo >= 46, true);
  eq('la hora destaca (>= 17 px)', IDENT.reloj >= 17, true);
  eq('la fecha destaca (>= 15 px)', IDENT.fecha >= 15, true);

  /* ── v5.7 · Segundo recorrido: abre una evolución de EJEMPLO y la cierra
        sin guardar (nunca debe escribir en la ficha de un paciente) ── */
  const EVO = await p.evaluate(async () => {
    tutCerrar();
    DB = [{ ID_CAMA: '1', OCUPADA: true, NOMBRE: 'Juan Pérez', EDAD: 64, SEXO: 'M',
      DIAGNOSTICO: 'NAC', VIA_AEREA: 'TOT', SOPORTE: 'VM', MODO: 'ACVC',
      FECHA_INGRESO: '2026-07-26', FECHA_INICIO_VA: '2026-07-26' }];
    const o = {};
    tutAbrir('evolucion');
    await new Promise(r => setTimeout(r, 1100));
    o.recorrido = TUT_REC;
    o.abrioElFormulario = $('sp').classList.contains('on');
    o.primerPaso = $('tutTit').textContent;
    o.contador = $('tutN').textContent;
    // recorrer hasta el final
    for (let i = 0; i < TUT_PASOS.length; i++) { tutSiguiente(); await new Promise(r => setTimeout(r, 230)); }
    o.cerroElFormulario = !$('sp').classList.contains('on');
    o.vuelveAEsencial = TUT_REC === 'esencial';
    return o;
  });
  eq('el segundo recorrido abre una evolución de ejemplo', EVO.abrioElFormulario, true);
  eq('parte presentando el formulario', EVO.primerPaso.indexOf('formulario') > -1, true);
  eq('contador propio del recorrido (1 de 8)', EVO.contador, '1 de 8');
  eq('al terminar CIERRA el formulario (sin guardar)', EVO.cerroElFormulario, true);
  eq('y vuelve al recorrido esencial', EVO.vuelveAEsencial, true);

  const SIN_PAC = await p.evaluate(async () => {
    tutCerrar();
    DB = [{ ID_CAMA: '1', OCUPADA: false }];
    tutAbrir('evolucion');
    await new Promise(r => setTimeout(r, 350));
    const r = { texto: $('tutTxt').textContent, panel: $('sp').classList.contains('on') };
    tutCerrar();
    return r;
  });
  eq('sin pacientes ingresados avisa en vez de fallar', /no hay ningún paciente/i.test(SIN_PAC.texto), true);
  eq('y no abre ningún formulario', SIN_PAC.panel, false);

  const SIN = await p.evaluate(async () => {
    // ancla inexistente → globo centrado con velo oscuro, sin anillo
    TUT_PASOS.unshift({ tab: 'G', sel: '#noExiste', t: 'X', d: 'Y' });
    tutAbrir(); await new Promise(r => setTimeout(r, 200));
    const r = { anillo: !$('tutRing').classList.contains('hidden'), dim: $('tutVelo').classList.contains('dim') };
    tutCerrar(); TUT_PASOS.shift();
    return r;
  });
  eq('ancla inexistente: sin anillo y con velo oscuro (globo centrado)', !SIN.anillo && SIN.dim, true);

  /* ── v5.10/v5.12 · Servi cambia de pose según el contexto: duda (?) e idea
        (💡) alternan en el esencial, jeringa en el clínico (rec-evo) y la
        CELEBRACIÓN con confeti cierra el último paso de ambos (rec-fin);
        el aviso «sin pacientes» NO celebra. ── */
  const POSES = await p.evaluate(async () => {
    const vis = s => { const e = document.querySelector(s); return !!(e && e.offsetParent !== null); };
    const sólo = cual => ['sg-duda', 'sg-idea', 'sg-alerta', 'sg-exito']
      .every(c => vis('#tutGlobo .' + c) === (c === cual));
    const r = {};
    DB = [{ ID_CAMA: '1', OCUPADA: true, NOMBRE: 'Juan Pérez', EDAD: 64, SEXO: 'M',
      DIAGNOSTICO: 'NAC', VIA_AEREA: 'TOT', SOPORTE: 'VM', MODO: 'ACVC',
      FECHA_INGRESO: '2026-07-26', FECHA_INICIO_VA: '2026-07-26' }];
    tutAbrir(); await new Promise(res => setTimeout(res, 200));
    r.paso1Duda = sólo('sg-duda');
    tutSiguiente(); await new Promise(res => setTimeout(res, 200));
    r.paso2Idea = sólo('sg-idea');
    tutSiguiente(); await new Promise(res => setTimeout(res, 200));
    r.paso3Duda = sólo('sg-duda');
    while (_tutI < TUT_PASOS.length - 1) { tutSiguiente(); await new Promise(res => setTimeout(res, 160)); }
    r.finalExito = sólo('sg-exito');
    tutCerrar();
    tutAbrir('evolucion'); await new Promise(res => setTimeout(res, 1100));
    r.evoAlerta = sólo('sg-alerta');
    while (_tutI < TUT_PASOS.length - 1) { tutSiguiente(); await new Promise(res => setTimeout(res, 160)); }
    r.evoFinalExito = sólo('sg-exito');
    tutCerrar();
    r.limpio = ['rec-evo', 'rec-idea', 'rec-fin'].every(c => !$('tutGlobo').classList.contains(c));
    // sin pacientes: el aviso es paso único y final, pero NO es un logro
    DB = [{ ID_CAMA: '1', OCUPADA: false }];
    tutAbrir('evolucion'); await new Promise(res => setTimeout(res, 350));
    r.sinPacSinFiesta = sólo('sg-alerta');
    tutCerrar();
    return r;
  });
  eq('esencial paso 1: Servi con el signo de pregunta', POSES.paso1Duda, true);
  eq('esencial paso 2: cambia a la pose de la idea', POSES.paso2Idea, true);
  eq('esencial paso 3: vuelve la duda (alternan)', POSES.paso3Duda, true);
  eq('último paso del esencial: celebración con confeti', POSES.finalExito, true);
  eq('recorrido clínico: Servi con la jeringa', POSES.evoAlerta, true);
  eq('último paso del clínico: también celebra', POSES.evoFinalExito, true);
  eq('al cerrar, el globo queda sin clases de pose', POSES.limpio, true);
  eq('el aviso «sin pacientes» no celebra (jeringa)', POSES.sinPacSinFiesta, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS:', errs.join(' | ')); fails.push('errores JS'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
