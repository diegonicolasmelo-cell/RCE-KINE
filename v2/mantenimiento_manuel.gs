/**
 * mantenimiento_manuel.gs - TEMPORAL (ago-2026). Dos correcciones puntuales del
 * arranque real, para correr desde el editor y BORRAR despues. No forma parte de
 * la app: ninguna funcion de aqui se llama desde `api()` ni desde el index.
 *
 * A - corregirIngresos*  - los pacientes que ya estaban hospitalizados cuando se
 *     cargaron al sistema quedaron con FECHA_INGRESO = el dia en que se
 *     registraron, asi que la app los muestra en Dia 0. Las fechas reales salen
 *     del registro diario de Kinesiologia (planilla ESTADISTICA KINE), donde
 *     coinciden con el evento INGRESO anotado.
 *
 * B - limpiarPaciente*   - saca del registro un episodio de prueba.
 *
 * Las dos vienen en pareja SIMULACRO / CONFIRMAR, igual que
 * `resetearBaseDeDatos` / `resetearBaseDeDatosCONFIRMAR`: el simulacro informa y
 * no toca nada. Correr SIEMPRE el simulacro primero y leer el registro.
 */

// ---------------------------------------------------------------- A - fechas

/** Hora de ingreso asumida (decision de Manuel, 2-ago-2026: no se registro la real). */
const _MTO_HORA_INGRESO = '08:00';

/**
 * GUARDIA DE ROTACION (2-ago-2026, despues de un susto real).
 *
 * Todos los pacientes preexistentes se cargaron a mano el 1-ago, asi que TODOS
 * tienen hoy FECHA_INGRESO = 2026-08-01. Si una cama muestra otra fecha, solo
 * puede ser por dos razones: ya se corrigio, o EGRESO Y ENTRO OTRO PACIENTE.
 * En los dos casos escribirle la fecha de la lista es un error - en el segundo,
 * grave: le inventa al recien llegado la estadia completa del anterior.
 *
 * Paso de verdad: la cama 5 roto entre la foto de la planilla y la correccion,
 * y el paciente nuevo quedo con 10 dias que no eran suyos.
 *
 * Con esto la funcion solo escribe donde nadie ha tocado nada, y el resto lo
 * informa para revisarlo a mano.
 */
const _MTO_FECHA_CARGA = '2026-08-01';

/**
 * Fechas reales por cama. `vm` es el primer dia con ventilacion mecanica del
 * episodio; vacio = el paciente nunca estuvo en VM.
 *
 * Las camas 1 a 6 ya se corrigieron (primera tanda, 2-ago-2026) y salieron de
 * esta lista para que el registro de la segunda corrida sea corto de leer.
 * Si una cama de aqui esta vacia o cambio de paciente, la funcion la SALTA y lo
 * informa: no escribe a ciegas.
 */
