/**
 * svc_evoluciones.gs — Guardado y lectura de evoluciones.
 * Corazón clínico: una fila por turno, con cálculos, texto, sincronización de la
 * cama, procedimientos y reintubación. La REPLICACIÓN turno a turno (bajar el roce)
 * se sirve con obtenerEvolucionPrevia().
 */

// ═══ ESCRITURA ════════════════════════════════════════════
function guardarEvolucion(datos, ctx) {
  const errs = validarPayloadEvolucion(datos);
  if (errs.length) return err('Validación: ' + errs.join('; '), ERR.VALIDACION);
  ctx = ctx || {};

  return conLock(() => {
    try {
      const idCama = String(datos.ID_CAMA || datos.idCama || '');
      const turnoKey = String(datos.TURNO_KEY || datos.turnoKey || '');
      if (!idCama || !turnoKey) return err('Faltan ID_CAMA o TURNO_KEY.', ERR.VALIDACION);

      const idEvolucion = 'CAMA_' + idCama + '_' + turnoKey;
      const p = turnoKey.split('-');
      const fecha = p[0] + '-' + p[1] + '-' + p[2];
      const turno = p[3] || 'Dia';
      // El generador de texto y los cálculos leen FECHA/TURNO del payload:
      // fijarlos ANTES (el cliente solo envía TURNO_KEY). Sin esto, las
      // evoluciones de noche salían tituladas "TURNO DÍA".
      datos.FECHA = fecha;
      datos.TURNO = turno;

      const rc = obtenerCama(idCama);
      const cama = rc.ok ? rc.data : {};

      // PATIENT_ID — ruta única: se toma de la cama; si no existe (episodio sin
      // ingreso formal) se genera UNA vez y se fija en la cama.
      let patientId = datos.PATIENT_ID || cama.PATIENT_ID || '';
      if (!patientId) {
        patientId = Utilities.getUuid();
        repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, { PATIENT_ID: patientId });
      }
      datos.PATIENT_ID = patientId;

      // COD_PACIENTE — de la cama; si falta, se genera desde el nombre.
      let cod = datos.PAC_COD || cama.COD_PACIENTE || '';
      if (!cod && datos.PAC_NOMBRE) cod = _codUnico(generarCodPaciente(datos.PAC_NOMBRE, datos.PAC_EDAD, fecha));
      datos.PAC_COD = cod;

      // Peso ideal si falta
      if (!datos.PAC_PESO_IDEAL || parseFloat(datos.PAC_PESO_IDEAL) <= 0) {
        datos.PAC_PESO_IDEAL = calcularPI(datos.PAC_SEXO, datos.PAC_TALLA) || '';
      }
      // Cálculos respiratorios
      Object.assign(datos, calcularRespiratorio(datos));

      // Días de estadía / VM / VA
      if (cama.FECHA_INGRESO) {
        datos.DIA_ESTADIA = diasEntre(cama.FECHA_INGRESO, fecha);
        datos.DIAS_VM = (datos.VENT_SOPORTE === 'VM') ? diasEntre(cama.FECHA_INICIO_SOPORTE, fecha) : 0;
        datos.DIAS_VA = (datos.VENT_VIA_AEREA && datos.VENT_VIA_AEREA !== 'Natural') ? diasEntre(cama.FECHA_INICIO_VA, fecha) : 0;
      }

      // BDT (test de azul) — repetible: cada resultado marcado en el turno se
      // acumula en BDT_JSON del episodio y BDT_ULTIMO refleja el más reciente.
      const bdtRes = esVerdadero(datos.EVAL_T_BDT_POS) ? '+' : (esVerdadero(datos.EVAL_T_BDT_NEG) ? '-' : '');
      if (bdtRes) {
        // Continuidad del histórico: fila de este turno (si se edita) o turno previo.
        let base = repoBuscarPorId('EVOLUCIONES', 'ID_EVOLUCION', idEvolucion);
        if (!base || !base.BDT_JSON) {
          const rp = obtenerEvolucionPrevia(idCama, turnoKey);
          if (rp.ok && rp.data) base = rp.data;
        }
        let hist = [];
        try { hist = JSON.parse((base && base.BDT_JSON) || '[]') || []; } catch (e) {}
        // idempotente por turno: reemplaza el registro de este mismo turnoKey
        hist = hist.filter(function (h) { return h && h.turnoKey !== turnoKey; });
        hist.push({ turnoKey: turnoKey, fecha: fecha, resultado: bdtRes });
        datos.BDT_JSON = JSON.stringify(hist);
        datos.BDT_ULTIMO = bdtRes + ' (' + fecha + ')';
      }

      // Texto clínico
      datos.TEXTO_GENERADO = generarTextoEvolucion(datos);

      // Procedimientos del turno
      let procs = [];
      if (datos.PROC_JSON) { try { procs = JSON.parse(datos.PROC_JSON) || []; } catch (e) {} }
      if (!Array.isArray(procs)) procs = [];
      if (datos.PROC_RESUMEN === undefined) datos.PROC_RESUMEN = procs.join(', ');
      if (datos.PROC_CANTIDAD === undefined) datos.PROC_CANTIDAD = procs.length;

      // Construir la fila de evolución (metadatos e identidad mandan)
      const evo = Object.assign({}, datos, {
        ID_EVOLUCION: idEvolucion, ID_CAMA: idCama, PATIENT_ID: patientId, COD_PACIENTE: cod,
        TURNO_KEY: turnoKey, FECHA: fecha, TURNO: turno, TIMESTAMP: ahoraTS(),
        AUTOR_EMAIL: ctx.email || '', PLAN_FIRMA_KINE: datos.PLAN_FIRMA_KINE || ctx.firma || '',
      });

      const accion = repoUpsert('EVOLUCIONES', 'ID_EVOLUCION', idEvolucion, evo);
      const esNuevo = (accion === 'crear');

      // Sincronizar el snapshot de la cama
      _syncCamaDesdeEvolucion(idCama, cama, evo, turno, turnoKey, fecha, patientId);

      // Hito de ingreso — solo en la primera escritura
      if (esVerdadero(evo.ES_INGRESO) && esNuevo) {
        _agregarHitoInterno({
          idCama, patientId, fecha, turno, tipo: 'ingreso',
          texto: 'Ingreso UCI. Dx: ' + (evo.PAC_DIAGNOSTICO || evo.PAC_NOMBRE || 'Sin especificar'),
          autor: evo.PLAN_FIRMA_KINE, autorEmail: ctx.email || '',
        });
      }

      // Procedimientos (filas) + hitos automáticos
      _guardarProcedimientosInterno(idEvolucion, idCama, patientId, fecha, turno, procs, ctx.email);
      _crearHitosDesdeProcedimientos(idCama, fecha, turno, procs, evo.PLAN_FIRMA_KINE, ctx.email);

      // Reintubación desde el bloque EXT_*
      if (esVerdadero(evo.EXT_REINTUB)) {
        try { _registrarReintubacion(evo, idCama, idEvolucion, fecha, turno, ctx); }
        catch (e) { console.warn('_registrarReintubacion:', e.message); }
      }

      SpreadsheetApp.flush();
      return ok({ idEvolucion, idCama, patientId, turnoKey, accion: esNuevo ? 'crear' : 'actualizar', entidad: 'EVOLUCIONES' });
    } catch (e) { return err('guardarEvolucion: ' + e.message, ERR.INTERNO, e); }
  });
}

