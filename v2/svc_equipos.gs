/**
 * svc_equipos.gs — Seguimiento de ventiladores de la unidad.
 *
 * Inventario vivo (hoja VENTILADORES: se agregan y dan de baja equipos) +
 * trazabilidad de movimientos (hoja MOVIMIENTOS_VM). Un ventilador está en
 * una CAMA, en BODEGA o en PRESTAMO a otra unidad (Urgencias, UTI, Medicina,
 * Neurología, Cirugía…). Toda escritura pasa por api.gs y queda auditada.
 */

/**
 * Repara ventiladores sin ID_VM (filas cargadas a mano o de versiones viejas):
 * les asigna un ID único. Sin ID, el tablero no puede seleccionarlos ni moverlos
 * (todos los de id vacío se marcaban juntos). Idempotente: corre las veces que
 * quieras. Ejecutar desde el editor de Apps Script.
 */
function repararIdsVentiladores() {
  const rows = repoLeerTodos('VENTILADORES');
  let n = 0;
  rows.forEach(function (x) {
    if (!String(x.ID_VM || '').trim()) {
      const nid = uid('VM');
      // clave de búsqueda: por nombre (única en la práctica) para ubicar la fila
      repoActualizar('VENTILADORES', 'NOMBRE', x.NOMBRE, { ID_VM: nid });
      n++;
    }
  });
  SpreadsheetApp.flush();
  const msg = 'Ventiladores reparados (ID asignado): ' + n;
  console.log(msg);
  return msg;
}

function obtenerVentiladores() {
  try {
    const rows = repoLeerTodos('VENTILADORES').map(function (x) {
      return {
        id: x.ID_VM, nombre: x.NOMBRE, marca: x.MARCA, modelo: x.MODELO,
        serie: x.NUM_SERIE, inventario: x.NUM_INVENTARIO, anio: x.ANIO_ADQ,
        ubicTipo: x.UBIC_TIPO, ubicDetalle: String(x.UBIC_DETALLE || ''),
        fechaUbicacion: _statISO(x.FECHA_UBICACION),
        estado: x.ESTADO || 'Operativo', activo: esVerdadero(x.ACTIVO), obs: x.OBS || '',
        fechaMant: _statISO(x.FECHA_MANT), fechaMantProx: _statISO(x.FECHA_MANT_PROX),
      };
    });
    rows.sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es', { numeric: true }); });
    return ok(rows);
  } catch (e) { return err('obtenerVentiladores: ' + e.message, ERR.INTERNO, e); }
}

/** Etiqueta legible de una ubicación (para el historial de movimientos). */
function _vmUbicLabel(tipo, detalle) {
  if (tipo === 'CAMA') return 'Cama ' + detalle;
  if (tipo === 'PRESTAMO') return 'Préstamo: ' + (detalle || '¿unidad?');
  if (tipo === 'PASILLO') return 'Pasillo';
  if (tipo === 'EQUIPOS') return 'Equipos médicos';
  return 'Bodega';
}

