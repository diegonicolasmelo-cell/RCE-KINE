/**
 * ============================================================
 *  esquema.gs — FUENTE ÚNICA DE VERDAD del modelo de datos
 *  RCE-KINE v2 · Google Apps Script + Google Sheets
 * ------------------------------------------------------------
 *  Traducción de ESQUEMA.md. Aquí se define CADA hoja y CADA
 *  columna UNA sola vez. De aquí se derivan:
 *    · COL.<HOJA>.<CAMPO>  → índice 1-based
 *    · TOTAL_COLS.<HOJA>   → nº de columnas
 *    · SH.<HOJA>           → nombre de la hoja
 *    · FILA_DATOS.<HOJA>   → primera fila de datos
 *  REGLA DE ORO: prohibido hardcodear índices/totales en otro
 *  archivo. Si cambia una columna, se cambia SOLO acá.
 * ============================================================
 */

// Tipos válidos: 'texto','entero','decimal','bool','fecha','ts','uuid','email','json'
// Los siguientes se fuerzan a formato de celda texto '@' (evita que Sheets
// reinterprete fechas ISO, RUT/códigos, IDs o JSON como número/fecha).
const _TIPOS_TEXTO = ['texto', 'fecha', 'ts', 'uuid', 'email', 'json'];

// ── Columnas de EVOLUCIONES (195). Se reutilizan en EVOLUCIONES_ARCHIVO. ──
const _COLS_EVOLUCIONES = [
  // A. Metadatos e identidad
  ['ID_EVOLUCION','texto'],['ID_CAMA','texto'],['PATIENT_ID','uuid'],['COD_PACIENTE','texto'],
  ['TURNO_KEY','texto'],['FECHA','fecha'],['TURNO','texto'],['ES_INGRESO','bool'],
  ['ES_REINGRESO','bool'],['TIMESTAMP','ts'],['AUTOR_EMAIL','email'],['DIA_ESTADIA','entero'],
  ['DIAS_VM','entero'],['DIAS_VA','entero'],
  // B. Identificación del paciente (snapshot del turno)
  ['PAC_NOMBRE','texto'],['PAC_COD','texto'],['PAC_EDAD','entero'],['PAC_SEXO','texto'],
  ['PAC_TALLA','decimal'],['PAC_PESO_IDEAL','decimal'],['PAC_BARTHEL','entero'],['PAC_ECF','texto'],
  ['PAC_DIAGNOSTICO','texto'],['PAC_DIAG_REM','texto'],['PAC_AISLAMIENTO','bool'],
  ['PAC_AISL_MICRO','texto'],['PAC_AISL_LISTA','json'],
  // C. Fase clínica
  ['FASE_JSON','json'],
  // D. Sedación y conciencia
  ['SED_TIPO','texto'],['SED_SAS','texto'],['SED_S5Q','texto'],['SED_COOPERACION','texto'],
  ['SED_CAM_ICU','texto'],['SED_GCS_O','entero'],['SED_GCS_V','entero'],['SED_GCS_M','entero'],
  ['SED_GCS_TOT','entero'],['SED_BNM','bool'],
  // E. Hemodinamia
  ['HEMO_ESTADO','texto'],['HEMO_DVA','texto'],['HEMO_MULTI_DVA','bool'],['HEMO_NUM_DVA','entero'],
  ['HEMO_TENDENCIA','bool'],['HEMO_TEND_TIPO','texto'],
  // F. Examen físico
  ['EX_MP','texto'],['EX_RUIDOS','texto'],['EX_RUIDOS_LOC','texto'],
  // G. Vía aérea — configuración
  ['VENT_VIA_AEREA','texto'],['VA_EXTERNO','bool'],['VA_EXTERNO_DIAS','entero'],['VENT_TOT_NUM','texto'],
  ['VENT_TOT_CM','texto'],['TOT_FIJACION','texto'],['VENT_TQT_TIPO','texto'],['VENT_TQT_CALIBRE','texto'],
  ['FECHA_INICIO_TQT','fecha'],['VENT_SOPORTE','texto'],['VENT_MODO','texto'],['VENT_ADAPTADO','texto'],
  ['VENT_H_ACTIVA','bool'],
  // H. Contadores por episodio
  ['DIAS_VM_PREVIOS','entero'],['FECHA_INICIO_VM','fecha'],['DIAS_VNI_PREVIOS','entero'],
  ['FECHA_INICIO_VNI','fecha'],['N_REINTUB','entero'],
  // I. Ventilatorio — parámetros
  ['VENT_VT','decimal'],['VENT_FR','decimal'],['VENT_PEEP','decimal'],['VENT_PMAX','decimal'],
  ['VENT_PMEDIA','decimal'],['VENT_PPL','decimal'],['VENT_AUTOPEEP','decimal'],['VENT_PINSP','decimal'],
  ['VENT_PS','decimal'],['VENT_IPAP','decimal'],['VENT_EPAP','decimal'],['VENT_IPAP_MIN','decimal'],
  ['VENT_IPAP_MAX','decimal'],['VENT_VT_ASEG','decimal'],['VENT_FLUJO','decimal'],['VENT_TI','decimal'],
  ['VENT_FIO2','decimal'],['VENT_SPO2','decimal'],['VENT_TEMP','decimal'],['VENT_LITROS','decimal'],
  ['VENT_PMUSC','decimal'],['VENT_P01','decimal'],['VENT_DPOCC','decimal'],['VENT_RISETIME','decimal'],
  ['VENT_CAB_RSS','texto'],['VENT_CAB_RSS_DESC','texto'],
  // J. Valores calculados (derivados)
  ['CALC_ML_KG','texto'],['CALC_VOL_MIN','texto'],['CALC_IE','texto'],['CALC_DP','texto'],
  ['CALC_CESR','texto'],['CALC_TOBIN','texto'],['CALC_IROX','texto'],
  // K. KTM / rehabilitación
  ['KTM_REALIZADA','bool'],['KTM_SUSPENDIDA','bool'],['KTM_NO_REALIZADA','bool'],['KTM_NO_RAZON','texto'],
  ['KTM_NO_COMENTARIO','texto'],['KTM_CONTRA_TIPO','texto'],['KTM_CONTRA_CAT','texto'],
  ['KTM_CONTRA_RAZON','texto'],['KTM_CONTRA_MANUAL','texto'],['KTM_NIVEL_KTR','texto'],
  ['KTM_ASISTENCIA','texto'],['KTM_TIEMPO_MIN','entero'],['KTM_ALERTA','bool'],['KTM_ALERTA_CAT','texto'],
  ['KTM_ALERTA_RAZ','texto'],['KTM_UMA','texto'],['KTM_IMT','bool'],['KTM_IMT_FREQ','texto'],
  ['KTM_IMT_INT','texto'],['KTM_IMT_T','texto'],['KTM_IMT_DES','texto'],
  // L. Terapia respiratoria
  ['RESP_KTR_CANT','entero'],['RESP_SIN_KTR','bool'],['RESP_SOF','bool'],['RESP_SNF','bool'],
  ['RESP_SET','bool'],['RESP_ATOS','bool'],['RESP_INHALO','bool'],['RESP_SECR_QTY','texto'],
  ['RESP_SECR_CAR','texto'],['RESP_SECR_REOL','texto'],['RESP_CULT_FECHAS','texto'],['RESP_CULT_OBJ','texto'],
  // M. Posicionamiento
  ['RESP_POS_SED','bool'],['RESP_POS_DCLD','bool'],['RESP_POS_DCLI','bool'],['RESP_POS_PRONO','bool'],
  ['RESP_POS_SUPINO','bool'],['RESP_POS_LIBRE','texto'],['RESP_PRONO_TS','texto'],['RESP_SUPINO_TS','texto'],
  ['RESP_PRONO_HORA','texto'],['RESP_SUPINO_HORA','texto'],
  // N. PVE
  ['PVE_RESULTADO','texto'],['PVE_FR_MOTIVOS','json'],['PVE_SC_RAZON','texto'],['PVE_VAL','texto'],
  // O. Extubación (EXT_*)
  ['EXT_OCURRIO','bool'],['EXT_HORA','texto'],['EXT_TS','json'],['EXT_TIPO','texto'],['EXT_MOTIVO','texto'],
  ['EXT_POST_DET','texto'],['EXT_REINTUB','bool'],['EXT_REINTUB_RAZ','texto'],['EXT_PE_VA','texto'],
  ['EXT_PE_SOP','texto'],['EXT_PE_MODO','texto'],
  // P. Decanulación
  ['DECAN_OCURRIO','bool'],['DECAN_TIPO','texto'],['DECAN_QUEDA_DISP','texto'],['DECAN_QUEDA_FLUJO','texto'],
  ['DECAN_QUEDA_SPO2','texto'],['DECAN_DET','texto'],['DECAN_RECANUL','bool'],
  // Q. Estado final de vía aérea
  ['VENT_VIA_AEREA_FINAL','texto'],['VENT_SOPORTE_FINAL','texto'],['VENT_MODO_FINAL','texto'],
  // R. AET
  ['AET_ACTIVA','bool'],['AET_NIVEL','texto'],
  // S. Muestras microbiológicas
  ['MUE_REALIZADAS','bool'],['MUE_TIPOS_JSON','json'],['MUE_RESULTADOS_JSON','json'],['EX_CULT_RESULTADO','texto'],
  // T. Evaluación funcional por turno (reemplaza EGR_*)
  ['EVAL_FECHA','fecha'],['EVAL_T_REALIZAR','bool'],['EVAL_NIVEL_MOTOR','texto'],['EVAL_T_MRC','entero'],
  ['EVAL_T_DINAMO','decimal'],['EVAL_T_FSS','entero'],['EVAL_T_PIM','decimal'],['EVAL_T_PEM','decimal'],
  ['EVAL_T_FEM','decimal'],['EVAL_T_GROSOR','decimal'],['EVAL_T_HALLAZGOS','texto'],['EVAL_T_PMANT_VA','texto'],
  // U. Test de apnea y test de azul (BDT) — repetibles
  ['APNEA_JSON','json'],['APNEA_ULTIMO','texto'],['BDT_JSON','json'],['BDT_ULTIMO','texto'],
  // V. Procedimientos
  ['PROC_JSON','json'],['PROC_RESUMEN','texto'],['PROC_CANTIDAD','entero'],
  // W. Planes, firma y generado
  ['PLAN_PLANES','texto'],['PLAN_NOTA_TURNO','texto'],['PLAN_FIRMA_KINE','texto'],['TEXTO_GENERADO','texto'],
];

