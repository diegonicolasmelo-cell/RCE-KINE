/**
 * ============================================================
 *  03_ProcTimelineTextoREM.gs — Procedimientos, Timeline,
 *                               Texto clínico, Estadísticas REM
 *  RCE KINE UCIA | GAS-v1.1 (Fase 1)
 *
 *  CAMBIOS vs v1.0:
 *  ★ _guardarProcedimientosInterno: versión sin lock
 *  ★ _agregarHitoInterno: versión sin lock
 *  ★ _sincronizarTimelineCama usa _actualizarCamaInterno
 *  (todas las versiones públicas mantienen su lock para llamadas
 *  directas desde el dispatcher)
 * ============================================================
 */
 
// ╔═══════════════════════════════════════════════════════════╗
// ║  03 — PROCEDIMIENTOS                                      ║
// ╚═══════════════════════════════════════════════════════════╝
 
/**
 * ★ NUEVA ★ — versión interna SIN lock.
 * Llama esta cuando ya estás dentro de conLock() (ej. guardarEvolucion).
 */
function _guardarProcedimientosInterno(idEvolucion, idCama, fecha, turno, listaProcedimientos, autor) {
  const h = obtenerHoja(SH.PROCEDIMIENTOS);
 
  // Eliminar procedimientos previos del mismo turno
  const filasPrev = buscarFilas(h, COL_PROC.ID_EVOLUCION, idEvolucion, PROC_FILA_DATOS);
  if (filasPrev.length > 0) {
    filasPrev.slice().reverse().forEach(f => h.deleteRow(f));
  }
 
  // ★ OPT v1.2: batch insert — acumula todas las filas y escribe en 1 sola I/O.
  // Antes: N appendRow() = N viajes de red (~150ms c/u con 10 procs = ~1.5s extra).
  // Ahora: 1 setValues() sin importar cuántos procedimientos tenga el turno.
  const filas = [];
  listaProcedimientos.forEach(nombreProc => {
    if (!nombreProc || !nombreProc.trim()) return;
    const fila = new Array(9).fill('');
    fila[COL_PROC.ID_PROC      - 1] = generarIdProcedimiento();
    fila[COL_PROC.ID_EVOLUCION - 1] = idEvolucion;
    fila[COL_PROC.ID_CAMA      - 1] = String(idCama);
    fila[COL_PROC.FECHA        - 1] = fecha;
    fila[COL_PROC.TURNO        - 1] = turno;
    fila[COL_PROC.TIPO_PROC    - 1] = _clasificarProcedimiento(nombreProc);
    fila[COL_PROC.NOMBRE_PROC  - 1] = nombreProc.trim();
    fila[COL_PROC.DESCRIPCION  - 1] = '';
    fila[COL_PROC.TIMESTAMP    - 1] = timestampAhora();
    filas.push(fila);
  });
  if (filas.length > 0) {
    h.getRange(h.getLastRow() + 1, 1, filas.length, 9).setValues(filas);
  }

  return { idEvolucion, cantidad: filas.length };
}
 
/** Versión PÚBLICA con lock (cuando se llama directo desde dispatcher) */
function guardarProcedimientos(idEvolucion, idCama, fecha, turno, listaProcedimientos, autor) {
  return conLock(() => {
    try {
      const res = _guardarProcedimientosInterno(idEvolucion, idCama, fecha, turno, listaProcedimientos, autor);
      SpreadsheetApp.flush();
      return ok(res);
    } catch (e) {
      return err('guardarProcedimientos: ' + e.message, e);
    }
  });
}
 
function obtenerProcedimientos(idEvolucion) {
  try {
    const h     = obtenerHoja(SH.PROCEDIMIENTOS);
    const procs = leerHojaObjetos(h, COL_PROC, 9, PROC_FILA_DATOS, 'ID_EVOLUCION', idEvolucion);
    return ok(procs);
  } catch (e) {
    return err('obtenerProcedimientos: ' + e.message, e);
  }
}
 
