// inventario_reconciliar.js — Guardia de la reconciliación del inventario
// (14-sep-2026). Diego mandó lo que HAY hoy en la unidad: 20 equipos numerados
// en sala, 6 en bodega, 9 capnógrafos y 4 bases calefactoras. La planilla
// todavía tenía la carga inicial del 31-07, que ya no calza.
//
// Lo que fija, con el servidor REAL corriendo en el simulador:
//  1. El papel son 26 equipos con número, sin repetidos: Diego los dictó por
//     voz y la lista traía tres nombres dos veces (Mek 17, Mek 15, Savina 3).
//     Si alguien los vuelve a meter, esto lo caza.
//  2. 🔴 Los Puritan Bennett se llaman «PB 1» y «PB 2». CONFIG.HEPA_FIJO_EQUIPOS
//     trae «PB,Avea» y compara por PREFIJO: con «Puritan Bennet 1» el HEPA fijo
//     deja de reconocerse y la app empieza a pedir cambio de filtro cada 3 días
//     en esos equipos. El nombre es una regla clínica, no un rótulo.
//  3. NADA SE BORRA: lo que sobra queda ACTIVO=false, con su historial y sus
//     fallas intactos, y sigue en la hoja.
//  4. Es idempotente: correrla dos veces no duplica ni vuelve a mover nada.
//  5. El simulacro no escribe una sola fila.
//  6. La MR850 que estaba cargada con nombre propio se da de baja y pasa a
//     stock por cantidad (4), que es lo que Diego decidió en agosto: el mismo
//     equipo no puede estar contado dos veces.
//  7. Después de correrla, la lista por cama ve los 26 y ninguno de los viejos.
//
// Uso: node build/checks/inventario_reconciliar.js
const fs = require('fs');
const path = require('path');
const fails = [];
const eq = (l, g, w) => { const ok = String(g) === String(w);
  console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g));
  if (!ok) { fails.push(l); console.log('   esperado: ' + JSON.stringify(w)); } };
const si = (l, g) => eq(l, !!g, 'true');

const { api, DB, SIM, CONFIG } = require('../sim/sim_srv.js');
const v2 = path.resolve(__dirname, '..', '..', 'v2');
// Las rutinas de mantenimiento no viven en el dispatcher: se corren desde el
// editor. Se cargan encima del servidor ya evaluado.
global.SpreadsheetApp = { flush: () => {}, getActiveSpreadsheet: () => ({ getSheetByName: () => null }) };
global.CacheService = global.CacheService || { getScriptCache: () => ({ removeAll: () => {} }) };
global.Logger = { log: () => {} };
// El informe se lee y se asserta, no se imprime: lo que importa es el exit code.
const _log = console.log; let _mudo = false;
console.log = (...a) => { if (!_mudo) _log(...a); };
(0, eval)(fs.readFileSync(path.join(v2, 'mantenimiento.gs'), 'utf8'));

const call = (a, d) => api(a, Object.assign({ firmaKine: 'DMV' }, d || {}), '');
const nombres = arr => arr.map(x => String(x.NOMBRE)).sort().join(', ');
const activos = () => DB.VENTILADORES.filter(x => x.ACTIVO === true);
const debaja = () => DB.VENTILADORES.filter(x => x.ACTIVO !== true);

/* ── Banco: la planilla como quedó de la carga inicial del 31-07 ─────────
   (un puñado representativo, no las 30 filas: lo que se prueba es la REGLA) */
SIM.fecha = '2026-09-14'; SIM.hora = '10:00:00';
DB.VENTILADORES.length = 0;
const fila = (id, nombre, cat, tipo, det, extra) => Object.assign({
  ID_VM: id, NOMBRE: nombre, MARCA: '', MODELO: '', CATEGORIA: cat, ACTIVO: true,
  ESTADO: 'Operativo', UBIC_TIPO: tipo, UBIC_DETALLE: det || '', EN_USO: false,
}, extra || {});
DB.VENTILADORES.push(
  fila('v1', 'Avea 1',  'VM', 'CAMA', '1'),          // existe y está en una cama: se mueve
  fila('v2', 'PB 1',    'VM', 'CAMA', '3'),          // existe con el nombre BUENO
  fila('v3', 'Mek 12',  'VM', 'CAMA', '4'),
  fila('v4', 'Vela 9',  'VM', 'CAMA', '2'),          // NO está en el papel: de baja
  fila('v5', 'PB 980',  'VM', 'CAMA', '18'),         // NO está en el papel: de baja
  fila('v6', 'Carina',  'VNI', 'BODEGA', ''),        // NO está en el papel: de baja
  fila('v7', 'Savina 4', 'VM', 'BODEGA', ''),        // en el papel Y ya en bodega: no se toca
  fila('v8', 'MR850 (cama 12)', 'APOYO', 'CAMA', '12'),   // pasa a stock por cantidad
  fila('v9', 'Mek 9',   'VM', 'BODEGA', '', { ACTIVO: false, ESTADO: 'De baja' }),  // ya de baja: se deja
);
DB.STOCK_EQUIPOS.length = 0;
DB.STOCK_EQUIPOS.push(
  { ID_STOCK: 's1', NOMBRE: 'Capnógrafo Nihon Kohden', CATEGORIA: 'Capnografía', CANTIDAD: 5, ESTADO: 'Operativo', ACTIVO: true, ASIGNACION_JSON: '' },
  { ID_STOCK: 's2', NOMBRE: 'Capnógrafo Dräger', CATEGORIA: 'Capnografía', CANTIDAD: 4, ESTADO: 'De baja', ACTIVO: true, ASIGNACION_JSON: '' },
);