// FUENTE DE LAS FECHAS (4-ago-2026): la «LISTA DE HOSPITALIZADOS UCI» del
// 3-ago-2026 09:01, impresa del sistema oficial del hospital (BUDA). Es la
// fuente de verdad y reemplaza a la tanda anterior, que se habia armado
// leyendo el registro diario de Kinesiologia.
//
// POR QUE SE REESCRIBIO: al comparar la tabla anterior contra la lista oficial
// salieron SEIS de diez fechas equivocadas por un dia (camas 7, 8, 9, 13, 15 y
// 18), en las dos direcciones. La causa mas probable es el turno de noche, que
// cruza la medianoche: el registro diario anota la noche bajo el dia en que
// EMPIEZA, asi que un ingreso de las 02:00 del 28 queda escrito como 27. Ojo
// que las dos camas que Manuel tuvo que deducir («sin evento INGRESO anotado»,
// 13 y 15) fueron justamente dos de las que salieron mal.
// `nom` es la GUARDIA POR NOMBRE (4-ago-2026): el simulacro de esa madrugada
// mostro que la tanda del 2-ago YA se habia CONFIRMADO — las nueve camas
// tenian fecha escrita (cinco de ellas la equivocada), asi que la guardia por
// fecha-de-carga dejo de servir para distinguir "corregida" de "rotada".
// Ahora la funcion solo escribe si el nombre del paciente en la cama CONTIENE
// el fragmento declarado (verificado contra el registro del simulacro, donde
// los nueve nombres calzaron con la lista oficial). Cama rotada = nombre
// distinto = se salta e informa. Es la leccion de la cama 5, ahora a prueba
// de `forzar`.
const _MTO_FECHAS = [
  // Camas 1 y 7 agregadas el 5-ago: Diego dio la cronologia clinica real de
  // Francisca y Maria (ver _MTO_SEED_TRAMOS abajo para el detalle completo).
  // Aqui solo se corrige el reloj del soporte ACTUAL (el `vm` es el inicio
  // del tramo abierto); el `ingreso` ya estaba correcto en ambas — se
  // reafirma igual, es inocuo.
  { cama: '1', nom: 'ARAYA',    ingreso: '2026-07-17', vm: '2026-07-21' },  // Francisca: VM real desde la reintubacion (el tramo del 18-jul se autocancela: intubada y extubada el MISMO dia)
  { cama: '7', nom: 'RAMIREZ',  ingreso: '2026-07-22', vm: '2026-07-30' },  // Maria: VNI actual desde la extubacion ACCIDENTAL del 30-jul

  // Camas 4 y 6 agregadas el 4-ago ~01:40: Diego reporta que muestran UN DIA
  // MAS del real. La primera tanda (2-ago) les habria escrito la fecha con el
  // mismo corrimiento de ±1 que tenian 5 de las 10 de la segunda tanda (el
  // registro nocturno anota la noche bajo el dia en que empieza). Fechas de
  // la lista oficial; VM = ingreso (la hoja del 3-ago trae VM = estadia en
  // ambas). El simulacro muestra la fecha que tienen HOY: verificar ahi que
  // efectivamente estaban corridas antes de confirmar.
  { cama: '4',  nom: 'VILLALOBOS', ingreso: '2026-07-29', vm: '2026-07-29' },
  { cama: '6',  nom: 'MALUENDA',   ingreso: '2026-07-27', vm: '2026-07-27' },
  { cama: '5',  nom: 'CASTILLO',   ingreso: '2026-08-01', vm: '2026-08-01' },
  { cama: '8',  nom: 'ARRIAGADA',  ingreso: '2026-08-01', vm: '2026-08-01' },
  { cama: '9',  nom: 'OLIVARES',   ingreso: '2026-07-30', vm: '2026-07-30' },
  { cama: '11', nom: 'ZEPEDA',     ingreso: '2026-07-27', vm: '2026-07-27' },
  { cama: '13', nom: 'VELIZ',      ingreso: '2026-07-28', vm: '2026-07-28' },
  // Cama 14: la tabla de Manuel decia "nunca estuvo en VM", pero la lista
  // oficial del 3-ago dice TET+VMI con VM = estadia (ventilada desde el
  // ingreso) y la cama hoy esta en TOT+VM. Manda la lista.
  { cama: '14', nom: 'BLANCA',     ingreso: '2026-07-31', vm: '2026-07-31' },
  { cama: '15', nom: 'URTUBIA',    ingreso: '2026-07-30', vm: '2026-07-30' },
  { cama: '16', nom: 'SANTIBA',    ingreso: '2026-07-24', vm: '2026-07-24' },  // sin la enye a proposito
  { cama: '17', nom: 'AVILES',     ingreso: '2026-07-25', vm: '2026-07-25' },
  // Cama 18 ELIMINADA de la tanda (4-ago 00:56): el simulacro mostro que la
  // cama ROTO — Wilson De La Torre ya no esta (la lista traia su traslado
  // anotado en rojo) y hay un paciente nuevo con su fecha correcta del
  // formulario. La guardia por nombre lo salto sola: exactamente el
  // accidente de la cama 5, esta vez PREVENIDO. El episodio de Wilson quedo
  // archivado con sus dias viejos (decision de Diego: lo egresado no se
  // persigue en el periodo de aprendizaje).

  // Las camas 11, 14, 16 y 17 YA tienen la fecha correcta, pero van igual:
  // la tanda del 2-ago re-sello sus evoluciones con la REGLA VIEJA (bloques de
  // 24 h y la noche sin fecha efectiva), asi que hay que re-sellarlas de nuevo
  // con la regla BUDA. Reescribir la misma fecha es inocuo.
  //
  // FUERA a proposito:
  //  - camas 7 y 10: EGRESARON el 4-ago (episodio cerrado en ARCHIVO_PACIENTES;
  //    Diego decidio no perseguir lo ya egresado — periodo de aprendizaje).
  //    En la cama 7 ahora esta la senora que VINO DE LA CAMA 3: su fecha
  //    (22-jul) viajo con ella en el traslado y esta correcta.
  //  - cama 12: estaba vacia en la lista del 3-ago.
  //  - camas 1,2,3,4,6: primera tanda del 2-ago con fechas que SI calzan con
  //    la lista oficial (17-07, 29-07, 22-07, 29-07, 27-07). Sus evoluciones
  //    quedaron selladas con la regla vieja; si Diego quiere afinarlas se
  //    agregan aqui con su `nom` — el desfase es de a lo mas 1 dia por turno
  //    de noche.
  //
  // Las fechas de VM se toman iguales a la de ingreso porque estos pacientes
  // llegaron ya ventilados. La lista oficial NO trae fecha de inicio de VM:
  // la funcion solo escribe ese reloj si el paciente HOY tiene VA artificial
  // o VM (camas 9 y 15 ya no la tienen ⇒ no se les toca, y sus evoluciones
  // historicas conservan los dias de VM que ya tenian).
];

