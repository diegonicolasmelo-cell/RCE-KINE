/**
 * mantenimiento_manuel.gs - HERRAMIENTAS de mantenimiento para correr A MANO
 * desde el editor de Apps Script. No forma parte de la app: ninguna funcion de
 * aqui se llama desde `api()` ni desde el index.
 *
 * A - limpiarPacientePrueba* - saca del registro un episodio de prueba.
 * B - resellarDiasSoporte*   - reescribe DIAS_VM / DIAS_VNI / DIAS_VA por tramos.
 * C - medirGuardado*         - cronometra apertura y guardado en la planilla real.
 *
 * Las de escritura vienen en pareja SIMULACRO / CONFIRMAR, igual que
 * `resetearBaseDeDatos` / `resetearBaseDeDatosCONFIRMAR`: el simulacro informa y
 * no toca nada. Correr SIEMPRE el simulacro primero y leer el registro.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * 🔒 POR QUE ESTE ARCHIVO NO LLEVA DATOS DE PACIENTES (20-ago-2026)
 * ────────────────────────────────────────────────────────────────────────────
 * Este archivo tenia dentro dos TABLAS CON APELLIDOS DE PACIENTES REALES, cada
 * uno con su cama, su fecha de ingreso y su primer dia de VM: la de
 * `corregirIngresos*` (fechas de ingreso de los que ya estaban hospitalizados
 * al cargar el sistema) y la de `_MTO_SEED_TRAMOS` (historia previa a la app).
 *
 * Se vaciaron las dos, y `corregirIngresos*` se elimino entera, por dos
 * razones que se suman:
 *
 * 1. PRIVACIDAD. Este repositorio es PUBLICO. Apellido + cama + fecha de
 *    ingreso a UCI + dias de ventilacion es dato sensible de salud
 *    identificable: Ley 19.628 y Ley 20.584. La identidad de un paciente no se
 *    versiona, y menos en abierto.
 *
 * 2. `corregirIngresos*` YA NO HACE FALTA. Desde el modo Coordinacion (v5.63,
 *    ago-2026) esa correccion se hace DESDE LA APP, con clave, firma clinica
 *    real y sello en AUDIT_LOG: buscar al paciente en la pestaña COORDINACION
 *    y corregirle la fecha recalcula sus dias solo. Escribir una tabla de
 *    nombres a mano en el editor era justamente el dolor que ese modo vino a
 *    matar.
 *
 * La regla que queda para siempre: los datos del paciente NO entran al
 * repositorio. Se escriben en el editor, se corre, y se vacia.
 */

// ---------------------------------------------------------------- A - limpieza

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

// ---------------------------------------------------------- B - re-sellado
// Re-sellado de los DIAS DE SOPORTE por tramos (4-ago-2026).
//
// HALLAZGO DE DIEGO: una paciente con DOS tramos de VM y DOS de VNI (extubada
// a VNI, reintubada, extubacion accidental a VNI) tenia contadores que o bien
// reiniciaban la cuenta en cada reintubacion, o bien contaban el dia de la
// transicion PARA LOS DOS soportes (VM 8 + VNI 7 = 15 dias en una estadia de
// 13, "dias falsos"). Y un paciente egreso con MAS dias de VM que de estadia
// por el mismo defecto.
//
// Este re-sellado recorre las evoluciones de cada cama OCUPADA en orden y les
// escribe DIAS_VM / DIAS_VNI / DIAS_VA con la regla de TRAMOS: cada tramo
// aporta diasEntre(inicio, fin); el dia de la transicion pertenece al soporte
// SALIENTE y es el Dia 0 del entrante. Los tramos suman EXACTO la estadia.
// Es idempotente: re-correrlo no cambia nada que ya este bien.

