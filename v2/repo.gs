/**
 * repo.gs — Repositorio genérico de acceso a Sheets, dirigido por esquema.
 * Ninguna otra capa toca getRange/getValues directamente: usa estos helpers.
 * Todo se resuelve por NOMBRE de columna (COL[hoja][campo]), nunca por índice fijo.
 */

function _hoja(nombre) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const h = ss.getSheetByName(nombre);
  if (!h) throw new Error('Hoja no encontrada: ' + nombre + ' (ejecuta crearORepararEstructura).');
  return h;
}

/**
 * Lee TODAS las filas de datos en UN viaje y las devuelve como objetos.
 * Filtro opcional en memoria (comparación por string, robusta con fechas ISO).
 * @param {string} hoja
 * @param {string} [filtroKey]  nombre de columna
 * @param {*}      [filtroVal]
 * @return {Array<Object>}
 */
function repoLeerTodos(hoja, filtroKey, filtroVal) {
  // Con filtro, la lectura se acota por tramos (repoLeerFiltrado): baja UNA
  // columna para ubicar las filas y solo después las filas completas. Antes
  // se traía la hoja ENTERA (EVOLUCIONES: 380 columnas × todo el historial)
  // y se filtraba en memoria — invisible con pocos datos, segundos de espera
  // con el año lleno. Todas las columnas usadas como filtro son de tipo
  // texto, así que el valor crudo de la celda calza con el convertido.
  if (filtroKey != null && filtroVal != null) {
    const fv = String(filtroVal).trim();
    return repoLeerFiltrado(hoja, filtroKey, function (v) { return String(v).trim() === fv; });
  }
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], total = TOTAL_COLS[hoja], ult = h.getLastRow();
  if (ult < fi) return [];
  const datos = h.getRange(fi, 1, ult - fi + 1, total).getValues();
  const out = [];
  for (let i = 0; i < datos.length; i++) out.push(esquemaFilaAObjeto(hoja, datos[i]));
  return out;
}

/**
 * Lee SOLO las filas cuyo campo `colKey` cumple `pred`, sin traer la hoja
 * entera (ago-2026). Primero baja una única columna (barato) para ubicar las
 * filas y después lee el bloque que las contiene. En EVOLUCIONES (379
 * columnas) esto evita descargar decenas de miles de celdas en cada arranque:
 * el costo deja de crecer con el historial acumulado.
 */
function repoLeerFiltrado(hoja, colKey, pred) {
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], total = TOTAL_COLS[hoja], ult = h.getLastRow();
  if (ult < fi) return [];
  const nFilas = ult - fi + 1;
  const col = COL[hoja][colKey];
  if (!col) throw new Error('Columna desconocida: ' + colKey + ' en ' + hoja);
  const clave = h.getRange(fi, col, nFilas, 1).getValues();
  let desde = -1, hasta = -1;
  const marcadas = [];
  for (let i = 0; i < clave.length; i++) {
    if (!pred(clave[i][0])) continue;
    marcadas.push(i);
    if (desde < 0) desde = i;
    hasta = i;
  }
  if (!marcadas.length) return [];
  // Las filas del día suelen ir juntas al final, pero pueden quedar dispersas
  // (evoluciones de fechas pasadas). Se leen por TRAMOS contiguos, uniendo
  // huecos pequeños: un solo getRange en el caso normal y unos pocos en el
  // peor, en vez de bajar la hoja entera.
  const HUECO = 25;
  const tramos = [];
  let ini = marcadas[0], fin = marcadas[0];
  for (let k = 1; k < marcadas.length; k++) {
    if (marcadas[k] - fin <= HUECO) { fin = marcadas[k]; continue; }
    tramos.push([ini, fin]); ini = fin = marcadas[k];
  }
  tramos.push([ini, fin]);
  // Cada getRange tiene su costo fijo: si quedaron demasiados tramos (filas
  // muy dispersas), sale más barato una sola lectura del bloque completo.
  if (tramos.length > 8) tramos.length = 0, tramos.push([desde, hasta]);
  const porFila = {};
  tramos.forEach(function (t) {
    const vals = h.getRange(fi + t[0], 1, t[1] - t[0] + 1, total).getValues();
    for (let i = 0; i < vals.length; i++) porFila[t[0] + i] = vals[i];
  });
  const out = [];
  for (let k = 0; k < marcadas.length; k++) {
    const fila = porFila[marcadas[k]];
    if (fila) out.push(esquemaFilaAObjeto(hoja, fila));
  }
  return out;
}

