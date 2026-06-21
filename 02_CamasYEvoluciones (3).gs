/**
 * ============================================================
 *  02_CamasYEvoluciones.gs — CRUD principal de datos clínicos
 *  RCE KINE UCIA | GAS-v1.1 (Fase 1)
 *
 *  CAMBIOS vs v1.0:
 *  ★ Fix deadlock: darAltaPaciente → _limpiarCamaInternoSinLock
 *  ★ Fix deadlock: guardarEvolucion → _agregarHitoInterno (sin lock)
 *  ★ Fix deadlock: guardarEvolucion → _guardarProcedimientosInterno (sin lock)
 *  ★ Batch writes: _actualizarCamaInterno con UN setValues() en vez de N setValue()
 *  ★ Batch writes: ingresarPaciente / _limpiarCamaInternoSinLock
 *  ★ Validación de payload antes de escribir
 *
 *  REGLA DE ORO:
 *  - Las funciones del dispatcher (públicas) envuelven en conLock().
 *  - Adentro SOLO se llaman versiones _interno SIN lock.
 *  - Si necesitas escribir desde otra función con lock → usa _interno.
 * ============================================================
 */
 
// ═══════════════════════════════════════════════════════════
//  CAMAS — LECTURA
// ═══════════════════════════════════════════════════════════
 
function obtenerTodasLasCamas() {
  try {
    const h      = obtenerHoja(SH.CAMAS);
    const ultima = h.getLastRow();
    if (ultima < CAM_FILA_DATOS) return ok([]);
 
    const datos = h.getRange(CAM_FILA_DATOS, 1, ultima - CAM_FILA_DATOS + 1, CAM_TOTAL_COLS).getValues();
    const camas = datos.map(fila => filaAObjeto(fila, COL_CAM));
 
    // Mapa de evaluaciones funcionales (MRC-SS / FSS-ICU / cooperación) por cama,
    // a partir de la última evolución registrada. Una sola lectura de EVOLUCIONES.
    const evalPorCama = _evalFuncionalPorCama();
 
    const hoy = fechaHoyISO();
    camas.forEach(c => {
      if (parseBool(c.OCUPADA)) {
        c.DIA_ESTADIA  = calcularDias(c.FECHA_INGRESO, hoy);
        c.DIAS_VM      = (c.SOPORTE === 'VM') ? calcularDias(c.FECHA_INICIO_SOPORTE, hoy) : 0;
        c.DIAS_VA      = (c.VIA_AEREA && c.VIA_AEREA !== 'Natural')
                          ? calcularDias(c.FECHA_INICIO_VA, hoy) : 0;
        c.OCUPADA      = true;
        const ev = evalPorCama[String(c.ID_CAMA)];
        if (ev) {
          c.EVAL_COOP      = ev.coop;
          c.EVAL_MRC       = ev.mrc;       c.EVAL_MRC_FECHA = ev.mrcFecha;
          c.EVAL_FSS       = ev.fss;       c.EVAL_FSS_FECHA = ev.fssFecha;
        }
        try { c.TIMELINE = c.TIMELINE_JSON ? JSON.parse(c.TIMELINE_JSON) : []; }
        catch(e) { c.TIMELINE = []; }
      } else {
        c.OCUPADA = false;
        c.DIA_ESTADIA = 0; c.DIAS_VM = 0; c.DIAS_VA = 0; c.TIMELINE = [];
      }
      delete c.JSON_BACKUP; // no exponer al cliente
    });
 
    return ok(camas);
  } catch (e) { return err('obtenerTodasLasCamas: ' + e.message, e); }
}
 
function obtenerCama(idCama) {
  try {
    const h    = obtenerHoja(SH.CAMAS);
    const fila = buscarFila(h, COL_CAM.ID_CAMA, String(idCama), CAM_FILA_DATOS);
    if (fila === -1) return err(`Cama "${idCama}" no encontrada.`);
    const vals = h.getRange(fila, 1, 1, CAM_TOTAL_COLS).getValues()[0];
    const cama = filaAObjeto(vals, COL_CAM);
    const hoy  = fechaHoyISO();
    if (parseBool(cama.OCUPADA)) {
      cama.DIA_ESTADIA = calcularDias(cama.FECHA_INGRESO, hoy);
      cama.DIAS_VM     = (cama.SOPORTE === 'VM') ? calcularDias(cama.FECHA_INICIO_SOPORTE, hoy) : 0;
      cama.DIAS_VA     = (cama.VIA_AEREA && cama.VIA_AEREA !== 'Natural')
                          ? calcularDias(cama.FECHA_INICIO_VA, hoy) : 0;
      cama.OCUPADA     = true;
    } else { cama.OCUPADA = false; }
    try { cama.TIMELINE = cama.TIMELINE_JSON ? JSON.parse(cama.TIMELINE_JSON) : []; }
    catch(e) { cama.TIMELINE = []; }
    return ok(cama);
  } catch (e) { return err('obtenerCama: ' + e.message, e); }
}
 
// ═══════════════════════════════════════════════════════════
//  CAMAS — ESCRITURA (con patrón _interno sin lock)
// ═══════════════════════════════════════════════════════════
 
