/**
 * svc_coordinacion.gs — Modo Coordinación: buscar y corregir fichas de pacientes.
 *
 * Nace del caso de la cama 10 (ago-2026): un paciente estuvo 28 días y al
 * egresar quedó archivado con UN día de estadía, porque los días se congelan
 * al dar de alta y su fecha de ingreso estaba mal. Corregirlo obligaba a abrir
 * el editor de Apps Script y escribir una función de mantenimiento a mano.
 *
 * Tres personas con clave propia (PRD_MODO_COORDINACION.md, D5): MCC (uso
 * diario), DMV y MFB (respaldo), para que la unidad no dependa de una sola.
 *
 * ── USUARIO DE LOGIN ≠ FIRMA CLÍNICA (19-ago-2026, pedido de Manuel) ───────
 * Lo que se escribe en la puerta es `coord1` / `coord2` / `coord3` — no un
 * nombre ni una sigla. La pantalla de entrada no tiene por qué revelar quién
 * tiene acceso privilegiado con solo mirarla. Adentro, cada usuario resuelve
 * a su firma real (MCC/DMV/MFB), que es la que queda estampada en cada
 * corrección y en AUDIT_LOG — la trazabilidad no se pierde, solo se esconde
 * de la pantalla de login. COORD_USUARIOS es la única tabla que conoce el
 * emparejamiento; el resto del servicio trabaja con lo que corresponda según
 * el momento: `usuario` para todo lo de credenciales, `firma` para todo lo
 * que queda escrito en la ficha del paciente.
 *
 * ── EL CANDADO VIVE AQUÍ, NO EN LA PANTALLA ───────────────────────────────
 * Con AUTH_DEV_MODE=TRUE cualquiera con el enlace llega al dispatcher: esconder
 * la pestaña no protege nada, porque quien conozca el nombre de la acción la
 * llama igual. Por eso CADA acción de escritura vuelve a exigir la sesión.
 *
 * ── LAS CLAVES NO VIVEN EN LA PLANILLA ────────────────────────────────────
 * Se guarda su huella (SHA-256 con sal por persona) en PropertiesService, no en
 * CONFIG: CONFIG es una hoja del Sheet y cualquiera con acceso al archivo la
 * lee — o la exporta sin darse cuenta.
 */

// El único lugar donde vive el emparejamiento usuario→firma. Cambiar esto es
// dar o quitar el acceso, o renombrar quién es quién en la pantalla.
var COORD_USUARIOS = { coord1: 'MCC', coord2: 'DMV', coord3: 'MFB' };

var _COORD_SESION_MIN   = 30;   // minutos de vida de una sesión
var _COORD_MAX_INTENTOS = 3;    // fallidos antes de la espera
var _COORD_ESPERA_MIN   = 15;   // minutos de espera tras agotar los intentos

/** Campos que se pueden corregir. Lista BLANCA: nada fuera de aquí se escribe. */
var COORD_CAMPOS = {
  // fechas semilla — cada una con su marca de hora
  FECHA_INGRESO:        { tipo: 'fecha', ts: 'TS_INGRESO',        etiqueta: 'Fecha de ingreso' },
  FECHA_INICIO_SOPORTE: { tipo: 'fecha', ts: 'TS_INICIO_SOPORTE', etiqueta: 'Inicio de ventilación' },
  FECHA_INICIO_VA:      { tipo: 'fecha', ts: 'TS_INICIO_VA',      etiqueta: 'Inicio de vía aérea' },
  FECHA_EGRESO:         { tipo: 'fecha', soloArchivo: true,       etiqueta: 'Fecha de egreso' },
  // administrativos
  NOMBRE:          { tipo: 'texto',  etiqueta: 'Nombre' },
  RUT:             { tipo: 'rut',    etiqueta: 'RUT' },
  EDAD:            { tipo: 'entero', etiqueta: 'Edad' },
  SEXO:            { tipo: 'texto',  etiqueta: 'Sexo' },
  DIAGNOSTICO:     { tipo: 'texto',  etiqueta: 'Diagnóstico' },
  DIAG_REM:        { tipo: 'texto',  etiqueta: 'Diagnóstico REM' },
  MOTIVO_EGRESO:   { tipo: 'texto',  soloArchivo: true, etiqueta: 'Motivo de egreso' },
  DESTINO_EGRESO:  { tipo: 'texto',  soloArchivo: true, etiqueta: 'Destino de egreso' },
};

/** Normaliza un usuario de login: minúsculas, sin espacios. */
function _coordUsuarioNorm(u) { return String(u || '').toLowerCase().trim(); }

/** Firma clínica de un usuario de login, o '' si no existe. */
function _coordFirmaDe(usuario) { return COORD_USUARIOS[_coordUsuarioNorm(usuario)] || ''; }

// ─────────────────────────────────────────────────────────────────────────────
// CLAVES  (todo aquí se guarda y se busca por USUARIO, nunca por firma — así
// ni las claves internas de PropertiesService dejan un rastro con nombres)
// ─────────────────────────────────────────────────────────────────────────────

