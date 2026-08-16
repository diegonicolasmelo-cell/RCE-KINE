// afinado.js — Guardia de la ronda v5.46-afinado (ago-2026, 12 puntos de
// Diego tras el uso real). Fija las decisiones que no cubre otra guardia:
//
//   · ENTREGA: cooperación fuera; litros SOLO con naricera/mascarilla simple;
//     flujo SOLO con CNAF; Venturi (MMV) SOLO con su FiO₂.
//   · PRONO/SUPINO: la franja 🔃 solo con paciente en VM.
//   · P-VM: parte VACÍO — nada se afirma (ni narra, ni bloquea) sin elegir.
//   · KTM DE NOCHE: ni frase, ni estado, ni estadística.
//   · SECRECIONES: el «−» evaluado se narra «sin secreciones»; el placeholder
//     ya no dice «Sin secreciones» (confundía no-registro con hallazgo).
//   · DÍAS VM CONGELADOS: la paciente extubada muestra su sellado en el form.
//   · CPAP (VNI): narra su presión única «CPAP X cmH₂O», no «IPAP ?/?».
//   · AUSCULTACIÓN: nunca «con Sin ruidos agregados» (ambos motores).
//   · AVISO DE DESFASE (opción B): mensaje de una línea, detalle plegado.
// Uso: node build/checks/afinado.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

/* ══ PARTE 1 · SERVIDOR ══════════════════════════════════════════════════ */
console.log('1 · Servidor: entrega por soporte y motor de texto');

