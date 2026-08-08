/**
 * infra.gs — fusión de 6 archivos del repo (infra_respuesta.gs, infra_util.gs, infra_fechas.gs, infra_lock.gs, infra_log.gs, infra_auth.gs).
 * En Apps Script todos los archivos comparten un mismo espacio global:
 * la fusión es organizativa, el código es idéntico.
 */


// ════════════════════════════════════════════════════════════════════
// ── infra_respuesta.gs ──
// ════════════════════════════════════════════════════════════════════

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


// ════════════════════════════════════════════════════════════════════
// ── infra_util.gs ──
// ════════════════════════════════════════════════════════════════════

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


// ════════════════════════════════════════════════════════════════════
// ── infra_fechas.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * infra_fechas.gs — Fechas y tiempos en la zona horaria del sistema.
 * La TZ se lee de CONFIG.TIMEZONE (default America/Santiago) vía _tz() de esquema.gs.
 * Las fechas se manejan como texto ISO "yyyy-MM-dd" y se comparan por string.
 */

function hoyISO() {
  return Utilities.formatDate(new Date(), _tz(), 'yyyy-MM-dd');
}

function ahoraTS() {
  return Utilities.formatDate(new Date(), _tz(), 'yyyy-MM-dd HH:mm:ss');
}

/** Días completos entre dos fechas ISO (>=0). */
function diasEntre(desdeISO, hastaISO) {
  if (!desdeISO || !hastaISO) return 0;
  try {
    const d1 = new Date(String(desdeISO).slice(0, 10) + 'T00:00:00');
    const d2 = new Date(String(hastaISO).slice(0, 10) + 'T00:00:00');
    const diff = d2 - d1;
    return diff < 0 ? 0 : Math.floor(diff / 86400000);
  } catch (e) { return 0; }
}

/** Hora actual "HH:mm". Se deriva de ahoraTS() para que exista UNA sola
    fuente de reloj (los arneses y la simulación la sustituyen). */
function _horaAhora() {
  const h = String(ahoraTS()).slice(11, 16);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(h) ? h : '00:00';
}

/** Momento actual como 'yyyy-MM-dd HH:mm'. */
function _tsAhora() {
  return hoyISO() + ' ' + _horaAhora();
}

/**
 * Momento a partir de una hora escrita a mano: se asume la ocurrencia MÁS
 * RECIENTE de esa hora (hoy si ya pasó, ayer si todavía no). Así, anotar
 * «02:00» a las 05:00 de la madrugada apunta a hace 3 h, y «23:00» a anoche.
 */
function _tsDesdeHora(hora) {
  const h = _horaValida(hora);
  if (!h) return '';
  const hoy = hoyISO(), ahora = _horaAhora();
  if (h <= ahora) return hoy + ' ' + h;
  const d = new Date(hoy + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10) + ' ' + h;
}

/** Parte fecha / hora de un momento 'yyyy-MM-dd HH:mm'. */
function _tsFecha(ts) { return String(ts || '').slice(0, 10); }
function _tsHora(ts)  { return _horaValida(String(ts || '').slice(11, 16)); }

/** Normaliza una hora a "HH:mm"; devuelve '' si no es una hora válida. */
function _horaValida(h) {
  const s = String(h == null ? '' : h).trim().slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : '';
}

/**
 * Días completos por BLOQUES DE 24 HORAS (ago-2026, pedido de Diego: «un
 * paciente que llegó hace un par de horas no puede aparecer con día 1»).
 * Cuenta cuántos bloques de 24 h transcurrieron entre el inicio (fecha+hora)
 * y el momento de referencia. SIN hora de inicio cae al conteo por días
 * calendario de siempre, para no alterar lo ya registrado.
 * Es el mismo criterio del sistema del hospital.
 */
function diasBloques24(desdeTS, fechaCal, hastaISO, hastaHora) {
  // desdeTS: momento real 'yyyy-MM-dd HH:mm'. Si no hay (episodios antiguos),
  // se cuenta por días calendario desde fechaCal, como siempre.
  const desdeISO = _tsFecha(desdeTS), desdeHora = _tsHora(desdeTS);
  if (!desdeISO || !desdeHora) return (fechaCal && hastaISO) ? diasEntre(fechaCal, hastaISO) : 0;
  if (!hastaISO) return 0;
  try {
    const t = function (f, h) {
      const hh = String(h || '00:00').slice(0, 5);
      return new Date(String(f).slice(0, 10) + 'T' + (/^\d{2}:\d{2}$/.test(hh) ? hh : '00:00') + ':00');
    };
    const diff = t(hastaISO, hastaHora || '00:00') - t(desdeISO, desdeHora);
    return diff < 0 ? 0 : Math.floor(diff / 86400000);
  } catch (e) { return diasEntre(desdeISO, hastaISO); }
}

