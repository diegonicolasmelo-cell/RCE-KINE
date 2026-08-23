/**
 * svc_rem_puente.gs — El REM del mes viaja solo a REM Hospital.
 *
 * Hasta aquí el REM 28 terminaba en una hoja que alguien copiaba a mano al
 * formulario de Estadística. Este puente cierra el último tramo: los REGISTROS
 * del mes salen del RCE y entran en REM Hospital, que deriva ahí sus casillas
 * con su propio motor y se las presenta al jefe de la unidad para enviarlas.
 *
 * ── Por qué viajan registros y no cifras ──────────────────────────────────
 * REM Hospital no guarda ninguna cifra como fuente de verdad: cada casilla se
 * deriva al pedirla y se abre hasta los registros que la componen. Mandarle un
 * total ya sumado rompería eso y dejaría a Estadística con un número que no
 * puede auditar. Mandándole los registros, cualquiera puede tocar una casilla y
 * ver de qué turnos salió.
 *
 * Y como los dos sistemas calculan por su cuenta, la carga lleva un bloque
 * `control` con lo que el RCE calculó. El destino compara. Si los dos motores
 * no dan lo mismo, se sabe ANTES de que el mes llegue a Estadística.
 *
 * ── Privacidad (Ley 19.628 y criterio del hospital) ───────────────────────
 * Del RCE NO sale ni NOMBRE ni RUT. La identidad que viaja es el PATIENT_ID
 * del episodio y las INICIALES, que es exactamente la identidad con la que la
 * unidad de kinesiología ya está configurada en REM Hospital. Hay una guardia
 * que lee el paquete armado y falla si encuentra cualquiera de los dos.
 *
 * Configuración (hoja CONFIG):
 *    REM_HOSPITAL_URL     https://rem.129-151-121-123.sslip.io
 *    REM_HOSPITAL_TOKEN   el token de carga de la unidad
 */

// Turnos: el RCE trabaja Día/Noche; en REM Hospital la unidad de kine tiene
// 'Largo' y 'Noche' (así se llama su turno de día en el catálogo).
const _PUENTE_TURNO = { 'Dia': 'Largo', 'Día': 'Largo', 'Noche': 'Noche' };

/** Iniciales de un nombre, que es lo único de la identidad que puede salir. */
function _puenteIniciales(nombre) {
  const partes = String(nombre || '').replace(/-/g, ' ').split(/\s+/).filter(function (p) { return p; });
  const ini = partes.map(function (p) { return p.charAt(0); }).join('').toUpperCase().slice(0, 4);
  return ini || 'NN';
}

function _puenteMotivoEgreso(motivo, destino) {
  const m = String(motivo || '').toLowerCase();
  if (/fallec/.test(m)) return 'Fallecimiento';
  if (/abandono/.test(m)) return 'Abandono';
  if (/traslad/.test(String(destino || '').toLowerCase())) return 'Traslado';
  if (/alta|traslad/.test(m)) return 'Alta';
  return 'Otro';
}

/**
 * Arma el paquete del mes: episodios, atenciones y procedimientos, más el
 * bloque de control con lo que este sistema calculó.
 * @return {Object} el payload, sin nombre ni RUT.
 */
