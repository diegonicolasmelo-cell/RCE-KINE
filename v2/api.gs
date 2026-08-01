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

  // Acción PÚBLICA (pre-login): entrega el client id de GIS para dibujar el
  // botón de acceso. No expone datos clínicos (un client id de OAuth es
  // público por diseño). Reemplaza al scriptlet de plantilla que se eliminó.
  if (accion === 'GET_LOGIN_INFO') return ok({ clientId: configVal('OAUTH_CLIENT_ID', '') });

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
      case 'GET_EVOS_DEL_DIA': return obtenerEvosDelDia(datos.fecha);
      case 'GET_CONFIG_UI':    return ok(_configUI());
      // Arranque en UN solo viaje: identidad + config + catálogo + camas +
      // evoluciones del día + asignación del turno. Antes eran 4 viajes en
      // cadena (~4-6 s en Apps Script); ahora uno (~1-1,5 s).
      case 'GET_BOOT':         return obtenerBoot(datos, ctx, auth);
      case 'GET_ASIGNACION_TURNO': return obtenerAsignacionTurno(datos.key);
      case 'GET_STATS':        return obtenerStats(datos.desde, datos.hasta);
      case 'GET_ARCHIVADOS':   return obtenerArchivados(datos);
      case 'GET_VENTILADORES': return obtenerVentiladores();
      case 'GET_MOVIMIENTOS_VM': return obtenerMovimientosVM(datos.idVm || '', datos.limite || 40);
      case 'GET_ENTREGA_TURNO':  return obtenerEntregaTurno(datos.idCamas, datos.fecha, datos.turno);
      case 'GET_AUDITORIA':      return auditoriaCalidad();
      case 'GET_BUSCAR_PACIENTE': return buscarPacientes(datos.q || '');
      case 'GET_ENTREGAS_TURNO': return obtenerEntregasTurno(datos.limite || 30);
      case 'GET_INDICADORES':    return calcularIndicadores(datos.desde, datos.hasta);
      case 'GET_RUT_PREVIO':     return episodiosPorRut(datos.rut || '');
      case 'GET_PIVOT':          return datosPivot(datos.desde, datos.hasta);
      case 'GET_FALLAS_VM':      return obtenerFallasVM(datos.idVm || '', datos.limite || 30);
      case 'GET_STOCK':          return obtenerStockEquipos();
      case 'GET_MOVS_STOCK':     return obtenerMovimientosStock(datos.id || '', datos.limite || 20);
      case 'GET_DOCUMENTOS':     return obtenerDocumentos(!!datos.refrescar);
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
      case 'SET_ASIGNACION_TURNO':
        return _auditar(ctx, accion, () => guardarAsignacionTurno(datos));
      case 'AGREGAR_FASE':
        return _auditar(ctx, accion, () => agregarFaseClinica(datos.nombre));
      case 'SET_BANNER':
        return _auditar(ctx, accion, () => {
          const tab = String(datos.tab || '');
          if (['G', 'P', 'D', 'E', 'A', 'V'].indexOf(tab) === -1) return err('Pestaña inválida.', ERR.VALIDACION);
          escribirConfig('BANNER_' + tab, String(datos.valor || ''));
          return ok({ entidad: 'CONFIG', accion: 'portada ' + tab, valor: String(datos.valor || '') });
        });
      case 'ANULAR_EVENTO':
        return _auditar(ctx, accion, () => anularEvento(datos, ctx));
      case 'ANEXAR_EVENTO':
        return _auditar(ctx, accion, () => anexarEventoRapido(datos, ctx));
      case 'CONFIRMAR_DISPOSITIVOS':
        return _auditar(ctx, accion, () => confirmarDispositivos(datos, ctx));
      case 'GUARDAR_ENTREGA_TURNO':
        return _auditar(ctx, accion, () => guardarEntregaTurno(datos, ctx));
      case 'GENERAR_REM':
        return _auditar(ctx, accion, () => generarREM(datos.anio, datos.mes, ctx));
      case 'GUARDAR_VENTILADOR':
        return _auditar(ctx, accion, () => guardarVentilador(datos, ctx));
      case 'MOVER_VENTILADOR':
        return _auditar(ctx, accion, () => moverVentilador(datos, ctx));
      case 'MOVER_VENTILADORES_LOTE':
        return _auditar(ctx, accion, () => moverVentiladoresLote(datos, ctx));
      case 'BAJA_VENTILADOR':
        return _auditar(ctx, accion, () => bajaVentilador(datos, ctx));
      case 'REGISTRAR_FALLA_VM':
        return _auditar(ctx, accion, () => registrarFallaVM(datos, ctx));
      case 'GUARDAR_STOCK':
        return _auditar(ctx, accion, () => guardarStockEquipo(datos, ctx));
      case 'AJUSTAR_STOCK':
        return _auditar(ctx, accion, () => ajustarStockEquipo(datos, ctx));
      case 'ASIGNAR_STOCK':
        return _auditar(ctx, accion, () => asignarStockACama(datos, ctx));

      default:
        return err('Acción desconocida: "' + accion + '"', ERR.VALIDACION);
    }
  } catch (e) {
    return err('Error en ' + accion + ': ' + e.message, ERR.INTERNO, e);
  }
}

