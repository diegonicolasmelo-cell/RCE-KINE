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

// ── Firmas contaminadas (bug jul-2026: texto de evolución colado en la firma) ──

/** Muestra en el registro qué filas tienen PLAN_FIRMA_KINE inválida (texto
 *  largo en vez de iniciales), sin modificar nada. Correr ANTES de reparar. */
function diagnosticarFirmas() {
  ['EVOLUCIONES', 'EVOLUCIONES_ARCHIVO'].forEach(hoja => {
    const malas = repoLeerTodos(hoja).filter(e =>
      String(e.PLAN_FIRMA_KINE || '').length > 15 || /\n/.test(String(e.PLAN_FIRMA_KINE || '')));
    console.log(hoja + ': ' + malas.length + ' fila(s) con firma inválida');
    malas.slice(0, 10).forEach(e => console.log('  · ' + e.ID_EVOLUCION + ' → "' +
      String(e.PLAN_FIRMA_KINE).slice(0, 60) + '…" (' + String(e.PLAN_FIRMA_KINE).length + ' caracteres)'));
  });
  console.log('Si hay filas listadas, correr repararFirmas() para limpiarlas.');
}

/** Limpia las firmas inválidas (las deja vacías; el texto de la evolución no
 *  se toca). Idempotente: correrla dos veces no cambia nada más. */
function repararFirmas() {
  let total = 0;
  ['EVOLUCIONES', 'EVOLUCIONES_ARCHIVO'].forEach(hoja => {
    const n = repoActualizarDonde(hoja,
      e => String(e.PLAN_FIRMA_KINE || '').length > 15 || /\n/.test(String(e.PLAN_FIRMA_KINE || '')),
      e => ({ PLAN_FIRMA_KINE: '' }));
    console.log(hoja + ': ' + n + ' firma(s) limpiada(s)');
    total += n;
  });
  console.log(total ? ('✅ ' + total + ' fila(s) reparada(s). Recarga la app.') : '✅ No había firmas inválidas.');
  return total;
}


/* ════════════════════════════════════════════════════════════════════════
 * RESETEO PARA EL INICIO REAL
 *
 * Deja la base en cero para empezar a registrar de verdad: borra TODO lo
 * que se cargó durante la marcha blanca (pacientes, evoluciones, historial,
 * archivados, entregas, ventiladores y sus fallas, auditoría) y conserva la
 * CONFIGURACIÓN de la unidad (parámetros clínicos, catálogos, matrices,
 * roster de kinesiólogos y la serie histórica de indicadores).
 *
 * CÓMO SE USA — dos pasos, a propósito:
 *   1. Ejecutar `resetearBaseDeDatos`  → NO borra nada. Muestra en el
 *      registro cuántas filas tiene cada hoja y qué pasaría con ella.
 *   2. Si el resumen es el esperado, ejecutar
 *      `resetearBaseDeDatosCONFIRMAR` → borra de verdad.
 *
 * Antes de borrar SIEMPRE se genera un respaldo completo de la planilla en
 * Drive; si el respaldo falla, el borrado se cancela (todo o nada).
 * ════════════════════════════════════════════════════════════════════════ */

// Hojas que quedan VACÍAS (datos de la marcha blanca).
const _RESET_VACIAR = [
  'EVOLUCIONES', 'EVOLUCIONES_ARCHIVO', 'PROCEDIMIENTOS', 'TIMELINE',
  'ENTREGAS_TURNO', 'ARCHIVO_PACIENTES', 'REINTUBACIONES',
  'VENTILADORES', 'MOVIMIENTOS_VM', 'FALLAS_VM',
  'STOCK_EQUIPOS', 'MOVIMIENTOS_STOCK',
  'ESTADISTICAS_REM', 'TURNOS', 'AUDIT_LOG', 'IMPORTAR',
];
// Hojas que NO se tocan (configuración de la unidad).
const _RESET_CONSERVAR = ['CONFIG', 'CATALOGOS', 'CAT_MATRICES', 'KINESIOLOGOS', 'INDICADORES_HISTORICO'];