// 🔴 APAGADA POR MEDICIÓN, DOS VECES (8-ago-2026 18:32 y 18:47, planilla real).
// NO encenderla sin volver a correr `medirTablero()`. Con 136 filas en
// EVOLUCIONES y 90 en EVOLUCIONES_ARCHIVO —87.236 celdas por tablero, no
// millones— **leer la hoja entera ganó las ocho comparaciones**:
//
//                          corrida 1        corrida 2
//     hoja entera ......... 1.465 ms         1.545 ms
//     hasta  1 lectura .... 1.626 (+11%)     1.898 (+23%)
//     hasta  3 lecturas ... 2.670 (+82%)     1.688  (+9%)
//     hasta  6 lecturas ... 1.670 (+14%)     2.382 (+54%)
//     hasta 10 lecturas ... 2.239 (+53%)     2.839 (+84%)
//
// El ahorro de celdas es real (13× en Node) pero a este volumen no alcanza a
// pagar los viajes de más: en Apps Script el viaje pesa más que la celda.
// Leer las dos corridas juntas es lo que hace sólida la conclusión: **el orden
// entre techos se dio vuelta** (el 3 pasó de peor a mejor, el 6 al revés), o
// sea que las diferencias entre ellos son ruido de red; lo que NO se movió es
// que la lectura entera gana siempre, y es además el tiempo más estable.
//
// El código se queda, apagado y con sus guardias, porque el día que la hoja
// crezca de verdad la cuenta puede darse vuelta: entonces `medirTablero()`
// vuelve a decidir. Ojo: el umbral de 40.000 celdas de más abajo enciende esto
// demasiado pronto —a 52.496 ya perdía—; si algún día se reactiva, subirlo.
var _COLS_OFF = true;
var _COLS_MAX_TRAMOS = 6;     // techo de lecturas por hoja; medirTablero() lo mueve
var _COLS_AUDIT = false;      // lo enciende verificarTablero(): registra accesos no declarados
var _COLS_AUDIT_HITS = {};    // 'HOJA.CAMPO' → cuántas veces se tocó sin declararlo

/**
 * Agrupa columnas sueltas en como mucho `_COLS_MAX_TRAMOS` bloques contiguos,
 * fusionando siempre el hueco MÁS PEQUEÑO que queda. Para un número de viajes
 * dado, es la agrupación que baja menos celdas.
 *
 * El techo importa más de lo que parece: cada `getRange().getValues()` es un
 * viaje de red con costo fijo, así que «pedir solo lo justo» puede salir más
 * caro que bajar la fila entera de una vez. Con las 21 columnas del tablero:
 * 1 viaje → 324 columnas, 6 → 85, 10 → 29. La curva se aplana pasados ~10.
 *
 * @param {Array<number>} idx  columnas 1-based, ordenadas
 * @return {Array<Array<number>>} tramos [primeraCol, ultimaCol]
 */
function _colsTramos(idx) {
  // Un techo de 0 (o negativo) dejaría el bucle intentando fusionar un tramo
  // con el siguiente, que no existe: se trata como 1, la lectura de un viaje.
  const techo = Math.max(1, _COLS_MAX_TRAMOS);
  let tramos = idx.map(function (c) { return [c, c]; });
  while (tramos.length > techo) {
    let mejor = 0, hueco = Infinity;
    for (let k = 0; k < tramos.length - 1; k++) {
      const h = tramos[k + 1][0] - tramos[k][1];
      if (h < hueco) { hueco = h; mejor = k; }
    }
    tramos = tramos.slice(0, mejor)
      .concat([[tramos[mejor][0], tramos[mejor + 1][1]]])
      .concat(tramos.slice(mejor + 2));
  }
  return tramos;
}

