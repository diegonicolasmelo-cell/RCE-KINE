// via_aerea_previo.js — Guardia de la regla clínica v4.3: un procedimiento que
// cambia la vía aérea NUNCA pisa la terapia ventilatoria de arriba. El bloque
// superior queda como ESTADO PREVIO (cómo estaba el paciente para ser intubado)
// y el evento despliega su propio panel con el estado en que QUEDA. El soporte
// previo se deduce solo. La cama y los contadores siguen el estado FINAL.
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

/* ── Parte 1 · servidor: la cama y los días siguen el estado FINAL ── */
const DB = {};
global.repoLeerTodos = (h, c, val) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(val)); return f; };
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoActualizar = (h, c, id, ch) => { const r = global.repoBuscarPorId(h, c, id); if (r) Object.assign(r, ch); return !!r; };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoEliminarDonde = (h, fn) => { DB[h] = (DB[h] || []).filter(r => !fn(r)); };
global.repoActualizarDonde = () => {};
global.repoUpsert = (h, c, id, o) => { const r = global.repoBuscarPorId(h, c, id); if (r) { DB[h][DB[h].indexOf(r)] = Object.assign({}, o); return 'actualizar'; } global.repoInsertar(h, o); return 'crear'; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.conLock = fn => fn();
global.uid = p => p + '_x';
global.hoyISO = () => '2026-07-10';
global.ahoraTS = () => '2026-07-10 12:00';
global.diasEntre = (a, b) => (!a || !b) ? 0 : Math.max(0, Math.round((new Date(b) - new Date(a)) / 864e5));
global._restarDias = f => f;
global.validarPayloadEvolucion = () => [];
global.generarCodPaciente = () => 'PAC';
global._codUnico = c => c;
global._rutNormal = r => String(r || '');
global._agregarHitoInterno = () => {};
global._guardarProcedimientosInterno = () => {};
global._crearHitosDesdeProcedimientos = () => {};
global._registrarReintubacion = () => {};
global.calcularPI = () => 60;
global.calcularRespiratorio = () => ({});
global.SpreadsheetApp = { flush: () => {} };
global.Utilities = { getUuid: () => 'u1' };
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE' };
eval(['dominio_texto.gs', 'svc_camas.gs', 'svc_evoluciones.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

DB.CAMAS_ESTADO = [{ ID_CAMA: '1', OCUPADA: 'TRUE', PATIENT_ID: 'p1', NOMBRE: 'Test',
  FECHA_INGRESO: '2026-07-10', VIA_AEREA: 'Natural', SOPORTE: 'Oxigenoterapia/OAF', MODO: 'NRC' }];
DB.EVOLUCIONES = []; DB.TIMELINE = []; DB.PROCEDIMIENTOS = [];

// Turno que INTUBA: arriba queda el previo (Natural + O2), el final es TOT + VM
let r = guardarEvolucion({
  ID_CAMA: '1', TURNO_KEY: '2026-07-10-Dia', PLAN_FIRMA_KINE: 'DMV',
  VENT_VIA_AEREA: 'Natural', VENT_SOPORTE: 'Oxigenoterapia/OAF', VENT_MODO: 'NRC',
  VENT_LITROS: 5, VENT_FIO2: 40, VENT_FR: 35, VENT_SPO2: 88,
  INTUB_OCURRIO: true, INTUB_HORA: '13:40', INTUB_DET: 'insuficiencia respiratoria',
  INTUB_SOP_PREVIO: 'Naricera-NRC', INTUB_VA_PREVIA: 'Natural', INTUB_MODO_PREVIO: 'NRC',
  INTUB_VA_POST: 'TOT', INTUB_SOP_POST: 'VM', INTUB_MODO_POST: 'ACVC',
  INTUB_TOT_N: '8.0', INTUB_TOT_CM: '22', INTUB_VT: 420, INTUB_FR: 18, INTUB_PEEP: 8, INTUB_FIO2: 60, INTUB_SPO2: 95,
  VENT_VIA_AEREA_FINAL: 'TOT', VENT_SOPORTE_FINAL: 'VM', VENT_MODO_FINAL: 'ACVC',
}, { firma: 'DMV', email: 'x@y' });
eq('guarda el turno de la intubación', r.ok, true);
if(!r.ok){ console.log('ERROR:', r.error); process.exit(1); }
const evo = DB.EVOLUCIONES[0];
eq('el ESTADO PREVIO se conserva intacto en la evolución',
   evo.VENT_VIA_AEREA === 'Natural' && evo.VENT_SOPORTE === 'Oxigenoterapia/OAF' && evo.VENT_MODO === 'NRC', true);
eq('los parámetros previos (FR 35, SpO₂ 88, FiO₂ 40) no se pierden',
   String(evo.VENT_FR) === '35' && String(evo.VENT_SPO2) === '88' && String(evo.VENT_FIO2) === '40', true);
eq('el estado POSTERIOR queda aparte', evo.INTUB_MODO_POST === 'ACVC' && String(evo.INTUB_VT) === '420', true);
const cama = DB.CAMAS_ESTADO[0];
eq('C1 · la cama refleja el estado FINAL (TOT + VM + ACVC)',
   cama.VIA_AEREA === 'TOT' && cama.SOPORTE === 'VM' && cama.MODO === 'ACVC', true);
eq('C1 · la cama toma el N° de tubo del panel posterior', cama.TOT_NUMERO === '8.0' && cama.TOT_CM_LABIO === '22', true);
eq('la fecha de inicio de VM y de vía aérea arrancan hoy',
   cama.FECHA_INICIO_SOPORTE === '2026-07-10' && cama.FECHA_INICIO_VA === '2026-07-10', true);
eq('el día cuenta como día de VM aunque el turno empezara sin ventilador',
   String(evo.DIAS_VM), '0');   // día 0 = primer día de VM (no queda vacío)
eq('el texto del servidor narra previo → intubación → cómo queda',
   /Previo en naricera-NRC/.test(evo.TEXTO_GENERADO) &&
   /requiere intubación orotraqueal a las 13:40 hrs/.test(evo.TEXTO_GENERADO) &&
   /Queda con TOT N° 8\.0 fijado a 22 cm, conectado a VM en modo ACVC/.test(evo.TEXTO_GENERADO), true);

/* ── Parte 2 · UI ── */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window._ll = [];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) { window._ll.push({ a, d }); setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(v2, 'index.html'));
  await p.waitForTimeout(500);

  const I = await p.evaluate(async () => {
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    _vmHistFlag = false; _diasVMPrevios = 0; _diasVMEpisodio = 0; _nReintub = 0; _transIntubEsteTurno = false;
    // Paciente en oxigenoterapia (estado PREVIO)
    $('fVA').value = 'Natural'; cascadeVA();
    $('fSop').value = 'Oxigenoterapia/OAF'; cascadeSop();
    $('fModo').value = 'NRC'; renderParams();
    $('r_litros').value = '5'; $('r_fr').value = '35'; $('r_spo2').value = '88';
    updateVAUI();
    const r = { seccionVisible: !$('dIntubSec').classList.contains('hidden') };
    $('cIntubO').click();
    // ── lo de arriba NO se toca ──
    r.previoIntacto = { va: v('fVA'), sop: v('fSop'), modo: v('fModo'), fr: v('r_fr'), spo2: v('r_spo2') };
    r.resumenPrevio = $('lblIntubPrevio').textContent;
    r.sopPrevioAuto = v('fIntubSopPrevio');
    // ── el panel posterior existe y trae los modos de la vía aérea elegida ──
    r.panelPost = !!$('poIntubVA') && !!$('poIntubSop') && !!$('poIntubModo');
    r.modosVM = [...$('poIntubModo').options].map(o => o.value).join('|');
    $('fIntubHora').value = '13:40'; $('fIntubDet').value = 'insuficiencia respiratoria';
    $('poIntubTotN').value = '8.0'; $('poIntubTotCm').value = '22';
    $('poIntubModo').value = 'ACVC'; renderParams({P:'pi_',L:'pl_',box:'paramsBoxIntub'});
    // v4.3b: el panel posterior es el MÓDULO COMPLETO (todas las variables)
    r.moduloCompleto = ['pi_vt','pi_fr','pi_peep','pi_pmax','pi_ppl','pi_pmedia','pi_autopeep',
                        'pi_flujo','pi_ti','pi_fio2','pi_spo2','pi_pafi'].every(id => !!$(id));
    r.derivados = ['pl_vm','pl_ie','pl_dp','pl_cesr','pl_mlkg'].every(id => !!$(id));
    $('pi_vt').value = '420'; $('pi_fr').value = '18'; $('pi_peep').value = '8';
    $('pi_ppl').value = '24'; $('pi_autopeep').value = '2';
    $('pi_fio2').value = '60'; $('pi_spo2').value = '95';
    $('pi_vt').dispatchEvent(new Event('input'));
    calcResp({ id: 'pi_vt' });
    r.calcPost = { vm: $('pl_vm').textContent, dp: $('pl_dp').textContent };
    r.calcPrincipalIntacto = ($('l_vm')?.textContent || '--');
    // los dispositivos del circuito reaparecen al quedar en VM
    renderParams();
    r.dispositivos = !$('fcDisp').classList.contains('hidden');
    r.texto = genTexto();
    r.autoProc = _autoProcs().indexOf('INTUBACIÓN') !== -1;
    // desmarcar deja todo limpio y el previo intacto
    $('cIntubO').click();
    r.trasDesmarcar = { va: v('fVA'), sop: v('fSop'), hora: v('fIntubHora'), tot: v('poIntubTotN') };
    return r;
  });
  eq('la sección de intubación aparece con vía aérea no invasiva', I.seccionVisible, true);
  eq('AL INTUBAR, la terapia ventilatoria de arriba NO cambia',
     I.previoIntacto.va === 'Natural' && I.previoIntacto.sop === 'Oxigenoterapia/OAF' && I.previoIntacto.modo === 'NRC', true);
  eq('…y sus parámetros previos siguen ahí (FR 35, SpO₂ 88)',
     I.previoIntacto.fr === '35' && I.previoIntacto.spo2 === '88', true);
  eq('el evento muestra el estado previo resumido',
     /Natural/.test(I.resumenPrevio) && /NRC/.test(I.resumenPrevio) && /FR 35/.test(I.resumenPrevio), true);
  eq('el soporte previo se deduce solo (ya no se escribe a mano)', I.sopPrevioAuto, 'Naricera-NRC');
  eq('hay panel «queda con» propio', I.panelPost, true);
  eq('sus modos salen de la matriz de vía aérea (TOT + VM)', I.modosVM, 'ACVC|ACPC|CPAP/PS');
  eq('el texto narra previo → intubación → cómo queda',
     /Previo en naricera-NRC/.test(I.texto) && /a las 13:40 hrs/.test(I.texto) &&
     /Queda con TOT N° 8\.0 fijado a 22 cm, conectado a VM en modo ACVC/.test(I.texto) &&
     /Vt 420 ml/.test(I.texto) && /FR 18 rpm/.test(I.texto) && /VM 7\.6 L\/m/.test(I.texto) &&
     /Ppl 24 cmH2O/.test(I.texto) && /DP 14 cmH2O/.test(I.texto) && /AutoPEEP 2 cmH2O/.test(I.texto) &&
     /FiO2 60%/.test(I.texto) && /SpO2 95%/.test(I.texto), true);
  eq('el texto conserva el estado previo del paciente',
     /Ventila espontáneo con FiO2 adicional por NRC/.test(I.texto), true);
  eq('el panel posterior es el MÓDULO VENTILATORIO COMPLETO (Ppl, AutoPEEP, flujo, Ti, PaFi…)', I.moduloCompleto, true);
  eq('…con sus derivados (vol. minuto, I:E, DP, Cest, ml/kg)', I.derivados, true);
  eq('los derivados del panel se calculan solos (VM 7,6 L/m · DP 14 = Ppl − PEEP total)',
     /7\.6 L\/m/.test(I.calcPost.vm) && /DP: 14/.test(I.calcPost.dp), true);
  eq('…sin contaminar los derivados del bloque de arriba', I.calcPrincipalIntacto, '--');
  eq('los dispositivos del circuito reaparecen al quedar en VM', I.dispositivos, true);
  eq('genera el procedimiento INTUBACIÓN (→ hito)', I.autoProc, true);
  eq('desmarcar limpia el evento sin tocar el estado previo',
     I.trasDesmarcar.va === 'Natural' && I.trasDesmarcar.sop === 'Oxigenoterapia/OAF' &&
     I.trasDesmarcar.hora === '' && I.trasDesmarcar.tot === '', true);

  // Payload: previo en VENT_*, posterior en INTUB_*/FINAL
  const P = await p.evaluate(async () => {
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    _vmHistFlag = false; _diasVMPrevios = 0; _diasVMEpisodio = 0; _nReintub = 0; _transIntubEsteTurno = false;
    const opt = document.createElement('option'); opt.value = 'DMV'; opt.textContent = 'DMV';
    $('fFirma').appendChild(opt); $('fFirma').value = 'DMV';
    $('fVA').value = 'Natural'; cascadeVA();
    $('fSop').value = 'Oxigenoterapia/OAF'; cascadeSop();
    $('fModo').value = 'CNAF'; renderParams();
    $('r_flujo').value = '50'; $('r_fio2').value = '80'; $('r_spo2').value = '89';
    updateVAUI();
    $('cIntubO').click();
    $('fIntubHora').value = '02:10'; $('poIntubModo').value = 'ACVC'; $('poIntubTotN').value = '7.5';
    renderParams({P:'pi_',L:'pl_',box:'paramsBoxIntub'});
    $('pi_vt').value = '400'; $('pi_ppl').value = '26'; $('pi_peep').value = '10';
    _transAvisoOk = true; window._ll.length = 0;
    guardar();
    await new Promise(r2 => setTimeout(r2, 250));
    const c = _ll.find(x => x.a === 'GUARDAR_EVOLUCION');
    return c ? c.d : null;
  });
  eq('payload · el turno guarda el PREVIO en VENT_*',
     P && P.VENT_VIA_AEREA === 'Natural' && P.VENT_SOPORTE === 'Oxigenoterapia/OAF' && P.VENT_MODO === 'CNAF', true);
  eq('payload · el estado FINAL es el posterior a la intubación',
     P && P.VENT_VIA_AEREA_FINAL === 'TOT' && P.VENT_SOPORTE_FINAL === 'VM' && P.VENT_MODO_FINAL === 'ACVC', true);
  eq('payload · el soporte previo viaja deducido (CNAF)', P && P.INTUB_SOP_PREVIO, 'CNAF');
  eq('payload · los datos del tubo van en el bloque del evento', P && P.INTUB_TOT_N, '7.5');
  eq('payload · viajan TODAS las variables del posterior (VT, Ppl, PEEP)',
     P && String(P.INTUB_VT) === '400' && String(P.INTUB_PPL) === '26' && String(P.INTUB_PEEP) === '10', true);

  // ── Eventos del turno no derivables + RCP con ciclos ──
  const EV = await p.evaluate(() => {
    $('kf').reset(); $('cBed').value = '3';
    const r = {};
    r.checkboxes = ['cProcImagen','cProcPabellon','cProcAsistMed','cProcRCP'].every(id => !!$(id));
    r.listaVieja = [...document.querySelectorAll('#dlProc option')].map(o => o.textContent).join('|');
    r.rcpOculto = $('dRCPdet').classList.contains('hidden');
    $('cProcRCP').click();
    r.rcpAbierto = !$('dRCPdet').classList.contains('hidden');
    $('fRCPciclos').value = '3'; $('fRCPhora').value = '04:15';
    $('cProcPabellon').click(); $('cProcImagen').click();
    r.procs = _autoProcs().join('|');
    r.eduDerivada = (() => { $('cEduReal').click(); const a = _autoProcs(); $('cEduReal').click(); return a.join('|'); })();
    $('cProcRCP').click();
    r.rcpLimpio = $('dRCPdet').classList.contains('hidden') && $('fRCPciclos').value === '';
    return r;
  });
  eq('los no derivables son casillas de un toque', EV.checkboxes, true);
  eq('la lista manual ya no ofrece EMS ni educación (son derivables)',
     !/EMS/.test(EV.listaVieja) && !/Educaci/.test(EV.listaVieja), true);
  eq('RCP despliega los ciclos', EV.rcpOculto && EV.rcpAbierto, true);
  eq('los eventos entran como procedimientos del turno (RCP con sus ciclos)',
     /RCP 3 CICLOS/.test(EV.procs) && /PABELLÓN/.test(EV.procs) && /IMAGENOLOGÍA/.test(EV.procs), true);
  eq('la educación al familiar se deriva sola de su casilla',
     /EDUCACIÓN A USUARIO\/FAMILIA/.test(EV.eduDerivada), true);
  eq('desmarcar RCP limpia los ciclos', EV.rcpLimpio, true);

  // FilmArray disponible como técnica de cultivo
  const FA = await p.evaluate(() => !!document.querySelector('input[name="mtest"][value="FilmArray"]'));
  eq('FilmArray está entre las técnicas de cultivo', FA, true);

  console.log(errs.length ? ('\nERRORES JS:\n' + errs.join('\n')) : '\nsin errores JS');
  await b.close();
  console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
  process.exit(fails.length || errs.length ? 1 : 0);
})();
