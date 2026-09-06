// plantillas_evolucion.js — PLANTILLAS DE EVOLUCIÓN, MODO CHIPS (tanda 3,
// sep-2026 · PRD_PLANTILLAS_EVOLUCION.md). Diego, 5-sep: «la selección de
// plantilla… como chips, por mientras».
//
// LO QUE FIJA (las promesas del PRD):
//  1. Quien no configure nada no pierde nada: sin catálogo la barra no existe
//     y el texto es EXACTAMENTE el del motor; con catálogo, la sugerida sale
//     del caso del turno y se rellena sin huecos ni «undefined».
//  2. La firma no la cambia la plantilla.
//  3. El texto escrito por una persona no se pisa: aplicar sobre texto tocado
//     o guardado pregunta, y sin un sí no toca nada.
//  4. Sin cambios en EVOLUCIONES: la hoja PLANTILLAS_EVOLUCION es un catálogo
//     aparte.
//  5. Cliente y servidor hablan la misma lista de comodines y de casos; un
//     comodín desconocido se rechaza en los dos lados (lección TrakCare).
//  Y las reglas de configuración de Diego (4-sep): las de la UNIDAD las
//  publica solo coordinación; editar la de otro crea copia propia; nada se
//  borra (se retira); las 13 de la unidad vienen sembradas.
//
// Uso: node build/checks/plantillas_evolucion.js (requiere playwright-core)
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);
const lee = f => fs.readFileSync(path.join(v2, f), 'utf8');
const idx = lee('index.html');

/* ══ 1 · SERVIDOR ═══════════════════════════════════════════════════════ */
console.log('1 · Servidor: catálogo, reglas y candado de coordinación');
global.esVerdadero = x => x === true || x === 'TRUE' || x === 'true';
global.ok = d => ({ ok: true, data: d }); global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_AUTORIZADO: 'NA', NO_ENCONTRADO: 'NE' };
global.conLock = fn => fn(); let _u = 0; global.uid = p => p + '_' + (++_u);
global.ahoraTS = () => '2026-09-06 10:00:00'; global.console = console;
const DB = { PLANTILLAS_EVOLUCION: [] };
global.repoLeerTodos = (h, k, val) => (DB[h] || []).filter(r => k === undefined || String(r[k]) === String(val)).map(r => Object.assign({}, r));
global.repoInsertarVarios = (h, l) => { l.forEach(o => DB[h].push(Object.assign({}, o))); };
global.repoBuscarPorId = (h, k, id) => { const r = (DB[h] || []).find(x => String(x[k]) === String(id)); return r ? Object.assign({}, r) : null; };
global.repoUpsert = (h, k, id, o) => { const i = DB[h].findIndex(x => String(x[k]) === String(id)); if (i >= 0) DB[h][i] = Object.assign({}, o); else DB[h].push(Object.assign({}, o)); };
global.repoActualizar = (h, k, id, c) => { const r = DB[h].find(x => String(x[k]) === String(id)); if (r) Object.assign(r, c); return !!r; };
let SESION = null;   // null = sin sesión de coordinación
global.coordExigirSesion = tok => (tok && SESION) ? { ok: true, firma: SESION } : { ok: false, error: 'Tu sesión de coordinación expiró.', codigo: 'NA' };
eval(lee('svc_plantillas.gs'));

eq('la semilla de la unidad entra una vez', plantillasSembrarUnidad() > 12, true);
eq('…y una segunda vez no duplica', plantillasSembrarUnidad(), 0);
const CASOS_DIEGO = ['vm_nc', 'destete_dif', 'pve_frustra', 'ext', 'post_ext', 'reintub', 'tqt', 'destete_tqt', 'decan', 'ingreso', 'prono', 'rehab', 'sin_nov'];
const sem = plantillasListar();
si('★ los 13 casos de Diego tienen plantilla de la unidad (+ la superada sin extubar del PRD hermano)',
  CASOS_DIEGO.every(c => sem.some(p => p.caso === c && p.dueno === 'UNIDAD')) && sem.some(p => p.caso === 'pve_sup_sin_ext'));
