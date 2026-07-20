/**
 * svc_entrega.gs — Entrega de Turno (handoff) imprimible.
 *
 * Reúne, para las camas seleccionadas, el estado del turno que se entrega
 * (evolución de fecha+turno) + estado de cama + eventos FECHADOS del episodio
 * (intubación, PVE, extubación, reintubación, decanulación, cambios de
 * tubo/cánula), últimas evaluaciones con fecha (arrastre ULT_*), último
 * cultivo, dispositivos de circuito por vencer y alertas — en UNA estructura
 * lista para imprimir. Permite además guardar cada entrega como historial.
 *
 * Eficiencia: 3 lecturas masivas (CAMAS_ESTADO, EVOLUCIONES, PROCEDIMIENTOS)
 * sin importar cuántas camas se elijan.
 */

function obtenerEntregaTurno(idCamas, fecha, turno) {
  try {
    if (!idCamas || !idCamas.length) return err('No se seleccionaron camas.', ERR.VALIDACION);
    fecha = _statISO(fecha);
    const turnoKey = fecha + '-' + turno;
    const sel = idCamas.map(String);
    const setSel = {};
    sel.forEach(id => setSel[id] = true);

    // ── Lecturas masivas ──
    const camas = repoLeerTodos('CAMAS_ESTADO');
    const camaPorId = {};
    camas.forEach(c => camaPorId[String(c.ID_CAMA)] = c);

    const evosAll = repoLeerTodos('EVOLUCIONES');
    const evoTurnoPorCama = {};   // evolución del turno que se entrega
    const episodioPorCama = {};   // evoluciones del episodio actual (mismo PATIENT_ID)
    evosAll.forEach(e => {
      const id = String(e.ID_CAMA);
      if (!setSel[id]) return;
      if (String(e.TURNO_KEY) === turnoKey) evoTurnoPorCama[id] = e;
      const cama = camaPorId[id];
      if (cama && cama.PATIENT_ID && String(e.PATIENT_ID) === String(cama.PATIENT_ID)) {
        (episodioPorCama[id] = episodioPorCama[id] || []).push(e);
      }
    });
    Object.keys(episodioPorCama).forEach(id =>
      episodioPorCama[id].sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY))));

    // ── Último cultivo/estudio microbiológico por cama (PROCEDIMIENTOS) ──
    const procs = repoLeerTodos('PROCEDIMIENTOS');
    const cultivoPorCama = {};
    procs.forEach(p => {
      const id = String(p.ID_CAMA);
      if (!setSel[id]) return;
      const nom = String(p.NOMBRE_PROC || '').toUpperCase();
      if (!/CULTIVO|HISOPADO|PCR|FILMARRAY|MINI ?LAB|CCAET/.test(nom)) return;
      const iso = _statISO(p.FECHA);
      if (!iso) return;
      if (!cultivoPorCama[id] || iso > cultivoPorCama[id].iso) cultivoPorCama[id] = { iso: iso, nombre: p.NOMBRE_PROC };
    });

    const fichas = sel.map(id => _entFicha(id, camaPorId[id] || {},
      evoTurnoPorCama[id] || null, episodioPorCama[id] || [], cultivoPorCama[id] || null, fecha));

    const ocupadas = camas.filter(c => esVerdadero(c.OCUPADA)).length;
    const enVM = camas.filter(c => esVerdadero(c.OCUPADA) && String(c.SOPORTE) === 'VM').length;

    return ok({
      fecha: fecha, turno: turno, turnoKey: turnoKey,
      generado: new Date().toISOString(),
      resumen: { ocupadas: ocupadas, enVM: enVM, totalCamas: camas.length, entregadas: fichas.length },
      fichas: fichas,
    });
  } catch (e) { return err('obtenerEntregaTurno: ' + e.message, ERR.INTERNO, e); }
}