// ── Definición de todas las hojas ──────────────────────────
const ESQUEMA = {
  CONFIG: { headerRows: 1, cols: [
    ['CLAVE','texto'],['VALOR','texto'],
  ]},
  CATALOGOS: { headerRows: 1, cols: [
    ['TIPO','texto'],['VALOR','texto'],['ORDEN','entero'],['ACTIVO','bool'],
  ]},
  CAMAS_ESTADO: { headerRows: 2, cols: [
    ['ID_CAMA','texto'],['OCUPADA','bool'],['STATUS_CAMA','texto'],['PATIENT_ID','uuid'],['COD_PACIENTE','texto'],
    ['NOMBRE','texto'],['EDAD','entero'],['SEXO','texto'],['TALLA_CM','decimal'],['PESO_IDEAL_KG','decimal'],
    ['BARTHEL','entero'],['ECF','texto'],['DIAGNOSTICO','texto'],['DIAG_REM','texto'],['AISLAMIENTO','bool'],
    ['AISL_MICRO','texto'],['VIA_AEREA','texto'],['TOT_NUMERO','texto'],['TOT_CM_LABIO','texto'],['TQT_TIPO','texto'],
    ['SOPORTE','texto'],['MODO','texto'],['FECHA_INGRESO','fecha'],['FECHA_INICIO_VA','fecha'],
    ['FECHA_INICIO_SOPORTE','fecha'],['FASE_JSON','json'],['KTM_NIVEL','texto'],['KTM_SUSP','bool'],
    ['FIRMA_KINE','texto'],['AUTOR_EMAIL','email'],['TEXTO_EVO_DIA','texto'],['TEXTO_EVO_NOCHE','texto'],
    ['ULTIMO_TURNO_KEY','texto'],['TIMELINE_JSON','json'],['KTR_DIA','entero'],['KTM_DIA','texto'],
    ['PROC_DIA','texto'],['FIRMA_DIA','texto'],['KEY_DIA','texto'],['KTR_NOCHE','entero'],['PROC_NOCHE','texto'],
    ['FIRMA_NOCHE','texto'],['KEY_NOCHE','texto'],
  ]},
  EVOLUCIONES:         { headerRows: 3, cols: _COLS_EVOLUCIONES },
  EVOLUCIONES_ARCHIVO: { headerRows: 3, cols: _COLS_EVOLUCIONES },
  PROCEDIMIENTOS: { headerRows: 1, cols: [
    ['ID_PROC','texto'],['ID_EVOLUCION','texto'],['ID_CAMA','texto'],['PATIENT_ID','uuid'],['FECHA','fecha'],
    ['TURNO','texto'],['TIPO_PROC','texto'],['NOMBRE_PROC','texto'],['DESCRIPCION','texto'],
    ['AUTOR_EMAIL','email'],['TIMESTAMP','ts'],
  ]},
  TIMELINE: { headerRows: 1, cols: [
    ['ID_HITO','texto'],['ID_CAMA','texto'],['PATIENT_ID','uuid'],['FECHA','fecha'],['TURNO','texto'],
    ['TIPO','texto'],['TEXTO','texto'],['AUTOR','texto'],['AUTOR_EMAIL','email'],['TIMESTAMP','ts'],
  ]},
  ARCHIVO_PACIENTES: { headerRows: 1, cols: [
    ['ID_ARCHIVO','texto'],['PATIENT_ID','uuid'],['CAMA_ORIGEN','texto'],['COD_PACIENTE','texto'],
    ['FECHA_INGRESO','fecha'],['FECHA_EGRESO','fecha'],['DIAS_TOTAL','entero'],['DIAS_VM_TOTAL','entero'],
    ['DIAS_VA_TOTAL','entero'],['NOMBRE','texto'],['EDAD','entero'],['SEXO','texto'],['DIAGNOSTICO','texto'],
    ['DIAG_REM','texto'],['MOTIVO_EGRESO','texto'],['DESTINO_EGRESO','texto'],['KTR_TOTAL','entero'],
    ['TURNOS_VM','entero'],['TURNOS_KTM','entero'],['TURNOS_KTMC','entero'],['EXTUBACION_OK','bool'],
    ['REINTUBACION','bool'],['BARTHEL_INGRESO','entero'],['BARTHEL_EGRESO','entero'],['FSS_EGRESO','entero'],
    ['MRC_SS_EGRESO','entero'],['FIRMA_RESPONSABLE','texto'],['AUTOR_EMAIL','email'],['OBSERVACIONES','texto'],
    ['TIMELINE_JSON','json'],['APNEA_JSON','json'],['BDT_JSON','json'],['FASE_FINAL','texto'],
  ]},
  KINESIOLOGOS: { headerRows: 1, cols: [
    ['FIRMA','texto'],['NOMBRE','texto'],['EMAIL','email'],['APOYO','bool'],['ACTIVO','bool'],
  ]},
  ESTADISTICAS_REM: { headerRows: 1, cols: [
    ['MES','texto'],['INGRESOS','entero'],['DIAS_CAMA','entero'],['TURNOS_VM','entero'],['TURNOS_KTM','entero'],
    ['TURNOS_KTMC','entero'],['SUM_KTR','entero'],['KTR_PROM','decimal'],['DIAG_JSON','json'],['TEXTO_REM','texto'],
    ['GENERADO_TS','ts'],['GENERADO_POR','email'],
  ]},
  TURNOS: { headerRows: 1, cols: [
    ['KEY','texto'],['DATA','json'],['TIMESTAMP','ts'],
  ]},
  REINTUBACIONES: { headerRows: 1, cols: [
    ['ID_REINTUB','texto'],['PATIENT_ID','uuid'],['TIMESTAMP','ts'],['FECHA','fecha'],['TURNO','texto'],
    ['ID_CAMA','texto'],['ID_EVOLUCION','texto'],['NOMBRE','texto'],['COD_PACIENTE','texto'],['DIAGNOSTICO','texto'],
    ['TIPO_DESVINCULACION','texto'],['MOTIVO','texto'],['SOPORTE_PREVIO','texto'],['TIEMPO_EXTUBADO','texto'],
    ['HORA_REINTUBACION','texto'],['KINESIOLOGO','texto'],['AUTOR_EMAIL','email'],
  ]},
  ENTREGAS_TURNO: { headerRows: 1, cols: [
    ['ID','texto'],['TIMESTAMP','ts'],['FECHA','fecha'],['TURNO','texto'],['KINE_ENTREGA','texto'],
    ['KINE_RECIBE','texto'],['AUTOR_EMAIL','email'],['CAMAS_N','entero'],['OCUPADAS','entero'],['EN_VM','entero'],
    ['CAMAS_IDS','texto'],['NOTAS','texto'],['SNAPSHOT_JSON','json'],
  ]},
  AUDIT_LOG: { headerRows: 1, cols: [
    ['ID','texto'],['TIMESTAMP','ts'],['USUARIO_EMAIL','email'],['FIRMA','texto'],['ACCION','texto'],
    ['ENTIDAD','texto'],['ID_ENTIDAD','texto'],['PATIENT_ID','uuid'],['RESUMEN','texto'],
  ]},
  IMPORTAR: { headerRows: 1, cols: [
    ['CAMA','texto'],['NOMBRE','texto'],['EDAD','texto'],['SEXO','texto'],['FECHA_INGRESO','texto'],
    ['DIAGNOSTICO','texto'],['DIAG_REM','texto'],['VIA_SOPORTE','texto'],['TALLA','texto'],
  ]},
};

