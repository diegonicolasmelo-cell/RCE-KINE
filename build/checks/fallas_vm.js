// fallas_vm.js — Guardia del historial de fallas por ventilador + tag en la
// tarjeta de cama (v4). Servicio: descripción obligatoria, foto validada en
// el servidor (mime + tamaño), TODO-O-NADA con Drive, ESTADO='Con falla',
// carpeta creada una sola vez y persistida en CONFIG, historial ordenado.
// Cruce servidor: obtenerTodasLasCamas adjunta VM_TAG/VM_TAG_ESTADO en una
// sola lectura de VENTILADORES. UI: tag visible en la tarjeta (ocupada y
// vacía) con clase .falla, clic → pestaña Ventiladores; vmEditar muestra la
// sección de fallas y carga el historial; vmFallaRegistrar exige descripción.
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');

/* ── Parte 1: servicio (node puro) ── */
const DB = {};
const CONFIG = {};
global.repoLeerTodos = (h, campo, valor) => {
  let filas = (DB[h] || []).slice();
  if (campo !== undefined) filas = filas.filter(r => String(r[campo]) === String(valor));
  return filas;
};
global.repoBuscarPorId = (h, campo, id) =>
  (DB[h] || []).find(r => String(r[campo]) === String(id)) || null;
global.repoActualizar = (h, campo, id, cambios) => {
  const r = global.repoBuscarPorId(h, campo, id);
  if (r) Object.assign(r, cambios);
  return !!r;
};
global.repoInsertar = (h, obj) => { (DB[h] = DB[h] || []).push(obj); return obj; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => (k in CONFIG ? CONFIG[k] : d);
global.escribirConfig = (k, v) => { CONFIG[k] = v; };
global.conLock = fn => fn();
let UIDN = 0;
global.uid = p => p + '_' + String(++UIDN).padStart(6, '0');
global.hoyISO = () => '2026-07-29';
let TSN = 0;
global.ahoraTS = () => '2026-07-29 16:' + String(30 + (TSN++)).padStart(2, '0');
global.diasEntre = () => 1;
global.SpreadsheetApp = { flush: () => {} };
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO', NO_ENCONTRADO: 'NO_ENCONTRADO' };
// Drive simulado: carpeta única; DRIVE_CAIDO simula el fallo al subir.
let DRIVE_CAIDO = false, CARPETAS_CREADAS = 0, ARCHIVOS = [];
const CARPETA = {
  getId: () => 'FOLDER_1',
  createFile: b => {
    if (DRIVE_CAIDO) throw new Error('Drive no disponible');
    ARCHIVOS.push(b); return { getUrl: () => 'https://drive.test/f/' + ARCHIVOS.length };
  },
};
global.DriveApp = {
  getFolderById: id => { if (id === 'FOLDER_1') return CARPETA; throw new Error('carpeta inexistente'); },
  createFolder: n => { CARPETAS_CREADAS++; return CARPETA; },
};
global.Utilities = {
  base64Decode: s => s,
  newBlob: (bytes, mime, nombre) => ({ bytes, mime, nombre }),
};

// svc_stats.gs aporta _statISO; svc_camas.gs, el cruce del tag.
eval(['svc_stats.gs', 'svc_equipos.gs', 'svc_camas.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };
const CTX = { firma: 'D. Melo', email: 'diego@test' };

DB.VENTILADORES = [
  { ID_VM: 'vm1', NOMBRE: 'AVEA-01', ESTADO: 'Operativo', ACTIVO: true, UBIC_TIPO: 'CAMA', UBIC_DETALLE: '3' },
  { ID_VM: 'vm2', NOMBRE: 'PB-840', ESTADO: 'Operativo', ACTIVO: true, UBIC_TIPO: 'BODEGA', UBIC_DETALLE: '' },
  { ID_VM: 'vm3', NOMBRE: 'Viejo', ESTADO: 'Operativo', ACTIVO: false, UBIC_TIPO: 'CAMA', UBIC_DETALLE: '5' },
];
DB.FALLAS_VM = [];

// 1. Validaciones
let r = registrarFallaVM({ idVm: 'vm1', descripcion: '   ' }, CTX);
eq('descripción vacía → rechazada sin escribir', !r.ok && DB.FALLAS_VM.length === 0, true);
r = registrarFallaVM({ idVm: 'nope', descripcion: 'no enciende' }, CTX);
eq('ventilador inexistente → rechazado', r.ok, false);
r = registrarFallaVM({ idVm: 'vm1', descripcion: 'x', fotoB64: 'AAA', fotoMime: 'application/pdf' }, CTX);
eq('archivo no-imagen → rechazado en el SERVIDOR', !r.ok && DB.FALLAS_VM.length === 0 && ARCHIVOS.length === 0, true);

// 2. Todo-o-nada: si Drive falla, NO se escribe la fila ni cambia el estado
DRIVE_CAIDO = true;
r = registrarFallaVM({ idVm: 'vm1', descripcion: 'alarma de presión', fotoB64: 'AAA', fotoMime: 'image/jpeg' }, CTX);
eq('Drive caído → error y CERO filas (todo-o-nada)',
   !r.ok && DB.FALLAS_VM.length === 0 && DB.VENTILADORES[0].ESTADO === 'Operativo', true);
DRIVE_CAIDO = false;

// 3. Registro sin foto
r = registrarFallaVM({ idVm: 'vm1', descripcion: 'No entrega volumen en ACVC' }, CTX);
eq('registro sin foto ok', r.ok, true);
const f1 = DB.FALLAS_VM[0];
eq('fila completa (nombre, fecha, firma, sin foto)',
   f1.NOMBRE_VM === 'AVEA-01' && f1.FECHA === '2026-07-29' && f1.FIRMA === 'D. Melo' && f1.FOTO_URL === '' && f1.AUTOR_EMAIL === 'diego@test', true);
eq('el equipo queda «Con falla»', DB.VENTILADORES[0].ESTADO, 'Con falla');

// 4. Registro con foto: sube a Drive, guarda URL, crea la carpeta UNA vez
r = registrarFallaVM({ idVm: 'vm2', descripcion: 'Pantalla apagada', fotoB64: 'BBBB', fotoMime: 'image/jpeg' }, CTX);
eq('registro con foto ok y URL en la fila', r.ok && /drive\.test/.test(DB.FALLAS_VM[1].FOTO_URL), true);
eq('carpeta creada y persistida en CONFIG', CARPETAS_CREADAS === 1 && CONFIG.FALLAS_FOTOS_FOLDER === 'FOLDER_1', true);
registrarFallaVM({ idVm: 'vm2', descripcion: 'Sigue apagada', fotoB64: 'CC', fotoMime: 'image/png' }, CTX);
eq('segunda foto REUTILIZA la carpeta (no crea otra)', CARPETAS_CREADAS, 1);
eq('foto demasiado grande → rechazada',
   registrarFallaVM({ idVm: 'vm1', descripcion: 'x', fotoB64: 'A'.repeat(6000001), fotoMime: 'image/jpeg' }, CTX).ok, false);

// 5. Historial: más reciente primero, respeta el límite
DB.FALLAS_VM.push({ ID_FALLA: 'F_viejo', ID_VM: 'vm2', TIMESTAMP: '2026-07-01 08:00', FECHA: '2026-07-01', DESCRIPCION: 'antigua', FOTO_URL: '', FIRMA: '' });
r = obtenerFallasVM('vm2');
eq('historial solo del equipo pedido', r.data.fallas.every(x => x.desc !== 'No entrega volumen en ACVC'), true);
eq('orden: la más reciente primero', r.data.fallas[0].desc === 'Sigue apagada' && r.data.fallas[r.data.fallas.length - 1].desc === 'antigua', true);
eq('límite respetado', obtenerFallasVM('vm2', 1).data.fallas.length, 1);

// 6. Cruce VM_TAG en obtenerTodasLasCamas (una sola lectura, solo ACTIVO+CAMA)
DB.CAMAS_ESTADO = [
  { ID_CAMA: '3', OCUPADA: 'TRUE', NOMBRE: 'Paciente X', FECHA_INGRESO: '2026-07-25' },
  { ID_CAMA: '5', OCUPADA: false },
  { ID_CAMA: '7', OCUPADA: false },
];
r = obtenerTodasLasCamas();
const porCama = {}; r.data.forEach(c => { porCama[c.ID_CAMA] = c; });
eq('cama 3 trae el tag del ventilador asignado', porCama['3'].VM_TAG === 'AVEA-01' && porCama['3'].VM_TAG_ESTADO === 'Con falla', true);
eq('ventilador INACTIVO no tagea (cama 5 limpia)', porCama['5'].VM_TAG, '');
eq('cama sin ventilador → tag vacío', porCama['7'].VM_TAG, '');

/* ── Parte 2: UI (Chromium) ── */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window._ll = [];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) {
        window._ll.push({ a, d });
        const data = a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} }
          : a === 'GET_FALLAS_VM' ? { fallas: [{ id: 'f1', fecha: '2026-07-28', desc: 'No entrega volumen', foto: 'https://drive.test/f/1', firma: 'D. Melo' }], total: 1 }
          : a === 'GET_VENTILADORES' ? []
          : null;
        setTimeout(() => okF({ ok: true, data }), 5);
      }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(v2, 'index.html'));
  await p.waitForTimeout(500);

  // Tag en las tarjetas: ocupada, vacía con falla, y cama sin ventilador
  const T = await p.evaluate(() => {
    DB = [
      { ID_CAMA: '1', OCUPADA: true, NOMBRE: 'Paciente X', FECHA_INGRESO: '2026-07-25', VM_TAG: 'AVEA-01', VM_TAG_ESTADO: 'Operativo', TIMELINE: [] },
      { ID_CAMA: '2', OCUPADA: false, VM_TAG: 'PB-840', VM_TAG_ESTADO: 'Con falla' },
      { ID_CAMA: '3', OCUPADA: false },
    ];
    EVOS_DIA = []; EVO_SET = new Set();
    renderGrid();
    const tags = [...document.querySelectorAll('#bedGrid .vmtag')];
    return {
      n: tags.length,
      txt: tags.map(t => t.textContent.trim()).join('|'),
      fallaCls: tags.map(t => t.classList.contains('falla') ? 1 : 0).join(''),
    };
  });
  eq('tag en tarjeta ocupada Y vacía (la cama sin VM no)', T.n, 2);
  eq('nombre del equipo en el tag', T.txt, '🔧 AVEA-01|🔧 PB-840');
  eq('estado «Con falla» pinta el tag en rojo', T.fallaCls, '01');

  const C = await p.evaluate(() => {
    document.querySelector('#bedGrid .vmtag').click();
    return typeof ATAB !== 'undefined' ? ATAB : '';
  });
  eq('clic en el tag lleva a la pestaña Ventiladores', C, 'V');

  // vmEditar muestra la sección de fallas y carga el historial
  const E = await p.evaluate(async () => {
    VM_ALL = [{ id: 'vm1', nombre: 'AVEA-01', estado: 'Operativo' }];
    window._ll.length = 0;
    vmEditar('vm1');
    await new Promise(r2 => setTimeout(r2, 60));
    return {
      visible: !$('vmFallaSec').classList.contains('hidden'),
      pidio: _ll.some(x => x.a === 'GET_FALLAS_VM' && x.d.idVm === 'vm1'),
      lista: $('vmFallasLista').textContent,
    };
  });
  eq('vmEditar muestra la sección de fallas', E.visible, true);
  eq('…y pide GET_FALLAS_VM del equipo', E.pidio, true);
  eq('historial renderizado con fecha, texto y firma',
     /2026-07-28/.test(E.lista) && /No entrega volumen/.test(E.lista) && /D\. Melo/.test(E.lista), true);

  const N = await p.evaluate(() => { vmNuevo(); return $('vmFallaSec').classList.contains('hidden'); });
  eq('vmNuevo OCULTA la sección (no hay equipo aún)', N, true);

  // vmFallaRegistrar: sin descripción NO llama; con descripción llama con el payload
  const R = await p.evaluate(async () => {
    VM_ALL = [{ id: 'vm1', nombre: 'AVEA-01', estado: 'Operativo' }];
    vmEditar('vm1');
    await new Promise(r2 => setTimeout(r2, 40));
    window._ll.length = 0;
    $('vmFallaDesc').value = '   ';
    await vmFallaRegistrar();
    const sinDesc = _ll.filter(x => x.a === 'REGISTRAR_FALLA_VM').length;
    $('vmFallaDesc').value = 'Alarma de presión alta continua';
    await vmFallaRegistrar();
    await new Promise(r2 => setTimeout(r2, 60));
    const con = _ll.find(x => x.a === 'REGISTRAR_FALLA_VM');
    return { sinDesc, payload: con ? con.d : null, estado: $('vmfEstado').value, limpio: $('vmFallaDesc').value };
  });
  eq('sin descripción NO se llama al servidor', R.sinDesc, 0);
  eq('con descripción viaja {idVm, descripcion} sin foto',
     R.payload && R.payload.idVm === 'vm1' && R.payload.descripcion === 'Alarma de presión alta continua' && !('fotoB64' in R.payload), true);
  eq('tras registrar: estado «Con falla» y campo limpio', R.estado === 'Con falla' && R.limpio === '', true);

  console.log(errs.length ? ('\nERRORES JS:\n' + errs.join('\n')) : '\nsin errores JS');
  await b.close();
  console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
  process.exit(fails.length || errs.length ? 1 : 0);
})();
