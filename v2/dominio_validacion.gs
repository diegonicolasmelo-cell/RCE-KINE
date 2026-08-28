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

  // En INGRESO (crea el episodio) el nombre es obligatorio
  const esIngreso = d.ES_INGRESO === true || String(d.ES_INGRESO) === 'true';
  if (esIngreso && (!d.PAC_NOMBRE || String(d.PAC_NOMBRE).trim() === '')) {
    errs.push('Falta nombre del paciente (ingreso)');
  }

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
  validarKTM(d).forEach(function (m) { errs.push(m); });
  return errs;
}

/**
 * validarKTM — las reglas del trío de KTM, EN EL SERVIDOR (20-ago-2026).
 *
 * 🔴 POR QUÉ EXISTE. Estas reglas vivían SOLO en el navegador (`guardar()`, con
 * un toast y un `return`). Cualquier ruta que no pase por ese formulario se las
 * salta — y el botón ➕ del Registro Diario, que es por donde va a entrar la
 * corrección retroactiva, no pasa por ahí. Una regla clínica que solo vive en la
 * pantalla no es una regla: es una sugerencia.
 *
 * 🪤 LO QUE DELIBERADAMENTE **NO** SE VALIDA AQUÍ, y por qué. Cada una de estas
 * se probó y rompía el camino de todos los días:
 *
 *  · «REALIZADA exige nivel»: el formulario arranca en estado `'r'` con el nivel
 *    vacío, y `aplicarGatesEval` BORRA el nivel cuando SAS = 1. Exigirlo aquí
 *    bloquearía el guardado normal. El nivel se exige en la ruta de corrección
 *    del ➕, que es donde alguien está declarando una KTM a conciencia.
 *  · «nivel o razón sin ningún estado»: de noche la KTM no aplica, el estado se
 *    apaga y el nivel se HEREDA de la cama sin que nadie lo limpie, con la
 *    tarjeta oculta. Rechazar eso bloquearía **toda evolución nocturna** de un
 *    paciente con KTM de día, y sin forma de destrabarlo desde la pantalla. El
 *    nivel huérfano se NORMALIZA al guardar, no se rechaza.
 *  · «'' distinto de false»: ningún lector del sistema los distingue
 *    (`esVerdadero` trata igual los dos). Perder la evolución entera por esa
 *    diferencia sería cobrar carísimo algo que nadie honra.
 *
 * Y lo que SÍ se valida además del trío (28-ago-2026): la razón «Otro» de la
 * KTM no realizada exige su fundamento. Se puede exigir sin romper nada porque,
 * a diferencia del nivel, «Otro» no se hereda ni lo escribe ningún automatismo:
 * lo elige una persona en el turno, en la misma pantalla donde está el campo.
 *
 * Devuelve un array de mensajes (vacío = OK).
 */
/**
 * Razones de «KTM no realizada» que exigen fundamento escrito: SOLO «Otro».
 * «Indicación médica» se evaluó y quedó fuera (decisión de Manuel, 28-ago-2026):
 * es legítima y frecuente, y obligar ahí le cobra un trámite al turno en un caso
 * que se entiende. Tampoco entra al subregistro — se pide el porqué exactamente
 * donde se va a leer, así que esta lista y `_KTM_RAZON_SUBREGISTRO` (svc_stats.gs)
 * dicen hoy lo mismo.
 * Espejo exacto de `KTM_RAZONES_CON_FUNDAMENTO` en index.html: si las dos se
 * separan, el turno ve un campo opcional que el servidor va a rechazar y no hay
 * forma de destrabarlo desde la pantalla. La guardia vigila la paridad.
 */
var _KTM_RAZON_EXIGE_FUNDAMENTO = ['Otro'];

function validarKTM(d) {
  const errs = [];
  if (!d) return errs;
  const vv = function (x) { return x === true || String(x) === 'true'; };
  const r = vv(d.KTM_REALIZADA), s = vv(d.KTM_SUSPENDIDA), n = vv(d.KTM_NO_REALIZADA);
  if (!r && !s && !n) return errs;   // nada declarado: no hay nada que validar

  // Exclusividad. Imposible desde la pantalla (`setKTMstate` es excluyente),
  // alcanzable por API.
  if ((r && s) || (r && n) || (s && n)) {
    errs.push('KTM: solo puede estar en UNO de los tres estados (realizada, suspendida o no realizada).');
  }

  // De noche la KTM no aplica: la estadística manual nunca tuvo casilla
  // nocturna, y el REM cuenta sesiones sin filtrar turno. Confirmado con la
  // planilla real (20-ago-2026): las 36 KTM realizadas son TODAS de día.
  const turno = String(d.TURNO || d.turno || '');
  if (turno === 'Noche') {
    errs.push('KTM: en turno noche la kinesiterapia motora no aplica; no se declara estado.');
  }

  if (n && !String(d.KTM_NO_RAZON || '').trim()) {
    errs.push('KTM: indica la razón por la que NO se realizó.');
  }
  // Las razones que no se explican solas exigen el porqué: sin él la KTM queda
  // declarada con un motivo hueco y así entra al subregistro mensual. Va en el
  // SERVIDOR y no solo en la pantalla porque el ➕ del Registro Diario
  // (corrección retroactiva) no pasa por `guardar()`. (28-ago-2026, Manuel.)
  //   · «Otro» no dice nada por definición, y es la única que obliga.
  // Las otras seis se explican solas y no se les cobra un campo más — incluida
  // «Indicación médica», que absorbió a «Decisión médica» (eran la misma razón
  // escrita de dos formas) pero NO exige fundamento.
  if (n && _KTM_RAZON_EXIGE_FUNDAMENTO.indexOf(String(d.KTM_NO_RAZON || '').trim()) !== -1
        && !String(d.KTM_NO_COMENTARIO || '').trim()) {
    errs.push('KTM: «' + String(d.KTM_NO_RAZON).trim() + '» necesita que escribas el fundamento.');
  }
  if (s && !String(d.KTM_CONTRA_RAZON || '').trim() && !String(d.KTM_CONTRA_MANUAL || '').trim()) {
    errs.push('KTM: indica la razón de la contraindicación.');
  }
  return errs;
}

/**
 * _ktmCantidad — la cantidad de sesiones, acotada a 1..9.
 *
 * Existe para que la fórmula deje de estar copiada. Estaba escrita a mano en el
 * front (`index.html`, al armar el payload) y repetida en el REM; el servidor no
 * la acotaba en ninguna parte, así que por API entraba cualquier número.
 */
function _ktmCantidad(v) {
  const n = parseInt(v, 10);
  return String(Math.min(9, Math.max(1, isNaN(n) ? 1 : n)));
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
