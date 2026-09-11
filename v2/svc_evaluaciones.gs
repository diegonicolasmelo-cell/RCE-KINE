/**
 * svc_evaluaciones.gs — La SERIE FECHADA del episodio y las escalas pre-UCI
 * escritas directo al episodio (rama episodio/turno, 11-sep-2026).
 *
 * POR QUÉ EXISTE. Diego, 10-sep: «al día siguiente otro colega quiere aplicar
 * una ECF pero no sabe dónde, por lo tanto no la aplica y se pierde el dato».
 * Y el 11-sep: «ocupamos el valor del colega pero debemos saber quién firmó».
 * Hasta aquí el episodio arrastraba ULT_MRC + ULT_MRC_FECHA y NINGUNA firma;
 * la serie completa estaba desparramada en filas de turno.
 *
 * DOS COSAS DISTINTAS, a propósito (corrección clínica de Diego, 11-sep):
 *  · ECF, Barthel y Charlson son DATO ÚNICO del episodio (estado pre-UCI).
 *    «Es la que es; si hay corrección se corrige el mismo dato.» → van a
 *    CAMAS_ESTADO tal cual, sin historial: `episodioEscala`.
 *  · MRC, FSS, CPAx, Pimáx… se REPITEN. → hoja EVALUACIONES, una fila por
 *    medición, con fecha y firma; corregir agrega y anula, nunca borra:
 *    `evalRegistrar`.
 *
 * 🔑 La firma es PROCEDENCIA, no propiedad: cualquiera cita el valor para sus
 * fines; la firma solo dice de dónde salió. Y separa dos firmas que antes se
 * colapsaban: quién MIDIÓ y quién EVOLUCIONA hoy citándolo.
 *
 * 🪤 Sin login (AUTH_DEV_MODE) la firma es la DECLARADA en el formulario, no
 * una identidad verificada. Vale lo que vale una firma en el papel de la
 * unidad. Lo resolvería el login real del PRD de la PWA.
 */

// Escalas que llevan historial (serie) y su columna espejo en CAMAS_ESTADO.
const EVAL_SERIE = {
  MRC:       { ult: 'ULT_MRC',    fecha: 'ULT_MRC_FECHA', firma: 'ULT_MRC_FIRMA', col: 'EVAL_T_MRC',    max: 60 },
  FSS:       { ult: 'ULT_FSS',    fecha: 'ULT_FSS_FECHA', firma: 'ULT_FSS_FIRMA', col: 'EVAL_T_FSS',    max: 35 },
  PIM:       { ult: 'ULT_PIM',    fecha: 'ULT_PIM_FECHA', firma: 'ULT_PIM_FIRMA', col: 'EVAL_T_PIM' },
  DINAMO:    { ult: 'ULT_DINAMO', col: 'EVAL_T_DINAMO' },
  CPAX:      { col: 'CPAX_TOTAL', max: 50 },
  PEM:       { col: 'EVAL_T_PEM' },
  FEM:       { col: 'EVAL_T_FEM' },
  ECO:       { col: 'EVAL_T_GROSOR' },
  DEGLUCION: { col: 'EVAL_DEGLUCION' },
  CULTIVO:   {},
};
// Dato único del episodio: se corrige encima.
const EPISODIO_ESCALAS = { ECF: 'ECF', BARTHEL: 'BARTHEL', CHARLSON: 'CHARLSON' };

/** El turno de este momento, con los cortes de CONFIG (misma regla que la GSA). */
function _turnoActualSrv() {
  try { return turnoLogicoServidor(hoyISO(), _horaAhora()).turno || 'Dia'; } catch (e) { return 'Dia'; }
}

/** Normaliza el nombre de escala que manda el cliente. */
function _evalEscala(x) {
  const e = String(x || '').trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (e === 'FSSICU') return 'FSS';
  if (e === 'MRCSS') return 'MRC';
  return e;
}

/**
 * evalRegistrar — una medición nueva en la serie del episodio.
 * datos: { idCama, escala, total, items (obj|array|string), firma, fecha?, turno?,
 *          origen? ('tarjeta' por defecto), idEvolucion?, anulaId? }
 * Escribe EVALUACIONES y actualiza el espejo ULT_* de la cama (valor, fecha,
 * firma). Devuelve la fila creada. NO toca EVOLUCIONES: si la medición vino de
 * un turno, ese turno ya escribió su columna por su cuenta.
 */
function evalRegistrar(datos, ctx) {
  ctx = ctx || {};
  return conLock(() => {
    try {
      const r = _evalRegistrarInterno(datos, ctx);
      if (r && r.error) return r;
      SpreadsheetApp.flush();
      return ok(r);
    } catch (e) { return err('evalRegistrar: ' + e.message); }
  });
}