function _clasificarProcedimiento(nombre) {
  const n = nombre.toLowerCase();
  if (n.includes('vía aérea') || n.includes('tot') || n.includes('tqt') || n.includes('decanulación')) return 'via_aerea';
  if (n.includes('ktm') || n.includes('movilización') || n.includes('marcha') ||
      n.includes('cicloergo') || n.includes('verticalización') || n.includes('rehabilitación')) return 'kine';
  if (n.includes('instalación') || n.includes('punción') || n.includes('drenaje') ||
      n.includes('broncoscop') || n.includes('sbt') || n.includes('bdt')) return 'procedimiento';
  return 'general';
}
 
 
// ╔═══════════════════════════════════════════════════════════╗
// ║  04 — TIMELINE / HITOS                                    ║
// ╚═══════════════════════════════════════════════════════════╝
 
/**
 * ★ NUEVA ★ — versión interna SIN lock SIN sync del timeline.
 * Solo escribe la fila. Útil cuando vas a hacer muchos hitos en serie
 * y quieres sincronizar una sola vez al final.
 */
function _agregarHitoInternoSinSync(hito) {
  const h    = obtenerHoja(SH.TIMELINE);
  const fila = new Array(8).fill('');
  fila[COL_TL.ID_HITO   - 1] = generarIdHito();
  fila[COL_TL.ID_CAMA   - 1] = String(hito.idCama || '');
  fila[COL_TL.FECHA     - 1] = hito.fecha || fechaHoyISO();
  fila[COL_TL.TURNO     - 1] = hito.turno || 'Dia';
  fila[COL_TL.TIPO      - 1] = hito.tipo  || 'general';
  fila[COL_TL.TEXTO     - 1] = hito.texto || '';
  fila[COL_TL.TIMESTAMP - 1] = timestampAhora();
  fila[COL_TL.AUTOR     - 1] = hito.autor || '';
  h.appendRow(fila);
}
 
/**
 * ★ NUEVA ★ — versión interna SIN lock.
 * Para usar desde dentro de conLock() (guardarEvolucion, darAlta, etc).
 */
function _agregarHitoInterno(hito) {
  _agregarHitoInternoSinSync(hito);
  // ★ Sincronización con CAMAS_ESTADO usa la versión _interno (sin lock) ★
  _sincronizarTimelineCama(String(hito.idCama));
  return { accion: 'hito_agregado' };
}
 
/**
 * ★ NUEVA ★ — Mapeo procedimiento → hito automático.
 * Cuando el kinesiólogo agrega un procedimiento en el SmartEvo,
 * se genera un hito tipado automáticamente en el TIMELINE.
 *
 * (KTM 1–5 / KTM CONTRAINDICADA NO se mapean acá porque ya quedan
 *  registrados en KTM_NIVEL_KTR / KTM_SUSPENDIDA de la evolución.
 *  INGRESO/EGRESO tampoco — los maneja ingresarPaciente/darAltaPaciente.)
 */