// Sincroniza CAMAS_ESTADO con el último turno (datos del paciente + snapshot por turno).
function _syncCamaDesdeEvolucion(idCama, cama, evo, turno, turnoKey, fecha, patientId) {
  const esIngreso = esVerdadero(evo.ES_INGRESO);
  const val = (a, b) => (a !== undefined && a !== null && a !== '') ? a : (b || '');

  // Fecha de inicio de soporte: se reinicia si cambia el tipo (Ambiente↔VM↔VNI).
  const sopNew = evo.VENT_SOPORTE || cama.SOPORTE || 'Ambiente';
  const sopAnt = cama.SOPORTE || '';
  const esVent = (sopNew === 'VM' || sopNew === 'VNI');
  let fechaSoporte;
  if (!esVent) fechaSoporte = cama.FECHA_INICIO_SOPORTE || '';
  else if (sopNew !== sopAnt || !cama.FECHA_INICIO_SOPORTE) fechaSoporte = fecha;
  else fechaSoporte = cama.FECHA_INICIO_SOPORTE;

  // Fecha de inicio de vía aérea: se reinicia si cambia el TIPO de vía aérea
  // (condicionante v1 #2 — "cambio de vía aérea recalcula días"). "Vía externa
  // previa" (condicionante #3) pliega los días previos hacia atrás en el ancla,
  // para que el contador arranque contando esos días ya transcurridos.
  const vaNew = evo.VENT_VIA_AEREA || cama.VIA_AEREA || 'Natural';
  const vaAnt = cama.VIA_AEREA || '';
  const esVA = (vaNew !== 'Natural');
  let fechaVA;
  if (!esVA) {
    fechaVA = '';
  } else if (vaNew !== vaAnt || !cama.FECHA_INICIO_VA) {
    const diasPrev = parseInt(evo.VA_EXTERNO_DIAS) || 0;
    fechaVA = (esVerdadero(evo.VA_EXTERNO) && diasPrev > 0) ? _restarDias(fecha, diasPrev) : fecha;
  } else {
    fechaVA = cama.FECHA_INICIO_VA;
  }

  const campos = {
    OCUPADA: true, STATUS_CAMA: 'Ocupada', PATIENT_ID: patientId, COD_PACIENTE: val(evo.COD_PACIENTE, cama.COD_PACIENTE),
    NOMBRE: val(evo.PAC_NOMBRE, cama.NOMBRE), EDAD: val(evo.PAC_EDAD, cama.EDAD), SEXO: val(evo.PAC_SEXO, cama.SEXO),
    TALLA_CM: val(evo.PAC_TALLA, cama.TALLA_CM), PESO_IDEAL_KG: val(evo.PAC_PESO_IDEAL, cama.PESO_IDEAL_KG),
    BARTHEL: val(evo.PAC_BARTHEL, cama.BARTHEL), ECF: val(evo.PAC_ECF, cama.ECF),
    DIAGNOSTICO: val(evo.PAC_DIAGNOSTICO, cama.DIAGNOSTICO), DIAG_REM: val(evo.PAC_DIAG_REM, cama.DIAG_REM),
    CHARLSON: val(evo.PAC_CHARLSON, cama.CHARLSON), INGRESO_TIPO: val(evo.PAC_INGRESO_TIPO, cama.INGRESO_TIPO),
    AISLAMIENTO: esVerdadero(evo.PAC_AISLAMIENTO), AISL_MICRO: val(evo.PAC_AISL_MICRO, cama.AISL_MICRO),
    VIA_AEREA: val(evo.VENT_VIA_AEREA, cama.VIA_AEREA) || 'Natural',
    TOT_NUMERO: val(evo.VENT_TOT_NUM, cama.TOT_NUMERO), TOT_CM_LABIO: val(evo.VENT_TOT_CM, cama.TOT_CM_LABIO),
    TQT_TIPO: val(evo.VENT_TQT_TIPO, cama.TQT_TIPO), SOPORTE: sopNew, MODO: val(evo.VENT_MODO, cama.MODO),
    FASE_JSON: val(evo.FASE_JSON, cama.FASE_JSON),
    KTM_NIVEL: esVerdadero(evo.KTM_REALIZADA) ? (evo.KTM_NIVEL_KTR || '') : (turno === 'Noche' ? (cama.KTM_NIVEL || '') : ''),
    KTM_SUSP: esVerdadero(evo.KTM_SUSPENDIDA),
    FIRMA_KINE: val(evo.PLAN_FIRMA_KINE, cama.FIRMA_KINE), AUTOR_EMAIL: evo.AUTOR_EMAIL || '',
    ULTIMO_TURNO_KEY: turnoKey,
    FECHA_INGRESO: cama.FECHA_INGRESO || (esIngreso ? fecha : ''),
    FECHA_INICIO_VA: fechaVA,
    FECHA_INICIO_SOPORTE: fechaSoporte,
  };

  // Snapshot por turno (para la tabla de Registro Diario)
  const ktrCant = parseInt(evo.RESP_KTR_CANT) || 0;
  const ktmTurno = esVerdadero(evo.KTM_REALIZADA) ? (evo.KTM_NIVEL_KTR || '') : (esVerdadero(evo.KTM_SUSPENDIDA) ? 'C' : '');
  const procStr = evo.PROC_RESUMEN || '';
  const firmaT = evo.PLAN_FIRMA_KINE || '';
  if (turno === 'Dia') {
    campos.TEXTO_EVO_DIA = evo.TEXTO_GENERADO || ''; campos.KTR_DIA = ktrCant; campos.KTM_DIA = ktmTurno;
    campos.PROC_DIA = procStr; campos.FIRMA_DIA = firmaT; campos.KEY_DIA = turnoKey;
  } else {
    campos.TEXTO_EVO_NOCHE = evo.TEXTO_GENERADO || ''; campos.KTR_NOCHE = ktrCant;
    campos.PROC_NOCHE = procStr; campos.FIRMA_NOCHE = firmaT; campos.KEY_NOCHE = turnoKey;
  }
  repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, campos);
}