si('todas traen comodines conocidos', sem.every(p => !_plantComodinesMalos(p.cuerpo)));

let r = plantillaGuardar({ dueno: 'MCC', caso: 'pve_frustra', nombre: 'Mi PVE fracasada', cuerpo: '{encabezado}\n{pve}\nPlan: {plan}' });
si('un colega guarda la suya sin clave', r.ok && r.data.plantilla.dueno === 'MCC');
const ID_MCC = r.ok ? r.data.id : '';
r = plantillaGuardar({ dueno: 'MCC', caso: 'pve_frustra', nombre: 'Rota', cuerpo: '{encabezado}\n{pve_fracasda}\nPlan: {plan}' });
si('★ un comodín desconocido se rechaza (typo = plantilla rota en silencio)', !r.ok && /Comodín desconocido: \{pve_fracasda\}/.test(r.error));
r = plantillaGuardar({ dueno: 'MCC', caso: 'general', nombre: 'Sin comodines', cuerpo: 'Paciente evoluciona estable.' });
si('sin ningún comodín se rechaza (sería el mismo texto para todos)', !r.ok);
r = plantillaGuardar({ dueno: 'UNIDAD', caso: 'general', nombre: 'De la unidad', cuerpo: '{encabezado}\nPlan: {plan}' });
si('★ la de la UNIDAD sin sesión de coordinación se rechaza', !r.ok && /coordinación/.test(r.error));
SESION = 'DMV';
r = plantillaGuardar({ dueno: 'UNIDAD', caso: 'general', nombre: 'De la unidad', cuerpo: '{encabezado}\nPlan: {plan}', token: 'tok' });
si('…y con la clave se publica, firmada por quien entró', r.ok && r.data.plantilla.por === 'DMV');
SESION = null;
r = plantillaGuardar({ id: ID_MCC, dueno: 'DMV', caso: 'pve_frustra', nombre: 'Robada', cuerpo: '{encabezado}' });
si('editar la de OTRO colega se rechaza (se copia, no se edita)', !r.ok && /otra persona/.test(r.error));
r = plantillaGuardar({ id: ID_MCC, dueno: 'MCC', caso: 'pve_frustra', nombre: 'Mi PVE fracasada v2', cuerpo: '{encabezado}\n{pve}\n{weaning_grado}\nPlan: {plan}' });
si('la propia sí se edita, conservando el ID', r.ok && r.data.id === ID_MCC);
r = plantillaDesactivar({ id: ID_MCC, dueno: 'DMV' });
si('retirar la de otro se rechaza', !r.ok);
r = plantillaDesactivar({ id: ID_MCC, dueno: 'MCC' });
si('★ retirar la propia la saca del catálogo pero NO la borra de la hoja', r.ok && !plantillasListar().some(p => p.id === ID_MCC) && DB.PLANTILLAS_EVOLUCION.some(p => p.ID === ID_MCC));
eq('nombre demasiado largo se rechaza', plantillaGuardar({ dueno: 'MCC', caso: 'general', nombre: 'x'.repeat(41), cuerpo: '{encabezado}' }).ok, false);
eq('caso desconocido se rechaza', plantillaGuardar({ dueno: 'MCC', caso: 'weaning', nombre: 'w', cuerpo: '{encabezado}' }).ok, false);