// ── Derivados (generados una sola vez desde ESQUEMA) ───────
const SH = {};          // SH.EVOLUCIONES → 'EVOLUCIONES'
const COL = {};         // COL.EVOLUCIONES.FECHA → 6
const TOTAL_COLS = {};  // TOTAL_COLS.EVOLUCIONES → 195
const FILA_DATOS = {};  // FILA_DATOS.EVOLUCIONES → 4
(function _derivar() {
  Object.keys(ESQUEMA).forEach(hoja => {
    SH[hoja] = hoja;
    const def = ESQUEMA[hoja];
    const m = {};
    def.cols.forEach((c, i) => { m[c[0]] = i + 1; });
    COL[hoja] = m;
    TOTAL_COLS[hoja] = def.cols.length;
    FILA_DATOS[hoja] = def.headerRows + 1;
  });
})();

// ── Conversión fila ↔ objeto (dirigida por esquema) ────────
function esquemaFilaAObjeto(hoja, fila) {
  const cols = ESQUEMA[hoja].cols, obj = {};
  for (let i = 0; i < cols.length; i++) {
    let v = fila[i];
    if (v instanceof Date) v = Utilities.formatDate(v, _tz(), 'yyyy-MM-dd');
    obj[cols[i][0]] = (v === undefined) ? '' : v;
  }
  return obj;
}
function esquemaObjetoAFila(hoja, obj) {
  const cols = ESQUEMA[hoja].cols, fila = new Array(cols.length).fill('');
  for (let i = 0; i < cols.length; i++) {
    const v = obj[cols[i][0]];
    if (v !== undefined && v !== null) fila[i] = v;
  }
  return fila;
}