/** Ficha de entrega de una cama. */
function _entFicha(id, c, e, episodio, cultivo, fecha) {
  const val = (a, b) => (a !== undefined && a !== null && a !== '') ? a : (b !== undefined && b !== null ? b : '');
  const dd = x => { const s = _statISO(x); return s ? s.slice(8, 10) + '-' + s.slice(5, 7) : ''; };

  // ── Eventos FECHADOS del episodio (con hora cuando existe) ──
  const eventos = [];
  episodio.forEach(ev => {
    const f = dd(ev.FECHA);
    if (esVerdadero(ev.INTUB_OCURRIO)) eventos.push('🫁 Intubación ' + f + (ev.INTUB_HORA ? ' ' + ev.INTUB_HORA : ''));
    if (ev.PVE_VAL === 'si' && ev.PVE_RESULTADO) {
      let mot = '';
      if (ev.PVE_RESULTADO === 'frustra') {
        try { const m = JSON.parse(ev.PVE_FR_MOTIVOS || '[]'); if (m.length) mot = ' (' + m.join(', ') + ')'; } catch (x) {}
      }
      eventos.push((ev.PVE_RESULTADO === 'superada' ? '▲ PVE superada ' : '▼ PVE frustra ') + f + mot);
    }
    if (esVerdadero(ev.EXT_OCURRIO)) eventos.push('✂️ Extubación ' + f + (ev.EXT_HORA ? ' ' + ev.EXT_HORA : '') + (ev.EXT_TIPO ? ' (' + ev.EXT_TIPO + ')' : ''));
    if (esVerdadero(ev.EXT_REINTUB)) eventos.push('⚠️ Reintubación ' + f);
    if (esVerdadero(ev.DECAN_OCURRIO)) eventos.push('⭕ Decanulación ' + f + (esVerdadero(ev.DECAN_RECANUL) ? ' → recanulado' : ''));
    if (esVerdadero(ev.TOT_CAMBIO)) eventos.push('🔄 Cambio de tubo ' + f);
    if (esVerdadero(ev.TQT_CAMBIO)) eventos.push('🔄 Cambio de cánula ' + f);
    if (esVerdadero(ev.RESP_POS_PRONO)) eventos.push('🔃 Prono ' + f + (ev.RESP_PRONO_HORA ? ' ' + ev.RESP_PRONO_HORA + ' hrs' : ''));
    if (esVerdadero(ev.RESP_POS_SUPINO)) eventos.push('🔃 Supino ' + f + (ev.RESP_SUPINO_HORA ? ' ' + ev.RESP_SUPINO_HORA + ' hrs' : ''));
  });

  // ── Clasificación de weaning desde los PVE del episodio ──
  const pves = {};
  episodio.forEach(ev => {
    if (ev.PVE_VAL === 'si' && ev.PVE_RESULTADO) pves[String(ev.TURNO_KEY)] = ev.PVE_RESULTADO;
  });
  const weaning = _weaningClase(pves, fecha, val(e && e.VENT_SOPORTE, c.SOPORTE));

  // ── Últimas evaluaciones con fecha (arrastre en cama + CPAx del episodio) ──
  const evals = [];
  if (val(c.ULT_MRC) !== '') evals.push('MRC-SS ' + c.ULT_MRC + (c.ULT_MRC_FECHA ? ' (' + dd(c.ULT_MRC_FECHA) + ')' : ''));
  if (val(c.ULT_FSS) !== '') evals.push('FSS ' + c.ULT_FSS + (c.ULT_FSS_FECHA ? ' (' + dd(c.ULT_FSS_FECHA) + ')' : ''));
  if (val(c.ULT_DINAMO) !== '') evals.push('Dinamo ' + c.ULT_DINAMO + ' kg');
  let cpax = '', cpaxF = '';
  episodio.forEach(ev => { if (val(ev.CPAX_TOTAL) !== '') { cpax = ev.CPAX_TOTAL; cpaxF = dd(ev.FECHA); } });
  if (cpax !== '') evals.push('CPAx ' + cpax + (cpaxF ? ' (' + cpaxF + ')' : ''));

  // ── Dispositivos de circuito por vencer (solo VM) ──
  const disp = [];
  if (String(c.SOPORTE) === 'VM') {
    [['HME', c.DISP_HME_FECHA, 2], ['HEPA', c.DISP_HEPA_FECHA, 3], ['T.Care', c.DISP_TC_FECHA, 3]].forEach(function (d) {
      const iso = _statISO(d[1]); if (!iso) return;
      const dia = diasEntre(iso, fecha) + 1;
      disp.push({ n: d[0], dia: dia, dur: d[2], estado: dia < d[2] ? 'ok' : (dia === d[2] ? 'cambiar' : 'vencido') });
    });
  }

  // ── Alertas ──
  const diasVM = e ? val(e.DIAS_VM, '') : ((String(c.SOPORTE) === 'VM') ? diasEntre(c.FECHA_INICIO_SOPORTE, fecha) : '');
  const diasEst = e ? val(e.DIA_ESTADIA, '') : (c.FECHA_INGRESO ? diasEntre(c.FECHA_INGRESO, fecha) : '');
  const alertas = [];
  if (parseInt(diasVM) >= 14) alertas.push('VM ' + diasVM + 'd');
  if (parseInt(diasEst) >= 21) alertas.push(diasEst + 'd UCI');
  if (esVerdadero(c.KTM_SUSP)) alertas.push('KTM contraindicada');
  const coop = /^cooperador$/i.test(String(c.ULT_COOP || '').trim());
  if (coop && val(c.ULT_MRC) === '') alertas.push('MRC-SS pendiente');
  if (coop && val(c.ULT_FSS) === '') alertas.push('FSS-ICU pendiente');
  // Evaluaciones ENVEJECIDAS (cooperador con valor antiguo): mismo patrón que
  // los dispositivos por vencer, con corte configurable EVAL_DIAS_ALERTA.
  const cutEval = parseInt(leerConfig('EVAL_DIAS_ALERTA', '5')) || 5;
  const _edadEval = function (f) { const iso = _statISO(f); return iso ? diasEntre(iso, fecha) : null; };
  const edadMrc = coop && val(c.ULT_MRC) !== '' ? _edadEval(c.ULT_MRC_FECHA) : null;
  if (edadMrc != null && edadMrc > cutEval) alertas.push('MRC-SS hace ' + edadMrc + 'd');
  const edadFss = coop && val(c.ULT_FSS) !== '' ? _edadEval(c.ULT_FSS_FECHA) : null;
  if (edadFss != null && edadFss > cutEval) alertas.push('FSS-ICU hace ' + edadFss + 'd');
  if (!e) alertas.push('Sin evolución de este turno');

  // ICU-AW: debilidad adquirida en UCI — MRC-SS <48 en paciente cooperador.
  // Se resuelve sola cuando una medición posterior alcanza ≥48.
  const icuaw = (coop && val(c.ULT_MRC) !== '' && parseInt(c.ULT_MRC) < 48)
    ? { mrc: c.ULT_MRC, fecha: dd(c.ULT_MRC_FECHA) } : null;
  // Candidato a PVE: tamizaje sincronizado en la cama al guardar el último turno.
  const candidatoPve = String(c.SOPORTE) === 'VM' && esVerdadero(c.WEAN_CAND_PVE);
  // ¿Cuántos turnos SEGUIDOS lleva candidato sin que se haga la PVE? Se deriva
  // del episodio (sin columnas nuevas): se camina desde el último turno hacia
  // atrás mientras el turno cumpla tamizaje y no registre PVE. Al superar el
  // corte PVE_TURNOS_ALERTA escala a la sección de alertas.
  let pveRacha = 0;
  if (candidatoPve) {
    for (let i = episodio.length - 1; i >= 0; i--) {
      if (_turnoCandidatoPve(episodio[i])) pveRacha++;
      else break;
    }
    const cutPve = parseInt(leerConfig('PVE_TURNOS_ALERTA', '2')) || 2;
    if (pveRacha >= cutPve) alertas.push('Candidato a PVE hace ' + pveRacha + ' turnos sin PVE');
  }

  return {
    idCama: id,
    ocupada: esVerdadero(c.OCUPADA),
    tieneEvo: !!e,
    nombre: val(e && e.PAC_NOMBRE, c.NOMBRE),
    edad: val(e && e.PAC_EDAD, c.EDAD),
    sexo: val(e && e.PAC_SEXO, c.SEXO),
    diagnostico: val(e && e.PAC_DIAGNOSTICO, c.DIAGNOSTICO),
    diasEstadia: diasEst, diasVM: diasVM,
    viaAerea: val(e && e.VENT_VIA_AEREA, c.VIA_AEREA),
    soporte: val(e && e.VENT_SOPORTE, c.SOPORTE),
    modo: val(e && e.VENT_MODO, c.MODO),
    params: e ? _entParams(e) : '',
    catResp: { pje: val(c.CAT_RESP_PJE), nivel: val(c.CAT_RESP_NIVEL) },
    catMotor: { pje: val(c.CAT_MOTOR_PJE), nivel: val(c.CAT_MOTOR_NIVEL) },
    sedTipo: e ? val(e.SED_TIPO) : '',
    sas: e ? val(e.SED_SAS) : '',
    bnm: e ? esVerdadero(e.SED_BNM) : false,
    cooperacion: val(e && e.SED_COOPERACION, c.ULT_COOP),
    // El valor guardado ya trae el prefijo 'DVA' ('DVA dosis media'); se quita
    // aquí porque la ficha lo antepone al renderizar (evita 'DVA DVA dosis media').
    dva: e ? String(e.HEMO_DVA || '').replace('Sin requerimientos', '').replace(/^DVA\s*/i, '') : '',
    hemoEstado: e ? val(e.HEMO_ESTADO) : '',
    secr: e ? [e.RESP_SECR_REOL, e.RESP_SECR_QTY].filter(function (x) { return x; }).join(' ') : '',
    ktmNivel: e ? val(e.KTM_NIVEL_KTR, '') : val(c.KTM_NIVEL, ''),
    ktmRealizada: e ? esVerdadero(e.KTM_REALIZADA) : false,
    ktmSuspendida: e ? esVerdadero(e.KTM_SUSPENDIDA) : esVerdadero(c.KTM_SUSP),
    ktmContra: e ? val(e.KTM_CONTRA_RAZON, val(e.KTM_CONTRA_CAT)) : '',
    ktr: e ? val(e.RESP_KTR_CANT, '') : '',
    eventos: eventos.slice(-8),
    evals: evals,
    dispositivos: disp,
    alertas: alertas,
    weaning: weaning,
    icuaw: icuaw,
    candidatoPve: candidatoPve,
    pveRacha: pveRacha,
    ultimoCultivo: cultivo ? { fecha: dd(cultivo.iso), nombre: cultivo.nombre, micro: val(c.AISL_MICRO) } : null,
    plan: e ? val(e.PLAN_PLANES) : '',
    pendientes: e ? (function () { try { return JSON.parse(e.PLAN_PENDIENTES || '[]') || []; } catch (x) { return []; } })() : [],
    nota: e ? val(e.PLAN_NOTA_TURNO) : '',
    firma: val(e && e.PLAN_FIRMA_KINE, c.FIRMA_KINE),
  };
}

