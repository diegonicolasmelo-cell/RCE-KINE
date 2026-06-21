/**
 * ============================================================
 *  11_Entrega.gs — Emitir "Entrega de Turno" (handoff) imprimible
 *  ------------------------------------------------------------
 *  Reúne, para las camas seleccionadas, el estado del turno que
 *  se está entregando (evolución de ese fecha+turno) + datos de
 *  cama + últimos hitos del timeline, en UNA estructura lista
 *  para imprimir. Y permite guardar cada entrega como historial.
 *
 *  Eficiencia: 3 lecturas masivas (CAMAS, EVOLUCIONES filtrada
 *  por TURNO_KEY, TIMELINE) sin importar cuántas camas se elijan.
 * ============================================================
 */

/**
 * @param {Array<string|number>} idCamas  camas a incluir
 * @param {string} fecha   "YYYY-MM-DD"
 * @param {string} turno   "Dia" | "Noche"
 */
function obtenerEntregaTurno(idCamas, fecha, turno) {
  try {
    if (!idCamas || !idCamas.length) return err('No se seleccionaron camas.');
    const turnoKey = `${fecha}-${turno}`;
    const sel = idCamas.map(String);
    const setSel = {};
    sel.forEach(id => setSel[id] = true);

    // ── Lecturas masivas (1 viaje c/u) ──
    const hC = obtenerHoja(SH.CAMAS);
    const camas = leerHojaObjetos(hC, COL_CAM, CAM_TOTAL_COLS, CAM_FILA_DATOS);
    const camaPorId = {};
    camas.forEach(c => camaPorId[String(c.ID_CAMA)] = c);

    const hE = obtenerHoja(SH.EVOLUCIONES);
    const evosTurno = leerHojaObjetos(hE, COL_EVO, EVO_TOTAL_COLS, EVO_FILA_DATOS, 'TURNO_KEY', turnoKey);
    const evoPorCama = {};
    evosTurno.forEach(e => evoPorCama[String(e.ID_CAMA)] = e);

    const hT = obtenerHoja(SH.TIMELINE);
    const tl = leerHojaObjetos(hT, COL_TL, 8, TL_FILA_DATOS);
    const hitosPorCama = {};
    tl.forEach(h => {
      const id = String(h.ID_CAMA);
      if (!setSel[id]) return;
      (hitosPorCama[id] = hitosPorCama[id] || []).push(h);
    });

    // ── Último CULTIVO por cama (desde PROCEDIMIENTOS) ──
    // Se considera cultivo cualquier procedimiento cuyo nombre contenga
    // "CULTIVO" (ej. "CULTIVO DE SECRECIONES", "Cultivo Hemo", etc.).
    const hP = obtenerHoja(SH.PROCEDIMIENTOS);
    const ultP = hP.getLastRow();
    const procsAll = (ultP >= PROC_FILA_DATOS)
      ? hP.getRange(PROC_FILA_DATOS, 1, ultP - PROC_FILA_DATOS + 1, 9).getValues() : [];
    const ultimoCultivoPorCama = {};
    procsAll.forEach(r => {
      const id = String(r[COL_PROC.ID_CAMA - 1]);
      if (!setSel[id]) return;
      const nom = String(r[COL_PROC.NOMBRE_PROC - 1] || '').toUpperCase();
      // Cultivos de secreciones: CULTIVO DE SECRECIONES, CCAET, FilmArray, Mini Lab, Hisopado COVID-19
      if (!/CULTIVO|CCAET|FILMARRAY|MINI ?LAB|HISOPADO|COVID/.test(nom)) return;
      const iso = _entToISO(r[COL_PROC.FECHA - 1]);
      if (!iso) return;
      if (!ultimoCultivoPorCama[id] || iso > ultimoCultivoPorCama[id]) ultimoCultivoPorCama[id] = iso;
    });

    // ── Construir ficha por cama ──
    const fichas = sel.map(id => {
      const c = camaPorId[id] || {};
      const e = evoPorCama[id] || null;
      const hitos = (hitosPorCama[id] || [])
        .sort((a, b) => String(b.TIMESTAMP || b.FECHA).localeCompare(String(a.TIMESTAMP || a.FECHA)))
        .slice(0, 4)
        .map(h => ({ fecha: _entFecha(h.FECHA), tipo: h.TIPO || '', texto: h.TEXTO || h.DESCRIPCION || '' }));

      // Parámetros ventilatorios clave (solo los que existan)
      const params = e ? _entParams(e) : '';

      // Pruebas funcionales: si el paciente es COOPERADOR debe evaluarse MRC-SS y FSS.
      const _coop = e ? String(e.SED_COOPERACION || '').trim() : '';
      const _esCooperador = /^cooperador$/i.test(_coop);
      const _mrc = e ? e.EGR_MRC_SS : '';
      const _fss = e ? e.EGR_FSS : '';
      const _tieneMRC = _mrc !== '' && _mrc !== null && _mrc !== undefined;
      const _tieneFSS = _fss !== '' && _fss !== null && _fss !== undefined;
      const _pendientes = [];
      if (_esCooperador && !_tieneMRC) _pendientes.push('MRC-SS');
      if (_esCooperador && !_tieneFSS) _pendientes.push('FSS-ICU');

      return {
        idCama: id,
        ocupada: parseBool(c.OCUPADA),
        nombre: c.NOMBRE || (e && e.PAC_NOMBRE) || '',
        rut: c.RUT || (e && e.PAC_RUT) || '',
        edad: c.EDAD || (e && e.PAC_EDAD) || '',
        sexo: c.SEXO || (e && e.PAC_SEXO) || '',
        diagnostico: c.DIAGNOSTICO || (e && e.PAC_DIAGNOSTICO) || '',
        diasEstadia: e ? e.DIA_ESTADIA : _diasDesde(c.FECHA_INGRESO, fecha),
        diasVM: e ? e.DIAS_VM : _diasDesde(c.FECHA_INICIO_SOPORTE, fecha),
        diasVA: e ? e.DIAS_VA : _diasDesde(c.FECHA_INICIO_VA, fecha),
        soporte: (e && e.VENT_SOPORTE) || c.SOPORTE || '',
        viaAerea: (e && e.VENT_VIA_AEREA) || c.VIA_AEREA || '',
        modo: (e && e.VENT_MODO) || c.MODO || '',
        params: params,
        sedTipo: e ? (e.SED_TIPO || '') : '',
        sas: e ? (e.SED_SAS || '') : '',
        cooperacion: _coop,
        cooperador: _esCooperador,
        mrc: _tieneMRC ? _mrc : '',
        fss: _tieneFSS ? _fss : '',
        pendientesFuncionales: _pendientes,
        ultimoCultivo: ultimoCultivoPorCama[id] ? _entFecha(ultimoCultivoPorCama[id]) : '',
        ultimoCultivoISO: ultimoCultivoPorCama[id] || '',
        bnm: e ? parseBool(e.SED_BNM) : false,
        dva: e ? (e.HEMO_DVA || '') : '',
        hemoEstado: e ? (e.HEMO_ESTADO || '') : '',
        ktmNivel: e ? (e.KTM_NIVEL_KTR || c.KTM_NIVEL || '') : (c.KTM_NIVEL || ''),
        ktmMin: e ? (e.KTM_TIEMPO_MIN || '') : '',
        ktmRealizada: e ? parseBool(e.KTM_REALIZADA) : false,
        ktmSuspendida: e ? parseBool(e.KTM_SUSPENDIDA) : false,
        ktmContra: e ? (e.KTM_CONTRA_TIPO || '') : '',
        secrCant: e ? (e.EX_SECR_CANT || '') : '',
        secrTipo: e ? (e.EX_SECR_TIPO || '') : '',
        plan: e ? (e.PLAN_PLANES || '') : '',
        nota: e ? (e.PLAN_NOTA_TURNO || '') : '',
        firma: e ? (e.PLAN_FIRMA_KINE || c.FIRMA_KINE || '') : (c.FIRMA_KINE || ''),
        hitos: hitos,
        tieneEvo: !!e
      };
    });

    // ── Resumen de unidad ──
    const ocupadas = camas.filter(c => parseBool(c.OCUPADA)).length;
    const enVM = camas.filter(c => parseBool(c.OCUPADA) && String(c.SOPORTE) === 'VM').length;

    return ok({
      fecha, turno, turnoKey,
      generado: new Date().toISOString(),
      resumen: { ocupadas, enVM, totalCamas: camas.length, entregadas: fichas.length },
      fichas
    });
  } catch (e) {
    return err('obtenerEntregaTurno: ' + e.message, e);
  }
}