function corregirIngresosSIMULACRO() { return _mtoCorregirIngresos(false); }
function corregirIngresosCONFIRMAR() { return _mtoCorregirIngresos(true); }

function _mtoCorregirIngresos(escribir) {
  const log = [];
  const p = m => { log.push(m); Logger.log(m); };
  p(escribir ? '=== CORRECCION REAL DE FECHAS ===' : '=== SIMULACRO (no se escribe nada) ===');

  const camas = repoLeerTodos('CAMAS_ESTADO');
  const porId = {};
  camas.forEach(c => { porId[String(c.ID_CAMA)] = c; });

  let ok = 0, saltadas = 0;
  const corregidas = [];   // {cama, patientId} para re-sellar sus evoluciones
  _MTO_FECHAS.forEach(f => {
    const c = porId[f.cama];
    if (!c) { p('cama ' + f.cama + ': NO EXISTE en CAMAS_ESTADO - se salta'); saltadas++; return; }
    if (!esVerdadero(c.OCUPADA)) {
      p('cama ' + f.cama + ': esta DESOCUPADA - se salta (egreso?)'); saltadas++; return;
    }

    // Contexto para que el humano valide que es el paciente correcto.
    p('');
    p('cama ' + f.cama + ' - ' + String(c.NOMBRE || '(sin nombre)') +
      ' - via aerea: ' + String(c.VIA_AEREA || '-') + ' - soporte: ' + String(c.SOPORTE || '-'));

    const ingActual = String(c.FECHA_INGRESO || '').slice(0, 10);
    if (f.nom) {
      // Guardia POR NOMBRE (4-ago): escribe SOLO si el paciente de la cama es
      // el que la tabla espera. Reemplaza a la guardia por fecha-de-carga, que
      // dejo de servir cuando la tanda del 2-ago ya habia escrito fechas.
      if (String(c.NOMBRE || '').toUpperCase().indexOf(f.nom) === -1) {
        p('   !! NO SE TOCA: el paciente es "' + String(c.NOMBRE || '(sin nombre)') +
          '" y la tabla espera uno con "' + f.nom + '" - la cama ROTO. Revisar a mano.');
        saltadas++; return;
      }
      if (ingActual === f.ingreso)
        p('   (la fecha ya estaba correcta: se reescribe igual para re-sellar sus evoluciones)');
    } else {
      // Guardia de rotacion original (entradas sin `nom`): si no tiene la
      // fecha de carga, no se toca. `forzar` la salta a proposito.
      if (ingActual !== _MTO_FECHA_CARGA && !f.forzar) {
        p('   !! NO SE TOCA: su ingreso dice ' + (ingActual || '(vacio)') +
          ', no ' + _MTO_FECHA_CARGA + '.');
        p('      O ya se corrigio, o esta cama roto y hay otro paciente. Revisar a mano.');
        saltadas++; return;
      }
      if (f.forzar) p('   (REPARACION forzada: se reescribe aunque diga ' + ingActual + ')');
    }
    p('   ingreso   ' + String(c.FECHA_INGRESO || '(vacio)') + '  ->  ' + f.ingreso +
      ' ' + _MTO_HORA_INGRESO);

    const campos = {
      FECHA_INGRESO: f.ingreso,
      TS_INGRESO:    f.ingreso + ' ' + _MTO_HORA_INGRESO,
    };

    // Los relojes de via aerea y de VM solo se tocan si el paciente los tiene
    // hoy: si no, se estaria inventando un inicio para algo que no existe.
    const tieneVA = ['TOT', 'TQT'].indexOf(String(c.VIA_AEREA || '')) !== -1;
    // Incluye VNI (4-ago): Francisca y Maria necesitaban corregir el reloj de
    // un soporte NO invasivo (VNI), que el chequeo original ignoraba.
    const tieneVM = String(c.SOPORTE || '') === 'VM' || String(c.SOPORTE || '') === 'VNI';
    if (f.vm && (tieneVA || tieneVM)) {
      const ts = f.vm + ' ' + _MTO_HORA_INGRESO;
      if (tieneVA) {
        campos.FECHA_INICIO_VA = f.vm; campos.TS_INICIO_VA = ts;
        p('   via aerea ' + String(c.FECHA_INICIO_VA || '(vacio)') + '  ->  ' + f.vm);
      }
      if (tieneVM) {
        campos.FECHA_INICIO_SOPORTE = f.vm; campos.TS_INICIO_SOPORTE = ts;
        p('   ' + String(c.SOPORTE) + '        ' + String(c.FECHA_INICIO_SOPORTE || '(vacio)') + '  ->  ' + f.vm);
      }
    } else if (f.vm) {
      p('   (hoy sin via aerea artificial ni VM/VNI: no se tocan esos relojes)');
    }

    if (escribir) {
      const r = repoActualizar('CAMAS_ESTADO', 'ID_CAMA', f.cama, campos);
      if (!r) { p('   ERROR: no se pudo actualizar la fila'); saltadas++; return; }
      auditar({
        accion: 'CORRECCION_FECHA_INGRESO', entidad: 'CAMAS_ESTADO',
        idEntidad: f.cama, patientId: String(c.PATIENT_ID || ''),
        resumen: 'ingreso -> ' + f.ingreso + ' ' + _MTO_HORA_INGRESO +
                 (campos.FECHA_INICIO_SOPORTE ? ' - VM -> ' + f.vm : ''),
      });
    }
    // Se guardan los campos NUEVOS (no se relee la cama): asi el simulacro
    // informa el re-sellado real, aunque todavia no se haya escrito nada.
    if (c.PATIENT_ID) corregidas.push({ cama: f.cama, patientId: String(c.PATIENT_ID), campos: campos });
    ok++;
  });

  p('');
  p((escribir ? 'CORREGIDAS: ' : 'a corregir: ') + ok + '   -   saltadas: ' + saltadas);

  // ── Re-sellado de las evoluciones YA guardadas ────────────────────────────
  // OJO (hallazgo de la revision, 3-ago): DIA_ESTADIA / DIAS_VM / DIAS_VA se
  // calculan AL GUARDAR y quedan CONGELADOS en cada fila de EVOLUCIONES. El
  // tablero si recalcula en vivo, pero las evoluciones escritas antes de esta
  // correccion conservan los dias viejos - y de ahi leen el REM, los
  // indicadores, la Hoja UCI y el resumen del egreso. Sin este paso, la cama
  // diria "dia 10" mientras su propia evolucion de ese turno dice "dia 1".
  p('');
  p(escribir ? '--- re-sellando evoluciones ya guardadas ---'
             : '--- evoluciones que se re-sellarian ---');
  let evosTocadas = 0;
  corregidas.forEach(function (x) {
    const c = x.campos;   // fechas YA corregidas (o las que se escribirian)
    const evos = repoLeerTodos('EVOLUCIONES', 'PATIENT_ID', x.patientId);
    evos.forEach(function (e) {
      const tk = String(e.TURNO_KEY || '');
      const m = tk.match(/^(\d{4}-\d{2}-\d{2})-(Dia|Noche)$/);
      if (!m) return;
      // MISMA regla que usa el guardado (svc_evoluciones.gs): dias de
      // CALENDARIO contra la fecha del TURNO, igual que la lista oficial del
      // hospital (BUDA). OJO: hasta el 4-ago esto usaba diasBloques24 y habria
      // re-sellado TODAS las evoluciones con la regla vieja, deshaciendo la
      // correccion en lo ya guardado. Si se cambia el conteo en
      // svc_evoluciones.gs, HAY QUE CAMBIARLO AQUI TAMBIEN.
      // La fecha del TURNO, sin fecha efectiva (regla afinada por Diego el
      // 4-ago 01:00 — la hoja del turno noche del 3 pertenece al 3; los dias
      // se actualizan en la manana al cambio de turno). La tanda confirmada
      // a las 01:05 sello las noches con +1: re-correr esta funcion las
      // devuelve (es idempotente — solo toca lo que difiere).
      const fRef = m[1];
      const dEst = diasEntre(c.FECHA_INGRESO, fRef);
      // OJO: `c` son SOLO los campos que se van a escribir. Si el paciente ya
      // NO esta en VM (extubado, p.ej. camas 9 y 15), el reloj de VM no viene
      // en `c` — y diasEntre('') daria 0, BORRANDO los dias de VM historicos
      // de sus evoluciones. Sin la fecha, se CONSERVA lo que la fila ya tiene.
      const enVM = String(e.VENT_SOPORTE || '') === 'VM' ||
                   String(e.VENT_SOPORTE_FINAL || '') === 'VM';
      const dVM = (enVM && c.FECHA_INICIO_SOPORTE)
        ? diasEntre(c.FECHA_INICIO_SOPORTE, fRef) : parseInt(e.DIAS_VM, 10) || 0;
      const esVA = function (x) { return x && String(x) !== 'Natural'; };
      const enVA = esVA(e.VENT_VIA_AEREA) || esVA(e.VENT_VIA_AEREA_FINAL);
      const dVA = (enVA && c.FECHA_INICIO_VA)
        ? diasEntre(c.FECHA_INICIO_VA, fRef) : parseInt(e.DIAS_VA, 10) || 0;
      if (String(e.DIA_ESTADIA) === String(dEst) &&
          String(e.DIAS_VM) === String(dVM) && String(e.DIAS_VA) === String(dVA)) return;
      p('   cama ' + x.cama + ' ' + tk + ': dia ' + e.DIA_ESTADIA + '->' + dEst +
        ' - VM ' + e.DIAS_VM + '->' + dVM + ' - VA ' + e.DIAS_VA + '->' + dVA);
      if (escribir) {
        repoActualizar('EVOLUCIONES', 'ID_EVOLUCION', e.ID_EVOLUCION,
          { DIA_ESTADIA: dEst, DIAS_VM: dVM, DIAS_VA: dVA });
      }
      evosTocadas++;
    });
  });
  p('   ' + (escribir ? 're-selladas: ' : 'a re-sellar: ') + evosTocadas + ' evolucion(es)');

  if (!escribir) p('Si el detalle de arriba cuadra, correr corregirIngresosCONFIRMAR().');
  return log.join('\n');
}

