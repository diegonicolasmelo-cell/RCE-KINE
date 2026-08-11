// tablero_equipos.js — Guardia del TABLERO DE LA PESTAÑA VENTILADORES
// (pedido de Diego, ago-2026):
//
//  1. La BODEGA se divide en CUATRO: VMI · VNI · CNAF · APOYO, con el ancho
//     de cada división PROPORCIONAL a cuántos equipos tiene. Las cuatro son
//     destino BODEGA (se puede soltar en cualquiera). En APOYO viven además
//     los chips del stock sin numerar, arrastrables hacia las camas.
//  2. La grilla de camas es de SEIS por fila — con 18 camas quedan tres filas
//     exactas: 1-6, 7-12 y 13-18. Es número fijo, no auto-fill: con auto-fill
//     el corte cambiaba con el ancho y las filas dejaban de calzar.
//
// Uso: node build/checks/tablero_equipos.js
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 18, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  const R = await p.evaluate(async () => {
    const r = {};
    // Inventario de ejemplo con las cuatro categorías en bodega, en cantidades
    // distintas a propósito (5 VM · 2 VNI · 1 CNAF · 2 apoyo) para poder medir
    // la proporción de verdad.
    const mk = (id, nombre, cat, tipo, det) => ({ id, nombre, categoria: cat, activo: true,
      estado: 'Operativo', ubicTipo: tipo, ubicDetalle: det || '' });
    VM_ALL = [
      mk('v1', 'Mek 4', 'VM', 'BODEGA'), mk('v2', 'Mek 5', 'VM', 'BODEGA'),
      mk('v3', 'Savina 1', 'VM', 'BODEGA'), mk('v4', 'PB 980', 'VM', 'BODEGA'),
      mk('v5', 'Avea 1', 'VM', 'BODEGA'),
      mk('n1', 'V60 Nº1', 'VNI', 'BODEGA'), mk('n2', 'Carina', 'VNI', 'BODEGA'),
      mk('c1', 'Airvo 2 Nº3', 'CNAF', 'BODEGA'),
      mk('a1', 'MR850', 'APOYO', 'BODEGA'), mk('a2', 'Aerogen', 'APOYO', 'BODEGA'),
      mk('x1', 'Servo U', 'VM', 'CAMA', '3'),
    ];
    DB.length = 0;
    for (let i = 1; i <= 18; i++) DB.push({ ID_CAMA: String(i), OCUPADA: 'FALSE' });
    window.CFG = { NUM_CAMAS: 18 };
    setTab('V');
    $('vmBody').innerHTML = vmzTableroHTML(VM_ALL.filter(x => x.activo));

    // ── 1 · Bodega en cuatro divisiones ──
    const divs = [...document.querySelectorAll('#vmBody .vmz-bod-div')];
    r.nDivs = divs.length;
    r.titulos = divs.map(d => d.querySelector('.vmz-bod-t').textContent.trim().replace(/\s+/g, ' '));
    r.conteos = divs.map(d => d.querySelectorAll('.vmz-chip').length);
    // El ancho es PROPORCIONAL: 5 VM contra 1 CNAF ⇒ la primera es más ancha
    const w = divs.map(d => d.getBoundingClientRect().width);
    r.anchoVMmayor = w[0] > w[1] && w[1] > w[2];
    // Con 4 divisiones y ancho mínimo por división, la razón exacta se
    // comprime: lo que se fija es que 5 equipos pesen BASTANTE más que 1.
    r.proporcional = (w[0] / w[2]) > 2.2;
    // Las tres aceptan soltar y todas apuntan a BODEGA
    r.todasBodega = divs.every(d => d.dataset.tipo === 'BODEGA');
    r.todasSueltan = divs.every(d => typeof d.ondrop === 'function' && typeof d.onclick === 'function');
    // Ningún equipo de bodega se perdió: 10 en total repartidos en las 4
    r.totalBodega = [...document.querySelectorAll('#vmBody .vmz-bod-div .vmz-chip')].length;

    // ── 2 · Grilla de camas: 6 por fila, 3 filas ──
    const grid = document.querySelector('#vmBody .vmz-camgrid');
    r.cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    const slots = [...grid.querySelectorAll('.vmz-slot')];
    r.nSlots = slots.length;
    // Las filas se leen por la coordenada Y: deben salir tres tramos y el
    // primero tiene que empezar en la cama 1 y terminar en la 6.
    const filas = {};
    slots.forEach((s, i) => { const y = Math.round(s.getBoundingClientRect().top);
      (filas[y] = filas[y] || []).push(i + 1); });
    const tramos = Object.keys(filas).sort((a, b) => a - b).map(k => filas[k]);
    r.nFilas = tramos.length;
    r.fila1 = tramos[0] && tramos[0].join(',');
    r.fila2 = tramos[1] && tramos[1].join(',');
    r.fila3 = tramos[2] && tramos[2].join(',');

    // ── 3 · Una bodega vacía no rompe el reparto ──
    VM_ALL = [mk('solo', 'Mek 9', 'VM', 'BODEGA')];
    vmRender();   // el render completo: tablero + tarjetas de gestión
    const d2 = [...document.querySelectorAll('#vmBody .vmz-bod-div')];
    r.vaciasSiguen = d2.length === 4;
    r.vaciasConAncho = d2.every(d => d.getBoundingClientRect().width > 20);
    // Las tarjetas de gestión repiten la distribución del tablero
    const seccs = [...document.querySelectorAll('#vmBody details div')].map(x=>'').length; // (no-op, se mide abajo)
    r.tarjetas4 = ['VMI','VNI','CNAF','APOYO'].every(t => $('vmBody').innerHTML.indexOf('Bodega — ') !== -1 && new RegExp('Bodega — [^(]*'+t).test($('vmBody').innerHTML));
    return r;
  });

  console.log('── 1 · Bodega dividida en VMI · VNI · CNAF · APOYO ──');
  eq('hay CUATRO divisiones', R.nDivs, 4);
  eq('…y son VMI, VNI, CNAF y APOYO en ese orden', R.titulos.map(t => t.split(' ')[1]).join('|'), 'VMI|VNI|CNAF|APOYO');
  eq('cada equipo cae en su división (5 · 2 · 1 · 2)', R.conteos.join('·'), '5·2·1·2');
  eq('el ancho es proporcional: VMI > VNI > CNAF', R.anchoVMmayor, true);
  eq('…y la proporción sigue al número (VMI ≫ CNAF)', R.proporcional, true);
  eq('las cuatro son destino BODEGA', R.todasBodega, true);
  eq('en las cuatro se puede soltar y tocar', R.todasSueltan, true);
  eq('ningún equipo de bodega se pierde por el camino', R.totalBodega, 10);

  console.log('\n── 2 · Grilla de camas de 6 por fila ──');
  eq('la grilla declara 6 columnas', R.cols, 6);
  eq('están las 18 camas', R.nSlots, 18);
  eq('quedan TRES filas', R.nFilas, 3);
  eq('fila 1 = camas 1 a 6', R.fila1, '1,2,3,4,5,6');
  eq('fila 2 = camas 7 a 12', R.fila2, '7,8,9,10,11,12');
  eq('fila 3 = camas 13 a 18', R.fila3, '13,14,15,16,17,18');

  console.log('\n── 3 · Bordes ──');
  eq('con una sola categoría siguen las cuatro divisiones', R.vaciasSiguen, true);
  eq('…y las vacías conservan ancho para poder soltar en ellas', R.vaciasConAncho, true);
  eq('las tarjetas de gestión repiten la distribución en 4', R.tarjetas4, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  
// ══ EL TABLERO EN EL CELULAR (ago-2026, reportado por Diego: «en móvil no se
// ve otros servicios») ══════════════════════════════════════════════════════
// La grilla de 18 camas ocupaba más de una pantalla completa a 390 px, así que
// pasillo, bodega, equipos en mantención y préstamos quedaban enterrados. Bajo
// 760 px se muestran solo las camas CON equipo, con un botón para desplegar
// las 18 cuando hay que soltar algo en una vacía.
// Y el stock sin numerar (dispositivos de apoyo) dejó de vivir desplegado bajo
// el tablero: va dentro del bloque plegado «Tarjetas y gestión».
(async () => {
  const b2 = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const m = await b2.newPage({ viewport: { width: 390, height: 900 }, isMobile: true });
  const errsM = []; m.on('pageerror', e => errsM.push(e.message));
  await m.addInitScript(() => { window.google = { script: { run: { withSuccessHandler(o) { return { withFailureHandler() { return {
    api(a) { setTimeout(() => o({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 18, BANNERS: {} } : null) }), 5); } }; } }; } } } }; });
  await m.goto('file://' + require('path').resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await m.waitForTimeout(600);
  const RM = await m.evaluate(() => {
    VM_ALL = [
      { id: 'v1', nombre: 'Servo U', categoria: 'VMI', activo: true, ubicTipo: 'CAMA', ubicDetalle: '4', estado: 'Operativo' },
      { id: 'v2', nombre: 'PB 980', categoria: 'VMI', activo: true, ubicTipo: 'PASILLO', ubicDetalle: '', estado: 'Operativo' },
      { id: 'v3', nombre: 'V60', categoria: 'VNI', activo: true, ubicTipo: 'BODEGA', ubicDetalle: '', estado: 'Operativo' },
      { id: 'v4', nombre: 'Mek 9', categoria: 'VMI', activo: true, ubicTipo: 'EQUIPOS', ubicDetalle: '', estado: 'En mantención' },
      { id: 'v5', nombre: 'Airvo 2', categoria: 'CNAF', activo: true, ubicTipo: 'PRESTAMO', ubicDetalle: 'UTI', estado: 'Operativo' }];
    STOCK_ALL = [{ id: 's1', nombre: 'Aerogen Pro-X', total: 10, disponible: 7, asignacion: { '4': 2 } }];
    setTab('V'); vmRender();
    // 🪤 offsetParent MIENTE dentro de un <details> cerrado (trampa v5.31):
    // Chrome usa content-visibility, no display:none. Hay que preguntar por el
    // <details> cerrado o los asserts pasan solos.
    const oculto = el => !el || !!el.closest('details:not([open])');
    const zona = t => [...document.querySelectorAll('.vmz-zona')].find(z => z.textContent.includes(t));
    const y = el => Math.round(el.getBoundingClientRect().top + window.scrollY);
    const slots = () => [...document.querySelectorAll('.vmz-slot')];
    const visibles = () => slots().filter(s => s.offsetParent !== null).length;
    const compacto = visibles(), yCompacto = y(zona('Otro servicio'));
    document.querySelector('.vmz-vertodas').click();
    const abierto = visibles(), yAbierto = y(zona('Otro servicio'));
    const rotulo = document.querySelector('.vmz-vertodas').textContent;
    document.querySelector('.vmz-vertodas').click();
    return { compacto, abierto, totales: slots().length, rotulo,
      vuelveACompacto: visibles(),
      ahorroPx: yAbierto - yCompacto,
      otroServicioExiste: !!zona('Otro servicio'),
      equiposMedicosExiste: !!zona('Equipos médicos'),
      stockPlegado: oculto(document.getElementById('stkBody')),
      resumenNombraApoyo: /dispositivos de apoyo/i.test(
        (document.querySelector('#vmBody details summary') || {}).textContent || '') };
  });
  eq('★ en el celular solo se ven las camas CON equipo', RM.compacto, 1);
  eq('…de las 18 que existen', RM.totales, 18);
  eq('★ «Otro servicio» está en el tablero', RM.otroServicioExiste, true);
  eq('…y «Equipos médicos» también', RM.equiposMedicosExiste, true);
  eq('★ esconder las vacías lo acerca >400 px', RM.ahorroPx > 400, true);
  eq('el botón despliega las 18', RM.abierto, 18);
  eq('…y cambia de rótulo', RM.rotulo, 'Solo con equipo');
  eq('…y vuelve a plegarlas', RM.vuelveACompacto, 1);
  eq('★ el stock queda PLEGADO dentro de «Tarjetas y gestión»', RM.stockPlegado, true);
  eq('…y el resumen lo nombra', RM.resumenNombraApoyo, true);
  if (errsM.length) { console.log('❌ errores JS (móvil): ' + errsM.join(' | ')); fails.push('js-movil'); }
  await b2.close();
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();

})();
