/**
 * infra_util.gs — Utilidades transversales chicas.
 */

/** TRUE/'TRUE'/'1'/'SI'/'SÍ'/'YES'/1 → true. */
function esVerdadero(v) {
  if (v === true || v === 1) return true;
  if (typeof v === 'string') {
    const s = v.trim().toUpperCase();
    return s === 'TRUE' || s === '1' || s === 'SI' || s === 'SÍ' || s === 'YES';
  }
  return false;
}

/** ID único legible con prefijo. */
function uid(prefix) {
  return (prefix || 'ID') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7).toUpperCase();
}

/** Valor de CONFIG por clave (con default opcional). */
function configVal(clave, def) {
  const rows = repoLeerTodos('CONFIG', 'CLAVE', clave);
  return rows.length ? rows[0].VALOR : (def !== undefined ? def : '');
}

/** Valores activos de un catálogo (CATALOGOS), ordenados. */
function catalogo(tipo) {
  return repoLeerTodos('CATALOGOS', 'TIPO', tipo)
    .filter(r => esVerdadero(r.ACTIVO))
    .sort((a, b) => (parseInt(a.ORDEN) || 0) - (parseInt(b.ORDEN) || 0))
    .map(r => r.VALOR);
}
