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

/**
 * NOVEDADES — el resumen que lee el EQUIPO cuando la app se actualiza (Diego,
 * 6-sep-2026: «que en las novedades de actualización salga un resumen de la
 * actualización para los colegas, algo simple»).
 *
 * 🔴 CÓMO SE ESCRIBE UNA ENTRADA, que no es un changelog:
 *  1. Va la clave del sello COMPLETO, y resume **todo lo que el equipo verá
 *     distinto al pasar a esa versión**, no solo lo que cambió en ella. El
 *     servidor solo ve el sello que arranca: si se publica saltando de la
 *     6.04 a la 6.11, las entradas del medio NUNCA se registran, así que la
 *     de la 6.11 tiene que contar la tanda entera.
 *  2. En palabras de la unidad, no del código: qué botón apretar y qué pasa.
 *     Nada de nombres de función, hojas ni versiones internas.
 *  3. Pocas líneas. Lo que no cabe en cuatro, no es una novedad: es un
 *     manual, y ese vive en la pestaña de documentación.
 *  4. Una línea por cambio, con su emoji de la interfaz (≤2019: el Chrome del
 *     hospital no dibuja los nuevos).
 * Un sello sin entrada no es un error: sale el aviso escueto de siempre.
 */
const NOVEDADES = {
  '6.26-ingreso-manual-vm-horas': [
    '📅 Al ingresar un paciente ahora se escriben la FECHA y la HORA de ingreso (vienen sugeridas con el momento actual): de ahí salen los días.',
    '⏱️ Los días de VM se cuentan por bloques de 24 horas desde la hora de ingreso (si llegó ventilado) o desde la hora de intubación.',
    '🖨️ La hoja del día trae la fecha y la hora de ingreso en el encabezado: si un contador saliera mal, se recalcula a mano.',
    '🎊 Del 16 al 20 de septiembre don Mauri se pone de huaso: celebra en la pantalla de carga y juega al emboque abajo a la derecha.',
  ],
  '6.24-mauri-sin-suelo': [
    '🎊 Del 16 al 20 de septiembre don Mauri se pone de huaso: celebra en la pantalla de carga y juega al emboque abajo a la derecha.',
    '🧪 En la tarjeta del paciente hay un botón nuevo con el logo de cobas: copia el RUT y abre el laboratorio, para no tener que teclearlo.',
    '🧪 Los gases de la mañana se copian solos desde los PDF del laboratorio y salen en la hoja del día, sin pasarlos a mano.',
    '📥 El que no se pudo emparejar queda en «Sin emparejar», al lado del botón de importar: se le elige la cama y listo.',
    '🖨️ La hoja del día trae el gas de la mañana, con Hb, Hto y K⁺ en observaciones y el último cultivo con su resultado.',
    '🩺 La auscultación ya no pierde ruidos: si anotas más de uno, la evolución los nombra todos. Antes escribía solo el primero.',
    '📋 Las plantillas de evolución quedan apagadas por ahora: el texto vuelve a ser el de siempre mientras coordinación las termina de armar.',
  ],
};

/** «Se publicó la vX.Y» — el cliente manda su sello en el boot y la primera
 *  vez que el servidor lo ve, queda registrado. Las siguientes, ya existe.
 *  Con resumen escrito (NOVEDADES) el aviso lo lleva; sin él, va escueto. */
