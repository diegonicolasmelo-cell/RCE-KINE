// entrega_impresion.js — La entrega es ANCHA en pantalla y COMPACTA en papel
// (ago-2026).
//
// PEDIDO DE DIEGO: la entrega ocupaba ~4 hojas con 17 pacientes y «al fin y al
// cabo es poca información». Decisión suya: compactar SOLO al imprimir — la
// vista de pantalla (y la del celular, que le gusta) se queda igual.
//
// LO QUE ESTA GUARDIA CUIDA:
//  1. Que la pantalla NO cambie (la rejilla de 4 y 3 columnas sigue viva).
//  2. Que al imprimir la cabecera quepa en UNA línea, con el diagnóstico
//     llenando el blanco de la derecha y la fecha de ingreso cerrándola.
//  3. Que las celdas VACÍAS desaparezcan en papel (lo no registrado no gasta
//     hoja) sin dejar separadores « · » huérfanos.
//  4. Que el PLAN conserve su franja propia: es lo que el turno que entra
//     viene a leer, y comprimirlo hasta perderlo sería ahorrar papel al costo
//     de la entrega.
//
// Uso: node build/checks/entrega_impresion.js
const path = require('path');
const { chromium } = require('playwright-core');
const archivo = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'v2', 'index.html'));
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const ok = (l, c) => eq(l, !!c, true);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  // Ancho equivalente a A4 apaisado con margen 8mm (≈281 mm ≈ 1062 px a 96 dpi)
  const p = await b.newPage({ viewport: { width: 1080, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(()=>{
    window.google={script:{run:{withSuccessHandler(k){return{withFailureHandler(){return{
      api(a){ setTimeout(()=>k({ok:true,data:(a==='GET_CONFIG_UI'?{NUM_CAMAS:18,BANNERS:{}}:null)}),5); }
    };}};}}}};
  });
  await p.goto('file://' + archivo);
  await p.waitForTimeout(1200);

  // Entrega con 3 pacientes: uno completo, uno con campos vacíos, uno sin evolución.
  await p.evaluate(() => {
    setTab('E');          // sin la pestaña activa el contenedor va oculto y todo mide 0
    ENT_DATA = {
      fecha: '2026-08-06', turno: 'Dia', kineEntrega: 'DMV', generado: Date.now(),
      fichas: [
        { idCama: '1', ocupada: true, tieneEvo: true, nombre: 'Francisca Araya Veliz',
          edad: 67, sexo: 'F', diagnostico: 'Otros pre y post quirúrgicos con complicación respiratoria',
          diasEstadia: 18, diasVM: 14, fechaIngreso: '2026-07-17',
          viaAerea: 'TOT', soporte: 'VM', modo: 'ACVC',
          params: 'Vt 420 · FR 18 · PEEP 12 · FiO₂ 60% · PaFi 112',
          sas: -3, sedTipo: 'Propofol', bnm: false, cooperacion: 'No evaluable', dva: 'NAD 0.12',
          hemoEstado: 'Estable', secr: 'Abundantes espesas', eventos: ['Prono 19:00', 'KTM nivel 2'],
          ktmRealizada: true, ktmNivel: 2, ktr: 3, evals: [], pendientes: ['Control GSA'],
          plan: 'PLAN MUY LARGO para comprobar que no se corta al imprimir: continuar prono 16 h, '
              + 'control de gases a las 06:00, evaluar destete si PaFi supera 200, mantener sedación '
              + 'en meta, curación de UPP sacra en el turno de la tarde y reevaluar tolerancia. FIN DEL PLAN.',
          firma: 'DMV' },
        { idCama: '2', ocupada: true, tieneEvo: true, nombre: 'Custodio Castillo',
          edad: 76, sexo: 'M', diagnostico: 'Otras neurológicas', diasEstadia: 3, diasVM: 0,
          fechaIngreso: '2026-08-01', viaAerea: 'Natural', soporte: 'Ambiente', modo: '',
          params: '', sas: '', sedTipo: '', bnm: false, cooperacion: '', dva: '',
          hemoEstado: '', secr: '', eventos: [], ktmRealizada: false, ktmNivel: '', ktr: 0,
          evals: [], pendientes: [], plan: 'Deambulación asistida.', firma: 'MFB' },
        { idCama: '3', ocupada: true, tieneEvo: false, heredadoDe: '', nombre: 'Sin Evolucion',
          edad: 50, sexo: 'M', diagnostico: 'Shock séptico', diasEstadia: 1, diasVM: 1,
          fechaIngreso: '2026-08-05', viaAerea: 'TOT', soporte: 'VM', modo: 'ACVC',
          params: '', eventos: [], evals: [], pendientes: [], plan: '', firma: '' },
      ],
    };
    renderEntrega(ENT_DATA);
  });

  const hayFichas = await p.evaluate(() => document.querySelectorAll('.ent-ficha').length);
  eq('la entrega renderiza las 3 fichas', hayFichas, 3);

  /* ══ 1 · PANTALLA: nada cambió ══════════════════════════════════════ */
  console.log('\n1 · En pantalla la ficha se queda como estaba');
  const pant = await p.evaluate(() => {
    // Null-safe a propósito: contra el código anterior varios de estos nodos
    // NO existen, y la guardia debe decirlo con ❌ legibles en vez de reventar.
    const disp = sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).display : '(no existe)'; };
    const p1 = getComputedStyle(document.querySelector('.ent-p1'));
    const c = getComputedStyle(document.querySelector('.ent-c'));
    return {
      display: p1.display, cols: p1.gridTemplateColumns.split(' ').length,
      celda: c.display,
      etiquetaVisible: disp('.ent-k') !== 'none' && disp('.ent-k') !== '(no existe)',
      ingOculto: disp('.ent-fh-ing') === 'none',
      vaciaVisible: disp('.ent-c-vacia') !== 'none' && disp('.ent-c-vacia') !== '(no existe)',
      // En pantalla el textarea es visible: acá se comprueba que sus 2 filas
      // NO alcanzan para este plan largo — es el recorte que el espejo evita.
      textareaRecorta: (t => !!t && t.scrollHeight > t.clientHeight + 1)
        (document.querySelector('#entDoc .ent-pend textarea')),
    };
  });
  eq('el piso 1 sigue siendo una rejilla', pant.display, 'grid');
  eq('…de 4 columnas', pant.cols, 4);
  eq('las celdas siguen siendo bloques', pant.celda, 'block');
  ok('las etiquetas (VÍA AÉREA, PARÁMETROS…) siguen visibles', pant.etiquetaVisible);
  ok('la celda vacía sigue mostrando su «—» (la rejilla no se descuadra)', pant.vaciaVisible);
  ok('la fecha de ingreso NO se ve en pantalla', pant.ingOculto);
  ok('el textarea de 2 filas NO alcanza para un plan largo (recorta)', pant.textareaRecorta);

  /* ══ 2 · PAPEL: compacta ════════════════════════════════════════════ */
  console.log('\n2 · Al imprimir se compacta');
  await p.evaluate(() => { if (typeof _entEspejarPlanes === 'function') _entEspejarPlanes(); });
  await p.emulateMedia({ media: 'print' });
  await p.waitForTimeout(150);
  const imp = await p.evaluate(() => {
    const disp = sel => { const e = document.querySelector(sel); return e ? getComputedStyle(e).display : '(no existe)'; };
    const p1 = getComputedStyle(document.querySelector('.ent-p1'));
    const dx = document.querySelector('.ent-fh-dx');
    const fh = document.querySelector('.ent-fh');
    return {
      pisoDisplay: p1.display,
      celda: disp('.ent-c'),
      etiquetaOculta: disp('.ent-k') === 'none',
      vaciaOculta: disp('.ent-c-vacia') === 'none',
      ingVisible: disp('.ent-fh-ing') !== 'none' && disp('.ent-fh-ing') !== '(no existe)',
      // ¿la cabecera cabe en UNA línea?
      cabeceraAlto: fh.getBoundingClientRect().height,
      lineaAlto: parseFloat(getComputedStyle(fh).fontSize) * 2.2,
      dxCrece: dx.getBoundingClientRect().width > 60,   // se estiró, no quedó pegado
      // el plan conserva franja propia
      planBloque: disp('.ent-pend') === 'block',
    };
  });
  eq('el piso deja de ser rejilla', imp.pisoDisplay, 'block');
  eq('…y las celdas fluyen en línea', imp.celda, 'inline');
  ok('las etiquetas en mayúsculas desaparecen', imp.etiquetaOculta);
  ok('la celda vacía no gasta papel', imp.vaciaOculta);
  ok('la fecha de ingreso aparece', imp.ingVisible);
  ok('el diagnóstico se estira para llenar el blanco de la derecha', imp.dxCrece);
  ok('la cabecera cabe en UNA línea', imp.cabeceraAlto <= imp.lineaAlto);
  ok('el PLAN conserva su franja propia (es lo que se viene a leer)', imp.planBloque);

  /* El plan LARGO no se puede cortar: el textarea imprimía solo sus 2 filas. */
  const plan = await p.evaluate(() => {
    const box = document.querySelector('#entDoc .ent-pend');
    const ta = box && box.querySelector('textarea');
    const esp = box && box.querySelector('.ent-plan-print');
    if (!esp) return { taOculto:false, espejoVisible:false, texto:'(no existe el espejo)', espejoRecorta:true };
    return {
      taOculto: !ta || getComputedStyle(ta).display === 'none',
      espejoVisible: getComputedStyle(esp).display !== 'none',
      texto: esp.textContent,
      // Lo que importa no es que crezca, sino que NO RECORTE: el textarea
      // muestra solo lo que cabe en sus filas y esconde el resto.
      espejoRecorta: esp.scrollHeight > esp.clientHeight + 1,
    };
  });
  ok('en papel se oculta el textarea', plan.taOculto);
  ok('…y se muestra el espejo con el plan completo', plan.espejoVisible);
  ok('el espejo no recorta nada (el plan sale entero)', !plan.espejoRecorta);
  ok('el texto del plan llegó entero al espejo', /PLAN MUY LARGO/.test(plan.texto) && /FIN DEL PLAN/.test(plan.texto));

  /* ══ 3 · La ganancia es real, no solo letra chica ═══════════════════ */
  console.log('\n3 · Cuánto encoge de verdad');
  const altoImp = await p.evaluate(() =>
    Math.round(document.querySelector('.ent-ficha').getBoundingClientRect().height));
  await p.emulateMedia({ media: 'screen' });
  await p.waitForTimeout(150);
  const altoPant = await p.evaluate(() =>
    Math.round(document.querySelector('.ent-ficha').getBoundingClientRect().height));
  console.log(`   alto de la ficha → pantalla ${altoPant} px · papel ${altoImp} px`);
  const hojas = a => Math.round((a * 17) / 718 * 10) / 10;
  console.log(`   proyectado a 17 pacientes → pantalla ${hojas(altoPant)} hojas · papel ${hojas(altoImp)} hojas`);
  ok('al imprimir la ficha ocupa MENOS que en pantalla', altoImp < altoPant);
  ok('…y el ahorro es de al menos un 30%', altoImp <= altoPant * 0.7);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ entrega_impresion OK');
  process.exit(fails.length ? 1 : 0);
})();
