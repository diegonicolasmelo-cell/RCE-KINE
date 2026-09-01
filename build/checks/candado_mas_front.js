// candado_mas_front.js — EL ➕ DICE LO QUE EL SERVIDOR VA A HACER.
//
// 🔴 DE DÓNDE SALE (21-ago-2026, Manuel desde el turno, con captura): «el
// problema del ➕ sigue abierto sin importar si hay login de adm o no». El
// candado del servidor (candado_mas.js) estaba en producción y rechazaba —
// pero el botón se pintaba ➕ igual, el popup abría la lista igual, y el
// rechazo llegaba recién al guardar. Para quien mira la pantalla eso ES un
// ➕ abierto. Aquí se prueba el lado del navegador: el botón lleva 🔒 con la
// MISMA regla del servidor, el popup pide la clave antes, y con la sesión
// abierta todo vuelve a ➕ sin repintar.
//
// Se corre con el index real en Chromium; el servidor se simula solo para
// COORD_ENTRAR. Las fechas se calculan contra el reloj real, así que la
// guardia no caduca (la trampa de lista_y_filtros.js).
// Uso: node build/checks/candado_mas_front.js [ruta.html]
const { chromium } = require('playwright-core');
const path = require('path');
const fs = require('fs');
const ARCHIVO = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'v2', 'index.html'));
const fails = [];
const si = (l, c, d) => { console.log((c?'✅':'❌')+' '+l+(d!==undefined?': '+d:'')); if(!c) fails.push(l); };
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dias = n => { const d=new Date(); d.setDate(d.getDate()+n); return iso(d); };
const HOY = dias(0), AYER = dias(-1), ANTIER = dias(-2);

