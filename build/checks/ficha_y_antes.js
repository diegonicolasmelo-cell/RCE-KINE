// ficha_y_antes.js — Guardia del rediseño suave de la sábana (ago-2026, dos
// puntos pedidos por Diego para traer del prototipo lo que sirve sin tocar lo
// que funciona):
//
//  ① «Antes: X → Y» bajo los campos de ESTADO (vía aérea, soporte, modo, n° de
//     tubo, fijación, calibre de TQT). Mientras el valor se mantiene dice
//     «Antes: CPAP/PS»; en cuanto cambia pasa a «CPAP/PS → ACVC» resaltado.
//     Reglas que se fijan acá porque son las que se pueden romper sin darse
//     cuenta:
//       · NINGÚN campo lleva las dos marcas: lo que está en ámbar (_HER_CAMPOS,
//         que son MEDICIONES) no lleva «Antes», y al revés. Mezclar los dos
//         lenguajes en el mismo campo confunde en vez de avisar.
//       · Sin evolución previa NO se dibuja nada — inventar un «antes» sería
//         peor que callar.
//       · La línea sobrevive al cascadeo de soporte/modo, que es el momento
//         exacto en que importa (poblar() cambia las OPCIONES del select, no
//         el elemento, así que el span hermano no se pierde; si alguien
//         reemplaza el contenedor, esto se pone rojo).
//       · El servidor manda la previa TAMBIÉN cuando el turno ya está guardado
//         (antes solo la mandaba si no existía): al re-editar es cuando más se
//         mira qué cambió.
//
//  ② La FICHA DEL EPISODIO se pliega: las evaluaciones pre-UCI (hora de
//     ingreso, Barthel, Charlson, APACHE II, ECF) quedan tras una línea de
//     resumen, y la tarjeta de Identificación se destapa a pedido.
//       · Los campos SIGUEN en el formulario aunque estén plegados: su valor
//         viaja igual al guardar. Es el punto peligroso — si alguien los
//         sacara del DOM, guardar un turno BORRARÍA los datos del paciente.
//       · Día Estadía y AET no se pliegan (uno se mira todos los turnos, el
//         otro se decide durante la estadía).
//       · En un INGRESO nunca se pliega.
//       · El ✏️ de la tarjeta de cama abre el panel con la ficha desplegada:
//         hasta ago-2026 no había NINGUNA vía para corregir un nombre o un RUT
//         después del ingreso.
//
// Uso: node build/checks/ficha_y_antes.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const v2 = path.resolve(__dirname, '..', '..', 'v2');
  const fails = [];
  const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  /* ══ PARTE 1 · SERVIDOR: la previa viaja siempre ═══════════════════════ */
  console.log('1 · Servidor — GET_EVO_TURNO manda la previa también al re-editar');
  {
    const DB = {
      EVOLUCIONES: [
        { ID_EVOLUCION: 'CAMA_4_2026-08-08-Dia', ID_CAMA: '4', TURNO_KEY: '2026-08-08-Dia',
          VENT_MODO: 'CPAP/PS', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT', VENT_TOT_NUM: '8.0' },
        { ID_EVOLUCION: 'CAMA_4_2026-08-08-Noche', ID_CAMA: '4', TURNO_KEY: '2026-08-08-Noche',
          VENT_MODO: 'ACVC', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT', VENT_TOT_NUM: '8.0' },
      ],
    };
    global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
    global.esVerdadero = v => v === true || v === 'TRUE';
    global.ok = d => ({ ok: true, data: d });
    global.err = (m, c) => ({ ok: false, error: m, codigo: c });
    global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
    global._pronoAbiertoTS = () => '';
    // obtenerEvolucionPrevia real vive en el mismo archivo que se evalúa.
    eval(fs.readFileSync(path.join(v2, 'svc_evoluciones.gs'), 'utf8')
      .replace(/^[\s\S]*?function obtenerEvoTurno/, 'function obtenerEvoTurno')
      .replace(/function obtenerEvolucionesRecientes[\s\S]*$/, ''));
    eval(fs.readFileSync(path.join(v2, 'svc_evoluciones.gs'), 'utf8')
      .match(/function obtenerEvolucionPrevia[\s\S]*?\n}\n/)[0]);

    const rEdit = obtenerEvoTurno('4', '2026-08-08-Noche');   // turno YA guardado
    eq('al re-editar devuelve el turno actual', !!(rEdit.data && rEdit.data.actual), true);
    eq('…y ADEMÁS la evolución previa', !!(rEdit.data && rEdit.data.previa), true);
    eq('…que es el turno anterior de verdad',
      rEdit.data.previa && rEdit.data.previa.TURNO_KEY, '2026-08-08-Dia');
    eq('…con el modo con que se compara', rEdit.data.previa && rEdit.data.previa.VENT_MODO, 'CPAP/PS');

    const rNuevo = obtenerEvoTurno('4', '2026-08-09-Dia');    // turno NUEVO
    eq('en un turno nuevo no hay actual', rNuevo.data && rNuevo.data.actual, null);
    eq('…y la previa sigue siendo la última guardada',
      rNuevo.data.previa && rNuevo.data.previa.TURNO_KEY, '2026-08-08-Noche');

    const rPrimero = obtenerEvoTurno('9', '2026-08-09-Dia');  // cama sin historia
    eq('sin historia, la previa es null (no se inventa nada)', rPrimero.data.previa, null);
  }

  /* ══ PARTE 2 · CLIENTE ════════════════════════════════════════════════ */
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(v2, 'index.html'));
  await p.waitForTimeout(500);

  /* ── 2 · La línea «Antes» ── */
  console.log('\n2 · Cliente — «Antes: X → Y» en los campos de estado');
  const R2 = await p.evaluate(() => {
    const r = {};
    $('kf').reset(); $('cBed').value = '4'; $('cIng').value = 'false';
    $('ovl').classList.add('on'); $('sp').classList.add('on');
    // El turno arranca igual que la previa (es lo que hace la réplica)
    $('fVA').value = 'TOT'; cascadeVA('VM'); cascadeSop('CPAP/PS');
    $('fTOTn').value = '8.0'; $('fTOTcm').value = '22';
    _antesSnapshot({ VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'CPAP/PS',
      VENT_TOT_NUM: '8.0', VENT_TOT_CM: '22' });
    r.sinCambio = $('ant_fModo').textContent;
    r.sinCambioClase = $('ant_fModo').className;
    r.soporteTambien = $('ant_fSop').textContent;
    r.tuboTambien = $('ant_fTOTn').textContent;

    // El colega cambia el modo: la línea lo dice con la flecha
    $('fModo').value = 'ACVC'; renderParams(); _antesPintar();
    r.conCambio = $('ant_fModo').textContent;
    r.conCambioClase = $('ant_fModo').className;
    // …y los demás campos NO se contagian
    r.otrosQuietos = $('ant_fSop').className;

    // La línea sobrevive al cascadeo (que repuebla las opciones del select):
    // es exactamente el momento en que se mira.
    cascadeSop('ACVC'); _antesPintar();
    r.trasCascade = $('ant_fModo').textContent;
    r.spanUnico = document.querySelectorAll('#ant_fModo').length;

    // Volver al valor previo devuelve la línea a su forma tranquila
    $('fModo').value = 'CPAP/PS'; _antesPintar();
    r.alVolver = $('ant_fModo').textContent;
    r.alVolverClase = $('ant_fModo').className;
    return r;
  });
  eq('mientras se mantiene dice «Antes: …»', R2.sinCambio, 'Antes: CPAP/PS');
  eq('…sin resaltar', R2.sinCambioClase, 'antes');
  eq('el soporte lleva la suya', R2.soporteTambien, 'Antes: VM');
  eq('el n° de tubo también', R2.tuboTambien, 'Antes: 8.0');
  eq('al cambiar muestra la transición', R2.conCambio, 'CPAP/PS → ACVC');
  eq('…y se resalta', R2.conCambioClase, 'antes cambio');
  eq('los campos que no cambiaron siguen tranquilos', R2.otrosQuietos, 'antes');
  eq('la línea sobrevive al cascadeo de soporte/modo', R2.trasCascade, 'CPAP/PS → ACVC');
  eq('…y no se duplica el span', R2.spanUnico, 1);
  eq('volver al valor previo la devuelve a «Antes: …»', R2.alVolver, 'Antes: CPAP/PS');
  eq('…sin resalte', R2.alVolverClase, 'antes');

  /* ── 3 · Sin previa no se inventa nada ── */
  console.log('\n3 · Sin evolución previa, la línea calla');
  const R3 = await p.evaluate(() => {
    _antesSnapshot(null);
    return { modo: $('ant_fModo').textContent, sop: $('ant_fSop').textContent,
             clase: $('ant_fModo').className };
  });
  eq('el modo no dice nada', R3.modo, '');
  eq('el soporte tampoco', R3.sop, '');
  eq('…y sin clase de cambio', R3.clase, 'antes');

  /* ── 4 · Ningún campo lleva las DOS marcas ── */
  console.log('\n4 · Ámbar y «Antes» no se pisan');
  const R4 = await p.evaluate(() => ({
    solapados: _ANTES_CAMPOS.map(c => c.id).filter(id => _HER_CAMPOS.includes(id)),
    nAntes: _ANTES_CAMPOS.length,
    // Todos los campos del «antes» existen de verdad en el formulario
    inexistentes: _ANTES_CAMPOS.map(c => c.id).filter(id => !$(id)),
  }));
  eq('ningún campo está en las dos listas', R4.solapados.join(',') || 'ninguno', 'ninguno');
  eq('los campos del «antes» existen en el formulario', R4.inexistentes.join(',') || 'todos', 'todos');
  eq('son los seis campos de estado', R4.nAntes, 6);

  /* ── 5 · La ficha se pliega y los datos NO se pierden ── */
  console.log('\n5 · Ficha del episodio plegada');
  const R5 = await p.evaluate(() => {
    const r = {};
    $('cIng').value = 'false';
    $('fNombre').value = 'Rosa Pérez Muñoz'; $('fEdad').value = '67'; $('fSexo').value = 'F';
    $('fTalla').value = '158'; $('fHoraIng').value = '14:30';
    $('fBarthel').value = '85'; $('fCharlson').value = '4'; $('fApache').value = '18'; $('fEcf').value = '3';
    fichaAplicar(false);
    r.plegada = $('fPreUci').classList.contains('plegado');
    r.chipVisible = !$('fichaChip').classList.contains('hidden');
    r.resumen = $('fichaChipTxt').textContent;
    r.identOculta = $('fcId').classList.contains('hidden');
    // ★ LO CRÍTICO: plegado NO es borrado — los valores siguen ahí
    r.valoresVivos = ['fBarthel', 'fCharlson', 'fApache', 'fEcf', 'fHoraIng', 'fNombre']
      .map(id => $(id).value).join('|');
    // …y el formulario los sigue viendo (es como los lee el payload)
    r.leePayload = v('fBarthel') + '/' + v('fApache') + '/' + v('fNombre');
    // Día estadía y AET NO se pliegan
    r.diasFuera = !$('fDias').closest('#fPreUci');
    r.aetFuera = !$('cAET').closest('#fPreUci');
    r.diasVisible = $('fDias').offsetParent !== null;
    r.aetVisible = $('cAET').offsetParent !== null;
    // Los plegados sí quedan invisibles
    r.barthelInvisible = $('fBarthel').offsetParent === null;
    return r;
  });
  eq('la ficha arranca plegada', R5.plegada, true);
  eq('…con su línea de resumen a la vista', R5.chipVisible, true);
  eq('el resumen trae nombre y evaluaciones', /Rosa Pérez Muñoz/.test(R5.resumen) && /Barthel/.test(R5.resumen) && /APACHE II/.test(R5.resumen), true);
  eq('la identificación queda oculta hasta pedirla', R5.identOculta, true);
  eq('★ los valores SIGUEN en el formulario', R5.valoresVivos, '85|4|18|3|14:30|Rosa Pérez Muñoz');
  eq('★ …y el payload los lee igual', R5.leePayload, '85/18/Rosa Pérez Muñoz');
  eq('Día Estadía queda fuera del plegado', R5.diasFuera, true);
  eq('…y sigue visible', R5.diasVisible, true);
  eq('AET queda fuera del plegado', R5.aetFuera, true);
  eq('…y sigue visible', R5.aetVisible, true);
  eq('lo plegado sí deja de verse', R5.barthelInvisible, true);

  /* ── 6 · Desplegar y volver a plegar ── */
  console.log('\n6 · El control abre y cierra');
  const R6 = await p.evaluate(() => {
    const r = {};
    fichaToggle();
    r.abierta = !$('fPreUci').classList.contains('plegado');
    r.barthelVisible = $('fBarthel').offsetParent !== null;
    r.identVisible = !$('fcId').classList.contains('hidden');
    r.chipSigue = !$('fichaChip').classList.contains('hidden');   // para poder cerrarla
    fichaToggle();
    r.cerradaDeNuevo = $('fPreUci').classList.contains('plegado');
    r.identOtraVez = $('fcId').classList.contains('hidden');
    return r;
  });
  eq('al tocarla se despliega', R6.abierta, true);
  eq('…y aparecen las evaluaciones', R6.barthelVisible, true);
  eq('…junto con la identificación (nombre/RUT/dx)', R6.identVisible, true);
  eq('la línea sigue ahí para poder cerrarla', R6.chipSigue, true);
  eq('vuelve a plegarse', R6.cerradaDeNuevo, true);
  eq('…y la identificación se esconde otra vez', R6.identOtraVez, true);

  /* ── 7 · En un INGRESO nunca se pliega ── */
  console.log('\n7 · El ingreso se llena entero');
  const R7 = await p.evaluate(() => {
    $('cIng').value = 'true';
    fichaAplicar(false);   // aunque se pida plegar
    return { plegada: $('fPreUci').classList.contains('plegado'),
             chipOculto: $('fichaChip').classList.contains('hidden'),
             barthelVisible: $('fBarthel').offsetParent !== null };
  });
  eq('no se pliega aunque se pida', R7.plegada, false);
  eq('…y no aparece la línea de resumen', R7.chipOculto, true);
  eq('las evaluaciones están a la vista', R7.barthelVisible, true);

  /* ── 8 · Sin datos de ficha tampoco se pliega ── */
  console.log('\n8 · Ficha vacía: nada que resumir');
  const R8 = await p.evaluate(() => {
    $('cIng').value = 'false';
    ['fNombre', 'fEdad', 'fSexo', 'fTalla', 'fHoraIng', 'fBarthel', 'fCharlson', 'fApache', 'fEcf']
      .forEach(id => { $(id).value = ''; });
    fichaAplicar(false);
    return { plegada: $('fPreUci').classList.contains('plegado'),
             chipOculto: $('fichaChip').classList.contains('hidden') };
  });
  eq('no se pliega (un resumen vacío ocupa lo mismo y no dice nada)', R8.plegada, false);
  eq('…y no se muestra la línea', R8.chipOculto, true);

  /* ── 9 · El ✏️ de la tarjeta de cama ── */
  console.log('\n9 · Lápiz en la tarjeta de cama');
  const R9 = await p.evaluate(() => {
    const r = {};
    DB.length = 0;
    DB.push({ ID_CAMA: '4', OCUPADA: 'TRUE', NOMBRE: 'Rosa Pérez Muñoz de Nombre Larguísimo Para Truncar',
      EDAD: 67, SEXO: 'F', DIAGNOSTICO: 'Shock séptico', FECHA_INGRESO: '2026-08-01',
      VIA_AEREA: 'TOT', PATIENT_ID: 'p4' });
    DB.push({ ID_CAMA: '5', OCUPADA: 'FALSE' });
    window.CFG = { NUM_CAMAS: 12 };
    setTab('C'); renderGrid();
    const lap = document.querySelector('.pname-lap');
    r.hayLapiz = !!lap;
    r.abreFicha = lap ? /abrirPanel\('4',false,true\)/.test(lap.getAttribute('onclick') || '') : false;
    // El nombre trunca, el ✏️ no: van como HERMANOS dentro de un contenedor
    // flex. Si alguien devuelve el nombre a texto suelto con overflow en
    // .pname, la elipsis se come el botón y la ficha vuelve a ser inalcanzable
    // — que es justo el agujero que este botón viene a tapar.
    const pn = document.querySelector('.pname');
    r.pnameFlex = pn ? getComputedStyle(pn).display : '-';
    r.lapizHermano = !!(lap && lap.parentElement === pn);
    r.nombreEnSpan = !!(pn && pn.firstElementChild && pn.firstElementChild.tagName === 'SPAN'
      && getComputedStyle(pn.firstElementChild).textOverflow === 'ellipsis');
    // El ✏️ no puede encogerse a cero cuando el nombre es larguísimo
    r.lapizNoEncoge = lap ? getComputedStyle(lap).flexShrink : '-';
    // Y el nombre largo entró completo en el title (para poder leerlo)
    r.titleLargo = pn ? /Larguísimo/.test(pn.getAttribute('title') || '') : false;
    // La cama libre no lleva lápiz (no hay ficha que editar)
    const libre = [...document.querySelectorAll('.pname')].length;
    r.soloOcupadas = libre === 1;
    return r;
  });
  eq('la tarjeta ocupada lleva ✏️', R9.hayLapiz, true);
  eq('…que abre el panel con la ficha desplegada', R9.abreFicha, true);
  eq('el nombre va en su propio span que trunca', R9.nombreEnSpan, true);
  eq('…y el ✏️ es hermano suyo, no va dentro', R9.lapizHermano, true);
  eq('…en un contenedor flex (así la elipsis no se lo come)', R9.pnameFlex, 'flex');
  eq('…y no se encoge a cero con un nombre larguísimo', R9.lapizNoEncoge, '0');
  eq('el nombre completo sigue en el tooltip', R9.titleLargo, true);
  eq('la cama libre no lleva ficha que editar', R9.soloOcupadas, true);

  /* ── 10 · abrirPanel acepta el tercer parámetro ── */
  console.log('\n10 · La intención viaja hasta el panel');
  const R10 = await p.evaluate(() => ({
    aridad: abrirPanel.length,
    // el ✏️ no debe arrastrar el clic de la tarjeta (que abre la evolución)
    paraElClic: /event\.stopPropagation\(\)/.test(
      (document.querySelector('.pname-lap') || {}).getAttribute?.('onclick') || ''),
  }));
  eq('abrirPanel recibe (id, esIng, verFicha)', R10.aridad, 3);
  eq('el ✏️ no dispara además la evolución', R10.paraElClic, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