/** Paso 1 — SIMULACRO: informa qué se borraría. No modifica nada. */
function resetearBaseDeDatos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  console.log('🔎 SIMULACRO — no se ha borrado nada.\n');
  let total = 0;
  console.log('SE VACIARÍAN:');
  _RESET_VACIAR.forEach(function (n) {
    const f = _resetFilasDatos(ss, n);
    total += f;
    console.log('   · ' + n + ': ' + f + ' fila(s)');
  });
  const camas = _resetFilasDatos(ss, 'CAMAS_ESTADO');
  console.log('   · CAMAS_ESTADO: ' + camas + ' cama(s) quedarían libres (las camas se conservan, vacías)');
  console.log('\nSE CONSERVARÍAN (configuración de la unidad):');
  _RESET_CONSERVAR.forEach(function (n) {
    console.log('   · ' + n + ': ' + _resetFilasDatos(ss, n) + ' fila(s) intactas');
  });
  console.log('\n📦 Total de filas de datos a borrar: ' + total);
  console.log('\n➡️  Si es lo que esperas, ejecuta ahora la función:');
  console.log('    resetearBaseDeDatosCONFIRMAR');
  console.log('    (antes de borrar hace un respaldo completo en Drive)');
  return { ok: true, simulacro: true, filas: total };
}

/** Paso 2 — BORRADO REAL. Respalda primero; si el respaldo falla, cancela. */
function resetearBaseDeDatosCONFIRMAR() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  console.log('💾 Generando respaldo previo...');
  let respaldo;
  try {
    respaldo = backupDiario();
  } catch (e) {
    respaldo = { ok: false, error: e.message };
  }
  if (!respaldo || !respaldo.ok) {
    const motivo = (respaldo && respaldo.error) || 'motivo desconocido';
    console.error('❌ CANCELADO: no se pudo respaldar (' + motivo + '). No se borró nada.');
    return { ok: false, error: 'Respaldo previo fallido: ' + motivo };
  }
  console.log('✅ Respaldo listo: ' + respaldo.data.url);

  const borradas = {};
  let total = 0;
  _RESET_VACIAR.forEach(function (n) {
    const f = _resetVaciarHoja(ss, n);
    if (f) { borradas[n] = f; total += f; }
  });

  // CAMAS_ESTADO: se borran las filas y se vuelven a sembrar camas libres.
  const camas = _resetVaciarHoja(ss, 'CAMAS_ESTADO');
  _sembrar(ss);
  SpreadsheetApp.flush();

  // El caché del servidor puede tener listas ya calculadas (documentos, etc.)
  try { CacheService.getScriptCache().removeAll(['DOCS_LISTA']); } catch (e) {}

  // Queda constancia del reseteo como primer registro de la etapa real.
  auditar({
    email: '', firma: 'Mantenimiento', accion: 'RESETEO_INICIAL',
    entidad: 'PLANILLA', resumen: total + ' filas borradas · respaldo ' + respaldo.data.nombre,
  });

  console.log('\n🧹 RESETEO COMPLETO');
  Object.keys(borradas).forEach(function (n) { console.log('   · ' + n + ': ' + borradas[n] + ' fila(s) borradas'); });
  console.log('   · CAMAS_ESTADO: ' + camas + ' cama(s) reiniciadas (libres)');
  console.log('\nSe conservó: ' + _RESET_CONSERVAR.join(', '));
  console.log('Respaldo por si acaso: ' + respaldo.data.url);
  console.log('\n➡️  Recarga la app en el navegador (Ctrl+Shift+R).');
  console.log('➡️  Carga los ventiladores reales en la pestaña 🔧 VENTILADORES.');
  return { ok: true, borradas: borradas, camas: camas, respaldo: respaldo.data.url };
}

/** Cuántas filas de DATOS tiene una hoja (sin contar encabezados). */
function _resetFilasDatos(ss, nombre) {
  const h = ss.getSheetByName(nombre);
  if (!h) return 0;
  const desde = FILA_DATOS[nombre] || 2;
  return Math.max(0, h.getLastRow() - desde + 1);
}

/** Borra las filas de datos de una hoja (respeta los encabezados). */
function _resetVaciarHoja(ss, nombre) {
  const h = ss.getSheetByName(nombre);
  if (!h) return 0;
  const desde = FILA_DATOS[nombre] || 2;
  const n = h.getLastRow() - desde + 1;
  if (n <= 0) return 0;
  h.deleteRows(desde, n);
  return n;
}