/**
 * ★ MEJORADO ★ — versión interna SIN lock, con batch write.
 * Lee la fila entera UNA vez, muta en memoria, escribe UNA vez.
 * Llama esta cuando ya tienes el lock (desde guardarEvolucion, darAlta, etc).
 */
function _actualizarCamaInterno(idCama, campos) {
  try {
    const h    = obtenerHoja(SH.CAMAS);
    const fila = buscarFila(h, COL_CAM.ID_CAMA, String(idCama), CAM_FILA_DATOS);
    if (fila === -1) {
      console.warn(`_actualizarCamaInterno: cama ${idCama} no encontrada`);
      return;
    }
    // Leer fila completa
    const filaActual = h.getRange(fila, 1, 1, CAM_TOTAL_COLS).getValues()[0];
    // Mutar en memoria
    Object.entries(campos).forEach(([key, val]) => {
      if (COL_CAM[key]) {
        filaActual[COL_CAM[key] - 1] = (val === undefined || val === null) ? '' : val;
      }
    });
    // Escribir fila completa (1 sola I/O)
    h.getRange(fila, 1, 1, CAM_TOTAL_COLS).setValues([filaActual]);
  } catch (e) {
    console.warn('_actualizarCamaInterno:', e.message);
  }
}
 
/** Versión PÚBLICA con lock — usar desde el dispatcher. */
function actualizarCama(idCama, campos) {
  return conLock(() => {
    try {
      _actualizarCamaInterno(idCama, campos);
      SpreadsheetApp.flush();
      return ok({ idCama, camposActualizados: Object.keys(campos).length });
    } catch (e) {
      return err('actualizarCama: ' + e.message, e);
    }
  });
}
 
// ═══════════════════════════════════════════════════════════
//  INGRESO / ALTA / LIMPIEZA
// ═══════════════════════════════════════════════════════════
 
function ingresarPaciente(datos) {
  // Validar ANTES de tomar el lock
  const errores = validarPayloadIngreso(datos);
  if (errores.length) return err('Validación: ' + errores.join('; '));
 
  return conLock(() => {
    try {
      const h    = obtenerHoja(SH.CAMAS);
      const fila = buscarFila(h, COL_CAM.ID_CAMA, String(datos.idCama), CAM_FILA_DATOS);
      if (fila === -1) return err(`Cama "${datos.idCama}" no encontrada.`);
 
      const fecha    = datos.fechaIngreso || fechaHoyISO();
      const pi       = calcularPI(datos.sexo, datos.talla);
      const esTOT    = datos.viaAerea === 'TOT';
      const esTQT    = datos.viaAerea === 'TQT';
      const tieneVA  = esTOT || esTQT || datos.viaAerea === 'Full Face' || datos.viaAerea === 'Oronasal';
      const tieneVM  = datos.soporte === 'VM' || datos.soporte === 'VNI';
 
      const campos = {
        OCUPADA:              true,
        STATUS_CAMA:          'Ocupada',
        NOMBRE:               datos.nombre       || '',
        RUT:                  datos.rut          || '',
        EDAD:                 datos.edad         || '',
        SEXO:                 datos.sexo         || '',
        TALLA_CM:             datos.talla        || '',
        PESO_IDEAL_KG:        pi                 || '',
        BARTHEL:              datos.barthel      || '',
        ECF:                  datos.ecf          || '',
        VIA_AEREA:            datos.viaAerea     || 'Natural',
        FECHA_INGRESO:        fecha,
        DIAGNOSTICO:          datos.diagnostico  || '',
        DIAG_REM:             datos.diagRem      || '',
        TOT_NUMERO:           esTOT ? (datos.totNum || '') : '',
        TOT_CM_LABIO:         esTOT ? (datos.totCm  || '') : '',
        TQT_TIPO:             esTQT ? (datos.tqtTipo || '') : '',
        FECHA_INICIO_VA:      tieneVA ? fecha : '',
        FECHA_INICIO_SOPORTE: tieneVM ? fecha : '',
        SOPORTE:              datos.soporte      || 'Ambiente',
        MODO:                 datos.modo         || 'Sin soporte',
        KTM_NIVEL:            datos.ktmNivel     || '',
        KTM_SUSP:             false,
        FIRMA_KINE:           datos.firmaKine    || '',
        ULTIMO_TURNO_KEY:     '',
        TEXTO_EVO_DIA:        '',
        TEXTO_EVO_NOCHE:      '',
      };
 
      // Batch write (en _actualizarCamaInterno hay 1 sola I/O)
      _actualizarCamaInterno(datos.idCama, campos);
 
      // ★ Hito de ingreso usando versión _interna SIN lock ★
      _agregarHitoInterno({
        idCama:  datos.idCama,
        fecha:   fecha,
        turno:   datos.turno || 'Dia',
        tipo:    'ingreso',
        texto:   `Ingreso a UCI. Dx: ${datos.diagnostico || 'Sin especificar'}`,
        autor:   datos.firmaKine || '',
      });
 
      SpreadsheetApp.flush();
      return ok({ idCama: datos.idCama, accion: 'ingreso', fecha });
    } catch (e) {
      return err('ingresarPaciente: ' + e.message, e);
    }
  });
}
 
