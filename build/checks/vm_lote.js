// vm_lote.js — Guardia del movimiento de ventiladores EN LOTE (v5.5).
// Pedido de Diego: confirmar uno por uno era lento con mantención de equipos.
// Se verifica la regla dura: TODO O NADA (si un movimiento del lote no se
// puede, no se aplica ninguno) y que el lote permita INTERCAMBIAR camas, que
// moviendo de a uno era imposible.
// Uso: node build/checks/vm_lote.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

/* ── 1 · Servicio en Node con repo simulado ── */
function cargar(equipos) {
  const hojas = { VENTILADORES: JSON.parse(JSON.stringify(equipos)), MOVIMIENTOS_VM: [] };
  const sandbox = {
    conLock: fn => fn(),
    repoLeerTodos: h => hojas[h],
    repoBuscarPorId: (h, k, id) => hojas[h].find(x => String(x[k]) === String(id)) || null,
    repoActualizar: (h, k, id, campos) => { const f = hojas[h].find(x => String(x[k]) === String(id)); if (f) Object.assign(f, campos); },
    repoInsertar: (h, fila) => hojas[h].push(fila),
    repoUpsert: () => {},
    esVerdadero: v => v === true || v === 'TRUE' || v === 'true',
    _statISO: s => s || '', hoyISO: () => '2026-08-05', ahoraTS: () => '2026-08-05 10:00',
    uid: p => p + '_' + Math.random().toString(36).slice(2, 8),
    ok: d => ({ ok: true, data: d }), err: (m, c) => ({ ok: false, error: m, codigo: c }),
    ERR: { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO' },
    DriveApp: {}, Utilities: {}, CacheService: {}, console,
    leerConfig: (k, d) => d, escribirConfig: () => {},
  };
  const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'v2', 'svc_equipos.gs'), 'utf8');
  const fn = new Function(...Object.keys(sandbox), src + '\n;return { moverVentiladoresLote };');
  return { api: fn(...Object.values(sandbox)), hojas };
}

const EQUIPOS = [
  { ID_VM: 'VM1', NOMBRE: 'Servo 1', ACTIVO: true, UBIC_TIPO: 'CAMA', UBIC_DETALLE: '1', ESTADO: 'Operativo' },
  { ID_VM: 'VM2', NOMBRE: 'Servo 2', ACTIVO: true, UBIC_TIPO: 'CAMA', UBIC_DETALLE: '2', ESTADO: 'Operativo' },
  { ID_VM: 'VM3', NOMBRE: 'Servo 3', ACTIVO: true, UBIC_TIPO: 'BODEGA', UBIC_DETALLE: '', ESTADO: 'Operativo' },
  { ID_VM: 'VM4', NOMBRE: 'Servo 4', ACTIVO: false, UBIC_TIPO: 'BODEGA', UBIC_DETALLE: '', ESTADO: 'De baja' },
];

/* Lote válido de 3 equipos */
{
  const { api, hojas } = cargar(EQUIPOS);
  const r = api.moverVentiladoresLote({ movimientos: [
    { idVm: 'VM1', tipo: 'EQUIPOS', motivo: 'Mantención programada' },
    { idVm: 'VM2', tipo: 'PASILLO' },
    { idVm: 'VM3', tipo: 'CAMA', detalle: '1' },
  ] }, { firma: 'DMV', email: 'd@x.cl' });
  eq('lote válido de 3 equipos se aplica', r.ok, true);
  eq('informa el total movido', r.data.total, 3);
  eq('cada movimiento deja su registro en el libro', hojas.MOVIMIENTOS_VM.length, 3);
  eq('el equipo de bodega quedó en la cama 1', hojas.VENTILADORES.find(x => x.ID_VM === 'VM3').UBIC_DETALLE, '1');
  eq('el que iba a mantención cambió de ubicación', hojas.VENTILADORES.find(x => x.ID_VM === 'VM1').UBIC_TIPO, 'EQUIPOS');
  eq('el registro guarda desde y hacia', /Cama 1/.test(hojas.MOVIMIENTOS_VM[0].DESDE) && /Equipos/.test(hojas.MOVIMIENTOS_VM[0].HACIA), true);
  eq('queda la firma de quien movió', hojas.MOVIMIENTOS_VM[0].FIRMA, 'DMV');
}

