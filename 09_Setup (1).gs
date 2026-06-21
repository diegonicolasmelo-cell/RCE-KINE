/**
 * ============================================================
 *  09_Setup.gs — Creación de la estructura de la base de datos
 *  RCE KINE UCIA | GAS-v1.4  (AUTOSUFICIENTE)
 *
 *  ⭐ ESTA ES LA FUNCIÓN QUE FALTABA ⭐
 *
 *  IMPORTANTE: este archivo NO depende de 00_Constantes.gs ni de
 *  ningún otro archivo. Define todo lo que necesita internamente,
 *  así que SIEMPRE puede ejecutarse, incluso si hubo un problema
 *  con otros archivos. Por eso NO usa la variable global SH.
 *
 *  ──────────────────────────────────────────────────────────
 *  CÓMO USARLO (una sola vez, al instalar):
 *
 *  OPCIÓN A — Desde el menú del Sheet:
 *    1. Recarga tu Google Sheet (F5).
 *    2. Aparecerá un menú nuevo: "⚕️ RCE KINE".
 *    3. Clic en "1 · Crear / reparar estructura".
 *    4. Acepta los permisos que pida la primera vez.
 *
 *  OPCIÓN B — Desde el editor de Apps Script:
 *    1. En el selector de función (arriba), elige: crearEstructuraBD
 *    2. Clic en "Ejecutar" (▶) y acepta los permisos.
 *
 *  Es SEGURO ejecutarla varias veces: no borra datos existentes,
 *  solo crea lo que falte (hojas, encabezados, camas vacías).
 * ============================================================
 */

// ── Menú automático al abrir el Sheet ───────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('⚕️ RCE KINE')
    .addItem('1 · Crear / reparar estructura', 'crearEstructuraBD')
    .addItem('2 · Crear/abrir hoja IMPORTAR', 'crearHojaImportar')
    .addItem('3 · Importar desde hoja IMPORTAR', 'importarPacientesActuales')
    .addItem('4 · Normalizar formatos (lectura)', 'normalizarFormatos')
    .addSeparator()
    .addItem('⚠️ Reiniciar TODO (borra datos)', 'reiniciarBaseDeDatos')
    .addToUi();
}

// ════════════════════════════════════════════════════════════
//  NORMALIZAR FORMATOS — fuerza "texto plano" en las columnas
//  que Google Sheets tiende a malinterpretar (fechas y campos
//  cualitativos tipo "Shiley #7", RUT, IDs, claves de turno).
//
//  ¿Por qué? La app guarda las fechas como texto ISO
//  ("2026-06-12") y compara por string. Si Sheets auto-formatea
//  esa columna como Fecha o Número, al leerla devuelve un objeto
//  Date o un número y se rompe la comparación (fue la causa del
//  bug donde el "Tipo TQT" aparecía como fecha).
//
//  Es 100% NO destructivo: solo cambia el FORMATO de celda
//  (setNumberFormat '@' = texto), nunca el contenido. Seguro de
//  ejecutar las veces que quieras.
// ════════════════════════════════════════════════════════════
function normalizarFormatos(silencioso) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Para cada hoja: { fila de inicio de datos, [índices de columna 1-based a forzar a texto] }
  const PLAN = {
    'EVOLUCIONES': {
      desde: 4,
      // FECHA(4), TURNO_KEY(3), ID_EVOLUCION(1), PAC_RUT(12), VENT_TQT_TIPO(44)
      cols: [1, 3, 4, 12, 44],
    },
    'CAMAS_ESTADO': {
      desde: 3,
      // FECHA_INGRESO(13), TQT_TIPO(18), FECHA_INICIO_VA(19), FECHA_INICIO_SOPORTE(20),
      // RUT(5), ULTIMO_TURNO_KEY(28), KEY_DIA(36), KEY_NOCHE(40)
      cols: [5, 13, 18, 19, 20, 28, 36, 40],
    },
    'PROCEDIMIENTOS': {
      desde: 2,
      // ID_PROC(1), ID_EVOLUCION(2), FECHA(4)
      cols: [1, 2, 4],
    },
    'TIMELINE': {
      desde: 2,
      // ID_HITO(1), FECHA(3)
      cols: [1, 3],
    },
    'ARCHIVO_PACIENTES': {
      desde: 2,
      // ID_ARCHIVO(1), FECHA_INGRESO(3), FECHA_EGRESO(4), RUT(9)
      cols: [1, 3, 4, 9],
    },
    'TURNOS': {
      desde: 2,
      // KEY(1)
      cols: [1],
    },
  };

  let totalCols = 0;
  Object.keys(PLAN).forEach(nombre => {
    const h = ss.getSheetByName(nombre);
    if (!h) return;
    const maxRows = h.getMaxRows();
    const nFilas = maxRows - PLAN[nombre].desde + 1;
    if (nFilas < 1) return;
    PLAN[nombre].cols.forEach(c => {
      if (c <= h.getMaxColumns()) {
        h.getRange(PLAN[nombre].desde, c, nFilas, 1).setNumberFormat('@');
        totalCols++;
      }
    });
  });

  SpreadsheetApp.flush();
  if (!silencioso) {
    _rceAvisar('✅ Formatos normalizados',
      'Se forzó "texto plano" en ' + totalCols + ' columnas (fechas, RUT, IDs, ' +
      'claves de turno y Tipo TQT) de todas las hojas de datos.\n\n' +
      'Esto evita que Google Sheets convierta esos valores en fechas o números ' +
      'y mantiene las lecturas del sistema estables.\n\n' +
      'No se modificó ningún dato, solo el formato de celda.');
  }
  return { ok: true, columnas: totalCols };
}

