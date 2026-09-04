/**
 * svc_evoluciones.gs — Guardado y lectura de evoluciones.
 * Corazón clínico: una fila por turno, con cálculos, texto, sincronización de la
 * cama, procedimientos y reintubación. La REPLICACIÓN turno a turno (bajar el roce)
 * se sirve con obtenerEvolucionPrevia().
 */

// ═══ ESCRITURA ════════════════════════════════════════════
function guardarEvolucion(datos, ctx) {
  const errs = validarPayloadEvolucion(datos);
  if (errs.length) return err('Validación: ' + errs.join('; '), ERR.VALIDACION);
  ctx = ctx || {};

  return conLock(() => {
    try {
      const idCama = String(datos.ID_CAMA || datos.idCama || '');
      const turnoKey = String(datos.TURNO_KEY || datos.turnoKey || '');
      if (!idCama || !turnoKey) return err('Faltan ID_CAMA o TURNO_KEY.', ERR.VALIDACION);

      // Guardia de firma: PLAN_FIRMA_KINE debe ser una firma corta (iniciales),
      // jamás un texto largo — un dato corrupto aquí contamina el selector de
      // firmas en la interfaz (bug visto en marcha blanca, jul-2026).
      if (String(datos.PLAN_FIRMA_KINE || '').length > 15 || /\n/.test(String(datos.PLAN_FIRMA_KINE || ''))) {
        datos.PLAN_FIRMA_KINE = '';   // mejor sin firma que con basura (la UI la exige de todos modos)
      }

      const idEvolucion = 'CAMA_' + idCama + '_' + turnoKey;
      const p = turnoKey.split('-');
      const fecha = p[0] + '-' + p[1] + '-' + p[2];
      const turno = p[3] || 'Dia';
      // El generador de texto y los cálculos leen FECHA/TURNO del payload:
      // fijarlos ANTES (el cliente solo envía TURNO_KEY). Sin esto, las
      // evoluciones de noche salían tituladas "TURNO DÍA".
      datos.FECHA = fecha;
      datos.TURNO = turno;

      // La vista previa (cliente) ya generó el texto que el kinesiólogo revisó:
      // se respeta tal cual para que el texto GUARDADO sea IDÉNTICO al de la
      // vista previa (antes divergían por usar dos generadores distintos). Se
      // captura ANTES de la fusión con la fila previa (que podría reinyectar un
      // texto antiguo). Fallback al generador del servidor si no viene (llamadas
      // API sin navegador, como los smoke tests).
      const _textoCliente = String(datos.TEXTO_GENERADO || '').trim();
      // Editor de texto (opción A): el cliente manda además la salida cruda del
      // motor (TEXTO_AUTO) y si hubo edición manual (TEXTO_MANUAL). Se capturan
      // ANTES de la fusión con la fila previa, igual que el texto oficial.
      const _textoAutoCli = String(datos.TEXTO_AUTO || '').trim();
      const _textoManualCli = esVerdadero(datos.TEXTO_MANUAL);
      // Etiqueta de bloque por línea de TEXTO_AUTO (v5.23). Viaja solo desde el
      // navegador: si la evolución entra por API sin cliente, queda vacía y el
      // análisis simplemente no cuenta ese turno.
      const _textoBloquesCli = String(datos.TEXTO_BLOQUES || '').trim();

      // ── Fusión con lo ya guardado ──
      // Los eventos únicos (PVE/extubación, decanulación, intubación,
      // reintubación, cambio de tubo) viajan en el payload SOLO el turno en
      // que se registran; en re-guardados posteriores el cliente omite esas
      // claves y aquí se preservan desde la fila existente. Sin esta fusión,
      // repoUpsert (reescritura de fila completa) borraba los eventos al
      // re-guardar el turno.
      // La fila del turno se ubica UNA vez y la posición se recuerda: la
      // fusión de abajo, los históricos de BDT/apnea y la escritura final
      // hablan todos de ESTA misma fila. Válido porque todo ocurre dentro del
      // mismo lock y nada borra/inserta en EVOLUCIONES antes del upsert.
      // La cama se ubica una vez; su ÚNICA escritura es el sync del final (las
      // que había repartidas por el camino se fusionaron ahí — de paso el
      // guardado quedó todo-o-nada: si algo revienta a mitad, la cama no queda
      // a medio actualizar).
      // 🔴 Se lee ANTES de la fusión (20-ago-2026): la fusión necesita saber de
      // qué episodio es la fila previa, y eso solo lo dice la cama.
      const filaCama = repoBuscarFila('CAMAS_ESTADO', 'ID_CAMA', idCama);
      const cama = filaCama === -1 ? {} : repoLeerFila('CAMAS_ESTADO', filaCama);

      // Foto del trío de KTM TAL COMO LLEGÓ, antes de que la fusión de abajo
      // le copie encima lo de la fila previa. Sin esta foto es imposible
      // distinguir «el turno no opinó» de «el turno heredó».
      const _payloadKTM = {};
      ['KTM_REALIZADA', 'KTM_SUSPENDIDA', 'KTM_NO_REALIZADA'].forEach(function (k) {
        if (k in datos) _payloadKTM[k] = datos[k];
      });
      const _declPayload = esVerdadero(_payloadKTM.KTM_REALIZADA) ||
        esVerdadero(_payloadKTM.KTM_SUSPENDIDA) || esVerdadero(_payloadKTM.KTM_NO_REALIZADA);

      const filaEvo = repoBuscarFila('EVOLUCIONES', 'ID_EVOLUCION', idEvolucion);
      const _prev = filaEvo === -1 ? null : repoLeerFila('EVOLUCIONES', filaEvo);
      if (_prev) {
        // 🔴 LA IDENTIDAD NO SE HEREDA (20-ago-2026). La copia de abajo traía
        // TODA clave ausente del payload, `PATIENT_ID` incluido, y cinco líneas
        // más abajo `datos.PATIENT_ID || cama.PATIENT_ID` hacía GANAR al pid
        // heredado. Consecuencia medida en la planilla real: el episodio del
        // ocupante NUEVO quedaba atribuido al paciente ANTERIOR, y
        // `_syncCamaDesdeEvolucion` le escribía ese pid al censo — la cama
        // terminaba con el nombre de uno y el PATIENT_ID de otro, y el
        // historial (que se lee por pid) mezclaba los dos episodios.
        // La clave `CAMA_<n>_<turnoKey>` NO lleva paciente dentro, así que una
        // cama que rota sin archivar deja la fila del anterior bajo la misma
        // clave: por ahí entraba.
        const _pidPrev = String(_prev.PATIENT_ID || '');
        const _pidCama = String(cama.PATIENT_ID || '');
        // «Otro episodio» solo cuando los dos pids existen y difieren. Si
        // alguno falta es una fila legacy o una cama sin ingreso formal: ahí se
        // fusiona como siempre, para no esconder datos verdaderos (misma regla
        // «distinto Y no vacío» de `_mtoRepararAjenas`).
        const _otroEpisodio = !!_pidPrev && !!_pidCama && _pidPrev !== _pidCama;

        if (!_otroEpisodio) {
          Object.keys(_prev).forEach(function (k) {
            // La identidad se decide abajo desde la CAMA, nunca por herencia.
            if (k === 'PATIENT_ID' || k === 'PAC_COD') return;
            if (!(k in datos)) datos[k] = _prev[k];
          });
          // «Si se registró, quedó»: la marca de ingreso del turno JAMÁS se
          // pierde al re-editar. El cliente reabre con el modo ingreso apagado
          // y mandaba ES_INGRESO en falso — eso des-marcaba el ingreso ante el
          // REM (ingresos del mes), la estadística y el hito del historial.
          if (esVerdadero(_prev.ES_INGRESO)) datos.ES_INGRESO = true;
        }
        // Si ES de otro episodio no se hereda NADA: ni identidad ni datos
        // clínicos. Que el turno de este paciente arranque limpio es lo único
        // que no puede atribuirle a nadie lo que no hizo.

        // ── 🔑 LA KTM NO SE PIERDE AL REABRIR EL TURNO (Manuel, 20-ago-2026) ──
        //
        // ESTE ES EL BUG QUE ORIGINÓ TODO EL TRABAJO: «en la ficha de papel
        // escriben KTM con nivel, pero no está registrado en RCE». No es que se
        // olviden de anotarla — el sistema se la BORRA.
        //
        // El formulario neutraliza el trío en CADA reapertura (es deliberado:
        // «KTM — ACCIÓN DIARIA: siempre parte sin estado seleccionado», para que
        // nadie herede sin querer la KTM de ayer) y manda las claves presentes
        // pero vacías. Como la fusión de arriba solo repone lo AUSENTE, un turno
        // con KTM realizada nivel 3 y 2 sesiones quedaba en nivel '' y cantidad
        // '' porque un colega reabrió esa evolución para corregir la FiO₂.
        //
        // Medido en la planilla real el 20-ago: 52 filas con nivel presente y el
        // estado apagado — más que las 36 con KTM realizada. 21 de ellas de día,
        // que son las sospechosas de ser KTM verdaderas que perdieron su estado.
        //
        // La regla, decidida por Manuel: si el payload NO DECLARA NINGÚN estado
        // del trío, el turno no está diciendo «no hubo KTM», está diciendo «de
        // esto no opino» — y entonces se conserva lo que ya había. Es el mismo
        // criterio que ya protege a ES_INGRESO cinco líneas más arriba.
        // Para borrar una KTM hay que declararlo (suspendida o no realizada);
        // el silencio ya no borra.
        // 🪤 La comprobación se hace contra el PAYLOAD ORIGINAL (`_declPayload`,
        // calculado arriba antes de fusionar), no contra `datos` ya fusionado:
        // para entonces el estado previo ya se coló por la copia de lo ausente.
        const _KTM_TRIO = ['KTM_REALIZADA', 'KTM_SUSPENDIDA', 'KTM_NO_REALIZADA'];
        const _KTM_SATELITES = ['KTM_NO_RAZON', 'KTM_NO_COMENTARIO', 'KTM_CONTRA_TIPO',
          'KTM_CONTRA_CAT', 'KTM_CONTRA_RAZON', 'KTM_CONTRA_MANUAL', 'KTM_NIVEL_KTR',
          'KTM_ASISTENCIA', 'KTM_TIEMPO_MIN', 'KTM_CANT'];
        const _declPrev = esVerdadero(_prev.KTM_REALIZADA) ||
                          esVerdadero(_prev.KTM_SUSPENDIDA) || esVerdadero(_prev.KTM_NO_REALIZADA);
        if (!_declPayload && _declPrev) {
          // Silencio: se conserva lo que había, entero.
          _KTM_TRIO.concat(_KTM_SATELITES).forEach(function (k) { datos[k] = _prev[k]; });
        } else if (_declPayload) {
          // Declaración: el trío viaja COMPLETO desde el payload. Los estados
          // que no vengan son FALSOS, no heredados — si no, declarar «no
          // realizada» dejaba también la «realizada» del turno anterior y la
          // fila quedaba con dos estados a la vez.
          // Solo se apaga lo que venía HEREDADO en verdadero: escribir `false`
          // sobre un campo que ya estaba vacío cambiaría la fila sin arreglar
          // nada (y rompe el A/B de `guardado_viajes` por una diferencia que no
          // existe).
          _KTM_TRIO.forEach(function (k) {
            if (!(k in _payloadKTM) && esVerdadero(datos[k])) datos[k] = false;
          });
        }
      }

      // PATIENT_ID — ruta única: se toma de la cama; si no existe (episodio sin
      // ingreso formal) se genera UNA vez (el sync final lo fija en la cama).
      let patientId = datos.PATIENT_ID || cama.PATIENT_ID || '';
      if (!patientId) patientId = Utilities.getUuid();
      datos.PATIENT_ID = patientId;

      // COD_PACIENTE — de la cama; si falta, se genera desde el nombre.
      let cod = datos.PAC_COD || cama.COD_PACIENTE || '';
      if (!cod && datos.PAC_NOMBRE) cod = _codUnico(generarCodPaciente(datos.PAC_NOMBRE, datos.PAC_EDAD, fecha));
      datos.PAC_COD = cod;

      // Peso ideal si falta
      if (!datos.PAC_PESO_IDEAL || parseFloat(datos.PAC_PESO_IDEAL) <= 0) {
        datos.PAC_PESO_IDEAL = calcularPI(datos.PAC_SEXO, datos.PAC_TALLA) || '';
      }
      // Cálculos respiratorios
      Object.assign(datos, calcularRespiratorio(datos));

      // ── El episodio se baja UNA sola vez por guardado ───────────────────
      // Cuatro bloques necesitan las evoluciones anteriores de esta cama: los
      // contadores de días (VM/VNI/VA), el histórico de BDT, el de test de
      // apnea y la racha de válvula de fonación de la decanulación. Los cuatro
      // corren dentro del MISMO conLock y ANTES de la única escritura a
      // EVOLUCIONES (el repoUpsert de más abajo), así que las cuatro lecturas
      // devolvían por fuerza filas idénticas — en el turno de una decanulación
      // completa eran SIETE bajadas de la hoja para el mismo dato.
      // No es un caché clínico: nace y muere dentro de esta llamada, y se
      // llena solo cuando alguien de verdad lo pide.
      let _evosCamaMemo = null;
      const _evosCama = function () {
        if (_evosCamaMemo === null) _evosCamaMemo = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', idCama);
        return _evosCamaMemo;
      };

      // Días de estadía / VM / VA
      // MOMENTO real del ingreso (ago-2026, corregido 5-ago): fecha+turno+hora
      // con _tsEventoTurno (mismo mecanismo del ciclo de prono, v5.33) — así un
      // ingreso de turno Noche pasada la medianoche fecha al día SIGUIENTE, como
      // la lista oficial del hospital (BUDA). No agrega ningún campo: la hora
      // (PAC_HORA_INGRESO / «Hora ingreso» del formulario) ya se pedía; antes
      // solo la usaba TS_INGRESO (con _tsDesdeHora, relativo a AHORA — no al
      // turno) y FECHA_INGRESO caía siempre en la fecha del turno sin mirarla.
      // Las fechas de ingreso se corrigen EN MEMORIA sobre `cama`; a la hoja
      // llegan con el sync único del final (que ya las incluye). Los cálculos
      // de aquí abajo leen cama.FECHA_INGRESO / cama.TS_INGRESO ya corregidos.
      const _hFormIng = _horaValida(datos.PAC_HORA_INGRESO);
      const _tsIng = _hFormIng ? _tsEventoTurno(fecha, turno, _hFormIng) : '';
      if (!cama.FECHA_INGRESO) {
        // Episodio sin fecha de ingreso (paciente cargado sin ingreso formal):
        // se ancla al primer turno evolucionado para que los días no queden '?'.
        cama.FECHA_INGRESO = _tsIng ? _tsFecha(_tsIng) : fecha;
      }
      if (!cama.TS_INGRESO) {
        cama.TS_INGRESO = _tsIng || _tsAhora();
      } else if (_hFormIng && _hFormIng !== _tsHora(cama.TS_INGRESO)
                 && !coordCampoCorregido(cama, 'FECHA_INGRESO')) {
        // Corrección a mano: se conserva el día del momento ya guardado.
        //
        // ARRASTRE (D7, ago-2026): si la coordinación ya corrigió la fecha de
        // ingreso, el turno la HEREDA y no la pisa — «normalmente no se
        // modifica, así que no debería poder modificarla» (Manuel, 18-ago).
        // Sin esta guardia, la corrección de un egresado de 28 días duraba
        // hasta que alguien guardara el turno siguiente con otra hora.
        cama.TS_INGRESO = _tsFecha(cama.TS_INGRESO) + ' ' + _hFormIng;
      }
      if (cama.FECHA_INGRESO) {
        // ── DÍAS: EL MISMO NÚMERO QUE LA LISTA OFICIAL (BUDA) ──────────────
        // (ago-2026, decisión de Diego con la «Lista de hospitalizados» a la
        // vista.) La unidad suma UN día de estadía por cada día de CALENDARIO
        // y el día de ingreso es Día 0. Verificado contra la lista del
        // 3-ago-2026: las 17 camas cuadran con `hoy − fecha de ingreso`.
        //
        // OJO — esto REVIERTE los bloques de 24 h de la v5.19. Aquella se
        // construyó sobre un supuesto equivocado (que BUDA contaba por
        // bloques); en realidad cuenta por calendario, así que la app se
        // despegaba hasta en un día del papel que el equipo lee en la reunión.
        // Si alguna vez se quiere volver al tiempo transcurrido real, la hora
        // sigue guardada en TS_INGRESO: es un dato, no se perdió.
        //
        // Se cuenta contra LA FECHA DEL TURNO (regla afinada por Diego,
        // 4-ago 01:00, en pleno turno de noche): la hoja de registro del
        // turno noche del 3 PERTENECE al día 3 — sus días no se adelantan a
        // medianoche; «se actualizan en la mañana, al cambio de turno, y
        // aparece una planilla nueva limpia». La TARJETA DE CAMA, en cambio,
        // es «lo real en vivo» y cuenta contra el reloj (svc_camas/index):
        // que a las 02:00 difieran en 1 es A PROPÓSITO — la cama muestra lo
        // que pasa, el registro es la referencia de fecha del turno.
        // OJO: NO usar _fechaEfectivaTurno aquí (se probó y se revirtió esa
        // misma noche); la fecha efectiva sigue vigente SOLO para los relojes
        // de dispositivos (v5.20) y el fechado de eventos rápidos.
        datos.DIA_ESTADIA = diasEntre(cama.FECHA_INGRESO, fecha);

        // ── VM · VNI · VA: DÍAS POR TRAMOS, ACUMULADOS Y SIN SOLAPARSE ─────
        // (ago-2026, hallazgo de Diego con María del Carmen: su estadística
        // manual sumaba VM 8 + VNI 7 = 15 días en una estadía de 13, porque el
        // día de cada transición se contaba para LOS DOS soportes.)
        //
        // REGLA: cada TRAMO de soporte aporta diasEntre(inicio, fin). El día
        // de la transición pertenece al soporte SALIENTE (el turno que extuba
        // aún estuvo ventilado) y es el Día 0 del entrante. Así los tramos
        // consecutivos SUMAN EXACTO la estadía — imposible el día doble y
        // imposible el día perdido.
        //
        // Cómo se calcula sin recorrer tramos: si el turno TIENE el soporte
        // (estado inicial o final), su valor = BASE + días del tramo abierto,
        // donde BASE es el valor CONGELADO de la última evolución del episodio
        // que terminó SIN ese soporte (= la suma de todos los tramos cerrados).
        // Si el turno NO lo tiene, hereda el valor congelado del turno previo.
        // El congelado emerge solo: al salir del soporte el número queda quieto
        // y al REINGRESAR (reintubación, nueva VNI) los tramos anteriores no se
        // pierden — antes la reintubación reiniciaba el contador a cero.
        const _sopT = datos.VENT_SOPORTE_FINAL || datos.VENT_SOPORTE;
        const _vaT  = datos.VENT_VIA_AEREA_FINAL || datos.VENT_VIA_AEREA;
        const _esVA = function (x) { return x && String(x) !== 'Natural'; };
        // Episodio ANTERIOR a este turno, del más reciente al más antiguo.
        const _epiPrev = _evosCama()
          .filter(function (x) {
            return String(x.PATIENT_ID) === String(patientId) &&
                   String(x.TURNO_KEY || '') < String(turnoKey);
          })
          .sort(function (a, b) { return String(b.TURNO_KEY).localeCompare(String(a.TURNO_KEY)); });
        const _contadorTramos = function (campo, enS, terminoSinS, fInicioTramo) {
          if (!enS) {   // sin el soporte: hereda el congelado (0 si nunca lo tuvo)
            return _epiPrev.length ? (parseInt(_epiPrev[0][campo], 10) || 0) : 0;
          }
          let base = 0, huboSalida = false;   // tramos cerrados = congelado de la última evolución fuera del soporte
          for (let i = 0; i < _epiPrev.length; i++) {
            if (terminoSinS(_epiPrev[i])) { base = parseInt(_epiPrev[i][campo], 10) || 0; huboSalida = true; break; }
          }
          let ini = fInicioTramo;
          // Nunca salió del soporte en todo el episodio ⇒ el tramo viene desde
          // la PRIMERA evolución, aunque el reloj de la cama se haya
          // re-estampado en el camino (p. ej. TOT → Full Face reestampa la
          // fecha de inicio de VA sin que la vía aérea dejara de ser artificial).
          if (!huboSalida && _epiPrev.length) {
            const f0 = String(_epiPrev[_epiPrev.length - 1].FECHA || '').slice(0, 10);
            if (f0 && (!ini || f0 < ini)) ini = f0;
          }
          return base + Math.max(0, diasEntre(ini, fecha) || 0);
        };
        // Inicio del tramo abierto: el reloj de la cama si la cama YA está en
        // ese soporte; si la transición ocurre EN ESTE turno (la cama aún dice
        // el soporte anterior), el tramo parte hoy — Día 0.
        const _finalSop = function (x) { return String(x.VENT_SOPORTE_FINAL || x.VENT_SOPORTE || ''); };
        const _finalVa  = function (x) { return String(x.VENT_VIA_AEREA_FINAL || x.VENT_VIA_AEREA || ''); };
        datos.DIAS_VM = _contadorTramos('DIAS_VM',
          String(datos.VENT_SOPORTE) === 'VM' || String(_sopT) === 'VM',
          function (x) { return _finalSop(x) !== 'VM'; },
          String(cama.SOPORTE) === 'VM' ? cama.FECHA_INICIO_SOPORTE : fecha);
        // VNI manda el SOPORTE registrado, nunca la interfaz: la mascarilla
        // sola (Full Face/Oronasal en oxigenoterapia o CNAF) no es VNI.
        datos.DIAS_VNI = _contadorTramos('DIAS_VNI',
          String(datos.VENT_SOPORTE) === 'VNI' || String(_sopT) === 'VNI',
          function (x) { return _finalSop(x) !== 'VNI'; },
          String(cama.SOPORTE) === 'VNI' ? cama.FECHA_INICIO_SOPORTE : fecha);
        datos.DIAS_VA = _contadorTramos('DIAS_VA',
          _esVA(datos.VENT_VIA_AEREA) || _esVA(_vaT),
          function (x) { return !_esVA(_finalVa(x)); },
          _esVA(cama.VIA_AEREA) ? cama.FECHA_INICIO_VA : fecha);
      }

      // BDT (test de azul) — repetible: cada resultado marcado en el turno se
      // acumula en BDT_JSON del episodio y BDT_ULTIMO refleja el más reciente.
      const bdtRes = esVerdadero(datos.EVAL_T_BDT_POS) ? '+' : (esVerdadero(datos.EVAL_T_BDT_NEG) ? '-' : '');
      if (bdtRes) {
        // Continuidad del histórico: fila de este turno (la que la fusión ya
        // trajo — volver a pedirla era otra bajada de la hoja) o turno previo.
        let base = _prev;
        if (!base || !base.BDT_JSON) {
          const rp = obtenerEvolucionPrevia(idCama, turnoKey, _evosCama());
          if (rp.ok && rp.data) base = rp.data;
        }
        let hist = [];
        try { hist = JSON.parse((base && base.BDT_JSON) || '[]') || []; } catch (e) {}
        // idempotente por turno: reemplaza el registro de este mismo turnoKey
        hist = hist.filter(function (h) { return h && h.turnoKey !== turnoKey; });
        hist.push({ turnoKey: turnoKey, fecha: fecha, resultado: bdtRes });
        datos.BDT_JSON = JSON.stringify(hist);
        datos.BDT_ULTIMO = bdtRes + ' (' + fecha + ')';
      }

      // Test de apnea — repetible (mismo patrón que BDT)
      const apRes = String(datos.APNEA_TEST || '').trim();
      if (apRes) {
        let baseA = _prev;
        if (!baseA || !baseA.APNEA_JSON) {
          const rpa = obtenerEvolucionPrevia(idCama, turnoKey, _evosCama());
          if (rpa.ok && rpa.data) baseA = rpa.data;
        }
        let histA = [];
        try { histA = JSON.parse((baseA && baseA.APNEA_JSON) || '[]') || []; } catch (e) {}
        histA = histA.filter(function (h) { return h && h.turnoKey !== turnoKey; });
        histA.push({ turnoKey: turnoKey, fecha: fecha, resultado: apRes });
        datos.APNEA_JSON = JSON.stringify(histA);
        datos.APNEA_ULTIMO = apRes + ' (' + fecha + ')';
      }

      // Horas con válvula de fonación (para la frase de la decanulación):
      // racha consecutiva de turnos previos + el propio turno si va con válvula.
      if (esVerdadero(datos.DECAN_OCURRIO)) {
        const rp2 = obtenerEvolucionPrevia(idCama, turnoKey, _evosCama());
        let hrs = (rp2.ok && rp2.data && rp2.data._VFON_HORAS) ? rp2.data._VFON_HORAS : 0;
        if (String(datos.VENT_MODO) === 'Válvula de fonación' || esVerdadero(datos.VFON_USADA)) hrs += 12;
        datos._VFON_HORAS = hrs;   // transitorio: no es columna
      }

      // Ciclo de prono: sella el momento real y, al supinar, cierra la cuenta.
      // Le viaja el episodio SOLO si ya se bajó en este guardado (que es lo
      // normal); si no, _pronoSellarCiclo lo pide por su cuenta y únicamente en
      // el caso en que de verdad lo mira (supinación sin pronación del turno).
      _pronoSellarCiclo(idCama, turnoKey, fecha, turno, datos, _evosCamaMemo);

      // ── Normalización del trío de KTM (20-ago-2026) ──────────────────────
      // Se NORMALIZA, no se rechaza: bloquear una evolución por un nivel
      // heredado dejaría al turno sin poder guardar, y de noche sin salida
      // desde la pantalla (la tarjeta está oculta). Ver `validarKTM`.
      //
      // · Nivel sin estado, o con la KTM suspendida / no realizada, es un
      //   FÓSIL: el formulario no limpia `fKTMniv` al cambiar de estado, así
      //   que el número de ayer sobrevive a una KTM que no se hizo. Medido:
      //   52 filas así en la planilla real. Se vacía.
      // · La cantidad se acota aquí porque el servidor no lo hacía en ninguna
      //   parte: por API entraba cualquier número al REM.
      (function () {
        const hecha = esVerdadero(datos.KTM_REALIZADA);
        const otra  = esVerdadero(datos.KTM_SUSPENDIDA) || esVerdadero(datos.KTM_NO_REALIZADA);
        // Solo se toca lo que TIENE contenido: escribir '' sobre un campo que ya
        // estaba vacío cambiaría la fila sin arreglar nada, y hace fallar el A/B
        // de `guardado_viajes` por una diferencia que no existe.
        if (!hecha) {
          if (String(datos.KTM_NIVEL_KTR || '') !== '') datos.KTM_NIVEL_KTR = '';
          if (String(datos.KTM_CANT || '') !== '') datos.KTM_CANT = '';
        } else {
          datos.KTM_CANT = _ktmCantidad(datos.KTM_CANT);
        }
      })();

      // Texto clínico: el de la PANTALLA (cliente) si vino; si no, se genera.
      datos.TEXTO_GENERADO = _textoCliente || generarTextoEvolucion(datos);
      // Respaldo del motor: si el cliente no lo trae (API sin navegador) y no
      // hubo edición manual, el oficial ES la salida del motor.
      datos.TEXTO_AUTO = _textoAutoCli || (_textoManualCli ? '' : datos.TEXTO_GENERADO);
      datos.TEXTO_MANUAL = _textoManualCli;
      // Las etiquetas solo valen si acompañan al TEXTO_AUTO que las produjo: si
      // este re-guardado no las trae, se descartan las de la fila previa (que
      // corresponden a otra generación) en vez de dejarlas desalineadas.
      datos.TEXTO_BLOQUES = _textoAutoCli ? _textoBloquesCli : '';

      // Procedimientos del turno
      let procs = [];
      if (datos.PROC_JSON) { try { procs = JSON.parse(datos.PROC_JSON) || []; } catch (e) {} }
      if (!Array.isArray(procs)) procs = [];
      if (datos.PROC_RESUMEN === undefined) datos.PROC_RESUMEN = procs.join(', ');
      if (datos.PROC_CANTIDAD === undefined) datos.PROC_CANTIDAD = procs.length;

      // Construir la fila de evolución (metadatos e identidad mandan)
      const evo = Object.assign({}, datos, {
        ID_EVOLUCION: idEvolucion, ID_CAMA: idCama, PATIENT_ID: patientId, COD_PACIENTE: cod,
        TURNO_KEY: turnoKey, FECHA: fecha, TURNO: turno, TIMESTAMP: ahoraTS(),
        AUTOR_EMAIL: ctx.email || '', PLAN_FIRMA_KINE: datos.PLAN_FIRMA_KINE || ctx.firma || '',
      });

      const accion = repoUpsertEnFila('EVOLUCIONES', filaEvo, evo);
      const esNuevo = (accion === 'crear');

      // Hito de ingreso — solo en la primera escritura. Viaja en el MISMO lote
      // que los hitos de procedimientos (una inserción, un solo cache).
      const hitosExtra = [];
      if (esVerdadero(evo.ES_INGRESO) && esNuevo) {
        hitosExtra.push({
          tipo: 'ingreso',
          texto: 'Ingreso UCI. Dx: ' + (evo.PAC_DIAGNOSTICO || evo.PAC_NOMBRE || 'Sin especificar'),
          autor: evo.PLAN_FIRMA_KINE, autorEmail: ctx.email || '',
        });
      }

      // 📌 NOTA DEL TURNO → hito en la línea de tiempo (Diego, 2-sep-2026).
      // La nota YA era el texto libre propio de ese turno: no se hereda al
      // siguiente y entra a la evolución como «Nota: …». Lo único que le
      // faltaba era dejar rastro en el historial, que era el motivo original
      // de los «eventos manuales» — así que no hizo falta un bloque nuevo en
      // el formulario, solo darle salida a lo que ya se escribe.
      // Tipo 'nota': el cliente YA tenía su color reservado (ámbar) y su
      // filtro en la pestaña de eventos; y está en _TIPOS_HITO_AUTO para que
      // al re-guardar se REEMPLACE en vez de duplicarse.
      const _notaTurno = String(evo.PLAN_NOTA_TURNO || '').trim();
      if (_notaTurno) {
        hitosExtra.push({
          tipo: 'nota',
          texto: '📌 Nota: ' + (_notaTurno.length > 220 ? _notaTurno.slice(0, 219) + '…' : _notaTurno),
          autor: evo.PLAN_FIRMA_KINE, autorEmail: ctx.email || '',
        });
        // 📨 Y al buzón (v5.91). El hito de arriba se REEMPLAZA al re-guardar;
        // el buzón es de solo agregar: la nota re-guardada idéntica no se
        // duplica, y la CAMBIADA entra como fila nueva sin pisar la anterior
        // (regla de Diego, 4-sep-2026).
        if (typeof notifRegistrar === 'function') {
          notifRegistrar({ tipo: 'nota', titulo: '📌 Nota del turno — cama ' + idCama,
            detalle: _notaTurno, refCama: idCama, autor: String(evo.PLAN_FIRMA_KINE || ''),
            origenId: String(evo.ID_EVOLUCION || (idCama + '|' + turnoKey)) });
        }
      }

      // Procedimientos (filas) + hitos automáticos
      // UN evento por ciclo prono→supino (ago-2026, Bloque C de Diego): la
      // SUPINACIÓN no entra a PROCEDIMIENTOS — la estadística contaría DOS
      // eventos por un solo ciclo. El ciclo lo representa la fila del PRONO y
      // el total de horas queda sellado en PRONO_HORAS al supinar. La TIMELINE
      // sí recibe el hito de supino (lista completa), porque el historial
      // narra maniobras, no cuenta eventos.
      const procsStats = procs.filter(function (p) { return !/^SUPINACI/i.test(String(p)); });
      _guardarProcedimientosInterno(idEvolucion, idCama, patientId, fecha, turno, procsStats, ctx.email);
      const timelineJson = _timelineDelGuardado(idCama, fecha, turno, procs, evo.PLAN_FIRMA_KINE, ctx.email, patientId, hitosExtra);

      // Sincronizar el snapshot de la cama: la ÚNICA escritura a CAMAS_ESTADO
      // del guardado (lleva también las fechas de ingreso corregidas arriba y
      // el cache de la línea de tiempo recién armado).
      _syncCamaDesdeEvolucion(idCama, cama, evo, turno, turnoKey, fecha, patientId, filaCama, timelineJson);

      // Reintubación desde el bloque EXT_* (le viaja el lector perezoso del
      // episodio: si el EXT_TS hay que buscarlo hacia atrás, no re-baja la hoja)
      if (esVerdadero(evo.EXT_REINTUB)) {
        try { _registrarReintubacion(evo, idCama, idEvolucion, fecha, turno, ctx, _evosCama); }
        catch (e) { console.warn('_registrarReintubacion:', e.message); }
      }

      SpreadsheetApp.flush();
      return ok({ idEvolucion, idCama, patientId, turnoKey, accion: esNuevo ? 'crear' : 'actualizar', entidad: 'EVOLUCIONES', TEXTO_GENERADO: evo.TEXTO_GENERADO || '' });
    } catch (e) { return err('guardarEvolucion: ' + e.message, ERR.INTERNO, e); }
  });
}

