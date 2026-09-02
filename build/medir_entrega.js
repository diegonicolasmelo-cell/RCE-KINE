// medir_entrega.js — ¿en cuántas hojas A4 sale la entrega de turno?
//
// POR QUÉ EXISTE (ago-2026, pedido de Manuel: «vertical, 1 o 2 hojas»): la
// ficha compacta se diseñó para A4 APAISADO y ahí se midió («de ~4 hojas a
// ~2», Diego). Al darla vuelta, cada línea pierde 30% de ancho —el texto que
// fluye ocupa más renglones— pero la hoja gana 48% de alto. Cuál de los dos
// efectos manda NO se puede adivinar: se mide.
//
// CÓMO: monta la entrega REAL (renderEntrega del index, con su CSS de
// impresión) con 17 pacientes y mide el alto del documento al ancho útil de
// cada orientación. La cuenta de hojas es alto ÷ alto útil de la página.
//   A4 apaisado, margen 8 mm → útil 281 × 194 mm → 1062 × 733 px @96 dpi
//   A4 vertical,  margen 8 mm → útil 194 × 281 mm →  733 × 1062 px
//
// Tres escenarios, porque «cuántas hojas» depende de cuánto traiga el turno:
//   alta    · 12 de 17 en VM, 3 eventos por ficha, cultivo, dispositivos,
//             evaluaciones, 2 pendientes y plan largo — un día malo.
//   típica  · la mitad en VM, un evento, un pendiente, plan corto.
//   liviana · unidad tranquila.
//
// Uso: CHROMIUM_PATH=… node build/medir_entrega.js [ruta/index.html]
// (también se usa desde build/checks/entrega_impresion.js: el escenario vive
//  acá para que guardia y medición no se contradigan)
const path = require('path');
const MM = 3.779528;

const NOMBRES = ['Francisca Araya Veliz','Custodio Castillo Rojas','Marta Elena Pizarro','Juan Segundo Tapia',
  'Rosa Amelia Cortés','Luis Alberto Fuenzalida','Carmen Gloria Vega','Pedro Nolasco Muñoz',
  'Ana María Villalobos','Jorge Enrique Salinas','Berta Rojas Codoceo','Hugo Iván Peralta',
  'Silvia del Carmen Ossandón','Ramón Antonio Cisternas','Elena Beatriz Zepeda','Osvaldo Jesús Barraza',
  'Norma Angélica Cepeda'];
const DX = ['Otros pre y post quirúrgicos con complicación respiratoria','Neumonía adquirida en la comunidad grave',
  'Shock séptico de foco abdominal','Traumatismo encéfalo craneano grave','Otras neurológicas',
  'Insuficiencia respiratoria aguda por SDRA','EPOC descompensado','Hemorragia subaracnoidea aneurismática'];

/**
 * Línea de tiempo sintética de una ficha, con la forma exacta de
 * _entLineaTiempo (svc_entrega.gs): eje en días de estadía, tramos de vía
 * aérea, eventos, evaluaciones y escalera motora. Cuatro historias que rotan
 * por cama: llegó intubado · se intubó el día 1 · TOT → TQT · extubado y
 * reintubado. Las camas sin VM y sin complejidad van sin barra.
 */
function construirLinea(i, carga, enVM, complejo, dias) {
  if (carga === 'liviana' && i % 3) return null;
  const va = [], ev = [], mrc = [], fss = [], motor = [];
  const k = i % 4;
  if (enVM) {
    if (k === 0) va.push({ d: 0, h: dias, t: 'TOT' });
    else if (k === 1) { ev.push({ d: 1, t: 'intub' }); va.push({ d: 1, h: dias, t: 'TOT' }); }
    else if (k === 2) {
      const t = Math.max(1, Math.floor(dias * 0.5));
      ev.push({ d: 0, t: 'intub' }, { d: t, t: 'tqt' });
      va.push({ d: 0, h: t, t: 'TOT' }, { d: t, h: dias, t: 'TQT' });
    } else {
      const e = Math.max(1, Math.floor(dias * 0.4));
      ev.push({ d: 0, t: 'intub' }, { d: e, t: 'ext' }, { d: Math.min(dias, e + 1), t: 'reint' });
      va.push({ d: 0, h: e, t: 'TOT' }, { d: Math.min(dias, e + 1), h: dias, t: 'TOT' });
    }
  } else if (complejo) {
    const e = Math.max(1, Math.floor(dias * 0.6));
    ev.push({ d: 0, t: 'intub' }, { d: e, t: 'ext' });
    va.push({ d: 0, h: e, t: 'TOT' });
    if (i % 5 === 0) { ev.push({ d: Math.min(dias, e + 2), t: 'decan' }); }
  }
  const pasos = Math.min(dias, 6);
  for (let j = 0; j <= pasos; j++) {
    const d = Math.round(j * dias / Math.max(pasos, 1));
    motor.push({ d: d, r: Math.min(4, 1 + Math.floor(j * (enVM ? 2 : 4) / Math.max(pasos, 1))) });
  }
  if (complejo || !enVM) {
    mrc.push({ d: Math.max(0, dias - 2), v: 44 }); fss.push({ d: Math.max(0, dias - 2), v: 12 });
    if (dias > 8) mrc.push({ d: Math.floor(dias / 2), v: 36 });
  }
  return { hoy: dias, va: va, ev: ev, mrc: mrc, fss: fss, motor: motor };
}