/**
 * Lee TODAS las filas pero SOLO las columnas pedidas (ago-2026, Ola 3).
 *
 * El tablero necesita 21 campos y hasta ahora bajaba las 386 columnas de
 * EVOLUCIONES *y* de EVOLUCIONES_ARCHIVO: con el año lleno son millones de
 * celdas por pantalla, y el costo crece con el historial aunque el rango
 * consultado sea de un mes.
 *
 * ⚠️ **El campo que no se pide llega vacío, no llega roto.** Un cálculo que
 * toque un campo ausente de `campos` no falla: da 0 o '' en silencio, que en
 * un indicador clínico es peor que un error. Contra eso hay TRES redes, y
 * ninguna sobra:
 *   1. La lista se declara junto al cálculo y `build/checks/columnas.js` la
 *      contrasta contra los campos que el código toca (también los dinámicos).
 *   2. Lo que sale de aquí queda **marcado como parcial** y las funciones de
 *      escritura lo RECHAZAN: un objeto parcial guardado borraría con vacío
 *      todas las columnas que no se leyeron. Eso sí sería pérdida de datos.
 *   3. Con `_COLS_AUDIT` encendido, tocar un campo no declarado queda
 *      registrado aunque hoy venga con valor por caer dentro del bloque de un
 *      vecino: `verificarTablero()` lo usa sobre los datos REALES.
 *
 * Cae a la lectura completa —que es un solo viaje— cuando no compensa: hoja
 * pequeña, o campos tan dispersos que habría que bajar media fila igual.
 *
 * @param {string} hoja
 * @param {Array<string>} campos  nombres de columna del esquema
 * @return {Array<Object>} objetos SOLO PARA LEER; los campos no pedidos van ''
 */
function repoLeerColumnas(hoja, campos) {
  if (_COLS_OFF === true || !campos || !campos.length) return repoLeerTodos(hoja);
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], total = TOTAL_COLS[hoja], ult = h.getLastRow();
  if (ult < fi) return [];
  const nFilas = ult - fi + 1;
  const colmap = COL[hoja];
  const idx = [];
  for (let i = 0; i < campos.length; i++) {
    const c = colmap[campos[i]];
    if (!c) throw new Error('Columna desconocida: ' + campos[i] + ' en ' + hoja);
    idx.push(c);
  }
  idx.sort(function (a, b) { return a - b; });
  // Con pocas filas la hoja entera cabe en un viaje y sale más barata.
  if (nFilas * total <= 40000) return repoLeerTodos(hoja);
  const tramos = _colsTramos(idx);
  const ancho = tramos.reduce(function (s, t) { return s + (t[1] - t[0] + 1); }, 0);
  // Si igual hay que bajar más de media fila, el viaje único gana.
  if (ancho > total * 0.6) return repoLeerTodos(hoja);
  const filas = new Array(nFilas);
  for (let i = 0; i < nFilas; i++) filas[i] = new Array(total).fill('');
  tramos.forEach(function (t) {
    const vals = h.getRange(fi, t[0], nFilas, t[1] - t[0] + 1).getValues();
    for (let i = 0; i < nFilas; i++) {
      const destino = filas[i], origen = vals[i];
      for (let j = 0; j < origen.length; j++) destino[t[0] - 1 + j] = origen[j];
    }
  });
  const out = new Array(nFilas);
  for (let i = 0; i < nFilas; i++) out[i] = _colsMarcar(esquemaFilaAObjeto(hoja, filas[i]), hoja, campos);
  return out;
}

/**
 * Marca un objeto como leído a medias y —si la auditoría está encendida— avisa
 * cuando alguien toca un campo que nadie declaró.
 *
 * La marca es **no enumerable** a propósito: no sale en `JSON.stringify`, no
 * aparece en `Object.keys` y `esquemaObjetoAFila` (que recorre el esquema, no
 * el objeto) ni la ve. O sea: no cambia ni un dato ni una respuesta.
 */
function _colsMarcar(obj, hoja, campos) {
  const o = _COLS_AUDIT === true ? _colsAuditar(obj, hoja, campos) : obj;
  try {
    Object.defineProperty(o, '_PARCIAL', {
      value: { hoja: hoja, campos: campos }, enumerable: false, writable: false, configurable: true,
    });
  } catch (e) { /* si no se puede marcar, se devuelve igual: la marca es una red, no el dato */ }
  return o;
}

/**
 * Envuelve la fila para registrar accesos a campos NO declarados.
 *
 * Se compara contra los campos DECLARADOS, no contra los que efectivamente se
 * bajaron: un campo que hoy llega con valor «de paso», porque cayó dentro del
 * bloque contiguo de un vecino, es una bomba de tiempo — el día que cambie el
 * esquema o el techo de tramos empieza a llegar vacío y el indicador se cae sin
 * ruido. Aquí se caza mientras todavía funciona.
 */
