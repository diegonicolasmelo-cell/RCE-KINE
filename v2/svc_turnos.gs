/**
 * svc_turnos.gs — Tablero de asignación de turno (v1: "🎨 Asignar turno").
 *
 * Guarda qué kinesiólogos están de turno y qué camas pinta cada uno, por
 * clave de turno ('yyyy-MM-dd-Dia' | 'yyyy-MM-dd-Noche'). Es un dato
 * operativo compartido y efímero → se persiste en ScriptProperties (no
 * requiere hoja ni cambio de esquema). Se conserva un máximo de claves
 * recientes para no crecer sin límite.
 */

var _ASIG_PREFIX = 'ASIG_TURNO_';
var _ASIG_MAX_KEYS = 30; // ~2 semanas de turnos

function _asigKeyValida(key) {
  return /^\d{4}-\d{2}-\d{2}-(Dia|Noche)$/.test(String(key || ''));
}

/** @return {{ok:boolean, data:{team:string[], assign:Object}}} */
function obtenerAsignacionTurno(key) {
  try {
    if (!_asigKeyValida(key)) return err('Clave de turno inválida: ' + key, ERR.VALIDACION);
    const raw = PropertiesService.getScriptProperties().getProperty(_ASIG_PREFIX + key);
    if (!raw) return ok({ team: [], assign: {} });
    let data;
    try { data = JSON.parse(raw); } catch (e) { data = { team: [], assign: {} }; }
    return ok({ team: data.team || [], assign: data.assign || {} });
  } catch (e) { return err('obtenerAsignacionTurno: ' + e.message, ERR.INTERNO, e); }
}

/** datos: { key, data: JSON string {team, assign} } */
function guardarAsignacionTurno(datos) {
  try {
    const key = String((datos && datos.key) || '');
    if (!_asigKeyValida(key)) return err('Clave de turno inválida: ' + key, ERR.VALIDACION);
    let data;
    try { data = JSON.parse(String(datos.data || '{}')); } catch (e) {
      return err('Payload de asignación no es JSON válido', ERR.VALIDACION);
    }
    const limpio = JSON.stringify({
      team: Array.isArray(data.team) ? data.team.slice(0, 6).map(String) : [],
      assign: (data.assign && typeof data.assign === 'object') ? data.assign : {},
    });
    const props = PropertiesService.getScriptProperties();
    props.setProperty(_ASIG_PREFIX + key, limpio);
    _asigPodarViejas(props);
    return ok({ accion: 'asignacion_guardada', key: key });
  } catch (e) { return err('guardarAsignacionTurno: ' + e.message, ERR.INTERNO, e); }
}

/** Borra las claves de asignación más antiguas cuando superan el máximo. */
function _asigPodarViejas(props) {
  const keys = props.getKeys().filter(function (k) { return k.indexOf(_ASIG_PREFIX) === 0; });
  if (keys.length <= _ASIG_MAX_KEYS) return;
  keys.sort(); // orden lexicográfico = cronológico (yyyy-MM-dd)
  keys.slice(0, keys.length - _ASIG_MAX_KEYS).forEach(function (k) { props.deleteProperty(k); });
}
