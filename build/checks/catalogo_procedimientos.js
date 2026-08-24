// catalogo_procedimientos.js — EL ➕ OFRECE EL CATÁLOGO DE PROCEDIMIENTOS COMO
// DESPLEGABLE, Y ESE CATÁLOGO ES EL MISMO QUE RECONOCE EL SERVIDOR.
//
// 🔴 DE DÓNDE SALE (22-ago-2026, Manuel con captura): «Procedimiento del
// catálogo…» era un <input list="dlProc"> cuyo datalist nunca se llenaba —
// no mostraba nada, y cada kinesiólogo escribía a mano («ktm 1», «Asistencia
// en procedimiento», «Toraconcentesis…»): 38 nombres distintos en la planilla
// real, de los cuales la mitad no calzan con ningún hito. Pedido: un
// desplegable con el catálogo.
//
// Dos cosas se vigilan: (1) la lista del front y `PROC_TO_HITO` del servidor
// (svc_timeline.gs) son el MISMO conjunto — si alguien agrega un nombre en un
// lado y no en el otro, el anexo cae al respaldo genérico sin hito clínico;
// (2) en Chromium real, el desplegable aparece al elegir «Procedimiento», lo
// elegido viaja en `proc`, y «Otro» abre el texto libre.
// Uso: node build/checks/catalogo_procedimientos.js [ruta.html]
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const ARCHIVO = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'v2', 'index.html'));
const fails = [];
const si = (l, c, d) => { console.log((c?'✅':'❌')+' '+l+(d!==undefined?': '+d:'')); if(!c) fails.push(l); };

console.log('1 · Front y servidor comparten el catálogo');
const idx = fs.readFileSync(path.join(__dirname, '..', '..', 'v2', 'index.html'), 'utf8');
const tl = fs.readFileSync(path.join(__dirname, '..', '..', 'v2', 'svc_timeline.gs'), 'utf8');
const bloqueSrv = tl.slice(tl.indexOf('const PROC_TO_HITO'), tl.indexOf('};', tl.indexOf('const PROC_TO_HITO')));
const srv = new Set([...bloqueSrv.matchAll(/^\s*'([^']+)':\s*\{/gm)].map(m => m[1]).filter(k => k !== 'FALLECE'));
const bloqueFront = idx.slice(idx.indexOf('const _PROC_CATALOGO'), idx.indexOf('];', idx.indexOf('const _PROC_CATALOGO')));
const front = new Set([...bloqueFront.matchAll(/\['([^']+)','[^']*'\]/g)].map(m => m[1]));
si('el servidor declara un catálogo no vacío', srv.size >= 30, srv.size);
si('el front declara un catálogo no vacío', front.size >= 30, front.size);
const soloSrv = [...srv].filter(k => !front.has(k)), soloFront = [...front].filter(k => !srv.has(k));
si('todo lo que el servidor reconoce está en el desplegable', soloSrv.length === 0, soloSrv.join(' | '));
si('todo lo del desplegable lo reconoce el servidor', soloFront.length === 0, soloFront.join(' | '));
si('FALLECE no se ofrece (es egreso, no procedimiento)', !front.has('FALLECE'));

(async () => {
  console.log('\n2 · En pantalla: desplegable, valor y «Otro»');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const pg = await b.newPage({ viewport: { width: 1400, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + ARCHIVO);
  await pg.waitForTimeout(2000);
  const hoy = (d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`)(new Date());
  await pg.evaluate(h => {
    const o = document.getElementById('loginOvl'); if (o) o.style.display = 'none';
    DB = [ { ID_CAMA:'3', OCUPADA:'TRUE', PATIENT_ID:'pA' } ];
    COORD_TK = null; document.getElementById('gDate').value = h; SHIFT = 'Dia';
    window._capturado = null;
    // Desde el 24-ago-2026 el ➕ refresca de fondo tras guardar
    // (recargarSilencioso): esas dos lecturas devuelven ARRAYS, como el
    // servidor real — el {} genérico dejaba DB hecho un objeto y todo lo que
    // viniera después reventaba en (DB||[]).find.
    window.api = (a, d) => { if (a === 'ANEXAR_EVENTO') { window._capturado = d; return Promise.resolve({ texto: 'ok' }); }
      if (a === 'GET_TODAS_CAMAS') return Promise.resolve(DB);
      if (a === 'GET_EVOS_DEL_DIA') return Promise.resolve([]);
      return Promise.resolve({}); };
    // El refresco de fondo del ➕ (24-ago-2026) repinta la grilla de verdad,
    // así que el doble de Turnos necesita TODO lo que el repintado toca —
    // no solo lo que usa el popover.
    window.Turnos = { ROSTER: [ { f:'MFB', n:'Manuel' } ], firmaDeCama: () => 'MFB', init(){}, fillFirmaSelect(){},
      syncKey(){}, decorateCard(){}, paintBed(){}, paintSeccion(){}, renderLegend(){} };
    evAbrir('3', null, 'pA');
  }, hoy);
  await pg.evaluate(() => evTipo('procedimiento'));
  await pg.waitForTimeout(150);
  si('al elegir «Procedimiento» se ve el DESPLEGABLE', await pg.locator('#evProcSel').isVisible());
  si('…y el texto libre queda oculto', await pg.locator('#evProc').isHidden());
  const nOpc = await pg.evaluate(() => document.querySelectorAll('#evProcSel option').length);
  si('el desplegable trae el catálogo completo (+ vacío + Otro)', nOpc === front.size + 2, nOpc);
  si('…agrupado por secciones', await pg.evaluate(() => document.querySelectorAll('#evProcSel optgroup').length) >= 5);
  await pg.selectOption('#evProcSel', 'PABELLÓN');
  si('elegir «Traslado a pabellón» deja el valor canónico PABELLÓN', await pg.evaluate(() => _evProcValor()) === 'PABELLÓN');
  await pg.evaluate(() => { document.getElementById('evFirma').value = 'MFB'; });
  await pg.evaluate(() => evGuardar());
  await pg.waitForTimeout(300);
  si('al guardar viaja proc=PABELLÓN al servidor', await pg.evaluate(() => window._capturado && window._capturado.proc) === 'PABELLÓN', JSON.stringify(await pg.evaluate(() => window._capturado && { proc: window._capturado.proc, tipo: window._capturado.tipo })));
  // Otro → texto libre
  await pg.evaluate(() => { evAbrir('3', null, 'pA'); evTipo('procedimiento'); });
  await pg.selectOption('#evProcSel', '__otro');
  await pg.waitForTimeout(150);
  si('«Otro» muestra el texto libre', await pg.locator('#evProc').isVisible());
  await pg.fill('#evProc', 'Toracocentesis diagnóstica');
  si('…y lo escrito es lo que viaja', await pg.evaluate(() => _evProcValor()) === 'Toracocentesis diagnóstica');
  // Sin elegir nada no se guarda
  await pg.evaluate(() => { evAbrir('3', null, 'pA'); evTipo('procedimiento'); window._capturado = null; document.getElementById('evFirma').value = 'MFB'; evGuardar(); });
  await pg.waitForTimeout(200);
  si('sin procedimiento elegido NO llama al servidor', await pg.evaluate(() => window._capturado === null));
  si('el datalist del formulario de evolución ahora también está lleno', await pg.evaluate(() => document.querySelectorAll('#dlProc option').length) >= 30);
  si('sin errores JS en toda la corrida', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ Catálogo de procedimientos OK');
  process.exit(fails.length ? 1 : 0);
})();
