/**
 * mantenimiento.gs — Reparaciones puntuales de la estructura.
 *
 * cuadrarEncabezados(): repara hojas cuyas FILAS DE ENCABEZADO fueron
 * borradas a mano (parecen "filas vacías" pero son parte del diseño:
 * fila 1 = título de la hoja, fila 2 = nombres de columna, y en las hojas
 * de 3 encabezados la fila 3 va vacía). Si faltan, los DATOS quedan
 * corridos hacia arriba y la app deja de verlos (las lecturas parten en
 * FILA_DATOS).
 *
 * Qué hace, hoja por hoja:
 *   1. Localiza la fila de nombres de columna (busca el primer nombre del
 *      esquema, ej. 'ID_CAMA', en las primeras filas).
 *   2. Inserta arriba las filas que falten para que los nombres queden en
 *      su fila de diseño (fila 2 en hojas de 2-3 encabezados, fila 1 en
 *      las de 1).
 *   3. En hojas de 3 encabezados, si un dato quedó pegado bajo los nombres
 *      (fila 3), inserta la fila vacía de diseño para devolver los datos a
 *      la fila 4.
 *   4. Elimina filas vacías espurias entre el encabezado y el primer dato.
 *   5. Al final corre crearORepararEstructura() (reescribe títulos y
 *      nombres, ensancha columnas al esquema vigente y siembra faltantes)
 *      y testEsquema().
 *
 * Es idempotente: si una hoja ya está bien, no la toca.
 * Ejecutar desde el editor de Apps Script: seleccionar cuadrarEncabezados
 * y presionar ▶. Revisar el resultado en el registro de ejecución.
 */
function cuadrarEncabezados() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const informe = [];

  Object.keys(ESQUEMA).forEach(function (hoja) {
    const def = ESQUEMA[hoja];
    const h = ss.getSheetByName(hoja);
    if (!h) { informe.push(hoja + ': no existe (la creará crearORepararEstructura)'); return; }

    const primerNombre = def.cols[0][0];              // ej. 'ID_CAMA'
    const filaNombresDiseno = def.headerRows >= 2 ? 2 : 1;

    // 1. ¿Dónde está la fila de nombres ahora?
    let filaNombres = -1;
    const tope = Math.min(h.getLastRow(), def.headerRows + 3) || 1;
    const colA = h.getRange(1, 1, Math.max(tope, 1), 1).getValues();
    for (let r = 0; r < colA.length; r++) {
      if (String(colA[r][0]).trim() === primerNombre) { filaNombres = r + 1; break; }
    }
    if (filaNombres === -1) {
      informe.push('⚠️ ' + hoja + ': no se encontró la fila de nombres (' + primerNombre + '). NO se tocó — revisar a mano.');
      return;
    }

    let acciones = [];

    // 2. Reponer filas de encabezado faltantes ARRIBA de los nombres.
    if (filaNombres < filaNombresDiseno) {
      const faltan = filaNombresDiseno - filaNombres;
      h.insertRowsBefore(1, faltan);
      acciones.push('insertadas ' + faltan + ' fila(s) de encabezado arriba');
    }

    // 3. Hojas de 3 encabezados: la fila 3 debe ir vacía; si hay un dato ahí,
    //    insertar la fila de diseño para que los datos vuelvan a la fila 4.
    if (def.headerRows >= 3) {
      const a3 = String(h.getRange(3, 1).getValue()).trim();
      if (a3 !== '') {
        h.insertRowsBefore(3, 1);
        acciones.push('repuesta la fila 3 vacía del encabezado (los datos vuelven a la fila 4)');
      }
    }

    // 4. Quitar filas vacías espurias entre el encabezado y el primer dato
    //    (p. ej. filas fantasma de versiones anteriores).
    const fi = FILA_DATOS[hoja];
    let borradas = 0;
    while (h.getLastRow() > fi && String(h.getRange(fi, 1).getValue()).trim() === '') {
      // ¿hay algún dato más abajo? si no, no hay nada que compactar
      const resto = h.getRange(fi + 1, 1, h.getLastRow() - fi, 1).getValues()
        .some(function (r) { return String(r[0]).trim() !== ''; });
      if (!resto) break;
      h.deleteRow(fi);
      borradas++;
    }
    if (borradas) acciones.push('eliminadas ' + borradas + ' fila(s) vacía(s) entre encabezado y datos');

    informe.push((acciones.length ? '🔧 ' : '✓ ') + hoja + ': ' + (acciones.length ? acciones.join('; ') : 'ya estaba cuadrada'));
  });

  // 5. Reescribir títulos/nombres, ensanchar al esquema vigente y sembrar.
  const rep = crearORepararEstructura();
  informe.push('crearORepararEstructura: ' + rep.mensaje);

  const test = testEsquema();
  informe.push('testEsquema: ' + JSON.stringify(test));

  informe.forEach(function (l) { console.log(l); });
  return informe;
}
