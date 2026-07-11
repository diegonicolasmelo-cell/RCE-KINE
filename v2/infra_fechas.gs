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

/** Fecha ISO menos N días (para plegar "días previos" en el ancla de un contador). */
function _restarDias(fechaISO, n) {
  try {
    const d = new Date(String(fechaISO).slice(0, 10) + 'T00:00:00');
    d.setDate(d.getDate() - (parseInt(n) || 0));
    return Utilities.formatDate(d, _tz(), 'yyyy-MM-dd');
  } catch (e) { return fechaISO; }
}
