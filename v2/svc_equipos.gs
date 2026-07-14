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