const PROC_TO_HITO = {
  // Vía aérea
  'INTUBACIÓN':              { tipo: 'via_aerea', label: 'Intubación orotraqueal' },
  'PVE':                     { tipo: 'via_aerea', label: 'PVE (Prueba de Ventilación Espontánea)' },
  'EXTUBACIÓN C/PROTOCOLO':  { tipo: 'via_aerea', label: 'Extubación c/protocolo' },
  'EXTUBACIÓN S/PROTOCOLO':  { tipo: 'via_aerea', label: 'Extubación s/protocolo' },
  'AUTOEXTUBACIÓN':          { tipo: 'via_aerea', label: 'Autoextubación' },
  'EXTUBACIÓN ACCIDENTAL':   { tipo: 'via_aerea', label: 'Extubación accidental' },
  'REINTUBACIÓN':            { tipo: 'via_aerea', label: 'Reintubación' },
  'DESVINCULACIÓN':          { tipo: 'via_aerea', label: 'Desvinculación de VM' },
  'CAMBIO TOT':              { tipo: 'via_aerea', label: 'Cambio de TOT' },
  'TQT':                     { tipo: 'via_aerea', label: 'Traqueostomía' },
  'CAMBIO TQT':              { tipo: 'via_aerea', label: 'Cambio de TQT' },
  'DECANULACIÓN':            { tipo: 'via_aerea', label: 'Decanulación' },
  // Posicionamiento
  'PRONO':                   { tipo: 'procedimiento', label: 'Decúbito prono' },
  'SUPINO':                  { tipo: 'procedimiento', label: 'Decúbito supino' },
  // Estudios / asistencias
  'IMAGENOLOGÍA':            { tipo: 'procedimiento', label: 'Imagenología' },
  'CULTIVO DE SECRECIONES':  { tipo: 'procedimiento', label: 'Cultivo de secreciones' },
  'PCR COVID':               { tipo: 'procedimiento', label: 'PCR COVID' },
  'ECOGRAFÍA':               { tipo: 'procedimiento', label: 'Ecografía' },
  'EVALUACIÓN INTERMEDIA':   { tipo: 'procedimiento', label: 'Evaluación intermedia' },
  'TEST APNEA':              { tipo: 'procedimiento', label: 'Test de apnea' },
  'PABELLÓN':                { tipo: 'procedimiento', label: 'Traslado a pabellón' },
  'ASISTENCIA EN PROCEDIMIENTO MÉDICO': { tipo: 'procedimiento', label: 'Asistencia en procedimiento médico' },
  // Crítico
  'RCP':                     { tipo: 'general', label: 'Reanimación cardiopulmonar (RCP)' },
  'FALLECE':                 { tipo: 'egreso',  label: 'Fallece' },
  // Hitos motores
  'Hito Motor 1':            { tipo: 'kine', label: 'Hito Motor 1 — Sedestación borde de cama' },
  'Hito Motor 2':            { tipo: 'kine', label: 'Hito Motor 2 — Bipedestación asistida' },
  'Hito Motor 3':            { tipo: 'kine', label: 'Hito Motor 3 — Marcha asistida' },
  'Hito Motor 4':            { tipo: 'kine', label: 'Hito Motor 4 — Marcha autónoma corta' },
  'Hito Motor 5':            { tipo: 'kine', label: 'Hito Motor 5 — Marcha autónoma extendida' },
  // Otros
  'IMT':                     { tipo: 'kine', label: 'IMT (entrenamiento muscular inspiratorio)' },
  'EMS':                     { tipo: 'kine', label: 'Electroestimulación muscular' },
  'Educación al usuario / cuidador o familia': { tipo: 'kine', label: 'Educación al usuario / cuidador / familia' },
};
 
/**
 * ★ NUEVA ★ — Convierte la lista de procedimientos del turno en hitos.
 * Idempotente: si la misma evolución se guarda 2 veces, no duplica hitos
 * (borra primero los hitos auto-generados de ese turno, luego re-crea).
 *
 * NO toca los hitos de tipo 'ingreso' ni 'egreso' (esos se manejan aparte).
 */
function _crearHitosDesdeProcedimientos(idCama, fecha, turno, procs, autor) {
  if (!Array.isArray(procs) || procs.length === 0) {
    // Si la lista vino vacía, igual borramos hitos previos auto de este turno
    // (por si el usuario quitó procedimientos en una re-edición).
    _borrarHitosAutoTurno(idCama, fecha, turno);
    return;
  }
 
  // 1) Borrar hitos auto-generados previos del mismo turno (idempotencia)
  _borrarHitosAutoTurno(idCama, fecha, turno);
 
  // 2) Crear hitos nuevos a partir de procs
  let creados = 0;
  procs.forEach(proc => {
    if (!proc) return;
    const map = PROC_TO_HITO[String(proc).trim()];
    if (!map) return;  // procedimiento sin mapeo → no se crea hito (queda solo en PROC_RESUMEN)
    _agregarHitoInternoSinSync({
      idCama, fecha, turno,
      tipo:  map.tipo,
      texto: map.label,
      autor: autor || '',
    });
    creados++;
  });
 
  // 3) Sincronizar JSON cache en CAMAS_ESTADO una sola vez al final
  if (creados > 0) {
    _sincronizarTimelineCama(String(idCama));
  }
}
 
/**
 * Borra los hitos auto-generados (tipos via_aerea / procedimiento / kine / general)
 * del turno indicado. Preserva ingreso/egreso para no perder el inicio/fin de estadía.
 */
