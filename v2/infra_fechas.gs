/**
 * infra_fechas.gs — Fechas y tiempos en la zona horaria del sistema.
 * La TZ se lee de CONFIG.TIMEZONE (default America/Santiago) vía _tz() de esquema.gs.
 * Las fechas se manejan como texto ISO "yyyy-MM-dd" y se comparan por string.
 */

function hoyISO() {
  return Utilities.formatDate(new Date(), _tz(), 'yyyy-MM-dd');
}

function ahoraTS() {
  return Utilities.formatDate(new Date(), _tz(), 'yyyy-MM-dd HH:mm:ss');
}

/** Normaliza un valor de celda (Date o string) a "yyyy-MM-dd". */
function aISO(v) {
  if (v instanceof Date) return Utilities.formatDate(v, _tz(), 'yyyy-MM-dd');
  const s = String(v == null ? '' : v).trim();
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s;
}

/** Días completos entre dos fechas ISO (>=0). */
function diasEntre(desdeISO, hastaISO) {
  if (!desdeISO || !hastaISO) return 0;
  try {
    const d1 = new Date(String(desdeISO).slice(0, 10) + 'T00:00:00');
    const d2 = new Date(String(hastaISO).slice(0, 10) + 'T00:00:00');
    const diff = d2 - d1;
    return diff < 0 ? 0 : Math.floor(diff / 86400000);
  } catch (e) { return 0; }
}
