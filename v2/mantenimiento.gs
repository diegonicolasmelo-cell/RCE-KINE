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
  'ESTADISTICAS_REM', 'TURNOS', 'AUDIT_LOG', 'IMPORTAR', 'SUGERENCIAS',
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

// ═══════════════════════════════════════════════════════════════════════════
//  CIERRE DE AÑO — TRASLADO DEL HISTÓRICO (ago-2026)
//  Google Sheets admite 10 millones de celdas por planilla y EVOLUCIONES
//  tiene 379 columnas: con la unidad llena, un año de registro ocupa ~5
//  millones. Una vez al año se mueven las evoluciones de los pacientes YA
//  EGRESADOS a una planilla aparte («RCE-KINE — Histórico AAAA»), dejando la
//  de trabajo liviana.
//
//  REGLA DE ORO (pedido de Diego): los pacientes que siguen hospitalizados
//  NO se tocan. El traslado va por EPISODIO EGRESADO — se mueve la historia
//  COMPLETA de cada paciente dado de alta ese año, aunque haya ingresado en
//  diciembre del año anterior. Un paciente que cruza el año de fin a inicio
//  conserva todo su historial en la planilla de trabajo hasta que egrese, y
//  se archiva en el cierre del año en que se fue.
//
//  Uso desde el editor:
//    1) archivarAnioHistorico(2026)            → SIMULACRO: informa, no toca
//    2) archivarAnioHistoricoCONFIRMAR(2026)   → traslado real
// ═══════════════════════════════════════════════════════════════════════════

/** Episodios EGRESADOS en el año + sus evoluciones archivadas. */
function _cierreDatosAnio(anio) {
  const a = String(anio);
  const egresados = repoLeerTodos('ARCHIVO_PACIENTES').filter(function (x) {
    return String(_statISO(x.FECHA_EGRESO)).slice(0, 4) === a;
  });
  const pids = {};
  egresados.forEach(function (x) { if (x.PATIENT_ID) pids[String(x.PATIENT_ID)] = true; });
  const evos = repoLeerTodos('EVOLUCIONES_ARCHIVO').filter(function (e) {
    return pids[String(e.PATIENT_ID)];
  });
  // Pacientes que siguen en la unidad: JAMÁS se tocan (control explícito)
  const enUnidad = repoLeerTodos('CAMAS_ESTADO').filter(function (c) { return esVerdadero(c.OCUPADA); });
  return { anio: a, egresados: egresados, evos: evos, enUnidad: enUnidad };
}

/** Paso 1 — SIMULACRO: informa qué se movería. No modifica nada. */
function archivarAnioHistorico(anio) {
  anio = anio || (new Date().getFullYear() - 1);
  const d = _cierreDatosAnio(anio);
  const celdas = d.evos.length * TOTAL_COLS.EVOLUCIONES;
  console.log('🔎 SIMULACRO de cierre ' + d.anio + ' — no se ha movido nada.\n');
  console.log('  Pacientes egresados en ' + d.anio + ': ' + d.egresados.length);
  console.log('  Evoluciones que se trasladarían: ' + d.evos.length +
    ' (~' + Math.round(celdas / 1000) + ' mil celdas liberadas)');
  console.log('  Quedan intactos en la planilla de trabajo:');
  console.log('    · ' + d.enUnidad.length + ' paciente(s) HOSPITALIZADO(S) — su historial completo se queda');
  console.log('    · el resumen de cada egreso en ARCHIVO_PACIENTES (indicadores, REM y reingresos siguen funcionando)');
  console.log('\n  Para ejecutarlo de verdad: archivarAnioHistoricoCONFIRMAR(' + d.anio + ')');
  return { anio: d.anio, egresados: d.egresados.length, evoluciones: d.evos.length, hospitalizados: d.enUnidad.length };
}

