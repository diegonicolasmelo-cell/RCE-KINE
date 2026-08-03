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
const _MTO_FECHAS = [
  // --- REPARACION (2-ago 16:00): la cama 5 roto y quedo con la fecha del
  // paciente ANTERIOR (10 dias que no son suyos). Su ingreso real es el 1-ago,
  // asi que vuelve a Dia 0. Lleva `forzar` porque la guardia la saltaria.
  { cama: '5',  ingreso: '2026-08-01', vm: '2026-08-01', forzar: true },

  // --- Pendientes de la segunda tanda ---
  { cama: '7',  ingreso: '2026-07-30', vm: '2026-07-30' },
  { cama: '8',  ingreso: '2026-07-31', vm: '2026-07-31' },
  { cama: '9',  ingreso: '2026-07-31', vm: '2026-07-31' },
  { cama: '11', ingreso: '2026-07-27', vm: '2026-07-27' },
  { cama: '13', ingreso: '2026-07-29', vm: '2026-07-29' },  // sin evento INGRESO anotado
  { cama: '14', ingreso: '2026-07-31', vm: '' },            // nunca estuvo en VM
  { cama: '15', ingreso: '2026-07-29', vm: '2026-07-29' },  // sin evento INGRESO anotado
  { cama: '16', ingreso: '2026-07-24', vm: '2026-07-24' },
  { cama: '17', ingreso: '2026-07-25', vm: '2026-07-25' },
  { cama: '18', ingreso: '2026-07-27', vm: '2026-07-27' },

  // FUERA a proposito, verificado con la planilla de las 15:46 del 2-ago:
  //  - cama 10: paciente nuevo, ingreso 1-ago = lo que ya tiene. Nada que hacer.
  //  - cama 12: egreso, la cama esta vacia.
  //  - camas 1,2,3,4,6: corregidas en la primera tanda con estas mismas fechas.
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

    // Guardia de rotacion: si no tiene la fecha de carga, no se toca. `forzar`
    // la salta a proposito, para reparar una cama que quedo mal escrita.
    const ingActual = String(c.FECHA_INGRESO || '').slice(0, 10);
    if (ingActual !== _MTO_FECHA_CARGA && !f.forzar) {
      p('   !! NO SE TOCA: su ingreso dice ' + (ingActual || '(vacio)') +
        ', no ' + _MTO_FECHA_CARGA + '.');
      p('      O ya se corrigio, o esta cama roto y hay otro paciente. Revisar a mano.');
      saltadas++; return;
    }
    if (f.forzar) p('   (REPARACION forzada: se reescribe aunque diga ' + ingActual + ')');
    p('   ingreso   ' + String(c.FECHA_INGRESO || '(vacio)') + '  ->  ' + f.ingreso +
      ' ' + _MTO_HORA_INGRESO);

    const campos = {
      FECHA_INGRESO: f.ingreso,
      TS_INGRESO:    f.ingreso + ' ' + _MTO_HORA_INGRESO,
    };

    // Los relojes de via aerea y de VM solo se tocan si el paciente los tiene
    // hoy: si no, se estaria inventando un inicio para algo que no existe.
    const tieneVA = ['TOT', 'TQT'].indexOf(String(c.VIA_AEREA || '')) !== -1;
    const tieneVM = String(c.SOPORTE || '') === 'VM';
    if (f.vm && (tieneVA || tieneVM)) {
      const ts = f.vm + ' ' + _MTO_HORA_INGRESO;
      if (tieneVA) {
        campos.FECHA_INICIO_VA = f.vm; campos.TS_INICIO_VA = ts;
        p('   via aerea ' + String(c.FECHA_INICIO_VA || '(vacio)') + '  ->  ' + f.vm);
      }
      if (tieneVM) {
        campos.FECHA_INICIO_SOPORTE = f.vm; campos.TS_INICIO_SOPORTE = ts;
        p('   VM        ' + String(c.FECHA_INICIO_SOPORTE || '(vacio)') + '  ->  ' + f.vm);
      }
    } else if (f.vm) {
      p('   (hoy sin via aerea artificial ni VM: no se tocan esos relojes)');
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
      // Misma referencia determinista que usa el guardado (refTurno):
      // Dia -> 15:00 del dia, Noche -> 03:00 del dia siguiente.
      const ref = refTurno(m[1], m[2]);
      const dEst = diasBloques24(c.TS_INGRESO, c.FECHA_INGRESO, ref.fecha, ref.hora);
      const dVM = (String(e.VENT_SOPORTE_FINAL || e.VENT_SOPORTE || '') === 'VM')
        ? diasBloques24(c.TS_INICIO_SOPORTE, c.FECHA_INICIO_SOPORTE, ref.fecha, ref.hora) : 0;
      const vaF = String(e.VENT_VIA_AEREA_FINAL || e.VENT_VIA_AEREA || '');
      const dVA = (vaF === 'TOT' || vaF === 'TQT')
        ? diasBloques24(c.TS_INICIO_VA, c.FECHA_INICIO_VA, ref.fecha, ref.hora) : 0;
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
