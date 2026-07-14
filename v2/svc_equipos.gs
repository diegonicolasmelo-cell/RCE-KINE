/**
 * svc_equipos.gs — Seguimiento de ventiladores de la unidad.
 *
 * Inventario vivo (hoja VENTILADORES: se agregan y dan de baja equipos) +
 * trazabilidad de movimientos (hoja MOVIMIENTOS_VM). Un ventilador está en
 * una CAMA, en BODEGA o en PRESTAMO a otra unidad (Urgencias, UTI, Medicina,
 * Neurología, Cirugía…). Toda escritura pasa por api.gs y queda auditada.
 */

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
      if (['CAMA', 'BODEGA', 'PRESTAMO'].indexOf(tipo) === -1) return err('Destino inválido.', ERR.VALIDACION);
      if (tipo === 'CAMA' && !d.detalle) return err('Indica el número de cama.', ERR.VALIDACION);
      if (tipo === 'PRESTAMO' && !d.detalle) return err('Indica la unidad del préstamo.', ERR.VALIDACION);
      const detalle = tipo === 'BODEGA' ? '' : String(d.detalle);
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
