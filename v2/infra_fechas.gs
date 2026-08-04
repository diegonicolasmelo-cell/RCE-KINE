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

/** Hora actual "HH:mm". Se deriva de ahoraTS() para que exista UNA sola
    fuente de reloj (los arneses y la simulación la sustituyen). */
function _horaAhora() {
  const h = String(ahoraTS()).slice(11, 16);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(h) ? h : '00:00';
}

/** Momento actual como 'yyyy-MM-dd HH:mm'. */
function _tsAhora() {
  return hoyISO() + ' ' + _horaAhora();
}

/**
 * Momento a partir de una hora escrita a mano: se asume la ocurrencia MÁS
 * RECIENTE de esa hora (hoy si ya pasó, ayer si todavía no). Así, anotar
 * «02:00» a las 05:00 de la madrugada apunta a hace 3 h, y «23:00» a anoche.
 */
function _tsDesdeHora(hora) {
  const h = _horaValida(hora);
  if (!h) return '';
  const hoy = hoyISO(), ahora = _horaAhora();
  if (h <= ahora) return hoy + ' ' + h;
  const d = new Date(hoy + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10) + ' ' + h;
}

/** Parte fecha / hora de un momento 'yyyy-MM-dd HH:mm'. */
function _tsFecha(ts) { return String(ts || '').slice(0, 10); }
function _tsHora(ts)  { return _horaValida(String(ts || '').slice(11, 16)); }

/** Normaliza una hora a "HH:mm"; devuelve '' si no es una hora válida. */
function _horaValida(h) {
  const s = String(h == null ? '' : h).trim().slice(0, 5);
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s) ? s : '';
}

/**
 * Días completos por BLOQUES DE 24 HORAS (ago-2026, pedido de Diego: «un
 * paciente que llegó hace un par de horas no puede aparecer con día 1»).
 * Cuenta cuántos bloques de 24 h transcurrieron entre el inicio (fecha+hora)
 * y el momento de referencia. SIN hora de inicio cae al conteo por días
 * calendario de siempre, para no alterar lo ya registrado.
 * Es el mismo criterio del sistema del hospital.
 */
function diasBloques24(desdeTS, fechaCal, hastaISO, hastaHora) {
  // desdeTS: momento real 'yyyy-MM-dd HH:mm'. Si no hay (episodios antiguos),
  // se cuenta por días calendario desde fechaCal, como siempre.
  const desdeISO = _tsFecha(desdeTS), desdeHora = _tsHora(desdeTS);
  if (!desdeISO || !desdeHora) return (fechaCal && hastaISO) ? diasEntre(fechaCal, hastaISO) : 0;
  if (!hastaISO) return 0;
  try {
    const t = function (f, h) {
      const hh = String(h || '00:00').slice(0, 5);
      return new Date(String(f).slice(0, 10) + 'T' + (/^\d{2}:\d{2}$/.test(hh) ? hh : '00:00') + ':00');
    };
    const diff = t(hastaISO, hastaHora || '00:00') - t(desdeISO, desdeHora);
    return diff < 0 ? 0 : Math.floor(diff / 86400000);
  } catch (e) { return diasEntre(desdeISO, hastaISO); }
}

/**
 * Fecha EFECTIVA de un turno: la Noche fecha al día siguiente.
 *
 * El turno de noche transcurre casi entero pasada la medianoche, así que lo
 * que ocurre en él pertenece al día siguiente. Lo usan los relojes de
 * dispositivos (v5.20, «la noche del 31 se anota con el 01») y, desde ago-2026,
 * también los DÍAS DE ESTADÍA / VM / VA: manda la lista oficial del hospital
 * (BUDA), que se actualiza al cambiar el calendario.
 *
 * Vivía en svc_eventos.gs; se mudó aquí al necesitarla svc_evoluciones,
 * svc_entrega y mantenimiento_manuel — es un helper de fechas, no de eventos.
 */
function _fechaEfectivaTurno(fecha, turno) {
  const f = String(fecha || '').slice(0, 10);
  if (String(turno) !== 'Noche') return f;
  const d = new Date(f + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Momento de referencia de un TURNO para contar los bloques de 24 h: la
 * mitad del turno (Día 09-21 → 15:00; Noche 21-09 → 03:00 del día siguiente).
 * Es determinista: re-editar una evolución no cambia sus días.
 */
function refTurno(fechaISO, turno) {
  const f = String(fechaISO || '').slice(0, 10);
  if (String(turno) === 'Noche') {
    const d = new Date(f + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    return { fecha: d.toISOString().slice(0, 10), hora: '03:00' };
  }
  return { fecha: f, hora: '15:00' };
}

/** Fecha ISO menos N días (para plegar "días previos" en el ancla de un contador). */
function _restarDias(fechaISO, n) {
  try {
    const d = new Date(String(fechaISO).slice(0, 10) + 'T00:00:00');
    d.setDate(d.getDate() - (parseInt(n) || 0));
    return Utilities.formatDate(d, _tz(), 'yyyy-MM-dd');
  } catch (e) { return fechaISO; }
}

/**
 * Momento REAL de un evento anotado con hora dentro de un turno.
 * El turno Noche cruza la medianoche: 20:00 es del día del turno y 03:00 ya es
 * del día siguiente. Sin hora escrita cae a la referencia del turno.
 * Devuelve 'yyyy-MM-dd HH:mm'.
 */
function _tsEventoTurno(fecha, turno, hora) {
  var f = String(fecha || '').slice(0, 10);
  if (!f) return '';
  var h = _horaValida(hora);
  if (!h) { var r = refTurno(f, turno); return r.fecha + ' ' + r.hora; }
  if (String(turno) === 'Noche' && parseInt(h.slice(0, 2), 10) < 12) f = _restarDias(f, -1);
  return f + ' ' + h;
}

/** 'yyyy-MM-dd HH:mm' → milisegundos (sin depender del parser de cada motor). */
function _msDeTS(ts) {
  var m = String(ts || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

/** Horas entre dos marcas 'yyyy-MM-dd HH:mm' (1 decimal). '' si no se puede. */
function _horasEntreTS(desde, hasta) {
  var a = _msDeTS(desde), b = _msDeTS(hasta);
  if (a === null || b === null || b < a) return '';
  return Math.round((b - a) / 36e5 * 10) / 10;
}