/**
 * Historial PREVIO A QUE LA APP TRACKEARA al paciente: tramos ya CERRADOS (o
 * el inicio real del tramo abierto) que ninguna evolucion puede reconstruir,
 * porque el episodio empezo en papel antes de que el RCE registrara turnos
 * para esa cama.
 *
 * El re-sellado normal solo puede detectar tramos CAMINANDO las evoluciones ya
 * guardadas; si el paciente ya estaba en su tramo actual antes de la primera
 * evolucion en la app, esa historia queda invisible y el re-sellado ancla el
 * tramo a la fecha de esa primera evolucion — muy posterior a la real.
 *
 * 🔒 SE DEJA VACIO EN EL REPOSITORIO A PROPOSITO. Esta tabla necesita apellido,
 * cama y fechas clinicas reales para funcionar, o sea identidad de paciente, y
 * este repositorio es PUBLICO (Ley 19.628 / Ley 20.584). Se llena EN EL EDITOR
 * justo antes de correr y se vacia (o se borra el archivo) al terminar. La
 * tanda del 5-ago-2026 se corrio asi y sus datos ya no viven aqui.
 *
 * Forma de cada entrada:
 *   { cama: '9', nom: 'APELLIDO',
 *     DIAS_VM:  { acum: 0, ini: '2026-07-31' },   // acum = dias ya cerrados
 *     DIAS_VNI: { acum: 0, ini: null },           // ini  = inicio del tramo
 *     DIAS_VA:  { acum: 0, ini: '2026-07-31' } }  //       abierto, o null
 *
 * Es `var` y no `const` para que la bateria pueda sembrarle un escenario
 * ficticio (build/checks/dias_soporte.js) sin tocar este archivo.
 */
var _MTO_SEED_TRAMOS = [];

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


// ════════════════════════════════════════════════════════════════════════════
//  C - MEDIDOR DE LA OLA 4 — guardado y apertura, en LA PLANILLA REAL
// ════════════════════════════════════════════════════════════════════════════
/**
 * Cronometra lo que el kinesiólogo espera: abrir un paciente (GET_EVO_TURNO)
 * y guardar una evolución. Correr DOS veces desde el editor:
 *
 *   1. ANTES de pegar la ola: pegar SOLO mantenimiento_manuel.gs y correr
 *      medirGuardado('<cama de prueba>')  →  números del código actual.
 *   2. DESPUÉS de pegar repo/esquema/infra_auth/svc_*: correr igual.
 *
 * La APERTURA se mide sobre la primera cama ocupada real (lectura pura, cero
 * riesgo). El GUARDADO solo corre si se pasa una CAMA DE PRUEBA (valida
 * _esCamaPrueba): escribe un turno sintético, mide crear y re-guardar, y
 * después BORRA la evolución, sus procedimientos y sus hitos, y restaura la
 * fila de la cama tal como estaba. En AUDIT_LOG quedan las 0-2 líneas de la
 * prueba, a propósito: hubo escrituras y la traza lo dice.
 *
 * Regla de siempre: NUNCA declarar segundos que no salieron de aquí. Este
 * medidor usa solo funciones que existen en ambas versiones del código.
 */