// ════════════════════════════════════════════════════════════
//  DEFINICIÓN LOCAL DE LA ESTRUCTURA (no usa variables globales)
// ════════════════════════════════════════════════════════════
function _RCE_ESTRUCTURA() {
  return {
    CONFIG: {
      nombre: 'CONFIG',
      headerRows: 1,
      headers: [['CLAVE', 'VALOR']],
    },
    CAMAS: {
      nombre: 'CAMAS_ESTADO',
      headerRows: 2,           // datos desde la fila 3
      cols: ['ID_CAMA','OCUPADA','STATUS_CAMA','NOMBRE','RUT','EDAD','SEXO','TALLA_CM','PESO_IDEAL_KG','BARTHEL','ECF','VIA_AEREA','FECHA_INGRESO','DIAGNOSTICO','DIAG_REM','TOT_NUMERO','TOT_CM_LABIO','TQT_TIPO','FECHA_INICIO_VA','FECHA_INICIO_SOPORTE','SOPORTE','MODO','KTM_NIVEL','KTM_SUSP','FIRMA_KINE','TEXTO_EVO_DIA','TEXTO_EVO_NOCHE','ULTIMO_TURNO_KEY','TEXTO_GENERADO','JSON_BACKUP','TIMELINE_JSON','KTR_DIA','KTM_DIA','PROC_DIA','FIRMA_DIA','KEY_DIA','KTR_NOCHE','PROC_NOCHE','FIRMA_NOCHE','KEY_NOCHE'],
    },
    EVOLUCIONES: {
      nombre: 'EVOLUCIONES',
      headerRows: 3,           // datos desde la fila 4
      cols: ['ID_EVOLUCION','ID_CAMA','TURNO_KEY','FECHA','TURNO','ES_INGRESO','TIMESTAMP','DIA_ESTADIA','DIAS_VM','DIAS_VA','PAC_NOMBRE','PAC_RUT','PAC_EDAD','PAC_SEXO','PAC_TALLA','PAC_PESO_IDEAL','PAC_BARTHEL','PAC_ECF','PAC_DIAGNOSTICO','PAC_DIAG_REM','SED_TIPO','SED_SAS','SED_S5Q','SED_COOPERACION','SED_GCS_O','SED_GCS_V','SED_GCS_M','SED_GCS_TOT','SED_BNM','HEMO_ESTADO','HEMO_DVA','HEMO_MULTI_DVA','HEMO_NUM_DVA','HEMO_TENDENCIA','HEMO_TEND_TIPO','EX_MP','EX_RUIDOS','EX_RUIDOS_MAN','EX_SECR_CANT','EX_SECR_TIPO','VENT_VIA_AEREA','VENT_TOT_NUM','VENT_TOT_CM','VENT_TQT_TIPO','VENT_SOPORTE','VENT_MODO','VENT_ADAPTADO','VENT_H_ACTIVA','VENT_POST_EXT','VENT_POST_EXT_VAL','VENT_VT','VENT_FR','VENT_PEEP','VENT_PMAX','VENT_PMEDIA','VENT_PPL','VENT_AUTOPEEP','VENT_PINSP','VENT_PS','VENT_IPAP','VENT_EPAP','VENT_IPAP_MIN','VENT_IPAP_MAX','VENT_VT_ASEG','VENT_FLUJO','VENT_TI','VENT_FIO2','VENT_SPO2','VENT_TEMP','VENT_LITROS','VENT_PMUSC','VENT_P01','VENT_DPOCC','VENT_RISETIME','VENT_CAB_RSS','VENT_CAB_RSS_DESC','CALC_ML_KG','CALC_VOL_MIN','CALC_IE','CALC_DP','CALC_CESR','CALC_TOBIN','CALC_IROX','KTM_REALIZADA','KTM_SUSPENDIDA','KTM_CONTRA_TIPO','KTM_CONTRA_CAT','KTM_CONTRA_RAZON','KTM_CONTRA_MANUAL','KTM_NIVEL_KTR','KTM_TIEMPO_MIN','KTM_UMA','KTM_UMA_VAL','PROC_RESUMEN','PROC_CANTIDAD','PROC_JSON','MUE_REALIZADAS','MUE_MECANISMO','MUE_OTRO','MUE_TIPOS_JSON','EGR_ACTIVO','EGR_NIVEL_MOTOR','EGR_MRC_SS','EGR_FSS','EGR_GROSOR_DIAF','EGR_PIM','EGR_PEM','EGR_FEM','EGR_FED','EGR_DIAFRAGMA','EGR_BDT_POS','EGR_BDT_NEG','EGR_PRESION_VA','PLAN_PLANES','PLAN_NOTA_TURNO','PLAN_FIRMA_KINE','TEXTO_GENERADO','JSON_SNAPSHOT','EGR_PRENSION'],
    },
    PROCEDIMIENTOS: {
      nombre: 'PROCEDIMIENTOS',
      headerRows: 1,
      cols: ['ID_PROC','ID_EVOLUCION','ID_CAMA','FECHA','TURNO','TIPO_PROC','NOMBRE_PROC','DESCRIPCION','TIMESTAMP'],
    },
    TIMELINE: {
      nombre: 'TIMELINE',
      headerRows: 1,
      cols: ['ID_HITO','ID_CAMA','FECHA','TURNO','TIPO','TEXTO','TIMESTAMP','AUTOR'],
    },
    ARCHIVO: {
      nombre: 'ARCHIVO_PACIENTES',
      headerRows: 1,
      cols: ['ID_ARCHIVO','CAMA_ORIGEN','FECHA_INGRESO','FECHA_EGRESO','DIAS_TOTAL','DIAS_VM_TOTAL','DIAS_VA_TOTAL','NOMBRE','RUT','EDAD','SEXO','DIAGNOSTICO','DIAG_REM','MOTIVO_EGRESO','KTR_TOTAL','TURNOS_VM','TURNOS_KTM','TURNOS_KTMC','EXTUBACION_OK','REINTUBACION','BARTHEL_INGRESO','BARTHEL_EGRESO','FSS_EGRESO','MRC_SS_EGRESO','FIRMA_RESPONSABLE','OBSERVACIONES','JSON_BACKUP','TIMELINE_JSON'],
    },
    KINES: {
      nombre: 'KINESIOTERAPEUTAS',
      headerRows: 1,
      headers: [['FIRMA', 'NOMBRE', 'APOYO']],
      seed: [
        ['MOW','Mauricio Ortega Wanders',false],['FGE','Felipe Guerrero Espinoza',false],
        ['NPR','Natalia Parra Rojas',false],['SOG','Sergio Ortiz Gómez',false],
        ['MVA','María Vega Astudillo',false],['AWE','Álvaro Wilson Espinoza',false],
        ['EGT','Eduardo González Tapia',false],['DMV','Diego Melo Villagrán',false],
        ['KGV','Karen González Vásquez',false],['CMF','Carlos Morales Flores',false],
        ['AAG','Andrés Ángel Gómez',false],['MFB','Manuel Fuentes Blanco',false],
        ['ACR','Aline Campos Rivera',false],['RC','Rodrigo Caamaño',false],
        ['MCC','Magdalena Contando Cisternas',true],
      ],
    },
    REM: {
      nombre: 'ESTADISTICAS_REM',
      headerRows: 1,
      headers: [['MES','INGRESOS','DIAS_CAMA','TURNOS_VM','TURNOS_KTM','TURNOS_KTMC','SUM_KTR','KTR_PROM','DIAG_JSON','TEXTO_REM']],
    },
    TURNOS: {
      nombre: 'TURNOS',
      headerRows: 1,
      headers: [['KEY','DATA','TIMESTAMP']],
    },
  };
}

