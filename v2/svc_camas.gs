/**
 * svc_camas.gs — Censo, ingreso, egreso, traslado (intercambio / mover a cama vacía).
 * Identidad de episodio: PATIENT_ID (uuid) generado UNA vez en el ingreso (ruta única).
 * COD_PACIENTE (legible) reemplaza al RUT.
 */

// ── LECTURA ────────────────────────────────────────────────
function obtenerTodasLasCamas() {
  try {
    const hoy = hoyISO();
    const camas = repoLeerTodos('CAMAS_ESTADO');
    camas.forEach(c => {
      if (esVerdadero(c.OCUPADA)) {
        c.OCUPADA = true;
        c.DIA_ESTADIA = diasEntre(c.FECHA_INGRESO, hoy);
        c.DIAS_VM = (c.SOPORTE === 'VM') ? diasEntre(c.FECHA_INICIO_SOPORTE, hoy) : 0;
        c.DIAS_VA = (c.VIA_AEREA && c.VIA_AEREA !== 'Natural') ? diasEntre(c.FECHA_INICIO_VA, hoy) : 0;
        try { c.TIMELINE = c.TIMELINE_JSON ? JSON.parse(c.TIMELINE_JSON) : []; } catch (e) { c.TIMELINE = []; }
      } else {
        c.OCUPADA = false; c.DIA_ESTADIA = 0; c.DIAS_VM = 0; c.DIAS_VA = 0; c.TIMELINE = [];
      }
    });
    return ok(camas);
  } catch (e) { return err('obtenerTodasLasCamas: ' + e.message, ERR.INTERNO, e); }
}

function obtenerCama(idCama) {
  try {
    const c = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(idCama));
    if (!c) return err('Cama "' + idCama + '" no encontrada.', ERR.NO_ENCONTRADO);
    const hoy = hoyISO();
    if (esVerdadero(c.OCUPADA)) {
      c.OCUPADA = true;
      c.DIA_ESTADIA = diasEntre(c.FECHA_INGRESO, hoy);
      c.DIAS_VM = (c.SOPORTE === 'VM') ? diasEntre(c.FECHA_INICIO_SOPORTE, hoy) : 0;
      c.DIAS_VA = (c.VIA_AEREA && c.VIA_AEREA !== 'Natural') ? diasEntre(c.FECHA_INICIO_VA, hoy) : 0;
    } else { c.OCUPADA = false; }
    try { c.TIMELINE = c.TIMELINE_JSON ? JSON.parse(c.TIMELINE_JSON) : []; } catch (e) { c.TIMELINE = []; }
    return ok(c);
  } catch (e) { return err('obtenerCama: ' + e.message, ERR.INTERNO, e); }
}