// Sincroniza CAMAS_ESTADO con el último turno (datos del paciente + snapshot por turno).
// `filaCama` y `timelineJson` (opcionales, Ola 4): con la fila conocida la
// escritura es UN setValues sin relectura — válido porque el guardado corre
// entero dentro del lock y nada mueve filas de CAMAS_ESTADO en el camino.
// Sin ellos (anularEvento) se comporta como siempre: repoActualizar clásico
// y el cache de timeline no se toca.
function _syncCamaDesdeEvolucion(idCama, cama, evo, turno, turnoKey, fecha, patientId, filaCama, timelineJson) {
  const esIngreso = esVerdadero(evo.ES_INGRESO);
  const val = (a, b) => (a !== undefined && a !== null && a !== '') ? a : (b || '');

  // Estado con el que TERMINA el turno: si hubo un evento de vía aérea, la cama
  // (y el turno siguiente) deben partir de ahí, no del estado previo con el que
  // el paciente llegó al turno. El previo queda guardado en las columnas VENT_*.
  const vaFin  = evo.VENT_VIA_AEREA_FINAL || evo.VENT_VIA_AEREA || '';
  const sopFin = evo.VENT_SOPORTE_FINAL || evo.VENT_SOPORTE || '';
  const modoFin = evo.VENT_MODO_FINAL || evo.VENT_MODO || '';
  // Fecha de inicio de soporte: se reinicia si cambia el tipo (Ambiente↔VM↔VNI).
  const sopNew = sopFin || cama.SOPORTE || 'Ambiente';
  const sopAnt = cama.SOPORTE || '';
  const esVent = (sopNew === 'VM' || sopNew === 'VNI');
  let fechaSoporte, horaSoporte;
  // ARRASTRE (D7): una fecha corregida por la coordinación no la pisa el turno.
  // Pero si CAMBIA el tipo de soporte hay un tramo clínico nuevo de verdad
  // (VM→VNI→VM), y entonces la marca se suelta: congelarla ahí sería peor que
  // el error original, porque el contador arrancaría en una fecha que ya no
  // describe este tramo.
  // Se sueltan EN MEMORIA y viajan en el sync único del final: este guardado
  // ya está medido al viaje (Ola 4) y no admite una escritura suelta más.
  const _sopCorregido = coordCampoCorregido(cama, 'FECHA_INICIO_SOPORTE');
  const _vaCorregidoPrev = coordCampoCorregido(cama, 'FECHA_INICIO_VA');
  let _marcasSueltas = null;
  if (!esVent) { fechaSoporte = cama.FECHA_INICIO_SOPORTE || ''; horaSoporte = cama.TS_INICIO_SOPORTE || ''; }
  else if (_sopCorregido && sopNew === sopAnt) {
    fechaSoporte = cama.FECHA_INICIO_SOPORTE; horaSoporte = cama.TS_INICIO_SOPORTE || '';
  }
  else if (sopNew !== sopAnt || !cama.FECHA_INICIO_SOPORTE) {
    // Arranca (o se reinicia) el contador: se guarda también la HORA para que
    // los días de VM cuenten bloques de 24 h reales. La hora del evento manda
    // (intubación/reintubación/TQT); si no hay, la del registro.
    fechaSoporte = fecha;
    horaSoporte = _tsDesdeHora(_horaValida(evo.INTUB_HORA) || _horaValida(evo.REINTUB_HORA) || _horaValida(evo.TQT_HORA)) || _tsAhora();
  } else { fechaSoporte = cama.FECHA_INICIO_SOPORTE; horaSoporte = cama.TS_INICIO_SOPORTE || ''; }

  // Fecha de inicio de vía aérea: se reinicia si cambia el TIPO de vía aérea
  // (condicionante v1 #2 — "cambio de vía aérea recalcula días"). "Vía externa
  // previa" (condicionante #3) pliega los días previos hacia atrás en el ancla,
  // para que el contador arranque contando esos días ya transcurridos.
  // Salida de VM este turno (weaning/extubación): descarta el circuito
  const dejaVM = (sopAnt === 'VM' && sopNew !== 'VM');
  // Humidificación activa ↔ HME son excluyentes: con activa puesta, el filtro
  // HME está retirado del circuito — su fecha se fuerza vacía en la cama (si
  // no, val() haría arrastre desde el episodio y "resucitaría" un filtro que
  // ya no está puesto, igual que dejaVM para el resto del circuito).
  // 🪤 14-ago-2026 (reportado por Diego desde el uso): la humidificación vive
  // en DOS campos del formulario —el checkbox (VENT_H_ACTIVA) y la fecha
  // (DISP_HUMID_FECHA)— y aquí solo mandaba el checkbox. Fechar la
  // humidificación SIN marcar el checkbox dejaba hactOn falso y el HME seguía
  // contando días de un filtro retirado. Ahora manda CUALQUIERA de los dos; y
  // al revés, desmarcarla con la fecha vacía la RETIRA de la cama de verdad
  // (antes val() con '' hacía arrastre y la resucitaba desde el episodio).
  const hactOn = esVerdadero(evo.VENT_H_ACTIVA);
  const humidNueva = String(evo.DISP_HUMID_FECHA || '').slice(0, 10);
  const humidFinal = (hactOn || humidNueva)
    ? (humidNueva || String(cama.DISP_HUMID_FECHA || '').slice(0, 10) || fecha)
    : '';

  // PVE del episodio, acumulados por turnoKey (idempotente al re-guardar un
  // turno: la clave se sobreescribe). De aquí se deriva la clase de weaning.
  let weanPve = {};
  try { weanPve = JSON.parse(cama.WEAN_PVE_JSON || '{}') || {}; } catch (e) { weanPve = {}; }
  if (evo.PVE_VAL === 'si' && evo.PVE_RESULTADO) weanPve[turnoKey] = evo.PVE_RESULTADO;

  // Tamizaje de candidato a PVE con los parámetros de este turno (criterios de
  // screening clásicos, ABC trial). Si el turno ya trae PVE registrado, el
  // tamizaje ya se resolvió y no se marca. Con datos incompletos no se marca
  // (conservador). Tampoco se marca cuando el turno declaró que NO CORRESPONDE
  // ('nc', ago-2026): el paciente cumple los números pero su causa de base no
  // está resuelta, y el kinesiólogo del turno ya lo dijo — insistirle con el
  // badge verde y con la alerta de racha sería ruido.
  let candPve = false;
  if (sopNew === 'VM' && evo.PVE_VAL !== 'si' && evo.PVE_VAL !== 'nc') {
    const _n = x => parseFloat(x);
    const dvaTxt = String(evo.HEMO_DVA || '');
    candPve = _n(evo.VENT_FIO2) > 0 && _n(evo.VENT_FIO2) <= 50 &&
      _n(evo.VENT_PEEP) > 0 && _n(evo.VENT_PEEP) <= 8 &&
      _n(evo.VENT_SPO2) >= 90 &&
      evo.HEMO_ESTADO !== 'Inestable' &&
      (dvaTxt === '' || /sin requerimientos|dosis bajas/i.test(dvaTxt)) &&
      !esVerdadero(evo.SED_BNM);
  }

  const vaNew = vaFin || cama.VIA_AEREA || 'Natural';
  const vaAnt = cama.VIA_AEREA || '';
  const esVA = (vaNew !== 'Natural');
  let fechaVA, horaVA;
  if (!esVA) {
    fechaVA = ''; horaVA = '';
  } else if (_vaCorregidoPrev && vaNew === vaAnt) {
    // ARRASTRE (D7): corregida y sin cambio de vía aérea → se hereda intacta.
    fechaVA = cama.FECHA_INICIO_VA; horaVA = cama.TS_INICIO_VA || '';
  } else if (vaNew !== vaAnt || !cama.FECHA_INICIO_VA) {
    const diasPrev = parseInt(evo.VA_EXTERNO_DIAS) || 0;
    fechaVA = (esVerdadero(evo.VA_EXTERNO) && diasPrev > 0) ? _restarDias(fecha, diasPrev) : fecha;
    horaVA = _tsDesdeHora(_horaValida(evo.INTUB_HORA) || _horaValida(evo.REINTUB_HORA) || _horaValida(evo.TQT_HORA)) || _tsAhora();
  } else {
    fechaVA = cama.FECHA_INICIO_VA; horaVA = cama.TS_INICIO_VA || '';
  }

  // ARRASTRE (D7) — soltar las marcas de los tramos que SÍ arrancaron de nuevo.
  // Un cambio de soporte o de vía aérea abre un tramo clínico distinto: la
  // fecha corregida describía el tramo anterior y mantenerla congelada dejaría
  // el contador arrancando donde ya no corresponde.
  if ((_sopCorregido && sopNew !== sopAnt) || (_vaCorregidoPrev && vaNew !== vaAnt)) {
    let _corr = coordCorrecciones(cama);
    if (_sopCorregido && sopNew !== sopAnt) _corr = _corr.filter(function (x) { return !x || x.c !== 'FECHA_INICIO_SOPORTE'; });
    if (_vaCorregidoPrev && vaNew !== vaAnt) _corr = _corr.filter(function (x) { return !x || x.c !== 'FECHA_INICIO_VA'; });
    _marcasSueltas = _corr.length ? JSON.stringify(_corr) : '';
  }

  const campos = {
    OCUPADA: true, STATUS_CAMA: 'Ocupada', PATIENT_ID: patientId, COD_PACIENTE: val(evo.COD_PACIENTE, cama.COD_PACIENTE),
    NOMBRE: val(evo.PAC_NOMBRE, cama.NOMBRE), EDAD: val(evo.PAC_EDAD, cama.EDAD), SEXO: val(evo.PAC_SEXO, cama.SEXO),
    RUT: _rutNormal(val(evo.PAC_RUT, cama.RUT)),   // PAC_RUT es transitorio: el RUT persiste solo en cama/archivo
    TALLA_CM: val(evo.PAC_TALLA, cama.TALLA_CM), PESO_IDEAL_KG: val(evo.PAC_PESO_IDEAL, cama.PESO_IDEAL_KG),
    BARTHEL: val(evo.PAC_BARTHEL, cama.BARTHEL), ECF: val(evo.PAC_ECF, cama.ECF),
    DIAGNOSTICO: val(evo.PAC_DIAGNOSTICO, cama.DIAGNOSTICO), DIAG_REM: val(evo.PAC_DIAG_REM, cama.DIAG_REM),
    CHARLSON: val(evo.PAC_CHARLSON, cama.CHARLSON), INGRESO_TIPO: val(evo.PAC_INGRESO_TIPO, cama.INGRESO_TIPO),
    // PAC_APACHE2 viaja transitorio (como PAC_RUT): persiste en la CAMA, no en EVOLUCIONES
    APACHE2: _apacheNorm(val(evo.PAC_APACHE2, cama.APACHE2)),
    AISLAMIENTO: esVerdadero(evo.PAC_AISLAMIENTO), AISL_MICRO: val(evo.PAC_AISL_MICRO, cama.AISL_MICRO),
    VIA_AEREA: val(vaFin, cama.VIA_AEREA) || 'Natural',
    TOT_NUMERO: val(evo.INTUB_TOT_N, val(evo.VENT_TOT_NUM, cama.TOT_NUMERO)),
    TOT_CM_LABIO: val(evo.INTUB_TOT_CM, val(evo.VENT_TOT_CM, cama.TOT_CM_LABIO)),
    TQT_TIPO: val(evo.VENT_TQT_TIPO, cama.TQT_TIPO),
    TQT_CALIBRE: val(evo.VENT_TQT_CALIBRE, cama.TQT_CALIBRE), SOPORTE: sopNew, MODO: val(modoFin, cama.MODO),
    FASE_JSON: val(evo.FASE_JSON, cama.FASE_JSON),
    KTM_NIVEL: esVerdadero(evo.KTM_REALIZADA) ? (evo.KTM_NIVEL_KTR || '') : (turno === 'Noche' ? (cama.KTM_NIVEL || '') : ''),
    KTM_SUSP: esVerdadero(evo.KTM_SUSPENDIDA),
    FIRMA_KINE: val(evo.PLAN_FIRMA_KINE, cama.FIRMA_KINE), AUTOR_EMAIL: evo.AUTOR_EMAIL || '',
    CAT_RESP_PJE: val(evo.CAT_RESP_PJE, cama.CAT_RESP_PJE),
    CAT_RESP_NIVEL: val(evo.CAT_RESP_NIVEL, cama.CAT_RESP_NIVEL),
    CAT_MOTOR_PJE: val(evo.CAT_MOTOR_PJE, cama.CAT_MOTOR_PJE),
    CAT_MOTOR_NIVEL: val(evo.CAT_MOTOR_NIVEL, cama.CAT_MOTOR_NIVEL),
    // Arrastre de últimas evaluaciones (matriz motora + badges de la grilla)
    ULT_COOP: val(evo.SED_COOPERACION, cama.ULT_COOP),
    ULT_MRC: val(evo.EVAL_T_MRC, cama.ULT_MRC),
    ULT_MRC_FECHA: val(evo.EVAL_T_MRC, '') !== '' ? fecha : (cama.ULT_MRC_FECHA || ''),
    ULT_FSS: val(evo.EVAL_T_FSS, cama.ULT_FSS),
    ULT_FSS_FECHA: val(evo.EVAL_T_FSS, '') !== '' ? fecha : (cama.ULT_FSS_FECHA || ''),
    ULT_DINAMO: val(evo.EVAL_T_DINAMO, cama.ULT_DINAMO),
    // Pimometría (v5.93): la presión de soporte y la Pimáx del episodio, para
    // que la campana decida mirando solo la cama.
    ULT_PS: val(evo.VENT_PS, cama.ULT_PS),
    ULT_PIM: val(evo.EVAL_T_PIM, cama.ULT_PIM),
    ULT_PIM_FECHA: val(evo.EVAL_T_PIM, '') !== '' ? fecha : (cama.ULT_PIM_FECHA || ''),
    // Dispositivos del circuito: cada uno sigue a lo que le da sentido, no
    // todos al soporte VM (Diego, 14-ago-2026). Al salir de VM el circuito se
    // descarta, PERO el Trach Care pertenece a la VÍA AÉREA y sobrevive si el
    // paciente queda con TOT/TQT (weaning a CTAF, por ejemplo), y el HME
    // sobrevive si queda respirando POR el HME (modo HME). El HEPA es del
    // ventilador: al salir de VM se limpia siempre. La humidificación activa
    // manda sobre el HME (excluyentes) y sigue al paciente (CNAF humidificada
    // la conserva); una reintubación fecha circuito nuevo desde el cliente
    // (force=true).
    DISP_HME_FECHA: (humidFinal || (dejaVM && modoFin !== 'HME')) ? '' : val(evo.DISP_HME_FECHA, cama.DISP_HME_FECHA),
    DISP_HEPA_FECHA: dejaVM ? '' : val(evo.DISP_HEPA_FECHA, cama.DISP_HEPA_FECHA),
    DISP_TC_FECHA: (dejaVM && vaNew !== 'TOT' && vaNew !== 'TQT') ? '' : val(evo.VENT_FECHA_SONDA, cama.DISP_TC_FECHA),
    DISP_HUMID_FECHA: humidFinal,
    WEAN_PVE_JSON: JSON.stringify(weanPve),
    WEAN_CAND_PVE: candPve,
    ULTIMO_TURNO_KEY: turnoKey,
    FECHA_INGRESO: cama.FECHA_INGRESO || (esIngreso ? fecha : ''),
    FECHA_INICIO_VA: fechaVA,
    FECHA_INICIO_SOPORTE: fechaSoporte,
    TS_INICIO_VA: horaVA,
    TS_INICIO_SOPORTE: horaSoporte,
    TS_INGRESO: cama.TS_INGRESO || '',
  };
  // Solo viaja si un tramo nuevo soltó su marca: si no, ni se menciona la
  // columna y el sello de correcciones queda intacto.
  if (_marcasSueltas !== null) campos.CORRECCIONES_JSON = _marcasSueltas;

  // Snapshot por turno (para la tabla de Registro Diario)
  const ktrCant = parseInt(evo.RESP_KTR_CANT) || 0;
  const ktmTurno = esVerdadero(evo.KTM_REALIZADA) ? (evo.KTM_NIVEL_KTR || '') : (esVerdadero(evo.KTM_SUSPENDIDA) ? 'C' : '');
  const procStr = evo.PROC_RESUMEN || '';
  const firmaT = evo.PLAN_FIRMA_KINE || '';
  if (turno === 'Dia') {
    campos.TEXTO_EVO_DIA = evo.TEXTO_GENERADO || ''; campos.KTR_DIA = ktrCant; campos.KTM_DIA = ktmTurno;
    campos.PROC_DIA = procStr; campos.FIRMA_DIA = firmaT; campos.KEY_DIA = turnoKey;
  } else {
    campos.TEXTO_EVO_NOCHE = evo.TEXTO_GENERADO || ''; campos.KTR_NOCHE = ktrCant;
    campos.PROC_NOCHE = procStr; campos.FIRMA_NOCHE = firmaT; campos.KEY_NOCHE = turnoKey;
  }
  if (timelineJson !== undefined && timelineJson !== null) campos.TIMELINE_JSON = timelineJson;
  if (filaCama !== undefined && filaCama !== null && filaCama > 0) {
    // Merge en memoria sobre la fila leída al inicio del guardado: mismo
    // resultado que repoActualizar (los campos no tocados conservan su valor,
    // null se vuelve ''), sin los dos viajes de volver a ubicar y releer.
    const filaNueva = Object.assign({}, cama);
    Object.keys(campos).forEach(function (k) { filaNueva[k] = (campos[k] == null) ? '' : campos[k]; });
    repoEscribirFila('CAMAS_ESTADO', filaCama, filaNueva);
  } else {
    repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, campos);
  }
}

