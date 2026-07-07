/**
 * dominio_validacion.gs — Validación de payloads PURA (sin Sheets).
 * Devuelve array de mensajes de error (vacío = OK). Se corre ANTES del lock.
 * Acepta tanto claves de esquema (PAC_EDAD…) como alias del cliente (idCama…).
 */

function validarPayloadEvolucion(d) {
  const errs = [];
  if (!d) return ['Payload vacío'];

  if (!d.ID_CAMA && !d.idCama) errs.push('Falta ID_CAMA');
  if (!d.TURNO_KEY && !d.turnoKey) errs.push('Falta TURNO_KEY');
  if (!d.PLAN_FIRMA_KINE || String(d.PLAN_FIRMA_KINE).trim() === '') errs.push('Falta firma del kinesiólogo');

  _rango(errs, d.PAC_EDAD, 'Edad', 15, 110, true);
  _rango(errs, d.PAC_TALLA, 'Talla (cm)', 100, 230, false);
  _rango(errs, d.VENT_FIO2, 'FiO₂ (%)', 21, 100, false);
  _rango(errs, d.VENT_SPO2, 'SpO₂ (%)', 0, 100, false);
  _rango(errs, d.VENT_VT, 'VT (ml)', 50, 1500, false);
  _rango(errs, d.VENT_FR, 'FR (rpm)', 4, 60, false);
  _rango(errs, d.PAC_BARTHEL, 'Barthel', 0, 100, true);

  if (d.VENT_PEEP) {
    const p = parseFloat(d.VENT_PEEP);
    if (!isNaN(p) && p > 30) errs.push('PEEP > 30 cmH₂O — verificar: ' + d.VENT_PEEP);
  }
  return errs;
}

function validarPayloadIngreso(d) {
  const errs = [];
  if (!d) return ['Payload vacío'];
  if (!d.idCama && !d.ID_CAMA) errs.push('Falta idCama');
  const nombre = d.nombre || d.NOMBRE || d.PAC_NOMBRE;
  if (!nombre || String(nombre).trim() === '') errs.push('Falta nombre del paciente');
  const firma = d.firmaKine || d.PLAN_FIRMA_KINE || d.FIRMA_KINE;
  if (!firma || String(firma).trim() === '') errs.push('Falta firma del kinesiólogo');
  _rango(errs, d.edad || d.EDAD, 'Edad', 15, 110, true);
  _rango(errs, d.talla || d.TALLA_CM, 'Talla (cm)', 100, 230, false);
  return errs;
}

/** Valida rango si el valor viene (no vacío). entero=true fuerza int. */
function _rango(errs, val, etiqueta, min, max, entero) {
  if (val === undefined || val === null || val === '') return;
  const num = entero ? parseInt(val) : parseFloat(val);
  if (isNaN(num) || num < min || num > max) {
    errs.push(etiqueta + ' fuera de rango (' + min + '-' + max + '): ' + val);
  }
}
