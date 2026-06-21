/**
 * ============================================================
 *  01_Utilidades.gs — Funciones auxiliares y cálculos clínicos
 *  RCE KINE UCIA | GAS-v1.1 (Fase 1)
 *
 *  CAMBIOS vs v1.0:
 *  + validarPayloadEvolucion(d)
 *  + validarPayloadIngreso(d)
 *  + parseBool() helper (TRUE/'TRUE'/true → true)
 * ============================================================
 */
 
// ═══════════════════════════════════════════════════════════
//  ACCESO A HOJAS
// ═══════════════════════════════════════════════════════════
 
function obtenerHoja(nombre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h  = ss.getSheetByName(nombre);
  if (!h) throw new Error(`Hoja "${nombre}" no encontrada. Ejecuta crearEstructuraBD() primero.`);
  return h;
}
 
function getDatos(nombreHoja, filaInicio, totalCols) {
  const h = obtenerHoja(nombreHoja);
  const ultima = h.getLastRow();
  if (ultima < filaInicio) return [];
  return h.getRange(filaInicio, 1, ultima - filaInicio + 1, totalCols).getValues();
}
 
// ═══════════════════════════════════════════════════════════
//  BÚSQUEDA DE FILAS
// ═══════════════════════════════════════════════════════════
 
function buscarFila(hoja, colIdx, valor, filaInicio) {
  const ultima = hoja.getLastRow();
  if (ultima < filaInicio) return -1;
  const datos = hoja.getRange(filaInicio, colIdx, ultima - filaInicio + 1, 1).getValues();
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === String(valor).trim()) return filaInicio + i;
  }
  return -1;
}
 
function buscarFilas(hoja, colIdx, valor, filaInicio) {
  const ultima = hoja.getLastRow();
  if (ultima < filaInicio) return [];
  const datos = hoja.getRange(filaInicio, colIdx, ultima - filaInicio + 1, 1).getValues();
  const result = [];
  for (let i = 0; i < datos.length; i++) {
    if (String(datos[i][0]).trim() === String(valor).trim()) result.push(filaInicio + i);
  }
  return result;
}

/**
 * ★ EFICIENCIA ★ — Lee TODAS las filas de datos de una hoja en UNA sola
 * llamada a Sheets y las devuelve como objetos (vía filaAObjeto).
 *
 * Reemplaza el patrón lento "N+1": antes se hacía buscarFilas() y luego un
 * getRange().getValues() por CADA fila coincidente. En Apps Script cada
 * getRange es un viaje de red (~100-200 ms), así que leer 20 evoluciones
 * costaba ~20 viajes. Con esto es UN solo viaje y el filtrado ocurre en
 * memoria (instantáneo).
 *
 * El filtro compara contra el valor YA convertido por filaAObjeto, de modo
 * que las fechas (que filaAObjeto normaliza a ISO) se comparan de forma
 * robusta aunque la celda venga como objeto Date.
 *
 * @param {Sheet}  hoja
 * @param {Object} mapaColumnas  p.ej. COL_EVO
 * @param {number} totalCols     p.ej. EVO_TOTAL_COLS
 * @param {number} filaInicio    p.ej. EVO_FILA_DATOS
 * @param {string} [filtroKey]   nombre de columna a filtrar (p.ej. 'ID_CAMA')
 * @param {*}      [filtroVal]   valor a igualar (comparación por string)
 * @return {Array<Object>}
 */
function leerHojaObjetos(hoja, mapaColumnas, totalCols, filaInicio, filtroKey, filtroVal) {
  const ultima = hoja.getLastRow();
  if (ultima < filaInicio) return [];
  const datos = hoja.getRange(filaInicio, 1, ultima - filaInicio + 1, totalCols).getValues();
  const fv = (filtroVal !== undefined && filtroVal !== null) ? String(filtroVal).trim() : null;
  const out = [];
  for (let i = 0; i < datos.length; i++) {
    const obj = filaAObjeto(datos[i], mapaColumnas);
    if (fv !== null && String(obj[filtroKey]).trim() !== fv) continue;
    out.push(obj);
  }
  return out;
}
 
// ═══════════════════════════════════════════════════════════
//  CONVERSIÓN FILA ↔ OBJETO
// ═══════════════════════════════════════════════════════════
 
function filaAObjeto(fila, mapaColumnas) {
  const obj = {};
  Object.entries(mapaColumnas).forEach(([key, idx]) => {
    let val = fila[idx - 1];
    if (val instanceof Date) val = _fechaAISO(val);
    obj[key] = val === undefined ? '' : val;
  });
  return obj;
}
 