function darAltaPaciente(datos) {
  return conLock(() => {
    try {
      const resCama = obtenerCama(datos.idCama);
      if (!resCama.ok) return resCama;
      const cama = resCama.data;
      if (!cama.OCUPADA) return err(`Cama "${datos.idCama}" ya está libre.`);
 
      const fechaEgreso = fechaHoyISO();
 
      // Estadísticas del período
      const evoData = _obtenerEvolucionesIdCama(datos.idCama);
      let ktrTotal = 0, turnosVM = 0, turnosKTM = 0, turnosKTMC = 0;
      evoData.forEach(e => {
        ktrTotal += parseInt(e.KTM_NIVEL_KTR) || 0;
        if (e.VENT_SOPORTE === 'VM') turnosVM++;
        if (parseBool(e.KTM_REALIZADA))  turnosKTM++;
        if (parseBool(e.KTM_SUSPENDIDA)) turnosKTMC++;
      });
 
      // Guardar en ARCHIVO
      const hArch = obtenerHoja(SH.ARCHIVO);
      const filaArch = new Array(28).fill('');
      filaArch[COL_ARCH.ID_ARCHIVO        - 1] = generarIdArchivo();
      filaArch[COL_ARCH.CAMA_ORIGEN       - 1] = datos.idCama;
      filaArch[COL_ARCH.FECHA_INGRESO     - 1] = cama.FECHA_INGRESO;
      filaArch[COL_ARCH.FECHA_EGRESO      - 1] = fechaEgreso;
      filaArch[COL_ARCH.DIAS_TOTAL        - 1] = cama.DIA_ESTADIA;
      filaArch[COL_ARCH.DIAS_VM_TOTAL     - 1] = cama.DIAS_VM;
      filaArch[COL_ARCH.DIAS_VA_TOTAL     - 1] = cama.DIAS_VA;
      filaArch[COL_ARCH.NOMBRE            - 1] = cama.NOMBRE;
      filaArch[COL_ARCH.RUT               - 1] = cama.RUT;
      filaArch[COL_ARCH.EDAD              - 1] = cama.EDAD;
      filaArch[COL_ARCH.SEXO              - 1] = cama.SEXO;
      filaArch[COL_ARCH.DIAGNOSTICO       - 1] = cama.DIAGNOSTICO;
      filaArch[COL_ARCH.DIAG_REM          - 1] = cama.DIAG_REM;
      filaArch[COL_ARCH.MOTIVO_EGRESO     - 1] = datos.motivoEgreso  || '';
      filaArch[COL_ARCH.KTR_TOTAL         - 1] = ktrTotal;
      filaArch[COL_ARCH.TURNOS_VM         - 1] = turnosVM;
      filaArch[COL_ARCH.TURNOS_KTM        - 1] = turnosKTM;
      filaArch[COL_ARCH.TURNOS_KTMC       - 1] = turnosKTMC;
      filaArch[COL_ARCH.EXTUBACION_OK     - 1] = datos.extubacionOk  || false;
      filaArch[COL_ARCH.REINTUBACION      - 1] = datos.reintubacion  || false;
      filaArch[COL_ARCH.BARTHEL_INGRESO   - 1] = cama.BARTHEL;
      filaArch[COL_ARCH.BARTHEL_EGRESO    - 1] = datos.barthelEgreso || '';
      filaArch[COL_ARCH.FSS_EGRESO        - 1] = datos.fssEgreso     || '';
      filaArch[COL_ARCH.MRC_SS_EGRESO     - 1] = datos.mrcSsEgreso   || '';
      filaArch[COL_ARCH.FIRMA_RESPONSABLE - 1] = datos.firmaKine     || '';
      filaArch[COL_ARCH.OBSERVACIONES     - 1] = datos.observaciones || '';
      filaArch[COL_ARCH.JSON_BACKUP       - 1] = JSON.stringify(cama);
      filaArch[COL_ARCH.TIMELINE_JSON     - 1] = cama.TIMELINE_JSON  || '[]';
      hArch.appendRow(filaArch);
 
      // Hito de egreso (★ SIN lock anidado ★)
      _agregarHitoInterno({
        idCama: datos.idCama,
        fecha:  fechaEgreso,
        turno:  datos.turno || 'Dia',
        tipo:   'egreso',
        texto:  `Alta de UCI. Motivo: ${datos.motivoEgreso || 'Sin especificar'}`,
        autor:  datos.firmaKine || '',
      });
 
      // ★ FIX DEADLOCK: usar versión interna SIN lock ★
      _limpiarCamaInternoSinLock(datos.idCama);
      SpreadsheetApp.flush();
 
      return ok({ idCama: datos.idCama, accion: 'alta', fecha: fechaEgreso });
    } catch (e) {
      return err('darAltaPaciente: ' + e.message, e);
    }
  });
}
 
/**
 * ★ NUEVA ★ — versión interna SIN lock de limpieza.
 * La función pública limpiarCama() abajo es la que toma el lock.
 */
