// apache.js — Guardia del APACHE II (v4.1): entero 0-71 opcional, capturado al
// INGRESO (campo junto a Charlson, viaja transitorio como PAC_RUT y persiste en
// la CAMA), sincronizado desde la evolución, y ofrecido en el EGRESO como
// última oportunidad SOLO si quedó vacío. En el archivo, el valor de la cama
// manda; el del egreso entra únicamente cuando no había.
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');

/* ── Parte 1: servicio (node puro) ── */
const DB = {};
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
global.repoEliminarDonde = (h, fn) => { DB[h] = (DB[h] || []).filter(r => !fn(r)); };
global.repoActualizarDonde = (h, fil, fn) => (DB[h] || []).forEach(r => { if (fil(r)) Object.assign(r, fn(r)); });
global.repoUpsert = (h, campo, id, obj) => {
  const r = global.repoBuscarPorId(h, campo, id);
  if (r) { Object.assign(r, obj); return 'actualizar'; }
  global.repoInsertar(h, obj); return 'crear';
};
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.conLock = fn => fn();
global.uid = p => p + '_' + Math.random().toString(36).slice(2, 8);
global.hoyISO = () => '2026-07-29';
global.ahoraTS = () => '2026-07-29 16:30';
global.diasEntre = () => 3;
global.validarPayloadIngreso = () => [];
global.generarCodPaciente = () => 'PAC-001';
global._codUnico = c => c;
global._rutNormal = r => String(r || '');
global._agregarHitoInterno = h => h;
global._limpiarCamaInterno = () => {};
global.calcularPI = () => '';
global.SpreadsheetApp = { flush: () => {} };
global.Utilities = { getUuid: () => 'uuid-1' };
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO', NO_ENCONTRADO: 'NO_ENCONTRADO' };

eval(fs.readFileSync(path.join(v2, 'svc_camas.gs'), 'utf8'));

const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

// 1. Normalización
eq('vacío → vacío', _apacheNorm(''), '');
eq('25 válido', _apacheNorm('25'), 25);
eq('0 y 71 son válidos (bordes)', _apacheNorm(0) === 0 && _apacheNorm(71) === 71, true);
eq('72 fuera de rango → vacío', _apacheNorm(72), '');
eq('negativo → vacío', _apacheNorm(-3), '');
eq('decimal «12.5» → vacío (no se trunca a 12)', _apacheNorm('12.5'), '');
eq('texto → vacío', _apacheNorm('alto'), '');

// 2. Ingreso directo con APACHE
DB.CAMAS_ESTADO = [{ ID_CAMA: '1', OCUPADA: false }];
let r = ingresarPaciente({ idCama: '1', nombre: 'Test', apache2: '18' }, { firma: 'DM' });
eq('ingreso ok', r.ok, true);
eq('APACHE2 queda en la cama', DB.CAMAS_ESTADO[0].APACHE2, 18);

// 3. Egreso: el valor de la CAMA manda sobre el del formulario de egreso
Object.assign(DB.CAMAS_ESTADO[0], { DIA_ESTADIA: 3, DIAS_VM: 0, DIAS_VA: 0, TIMELINE_JSON: '[]' });
DB.EVOLUCIONES = []; DB.ARCHIVO_PACIENTES = [];
r = darAltaPaciente({ idCama: '1', motivoEgreso: 'Traslado a sala', destinoEgreso: 'Medicina', apache2: '55' }, { firma: 'DM' });
eq('egreso ok', r.ok, true);
eq('archivo conserva el APACHE de la cama (no el tardío)', DB.ARCHIVO_PACIENTES[0].APACHE2, 18);

// 4. Egreso SIN apache previo: el del egreso entra como última oportunidad
DB.CAMAS_ESTADO = [{ ID_CAMA: '2', OCUPADA: 'TRUE', PATIENT_ID: 'p2', NOMBRE: 'Sin Apache',
  DIA_ESTADIA: 2, DIAS_VM: 0, DIAS_VA: 0, TIMELINE_JSON: '[]', APACHE2: '' }];
