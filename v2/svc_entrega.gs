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

    // Solo las evoluciones de las camas seleccionadas (lectura por tramos):
    // antes bajaba EVOLUCIONES entera en cada vista de la entrega.
    const evosAll = repoLeerFiltrado('EVOLUCIONES', 'ID_CAMA',
      function (v) { return !!setSel[String(v).trim()]; });
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

    // ── Evolución del turno ANTERIOR, para las camas sin evolución de este ──
    // (Diego, ago-2026): antes esas fichas salían huecas —sedación, SAS,
    // parámetros, plan, todo vacío— y la hoja impresa no servía. Ahora se
    // rellenan con el último turno evolucionado del episodio y la ficha lo
    // AVISA: leer datos de hace 12 h creyéndolos de ahora es peor que el
    // vacío, así que el aviso es parte del arreglo, no un adorno.
    const evoPrevPorCama = {};
    sel.forEach(id => {
      if (evoTurnoPorCama[id]) return;
      const epi = episodioPorCama[id] || [];
      for (let i = epi.length - 1; i >= 0; i--) {
        if (String(epi[i].TURNO_KEY) < turnoKey) { evoPrevPorCama[id] = epi[i]; break; }
      }
    });

    const fichas = sel.map(id => _entFicha(id, camaPorId[id] || {},
      evoTurnoPorCama[id] || null, episodioPorCama[id] || [], cultivoPorCama[id] || null, fecha,
      _fechaEfectivaTurno(fecha, turno), turno, evoPrevPorCama[id] || null));

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
function _entFicha(id, c, e, episodio, cultivo, fecha, fechaEf, turno, ePrev) {
  // ¿Hay evolución de ESTE turno? Se guarda antes de sustituir por la previa:
  // de aquí salen la franja de aviso y el contador «sin evolución» del
  // encabezado, que NO deben cambiar porque la ficha venga rellenada.
  const tieneEvo = !!e;
  const heredadoDe = (!e && ePrev) ? String(ePrev.TURNO_KEY || '') : '';
  if (!e && ePrev) e = ePrev;   // datos del turno anterior, avisados en la ficha
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
    if (esVerdadero(ev.TQT_OCURRIO)) eventos.push('🔪 TQT ' + f + (ev.TQT_HORA ? ' ' + ev.TQT_HORA : '') + (ev.TQT_TECNICA ? ' (' + String(ev.TQT_TECNICA).toLowerCase() + ')' : ''));
    if (esVerdadero(ev.DECAN_OCURRIO)) eventos.push('⭕ Decanulación ' + f + (ev.DECAN_HORA ? ' ' + ev.DECAN_HORA : '') + (esVerdadero(ev.DECAN_RECANUL) ? ' → recanulado' : ''));
    if (esVerdadero(ev.PROC_RCP)) {
      const ciclos = String(ev.PROC_RCP_CICLOS || '').trim();
      eventos.push('🚨 RCP ' + f + (ev.PROC_RCP_HORA ? ' ' + ev.PROC_RCP_HORA : '') +
        (ciclos ? ' · ' + ciclos + ' ciclo' + (ciclos === '1' ? '' : 's') : '') +
        (ev.PROC_RCP_DET ? ' — ' + ev.PROC_RCP_DET : ''));
    }
    if (esVerdadero(ev.PROC_PABELLON)) eventos.push('🏥 Traslado a pabellón ' + f);
    if (esVerdadero(ev.PROC_IMAGEN)) eventos.push('🩻 Traslado a imagenología ' + f);
    if (esVerdadero(ev.DESVINC_OCURRIO)) {
      const hrs = String(ev.DESVINC_HORAS || '').replace('.', ',');
      eventos.push('🔌 Desvinculación de VM ' + f + (ev.DESVINC_HORA ? ' ' + ev.DESVINC_HORA : '') +
        (ev.DESVINC_A ? ' → ' + ev.DESVINC_A : '') +
        (esVerdadero(ev.DESVINC_RECONEXION) ? (' · reconectado' + (hrs ? ' tras ' + hrs + ' h' : '')) : ' · SIN reconexión registrada'));
    }
    if (esVerdadero(ev.TOT_CAMBIO)) eventos.push('🔄 Cambio de tubo ' + f);
    if (esVerdadero(ev.TQT_CAMBIO)) eventos.push('🔄 Cambio de cánula ' + f);
    // Esta lista es de lo que OCURRIÓ en el turno: va el cambio de posición,
    // no el hecho de seguir en la misma (antes se repetía turno a turno).
    // Los episodios anteriores a la separación no traen el campo del evento:
    // ahí manda la posición, como siempre.
    const _pronoEv = (ev.RESP_PRONO_EVENTO === undefined || ev.RESP_PRONO_EVENTO === '')
      ? esVerdadero(ev.RESP_POS_PRONO) : esVerdadero(ev.RESP_PRONO_EVENTO);
    const _supEv = (ev.RESP_SUPINO_EVENTO === undefined || ev.RESP_SUPINO_EVENTO === '')
      ? esVerdadero(ev.RESP_POS_SUPINO) : esVerdadero(ev.RESP_SUPINO_EVENTO);
    if (_pronoEv) eventos.push('🔃 Prono ' + f + (ev.RESP_PRONO_HORA ? ' ' + ev.RESP_PRONO_HORA + ' hrs' : ''));
    if (_supEv) {
      const _ph = String(ev.PRONO_HORAS === 0 ? '0' : (ev.PRONO_HORAS || '')).replace('.', ',');
      eventos.push('🔃 Supino ' + f + (ev.RESP_SUPINO_HORA ? ' ' + ev.RESP_SUPINO_HORA + ' hrs' : '') +
        (_ph ? ' · tras ' + _ph + ' h en prono' : ''));
    }
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

  // ── Hito motor más alto del episodio (pedido de Diego, ago-2026) ──
  // Cada turno aporta su peldaño: manda el IMS si se registró; sin IMS se
  // traduce el nivel KTM del protocolo, que ya es una escalera de hitos
  // (1-2 en cama · 3 SBC · 4 bípedo · 5 marcha). La fecha es la ÚLTIMA vez
  // que se alcanzó ese peldaño (dice qué tan vigente es la capacidad).
  const hitoMotor = _hitoMotorEpisodio(episodio, dd);

  // ── Suspensión de sedación y de BNM (pedido de Diego, ago-2026): fecha de
  // la ÚLTIMA transición a «sin». Si después lo re-sedan, se recalcula sola —
  // un valor no vacío significa que HOY sigue suspendida. ──
  let sedSusp = '', bnmSusp = '', _sedAntes = false, _bnmAntes = false;
  episodio.forEach(function (ev) {
    const tipo = String(ev.SED_TIPO || '');
    if (tipo && tipo !== 'Sin sedación') { _sedAntes = true; sedSusp = ''; }
    else if (tipo === 'Sin sedación' && _sedAntes && !sedSusp) sedSusp = dd(ev.FECHA);
    if (esVerdadero(ev.SED_BNM)) { _bnmAntes = true; bnmSusp = ''; }
    else if (_bnmAntes && !bnmSusp) bnmSusp = dd(ev.FECHA);
  });

  // ── Fase clínica (chips de la barra): la del turno, con respaldo en cama ──
  const fases = (function () {
    try { const a = JSON.parse(String(val(e && e.FASE_JSON, c.FASE_JSON) || '[]')); return Array.isArray(a) ? a.filter(Boolean) : []; }
    catch (x) { return []; }
  })();

  // ── Dispositivos de circuito por vencer (solo VM) ──
  // SEMÁNTICA VALIDADA POR DIEGO (ago-2026): etiqueta = día 0 y el cambio se
  // hace en el TURNO NOCHE del día etiqueta+frecuencia. «cambiar» = esta
  // noche; «vencido» solo si amaneció después de esa noche sin cambio. Se
  // mide contra la fecha del TURNO (no la efectiva: la noche del día D ES la
  // que cambia lo del día D). Viaja además la fecha EXACTA del cambio, que es
  // lo que la hoja impresa debe mostrar en vez de contadores de días.
  const disp = [];
  if (String(c.SOPORTE) === 'VM') {
    [['HME', c.DISP_HME_FECHA, 2], ['HEPA', c.DISP_HEPA_FECHA, 3], ['T.Care', c.DISP_TC_FECHA, 3]].forEach(function (d) {
      const iso = _statISO(d[1]); if (!iso) return;
      const dias = diasEntre(iso, fecha);
      const cambio = _sumarDiasISO(iso, d[2]);
      disp.push({ n: d[0], dia: dias + 1, dur: d[2], cambio: dd(cambio),
                  estado: dias < d[2] ? 'ok' : (dias === d[2] ? 'cambiar' : 'vencido') });
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
  if (!tieneEvo) alertas.push('Sin evolución de este turno');
  // Pronación EN CURSO: el ciclo puede llevar días y cruzar varios turnos, así
  // que el equipo que entra necesita saber desde cuándo va — no basta con ver
  // «Prono» en la posición del último turno.
  let pronoTS = '';
  episodio.forEach(ev2 => {
    if (esVerdadero(ev2.RESP_PRONO_EVENTO) && ev2.PRONO_INICIO_TS) pronoTS = String(ev2.PRONO_INICIO_TS);
    if (esVerdadero(ev2.RESP_SUPINO_EVENTO)) pronoTS = '';
  });
  let prono = null;
  if (pronoTS) {
    const hEnt = _horasEntreTS(pronoTS, _tsEventoTurno(fecha, turno || (e && e.TURNO) || '', ''));
    // Chip propio, NO alerta: estar en prono es un estado del tratamiento, no
    // un aviso. Sin umbral inventado — las sesiones pueden pasar las 24 h.
    prono = { desde: pronoTS, horas: hEnt };
  }

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
    tieneEvo: tieneEvo,
    heredadoDe: heredadoDe,   // turnoKey del que se copiaron los datos ('' si es de este turno)
    nombre: val(e && e.PAC_NOMBRE, c.NOMBRE),
    edad: val(e && e.PAC_EDAD, c.EDAD),
    sexo: val(e && e.PAC_SEXO, c.SEXO),
    diagnostico: val(e && e.PAC_DIAGNOSTICO, c.DIAGNOSTICO),
    diasEstadia: diasEst, diasVM: diasVM,
    // Fecha de ingreso (ago-2026): la pidió Diego para la cabecera de la
    // versión IMPRESA, donde va junto al diagnóstico llenando el blanco que
    // sobraba a la derecha. En pantalla no se muestra (basta el «Nd UCI»).
    fechaIngreso: String(c.FECHA_INGRESO || '').slice(0, 10),
    viaAerea: val(e && e.VENT_VIA_AEREA, c.VIA_AEREA),
    // N° de tubo/cánula y fijación (opción A de Diego, ago-2026): al recibir
    // el turno sirven para verificar la vía aérea sin abrir el panel.
    totN: val(e && e.VENT_TOT_NUM, c.TOT_NUMERO),
    totCm: val(e && e.VENT_TOT_CM, c.TOT_CM_LABIO),
    tqtN: val(e && e.VENT_TQT_CALIBRE, c.TQT_CALIBRE),
    soporte: val(e && e.VENT_SOPORTE, c.SOPORTE),
    modo: val(e && e.VENT_MODO, c.MODO),
    params: e ? _entParams(e) : '',
    mec: e ? _entMec(e) : '',
    gcs: e ? val(e.SED_GCS_TOT) : '',
    gcsOVM: (e && val(e.SED_GCS_O) !== '' && val(e.SED_GCS_V) !== '' && val(e.SED_GCS_M) !== '')
      ? ('O' + e.SED_GCS_O + '·V' + e.SED_GCS_V + '·M' + e.SED_GCS_M) : '',
    pic: e ? val(e.HEMO_PIC) : '', ppc: e ? val(e.HEMO_PPC) : '',
    fases: fases,
    hitoMotor: hitoMotor,
    sedSusp: sedSusp, bnmSusp: bnmSusp,
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
    prono: prono,
    icuaw: icuaw,
    candidatoPve: candidatoPve,
    pveRacha: pveRacha,
    // El RESULTADO del cultivo no viajaba a la entrega (reporte de Álvaro):
    // solo salía el nombre y la fecha. Se toma el más reciente del episodio.
    ultimoCultivo: cultivo ? { fecha: dd(cultivo.iso), nombre: cultivo.nombre, micro: val(c.AISL_MICRO),
      resultado: (function () {
        const filas = (episodio || []).slice()
          .sort(function (a, b) { return String(b.TURNO_KEY).localeCompare(String(a.TURNO_KEY)); });
        if (e && String(e.EX_CULT_RESULTADO || '').trim()) return String(e.EX_CULT_RESULTADO).trim();
        for (let i = 0; i < filas.length; i++) {
          const r = String(filas[i].EX_CULT_RESULTADO || '').trim();
          if (r) return r;
        }
        return '';
      })() } : null,
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
  // Litros y flujo POR SOPORTE (decisión de Diego, ago-2026): los litros solo
  // aportan con naricera o mascarilla simple, el flujo solo con CNAF, y la
  // Venturi (MMV) va SOLO con su FiO₂. En VM ninguno de los dos dice nada y
  // arrastrarlos ensuciaba la línea con restos del soporte anterior.
  const sop = String(e.VENT_SOPORTE || ''), modo = String(e.VENT_MODO || '');
  const esCNAF = sop === 'CNAF' || /^(CNAF|OAF\/CTAF)$/i.test(modo);
  if (/^(NRC|Naricera(-NRC)?|Mascarilla)$/i.test(modo)) push('L', 'VENT_LITROS');
  if (esCNAF) push('Flujo', 'VENT_FLUJO');
  return out.join(' · ');
}

/**
 * Mecánica medida y derivados que cambian conductas (opción A de Diego,
 * ago-2026): Pmax · Ppl · DP · Cest · PaFi. AutoPEEP, Ti e I:E quedan en el
 * historial — la entrega es la foto, no la bitácora.
 */
function _entMec(e) {
  const out = [];
  const push = function (lbl, key) {
    const x = e[key];
    if (x !== '' && x !== null && x !== undefined) out.push(lbl + ' ' + x);
  };
  push('Pmax', 'VENT_PMAX'); push('Ppl', 'VENT_PPL');
  push('DP', 'CALC_DP'); push('Cest', 'CALC_CESR'); push('PaFi', 'VENT_PAFI');
  return out.join(' · ');
}

/**
 * Hito motor más alto del episodio. Peldaños: 1 en cama · 2 SBC · 3 bípedo ·
 * 4 marcha. El IMS (0-10) manda cuando se registró; sin IMS se traduce el
 * nivel KTM (1-2 → en cama, 3 → SBC, 4 → bípedo, 5 → marcha). La fecha (y el
 * IMS mostrado) son de la ÚLTIMA vez que se alcanzó el peldaño máximo.
 */
function _hitoMotorEpisodio(episodio, dd) {
  const LBL = ['', 'en cama', 'SBC', 'bípedo', 'marcha'];
  const rankIMS = function (n) { return n >= 6 ? 4 : n >= 4 ? 3 : n >= 3 ? 2 : 1; };
  const rankKTM = function (n) { return n >= 5 ? 4 : n >= 4 ? 3 : n >= 3 ? 2 : 1; };
  let max = 0, fechaMax = '', imsMax = '';
  (episodio || []).forEach(function (ev) {
    const imsRaw = String(ev.EVAL_IMS === 0 ? '0' : (ev.EVAL_IMS || '')).trim();
    const ims = imsRaw === '' ? NaN : parseInt(imsRaw, 10);
    const niv = parseInt(ev.KTM_NIVEL_KTR, 10);
    let r = 0, imsVal = '';
    if (!isNaN(ims)) { r = rankIMS(ims); imsVal = imsRaw; }
    else if (esVerdadero(ev.KTM_REALIZADA) && !isNaN(niv)) r = rankKTM(niv);
    if (r && r >= max) { max = r; fechaMax = dd(ev.FECHA); imsMax = imsVal; }
  });
  return max ? { nivel: LBL[max], ims: imsMax, fecha: fechaMax } : null;
}

/** Guarda una entrega emitida como historial (hoja ENTREGAS_TURNO). */
function guardarEntregaTurno(payload, ctx) {
  return conLock(function () {
    try {
      const r = payload.resumen || {};
      const fila = {
        // El campo se llama ID en el esquema: con ID_ENTREGA la columna
        // quedaba vacía en silencio (el upsert descarta claves desconocidas).
        ID: 'ENT_' + Date.now(),
        TIMESTAMP: ahoraTS(),
        FECHA: payload.fecha || '',
        TURNO: payload.turno || '',
        KINE_ENTREGA: payload.kineEntrega || (ctx && ctx.firma) || '',
        KINE_RECIBE: payload.kineRecibe || '',
        AUTOR_EMAIL: (ctx && ctx.email) || '',
        CAMAS_N: (payload.idCamas || []).length,
        OCUPADAS: r.ocupadas || '',
        EN_VM: r.enVM || '',
        CAMAS_IDS: (payload.idCamas || []).join(','),
        NOTAS: payload.notas || '',
        SNAPSHOT_JSON: String(payload.snapshotJson || '').slice(0, 45000),
      };
      repoInsertar('ENTREGAS_TURNO', fila);
      return ok({ id: fila.ID, entidad: 'ENTREGAS_TURNO' });
    } catch (e) { return err('guardarEntregaTurno: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Historial de entregas (cabeceras, sin el snapshot pesado). */
function obtenerEntregasTurno(limite) {
  try {
    const rows = repoLeerTodos('ENTREGAS_TURNO').map(function (v) {
      return { id: v.ID, timestamp: v.TIMESTAMP, fecha: v.FECHA, turno: v.TURNO,
               kineEntrega: v.KINE_ENTREGA, kineRecibe: v.KINE_RECIBE, camasN: v.CAMAS_N,
               ocupadas: v.OCUPADAS, enVM: v.EN_VM, camasIds: v.CAMAS_IDS, notas: v.NOTAS };
    });
    rows.reverse();
    return ok(limite ? rows.slice(0, limite) : rows);
  } catch (e) { return err('obtenerEntregasTurno: ' + e.message, ERR.INTERNO, e); }
}