// ════════════════════════════════════════════════════════════
//  FUNCIÓN PRINCIPAL — crea/repara todas las hojas
// ════════════════════════════════════════════════════════════
function crearEstructuraBD() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const E  = _RCE_ESTRUCTURA();
  const creadas = [];

  Object.keys(E).forEach(clave => {
    const def = E[clave];
    let h = ss.getSheetByName(def.nombre);
    if (!h) { h = ss.insertSheet(def.nombre); creadas.push(def.nombre); }

    // Encabezados (solo si la hoja está "vacía" de encabezados)
    if (h.getLastRow() < def.headerRows) {
      if (def.headers) {
        // Encabezados explícitos (CONFIG, KINES, REM, TURNOS)
        h.getRange(1, 1, def.headers.length, def.headers[0].length).setValues(def.headers);
      } else if (def.cols) {
        const total = def.cols.length;
        const filas = [];
        // Fila 1: título de la hoja
        const titulo = new Array(total).fill('');
        titulo[0] = def.nombre;
        if (def.headerRows >= 2) {
          filas.push(titulo);
          filas.push(def.cols.slice());           // fila 2: nombres de columnas
          for (let r = 3; r <= def.headerRows; r++) filas.push(new Array(total).fill(''));
        } else {
          filas.push(def.cols.slice());           // 1 sola fila de encabezado
        }
        h.getRange(1, 1, filas.length, total).setValues(filas);
      }
      h.setFrozenRows(def.headerRows);
    }

    // Datos semilla
    if (def.nombre === 'CONFIG') {
      if (!_rceTieneValor(h, 1, 'ULTIMO_BACKUP')) h.appendRow(['ULTIMO_BACKUP', '']);
    }
    if (def.nombre === 'KINESIOTERAPEUTAS' && def.seed && h.getLastRow() < 2) {
      h.getRange(2, 1, def.seed.length, def.seed[0].length).setValues(def.seed);
    }
  });

  // ── Sembrar 18 camas vacías (si la hoja de camas no tiene datos) ──
  const cam = ss.getSheetByName('CAMAS_ESTADO');
  // Migración: asegurar que existan TODAS las columnas (incl. snapshot por turno)
  if (cam) {
    const need = E.CAMAS.cols.length;          // 40
    if (cam.getMaxColumns() < need) {
      cam.insertColumnsAfter(cam.getMaxColumns(), need - cam.getMaxColumns());
    }
    cam.getRange(1, 1, 1, 1).setValue('CAMAS_ESTADO');
    cam.getRange(2, 1, 1, need).setValues([E.CAMAS.cols]);  // re-sincroniza nombres de columnas
  }
  if (cam && cam.getLastRow() < 3) {       // 2 encabezados → datos en fila 3
    const TOTAL = E.CAMAS.cols.length;     // 31
    const filas = [];
    for (let i = 1; i <= 18; i++) {
      const f = new Array(TOTAL).fill('');
      f[0]  = String(i);     // ID_CAMA  (col 1)
      f[1]  = false;         // OCUPADA  (col 2)
      f[2]  = 'Libre';       // STATUS_CAMA (col 3)
      f[11] = 'Natural';     // VIA_AEREA (col 12)
      f[20] = 'Ambiente';    // SOPORTE  (col 21)
      f[21] = 'Sin soporte'; // MODO     (col 22)
      filas.push(f);
    }
    cam.getRange(3, 1, 18, TOTAL).setValues(filas);
  }

  SpreadsheetApp.flush();

  // Normaliza formatos de columna (texto plano en fechas/IDs/TQT) para
  // que las lecturas del sistema sean estables desde el primer día.
  try { normalizarFormatos(true); } catch (e) { console.warn('normalizarFormatos: ' + e.message); }

  const msg = creadas.length
    ? 'Hojas creadas: ' + creadas.join(', ') + '.\n\nEstructura lista (9 hojas, 18 camas). Ya puedes abrir la Web App.'
    : 'Todas las hojas ya existían. Estructura verificada.\n\nYa puedes abrir la Web App.';
  _rceAvisar('✅ Estructura lista', msg);
  return { ok: true, creadas: creadas, mensaje: msg };
}