const DB = { CAMAS_ESTADO: [], EVOLUCIONES: [], PROCEDIMIENTOS: [] };
global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoLeerFiltrado = (h, col, pred) => (DB[h] || []).filter(r => pred(r[col]));
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.hoyISO = () => '2026-08-09';
global.ahoraTS = () => '2026-08-09 10:00:00';
global._tz = () => 'America/Santiago';
global.Utilities = { formatDate: () => '2026-08-09' };
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global._statISO = f => String(f || '').slice(0, 10);
eval(['infra_fechas.gs', 'svc_eventos.gs', 'svc_stats.gs', 'svc_entrega.gs', 'dominio_texto.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

// — Entrega: litros/flujo por soporte —
const mkCama = (id, extra) => Object.assign({ ID_CAMA: id, OCUPADA: 'TRUE', PATIENT_ID: 'p' + id, NOMBRE: 'P' + id, FECHA_INGRESO: '2026-08-01' }, extra);
const mkEvo = (id, extra) => Object.assign({ ID_CAMA: id, PATIENT_ID: 'p' + id, TURNO_KEY: '2026-08-09-Dia', FECHA: '2026-08-09',
  VENT_FIO2: 40, VENT_SPO2: 95, VENT_FR: 20, VENT_LITROS: 3, VENT_FLUJO: 50, PLAN_FIRMA_KINE: 'K' }, extra);
DB.CAMAS_ESTADO = [mkCama('1', { SOPORTE: 'VM' }), mkCama('2', { SOPORTE: 'CNAF' }), mkCama('3', {}), mkCama('4', {})];
DB.EVOLUCIONES = [
  mkEvo('1', { VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC', VENT_VT: 420, VENT_PEEP: 8, SED_COOPERACION: 'Cooperador' }),
  mkEvo('2', { VENT_SOPORTE: 'CNAF', VENT_MODO: 'CNAF' }),
  mkEvo('3', { VENT_SOPORTE: 'Oxigenoterapia/OAF', VENT_MODO: 'NRC' }),
  mkEvo('4', { VENT_SOPORTE: 'Oxigenoterapia/OAF', VENT_MODO: 'MMV' }),
];
let r = obtenerEntregaTurno(['1', '2', '3', '4'], '2026-08-09', 'Dia');
const fx = {}; r.data.fichas.forEach(f => { fx[f.idCama] = f; });
eq('VM: sin litros ni flujo en la línea', /L 3|Flujo 50/.test(fx['1'].params), false);
eq('CNAF: el flujo SÍ va', /Flujo 50/.test(fx['2'].params), true);
eq('…y los litros no', /L 3/.test(fx['2'].params), false);
eq('Naricera: los litros SÍ van', /L 3/.test(fx['3'].params), true);
eq('…y el flujo no', /Flujo 50/.test(fx['3'].params), false);
eq('Venturi (MMV): solo FiO₂ — ni litros ni flujo', /L 3|Flujo 50/.test(fx['4'].params), false);
eq('…pero la FiO₂ sí está', /FiO₂ 40/.test(fx['4'].params), true);

// — Motor de texto del servidor —
const gen = d => generarTextoEvolucion(Object.assign({ TURNO: 'Dia', PLAN_FIRMA_KINE: 'K' }, d));
const tCpap = gen({ VENT_SOPORTE: 'VNI', VENT_MODO: 'CPAP', VENT_PEEP: 8, VENT_FIO2: 40 });
eq('CPAP narra su presión única', /En VNI modo CPAP, CPAP 8 cmH₂O/.test(tCpap), true);
eq('…sin el «IPAP ?/?» de antes', /IPAP \?/.test(tCpap), false);
const tAusc = gen({ EX_MP: 'Presente Bilateral', EX_RUIDOS: 'Sin ruidos agregados' });
eq('auscultación sin oxímoron', /con Sin ruidos agregados/i.test(tAusc), false);
eq('…narra «sin ruidos agregados»', /MP\(\+\) bilateral, sin ruidos agregados\./.test(tAusc), true);
const tSinSecr = gen({ RESP_SECR_QTY: '-' });
eq('el «−» evaluado narra «Sin secreciones.»', /Sin secreciones\./.test(tSinSecr), true);
const tNoSecr = gen({});
eq('el no-registro sigue en silencio', /[Ss]in secreciones/.test(tNoSecr), false);
const tNocheKtm = gen({ TURNO: 'Noche', KTM_NO_REALIZADA: '' });
eq('de noche sin estado KTM no hay frase de KTM', /KTM/.test(tNocheKtm), false);
const tPvmVacio = gen({ VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC', VENT_ADAPTADO: '' });
eq('P-VM vacío: no se narra interacción', /interacción/.test(tPvmVacio), false);

/* ══ PARTE 2 · CLIENTE ═══════════════════════════════════════════════════ */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 18, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(v2, 'index.html'));
  await p.waitForTimeout(500);

  const R = await p.evaluate(async () => {
    const r = {};
    $('kf').reset(); $('cBed').value = '3'; DB.length = 0; DB.push({ ID_CAMA: '3' });
    SHIFT = 'Dia';
    // ── Prono solo con VM ──
    $('fVA').value = 'Natural'; cascadeVA();
    $('fSop').value = 'Oxigenoterapia/OAF'; cascadeSop();
    r.pronoOcultoSinVM = $('dPronoStrip').classList.contains('hidden');
    $('fVA').value = 'TOT'; cascadeVA(); $('fSop').value = 'VM'; cascadeSop();
    r.pronoConVM = !$('dPronoStrip').classList.contains('hidden');
    // ── P-VM parte vacío ──
    $('fModo').value = 'ACVC'; renderParams();
    r.pvmVacio = $('sAdapt') && $('sAdapt').value === '';
    r.pvmNoBloquea = $('r_ppl') && !$('r_ppl').disabled;
    const txtSinPvm = genTexto();
    r.pvmNoNarra = !/interacción/.test(txtSinPvm);
    $('sAdapt').value = 'Asincrónico'; hAdapt(true);
    r.pvmElegidoBloquea = $('r_ppl').disabled;
    $('sAdapt').value = ''; hAdapt(true);
    // ── Secreciones ──
    r.placeholderLimpio = $('fSecrCar').options[0].textContent.indexOf('Sin secreciones') === -1;
    _secrQty = '-'; $('fSecrQty') && ($('fSecrQty').value = '-');
    const txtSinSecr = genTexto();
    r.sinSecrNarrado = /Sin secreciones\./.test(txtSinSecr);
    _secrQty = ''; $('fSecrQty') && ($('fSecrQty').value = '');
    // ── CPAP narra su presión ──
    $('fVA').value = 'Full Face'; cascadeVA();
    $('fSop').value = 'VNI'; cascadeSop();
    $('fModo').value = 'CPAP'; renderParams();
    if ($('r_peep')) $('r_peep').value = '8';
    if ($('r_fio2')) $('r_fio2').value = '40';
    const txtCpap = genTexto();
    r.cpapNarra = /CPAP 8 cmH2O/.test(txtCpap);
    // ── Auscultación sin oxímoron ──
    loadMP('Presente Bilateral');
    $('fRuidosVal').value = 'Sin ruidos agregados';
    const txtAusc = genTexto();
    r.auscSinOximoron = !/con Sin ruidos/i.test(txtAusc) && /sin ruidos agregados\./.test(txtAusc);
    $('fRuidosVal').value = '';
    // ── KTM de noche: estado neutro y sin frase ──
    $('kf').reset(); $('cBed').value = '3';
    $('fVA').value = 'TOT'; cascadeVA(); $('fSop').value = 'VM'; cascadeSop();
    SHIFT = 'Noche'; aplicarGatesEval();
    r.ktmNocheNeutra = !$('bKTMn').classList.contains('on') && !$('bKTMr').classList.contains('on');
    const txtNoche = genTexto();
    r.ktmNocheSinFrase = !/KTM/.test(txtNoche);
    SHIFT = 'Dia'; aplicarGatesEval();
    // ── Días de VM congelados en el form ──
    _diasVMSellado = ''; _diasVMPrevios = 0; _diasVMEpisodio = 0; _nReintub = 0;
    $('fVA').value = 'Natural'; cascadeVA();
    $('fSop').value = 'Oxigenoterapia/OAF'; cascadeSop();
    fillFormReplica({ DIAS_VM: 6, DIAS_VNI: '' });
    actualizarContadores();
    r.vmCongelado = $('fDiasVM').value;
    // ── Guardar no se detiene (15-ago-2026, reemplaza a la «opción B») ──
    // El cuadro de desfase con «Ver diferencias» SALIÓ por pedido de Diego:
    // guardar guarda al tiro lo de pantalla y el desfase se avisa con un
    // toast que no bloquea. El comportamiento completo lo vigila
    // texto_manual.js; aquí, que el cuadro no vuelva a colarse.
    const fuente = guardar.toString() + (typeof _bloquesDesfasados === 'function' ? '1' : '0');
    r.sinCuadroDesfase = !/Ver diferencias/.test(fuente) && /tu texto tal como está/.test(fuente);
    r.avisoUnaLinea = /parte quedó distinta|partes quedaron distintas/.test(fuente);
    r.desfaseSeCalcula = /_bloquesDesfasados\(\)/.test(fuente) && fuente.slice(-1) === '1';
    return r;
  });

  console.log('\n2 · Cliente');
  eq('la franja 🔃 se oculta sin VM', R.pronoOcultoSinVM, true);
  eq('…y aparece con VM', R.pronoConVM, true);
  eq('P-VM parte vacío', R.pvmVacio, true);
  eq('…sin bloquear la Ppl', R.pvmNoBloquea, true);
  eq('…y sin narrar interacción', R.pvmNoNarra, true);
  eq('elegir Asincrónico SÍ inhabilita (la regla clínica sigue)', R.pvmElegidoBloquea, true);
  eq('el placeholder de características ya no dice «Sin secreciones»', R.placeholderLimpio, true);
  eq('el «−» evaluado narra «Sin secreciones.»', R.sinSecrNarrado, true);
  eq('CPAP narra su presión única', R.cpapNarra, true);
  eq('auscultación sin oxímoron', R.auscSinOximoron, true);
  eq('de noche la KTM queda NEUTRA (no «no realizada»)', R.ktmNocheNeutra, true);
  eq('…y el texto nocturno no menciona KTM', R.ktmNocheSinFrase, true);
  eq('la extubada muestra sus días de VM congelados', R.vmCongelado, '6');
  eq('guardar ya NO abre el cuadro de desfase (avisa con toast)', R.sinCuadroDesfase, true);
  eq('…con mensaje de una línea', R.avisoUnaLinea, true);
  eq('…y el desfase se sigue calculando (para el conteo del aviso)', R.desfaseSeCalcula, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
