/**
 * ============================================================
 *  08_Turnos.gs — Tablero de asignación de turno
 *  RCE KINE UCIA | GAS-v1.4
 *
 *  Guarda y recupera la asignación de camas por kinesiólogo
 *  en la hoja "TURNOS" del Spreadsheet (se crea sola).
 *
 *  Llamado desde index.html (tablero de turno embebido):
 *    gs('GET_ASIGNACION_TURNO', { key: '2026-06-11-Dia' })
 *    gs('SET_ASIGNACION_TURNO', { key: '2026-06-11-Dia', data: '{...}' })
 *
 *  Hoja TURNOS:  A=KEY  B=DATA(JSON)  C=TIMESTAMP
 * ============================================================
 */

function _getHojaTurnos() {
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(SH.TURNOS);
  if (!hoja) {
    hoja = ss.insertSheet(SH.TURNOS);
    hoja.appendRow(['KEY', 'DATA', 'TIMESTAMP']);
    hoja.setFrozenRows(1);
    hoja.setColumnWidth(1, 160);
    hoja.setColumnWidth(2, 600);
    hoja.setColumnWidth(3, 180);
  }
  return hoja;
}

// GET_ASIGNACION_TURNO → { team, assign } o null
function getAsignacionTurno(datos) {
  try {
    var hoja  = _getHojaTurnos();
    var filas = hoja.getDataRange().getValues();
    for (var i = 1; i < filas.length; i++) {
      if (filas[i][0] === datos.key) {
        try { return ok(JSON.parse(filas[i][1])); }
        catch (e) { return ok(null); }
      }
    }
    return ok(null);
  } catch (e) { return err('getAsignacionTurno: ' + e.message, e); }
}

// SET_ASIGNACION_TURNO → guarda/actualiza
function setAsignacionTurno(datos) {
  try {
    var hoja  = _getHojaTurnos();
    var ts    = new Date();
    var filas = hoja.getDataRange().getValues();
    for (var i = 1; i < filas.length; i++) {
      if (filas[i][0] === datos.key) {
        hoja.getRange(i + 1, 2).setValue(datos.data);
        hoja.getRange(i + 1, 3).setValue(ts);
        SpreadsheetApp.flush();
        return ok({ accion: 'turno_actualizado' });
      }
    }
    hoja.appendRow([datos.key, datos.data, ts]);
    SpreadsheetApp.flush();
    return ok({ accion: 'turno_guardado' });
  } catch (e) { return err('setAsignacionTurno: ' + e.message, e); }
}

// Limpieza opcional (disparador diario): borra >30 días
function limpiarTurnosAntiguos() {
  var hoja   = _getHojaTurnos();
  var filas  = hoja.getDataRange().getValues();
  var limite = new Date(); limite.setDate(limite.getDate() - 30);
  for (var i = filas.length - 1; i >= 1; i--) {
    var ts = filas[i][2];
    if (ts && new Date(ts) < limite) hoja.deleteRow(i + 1);
  }
}
