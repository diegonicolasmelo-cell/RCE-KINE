// entrega_datos.js — Guardia de la ENTREGA CON LOS DATOS QUE FALTABAN
// (ago-2026, reporte de Diego: «hay datos importantes que no aparecen en la
// entrega, como el GCS o la mecánica ventilatoria»). Opción A del mockup:
// todo se integra a los casilleros existentes, sin mover la grilla.
//
// Reglas duras que asserta esta guardia (decisiones de Diego):
//   · GCS con desglose y PIC/PPC entran al casillero Neuro·HDN.
//   · La mecánica (Pmax · Ppl · DP · Cest · PaFi) es la segunda línea de
//     Parámetros — solo aparece si se midió.
//   · N° de TOT y fijación acompañan a la vía aérea; el calibre a la TQT.
//   · La fase clínica es un chip de la barra de identidad.
//   · HITO MOTOR MÁS ALTO del episodio: manda el IMS si existe; sin IMS se
//     traduce el nivel KTM (1-2 en cama · 3 SBC · 4 bípedo · 5 marcha). La
//     fecha es la ÚLTIMA vez que se alcanzó. Ejemplo textual de Diego:
//     «01-08 en cama analítico, 02 SBC, 03 en cama → hito SBC 02-08».
//   · SUSPENSIÓN DE SEDACIÓN/BNM: fecha de la última transición a «sin»;
//     si lo re-sedan, desaparece sola.
// Uso: node build/checks/entrega_datos.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

/* ══ PARTE 1 · SERVICIO ══════════════════════════════════════════════════ */
console.log('1 · Servicio: hito motor, suspensión de sedación y campos nuevos');

