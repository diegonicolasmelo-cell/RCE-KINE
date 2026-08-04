// traslado_equipos.js — Al trasladar un paciente, la app pregunta por sus
// equipos (ago-2026).
//
// REPORTE DE DIEGO: María Ramírez se trasladó de la cama 3 (Airvo+V60+PB1) a
// la cama 7 (que ya tenía un Savina) y nadie movió los equipos a mano — el
// traslado del paciente y el movimiento de sus equipos eran dos acciones
// totalmente desconectadas.
//
// De paso se encontró y corrigió un bug relacionado: `moverVentilador(es)Lote`
// rechazaba CUALQUIER segundo equipo en una cama, sin mirar la categoría — así
// que mover el VNI/CNAF de María a la cama 7 (que ya tenía su propio VM,
// el Savina) habría sido rechazado por «la cama ya tiene asignado». Ahora solo
// el VM invasivo es exclusivo por cama; VNI/CNAF/APOYO coexisten con él.
//
// Uso: node build/checks/traslado_equipos.js (requiere playwright-core)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

/* ══ 1 · Servicio en Node: el escenario real de María (cama 3 → 7) ══════ */
console.log('1 · moverVentiladoresLote: VNI/CNAF coexisten con el VM de la cama destino');
function cargar(equipos) {
  const hojas = { VENTILADORES: JSON.parse(JSON.stringify(equipos)), MOVIMIENTOS_VM: [] };
  const sandbox = {
    conLock: fn => fn(), repoLeerTodos: h => hojas[h],
    repoBuscarPorId: (h, k, id) => hojas[h].find(x => String(x[k]) === String(id)) || null,
    repoActualizar: (h, k, id, campos) => { const f = hojas[h].find(x => String(x[k]) === String(id)); if (f) Object.assign(f, campos); },
    repoInsertar: (h, fila) => hojas[h].push(fila), repoUpsert: () => {},
    esVerdadero: v => v === true || v === 'TRUE' || v === 'true',
    _statISO: s => s || '', hoyISO: () => '2026-08-05', ahoraTS: () => '2026-08-05 10:00',
    uid: p => p + '_' + Math.random().toString(36).slice(2, 8),
    ok: d => ({ ok: true, data: d }), err: (m, c) => ({ ok: false, error: m, codigo: c }),
    ERR: { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO' },
    DriveApp: {}, Utilities: {}, CacheService: {}, console,
    leerConfig: (k, d) => d, escribirConfig: () => {},
  };
  const src = fs.readFileSync(path.join(v2, 'svc_equipos.gs'), 'utf8');
  const fn = new Function(...Object.keys(sandbox), src + '\n;return { moverVentiladoresLote, moverVentilador, _vmCategoria };');
  return { api: fn(...Object.values(sandbox)), hojas };
}

const EQUIPOS = [
  { ID_VM: 'AIRVO1', NOMBRE: 'Airvo 2 N°1', CATEGORIA: 'CNAF', ACTIVO: true, UBIC_TIPO: 'CAMA', UBIC_DETALLE: '3', ESTADO: 'Operativo' },
  { ID_VM: 'V60_1',  NOMBRE: 'V60 N°1',     CATEGORIA: 'VNI',  ACTIVO: true, UBIC_TIPO: 'CAMA', UBIC_DETALLE: '3', ESTADO: 'Operativo' },
  { ID_VM: 'PB1',    NOMBRE: 'PB 1',        CATEGORIA: 'VM',   ACTIVO: true, UBIC_TIPO: 'CAMA', UBIC_DETALLE: '3', ESTADO: 'Operativo' },
  { ID_VM: 'SAVINA', NOMBRE: 'Savina 1',    CATEGORIA: 'VM',   ACTIVO: true, UBIC_TIPO: 'CAMA', UBIC_DETALLE: '7', ESTADO: 'Operativo' },
];

{
  const { api, hojas } = cargar(EQUIPOS);
  // María se lleva el Airvo y el V60 (VNI/CNAF) a la cama 7; el PB1 (VM
  // invasivo de la sala 3) NO se marca — se queda en la 3, como es el default.
  const r = api.moverVentiladoresLote({ movimientos: [
    { idVm: 'AIRVO1', tipo: 'CAMA', detalle: '7', motivo: 'Traslado de paciente cama 3→7' },
    { idVm: 'V60_1',  tipo: 'CAMA', detalle: '7', motivo: 'Traslado de paciente cama 3→7' },
  ] }, { firma: 'DMV', email: 'd@x.cl' });
  eq('el lote se aplica (no choca con el Savina de la cama 7)', r.ok, true);
  eq('el Airvo quedó en la cama 7', hojas.VENTILADORES.find(x => x.ID_VM === 'AIRVO1').UBIC_DETALLE, '7');
  eq('el V60 quedó en la cama 7', hojas.VENTILADORES.find(x => x.ID_VM === 'V60_1').UBIC_DETALLE, '7');
  eq('el PB1 (VM invasivo, no marcado) se quedó en la cama 3', hojas.VENTILADORES.find(x => x.ID_VM === 'PB1').UBIC_DETALLE, '3');
  eq('el Savina de la cama 7 no se tocó', hojas.VENTILADORES.find(x => x.ID_VM === 'SAVINA').UBIC_DETALLE, '7');
  eq('quedan los 2 movimientos en el libro', hojas.MOVIMIENTOS_VM.length, 2);
}

/* ══ 2 · Dos VM invasivos SÍ siguen chocando en la misma cama ═══════════ */
console.log('\n2 · Dos ventiladores invasivos en la misma cama siguen rechazándose');
{
  const { api } = cargar(EQUIPOS);
  const r = api.moverVentilador({ idVm: 'PB1', tipo: 'CAMA', detalle: '7' }, {});
  eq('mover el PB1 (VM) a la cama 7 (ya tiene el Savina, otro VM) se rechaza', r.ok, false);
  eq('…con el mensaje de choque de cama', /ya tiene asignado/i.test(r.error), true);
}

/* ══ 3 · Chromium: el diálogo de traslado ofrece los equipos con el
   default correcto por categoría (VM sin marcar, VNI/CNAF/APOYO marcados) ══ */
console.log('\n3 · UI: diálogo de traslado con casillas por equipo');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(()=>{
    window.google={script:{run:{withSuccessHandler(ok){return{withFailureHandler(){return{
      api(a,d){ setTimeout(()=>ok({ok:true,data:(a==='GET_CONFIG_UI'?{NUM_CAMAS:12,BANNERS:{}}:null)}),5); }
    };}};}}}};
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);

  const est = await p.evaluate(() => {
    DB = [
      { ID_CAMA: '3', OCUPADA: true, NOMBRE: 'Maria Ramirez', VM_TAG: 'PB 1', VM_TAG_ID: 'PB1',
        EQUIPOS_PACIENTE: [{ id: 'AIRVO1', n: 'Airvo 2 N°1', c: 'CNAF' }, { id: 'V60_1', n: 'V60 N°1', c: 'VNI' }] },
      { ID_CAMA: '7', OCUPADA: false },
    ];
    MOVECAMA = null;
    mover('3');           // elige origen
    mover('7');           // elige destino vacío → abre el diálogo
    const boxes = [...document.querySelectorAll('#ucDet .eq-mover')].map(x => ({ id: x.dataset.id, checked: x.checked }));
    const overlayOn = $('ucOvl').classList.contains('on');
    return { boxes, overlayOn, detHtml: $('ucDet').innerHTML };
  });
  eq('el diálogo queda abierto con la cama vacía como destino', est.overlayOn, true);
  eq('aparecen las 3 casillas de equipo', est.boxes.length, 3);
  const pb1 = est.boxes.find(x => x.id === 'PB1');
  const airvo = est.boxes.find(x => x.id === 'AIRVO1');
  const v60 = est.boxes.find(x => x.id === 'V60_1');
  eq('el VM invasivo (PB1) parte SIN marcar', pb1 && pb1.checked, false);
  eq('el CNAF (Airvo) parte MARCADO', airvo && airvo.checked, true);
  eq('el VNI (V60) parte MARCADO', v60 && v60.checked, true);
  eq('el texto explica que pregunta por la cama 7 (destino)', /cama 7/.test(est.detHtml), true);

  // Confirmar con los defaults (Airvo + V60 marcados, PB1 no) y capturar el
  // payload real que se le manda a MOVER_VENTILADORES_LOTE.
  const env = await p.evaluate(() => new Promise(resolve => {
    const llamadas = [];
    // GET_TODAS_CAMAS/GET_EVOS_DEL_DIA (los llama recargar() al final del
    // encadenado) esperan un arreglo — con {} el renderizado posterior
    // revienta en EVOS_DIA.filter. Se responde vacío: no afecta las
    // aserciones, que miran los dos PRIMEROS llamados (los que importan aquí).
    window.gs = (accion, datos, ok) => {
      llamadas.push({ accion, datos });
      const data = /^GET_(TODAS_CAMAS|EVOS_DEL_DIA)$/.test(accion) ? [] : {};
      setTimeout(() => ok(data), 5);
    };
    $('ucOk').click();
    setTimeout(() => resolve(llamadas), 60);
  }));
  eq('se llama primero al traslado (MOVER_A_CAMA_VACIA)', env[0] && env[0].accion, 'MOVER_A_CAMA_VACIA');
  eq('luego al lote de equipos, con los 2 marcados por defecto', env[1] && env[1].accion, 'MOVER_VENTILADORES_LOTE');
  const ids = env[1] ? env[1].datos.movimientos.map(m => m.idVm).sort() : [];
  eq('el lote lleva Airvo y V60 (no el PB1)', ids.join(','), 'AIRVO1,V60_1');
  eq('cada movimiento va a la cama destino (7)', env[1].datos.movimientos.every(m => m.tipo === 'CAMA' && m.detalle === '7'), true);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ traslado_equipos OK');
  process.exit(fails.length ? 1 : 0);
})();
