// hoja_registro_dia.js — La hoja de registro kinésico sale con el paciente ya
// escrito (ago-2026, pedido de Diego: «evitar tener que hacer la hoja de
// registro»). Fusiona la franja que Manuel dejó afinada en la lista del día
// con el formato oficial V0.2, y prellena lo que la app ya sabe.
//
// 🔴 LA GEOMETRÍA ESTÁ MEDIDA EN EL PDF OFICIAL A 200 dpi, no estimada:
//    · la fila mide 14 px — subirla estira el bloque de vía aérea, que comparte
//      esas filas, y lo vuelve cuadrado cuando en el papel es 2,5:1. Eso pasó
//      de verdad y Diego lo cazó a ojo. Si hace falta más aire para escribir,
//      se gana ENSANCHANDO la etiqueta, nunca subiendo la fila;
//    · las cuatro tablas comparten la etiqueta (16,6%) y el resto va en 9
//      columnas, que se dividen en tres grupos de 3. Por eso TURNO DÍA, TURNO
//      NOCHE y VÍA AÉREA miden lo mismo y sus bordes caen sobre bordes de
//      columna de los bloques de abajo;
//    · la banda de turnos NO lleva recuadro gris: en el papel es texto suelto.
//
// Las reintubaciones se cuentan en el servidor (contarReintubaciones) y la
// unidad es el EPISODIO. 🔴 Eso NO es el indicador de fracaso de extubación,
// cuya unidad es la EXTUBACIÓN: un paciente extubado tres veces con dos
// reintubaciones son 3 intentos y 2 fracasos. Mantener los dos conteos
// separados es el punto — este proyecto ya pagó caro tener dos definiciones
// del mismo número conviviendo («día con VM», `sin_condiciones`).
//
// Uso: node build/checks/hoja_registro_dia.js
const path = require('path');
const { chromium } = require('playwright-core');

const PUENTE = () => {
  window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
    api(a, d) { window.__ult = { a: a, d: d };
      setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 18, BANNERS: {} }
        : a === 'GET_REINTUB_N' ? { p1: 2 } : null) }), 5); }
  }; } }; } } } };
};

/** Dos pacientes reales: uno con TOT y datos completos, otro con TQT y casi nada. */
const SEMBRAR = () => {
  DB.length = 0;
  DB.push({ ID_CAMA: '4', OCUPADA: 'TRUE', NOMBRE: 'María del Carmen Rojas Villalobos',
    EDAD: 67, SEXO: 'F', RUT: '12.345.678-9',
    DIAGNOSTICO: 'Shock séptico de foco pulmonar · SDRA moderado',
    FECHA_INGRESO: '2026-08-04', TS_INGRESO: '2026-08-04 09:00', TALLA_CM: '158',
    VIA_AEREA: 'TOT', TOT_NUMERO: '8.0', TOT_CM_LABIO: '22', DIAS_VM: 6, DIAS_VA: 6,
    DISP_HME_FECHA: '2026-08-10', DISP_HEPA_FECHA: '2026-08-08', DISP_TC_FECHA: '2026-08-08',
    APACHE2: 18, BARTHEL: 85, CHARLSON: 4, ULT_FSS: 22, ULT_MRC: 44, PATIENT_ID: 'p1' });
  DB.push({ ID_CAMA: '7', OCUPADA: 'TRUE', NOMBRE: 'Pedro Soto', EDAD: 71, SEXO: 'M',
    RUT: '9.876.543-2', DIAGNOSTICO: 'NAVM', FECHA_INGRESO: '2026-08-01',
    VIA_AEREA: 'TQT', TQT_CALIBRE: '8', DIAS_VM: 9, DIAS_VA: 9, PATIENT_ID: 'p2' });
  DB.push({ ID_CAMA: '9', OCUPADA: 'FALSE' });
  imprimirHojasDelDia();
};