function _limpiarCamaInternoSinLock(idCama) {
  const h    = obtenerHoja(SH.CAMAS);
  const fila = buscarFila(h, COL_CAM.ID_CAMA, String(idCama), CAM_FILA_DATOS);
  if (fila === -1) throw new Error(`Cama "${idCama}" no encontrada.`);
 
  // Construir fila vacía con defaults (BATCH WRITE — 1 sola I/O)
  const fila_vals = new Array(CAM_TOTAL_COLS).fill('');
  fila_vals[COL_CAM.ID_CAMA     - 1] = String(idCama);
  fila_vals[COL_CAM.OCUPADA     - 1] = false;
  fila_vals[COL_CAM.STATUS_CAMA - 1] = 'Libre';
  fila_vals[COL_CAM.VIA_AEREA   - 1] = 'Natural';
  fila_vals[COL_CAM.SOPORTE     - 1] = 'Ambiente';
  fila_vals[COL_CAM.MODO        - 1] = 'Sin soporte';
  h.getRange(fila, 1, 1, CAM_TOTAL_COLS).setValues([fila_vals]);
}
 
function limpiarCama(idCama) {
  return conLock(() => {
    try {
      _limpiarCamaInternoSinLock(idCama);
      SpreadsheetApp.flush();
      return ok({ idCama, accion: 'limpiar' });
    } catch (e) {
      return err('limpiarCama: ' + e.message, e);
    }
  });
}
 
function trasladarPaciente(idCamaOrigen, idCamaDestino) {
  return conLock(() => {
    try {
      const h = obtenerHoja(SH.CAMAS);
      const fO = buscarFila(h, COL_CAM.ID_CAMA, String(idCamaOrigen), CAM_FILA_DATOS);
      const fD = buscarFila(h, COL_CAM.ID_CAMA, String(idCamaDestino), CAM_FILA_DATOS);
      if (fO === -1 || fD === -1) return err('Cama origen o destino no encontrada.');
 
      const valsO = h.getRange(fO, 2, 1, CAM_TOTAL_COLS - 1).getValues()[0];
      const valsD = h.getRange(fD, 2, 1, CAM_TOTAL_COLS - 1).getValues()[0];
      h.getRange(fO, 2, 1, CAM_TOTAL_COLS - 1).setValues([valsD]);
      h.getRange(fD, 2, 1, CAM_TOTAL_COLS - 1).setValues([valsO]);
      SpreadsheetApp.flush();
 
      const fecha = fechaHoyISO();
      // ★ Hitos sin lock anidado ★
      _agregarHitoInterno({ idCama: idCamaOrigen,  fecha, turno: 'Dia', tipo: 'general',
        texto: `Traslado Cama ${idCamaOrigen}→${idCamaDestino}`, autor: '' });
      _agregarHitoInterno({ idCama: idCamaDestino, fecha, turno: 'Dia', tipo: 'general',
        texto: `Traslado Cama ${idCamaDestino}→${idCamaOrigen}`, autor: '' });
 
      return ok({ accion: 'traslado', camaOrigen: idCamaOrigen, camaDestino: idCamaDestino });
    } catch (e) {
      return err('trasladarPaciente: ' + e.message, e);
    }
  });
}
 
// ═══════════════════════════════════════════════════════════
//  EVOLUCIONES — ESCRITURA
// ═══════════════════════════════════════════════════════════
 
