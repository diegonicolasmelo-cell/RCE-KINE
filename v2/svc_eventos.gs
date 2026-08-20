/**
 * svc_eventos.gs — Eventos rápidos post-evolución + reloj de dispositivos.
 * (jul-2026, acordado con coordinación)
 *
 * «Pasé a las 16:30 y cambié el filtro»: anotar SIN abrir el panel completo.
 * Tipos: procedimiento (catálogo) · cambio de HME/HEPA/sonda de aspiración ·
 * resultado de cultivo · otro. Nada toca el TEXTO de la evolución: va a la
 * línea de tiempo, a la estadística (procedimientos) y al reloj de
 * dispositivos. Cualquier colega puede anotar (firma propia).
 *
 * Reloj de dispositivos (CAMAS_ESTADO.DISP_*_FECHA):
 *  - Frecuencias en CONFIG: HME 2 días · HEPA 3 · sonda 3.
 *  - FECHA EFECTIVA: el turno Noche fecha al día siguiente (el turno del 27
 *    termina el 28 — misma lógica de turnos de la plataforma).
 *  - El reloj parte al conectar a VM (dispositivos asumidos instalados ese
 *    día, DISP_CONFIRMADO=false hasta que el kine acepte o ajuste).
 *  - CADA DISPOSITIVO SIGUE A LO QUE LE DA SENTIDO, no todos al soporte VM
 *    (Diego, 14-ago-2026): el Trach Care va con la VÍA AÉREA artificial
 *    (TOT/TQT, esté o no en VM); el HME va con el circuito de gas (VM sin
 *    humidificación activa, o respirando por HME — modo HME con TOT/TQT); el
 *    HEPA va con el VENTILADOR (solo VM y solo si la cama tiene equipo
 *    asignado — sin ventilador no hay dónde ponerlo).
 *  - HEPA FIJO: los equipos de CONFIG HEPA_FIJO_EQUIPOS (por defecto PB y
 *    Avea) llevan filtro HEPA propio que se mantiene desde su instalación —
 *    la fecha se muestra como referencia y NUNCA entra al ciclo de cambio.
 *    La Vela y el resto siguen con el ciclo normal.
 */

const _EVENTO_DISPS = [
  { k: 'hme',   campo: 'DISP_HME_FECHA',   nombre: 'HME',                 icono: '🌫️', confKey: 'FREC_HME_DIAS',   frecDef: 2 },
  { k: 'hepa',  campo: 'DISP_HEPA_FECHA',  nombre: 'HEPA',                icono: '🛡️', confKey: 'FREC_HEPA_DIAS',  frecDef: 3 },
  { k: 'sonda', campo: 'DISP_TC_FECHA',    nombre: 'Sonda de aspiración', icono: '➿', confKey: 'FREC_SONDA_DIAS', frecDef: 3 },
];

// _fechaEfectivaTurno() se mudó a infra_fechas.gs (ago-2026): es un helper de
// fechas puro y desde que los DÍAS DE ESTADÍA también lo usan lo necesitan
// svc_evoluciones, svc_entrega y mantenimiento_manuel. Dejarlo aquí obligaba a
// cada arnés a cargar svc_eventos entero para poder guardar una evolución.

