// v42.js — Guardia del paquete v4.2 (decisiones clínicas de Diego, jul-2026):
//  A1  días de VM/VA del episodio derivados de las evoluciones al egresar
//  A3  EXTUBACION_OK / REINTUBACION del archivo derivados del episodio
//  A2  «sin condiciones de PVE» NO es extubación: es no-PVE con su razón
//  B1  válvula de fonación como modo de TQT (con O2 y en ambiente) + su uso
//      como intervención en el módulo REHABILITACIÓN
//  B2  Tubo T / HME aceptan FiO2 (pueden ir sin nada adicional)
//  B3a GSA opcional que se despliega con la casilla
//  B3b desvinculación de VM del traqueostomizado, con reconexión y delta de horas
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');

const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

/* ── Parte 1 · servidor (node puro) ── */
const DB = {};
global.repoLeerTodos = (h, campo, valor) => {
  let filas = (DB[h] || []).slice();
  if (campo !== undefined) filas = filas.filter(r => String(r[campo]) === String(valor));
  return filas;
};
// Lectura por columnas (Ola 3): el doble recorta igual que producción.
global.repoLeerColumnas = (h, campos) => (DB[h] || []).map(o => {
  if (!campos || !campos.length) return Object.assign({}, o);
  const r = {};
  campos.forEach(c => { r[c] = (o[c] === undefined) ? '' : o[c]; });
  return r;
});
global.repoBuscarPorId = (h, campo, id) => (DB[h] || []).find(r => String(r[campo]) === String(id)) || null;
global.repoActualizar = (h, campo, id, c) => { const r = global.repoBuscarPorId(h, campo, id); if (r) Object.assign(r, c); return !!r; };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoEliminarDonde = (h, fn) => { DB[h] = (DB[h] || []).filter(r => !fn(r)); };
global.repoActualizarDonde = () => {};
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.conLock = fn => fn();
global.uid = p => p + '_x';
global.hoyISO = () => '2026-07-20';
global.ahoraTS = () => '2026-07-20 12:00';
global.diasEntre = () => 9;
global.validarPayloadIngreso = () => [];
global.generarCodPaciente = () => 'PAC';
global._codUnico = c => c;
global._rutNormal = r => String(r || '');
global._agregarHitoInterno = () => {};
global._limpiarCamaInterno = () => {};
global.calcularPI = () => '';
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
eval(['svc_stats.gs', 'svc_camas.gs', 'svc_indicadores.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

// ── A1 + A3: episodio ventilado que egresa desvinculado ──
const PID = 'p1';
DB.CAMAS_ESTADO = [{ ID_CAMA: '1', OCUPADA: 'TRUE', PATIENT_ID: PID, NOMBRE: 'Test',
  FECHA_INGRESO: '2026-07-01', DIA_ESTADIA: 9, DIAS_VM: 0, DIAS_VA: 0, TIMELINE_JSON: '[]' }];
DB.EVOLUCIONES = [
  { PATIENT_ID: PID, TURNO_KEY: '2026-07-01-Dia', FECHA: '2026-07-01', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT' },
  { PATIENT_ID: PID, TURNO_KEY: '2026-07-01-Noche', FECHA: '2026-07-01', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT' },
  { PATIENT_ID: PID, TURNO_KEY: '2026-07-02-Dia', FECHA: '2026-07-02', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT' },
  { PATIENT_ID: PID, TURNO_KEY: '2026-07-03-Dia', FECHA: '2026-07-03', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
    EXT_OCURRIO: true, EXT_TIPO: 'protocolo', EXT_HORA: '11:00', VENT_VIA_AEREA_FINAL: 'Natural', VENT_SOPORTE_FINAL: 'Oxigenoterapia/OAF' },
  { PATIENT_ID: PID, TURNO_KEY: '2026-07-04-Dia', FECHA: '2026-07-04', VENT_SOPORTE: 'Oxigenoterapia/OAF', VENT_VIA_AEREA: 'Natural' },
];
DB.ARCHIVO_PACIENTES = []; DB.REINTUBACIONES = [];
let r = darAltaPaciente({ idCama: '1', motivoEgreso: 'Traslado a sala', destinoEgreso: 'Medicina' }, { firma: 'DMV' });
let A = DB.ARCHIVO_PACIENTES[0];
eq('egreso ok', r.ok, true);
eq('A1 · días de VM del episodio (3 días distintos), no el 0 del censo', A.DIAS_VM_TOTAL, 3);
eq('A1 · días de vía aérea artificial (3 días con TOT)', A.DIAS_VA_TOTAL, 3);
eq('A3 · extubación exitosa derivada (programada sin reintubación)', A.EXTUBACION_OK, true);
eq('A3 · sin reintubación en el episodio', A.REINTUBACION, false);

// Episodio con reintubación → EXTUBACION_OK falso, REINTUBACION verdadero
// Sigue ventilado al egresar: el censo (diasEntre stub = 9) debe ganar sobre
// el único día registrado en evoluciones.
DB.CAMAS_ESTADO = [{ ID_CAMA: '2', OCUPADA: 'TRUE', PATIENT_ID: 'p2', FECHA_INGRESO: '2026-07-05',
  SOPORTE: 'VM', VIA_AEREA: 'TOT', FECHA_INICIO_SOPORTE: '2026-07-05', FECHA_INICIO_VA: '2026-07-05',
  DIA_ESTADIA: 5, TIMELINE_JSON: '[]' }];
DB.EVOLUCIONES = [
  { PATIENT_ID: 'p2', TURNO_KEY: '2026-07-05-Dia', FECHA: '2026-07-05', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
    EXT_OCURRIO: true, EXT_TIPO: 'protocolo', EXT_REINTUB: true },
];
r = darAltaPaciente({ idCama: '2', motivoEgreso: 'x', destinoEgreso: 'UTI' }, { firma: 'DMV' });
A = DB.ARCHIVO_PACIENTES[1];
eq('A3 · con reintubación: EXTUBACION_OK falso y REINTUBACION verdadero',
   A.EXTUBACION_OK === false && A.REINTUBACION === true, true);
eq('A1 · el contador del censo manda si es mayor (egresa ventilado)', A.DIAS_VM_TOTAL, 9);

// ── A2: sin_condiciones JAMÁS cuenta como extubación ──
DB.EVOLUCIONES = [
  // fila histórica con el tipo viejo (no debe contar ni como programada ni como fuera)
  { PATIENT_ID: 'p3', TURNO_KEY: '2026-07-06-Dia', FECHA: '2026-07-06', VENT_SOPORTE: 'VM',
    EXT_OCURRIO: true, EXT_TIPO: 'sin_condiciones' },
  // extubación real fuera de protocolo, con su motivo
  { PATIENT_ID: 'p4', TURNO_KEY: '2026-07-07-Dia', FECHA: '2026-07-07', VENT_SOPORTE: 'VM',
    EXT_OCURRIO: true, EXT_TIPO: 'sin_protocolo', EXT_MOTIVO: '≤ 24 h de VM' },
  // turno sin PVE, con razón: ni extubación ni fuera de protocolo
  { PATIENT_ID: 'p5', TURNO_KEY: '2026-07-08-Dia', FECHA: '2026-07-08', VENT_SOPORTE: 'VM',
    PVE_VAL: 'no', PVE_SC_RAZON: 'Sedación profunda / BNM' },
];
DB.EVOLUCIONES_ARCHIVO = []; DB.ARCHIVO_PACIENTES = []; DB.CAMAS_ESTADO = [];
const IND = calcularIndicadores('2026-07-01', '2026-07-20');
eq('indicadores ok', IND.ok, true);
eq('A2 · «sin condiciones» no suma a extubaciones (solo la real)', IND.data.extubaciones, 1);
eq('A2 · fuera de protocolo cuenta solo la extubación real', IND.data.fueraProtocolo, 1);
eq('A2 · el motivo sale del campo de motivo, no del tipo',
   Object.keys(IND.data.motivosFuera).join('|'), '≤ 24 h de VM');

// ── Desvinculación de VM: indicador nuevo ──
DB.EVOLUCIONES = [
  { PATIENT_ID: 'p6', TURNO_KEY: '2026-07-09-Dia', FECHA: '2026-07-09', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TQT',
    DESVINC_OCURRIO: true, DESVINC_HORA: '09:00', DESVINC_A: 'Tubo T', DESVINC_RECONEXION: true, DESVINC_HORA_RECON: '13:00', DESVINC_HORAS: 4 },
  { PATIENT_ID: 'p6', TURNO_KEY: '2026-07-10-Dia', FECHA: '2026-07-10', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TQT',
    DESVINC_OCURRIO: true, DESVINC_HORA: '09:00', DESVINC_A: 'Válvula de fonación', DESVINC_HORAS: 8,
    VFON_USADA: true, VFON_MIN: 45, VFON_TOL: 'Buena' },
];
const IND2 = calcularIndicadores('2026-07-01', '2026-07-20').data;
eq('desvinculaciones contadas', IND2.desvinculaciones, 2);
eq('un solo paciente desvinculado', IND2.desvincPacientes, 1);
eq('reconexiones y horas acumuladas', IND2.desvincReconexiones === 1 && IND2.desvincHorasTotal === 12, true);
eq('mediana de horas fuera del ventilador', IND2.desvincMedianaHoras, 6);
eq('uso de válvula de fonación (turnos y minutos)', IND2.vfonTurnos === 1 && IND2.vfonMinutos === 45, true);

/* ── Parte 2 · UI (Chromium) ── */
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

  // ── A2 (UI): «sin condiciones» ya no es un tipo de extubación ──
  const P = await p.evaluate(() => {
    const r = {};
    r.radioViejo = !!document.querySelector('input[name="extTipo"][value="sin_condiciones"]');
    r.razonExiste = !!$('fPveSCraz') && !!$('fPveSCdet');
    $('kf').reset(); $('cBed').value = '3'; $('fVA').value = 'TOT';
    hPVEtoggle('no');
    r.razonVisible = !$('dPVENoRama').classList.contains('hidden');
    r.tipoOculto = $('dExtTipoBox').classList.contains('hidden');
    // sin declarar extubación: no hay extubación aunque no se hizo PVE
    $('fPveSCraz').value = 'Sedación profunda / BNM';
    r.sinExt = { ocurrio: _extOcurrio(), tipo: _extTipo() };
    // al declararla, aparecen los tipos
    $('cExtSinPve').click();
    r.tipoVisible = !$('dExtTipoBox').classList.contains('hidden');
    document.querySelector('input[name="extTipo"][value="sin_protocolo"]').click();
    r.conExt = { ocurrio: _extOcurrio(), tipo: _extTipo() };
    // desmarcar limpia el tipo (no queda huérfano)
    $('cExtSinPve').click();
    r.limpio = { ocurrio: _extOcurrio(), tipo: _extTipo(), marcado: !!document.querySelector('input[name="extTipo"]:checked') };
    return r;
  });
  eq('A2 · el tipo «sin condiciones» ya no existe en el formulario', P.radioViejo, false);
  eq('A2 · hay razón (categoría + detalle) de por qué no se hizo PVE', P.razonExiste, true);
  eq('A2 · PVE «No» muestra la razón y OCULTA los tipos de extubación', P.razonVisible && P.tipoOculto, true);
  eq('A2 · sin PVE y sin declarar extubación → NO hay extubación', P.sinExt.ocurrio === false && P.sinExt.tipo === '', true);
  eq('A2 · al declarar extubación sin PVE sí se registra su tipo',
     P.tipoVisible && P.conExt.ocurrio === true && P.conExt.tipo === 'sin_protocolo', true);
  eq('A2 · desmarcar deja el bloque limpio', P.limpio.ocurrio === false && P.limpio.marcado === false, true);

  // ── B1/B2: matriz de vía aérea y parámetros ──
  const M = await p.evaluate(() => {
    const r = {};
    r.sopsTQT = VMAPS['TQT'].sops.join('|');
    r.modosO2 = VMAPS['TQT'].modos['Oxigenoterapia/OAF'].join('|');
    r.modosAmb = (VMAPS['TQT'].modos['Ambiente'] || []).join('|');
    $('kf').reset(); $('cBed').value = '3';
    $('fVA').value = 'TQT'; cascadeVA();
    $('fSop').value = 'Oxigenoterapia/OAF'; cascadeSop();
    $('fModo').value = 'Tubo T'; renderParams();
    r.tuboT = { fio2: !!$('r_fio2'), litros: !!$('r_litros') };
    $('fModo').value = 'Válvula de fonación'; renderParams();
    r.valvula = { fio2: !!$('r_fio2'), litros: !!$('r_litros'), spo2: !!$('r_spo2') };
    return r;
  });
  eq('B1 · TQT admite VM, oxigenoterapia y ambiente', M.sopsTQT, 'VM|Oxigenoterapia/OAF|Ambiente');
  eq('B1 · válvula de fonación es modo de TQT con O2', /Válvula de fonación/.test(M.modosO2), true);
  eq('B1 · …y también en ambiente', /Válvula de fonación/.test(M.modosAmb), true);
  eq('B2 · Tubo T ya acepta FiO₂ (además de litros)', M.tuboT.fio2 && M.tuboT.litros, true);
  eq('B1 · la válvula tiene sus parámetros de O2 y SpO₂', M.valvula.fio2 && M.valvula.litros && M.valvula.spo2, true);

  // ── Rehabilitación: nombre del módulo + uso de válvula ──
  const R = await p.evaluate(() => {
    const tit = document.querySelector('#fcKtmCard .fcard-title').textContent.trim();
    $('kf').reset(); $('cBed').value = '3';
    $('fVA').value = 'TQT'; cascadeVA(); updateVAUI();
    const vis = !$('dVfonSec').classList.contains('hidden');
    $('cVfon').click();
    const det = !$('dVfonDet').classList.contains('hidden');
    $('fVfonMin').value = '30'; $('fVfonTol').value = 'Buena';
    $('fVA').value = 'TOT'; cascadeVA(); updateVAUI();
    const ocultoEnTOT = $('dVfonSec').classList.contains('hidden');
    return { tit, vis, det, ocultoEnTOT };
  });
  eq('el módulo se llama REHABILITACIÓN', /REHABILITACIÓN/.test(R.tit), true);
  eq('el uso de válvula aparece con TQT y se despliega', R.vis && R.det, true);
  eq('…y no aparece con TOT', R.ocultoEnTOT, true);

  // ── Desvinculación de VM: delta de horas + payload ──
  const D = await p.evaluate(() => {
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    $('fVA').value = 'TQT'; cascadeVA(); $('fSop').value = 'VM'; cascadeSop(); updateVAUI();
    const r = { visible: !$('dDesvincSec').classList.contains('hidden') };
    $('cDesvinc').click();
    $('fDesvincHora').value = '09:30'; $('fDesvincA').value = 'Tubo T';
    $('fDesvincMotivo').value = 'Entrenamiento de weaning programado';
    r.sinRecon = $('lblDesvincDelta').textContent;
    $('cDesvincRecon').click();
    $('fDesvincHoraRecon').value = '14:00'; calcDesvinc();
    r.delta = $('lblDesvincDelta').textContent;
    // ventana que cruza medianoche (turno noche)
    $('fDesvincHora').value = '22:00'; $('fDesvincHoraRecon').value = '02:30'; calcDesvinc();
    r.cruzaMedianoche = $('lblDesvincDelta').textContent;
    // el procedimiento automático genera el hito
    r.autoProc = _autoProcs().indexOf('DESVINCULACIÓN') !== -1;
    return r;
  });
  eq('la desvinculación aparece con TQT en VM', D.visible, true);
  eq('sin reconexión no hay delta', D.sinRecon, '—');
  eq('delta de horas correcto (09:30 → 14:00 = 4,5 h)', /4,5 h/.test(D.delta), true);
  eq('ventana que cruza medianoche (22:00 → 02:30 = 4,5 h)', /4,5 h/.test(D.cruzaMedianoche), true);
  eq('genera el procedimiento DESVINCULACIÓN (→ hito)', D.autoProc, true);

  // ── GSA: casilla que despliega + interpretación + PaFi automática ──
  const G = await p.evaluate(() => {
    $('kf').reset(); $('cBed').value = '3';
    const r = { oculto: $('dGSA').classList.contains('hidden') };
    $('cGSA').click();
    r.visible = !$('dGSA').classList.contains('hidden');
    $('fGsaPh').value = '7.28'; $('fGsaPaco2').value = '58'; $('fGsaHco3').value = '26';
    $('fGsaPao2').value = '80'; $('fGsaFio2').value = '50';
    interpGSA();
    r.interp = $('lblGsaInterp').textContent;
    $('cGSA').click();
    r.limpio = $('dGSA').classList.contains('hidden') && $('fGsaPh').value === '';
    return r;
  });
  eq('GSA parte oculto y se despliega con la casilla', G.oculto && G.visible, true);
  eq('interpreta acidosis respiratoria', /Acidosis respiratoria/.test(G.interp), true);
  eq('calcula PaFiO2 (80/0,5 = 160 → SDRA moderado)', /PaFiO2 160/.test(G.interp) && /moderado/.test(G.interp), true);
  eq('desmarcar limpia el bloque', G.limpio, true);

  // ── Texto clínico: las tres piezas nuevas narradas ──
  const T = await p.evaluate(() => {
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    $('fVA').value = 'TQT'; cascadeVA(); $('fSop').value = 'VM'; cascadeSop();
    $('fModo').value = 'CPAP/PS'; renderParams(); updateVAUI();
    $('cDesvinc').click();
    $('fDesvincHora').value = '09:30'; $('fDesvincA').value = 'Tubo T';
    $('cDesvincRecon').click(); $('fDesvincHoraRecon').value = '14:00'; calcDesvinc();
    $('cVfon').click(); $('fVfonMin').value = '30'; $('fVfonTol').value = 'Buena';
    $('cGSA').click(); $('fGsaPh').value = '7.38'; $('fGsaPaco2').value = '40'; interpGSA();
    const t1 = genTexto();
    // PVE no realizada con razón (sin extubación)
    $('kf').reset(); $('cBed').value = '3'; $('fVA').value = 'TOT'; cascadeVA(); $('fSop').value = 'VM'; cascadeSop();
    $('fModo').value = 'CPAP/PS'; renderParams();
    $('fPVEval').value = '';   // hidden: form.reset() no lo limpia (lo hace abrirPanel)
    hPVEtoggle('no'); $('fPveSCraz').value = 'Sedación profunda / BNM';
    const t2 = genTexto();
    return { t1, t2 };
  });
  eq('texto · desvinculación con destino y reconexión',
     /Se desvincula de ventilación mecánica a las 09:30 hrs, quedando con Tubo T/.test(T.t1) && /completando 4,5 h/.test(T.t1), true);
  eq('texto · válvula de fonación con tiempo y tolerancia',
     /Se instala válvula de fonación por 30 minutos, con tolerancia buena/.test(T.t1), true);
  eq('texto · GSA con sus valores', /GSA: pH 7,38, PaCO2 40 mmHg/.test(T.t1), true);
  eq('texto · no-PVE dice la razón y que mantiene soporte',
     /No se realiza PVE en este turno por sedación profunda \/ BNM\. Mantiene soporte ventilatorio\./.test(T.t2), true);
  eq('texto · no-PVE NO narra ninguna extubación', /extub/i.test(T.t2), false);

  console.log(errs.length ? ('\nERRORES JS:\n' + errs.join('\n')) : '\nsin errores JS');
  await b.close();
  console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
  process.exit(fails.length || errs.length ? 1 : 0);
})();
