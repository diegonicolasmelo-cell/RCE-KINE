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

  // La configuración y los catálogos se memorizan durante UNA petición (ver la
  // nota en esquema.gs). Aquí empieza la petición, así que aquí se olvida lo de
  // la anterior: en Apps Script cada llamada es un proceso nuevo y esto no
  // cambia nada, pero el simulador atiende muchas peticiones en un mismo
  // proceso de Node y ahí el memo no puede sobrevivir de una a otra.
  if (typeof _memoReset === 'function') _memoReset();

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
      case 'GET_EVOLUCION':          return obtenerEvolucion(datos.idCama, datos.turnoKey, datos.patientId);
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
      case 'GET_HISTORICOS':   return obtenerHistoricos();
      case 'GET_SUGERENCIAS':  return obtenerSugerencias();
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
      case 'GET_CAMBIOS_NOCHE':  return cambiosEstaNoche(datos.fecha);
      case 'GET_ALERTAS':        return ok({ alertas: alertasUnidad(datos && datos.fecha) });
      case 'GET_NOTIFICACIONES': return notifListar(datos);
      case 'GET_REINTUB_N':      return contarReintubaciones(datos.pids);
      case 'WHOAMI':           return ok({ email: ctx.email, firma: ctx.firma, dev: !!auth.dev });

      // ── Escrituras (auditadas) ──
      case 'GUARDAR_SUGERENCIA':
        return _auditar(ctx, accion, () => guardarSugerencia(datos, ctx), datos);
      case 'SET_SUGERENCIA_ESTADO':
        return _auditar(ctx, accion, () => setSugerenciaEstado(datos), datos);
      case 'INGRESAR_PACIENTE':
        return _auditar(ctx, accion, () => ingresarPaciente(datos, ctx), datos);
      case 'DAR_ALTA':
        return _auditar(ctx, accion, () => darAltaPaciente(datos, ctx), datos);
      case 'INTERCAMBIAR_CAMAS':
        return _auditar(ctx, accion, () => intercambiarCamas(datos.idCamaA || datos.idA, datos.idCamaB || datos.idB, ctx), datos);
      case 'MOVER_A_CAMA_VACIA':
        return _auditar(ctx, accion, () => moverACamaVacia(datos.idOrigen, datos.idDestino, ctx), datos);
      case 'LIMPIAR_CAMA':
        return _auditar(ctx, accion, () => limpiarCama(datos.idCama), datos);
      case 'GUARDAR_EVOLUCION':
        return _auditar(ctx, accion, () => guardarEvolucion(datos, ctx), datos);
      case 'AGREGAR_HITO':
        return _auditar(ctx, accion, () => agregarHito(Object.assign({ autor: ctx.firma, autorEmail: ctx.email }, datos)), datos);
      case 'SET_ASIGNACION_TURNO':
        return _auditar(ctx, accion, () => guardarAsignacionTurno(datos), datos);
      case 'AGREGAR_FASE':
        return _auditar(ctx, accion, () => agregarFaseClinica(datos.nombre), datos);
      case 'SET_BANNER':
        return _auditar(ctx, accion, () => {
          const tab = String(datos.tab || '');
          if (['G', 'P', 'D', 'E', 'A', 'V'].indexOf(tab) === -1) return err('Pestaña inválida.', ERR.VALIDACION);
          escribirConfig('BANNER_' + tab, String(datos.valor || ''));
          return ok({ entidad: 'CONFIG', accion: 'portada ' + tab, valor: String(datos.valor || '') });
        }, datos);
      case 'ANULAR_EVENTO':
        return _auditar(ctx, accion, () => anularEvento(datos, ctx), datos);
      case 'ANEXAR_EVENTO':
        return _auditar(ctx, accion, () => anexarEventoRapido(datos, ctx), datos);
      case 'ANULAR_ANEXO':
        return _auditar(ctx, accion, () => anularAnexo(datos, ctx), datos);
      case 'CONFIRMAR_DISPOSITIVOS':
        return _auditar(ctx, accion, () => confirmarDispositivos(datos, ctx), datos);
      case 'GUARDAR_ENTREGA_TURNO':
        return _auditar(ctx, accion, () => guardarEntregaTurno(datos, ctx), datos);
      case 'GENERAR_REM':
        return _auditar(ctx, accion, () => generarREM(datos.anio, datos.mes, ctx), datos);
      case 'GUARDAR_VENTILADOR':
        return _auditar(ctx, accion, () => guardarVentilador(datos, ctx), datos);
      case 'MOVER_VENTILADOR':
        return _auditar(ctx, accion, () => moverVentilador(datos, ctx), datos);
      case 'MOVER_VENTILADORES_LOTE':
        return _auditar(ctx, accion, () => moverVentiladoresLote(datos, ctx), datos);
      case 'BAJA_VENTILADOR':
        return _auditar(ctx, accion, () => bajaVentilador(datos, ctx), datos);
      case 'REGISTRAR_FALLA_VM':
        return _auditar(ctx, accion, () => registrarFallaVM(datos, ctx), datos);
      case 'GUARDAR_STOCK':
        return _auditar(ctx, accion, () => guardarStockEquipo(datos, ctx), datos);
      case 'AJUSTAR_STOCK':
        return _auditar(ctx, accion, () => ajustarStockEquipo(datos, ctx), datos);
      case 'ASIGNAR_STOCK':
        return _auditar(ctx, accion, () => asignarStockACama(datos, ctx), datos);

      // ── MODO COORDINACIÓN (ago-2026) ────────────────────────────────────
      // Cada una vuelve a exigir la sesión DENTRO de svc_coordinacion, no aquí:
      // con AUTH_DEV_MODE=TRUE cualquiera llega a este dispatcher, así que la
      // pantalla no protege nada y el candado tiene que vivir en el servicio.
      // Tampoco pasan por _auditar: se auditan solas, con la firma de quien
      // entró al modo (MCC/DMV/MFB), no con la del turno.
      case 'COORD_ESTADO':       return coordEstado(datos);
      case 'COORD_ENTRAR':       return coordEntrar(datos);
      // Simétrica de ENTRAR: mata el token en el servidor. Sin esto, «Salir»
      // solo limpiaba el navegador y la sesión seguía viva hasta 30 min.
      case 'COORD_SALIR':        return coordCerrarSesion(datos);
      // Recuperación por correo: escrita y APAGADA (CONFIG.COORD_RECUPERA_CORREO).
      // Las dos rechazan mientras el interruptor esté en FALSE.
      case 'COORD_PEDIR_CODIGO': return coordPedirCodigo(datos);
      case 'COORD_RECUPERAR':    return coordRecuperarConCodigo(datos);
      case 'COORD_CAMBIAR_CLAVE':return coordCambiarClave(datos);
      case 'COORD_RESTABLECER':  return coordRestablecerClave(datos);
      case 'COORD_FICHA':        return coordFicha(datos);
      case 'COORD_CORREGIR':     return coordCorregirFicha(datos);

      default:
        return err('Acción desconocida: "' + accion + '"', ERR.VALIDACION);
    }
  } catch (e) {
    return err('Error en ' + accion + ': ' + e.message, ERR.INTERNO, e);
  }
}