/** Huella de una clave. La sal es por persona: dos claves iguales no coinciden. */
function _coordHuella(usuario, clave, sal) {
  const crudo = String(sal) + '|' + _coordUsuarioNorm(usuario) + '|' + String(clave);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, crudo, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function _coordProps() { return PropertiesService.getScriptProperties(); }

/** Escribe la clave de un usuario. Genera una sal nueva en cada cambio. */
function _coordGuardarClave(usuario, clave) {
  const u = _coordUsuarioNorm(usuario);
  const sal = Utilities.getUuid();
  _coordProps().setProperty('coord_sal_' + u, sal);
  _coordProps().setProperty('coord_hash_' + u, _coordHuella(u, clave, sal));
  _coordProps().deleteProperty('coord_fallidos_' + u);
  return true;
}

/** ¿La clave enviada es la de ese usuario? */
function _coordClaveOk(usuario, clave) {
  const u = _coordUsuarioNorm(usuario);
  const sal = _coordProps().getProperty('coord_sal_' + u);
  const hash = _coordProps().getProperty('coord_hash_' + u);
  if (!sal || !hash) return false;
  return _coordHuella(u, clave, sal) === hash;
}

/** Marca temporal de un solo uso: obliga a cambiar la clave al entrar. */
function _coordMarcarTemporal(usuario, esTemporal) {
  const k = 'coord_temp_' + _coordUsuarioNorm(usuario);
  if (esTemporal) _coordProps().setProperty(k, '1'); else _coordProps().deleteProperty(k);
}
function _coordEsTemporal(usuario) {
  return _coordProps().getProperty('coord_temp_' + _coordUsuarioNorm(usuario)) === '1';
}

// ─────────────────────────────────────────────────────────────────────────────
// INTENTOS FALLIDOS Y SESIONES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los fallidos se cuentan POR USUARIO, nunca globales: si fueran globales,
 * cualquiera podría dejar afuera a las tres tecleando mal a propósito.
 */
function _coordFallidos(usuario) {
  const v = _coordProps().getProperty('coord_fallidos_' + _coordUsuarioNorm(usuario));
  if (!v) return { n: 0, hasta: 0 };
  try { return JSON.parse(v); } catch (e) { return { n: 0, hasta: 0 }; }
}

function _coordSumarFallido(usuario) {
  const u = _coordUsuarioNorm(usuario);
  const est = _coordFallidos(u);
  est.n = (est.n || 0) + 1;
  if (est.n >= _COORD_MAX_INTENTOS) {
    est.hasta = Date.now() + _COORD_ESPERA_MIN * 60000;
    est.n = 0;
  }
  _coordProps().setProperty('coord_fallidos_' + u, JSON.stringify(est));
  return est;
}

/** Minutos que faltan de espera, o 0 si puede intentar. */
function _coordEsperaRestante(usuario) {
  const est = _coordFallidos(usuario);
  if (!est.hasta || est.hasta <= Date.now()) return 0;
  return Math.ceil((est.hasta - Date.now()) / 60000);
}

/** Abre una sesión atada a un usuario+firma y devuelve su token. */
function _coordAbrirSesion(usuario, firma) {
  const token = Utilities.getUuid();
  const seg = _COORD_SESION_MIN * 60;
  CacheService.getScriptCache().put('coordses_' + token,
    JSON.stringify({ usuario: _coordUsuarioNorm(usuario), firma: String(firma).toUpperCase(), desde: Date.now() }), seg);
  return token;
}

/**
 * Resuelve un token a {usuario, firma}, o null. Renueva la ventana en cada
 * uso: la sesión muere por INACTIVIDAD, no a los 30 minutos de haber entrado.
 */
function coordSesion(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const hit = cache.get('coordses_' + token);
  if (!hit) return null;
  let s;
  try { s = JSON.parse(hit); } catch (e) { return null; }
  if (!s || !s.firma || !s.usuario) return null;
  cache.put('coordses_' + token, hit, _COORD_SESION_MIN * 60);
  return s;
}

/** Atajo cuando solo hace falta la firma (lo que usan casi todas las acciones). */
function coordSesionFirma(token) {
  const s = coordSesion(token);
  return s ? s.firma : null;
}

/**
 * Guardia de TODA acción del modo. Devuelve {ok:true, firma, usuario} o una
 * respuesta de error lista para retornar. Es el candado real del que habla
 * la cabecera.
 */
function coordExigirSesion(token) {
  const s = coordSesion(token);
  if (!s) return { ok: false, error: 'Tu sesión de coordinación expiró. Vuelve a entrar con tu clave.', codigo: ERR.NO_AUTORIZADO };
  return { ok: true, firma: s.firma, usuario: s.usuario };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRAR / CAMBIAR CLAVE / RESTABLECER
// ─────────────────────────────────────────────────────────────────────────────

function coordEntrar(datos) {
  try {
    const usuario = _coordUsuarioNorm(datos && datos.usuario);
    const clave = String((datos && datos.clave) || '');
    const firma = _coordFirmaDe(usuario);
    // Mismo mensaje siempre, exista o no ese usuario: si «no existe» se
    // dijera distinto de «clave mala», probar nombres serviría para
    // descubrir cuáles son válidos.
    if (!firma) return err('Usuario o clave incorrectos.', ERR.NO_AUTORIZADO);

    const espera = _coordEsperaRestante(usuario);
    if (espera > 0) {
      return err('Demasiados intentos. Vuelve a probar en ' + espera + ' minuto' + (espera === 1 ? '' : 's') + '.', ERR.NO_AUTORIZADO);
    }
    if (!_coordClaveOk(usuario, clave)) {
      _coordSumarFallido(usuario);
      auditar({ email: 'coordinacion', firma: firma, accion: 'COORD_INTENTO_FALLIDO',
        entidad: 'COORDINACION', idEntidad: usuario, patientId: '', resumen: 'clave incorrecta' });
      return err('Usuario o clave incorrectos.', ERR.NO_AUTORIZADO);
    }
    _coordProps().deleteProperty('coord_fallidos_' + usuario);
    const token = _coordAbrirSesion(usuario, firma);
    auditar({ email: 'coordinacion', firma: firma, accion: 'COORD_ENTRADA',
      entidad: 'COORDINACION', idEntidad: usuario, patientId: '', resumen: 'entró al modo coordinación' });
    return ok({ token: token, firma: firma, minutos: _COORD_SESION_MIN, debeCambiarClave: _coordEsTemporal(usuario) });
  } catch (e) { return err('coordEntrar: ' + e.message, ERR.INTERNO, e); }
}

/**
 * CERRAR SESIÓN — la operación simétrica de `_coordAbrirSesion` (20-ago-2026).
 *
 * POR QUÉ EXISTE: el botón «Salir» del panel solo limpiaba variables del
 * NAVEGADOR. El token seguía vivo en el caché hasta 30 minutos de inactividad,
 * así que la tablet del office que quedaba abierta NO se cerraba tocando Salir
 * en otro equipo — y ni siquiera tocándolo en la propia tablet. La sesión da
 * acceso a corregir fechas de cualquier paciente de la unidad: cerrarla tiene
 * que cerrarla de verdad, en el servidor, que es donde vive el candado.
 *
 * Cerrar algo que ya no existe NO es un error: se responde ok igual, para que
 * el front nunca se quede atrapado en una sesión que cree abierta. Lo que sí
 * cambia es que solo se audita cuando había algo que cerrar.
 *
 * Cierra la sesión de ESTE token, o sea el dispositivo donde se tocó. Cerrar
 * todas las de una persona a la vez exigiría un índice de sesiones vivas por
 * usuario, que hoy no existe.
 */
function coordCerrarSesion(datos) {
  try {
    const token = String((datos && datos.token) || '');
    if (!token) return ok({ cerrada: false, motivo: 'sin token' });

    const ses = coordSesion(token);
    if (!ses) return ok({ cerrada: false, motivo: 'la sesión ya no estaba abierta' });

    CacheService.getScriptCache().remove('coordses_' + token);
    auditar({ email: 'coordinacion', firma: ses.firma, accion: 'COORD_SALIDA',
      entidad: 'COORDINACION', idEntidad: ses.usuario, patientId: '',
      resumen: 'cerró la sesión de coordinación' });
    return ok({ cerrada: true, firma: ses.firma });
  } catch (e) { return err('coordCerrarSesion: ' + e.message, ERR.INTERNO, e); }
}

// ─────────────────────────────────────────────────────────────────────────────
// RECUPERAR LA CLAVE POR CORREO  —  ESCRITO Y APAGADO
//
// Está completo y con guardias, pero **no se ejecuta**: el interruptor
// `COORD_RECUPERA_CORREO` nace en FALSE porque Diego rechazó el envío de
// correos y hoy el sistema no manda ninguno. Encenderlo es una decisión suya,
// de un solo valor en CONFIG — no un desarrollo.
//
// Cuando se encienda, sustituye al segundo factor que quedó aplazado (D8): el
// código llega al correo institucional en vez de a una app del teléfono.
//
// ANTES DE ENCENDERLO:
//   1. Llenar la columna EMAIL de MCC, DMV y MFB en la hoja KINESIOLOGOS
//      (la semilla las deja vacías). `coordDiagnosticoCorreo()` lo verifica.
//   2. Poner CONFIG.COORD_RECUPERA_CORREO = TRUE.
//   3. Saber que los correos salen desde la cuenta DUEÑA del proyecto (la de
//      Diego), con la cuota diaria de Apps Script. Para tres personas que
//      olvidan la clave de vez en cuando sobra, pero conviene que él lo sepa.
// ─────────────────────────────────────────────────────────────────────────────

var _COORD_COD_MIN      = 10;   // minutos de vida del código
var _COORD_COD_INTENTOS = 3;    // intentos antes de invalidarlo

/** ¿Está encendida la recuperación por correo? */
function coordRecuperaPorCorreo() {
  return esVerdadero(configVal('COORD_RECUPERA_CORREO', 'FALSE'));
}

/** Correo de una firma, desde KINESIOLOGOS. Vacío si no está cargado. */
function _coordEmailDeFirma(firma) {
  const f = String(firma || '').toUpperCase();
  const kines = repoLeerTodos('KINESIOLOGOS', 'FIRMA', f);
  for (let i = 0; i < kines.length; i++) {
    const mail = String(kines[i].EMAIL || '').trim();
    if (mail) return mail.toLowerCase();
  }
  return '';
}

/** «ma…a@hospital.cl» — para confirmar a cuál se mandó sin publicarlo entero. */
function _coordEmailOculto(mail) {
  const s = String(mail || '');
  const i = s.indexOf('@');
  if (i < 1) return '(correo no registrado)';
  const u = s.slice(0, i), d = s.slice(i);
  if (u.length <= 2) return u.charAt(0) + '…' + d;
  return u.slice(0, 2) + '…' + u.charAt(u.length - 1) + d;
}

/** Estado público de la puerta: qué caminos de recuperación ofrecer. */
function coordEstado() {
  try {
    return ok({ recuperaCorreo: coordRecuperaPorCorreo() });
  } catch (e) { return ok({ recuperaCorreo: false }); }
}

/**
 * Manda un código de un solo uso al correo de ese usuario.
 * Del código se guarda su HUELLA, nunca el código; y jamás vuelve en la
 * respuesta — si volviera, pedirlo sería suficiente para entrar y el correo
 * no estaría probando nada.
 */
function coordPedirCodigo(datos) {
  try {
    if (!coordRecuperaPorCorreo()) {
      return err('La recuperación por correo está desactivada. Pídele a otra persona de coordinación que te restablezca la clave.', ERR.NO_AUTORIZADO);
    }
    const usuario = _coordUsuarioNorm(datos && datos.usuario);
    const firma = _coordFirmaDe(usuario);
    if (!firma) return err('Usuario o clave incorrectos.', ERR.NO_AUTORIZADO);

    const espera = _coordEsperaRestante(usuario);
    if (espera > 0) return err('Demasiados intentos. Vuelve a probar en ' + espera + ' minuto' + (espera === 1 ? '' : 's') + '.', ERR.NO_AUTORIZADO);

    const mail = _coordEmailDeFirma(firma);
    if (!mail) {
      return err('Ese usuario no tiene correo registrado en KINESIOLOGOS. Pídele a otra persona de coordinación que te restablezca la clave.', ERR.VALIDACION);
    }

    const codigo = _coordCodigo6();
    const sal = Utilities.getUuid();
    CacheService.getScriptCache().put('coordcod_' + usuario,
      JSON.stringify({ h: _coordHuella(usuario, codigo, sal), s: sal, n: 0 }), _COORD_COD_MIN * 60);

    try {
      MailApp.sendEmail({
        to: mail,
        subject: 'RCE-KINE · código para recuperar tu clave',
        body: 'Tu código es ' + codigo + '\n\n' +
              'Sirve una sola vez y vence en ' + _COORD_COD_MIN + ' minutos.\n\n' +
              'Si no pediste este código, ignora el mensaje y avísale a la coordinación: ' +
              'alguien está intentando entrar con tu usuario.\n',
      });
    } catch (e) {
      CacheService.getScriptCache().remove('coordcod_' + usuario);
      console.error('coordPedirCodigo · envío', e);
      return err('No se pudo enviar el correo. Pídele a otra persona de coordinación que te restablezca la clave.', ERR.INTERNO);
    }

    auditar({ email: 'coordinacion', firma: firma, accion: 'COORD_PIDE_CODIGO',
      entidad: 'COORDINACION', idEntidad: usuario, patientId: '', resumen: 'código enviado por correo' });
    return ok({ enviadoA: _coordEmailOculto(mail), minutos: _COORD_COD_MIN });
  } catch (e) { return err('coordPedirCodigo: ' + e.message, ERR.INTERNO, e); }
}

/** Seis dígitos, con el primero distinto de 0 para que no se pierda al dictar. */
function _coordCodigo6() {
  const b = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, Utilities.getUuid());
  let s = '';
  for (let i = 0; i < 6; i++) s += String(Math.abs(b[i]) % 10);
  return (s.charAt(0) === '0' ? '7' : s.charAt(0)) + s.slice(1);
}

/** Con el código válido, la persona fija su clave nueva sin ayuda de nadie. */
function coordRecuperarConCodigo(datos) {
  try {
    if (!coordRecuperaPorCorreo()) {
      return err('La recuperación por correo está desactivada.', ERR.NO_AUTORIZADO);
    }
    const usuario = _coordUsuarioNorm(datos && datos.usuario);
    const codigo = String((datos && datos.codigo) || '').trim();
    const nueva = String((datos && datos.nueva) || '');
    const firma = _coordFirmaDe(usuario);
    if (!firma) return err('Usuario o clave incorrectos.', ERR.NO_AUTORIZADO);
    if (nueva.length < 8) return err('La clave nueva debe tener al menos 8 caracteres.', ERR.VALIDACION);

    const cache = CacheService.getScriptCache();
    const hit = cache.get('coordcod_' + usuario);
    if (!hit) return err('El código venció o no se pidió. Pide uno nuevo.', ERR.NO_AUTORIZADO);
    let est;
    try { est = JSON.parse(hit); } catch (e) { return err('El código venció. Pide uno nuevo.', ERR.NO_AUTORIZADO); }

    if (_coordHuella(usuario, codigo, est.s) !== est.h) {
      est.n = (est.n || 0) + 1;
      if (est.n >= _COORD_COD_INTENTOS) {
        cache.remove('coordcod_' + usuario);
        _coordSumarFallido(usuario);
        auditar({ email: 'coordinacion', firma: firma, accion: 'COORD_CODIGO_AGOTADO',
          entidad: 'COORDINACION', idEntidad: usuario, patientId: '', resumen: 'código invalidado por intentos' });
        return err('Código incorrecto demasiadas veces. Pide uno nuevo.', ERR.NO_AUTORIZADO);
      }
      cache.put('coordcod_' + usuario, JSON.stringify(est), _COORD_COD_MIN * 60);
      return err('Código incorrecto.', ERR.NO_AUTORIZADO);
    }

    cache.remove('coordcod_' + usuario);          // un solo uso, sin excepciones
    _coordGuardarClave(usuario, nueva);
    _coordMarcarTemporal(usuario, false);
    auditar({ email: 'coordinacion', firma: firma, accion: 'COORD_RECUPERA_CLAVE',
      entidad: 'COORDINACION', idEntidad: usuario, patientId: '', resumen: 'recuperó su clave con código por correo' });
    return ok({ firma: firma });
  } catch (e) { return err('coordRecuperarConCodigo: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Chequeo previo a encender el interruptor. Se corre desde el editor: dice si
 * las tres firmas tienen correo y si el envío está permitido — antes de que
 * alguien descubra que no, justo cuando perdió la clave.
 */
function coordDiagnosticoCorreo() {
  const out = ['── Recuperación por correo ──',
    'Interruptor COORD_RECUPERA_CORREO: ' + (coordRecuperaPorCorreo() ? 'ENCENDIDO' : 'apagado')];
  let faltan = 0;
  Object.keys(COORD_USUARIOS).forEach(function (u) {
    const firma = COORD_USUARIOS[u];
    const m = _coordEmailDeFirma(firma);
    if (!m) faltan++;
    out.push('  ' + u + ' (' + firma + '): ' + (m ? m : '⚠️ SIN CORREO en KINESIOLOGOS'));
  });
  try {
    out.push('Correos que quedan hoy en la cuota: ' + MailApp.getRemainingDailyQuota());
  } catch (e) { out.push('⚠️ No se pudo leer la cuota de correo: ' + e.message); }
  if (faltan) out.push('\n⚠️ Faltan ' + faltan + ' correo(s). Con el interruptor encendido, esos usuarios no podrán recuperar su clave por esta vía.');
  console.log(out.join('\n'));
  return out;
}

function coordCambiarClave(datos) {
  try {
    const g = coordExigirSesion(datos && datos.token);
    if (!g.ok) return g;
    const nueva = String((datos && datos.nueva) || '');
    if (nueva.length < 8) return err('La clave nueva debe tener al menos 8 caracteres.', ERR.VALIDACION);
    // Sin sesión temporal hay que confirmar la actual: una sesión olvidada
    // abierta en un box no puede servir para quedarse con la cuenta.
    if (!_coordEsTemporal(g.usuario) && !_coordClaveOk(g.usuario, String((datos && datos.actual) || ''))) {
      return err('La clave actual no coincide.', ERR.NO_AUTORIZADO);
    }
    _coordGuardarClave(g.usuario, nueva);
    _coordMarcarTemporal(g.usuario, false);
    auditar({ email: 'coordinacion', firma: g.firma, accion: 'COORD_CAMBIO_CLAVE',
      entidad: 'COORDINACION', idEntidad: g.usuario, patientId: '', resumen: 'cambió su clave' });
    return ok({ firma: g.firma });
  } catch (e) { return err('coordCambiarClave: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Una de las tres le restablece la clave a otra (D8: sin segundo factor por
 * ahora — se aplazó; el punto de enganche es esta función y solo esta).
 * Devuelve una clave temporal que hay que entregar en persona.
 */
function coordRestablecerClave(datos) {
  try {
    const g = coordExigirSesion(datos && datos.token);
    if (!g.ok) return g;
    const destino = _coordUsuarioNorm(datos && datos.usuario);
    const firmaDestino = _coordFirmaDe(destino);
    if (!firmaDestino) return err('Ese usuario no existe.', ERR.VALIDACION);
    if (destino === g.usuario) return err('Para cambiar tu propia clave usa «Cambiar mi clave».', ERR.VALIDACION);
    const temporal = _coordClaveTemporal();
    _coordGuardarClave(destino, temporal);
    _coordMarcarTemporal(destino, true);
    auditar({ email: 'coordinacion', firma: g.firma, accion: 'COORD_RESTABLECE_CLAVE',
      entidad: 'COORDINACION', idEntidad: destino, patientId: '',
      resumen: g.firma + ' le restableció la clave a ' + firmaDestino + ' (' + destino + ')' });
    return ok({ usuario: destino, firma: firmaDestino, temporal: temporal });
  } catch (e) { return err('coordRestablecerClave: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Clave temporal: 12 caracteres alfanuméricos (pedido de Manuel, 19-ago-2026),
 * agrupados de a 4 para dictarla fácil. Sin I/O/0/1, que se confunden al leer
 * en voz alta. Es de un solo uso: `_coordEsTemporal` obliga a cambiarla en el
 * primer ingreso, con `coordCambiarClave` — la persona la reemplaza por la
 * suya, nadie más vuelve a saberla.
 */
function _coordClaveTemporal() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';  // sin I, O, 0, 1
  let s = '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, Utilities.getUuid());
  for (let i = 0; i < 12; i++) s += abc.charAt(Math.abs(bytes[i]) % abc.length);
  return s.slice(0, 4) + '-' + s.slice(4, 8) + '-' + s.slice(8, 12);
}

/**
 * Siembra las tres claves la PRIMERA vez. Se corre desde el editor, una sola
 * vez, y devuelve las claves temporales para entregarlas en persona.
 * Idempotente: no pisa una clave ya puesta.
 */
function coordSembrarClaves() {
  const out = [];
  Object.keys(COORD_USUARIOS).forEach(function (u) {
    const firma = COORD_USUARIOS[u];
    if (_coordProps().getProperty('coord_hash_' + u)) { out.push(u + ' (' + firma + '): ya tiene clave (no se toca)'); return; }
    const t = _coordClaveTemporal();
    _coordGuardarClave(u, t);
    _coordMarcarTemporal(u, true);
    out.push(u + ' (' + firma + '): ' + t + '  (temporal — la cambia al entrar)');
  });
  console.log('── Claves del modo Coordinación ──\n' + out.join('\n') +
    '\n\nEntrégalas EN PERSONA. No las dejes escritas en un chat ni en la planilla.');
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA MARCA DE ARRASTRE  (D7 — decisión de Manuel, 18-ago-2026)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee las correcciones de una ficha. Formato de cada entrada:
 *   { c: campo, a: valor anterior, n: valor nuevo, f: firma, ts: 'yyyy-MM-dd HH:mm' }
 */
function coordCorrecciones(obj) {
  if (!obj) return [];
  try {
    const j = obj.CORRECCIONES_JSON;
    if (!j) return [];
    const arr = (typeof j === 'string') ? JSON.parse(j) : j;
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

/**
 * ¿Este campo fue corregido por la coordinación?  ← la marca de arrastre.
 *
 * Un campo marcado NO lo pisa el guardado del turno: «normalmente no se
 * modifica, así que no debería poder modificarla» (Manuel, 18-ago-2026).
 * Lo consulta svc_evoluciones antes de reescribir una fecha semilla.
 */
function coordCampoCorregido(obj, campo) {
  const arr = coordCorrecciones(obj);
  for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].c === campo) return true;
  return false;
}

/**
 * Suelta la marca de un campo. Se usa cuando arranca un TRAMO CLÍNICO NUEVO
 * de verdad — el paciente pasó de VM a VNI, o de TOT a TQT — porque entonces
 * la fecha corregida ya no describe ese tramo y congelarla sería peor que el
 * error original.
 */
function coordSoltarMarca(hoja, colKey, id, obj, campo) {
  const arr = coordCorrecciones(obj).filter(function (x) { return !x || x.c !== campo; });
  const campos = {};
  campos.CORRECCIONES_JSON = arr.length ? JSON.stringify(arr) : '';
  try { repoActualizar(hoja, colKey, id, campos); } catch (e) { console.warn('coordSoltarMarca: ' + e.message); }
  return arr;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORREGIR UNA FICHA
// ─────────────────────────────────────────────────────────────────────────────

/** Ubica al paciente por PATIENT_ID: primero en cama, después en el archivo. */
function _coordUbicar(patientId, idCama) {
  const pid = String(patientId || '').trim();
  if (pid) {
    const camas = repoLeerTodos('CAMAS_ESTADO');
    for (let i = 0; i < camas.length; i++) {
      if (esVerdadero(camas[i].OCUPADA) && String(camas[i].PATIENT_ID || '') === pid) {
        return { tipo: 'activo', hoja: 'CAMAS_ESTADO', colKey: 'ID_CAMA', id: String(camas[i].ID_CAMA), obj: camas[i] };
      }
    }
    const arch = repoLeerTodos('ARCHIVO_PACIENTES');
    for (let j = 0; j < arch.length; j++) {
      if (String(arch[j].PATIENT_ID || '') === pid) {
        return { tipo: 'egresado', hoja: 'ARCHIVO_PACIENTES', colKey: 'ID_ARCHIVO', id: String(arch[j].ID_ARCHIVO), obj: arch[j] };
      }
    }
  }
  if (idCama) {
    const c = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(idCama));
    if (c && esVerdadero(c.OCUPADA)) {
      return { tipo: 'activo', hoja: 'CAMAS_ESTADO', colKey: 'ID_CAMA', id: String(c.ID_CAMA), obj: c };
    }
  }
  return null;
}

/** Valida un valor contra el tipo declarado en COORD_CAMPOS. */
function _coordValidar(campo, meta, valor) {
  const v = String(valor == null ? '' : valor).trim();
  if (meta.tipo === 'fecha') {
    if (v === '') return { ok: true, valor: '' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: meta.etiqueta + ': la fecha debe ser AAAA-MM-DD.' };
    const d = new Date(v + 'T12:00:00');
    if (isNaN(d.getTime())) return { ok: false, error: meta.etiqueta + ': esa fecha no existe.' };
    return { ok: true, valor: v };
  }
  if (meta.tipo === 'entero') {
    if (v === '') return { ok: true, valor: '' };
    if (!/^\d{1,3}$/.test(v)) return { ok: false, error: meta.etiqueta + ': debe ser un número entero.' };
    return { ok: true, valor: parseInt(v, 10) };
  }
  if (meta.tipo === 'rut') {
    if (v === '') return { ok: true, valor: '' };   // el RUT es opcional
    if (typeof rutValido === 'function' && !rutValido(v)) {
      return { ok: false, error: 'El RUT no es válido (dígito verificador).' };
    }
    return { ok: true, valor: (typeof _rutNormal === 'function') ? _rutNormal(v) : v };
  }
  return { ok: true, valor: v };
}

/** Hora del par de una fecha semilla, si viene declarada. */
function _coordHoraValida(h) {
  const s = String(h || '').trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : '';
}

/**
 * Recalcula los días que dependen de las fechas. Con `diasEntre` — días de
 * CALENDARIO, como la lista oficial del hospital (BUDA). NO con bloques de
 * 24 h: eso fue la v5.19 y se revirtió en la v5.37 porque despegaba la app del
 * papel que el equipo lee en la reunión.
 *
 * Solo tiene efecto en un EGRESADO: en un activo los días ya se calculan solos
 * cada vez que se miran. En el archivo están congelados desde el alta — y ese
 * congelamiento es justo el origen del caso que motivó todo esto.
 */
function _coordRecalcularDias(ubic, campos) {
  if (ubic.tipo !== 'egresado') return {};
  const a = ubic.obj;
  const ing = campos.FECHA_INGRESO !== undefined ? campos.FECHA_INGRESO : a.FECHA_INGRESO;
  const egr = campos.FECHA_EGRESO  !== undefined ? campos.FECHA_EGRESO  : a.FECHA_EGRESO;
  const iso = function (x) { const s = String(x || ''); return s ? s.slice(0, 10) : ''; };
  const out = {};
  if (iso(ing) && iso(egr)) {
    out.DIAS_TOTAL = diasEntre(iso(ing), iso(egr));
    if (a.DIAS_VM_TOTAL !== '' && a.DIAS_VM_TOTAL != null) {
      // Los días de VM del archivo no guardan su fecha de inicio, así que no se
      // pueden re-derivar: se dejan como están y se dice, en vez de inventar.
      out._avisoVM = true;
    }
  }
  return out;
}

/**
 * Corrige campos de una ficha (activa o archivada).
 *
 * Promesas que cumple, en este orden:
 *   1. sesión viva verificada en el SERVIDOR
 *   2. lista blanca: nada fuera de COORD_CAMPOS se escribe
 *   3. validación por tipo
 *   4. los días siguen a sus fechas
 *   5. sello visible + AUDIT_LOG, con la firma de QUIEN entró
 */
function coordCorregirFicha(datos) {
  try {
    const g = coordExigirSesion(datos && datos.token);
    if (!g.ok) return g;

    const ubic = _coordUbicar(datos && datos.patientId, datos && datos.idCama);
    if (!ubic) return err('No se encontró ese paciente, ni en cama ni en el archivo.', ERR.NO_ENCONTRADO);

    const cambios = (datos && datos.cambios) || {};
    const horas   = (datos && datos.horas) || {};
    const campos = {}, aplicados = [];

    for (const campo in cambios) {
      if (!Object.prototype.hasOwnProperty.call(cambios, campo)) continue;
      const meta = COORD_CAMPOS[campo];
      if (!meta) return err('El campo «' + campo + '» no se puede corregir desde aquí.', ERR.VALIDACION);
      if (meta.soloArchivo && ubic.tipo !== 'egresado') {
        return err(meta.etiqueta + ' solo existe en un paciente que ya egresó.', ERR.VALIDACION);
      }
      const v = _coordValidar(campo, meta, cambios[campo]);
      if (!v.ok) return err(v.error, ERR.VALIDACION);

      const antes = String(ubic.obj[campo] == null ? '' : ubic.obj[campo]);
      const antesN = (meta.tipo === 'fecha') ? antes.slice(0, 10) : antes;
      if (String(v.valor) === antesN) continue;   // sin cambio: no se escribe ni se sella

      campos[campo] = v.valor;
      aplicados.push({ c: campo, a: antesN, n: String(v.valor), f: g.firma, ts: _tsAhora() });

      // La marca de hora viaja pegada a su fecha: corregir el día y dejar la
      // hora vieja deja el momento a medio corregir.
      if (meta.ts) {
        const h = _coordHoraValida(horas[campo]);
        if (v.valor === '') campos[meta.ts] = '';
        else if (h) campos[meta.ts] = String(v.valor) + ' ' + h;
        else {
          const tsAnt = String(ubic.obj[meta.ts] || '');
          const hAnt = tsAnt.length >= 16 ? tsAnt.slice(11, 16) : '08:00';
          campos[meta.ts] = String(v.valor) + ' ' + hAnt;
        }
      }
    }

    if (!aplicados.length) return ok({ sinCambios: true, tipo: ubic.tipo });

    // Las fechas nunca pueden quedar al revés, se hayan tocado ahora o antes.
    const fIng = String(campos.FECHA_INGRESO !== undefined ? campos.FECHA_INGRESO : (ubic.obj.FECHA_INGRESO || '')).slice(0, 10);
    const fEgr = String(campos.FECHA_EGRESO  !== undefined ? campos.FECHA_EGRESO  : (ubic.obj.FECHA_EGRESO  || '')).slice(0, 10);
    if (fIng && fEgr && fIng > fEgr) {
      return err('La fecha de ingreso (' + fIng + ') no puede ser posterior a la de egreso (' + fEgr + ').', ERR.VALIDACION);
    }

    const recalc = _coordRecalcularDias(ubic, campos);
    const avisoVM = !!recalc._avisoVM; delete recalc._avisoVM;
    for (const k in recalc) if (Object.prototype.hasOwnProperty.call(recalc, k)) campos[k] = recalc[k];

    // Sello visible + marca de arrastre: la misma columna sirve para las dos.
    const previas = coordCorrecciones(ubic.obj);
    campos.CORRECCIONES_JSON = JSON.stringify(previas.concat(aplicados));

    repoActualizar(ubic.hoja, ubic.colKey, ubic.id, campos);

    aplicados.forEach(function (x) {
      auditar({ email: 'coordinacion', firma: g.firma, accion: 'COORD_CORRIGE_FICHA',
        entidad: ubic.hoja, idEntidad: ubic.id, patientId: String(ubic.obj.PATIENT_ID || ''),
        resumen: (COORD_CAMPOS[x.c] ? COORD_CAMPOS[x.c].etiqueta : x.c) + ': «' + x.a + '» → «' + x.n + '»' });
    });

    return ok({
      tipo: ubic.tipo, idCama: ubic.tipo === 'activo' ? ubic.id : '',
      patientId: String(ubic.obj.PATIENT_ID || ''),
      corregidos: aplicados.length,
      diasTotal: (recalc.DIAS_TOTAL !== undefined) ? recalc.DIAS_TOTAL : null,
      avisoVM: avisoVM,
      correcciones: previas.concat(aplicados),
      accion: 'corregir_ficha', entidad: ubic.hoja,
    });
  } catch (e) { return err('coordCorregirFicha: ' + e.message, ERR.INTERNO, e); }
}

/** Ficha completa para el panel: valores actuales, qué se puede tocar y el historial. */
function coordFicha(datos) {
  try {
    const g = coordExigirSesion(datos && datos.token);
    if (!g.ok) return g;
    const ubic = _coordUbicar(datos && datos.patientId, datos && datos.idCama);
    if (!ubic) return err('No se encontró ese paciente, ni en cama ni en el archivo.', ERR.NO_ENCONTRADO);

    const o = ubic.obj, campos = [];
    for (const c in COORD_CAMPOS) {
      if (!Object.prototype.hasOwnProperty.call(COORD_CAMPOS, c)) continue;
      const meta = COORD_CAMPOS[c];
      if (meta.soloArchivo && ubic.tipo !== 'egresado') continue;
      const val = o[c] == null ? '' : String(o[c]);
      const tsv = meta.ts ? String(o[meta.ts] || '') : '';
      campos.push({
        campo: c, etiqueta: meta.etiqueta, tipo: meta.tipo,
        valor: (meta.tipo === 'fecha') ? val.slice(0, 10) : val,
        hora: tsv.length >= 16 ? tsv.slice(11, 16) : '',
        corregido: coordCampoCorregido(o, c),
      });
    }
    return ok({
      tipo: ubic.tipo, idCama: ubic.tipo === 'activo' ? ubic.id : String(o.CAMA_ORIGEN || ''),
      patientId: String(o.PATIENT_ID || ''), nombre: String(o.NOMBRE || ''),
      dias: ubic.tipo === 'egresado' ? o.DIAS_TOTAL : null,
      campos: campos, correcciones: coordCorrecciones(o),
    });
  } catch (e) { return err('coordFicha: ' + e.message, ERR.INTERNO, e); }
}
