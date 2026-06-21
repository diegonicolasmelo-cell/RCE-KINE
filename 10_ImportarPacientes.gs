/**
 * ============================================================
 *  10_ImportarPacientes.gs — Carga masiva GENÉRICA de pacientes
 *  RCE KINE UCIA | GAS-v1.6
 *
 *  Lee la hoja "IMPORTAR" y vuelca cada fila a CAMAS_ESTADO.
 *  Pegas una lista nueva cuando quieras y vuelves a importar.
 *
 *  FLUJO:
 *    Menú ⚕️ RCE KINE →
 *      "2 · Crear/abrir hoja IMPORTAR"  → crea la plantilla
 *      (pegas tus pacientes en esa hoja)
 *      "3 · Importar desde hoja IMPORTAR" → carga a las camas
 *
 *  COLUMNAS DE LA HOJA "IMPORTAR" (fila 1 = encabezados):
 *    CAMA | NOMBRE | EDAD | SEXO | RUT | FECHA_INGRESO |
 *    DIAGNOSTICO | DIAG_REM | VIA_SOPORTE | TALLA
 *
 *  • El ORDEN de las columnas no importa: se detectan por nombre.
 *  • Solo CAMA y NOMBRE son obligatorios; el resto es opcional.
 *  • FECHA_INGRESO acepta 24/05/2026, 2026-05-24 o fecha de Sheets.
 *  • SEXO acepta M/F, Masc/Fem, Hombre/Mujer.
 *  • VIA_SOPORTE acepta los códigos de tu hoja del hospital:
 *      TET+VMI, TQT+VMI, TQT+HME, VMNI (CPAP), VMNI (BPAP),
 *      AMB, N/A, CNAF, Tubo T...  (se mapean solos)
 *  • TALLA (cm) es opcional; si la pones se calcula el Peso Ideal.
 * ============================================================
 */

// Encabezados de la plantilla, en orden sugerido.
var IMPORT_HEADERS = ['CAMA','NOMBRE','EDAD','SEXO','RUT','FECHA_INGRESO','DIAGNOSTICO','DIAG_REM','VIA_SOPORTE','TALLA'];

// ── Crea (o limpia y recrea) la hoja IMPORTAR con la plantilla ──
function crearHojaImportar() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName('IMPORTAR');
  if (!h) h = ss.insertSheet('IMPORTAR');
  h.getRange(1, 1, 1, IMPORT_HEADERS.length).setValues([IMPORT_HEADERS]);
  h.setFrozenRows(1);
  h.getRange(1, 1, 1, IMPORT_HEADERS.length).setFontWeight('bold').setBackground('#1e293b').setFontColor('#ffffff');
  // Fila de ejemplo (bórrala o sobrescríbela)
  if (h.getLastRow() < 2) {
    h.getRange(2, 1, 1, IMPORT_HEADERS.length).setValues([[
      1, 'NOMBRE APELLIDO (ejemplo — borrar)', 65, 'M', '12345678-9',
      '24/05/2026', 'Insuficiencia respiratoria aguda', 'Enfermedades respiratorias', 'TET+VMI', 170,
    ]]);
    h.getRange(2, 1, 1, IMPORT_HEADERS.length).setFontColor('#94a3b8').setFontStyle('italic');
  }
  for (var c = 1; c <= IMPORT_HEADERS.length; c++) h.setColumnWidth(c, c === 2 || c === 7 ? 230 : 110);
  SpreadsheetApp.setActiveSheet(h);
  _rceAvisar('📋 Hoja IMPORTAR lista',
    'Pega tus pacientes bajo los encabezados (una fila por paciente).\n\n' +
    'Cuando termines: menú ⚕️ RCE KINE → "3 · Importar desde hoja IMPORTAR".');
}