/**
 * Cuántas veces se ha reintubado cada paciente EN SU EPISODIO EN CURSO.
 *
 * 🔴 La unidad es el EPISODIO, no la extubación. Esto NO es el indicador de
 * fracaso de extubación: allá la unidad es la EXTUBACIÓN (cada una es un
 * intento y cada reintubación ≤48 h es el fracaso de ESE intento), y por eso
 * un paciente extubado tres veces con dos reintubaciones son 3 intentos y 2
 * fracasos. Confundir los dos conteos es exactamente el error que este
 * proyecto ya pagó con «día con VM» y con `sin_condiciones`: dos definiciones
 * conviviendo y el tablero diciendo dos verdades del mismo mes.
 *
 * ⚠️ LÍMITE CONOCIDO: la fila se identifica por TURNO (ID_EVOLUCION +
 * '_REINTUB'), así que dos reintubaciones en el MISMO turno cuentan como una.
 * Es raro —exige extubar y reintubar dos veces en doce horas— y se deja así a
 * propósito: el identificador por turno es lo que hace que re-guardar una
 * evolución no duplique el evento.
 *
 * NO se llama desde obtenerTodasLasCamas a propósito: el censo es camino
 * caliente (corre en cada arranque y cada refresco) y este dato solo se usa al
 * imprimir. Se paga el viaje cuando se aprieta el botón, no siempre.
 *
 * @param  pids  arreglo de PATIENT_ID; si viene vacío devuelve {}.
 * @return {ok:true, data:{ '<pid>': n }} — los pids sin reintubaciones no salen.
 */
