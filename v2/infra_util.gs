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

/**
 * Agrega una fase clínica al catálogo compartido (CATALOGOS/FASE_CLINICA).
 * Valida nombre no vacío y rechaza duplicado (case-insensitive). ORDEN = max+1.
 * @return {Object} ok({ fases:[...], ... }) o err(...)
 */
function agregarFaseClinica(nombre) {
  const nom = String(nombre || '').trim();
  if (!nom) return err('El nombre de la fase no puede estar vacío.', ERR.VALIDACION);
  const filas = repoLeerTodos('CATALOGOS', 'TIPO', 'FASE_CLINICA');
  const dup = filas.some(r => String(r.VALOR || '').trim().toLowerCase() === nom.toLowerCase());
  if (dup) return err('La fase "' + nom + '" ya existe.', ERR.VALIDACION);
  const maxOrden = filas.reduce((m, r) => Math.max(m, parseInt(r.ORDEN) || 0), 0);
  repoInsertar('CATALOGOS', { TIPO: 'FASE_CLINICA', VALOR: nom, ORDEN: maxOrden + 1, ACTIVO: true });
  return ok({ fases: catalogo('FASE_CLINICA'), entidad: 'CATALOGOS', accion: 'agregar fase: ' + nom });
}

/**
 * Definición activa de las matrices de categorización (hoja CAT_MATRICES),
 * ordenada. null si la hoja no existe aún (el cliente usa su default SOCHIMI).
 */
function catMatrices() {
  try {
    const filas = repoLeerTodos('CAT_MATRICES')
      .filter(r => esVerdadero(r.ACTIVA) && r.MATRIZ && r.VARIABLE)
      .sort((a, b) => (parseInt(a.ORDEN) || 0) - (parseInt(b.ORDEN) || 0))
      .map(r => ({ m: String(r.MATRIZ).trim().toUpperCase(), v: String(r.VARIABLE).trim().toUpperCase(),
                   u2: String(r.UMBRAL_2 || '').trim(), u3: String(r.UMBRAL_3 || '').trim() }));
    return filas.length ? filas : null;
  } catch (e) { return null; }
}