// -------------------------------------------------------------- B - limpieza

/**
 * Nombre (o parte del nombre) del episodio de PRUEBA a eliminar.
 * Se deja VACIO en el repositorio a proposito: la identidad de un paciente no
 * se versiona. Escribirlo aqui en el editor justo antes de ejecutar, y volver a
 * vaciarlo (o borrar el archivo) al terminar.
 */
const _MTO_PACIENTE_PRUEBA = '';

/** Hojas de las que se borra el episodio. AUDIT_LOG NO se toca: es la traza. */
const _MTO_HOJAS_PACIENTE = ['EVOLUCIONES', 'EVOLUCIONES_ARCHIVO', 'PROCEDIMIENTOS',
  'TIMELINE', 'REINTUBACIONES', 'ARCHIVO_PACIENTES'];

function limpiarPacientePruebaSIMULACRO() { return _mtoLimpiarPaciente(false); }
function limpiarPacientePruebaCONFIRMAR() { return _mtoLimpiarPaciente(true); }

function _mtoLimpiarPaciente(escribir) {
  const log = [];
  const p = m => { log.push(m); Logger.log(m); };
  const buscado = String(_MTO_PACIENTE_PRUEBA || '').trim().toUpperCase();
  if (!buscado) {
    p('Falta escribir el nombre en _MTO_PACIENTE_PRUEBA. No se hace nada.');
    return log.join('\n');
  }
  p(escribir ? '=== ELIMINACION REAL ===' : '=== SIMULACRO (no se borra nada) ===');

  // 1 - ubicar el/los PATIENT_ID por nombre, en cama activa y en archivo
  const ids = {};
  const camasHit = [];
  repoLeerTodos('CAMAS_ESTADO').forEach(c => {
    if (String(c.NOMBRE || '').toUpperCase().indexOf(buscado) !== -1) {
      if (c.PATIENT_ID) ids[String(c.PATIENT_ID)] = true;
      camasHit.push(String(c.ID_CAMA));
    }
  });
  repoLeerTodos('ARCHIVO_PACIENTES').forEach(a => {
    if (String(a.NOMBRE || '').toUpperCase().indexOf(buscado) !== -1 && a.PATIENT_ID) {
      ids[String(a.PATIENT_ID)] = true;
    }
  });
  const lista = Object.keys(ids);
  if (!lista.length) {
    p('No se encontro ningun episodio con ese nombre. No se hace nada.');
    return log.join('\n');
  }
  p('episodios encontrados: ' + lista.length + (camasHit.length ? '  - en cama: ' + camasHit.join(', ') : ''));

  // 2 - contar que se borraria en cada hoja
  let total = 0;
  const cuenta = {};
  _MTO_HOJAS_PACIENTE.forEach(h => {
    let n = 0;
    repoLeerTodos(h).forEach(o => { if (ids[String(o.PATIENT_ID || '')]) n++; });
    cuenta[h] = n; total += n;
    p('  ' + h + ': ' + n + ' fila(s)');
  });
  p('TOTAL a borrar: ' + total + ' filas');

  if (!escribir) {
    p('');
    p('Si es el paciente correcto, correr limpiarPacientePruebaCONFIRMAR().');
    return log.join('\n');
  }

  // 3 - respaldo primero: si falla, se cancela TODO (mismo criterio del reseteo).
  // OJO (revision 3-ago): backupDiario() NO lanza excepcion cuando falla, sino
  // que devuelve {ok:false, error}. Con solo try/catch el fallo pasaba de largo
  // y se borraba igual; hay que mirar el .ok de la respuesta.
  try {
    const rb = backupDiario();
    if (!rb || !rb.ok) {
      p('RESPALDO FALLO (' + ((rb && rb.error) || 'sin detalle') + ') - se cancela sin borrar nada.');
      return log.join('\n');
    }
    p('respaldo OK');
  } catch (e) {
    p('RESPALDO FALLO (' + e + ') - se cancela sin borrar nada.');
    return log.join('\n');
  }

  // 4 - borrar y liberar la cama
  _MTO_HOJAS_PACIENTE.forEach(h => {
    const n = repoEliminarDonde(h, o => !!ids[String(o.PATIENT_ID || '')]);
    p('  ' + h + ': ' + n + ' borradas');
  });
  camasHit.forEach(idCama => {
    _limpiarCamaInterno(idCama);   // deja la cama en blanco, sin arrastres
    p('  cama ' + idCama + ' liberada');
  });
  auditar({
    accion: 'LIMPIEZA_PACIENTE_PRUEBA', entidad: 'CAMAS_ESTADO',
    idEntidad: camasHit.join(','), patientId: lista.join(','),
    resumen: 'episodio de prueba eliminado - ' + total + ' filas',
  });
  p('LISTO. Queda constancia en AUDIT_LOG.');
  return log.join('\n');
}