function contarReintubaciones(pids) {
  try {
    const lista = (pids || []).map(String).filter(x => x !== '');
    if (!lista.length) return ok({});
    const quiero = {};
    lista.forEach(p => { quiero[p] = true; });
    const conteo = {};
    repoLeerTodos('REINTUBACIONES').forEach(r => {
      const pid = String(r.PATIENT_ID || '');
      if (pid && quiero[pid]) conteo[pid] = (conteo[pid] || 0) + 1;
    });
    return ok(conteo);
  } catch (e) { return err('contarReintubaciones: ' + e.message, ERR.INTERNO, e); }
}

// Registra un evento en la hoja REINTUBACIONES (idempotente por ID_EVOLUCION).
function _registrarReintubacion(evo, idCama, idEvolucion, fecha, turno, ctx, _evosFn) {
  const idReintub = idEvolucion + '_REINTUB';
  const fila = {
    ID_REINTUB: idReintub, PATIENT_ID: evo.PATIENT_ID || '', TIMESTAMP: ahoraTS(), FECHA: fecha, TURNO: turno,
    ID_CAMA: String(idCama), ID_EVOLUCION: idEvolucion, NOMBRE: evo.PAC_NOMBRE || '', COD_PACIENTE: evo.PAC_COD || '',
    DIAGNOSTICO: evo.PAC_DIAGNOSTICO || '', TIPO_DESVINCULACION: evo.EXT_TIPO || '', MOTIVO: evo.EXT_REINTUB_RAZ || '',
    SOPORTE_PREVIO: evo.REINTUB_SOP_PREV || evo.EXT_PE_SOP || '',
    TIEMPO_EXTUBADO: _tiempoExtubado(evo, idCama, fecha, turno, _evosFn),
    HORA_REINTUBACION: evo.REINTUB_HORA || evo.EXT_HORA || '',
    KINESIOLOGO: evo.PLAN_FIRMA_KINE || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
  };
  repoUpsert('REINTUBACIONES', 'ID_REINTUB', idReintub, fila);
}

