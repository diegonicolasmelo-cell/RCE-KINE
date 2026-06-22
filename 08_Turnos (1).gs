/**
 * ============================================================
 *  08_Turnos.gs — Tablero de asignación de turno
 *  RCE KINE UCIA | GAS-v1.5
 *
 *  CAMBIOS v1.5:
 *  ★ getAsignacionTurno: buscarFila() en vez de scan O(N) completo
 *  ★ setAsignacionTurno: buscarFila() + escritura en 1 sola I/O
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
    var hoja = _getHojaTurnos();
    var fila = buscarFila(hoja, COL_TUR.KEY, datos.key, 2);
    if (fila === -1) return ok(null);
    var val = hoja.getRange(fila, 2).getValue();
    try { return ok(JSON.parse(val)); }
    catch (e) { return ok(null); }
  } catch (e) { return err('getAsignacionTurno: ' + e.message, e); }
}

// SET_ASIGNACION_TURNO → guarda/actualiza DATA+TIMESTAMP en 1 sola I/O
function setAsignacionTurno(datos) {
  try {
    var hoja = _getHojaTurnos();
    var ts   = new Date();
    var fila = buscarFila(hoja, COL_TUR.KEY, datos.key, 2);
    if (fila !== -1) {
      hoja.getRange(fila, 2, 1, 2).setValues([[datos.data, ts]]);
    } else {
      hoja.appendRow([datos.key, datos.data, ts]);
    }
    SpreadsheetApp.flush();
    return ok({ accion: fila !== -1 ? 'turno_actualizado' : 'turno_guardado' });
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