/**
 * 🎂 Cumpleaños de HOY, desde la columna CUMPLE de KINESIOLOGOS
 * (2-sep-2026, pedido de Diego: «darle un toque mucho más humano y más
 * cercano a la plataforma»).
 *
 * Devuelve [{firma, nombre}] — puede venir más de uno el mismo día.
 * · La fecha se lee como 'dd-mm' o 'dd/mm'; el AÑO no se guarda ni se usa.
 * · Solo entran los ACTIVOS: nadie saluda a quien ya no está en la unidad.
 * · Si la columna no existe todavía (planilla sin reparar), devuelve [] y no
 *   revienta: la mascota simplemente sigue como siempre.
 * 🔴 Son datos personales de los funcionarios. Salen SOLO a la pantalla de la
 *    app; no van a ninguna exportación, ni al REM, ni al imprimible.
 */
function cumpleanosDeHoy(fechaISO) {
  try {
    const f = String(fechaISO || hoyISO()).slice(0, 10);
    const dd = f.slice(8, 10), mm = f.slice(5, 7);
    const hoy = dd + '-' + mm;
    return repoLeerTodos('KINESIOLOGOS')
      .filter(function (k) {
        if (String(k.ACTIVO) === 'false' || k.ACTIVO === false) return false;
        const c = String(k.CUMPLE || '').trim();
        if (!c) return false;
        // Acepta dd-mm, dd/mm y de paso dd-mm-aaaa (el año se ignora).
        const m = c.match(/^(\d{1,2})[-\/.](\d{1,2})/);
        if (!m) return false;
        const p2 = function (n) { return ('0' + parseInt(n, 10)).slice(-2); };
        return p2(m[1]) + '-' + p2(m[2]) === hoy;
      })
      .map(function (k) { return { firma: String(k.FIRMA || ''), nombre: String(k.NOMBRE || '') }; });
  } catch (e) { return []; }
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
    // Visor de imágenes: vacío = sin botón 🩻 (ver CONFIG.SYNAPSE_URL).
    SYNAPSE_URL: String(leerConfig('SYNAPSE_URL', '') || '').trim(),
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
    // 🚀 El cliente manda su sello de versión: la primera vez que el servidor
    // ve uno nuevo, queda registrado en el buzón («se publicó la vX.Y»).
    try { if (typeof notifVersionVista === 'function') notifVersionVista(datos && datos.version); } catch (e) {}
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
      // 🎂 Quién está de cumpleaños hoy (vacío casi todos los días).
      cumples: cumpleanosDeHoy((datos && datos.fecha) || hoyISO()),
      camas: (rCamas && rCamas.ok) ? rCamas.data : [],
      evos: (rEvos && rEvos.ok) ? rEvos.data : [],
      asignacion: asignacion,
      // Reloj del servidor: evita la llamada aparte GET_FECHA_HOY al arrancar
      // (el cliente compara para avisar si el equipo tiene mal la hora).
      ahora: ahoraTS(),
      // Recordatorio de cierre de año (solo entre el 26-dic y febrero, y solo
      // si quedan evoluciones de egresados del año anterior sin trasladar).
      cierre: (typeof avisoCierreAnio === 'function') ? avisoCierreAnio() : null,
      // 🔔📨 La campana (cálculo en vivo) y el buzón (hoja NOTIFICACIONES),
      // para que los números salgan pintados desde el arranque.
      alertas: (typeof alertasUnidad === 'function') ? alertasUnidad((datos && datos.fecha) || hoyISO()) : [],
      notifs: (function () { try { const r = notifListar({}); return (r && r.ok) ? r.data.notifs : []; } catch (e) { return []; } })(),
    });
  } catch (e) { return err('obtenerBoot: ' + e.message, ERR.INTERNO, e); }
}