// ── INGRESO ────────────────────────────────────────────────
function ingresarPaciente(datos, ctx) {
  const errores = validarPayloadIngreso(datos);
  if (errores.length) return err('Validación: ' + errores.join('; '), ERR.VALIDACION);
  ctx = ctx || {};

  return conLock(() => {
    try {
      const idCama = String(datos.idCama || datos.ID_CAMA);
      const cama = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
      if (!cama) return err('Cama "' + idCama + '" no encontrada.', ERR.NO_ENCONTRADO);
      if (esVerdadero(cama.OCUPADA)) return err('La cama ' + idCama + ' ya está ocupada.', ERR.VALIDACION);

      const nombre = String(datos.nombre || datos.NOMBRE || '').trim();
      const edad   = datos.edad || datos.EDAD || '';
      const sexo   = datos.sexo || datos.SEXO || '';
      const talla  = datos.talla || datos.TALLA_CM || '';
      const fecha  = datos.fechaIngreso || hoyISO();
      const via    = datos.viaAerea || 'Natural';
      const sop    = datos.soporte || 'Ambiente';

      const esTOT = via === 'TOT', esTQT = via === 'TQT';
      const tieneVA = esTOT || esTQT || via === 'Full Face' || via === 'Oronasal';
      const tieneVM = sop === 'VM' || sop === 'VNI';

      const patientId = Utilities.getUuid();
      const cod = _codUnico(generarCodPaciente(nombre, edad, fecha));

      repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, {
        OCUPADA: true, STATUS_CAMA: 'Ocupada', PATIENT_ID: patientId, COD_PACIENTE: cod,
        NOMBRE: nombre, EDAD: edad, SEXO: sexo, TALLA_CM: talla,
        PESO_IDEAL_KG: calcularPI(sexo, talla) || '',
        BARTHEL: datos.barthel || '', ECF: datos.ecf || '',
        DIAGNOSTICO: datos.diagnostico || '', DIAG_REM: datos.diagRem || '',
        AISLAMIENTO: esVerdadero(datos.aislamiento), AISL_MICRO: datos.aislMicro || '',
        VIA_AEREA: via, TOT_NUMERO: esTOT ? (datos.totNum || '') : '',
        TOT_CM_LABIO: esTOT ? (datos.totCm || '') : '', TQT_TIPO: esTQT ? (datos.tqtTipo || '') : '',
        SOPORTE: sop, MODO: datos.modo || 'Sin soporte',
        FECHA_INGRESO: fecha, FECHA_INICIO_VA: tieneVA ? fecha : '', FECHA_INICIO_SOPORTE: tieneVM ? fecha : '',
        FASE_JSON: datos.faseJson || '', KTM_NIVEL: datos.ktmNivel || '', KTM_SUSP: false,
        FIRMA_KINE: ctx.firma || datos.firmaKine || '', AUTOR_EMAIL: ctx.email || '',
        ULTIMO_TURNO_KEY: '',
      });

      _agregarHitoInterno({
        idCama, patientId, fecha, turno: datos.turno || 'Dia', tipo: 'ingreso',
        texto: 'Ingreso a UCI. Dx: ' + (datos.diagnostico || 'Sin especificar'),
        autor: ctx.firma || '', autorEmail: ctx.email || '',
      });

      SpreadsheetApp.flush();
      return ok({ idCama, accion: 'ingreso', patientId, cod, entidad: 'CAMAS_ESTADO' });
    } catch (e) { return err('ingresarPaciente: ' + e.message, ERR.INTERNO, e); }
  });
}

// ── EGRESO / ALTA ──────────────────────────────────────────
/**
 * Interpretación de egreso con cortes configurables desde CONFIG
 * (CORTE_MRC_DAUCI, CORTE_MRC_SEVERA, CORTE_DINAMO_H/M, CORTE_FSS_INDEP).
 */
function _interpEgreso(mrc, fss, dinamo, sexo) {
  const out = { DAUCI: '', MRC_INTERP: '', FSS_INTERP: '', DINAMO_INTERP: '' };
  const m = parseFloat(mrc);
  if (!isNaN(m)) {
    const cDauci = parseFloat(leerConfig('CORTE_MRC_DAUCI', '48'));
    const cSev = parseFloat(leerConfig('CORTE_MRC_SEVERA', '36'));
    out.DAUCI = m < cDauci;
    out.MRC_INTERP = m < cSev ? ('DAUCI severa (<' + cSev + ')')
                  : m < cDauci ? ('DAUCI (<' + cDauci + ')')
                  : ('Sin DAUCI (\u2265' + cDauci + ')');
  }
  const f = parseFloat(fss);
  if (!isNaN(f)) {
    const cInd = parseFloat(leerConfig('CORTE_FSS_INDEP', '27'));
    out.FSS_INTERP = f <= 10 ? 'Dependencia severa'
                   : f <= 20 ? 'Dependencia moderada'
                   : f < cInd ? 'Asistencia mínima'
                   : ('Independencia funcional (\u2265' + cInd + ')');
  }
  const d = parseFloat(dinamo);
  if (!isNaN(d) && (sexo === 'M' || sexo === 'F')) {
    const corte = parseFloat(leerConfig(sexo === 'M' ? 'CORTE_DINAMO_H' : 'CORTE_DINAMO_M', sexo === 'M' ? '11' : '7'));
    out.DINAMO_INTERP = d < corte ? ('DAUCI por dinamometría (<' + corte + ' kg)') : ('Normal (\u2265' + corte + ' kg)');
  }
  return out;
}