/** Sin lock: para llamar desde guardarEvolucion, que ya lo tiene. */
function _evalRegistrarInterno(datos, ctx) {
  datos = datos || {};
  const idCama = String(datos.idCama || datos.ID_CAMA || '').trim();
  const escala = _evalEscala(datos.escala || datos.ESCALA);
  if (!idCama) return err('Falta la cama.', ERR.VALIDACION);
  if (!EVAL_SERIE[escala]) return err('Escala desconocida: ' + escala, ERR.VALIDACION);
  const total = String(datos.total == null ? (datos.TOTAL == null ? '' : datos.TOTAL) : datos.total).trim();
  if (total === '' && escala !== 'CULTIVO') return err('Falta el valor de ' + escala + '.', ERR.VALIDACION);
  const def = EVAL_SERIE[escala];
  if (def.max != null) {
    const n = parseFloat(String(total).replace(',', '.'));
    if (isNaN(n) || n < 0 || n > def.max) return err(escala + ' fuera de rango (0-' + def.max + '): ' + total, ERR.VALIDACION);
  }
  const cama = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
  if (!cama) return err('No existe la cama ' + idCama + '.', ERR.VALIDACION);
  const pid = String(datos.patientId || datos.PATIENT_ID || cama.PATIENT_ID || '');
  if (!pid) return err('La cama ' + idCama + ' no tiene episodio: ingresa al paciente antes de medir.', ERR.VALIDACION);

  // La firma: la que manda el cliente (el select del formulario), si no la
  // del contexto. Corta, como PLAN_FIRMA_KINE: nunca un texto largo.
  let firma = String(datos.firma || datos.FIRMA || ctx.firma || '').trim();
  if (firma.length > 15 || /\n/.test(firma)) firma = '';

  const fecha = String(datos.fecha || datos.FECHA || hoyISO());
  const turno = String(datos.turno || datos.TURNO || _turnoActualSrv());
  let items = datos.items != null ? datos.items : (datos.ITEMS_JSON != null ? datos.ITEMS_JSON : '');
  if (items && typeof items !== 'string') { try { items = JSON.stringify(items); } catch (e) { items = ''; } }

  const fila = {
    ID_EVAL: uid('EVAL'), PATIENT_ID: pid, ID_CAMA: idCama,
    FECHA: fecha, TURNO: turno, ESCALA: escala, TOTAL: total,
    ITEMS_JSON: items || '', FIRMA: firma,
    ORIGEN: String(datos.origen || datos.ORIGEN || 'tarjeta'),
    ID_EVOLUCION: String(datos.idEvolucion || datos.ID_EVOLUCION || ''),
    ANULADA: false, TIMESTAMP: ahoraTS(),
  };
  repoInsertar('EVALUACIONES', fila);

  // Corregir = nueva fila + anular la vieja. Nunca se borra.
  if (datos.anulaId) {
    try { repoActualizar('EVALUACIONES', 'ID_EVAL', String(datos.anulaId), { ANULADA: true }); } catch (e) {}
  }

  // Espejo en la cama: solo si esta medición es la más reciente del episodio
  // (una corrección retroactiva no debe pisar una medición posterior).
  const ult = _evalUltima(pid, escala);
  if (ult && ult.ID_EVAL === fila.ID_EVAL) _evalEspejoCama(idCama, escala, fila);

  // Hito legible, para la línea de tiempo y la tarjeta.
  try {
    _agregarHitoInternoSinSync({
      idCama: idCama, patientId: pid, fecha: fecha, turno: turno, tipo: 'evaluacion',
      texto: '📐 ' + _evalNombre(escala) + ' ' + total + (firma ? ' (' + firma + ')' : ''),
      autor: firma, autorEmail: ctx.email || '',
      // Sin el ID_EVAL (un uid): el hito debe ser DETERMINISTA para que dos
      // guardados iguales dejen la misma línea de tiempo (guardia guardado_viajes).
      datos: { escala: escala, total: total, firma: firma, fecha: fecha },
    });
    _sincronizarTimelineCama(idCama);
  } catch (e) { console.warn('evalRegistrar hito:', e.message); }

  return { entidad: 'EVALUACIONES', accion: 'medicion', escala: escala, total: total, idEval: fila.ID_EVAL, firma: firma, fecha: fecha };
}

function _evalNombre(escala) {
  return ({ MRC: 'MRC-ss', FSS: 'FSS-ICU', CPAX: 'CPAx', PIM: 'Pimáx', PEM: 'PEM', FEM: 'FEM',
            DINAMO: 'Dinamometría', ECO: 'Ecografía', DEGLUCION: 'Deglución', CULTIVO: 'Cultivo' })[escala] || escala;
}

