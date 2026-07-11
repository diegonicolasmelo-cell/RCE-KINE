/**
 * svc_backup.gs — Respaldo diario automático a Google Drive.
 *
 * Crea una copia completa de la planilla en la carpeta "RCE_KINE_backups"
 * (auto-creada en Mi Drive la primera vez; su ID queda en ScriptProperties)
 * y rota el historial manteniendo los últimos CONFIG.BACKUP_MAX_DIARIOS.
 *
 * PUESTA EN MARCHA (una sola vez, desde el editor de Apps Script):
 *   1) Ejecutar `instalarTriggerBackup` y autorizar Drive → instala el
 *      activador diario (03-04 AM) y corre el primer backup de prueba.
 *   2) Verificar con `listarBackups()`.
 * Restaurar: `restaurarDesdeBackup(idBackup)` crea una COPIA del respaldo
 * (nunca sobreescribe la planilla activa).
 */

const BACKUP_FOLDER_NAME = 'RCE_KINE_backups';
const BACKUP_PROP_FOLDER_ID = 'BACKUP_FOLDER_ID';

/** Carpeta de backups (la crea si no existe; cachea el ID en ScriptProperties). */
function _obtenerCarpetaBackup() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty(BACKUP_PROP_FOLDER_ID);
  if (folderId) {
    try {
      const carpeta = DriveApp.getFolderById(folderId);
      if (!carpeta.isTrashed()) return carpeta;
      console.warn('Carpeta de backups en papelera. Creando nueva.');
    } catch (e) { console.warn('ID de carpeta guardado inválido, creando nueva.'); }
  }
  const existentes = DriveApp.getRootFolder().getFoldersByName(BACKUP_FOLDER_NAME);
  if (existentes.hasNext()) {
    const carpeta = existentes.next();
    props.setProperty(BACKUP_PROP_FOLDER_ID, carpeta.getId());
    return carpeta;
  }
  const nueva = DriveApp.createFolder(BACKUP_FOLDER_NAME);
  props.setProperty(BACKUP_PROP_FOLDER_ID, nueva.getId());
  console.log('✨ Carpeta de backups creada: ' + nueva.getUrl());
  return nueva;
}

/** Función principal — la ejecuta el activador diario. */
function backupDiario() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const carpeta = _obtenerCarpetaBackup();
    const fecha = Utilities.formatDate(new Date(), leerConfig('TIMEZONE', 'America/Santiago'), 'yyyy-MM-dd_HH-mm');
    const copia = DriveApp.getFileById(ss.getId()).makeCopy('RCE_KINE_backup_' + fecha, carpeta);
    console.log('✅ Backup creado: ' + copia.getName());

    const max = parseInt(leerConfig('BACKUP_MAX_DIARIOS', '30')) || 30;
    _rotarBackups(carpeta, max);
    _setConfig('ULTIMO_BACKUP', ahoraTS());

    return ok({ nombre: copia.getName(), id: copia.getId(), url: copia.getUrl(), carpeta: carpeta.getUrl() });
  } catch (e) { return err('backupDiario: ' + e.message, ERR.INTERNO, e); }
}

/** Elimina backups más antiguos que los últimos N. */
function _rotarBackups(carpeta, maxHistoria) {
  try {
    const archivos = carpeta.getFilesByType(MimeType.GOOGLE_SHEETS);
    const lista = [];
    while (archivos.hasNext()) {
      const f = archivos.next();
      if (f.getName().indexOf('RCE_KINE_backup_') === 0) lista.push({ file: f, created: f.getDateCreated() });
    }
    lista.sort(function (a, b) { return b.created - a.created; });
    lista.slice(maxHistoria).forEach(function (item) {
      try { item.file.setTrashed(true); console.log('🗑️ Backup rotado: ' + item.file.getName()); }
      catch (e) { console.warn('No se pudo rotar backup:', e.message); }
    });
  } catch (e) { console.warn('_rotarBackups:', e.message); }
}

/** Escribe/actualiza una clave de CONFIG (silencioso si no existe la hoja). */
function _setConfig(clave, valor) {
  try {
    const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('CONFIG');
    if (!h || h.getLastRow() < 2) return;
    const vals = h.getRange(2, 1, h.getLastRow() - 1, 1).getValues();
    for (let i = 0; i < vals.length; i++) {
      if (String(vals[i][0]).trim() === clave) { h.getRange(i + 2, 2).setValue(valor); return; }
    }
    h.appendRow([clave, valor]);
  } catch (e) { console.warn('_setConfig:', e.message); }
}

/**
 * Instala el activador diario del backup (03-04 AM) y corre un backup de
 * prueba. Ejecutar UNA VEZ desde el editor (autoriza Drive + triggers).
 * Es idempotente: si el activador ya existe, no lo duplica.
 */
function instalarTriggerBackup() {
  const yaExiste = ScriptApp.getProjectTriggers()
    .some(function (t) { return t.getHandlerFunction() === 'backupDiario'; });
  if (!yaExiste) {
    ScriptApp.newTrigger('backupDiario').timeBased().everyDays(1).atHour(3).create();
    console.log('⏰ Activador diario instalado (03-04 AM).');
  } else {
    console.log('⏰ El activador diario ya estaba instalado.');
  }
  const r = backupDiario();
  console.log(r.ok ? ('✅ Backup de prueba OK → ' + r.data.url) : ('❌ ' + r.error));
  return r;
}

/** Lista los backups existentes (auditoría). */
function listarBackups() {
  try {
    const carpeta = _obtenerCarpetaBackup();
    const archivos = carpeta.getFilesByType(MimeType.GOOGLE_SHEETS);
    const lista = [];
    while (archivos.hasNext()) {
      const f = archivos.next();
      if (f.getName().indexOf('RCE_KINE_backup_') !== 0) continue;
      lista.push({ nombre: f.getName(), id: f.getId(), url: f.getUrl(),
        creado: Utilities.formatDate(f.getDateCreated(), leerConfig('TIMEZONE', 'America/Santiago'), 'yyyy-MM-dd HH:mm'),
        tamano: f.getSize() });
    }
    lista.sort(function (a, b) { return b.creado.localeCompare(a.creado); });
    console.log('📋 ' + lista.length + ' backups en ' + carpeta.getUrl());
    lista.forEach(function (b) { console.log('  · ' + b.nombre + ' (' + b.creado + ')'); });
    return ok(lista);
  } catch (e) { return err('listarBackups: ' + e.message, ERR.INTERNO, e); }
}

/** Restaura desde un backup creando una COPIA nueva (no sobreescribe nada). */
function restaurarDesdeBackup(idBackup) {
  try {
    const archivo = DriveApp.getFileById(idBackup);
    const copia = archivo.makeCopy('RCE_KINE_RESTAURADO_' + hoyISO(), _obtenerCarpetaBackup());
    console.log('✅ Restauración manual creada: ' + copia.getUrl());
    return ok({ url: copia.getUrl(), nombre: copia.getName() });
  } catch (e) { return err('restaurarDesdeBackup: ' + e.message, ERR.INTERNO, e); }
}
