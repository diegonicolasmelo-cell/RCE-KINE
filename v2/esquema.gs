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
  // X. Extensiones post-congelamiento (SIEMPRE al final — nunca insertar al medio,
  // para no desplazar los índices de datos ya escritos).
  ['REINTUB_HORA','texto'],   // hora de la reintubación (independiente de EXT_HORA, que es la de extubación)
  ['INTUB_OCURRIO','bool'],   // intubación NUEVA este turno (paciente sin historial de VM)
  ['INTUB_HORA','texto'],     // hora de la intubación
  ['INTUB_DET','texto'],      // contexto / motivo de la intubación
  // — Contraste documentos unidad (S1–S13, jul-2026) —
  ['REINTUB_SOP_PREV','texto'],   // S3: soporte previo a la reintubación (informe: dispositivos previos)
  ['EVAL_T_CUAD_D','decimal'],['EVAL_T_CUAD_I','decimal'],   // S4: grosor cuádriceps mm der/izq (ecografía)
  ['EVAL_T_HECKMATT','texto'],                                // S4: índice de Heckmatt I-IV
  ['EVAL_T_FED_D','decimal'],['EVAL_T_FED_I','decimal'],      // S4: fracción de engrosamiento diafragmático % (>30% predice éxito weaning)
  ['EVAL_T_EXC_D','decimal'],['EVAL_T_EXC_I','decimal'],      // S4: excursión diafragmática cm (>1.1 predice éxito)
  ['PAC_CHARLSON','entero'],['PAC_INGRESO_TIPO','texto'],     // S5: índice de Charlson; Electivo/Urgencia (hoja RHB)
  ['EXT_VISAGE','entero'],['EXT_SCORE_VA','entero'],          // S7: VISAGE (≥3 éxito) y Score cuidados de VA (<6 adecuado) — neuro
  ['LAB_PH','decimal'],['LAB_PACO2','decimal'],['LAB_PAO2','decimal'],['LAB_HCO3','decimal'],['LAB_LACTATO','decimal'],['LAB_PAFI','decimal'], // S8: GSA
  // HEMO_FC: categórico (Eucárdico/Taquicárdico/Bradicárdico), ya no numérico.
  // HEMO_PA: LEGACY — se dejó de capturar (columna sin uso, se conserva la
  // posición). HEMO_PAM solo se pide si HEMO_META_PAM está marcado (S9).
  ['HEMO_FC','texto'],['HEMO_PA','texto'],['HEMO_PAM','entero'],['HEMO_PIC','entero'],['HEMO_PPC','entero'],
  ['KTM_BORG','texto'],                                       // S12: percepción de esfuerzo (Borg 0-10)
  ['MUE_HORA_TOMA','texto'],['MUE_CON_ATB','bool'],           // S13: orden CCAET (hora de toma, con antibiótico)
  ['VENT_FECHA_FILTRO','texto'],['VENT_FECHA_SONDA','texto'], // S11: mantención circuito cerrado (persisten turno a turno)
  // — FSS-ICU por ítem, MRC por movimiento y CPAx (opcionales, jul-2026) —
  ['EVAL_FSS_IT1','entero'],['EVAL_FSS_IT2','entero'],['EVAL_FSS_IT3','entero'],['EVAL_FSS_IT4','entero'],['EVAL_FSS_IT5','entero'],
  //   FSS ítems 0-7: girar en cama / supino→sedente / sedente borde / sedente→bípedo / marcha
  ['EVAL_MRC_D1','entero'],['EVAL_MRC_D2','entero'],['EVAL_MRC_D3','entero'],['EVAL_MRC_D4','entero'],['EVAL_MRC_D5','entero'],['EVAL_MRC_D6','entero'],
  ['EVAL_MRC_I1','entero'],['EVAL_MRC_I2','entero'],['EVAL_MRC_I3','entero'],['EVAL_MRC_I4','entero'],['EVAL_MRC_I5','entero'],['EVAL_MRC_I6','entero'],
  //   MRC 0-5 por movimiento (D=derecho, I=izquierdo): 1 abducción hombro, 2 flexión codo,
  //   3 extensión muñeca, 4 flexión cadera, 5 extensión rodilla, 6 dorsiflexión tobillo
  ['CPAX_IT1','entero'],['CPAX_IT2','entero'],['CPAX_IT3','entero'],['CPAX_IT4','entero'],['CPAX_IT5','entero'],
  ['CPAX_IT6','entero'],['CPAX_IT7','entero'],['CPAX_IT8','entero'],['CPAX_IT9','entero'],['CPAX_IT10','entero'],
  //   CPAx 0-5: 1 respiratorio, 2 tos, 3 movilidad en cama, 4 supino→sedente, 5 equilibrio sedente,
  //   6 equilibrio bípedo, 7 sedente→bípedo, 8 transferencia cama→sillón, 9 marcha en el lugar, 10 prensión
  ['CPAX_TOTAL','entero'],    // 0-50; solo se guarda con los 10 ítems completos
  // — Refactor por módulos (jul-2026): auscultación múltiple, insumos, reintubación
  //   con parámetros, deglución, UPOT/test de apnea —
  ['EX_RUIDOS_JSON','json'],      // ruidos agregados adicionales [{tipo,loc},...]
  ['FILTRO_TIPO','texto'],        // HME / HEPA
  ['REINTUB_TOT_N','texto'],['REINTUB_TOT_CM','texto'],['REINTUB_MODO','texto'],['REINTUB_PARAMS','texto'],
  ['EVAL_DEGLUCION','texto'],     // valoración cualitativa de la deglución
  ['APNEA_TEST','texto'],         // test de apnea del turno (Positivo/Negativo) → histórico APNEA_JSON
  ['UPOT_ACTIVO','bool'],['UPOT_MEDIDAS','bool'],  // seguimiento UPOT + medidas de protección de órganos
  // — Ingreso/cooperación, intubación secuencial y cambio de tubo reversible (jul-2026) —
  ['INTUB_SOP_PREVIO','texto'],  // soporte respiratorio previo a la intubación (Ambiente/Naricera-NRC/CNAF/VNI)
  ['TOT_CAMBIO','bool'],         // cambio de tubo este turno (checkbox reversible; cuenta como procedimiento)
  ['DISP_HME_FECHA','texto'],    // dispositivos circuito VM: HME instalado (se cambia en su día 2, por fecha)
  ['DISP_HEPA_FECHA','texto'],   // HEPA instalado (se cambia en su día 3)
  ['DISP_HUMID_FECHA','texto'],  // humidificación activa: fecha de inicio (no vence)
  // DUPLICADO HISTÓRICO: VENT_IPAP_MAX ya existe en la posición 78; esta columna
  // quedó duplicada al agregarse de nuevo en la cola. NO se puede eliminar (las
  // posiciones son fijas: borrarla desalinearía todas las columnas siguientes),
  // así que se renombra a legacy y deja de usarse. El dato vive en la pos. 78.
  ['LEGACY_IPAP_MAX_DUP','decimal'],
  ['TOT_CAMBIO_MOTIVO','texto'], // motivo del cambio de tubo (cuff disfuncional / roto / resistencia / otro)
  ['TQT_CAMBIO','bool'],         // cambio de cánula de TQT este turno (checkbox reversible)
  ['TQT_CAMBIO_MOTIVO','texto'], // motivo del cambio de cánula
  ['BARTHEL_JSON','json'],       // ítems de la calculadora de Barthel (10 valores)
  ['CHARLSON_JSON','json'],      // ítems de la calculadora de Charlson {it:[índices], edad:bool}
  ['CAT_KINE','entero'],         // LEGACY: categorización K1–K4 (reemplazada por CAT_RESP/MOTOR; ya no se escribe)
  ['CAT_RESP_PJE','entero'],     // categorización respiratoria SOCHIMI (n variables × 1-3 pts según CAT_MATRICES)
  ['CAT_MOTOR_PJE','entero'],    // categorización motora SOCHIMI (n variables × 1-3 pts según CAT_MATRICES)
  ['CAT_RESP_NIVEL','texto'],    // Baja/Media/Alta calculado con la configuración vigente al guardar
  ['CAT_MOTOR_NIVEL','texto'],   // Baja/Media/Alta calculado con la configuración vigente al guardar
  ['KTM_EMS','bool'],            // electroestimulación neuromuscular (terapia física, junto a IMT)
  ['PLAN_PENDIENTES','json'],    // pendientes del turno (chips-recordatorio; NO se replican; van a la entrega)
  ['HEMO_ARRITMIA','bool'],['HEMO_ARRITMIA_TIPO','texto'],  // arritmia (junto a FC) — tipo libre (FA, extrasístoles...)
  ['HEMO_META_PAM','bool'],      // condiciona la captura de HEMO_PAM (sin meta, no se pide)
  // Parámetros de la EMS (terapia física)
  ['KTM_EMS_FREQ','texto'],['KTM_EMS_INT','texto'],['KTM_EMS_PULSO','texto'],
  ['KTM_EMS_T','texto'],['KTM_EMS_GRUPO','texto'],
  // IMS — ICU Mobility Scale 0-10 (reemplaza al hito motor 1-6; EVAL_NIVEL_MOTOR queda legacy)
  ['EVAL_IMS','texto'],
  ['VENT_PAFI','decimal'],  // PaFiO2 (PaO2/FiO2) del turno
];