function medirGuardado(idCamaPrueba) {
  const out = [];
  const p = function (s) { out.push(s); Logger.log(s); };
  const cron = function (etiqueta, fn) {
    const t0 = Date.now();
    let r = null, e = '';
    try { r = fn(); } catch (ex) { e = ex.message; }
    const ms = Date.now() - t0;
    p('   ' + etiqueta + ': ' + ms + ' ms' + (e ? '   ⚠ ' + e : ''));
    return { ms: ms, r: r };
  };
  const filasDe = function (hoja) {
    try {
      const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(hoja);
      return h ? Math.max(0, h.getLastRow() - FILA_DATOS[hoja] + 1) : 0;
    } catch (e) { return -1; }
  };
  p('Tamaño hoy: EVOLUCIONES ' + filasDe('EVOLUCIONES') + ' · PROCEDIMIENTOS ' +
    filasDe('PROCEDIMIENTOS') + ' · TIMELINE ' + filasDe('TIMELINE') +
    ' · AUDIT_LOG ' + filasDe('AUDIT_LOG') + ' filas');
  p('');

  // ── Apertura (lectura pura, sobre datos reales) ──
  const ocupadas = repoLeerTodos('CAMAS_ESTADO').filter(function (c) { return esVerdadero(c.OCUPADA); });
  if (!ocupadas.length) { p('Sin camas ocupadas: no hay apertura que medir.'); return out.join('\n'); }
  const camaReal = String(ocupadas[0].ID_CAMA);
  const tkHoy = hoyISO() + '-Dia';
  const cal = Date.now();
  try { obtenerEvoTurno(camaReal, tkHoy); } catch (e) {}
  p('Calentamiento (arranque en frío): ' + (Date.now() - cal) + ' ms');
  p('Abrir paciente (cama ' + camaReal + ', dos corridas — la diferencia entre ellas es el ruido de red):');
  cron('GET_EVO_TURNO corrida 1', function () { return obtenerEvoTurno(camaReal, tkHoy); });
  cron('GET_EVO_TURNO corrida 2', function () { return obtenerEvoTurno(camaReal, tkHoy); });
  p('');

  // ── Guardado (solo en cama de prueba, y se limpia al terminar) ──
  const idC = String(idCamaPrueba || '');
  if (!idC) {
    p('Guardado NO medido: pásame una cama de prueba — medirGuardado(\'101\').');
    return out.join('\n');
  }
  if (typeof _esCamaPrueba !== 'function' || !_esCamaPrueba(idC)) {
    p('Guardado NO medido: la cama ' + idC + ' NO es de prueba. Con datos reales no se escribe.');
    return out.join('\n');
  }
  const camaAntes = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idC);
  if (!camaAntes) { p('Guardado NO medido: la cama ' + idC + ' no existe.'); return out.join('\n'); }
  const tk = hoyISO() + '-Dia';
  const idEvo = 'CAMA_' + idC + '_' + tk;
  const payload = {
    idCama: idC, turnoKey: tk, PLAN_FIRMA_KINE: 'MED',
    PAC_NOMBRE: 'PRUEBA MEDIDOR', PAC_EDAD: 60, PAC_SEXO: 'M', PAC_TALLA: 170,
    PAC_DIAGNOSTICO: 'Prueba de rendimiento',
    VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
    VENT_VT: 420, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 40, VENT_SPO2: 96,
    PVE_VAL: 'no', PVE_SC_RAZON: 'Sedación profunda',
    KTM_REALIZADA: true, KTM_NIVEL_KTR: '2', RESP_KTR_CANT: 1,
    PROC_JSON: JSON.stringify(['KTR', 'ECOGRAFÍA']), PROC_RESUMEN: 'KTR, ECOGRAFÍA', PROC_CANTIDAD: 2,
  };
  const ctx = { email: 'medidor@editor', firma: 'MED' };
  p('Guardar en cama de prueba ' + idC + ' (turno ' + tk + '):');
  cron('GUARDAR crear', function () { return guardarEvolucion(payload, ctx); });
  cron('GUARDAR re-guardar', function () { return guardarEvolucion(payload, ctx); });

  // Limpieza: borrar lo escrito y dejar la cama TAL COMO ESTABA.
  repoEliminarDonde('EVOLUCIONES', function (e) { return String(e.ID_EVOLUCION) === idEvo; });
  repoEliminarDonde('PROCEDIMIENTOS', function (r) { return String(r.ID_EVOLUCION) === idEvo; });
  repoEliminarDonde('TIMELINE', function (h) {
    return String(h.ID_CAMA) === idC && String(h.FECHA) === hoyISO() &&
      ['via_aerea', 'procedimiento', 'kine', 'general'].indexOf(h.TIPO) !== -1;
  });
  repoActualizar('CAMAS_ESTADO', 'ID_CAMA', idC, camaAntes);
  SpreadsheetApp.flush();
  p('Limpieza: evolución, procedimientos e hitos de la prueba borrados; cama ' + idC + ' restaurada.');
  p('');
  p('Comparar contra la otra corrida (antes/después de pegar). Lo que decide');
  p('es la diferencia entre versiones, no el número absoluto de un día.');
  return out.join('\n');
}

/**
 * Atajo para el selector del editor, que no acepta argumentos: mide usando la
 * PRIMERA cama de prueba (NUM_CAMAS+1). Si aún no existe, correr antes
 * agregarCamasPrueba() (idempotente, de mantenimiento.gs).
 */
function medirGuardadoEnCamaPrueba() {
  const real = parseInt(leerConfig('NUM_CAMAS', '18'), 10) || 18;
  return medirGuardado(String(real + 1));
}
