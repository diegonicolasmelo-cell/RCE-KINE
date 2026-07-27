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
 */

const _EVENTO_DISPS = [
  { k: 'hme',   campo: 'DISP_HME_FECHA',   nombre: 'HME',                 icono: '🌫️', confKey: 'FREC_HME_DIAS',   frecDef: 2 },
  { k: 'hepa',  campo: 'DISP_HEPA_FECHA',  nombre: 'HEPA',                icono: '🛡️', confKey: 'FREC_HEPA_DIAS',  frecDef: 3 },
  { k: 'sonda', campo: 'DISP_TC_FECHA',    nombre: 'Sonda de aspiración', icono: '➿', confKey: 'FREC_SONDA_DIAS', frecDef: 3 },
];

/** Fecha EFECTIVA de un turno: la Noche fecha al día siguiente. */
function _fechaEfectivaTurno(fecha, turno) {
  const f = String(fecha || '').slice(0, 10);
  if (String(turno) !== 'Noche') return f;
  const d = new Date(f + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Estado del reloj de una cama respecto de una fecha efectiva de referencia. */
function estadoDispositivos(cama, fechaRef) {
  const ref = String(fechaRef || hoyISO()).slice(0, 10);
  const enVM = String(cama.SOPORTE) === 'VM';
  return _EVENTO_DISPS.map(d => {
    const fecha = _statISO(cama[d.campo]);
    const frec = parseInt(leerConfig(d.confKey, String(d.frecDef))) || d.frecDef;
    const dias = fecha ? Math.round((new Date(ref) - new Date(fecha)) / 864e5) : null;
    return {
      k: d.k, nombre: d.nombre, icono: d.icono, fecha: fecha, frec: frec, dias: dias,
      aplica: enVM && !!fecha,
      vence: enVM && dias !== null && dias >= frec,
      venceManana: enVM && dias !== null && dias === frec - 1,
    };
  });
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
      if (!cama || !esVerdadero(cama.OCUPADA)) return err('La cama ' + idCama + ' no está ocupada.', ERR.VALIDACION);
      const pid = String(cama.PATIENT_ID || '');
      const firma = String(ctx.firma || datos.firma || '').slice(0, 15);
      const hrTxt = hora ? ' ' + hora + ' hrs' : '';

      let texto = '', tipoHito = 'evento';
      const disp = _EVENTO_DISPS.find(d => d.k === tipo);

      if (disp) {
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
        const idEvo = 'CAMA_' + idCama + '_' + turnoKey;
        const evo = repoBuscarPorId('EVOLUCIONES', 'ID_EVOLUCION', idEvo);
        if (!evo) return err('Primero guarda la evolución del turno; luego anexa el procedimiento.', ERR.VALIDACION);
        let procs = [];
        try { procs = JSON.parse(evo.PROC_JSON || '[]') || []; } catch (e) { procs = []; }
        procs.push(nombreProc);
        repoActualizar('EVOLUCIONES', 'ID_EVOLUCION', idEvo, {
          PROC_JSON: JSON.stringify(procs), PROC_CANTIDAD: procs.length,
          PROC_RESUMEN: procs.join(', '),
        });
        repoInsertar('PROCEDIMIENTOS', {
          ID_PROC: uid('PROC'), ID_EVOLUCION: idEvo, ID_CAMA: idCama, PATIENT_ID: pid,
          FECHA: fecha, TURNO: turno, TIPO_PROC: 'anexo', NOMBRE_PROC: nombreProc,
          DESCRIPCION: detalle, AUTOR_EMAIL: String(ctx.email || ''), TIMESTAMP: ahoraTS(),
        });
        texto = '🔧 ' + nombreProc + hrTxt + (detalle ? ' — ' + detalle : '') + ' (anexo)';
        tipoHito = 'procedimiento';
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

      _agregarHitoInterno({
        idCama: idCama, patientId: pid, fecha: fecha, turno: turno, tipo: tipoHito,
        texto: texto + (firma ? ' · ' + firma : ''),
        autor: firma, autorEmail: String(ctx.email || ''),
      });
      SpreadsheetApp.flush();

      const camaNueva = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', idCama);
      return ok({
        entidad: 'TIMELINE', idCama: idCama, patientId: pid, accion: 'evento rápido: ' + texto,
        texto: texto, dispositivos: estadoDispositivos(camaNueva, _fechaEfectivaTurno(hoyISO(), turno)),
      });
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
