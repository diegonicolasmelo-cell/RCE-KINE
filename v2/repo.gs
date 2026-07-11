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
