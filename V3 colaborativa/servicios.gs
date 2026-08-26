/**
 * servicios.gs — TODOS los servicios en un solo archivo (fusión de los 16 svc_*.gs).
 * En Apps Script los archivos comparten un único espacio global, así que esta
 * fusión es puramente organizativa: mismo código, menos pegado.
 */


// ════════════════════════════════════════════════════════════════════
// ── svc_auditoria.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_auditoria.gs — Control de calidad del registro (solo lectura).
 * Recorre los episodios ACTIVOS (pacientes ingresados) y detecta:
 *   1. huecos      — turnos sin evolución dentro del episodio + atraso del último registro
 *   2. transicion  — cambios de vía aérea/soporte entre turnos sin evento que los explique
 *   3. evaluacion  — cooperador sin MRC/FSS o con evaluación envejecida (EVAL_DIAS_ALERTA)
 *   4. pve         — candidato a PVE con racha de turnos sin PVE (PVE_TURNOS_ALERTA)
 *   5. clones      — parámetros idénticos N turnos seguidos (evolución fantasma)
 * Es la red de seguridad de las defensas en línea (avisos del panel/entrega):
 * mide lo que igual se escapó. No modifica ninguna hoja.
 */

/** Turno siguiente a una TURNO_KEY: Dia→Noche mismo día; Noche→Dia del día siguiente. */
function _audTurnoSiguiente(key) {
  const p = String(key).split('-');           // [yyyy, mm, dd, turno]
  const fecha = p[0] + '-' + p[1] + '-' + p[2];
  if (p[3] === 'Dia') return fecha + '-Noche';
  const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
  d.setDate(d.getDate() + 1);
  const pad = function (n) { return ('0' + n).slice(-2); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '-Dia';
}

/** Estado final de un turno: campos *_FINAL si el evento los dejó; si no, el estado registrado. */
function _audFin(e, base, fin) {
  const f = e[fin];
  return (f !== undefined && f !== null && f !== '') ? f : (e[base] || '');
}

function auditoriaCalidad() {
  try {
    const hoy = hoyISO();
    const cutEval = parseInt(leerConfig('EVAL_DIAS_ALERTA', '5')) || 5;
    const cutPve = parseInt(leerConfig('PVE_TURNOS_ALERTA', '2')) || 2;
    const inv = function (x) { return x === 'TOT' || x === 'TQT'; };

    const camas = repoLeerTodos('CAMAS_ESTADO').filter(function (c) { return esVerdadero(c.OCUPADA); });
    const evosAll = repoLeerTodos('EVOLUCIONES');
    const porPid = {};
    evosAll.forEach(function (e) {
      if (e.PATIENT_ID) (porPid[e.PATIENT_ID] = porPid[e.PATIENT_ID] || []).push(e);
    });

    // Huella de mediciones para detectar clones (mismos campos que la réplica marca en ámbar)
    const HUELLA = ['VENT_FIO2', 'VENT_PEEP', 'VENT_VT', 'VENT_FR', 'VENT_SPO2', 'VENT_PS',
      'VENT_IPAP', 'VENT_EPAP', 'SED_TIPO', 'SED_SAS', 'HEMO_ESTADO', 'HEMO_DVA'];
    const huella = function (e) {
      const vals = HUELLA.map(function (k) { return (e[k] === undefined || e[k] === null) ? '' : String(e[k]); });
      return vals.join('|') === '|||||||||||' ? '' : vals.join('|');   // '' = sin mediciones
    };

    const resumen = { huecos: 0, transicion: 0, evaluacion: 0, pve: 0, clones: 0, texto: 0 };
    const filas = [];

    camas.forEach(function (c) {
      const h = [];   // hallazgos de esta cama: {tipo, sev:'rojo'|'ambar', texto}
      const add = function (tipo, sev, texto) { h.push({ tipo: tipo, sev: sev, texto: texto }); resumen[tipo]++; };
      const evos = (porPid[c.PATIENT_ID] || []).slice()
        .sort(function (a, b) { return String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)); });

      // ── 1) Huecos: turnos faltantes ENTRE registros + atraso del último ──
      if (!evos.length) {
        if (c.FECHA_INGRESO && diasEntre(c.FECHA_INGRESO, hoy) >= 1)
          add('huecos', 'rojo', 'Ingresado el ' + String(c.FECHA_INGRESO).slice(0, 10) + ' sin ninguna evolución del episodio');
      } else {
        let faltantes = [];
        for (let i = 1; i < evos.length; i++) {
          let k = _audTurnoSiguiente(evos[i - 1].TURNO_KEY), tope = 0;
          while (k < String(evos[i].TURNO_KEY) && tope < 90) { faltantes.push(k); k = _audTurnoSiguiente(k); tope++; }
        }
        if (faltantes.length) {
          const det = faltantes.slice(0, 6).map(function (k) {
            const p = k.split('-'); return p[2] + '-' + p[1] + ' ' + (p[3] === 'Dia' ? '☀️' : '🌙');
          }).join(', ');
          add('huecos', 'rojo', faltantes.length + ' turno(s) sin evolución dentro del episodio: ' + det + (faltantes.length > 6 ? '…' : ''));
        }
        const ultFecha = String(evos[evos.length - 1].TURNO_KEY).slice(0, 10);
        const atraso = diasEntre(ultFecha, hoy);
        if (atraso >= 1) add('huecos', atraso >= 2 ? 'rojo' : 'ambar', 'Última evolución hace ' + atraso + ' día(s) (' + ultFecha + ')');
      }

      // ── 2) Transiciones sin evento (entre turnos consecutivos registrados) ──
      for (let i = 1; i < evos.length; i++) {
        const prev = evos[i - 1], cur = evos[i];
        const vaPrev = _audFin(prev, 'VENT_VIA_AEREA', 'VENT_VIA_AEREA_FINAL');
        const sopPrev = _audFin(prev, 'VENT_SOPORTE', 'VENT_SOPORTE_FINAL');
        const vaCur = cur.VENT_VIA_AEREA || '';
        const sopCur = cur.VENT_SOPORTE || '';
        if (!vaPrev || !vaCur) continue;
        const tk = String(cur.TURNO_KEY);
        const et = tk.slice(8, 10) + '-' + tk.slice(5, 7) + ' ' + (tk.indexOf('Noche') !== -1 ? '🌙' : '☀️');
        if (vaPrev === 'TOT' && !inv(vaCur) && !esVerdadero(cur.EXT_OCURRIO))
          add('transicion', 'rojo', 'Salió de TOT (→ ' + vaCur + ') sin extubación registrada — turno ' + et);
        if (vaPrev === 'TQT' && vaCur === 'Natural' && !esVerdadero(cur.DECAN_OCURRIO))
          add('transicion', 'rojo', 'Salió de TQT (→ Natural) sin decanulación registrada — turno ' + et);
        if (!inv(vaPrev) && inv(vaCur) && !esVerdadero(cur.INTUB_OCURRIO) && !esVerdadero(cur.EXT_REINTUB) && !esVerdadero(cur.TQT_OCURRIO))
          add('transicion', 'rojo', 'Pasó de ' + vaPrev + ' a ' + vaCur + ' sin intubación/reintubación registrada — turno ' + et);
        if (vaPrev === 'TOT' && vaCur === 'TQT' && !esVerdadero(cur.TQT_OCURRIO))
          add('transicion', 'ambar', 'Pasó de TOT a TQT sin traqueostomía registrada — turno ' + et);
        if (sopPrev === 'VM' && sopCur && sopCur !== 'VM' && vaPrev === 'TQT' && vaCur === 'TQT' &&
            !/DESVINCULACI/i.test(String(cur.PROC_RESUMEN || '')) && !esVerdadero(cur.DECAN_OCURRIO))
          add('transicion', 'ambar', 'Salió de VM con TQT (→ ' + sopCur + ') sin desvinculación registrada — turno ' + et);
      }

      // ── 3) Evaluaciones: cooperador sin MRC/FSS o envejecidas ──
      if (/^cooperador$/i.test(String(c.ULT_COOP || '').trim())) {
        const edad = function (f) { const iso = f ? String(f).slice(0, 10) : ''; return iso ? diasEntre(iso, hoy) : null; };
        if (c.ULT_MRC === '' || c.ULT_MRC == null) add('evaluacion', 'ambar', 'Cooperador sin MRC-SS del episodio');
        else { const e1 = edad(c.ULT_MRC_FECHA); if (e1 != null && e1 > cutEval) add('evaluacion', 'ambar', 'MRC-SS hace ' + e1 + ' días (corte ' + cutEval + ')'); }
        if (c.ULT_FSS === '' || c.ULT_FSS == null) add('evaluacion', 'ambar', 'Cooperador sin FSS-ICU del episodio');
        else { const e2 = edad(c.ULT_FSS_FECHA); if (e2 != null && e2 > cutEval) add('evaluacion', 'ambar', 'FSS-ICU hace ' + e2 + ' días (corte ' + cutEval + ')'); }
      }

      // ── 4) Candidato a PVE que insiste (misma racha que la entrega) ──
      if (String(c.SOPORTE) === 'VM' && esVerdadero(c.WEAN_CAND_PVE)) {
        let racha = 0;
        for (let i = evos.length - 1; i >= 0; i--) {
          if (_turnoCandidatoPve(evos[i])) racha++; else break;
        }
        if (racha >= cutPve) add('pve', 'ambar', 'Candidato a PVE hace ' + racha + ' turnos sin PVE registrada');
      }

      // ── 5) Clones: mediciones idénticas N turnos seguidos ──
      if (evos.length >= 3) {
        const fpUlt = huella(evos[evos.length - 1]);
        if (fpUlt) {
          let n = 1;
          for (let i = evos.length - 2; i >= 0; i--) {
            if (huella(evos[i]) === fpUlt) n++; else break;
          }
          if (n >= 3) add('clones', 'ambar', 'Mediciones idénticas (FiO₂/PEEP/VT/FR/SpO₂/sedación/HDN) en los últimos ' + n + ' turnos — revisar si se están re-midiendo');
        }
      }

      // ── 6) Textos editados a mano (informativo): insumo para refinar el motor ──
      const editados = evos.filter(function (e) { return esVerdadero(e.TEXTO_MANUAL); });
      if (editados.length) {
        const dets = editados.slice(-4).map(function (e) {
          const k = String(e.TURNO_KEY); return k.slice(8, 10) + '-' + k.slice(5, 7) + ' ' + (k.indexOf('Noche') !== -1 ? '🌙' : '☀️');
        }).join(', ');
        add('texto', 'info', 'Texto retocado a mano en ' + editados.length + ' turno(s): ' + dets +
          (editados.length > 4 ? '…' : '') + ' — compara con el texto del motor para ver qué frases afinar');
      }

      if (h.length) filas.push({ cama: String(c.ID_CAMA), nombre: c.NOMBRE || '', cod: c.COD_PACIENTE || '', hallazgos: h });
    });

    filas.sort(function (a, b) { return (parseInt(a.cama) || 0) - (parseInt(b.cama) || 0); });
    return ok({
      generado: ahoraTS(), fecha: hoy,
      camasRevisadas: camas.length, camasConHallazgos: filas.length,
      cortes: { evalDias: cutEval, pveTurnos: cutPve },
      resumen: resumen, filas: filas,
    });
  } catch (e) { return err('auditoriaCalidad: ' + e.message, ERR.INTERNO, e); }
}


// ════════════════════════════════════════════════════════════════════
// ── svc_backup.gs ──
// ════════════════════════════════════════════════════════════════════

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


// ════════════════════════════════════════════════════════════════════
// ── svc_camas.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_camas.gs — Censo, ingreso, egreso, traslado (intercambio / mover a cama vacía).
 * Identidad de episodio: PATIENT_ID (uuid) generado UNA vez en el ingreso (ruta única).
 * COD_PACIENTE (legible) reemplaza al RUT.
 */

// ── LECTURA ────────────────────────────────────────────────
function obtenerTodasLasCamas() {
  try {
    const hoy = hoyISO();
    const _ahora = _horaAhora();
    const camas = repoLeerTodos('CAMAS_ESTADO');
    camas.forEach(c => {
      if (esVerdadero(c.OCUPADA)) {
        c.OCUPADA = true;
        // Los días se cuentan COMO LA LISTA OFICIAL DEL HOSPITAL (BUDA): un día
        // más por cada día de CALENDARIO, el de ingreso es Día 0 (ago-2026).
        // El tablero debe mostrar el MISMO número que el papel que el equipo
        // lee en la reunión — verificado contra la lista del 3-ago en 17 camas.
        c.DIA_ESTADIA = diasEntre(c.FECHA_INGRESO, hoy);
        c.DIAS_VM = (c.SOPORTE === 'VM') ? diasEntre(c.FECHA_INICIO_SOPORTE, hoy) : 0;
        c.DIAS_VA = (c.VIA_AEREA && c.VIA_AEREA !== 'Natural') ? diasEntre(c.FECHA_INICIO_VA, hoy) : 0;
        try { c.TIMELINE = c.TIMELINE_JSON ? JSON.parse(c.TIMELINE_JSON) : []; } catch (e) { c.TIMELINE = []; }
      } else {
        c.OCUPADA = false; c.DIA_ESTADIA = 0; c.DIAS_VM = 0; c.DIAS_VA = 0; c.TIMELINE = [];
      }
    });
    // Tag del ventilador asignado a cada cama (v4): el cruce se hace AQUÍ, en
    // una sola lectura de VENTILADORES — nunca N llamadas desde el cliente.
    try {
      // SOLO el VM invasivo ocupa el casillero de la cama (ago-2026, regla de
      // Diego): el V60/Airvo «queda en una cama pero no vive ahí», va con el
      // PACIENTE. Antes todos competían por el mismo chip y el que llegaba
      // último pisaba al anterior — con el inventario real, las camas con VM +
      // V60/Airvo mostraban solo uno y el otro desaparecía de la vista.
      const vmPorCama = {};
      const apoyoPorCama = {};
      repoLeerTodos('VENTILADORES').forEach(x => {
        if (!esVerdadero(x.ACTIVO) || x.UBIC_TIPO !== 'CAMA' || !x.UBIC_DETALLE) return;
        const cat = _vmCategoria(x);
        const id = String(x.UBIC_DETALLE);
        // El ID_VM viaja (ago-2026) para que el traslado de paciente pueda
        // ofrecer mover el equipo con él (MOVER_VENTILADORES_LOTE) sin tener
        // que volver a buscarlo por nombre.
        if (_vmEsDeCama(cat)) vmPorCama[id] = { id: String(x.ID_VM), n: String(x.NOMBRE || ''), e: String(x.ESTADO || '') };
        else (apoyoPorCama[id] = apoyoPorCama[id] || []).push({ id: String(x.ID_VM), n: String(x.NOMBRE || ''), c: cat, e: String(x.ESTADO || '') });
      });
      camas.forEach(c => {
        const t = vmPorCama[String(c.ID_CAMA)];
        c.VM_TAG = t ? t.n : ''; c.VM_TAG_ESTADO = t ? t.e : ''; c.VM_TAG_ID = t ? t.id : '';
        c.EQUIPOS_PACIENTE = apoyoPorCama[String(c.ID_CAMA)] || [];
      });
    } catch (e) { camas.forEach(c => { c.VM_TAG = ''; c.VM_TAG_ESTADO = ''; c.VM_TAG_ID = ''; c.EQUIPOS_PACIENTE = []; }); }
    return ok(camas);
  } catch (e) { return err('obtenerTodasLasCamas: ' + e.message, ERR.INTERNO, e); }
}

function obtenerCama(idCama) {
  try {
    const c = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(idCama));
    if (!c) return err('Cama "' + idCama + '" no encontrada.', ERR.NO_ENCONTRADO);
    const hoy = hoyISO();
    if (esVerdadero(c.OCUPADA)) {
      c.OCUPADA = true;
      c.DIA_ESTADIA = diasEntre(c.FECHA_INGRESO, hoy);
      c.DIAS_VM = (c.SOPORTE === 'VM') ? diasEntre(c.FECHA_INICIO_SOPORTE, hoy) : 0;
      c.DIAS_VA = (c.VIA_AEREA && c.VIA_AEREA !== 'Natural') ? diasEntre(c.FECHA_INICIO_VA, hoy) : 0;
    } else { c.OCUPADA = false; }
    try { c.TIMELINE = c.TIMELINE_JSON ? JSON.parse(c.TIMELINE_JSON) : []; } catch (e) { c.TIMELINE = []; }
    return ok(c);
  } catch (e) { return err('obtenerCama: ' + e.message, ERR.INTERNO, e); }
}

// ── INGRESO ────────────────────────────────────────────────
// APACHE II: entero 0-71 o vacío. Valor inválido → vacío (el dato honesto
// vale más que un dedazo; el egreso vuelve a ofrecerlo si quedó en blanco).
function _apacheNorm(x) {
  if (x === undefined || x === null || String(x).trim() === '') return '';
  const n = parseInt(x, 10);
  return (!isNaN(n) && n >= 0 && n <= 71 && String(n) === String(x).trim()) ? n : '';
}

function ingresarPaciente(datos, ctx) {
  const errores = validarPayloadIngreso(datos);
  if (errores.length) return err('Validación: ' + errores.join('; '), ERR.VALIDACION);
  ctx = ctx || {};

  return conLock(() => {
    try {
      const idCama = String(datos.idCama || datos.ID_CAMA);
      const cama = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
      if (!cama) return err('Cama "' + idCama + '" no encontrada.', ERR.NO_ENCONTRADO);
      if (esVerdadero(cama.OCUPADA)) return err('La cama ' + idCama + ' ya está ocupada.', ERR.VALIDACION);

      const nombre = String(datos.nombre || datos.NOMBRE || '').trim();
      const edad   = datos.edad || datos.EDAD || '';
      const sexo   = datos.sexo || datos.SEXO || '';
      const talla  = datos.talla || datos.TALLA_CM || '';
      const fecha  = datos.fechaIngreso || hoyISO();
      const via    = datos.viaAerea || 'Natural';
      const sop    = datos.soporte || 'Ambiente';

      const esTOT = via === 'TOT', esTQT = via === 'TQT';
      const tieneVA = esTOT || esTQT || via === 'Full Face' || via === 'Oronasal';
      const tieneVM = sop === 'VM' || sop === 'VNI';

      const patientId = Utilities.getUuid();
      const cod = _codUnico(generarCodPaciente(nombre, edad, fecha));

      repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, {
        OCUPADA: true, STATUS_CAMA: 'Ocupada', PATIENT_ID: patientId, COD_PACIENTE: cod,
        NOMBRE: nombre, EDAD: edad, SEXO: sexo, TALLA_CM: talla,
        RUT: _rutNormal(datos.rut || ''),
        PESO_IDEAL_KG: calcularPI(sexo, talla) || '',
        BARTHEL: datos.barthel || '', ECF: datos.ecf || '',
        DIAGNOSTICO: datos.diagnostico || '', DIAG_REM: datos.diagRem || '',
        AISLAMIENTO: esVerdadero(datos.aislamiento), AISL_MICRO: datos.aislMicro || '',
        VIA_AEREA: via, TOT_NUMERO: esTOT ? (datos.totNum || '') : '',
        TOT_CM_LABIO: esTOT ? (datos.totCm || '') : '', TQT_TIPO: esTQT ? (datos.tqtTipo || '') : '',
        TQT_CALIBRE: esTQT ? (datos.tqtCal || '') : '',
        SOPORTE: sop, MODO: datos.modo || 'Sin soporte',
        FECHA_INGRESO: fecha, FECHA_INICIO_VA: tieneVA ? fecha : '', FECHA_INICIO_SOPORTE: tieneVM ? fecha : '',
        // Momento REAL del ingreso (la hora del formulario o la del registro):
        // con él los días cuentan bloques de 24 h reales (ago-2026).
        TS_INGRESO: _tsDesdeHora(datos.horaIngreso) || _tsAhora(),
        TS_INICIO_VA: tieneVA ? (_tsDesdeHora(datos.horaIngreso) || _tsAhora()) : '',
        TS_INICIO_SOPORTE: tieneVM ? (_tsDesdeHora(datos.horaIngreso) || _tsAhora()) : '',
        APACHE2: _apacheNorm(datos.apache2),
        FASE_JSON: datos.faseJson || '', KTM_NIVEL: datos.ktmNivel || '', KTM_SUSP: false,
        FIRMA_KINE: ctx.firma || datos.firmaKine || '', AUTOR_EMAIL: ctx.email || '',
        ULTIMO_TURNO_KEY: '',
      });

      _agregarHitoInterno({
        idCama, patientId, fecha, turno: datos.turno || 'Dia', tipo: 'ingreso',
        texto: 'Ingreso a UCI. Dx: ' + (datos.diagnostico || 'Sin especificar'),
        autor: ctx.firma || '', autorEmail: ctx.email || '',
      });

      SpreadsheetApp.flush();
      return ok({ idCama, accion: 'ingreso', patientId, cod, entidad: 'CAMAS_ESTADO' });
    } catch (e) { return err('ingresarPaciente: ' + e.message, ERR.INTERNO, e); }
  });
}

// ── EGRESO / ALTA ──────────────────────────────────────────
/**
 * Interpretación de egreso con cortes configurables desde CONFIG
 * (CORTE_MRC_DAUCI, CORTE_MRC_SEVERA, CORTE_DINAMO_H/M, CORTE_FSS_INDEP).
 */
function _interpEgreso(mrc, fss, dinamo, sexo) {
  const out = { DAUCI: '', MRC_INTERP: '', FSS_INTERP: '', DINAMO_INTERP: '' };
  const m = parseFloat(mrc);
  if (!isNaN(m)) {
    const cDauci = parseFloat(leerConfig('CORTE_MRC_DAUCI', '48'));
    const cSev = parseFloat(leerConfig('CORTE_MRC_SEVERA', '36'));
    out.DAUCI = m < cDauci;
    out.MRC_INTERP = m < cSev ? ('DAUCI severa (<' + cSev + ')')
                  : m < cDauci ? ('DAUCI (<' + cDauci + ')')
                  : ('Sin DAUCI (\u2265' + cDauci + ')');
  }
  const f = parseFloat(fss);
  if (!isNaN(f)) {
    const cInd = parseFloat(leerConfig('CORTE_FSS_INDEP', '27'));
    out.FSS_INTERP = f <= 10 ? 'Dependencia severa'
                   : f <= 20 ? 'Dependencia moderada'
                   : f < cInd ? 'Asistencia mínima'
                   : ('Independencia funcional (\u2265' + cInd + ')');
  }
  const d = parseFloat(dinamo);
  if (!isNaN(d) && (sexo === 'M' || sexo === 'F')) {
    const corte = parseFloat(leerConfig(sexo === 'M' ? 'CORTE_DINAMO_H' : 'CORTE_DINAMO_M', sexo === 'M' ? '11' : '7'));
    out.DINAMO_INTERP = d < corte ? ('DAUCI por dinamometría (<' + corte + ' kg)') : ('Normal (\u2265' + corte + ' kg)');
  }
  return out;
}

function darAltaPaciente(datos, ctx) {
  ctx = ctx || {};
  return conLock(() => {
    try {
      const idCama = String(datos.idCama || datos.ID_CAMA);
      const rc = obtenerCama(idCama);
      if (!rc.ok) return rc;
      const cama = rc.data;
      if (!esVerdadero(cama.OCUPADA)) return err('La cama ' + idCama + ' ya está libre.', ERR.VALIDACION);

      const pid = cama.PATIENT_ID;
      const fechaEgreso = hoyISO();

      // Estadísticas del episodio (por PATIENT_ID, no por cama)
      const evos = pid ? repoLeerTodos('EVOLUCIONES', 'PATIENT_ID', pid) : [];
      let ktrTotal = 0, turnosVM = 0, turnosKTM = 0, turnosKTMC = 0;
      // Días de VM y de vía aérea artificial: se DERIVAN de las evoluciones del
      // episodio (días calendario distintos), no del contador del censo — ese
      // solo vale mientras el paciente SIGUE ventilado, y quien egresa
      // desvinculado archivaba 0 aunque hubiera estado semanas en VM.
      const diasVMset = {}, diasVAset = {};
      let huboExtProg = false, huboReintub = false;
      evos.forEach(e => {
        ktrTotal += parseInt(e.RESP_KTR_CANT) || 0;
        if (e.VENT_SOPORTE === 'VM') turnosVM++;
        if (esVerdadero(e.KTM_REALIZADA))  turnosKTM++;
        if (esVerdadero(e.KTM_SUSPENDIDA)) turnosKTMC++;
        const f = _statISO(e.FECHA);
        if (!f) return;
        if (e.VENT_SOPORTE === 'VM' || e.VENT_SOPORTE_FINAL === 'VM') diasVMset[f] = true;
        const va = String(e.VENT_VIA_AEREA || ''), vaF = String(e.VENT_VIA_AEREA_FINAL || '');
        if (va === 'TOT' || va === 'TQT' || vaF === 'TOT' || vaF === 'TQT') diasVAset[f] = true;
        // Desenlace de vía aérea del episodio (columnas del archivo)
        if (esVerdadero(e.EXT_OCURRIO) && ['protocolo', 'sin_protocolo'].indexOf(String(e.EXT_TIPO || '')) !== -1) huboExtProg = true;
        if (esVerdadero(e.EXT_REINTUB)) huboReintub = true;
      });
      if (pid && repoLeerTodos('REINTUBACIONES', 'PATIENT_ID', pid).length) huboReintub = true;
      // TOTALES DEL EPISODIO (ago-2026, hallazgo de Diego con Ricardo Flores:
      // egresó con MÁS días de VM que de estadía). Contar «días calendario
      // tocados» duplicaba el día de cada transición — el día de la extubación
      // contaba para la VM y también para lo que siguiera. Ahora manda el
      // contador SELLADO de la última evolución, que ya acumula por tramos sin
      // solaparse (VM + VNI + resto = estadía). Los días tocados quedan solo
      // como respaldo para episodios antiguos sin contador sellado.
      const _ultimo = evos.slice().sort(function (a, b) {
        return String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY));
      }).pop() || {};
      const diasVMTot = (_ultimo.DIAS_VM !== '' && _ultimo.DIAS_VM != null)
        ? Math.max(parseInt(_ultimo.DIAS_VM, 10) || 0, parseInt(cama.DIAS_VM) || 0)
        : Math.max(Object.keys(diasVMset).length, parseInt(cama.DIAS_VM) || 0);
      const diasVATot = (_ultimo.DIAS_VA !== '' && _ultimo.DIAS_VA != null)
        ? Math.max(parseInt(_ultimo.DIAS_VA, 10) || 0, parseInt(cama.DIAS_VA) || 0)
        : Math.max(Object.keys(diasVAset).length, parseInt(cama.DIAS_VA) || 0);

      // Últimas evaluaciones registradas del episodio (si el egreso no las trae)
      const ult = {};
      evos.slice().sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY))).forEach(e => {
        ['EVAL_T_FSS', 'EVAL_T_MRC', 'EVAL_T_DINAMO', 'CPAX_TOTAL'].forEach(k => {
          if (e[k] !== '' && e[k] !== undefined && e[k] !== null) ult[k] = e[k];
        });
      });
      const fssEgr  = datos.fssEgreso   || ult.EVAL_T_FSS    || '';
      const mrcEgr  = datos.mrcSsEgreso || ult.EVAL_T_MRC    || '';
      const dinEgr  = datos.dinamoEgreso|| ult.EVAL_T_DINAMO || '';
      const cpaxEgr = ult.CPAX_TOTAL || '';
      const interp  = _interpEgreso(mrcEgr, fssEgr, dinEgr, cama.SEXO);

      repoInsertar('ARCHIVO_PACIENTES', {
        ID_ARCHIVO: uid('ARCH'), PATIENT_ID: pid, CAMA_ORIGEN: idCama, COD_PACIENTE: cama.COD_PACIENTE,
        FECHA_INGRESO: cama.FECHA_INGRESO, TS_INGRESO: cama.TS_INGRESO || '', FECHA_EGRESO: fechaEgreso,
        DIAS_TOTAL: cama.DIA_ESTADIA, DIAS_VM_TOTAL: diasVMTot, DIAS_VA_TOTAL: diasVATot,
        NOMBRE: cama.NOMBRE, EDAD: cama.EDAD, SEXO: cama.SEXO, RUT: cama.RUT || '',
        DIAGNOSTICO: cama.DIAGNOSTICO, DIAG_REM: cama.DIAG_REM,
        MOTIVO_EGRESO: datos.motivoEgreso || '', DESTINO_EGRESO: datos.destinoEgreso || '',
        KTR_TOTAL: ktrTotal, TURNOS_VM: turnosVM, TURNOS_KTM: turnosKTM, TURNOS_KTMC: turnosKTMC,
        // Desenlace de vía aérea DERIVADO del episodio (antes nadie los llenaba
        // y quedaban siempre en falso). El egreso puede forzarlos si los envía.
        EXTUBACION_OK: datos.extubacionOk !== undefined ? esVerdadero(datos.extubacionOk) : (huboExtProg && !huboReintub),
        REINTUBACION: datos.reintubacion !== undefined ? esVerdadero(datos.reintubacion) : huboReintub,
        BARTHEL_INGRESO: cama.BARTHEL, BARTHEL_EGRESO: datos.barthelEgreso || '',
        FSS_EGRESO: fssEgr, MRC_SS_EGRESO: mrcEgr,
        DINAMO_EGRESO: dinEgr, CPAX_EGRESO: cpaxEgr,
        DAUCI: interp.DAUCI, MRC_INTERP: interp.MRC_INTERP,
        FSS_INTERP: interp.FSS_INTERP, DINAMO_INTERP: interp.DINAMO_INTERP,
        FIRMA_RESPONSABLE: ctx.firma || datos.firmaKine || '', AUTOR_EMAIL: ctx.email || '',
        OBSERVACIONES: datos.observaciones || '', TIMELINE_JSON: cama.TIMELINE_JSON || '[]',
        APNEA_JSON: datos.apneaJson || '', BDT_JSON: datos.bdtJson || '', FASE_FINAL: datos.faseFinal || '',
        // APACHE II del episodio; si no se anotó durante la estadía, el egreso
        // lo ofrece como última oportunidad (datos.apache2).
        APACHE2: (cama.APACHE2 !== '' && cama.APACHE2 !== undefined && cama.APACHE2 !== null)
          ? cama.APACHE2 : _apacheNorm(datos.apache2),
      });

      _agregarHitoInterno({
        idCama, patientId: pid, fecha: fechaEgreso, turno: datos.turno || 'Dia', tipo: 'egreso',
        texto: 'Alta de UCI. Motivo: ' + (datos.motivoEgreso || 'Sin especificar'),
        autor: ctx.firma || '', autorEmail: ctx.email || '',
      });

      // Partición (D5): mover las evoluciones del episodio al archivo histórico.
      // Regla clínica (Manuel, ago-2026): dado el alta, en la cama NO puede
      // sobrevivir el conteo de horas de prono. Barrer POR CAMA —archivando
      // primero, nunca borrando a secas— cubre dos huecos que el barrido por
      // PATIENT_ID se perdía: el episodio sin PATIENT_ID y las filas huérfanas
      // de un ocupante anterior. Con eso el siguiente paciente ya no puede
      // heredar una pronación abierta ajena.
      // Mismo helper que usa `limpiarCama` (ago-2026), para que las dos vías de
      // cierre de una cama no puedan divergir.
      _archivarEvolucionesDeCama(idCama);

      _limpiarCamaInterno(idCama);
      SpreadsheetApp.flush();
      return ok({ idCama, accion: 'alta', fecha: fechaEgreso, patientId: pid, entidad: 'ARCHIVO_PACIENTES' });
    } catch (e) { return err('darAltaPaciente: ' + e.message, ERR.INTERNO, e); }
  });
}

// ── TRASLADO ───────────────────────────────────────────────
/**
 * Re-etiqueta las filas del episodio a su nueva cama: EVOLUCIONES (ID_CAMA e
 * ID_EVOLUCION, cuya clave incluye la cama) y TIMELINE (ID_CAMA). Sin esto el
 * historial "quedaba pegado" a la cama antigua: la replicación del turno
 * previo, el registro del día y el cache de hitos leen por cama y mostraban
 * datos del ocupante anterior tras un traslado.
 */
function _reetiquetarEpisodioACama(patientId, idCamaNueva) {
  if (!patientId) return;
  const pid = String(patientId), nueva = String(idCamaNueva);
  repoActualizarDonde('EVOLUCIONES',
    e => String(e.PATIENT_ID) === pid,
    e => ({ ID_CAMA: nueva, ID_EVOLUCION: 'CAMA_' + nueva + '_' + e.TURNO_KEY }));
  repoActualizarDonde('TIMELINE',
    h => String(h.PATIENT_ID) === pid,
    () => ({ ID_CAMA: nueva }));
}

// ── TRASLADO: intercambio entre dos camas ocupadas ─────────
function intercambiarCamas(idA, idB, ctx) {
  ctx = ctx || {};
  return conLock(() => {
    try {
      const A = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(idA));
      const B = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(idB));
      if (!A || !B) return err('Cama origen o destino no encontrada.', ERR.NO_ENCONTRADO);

      // Los PATIENT_ID se capturan ANTES de escribir: si la lectura devolvió
      // referencias vivas en vez de fotos, A y B ya tendrían los datos del
      // otro al llegar al reetiquetado (orden-independiente por diseño).
      const pidA = String(A.PATIENT_ID || ''), pidB = String(B.PATIENT_ID || '');
      const campA = Object.assign({}, B); campA.ID_CAMA = String(idA);
      const campB = Object.assign({}, A); campB.ID_CAMA = String(idB);
      repoActualizar('CAMAS_ESTADO', 'ID_CAMA', String(idA), campA);
      repoActualizar('CAMAS_ESTADO', 'ID_CAMA', String(idB), campB);

      // El episodio completo viaja con el paciente (antes de los hitos, para
      // que el cache TIMELINE_JSON se reconstruya con las filas correctas).
      _reetiquetarEpisodioACama(pidA, idB);
      _reetiquetarEpisodioACama(pidB, idA);

      const fecha = hoyISO();
      _agregarHitoInterno({ idCama: idA, patientId: pidB, fecha, turno: 'Dia', tipo: 'general', texto: `Traslado a Cama ${idA} (desde ${idB})`, autor: ctx.firma || '', autorEmail: ctx.email || '' });
      _agregarHitoInterno({ idCama: idB, patientId: pidA, fecha, turno: 'Dia', tipo: 'general', texto: `Traslado a Cama ${idB} (desde ${idA})`, autor: ctx.firma || '', autorEmail: ctx.email || '' });
      SpreadsheetApp.flush();
      return ok({ accion: 'intercambio', camaA: idA, camaB: idB });
    } catch (e) { return err('intercambiarCamas: ' + e.message, ERR.INTERNO, e); }
  });
}

// ── TRASLADO: mover a cama vacía (caso aislamiento) ────────
function moverACamaVacia(idOrigen, idDestino, ctx) {
  ctx = ctx || {};
  return conLock(() => {
    try {
      const O = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(idOrigen));
      const D = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(idDestino));
      if (!O || !D) return err('Cama origen o destino no encontrada.', ERR.NO_ENCONTRADO);
      if (!esVerdadero(O.OCUPADA)) return err('La cama origen está libre.', ERR.VALIDACION);
      if (esVerdadero(D.OCUPADA)) return err('La cama destino no está libre.', ERR.VALIDACION);

      // El PATIENT_ID se captura ANTES de limpiar el origen: el reetiquetado
      // de las evoluciones no debe depender de si la lectura fue foto o
      // referencia viva (orden-independiente por diseño).
      const pidO = String(O.PATIENT_ID || '');
      const camp = Object.assign({}, O); camp.ID_CAMA = String(idDestino);
      repoActualizar('CAMAS_ESTADO', 'ID_CAMA', String(idDestino), camp);
      _limpiarCamaInterno(String(idOrigen));
      _reetiquetarEpisodioACama(pidO, idDestino);

      _agregarHitoInterno({ idCama: idDestino, patientId: pidO, fecha: hoyISO(), turno: 'Dia', tipo: 'general', texto: `Traslado a Cama ${idDestino} (desde ${idOrigen})`, autor: ctx.firma || '', autorEmail: ctx.email || '' });
      SpreadsheetApp.flush();
      return ok({ accion: 'mover_cama_vacia', origen: idOrigen, destino: idDestino, patientId: O.PATIENT_ID });
    } catch (e) { return err('moverACamaVacia: ' + e.message, ERR.INTERNO, e); }
  });
}

// ── LIMPIAR ────────────────────────────────────────────────
/*
 * El archivado por CAMA (`_archivarEvolucionesDeCama`, definido más abajo) es
 * el ÚNICO camino de las dos vías que cierran una cama —el alta y limpiarla—,
 * decisión de Manuel (ago-2026): barrer por PATIENT_ID dejaba vivas las filas
 * huérfanas y los episodios sin identificador, que es justo lo que el siguiente
 * ocupante hereda (incluidas las horas de prono abiertas).
 *
 * OJO — va SEPARADO de `_limpiarCamaInterno` a propósito, y no es un detalle de
 * estilo: ese helper también lo usa el TRASLADO a cama vacía, que limpia el
 * origen y enseguida re-etiqueta las evoluciones a la cama nueva. Si el
 * archivado viviera adentro, un traslado archivaría la historia de un paciente
 * que sigue hospitalizado y el re-etiquetado no encontraría nada que mover.
 * Solo archiva quien de verdad cierra el episodio.
 */

/**
 * Libera una cama. Si tenía paciente, sus evoluciones se ARCHIVAN igual que en
 * el alta (decisión de Diego, ago-2026).
 *
 * EL BUG QUE CIERRA: hasta ahora solo `darAltaPaciente` archivaba, así que una
 * cama limpiada sin alta formal dejaba las evoluciones del ocupante anterior
 * VIVAS en la hoja. Como la pronación abierta se busca por ID_CAMA y no por
 * paciente, el siguiente ocupante heredaba una pronación ajena: en la prueba de
 * Manuel salió «tras 108,5 h en prono» con horas de otra persona.
 *
 * NO se escribe fila en ARCHIVO_PACIENTES: limpiar no es un egreso clínico (no
 * hay motivo, destino ni evaluaciones de alta) e inventar uno contaminaría el
 * REM y los indicadores con un egreso que nadie registró. Lo que se arregla es
 * el arrastre entre pacientes; el episodio queda consultable en el histórico.
 */
function limpiarCama(idCama) {
  return conLock(() => {
    try {
      const id = String(idCama);
      const c = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', id);
      const pid = c ? String(c.PATIENT_ID || '') : '';
      const nombre = c ? String(c.NOMBRE || '') : '';
      // Por CAMA, igual que el alta (regla de Manuel, ago-2026): liberar la
      // cama debe llevarse TODO lo que el siguiente ocupante podría heredar,
      // incluidas las filas huérfanas sin PATIENT_ID.
      const archivadas = _archivarEvolucionesDeCama(id);
      _limpiarCamaInterno(id);
      if (archivadas) {
        auditar({
          accion: 'LIMPIAR_CAMA_ARCHIVA', entidad: 'EVOLUCIONES_ARCHIVO', idEntidad: id,
          patientId: pid,
          resumen: archivadas + ' evolucion(es) de ' + (nombre || pid) +
                   ' archivadas al liberar la cama ' + id + ' sin alta formal',
        });
      }
      SpreadsheetApp.flush();
      return ok({ idCama: id, accion: 'limpiar', archivadas: archivadas });
    } catch (e) { return err('limpiarCama: ' + e.message, ERR.INTERNO, e); }
  });
}

function _limpiarCamaInterno(idCama) {
  const vacio = {
    OCUPADA: false, STATUS_CAMA: 'Libre', PATIENT_ID: '', COD_PACIENTE: '',
    NOMBRE: '', EDAD: '', SEXO: '', TALLA_CM: '', PESO_IDEAL_KG: '', BARTHEL: '', ECF: '', RUT: '',
    DIAGNOSTICO: '', DIAG_REM: '', AISLAMIENTO: false, AISL_MICRO: '',
    VIA_AEREA: 'Natural', TOT_NUMERO: '', TOT_CM_LABIO: '', TQT_TIPO: '', TQT_CALIBRE: '',
    SOPORTE: 'Ambiente', MODO: 'Sin soporte',
    FECHA_INGRESO: '', FECHA_INICIO_VA: '', FECHA_INICIO_SOPORTE: '',
    // Los relojes TS_* (v5.19) NUNCA se habian agregado aca: al liberar la
    // cama quedaban con el MOMENTO del paciente anterior y el siguiente los
    // heredaba (la tarjeta cuenta los dias en vivo contra ellos, y el bloque
    // de ingreso de guardarEvolucion solo los escribe `if (!cama.TS_INGRESO)`
    // — con el valor viejo presente, no los tocaba). Encontrado el 4-ago
    // revisando por que un ingreso del dia no mostraba 0 dias.
    TS_INGRESO: '', TS_INICIO_VA: '', TS_INICIO_SOPORTE: '',
    FASE_JSON: '', KTM_NIVEL: '', KTM_SUSP: false, FIRMA_KINE: '', AUTOR_EMAIL: '',
    TEXTO_EVO_DIA: '', TEXTO_EVO_NOCHE: '', ULTIMO_TURNO_KEY: '', TIMELINE_JSON: '',
    KTR_DIA: '', KTM_DIA: '', PROC_DIA: '', FIRMA_DIA: '', KEY_DIA: '',
    KTR_NOCHE: '', PROC_NOCHE: '', FIRMA_NOCHE: '', KEY_NOCHE: '',
    // Estado del episodio (v2): sin esto, el próximo paciente de la cama
    // heredaba arrastres del anterior (evaluaciones, categorías, circuito).
    CHARLSON: '', INGRESO_TIPO: '',
    CAT_KINE: '', CAT_RESP_PJE: '', CAT_MOTOR_PJE: '', CAT_RESP_NIVEL: '', CAT_MOTOR_NIVEL: '',
    ULT_COOP: '', ULT_MRC: '', ULT_MRC_FECHA: '', ULT_FSS: '', ULT_FSS_FECHA: '', ULT_DINAMO: '',
    DISP_HME_FECHA: '', DISP_HEPA_FECHA: '', DISP_TC_FECHA: '', DISP_HUMID_FECHA: '',
    WEAN_PVE_JSON: '', WEAN_CAND_PVE: false,
  };
  repoActualizar('CAMAS_ESTADO', 'ID_CAMA', String(idCama), vacio);
}

/**
 * Limpieza manual desde el editor de Apps Script (pacientes cargados a mano
 * en la hoja que quedaron inconsistentes): deja las camas indicadas Libres.
 * Uso: seleccionar esta función, ejecutar → pide nada; editar la línea de
 * abajo con las camas o llamar limpiarCamasManual('3,5,8') desde la consola.
 */
function limpiarCamasManual(ids) {
  const lista = String(ids || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  if (!lista.length) { console.log('Indica las camas: limpiarCamasManual("3,5,8")'); return; }
  // Esta ruta NO archiva: es una herramienta de reparación y puede correrse con
  // el paciente todavía en la cama, donde borrarle sus evoluciones sería peor
  // que el problema. Pero avisa, porque lo que quede vivo aquí es exactamente lo
  // que el siguiente ocupante puede heredar (incluidas las horas de prono).
  lista.forEach(function (id) {
    const vivas = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(id)).length;
    if (vivas) {
      console.log('⚠️  Cama ' + id + ': quedan ' + vivas + ' evoluciones en la hoja viva. '
        + 'Si la cama va a recibir a OTRO paciente, dale el alta al anterior en vez de limpiarla: '
        + 'el alta las archiva y el alta es lo único que borra el conteo de prono.');
    }
    _limpiarCamaInterno(id);
  });
  SpreadsheetApp.flush();
  console.log('✅ Camas limpiadas y liberadas: ' + lista.join(', '));
}

/**
 * Saca de la hoja viva TODAS las evoluciones que queden en una cama, dejándolas
 * antes en EVOLUCIONES_ARCHIVO. Se usa al dar el alta, que es el momento en que
 * la cama deja de pertenecer a un paciente: a partir de ahí ninguna fila suya
 * puede seguir contestando preguntas sobre el ocupante siguiente —la pronación
 * abierta, la evolución previa, los turnos recientes—.
 * NO se llama desde `_limpiarCamaInterno`: el traslado a cama vacía lo usa con
 * el paciente vivo y ahí las filas se reetiquetan, no se archivan.
 * @returns {number} cuántas filas se archivaron.
 */
function _archivarEvolucionesDeCama(idCama) {
  const cama = String(idCama);
  const restantes = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', cama);
  if (!restantes.length) return 0;
  restantes.forEach(e => repoInsertar('EVOLUCIONES_ARCHIVO', e));
  repoEliminarDonde('EVOLUCIONES', e => String(e.ID_CAMA) === cama);
  return restantes.length;
}

// ── COD_PACIENTE ───────────────────────────────────────────
/** ddmmyy + inicial nombre(may) + primer apellido(min, tope 8) + inicial 2º apellido(min) + edad. */
function generarCodPaciente(nombreCompleto, edad, fechaIngresoISO) {
  const iso = String(fechaIngresoISO || hoyISO()).slice(0, 10);
  const ddmmyy = iso.slice(8, 10) + iso.slice(5, 7) + iso.slice(2, 4);
  const toks = _sinAcentos(String(nombreCompleto || '').trim()).split(/\s+/).filter(Boolean);
  let iniN = '', ap1 = '', ap2i = '';
  if (toks.length >= 3) { iniN = toks[0][0]; ap1 = toks[toks.length - 2]; ap2i = (toks[toks.length - 1][0] || ''); }
  else if (toks.length === 2) { iniN = toks[0][0]; ap1 = toks[1]; }
  else if (toks.length === 1) { iniN = toks[0][0]; }
  const e = String(parseInt(edad) || '').trim();
  return ddmmyy + (iniN || '').toUpperCase() + ap1.toLowerCase().slice(0, 8) + ap2i.toLowerCase() + e;
}

function _sinAcentos(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ñ/g, 'n').replace(/Ñ/g, 'N');
}

/** Evita colisión de COD entre pacientes activos: agrega sufijo -2, -3… */
function _codUnico(cod) {
  const activos = repoLeerTodos('CAMAS_ESTADO').filter(c => esVerdadero(c.OCUPADA)).map(c => String(c.COD_PACIENTE));
  if (activos.indexOf(cod) === -1) return cod;
  let n = 2;
  while (activos.indexOf(cod + '-' + n) !== -1) n++;
  return cod + '-' + n;
}

// ── ARCHIVADOS: pacientes egresados (hoja ARCHIVO_PACIENTES) ───────────────
/**
 * Lista de egresos para la pestaña Archivados, del más reciente al más
 * antiguo. Filtros opcionales: desde/hasta (por FECHA_EGRESO) y q (texto
 * libre sobre nombre/código/diagnóstico). El detalle de evoluciones se pide
 * aparte con GET_HISTORIAL_PACIENTE (lee EVOLUCIONES + EVOLUCIONES_ARCHIVO).
 */
function obtenerArchivados(params) {
  try {
    params = params || {};
    const iso = v => { const s = String(v || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s; };
    let rows = repoLeerTodos('ARCHIVO_PACIENTES').map(a => ({
      id: a.ID_ARCHIVO, patientId: a.PATIENT_ID, cama: String(a.CAMA_ORIGEN || ''), cod: a.COD_PACIENTE,
      nombre: a.NOMBRE, edad: a.EDAD, sexo: a.SEXO, diagnostico: a.DIAGNOSTICO, diagRem: a.DIAG_REM,
      fIngreso: iso(a.FECHA_INGRESO), fEgreso: iso(a.FECHA_EGRESO),
      dias: a.DIAS_TOTAL, diasVM: a.DIAS_VM_TOTAL, diasVA: a.DIAS_VA_TOTAL,
      motivo: a.MOTIVO_EGRESO, destino: a.DESTINO_EGRESO,
      ktr: a.KTR_TOTAL, turnosVM: a.TURNOS_VM, turnosKTM: a.TURNOS_KTM, turnosKTMC: a.TURNOS_KTMC,
      extubOk: esVerdadero(a.EXTUBACION_OK), reintub: esVerdadero(a.REINTUBACION),
      barthelIn: a.BARTHEL_INGRESO, barthelEg: a.BARTHEL_EGRESO,
      mrc: a.MRC_SS_EGRESO, fss: a.FSS_EGRESO, dinamo: a.DINAMO_EGRESO, cpax: a.CPAX_EGRESO,
      dauci: esVerdadero(a.DAUCI), faseFinal: a.FASE_FINAL,
      firma: a.FIRMA_RESPONSABLE, obs: a.OBSERVACIONES,
    }));
    if (params.desde) rows = rows.filter(r => r.fEgreso >= params.desde);
    if (params.hasta) rows = rows.filter(r => r.fEgreso <= params.hasta);
    if (params.q) {
      const q = String(params.q).toLowerCase();
      rows = rows.filter(r => [r.nombre, r.cod, r.diagnostico, r.diagRem].join(' ').toLowerCase().indexOf(q) !== -1);
    }
    rows.sort((a, b) => String(b.fEgreso).localeCompare(String(a.fEgreso)) || String(b.id).localeCompare(String(a.id)));
    return ok(params.limite ? rows.slice(0, params.limite) : rows);
  } catch (e) { return err('obtenerArchivados: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Planillas históricas de los cierres de año: { '2026': url, … }.
 * El cierre anual (mantenimiento.gs) deja el ID en CONFIG.HISTORICO_AAAA;
 * la URL se arma directo del ID, sin abrir la planilla (cero costo).
 * El cliente la usa para el enlace «Abrir histórico» cuando un episodio
 * trasladado ya no tiene evoluciones en la planilla de trabajo.
 */
function obtenerHistoricos() {
  try {
    const out = {};
    repoLeerTodos('CONFIG').forEach(function (r) {
      const m = String(r.CLAVE || '').match(/^HISTORICO_(\d{4})$/);
      if (m && String(r.VALOR || '').trim()) {
        out[m[1]] = 'https://docs.google.com/spreadsheets/d/' + String(r.VALOR).trim();
      }
    });
    return ok(out);
  } catch (e) { return err('obtenerHistoricos: ' + e.message, ERR.INTERNO, e); }
}

// ── BUSCADOR GLOBAL: pacientes activos + egresados ─────────────────────────
/**
 * Busca por nombre, código, diagnóstico o cama ("cama 10" / "10"), sin
 * distinguir acentos ni mayúsculas. Devuelve activos primero (por cama) y
 * egresados del más reciente al más antiguo, tope 20. El cliente abre el
 * historial del episodio con el patientId del resultado.
 */
function buscarPacientes(q) {
  try {
    const t = _sinAcentos(String(q || '').trim()).toLowerCase();
    if (t.length < 2) return ok([]);
    const iso = v => { const s = String(v || ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s; };
    const norm = s => _sinAcentos(String(s || '')).toLowerCase();
    const mCama = t.match(/^(?:cama\s*)?(\d{1,2})$/);

    // ── RUT (ago-2026) ────────────────────────────────────────────────────
    // La columna existía en las dos hojas desde jul-2026 pero el buscador no la
    // miraba: al que solo tenía el RUT a mano no le servía de nada. Se compara
    // NORMALIZADO en ambos lados, así da igual cómo venga escrito (con puntos,
    // sin puntos, con guion o sin él).
    const qRut = /^[\d.]{6,}-?[\dkK]$/.test(String(q || '').trim()) ? _rutNormal(q) : '';

    // ── Palabras sueltas, en cualquier orden (ago-2026) ───────────────────
    // Antes se buscaba la frase entera pegada: «Melo Villagrán» encontraba a
    // Diego Melo Villagrán, pero «Diego Villagrán» no. Ahora se exigen TODAS
    // las palabras, cada una en cualquier parte y en cualquier orden — que es
    // como uno recuerda a un paciente: el nombre y un apellido, no la frase.
    const palabras = t.split(/\s+/).filter(function (p) { return p.length >= 2; });
    const casa = function (heno) {
      const h = norm(heno);
      if (!palabras.length) return h.indexOf(t) !== -1;
      for (let i = 0; i < palabras.length; i++) if (h.indexOf(palabras[i]) === -1) return false;
      return true;
    };
    const coincide = function (o, campoRut) {
      if (qRut && o[campoRut] && _rutNormal(o[campoRut]) === qRut) return true;
      return casa(o.NOMBRE) || casa(o.COD_PACIENTE) || casa(o.DIAGNOSTICO);
    };

    const activos = [];
    repoLeerTodos('CAMAS_ESTADO').forEach(function (c) {
      if (!esVerdadero(c.OCUPADA)) return;
      const hit = (mCama && String(c.ID_CAMA).trim() === mCama[1]) || coincide(c, 'RUT');
      if (hit) activos.push({ tipo: 'activo', patientId: c.PATIENT_ID || '', cama: String(c.ID_CAMA),
        nombre: c.NOMBRE, cod: c.COD_PACIENTE, edad: c.EDAD, dx: c.DIAGNOSTICO,
        fIngreso: iso(c.FECHA_INGRESO), fEgreso: '' });
    });
    const egresados = [];
    repoLeerTodos('ARCHIVO_PACIENTES').forEach(function (a) {
      const hit = (mCama && String(a.CAMA_ORIGEN).trim() === mCama[1]) || coincide(a, 'RUT');
      if (hit) egresados.push({ tipo: 'egresado', patientId: a.PATIENT_ID || '', cama: String(a.CAMA_ORIGEN || ''),
        nombre: a.NOMBRE, cod: a.COD_PACIENTE, edad: a.EDAD, dx: a.DIAGNOSTICO,
        fIngreso: iso(a.FECHA_INGRESO), fEgreso: iso(a.FECHA_EGRESO) });
    });
    activos.sort(function (a, b) { return (parseInt(a.cama) || 0) - (parseInt(b.cama) || 0); });
    egresados.sort(function (a, b) { return String(b.fEgreso).localeCompare(String(a.fEgreso)); });
    return ok(activos.concat(egresados).slice(0, 20));
  } catch (e) { return err('buscarPacientes: ' + e.message, ERR.INTERNO, e); }
}

// ── RUT: identidad de PERSONA (jul-2026, uso interno autorizado) ──────────────
// El PATIENT_ID sigue siendo la llave del EPISODIO; el RUT conecta episodios de
// la misma persona (reingresos, cruce interno con la estadística médica).

/** Normaliza: sin puntos ni espacios, guion antes del dígito, K mayúscula. */
function _rutNormal(rut) {
  const s = String(rut || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (s.length < 2) return '';
  return s.slice(0, -1) + '-' + s.slice(-1);
}

/** Dígito verificador (módulo 11). Vacío se considera válido (RUT es opcional). */
function rutValido(rut) {
  const s = String(rut || '').toUpperCase().replace(/[^0-9K]/g, '');
  if (!s) return true;
  if (s.length < 2) return false;
  const cuerpo = s.slice(0, -1), dv = s.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return false;
  let suma = 0, mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * mult;
    mult = mult === 7 ? 2 : mult + 1;
  }
  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : (resto === 10 ? 'K' : String(resto));
  return dv === esperado;
}

/** Episodios previos de un RUT (cama activa + archivo), para el aviso de reingreso. */
function episodiosPorRut(rut) {
  const r = _rutNormal(rut);
  if (!r) return ok({ episodios: [] });
  const eps = [];
  repoLeerTodos('CAMAS_ESTADO').forEach(c => {
    if (esVerdadero(c.OCUPADA) && _rutNormal(c.RUT) === r) {
      eps.push({ tipo: 'activo', idCama: String(c.ID_CAMA), fechaIngreso: String(c.FECHA_INGRESO || ''), nombre: String(c.NOMBRE || '') });
    }
  });
  repoLeerTodos('ARCHIVO_PACIENTES').forEach(a => {
    if (_rutNormal(a.RUT) === r) {
      eps.push({ tipo: 'egresado', idCama: String(a.CAMA_ORIGEN || ''), fechaIngreso: String(a.FECHA_INGRESO || ''),
        fechaEgreso: String(a.FECHA_EGRESO || ''), motivo: String(a.MOTIVO_EGRESO || ''), nombre: String(a.NOMBRE || '') });
    }
  });
  eps.sort((a, b) => String(b.fechaIngreso).localeCompare(String(a.fechaIngreso)));
  return ok({ episodios: eps });
}


// ════════════════════════════════════════════════════════════════════
// ── svc_coordinacion.gs ──
// ════════════════════════════════════════════════════════════════════

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

/**
 * Estado público de la puerta: qué caminos de recuperación ofrecer.
 * Y desde el 24-ago-2026, con `token`, dice además si ESA sesión sigue viva —
 * es lo que permite que un F5 no cierre lo que el servidor mantiene abierto:
 * el navegador guarda el token en el bolsillo de la pestaña y al arrancar
 * pregunta aquí antes de restaurar el candado. Consultar renueva la ventana
 * de inactividad a propósito: reanudar tras un refresh ES actividad de la
 * persona. Sin token la respuesta es la de siempre.
 */
function coordEstado(datos) {
  try {
    const out = { recuperaCorreo: coordRecuperaPorCorreo() };
    const token = String((datos && datos.token) || '');
    if (token) {
      const s = coordSesion(token);
      out.viva = !!s;
      if (s) { out.firma = s.firma; out.usuario = s.usuario; out.minutos = _COORD_SESION_MIN; }
    }
    return ok(out);
  } catch (e) { return ok({ recuperaCorreo: false, viva: false }); }
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


// ════════════════════════════════════════════════════════════════════
// ── svc_docs.gs ──
// ════════════════════════════════════════════════════════════════════

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


// ════════════════════════════════════════════════════════════════════
// ── svc_entrega.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_entrega.gs — Entrega de Turno (handoff) imprimible.
 *
 * Reúne, para las camas seleccionadas, el estado del turno que se entrega
 * (evolución de fecha+turno) + estado de cama + eventos FECHADOS del episodio
 * (intubación, PVE, extubación, reintubación, decanulación, cambios de
 * tubo/cánula), últimas evaluaciones con fecha (arrastre ULT_*), último
 * cultivo, dispositivos de circuito por vencer y alertas — en UNA estructura
 * lista para imprimir. Permite además guardar cada entrega como historial.
 *
 * Eficiencia: 3 lecturas masivas (CAMAS_ESTADO, EVOLUCIONES, PROCEDIMIENTOS)
 * sin importar cuántas camas se elijan.
 */

function obtenerEntregaTurno(idCamas, fecha, turno) {
  try {
    if (!idCamas || !idCamas.length) return err('No se seleccionaron camas.', ERR.VALIDACION);
    fecha = _statISO(fecha);
    const turnoKey = fecha + '-' + turno;
    const sel = idCamas.map(String);
    const setSel = {};
    sel.forEach(id => setSel[id] = true);

    // ── Lecturas masivas ──
    const camas = repoLeerTodos('CAMAS_ESTADO');
    const camaPorId = {};
    camas.forEach(c => camaPorId[String(c.ID_CAMA)] = c);

    // Solo las evoluciones de las camas seleccionadas (lectura por tramos):
    // antes bajaba EVOLUCIONES entera en cada vista de la entrega.
    const evosAll = repoLeerFiltrado('EVOLUCIONES', 'ID_CAMA',
      function (v) { return !!setSel[String(v).trim()]; });
    const evoTurnoPorCama = {};   // evolución del turno que se entrega
    const episodioPorCama = {};   // evoluciones del episodio actual (mismo PATIENT_ID)
    evosAll.forEach(e => {
      const id = String(e.ID_CAMA);
      if (!setSel[id]) return;
      const cama = camaPorId[id];
      /* 🔴 La ficha de la entrega se arma con `evoTurnoPorCama`, que comparaba
         SOLO el turno. El filtro por paciente de dos líneas más abajo alimenta
         `episodioPorCama`, que es otra cosa. Resultado: en una cama que rotó, la
         ficha del ocupante nuevo salía con la evolución del que se fue —
         sedación, parámetros, plan— y quien recibe el turno la lee como propia.
         Misma regla que en el resto del sistema: se descarta solo cuando los dos
         pid existen y son distintos; una fila sin pid no se esconde. */
      const pidC = String((cama && cama.PATIENT_ID) || ''), pidE = String(e.PATIENT_ID || '');
      const ajena = !!pidC && !!pidE && pidC !== pidE;
      if (String(e.TURNO_KEY) === turnoKey && !ajena) evoTurnoPorCama[id] = e;
      if (cama && cama.PATIENT_ID && String(e.PATIENT_ID) === String(cama.PATIENT_ID)) {
        (episodioPorCama[id] = episodioPorCama[id] || []).push(e);
      }
    });
    Object.keys(episodioPorCama).forEach(id =>
      episodioPorCama[id].sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY))));

    // ── Último cultivo/estudio microbiológico por cama (PROCEDIMIENTOS) ──
    const procs = repoLeerTodos('PROCEDIMIENTOS');
    const cultivoPorCama = {};
    procs.forEach(p => {
      const id = String(p.ID_CAMA);
      if (!setSel[id]) return;
      // Igual que arriba: el último cultivo se buscaba por CAMA, así que el
      // ocupante nuevo heredaba el aspirado traqueal del anterior — y con él
      // una decisión de antibióticos que no es suya.
      const pidCu = String((camaPorId[id] && camaPorId[id].PATIENT_ID) || '');
      const pidPr = String(p.PATIENT_ID || '');
      if (pidCu && pidPr && pidCu !== pidPr) return;
      const nom = String(p.NOMBRE_PROC || '').toUpperCase();
      if (!/CULTIVO|HISOPADO|PCR|FILMARRAY|MINI ?LAB|CCAET/.test(nom)) return;
      const iso = _statISO(p.FECHA);
      if (!iso) return;
      if (!cultivoPorCama[id] || iso > cultivoPorCama[id].iso) cultivoPorCama[id] = { iso: iso, nombre: p.NOMBRE_PROC };
    });

    // ── Evolución del turno ANTERIOR, para las camas sin evolución de este ──
    // (Diego, ago-2026): antes esas fichas salían huecas —sedación, SAS,
    // parámetros, plan, todo vacío— y la hoja impresa no servía. Ahora se
    // rellenan con el último turno evolucionado del episodio y la ficha lo
    // AVISA: leer datos de hace 12 h creyéndolos de ahora es peor que el
    // vacío, así que el aviso es parte del arreglo, no un adorno.
    const evoPrevPorCama = {};
    sel.forEach(id => {
      if (evoTurnoPorCama[id]) return;
      const epi = episodioPorCama[id] || [];
      for (let i = epi.length - 1; i >= 0; i--) {
        if (String(epi[i].TURNO_KEY) < turnoKey) { evoPrevPorCama[id] = epi[i]; break; }
      }
    });

    const fichas = sel.map(id => _entFicha(id, camaPorId[id] || {},
      evoTurnoPorCama[id] || null, episodioPorCama[id] || [], cultivoPorCama[id] || null, fecha,
      _fechaEfectivaTurno(fecha, turno), turno, evoPrevPorCama[id] || null));

    const ocupadas = camas.filter(c => esVerdadero(c.OCUPADA)).length;
    const enVM = camas.filter(c => esVerdadero(c.OCUPADA) && String(c.SOPORTE) === 'VM').length;

    return ok({
      fecha: fecha, turno: turno, turnoKey: turnoKey,
      generado: new Date().toISOString(),
      resumen: { ocupadas: ocupadas, enVM: enVM, totalCamas: camas.length, entregadas: fichas.length },
      fichas: fichas,
    });
  } catch (e) { return err('obtenerEntregaTurno: ' + e.message, ERR.INTERNO, e); }
}

/** Ficha de entrega de una cama. */
function _entFicha(id, c, e, episodio, cultivo, fecha, fechaEf, turno, ePrev) {
  // ¿Hay evolución de ESTE turno? Se guarda antes de sustituir por la previa:
  // de aquí salen la franja de aviso y el contador «sin evolución» del
  // encabezado, que NO deben cambiar porque la ficha venga rellenada.
  const tieneEvo = !!e;
  const heredadoDe = (!e && ePrev) ? String(ePrev.TURNO_KEY || '') : '';
  if (!e && ePrev) e = ePrev;   // datos del turno anterior, avisados en la ficha
  const val = (a, b) => (a !== undefined && a !== null && a !== '') ? a : (b !== undefined && b !== null ? b : '');
  const dd = x => { const s = _statISO(x); return s ? s.slice(8, 10) + '-' + s.slice(5, 7) : ''; };

  // ── Eventos FECHADOS del episodio (con hora cuando existe) ──
  const eventos = [];
  // Dos calidades de evento, porque la lista se recorta al final:
  //   `hito` — los que NUNCA se sacrifican: las transiciones de vía aérea y el
  //            RCP. Son pocos por episodio y son su columna vertebral.
  //   `otro` — los repetitivos (PVE, prono/supino, cambios de tubo, traslados),
  //            que sí ceden espacio cuando la lista crece.
  // Hasta ago-2026 la lista se cortaba a los ÚLTIMOS 8 sin distinguir, así que
  // en una estadía larga lo primero que se caía era la intubación del día 1.
  const hito = t => eventos.push({ t: t, fijo: true });
  const otro = t => eventos.push({ t: t, fijo: false });
  episodio.forEach(ev => {
    const f = dd(ev.FECHA);
    if (esVerdadero(ev.INTUB_OCURRIO)) hito('🫁 Intubación ' + f + (ev.INTUB_HORA ? ' ' + ev.INTUB_HORA : ''));
    if (ev.PVE_VAL === 'si' && ev.PVE_RESULTADO) {
      let mot = '';
      if (ev.PVE_RESULTADO === 'frustra') {
        try { const m = JSON.parse(ev.PVE_FR_MOTIVOS || '[]'); if (m.length) mot = ' (' + m.join(', ') + ')'; } catch (x) {}
      }
      otro((ev.PVE_RESULTADO === 'superada' ? '▲ PVE superada ' : '▼ PVE frustra ') + f + mot);
    }
    if (esVerdadero(ev.EXT_OCURRIO)) hito('✂️ Extubación ' + f + (ev.EXT_HORA ? ' ' + ev.EXT_HORA : '') + (ev.EXT_TIPO ? ' (' + ev.EXT_TIPO + ')' : ''));
    // Reintubación: evento · hora · CAUSA (Diego, 14-ago-2026). Era el único
    // evento de vía aérea que salía pelado —solo la fecha— y en la ronda se
    // pregunta POR QUÉ falló: poder responder «por mal manejo de secreciones»
    // o «por mala mecánica» sin ir a buscar la ficha es justamente para lo que
    // sirve la entrega. Los tres datos ya se guardaban; solo no se mostraban.
    // El «queda con» NO va aquí por decisión suya: eso es del formulario, con
    // el resto de las transiciones de vía aérea.
    if (esVerdadero(ev.EXT_REINTUB)) {
      hito('⚠️ Reintubación ' + f + (ev.REINTUB_HORA ? ' ' + ev.REINTUB_HORA : '') +
        (ev.EXT_REINTUB_RAZ ? ' · por ' + String(ev.EXT_REINTUB_RAZ).toLowerCase() : ''));
    }
    if (esVerdadero(ev.TQT_OCURRIO)) hito('🔪 TQT ' + f + (ev.TQT_HORA ? ' ' + ev.TQT_HORA : '') + (ev.TQT_TECNICA ? ' (' + String(ev.TQT_TECNICA).toLowerCase() + ')' : ''));
    if (esVerdadero(ev.DECAN_OCURRIO)) hito('⭕ Decanulación ' + f + (ev.DECAN_HORA ? ' ' + ev.DECAN_HORA : '') + (esVerdadero(ev.DECAN_RECANUL) ? ' → recanulado' : ''));
    if (esVerdadero(ev.PROC_RCP)) {
      const ciclos = String(ev.PROC_RCP_CICLOS || '').trim();
      hito('🚨 RCP ' + f + (ev.PROC_RCP_HORA ? ' ' + ev.PROC_RCP_HORA : '') +
        (ciclos ? ' · ' + ciclos + ' ciclo' + (ciclos === '1' ? '' : 's') : '') +
        (ev.PROC_RCP_DET ? ' — ' + ev.PROC_RCP_DET : ''));
    }
    if (esVerdadero(ev.PROC_PABELLON)) otro('🏥 Traslado a pabellón ' + f);
    if (esVerdadero(ev.PROC_IMAGEN)) otro('🩻 Traslado a imagenología ' + f);
    if (esVerdadero(ev.DESVINC_OCURRIO)) {
      const hrs = String(ev.DESVINC_HORAS || '').replace('.', ',');
      hito('🔌 Desvinculación de VM ' + f + (ev.DESVINC_HORA ? ' ' + ev.DESVINC_HORA : '') +
        (ev.DESVINC_A ? ' → ' + ev.DESVINC_A : '') +
        (esVerdadero(ev.DESVINC_RECONEXION) ? (' · reconectado' + (hrs ? ' tras ' + hrs + ' h' : '')) : ' · SIN reconexión registrada'));
    }
    if (esVerdadero(ev.TOT_CAMBIO)) otro('🔄 Cambio de tubo ' + f);
    if (esVerdadero(ev.TQT_CAMBIO)) otro('🔄 Cambio de cánula ' + f);
    // Esta lista es de lo que OCURRIÓ en el turno: va el cambio de posición,
    // no el hecho de seguir en la misma (antes se repetía turno a turno).
    // Los episodios anteriores a la separación no traen el campo del evento:
    // ahí manda la posición, como siempre.
    const _pronoEv = (ev.RESP_PRONO_EVENTO === undefined || ev.RESP_PRONO_EVENTO === '')
      ? esVerdadero(ev.RESP_POS_PRONO) : esVerdadero(ev.RESP_PRONO_EVENTO);
    const _supEv = (ev.RESP_SUPINO_EVENTO === undefined || ev.RESP_SUPINO_EVENTO === '')
      ? esVerdadero(ev.RESP_POS_SUPINO) : esVerdadero(ev.RESP_SUPINO_EVENTO);
    if (_pronoEv) otro('🔃 Prono ' + f + (ev.RESP_PRONO_HORA ? ' ' + ev.RESP_PRONO_HORA + ' hrs' : ''));
    if (_supEv) {
      const _ph = String(ev.PRONO_HORAS === 0 ? '0' : (ev.PRONO_HORAS || '')).replace('.', ',');
      otro('🔃 Supino ' + f + (ev.RESP_SUPINO_HORA ? ' ' + ev.RESP_SUPINO_HORA + ' hrs' : '') +
        (_ph ? ' · tras ' + _ph + ' h en prono' : ''));
    }
  });

  // El corte: la ficha no puede crecer sin fin, pero lo que se descarta son los
  // repetitivos MÁS ANTIGUOS, nunca un evento fijo. Si el episodio tiene más de
  // ocho transiciones de vía aérea, salen todas — el problema de esa ficha no
  // es que sea larga. Se recorre en orden cronológico, así que lo primero que
  // cede es lo más viejo, y el orden de lo que queda no se altera.
  const _ENT_MAX_EVENTOS = 8;
  let _porCeder = Math.max(0, eventos.length - _ENT_MAX_EVENTOS);
  const eventosTxt = [];
  eventos.forEach(function (x) {
    if (_porCeder > 0 && !x.fijo) { _porCeder--; return; }
    eventosTxt.push(x.t);
  });

  // ── Clasificación de weaning desde los PVE del episodio ──
  const pves = {};
  episodio.forEach(ev => {
    if (ev.PVE_VAL === 'si' && ev.PVE_RESULTADO) pves[String(ev.TURNO_KEY)] = ev.PVE_RESULTADO;
  });
  const weaning = _weaningClase(pves, fecha, val(e && e.VENT_SOPORTE, c.SOPORTE));

  // ── Últimas evaluaciones con fecha (arrastre en cama + CPAx del episodio) ──
  const evals = [];
  if (val(c.ULT_MRC) !== '') evals.push('MRC-SS ' + c.ULT_MRC + (c.ULT_MRC_FECHA ? ' (' + dd(c.ULT_MRC_FECHA) + ')' : ''));
  if (val(c.ULT_FSS) !== '') evals.push('FSS ' + c.ULT_FSS + (c.ULT_FSS_FECHA ? ' (' + dd(c.ULT_FSS_FECHA) + ')' : ''));
  if (val(c.ULT_DINAMO) !== '') evals.push('Dinamo ' + c.ULT_DINAMO + ' kg');
  let cpax = '', cpaxF = '';
  episodio.forEach(ev => { if (val(ev.CPAX_TOTAL) !== '') { cpax = ev.CPAX_TOTAL; cpaxF = dd(ev.FECHA); } });
  if (cpax !== '') evals.push('CPAx ' + cpax + (cpaxF ? ' (' + cpaxF + ')' : ''));

  // ── Hito motor más alto del episodio (pedido de Diego, ago-2026) ──
  // Cada turno aporta su peldaño: manda el IMS si se registró; sin IMS se
  // traduce el nivel KTM del protocolo, que ya es una escalera de hitos
  // (1-2 en cama · 3 SBC · 4 bípedo · 5 marcha). La fecha es la ÚLTIMA vez
  // que se alcanzó ese peldaño (dice qué tan vigente es la capacidad).
  const hitoMotor = _hitoMotorEpisodio(episodio, dd);

  // ── Suspensión de sedación y de BNM (pedido de Diego, ago-2026): fecha de
  // la ÚLTIMA transición a «sin». Si después lo re-sedan, se recalcula sola —
  // un valor no vacío significa que HOY sigue suspendida. ──
  //
  // 🔴 LA FECHA ES DE LA SEDACIÓN **PROFUNDA** (Diego, ago-2026). Antes la
  // borraba cualquier escalón distinto de «Sin sedación», así que anotar
  // precedex para controlar la agitación —que es lo que corresponde
  // clínicamente— contaba como volver a sedación profunda y la fecha
  // desaparecía de la entrega. Y esa fecha es justamente el antes y el después
  // para evaluar la respuesta a la suspensión de hipnóticos y para interpretar
  // el GCS. Una sedación declarada como VIGIL ya no la toca.
  const _profunda = function (ev) {
    const tipo = String(ev.SED_TIPO || '');
    if (!tipo || tipo === 'Sin sedación') return false;
    return !esVerdadero(ev.SED_VIGIL);
  };
  let sedSusp = '', bnmSusp = '', _sedAntes = false, _bnmAntes = false;
  episodio.forEach(function (ev) {
    const tipo = String(ev.SED_TIPO || '');
    if (_profunda(ev)) { _sedAntes = true; sedSusp = ''; }
    else if (tipo && _sedAntes && !sedSusp) sedSusp = dd(ev.FECHA);
    if (esVerdadero(ev.SED_BNM)) { _bnmAntes = true; bnmSusp = ''; }
    else if (_bnmAntes && !bnmSusp) bnmSusp = dd(ev.FECHA);
  });

  // ── Fase clínica (chips de la barra): la del turno, con respaldo en cama ──
  const fases = (function () {
    try { const a = JSON.parse(String(val(e && e.FASE_JSON, c.FASE_JSON) || '[]')); return Array.isArray(a) ? a.filter(Boolean) : []; }
    catch (x) { return []; }
  })();

  // ── Dispositivos de circuito por vencer (por dispositivo, ya no solo VM) ──
  // Etiqueta = día 0 y `cambio` = etiqueta + frecuencia. Ese cambio se ejecuta
  // en la MADRUGADA de esa fecha, o sea en el turno NOCHE de la víspera: por eso
  // «cambiar» sale cuando han pasado frec-1 días, y «vencido» al llegar a frec
  // sin haberlo cambiado. Se mide contra la fecha del TURNO, no la efectiva.
  // Viaja además la fecha EXACTA del cambio, que es lo que la hoja impresa debe
  // mostrar en vez de contadores de días.
  //
  // ⚠️ 10-ago-2026: esta línea era `dias === frec ? 'cambiar'` y avisaba UNA
  // NOCHE TARDE. El resto del sistema (estadoDispositivos en svc_eventos.gs, la
  // hoja de control de filtros y el chip de la Hoja UCI) ya se había corregido a
  // frec-1 esa madrugada; la entrega de turno se quedó atrás y durante unas
  // horas dos papeles de la misma unidad dijeron fechas distintas del mismo
  // filtro. Si vuelves a tocar la regla, tócala en LOS CUATRO lugares.
  // Cada dispositivo sigue a lo que le da sentido, no todos al soporte VM
  // (Diego, 14-ago-2026): T.Care con la vía aérea artificial (TOT/TQT, esté o
  // no en VM) · HME con el circuito de gas (VM sin humidificación activa, o
  // respirando por HME) · HEPA con el ventilador (solo VM con equipo asignado,
  // y si el equipo lo lleva FIJO —PB/Avea, CONFIG HEPA_FIJO_EQUIPOS— no entra
  // aquí: no vence nunca, su instalación es referencia y no aviso). Espejo de
  // estadoDispositivos (svc_eventos.gs).
  const disp = [];
  const _enVM = String(c.SOPORTE) === 'VM';
  const _vaC = String(c.VIA_AEREA || '');
  const _humidC = !!_statISO(c.DISP_HUMID_FECHA);
  const _ventC = _enVM ? _ventNombreDeCama(c.ID_CAMA) : '';
  [['HME', c.DISP_HME_FECHA, 2, (_enVM && !_humidC) || String(c.MODO) === 'HME'],
   ['HEPA', c.DISP_HEPA_FECHA, 3, _enVM && !!_ventC && !_hepaFijoEquipo(_ventC)],
   ['T.Care', c.DISP_TC_FECHA, 3, _vaC === 'TOT' || _vaC === 'TQT']].forEach(function (d) {
    if (!d[3]) return;
    const iso = _statISO(d[1]); if (!iso) return;
    const dias = diasEntre(iso, fecha);
    const cambio = _sumarDiasISO(iso, d[2]);
    disp.push({ n: d[0], dia: dias + 1, dur: d[2], cambio: dd(cambio),
                estado: dias >= d[2] ? 'vencido' : (dias === d[2] - 1 ? 'cambiar' : 'ok') });
  });

  // ── Alertas ──
  const diasVM = e ? val(e.DIAS_VM, '') : ((String(c.SOPORTE) === 'VM') ? diasEntre(c.FECHA_INICIO_SOPORTE, fecha) : '');
  const diasEst = e ? val(e.DIA_ESTADIA, '') : (c.FECHA_INGRESO ? diasEntre(c.FECHA_INGRESO, fecha) : '');
  const alertas = [];
  if (parseInt(diasVM) >= 14) alertas.push('VM ' + diasVM + 'd');
  if (parseInt(diasEst) >= 21) alertas.push(diasEst + 'd UCI');
  if (esVerdadero(c.KTM_SUSP)) alertas.push('KTM contraindicada');
  const coop = /^cooperador$/i.test(String(c.ULT_COOP || '').trim());
  if (coop && val(c.ULT_MRC) === '') alertas.push('MRC-SS pendiente');
  if (coop && val(c.ULT_FSS) === '') alertas.push('FSS-ICU pendiente');
  // Evaluaciones ENVEJECIDAS (cooperador con valor antiguo): mismo patrón que
  // los dispositivos por vencer, con corte configurable EVAL_DIAS_ALERTA.
  const cutEval = parseInt(leerConfig('EVAL_DIAS_ALERTA', '5')) || 5;
  const _edadEval = function (f) { const iso = _statISO(f); return iso ? diasEntre(iso, fecha) : null; };
  const edadMrc = coop && val(c.ULT_MRC) !== '' ? _edadEval(c.ULT_MRC_FECHA) : null;
  if (edadMrc != null && edadMrc > cutEval) alertas.push('MRC-SS hace ' + edadMrc + 'd');
  const edadFss = coop && val(c.ULT_FSS) !== '' ? _edadEval(c.ULT_FSS_FECHA) : null;
  if (edadFss != null && edadFss > cutEval) alertas.push('FSS-ICU hace ' + edadFss + 'd');
  if (!tieneEvo) alertas.push('Sin evolución de este turno');
  // Pronación EN CURSO: el ciclo puede llevar días y cruzar varios turnos, así
  // que el equipo que entra necesita saber desde cuándo va — no basta con ver
  // «Prono» en la posición del último turno.
  let pronoTS = '';
  episodio.forEach(ev2 => {
    if (esVerdadero(ev2.RESP_PRONO_EVENTO) && ev2.PRONO_INICIO_TS) pronoTS = String(ev2.PRONO_INICIO_TS);
    if (esVerdadero(ev2.RESP_SUPINO_EVENTO)) pronoTS = '';
  });
  let prono = null;
  if (pronoTS) {
    const hEnt = _horasEntreTS(pronoTS, _tsEventoTurno(fecha, turno || (e && e.TURNO) || '', ''));
    // Chip propio, NO alerta: estar en prono es un estado del tratamiento, no
    // un aviso. Sin umbral inventado — las sesiones pueden pasar las 24 h.
    prono = { desde: pronoTS, horas: hEnt };
  }

  // ICU-AW: debilidad adquirida en UCI — MRC-SS <48 en paciente cooperador.
  // Se resuelve sola cuando una medición posterior alcanza ≥48.
  const icuaw = (coop && val(c.ULT_MRC) !== '' && parseInt(c.ULT_MRC) < 48)
    ? { mrc: c.ULT_MRC, fecha: dd(c.ULT_MRC_FECHA) } : null;
  // Candidato a PVE: tamizaje sincronizado en la cama al guardar el último turno.
  const candidatoPve = String(c.SOPORTE) === 'VM' && esVerdadero(c.WEAN_CAND_PVE);
  // ¿Cuántos turnos SEGUIDOS lleva candidato sin que se haga la PVE? Se deriva
  // del episodio (sin columnas nuevas): se camina desde el último turno hacia
  // atrás mientras el turno cumpla tamizaje y no registre PVE. Al superar el
  // corte PVE_TURNOS_ALERTA escala a la sección de alertas.
  let pveRacha = 0;
  if (candidatoPve) {
    for (let i = episodio.length - 1; i >= 0; i--) {
      if (_turnoCandidatoPve(episodio[i])) pveRacha++;
      else break;
    }
    const cutPve = parseInt(leerConfig('PVE_TURNOS_ALERTA', '2')) || 2;
    if (pveRacha >= cutPve) alertas.push('Candidato a PVE hace ' + pveRacha + ' turnos sin PVE');
  }

  return {
    idCama: id,
    ocupada: esVerdadero(c.OCUPADA),
    tieneEvo: tieneEvo,
    heredadoDe: heredadoDe,   // turnoKey del que se copiaron los datos ('' si es de este turno)
    nombre: val(e && e.PAC_NOMBRE, c.NOMBRE),
    edad: val(e && e.PAC_EDAD, c.EDAD),
    sexo: val(e && e.PAC_SEXO, c.SEXO),
    diagnostico: val(e && e.PAC_DIAGNOSTICO, c.DIAGNOSTICO),
    diasEstadia: diasEst, diasVM: diasVM,
    // Fecha de ingreso (ago-2026): la pidió Diego para la cabecera de la
    // versión IMPRESA, donde va junto al diagnóstico llenando el blanco que
    // sobraba a la derecha. En pantalla no se muestra (basta el «Nd UCI»).
    fechaIngreso: String(c.FECHA_INGRESO || '').slice(0, 10),
    viaAerea: val(e && e.VENT_VIA_AEREA, c.VIA_AEREA),
    // N° de tubo/cánula y fijación (opción A de Diego, ago-2026): al recibir
    // el turno sirven para verificar la vía aérea sin abrir el panel.
    totN: val(e && e.VENT_TOT_NUM, c.TOT_NUMERO),
    totCm: val(e && e.VENT_TOT_CM, c.TOT_CM_LABIO),
    tqtN: val(e && e.VENT_TQT_CALIBRE, c.TQT_CALIBRE),
    soporte: val(e && e.VENT_SOPORTE, c.SOPORTE),
    modo: val(e && e.VENT_MODO, c.MODO),
    params: e ? _entParams(e) : '',
    mec: e ? _entMec(e) : '',
    gcs: e ? val(e.SED_GCS_TOT) : '',
    gcsOVM: (e && val(e.SED_GCS_O) !== '' && val(e.SED_GCS_V) !== '' && val(e.SED_GCS_M) !== '')
      ? ('O' + e.SED_GCS_O + '·V' + e.SED_GCS_V + '·M' + e.SED_GCS_M) : '',
    pic: e ? val(e.HEMO_PIC) : '', ppc: e ? val(e.HEMO_PPC) : '',
    fases: fases,
    hitoMotor: hitoMotor,
    sedSusp: sedSusp, bnmSusp: bnmSusp,
    catResp: { pje: val(c.CAT_RESP_PJE), nivel: val(c.CAT_RESP_NIVEL) },
    catMotor: { pje: val(c.CAT_MOTOR_PJE), nivel: val(c.CAT_MOTOR_NIVEL) },
    sedTipo: e ? val(e.SED_TIPO) : '',
    // SAS actual + la meta que se persigue, y los sedantes puestos (ago-2026).
    sas: e ? val(e.SED_SAS) : '',
    sasMeta: e ? val(e.SED_SAS_META) : '',
    sedVigil: e ? esVerdadero(e.SED_VIGIL) : false,
    sedFarmacos: (function () {
      try { const a = JSON.parse((e && e.SED_FARMACOS) || '[]'); return Array.isArray(a) ? a : []; }
      catch (x) { return []; }
    })(),
    bnm: e ? esVerdadero(e.SED_BNM) : false,
    cooperacion: val(e && e.SED_COOPERACION, c.ULT_COOP),
    // El valor guardado ya trae el prefijo 'DVA' ('DVA dosis media'); se quita
    // aquí porque la ficha lo antepone al renderizar (evita 'DVA DVA dosis media').
    dva: e ? String(e.HEMO_DVA || '').replace('Sin requerimientos', '').replace(/^DVA\s*/i, '') : '',
    hemoEstado: e ? val(e.HEMO_ESTADO) : '',
    // Secreciones: reología · características · cantidad, EN ESE ORDEN — el
    // mismo de la narrativa («secreciones fluidas mucosas en escasa cantidad»).
    // 🔴 Hasta ago-2026 esta línea se saltaba RESP_SECR_CAR y la entrega decía
    // «Secreciones fluidas +» sin decir NUNCA si eran mucosas o purulentas, que
    // es justo lo que decide si hay infección. Reportado por Diego. La Hoja UCI
    // tenía el defecto espejo (se saltaba la reología): son tres consumidores
    // de la misma regla y se habían separado sin que nadie lo notara.
    // 'auto' en la cantidad = «tose, moviliza y deglute» (15-ago-2026): no hay
    // reología ni características que mostrar — la frase ES el hallazgo.
    secr: e ? (function () {
      var s = [e.RESP_SECR_REOL, e.RESP_SECR_CAR, e.RESP_SECR_QTY].filter(function (x) { return x; }).join(' ');
      return String(e.RESP_SECR_QTY) === 'auto' ? 'tose, moviliza y deglute' : s;
    })() : '',
    ktmNivel: e ? val(e.KTM_NIVEL_KTR, '') : val(c.KTM_NIVEL, ''),
    ktmRealizada: e ? esVerdadero(e.KTM_REALIZADA) : false,
    ktmSuspendida: e ? esVerdadero(e.KTM_SUSPENDIDA) : esVerdadero(c.KTM_SUSP),
    ktmContra: e ? val(e.KTM_CONTRA_RAZON, val(e.KTM_CONTRA_CAT)) : '',
    ktr: e ? val(e.RESP_KTR_CANT, '') : '',
    eventos: eventosTxt,
    evals: evals,
    dispositivos: disp,
    alertas: alertas,
    weaning: weaning,
    prono: prono,
    icuaw: icuaw,
    candidatoPve: candidatoPve,
    pveRacha: pveRacha,
    // El RESULTADO del cultivo no viajaba a la entrega (reporte de Álvaro):
    // solo salía el nombre y la fecha. Se toma el más reciente del episodio.
    ultimoCultivo: cultivo ? { fecha: dd(cultivo.iso), nombre: cultivo.nombre, micro: val(c.AISL_MICRO),
      resultado: (function () {
        const filas = (episodio || []).slice()
          .sort(function (a, b) { return String(b.TURNO_KEY).localeCompare(String(a.TURNO_KEY)); });
        if (e && String(e.EX_CULT_RESULTADO || '').trim()) return String(e.EX_CULT_RESULTADO).trim();
        for (let i = 0; i < filas.length; i++) {
          const r = String(filas[i].EX_CULT_RESULTADO || '').trim();
          if (r) return r;
        }
        return '';
      })() } : null,
    plan: e ? val(e.PLAN_PLANES) : '',
    pendientes: e ? (function () { try { return JSON.parse(e.PLAN_PENDIENTES || '[]') || []; } catch (x) { return []; } })() : [],
    nota: e ? val(e.PLAN_NOTA_TURNO) : '',
    firma: val(e && e.PLAN_FIRMA_KINE, c.FIRMA_KINE),
  };
}

/**
 * ¿Este turno cumplía el tamizaje de candidato a PVE sin registrar PVE?
 * MISMOS criterios que _syncCamaDesdeEvolucion (svc_evoluciones.gs): FiO₂ ≤50,
 * PEEP ≤8, SpO₂ ≥90, HDN estable sin DVA altas, sin BNM, en VM. Sirve para
 * derivar la racha de turnos candidato sin PVE desde el episodio.
 */
function _turnoCandidatoPve(e) {
  // 'nc' = no corresponde por causa de base no resuelta: corta la racha igual
  // que una PVE hecha (ago-2026). Si no, el turno que declara «no procede»
  // seguiría sumando a «candidato hace N turnos sin PVE».
  if (String(e.VENT_SOPORTE) !== 'VM' || e.PVE_VAL === 'si' || e.PVE_VAL === 'nc') return false;
  const n = function (x) { return parseFloat(x); };
  const dva = String(e.HEMO_DVA || '');
  return n(e.VENT_FIO2) > 0 && n(e.VENT_FIO2) <= 50 &&
    n(e.VENT_PEEP) > 0 && n(e.VENT_PEEP) <= 8 &&
    n(e.VENT_SPO2) >= 90 &&
    e.HEMO_ESTADO !== 'Inestable' &&
    (dva === '' || /sin requerimientos|dosis bajas/i.test(dva)) &&
    !esVerdadero(e.SED_BNM);
}

/**
 * Clasificación del weaning (Boles et al., ERJ 2007 / estudio WIND 2017) a
 * partir de los PVE del episodio. Solo aplica mientras el paciente sigue en
 * VM (weaning en curso); superado el primer PVE sin frustros = simple (no se
 * alerta). Difícil: ≥1 PVE frustro. Prolongado: ≥3 frustros o >7 días desde
 * el primer PVE.
 * @param {Object} pves {turnoKey: 'superada'|'frustra'}
 * @param {string} fechaRef ISO de referencia (fecha de la entrega)
 * @param {string} soporte soporte actual del paciente
 * @return {?Object} {clase:'dificil'|'prolongado', frustras, dias, primerPve} o null
 */
function _weaningClase(pves, fechaRef, soporte) {
  if (String(soporte) !== 'VM') return null;
  const keys = Object.keys(pves || {}).sort();
  if (!keys.length) return null;
  const primer = keys[0].slice(0, 10);
  const frustras = keys.filter(function (k) { return pves[k] === 'frustra'; }).length;
  const dias = diasEntre(primer, fechaRef);
  const clase = (frustras >= 3 || dias > 7) ? 'prolongado' : (frustras >= 1 ? 'dificil' : '');
  return clase ? { clase: clase, frustras: frustras, dias: dias, primerPve: primer } : null;
}

/** Parámetros ventilatorios clave en texto compacto (solo no vacíos). */
function _entParams(e) {
  const out = [];
  const push = function (lbl, key) {
    const x = e[key];
    if (x !== '' && x !== null && x !== undefined) out.push(lbl + ' ' + x);
  };
  push('FiO₂', 'VENT_FIO2'); push('PEEP', 'VENT_PEEP'); push('PS', 'VENT_PS');
  push('IPAP', 'VENT_IPAP'); push('EPAP', 'VENT_EPAP');
  push('VT', 'VENT_VT'); push('FR', 'VENT_FR'); push('SpO₂', 'VENT_SPO2');
  // Litros y flujo POR SOPORTE (decisión de Diego, ago-2026): los litros solo
  // aportan con naricera o mascarilla simple, el flujo solo con CNAF, y la
  // Venturi (MMV) va SOLO con su FiO₂. En VM ninguno de los dos dice nada y
  // arrastrarlos ensuciaba la línea con restos del soporte anterior.
  const sop = String(e.VENT_SOPORTE || ''), modo = String(e.VENT_MODO || '');
  const esCNAF = sop === 'CNAF' || /^(CNAF|OAF\/CTAF)$/i.test(modo);
  // MR = mascarilla de reservorio (antes de ago-2026 se registraba «Mascarilla»)
  if (/^(NRC|Naricera(-NRC)?|MR|Mascarilla)$/i.test(modo)) push('L', 'VENT_LITROS');
  if (esCNAF) push('Flujo', 'VENT_FLUJO');
  return out.join(' · ');
}

/**
 * Mecánica medida y derivados que cambian conductas (opción A de Diego,
 * ago-2026): Pmax · Ppl · DP · Cest · PaFi. AutoPEEP, Ti e I:E quedan en el
 * historial — la entrega es la foto, no la bitácora.
 */
function _entMec(e) {
  const out = [];
  const push = function (lbl, key) {
    const x = e[key];
    if (x !== '' && x !== null && x !== undefined) out.push(lbl + ' ' + x);
  };
  push('Pmax', 'VENT_PMAX'); push('Ppl', 'VENT_PPL');
  push('DP', 'CALC_DP'); push('Cest', 'CALC_CESR'); push('PaFi', 'VENT_PAFI');
  return out.join(' · ');
}

/**
 * Hito motor más alto del episodio. Peldaños: 1 en cama · 2 SBC · 3 bípedo ·
 * 4 marcha. El IMS (0-10) manda cuando se registró; sin IMS se traduce el
 * nivel KTM (1-2 → en cama, 3 → SBC, 4 → bípedo, 5 → marcha). La fecha (y el
 * IMS mostrado) son de la ÚLTIMA vez que se alcanzó el peldaño máximo.
 */
function _hitoMotorEpisodio(episodio, dd) {
  const LBL = ['', 'en cama', 'SBC', 'bípedo', 'marcha'];
  const rankIMS = function (n) { return n >= 6 ? 4 : n >= 4 ? 3 : n >= 3 ? 2 : 1; };
  const rankKTM = function (n) { return n >= 5 ? 4 : n >= 4 ? 3 : n >= 3 ? 2 : 1; };
  let max = 0, fechaMax = '', imsMax = '';
  (episodio || []).forEach(function (ev) {
    const imsRaw = String(ev.EVAL_IMS === 0 ? '0' : (ev.EVAL_IMS || '')).trim();
    const ims = imsRaw === '' ? NaN : parseInt(imsRaw, 10);
    const niv = parseInt(ev.KTM_NIVEL_KTR, 10);
    let r = 0, imsVal = '';
    if (!isNaN(ims)) { r = rankIMS(ims); imsVal = imsRaw; }
    else if (esVerdadero(ev.KTM_REALIZADA) && !isNaN(niv)) r = rankKTM(niv);
    if (r && r >= max) { max = r; fechaMax = dd(ev.FECHA); imsMax = imsVal; }
  });
  return max ? { nivel: LBL[max], ims: imsMax, fecha: fechaMax } : null;
}

/** Guarda una entrega emitida como historial (hoja ENTREGAS_TURNO). */
function guardarEntregaTurno(payload, ctx) {
  return conLock(function () {
    try {
      const r = payload.resumen || {};
      const fila = {
        // El campo se llama ID en el esquema: con ID_ENTREGA la columna
        // quedaba vacía en silencio (el upsert descarta claves desconocidas).
        ID: 'ENT_' + Date.now(),
        TIMESTAMP: ahoraTS(),
        FECHA: payload.fecha || '',
        TURNO: payload.turno || '',
        KINE_ENTREGA: payload.kineEntrega || (ctx && ctx.firma) || '',
        KINE_RECIBE: payload.kineRecibe || '',
        AUTOR_EMAIL: (ctx && ctx.email) || '',
        CAMAS_N: (payload.idCamas || []).length,
        OCUPADAS: r.ocupadas || '',
        EN_VM: r.enVM || '',
        CAMAS_IDS: (payload.idCamas || []).join(','),
        NOTAS: payload.notas || '',
        SNAPSHOT_JSON: String(payload.snapshotJson || '').slice(0, 45000),
      };
      repoInsertar('ENTREGAS_TURNO', fila);
      return ok({ id: fila.ID, entidad: 'ENTREGAS_TURNO' });
    } catch (e) { return err('guardarEntregaTurno: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Historial de entregas (cabeceras, sin el snapshot pesado). */
function obtenerEntregasTurno(limite) {
  try {
    const rows = repoLeerTodos('ENTREGAS_TURNO').map(function (v) {
      return { id: v.ID, timestamp: v.TIMESTAMP, fecha: v.FECHA, turno: v.TURNO,
               kineEntrega: v.KINE_ENTREGA, kineRecibe: v.KINE_RECIBE, camasN: v.CAMAS_N,
               ocupadas: v.OCUPADAS, enVM: v.EN_VM, camasIds: v.CAMAS_IDS, notas: v.NOTAS };
    });
    rows.reverse();
    return ok(limite ? rows.slice(0, limite) : rows);
  } catch (e) { return err('obtenerEntregasTurno: ' + e.message, ERR.INTERNO, e); }
}


// ════════════════════════════════════════════════════════════════════
// ── svc_equipos.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_equipos.gs — Seguimiento de ventiladores de la unidad.
 *
 * Inventario vivo (hoja VENTILADORES: se agregan y dan de baja equipos) +
 * trazabilidad de movimientos (hoja MOVIMIENTOS_VM). Un ventilador está en
 * una CAMA, en BODEGA o en PRESTAMO a otra unidad (Urgencias, UTI, Medicina,
 * Neurología, Cirugía…). Toda escritura pasa por api.gs y queda auditada.
 */

/**
 * Repara ventiladores sin ID_VM (filas cargadas a mano o de versiones viejas):
 * les asigna un ID único. Sin ID, el tablero no puede seleccionarlos ni moverlos
 * (todos los de id vacío se marcaban juntos). Idempotente: corre las veces que
 * quieras. Ejecutar desde el editor de Apps Script.
 */
function repararIdsVentiladores() {
  const rows = repoLeerTodos('VENTILADORES');
  let n = 0;
  rows.forEach(function (x) {
    if (!String(x.ID_VM || '').trim()) {
      const nid = uid('VM');
      // clave de búsqueda: por nombre (única en la práctica) para ubicar la fila
      repoActualizar('VENTILADORES', 'NOMBRE', x.NOMBRE, { ID_VM: nid });
      n++;
    }
  });
  SpreadsheetApp.flush();
  const msg = 'Ventiladores reparados (ID asignado): ' + n;
  console.log(msg);
  return msg;
}

/**
 * Categoría de un equipo (ago-2026, corrección de Diego a un supuesto mío).
 * Los 33 equipos NO son todos «ventiladores»:
 *   VM    · soporte invasivo. Parte de la sala: OCUPA la cama.
 *   VNI   · V60, Carina. Soporte que va al PACIENTE («queda en una cama pero
 *           no vive ahí»), no a la cama.
 *   CNAF  · Airvo 2. Igual que VNI: del paciente.
 *   APOYO · «dispositivos de apoyo»: MR850, capnógrafos, Aerogen. No son
 *           soporte, acompañan.
 * Si la columna viene vacía (equipos cargados antes de esta versión) se
 * DERIVA del modelo/nombre: así el inventario ya cargado se clasifica solo,
 * sin pedirle a nadie que lo reescriba.
 */
function _vmCategoria(x) {
  const guardada = String(x.CATEGORIA || '').trim().toUpperCase();
  if (guardada) return guardada;
  const t = (String(x.MODELO || '') + ' ' + String(x.NOMBRE || '') + ' ' +
             String(x.MARCA || '') + ' ' + String(x.OBS || '')).toUpperCase();
  if (/AIRVO|CNAF|OPTIFLOW/.test(t)) return 'CNAF';
  if (/V60|CARINA|BIPAP|VNI/.test(t)) return 'VNI';
  if (/MR ?850|AEROGEN|CAPN[OÓ]GRAFO|NIHON|DR[AÄ]GER VISTA|HUMIDIFICAD/.test(t)) return 'APOYO';
  return 'VM';
}
/** ¿Este equipo ocupa el casillero de la cama? Solo el VM invasivo. */
function _vmEsDeCama(cat) { return String(cat) === 'VM'; }

function obtenerVentiladores() {
  try {
    const rows = repoLeerTodos('VENTILADORES').map(function (x) {
      const cat = _vmCategoria(x);
      return {
        id: x.ID_VM, nombre: x.NOMBRE, marca: x.MARCA, modelo: x.MODELO,
        serie: x.NUM_SERIE, inventario: x.NUM_INVENTARIO, anio: x.ANIO_ADQ,
        ubicTipo: x.UBIC_TIPO, ubicDetalle: String(x.UBIC_DETALLE || ''),
        fechaUbicacion: _statISO(x.FECHA_UBICACION),
        estado: x.ESTADO || 'Operativo', activo: esVerdadero(x.ACTIVO), obs: x.OBS || '',
        fechaMant: _statISO(x.FECHA_MANT), fechaMantProx: _statISO(x.FECHA_MANT_PROX),
        categoria: cat, deCama: _vmEsDeCama(cat),
      };
    });
    rows.sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es', { numeric: true }); });
    return ok(rows);
  } catch (e) { return err('obtenerVentiladores: ' + e.message, ERR.INTERNO, e); }
}

/** Etiqueta legible de una ubicación (para el historial de movimientos). */
function _vmUbicLabel(tipo, detalle) {
  if (tipo === 'CAMA') return 'Cama ' + detalle;
  if (tipo === 'PRESTAMO') return 'Préstamo: ' + (detalle || '¿unidad?');
  if (tipo === 'PASILLO') return 'Pasillo';
  if (tipo === 'EQUIPOS') return 'Equipos médicos';
  return 'Bodega';
}

/** Alta o edición de metadatos. El movimiento de ubicación va por moverVentilador. */
function guardarVentilador(d, ctx) {
  return conLock(function () {
    try {
      if (!d.nombre) return err('El ventilador necesita un nombre/código.', ERR.VALIDACION);
      const esNuevo = !d.id;
      const id = d.id || uid('VM');
      const previo = esNuevo ? null : repoBuscarPorId('VENTILADORES', 'ID_VM', id);
      if (!esNuevo && !previo) return err('Ventilador no encontrado: ' + id, ERR.VALIDACION);
      const ubicTipo = d.ubicTipo || (previo && previo.UBIC_TIPO) || 'BODEGA';
      const fila = {
        ID_VM: id, NOMBRE: d.nombre,
        MARCA: d.marca || '', MODELO: d.modelo || '',
        NUM_SERIE: d.serie || '', NUM_INVENTARIO: d.inventario || '',
        ANIO_ADQ: d.anio || '',
        UBIC_TIPO: ubicTipo,
        UBIC_DETALLE: d.ubicDetalle !== undefined ? String(d.ubicDetalle || '') : String((previo && previo.UBIC_DETALLE) || ''),
        FECHA_UBICACION: esNuevo ? (_statISO(d.fecha) || hoyISO()) : (previo ? previo.FECHA_UBICACION : hoyISO()),
        ESTADO: d.estado || (previo && previo.ESTADO) || 'Operativo',
        ACTIVO: true, OBS: d.obs !== undefined ? d.obs : ((previo && previo.OBS) || ''),
        FECHA_MANT: d.fechaMant !== undefined ? (_statISO(d.fechaMant) || '') : String((previo && previo.FECHA_MANT) || ''),
        FECHA_MANT_PROX: d.fechaMantProx !== undefined ? (_statISO(d.fechaMantProx) || '') : String((previo && previo.FECHA_MANT_PROX) || ''),
        TIMESTAMP: ahoraTS(),
      };
      // Categoría: la que venga del formulario o, si no, la que se deduce del
      // modelo. Se PERSISTE para que deje de depender de la deducción — el día
      // que llegue un equipo con nombre raro, basta corregirlo una vez.
      fila.CATEGORIA = String(d.categoria || '').trim().toUpperCase() ||
                       _vmCategoria(Object.assign({}, previo || {}, fila));
      repoUpsert('VENTILADORES', 'ID_VM', id, fila);
      if (esNuevo) {
        repoInsertar('MOVIMIENTOS_VM', {
          ID_MOV: uid('MOV'), ID_VM: id, TIMESTAMP: ahoraTS(),
          FECHA: fila.FECHA_UBICACION, DESDE: 'ALTA EN INVENTARIO',
          HACIA: _vmUbicLabel(fila.UBIC_TIPO, fila.UBIC_DETALLE),
          MOTIVO: d.motivo || 'Ingreso al inventario', FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
        });
      }
      return ok({ id: id, accion: esNuevo ? 'alta' : 'editar', entidad: 'VENTILADORES' });
    } catch (e) { return err('guardarVentilador: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Mueve un ventilador a una cama, a bodega o a préstamo; deja huella en MOVIMIENTOS_VM. */
function moverVentilador(d, ctx) {
  return conLock(function () {
    try {
      const vmx = repoBuscarPorId('VENTILADORES', 'ID_VM', d.idVm);
      if (!vmx) return err('Ventilador no encontrado.', ERR.VALIDACION);
      if (!esVerdadero(vmx.ACTIVO)) return err('El ventilador está dado de baja.', ERR.VALIDACION);
      const tipo = d.tipo;
      if (['CAMA', 'BODEGA', 'PRESTAMO', 'PASILLO', 'EQUIPOS'].indexOf(tipo) === -1) return err('Destino inválido.', ERR.VALIDACION);
      if (tipo === 'CAMA' && !d.detalle) return err('Indica el número de cama.', ERR.VALIDACION);
      if (tipo === 'PRESTAMO' && !d.detalle) return err('Indica la unidad del préstamo.', ERR.VALIDACION);
      const detalle = (tipo === 'CAMA' || tipo === 'PRESTAMO') ? String(d.detalle) : '';
      // Una cama tiene UN SOLO VM invasivo (choca con otro); el resto de
      // categorías (VNI/CNAF/APOYO) «queda en una cama pero no vive ahí» y
      // puede coexistir con el VM y entre sí (ago-2026, corregido de paso: el
      // choque rechazaba CUALQUIER segundo equipo en la cama sin mirar la
      // categoría — habría bloqueado el traslado de una VNI/CNAF a una cama
      // que ya tenía su propio VM).
      if (tipo === 'CAMA' && _vmEsDeCama(_vmCategoria(vmx))) {
        const choque = repoLeerTodos('VENTILADORES').find(function (x) {
          return esVerdadero(x.ACTIVO) && x.UBIC_TIPO === 'CAMA' && String(x.UBIC_DETALLE) === detalle &&
            x.ID_VM !== vmx.ID_VM && _vmEsDeCama(_vmCategoria(x));
        });
        if (choque) return err('La cama ' + detalle + ' ya tiene asignado ' + choque.NOMBRE + '. Muévelo primero.', ERR.VALIDACION);
      }
      const fecha = _statISO(d.fecha) || hoyISO();
      const desde = _vmUbicLabel(vmx.UBIC_TIPO, vmx.UBIC_DETALLE);
      const hacia = _vmUbicLabel(tipo, detalle);
      repoActualizar('VENTILADORES', 'ID_VM', d.idVm, {
        UBIC_TIPO: tipo, UBIC_DETALLE: detalle, FECHA_UBICACION: fecha,
        ESTADO: d.estado || vmx.ESTADO || 'Operativo', TIMESTAMP: ahoraTS(),
      });
      repoInsertar('MOVIMIENTOS_VM', {
        ID_MOV: uid('MOV'), ID_VM: d.idVm, TIMESTAMP: ahoraTS(), FECHA: fecha,
        DESDE: desde, HACIA: hacia, MOTIVO: d.motivo || '',
        FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
      });
      return ok({ id: d.idVm, accion: 'mover', entidad: 'VENTILADORES', resumen: desde + ' → ' + hacia });
    } catch (e) { return err('moverVentilador: ' + e.message, ERR.INTERNO, e); }
  });
}

/**
 * Mueve VARIOS ventiladores de una vez (reorganización de la unidad, mantención
 * de equipos). Pedido de Diego (ago-2026): confirmar uno por uno era lento.
 *
 * TODO O NADA: primero valida el lote COMPLETO contra el estado FINAL y, si algo
 * no cuadra, no escribe nada y devuelve la lista de problemas. Validar el estado
 * final (y no movimiento a movimiento) permite además INTERCAMBIAR ventiladores
 * entre camas, que uno por uno obligaba a pasar por bodega o pasillo.
 * Cada movimiento deja igual su registro en MOVIMIENTOS_VM.
 */
function moverVentiladoresLote(d, ctx) {
  return conLock(function () {
    try {
      const movs = (d && d.movimientos) || [];
      if (!movs.length) return err('No hay movimientos que aplicar.', ERR.VALIDACION);

      const equipos = repoLeerTodos('VENTILADORES');
      const porId = {};
      equipos.forEach(function (x) { porId[String(x.ID_VM)] = x; });

      // ── 1. Validación previa: nada se escribe hasta que todo el lote cuadre ──
      const problemas = [];
      const vistos = {};
      const normal = [];
      movs.forEach(function (m, i) {
        const n = i + 1;
        const vmx = porId[String(m.idVm)];
        const nom = (vmx && vmx.NOMBRE) || ('movimiento ' + n);
        if (!vmx) { problemas.push('Movimiento ' + n + ': ventilador no encontrado.'); return; }
        if (!esVerdadero(vmx.ACTIVO)) { problemas.push(nom + ': está dado de baja.'); return; }
        if (vistos[String(m.idVm)]) { problemas.push(nom + ': aparece dos veces en la lista.'); return; }
        vistos[String(m.idVm)] = true;
        const tipo = m.tipo;
        if (['CAMA', 'BODEGA', 'PRESTAMO', 'PASILLO', 'EQUIPOS'].indexOf(tipo) === -1) {
          problemas.push(nom + ': destino inválido.'); return;
        }
        if (tipo === 'CAMA' && !m.detalle) { problemas.push(nom + ': falta el número de cama.'); return; }
        if (tipo === 'PRESTAMO' && !m.detalle) { problemas.push(nom + ': falta la unidad del préstamo.'); return; }
        normal.push({
          idVm: String(m.idVm), vmx: vmx, tipo: tipo,
          detalle: (tipo === 'CAMA' || tipo === 'PRESTAMO') ? String(m.detalle) : '',
          motivo: m.motivo || '', fecha: _statISO(m.fecha) || hoyISO(), estado: m.estado || '',
        });
      });

      // Estado FINAL de las camas: las que no se mueven + las del lote.
      // Solo el VM invasivo es exclusivo por cama (igual que moverVentilador);
      // VNI/CNAF/APOYO pueden coexistir con él y entre sí.
      if (!problemas.length) {
        const camaFinal = {};
        equipos.forEach(function (x) {
          if (!esVerdadero(x.ACTIVO) || x.UBIC_TIPO !== 'CAMA' || !_vmEsDeCama(_vmCategoria(x))) return;
          if (vistos[String(x.ID_VM)]) return;          // este se mueve: su cama queda libre
          camaFinal[String(x.UBIC_DETALLE)] = x.NOMBRE || x.ID_VM;
        });
        normal.forEach(function (m) {
          if (m.tipo !== 'CAMA' || !_vmEsDeCama(_vmCategoria(m.vmx))) return;
          const ya = camaFinal[m.detalle];
          if (ya) problemas.push('La cama ' + m.detalle + ' quedaría con dos ventiladores: ' + ya + ' y ' + (m.vmx.NOMBRE || m.idVm) + '.');
          else camaFinal[m.detalle] = m.vmx.NOMBRE || m.idVm;
        });
      }

      if (problemas.length) {
        return err('No se aplicó ningún movimiento:\n· ' + problemas.join('\n· '), ERR.VALIDACION);
      }

      // ── 2. Aplicación: el lote ya está validado por completo ──
      const resumen = [];
      normal.forEach(function (m) {
        const desde = _vmUbicLabel(m.vmx.UBIC_TIPO, m.vmx.UBIC_DETALLE);
        const hacia = _vmUbicLabel(m.tipo, m.detalle);
        repoActualizar('VENTILADORES', 'ID_VM', m.idVm, {
          UBIC_TIPO: m.tipo, UBIC_DETALLE: m.detalle, FECHA_UBICACION: m.fecha,
          ESTADO: m.estado || m.vmx.ESTADO || 'Operativo', TIMESTAMP: ahoraTS(),
        });
        repoInsertar('MOVIMIENTOS_VM', {
          ID_MOV: uid('MOV'), ID_VM: m.idVm, TIMESTAMP: ahoraTS(), FECHA: m.fecha,
          DESDE: desde, HACIA: hacia, MOTIVO: m.motivo,
          FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
        });
        resumen.push((m.vmx.NOMBRE || m.idVm) + ': ' + desde + ' → ' + hacia);
      });
      return ok({ entidad: 'VENTILADORES', accion: 'mover ' + normal.length + ' equipos',
        total: normal.length, detalle: resumen });
    } catch (e) { return err('moverVentiladoresLote: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Baja de inventario (no borra: conserva la trazabilidad). */
function bajaVentilador(d, ctx) {
  return conLock(function () {
    try {
      const vmx = repoBuscarPorId('VENTILADORES', 'ID_VM', d.idVm);
      if (!vmx) return err('Ventilador no encontrado.', ERR.VALIDACION);
      repoActualizar('VENTILADORES', 'ID_VM', d.idVm, {
        ACTIVO: false, ESTADO: 'De baja', UBIC_TIPO: 'BODEGA', UBIC_DETALLE: '',
        FECHA_UBICACION: hoyISO(), TIMESTAMP: ahoraTS(),
      });
      repoInsertar('MOVIMIENTOS_VM', {
        ID_MOV: uid('MOV'), ID_VM: d.idVm, TIMESTAMP: ahoraTS(), FECHA: hoyISO(),
        DESDE: _vmUbicLabel(vmx.UBIC_TIPO, vmx.UBIC_DETALLE), HACIA: 'BAJA DE INVENTARIO',
        MOTIVO: d.motivo || '', FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
      });
      return ok({ id: d.idVm, accion: 'baja', entidad: 'VENTILADORES' });
    } catch (e) { return err('bajaVentilador: ' + e.message, ERR.INTERNO, e); }
  });
}

function obtenerMovimientosVM(idVm, limite) {
  try {
    let rows = repoLeerTodos('MOVIMIENTOS_VM');
    if (idVm) rows = rows.filter(function (m) { return String(m.ID_VM) === String(idVm); });
    rows.sort(function (a, b) { return String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)); });
    if (limite) rows = rows.slice(0, limite);
    return ok(rows.map(function (m) {
      return { fecha: _statISO(m.FECHA), desde: m.DESDE, hacia: m.HACIA, motivo: m.MOTIVO || '', firma: m.FIRMA || '' };
    }));
  } catch (e) { return err('obtenerMovimientosVM: ' + e.message, ERR.INTERNO, e); }
}

/**
 * importarDispositivosUCI — carga el inventario real de ventiladores de la UCI
 * (planilla oficial "Lista de dispositivos UCIA"). Idempotente: NO duplica
 * (omite equipos cuyo N° de inventario ya existe; los de inventario en blanco
 * se cotejan por nombre). Correr UNA vez desde el editor de Apps Script.
 */
function importarDispositivosUCI() {
  const SEED = [
    {n:"AVEA 1",ma:"AVEA",inv:"8-24072",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala"},
    {n:"AVEA 2",ma:"AVEA",inv:"8-24073",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2025-04-03",ob:"Tipo: Sala · Ubic. real: Equipos Médicos · No pasa mantención (calibración de peep) + falta filtro"},
    {n:"AVEA 3",ma:"AVEA",inv:"8-24074",es:"Operativo",ac:true,ut:"CAMA",ud:"8",fm:"2025-04-01",ob:"Tipo: Sala"},
    {n:"MEKICS",ma:"MEKICS",inv:"8-27932",es:"Operativo",ac:true,ut:"PRESTAMO",ud:"Neurocirugía",fm:"2026-04-27",ob:"Tipo: Sala · *Ventilador asignado a Neuro / Cambio celda O2 03/02/2026"},
    {n:"MEKICS",ma:"MEKICS",inv:"8-27926",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Piso Mecánico / EM · Compresor externo (No pasa mant, falta sensor de flujo y membrana)"},
    {n:"MEKICS 12",ma:"MEKICS",inv:"8-28721",es:"Operativo",ac:true,ut:"CAMA",ud:"14",fm:"2026-04-27",ob:"Tipo: Sala · Fallas anteriores: se rompe enchufe / Cambio celda O2 03/02/2026"},
    {n:"MEKICS",ma:"MEKICS",inv:"8-28399",es:"Operativo",ac:true,ut:"PRESTAMO",ud:"UTI",fm:"2026-04-27",ob:"Tipo: Sala · *Ventilador de la UTI / Cambio celda O2 03/02/2026"},
    {n:"MEKICS",ma:"MEKICS",inv:"8-27917",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Piso Mecánico / EM · Compresor externo / Cambio celda O2 03/02/2026"},
    {n:"MEKICS  1",ma:"MEKICS",inv:"8-27409",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Equipos Médicos · Falla sensor de flujo / Cambio celda O2 03/02/2026"},
    {n:"MEKICS  2",ma:"MEKICS",inv:"8-27410",es:"Operativo",ac:true,ut:"PRESTAMO",ud:"Préstamo Ovalle",fm:"",ob:"Tipo: Sala · Ex préstamo a Ovalle, última mantención: 27/04/2026."},
    {n:"MEKICS  3",ma:"MEKICS",inv:"8-27411",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Cambio válvula exhalatoria y sensor de flujo 04/07 // Fallas anteriores: sensor de flujo / 15/05 falla sensor de flujo, marca Vmin muyalto, paciente sedado bien acoplado en VC / Cambio celda O2 03/02/2026"},
    {n:"MEKICS  4",ma:"MEKICS",inv:"8-27412",es:"Operativo",ac:true,ut:"CAMA",ud:"11",fm:"2026-04-27",ob:"Tipo: Sala · Fallos anteriores: pantalla / falla sensor de flujo"},
    {n:"MEKICS  5",ma:"MEKICS",inv:"8-27413",es:"Operativo",ac:true,ut:"CAMA",ud:"1",fm:"2026-04-27",ob:"Tipo: Sala · Cambio celda O2 03/02/2026"},
    {n:"MEKICS  6",ma:"MEKICS",inv:"8-27414",es:"Operativo",ac:true,ut:"CAMA",ud:"6",fm:"2026-04-27",ob:"Tipo: Sala · Fallos anteriores: falta membrana"},
    {n:"MEKICS  7",ma:"MEKICS",inv:"8-27417",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2025-04-01",ob:"Tipo: Sala · Ubic. real: Piso Mecánico / EM · Equipo con compresor externo"},
    {n:"MEKICS  9",ma:"MEKICS",inv:"8-27923",es:"Operativo",ac:true,ut:"CAMA",ud:"13",fm:"2026-04-27",ob:"Tipo: Sala"},
    {n:"MEKICS 10",ma:"MEKICS",inv:"8-28401",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · *Cambio sensor de flujo y membrana 03/07/2025 *Falla de flujo 11/07/2025 / Cambio celda O2 03/02/2026"},
    {n:"MEKICS 11",ma:"MEKICS",inv:"8-28402",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · *No gatilla en espontáneo / Nominación duplicada: Nº 15"},
    {n:"MEKICS 8",ma:"MEKICS",inv:"8-27920",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Piso Mecánico / EM · Compresor externo"},
    {n:"NEWPORT 1",ma:"NEWPORT",inv:"8-27350",es:"En mantención",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Transporte · Ubic. real: Transporte · Pendiente cambio sensor de oxígeno."},
    {n:"PURITAN BENNETT 1",ma:"PURITAN BENNETT",inv:"8-27544 / 8-27545",es:"Operativo",ac:true,ut:"CAMA",ud:"3",fm:"",ob:"Tipo: Sala · PB 1 y 2 corresponden al mismo VM (mismo N° de serie) / Válvula de seguridad reparada por equipos médicos / Falla 15/05 aparentemente por mal cierre de válvula de seguridad. Mantención preventiva 12/02/26. Cambio de batería, retorna 04/06."},
    {n:"PURITAN BENNETT 2",ma:"PURITAN BENNETT",inv:"8-27546",es:"Operativo",ac:true,ut:"CAMA",ud:"12",fm:"",ob:"Tipo: Sala · Mantención preventiva 12/02/26."},
    {n:"SAVINA 1",ma:"SAVINA",inv:"8-20429",es:"Operativo",ac:true,ut:"CAMA",ud:"9",fm:"2026-04-27",ob:"Tipo: Sala · Esperando respuestos (EM)"},
    {n:"SAVINA 2",ma:"SAVINA",inv:"8-20430",es:"Operativo",ac:true,ut:"CAMA",ud:"7",fm:"2025-04-24",ob:"Tipo: Sala · *Pendiente revisión por equipos médicos"},
    {n:"SAVINA 3",ma:"SAVINA",inv:"8-20431",es:"Operativo",ac:true,ut:"CAMA",ud:"5",fm:"2025-04-25",ob:"Tipo: Sala · Esperando respuestos (EM)"},
    {n:"SAVINA 4",ma:"SAVINA",inv:"8-20432",es:"Operativo",ac:true,ut:"CAMA",ud:"18",fm:"2026-04-27",ob:"Tipo: Sala"},
    {n:"SERVO U 1",ma:"SERVO U",inv:"8-27549",es:"Operativo",ac:true,ut:"CAMA",ud:"17",fm:"2026-04-27",ob:"Tipo: Sala · *Pendiente compra batería interna"},
    {n:"VELA 1",ma:"VELA",inv:"8-15015",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Equipos Médicos · N° Serie AHTO8081 / Pendiente rótulo"},
    {n:"VELA 10",ma:"VELA",inv:"8-24309",es:"Operativo",ac:true,ut:"CAMA",ud:"10",fm:"2026-04-27",ob:"Tipo: Sala"},
    {n:"VELA 11",ma:"VELA",inv:"8-24310",es:"Operativo",ac:true,ut:"CAMA",ud:"16",fm:"2026-04-27",ob:"Tipo: Sala"},
    {n:"VELA 12",ma:"VELA",inv:"8-24311",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"",ob:"Tipo: Sala · Ubic. real: Equipos médicos · Dado de baja por EM"},
    {n:"VELA 13",ma:"VELA",inv:"",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"",ob:"*Ya no hay VELA S/N"},
    {n:"VELA 2",ma:"VELA",inv:"8-15053",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"",ob:"*No aparece en inventario"},
    {n:"VELA 3",ma:"VELA",inv:"8-18419",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Transporte · Fuera de servicio por evaluación mantención 01/04/2025. No pasa mantención 01/04. 2025, se repara y retorna."},
    {n:"VELA 4",ma:"VELA",inv:"8-24075",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2025-04-01",ob:"Tipo: Sala · 06/10: Se envía a EM operativo pero con sonido de turbina muy fuerte. 03/02/26 Dado de baja por equipos médicos."},
    {n:"VELA 5",ma:"VELA",inv:"8-24076",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2025-04-02",ob:"Tipo: Sala · 03/02/26 Falla sensor de flujo, dado de baja por equipos médicos12/02/26"},
    {n:"VELA 6",ma:"VELA",inv:"8-24078",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"",ob:""},
    {n:"VELA 7",ma:"VELA",inv:"8-24079",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"",ob:"Tipo: Sala · Ubic. real: Equipos médicos"},
    {n:"VELA 8",ma:"VELA",inv:"8-24080",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Transporte"},
    {n:"VELA 9",ma:"VELA",inv:"8-24307",es:"Operativo",ac:true,ut:"CAMA",ud:"4",fm:"2026-04-27",ob:"Tipo: Sala · Falla: se apaga y prende luego de multiples intentos / 06/10/25: Conector diamond dañado"},
    {n:"V60 1",ma:"V60",inv:"8-27537",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: VNI"},
    {n:"V60 2",ma:"V60",inv:"8-27538",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: VNI"},
    {n:"V60 3",ma:"V60",inv:"8-25587",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: VNI · *Placa número de inventario: 8-25587, pero Equipos Médicos corrige número en cartel rótulo: 8-25387"},
    {n:"V60 4",ma:"V60",inv:"8-25389",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: VNI"},
    {n:"Carina UCI Pediátrica",ma:"Carina UCI Pediátrica",inv:"8-16227",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Transporte"},
    {n:"PB 980 UCI PED 1",ma:"PB 980 UCI PED",inv:"8-27535",es:"Operativo",ac:true,ut:"CAMA",ud:"2",fm:"2026-04-27",ob:"Tipo: Sala - Préstamo UCIP"},
    {n:"PB 980 UCI PED 2",ma:"PB 980 UCI PED",inv:"8-VMPB01",es:"Operativo",ac:true,ut:"CAMA",ud:"15",fm:"2026-04-27",ob:"Tipo: Sala - Préstamo UCIP"},
    {n:"MEKICS 14",ma:"MEKICS",inv:"8-28400",es:"En mantención",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Cama 10 (ocupada en lista) · *Cambio sensor de flujo y membrana 03/07/2025 / Falla sensor de flujo. En espera de repuesto por batería."},
    {n:"MEKICS 15",ma:"MEKICS",inv:"8-28402",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · *Cambio sensor de flujo y membrana 03/07/2025"},
    {n:"MEKICS 16",ma:"MEKICS",inv:"8-28722",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · *VMI recuperado de Ovalle /  Cambio celda O2 03/02/2026"},
    {n:"MEKICS 17",ma:"MEKICS",inv:"8-27929",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Pendiente rótulo."},
  ];
  const existentes = repoLeerTodos('VENTILADORES');
  const invSet = {}, nomSet = {};
  existentes.forEach(function (x) {
    const inv = String(x.NUM_INVENTARIO || '').trim();
    if (inv) invSet[inv.toLowerCase()] = true;
    nomSet[String(x.NOMBRE || '').trim().toLowerCase()] = true;
  });
  let agregados = 0, omitidos = 0;
  SEED.forEach(function (d) {
    const inv = String(d.inv || '').trim();
    const yaExiste = inv ? invSet[inv.toLowerCase()] : nomSet[String(d.n).trim().toLowerCase()];
    if (yaExiste) { omitidos++; return; }
    const id = uid('VM');
    const fecha = d.fm || hoyISO();
    repoInsertar('VENTILADORES', {
      ID_VM: id, NOMBRE: d.n, MARCA: d.ma || '', MODELO: '',
      NUM_SERIE: '', NUM_INVENTARIO: inv, ANIO_ADQ: '',
      UBIC_TIPO: d.ut, UBIC_DETALLE: d.ud || '',
      FECHA_UBICACION: fecha, ESTADO: d.es, ACTIVO: !!d.ac, OBS: d.ob || '',
      FECHA_MANT: d.fm || '', FECHA_MANT_PROX: '', TIMESTAMP: ahoraTS(),
    });
    repoInsertar('MOVIMIENTOS_VM', {
      ID_MOV: uid('MOV'), ID_VM: id, TIMESTAMP: ahoraTS(), FECHA: fecha,
      DESDE: 'IMPORTACIÓN INICIAL', HACIA: _vmUbicLabel(d.ut, d.ud || ''),
      MOTIVO: 'Carga del inventario oficial UCIA', FIRMA: 'SYS', AUTOR_EMAIL: '',
    });
    if (inv) invSet[inv.toLowerCase()] = true;
    nomSet[String(d.n).trim().toLowerCase()] = true;
    agregados++;
  });
  const msg = 'Importación UCIA: ' + agregados + ' agregados, ' + omitidos + ' ya existían.';
  console.log(msg);
  return msg;
}

/* ══ Historial de FALLAS por equipo (v4) ══
   Descripción OBLIGATORIA + foto OPCIONAL. La foto se comprime en el cliente
   (canvas) y llega en base64; se guarda en Drive (carpeta en CONFIG, creada
   al primer uso) y en la hoja va la URL. TODO-O-NADA: si Drive falla, no se
   escribe la fila. Las fotos no se comparten públicamente. */
function _fallasCarpeta() {
  const id = leerConfig('FALLAS_FOTOS_FOLDER', '');
  if (id) {
    try { return DriveApp.getFolderById(id); }
    catch (e) { /* carpeta borrada o sin acceso: se crea una nueva abajo */ }
  }
  const f = DriveApp.createFolder('RCE-KINE — Fallas de ventiladores');
  escribirConfig('FALLAS_FOTOS_FOLDER', f.getId());
  return f;
}
function registrarFallaVM(d, ctx) {
  ctx = ctx || {};
  return conLock(function () {
    try {
      const idVm = String(d.idVm || '');
      const desc = String(d.descripcion || '').trim();
      if (!idVm) return err('Falta el ventilador.', ERR.VALIDACION);
      if (!desc) return err('La descripción de la falla es obligatoria.', ERR.VALIDACION);
      const vmx = repoBuscarPorId('VENTILADORES', 'ID_VM', idVm);
      if (!vmx) return err('Ventilador no encontrado.', ERR.VALIDACION);

      // Foto: validar en el SERVIDOR (no basta el accept del input)
      let fotoUrl = '';
      if (d.fotoB64) {
        const mime = String(d.fotoMime || '');
        if (mime.indexOf('image/') !== 0) return err('El archivo debe ser una imagen.', ERR.VALIDACION);
        if (String(d.fotoB64).length > 6000000) return err('La foto es demasiado grande incluso comprimida (máx ~4 MB).', ERR.VALIDACION);
        const nombre = 'falla_' + String(vmx.NOMBRE || idVm).replace(/[^\w.-]+/g, '_') + '_' + hoyISO() + '_' + uid('F').slice(-6) + '.jpg';
        const blob = Utilities.newBlob(Utilities.base64Decode(d.fotoB64), mime, nombre);
        fotoUrl = _fallasCarpeta().createFile(blob).getUrl();   // si esto lanza, NO se escribe la fila
      }

      const fila = {
        ID_FALLA: uid('FALLA'), ID_VM: idVm, NOMBRE_VM: String(vmx.NOMBRE || ''),
        TIMESTAMP: ahoraTS(), FECHA: hoyISO(), DESCRIPCION: desc, FOTO_URL: fotoUrl,
        FIRMA: String(ctx.firma || d.firmaKine || ''), AUTOR_EMAIL: String(ctx.email || ''),
      };
      repoInsertar('FALLAS_VM', fila);
      // El equipo queda marcado con falla (estado visible en el inventario y
      // en el tag de la cama); se normaliza a mano al repararlo.
      repoActualizar('VENTILADORES', 'ID_VM', idVm, { ESTADO: 'Con falla' });
      SpreadsheetApp.flush();
      return ok({ entidad: 'FALLAS_VM', id: fila.ID_FALLA, idVm: idVm, fotoUrl: fotoUrl,
        accion: 'falla registrada: ' + String(vmx.NOMBRE || idVm) });
    } catch (e) { return err('registrarFallaVM: ' + e.message, ERR.INTERNO, e); }
  });
}
function obtenerFallasVM(idVm, limite) {
  try {
    const lim = parseInt(limite) || 30;
    const filas = repoLeerTodos('FALLAS_VM', 'ID_VM', String(idVm || ''))
      .sort(function (a, b) { return String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)); })
      .slice(0, lim)
      .map(function (x) { return { id: x.ID_FALLA, fecha: _statISO(x.FECHA), desc: String(x.DESCRIPCION || ''),
        foto: String(x.FOTO_URL || ''), firma: String(x.FIRMA || '') }; });
    return ok({ fallas: filas, total: filas.length });
  } catch (e) { return err('obtenerFallasVM: ' + e.message, ERR.INTERNO, e); }
}

// ═══════════════════════════════════════════════════════════════════════════
//  STOCK SIN NUMERAR (ago-2026) — Aerogen Pro-X, capnógrafos.
//  Equipos que la unidad NO puede seguir uno por uno (no tienen número), así
//  que se llevan por CANTIDAD. Cada ajuste (sacar/reponer) deja su fila en
//  MOVIMIENTOS_STOCK con motivo y firma: si mañana faltan dos, el libro dice
//  por qué. No se asignan a camas (sería un dato imposible de verificar).
// ═══════════════════════════════════════════════════════════════════════════
/** Reparto por cama guardado como JSON: {"4":1,"7":2}. Tolera basura. */
function _stkAsig(fila) {
  try {
    const o = typeof fila.ASIGNACION_JSON === 'string'
      ? JSON.parse(fila.ASIGNACION_JSON || '{}') : (fila.ASIGNACION_JSON || {});
    const limpio = {};
    Object.keys(o || {}).forEach(function (k) {
      const n = parseInt(o[k], 10) || 0;
      if (n > 0) limpio[String(k)] = n;
    });
    return limpio;
  } catch (e) { return {}; }
}
function _stkEnUso(asig) {
  return Object.keys(asig).reduce(function (s, k) { return s + (parseInt(asig[k], 10) || 0); }, 0);
}

function obtenerStockEquipos() {
  try {
    const filas = repoLeerTodos('STOCK_EQUIPOS')
      .filter(function (x) { return esVerdadero(x.ACTIVO); })
      .map(function (x) {
        const asig = _stkAsig(x);
        const cant = parseInt(x.CANTIDAD, 10) || 0;
        const enUso = _stkEnUso(asig);
        return { id: String(x.ID_STOCK || ''), nombre: String(x.NOMBRE || ''),
          marca: String(x.MARCA || ''), modelo: String(x.MODELO || ''),
          categoria: String(x.CATEGORIA || ''), cantidad: cant,
          asignacion: asig, enUso: enUso, disponible: Math.max(0, cant - enUso),
          estado: String(x.ESTADO || 'Operativo'), obs: String(x.OBS || '') };
      });
    filas.sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es', { numeric: true }); });
    // Último ajuste por ítem (para mostrarlo en la tarjeta sin abrir el historial)
    const ult = {};
    repoLeerTodos('MOVIMIENTOS_STOCK').forEach(function (m) {
      const k = String(m.ID_STOCK || '');
      if (!ult[k] || String(m.TIMESTAMP) > String(ult[k].TIMESTAMP)) ult[k] = m;
    });
    filas.forEach(function (f) {
      const m = ult[f.id];
      f.ultimo = m ? { fecha: _statISO(m.FECHA), delta: parseInt(m.DELTA, 10) || 0,
        motivo: String(m.MOTIVO || ''), firma: String(m.FIRMA || '') } : null;
    });
    return ok(filas);
  } catch (e) { return err('obtenerStockEquipos: ' + e.message, ERR.INTERNO, e); }
}

/** Alta o edición de un tipo de equipo sin número (no toca la cantidad si no viene). */
function guardarStockEquipo(d, ctx) {
  return conLock(function () {
    try {
      if (!d.nombre) return err('El equipo necesita un nombre.', ERR.VALIDACION);
      const esNuevo = !d.id;
      const id = d.id || uid('STK');
      const previo = esNuevo ? null : repoBuscarPorId('STOCK_EQUIPOS', 'ID_STOCK', id);
      if (!esNuevo && !previo) return err('Equipo de stock no encontrado: ' + id, ERR.VALIDACION);
      const cant = d.cantidad !== undefined && d.cantidad !== ''
        ? Math.max(0, parseInt(d.cantidad, 10) || 0)
        : (previo ? (parseInt(previo.CANTIDAD, 10) || 0) : 0);
      const fila = {
        ID_STOCK: id, NOMBRE: d.nombre,
        MARCA: d.marca !== undefined ? d.marca : String((previo && previo.MARCA) || ''),
        MODELO: d.modelo !== undefined ? d.modelo : String((previo && previo.MODELO) || ''),
        CATEGORIA: d.categoria !== undefined ? d.categoria : String((previo && previo.CATEGORIA) || ''),
        CANTIDAD: cant,
        ESTADO: d.estado || (previo && previo.ESTADO) || 'Operativo',
        ACTIVO: d.activo !== undefined ? !!d.activo : true,
        OBS: d.obs !== undefined ? d.obs : String((previo && previo.OBS) || ''),
        TIMESTAMP: ahoraTS(),
      };
      repoUpsert('STOCK_EQUIPOS', 'ID_STOCK', id, fila);
      if (esNuevo && cant > 0) {
        repoInsertar('MOVIMIENTOS_STOCK', {
          ID_MOV: uid('MST'), ID_STOCK: id, NOMBRE: fila.NOMBRE, TIMESTAMP: ahoraTS(),
          FECHA: _statISO(d.fecha) || hoyISO(), DELTA: cant, CANTIDAD_FINAL: cant,
          MOTIVO: d.motivo || 'Carga inicial', DETALLE: d.detalle || '',
          FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
        });
      }
      return ok({ id: id, accion: esNuevo ? 'alta' : 'editar', entidad: 'STOCK_EQUIPOS' });
    } catch (e) { return err('guardarStockEquipo: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Saca (delta negativo) o repone (positivo) unidades, con motivo obligatorio. */
function ajustarStockEquipo(d, ctx) {
  return conLock(function () {
    try {
      const item = repoBuscarPorId('STOCK_EQUIPOS', 'ID_STOCK', String(d.id || ''));
      if (!item) return err('Equipo de stock no encontrado.', ERR.VALIDACION);
      const delta = parseInt(d.delta, 10) || 0;
      if (!delta) return err('Indica cuántas unidades sacar o reponer.', ERR.VALIDACION);
      if (!String(d.motivo || '').trim()) return err('El ajuste necesita un motivo.', ERR.VALIDACION);
      const antes = parseInt(item.CANTIDAD, 10) || 0;
      const final = antes + delta;
      if (final < 0) return err('No puedes sacar ' + Math.abs(delta) + ': solo hay ' + antes + '.', ERR.VALIDACION);
      // Lo que está en una cama NO se puede dar de baja sin devolverlo antes.
      const enUso = _stkEnUso(_stkAsig(item));
      if (final < enUso) {
        return err('Hay ' + enUso + ' en camas: devuélvelos antes de sacarlos del inventario (disponibles: ' + (antes - enUso) + ').', ERR.VALIDACION);
      }
      repoActualizar('STOCK_EQUIPOS', 'ID_STOCK', item.ID_STOCK, { CANTIDAD: final, TIMESTAMP: ahoraTS() });
      repoInsertar('MOVIMIENTOS_STOCK', {
        ID_MOV: uid('MST'), ID_STOCK: item.ID_STOCK, NOMBRE: String(item.NOMBRE || ''), TIMESTAMP: ahoraTS(),
        FECHA: _statISO(d.fecha) || hoyISO(), DELTA: delta, CANTIDAD_FINAL: final,
        MOTIVO: String(d.motivo), DETALLE: String(d.detalle || ''),
        FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
      });
      return ok({ id: item.ID_STOCK, antes: antes, cantidad: final, entidad: 'STOCK_EQUIPOS' });
    } catch (e) { return err('ajustarStockEquipo: ' + e.message, ERR.INTERNO, e); }
  });
}

/**
 * Reparto por cama (ago-2026, pedido de Diego: «los que tienen stock igual
 * van a una cama definida»). Sin número no importa CUÁL de los 10 Aerogen
 * está en la cama 7, sino cuántos hay ahí: se mueven unidades entre el pool
 * disponible y cada cama. delta > 0 asigna a la cama; delta < 0 devuelve.
 */
function asignarStockACama(d, ctx) {
  return conLock(function () {
    try {
      const item = repoBuscarPorId('STOCK_EQUIPOS', 'ID_STOCK', String(d.id || ''));
      if (!item) return err('Equipo de stock no encontrado.', ERR.VALIDACION);
      const cama = String(d.idCama || '').trim();
      if (!cama) return err('Indica a qué cama.', ERR.VALIDACION);
      const delta = parseInt(d.delta, 10) || 0;
      if (!delta) return err('Indica cuántas unidades mover.', ERR.VALIDACION);

      const asig = _stkAsig(item);
      const total = parseInt(item.CANTIDAD, 10) || 0;
      const enCama = parseInt(asig[cama], 10) || 0;
      const disponible = total - _stkEnUso(asig);

      if (delta > 0 && delta > disponible) {
        return err('Solo hay ' + disponible + ' disponible(s) para asignar.', ERR.VALIDACION);
      }
      if (delta < 0 && Math.abs(delta) > enCama) {
        return err('La cama ' + cama + ' tiene ' + enCama + '.', ERR.VALIDACION);
      }
      const nuevo = enCama + delta;
      if (nuevo > 0) asig[cama] = nuevo; else delete asig[cama];

      repoActualizar('STOCK_EQUIPOS', 'ID_STOCK', item.ID_STOCK, {
        ASIGNACION_JSON: JSON.stringify(asig), TIMESTAMP: ahoraTS(),
      });
      repoInsertar('MOVIMIENTOS_STOCK', {
        ID_MOV: uid('MST'), ID_STOCK: item.ID_STOCK, NOMBRE: String(item.NOMBRE || ''), TIMESTAMP: ahoraTS(),
        FECHA: _statISO(d.fecha) || hoyISO(), DELTA: 0, CANTIDAD_FINAL: total,
        MOTIVO: delta > 0 ? 'Asignado a cama' : 'Devuelto de cama',
        DETALLE: String(d.detalle || ''),
        DESDE: delta > 0 ? 'Disponible' : ('Cama ' + cama),
        HACIA: delta > 0 ? ('Cama ' + cama) : 'Disponible',
        FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
      });
      return ok({ id: item.ID_STOCK, cama: cama, enCama: nuevo,
        disponible: total - _stkEnUso(asig), entidad: 'STOCK_EQUIPOS' });
    } catch (e) { return err('asignarStockACama: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Historial de ajustes de un tipo de equipo (lo más reciente primero). */
function obtenerMovimientosStock(idStock, limite) {
  try {
    const lim = Math.min(parseInt(limite, 10) || 20, 100);
    const filas = repoLeerTodos('MOVIMIENTOS_STOCK', 'ID_STOCK', String(idStock || ''))
      .sort(function (a, b) { return String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)); })
      .slice(0, lim)
      .map(function (x) { return { fecha: _statISO(x.FECHA), delta: parseInt(x.DELTA, 10) || 0,
        final: parseInt(x.CANTIDAD_FINAL, 10) || 0, motivo: String(x.MOTIVO || ''),
        detalle: String(x.DETALLE || ''), firma: String(x.FIRMA || ''),
        desde: String(x.DESDE || ''), hacia: String(x.HACIA || '') }; });
    return ok({ movs: filas, total: filas.length });
  } catch (e) { return err('obtenerMovimientosStock: ' + e.message, ERR.INTERNO, e); }
}


// ════════════════════════════════════════════════════════════════════
// ── svc_eventos.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_eventos.gs — Eventos rápidos post-evolución + reloj de dispositivos.
 * (jul-2026, acordado con coordinación)
 *
 * «Pasé a las 16:30 y cambié el filtro»: anotar SIN abrir el panel completo.
 * Tipos: procedimiento (catálogo) · cambio de HME/HEPA/sonda de aspiración ·
 * resultado de cultivo · otro. Nada toca el TEXTO de la evolución: va a la
 * línea de tiempo, a la estadística (procedimientos) y al reloj de
 * dispositivos. Cualquier colega puede anotar (firma propia).
 *
 * Reloj de dispositivos (CAMAS_ESTADO.DISP_*_FECHA):
 *  - Frecuencias en CONFIG: HME 2 días · HEPA 3 · sonda 3.
 *  - FECHA EFECTIVA: el turno Noche fecha al día siguiente (el turno del 27
 *    termina el 28 — misma lógica de turnos de la plataforma).
 *  - El reloj parte al conectar a VM (dispositivos asumidos instalados ese
 *    día, DISP_CONFIRMADO=false hasta que el kine acepte o ajuste).
 *  - CADA DISPOSITIVO SIGUE A LO QUE LE DA SENTIDO, no todos al soporte VM
 *    (Diego, 14-ago-2026): el Trach Care va con la VÍA AÉREA artificial
 *    (TOT/TQT, esté o no en VM); el HME va con el circuito de gas (VM sin
 *    humidificación activa, o respirando por HME — modo HME con TOT/TQT); el
 *    HEPA va con el VENTILADOR (solo VM y solo si la cama tiene equipo
 *    asignado — sin ventilador no hay dónde ponerlo).
 *  - HEPA FIJO: los equipos de CONFIG HEPA_FIJO_EQUIPOS (por defecto PB y
 *    Avea) llevan filtro HEPA propio que se mantiene desde su instalación —
 *    la fecha se muestra como referencia y NUNCA entra al ciclo de cambio.
 *    La Vela y el resto siguen con el ciclo normal.
 */

const _EVENTO_DISPS = [
  { k: 'hme',   campo: 'DISP_HME_FECHA',   nombre: 'HME',                 icono: '🌫️', confKey: 'FREC_HME_DIAS',   frecDef: 2 },
  { k: 'hepa',  campo: 'DISP_HEPA_FECHA',  nombre: 'HEPA',                icono: '🛡️', confKey: 'FREC_HEPA_DIAS',  frecDef: 3 },
  { k: 'sonda', campo: 'DISP_TC_FECHA',    nombre: 'Sonda de aspiración', icono: '➿', confKey: 'FREC_SONDA_DIAS', frecDef: 3 },
];

// _fechaEfectivaTurno() se mudó a infra_fechas.gs (ago-2026): es un helper de
// fechas puro y desde que los DÍAS DE ESTADÍA también lo usan lo necesitan
// svc_evoluciones, svc_entrega y mantenimiento_manuel. Dejarlo aquí obligaba a
// cada arnés a cargar svc_eventos entero para poder guardar una evolución.

/**
 * Estado del reloj de una cama respecto de una fecha de referencia.
 *
 * La fecha de ETIQUETA es el día 0 y `fechaCambio` = etiqueta + frecuencia. Ese
 * cambio se ejecuta en la MADRUGADA de esa fecha, o sea en el turno NOCHE de la
 * VÍSPERA: el turno noche del día D trabaja en la madrugada de D+1 — el mismo
 * mecanismo de «fecha efectiva» con que se etiqueta el dispositivo nuevo.
 *
 * 🪤 CORREGIDO EL 10-ago-2026 (reportado por Manuel desde el turno): el aviso
 * salía en el turno noche del día etiqueta+frec, o sea una noche TARDE, y el
 * error se acumulaba ciclo a ciclo. Se ve en la propia secuencia con que se
 * validó la regla anterior: HME cambiado en la noche del 06 → se etiqueta 07
 * (fecha efectiva = la madrugada en que se cambió) → volvía a pedirse la noche
 * del 09, o sea la madrugada del 10. Son TRES días de HME cuando el HME dura
 * DOS. Aquel ejemplo solo miraba el PRIMER ciclo (ingreso el 04 en turno día),
 * donde la etiqueta es un día real y no una madrugada, y ahí no se notaba.
 * La propiedad que hay que conservar: entre dos cambios pasan exactamente
 * `frec` días — la cubre `eventos.js` midiendo el intervalo, no memorizando
 * fechas.
 *   · cambiaEstaNoche: la madrugada que viene es la del cambio (dias===frec-1).
 *   · vence (vencido): esa madrugada pasó sin cambio (dias >= frec).
 *   · venceManana: el cambio es en la madrugada siguiente (dias === frec - 2).
 *   · fechaCambio: la fecha EXACTA del cambio (etiqueta + frec), para que la
 *     interfaz muestre fechas y no contadores de días.
 */
function estadoDispositivos(cama, fechaRef) {
  const ref = String(fechaRef || hoyISO()).slice(0, 10);
  const enVM = String(cama.SOPORTE) === 'VM';
  const va = String(cama.VIA_AEREA || '');
  const humid = !!_statISO(cama.DISP_HUMID_FECHA);
  const modoHME = String(cama.MODO) === 'HME';
  const ventNom = enVM ? _ventNombreDeCama(cama.ID_CAMA) : '';
  const hepaFija = !!ventNom && _hepaFijoEquipo(ventNom);
  return _EVENTO_DISPS.map(d => {
    const fecha = _statISO(cama[d.campo]);
    const frec = parseInt(leerConfig(d.confKey, String(d.frecDef))) || d.frecDef;
    const dias = fecha ? Math.round((new Date(ref) - new Date(fecha)) / 864e5) : null;
    // Regla por dispositivo (Diego, 14-ago-2026 — ver cabecera del archivo).
    let aplica, fija = false;
    if (d.k === 'hepa') { aplica = enVM && !!ventNom && !!fecha; fija = aplica && hepaFija; }
    else if (d.k === 'hme') { aplica = ((enVM && !humid) || modoHME) && !!fecha; }
    else { aplica = (va === 'TOT' || va === 'TQT') && !!fecha; }
    const cicla = aplica && !fija;   // el HEPA fijo se muestra pero no vence
    return {
      k: d.k, nombre: d.nombre, icono: d.icono, fecha: fecha, frec: frec, dias: dias,
      fechaCambio: (fecha && !fija) ? _sumarDiasISO(fecha, frec) : '',
      aplica: aplica, fija: fija,
      cambiaEstaNoche: cicla && dias !== null && dias === frec - 1,
      vence: cicla && dias !== null && dias >= frec,
      venceManana: cicla && dias !== null && dias === frec - 2,
    };
  });
}

/**
 * Nombre del ventilador (categoría VM) asignado a una cama, para la regla del
 * HEPA. Lee VENTILADORES UNA vez por ejecución (memo): la entrega y
 * cambiosEstaNoche recorren la unidad entera y no pueden pagar una lectura por
 * cama. Mismo criterio del censo (svc_camas.gs): ACTIVO, ubicado en CAMA y
 * de categoría VM — el V60/Airvo acompaña al paciente, no ocupa el casillero.
 */
// `var` a propósito: en GAS cada ejecución parte con el memo vacío, y en los
// arneses de las guardias (que cargan este archivo con eval) `var` deja el
// memo alcanzable para resetearlo entre escenarios.
var _ventPorCamaMemo = null;
function _ventNombreDeCama(idCama) {
  if (_ventPorCamaMemo === null) {
    _ventPorCamaMemo = {};
    try {
      repoLeerTodos('VENTILADORES').forEach(function (x) {
        if (!esVerdadero(x.ACTIVO) || x.UBIC_TIPO !== 'CAMA' || !x.UBIC_DETALLE) return;
        if (!_vmEsDeCama(_vmCategoria(x))) return;
        _ventPorCamaMemo[String(x.UBIC_DETALLE)] = String(x.NOMBRE || '');
      });
    } catch (e) { /* sin inventario legible: se comporta como «sin equipo» */ }
  }
  return _ventPorCamaMemo[String(idCama)] || '';
}

/**
 * ¿Este ventilador lleva HEPA FIJO (sin ciclo de cambio)? Se decide por
 * PREFIJO del nombre contra CONFIG HEPA_FIJO_EQUIPOS («PB,Avea» si la fila no
 * existe): así «PB 1», «PB 2», «Avea 1» y «Avea 3» calzan sin enumerarlos, y
 * un equipo nuevo se agrega editando CONFIG, sin tocar código. El espejo del
 * cliente es _hepaFijoEquipo en index.html — si cambias la regla, en ambos.
 */
function _hepaFijoEquipo(nombre) {
  const n = String(nombre || '').trim().toUpperCase();
  if (!n) return false;
  return String(leerConfig('HEPA_FIJO_EQUIPOS', 'PB,Avea')).split(',')
    .map(function (s) { return s.trim().toUpperCase(); })
    .filter(Boolean)
    .some(function (p) { return n.indexOf(p) === 0; });
}

/** fecha ISO + n días, sin pasar por Date del navegador (mediodía UTC evita
 *  que un huso horario corra el día — la causa clásica del desfase). */
function _sumarDiasISO(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + (parseInt(n, 10) || 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Qué dispositivos se cambian ESTA NOCHE en toda la unidad (y cuáles quedaron
 * atrasados). fecha = el día D cuyo turno Noche hará los cambios, trabajando en
 * la madrugada de D+1: HME con etiqueta D-1, HEPA y Trach Care con etiqueta D-2.
 * El dispositivo nuevo se etiqueta D+1 (fecha efectiva del turno noche —
 * mecanismo ya existente), y así entre dos cambios pasan exactamente `frec`
 * días. Ver la nota de `estadoDispositivos`: hasta el 10-ago-2026 esto pedía
 * etiqueta D-2 / D-3 y el aviso salía una noche tarde.
 */
function cambiosEstaNoche(fecha) {
  try {
    const ref = String(fecha || hoyISO()).slice(0, 10);
    const camas = [];
    repoLeerTodos('CAMAS_ESTADO').forEach(function (c) {
      if (!esVerdadero(c.OCUPADA)) return;
      const disps = estadoDispositivos(c, ref)
        .filter(function (x) { return x.aplica && (x.cambiaEstaNoche || x.vence); })
        .map(function (x) {
          return { k: x.k, nombre: x.nombre, icono: x.icono, etiqueta: x.fecha,
                   fechaCambio: x.fechaCambio, estado: x.vence ? 'vencido' : 'esta_noche',
                   // el atraso se cuenta desde la madrugada en que tocaba (frec-1)
                   diasAtraso: x.vence ? (x.dias - (x.frec - 1)) : 0 };
        });
      if (disps.length) camas.push({ idCama: String(c.ID_CAMA), nombre: String(c.NOMBRE || ''), dispositivos: disps });
    });
    camas.sort(function (a, b) { return (parseInt(a.idCama) || 0) - (parseInt(b.idCama) || 0); });
    return ok({ fecha: ref, camas: camas });
  } catch (e) { return err('cambiosEstaNoche: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Anexa un evento rápido al turno. datos: { idCama, turnoKey, tipo, hora,
 * detalle, proc (nombre de catálogo si tipo=procedimiento), cultTipo,
 * cultHallazgo (si tipo=cultivo) }.
 */
function anexarEventoRapido(datos, ctx) {
  ctx = ctx || {};
  return conLock(() => {
    try {
      const idCama = String(datos.idCama || '');
      const turnoKey = String(datos.turnoKey || '');
      const tipo = String(datos.tipo || '');
      const hora = String(datos.hora || '').trim();
      const detalle = String(datos.detalle || '').trim();
      if (!idCama || !turnoKey || !tipo) return err('Faltan cama, turno o tipo de evento.', ERR.VALIDACION);
      const m = turnoKey.match(/^(\d{4}-\d{2}-\d{2})-(Dia|Noche)$/);
      if (!m) return err('TURNO_KEY inválido.', ERR.VALIDACION);
      const fecha = m[1], turno = m[2];
      const fechaEf = _fechaEfectivaTurno(fecha, turno);

      const cama = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
      const pidCama = String((cama && cama.PATIENT_ID) || '');

      /* 🔴 LA CAMA YA NO AUTORIZA: CLASIFICA. Antes bastaba con que la cama
         estuviera ocupada, y el turno se resolvía por `ID_EVOLUCION`, que
         identifica una CAMA en un turno y no a una persona. En una cama que rotó
         —un paciente egresa y otro ingresa el mismo turno, 39 veces en agosto—
         eso hacía dos daños a la vez: lo anotado para el que egresó aterrizaba en
         la ficha del que entró, y al que egresó no había forma de corregirlo
         porque «su cama no está ocupada».

         🪤 Al localizador se le pasa SOLO el episodio DECLARADO, nunca el de la
         cama. Pasarle el de la cama parecería más servicial y sería el bug: en
         una cama rotada resolvería siempre al ocupante de hoy, en silencio y sin
         ambigüedad aparente. Sin episodio declarado se resuelve por clave, y si
         la clave calza con dos, se rechaza: son dos personas distintas y no hay
         forma de adivinar cuál. */
      const ubic = _ubicarEvolucionDeTurno(String(datos.patientId || ''), turnoKey, idCama);
      if (ubic && ubic.ambigua) {
        // El mensaje NO nombra al otro paciente ni su pid: esto va a un toast en
        // pantalla, no al Logger del editor (Ley 19.628).
        return err('La cama ' + idCama + ' tuvo dos pacientes en ese turno. Abre el turno desde el ' +
          'Registro Diario, sobre la fila del paciente que quieres corregir.', ERR.VALIDACION);
      }
      if (!cama && !ubic) return err('La cama ' + idCama + ' no existe.', ERR.VALIDACION);

      const pidEvo = String((ubic && ubic.obj && ubic.obj.PATIENT_ID) || '');
      /* EN CAMA = la evolución es del ocupante actual. CERRADO = todo lo demás
         (egresado, cama limpiada, cama re-ocupada, trasladada).
         La fila SIN pid pasa como EN CAMA a propósito, misma regla que
         `_mtoRepararAjenas`: bloquearla escondería procedimientos verdaderos de
         camas reparadas a mano. Y NO se le estampa identidad — adoptarla podría
         ser adoptar la del paciente anterior, y eso no se deshace. */
      const enCama = ubic ? (!pidEvo || (!!pidCama && pidEvo === pidCama))
                          : (!!cama && esVerdadero(cama.OCUPADA));
      const pid = ubic ? pidEvo : pidCama;
      // 15 caracteres cortaban «Klgo. Diego Melo» (son 16) y la línea de tiempo
      // mostraba «Klgo. Diego Mel». El límite existe solo para que un valor
      // absurdo no reviente la celda; 60 es el mismo techo que usa la
      // auditoría de firmas en mantenimiento.gs.
      const firma = String(ctx.firma || datos.firma || '').slice(0, 60);
      const hrTxt = hora ? ' ' + hora + ' hrs' : '';

      /* 🔐 EL CANDADO DEL ➕ (decisión de Manuel, 20-ago-2026): corregir el
         PASADO exige clave de coordinación, aunque el botón viva en el
         Registro Diario. Sin esto, la pestaña 🔐 quedaba inútil — lo que
         protege con clave se conseguía por esta puerta sin clave (la V38
         quitó el freno accidental «la cama no está ocupada» para poder
         corregir al paciente correcto, y de rebote dejó el pasado abierto).
         El alcance decidido: pide clave con el episodio CERRADO (egresado,
         cama rotada) o con FECHA PASADA; el ➕ del turno de HOY sobre el
         paciente en cama sigue libre, para no meterle fricción a la ronda —
         y «hoy» incluye la noche en curso, cuya fecha EFECTIVA es hoy (a las
         2 AM la ronda sigue siendo la noche de ayer). El candado vive AQUÍ,
         en el servidor: con AUTH_DEV_MODE=TRUE cualquiera con el enlace
         llega al dispatcher, así que esconder el botón no protege nada. El
         rechazo queda auditado por el dispatcher (ANEXAR_EVENTO_RECHAZADO). */
      const esPasado = fecha !== hoyISO() && fechaEf !== hoyISO();
      let firmaCoord = '';
      if (!enCama || esPasado) {
        const ses = coordExigirSesion(String(datos.coordToken || ''));
        if (!ses.ok) {
          // Con token vencido se explica la sesión; sin token, el camino.
          if (datos.coordToken) return err(ses.error, ERR.NO_AUTORIZADO);
          return err('Corregir un turno pasado —o de un paciente que ya no está en la cama— requiere ' +
            'clave de coordinación: entra en la pestaña 🔐 COORDINACIÓN y vuelve a intentarlo.', ERR.NO_AUTORIZADO);
        }
        firmaCoord = String(ses.firma || '');
      }

      let texto = '', tipoHito = 'evento';
      const disp = _EVENTO_DISPS.find(d => d.k === tipo);

      if (disp) {
        /* 🔴 El reloj `DISP_*_FECHA` vive en CAMAS_ESTADO — una fila que, si el
           episodio está cerrado, HOY es de otra persona. Aplicarlo le reiniciaría
           el reloj al ocupante actual y `cambiosEstaNoche` dejaría de avisar un
           cambio real: el filtro se quedaría puesto de más. Por eso los
           dispositivos son lo único que NO se corrige hacia atrás. */
        if (!enCama) {
          return err('El cambio de ' + disp.nombre + ' no se puede anotar hacia atrás: el reloj del ' +
            'filtro es de la cama ' + idCama + ', que hoy tiene a otro paciente.', ERR.VALIDACION);
        }
        // Cambio de dispositivo → reinicia el reloj con la fecha efectiva.
        repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, (function () {
          const c = {}; c[disp.campo] = fechaEf; c.DISP_CONFIRMADO = true; return c;
        })());
        texto = disp.icono + ' Cambio de ' + disp.nombre + hrTxt + (detalle ? ' — ' + detalle : '');
        tipoHito = 'dispositivo';
      } else if (tipo === 'procedimiento') {
        const nombreProc = String(datos.proc || '').trim();
        if (!nombreProc) return err('Indica el procedimiento del catálogo.', ERR.VALIDACION);
        // El procedimiento debe sumar a la estadística → requiere la evolución del turno.
        // El texto conserva la instrucción que el equipo ya conoce («Primero guarda
        // la evolución…») y le suma la regla nueva: ahora que el ➕ alcanza turnos
        // pasados, hay que decir que un turno no se crea desde aquí.
        if (!ubic) return err('Primero guarda la evolución del turno; luego anexa el procedimiento. ' +
          'Los turnos no se inventan hacia atrás.', ERR.VALIDACION);
        const evo = ubic.obj;
        let procs = [];
        try { procs = JSON.parse(evo.PROC_JSON || '[]') || []; } catch (e) { procs = []; }
        procs.push(nombreProc);
        /* Se escribe POR NÚMERO DE FILA y en la hoja donde está la evolución
           —viva o archivo—, no por clave: `repoActualizar` escribe en la primera
           coincidencia, que en una cama rotada es la del otro paciente. La fila
           viaja COMPLETA porque `repoEscribirFila` reescribe el renglón entero. */
        repoEscribirFila(ubic.hoja, ubic.fila, Object.assign({}, evo, {
          PROC_JSON: JSON.stringify(procs), PROC_CANTIDAD: procs.length,
          PROC_RESUMEN: procs.join(', '),
        }));
        repoInsertar('PROCEDIMIENTOS', {
          // La clave y la cama salen de la EVOLUCIÓN, no del payload: tras un
          // traslado la cama del turno no es la cama de hoy. Y el pid es el del
          // EPISODIO — tomarlo de la cama era lo que fabricaba filas mixtas.
          ID_PROC: uid('PROC'), ID_EVOLUCION: String(evo.ID_EVOLUCION || ''),
          ID_CAMA: String(evo.ID_CAMA || idCama), PATIENT_ID: pidEvo,
          FECHA: fecha, TURNO: turno, TIPO_PROC: 'anexo', NOMBRE_PROC: nombreProc,
          DESCRIPCION: detalle, AUTOR_EMAIL: String(ctx.email || ''), TIMESTAMP: ahoraTS(),
        });
        texto = _hitoAnexoPrefijo(nombreProc) + hrTxt + (detalle ? ' — ' + detalle : '') + ' (anexo)';
        // 🔴 Hasta ago-2026 este hito nacía con TIPO 'procedimiento', que está
        // en `_TIPOS_HITO_AUTO`: el siguiente guardado de la evolución lo
        // borraba y lo regeneraba como la etiqueta pelada del procedimiento,
        // perdiendo hora, detalle, la marca (anexo) y la firma — sin error, sin
        // aviso y sin que el dato clínico se moviera (la fila de PROCEDIMIENTOS
        // seguía intacta). Con tipo propio sobrevive, y `_timelineDelGuardado`
        // reconoce su prefijo para no escribirle encima.
        tipoHito = 'anexo';
      } else if (tipo === 'cultivo') {
        const cultTipo = String(datos.cultTipo || '').trim();
        if (!cultTipo) return err('Indica el tipo de cultivo.', ERR.VALIDACION);
        const hallazgo = String(datos.cultHallazgo || '').trim();
        texto = '🧫 Cultivo ' + cultTipo + hrTxt + ': ' + (hallazgo || 'resultado pendiente');
        tipoHito = 'cultivo';
      } else if (tipo === 'otro') {
        if (!detalle) return err('Describe el evento.', ERR.VALIDACION);
        texto = '📌 ' + detalle + hrTxt;
      } else {
        return err('Tipo de evento desconocido: "' + tipo + '"', ERR.VALIDACION);
      }

      /* El hito se fecha SIEMPRE en su turno. Con el episodio cerrado va sin
         sincronizar la tarjeta: la tarjeta es del ocupante de HOY y el hito es de
         otro. Desde que `_sincronizarTimelineCama` filtra por paciente, esto ya
         no es un retardo de minutos — el hito ajeno no puede entrar ni cuando la
         sincronización corra después. */
      const hito = {
        idCama: String((ubic && ubic.obj && ubic.obj.ID_CAMA) || idCama),
        patientId: pid, fecha: fecha, turno: turno, tipo: tipoHito,
        texto: texto + (firma ? ' · ' + firma : ''),
        autor: firma, autorEmail: String(ctx.email || ''),
      };
      if (enCama) _agregarHitoInterno(hito); else _agregarHitoInternoSinSync(hito);
      SpreadsheetApp.flush();

      const salida = {
        entidad: 'TIMELINE', idCama: idCama, patientId: pid,
        idEvolucion: String((ubic && ubic.obj && ubic.obj.ID_EVOLUCION) || ''),
        // La autorización queda en la ACCIÓN: el dispatcher la audita tal
        // cual, así AUDIT_LOG dice quién de coordinación abrió el candado.
        accion: 'evento rápido: ' + texto + (firmaCoord ? ' · autorizado por coordinación (' + firmaCoord + ')' : ''),
        texto: texto,
      };
      /* En CERRADO no se lee CAMAS_ESTADO ni se devuelven dispositivos: son del
         ocupante actual y no tienen nada que ver con lo que se acaba de anotar.
         El front lo consume con `if (r && r.dispositivos)`, así que omitirlo es
         seguro. */
      if (enCama) {
        const camaNueva = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
        salida.dispositivos = estadoDispositivos(camaNueva, _fechaEfectivaTurno(hoyISO(), turno));
      }
      return ok(salida);
    } catch (e) { return err('anexarEventoRapido: ' + e.message, ERR.INTERNO, e); }
  });
}

/**
 * Anula UN procedimiento anexado con el ➕ (24-ago-2026, pedido de Manuel: el
 * sello tardaba en pintarse, la gente reintentaba y quedaban KTM dobles sin
 * ninguna forma de borrarlas — y la estadística y el REM B.4 cuentan filas de
 * PROCEDIMIENTOS, así que el duplicado inflaba cifras que salen del hospital).
 *
 * Contrato:
 *  · borra SOLO la fila señalada por ID_PROC, y solo si TIPO_PROC='anexo' —
 *    los procedimientos del guardado se corrigen re-guardando la evolución.
 *  · las TRES caras juntas o ninguna: fila de PROCEDIMIENTOS + su hito de
 *    TIMELINE + una instancia del nombre en PROC_JSON de la evolución. Si el
 *    hito no aparece, se rechaza completo: borrar solo la fila dejaría la
 *    línea de tiempo contando lo que la estadística ya no cuenta.
 *  · mismo candado del ➕ (candado_mas.js): fecha pasada o episodio cerrado
 *    exigen sesión de coordinación; el anexo de HOY del paciente en su cama
 *    se borra sin fricción.
 *  · si un flujo borra hitos, TIMELINE_JSON de la cama se reescribe SIEMPRE.
 */
function anularAnexo(datos, ctx) {
  ctx = ctx || {};
  return conLock(() => {
    try {
      const idProc = String((datos && datos.idProc) || '');
      if (!idProc) return err('Falta el identificador del anexo.', ERR.VALIDACION);

      const filaProc = repoBuscarPorId('PROCEDIMIENTOS', 'ID_PROC', idProc);
      if (!filaProc) return err('Ese anexo ya no está en el registro (otro colega pudo haberlo borrado). Actualiza con 🔄.', ERR.VALIDACION);
      if (String(filaProc.TIPO_PROC) !== 'anexo') {
        return err('Solo se pueden borrar procedimientos anexados con el ➕. Los del guardado se corrigen re-guardando la evolución del turno.', ERR.VALIDACION);
      }

      const fecha = _statISO(filaProc.FECHA);
      const turno = String(filaProc.TURNO || '');
      const idCama = String(filaProc.ID_CAMA || '');
      const pidProc = String(filaProc.PATIENT_ID || '');
      const nombre = String(filaProc.NOMBRE_PROC || '');
      const turnoKey = fecha + '-' + turno;

      // La evolución dueña, con la misma maquinaria del ➕ (cama rotada incluida).
      const ubic = _ubicarEvolucionDeTurno(pidProc, turnoKey, idCama);
      if (ubic && ubic.ambigua) {
        return err('La cama ' + idCama + ' tuvo dos pacientes en ese turno y el anexo no distingue cuál. Repórtalo a coordinación.', ERR.VALIDACION);
      }

      const cama = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
      const pidCama = String((cama && cama.PATIENT_ID) || '');
      const pidEvo = String((ubic && ubic.obj && ubic.obj.PATIENT_ID) || '');
      const enCama = ubic ? (!pidEvo || (!!pidCama && pidEvo === pidCama))
                          : (!!cama && esVerdadero(cama.OCUPADA) && (!pidProc || pidProc === pidCama));

      // 🔐 Borrar el pasado tiene la MISMA llave que escribirlo (anexarEventoRapido).
      const fechaEf = _fechaEfectivaTurno(fecha, turno);
      const esPasado = fecha !== hoyISO() && fechaEf !== hoyISO();
      let firmaCoord = '';
      if (!enCama || esPasado) {
        const ses = coordExigirSesion(String((datos && datos.coordToken) || ''));
        if (!ses.ok) {
          if (datos && datos.coordToken) return err(ses.error, ERR.NO_AUTORIZADO);
          return err('Borrar un anexo de un turno pasado —o de un paciente que ya no está en la cama— requiere ' +
            'clave de coordinación: entra en la pestaña 🔐 COORDINACIÓN y vuelve a intentarlo.', ERR.NO_AUTORIZADO);
        }
        firmaCoord = String(ses.firma || '');
      }

      /* El hito emparejado se ubica ANTES de borrar nada. El texto nace de
         _hitoAnexoPrefijo(nombre); entre candidatos del mismo nombre (los
         duplicados) gana el de TIMESTAMP más cercano al de la fila — fila e
         hito nacieron en la misma ejecución del ➕. */
      const pref = _hitoAnexoPrefijo(nombre);
      const cand = repoLeerTodosConFila('TIMELINE').filter(function (t) {
        const h = t.obj;
        if (String(h.TIPO) !== 'anexo') return false;
        if (String(h.ID_CAMA) !== idCama || _statISO(h.FECHA) !== fecha || String(h.TURNO) !== turno) return false;
        const hp = String(h.PATIENT_ID || '');
        if (pidProc && hp && hp !== pidProc) return false;
        return String(h.TEXTO || '').indexOf(pref) === 0;
      });
      if (!cand.length) {
        return err('No se encontró el hito de ese anexo en la línea de tiempo, así que NO se borró nada: ' +
          'borrar solo la fila dejaría el registro y la línea de tiempo diciendo cosas distintas. Repórtalo.', ERR.VALIDACION);
      }
      const tsRef = Date.parse(String(filaProc.TIMESTAMP || '')) || 0;
      cand.sort(function (a, b) {
        const da = Math.abs((Date.parse(String(a.obj.TIMESTAMP || '')) || 0) - tsRef);
        const db = Math.abs((Date.parse(String(b.obj.TIMESTAMP || '')) || 0) - tsRef);
        return da - db;
      });
      const hito = cand[0];

      // 1/3 — el hito de la línea de tiempo
      repoEliminarFilas('TIMELINE', [hito.fila]);
      // 2/3 — la fila de la estadística (por identidad, jamás «el más parecido»)
      repoEliminarDonde('PROCEDIMIENTOS', function (r) { return String(r.ID_PROC) === idProc; });
      // 3/3 — una instancia del nombre en la evolución (si un re-guardado ya la
      // depuró con su Set, no hay nada que quitar y no es un error)
      if (ubic && ubic.obj) {
        const evo = ubic.obj;
        let procs = [];
        try { procs = JSON.parse(evo.PROC_JSON || '[]') || []; } catch (e) { procs = []; }
        const i = procs.indexOf(nombre);
        if (i !== -1) {
          procs.splice(i, 1);
          repoEscribirFila(ubic.hoja, ubic.fila, Object.assign({}, evo, {
            PROC_JSON: JSON.stringify(procs), PROC_CANTIDAD: procs.length,
            PROC_RESUMEN: procs.join(', '),
          }));
        }
      }

      /* El JSON de la tarjeta se reescribe SIEMPRE que un flujo borra hitos. Y
         si la cama quedó sin ninguno, se vacía explícito: la sincronización
         normal no escribe con lista vacía porque siempre corre tras INSERTAR. */
      _sincronizarTimelineCama(idCama);
      if (!repoLeerTodos('TIMELINE', 'ID_CAMA', idCama).length) {
        repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, { TIMELINE_JSON: '[]' });
      }
      SpreadsheetApp.flush();

      return ok({
        entidad: 'PROCEDIMIENTOS', idCama: idCama, patientId: pidProc || pidEvo,
        idEvolucion: String((ubic && ubic.obj && ubic.obj.ID_EVOLUCION) || ''),
        accion: 'anexo anulado: ' + nombre + ' (' + turnoKey + ')' +
                (firmaCoord ? ' · autorizado por coordinación (' + firmaCoord + ')' : ''),
        nombre: nombre,
      });
    } catch (e) { return err('anularAnexo: ' + e.message, ERR.INTERNO, e); }
  });
}

/**
 * Confirma (o ajusta) la instalación asumida de dispositivos al conectar a VM.
 * datos: { idCama, fecha (opcional: corrige la fecha de instalación de los 3) }.
 */
function confirmarDispositivos(datos, ctx) {
  ctx = ctx || {};
  return conLock(() => {
    try {
      const idCama = String(datos.idCama || '');
      const cama = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
      if (!cama || !esVerdadero(cama.OCUPADA)) return err('La cama ' + idCama + ' no está ocupada.', ERR.VALIDACION);
      const campos = { DISP_CONFIRMADO: true };
      const fecha = String(datos.fecha || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        _EVENTO_DISPS.forEach(d => { campos[d.campo] = fecha; });
      }
      repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, campos);
      SpreadsheetApp.flush();
      return ok({ entidad: 'CAMAS_ESTADO', idCama: idCama, accion: 'dispositivos confirmados' + (fecha ? ' (instalados ' + fecha + ')' : '') });
    } catch (e) { return err('confirmarDispositivos: ' + e.message, ERR.INTERNO, e); }
  });
}


// ════════════════════════════════════════════════════════════════════
// ── svc_evoluciones.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_evoluciones.gs — Guardado y lectura de evoluciones.
 * Corazón clínico: una fila por turno, con cálculos, texto, sincronización de la
 * cama, procedimientos y reintubación. La REPLICACIÓN turno a turno (bajar el roce)
 * se sirve con obtenerEvolucionPrevia().
 */

// ═══ ESCRITURA ════════════════════════════════════════════
function guardarEvolucion(datos, ctx) {
  const errs = validarPayloadEvolucion(datos);
  if (errs.length) return err('Validación: ' + errs.join('; '), ERR.VALIDACION);
  ctx = ctx || {};

  return conLock(() => {
    try {
      const idCama = String(datos.ID_CAMA || datos.idCama || '');
      const turnoKey = String(datos.TURNO_KEY || datos.turnoKey || '');
      if (!idCama || !turnoKey) return err('Faltan ID_CAMA o TURNO_KEY.', ERR.VALIDACION);

      // Guardia de firma: PLAN_FIRMA_KINE debe ser una firma corta (iniciales),
      // jamás un texto largo — un dato corrupto aquí contamina el selector de
      // firmas en la interfaz (bug visto en marcha blanca, jul-2026).
      if (String(datos.PLAN_FIRMA_KINE || '').length > 15 || /\n/.test(String(datos.PLAN_FIRMA_KINE || ''))) {
        datos.PLAN_FIRMA_KINE = '';   // mejor sin firma que con basura (la UI la exige de todos modos)
      }

      const idEvolucion = 'CAMA_' + idCama + '_' + turnoKey;
      const p = turnoKey.split('-');
      const fecha = p[0] + '-' + p[1] + '-' + p[2];
      const turno = p[3] || 'Dia';
      // El generador de texto y los cálculos leen FECHA/TURNO del payload:
      // fijarlos ANTES (el cliente solo envía TURNO_KEY). Sin esto, las
      // evoluciones de noche salían tituladas "TURNO DÍA".
      datos.FECHA = fecha;
      datos.TURNO = turno;

      // La vista previa (cliente) ya generó el texto que el kinesiólogo revisó:
      // se respeta tal cual para que el texto GUARDADO sea IDÉNTICO al de la
      // vista previa (antes divergían por usar dos generadores distintos). Se
      // captura ANTES de la fusión con la fila previa (que podría reinyectar un
      // texto antiguo). Fallback al generador del servidor si no viene (llamadas
      // API sin navegador, como los smoke tests).
      const _textoCliente = String(datos.TEXTO_GENERADO || '').trim();
      // Editor de texto (opción A): el cliente manda además la salida cruda del
      // motor (TEXTO_AUTO) y si hubo edición manual (TEXTO_MANUAL). Se capturan
      // ANTES de la fusión con la fila previa, igual que el texto oficial.
      const _textoAutoCli = String(datos.TEXTO_AUTO || '').trim();
      const _textoManualCli = esVerdadero(datos.TEXTO_MANUAL);
      // Etiqueta de bloque por línea de TEXTO_AUTO (v5.23). Viaja solo desde el
      // navegador: si la evolución entra por API sin cliente, queda vacía y el
      // análisis simplemente no cuenta ese turno.
      const _textoBloquesCli = String(datos.TEXTO_BLOQUES || '').trim();

      // ── Fusión con lo ya guardado ──
      // Los eventos únicos (PVE/extubación, decanulación, intubación,
      // reintubación, cambio de tubo) viajan en el payload SOLO el turno en
      // que se registran; en re-guardados posteriores el cliente omite esas
      // claves y aquí se preservan desde la fila existente. Sin esta fusión,
      // repoUpsert (reescritura de fila completa) borraba los eventos al
      // re-guardar el turno.
      // La fila del turno se ubica UNA vez y la posición se recuerda: la
      // fusión de abajo, los históricos de BDT/apnea y la escritura final
      // hablan todos de ESTA misma fila. Válido porque todo ocurre dentro del
      // mismo lock y nada borra/inserta en EVOLUCIONES antes del upsert.
      // La cama se ubica una vez; su ÚNICA escritura es el sync del final (las
      // que había repartidas por el camino se fusionaron ahí — de paso el
      // guardado quedó todo-o-nada: si algo revienta a mitad, la cama no queda
      // a medio actualizar).
      // 🔴 Se lee ANTES de la fusión (20-ago-2026): la fusión necesita saber de
      // qué episodio es la fila previa, y eso solo lo dice la cama.
      const filaCama = repoBuscarFila('CAMAS_ESTADO', 'ID_CAMA', idCama);
      const cama = filaCama === -1 ? {} : repoLeerFila('CAMAS_ESTADO', filaCama);

      // Foto del trío de KTM TAL COMO LLEGÓ, antes de que la fusión de abajo
      // le copie encima lo de la fila previa. Sin esta foto es imposible
      // distinguir «el turno no opinó» de «el turno heredó».
      const _payloadKTM = {};
      ['KTM_REALIZADA', 'KTM_SUSPENDIDA', 'KTM_NO_REALIZADA'].forEach(function (k) {
        if (k in datos) _payloadKTM[k] = datos[k];
      });
      const _declPayload = esVerdadero(_payloadKTM.KTM_REALIZADA) ||
        esVerdadero(_payloadKTM.KTM_SUSPENDIDA) || esVerdadero(_payloadKTM.KTM_NO_REALIZADA);

      const filaEvo = repoBuscarFila('EVOLUCIONES', 'ID_EVOLUCION', idEvolucion);
      const _prev = filaEvo === -1 ? null : repoLeerFila('EVOLUCIONES', filaEvo);
      if (_prev) {
        // 🔴 LA IDENTIDAD NO SE HEREDA (20-ago-2026). La copia de abajo traía
        // TODA clave ausente del payload, `PATIENT_ID` incluido, y cinco líneas
        // más abajo `datos.PATIENT_ID || cama.PATIENT_ID` hacía GANAR al pid
        // heredado. Consecuencia medida en la planilla real: el episodio del
        // ocupante NUEVO quedaba atribuido al paciente ANTERIOR, y
        // `_syncCamaDesdeEvolucion` le escribía ese pid al censo — la cama
        // terminaba con el nombre de uno y el PATIENT_ID de otro, y el
        // historial (que se lee por pid) mezclaba los dos episodios.
        // La clave `CAMA_<n>_<turnoKey>` NO lleva paciente dentro, así que una
        // cama que rota sin archivar deja la fila del anterior bajo la misma
        // clave: por ahí entraba.
        const _pidPrev = String(_prev.PATIENT_ID || '');
        const _pidCama = String(cama.PATIENT_ID || '');
        // «Otro episodio» solo cuando los dos pids existen y difieren. Si
        // alguno falta es una fila legacy o una cama sin ingreso formal: ahí se
        // fusiona como siempre, para no esconder datos verdaderos (misma regla
        // «distinto Y no vacío» de `_mtoRepararAjenas`).
        const _otroEpisodio = !!_pidPrev && !!_pidCama && _pidPrev !== _pidCama;

        if (!_otroEpisodio) {
          Object.keys(_prev).forEach(function (k) {
            // La identidad se decide abajo desde la CAMA, nunca por herencia.
            if (k === 'PATIENT_ID' || k === 'PAC_COD') return;
            if (!(k in datos)) datos[k] = _prev[k];
          });
          // «Si se registró, quedó»: la marca de ingreso del turno JAMÁS se
          // pierde al re-editar. El cliente reabre con el modo ingreso apagado
          // y mandaba ES_INGRESO en falso — eso des-marcaba el ingreso ante el
          // REM (ingresos del mes), la estadística y el hito del historial.
          if (esVerdadero(_prev.ES_INGRESO)) datos.ES_INGRESO = true;
        }
        // Si ES de otro episodio no se hereda NADA: ni identidad ni datos
        // clínicos. Que el turno de este paciente arranque limpio es lo único
        // que no puede atribuirle a nadie lo que no hizo.

        // ── 🔑 LA KTM NO SE PIERDE AL REABRIR EL TURNO (Manuel, 20-ago-2026) ──
        //
        // ESTE ES EL BUG QUE ORIGINÓ TODO EL TRABAJO: «en la ficha de papel
        // escriben KTM con nivel, pero no está registrado en RCE». No es que se
        // olviden de anotarla — el sistema se la BORRA.
        //
        // El formulario neutraliza el trío en CADA reapertura (es deliberado:
        // «KTM — ACCIÓN DIARIA: siempre parte sin estado seleccionado», para que
        // nadie herede sin querer la KTM de ayer) y manda las claves presentes
        // pero vacías. Como la fusión de arriba solo repone lo AUSENTE, un turno
        // con KTM realizada nivel 3 y 2 sesiones quedaba en nivel '' y cantidad
        // '' porque un colega reabrió esa evolución para corregir la FiO₂.
        //
        // Medido en la planilla real el 20-ago: 52 filas con nivel presente y el
        // estado apagado — más que las 36 con KTM realizada. 21 de ellas de día,
        // que son las sospechosas de ser KTM verdaderas que perdieron su estado.
        //
        // La regla, decidida por Manuel: si el payload NO DECLARA NINGÚN estado
        // del trío, el turno no está diciendo «no hubo KTM», está diciendo «de
        // esto no opino» — y entonces se conserva lo que ya había. Es el mismo
        // criterio que ya protege a ES_INGRESO cinco líneas más arriba.
        // Para borrar una KTM hay que declararlo (suspendida o no realizada);
        // el silencio ya no borra.
        // 🪤 La comprobación se hace contra el PAYLOAD ORIGINAL (`_declPayload`,
        // calculado arriba antes de fusionar), no contra `datos` ya fusionado:
        // para entonces el estado previo ya se coló por la copia de lo ausente.
        const _KTM_TRIO = ['KTM_REALIZADA', 'KTM_SUSPENDIDA', 'KTM_NO_REALIZADA'];
        const _KTM_SATELITES = ['KTM_NO_RAZON', 'KTM_NO_COMENTARIO', 'KTM_CONTRA_TIPO',
          'KTM_CONTRA_CAT', 'KTM_CONTRA_RAZON', 'KTM_CONTRA_MANUAL', 'KTM_NIVEL_KTR',
          'KTM_ASISTENCIA', 'KTM_TIEMPO_MIN', 'KTM_CANT'];
        const _declPrev = esVerdadero(_prev.KTM_REALIZADA) ||
                          esVerdadero(_prev.KTM_SUSPENDIDA) || esVerdadero(_prev.KTM_NO_REALIZADA);
        if (!_declPayload && _declPrev) {
          // Silencio: se conserva lo que había, entero.
          _KTM_TRIO.concat(_KTM_SATELITES).forEach(function (k) { datos[k] = _prev[k]; });
        } else if (_declPayload) {
          // Declaración: el trío viaja COMPLETO desde el payload. Los estados
          // que no vengan son FALSOS, no heredados — si no, declarar «no
          // realizada» dejaba también la «realizada» del turno anterior y la
          // fila quedaba con dos estados a la vez.
          // Solo se apaga lo que venía HEREDADO en verdadero: escribir `false`
          // sobre un campo que ya estaba vacío cambiaría la fila sin arreglar
          // nada (y rompe el A/B de `guardado_viajes` por una diferencia que no
          // existe).
          _KTM_TRIO.forEach(function (k) {
            if (!(k in _payloadKTM) && esVerdadero(datos[k])) datos[k] = false;
          });
        }
      }

      // PATIENT_ID — ruta única: se toma de la cama; si no existe (episodio sin
      // ingreso formal) se genera UNA vez (el sync final lo fija en la cama).
      let patientId = datos.PATIENT_ID || cama.PATIENT_ID || '';
      if (!patientId) patientId = Utilities.getUuid();
      datos.PATIENT_ID = patientId;

      // COD_PACIENTE — de la cama; si falta, se genera desde el nombre.
      let cod = datos.PAC_COD || cama.COD_PACIENTE || '';
      if (!cod && datos.PAC_NOMBRE) cod = _codUnico(generarCodPaciente(datos.PAC_NOMBRE, datos.PAC_EDAD, fecha));
      datos.PAC_COD = cod;

      // Peso ideal si falta
      if (!datos.PAC_PESO_IDEAL || parseFloat(datos.PAC_PESO_IDEAL) <= 0) {
        datos.PAC_PESO_IDEAL = calcularPI(datos.PAC_SEXO, datos.PAC_TALLA) || '';
      }
      // Cálculos respiratorios
      Object.assign(datos, calcularRespiratorio(datos));

      // ── El episodio se baja UNA sola vez por guardado ───────────────────
      // Cuatro bloques necesitan las evoluciones anteriores de esta cama: los
      // contadores de días (VM/VNI/VA), el histórico de BDT, el de test de
      // apnea y la racha de válvula de fonación de la decanulación. Los cuatro
      // corren dentro del MISMO conLock y ANTES de la única escritura a
      // EVOLUCIONES (el repoUpsert de más abajo), así que las cuatro lecturas
      // devolvían por fuerza filas idénticas — en el turno de una decanulación
      // completa eran SIETE bajadas de la hoja para el mismo dato.
      // No es un caché clínico: nace y muere dentro de esta llamada, y se
      // llena solo cuando alguien de verdad lo pide.
      let _evosCamaMemo = null;
      const _evosCama = function () {
        if (_evosCamaMemo === null) _evosCamaMemo = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', idCama);
        return _evosCamaMemo;
      };

      // Días de estadía / VM / VA
      // MOMENTO real del ingreso (ago-2026, corregido 5-ago): fecha+turno+hora
      // con _tsEventoTurno (mismo mecanismo del ciclo de prono, v5.33) — así un
      // ingreso de turno Noche pasada la medianoche fecha al día SIGUIENTE, como
      // la lista oficial del hospital (BUDA). No agrega ningún campo: la hora
      // (PAC_HORA_INGRESO / «Hora ingreso» del formulario) ya se pedía; antes
      // solo la usaba TS_INGRESO (con _tsDesdeHora, relativo a AHORA — no al
      // turno) y FECHA_INGRESO caía siempre en la fecha del turno sin mirarla.
      // Las fechas de ingreso se corrigen EN MEMORIA sobre `cama`; a la hoja
      // llegan con el sync único del final (que ya las incluye). Los cálculos
      // de aquí abajo leen cama.FECHA_INGRESO / cama.TS_INGRESO ya corregidos.
      const _hFormIng = _horaValida(datos.PAC_HORA_INGRESO);
      const _tsIng = _hFormIng ? _tsEventoTurno(fecha, turno, _hFormIng) : '';
      if (!cama.FECHA_INGRESO) {
        // Episodio sin fecha de ingreso (paciente cargado sin ingreso formal):
        // se ancla al primer turno evolucionado para que los días no queden '?'.
        cama.FECHA_INGRESO = _tsIng ? _tsFecha(_tsIng) : fecha;
      }
      if (!cama.TS_INGRESO) {
        cama.TS_INGRESO = _tsIng || _tsAhora();
      } else if (_hFormIng && _hFormIng !== _tsHora(cama.TS_INGRESO)
                 && !coordCampoCorregido(cama, 'FECHA_INGRESO')) {
        // Corrección a mano: se conserva el día del momento ya guardado.
        //
        // ARRASTRE (D7, ago-2026): si la coordinación ya corrigió la fecha de
        // ingreso, el turno la HEREDA y no la pisa — «normalmente no se
        // modifica, así que no debería poder modificarla» (Manuel, 18-ago).
        // Sin esta guardia, la corrección de un egresado de 28 días duraba
        // hasta que alguien guardara el turno siguiente con otra hora.
        cama.TS_INGRESO = _tsFecha(cama.TS_INGRESO) + ' ' + _hFormIng;
      }
      if (cama.FECHA_INGRESO) {
        // ── DÍAS: EL MISMO NÚMERO QUE LA LISTA OFICIAL (BUDA) ──────────────
        // (ago-2026, decisión de Diego con la «Lista de hospitalizados» a la
        // vista.) La unidad suma UN día de estadía por cada día de CALENDARIO
        // y el día de ingreso es Día 0. Verificado contra la lista del
        // 3-ago-2026: las 17 camas cuadran con `hoy − fecha de ingreso`.
        //
        // OJO — esto REVIERTE los bloques de 24 h de la v5.19. Aquella se
        // construyó sobre un supuesto equivocado (que BUDA contaba por
        // bloques); en realidad cuenta por calendario, así que la app se
        // despegaba hasta en un día del papel que el equipo lee en la reunión.
        // Si alguna vez se quiere volver al tiempo transcurrido real, la hora
        // sigue guardada en TS_INGRESO: es un dato, no se perdió.
        //
        // Se cuenta contra LA FECHA DEL TURNO (regla afinada por Diego,
        // 4-ago 01:00, en pleno turno de noche): la hoja de registro del
        // turno noche del 3 PERTENECE al día 3 — sus días no se adelantan a
        // medianoche; «se actualizan en la mañana, al cambio de turno, y
        // aparece una planilla nueva limpia». La TARJETA DE CAMA, en cambio,
        // es «lo real en vivo» y cuenta contra el reloj (svc_camas/index):
        // que a las 02:00 difieran en 1 es A PROPÓSITO — la cama muestra lo
        // que pasa, el registro es la referencia de fecha del turno.
        // OJO: NO usar _fechaEfectivaTurno aquí (se probó y se revirtió esa
        // misma noche); la fecha efectiva sigue vigente SOLO para los relojes
        // de dispositivos (v5.20) y el fechado de eventos rápidos.
        datos.DIA_ESTADIA = diasEntre(cama.FECHA_INGRESO, fecha);

        // ── VM · VNI · VA: DÍAS POR TRAMOS, ACUMULADOS Y SIN SOLAPARSE ─────
        // (ago-2026, hallazgo de Diego con María del Carmen: su estadística
        // manual sumaba VM 8 + VNI 7 = 15 días en una estadía de 13, porque el
        // día de cada transición se contaba para LOS DOS soportes.)
        //
        // REGLA: cada TRAMO de soporte aporta diasEntre(inicio, fin). El día
        // de la transición pertenece al soporte SALIENTE (el turno que extuba
        // aún estuvo ventilado) y es el Día 0 del entrante. Así los tramos
        // consecutivos SUMAN EXACTO la estadía — imposible el día doble y
        // imposible el día perdido.
        //
        // Cómo se calcula sin recorrer tramos: si el turno TIENE el soporte
        // (estado inicial o final), su valor = BASE + días del tramo abierto,
        // donde BASE es el valor CONGELADO de la última evolución del episodio
        // que terminó SIN ese soporte (= la suma de todos los tramos cerrados).
        // Si el turno NO lo tiene, hereda el valor congelado del turno previo.
        // El congelado emerge solo: al salir del soporte el número queda quieto
        // y al REINGRESAR (reintubación, nueva VNI) los tramos anteriores no se
        // pierden — antes la reintubación reiniciaba el contador a cero.
        const _sopT = datos.VENT_SOPORTE_FINAL || datos.VENT_SOPORTE;
        const _vaT  = datos.VENT_VIA_AEREA_FINAL || datos.VENT_VIA_AEREA;
        const _esVA = function (x) { return x && String(x) !== 'Natural'; };
        // Episodio ANTERIOR a este turno, del más reciente al más antiguo.
        const _epiPrev = _evosCama()
          .filter(function (x) {
            return String(x.PATIENT_ID) === String(patientId) &&
                   String(x.TURNO_KEY || '') < String(turnoKey);
          })
          .sort(function (a, b) { return String(b.TURNO_KEY).localeCompare(String(a.TURNO_KEY)); });
        const _contadorTramos = function (campo, enS, terminoSinS, fInicioTramo) {
          if (!enS) {   // sin el soporte: hereda el congelado (0 si nunca lo tuvo)
            return _epiPrev.length ? (parseInt(_epiPrev[0][campo], 10) || 0) : 0;
          }
          let base = 0, huboSalida = false;   // tramos cerrados = congelado de la última evolución fuera del soporte
          for (let i = 0; i < _epiPrev.length; i++) {
            if (terminoSinS(_epiPrev[i])) { base = parseInt(_epiPrev[i][campo], 10) || 0; huboSalida = true; break; }
          }
          let ini = fInicioTramo;
          // Nunca salió del soporte en todo el episodio ⇒ el tramo viene desde
          // la PRIMERA evolución, aunque el reloj de la cama se haya
          // re-estampado en el camino (p. ej. TOT → Full Face reestampa la
          // fecha de inicio de VA sin que la vía aérea dejara de ser artificial).
          if (!huboSalida && _epiPrev.length) {
            const f0 = String(_epiPrev[_epiPrev.length - 1].FECHA || '').slice(0, 10);
            if (f0 && (!ini || f0 < ini)) ini = f0;
          }
          return base + Math.max(0, diasEntre(ini, fecha) || 0);
        };
        // Inicio del tramo abierto: el reloj de la cama si la cama YA está en
        // ese soporte; si la transición ocurre EN ESTE turno (la cama aún dice
        // el soporte anterior), el tramo parte hoy — Día 0.
        const _finalSop = function (x) { return String(x.VENT_SOPORTE_FINAL || x.VENT_SOPORTE || ''); };
        const _finalVa  = function (x) { return String(x.VENT_VIA_AEREA_FINAL || x.VENT_VIA_AEREA || ''); };
        datos.DIAS_VM = _contadorTramos('DIAS_VM',
          String(datos.VENT_SOPORTE) === 'VM' || String(_sopT) === 'VM',
          function (x) { return _finalSop(x) !== 'VM'; },
          String(cama.SOPORTE) === 'VM' ? cama.FECHA_INICIO_SOPORTE : fecha);
        // VNI manda el SOPORTE registrado, nunca la interfaz: la mascarilla
        // sola (Full Face/Oronasal en oxigenoterapia o CNAF) no es VNI.
        datos.DIAS_VNI = _contadorTramos('DIAS_VNI',
          String(datos.VENT_SOPORTE) === 'VNI' || String(_sopT) === 'VNI',
          function (x) { return _finalSop(x) !== 'VNI'; },
          String(cama.SOPORTE) === 'VNI' ? cama.FECHA_INICIO_SOPORTE : fecha);
        datos.DIAS_VA = _contadorTramos('DIAS_VA',
          _esVA(datos.VENT_VIA_AEREA) || _esVA(_vaT),
          function (x) { return !_esVA(_finalVa(x)); },
          _esVA(cama.VIA_AEREA) ? cama.FECHA_INICIO_VA : fecha);
      }

      // BDT (test de azul) — repetible: cada resultado marcado en el turno se
      // acumula en BDT_JSON del episodio y BDT_ULTIMO refleja el más reciente.
      const bdtRes = esVerdadero(datos.EVAL_T_BDT_POS) ? '+' : (esVerdadero(datos.EVAL_T_BDT_NEG) ? '-' : '');
      if (bdtRes) {
        // Continuidad del histórico: fila de este turno (la que la fusión ya
        // trajo — volver a pedirla era otra bajada de la hoja) o turno previo.
        let base = _prev;
        if (!base || !base.BDT_JSON) {
          const rp = obtenerEvolucionPrevia(idCama, turnoKey, _evosCama());
          if (rp.ok && rp.data) base = rp.data;
        }
        let hist = [];
        try { hist = JSON.parse((base && base.BDT_JSON) || '[]') || []; } catch (e) {}
        // idempotente por turno: reemplaza el registro de este mismo turnoKey
        hist = hist.filter(function (h) { return h && h.turnoKey !== turnoKey; });
        hist.push({ turnoKey: turnoKey, fecha: fecha, resultado: bdtRes });
        datos.BDT_JSON = JSON.stringify(hist);
        datos.BDT_ULTIMO = bdtRes + ' (' + fecha + ')';
      }

      // Test de apnea — repetible (mismo patrón que BDT)
      const apRes = String(datos.APNEA_TEST || '').trim();
      if (apRes) {
        let baseA = _prev;
        if (!baseA || !baseA.APNEA_JSON) {
          const rpa = obtenerEvolucionPrevia(idCama, turnoKey, _evosCama());
          if (rpa.ok && rpa.data) baseA = rpa.data;
        }
        let histA = [];
        try { histA = JSON.parse((baseA && baseA.APNEA_JSON) || '[]') || []; } catch (e) {}
        histA = histA.filter(function (h) { return h && h.turnoKey !== turnoKey; });
        histA.push({ turnoKey: turnoKey, fecha: fecha, resultado: apRes });
        datos.APNEA_JSON = JSON.stringify(histA);
        datos.APNEA_ULTIMO = apRes + ' (' + fecha + ')';
      }

      // Horas con válvula de fonación (para la frase de la decanulación):
      // racha consecutiva de turnos previos + el propio turno si va con válvula.
      if (esVerdadero(datos.DECAN_OCURRIO)) {
        const rp2 = obtenerEvolucionPrevia(idCama, turnoKey, _evosCama());
        let hrs = (rp2.ok && rp2.data && rp2.data._VFON_HORAS) ? rp2.data._VFON_HORAS : 0;
        if (String(datos.VENT_MODO) === 'Válvula de fonación' || esVerdadero(datos.VFON_USADA)) hrs += 12;
        datos._VFON_HORAS = hrs;   // transitorio: no es columna
      }

      // Ciclo de prono: sella el momento real y, al supinar, cierra la cuenta.
      // Le viaja el episodio SOLO si ya se bajó en este guardado (que es lo
      // normal); si no, _pronoSellarCiclo lo pide por su cuenta y únicamente en
      // el caso en que de verdad lo mira (supinación sin pronación del turno).
      _pronoSellarCiclo(idCama, turnoKey, fecha, turno, datos, _evosCamaMemo);

      // ── Normalización del trío de KTM (20-ago-2026) ──────────────────────
      // Se NORMALIZA, no se rechaza: bloquear una evolución por un nivel
      // heredado dejaría al turno sin poder guardar, y de noche sin salida
      // desde la pantalla (la tarjeta está oculta). Ver `validarKTM`.
      //
      // · Nivel sin estado, o con la KTM suspendida / no realizada, es un
      //   FÓSIL: el formulario no limpia `fKTMniv` al cambiar de estado, así
      //   que el número de ayer sobrevive a una KTM que no se hizo. Medido:
      //   52 filas así en la planilla real. Se vacía.
      // · La cantidad se acota aquí porque el servidor no lo hacía en ninguna
      //   parte: por API entraba cualquier número al REM.
      (function () {
        const hecha = esVerdadero(datos.KTM_REALIZADA);
        const otra  = esVerdadero(datos.KTM_SUSPENDIDA) || esVerdadero(datos.KTM_NO_REALIZADA);
        // Solo se toca lo que TIENE contenido: escribir '' sobre un campo que ya
        // estaba vacío cambiaría la fila sin arreglar nada, y hace fallar el A/B
        // de `guardado_viajes` por una diferencia que no existe.
        if (!hecha) {
          if (String(datos.KTM_NIVEL_KTR || '') !== '') datos.KTM_NIVEL_KTR = '';
          if (String(datos.KTM_CANT || '') !== '') datos.KTM_CANT = '';
        } else {
          datos.KTM_CANT = _ktmCantidad(datos.KTM_CANT);
        }
      })();

      // Texto clínico: el de la PANTALLA (cliente) si vino; si no, se genera.
      datos.TEXTO_GENERADO = _textoCliente || generarTextoEvolucion(datos);
      // Respaldo del motor: si el cliente no lo trae (API sin navegador) y no
      // hubo edición manual, el oficial ES la salida del motor.
      datos.TEXTO_AUTO = _textoAutoCli || (_textoManualCli ? '' : datos.TEXTO_GENERADO);
      datos.TEXTO_MANUAL = _textoManualCli;
      // Las etiquetas solo valen si acompañan al TEXTO_AUTO que las produjo: si
      // este re-guardado no las trae, se descartan las de la fila previa (que
      // corresponden a otra generación) en vez de dejarlas desalineadas.
      datos.TEXTO_BLOQUES = _textoAutoCli ? _textoBloquesCli : '';

      // Procedimientos del turno
      let procs = [];
      if (datos.PROC_JSON) { try { procs = JSON.parse(datos.PROC_JSON) || []; } catch (e) {} }
      if (!Array.isArray(procs)) procs = [];
      if (datos.PROC_RESUMEN === undefined) datos.PROC_RESUMEN = procs.join(', ');
      if (datos.PROC_CANTIDAD === undefined) datos.PROC_CANTIDAD = procs.length;

      // Construir la fila de evolución (metadatos e identidad mandan)
      const evo = Object.assign({}, datos, {
        ID_EVOLUCION: idEvolucion, ID_CAMA: idCama, PATIENT_ID: patientId, COD_PACIENTE: cod,
        TURNO_KEY: turnoKey, FECHA: fecha, TURNO: turno, TIMESTAMP: ahoraTS(),
        AUTOR_EMAIL: ctx.email || '', PLAN_FIRMA_KINE: datos.PLAN_FIRMA_KINE || ctx.firma || '',
      });

      const accion = repoUpsertEnFila('EVOLUCIONES', filaEvo, evo);
      const esNuevo = (accion === 'crear');

      // Hito de ingreso — solo en la primera escritura. Viaja en el MISMO lote
      // que los hitos de procedimientos (una inserción, un solo cache).
      const hitosExtra = [];
      if (esVerdadero(evo.ES_INGRESO) && esNuevo) {
        hitosExtra.push({
          tipo: 'ingreso',
          texto: 'Ingreso UCI. Dx: ' + (evo.PAC_DIAGNOSTICO || evo.PAC_NOMBRE || 'Sin especificar'),
          autor: evo.PLAN_FIRMA_KINE, autorEmail: ctx.email || '',
        });
      }

      // Procedimientos (filas) + hitos automáticos
      // UN evento por ciclo prono→supino (ago-2026, Bloque C de Diego): la
      // SUPINACIÓN no entra a PROCEDIMIENTOS — la estadística contaría DOS
      // eventos por un solo ciclo. El ciclo lo representa la fila del PRONO y
      // el total de horas queda sellado en PRONO_HORAS al supinar. La TIMELINE
      // sí recibe el hito de supino (lista completa), porque el historial
      // narra maniobras, no cuenta eventos.
      const procsStats = procs.filter(function (p) { return !/^SUPINACI/i.test(String(p)); });
      _guardarProcedimientosInterno(idEvolucion, idCama, patientId, fecha, turno, procsStats, ctx.email);
      const timelineJson = _timelineDelGuardado(idCama, fecha, turno, procs, evo.PLAN_FIRMA_KINE, ctx.email, patientId, hitosExtra);

      // Sincronizar el snapshot de la cama: la ÚNICA escritura a CAMAS_ESTADO
      // del guardado (lleva también las fechas de ingreso corregidas arriba y
      // el cache de la línea de tiempo recién armado).
      _syncCamaDesdeEvolucion(idCama, cama, evo, turno, turnoKey, fecha, patientId, filaCama, timelineJson);

      // Reintubación desde el bloque EXT_* (le viaja el lector perezoso del
      // episodio: si el EXT_TS hay que buscarlo hacia atrás, no re-baja la hoja)
      if (esVerdadero(evo.EXT_REINTUB)) {
        try { _registrarReintubacion(evo, idCama, idEvolucion, fecha, turno, ctx, _evosCama); }
        catch (e) { console.warn('_registrarReintubacion:', e.message); }
      }

      SpreadsheetApp.flush();
      return ok({ idEvolucion, idCama, patientId, turnoKey, accion: esNuevo ? 'crear' : 'actualizar', entidad: 'EVOLUCIONES', TEXTO_GENERADO: evo.TEXTO_GENERADO || '' });
    } catch (e) { return err('guardarEvolucion: ' + e.message, ERR.INTERNO, e); }
  });
}

// Sincroniza CAMAS_ESTADO con el último turno (datos del paciente + snapshot por turno).
// `filaCama` y `timelineJson` (opcionales, Ola 4): con la fila conocida la
// escritura es UN setValues sin relectura — válido porque el guardado corre
// entero dentro del lock y nada mueve filas de CAMAS_ESTADO en el camino.
// Sin ellos (anularEvento) se comporta como siempre: repoActualizar clásico
// y el cache de timeline no se toca.
function _syncCamaDesdeEvolucion(idCama, cama, evo, turno, turnoKey, fecha, patientId, filaCama, timelineJson) {
  const esIngreso = esVerdadero(evo.ES_INGRESO);
  const val = (a, b) => (a !== undefined && a !== null && a !== '') ? a : (b || '');

  // Estado con el que TERMINA el turno: si hubo un evento de vía aérea, la cama
  // (y el turno siguiente) deben partir de ahí, no del estado previo con el que
  // el paciente llegó al turno. El previo queda guardado en las columnas VENT_*.
  const vaFin  = evo.VENT_VIA_AEREA_FINAL || evo.VENT_VIA_AEREA || '';
  const sopFin = evo.VENT_SOPORTE_FINAL || evo.VENT_SOPORTE || '';
  const modoFin = evo.VENT_MODO_FINAL || evo.VENT_MODO || '';
  // Fecha de inicio de soporte: se reinicia si cambia el tipo (Ambiente↔VM↔VNI).
  const sopNew = sopFin || cama.SOPORTE || 'Ambiente';
  const sopAnt = cama.SOPORTE || '';
  const esVent = (sopNew === 'VM' || sopNew === 'VNI');
  let fechaSoporte, horaSoporte;
  // ARRASTRE (D7): una fecha corregida por la coordinación no la pisa el turno.
  // Pero si CAMBIA el tipo de soporte hay un tramo clínico nuevo de verdad
  // (VM→VNI→VM), y entonces la marca se suelta: congelarla ahí sería peor que
  // el error original, porque el contador arrancaría en una fecha que ya no
  // describe este tramo.
  // Se sueltan EN MEMORIA y viajan en el sync único del final: este guardado
  // ya está medido al viaje (Ola 4) y no admite una escritura suelta más.
  const _sopCorregido = coordCampoCorregido(cama, 'FECHA_INICIO_SOPORTE');
  const _vaCorregidoPrev = coordCampoCorregido(cama, 'FECHA_INICIO_VA');
  let _marcasSueltas = null;
  if (!esVent) { fechaSoporte = cama.FECHA_INICIO_SOPORTE || ''; horaSoporte = cama.TS_INICIO_SOPORTE || ''; }
  else if (_sopCorregido && sopNew === sopAnt) {
    fechaSoporte = cama.FECHA_INICIO_SOPORTE; horaSoporte = cama.TS_INICIO_SOPORTE || '';
  }
  else if (sopNew !== sopAnt || !cama.FECHA_INICIO_SOPORTE) {
    // Arranca (o se reinicia) el contador: se guarda también la HORA para que
    // los días de VM cuenten bloques de 24 h reales. La hora del evento manda
    // (intubación/reintubación/TQT); si no hay, la del registro.
    fechaSoporte = fecha;
    horaSoporte = _tsDesdeHora(_horaValida(evo.INTUB_HORA) || _horaValida(evo.REINTUB_HORA) || _horaValida(evo.TQT_HORA)) || _tsAhora();
  } else { fechaSoporte = cama.FECHA_INICIO_SOPORTE; horaSoporte = cama.TS_INICIO_SOPORTE || ''; }

  // Fecha de inicio de vía aérea: se reinicia si cambia el TIPO de vía aérea
  // (condicionante v1 #2 — "cambio de vía aérea recalcula días"). "Vía externa
  // previa" (condicionante #3) pliega los días previos hacia atrás en el ancla,
  // para que el contador arranque contando esos días ya transcurridos.
  // Salida de VM este turno (weaning/extubación): descarta el circuito
  const dejaVM = (sopAnt === 'VM' && sopNew !== 'VM');
  // Humidificación activa ↔ HME son excluyentes: con activa puesta, el filtro
  // HME está retirado del circuito — su fecha se fuerza vacía en la cama (si
  // no, val() haría arrastre desde el episodio y "resucitaría" un filtro que
  // ya no está puesto, igual que dejaVM para el resto del circuito).
  // 🪤 14-ago-2026 (reportado por Diego desde el uso): la humidificación vive
  // en DOS campos del formulario —el checkbox (VENT_H_ACTIVA) y la fecha
  // (DISP_HUMID_FECHA)— y aquí solo mandaba el checkbox. Fechar la
  // humidificación SIN marcar el checkbox dejaba hactOn falso y el HME seguía
  // contando días de un filtro retirado. Ahora manda CUALQUIERA de los dos; y
  // al revés, desmarcarla con la fecha vacía la RETIRA de la cama de verdad
  // (antes val() con '' hacía arrastre y la resucitaba desde el episodio).
  const hactOn = esVerdadero(evo.VENT_H_ACTIVA);
  const humidNueva = String(evo.DISP_HUMID_FECHA || '').slice(0, 10);
  const humidFinal = (hactOn || humidNueva)
    ? (humidNueva || String(cama.DISP_HUMID_FECHA || '').slice(0, 10) || fecha)
    : '';

  // PVE del episodio, acumulados por turnoKey (idempotente al re-guardar un
  // turno: la clave se sobreescribe). De aquí se deriva la clase de weaning.
  let weanPve = {};
  try { weanPve = JSON.parse(cama.WEAN_PVE_JSON || '{}') || {}; } catch (e) { weanPve = {}; }
  if (evo.PVE_VAL === 'si' && evo.PVE_RESULTADO) weanPve[turnoKey] = evo.PVE_RESULTADO;

  // Tamizaje de candidato a PVE con los parámetros de este turno (criterios de
  // screening clásicos, ABC trial). Si el turno ya trae PVE registrado, el
  // tamizaje ya se resolvió y no se marca. Con datos incompletos no se marca
  // (conservador). Tampoco se marca cuando el turno declaró que NO CORRESPONDE
  // ('nc', ago-2026): el paciente cumple los números pero su causa de base no
  // está resuelta, y el kinesiólogo del turno ya lo dijo — insistirle con el
  // badge verde y con la alerta de racha sería ruido.
  let candPve = false;
  if (sopNew === 'VM' && evo.PVE_VAL !== 'si' && evo.PVE_VAL !== 'nc') {
    const _n = x => parseFloat(x);
    const dvaTxt = String(evo.HEMO_DVA || '');
    candPve = _n(evo.VENT_FIO2) > 0 && _n(evo.VENT_FIO2) <= 50 &&
      _n(evo.VENT_PEEP) > 0 && _n(evo.VENT_PEEP) <= 8 &&
      _n(evo.VENT_SPO2) >= 90 &&
      evo.HEMO_ESTADO !== 'Inestable' &&
      (dvaTxt === '' || /sin requerimientos|dosis bajas/i.test(dvaTxt)) &&
      !esVerdadero(evo.SED_BNM);
  }

  const vaNew = vaFin || cama.VIA_AEREA || 'Natural';
  const vaAnt = cama.VIA_AEREA || '';
  const esVA = (vaNew !== 'Natural');
  let fechaVA, horaVA;
  if (!esVA) {
    fechaVA = ''; horaVA = '';
  } else if (_vaCorregidoPrev && vaNew === vaAnt) {
    // ARRASTRE (D7): corregida y sin cambio de vía aérea → se hereda intacta.
    fechaVA = cama.FECHA_INICIO_VA; horaVA = cama.TS_INICIO_VA || '';
  } else if (vaNew !== vaAnt || !cama.FECHA_INICIO_VA) {
    const diasPrev = parseInt(evo.VA_EXTERNO_DIAS) || 0;
    fechaVA = (esVerdadero(evo.VA_EXTERNO) && diasPrev > 0) ? _restarDias(fecha, diasPrev) : fecha;
    horaVA = _tsDesdeHora(_horaValida(evo.INTUB_HORA) || _horaValida(evo.REINTUB_HORA) || _horaValida(evo.TQT_HORA)) || _tsAhora();
  } else {
    fechaVA = cama.FECHA_INICIO_VA; horaVA = cama.TS_INICIO_VA || '';
  }

  // ARRASTRE (D7) — soltar las marcas de los tramos que SÍ arrancaron de nuevo.
  // Un cambio de soporte o de vía aérea abre un tramo clínico distinto: la
  // fecha corregida describía el tramo anterior y mantenerla congelada dejaría
  // el contador arrancando donde ya no corresponde.
  if ((_sopCorregido && sopNew !== sopAnt) || (_vaCorregidoPrev && vaNew !== vaAnt)) {
    let _corr = coordCorrecciones(cama);
    if (_sopCorregido && sopNew !== sopAnt) _corr = _corr.filter(function (x) { return !x || x.c !== 'FECHA_INICIO_SOPORTE'; });
    if (_vaCorregidoPrev && vaNew !== vaAnt) _corr = _corr.filter(function (x) { return !x || x.c !== 'FECHA_INICIO_VA'; });
    _marcasSueltas = _corr.length ? JSON.stringify(_corr) : '';
  }

  const campos = {
    OCUPADA: true, STATUS_CAMA: 'Ocupada', PATIENT_ID: patientId, COD_PACIENTE: val(evo.COD_PACIENTE, cama.COD_PACIENTE),
    NOMBRE: val(evo.PAC_NOMBRE, cama.NOMBRE), EDAD: val(evo.PAC_EDAD, cama.EDAD), SEXO: val(evo.PAC_SEXO, cama.SEXO),
    RUT: _rutNormal(val(evo.PAC_RUT, cama.RUT)),   // PAC_RUT es transitorio: el RUT persiste solo en cama/archivo
    TALLA_CM: val(evo.PAC_TALLA, cama.TALLA_CM), PESO_IDEAL_KG: val(evo.PAC_PESO_IDEAL, cama.PESO_IDEAL_KG),
    BARTHEL: val(evo.PAC_BARTHEL, cama.BARTHEL), ECF: val(evo.PAC_ECF, cama.ECF),
    DIAGNOSTICO: val(evo.PAC_DIAGNOSTICO, cama.DIAGNOSTICO), DIAG_REM: val(evo.PAC_DIAG_REM, cama.DIAG_REM),
    CHARLSON: val(evo.PAC_CHARLSON, cama.CHARLSON), INGRESO_TIPO: val(evo.PAC_INGRESO_TIPO, cama.INGRESO_TIPO),
    // PAC_APACHE2 viaja transitorio (como PAC_RUT): persiste en la CAMA, no en EVOLUCIONES
    APACHE2: _apacheNorm(val(evo.PAC_APACHE2, cama.APACHE2)),
    AISLAMIENTO: esVerdadero(evo.PAC_AISLAMIENTO), AISL_MICRO: val(evo.PAC_AISL_MICRO, cama.AISL_MICRO),
    VIA_AEREA: val(vaFin, cama.VIA_AEREA) || 'Natural',
    TOT_NUMERO: val(evo.INTUB_TOT_N, val(evo.VENT_TOT_NUM, cama.TOT_NUMERO)),
    TOT_CM_LABIO: val(evo.INTUB_TOT_CM, val(evo.VENT_TOT_CM, cama.TOT_CM_LABIO)),
    TQT_TIPO: val(evo.VENT_TQT_TIPO, cama.TQT_TIPO),
    TQT_CALIBRE: val(evo.VENT_TQT_CALIBRE, cama.TQT_CALIBRE), SOPORTE: sopNew, MODO: val(modoFin, cama.MODO),
    FASE_JSON: val(evo.FASE_JSON, cama.FASE_JSON),
    KTM_NIVEL: esVerdadero(evo.KTM_REALIZADA) ? (evo.KTM_NIVEL_KTR || '') : (turno === 'Noche' ? (cama.KTM_NIVEL || '') : ''),
    KTM_SUSP: esVerdadero(evo.KTM_SUSPENDIDA),
    FIRMA_KINE: val(evo.PLAN_FIRMA_KINE, cama.FIRMA_KINE), AUTOR_EMAIL: evo.AUTOR_EMAIL || '',
    CAT_RESP_PJE: val(evo.CAT_RESP_PJE, cama.CAT_RESP_PJE),
    CAT_RESP_NIVEL: val(evo.CAT_RESP_NIVEL, cama.CAT_RESP_NIVEL),
    CAT_MOTOR_PJE: val(evo.CAT_MOTOR_PJE, cama.CAT_MOTOR_PJE),
    CAT_MOTOR_NIVEL: val(evo.CAT_MOTOR_NIVEL, cama.CAT_MOTOR_NIVEL),
    // Arrastre de últimas evaluaciones (matriz motora + badges de la grilla)
    ULT_COOP: val(evo.SED_COOPERACION, cama.ULT_COOP),
    ULT_MRC: val(evo.EVAL_T_MRC, cama.ULT_MRC),
    ULT_MRC_FECHA: val(evo.EVAL_T_MRC, '') !== '' ? fecha : (cama.ULT_MRC_FECHA || ''),
    ULT_FSS: val(evo.EVAL_T_FSS, cama.ULT_FSS),
    ULT_FSS_FECHA: val(evo.EVAL_T_FSS, '') !== '' ? fecha : (cama.ULT_FSS_FECHA || ''),
    ULT_DINAMO: val(evo.EVAL_T_DINAMO, cama.ULT_DINAMO),
    // Dispositivos del circuito: cada uno sigue a lo que le da sentido, no
    // todos al soporte VM (Diego, 14-ago-2026). Al salir de VM el circuito se
    // descarta, PERO el Trach Care pertenece a la VÍA AÉREA y sobrevive si el
    // paciente queda con TOT/TQT (weaning a CTAF, por ejemplo), y el HME
    // sobrevive si queda respirando POR el HME (modo HME). El HEPA es del
    // ventilador: al salir de VM se limpia siempre. La humidificación activa
    // manda sobre el HME (excluyentes) y sigue al paciente (CNAF humidificada
    // la conserva); una reintubación fecha circuito nuevo desde el cliente
    // (force=true).
    DISP_HME_FECHA: (humidFinal || (dejaVM && modoFin !== 'HME')) ? '' : val(evo.DISP_HME_FECHA, cama.DISP_HME_FECHA),
    DISP_HEPA_FECHA: dejaVM ? '' : val(evo.DISP_HEPA_FECHA, cama.DISP_HEPA_FECHA),
    DISP_TC_FECHA: (dejaVM && vaNew !== 'TOT' && vaNew !== 'TQT') ? '' : val(evo.VENT_FECHA_SONDA, cama.DISP_TC_FECHA),
    DISP_HUMID_FECHA: humidFinal,
    WEAN_PVE_JSON: JSON.stringify(weanPve),
    WEAN_CAND_PVE: candPve,
    ULTIMO_TURNO_KEY: turnoKey,
    FECHA_INGRESO: cama.FECHA_INGRESO || (esIngreso ? fecha : ''),
    FECHA_INICIO_VA: fechaVA,
    FECHA_INICIO_SOPORTE: fechaSoporte,
    TS_INICIO_VA: horaVA,
    TS_INICIO_SOPORTE: horaSoporte,
    TS_INGRESO: cama.TS_INGRESO || '',
  };
  // Solo viaja si un tramo nuevo soltó su marca: si no, ni se menciona la
  // columna y el sello de correcciones queda intacto.
  if (_marcasSueltas !== null) campos.CORRECCIONES_JSON = _marcasSueltas;

  // Snapshot por turno (para la tabla de Registro Diario)
  const ktrCant = parseInt(evo.RESP_KTR_CANT) || 0;
  const ktmTurno = esVerdadero(evo.KTM_REALIZADA) ? (evo.KTM_NIVEL_KTR || '') : (esVerdadero(evo.KTM_SUSPENDIDA) ? 'C' : '');
  const procStr = evo.PROC_RESUMEN || '';
  const firmaT = evo.PLAN_FIRMA_KINE || '';
  if (turno === 'Dia') {
    campos.TEXTO_EVO_DIA = evo.TEXTO_GENERADO || ''; campos.KTR_DIA = ktrCant; campos.KTM_DIA = ktmTurno;
    campos.PROC_DIA = procStr; campos.FIRMA_DIA = firmaT; campos.KEY_DIA = turnoKey;
  } else {
    campos.TEXTO_EVO_NOCHE = evo.TEXTO_GENERADO || ''; campos.KTR_NOCHE = ktrCant;
    campos.PROC_NOCHE = procStr; campos.FIRMA_NOCHE = firmaT; campos.KEY_NOCHE = turnoKey;
  }
  if (timelineJson !== undefined && timelineJson !== null) campos.TIMELINE_JSON = timelineJson;
  if (filaCama !== undefined && filaCama !== null && filaCama > 0) {
    // Merge en memoria sobre la fila leída al inicio del guardado: mismo
    // resultado que repoActualizar (los campos no tocados conservan su valor,
    // null se vuelve ''), sin los dos viajes de volver a ubicar y releer.
    const filaNueva = Object.assign({}, cama);
    Object.keys(campos).forEach(function (k) { filaNueva[k] = (campos[k] == null) ? '' : campos[k]; });
    repoEscribirFila('CAMAS_ESTADO', filaCama, filaNueva);
  } else {
    repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, campos);
  }
}

/**
 * Cuántas veces se ha reintubado cada paciente EN SU EPISODIO EN CURSO.
 *
 * 🔴 La unidad es el EPISODIO, no la extubación. Esto NO es el indicador de
 * fracaso de extubación: allá la unidad es la EXTUBACIÓN (cada una es un
 * intento y cada reintubación ≤48 h es el fracaso de ESE intento), y por eso
 * un paciente extubado tres veces con dos reintubaciones son 3 intentos y 2
 * fracasos. Confundir los dos conteos es exactamente el error que este
 * proyecto ya pagó con «día con VM» y con `sin_condiciones`: dos definiciones
 * conviviendo y el tablero diciendo dos verdades del mismo mes.
 *
 * ⚠️ LÍMITE CONOCIDO: la fila se identifica por TURNO (ID_EVOLUCION +
 * '_REINTUB'), así que dos reintubaciones en el MISMO turno cuentan como una.
 * Es raro —exige extubar y reintubar dos veces en doce horas— y se deja así a
 * propósito: el identificador por turno es lo que hace que re-guardar una
 * evolución no duplique el evento.
 *
 * NO se llama desde obtenerTodasLasCamas a propósito: el censo es camino
 * caliente (corre en cada arranque y cada refresco) y este dato solo se usa al
 * imprimir. Se paga el viaje cuando se aprieta el botón, no siempre.
 *
 * @param  pids  arreglo de PATIENT_ID; si viene vacío devuelve {}.
 * @return {ok:true, data:{ '<pid>': n }} — los pids sin reintubaciones no salen.
 */
function contarReintubaciones(pids) {
  try {
    const lista = (pids || []).map(String).filter(x => x !== '');
    if (!lista.length) return ok({});
    const quiero = {};
    lista.forEach(p => { quiero[p] = true; });
    const conteo = {};
    repoLeerTodos('REINTUBACIONES').forEach(r => {
      const pid = String(r.PATIENT_ID || '');
      if (pid && quiero[pid]) conteo[pid] = (conteo[pid] || 0) + 1;
    });
    return ok(conteo);
  } catch (e) { return err('contarReintubaciones: ' + e.message, ERR.INTERNO, e); }
}

// Registra un evento en la hoja REINTUBACIONES (idempotente por ID_EVOLUCION).
function _registrarReintubacion(evo, idCama, idEvolucion, fecha, turno, ctx, _evosFn) {
  const idReintub = idEvolucion + '_REINTUB';
  const fila = {
    ID_REINTUB: idReintub, PATIENT_ID: evo.PATIENT_ID || '', TIMESTAMP: ahoraTS(), FECHA: fecha, TURNO: turno,
    ID_CAMA: String(idCama), ID_EVOLUCION: idEvolucion, NOMBRE: evo.PAC_NOMBRE || '', COD_PACIENTE: evo.PAC_COD || '',
    DIAGNOSTICO: evo.PAC_DIAGNOSTICO || '', TIPO_DESVINCULACION: evo.EXT_TIPO || '', MOTIVO: evo.EXT_REINTUB_RAZ || '',
    SOPORTE_PREVIO: evo.REINTUB_SOP_PREV || evo.EXT_PE_SOP || '',
    TIEMPO_EXTUBADO: _tiempoExtubado(evo, idCama, fecha, turno, _evosFn),
    HORA_REINTUBACION: evo.REINTUB_HORA || evo.EXT_HORA || '',
    KINESIOLOGO: evo.PLAN_FIRMA_KINE || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
  };
  repoUpsert('REINTUBACIONES', 'ID_REINTUB', idReintub, fila);
}

/**
 * Horas entre la extubación previa del episodio y la reintubación.
 *
 * 🔴 MANDA EL RELOJ, NO EL TURNO (regla de Diego, 14-ago-2026). Este número es
 * el que después permite distinguir una reintubación de una intubación nueva
 * —«no es reintubación sino intubación, por los días»—, así que tiene que ser
 * el tiempo REAL entre los dos momentos.
 *
 * Hasta ago-2026 se calculaba mal por los dos extremos:
 *   · la reintubación se fechaba con la FECHA DEL TURNO, y el turno Noche
 *     pertenece al día anterior hasta las 09:00 ⇒ una reintubación de las
 *     03:00 quedaba **24 h corta**;
 *   · y arriba de eso había un `if (horas < 0) horas += 24`, o sea el síntoma
 *     tapado en el resultado en vez de arreglado en la fecha.
 * Ahora los dos extremos se resuelven con `_tsEventoTurno`, el mismo mecanismo
 * que fecha el ciclo de prono desde la v5.33.
 *
 * NO se usa `EXT_TS` para el momento de la extubación aunque exista: lo arma
 * el navegador con `new Date()`, o sea con el día en que alguien ESCRIBIÓ la
 * evolución, que no tiene por qué ser el día en que se extubó (turno noche,
 * o una evolución corregida al día siguiente). Sirve para el globito de las
 * 48 h, que es un aviso en vivo; no para medir.
 *
 * Devuelve '' si no es computable —falta la hora de la reintubación o no hay
 * extubación registrada en el episodio—. Nunca un número inventado.
 *
 * `_evosFn` (opcional): lector perezoso del episodio ya bajado por quien
 * llama (el guardado), en la misma petición y sin escrituras a EVOLUCIONES
 * entre medio que cambien lo buscado (solo se miran turnos ANTERIORES).
 */
function _tiempoExtubado(evo, idCama, fecha, turno, _evosFn) {
  try {
    const horaRe = evo.REINTUB_HORA || evo.EXT_HORA || '';
    if (!horaRe) return '';
    const tsRe = _tsEventoTurno(fecha, turno, horaRe);

    // (a) La extubación del MISMO turno (reintubación anidada tras la PVE).
    let tsExt = (esVerdadero(evo.EXT_OCURRIO) && evo.EXT_HORA)
      ? _tsEventoTurno(fecha, turno, evo.EXT_HORA) : '';

    // (b) Si no, la extubación más reciente del episodio, con SU fecha y SU
    //     turno. Solo se miran turnos anteriores o el propio.
    if (!tsExt) {
      const evos = (_evosFn ? _evosFn() : repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama)))
        .filter(function (e) {
          return esVerdadero(e.EXT_OCURRIO) && e.EXT_HORA &&
            String(e.PATIENT_ID) === String(evo.PATIENT_ID || '') &&
            String(e.TURNO_KEY) <= String(evo.TURNO_KEY || '');
        });
      evos.sort(function (a, b) { return String(b.TURNO_KEY).localeCompare(String(a.TURNO_KEY)); });
      if (evos.length) {
        tsExt = _tsEventoTurno(_statISO(evos[0].FECHA), evos[0].TURNO, evos[0].EXT_HORA);
      }
    }
    if (!tsExt) return '';

    const h = _horasEntreTS(tsExt, tsRe);
    return h === '' ? '' : h + ' h';
  } catch (e) { return ''; }
}

// ═══ LECTURA ══════════════════════════════════════════════
/**
 * _ubicarEvolucionDeTurno — ubica LA fila de un turno por EPISODIO, no por clave.
 *
 * 🔴 POR QUÉ EXISTE. `ID_EVOLUCION = 'CAMA_<n>_<turnoKey>'` identifica una CAMA
 * en un turno, no a una persona. Cuando una cama rota, dos episodios comparten
 * esa clave — **39 veces en agosto-2026**, medido en la planilla real — y
 * `repoBuscarPorId` devuelve la PRIMERA y esconde la otra. Todo lo que resuelve
 * por esa clave (el ➕ del Registro Diario, los procedimientos, la anulación)
 * puede escribirle a la persona equivocada, o negarle la escritura a la correcta
 * mientras su fila está justo debajo, inalcanzable.
 *
 * Devuelve la fila **por número**, nunca la clave: `repoActualizar` escribe en la
 * primera coincidencia, que es exactamente el bug que esto viene a cerrar.
 *
 * 🩤 NO elige cuando no puede: `{ambigua:true}` es una respuesta, no un fallo.
 * Elegir por su cuenta es lo que hace hoy `repoBuscarPorId`.
 *
 * @param  patientId  el episodio. Vacío = payload viejo (API, smoke, medidores).
 * @param  turnoKey   'YYYY-MM-DD-Dia|Noche'
 * @param  idCama     solo se usa para armar la clave cuando no hay patientId
 * @return {{hoja:string, fila:number, obj:Object, vivo:boolean}} la evolución
 *         | {ambigua:true}  calza con más de una y NO se elige
 *         | null            no existe
 */
function _ubicarEvolucionDeTurno(patientId, turnoKey, idCama) {
  const pid = String(patientId == null ? '' : patientId).trim();
  const tk = String(turnoKey == null ? '' : turnoKey).trim();
  if (!tk) return null;
  const HOJAS = ['EVOLUCIONES', 'EVOLUCIONES_ARCHIVO'];

  /* Se baja la hoja ENTERA de una vez, a propósito. Medido en la planilla real
     (8-ago-2026, ocho comparaciones): con 136 filas en EVOLUCIONES y 90 en el
     archivo, UNA lectura completa le gana a pedir columnas sueltas — en Apps
     Script el viaje pesa más que la celda. Y la fila vuelve COMPLETA, que es
     condición para que quien la reciba pueda reescribirla: `_colsExigirCompleto`
     rechaza lo leído a medias. No se cachea nada — dato clínico: se lee, se
     resuelve y se descarta dentro de la misma petición. */

  if (pid) {
    // Con el episodio en la mano se resuelve por él, no por la cama: tras un
    // traslado el `ID_EVOLUCION` de la fila lleva la cama NUEVA.
    for (let i = 0; i < HOJAS.length; i++) {
      const hoja = HOJAS[i];
      const hit = repoLeerTodosConFila(hoja).filter(function (f) {
        return String(f.obj.TURNO_KEY).trim() === tk &&
               String(f.obj.PATIENT_ID).trim() === pid;
      });
      // Dos filas del MISMO episodio en el MISMO turno dentro de una hoja es un
      // duplicado real: no hay criterio para elegir, y elegir es el bug.
      if (hit.length > 1) return { ambigua: true };
      if (hit.length === 1) {
        return { hoja: hoja, fila: hit[0].fila, obj: hit[0].obj, vivo: hoja === 'EVOLUCIONES' };
      }
    }
    /* Entre hojas manda la VIVA — por eso el recorrido empieza por ella. Aquí SÍ
       hay criterio, al revés que abajo: con el pid pedido se sabe que las dos
       filas son del MISMO episodio (hay 1 clave duplicada entre hoja viva y
       archivo en la planilla real), y la viva es la que se sigue editando. Es el
       mismo criterio que ya eligió `obtenerEvosDelDia` para el Registro Diario;
       las dos pantallas no pueden discrepar sobre la misma fila.

       Y con pid pedido NO se cae a una fila de `PATIENT_ID` vacío: adoptarla
       puede ser adoptar la del paciente anterior. Esa decisión es de quien llama,
       que tiene la cama a la vista; el localizador no la toma por él. */
    return null;
  }

  /* Sin pid (payload viejo): se resuelve por clave, pero CONTANDO en las DOS
     hojas. Detectar solo «aparece en las dos» no basta — el duplicado que se
     acumula solo es el de dentro de EVOLUCIONES_ARCHIVO, que archiva conservando
     la clave. Y aquí no se puede aplicar el «manda la viva» de arriba: sin pid no
     hay cómo saber si las dos filas son el mismo episodio o dos personas. */
  const clave = 'CAMA_' + idCama + '_' + tk;
  const halladas = [];
  HOJAS.forEach(function (hoja) {
    repoLeerTodosConFila(hoja).forEach(function (f) {
      if (String(f.obj.ID_EVOLUCION).trim() !== clave) return;
      halladas.push({ hoja: hoja, fila: f.fila, obj: f.obj, vivo: hoja === 'EVOLUCIONES' });
    });
  });
  if (!halladas.length) return null;
  if (halladas.length > 1) return { ambigua: true };
  return halladas[0];
}

function obtenerEvolucion(idCama, turnoKey, patientId) {
  try {
    /* Antes resolvía con `repoBuscarPorId` sobre la clave de la cama, y solo en
       la hoja viva: en una cama rotada devolvía LA PRIMERA —la del otro
       paciente— y de un egresado no devolvía nada. Ahora lo ubica el localizador,
       que mira las dos hojas y AVISA cuando no puede decidir en vez de elegir. */
    const ubic = _ubicarEvolucionDeTurno(String(patientId || ''), turnoKey, idCama);
    if (ubic && ubic.ambigua) {
      return err('La cama ' + idCama + ' tuvo dos pacientes en ese turno: hay que indicar de cuál ' +
        'se está hablando.', ERR.VALIDACION);
    }
    return ok(ubic ? ubic.obj : null);
  } catch (e) { return err('obtenerEvolucion: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Evolución inmediatamente ANTERIOR a un turno (para replicar y bajar el roce).
 * Como turnoKey = "YYYY-MM-DD-Dia|Noche", el orden alfabético coincide con el
 * cronológico (Dia < Noche). Devuelve la más reciente estrictamente anterior.
 *
 * `_evos` (opcional): las evoluciones de la cama que quien llama YA tiene en la
 * mano, de la misma petición y sin ninguna escritura de por medio. No es un
 * caché — nada sobrevive a la petición — sino no volver a pedir lo mismo dos
 * veces seguidas. Sin el parámetro se comporta exactamente como antes.
 */
function obtenerEvolucionPrevia(idCama, turnoKey, _evos) {
  try {
    const evos = _evos || repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    const objetivo = String(turnoKey);
    let mejor = null, mejorKey = '';
    let mejorDia = null, mejorDiaKey = '';
    evos.forEach(e => {
      const k = String(e.TURNO_KEY || '');
      if (!k || k >= objetivo) return;
      if (k > mejorKey) { mejor = e; mejorKey = k; }
      if (/-Dia$/.test(k) && k > mejorDiaKey) { mejorDia = e; mejorDiaKey = k; }
    });
    // Terapia física (KTM/IMT/EMS) se replica DÍA→DÍA: la Noche intermedia no
    // aporta ese bloque (de noche va oculto y limpio). Si la previa inmediata
    // no es de día, viaja adjunta la última evolución de turno Día.
    if (mejor && mejorDia && mejorDiaKey !== mejorKey) mejor._PREVIA_DIA = mejorDia;
    // Racha de válvula de fonación: turnos CONSECUTIVOS hacia atrás con la
    // válvula como modo (o con uso registrado). ~12 h por turno — alimenta la
    // frase de la decanulación («Cumple ~24 h con válvula de fonación…»).
    if (mejor) {
      const orden = evos.map(e => String(e.TURNO_KEY || '')).filter(k => k && k < objetivo).sort().reverse();
      const porKey = {}; evos.forEach(e => { porKey[String(e.TURNO_KEY || '')] = e; });
      let racha = 0;
      for (let i = 0; i < orden.length; i++) {
        const e2 = porKey[orden[i]];
        if (e2 && (String(e2.VENT_MODO) === 'Válvula de fonación' || String(e2.VENT_MODO_FINAL) === 'Válvula de fonación' || esVerdadero(e2.VFON_USADA))) racha++;
        else break;
      }
      mejor._VFON_HORAS = racha * 12;
    }
    // (Aquí vivía `mejor._PRONO_ABIERTO_TS`, retirado en ago-2026: ningún
    // consumidor lo leía —ni el servidor, ni el index, ni el cohete desplegado—
    // y costaba una bajada COMPLETA de EVOLUCIONES por cada apertura de
    // paciente. La pronación abierta llega al cliente por su vía real: el campo
    // `pronoAbierto` de GET_EVO_TURNO, que sí se consume.)
    return ok(mejor);
  } catch (e) { return err('obtenerEvolucionPrevia: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Turno actual + previa en UNA llamada (evita 2 round-trips seriales al abrir el panel).
 */
function obtenerEvoTurno(idCama, turnoKey) {
  try {
    // UNA sola bajada del episodio responde las TRES preguntas: el turno
    // actual, la previa y la pronación abierta miran exactamente las mismas
    // filas, y entre una y otra no hay ninguna escritura (esta acción solo
    // lee). El turno actual se deriva del episodio en vez de buscarse aparte:
    // ID_EVOLUCION es 'CAMA_<idCama>_<turnoKey>', así que dentro de las filas
    // de la cama, coincidir en TURNO_KEY ⇔ coincidir en ID_EVOLUCION (misma
    // primera-fila que devolvía la búsqueda por columna).
    const evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    const tk = String(turnoKey);
    let actual = null;
    for (let i = 0; i < evos.length; i++) {
      if (String(evos[i].TURNO_KEY || '') === tk) { actual = evos[i]; break; }
    }
    // La previa viaja SIEMPRE, también cuando el turno ya está guardado: el
    // formulario la usa para mostrar «Antes: X → Y» bajo los campos de estado
    // (vía aérea, soporte, modo, tubo), y al RE-EDITAR es justo cuando importa
    // ver qué cambió respecto del turno anterior. No cuesta una lectura más —
    // recorre el mismo `evos` que ya está en memoria (Ola 1).
    const _rp = obtenerEvolucionPrevia(idCama, turnoKey, evos);
    const previa = (_rp.ok && _rp.data) ? _rp.data : null;
    // La pronación abierta viaja SIEMPRE (también al re-editar un turno ya
    // guardado, donde la supinación puede agregarse recién ahora).
    return ok({ actual: actual, previa: previa, pronoAbierto: _pronoAbiertoTS(idCama, turnoKey, evos) });
  } catch (e) { return err('obtenerEvoTurno: ' + e.message, ERR.INTERNO, e); }
}

function obtenerEvolucionesRecientes(idCama, limite) {
  try {
    const evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    evos.sort((a, b) => String(b.TURNO_KEY).localeCompare(String(a.TURNO_KEY)));
    return ok(limite ? evos.slice(0, limite) : evos);
  } catch (e) { return err('obtenerEvolucionesRecientes: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Evoluciones registradas en una fecha (ambos turnos), versión mínima.
 * Alimenta los dots verdes del grid (EVO_SET) y la vista retrospectiva.
 * @param {string} fecha  'yyyy-MM-dd'
 */
function obtenerEvosDelDia(fecha) {
  try {
    const f = String(fecha || hoyISO()).slice(0, 10);
    // Lectura acotada: solo las filas del día (antes bajaba la hoja completa,
    // 379 columnas × todo el historial, en CADA arranque de la app).
    const delDia = function (k) { return String(k).indexOf(f) === 0; };
    /* 🔴 Se leen las DOS hojas. Al dar el alta, `_archivarEvolucionesDeCama`
       mueve las filas del episodio a EVOLUCIONES_ARCHIVO: leyendo solo la hoja
       viva, el día de cualquier paciente ya egresado desaparecía del Registro
       Diario y la tarjeta caía al ocupante ACTUAL de la cama — otra persona.
       Medido en la planilla real el 20-ago-2026: 365 turnos de 45 episodios,
       el 60,7% del registro de agosto. El REM y los indicadores nunca lo
       sufrieron porque ellos ya leían las dos (svc_rem, svc_stats).
       El costo es una lectura más de la columna TURNO_KEY: un viaje, porque
       `repoLeerFiltrado` baja la clave y después solo los tramos que marcó. */
    const vivas = repoLeerFiltrado('EVOLUCIONES', 'TURNO_KEY', delDia);
    const archivadas = repoLeerFiltrado('EVOLUCIONES_ARCHIVO', 'TURNO_KEY', delDia);
    /* Una fila puede estar en las dos si un archivado quedó a medias (2 casos
       en la planilla real). Manda la viva, que es la que se sigue editando.
       El orden —vivas primero, archivadas después— es estable a propósito: una
       cama puede tener DOS episodios el mismo turno (el que egresa y el que
       ingresa ese día, 39 veces en agosto) y quien lea no puede depender de
       cuál venga antes. */
    const clave = function (e) {
      return String(e.ID_CAMA) + '|' + String(e.TURNO_KEY) + '|' + String(e.PATIENT_ID);
    };
    const yaEsta = {};
    vivas.forEach(function (e) { yaEsta[clave(e)] = true; });
    const evos = vivas
      .concat(archivadas.filter(function (e) { return !yaEsta[clave(e)]; }))
      .map(function (e) {
        return {
          ID_CAMA: String(e.ID_CAMA), TURNO_KEY: String(e.TURNO_KEY),
          // Registro Diario (pestaña 📋): lo hecho en cada turno, por cama
          PAC_NOMBRE: e.PAC_NOMBRE, PAC_EDAD: e.PAC_EDAD, PAC_SEXO: e.PAC_SEXO,
          PAC_DIAGNOSTICO: e.PAC_DIAGNOSTICO, VENT_SOPORTE: e.VENT_SOPORTE,
          DIA_ESTADIA: e.DIA_ESTADIA, DIAS_VM: e.DIAS_VM,
          DIAS_VM_PREVIOS: e.DIAS_VM_PREVIOS, DIAS_VNI_PREVIOS: e.DIAS_VNI_PREVIOS,
          RESP_KTR_CANT: e.RESP_KTR_CANT,
          KTM_REALIZADA: e.KTM_REALIZADA, KTM_SUSPENDIDA: e.KTM_SUSPENDIDA,
          KTM_NIVEL_KTR: e.KTM_NIVEL_KTR,
          PROC_RESUMEN: e.PROC_RESUMEN, PLAN_FIRMA_KINE: e.PLAN_FIRMA_KINE,
          EXT_OCURRIO: e.EXT_OCURRIO, DECAN_OCURRIO: e.DECAN_OCURRIO,
          // Vista retrospectiva de CAMAS: la tarjeta se reconstruye con lo que
          // se registró ESE día, no con el ocupante actual de la cama.
          PATIENT_ID: e.PATIENT_ID, COD_PACIENTE: e.COD_PACIENTE,
          VENT_VIA_AEREA: e.VENT_VIA_AEREA_FINAL || e.VENT_VIA_AEREA || '',
          VENT_MODO: e.VENT_MODO_FINAL || e.VENT_MODO || '',
          KTM_NIVEL: e.KTM_NIVEL_KTR, FASE_JSON: e.FASE_JSON,
        };
      });
    /* Los ANEXOS del día viajan pegados a su evolución (24-ago-2026): el sello
       del ➕ en el Registro Diario lleva una × para borrarlo, y esa × necesita
       la identidad real de la fila (ID_PROC) — nunca «el nombre más parecido».
       Solo TIPO_PROC='anexo': los procedimientos del guardado no se borran
       desde el Registro (se corrigen re-guardando la evolución). Cada anexo se
       consume en UNA evolución: en una cama rotada, el pid decide de quién es,
       y el anexo sin pid (cama reparada a mano) se pega al primero que calce. */
    try {
      const anexos = repoLeerFiltrado('PROCEDIMIENTOS', 'FECHA', function (k) { return _statISO(k) === f; })
        .filter(function (p) { return String(p.TIPO_PROC) === 'anexo'; });
      if (anexos.length) {
        const usado = {};
        evos.forEach(function (e) {
          const propios = [];
          anexos.forEach(function (p, i) {
            if (usado[i]) return;
            if (String(p.ID_CAMA) !== String(e.ID_CAMA)) return;
            if ((_statISO(p.FECHA) + '-' + String(p.TURNO)) !== String(e.TURNO_KEY)) return;
            const pp = String(p.PATIENT_ID || ''), pe = String(e.PATIENT_ID || '');
            if (pp && pe && pp !== pe) return;
            usado[i] = true;
            propios.push({ id: String(p.ID_PROC), nombre: String(p.NOMBRE_PROC || ''), ts: String(p.TIMESTAMP || '') });
          });
          if (propios.length) e.ANEXOS = propios;
        });
      }
    } catch (e2) { /* sin anexos legibles: el Registro sale igual, sin × */ }
    return ok(evos);
  } catch (e) { return err('obtenerEvosDelDia: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Historial de un episodio: hitos + evoluciones (activas y archivadas), por PATIENT_ID.
 */
function obtenerHistorialPaciente(idCama, patientId) {
  try {
    if (!patientId) {
      const rc = obtenerCama(idCama);
      if (rc.ok && rc.data.PATIENT_ID) patientId = rc.data.PATIENT_ID;
    }
    let hitos = patientId
      ? repoLeerTodos('TIMELINE', 'PATIENT_ID', patientId)
      : repoLeerTodos('TIMELINE', 'ID_CAMA', String(idCama));
    hitos.sort((a, b) => String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)));

    let evos = [];
    if (patientId) {
      evos = repoLeerTodos('EVOLUCIONES', 'PATIENT_ID', patientId)
        .concat(repoLeerTodos('EVOLUCIONES_ARCHIVO', 'PATIENT_ID', patientId));
    } else {
      evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    }
    evos.sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));

    return ok({ hitos, evoluciones: evos });
  } catch (e) { return err('obtenerHistorialPaciente: ' + e.message, ERR.INTERNO, e); }
}


/**
 * Anula un evento único ya guardado en un turno (marcado por error):
 * borra sus columnas, lo quita de los procedimientos, recalcula el estado
 * final de VA y los pliegues de contadores, regenera el texto y re-sincroniza
 * la cama (incluidas las fechas de inicio de soporte/VA para que los días
 * no se reinicien). Solo permitido si NO existen evoluciones posteriores del
 * paciente (para no romper la historia construida sobre el evento).
 */
function anularEvento(datos, ctx) {
  const idCama = String(datos.idCama || datos.ID_CAMA || '');
  const turnoKey = String(datos.turnoKey || datos.TURNO_KEY || '');
  const tipo = String(datos.tipo || '');
  if (!idCama || !turnoKey || !tipo) return err('Faltan idCama/turnoKey/tipo.', ERR.VALIDACION);

  const evoR = obtenerEvolucion(idCama, turnoKey, datos.patientId);
  if (!evoR.ok) return evoR;   // p. ej. la cama tuvo dos pacientes ese turno
  if (!evoR.data) return err('No existe evolución para ese turno.', ERR.VALIDACION);
  const evo = evoR.data;

  /* 🔴 CANDADO MÍNIMO. Al final, `anularEvento` llama a `_syncCamaDesdeEvolucion`
     con los datos de la evolución: vía aérea, soporte, modo, fechas de inicio.
     Si esa evolución es de un episodio que ya no ocupa la cama, ese sync le
     reescribe el censo AL OCUPANTE ACTUAL — escribe más lejos que el bug que
     esta tanda vino a cerrar. Anular sobre episodios cerrados es deuda conocida
     y queda fuera (NO3 del PRD); lo que no puede pasar es que toque a un tercero. */
  const _camaAnu = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
  const _pidCama = String((_camaAnu && _camaAnu.PATIENT_ID) || '');
  const _pidEvo = String(evo.PATIENT_ID || '');
  if (_pidCama && _pidEvo && _pidCama !== _pidEvo) {
    return err('Esa evolución es de un episodio anterior de la cama ' + idCama + '. Anular desde ' +
      'aquí le reescribiría el estado al paciente que está ahora.', ERR.VALIDACION);
  }

  // Guard: sin evoluciones posteriores del mismo paciente
  const posteriores = repoLeerTodos('EVOLUCIONES', 'PATIENT_ID', evo.PATIENT_ID)
    .filter(function (e) { return String(e.TURNO_KEY) > turnoKey; });
  if (posteriores.length) {
    return err('Solo se puede anular un evento desde la ÚLTIMA evolución del paciente (hay ' +
      posteriores.length + ' turnos posteriores que se construyeron sobre este estado).', ERR.VALIDACION);
  }

  const GRUPOS = {
    pve_ext: ['PVE_RESULTADO','PVE_FR_MOTIVOS','PVE_SC_RAZON','PVE_SC_DET','PVE_VAL','EXT_OCURRIO','EXT_HORA','EXT_TS','EXT_TIPO','EXT_MOTIVO','EXT_POST_DET','EXT_PE_VA','EXT_PE_SOP','EXT_PE_MODO'],
    reintub: ['REINTUB_TOT_N','REINTUB_TOT_CM','REINTUB_MODO','REINTUB_PARAMS','REINTUB_HORA','REINTUB_SOP_PREV','EXT_REINTUB','EXT_REINTUB_RAZ','REINTUB_SOP_POST','REINTUB_VT','REINTUB_FR','REINTUB_PEEP','REINTUB_FIO2','REINTUB_SPO2','REINTUB_PMAX','REINTUB_PPL','REINTUB_AUTOPEEP','REINTUB_PS','REINTUB_PAFI'],
    intub:   ['INTUB_OCURRIO','INTUB_HORA','INTUB_DET','INTUB_SOP_PREVIO','INTUB_VA_PREVIA','INTUB_MODO_PREVIO','INTUB_VA_POST','INTUB_SOP_POST','INTUB_MODO_POST','INTUB_TOT_N','INTUB_TOT_CM','INTUB_VT','INTUB_FR','INTUB_PEEP','INTUB_FIO2','INTUB_SPO2'],
    decan:   ['DECAN_OCURRIO','DECAN_TIPO','DECAN_QUEDA_DISP','DECAN_QUEDA_FLUJO','DECAN_QUEDA_SPO2','DECAN_DET','DECAN_RECANUL'],
    desvinc: ['DESVINC_OCURRIO','DESVINC_HORA','DESVINC_A','DESVINC_MOTIVO','DESVINC_RECONEXION','DESVINC_HORA_RECON','DESVINC_HORAS','DESVINC_DET'],
    cambio_tot: ['TOT_CAMBIO','TOT_CAMBIO_MOTIVO'],
    cambio_tqt: ['TQT_CAMBIO','TQT_CAMBIO_MOTIVO'],
  };
  const PROCS_QUITAR = {
    pve_ext: ['PVE','EXTUBACIÓN C/PROTOCOLO','EXTUBACIÓN S/PROTOCOLO','AUTOEXTUBACIÓN','EXTUBACIÓN ACCIDENTAL'],
    reintub: ['REINTUBACIÓN'],
    intub:   ['INTUBACIÓN'],
    decan:   ['DECANULACIÓN','RECANULACIÓN'],
    desvinc: ['DESVINCULACIÓN'],
    cambio_tot: ['CAMBIO TOT'],
    cambio_tqt: ['CAMBIO TQT'],
  };
  if (!GRUPOS[tipo]) return err('Tipo de evento desconocido: ' + tipo, ERR.VALIDACION);

  const tipos = [tipo];
  // Anular la extubación arrastra la reintubación anidada del mismo turno
  if (tipo === 'pve_ext' && esVerdadero(evo.EXT_REINTUB)) tipos.push('reintub');

  return conLock(function () {
    tipos.forEach(function (t) {
      GRUPOS[t].forEach(function (c) { evo[c] = ''; });
      if (t === 'reintub') {
        repoEliminarDonde('REINTUBACIONES', function (r) { return String(r.ID_REINTUB) === evo.ID_EVOLUCION + '_REINTUB'; });
        evo.N_REINTUB = Math.max(0, (parseInt(evo.N_REINTUB) || 1) - 1);
      }
    });

    // Procedimientos: quitar los del evento
    let procs = [];
    try { procs = JSON.parse(evo.PROC_JSON || '[]') || []; } catch (e) {}
    const quitar = tipos.reduce(function (a, t) { return a.concat(PROCS_QUITAR[t]); }, []);
    procs = procs.filter(function (p) {
      const up = String(p).toUpperCase();
      return !quitar.some(function (q) { return up === q || up.indexOf(q + ' ') === 0; });
    });
    evo.PROC_JSON = JSON.stringify(procs);
    evo.PROC_RESUMEN = procs.join(', ');
    evo.PROC_CANTIDAD = procs.length;

    // Estado final de VA y pliegue de contadores vuelven al estado del turno
    if (tipo !== 'cambio_tot' && tipo !== 'cambio_tqt') {
      evo.VENT_VIA_AEREA_FINAL = evo.VENT_VIA_AEREA;
      evo.VENT_SOPORTE_FINAL = evo.VENT_SOPORTE;
      evo.VENT_MODO_FINAL = evo.VENT_MODO;
      if (tipo === 'pve_ext' || tipo === 'decan') {
        const dvm = parseInt(evo.DIAS_VM) || 0;
        evo.DIAS_VM_PREVIOS = Math.max(0, (parseInt(evo.DIAS_VM_PREVIOS) || 0) - dvm);
      }
    }

    evo.TEXTO_GENERADO = generarTextoEvolucion(evo);
    repoUpsert('EVOLUCIONES', 'ID_EVOLUCION', evo.ID_EVOLUCION, evo);

    // Re-sincronizar la cama y restaurar las fechas de inicio (para que los
    // contadores de días de VM/VA no se reinicien tras la anulación)
    const fecha = _statISO(evo.FECHA);
    const rc = obtenerCama(idCama);
    const cama = rc.ok ? rc.data : {};
    _syncCamaDesdeEvolucion(idCama, cama, evo, evo.TURNO, turnoKey, fecha, evo.PATIENT_ID);
    if (tipo !== 'cambio_tot' && tipo !== 'cambio_tqt') {
      const rest = function (iso, n) {
        const dt = new Date(iso + 'T12:00:00');
        dt.setDate(dt.getDate() - n);
        return Utilities.formatDate(dt, leerConfig('TIMEZONE', 'America/Santiago'), 'yyyy-MM-dd');
      };
      const campos = {};
      const dvm = parseInt(evo.DIAS_VM) || 0, dva = parseInt(evo.DIAS_VA) || 0;
      // ARRASTRE (D7): esta restauración deriva la fecha de inicio RESTANDO los
      // días que traía la evolución. Sobre una fecha corregida por la
      // coordinación eso la deshace en silencio — y era el segundo camino por
      // el que la corrección de un egresado de 28 días se perdía. Aquí no se
      // suelta la marca: anular un evento no abre un tramo clínico nuevo, lo
      // que hace es borrar uno que se había marcado por error.
      const _camaAct = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama) || {};
      if (evo.VENT_SOPORTE === 'VM' && fecha && !coordCampoCorregido(_camaAct, 'FECHA_INICIO_SOPORTE')) campos.FECHA_INICIO_SOPORTE = rest(fecha, dvm);
      if (evo.VENT_VIA_AEREA && evo.VENT_VIA_AEREA !== 'Natural' && fecha && !coordCampoCorregido(_camaAct, 'FECHA_INICIO_VA')) campos.FECHA_INICIO_VA = rest(fecha, dva);
      if (Object.keys(campos).length) repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, campos);
    }

    return ok({
      idEvolucion: evo.ID_EVOLUCION, idCama: idCama, patientId: evo.PATIENT_ID || '',
      turnoKey: turnoKey, accion: 'anular_' + tipos.join('+'), entidad: 'EVOLUCIONES',
      TEXTO_GENERADO: evo.TEXTO_GENERADO || '',
    });
  });
}

// ── Ciclo de prono ──────────────────────────────────────────────────────────
//  Una sesión de prono puede durar VARIOS DÍAS, así que la hora sola no basta:
//  se sella el momento real (fecha del turno resuelta contra la hora escrita —
//  el turno Noche cruza la medianoche) y la cuenta se cierra en la evolución
//  que supina, contra la pronación abierta del episodio. Da igual quién prone y
//  quién supine, ni cuántos turnos pasen en medio.

/** Sella PRONO_INICIO_TS / SUPINO_TS y cierra PRONO_HORAS al supinar. */
function _pronoSellarCiclo(idCama, turnoKey, fecha, turno, datos, _evos) {
  if (esVerdadero(datos.RESP_PRONO_EVENTO)) {
    datos.PRONO_INICIO_TS = _tsEventoTurno(fecha, turno, datos.RESP_PRONO_HORA);
  }
  if (esVerdadero(datos.RESP_SUPINO_EVENTO)) {
    const ts = _tsEventoTurno(fecha, turno, datos.RESP_SUPINO_HORA);
    datos.SUPINO_TS = ts;
    // si se pronó y supinó en el mismo turno, el inicio es el de esta misma fila
    const ini = datos.PRONO_INICIO_TS || _pronoAbiertoTS(idCama, turnoKey, _evos);
    const h = ini ? _horasEntreTS(ini, ts) : '';
    datos.PRONO_HORAS = (h === '' ? '' : h);
  }
}

/**
 * Momento de la pronación ABIERTA del episodio (la última sin supinación
 * posterior), mirando los turnos anteriores a turnoKey. '' si no hay ninguna.
 *
 * `_evos` (opcional): el episodio ya leído por quien llama, en la misma
 * petición y sin escrituras de por medio. Ver obtenerEvolucionPrevia.
 */
function _pronoAbiertoTS(idCama, turnoKey, _evos) {
  try {
    const evos = _evos || repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    const objetivo = String(turnoKey || '');
    const previas = evos
      .filter(e => { const k = String(e.TURNO_KEY || ''); return k && (!objetivo || k < objetivo); })
      .sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));
    let abierto = '';
    previas.forEach(e => {
      if (esVerdadero(e.RESP_PRONO_EVENTO) && e.PRONO_INICIO_TS) abierto = String(e.PRONO_INICIO_TS);
      if (esVerdadero(e.RESP_SUPINO_EVENTO)) abierto = '';
    });
    return abierto;
  } catch (e) { return ''; }
}


// ════════════════════════════════════════════════════════════════════
// ── svc_indicadores.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_indicadores.gs — Tablero de indicadores centinela (jul-2026).
 *
 * Calcula desde el registro diario (EVOLUCIONES + EVOLUCIONES_ARCHIVO +
 * REINTUBACIONES + ARCHIVO_PACIENTES), con numerador y denominador visibles.
 * Definiciones acordadas con la coordinación (alineadas al análisis M. Fuentes):
 *  - Fracaso de extubación = reintubación ≤48 h tras extubación programada
 *    (precoz <24 h, tardío 24–48 h). Denominador: extubaciones programadas
 *    (protocolo + fuera de protocolo); autoextubación/accidental van aparte.
 *  - Autoextubaciones por 100 días-VM (meta 1–2; días-VM = paciente-días con VM).
 *  - Fuera de protocolo = EXT_TIPO sin_protocolo o sin_condiciones (meta <25%).
 *  - PVE por 100 paciente-día (PVE_VAL='si').
 *  - Mortalidad SIN ajuste por gravedad (el ajuste se hace fuera, por RUT).
 * La tendencia mensual mezcla los meses de la plataforma con la hoja
 * INDICADORES_HISTORICO (sembrada desde el análisis histórico), marcando fuente.
 */

/**
 * Campos de EVOLUCIONES que este cálculo necesita — 21 de 386 (ago-2026, Ola 3).
 *
 * 🔴 **Si agregas un `e.CAMPO` al cálculo, agrégalo también acá.** Lo que no
 * esté en esta lista se lee como vacío y el indicador que dependa de él baja
 * a 0 sin avisar. `build/checks/columnas.js` compara esta lista contra los
 * campos que el archivo realmente toca y falla si falta alguno; no es una
 * lista de memoria, es una lista verificada.
 */
const _CAMPOS_INDICADORES = [
  'PATIENT_ID', 'FECHA', 'TURNO_KEY',
  'VENT_SOPORTE', 'VENT_SOPORTE_FINAL', 'VENT_VIA_AEREA', 'VENT_CUFF_EST',
  'EXT_OCURRIO', 'EXT_TIPO', 'EXT_HORA', 'EXT_MOTIVO',
  'PVE_VAL', 'TQT_OCURRIO',
  'KTM_REALIZADA', 'KTM_CANT', 'RESP_KTR_CANT',
  'DESVINC_OCURRIO', 'DESVINC_RECONEXION', 'DESVINC_HORAS',
  'VFON_USADA', 'VFON_MIN',
];

function calcularIndicadores(desde, hasta) {
  try {
    desde = String(desde || '').slice(0, 10);
    hasta = String(hasta || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
      return err('Rango de fechas inválido.', ERR.VALIDACION);
    }
    const enR = f => { const s = _statISO(f); return s >= desde && s <= hasta; };

    const todasEvos = repoLeerColumnas('EVOLUCIONES', _CAMPOS_INDICADORES)
      .concat(repoLeerColumnas('EVOLUCIONES_ARCHIVO', _CAMPOS_INDICADORES));
    const evosR = todasEvos.filter(e => enR(e.FECHA));
    const archivo = repoLeerTodos('ARCHIVO_PACIENTES');
    const camas = repoLeerTodos('CAMAS_ESTADO');

    // ── Denominadores base ──
    // **Día con VM = el paciente estuvo en VM en algún momento del turno**,
    // ya sea al empezarlo (`VENT_SOPORTE`) o al cerrarlo (`VENT_SOPORTE_FINAL`).
    // Decisión de Manuel Fuentes, 8-ago-2026, y corrige un error real: hasta hoy
    // este denominador contaba SOLO el soporte de inicio mientras que la VM
    // prolongada y la mediana pre-TQT (más abajo) ya usaban la definición
    // amplia. Con un paciente que entraba en VNI y terminaba en VM el turno no
    // contaba como día-VM, el denominador se quedaba corto y
    // `autoextPor100VM` se disparaba — medido en 100 contra una meta de 1-2.
    // Ahora el tablero usa UNA sola definición; si se cambia, se cambia en los
    // dos sitios (lo exige `checks/indicadores.js`).
    const _esDiaVM = e => String(e.VENT_SOPORTE) === 'VM' || String(e.VENT_SOPORTE_FINAL) === 'VM';
    const pacDias = {}, vmDias = {};
    evosR.forEach(e => {
      const k = String(e.PATIENT_ID) + '|' + _statISO(e.FECHA);
      pacDias[k] = true;
      if (_esDiaVM(e)) vmDias[k] = true;
    });
    const nPacDias = Object.keys(pacDias).length;
    const nVmDias = Object.keys(vmDias).length;
    const diasRango = Math.round((new Date(hasta) - new Date(desde)) / 864e5) + 1;

    // ── Extubaciones del rango ──
    const PROGRAMADAS = { protocolo: 1, sin_protocolo: 1 };
    const FUERA = { sin_protocolo: 1 };
    // «sin_condiciones» era, hasta v4.1, un tipo dentro de «tipo de extubación».
    // Decisión clínica (jul-2026): NO es una extubación — significa que ese turno
    // no se realizó PVE, y ahora se registra con su razón (PVE_SC_RAZON). Se
    // ignora aquí para que ninguna fila histórica lo cuente como extubación.
    const NO_ES_EXTUBACION = { sin_condiciones: 1 };
    const ACCIDENTALES = { autoextubacion: 1, accidental: 1 };
    const extProg = [];
    let nFuera = 0, nAutoext = 0;
    const motivosFuera = {};   // motivo → {total, noche}
    evosR.forEach(e => {
      if (!esVerdadero(e.EXT_OCURRIO)) return;
      const tipo = String(e.EXT_TIPO || '');
      const esNoche = /Noche$/i.test(String(e.TURNO_KEY || ''));
      if (NO_ES_EXTUBACION[tipo]) return;
      if (ACCIDENTALES[tipo]) { nAutoext++; return; }
      if (!PROGRAMADAS[tipo]) return;
      extProg.push({ pid: String(e.PATIENT_ID), fecha: _statISO(e.FECHA), hora: String(e.EXT_HORA || '') });
      if (FUERA[tipo]) {
        nFuera++;
        const mot = String(e.EXT_MOTIVO || '').trim() || 'Sin motivo registrado';
        const m = motivosFuera[mot] = motivosFuera[mot] || { total: 0, noche: 0 };
        m.total++; if (esNoche) m.noche++;
      }
    });

    // ── Fracaso: reintubación ≤48 h tras la extubación programada ──
    const reintubs = repoLeerTodos('REINTUBACIONES');
    const reintubPorPid = {};
    reintubs.forEach(r => {
      const pid = String(r.PATIENT_ID || '');
      (reintubPorPid[pid] = reintubPorPid[pid] || []).push({ fecha: _statISO(r.FECHA), hora: String(r.HORA_REINTUBACION || '') });
    });
    const horasEntre = (f1, h1, f2, h2) => {
      const dias = Math.round((new Date(f2) - new Date(f1)) / 864e5);
      const m1 = /^\d{1,2}:\d{2}/.test(h1) ? parseInt(h1) * 60 + parseInt(h1.split(':')[1]) : null;
      const m2 = /^\d{1,2}:\d{2}/.test(h2) ? parseInt(h2) * 60 + parseInt(h2.split(':')[1]) : null;
      if (m1 !== null && m2 !== null) return dias * 24 + (m2 - m1) / 60;
      return dias * 24;   // sin horas: aproximación por días (0=mismo día→precoz, 1→24h, 2→48h)
    };
    // El criterio de las 48 h se aplica UNA sola vez por extubación y de aquí
    // salen los dos consumidores: el total del rango y la tendencia mensual.
    // Antes se emparejaba dos veces (aquí y al armar la tendencia) con dos
    // copias del mismo criterio clínico: coincidían por suerte, y si alguien
    // corregía una definición —la ventana, el orden de los candidatos— el
    // tablero podía quedar diciendo dos verdades distintas sobre el mismo mes.
    let nPrecoz = 0, nTardio = 0;
    const porMes = {};   // 'aaaa-mm' → { ext, fra }
    extProg.forEach(x => {
      const m = x.fecha.slice(0, 7);
      const mes = porMes[m] = porMes[m] || { ext: 0, fra: 0 };
      mes.ext++;
      let mejor = null;
      (reintubPorPid[x.pid] || []).forEach(r => {
        if (r.fecha < x.fecha) return;
        const h = horasEntre(x.fecha, x.hora, r.fecha, r.hora);
        if (h >= 0 && h <= 48 && (mejor === null || h < mejor)) mejor = h;
      });
      if (mejor === null) return;
      mes.fra++;
      if (mejor < 24) nPrecoz++; else nTardio++;
    });
    const nFracaso = nPrecoz + nTardio;

    // ── PVE, TQT, VM prolongada, atenciones ──
    const nPVE = evosR.filter(e => String(e.PVE_VAL) === 'si').length;

    const vmDiasEpisodio = {};   // pid → Set de días con VM (episodio completo)
    todasEvos.forEach(e => {
      if (!_esDiaVM(e)) return;   // misma definición que el denominador de arriba
      const pid = String(e.PATIENT_ID);
      (vmDiasEpisodio[pid] = vmDiasEpisodio[pid] || {})[_statISO(e.FECHA)] = true;
    });
    const diasVMpreTQT = [];
    evosR.forEach(e => {
      if (!esVerdadero(e.TQT_OCURRIO)) return;
      const dias = Object.keys(vmDiasEpisodio[String(e.PATIENT_ID)] || {}).filter(d => d <= _statISO(e.FECHA)).length;
      diasVMpreTQT.push(dias);
    });
    diasVMpreTQT.sort((a, b) => a - b);
    const medianaTQT = diasVMpreTQT.length
      ? (diasVMpreTQT.length % 2 ? diasVMpreTQT[(diasVMpreTQT.length - 1) / 2]
        : (diasVMpreTQT[diasVMpreTQT.length / 2 - 1] + diasVMpreTQT[diasVMpreTQT.length / 2]) / 2)
      : null;

    const pidsVMenRango = {};
    Object.keys(vmDias).forEach(k => { pidsVMenRango[k.split('|')[0]] = true; });
    const nVentilados = Object.keys(pidsVMenRango).length;
    const nVMProlongada = Object.keys(pidsVMenRango)
      .filter(pid => Object.keys(vmDiasEpisodio[pid] || {}).length > 7).length;

    let atenciones = 0;
    evosR.forEach(e => {
      atenciones += Math.max(0, parseInt(e.RESP_KTR_CANT) || 0);
      if (esVerdadero(e.KTM_REALIZADA)) atenciones += Math.min(9, Math.max(1, parseInt(e.KTM_CANT) || 1));
    });

    // ── Desvinculación de VM del paciente traqueostomizado (weaning de TQT) ──
    // Ventanas registradas en el turno: cuántas, cuántas terminaron en
    // reconexión y cuántas horas se acumularon fuera del ventilador.
    let desvincN = 0, desvincRecon = 0, desvincHoras = 0;
    const desvincPacs = {}, desvincDur = [];
    evosR.forEach(e => {
      if (!esVerdadero(e.DESVINC_OCURRIO)) return;
      desvincN++;
      desvincPacs[String(e.PATIENT_ID)] = true;
      if (esVerdadero(e.DESVINC_RECONEXION)) desvincRecon++;
      const h = parseFloat(String(e.DESVINC_HORAS || '').replace(',', '.'));
      if (!isNaN(h) && h > 0) { desvincHoras += h; desvincDur.push(h); }
    });
    desvincDur.sort((a, b) => a - b);
    const desvincMediana = desvincDur.length
      ? (desvincDur.length % 2 ? desvincDur[(desvincDur.length - 1) / 2]
        : Math.round(((desvincDur[desvincDur.length / 2 - 1] + desvincDur[desvincDur.length / 2]) / 2) * 10) / 10)
      : null;

    // Uso de válvula de fonación (intervención de rehabilitación en TQT)
    let vfonTurnos = 0, vfonMin = 0;
    evosR.forEach(e => {
      if (!esVerdadero(e.VFON_USADA)) return;
      vfonTurnos++;
      vfonMin += Math.max(0, parseInt(e.VFON_MIN) || 0);
    });

    // ── Adherencia a la verificación de cuff (paquete de prevención de NAVM) ──
    // Denominador: turnos con vía aérea artificial (donde el protocolo pide
    // verificar 1 vez por turno). Numerador: turnos con el cuff verificado —
    // en rango o ajustado; ambos son verificación efectiva. «Desinflado» sale
    // del denominador: con válvula de fonación no corresponde medir presión.
    let cuffTurnos = 0, cuffVerif = 0, cuffAjuste = 0;
    evosR.forEach(e => {
      const va = String(e.VENT_VIA_AEREA || '');
      if (va !== 'TOT' && va !== 'TQT') return;
      const est = String(e.VENT_CUFF_EST || '');
      if (est === 'desinflado') return;
      cuffTurnos++;
      if (est === 'rango' || est === 'ajuste') cuffVerif++;
      if (est === 'ajuste') cuffAjuste++;
    });

    // ── Reingresos por RUT (histórico completo, no depende del rango) ──
    const episodiosPorRutMap = {};
    archivo.forEach(a => { const r = _rutNormal(a.RUT); if (r) (episodiosPorRutMap[r] = episodiosPorRutMap[r] || []).push(1); });
    camas.forEach(c => { if (esVerdadero(c.OCUPADA)) { const r = _rutNormal(c.RUT); if (r) (episodiosPorRutMap[r] = episodiosPorRutMap[r] || []).push(1); } });
    const ruts = Object.keys(episodiosPorRutMap);
    const nReingresos = ruts.filter(r => episodiosPorRutMap[r].length > 1).length;

    // ── Egresos y mortalidad (sin ajuste) ──
    const egresosR = archivo.filter(a => enR(a.FECHA_EGRESO));
    const nFallecidos = egresosR.filter(a => /fallec/i.test(String(a.MOTIVO_EGRESO || ''))).length;

    // ── Tendencia mensual (histórico sembrado + meses de la plataforma) ──
    const tendencia = [];
    repoLeerTodos('INDICADORES_HISTORICO').forEach(h => {
      const ext = parseInt(h.EXTUBACIONES) || 0;
      tendencia.push({ mes: String(h.MES || ''), fuente: String(h.FUENTE || 'planilla'),
        fracasoPct: ext ? Math.round(1000 * (parseInt(h.REINTUB_48H) || 0) / ext) / 10 : null });
    });
    Object.keys(porMes).sort().forEach(m => {
      tendencia.push({ mes: m, fuente: 'rce', fracasoPct: porMes[m].ext ? Math.round(1000 * porMes[m].fra / porMes[m].ext) / 10 : null });
    });
    tendencia.sort((a, b) => a.mes.localeCompare(b.mes));

    return ok({
      desde, hasta, diasRango,
      pacienteDias: nPacDias, diasVM: nVmDias,
      extubaciones: extProg.length, fracaso: nFracaso, fracasoPrecoz: nPrecoz, fracasoTardio: nTardio,
      fracasoPct: extProg.length ? Math.round(1000 * nFracaso / extProg.length) / 10 : null,
      autoextubaciones: nAutoext,
      autoextPor100VM: nVmDias ? Math.round(100 * 100 * nAutoext / nVmDias) / 100 : null,
      fueraProtocolo: nFuera,
      fueraPct: extProg.length ? Math.round(1000 * nFuera / extProg.length) / 10 : null,
      motivosFuera: motivosFuera,
      pve: nPVE, pvePor100PacDia: nPacDias ? Math.round(100 * 100 * nPVE / nPacDias) / 100 : null,
      tqt: diasVMpreTQT.length, medianaVMpreTQT: medianaTQT,
      ventilados: nVentilados, vmProlongada: nVMProlongada,
      vmProlongadaPct: nVentilados ? Math.round(1000 * nVMProlongada / nVentilados) / 10 : null,
      atenciones: atenciones,
      desvinculaciones: desvincN, desvincPacientes: Object.keys(desvincPacs).length,
      desvincReconexiones: desvincRecon,
      desvincHorasTotal: Math.round(desvincHoras * 10) / 10, desvincMedianaHoras: desvincMediana,
      vfonTurnos: vfonTurnos, vfonMinutos: vfonMin,
      cuffTurnos: cuffTurnos, cuffVerificados: cuffVerif, cuffAjustes: cuffAjuste,
      cuffAdherenciaPct: cuffTurnos ? Math.round(100 * cuffVerif / cuffTurnos) : null,
      atencionesPorPacDia: nPacDias ? Math.round(100 * atenciones / nPacDias) / 100 : null,
      ocupacionProm: diasRango ? Math.round(10 * nPacDias / diasRango) / 10 : null,
      personasConRut: ruts.length, reingresos: nReingresos,
      egresos: egresosR.length, fallecidos: nFallecidos,
      mortalidadPct: egresosR.length ? Math.round(1000 * nFallecidos / egresosR.length) / 10 : null,
      tendencia: tendencia,
    });
  } catch (e) { return err('calcularIndicadores: ' + e.message, ERR.INTERNO, e); }
}


// ════════════════════════════════════════════════════════════════════
// ── svc_procedimientos.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_procedimientos.gs — Procedimientos por evolución (una fila por procedimiento).
 * Cada procedimiento es una unidad de actividad atribuible (ver PLAN_PROYECTO §11.0).
 */

// Versión interna SIN lock (se llama desde guardarEvolucion, que ya tiene el lock).
function _guardarProcedimientosInterno(idEvolucion, idCama, patientId, fecha, turno, lista, autorEmail) {
  // Reemplazar los del mismo turno (idempotente al re-guardar la evolución).
  // Por la columna clave, no la hoja entera: PROCEDIMIENTOS acumula el año
  // completo y aquí solo interesan las filas de ESTE turno (ago-2026, Ola 4).
  //
  // 🔴 Y SOLO LOS DE ESTE EPISODIO (20-ago-2026). El borrado miraba únicamente
  // `ID_EVOLUCION`, que es `CAMA_<n>_<turnoKey>` y NO lleva paciente dentro. Si
  // una cama rotaba sin archivar (traslado a cama vacía, limpieza manual), el
  // guardado rutinario del ocupante NUEVO borraba los procedimientos ya
  // registrados del ANTERIOR — dato clínico verdadero, perdido en silencio, por
  // una ruta de interfaz normal. Medido en la planilla real el 20-ago: 12 filas
  // de PROCEDIMIENTOS con un paciente distinto al de su evolución.
  //
  // La regla es «distinto Y no vacío», la misma de `_mtoRepararAjenas`: una fila
  // sin pid (legacy, o cama reparada a mano) se sigue reemplazando como antes,
  // porque esconderla sería el error simétrico — dejar de ver un procedimiento
  // verdadero es tan grave como atribuirlo a quien no es.
  //
  // 🪤 `PATIENT_ID` VA DECLARADO EN LA LISTA DE COLUMNAS, y no es cosmético:
  // `repoEliminarPorCols` solo baja el rango de columnas que se le declara, así
  // que un campo no declarado le llega al predicado como `undefined` — vacío, no
  // roto. La primera versión de este arreglo pasaba solo ['ID_EVOLUCION'] y el
  // filtro nunca disparaba: seguía borrando lo del otro paciente, en silencio y
  // con el código «arreglado». Lo cazó `episodio_no_se_mezcla.js`.
  const _pid = String(patientId || '');
  repoEliminarPorCols('PROCEDIMIENTOS', ['ID_EVOLUCION', 'PATIENT_ID'],
    function (p) {
      if (String(p.ID_EVOLUCION) !== String(idEvolucion)) return false;
      const _pidFila = String(p.PATIENT_ID || '');
      if (_pid && _pidFila && _pidFila !== _pid) return false;   // es de otro: NO se toca
      return true;
    });
  if (!Array.isArray(lista)) return { cantidad: 0 };
  // Nacen juntos, viajan juntos: un solo setValues para todos los del turno.
  const filas = [];
  lista.forEach(nom => {
    const nombre = String(nom || '').trim();
    if (!nombre) return;
    filas.push({
      ID_PROC:      uid('PROC'),
      ID_EVOLUCION: idEvolucion,
      ID_CAMA:      String(idCama),
      PATIENT_ID:   patientId || '',
      FECHA:        fecha,
      TURNO:        turno,
      TIPO_PROC:    _clasificarProcedimiento(nombre),
      NOMBRE_PROC:  nombre,
      DESCRIPCION:  '',
      AUTOR_EMAIL:  autorEmail || '',
      TIMESTAMP:    ahoraTS(),
    });
  });
  repoInsertarVarios('PROCEDIMIENTOS', filas);
  return { cantidad: filas.length };
}

function obtenerProcedimientos(idEvolucion) {
  try { return ok(repoLeerTodos('PROCEDIMIENTOS', 'ID_EVOLUCION', idEvolucion)); }
  catch (e) { return err('obtenerProcedimientos: ' + e.message, ERR.INTERNO, e); }
}

function _clasificarProcedimiento(nombre) {
  const n = String(nombre).toLowerCase();
  if (n.indexOf('vía aérea') !== -1 || n.indexOf('tot') !== -1 || n.indexOf('tqt') !== -1 || n.indexOf('decanulación') !== -1) return 'via_aerea';
  if (n.indexOf('ktm') !== -1 || n.indexOf('movilización') !== -1 || n.indexOf('marcha') !== -1 ||
      n.indexOf('cicloergo') !== -1 || n.indexOf('verticalización') !== -1 || n.indexOf('rehabilitación') !== -1) return 'kine';
  if (n.indexOf('instalación') !== -1 || n.indexOf('punción') !== -1 || n.indexOf('drenaje') !== -1 ||
      n.indexOf('broncoscop') !== -1 || n.indexOf('sbt') !== -1 || n.indexOf('bdt') !== -1) return 'procedimiento';
  return 'general';
}


// ════════════════════════════════════════════════════════════════════
// ── svc_rem.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_rem.gs — REM 28 mensual (Rehabilitación · Kinesiología UCI).
 *
 * Agrega EVOLUCIONES + EVOLUCIONES_ARCHIVO (¡los egresados también cuentan!)
 * + ARCHIVO_PACIENTES + REINTUBACIONES del mes y produce:
 *   1. La hoja REM_28 en la planilla, con las secciones del formulario oficial
 *      (A ingresos/egresos, B.2/B.3/B.4, B.6 y códigos de prestaciones) lista
 *      para transcribir/copiar.
 *   2. Un resumen de texto para revisar en pantalla (pestaña Estadísticas).
 *   3. La fila del mes en ESTADISTICAS_REM (upsert por MES, compatibilidad v1).
 *
 * Reglas acordadas con la coordinación (jul-2026):
 *  - Ingresos = pacientes con ES_INGRESO en el mes; todos con PTI (UCI cerrada).
 *  - Egresos por alta incluye traslados; fallecimiento aparte.
 *  - Eval inicial = ingreso (1/paciente). Eval intermedia = 1 por DÍA con al
 *    menos una escala formal post-ingreso (varias escalas el mismo día = 1).
 *  - Sesiones = cantidad KTR + cantidad KTM (KTM_CANT, default 1 si realizada).
 *  - B.6: Fisioterapia=EMS · Ejercicios terapéuticos=sesiones KTM ·
 *    Terapia respiratoria=KTR+IMT · Educación=EDU_REALIZADA.
 *  - Códigos: 601101/601104/601024/601030 = 1 por paciente ingresado;
 *    102501 = turnos con IMT; 1010922 PTO = 1 por paciente en su PRIMERA
 *    bipedestación (primer turno con KTM nivel 4-5 del episodio);
 *    601171 = intubaciones + reintubaciones + inicios de VMNI + cambios de cánula.
 */

const _REM_RANGOS = ['15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49',
  '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80+'];

const _REM_DIAGS = ['ACV', 'TEC', 'LM', 'ENM agudas', 'ENM crónicas', 'Otras neurológicas',
  'Sd. Post-UCI', 'COVID-19', 'Enfermedades respiratorias', 'Enfermedades cardíacas',
  'Otras reumatológicas', 'Traumatológicos', 'Otros pre y post quirúrgicos',
  'Oncológicos', 'Genitourinarias', 'Quemados', 'Otros'];

// Escalas que cuentan como "evaluación" (B.2/B.3). La IMS y la deglución quedan
// fuera a propósito: la IMS se registra a diario con la KTM (inflaría el conteo)
// y la deglución es tamizaje, no evaluación kinesiológica formal.
const _REM_EVAL_CAMPOS = ['EVAL_T_MRC', 'EVAL_T_FSS', 'CPAX_TOTAL', 'EVAL_T_DINAMO',
  'EVAL_T_CUAD_D', 'EVAL_T_CUAD_I', 'EVAL_T_FED_D', 'EVAL_T_FED_I', 'EVAL_T_EXC_D',
  'EVAL_T_EXC_I', 'EVAL_T_PIM', 'EVAL_T_PEM', 'EVAL_T_FEM', 'EVAL_T_GROSOR', 'EVAL_T_HECKMATT'];

function _remRango(edad) {
  const e = parseInt(edad);
  if (!(e >= 15)) return '';
  if (e >= 80) return '80+';
  for (let i = 0; i < 13; i++) { const lo = 15 + i * 5; if (e <= lo + 4) return lo + '-' + (lo + 4); }
  return '80+';
}

function _remSexo(s) {
  const x = String(s || '').trim().toUpperCase().charAt(0);
  return x === 'M' ? 'H' : (x === 'F' ? 'M' : '');   // M(asculino)→H(ombre), F(emenino)→M(ujer)
}

function generarREM(anio, mes, ctx) {
  try {
    anio = String(anio || '').trim(); mes = String(mes || '').trim();
    if (!/^\d{4}$/.test(anio) || !/^\d{1,2}$/.test(mes)) return err('Indica año y mes válidos.', ERR.VALIDACION);
    const mm = mes.length === 1 ? '0' + mes : mes;
    const prefijo = anio + '-' + mm;
    const enMes = f => _statISO(f).indexOf(prefijo) === 0;

    // ── Fuentes: episodio completo (activos + archivados) ──
    const todasEvos = repoLeerTodos('EVOLUCIONES').concat(repoLeerTodos('EVOLUCIONES_ARCHIVO'));
    const evoMes = todasEvos.filter(e => enMes(e.FECHA));
    const archivo = repoLeerTodos('ARCHIVO_PACIENTES');
    const camas = repoLeerTodos('CAMAS_ESTADO');

    // Atributos por paciente (edad/sexo/diagnóstico REM): evolución → cama → archivo.
    const pacAttr = {};
    const attr = pid => (pacAttr[pid] = pacAttr[pid] || { edad: '', sexo: '', diag: '' });
    archivo.forEach(a => { if (a.PATIENT_ID) { const p = attr(String(a.PATIENT_ID)); p.edad = a.EDAD; p.sexo = _remSexo(a.SEXO); p.diag = a.DIAG_REM || p.diag; } });
    camas.forEach(c => { if (c.PATIENT_ID) { const p = attr(String(c.PATIENT_ID)); p.edad = c.EDAD; p.sexo = _remSexo(c.SEXO); p.diag = c.DIAG_REM || p.diag; } });
    todasEvos.forEach(e => {
      const p = attr(String(e.PATIENT_ID || ''));
      if (e.PAC_EDAD) p.edad = e.PAC_EDAD;
      if (e.PAC_SEXO) p.sexo = _remSexo(e.PAC_SEXO);
      if (e.PAC_DIAG_REM) p.diag = e.PAC_DIAG_REM;
    });

    // Fecha de ingreso real del episodio: ficha del archivo → cama.
    const fIngresoPid = {};
    archivo.forEach(a => { if (a.PATIENT_ID && a.FECHA_INGRESO) fIngresoPid[String(a.PATIENT_ID)] = a.FECHA_INGRESO; });
    camas.forEach(c => { if (c.PATIENT_ID && c.FECHA_INGRESO) fIngresoPid[String(c.PATIENT_ID)] = c.FECHA_INGRESO; });

    // ── Sección A: ingresos del mes ──
    // Un ES_INGRESO cuenta como ingreso DEL MES solo si el episodio empezó dentro
    // del mes. Al arrancar el sistema (1-ago-2026) se marcó ES_INGRESO a todo el
    // censo, incluidos 12 pacientes que ya venían de julio y que julio ya había
    // reportado: contarlos otra vez es doble conteo entre meses.
    // Sin fecha de ingreso conocida SÍ cuenta: se excluye solo con evidencia, para
    // que una ficha incompleta no haga desaparecer un ingreso verdadero.
    const ingresosPids = {};
    evoMes.forEach(e => {
      if (!esVerdadero(e.ES_INGRESO) || !e.PATIENT_ID) return;
      const fIng = fIngresoPid[String(e.PATIENT_ID)];
      if (fIng && !enMes(fIng)) return;
      ingresosPids[String(e.PATIENT_ID)] = true;
    });
    const nIngresos = Object.keys(ingresosPids).length;

    // matriz diagnóstico × sexo × rango (+ totales)
    const cero = () => { const o = { T: 0, H: 0, M: 0 }; _REM_RANGOS.forEach(r => { o[r + 'H'] = 0; o[r + 'M'] = 0; }); return o; };
    const ingPorDiag = {}; _REM_DIAGS.forEach(d => ingPorDiag[d] = cero());
    const ingTotal = cero();
    Object.keys(ingresosPids).forEach(pid => {
      const p = pacAttr[pid] || {};
      const dg = _REM_DIAGS.indexOf(p.diag) >= 0 ? p.diag : 'Otros';
      const rg = _remRango(p.edad), sx = p.sexo;
      [ingPorDiag[dg], ingTotal].forEach(o => {
        o.T++;
        if (sx) o[sx]++;
        if (rg && sx) o[rg + sx]++;
      });
    });

    // ── Sección A: egresos del mes ──
    const egresosMes = archivo.filter(a => enMes(a.FECHA_EGRESO));
    const egAlta = cero(), egFallece = cero();
    egresosMes.forEach(a => {
      const fallece = /fallec/i.test(String(a.MOTIVO_EGRESO || ''));
      const o = fallece ? egFallece : egAlta;   // alta incluye traslados (acuerdo jul-2026)
      const rg = _remRango(a.EDAD), sx = _remSexo(a.SEXO);
      o.T++; if (sx) o[sx]++; if (rg && sx) o[rg + sx]++;
    });

    // ── B.2 eval inicial (= ingresos) y B.3 eval intermedia (1 por día evaluado) ──
    const evalIni = cero();
    Object.keys(ingresosPids).forEach(pid => {
      const p = pacAttr[pid] || {}, rg = _remRango(p.edad), sx = p.sexo;
      evalIni.T++; if (sx) evalIni[sx]++; if (rg && sx) evalIni[rg + sx]++;
    });
    // Días de ingreso por paciente, para excluirlos de la intermedia: esa evaluación
    // ya se contó como inicial (B.2). Solo los del episodio que SÍ cuenta como
    // ingreso del mes — al heredado del arranque no se le suma B.2, así que su
    // evaluación de ese día es intermedia y tiene que aparecer en el B.3.
    const diaIngreso = {};
    todasEvos.forEach(e => {
      const pid = String(e.PATIENT_ID);
      if (esVerdadero(e.ES_INGRESO) && ingresosPids[pid]) diaIngreso[pid + '|' + _statISO(e.FECHA)] = true;
    });
    const evalInt = cero(); const diasEvaluados = {};
    evoMes.forEach(e => {
      const pid = String(e.PATIENT_ID || ''), dia = _statISO(e.FECHA), key = pid + '|' + dia;
      if (diaIngreso[key] || diasEvaluados[key]) return;
      const tiene = _REM_EVAL_CAMPOS.some(c => String(e[c] === undefined ? '' : e[c]).trim() !== '');
      if (!tiene) return;
      diasEvaluados[key] = true;
      const p = pacAttr[pid] || {}, rg = _remRango(p.edad), sx = p.sexo;
      evalInt.T++; if (sx) evalInt[sx]++; if (rg && sx) evalInt[rg + sx]++;
    });

    // ── B.4 sesiones (KTR cantidad + KTM cantidad) y B.6 procedimientos ──
    const sesiones = cero();
    let sumKTR = 0, sumKTM = 0, turnosIMT = 0, turnosEMS = 0, turnosEdu = 0;
    let turnosVM = 0, turnosKTM = 0, turnosKTMC = 0;
    const pacIMT = {}, pacSes = {};
    evoMes.forEach(e => {
      const pid = String(e.PATIENT_ID || '');
      const ktr = Math.max(0, parseInt(e.RESP_KTR_CANT) || 0);
      const ktm = esVerdadero(e.KTM_REALIZADA) ? Math.min(9, Math.max(1, parseInt(e.KTM_CANT) || 1)) : 0;
      if (e.VENT_SOPORTE === 'VM') turnosVM++;
      if (esVerdadero(e.KTM_REALIZADA)) turnosKTM++;
      if (esVerdadero(e.KTM_SUSPENDIDA)) turnosKTMC++;
      if (esVerdadero(e.KTM_IMT)) { turnosIMT++; pacIMT[pid] = true; }
      if (esVerdadero(e.KTM_EMS)) turnosEMS++;
      if (esVerdadero(e.EDU_REALIZADA)) turnosEdu++;
      sumKTR += ktr; sumKTM += ktm;
      const n = ktr + ktm;
      if (n > 0) {
        pacSes[pid] = true;
        const p = pacAttr[pid] || {}, rg = _remRango(p.edad), sx = p.sexo;
        sesiones.T += n; if (sx) sesiones[sx] += n; if (rg && sx) sesiones[rg + sx] += n;
      }
    });

    // ── Códigos: PTO (primera bipedestación del episodio dentro del mes) ──
    const primeraBip = {};   // pid → fecha ISO de su primer turno KTM nivel 4-5
    todasEvos.forEach(e => {
      if (!esVerdadero(e.KTM_REALIZADA) || !(parseInt(e.KTM_NIVEL_KTR) >= 4)) return;
      const pid = String(e.PATIENT_ID || ''), f = _statISO(e.FECHA);
      if (!primeraBip[pid] || f < primeraBip[pid]) primeraBip[pid] = f;
    });
    const nPTO = Object.keys(primeraBip).filter(pid => primeraBip[pid].indexOf(prefijo) === 0).length;

    // ── Códigos: 601171 asistencias de vía aérea ──
    const nIntub = evoMes.filter(e => esVerdadero(e.INTUB_OCURRIO)).length;
    const nReintub = repoLeerTodos('REINTUBACIONES').filter(r => enMes(r.FECHA)).length;
    const nCanula = evoMes.filter(e => esVerdadero(e.TQT_CAMBIO)).length;
    // inicios de VMNI: turno VMNI cuyo turno previo del episodio no era VMNI
    let nVMNIini = 0;
    const porPac = {};
    todasEvos.forEach(e => { const pid = String(e.PATIENT_ID || ''); (porPac[pid] = porPac[pid] || []).push(e); });
    Object.keys(porPac).forEach(pid => {
      const evs = porPac[pid].slice().sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));
      let prev = '';
      evs.forEach(e => {
        const sop = String(e.VENT_SOPORTE || '');
        if (sop === 'VMNI' && prev !== 'VMNI' && enMes(e.FECHA)) nVMNIini++;
        prev = sop;
      });
    });
    const nAsistVA = nIntub + nReintub + nVMNIini + nCanula;

    // ── Escribir la hoja REM_28 ──
    const nombreMes = new Date(parseInt(anio), parseInt(mm) - 1, 1)
      .toLocaleString('es-CL', { month: 'long', year: 'numeric' });
    // ── Copia EXACTA del formulario oficial (svc_rem_plantilla.gs) ──
    // La plantilla reproduce el REM 28 de estadística celda a celda (filas 24-190,
    // columnas A-AK): textos, colores, negritas, combinadas y anchos, incluidas las
    // casillas que quedan en 0. Aquí solo se escriben los valores del mes en las
    // posiciones de _REM_POS.
    const M = _REM_TPL_VALS.map(f => f.slice());
    const F0 = _REM_TPL_FILA0;
    const setC = (fila, col, val) => { M[fila - F0][col - 1] = val; };

    // Sección A: D=Ambos, E=H, F=M, G..AH=rangos 15-19…80+ (H/M), AJ=Cerrado (UCI).
    const filaA = (fila, o) => {
      setC(fila, 4, o.T); setC(fila, 5, o.H); setC(fila, 6, o.M);
      _REM_RANGOS.forEach((r, i) => { setC(fila, 7 + i * 2, o[r + 'H']); setC(fila, 8 + i * 2, o[r + 'M']); });
      setC(fila, 36, o.T);
    };
    filaA(_REM_POS.totalIng, ingTotal);
    filaA(_REM_POS.pti, ingTotal);   // atención cerrada: todos los ingresos con PTI
    Object.keys(_REM_POS.diag).forEach(d => filaA(_REM_POS.diag[d], ingPorDiag[d]));
    filaA(_REM_POS.egAlta, egAlta);
    filaA(_REM_POS.egFallece, egFallece);

    // Secciones B.2/B.3/B.4: D=total, rangos 0-4…80+ en E..U (15-19 parte en col H=8),
    // tipo de atención UPC en col Y=25. La fila TOTAL repite a Kinesiología (somos
    // el único profesional que registra en esta plataforma).
    const filaB = (fila, o) => {
      setC(fila, 4, o.T);
      _REM_RANGOS.forEach((r, i) => setC(fila, 8 + i, o[r + 'H'] + o[r + 'M']));
      setC(fila, 25, o.T);
    };
    filaB(_REM_POS.b2Kine, evalIni); filaB(_REM_POS.b2Total, evalIni);
    filaB(_REM_POS.b3Kine, evalInt); filaB(_REM_POS.b3Total, evalInt);
    filaB(_REM_POS.b4Kine, sesiones); filaB(_REM_POS.b4Total, sesiones);

    // B.6 (columna D).
    setC(_REM_POS.b6Fisio, 4, turnosEMS);
    setC(_REM_POS.b6Ejerc, 4, sumKTM);
    setC(_REM_POS.b6Educ, 4, turnosEdu);
    setC(_REM_POS.b6Resp, 4, sumKTR + turnosIMT);
    setC(_REM_POS.b6Total, 4, turnosEMS + sumKTM + turnosEdu + sumKTR + turnosIMT);

    // Códigos: patrón del original → E=actividades, F=G=beneficiarios (MAI),
    // J=atención cerrada=actividades; H/I/K/L quedan en 0 como en el formulario.
    const filaCod = (cod, actividades, beneficiarios) => {
      const fila = _REM_POS.cod[cod];
      setC(fila, 5, actividades); setC(fila, 6, beneficiarios);
      setC(fila, 7, beneficiarios); setC(fila, 10, actividades);
    };
    filaCod('601101', nIngresos, nIngresos);
    filaCod('601104', nIngresos, nIngresos);
    filaCod('601024', nIngresos, nIngresos);
    filaCod('601030', nIngresos, nIngresos);
    filaCod('102501', turnosIMT, Object.keys(pacIMT).length);
    filaCod('1010922', nPTO, nPTO);
    filaCod('601171', nAsistVA, nAsistVA);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let hoja = ss.getSheetByName('REM_28');
    if (!hoja) hoja = ss.insertSheet('REM_28');
    hoja.clear();
    hoja.getRange(1, 1, hoja.getMaxRows(), hoja.getMaxColumns()).breakApart();
    if (hoja.getMaxColumns() < _REM_TPL_NCOLS) hoja.insertColumnsAfter(hoja.getMaxColumns(), _REM_TPL_NCOLS - hoja.getMaxColumns());
    const D = _REM_TPL_DESTINO;   // el informe comienza en la fila 4
    const filaFin = D + M.length - 1;
    if (hoja.getMaxRows() < filaFin) hoja.insertRowsAfter(hoja.getMaxRows(), filaFin - hoja.getMaxRows());

    // Contenido + formato celda a celda (matrices alineadas con la plantilla).
    const zona = hoja.getRange(D, 1, M.length, _REM_TPL_NCOLS);
    zona.setValues(M);
    zona.setBackgrounds(_REM_TPL_FONDOS.map(s => s.split('').map(ch => _REM_TPL_PALETA[parseInt(ch, 16)] || null)));
    zona.setFontWeights(_REM_TPL_NEGRITAS.map(s => s.split('').map(b => b === '1' ? 'bold' : 'normal')));
    zona.setFontColors(_REM_TPL_LETRAS.map(s => s.split('').map(b => b === '1' ? _REM_TPL_LETRA_AZUL : null)));
    const fam = _REM_TPL_FUENTES_PAL.map(x => x.split('|')[0]);
    const tam = _REM_TPL_FUENTES_PAL.map(x => parseInt(x.split('|')[1]));
    zona.setFontFamilies(_REM_TPL_FUENTES.map(s => s.split('').map(ch => fam[parseInt(ch, 16)])));
    zona.setFontSizes(_REM_TPL_FUENTES.map(s => s.split('').map(ch => tam[parseInt(ch, 16)])));
    zona.setHorizontalAlignments(_REM_TPL_ALINEA.map(s => s.split('').map(ch => ch === 'r' ? 'right' : (ch === 'c' ? 'center' : null))));
    zona.setWraps(_REM_TPL_WRAPS.map(s => s.split('').map(b => b === '1')));

    // Celdas combinadas y bordes (rectángulos relativos extraídos del original).
    _REM_TPL_MERGES.forEach(m => { try { hoja.getRange(D + m[0], m[1] + 1, m[2] - m[0] + 1, m[3] - m[1] + 1).merge(); } catch (ig) {} });
    const rango = m => hoja.getRange(D + m[0], m[1] + 1, m[2] - m[0] + 1, m[3] - m[1] + 1);
    const SM = SpreadsheetApp.BorderStyle.SOLID_MEDIUM, DBL = SpreadsheetApp.BorderStyle.DOUBLE;
    _REM_TPL_BORDES.gris.forEach(m => rango(m).setBorder(true, true, true, true, true, true, '#cccccc', SM));
    const ladoNegro = { top: [true, null, null, null], left: [null, true, null, null], bottom: [null, null, true, null], right: [null, null, null, true] };
    Object.keys(_REM_TPL_BORDES.negro).forEach(lado => {
      const p = ladoNegro[lado];
      _REM_TPL_BORDES.negro[lado].forEach(m => rango(m).setBorder(p[0], p[1], p[2], p[3], null, null, '#000000', SM));
    });
    Object.keys(_REM_TPL_BORDES.doble).forEach(lado => {
      const p = ladoNegro[lado];
      _REM_TPL_BORDES.doble[lado].forEach(m => rango(m).setBorder(p[0], p[1], p[2], p[3], null, null, '#000000', DBL));
    });

    // Anchos de columna y alturas de fila del original (alturas agrupadas por tramos).
    _REM_TPL_ANCHOS.forEach((w, i) => hoja.setColumnWidth(i + 1, w));
    for (let i = 0; i < _REM_TPL_ALTURAS.length;) {
      let j = i;
      while (j + 1 < _REM_TPL_ALTURAS.length && _REM_TPL_ALTURAS[j + 1] === _REM_TPL_ALTURAS[i]) j++;
      hoja.setRowHeights(D + i, j - i + 1, _REM_TPL_ALTURAS[i]);
      i = j + 1;
    }
    hoja.setFrozenRows(0);

    // Cabecera informativa en la zona libre (filas 1-2; el informe parte en la 4).
    hoja.getRange(1, 1).setValue('REM 28 · KINESIOLOGÍA UCI · ' + nombreMes.toUpperCase()).setFontWeight('bold');
    hoja.getRange(2, 1).setValue('Generado ' + ahoraTS() + ' · copia del formulario oficial; las casillas sin actividad quedan en 0.');

    // ── Resumen de pantalla ──
    const L = [];
    L.push('REM 28 · ' + nombreMes.toUpperCase());
    L.push('════════════════════════════════════════');
    L.push('Ingresos (todos con PTI):        ' + nIngresos + '  (H ' + ingTotal.H + ' · M ' + ingTotal.M + ')');
    L.push('Egresos por alta:                ' + egAlta.T + '   · fallecimiento: ' + egFallece.T);
    L.push('B.2 Eval. inicial (kine):        ' + evalIni.T);
    L.push('B.3 Eval. intermedia (días):     ' + evalInt.T);
    L.push('B.4 Sesiones (KTR+KTM):          ' + sesiones.T + '  (KTR ' + sumKTR + ' + KTM ' + sumKTM + ')');
    L.push('B.6 Fisioterapia (EMS):          ' + turnosEMS);
    L.push('B.6 Ejercicios terapéuticos:     ' + sumKTM);
    L.push('B.6 Educación usuario/cuidador:  ' + turnosEdu);
    L.push('B.6 Terapia respiratoria:        ' + (sumKTR + turnosIMT) + '  (KTR ' + sumKTR + ' + IMT ' + turnosIMT + ')');
    L.push('102501 Reeducación tos (IMT):    ' + turnosIMT);
    L.push('1010922 PTO (1ª bipedestación):  ' + nPTO);
    L.push('601171 Asistencias vía aérea:    ' + nAsistVA + '  (' + nIntub + ' IOT · ' + nReintub + ' reintub · ' + nVMNIini + ' VMNI · ' + nCanula + ' cánula)');
    L.push('');
    L.push('✅ Hoja «REM_28» actualizada en la planilla con el detalle por sexo, edad y diagnóstico.');
    const textoREM = L.join('\n');

    // ── Compatibilidad: fila mensual en ESTADISTICAS_REM ──
    const diagRemCount = {}; _REM_DIAGS.forEach(d => { if (ingPorDiag[d].T) diagRemCount[d] = ingPorDiag[d].T; });
    repoUpsert('ESTADISTICAS_REM', 'MES', prefijo, {
      MES: prefijo, INGRESOS: nIngresos, DIAS_CAMA: evoMes.length,
      TURNOS_VM: turnosVM, TURNOS_KTM: turnosKTM, TURNOS_KTMC: turnosKTMC,
      SUM_KTR: sumKTR, KTR_PROM: evoMes.length ? Math.round((sumKTR / evoMes.length) * 100) / 100 : 0,
      DIAG_JSON: JSON.stringify(diagRemCount), TEXTO_REM: textoREM,
      GENERADO_TS: ahoraTS(), GENERADO_POR: (ctx && ctx.email) || '',
    });

    return ok({
      mesKey: prefijo, textoREM: textoREM, hoja: 'REM_28',
      ingresos: nIngresos, egresosAlta: egAlta.T, egresosFallecimiento: egFallece.T,
      evalInicial: evalIni.T, evalIntermedia: evalInt.T, sesiones: sesiones.T,
      sumKTR: sumKTR, sumKTM: sumKTM, turnosIMT: turnosIMT, turnosEMS: turnosEMS,
      turnosEdu: turnosEdu, pto: nPTO, asistenciasVA: nAsistVA,
    });
  } catch (e) { return err('generarREM: ' + e.message, ERR.INTERNO, e); }
}


// ════════════════════════════════════════════════════════════════════
// ── svc_rem_plantilla.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_rem_plantilla.gs — Plantilla EXACTA del formulario REM 28 oficial.
 * Extraída automáticamente del REM.xlsx de estadística: textos, fondos, negritas,
 * COLOR DE LETRA, TIPOGRAFÍA (familia/tamaño), alineación, ajuste de texto,
 * BORDES por lado y estilo, celdas combinadas, anchos de columna y alturas de
 * fila. El original vive en las filas 24-190 (A-AK); generarREM lo escribe
 * desplazado para que el informe COMIENCE EN LA FILA 4 (_REM_TPL_DESTINO).
 * Las zonas de datos van en 0; _REM_POS mapea dónde escribir el mes.
 * NO editar a mano: se regenera desde el Excel oficial si estadística lo cambia.
 */
const _REM_TPL_FILA0 = 24;
const _REM_TPL_DESTINO = 4;
const _REM_TPL_NCOLS = 37;
const _REM_TPL_VALS = [["","","INGRESOS","TOTAL","","","RANGO ETARIO","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","","","","","15 - 19 años","","20 - 24 años","","25-29 años","","30-34 años","","35 - 39 años","","40 - 44 años","","45- 49 años","","50 - 54 años","","55 - 59 años","","60 - 64 años","","65 - 69 años","","70 - 74 años","","75 - 79 años","","80 y mas años","","Abierta","Cerrado",""],["","","","Ambos Sexos","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","Hombres","Mujeres","","UPC","Cuidados Medios y Básicos"],["","","Total ingresos (Nº de personas)",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Ingresos con plan de tratamiento integral (PTI)",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Ataque cerebro vascular (ACV)",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Traumatismo encéfalo craneano (TEC)",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Lesión medular",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Neuromusculares agudas",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Neuromusculares crónicas",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Disrafias espinales",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Otras neurológicas",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Trastornos del Neurodesarrollo",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Parálisis cerebral",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Recién nacido de alto riesgo",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Síndrome POST-UCI",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","COVID-19",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Enfermedades respiratorias",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Enfermedades cardíacas",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Dolor musculoesquelético crónico",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Artritis reumatoidea",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Otras reumatológicas",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Traumatológicos",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Otros pre y post quirúrgicos",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Oncológicos",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Genitourinarias",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Amputación",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Quemados",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Sensoriales auditivos",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Sensoriales visuales",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Trastorno espectro autista",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Otros",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","EGRESOS",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Egresos por alta",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Egresos por abandono",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Egresos por fallecimiento",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Egresos ACV referido a APS",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","Otros",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","SECCIÓN B.2: EVALUACIÓN INICIAL","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","PROFESIONAL","TOTAL","RANGO ETARIO","","","","","","","","","","","","","","","","","TIPO ATENCIÓN","","","","","","","","","","","","","","",""],["","","","","","","","","","","","","","","","","","","","","","Abierta","","","Cerrada","","","","","","","","","","","",""],["","","","","0 - 4 años","5 - 9 años","10 - 14 años","15 - 19 años","20 - 24 años","25-29 años","30-34 años","35 - 39 años","40 - 44 años","45- 49 años","50 - 54 años","55 - 59 años","60 - 64 años","65 - 69 años","70 - 74 años","75 - 79 años","80 y mas años","Presencial","A Distancia","Domiciliaria","UPC","Cuidados Medios y Básicos","","","","","","","","","","",""],["","","Kinesiólogo/a",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Terapeuta ocupacional",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Fonoadiólogo/a",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Psicólogo/a",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Trabajador/a Social",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Ortoprotesista",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Enfermera/o",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","TOTAL",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","SECCIÓN B.3: EVALUACIÓN INTERMEDIA","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","PROFESIONAL","TOTAL","RANGO ETARIO","","","","","","","","","","","","","","","","","TIPO ATENCIÓN","","","","","","","","","","","","","","",""],["","","","","","","","","","","","","","","","","","","","","","Abierta","","","Cerrada","","","","","","","","","","","",""],["","","","","0 - 4 años","5 - 9 años","10 - 14 años","15 - 19 años","20 - 24 años","25-29 años","30-34 años","35 - 39 años","40 - 44 años","45- 49 años","50 - 54 años","55 - 59 años","60 - 64 años","65 - 69 años","70 - 74 años","75 - 79 años","80 y mas años","Presencial","A Distancia","Domiciliaria","UPC","Cuidados Medios y Básicos","","","","","","","","","","",""],["","","Kinesiólogo/a",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Terapeuta ocupacional",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Fonoadiólogo/a",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Psicólogo/a",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Ortoprotesista",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Trabajador/a Social",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","TOTAL",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","SECCIÓN B.4: SESIONES DE REHABILITACIÓN","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","PROFESIONAL","TOTAL","RANGO ETARIO","","","","","","","","","","","","","","","","","TIPO ATENCIÓN","","","","","","","","","","","","","","",""],["","","","","","","","","","","","","","","","","","","","","","Abierta","","","Cerrada","","","","","","","","","","","",""],["","","","","0 - 4 años","5 - 9 años","10 - 14 años","15 - 19 años","20 - 24 años","25-29 años","30-34 años","35 - 39 años","40 - 44 años","45- 49 años","50 - 54 años","55 - 59 años","60 - 64 años","65 - 69 años","70 - 74 años","75 - 79 años","80 y mas años","Presencial","A Distancia","Domiciliaria","UPC","Cuidados Medios y Básicos","","","","","","","","","","",""],["","","Kinesiólogo/a",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Terapeuta ocupacional",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Fonoadiólogo/a",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","Psicólogo/a",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","TOTAL",0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,"","","","","","","","","","",""],["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","SECCIÓN B.6: PROCEDIMIENTOS Y ACTIVIDADES","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","TIPO","TOTAL","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Fisioterapia",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Actividad física",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Ejercicios terapéuticos",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Intervención en actividades de la vida diaria, básicas, instrumentales y avanzadas.",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Habilitación y rehabilitación educacional",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Actividades terapéuticas",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Integración sensorial",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Tratamiento compresivo",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Habilitación y rehabilitación socio-laboral",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Adaptación del hogar",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Confección de órtesis y/o adaptaciones",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Reparación de órtesis y/o adaptaciones",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Confección de prótesis",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Reparación de prótesis",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Estimulación cognitiva",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Rehabilitación de la voz, habla y/o lenguaje",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Rehabilitación de la deglución",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Rehabilitación vestibular",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Educación a usuario/a, cuidador/a y/o familiar",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Atención psicoterapéutica",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Orientación y movilidad",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Estimulación sensorial",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Terapia respiratoria y funcional pulmonar",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Rehabilitación auditiva individual",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","Rehabilitación auditiva grupal",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","TOTAL",0,"","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","","","TOTAL","ACTIVIDADES","","","","PROCEDENCIA","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","","","","TOTAL BENEFI-CIARIOS","BENEFICIARIOS","","NO BENEFI-CIARIOS","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","","","","","MAI","MLE","","ATENCION CERRADA","ATENCION ABIERTA","EMERGENCIA","","","","","","","","","","","","","","","","","","","","","","","","",""],["","","","KINESIOLOGIA Y FISIOTERAPIA","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601101,"Evaluación Kinesiológica Integral",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601103,"Atención Kinesiológica Integral en Pacientes hospitalizados",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601104,"Atención Kinesiológica Integral UPC (Intensivo e Intermedio)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601105,"Atención Kinesiológica Integral Ambulatoria",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601106,"Atención Kinesiológica Integral Domiciliaria",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",602001,"Atención integral de terapia ocupacional",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",602002,"Intervención de terapia ocupacional en ayudas técnicas y tecnología asistida",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",602003,"Intervención terapia ocupacional en actividades de la vida diaria, básicas, instrumentales y avanzadas",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",608101,"Telerehabilitación: Evaluación Kinesiológica Integral",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",608102,"Telerehabilitación: Atención Kinesiológica Integral",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",608201,"Telerehabilitación: Atención integral de terapia ocupacional",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",608202,"Telerehabilitación: Intervención de terapia ocupacional en ayudas técnicas y tecnología asistida",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",608203,"Telerehabilitación: Intervención terapia ocupacional en actividades de la vida diaria, básicas, instrumentales y avanzadas",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601001,"Evaluación kinesiológica: muscular, articular, postural, neurológica y funcional (máximo 2 por tratamiento)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601003,"Evaluación Biomecánica instrumental",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601005,"Radiación infrarroja, horno, baño parafina, compresas húmedas, c/u (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601006,"Tanque de Hubbard con ejercicios (hiper o hipo-termal sobre 1.000 lts de capacidad) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601007,"Turbión, tanque con remolino (hiper o hipotermal,baño de contraste) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601010,"Terapia por radiación ultravioleta. (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601008,"Laserterapia (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601009,"Onda corta (ultratermia), microondas, c/u (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601011,"Terapia por ondas mecánicas (proc. aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601012,"Analgesia transcutánea (TENS) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601013,"Estimulación eléctrica (interferencial, diadinámicas, exponenciales, galvánica, faradica, ultraexcitante) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601014,"Iontoforesis (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601015,"Retroalimentación neuromuscular (miofeedback) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601016,"Compresión neumática (masaje compresivo) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601027,"Tracción cervical y/o lumbar (mecánica o manual) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601017,"Ejercicios respiratorios y procedimientos de kinesiterápia torácica (ventilación pulmonar localizada, estimulación de la tos, bloqueos torácicos, vibraciones, percusiones y tapoteos) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601028,"Entrenamiento cardiorespiratorio funcional",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601018,"Prueba de esfuerzo o Entrenamiento ergométrico (porc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601019,"Entrenamiento funcional con ayudas técnicas (órtesis, ayudas de desplazamiento, etc.) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601020,"Entrenamiento protésico extremidades (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601021,"Manipulación osteopática (liberación articular, manipulación vertebral) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601022,"Masoterapia, por sesión (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601023,"Orientación y entrenamiento de personas con baja visión o con ceguera (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601024,"Reeducación motriz (ejercicios terapéuticos para recuperación muscular, capacidad de trabajo, coordinación, gimnasia ortopédica, reeducación funcional, de marcha) (individual y por sesión, mínimo 30 minutos) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601025,"Técnicas de facilitación, técnicas de inhibición (Kabat y/o Bobath) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601026,"Técnicas de relajación (entrenamiento autógeno Schultz - Jacobson o similar) (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601030,"Maniobras permeabilización de la vía aérea (proc.aut.)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601031,"Atención kinesiológica integral, al enfermo hosp. en UTI o Intermedio (máx. 1 diaria)",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601171,"Asistencia en IOT, VMNI, cambio de cánula de traqueostomía",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",601181,"Entrenamiento ortostático en mesa basculante",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",102503,"Evaluación de la deglución",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",102504,"Rehabilitación de la deglución",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",102501,"Reeducación de la tos y respiración en pacientes con traqueostomía",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",102505,"Evaluación de funciones cognitivas",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",102506,"Rehabilitación de funciones cognitivas",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",1010922,"Prueba de tolerancia ortostática",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",1010923,"Rehabilitación vestibular",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",1010924,"Asistencia bloqueo espasticidad",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",1010925,"Punción seca",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",1010926,"Neurodinamia",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",1010927,"Entrenamiento ortésico de gran incapacitado",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",1010928,"Evaluación y rehabilitación en actividades de la vida diaria",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",1010930,"Habilitación y rehabilitación laboral",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",1010931,"Habilitación y rehabilitación educacional",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",1010932,"Integración sensorial",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",1010936,"Estimulación cognitiva grupal",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","",1010938,"Atención integral en demencia",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","","","",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""],["","","","",0,0,0,0,0,0,0,0,"","","","","","","","","","","","","","","","","","","","","","","","",""]];
const _REM_TPL_PALETA = ["","#ffffcc","#ccffff","#ededed","#d6dce4","#d9d9d9","#aeaaaa","#ddebf7"];
const _REM_TPL_FONDOS = ["0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000000000000000000000000000000000000","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000001111111111111111111111111111111","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000111111111111111111111100000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0001000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000220003000000000000000000000000000","0000044020000000000000000000000000000","0000004403330000000000000000000000000","0000000000000000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0055667771110000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000"];
const _REM_TPL_NEGRITAS = ["0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0010000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0010000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0010000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0010000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000110001000000000000000000000000000","0000011010000000000000000000000000000","0000001101110000000000000000000000000","0001000000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000"];
const _REM_TPL_LETRAS = ["0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000110000000000000000000000000000000","0000000000000000000000000000000000000","0000000000000000000000000000000000000"];
const _REM_TPL_LETRA_AZUL = '#0070c0';
const _REM_TPL_FUENTES_PAL = ["Calibri|11","Verdana|8","Arial|10","Verdana|9"];
const _REM_TPL_FUENTES = ["0011002000000000000000000000000000000","0000001010101010101010101010101010110","0001111111111111111111111111111111011","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0012222222222222222222222222222222222","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0011111111111111111111111111111111212","0022222222222222222222222222222222222","0032222222222222222222222222222222222","0011100000000000000001000022222222222","0000000000000000000001001022222222222","0000111111111111111111111122222222222","0011111111111111111112221222222222222","0011222222222222222222222222222222222","0011222222222222222222222222222222222","0011222222222222222222222222222222222","0011222222222222222222222222222222222","0011222222222222222222222222222222222","0011222222222222222222222222222222222","0011111111111111111111111122222222222","0032222222222222222222222222222222222","0011100000000000000001000022222222222","0000000000000000000001001022222222222","0000111111111111111111111122222222222","0011111111111111111112221222222222222","0011222222222222222222222222222222222","0011222222222222222222222222222222222","0011222222222222222222222222222222222","0011222222222222222222222222222222222","0011222222222222222222222222222222222","0011111111111111111111111122222222222","0032222222222222222222222222222222222","0011100000000000000001000022222222222","0000000000000000000001001022222222222","0000111111111111111111111122222222222","0011111111111111111112221222222222222","0011222222222222222222222222222222222","0011222222222222222222222222222222222","0011222222222222222222222222222222222","0011111111111111111111111122222222222","0022222222222222222222222222222222222","0032222222222222222222222222222222222","0011222222222222222222222222222222222","0011222222222222222222222222222222222","0012222222222222222222222222222222222","0011222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0011222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0011222222222222222222222222222222222","0012222222222222222222222222222222222","0012222222222222222222222222222222222","0011222222222222222222222222222222222","0022222222222222222222222222222222222","0022110001002222222222222222222222222","0022011010002222222222222222222222222","0022001101112222222222222222222222222","0021222222222222222222222222222222222","0011111111112222222222222222222222222","0011111111112222222222222222222222222","0011111111112222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011111111112222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011111111112222222222222222222222222","0011112222222222222222222222222222222","0011111111112222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011111111112222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0011112222222222222222222222222222222","0022000000002222222222222222222222222","0022222222222222222222222222222222222"];
const _REM_TPL_ALINEA = ["ggccggcgggggggggggggggggggggggggggggg","ggggggcgcgcgcgcgcgcgcgcgcgcgcgcgcgccg","gggcccccccccccccccccccccccccccccccgcc","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","ggcgggggggggggggggggggggggggggggggggg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","gggrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrgrg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggcccggggggggggggggggcggggggggggggggg","gggggggggggggggggggggcggcgggggggggggg","ggggccccccccccccccccccccccggggggggggg","gggrrrrrrrrrrrrrrrrrrgggrgggggggggggg","gggrggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","ggcrrrrrrrrrrrrrrrrrrrrrrrggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggcccggggggggggggggggcggggggggggggggg","gggggggggggggggggggggcggcgggggggggggg","ggggccccccccccccccccccccccggggggggggg","gggrrrrrrrrrrrrrrrrrrgggrgggggggggggg","gggrggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","ggcrrrrrrrrrrrrrrrrrrrrrrrggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggcccggggggggggggggggcggggggggggggggg","gggggggggggggggggggggcggcgggggggggggg","ggggccccccccccccccccccccccggggggggggg","gggrrrrrrrrrrrrrrrrrrgggrgggggggggggg","gggrggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","ggcrrrrrrrrrrrrrrrrrrrrrrrggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggccggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","gggrggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggcrggggggggggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggggccgggcggggggggggggggggggggggggggg","gggggccgcgggggggggggggggggggggggggggg","ggggggccgcccggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg","ggcgrrrrrrrrggggggggggggggggggggggggg","ggcgrrrrrrrrggggggggggggggggggggggggg","ggcgrrrrrrrrggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrrrrrrrggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrrrrrrrggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrrrrrrrggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrrrrrrrggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggcgrrggggggggggggggggggggggggggggggg","ggggrrrrrrrrggggggggggggggggggggggggg","ggggggggggggggggggggggggggggggggggggg"];
const _REM_TPL_WRAPS = ["0011001000000000000000000000000000000","0000001010101010101010101010101010110","0001111111111111111111111111111111010","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0001111111111111111111111111111111111","0011100000000000000001000011111111111","0000000000000000000001001011111111111","0000111111111111111111111011111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0001111111111111111111111111111111111","0011100000000000000001000011111111111","0000000000000000000001001011111111111","0000111111111111111111111011111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0001111111111111111111111111111111111","0011100000000000000001000011111111111","0000000000000000000001001011111111111","0000111111111111111111111011111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0001111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0001111111111111111111111111111111111","0001111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0001111111111111111111111111111111111","0011111111111111111111111111111111111","0001111111111111111111111111111111111","0001111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0001111111111111111111111111111111111","0001111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0001111111111111111111111111111111111","0001111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011110001001111111111111111111111111","0011011010001111111111111111111111111","0011001101111111111111111111111111111","0010111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111","0011111111111111111111111111111111111"];
const _REM_TPL_BORDES = {"gris":[[0,6,0,36],[1,34,1,36],[2,3,2,36],[3,2,39,36],[40,26,41,36],[42,4,42,36],[43,2,51,36],[52,26,53,36],[54,4,54,36],[55,2,62,36],[63,26,64,36],[65,4,65,36],[66,2,166,36]],"negro":{"top":[[0,2,0,5],[1,6,1,36],[40,2,40,25],[41,21,41,25],[52,2,52,25],[53,21,53,25],[63,2,63,25],[64,21,64,25]],"bottom":[[0,2,0,3],[0,6,0,36],[1,3,1,34],[2,2,2,36],[31,2,32,36],[37,2,37,36],[39,2,39,25],[40,2,40,4],[40,21,40,25],[41,4,41,25],[42,2,42,25],[49,2,51,25],[52,2,52,4],[52,21,52,25],[53,4,53,25],[54,2,54,25],[60,3,60,25],[61,2,62,25],[63,2,63,4],[63,21,63,25],[64,4,64,25],[65,2,65,25],[69,2,70,25],[72,2,73,3],[98,2,99,3]],"left":[[0,2,1,3],[0,6,1,6],[1,8,1,8],[1,10,1,10],[1,12,1,12],[1,14,1,14],[1,16,1,16],[1,18,1,18],[1,20,1,20],[1,22,1,22],[1,24,1,24],[1,26,1,26],[1,28,1,28],[1,30,1,30],[1,32,1,32],[2,2,37,2],[40,2,41,4],[41,24,41,24],[42,2,42,3],[43,2,50,2],[52,2,53,4],[53,24,53,24],[54,2,54,3],[55,2,61,2],[63,2,64,4],[64,24,64,24],[65,2,65,3],[66,2,70,2],[73,2,99,2]],"right":[[0,2,0,3],[0,5,0,5],[1,2,1,2],[1,5,1,31],[1,35,1,36],[2,2,2,5],[2,7,2,7],[2,9,2,9],[2,11,2,11],[2,13,2,13],[2,15,2,15],[2,17,2,17],[2,19,2,19],[2,21,2,21],[2,23,2,23],[2,25,2,25],[2,27,2,27],[2,29,2,29],[2,31,2,31],[3,2,31,32],[32,2,32,31],[32,33,32,33],[33,2,37,32],[3,36,37,36],[40,25,40,25],[40,2,41,3],[40,21,41,21],[41,23,41,25],[42,2,50,19],[42,23,50,23],[43,25,50,25],[52,25,52,25],[52,2,53,3],[52,21,53,21],[53,23,53,25],[54,21,54,24],[54,2,61,19],[55,21,61,25],[63,25,63,25],[63,2,64,3],[63,21,64,21],[64,23,64,25],[65,21,65,24],[65,2,70,19],[66,21,70,25],[73,2,76,3],[78,3,78,3],[79,2,81,3],[82,3,82,3],[83,2,83,3],[84,3,85,3],[86,2,88,3],[89,3,90,3],[91,2,96,3],[97,3,98,3],[99,2,99,3],[105,5,164,5],[105,8,164,8],[105,11,164,11]]},"doble":{"left":[[1,34,2,34],[40,21,41,21],[52,21,53,21],[63,21,64,21]],"right":[[1,32,1,33],[2,33,31,33],[33,33,37,33],[40,4,40,4],[40,20,50,20],[52,4,52,4],[52,20,61,20],[63,4,63,4],[63,20,70,20]]}};
const _REM_TPL_MERGES = [[1,10,1,11],[63,4,64,20],[1,16,1,17],[1,18,1,19],[0,6,0,36],[102,8,103,8],[63,3,65,3],[1,30,1,31],[1,32,1,33],[1,22,1,23],[52,21,52,25],[52,2,54,2],[40,3,42,3],[102,6,102,7],[52,4,53,20],[40,21,40,25],[102,5,103,5],[63,21,63,25],[63,2,65,2],[1,8,1,9],[101,4,103,4],[1,20,1,21],[0,2,2,2],[64,24,64,25],[1,12,1,13],[1,14,1,15],[1,24,1,25],[40,2,42,2],[1,34,2,34],[41,21,41,23],[1,26,1,27],[1,28,1,29],[41,24,41,25],[53,24,53,25],[101,9,102,11],[40,4,41,20],[1,6,1,7],[1,35,1,36],[0,3,1,5],[52,3,54,3],[64,21,64,23],[101,5,101,8],[53,21,53,23]];
const _REM_TPL_ANCHOS = [64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64,64];
const _REM_TPL_ALTURAS = [21,21,31,59,73,59,59,31,31,45,31,31,59,31,45,31,21,45,31,59,31,45,31,45,21,31,21,21,31,31,45,21,21,31,31,31,59,21,21,21,21,21,31,31,31,31,21,31,31,21,21,21,21,21,31,31,31,31,21,31,31,21,21,21,21,31,31,31,31,21,21,21,21,21,21,31,31,21,21,31,31,31,21,31,21,21,31,31,31,21,21,31,59,45,31,31,59,21,21,21,21,21,21,31,21,45,87,87,59,59,59,101,157,73,73,87,129,185,143,45,115,115,115,59,31,87,59,59,185,31,101,73,87,255,73,87,129,59,101,45,129,283,101,129,73,129,101,73,45,45,101,45,59,45,31,45,31,31,59,87,59,73,31,45,45,21,21];
const _REM_POS = {"totalIng":27,"pti":28,"egAlta":57,"egFallece":59,"b2Kine":67,"b2Total":74,"b3Kine":79,"b3Total":85,"b4Kine":90,"b4Total":94,"b6Fisio":98,"b6Ejerc":100,"b6Educ":116,"b6Resp":120,"b6Total":123,"diag":{"ACV":29,"TEC":30,"LM":31,"ENM agudas":32,"ENM crónicas":33,"Otras neurológicas":35,"Sd. Post-UCI":39,"COVID-19":40,"Enfermedades respiratorias":41,"Enfermedades cardíacas":42,"Otras reumatológicas":45,"Traumatológicos":46,"Otros pre y post quirúrgicos":47,"Oncológicos":48,"Genitourinarias":49,"Quemados":51,"Otros":55},"cod":{"601101":129,"601104":131,"601024":165,"601030":168,"102501":174,"1010922":177,"601171":170}};


// ════════════════════════════════════════════════════════════════════
// ── svc_stats.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_stats.gs — Estadísticas del período para el dashboard.
 * Agrega EVOLUCIONES + REINTUBACIONES + ARCHIVO_PACIENTES entre dos fechas
 * (inclusive) en una sola pasada por hoja y devuelve SOLO agregados
 * (conteos, promedios y tablas de frecuencia) — nunca filas crudas.
 */

/** Normaliza a 'yyyy-MM-dd' (Sheets puede devolver Date en columnas con formato fecha). */
function _statISO(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, leerConfig('TIMEZONE', 'America/Santiago'), 'yyyy-MM-dd');
  }
  return String(v).slice(0, 10);
}

function obtenerStats(desde, hasta) {
  desde = _statISO(desde); hasta = _statISO(hasta);
  if (!desde || !hasta) return err('Faltan fechas desde/hasta.', ERR.VALIDACION);
  if (desde > hasta) { const t = desde; desde = hasta; hasta = t; }

  const tally = (obj, k) => { k = String(k || '').trim(); if (!k) return; obj[k] = (obj[k] || 0) + 1; };
  const r1 = x => Math.round(x * 10) / 10;

  // ── EVOLUCIONES (todas = episodios activos; al egresar se archivan) ──
  const allEvos = repoLeerTodos('EVOLUCIONES');
  const evos = allEvos.filter(e => {
    const f = _statISO(e.FECHA); return f && f >= desde && f <= hasta;
  });

  const pacientes = {};   // PATIENT_ID → { rem, vm }
  const vmDiasSet = {};   // 'pid|fecha' → true (días-paciente en VM)
  let dia = 0, noche = 0, ingresos = 0, turnosVM = 0;
  let intub = 0, ext = 0, extProg = 0, autoext = 0, pveSi = 0, pveSup = 0, pveFrus = 0;
  let decan = 0, recanul = 0, cambiosTOT = 0;
  let ktmR = 0, ktmC = 0, ktmN = 0, ktrSes = 0, imtSes = 0, ktmTiempo = 0, ktmTiempoN = 0;
  const ktmNiveles = {}, ktmMotivosNo = {}, procs = {}, catResp = {}, catMotor = {};
  // Puntaje SOCHIMI → nivel de complejidad (n variables: Baja=n, Media n+1..2n, Alta >2n)
  const catNivel = (p, n) => p <= n ? 'Baja' : (p <= n * 2 ? 'Media' : 'Alta');

  evos.forEach(e => {
    const pid = String(e.PATIENT_ID || e.COD_PACIENTE || 'sin-id');
    const f = _statISO(e.FECHA);
    if (!pacientes[pid]) pacientes[pid] = { rem: '', vm: false };
    if (e.PAC_DIAG_REM) pacientes[pid].rem = e.PAC_DIAG_REM;

    if (String(e.TURNO) === 'Noche') noche++; else dia++;
    if (esVerdadero(e.ES_INGRESO)) ingresos++;
    if (e.VENT_SOPORTE === 'VM') { turnosVM++; vmDiasSet[pid + '|' + f] = true; pacientes[pid].vm = true; }

    // Eventos únicos de vía aérea
    if (esVerdadero(e.INTUB_OCURRIO)) intub++;
    if (esVerdadero(e.EXT_OCURRIO)) {
      ext++;
      if (e.PVE_VAL === 'si') extProg++;
      if (String(e.EXT_TIPO || '').toLowerCase().indexOf('autoext') !== -1) autoext++;
    }
    if (e.PVE_VAL === 'si') pveSi++;
    if (e.PVE_RESULTADO === 'superada') pveSup++;
    if (e.PVE_RESULTADO === 'frustra') pveFrus++;
    if (esVerdadero(e.DECAN_OCURRIO)) decan++;
    if (esVerdadero(e.DECAN_RECANUL)) recanul++;
    if (esVerdadero(e.TOT_CAMBIO)) cambiosTOT++;

    // Terapia física
    if (esVerdadero(e.KTM_REALIZADA)) {
      ktmR++;
      tally(ktmNiveles, e.KTM_NIVEL_KTR ? 'Nivel ' + e.KTM_NIVEL_KTR : '');
      const t = parseFloat(e.KTM_TIEMPO_MIN); if (t > 0) { ktmTiempo += t; ktmTiempoN++; }
    } else if (esVerdadero(e.KTM_SUSPENDIDA)) {
      ktmC++; tally(ktmMotivosNo, e.KTM_CONTRA_RAZON || e.KTM_CONTRA_CAT || 'Contraindicada');
    } else if (esVerdadero(e.KTM_NO_REALIZADA)) {
      ktmN++; tally(ktmMotivosNo, e.KTM_NO_RAZON || 'Sin motivo registrado');
    }
    const kt = parseInt(e.RESP_KTR_CANT); if (kt > 0) ktrSes += kt;
    if (esVerdadero(e.KTM_IMT)) imtSes++;
    if (e.PROC_JSON) { try { (JSON.parse(e.PROC_JSON) || []).forEach(p => tally(procs, p)); } catch (x) {} }
    // Nivel guardado con la configuración vigente ese turno; filas anteriores
    // a CAT_MATRICES (solo puntaje) se derivan con el n° de variables default.
    const nR = String(e.CAT_RESP_NIVEL || '').trim();
    const cr = parseInt(e.CAT_RESP_PJE) || 0;
    if (nR) tally(catResp, nR); else if (cr) tally(catResp, catNivel(cr, 5));
    const nM = String(e.CAT_MOTOR_NIVEL || '').trim();
    const cm = parseInt(e.CAT_MOTOR_PJE) || 0;
    if (nM) tally(catMotor, nM); else if (cm) tally(catMotor, catNivel(cm, 4));
  });

  // ── DAUCI ACTUAL: pacientes actualmente ingresados cuya MRC-SS más reciente
  //    indica debilidad. No depende del rango de fechas: es una foto del estado
  //    de hoy. (EVOLUCIONES solo guarda episodios activos; al egresar se archivan,
  //    así que la última MRC de cada cama ocupada es su estado vigente.) ──
  const cDauci = parseFloat(leerConfig('CORTE_MRC_DAUCI', '48')) || 48;
  const cSev = parseFloat(leerConfig('CORTE_MRC_SEVERA', '36')) || 36;
  const activos = {}; // PATIENT_ID → true (camas ocupadas)
  repoLeerTodos('CAMAS_ESTADO').forEach(c => { if (esVerdadero(c.OCUPADA) && c.PATIENT_ID) activos[String(c.PATIENT_ID)] = true; });
  const mrcAct = {};  // PATIENT_ID ingresado → { val, key } (MRC-SS más reciente)
  allEvos.forEach(e => {
    const pid = String(e.PATIENT_ID || '');
    if (!activos[pid]) return;
    const m = parseFloat(e.EVAL_T_MRC);
    if (isNaN(m) || m <= 0) return;
    const kk = String(e.TURNO_KEY || (_statISO(e.FECHA) + '-' + e.TURNO));
    if (!mrcAct[pid] || kk > mrcAct[pid].key) mrcAct[pid] = { val: m, key: kk };
  });
  let mrcEval = 0, mrcDauci = 0, mrcSev = 0;
  Object.keys(mrcAct).forEach(pid => {
    mrcEval++;
    const val = mrcAct[pid].val;
    if (val < cDauci) mrcDauci++;
    if (val < cSev) mrcSev++;
  });
  const ingresadosN = Object.keys(activos).length;

  // Grupo REM: por paciente (último valor registrado), no por evolución
  const rem = {};
  Object.keys(pacientes).forEach(pid => tally(rem, pacientes[pid].rem || 'Sin grupo'));

  // ── REINTUBACIONES del rango (una fila por evento) ──
  let reintubs = 0;
  try {
    reintubs = repoLeerTodos('REINTUBACIONES').filter(r => {
      const f = _statISO(r.FECHA); return f && f >= desde && f <= hasta;
    }).length;
  } catch (x) {}

  // ── Egresos del rango (ARCHIVO_PACIENTES) ──
  const arch = repoLeerTodos('ARCHIVO_PACIENTES').filter(a => {
    const f = _statISO(a.FECHA_EGRESO); return f && f >= desde && f <= hasta;
  });
  const destinos = {}, motivosEgr = {}, mrcInterp = {}, fssInterp = {};
  let diasTot = 0, diasN = 0, dauci = 0;
  let mrcSum = 0, mrcN = 0, fssSum = 0, fssN = 0, cpaxSum = 0, cpaxN = 0;
  arch.forEach(a => {
    tally(destinos, a.DESTINO_EGRESO || 'Sin destino');
    tally(motivosEgr, a.MOTIVO_EGRESO || 'Sin motivo');
    const d = parseFloat(a.DIAS_TOTAL); if (d > 0) { diasTot += d; diasN++; }
    if (esVerdadero(a.DAUCI)) dauci++;
    if (a.MRC_INTERP) tally(mrcInterp, a.MRC_INTERP);
    if (a.FSS_INTERP) tally(fssInterp, a.FSS_INTERP);
    const m = parseFloat(a.MRC_SS_EGRESO); if (m > 0) { mrcSum += m; mrcN++; }
    const fs = parseFloat(a.FSS_EGRESO); if (fs > 0) { fssSum += fs; fssN++; }
    const cp = parseFloat(a.CPAX_EGRESO); if (cp > 0) { cpaxSum += cp; cpaxN++; }
  });

  return ok({
    desde: desde, hasta: hasta,
    evos: { total: evos.length, dia: dia, noche: noche },
    pacientes: {
      atendidos: Object.keys(pacientes).length, ingresos: ingresos, egresos: arch.length,
      ventilados: Object.keys(pacientes).filter(p => pacientes[p].vm).length,
    },
    vm: { turnosVM: turnosVM, diasPacienteVM: Object.keys(vmDiasSet).length },
    eventos: {
      intubaciones: intub, extubaciones: ext, extubProgramadas: extProg, autoextubaciones: autoext,
      reintubaciones: reintubs, tasaReintubPct: ext > 0 ? r1(reintubs / ext * 100) : 0,
      pveRealizadas: pveSi, pveSuperadas: pveSup, pveFrustras: pveFrus,
      pveExitoPct: (pveSup + pveFrus) > 0 ? r1(pveSup / (pveSup + pveFrus) * 100) : 0,
      decanulaciones: decan, recanulaciones: recanul, cambiosTOT: cambiosTOT,
    },
    ktm: {
      realizada: ktmR, contraindicada: ktmC, noRealizada: ktmN,
      realizadaPct: (ktmR + ktmC + ktmN) > 0 ? r1(ktmR / (ktmR + ktmC + ktmN) * 100) : 0,
      niveles: ktmNiveles, motivosNo: ktmMotivosNo,
      tiempoPromMin: ktmTiempoN > 0 ? r1(ktmTiempo / ktmTiempoN) : 0,
      ktrSesiones: ktrSes, imtSesiones: imtSes,
    },
    procs: procs, rem: rem, catResp: catResp, catMotor: catMotor,
    dauciActual: {
      ingresados: ingresadosN, evaluados: mrcEval, dauci: mrcDauci, severa: mrcSev,
      dauciPct: mrcEval > 0 ? r1(mrcDauci / mrcEval * 100) : 0,
      corte: cDauci, corteSev: cSev,
    },
    egresos: {
      total: arch.length, destinos: destinos, motivos: motivosEgr,
      diasEstadiaProm: diasN > 0 ? r1(diasTot / diasN) : 0,
      dauci: dauci, dauciPct: arch.length > 0 ? r1(dauci / arch.length * 100) : 0,
      mrcProm: mrcN > 0 ? r1(mrcSum / mrcN) : 0, fssProm: fssN > 0 ? r1(fssSum / fssN) : 0,
      cpaxProm: cpaxN > 0 ? r1(cpaxSum / cpaxN) : 0,
      mrcInterp: mrcInterp, fssInterp: fssInterp,
    },
  });
}

/**
 * Datos crudos ANONIMIZADOS para la tabla dinámica (pestaña Estadísticas).
 * Una fila por turno registrado, SOLO campos de lista blanca — jamás nombre
 * ni RUT (regla dura del proyecto). Fechas normalizadas AAAA-MM-DD y tope de
 * filas para no colgar el navegador del hospital.
 */
function datosPivot(desde, hasta) {
  try {
    const d0 = String(desde || '').slice(0, 10), d1 = String(hasta || '').slice(0, 10);
    const LIM = 2500;
    const todas = repoLeerTodos('EVOLUCIONES').concat(repoLeerTodos('EVOLUCIONES_ARCHIVO'))
      .filter(e => { const f = _statISO(e.FECHA); return f && (!d0 || f >= d0) && (!d1 || f <= d1); })
      .sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));
    const esT = v => v === true || v === 'TRUE';
    const filas = todas.slice(0, LIM).map(e => {
      const f = _statISO(e.FECHA);
      let fase = ''; try { fase = (JSON.parse(e.FASE_JSON || '[]') || [])[0] || ''; } catch (err) { fase = ''; }
      return {
        FECHA: f, MES: f.slice(0, 7), TURNO: String(e.TURNO || ''), CAMA: String(e.ID_CAMA || ''),
        SEXO: String(e.PAC_SEXO || ''), EDAD: e.PAC_EDAD || '', DIAG_REM: String(e.PAC_DIAG_REM || ''),
        FASE: fase, VIA_AEREA: String(e.VENT_VIA_AEREA || ''), SOPORTE: String(e.VENT_SOPORTE || ''),
        MODO: String(e.VENT_MODO || ''), DIA_ESTADIA: e.DIA_ESTADIA || '',
        KTR: parseInt(e.RESP_KTR_CANT) || 0,
        KTM: esT(e.KTM_REALIZADA) ? 'Sí' : (esT(e.KTM_SUSPENDIDA) ? 'Suspendida' : 'No'),
        NIVEL_KTM: String(e.KTM_NIVEL_KTR || ''), IMT: esT(e.KTM_IMT) ? 'Sí' : 'No',
        EMS: esT(e.KTM_EMS) ? 'Sí' : 'No', IMS: e.EVAL_IMS !== '' && e.EVAL_IMS != null ? String(e.EVAL_IMS) : '',
        PVE: String(e.PVE_VAL || ''), PVE_RESULTADO: String(e.PVE_RESULTADO || ''),
        EXTUBACION: esT(e.EXT_OCURRIO) ? String(e.EXT_TIPO || 'sí') : '',
        CUFF: String(e.VENT_CUFF_EST || ''),
        FIO2: e.VENT_FIO2 || '', PEEP: e.VENT_PEEP || '', PAFI: e.VENT_PAFI || '',
        MRC: e.EVAL_T_MRC || '', CPAX: e.CPAX_TOTAL || '',
      };
    });
    return ok({ filas: filas, total: todas.length, truncado: todas.length > LIM });
  } catch (e) { return err('datosPivot: ' + e.message, ERR.INTERNO, e); }
}


// ════════════════════════════════════════════════════════════════════
// ── svc_timeline.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_timeline.gs — Hitos del episodio (TIMELINE) y cache en CAMAS_ESTADO.
 * Patrón: funciones _interno SIN lock (para llamar desde otros servicios que ya
 * tienen el lock) + públicas con lock.
 */

// ── Escritura de hitos ─────────────────────────────────────
function _agregarHitoInternoSinSync(hito) {
  let patId = hito.patientId || '';
  if (!patId && hito.idCama) {
    const c = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(hito.idCama));
    if (c && c.PATIENT_ID) patId = c.PATIENT_ID;
  }
  repoInsertar('TIMELINE', {
    ID_HITO:     uid('HITO'),
    ID_CAMA:     String(hito.idCama || ''),
    PATIENT_ID:  patId,
    FECHA:       hito.fecha || hoyISO(),
    TURNO:       hito.turno || 'Dia',
    TIPO:        hito.tipo  || 'general',
    TEXTO:       hito.texto || '',
    AUTOR:       hito.autor || '',
    AUTOR_EMAIL: hito.autorEmail || '',
    TIMESTAMP:   ahoraTS(),
  });
}

function _agregarHitoInterno(hito) {
  _agregarHitoInternoSinSync(hito);
  _sincronizarTimelineCama(String(hito.idCama));
  return { accion: 'hito_agregado' };
}

/**
 * Guarda en CAMAS_ESTADO.TIMELINE_JSON los últimos 30 hitos de la cama (cache).
 *
 * 🔴 DEL EPISODIO VIGENTE, no de la cama entera (20-ago-2026). Leía solo por
 * `ID_CAMA`, y `_limpiarCamaInterno` vacía el cache pero NO purga TIMELINE: los
 * hitos del ocupante anterior seguían ahí. Consecuencia doble, y la segunda es
 * la grave: el ingreso y el diagnóstico de OTRA persona aparecían en la tarjeta
 * del paciente actual, y al colarse en el tope de 30 **empujaban fuera hitos
 * verdaderos suyos**. Mostrar el dato ajeno y esconder el propio, a la vez.
 *
 * Si la cama no tiene paciente (censo sin ingreso formal, fila legacy) se cae al
 * comportamiento de siempre: filtrar por cama. Esconder los hitos de una cama
 * así sería el error simétrico.
 */
function _sincronizarTimelineCama(idCama) {
  try {
    const cama = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
    const pid = String((cama && cama.PATIENT_ID) || '');
    let hitos = repoLeerTodos('TIMELINE', 'ID_CAMA', idCama);
    if (pid) {
      // «distinto Y no vacío»: un hito sin paciente puede ser del episodio
      // actual (anexo viejo, cama reparada), así que se conserva.
      hitos = hitos.filter(function (h) {
        const hp = String(h.PATIENT_ID || '');
        return !hp || hp === pid;
      });
    }
    if (!hitos.length) return;
    hitos.sort((a, b) => String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)));
    repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, { TIMELINE_JSON: JSON.stringify(hitos.slice(0, 30)) });
  } catch (e) { console.warn('_sincronizarTimelineCama:', e.message); }
}

// ── Público con lock ───────────────────────────────────────
function agregarHito(hito) {
  return conLock(() => {
    try { const r = _agregarHitoInterno(hito); SpreadsheetApp.flush(); return ok(r); }
    catch (e) { return err('agregarHito: ' + e.message, ERR.INTERNO, e); }
  });
}

function obtenerTimeline(idCama) {
  try {
    const hitos = repoLeerTodos('TIMELINE', 'ID_CAMA', idCama);
    hitos.sort((a, b) => String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)));
    return ok(hitos);
  } catch (e) { return err('obtenerTimeline: ' + e.message, ERR.INTERNO, e); }
}

// ── Hitos automáticos desde procedimientos ─────────────────
const PROC_TO_HITO = {
  // 🪤 La clave DEBE ser el nombre que viaja en PROC_JSON, no el que se lee
  // bonito: hasta ago-2026 decía 'INGRESO UCI' y el formulario manda 'INGRESO'
  // (index, _autoProcs), así que NUNCA calzaba. El ingreso caía al respaldo
  // genérico de la v5.39 y salía como un procedimiento más — morado, junto a
  // los hitos verdes de ingreso que escriben ingresarPaciente y guardarEvolucion.
  // Ese era el «ingreso duplicado» que reportó Diego (14-ago-2026).
  'INGRESO':                { tipo: 'ingreso',      label: 'Ingreso a UCI' },
  'INTUBACIÓN':             { tipo: 'via_aerea',    label: 'Intubación orotraqueal' },
  'PVE':                    { tipo: 'via_aerea',    label: 'PVE (Prueba de Ventilación Espontánea)' },
  'EXTUBACIÓN C/PROTOCOLO': { tipo: 'via_aerea',    label: 'Extubación c/protocolo' },
  'EXTUBACIÓN S/PROTOCOLO': { tipo: 'via_aerea',    label: 'Extubación s/protocolo' },
  'AUTOEXTUBACIÓN':         { tipo: 'via_aerea',    label: 'Autoextubación' },
  'EXTUBACIÓN ACCIDENTAL':  { tipo: 'via_aerea',    label: 'Extubación accidental' },
  'REINTUBACIÓN':           { tipo: 'via_aerea',    label: 'Reintubación' },
  'DESVINCULACIÓN':         { tipo: 'via_aerea',    label: 'Desvinculación de VM' },
  'CAMBIO TOT':             { tipo: 'via_aerea',    label: 'Cambio de TOT' },
  'TQT':                    { tipo: 'via_aerea',    label: 'Traqueostomía' },
  'CAMBIO TQT':             { tipo: 'via_aerea',    label: 'Cambio de TQT' },
  'DECANULACIÓN':           { tipo: 'via_aerea',    label: 'Decanulación' },
  'RECANULACIÓN':           { tipo: 'via_aerea',    label: 'Recanulación' },
  'PRONO':                  { tipo: 'procedimiento', label: 'Decúbito prono' },
  'SUPINO':                 { tipo: 'procedimiento', label: 'Decúbito supino' },
  'IMAGENOLOGÍA':           { tipo: 'procedimiento', label: 'Imagenología' },
  'CULTIVO DE SECRECIONES': { tipo: 'procedimiento', label: 'Cultivo de secreciones' },
  'ECOGRAFÍA':              { tipo: 'procedimiento', label: 'Ecografía' },
  'TEST APNEA':             { tipo: 'procedimiento', label: 'Test de apnea' },
  'PABELLÓN':               { tipo: 'procedimiento', label: 'Traslado a pabellón' },
  'RCP':                    { tipo: 'general',       label: 'Reanimación cardiopulmonar (RCP)' },
  'FALLECE':                { tipo: 'egreso',        label: 'Fallece' },
  // Los cuatro de abajo también los manda `_autoProcs` y tampoco estaban: caían
  // al respaldo genérico y se leían como «procedimiento» sin nombre clínico
  // (14-ago-2026). La recanulación es el caso que importa —es vía aérea— y por
  // eso viaja arriba, junto a la decanulación.
  'ASISTENCIA EN PROCEDIMIENTO MÉDICO': { tipo: 'procedimiento', label: 'Asistencia en procedimiento médico' },
  'EDUCACIÓN A USUARIO/FAMILIA':        { tipo: 'kine',          label: 'Educación a usuario/familia' },
  'EVALUACIÓN INTERMEDIA':              { tipo: 'kine',          label: 'Evaluación kinésica intermedia' },
  'PCR COVID':                          { tipo: 'procedimiento', label: 'PCR COVID' },
  'Hito Motor 1':           { tipo: 'kine', label: 'Hito Motor 1 — Sedestación borde de cama' },
  'Hito Motor 2':           { tipo: 'kine', label: 'Hito Motor 2 — Bipedestación asistida' },
  'Hito Motor 3':           { tipo: 'kine', label: 'Hito Motor 3 — Marcha asistida' },
  'Hito Motor 4':           { tipo: 'kine', label: 'Hito Motor 4 — Marcha autónoma corta' },
  'Hito Motor 5':           { tipo: 'kine', label: 'Hito Motor 5 — Marcha autónoma extendida' },
  'IMT':                    { tipo: 'kine', label: 'IMT (entrenamiento muscular inspiratorio)' },
  'EMS':                    { tipo: 'kine', label: 'Electroestimulación muscular' },
};

// Tipos que el guardado de una evolución BORRA y vuelve a generar desde sus
// procedimientos. Todo lo que no esté aquí sobrevive a un re-guardado — y esa
// es la única protección que tienen los hitos escritos a mano: 'ingreso',
// 'egreso', 'cultivo', 'evento' y 'anexo' están fuera a propósito.
const _TIPOS_HITO_AUTO = ['via_aerea', 'procedimiento', 'kine', 'general'];

/**
 * Prefijo del texto con que se escribe el hito de un procedimiento ANEXADO
 * por el botón ➕ (`anexarEventoRapido`).
 *
 * Vive aquí, y no en svc_eventos.gs, porque lo usan los dos lados: el que
 * escribe el hito y el guardado de la evolución, que gracias a él reconoce el
 * hito rico y no le escribe encima la etiqueta pelada. Una sola definición,
 * que es la lección que este proyecto ya pagó tres veces.
 */
function _hitoAnexoPrefijo(nombreProc) { return '🔧 ' + String(nombreProc || ''); }

/**
 * Clave de hito de un procedimiento. Varios se guardan con un dato pegado
 * ('PRONO 19:00 HRS', 'RCP 3 CICLOS') y la búsqueda exacta los dejaba SIN
 * hito: la pronación con hora no aparecía en el historial y la que venía sin
 * hora sí — el hito terminaba en el turno equivocado (ago-2026).
 */
function _procClaveHito(proc) {
  var k = String(proc || '').trim().toUpperCase();
  k = k.replace(/\s+\d{1,2}:\d{2}\s*HRS?$/, '');   // PRONO 19:00 HRS
  k = k.replace(/\s+\d+\s+CICLOS?$/, '');          // RCP 3 CICLOS
  if (k === 'SUPINACIÓN' || k === 'SUPINACION') k = 'SUPINO';
  return k;
}

/**
 * Etiqueta legible para un procedimiento que NO está en PROC_TO_HITO.
 * Se conserva el texto tal como lo eligió el colega (es del catálogo o lo
 * escribió él), solo se arregla el uso de MAYÚSCULAS: la hoja lo guarda todo
 * en alta y en la línea de tiempo se lee mal.
 */
const _SIGLAS_UNIDAD = ('RCP TQT TOT VNI CNAF VM VMI VMNI PCR COVID NAVM HEPA HME SDRA ' +
  'EPOC UCI GSA PVE IMT EMS KTM KTR MRC FSS CPAX APK RHB DVA BNM SAS TEC HIC HSA ' +
  'EPA PAFI FILMARRAY ECMO VAFO NRC OAF BPAP CPAP TAC ECG PIM PEM FEM S5Q').split(' ');
function _procLabelGenerico(proc) {
  const t = String(proc || '').trim();
  if (!t) return '';
  // La hoja guarda los procedimientos EN ALTA y así se leen mal en la línea de
  // tiempo. Se baja dejando la inicial, pero SIN destrozar las siglas de la
  // unidad (RCP, COVID, NAVM…) ni lo que traiga números (TOT 8.0).
  if (t !== t.toUpperCase()) return t;
  return t.split(' ').map(w => {
    const limpio = w.replace(/[^A-ZÁÉÍÓÚÑ0-9]/g, '');
    if (/\d/.test(w) || _SIGLAS_UNIDAD.indexOf(limpio) !== -1) return w;
    return w.charAt(0) + w.slice(1).toLowerCase();
  }).join(' ');
}

/**
 * TODA la línea de tiempo de UN guardado, con una sola pasada por la hoja
 * (ago-2026, Ola 4): borra los hitos auto del turno, inserta los nuevos (los
 * de procedimientos + los extra, p.ej. el de ingreso) y devuelve el
 * TIMELINE_JSON de la cama ya coherente, para que el guardado lo escriba en
 * su ÚNICA escritura a CAMAS_ESTADO. Antes esto eran: bajar TIMELINE entera
 * para borrar, un viaje por hito insertado, y volver a bajar TIMELINE para
 * armar el cache — y si el re-guardado quitaba todos los procedimientos, el
 * cache NI SE TOCABA: la tarjeta de la cama seguía mostrando hitos borrados
 * (bug de datos, arreglado de paso porque el JSON ahora se devuelve SIEMPRE).
 *
 * REGLA de los hitos (ago-2026, reporte de Diego): TODO lo que entra a
 * PROCEDIMIENTOS aparece en la línea de tiempo. La lista PROC_TO_HITO manda
 * para los eventos con ícono y nombre clínico propio; lo demás entra con
 * etiqueta genérica en vez de desaparecer en silencio (la estadística cuenta
 * filas de PROCEDIMIENTOS y la línea de tiempo debe cuadrar con ella).
 *
 * @return {string} TIMELINE_JSON (últimos 30 hitos de la cama)
 */
function _timelineDelGuardado(idCama, fecha, turno, procs, autor, autorEmail, patientId, hitosExtra) {
  const id = String(idCama);
  // UNA lectura: sirve para decidir qué borrar Y para armar el cache después.
  const todos = repoLeerTodosConFila('TIMELINE');
  // 🔴 El borrado exige TAMBIÉN el episodio (20-ago-2026). Miraba solo
  // cama+fecha+turno, así que el re-guardado de un ocupante borraba los hitos
  // automáticos que otro paciente tuviera en esa misma cama y turno — el caso
  // real de una cama que rota sin archivar. Regla «distinto Y no vacío»: un
  // hito sin paciente se sigue tratando como propio, para no dejar basura
  // inmortal de las camas reparadas a mano.
  const _pidEp = String(patientId || '');
  const esDelTurnoAuto = function (h) {
    if (!(String(h.ID_CAMA) === id && String(h.FECHA) === String(fecha) &&
          h.TURNO === turno && _TIPOS_HITO_AUTO.indexOf(h.TIPO) !== -1)) return false;
    const hp = String(h.PATIENT_ID || '');
    return !_pidEp || !hp || hp === _pidEp;
  };
  repoEliminarFilas('TIMELINE', todos.filter(function (t) { return esDelTurnoAuto(t.obj); })
    .map(function (t) { return t.fila; }));

  // Lo que queda vivo tras el borrado. De aquí salen las DOS comprobaciones de
  // abajo, sin una sola lectura más: la hoja ya está en la mano.
  const sobreviven = todos.map(function (t) { return t.obj; })
    .filter(function (h) { return !esDelTurnoAuto(h); });

  // ── (a) El ingreso se anota UNA vez ────────────────────────────────────
  // Tres sitios lo escriben —`ingresarPaciente`, el bloque de ingreso de
  // `guardarEvolucion` y el procedimiento 'INGRESO'— y ninguno sabía de los
  // otros (Diego, 14-ago-2026: «una de color verde y otro morado»). El tipo
  // 'ingreso' NO está en `_TIPOS_HITO_AUTO`, a propósito: un re-guardado no
  // debe borrar el ingreso. Por eso el que sobra no se limpia después — se
  // evita antes de escribirlo.
  //
  // 🔴 El alcance es lo delicado: TIMELINE **no se limpia al dar el alta**
  // (va con el cierre anual), así que mirar solo la CAMA encontraría el
  // ingreso del ocupante ANTERIOR y le escondería el suyo al paciente nuevo
  // — la trampa de la pronación heredada, otra vez. Con `patientId` se
  // compara el episodio; sin él se cae a la misma cama Y la misma fecha, que
  // cubre el caso reportado (los tres autores disparan el mismo día) sin
  // poder tapar jamás un ingreso verdadero de otro episodio.
  const pid = String(patientId || '');
  const hayIngreso = sobreviven.some(function (h) {
    if (String(h.TIPO) !== 'ingreso') return false;
    if (pid) return String(h.PATIENT_ID || '') === pid;
    return String(h.ID_CAMA) === id && String(h.FECHA) === String(fecha);
  });

  // ── (b) El evento rápido conserva su hito rico ─────────────────────────
  // `anexarEventoRapido` escribe «🔧 EEG 14:00 — control post crisis (anexo)
  // · Klgo. …» Y suma el procedimiento a PROC_JSON. Hasta ago-2026 ese hito
  // nacía con TIPO 'procedimiento' —que SÍ está en `_TIPOS_HITO_AUTO`—, así
  // que el siguiente guardado del turno lo borraba y lo regeneraba como
  // «Eeg»: se perdían hora, detalle, la marca (anexo) y la firma, sin que
  // nada fallara. Ahora nace con TIPO 'anexo' (fuera de la lista, igual que
  // 'cultivo', que por eso nunca se degradó) y aquí se descuenta su
  // procedimiento para no escribirle encima una segunda etiqueta pelada.
  const anexosVivos = {};
  sobreviven.forEach(function (h) {
    if (String(h.TIPO) !== 'anexo') return;
    if (String(h.ID_CAMA) !== id || String(h.FECHA) !== String(fecha) || h.TURNO !== turno) return;
    // Se cuentan, no se marcan: dos anexos del mismo procedimiento en el
    // mismo turno descuentan dos procedimientos, no uno.
    const t = String(h.TEXTO || '');
    anexosVivos[t] = (anexosVivos[t] || 0) + 1;
  });
  const descontarAnexo = function (proc) {
    const pref = _hitoAnexoPrefijo(proc);
    const clave = Object.keys(anexosVivos).find(function (t) {
      return anexosVivos[t] > 0 && t.indexOf(pref) === 0;
    });
    if (!clave) return false;
    anexosVivos[clave]--;
    return true;
  };

  const nuevos = [];
  const agregar = function (hito) {
    nuevos.push({
      ID_HITO: uid('HITO'), ID_CAMA: id, PATIENT_ID: hito.patientId || patientId || '',
      FECHA: hito.fecha || fecha, TURNO: hito.turno || turno, TIPO: hito.tipo || 'general',
      TEXTO: hito.texto || '', AUTOR: hito.autor || autor || '',
      AUTOR_EMAIL: hito.autorEmail || autorEmail || '', TIMESTAMP: ahoraTS(),
    });
  };
  let ingresoPuesto = hayIngreso;
  const agregarUnico = function (hito) {
    if (String(hito.tipo) === 'ingreso') {
      if (ingresoPuesto) return;
      ingresoPuesto = true;
    }
    agregar(hito);
  };
  (hitosExtra || []).forEach(agregarUnico);
  (Array.isArray(procs) ? procs : []).forEach(function (proc) {
    if (descontarAnexo(proc)) return;   // ya tiene su hito, con hora y detalle
    const map = PROC_TO_HITO[_procClaveHito(proc)] ||
                { tipo: 'procedimiento', label: _procLabelGenerico(proc), generico: true };
    if (!map.label) return;   // procedimiento vacío: nada que anotar
    agregarUnico({ tipo: map.tipo, texto: map.label });
  });
  repoInsertarVarios('TIMELINE', nuevos);

  // El cache de la cama, desde lo que ya está en la mano: los hitos que
  // sobrevivieron + los recién insertados. Mismo orden y corte que
  // _sincronizarTimelineCama (por TIMESTAMP descendente, últimos 30).
  // 🔴 …y del EPISODIO: si no, los hitos del ocupante anterior entran al cache
  // de la tarjeta y, al ordenarse por TIMESTAMP, empujan fuera del tope de 30
  // hitos verdaderos del paciente actual.
  const cama = todos.filter(function (t) {
      if (String(t.obj.ID_CAMA) !== id || esDelTurnoAuto(t.obj)) return false;
      const hp = String(t.obj.PATIENT_ID || '');
      return !_pidEp || !hp || hp === _pidEp;
    })
    .map(function (t) { return t.obj; })
    .concat(nuevos);
  cama.sort(function (a, b) { return String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)); });
  return JSON.stringify(cama.slice(0, 30));
}


// ════════════════════════════════════════════════════════════════════
// ── svc_turnos.gs ──
// ════════════════════════════════════════════════════════════════════

/**
 * svc_turnos.gs — Tablero de asignación de turno (v1: "🎨 Asignar turno").
 *
 * Guarda qué kinesiólogos están de turno y qué camas pinta cada uno, por
 * clave de turno ('yyyy-MM-dd-Dia' | 'yyyy-MM-dd-Noche'). Es un dato
 * operativo compartido y efímero → se persiste en ScriptProperties (no
 * requiere hoja ni cambio de esquema). Se conserva un máximo de claves
 * recientes para no crecer sin límite.
 */

var _ASIG_PREFIX = 'ASIG_TURNO_';
var _ASIG_MAX_KEYS = 30; // ~2 semanas de turnos

function _asigKeyValida(key) {
  return /^\d{4}-\d{2}-\d{2}-(Dia|Noche)$/.test(String(key || ''));
}

/** @return {{ok:boolean, data:{team:string[], assign:Object}}} */
function obtenerAsignacionTurno(key) {
  try {
    if (!_asigKeyValida(key)) return err('Clave de turno inválida: ' + key, ERR.VALIDACION);
    const raw = PropertiesService.getScriptProperties().getProperty(_ASIG_PREFIX + key);
    if (!raw) return ok({ team: [], assign: {} });
    let data;
    try { data = JSON.parse(raw); } catch (e) { data = { team: [], assign: {} }; }
    return ok({ team: data.team || [], assign: data.assign || {} });
  } catch (e) { return err('obtenerAsignacionTurno: ' + e.message, ERR.INTERNO, e); }
}

/** datos: { key, data: JSON string {team, assign} } */
function guardarAsignacionTurno(datos) {
  try {
    const key = String((datos && datos.key) || '');
    if (!_asigKeyValida(key)) return err('Clave de turno inválida: ' + key, ERR.VALIDACION);
    let data;
    try { data = JSON.parse(String(datos.data || '{}')); } catch (e) {
      return err('Payload de asignación no es JSON válido', ERR.VALIDACION);
    }
    const limpio = JSON.stringify({
      team: Array.isArray(data.team) ? data.team.slice(0, 6).map(String) : [],
      assign: (data.assign && typeof data.assign === 'object') ? data.assign : {},
    });
    const props = PropertiesService.getScriptProperties();
    props.setProperty(_ASIG_PREFIX + key, limpio);
    _asigPodarViejas(props);
    return ok({ accion: 'asignacion_guardada', key: key });
  } catch (e) { return err('guardarAsignacionTurno: ' + e.message, ERR.INTERNO, e); }
}

/** Borra las claves de asignación más antiguas cuando superan el máximo. */
function _asigPodarViejas(props) {
  const keys = props.getKeys().filter(function (k) { return k.indexOf(_ASIG_PREFIX) === 0; });
  if (keys.length <= _ASIG_MAX_KEYS) return;
  keys.sort(); // orden lexicográfico = cronológico (yyyy-MM-dd)
  keys.slice(0, keys.length - _ASIG_MAX_KEYS).forEach(function (k) { props.deleteProperty(k); });
}

/* ── Sugerencias del equipo (ago-2026, centro de ayuda de la mascota) ──
   Cada colega deja su idea con su firma; la coordinación las revisa en
   Estadísticas y les pone estado. El colega ve las SUYAS con su estado
   (sabe que no cayeron al vacío); el listado completo es de coordinación. */

function guardarSugerencia(datos, ctx) {
  try {
    const texto = String((datos && datos.texto) || '').trim().slice(0, 1000);
    const firma = String((datos && datos.firma) || '').trim();
    if (!texto) return err('Escribe la sugerencia antes de enviar.', ERR.VALIDACION);
    if (!firma) return err('Falta la firma de quien sugiere.', ERR.VALIDACION);
    const fila = {
      ID: 'SUG_' + Date.now(),
      TIMESTAMP: ahoraTS(),
      FIRMA: firma,
      AUTOR_EMAIL: (ctx && ctx.email) || '',
      TEXTO: texto,
      ESTADO: 'nueva',
      NOTA_COORD: '',
    };
    repoInsertar('SUGERENCIAS', fila);
    return ok({ id: fila.ID, entidad: 'SUGERENCIAS', accion: 'sugerencia' });
  } catch (e) { return err('guardarSugerencia: ' + e.message, ERR.INTERNO, e); }
}

function obtenerSugerencias() {
  try {
    const rows = repoLeerTodos('SUGERENCIAS').map(function (s) {
      return { id: s.ID, ts: s.TIMESTAMP, firma: s.FIRMA, texto: s.TEXTO,
               estado: s.ESTADO || 'nueva', nota: s.NOTA_COORD || '' };
    });
    rows.reverse();   // las más nuevas primero
    return ok(rows);
  } catch (e) { return err('obtenerSugerencias: ' + e.message, ERR.INTERNO, e); }
}

const _SUG_ESTADOS = ['nueva', 'considerada', 'aplicada', 'descartada'];
function setSugerenciaEstado(datos) {
  try {
    const id = String((datos && datos.id) || '');
    const estado = String((datos && datos.estado) || '');
    if (_SUG_ESTADOS.indexOf(estado) === -1) return err('Estado desconocido: ' + estado, ERR.VALIDACION);
    const cambios = { ESTADO: estado };
    if (datos && datos.nota !== undefined) cambios.NOTA_COORD = String(datos.nota).slice(0, 500);
    if (!repoActualizar('SUGERENCIAS', 'ID', id, cambios)) return err('Sugerencia no encontrada.', ERR.VALIDACION);
    return ok({ id: id, estado: estado, entidad: 'SUGERENCIAS', accion: 'estado sugerencia' });
  } catch (e) { return err('setSugerenciaEstado: ' + e.message, ERR.INTERNO, e); }
}
