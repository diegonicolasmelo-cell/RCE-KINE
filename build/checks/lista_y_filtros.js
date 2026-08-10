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
//
// 2 · CONTROL DE FILTROS. La hoja de la ronda de la noche, con LAS 18 CAMAS
//     —no solo las ocupadas: así se ve dónde hay ventiladores libres—, el
//     equipo de cada sala y su estado, la fecha de cambio de cada filtro y una
//     casilla por el filtro que toque cambiar. Lo que esta guardia cuida: que
//     la regla de vencimiento sea la MISMA del servidor (etiqueta + frecuencia,
//     cambio en el turno noche de ese día; NO el día anterior, que fue el
//     desfase reportado en terreno), que el ventilador diga EN USO solo si hay
//     un paciente en VM, y que la casilla salga solo donde hay algo que hacer.
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
        DISP_HME_FECHA: '2026-08-07', DISP_HEPA_FECHA: '2026-08-06', DISP_TC_FECHA: '2026-08-09' },
      { ID_CAMA: '1', OCUPADA: 'TRUE', NOMBRE: 'Primer Paciente', EDAD: 50, RUT: '1-9',
        FECHA_INGRESO: '2026-08-01', TS_INGRESO: '2026-08-01 08:00', DIAGNOSTICO: 'Shock séptico',
        SOPORTE: 'Ambiente', VM_TAG: 'Puritan 02', VM_TAG_ESTADO: 'Operativo' },
      { ID_CAMA: '4', OCUPADA: true, NOMBRE: 'Cuarto Paciente', EDAD: 71, RUT: '4-3',
        FECHA_INGRESO: '2026-08-05', DIAGNOSTICO: 'TEC grave', SOPORTE: 'VM',
        VM_TAG: 'Carescape 01', VM_TAG_ESTADO: 'Con falla',
        DISP_HME_FECHA: '2026-08-04', DISP_HEPA_FECHA: '2026-08-09', DISP_TC_FECHA: '' },
      { ID_CAMA: '3', OCUPADA: false, NOMBRE: '', EDAD: '', RUT: '', VM_TAG: 'Servo-i 09', VM_TAG_ESTADO: 'En mantención' },
    ];
    const FECHA = '2026-08-09';

    /* ── 1 · Lista del día ── */
    imprimirListaDelDia();
    r.listaImprimio = window._PRINTS === 1;
    r.listaClase = document.body.classList.contains('print-lista');
    r.listaPortrait = !!$('pgOrientacion') && $('pgOrientacion').textContent.indexOf('portrait') !== -1;
    const L = $('listaPrint').innerHTML;
    r.listaPacientes = (L.match(/class="ld-pac"/g) || []).length;      // 3 ocupadas
    r.listaLibreFuera = L.indexOf('>3<') === -1 || L.indexOf('CAMA</b><br><span class="ld-big">3<') === -1;
    r.listaOrden = L.indexOf('PRIMER PACIENTE') < L.indexOf('SEGUNDO PACIENTE');
    r.listaFranja = ['PRIMER PACIENTE', '1-9', '09/08/2026', 'Shock séptico'].every(x => L.indexOf(x) !== -1);
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
    r.filtrosClase = document.body.classList.contains('print-filtros');
    const F = $('filtrosPrint').innerHTML;
    r.filas = (F.match(/class="fl-c fl-cama"/g) || []).length;         // LAS 18 camas
    r.camaLibre = F.indexOf('cama libre') !== -1;                      // la 3 aparece igual
    r.sinEquipo = (F.match(/sin equipo/g) || []).length >= 1;          // camas sin ventilador
    r.enUso = (F.match(/EN USO/g) || []).length === 2;                 // las 2 en VM, falle o no el equipo
    r.disponible = F.indexOf('DISPONIBLE') !== -1;                     // equipo con paciente NO ventilado
    r.falla = /EN USO · CON FALLA/.test(F);                            // uso y falla, juntos
    r.mantencion = /DISPONIBLE · MANTENCIÓN/.test(F);                  // «EN » se abrevia para que quepa
    // Regla de vencimiento (la del servidor): HME cada 2 días.
    //   cama 2: HME puesto 07-08 → cambio 09-08 = HOY
    //           HEPA puesto 06-08 (cada 3) → cambio 09-08 = HOY
    //           T.Care puesto 09-08 → cambio 12-08, aún no
    //   cama 4: HME puesto 04-08 → debió cambiarse el 06-08 = VENCIDO (3d)
    //           HEPA puesto 09-08 → cambio 12-08; T.Care sin fecha = —
    r.hoy = (F.match(/CAMBIAR HOY/g) || []).length === 2;
    // El atraso va abreviado a propósito: el texto largo desbordaba la columna.
    r.vencido = /VENCIDO \(3d\)/.test(F);
    r.futuro = F.indexOf('cambio 12-08') !== -1;
    r.sinFecha = (F.match(/class="fl-c fl-na">—/g) || []).length >= 1;
    // Casillas: solo donde hay algo que hacer (2 en cama 2, 1 en cama 4)
    r.casillas = (F.match(/class="fl-box"/g) || []).length === 3;
    r.pendientes = /<b>3<\/b> cambio\(s\) pendiente\(s\)/.test(F);
    // Ventiladores sin paciente: cama 1 (paciente no ventilado), 3 (libre) y 4
    // NO —esa está en uso aunque el equipo falle—, o sea 2.
    r.libres = /<b>2<\/b> ventilador\(es\) sin paciente/.test(F);
    r.filtrosSinResiduos = F.indexOf('undefined') === -1 && F.indexOf('NaN') === -1;
    window.dispatchEvent(new Event('afterprint'));
    r.filtrosLimpio = !document.body.classList.contains('print-filtros') && !$('pgOrientacion');
    return r;
  });

  console.log('── 1 · Lista del día ──');
  ok('se abrió la impresión', R.listaImprimio);
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
  eq('salen LAS 18 camas (no solo las ocupadas)', R.filas, 18);
  ok('la cama libre aparece como tal', R.camaLibre);
  ok('las camas sin ventilador lo dicen', R.sinEquipo);
  ok('EN USO solo donde hay paciente en VM', R.enUso);
  ok('DISPONIBLE cuando el equipo está sin paciente ventilado', R.disponible);
  ok('un equipo con falla ventilando dice las dos cosas', R.falla);
  ok('el estado largo se abrevia para caber (EN MANTENCIÓN → MANTENCIÓN)', R.mantencion);
  ok('«CAMBIAR HOY» en los dos que vencen hoy', R.hoy);
  ok('«VENCIDO (3d)» con el atraso real', R.vencido);
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
