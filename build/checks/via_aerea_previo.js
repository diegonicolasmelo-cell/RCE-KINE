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
/* Helpers de fecha/hora REALES (v5.19): se cargan del archivo de infraestructura
   para que el arnés verifique la lógica de verdad, con reloj determinista. */
global.Utilities = Object.assign(global.Utilities || {}, { getUuid: () => 'u1' });
global._tz = () => 'America/Santiago';
{
  const _fx = require('fs').readFileSync(require('path').join(v2, 'infra_fechas.gs'), 'utf8');
  eval(_fx.slice(_fx.indexOf('/** Hora actual')));
  global._horaAhora = _horaAhora; global._horaValida = _horaValida;
  global._tsAhora = _tsAhora; global._tsDesdeHora = _tsDesdeHora;
  global._tsFecha = _tsFecha; global._tsHora = _tsHora;
  global.diasBloques24 = diasBloques24; global.refTurno = refTurno;
}
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

/* ── Parte 1b · «Si se registró, quedó» (v5.14): editar la evolución de
      INGRESO jamás borra la marca ES_INGRESO — el cliente reabre con el modo
      ingreso apagado y mandaba false, des-marcando el ingreso ante el REM,
      la estadística y el hito del historial. ── */
DB.CAMAS_ESTADO.push({ ID_CAMA: '7', OCUPADA: 'TRUE', PATIENT_ID: 'p7', NOMBRE: 'Llega Intubado',
  FECHA_INGRESO: '2026-07-10', VIA_AEREA: 'TOT', SOPORTE: 'VM', MODO: 'ACVC' });
