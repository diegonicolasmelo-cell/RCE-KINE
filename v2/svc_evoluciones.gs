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
      const _prevR = obtenerEvolucion(idCama, turnoKey);
      if (_prevR && _prevR.ok && _prevR.data) {
        const _prev = _prevR.data;
        Object.keys(_prev).forEach(function (k) { if (!(k in datos)) datos[k] = _prev[k]; });
        // «Si se registró, quedó»: la marca de ingreso del turno JAMÁS se
        // pierde al re-editar. El cliente reabre con el modo ingreso apagado
        // y mandaba ES_INGRESO en falso — eso des-marcaba el ingreso ante el
        // REM (ingresos del mes), la estadística y el hito del historial.
        if (esVerdadero(_prev.ES_INGRESO)) datos.ES_INGRESO = true;
      }

      const rc = obtenerCama(idCama);
      const cama = rc.ok ? rc.data : {};

      // PATIENT_ID — ruta única: se toma de la cama; si no existe (episodio sin
      // ingreso formal) se genera UNA vez y se fija en la cama.
      let patientId = datos.PATIENT_ID || cama.PATIENT_ID || '';
      if (!patientId) {
        patientId = Utilities.getUuid();
        repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, { PATIENT_ID: patientId });
      }
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

      // Días de estadía / VM / VA
      if (!cama.FECHA_INGRESO) {
        // Episodio sin fecha de ingreso (paciente cargado sin ingreso formal):
        // se ancla al primer turno evolucionado para que los días no queden '?'.
        cama.FECHA_INGRESO = fecha;
        repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, { FECHA_INGRESO: fecha });
      }
      // MOMENTO real del ingreso (ago-2026): lo fija la hora del formulario o,
      // si no viene, la del registro. Con él los días cuentan bloques de 24 h.
      const _hFormIng = _horaValida(datos.PAC_HORA_INGRESO);
      if (!cama.TS_INGRESO) {
        cama.TS_INGRESO = (_hFormIng ? _tsDesdeHora(_hFormIng) : '') || _tsAhora();
        repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, { TS_INGRESO: cama.TS_INGRESO });
      } else if (_hFormIng && _hFormIng !== _tsHora(cama.TS_INGRESO)) {
        // Corrección a mano: se conserva el día del momento ya guardado.
        cama.TS_INGRESO = _tsFecha(cama.TS_INGRESO) + ' ' + _hFormIng;
        repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, { TS_INGRESO: cama.TS_INGRESO });
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
        // Se cuenta contra la fecha del TURNO, no contra la fecha efectiva:
        // ambos turnos del mismo día informan el mismo número, que es como se
        // anota a mano al final del turno de día.
        datos.DIA_ESTADIA = diasEntre(cama.FECHA_INGRESO, fecha);

        // VM y VA cuentan mientras el paciente los tiene y SE CONGELAN cuando
        // deja de tenerlos («se para el día que se extuba», Diego). El turno
        // que extuba SÍ suma: el paciente estuvo ventilado durante él, por eso
        // se mira el estado INICIAL además del final. Antes caían a 0 y se
        // perdía de vista cuántos días estuvo en VM.
        const _sopT = datos.VENT_SOPORTE_FINAL || datos.VENT_SOPORTE;
        const _vaT  = datos.VENT_VIA_AEREA_FINAL || datos.VENT_VIA_AEREA;
        const _esVA = function (x) { return x && String(x) !== 'Natural'; };
        const _enVM = String(datos.VENT_SOPORTE) === 'VM' || String(_sopT) === 'VM';
        const _enVA = _esVA(datos.VENT_VIA_AEREA) || _esVA(_vaT);
        // Último valor alcanzado por el contador (turno anterior del episodio).
        // Sin turno previo no hay nada que congelar ⇒ 0.
        const _congelado = function (campo) {
          try {
            const pr = obtenerEvolucionPrevia(idCama, turnoKey);
            const p = pr && pr.ok ? pr.data : null;
            const n = p ? parseInt(p[campo], 10) : 0;
            return isNaN(n) ? 0 : n;
          } catch (e) { return 0; }
        };
        datos.DIAS_VM = _enVM ? diasEntre(cama.FECHA_INICIO_SOPORTE, fecha) : _congelado('DIAS_VM');
        datos.DIAS_VA = _enVA ? diasEntre(cama.FECHA_INICIO_VA, fecha)     : _congelado('DIAS_VA');
      }

      // BDT (test de azul) — repetible: cada resultado marcado en el turno se
      // acumula en BDT_JSON del episodio y BDT_ULTIMO refleja el más reciente.
      const bdtRes = esVerdadero(datos.EVAL_T_BDT_POS) ? '+' : (esVerdadero(datos.EVAL_T_BDT_NEG) ? '-' : '');
      if (bdtRes) {
        // Continuidad del histórico: fila de este turno (si se edita) o turno previo.
        let base = repoBuscarPorId('EVOLUCIONES', 'ID_EVOLUCION', idEvolucion);
        if (!base || !base.BDT_JSON) {
          const rp = obtenerEvolucionPrevia(idCama, turnoKey);
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
        let baseA = repoBuscarPorId('EVOLUCIONES', 'ID_EVOLUCION', idEvolucion);
        if (!baseA || !baseA.APNEA_JSON) {
          const rpa = obtenerEvolucionPrevia(idCama, turnoKey);
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
        const rp2 = obtenerEvolucionPrevia(idCama, turnoKey);
        let hrs = (rp2.ok && rp2.data && rp2.data._VFON_HORAS) ? rp2.data._VFON_HORAS : 0;
        if (String(datos.VENT_MODO) === 'Válvula de fonación' || esVerdadero(datos.VFON_USADA)) hrs += 12;
        datos._VFON_HORAS = hrs;   // transitorio: no es columna
      }

      // Ciclo de prono: sella el momento real y, al supinar, cierra la cuenta.
      _pronoSellarCiclo(idCama, turnoKey, fecha, turno, datos);

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

      const accion = repoUpsert('EVOLUCIONES', 'ID_EVOLUCION', idEvolucion, evo);
      const esNuevo = (accion === 'crear');

      // Sincronizar el snapshot de la cama
      _syncCamaDesdeEvolucion(idCama, cama, evo, turno, turnoKey, fecha, patientId);

      // Hito de ingreso — solo en la primera escritura
      if (esVerdadero(evo.ES_INGRESO) && esNuevo) {
        _agregarHitoInterno({
          idCama, patientId, fecha, turno, tipo: 'ingreso',
          texto: 'Ingreso UCI. Dx: ' + (evo.PAC_DIAGNOSTICO || evo.PAC_NOMBRE || 'Sin especificar'),
          autor: evo.PLAN_FIRMA_KINE, autorEmail: ctx.email || '',
        });
      }

      // Procedimientos (filas) + hitos automáticos
      _guardarProcedimientosInterno(idEvolucion, idCama, patientId, fecha, turno, procs, ctx.email);
      _crearHitosDesdeProcedimientos(idCama, fecha, turno, procs, evo.PLAN_FIRMA_KINE, ctx.email);

      // Reintubación desde el bloque EXT_*
      if (esVerdadero(evo.EXT_REINTUB)) {
        try { _registrarReintubacion(evo, idCama, idEvolucion, fecha, turno, ctx); }
        catch (e) { console.warn('_registrarReintubacion:', e.message); }
      }

      SpreadsheetApp.flush();
      return ok({ idEvolucion, idCama, patientId, turnoKey, accion: esNuevo ? 'crear' : 'actualizar', entidad: 'EVOLUCIONES', TEXTO_GENERADO: evo.TEXTO_GENERADO || '' });
    } catch (e) { return err('guardarEvolucion: ' + e.message, ERR.INTERNO, e); }
  });
}