// ── Definición de todas las hojas ──────────────────────────
const ESQUEMA = {
  CONFIG: { headerRows: 1, cols: [
    ['CLAVE','texto'],['VALOR','texto'],
  ]},
  CATALOGOS: { headerRows: 1, cols: [
    ['TIPO','texto'],['VALOR','texto'],['ORDEN','entero'],['ACTIVO','bool'],
  ]},
  // Matrices de categorización SOCHIMI, editables por la coordinación sin tocar
  // código (como las fases): qué variables componen cada matriz y sus cortes.
  // VARIABLE debe ser un id de la librería del cliente (_CAT_VARS). UMBRAL_2/3 =
  // cortes de 2 y 3 pts en variables numéricas (vacío = default; DINAMO usa 'H/M').
  CAT_MATRICES: { headerRows: 1, cols: [
    ['MATRIZ','texto'],['VARIABLE','texto'],['ACTIVA','bool'],
    ['UMBRAL_2','texto'],['UMBRAL_3','texto'],['ORDEN','entero'],
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
    ['CHARLSON','entero'],['INGRESO_TIPO','texto'],  // S5 (persisten con el episodio, se cargan al abrir)
    ['CAT_KINE','entero'],  // LEGACY: categorización K1–K4 (ya no se escribe)
    ['CAT_RESP_PJE','entero'],['CAT_MOTOR_PJE','entero'],  // categorización SOCHIMI del último turno (badges R/M en la grilla)
    ['CAT_RESP_NIVEL','texto'],['CAT_MOTOR_NIVEL','texto'],  // nivel Baja/Media/Alta según la config vigente al guardar
    // Últimas evaluaciones del episodio (arrastre para la matriz motora + badges de la grilla)
    ['ULT_COOP','texto'],['ULT_MRC','entero'],['ULT_MRC_FECHA','texto'],
    ['ULT_FSS','entero'],['ULT_FSS_FECHA','texto'],['ULT_DINAMO','decimal'],
    // Dispositivos de circuito VM: fecha de instalación (estado del EPISODIO, no del
    // turno — el panel arrastra desde aquí para que la fecha visualizada no las pise)
    ['DISP_HME_FECHA','texto'],['DISP_HEPA_FECHA','texto'],
    ['DISP_TC_FECHA','texto'],['DISP_HUMID_FECHA','texto'],
    // PVE acumulados del episodio {turnoKey: 'superada'|'frustra'} — la clase de
    // weaning (Boles 2007: difícil/prolongado) se deriva al mostrar, nunca se guarda
    ['WEAN_PVE_JSON','json'],
    // Tamizaje de candidato a PVE con los parámetros del último turno guardado
    // (FiO2≤50, PEEP≤8, SpO2≥90, hemodinamia estable sin DVA altas, sin BNM)
    ['WEAN_CAND_PVE','bool'],
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
  // Historial de entregas de turno emitidas (no afecta datos clínicos)
  ENTREGAS_TURNO: { headerRows: 1, cols: [
    ['ID_ENTREGA','texto'],['TIMESTAMP','ts'],['FECHA','fecha'],['TURNO','texto'],
    ['KINE_ENTREGA','texto'],['KINE_RECIBE','texto'],['CAMAS_N','entero'],
    ['OCUPADAS','entero'],['EN_VM','entero'],['CAMAS_IDS','texto'],
    ['NOTAS','texto'],['SNAPSHOT_JSON','json'],
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
    // Interpretación de egreso (cortes configurables en CONFIG)
    ['DAUCI','bool'],['MRC_INTERP','texto'],['FSS_INTERP','texto'],['DINAMO_INTERP','texto'],
    ['DINAMO_EGRESO','decimal'],['CPAX_EGRESO','entero'],
  ]},
  // ── Ventiladores de la unidad: inventario vivo + trazabilidad de movimientos ──
  VENTILADORES: { headerRows: 1, cols: [
    ['ID_VM','texto'],['NOMBRE','texto'],['MARCA','texto'],['MODELO','texto'],
    ['NUM_SERIE','texto'],['NUM_INVENTARIO','texto'],['ANIO_ADQ','entero'],
    ['UBIC_TIPO','texto'],       // CAMA | BODEGA | PRESTAMO
    ['UBIC_DETALLE','texto'],    // n° de cama, o unidad externa del préstamo
    ['FECHA_UBICACION','texto'], // desde cuándo está en esa ubicación (ISO)
    ['ESTADO','texto'],          // Operativo | En mantención | Con falla | De baja
    ['ACTIVO','bool'],['OBS','texto'],['TIMESTAMP','ts'],
    ['FECHA_MANT','texto'],      // última mantención (ISO)
    ['FECHA_MANT_PROX','texto'], // próxima mantención programada (ISO)
  ]},
  MOVIMIENTOS_VM: { headerRows: 1, cols: [
    ['ID_MOV','texto'],['ID_VM','texto'],['TIMESTAMP','ts'],['FECHA','texto'],
    ['DESDE','texto'],['HACIA','texto'],['MOTIVO','texto'],['FIRMA','texto'],['AUTOR_EMAIL','email'],
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

/** Lee una clave de CONFIG (columna A=clave, B=valor). Devuelve porDefecto si no existe. */
function leerConfig(clave, porDefecto) {
  try {
    const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
    if (h && h.getLastRow() >= 2) {
      const vals = h.getRange(2, 1, h.getLastRow() - 1, 2).getValues();
      for (let i = 0; i < vals.length; i++) {
        if (String(vals[i][0]).trim() === clave && String(vals[i][1]).trim() !== '') return String(vals[i][1]).trim();
      }
    }
  } catch (e) {}
  return porDefecto;
}

/** Escribe (o crea) una clave en la hoja CONFIG. */
function escribirConfig(clave, valor) {
  const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
  if (!h) throw new Error('No existe la hoja CONFIG (corre crearORepararEstructura).');
  const n = h.getLastRow();
  if (n >= 2) {
    const vals = h.getRange(2, 1, n - 1, 1).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim() === clave) { h.getRange(i + 2, 2).setValue(valor); return; }
    }
  }
  h.appendRow([clave, valor]);
}

/**
 * MODO PRUEBA — abre la app a cualquiera (omite el login de Google).
 * Correr esta función desde el editor de Apps Script. ⚠️ Solo para la marcha
 * blanca; salir con salirModoPrueba() antes de operar con datos reales.
 */
function activarModoPrueba() {
  escribirConfig('AUTH_DEV_MODE', 'TRUE');
  console.warn('✅ MODO PRUEBA ACTIVO — cualquiera puede entrar sin login. Cada kine firma con su sigla.');
  return 'Modo prueba ACTIVADO (AUTH_DEV_MODE=TRUE).';
}

/** Reactiva la autenticación de Google (producción). */
function salirModoPrueba() {
  escribirConfig('AUTH_DEV_MODE', 'FALSE');
  console.warn('🔒 Autenticación de Google REACTIVADA (AUTH_DEV_MODE=FALSE).');
  return 'Modo prueba DESACTIVADO (AUTH_DEV_MODE=FALSE).';
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
  if (!ss) {
    throw new Error('No hay planilla activa. El proyecto de Apps Script debe estar ' +
      'CONTENIDO en el Google Sheet (abrirlo desde la planilla: Extensiones → Apps Script).');
  }
  const creadas = [];
  // "paso" acompaña cada etapa para que un fallo diga EXACTAMENTE dónde ocurrió
  // (sin esto, el editor solo muestra un error genérico difícil de diagnosticar).
  let paso = 'inicio';
  try {
    Object.keys(ESQUEMA).forEach(hoja => {
      paso = 'hoja ' + hoja;
      const def = ESQUEMA[hoja];
      const total = def.cols.length;
      let h = ss.getSheetByName(hoja);
      if (!h) { h = ss.insertSheet(hoja); creadas.push(hoja); }

      // Asegurar ancho suficiente (migración no destructiva).
      paso = 'hoja ' + hoja + ' (ancho: ' + h.getMaxColumns() + ' → ' + total + ' columnas)';
      if (h.getMaxColumns() < total) {
        h.insertColumnsAfter(h.getMaxColumns(), total - h.getMaxColumns());
      }

      // Escribir encabezados (fila de nombres siempre re-sincronizada).
      paso = 'hoja ' + hoja + ' (encabezados)';
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
      paso = 'hoja ' + hoja + ' (formato de columnas)';
      _forzarTexto(h, def);
    });

    paso = 'datos semilla (_sembrar)';
    _sembrar(ss);
    paso = 'flush final';
    SpreadsheetApp.flush();
  } catch (e) {
    throw new Error('crearORepararEstructura falló en: ' + paso + ' → ' + e.message +
      (e.stack ? '\n' + e.stack : ''));
  }

  const msg = creadas.length
    ? 'Hojas creadas: ' + creadas.join(', ') + '.'
    : 'Todas las hojas existían; estructura verificada.';
  console.log(msg);
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
    // Modo desarrollo: TRUE = omite la verificación GIS y usa AUTH_DEV_FIRMA.
    // DEBE quedar en FALSE en producción.
    ['AUTH_DEV_MODE', 'FALSE'],
    ['AUTH_DEV_FIRMA', 'DMV'],
    // Ventanas de turno (hora en que PARTE cada turno; la madrugada previa al
    // inicio del día sigue contando como la noche del día anterior)
    ['TURNO_DIA_INICIO', '9'],
    ['TURNO_NOCHE_INICIO', '21'],
    // Interpretación clínica (cortes ajustables por el equipo sin tocar código)
    ['CPAX_ACTIVO', 'TRUE'],        // FALSE oculta la sección CPAx del panel
    ['CORTE_MRC_DAUCI', '48'],      // MRC-SS < corte = DAUCI
    ['CORTE_MRC_SEVERA', '36'],     // MRC-SS < corte = DAUCI severa
    ['CORTE_DINAMO_H', '11'],       // kg, hombres (Ali 2008)
    ['CORTE_DINAMO_M', '7'],        // kg, mujeres
    ['CORTE_FSS_INDEP', '27'],      // FSS-ICU >= corte = independencia funcional
    ['EVAL_DIAS_ALERTA', '5'],      // días sin re-evaluar MRC/FSS (cooperador) antes de alertar
    ['PVE_TURNOS_ALERTA', '2'],     // turnos seguidos candidato a PVE sin PVE antes de alertar
    // TEMPORAL: permite editar el texto de la vista previa en pantalla (solo
    // demostración; NO se guarda). Poner en FALSE cuando termine el afinamiento.
    ['EDITOR_TEXTO_DEMO', 'TRUE'],
  ];
  const cfgExist = _valoresCol(hCfg, 1, 2);
  cfgDefaults.forEach(kv => { if (cfgExist.indexOf(kv[0]) === -1) hCfg.appendRow(kv); });

  // CATALOGOS — fases clínicas: siembra inicial Y agrega las que falten
  // (idempotente: correr crearORepararEstructura suma fases nuevas sin duplicar;
  //  el orden de los chips se ajusta con la columna ORDEN de la hoja)
  const hCat = ss.getSheetByName('CATALOGOS');
  const fases = ['Reanimación inicial','Protección pulmonar','Neuroprotección',
    'Postoperatorio inmediato','Espera de second look','Weaning','Consolidación de weaning','Rehabilitación',
    'Cuidados postparo'];
  const nCat = hCat.getLastRow();
  const fasesExist = nCat >= 2
    ? hCat.getRange(2, 1, nCat - 1, 2).getValues()
        .filter(function (r) { return String(r[0]).trim() === 'FASE_CLINICA'; })
        .map(function (r) { return String(r[1]).trim(); })
    : [];
  fases.forEach(function (f, i) {
    if (fasesExist.indexOf(f) === -1) hCat.appendRow(['FASE_CLINICA', f, i + 1, true]);
  });

  // CAT_MATRICES — matrices de categorización SOCHIMI (default de la guía 2017;
  // la coordinación puede activar/desactivar variables y ajustar cortes aquí)
  const hCM = ss.getSheetByName('CAT_MATRICES');
  if (hCM && hCM.getLastRow() < 2) {
    const filasCM = [
      // MATRIZ, VARIABLE, ACTIVA, UMBRAL_2, UMBRAL_3, ORDEN
      ['RESP','ASISTENCIA',  true,  '',      '',     1],
      ['RESP','SAFI',        true,  '300',   '150',  2],
      ['RESP','FR',          true,  '20',    '28',   3],
      ['RESP','AUSCULTACION',true,  '',      '',     4],
      ['RESP','SECRECIONES', true,  '',      '',     5],
      ['RESP','VOLMIN',      false, '7',     '12',   6],
      ['RESP','PEEP',        false, '7',     '10',   7],
      ['RESP','FIO2',        false, '31',    '50',   8],
      ['MOTOR','S5Q_COOP',   true,  '',      '',     1],
      ['MOTOR','MRC',        true,  '48',    '36',   2],
      ['MOTOR','FSS',        true,  '20',    '10',   3],
      ['MOTOR','DINAMO',     true,  '30/17', '11/7', 4],
      ['MOTOR','SAS',        false, '4',     '2',    5],
      ['MOTOR','KTM_NIVEL',  false, '4',     '2',    6],
      ['MOTOR','CPAX',       false, '40',    '20',   7],
    ];
    hCM.getRange(2, 1, filasCM.length, 6).setValues(filasCM);
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
  if (TOTAL_COLS.EVOLUCIONES !== 293) errs.push('EVOLUCIONES != 293 columnas: ' + TOTAL_COLS.EVOLUCIONES);
  console.log(errs.length ? '❌ ' + errs.join(' | ') : '✅ Esquema OK (' + Object.keys(ESQUEMA).length + ' hojas)');
  return errs;
}
