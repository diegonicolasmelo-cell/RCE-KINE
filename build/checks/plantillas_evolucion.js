// plantillas_evolucion.js — PLANTILLAS DE EVOLUCIÓN DESDE EL TEXTO (tanda 3,
// sep-2026 · PRD_PLANTILLAS_EVOLUCION.md). v6.04, Diego 6-sep tras probar los
// chips: «me gustaría que fuera como TrakCare: un símbolo de plantilla abajo a
// la derecha del cuadro de texto y, al seleccionar texto, un + verde para
// crear una nueva»; sus cuatro síes (por dato y por bloque · se aplica sola ·
// unidad solo coordinación · frases fijas con aviso).
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
const cliCom = idx.match(/const PLANT_COMODINES=\[([\s\S]*?)\];/)[1].match(/'([a-z0-9_]+)'/g).map(x => x.replace(/'/g, ''));
// Las constantes del servidor se leen del FUENTE (un const dentro de eval no sale al módulo).
const srvSrc = lee('svc_plantillas.gs');
const srvCom = srvSrc.match(/const PLANT_COMODINES_SRV = \[([\s\S]*?)\];/)[1].match(/'([a-z0-9_]+)'/g).map(x => x.replace(/'/g, ''));
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
/* 🪤 9-sep-2026 — FECHAS RELATIVAS, NUNCA FIJAS. Esta guardia se puso roja sola
   al cambiar el día: las dos PVE del banco estaban clavadas en septiembre y
   `_weanClase` mide «días desde la 1ª PVE» contra HOY. Al pasar de 7 días el
   weaning dejó de ser «difícil» y pasó a «prolongado», sin que nadie tocara una
   línea. Se anclan con `hace(n)` para que el caso probado sea siempre el mismo. */
const hace = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const HACE3 = hace(3), HACE1 = hace(1);

(async () => {
  console.log('\n3 · Pantalla: 📋 y ➕ en el cuadro, se aplica sola, des-rellenar, regla madre, editor');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window._ll = [];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) { window._ll.push({ a, d }); setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {}, PLANTILLAS_ACTIVAS: true } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2, 'index.html'));
  await p.waitForTimeout(600);
  // 🪤 abrirPanel pide GET_EVO_TURNO y su respuesta (5 ms después) corre
  // aplicarFirmaTurno, que deja la firma en '' si el tablero no asignó la
  // cama. Por eso la firma se pone DESPUÉS de esperar esa respuesta.
  const abrir = async () => {
    await p.evaluate(([HACE3, HACE1]) => {
      DB = [{ ID_CAMA: '1', OCUPADA: true, NOMBRE: 'PACIENTE PRUEBA', PATIENT_ID: 'p1', WEAN_PVE_JSON: JSON.stringify({ [HACE3 + '-Dia']: 'frustra', [HACE1 + '-Dia']: 'frustra' }) }];
      abrirPanel('1', false, false);
    }, [HACE3, HACE1]);
    await p.waitForTimeout(200);
    await p.evaluate(() => {
      const va = document.getElementById('fVA'); va.value = 'TOT'; va.dispatchEvent(new Event('change'));
      if (typeof updateVAUI === 'function') updateVAUI();
      $('fSop').value = 'VM'; cascadeSop(); $('fModo').value = 'ACVC'; renderParams();
      $('r_vt').value = '500'; $('r_fr').value = '20'; $('r_peep').value = '8'; $('r_fio2').value = '30'; $('r_spo2').value = '98';
      $('fDx').value = 'ACV isquémico'; $('fDias').value = '1'; $('fSed').value = 'Escalón 6'; hSed(); $('fSAS').value = '1'; $('fSASmeta').value = '1';
      document.getElementById('fFirma').innerHTML = '<option value="MCC">MCC</option><option value="DMV">DMV</option>';
      document.getElementById('fFirma').value = 'MCC';
      if (document.getElementById('fPVEval').value !== 'si') hPVEtoggle('si');
      const r = document.querySelector('input[name="pveRes"][value="frustra"]'); r.checked = true; hPVEres();
      const m = document.querySelector('input[name="pveFrMot"]'); if (m) m.checked = true;
      document.getElementById('fPlanes').value = 'nueva PVE mañana';
    });
  };

  // Sin catálogo: nada cambia y no hay barra en ninguna parte.
  await abrir();
  const R0 = await p.evaluate(() => { PLANT_CAT = []; previewTexto(); return { sinBarra: !document.getElementById('plantBar') && !document.getElementById('plantChips'),
    ico: !!document.getElementById('plantIco'), mas: document.getElementById('plantMas').classList.contains('hidden'),
    igual: document.getElementById('rtxt').value === genTexto(), enUso: document.getElementById('plantEnUso').textContent }; });
  si('★ la barra de chips ya no existe', R0.sinBarra);
  si('el 📋 vive en el cuadro de texto y el ➕ está escondido sin selección', R0.ico && R0.mas);
  si('★ promesa 1 · sin catálogo el texto es EXACTAMENTE el del motor', R0.igual && R0.enUso === '');

  // Con catálogo (la semilla real de la unidad + dos de MCC).
  const catalogo = sem.concat([
    { id: 'p_mcc', dueno: 'MCC', caso: 'pve_frustra', nombre: 'PVE fracasada de MCC', cuerpo: '{pve_n} PVE del episodio, {weaning_grado}.\n{pve}\n{via_aerea} {soporte}\nVentila con Vti {vt} ml y FR {fr} rpm, PEEP {peep} y FiO2 {fio2}%.\nSe mantiene trabajo de musculatura respiratoria según tolerancia.\nPlan: {plan}', activo: true },
    { id: 'p_mcc_gen', dueno: 'MCC', caso: 'general', nombre: 'General de MCC', cuerpo: '{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\nPlan: {plan}', activo: true },
  ]);
  await p.evaluate(cat => { PLANT_CAT = cat; }, catalogo);
  await abrir();
  const R1 = await p.evaluate(() => { previewTexto(); renderPlantBar();
    const act = _plantActiva();
    return { caso: _plantCaso(), act: act && act.id, enUso: document.getElementById('plantEnUso').textContent, n: document.getElementById('plantIcoN').textContent,
      txt: document.getElementById('rtxt').value, firma: document.getElementById('fFirma').value, motor: genTexto() }; });
  eq('la situación del turno sale del formulario (PVE fracasada)', R1.caso, 'pve_frustra');
  eq('★ decisión ② · se aplicó SOLA la mía de la situación (mía·situación gana)', R1.act, 'p_mcc');
  si('…y el 📋 dice cuál y cuántas tengo', /PVE fracasada de MCC · mía/.test(R1.enUso) && R1.n === '2');
  si('★ el texto sale rellenado: sin llaves ni «undefined»', !/\{|\}|undefined/.test(R1.txt));
  si('★ decisión ① · los comodines por DATO se rellenan con el formulario', /Ventila con Vti 500 ml y FR 20 rpm, PEEP 8 y FiO2 30%\./.test(R1.txt));
  si('…con la frase propia (fija) de MCC', /Se mantiene trabajo de musculatura respiratoria/.test(R1.txt));
  si('…con la 3ª PVE y el weaning (dato del episodio)', /3ª PVE del episodio, weaning difícil \(2 PVE fracasadas\)\./.test(R1.txt));
  si('…con la PVE narrada por el MOTOR (el dato sigue saliendo de ahí)', /Se realiza PVE según protocolo con resultado fallido/.test(R1.txt));
  eq('promesa 2 · la firma no cambió', R1.firma, 'MCC');

  // Sin situación registrada → mía·general; la general no nombra la PVE, así que
  // el relato del turno entra solo antes del Plan.
  const R1b = await p.evaluate(() => {
    const r = document.querySelector('input[name="pveRes"][value="frustra"]'); r.checked = false; hPVEres(); hPVEtoggle('si');   // deselecciona la PVE
    const gen = _plantGanadora();
    document.getElementById('fPVEval').value = ''; const g2 = _plantGanadora();
    hPVEtoggle('si'); const r2 = document.querySelector('input[name="pveRes"][value="frustra"]'); r2.checked = true; hPVEres();
    _plantSel = 'p_mcc_gen'; _plantConf = true; previewTexto();
    const txt = document.getElementById('rtxt').value; _plantSel = null; _plantConf = false;
    return { gen: g2 && g2.id, txt };
  });
  eq('sin situación gana mi general', R1b.gen, 'p_mcc_gen');
  si('★ el relato del turno (la PVE) entra solo antes del Plan aunque la general no lo nombre', /resultado fallido[\s\S]*\nPlan: nueva PVE mañana$/.test(R1b.txt));

  const R2 = await p.evaluate(() => { plantElegir(''); return { txt: document.getElementById('rtxt').value, motor: genTexto(), enUso: document.getElementById('plantEnUso').textContent }; });
  si('«Motor libre» devuelve el texto del motor tal cual', R2.txt === R2.motor && R2.enUso === '');

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
  await p.waitForTimeout(120);
  const R4 = await p.evaluate(() => ({ pay: (window._ll.find(x => x.a === 'GUARDAR_EVOLUCION') || {}).d || null, toasts: window._toasts, pantalla: window._pantalla }));
  if (!R4.pay) console.log('   (guardar no salió: ' + JSON.stringify(R4.toasts) + ')');
  si('al guardar viaja el texto de la PANTALLA (la plantilla rellenada)', R4.pay && R4.pay.TEXTO_GENERADO === R4.pantalla);
  si('…y TEXTO_AUTO sigue llevando el motor (trazabilidad)', R4.pay && R4.pay.TEXTO_AUTO && R4.pay.TEXTO_AUTO !== R4.pay.TEXTO_GENERADO);
  si('…sin marcar el texto como manual', R4.pay && !R4.pay.TEXTO_MANUAL);

  /* ── El ➕: seleccionar frases del motor y crear la plantilla desde ahí ── */
  await abrir();
  const R5 = await p.evaluate(() => {
    plantElegir(''); previewTexto();
    const t = document.getElementById('rtxt'); const lineas = t.value.split('\n');
    // selecciona desde la frase del día hasta la de parámetros (líneas 1..3), más una frase escrita a mano
    t.value = t.value + '\nSe conversa con familia y se explica el plan.';
    const ini = lineas[0].length + 1, fin = t.value.length;
    t.focus(); t.setSelectionRange(ini, fin); t.dispatchEvent(new Event('select'));
    const masVisible = !document.getElementById('plantMas').classList.contains('hidden');
    plantCrearDesdeSeleccion();
    const abierto = document.getElementById('plantMod').classList.contains('on');
    const modoRow = document.getElementById('plantModoRow').style.display !== 'none';
    const porDato = document.getElementById('plantCuerpo').value;
    const fijas = document.getElementById('plantFijas').textContent;
    const prevDato = document.getElementById('plantPreview').textContent;
    document.querySelector('input[name="plantModo"][value="bloque"]').checked = true; plantReconvertir();
    const porBloque = document.getElementById('plantCuerpo').value;
    const nombre = document.getElementById('plantNombre').value, caso = document.getElementById('plantCaso').value;
    plantModCerrar();
    return { masVisible, abierto, modoRow, porDato, fijas, prevDato, porBloque, nombre, caso };
  });
  si('★ al seleccionar texto aparece el ➕ verde', R5.masVisible);
  si('el ➕ abre el editor con la fila «por dato / por bloque»', R5.abierto && R5.modoRow);
  si('★ por DATO: «Vti 500 ml» pasó a «Vti {vt} ml» (des-rellenado con contexto)', /Vti \{vt\} ml/.test(R5.porDato) && /FR \{fr\} rpm/.test(R5.porDato) && /PEEP \{peep\}/.test(R5.porDato));
  si('…el diagnóstico y el día también', /en contexto de \{diagnostico\}/.test(R5.porDato) && /en \{dia_estadia\} día/.test(R5.porDato));
  si('…SAS 1 y meta 1 no se confunden', /SAS \{sas\} \(meta \{sas_meta\}\)/.test(R5.porDato));
  si('★ decisión ④ · la frase escrita a mano queda FIJA y se avisa en ámbar', /Se conversa con familia/.test(R5.porDato) && /Frases fijas/.test(R5.fijas) && /Se conversa con familia/.test(R5.fijas));
  si('la vista previa devuelve el texto de este paciente (sin llaves)', !/\{/.test(R5.prevDato) && /Vti 500 ml/.test(R5.prevDato));
  si('★ por BLOQUE: las mismas frases pasan a {dia} {via_aerea} {soporte} {parametros}', /\{dia\}/.test(R5.porBloque) && /\{parametros\}/.test(R5.porBloque) && !/\{vt\}/.test(R5.porBloque));
  si('el nombre y la situación vienen propuestos', /^Mi /.test(R5.nombre) && R5.caso === 'pve_frustra');

  const R6 = await p.evaluate(() => {
    plantEditar('');
    const abierto = document.getElementById('plantMod').classList.contains('on');
    const esqueleto = document.getElementById('plantCuerpo').value;
    document.getElementById('plantCuerpo').value = '{encabezado}\n{pve_fracasda}'; plantPreview();
    const previewMalo = document.getElementById('plantPreview').textContent;
    window._ll = []; window._toasts = []; const _t = window.toast; window.toast = m => window._toasts.push(m);
    document.getElementById('plantNombre').value = 'Rota'; plantModGuardar();
    window.toast = _t;
    const ncom = document.querySelectorAll('#plantComodines .plant-com').length;
    plantEditar(PLANT_CAT.find(x => x.dueno === 'UNIDAD' && x.caso === 'tqt').id);
    const tit = document.getElementById('plantModTit').textContent, dueno = document.getElementById('plantDueno').value, nombre = document.getElementById('plantNombre').value;
    plantModCerrar();
    plantPopAbrir(); const pop = document.getElementById('plantPop').textContent; plantPopCerrar();
    return { abierto, esqueleto, previewMalo, llamadas: window._ll.length, toasts: window._toasts, ncom, tit, dueno, nombre, pop };
  });
  si('el editor abre y nadie parte de página en blanco (esqueleto con comodines)', R6.abierto && /\{encabezado\}/.test(R6.esqueleto));
  si('★ un comodín tecleado mal se ve en rojo en la vista previa…', /Comodín desconocido: \{pve_fracasda\}/.test(R6.previewMalo));
  si('…y el guardado NO sale al servidor', R6.llamadas === 0 && R6.toasts.some(t => /Comodín desconocido/.test(t)));
  eq('los comodines del menú son los de la lista', R6.ncom, cliCom.length);
  si('decisión ③ · editar la de la unidad sin clave = copiar como mía (la suya no se toca)', /Copiar/.test(R6.tit) && R6.dueno === 'MCC' && /\(mía\)$/.test(R6.nombre));
  si('el menú del 📋 trae los estantes, motor libre, nueva y mis plantillas', /Mías \(MCC\)/.test(R6.pop) && /De la unidad/.test(R6.pop) && /Motor libre/.test(R6.pop) && /Nueva plantilla/.test(R6.pop) && /Mis plantillas/.test(R6.pop));

  /* ══ 7 · EL INTERRUPTOR (Diego, 7-sep-2026): apagadas para el equipo, editor solo para coordinación ══ */
  console.log('\n7 · CONFIG.PLANTILLAS_ACTIVAS=FALSE: el motor de siempre para todos; el editor, solo coordinación');
  const R7 = await p.evaluate(() => {
    window.CFG = Object.assign({}, window.CFG || {}, { PLANTILLAS_ACTIVAS: false });
    COORD_TK = null; _plantSel = null; _plantConf = false; _textoManual = false; _textoCongelado = false;
    renderPlantBar(); _plantAplicar();
    const t = document.getElementById('rtxt');
    const r = { txt: t.value, motor: genTexto(), act: _plantActiva(),
      icoOculto: document.getElementById('plantIco').classList.contains('hidden'),
      enUso: document.getElementById('plantEnUso').textContent };
    // Selecciona texto: el ➕ NO puede aparecer para el equipo.
    t.focus(); t.setSelectionRange(0, 20); _plantMasRefrescar();
    r.masOculto = document.getElementById('plantMas').classList.contains('hidden');
    // Elegir una plantilla a mano tampoco la aplica.
    plantElegir('p_mcc'); r.txtTrasElegir = t.value;
    // Entra coordinación: vuelve el 📋, pero solo como editor.
    COORD_TK = 'tok'; renderPlantBar();
    r.icoCoord = !document.getElementById('plantIco').classList.contains('hidden');
    r.tituloCoord = document.getElementById('plantIco').title;
    plantPopAbrir(); const pop = document.getElementById('plantPop').innerHTML; plantPopCerrar();
    r.popSinAplicar = !/plantElegir\(/.test(pop) && /Nueva plantilla/.test(pop) && /Mis plantillas/.test(pop) && /apagadas/i.test(pop);
    r.txtCoord = t.value; r.actCoord = _plantActiva();
    plantEditar(''); r.editorAbre = document.getElementById('plantMod').classList.contains('on');
    r.ncomEditor = document.querySelectorAll('#plantComodines .plant-com').length;
    plantModCerrar();
    // Sale coordinación: el 📋 se esconde otra vez.
    COORD_TK = null; renderPlantBar();
    r.icoOcultoDespues = document.getElementById('plantIco').classList.contains('hidden');
    window.CFG.PLANTILLAS_ACTIVAS = true; renderPlantBar();
    return r;
  });
  si('★ apagadas: el texto es EXACTAMENTE el del motor y ninguna plantilla está activa', R7.txt === R7.motor && R7.act === null && R7.enUso === '');
  si('★ apagadas: el 📋 no existe para el equipo', R7.icoOculto);
  si('★ apagadas: el ➕ no aparece ni con texto seleccionado', R7.masOculto);
  si('★ apagadas: elegir una plantilla a mano no cambia el texto', R7.txtTrasElegir === R7.motor);
  si('★ con sesión de COORDINACIÓN vuelve el 📋…', R7.icoCoord && /APAGADAS/.test(R7.tituloCoord));
  si('…pero su menú solo arma y revisa: nada que aplicar', R7.popSinAplicar);
  si('…y el texto de coordinación sigue siendo el motor (no se aplica ni a ella)', R7.txtCoord === R7.motor && R7.actCoord === null);
  si('…el editor abre y muestra TODOS los comodines', R7.editorAbre && R7.ncomEditor === cliCom.length);
  si('al salir coordinación el 📋 se esconde otra vez', R7.icoOcultoDespues);
  si('el interruptor viaja en la config: FALSE por defecto y sembrado en CONFIG',
    /PLANTILLAS_ACTIVAS: leerConfig\('PLANTILLAS_ACTIVAS', 'FALSE'\) === 'TRUE'/.test(lee('api.gs')) && /\['PLANTILLAS_ACTIVAS', 'FALSE'\]/.test(lee('esquema.gs')));

  eq('sin errores de página', errs.length, 0);
  await b.close();
  console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS:\n' + fails.map(f => '  - ' + f).join('\n') : '\n✅ plantillas_evolucion: todo verde');
  process.exit(fails.length ? 1 : 0);
})();