console.log('1 · El papel: 26 equipos con número, sin repetidos');
const real = _invReal();
const nn = real.map(x => x.nombre);
eq('veintiséis equipos', real.length, 26);
eq('ninguno repetido', nn.length - new Set(nn.map(s => s.toLowerCase())).size, 0);
eq('quince VMI en sala', real.filter(x => x.categoria === 'VM' && x.ubicTipo === 'PASILLO').length, 15);
eq('dos VNI y tres CNAF en sala', real.filter(x => x.ubicTipo === 'PASILLO' && x.categoria === 'VNI').length + '/' +
  real.filter(x => x.ubicTipo === 'PASILLO' && x.categoria === 'CNAF').length, '2/3');
eq('seis en bodega', real.filter(x => x.ubicTipo === 'BODEGA').length, 6);
eq('ninguno queda clavado en una cama inventada', real.filter(x => x.ubicTipo === 'CAMA').length, 0);

console.log('\n2 · Los Puritan Bennett se llaman PB, o el HEPA fijo deja de reconocerlos');
const pref = String(CONFIG.HEPA_FIJO_EQUIPOS || 'PB,Avea').split(',').map(s => s.trim().toLowerCase());
const calza = n => pref.some(p => p && String(n).toLowerCase().indexOf(p) === 0);
eq('en el papel están PB 1 y PB 2, no «Puritan Bennet»', nn.filter(n => /^PB /.test(n)).join(','), 'PB 1,PB 2');
si('…y ninguno se escribió «Puritan Bennet N»', !nn.some(n => /^puritan/i.test(n)));
eq('los dos PB y las dos Avea calzan con HEPA_FIJO_EQUIPOS', nn.filter(calza).sort().join(','), 'Avea 1,Avea 3,PB 1,PB 2');

console.log('\n3 · El SIMULACRO no escribe una sola fila');
const antes = JSON.stringify(DB.VENTILADORES) + '|' + JSON.stringify(DB.STOCK_EQUIPOS) + '|' + JSON.stringify(DB.MOVIMIENTOS_VM);
_mudo = true; const inf = inventarioReconciliarSIMULACRO(); _mudo = false;
si('la planilla quedó idéntica', JSON.stringify(DB.VENTILADORES) + '|' + JSON.stringify(DB.STOCK_EQUIPOS) + '|' + JSON.stringify(DB.MOVIMIENTOS_VM) === antes);
si('el informe dice cuántos se dan de alta', /SE DAN DE ALTA \(\d+\)/.test(inf));
si('…y nombra los que se dan de baja', /Vela 9/.test(inf) && /PB 980/.test(inf) && /Carina/.test(inf));
si('…y avisa que los de sala quedan en Pasillo', /PASILLO/.test(inf));

console.log('\n4 · La reconciliación real');
_mudo = true; inventarioReconciliarCONFIRMAR(); _mudo = false;
const act = activos().filter(x => !/mr850/i.test(x.NOMBRE));
eq('quedan activos los 26 del papel', act.length, 26);
eq('…y son exactamente ésos', nombres(act), real.map(x => x.nombre).sort().join(', '));
eq('los que sobraban quedaron DE BAJA, no borrados', nombres(debaja()), 'Carina, MR850 (cama 12), Mek 9, PB 980, Vela 9');
si('siguen en la hoja (nada se eliminó)', DB.VENTILADORES.length >= 26 + 5);
eq('ninguno quedó clavado en una cama', activos().filter(x => x.UBIC_TIPO === 'CAMA').length, 0);
eq('los 20 de sala están en Pasillo', activos().filter(x => x.UBIC_TIPO === 'PASILLO').length, 20);
eq('y los 6 restantes en bodega', act.filter(x => x.UBIC_TIPO === 'BODEGA').length, 6);
si('la baja dejó su movimiento con el motivo', DB.MOVIMIENTOS_VM.some(m => m.HACIA === 'BAJA DE INVENTARIO' && /inventario de la unidad/.test(String(m.MOTIVO))));
si('el que ya estaba de baja no se volvió a dar de baja', DB.MOVIMIENTOS_VM.filter(m => m.ID_VM === 'v9').length === 0);

