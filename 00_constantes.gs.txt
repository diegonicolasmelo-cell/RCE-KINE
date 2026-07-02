/**
 * ============================================================
 *  00_Constantes.gs — Mapas de columnas y constantes globales
 *  RCE KINE UCIA | GAS-v1.0
 *
 *  ⚠️ IMPORTANTE: Si agregas columnas en el Spreadsheet,
 *  actualiza los índices aquí también.
 * ============================================================
 */

// ── Nombres de hojas ─────────────────────────────────────────
const SH = {
  CONFIG:        'CONFIG',
  CAMAS:         'CAMAS_ESTADO',
  EVOLUCIONES:   'EVOLUCIONES',
  PROCEDIMIENTOS:'PROCEDIMIENTOS',
  TIMELINE:      'TIMELINE',
  ARCHIVO:       'ARCHIVO_PACIENTES',
  KINES:         'KINESIOTERAPEUTAS',
  REM:           'ESTADISTICAS_REM',
  TURNOS:        'TURNOS',          // Tablero de asignación de turno
};

// ── Fila de datos en EVOLUCIONES (las primeras 3 son encabezados) ──
const EVO_FILA_DATOS = 4;   // fila 1=grupos, 2=cols, 3=unidades
const CAM_FILA_DATOS = 3;   // fila 1=grupos, 2=cols
const TL_FILA_DATOS  = 2;
const PROC_FILA_DATOS = 2;
const ARCH_FILA_DATOS = 2;

// ═══════════════════════════════════════════════════════════
//  MAPA COLUMNAS — EVOLUCIONES (índice 1-based)
// ═══════════════════════════════════════════════════════════
const COL_EVO = {
  // Metadatos
  ID_EVOLUCION:       1,
  ID_CAMA:            2,
  TURNO_KEY:          3,
  FECHA:              4,
  TURNO:              5,
  ES_INGRESO:         6,
  TIMESTAMP:          7,
  DIA_ESTADIA:        8,
  DIAS_VM:            9,
  DIAS_VA:           10,
  // Identificación Paciente
  PAC_NOMBRE:        11,
  PAC_RUT:           12,
  PAC_EDAD:          13,
  PAC_SEXO:          14,
  PAC_TALLA:         15,
  PAC_PESO_IDEAL:    16,
  PAC_BARTHEL:       17,
  PAC_ECF:           18,
  PAC_DIAGNOSTICO:   19,
  PAC_DIAG_REM:      20,
  // Sedación y Conciencia
  SED_TIPO:          21,
  SED_SAS:           22,
  SED_S5Q:           23,
  SED_COOPERACION:   24,
  SED_GCS_O:         25,
  SED_GCS_V:         26,
  SED_GCS_M:         27,
  SED_GCS_TOT:       28,
  SED_BNM:           29,
  // Hemodinamia
  HEMO_ESTADO:       30,
  HEMO_DVA:          31,
  HEMO_MULTI_DVA:    32,
  HEMO_NUM_DVA:      33,
  HEMO_TENDENCIA:    34,
  HEMO_TEND_TIPO:    35,
  // Examen Físico
  EX_MP:             36,
  EX_RUIDOS:         37,
  EX_RUIDOS_MAN:     38,
  EX_SECR_CANT:      39,
  EX_SECR_TIPO:      40,
  // Ventilatorio Config
  VENT_VIA_AEREA:    41,
  VENT_TOT_NUM:      42,
  VENT_TOT_CM:       43,
  VENT_TQT_TIPO:     44,
  VENT_SOPORTE:      45,
  VENT_MODO:         46,
  VENT_ADAPTADO:     47,
  VENT_H_ACTIVA:     48,
  VENT_POST_EXT:     49,
  VENT_POST_EXT_VAL: 50,
  // Parámetros Ventilatorios
  VENT_VT:           51,
  VENT_FR:           52,
  VENT_PEEP:         53,
  VENT_PMAX:         54,
  VENT_PMEDIA:       55,
  VENT_PPL:          56,
  VENT_AUTOPEEP:     57,
  VENT_PINSP:        58,
  VENT_PS:           59,
  VENT_IPAP:         60,
  VENT_EPAP:         61,
  VENT_IPAP_MIN:     62,
  VENT_IPAP_MAX:     63,
  VENT_VT_ASEG:      64,
  VENT_FLUJO:        65,
  VENT_TI:           66,
  VENT_FIO2:         67,
  VENT_SPO2:         68,
  VENT_TEMP:         69,
  VENT_LITROS:       70,
  VENT_PMUSC:        71,
  VENT_P01:          72,
  VENT_DPOCC:        73,
  VENT_RISETIME:     74,
  VENT_CAB_RSS:      75,
  VENT_CAB_RSS_DESC: 76,
  // Valores Calculados
  CALC_ML_KG:        77,
  CALC_VOL_MIN:      78,
  CALC_IE:           79,
  CALC_DP:           80,
  CALC_CESR:         81,
  CALC_TOBIN:        82,
  CALC_IROX:         83,
  // KTM
  KTM_REALIZADA:     84,
  KTM_SUSPENDIDA:    85,
  KTM_CONTRA_TIPO:   86,
  KTM_CONTRA_CAT:    87,
  KTM_CONTRA_RAZON:  88,
  KTM_CONTRA_MANUAL: 89,
  KTM_NIVEL_KTR:     90,
  KTM_TIEMPO_MIN:    91,
  KTM_UMA:           92,
  KTM_UMA_VAL:       93,
  // Procedimientos
  PROC_RESUMEN:      94,
  PROC_CANTIDAD:     95,
  PROC_JSON:         96,
  // Muestras
  MUE_REALIZADAS:    97,
  MUE_MECANISMO:     98,
  MUE_OTRO:          99,
  MUE_TIPOS_JSON:   100,
  // Egreso Clínico
  EGR_ACTIVO:       101,
  EGR_NIVEL_MOTOR:  102,
  EGR_MRC_SS:       103,
  EGR_FSS:          104,
  EGR_GROSOR_DIAF:  105,
  EGR_PIM:          106,
  EGR_PEM:          107,
  EGR_FEM:          108,
  EGR_FED:          109,
  EGR_DIAFRAGMA:    110,
  EGR_BDT_POS:      111,
  EGR_BDT_NEG:      112,
  EGR_PRESION_VA:   113,
  // Planes y Notas
  PLAN_PLANES:      114,
  PLAN_NOTA_TURNO:  115,
  PLAN_FIRMA_KINE:  116,
  TEXTO_GENERADO:   117,
  JSON_SNAPSHOT:    118,
  // RHB — evaluación funcional periódica (col nueva al final)
  EGR_PRENSION:     119,   // dinamometría / prensión palmar (kg)
};