// Sincroniza CAMAS_ESTADO con el último turno (datos del paciente + snapshot por turno).
function _syncCamaDesdeEvolucion(idCama, cama, evo, turno, turnoKey, fecha, patientId) {
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
  if (!esVent) { fechaSoporte = cama.FECHA_INICIO_SOPORTE || ''; horaSoporte = cama.TS_INICIO_SOPORTE || ''; }
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
  const hactOn = esVerdadero(evo.VENT_H_ACTIVA);

  // PVE del episodio, acumulados por turnoKey (idempotente al re-guardar un
  // turno: la clave se sobreescribe). De aquí se deriva la clase de weaning.
  let weanPve = {};
  try { weanPve = JSON.parse(cama.WEAN_PVE_JSON || '{}') || {}; } catch (e) { weanPve = {}; }
  if (evo.PVE_VAL === 'si' && evo.PVE_RESULTADO) weanPve[turnoKey] = evo.PVE_RESULTADO;

  // Tamizaje de candidato a PVE con los parámetros de este turno (criterios de
  // screening clásicos, ABC trial). Si el turno ya trae PVE registrado, el
  // tamizaje ya se resolvió y no se marca. Con datos incompletos no se marca
  // (conservador).
  let candPve = false;
  if (sopNew === 'VM' && evo.PVE_VAL !== 'si') {
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
  } else if (vaNew !== vaAnt || !cama.FECHA_INICIO_VA) {
    const diasPrev = parseInt(evo.VA_EXTERNO_DIAS) || 0;
    fechaVA = (esVerdadero(evo.VA_EXTERNO) && diasPrev > 0) ? _restarDias(fecha, diasPrev) : fecha;
    horaVA = _tsDesdeHora(_horaValida(evo.INTUB_HORA) || _horaValida(evo.REINTUB_HORA) || _horaValida(evo.TQT_HORA)) || _tsAhora();
  } else {
    fechaVA = cama.FECHA_INICIO_VA; horaVA = cama.TS_INICIO_VA || '';
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
    // Dispositivos de circuito VM: estado del episodio. Al salir de VM (weaning/
    // extubación) se limpian — el circuito se descarta; una reintubación fecha
    // circuito nuevo desde el cliente (force=true).
    DISP_HME_FECHA: (dejaVM || hactOn) ? '' : val(evo.DISP_HME_FECHA, cama.DISP_HME_FECHA),
    DISP_HEPA_FECHA: dejaVM ? '' : val(evo.DISP_HEPA_FECHA, cama.DISP_HEPA_FECHA),
    DISP_TC_FECHA: dejaVM ? '' : val(evo.VENT_FECHA_SONDA, cama.DISP_TC_FECHA),
    DISP_HUMID_FECHA: dejaVM ? '' : val(evo.DISP_HUMID_FECHA, cama.DISP_HUMID_FECHA),
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
  repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idCama, campos);
}