// ═══════════════════════════════════════════════════════════════════════════
//  CARGA INICIAL DEL INVENTARIO REAL (ago-2026)
//  Traspaso del libro de VM en papel (entrega de turno del 31-07-2026):
//  ventiladores mecánicos por cama + bodega, V60, Airvo2 (los «CNAF Nº» del
//  papel), Carina y base calefactora MR850. Correr UNA VEZ desde el editor:
//  es idempotente (si un nombre ya existe, lo salta) y cada alta queda
//  trazada en MOVIMIENTOS_VM. Los datos pendientes (N° de serie, inventario,
//  año) se completan después con ✏️ Editar en la pestaña Ventiladores.
// ═══════════════════════════════════════════════════════════════════════════
function cargarInventarioInicial() {
  const F = '2026-07-31';   // estado del papel traspasado
  const INVENTARIO = [
    // ── Ventiladores mecánicos en cama (libro del 31-07) ──
    { nombre: 'Avea 1',   marca: 'Vyaire',          modelo: 'Avea',    ubicTipo: 'CAMA', ubicDetalle: '1' },
    { nombre: 'Vela 9',   marca: 'Vyaire',          modelo: 'Vela',    ubicTipo: 'CAMA', ubicDetalle: '2' },
    { nombre: 'PB 1',     marca: 'Puritan Bennett', modelo: '',        ubicTipo: 'CAMA', ubicDetalle: '3' },
    { nombre: 'Mek 12',   marca: 'Mekics',          modelo: '',        ubicTipo: 'CAMA', ubicDetalle: '4' },
    { nombre: 'Avea 3',   marca: 'Vyaire',          modelo: 'Avea',    ubicTipo: 'CAMA', ubicDetalle: '5' },
    { nombre: 'Mek 10',   marca: 'Mekics',          modelo: '',        ubicTipo: 'CAMA', ubicDetalle: '6' },
    { nombre: 'Savina 2', marca: 'Dräger',          modelo: 'Savina',  ubicTipo: 'CAMA', ubicDetalle: '7' },
    { nombre: 'Savina 4', marca: 'Dräger',          modelo: 'Savina',  ubicTipo: 'CAMA', ubicDetalle: '8' },
    { nombre: 'Savina 1', marca: 'Dräger',          modelo: 'Savina',  ubicTipo: 'CAMA', ubicDetalle: '9' },
    { nombre: 'Mek 15',   marca: 'Mekics',          modelo: '',        ubicTipo: 'CAMA', ubicDetalle: '10' },
    { nombre: 'Servo U',  marca: 'Maquet',          modelo: 'Servo-u', ubicTipo: 'CAMA', ubicDetalle: '11' },
    { nombre: 'PB 2',     marca: 'Puritan Bennett', modelo: '',        ubicTipo: 'CAMA', ubicDetalle: '12' },
    { nombre: 'Mek 4',    marca: 'Mekics',          modelo: '',        ubicTipo: 'CAMA', ubicDetalle: '13' },
    { nombre: 'Mek 16',   marca: 'Mekics',          modelo: '',        ubicTipo: 'CAMA', ubicDetalle: '14' },
    { nombre: 'Mek 6',    marca: 'Mekics',          modelo: '',        ubicTipo: 'CAMA', ubicDetalle: '15' },
    { nombre: 'Mek 9',    marca: 'Mekics',          modelo: '',        ubicTipo: 'CAMA', ubicDetalle: '16' },
    { nombre: 'Mek 5',    marca: 'Mekics',          modelo: '',        ubicTipo: 'CAMA', ubicDetalle: '17' },
    { nombre: 'PB 980',   marca: 'Puritan Bennett', modelo: '980',     ubicTipo: 'CAMA', ubicDetalle: '18' },
    // ── Bodega (nombres PROVISORIOS: corregir con el número real del equipo) ──
    { nombre: 'Vela (bodega A)',   marca: 'Vyaire', modelo: 'Vela',   ubicTipo: 'BODEGA', obs: 'Nombre provisorio: completar número real, serie e inventario' },
    { nombre: 'Vela (bodega B)',   marca: 'Vyaire', modelo: 'Vela',   ubicTipo: 'BODEGA', obs: 'Nombre provisorio: completar número real, serie e inventario' },
    { nombre: 'Savina (bodega)',   marca: 'Dräger', modelo: 'Savina', ubicTipo: 'BODEGA', obs: 'Nombre provisorio: completar número real, serie e inventario' },
    { nombre: 'Avea (bodega)',     marca: 'Vyaire', modelo: 'Avea',   ubicTipo: 'BODEGA', obs: 'Nombre provisorio: completar número real, serie e inventario' },
    { nombre: 'Mekics (bodega)',   marca: 'Mekics', modelo: '',       ubicTipo: 'BODEGA', obs: 'Nombre provisorio: completar número real, serie e inventario' },
    // ── VNI ──
    { nombre: 'V60 Nº1', marca: 'Philips', modelo: 'V60', ubicTipo: 'CAMA', ubicDetalle: '3',  obs: 'VNI' },
    { nombre: 'V60 Nº3', marca: 'Philips', modelo: 'V60', ubicTipo: 'CAMA', ubicDetalle: '8',  obs: 'VNI' },
    { nombre: 'V60 Nº2', marca: 'Philips', modelo: 'V60', ubicTipo: 'BODEGA', obs: 'VNI · número por confirmar (el papel indica 2 V60 en bodega)' },
    { nombre: 'V60 Nº4', marca: 'Philips', modelo: 'V60', ubicTipo: 'BODEGA', obs: 'VNI · número por confirmar (el papel indica 2 V60 en bodega)' },
    { nombre: 'Carina',  marca: 'Dräger',  modelo: 'Carina', ubicTipo: 'BODEGA', obs: 'VNI' },
    // ── CNAF (Airvo 2): 4 en total, 3 en la unidad y 1 en la UTI ──
    { nombre: 'Airvo2 Nº2', marca: 'Fisher & Paykel', modelo: 'Airvo 2', ubicTipo: 'CAMA', ubicDetalle: '10', obs: 'CNAF' },
    { nombre: 'Airvo2 Nº3', marca: 'Fisher & Paykel', modelo: 'Airvo 2', ubicTipo: 'CAMA', ubicDetalle: '3',  obs: 'CNAF' },
    { nombre: 'Airvo2 Nº4', marca: 'Fisher & Paykel', modelo: 'Airvo 2', ubicTipo: 'CAMA', ubicDetalle: '5',  obs: 'CNAF' },
    { nombre: 'Airvo2 Nº1', marca: 'Fisher & Paykel', modelo: 'Airvo 2', ubicTipo: 'PRESTAMO', ubicDetalle: 'UTI', obs: 'CNAF · número en UTI por confirmar' },
    // ── Bases calefactoras ──
    { nombre: 'MR850 (cama 12)', marca: 'Fisher & Paykel', modelo: 'MR850', ubicTipo: 'CAMA', ubicDetalle: '12', obs: 'Base calefactora · nombre provisorio' },
  ];
  const existentes = {};
  repoLeerTodos('VENTILADORES').forEach(function (x) { existentes[String(x.NOMBRE).trim().toLowerCase()] = true; });
  const ctx = { firma: 'Carga inicial', email: '' };
  let altas = 0, saltados = 0;
  INVENTARIO.forEach(function (eq) {
    if (existentes[eq.nombre.trim().toLowerCase()]) { saltados++; return; }
    const r = guardarVentilador({
      nombre: eq.nombre, marca: eq.marca, modelo: eq.modelo || '',
      ubicTipo: eq.ubicTipo, ubicDetalle: eq.ubicDetalle || '',
      fecha: F, estado: 'Operativo', obs: eq.obs || '',
      motivo: 'Carga inicial del inventario (libro de VM del 31-07-2026)',
    }, ctx);
    if (r && r.ok) altas++; else console.log('FALLÓ ' + eq.nombre + ': ' + (r && r.error));
  });
  // ── Equipos SIN número: se llevan por cantidad (Diego, ago-2026) ──
  const STOCK = [
    { nombre: 'Aerogen Pro-X', marca: 'Aerogen', modelo: 'Pro-X', categoria: 'Nebulización',
      cantidad: 10, estado: 'Operativo', obs: 'Nebulizador de malla · sin numerar' },
    { nombre: 'Capnógrafo Nihon Kohden', marca: 'Nihon Kohden', modelo: '', categoria: 'Capnografía',
      cantidad: 5, estado: 'Operativo', obs: 'En uso en la unidad' },
    { nombre: 'Capnógrafo Dräger', marca: 'Dräger', modelo: '', categoria: 'Capnografía',
      cantidad: 4, estado: 'De baja', obs: 'No se ocupan (decisión de la unidad)' },
  ];
  const existeStock = {};
  repoLeerTodos('STOCK_EQUIPOS').forEach(function (x) { existeStock[String(x.NOMBRE).trim().toLowerCase()] = true; });
  let stockAltas = 0;
  STOCK.forEach(function (eq) {
    if (existeStock[eq.nombre.trim().toLowerCase()]) return;
    const r = guardarStockEquipo({
      nombre: eq.nombre, marca: eq.marca, modelo: eq.modelo, categoria: eq.categoria,
      cantidad: eq.cantidad, estado: eq.estado, obs: eq.obs, fecha: F,
      motivo: 'Carga inicial del inventario (libro del 31-07-2026)',
    }, ctx);
    if (r && r.ok) stockAltas++; else console.log('FALLÓ ' + eq.nombre + ': ' + (r && r.error));
  });

  console.log('Inventario inicial: ' + altas + ' equipos dados de alta, ' + saltados + ' ya existían (no se tocaron).');
  console.log('Stock sin numerar: ' + stockAltas + ' tipos cargados (Aerogen y capnógrafos).');
  console.log('Pendientes de completar con ✏️ Editar: números reales de los equipos de bodega, series, inventarios y años.');
  return { altas: altas, saltados: saltados, stock: stockAltas };
}