/** Alta o edición de metadatos. El movimiento de ubicación va por moverVentilador. */
function guardarVentilador(d, ctx) {
  return conLock(function () {
    try {
      if (!d.nombre) return err('El ventilador necesita un nombre/código.', ERR.VALIDACION);
      const esNuevo = !d.id;
      const id = d.id || uid('VM');
      const previo = esNuevo ? null : repoBuscarPorId('VENTILADORES', 'ID_VM', id);
      if (!esNuevo && !previo) return err('Ventilador no encontrado: ' + id, ERR.VALIDACION);
      const ubicTipo = d.ubicTipo || (previo && previo.UBIC_TIPO) || 'BODEGA';
      const fila = {
        ID_VM: id, NOMBRE: d.nombre,
        MARCA: d.marca || '', MODELO: d.modelo || '',
        NUM_SERIE: d.serie || '', NUM_INVENTARIO: d.inventario || '',
        ANIO_ADQ: d.anio || '',
        UBIC_TIPO: ubicTipo,
        UBIC_DETALLE: d.ubicDetalle !== undefined ? String(d.ubicDetalle || '') : String((previo && previo.UBIC_DETALLE) || ''),
        FECHA_UBICACION: esNuevo ? (_statISO(d.fecha) || hoyISO()) : (previo ? previo.FECHA_UBICACION : hoyISO()),
        ESTADO: d.estado || (previo && previo.ESTADO) || 'Operativo',
        ACTIVO: true, OBS: d.obs !== undefined ? d.obs : ((previo && previo.OBS) || ''),
        FECHA_MANT: d.fechaMant !== undefined ? (_statISO(d.fechaMant) || '') : String((previo && previo.FECHA_MANT) || ''),
        FECHA_MANT_PROX: d.fechaMantProx !== undefined ? (_statISO(d.fechaMantProx) || '') : String((previo && previo.FECHA_MANT_PROX) || ''),
        TIMESTAMP: ahoraTS(),
      };
      repoUpsert('VENTILADORES', 'ID_VM', id, fila);
      if (esNuevo) {
        repoInsertar('MOVIMIENTOS_VM', {
          ID_MOV: uid('MOV'), ID_VM: id, TIMESTAMP: ahoraTS(),
          FECHA: fila.FECHA_UBICACION, DESDE: 'ALTA EN INVENTARIO',
          HACIA: _vmUbicLabel(fila.UBIC_TIPO, fila.UBIC_DETALLE),
          MOTIVO: d.motivo || 'Ingreso al inventario', FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
        });
      }
      return ok({ id: id, accion: esNuevo ? 'alta' : 'editar', entidad: 'VENTILADORES' });
    } catch (e) { return err('guardarVentilador: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Mueve un ventilador a una cama, a bodega o a préstamo; deja huella en MOVIMIENTOS_VM. */
function moverVentilador(d, ctx) {
  return conLock(function () {
    try {
      const vmx = repoBuscarPorId('VENTILADORES', 'ID_VM', d.idVm);
      if (!vmx) return err('Ventilador no encontrado.', ERR.VALIDACION);
      if (!esVerdadero(vmx.ACTIVO)) return err('El ventilador está dado de baja.', ERR.VALIDACION);
      const tipo = d.tipo;
      if (['CAMA', 'BODEGA', 'PRESTAMO', 'PASILLO', 'EQUIPOS'].indexOf(tipo) === -1) return err('Destino inválido.', ERR.VALIDACION);
      if (tipo === 'CAMA' && !d.detalle) return err('Indica el número de cama.', ERR.VALIDACION);
      if (tipo === 'PRESTAMO' && !d.detalle) return err('Indica la unidad del préstamo.', ERR.VALIDACION);
      const detalle = (tipo === 'CAMA' || tipo === 'PRESTAMO') ? String(d.detalle) : '';
      // Una cama tiene UN ventilador: si otro equipo ocupa la cama destino, se rechaza.
      if (tipo === 'CAMA') {
        const choque = repoLeerTodos('VENTILADORES').find(function (x) {
          return esVerdadero(x.ACTIVO) && x.UBIC_TIPO === 'CAMA' && String(x.UBIC_DETALLE) === detalle && x.ID_VM !== vmx.ID_VM;
        });
        if (choque) return err('La cama ' + detalle + ' ya tiene asignado ' + choque.NOMBRE + '. Muévelo primero.', ERR.VALIDACION);
      }
      const fecha = _statISO(d.fecha) || hoyISO();
      const desde = _vmUbicLabel(vmx.UBIC_TIPO, vmx.UBIC_DETALLE);
      const hacia = _vmUbicLabel(tipo, detalle);
      repoActualizar('VENTILADORES', 'ID_VM', d.idVm, {
        UBIC_TIPO: tipo, UBIC_DETALLE: detalle, FECHA_UBICACION: fecha,
        ESTADO: d.estado || vmx.ESTADO || 'Operativo', TIMESTAMP: ahoraTS(),
      });
      repoInsertar('MOVIMIENTOS_VM', {
        ID_MOV: uid('MOV'), ID_VM: d.idVm, TIMESTAMP: ahoraTS(), FECHA: fecha,
        DESDE: desde, HACIA: hacia, MOTIVO: d.motivo || '',
        FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
      });
      return ok({ id: d.idVm, accion: 'mover', entidad: 'VENTILADORES', resumen: desde + ' → ' + hacia });
    } catch (e) { return err('moverVentilador: ' + e.message, ERR.INTERNO, e); }
  });
}

/**
 * Mueve VARIOS ventiladores de una vez (reorganización de la unidad, mantención
 * de equipos). Pedido de Diego (ago-2026): confirmar uno por uno era lento.
 *
 * TODO O NADA: primero valida el lote COMPLETO contra el estado FINAL y, si algo
 * no cuadra, no escribe nada y devuelve la lista de problemas. Validar el estado
 * final (y no movimiento a movimiento) permite además INTERCAMBIAR ventiladores
 * entre camas, que uno por uno obligaba a pasar por bodega o pasillo.
 * Cada movimiento deja igual su registro en MOVIMIENTOS_VM.
 */
function moverVentiladoresLote(d, ctx) {
  return conLock(function () {
    try {
      const movs = (d && d.movimientos) || [];
      if (!movs.length) return err('No hay movimientos que aplicar.', ERR.VALIDACION);

      const equipos = repoLeerTodos('VENTILADORES');
      const porId = {};
      equipos.forEach(function (x) { porId[String(x.ID_VM)] = x; });

      // ── 1. Validación previa: nada se escribe hasta que todo el lote cuadre ──
      const problemas = [];
      const vistos = {};
      const normal = [];
      movs.forEach(function (m, i) {
        const n = i + 1;
        const vmx = porId[String(m.idVm)];
        const nom = (vmx && vmx.NOMBRE) || ('movimiento ' + n);
        if (!vmx) { problemas.push('Movimiento ' + n + ': ventilador no encontrado.'); return; }
        if (!esVerdadero(vmx.ACTIVO)) { problemas.push(nom + ': está dado de baja.'); return; }
        if (vistos[String(m.idVm)]) { problemas.push(nom + ': aparece dos veces en la lista.'); return; }
        vistos[String(m.idVm)] = true;
        const tipo = m.tipo;
        if (['CAMA', 'BODEGA', 'PRESTAMO', 'PASILLO', 'EQUIPOS'].indexOf(tipo) === -1) {
          problemas.push(nom + ': destino inválido.'); return;
        }
        if (tipo === 'CAMA' && !m.detalle) { problemas.push(nom + ': falta el número de cama.'); return; }
        if (tipo === 'PRESTAMO' && !m.detalle) { problemas.push(nom + ': falta la unidad del préstamo.'); return; }
        normal.push({
          idVm: String(m.idVm), vmx: vmx, tipo: tipo,
          detalle: (tipo === 'CAMA' || tipo === 'PRESTAMO') ? String(m.detalle) : '',
          motivo: m.motivo || '', fecha: _statISO(m.fecha) || hoyISO(), estado: m.estado || '',
        });
      });

      // Estado FINAL de las camas: las que no se mueven + las del lote
      if (!problemas.length) {
        const camaFinal = {};
        equipos.forEach(function (x) {
          if (!esVerdadero(x.ACTIVO) || x.UBIC_TIPO !== 'CAMA') return;
          if (vistos[String(x.ID_VM)]) return;          // este se mueve: su cama queda libre
          camaFinal[String(x.UBIC_DETALLE)] = x.NOMBRE || x.ID_VM;
        });
        normal.forEach(function (m) {
          if (m.tipo !== 'CAMA') return;
          const ya = camaFinal[m.detalle];
          if (ya) problemas.push('La cama ' + m.detalle + ' quedaría con dos ventiladores: ' + ya + ' y ' + (m.vmx.NOMBRE || m.idVm) + '.');
          else camaFinal[m.detalle] = m.vmx.NOMBRE || m.idVm;
        });
      }

      if (problemas.length) {
        return err('No se aplicó ningún movimiento:\n· ' + problemas.join('\n· '), ERR.VALIDACION);
      }

      // ── 2. Aplicación: el lote ya está validado por completo ──
      const resumen = [];
      normal.forEach(function (m) {
        const desde = _vmUbicLabel(m.vmx.UBIC_TIPO, m.vmx.UBIC_DETALLE);
        const hacia = _vmUbicLabel(m.tipo, m.detalle);
        repoActualizar('VENTILADORES', 'ID_VM', m.idVm, {
          UBIC_TIPO: m.tipo, UBIC_DETALLE: m.detalle, FECHA_UBICACION: m.fecha,
          ESTADO: m.estado || m.vmx.ESTADO || 'Operativo', TIMESTAMP: ahoraTS(),
        });
        repoInsertar('MOVIMIENTOS_VM', {
          ID_MOV: uid('MOV'), ID_VM: m.idVm, TIMESTAMP: ahoraTS(), FECHA: m.fecha,
          DESDE: desde, HACIA: hacia, MOTIVO: m.motivo,
          FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
        });
        resumen.push((m.vmx.NOMBRE || m.idVm) + ': ' + desde + ' → ' + hacia);
      });
      return ok({ entidad: 'VENTILADORES', accion: 'mover ' + normal.length + ' equipos',
        total: normal.length, detalle: resumen });
    } catch (e) { return err('moverVentiladoresLote: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Baja de inventario (no borra: conserva la trazabilidad). */
function bajaVentilador(d, ctx) {
  return conLock(function () {
    try {
      const vmx = repoBuscarPorId('VENTILADORES', 'ID_VM', d.idVm);
      if (!vmx) return err('Ventilador no encontrado.', ERR.VALIDACION);
      repoActualizar('VENTILADORES', 'ID_VM', d.idVm, {
        ACTIVO: false, ESTADO: 'De baja', UBIC_TIPO: 'BODEGA', UBIC_DETALLE: '',
        FECHA_UBICACION: hoyISO(), TIMESTAMP: ahoraTS(),
      });
      repoInsertar('MOVIMIENTOS_VM', {
        ID_MOV: uid('MOV'), ID_VM: d.idVm, TIMESTAMP: ahoraTS(), FECHA: hoyISO(),
        DESDE: _vmUbicLabel(vmx.UBIC_TIPO, vmx.UBIC_DETALLE), HACIA: 'BAJA DE INVENTARIO',
        MOTIVO: d.motivo || '', FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
      });
      return ok({ id: d.idVm, accion: 'baja', entidad: 'VENTILADORES' });
    } catch (e) { return err('bajaVentilador: ' + e.message, ERR.INTERNO, e); }
  });
}

function obtenerMovimientosVM(idVm, limite) {
  try {
    let rows = repoLeerTodos('MOVIMIENTOS_VM');
    if (idVm) rows = rows.filter(function (m) { return String(m.ID_VM) === String(idVm); });
    rows.sort(function (a, b) { return String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)); });
    if (limite) rows = rows.slice(0, limite);
    return ok(rows.map(function (m) {
      return { fecha: _statISO(m.FECHA), desde: m.DESDE, hacia: m.HACIA, motivo: m.MOTIVO || '', firma: m.FIRMA || '' };
    }));
  } catch (e) { return err('obtenerMovimientosVM: ' + e.message, ERR.INTERNO, e); }
}

/**
 * importarDispositivosUCI — carga el inventario real de ventiladores de la UCI
 * (planilla oficial "Lista de dispositivos UCIA"). Idempotente: NO duplica
 * (omite equipos cuyo N° de inventario ya existe; los de inventario en blanco
 * se cotejan por nombre). Correr UNA vez desde el editor de Apps Script.
 */
function importarDispositivosUCI() {
  const SEED = [
    {n:"AVEA 1",ma:"AVEA",inv:"8-24072",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala"},
    {n:"AVEA 2",ma:"AVEA",inv:"8-24073",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2025-04-03",ob:"Tipo: Sala · Ubic. real: Equipos Médicos · No pasa mantención (calibración de peep) + falta filtro"},
    {n:"AVEA 3",ma:"AVEA",inv:"8-24074",es:"Operativo",ac:true,ut:"CAMA",ud:"8",fm:"2025-04-01",ob:"Tipo: Sala"},
    {n:"MEKICS",ma:"MEKICS",inv:"8-27932",es:"Operativo",ac:true,ut:"PRESTAMO",ud:"Neurocirugía",fm:"2026-04-27",ob:"Tipo: Sala · *Ventilador asignado a Neuro / Cambio celda O2 03/02/2026"},
    {n:"MEKICS",ma:"MEKICS",inv:"8-27926",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Piso Mecánico / EM · Compresor externo (No pasa mant, falta sensor de flujo y membrana)"},
    {n:"MEKICS 12",ma:"MEKICS",inv:"8-28721",es:"Operativo",ac:true,ut:"CAMA",ud:"14",fm:"2026-04-27",ob:"Tipo: Sala · Fallas anteriores: se rompe enchufe / Cambio celda O2 03/02/2026"},
    {n:"MEKICS",ma:"MEKICS",inv:"8-28399",es:"Operativo",ac:true,ut:"PRESTAMO",ud:"UTI",fm:"2026-04-27",ob:"Tipo: Sala · *Ventilador de la UTI / Cambio celda O2 03/02/2026"},
    {n:"MEKICS",ma:"MEKICS",inv:"8-27917",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Piso Mecánico / EM · Compresor externo / Cambio celda O2 03/02/2026"},
    {n:"MEKICS  1",ma:"MEKICS",inv:"8-27409",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Equipos Médicos · Falla sensor de flujo / Cambio celda O2 03/02/2026"},
    {n:"MEKICS  2",ma:"MEKICS",inv:"8-27410",es:"Operativo",ac:true,ut:"PRESTAMO",ud:"Préstamo Ovalle",fm:"",ob:"Tipo: Sala · Ex préstamo a Ovalle, última mantención: 27/04/2026."},
    {n:"MEKICS  3",ma:"MEKICS",inv:"8-27411",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Cambio válvula exhalatoria y sensor de flujo 04/07 // Fallas anteriores: sensor de flujo / 15/05 falla sensor de flujo, marca Vmin muyalto, paciente sedado bien acoplado en VC / Cambio celda O2 03/02/2026"},
    {n:"MEKICS  4",ma:"MEKICS",inv:"8-27412",es:"Operativo",ac:true,ut:"CAMA",ud:"11",fm:"2026-04-27",ob:"Tipo: Sala · Fallos anteriores: pantalla / falla sensor de flujo"},
    {n:"MEKICS  5",ma:"MEKICS",inv:"8-27413",es:"Operativo",ac:true,ut:"CAMA",ud:"1",fm:"2026-04-27",ob:"Tipo: Sala · Cambio celda O2 03/02/2026"},
    {n:"MEKICS  6",ma:"MEKICS",inv:"8-27414",es:"Operativo",ac:true,ut:"CAMA",ud:"6",fm:"2026-04-27",ob:"Tipo: Sala · Fallos anteriores: falta membrana"},
    {n:"MEKICS  7",ma:"MEKICS",inv:"8-27417",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2025-04-01",ob:"Tipo: Sala · Ubic. real: Piso Mecánico / EM · Equipo con compresor externo"},
    {n:"MEKICS  9",ma:"MEKICS",inv:"8-27923",es:"Operativo",ac:true,ut:"CAMA",ud:"13",fm:"2026-04-27",ob:"Tipo: Sala"},
    {n:"MEKICS 10",ma:"MEKICS",inv:"8-28401",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · *Cambio sensor de flujo y membrana 03/07/2025 *Falla de flujo 11/07/2025 / Cambio celda O2 03/02/2026"},
    {n:"MEKICS 11",ma:"MEKICS",inv:"8-28402",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · *No gatilla en espontáneo / Nominación duplicada: Nº 15"},
    {n:"MEKICS 8",ma:"MEKICS",inv:"8-27920",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Piso Mecánico / EM · Compresor externo"},
    {n:"NEWPORT 1",ma:"NEWPORT",inv:"8-27350",es:"En mantención",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Transporte · Ubic. real: Transporte · Pendiente cambio sensor de oxígeno."},
    {n:"PURITAN BENNETT 1",ma:"PURITAN BENNETT",inv:"8-27544 / 8-27545",es:"Operativo",ac:true,ut:"CAMA",ud:"3",fm:"",ob:"Tipo: Sala · PB 1 y 2 corresponden al mismo VM (mismo N° de serie) / Válvula de seguridad reparada por equipos médicos / Falla 15/05 aparentemente por mal cierre de válvula de seguridad. Mantención preventiva 12/02/26. Cambio de batería, retorna 04/06."},
    {n:"PURITAN BENNETT 2",ma:"PURITAN BENNETT",inv:"8-27546",es:"Operativo",ac:true,ut:"CAMA",ud:"12",fm:"",ob:"Tipo: Sala · Mantención preventiva 12/02/26."},
    {n:"SAVINA 1",ma:"SAVINA",inv:"8-20429",es:"Operativo",ac:true,ut:"CAMA",ud:"9",fm:"2026-04-27",ob:"Tipo: Sala · Esperando respuestos (EM)"},
    {n:"SAVINA 2",ma:"SAVINA",inv:"8-20430",es:"Operativo",ac:true,ut:"CAMA",ud:"7",fm:"2025-04-24",ob:"Tipo: Sala · *Pendiente revisión por equipos médicos"},
    {n:"SAVINA 3",ma:"SAVINA",inv:"8-20431",es:"Operativo",ac:true,ut:"CAMA",ud:"5",fm:"2025-04-25",ob:"Tipo: Sala · Esperando respuestos (EM)"},
    {n:"SAVINA 4",ma:"SAVINA",inv:"8-20432",es:"Operativo",ac:true,ut:"CAMA",ud:"18",fm:"2026-04-27",ob:"Tipo: Sala"},
    {n:"SERVO U 1",ma:"SERVO U",inv:"8-27549",es:"Operativo",ac:true,ut:"CAMA",ud:"17",fm:"2026-04-27",ob:"Tipo: Sala · *Pendiente compra batería interna"},
    {n:"VELA 1",ma:"VELA",inv:"8-15015",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Equipos Médicos · N° Serie AHTO8081 / Pendiente rótulo"},
    {n:"VELA 10",ma:"VELA",inv:"8-24309",es:"Operativo",ac:true,ut:"CAMA",ud:"10",fm:"2026-04-27",ob:"Tipo: Sala"},
    {n:"VELA 11",ma:"VELA",inv:"8-24310",es:"Operativo",ac:true,ut:"CAMA",ud:"16",fm:"2026-04-27",ob:"Tipo: Sala"},
    {n:"VELA 12",ma:"VELA",inv:"8-24311",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"",ob:"Tipo: Sala · Ubic. real: Equipos médicos · Dado de baja por EM"},
    {n:"VELA 13",ma:"VELA",inv:"",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"",ob:"*Ya no hay VELA S/N"},
    {n:"VELA 2",ma:"VELA",inv:"8-15053",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"",ob:"*No aparece en inventario"},
    {n:"VELA 3",ma:"VELA",inv:"8-18419",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Transporte · Fuera de servicio por evaluación mantención 01/04/2025. No pasa mantención 01/04. 2025, se repara y retorna."},
    {n:"VELA 4",ma:"VELA",inv:"8-24075",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2025-04-01",ob:"Tipo: Sala · 06/10: Se envía a EM operativo pero con sonido de turbina muy fuerte. 03/02/26 Dado de baja por equipos médicos."},
    {n:"VELA 5",ma:"VELA",inv:"8-24076",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"2025-04-02",ob:"Tipo: Sala · 03/02/26 Falla sensor de flujo, dado de baja por equipos médicos12/02/26"},
    {n:"VELA 6",ma:"VELA",inv:"8-24078",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"",ob:""},
    {n:"VELA 7",ma:"VELA",inv:"8-24079",es:"De baja",ac:false,ut:"BODEGA",ud:"",fm:"",ob:"Tipo: Sala · Ubic. real: Equipos médicos"},
    {n:"VELA 8",ma:"VELA",inv:"8-24080",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Transporte"},
    {n:"VELA 9",ma:"VELA",inv:"8-24307",es:"Operativo",ac:true,ut:"CAMA",ud:"4",fm:"2026-04-27",ob:"Tipo: Sala · Falla: se apaga y prende luego de multiples intentos / 06/10/25: Conector diamond dañado"},
    {n:"V60 1",ma:"V60",inv:"8-27537",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: VNI"},
    {n:"V60 2",ma:"V60",inv:"8-27538",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: VNI"},
    {n:"V60 3",ma:"V60",inv:"8-25587",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: VNI · *Placa número de inventario: 8-25587, pero Equipos Médicos corrige número en cartel rótulo: 8-25387"},
    {n:"V60 4",ma:"V60",inv:"8-25389",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: VNI"},
    {n:"Carina UCI Pediátrica",ma:"Carina UCI Pediátrica",inv:"8-16227",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Transporte"},
    {n:"PB 980 UCI PED 1",ma:"PB 980 UCI PED",inv:"8-27535",es:"Operativo",ac:true,ut:"CAMA",ud:"2",fm:"2026-04-27",ob:"Tipo: Sala - Préstamo UCIP"},
    {n:"PB 980 UCI PED 2",ma:"PB 980 UCI PED",inv:"8-VMPB01",es:"Operativo",ac:true,ut:"CAMA",ud:"15",fm:"2026-04-27",ob:"Tipo: Sala - Préstamo UCIP"},
    {n:"MEKICS 14",ma:"MEKICS",inv:"8-28400",es:"En mantención",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Ubic. real: Cama 10 (ocupada en lista) · *Cambio sensor de flujo y membrana 03/07/2025 / Falla sensor de flujo. En espera de repuesto por batería."},
    {n:"MEKICS 15",ma:"MEKICS",inv:"8-28402",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · *Cambio sensor de flujo y membrana 03/07/2025"},
    {n:"MEKICS 16",ma:"MEKICS",inv:"8-28722",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · *VMI recuperado de Ovalle /  Cambio celda O2 03/02/2026"},
    {n:"MEKICS 17",ma:"MEKICS",inv:"8-27929",es:"Operativo",ac:true,ut:"BODEGA",ud:"",fm:"2026-04-27",ob:"Tipo: Sala · Pendiente rótulo."},
  ];
  const existentes = repoLeerTodos('VENTILADORES');
  const invSet = {}, nomSet = {};
  existentes.forEach(function (x) {
    const inv = String(x.NUM_INVENTARIO || '').trim();
    if (inv) invSet[inv.toLowerCase()] = true;
    nomSet[String(x.NOMBRE || '').trim().toLowerCase()] = true;
  });
  let agregados = 0, omitidos = 0;
  SEED.forEach(function (d) {
    const inv = String(d.inv || '').trim();
    const yaExiste = inv ? invSet[inv.toLowerCase()] : nomSet[String(d.n).trim().toLowerCase()];
    if (yaExiste) { omitidos++; return; }
    const id = uid('VM');
    const fecha = d.fm || hoyISO();
    repoInsertar('VENTILADORES', {
      ID_VM: id, NOMBRE: d.n, MARCA: d.ma || '', MODELO: '',
      NUM_SERIE: '', NUM_INVENTARIO: inv, ANIO_ADQ: '',
      UBIC_TIPO: d.ut, UBIC_DETALLE: d.ud || '',
      FECHA_UBICACION: fecha, ESTADO: d.es, ACTIVO: !!d.ac, OBS: d.ob || '',
      FECHA_MANT: d.fm || '', FECHA_MANT_PROX: '', TIMESTAMP: ahoraTS(),
    });
    repoInsertar('MOVIMIENTOS_VM', {
      ID_MOV: uid('MOV'), ID_VM: id, TIMESTAMP: ahoraTS(), FECHA: fecha,
      DESDE: 'IMPORTACIÓN INICIAL', HACIA: _vmUbicLabel(d.ut, d.ud || ''),
      MOTIVO: 'Carga del inventario oficial UCIA', FIRMA: 'SYS', AUTOR_EMAIL: '',
    });
    if (inv) invSet[inv.toLowerCase()] = true;
    nomSet[String(d.n).trim().toLowerCase()] = true;
    agregados++;
  });
  const msg = 'Importación UCIA: ' + agregados + ' agregados, ' + omitidos + ' ya existían.';
  console.log(msg);
  return msg;
}

/* ══ Historial de FALLAS por equipo (v4) ══
   Descripción OBLIGATORIA + foto OPCIONAL. La foto se comprime en el cliente
   (canvas) y llega en base64; se guarda en Drive (carpeta en CONFIG, creada
   al primer uso) y en la hoja va la URL. TODO-O-NADA: si Drive falla, no se
   escribe la fila. Las fotos no se comparten públicamente. */
function _fallasCarpeta() {
  const id = leerConfig('FALLAS_FOTOS_FOLDER', '');
  if (id) {
    try { return DriveApp.getFolderById(id); }
    catch (e) { /* carpeta borrada o sin acceso: se crea una nueva abajo */ }
  }
  const f = DriveApp.createFolder('RCE-KINE — Fallas de ventiladores');
  escribirConfig('FALLAS_FOTOS_FOLDER', f.getId());
  return f;
}
function registrarFallaVM(d, ctx) {
  ctx = ctx || {};
  return conLock(function () {
    try {
      const idVm = String(d.idVm || '');
      const desc = String(d.descripcion || '').trim();
      if (!idVm) return err('Falta el ventilador.', ERR.VALIDACION);
      if (!desc) return err('La descripción de la falla es obligatoria.', ERR.VALIDACION);
      const vmx = repoBuscarPorId('VENTILADORES', 'ID_VM', idVm);
      if (!vmx) return err('Ventilador no encontrado.', ERR.VALIDACION);

      // Foto: validar en el SERVIDOR (no basta el accept del input)
      let fotoUrl = '';
      if (d.fotoB64) {
        const mime = String(d.fotoMime || '');
        if (mime.indexOf('image/') !== 0) return err('El archivo debe ser una imagen.', ERR.VALIDACION);
        if (String(d.fotoB64).length > 6000000) return err('La foto es demasiado grande incluso comprimida (máx ~4 MB).', ERR.VALIDACION);
        const nombre = 'falla_' + String(vmx.NOMBRE || idVm).replace(/[^\w.-]+/g, '_') + '_' + hoyISO() + '_' + uid('F').slice(-6) + '.jpg';
        const blob = Utilities.newBlob(Utilities.base64Decode(d.fotoB64), mime, nombre);
        fotoUrl = _fallasCarpeta().createFile(blob).getUrl();   // si esto lanza, NO se escribe la fila
      }

      const fila = {
        ID_FALLA: uid('FALLA'), ID_VM: idVm, NOMBRE_VM: String(vmx.NOMBRE || ''),
        TIMESTAMP: ahoraTS(), FECHA: hoyISO(), DESCRIPCION: desc, FOTO_URL: fotoUrl,
        FIRMA: String(ctx.firma || d.firmaKine || ''), AUTOR_EMAIL: String(ctx.email || ''),
      };
      repoInsertar('FALLAS_VM', fila);
      // El equipo queda marcado con falla (estado visible en el inventario y
      // en el tag de la cama); se normaliza a mano al repararlo.
      repoActualizar('VENTILADORES', 'ID_VM', idVm, { ESTADO: 'Con falla' });
      SpreadsheetApp.flush();
      return ok({ entidad: 'FALLAS_VM', id: fila.ID_FALLA, idVm: idVm, fotoUrl: fotoUrl,
        accion: 'falla registrada: ' + String(vmx.NOMBRE || idVm) });
    } catch (e) { return err('registrarFallaVM: ' + e.message, ERR.INTERNO, e); }
  });
}
function obtenerFallasVM(idVm, limite) {
  try {
    const lim = parseInt(limite) || 30;
    const filas = repoLeerTodos('FALLAS_VM', 'ID_VM', String(idVm || ''))
      .sort(function (a, b) { return String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)); })
      .slice(0, lim)
      .map(function (x) { return { id: x.ID_FALLA, fecha: _statISO(x.FECHA), desc: String(x.DESCRIPCION || ''),
        foto: String(x.FOTO_URL || ''), firma: String(x.FIRMA || '') }; });
    return ok({ fallas: filas, total: filas.length });
  } catch (e) { return err('obtenerFallasVM: ' + e.message, ERR.INTERNO, e); }
}

// ═══════════════════════════════════════════════════════════════════════════
//  STOCK SIN NUMERAR (ago-2026) — Aerogen Pro-X, capnógrafos.
//  Equipos que la unidad NO puede seguir uno por uno (no tienen número), así
//  que se llevan por CANTIDAD. Cada ajuste (sacar/reponer) deja su fila en
//  MOVIMIENTOS_STOCK con motivo y firma: si mañana faltan dos, el libro dice
//  por qué. No se asignan a camas (sería un dato imposible de verificar).
// ═══════════════════════════════════════════════════════════════════════════
function obtenerStockEquipos() {
  try {
    const filas = repoLeerTodos('STOCK_EQUIPOS')
      .filter(function (x) { return esVerdadero(x.ACTIVO); })
      .map(function (x) {
        return { id: String(x.ID_STOCK || ''), nombre: String(x.NOMBRE || ''),
          marca: String(x.MARCA || ''), modelo: String(x.MODELO || ''),
          categoria: String(x.CATEGORIA || ''), cantidad: parseInt(x.CANTIDAD, 10) || 0,
          estado: String(x.ESTADO || 'Operativo'), obs: String(x.OBS || '') };
      });
    filas.sort(function (a, b) { return String(a.nombre).localeCompare(String(b.nombre), 'es', { numeric: true }); });
    // Último ajuste por ítem (para mostrarlo en la tarjeta sin abrir el historial)
    const ult = {};
    repoLeerTodos('MOVIMIENTOS_STOCK').forEach(function (m) {
      const k = String(m.ID_STOCK || '');
      if (!ult[k] || String(m.TIMESTAMP) > String(ult[k].TIMESTAMP)) ult[k] = m;
    });
    filas.forEach(function (f) {
      const m = ult[f.id];
      f.ultimo = m ? { fecha: _statISO(m.FECHA), delta: parseInt(m.DELTA, 10) || 0,
        motivo: String(m.MOTIVO || ''), firma: String(m.FIRMA || '') } : null;
    });
    return ok(filas);
  } catch (e) { return err('obtenerStockEquipos: ' + e.message, ERR.INTERNO, e); }
}

/** Alta o edición de un tipo de equipo sin número (no toca la cantidad si no viene). */
function guardarStockEquipo(d, ctx) {
  return conLock(function () {
    try {
      if (!d.nombre) return err('El equipo necesita un nombre.', ERR.VALIDACION);
      const esNuevo = !d.id;
      const id = d.id || uid('STK');
      const previo = esNuevo ? null : repoBuscarPorId('STOCK_EQUIPOS', 'ID_STOCK', id);
      if (!esNuevo && !previo) return err('Equipo de stock no encontrado: ' + id, ERR.VALIDACION);
      const cant = d.cantidad !== undefined && d.cantidad !== ''
        ? Math.max(0, parseInt(d.cantidad, 10) || 0)
        : (previo ? (parseInt(previo.CANTIDAD, 10) || 0) : 0);
      const fila = {
        ID_STOCK: id, NOMBRE: d.nombre,
        MARCA: d.marca !== undefined ? d.marca : String((previo && previo.MARCA) || ''),
        MODELO: d.modelo !== undefined ? d.modelo : String((previo && previo.MODELO) || ''),
        CATEGORIA: d.categoria !== undefined ? d.categoria : String((previo && previo.CATEGORIA) || ''),
        CANTIDAD: cant,
        ESTADO: d.estado || (previo && previo.ESTADO) || 'Operativo',
        ACTIVO: d.activo !== undefined ? !!d.activo : true,
        OBS: d.obs !== undefined ? d.obs : String((previo && previo.OBS) || ''),
        TIMESTAMP: ahoraTS(),
      };
      repoUpsert('STOCK_EQUIPOS', 'ID_STOCK', id, fila);
      if (esNuevo && cant > 0) {
        repoInsertar('MOVIMIENTOS_STOCK', {
          ID_MOV: uid('MST'), ID_STOCK: id, NOMBRE: fila.NOMBRE, TIMESTAMP: ahoraTS(),
          FECHA: _statISO(d.fecha) || hoyISO(), DELTA: cant, CANTIDAD_FINAL: cant,
          MOTIVO: d.motivo || 'Carga inicial', DETALLE: d.detalle || '',
          FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
        });
      }
      return ok({ id: id, accion: esNuevo ? 'alta' : 'editar', entidad: 'STOCK_EQUIPOS' });
    } catch (e) { return err('guardarStockEquipo: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Saca (delta negativo) o repone (positivo) unidades, con motivo obligatorio. */
function ajustarStockEquipo(d, ctx) {
  return conLock(function () {
    try {
      const item = repoBuscarPorId('STOCK_EQUIPOS', 'ID_STOCK', String(d.id || ''));
      if (!item) return err('Equipo de stock no encontrado.', ERR.VALIDACION);
      const delta = parseInt(d.delta, 10) || 0;
      if (!delta) return err('Indica cuántas unidades sacar o reponer.', ERR.VALIDACION);
      if (!String(d.motivo || '').trim()) return err('El ajuste necesita un motivo.', ERR.VALIDACION);
      const antes = parseInt(item.CANTIDAD, 10) || 0;
      const final = antes + delta;
      if (final < 0) return err('No puedes sacar ' + Math.abs(delta) + ': solo hay ' + antes + '.', ERR.VALIDACION);
      repoActualizar('STOCK_EQUIPOS', 'ID_STOCK', item.ID_STOCK, { CANTIDAD: final, TIMESTAMP: ahoraTS() });
      repoInsertar('MOVIMIENTOS_STOCK', {
        ID_MOV: uid('MST'), ID_STOCK: item.ID_STOCK, NOMBRE: String(item.NOMBRE || ''), TIMESTAMP: ahoraTS(),
        FECHA: _statISO(d.fecha) || hoyISO(), DELTA: delta, CANTIDAD_FINAL: final,
        MOTIVO: String(d.motivo), DETALLE: String(d.detalle || ''),
        FIRMA: (ctx && ctx.firma) || '', AUTOR_EMAIL: (ctx && ctx.email) || '',
      });
      return ok({ id: item.ID_STOCK, antes: antes, cantidad: final, entidad: 'STOCK_EQUIPOS' });
    } catch (e) { return err('ajustarStockEquipo: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Historial de ajustes de un tipo de equipo (lo más reciente primero). */
function obtenerMovimientosStock(idStock, limite) {
  try {
    const lim = Math.min(parseInt(limite, 10) || 20, 100);
    const filas = repoLeerTodos('MOVIMIENTOS_STOCK', 'ID_STOCK', String(idStock || ''))
      .sort(function (a, b) { return String(b.TIMESTAMP).localeCompare(String(a.TIMESTAMP)); })
      .slice(0, lim)
      .map(function (x) { return { fecha: _statISO(x.FECHA), delta: parseInt(x.DELTA, 10) || 0,
        final: parseInt(x.CANTIDAD_FINAL, 10) || 0, motivo: String(x.MOTIVO || ''),
        detalle: String(x.DETALLE || ''), firma: String(x.FIRMA || '') }; });
    return ok({ movs: filas, total: filas.length });
  } catch (e) { return err('obtenerMovimientosStock: ' + e.message, ERR.INTERNO, e); }
}
