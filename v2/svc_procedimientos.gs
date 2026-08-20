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
