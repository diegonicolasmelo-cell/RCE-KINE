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

/* ── Sugerencias del equipo (ago-2026, centro de ayuda de la mascota) ──
   Cada colega deja su idea con su firma; la coordinación las revisa en
   Estadísticas y les pone estado. El colega ve las SUYAS con su estado
   (sabe que no cayeron al vacío); el listado completo es de coordinación. */

function guardarSugerencia(datos, ctx) {
  try {
    const texto = String((datos && datos.texto) || '').trim().slice(0, 1000);
    const firma = String((datos && datos.firma) || '').trim();
    if (!texto) return err('Escribe la sugerencia antes de enviar.', ERR.VALIDACION);
    if (!firma) return err('Falta la firma de quien sugiere.', ERR.VALIDACION);
    const fila = {
      ID: 'SUG_' + Date.now(),
      TIMESTAMP: ahoraTS(),
      FIRMA: firma,
      AUTOR_EMAIL: (ctx && ctx.email) || '',
      TEXTO: texto,
      ESTADO: 'nueva',
      NOTA_COORD: '',
    };
    repoInsertar('SUGERENCIAS', fila);
    return ok({ id: fila.ID, entidad: 'SUGERENCIAS', accion: 'sugerencia' });
  } catch (e) { return err('guardarSugerencia: ' + e.message, ERR.INTERNO, e); }
}

function obtenerSugerencias() {
  try {
    const rows = repoLeerTodos('SUGERENCIAS').map(function (s) {
      return { id: s.ID, ts: s.TIMESTAMP, firma: s.FIRMA, texto: s.TEXTO,
               estado: s.ESTADO || 'nueva', nota: s.NOTA_COORD || '' };
    });
    rows.reverse();   // las más nuevas primero
    return ok(rows);
  } catch (e) { return err('obtenerSugerencias: ' + e.message, ERR.INTERNO, e); }
}

const _SUG_ESTADOS = ['nueva', 'considerada', 'aplicada', 'descartada'];
function setSugerenciaEstado(datos) {
  try {
    const id = String((datos && datos.id) || '');
    const estado = String((datos && datos.estado) || '');
    if (_SUG_ESTADOS.indexOf(estado) === -1) return err('Estado desconocido: ' + estado, ERR.VALIDACION);
    const cambios = { ESTADO: estado };
    if (datos && datos.nota !== undefined) cambios.NOTA_COORD = String(datos.nota).slice(0, 500);
    if (!repoActualizar('SUGERENCIAS', 'ID', id, cambios)) return err('Sugerencia no encontrada.', ERR.VALIDACION);
    return ok({ id: id, estado: estado, entidad: 'SUGERENCIAS', accion: 'estado sugerencia' });
  } catch (e) { return err('setSugerenciaEstado: ' + e.message, ERR.INTERNO, e); }
}