function _colsAuditar(obj, hoja, campos) {
  const declarados = {};
  campos.forEach(function (c) { declarados[c] = true; });
  const colmap = COL[hoja] || {};
  return new Proxy(obj, {
    get: function (target, prop) {
      if (typeof prop === 'string' && !declarados[prop] && colmap[prop]) {
        const k = hoja + '.' + prop;
        _COLS_AUDIT_HITS[k] = (_COLS_AUDIT_HITS[k] || 0) + 1;
      }
      return target[prop];
    },
  });
}

/** ¿Este objeto viene de una lectura por columnas (y por tanto está a medias)? */
function _colsEsParcial(obj) {
  return !!(obj && typeof obj === 'object' && obj._PARCIAL);
}

/**
 * Frena una escritura que venga de una lectura parcial.
 *
 * Es el escenario que de verdad haría daño: un objeto con 21 columnas leídas y
 * 365 en blanco, guardado tal cual, **borraría** esas 365 en la hoja. Hoy nadie
 * lo hace —`repoLeerColumnas` solo lo usa el tablero, que no escribe— y esto
 * existe para que siga siendo verdad el día que alguien reutilice el helper sin
 * leer este archivo.
 */
function _colsExigirCompleto(hoja, obj, quien) {
  if (!_colsEsParcial(obj)) return;
  const p = obj._PARCIAL;
  throw new Error(quien + ': se intentó escribir en ' + hoja + ' un registro leído a medias ' +
    'por repoLeerColumnas(' + p.hoja + ', ' + p.campos.length + ' campos). Guardarlo dejaría en ' +
    'blanco todas las columnas que no se leyeron. Vuelve a leer la fila completa antes de escribir.');
}

/** Índice de fila (1-based) cuyo campo colKey == id, o -1. */
function repoBuscarFila(hoja, colKey, id) {
  const col = COL[hoja][colKey];
  if (!col) throw new Error('Columna desconocida: ' + colKey + ' en ' + hoja);
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], ult = h.getLastRow();
  if (ult < fi) return -1;
  const vals = h.getRange(fi, col, ult - fi + 1, 1).getValues();
  const target = String(id).trim();
  for (let i = 0; i < vals.length; i++) {
    if (String(vals[i][0]).trim() === target) return fi + i;
  }
  return -1;
}

/** Objeto de la fila cuyo campo colKey == id, o null. */
function repoBuscarPorId(hoja, colKey, id) {
  const f = repoBuscarFila(hoja, colKey, id);
  if (f === -1) return null;
  const h = _hoja(hoja);
  return esquemaFilaAObjeto(hoja, h.getRange(f, 1, 1, TOTAL_COLS[hoja]).getValues()[0]);
}

/**
 * Inserta una fila desde un objeto. Escribe en la primera fila de datos real
 * (max(lastRow+1, FILA_DATOS)) — NO usa appendRow, que en hojas con filas de
 * encabezado vacías (p.ej. EVOLUCIONES, 3 encabezados) escribiría dentro de la
 * zona de encabezado y el registro quedaría invisible para las lecturas.
 */
function repoInsertar(hoja, obj) {
  _colsExigirCompleto(hoja, obj, 'repoInsertar');
  const h = _hoja(hoja);
  const fila = esquemaObjetoAFila(hoja, obj);
  const row = Math.max(h.getLastRow() + 1, FILA_DATOS[hoja]);
  _repoAsegurarFilas(h, row);
  h.getRange(row, 1, 1, TOTAL_COLS[hoja]).setValues([fila]);
  return obj;
}

/**
 * La hoja debe tener filas FÍSICAS hasta `filaFin`: en Sheets, getRange más
 * allá del grid es una excepción, no una expansión automática. Las hojas que
 * crecen solas (AUDIT_LOG suma una fila por CADA escritura; PROCEDIMIENTOS y
 * TIMELINE, varias por guardado) iban a chocar con su última fila física y
 * desde ese día TODA escritura del sistema fallaría — el peor modo de falla:
 * de golpe, sin aviso y en la acción que el colega no puede repetir después.
 */
function _repoAsegurarFilas(h, filaFin) {
  const max = h.getMaxRows();
  if (filaFin > max) h.insertRowsAfter(max, Math.max(filaFin - max, 20));
}

/**
 * Inserta VARIAS filas contiguas en UN solo setValues (ago-2026, Ola 4).
 * Insertar N procedimientos/hitos de un guardado fila a fila costaba N viajes;
 * como nacen juntos, viajan juntos.
 */
