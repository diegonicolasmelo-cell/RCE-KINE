// equipos_categoria.js — VM · VNI · CNAF · DISPOSITIVOS DE APOYO (ago-2026).
//
// CORRECCIÓN DE DIEGO a un supuesto mío: los 33 equipos NO son todos
// «ventiladores». Son tres cosas distintas y se comportan distinto:
//
//   VM    · soporte invasivo. Es parte de la sala y OCUPA la cama.
//   VNI   · V60, Carina. Soporte, pero va al PACIENTE: «queda en una cama
//           pero no vive ahí».
//   CNAF  · Airvo 2. Igual que VNI: del paciente.
//   APOYO · «dispositivos de apoyo» (nombre elegido por Diego): MR850,
//           capnógrafos, Aerogen. NO son soporte, acompañan.
//
// Esto además arregla un problema conocido desde que se cargó el inventario
// real: las camas con VM + V60/Airvo mostraban UN SOLO chip y el otro equipo
// desaparecía de la vista, porque todos competían por el mismo casillero.
//
// La columna CATEGORIA es nueva; los equipos ya cargados la traen vacía y se
// DERIVA del modelo, así el inventario se clasifica solo sin reescribirlo.
//
// Uso: node build/checks/equipos_categoria.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };
const ok_ = (l, c) => { console.log((c ? '✅' : '❌') + ' ' + l); if (!c) fails.push(l); };

