/**
 * ============================================================
 *  07_WebApp.gs — Punto de entrada Web App (doGet / doPost)
 *  RCE KINE UCIA | GAS-v1.3
 *
 *  CAMBIOS v1.3:
 *  + doGet con routing: soporta ?page=informe para el
 *    Informe Estadístico Anual (archivo informe.html).
 *  + Resto del código sin cambios.
 * ============================================================
 */

// ═══════════════════════════════════════════════════════════
//  doGet — Sirve el HTML según ?page= (routing simple)
// ═══════════════════════════════════════════════════════════

function doGet(e) {
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('RCE KINE UCIA')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0');
}

// ═══════════════════════════════════════════════════════════
//  DISPATCHER — Todas las llamadas del frontend pasan aquí
// ═══════════════════════════════════════════════════════════

function procesarRequest(accion, datos) {
  console.log(`[RCE] REQUEST: ${accion}`, JSON.stringify(datos || {}).substring(0, 200));

  try {
    switch (accion) {

      // ── DASHBOARD ──────────────────────────────────────────
      case 'GET_TODAS_CAMAS':
        return obtenerTodasLasCamas();

      case 'GET_CAMA':
        return obtenerCama(datos.idCama);

      // ── INGRESO / ALTA ──────────────────────────────────────
      case 'INGRESAR_PACIENTE':
        return ingresarPaciente(datos);

      case 'DAR_ALTA':
        return darAltaPaciente(datos);

      case 'LIMPIAR_CAMA':
        return limpiarCama(datos.idCama);

      case 'TRASLADAR_PACIENTE':
        return trasladarPaciente(datos.idCamaOrigen, datos.idCamaDestino);

      // ── EVOLUCIONES ─────────────────────────────────────────
      case 'GUARDAR_EVOLUCION':
        return guardarEvolucion(datos);

      case 'GET_EVOLUCION':
        return obtenerEvolucion(datos.idCama, datos.turnoKey);

      case 'GET_EVOLUCION_PREVIA':
        return obtenerEvolucionPrevia(datos.idCama, datos.turnoKey);

      case 'GET_EVOLUCIONES_RECIENTES':
        return obtenerEvolucionesRecientes(datos.idCama, datos.limite || 14);

      case 'GET_EVOLUCIONES_HOY':
        return obtenerEvolucionesHoy(datos.fecha || fechaHoyISO());

      // ── PROCEDIMIENTOS ──────────────────────────────────────
      case 'GET_PROCEDIMIENTOS':
        return obtenerProcedimientos(datos.idEvolucion);

      // ── TIMELINE ────────────────────────────────────────────
      case 'AGREGAR_HITO':
        return agregarHito(datos);

      case 'GET_TIMELINE':
        return obtenerTimeline(datos.idCama);

      case 'GET_HISTORIAL_PACIENTE':
        return obtenerHistorialPaciente(datos.idCama);

      case 'GET_ARCHIVOS':
        return obtenerArchivos(datos || {});

      case 'GET_ARCHIVO_DETALLE':
        return obtenerArchivoDetalle(datos.idArchivo);

      // ── ESTADÍSTICAS REM ────────────────────────────────────
      case 'GENERAR_REM':
        return generarREM(datos.anio, datos.mes);

      // ── DASHBOARD / PANEL DE ESTADÍSTICAS ───────────────────
      case 'GET_ESTADISTICAS':
        return obtenerEstadisticas(datos.desde, datos.hasta);

      // ── TABLA DINÁMICA DE ACTIVIDAD (quién hizo qué) ────────
      case 'GET_ACTIVIDAD':
        return obtenerActividad(datos.desde, datos.hasta);

      // ── DÍAS VM/VNI HISTÓRICOS por cama (tabla Pacientes) ───
      case 'GET_DIAS_VENT':
        return obtenerDiasVentilatorios(datos.fecha);

      // ── TABLERO DE TURNOS (asignación camas ↔ kinesiólogo) ──
      case 'GET_ASIGNACION_TURNO':
        return getAsignacionTurno(datos);

      case 'SET_ASIGNACION_TURNO':
        return setAsignacionTurno(datos);

      // ── ENTREGA DE TURNO ────────────────────────────────────
      case 'GET_ENTREGA_TURNO':
        return obtenerEntregaTurno(datos.idCamas, datos.fecha, datos.turno);

      case 'GUARDAR_ENTREGA_TURNO':
        return guardarEntregaTurno(datos);

      case 'GET_ENTREGAS_TURNO':
        return obtenerEntregasTurno(datos.limite);

      // ── UTILIDADES ──────────────────────────────────────────
      case 'GET_FECHA_HOY':
        return ok({ fecha: fechaHoyISO(), timestamp: timestampAhora() });

      case 'CALCULAR_PI':
        return ok({ pi: calcularPI(datos.sexo, datos.talla) });

      case 'GENERAR_TEXTO':
        return ok({ texto: generarTextoEvolucion(datos) });

      default:
        return err(`Acción desconocida: "${accion}"`);
    }
  } catch (e) {
    console.error(`[RCE] ERROR en ${accion}:`, e);
    return err(`Error en ${accion}: ${e.message}`, e);
  }
}
