/**
 * svc_procedimientos.gs — Procedimientos por evolución (una fila por procedimiento).
 * Cada procedimiento es una unidad de actividad atribuible (ver PLAN_PROYECTO §11.0).
 */

// Versión interna SIN lock (se llama desde guardarEvolucion, que ya tiene el lock).
function _guardarProcedimientosInterno(idEvolucion, idCama, patientId, fecha, turno, lista, autorEmail) {
  // Reemplazar los del mismo turno (idempotente al re-guardar la evolución).
  repoEliminarDonde('PROCEDIMIENTOS', p => String(p.ID_EVOLUCION) === String(idEvolucion));
  if (!Array.isArray(lista)) return { cantidad: 0 };
  let n = 0;
  lista.forEach(nom => {
    const nombre = String(nom || '').trim();
    if (!nombre) return;
    repoInsertar('PROCEDIMIENTOS', {
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
    n++;
  });
  return { cantidad: n };
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