/**
 * Horas entre la extubación previa del episodio y la reintubación.
 *
 * 🔴 MANDA EL RELOJ, NO EL TURNO (regla de Diego, 14-ago-2026). Este número es
 * el que después permite distinguir una reintubación de una intubación nueva
 * —«no es reintubación sino intubación, por los días»—, así que tiene que ser
 * el tiempo REAL entre los dos momentos.
 *
 * Hasta ago-2026 se calculaba mal por los dos extremos:
 *   · la reintubación se fechaba con la FECHA DEL TURNO, y el turno Noche
 *     pertenece al día anterior hasta las 09:00 ⇒ una reintubación de las
 *     03:00 quedaba **24 h corta**;
 *   · y arriba de eso había un `if (horas < 0) horas += 24`, o sea el síntoma
 *     tapado en el resultado en vez de arreglado en la fecha.
 * Ahora los dos extremos se resuelven con `_tsEventoTurno`, el mismo mecanismo
 * que fecha el ciclo de prono desde la v5.33.
 *
 * NO se usa `EXT_TS` para el momento de la extubación aunque exista: lo arma
 * el navegador con `new Date()`, o sea con el día en que alguien ESCRIBIÓ la
 * evolución, que no tiene por qué ser el día en que se extubó (turno noche,
 * o una evolución corregida al día siguiente). Sirve para el globito de las
 * 48 h, que es un aviso en vivo; no para medir.
 *
 * Devuelve '' si no es computable —falta la hora de la reintubación o no hay
 * extubación registrada en el episodio—. Nunca un número inventado.
 *
 * `_evosFn` (opcional): lector perezoso del episodio ya bajado por quien
 * llama (el guardado), en la misma petición y sin escrituras a EVOLUCIONES
 * entre medio que cambien lo buscado (solo se miran turnos ANTERIORES).
 */