// Parámetros ventilatorios clave en texto compacto (solo no vacíos)
function _entParams(e) {
  const out = [];
  const push = (lbl, key) => {
    const val = e[key];
    if (val !== '' && val !== null && val !== undefined) out.push(`${lbl} ${val}`);
  };
  push('FiO₂', 'VENT_FIO2');
  push('PEEP', 'VENT_PEEP');
  push('FR', 'VENT_FR');
  push('VT', 'VENT_VT');
  push('PS', 'VENT_PS');
  push('SpO₂', 'VENT_SPO2');
  push('L', 'VENT_LITROS');
  return out.join(' · ');
}

function _entFecha(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]')
    return Utilities.formatDate(v, 'America/Santiago', 'dd/MM');
  const s = String(v);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : s;
}

function _diasDesde(fechaInicio, fechaRef) {
  if (!fechaInicio) return '';
  try {
    const a = new Date(_entToISO(fechaInicio)), b = new Date(fechaRef);
    if (isNaN(a) || isNaN(b)) return '';
    return Math.max(0, Math.round((b - a) / 86400000));
  } catch (e) { return ''; }
}
function _entToISO(v) {
  if (Object.prototype.toString.call(v) === '[object Date]')
    return Utilities.formatDate(v, 'America/Santiago', 'yyyy-MM-dd');
  return String(v).slice(0, 10);
}