function darAltaPaciente(datos, ctx) {
  ctx = ctx || {};
  return conLock(() => {
    try {
      const idCama = String(datos.idCama || datos.ID_CAMA);
      const rc = obtenerCama(idCama);
      if (!rc.ok) return rc;
      const cama = rc.data;
      if (!esVerdadero(cama.OCUPADA)) return err('La cama ' + idCama + ' ya está libre.', ERR.VALIDACION);

      const pid = cama.PATIENT_ID;
      const fechaEgreso = hoyISO();

      // Estadísticas del episodio (por PATIENT_ID, no por cama)
      const evos = pid ? repoLeerTodos('EVOLUCIONES', 'PATIENT_ID', pid) : [];
      let ktrTotal = 0, turnosVM = 0, turnosKTM = 0, turnosKTMC = 0;
      evos.forEach(e => {
        ktrTotal += parseInt(e.RESP_KTR_CANT) || 0;
        if (e.VENT_SOPORTE === 'VM') turnosVM++;
        if (esVerdadero(e.KTM_REALIZADA))  turnosKTM++;
        if (esVerdadero(e.KTM_SUSPENDIDA)) turnosKTMC++;
      });

      // Últimas evaluaciones registradas del episodio (si el egreso no las trae)
      const ult = {};
      evos.slice().sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY))).forEach(e => {
        ['EVAL_T_FSS', 'EVAL_T_MRC', 'EVAL_T_DINAMO', 'CPAX_TOTAL'].forEach(k => {
          if (e[k] !== '' && e[k] !== undefined && e[k] !== null) ult[k] = e[k];
        });
      });
      const fssEgr  = datos.fssEgreso   || ult.EVAL_T_FSS    || '';
      const mrcEgr  = datos.mrcSsEgreso || ult.EVAL_T_MRC    || '';
      const dinEgr  = datos.dinamoEgreso|| ult.EVAL_T_DINAMO || '';
      const cpaxEgr = ult.CPAX_TOTAL || '';
      const interp  = _interpEgreso(mrcEgr, fssEgr, dinEgr, cama.SEXO);

      repoInsertar('ARCHIVO_PACIENTES', {
        ID_ARCHIVO: uid('ARCH'), PATIENT_ID: pid, CAMA_ORIGEN: idCama, COD_PACIENTE: cama.COD_PACIENTE,
        FECHA_INGRESO: cama.FECHA_INGRESO, FECHA_EGRESO: fechaEgreso,
        DIAS_TOTAL: cama.DIA_ESTADIA, DIAS_VM_TOTAL: cama.DIAS_VM, DIAS_VA_TOTAL: cama.DIAS_VA,
        NOMBRE: cama.NOMBRE, EDAD: cama.EDAD, SEXO: cama.SEXO,
        DIAGNOSTICO: cama.DIAGNOSTICO, DIAG_REM: cama.DIAG_REM,
        MOTIVO_EGRESO: datos.motivoEgreso || '', DESTINO_EGRESO: datos.destinoEgreso || '',
        KTR_TOTAL: ktrTotal, TURNOS_VM: turnosVM, TURNOS_KTM: turnosKTM, TURNOS_KTMC: turnosKTMC,
        EXTUBACION_OK: esVerdadero(datos.extubacionOk), REINTUBACION: esVerdadero(datos.reintubacion),
        BARTHEL_INGRESO: cama.BARTHEL, BARTHEL_EGRESO: datos.barthelEgreso || '',
        FSS_EGRESO: fssEgr, MRC_SS_EGRESO: mrcEgr,
        DINAMO_EGRESO: dinEgr, CPAX_EGRESO: cpaxEgr,
        DAUCI: interp.DAUCI, MRC_INTERP: interp.MRC_INTERP,
        FSS_INTERP: interp.FSS_INTERP, DINAMO_INTERP: interp.DINAMO_INTERP,
        FIRMA_RESPONSABLE: ctx.firma || datos.firmaKine || '', AUTOR_EMAIL: ctx.email || '',
        OBSERVACIONES: datos.observaciones || '', TIMELINE_JSON: cama.TIMELINE_JSON || '[]',
        APNEA_JSON: datos.apneaJson || '', BDT_JSON: datos.bdtJson || '', FASE_FINAL: datos.faseFinal || '',
      });

      _agregarHitoInterno({
        idCama, patientId: pid, fecha: fechaEgreso, turno: datos.turno || 'Dia', tipo: 'egreso',
        texto: 'Alta de UCI. Motivo: ' + (datos.motivoEgreso || 'Sin especificar'),
        autor: ctx.firma || '', autorEmail: ctx.email || '',
      });

      // Partición (D5): mover las evoluciones del episodio al archivo histórico.
      if (pid) {
        evos.forEach(e => repoInsertar('EVOLUCIONES_ARCHIVO', e));
        repoEliminarDonde('EVOLUCIONES', e => e.PATIENT_ID === pid);
      }

      _limpiarCamaInterno(idCama);
      SpreadsheetApp.flush();
      return ok({ idCama, accion: 'alta', fecha: fechaEgreso, patientId: pid, entidad: 'ARCHIVO_PACIENTES' });
    } catch (e) { return err('darAltaPaciente: ' + e.message, ERR.INTERNO, e); }
  });
}