// ── C · Re-sellado de los DIAS DE SOPORTE por tramos (4-ago-2026) ───────────
// Hallazgo de Diego con Maria del Carmen (cama 7): su historia tiene DOS
// tramos de VM y DOS de VNI (extubada a VNI, reintubada, extubacion accidental
// a VNI), y los contadores viejos o bien reiniciaban la cuenta en cada
// reintubacion o bien contaban el dia de la transicion PARA LOS DOS soportes
// (VM 8 + VNI 7 = 15 dias en una estadia de 13, "dias falsos").
//
// Este re-sellado recorre las evoluciones de cada cama OCUPADA en orden y les
// escribe DIAS_VM / DIAS_VNI / DIAS_VA con la regla de TRAMOS: cada tramo
// aporta diasEntre(inicio, fin); el dia de la transicion pertenece al soporte
// SALIENTE y es el Dia 0 del entrante. Los tramos suman EXACTO la estadia.
// Es idempotente: re-correrlo no cambia nada que ya este bien.

/**
 * Historial PREVIO A QUE LA APP TRACKEARA al paciente (5-ago-2026): tramos ya
 * CERRADOS (o el inicio real del tramo abierto) que ninguna evolucion en
 * EVOLUCIONES puede reconstruir, porque el episodio empezo en papel antes de
 * que el RCE registrara turnos para esa cama.
 *
 * El re-sellado normal (_mtoResellarSoporte) solo puede detectar tramos
 * CAMINANDO las evoluciones ya guardadas; si el paciente ya estaba en su
 * tramo actual (o paso por uno anterior) antes de la primera evolucion en la
 * app, esa historia queda invisible y el re-sellado ancla el tramo a la
 * fecha de esa primera evolucion — muy posterior a la real.
 *
 * Confirmado por Diego con la cronologia clinica real de cada paciente.
 * `acum` = dias YA cerrados de tramos anteriores (0 si no hay ninguno).
 * `ini` = fecha real de inicio del tramo que sigue abierto (null si ese
 * soporte esta cerrado para siempre, como la VM de Maria).
 */