function guardarEvolucion(datos) {
  // ★ VALIDAR ANTES del lock ★
  const errores = validarPayloadEvolucion(datos);
  if (errores.length) return err('Validación: ' + errores.join('; '));
 
  return conLock(() => {
    try {
      const idCama   = String(datos.ID_CAMA   || datos.idCama   || '');
      const turnoKey = String(datos.TURNO_KEY || datos.turnoKey || '');
      if (!idCama || !turnoKey) return err('Faltan ID_CAMA o TURNO_KEY.');
 
      const idEvolucion = generarIdEvolucion(idCama, turnoKey);
      const partes      = turnoKey.split('-');
      const fecha       = `${partes[0]}-${partes[1]}-${partes[2]}`;
      const turno       = partes[3] || 'Dia';
 
      // PI si no viene
      if (!datos.PAC_PESO_IDEAL || datos.PAC_PESO_IDEAL === 0) {
        datos.PAC_PESO_IDEAL = calcularPI(datos.PAC_SEXO, datos.PAC_TALLA);
      }
 
      // Cálculos respiratorios
      const calc = calcularRespiratorio(datos);
      Object.assign(datos, calc);
 
      // Días estadía (lectura sin lock, solo getValues)
      const resC = obtenerCama(idCama);
      if (resC.ok && resC.data.OCUPADA) {
        const cama = resC.data;
        datos.DIA_ESTADIA = calcularDias(cama.FECHA_INGRESO, fecha);
        datos.DIAS_VM = datos.VENT_SOPORTE === 'VM'
          ? calcularDias(cama.FECHA_INICIO_SOPORTE, fecha) : 0;
        datos.DIAS_VA = (datos.VENT_VIA_AEREA && datos.VENT_VIA_AEREA !== 'Natural')
          ? calcularDias(cama.FECHA_INICIO_VA, fecha) : 0;
      }
 
      // Texto generado
      datos.TEXTO_GENERADO = generarTextoEvolucion(datos);
      datos.JSON_SNAPSHOT  = JSON.stringify(datos);
 
      const evo = {
        ID_EVOLUCION: idEvolucion,
        ID_CAMA:      idCama,
        TURNO_KEY:    turnoKey,
        FECHA:        fecha,
        TURNO:        turno,
        ES_INGRESO:   datos.ES_INGRESO || datos.esIngreso || false,
        TIMESTAMP:    timestampAhora(),
        DIA_ESTADIA:  datos.DIA_ESTADIA || 0,
        DIAS_VM:      datos.DIAS_VM     || 0,
        DIAS_VA:      datos.DIAS_VA     || 0,
        ...datos,
        ...calc,
      };
 
      const filaArray = objetoAFila(evo, COL_EVO, EVO_TOTAL_COLS);
      const h         = obtenerHoja(SH.EVOLUCIONES);
      const filaExist = buscarFila(h, COL_EVO.ID_EVOLUCION, idEvolucion, EVO_FILA_DATOS);
 
      if (filaExist === -1) h.appendRow(filaArray);
      else                  h.getRange(filaExist, 1, 1, EVO_TOTAL_COLS).setValues([filaArray]);
 
      // ── Snapshot por turno (KTR/KTM/PROC separados, para la tabla) ──
      let _procsTurno = [];
      if (datos.PROC_JSON) { try { _procsTurno = JSON.parse(datos.PROC_JSON) || []; } catch (e) {} }
      const _procStr  = Array.isArray(_procsTurno) ? _procsTurno.join(' | ') : '';
      const _ktrCant  = parseInt(datos.RESP_KTR_CANT) || 0;
      // KTM_DIA: nivel solo si realizada; 'C' si contraindicada; '' si no realizada
      const _ktmTurno = parseBool(datos.KTM_REALIZADA) ? (datos.KTM_NIVEL_KTR || '')
                      : (parseBool(datos.KTM_SUSPENDIDA) ? 'C' : '');
      const _firmaT   = datos.PLAN_FIRMA_KINE || '';

      // ── Sincronizar CAMAS_ESTADO (★ con _actualizarCamaInterno, sin lock ★)
      const esIngreso = parseBool(datos.ES_INGRESO);
      const camaActual = resC.ok ? resC.data : {};
      const camposActualizar = {
        OCUPADA:          true,
        STATUS_CAMA:      'Ocupada',
        NOMBRE:           datos.PAC_NOMBRE      || camaActual.NOMBRE       || '',
        RUT:              datos.PAC_RUT         || camaActual.RUT          || '',
        EDAD:             datos.PAC_EDAD        || camaActual.EDAD         || '',
        SEXO:             datos.PAC_SEXO        || camaActual.SEXO         || '',
        TALLA_CM:         datos.PAC_TALLA       || camaActual.TALLA_CM     || '',
        PESO_IDEAL_KG:    datos.PAC_PESO_IDEAL  || camaActual.PESO_IDEAL_KG|| '',
        BARTHEL:          datos.PAC_BARTHEL     || camaActual.BARTHEL      || '',
        ECF:              datos.PAC_ECF         || camaActual.ECF          || '',
        DIAGNOSTICO:      datos.PAC_DIAGNOSTICO || camaActual.DIAGNOSTICO  || '',
        DIAG_REM:         datos.PAC_DIAG_REM    || camaActual.DIAG_REM     || '',
        VIA_AEREA:        datos.VENT_VIA_AEREA  || camaActual.VIA_AEREA    || 'Natural',
        SOPORTE:          datos.VENT_SOPORTE    || camaActual.SOPORTE      || 'Ambiente',
        MODO:             datos.VENT_MODO       || camaActual.MODO         || '',
        TOT_NUMERO:       datos.VENT_TOT_NUM    || camaActual.TOT_NUMERO   || '',
        TOT_CM_LABIO:     datos.VENT_TOT_CM     || camaActual.TOT_CM_LABIO || '',
        TQT_TIPO:         datos.VENT_TQT_TIPO   || camaActual.TQT_TIPO     || '',
        KTM_NIVEL:        parseBool(datos.KTM_REALIZADA) ? (datos.KTM_NIVEL_KTR || '')
                            : (turno === 'Noche' ? (camaActual.KTM_NIVEL || '') : ''),
        KTM_SUSP:         parseBool(datos.KTM_SUSPENDIDA),
        FIRMA_KINE:       datos.PLAN_FIRMA_KINE || camaActual.FIRMA_KINE   || '',
        ULTIMO_TURNO_KEY: turnoKey,
        FECHA_INGRESO:    camaActual.FECHA_INGRESO || (esIngreso ? fecha : ''),
        FECHA_INICIO_VA:  camaActual.FECHA_INICIO_VA
          || (datos.VENT_VIA_AEREA && datos.VENT_VIA_AEREA !== 'Natural' ? fecha : ''),
        FECHA_INICIO_SOPORTE: (function(){
          // D.VM y D.VNI de la tabla cuentan días desde el inicio del soporte ACTUAL.
          // Si cambia el tipo de soporte ventilatorio (Ambiente→VM, VM→VNI, VNI→VM, …)
          // se inicia un nuevo episodio y se reinicia la fecha.
          const sopNew = datos.VENT_SOPORTE || camaActual.SOPORTE || 'Ambiente';
          const sopAnt = camaActual.SOPORTE || '';
          const esVent = (sopNew === 'VM' || sopNew === 'VNI');
          if (!esVent) return camaActual.FECHA_INICIO_SOPORTE || '';
          if (sopNew !== sopAnt || !camaActual.FECHA_INICIO_SOPORTE) return fecha;
          return camaActual.FECHA_INICIO_SOPORTE;
        })(),
      };
      if (turno === 'Dia') {
        camposActualizar.TEXTO_EVO_DIA = datos.TEXTO_GENERADO || '';
        camposActualizar.KTR_DIA   = _ktrCant;
        camposActualizar.KTM_DIA   = _ktmTurno;
        camposActualizar.PROC_DIA  = _procStr;
        camposActualizar.FIRMA_DIA = _firmaT;
        camposActualizar.KEY_DIA   = turnoKey;
      }
      if (turno === 'Noche') {
        camposActualizar.TEXTO_EVO_NOCHE = datos.TEXTO_GENERADO || '';
        camposActualizar.KTR_NOCHE   = _ktrCant;
        camposActualizar.PROC_NOCHE  = _procStr;
        camposActualizar.FIRMA_NOCHE = _firmaT;
        camposActualizar.KEY_NOCHE   = turnoKey;
      }
 
      // Hito de ingreso si corresponde
      if (esIngreso && datos.PAC_NOMBRE) {
        _agregarHitoInterno({
          idCama, fecha, turno, tipo: 'ingreso',
          texto: `Ingreso UCI. Dx: ${datos.PAC_DIAGNOSTICO || 'Sin especificar'}`,
          autor: datos.PLAN_FIRMA_KINE || '',
        });
      }
 
      _actualizarCamaInterno(idCama, camposActualizar);
 
      // Procedimientos (★ SIN lock anidado ★)
      let procsArray = [];
      if (datos.PROC_JSON) {
        try {
          procsArray = JSON.parse(datos.PROC_JSON) || [];
        } catch(e) { console.warn('PROC_JSON inválido:', e); }
      }
      if (Array.isArray(procsArray) && procsArray.length > 0) {
        _guardarProcedimientosInterno(idEvolucion, idCama, fecha, turno, procsArray, datos.PLAN_FIRMA_KINE);
      }
 
      // ★ NUEVO ★ — Crear hitos automáticos en TIMELINE para eventos clínicos
      // (autoextubación, reintubación, TQT, prono, hitos motores, etc.)
      // Pasa array vacío si el usuario quitó procedimientos en una re-edición.
      _crearHitosDesdeProcedimientos(idCama, fecha, turno, procsArray, datos.PLAN_FIRMA_KINE);
 
      SpreadsheetApp.flush();
      return ok({ idEvolucion, idCama, turnoKey, accion: filaExist === -1 ? 'crear' : 'actualizar' });
    } catch (e) {
      return err('guardarEvolucion: ' + e.message, e);
    }
  });
}
 