function _tz() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const h = ss.getSheetByName('CONFIG');
    if (h) {
      const vals = h.getRange(1, 1, h.getLastRow() || 1, 2).getValues();
      for (const r of vals) if (String(r[0]) === 'TIMEZONE' && r[1]) return String(r[1]);
    }
  } catch (e) {}
  return 'America/Santiago';
}

// ============================================================
//  CREACIÓN / REPARACIÓN DE LA ESTRUCTURA (idempotente)
// ============================================================
function crearORepararEstructura() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const creadas = [];

  Object.keys(ESQUEMA).forEach(hoja => {
    const def = ESQUEMA[hoja];
    const total = def.cols.length;
    let h = ss.getSheetByName(hoja);
    if (!h) { h = ss.insertSheet(hoja); creadas.push(hoja); }

    // Asegurar ancho suficiente (migración no destructiva).
    if (h.getMaxColumns() < total) {
      h.insertColumnsAfter(h.getMaxColumns(), total - h.getMaxColumns());
    }

    // Escribir encabezados (fila de nombres siempre re-sincronizada).
    const nombres = def.cols.map(c => c[0]);
    if (def.headerRows >= 2) {
      // Fila 1: título de la hoja; Fila 2: nombres; resto de headerRows: vacías.
      h.getRange(1, 1).setValue(hoja);
      h.getRange(2, 1, 1, total).setValues([nombres]);
    } else {
      h.getRange(1, 1, 1, total).setValues([nombres]);
    }
    h.setFrozenRows(def.headerRows);

    // Formato texto '@' en columnas sensibles.
    _forzarTexto(h, def);
  });

  _sembrar(ss);
  SpreadsheetApp.flush();

  const msg = creadas.length
    ? 'Hojas creadas: ' + creadas.join(', ') + '.'
    : 'Todas las hojas existían; estructura verificada.';
  return { ok: true, creadas: creadas, mensaje: msg };
}