// Registra un evento en la hoja REINTUBACIONES (idempotente por ID_EVOLUCION).
function _registrarReintubacion(evo, idCama, idEvolucion, fecha, turno, ctx) {
  const idReintub = idEvolucion + '_REINTUB';
  const fila = {
    ID_REINTUB: idReintub, PATIENT_ID: evo.PATIENT_ID || '', TIMESTAMP: ahoraTS(), FECHA: fecha, TURNO: turno,
    ID_CAMA: String(idCama), ID_EVOLUCION: idEvolucion, NOMBRE: evo.PAC_NOMBRE || '', COD_PACIENTE: evo.PAC_COD || '',
    DIAGNOSTICO: evo.PAC_DIAGNOSTICO || '', TIPO_DESVINCULACION: evo.EXT_TIPO || '', MOTIVO: evo.EXT_REINTUB_RAZ || '',
    SOPORTE_PREVIO: evo.REINTUB_SOP_PREV || evo.EXT_PE_SOP || '',
    TIEMPO_EXTUBADO: _tiempoExtubado(evo, idCama, fecha),
    HORA_REINTUBACION: evo.REINTUB_HORA || evo.EXT_HORA || '',
    KINESIOLOGO: evo.PLAN_FIRMA_KINE || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
  };
  repoUpsert('REINTUBACIONES', 'ID_REINTUB', idReintub, fila);
}

/**
 * Horas entre la extubación previa del episodio (EXT_TS) y la reintubación.
 * Mismo turno: EXT_TS viene en el propio payload; turno siguiente: se busca
 * el EXT_TS más reciente del episodio. Devuelve '' si no es computable.
 */
function _tiempoExtubado(evo, idCama, fecha) {
  try {
    const horaRe = evo.REINTUB_HORA || evo.EXT_HORA || '';
    if (!horaRe) return '';
    let extTs = evo.EXT_TS || '';
    if (!extTs) {
      const evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama))
        .filter(function (e) { return e.EXT_TS && String(e.PATIENT_ID) === String(evo.PATIENT_ID || ''); });
      evos.sort(function (a, b) { return String(b.TURNO_KEY).localeCompare(String(a.TURNO_KEY)); });
      if (evos.length) extTs = evos[0].EXT_TS;
    }
    if (!extTs) return '';
    let t0;
    try { t0 = new Date(JSON.parse(extTs).ts); } catch (e) { return ''; }
    const p = String(horaRe).split(':');
    const t1 = new Date(fecha + 'T' + ('0' + p[0]).slice(-2) + ':' + ('0' + (p[1] || '0')).slice(-2) + ':00');
    let horas = (t1 - t0) / 3600000;
    if (isNaN(horas)) return '';
    if (horas < 0) horas += 24; // reintubación cruzando medianoche
    return (Math.round(horas * 10) / 10) + ' h';
  } catch (e) { return ''; }
}