/**
 * ¿Este turno cumplía el tamizaje de candidato a PVE sin registrar PVE?
 * MISMOS criterios que _syncCamaDesdeEvolucion (svc_evoluciones.gs): FiO₂ ≤50,
 * PEEP ≤8, SpO₂ ≥90, HDN estable sin DVA altas, sin BNM, en VM. Sirve para
 * derivar la racha de turnos candidato sin PVE desde el episodio.
 */
function _turnoCandidatoPve(e) {
  if (String(e.VENT_SOPORTE) !== 'VM' || e.PVE_VAL === 'si') return false;
  const n = function (x) { return parseFloat(x); };
  const dva = String(e.HEMO_DVA || '');
  return n(e.VENT_FIO2) > 0 && n(e.VENT_FIO2) <= 50 &&
    n(e.VENT_PEEP) > 0 && n(e.VENT_PEEP) <= 8 &&
    n(e.VENT_SPO2) >= 90 &&
    e.HEMO_ESTADO !== 'Inestable' &&
    (dva === '' || /sin requerimientos|dosis bajas/i.test(dva)) &&
    !esVerdadero(e.SED_BNM);
}

/**
 * Clasificación del weaning (Boles et al., ERJ 2007 / estudio WIND 2017) a
 * partir de los PVE del episodio. Solo aplica mientras el paciente sigue en
 * VM (weaning en curso); superado el primer PVE sin frustros = simple (no se
 * alerta). Difícil: ≥1 PVE frustro. Prolongado: ≥3 frustros o >7 días desde
 * el primer PVE.
 * @param {Object} pves {turnoKey: 'superada'|'frustra'}
 * @param {string} fechaRef ISO de referencia (fecha de la entrega)
 * @param {string} soporte soporte actual del paciente
 * @return {?Object} {clase:'dificil'|'prolongado', frustras, dias, primerPve} o null
 */