const EVO_TOTAL_COLS = 119;

// ═══════════════════════════════════════════════════════════
//  MAPA COLUMNAS — CAMAS_ESTADO
// ═══════════════════════════════════════════════════════════
const COL_CAM = {
  ID_CAMA:              1,
  OCUPADA:              2,
  STATUS_CAMA:          3,
  NOMBRE:               4,
  RUT:                  5,
  EDAD:                 6,
  SEXO:                 7,
  TALLA_CM:             8,
  PESO_IDEAL_KG:        9,
  BARTHEL:             10,
  ECF:                 11,
  VIA_AEREA:           12,
  FECHA_INGRESO:       13,
  DIAGNOSTICO:         14,
  DIAG_REM:            15,
  TOT_NUMERO:          16,
  TOT_CM_LABIO:        17,
  TQT_TIPO:            18,
  FECHA_INICIO_VA:     19,
  FECHA_INICIO_SOPORTE:20,
  SOPORTE:             21,
  MODO:                22,
  KTM_NIVEL:           23,
  KTM_SUSP:            24,
  FIRMA_KINE:          25,
  TEXTO_EVO_DIA:       26,
  TEXTO_EVO_NOCHE:     27,
  ULTIMO_TURNO_KEY:    28,
  TEXTO_GENERADO:      29,
  JSON_BACKUP:         30,
  TIMELINE_JSON:       31,
  // ── Snapshot por turno (para la tabla de Registro Diario) ──
  KTR_DIA:             32,   // n° sesiones KTR del turno día
  KTM_DIA:             33,   // nivel KTM día ('' / nivel / 'C'=contraindicada)
  PROC_DIA:            34,   // procedimientos del día ("A | B | C")
  FIRMA_DIA:           35,
  KEY_DIA:             36,   // turnoKey del último registro día (yyyy-MM-dd-Dia)
  KTR_NOCHE:           37,
  PROC_NOCHE:          38,
  FIRMA_NOCHE:         39,
  KEY_NOCHE:           40,
};

const CAM_TOTAL_COLS = 40;

// ── MAPA COLUMNAS — PROCEDIMIENTOS ───────────────────────
const COL_PROC = {
  ID_PROC:       1,
  ID_EVOLUCION:  2,
  ID_CAMA:       3,
  FECHA:         4,
  TURNO:         5,
  TIPO_PROC:     6,
  NOMBRE_PROC:   7,
  DESCRIPCION:   8,
  TIMESTAMP:     9,
};

// ── MAPA COLUMNAS — TIMELINE ──────────────────────────────
const COL_TL = {
  ID_HITO:    1,
  ID_CAMA:    2,
  FECHA:      3,
  TURNO:      4,
  TIPO:       5,
  TEXTO:      6,
  TIMESTAMP:  7,
  AUTOR:      8,
};

// ── MAPA COLUMNAS — ARCHIVO PACIENTES ─────────────────────
const COL_ARCH = {
  ID_ARCHIVO:         1,
  CAMA_ORIGEN:        2,
  FECHA_INGRESO:      3,
  FECHA_EGRESO:       4,
  DIAS_TOTAL:         5,
  DIAS_VM_TOTAL:      6,
  DIAS_VA_TOTAL:      7,
  NOMBRE:             8,
  RUT:                9,
  EDAD:              10,
  SEXO:              11,
  DIAGNOSTICO:       12,
  DIAG_REM:          13,
  MOTIVO_EGRESO:     14,
  KTR_TOTAL:         15,
  TURNOS_VM:         16,
  TURNOS_KTM:        17,
  TURNOS_KTMC:       18,
  EXTUBACION_OK:     19,
  REINTUBACION:      20,
  BARTHEL_INGRESO:   21,
  BARTHEL_EGRESO:    22,
  FSS_EGRESO:        23,
  MRC_SS_EGRESO:     24,
  FIRMA_RESPONSABLE: 25,
  OBSERVACIONES:     26,
  JSON_BACKUP:       27,
  TIMELINE_JSON:     28,
};


// ── MAPA COLUMNAS — TURNOS ────────────────────────────────
const COL_TUR = {
  KEY:       1,   // "2026-06-11-Dia"
  DATA:      2,   // JSON { team:[...], assign:{...} }
  TIMESTAMP: 3,
};