function _borrarHitosAutoTurno(idCama, fecha, turno) {
  const h = obtenerHoja(SH.TIMELINE);
  const ultima = h.getLastRow();
  if (ultima < TL_FILA_DATOS) return;
  const datos = h.getRange(TL_FILA_DATOS, 1, ultima - TL_FILA_DATOS + 1, 8).getValues();
  const TIPOS_AUTO = new Set(['via_aerea', 'procedimiento', 'kine', 'general']);
  const filasAEliminar = [];
  for (let i = 0; i < datos.length; i++) {
    const r = datos[i];
    if (String(r[COL_TL.ID_CAMA - 1]) === String(idCama) &&
        String(r[COL_TL.FECHA   - 1]) === String(fecha)   &&
        r[COL_TL.TURNO - 1]            === turno          &&
        TIPOS_AUTO.has(r[COL_TL.TIPO - 1])) {
      filasAEliminar.push(TL_FILA_DATOS + i);
    }
  }
  // Eliminar de atrás hacia adelante para no desordenar índices
  filasAEliminar.slice().reverse().forEach(f => h.deleteRow(f));
}
 
/** Versión PÚBLICA con lock (para llamadas directas desde dispatcher). */
function agregarHito(hito) {
  return conLock(() => {
    try {
      const res = _agregarHitoInterno(hito);
      SpreadsheetApp.flush();
      return ok(res);
    } catch (e) {
      return err('agregarHito: ' + e.message, e);
    }
  });
}
 
function obtenerTimeline(idCama) {
  try {
    const h     = obtenerHoja(SH.TIMELINE);
    const hitos = leerHojaObjetos(h, COL_TL, 8, TL_FILA_DATOS, 'ID_CAMA', idCama);
    hitos.sort((a, b) => String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)));
    return ok(hitos);
  } catch (e) { return err('obtenerTimeline: ' + e.message, e); }
}
 
/**
 * ★ FIX ★ — usa _actualizarCamaInterno (sin lock).
 * Antes llamaba a actualizarCama (con lock) → causaba deadlock al
 * ser invocada desde guardarEvolucion/ingresarPaciente/darAlta.
 */
function _sincronizarTimelineCama(idCama) {
  try {
    const h     = obtenerHoja(SH.TIMELINE);
    const hitos = leerHojaObjetos(h, COL_TL, 8, TL_FILA_DATOS, 'ID_CAMA', idCama);
    if (!hitos.length) return;
    hitos.sort((a, b) => String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)));
    const snapshot = JSON.stringify(hitos.slice(0, 30));
    _actualizarCamaInterno(idCama, { TIMELINE_JSON: snapshot });
  } catch (e) {
    console.warn('_sincronizarTimelineCama:', e.message);
  }
}
 
 
// ╔═══════════════════════════════════════════════════════════╗
// ║  05 — GENERADOR DE TEXTO CLÍNICO                          ║
// ║  (sin cambios funcionales — solo limpieza con parseBool)  ║
// ╚═══════════════════════════════════════════════════════════╝
 
