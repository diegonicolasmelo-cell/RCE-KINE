/**
 * infra_log.gs — Auditoría. Registra cada acción de escritura en AUDIT_LOG.
 * La identidad (email) proviene del token GIS verificado (infra_auth.gs), no de getActiveUser().
 */

function auditar(a) {
  try {
    a = a || {};
    repoInsertar('AUDIT_LOG', {
      ID:            'AUD_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7).toUpperCase(),
      TIMESTAMP:     ahoraTS(),
      USUARIO_EMAIL: a.email     || '',
      FIRMA:         a.firma     || '',
      ACCION:        a.accion    || '',
      ENTIDAD:       a.entidad   || '',
      ID_ENTIDAD:    a.idEntidad || '',
      PATIENT_ID:    a.patientId || '',
      RESUMEN:       a.resumen   || '',
    });
  } catch (e) {
    // La auditoría nunca debe romper la operación principal.
    console.warn('auditar:', e.message);
  }
}
