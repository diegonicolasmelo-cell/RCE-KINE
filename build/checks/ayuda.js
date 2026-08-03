// ayuda.js — Guardia del CENTRO DE AYUDA (v5.28, pedido de Diego):
//   · La mascota abre un MENÚ (no el recorrido directo): recorridos, FAQ y
//     sugerencias.
//   · FAQ con buscador: responde sin intermediarios y enlaza a recorridos.
//   · Recorrido «equipos» con 🎓 VM DE PRUEBA: existe SOLO en el navegador,
//     sobrevive a la recarga del censo, y mover/aplicar-en-lote sobre él se
//     SIMULA — el servidor jamás recibe una llamada por el equipo demo.
//   · Sugerencias: viajan con firma al servidor y la coordinación cambia el
//     estado desde Estadísticas.
//   Parte servidor: guardarSugerencia/obtenerSugerencias/setSugerenciaEstado
//   con repo en memoria.
// Uso: node build/checks/ayuda.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

/* ══ Parte 1 · Servicio de sugerencias (Node, repo simulado) ══ */
const DB = { SUGERENCIAS: [] };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoLeerTodos = h => (DB[h] || []).slice();
global.repoActualizar = (h, c, id, cambios) => { const r = (DB[h] || []).find(x => String(x[c]) === String(id)); if (r) Object.assign(r, cambios); return !!r; };
global.ahoraTS = () => '2026-08-02 12:00:00';
global.ok = d => ({ ok: true, data: d }); global.err = m => ({ ok: false, error: m });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
const svc = fs.readFileSync(path.join(v2, 'svc_turnos.gs'), 'utf8');
eval(svc.slice(svc.indexOf('/* ── Sugerencias del equipo')));

console.log('── Servicio de sugerencias ──');
eq('sin texto: rechazada', guardarSugerencia({ texto: '  ', firma: 'K' }, {}).ok, false);
eq('sin firma: rechazada', guardarSugerencia({ texto: 'idea' }, {}).ok, false);
const g1 = guardarSugerencia({ texto: 'Buscar por diagnóstico', firma: 'Klga. A. Campos' }, { email: 'a@b.c' });
eq('se guarda con firma', g1.ok, true);
eq('estado inicial «nueva»', DB.SUGERENCIAS[0].ESTADO, 'nueva');
eq('conserva el correo del autor', DB.SUGERENCIAS[0].AUTOR_EMAIL, 'a@b.c');
eq('estado inválido: rechazado', setSugerenciaEstado({ id: g1.data.id, estado: 'lista' }).ok, false);
eq('cambio de estado válido', setSugerenciaEstado({ id: g1.data.id, estado: 'considerada', nota: 'para v6' }).ok, true);
eq('…queda con nota', DB.SUGERENCIAS[0].NOTA_COORD, 'para v6');
const lst = obtenerSugerencias();
eq('el listado la trae con su estado', lst.data[0].estado, 'considerada');

