/**
 * webapp.gs — Punto de entrada único de la Web App.
 * doGet sirve la app (index). Con ?page=spike sirve el spike de GIS.
 */
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || '';
  if (page === 'spike') return _paginaSpike();
  // v2.1: index se sirve como ARCHIVO PLANO (sin plantilla ni scriptlets).
  // La compilación de plantillas demostró romper el arranque en el bootstrap
  // de Google (/dev): el OAUTH_CLIENT_ID ahora se pide en runtime con la
  // acción pública GET_LOGIN_INFO, así el HTML viaja intacto byte a byte.
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('RCE-KINE · UCI')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}
