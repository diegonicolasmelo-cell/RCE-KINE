/**
 * svc_notificaciones.gs — El buzón 📨 y la campana 🔔 (v5.91, 4-sep-2026).
 *
 * Reparto aprobado por Diego el 4-sep:
 *  · CAMPANA (alertasUnidad): lo que la app DETECTA de los datos y exige
 *    acción. No inventa detección nueva — junta lo que ya se calculaba
 *    regado por las vistas (dispositivos vencidos, evaluaciones envejecidas,
 *    VM sin ventilador, mantención, cierre de año). Es cálculo EN VIVO: no
 *    se guarda ni lleva «leído» — al resolverse, desaparece sola.
 *  · BUZÓN (hoja NOTIFICACIONES): lo que una PERSONA quiere contarle al
 *    equipo. Día uno: notas 📌 del turno + avisos de versión (los
 *    cumpleaños los deriva el cliente del GET_BOOT, no se guardan).
 *
 * 🔴 REGLA DE DIEGO (4-sep, textual: «OJO cómo se registra para después
 * consultar y que la información perdure si se cambia y no pise nada de lo
 * anterior»): la hoja NOTIFICACIONES es DE SOLO AGREGAR. Nada se edita ni
 * se borra desde el código. Si una nota se re-guarda idéntica, no se
 * duplica; si se re-guarda CAMBIADA, se agrega una fila nueva y la versión
 * anterior QUEDA — el historial completo es consultable para siempre.
 * (La TIMELINE reemplaza el hito de la nota al re-guardar; este registro es
 * justamente la memoria que aquello no conserva.)
 */

/** Agrega una notificación al registro. Devuelve el ID o null si era idéntica. */
function notifRegistrar(n) {
  try {
    const tipo = String((n && n.tipo) || '').trim();
    const titulo = String((n && n.titulo) || '').trim();
    if (!tipo || !titulo) return null;
    const detalle = String((n && n.detalle) || '').trim();
    const origen = String((n && n.origenId) || '').trim();
    if (origen) {
      const previas = repoLeerTodos('NOTIFICACIONES')
        .filter(function (x) { return String(x.TIPO) === tipo && String(x.ORIGEN_ID) === origen; });
      // Idéntica a una existente → no se duplica. Distinta → SE AGREGA
      // (y la anterior queda: regla de solo-agregar, nunca pisar).
      if (previas.some(function (x) { return String(x.TITULO) === titulo && String(x.DETALLE) === detalle; })) return null;
    }
    const fila = {
      ID_NOTIF: uid('ntf'), TS: ahoraTS(), FECHA: hoyISO(), TIPO: tipo,
      TITULO: titulo, DETALLE: detalle, REF_CAMA: String((n && n.refCama) || ''),
      AUTOR: String((n && n.autor) || ''), ORIGEN_ID: origen,
    };
    repoInsertar('NOTIFICACIONES', fila);
    return fila.ID_NOTIF;
  } catch (e) { return null; }
}

/** Las últimas notificaciones, de la más nueva a la más vieja. */
function notifListar(datos) {
  try {
    const lim = Math.min(parseInt((datos && datos.limite) || 60, 10) || 60, 200);
    const filas = repoLeerTodos('NOTIFICACIONES')
      .sort(function (a, b) { return String(b.TS).localeCompare(String(a.TS)); })
      .slice(0, lim);
    return ok({ notifs: filas });
  } catch (e) { return err('notifListar: ' + e.message, ERR.INTERNO, e); }
}

/** «Se publicó la vX.Y» — el cliente manda su sello en el boot y la primera
 *  vez que el servidor lo ve, queda registrado. Las siguientes, ya existe. */
function notifVersionVista(version) {
  const v = String(version || '').trim();
  if (!v || v.length > 60) return;
  notifRegistrar({ tipo: 'version', titulo: '🚀 Se publicó la versión ' + v, origenId: 'v:' + v });
}

/**
 * La campana: TODAS las alertas activas de la unidad, calculadas en vivo.
 * Formato de cada fila fijado por Diego (4-sep): «HME vencido (fecha en que
 * vence) · cama 7 · rótulo 31-08», con su «Ir a…». nivel: rojo|ambar.
 */