function repoInsertarVarios(hoja, objs) {
  if (!objs || !objs.length) return 0;
  const h = _hoja(hoja);
  const filas = objs.map(function (o) {
    _colsExigirCompleto(hoja, o, 'repoInsertarVarios');
    return esquemaObjetoAFila(hoja, o);
  });
  const row = Math.max(h.getLastRow() + 1, FILA_DATOS[hoja]);
  _repoAsegurarFilas(h, row + filas.length - 1);
  h.getRange(row, 1, filas.length, TOTAL_COLS[hoja]).setValues(filas);
  return filas.length;
}

/**
 * Actualiza campos de la fila cuyo colKey == id (batch: lee, muta, 1 setValues).
 * @return {boolean} true si actualizó, false si no encontró.
 */
function repoActualizar(hoja, colKey, id, campos) {
  _colsExigirCompleto(hoja, campos, 'repoActualizar');
  const f = repoBuscarFila(hoja, colKey, id);
  if (f === -1) return false;
  const h = _hoja(hoja), total = TOTAL_COLS[hoja], colmap = COL[hoja];
  const fila = h.getRange(f, 1, 1, total).getValues()[0];
  Object.keys(campos).forEach(k => {
    if (colmap[k]) fila[colmap[k] - 1] = (campos[k] == null) ? '' : campos[k];
  });
  h.getRange(f, 1, 1, total).setValues([fila]);
  return true;
}

/**
 * Elimina todas las filas cuyo objeto cumpla el predicado fn(obj)===true.
 * Borra de abajo hacia arriba para no desordenar índices.
 * @return {number} filas eliminadas.
 */
function repoEliminarDonde(hoja, fn) {
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], total = TOTAL_COLS[hoja], ult = h.getLastRow();
  if (ult < fi) return 0;
  const datos = h.getRange(fi, 1, ult - fi + 1, total).getValues();
  const aBorrar = [];
  for (let i = 0; i < datos.length; i++) {
    if (fn(esquemaFilaAObjeto(hoja, datos[i]))) aBorrar.push(fi + i);
  }
  aBorrar.reverse().forEach(r => h.deleteRow(r));
  return aBorrar.length;
}

/**
 * Actualiza en bloque todas las filas que cumplan fn(obj); mut(obj) devuelve
 * los campos a cambiar para esa fila. Lee y escribe el rango completo UNA vez,
 * por lo que sirve para re-etiquetar muchas filas sin buscar por id (que se
 * volvería ambiguo si los ids cambian durante la operación, p.ej. traslados).
 * @return {number} filas modificadas.
 */
function repoActualizarDonde(hoja, fn, mut) {
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], total = TOTAL_COLS[hoja], ult = h.getLastRow();
  if (ult < fi) return 0;
  const rango = h.getRange(fi, 1, ult - fi + 1, total);
  const datos = rango.getValues();
  const colmap = COL[hoja];
  let n = 0;
  for (let i = 0; i < datos.length; i++) {
    const obj = esquemaFilaAObjeto(hoja, datos[i]);
    if (!fn(obj)) continue;
    const campos = mut(obj) || {};
    _colsExigirCompleto(hoja, campos, 'repoActualizarDonde');
    Object.keys(campos).forEach(k => {
      if (colmap[k]) datos[i][colmap[k] - 1] = (campos[k] == null) ? '' : campos[k];
    });
    n++;
  }
  if (n) rango.setValues(datos);
  return n;
}

/**
 * Upsert por clave: si existe la fila (colKey==id) la actualiza; si no, inserta.
 * @return {string} 'crear' | 'actualizar'
 */
function repoUpsert(hoja, colKey, id, obj) {
  _colsExigirCompleto(hoja, obj, 'repoUpsert');
  const f = repoBuscarFila(hoja, colKey, id);
  return repoUpsertEnFila(hoja, f, obj);
}

/**
 * Upsert cuando la fila YA se conoce (ago-2026, Ola 4): el guardado busca la
 * fila del turno al empezar (para fusionar con lo ya guardado) y volvía a
 * buscarla al escribir. Válido SOLO dentro del mismo lock y sin ningún
 * borrado/inserción de la hoja entre la búsqueda y esta escritura — si no,
 * la fila puede haberse movido y se escribiría encima de otro registro.
 * @param {number} fila  1-based, o -1 para insertar
 */
function repoUpsertEnFila(hoja, fila, obj) {
  _colsExigirCompleto(hoja, obj, 'repoUpsertEnFila');
  if (fila === -1) { repoInsertar(hoja, obj); return 'crear'; }
  const h = _hoja(hoja);
  h.getRange(fila, 1, 1, TOTAL_COLS[hoja]).setValues([esquemaObjetoAFila(hoja, obj)]);
  return 'actualizar';
}