// ── TRASLADO: intercambio entre dos camas ocupadas ─────────
function intercambiarCamas(idA, idB, ctx) {
  ctx = ctx || {};
  return conLock(() => {
    try {
      const A = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(idA));
      const B = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(idB));
      if (!A || !B) return err('Cama origen o destino no encontrada.', ERR.NO_ENCONTRADO);

      const campA = Object.assign({}, B); campA.ID_CAMA = String(idA);
      const campB = Object.assign({}, A); campB.ID_CAMA = String(idB);
      repoActualizar('CAMAS_ESTADO', 'ID_CAMA', String(idA), campA);
      repoActualizar('CAMAS_ESTADO', 'ID_CAMA', String(idB), campB);

      const fecha = hoyISO();
      _agregarHitoInterno({ idCama: idA, patientId: B.PATIENT_ID, fecha, turno: 'Dia', tipo: 'general', texto: `Traslado a Cama ${idA} (desde ${idB})`, autor: ctx.firma || '', autorEmail: ctx.email || '' });
      _agregarHitoInterno({ idCama: idB, patientId: A.PATIENT_ID, fecha, turno: 'Dia', tipo: 'general', texto: `Traslado a Cama ${idB} (desde ${idA})`, autor: ctx.firma || '', autorEmail: ctx.email || '' });
      SpreadsheetApp.flush();
      return ok({ accion: 'intercambio', camaA: idA, camaB: idB });
    } catch (e) { return err('intercambiarCamas: ' + e.message, ERR.INTERNO, e); }
  });
}

// ── TRASLADO: mover a cama vacía (caso aislamiento) ────────
function moverACamaVacia(idOrigen, idDestino, ctx) {
  ctx = ctx || {};
  return conLock(() => {
    try {
      const O = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(idOrigen));
      const D = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(idDestino));
      if (!O || !D) return err('Cama origen o destino no encontrada.', ERR.NO_ENCONTRADO);
      if (!esVerdadero(O.OCUPADA)) return err('La cama origen está libre.', ERR.VALIDACION);
      if (esVerdadero(D.OCUPADA)) return err('La cama destino no está libre.', ERR.VALIDACION);

      const camp = Object.assign({}, O); camp.ID_CAMA = String(idDestino);
      repoActualizar('CAMAS_ESTADO', 'ID_CAMA', String(idDestino), camp);
      _limpiarCamaInterno(String(idOrigen));

      _agregarHitoInterno({ idCama: idDestino, patientId: O.PATIENT_ID, fecha: hoyISO(), turno: 'Dia', tipo: 'general', texto: `Traslado a Cama ${idDestino} (desde ${idOrigen})`, autor: ctx.firma || '', autorEmail: ctx.email || '' });
      SpreadsheetApp.flush();
      return ok({ accion: 'mover_cama_vacia', origen: idOrigen, destino: idDestino, patientId: O.PATIENT_ID });
    } catch (e) { return err('moverACamaVacia: ' + e.message, ERR.INTERNO, e); }
  });
}

// ── LIMPIAR ────────────────────────────────────────────────
function limpiarCama(idCama) {
  return conLock(() => {
    try { _limpiarCamaInterno(String(idCama)); SpreadsheetApp.flush(); return ok({ idCama, accion: 'limpiar' }); }
    catch (e) { return err('limpiarCama: ' + e.message, ERR.INTERNO, e); }
  });
}

