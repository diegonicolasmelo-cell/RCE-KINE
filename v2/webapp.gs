/**
 * webapp.gs — Punto de entrada único de la Web App.
 * doGet sirve la app (index). Con ?page=spike sirve el spike de GIS.
 */
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || '';
  if (page === 'spike') return _paginaSpike();
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('RCE-KINE · UCI')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}