/**
 * Guarda una entrega de turno emitida en la hoja ENTREGAS_TURNO
 * (la crea si no existe). Es historial, no afecta datos clínicos.
 *
 * @param {Object} payload { fecha, turno, kineEntrega, kineRecibe,
 *                           resumen, idCamas, htmlSnapshot, notas }
 */
function guardarEntregaTurno(payload) {
  return conLock(() => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let h = ss.getSheetByName('ENTREGAS_TURNO');
      if (!h) {
        h = ss.insertSheet('ENTREGAS_TURNO');
        h.appendRow([
          'ID', 'TIMESTAMP', 'FECHA', 'TURNO', 'KINE_ENTREGA', 'KINE_RECIBE',
          'CAMAS_N', 'OCUPADAS', 'EN_VM', 'CAMAS_IDS', 'NOTAS', 'SNAPSHOT_JSON'
        ]);
        h.getRange(1, 1, 1, 12).setFontWeight('bold').setBackground('#1e293b').setFontColor('#fff');
        h.setFrozenRows(1);
        // texto plano en columnas sensibles
        h.getRange(2, 1, h.getMaxRows() - 1, 4).setNumberFormat('@');
      }
      const id = 'ENT_' + Date.now();
      const r = payload.resumen || {};
      h.appendRow([
        id,
        new Date().toISOString(),
        payload.fecha || '',
        payload.turno || '',
        payload.kineEntrega || '',
        payload.kineRecibe || '',
        (payload.idCamas || []).length,
        r.ocupadas || '',
        r.enVM || '',
        (payload.idCamas || []).join(','),
        payload.notas || '',
        payload.snapshotJson || ''
      ]);
      return ok({ id });
    } catch (e) {
      return err('guardarEntregaTurno: ' + e.message, e);
    }
  });
}

/** Historial de entregas (cabeceras, sin snapshot pesado) */
function obtenerEntregasTurno(limite) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const h = ss.getSheetByName('ENTREGAS_TURNO');
    if (!h || h.getLastRow() < 2) return ok([]);
    const n = h.getLastRow() - 1;
    const vals = h.getRange(2, 1, n, 11).getValues(); // sin la col 12 (snapshot)
    const rows = vals.map(v => ({
      id: v[0], timestamp: v[1], fecha: v[2], turno: v[3],
      kineEntrega: v[4], kineRecibe: v[5], camasN: v[6],
      ocupadas: v[7], enVM: v[8], camasIds: v[9], notas: v[10]
    }));
    rows.reverse();
    return ok(limite ? rows.slice(0, limite) : rows);
  } catch (e) {
    return err('obtenerEntregasTurno: ' + e.message, e);
  }
}