function generarTextoEvolucion(d) {
  const v   = (k) => (d[k] !== undefined && d[k] !== null && d[k] !== '') ? String(d[k]) : null;
  const vn  = (k) => parseFloat(d[k]) || 0;
  const txt = [];
 
  // 1. Encabezado
  const esIngreso  = parseBool(d.ES_INGRESO);
  const turnoLabel = d.TURNO === 'Noche' ? 'TURNO NOCHE' : 'TURNO DÍA';
  txt.push(esIngreso
    ? `KINESIOLOGÍA ${turnoLabel} — INGRESO`
    : `KINESIOLOGÍA ${turnoLabel}`);
 
  // 2. Diagnóstico
  const dx = v('PAC_DIAGNOSTICO');
  if (esIngreso) {
    txt.push(`Paciente ingresa a UCI${dx ? ' con diagnóstico de ' + dx : ''}.`);
  } else {
    const dias = v('DIA_ESTADIA') || '?';
    txt.push(`Paciente en día ${dias} de estadía en UCI${dx ? '. Dx: ' + dx : ''}.`);
  }
 
  // 3. Sedación / GCS
  const sed = v('SED_TIPO') || 'Sin sedación';
  const sas = v('SED_SAS');
  const gcsO = v('SED_GCS_O') || '?', gcsV = v('SED_GCS_V') || '?', gcsM = v('SED_GCS_M') || '?';
  const gcsTot = v('SED_GCS_TOT') || '?';
  const s5q  = v('SED_S5Q'), coop = v('SED_COOPERACION');
  const bnm = parseBool(d.SED_BNM);
  const va = v('VENT_VIA_AEREA') || 'Natural';
  const intubado = va === 'TOT' || va === 'TQT';
 
  let sedStr = (sed === 'Sin sedación')        ? 'Sin sedoanalgesia.'
            :  (sed === 'Fuera de escalón')   ? `Sedación fuera de escalón${sas ? ' (SAS ' + sas + ')' : ''}.`
            :  `Sedado en ${sed.toLowerCase()}${sas ? ' para SAS ' + sas : ''}.`;
  sedStr += ` GCS ${gcsTot}${intubado ? '' : '/15'}(O:${gcsO}, V:${gcsV}, M:${gcsM})`;
  if (s5q)  sedStr += `, S5Q ${s5q}/5`;
  if (coop) sedStr += ` (${coop})`;
  sedStr += '.';
  if (bnm) sedStr += ' Bajo BNM.';
  txt.push(sedStr);
 
  // 4. Hemodinamia
  const hEst = v('HEMO_ESTADO') || 'Estable';
  const dva  = v('HEMO_DVA')    || 'sin DVA';
  const mDVA = parseBool(d.HEMO_MULTI_DVA), nDVA = v('HEMO_NUM_DVA');
  const tend = parseBool(d.HEMO_TENDENCIA),  tendT = v('HEMO_TEND_TIPO');
 
  let hemoStr = `Hemodinámicamente ${hEst === 'Estable' ? 'estable' : 'inestable'}`;
  if (dva === 'sin DVA') hemoStr += ', sin requerimientos de drogas vasoactivas';
  else {
    hemoStr += `, con requerimiento de DVA en ${dva.replace(/^DVA\s*/i,'').toLowerCase()}`;
    if (mDVA && nDVA) hemoStr += ` (${nDVA} drogas en paralelo)`;
  }
  if (tend && tendT) hemoStr += `, con tendencia a ${tendT}`;
  txt.push(hemoStr + '.');
 
  // 5. Vía aérea
  const sop  = v('VENT_SOPORTE') || 'Ambiente';
  const modo = v('VENT_MODO')    || '';
  const diasVA = v('DIAS_VA'), diasSop = v('DIAS_VM');
  const totN = v('VENT_TOT_NUM'), totCm = v('VENT_TOT_CM'), tqtT = v('VENT_TQT_TIPO');
 
  if (va === 'TOT') {
    const desc = (totN || totCm) ? ` N° ${totN || '?'} fijado en ${totCm || '?'} cm` : '';
    txt.push(`Paciente con tubo orotraqueal${desc}, en día ${diasVA || '?'} de VA artificial.`);
  } else if (va === 'TQT') {
    const desc = tqtT ? ` tipo ${tqtT}` : '';
    txt.push(`Paciente con traqueostomía${desc}, en día ${diasVA || '?'} de VA artificial.`);
  } else if (va === 'Full Face' || va === 'Oronasal') {
    txt.push(`Paciente con máscara ${va} de VNI.`);
  }
 
  // 6. Parámetros ventilatorios
  const vt = vn('VENT_VT'),  fr   = vn('VENT_FR'),   peep = vn('VENT_PEEP');
  const pmax = vn('VENT_PMAX'), fio2 = vn('VENT_FIO2'), spo2 = vn('VENT_SPO2');
  const mlkg = vn('CALC_ML_KG'), vm = vn('CALC_VOL_MIN'), dp = vn('CALC_DP');
  const ipap = vn('VENT_IPAP'), epap = vn('VENT_EPAP'), ps = vn('VENT_PS');
  const flujo = vn('VENT_FLUJO'), irox = vn('CALC_IROX'), tobin = vn('CALC_TOBIN');
  const hact = parseBool(d.VENT_H_ACTIVA), postE = parseBool(d.VENT_POST_EXT);
 
  let ventStr = '';
  if (sop === 'VM') {
    if (modo === 'ACVC') {
      ventStr = `En VM modalidad ACVC, `;
      ventStr += vt > 0 ? `VT ${vt} ml` : '';
      if (mlkg > 0) ventStr += ` (${mlkg} ml/kg PI)`;
      ventStr += fr > 0   ? `, FR ${fr} rpm`         : '';
      ventStr += vm > 0   ? `, VM ${vm} L/min`        : '';
      ventStr += peep > 0 ? `, PEEP ${peep} cmH₂O`    : '';
      ventStr += pmax > 0 ? `, Pmax ${pmax} cmH₂O`    : '';
      if (dp > 0) ventStr += `, DP ${dp} cmH₂O`;
    } else if (modo === 'ACPC') {
      const pinsp = vn('VENT_PINSP');
      ventStr = `En VM modalidad ACPC, `;
      ventStr += pinsp > 0 ? `Pinsp ${pinsp} cmH₂O` : '';
      ventStr += vt > 0    ? `, VT ${vt} ml`        : '';
      if (mlkg > 0) ventStr += ` (${mlkg} ml/kg PI)`;
      ventStr += fr > 0    ? `, FR ${fr} rpm`       : '';
      ventStr += peep > 0  ? `, PEEP ${peep} cmH₂O` : '';
    } else if (modo === 'CPAP/PS') {
      ventStr = `En VM modo CPAP/PS, PS ${ps > 0 ? ps : '?'} cmH₂O + PEEP ${peep > 0 ? peep : '?'} cmH₂O`;
      ventStr += vt > 0 ? `, VT ${vt} ml` : '';
      if (mlkg > 0) ventStr += ` (${mlkg} ml/kg PI)`;
      ventStr += fr > 0 ? `, FR ${fr} rpm` : '';
      if (tobin > 0) ventStr += `, Índice de Tobin ${tobin}`;
    } else {
      ventStr = `En VM modo ${modo}`;
      if (vt > 0)   ventStr += `, VT ${vt} ml`;
      if (fr > 0)   ventStr += `, FR ${fr} rpm`;
      if (peep > 0) ventStr += `, PEEP ${peep} cmH₂O`;
    }
    if (fio2 > 0) ventStr += `, FiO₂ ${fio2}%`;
    if (spo2 > 0) ventStr += `, SpO₂ ${spo2}%`;
    ventStr += `, en día ${diasSop || '?'} de VM`;
    if (hact) ventStr += '. Con humidificación activa';
    txt.push(ventStr + '.');
  } else if (sop === 'VNI') {
    ventStr = `En VNI modo ${modo}, IPAP ${ipap > 0 ? ipap : '?'}/${epap > 0 ? epap : '?'} cmH₂O`;
    if (vt > 0)   ventStr += `, VT ${vt} ml`;
    if (fio2 > 0) ventStr += `, FiO₂ ${fio2}%`;
    if (spo2 > 0) ventStr += `, SpO₂ ${spo2}%`;
    txt.push(ventStr + '.');
  } else if (sop === 'CNAF') {
    ventStr = `En CNAF con flujo ${flujo > 0 ? flujo : '?'} L/min, FiO₂ ${fio2 > 0 ? fio2 : '?'}%`;
    if (spo2 > 0) ventStr += `, SpO₂ ${spo2}%`;
    if (irox > 0) ventStr += `, Índice ROX ${irox}`;
    txt.push(ventStr + '.');
  } else if (sop === 'Oxigenoterapia') {
    const litros = vn('VENT_LITROS');
    ventStr = `En oxigenoterapia`;
    if (litros > 0) ventStr += ` con ${litros} L/min`;
    if (fio2 > 0)   ventStr += `, FiO₂ ${fio2}%`;
    if (spo2 > 0)   ventStr += `, SpO₂ ${spo2}%`;
    txt.push(ventStr + '.');
  } else if (spo2 > 0) {
    txt.push(`En ventilación espontánea en ambiente, SpO₂ ${spo2}%.`);
  }
 
  if (postE) {
    const descPostE = v('VENT_POST_EXT_VAL');
    txt.push(`Post-extubación/decanulación${descPostE ? ': ' + descPostE : ''}.`);
  }
 
  // 7. Examen físico
  const mp = v('EX_MP'), ruidos = v('EX_RUIDOS'), ruidosM = v('EX_RUIDOS_MAN');
  const secrC = v('EX_SECR_CANT'), secrT = v('EX_SECR_TIPO');
  const ruidosText = ruidos === 'Otro' && ruidosM ? ruidosM : ruidos;
  let exStr = '';
  if (mp) exStr += `Al examen físico: murmullo pulmonar ${mp}`;
  if (ruidosText && ruidosText !== 'sin ruidos agregados') exStr += `, con ${ruidosText}`;
  else if (ruidosText) exStr += `, sin ruidos agregados`;
  if (secrC) {
    exStr += `. Secreciones ${secrC}`;
    if (secrT) exStr += ` de característica ${secrT}`;
  }
  if (exStr) txt.push(exStr + '.');
 
  // 8. KTM
  const ktmR = parseBool(d.KTM_REALIZADA), ktmS = parseBool(d.KTM_SUSPENDIDA);
  const nivel = v('KTM_NIVEL_KTR'), tiempo = v('KTM_TIEMPO_MIN');
  const contra = v('KTM_CONTRA_RAZON') || v('KTM_CONTRA_MANUAL');
  const uma = parseBool(d.KTM_UMA), umaVal = v('KTM_UMA_VAL');
 
  if (ktmR) {
    let ktmStr = `Se realiza KTM nivel ${nivel || '?'}`;
    if (tiempo) ktmStr += ` durante ${tiempo} minutos`;
    if (uma)    ktmStr += `. UMA ${umaVal || ''}`;
    txt.push(ktmStr + '.');
  } else if (ktmS) {
    const tipoContra = v('KTM_CONTRA_TIPO');
    txt.push(`KTM no realizada. Contraindicación ${tipoContra ? tipoContra.toLowerCase() : ''}: ${contra || 'sin especificar'}.`);
  }
 
  // 9. Procedimientos
  const procRes = v('PROC_RESUMEN');
  if (procRes) txt.push(`Procedimientos: ${procRes}.`);
 
  // 10. Muestras
  const mue = parseBool(d.MUE_REALIZADAS);
  if (mue) {
    const mec = v('MUE_MECANISMO'), tiposStr = v('MUE_TIPOS_JSON');
    let mueStr = `Se obtienen muestras microbiológicas`;
    if (mec) mueStr += ` por ${mec.toLowerCase()}`;
    if (tiposStr) {
      try {
        const tipos = JSON.parse(tiposStr);
        if (tipos.length > 0) mueStr += ` (${tipos.join(', ')})`;
      } catch(e) {}
    }
    txt.push(mueStr + '.');
  }
 
  // 11. Planes y firma
  const planes = v('PLAN_PLANES'), nota = v('PLAN_NOTA_TURNO'), firma = v('PLAN_FIRMA_KINE');
  if (planes) txt.push(`Plan: ${planes}`);
  if (nota)   txt.push(`Nota: ${nota}`);
  if (firma)  txt.push(`Kinesiólogo: ${firma}`);
 
  return txt.filter(Boolean).join('\n');
}
 
 
// ╔═══════════════════════════════════════════════════════════╗
// ║  06 — ESTADÍSTICAS REM (sin cambios funcionales)          ║
// ╚═══════════════════════════════════════════════════════════╝
 