// ═══════════════════════════════════════════════════════════
//  EVOLUCIONES — LECTURA
// ═══════════════════════════════════════════════════════════
 
function obtenerEvolucion(idCama, turnoKey) {
  try {
    const idEvolucion = generarIdEvolucion(idCama, turnoKey);
    const h    = obtenerHoja(SH.EVOLUCIONES);
    const fila = buscarFila(h, COL_EVO.ID_EVOLUCION, idEvolucion, EVO_FILA_DATOS);
    if (fila === -1) return ok(null);
    const vals = h.getRange(fila, 1, 1, EVO_TOTAL_COLS).getValues()[0];
    return ok(filaAObjeto(vals, COL_EVO));
  } catch (e) { return err('obtenerEvolucion: ' + e.message, e); }
}
 
function obtenerEvolucionesRecientes(idCama, limite) {
  try {
    const h    = obtenerHoja(SH.EVOLUCIONES);
    const evos = leerHojaObjetos(h, COL_EVO, EVO_TOTAL_COLS, EVO_FILA_DATOS, 'ID_CAMA', idCama);
    evos.sort((a, b) => String(b.TURNO_KEY).localeCompare(String(a.TURNO_KEY)));
    return ok(limite ? evos.slice(0, limite) : evos);
  } catch (e) { return err('obtenerEvolucionesRecientes: ' + e.message, e); }
}
 
/**
 * ★ NUEVA ★ — Evolución INMEDIATAMENTE ANTERIOR a un turno dado.
 * Busca, dentro de la misma cama, la evolución con el TURNO_KEY más alto
 * que sea ESTRICTAMENTE menor al turnoKey recibido. Como el formato de la
 * clave es "YYYY-MM-DD-Dia" / "YYYY-MM-DD-Noche", el orden alfabético
 * coincide con el orden cronológico (Dia < Noche dentro del mismo día).
 *
 * Se usa para REPLICAR el estado del turno previo en un turno nuevo,
 * de modo que el kinesiólogo solo modifique lo que cambió.
 *
 * @param  {string} idCama
 * @param  {string} turnoKey  clave del turno que se está abriendo
 * @return {object|null} snapshot completo de la evolución previa, o null
 */
