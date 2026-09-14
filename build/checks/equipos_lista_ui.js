// equipos_lista_ui.js — Guardia de la LISTA DE VENTILADORES POR CAMA en la
// pantalla (sep-2026). La queja de los colegas fue del TELÉFONO: «revisar en
// el móvil los ventiladores se hace engorroso». Así que esto se mide a 360 px.
//
//  1. La pestaña abre en la LISTA (no en el tablero), una fila por cama y en
//     orden, y a 360 px NADA desborda hacia el lado.
//  2. Tres estados por cama: sin equipo (el interruptor no se puede tocar),
//     equipo sin uso, equipo en uso. Y el aviso de cruce.
//  3. Los filtros salen con su rótulo y el vencido va en ámbar; en una cama
//     sin VM no hay filtros.
//  4. El check llama al servidor con la cama y la firma elegida; sin firma no
//     sale nada, avisa. Al volver, la fila queda marcada con hora y sigla y
//     el contador sube.
//  5. La bodega abajo desglosa por nombre y el stock por cantidad.
//  6. El selector por marca: verde libre · gris en otra cama · el de aquí no
//     se puede volver a elegir.
//  7. La ronda: una cama a la vez, «revisada y siguiente» avanza.
//  8. El tablero de arrastre sigue existiendo como tercera vista.
//
// Uso: node build/checks/equipos_lista_ui.js
const path = require('path');
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 360, height: 780 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    const filtro = (k, nombre, fecha, o) => Object.assign({ k, nombre, fecha, aplica: !!fecha, fija: false, vence: false, estaNoche: false, fechaCambio: '', edit: null }, o || {});
    const vm = (id, nombre, marca, enUso, o) => Object.assign({ id, nombre, marca, modelo: '', serie: '', categoria: 'VM', estado: 'Operativo', enUso, obs: '', ubicTipo: 'CAMA', ubicDetalle: '', fechaUbicacion: '2026-09-09', fechaMantProx: '' }, o || {});
    window.__grilla = {
      fecha: '2026-09-14', turno: 'Dia', turnoKey: '2026-09-14-Dia', hora: '10:00', numCamas: 6, revisadas: 0,
      camas: [
        { cama: '1', ocupada: false, enVM: false, viaAerea: '', vm: null, otros: [], filtros: [filtro('tc', 'Trachcare', ''), filtro('hepa', 'HEPA', ''), filtro('hme', 'HME', '')], check: null, alerta: '' },
        { cama: '2', ocupada: true, enVM: false, viaAerea: 'Natural', vm: vm('MK16', 'MK16', 'Mekics', false, { ubicDetalle: '2' }), otros: [], filtros: [filtro('tc', 'Trachcare', ''), filtro('hepa', 'HEPA', ''), filtro('hme', 'HME', '')], check: null, alerta: '' },
        { cama: '3', ocupada: true, enVM: true, viaAerea: 'TOT', vm: vm('SV2', 'SV2', 'Servo', true, { ubicDetalle: '3', obs: 'circuito nuevo' }), otros: [],
          filtros: [filtro('tc', 'Trachcare', '2026-09-11', { vence: true, fechaCambio: '2026-09-14' }), filtro('hepa', 'HEPA', '2026-09-12', { estaNoche: true, fechaCambio: '2026-09-15' }), filtro('hme', 'HME', '2026-09-14', { fechaCambio: '2026-09-16', edit: { f: 'MCC', o: 'grilla' } })],
          check: null, alerta: '' },
        { cama: '4', ocupada: true, enVM: true, viaAerea: 'TOT', vm: null, otros: [], filtros: [filtro('tc', 'Trachcare', '2026-09-13'), filtro('hepa', 'HEPA', ''), filtro('hme', 'HME', '')], check: null, alerta: 'sin_equipo' },
        { cama: '5', ocupada: true, enVM: false, viaAerea: 'Natural', vm: vm('MK12', 'MK12', 'Mekics', true, { ubicDetalle: '5' }), otros: [{ id: 'V60_1', nombre: 'V60 N°1', categoria: 'VNI', estado: 'Operativo' }], filtros: [filtro('tc', 'Trachcare', ''), filtro('hepa', 'HEPA', ''), filtro('hme', 'HME', '')], check: null, alerta: 'uso_sin_vm' },
        { cama: '6', ocupada: false, enVM: false, viaAerea: '', vm: null, otros: [], filtros: [filtro('tc', 'Trachcare', ''), filtro('hepa', 'HEPA', ''), filtro('hme', 'HME', '')], check: { hora: '09:40', firma: 'ACV' }, alerta: '' },
      ],
      bodega: { VM: [vm('VELA2', 'Vela 2', 'Vela', false, { ubicTipo: 'BODEGA' }), vm('VELA3', 'Vela 3', 'Vela', false, { ubicTipo: 'BODEGA' })], VNI: [], CNAF: [{ id: 'AIRVO1', nombre: 'Airvo 2 N°1', categoria: 'CNAF', estado: 'Operativo', ubicTipo: 'BODEGA' }], APOYO: [],
                stock: [{ nombre: 'Capnógrafo', categoria: 'Capnografía', disponible: 4, cantidad: 5 }] },
      pasillo: [], equipos: [vm('MK10', 'MK10', 'Mekics', false, { ubicTipo: 'EQUIPOS', estado: 'En mantención' })], prestamo: [],
      flota: [vm('MK16', 'MK16', 'Mekics', false, { ubicDetalle: '2' }), vm('SV2', 'SV2', 'Servo', true, { ubicDetalle: '3' }), vm('MK12', 'MK12', 'Mekics', true, { ubicDetalle: '5' }),
              vm('VELA2', 'Vela 2', 'Vela', false, { ubicTipo: 'BODEGA' }), vm('VELA3', 'Vela 3', 'Vela', false, { ubicTipo: 'BODEGA' }), vm('MK10', 'MK10', 'Mekics', false, { ubicTipo: 'EQUIPOS' })],
    };
    window.__llamadas = [];
    window.__revisadas = 1;
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) {
        window.__llamadas.push({ a, d });
        let data = null;
        if (a === 'GET_CONFIG_UI') data = { NUM_CAMAS: 6, BANNERS: {} };
        else if (a === 'GET_GRILLA_EQUIPOS') { const g = JSON.parse(JSON.stringify(window.__grilla)); g.revisadas = g.camas.filter(c => c.check).length; data = g; }
        else if (a === 'EQUIPO_CHECK') data = { idCama: d.idCama, turnoKey: '2026-09-14-Dia', check: d.marcar ? { hora: '10:12', firma: d.firmaKine } : null, accion: 'revisada' };
        else if (a === 'EQUIPO_EN_USO') data = { id: d.idVm, enUso: d.enUso };
        else if (a === 'GET_HISTORIAL_EQUIPO') data = { idVm: d.idVm, items: [{ tipo: 'falla', ts: '2', fecha: '2026-09-02', desc: 'alarma', firma: 'DMV' }, { tipo: 'mov', ts: '1', fecha: '2026-08-28', desde: 'Bodega', hacia: 'Cama 3', motivo: '', firma: 'MCC' }] };
        else if (a === 'GET_VENTILADORES') data = [];
        setTimeout(() => okF({ ok: true, data }), 5);
      }
    }; } }; } } } };
    try { localStorage.removeItem('rce_eq_vista'); localStorage.removeItem('rce_eq_firma'); } catch (e) {}
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(600);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };
  const si = (l, g) => eq(l, !!g, 'true');

  console.log('1 · Abre en la lista, una fila por cama, sin desborde a 360 px');
  await p.evaluate(() => { window.CFG = Object.assign(window.CFG || {}, { NUM_CAMAS: 6 }); setTab('V'); });
  await p.waitForTimeout(250);
  let R = await p.evaluate(() => {
    const filas = [...document.querySelectorAll('#vmBody .eq-fila')];
    return { vista: EQ.vista, n: filas.length, orden: filas.map(f => f.dataset.cama).join(','),
      desborde: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      anchos: filas.map(f => f.getBoundingClientRect().right <= window.innerWidth).every(Boolean),
      listaBtnOn: document.querySelector('[data-eqv="lista"]').classList.contains('on'),
      barra: !document.getElementById('eqBarra').classList.contains('hidden') };
  });
  eq('la vista por defecto es la lista', R.vista, 'lista');
  eq('seis camas, en orden', R.orden, '1,2,3,4,5,6');
  eq('la página no se desplaza hacia el lado', R.desborde, false);
  eq('ninguna fila se sale del ancho del teléfono', R.anchos, true);
  eq('el botón Lista está marcado y la barra de firma visible', R.listaBtnOn && R.barra, true);

  console.log('\n2 · Tres estados y el aviso de cruce');
  R = await p.evaluate(() => {
    const f = n => document.querySelector('#vmBody .eq-fila[data-cama="' + n + '"]');
    const sw = n => f(n).querySelector('.eq-sw');
    return {
      c1sw: sw(1).disabled, c1eq: f(1).querySelector('.eq-eq').textContent.trim(),
      c2: sw(2).getAttribute('aria-checked') + '/' + f(2).querySelector('.eq-eq').textContent.trim(),
      c3: sw(3).getAttribute('aria-checked') + '/' + f(3).querySelector('.eq-eq').textContent.trim(),
      c3obs: (f(3).querySelector('.eq-obs') || {}).textContent || '',
      c4eq: f(4).querySelector('.eq-eq').textContent.trim(), c4al: (f(4).querySelector('.eq-al') || {}).textContent || '',
      c5al: (f(5).querySelector('.eq-al') || {}).textContent || '', c5otro: (f(5).querySelector('.eq-otro') || {}).textContent || '',
    };
  });
  eq('cama 1 (sin equipo): el interruptor no se puede tocar', R.c1sw, true);
  eq('…y ofrece elegir', R.c1eq, 'sin ventilador');
  eq('cama 2: equipo SIN uso', R.c2, 'false/MK16');
  eq('cama 3: equipo EN uso', R.c3, 'true/SV2');
  eq('cama 3 muestra la observación del equipo', R.c3obs, 'circuito nuevo');
  eq('cama 4: paciente en VM sin equipo ⇒ botón que lo dice', R.c4eq, '⚠️ elegir ventilador');
  si('…y el aviso', /sin ventilador asignado/.test(R.c4al));
  si('cama 5: marcado en uso sin VM ⇒ aviso', /no está en VM/.test(R.c5al));
  eq('cama 5 lleva el V60 del paciente como chip aparte', R.c5otro, 'V60 N°1');

  console.log('\n3 · Filtros con rótulo, el vencido en ámbar, ninguno en camas sin VM');
  R = await p.evaluate(() => {
    const f = n => document.querySelector('#vmBody .eq-fila[data-cama="' + n + '"]');
    const chips = [...f(3).querySelectorAll('.eq-f')];
    return { n3: chips.length, rot: chips.map(c => c.querySelector('em').textContent).join(','), txt: chips.map(c => c.textContent.replace(/[A-Za-z]+/, '')).join(','),
      venc: chips[0].classList.contains('venc') && !chips[1].classList.contains('venc'), noche: chips[1].classList.contains('noche'),
      ambar: getComputedStyle(chips[0]).backgroundColor, n2: f(2).querySelectorAll('.eq-f').length, n4: f(4).querySelectorAll('.eq-f').length,
      quien: chips[2].title };
  });
  eq('cama 3: tres filtros', R.n3, 3);
  eq('…con rótulo', R.rot, 'Trachcare,HEPA,HME');
  eq('…y la fecha corta', R.txt, '11-09,12-09,14-09');
  eq('el Trachcare vencido va en ámbar y el HEPA de esta noche no', R.venc && R.noche, true);
  eq('ámbar de verdad (fondo)', R.ambar, 'rgb(254, 243, 199)');
  eq('cama 2 (sin VM): sin filtros', R.n2, 0);
  eq('cama 4 (TOT sin equipo): solo el Trachcare, que es de la vía aérea', R.n4, 1);
  si('el HME dice quién lo escribió', /escrita por MCC/.test(R.quien));

  console.log('\n4 · El check pide firma, llama al servidor y marca la fila');
  R = await p.evaluate(async () => {
    const antes = window.__llamadas.length;
    document.querySelector('#eqFirma').value = '';
    document.querySelector('#vmBody .eq-fila[data-cama="3"] .eq-chk').click();
    await new Promise(r => setTimeout(r, 60));
    const sinFirma = window.__llamadas.slice(antes).filter(x => x.a === 'EQUIPO_CHECK').length;
    const sel = document.querySelector('#eqFirma');
    if (![...sel.options].some(o => o.value === 'DMV')) sel.add(new Option('DMV — prueba', 'DMV'));
    sel.value = 'DMV';
    document.querySelector('#vmBody .eq-fila[data-cama="3"] .eq-chk').click();
    await new Promise(r => setTimeout(r, 80));
    const ll = window.__llamadas.filter(x => x.a === 'EQUIPO_CHECK');
    const f3 = document.querySelector('#vmBody .eq-fila[data-cama="3"]');
    return { sinFirma, n: ll.length, cama: ll[0] && ll[0].d.idCama, firma: ll[0] && ll[0].d.firmaKine, marcar: ll[0] && ll[0].d.marcar,
      det: ll[0] && ll[0].d.detalle, rev: f3.classList.contains('rev'), chkt: (f3.querySelector('.eq-chkt') || {}).textContent || '',
      contador: document.getElementById('eqRevisadas').textContent, c6: (document.querySelector('#vmBody .eq-fila[data-cama="6"] .eq-chkt') || {}).textContent || '' };
  });
  eq('sin firma elegida no se llama al servidor', R.sinFirma, 0);
  eq('con firma: una llamada EQUIPO_CHECK', R.n, 1);
  eq('…con la cama y la firma', R.cama + '/' + R.firma + '/' + R.marcar, '3/DMV/true');
  eq('…y la foto de lo confirmado (equipo y filtros)', R.det && R.det.idVm + '/' + R.det.tc + '/' + R.det.hme, 'SV2/2026-09-11/2026-09-14');
  eq('la fila queda revisada con hora y sigla', R.rev + '/' + R.chkt, 'true/10:12 DMV');
  eq('el contador sube (la 6 venía revisada del servidor)', R.contador, '2/6');
  eq('la cama 6 muestra la revisión que trajo el servidor', R.c6, '09:40 ACV');

  console.log('\n5 · La bodega, desglosada abajo');
  R = await p.evaluate(() => {
    const b = document.querySelector('#vmBody .eq-bodega');
    const filas = [...b.querySelectorAll('.eq-brow')].map(r => r.querySelector('b').textContent.trim() + ': ' + [...r.querySelectorAll('.eq-bchip')].map(c => c.textContent.trim().replace(/\s+/g, ' ')).join(' · '));
    return { filas, ancho: b.getBoundingClientRect().right <= window.innerWidth };
  });
  eq('VMI por nombre', R.filas[0], '🫁 VMI: Vela 2 · Vela 3');
  eq('CNAF por nombre', R.filas[2], '💨 CNAF: Airvo 2 N°1');
  eq('el stock sin número por cantidad', R.filas[3], '🧰 Apoyo: Capnógrafo 4/5');
  eq('equipos médicos con nombre', R.filas[4], '🔧 Equipos médicos: MK10');
  eq('la bodega tampoco desborda', R.ancho, true);

  console.log('\n6 · Elegir ventilador, por marca');
  R = await p.evaluate(() => {
    eqElegir('4');
    const m = document.getElementById('eqElegir');
    const marcas = [...m.querySelectorAll('.eq-marca h4')].map(h => h.textContent);
    const btn = t => [...m.querySelectorAll('.eq-ebtn')].find(b => b.textContent.startsWith(t));
    const r = { on: m.classList.contains('on'), marcas: marcas.join(','), vela2: btn('Vela 2').className, sv2: btn('SV2').className + '|' + btn('SV2').textContent,
      mk10: btn('MK10').className, tit: document.getElementById('eqElegirTit').textContent };
    eqElegirCerrar();
    eqElegir('3');
    r.aqui = btn('SV2').disabled + '/' + btn('SV2').textContent; r.quitar = !!m.querySelector('.eq-ebtn.quitar');
    eqElegirCerrar();
    return r;
  });
  eq('se abre para la cama 4', R.on + '/' + R.tit, 'true/Ventilador para la cama 4');
  eq('agrupado por marca, en orden', R.marcas, 'Mekics,Servo,Vela');
  si('la Vela 2 (bodega) sale VERDE', /libre/.test(R.vela2));
  si('el SV2 (cama 3) sale gris y dice en qué cama está', /ocupado/.test(R.sv2) && /cama 3/.test(R.sv2));
  si('el MK10 (equipos médicos) sale punteado', /fuera/.test(R.mk10));
  eq('para la cama 3, su propio SV2 no se puede volver a elegir', R.aqui, 'true/SV2 ✓ aquí');
  eq('…y hay botón para sacarlo a bodega', R.quitar, true);

  console.log('\n7 · La ficha del equipo y su historial unificado');
  R = await p.evaluate(async () => {
    eqFicha('SV2');
    await new Promise(r => setTimeout(r, 60));
    const m = document.getElementById('eqFicha');
    const r = { on: m.classList.contains('on'), tit: document.getElementById('eqFichaTit').textContent,
      acc: [...document.querySelectorAll('#eqFichaAcc button')].map(b => b.textContent.trim()).join(','),
      hist: [...document.querySelectorAll('#eqFichaHist .eq-h')].map(h => h.classList.contains('falla') ? 'falla' : 'mov').join(',') };
    eqFichaCerrar(); return r;
  });
  eq('se abre con el nombre', R.on + '/' + R.tit, 'true/SV2');
  eq('Mover · Falla · Cambiar · Editar', R.acc, '🔁 Mover,⚠️ Falla,🔄 Cambiar,✏️ Editar');
  eq('el historial mezcla fallas y movimientos, lo último primero', R.hist, 'falla,mov');

  console.log('\n8 · La ronda avanza al marcar; el tablero sigue existiendo');
  R = await p.evaluate(async () => {
    eqVista('ronda');
    await new Promise(r => setTimeout(r, 30));
    const n1 = document.querySelector('#vmBody .eq-rn').textContent;
    const desborde = document.documentElement.scrollWidth > document.documentElement.clientWidth;
    eqRondaOk();   // cama 1: sin VM → revisada y siguiente
    await new Promise(r => setTimeout(r, 80));
    const n2 = document.querySelector('#vmBody .eq-rn').textContent;
    const ll = window.__llamadas.filter(x => x.a === 'EQUIPO_CHECK');
    eqVista('tablero');
    await new Promise(r => setTimeout(r, 120));
    return { n1, n2, ultima: ll[ll.length - 1].d.idCama, desborde, tablero: !!document.querySelector('#vmBody .vmz-board'), barraOculta: document.getElementById('eqBarra').classList.contains('hidden') };
  });
  eq('la ronda parte en la cama 1', R.n1, '1');
  eq('«revisada y siguiente» marcó la 1 y pasó a la 2', R.ultima + '→' + R.n2, '1→2');
  eq('la ronda tampoco desborda', R.desborde, false);
  eq('la vista Tablero pinta el tablero de arrastre y esconde la barra de firma', R.tablero + '/' + R.barraOculta, 'true/true');

  eq('sin errores de JS', errs.length ? errs.join(' | ') : '', '');
  await b.close();
  console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS: ' + fails.join(' | ') : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