function _forzarTexto(h, def) {
  const filaInicio = def.headerRows + 1;
  const nFilas = h.getMaxRows() - filaInicio + 1;
  if (nFilas < 1) return;
  def.cols.forEach((c, i) => {
    if (_TIPOS_TEXTO.indexOf(c[1]) !== -1) {
      h.getRange(filaInicio, i + 1, nFilas, 1).setNumberFormat('@');
    }
  });
}

// ── Datos semilla ──────────────────────────────────────────
function _sembrar(ss) {
  // CONFIG
  const hCfg = ss.getSheetByName('CONFIG');
  const cfgDefaults = [
    ['NUM_CAMAS', '18'],
    ['TIMEZONE', 'America/Santiago'],
    ['ULTIMO_BACKUP', ''],
    ['OAUTH_CLIENT_ID', ''],
    ['BACKUP_MAX_DIARIOS', '30'],
    ['VERSION_ESQUEMA', '2.0'],
  ];
  const cfgExist = _valoresCol(hCfg, 1, 2);
  cfgDefaults.forEach(kv => { if (cfgExist.indexOf(kv[0]) === -1) hCfg.appendRow(kv); });

  // CATALOGOS — fases clínicas iniciales
  const hCat = ss.getSheetByName('CATALOGOS');
  if (hCat.getLastRow() < 2) {
    const fases = ['Reanimación inicial','Protección pulmonar','Neuroprotección',
      'Postoperatorio inmediato','Espera de second look','Weaning','Rehabilitación'];
    const filas = fases.map((f, i) => ['FASE_CLINICA', f, i + 1, true]);
    hCat.getRange(2, 1, filas.length, 4).setValues(filas);
  }

  // KINESIOLOGOS — semilla (EMAIL vacío: se completa antes de producción)
  const hK = ss.getSheetByName('KINESIOLOGOS');
  if (hK.getLastRow() < 2) {
    const seed = [
      ['MOW','Mauricio Ortega Wanders','',false,true],['FGE','Felipe Guerrero Espinoza','',false,true],
      ['NPR','Natalia Parra Rojas','',false,true],['SOG','Sergio Ortiz Gómez','',false,true],
      ['MVA','María Vega Astudillo','',false,true],['AWE','Álvaro Wilson Espinoza','',false,true],
      ['EGT','Eduardo González Tapia','',false,true],['DMV','Diego Melo Villagrán','',false,true],
      ['KGV','Karen González Vásquez','',false,true],['CMF','Carlos Morales Flores','',false,true],
      ['AAG','Andrés Ángel Gómez','',false,true],['MFB','Manuel Fuentes Blanco','',false,true],
      ['ACR','Aline Campos Rivera','',false,true],['RC','Rodrigo Caamaño','',false,true],
      ['MCC','Magdalena Contando Cisternas','',true,true],
    ];
    hK.getRange(2, 1, seed.length, 5).setValues(seed);
  }

  // CAMAS_ESTADO — sembrar NUM_CAMAS camas vacías
  const hCam = ss.getSheetByName('CAMAS_ESTADO');
  const filaDatos = FILA_DATOS.CAMAS_ESTADO;
  if (hCam.getLastRow() < filaDatos) {
    const n = _numCamas(hCfg);
    const total = TOTAL_COLS.CAMAS_ESTADO, c = COL.CAMAS_ESTADO;
    const filas = [];
    for (let i = 1; i <= n; i++) {
      const f = new Array(total).fill('');
      f[c.ID_CAMA - 1] = String(i);
      f[c.OCUPADA - 1] = false;
      f[c.STATUS_CAMA - 1] = 'Libre';
      f[c.VIA_AEREA - 1] = 'Natural';
      f[c.SOPORTE - 1] = 'Ambiente';
      f[c.MODO - 1] = 'Sin soporte';
      filas.push(f);
    }
    hCam.getRange(filaDatos, 1, filas.length, total).setValues(filas);
  }
}