function _tiempoExtubado(evo, idCama, fecha, turno, _evosFn) {
  try {
    const horaRe = evo.REINTUB_HORA || evo.EXT_HORA || '';
    if (!horaRe) return '';
    const tsRe = _tsEventoTurno(fecha, turno, horaRe);

    // (a) La extubación del MISMO turno (reintubación anidada tras la PVE).
    let tsExt = (esVerdadero(evo.EXT_OCURRIO) && evo.EXT_HORA)
      ? _tsEventoTurno(fecha, turno, evo.EXT_HORA) : '';

    // (b) Si no, la extubación más reciente del episodio, con SU fecha y SU
    //     turno. Solo se miran turnos anteriores o el propio.
    if (!tsExt) {
      const evos = (_evosFn ? _evosFn() : repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama)))
        .filter(function (e) {
          return esVerdadero(e.EXT_OCURRIO) && e.EXT_HORA &&
            String(e.PATIENT_ID) === String(evo.PATIENT_ID || '') &&
            String(e.TURNO_KEY) <= String(evo.TURNO_KEY || '');
        });
      evos.sort(function (a, b) { return String(b.TURNO_KEY).localeCompare(String(a.TURNO_KEY)); });
      if (evos.length) {
        tsExt = _tsEventoTurno(_statISO(evos[0].FECHA), evos[0].TURNO, evos[0].EXT_HORA);
      }
    }
    if (!tsExt) return '';

    const h = _horasEntreTS(tsExt, tsRe);
    return h === '' ? '' : h + ' h';
  } catch (e) { return ''; }
}

// ═══ LECTURA ══════════════════════════════════════════════
/**
 * _ubicarEvolucionDeTurno — ubica LA fila de un turno por EPISODIO, no por clave.
 *
 * 🔴 POR QUÉ EXISTE. `ID_EVOLUCION = 'CAMA_<n>_<turnoKey>'` identifica una CAMA
 * en un turno, no a una persona. Cuando una cama rota, dos episodios comparten
 * esa clave — **39 veces en agosto-2026**, medido en la planilla real — y
 * `repoBuscarPorId` devuelve la PRIMERA y esconde la otra. Todo lo que resuelve
 * por esa clave (el ➕ del Registro Diario, los procedimientos, la anulación)
 * puede escribirle a la persona equivocada, o negarle la escritura a la correcta
 * mientras su fila está justo debajo, inalcanzable.
 *
 * Devuelve la fila **por número**, nunca la clave: `repoActualizar` escribe en la
 * primera coincidencia, que es exactamente el bug que esto viene a cerrar.
 *
 * 🩤 NO elige cuando no puede: `{ambigua:true}` es una respuesta, no un fallo.
 * Elegir por su cuenta es lo que hace hoy `repoBuscarPorId`.
 *
 * @param  patientId  el episodio. Vacío = payload viejo (API, smoke, medidores).
 * @param  turnoKey   'YYYY-MM-DD-Dia|Noche'
 * @param  idCama     solo se usa para armar la clave cuando no hay patientId
 * @return {{hoja:string, fila:number, obj:Object, vivo:boolean}} la evolución
 *         | {ambigua:true}  calza con más de una y NO se elige
 *         | null            no existe
 */
function _ubicarEvolucionDeTurno(patientId, turnoKey, idCama) {
  const pid = String(patientId == null ? '' : patientId).trim();
  const tk = String(turnoKey == null ? '' : turnoKey).trim();
  if (!tk) return null;
  const HOJAS = ['EVOLUCIONES', 'EVOLUCIONES_ARCHIVO'];

  /* Se baja la hoja ENTERA de una vez, a propósito. Medido en la planilla real
     (8-ago-2026, ocho comparaciones): con 136 filas en EVOLUCIONES y 90 en el
     archivo, UNA lectura completa le gana a pedir columnas sueltas — en Apps
     Script el viaje pesa más que la celda. Y la fila vuelve COMPLETA, que es
     condición para que quien la reciba pueda reescribirla: `_colsExigirCompleto`
     rechaza lo leído a medias. No se cachea nada — dato clínico: se lee, se
     resuelve y se descarta dentro de la misma petición. */

  if (pid) {
    // Con el episodio en la mano se resuelve por él, no por la cama: tras un
    // traslado el `ID_EVOLUCION` de la fila lleva la cama NUEVA.
    for (let i = 0; i < HOJAS.length; i++) {
      const hoja = HOJAS[i];
      const hit = repoLeerTodosConFila(hoja).filter(function (f) {
        return String(f.obj.TURNO_KEY).trim() === tk &&
               String(f.obj.PATIENT_ID).trim() === pid;
      });
      // Dos filas del MISMO episodio en el MISMO turno dentro de una hoja es un
      // duplicado real: no hay criterio para elegir, y elegir es el bug.
      if (hit.length > 1) return { ambigua: true };
      if (hit.length === 1) {
        return { hoja: hoja, fila: hit[0].fila, obj: hit[0].obj, vivo: hoja === 'EVOLUCIONES' };
      }
    }
    /* Entre hojas manda la VIVA — por eso el recorrido empieza por ella. Aquí SÍ
       hay criterio, al revés que abajo: con el pid pedido se sabe que las dos
       filas son del MISMO episodio (hay 1 clave duplicada entre hoja viva y
       archivo en la planilla real), y la viva es la que se sigue editando. Es el
       mismo criterio que ya eligió `obtenerEvosDelDia` para el Registro Diario;
       las dos pantallas no pueden discrepar sobre la misma fila.

       Y con pid pedido NO se cae a una fila de `PATIENT_ID` vacío: adoptarla
       puede ser adoptar la del paciente anterior. Esa decisión es de quien llama,
       que tiene la cama a la vista; el localizador no la toma por él. */
    return null;
  }

  /* Sin pid (payload viejo): se resuelve por clave, pero CONTANDO en las DOS
     hojas. Detectar solo «aparece en las dos» no basta — el duplicado que se
     acumula solo es el de dentro de EVOLUCIONES_ARCHIVO, que archiva conservando
     la clave. Y aquí no se puede aplicar el «manda la viva» de arriba: sin pid no
     hay cómo saber si las dos filas son el mismo episodio o dos personas. */
  const clave = 'CAMA_' + idCama + '_' + tk;
  const halladas = [];
  HOJAS.forEach(function (hoja) {
    repoLeerTodosConFila(hoja).forEach(function (f) {
      if (String(f.obj.ID_EVOLUCION).trim() !== clave) return;
      halladas.push({ hoja: hoja, fila: f.fila, obj: f.obj, vivo: hoja === 'EVOLUCIONES' });
    });
  });
  if (!halladas.length) return null;
  if (halladas.length > 1) return { ambigua: true };
  return halladas[0];
}

