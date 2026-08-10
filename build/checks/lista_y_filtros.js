// lista_y_filtros.js — Las dos hojas que el equipo se lleva a la ronda
// (ago-2026, pedido de Manuel; revisadas por él en maqueta antes de montarse).
//
// 1 · LISTA DEL DÍA (pestaña Registro). Reemplazó a «Hojas del día»: en vez de
//     34 carillas —dos por paciente— sale UNA hoja vertical con todos los
//     presentes. Conserva la franja de identificación del formato oficial
//     (cama · edad · nombre · RUT · días · fecha) y agrega debajo el
//     diagnóstico y las escalas. Lo que esta guardia cuida: que las escalas
//     NO se inventen (la que no está medida no aparece), que la cama libre no
//     entre, que el orden sea por número de cama y que quepa en una hoja.
//     Y desde el 10-ago-2026, que se feche con el RELOJ y no con el turno: a la
//     1 AM del 10 salía impresa «09/08» porque heredaba la fecha del turno
//     lógico, que hasta las 9 de la mañana sigue siendo la noche anterior.
//
// 2 · CONTROL DE FILTROS. La hoja de la ronda de la noche, con LAS 18 CAMAS
//     —no solo las ocupadas: así se ve dónde hay ventiladores libres—, el
//     equipo de cada sala y su estado, la fecha de cambio de cada filtro y una
//     casilla por el filtro que toque cambiar. Lo que esta guardia cuida: que
//     la regla de vencimiento sea la MISMA del servidor (etiqueta + frecuencia
//     = fecha de cambio, y el cambio se ejecuta en la MADRUGADA de esa fecha,
//     o sea en el turno noche de la VÍSPERA → el aviso sale una noche antes,
//     con frec-1 días cumplidos; corregido el 10-ago-2026 tras el reporte de
//     Manuel desde el turno), que el ventilador diga EN USO solo si hay
//     un paciente en VM, y que la casilla salga solo donde hay algo que hacer.
//     Ésta es la excepción a lo anterior: se feche con el TURNO, porque lo que
//     decide es qué filtro toca cambiar esta noche, y va rotulada «NOCHE DEL …»
//     para que su fecha no se confunda con un día atrasado.
//
// Uso: node build/checks/lista_y_filtros.js
const path = require('path');
const { chromium } = require('playwright-core');
const MM = 3.779528;

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    // ⏰ RELOJ FIJO: 10-ago-2026, 02:30. Está a propósito DENTRO de la ventana de
    // gracia (00:00–09:00), la franja en que el turno lógico todavía apunta al día
    // ANTERIOR. Es el escenario exacto del desfase que Manuel reportó en terreno:
    // imprimió la lista siendo 10 y salió fechada el 9. Sin este reloj, la guardia
    // dependía del día en que se corriera (los asserts estaban escritos contra el
    // 09-08 y habrían empezado a fallar solos al día siguiente).
    const REAL = Date, T = new REAL(2026, 7, 10, 2, 30, 0).getTime();
    class Fija extends REAL {
      constructor(...a) { super(...(a.length ? a : [T])); }
      static now() { return T; }
    }
    window.Date = Fija;
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 18, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
    window.print = () => { window._PRINTS = (window._PRINTS || 0) + 1; };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
  const ok = (l, c) => eq(l, !!c, true);

  const R = await p.evaluate(() => {
    const r = {};
    // Unidad de prueba: 3 ocupadas (2 en VM) + 1 libre con ventilador guardado.
    DB = [
      { ID_CAMA: '2', OCUPADA: true, NOMBRE: 'Segundo Paciente', EDAD: 60, RUT: '2-7',
        FECHA_INGRESO: '2026-08-02', TS_INGRESO: '2026-08-02 10:00', DIAGNOSTICO: 'Neumonía grave',
        SOPORTE: 'VM', APACHE2: 18, BARTHEL: '', CHARLSON: 3, ULT_MRC: 44, ULT_FSS: '',
        VM_TAG: 'Servo-i 05', VM_TAG_ESTADO: 'Operativo',
        // El caso REAL que Manuel reportó desde el turno (10-ago-2026): HME del
        // 08 y HEPA del 07 se cambian los dos en la madrugada del 10, o sea en
        // esta noche del 09. El TC recién puesto el 09 no toca hasta el 12.
        DISP_HME_FECHA: '2026-08-08', DISP_HEPA_FECHA: '2026-08-07', DISP_TC_FECHA: '2026-08-09' },
      { ID_CAMA: '1', OCUPADA: 'TRUE', NOMBRE: 'Primer Paciente', EDAD: 50, RUT: '1-9',
        FECHA_INGRESO: '2026-08-01', TS_INGRESO: '2026-08-01 08:00', DIAGNOSTICO: 'Shock séptico',
        SOPORTE: 'Ambiente', VM_TAG: 'Puritan 02', VM_TAG_ESTADO: 'Operativo' },
      { ID_CAMA: '4', OCUPADA: true, NOMBRE: 'Cuarto Paciente', EDAD: 71, RUT: '4-3',
        FECHA_INGRESO: '2026-08-05', DIAGNOSTICO: 'TEC grave', SOPORTE: 'VM',
        VM_TAG: 'Carescape 01', VM_TAG_ESTADO: 'Con falla',
        DISP_HME_FECHA: '2026-08-04', DISP_HEPA_FECHA: '2026-08-09', DISP_TC_FECHA: '' },
      { ID_CAMA: '3', OCUPADA: false, NOMBRE: '', EDAD: '', RUT: '', VM_TAG: 'Servo-i 09', VM_TAG_ESTADO: 'En mantención' },
    ];
    /* ── 1 · Lista del día ── */
    imprimirListaDelDia();
    r.listaImprimio = window._PRINTS === 1;
    // El turno lógico está —correctamente— en la NOCHE DEL 9: son las 02:30 del 10
    // y la evolución de esa noche todavía se escribe. Lo que NO puede pasar es que
    // el papel herede esa fecha.
    r.turnoSigueEnAyer = v('gDate') === '2026-08-09';
    r.listaClase = document.body.classList.contains('print-lista');
    r.listaPortrait = !!$('pgOrientacion') && $('pgOrientacion').textContent.indexOf('portrait') !== -1;
    const L = $('listaPrint').innerHTML;
    r.listaPacientes = (L.match(/class="ld-pac"/g) || []).length;      // 3 ocupadas
    r.listaLibreFuera = L.indexOf('>3<') === -1 || L.indexOf('CAMA</b><br><span class="ld-big">3<') === -1;
    r.listaOrden = L.indexOf('PRIMER PACIENTE') < L.indexOf('SEGUNDO PACIENTE');
    r.listaFranja = ['PRIMER PACIENTE', '1-9', '10/08/2026', 'Shock séptico'].every(x => L.indexOf(x) !== -1);
    // 🎯 El pedido de terreno: la hoja se fecha con el reloj y dice a qué hora salió.
    r.listaFechaReloj = L.indexOf('FECHA 10/08/2026 · 02:30 h') !== -1;
    r.listaSinDiaAnterior = L.indexOf('09/08/2026') === -1;
    // Los días de estada corren con la misma fecha: ingresó el 01-08, al 10 lleva 9.
    r.listaDias = L.indexOf('<b>DÍAS</b><br><span class="ld-big">9</span>') !== -1;
    // Escalas: APACHE/Charlson/MRC del paciente 2 sí; Barthel y FSS (vacías) no.
    const bloque2 = L.split('class="ld-pac"')[2] || '';
    r.escalasQueHay = ['APACHE II', 'Charlson', 'MRC-ss'].every(x => bloque2.indexOf(x) !== -1);
    r.escalasQueNo = bloque2.indexOf('Barthel') === -1 && bloque2.indexOf('FSS-ICU') === -1;
    r.listaSinResiduos = L.indexOf('undefined') === -1 && L.indexOf('null') === -1;
    window.dispatchEvent(new Event('afterprint'));
    r.listaLimpia = !document.body.classList.contains('print-lista') && !$('pgOrientacion');

    /* ── 2 · Control de filtros ── */
    imprimirFiltros();
    r.filtrosImprimio = window._PRINTS === 2;
    // Esta hoja SÍ va con la fecha del turno —a las 02:30 la ronda en curso sigue
    // siendo la noche del 9—, y lo dice con todas sus letras para que no se lea
    // como un día atrasado. Es la misma fecha que muestra «Cambios de esta noche».
    r.filtrosNoche = $('filtrosPrint').innerHTML.indexOf('NOCHE DEL 09/08/2026') !== -1;
    r.filtrosClase = document.body.classList.contains('print-filtros');
    const F = $('filtrosPrint').innerHTML;
    r.filas = (F.match(/class="fl-c fl-cama"/g) || []).length;         // LAS 18 camas
    r.camaLibre = F.indexOf('cama libre') !== -1;                      // la 3 aparece igual
    r.sinEquipo = (F.match(/sin equipo/g) || []).length >= 1;          // camas sin ventilador
    r.enUso = (F.match(/EN USO/g) || []).length === 2;                 // las 2 en VM, falle o no el equipo
    r.disponible = F.indexOf('DISPONIBLE') !== -1;                     // equipo con paciente NO ventilado
    r.falla = /EN USO · CON FALLA/.test(F);                            // uso y falla, juntos
    r.mantencion = /DISPONIBLE · MANTENCIÓN/.test(F);                  // «EN » se abrevia para que quepa
    // Regla de vencimiento (espejo del servidor): el cambio se hace en la
    // MADRUGADA de su fecha, o sea en el turno noche de la víspera. Estamos en
    // la noche del 09 → la madrugada del 10.
    //   cama 2: HME puesto 08-08 (cada 2) → cambio 10-08 = ESTA NOCHE
    //           HEPA puesto 07-08 (cada 3) → cambio 10-08 = ESTA NOCHE
    //           T.Care puesto 09-08 → cambio 12-08, aún no
    //   cama 4: HME puesto 04-08 → debió cambiarse la madrugada del 06 = VENCIDO (4d)
    //           HEPA puesto 09-08 → cambio 12-08; T.Care sin fecha = —
    r.estaNoche = (F.match(/ESTA NOCHE/g) || []).length === 2;
    // El atraso va abreviado a propósito: el texto largo desbordaba la columna.
    r.vencido = /VENCIDO \(4d\)/.test(F);
    r.futuro = F.indexOf('cambio 12-08') !== -1;
    r.sinFecha = (F.match(/class="fl-c fl-na">—/g) || []).length >= 1;
    // La hoja dice para qué madrugada es, no solo de qué noche.
    r.madrugada = F.indexOf('madrugada del 10-08') !== -1;
    // Casillas: solo donde hay algo que hacer (2 en cama 2, 1 en cama 4)
    r.casillas = (F.match(/class="fl-box"/g) || []).length === 3;
    r.pendientes = /<b>3<\/b> cambio\(s\) esta noche/.test(F);
    // Ventiladores sin paciente: cama 1 (paciente no ventilado), 3 (libre) y 4
    // NO —esa está en uso aunque el equipo falle—, o sea 2.
    r.libres = /<b>2<\/b> ventilador\(es\) sin paciente/.test(F);
    r.filtrosSinResiduos = F.indexOf('undefined') === -1 && F.indexOf('NaN') === -1;
    window.dispatchEvent(new Event('afterprint'));
    r.filtrosLimpio = !document.body.classList.contains('print-filtros') && !$('pgOrientacion');
    return r;
  });

  console.log('── 1 · Lista del día ── (reloj fijo: 10-ago-2026, 02:30)');
  ok('se abrió la impresión', R.listaImprimio);
  ok('el turno lógico sigue siendo la noche del 9 (regla clínica intacta)', R.turnoSigueEnAyer);
  ok('…pero el papel se fecha con el RELOJ: 10/08/2026 · 02:30 h', R.listaFechaReloj);
  ok('ni rastro del día anterior en la hoja', R.listaSinDiaAnterior);
  ok('los días de estada corren con esa misma fecha (9 días)', R.listaDias);
  ok('clase print-lista activa', R.listaClase);
  ok('se inyecta @page VERTICAL', R.listaPortrait);
  eq('una franja por paciente presente', R.listaPacientes, 3);
  ok('la cama libre NO entra', R.listaLibreFuera);
  ok('ordenadas por número de cama', R.listaOrden);
  ok('la franja trae nombre, RUT, fecha y diagnóstico', R.listaFranja);
  ok('salen las escalas registradas (APACHE, Charlson, MRC)', R.escalasQueHay);
  ok('…y NO las que nadie midió (Barthel, FSS vacías)', R.escalasQueNo);
  ok('sin residuos undefined/null', R.listaSinResiduos);
  ok('afterprint limpia clase y estilo', R.listaLimpia);

  console.log('\n── 2 · Control de filtros ──');
  ok('se abrió la impresión', R.filtrosImprimio);
  ok('clase print-filtros activa', R.filtrosClase);
  ok('se rotula «NOCHE DEL 09/08/2026»: la ronda en curso, no un día atrasado', R.filtrosNoche);
  eq('salen LAS 18 camas (no solo las ocupadas)', R.filas, 18);
  ok('la cama libre aparece como tal', R.camaLibre);
  ok('las camas sin ventilador lo dicen', R.sinEquipo);
  ok('EN USO solo donde hay paciente en VM', R.enUso);
  ok('DISPONIBLE cuando el equipo está sin paciente ventilado', R.disponible);
  ok('un equipo con falla ventilando dice las dos cosas', R.falla);
  ok('el estado largo se abrevia para caber (EN MANTENCIÓN → MANTENCIÓN)', R.mantencion);
  ok('«ESTA NOCHE» en los dos del caso de terreno (HME del 08, HEPA del 07)', R.estaNoche);
  ok('la hoja dice para qué madrugada es (10-08)', R.madrugada);
  ok('«VENCIDO (4d)» con el atraso real', R.vencido);
  ok('el que no toca muestra su fecha futura', R.futuro);
  ok('el filtro sin fecha queda en —', R.sinFecha);
  ok('una casilla por filtro que toca cambiar, y ninguna más', R.casillas);
  ok('el contador de pendientes cuadra con las casillas', R.pendientes);
  ok('el contador de ventiladores sin paciente cuadra', R.libres);
  ok('sin residuos undefined/NaN', R.filtrosSinResiduos);
  ok('afterprint limpia clase y estilo', R.filtrosLimpio);

  /* ── 3 · Que quepan en una hoja ─────────────────────────────────────────
     Se mide al ancho útil del A4 vertical (194 mm) contra su alto (281 mm).
     Es el punto del pedido: «una lista de UNA hoja». */
  console.log('\n3 · Cuánto ocupan en papel');
  await p.emulateMedia({ media: 'print' });
  await p.setViewportSize({ width: Math.round(194 * MM), height: 1200 });
  await p.waitForTimeout(150);
  const alto = await p.evaluate(() => {
    document.body.classList.add('print-lista');
    const l = $('listaPrint').getBoundingClientRect().height;
    document.body.classList.remove('print-lista');
    document.body.classList.add('print-filtros');
    const f = $('filtrosPrint').getBoundingClientRect().height;
    document.body.classList.remove('print-filtros');
    return { lista: l, filtros: f };
  });
  const hojas = px => px / (281 * MM);
  console.log(`   lista del día (3 pacientes): ${hojas(alto.lista).toFixed(2)} hojas`);
  console.log(`   control de filtros (18 camas): ${hojas(alto.filtros).toFixed(2)} hojas`);
  ok('la lista del día cabe en una hoja', hojas(alto.lista) <= 1);
  ok('el control de filtros cabe en una hoja', hojas(alto.filtros) <= 1);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ lista_y_filtros OK');
  process.exit(fails.length ? 1 : 0);
})();