function obtenerEvolucionPrevia(idCama, turnoKey) {
  try {
    const h    = obtenerHoja(SH.EVOLUCIONES);
    const evos = leerHojaObjetos(h, COL_EVO, EVO_TOTAL_COLS, EVO_FILA_DATOS, 'ID_CAMA', idCama);
    if (!evos.length) return ok(null);

    const objetivo = String(turnoKey);
    let mejor = null, mejorKey = '';
    evos.forEach(obj => {
      const k = String(obj.TURNO_KEY || '');
      // estrictamente anterior y la más reciente de las anteriores
      if (k && k < objetivo && k > mejorKey) { mejor = obj; mejorKey = k; }
    });
    return ok(mejor); // null si no hay turno previo
  } catch (e) { return err('obtenerEvolucionPrevia: ' + e.message, e); }
}

function _obtenerEvolucionesIdCama(idCama) {
  const h = obtenerHoja(SH.EVOLUCIONES);
  return leerHojaObjetos(h, COL_EVO, EVO_TOTAL_COLS, EVO_FILA_DATOS, 'ID_CAMA', idCama);
}

/**
 * Última evaluación funcional (MRC-SS / FSS-ICU / cooperación) por cama.
 * Lee EVOLUCIONES una sola vez. Para cada cama devuelve:
 *   { coop, mrc, mrcFecha, fss, fssFecha }
 * - coop: SED_COOPERACION de la evolución más reciente.
 * - mrc/fss: valor de la evolución MÁS RECIENTE que tenga ese dato,
 *   junto con la fecha de esa evolución (para mostrar "MRC 48 · 12-06").
 */
function _evalFuncionalPorCama() {
  const out = {};
  try {
    const h = obtenerHoja(SH.EVOLUCIONES);
    const evos = leerHojaObjetos(h, COL_EVO, EVO_TOTAL_COLS, EVO_FILA_DATOS);
    // Orden cronológico ascendente: la última iteración deja lo más reciente.
    evos.sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));
    const tiene = x => x !== '' && x !== null && x !== undefined;
    evos.forEach(e => {
      const id = String(e.ID_CAMA);
      if (!id) return;
      const r = out[id] || (out[id] = { coop:'', mrc:'', mrcFecha:'', fss:'', fssFecha:'' });
      if (tiene(e.SED_COOPERACION)) r.coop = e.SED_COOPERACION;
      if (tiene(e.EGR_MRC_SS)) { r.mrc = e.EGR_MRC_SS; r.mrcFecha = e.FECHA || ''; }
      if (tiene(e.EGR_FSS))    { r.fss = e.EGR_FSS;    r.fssFecha = e.FECHA || ''; }
    });
  } catch (e) { console.warn('_evalFuncionalPorCama:', e.message); }
  return out;
}
 
function obtenerEvolucionesHoy(fecha) {
  try {
    const h    = obtenerHoja(SH.EVOLUCIONES);
    const evos = leerHojaObjetos(h, COL_EVO, EVO_TOTAL_COLS, EVO_FILA_DATOS, 'FECHA', fecha);
    evos.forEach(e => { delete e.TEXTO_GENERADO; delete e.JSON_SNAPSHOT; });
    return ok(evos);
  } catch (e) { return err('obtenerEvolucionesHoy: ' + e.message, e); }
}
 
/**
 * ★ NUEVA ★ — Historial completo de un paciente para el modal de Timeline.
 * Devuelve hitos + evoluciones (solo las columnas relevantes para gráficos)
 * en una sola llamada, ahorrando un round-trip.
 *
 * @param  {string} idCama
 * @return {{hitos: Array, evoluciones: Array}}
 *
 * Las evoluciones se filtran para incluir SOLO las variables que graficamos:
 *   - Identificación de turno: ID_EVOLUCION, FECHA, TURNO, TURNO_KEY
 *   - Ventilatorias: VENT_SOPORTE, VENT_MODO, VENT_VIA_AEREA, VENT_VT, VENT_FR,
 *                    VENT_PEEP, VENT_PMAX, VENT_PPL, VENT_FIO2, VENT_SPO2,
 *                    VENT_IPAP, VENT_EPAP, VENT_PS, VENT_FLUJO
 *   - Rehabilitación: KTM_REALIZADA, KTM_SUSPENDIDA, KTM_NIVEL_KTR,
 *                     KTM_TIEMPO_MIN, KTM_UMA, KTM_UMA_VAL, PAC_BARTHEL,
 *                     SED_S5Q, SED_GCS_TOT
 *   - Calculadas: DIA_ESTADIA, DIAS_VM, DIAS_VA, CALC_ML_KG, CALC_DP, CALC_IROX, CALC_TOBIN
 *   - Firma: PLAN_FIRMA_KINE
 */