/* INTERCAMBIO entre camas: imposible de a uno, válido en lote */
{
  const { api, hojas } = cargar(EQUIPOS);
  const r = api.moverVentiladoresLote({ movimientos: [
    { idVm: 'VM1', tipo: 'CAMA', detalle: '2' },
    { idVm: 'VM2', tipo: 'CAMA', detalle: '1' },
  ] }, {});
  eq('intercambiar dos ventiladores entre camas es válido en lote', r.ok, true);
  eq('Servo 1 quedó en la cama 2', hojas.VENTILADORES.find(x => x.ID_VM === 'VM1').UBIC_DETALLE, '2');
  eq('Servo 2 quedó en la cama 1', hojas.VENTILADORES.find(x => x.ID_VM === 'VM2').UBIC_DETALLE, '1');
}

/* TODO O NADA: un movimiento inválido cancela el lote completo */
const casos = [
  ['dos equipos a la misma cama', [{ idVm: 'VM1', tipo: 'CAMA', detalle: '5' }, { idVm: 'VM3', tipo: 'CAMA', detalle: '5' }], /dos ventiladores/i],
  ['una cama que quedará ocupada', [{ idVm: 'VM3', tipo: 'CAMA', detalle: '2' }], /dos ventiladores|cama 2/i],
  ['un equipo dado de baja', [{ idVm: 'VM1', tipo: 'PASILLO' }, { idVm: 'VM4', tipo: 'PASILLO' }], /baja/i],
  ['cama sin número', [{ idVm: 'VM1', tipo: 'CAMA', detalle: '' }], /falta el número/i],
  ['el mismo equipo dos veces', [{ idVm: 'VM1', tipo: 'PASILLO' }, { idVm: 'VM1', tipo: 'BODEGA' }], /dos veces/i],
  ['destino inexistente', [{ idVm: 'VM1', tipo: 'MARTE' }], /destino inválido/i],
  ['ventilador inexistente', [{ idVm: 'VM99', tipo: 'PASILLO' }], /no encontrado/i],
];
for (const [nombre, movs, patron] of casos) {
  const { api, hojas } = cargar(EQUIPOS);
  const r = api.moverVentiladoresLote({ movimientos: movs }, {});
  eq(`rechaza: ${nombre}`, r.ok, false);
  eq(`  · explica el motivo (${nombre})`, patron.test(r.error), true);
  eq(`  · NO movió nada (${nombre})`, JSON.stringify(hojas.VENTILADORES) === JSON.stringify(EQUIPOS) && hojas.MOVIMIENTOS_VM.length === 0, true);
}

/* Lote vacío */
{
  const { api } = cargar(EQUIPOS);
  eq('lote vacío se rechaza con aviso', /no hay movimientos/i.test(cargar(EQUIPOS).api.moverVentiladoresLote({ movimientos: [] }, {}).error), true);
}