const _MTO_SEED_TRAMOS = [
  // Francisca Araya (cama 1): conectada a VM brevemente el 18-jul (intubada
  // en la manana, extubada esa misma tarde — programada fuera de protocolo
  // por VM <24 h). Ese tramo se AUTOCANCELA: mismo dia, 0 dias. Reintubada el
  // 21-jul, ventilada sin interrupcion desde entonces: ese es el UNICO tramo
  // que aporta dias. Confirmado por Diego: 18 dias de estadia / 14 de VM al
  // 4-ago calzan exacto (0 + diasEntre(21-jul,4-ago)=14).
  { cama: '1', nom: 'ARAYA',
    DIAS_VM:  { acum: 0, ini: '2026-07-21' },
    DIAS_VNI: { acum: 0, ini: null },
    DIAS_VA:  { acum: 0, ini: '2026-07-21' } },
  // Maria Ramirez (cama 7, antes cama 3): intubada 22-jul, extubada
  // c/protocolo a VNI 23-jul (1 dia de VM ya cerrado), reintubada 25-jul
  // (2 dias de VNI ya cerrados), ventilada hasta la extubacion ACCIDENTAL
  // del 30-jul (5 dias mas de VM = 6 total, cerrado para siempre), en VNI
  // desde entonces (tramo ABIERTO, ini=30-jul). Via aerea no-natural
  // continua desde el ingreso (nunca ha estado en Natural).
  { cama: '7', nom: 'RAMIREZ',
    DIAS_VM:  { acum: 6, ini: null },
    DIAS_VNI: { acum: 2, ini: '2026-07-30' },
    DIAS_VA:  { acum: 0, ini: '2026-07-22' } },
];