r = darAltaPaciente({ idCama: '2', motivoEgreso: 'Alta a domicilio', destinoEgreso: 'Domicilio', apache2: '22' }, { firma: 'DM' });
eq('sin previo → el del egreso queda', DB.ARCHIVO_PACIENTES[1].APACHE2, 22);
DB.CAMAS_ESTADO = [{ ID_CAMA: '3', OCUPADA: 'TRUE', PATIENT_ID: 'p3', DIA_ESTADIA: 1, DIAS_VM: 0, DIAS_VA: 0, TIMELINE_JSON: '[]' }];
r = darAltaPaciente({ idCama: '3', motivoEgreso: 'x', destinoEgreso: 'y', apache2: '99' }, { firma: 'DM' });
eq('egreso con 99 (inválido) → archivo queda vacío, no basura', DB.ARCHIVO_PACIENTES[2].APACHE2, '');

/* ── Parte 2: UI (Chromium) ── */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window._ll = [];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) { window._ll.push({ a, d }); setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(v2, 'index.html'));
  await p.waitForTimeout(500);

  // Campo en el formulario, junto a Charlson, con rango 0-71
  const F = await p.evaluate(() => {
    const ap = $('fApache');
    return { existe: !!ap, min: ap?.min, max: ap?.max,
      juntoACharlson: !!($('fCharlson') && ap && $('fCharlson').closest('.row') === ap.closest('.row')) };
  });
  eq('campo fApache existe con rango 0-71', F.existe && F.min === '0' && F.max === '71', true);
  eq('vive en la misma fila que Charlson (datos del paciente)', F.juntoACharlson, true);

  // fillCama trae el APACHE del episodio
  const FC = await p.evaluate(() => {
    $('kf').reset();
    fillCama({ ID_CAMA: '3', APACHE2: 17, FECHA_INGRESO: '2026-07-27' }, '2026-07-29');
    return $('fApache').value;
  });
  eq('fillCama puebla el APACHE del episodio', FC, '17');

  // guardar(): 99 bloquea ANTES de llamar al servidor; 25 viaja como PAC_APACHE2
  const G = await p.evaluate(async () => {
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    // firma y VA obligatorias del guardado + saltar el aviso de transición
    const opt = document.createElement('option'); opt.value = 'Klgo. Test'; opt.textContent = 'Klgo. Test';
    $('fFirma').appendChild(opt); $('fFirma').value = 'Klgo. Test';
    $('fVA').value = 'Natural'; _transAvisoOk = true;
    window._ll.length = 0;
    $('fApache').value = '99'; guardar();
    await new Promise(r2 => setTimeout(r2, 60));
    const bloqueado = !_ll.some(x => x.a === 'GUARDAR_EVOLUCION');
    $('fApache').value = '25'; _transAvisoOk = true; guardar();
    await new Promise(r2 => setTimeout(r2, 60));
    const call = _ll.find(x => x.a === 'GUARDAR_EVOLUCION');
    return { bloqueado, viaja: call ? call.d.PAC_APACHE2 : null };
  });
  eq('APACHE 99 bloquea el guardado en el cliente', G.bloqueado, true);
  eq('APACHE 25 viaja como PAC_APACHE2', G.viaja, '25');

  // Egreso: sin APACHE → se ofrece el campo; con APACHE → solo se informa
  const E = await p.evaluate(() => {
    DB = [
      { ID_CAMA: '5', OCUPADA: true, NOMBRE: 'Sin Apache', APACHE2: '' },
      { ID_CAMA: '6', OCUPADA: true, NOMBRE: 'Con Apache', APACHE2: 31 },
    ];
    const r = {};
    egreso('5');
    r.sinPrevio = { box: !$('egApacheBox').classList.contains('hidden'), info: $('egApacheInfo').classList.contains('hidden') };
    cerrarEgreso();
    egreso('6');
    r.conPrevio = { box: $('egApacheBox').classList.contains('hidden'), info: !$('egApacheInfo').classList.contains('hidden'), val: $('egApacheVal').textContent };
    cerrarEgreso();
    return r;
  });
  eq('egreso sin APACHE previo → ofrece el campo', E.sinPrevio.box && E.sinPrevio.info, true);
  eq('egreso con APACHE previo → solo informa el valor', E.conPrevio.box && E.conPrevio.info && E.conPrevio.val === '31', true);

  console.log(errs.length ? ('\nERRORES JS:\n' + errs.join('\n')) : '\nsin errores JS');
  await b.close();
  console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
  process.exit(fails.length || errs.length ? 1 : 0);
})();