(async () => {
  const idx = 'file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 900, height: 1300 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const fails = [];
  const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!ok) fails.push(l); };

  await p.addInitScript(PUENTE);
  await p.goto(idx);
  await p.waitForTimeout(500);
  await p.evaluate(SEMBRAR);
  await p.waitForTimeout(120);   // la impresión espera el conteo del servidor

  console.log('1 · Una carilla por paciente presente');
  const R1 = await p.evaluate(() => {
    const h = document.getElementById('rkPrint');
    return { carillas: h.querySelectorAll('.rk-page').length,
      soloUna: h.querySelectorAll('.rk-page.rk-sola').length,
      // la cama libre no sale
      sinLibre: !/CAMA<\/b>?\s*9/.test(h.innerHTML),
      camas: [...h.querySelectorAll('.rk-page')].map(x => (x.textContent.match(/CAMA\s*(\d+)/) || [])[1]).join(','),
      // la carilla neuromuscular NO va en la tanda del día
      sinNeuro: !/CUIDADOS NEUROMUSCULARES/.test(h.textContent) };
  });
  eq('dos pacientes presentes ⇒ dos carillas', R1.carillas, 2);
  eq('…todas marcadas como carilla sola', R1.soloUna, 2);
  eq('en orden de cama', R1.camas, '4,7');
  eq('la cama libre no se imprime', R1.sinLibre, true);
  eq('★ la carilla neuromuscular NO va en la tanda del día', R1.sinNeuro, true);

  console.log('\n2 · El encabezado que armó Manuel, ahora en la hoja');
  const R2 = await p.evaluate(() => {
    const pg = document.querySelectorAll('#rkPrint .rk-page')[0];
    const t = pg.textContent;
    return { nombre: /MARÍA DEL CARMEN ROJAS VILLALOBOS/.test(t), rut: /12\.345\.678-9/.test(t),
      dias: /\b7\b/.test(t), dx: /Shock séptico de foco pulmonar/.test(t),
      escalas: ['APACHE II', 'Barthel', 'Charlson', 'FSS-ICU', 'MRC-ss'].filter(e => t.includes(e)).length };
  });
  eq('nombre en la franja', R2.nombre, true);
  eq('RUT', R2.rut, true);
  eq('diagnóstico — lo único que le faltaba a la hoja', R2.dx, true);
  eq('las cinco escalas registradas', R2.escalas, 5);

  console.log('\n3 · Lo que la app calcula sola');
  const R3 = await p.evaluate(() => {
    const t = document.querySelectorAll('#rkPrint .rk-page')[0].textContent;
    return { talla: /158/.test(t), pesoIdeal: /50,6/.test(t),
      ml: ['253', '304', '354', '405'].filter(x => t.includes(x)).length,
      calibre: /8\.0/.test(t), cms: /22/.test(t), diasVM: /Dias VM\s*6/.test(t.replace(/\s+/g, ' ')),
      filtros: ['08-08', '10-08'].filter(x => t.includes(x)).length };
  });
  eq('talla', R3.talla, true);
  eq('peso ideal por la fórmula de la app (158 cm, F)', R3.pesoIdeal, true);
  eq('★ las cuatro multiplicaciones de ml/kg', R3.ml, 4);
  eq('calibre del tubo', R3.calibre, true);
  eq('días de VM', R3.diasVM, true);
  eq('fechas de los filtros', R3.filtros, 2);

  console.log('\n4 · El sombreado dice por dónde va la vía aérea');
  const R4 = await p.evaluate(() => {
    const pgs = [...document.querySelectorAll('#rkPrint .rk-page')];
    const via = i => { const e = pgs[i].querySelector('.rk-via'); return e ? e.textContent.trim() : null; };
    return { p1: via(0), p2: via(1), unoSolo: pgs.map(x => x.querySelectorAll('.rk-via').length),
      // el de TQT lleva su calibre en la misma casilla, y sin cm de fijación
      calibreTQT: /Calibre\s*8/.test(pgs[1].textContent.replace(/\s+/g, ' ')) };
  });
  eq('el paciente con TOT sombrea TOT', R4.p1, 'TOT');
  eq('el paciente con TQT sombrea TQT', R4.p2, 'TQT');
  eq('…y nunca los dos a la vez', R4.unoSolo.join(','), '1,1');
  eq('el calibre sale del campo que corresponde a cada vía', R4.calibreTQT, true);

  console.log('\n5 · ★ Lo que no se sabe NO se inventa');
  const R5 = await p.evaluate(() => {
    const pgs = [...document.querySelectorAll('#rkPrint .rk-page')];
    const t2 = pgs[1].textContent;
    // Pedro no tiene escalas, ni talla, ni fechas de filtros
    return { sinEscalas: !/APACHE|Barthel|Charlson|FSS-ICU|MRC-ss/.test(t2),
      sinVolTidal: !/Talla cms\.\s*\d/.test(t2.replace(/\s+/g, ' ')),
      sinReintub: (() => { const m = pgs[1].textContent.replace(/\s+/g, ' ')
        .match(/Reintub\.\s*(\S*)\s*Dias VM/); return m ? m[1] : '??'; })() };
  });
  eq('sin escalas medidas, no aparece ninguna', R5.sinEscalas, true);
  eq('sin talla, no se inventa el volumen tidal', R5.sinVolTidal, true);
  eq('★ sin reintubaciones la casilla va en blanco, no un 0', R5.sinReintub, '');

  console.log('\n5b · Reintubaciones del EPISODIO, contadas por el servidor');
  const R5b = await p.evaluate(() => {
    const pgs = [...document.querySelectorAll('#rkPrint .rk-page')];
    const rt = pg => { const m = pg.textContent.replace(/\s+/g, ' ')
      .match(/Reintub\.\s*(\S*)\s*Dias VM/); return m ? m[1] : '??'; };
    return { pedido: (window.__ult && window.__ult.a === 'GET_REINTUB_N') ? (window.__ult.d.pids || []).join(',') : null,
      conDos: rt(pgs[0]) };
  });
  eq('se le piden al servidor los pacientes presentes', R5b.pedido, 'p1,p2');
  eq('★ el paciente con dos reintubaciones imprime 2', R5b.conDos, '2');

  console.log('\n5c · Si el servidor falla, la hoja sale igual');
  const R5c = await p.evaluate(async () => {
    const orig = window.api;
    window.api = (a, d) => a === 'GET_REINTUB_N' ? Promise.reject(new Error('caído')) : orig(a, d);
    document.getElementById('rkPrint').innerHTML = '';
    imprimirHojasDelDia();
    await new Promise(r => setTimeout(r, 150));
    const n = document.querySelectorAll('#rkPrint .rk-page').length;
    window.api = orig;
    return { carillas: n };
  });
  eq('★ el conteo caído NO cancela la impresión', R5c.carillas, 2);

  console.log('\n6 · Geometría medida en el papel oficial');
  const R6 = await p.evaluate(() => {
    // #rkPrint vive oculto y solo se revela en @media print, así que para
    // medirlo hay que destaparlo: si no, todo mide 0 y los asserts pasan solos.
    const caja = document.getElementById('rkPrint');
    caja.style.cssText = 'display:block;position:absolute;left:0;top:0;width:794px;background:#fff;';
    const pg = document.querySelectorAll('#rkPrint .rk-page')[0];
    const r = e => e.getBoundingClientRect();
    const t1 = pg.querySelectorAll('.rk-t1')[1];
    const filas = [...t1.querySelectorAll('tr')];
    const tot = [...filas[0].children].find(td => td.textContent.trim() === 'TOT');
    const va = { w: r(t1).right - r(tot).x, h: r(filas[filas.length - 1]).bottom - r(filas[0]).top };
    const bandas = [...pg.querySelectorAll('.rk-sinborde td')].map(td => Math.round(r(td).width));
    return { altoFila: Math.round(r(filas[0]).height),
      ratioVA: +(va.w / va.h).toFixed(2),
      bandaVA: Math.round(r(pg.querySelectorAll('.rk-sinborde td')[3]).x),
      xTOT: Math.round(r(tot).x),
      bandas: bandas.slice(1).join(','),
      etiquetas: [...pg.querySelectorAll('.rk-t')].map(t => Math.round(r(t.querySelector('td')).width)),
      bandaSinCaja: getComputedStyle(pg.querySelector('.rk-sinborde td:nth-child(2)')).borderTopWidth };
  });
  eq('★ la fila mide 14 px, como el papel', R6.altoFila, 14);
  eq('★ el bloque de vía aérea es rectangular (>2:1)', R6.ratioVA > 2, true);
  eq('la banda de vía aérea empieza donde empieza TOT', Math.abs(R6.bandaVA - R6.xTOT) <= 2, true);
  eq('día, noche y vía aérea miden lo mismo', new Set(R6.bandas.split(',')).size, 1);
  eq('las cuatro tablas comparten la columna de etiquetas', new Set(R6.etiquetas).size, 1);
  eq('★ la banda de turnos no lleva recuadro', R6.bandaSinCaja, '0px');

  console.log('\n7 · Laboratorio: seis gases y un bloque para escribir');
  const R7 = await p.evaluate(() => {
    const caja = document.getElementById('rkPrint');
    caja.style.cssText = 'display:block;position:absolute;left:0;top:0;width:794px;background:#fff;';
    const pg = document.querySelectorAll('#rkPrint .rk-page')[0];
    const tabs = [...pg.querySelectorAll('.rk-t')];
    const lab = tabs[tabs.length - 1];
    const fila = lab.querySelectorAll('tr')[0];
    const obs = lab.querySelector('.rk-obs');
    const r = e => e.getBoundingClientRect();
    return { celdas: fila.children.length,
      gases: fila.children.length - 2,
      obsAncho: Math.round(r(obs).width),
      obsPorFila: lab.querySelectorAll('.rk-obs').length,
      filasLab: lab.querySelectorAll('tr').length,
      dosTitulos: pg.querySelectorAll('.rk-labtit span').length };
  });
  eq('seis casillas de gases', R7.gases, 6);
  eq('…más el bloque de observaciones', R7.celdas, 8);
  eq('el bloque de observaciones es ancho (>300 px)', R7.obsAncho > 300, true);
  eq('una línea de observaciones por fila', R7.obsPorFila, R7.filasLab);
  eq('dos títulos separados, como el papel', R7.dosTitulos, 2);

  console.log('\n8 · Encabezado y pie institucionales');
  const R8 = await p.evaluate(() => {
    const pg = document.querySelectorAll('#rkPrint .rk-page')[0];
    return { hosp: /Hospital San Pablo/.test(pg.textContent),
      unidad: /Unidad de Paciente Crítico Adulto/.test(pg.textContent),
      pie: /Departamento de Calidad y Seguridad del Paciente/.test(pg.textContent),
      logos: pg.querySelectorAll('.rk-inst img, .rk-pie img').length };
  });
  eq('nombre del hospital', R8.hosp, true);
  eq('unidad', R8.unidad, true);
  eq('pie de calidad', R8.pie, true);
  eq('tres logos (dos arriba, uno abajo)', R8.logos, 3);

  console.log('\n9 · La hoja completa sigue disponible desde el historial');
  const R9 = await p.evaluate(() => {
    const c = DB[0];
    const dos = rkHojaHTML(c, '2026-08-11');
    const una = rkHojaHTML(c, '2026-08-11', true);
    return { completa: (dos.match(/rk-page/g) || []).length,
      sola: (una.match(/rk-page/g) || []).length,
      traeNeuro: /CUIDADOS NEUROMUSCULARES/.test(dos) };
  });
  eq('sin el tercer parámetro salen las dos carillas', R9.completa, 2);
  eq('con él, una sola', R9.sola, 1);
  eq('la neuromuscular sigue existiendo para el historial', R9.traeNeuro, true);

  console.log('\n10 · La hoja cabe en UNA carilla, también en los bordes');
  const R95 = await p.evaluate(() => {
    // El riesgo real es que un diagnóstico largo empuje la hoja a dos páginas y
    // el equipo termine con una carilla suelta por paciente.
    const base = { OCUPADA: 'TRUE', EDAD: 67, SEXO: 'F', RUT: '22.222.222-2',
      FECHA_INGRESO: '2026-08-04', TALLA_CM: '158', VIA_AEREA: 'TOT', TOT_NUMERO: '8.0',
      TOT_CM_LABIO: '22', DIAS_VM: 6, DIAS_VA: 6, DISP_HME_FECHA: '2026-08-10',
      DISP_HEPA_FECHA: '2026-08-08', DISP_TC_FECHA: '2026-08-08',
      APACHE2: 18, BARTHEL: 85, CHARLSON: 4, ULT_FSS: 22, ULT_MRC: 44 };
    const casos = [
      { n: 'normal', c: { ...base, ID_CAMA: '1', NOMBRE: 'Ana Paz Ríos', DIAGNOSTICO: 'NAVM' } },
      { n: 'largo', c: { ...base, ID_CAMA: '2',
        NOMBRE: 'María de los Ángeles Fernández Villagrán del Solar',
        DIAGNOSTICO: 'Shock séptico de foco abdominal con falla multiorgánica, SDRA severo, '
          + 'insuficiencia renal aguda KDIGO 3 en hemodiálisis y polineuropatía del paciente crítico' } },
      { n: 'vacío', c: { OCUPADA: 'TRUE', ID_CAMA: '3', NOMBRE: 'N N', FECHA_INGRESO: '2026-08-10' } },
    ];
    const caja = document.getElementById('rkPrint');
    caja.style.cssText = 'display:block;position:absolute;left:0;top:0;width:794px;background:#fff;';
    const UTIL = 1093;   // A4 vertical a 96 dpi, menos el margen de .rk-page
    const alt = casos.map(x => { caja.innerHTML = rkHojaHTML(x.c, '2026-08-11', true);
      return Math.round(caja.querySelector('.rk-page').getBoundingClientRect().height); });
    caja.style.cssText = '';
    return { altos: alt, todosCaben: alt.every(h => h <= UTIL), peor: Math.max(...alt) };
  });
  eq('★ la hoja cabe en una carilla en los tres casos', R95.todosCaben, true);
  eq('…y el peor caso deja margen (<1000 px)', R95.peor < 1000, true);

  console.log('\n11 · Sin pacientes no revienta');
  const R10 = await p.evaluate(() => {
    DB.length = 0; DB.push({ ID_CAMA: '1', OCUPADA: 'FALSE' });
    document.getElementById('rkPrint').innerHTML = '';
    imprimirHojasDelDia();
    return { vacio: document.getElementById('rkPrint').innerHTML === '' };
  });
  eq('no imprime nada y avisa', R10.vacio, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