/** Config de interfaz (compartida por GET_CONFIG_UI y GET_BOOT). */
function _configUI() {
  return {
    CPAX_ACTIVO: leerConfig('CPAX_ACTIVO', 'TRUE') !== 'FALSE',
    NUM_CAMAS: parseInt(leerConfig('NUM_CAMAS', '18')) || 18,
    TURNO_DIA_INICIO: parseInt(leerConfig('TURNO_DIA_INICIO', '9')) || 9,
    TURNO_NOCHE_INICIO: parseInt(leerConfig('TURNO_NOCHE_INICIO', '21')) || 21,
    EDITOR_TEXTO_DEMO: leerConfig('EDITOR_TEXTO_DEMO', 'FALSE') === 'TRUE',
    EVAL_DIAS_ALERTA: parseInt(leerConfig('EVAL_DIAS_ALERTA', '5')) || 5,
    CUFF_MIN: parseInt(leerConfig('CUFF_MIN', '20')) || 20,
    CUFF_MAX: parseInt(leerConfig('CUFF_MAX', '30')) || 30,
    PTT_OK: parseFloat(leerConfig('PTT_OK', '10')) || 10,
    PTT_ALERTA: parseFloat(leerConfig('PTT_ALERTA', '12')) || 12,
    BANNERS: {
      G: leerConfig('BANNER_G', ''), P: leerConfig('BANNER_P', ''), D: leerConfig('BANNER_D', ''),
      E: leerConfig('BANNER_E', ''), A: leerConfig('BANNER_A', ''), V: leerConfig('BANNER_V', ''),
    },
    CAT_DEF: catMatrices(),
  };
}

/** Todo lo que el arranque necesita, en una sola respuesta. */
function obtenerBoot(datos, ctx, auth) {
  try {
    const rCamas = obtenerTodasLasCamas();
    const rEvos = obtenerEvosDelDia((datos && datos.fecha) || hoyISO());
    let asignacion = null;
    if (datos && datos.key) {
      const rA = obtenerAsignacionTurno(datos.key);
      if (rA && rA.ok) asignacion = rA.data;
    }
    return ok({
      yo: { email: ctx.email, firma: ctx.firma, dev: !!(auth && auth.dev) },
      config: _configUI(),
      fases: catalogo('FASE_CLINICA'),
      camas: (rCamas && rCamas.ok) ? rCamas.data : [],
      evos: (rEvos && rEvos.ok) ? rEvos.data : [],
      asignacion: asignacion,
      // Reloj del servidor: evita la llamada aparte GET_FECHA_HOY al arrancar
      // (el cliente compara para avisar si el equipo tiene mal la hora).
      ahora: ahoraTS(),
    });
  } catch (e) { return err('obtenerBoot: ' + e.message, ERR.INTERNO, e); }
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