/* ══ 2 · PARIDAD DE LISTAS cliente ↔ servidor ═══════════════════════════ */
console.log('\n2 · Cliente y servidor hablan las mismas listas');
const cliCom = idx.match(/const PLANT_COMODINES=\[([\s\S]*?)\];/)[1].match(/'([a-z_]+)'/g).map(x => x.replace(/'/g, ''));
// Las constantes del servidor se leen del FUENTE (un const dentro de eval no sale al módulo).
const srvSrc = lee('svc_plantillas.gs');
const srvCom = srvSrc.match(/const PLANT_COMODINES_SRV = \[([\s\S]*?)\];/)[1].match(/'([a-z_]+)'/g).map(x => x.replace(/'/g, ''));
const srvCasos = srvSrc.match(/const PLANT_CASOS_SRV = \[([\s\S]*?)\];/)[1].match(/'([a-z_]+)'/g).map(x => x.replace(/'/g, ''));
eq('★ comodines: cliente = servidor', cliCom.join(','), srvCom.join(','));
const cliCasos = idx.match(/const PLANT_CASOS=\{([\s\S]*?)\};/)[1].match(/([a-z_]+):'/g).map(x => x.replace(/:'$/, ''));
eq('★ casos: cliente = servidor', cliCasos.sort().join(','), srvCasos.slice().sort().join(','));
const alias = idx.match(/const PLANT_ALIAS=\{([\s\S]*?)\};/)[1];
const bloquesAlias = [...alias.matchAll(/'([a-zA-Z]+)'/g)].map(m => m[1]);
const bloquesMotor = new Set([...idx.matchAll(/_B\('([a-zA-Z]+)'\)/g)].map(m => m[1]));
const huerfanos = bloquesAlias.filter(b => !bloquesMotor.has(b));
eq('cada comodín apunta a bloques que el motor SÍ etiqueta', huerfanos.join(',') || 'ninguno huérfano', 'ninguno huérfano');
si('el esquema trae la hoja PLANTILLAS_EVOLUCION y EVOLUCIONES no cambió por esto', /PLANTILLAS_EVOLUCION: \{ headerRows: 1/.test(lee('esquema.gs')) && /TOTAL_COLS\.EVOLUCIONES !== 396/.test(lee('esquema.gs')));
si('el reset la CONSERVA (es configuración de la unidad)', /_RESET_CONSERVAR = \[[^\]]*'PLANTILLAS_EVOLUCION'/.test(lee('mantenimiento.gs')));
si('el dispatcher: GET_PLANTILLAS, PLANTILLA_GUARDAR y PLANTILLA_RETIRAR auditados; GET_BOOT lleva el catálogo',
  /case 'GET_PLANTILLAS'/.test(lee('api.gs')) && /case 'PLANTILLA_GUARDAR':\s*return _auditar/.test(lee('api.gs')) && /case 'PLANTILLA_RETIRAR':\s*return _auditar/.test(lee('api.gs')) && /plantillas: \(typeof plantillasListar/.test(lee('api.gs')));

/* ══ 3 · CLIENTE ════════════════════════════════════════════════════════ */
const { chromium } = require('playwright-core');
(async () => {
  console.log('\n3 · Pantalla: barra, sugerencia, relleno, regla madre, editor');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window._ll = [];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) { window._ll.push({ a, d }); setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2, 'index.html'));
  await p.waitForTimeout(600);
  // 🪤 abrirPanel pide GET_EVO_TURNO y su respuesta (5 ms después) corre
  // aplicarFirmaTurno, que deja la firma en '' si el tablero no asignó la
  // cama. Por eso la firma se pone DESPUÉS de esperar esa respuesta.
  const abrir = async () => {
    await p.evaluate(() => {
      DB = [{ ID_CAMA: '1', OCUPADA: true, NOMBRE: 'PACIENTE PRUEBA', PATIENT_ID: 'p1', WEAN_PVE_JSON: JSON.stringify({ '2026-09-01-Dia': 'frustra', '2026-09-03-Dia': 'frustra' }) }];
      abrirPanel('1', false, false);
    });
    await p.waitForTimeout(200);
    await p.evaluate(() => {
      const va = document.getElementById('fVA'); va.value = 'TOT'; va.dispatchEvent(new Event('change'));
      if (typeof updateVAUI === 'function') updateVAUI();
      document.getElementById('fFirma').innerHTML = '<option value="MCC">MCC</option><option value="DMV">DMV</option>';
      document.getElementById('fFirma').value = 'MCC';
      if (document.getElementById('fPVEval').value !== 'si') hPVEtoggle('si');
      const r = document.querySelector('input[name="pveRes"][value="frustra"]'); r.checked = true; hPVEres();
      const m = document.querySelector('input[name="pveFrMot"]'); if (m) m.checked = true;
      document.getElementById('fPlanes').value = 'nueva PVE mañana';
    });
  };

  // Sin catálogo: nada cambia.
  await abrir();
  const R0 = await p.evaluate(() => { PLANT_CAT = []; previewTexto(); return { oculta: document.getElementById('plantBar').classList.contains('hidden'), igual: document.getElementById('rtxt').value === genTexto() }; });
  si('★ promesa 1 · sin catálogo la barra no existe', R0.oculta);
  si('…y el texto es EXACTAMENTE el del motor', R0.igual);

  // Con catálogo (la semilla real de la unidad + una de MCC).
  const catalogo = sem.concat([{ id: 'p_mcc', dueno: 'MCC', caso: 'pve_frustra', nombre: 'PVE fracasada de MCC', cuerpo: '{pve_n} PVE del episodio, {weaning_grado}.\n{pve}\n{via_aerea} {soporte}\n{parametros}\nSe mantiene trabajo de musculatura respiratoria según tolerancia.\nPlan: {plan}', activo: true }]);
  await p.evaluate(cat => { PLANT_CAT = cat; }, catalogo);
  await abrir();
  const R1 = await p.evaluate(() => { previewTexto(); renderPlantBar();
    const act = _plantActiva();
    return { visible: !document.getElementById('plantBar').classList.contains('hidden'), caso: _plantCaso(), act: act && act.id, sug: !!document.querySelector('#plantChips .fase-chip.her'),
      txt: document.getElementById('rtxt').value, firma: document.getElementById('fFirma').value, motor: genTexto() }; });
  si('con catálogo la barra aparece', R1.visible);
  eq('el caso del turno sale del formulario (PVE fracasada)', R1.caso, 'pve_frustra');
  eq('★ la sugerida es la de MCC (el colega de la cama manda sobre la unidad)', R1.act, 'p_mcc');
  si('…y se muestra en ámbar como sugerida', R1.sug);
  si('★ el texto sale rellenado: sin llaves ni «undefined»', !/\{|\}|undefined/.test(R1.txt));
  si('…con la frase propia de MCC', /Se mantiene trabajo de musculatura respiratoria/.test(R1.txt));
  si('…con la 3ª PVE y el weaning (dato del episodio)', /3ª PVE del episodio, weaning difícil \(2 PVE fracasadas\)\./.test(R1.txt));
  si('…con la PVE narrada por el MOTOR (el dato sigue saliendo de ahí)', /Se realiza PVE según protocolo con resultado fallido/.test(R1.txt));
  si('…y el plan al final', /\nPlan: nueva PVE mañana$/.test(R1.txt));
  eq('promesa 2 · la firma no cambió', R1.firma, 'MCC');

  const R2 = await p.evaluate(() => { plantElegir(''); return { txt: document.getElementById('rtxt').value, motor: genTexto(), chipOn: document.querySelector('#plantChips .fase-chip.on')?.textContent }; });
  si('«Motor libre» devuelve el texto del motor tal cual', R2.txt === R2.motor && /Motor libre/.test(R2.chipOn));

  const R3 = await p.evaluate(() => {
    const unidad = PLANT_CAT.find(x => x.dueno === 'UNIDAD' && x.caso === 'pve_frustra');
    window._confirmPedido = 0; const _uc = window.uiConfirm; window.uiConfirm = () => { window._confirmPedido++; return Promise.resolve(false); };
    document.getElementById('rtxt').value = 'TEXTO ESCRITO A MANO POR EL COLEGA'; _setTextoManual(true);
    plantElegir(unidad.id);
    return new Promise(res => setTimeout(() => { window.uiConfirm = _uc; res({ pedido: window._confirmPedido, txt: document.getElementById('rtxt').value }); }, 50));
  });
  si('★ promesa 3 · sobre texto escrito a mano la plantilla PREGUNTA', R3.pedido === 1);
  eq('…y sin un sí no toca nada', R3.txt, 'TEXTO ESCRITO A MANO POR EL COLEGA');

  await abrir();
  await p.evaluate(() => {
    previewTexto();
    window._ll = []; window._toasts = []; window._pantalla = document.getElementById('rtxt').value;
    const _t = window.toast; window.toast = m => window._toasts.push(m);
    try { guardar(); } catch (e) { window._toasts.push('ERR ' + e.message); }
    window.toast = _t;
  });
  await p.waitForTimeout(120);   // guardar() manda por api() (promesa): el puente lo anota en _ll
  const R4 = await p.evaluate(() => ({ pay: (window._ll.find(x => x.a === 'GUARDAR_EVOLUCION') || {}).d || null, toasts: window._toasts, pantalla: window._pantalla }));
  if (!R4.pay) console.log('   (guardar no salió: ' + JSON.stringify(R4.toasts) + ')');
  si('al guardar viaja el texto de la PANTALLA (la plantilla rellenada)', R4.pay && R4.pay.TEXTO_GENERADO === R4.pantalla);
  si('…y TEXTO_AUTO sigue llevando el motor (trazabilidad)', R4.pay && R4.pay.TEXTO_AUTO && R4.pay.TEXTO_AUTO !== R4.pay.TEXTO_GENERADO);
  si('…sin marcar el texto como manual', R4.pay && !R4.pay.TEXTO_MANUAL);

  const R5 = await p.evaluate(() => {
    plantEditar('');
    const abierto = document.getElementById('plantMod').classList.contains('on');
    const esqueleto = document.getElementById('plantCuerpo').value;
    const preview1 = document.getElementById('plantPreview').textContent;
    document.getElementById('plantCuerpo').value = '{encabezado}\n{pve_fracasda}'; plantPreview();
    const previewMalo = document.getElementById('plantPreview').textContent;
    window._ll = []; window._toasts = []; const _t = window.toast; window.toast = m => window._toasts.push(m);
    document.getElementById('plantNombre').value = 'Rota'; plantModGuardar();
    window.toast = _t;
    const ncom = document.querySelectorAll('#plantComodines .plant-com').length;
    // copiar la de otro
    plantEditar(PLANT_CAT.find(x => x.dueno === 'UNIDAD' && x.caso === 'tqt').id);
    const tit = document.getElementById('plantModTit').textContent, dueno = document.getElementById('plantDueno').value, nombre = document.getElementById('plantNombre').value;
    plantModCerrar();
    return { abierto, esqueleto, preview1, previewMalo, llamadas: window._ll.length, toasts: window._toasts, ncom, tit, dueno, nombre };
  });
  si('el editor abre y nadie parte de página en blanco (esqueleto con comodines)', R5.abierto && /\{encabezado\}/.test(R5.esqueleto));
  si('la vista previa está y no trae llaves', R5.preview1.length > 20 && !/\{/.test(R5.preview1));
  si('★ un comodín tecleado mal se ve en rojo en la vista previa…', /Comodín desconocido: \{pve_fracasda\}/.test(R5.previewMalo));
  si('…y el guardado NO sale al servidor', R5.llamadas === 0 && R5.toasts.some(t => /Comodín desconocido/.test(t)));
  eq('los comodines del menú son los de la lista', R5.ncom, cliCom.length);
  si('editar la de la unidad sin clave = copiar como mía (la suya no se toca)', /Copiar/.test(R5.tit) && R5.dueno === 'MCC' && /\(mía\)$/.test(R5.nombre));

  eq('sin errores de página', errs.length, 0);
  await b.close();
  console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS:\n' + fails.map(f => '  - ' + f).join('\n') : '\n✅ plantillas_evolucion: todo verde');
  process.exit(fails.length ? 1 : 0);
})();