/**
 * Estado del reloj de una cama respecto de una fecha de referencia.
 *
 * La fecha de ETIQUETA es el día 0 y `fechaCambio` = etiqueta + frecuencia. Ese
 * cambio se ejecuta en la MADRUGADA de esa fecha, o sea en el turno NOCHE de la
 * VÍSPERA: el turno noche del día D trabaja en la madrugada de D+1 — el mismo
 * mecanismo de «fecha efectiva» con que se etiqueta el dispositivo nuevo.
 *
 * 🪤 CORREGIDO EL 10-ago-2026 (reportado por Manuel desde el turno): el aviso
 * salía en el turno noche del día etiqueta+frec, o sea una noche TARDE, y el
 * error se acumulaba ciclo a ciclo. Se ve en la propia secuencia con que se
 * validó la regla anterior: HME cambiado en la noche del 06 → se etiqueta 07
 * (fecha efectiva = la madrugada en que se cambió) → volvía a pedirse la noche
 * del 09, o sea la madrugada del 10. Son TRES días de HME cuando el HME dura
 * DOS. Aquel ejemplo solo miraba el PRIMER ciclo (ingreso el 04 en turno día),
 * donde la etiqueta es un día real y no una madrugada, y ahí no se notaba.
 * La propiedad que hay que conservar: entre dos cambios pasan exactamente
 * `frec` días — la cubre `eventos.js` midiendo el intervalo, no memorizando
 * fechas.
 *   · cambiaEstaNoche: la madrugada que viene es la del cambio (dias===frec-1).
 *   · vence (vencido): esa madrugada pasó sin cambio (dias >= frec).
 *   · venceManana: el cambio es en la madrugada siguiente (dias === frec - 2).
 *   · fechaCambio: la fecha EXACTA del cambio (etiqueta + frec), para que la
 *     interfaz muestre fechas y no contadores de días.
 */
function estadoDispositivos(cama, fechaRef) {
  const ref = String(fechaRef || hoyISO()).slice(0, 10);
  const enVM = String(cama.SOPORTE) === 'VM';
  const va = String(cama.VIA_AEREA || '');
  const humid = !!_statISO(cama.DISP_HUMID_FECHA);
  const modoHME = String(cama.MODO) === 'HME';
  const ventNom = enVM ? _ventNombreDeCama(cama.ID_CAMA) : '';
  const hepaFija = !!ventNom && _hepaFijoEquipo(ventNom);
  return _EVENTO_DISPS.map(d => {
    const fecha = _statISO(cama[d.campo]);
    const frec = parseInt(leerConfig(d.confKey, String(d.frecDef))) || d.frecDef;
    const dias = fecha ? Math.round((new Date(ref) - new Date(fecha)) / 864e5) : null;
    // Regla por dispositivo (Diego, 14-ago-2026 — ver cabecera del archivo).
    let aplica, fija = false;
    if (d.k === 'hepa') { aplica = enVM && !!ventNom && !!fecha; fija = aplica && hepaFija; }
    else if (d.k === 'hme') { aplica = ((enVM && !humid) || modoHME) && !!fecha; }
    else { aplica = (va === 'TOT' || va === 'TQT') && !!fecha; }
    const cicla = aplica && !fija;   // el HEPA fijo se muestra pero no vence
    return {
      k: d.k, nombre: d.nombre, icono: d.icono, fecha: fecha, frec: frec, dias: dias,
      fechaCambio: (fecha && !fija) ? _sumarDiasISO(fecha, frec) : '',
      aplica: aplica, fija: fija,
      cambiaEstaNoche: cicla && dias !== null && dias === frec - 1,
      vence: cicla && dias !== null && dias >= frec,
      venceManana: cicla && dias !== null && dias === frec - 2,
    };
  });
}

/**
 * Nombre del ventilador (categoría VM) asignado a una cama, para la regla del
 * HEPA. Lee VENTILADORES UNA vez por ejecución (memo): la entrega y
 * cambiosEstaNoche recorren la unidad entera y no pueden pagar una lectura por
 * cama. Mismo criterio del censo (svc_camas.gs): ACTIVO, ubicado en CAMA y
 * de categoría VM — el V60/Airvo acompaña al paciente, no ocupa el casillero.
 */