function exportarRegistrosREM(anio, mes) {
  anio = String(anio || '').trim();
  mes = String(mes || '').trim();
  if (!/^\d{4}$/.test(anio) || !/^\d{1,2}$/.test(mes)) {
    return err('Indica año y mes válidos.', ERR.VALIDACION);
  }
  const mm = mes.length === 1 ? '0' + mes : mes;
  const prefijo = anio + '-' + mm;
  const enMes = function (f) { return _statISO(f).indexOf(prefijo) === 0; };

  const evos = repoLeerTodos('EVOLUCIONES').concat(repoLeerTodos('EVOLUCIONES_ARCHIVO'));
  const delMes = evos.filter(function (e) { return enMes(e.FECHA) && e.PATIENT_ID; });
  const archivo = repoLeerTodos('ARCHIVO_PACIENTES');
  const camas = repoLeerTodos('CAMAS_ESTADO');

  // ── Episodios con actividad en el mes ──
  const porPid = {};
  delMes.forEach(function (e) {
    const pid = String(e.PATIENT_ID);
    (porPid[pid] = porPid[pid] || []).push(e);
  });

  const fichaPorPid = {}, camaPorPid = {};
  archivo.forEach(function (a) { if (a.PATIENT_ID) fichaPorPid[String(a.PATIENT_ID)] = a; });
  camas.forEach(function (c) { if (c.PATIENT_ID) camaPorPid[String(c.PATIENT_ID)] = c; });

  const episodios = [], atenciones = [], procedimientos = [];
  Object.keys(porPid).forEach(function (pid) {
    const filas = porPid[pid].slice().sort(function (a, b) {
      return String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY));
    });
    const ficha = fichaPorPid[pid], cama = camaPorPid[pid];
    const primera = filas[0];

    // El ingreso puede ser de un mes anterior: se toma de la ficha o de la cama.
    const fIngreso = _statISO((ficha && ficha.FECHA_INGRESO) || (cama && cama.FECHA_INGRESO) || primera.FECHA);
    const epi = {
      ref: pid,
      iniciales: _puenteIniciales(primera.PAC_NOMBRE || (ficha && ficha.NOMBRE) || (cama && cama.NOMBRE)),
      cama: String(primera.ID_CAMA || (cama && cama.ID_CAMA) || ''),
      sexo: String(primera.PAC_SEXO || (ficha && ficha.SEXO) || (cama && cama.SEXO) || ''),
      edad: parseInt(primera.PAC_EDAD || (ficha && ficha.EDAD) || (cama && cama.EDAD), 10) || 0,
      dx: String(primera.PAC_DIAG_REM || (ficha && ficha.DIAG_REM) || (cama && cama.DIAG_REM) || 'Otros'),
      f_ingreso: fIngreso,
    };
    if (ficha && ficha.FECHA_EGRESO) {
      epi.f_egreso = _statISO(ficha.FECHA_EGRESO);
      epi.motivo_egreso = _puenteMotivoEgreso(ficha.MOTIVO_EGRESO, ficha.DESTINO_EGRESO);
    }
    episodios.push(epi);

    filas.forEach(function (e) {
      const fecha = _statISO(e.FECHA);
      const turno = _PUENTE_TURNO[String(e.TURNO)] || 'Largo';
      const ktr = Math.max(0, parseInt(e.RESP_KTR_CANT, 10) || 0);
      if (ktr > 0) atenciones.push({ ref: pid, fecha: fecha, turno: turno, tipo: 'KTR', cantidad: ktr });
      if (esVerdadero(e.KTM_REALIZADA)) {
        const ktm = Math.min(9, Math.max(1, parseInt(e.KTM_CANT, 10) || 1));
        atenciones.push({ ref: pid, fecha: fecha, turno: turno, tipo: 'KTM', cantidad: ktm });
      } else if (esVerdadero(e.KTM_SUSPENDIDA)) {
        atenciones.push({ ref: pid, fecha: fecha, turno: turno, tipo: 'KTM contraindicada', cantidad: 1 });
      }
      _puenteProcedimientos(e).forEach(function (nombre) {
        procedimientos.push({ ref: pid, fecha: fecha, turno: turno, procedimiento: nombre });
      });
    });
  });

  // Las reintubaciones tienen hoja propia: son el registro de referencia.
  repoLeerTodos('REINTUBACIONES').filter(function (r) { return enMes(r.FECHA); }).forEach(function (r) {
    const pid = String(r.PATIENT_ID || '');
    if (!porPid[pid]) return;
    procedimientos.push({
      ref: pid, fecha: _statISO(r.FECHA), turno: _PUENTE_TURNO[String(r.TURNO)] || 'Largo',
      procedimiento: 'REINTUBACIÓN',
    });
  });

  // ── Control: lo que ESTE sistema calculó, para que el destino contraste ──
  let control = null;
  const rem = generarREM(anio, mes, {});
  if (rem && rem.ok) {
    control = {
      ingresos: rem.data.ingresos,
      egresos: rem.data.egresosAlta + rem.data.egresosFallecimiento,
      ktr: rem.data.sumKTR,
      ktm: rem.data.sumKTM,
      sesiones: rem.data.sesiones,
    };
  }

  return ok({
    sistema: 'RCE-KINE', anio: parseInt(anio, 10), mes: parseInt(mm, 10),
    episodios: episodios, atenciones: atenciones, procedimientos: procedimientos,
    control: control,
  });
}

