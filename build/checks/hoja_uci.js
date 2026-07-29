// hoja_uci.js — Guardia de la Hoja UCI del historial: estructura fiel al papel,
// segmentos (con el weaning dentro de Ventilatorio y aparte), filas ancla
// siempre visibles, rango, colapso de filas vacías, relojes de dispositivos,
// desglose de evaluaciones y cruz de lectura.
// Uso: node build/checks/hoja_uci.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');

/* Episodio de ejemplo: 4 días, extubación el 4º, con VA artificial y filtros. */
function evo(fecha, turno, extra) {
  return Object.assign({
    ID_CAMA: '3', PATIENT_ID: 'p1', TURNO_KEY: fecha + '-' + turno, FECHA: fecha, TURNO: turno,
    PLAN_FIRMA_KINE: turno === 'Dia' ? 'DMV' : 'NPR',
    VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
    VENT_PEEP: 8, VENT_FIO2: 50, VENT_SPO2: 95, VENT_FR: 16, VENT_VT: 420, CALC_ML_KG: '5,9',
    HEMO_ESTADO: 'Estable', SED_SAS: '3', SED_GCS_TOT: 11, RESP_KTR_CANT: 2,
    DIAS_VM_PREVIOS: 0, DIAS_VM: 1, DIA_ESTADIA: 1, FASE_JSON: '["Weaning"]',
  }, extra || {});
}
const EVOS = [
  evo('2026-07-25', 'Dia',   { DIA_ESTADIA: 1, DIAS_VM: 1, VENT_CUFF_EST: 'rango', DISP_HME_FECHA: '2026-07-25', DISP_HEPA_FECHA: '2026-07-25', DISP_TC_FECHA: '2026-07-25', VENT_CAB_RSS: '30-45°' }),
  evo('2026-07-25', 'Noche', { DIA_ESTADIA: 1, DIAS_VM: 1, VENT_CUFF_EST: 'ajuste', VENT_CUFF_CMH2O: 16 }),
  evo('2026-07-26', 'Dia',   { DIA_ESTADIA: 2, DIAS_VM: 2, EVAL_T_MRC: 42, EVAL_T_FSS: 9,
        EVAL_MRC_D1: 4, EVAL_MRC_D2: 4, EVAL_MRC_D3: 3, EVAL_MRC_D4: 3, EVAL_MRC_D5: 4, EVAL_MRC_D6: 3,
        EVAL_MRC_I1: 4, EVAL_MRC_I2: 3, EVAL_MRC_I3: 3, EVAL_MRC_I4: 3, EVAL_MRC_I5: 4, EVAL_MRC_I6: 4,
        EVAL_FSS_IT1: 2, EVAL_FSS_IT2: 2, EVAL_FSS_IT3: 2, EVAL_FSS_IT4: 2, EVAL_FSS_IT5: 1,
        DISP_HME_FECHA: '2026-07-25', VENT_PAFI: 238, KTM_REALIZADA: true, PVE_SC_RAZON: 'FiO2 sobre 50%' }),
  evo('2026-07-26', 'Noche', { DIA_ESTADIA: 2, DIAS_VM: 2, DISP_HME_FECHA: '2026-07-25' }),
  evo('2026-07-27', 'Dia',   { DIA_ESTADIA: 3, DIAS_VM: 3, PVE_VAL: 'si', PVE_RESULTADO: 'superada',
        DISP_HME_FECHA: '2026-07-25', VENT_PAFI: 280, EVAL_T_PMANT_VA: 8, VENT_PS: 10, VENT_MODO: 'CPAP/PS' }),
  evo('2026-07-27', 'Noche', { DIA_ESTADIA: 3, DIAS_VM: 3, DISP_HME_FECHA: '2026-07-25', VENT_PS: 10 }),
  evo('2026-07-28', 'Dia',   { DIA_ESTADIA: 4, DIAS_VM: 4, EXT_OCURRIO: true, EXT_TIPO: 'protocolo', EXT_HORA: '10:40',
        VENT_SOPORTE_FINAL: 'CNAF', DISP_HME_FECHA: '2026-07-28', VENT_PS: 8, PROC_RESUMEN: 'EXTUBACIÓN C/PROTOCOLO, PVE', EVAL_T_MRC: 50, VENT_PAFI: 305 }),
];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {}, FREC_HME_DIAS: 2, FREC_HEPA_DIAS: 3, FREC_SONDA_DIAS: 3 } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  await p.evaluate(e => {
    window.CFG = { NUM_CAMAS: 12, BANNERS: {}, FREC_HME_DIAS: 2, FREC_HEPA_DIAS: 3, FREC_SONDA_DIAS: 3, PTT_OK: 10, PTT_ALERTA: 12 };
    TL_EVOS = e; TL_HITOS = []; HJ_SEG = 'todo'; HJ_RANGO = 7; HJ_VACIAS = true;
    setTLtab('hoja');
  }, EVOS);

  // ── Estructura ──
  const S = await p.evaluate(() => ({
    tabHoja: !!document.getElementById('tlMt-hoja'),
    filas: document.querySelectorAll('#tlBody tr[data-hjf]').length,
    fechas: document.querySelectorAll('#tlBody thead th.fec').length,
    dn: document.querySelectorAll('#tlBody thead th.dn').length,
    bandas: [...document.querySelectorAll('#tlBody tr.band')].map(t => t.textContent.split('—')[0].trim()),
    filtrosOcultos: document.getElementById('tlFiltros').classList.contains('hidden'),
  }));
  eq('existe la pestaña Hoja UCI', S.tabHoja, true);
  eq('una columna por fecha del episodio (4 días)', S.fechas, 4);
  eq('cada fecha se divide en DÍA y NOCHE', S.dn, 8);
  eq('los filtros viejos del historial se ocultan', S.filtrosOcultos, true);
  eq('bandas en el orden del papel', JSON.stringify(S.bandas),
     JSON.stringify(['MONITORIZACIÓN', 'TERAPIA VENTILATORIA', 'DISPOSITIVOS Y PREVENCIÓN DE NAVM', 'CUIDADOS NEUROMUSCULARES', 'EVENTOS DEL TURNO']));
  eq('en «Todo» el weaning NO se duplica como banda propia', S.bandas.indexOf('PROTOCOLO DE WEANING'), -1);

  // Las clases de franja deben ir con prefijo propio: «mon», «nm», «ev»… ya
  // existen en la app y pisaban el estilo de la banda (bug real, jul-2026).
  const CL = await p.evaluate(() => {
    const b = document.querySelector('#tlBody tr.band');
    return { clases: b.className, fondo: getComputedStyle(b.querySelector('td')).backgroundColor,
      ancho: b.querySelector('td').getBoundingClientRect().width,
      anchoFila: b.getBoundingClientRect().width };
  });
  eq('las franjas usan clases con prefijo propio (sin colisión)', /hjb-/.test(CL.clases) && !/\bband mon\b/.test(CL.clases), true);
  eq('la franja pinta de color, no en blanco', CL.fondo !== 'rgb(255, 255, 255)' && CL.fondo !== 'rgba(0, 0, 0, 0)', true);
  eq('la franja ocupa toda la fila', Math.abs(CL.ancho - CL.anchoFila) < 3, true);

  // ── Valores leídos de las evoluciones ──
  const V = await p.evaluate(() => {
    const fila = l => [...document.querySelectorAll('#tlBody tr[data-hjf]')].find(t => t.querySelector('.par').textContent.trim() === l);
    const txt = (l, i) => { const f = fila(l); return f ? f.querySelectorAll('td')[i].textContent.trim() : null; };
    return {
      firma: txt('Firma', 0), firmaN: txt('Firma', 1),
      hme0: txt('🌫️ Filtro HME', 0), hme1: txt('🌫️ Filtro HME', 1), hme2: txt('🌫️ Filtro HME', 2),
      cuffD: txt('🎈 Cuff', 0), cuffN: txt('🎈 Cuff', 1),
      pafi: txt('PaFi', 1), pafi3: txt('PaFi', 3),
      mrc: txt('MRC-ss ( /60)', 1), dauci: txt('Debilidad UCI (≤48)', 1), dauci3: txt('Debilidad UCI (≤48)', 3),
      ext: txt('Extubación', 6), sop3: txt('Sop. ventilatorio / O2', 6),
      ptt: txt('P. transtraqueal (VF)', 2),
      hoy: !!document.querySelector('#tlBody thead th.hoy'),
    };
  });
  eq('firma del turno día', V.firma, 'DMV');
  eq('firma del turno noche', V.firmaN, 'NPR');
  eq('HME día 0 = instalado', V.hme0, '✓ Cambiado');
  eq('HME al día siguiente avisa (frec 2)', V.hme1, '⚠ Día 1/2');
  eq('HME al segundo día está vencido', V.hme2, '✕ Día 2/2 vencido');
  eq('cuff en rango (turno día)', V.cuffD, '✓ En rango');
  eq('cuff ajustado muestra el valor encontrado', V.cuffN, '⚠ Ajusté 16');
  eq('PaFi 238 en ámbar', V.pafi, '⚠ 238');
  eq('PaFi 305 en verde', V.pafi3, '✓ 305');
  eq('MRC con botón de desglose', V.mrc.replace(/\s+/g,' '), '42 ▸ ver');
  eq('DAUCI sí con MRC 42', V.dauci, '✕ SÍ');
  eq('DAUCI no con MRC 50', V.dauci3, '✓ NO');
  eq('extubación con protocolo y hora', V.ext, '✓ Extubación c/protocolo 10:40');
  eq('transición de soporte VM→CNAF', V.sop3, 'VM→CNAF');
  eq('P. transtraqueal 8 → permeable', V.ptt, '✓ 8');
  const N = await p.evaluate(() => [_hjNum('5,9'), _hjNum('6.1'), _hjNum(''), _hjNum('x')]);
  eq('los decimales con coma se leen completos (5,9 → 5.9)', N[0], 5.9);
  eq('los decimales con punto también', N[1], 6.1);
  eq('vacío y basura → sin valor', N[2] === null && N[3] === null, true);

  // ── Segmentos ──
  const SG = await p.evaluate(() => {
    const lbl = () => [...document.querySelectorAll('#tlBody tr[data-hjf] .par')].map(x => x.textContent.trim());
    const r = {};
    hjSetSeg('navm'); r.navm = lbl();
    hjSetSeg('nm');   r.nm = lbl();
    hjSetSeg('wean'); r.wean = lbl(); r.weanBanda = [...document.querySelectorAll('#tlBody tr.band')].map(t => t.textContent.split('—')[0].trim());
    hjSetSeg('vent'); r.vent = lbl();
    hjSetSeg('todo');
    return r;
  });
  const ancla = ['Fase clínica', 'Sop. ventilatorio / O2', 'Firma'];
  eq('NAVM: solo su bloque + filas ancla', ancla.every(a => SG.navm.includes(a)) && SG.navm.includes('🎈 Cuff') && !SG.navm.includes('MRC-ss ( /60)'), true);
  eq('NAVM incluye el paquete completo', ['Días de VM', '🎈 Cuff', '🛏️ Cabecera', '🌀 Trachcare', '🛡️ Filtro HEPA', '🌫️ Filtro HME'].every(x => SG.navm.includes(x)), true);
  eq('Neuromuscular: sin filas ventilatorias', SG.nm.includes('MRC-ss ( /60)') && !SG.nm.includes('PEEP / EPAP'), true);
  eq('Weaning: banda propia', SG.weanBanda.includes('PROTOCOLO DE WEANING'), true);
  eq('Weaning trae PS, PEEP, FiO2, modo, sedación, HDN, PVE y motivo',
     ['P. Soporte / IPAP', 'PEEP / EPAP', 'FiO2', 'Modo', 'SAS', 'Glasgow', 'HDN', 'PVE del turno', 'Motivo (fracaso / no PVE)'].every(x => SG.wean.includes(x)), true);
  eq('Ventilatorio TAMBIÉN incluye el weaning (PVE y extubación)',
     SG.vent.includes('PVE del turno') && SG.vent.includes('Extubación'), true);
  eq('las filas ancla sobreviven en todos los segmentos',
     [SG.navm, SG.nm, SG.wean, SG.vent].every(s => ancla.every(a => s.includes(a))), true);

  // ── Filas vacías, rango y desglose ──
  const F = await p.evaluate(() => {
    const r = {};
    r.conVacias = document.querySelectorAll('#tlBody tr.vacias').length > 0;
    r.filasOcultas = document.querySelectorAll('#tlBody tr[data-hjf]').length;
    hjToggleVacias();
    r.filasTodas = document.querySelectorAll('#tlBody tr[data-hjf]').length;
    r.sinAvisos = document.querySelectorAll('#tlBody tr.vacias').length;
    hjToggleVacias();
    hjSetRango(999); r.fechasTodo = document.querySelectorAll('#tlBody thead th.fec').length;
    hjSetRango(7);
    return r;
  });
  eq('avisa de las filas colapsadas', F.conVacias, true);
  eq('al mostrarlas aparecen más filas', F.filasTodas > F.filasOcultas, true);
  eq('y desaparece la línea de aviso', F.sinAvisos, 0);
  eq('«toda la estadía» muestra los 4 días', F.fechasTodo, 4);

  const D = await p.evaluate(() => {
    hjVer('mrc', '2026-07-26');
    const abierto = !document.getElementById('hjDet').classList.contains('hidden');
    const t = document.getElementById('hjDet').textContent;
    hjCerrar();
    return { abierto, cerrado: document.getElementById('hjDet').classList.contains('hidden'),
      subD: /21 \/ 30/.test(t), subI: /21 \/ 30/.test(t), total: /42 \/ 60/.test(t), dauci: /SÍ/.test(t),
      mov: /Dorsiflexión de tobillo/.test(t) };
  });
  eq('«▸ ver» abre el desglose del MRC', D.abierto, true);
  eq('el desglose lista los 6 movimientos', D.mov, true);
  eq('calcula los subtotales por hemicuerpo', D.subD && D.subI, true);
  eq('muestra el total y el corte DAUCI', D.total && D.dauci, true);
  eq('se cierra', D.cerrado, true);

  // ── Cruz de lectura ──
  const C = await p.evaluate(async () => {
    const td = document.querySelector('#tlBody tr[data-hjf] td');
    td.dispatchEvent(new MouseEvent('mouseenter'));
    const r = { fila: td.closest('tr').classList.contains('hov'), col: document.querySelectorAll('#tlBody td.hovc').length };
    td.dispatchEvent(new MouseEvent('mouseleave'));
    r.limpia = document.querySelectorAll('#tlBody td.hovc').length;
    return r;
  });
  eq('al pasar el cursor se ilumina la fila', C.fila, true);
  eq('y toda su columna', C.col > 1, true);
  eq('al salir se limpia', C.limpia, 0);


  // ── v4: reestructura del historial ──
  const H4 = await p.evaluate(async () => {
    const r = {};
    r.sinSeg = !document.getElementById('tlMt-seg');
    r.primeraTab = document.querySelector('.tl-tabs .tl-mtab').id;
    // Resumen: evoluciones plegadas, solo la última (más reciente) abierta
    setTLtab('res');
    const folds = [...document.querySelectorAll('#tlBody details.tlr-fold')];
    r.folds = folds.length;
    r.abiertas = folds.filter(f => f.open).length;
    r.primeraAbierta = folds[0] ? folds[0].open : false;
    r.cabecera = folds[0] ? folds[0].querySelector('summary').textContent.replace(/\s+/g, ' ').trim() : '';
    r.sinTendencia = !document.querySelector('#tlBody details.tlr-det');
    // Pantalla completa
    document.getElementById('tlp').classList.add('on');
    const rc = document.getElementById('tlp').getBoundingClientRect();
    r.fullW = Math.abs(rc.width - window.innerWidth) < 2;
    r.fullH = Math.abs(rc.height - window.innerHeight) < 2;
    // Cierra SOLO con la X: ni clic en el telón ni Escape
    cerrarTodo({ target: document.getElementById('ovl') });
    r.trasVelo = document.getElementById('tlp').classList.contains('on');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    r.trasEsc = document.getElementById('tlp').classList.contains('on');
    cerrarTL();
    r.trasX = document.getElementById('tlp').classList.contains('on');
    // Plantilla de impresión del seguimiento
    window.print = () => {};
    document.getElementById('tlp').classList.add('on');
    tlImprimir();
    r.printHead = /HOSPITAL SAN PABLO/.test(document.getElementById('tlPrint').innerHTML);
    r.printTablas = document.querySelectorAll('#tlPrint table').length;
    r.printOculto = getComputedStyle(document.getElementById('tlPrint')).display === 'none';
    return r;
  });
  eq('la pestaña Seguimiento ya no existe', H4.sinSeg, true);
  eq('Resumen es la primera pestaña (hoja de recepción)', H4.primeraTab, 'tlMt-res');
  eq('feed: una tarjeta plegable por evolución', H4.folds, 7);
  eq('feed: SOLO la última evolución parte abierta', H4.abiertas === 1 && H4.primeraAbierta, true);
  eq('la cabecera plegada identifica fecha + turno + firma', /Día 4/.test(H4.cabecera) && /DÍA/.test(H4.cabecera) && /DMV/.test(H4.cabecera), true);
  eq('el plegable «Tendencia por día» se eliminó', H4.sinTendencia, true);
  eq('el historial ocupa la pantalla completa', H4.fullW && H4.fullH, true);
  eq('clic en el telón NO lo cierra', H4.trasVelo, true);
  eq('Escape NO lo cierra', H4.trasEsc, true);
  eq('la X sí lo cierra', H4.trasX, false);
  eq('imprimir arma la hoja de seguimiento (plantilla)', H4.printHead && H4.printTablas >= 2, true);
  eq('la plantilla no es visible en pantalla', H4.printOculto, true);

  console.log(errs.length ? ('\nERRORES JS:\n' + errs.join('\n')) : '\nsin errores JS');
  await b.close();
  console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
  process.exit(fails.length || errs.length ? 1 : 0);
})();
