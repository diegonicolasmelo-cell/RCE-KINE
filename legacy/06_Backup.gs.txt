/**
 * ============================================================
 *  09_Backup.gs — Respaldo diario automático a Google Drive
 *  RCE KINE UCIA | GAS-v1.2 (auto-crear carpeta)
 *
 *  CAMBIOS v1.2:
 *  ★ Auto-crea la carpeta de backups la primera vez.
 *  ★ Guarda el ID generado en ScriptProperties (no se pierde).
 *  ★ Ya NO requiere pegar el ID a mano.
 *
 *  USO:
 *  1) Pega este archivo en Apps Script (reemplaza el anterior).
 *  2) Ejecuta backupDiario() una vez — autoriza Drive.
 *  3) La primera ejecución crea la carpeta automáticamente
 *     en "Mi Drive" → "RCE_KINE_backups".
 *  4) Configura el trigger diario (instrucciones al final).
 * ============================================================
 */
 
// Nombre de la carpeta que se creará automáticamente en tu Drive
const BACKUP_FOLDER_NAME    = 'RCE_KINE_backups';
const BACKUP_MAX_HISTORIA   = 30;
const BACKUP_PROP_FOLDER_ID = 'BACKUP_FOLDER_ID'; // clave en ScriptProperties
 
 
/**
 * Devuelve la carpeta de backups, creándola si no existe.
 * Cachea el ID en ScriptProperties para futuras ejecuciones.
 */
function _obtenerCarpetaBackup() {
  const props = PropertiesService.getScriptProperties();
  let folderId = props.getProperty(BACKUP_PROP_FOLDER_ID);
 
  // 1) ¿Hay ID guardado? Verificar que la carpeta exista
  if (folderId) {
    try {
      const carpeta = DriveApp.getFolderById(folderId);
      // ¿Está en papelera? → crear nueva
      if (carpeta.isTrashed()) {
        console.warn('Carpeta de backups en papelera. Creando nueva.');
        folderId = null;
      } else {
        return carpeta;
      }
    } catch (e) {
      console.warn('ID guardado inválido, creando nueva carpeta.');
      folderId = null;
    }
  }
 
  // 2) Buscar por nombre en raíz (por si la creaste manualmente)
  const existentes = DriveApp.getRootFolder().getFoldersByName(BACKUP_FOLDER_NAME);
  if (existentes.hasNext()) {
    const carpeta = existentes.next();
    props.setProperty(BACKUP_PROP_FOLDER_ID, carpeta.getId());
    console.log(`📁 Carpeta encontrada: ${carpeta.getName()} (${carpeta.getId()})`);
    return carpeta;
  }
 
  // 3) Crear nueva
  const nueva = DriveApp.createFolder(BACKUP_FOLDER_NAME);
  props.setProperty(BACKUP_PROP_FOLDER_ID, nueva.getId());
  console.log(`✨ Carpeta de backups creada: ${nueva.getName()} (${nueva.getId()})`);
  console.log(`   URL: ${nueva.getUrl()}`);
  return nueva;
}
 
 
/**
 * Función principal — ejecutar diariamente vía trigger.
 */
function backupDiario() {
  try {
    const ss      = SpreadsheetApp.getActiveSpreadsheet();
    const carpeta = _obtenerCarpetaBackup();
    const fecha   = Utilities.formatDate(new Date(), 'America/Santiago', 'yyyy-MM-dd_HH-mm');
    const nombre  = `RCE_KINE_backup_${fecha}`;
 
    // Crear copia
    const copia = DriveApp.getFileById(ss.getId()).makeCopy(nombre, carpeta);
    console.log(`✅ Backup creado: ${copia.getName()}`);
    console.log(`   URL: ${copia.getUrl()}`);
 
    // Rotar (mantener solo los últimos N)
    _rotarBackups(carpeta, BACKUP_MAX_HISTORIA);
 
    // Actualizar CONFIG con timestamp (si existe)
    _actualizarTimestampBackup(timestampAhora());
 
    return ok({
      nombre:  copia.getName(),
      id:      copia.getId(),
      url:     copia.getUrl(),
      fecha:   timestampAhora(),
      carpeta: carpeta.getUrl(),
    });
  } catch (e) {
    console.error('backupDiario error:', e);
    return err('backupDiario: ' + e.message, e);
  }
}
 
 
/**
 * Elimina backups más viejos que los últimos N.
 */
