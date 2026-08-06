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

/**
 * Valor de CONFIG por clave (con default opcional).
 *
 * Va por el MISMO memo que `leerConfig` (ver esquema.gs) en vez de consultar la
 * hoja: esta función corre en el camino de autenticación, o sea en TODAS las
 * llamadas al servidor y no solo al arrancar, y cada consulta costaba una
 * lectura completa de CONFIG. La diferencia teórica con la versión anterior
 * (una clave presente pero con valor vacío ahora cae al default en vez de
 * devolver '') no afecta a ningún llamador: los cuatro usos reales pasan '' o
 * nada como default.
 */
function configVal(clave, def) {
  return leerConfig(clave, def !== undefined ? def : '');
}

// ── Configuración y catálogos: una sola lectura por PETICIÓN (ago-2026) ─────
// CONFIG, CATALOGOS y CAT_MATRICES son tablas chicas de configuración que no
// cambian mientras se atiende una petición, pero se volvían a bajar del Sheet
// cada vez que alguien preguntaba (el arranque consulta CONFIG 17 veces). El
// memo vive lo que dura la petición: `api()` lo olvida al entrar y las
// escrituras lo invalidan, así que nadie puede leer configuración vieja.
// Se devuelve siempre una copia para que ningún llamador mute lo memorizado.
var _CAT_MEMO = {};
var _MEMO_OFF = false;   // solo lo levanta medirArranque(), para comparar con/sin

/** ¿Memo desactivado? (medición) */
function _memoApagado() { return _MEMO_OFF === true; }

/** Olvida los catálogos memorizados (tras escribir en ellos). */
function _catInvalidar() { _CAT_MEMO = {}; }

/**
 * Olvida TODO lo memorizado de la petición anterior. Lo llama `api()` al
 * entrar. En Apps Script cada petición es un proceso nuevo y esto no cambia
 * nada; el simulador, en cambio, atiende muchas peticiones en un mismo proceso
 * de Node, y sin este reseteo una prueba vería la configuración de la anterior.
 */
function _memoReset() {
  _CAT_MEMO = {};
  if (typeof _CFG_MEMO !== 'undefined') _CFG_MEMO = null;
  if (typeof _TZ_MEMO !== 'undefined') _TZ_MEMO = null;
}

/** Valores activos de un catálogo (CATALOGOS), ordenados. */
function catalogo(tipo) {
  const k = 'CATALOGOS/' + tipo;
  if (_CAT_MEMO[k] && !_memoApagado()) return _CAT_MEMO[k].slice();
  const out = repoLeerTodos('CATALOGOS', 'TIPO', tipo)
    .filter(r => esVerdadero(r.ACTIVO))
    .sort((a, b) => (parseInt(a.ORDEN) || 0) - (parseInt(b.ORDEN) || 0))
    .map(r => r.VALOR);
  if (!_memoApagado()) _CAT_MEMO[k] = out;
  return out.slice();
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
  _catInvalidar();   // la fase recién creada tiene que salir en la lista que se devuelve
  return ok({ fases: catalogo('FASE_CLINICA'), entidad: 'CATALOGOS', accion: 'agregar fase: ' + nom });
}

/**
 * Definición activa de las matrices de categorización (hoja CAT_MATRICES),
 * ordenada. null si la hoja no existe aún (el cliente usa su default SOCHIMI).
 */
function catMatrices() {
  if (_CAT_MEMO['CAT_MATRICES'] !== undefined && !_memoApagado()) {
    const m = _CAT_MEMO['CAT_MATRICES'];
    return m ? m.slice() : null;
  }
  try {
    const filas = repoLeerTodos('CAT_MATRICES')
      .filter(r => esVerdadero(r.ACTIVA) && r.MATRIZ && r.VARIABLE)
      .sort((a, b) => (parseInt(a.ORDEN) || 0) - (parseInt(b.ORDEN) || 0))
      .map(r => ({ m: String(r.MATRIZ).trim().toUpperCase(), v: String(r.VARIABLE).trim().toUpperCase(),
                   u2: String(r.UMBRAL_2 || '').trim(), u3: String(r.UMBRAL_3 || '').trim() }));
    const out = filas.length ? filas : null;
    if (!_memoApagado()) _CAT_MEMO['CAT_MATRICES'] = out;
    return out ? out.slice() : null;
  } catch (e) { return null; }
}