function _valoresCol(h, col, filaInicio) {
  const ult = h.getLastRow();
  if (ult < filaInicio) return [];
  return h.getRange(filaInicio, col, ult - filaInicio + 1, 1).getValues().map(r => String(r[0]));
}
function _numCamas(hCfg) {
  const vals = hCfg.getRange(1, 1, hCfg.getLastRow() || 1, 2).getValues();
  for (const r of vals) if (String(r[0]) === 'NUM_CAMAS') { const n = parseInt(r[1]); if (n > 0) return n; }
  return 18;
}

// ── Autotest del esquema (integridad) ──────────────────────
function testEsquema() {
  const errs = [];
  Object.keys(ESQUEMA).forEach(hoja => {
    const nombres = ESQUEMA[hoja].cols.map(c => c[0]);
    const set = new Set(nombres);
    if (set.size !== nombres.length) errs.push(hoja + ': nombres de columna duplicados');
    if (TOTAL_COLS[hoja] !== nombres.length) errs.push(hoja + ': TOTAL_COLS inconsistente');
  });
  if (TOTAL_COLS.EVOLUCIONES !== 195) errs.push('EVOLUCIONES != 195 columnas: ' + TOTAL_COLS.EVOLUCIONES);
  console.log(errs.length ? '❌ ' + errs.join(' | ') : '✅ Esquema OK (' + Object.keys(ESQUEMA).length + ' hojas)');
  return errs;
}
