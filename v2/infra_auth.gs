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

/** Firma clínica activa asociada a un email (1:1), o null. */
function firmaDeEmail(email) {
  if (!email) return null;
  const kines = repoLeerTodos('KINESIOLOGOS', 'EMAIL', String(email).toLowerCase())
    .filter(k => esVerdadero(k.ACTIVO));
  return kines.length ? String(kines[0].FIRMA) : null;
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