function notifVersionVista(version) {
  const v = String(version || '').trim();
  if (!v || v.length > 60) return;
  const lineas = NOVEDADES[v];
  notifRegistrar({ tipo: 'version', origenId: 'v:' + v,
    titulo: lineas ? ('🚀 Novedades de la versión ' + v.split('-')[0]) : ('🚀 Se publicó la versión ' + v),
    detalle: lineas ? lineas.join('\n') : '' });
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
        // Pendientes de la PRIMERA medición (Diego, 5-sep-2026): cooperador
        // sin MRC/FSS es el olvido real — al no cooperador no se le alerta
        // (no es olvido: no se puede evaluar; su motivo va en tarjeta y
        // entrega, no en la campana).
        [['MRC-ss', c.ULT_MRC], ['FSS-ICU', c.ULT_FSS]].forEach(function (e) {
          if (e[1] !== '' && e[1] != null) return;
          alertas.push({ nivel: 'ambar', icono: '📋', cama: idCama, ir: 'cama',
            titulo: e[0] + ' pendiente',
            detalle: 'paciente cooperador sin medición en el episodio — evaluable desde ya' });
        });
        [['MRC-ss', c.ULT_MRC, c.ULT_MRC_FECHA], ['FSS-ICU', c.ULT_FSS, c.ULT_FSS_FECHA]].forEach(function (e) {
          if (e[1] === '' || e[1] == null || !e[2]) return;
          const f = String(e[2]).slice(0, 10);
          const edad = Math.round((new Date(ref) - new Date(f)) / 864e5);
          if (edad > cut) alertas.push({ nivel: 'ambar', icono: '📋', cama: idCama, ir: 'cama',
            titulo: e[0] + ' sin re-evaluar (hace ' + edad + ' días)',
            detalle: 'última ' + e[1] + ' el ' + dd(f) });
        });
      }

      /* ── Pendiente medir pimometría (Diego, 5-sep-2026): paciente en VM,
         modo espontáneo (CPAP/PS — así se llama aquí, no «PSV»), con soporte
         bajo que no logra bajar más. «Prolongado» tiene DOS caminos, ambos de
         la literatura: destete prolongado (Boles 2007 / WIND: ≥3 PVE
         fracasadas o más de 7 días desde la primera — espejo de _weanClase
         del cliente) o VM larga por días (NAMDRC 2005: ≥21 días, editable en
         CONFIG PIMO_VM_DIAS). El porqué clínico, textual de Diego: «nos
         orienta a saber por qué no se está pudiendo disminuir el soporte y si
         requiere algún tipo de rehabilitación pulmonar». Se apaga sola al
         registrar la Pimáx (fPIM) en el episodio. ── */
      if (String(c.SOPORTE) === 'VM' && String(c.MODO) === 'CPAP/PS' &&
          (c.ULT_PIM === '' || c.ULT_PIM == null)) {
        const ps = parseFloat(c.ULT_PS);
        const psMax = parseFloat(leerConfig('PIMO_PS_MAX', '14')) || 14;
        if (!isNaN(ps) && ps < psMax) {
          const wc = _weanClaseSrv(c.WEAN_PVE_JSON, ref);
          const vmDias = c.FECHA_INICIO_SOPORTE
            ? Math.max(0, Math.round((new Date(ref) - new Date(_statISO(c.FECHA_INICIO_SOPORTE))) / 864e5)) : 0;
          const vmCorte = parseInt(leerConfig('PIMO_VM_DIAS', '21'), 10) || 21;
          const motivo = (wc && wc.clase === 'prolongado')
            ? 'destete prolongado: ' + (wc.frustras >= 3 ? wc.frustras + ' PVE fracasadas' : wc.dias + ' días desde la primera PVE')
            : (vmDias >= vmCorte ? 'VM prolongada: ' + vmDias + ' días' : '');
          if (motivo) alertas.push({ nivel: 'ambar', icono: '🫁', cama: idCama, ir: 'cama',
            titulo: 'Pendiente medir pimometría (soporte ' + ps + ' cmH2O)',
            detalle: motivo + ' — orienta por qué no baja el soporte y si requiere rehabilitación pulmonar' });
        }
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

    // ── Cama que rotó SIN alta: quedan evoluciones del anterior en la hoja viva ──
    // (v5.99, auditoría R1). Desde la v5.99 el guardado ya no las pisa, pero
    // siguen colgando de la cama hasta que alguien dé el alta pendiente o
    // corra repararEvolucionesAjenas. Se avisa por cama, con el conteo.
    try {
      const ajenas = {};
      repoLeerColumnasConFila('EVOLUCIONES', ['ID_CAMA', 'PATIENT_ID']).forEach(function (f) {
        const e = f.obj;
        const c = camas.filter(function (x) { return String(x.ID_CAMA) === String(e.ID_CAMA); })[0];
        const pe = String(e.PATIENT_ID || ''), pc = c ? String(c.PATIENT_ID || '') : '';
        if (!c || !pc || !pe || pe === pc) return;
        ajenas[String(e.ID_CAMA)] = (ajenas[String(e.ID_CAMA)] || 0) + 1;
      });
      Object.keys(ajenas).forEach(function (idCama) {
        alertas.push({ nivel: 'ambar', icono: '🛏️', cama: idCama, ir: 'cama',
          titulo: 'Evoluciones de un paciente anterior sin archivar (' + ajenas[idCama] + ')',
          detalle: 'la cama rotó sin dar el alta — dar el alta pendiente o correr repararEvolucionesAjenas' });
      });
    } catch (e) { /* sin esta lectura la campana sigue */ }

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

/** Espejo EXACTO de _weanClase del cliente (index, Boles 2007 / WIND):
 *  prolongado = 3 o más PVE fracasadas, o más de 7 días desde la primera PVE;
 *  difícil = al menos una fracasada. Si cambias la regla, cámbiala en los dos
 *  lados — la guardia buzon_campana fija este espejo. */
function _weanClaseSrv(json, fechaRef) {
  let w = {};
  try { w = JSON.parse(json || '{}') || {}; } catch (e) { return null; }
  const ks = Object.keys(w).sort();
  if (!ks.length) return null;
  const primer = ks[0].slice(0, 10);
  const frustras = ks.filter(function (k) { return w[k] === 'frustra'; }).length;
  const ms = new Date(String(fechaRef).slice(0, 10)) - new Date(primer);
  const d = ms < 0 ? 0 : Math.floor(ms / 864e5);
  const clase = (frustras >= 3 || d > 7) ? 'prolongado' : (frustras >= 1 ? 'dificil' : '');
  return clase ? { clase: clase, frustras: frustras, dias: d, primerPve: primer } : null;
}

/** 📣 Aviso de coordinación al buzón del equipo (v5.96; Diego, 5-sep-2026:
 *  «el aviso de coordinación, el buzón: prográmalo»). El candado vive AQUÍ,
 *  en el servidor: con AUTH_DEV_MODE=TRUE cualquiera con el enlace llega al
 *  dispatcher, así que la acción vuelve a exigir la sesión de coordinación
 *  (misma regla de todas las COORD_*). El registro es de solo agregar. */
function coordAviso(datos) {
  try {
    const ses = coordExigirSesion(String((datos && datos.token) || ''));
    if (!ses.ok) return err(ses.error || 'Publicar un aviso requiere sesión de coordinación: entra en la pestaña 🔐 y vuelve a intentarlo.', ERR.NO_AUTORIZADO);
    const texto = String((datos && datos.texto) || '').trim();
    if (!texto) return err('Escribe el aviso antes de publicarlo.', ERR.VALIDACION);
    if (texto.length > 500) return err('El aviso es muy largo (máximo 500 caracteres).', ERR.VALIDACION);
    const id = notifRegistrar({ tipo: 'coord', titulo: '📣 Aviso de coordinación', detalle: texto, autor: String(ses.firma || '') });
    return id ? ok({ id: id }) : err('No se pudo registrar el aviso.', ERR.INTERNO);
  } catch (e) { return err('coordAviso: ' + e.message, ERR.INTERNO, e); }
}