/* ══ Parte 2 · Cliente (Chromium) ══ */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window._API_LOG = [];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) {
        window._API_LOG.push({ a, d });
        const data = a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} }
          : a === 'GET_VENTILADORES' ? [{ id: 'V1', nombre: 'Savina 1', estado: 'Operativo', activo: true, ubicTipo: 'CAMA', ubicDetalle: '3' }]
          : a === 'GET_SUGERENCIAS' ? [{ id: 'S1', ts: '2026-08-02', firma: 'Klgo. M. Rojas', texto: 'Idea previa', estado: 'nueva', nota: '' }]
          : a === 'GUARDAR_SUGERENCIA' ? { id: 'S2' } : null;
        setTimeout(() => okF({ ok: true, data }), 5);
      }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(v2, 'index.html'));
  await p.waitForTimeout(500);

  const R = await p.evaluate(async () => {
    const r = {};
    // ── Menú ──
    ayudaAbrir();
    r.modalOn = $('ayudaMod').classList.contains('on');
    r.items = $('ayudaBody').querySelectorAll('[onclick]').length;
    r.tieneEquipos = $('ayudaBody').innerHTML.indexOf('Mover ventiladores y equipos') !== -1;
    // ── FAQ ──
    ayudaVista('faq');
    faqFiltra('');
    r.faqTotal = $('faqLista').querySelectorAll('details').length;
    faqFiltra('extubación');
    r.faqFiltra = $('faqLista').querySelectorAll('details').length;
    r.faqMenorAlFiltrar = r.faqFiltra > 0 && r.faqFiltra < r.faqTotal;
    // ── Sugerencia: payload al servidor ──
    ayudaVista('sug');
    window.Turnos = window.Turnos || {};
    $('sugFirma').innerHTML = '<option value="Klgo. M. Rojas">Klgo. M. Rojas</option>';
    $('sugFirma').value = 'Klgo. M. Rojas';
    $('sugTxt').value = 'Probar sugerencia';
    sugEnviar();
    await new Promise(res => setTimeout(res, 100));
    const call = window._API_LOG.find(x => x.a === 'GUARDAR_SUGERENCIA');
    r.sugPayload = call && call.d.texto === 'Probar sugerencia' && call.d.firma === 'Klgo. M. Rojas';
    ayudaCerrar();
    r.modalOff = !$('ayudaMod').classList.contains('on');

    // ── Recorrido de equipos: demo local ──
    window._API_LOG.length = 0;
    tutAbrir('equipos');
    await new Promise(res => setTimeout(res, 300));
    r.demoEnCenso = (VM_ALL || []).some(x => x.id === 'TUT_DEMO');
    r.pasosEquipos = TUT_PASOS.length;
    /* v5.30 · reporte de Diego: el anillo caía sobre la tarjeta del VM de
       prueba mientras «📋 Tarjetas y gestión» seguía PLEGADO — se veía un
       recuadro vacío apuntando a nada. Chrome le da rect y offsetParent a lo
       que hay dentro de un <details> cerrado, así que hay que preguntar por
       el <details>, no por el tamaño. */
    r.anillos = [];
    for (let i = 1; i < TUT_PASOS.length; i++) {
      tutSiguiente();
      await new Promise(res => setTimeout(res, 400));
      const card = document.querySelector('[data-vm="TUT_DEMO"]');
      const ring = $('tutRing').getBoundingClientRect();
      r.anillos.push({
        paso: i + 1,
        plegado: !!(card && card.closest('details:not([open])')),
        enTarjeta: !!card && Math.abs(ring.left - (card.getBoundingClientRect().left - 6)) < 2,
        enPantalla: ring.top >= 0 && ring.bottom <= innerHeight,
      });
    }
    r.pasosPlegados = r.anillos.filter(x => x.plegado).length;
    r.pasosEnTarjeta = r.anillos.filter(x => x.enTarjeta).length;
    r.pasosFueraDePantalla = r.anillos.filter(x => !x.enPantalla).length;
    tutCerrar();
    // la recarga del censo NO borra el demo
    vmCargar();
    await new Promise(res => setTimeout(res, 150));
    r.demoSobrevive = (VM_ALL || []).some(x => x.id === 'TUT_DEMO');
    r.tarjetaDemo = !!document.querySelector('[data-vm="TUT_DEMO"]');
    // mover el demo: se simula y NO viaja al servidor
    window._API_LOG.length = 0;
    vmMover('TUT_DEMO');
    $('vmmTipo').value = 'CAMA'; vmmUI(); $('vmmCama').innerHTML = '<option value="5">5</option>'; $('vmmCama').value = '5';
    $('vmmFecha').value = '2026-08-02';
    vmMoverOk();
    await new Promise(res => setTimeout(res, 100));
    const demo = (VM_ALL || []).find(x => x.id === 'TUT_DEMO');
    r.demoMovido = demo && demo.ubicTipo === 'CAMA' && demo.ubicDetalle === '5';
    r.sinLlamadaServidor = !window._API_LOG.some(x => x.a === 'MOVER_VENTILADOR');
    // lote con demo + real: el demo se separa y el real sigue su flujo normal
    VM_COLA = [{ idVm: 'TUT_DEMO', tipo: 'BODEGA', detalle: '', fecha: '2026-08-02' }];
    vmColaAplicar();
    await new Promise(res => setTimeout(res, 100));
    r.loteDemoSimulado = ((VM_ALL || []).find(x => x.id === 'TUT_DEMO') || {}).ubicTipo === 'BODEGA';
    r.loteSinServidor = !window._API_LOG.some(x => x.a === 'MOVER_VENTILADORES_LOTE');
    r.colaVacia = VM_COLA.length === 0;
    // baja del demo: solo local
    vmBaja('TUT_DEMO');
    r.demoRetirado = !(VM_ALL || []).some(x => x.id === 'TUT_DEMO');
    r.bajaSinServidor = !window._API_LOG.some(x => String(x.a).indexOf('BAJA') !== -1);

    // ── Coordinación en Estadísticas ──
    r.cajaCoord = !!$('sugCoordBox');
    sugCoordRender();
    await new Promise(res => setTimeout(res, 100));
    r.coordLista = $('sugCoordLista').innerHTML.indexOf('Idea previa') !== -1;
    r.coordEstados = $('sugCoordLista').querySelectorAll('select').length === 1;
    return r;
  });

  console.log('\n── Menú de la mascota ──');
  eq('el modal se abre', R.modalOn, true);
  eq('cinco opciones', R.items, 5);
  eq('incluye mover equipos', R.tieneEquipos, true);
  eq('…y se cierra', R.modalOff, true);

  console.log('\n── FAQ ──');
  eq('9 preguntas', R.faqTotal, 9);
  eq('el buscador filtra', R.faqMenorAlFiltrar, true);
  eq('la sugerencia viaja con texto y firma', R.sugPayload, true);

  console.log('\n── 🎓 VM de práctica ──');
  eq('el recorrido lo siembra', R.demoEnCenso, true);
  eq('recorrido de 5 pasos', R.pasosEquipos, 5);
  eq('ningún paso apunta a la tarjeta con el bloque plegado', R.pasosPlegados, 0);
  eq('los 4 pasos siguientes enfocan la tarjeta de práctica', R.pasosEnTarjeta, 4);
  eq('y el anillo nunca queda fuera de la pantalla', R.pasosFueraDePantalla, 0);
  eq('sobrevive a la recarga del censo', R.demoSobrevive, true);
  eq('su tarjeta existe en el tablero', R.tarjetaDemo, true);
  eq('moverlo lo simula en pantalla', R.demoMovido, true);
  eq('…SIN llamada al servidor', R.sinLlamadaServidor, true);
  eq('en lote también se simula', R.loteDemoSimulado, true);
  eq('…sin lote al servidor', R.loteSinServidor, true);
  eq('…y la lista queda limpia', R.colaVacia, true);
  eq('la baja lo retira solo en pantalla', R.demoRetirado && R.bajaSinServidor, true);

  console.log('\n── Coordinación ──');
  eq('la caja vive en Estadísticas', R.cajaCoord, true);
  eq('lista las sugerencias del equipo', R.coordLista, true);
  eq('con selector de estado', R.coordEstados, true);

  eq('sin errores de página', errs.length ? errs[0] : 0, 0);
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