const DB = { VENTILADORES: [], CAMAS_ESTADO: [], MOVIMIENTOS_VM: [] };
global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoActualizar = (h, c, id, ch) => { const r = global.repoBuscarPorId(h, c, id); if (r) Object.assign(r, ch); return !!r; };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoUpsert = (h, c, id, o) => { const r = global.repoBuscarPorId(h, c, id); if (r) { Object.assign(r, o); return 'actualizar'; } global.repoInsertar(h, o); return 'crear'; };
global.repoLeerFiltrado = (h, col, p) => (DB[h] || []).filter(r => p(r[col]));
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.conLock = fn => fn(); let _n = 0; global.uid = p => p + '_' + (++_n); global.leerConfig = (k, d) => d;
global.hoyISO = () => '2026-08-04'; global.ahoraTS = () => '2026-08-04 10:00:00';
global._tz = () => 'America/Santiago';
global.Utilities = { getUuid: () => 'u1', formatDate: () => '2026-08-04' };
global.SpreadsheetApp = { flush: () => {} };
global.ok = d => ({ ok: true, data: d }); global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE' };
global.calcularPI = () => 60; global.generarCodPaciente = () => 'P'; global._codUnico = c => c;
global._rutNormal = r => String(r || ''); global._agregarHitoInterno = () => {};
global._apacheNorm = x => x;
eval(['infra_fechas.gs', 'svc_stats.gs', 'svc_equipos.gs', 'svc_camas.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

/* ══ 1 · La categoría se deduce del inventario YA cargado ═══════════════ */
console.log('\n1 · El inventario existente se clasifica solo');
const casos = [
  [{ NOMBRE: 'Servo U',     MODELO: 'Servo-u',  MARCA: 'Maquet' },              'VM'],
  [{ NOMBRE: 'Mek 4',       MODELO: '',         MARCA: 'Mekics' },              'VM'],
  [{ NOMBRE: 'PB 980',      MODELO: '980',      MARCA: 'Puritan Bennett' },     'VM'],
  [{ NOMBRE: 'V60 Nº1',     MODELO: 'V60',      MARCA: 'Philips', OBS: 'VNI' }, 'VNI'],
  [{ NOMBRE: 'Carina',      MODELO: 'Carina',   MARCA: 'Dräger',  OBS: 'VNI' }, 'VNI'],
  [{ NOMBRE: 'Airvo2 Nº2',  MODELO: 'Airvo 2',  MARCA: 'Fisher & Paykel', OBS: 'CNAF' }, 'CNAF'],
  [{ NOMBRE: 'MR850',       MODELO: 'MR850',    MARCA: 'Fisher & Paykel' },     'APOYO'],
  [{ NOMBRE: 'Aerogen Pro-X', MODELO: 'Pro-X',  MARCA: 'Aerogen' },             'APOYO'],
  [{ NOMBRE: 'Capnógrafo 1', MODELO: '',        MARCA: 'Nihon Kohden' },        'APOYO'],
];
let bien = 0;
casos.forEach(([x, esperado]) => { const g = _vmCategoria(x);
  if (g === esperado) bien++; else console.log('   ❌ ' + x.NOMBRE + ' → ' + g + ' (esperado ' + esperado + ')'); });
eq('los 9 equipos representativos se clasifican bien', bien, casos.length);

// Las decisiones textuales de Diego, explícitas:
eq('Carina es VNI', _vmCategoria({ NOMBRE: 'Carina', MODELO: 'Carina' }), 'VNI');
eq('MR850 es dispositivo de apoyo', _vmCategoria({ NOMBRE: 'MR850', MODELO: 'MR850' }), 'APOYO');
ok_('solo el VM invasivo ocupa la cama',
  _vmEsDeCama('VM') && !_vmEsDeCama('VNI') && !_vmEsDeCama('CNAF') && !_vmEsDeCama('APOYO'));
// Una categoría escrita a mano MANDA sobre la deducción.
eq('la categoría guardada gana sobre la deducción',
  _vmCategoria({ NOMBRE: 'Equipo raro', MODELO: 'XYZ', CATEGORIA: 'apoyo' }), 'APOYO');

/* ══ 2 · La cama con VM + V60 muestra LOS DOS ══════════════════════════ */
console.log('\n2 · La cama con varios equipos ya no pierde ninguno');
DB.VENTILADORES = [
  { ID_VM: 'v1', NOMBRE: 'Servo U',    MODELO: 'Servo-u', ACTIVO: 'TRUE', UBIC_TIPO: 'CAMA', UBIC_DETALLE: '3', ESTADO: 'Operativo' },
  { ID_VM: 'v2', NOMBRE: 'V60 Nº1',    MODELO: 'V60',     ACTIVO: 'TRUE', UBIC_TIPO: 'CAMA', UBIC_DETALLE: '3', ESTADO: 'Operativo', OBS: 'VNI' },
  { ID_VM: 'v3', NOMBRE: 'Airvo2 Nº3', MODELO: 'Airvo 2', ACTIVO: 'TRUE', UBIC_TIPO: 'CAMA', UBIC_DETALLE: '3', ESTADO: 'Operativo', OBS: 'CNAF' },
  { ID_VM: 'v4', NOMBRE: 'MR850',      MODELO: 'MR850',   ACTIVO: 'TRUE', UBIC_TIPO: 'CAMA', UBIC_DETALLE: '3', ESTADO: 'Operativo' },
];
DB.CAMAS_ESTADO = [{ ID_CAMA: '3', OCUPADA: 'TRUE', NOMBRE: 'Paciente', FECHA_INGRESO: '2026-08-01', VIA_AEREA: 'TOT', SOPORTE: 'VM' }];
const cama = obtenerTodasLasCamas().data[0];
eq('el casillero de la cama lo ocupa el VM', cama.VM_TAG, 'Servo U');
eq('los otros TRES van como equipos del paciente', (cama.EQUIPOS_PACIENTE || []).length, 3);
ok_('…con su categoría cada uno',
  (cama.EQUIPOS_PACIENTE || []).map(x => x.c).sort().join(',') === 'APOYO,CNAF,VNI');

/* ══ 3 · La categoría se persiste al guardar ════════════════════════════ */
console.log('\n3 · Al guardar, la categoría queda escrita');
DB.VENTILADORES = [];
guardarVentilador({ nombre: 'V60 Nº9', marca: 'Philips', modelo: 'V60', ubicTipo: 'BODEGA' }, { firma: 'DMV' });
eq('un V60 nuevo se guarda como VNI sin que nadie lo diga', DB.VENTILADORES[0].CATEGORIA, 'VNI');
guardarVentilador({ nombre: 'Cosa nueva', modelo: 'ZZZ', ubicTipo: 'BODEGA', categoria: 'apoyo' }, { firma: 'DMV' });
eq('y si el formulario la manda, esa manda', DB.VENTILADORES[1].CATEGORIA, 'APOYO');

/* ══ 4 · Esquema y UI ══════════════════════════════════════════════════ */
console.log('\n4 · Esquema y tarjeta de cama');
const esq = fs.readFileSync(path.join(v2, 'esquema.gs'), 'utf8');
const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
ok_('CATEGORIA existe en VENTILADORES', /\['CATEGORIA','texto'\]/.test(esq));
ok_('…y va AL FINAL de la lista (la reparación reescribe encabezados)',
  /\['FECHA_MANT_PROX','texto'\][\s\S]{0,900}\['CATEGORIA','texto'\],\s*\]\}/.test(esq));
ok_('la tarjeta de cama pinta los equipos del paciente', /class="eqtag/.test(idx));
ok_('…con estilo propio por categoría',
  /\.eqtag\.eq-vni\{/.test(idx) && /\.eqtag\.eq-cnaf\{/.test(idx) && /\.eqtag\.eq-apoyo\{/.test(idx));
ok_('el chip explica que el equipo es del paciente, no de la cama',
  /se asigna a la persona/.test(idx));

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ equipos_categoria OK');
process.exit(fails.length ? 1 : 0);