function generarREM(anio, mes) {
  try {
    const h      = obtenerHoja(SH.EVOLUCIONES);
    const hArch  = obtenerHoja(SH.ARCHIVO);
    const prefijo = `${anio}-${mes.padStart(2,'0')}`;
    const ultima  = h.getLastRow();
    if (ultima < EVO_FILA_DATOS) return ok(_remVacio(anio, mes));
 
    const todosEvo = h.getRange(EVO_FILA_DATOS, 1, ultima - EVO_FILA_DATOS + 1, EVO_TOTAL_COLS).getValues();
    const evoMes   = todosEvo.filter(r => String(r[COL_EVO.FECHA - 1]).startsWith(prefijo));
 
    const camasUnicas = new Set(evoMes.map(r => r[COL_EVO.ID_CAMA - 1]));
    const ultArch = hArch.getLastRow();
    let archMes = [];
    if (ultArch >= ARCH_FILA_DATOS) {
      const todosArch = hArch.getRange(ARCH_FILA_DATOS, 1, ultArch - ARCH_FILA_DATOS + 1, 28).getValues();
      archMes = todosArch.filter(r => String(r[COL_ARCH.FECHA_EGRESO - 1]).startsWith(prefijo) ||
                                       String(r[COL_ARCH.FECHA_INGRESO- 1]).startsWith(prefijo));
    }
 
    let turnosVM = 0, turnosKTM = 0, turnosKTMC = 0, sumKTR = 0;
    const diagRemCount = {};
    evoMes.forEach(r => {
      const soporte  = r[COL_EVO.VENT_SOPORTE  - 1];
      const ktmR     = r[COL_EVO.KTM_REALIZADA  - 1];
      const ktmS     = r[COL_EVO.KTM_SUSPENDIDA - 1];
      const ktrNivel = parseInt(r[COL_EVO.KTM_NIVEL_KTR - 1]) || 0;
      const diagRem  = r[COL_EVO.PAC_DIAG_REM  - 1];
      if (soporte === 'VM') turnosVM++;
      if (parseBool(ktmR)) { turnosKTM++; sumKTR += ktrNivel; }
      if (parseBool(ktmS)) turnosKTMC++;
      if (diagRem) diagRemCount[diagRem] = (diagRemCount[diagRem] || 0) + 1;
    });
 
    const totalIngresos  = camasUnicas.size + archMes.length;
    const diasCamaTotal  = evoMes.length;
    const ktrPromTurno   = turnosKTM > 0 ? Math.round((sumKTR / turnosKTM) * 100) / 100 : 0;
 
    const nombreMes = new Date(parseInt(anio), parseInt(mes) - 1, 1)
      .toLocaleString('es-CL', { month: 'long', year: 'numeric' });
 
    let textoREM = `REPORTE REM KINESIOLOGÍA UCI — ${nombreMes.toUpperCase()}\n`;
    textoREM += '─'.repeat(50) + '\n';
    textoREM += `Total ingresos período: ${totalIngresos}\n\nDIAGNÓSTICO REM:\n`;
    Object.entries(diagRemCount)
      .sort((a,b) => b[1] - a[1])
      .forEach(([label, n]) => { textoREM += `  ${label.padEnd(35,' ')} ${n}\n`; });
    textoREM += `\nACTIVIDAD KINESIOLÓGICA:\n`;
    textoREM += `  Turnos con ventilación mecánica:  ${turnosVM}\n`;
    textoREM += `  KTM realizadas:                   ${turnosKTM}\n`;
    textoREM += `  KTM suspendidas (KTMC):           ${turnosKTMC}\n`;
    textoREM += `  Sumatoria KTR período:            ${sumKTR}\n`;
    textoREM += `  KTR promedio por turno:           ${ktrPromTurno}\n`;
 
    const hREM   = obtenerHoja(SH.REM);
    const mesKey = `${anio}-${mes.padStart(2,'0')}`;
    const filaREM = buscarFila(hREM, 1, mesKey, 2);
    const filaData = [
      mesKey, totalIngresos, diasCamaTotal,
      turnosVM, turnosKTM, turnosKTMC, sumKTR, ktrPromTurno,
      JSON.stringify(diagRemCount), textoREM,
    ];
    if (filaREM === -1) hREM.appendRow(filaData);
    else                hREM.getRange(filaREM, 1, 1, 10).setValues([filaData]);
    SpreadsheetApp.flush();
 
    return ok({
      mesKey, totalIngresos, diasCamaTotal,
      turnosVM, turnosKTM, turnosKTMC, sumKTR, ktrPromTurno,
      diagRemCount, textoREM,
    });
  } catch (e) {
    return err('generarREM: ' + e.message, e);
  }
}
 
function _remVacio(anio, mes) {
  return {
    mesKey: `${anio}-${mes}`,
    totalIngresos: 0, diasCamaTotal: 0,
    turnosVM: 0, turnosKTM: 0, turnosKTMC: 0, sumKTR: 0, ktrPromTurno: 0,
    diagRemCount: {}, textoREM: 'Sin datos para el período seleccionado.',
  };
}
 