function objetoAFila(obj, mapaColumnas, totalCols) {
  const fila = new Array(totalCols).fill('');
  Object.entries(mapaColumnas).forEach(([key, idx]) => {
    if (obj[key] !== undefined && obj[key] !== null) {
      fila[idx - 1] = obj[key];
    }
  });
  return fila;
}
 
/**
 * NUEVO — parseBool: acepta true, 'TRUE', 'true', 1, '1' como verdaderos.
 * Centraliza el "if (x === true || x === 'TRUE')" que estaba disperso.
 */
function parseBool(v) {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toUpperCase();
    return s === 'TRUE' || s === '1' || s === 'YES' || s === 'SÍ' || s === 'SI';
  }
  return false;
}
 
// ═══════════════════════════════════════════════════════════
//  FECHAS Y TIEMPOS
// ═══════════════════════════════════════════════════════════
 
function fechaHoyISO() {
  return Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd');
}
 
function timestampAhora() {
  return Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd HH:mm:ss');
}
 
function _fechaAISO(fecha) {
  if (!fecha || !(fecha instanceof Date)) return String(fecha || '');
  return Utilities.formatDate(fecha, 'America/Santiago', 'yyyy-MM-dd');
}
 
function calcularDias(fechaInicioISO, fechaFinISO) {
  if (!fechaInicioISO || !fechaFinISO) return 0;
  try {
    const d1 = new Date(String(fechaInicioISO).slice(0,10) + 'T00:00:00');
    const d2 = new Date(String(fechaFinISO).slice(0,10)   + 'T00:00:00');
    const diff = d2 - d1;
    return diff < 0 ? 0 : Math.floor(diff / 86400000);
  } catch (e) { return 0; }
}
 
// ═══════════════════════════════════════════════════════════
//  GENERADORES DE ID
// ═══════════════════════════════════════════════════════════
 
function generarIdEvolucion(idCama, turnoKey) { return `CAMA_${idCama}_${turnoKey}`; }
function generarIdProcedimiento() { return `PROC_${Date.now()}_${Math.random().toString(36).substr(2,5).toUpperCase()}`; }
function generarIdHito() { return `HITO_${Date.now()}_${Math.random().toString(36).substr(2,5).toUpperCase()}`; }
function generarIdArchivo() { return `ARCH_${Date.now()}_${Math.random().toString(36).substr(2,5).toUpperCase()}`; }
 
// ═══════════════════════════════════════════════════════════
//  CÁLCULOS CLÍNICOS
// ═══════════════════════════════════════════════════════════
 
function calcularPI(sexo, tallaCm) {
  const t = parseFloat(tallaCm);
  if (!t || t <= 0 || !sexo) return 0;
  const base = sexo === 'M' ? 50 : 45.5;
  return Math.round((base + 0.91 * (t - 152.4)) * 10) / 10;
}
 
function calcularRespiratorio(evo) {
  const n = (v) => parseFloat(v) || 0;
  const vt   = n(evo.VENT_VT);
  const fr   = n(evo.VENT_FR);
  const peep = n(evo.VENT_PEEP);
  const ppl  = n(evo.VENT_PPL);
  const flujo= n(evo.VENT_FLUJO);
  const ti   = n(evo.VENT_TI);
  const fio2 = n(evo.VENT_FIO2);
  const spo2 = n(evo.VENT_SPO2);
  const pi   = n(evo.PAC_PESO_IDEAL);
  const modo = evo.VENT_MODO || '';
  const calc = {};
 
  if (vt > 0 && pi > 0) calc.CALC_ML_KG = Math.round((vt / pi) * 10) / 10;
  if (vt > 0 && fr > 0) calc.CALC_VOL_MIN = Math.round((vt * fr / 1000) * 100) / 100;
  if (['ACVC','ACPC'].includes(modo) && flujo > 0 && fr > 0 && ti > 0) {
    const te = 60 / fr - ti;
    if (te > 0) calc.CALC_IE = `1:${Math.round((te / ti) * 10) / 10}`;
  }
  if (ppl > 0 && peep >= 0) calc.CALC_DP = Math.round((ppl - peep) * 10) / 10;
  if (vt > 0 && ppl > 0 && (ppl - peep) > 0) calc.CALC_CESR = Math.round((vt / (ppl - peep)) * 10) / 10;
  if (['CPAP/PS','CFLEX','S/T'].includes(modo) && fr > 0 && vt > 0) {
    calc.CALC_TOBIN = Math.round((fr / (vt / 1000)) * 10) / 10;
  }
  if (['CNAF','OAF/CTAF'].includes(modo) && spo2 > 0 && fio2 > 0 && fr > 0) {
    calc.CALC_IROX = Math.round(((spo2 / fio2) / fr) * 100) / 100;
  }
  return calc;
}
 