/** Copia valor/fecha/firma de la medición al espejo ULT_* de la cama. */
function _evalEspejoCama(idCama, escala, fila) {
  const def = EVAL_SERIE[escala] || {};
  const campos = {};
  if (def.ult)   campos[def.ult] = fila.TOTAL;
  if (def.fecha) campos[def.fecha] = fila.FECHA;
  if (def.firma) campos[def.firma] = fila.FIRMA || '';
  if (Object.keys(campos).length) repoActualizar('CAMAS_ESTADO', 'ID_CAMA', String(idCama), campos);
}

/** La medición vigente (no anulada, más reciente) de una escala del episodio. */
function _evalUltima(pid, escala) {
  const todas = evalDelEpisodio(pid).filter(function (e) { return e.ESCALA === escala; });
  return todas.length ? todas[todas.length - 1] : null;
}

/** Todas las mediciones vigentes del episodio, ordenadas por fecha y momento. */
function evalDelEpisodio(pid) {
  if (!pid) return [];
  return repoLeerTodos('EVALUACIONES', 'PATIENT_ID', String(pid))
    .filter(function (e) { return !esVerdadero(e.ANULADA); })
    .sort(function (a, b) {
      const c = String(a.FECHA).localeCompare(String(b.FECHA));
      return c !== 0 ? c : String(a.TIMESTAMP).localeCompare(String(b.TIMESTAMP));
    });
}

/** GET_EVALUACIONES — la serie de una cama (episodio vigente) o de un pid. */
function obtenerEvaluaciones(datos) {
  datos = datos || {};
  let pid = String(datos.patientId || '');
  if (!pid && datos.idCama) {
    const c = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(datos.idCama));
    pid = String((c && c.PATIENT_ID) || '');
  }
  const serie = evalDelEpisodio(pid).map(function (e, i, arr) {
    // El ordinal se DERIVA (1ª, 2ª, 3ª): nunca se guarda. Así «MRC a los 7
    // días» es una alerta y no un candado (Diego, 10-sep).
    const n = arr.slice(0, i + 1).filter(function (x) { return x.ESCALA === e.ESCALA; }).length;
    return { id: e.ID_EVAL, escala: e.ESCALA, total: e.TOTAL, fecha: e.FECHA, turno: e.TURNO,
             firma: e.FIRMA, origen: e.ORIGEN, n: n, items: e.ITEMS_JSON || '' };
  });
  return ok({ patientId: pid, serie: serie });
}

/**
 * episodioEscala — ECF, Barthel o Charlson escritos DIRECTO al episodio desde
 * la tarjeta, sin abrir la evolución. Se corrige encima: no hay historial
 * porque el dato describe el estado PREVIO a la UCI (Diego, 11-sep).
 * datos: { idCama, escala:'ECF'|'BARTHEL'|'CHARLSON', valor, items?, firma? }
 */
function episodioEscala(datos, ctx) {
  ctx = ctx || {};
  datos = datos || {};
  const idCama = String(datos.idCama || '').trim();
  const escala = _evalEscala(datos.escala);
  const col = EPISODIO_ESCALAS[escala];
  if (!idCama) return err('Falta la cama.', ERR.VALIDACION);
  if (!col) return err('Escala del episodio desconocida: ' + escala, ERR.VALIDACION);
  const valor = String(datos.valor == null ? '' : datos.valor).trim();
  if (valor === '') return err('Falta el valor de ' + escala + '.', ERR.VALIDACION);
  const n = parseInt(valor, 10);
  if (escala === 'BARTHEL' && (isNaN(n) || n < 0 || n > 100 || n % 5 !== 0)) return err('Barthel inválido: ' + valor, ERR.VALIDACION);
  if (escala === 'ECF' && (isNaN(n) || n < 1 || n > 9)) return err('ECF fuera de 1-9: ' + valor, ERR.VALIDACION);
  if (escala === 'CHARLSON' && (isNaN(n) || n < 0 || n > 37)) return err('Charlson fuera de 0-37: ' + valor, ERR.VALIDACION);

  return conLock(() => {
    try {
      const cama = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
      if (!cama) return err('No existe la cama ' + idCama + '.', ERR.VALIDACION);
      if (!esVerdadero(cama.OCUPADA) || !cama.PATIENT_ID) return err('La cama ' + idCama + ' no tiene paciente ingresado.', ERR.VALIDACION);
      let firma = String(datos.firma || ctx.firma || '').trim();
      if (firma.length > 15 || /\n/.test(firma)) firma = '';
      const antes = String(cama[col] == null ? '' : cama[col]);
      const campos = {}; campos[col] = valor;
      // Los ítems de la calculadora también viven en la cama cuando existen
      // (BARTHEL_JSON/CHARLSON_JSON son de EVOLUCIONES; aquí se guardan en el
      // hito para no abrir columnas nuevas por esto).
      repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, campos);
      let items = datos.items != null ? datos.items : '';
      if (items && typeof items !== 'string') { try { items = JSON.stringify(items); } catch (e) { items = ''; } }
      _agregarHitoInternoSinSync({
        idCama: idCama, patientId: cama.PATIENT_ID, tipo: 'evaluacion',
        texto: '📐 ' + ({ ECF: 'ECF', BARTHEL: 'Barthel', CHARLSON: 'Charlson' })[escala] + ' ' + valor +
               (antes !== '' && antes !== valor ? ' (corrige ' + antes + ')' : '') + (firma ? ' (' + firma + ')' : ''),
        autor: firma, autorEmail: ctx.email || '',
        datos: { escala: escala, valor: valor, antes: antes, firma: firma, items: items || '' },
      });
      _sincronizarTimelineCama(idCama);
      SpreadsheetApp.flush();
      return ok({ entidad: 'CAMAS_ESTADO', accion: 'escala ' + escala, idCama: idCama, valor: valor, antes: antes, firma: firma });
    } catch (e) { return err('episodioEscala: ' + e.message); }
  });
}

