// pve_superada_sin_extubar.js — UNA PVE SUPERADA NO SIEMPRE TERMINA EN
// EXTUBACIÓN (tanda 2a, sep-2026 · PRD_PVE_SUPERADA_SIN_EXTUBAR.md).
//
// 🔴 DE DÓNDE SALE. Diego, 2-sep-2026: «PVE superada sin extubar SÍ existe».
// El formulario asumía que «superada» ERA «se extubó»: pedía la hora y
// `_extOcurrio()` devolvía verdadero. Eso obligaba a mentir (inventar hora,
// marcar fracasada o dejar la PVE en No y perder la prueba).
//
// LO QUE FIJA (las cuatro promesas del PRD):
//  1. Una evolución guardada ANTES (sin PVE_SUP_SIN_EXT) se lee igual que hoy.
//  2. Ninguna cifra de extubaciones cambia: REM/stats/entrega leen EXT_OCURRIO
//     y la fila «superada sin extubar» NO lo lleva.
//  3. Volver a «Sí, se extubó» no deja residuos (razón vacía).
//  4. La razón es obligatoria, en pantalla Y en el servidor; «Otra» exige detalle.
//  Y: el texto lo narra igual en cliente y servidor (paridad); la PVE sí cuenta
//  como superada en la estadística, mostrada aparte.
//
// Uso: node build/checks/pve_superada_sin_extubar.js (requiere playwright-core)
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);
const lee = f => fs.readFileSync(path.join(v2, f), 'utf8');

/* ══ 1 · ESQUEMA ═══════════════════════════════════════════════════════ */
console.log('1 · Las dos columnas van AL FINAL de EVOLUCIONES');
const esq = lee('esquema.gs');
si('PVE_SUP_SIN_EXT y PVE_SUP_SIN_EXT_RAZ existen, después de ANOTACIONES_JSON',
  /\['ANOTACIONES_JSON','json'\],[\s\S]{0,400}?\['PVE_SUP_SIN_EXT','bool'\],\['PVE_SUP_SIN_EXT_RAZ','texto'\]\n\]/.test(esq));
si('testEsquema exige 396 columnas', /TOTAL_COLS\.EVOLUCIONES !== 396/.test(esq));

/* ══ 2 · SERVIDOR: texto, validación, estadística, entrega ══════════════ */
console.log('\n2 · Servidor');
global.esVerdadero = x => x === true || x === 'TRUE' || x === 'true';
global.leerConfig = (k, d) => d;
global.ok = d => ({ ok: true, data: d }); global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global.Utilities = { formatDate: d => d.toISOString().slice(0, 10) };
const DB = {};
global.repoLeerTodos = (h, k, val) => (DB[h] || []).filter(r => k === undefined || String(r[k]) === String(val));
global.repoLeerColumnas = h => (DB[h] || []).slice();
global.repoLeerFiltrado = (h, k, pred) => (DB[h] || []).filter(r => pred(r[k]));
eval(['dominio_texto.gs', 'dominio_validacion.gs', 'svc_stats.gs'].map(lee).join('\n;\n'));