function _rotarBackups(carpeta, maxHistoria) {
  try {
    const archivos = carpeta.getFilesByType(MimeType.GOOGLE_SHEETS);
    const lista = [];
    while (archivos.hasNext()) {
      const f = archivos.next();
      if (f.getName().startsWith('RCE_KINE_backup_')) {
        lista.push({ file: f, created: f.getDateCreated() });
      }
    }
    // Más nuevos primero
    lista.sort((a, b) => b.created - a.created);
 
    const aEliminar = lista.slice(maxHistoria);
    aEliminar.forEach(item => {
      try {
        item.file.setTrashed(true);
        console.log(`🗑️  Backup rotado: ${item.file.getName()}`);
      } catch (e) {
        console.warn('No se pudo eliminar backup:', e.message);
      }
    });
  } catch (e) {
    console.warn('_rotarBackups error:', e.message);
  }
}
 
 
/**
 * Escribe el timestamp del último backup en CONFIG.
 * Silencioso si la hoja/fila no existe.
 */
function _actualizarTimestampBackup(ts) {
  try {
    const h = obtenerHoja(SH.CONFIG);
    const fila = buscarFila(h, 1, 'ULTIMO_BACKUP', 2);
    if (fila !== -1) {
      h.getRange(fila, 2).setValue(ts);
    }
  } catch (e) {
    console.warn('No se pudo actualizar timestamp de backup:', e.message);
  }
}
 
 
/**
 * Lista los backups existentes con sus fechas (útil para auditoría).
 */
function listarBackups() {
  try {
    const carpeta  = _obtenerCarpetaBackup();
    const archivos = carpeta.getFilesByType(MimeType.GOOGLE_SHEETS);
    const lista = [];
    while (archivos.hasNext()) {
      const f = archivos.next();
      if (f.getName().startsWith('RCE_KINE_backup_')) {
        lista.push({
          nombre:  f.getName(),
          id:      f.getId(),
          url:     f.getUrl(),
          creado:  Utilities.formatDate(f.getDateCreated(), 'America/Santiago', 'yyyy-MM-dd HH:mm:ss'),
          tamano:  f.getSize(),
        });
      }
    }
    lista.sort((a, b) => b.creado.localeCompare(a.creado));
    console.log(`📋 ${lista.length} backups en la carpeta.`);
    console.log(`   Ubicación: ${carpeta.getUrl()}`);
    lista.forEach(b => console.log(`  · ${b.nombre} (${b.creado})`));
    return ok(lista);
  } catch (e) {
    return err('listarBackups: ' + e.message, e);
  }
}
 
 
/**
 * Devuelve info de la carpeta de backups (útil para diagnóstico).
 */
function infoCarpetaBackup() {
  try {
    const carpeta = _obtenerCarpetaBackup();
    const info = {
      id:     carpeta.getId(),
      nombre: carpeta.getName(),
      url:    carpeta.getUrl(),
    };
    console.log('Carpeta de backups:', JSON.stringify(info, null, 2));
    return ok(info);
  } catch (e) {
    return err('infoCarpetaBackup: ' + e.message, e);
  }
}
 
 
/**
 * Forzar reset del ID guardado (si quieres apuntar a otra carpeta).
 * Después de esto, la próxima ejecución creará o detectará la carpeta de nuevo.
 */
function resetCarpetaBackup() {
  PropertiesService.getScriptProperties().deleteProperty(BACKUP_PROP_FOLDER_ID);
  console.log('🔄 ID de carpeta reseteado. Próxima ejecución creará/buscará "RCE_KINE_backups".');
  return ok({ accion: 'reset' });
}
 
 
/**
 * Restaurar desde un backup (manual).
 * Crea una COPIA del backup como sheet nuevo — no sobreescribe nada.
 */
function restaurarDesdeBackup(idBackup) {
  try {
    const archivo = DriveApp.getFileById(idBackup);
    const carpeta = _obtenerCarpetaBackup();
    const copia = archivo.makeCopy(
      'RCE_KINE_RESTAURADO_' + fechaHoyISO(),
      carpeta
    );
    console.log(`✅ Restauración manual creada: ${copia.getUrl()}`);
    return ok({ url: copia.getUrl(), nombre: copia.getName() });
  } catch (e) {
    return err('restaurarDesdeBackup: ' + e.message, e);
  }
}
 
 
/* ============================================================
 *  TRIGGER — configuración (1 sola vez)
 *
 *  Apps Script → ⏰ Activadores → + Agregar activador
 *    Función:                backupDiario
 *    Implementación:          Encabezado
 *    Origen del evento:       Cronómetro
 *    Tipo de cronómetro:      Activador diario
 *    Hora del día:            3 a.m. – 4 a.m.
 *
 *  Para verificar después:
 *    - Ejecutar infoCarpetaBackup() → muestra dónde quedó la carpeta
 *    - Ejecutar listarBackups() → muestra todos los backups acumulados
 * ============================================================ */
 