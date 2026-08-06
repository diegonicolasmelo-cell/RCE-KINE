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
  // Con filtro, la lectura se acota por tramos (repoLeerFiltrado): baja UNA
  // columna para ubicar las filas y solo después las filas completas. Antes
  // se traía la hoja ENTERA (EVOLUCIONES: 380 columnas × todo el historial)
  // y se filtraba en memoria — invisible con pocos datos, segundos de espera
  // con el año lleno. Todas las columnas usadas como filtro son de tipo
  // texto, así que el valor crudo de la celda calza con el convertido.
  if (filtroKey != null && filtroVal != null) {
    const fv = String(filtroVal).trim();
    return repoLeerFiltrado(hoja, filtroKey, function (v) { return String(v).trim() === fv; });
  }
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], total = TOTAL_COLS[hoja], ult = h.getLastRow();
  if (ult < fi) return [];
  const datos = h.getRange(fi, 1, ult - fi + 1, total).getValues();
  const out = [];
  for (let i = 0; i < datos.length; i++) out.push(esquemaFilaAObjeto(hoja, datos[i]));
  return out;
}

/**
 * Lee SOLO las filas cuyo campo `colKey` cumple `pred`, sin traer la hoja
 * entera (ago-2026). Primero baja una única columna (barato) para ubicar las
 * filas y después lee el bloque que las contiene. En EVOLUCIONES (379
 * columnas) esto evita descargar decenas de miles de celdas en cada arranque:
 * el costo deja de crecer con el historial acumulado.
 */
function repoLeerFiltrado(hoja, colKey, pred) {
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], total = TOTAL_COLS[hoja], ult = h.getLastRow();
  if (ult < fi) return [];
  const nFilas = ult - fi + 1;
  const col = COL[hoja][colKey];
  if (!col) throw new Error('Columna desconocida: ' + colKey + ' en ' + hoja);
  const clave = h.getRange(fi, col, nFilas, 1).getValues();
  let desde = -1, hasta = -1;
  const marcadas = [];
  for (let i = 0; i < clave.length; i++) {
    if (!pred(clave[i][0])) continue;
    marcadas.push(i);
    if (desde < 0) desde = i;
    hasta = i;
  }
  if (!marcadas.length) return [];
  // Las filas del día suelen ir juntas al final, pero pueden quedar dispersas
  // (evoluciones de fechas pasadas). Se leen por TRAMOS contiguos, uniendo
  // huecos pequeños: un solo getRange en el caso normal y unos pocos en el
  // peor, en vez de bajar la hoja entera.
  const HUECO = 25;
  const tramos = [];
  let ini = marcadas[0], fin = marcadas[0];
  for (let k = 1; k < marcadas.length; k++) {
    if (marcadas[k] - fin <= HUECO) { fin = marcadas[k]; continue; }
    tramos.push([ini, fin]); ini = fin = marcadas[k];
  }
  tramos.push([ini, fin]);
  // Cada getRange tiene su costo fijo: si quedaron demasiados tramos (filas
  // muy dispersas), sale más barato una sola lectura del bloque completo.
  if (tramos.length > 8) tramos.length = 0, tramos.push([desde, hasta]);
  const porFila = {};
  tramos.forEach(function (t) {
    const vals = h.getRange(fi + t[0], 1, t[1] - t[0] + 1, total).getValues();
    for (let i = 0; i < vals.length; i++) porFila[t[0] + i] = vals[i];
  });
  const out = [];
  for (let k = 0; k < marcadas.length; k++) {
    const fila = porFila[marcadas[k]];
    if (fila) out.push(esquemaFilaAObjeto(hoja, fila));
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

/**
 * Inserta una fila desde un objeto. Escribe en la primera fila de datos real
 * (max(lastRow+1, FILA_DATOS)) — NO usa appendRow, que en hojas con filas de
 * encabezado vacías (p.ej. EVOLUCIONES, 3 encabezados) escribiría dentro de la
 * zona de encabezado y el registro quedaría invisible para las lecturas.
 */
function repoInsertar(hoja, obj) {
  const h = _hoja(hoja);
  const fila = esquemaObjetoAFila(hoja, obj);
  const row = Math.max(h.getLastRow() + 1, FILA_DATOS[hoja]);
  h.getRange(row, 1, 1, TOTAL_COLS[hoja]).setValues([fila]);
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

/**
 * Elimina todas las filas cuyo objeto cumpla el predicado fn(obj)===true.
 * Borra de abajo hacia arriba para no desordenar índices.
 * @return {number} filas eliminadas.
 */
function repoEliminarDonde(hoja, fn) {
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], total = TOTAL_COLS[hoja], ult = h.getLastRow();
  if (ult < fi) return 0;
  const datos = h.getRange(fi, 1, ult - fi + 1, total).getValues();
  const aBorrar = [];
  for (let i = 0; i < datos.length; i++) {
    if (fn(esquemaFilaAObjeto(hoja, datos[i]))) aBorrar.push(fi + i);
  }
  aBorrar.reverse().forEach(r => h.deleteRow(r));
  return aBorrar.length;
}

/**
 * Actualiza en bloque todas las filas que cumplan fn(obj); mut(obj) devuelve
 * los campos a cambiar para esa fila. Lee y escribe el rango completo UNA vez,
 * por lo que sirve para re-etiquetar muchas filas sin buscar por id (que se
 * volvería ambiguo si los ids cambian durante la operación, p.ej. traslados).
 * @return {number} filas modificadas.
 */
function repoActualizarDonde(hoja, fn, mut) {
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], total = TOTAL_COLS[hoja], ult = h.getLastRow();
  if (ult < fi) return 0;
  const rango = h.getRange(fi, 1, ult - fi + 1, total);
  const datos = rango.getValues();
  const colmap = COL[hoja];
  let n = 0;
  for (let i = 0; i < datos.length; i++) {
    const obj = esquemaFilaAObjeto(hoja, datos[i]);
    if (!fn(obj)) continue;
    const campos = mut(obj) || {};
    Object.keys(campos).forEach(k => {
      if (colmap[k]) datos[i][colmap[k] - 1] = (campos[k] == null) ? '' : campos[k];
    });
    n++;
  }
  if (n) rango.setValues(datos);
  return n;
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