/** Fila completa (1-based) como objeto. Para quien ya sabe DÓNDE está. */
function repoLeerFila(hoja, fila) {
  const h = _hoja(hoja);
  return esquemaFilaAObjeto(hoja, h.getRange(fila, 1, 1, TOTAL_COLS[hoja]).getValues()[0]);
}

/**
 * Reescribe una fila completa desde un objeto, SIN releerla (ago-2026, Ola 4).
 *
 * Es la pareja de repoLeerFila: válida solo dentro del mismo lock, con la fila
 * quieta (nada borró/insertó en la hoja desde que se leyó) y con el objeto
 * nacido de la lectura de ESA fila. Todas las hojas del esquema van en formato
 * texto (@, ver _forzarTexto), así que leer→objeto→fila es sin pérdida; si una
 * celda pegada a mano llegara como Date, esto la normaliza a texto ISO, que es
 * lo que el sistema espera de todos modos.
 */
function repoEscribirFila(hoja, fila, obj) {
  _colsExigirCompleto(hoja, obj, 'repoEscribirFila');
  const h = _hoja(hoja);
  h.getRange(fila, 1, 1, TOTAL_COLS[hoja]).setValues([esquemaObjetoAFila(hoja, obj)]);
}

/**
 * Lee TODA la hoja UNA vez y devuelve cada fila con su número (1-based).
 * Para flujos que necesitan leer, borrar algunas y conservar el resto en la
 * mano (la línea de tiempo del guardado) sin pagar una segunda lectura.
 * @return {Array<{obj:Object, fila:number}>}
 */
function repoLeerTodosConFila(hoja) {
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], total = TOTAL_COLS[hoja], ult = h.getLastRow();
  if (ult < fi) return [];
  const datos = h.getRange(fi, 1, ult - fi + 1, total).getValues();
  const out = [];
  for (let i = 0; i < datos.length; i++) out.push({ obj: esquemaFilaAObjeto(hoja, datos[i]), fila: fi + i });
  return out;
}

/**
 * Elimina filas por número (1-based), agrupando en TRAMOS contiguos y de abajo
 * hacia arriba: N filas seguidas cuestan UN deleteRows, no N deleteRow.
 * @return {number} filas eliminadas
 */
function repoEliminarFilas(hoja, filas) {
  if (!filas || !filas.length) return 0;
  const h = _hoja(hoja);
  const ord = filas.slice().sort(function (a, b) { return a - b; });
  let n = 0;
  for (let k = ord.length - 1; k >= 0;) {
    let ini = k;
    while (ini > 0 && ord[ini - 1] === ord[ini] - 1) ini--;
    h.deleteRows(ord[ini], k - ini + 1);
    n += k - ini + 1;
    k = ini - 1;
  }
  return n;
}

/**
 * Elimina filas mirando SOLO las columnas que el predicado necesita
 * (ago-2026, Ola 4). repoEliminarDonde baja la hoja ENTERA para decidir qué
 * borrar — en cada guardado eso era PROCEDIMIENTOS completa para reemplazar
 * los 2-4 procs de un turno, y el costo crece con el año acumulado. Aquí se
 * baja un único rango contiguo [colMin..colMax] de los campos pedidos.
 * El predicado recibe un objeto SOLO con esos campos.
 * @return {number} filas eliminadas
 */
function repoEliminarPorCols(hoja, campos, pred) {
  const h = _hoja(hoja);
  const fi = FILA_DATOS[hoja], ult = h.getLastRow();
  if (ult < fi) return 0;
  const colmap = COL[hoja];
  const idx = campos.map(function (c) {
    const k = colmap[c];
    if (!k) throw new Error('Columna desconocida: ' + c + ' en ' + hoja);
    return k;
  });
  const c1 = Math.min.apply(null, idx), c2 = Math.max.apply(null, idx);
  const vals = h.getRange(fi, c1, ult - fi + 1, c2 - c1 + 1).getValues();
  const aBorrar = [];
  for (let i = 0; i < vals.length; i++) {
    const o = {};
    for (let j = 0; j < campos.length; j++) o[campos[j]] = vals[i][idx[j] - c1];
    if (pred(o)) aBorrar.push(fi + i);
  }
  return repoEliminarFilas(hoja, aBorrar);
}