/** Procedimientos de vía aérea registrados en un turno, con el vocabulario del destino. */
function _puenteProcedimientos(e) {
  const lista = [];
  if (esVerdadero(e.INTUB_OCURRIO)) lista.push('INTUBACIÓN');
  if (String(e.PVE_RESULTADO || '') !== '') lista.push('PVE');
  if (esVerdadero(e.EXT_OCURRIO)) {
    const tipo = String(e.EXT_TIPO || '');
    if (/auto/i.test(tipo)) lista.push('AUTOEXTUBACIÓN');
    else if (/accident/i.test(tipo)) lista.push('EXTUBACIÓN ACCIDENTAL');
    else lista.push(String(e.PVE_RESULTADO || '') !== '' ? 'EXTUBACIÓN C/PROTOCOLO' : 'EXTUBACIÓN S/PROTOCOLO');
  }
  if (esVerdadero(e.TQT_OCURRIO)) lista.push('TQT');
  if (esVerdadero(e.TQT_CAMBIO)) lista.push('CAMBIO TQT');
  if (esVerdadero(e.TOT_CAMBIO)) lista.push('CAMBIO TOT');
  if (esVerdadero(e.DESVINC_OCURRIO)) lista.push('DESVINCULACIÓN');
  return lista;
}

/**
 * Manda el mes a REM Hospital. Devuelve lo que respondió el destino: cuántos
 * registros entraron, los avisos de lo que no calzó y el contraste de cifras.
 */
function enviarRegistrosREM(anio, mes, ctx) {
  const url = String(leerConfig('REM_HOSPITAL_URL', '')).replace(/\/+$/, '');
  const token = String(leerConfig('REM_HOSPITAL_TOKEN', ''));
  if (!url || !token) {
    return err('Falta configurar REM_HOSPITAL_URL y REM_HOSPITAL_TOKEN en la hoja CONFIG.',
      ERR.VALIDACION);
  }
  const paquete = exportarRegistrosREM(anio, mes);
  if (!paquete.ok) return paquete;

  try {
    const resp = UrlFetchApp.fetch(url + '/api/ingesta', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'X-REM': '1', 'Authorization': 'Bearer ' + token },
      payload: JSON.stringify(paquete.data),
      muteHttpExceptions: true,
    });
    const codigo = resp.getResponseCode();
    let cuerpo = {};
    try { cuerpo = JSON.parse(resp.getContentText()); } catch (ig) {}
    if (codigo !== 200) {
      return err('REM Hospital respondió ' + codigo + ': ' + (cuerpo.error || resp.getContentText()),
        ERR.INTERNO);
    }
    _auditarPuente(anio, mes, cuerpo, ctx);
    return ok(cuerpo);
  } catch (e) {
    return err('No se pudo hablar con REM Hospital: ' + e.message, ERR.INTERNO);
  }
}

function _auditarPuente(anio, mes, resp, ctx) {
  try {
    const contraste = resp.contraste
      ? (resp.contraste.cuadra ? 'cifras cuadran' : 'CIFRAS NO CUADRAN')
      : 'sin contraste';
    repoInsertar('AUDIT_LOG', {
      ID: uid('AUD'), TIMESTAMP: ahoraTS(), USUARIO_EMAIL: (ctx && ctx.email) || '',
      FIRMA: (ctx && ctx.firma) || '', ACCION: 'enviarRegistrosREM', ENTIDAD: 'REM',
      ID_ENTIDAD: anio + '-' + mes,
      RESUMEN: resp.episodios + ' episodios · ' + resp.atenciones + ' atenciones · ' +
        resp.procedimientos + ' procedimientos · ' + contraste,
    });
  } catch (ig) {}
}