/** Paso 2 — TRASLADO REAL: copia a la planilla histórica y recién ahí borra. */
function archivarAnioHistoricoCONFIRMAR(anio) {
  anio = anio || (new Date().getFullYear() - 1);
  const d = _cierreDatosAnio(anio);
  if (!d.evos.length) {
    console.log('No hay evoluciones archivadas de ' + d.anio + ' para trasladar.');
    return { anio: d.anio, movidas: 0 };
  }
  // 1) Respaldo primero: si falla, no se mueve nada (todo o nada).
  console.log('1/4 · Respaldando antes de mover…');
  const rb = backupDiario();
  if (!rb || !rb.ok) {
    console.log('❌ El respaldo falló: NO se movió nada. ' + ((rb && rb.error) || ''));
    return { anio: d.anio, movidas: 0, error: 'respaldo' };
  }
  // 2) Planilla histórica del año (se reutiliza si ya existe)
  console.log('2/4 · Preparando la planilla histórica…');
  const claveCfg = 'HISTORICO_' + d.anio;
  let ss = null;
  const idPrevio = leerConfig(claveCfg, '');
  if (idPrevio) { try { ss = SpreadsheetApp.openById(idPrevio); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create('RCE-KINE — Histórico ' + d.anio);
    escribirConfig(claveCfg, ss.getId());
    try {
      const carpeta = _obtenerCarpetaBackup();
      DriveApp.getFileById(ss.getId()).moveTo(carpeta);
    } catch (e) { console.log('  (la planilla quedó en la raíz de Drive: ' + e.message + ')'); }
  }
  // 3) Copiar encabezados + filas
  console.log('3/4 · Copiando ' + d.evos.length + ' evoluciones…');
  const cols = ESQUEMA.EVOLUCIONES_ARCHIVO.cols.map(function (c) { return c[0]; });
  let hoja = ss.getSheetByName('EVOLUCIONES_ARCHIVO');
  if (!hoja) {
    hoja = ss.getSheets()[0].setName('EVOLUCIONES_ARCHIVO');
    hoja.getRange(1, 1, 1, cols.length).setValues([cols]);
  }
  const filas = d.evos.map(function (e) {
    return cols.map(function (c) { return e[c] === undefined || e[c] === null ? '' : e[c]; });
  });
  const desde = Math.max(2, hoja.getLastRow() + 1);
  hoja.getRange(desde, 1, filas.length, cols.length).setValues(filas);
  SpreadsheetApp.flush();
  // Verificación: solo se borra si la copia quedó completa
  const copiadas = hoja.getLastRow() - desde + 1;
  if (copiadas !== filas.length) {
    console.log('❌ La copia quedó incompleta (' + copiadas + ' de ' + filas.length + '): NO se borró nada.');
    return { anio: d.anio, movidas: 0, error: 'copia incompleta' };
  }
  // 4) Recién ahora se vacían de la planilla de trabajo
  console.log('4/4 · Liberando espacio en la planilla de trabajo…');
  const pids = {};
  d.egresados.forEach(function (x) { if (x.PATIENT_ID) pids[String(x.PATIENT_ID)] = true; });
  repoEliminarDonde('EVOLUCIONES_ARCHIVO', function (e) { return pids[String(e.PATIENT_ID)]; });
  escribirConfig('CIERRE_' + d.anio, ahoraTS());
  try {
    auditar({ email: '', firma: 'MANTENIMIENTO', accion: 'CIERRE_ANIO', entidad: 'EVOLUCIONES_ARCHIVO',
      idEntidad: d.anio, resumen: d.evos.length + ' evoluciones de ' + d.egresados.length + ' egresos → ' + ss.getName() });
  } catch (e) {}
  console.log('\n✅ Cierre ' + d.anio + ' listo.');
  console.log('   Planilla histórica: ' + ss.getUrl());
  console.log('   Trasladadas: ' + d.evos.length + ' evoluciones de ' + d.egresados.length + ' pacientes egresados.');
  console.log('   Intactos: ' + d.enUnidad.length + ' paciente(s) hospitalizado(s) y el resumen de todos los egresos.');
  return { anio: d.anio, movidas: d.evos.length, url: ss.getUrl() };
}

/**
 * Aviso de cierre para la app (lo consume GET_BOOT). Aparece desde el 26 de
 * diciembre y durante enero-febrero mientras queden evoluciones del año
 * anterior sin trasladar. Es solo un recordatorio: no mueve nada.
 */
function avisoCierreAnio() {
  try {
    const hoy = hoyISO();
    const anioAct = parseInt(hoy.slice(0, 4), 10);
    const mes = parseInt(hoy.slice(5, 7), 10);
    const dia = parseInt(hoy.slice(8, 10), 10);
    const enVentana = (mes === 12 && dia >= 26) || mes <= 2;
    if (!enVentana) return null;
    const anio = (mes === 12) ? anioAct : anioAct - 1;
    if (leerConfig('CIERRE_' + anio, '')) return null;   // ya se hizo
    const d = _cierreDatosAnio(anio);
    if (!d.evos.length) return null;
    return {
      anio: anio, evoluciones: d.evos.length, egresados: d.egresados.length,
      hospitalizados: d.enUnidad.length,
    };
  } catch (e) { return null; }
}


// ════════════════════════════════════════════════════════════════════════════
//  CORRECCIÓN · PRONACIONES REPETIDAS (ago-2026)
//  Hasta la v5.31 la casilla «Prono» del posicionamiento servía para DOS cosas:
//  decir cómo estaba el paciente y registrar la pronación. Quien describía la
//  posición en el turno siguiente sumaba una pronación que nunca ocurrió
//  (reportado por Diego con la paciente de la cama 4). Desde la v5.32 el
//  procedimiento lo declara una casilla aparte; estas dos funciones limpian lo
//  que quedó registrado con la regla vieja.
//
//  Criterio (conservador — solo saca lo que es claramente arrastre):
//    · la evolución trae un procedimiento PRONO/SUPINACIÓN, y
//    · el turno ANTERIOR del mismo episodio ya estaba en esa misma posición, y
//    · el procedimiento de esta evolución viene SIN hora
//      (el que pronó de verdad anota la hora; el que solo describía, no).
//  El texto clínico, la posición y todo lo demás quedan INTACTOS: se saca el
//  procedimiento sobrante de PROC_JSON/PROC_RESUMEN/PROC_CANTIDAD, su fila en
//  PROCEDIMIENTOS y su hito en TIMELINE.
// ════════════════════════════════════════════════════════════════════════════

/** Paso 1 — SIMULACRO: lista qué se corregiría. No modifica nada. */
function corregirPronosRepetidos() { return _pronoCorregir(false); }

/** Paso 2 — CORRECCIÓN REAL. Respalda primero; si el respaldo falla, cancela. */
function corregirPronosRepetidosCONFIRMAR() { return _pronoCorregir(true); }

function _pronoCorregir(aplicar) {
  var HOJAS = ['EVOLUCIONES', 'EVOLUCIONES_ARCHIVO'];
  var casos = [];

  HOJAS.forEach(function (hoja) {
    var filas = repoLeerTodos(hoja) || [];
    // Agrupar por episodio y ordenar cronológicamente por TURNO_KEY
    // ('2026-08-02-Dia' ordena bien como texto salvo el turno: Dia < Noche ✓).
    var porEpisodio = {};
    filas.forEach(function (f) {
      var pid = String(f.PATIENT_ID || f.ID_CAMA || '');
      (porEpisodio[pid] = porEpisodio[pid] || []).push(f);
    });
    Object.keys(porEpisodio).forEach(function (pid) {
      var evs = porEpisodio[pid].sort(function (a, b) {
        return String(a.TURNO_KEY) < String(b.TURNO_KEY) ? -1 : 1;
      });
      for (var i = 1; i < evs.length; i++) {
        [['PRONO', 'RESP_POS_PRONO'], ['SUPINACIÓN', 'RESP_POS_SUPINO']].forEach(function (par) {
          var etq = par[0], colPos = par[1];
          if (!esVerdadero(evs[i][colPos]) || !esVerdadero(evs[i - 1][colPos])) return;
          var procs = _pronoProcs(evs[i]);
          // solo el registro SIN hora: el que pronó de verdad la anotó
          var sobra = procs.filter(function (p) { return String(p).trim().toUpperCase() === etq; });
          if (!sobra.length) return;
          casos.push({
            hoja: hoja, id: evs[i].ID_EVOLUCION, cama: evs[i].ID_CAMA,
            turno: evs[i].TURNO_KEY, firma: evs[i].PLAN_FIRMA_KINE,
            quita: etq, turnoPrevio: evs[i - 1].TURNO_KEY,
          });
        });
      }
    });
  });

  var detalle = casos.map(function (c) {
    return '  · ' + c.hoja + ' · cama ' + c.cama + ' · ' + c.turno + ' (' + (c.firma || 's/firma') +
      ') — quita «' + c.quita + '» (ya estaba en esa posición desde ' + c.turnoPrevio + ')';
  }).join('\n');

  if (!aplicar) {
    var msg = casos.length
      ? 'SIMULACRO — se corregirían ' + casos.length + ' registro(s):\n' + detalle +
        '\n\nNada se ha modificado. Para aplicarlo corre corregirPronosRepetidosCONFIRMAR().'
      : 'SIMULACRO — no hay pronaciones repetidas que corregir.';
    Logger.log(msg);
    return ok({ simulacro: true, casos: casos.length, detalle: casos, mensaje: msg });
  }

  if (!casos.length) { Logger.log('Nada que corregir.'); return ok({ casos: 0 }); }

  var resp = backupDiario();
  if (!resp || !resp.ok) {
    var e = 'CANCELADO: el respaldo falló, no se modificó nada. ' + ((resp && resp.error) || '');
    Logger.log(e); return err(e);
  }

  casos.forEach(function (c) {
    var fila = repoBuscarPorId(c.hoja, 'ID_EVOLUCION', c.id);
    if (!fila) return;
    var procs = _pronoProcs(fila).filter(function (p) {
      return String(p).trim().toUpperCase() !== c.quita;
    });
    repoActualizar(c.hoja, 'ID_EVOLUCION', c.id, {
      PROC_JSON: JSON.stringify(procs),
      PROC_RESUMEN: procs.join(', '),
      PROC_CANTIDAD: procs.length,
    });
    // la fila del procedimiento y su hito en el historial
    repoEliminarDonde('PROCEDIMIENTOS', function (p) {
      return String(p.ID_EVOLUCION) === String(c.id) &&
             String(p.PROCEDIMIENTO || '').trim().toUpperCase() === c.quita;
    });
    var etiqueta = (PROC_TO_HITO[c.quita === 'SUPINACIÓN' ? 'SUPINO' : c.quita] || {}).label;
    if (etiqueta) {
      var partes = String(c.turno).split('-');
      var turno = partes.pop(), fecha = partes.join('-');
      repoEliminarDonde('TIMELINE', function (h) {
        return String(h.ID_CAMA) === String(c.cama) && String(h.FECHA) === fecha &&
               h.TURNO === turno && String(h.TEXTO) === etiqueta;
      });
    }
  });

  auditar({ accion: 'CORRECCION_PRONO', entidad: 'EVOLUCIONES', detalle: casos.length + ' registro(s)' });
  var fin = 'Listo: ' + casos.length + ' pronación(es)/supinación(es) repetida(s) corregida(s).\n' + detalle;
  Logger.log(fin);
  return ok({ casos: casos.length, detalle: casos, mensaje: fin });
}

/** Procedimientos de una evolución (PROC_JSON, tolerante a filas antiguas). */
function _pronoProcs(fila) {
  try { return JSON.parse(fila.PROC_JSON || '[]') || []; } catch (e) { return []; }
}

// ═══════════════════════════════════════════════════════════════════════
//  CAMAS DE PRUEBA (ago-2026)
//  Pedido de Diego: quiere probar una versión nueva con la unidad llena de
//  pacientes REALES, sin tocarles la evolución. Se agregan camas al final
//  del censo para ensayar ahí.
//
//  OJO — la siembra de crearORepararEstructura() solo corre con la hoja
//  VACÍA (`if (hCam.getLastRow() < filaDatos)`), así que subir NUM_CAMAS a
//  mano NO agrega nada cuando ya hay pacientes. Por eso existe esto.
//
//  Las camas de prueba NO son inocuas para la estadística: los indicadores
//  y el REM cuentan pacientes-día desde EVOLUCIONES, así que todo lo que se
//  evolucione en ellas SUMA. Por eso el retiro borra también su historia.
// ═══════════════════════════════════════════════════════════════════════

/** Cuántas camas de prueba se agregan. */
const _PRUEBA_N = 2;

/** ¿Es una cama de prueba? Lo son las que pasan del NUM_CAMAS declarado. */
function _esCamaPrueba(idCama) {
  const real = parseInt(leerConfig('NUM_CAMAS', '18'), 10) || 18;
  return (parseInt(idCama, 10) || 0) > real;
}

/**
 * Agrega _PRUEBA_N camas vacías al final del censo, para ensayar sin tocar
 * a los pacientes reales. Idempotente: si ya existen, no las duplica.
 * NO cambia NUM_CAMAS a propósito — así `_esCamaPrueba` puede distinguirlas
 * y el retiro sabe cuáles son.
 */
function agregarCamasPrueba() {
  const log = [];
  const p = m => { log.push(m); Logger.log(m); };
  const camas = repoLeerTodos('CAMAS_ESTADO');
  const ids = {};
  let maxId = 0;
  camas.forEach(c => {
    const n = parseInt(c.ID_CAMA, 10) || 0;
    ids[String(n)] = true;
    if (n > maxId) maxId = n;
  });
  const real = parseInt(leerConfig('NUM_CAMAS', '18'), 10) || 18;
  p('=== CAMAS DE PRUEBA ===');
  p('camas reales declaradas (NUM_CAMAS): ' + real);
  p('cama más alta que existe hoy: ' + maxId);

  let creadas = 0;
  for (let i = 1; i <= _PRUEBA_N; i++) {
    const id = String(real + i);
    if (ids[id]) { p('  cama ' + id + ': YA EXISTE - se salta'); continue; }
    repoInsertar('CAMAS_ESTADO', {
      ID_CAMA: id, OCUPADA: false, STATUS_CAMA: 'Libre',
      VIA_AEREA: 'Natural', SOPORTE: 'Ambiente', MODO: 'Sin soporte',
    });
    p('  cama ' + id + ': CREADA (vacía)');
    creadas++;
  }
  SpreadsheetApp.flush();
  try { CacheService.getScriptCache().removeAll(['camas', 'boot']); } catch (e) {}
  p('');
  p(creadas ? ('✅ ' + creadas + ' cama(s) de prueba agregadas. Recarga la app con Ctrl+Shift+R.')
            : 'Nada que hacer: ya estaban.');
  p('Cuando termines de probar: quitarCamasPruebaSIMULACRO().');
  return log.join('\n');
}

/** Paso 1 — SIMULACRO: informa qué se borraría al retirar las camas de prueba. */
function quitarCamasPruebaSIMULACRO() { return _mtoQuitarPrueba(false); }
/** Paso 2 — REAL: retira las camas de prueba y TODA su historia. */
function quitarCamasPruebaCONFIRMAR() { return _mtoQuitarPrueba(true); }

function _mtoQuitarPrueba(escribir) {
  const log = [];
  const p = m => { log.push(m); Logger.log(m); };
  p(escribir ? '=== RETIRO REAL DE CAMAS DE PRUEBA ===' : '=== SIMULACRO (no se borra nada) ===');

  const camas = repoLeerTodos('CAMAS_ESTADO').filter(c => _esCamaPrueba(c.ID_CAMA));
  if (!camas.length) { p('No hay camas de prueba. Nada que hacer.'); return log.join('\n'); }

  // Los PATIENT_ID que nacieron en esas camas: su historia se va con ellas.
  const pids = {};
  camas.forEach(c => { if (c.PATIENT_ID) pids[String(c.PATIENT_ID)] = true; });
  const idsCama = {};
  camas.forEach(c => { idsCama[String(c.ID_CAMA)] = true; });
  repoLeerTodos('EVOLUCIONES').forEach(e => {
    if (idsCama[String(e.ID_CAMA)] && e.PATIENT_ID) pids[String(e.PATIENT_ID)] = true;
  });

  p('camas de prueba: ' + camas.map(c => c.ID_CAMA).join(', '));
  p('episodios de prueba: ' + (Object.keys(pids).length || 'ninguno'));
  p('');

  // Tablas que cuelgan de la cama o del episodio. Se limpian TODAS para que
  // las pruebas no queden sumando en indicadores, REM ni historial.
  // OJO: repoEliminarDonde SIEMPRE borra (no tiene modo simulacro), así que
  // en el simulacro se CUENTA con repoLeerTodos y no se le llama jamás.
  const PORCAMA = ['EVOLUCIONES', 'EVOLUCIONES_ARCHIVO', 'PROCEDIMIENTOS', 'TIMELINE', 'REINTUBACIONES'];
  const dePrueba = function (f) {
    return !!(idsCama[String(f.ID_CAMA)] || pids[String(f.PATIENT_ID)]);
  };
  let total = 0;
  PORCAMA.forEach(hoja => {
    let n = 0;
    try {
      n = escribir ? repoEliminarDonde(hoja, dePrueba)
                   : repoLeerTodos(hoja).filter(dePrueba).length;
    } catch (e) { p('  ' + hoja + ': no existe o no se pudo leer (' + e.message + ')'); return; }
    p('  ' + hoja + ': ' + n + (escribir ? ' fila(s) borradas' : ' fila(s) se borrarían'));
    total += n;
  });
  try {
    const esEp = f => !!pids[String(f.PATIENT_ID)];
    const n = escribir ? repoEliminarDonde('ARCHIVO_PACIENTES', esEp)
                       : repoLeerTodos('ARCHIVO_PACIENTES').filter(esEp).length;
    p('  ARCHIVO_PACIENTES: ' + n + (escribir ? ' fila(s) borradas' : ' fila(s) se borrarían'));
    total += n;
  } catch (e) {}

  if (escribir) {
    const n = repoEliminarDonde('CAMAS_ESTADO', f => _esCamaPrueba(f.ID_CAMA));
    p('  CAMAS_ESTADO: ' + n + ' cama(s) retiradas');
    SpreadsheetApp.flush();
    try { CacheService.getScriptCache().removeAll(['camas', 'boot']); } catch (e) {}
    p('');
    p('✅ Listo. ' + total + ' fila(s) de prueba borradas. Recarga con Ctrl+Shift+R.');
  } else {
    p('');
    p('Total: ' + total + ' fila(s) de historia + ' + camas.length + ' cama(s).');
    p('Si cuadra, correr quitarCamasPruebaCONFIRMAR().');
  }
  return log.join('\n');
}


// ════════════════════════════════════════════════════════════════════════════
//  MEDICIÓN DEL ARRANQUE (ago-2026)
//
//  Regla aprendida en otro sistema del mismo tipo (la agenda de Colitas): la
//  causa de la lentitud NUNCA fue la que parecía, y optimizar «lo que se ve
//  pesado» perdió días sin arreglar nada. Antes de tocar hay que cronometrar
//  por capas, y después hay que demostrar que acelerar no cambió ni un dato.
//
//  Esta función hace las dos cosas en una sola corrida desde el editor:
//    · cronometra cada parte de GET_BOOT por separado;
//    · corre el arranque completo CON y SIN el memo de configuración;
//    · compara las dos respuestas y avisa si difieren en algo.
//
//  Orden deliberado: primero CON memo y después SIN memo. Las lecturas de una
//  hoja quedan tibias del lado de Google, así que el segundo en correr tiene
//  ventaja — dársela al comportamiento ANTIGUO hace que la comparación sea
//  conservadora: si el memo igual gana, la ganancia es real.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Cronometra el arranque y compara con/sin memo. Correr desde el editor y leer
 * el registro de ejecución. No escribe nada.
 * @return {string} el mismo informe que deja en el log.
 */
function medirArranque() {
  const fecha = hoyISO();
  const key = fecha + '-Dia';
  const out = [];
  const p = function (s) { out.push(s); };

  const cron = function (etiqueta, fn) {
    const t0 = Date.now();
    let r = null, e = '';
    try { r = fn(); } catch (ex) { e = ex.message; }
    const ms = Date.now() - t0;
    p('   ' + etiqueta + ': ' + ms + ' ms' + (e ? '   ⚠ ' + e : ''));
    return { ms: ms, r: r };
  };

  const limpiar = function () { _CFG_MEMO = null; _TZ_MEMO = null; _CAT_MEMO = {}; };

  // Calentamiento: la primera lectura de la planilla en una ejecución paga el
  // arranque en frío de Apps Script. Se descarta para no atribuírselo a nadie.
  _MEMO_OFF = false; limpiar();
  const cal = Date.now();
  try { obtenerTodasLasCamas(); } catch (e) {}
  p('Calentamiento (arranque en frío + abrir la planilla): ' + (Date.now() - cal) + ' ms');
  p('');

  // ── 1) CON memo ───────────────────────────────────────────────────────────
  p('CON memo (esta versión):');
  _MEMO_OFF = false; limpiar();
  const cfg2 = cron('config de interfaz', function () { return _configUI(); });
  const fas2 = cron('catálogo de fases', function () { return catalogo('FASE_CLINICA'); });
  const mat2 = cron('matrices de categorización', function () { return catMatrices(); });
  const cam2 = cron('camas', function () { return obtenerTodasLasCamas(); });
  const evo2 = cron('evoluciones del día', function () { return obtenerEvosDelDia(fecha); });
  limpiar();
  const boot2 = cron('GET_BOOT completo', function () { return api('GET_BOOT', { fecha: fecha, key: key }, null); });

  p('');

  // ── 2) SIN memo (como estaba antes) ───────────────────────────────────────
  p('SIN memo (comportamiento anterior):');
  _MEMO_OFF = true; limpiar();
  const cfg1 = cron('config de interfaz', function () { return _configUI(); });
  const fas1 = cron('catálogo de fases', function () { return catalogo('FASE_CLINICA'); });
  const mat1 = cron('matrices de categorización', function () { return catMatrices(); });
  const cam1 = cron('camas', function () { return obtenerTodasLasCamas(); });
  const evo1 = cron('evoluciones del día', function () { return obtenerEvosDelDia(fecha); });
  limpiar();
  const boot1 = cron('GET_BOOT completo', function () { return api('GET_BOOT', { fecha: fecha, key: key }, null); });
  _MEMO_OFF = false; limpiar();   // dejar el servidor como estaba

  // ── 3) ¿Cambió algún valor? ───────────────────────────────────────────────
  // `ahora` es el reloj del servidor y cambia entre corridas: se excluye.
  const norm = function (b) {
    try {
      const d = JSON.parse(JSON.stringify((b && b.data) || {}));
      delete d.ahora;
      return JSON.stringify(d);
    } catch (e) { return 'ERROR:' + e.message; }
  };
  const iguales = norm(boot1.r) === norm(boot2.r);

  p('');
  p('─────────────────────────────────────────────');
  p('GET_BOOT   sin memo: ' + boot1.ms + ' ms');
  p('GET_BOOT   con memo: ' + boot2.ms + ' ms');
  const dif = boot1.ms - boot2.ms;
  p('Diferencia: ' + dif + ' ms' + (boot1.ms ? '  (' + Math.round(dif * 100 / boot1.ms) + '%)' : ''));
  p('Solo la config: ' + cfg1.ms + ' ms → ' + cfg2.ms + ' ms');
  p('Respuesta idéntica con y sin memo: ' + (iguales ? 'SÍ ✓' : 'NO ✗  ← REVISAR ANTES DE PUBLICAR'));
  p('');
  p('Referencia: camas ' + cam1.ms + '/' + cam2.ms + ' ms · evoluciones ' +
    evo1.ms + '/' + evo2.ms + ' ms · fases ' + fas1.ms + '/' + fas2.ms +
    ' ms · matrices ' + mat1.ms + '/' + mat2.ms + ' ms  (sin/con memo)');

  const informe = out.join('\n');
  Logger.log(informe);
  console.log(informe);
  return informe;
}

/**
 * ✅ **LA FUNCIÓN A CORRER ANTES DE DEJAR PUESTA LA LECTURA POR COLUMNAS.**
 * Comprueba, **con los datos reales de esta planilla**, que el tablero da
 * exactamente lo mismo leyendo 21 columnas que leyendo las 386, y que ningún
 * indicador se fue a 0 en el camino. No escribe nada.
 *
 * Tres comprobaciones, en este orden:
 *  1. **Número por número.** Compara los dos tableros campo a campo y lista las
 *     diferencias con nombre propio. Un indicador que pasa a 0 aparece aquí.
 *  2. **Los ceros se miran uno por uno.** Un 0 puede ser verdad (no hubo
 *     autoextubaciones este mes) o ser el síntoma. La única forma de saberlo es
 *     que valga 0 en los DOS caminos: eso es lo que se verifica.
 *  3. **Auditoría de campos.** Con `_COLS_AUDIT` encendido, cualquier campo que
 *     el cálculo toque sin haberlo declarado queda registrado — incluso si hoy
 *     llega con valor por caer dentro del bloque de un vecino. Ese es el que se
 *     rompería mañana en silencio.
 *
 * @return {string} el mismo informe que deja en el log.
 */
function verificarTablero() {
  const hoy = hoyISO();
  const out = [];
  const p = function (s) { out.push(s); };
  let problemas = 0;

  // Un mes con datos y el año completo: si el rango va vacío, la comparación
  // sale «idéntica» sin haber probado nada.
  const rangos = [
    ['mes en curso', hoy.slice(0, 8) + '01', hoy],
    ['año completo', hoy.slice(0, 4) + '-01-01', hoy],
  ];

  rangos.forEach(function (r) {
    const etiqueta = r[0], desde = r[1], hasta = r[2];
    p('══ ' + etiqueta + ' (' + desde + ' a ' + hasta + ') ══');

    _COLS_OFF = true;
    const entero = calcularIndicadores(desde, hasta);
    _COLS_OFF = false;
    _COLS_AUDIT = true; _COLS_AUDIT_HITS = {};
    const porCol = calcularIndicadores(desde, hasta);
    _COLS_AUDIT = false;

    if (!entero.ok || !porCol.ok) {
      problemas++;
      p('🔴 El cálculo falló: ' + (entero.error || porCol.error));
      return;
    }
    const A = entero.data, B = porCol.data;

    // 1 · Número por número.
    const claves = Object.keys(A);
    const dif = [];
    claves.forEach(function (k) {
      const a = JSON.stringify(A[k]), b = JSON.stringify(B[k]);
      if (a !== b) dif.push('   ✗ ' + k + ': entero=' + a + '  porColumnas=' + b);
    });
    if (dif.length) {
      problemas += dif.length;
      p('🔴 ' + dif.length + ' de ' + claves.length + ' indicadores NO coinciden:');
      dif.forEach(p);
    } else {
      p('✓ los ' + claves.length + ' indicadores coinciden exactamente');
    }

    // 2 · Los ceros, uno por uno.
    const ceros = claves.filter(function (k) {
      return (B[k] === 0 || B[k] === null) && typeof A[k] !== 'object';
    });
    const cerosMalos = ceros.filter(function (k) { return A[k] !== B[k]; });
    if (cerosMalos.length) {
      problemas += cerosMalos.length;
      p('🔴 indicadores que se fueron a 0 SOLO al leer por columnas: ' + cerosMalos.join(', '));
    } else if (ceros.length) {
      p('✓ ' + ceros.length + ' indicadores valen 0 o nulo, y valen lo mismo leyendo entero');
      p('   (' + ceros.join(', ') + ')');
    }

    // 3 · Campos tocados sin declarar.
    const sueltos = Object.keys(_COLS_AUDIT_HITS);
    if (sueltos.length) {
      problemas += sueltos.length;
      p('🔴 el cálculo tocó campos que nadie declaró en _CAMPOS_INDICADORES:');
      sueltos.slice(0, 25).forEach(function (k) { p('   ✗ ' + k + ' (' + _COLS_AUDIT_HITS[k] + ' accesos)'); });
      if (sueltos.length > 25) p('   … y ' + (sueltos.length - 25) + ' más');
      p('   Hoy pueden estar llegando con valor por caer al lado de otra columna,');
      p('   pero el día que eso cambie el indicador se va a 0 sin avisar. Agrégalos.');
      if (sueltos.length > 50) {
        p('   ⚠ Con tantos campos de golpe, lo más probable es que alguien esté');
        p('     recorriendo la fila entera (un JSON.stringify o un Object.keys),');
        p('     no usando cada campo. Mirar QUIÉN serializa antes de agregar 300.');
      }
    } else {
      p('✓ ningún campo tocado fuera de los declarados');
    }
    p('');
  });

  p('─────────────────────────────────────────────');
  p(problemas === 0
    ? '✅ SE PUEDE DEJAR PUESTA: mismos números, mismos ceros, ningún campo suelto.'
    : '🔴 NO DEJARLA PUESTA (' + problemas + ' hallazgos). Mientras se arregla: _COLS_OFF = true en repo.gs.');

  const informe = out.join('\n');
  Logger.log(informe);
  console.log(informe);
  return informe;
}

/**
 * Cronometra el tablero de indicadores con y sin lectura por columnas, y prueba
 * varios techos de viajes por hoja (Ola 3, ago-2026). Correr desde el editor y
 * leer el registro de ejecución. No escribe nada.
 *
 * Mide velocidad; quien dice si los números están bien es `verificarTablero()`.
 *
 * Por qué existe: leer 21 columnas en vez de 386 baja muchísimas celdas, pero
 * cuesta varios `getRange` en vez de uno, y **cuál de las dos cosas pesa más
 * no se sabe sin medirlo en esta planilla**. Aquí se mide y se elige. Si el
 * mejor resultado es «entero», dejar `_COLS_MAX_TRAMOS` como está no sirve de
 * nada: lo correcto es poner `_COLS_OFF = true` en repo.gs y decirlo.
 *
 * @return {string} el mismo informe que deja en el log.
 */
function medirTablero() {
  const hoy = hoyISO();
  const desde = hoy.slice(0, 8) + '01';
  const hasta = hoy;
  const out = [];
  const p = function (s) { out.push(s); };

  const filasDe = function (hoja) {
    try {
      const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(hoja);
      return h ? Math.max(0, h.getLastRow() - FILA_DATOS[hoja] + 1) : 0;
    } catch (e) { return -1; }
  };
  const fEvo = filasDe('EVOLUCIONES'), fArc = filasDe('EVOLUCIONES_ARCHIVO');
  const celdas = (fEvo + fArc) * TOTAL_COLS.EVOLUCIONES;
  p('Rango medido: ' + desde + ' a ' + hasta);
  p('Tamaño: EVOLUCIONES ' + fEvo + ' filas · EVOLUCIONES_ARCHIVO ' + fArc +
    ' filas · ' + celdas.toLocaleString('es-CL') + ' celdas leídas hoy por tablero');
  if ((fEvo * TOTAL_COLS.EVOLUCIONES) <= 40000) {
    p('⚠ EVOLUCIONES todavía cabe bajo el umbral: la lectura por columnas NO se');
    p('  activa para esa hoja y los tiempos de abajo saldrán casi iguales.');
  }
  p('');

  const cron = function (etiqueta, fn) {
    const t0 = Date.now();
    let r = null, e = '';
    try { r = fn(); } catch (ex) { e = ex.message; }
    const ms = Date.now() - t0;
    p('   ' + etiqueta + ': ' + ms + ' ms' + (e ? '   ⚠ ' + e : ''));
    return { ms: ms, r: r };
  };
  const norm = function (b) {
    try { return JSON.stringify((b && b.data) || {}); } catch (e) { return 'ERROR:' + e.message; }
  };

  // Calentamiento: la primera lectura paga el arranque en frío de Apps Script.
  const cal = Date.now();
  try { calcularIndicadores(desde, hasta); } catch (e) {}
  p('Calentamiento: ' + (Date.now() - cal) + ' ms');
  p('');

  p('Leyendo la hoja ENTERA (comportamiento anterior):');
  _COLS_OFF = true;
  const entero = cron('GET_INDICADORES', function () { return calcularIndicadores(desde, hasta); });
  _COLS_OFF = false;

  const resultados = [];
  const techoOriginal = _COLS_MAX_TRAMOS;
  [1, 3, 6, 10].forEach(function (techo) {
    _COLS_MAX_TRAMOS = techo;
    p('');
    p('Por columnas, hasta ' + techo + ' lectura(s) por hoja:');
    const r = cron('GET_INDICADORES', function () { return calcularIndicadores(desde, hasta); });
    resultados.push({ techo: techo, ms: r.ms, igual: norm(r.r) === norm(entero.r) });
  });
  _COLS_MAX_TRAMOS = techoOriginal;   // dejar el servidor como estaba

  const distintos = resultados.filter(function (x) { return !x.igual; });
  let mejor = { techo: 0, ms: entero.ms };
  resultados.forEach(function (x) { if (x.igual && x.ms < mejor.ms) mejor = x; });

  p('');
  p('─────────────────────────────────────────────');
  p('Hoja entera: ' + entero.ms + ' ms');
  resultados.forEach(function (x) {
    const dif = entero.ms - x.ms;
    p('Hasta ' + String(x.techo).padStart(2) + ' lecturas: ' + x.ms + ' ms   (' +
      (dif >= 0 ? '−' : '+') + Math.abs(dif) + ' ms' +
      (entero.ms ? ', ' + Math.round(Math.abs(dif) * 100 / entero.ms) + '%' : '') + ')' +
      (x.igual ? '' : '   ✗ RESULTADO DISTINTO'));
  });
  p('');
  if (distintos.length) {
    p('🔴 ALGÚN TECHO DEVOLVIÓ NÚMEROS DISTINTOS. No publicar: eso significa que');
    p('   _CAMPOS_INDICADORES no cubre todo lo que el cálculo usa.');
  } else if (mejor.techo === 0) {
    p('⚠ Ningún techo le ganó a leer la hoja entera EN ESTA PLANILLA.');
    p('  Lo correcto es dejar _COLS_OFF = true en repo.gs y anotar la medición,');
    p('  no dejar el código puesto «por si acaso».');
  } else {
    p('✔ Mejor medición: hasta ' + mejor.techo + ' lecturas por hoja (' + mejor.ms + ' ms).');
    p('  Dejar _COLS_MAX_TRAMOS = ' + mejor.techo + ' en repo.gs.');
  }
  p('  (Todos los techos devolvieron los mismos números que leer la hoja entera' +
    (distintos.length ? ' EXCEPTO los marcados' : '') + '.)');

  const informe = out.join('\n');
  Logger.log(informe);
  console.log(informe);
  return informe;
}
