/**
 * svc_rem.gs — Reporte REM mensual (portado del generador v1, adaptado a v2).
 *
 * Agrega las evoluciones y egresos del mes y produce el informe de texto
 * para estadística (ingresos, días-cama, turnos con VM, KTM realizadas y
 * suspendidas, sesiones KTR y desglose por diagnóstico REM). Guarda/actualiza
 * la fila del mes en ESTADISTICAS_REM (upsert por MES).
 *
 * v2 vs v1: pacientes únicos por PATIENT_ID (v1 usaba camas únicas) y
 * KTR = sesiones RESP_KTR_CANT (v1 sumaba el NIVEL de KTM por error de nombre).
 * Cuando llegue el formato oficial de REM solo se ajusta la sección de salida.
 */

function generarREM(anio, mes, ctx) {
  try {
    anio = String(anio || '').trim();
    mes = String(mes || '').trim();
    if (!/^\d{4}$/.test(anio) || !/^\d{1,2}$/.test(mes)) return err('Indica año y mes válidos.', ERR.VALIDACION);
    const mm = mes.length === 1 ? '0' + mes : mes;
    const prefijo = anio + '-' + mm;

    // ── Evoluciones del mes ──
    const evoMes = repoLeerTodos('EVOLUCIONES').filter(function (e) {
      return _statISO(e.FECHA).indexOf(prefijo) === 0;
    });

    let turnosVM = 0, turnosKTM = 0, turnosKTMC = 0, sumKTR = 0, ingresosMarcados = 0;
    const diagRemPorPaciente = {};   // PATIENT_ID → último diagnóstico REM
    const pacientes = {};
    evoMes.forEach(function (e) {
      const pid = String(e.PATIENT_ID || e.COD_PACIENTE || 'sin-id');
      pacientes[pid] = true;
      if (e.PAC_DIAG_REM) diagRemPorPaciente[pid] = e.PAC_DIAG_REM;
      if (e.VENT_SOPORTE === 'VM') turnosVM++;
      if (esVerdadero(e.KTM_REALIZADA)) turnosKTM++;
      if (esVerdadero(e.KTM_SUSPENDIDA)) turnosKTMC++;
      const kt = parseInt(e.RESP_KTR_CANT); if (kt > 0) sumKTR += kt;
      if (esVerdadero(e.ES_INGRESO)) ingresosMarcados++;
    });

    const diagRemCount = {};
    Object.keys(diagRemPorPaciente).forEach(function (pid) {
      const dgr = diagRemPorPaciente[pid];
      diagRemCount[dgr] = (diagRemCount[dgr] || 0) + 1;
    });

    // ── Egresos del mes (ARCHIVO_PACIENTES) ──
    const archMes = repoLeerTodos('ARCHIVO_PACIENTES').filter(function (a) {
      return _statISO(a.FECHA_EGRESO).indexOf(prefijo) === 0;
    });

    const totalIngresos = ingresosMarcados || Object.keys(pacientes).length;
    const pacientesAtendidos = Object.keys(pacientes).length;
    const diasCamaTotal = evoMes.length;   // turnos evolucionados = actividad registrada
    const ktrProm = turnosKTM > 0 ? Math.round((sumKTR / Math.max(evoMes.length, 1)) * 100) / 100 : 0;

    const nombreMes = new Date(parseInt(anio), parseInt(mm) - 1, 1)
      .toLocaleString('es-CL', { month: 'long', year: 'numeric' });

    let textoREM = 'REPORTE REM KINESIOLOGÍA UCI — ' + nombreMes.toUpperCase() + '\n';
    textoREM += Array(51).join('─') + '\n';
    textoREM += 'Pacientes atendidos en el período: ' + pacientesAtendidos + '\n';
    textoREM += 'Ingresos del período:              ' + totalIngresos + '\n';
    textoREM += 'Egresos del período:               ' + archMes.length + '\n\nDIAGNÓSTICO REM (por paciente):\n';
    Object.keys(diagRemCount)
      .sort(function (a, b) { return diagRemCount[b] - diagRemCount[a]; })
      .forEach(function (lbl) {
        textoREM += '  ' + (lbl + Array(36).join(' ')).slice(0, 35) + ' ' + diagRemCount[lbl] + '\n';
      });
    textoREM += '\nACTIVIDAD KINESIOLÓGICA:\n';
    textoREM += '  Turnos evolucionados (días-cama): ' + diasCamaTotal + '\n';
    textoREM += '  Turnos con ventilación mecánica:  ' + turnosVM + '\n';
    textoREM += '  KTM realizadas:                   ' + turnosKTM + '\n';
    textoREM += '  KTM suspendidas (KTMC):           ' + turnosKTMC + '\n';
    textoREM += '  Sesiones KTR del período:         ' + sumKTR + '\n';
    textoREM += '  KTR promedio por turno:           ' + ktrProm + '\n';

    const fila = {
      MES: prefijo, INGRESOS: totalIngresos, DIAS_CAMA: diasCamaTotal,
      TURNOS_VM: turnosVM, TURNOS_KTM: turnosKTM, TURNOS_KTMC: turnosKTMC,
      SUM_KTR: sumKTR, KTR_PROM: ktrProm,
      DIAG_JSON: JSON.stringify(diagRemCount), TEXTO_REM: textoREM,
      GENERADO_TS: ahoraTS(), GENERADO_POR: (ctx && ctx.email) || '',
    };
    repoUpsert('ESTADISTICAS_REM', 'MES', prefijo, fila);

    return ok({
      mesKey: prefijo, pacientesAtendidos: pacientesAtendidos, totalIngresos: totalIngresos,
      egresos: archMes.length, diasCamaTotal: diasCamaTotal, turnosVM: turnosVM,
      turnosKTM: turnosKTM, turnosKTMC: turnosKTMC, sumKTR: sumKTR, ktrProm: ktrProm,
      diagRemCount: diagRemCount, textoREM: textoREM,
    });
  } catch (e) { return err('generarREM: ' + e.message, ERR.INTERNO, e); }
}