function _weaningClase(pves, fechaRef, soporte) {
  if (String(soporte) !== 'VM') return null;
  const keys = Object.keys(pves || {}).sort();
  if (!keys.length) return null;
  const primer = keys[0].slice(0, 10);
  const frustras = keys.filter(function (k) { return pves[k] === 'frustra'; }).length;
  const dias = diasEntre(primer, fechaRef);
  const clase = (frustras >= 3 || dias > 7) ? 'prolongado' : (frustras >= 1 ? 'dificil' : '');
  return clase ? { clase: clase, frustras: frustras, dias: dias, primerPve: primer } : null;
}

/** Parámetros ventilatorios clave en texto compacto (solo no vacíos). */
function _entParams(e) {
  const out = [];
  const push = function (lbl, key) {
    const x = e[key];
    if (x !== '' && x !== null && x !== undefined) out.push(lbl + ' ' + x);
  };
  push('FiO₂', 'VENT_FIO2'); push('PEEP', 'VENT_PEEP'); push('PS', 'VENT_PS');
  push('IPAP', 'VENT_IPAP'); push('EPAP', 'VENT_EPAP');
  push('VT', 'VENT_VT'); push('FR', 'VENT_FR'); push('SpO₂', 'VENT_SPO2');
  push('L', 'VENT_LITROS'); push('Flujo', 'VENT_FLUJO');
  return out.join(' · ');
}