// `var` a propósito: en GAS cada ejecución parte con el memo vacío, y en los
// arneses de las guardias (que cargan este archivo con eval) `var` deja el
// memo alcanzable para resetearlo entre escenarios.
var _ventPorCamaMemo = null;
function _ventNombreDeCama(idCama) {
  if (_ventPorCamaMemo === null) {
    _ventPorCamaMemo = {};
    try {
      repoLeerTodos('VENTILADORES').forEach(function (x) {
        if (!esVerdadero(x.ACTIVO) || x.UBIC_TIPO !== 'CAMA' || !x.UBIC_DETALLE) return;
        if (!_vmEsDeCama(_vmCategoria(x))) return;
        _ventPorCamaMemo[String(x.UBIC_DETALLE)] = String(x.NOMBRE || '');
      });
    } catch (e) { /* sin inventario legible: se comporta como «sin equipo» */ }
  }
  return _ventPorCamaMemo[String(idCama)] || '';
}

/**
 * ¿Este ventilador lleva HEPA FIJO (sin ciclo de cambio)? Se decide por
 * PREFIJO del nombre contra CONFIG HEPA_FIJO_EQUIPOS («PB,Avea» si la fila no
 * existe): así «PB 1», «PB 2», «Avea 1» y «Avea 3» calzan sin enumerarlos, y
 * un equipo nuevo se agrega editando CONFIG, sin tocar código. El espejo del
 * cliente es _hepaFijoEquipo en index.html — si cambias la regla, en ambos.
 */
function _hepaFijoEquipo(nombre) {
  const n = String(nombre || '').trim().toUpperCase();
  if (!n) return false;
  return String(leerConfig('HEPA_FIJO_EQUIPOS', 'PB,Avea')).split(',')
    .map(function (s) { return s.trim().toUpperCase(); })
    .filter(Boolean)
    .some(function (p) { return n.indexOf(p) === 0; });
}

/** fecha ISO + n días, sin pasar por Date del navegador (mediodía UTC evita
 *  que un huso horario corra el día — la causa clásica del desfase). */
function _sumarDiasISO(iso, n) {
  const d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + (parseInt(n, 10) || 0));
  return d.toISOString().slice(0, 10);
}

/**
 * Qué dispositivos se cambian ESTA NOCHE en toda la unidad (y cuáles quedaron
 * atrasados). fecha = el día D cuyo turno Noche hará los cambios, trabajando en
 * la madrugada de D+1: HME con etiqueta D-1, HEPA y Trach Care con etiqueta D-2.
 * El dispositivo nuevo se etiqueta D+1 (fecha efectiva del turno noche —
 * mecanismo ya existente), y así entre dos cambios pasan exactamente `frec`
 * días. Ver la nota de `estadoDispositivos`: hasta el 10-ago-2026 esto pedía
 * etiqueta D-2 / D-3 y el aviso salía una noche tarde.
 */
