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

/** Guarda en CAMAS_ESTADO.TIMELINE_JSON los últimos 30 hitos de la cama (cache). */
function _sincronizarTimelineCama(idCama) {
  try {
    const hitos = repoLeerTodos('TIMELINE', 'ID_CAMA', idCama);
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
  'INGRESO UCI':            { tipo: 'ingreso',      label: 'Ingreso UCI' },
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
  'PRONO':                  { tipo: 'procedimiento', label: 'Decúbito prono' },
  'SUPINO':                 { tipo: 'procedimiento', label: 'Decúbito supino' },
  'IMAGENOLOGÍA':           { tipo: 'procedimiento', label: 'Imagenología' },
  'CULTIVO DE SECRECIONES': { tipo: 'procedimiento', label: 'Cultivo de secreciones' },
  'ECOGRAFÍA':              { tipo: 'procedimiento', label: 'Ecografía' },
  'TEST APNEA':             { tipo: 'procedimiento', label: 'Test de apnea' },
  'PABELLÓN':               { tipo: 'procedimiento', label: 'Traslado a pabellón' },
  'RCP':                    { tipo: 'general',       label: 'Reanimación cardiopulmonar (RCP)' },
  'FALLECE':                { tipo: 'egreso',        label: 'Fallece' },
  'Hito Motor 1':           { tipo: 'kine', label: 'Hito Motor 1 — Sedestación borde de cama' },
  'Hito Motor 2':           { tipo: 'kine', label: 'Hito Motor 2 — Bipedestación asistida' },
  'Hito Motor 3':           { tipo: 'kine', label: 'Hito Motor 3 — Marcha asistida' },
  'Hito Motor 4':           { tipo: 'kine', label: 'Hito Motor 4 — Marcha autónoma corta' },
  'Hito Motor 5':           { tipo: 'kine', label: 'Hito Motor 5 — Marcha autónoma extendida' },
  'IMT':                    { tipo: 'kine', label: 'IMT (entrenamiento muscular inspiratorio)' },
  'EMS':                    { tipo: 'kine', label: 'Electroestimulación muscular' },
};

const _TIPOS_HITO_AUTO = ['via_aerea', 'procedimiento', 'kine', 'general'];

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
 * Convierte la lista de procedimientos del turno en hitos (idempotente).
 *
 * REGLA (ago-2026, reporte de Diego): TODO lo que entra a PROCEDIMIENTOS
 * aparece en la línea de tiempo. Antes se traducía con una lista fija y lo
 * que no estaba en ella se descartaba EN SILENCIO — se perdían la asistencia
 * en procedimiento médico, la educación al usuario, la evaluación intermedia,
 * la recanulación y TODO lo que el colega agregara a mano del catálogo. Como
 * la estadística cuenta filas de PROCEDIMIENTOS y la línea de tiempo contaba
 * solo lo traducido, las dos NUNCA cuadraban.
 *
 * La lista sigue mandando para los eventos con ícono y nombre clínico propio;
 * lo demás entra con etiqueta genérica en vez de desaparecer.
 */
function _crearHitosDesdeProcedimientos(idCama, fecha, turno, procs, autor, autorEmail, patientId) {
  _borrarHitosAutoTurno(idCama, fecha, turno);
  if (!Array.isArray(procs) || !procs.length) return;
  let creados = 0;
  procs.forEach(proc => {
    const map = PROC_TO_HITO[_procClaveHito(proc)] ||
                { tipo: 'procedimiento', label: _procLabelGenerico(proc), generico: true };
    if (!map.label) return;   // procedimiento vacío: nada que anotar
    // patientId viaja desde quien llama: sin él, _agregarHitoInternoSinSync
    // vuelve a CAMAS_ESTADO a buscarlo por CADA procedimiento del turno, aunque
    // el guardado ya lo tenga en la mano. Si no viene, se comporta como antes.
    _agregarHitoInternoSinSync({ idCama, patientId: patientId || '', fecha, turno, tipo: map.tipo, texto: map.label, autor: autor || '', autorEmail: autorEmail || '' });
    creados++;
  });
  if (creados) _sincronizarTimelineCama(String(idCama));
}

/** Borra los hitos auto-generados del turno (preserva ingreso/egreso). */
function _borrarHitosAutoTurno(idCama, fecha, turno) {
  repoEliminarDonde('TIMELINE', h =>
    String(h.ID_CAMA) === String(idCama) &&
    String(h.FECHA) === String(fecha) &&
    h.TURNO === turno &&
    _TIPOS_HITO_AUTO.indexOf(h.TIPO) !== -1);
}
