// stock.js — Guardia del STOCK SIN NUMERAR (v5.17, pedido de Diego ago-2026):
// Aerogen Pro-X y capnógrafos no tienen número, así que no se pueden seguir
// uno por uno: se llevan por CANTIDAD y cada ajuste queda trazado con motivo
// y firma. Parte 1: servicio con repo simulado. Parte 2: la sección en la
// pestaña Ventiladores (tarjetas + modal de ajuste).
// Uso: node build/checks/stock.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

/* ── Parte 1 · servicio ── */
const DB = { STOCK_EQUIPOS: [], MOVIMIENTOS_STOCK: [] };
global.repoLeerTodos = (h, c, val) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(val)); return f; };
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoActualizar = (h, c, id, ch) => { const r = global.repoBuscarPorId(h, c, id); if (r) Object.assign(r, ch); return !!r; };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoUpsert = (h, c, id, o) => { const r = global.repoBuscarPorId(h, c, id); if (r) { Object.assign(r, o); return 'actualizar'; } global.repoInsertar(h, o); return 'crear'; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.conLock = fn => fn();
global.uid = (() => { let n = 0; return p => p + '_' + (++n); })();
global.hoyISO = () => '2026-08-01';
let _t = 0;
global.ahoraTS = () => '2026-08-01 10:' + String(_t++).padStart(2, '0');
global._statISO = f => String(f || '').slice(0, 10);
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global.SpreadsheetApp = { flush: () => {} };
eval(fs.readFileSync(path.join(v2, 'svc_equipos.gs'), 'utf8'));

const ctx = { firma: 'DMV', email: 'd@x' };
let r = guardarStockEquipo({ nombre: 'Aerogen Pro-X', marca: 'Aerogen', categoria: 'Nebulización',
  cantidad: 10, estado: 'Operativo', fecha: '2026-07-31', motivo: 'Carga inicial' }, ctx);
eq('alta del tipo de equipo sin número', r.ok, true);
const idA = r.data.id;
eq('la carga inicial deja su movimiento', DB.MOVIMIENTOS_STOCK.length, 1);
eq('…con la cantidad como delta', DB.MOVIMIENTOS_STOCK[0].DELTA, 10);

r = guardarStockEquipo({ nombre: 'Capnógrafo Dräger', marca: 'Dräger', categoria: 'Capnografía',
  cantidad: 4, estado: 'De baja' }, ctx);
const idD = r.data.id;
eq('los Dräger quedan DE BAJA (decisión de Diego)', DB.STOCK_EQUIPOS.find(x => x.ID_STOCK === idD).ESTADO, 'De baja');

// Sacar 2 con motivo
r = ajustarStockEquipo({ id: idA, delta: -2, motivo: 'Dado de baja / falla', detalle: 'membrana' }, ctx);
eq('sacar 2 unidades deja 8', r.ok && r.data.cantidad, 8);
const mov = DB.MOVIMIENTOS_STOCK[DB.MOVIMIENTOS_STOCK.length - 1];
eq('el ajuste queda trazado con motivo, detalle y firma',
  mov.DELTA === -2 && mov.CANTIDAD_FINAL === 8 && mov.MOTIVO === 'Dado de baja / falla' && mov.DETALLE === 'membrana' && mov.FIRMA === 'DMV', true);

// Reponer
r = ajustarStockEquipo({ id: idA, delta: 1, motivo: 'Compra / reposición' }, ctx);
eq('reponer 1 deja 9', r.data.cantidad, 9);

// Rechazos
r = ajustarStockEquipo({ id: idA, delta: -99, motivo: 'Pérdida o extravío' });
eq('no se puede sacar más de lo que hay', r.ok, false);
eq('…y la cantidad NO cambió', DB.STOCK_EQUIPOS.find(x => x.ID_STOCK === idA).CANTIDAD, 9);
r = ajustarStockEquipo({ id: idA, delta: -1, motivo: '   ' });
eq('el motivo es obligatorio', r.ok, false);
r = ajustarStockEquipo({ id: idA, delta: 0, motivo: 'Otro' });
eq('un ajuste de cero se rechaza', r.ok, false);
r = ajustarStockEquipo({ id: 'no-existe', delta: -1, motivo: 'Otro' });
eq('id inexistente se rechaza', r.ok, false);

// Editar sin tocar la cantidad
r = guardarStockEquipo({ id: idA, nombre: 'Aerogen Pro-X', obs: 'revisar en bodega' }, ctx);
eq('editar sin mandar cantidad NO altera el stock', DB.STOCK_EQUIPOS.find(x => x.ID_STOCK === idA).CANTIDAD, 9);

/* ── Reparto por cama (v5.18): los equipos sin número TAMBIÉN van a una cama
      definida; no importa cuál de los 10, sino cuántos hay ahí. ── */
r = asignarStockACama({ id: idA, idCama: '7', delta: 1 }, ctx);
eq('asignar 1 a la cama 7', r.ok && r.data.enCama, 1);
eq('…y baja el disponible', r.data.disponible, 8);
r = asignarStockACama({ id: idA, idCama: '7', delta: 2 }, ctx);
eq('se pueden asignar varios a la misma cama', r.data.enCama, 3);
r = asignarStockACama({ id: idA, idCama: '4', delta: 1 }, ctx);
eq('y repartir a otra cama', r.data.enCama, 1);
const movAsig = DB.MOVIMIENTOS_STOCK[DB.MOVIMIENTOS_STOCK.length - 1];
eq('el reparto queda trazado desde/hacia', movAsig.DESDE === 'Disponible' && movAsig.HACIA === 'Cama 4', true);
eq('…sin alterar el total (delta 0)', movAsig.DELTA, 0);

r = asignarStockACama({ id: idA, idCama: '9', delta: 99 }, ctx);
eq('no se asigna más de lo disponible', r.ok, false);
r = asignarStockACama({ id: idA, idCama: '9', delta: -1 }, ctx);
eq('no se devuelve de una cama que no tiene', r.ok, false);
r = asignarStockACama({ id: idA, idCama: '', delta: 1 }, ctx);
eq('la cama es obligatoria', r.ok, false);

// Con 4 en camas, sacar del inventario más de lo disponible se rechaza
r = ajustarStockEquipo({ id: idA, delta: -7, motivo: 'Dado de baja / falla' }, ctx);
eq('no se dan de baja unidades que están en una cama', r.ok, false);
r = ajustarStockEquipo({ id: idA, delta: -5, motivo: 'Dado de baja / falla' }, ctx);
eq('…pero sí las que están disponibles', r.ok, true);

r = asignarStockACama({ id: idA, idCama: '7', delta: -3 }, ctx);
eq('devolver deja la cama sin el equipo', r.data.enCama, 0);
eq('y el reparto ya no la menciona', JSON.stringify(_stkAsig(DB.STOCK_EQUIPOS.find(x => x.ID_STOCK === idA))), '{"4":1}');

const lista = obtenerStockEquipos();
eq('la lectura devuelve los tipos activos', lista.data.length, 2);
const aer = lista.data.find(x => x.id === idA);
eq('…con su cantidad al día', aer.cantidad, 4);
eq('…separando lo que está en camas de lo disponible', aer.enUso === 1 && aer.disponible === 3, true);
eq('…y el reparto por cama', JSON.stringify(aer.asignacion), '{"4":1}');
eq('…y el último ajuste para la tarjeta', aer.ultimo.motivo, 'Devuelto de cama');
const hist = obtenerMovimientosStock(idA, 20);
eq('el historial trae los ajustes, lo más nuevo primero', hist.data.movs[0].motivo, 'Devuelto de cama');
eq('y cuenta todos los del ítem', hist.data.movs.length, 8);

/* ── Parte 2 · UI ── */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window._envios = [];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) {
        window._envios.push({ a, d });
        const STK = [
          { id: 's1', nombre: 'Aerogen Pro-X', marca: 'Aerogen', modelo: 'Pro-X', categoria: 'Nebulización',
            cantidad: 10, asignacion: { '3': 1, '7': 2 }, enUso: 3, disponible: 7,
            estado: 'Operativo', obs: 'Nebulizador de malla · sin numerar',
            ultimo: { fecha: '2026-07-31', delta: 10, motivo: 'Carga inicial', firma: 'DMV' } },
          { id: 's2', nombre: 'Capnógrafo Nihon Kohden', marca: 'Nihon Kohden', categoria: 'Capnografía',
            cantidad: 5, asignacion: {}, enUso: 0, disponible: 5, estado: 'Operativo', ultimo: null },
          { id: 's3', nombre: 'Capnógrafo Dräger', marca: 'Dräger', categoria: 'Capnografía',
            cantidad: 4, asignacion: {}, enUso: 0, disponible: 4, estado: 'De baja', obs: 'No se ocupan', ultimo: null },
        ];
        const VMS = [
          { id: 'v1', nombre: 'PB 1', activo: true, ubicTipo: 'CAMA', ubicDetalle: '3', estado: 'Operativo' },
          { id: 'v2', nombre: 'V60 Nº1', activo: true, ubicTipo: 'CAMA', ubicDetalle: '3', estado: 'Operativo' },
          { id: 'v3', nombre: 'Airvo2 Nº3', activo: true, ubicTipo: 'CAMA', ubicDetalle: '3', estado: 'Operativo' },
        ];
        const R = { GET_CONFIG_UI: { NUM_CAMAS: 12, BANNERS: {} }, GET_VENTILADORES: VMS, GET_TODAS_CAMAS: [],
          GET_STOCK: STK, AJUSTAR_STOCK: { cantidad: 9 },
          GET_MOVS_STOCK: { movs: [{ fecha: '2026-08-01', delta: -1, final: 9, motivo: 'Dado de baja / falla', detalle: 'membrana', firma: 'DMV' }] } };
        setTimeout(() => okF({ ok: true, data: R[a] !== undefined ? R[a] : null }), 5);
      }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(v2, 'index.html'));
  await p.waitForTimeout(600);

  const UI = await p.evaluate(async () => {
    setTab('V'); vmCargar();
    await new Promise(r => setTimeout(r, 260));
    const t = $('stkBody').textContent;
    return {
      seccion: /Stock sin numerar/i.test(t),
      aerogen: /Aerogen Pro-X/.test(t) && /10/.test(t),
      nihon: /Nihon Kohden/.test(t),
      drager: /Dräger/.test(t) && /De baja/.test(t),
      ultimo: /Último ajuste/.test(t),
      tarjetas: document.querySelectorAll('#stkBody .card').length,
    };
  });
  eq('la sección de stock aparece en la pestaña Ventiladores', UI.seccion, true);
  eq('Aerogen con su cantidad', UI.aerogen, true);
  eq('capnógrafos Nihon presentes', UI.nihon, true);
  eq('los Dräger se muestran DE BAJA', UI.drager, true);
  eq('la tarjeta informa el último ajuste', UI.ultimo, true);
  eq('una tarjeta por tipo', UI.tarjetas, 3);

  /* ── v5.18 · el casillero de la cama muestra TODOS sus equipos (antes solo
        uno) y también los de stock asignados a esa cama ── */
  const CAMA = await p.evaluate(() => {
    const slot = n => [...document.querySelectorAll('#vmBody .vmz-slot')].find(s => s.dataset.det === String(n));
    const s3 = slot(3), s7 = slot(7);
    return {
      tresEquipos: [...s3.querySelectorAll('.vmz-chip:not(.vmz-stk)')].map(c => c.textContent.trim()),
      stockEnCama3: [...s3.querySelectorAll('.vmz-chip.vmz-stk')].map(c => c.textContent.trim()),
      stockEnCama7: [...s7.querySelectorAll('.vmz-chip.vmz-stk')].map(c => c.textContent.trim()),
      // REGLA NUEVA (Diego, ago-2026): el chip de stock SÍ se arrastra — mueve
      // UNA UNIDAD (cantidad, no una unidad identificable) y lleva su origen.
      stkArrastrable: [...s3.querySelectorAll('.vmz-chip.vmz-stk')].every(c => c.getAttribute('draggable') === 'true' && c.dataset.stk),
      repartoEnTarjeta: /En camas/.test($('stkBody').textContent),
      disponibles: /7\s*\/\s*10/.test($('stkBody').textContent.replace(/\s+/g, ' ')),
    };
  });
  eq('la cama 3 muestra sus TRES equipos con nombre', CAMA.tresEquipos.length, 3);
  eq('…y son los del inventario (VM + V60 + Airvo)', /PB 1/.test(CAMA.tresEquipos.join('|')) && /V60/.test(CAMA.tresEquipos.join('|')) && /Airvo/.test(CAMA.tresEquipos.join('|')), true);
  eq('el stock asignado aparece en su cama', /Aerogen/.test(CAMA.stockEnCama3.join('')), true);
  eq('…con la cantidad cuando hay más de uno', /×2/.test(CAMA.stockEnCama7.join('')), true);
  eq('el chip de stock SE ARRASTRA y mueve una unidad (regla ago-2026)', CAMA.stkArrastrable, true);
  eq('la tarjeta resume en qué camas está', CAMA.repartoEnTarjeta, true);
  eq('…y muestra disponibles sobre el total', CAMA.disponibles, true);

  const ASIG = await p.evaluate(async () => {
    stkAbrirCama('s1', 5);
    await new Promise(r => setTimeout(r, 60));
    const o = { titulo: $('stkModTit').textContent,
      camaVisible: !$('stkCamaRow').classList.contains('hidden'),
      motivoOculto: $('stkMotivoRow').classList.contains('hidden'),
      resumen: $('stkResumen').textContent };
    window._envios = [];
    stkAplicar();
    await new Promise(r => setTimeout(r, 120));
    o.envio = (window._envios.find(x => x.a === 'ASIGNAR_STOCK') || {}).d;
    // devolver desde una cama que no tiene ⇒ bloqueado
    stkAbrirCama('s1', 9);
    $('stkDir').value = '-1'; stkDirCambio();
    o.avisoVacia = $('stkResumen').textContent;
    window._envios = [];
    stkAplicar();
    await new Promise(r => setTimeout(r, 60));
    o.bloqueado = !window._envios.some(x => x.a === 'ASIGNAR_STOCK');
    stkCerrar();
    return o;
  });
  eq('tocar el chip abre el reparto de esa cama', /cama 5/i.test(ASIG.titulo) && ASIG.camaVisible, true);
  eq('el reparto no pide motivo de baja', ASIG.motivoOculto, true);
  eq('anticipa cómo queda la cama y el disponible', /cama 5/.test(ASIG.resumen) && /disponibles/.test(ASIG.resumen), true);
  eq('asignar envía la cama y delta positivo', ASIG.envio && ASIG.envio.idCama === '5' && ASIG.envio.delta === 1, true);
  eq('avisa si la cama no tiene unidades que devolver', /tiene 0/.test(ASIG.avisoVacia), true);
  eq('…y no deja registrar esa devolución', ASIG.bloqueado, true);

  const MOD = await p.evaluate(async () => {
    stkAbrir('s1', -1);
    await new Promise(r => setTimeout(r, 60));
    const o = { abierto: $('stkMod').classList.contains('on'), titulo: $('stkModTit').textContent };
    stkPaso(1); stkPaso(1);            // 1 → 3
    o.cantidad = v('stkCant');
    o.resumen = $('stkResumen').textContent;
    // tope: no se puede sacar más de lo que hay
    $('stkCant').value = '99'; stkResumen();
    o.tope = $('stkResumen').textContent;
    window._envios = [];
    stkAplicar();
    await new Promise(r => setTimeout(r, 60));
    o.bloqueado = window._envios.length === 0;   // 99 > 10 ⇒ no envía
    $('stkCant').value = '2'; stkResumen();
    stkAplicar();
    await new Promise(r => setTimeout(r, 120));
    o.envio = (window._envios.find(x => x.a === 'AJUSTAR_STOCK') || {}).d;
    o.cerrado = !$('stkMod').classList.contains('on');
    return o;
  });
  eq('el modal se abre para sacar', MOD.abierto && /Sacar/.test(MOD.titulo), true);
  eq('los botones + / − mueven la cantidad', MOD.cantidad, '3');
  eq('el resumen anticipa cuántas quedan', /quedarán/.test(MOD.resumen), true);
  eq('avisa cuando se pide más de lo que hay', /Solo hay 10/.test(MOD.tope), true);
  eq('…y NO deja registrar ese ajuste', MOD.bloqueado, true);
  eq('registrar envía delta negativo con motivo', MOD.envio && MOD.envio.delta === -2 && !!MOD.envio.motivo, true);
  eq('y cierra el modal', MOD.cerrado, true);

  const REP = await p.evaluate(async () => {
    stkAbrir('s2', 1);
    await new Promise(r => setTimeout(r, 60));
    const o = { titulo: $('stkModTit').textContent, motivo: v('stkMotivo') };
    window._envios = [];
    stkAplicar();
    await new Promise(r => setTimeout(r, 120));
    o.envio = (window._envios.find(x => x.a === 'AJUSTAR_STOCK') || {}).d;
    return o;
  });
  eq('reponer abre con su propio motivo por defecto', /Reponer/.test(REP.titulo) && REP.motivo === 'Compra / reposición', true);
  eq('…y envía delta POSITIVO', REP.envio && REP.envio.delta, 1);

  const HIS = await p.evaluate(async () => {
    stkHistorial('s1');
    await new Promise(r => setTimeout(r, 140));
    const t = $('ucDet').textContent;
    const abierto = $('ucOvl').classList.contains('on');
    _ucFin(false);
    return { abierto, tieneMov: /Dado de baja/.test(t) && /membrana/.test(t) };
  });
  eq('el historial se abre con sus ajustes', HIS.abierto && HIS.tieneMov, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
