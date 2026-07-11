/**
 * webapp.gs — Punto de entrada único de la Web App.
 * doGet sirve la app (index). Con ?page=spike sirve el spike de GIS.
 */
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || '';
  if (page === 'spike') return _paginaSpike();
  // index se sirve como TEMPLATE para inyectar el OAUTH_CLIENT_ID (login GIS).
  const t = HtmlService.createTemplateFromFile('index');
  t.clientId = configVal('OAUTH_CLIENT_ID', '');
  return t.evaluate()
    .setTitle('RCE-KINE · UCI')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}