// ════════════════════════════════════════════════════════════
//  REINICIAR — borra y recrea todo (¡destructivo!)
// ════════════════════════════════════════════════════════════
function reiniciarBaseDeDatos() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.alert(
    '⚠️ Reiniciar base de datos',
    'Esto BORRARÁ las hojas de datos (camas, evoluciones, ' +
    'procedimientos, timeline, archivo, REM y turnos) y las recreará ' +
    'vacías.\n\nEsta acción NO se puede deshacer.\n\n¿Continuar?',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ['CAMAS_ESTADO','EVOLUCIONES','PROCEDIMIENTOS','TIMELINE',
   'ARCHIVO_PACIENTES','ESTADISTICAS_REM','TURNOS'].forEach(nombre => {
    const h = ss.getSheetByName(nombre);
    if (h) ss.deleteSheet(h);
  });
  crearEstructuraBD();
}

// ════════════════════════════════════════════════════════════
//  HELPERS LOCALES (prefijo _rce para no chocar con otros archivos)
// ════════════════════════════════════════════════════════════
function _rceTieneValor(hoja, col, valor) {
  const ultima = hoja.getLastRow();
  if (ultima < 1) return false;
  const vals = hoja.getRange(1, col, ultima, 1).getValues();
  for (let i = 0; i < vals.length; i++) if (vals[i][0] === valor) return true;
  return false;
}

function _rceAvisar(titulo, msg) {
  try { SpreadsheetApp.getUi().alert(titulo, msg, SpreadsheetApp.getUi().ButtonSet.OK); }
  catch (e) { console.log(titulo + ' — ' + msg); }
}