/* ── 2 · UI: la cola acumula, edita y aplica ── */
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const llamadas = [];
  await p.exposeFunction('__log', (a, d) => llamadas.push({ a, d }));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) { window.__log(a, d);
        const R = { GET_CONFIG_UI: { NUM_CAMAS: 6, BANNERS: {} }, GET_TODAS_CAMAS: [], GET_CATALOGO: [],
          GET_VENTILADORES: [
            { id: 'VM1', nombre: 'Servo 1', activo: true, ubicTipo: 'CAMA', ubicDetalle: '1', ubicTxt: 'Cama 1', estado: 'Operativo' },
            { id: 'VM2', nombre: 'Servo 2', activo: true, ubicTipo: 'CAMA', ubicDetalle: '2', ubicTxt: 'Cama 2', estado: 'Operativo' }],
          MOVER_VENTILADORES_LOTE: { total: 2 } };
        setTimeout(() => ok({ ok: true, data: R[a] !== undefined ? R[a] : null }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(800);

  const UI = await p.evaluate(async () => {
    VM_ALL = [{ id: 'VM1', nombre: 'Servo 1', activo: true, ubicTxt: 'Cama 1' },
      { id: 'VM2', nombre: 'Servo 2', activo: true, ubicTxt: 'Cama 2' }];
    const o = {};
    o.colaOcultaAlInicio = $('vmCola').classList.contains('hidden');
    // el selector de camas se puebla desde el censo: en el arnés se llena a mano
    $('vmmCama').innerHTML = [1,2,3,4,5,6].map(n => `<option value="${n}">Cama ${n}</option>`).join('');
    // agregar dos movimientos a la lista (intercambio entre camas)
    $('vmmId').value = 'VM1'; $('vmmTipo').value = 'CAMA'; $('vmmCama').value = '2';
    vmColaAgregar();
    $('vmmId').value = 'VM2'; $('vmmTipo').value = 'CAMA'; $('vmmCama').value = '1';
    vmColaAgregar();
    await new Promise(r => setTimeout(r, 100));
    o.colaVisible = !$('vmCola').classList.contains('hidden');
    o.contador = $('vmColaN').textContent;
    o.listaTexto = $('vmColaLista').textContent.replace(/\s+/g, ' ').trim();
    // re-agregar el mismo equipo actualiza en vez de duplicar
    $('vmmId').value = 'VM1'; $('vmmTipo').value = 'BODEGA';
    vmColaAgregar();
    o.trasReagregar = VM_COLA.length;
    o.destinoActualizado = VM_COLA.find(m => m.idVm === 'VM1').tipo;
    // quitar uno
    vmColaQuitar('VM2');
    o.trasQuitar = VM_COLA.length;
    return o;
  });
  eq('ui · la lista parte oculta', UI.colaOcultaAlInicio, true);
  eq('ui · al agregar aparece la barra de pendientes', UI.colaVisible, true);
  eq('ui · el contador muestra 2', UI.contador, '2');
  eq('ui · la lista nombra equipo y destino', /Servo 1.*Cama 2/.test(UI.listaTexto), true);
  eq('ui · re-agregar el mismo equipo NO duplica', UI.trasReagregar, 2);
  eq('ui · y actualiza su destino', UI.destinoActualizado, 'BODEGA');
  eq('ui · se puede quitar un pendiente', UI.trasQuitar, 1);

  const APLICA = await p.evaluate(async () => {
    VM_COLA = [{ idVm: 'VM1', tipo: 'CAMA', detalle: '2' }, { idVm: 'VM2', tipo: 'CAMA', detalle: '1' }];
    vmColaRender();
    vmColaAplicar();
    await new Promise(r => setTimeout(r, 200));
    $('ucOk').click();
    await new Promise(r => setTimeout(r, 300));
    return { cola: VM_COLA.length, oculta: $('vmCola').classList.contains('hidden') };
  });
  const env = llamadas.filter(x => x.a === 'MOVER_VENTILADORES_LOTE');
  eq('ui · se envía UNA sola llamada con todo el lote', env.length, 1);
  eq('ui · con los 2 movimientos dentro', env[0] && env[0].d.movimientos.length, 2);
  eq('ui · la lista queda vacía tras aplicar', APLICA.cola, 0);
  eq('ui · y la barra se oculta', APLICA.oculta, true);

  const VACIAR = await p.evaluate(async () => {
    VM_COLA = [{ idVm: 'VM1', tipo: 'BODEGA' }]; vmColaRender();
    vmColaVaciar();
    return { cola: VM_COLA.length, oculta: $('vmCola').classList.contains('hidden') };
  });
  eq('ui · vaciar descarta los pendientes sin mover nada', VACIAR.cola === 0 && VACIAR.oculta, true);
  const sinEnvio = llamadas.filter(x => x.a === 'MOVER_VENTILADORES_LOTE').length;
  eq('ui · vaciar no llama al servidor', sinEnvio, 1);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