// ═══════════════════════════════════════════════════════════
//  ★ NUEVO ★ — VALIDACIÓN DE PAYLOADS
// ═══════════════════════════════════════════════════════════
 
/**
 * Valida el payload de una evolución antes de escribirla.
 * @returns {string[]} array de mensajes de error (vacío si todo OK)
 */
function validarPayloadEvolucion(d) {
  const errs = [];
  if (!d) return ['Payload vacío'];
 
  // Obligatorios
  if (!d.ID_CAMA && !d.idCama) errs.push('Falta ID_CAMA');
  if (!d.TURNO_KEY && !d.turnoKey) errs.push('Falta TURNO_KEY');
  if (!d.PLAN_FIRMA_KINE || String(d.PLAN_FIRMA_KINE).trim() === '') {
    errs.push('Falta firma del kinesiólogo');
  }
 
  // Edad UCI adultos
  if (d.PAC_EDAD !== undefined && d.PAC_EDAD !== '' && d.PAC_EDAD !== null) {
    const e = parseInt(d.PAC_EDAD);
    if (isNaN(e) || e < 15 || e > 110) errs.push(`Edad fuera de rango (15-110): ${d.PAC_EDAD}`);
  }
 
  // Talla
  if (d.PAC_TALLA) {
    const t = parseFloat(d.PAC_TALLA);
    if (isNaN(t) || t < 100 || t > 230) errs.push(`Talla fuera de rango (100-230 cm): ${d.PAC_TALLA}`);
  }
 
  // FiO2
  if (d.VENT_FIO2) {
    const f = parseFloat(d.VENT_FIO2);
    if (isNaN(f) || f < 21 || f > 100) errs.push(`FiO₂ fuera de rango (21-100%): ${d.VENT_FIO2}`);
  }
 
  // SpO2
  if (d.VENT_SPO2) {
    const s = parseFloat(d.VENT_SPO2);
    if (isNaN(s) || s < 0 || s > 100) errs.push(`SpO₂ fuera de rango (0-100%): ${d.VENT_SPO2}`);
  }
 
  // VT
  if (d.VENT_VT) {
    const v = parseFloat(d.VENT_VT);
    if (isNaN(v) || v < 50 || v > 1500) errs.push(`VT fuera de rango (50-1500 ml): ${d.VENT_VT}`);
  }
 
  // PEEP (warning solo si extremo)
  if (d.VENT_PEEP) {
    const p = parseFloat(d.VENT_PEEP);
    if (!isNaN(p) && p > 30) errs.push(`PEEP > 30 cmH₂O — verificar: ${d.VENT_PEEP}`);
  }
 
  // FR
  if (d.VENT_FR) {
    const fr = parseFloat(d.VENT_FR);
    if (!isNaN(fr) && (fr < 4 || fr > 60)) errs.push(`FR fuera de rango (4-60 rpm): ${d.VENT_FR}`);
  }
 
  // Barthel
  if (d.PAC_BARTHEL) {
    const b = parseInt(d.PAC_BARTHEL);
    if (isNaN(b) || b < 0 || b > 100) errs.push(`Barthel fuera de rango (0-100): ${d.PAC_BARTHEL}`);
  }
 
  return errs;
}
 
/** Validación reducida para ingreso (solo lo crítico). */
function validarPayloadIngreso(d) {
  const errs = [];
  if (!d) return ['Payload vacío'];
  if (!d.idCama) errs.push('Falta idCama');
  if (!d.nombre || String(d.nombre).trim() === '') errs.push('Falta nombre del paciente');
  if (!d.firmaKine) errs.push('Falta firma del kinesiólogo');
  if (d.edad) {
    const e = parseInt(d.edad);
    if (isNaN(e) || e < 15 || e > 110) errs.push(`Edad fuera de rango (15-110): ${d.edad}`);
  }
  if (d.talla) {
    const t = parseFloat(d.talla);
    if (isNaN(t) || t < 100 || t > 230) errs.push(`Talla fuera de rango (100-230 cm): ${d.talla}`);
  }
  return errs;
}
 
// ═══════════════════════════════════════════════════════════
//  RESPUESTA ESTÁNDAR
// ═══════════════════════════════════════════════════════════
 
function ok(data) { return { ok: true, data: data }; }
function err(msg, e) {
  console.error(msg, e || '');
  return { ok: false, error: msg };
}
 
// ═══════════════════════════════════════════════════════════
//  PROTECCIÓN CONCURRENCIA
// ═══════════════════════════════════════════════════════════
 
function conLock(fn) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    return fn();
  } finally {
    lock.releaseLock();
  }
}
 