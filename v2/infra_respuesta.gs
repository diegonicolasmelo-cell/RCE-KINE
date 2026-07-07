/**
 * infra_respuesta.gs — Respuesta estándar de toda la API.
 * Todas las funciones públicas devuelven {ok:true,data} o {ok:false,error,codigo}.
 */

const ERR = {
  LOCK_TIMEOUT:  'LOCK_TIMEOUT',
  VALIDACION:    'VALIDACION',
  NO_AUTORIZADO: 'NO_AUTORIZADO',
  NO_ENCONTRADO: 'NO_ENCONTRADO',
  INTERNO:       'INTERNO',
};

function ok(data) {
  return { ok: true, data: (data === undefined ? null : data) };
}

function err(msg, codigo, e) {
  if (e) console.error(msg, e);
  return { ok: false, error: msg, codigo: codigo || ERR.INTERNO };
}