/** Fichas sintéticas de una entrega de 17 camas. carga: 'alta'|'tipica'|'liviana' */
function construirFichas(carga) {
  return NOMBRES.map((nom, i) => {
    const enVM = carga === 'alta' ? i % 3 !== 2 : i % 2 === 0;
    const complejo = carga === 'alta' ? i % 4 !== 3 : (carga === 'tipica' ? i % 2 === 0 : i % 4 === 0);
    return {
      idCama: String(i + 1), ocupada: true, tieneEvo: i !== 12, nombre: nom,
      edad: 45 + ((i * 7) % 40), sexo: i % 2 ? 'M' : 'F', diagnostico: DX[i % DX.length],
      diasEstadia: 1 + ((i * 5) % 30), diasVM: enVM ? 1 + ((i * 3) % 20) : '',
      fechaIngreso: '2026-07-' + String(10 + (i % 18)).padStart(2, '0'),
      viaAerea: enVM ? (i % 5 === 0 ? 'TQT' : 'TOT') : 'Natural',
      soporte: enVM ? 'VM' : (i % 2 ? 'CNAF' : 'Ambiente'), modo: enVM ? (i % 2 ? 'ACVC' : 'PSV') : '',
      params: enVM ? 'Vt 420 · FR 18 · PEEP 12 · FiO₂ 60% · PaFi 112' : '',
      mec: enVM && complejo ? 'Ppl 24 · DP 12 · Cst 34 · Raw 9' : '',
      gcs: complejo ? 8 + (i % 7) : '', gcsOVM: complejo ? 'O2 V1 M5' : '',
      sas: complejo ? -3 : '', sedTipo: complejo ? 'Propofol + Fentanilo' : '',
      bnm: i % 6 === 0, dva: complejo ? 'NAD 0.12 µg/kg/min' : '',
      hemoEstado: i % 7 === 0 ? 'Inestable' : 'Estable',
      secr: complejo ? 'Abundantes espesas mucopurulentas' : '',
      ultimoCultivo: complejo ? { nombre: 'Cultivo de secreciones', fecha: '02-08', resultado: 'Klebsiella pneumoniae BLEE' } : null,
      dispositivos: enVM ? [{ n: 'HME', estado: 'cambiar', cambio: '09-08' }, { n: 'Circuito', estado: '', cambio: '12-08' }] : [],
      eventos: complejo ? (carga === 'alta'
        ? ['▲ PVE superada 07-08', '🔃 Prono 19:00 hrs 06-08', '🫁 Intubación 05-08 14:20']
        : ['▲ PVE superada 07-08']) : [],
      fases: complejo ? ['Fase aguda'] : [],
      catResp: complejo ? { nivel: 'Alta', pje: 9 } : null,
      catMotor: complejo ? { nivel: 'Media', pje: 5 } : null,
      weaning: i % 5 === 0 ? { clase: 'dificil', frustras: 2, dias: 4, primerPve: '05-08' } : null,
      candidatoPve: carga === 'alta' && i % 8 === 0, pveRacha: 3,
      icuaw: carga === 'alta' && i % 9 === 0 ? { mrc: 42, fecha: '04-08' } : null,
      prono: carga === 'alta' && i % 10 === 0 ? { desde: '2026-08-08 19:00', horas: 14 } : null,
      hitoMotor: complejo ? { nivel: '2', ims: 3, fecha: '06-08' } : null,
      // Línea de tiempo (sep-2026): la misma forma que manda _entLineaTiempo.
      // Entra en la medición porque cuesta alto de hoja en CADA ficha.
      linea: construirLinea(i, carga, enVM, complejo, 1 + ((i * 5) % 30)),
      ktmRealizada: true, ktmNivel: 1 + (i % 4), ktr: 2 + (i % 3),
      evals: complejo ? ['MRC 44', 'FSS 12', 'IMS 3'] : [],
      alertas: i % 6 === 0 ? ['Sin KTM hace 2 turnos'] : [],
      pendientes: i % 3 === 0 ? (carga === 'alta' ? ['Control GSA', 'TAC de tórax'] : ['Control GSA']) : [],
      plan: complejo
        ? (carga === 'alta'
          ? 'Continuar prono 16 h, control de gases a las 06:00, evaluar destete si PaFi supera 200, '
            + 'mantener sedación en meta y reevaluar tolerancia al final del turno.'
          : 'Control de gases a las 06:00 y evaluar destete.')
        : 'Deambulación asistida.',
      firma: 'DMV',
    };
  });
}

