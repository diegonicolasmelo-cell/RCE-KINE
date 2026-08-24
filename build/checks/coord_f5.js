// coord_f5.js — EL CANDADO DE COORDINACIÓN SOBREVIVE AL F5 (24-ago-2026,
// pedido de Manuel: «dura 30 min, pero si se actualiza se desloguea»).
//
// 🔴 DE DÓNDE SALE. La sesión vive en el SERVIDOR (CacheService, 30 min de
// inactividad renovados con cada uso), pero el token COORD_TK vivía solo en
// memoria de JS: recargar la página lo botaba y había que escribir la clave
// de nuevo — tres veces en una mañana — con la sesión del servidor aún viva.
// Peor: recargar es justo lo que la gente hacía para ver un anexo que no se
// pintaba (ver sello_al_tiro.js) — un círculo vicioso completo.
//
// Lo que se fija, en las DOS capas:
//  · svc_coordinacion.gs · coordEstado(token): dice si ESA sesión sigue viva
//    (y de quién es) sin abrir ninguna — es solo lectura sobre coordSesion.
//  · index.html · bolsillo de la PESTAÑA (sessionStorage, muere al cerrarla —
//    en la tablet compartida un localStorage dejaría el candado restaurable
//    días después) + _coordReanudar() al arrancar: restaura el candado SOLO
//    si el servidor confirma; con >30 min de inactividad bota el bolsillo sin
//    preguntar; y salir (botón o inactividad) borra el bolsillo para que un
//    F5 posterior no resucite una sesión cerrada.
//  El navegador NUNCA alarga la sesión: la autoridad sigue siendo el servidor.
//
// El F5 se ejecuta DE VERDAD (page.reload) — el bolsillo tiene que sobrevivir
// una recarga real, no un stub de recarga.
//
// Uso: node build/checks/coord_f5.js [ruta.html]
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const si = (l, c, d) => { console.log((c ? '✅' : '❌') + ' ' + l + (d !== undefined ? ': ' + d : '')); if (!c) fails.push(l); };

/* ══ Parte 1 · El servicio: COORD_ESTADO resuelve un token ═══════════════ */
console.log('1 · svc_coordinacion.gs — coordEstado con token dice viva/muerta sin abrir nada');
const mem = {};
global.CacheService = { getScriptCache: () => ({
  get: k => (k in mem ? mem[k] : null),
  put: (k, v) => { mem[k] = v; },
  remove: k => { delete mem[k]; },
}) };
global.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null, setProperty: () => {}, deleteProperty: () => {} }) };
global.Utilities = { getUuid: () => 'tok-' + Math.random().toString(36).slice(2) };
global.leerConfig = (k, d) => d;
global.configVal = (k, d) => d;
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_AUTORIZADO: 'NA' };
global.auditar = () => {};
global.Session = { getScriptTimeZone: () => 'America/Santiago' };
global.MailApp = { sendEmail: () => {} };
eval(fs.readFileSync(path.join(v2, 'svc_coordinacion.gs'), 'utf8'));

const tok = _coordAbrirSesion('coord1', 'MCC');
const rV = coordEstado({ token: tok });
si('con token vivo responde viva', rV.ok && rV.data.viva === true);
si('…con la firma de quien la abrió', rV.data.firma === 'MCC', rV.data.firma);
si('…y sus minutos', rV.data.minutos === 30, rV.data.minutos);
const rM = coordEstado({ token: 'tok-que-no-existe' });
si('con token desconocido responde muerta', rM.ok && rM.data.viva === false);
const rS = coordEstado({});
si('sin token la respuesta es la de siempre (ni viva ni muerta)', rS.ok && !('viva' in rS.data) && 'recuperaCorreo' in rS.data);
coordCerrarSesion({ token: tok });
const rV2 = coordEstado({ token: tok });
si('tras cerrar en el servidor, el mismo token responde muerta', rV2.ok && rV2.data.viva === false);