/** Ejecuta fn y, si resultó ok, deja registro en AUDIT_LOG. */
function _auditar(ctx, accion, fn, datos) {
  const r = fn();
  if (r && r.ok) {
    const d = r.data || {};
    auditar({
      email: ctx.email, firma: ctx.firma, accion: accion,
      entidad: d.entidad || '', idEntidad: d.idCama || d.idEvolucion || d.id || '',
      patientId: d.patientId || '', resumen: d.accion || accion,
    });
    return r;
  }
  /* 🔴 EL RECHAZO TAMBIÉN SE AUDITA (ago-2026). Hasta aquí solo se escribía la
     traza `if (r && r.ok)`: un rechazo no dejaba rastro de ninguna clase. Eso
     era tolerable mientras los rechazos eran errores de tipeo, y dejó de serlo
     cuando el ➕ empezó a NEGARSE a escribir sobre una cama con dos pacientes.
     Sin esta fila no hay forma de saber a posteriori que alguien intentó
     corregir un turno, no pudo, y abandonó — que es el riesgo que el propio
     diseño del candado reconoce y no podía detectar.

     Solo `VALIDACION`: un `INTERNO` es una excepción y ya se registra en el log
     de ejecuciones; duplicarlo aquí llenaría AUDIT_LOG de ruido.

     El `idEntidad` sale del payload de ENTRADA, porque una respuesta de rechazo
     no trae `data`. Y el resumen se acota: lleva el motivo tal como se le mostró
     a la persona, que por construcción nombra la cama pero no al otro paciente. */
  if (r && r.ok === false && r.codigo === ERR.VALIDACION) {
    const dd = datos || {};
    auditar({
      email: ctx.email, firma: ctx.firma, accion: accion + '_RECHAZADO',
      entidad: '', idEntidad: dd.idCama || dd.idEvolucion || dd.id || '',
      patientId: dd.patientId || '', resumen: String(r.error || '').slice(0, 300),
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