(async () => {
  // Los dos sitios que pintan el botón usan la misma función (fuente, no DOM).
  const src = fs.readFileSync(path.join(__dirname, '..', '..', 'v2', 'index.html'), 'utf8');
  si('la tarjeta y el Registro pintan el ➕ con _evBotonHTML', (src.match(/_evBotonHTML\(/g)||[]).length >= 3);
  si('…y no queda ningún ➕ pintado a mano', !/onclick="evAbrir\('\$\{[^"]*"\>➕<\/button>/.test(src));

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const pg = await b.newPage({ viewport: { width: 1400, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + ARCHIVO);
  await pg.waitForTimeout(2000);
  await pg.evaluate(() => {
    const o = document.getElementById('loginOvl'); if (o) o.style.display = 'none';
    DB = [ { ID_CAMA:'3', OCUPADA:'TRUE', PATIENT_ID:'pA' }, { ID_CAMA:'4', OCUPADA:'FALSE', PATIENT_ID:'' } ];
    COORD_TK = null; COORD_FIRMA = '';
  });
  const cand = (f, cama, pid, turno) => pg.evaluate(([f,cama,pid,turno]) => { document.getElementById('gDate').value = f; return _evCandado(cama, pid, turno); }, [f,cama,pid,turno]);

  console.log('\n1 · La regla, espejo de svc_eventos.gs');
  si('hoy, paciente en cama: libre', await cand(HOY,'3','pA','Dia') === false);
  si('antier: candado', await cand(ANTIER,'3','pA','Dia') === true);
  si('ayer, turno DÍA: candado', await cand(AYER,'3','pA','Dia') === true);
  si('ayer, turno NOCHE (fecha efectiva = hoy): libre', await cand(AYER,'3','pA','Noche') === false);
  si('hoy, cama vacía: candado', await cand(HOY,'4','','Dia') === true);
  si('hoy, otro pid en la cama (episodio cerrado): candado', await cand(HOY,'3','pB','Dia') === true);

  console.log('\n2 · El botón lleva 🔒 cuando hay candado');
  const htmlPas = await pg.evaluate(f => { document.getElementById('gDate').value = f; return _evBotonHTML('3','pA','ev-btn'); }, ANTIER);
  si('con fecha pasada el botón lleva ev-lock y 🔒', /ev-lock/.test(htmlPas) && /🔒/.test(htmlPas));
  const htmlHoy = await pg.evaluate(f => { document.getElementById('gDate').value = f; return _evBotonHTML('3','pA','ev-btn'); }, HOY);
  si('con hoy no lleva ev-lock', !/ev-lock/.test(htmlHoy));
  // Píxeles: inyectado en la página, el 🔒 se ve y el ➕ no (y al revés con sesión).
  await pg.evaluate(h => { const d=document.createElement('div'); d.id='tmpEv'; d.innerHTML=h; document.body.appendChild(d); }, htmlPas);
  const vis = sel => pg.evaluate(s => { const e=document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none'; }, sel);
  si('sin sesión se VE el 🔒', await vis('#tmpEv .ev-cerr'));
  si('…y no el ➕', !(await vis('#tmpEv .ev-mas')));
  await pg.evaluate(() => { COORD_TK = 'tk'; COORD_FIRMA = 'MCC'; coordInit(); });
  si('con sesión el mismo botón vuelve a ➕ sin repintar', await vis('#tmpEv .ev-mas') && !(await vis('#tmpEv .ev-cerr')));
  await pg.evaluate(() => { COORD_TK = null; COORD_FIRMA = ''; coordInit(); });

  console.log('\n3 · El popup pide la clave ANTES de mostrar la lista');
  await pg.evaluate(f => { document.getElementById('gDate').value = f; SHIFT = 'Dia'; evAbrir('3', null, 'pA'); }, ANTIER);
  await pg.waitForTimeout(200);
  si('fecha pasada sin sesión: se ve la llave', await pg.locator('#evLlave').isVisible());
  si('…y NO la lista de eventos', await pg.locator('#evLista').isHidden());
  si('…el título dice 🔒', (await pg.locator('#evTitulo').innerText()).includes('🔒'));
  await pg.evaluate(() => evSetTurno('Noche'));
  si('cambiar a Noche en antier sigue con candado', await pg.locator('#evLlave').isVisible());
  await pg.evaluate(() => evCerrar());
  await pg.evaluate(f => { document.getElementById('gDate').value = f; SHIFT = 'Dia'; evAbrir('3', null, 'pA'); }, AYER);
  await pg.evaluate(() => evSetTurno('Noche'));
  si('ayer + Noche (es hoy efectivo): la lista, sin llave', await pg.locator('#evLista').isVisible() && await pg.locator('#evLlave').isHidden());
  await pg.evaluate(() => evCerrar());

  console.log('\n4 · Entrar desde el popup abre la sesión y sigue al evento');
  await pg.evaluate(() => { window.api = (a, d) => Promise.resolve(a === 'COORD_ENTRAR' ? (d.clave === 'ok' ? { token:'t1', firma:'MCC' } : Promise.reject(new Error('Usuario o clave incorrectos.'))) : {}); });
  await pg.evaluate(f => { document.getElementById('gDate').value = f; SHIFT = 'Dia'; evAbrir('3', null, 'pA'); }, ANTIER);
  await pg.click('#evLlaveGo'); await pg.waitForTimeout(150);
  si('sin usuario avisa y no llama', (await pg.locator('#evLlaveErr').innerText()).length > 0);
  await pg.fill('#evLlaveUsr', 'coord1'); await pg.fill('#evLlaveClave', 'mala');
  await pg.click('#evLlaveGo'); await pg.waitForTimeout(250);
  si('clave mala: el error se muestra en el popup', (await pg.locator('#evLlaveErr').innerText()).includes('incorrectos'));
  si('…y la sesión sigue cerrada', await pg.evaluate(() => !COORD_TK));
  await pg.fill('#evLlaveClave', 'ok'); await pg.click('#evLlaveGo'); await pg.waitForTimeout(350);
  si('clave buena: sesión abierta', await pg.evaluate(() => COORD_TK === 't1' && COORD_FIRMA === 'MCC'));
  si('…la lista de eventos aparece', await pg.locator('#evLista').isVisible() && await pg.locator('#evLlave').isHidden());
  si('…el candado de la cabecera se abre con la firma', (await pg.locator('#hSesCandTxt').innerText()).startsWith('MCC'));
  si('…y body.coord-on queda puesto', await pg.evaluate(() => document.body.classList.contains('coord-on')));

  si('sin errores JS en toda la corrida', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ ➕ con candado en el front OK');
  process.exit(fails.length ? 1 : 0);
})();
