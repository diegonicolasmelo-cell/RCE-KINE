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
// 'nota' entra aquí (2-sep-2026) para que el hito 📌 de la nota del turno se
// REEMPLACE al re-guardar la evolución: si el colega corrige la nota, el
// historial muestra la corregida y no las dos.
const _TIPOS_HITO_AUTO = ['via_aerea', 'procedimiento', 'kine', 'general', 'nota'];

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