function alertasUnidad(fecha) {
  const ref = String(fecha || hoyISO()).slice(0, 10);
  const dd = function (iso) { return iso ? String(iso).slice(8, 10) + '-' + String(iso).slice(5, 7) : ''; };
  const alertas = [];
  try {
    const camas = repoLeerTodos('CAMAS_ESTADO').filter(function (c) { return esVerdadero(c.OCUPADA); });
    const nomDisp = { hme: 'HME', hepa: 'Filtro HEPA', tc: 'Trach Care' };

    camas.forEach(function (c) {
      const idCama = String(c.ID_CAMA);

      // ── Dispositivos VENCIDOS (los «vence hoy» viven en Cambios de esta noche) ──
      estadoDispositivos(c, ref).forEach(function (x) {
        if (!x.aplica || !x.vence) return;
        // «Fecha en que vence» = la noche en que tocaba: etiqueta + frec - 1.
        const vencio = _sumarDiasISO(x.fecha, x.frec - 1);
        alertas.push({ nivel: 'rojo', icono: x.icono || '🏷️', cama: idCama, ir: 'cama',
          titulo: (nomDisp[x.k] || x.nombre) + ' vencido (' + dd(vencio) + ')',
          detalle: 'rótulo ' + dd(x.fecha) });
      });

      // ── Evaluaciones envejecidas: cooperador con MRC/FSS antigua ──
      // Mismo criterio del badge de la tarjeta (>EVAL_DIAS_ALERTA días).
      if (/^cooperador$/i.test(String(c.ULT_COOP || '').trim())) {
        const cut = parseInt(leerConfig('EVAL_DIAS_ALERTA', '5'), 10) || 5;
        [['MRC-ss', c.ULT_MRC, c.ULT_MRC_FECHA], ['FSS-ICU', c.ULT_FSS, c.ULT_FSS_FECHA]].forEach(function (e) {
          if (e[1] === '' || e[1] == null || !e[2]) return;
          const f = String(e[2]).slice(0, 10);
          const edad = Math.round((new Date(ref) - new Date(f)) / 864e5);
          if (edad > cut) alertas.push({ nivel: 'ambar', icono: '📋', cama: idCama, ir: 'cama',
            titulo: e[0] + ' sin re-evaluar (hace ' + edad + ' días)',
            detalle: 'última ' + e[1] + ' el ' + dd(f) });
        });
      }

      // ── Paciente en VM sin ventilador asignado en el tablero ──
      if (String(c.SOPORTE) === 'VM' && !_ventNombreDeCama(idCama)) {
        alertas.push({ nivel: 'rojo', icono: '🫁', cama: idCama, ir: 'tablero',
          titulo: 'Paciente en VM sin ventilador asignado',
          detalle: 'el tablero de equipos no tiene ninguno en esta cama' });
      }
    });

    // ── Mantención de ventiladores: vencida, o programada dentro de 7 días ──
    repoLeerTodos('VENTILADORES').forEach(function (x) {
      if (!esVerdadero(x.ACTIVO)) return;
      const prox = _statISO(x.FECHA_MANT_PROX);
      if (!prox) return;
      const d = Math.round((new Date(prox) - new Date(ref)) / 864e5);
      if (d < 0) alertas.push({ nivel: 'rojo', icono: '🛠️', cama: '', ir: 'tablero',
        titulo: 'Mantención vencida — ' + String(x.NOMBRE || 'equipo'),
        detalle: 'programada para el ' + dd(prox) + ' (hace ' + Math.abs(d) + ' días)' });
      else if (d <= 7) alertas.push({ nivel: 'ambar', icono: '🛠️', cama: '', ir: 'tablero',
        titulo: 'Mantención por vencer — ' + String(x.NOMBRE || 'equipo'),
        detalle: (d === 0 ? 'programada para HOY' : 'programada para el ' + dd(prox) + ' (en ' + d + ' días)') });
    });

    // ── Cierre de año pendiente (26-dic a febrero, si queda por trasladar) ──
    try {
      const ci = (typeof avisoCierreAnio === 'function') ? avisoCierreAnio() : null;
      if (ci) alertas.push({ nivel: 'ambar', icono: '🗓️', cama: '', ir: '',
        titulo: 'Cierre de año pendiente',
        detalle: String(ci.texto || ci.mensaje || 'quedan evoluciones del año anterior por archivar') });
    } catch (e) { /* el aviso nunca tumba la campana */ }

    // Rojas primero, y dentro de cada nivel por cama.
    alertas.sort(function (a, b) {
      if (a.nivel !== b.nivel) return a.nivel === 'rojo' ? -1 : 1;
      return (parseInt(a.cama) || 99) - (parseInt(b.cama) || 99);
    });
  } catch (e) { /* una campana rota no puede tumbar el boot */ }
  return alertas;
}