/** Guarda una entrega emitida como historial (hoja ENTREGAS_TURNO). */
function guardarEntregaTurno(payload, ctx) {
  return conLock(function () {
    try {
      const r = payload.resumen || {};
      const fila = {
        ID_ENTREGA: 'ENT_' + Date.now(),
        TIMESTAMP: ahoraTS(),
        FECHA: payload.fecha || '',
        TURNO: payload.turno || '',
        KINE_ENTREGA: payload.kineEntrega || (ctx && ctx.firma) || '',
        KINE_RECIBE: payload.kineRecibe || '',
        CAMAS_N: (payload.idCamas || []).length,
        OCUPADAS: r.ocupadas || '',
        EN_VM: r.enVM || '',
        CAMAS_IDS: (payload.idCamas || []).join(','),
        NOTAS: payload.notas || '',
        SNAPSHOT_JSON: String(payload.snapshotJson || '').slice(0, 45000),
      };
      repoInsertar('ENTREGAS_TURNO', fila);
      return ok({ id: fila.ID_ENTREGA, entidad: 'ENTREGAS_TURNO' });
    } catch (e) { return err('guardarEntregaTurno: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Historial de entregas (cabeceras, sin el snapshot pesado). */
function obtenerEntregasTurno(limite) {
  try {
    const rows = repoLeerTodos('ENTREGAS_TURNO').map(function (v) {
      return { id: v.ID_ENTREGA, timestamp: v.TIMESTAMP, fecha: v.FECHA, turno: v.TURNO,
               kineEntrega: v.KINE_ENTREGA, kineRecibe: v.KINE_RECIBE, camasN: v.CAMAS_N,
               ocupadas: v.OCUPADAS, enVM: v.EN_VM, camasIds: v.CAMAS_IDS, notas: v.NOTAS };
    });
    rows.reverse();
    return ok(limite ? rows.slice(0, limite) : rows);
  } catch (e) { return err('obtenerEntregasTurno: ' + e.message, ERR.INTERNO, e); }
}