function obtenerHistorialPaciente(idCama) {
  try {
    // Hitos
    const hT = obtenerHoja(SH.TIMELINE);
    const hitos = leerHojaObjetos(hT, COL_TL, 8, TL_FILA_DATOS, 'ID_CAMA', idCama);
    // Ordenar por TIMESTAMP desc para el listado, pero el frontend lo re-ordenará si necesita
    hitos.sort((a, b) => String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)));
 
    // Evoluciones (subset de columnas para no enviar todo el snapshot)
    const COLS_GRAFICOS = [
      'ID_EVOLUCION', 'FECHA', 'TURNO', 'TURNO_KEY',
      'VENT_SOPORTE', 'VENT_MODO', 'VENT_VIA_AEREA',
      'VENT_VT', 'VENT_FR', 'VENT_PEEP', 'VENT_PMAX', 'VENT_PPL',
      'VENT_FIO2', 'VENT_SPO2', 'VENT_IPAP', 'VENT_EPAP', 'VENT_PS', 'VENT_FLUJO',
      'KTM_REALIZADA', 'KTM_SUSPENDIDA', 'KTM_NIVEL_KTR', 'KTM_TIEMPO_MIN',
      'KTM_UMA', 'KTM_UMA_VAL',
      'PAC_BARTHEL', 'SED_S5Q', 'SED_GCS_TOT', 'SED_TIPO',
      'EGR_NIVEL_MOTOR', 'EGR_MRC_SS', 'EGR_FSS', 'EGR_PRENSION', 'EGR_PIM', 'EGR_PEM',
      'DIA_ESTADIA', 'DIAS_VM', 'DIAS_VA',
      'CALC_ML_KG', 'CALC_DP', 'CALC_IROX', 'CALC_TOBIN', 'CALC_VOL_MIN',
      'PLAN_FIRMA_KINE',
    ];
    const evolucionesFull = _obtenerEvolucionesIdCama(idCama);
    const evoluciones = evolucionesFull.map(e => {
      const slim = {};
      COLS_GRAFICOS.forEach(k => { slim[k] = e[k] !== undefined ? e[k] : ''; });
      return slim;
    });
    // Orden cronológico ascendente para los gráficos (más antiguo → más nuevo)
    evoluciones.sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));
 
    return ok({ hitos, evoluciones });
  } catch (e) {
    return err('obtenerHistorialPaciente: ' + e.message, e);
  }
}
 
/**
 * ★ NUEVA ★ — Lista de pacientes archivados (egresos).
 * Lee la hoja ARCHIVO y devuelve un array con los pacientes que ya egresaron.
 * Filtros opcionales por fecha de egreso (rango) y motivo de egreso.
 *
 * @param {object} filtros { fechaDesde, fechaHasta, motivo, busqueda }
 *                         Todos opcionales. Si vacío, devuelve todo.
 */
function obtenerArchivos(filtros) {
  try {
    const f = filtros || {};
    const h = obtenerHoja(SH.ARCHIVO);
    const ultima = h.getLastRow();
    if (ultima < ARCH_FILA_DATOS) return ok([]);
 
    const datos = h.getRange(ARCH_FILA_DATOS, 1, ultima - ARCH_FILA_DATOS + 1, 28).getValues();
    let archivos = datos.map(fila => {
      const obj = filaAObjeto(fila, COL_ARCH);
      // NUNCA exponer el snapshot JSON completo en la lista — pesa mucho.
      delete obj.JSON_BACKUP;
      delete obj.TIMELINE_JSON;
      return obj;
    });
 
    // Filtros
    if (f.fechaDesde) archivos = archivos.filter(a => String(a.FECHA_EGRESO) >= String(f.fechaDesde));
    if (f.fechaHasta) archivos = archivos.filter(a => String(a.FECHA_EGRESO) <= String(f.fechaHasta));
    if (f.motivo)    archivos = archivos.filter(a => String(a.MOTIVO_EGRESO || '').toLowerCase() === String(f.motivo).toLowerCase());
    if (f.busqueda) {
      const q = String(f.busqueda).toLowerCase();
      archivos = archivos.filter(a =>
        String(a.NOMBRE || '').toLowerCase().includes(q) ||
        String(a.RUT || '').toLowerCase().includes(q) ||
        String(a.DIAGNOSTICO || '').toLowerCase().includes(q)
      );
    }
 
    // Filtrar registros vacíos (filas con ID_ARCHIVO vacío)
    archivos = archivos.filter(a => a.ID_ARCHIVO);
 
    // Más reciente primero
    archivos.sort((a, b) => String(b.FECHA_EGRESO || '').localeCompare(String(a.FECHA_EGRESO || '')));
 
    return ok(archivos);
  } catch (e) {
    return err('obtenerArchivos: ' + e.message, e);
  }
}
 
/**
 * ★ NUEVA ★ — Detalle completo de un paciente archivado.
 * Devuelve la fila completa incluyendo JSON_BACKUP y TIMELINE_JSON
 * para poder reconstruir su historial en el modal de detalle.
 */
function obtenerArchivoDetalle(idArchivo) {
  try {
    const h = obtenerHoja(SH.ARCHIVO);
    const fila = buscarFila(h, COL_ARCH.ID_ARCHIVO, idArchivo, ARCH_FILA_DATOS);
    if (fila === -1) return err('Archivo no encontrado: ' + idArchivo);
    const vals = h.getRange(fila, 1, 1, 28).getValues()[0];
    const obj = filaAObjeto(vals, COL_ARCH);
    // Intentar parsear JSONs para conveniencia del frontend
    try { obj.SNAPSHOT = obj.JSON_BACKUP ? JSON.parse(obj.JSON_BACKUP) : null; } catch (e) { obj.SNAPSHOT = null; }
    try { obj.TIMELINE = obj.TIMELINE_JSON ? JSON.parse(obj.TIMELINE_JSON) : []; } catch (e) { obj.TIMELINE = []; }
    return ok(obj);
  } catch (e) {
    return err('obtenerArchivoDetalle: ' + e.message, e);
  }
}
 