function cambiosEstaNoche(fecha) {
  try {
    const ref = String(fecha || hoyISO()).slice(0, 10);
    const camas = [];
    repoLeerTodos('CAMAS_ESTADO').forEach(function (c) {
      if (!esVerdadero(c.OCUPADA)) return;
      const disps = estadoDispositivos(c, ref)
        .filter(function (x) { return x.aplica && (x.cambiaEstaNoche || x.vence); })
        .map(function (x) {
          return { k: x.k, nombre: x.nombre, icono: x.icono, etiqueta: x.fecha,
                   fechaCambio: x.fechaCambio, estado: x.vence ? 'vencido' : 'esta_noche',
                   // el atraso se cuenta desde la madrugada en que tocaba (frec-1)
                   diasAtraso: x.vence ? (x.dias - (x.frec - 1)) : 0 };
        });
      if (disps.length) camas.push({ idCama: String(c.ID_CAMA), nombre: String(c.NOMBRE || ''), dispositivos: disps });
    });
    camas.sort(function (a, b) { return (parseInt(a.idCama) || 0) - (parseInt(b.idCama) || 0); });
    return ok({ fecha: ref, camas: camas });
  } catch (e) { return err('cambiosEstaNoche: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Anexa un evento rápido al turno. datos: { idCama, turnoKey, tipo, hora,
 * detalle, proc (nombre de catálogo si tipo=procedimiento), cultTipo,
 * cultHallazgo (si tipo=cultivo) }.
 */
function anexarEventoRapido(datos, ctx) {
  ctx = ctx || {};
  return conLock(() => {
    try {
      const idCama = String(datos.idCama || '');
      const turnoKey = String(datos.turnoKey || '');
      const tipo = String(datos.tipo || '');
      const hora = String(datos.hora || '').trim();
      const detalle = String(datos.detalle || '').trim();
      if (!idCama || !turnoKey || !tipo) return err('Faltan cama, turno o tipo de evento.', ERR.VALIDACION);
      const m = turnoKey.match(/^(\d{4}-\d{2}-\d{2})-(Dia|Noche)$/);
      if (!m) return err('TURNO_KEY inválido.', ERR.VALIDACION);
      const fecha = m[1], turno = m[2];
      const fechaEf = _fechaEfectivaTurno(fecha, turno);

      const cama = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
      const pidCama = String((cama && cama.PATIENT_ID) || '');

      /* 🔴 LA CAMA YA NO AUTORIZA: CLASIFICA. Antes bastaba con que la cama
         estuviera ocupada, y el turno se resolvía por `ID_EVOLUCION`, que
         identifica una CAMA en un turno y no a una persona. En una cama que rotó
         —un paciente egresa y otro ingresa el mismo turno, 39 veces en agosto—
         eso hacía dos daños a la vez: lo anotado para el que egresó aterrizaba en
         la ficha del que entró, y al que egresó no había forma de corregirlo
         porque «su cama no está ocupada».

         🪤 Al localizador se le pasa SOLO el episodio DECLARADO, nunca el de la
         cama. Pasarle el de la cama parecería más servicial y sería el bug: en
         una cama rotada resolvería siempre al ocupante de hoy, en silencio y sin
         ambigüedad aparente. Sin episodio declarado se resuelve por clave, y si
         la clave calza con dos, se rechaza: son dos personas distintas y no hay
         forma de adivinar cuál. */
      const ubic = _ubicarEvolucionDeTurno(String(datos.patientId || ''), turnoKey, idCama);
      if (ubic && ubic.ambigua) {
        // El mensaje NO nombra al otro paciente ni su pid: esto va a un toast en
        // pantalla, no al Logger del editor (Ley 19.628).
        return err('La cama ' + idCama + ' tuvo dos pacientes en ese turno. Abre el turno desde el ' +
          'Registro Diario, sobre la fila del paciente que quieres corregir.', ERR.VALIDACION);
      }
      if (!cama && !ubic) return err('La cama ' + idCama + ' no existe.', ERR.VALIDACION);

      const pidEvo = String((ubic && ubic.obj && ubic.obj.PATIENT_ID) || '');
      /* EN CAMA = la evolución es del ocupante actual. CERRADO = todo lo demás
         (egresado, cama limpiada, cama re-ocupada, trasladada).
         La fila SIN pid pasa como EN CAMA a propósito, misma regla que
         `_mtoRepararAjenas`: bloquearla escondería procedimientos verdaderos de
         camas reparadas a mano. Y NO se le estampa identidad — adoptarla podría
         ser adoptar la del paciente anterior, y eso no se deshace. */
      const enCama = ubic ? (!pidEvo || (!!pidCama && pidEvo === pidCama))
                          : (!!cama && esVerdadero(cama.OCUPADA));
      const pid = ubic ? pidEvo : pidCama;
      // 15 caracteres cortaban «Klgo. Diego Melo» (son 16) y la línea de tiempo
      // mostraba «Klgo. Diego Mel». El límite existe solo para que un valor
      // absurdo no reviente la celda; 60 es el mismo techo que usa la
      // auditoría de firmas en mantenimiento.gs.
      const firma = String(ctx.firma || datos.firma || '').slice(0, 60);
      const hrTxt = hora ? ' ' + hora + ' hrs' : '';

      let texto = '', tipoHito = 'evento';
      const disp = _EVENTO_DISPS.find(d => d.k === tipo);

      if (disp) {
        /* 🔴 El reloj `DISP_*_FECHA` vive en CAMAS_ESTADO — una fila que, si el
           episodio está cerrado, HOY es de otra persona. Aplicarlo le reiniciaría
           el reloj al ocupante actual y `cambiosEstaNoche` dejaría de avisar un
           cambio real: el filtro se quedaría puesto de más. Por eso los
           dispositivos son lo único que NO se corrige hacia atrás. */
        if (!enCama) {
          return err('El cambio de ' + disp.nombre + ' no se puede anotar hacia atrás: el reloj del ' +
            'filtro es de la cama ' + idCama + ', que hoy tiene a otro paciente.', ERR.VALIDACION);
        }
        // Cambio de dispositivo → reinicia el reloj con la fecha efectiva.
        repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, (function () {
          const c = {}; c[disp.campo] = fechaEf; c.DISP_CONFIRMADO = true; return c;
        })());
        texto = disp.icono + ' Cambio de ' + disp.nombre + hrTxt + (detalle ? ' — ' + detalle : '');
        tipoHito = 'dispositivo';
      } else if (tipo === 'procedimiento') {
        const nombreProc = String(datos.proc || '').trim();
        if (!nombreProc) return err('Indica el procedimiento del catálogo.', ERR.VALIDACION);
        // El procedimiento debe sumar a la estadística → requiere la evolución del turno.
        // El texto conserva la instrucción que el equipo ya conoce («Primero guarda
        // la evolución…») y le suma la regla nueva: ahora que el ➕ alcanza turnos
        // pasados, hay que decir que un turno no se crea desde aquí.
        if (!ubic) return err('Primero guarda la evolución del turno; luego anexa el procedimiento. ' +
          'Los turnos no se inventan hacia atrás.', ERR.VALIDACION);
        const evo = ubic.obj;
        let procs = [];
        try { procs = JSON.parse(evo.PROC_JSON || '[]') || []; } catch (e) { procs = []; }
        procs.push(nombreProc);
        /* Se escribe POR NÚMERO DE FILA y en la hoja donde está la evolución
           —viva o archivo—, no por clave: `repoActualizar` escribe en la primera
           coincidencia, que en una cama rotada es la del otro paciente. La fila
           viaja COMPLETA porque `repoEscribirFila` reescribe el renglón entero. */
        repoEscribirFila(ubic.hoja, ubic.fila, Object.assign({}, evo, {
          PROC_JSON: JSON.stringify(procs), PROC_CANTIDAD: procs.length,
          PROC_RESUMEN: procs.join(', '),
        }));
        repoInsertar('PROCEDIMIENTOS', {
          // La clave y la cama salen de la EVOLUCIÓN, no del payload: tras un
          // traslado la cama del turno no es la cama de hoy. Y el pid es el del
          // EPISODIO — tomarlo de la cama era lo que fabricaba filas mixtas.
          ID_PROC: uid('PROC'), ID_EVOLUCION: String(evo.ID_EVOLUCION || ''),
          ID_CAMA: String(evo.ID_CAMA || idCama), PATIENT_ID: pidEvo,
          FECHA: fecha, TURNO: turno, TIPO_PROC: 'anexo', NOMBRE_PROC: nombreProc,
          DESCRIPCION: detalle, AUTOR_EMAIL: String(ctx.email || ''), TIMESTAMP: ahoraTS(),
        });
        texto = _hitoAnexoPrefijo(nombreProc) + hrTxt + (detalle ? ' — ' + detalle : '') + ' (anexo)';
        // 🔴 Hasta ago-2026 este hito nacía con TIPO 'procedimiento', que está
        // en `_TIPOS_HITO_AUTO`: el siguiente guardado de la evolución lo
        // borraba y lo regeneraba como la etiqueta pelada del procedimiento,
        // perdiendo hora, detalle, la marca (anexo) y la firma — sin error, sin
        // aviso y sin que el dato clínico se moviera (la fila de PROCEDIMIENTOS
        // seguía intacta). Con tipo propio sobrevive, y `_timelineDelGuardado`
        // reconoce su prefijo para no escribirle encima.
        tipoHito = 'anexo';
      } else if (tipo === 'cultivo') {
        const cultTipo = String(datos.cultTipo || '').trim();
        if (!cultTipo) return err('Indica el tipo de cultivo.', ERR.VALIDACION);
        const hallazgo = String(datos.cultHallazgo || '').trim();
        texto = '🧫 Cultivo ' + cultTipo + hrTxt + ': ' + (hallazgo || 'resultado pendiente');
        tipoHito = 'cultivo';
      } else if (tipo === 'otro') {
        if (!detalle) return err('Describe el evento.', ERR.VALIDACION);
        texto = '📌 ' + detalle + hrTxt;
      } else {
        return err('Tipo de evento desconocido: "' + tipo + '"', ERR.VALIDACION);
      }

      /* El hito se fecha SIEMPRE en su turno. Con el episodio cerrado va sin
         sincronizar la tarjeta: la tarjeta es del ocupante de HOY y el hito es de
         otro. Desde que `_sincronizarTimelineCama` filtra por paciente, esto ya
         no es un retardo de minutos — el hito ajeno no puede entrar ni cuando la
         sincronización corra después. */
      const hito = {
        idCama: String((ubic && ubic.obj && ubic.obj.ID_CAMA) || idCama),
        patientId: pid, fecha: fecha, turno: turno, tipo: tipoHito,
        texto: texto + (firma ? ' · ' + firma : ''),
        autor: firma, autorEmail: String(ctx.email || ''),
      };
      if (enCama) _agregarHitoInterno(hito); else _agregarHitoInternoSinSync(hito);
      SpreadsheetApp.flush();

      const salida = {
        entidad: 'TIMELINE', idCama: idCama, patientId: pid,
        idEvolucion: String((ubic && ubic.obj && ubic.obj.ID_EVOLUCION) || ''),
        accion: 'evento rápido: ' + texto, texto: texto,
      };
      /* En CERRADO no se lee CAMAS_ESTADO ni se devuelven dispositivos: son del
         ocupante actual y no tienen nada que ver con lo que se acaba de anotar.
         El front lo consume con `if (r && r.dispositivos)`, así que omitirlo es
         seguro. */
      if (enCama) {
        const camaNueva = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
        salida.dispositivos = estadoDispositivos(camaNueva, _fechaEfectivaTurno(hoyISO(), turno));
      }
      return ok(salida);
    } catch (e) { return err('anexarEventoRapido: ' + e.message, ERR.INTERNO, e); }
  });
}

/**
 * Confirma (o ajusta) la instalación asumida de dispositivos al conectar a VM.
 * datos: { idCama, fecha (opcional: corrige la fecha de instalación de los 3) }.
 */
function confirmarDispositivos(datos, ctx) {
  ctx = ctx || {};
  return conLock(() => {
    try {
      const idCama = String(datos.idCama || '');
      const cama = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
      if (!cama || !esVerdadero(cama.OCUPADA)) return err('La cama ' + idCama + ' no está ocupada.', ERR.VALIDACION);
      const campos = { DISP_CONFIRMADO: true };
      const fecha = String(datos.fecha || '').slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
        _EVENTO_DISPS.forEach(d => { campos[d.campo] = fecha; });
      }
      repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, campos);
      SpreadsheetApp.flush();
      return ok({ entidad: 'CAMAS_ESTADO', idCama: idCama, accion: 'dispositivos confirmados' + (fecha ? ' (instalados ' + fecha + ')' : '') });
    } catch (e) { return err('confirmarDispositivos: ' + e.message, ERR.INTERNO, e); }
  });
}