// ── Importa las filas de IMPORTAR hacia CAMAS_ESTADO ──
function importarPacientesActuales() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName('IMPORTAR');
  if (!h) { crearHojaImportar(); return; }

  var datos = h.getDataRange().getValues();
  if (datos.length < 2) { _rceAvisar('Hoja IMPORTAR vacía', 'Agrega al menos un paciente y vuelve a importar.'); return; }

  // Mapa encabezado → índice (tolerante a acentos/orden)
  var idx = {};
  datos[0].forEach(function (nombre, i) { idx[_normHdr(nombre)] = i; });
  var col = function (row, claves) {
    for (var k = 0; k < claves.length; k++) { var j = idx[claves[k]]; if (j !== undefined) return row[j]; }
    return '';
  };

  return conLock(function () {
    var n = 0, errores = [];
    for (var r = 1; r < datos.length; r++) {
      var fila = datos[r];
      var cama = parseInt(col(fila, ['CAMA','BED'])) || 0;
      var nombre = (col(fila, ['NOMBRE','PACIENTE','NOMBREDEPACIENTE']) || '').toString().trim();
      if (!cama || !nombre) continue;                          // fila vacía/incompleta → saltar
      if (/ejemplo/i.test(nombre)) continue;                   // fila de ejemplo → saltar
      if (cama < 1 || cama > 18) { errores.push('Cama ' + cama + ' fuera de rango (1-18)'); continue; }

      var fIng = _parseFecha(col(fila, ['FECHAINGRESO','FINGRESO','INGRESO']));
      var sexo = _normSexo(col(fila, ['SEXO']));
      var talla = parseFloat(col(fila, ['TALLA','TALLACM'])) || 0;
      var vs = _parseViaSop(col(fila, ['VIASOPORTE','VIA','SOPORTE','VIAAEREA']));

      var campos = {
        OCUPADA:        true,
        STATUS_CAMA:    'Ocupada',
        NOMBRE:         nombre,
        EDAD:           parseInt(col(fila, ['EDAD'])) || '',
        SEXO:           sexo,
        RUT:            (col(fila, ['RUT']) || '').toString().trim(),
        FECHA_INGRESO:  fIng,
        DIAGNOSTICO:    (col(fila, ['DIAGNOSTICO','DX']) || '').toString().trim(),
        DIAG_REM:       (col(fila, ['DIAGREM','REM']) || '').toString().trim(),
        VIA_AEREA:      vs.via,
        SOPORTE:        vs.sop,
        MODO:           vs.modo,
        FECHA_INICIO_VA:      (vs.via !== 'Natural') ? fIng : '',
        FECHA_INICIO_SOPORTE: (vs.sop === 'VM' || vs.sop === 'VNI') ? fIng : '',
      };
      if (talla > 0 && sexo) {
        campos.TALLA_CM = talla;
        campos.PESO_IDEAL_KG = calcularPI(sexo, talla);
      }
      _actualizarCamaInterno(String(cama), campos);
      n++;
    }
    SpreadsheetApp.flush();
    var msg = n + ' paciente(s) importado(s) a sus camas.';
    if (errores.length) msg += '\n\nAvisos:\n• ' + errores.join('\n• ');
    msg += '\n\nRevisa SEXO/Peso Ideal/Dx REM en la 1ª evolución.';
    _rceAvisar('✅ Importación lista', msg);
    return ok({ importados: n, errores: errores });
  });
}

// ════════════════════════════════════════════════════════════
//  HELPERS de parsing
// ════════════════════════════════════════════════════════════
function _normHdr(s) {
  return (s || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function _normSexo(v) {
  var s = (v || '').toString().trim().toUpperCase();
  if (/^M|MASC|HOMBRE|VAR/.test(s)) return 'M';
  if (/^F|FEM|MUJER/.test(s)) return 'F';
  return '';
}

function _parseFecha(val) {
  if (val instanceof Date) return Utilities.formatDate(val, 'America/Santiago', 'yyyy-MM-dd');
  var s = (val || '').toString().trim();
  if (!s) return '';
  var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);          // dd/mm/yyyy
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  var m2 = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);          // yyyy-mm-dd
  if (m2) return m2[1] + '-' + ('0' + m2[2]).slice(-2) + '-' + ('0' + m2[3]).slice(-2);
  return s;
}

// Mapea un código tipo "TQT+VMI" / "VMNI (CPAP)" / "AMB" a vía/soporte/modo de la app.
function _parseViaSop(raw) {
  var s = (raw || '').toString().toUpperCase();
  var via = 'Natural', sop = 'Ambiente', modo = 'Sin soporte';
  var esVNI = /VMNI|VNI|CPAP|BPAP|BIPAP/.test(s);
  var hasVMI = /VMI|VENTIL/.test(s) && !esVNI;

  if (/TET|TOT/.test(s)) via = 'TOT';
  else if (/TQT|TRAQ/.test(s)) via = 'TQT';
  else if (esVNI) via = 'Full Face';

  if (/HME/.test(s)) { sop = 'Oxigenoterapia'; modo = 'HME'; }
  else if (/TUBO\s*T|TUBOT/.test(s)) { sop = 'Oxigenoterapia'; modo = 'Tubo T'; }
  else if (/CNAF|OAF|CTAF/.test(s)) { sop = 'Oxigenoterapia'; modo = 'CNAF'; }
  else if (esVNI) {
    sop = 'VNI'; modo = /BPAP|BIPAP|S\/?T/.test(s) ? 'S/T' : (/AVAPS/.test(s) ? 'AVAPS' : 'CPAP');
    if (via === 'Natural') via = 'Full Face';
  }
  else if (hasVMI || /ACVC|ACPC|CPAP\/PS/.test(s)) { sop = 'VM'; modo = /ACPC/.test(s) ? 'ACPC' : 'ACVC'; }
  else if (/O2|OXIGENO|NRC|MASCAR|NARIC|BIGOT/.test(s)) { sop = 'Oxigenoterapia'; modo = 'Mascarilla'; if (via === 'Natural') via = 'Natural'; }
  else { via = 'Natural'; sop = 'Ambiente'; modo = 'Sin soporte'; }

  return { via: via, sop: sop, modo: modo };
}