// Registra un evento en la hoja REINTUBACIONES (idempotente por ID_EVOLUCION).
function _registrarReintubacion(evo, idCama, idEvolucion, fecha, turno, ctx) {
  const idReintub = idEvolucion + '_REINTUB';
  const fila = {
    ID_REINTUB: idReintub, PATIENT_ID: evo.PATIENT_ID || '', TIMESTAMP: ahoraTS(), FECHA: fecha, TURNO: turno,
    ID_CAMA: String(idCama), ID_EVOLUCION: idEvolucion, NOMBRE: evo.PAC_NOMBRE || '', COD_PACIENTE: evo.PAC_COD || '',
    DIAGNOSTICO: evo.PAC_DIAGNOSTICO || '', TIPO_DESVINCULACION: evo.EXT_TIPO || '', MOTIVO: evo.EXT_REINTUB_RAZ || '',
    SOPORTE_PREVIO: evo.REINTUB_SOP_PREV || evo.EXT_PE_SOP || '',
    TIEMPO_EXTUBADO: _tiempoExtubado(evo, idCama, fecha),
    HORA_REINTUBACION: evo.REINTUB_HORA || evo.EXT_HORA || '',
    KINESIOLOGO: evo.PLAN_FIRMA_KINE || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
  };
  repoUpsert('REINTUBACIONES', 'ID_REINTUB', idReintub, fila);
}

