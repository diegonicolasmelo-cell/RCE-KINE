/**
 * api.gs — Dispatcher único. Verifica identidad (GIS o modo dev), enruta la
 * acción al servicio y audita las escrituras. Toda escritura pasa por aquí.
 *
 * Nota: el frontend real y su doGet se agregan en la fase de UI. Mientras tanto,
 * el doGet activo es el del spike (spike_gis.gs).
 *
 * @param {string} accion
 * @param {Object} datos
 * @param {string} [token]  ID token de GIS (en modo dev se ignora)
 */
function api(accion, datos, token) {
  datos = datos || {};

  // Identidad (en AUTH_DEV_MODE=TRUE pasa siempre con una firma simulada).
  const firmaDecl = datos.PLAN_FIRMA_KINE || datos.firmaKine || '';
  const auth = autorizar(token, firmaDecl);
  if (!auth.ok) return auth;
  const ctx = { email: auth.email, firma: auth.firma };

  try {
    switch (accion) {
      // ── Lecturas ──
      case 'GET_TODAS_CAMAS':  return obtenerTodasLasCamas();
      case 'GET_CAMA':         return obtenerCama(datos.idCama);
      case 'GET_TIMELINE':     return obtenerTimeline(datos.idCama);
      case 'GET_EVOLUCION':          return obtenerEvolucion(datos.idCama, datos.turnoKey);
      case 'GET_EVO_TURNO':          return obtenerEvoTurno(datos.idCama, datos.turnoKey);
      case 'GET_EVOLUCION_PREVIA':   return obtenerEvolucionPrevia(datos.idCama, datos.turnoKey);
      case 'GET_EVOLUCIONES_RECIENTES': return obtenerEvolucionesRecientes(datos.idCama, datos.limite || 14);
      case 'GET_HISTORIAL_PACIENTE': return obtenerHistorialPaciente(datos.idCama, datos.patientId || '');
      case 'GET_PROCEDIMIENTOS':     return obtenerProcedimientos(datos.idEvolucion);
      case 'GET_CATALOGO':     return ok(catalogo(datos.tipo || ''));
      case 'GET_FECHA_HOY':    return ok({ fecha: hoyISO(), timestamp: ahoraTS() });
      case 'WHOAMI':           return ok({ email: ctx.email, firma: ctx.firma, dev: !!auth.dev });

      // ── Escrituras (auditadas) ──
      case 'INGRESAR_PACIENTE':
        return _auditar(ctx, accion, () => ingresarPaciente(datos, ctx));
      case 'DAR_ALTA':
        return _auditar(ctx, accion, () => darAltaPaciente(datos, ctx));
      case 'INTERCAMBIAR_CAMAS':
        return _auditar(ctx, accion, () => intercambiarCamas(datos.idCamaA || datos.idA, datos.idCamaB || datos.idB, ctx));
      case 'MOVER_A_CAMA_VACIA':
        return _auditar(ctx, accion, () => moverACamaVacia(datos.idOrigen, datos.idDestino, ctx));
      case 'LIMPIAR_CAMA':
        return _auditar(ctx, accion, () => limpiarCama(datos.idCama));
      case 'GUARDAR_EVOLUCION':
        return _auditar(ctx, accion, () => guardarEvolucion(datos, ctx));
      case 'AGREGAR_HITO':
        return _auditar(ctx, accion, () => agregarHito(Object.assign({ autor: ctx.firma, autorEmail: ctx.email }, datos)));

      default:
        return err('Acción desconocida: "' + accion + '"', ERR.VALIDACION);
    }
  } catch (e) {
    return err('Error en ' + accion + ': ' + e.message, ERR.INTERNO, e);
  }
}

/** Ejecuta fn y, si resultó ok, deja registro en AUDIT_LOG. */
function _auditar(ctx, accion, fn) {
  const r = fn();
  if (r && r.ok) {
    const d = r.data || {};
    auditar({
      email: ctx.email, firma: ctx.firma, accion: accion,
      entidad: d.entidad || '', idEntidad: d.idCama || d.idEvolucion || d.id || '',
      patientId: d.patientId || '', resumen: d.accion || accion,
    });
  }
  return r;
}

// ── Smoke test end-to-end (correr en el editor, con AUTH_DEV_MODE=TRUE) ──
function testFlujoCamas() {
  const T = null; // en dev mode el token se ignora
  const ing = api('INGRESAR_PACIENTE', {
    idCama: '1', nombre: 'Diego Melo Villagrán', edad: 34, sexo: 'M', talla: 175,
    diagnostico: 'IRA', viaAerea: 'TOT', soporte: 'VM', modo: 'ACVC', firmaKine: 'DMV',
  }, T);
  console.log('INGRESO:', JSON.stringify(ing));
  const cama = api('GET_CAMA', { idCama: '1' }, T);
  console.log('CAMA:', cama.ok ? (cama.data.NOMBRE + ' · ' + cama.data.COD_PACIENTE + ' · día ' + cama.data.DIA_ESTADIA) : cama.error);
  const alta = api('DAR_ALTA', { idCama: '1', motivoEgreso: 'Traslado a sala', destinoEgreso: 'Medicina', firmaKine: 'DMV' }, T);
  console.log('ALTA:', JSON.stringify(alta));
  const libre = api('GET_CAMA', { idCama: '1' }, T);
  console.log('CAMA tras alta:', libre.ok ? ('OCUPADA=' + libre.data.OCUPADA) : libre.error);
  return { ing, alta };
}

// Smoke test de evoluciones + replicación (AUTH_DEV_MODE=TRUE).
function testFlujoEvolucion() {
  const T = null;
  api('INGRESAR_PACIENTE', { idCama: '2', nombre: 'Juan Pérez Soto', edad: 60, sexo: 'M', talla: 170,
    diagnostico: 'Neumonía', viaAerea: 'TOT', soporte: 'VM', modo: 'ACVC', firmaKine: 'DMV' }, T);

  const e1 = api('GUARDAR_EVOLUCION', {
    idCama: '2', turnoKey: '2026-07-08-Dia', PLAN_FIRMA_KINE: 'DMV',
    VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC', VENT_VT: 420, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 40, VENT_SPO2: 96,
    KTM_REALIZADA: true, KTM_NIVEL_KTR: '2', RESP_KTR_CANT: 1, PROC_JSON: JSON.stringify(['ECOGRAFÍA']),
  }, T);
  console.log('EVO 1:', JSON.stringify(e1));

  const prev = api('GET_EVOLUCION_PREVIA', { idCama: '2', turnoKey: '2026-07-08-Noche' }, T);
  console.log('PREVIA (para replicar):', prev.ok && prev.data ? (prev.data.TURNO_KEY + ' · VT=' + prev.data.VENT_VT + ' · ml/kg=' + prev.data.CALC_ML_KG) : 'sin previa');

  const evo = api('GET_EVOLUCION', { idCama: '2', turnoKey: '2026-07-08-Dia' }, T);
  console.log('TEXTO GENERADO:\n' + (evo.ok && evo.data ? evo.data.TEXTO_GENERADO : evo.error));

  api('DAR_ALTA', { idCama: '2', motivoEgreso: 'Traslado a sala', destinoEgreso: 'Medicina', firmaKine: 'DMV' }, T);
  return e1;
}
