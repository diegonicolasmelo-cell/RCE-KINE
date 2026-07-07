/**
 * repo.gs — Repositorio genérico de acceso a Sheets, dirigido por esquema.
 * Ninguna otra capa toca getRange/getValues directamente: usa estos helpers.
 * Todo se resuelve por NOMBRE de columna (COL[hoja][campo]), nunca por índice fijo.
 */

function _hoja(nombre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getSheetByName(nombre);
  if (!h) throw new Error('Hoja no encontrada: ' + nombre + ' (ejecuta crearORepararEstructura).');
  return h;
}

/**
 * Lee TODAS las filas de datos en UN viaje y las devuelve como objetos.
 * Filtro opcional en memoria (comparación por string, robusta con fechas ISO).
 * @param {string} hoja
 * @param {string} [filtroKey]  nombre de columna
 * @param {*}      [filtroVal]
 * @return {Array<Object>}
 */
function repoLeerTodos(hoja, filtroKey, filtroVal) {
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], total = TOTAL_COLS[hoja], ult = h.getLastRow();
  if (ult < fi) return [];
  const datos = h.getRange(fi, 1, ult - fi + 1, total).getValues();
  const fv = (filtroKey != null && filtroVal != null) ? String(filtroVal).trim() : null;
  const out = [];
  for (let i = 0; i < datos.length; i++) {
    const obj = esquemaFilaAObjeto(hoja, datos[i]);
    if (fv !== null && String(obj[filtroKey]).trim() !== fv) continue;
    out.push(obj);
  }
  return out;
}

/** Índice de fila (1-based) cuyo campo colKey == id, o -1. */
function repoBuscarFila(hoja, colKey, id) {
  const col = COL[hoja][colKey];
  if (!col) throw new Error('Columna desconocida: ' + colKey + ' en ' + hoja);
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], ult = h.getLastRow();
  if (ult < fi) return -1;
  const vals = h.getRange(fi, col, ult - fi + 1, 1).getValues();
  const target = String(id).trim();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === target) return fi + i;
  }
  return -1;
}

/** Objeto de la fila cuyo campo colKey == id, o null. */
function repoBuscarPorId(hoja, colKey, id) {
  const f = repoBuscarFila(hoja, colKey, id);
  if (f === -1) return null;
  const h = _hoja(hoja);
  return esquemaFilaAObjeto(hoja, h.getRange(f, 1, 1, TOTAL_COLS[hoja]).getValues()[0]);
}

/** Inserta una fila desde un objeto (append). Devuelve el objeto. */
function repoInsertar(hoja, obj) {
  _hoja(hoja).appendRow(esquemaObjetoAFila(hoja, obj));
  return obj;
}

/**
 * Actualiza campos de la fila cuyo colKey == id (batch: lee, muta, 1 setValues).
 * @return {boolean} true si actualizó, false si no encontró.
 */
function repoActualizar(hoja, colKey, id, campos) {
  const f = repoBuscarFila(hoja, colKey, id);
  if (f === -1) return false;
  const h = _hoja(hoja), total = TOTAL_COLS[hoja], colmap = COL[hoja];
  const fila = h.getRange(f, 1, 1, total).getValues()[0];
  Object.keys(campos).forEach(k => {
    if (colmap[k]) fila[colmap[k] - 1] = (campos[k] == null) ? '' : campos[k];
  });
  h.getRange(f, 1, 1, total).setValues([fila]);
  return true;
}

/** Elimina la fila cuyo colKey == id. @return {boolean} */
function repoEliminar(hoja, colKey, id) {
  const f = repoBuscarFila(hoja, colKey, id);
  if (f === -1) return false;
  _hoja(hoja).deleteRow(f);
  return true;
}

/**
 * Upsert por clave: si existe la fila (colKey==id) la actualiza; si no, inserta.
 * @return {string} 'crear' | 'actualizar'
 */
function repoUpsert(hoja, colKey, id, obj) {
  const f = repoBuscarFila(hoja, colKey, id);
  if (f === -1) { repoInsertar(hoja, obj); return 'crear'; }
  const h = _hoja(hoja);
  h.getRange(f, 1, 1, TOTAL_COLS[hoja]).setValues([esquemaObjetoAFila(hoja, obj)]);
  return 'actualizar';
}