const base = { PVE_VAL: 'si', PVE_RESULTADO: 'superada', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT', PLAN_FIRMA_KINE: 'DMV', ID_CAMA: '1', TURNO_KEY: '2026-09-06-Dia' };
const conExt = Object.assign({}, base, { EXT_OCURRIO: true, EXT_HORA: '11:00', EXT_TIPO: 'protocolo', EXT_PE_MODO: 'CNAF' });
const sinExt = Object.assign({}, base, { PVE_SUP_SIN_EXT: true, PVE_SUP_SIN_EXT_RAZ: 'Pabellón o procedimiento programado', EXT_OCURRIO: false });

const t1 = generarTextoEvolucion(conExt), t2 = generarTextoEvolucion(sinExt);
si('promesa 1 · sin la marca, el texto es el de siempre («progresando a extubación»)', /progresando a extubación a las 11:00 hrs/.test(t1));
si('★ con la marca narra que NO se extubó, con la razón', /Se realiza PVE con resultado superado\. No se extuba por pabellón o procedimiento programado; mantiene ventilación mecánica\./.test(t2));
si('…y no dice «progresando a extubación»', !/progresando a extubación/.test(t2));

eq('promesa 4 · sin razón el servidor rechaza', validarPayloadEvolucion(Object.assign({}, sinExt, { PVE_SUP_SIN_EXT_RAZ: '' })).some(m => /por qué no se extubó/.test(m)), true);
eq('«Otra» pelada también', validarPayloadEvolucion(Object.assign({}, sinExt, { PVE_SUP_SIN_EXT_RAZ: 'Otra' })).some(m => /Otra/.test(m)), true);
eq('«Otra: detalle» pasa', validarPayloadEvolucion(Object.assign({}, sinExt, { PVE_SUP_SIN_EXT_RAZ: 'Otra: aseo quirúrgico' })).length, 0);
eq('marca + extubación a la vez se rechaza', validarPayloadEvolucion(Object.assign({}, sinExt, { EXT_OCURRIO: true })).some(m => /no puede venir marcada una extubación/.test(m)), true);
eq('la fila con extubación de siempre sigue válida', validarPayloadEvolucion(conExt).length, 0);
eq('marca sobre una PVE fracasada se rechaza', validarPayloadEvolucion(Object.assign({}, sinExt, { PVE_RESULTADO: 'frustra' })).some(m => /solo aplica a una PVE superada/.test(m)), true);

// promesa 2 · las cifras de extubación no cambian
DB.EVOLUCIONES = [
  Object.assign({ PATIENT_ID: 'p1', FECHA: '2026-09-06', TURNO: 'Dia', TURNO_KEY: '2026-09-06-Dia' }, conExt),
  Object.assign({ PATIENT_ID: 'p2', FECHA: '2026-09-06', TURNO: 'Dia', TURNO_KEY: '2026-09-06-Dia', ID_CAMA: '2' }, sinExt),
  { PATIENT_ID: 'p3', FECHA: '2026-09-06', TURNO: 'Dia', TURNO_KEY: '2026-09-06-Dia', ID_CAMA: '3', PVE_VAL: 'si', PVE_RESULTADO: 'frustra', PVE_FR_MOTIVOS: '["Taquipnea"]', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT', PLAN_FIRMA_KINE: 'DMV' },
];
DB.EVOLUCIONES_ARCHIVO = []; DB.CAMAS_ESTADO = []; DB.PROCEDIMIENTOS = []; DB.REINTUBACIONES = []; DB.ARCHIVO_PACIENTES = [];
const st = obtenerStats('2026-09-01', '2026-09-30');
si('obtenerStats responde', st && st.ok);
const ev = st.data.eventos || {};
eq('★ promesa 2 · extubaciones = 1 (solo la que ocurrió)', ev.extubaciones, 1);
eq('PVE superadas = 2 (la prueba se superó en las dos)', ev.pveSuperadas, 2);
eq('…y la sin extubar se muestra aparte', ev.pveSupSinExt, 1);
eq('PVE frustras = 1', ev.pveFrustras, 1);

const ent = lee('svc_entrega.gs');
si('la entrega dice «PVE superada sin extubar» y lleva la razón', /PVE superada sin extubar/.test(ent) && /PVE_SUP_SIN_EXT_RAZ/.test(ent));
const evo = lee('svc_evoluciones.gs');
si('el guardado borra hora/tipo/soporte PE si viene la marca (candado en la escritura)',
  /if \(esVerdadero\(datos\.PVE_SUP_SIN_EXT\)\) \{\s*datos\.EXT_OCURRIO = false; datos\.EXT_HORA = ''/.test(evo));
si('promesa 3 · sin la marca, la razón se vacía', /datos\.PVE_SUP_SIN_EXT_RAZ = '';/.test(evo));

/* ══ 3 · CLIENTE ═══════════════════════════════════════════════════════ */
const { chromium } = require('playwright-core');
(async () => {
  console.log('\n3 · Pantalla: la pregunta «¿se extubó?» y el candado del cliente');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2, 'index.html'));
  await p.waitForTimeout(600);
  await p.evaluate(() => {
    abrirPanel('1', false, false);
    const va = document.getElementById('fVA'); va.value = 'TOT'; va.dispatchEvent(new Event('change'));
    if (typeof updateVAUI === 'function') updateVAUI();
    if (document.getElementById('fPVEval').value !== 'si') hPVEtoggle('si');
    const r = document.querySelector('input[name="pveRes"][value="superada"]'); r.checked = true; hPVEres();
  });
  await p.waitForTimeout(300);
  const R1 = await p.evaluate(() => ({
    pregunta: !document.getElementById('dPVESupExt').classList.contains('hidden'),
    porDefectoSi: document.querySelector('input[name="pveSupExt"]:checked')?.value,
    extOcurrio: _extOcurrio(), tipo: _extTipo(),
    ramaSi: !document.getElementById('dPVESupExtSi').classList.contains('hidden'),
    selOculto: document.getElementById('fPveSupRaz').classList.contains('hidden'),
  }));
  si('la pregunta aparece con la PVE superada', R1.pregunta);
  eq('por defecto «Sí» — todo sigue igual que hoy', R1.porDefectoSi, 'si');
  eq('…y _extOcurrio sigue diciendo que sí', R1.extOcurrio, true);
  eq('…con tipo protocolo', R1.tipo, 'protocolo');
  si('la rama de la extubación (hora, PE) está visible y la razón escondida', R1.ramaSi && R1.selOculto);

  await p.evaluate(() => {
    document.getElementById('fExtHora').value = '11:30';
    const n = document.querySelector('input[name="pveSupExt"][value="no"]'); n.checked = true; hPveSupExt();
  });
  await p.waitForTimeout(200);
  const R2 = await p.evaluate(() => ({
    extOcurrio: _extOcurrio(), tipo: _extTipo(), sin: _pveSupSinExt(),
    ramaSi: !document.getElementById('dPVESupExtSi').classList.contains('hidden'),
    selVisible: !document.getElementById('fPveSupRaz').classList.contains('hidden'),
    hora: document.getElementById('fExtHora').value,
    razon: _pveSupRazon(),
  }));
  eq('★ con «No» _extOcurrio es FALSO (el candado del PRD)', R2.extOcurrio, false);
  eq('…y _extTipo queda vacío', R2.tipo, '');
  si('la rama de extubación se esconde y aparece la razón', !R2.ramaSi && R2.selVisible);
  eq('la hora de extubación que había se borra', R2.hora, '');
  eq('sin razón todavía', R2.razon, '');

  const R3 = await p.evaluate(() => {
    const s = document.getElementById('fPveSupRaz'); s.value = 'Otra'; hPveSupExt();
    const detVisible = !document.getElementById('fPveSupDet').classList.contains('hidden');
    const razPelada = _pveSupRazon();
    document.getElementById('fPveSupDet').value = 'aseo quirúrgico a las 12';
    const razCompleta = _pveSupRazon();
    s.value = 'Pabellón o procedimiento programado'; hPveSupExt();
    const detOculto = document.getElementById('fPveSupDet').classList.contains('hidden');
    const txt = genTexto();
    return { detVisible, razPelada, razCompleta, detOculto, txt, payloadSin: _pveSupSinExt() };
  });
  si('«Otra» abre el detalle', R3.detVisible);
  eq('«Otra» sin detalle NO vale como razón', R3.razPelada, 'Otra');
  eq('con detalle viaja «Otra: …»', R3.razCompleta, 'Otra: aseo quirúrgico a las 12');
  si('otra razón esconde el detalle', R3.detOculto);
  si('★ el texto del cliente narra igual que el servidor (paridad)',
    /Se realiza PVE con resultado superado\. No se extuba por pabellón o procedimiento programado; mantiene ventilación mecánica\./.test(R3.txt));
  si('…sin «progresando a extubación»', !/progresando a extubación/.test(R3.txt));

  const R4 = await p.evaluate(() => {
    const s = document.querySelector('input[name="pveSupExt"][value="si"]'); s.checked = true; hPveSupExt();
    return { ext: _extOcurrio(), raz: _pveSupRazon(), sel: document.getElementById('fPveSupRaz').value,
      ramaSi: !document.getElementById('dPVESupExtSi').classList.contains('hidden') };
  });
  eq('promesa 3 · volver a «Sí» recupera la extubación', R4.ext, true);
  eq('…y la razón queda vacía (sin residuos)', R4.raz + R4.sel, '');
  si('…con la rama completa de vuelta', R4.ramaSi);

  const R5 = await p.evaluate(() => {
    const n = document.querySelector('input[name="pveSupExt"][value="no"]'); n.checked = true; hPveSupExt();
    window._toasts = []; const _t = window.toast; window.toast = m => { window._toasts.push(m); };
    window._llamadas = 0; const _gs = window.gs; window.gs = () => { window._llamadas++; };
    document.getElementById('fFirma').value = 'DMV';
    try { guardar(); } catch (e) { window._toasts.push('ERR ' + e.message); }
    window.toast = _t; window.gs = _gs;
    return { toasts: window._toasts, llamadas: window._llamadas };
  });
  si('promesa 4 · guardar sin razón avisa y no manda nada', R5.toasts.some(t => /indica por qué/.test(t)) && R5.llamadas === 0);

  eq('sin errores de página', errs.length, 0);
  await b.close();
  console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS:\n' + fails.map(f => '  - ' + f).join('\n') : '\n✅ pve_superada_sin_extubar: todo verde');
  process.exit(fails.length ? 1 : 0);
})();