function resellarDiasSoporteSIMULACRO() { return _mtoResellarSoporte(false); }
function resellarDiasSoporteCONFIRMAR() { return _mtoResellarSoporte(true); }

function _mtoResellarSoporte(escribir) {
  const log = [];
  const p = m => { log.push(m); Logger.log(m); };
  p(escribir ? '=== RE-SELLADO REAL (dias de soporte por tramos) ==='
             : '=== SIMULACRO (no se escribe nada) ===');

  const esVA = x => x && String(x) !== 'Natural';
  // Estado FINAL del turno (si hubo evento de via aerea, manda el resultado).
  const finSop = e => String(e.VENT_SOPORTE_FINAL || e.VENT_SOPORTE || '');
  const finVa  = e => String(e.VENT_VIA_AEREA_FINAL || e.VENT_VIA_AEREA || '');
  const toca = {
    DIAS_VM:  e => String(e.VENT_SOPORTE) === 'VM'  || finSop(e) === 'VM',
    DIAS_VNI: e => String(e.VENT_SOPORTE) === 'VNI' || finSop(e) === 'VNI',
    DIAS_VA:  e => esVA(e.VENT_VIA_AEREA) || esVA(finVa(e)),
  };
  const sigue = {
    DIAS_VM:  e => finSop(e) === 'VM',
    DIAS_VNI: e => finSop(e) === 'VNI',
    DIAS_VA:  e => esVA(finVa(e)),
  };

  let camasOk = 0, evosTocadas = 0;
  repoLeerTodos('CAMAS_ESTADO').forEach(c => {
    if (!esVerdadero(c.OCUPADA) || !c.PATIENT_ID) return;
    const evos = repoLeerTodos('EVOLUCIONES', 'PATIENT_ID', String(c.PATIENT_ID))
      .filter(e => /^\d{4}-\d{2}-\d{2}-(Dia|Noche)$/.test(String(e.TURNO_KEY || '')))
      .sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));
    if (!evos.length) return;

    p('');
    p('cama ' + c.ID_CAMA + ' - ' + String(c.NOMBRE || '(sin nombre)') +
      ' - ' + evos.length + ' evolucion(es)');

    // Estado del recorrido por soporte: acumulado de tramos cerrados + inicio
    // del tramo abierto (null = fuera del soporte). Si el paciente tiene
    // historia PRE-app en _MTO_SEED_TRAMOS, arranca desde ahi en vez de 0.
    const seed = _MTO_SEED_TRAMOS.find(s => s.cama === String(c.ID_CAMA) &&
      String(c.NOMBRE || '').toUpperCase().indexOf(s.nom) !== -1);
    if (seed) p('   (historial pre-existente sembrado: VM base ' + seed.DIAS_VM.acum +
      ' · VNI base ' + seed.DIAS_VNI.acum + ' · VA base ' + seed.DIAS_VA.acum + ')');
    const st = seed
      ? { DIAS_VM: Object.assign({}, seed.DIAS_VM), DIAS_VNI: Object.assign({}, seed.DIAS_VNI), DIAS_VA: Object.assign({}, seed.DIAS_VA) }
      : { DIAS_VM: { acum: 0, ini: null }, DIAS_VNI: { acum: 0, ini: null }, DIAS_VA: { acum: 0, ini: null } };
    let cambiosCama = 0;
    evos.forEach(e => {
      const f = String(e.FECHA || '').slice(0, 10) || String(e.TURNO_KEY).slice(0, 10);
      const nuevo = {};
      ['DIAS_VM', 'DIAS_VNI', 'DIAS_VA'].forEach(k => {
        if (toca[k](e)) {
          if (st[k].ini === null) st[k].ini = f;             // abre tramo
          nuevo[k] = st[k].acum + Math.max(0, diasEntre(st[k].ini, f) || 0);
          if (!sigue[k](e)) {                                // cierra DENTRO del turno:
            st[k].acum = nuevo[k]; st[k].ini = null;         // el dia de salida SI conto
          }
        } else {
          if (st[k].ini !== null) {                          // salio sin turno de transicion
            st[k].acum += Math.max(0, diasEntre(st[k].ini, st[k].fUlt || st[k].ini) || 0);
            st[k].ini = null;
          }
          nuevo[k] = st[k].acum;                             // congelado
        }
        if (st[k].ini !== null) st[k].fUlt = f;              // ultima fecha vista dentro del tramo
      });
      const dif = ['DIAS_VM', 'DIAS_VNI', 'DIAS_VA']
        .filter(k => String(e[k] === '' || e[k] == null ? '' : e[k]) !== String(nuevo[k]));
      if (dif.length) {
        p('   ' + e.TURNO_KEY + ': ' + dif.map(k =>
          k.replace('DIAS_', '') + ' ' + (e[k] === '' || e[k] == null ? '-' : e[k]) + '->' + nuevo[k]).join(' · '));
        if (escribir) repoActualizar('EVOLUCIONES', 'ID_EVOLUCION', e.ID_EVOLUCION, nuevo);
        evosTocadas++; cambiosCama++;
      }
    });
    if (!cambiosCama) p('   (todo ya estaba bien - sin cambios)');
    else camasOk++;
  });

  p('');
  p((escribir ? 'RE-SELLADAS: ' : 'a re-sellar: ') + evosTocadas +
    ' evolucion(es) en ' + camasOk + ' cama(s)');
  if (!escribir) p('Si el detalle cuadra, correr resellarDiasSoporteCONFIRMAR().');
  else auditar({ accion: 'RESELLADO_DIAS_SOPORTE', entidad: 'EVOLUCIONES',
    idEntidad: 'episodios activos', patientId: '',
    resumen: evosTocadas + ' evoluciones re-selladas por tramos' });
  return log.join('\n');
}