// ═══ LECTURA ══════════════════════════════════════════════
function obtenerEvolucion(idCama, turnoKey) {
  try {
    const id = 'CAMA_' + idCama + '_' + turnoKey;
    return ok(repoBuscarPorId('EVOLUCIONES', 'ID_EVOLUCION', id));
  } catch (e) { return err('obtenerEvolucion: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Evolución inmediatamente ANTERIOR a un turno (para replicar y bajar el roce).
 * Como turnoKey = "YYYY-MM-DD-Dia|Noche", el orden alfabético coincide con el
 * cronológico (Dia < Noche). Devuelve la más reciente estrictamente anterior.
 */
function obtenerEvolucionPrevia(idCama, turnoKey) {
  try {
    const evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
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
    // Pronación ABIERTA del episodio: el cliente la necesita para narrar «tras
    // X h en prono» al supinar, aunque la pronación sea de otro turno y de otro
    // colega. Transitorio: no es columna.
    if (mejor) mejor._PRONO_ABIERTO_TS = _pronoAbiertoTS(idCama, objetivo);
    return ok(mejor);
  } catch (e) { return err('obtenerEvolucionPrevia: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Turno actual + previa en UNA llamada (evita 2 round-trips seriales al abrir el panel).
 */
function obtenerEvoTurno(idCama, turnoKey) {
  try {
    const actual = repoBuscarPorId('EVOLUCIONES', 'ID_EVOLUCION', 'CAMA_' + idCama + '_' + turnoKey);
    let previa = null;
    if (!actual) {
      const r = obtenerEvolucionPrevia(idCama, turnoKey);
      previa = (r.ok && r.data) ? r.data : null;
    }
    // La pronación abierta viaja SIEMPRE (también al re-editar un turno ya
    // guardado, donde la supinación puede agregarse recién ahora).
    return ok({ actual: actual, previa: previa, pronoAbierto: _pronoAbiertoTS(idCama, turnoKey) });
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
    const evos = repoLeerFiltrado('EVOLUCIONES', 'TURNO_KEY',
      function (k) { return String(k).indexOf(f) === 0; })
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

  const evoR = obtenerEvolucion(idCama, turnoKey);
  if (!evoR.ok || !evoR.data) return err('No existe evolución para ese turno.', ERR.VALIDACION);
  const evo = evoR.data;

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
      if (evo.VENT_SOPORTE === 'VM' && fecha) campos.FECHA_INICIO_SOPORTE = rest(fecha, dvm);
      if (evo.VENT_VIA_AEREA && evo.VENT_VIA_AEREA !== 'Natural' && fecha) campos.FECHA_INICIO_VA = rest(fecha, dva);
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

/** Sella PRONO_INICIO_TS / SUPINO_TS y cierra PRONO_HORAS al supinar. */
function _pronoSellarCiclo(idCama, turnoKey, fecha, turno, datos) {
  if (esVerdadero(datos.RESP_PRONO_EVENTO)) {
    datos.PRONO_INICIO_TS = _tsEventoTurno(fecha, turno, datos.RESP_PRONO_HORA);
  }
  if (esVerdadero(datos.RESP_SUPINO_EVENTO)) {
    const ts = _tsEventoTurno(fecha, turno, datos.RESP_SUPINO_HORA);
    datos.SUPINO_TS = ts;
    // si se pronó y supinó en el mismo turno, el inicio es el de esta misma fila
    const ini = datos.PRONO_INICIO_TS || _pronoAbiertoTS(idCama, turnoKey);
    const h = ini ? _horasEntreTS(ini, ts) : '';
    datos.PRONO_HORAS = (h === '' ? '' : h);
  }
}

/**
 * Momento de la pronación ABIERTA del episodio (la última sin supinación
 * posterior), mirando los turnos anteriores a turnoKey. '' si no hay ninguna.
 */
function _pronoAbiertoTS(idCama, turnoKey) {
  try {
    const evos = repoLeerTodos('EVOLUCIONES', 'ID_CAMA', String(idCama));
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