/** Monta la entrega en una página ya cargada con el index. Devuelve N fichas. */
async function montarEntrega(p, fichas) {
  return await p.evaluate(fs => {
    setTab('E');   // sin la pestaña activa el contenedor va oculto y todo mide 0
    ENT_DATA = {
      fecha: '2026-08-09', turno: 'Dia', kineEntrega: 'DMV', generado: 1,
      fichas: fs, resumen: { entregadas: fs.length, ocupadas: fs.length, totalCamas: 18, enVM: 11 },
    };
    renderEntrega(ENT_DATA);
    if (typeof _entEspejarPlanes === 'function') _entEspejarPlanes();
    return document.querySelectorAll('.ent-ficha').length;
  }, fichas);
}

/** Mide el documento imprimible a un ancho dado. La página debe estar en media print. */
async function medirHojas(p, anchoMm, altoMm) {
  await p.setViewportSize({ width: Math.round(anchoMm * MM), height: 900 });
  await p.waitForTimeout(250);
  const r = await p.evaluate(() => {
    const doc = document.querySelector('#tcE');
    const f = [...document.querySelectorAll('.ent-ficha')].map(e => e.getBoundingClientRect().height);
    return {
      alto: doc.getBoundingClientRect().height,
      fichaMin: Math.min(...f), fichaMax: Math.max(...f),
      fichaProm: f.reduce((a, b) => a + b, 0) / f.length,
      fuera: doc.getBoundingClientRect().height - f.reduce((a, b) => a + b, 0),
      cabecera: document.querySelector('.ent-fh').getBoundingClientRect().height,
      dxAncho: document.querySelector('.ent-fh-dx').getBoundingClientRect().width,
    };
  });
  return Object.assign(r, { hojas: r.alto / (altoMm * MM) });
}

module.exports = { NOMBRES, DX, construirFichas, montarEntrega, medirHojas, MM };

// ── Corrida directa: la tabla comparativa ──────────────────────────────────
if (require.main === module) {
  const { chromium } = require('playwright-core');
  const archivo = path.resolve(process.argv[2] || path.join(__dirname, '..', 'v2', 'index.html'));
  (async () => {
    const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
    const p = await b.newPage({ viewport: { width: 1080, height: 900 } });
    await p.addInitScript(() => {
      window.google = { script: { run: { withSuccessHandler(k) { return { withFailureHandler() { return {
        api(a) { setTimeout(() => k({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 18, BANNERS: {} } : null) }), 5); }
      }; } }; } } } };
    });
    await p.goto('file://' + archivo);
    await p.waitForTimeout(1200);
    await p.emulateMedia({ media: 'print' });

    for (const carga of ['alta', 'tipica', 'liviana']) {
      const n = await montarEntrega(p, construirFichas(carga));
      console.log(`\n════ CARGA ${carga.toUpperCase()} · ${n} pacientes ════`);
      for (const [et, w, h] of [['apaisado (como estaba)', 281, 194], ['VERTICAL (vigente)', 194, 281]]) {
        const r = await medirHojas(p, w, h);
        console.log(`  ${et}  (útil ${w}×${h} mm)`);
        console.log(`    alto ${Math.round(r.alto)} px = ${(r.alto / MM).toFixed(0)} mm · fuera de las fichas ${Math.round(r.fuera)} px`);
        console.log(`    ficha: min ${Math.round(r.fichaMin)} · prom ${Math.round(r.fichaProm)} · max ${Math.round(r.fichaMax)} px`);
        console.log(`    diagnóstico visible: ${Math.round(r.dxAncho / MM)} mm · cabecera ${r.cabecera.toFixed(0)} px`);
        console.log(`    → ${r.hojas.toFixed(2)} hojas  ⇒ ${Math.ceil(r.hojas)} hoja(s) de papel`);
      }
    }
    await b.close();
  })();
}
