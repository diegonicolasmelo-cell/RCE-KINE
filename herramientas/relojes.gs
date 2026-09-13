// relojes.gs — pegar como ARCHIVO NUEVO en el editor (➕ → Secuencia de comandos → nombre «relojes»).
// Solo lectura. Selecciona tablaRelojes en el selector de funciones y ▶ Ejecutar; la tabla sale en el registro.
// Sin nombres ni RUT. Se puede borrar después.

/**
 * tablaRelojes — LAS DOS FECHAS DE CADA CAMA, para cotejar con el otro
 * programa (Diego, 11-sep-2026: «si calculas fecha de ingreso y actual para
 * cada paciente, ¿podrías darme las 2 fechas?»). Solo lectura. Por cama:
 * ingreso (fecha y hora), el momento de hoy, la estadía contada por
 * CALENDARIO (como BUDA) y por bloques de 24 h, y lo mismo para la VM desde
 * su reloj (hora de ingreso si llegó ventilado, hora de intubación si no).
 * 🔒 Sin nombres ni RUT: la salida se puede copiar tal cual.
 * Ejecutar desde el editor y leer el registro.
 */
function tablaRelojes() {
  const hoy = hoyISO(), ahora = _tsAhora();
  const camas = repoLeerTodos('CAMAS_ESTADO')
    .filter(function (c) { return esVerdadero(c.OCUPADA); })
    .sort(function (a, b) { return (parseInt(a.ID_CAMA, 10) || 0) - (parseInt(b.ID_CAMA, 10) || 0); });
  const pad = function (x, n) { x = String(x == null ? '' : x); while (x.length < n) x += ' '; return x; };
  const bloques = function (ts) { const h = _horasEntreTS(ts, ahora); return h === '' ? '—' : Math.floor(h / 24); };
  const L = ['📅 TABLA DE RELOJES · hoy ' + ahora + '   (' + camas.length + ' camas ocupadas; sin nombres ni RUT)', '',
    pad('cama', 5) + pad('VA', 10) + pad('soporte', 16) + pad('INGRESO (fecha hora)', 22) + pad('estadía cal.', 14) + pad('estadía 24h', 13) +
    pad('INICIO VM (fecha hora)', 24) + pad('VM cal.', 9) + 'VM 24h'];
  camas.forEach(function (c) {
    const ing = String(c.TS_INGRESO || c.FECHA_INGRESO || '—');
    const esVM = String(c.SOPORTE) === 'VM';
    const vmIni = esVM ? String(c.TS_INICIO_SOPORTE || c.FECHA_INICIO_SOPORTE || '—') : '—';
    L.push(pad(c.ID_CAMA, 5) + pad(c.VIA_AEREA || '—', 10) + pad(c.SOPORTE || '—', 16) + pad(ing, 22) +
      pad(c.FECHA_INGRESO ? diasEntre(c.FECHA_INGRESO, hoy) : '—', 14) + pad(c.TS_INGRESO ? bloques(c.TS_INGRESO) : '—', 13) +
      pad(vmIni, 24) + pad(esVM && c.FECHA_INICIO_SOPORTE ? diasEntre(c.FECHA_INICIO_SOPORTE, hoy) : '—', 9) +
      (esVM && c.TS_INICIO_SOPORTE ? bloques(c.TS_INICIO_SOPORTE) : '—'));
  });
  L.push('', 'cal. = días de calendario (ingreso = día 0, como BUDA) · 24h = bloques completos de 24 horas desde la hora registrada.');
  const txt = L.join('\n');
  Logger.log(txt);
  return txt;
}

