/**
 * svc_docs.gs — Documentos de la unidad anclados a la portada.
 *
 * Una carpeta de Drive («RCE-KINE — Documentos de la unidad», auto-creada al
 * primer uso con subcarpetas «Imprimibles» y «Protocolos»; su ID queda en
 * CONFIG.DOCS_FOLDER) alimenta el modal 📂 Documentos del Registro Diario.
 * El equipo sube/ordena los archivos directamente en Drive; la app solo LISTA
 * y enlaza (no sube ni borra nada). La lista se cachea 5 minutos.
 */

function _docsCarpeta() {
  const id = leerConfig('DOCS_FOLDER', '');
  if (id) {
    try { return DriveApp.getFolderById(id); }
    catch (e) { /* carpeta borrada o sin acceso: se crea una nueva abajo */ }
  }
  const f = DriveApp.createFolder('RCE-KINE — Documentos de la unidad');
  f.createFolder('Imprimibles');
  f.createFolder('Protocolos');
  escribirConfig('DOCS_FOLDER', f.getId());
  return f;
}

function obtenerDocumentos(refrescar) {
  try {
    const cache = CacheService.getScriptCache();
    if (!refrescar) {
      const c = cache.get('DOCS_LISTA');
      if (c) return ok(JSON.parse(c));
    }
    const raiz = _docsCarpeta();
    const grupos = [];
    const sub = raiz.getFolders();
    while (sub.hasNext()) {
      const s = sub.next();
      grupos.push({ nombre: s.getName(), url: s.getUrl(), archivos: _docsArchivos(s) });
    }
    grupos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const sueltos = _docsArchivos(raiz);
    if (sueltos.length) grupos.push({ nombre: 'Otros documentos', url: raiz.getUrl(), archivos: sueltos });
    const data = { carpetaUrl: raiz.getUrl(), grupos: grupos };
    cache.put('DOCS_LISTA', JSON.stringify(data), 300);
    return ok(data);
  } catch (e) { return err('obtenerDocumentos: ' + e.message, ERR.INTERNO, e); }
}

function _docsArchivos(carpeta) {
  const tz = leerConfig('TIMEZONE', 'America/Santiago');
  const out = [];
  const it = carpeta.getFiles();
  while (it.hasNext() && out.length < 100) {
    const f = it.next();
    out.push({
      nombre: f.getName(), url: f.getUrl(), mime: f.getMimeType(),
      actualizado: Utilities.formatDate(f.getLastUpdated(), tz, 'dd-MM-yyyy'),
    });
  }
  out.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  return out;
}