/**
 * Horas entre la extubación previa del episodio (EXT_TS) y la reintubación.
 * Mismo turno: EXT_TS viene en el propio payload; turno siguiente: se busca
 * el EXT_TS más reciente del episodio. Devuelve '' si no es computable.
 */
function _tiempoExtubado(evo, idCama, fecha) {
  try {
    const horaRe = evo.REINTUB_HORA || evo.EXT_HORA || '';
    if (!horaRe) return '';
    let extTs = evo.EXT_TS || '';
    if (!extTs) {
      const evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama))
        .filter(function (e) { return e.EXT_TS && String(e.PATIENT_ID) === String(evo.PATIENT_ID || ''); });
      evos.sort(function (a, b) { return String(b.TURNO_KEY).localeCompare(String(a.TURNO_KEY)); });
      if (evos.length) extTs = evos[0].EXT_TS;
    }
    if (!extTs) return '';
    let t0;
    try { t0 = new Date(JSON.parse(extTs).ts); } catch (e) { return ''; }
    const p = String(horaRe).split(':');
    const t1 = new Date(fecha + 'T' + ('0' + p[0]).slice(-2) + ':' + ('0' + (p[1] || '0')).slice(-2) + ':00');
    let horas = (t1 - t0) / 3600000;
    if (isNaN(horas)) return '';
    if (horas < 0) horas += 24; // reintubación cruzando medianoche
    return (Math.round(horas * 10) / 10) + ' h';
  } catch (e) { return ''; }
}