function obtenerEvolucion(idCama, turnoKey, patientId) {
  try {
    /* Antes resolvía con `repoBuscarPorId` sobre la clave de la cama, y solo en
       la hoja viva: en una cama rotada devolvía LA PRIMERA —la del otro
       paciente— y de un egresado no devolvía nada. Ahora lo ubica el localizador,
       que mira las dos hojas y AVISA cuando no puede decidir en vez de elegir. */
    const ubic = _ubicarEvolucionDeTurno(String(patientId || ''), turnoKey, idCama);
    if (ubic && ubic.ambigua) {
      return err('La cama ' + idCama + ' tuvo dos pacientes en ese turno: hay que indicar de cuál ' +
        'se está hablando.', ERR.VALIDACION);
    }
    return ok(ubic ? ubic.obj : null);
  } catch (e) { return err('obtenerEvolucion: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Evolución inmediatamente ANTERIOR a un turno (para replicar y bajar el roce).
 * Como turnoKey = "YYYY-MM-DD-Dia|Noche", el orden alfabético coincide con el
 * cronológico (Dia < Noche). Devuelve la más reciente estrictamente anterior.
 *
 * `_evos` (opcional): las evoluciones de la cama que quien llama YA tiene en la
 * mano, de la misma petición y sin ninguna escritura de por medio. No es un
 * caché — nada sobrevive a la petición — sino no volver a pedir lo mismo dos
 * veces seguidas. Sin el parámetro se comporta exactamente como antes.
 */
function obtenerEvolucionPrevia(idCama, turnoKey, _evos) {
  try {
    const evos = _evos || repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    const objetivo = String(turnoKey);
    let mejor = null, mejorKey = '';
    let mejorDia = null, mejorDiaKey = '';
    evos.forEach(e => {
      const k = String(e.TURNO_KEY || '');
      if (!k || k >= objetivo) return;
      if (k > mejorKey) { mejor = e; mejorKey = k; }
      if (/-Dia$/.test(k) && k > mejorDiaKey) { mejorDia = e; mejorDiaKey = k; }
    });
    // Terapia física (KTM/IMT/EMS) se replica DÍA→DÍA: la Noche intermedia no
    // aporta ese bloque (de noche va oculto y limpio). Si la previa inmediata
    // no es de día, viaja adjunta la última evolución de turno Día.
    if (mejor && mejorDia && mejorDiaKey !== mejorKey) mejor._PREVIA_DIA = mejorDia;
    // Racha de válvula de fonación: turnos CONSECUTIVOS hacia atrás con la
    // válvula como modo (o con uso registrado). ~12 h por turno — alimenta la
    // frase de la decanulación («Cumple ~24 h con válvula de fonación…»).
    if (mejor) {
      const orden = evos.map(e => String(e.TURNO_KEY || '')).filter(k => k && k < objetivo).sort().reverse();
      const porKey = {}; evos.forEach(e => { porKey[String(e.TURNO_KEY || '')] = e; });
      let racha = 0;
      for (let i = 0; i < orden.length; i++) {
        const e2 = porKey[orden[i]];
        if (e2 && (String(e2.VENT_MODO) === 'Válvula de fonación' || String(e2.VENT_MODO_FINAL) === 'Válvula de fonación' || esVerdadero(e2.VFON_USADA))) racha++;
        else break;
      }
      mejor._VFON_HORAS = racha * 12;
    }
    // (Aquí vivía `mejor._PRONO_ABIERTO_TS`, retirado en ago-2026: ningún
    // consumidor lo leía —ni el servidor, ni el index, ni el cohete desplegado—
    // y costaba una bajada COMPLETA de EVOLUCIONES por cada apertura de
    // paciente. La pronación abierta llega al cliente por su vía real: el campo
    // `pronoAbierto` de GET_EVO_TURNO, que sí se consume.)
    return ok(mejor);
  } catch (e) { return err('obtenerEvolucionPrevia: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Turno actual + previa en UNA llamada (evita 2 round-trips seriales al abrir el panel).
 */
function obtenerEvoTurno(idCama, turnoKey) {
  try {
    // UNA sola bajada del episodio responde las TRES preguntas: el turno
    // actual, la previa y la pronación abierta miran exactamente las mismas
    // filas, y entre una y otra no hay ninguna escritura (esta acción solo
    // lee). El turno actual se deriva del episodio en vez de buscarse aparte:
    // ID_EVOLUCION es 'CAMA_<idCama>_<turnoKey>', así que dentro de las filas
    // de la cama, coincidir en TURNO_KEY ⇔ coincidir en ID_EVOLUCION (misma
    // primera-fila que devolvía la búsqueda por columna).
    const evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    const tk = String(turnoKey);
    let actual = null;
    for (let i = 0; i < evos.length; i++) {
      if (String(evos[i].TURNO_KEY || '') === tk) { actual = evos[i]; break; }
    }
    // La previa viaja SIEMPRE, también cuando el turno ya está guardado: el
    // formulario la usa para mostrar «Antes: X → Y» bajo los campos de estado
    // (vía aérea, soporte, modo, tubo), y al RE-EDITAR es justo cuando importa
    // ver qué cambió respecto del turno anterior. No cuesta una lectura más —
    // recorre el mismo `evos` que ya está en memoria (Ola 1).
    const _rp = obtenerEvolucionPrevia(idCama, turnoKey, evos);
    const previa = (_rp.ok && _rp.data) ? _rp.data : null;
    // La pronación abierta viaja SIEMPRE (también al re-editar un turno ya
    // guardado, donde la supinación puede agregarse recién ahora).
    return ok({ actual: actual, previa: previa, pronoAbierto: _pronoAbiertoTS(idCama, turnoKey, evos) });
  } catch (e) { return err('obtenerEvoTurno: ' + e.message, ERR.INTERNO, e); }
}

function obtenerEvolucionesRecientes(idCama, limite) {
  try {
    const evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    evos.sort((a, b) => String(b.TURNO_KEY).localeCompare(String(a.TURNO_KEY)));
    return ok(limite ? evos.slice(0, limite) : evos);
  } catch (e) { return err('obtenerEvolucionesRecientes: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Evoluciones registradas en una fecha (ambos turnos), versión mínima.
 * Alimenta los dots verdes del grid (EVO_SET) y la vista retrospectiva.
 * @param {string} fecha  'yyyy-MM-dd'
 */
function obtenerEvosDelDia(fecha) {
  try {
    const f = String(fecha || hoyISO()).slice(0, 10);
    // Lectura acotada: solo las filas del día (antes bajaba la hoja completa,
    // 379 columnas × todo el historial, en CADA arranque de la app).
    const delDia = function (k) { return String(k).indexOf(f) === 0; };
    /* 🔴 Se leen las DOS hojas. Al dar el alta, `_archivarEvolucionesDeCama`
       mueve las filas del episodio a EVOLUCIONES_ARCHIVO: leyendo solo la hoja
       viva, el día de cualquier paciente ya egresado desaparecía del Registro
       Diario y la tarjeta caía al ocupante ACTUAL de la cama — otra persona.
       Medido en la planilla real el 20-ago-2026: 365 turnos de 45 episodios,
       el 60,7% del registro de agosto. El REM y los indicadores nunca lo
       sufrieron porque ellos ya leían las dos (svc_rem, svc_stats).
       El costo es una lectura más de la columna TURNO_KEY: un viaje, porque
       `repoLeerFiltrado` baja la clave y después solo los tramos que marcó. */
    const vivas = repoLeerFiltrado('EVOLUCIONES', 'TURNO_KEY', delDia);
    const archivadas = repoLeerFiltrado('EVOLUCIONES_ARCHIVO', 'TURNO_KEY', delDia);
    /* Una fila puede estar en las dos si un archivado quedó a medias (2 casos
       en la planilla real). Manda la viva, que es la que se sigue editando.
       El orden —vivas primero, archivadas después— es estable a propósito: una
       cama puede tener DOS episodios el mismo turno (el que egresa y el que
       ingresa ese día, 39 veces en agosto) y quien lea no puede depender de
       cuál venga antes. */
    const clave = function (e) {
      return String(e.ID_CAMA) + '|' + String(e.TURNO_KEY) + '|' + String(e.PATIENT_ID);
    };
    const yaEsta = {};
    vivas.forEach(function (e) { yaEsta[clave(e)] = true; });
    const evos = vivas
      .concat(archivadas.filter(function (e) { return !yaEsta[clave(e)]; }))
      .map(function (e) {
        return {
          ID_CAMA: String(e.ID_CAMA), TURNO_KEY: String(e.TURNO_KEY),
          // Registro Diario (pestaña 📋): lo hecho en cada turno, por cama
          PAC_NOMBRE: e.PAC_NOMBRE, PAC_EDAD: e.PAC_EDAD, PAC_SEXO: e.PAC_SEXO,
          PAC_DIAGNOSTICO: e.PAC_DIAGNOSTICO, VENT_SOPORTE: e.VENT_SOPORTE,
          DIA_ESTADIA: e.DIA_ESTADIA, DIAS_VM: e.DIAS_VM,
          DIAS_VM_PREVIOS: e.DIAS_VM_PREVIOS, DIAS_VNI_PREVIOS: e.DIAS_VNI_PREVIOS,
          RESP_KTR_CANT: e.RESP_KTR_CANT,
          KTM_REALIZADA: e.KTM_REALIZADA, KTM_SUSPENDIDA: e.KTM_SUSPENDIDA,
          KTM_NIVEL_KTR: e.KTM_NIVEL_KTR,
          PROC_RESUMEN: e.PROC_RESUMEN, PLAN_FIRMA_KINE: e.PLAN_FIRMA_KINE,
          EXT_OCURRIO: e.EXT_OCURRIO, DECAN_OCURRIO: e.DECAN_OCURRIO,
          // Vista retrospectiva de CAMAS: la tarjeta se reconstruye con lo que
          // se registró ESE día, no con el ocupante actual de la cama.
          PATIENT_ID: e.PATIENT_ID, COD_PACIENTE: e.COD_PACIENTE,
          VENT_VIA_AEREA: e.VENT_VIA_AEREA_FINAL || e.VENT_VIA_AEREA || '',
          VENT_MODO: e.VENT_MODO_FINAL || e.VENT_MODO || '',
          KTM_NIVEL: e.KTM_NIVEL_KTR, FASE_JSON: e.FASE_JSON,
        };
      });
    /* Los ANEXOS del día viajan pegados a su evolución (24-ago-2026): el sello
       del ➕ en el Registro Diario lleva una × para borrarlo, y esa × necesita
       la identidad real de la fila (ID_PROC) — nunca «el nombre más parecido».
       Solo TIPO_PROC='anexo': los procedimientos del guardado no se borran
       desde el Registro (se corrigen re-guardando la evolución). Cada anexo se
       consume en UNA evolución: en una cama rotada, el pid decide de quién es,
       y el anexo sin pid (cama reparada a mano) se pega al primero que calce. */
    try {
      const anexos = repoLeerFiltrado('PROCEDIMIENTOS', 'FECHA', function (k) { return _statISO(k) === f; })
        .filter(function (p) { return String(p.TIPO_PROC) === 'anexo'; });
      if (anexos.length) {
        const usado = {};
        evos.forEach(function (e) {
          const propios = [];
          anexos.forEach(function (p, i) {
            if (usado[i]) return;
            if (String(p.ID_CAMA) !== String(e.ID_CAMA)) return;
            if ((_statISO(p.FECHA) + '-' + String(p.TURNO)) !== String(e.TURNO_KEY)) return;
            const pp = String(p.PATIENT_ID || ''), pe = String(e.PATIENT_ID || '');
            if (pp && pe && pp !== pe) return;
            usado[i] = true;
            propios.push({ id: String(p.ID_PROC), nombre: String(p.NOMBRE_PROC || ''), ts: String(p.TIMESTAMP || '') });
          });
          if (propios.length) e.ANEXOS = propios;
        });
      }
    } catch (e2) { /* sin anexos legibles: el Registro sale igual, sin × */ }
    return ok(evos);
  } catch (e) { return err('obtenerEvosDelDia: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Historial de un episodio: hitos + evoluciones (activas y archivadas), por PATIENT_ID.
 */
function obtenerHistorialPaciente(idCama, patientId) {
  try {
    if (!patientId) {
      const rc = obtenerCama(idCama);
      if (rc.ok && rc.data.PATIENT_ID) patientId = rc.data.PATIENT_ID;
    }
    let hitos = patientId
      ? repoLeerTodos('TIMELINE', 'PATIENT_ID', patientId)
      : repoLeerTodos('TIMELINE', 'ID_CAMA', String(idCama));
    hitos.sort((a, b) => String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)));

    let evos = [];
    if (patientId) {
      evos = repoLeerTodos('EVOLUCIONES', 'PATIENT_ID', patientId)
        .concat(repoLeerTodos('EVOLUCIONES_ARCHIVO', 'PATIENT_ID', patientId));
    } else {
      evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    }
    evos.sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));

    return ok({ hitos, evoluciones: evos });
  } catch (e) { return err('obtenerHistorialPaciente: ' + e.message, ERR.INTERNO, e); }
}


/**
 * Anula un evento único ya guardado en un turno (marcado por error):
 * borra sus columnas, lo quita de los procedimientos, recalcula el estado
 * final de VA y los pliegues de contadores, regenera el texto y re-sincroniza
 * la cama (incluidas las fechas de inicio de soporte/VA para que los días
 * no se reinicien). Solo permitido si NO existen evoluciones posteriores del
 * paciente (para no romper la historia construida sobre el evento).
 */
function anularEvento(datos, ctx) {
  const idCama = String(datos.idCama || datos.ID_CAMA || '');
  const turnoKey = String(datos.turnoKey || datos.TURNO_KEY || '');
  const tipo = String(datos.tipo || '');
  if (!idCama || !turnoKey || !tipo) return err('Faltan idCama/turnoKey/tipo.', ERR.VALIDACION);

  const evoR = obtenerEvolucion(idCama, turnoKey, datos.patientId);
  if (!evoR.ok) return evoR;   // p. ej. la cama tuvo dos pacientes ese turno
  if (!evoR.data) return err('No existe evolución para ese turno.', ERR.VALIDACION);
  const evo = evoR.data;

  /* 🔴 CANDADO MÍNIMO. Al final, `anularEvento` llama a `_syncCamaDesdeEvolucion`
     con los datos de la evolución: vía aérea, soporte, modo, fechas de inicio.
     Si esa evolución es de un episodio que ya no ocupa la cama, ese sync le
     reescribe el censo AL OCUPANTE ACTUAL — escribe más lejos que el bug que
     esta tanda vino a cerrar. Anular sobre episodios cerrados es deuda conocida
     y queda fuera (NO3 del PRD); lo que no puede pasar es que toque a un tercero. */
  const _camaAnu = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
  const _pidCama = String((_camaAnu && _camaAnu.PATIENT_ID) || '');
  const _pidEvo = String(evo.PATIENT_ID || '');
  if (_pidCama && _pidEvo && _pidCama !== _pidEvo) {
    return err('Esa evolución es de un episodio anterior de la cama ' + idCama + '. Anular desde ' +
      'aquí le reescribiría el estado al paciente que está ahora.', ERR.VALIDACION);
  }

  // Guard: sin evoluciones posteriores del mismo paciente
  const posteriores = repoLeerTodos('EVOLUCIONES', 'PATIENT_ID', evo.PATIENT_ID)
    .filter(function (e) { return String(e.TURNO_KEY) > turnoKey; });
  if (posteriores.length) {
    return err('Solo se puede anular un evento desde la ÚLTIMA evolución del paciente (hay ' +
      posteriores.length + ' turnos posteriores que se construyeron sobre este estado).', ERR.VALIDACION);
  }

  const GRUPOS = {
    pve_ext: ['PVE_RESULTADO','PVE_FR_MOTIVOS','PVE_SC_RAZON','PVE_SC_DET','PVE_VAL','EXT_OCURRIO','EXT_HORA','EXT_TS','EXT_TIPO','EXT_MOTIVO','EXT_POST_DET','EXT_PE_VA','EXT_PE_SOP','EXT_PE_MODO'],
    reintub: ['REINTUB_TOT_N','REINTUB_TOT_CM','REINTUB_MODO','REINTUB_PARAMS','REINTUB_HORA','REINTUB_SOP_PREV','EXT_REINTUB','EXT_REINTUB_RAZ','REINTUB_SOP_POST','REINTUB_VT','REINTUB_FR','REINTUB_PEEP','REINTUB_FIO2','REINTUB_SPO2','REINTUB_PMAX','REINTUB_PPL','REINTUB_AUTOPEEP','REINTUB_PS','REINTUB_PAFI'],
    intub:   ['INTUB_OCURRIO','INTUB_HORA','INTUB_DET','INTUB_SOP_PREVIO','INTUB_VA_PREVIA','INTUB_MODO_PREVIO','INTUB_VA_POST','INTUB_SOP_POST','INTUB_MODO_POST','INTUB_TOT_N','INTUB_TOT_CM','INTUB_VT','INTUB_FR','INTUB_PEEP','INTUB_FIO2','INTUB_SPO2'],
    decan:   ['DECAN_OCURRIO','DECAN_TIPO','DECAN_QUEDA_DISP','DECAN_QUEDA_FLUJO','DECAN_QUEDA_SPO2','DECAN_DET','DECAN_RECANUL'],
    desvinc: ['DESVINC_OCURRIO','DESVINC_HORA','DESVINC_A','DESVINC_MOTIVO','DESVINC_RECONEXION','DESVINC_HORA_RECON','DESVINC_HORAS','DESVINC_DET'],
    cambio_tot: ['TOT_CAMBIO','TOT_CAMBIO_MOTIVO'],
    cambio_tqt: ['TQT_CAMBIO','TQT_CAMBIO_MOTIVO'],
  };
  const PROCS_QUITAR = {
    pve_ext: ['PVE','EXTUBACIÓN C/PROTOCOLO','EXTUBACIÓN S/PROTOCOLO','AUTOEXTUBACIÓN','EXTUBACIÓN ACCIDENTAL'],
    reintub: ['REINTUBACIÓN'],
    intub:   ['INTUBACIÓN'],
    decan:   ['DECANULACIÓN','RECANULACIÓN'],
    desvinc: ['DESVINCULACIÓN'],
    cambio_tot: ['CAMBIO TOT'],
    cambio_tqt: ['CAMBIO TQT'],
  };
  if (!GRUPOS[tipo]) return err('Tipo de evento desconocido: ' + tipo, ERR.VALIDACION);

  const tipos = [tipo];
  // Anular la extubación arrastra la reintubación anidada del mismo turno
  if (tipo === 'pve_ext' && esVerdadero(evo.EXT_REINTUB)) tipos.push('reintub');

  return conLock(function () {
    tipos.forEach(function (t) {
      GRUPOS[t].forEach(function (c) { evo[c] = ''; });
      if (t === 'reintub') {
        repoEliminarDonde('REINTUBACIONES', function (r) { return String(r.ID_REINTUB) === evo.ID_EVOLUCION + '_REINTUB'; });
        evo.N_REINTUB = Math.max(0, (parseInt(evo.N_REINTUB) || 1) - 1);
      }
    });

    // Procedimientos: quitar los del evento
    let procs = [];
    try { procs = JSON.parse(evo.PROC_JSON || '[]') || []; } catch (e) {}
    const quitar = tipos.reduce(function (a, t) { return a.concat(PROCS_QUITAR[t]); }, []);
    procs = procs.filter(function (p) {
      const up = String(p).toUpperCase();
      return !quitar.some(function (q) { return up === q || up.indexOf(q + ' ') === 0; });
    });
    evo.PROC_JSON = JSON.stringify(procs);
    evo.PROC_RESUMEN = procs.join(', ');
    evo.PROC_CANTIDAD = procs.length;

    // Estado final de VA y pliegue de contadores vuelven al estado del turno
    if (tipo !== 'cambio_tot' && tipo !== 'cambio_tqt') {
      evo.VENT_VIA_AEREA_FINAL = evo.VENT_VIA_AEREA;
      evo.VENT_SOPORTE_FINAL = evo.VENT_SOPORTE;
      evo.VENT_MODO_FINAL = evo.VENT_MODO;
      if (tipo === 'pve_ext' || tipo === 'decan') {
        const dvm = parseInt(evo.DIAS_VM) || 0;
        evo.DIAS_VM_PREVIOS = Math.max(0, (parseInt(evo.DIAS_VM_PREVIOS) || 0) - dvm);
      }
    }

    evo.TEXTO_GENERADO = generarTextoEvolucion(evo);
    repoUpsert('EVOLUCIONES', 'ID_EVOLUCION', evo.ID_EVOLUCION, evo);

    // Re-sincronizar la cama y restaurar las fechas de inicio (para que los
    // contadores de días de VM/VA no se reinicien tras la anulación)
    const fecha = _statISO(evo.FECHA);
    const rc = obtenerCama(idCama);
    const cama = rc.ok ? rc.data : {};
    _syncCamaDesdeEvolucion(idCama, cama, evo, evo.TURNO, turnoKey, fecha, evo.PATIENT_ID);
    if (tipo !== 'cambio_tot' && tipo !== 'cambio_tqt') {
      const rest = function (iso, n) {
        const dt = new Date(iso + 'T12:00:00');
        dt.setDate(dt.getDate() - n);
        return Utilities.formatDate(dt, leerConfig('TIMEZONE', 'America/Santiago'), 'yyyy-MM-dd');
      };
      const campos = {};
      const dvm = parseInt(evo.DIAS_VM) || 0, dva = parseInt(evo.DIAS_VA) || 0;
      // ARRASTRE (D7): esta restauración deriva la fecha de inicio RESTANDO los
      // días que traía la evolución. Sobre una fecha corregida por la
      // coordinación eso la deshace en silencio — y era el segundo camino por
      // el que la corrección de un egresado de 28 días se perdía. Aquí no se
      // suelta la marca: anular un evento no abre un tramo clínico nuevo, lo
      // que hace es borrar uno que se había marcado por error.
      const _camaAct = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama) || {};
      if (evo.VENT_SOPORTE === 'VM' && fecha && !coordCampoCorregido(_camaAct, 'FECHA_INICIO_SOPORTE')) campos.FECHA_INICIO_SOPORTE = rest(fecha, dvm);
      if (evo.VENT_VIA_AEREA && evo.VENT_VIA_AEREA !== 'Natural' && fecha && !coordCampoCorregido(_camaAct, 'FECHA_INICIO_VA')) campos.FECHA_INICIO_VA = rest(fecha, dva);
      if (Object.keys(campos).length) repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, campos);
    }

    return ok({
      idEvolucion: evo.ID_EVOLUCION, idCama: idCama, patientId: evo.PATIENT_ID || '',
      turnoKey: turnoKey, accion: 'anular_' + tipos.join('+'), entidad: 'EVOLUCIONES',
      TEXTO_GENERADO: evo.TEXTO_GENERADO || '',
    });
  });
}

// ── Ciclo de prono ──────────────────────────────────────────────────────────
//  Una sesión de prono puede durar VARIOS DÍAS, así que la hora sola no basta:
//  se sella el momento real (fecha del turno resuelta contra la hora escrita —
//  el turno Noche cruza la medianoche) y la cuenta se cierra en la evolución
//  que supina, contra la pronación abierta del episodio. Da igual quién prone y
//  quién supine, ni cuántos turnos pasen en medio.

/**
 * Nombre del procedimiento de un ciclo de posición, en la forma CANÓNICA:
 * «PRONO 20:03 HRS» / «SUPINACIÓN 07:30 HRS» (sin hora, el nombre pelado).
 *
 * 🔴 Este formato NO es decorativo: es EL MISMO que arma `_autoProcs()` en el
 * front (v2/index.html) al marcar la casilla del turno. Coincidir carácter a
 * carácter es lo que hace que el `Set` del guardado deduplique — si el ➕
 * escribiera «PRONO» y el formulario «PRONO 20:03 HRS», la misma pronación
 * entraría DOS VECES a PROCEDIMIENTOS y la estadística contaría dos ciclos.
 * La guardia `prono_desde_el_mas.js` compara las dos formas.
 */
function _procNombreCiclo(clave, hora) {
  const base = (String(clave || '').toUpperCase() === 'SUPINO') ? 'SUPINACIÓN' : 'PRONO';
  const h = String(hora || '').trim();
  return h ? (base + ' ' + h + ' HRS') : base;
}

/** Sella PRONO_INICIO_TS / SUPINO_TS y cierra PRONO_HORAS al supinar. */
function _pronoSellarCiclo(idCama, turnoKey, fecha, turno, datos, _evos) {
  if (esVerdadero(datos.RESP_PRONO_EVENTO)) {
    datos.PRONO_INICIO_TS = _tsEventoTurno(fecha, turno, datos.RESP_PRONO_HORA);
  }
  if (esVerdadero(datos.RESP_SUPINO_EVENTO)) {
    const ts = _tsEventoTurno(fecha, turno, datos.RESP_SUPINO_HORA);
    datos.SUPINO_TS = ts;
    // si se pronó y supinó en el mismo turno, el inicio es el de esta misma fila
    const ini = datos.PRONO_INICIO_TS || _pronoAbiertoTS(idCama, turnoKey, _evos);
    const h = ini ? _horasEntreTS(ini, ts) : '';
    datos.PRONO_HORAS = (h === '' ? '' : h);
  }
}

/**
 * Momento de la pronación ABIERTA del episodio (la última sin supinación
 * posterior), mirando los turnos anteriores a turnoKey. '' si no hay ninguna.
 *
 * `_evos` (opcional): el episodio ya leído por quien llama, en la misma
 * petición y sin escrituras de por medio. Ver obtenerEvolucionPrevia.
 */
function _pronoAbiertoTS(idCama, turnoKey, _evos) {
  try {
    const evos = _evos || repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
    const objetivo = String(turnoKey || '');
    const previas = evos
      .filter(e => { const k = String(e.TURNO_KEY || ''); return k && (!objetivo || k < objetivo); })
      .sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));
    let abierto = '';
    previas.forEach(e => {
      if (esVerdadero(e.RESP_PRONO_EVENTO) && e.PRONO_INICIO_TS) abierto = String(e.PRONO_INICIO_TS);
      if (esVerdadero(e.RESP_SUPINO_EVENTO)) abierto = '';
    });
    return abierto;
  } catch (e) { return ''; }
}
