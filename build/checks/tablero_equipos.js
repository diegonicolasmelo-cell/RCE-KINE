// tablero_equipos.js — Guardia del TABLERO DE LA PESTAÑA VENTILADORES
// (pedido de Diego, ago-2026):
//
//  1. La BODEGA se divide en TRES: VMI · VNI · CNAF, con el ancho de cada
//     división PROPORCIONAL a cuántos equipos tiene. Las tres son destino
//     BODEGA (se puede soltar en cualquiera). Los equipos de APOYO no tienen
//     división propia pero NO pueden desaparecer del tablero: van en su franja.
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

    // ── 1 · Bodega en tres divisiones ──
    const divs = [...document.querySelectorAll('#vmBody .vmz-bod-div')];
    r.nDivs = divs.length;
    r.titulos = divs.map(d => d.querySelector('.vmz-bod-t').textContent.trim().replace(/\s+/g, ' '));
    r.conteos = divs.map(d => d.querySelectorAll('.vmz-chip').length);
    // El ancho es PROPORCIONAL: 5 VM contra 1 CNAF ⇒ la primera es más ancha
    const w = divs.map(d => d.getBoundingClientRect().width);
    r.anchoVMmayor = w[0] > w[1] && w[1] > w[2];
    r.proporcional = Math.abs((w[0] / w[2]) - 5) < 1.6;   // ~5:1 con el padding
    // Las tres aceptan soltar y todas apuntan a BODEGA
    r.todasBodega = divs.every(d => d.dataset.tipo === 'BODEGA');
    r.todasSueltan = divs.every(d => typeof d.ondrop === 'function' && typeof d.onclick === 'function');
    // Los de APOYO no desaparecen
    const ap = document.querySelector('#vmBody .vmz-bod-apoyo');
    r.apoyoVisible = !!ap && ap.querySelectorAll('.vmz-chip').length === 2;
    // Ningún equipo de bodega se perdió: 10 en total repartidos
    r.totalBodega = [...document.querySelectorAll('#vmBody .vmz-bod-div .vmz-chip, #vmBody .vmz-bod-apoyo .vmz-chip')].length;

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
    $('vmBody').innerHTML = vmzTableroHTML(VM_ALL);
    const d2 = [...document.querySelectorAll('#vmBody .vmz-bod-div')];
    r.vaciasSiguen = d2.length === 3;
    r.vaciasConAncho = d2.every(d => d.getBoundingClientRect().width > 20);
    r.sinApoyo = !document.querySelector('#vmBody .vmz-bod-apoyo');
    return r;
  });

  console.log('── 1 · Bodega dividida en VMI · VNI · CNAF ──');
  eq('hay TRES divisiones', R.nDivs, 3);
  eq('…y son VMI, VNI y CNAF en ese orden', R.titulos.map(t => t.split(' ')[1]).join('|'), 'VMI|VNI|CNAF');
  eq('cada equipo cae en su división (5 · 2 · 1)', R.conteos.join('·'), '5·2·1');
  eq('el ancho es proporcional: VMI > VNI > CNAF', R.anchoVMmayor, true);
  eq('…y la proporción sigue al número (≈5:1)', R.proporcional, true);
  eq('las tres son destino BODEGA', R.todasBodega, true);
  eq('en las tres se puede soltar y tocar', R.todasSueltan, true);
  eq('los equipos de APOYO no desaparecen del tablero', R.apoyoVisible, true);
  eq('ningún equipo de bodega se pierde por el camino', R.totalBodega, 10);

  console.log('\n── 2 · Grilla de camas de 6 por fila ──');
  eq('la grilla declara 6 columnas', R.cols, 6);
  eq('están las 18 camas', R.nSlots, 18);
  eq('quedan TRES filas', R.nFilas, 3);
  eq('fila 1 = camas 1 a 6', R.fila1, '1,2,3,4,5,6');
  eq('fila 2 = camas 7 a 12', R.fila2, '7,8,9,10,11,12');
  eq('fila 3 = camas 13 a 18', R.fila3, '13,14,15,16,17,18');

  console.log('\n── 3 · Bordes ──');
  eq('con una sola categoría siguen las tres divisiones', R.vaciasSiguen, true);
  eq('…y las vacías conservan ancho para poder soltar en ellas', R.vaciasConAncho, true);
  eq('sin equipos de apoyo, la franja no se dibuja', R.sinApoyo, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