let r7 = guardarEvolucion({ ID_CAMA: '7', TURNO_KEY: '2026-07-10-Dia', PLAN_FIRMA_KINE: 'DMV',
  ES_INGRESO: true, PAC_NOMBRE: 'Llega Intubado', PAC_DIAGNOSTICO: 'PCR recuperado',
  VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC', PROC_JSON: '["INGRESO"]',
}, { firma: 'DMV', email: 'x@y' });
eq('ingreso del paciente que llega intubado se guarda', r7.ok, true);
// Re-edición del MISMO turno (agrega la extubación; el cliente manda ES_INGRESO=false)
r7 = guardarEvolucion({ ID_CAMA: '7', TURNO_KEY: '2026-07-10-Dia', PLAN_FIRMA_KINE: 'DMV',
  ES_INGRESO: false, PAC_NOMBRE: 'Llega Intubado',
  VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
  PVE_VAL: 'superada', EXT_OCURRIO: true, EXT_HORA: '19:10', EXT_TIPO: 'Programada',
  PROC_JSON: '["INGRESO","EXTUBACIÓN"]',
}, { firma: 'DMV', email: 'x@y' });
eq('la re-edición del turno de ingreso guarda bien', r7.ok, true);
const evo7 = DB.EVOLUCIONES.find(e => e.ID_CAMA === '7');
eq('ES_INGRESO se CONSERVA aunque el cliente lo mande en falso', global.esVerdadero(evo7.ES_INGRESO), true);
eq('y la extubación agregada quedó registrada', global.esVerdadero(evo7.EXT_OCURRIO) && evo7.EXT_HORA === '19:10', true);
eq('el procedimiento INGRESO sigue en PROC_JSON', /INGRESO/.test(evo7.PROC_JSON), true);

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

  // ── v4.5: reintubación y TQT también con módulo completo ──
  const RT = await p.evaluate(async () => {
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    _nReintub = 0; _diasVMPrevios = 2; _diasVMEpisodio = 0; _vmHistFlag = true;
    const r = {};
    // paciente extubado (VA no invasiva) con historial de VM → reintubación standalone
    $('fVA').value = 'Natural'; cascadeVA();
    $('fSop').value = 'Oxigenoterapia/OAF'; cascadeSop();
    $('fModo').value = 'CNAF'; renderParams();
    $('r_flujo').value = '50'; $('r_fio2').value = '70'; $('r_spo2').value = '86';
    updateVAUI();
    r.panelViejo = !!$('fReintubTotT');   // los campos de texto libre ya no existen
    $('cReintubT').click();
    // la reintubación se confirma con su propio modal (no uiConfirm)
    await new Promise(r2 => setTimeout(r2, 60));
    if (typeof _mrResolver === 'function') _mrResolver(true);
    await new Promise(r2 => setTimeout(r2, 120));
    r.panelEnRama = $('dReintubQueda').closest('#dReintubDetT') !== null;
    r.visible = !$('dReintubQueda').classList.contains('hidden');
    r.modulo = ['pr_vt','pr_fr','pr_peep','pr_ppl','pr_autopeep','pr_fio2','pr_spo2'].every(id => !!$(id));
    r.previoIntacto = { sop: v('fSop'), modo: v('fModo'), flujo: v('r_flujo'), spo2: v('r_spo2') };
    $('poReintubTotN').value = '7.5'; $('poReintubTotCm').value = '21';
    $('poReintubModo').value = 'ACVC'; renderParams({P:'pr_',L:'prl_',box:'paramsBoxReintub'});
    $('pr_vt').value = '400'; $('pr_fr').value = '20'; $('pr_peep').value = '10'; $('pr_fio2').value = '80';
    calcResp({ id: 'pr_vt' });
    $('fReintubHoraT').value = '05:30'; $('fReintubRazT').value = 'Falla respiratoria post extubación';
    r.texto = genTexto();
    r.vmDerivado = $('prl_vm').textContent;
    return r;
  });
  eq('reintubación · los campos de texto libre desaparecieron', RT.panelViejo, false);
  eq('reintubación · el panel único se inserta en la rama activa', RT.panelEnRama && RT.visible, true);
  eq('reintubación · con módulo ventilatorio completo', RT.modulo, true);
  eq('reintubación · el estado previo (CNAF) no se toca',
     RT.previoIntacto.sop === 'Oxigenoterapia/OAF' && RT.previoIntacto.modo === 'CNAF' &&
     RT.previoIntacto.flujo === '50' && RT.previoIntacto.spo2 === '86', true);
  eq('reintubación · sus derivados se calculan (VM 8 L/m)', /8\.0 L\/m/.test(RT.vmDerivado), true);
  eq('reintubación · el texto narra el equipo y los parámetros',
     /reintubación a las 05:30 hrs por falla respiratoria post extubación con TOT N° 7\.5 a 21 cm, quedando en modo ACVC/.test(RT.texto) &&
     /Vt 400 ml/.test(RT.texto) && /PEEP 10 cmH2O/.test(RT.texto) && /FiO2 80%/.test(RT.texto), true);

  const TQ = await p.evaluate(() => {
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    $('fVA').value = 'TQT'; cascadeVA(); $('fSop').value = 'VM'; cascadeSop();
    $('fModo').value = 'CPAP/PS'; renderParams();
    $('r_ps').value = '10'; $('r_peep').value = '6';
    updateVAUI();
    const r = { paramsViejos: !!$('poTqtParams') };
    $('cTqtO').click();
    $('fTqtHora').value = '10:30'; $('fTqtTec').value = 'Percutánea';
    $('poTqtSop').value = 'VM'; renderParamsTqt(); $('poTqtModo').value = 'ACVC';
    renderParams({P:'pt_',L:'ptl_',box:'paramsBoxTqt'});
    r.modulo = ['pt_vt','pt_fr','pt_peep','pt_ppl','pt_fio2'].every(id => !!$(id));
    $('pt_vt').value = '420'; $('pt_fr').value = '16'; $('pt_peep').value = '6'; $('pt_fio2').value = '35';
    calcResp({ id: 'pt_vt' });
    r.previoIntacto = { modo: v('fModo'), ps: v('r_ps') };
    r.dispositivos = !$('fcDisp').classList.contains('hidden');
    return r;
  });
  eq('TQT · el campo de parámetros en texto libre desapareció', TQ.paramsViejos, false);
  eq('TQT · panel «queda con» con módulo completo', TQ.modulo, true);
  eq('TQT · el estado previo (CPAP/PS con PS 10) no se toca',
     TQ.previoIntacto.modo === 'CPAP/PS' && TQ.previoIntacto.ps === '10', true);
  eq('TQT · los dispositivos siguen visibles al quedar en VM', TQ.dispositivos, true);

  // FilmArray disponible como técnica de cultivo
  const FA = await p.evaluate(() => !!document.querySelector('input[name="mtest"][value="FilmArray"]'));
  eq('FilmArray está entre las técnicas de cultivo', FA, true);

  /* ── v5.1 · La TQT se decide ANTES de la terapia ventilatoria y la anula
        (antes había que llenar los parámetros dos veces el día de la TQT) ── */
  const ORD = await p.evaluate(async () => {
    DB = [{ ID_CAMA: '1', OCUPADA: true, NOMBRE: 'Juan P', VIA_AEREA: 'TOT', SOPORTE: 'VM', MODO: 'CPAP/PS',
      TOT_NUMERO: '7.5', TOT_CM_LABIO: '21', FECHA_INGRESO: '2026-07-20', FECHA_INICIO_VA: '2026-07-20' }];
    abrirPanel('1', false);
    await new Promise(r => setTimeout(r, 350));
    const vis = id => { const e = $(id); return !!(e && e.offsetParent !== null); };
    const o = {};
    o.ordenTqtPrimero = !!($('dTqtSec').compareDocumentPosition($('dVentBloque')) & Node.DOCUMENT_POSITION_FOLLOWING);
    o.ventVisible = vis('dVentBloque');
    $('cTqtO').checked = true; hTqtO();
    await new Promise(r => setTimeout(r, 150));
    o.ventOculto = !vis('dVentBloque');
    o.aviso = vis('avisoVentTqt');
    o.quedaCon = vis('poTqtSop');
    $('cTqtO').checked = false; hTqtO();
    await new Promise(r => setTimeout(r, 150));
    o.vuelve = vis('dVentBloque');
    // si la vía aérea deja de admitir TQT, el módulo debe reaparecer aunque
    // el check haya quedado marcado
    $('cTqtO').checked = true; hTqtO();
    $('fVA').value = 'Natural'; cascadeVA();
    await new Promise(r => setTimeout(r, 200));
    o.vuelveSiNoAplica = vis('dVentBloque');
    return o;
  });
  eq('TQT · la casilla va ANTES del módulo ventilatorio', ORD.ordenTqtPrimero, true);
  eq('TQT · con TOT el módulo ventilatorio se ve normal', ORD.ventVisible, true);
  eq('TQT · al marcarla, el módulo ventilatorio se anula', ORD.ventOculto, true);
  eq('TQT · avisa dónde quedó registrada la ventilación', ORD.aviso, true);
  eq('TQT · el «Queda con» sigue disponible para llenarlo una sola vez', ORD.quedaCon, true);
  eq('TQT · al desmarcarla vuelve el módulo ventilatorio', ORD.vuelve, true);
  eq('TQT · si la vía aérea deja de admitirla, el módulo reaparece', ORD.vuelveSiNoAplica, true);

  /* ── v5.2 · La FIJACIÓN del TOT se ajusta en cualquier turno (el tubo se
        reposiciona sin ser tubo nuevo); el N° sigue bajo «cambio de tubo» ── */
  const FIJ = await p.evaluate(async () => {
    DB = [{ ID_CAMA: '1', OCUPADA: true, NOMBRE: 'Juan P', VIA_AEREA: 'TOT', SOPORTE: 'VM', MODO: 'ACVC',
      TOT_NUMERO: '7.5', TOT_CM_LABIO: '21', FECHA_INGRESO: '2026-07-20', FECHA_INICIO_VA: '2026-07-20' }];
    abrirPanel('1', false);
    await new Promise(r => setTimeout(r, 350));
    const o = {};
    o.heredaDeLaCama = { n: v('fTOTn'), cm: v('fTOTcm') };
    o.cmEditable = !$('fTOTcm').disabled;
    o.numeroBloqueado = $('fTOTn').disabled;
    // el colega reposiciona el tubo sin declarar cambio de tubo
    $('fTOTcm').value = '23';
    o.cmGuardado = v('fTOTcm');
    // declarar cambio de tubo libera el número; deshacerlo restaura SOLO el número
    $('cCambioTOT').checked = true; toggleCambioTOT();
    o.numeroLibreTrasCambio = !$('fTOTn').disabled;
    $('fTOTn').value = '8.0'; $('fTOTcm').value = '24';
    $('cCambioTOT').checked = false; toggleCambioTOT();
    o.numeroRestaurado = v('fTOTn');
    o.fijacionNoSeDeshace = v('fTOTcm');
    return o;
  });
  eq('TOT · hereda número y fijación de la cama', FIJ.heredaDeLaCama.n === '7.5' && FIJ.heredaDeLaCama.cm === '21', true);
  eq('TOT · la FIJACIÓN se puede editar siempre', FIJ.cmEditable, true);
  eq('TOT · el NÚMERO sigue bloqueado hasta declarar cambio de tubo', FIJ.numeroBloqueado, true);
  eq('TOT · la fijación editada viaja en el guardado', FIJ.cmGuardado, '23');
  eq('TOT · declarar cambio de tubo libera el número', FIJ.numeroLibreTrasCambio, true);
  eq('TOT · deshacer el cambio restaura el número', FIJ.numeroRestaurado, '7.5');
  eq('TOT · pero NO deshace la fijación ajustada', FIJ.fijacionNoSeDeshace, '24');

  console.log(errs.length ? ('\nERRORES JS:\n' + errs.join('\n')) : '\nsin errores JS');
  await b.close();
  console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
  process.exit(fails.length || errs.length ? 1 : 0);
})();