function _limpiarCamaInterno(idCama) {
  const vacio = {
    OCUPADA: false, STATUS_CAMA: 'Libre', PATIENT_ID: '', COD_PACIENTE: '',
    NOMBRE: '', EDAD: '', SEXO: '', TALLA_CM: '', PESO_IDEAL_KG: '', BARTHEL: '', ECF: '',
    DIAGNOSTICO: '', DIAG_REM: '', AISLAMIENTO: false, AISL_MICRO: '',
    VIA_AEREA: 'Natural', TOT_NUMERO: '', TOT_CM_LABIO: '', TQT_TIPO: '',
    SOPORTE: 'Ambiente', MODO: 'Sin soporte',
    FECHA_INGRESO: '', FECHA_INICIO_VA: '', FECHA_INICIO_SOPORTE: '',
    FASE_JSON: '', KTM_NIVEL: '', KTM_SUSP: false, FIRMA_KINE: '', AUTOR_EMAIL: '',
    TEXTO_EVO_DIA: '', TEXTO_EVO_NOCHE: '', ULTIMO_TURNO_KEY: '', TIMELINE_JSON: '',
    KTR_DIA: '', KTM_DIA: '', PROC_DIA: '', FIRMA_DIA: '', KEY_DIA: '',
    KTR_NOCHE: '', PROC_NOCHE: '', FIRMA_NOCHE: '', KEY_NOCHE: '',
    // Estado del episodio (v2): sin esto, el próximo paciente de la cama
    // heredaba arrastres del anterior (evaluaciones, categorías, circuito).
    CHARLSON: '', INGRESO_TIPO: '',
    CAT_KINE: '', CAT_RESP_PJE: '', CAT_MOTOR_PJE: '', CAT_RESP_NIVEL: '', CAT_MOTOR_NIVEL: '',
    ULT_COOP: '', ULT_MRC: '', ULT_MRC_FECHA: '', ULT_FSS: '', ULT_FSS_FECHA: '', ULT_DINAMO: '',
    DISP_HME_FECHA: '', DISP_HEPA_FECHA: '', DISP_TC_FECHA: '', DISP_HUMID_FECHA: '',
    WEAN_PVE_JSON: '', WEAN_CAND_PVE: false,
  };
  repoActualizar('CAMAS_ESTADO', 'ID_CAMA', String(idCama), vacio);
}

/**
 * Limpieza manual desde el editor de Apps Script (pacientes cargados a mano
 * en la hoja que quedaron inconsistentes): deja las camas indicadas Libres.
 * Uso: seleccionar esta función, ejecutar → pide nada; editar la línea de
 * abajo con las camas o llamar limpiarCamasManual('3,5,8') desde la consola.
 */
function limpiarCamasManual(ids) {
  const lista = String(ids || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (!lista.length) { console.log('Indica las camas: limpiarCamasManual("3,5,8")'); return; }
  lista.forEach(_limpiarCamaInterno);
  SpreadsheetApp.flush();
  console.log('✅ Camas limpiadas y liberadas: ' + lista.join(', '));
}

// ── COD_PACIENTE ───────────────────────────────────────────
/** ddmmyy + inicial nombre(may) + primer apellido(min, tope 8) + inicial 2º apellido(min) + edad. */
function generarCodPaciente(nombreCompleto, edad, fechaIngresoISO) {
  const iso = String(fechaIngresoISO || hoyISO()).slice(0, 10);
  const ddmmyy = iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(2, 4);
  const toks = _sinAcentos(String(nombreCompleto || '').trim()).split(/\s+/).filter(Boolean);
  let iniN = '', ap1 = '', ap2i = '';
  if (toks.length >= 3) { iniN = toks[0][0]; ap1 = toks[toks.length - 2]; ap2i = (toks[toks.length - 1][0] || ''); }
  else if (toks.length === 2) { iniN = toks[0][0]; ap1 = toks[1]; }
  else if (toks.length === 1) { iniN = toks[0][0]; }
  const e = String(parseInt(edad) || '').trim();
  return ddmmyy + (iniN || '').toUpperCase() + ap1.toLowerCase().slice(0, 8) + ap2i.toLowerCase() + e;
}

function _sinAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/g, 'n').replace(/Ñ/g, 'N');
}

/** Evita colisión de COD entre pacientes activos: agrega sufijo -2, -3… */
function _codUnico(cod) {
  const activos = repoLeerTodos('CAMAS_ESTADO').filter(c => esVerdadero(c.OCUPADA)).map(c => String(c.COD_PACIENTE));
  if (activos.indexOf(cod) === -1) return cod;
  let n = 2;
  while (activos.indexOf(cod + '-' + n) !== -1) n++;
  return cod + '-' + n;
}
