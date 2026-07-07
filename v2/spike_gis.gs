/**
 * spike_gis.gs — SPIKE TEMPORAL para validar Google Sign-In dentro del iframe
 * de la Web App de Apps Script. NO es parte del app final: cuando se confirme
 * (o se decida el fallback popup), este doGet se reemplaza por el real.
 *
 * Requisito: pegar el OAuth Client ID (Web) en CONFIG.OAUTH_CLIENT_ID.
 */

function doGet() {
  const t = HtmlService.createTemplateFromFile('spike_gis');
  t.clientId = configVal('OAUTH_CLIENT_ID');
  return t.evaluate()
    .setTitle('Spike GIS · RCE-KINE')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/** Recibe el ID token del frontend y lo verifica en el backend. */
function spikeVerificarToken(idToken) {
  const claims = verificarToken(idToken);
  if (!claims) {
    return { ok: false, error: 'Token no válido, o OAUTH_CLIENT_ID en CONFIG no coincide con el del token.' };
  }
  const firma = firmaDeEmail(claims.email);
  return {
    ok: true,
    email: claims.email,
    nombre: claims.name || '',
    firma: firma || '(email no registrado en KINESIOLOGOS)',
  };
}