/* ══ Parte 2 · El navegador: bolsillo + reanudar, con un F5 real ═════════ */
(async () => {
  const { chromium } = require('playwright-core');
  const ARCHIVO = path.resolve(process.argv[2] || path.join(v2, 'index.html'));
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const pg = await b.newPage({ viewport: { width: 1400, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  const stubGS = () => pg.evaluate(() => {
    window._gsCalls = [];
    window.gs = (a, d, okc) => { window._gsCalls.push({ a: a, d: d });
      if (a === 'COORD_ENTRAR') okc && okc({ token: 'TK1', firma: 'MCC', minutos: 30 });
      else if (a === 'COORD_ESTADO') okc && okc(Object.assign({ recuperaCorreo: false }, window._coordEstadoResp || {}));
      else if (a === 'COORD_SALIR') okc && okc({ cerrada: true });
      else okc && okc([]);
    };
  });
  await pg.goto('file://' + ARCHIVO);
  await pg.waitForTimeout(2000);
  await pg.evaluate(() => { const o = document.getElementById('loginOvl'); if (o) o.style.display = 'none'; });

  console.log('\n2 · Entrar guarda el bolsillo de la pestaña');
  await stubGS();
  await pg.evaluate(() => { _coordEntrarCon('coord1', 'clave123'); });
  const bolsillo1 = await pg.evaluate(() => JSON.parse(sessionStorage.getItem('rce_coord_v1') || 'null'));
  si('el bolsillo existe tras entrar', !!bolsillo1);
  si('…con el token de la sesión', bolsillo1 && bolsillo1.token === 'TK1');
  si('…la firma', bolsillo1 && bolsillo1.firma === 'MCC');
  si('…y la última actividad reciente', bolsillo1 && Date.now() - bolsillo1.act < 60000);

  console.log('\n3 · F5 REAL: el bolsillo sobrevive y el candado vuelve solo si el servidor confirma');
  await pg.reload(); await pg.waitForTimeout(2000);
  await pg.evaluate(() => { const o = document.getElementById('loginOvl'); if (o) o.style.display = 'none'; });
  si('tras recargar, la memoria de JS quedó limpia (el bug original)', await pg.evaluate(() => !COORD_TK));
  si('…pero el bolsillo sigue en la pestaña', await pg.evaluate(() => !!sessionStorage.getItem('rce_coord_v1')));
  await stubGS();
  await pg.evaluate(() => { window._coordEstadoResp = { viva: true, firma: 'MCC', usuario: 'coord1' }; _coordReanudar(); });
  await pg.waitForTimeout(400);
  si('el candado se restauró (COORD_TK de vuelta)', await pg.evaluate(() => COORD_TK === 'TK1'));
  si('…preguntándole al servidor por ESE token', await pg.evaluate(() => _gsCalls.some(c => c.a === 'COORD_ESTADO' && c.d && c.d.token === 'TK1')));
  si('…la cabecera muestra 🔓 con la firma', (await pg.locator('#hSesCand').innerText()).includes('🔓') &&
    (await pg.locator('#hSesCandTxt').innerText()).indexOf('MCC') === 0, await pg.locator('#hSesCandTxt').innerText());
  si('…y el vigilante de inactividad quedó armado', await pg.evaluate(() => !!_coordIdleTmr));

  console.log('\n4 · Un bolsillo con >30 min de inactividad se bota SIN preguntar');
  await pg.evaluate(() => {
    coordSalir(); _gsCalls = [];
    sessionStorage.setItem('rce_coord_v1', JSON.stringify({ token: 'TKVIEJO', firma: 'MCC', usuario: 'coord1', act: Date.now() - 31 * 60000 }));
    _coordReanudar();
  });
  await pg.waitForTimeout(300);
  si('no se llamó al servidor (se sabe muerta)', await pg.evaluate(() => !_gsCalls.some(c => c.a === 'COORD_ESTADO' && c.d && c.d.token)));
  si('el bolsillo viejo se botó', await pg.evaluate(() => !sessionStorage.getItem('rce_coord_v1')));
  si('y el candado quedó 🔒', await pg.evaluate(() => !COORD_TK));

  console.log('\n5 · Si el servidor dice «muerta», el navegador NO resucita nada');
  await pg.evaluate(() => {
    sessionStorage.setItem('rce_coord_v1', JSON.stringify({ token: 'TKX', firma: 'MCC', usuario: 'coord1', act: Date.now() }));
    window._coordEstadoResp = { viva: false }; _gsCalls = []; _coordReanudar();
  });
  await pg.waitForTimeout(300);
  si('preguntó por el token', await pg.evaluate(() => _gsCalls.some(c => c.a === 'COORD_ESTADO' && c.d && c.d.token === 'TKX')));
  si('el candado sigue 🔒', await pg.evaluate(() => !COORD_TK));
  si('y el bolsillo muerto se botó', await pg.evaluate(() => !sessionStorage.getItem('rce_coord_v1')));

  console.log('\n6 · Salir borra el bolsillo: un F5 posterior no resucita la sesión cerrada');
  await pg.evaluate(() => {
    COORD_TK = 'TK1'; COORD_FIRMA = 'MCC'; _coordUltimaAct = Date.now(); _coordBolsilloGuardar();
  });
  si('(preparación: el bolsillo está)', await pg.evaluate(() => !!sessionStorage.getItem('rce_coord_v1')));
  await pg.evaluate(() => { coordSalir(); });
  await pg.waitForTimeout(300);
  si('salir limpió memoria Y bolsillo', await pg.evaluate(() => !COORD_TK && !sessionStorage.getItem('rce_coord_v1')));

  console.log('\n7 · La actividad real acompaña al bolsillo (con freno, no por evento)');
  await pg.evaluate(() => {
    COORD_TK = 'TK1'; COORD_FIRMA = 'MCC'; _coordUltimaAct = Date.now() - 20 * 60000; _coordBolsilloGuardar(); _coordBolsilloTs = 0;
    _coordActividad();
  });
  const act2 = await pg.evaluate(() => JSON.parse(sessionStorage.getItem('rce_coord_v1')).act);
  si('una tecla refresca la última actividad del bolsillo', Date.now() - act2 < 60000);

  si('sin errores JS en toda la corrida', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log('\n' + (fails.length ? '❌ ' + fails.length + ' fallo(s): ' + fails.join(' · ') : '✅ coord_f5: todo verde'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('❌ excepción: ' + e.message); process.exit(1); });