// ═══ LECTURA ══════════════════════════════════════════════
function obtenerEvolucion(idCama, turnoKey) {
  try {
    const id = 'CAMA_' + idCama + '_' + turnoKey;
    return ok(repoBuscarPorId('EVOLUCIONES', 'ID_EVOLUCION', id));
  } catch (e) { return err('obtenerEvolucion: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Evolución inmediatamente ANTERIOR a un turno (para replicar y bajar el roce).
 * Como turnoKey = "YYYY-MM-DD-Dia|Noche", el orden alfabético coincide con el
 * cronológico (Dia < Noche). Devuelve la más reciente estrictamente anterior.
 */
function obtenerEvolucionPrevia(idCama, turnoKey) {
  try {
    const evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    const objetivo = String(turnoKey);
    let mejor = null, mejorKey = '';
    evos.forEach(e => {
      const k = String(e.TURNO_KEY || '');
      if (k && k < objetivo && k > mejorKey) { mejor = e; mejorKey = k; }
    });
    return ok(mejor);
  } catch (e) { return err('obtenerEvolucionPrevia: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Turno actual + previa en UNA llamada (evita 2 round-trips seriales al abrir el panel).
 */
function obtenerEvoTurno(idCama, turnoKey) {
  try {
    const actual = repoBuscarPorId('EVOLUCIONES', 'ID_EVOLUCION', 'CAMA_' + idCama + '_' + turnoKey);
    let previa = null;
    if (!actual) {
      const r = obtenerEvolucionPrevia(idCama, turnoKey);
      previa = (r.ok && r.data) ? r.data : null;
    }
    return ok({ actual: actual, previa: previa });
  } catch (e) { return err('obtenerEvoTurno: ' + e.message, ERR.INTERNO, e); }
}

function obtenerEvolucionesRecientes(idCama, limite) {
  try {
    const evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    evos.sort((a, b) => String(b.TURNO_KEY).localeCompare(String(a.TURNO_KEY)));
    return ok(limite ? evos.slice(0, limite) : evos);
  } catch (e) { return err('obtenerEvolucionesRecientes: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Evoluciones registradas en una fecha (ambos turnos), versión mínima.
 * Alimenta los dots verdes del grid (EVO_SET) y la vista retrospectiva.
 * @param {string} fecha  'yyyy-MM-dd'
 */
function obtenerEvosDelDia(fecha) {
  try {
    const f = String(fecha || hoyISO()).slice(0, 10);
    const evos = repoLeerTodos('EVOLUCIONES')
      .filter(function (e) { return String(e.TURNO_KEY).indexOf(f) === 0; })
      .map(function (e) { return { ID_CAMA: String(e.ID_CAMA), TURNO_KEY: String(e.TURNO_KEY) }; });
    return ok(evos);
  } catch (e) { return err('obtenerEvosDelDia: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Historial de un episodio: hitos + evoluciones (activas y archivadas), por PATIENT_ID.
 */
function obtenerHistorialPaciente(idCama, patientId) {
  try {
    if (!patientId) {
      const rc = obtenerCama(idCama);
      if (rc.ok && rc.data.PATIENT_ID) patientId = rc.data.PATIENT_ID;
    }
    let hitos = patientId
      ? repoLeerTodos('TIMELINE', 'PATIENT_ID', patientId)
      : repoLeerTodos('TIMELINE', 'ID_CAMA', String(idCama));
    hitos.sort((a, b) => String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)));

    let evos = [];
    if (patientId) {
      evos = repoLeerTodos('EVOLUCIONES', 'PATIENT_ID', patientId)
        .concat(repoLeerTodos('EVOLUCIONES_ARCHIVO', 'PATIENT_ID', patientId));
    } else {
      evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    }
    evos.sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));

    return ok({ hitos, evoluciones: evos });
  } catch (e) { return err('obtenerHistorialPaciente: ' + e.message, ERR.INTERNO, e); }
}