/**
 * Fecha EFECTIVA de un turno: la Noche fecha al día siguiente.
 *
 * El turno de noche transcurre casi entero pasada la medianoche, así que lo
 * que ocurre en él pertenece al día siguiente. Lo usan los relojes de
 * dispositivos (v5.20, «la noche del 31 se anota con el 01») y, desde ago-2026,
 * también los DÍAS DE ESTADÍA / VM / VA: manda la lista oficial del hospital
 * (BUDA), que se actualiza al cambiar el calendario.
 *
 * Vivía en svc_eventos.gs; se mudó aquí al necesitarla svc_evoluciones,
 * svc_entrega y mantenimiento_manuel — es un helper de fechas, no de eventos.
 */
function _fechaEfectivaTurno(fecha, turno) {
  const f = String(fecha || '').slice(0, 10);
  if (String(turno) !== 'Noche') return f;
  const d = new Date(f + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Momento de referencia de un TURNO para contar los bloques de 24 h: la
 * mitad del turno (Día 09-21 → 15:00; Noche 21-09 → 03:00 del día siguiente).
 * Es determinista: re-editar una evolución no cambia sus días.
 */
function refTurno(fechaISO, turno) {
  const f = String(fechaISO || '').slice(0, 10);
  if (String(turno) === 'Noche') {
    const d = new Date(f + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return { fecha: d.toISOString().slice(0, 10), hora: '03:00' };
  }
  return { fecha: f, hora: '15:00' };
}

/** Fecha ISO menos N días (para plegar "días previos" en el ancla de un contador). */
function _restarDias(fechaISO, n) {
  try {
    const d = new Date(String(fechaISO).slice(0, 10) + 'T00:00:00');
    d.setDate(d.getDate() - (parseInt(n) || 0));
    return Utilities.formatDate(d, _tz(), 'yyyy-MM-dd');
  } catch (e) { return fechaISO; }
}

/**
 * Momento REAL de un evento anotado con hora dentro de un turno.
 * El turno Noche cruza la medianoche: 20:00 es del día del turno y 03:00 ya es
 * del día siguiente. Sin hora escrita cae a la referencia del turno.
 * Devuelve 'yyyy-MM-dd HH:mm'.
 */
function _tsEventoTurno(fecha, turno, hora) {
  var f = String(fecha || '').slice(0, 10);
  if (!f) return '';
  var h = _horaValida(hora);
  if (!h) { var r = refTurno(f, turno); return r.fecha + ' ' + r.hora; }
  if (String(turno) === 'Noche' && parseInt(h.slice(0, 2), 10) < 12) f = _restarDias(f, -1);
  return f + ' ' + h;
}

/** 'yyyy-MM-dd HH:mm' → milisegundos (sin depender del parser de cada motor). */
function _msDeTS(ts) {
  var m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

/** Horas entre dos marcas 'yyyy-MM-dd HH:mm' (1 decimal). '' si no se puede. */
function _horasEntreTS(desde, hasta) {
  var a = _msDeTS(desde), b = _msDeTS(hasta);
  if (a === null || b === null || b < a) return '';
  return Math.round((b - a) / 36e5 * 10) / 10;
}


// ════════════════════════════════════════════════════════════════════
// ── infra_lock.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * infra_lock.gs — Concurrencia. Envuelve escrituras en un lock de script.
 * Regla: SOLO las funciones públicas del dispatcher usan conLock().
 * Dentro del lock se llaman versiones internas SIN lock (evita deadlock).
 */

function conLock(fn) {
  const lock = LockService.getScriptLock();
  let got = false;
  try {
    got = lock.tryLock(10000); // no lanza excepción: devuelve boolean
    if (!got) return err('Sistema ocupado (otra escritura en curso). Reintenta.', ERR.LOCK_TIMEOUT);
    return fn();
  } finally {
    if (got) lock.releaseLock();
  }
}


// ════════════════════════════════════════════════════════════════════
// ── infra_log.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * infra_log.gs — Auditoría. Registra cada acción de escritura en AUDIT_LOG.
 * La identidad (email) proviene del token GIS verificado (infra_auth.gs), no de getActiveUser().
 */

function auditar(a) {
  try {
    a = a || {};
    repoInsertar('AUDIT_LOG', {
      ID:            'AUD_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7).toUpperCase(),
      TIMESTAMP:     ahoraTS(),
      USUARIO_EMAIL: a.email     || '',
      FIRMA:         a.firma     || '',
      ACCION:        a.accion    || '',
      ENTIDAD:       a.entidad   || '',
      ID_ENTIDAD:    a.idEntidad || '',
      PATIENT_ID:    a.patientId || '',
      RESUMEN:       a.resumen   || '',
    });
  } catch (e) {
    // La auditoría nunca debe romper la operación principal.
    console.warn('auditar:', e.message);
  }
}


// ════════════════════════════════════════════════════════════════════
// ── infra_auth.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * infra_auth.gs — Identidad y autorización (Google Sign-In, D1b).
 *
 * El frontend obtiene un ID token (JWT) vía Google Identity Services y lo
 * envía en cada request. Aquí se VERIFICA contra Google (endpoint tokeninfo),
 * se comprueba que el `aud` sea nuestro OAUTH_CLIENT_ID y que el email esté
 * verificado, y se resuelve la firma clínica (1:1) desde KINESIOLOGOS.
 *
 * Con cuentas personales `Session.getActiveUser()` no es fiable; por eso NO se usa.
 */

/**
 * Verifica un ID token de GIS. Devuelve {email, name, exp} si es válido, o null.
 * Cachea el resultado hasta poco antes de expirar para no re-verificar cada request.
 */
function verificarToken(idToken) {
  if (!idToken) return null;
  const cache = CacheService.getScriptCache();
  const ckey = 'gis_' + Utilities.base64EncodeWebSafe(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  const hit = cache.get(ckey);
  if (hit) return JSON.parse(hit);

  const url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  let resp;
  try { resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true }); }
  catch (e) { console.warn('verificarToken fetch:', e.message); return null; }
  if (resp.getResponseCode() !== 200) return null;

  let c;
  try { c = JSON.parse(resp.getContentText()); } catch (e) { return null; }

  const clientId = configVal('OAUTH_CLIENT_ID');
  if (!clientId || String(c.aud) !== String(clientId)) return null;
  if (String(c.email_verified) !== 'true' && c.email_verified !== true) return null;
  if (!c.email) return null;

  const claims = { email: String(c.email).toLowerCase(), name: c.name || '', exp: parseInt(c.exp) || 0 };
  const ttl = Math.max(0, Math.min(3600, claims.exp - Math.floor(Date.now() / 1000) - 30));
  if (ttl > 10) cache.put(ckey, JSON.stringify(claims), ttl);
  return claims;
}

/**
 * Firma clínica activa asociada a un email (1:1), o null.
 *
 * Con caché corto (ago-2026, Ola 4): en producción CADA llamada autenticada
 * —cada apertura de paciente, cada guardado, cada refresco del grid— bajaba
 * la hoja KINESIOLOGOS para resolver la misma firma. La lista del staff es
 * configuración (como CONFIG/CATALOGOS), no dato clínico, y cambia un puñado
 * de veces al año; se cachea 5 minutos POR EMAIL.
 *
 * El costo del trade-off, dicho entero: desactivar a un kinesiólogo en la
 * hoja tarda hasta 5 min en propagarse al bloqueo de escritura (su firma
 * sigue resolviendo desde el caché). Solo se cachea el HALLAZGO — un email
 * sin firma se re-consulta siempre, así que dar de alta a alguien nuevo
 * funciona al instante.
 */
var _FIRMA_CACHE_TTL = 300;   // segundos
function firmaDeEmail(email) {
  if (!email) return null;
  const mail = String(email).toLowerCase();
  let cache = null;
  try {
    cache = CacheService.getScriptCache();
    const hit = cache.get('firma_' + mail);
    if (hit) return hit;
  } catch (e) { /* sin caché se resuelve igual, solo más lento */ }
  const kines = repoLeerTodos('KINESIOLOGOS', 'EMAIL', mail)
    .filter(k => esVerdadero(k.ACTIVO));
  const firma = kines.length ? String(kines[0].FIRMA) : null;
  if (firma && cache) {
    try { cache.put('firma_' + mail, firma, _FIRMA_CACHE_TTL); } catch (e) {}
  }
  return firma;
}

/**
 * Autoriza una acción de escritura.
 * @param {string} idToken        token GIS enviado por el cliente
 * @param {string} [firmaDeclarada]  firma que el formulario quiere estampar
 * @return {{ok:true,email,firma,nombre} | {ok:false,error,codigo}}
 */
function autorizar(idToken, firmaDeclarada) {
  // ── MODO DESARROLLO ──────────────────────────────────────────────
  // Permite construir/probar la app SIN que GIS funcione todavía.
  // Se activa con CONFIG.AUTH_DEV_MODE = TRUE. ⚠️ Poner FALSE en producción.
  if (esVerdadero(configVal('AUTH_DEV_MODE'))) {
    // Modo prueba: entra cualquiera. Se respeta la firma que cada kinesiólogo
    // declara (para que su evolución quede firmada con SU sigla); si no declara
    // ninguna, cae a AUTH_DEV_FIRMA y luego a 'DEV'.
    const firmaDev = (firmaDeclarada && String(firmaDeclarada).trim()) || configVal('AUTH_DEV_FIRMA') || 'DEV';
    console.warn('AUTH_DEV_MODE activo — identidad simulada: ' + firmaDev);
    return { ok: true, email: 'dev@local', firma: String(firmaDev), nombre: 'Modo prueba', dev: true };
  }
  // ── PRODUCCIÓN (GIS real) ────────────────────────────────────────
  const claims = verificarToken(idToken);
  if (!claims) return { ok: false, error: 'Sesión no válida. Inicia sesión con Google.', codigo: ERR.NO_AUTORIZADO };

  const firma = firmaDeEmail(claims.email);
  if (!firma) return { ok: false, error: 'Tu correo (' + claims.email + ') no está registrado como kinesiólogo.', codigo: ERR.NO_AUTORIZADO };

  const decl = firmaDeclarada ? String(firmaDeclarada).trim() : '';
  if (decl && decl !== firma) {
    return { ok: false, error: 'No puedes firmar como ' + decl + ': tu firma es ' + firma + '.', codigo: ERR.NO_AUTORIZADO };
  }
  return { ok: true, email: claims.email, firma: firma, nombre: claims.name };
}