const DB = {
  CAMAS_ESTADO: [
    { ID_CAMA: '4', OCUPADA: 'TRUE', PATIENT_ID: 'p4', NOMBRE: 'Ejemplo Diego',
      EDAD: 62, SEXO: 'F', DIAGNOSTICO: 'HSA aneurismática', FECHA_INGRESO: '2026-08-01',
      VIA_AEREA: 'TOT', TOT_NUMERO: '8.0', TOT_CM_LABIO: '22',
      SOPORTE: 'VM', FECHA_INICIO_SOPORTE: '2026-08-01' },
  ],
  EVOLUCIONES: [
    // El ejemplo TEXTUAL de Diego: 01-08 en cama (analítico, KTM 2) →
    // 02-08 SBC (KTM 3) → 03-08 en cama (KTM 2). Sedado del 01 al 02,
    // sin sedación desde el 03 (con BNM solo el 01).
    { ID_CAMA: '4', PATIENT_ID: 'p4', TURNO_KEY: '2026-08-01-Dia', FECHA: '2026-08-01',
      KTM_REALIZADA: 'TRUE', KTM_NIVEL_KTR: '2',
      SED_TIPO: 'Escalón 3', SED_BNM: 'TRUE' },
    { ID_CAMA: '4', PATIENT_ID: 'p4', TURNO_KEY: '2026-08-02-Dia', FECHA: '2026-08-02',
      KTM_REALIZADA: 'TRUE', KTM_NIVEL_KTR: '3',
      SED_TIPO: 'Escalón 2', SED_BNM: '' },
    { ID_CAMA: '4', PATIENT_ID: 'p4', TURNO_KEY: '2026-08-03-Dia', FECHA: '2026-08-03',
      KTM_REALIZADA: 'TRUE', KTM_NIVEL_KTR: '2',
      SED_TIPO: 'Sin sedación', SED_BNM: '',
      FASE_JSON: '["Weaning"]',
      SED_GCS_TOT: '8T', SED_GCS_O: 2, SED_GCS_V: '1T', SED_GCS_M: 5,
      HEMO_PIC: 14, HEMO_PPC: 68,
      VENT_VIA_AEREA: 'TOT', VENT_TOT_NUM: '8.0', VENT_TOT_CM: '22',
      VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
      VENT_FIO2: 45, VENT_PEEP: 8, VENT_VT: 420, VENT_FR: 18, VENT_SPO2: 96,
      VENT_PMAX: 24, VENT_PPL: 19, CALC_DP: '11', CALC_CESR: '38', VENT_PAFI: 213,
      DIAS_VM: 2, DIA_ESTADIA: 2, PLAN_FIRMA_KINE: 'Klga. Ejemplo' },
  ],
  PROCEDIMIENTOS: [],
};
global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoLeerFiltrado = (h, col, pred) => (DB[h] || []).filter(r => pred(r[col]));
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.hoyISO = () => '2026-08-03';
global.ahoraTS = () => '2026-08-03 16:00:00';
global._tz = () => 'America/Santiago';
global.Utilities = { formatDate: () => '2026-08-03' };
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global._statISO = f => String(f || '').slice(0, 10);
eval(['infra_fechas.gs', 'svc_eventos.gs', 'svc_stats.gs', 'svc_entrega.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

let r = obtenerEntregaTurno(['4'], '2026-08-03', 'Dia');
let f = r.data.fichas[0];
eq('el ejemplo de Diego: hito motor máx = SBC', f.hitoMotor && f.hitoMotor.nivel, 'SBC');
eq('…con la fecha del día que lo alcanzó (02-08)', f.hitoMotor && f.hitoMotor.fecha, '02-08');
eq('…sin IMS anotado, el hito no inventa uno', f.hitoMotor && f.hitoMotor.ims, '');
eq('sedación suspendida el 03-08 (transición sedado → sin)', f.sedSusp, '03-08');
eq('BNM suspendido el 02-08', f.bnmSusp, '02-08');
eq('GCS del turno viaja con desglose', f.gcs + '|' + f.gcsOVM, '8T|O2·V1T·M5');
eq('PIC y PPC viajan', f.pic + '/' + f.ppc, '14/68');
eq('la mecánica viaja aparte de la programación', f.mec, 'Pmax 24 · Ppl 19 · DP 11 · Cest 38 · PaFi 213');
eq('…y la programación no la arrastra', /Pmax/.test(f.params), false);
eq('N° de TOT y fijación viajan', f.totN + '·' + f.totCm, '8.0·22');
eq('la fase clínica viaja como lista', JSON.stringify(f.fases), '["Weaning"]');
const f3 = JSON.parse(JSON.stringify(f));   // ficha COMPLETA (turno del 03-08), para el cliente

// La ÚLTIMA vez que se alcanzó el hito (decisión de Diego): SBC repetido
// el 05-08 corre la fecha; y un IMS registrado manda sobre el nivel KTM.
DB.EVOLUCIONES.push({ ID_CAMA: '4', PATIENT_ID: 'p4', TURNO_KEY: '2026-08-05-Dia', FECHA: '2026-08-05',
  KTM_REALIZADA: 'TRUE', KTM_NIVEL_KTR: '3', SED_TIPO: 'Sin sedación' });
r = obtenerEntregaTurno(['4'], '2026-08-05', 'Dia'); f = r.data.fichas[0];
eq('SBC repetido el 05-08: la fecha es la ÚLTIMA vez', f.hitoMotor && f.hitoMotor.fecha, '05-08');
eq('…y la suspensión de sedación NO se corre (sigue siendo 03-08)', f.sedSusp, '03-08');

DB.EVOLUCIONES.push({ ID_CAMA: '4', PATIENT_ID: 'p4', TURNO_KEY: '2026-08-06-Dia', FECHA: '2026-08-06',
  KTM_REALIZADA: 'TRUE', KTM_NIVEL_KTR: '3', EVAL_IMS: '4', SED_TIPO: 'Escalón 1' });
r = obtenerEntregaTurno(['4'], '2026-08-06', 'Dia'); f = r.data.fichas[0];
eq('con IMS 4 anotado, el IMS manda: hito = bípedo', f.hitoMotor && f.hitoMotor.nivel, 'bípedo');
eq('…mostrando el IMS de ese día', f.hitoMotor && f.hitoMotor.ims, '4');
eq('re-sedado el 06: la suspensión desaparece sola', f.sedSusp, '');

/* ══ PARTE 2 · CLIENTE: la ficha pinta lo nuevo (opción A) ═══════════════ */
const { chromium } = require('playwright-core');
(async () => {
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

  const ficha = f3;   // la ficha completa del 03-08, tal cual viaja del servicio
  const R = await p.evaluate(fx => {
    renderEntrega({ fecha: '2026-08-03', turno: 'Dia', resumen: {}, fichas: [fx] });
    const html = $('entDoc').innerHTML;
    return {
      gcs: /GCS 8T/.test(html) && /O2·V1T·M5/.test(html),
      pic: /PIC 14 · PPC 68 mmHg/.test(html),
      mec: /Pmax 24 · Ppl 19 · DP 11 · Cest 38 · PaFi 213/.test(html),
      tot: /TOT N° 8\.0 · 22 cm/.test(html),
      fase: /⚕ Weaning/.test(html),
      hito: /Hito motor máx: <b>SBC<\/b> \(02-08\)/.test(html),
    };
  }, ficha);
  console.log('\n2 · Cliente: la ficha pinta lo nuevo');
  eq('GCS con desglose en Neuro·HDN', R.gcs, true);
  eq('PIC/PPC en Neuro·HDN', R.pic, true);
  eq('la mecánica como segunda línea de Parámetros', R.mec, true);
  eq('TOT con N° y fijación junto a la vía aérea', R.tot, true);
  eq('la fase clínica como chip de la barra', R.fase, true);
  eq('el hito motor abre el casillero de rehabilitación', R.hito, true);

  // La suspensión de sedación se pinta cuando corresponde
  const R2 = await p.evaluate(fx => {
    fx.sedSusp = '03-08'; fx.bnmSusp = '02-08'; fx.bnm = false;
    renderEntrega({ fecha: '2026-08-05', turno: 'Dia', resumen: {}, fichas: [fx] });
    return {
      sed: /💤 Sedación suspendida el 03-08/.test($('entDoc').innerHTML),
      bnm: /BNM suspendido el 02-08/.test($('entDoc').innerHTML),
    };
  }, ficha);
  eq('«Sedación suspendida el dd-mm» en la ficha', R2.sed, true);
  eq('«BNM suspendido el dd-mm» en la ficha', R2.bnm, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