/**
 * Enganche desde guardarEvolucion (sin lock): lo que el turno MIDIÓ pasa a la
 * serie con la firma del turno. Solo lo que viene con valor: el turno no
 * hereda evaluaciones (se recargan solo si EVAL_FECHA es hoy), así que un
 * valor presente es una medición de este turno.
 */
function _evalDesdeEvolucion(evo, idCama, idEvolucion, ctx) {
  const firma = String(evo.PLAN_FIRMA_KINE || (ctx && ctx.firma) || '');
  const fecha = String(evo.FECHA || hoyISO());
  const turno = String(evo.TURNO || 'Dia');
  const hechas = [];
  const vale = function (x) { return x !== '' && x != null; };
  const pares = [
    ['MRC', evo.EVAL_T_MRC, { D: [evo.EVAL_MRC_D1, evo.EVAL_MRC_D2, evo.EVAL_MRC_D3, evo.EVAL_MRC_D4, evo.EVAL_MRC_D5, evo.EVAL_MRC_D6],
                              I: [evo.EVAL_MRC_I1, evo.EVAL_MRC_I2, evo.EVAL_MRC_I3, evo.EVAL_MRC_I4, evo.EVAL_MRC_I5, evo.EVAL_MRC_I6] }],
    ['FSS', evo.EVAL_T_FSS, [evo.EVAL_FSS_IT1, evo.EVAL_FSS_IT2, evo.EVAL_FSS_IT3, evo.EVAL_FSS_IT4, evo.EVAL_FSS_IT5]],
    ['CPAX', evo.CPAX_TOTAL, [evo.CPAX_IT1, evo.CPAX_IT2, evo.CPAX_IT3, evo.CPAX_IT4, evo.CPAX_IT5, evo.CPAX_IT6, evo.CPAX_IT7, evo.CPAX_IT8, evo.CPAX_IT9, evo.CPAX_IT10]],
    ['PIM', evo.EVAL_T_PIM, null], ['PEM', evo.EVAL_T_PEM, null], ['FEM', evo.EVAL_T_FEM, null],
    ['DINAMO', evo.EVAL_T_DINAMO, null],
    ['ECO', evo.EVAL_T_GROSOR, { cuadD: evo.EVAL_T_CUAD_D, cuadI: evo.EVAL_T_CUAD_I, heckmatt: evo.EVAL_T_HECKMATT, fedD: evo.EVAL_T_FED_D, fedI: evo.EVAL_T_FED_I, excD: evo.EVAL_T_EXC_D, excI: evo.EVAL_T_EXC_I, hallazgos: evo.EVAL_T_HALLAZGOS }],
    ['DEGLUCION', evo.EVAL_DEGLUCION, null],
  ];
  pares.forEach(function (p) {
    if (!vale(p[1])) return;
    // ¿Ya está esta misma medición en la serie (re-guardado del mismo turno)?
    const ya = repoLeerTodos('EVALUACIONES', 'ID_EVOLUCION', String(idEvolucion))
      .some(function (e) { return e.ESCALA === p[0] && !esVerdadero(e.ANULADA) && String(e.TOTAL) === String(p[1]); });
    if (ya) return;
    const r = _evalRegistrarInterno({ idCama: idCama, escala: p[0], total: p[1], items: p[2], firma: firma,
                                      fecha: fecha, turno: turno, origen: 'turno', idEvolucion: idEvolucion }, ctx);
    if (r && !r.error) hechas.push(p[0]);
  });
  return hechas;
}