console.log('\n5 · Las bases calefactoras pasan a cantidad (punto 6 del brainstorm)');
const bases = DB.STOCK_EQUIPOS.filter(x => /mr850|calefactora/i.test(String(x.NOMBRE)));
eq('una sola entrada de stock', bases.length, 1);
eq('…de cuatro', bases[0] && bases[0].CANTIDAD, 4);
eq('la que estaba con nombre propio quedó de baja', (DB.VENTILADORES.find(x => x.ID_VM === 'v8') || {}).ACTIVO, false);
const capn = DB.STOCK_EQUIPOS.filter(x => /capn/i.test(String(x.NOMBRE)));
eq('los capnógrafos suman los 9 del papel', capn.reduce((n, x) => n + (parseInt(x.CANTIDAD, 10) || 0), 0), 9);

// Diego, 14-sep: «ocupé 2, uno en la cama 5 y otro en la 16, pero Nihon, no
// Dräger; así que en teoría [los Dräger] no se ocupan».
console.log('\n5b · Los 2 capnógrafos puestos son los NIHON, y los Dräger siguen de baja');
const nihon = DB.STOCK_EQUIPOS.find(x => /nihon/i.test(String(x.NOMBRE)));
const drager = DB.STOCK_EQUIPOS.find(x => /capn/i.test(String(x.NOMBRE)) && /dräger|drager/i.test(String(x.NOMBRE)));
eq('el Nihon queda repartido en las camas 5 y 16', JSON.stringify(JSON.parse(nihon.ASIGNACION_JSON || '{}')), '{"5":1,"16":1}');
eq('…y quedan 3 disponibles de los 5', 5 - Object.keys(JSON.parse(nihon.ASIGNACION_JSON || '{}')).length, 3);
eq('el Dräger NO se reparte', String(drager.ASIGNACION_JSON || ''), '');
eq('…y sigue «De baja», como estaba', drager.ESTADO, 'De baja');

console.log('\n6 · Correrla dos veces no cambia nada');
const foto = JSON.stringify(DB.VENTILADORES) + '|' + JSON.stringify(DB.STOCK_EQUIPOS);
const movs = DB.MOVIMIENTOS_VM.length;
_mudo = true; inventarioReconciliarCONFIRMAR(); _mudo = false;
si('la planilla quedó igual', JSON.stringify(DB.VENTILADORES) + '|' + JSON.stringify(DB.STOCK_EQUIPOS) === foto);
eq('…y no se anotó ningún movimiento nuevo', DB.MOVIMIENTOS_VM.length, movs);

console.log('\n7 · La lista por cama ve el inventario nuevo');
CONFIG.NUM_CAMAS = '18';
const g = call('GET_GRILLA_EQUIPOS', {});
si('responde', g.ok);
const G = g.data || {};
eq('la flota del selector son los 19 invasivos (15 en sala + 4 en bodega)', (G.flota || []).length, 19);
eq('pasillo trae los 20 de sala', (G.pasillo || []).length, 20);
const bod = G.bodega || {};
eq('bodega: 4 VMI, 1 VNI, 1 CNAF', (bod.VM || []).length + '/' + (bod.VNI || []).length + '/' + (bod.CNAF || []).length, '4/1/1');
si('las bases calefactoras salen como stock', (bod.stock || []).some(s => /mr850|calefactora/i.test(s.nombre) && s.cantidad === 4));
const sNihon = (bod.stock || []).find(s => /nihon/i.test(s.nombre)) || {};
eq('el capnógrafo Nihon se ve 2 en uso y 3 libres', sNihon.enUso + '/' + sNihon.disponible, '2/3');
si('ningún equipo dado de baja aparece', !JSON.stringify(G).includes('PB 980') && !JSON.stringify(G).includes('Vela 9'));

console.log(fails.length ? `\n❌ ${fails.length} FALLOS: ${fails.join(' | ')}` : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
