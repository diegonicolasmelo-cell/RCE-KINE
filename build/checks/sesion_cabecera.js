// sesion_cabecera.js — USUARIO Y CANDADO DE COORDINACIÓN EN LA ESQUINA SUPERIOR
// DERECHA, pintados desde el estado real.
//
// 🔴 DE DÓNDE SALE (21-ago-2026, Manuel desde el turno): «el candado y el ➕ no
// sirven para nada, los datos siguen abiertos sin login». Era cierto y no era
// un bug del candado: con AUTH_DEV_MODE=TRUE la app entra sin identidad. La
// pantalla no lo decía en ninguna parte. Pedido: que el usuario y el candado
// vivan en la cabecera, siempre a la vista — y que cuando no hay usuario lo
// DIGA («Sin usuario»), en vez de fingir normalidad.
//
// Se mide en Chromium con el index real, sin fabricar HTML: se cambia el
// estado (YO, COORD_TK) por las mismas variables que usa la app y se llama a
// las mismas funciones (coordInit, hSesRender). Contraste medido en píxeles
// porque la guardia de contraste de coordinación ya se comió una vez un
// texto ilegible por mirar solo nodos de texto.
// Uso: node build/checks/sesion_cabecera.js [ruta.html]
const { chromium } = require('playwright-core');
const path = require('path');
const ARCHIVO = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'v2', 'index.html'));
const fails = [];
const si = (l, c, d) => { console.log((c?'✅':'❌')+' '+l+(d!==undefined?': '+d:'')); if(!c) fails.push(l); };

// Contraste WCAG sobre colores computados (rgb(a)).
const lum = (r,g,b) => { const f=v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);}; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
const parse = c => { const m=String(c).match(/[\d.]+/g)||[0,0,0]; return m.slice(0,3).map(Number); };
const ratio = (a,b) => { const la=lum(...parse(a)), lb=lum(...parse(b)); return (Math.max(la,lb)+0.05)/(Math.min(la,lb)+0.05); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const pg = await b.newPage({ viewport: { width: 1400, height: 800 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + ARCHIVO);
  await pg.waitForTimeout(2000);
  await pg.evaluate(() => { const o = document.getElementById('loginOvl'); if (o) o.style.display = 'none'; });

  si('existe el widget #hSes en la barra de la cabecera', await pg.locator('.hdr .hbar > #hSes').count() === 1);
  si('…con el botón de usuario', await pg.locator('#hSesUsr').count() === 1);
  si('…y el botón del candado', await pg.locator('#hSesCand').count() === 1);

  // Esquina superior DERECHA: más a la derecha que el buscador y dentro de la cabecera.
  const geo = await pg.evaluate(() => {
    const r = s => { const e=document.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect(); return {x:b.left,r:b.right,y:b.top,h:b.height,w:b.width}; };
    return { ses:r('#hSes'), srch:r('#hSrch'), hdr:r('.hdr'), date:r('#gDate') };
  });
  si('el widget está a la derecha del buscador', !!geo.ses && !!geo.srch && geo.ses.x > geo.srch.r, JSON.stringify(geo));
  si('…dentro de la cabecera (arriba)', !!geo.ses && geo.ses.y >= geo.hdr.y && geo.ses.y < geo.hdr.y + geo.hdr.h);
  si('…y visible (ancho > 0)', !!geo.ses && geo.ses.w > 0);

  // Sin servidor YO está vacío → la verdad es «Sin usuario», en ámbar.
  await pg.evaluate(() => { YO = { firma:'', dev:true }; hSesRender(); }); await pg.waitForTimeout(350); // .hbtn tiene transition de fondo
  si('sin identidad dice «Sin usuario»', (await pg.locator('#hSesUsrTxt').innerText()).trim() === 'Sin usuario');
  si('…y va marcado como abierto (ámbar)', await pg.evaluate(() => document.getElementById('hSesUsr').classList.contains('hses-abierto')));
  const cUsr = await pg.evaluate(() => { const e=document.getElementById('hSesUsr'); const cs=getComputedStyle(e); return [cs.color, cs.backgroundColor]; });
  si('contraste del «Sin usuario» ≥ 4,5:1', ratio(cUsr[0], cUsr[1]) >= 4.5, ratio(cUsr[0], cUsr[1]).toFixed(2)+':1');
  // El color se mira de verdad: la piel institucional pinta todos los .hbtn del
  // mismo azul y la primera versión dio verde con el ámbar invisible.
  const cRef = await pg.evaluate(() => getComputedStyle(document.querySelector('.hbar-actions button[onclick="recargar()"]')).backgroundColor);
  si('…y su fondo NO es el azul de los demás botones', cUsr[1] !== cRef, cUsr[1]+' vs '+cRef);
  si('…sino cálido (ámbar: rojo > azul)', (p=>p[0]>p[2])(parse(cUsr[1])), cUsr[1]);

  // Con identidad real muestra la firma y deja de estar en ámbar.
  await pg.evaluate(() => { YO = { firma:'MFB', dev:false, email:'x@y' }; hSesRender(); });
  si('con sesión muestra la firma', (await pg.locator('#hSesUsrTxt').innerText()).trim() === 'MFB');
  si('…sin la marca de abierto', await pg.evaluate(() => !document.getElementById('hSesUsr').classList.contains('hses-abierto')));

  // Candado: cerrado sin sesión de coordinación.
  await pg.evaluate(() => { COORD_TK = null; COORD_FIRMA=''; coordInit(); });
  si('candado cerrado sin sesión (🔒)', (await pg.locator('#hSesCand').innerText()).includes('🔒'));
  si('…rotulado «Coordinación»', (await pg.locator('#hSesCandTxt').innerText()).trim() === 'Coordinación');

  // Tocar el candado cerrado lleva a la pestaña 🔐 y enfoca la clave.
  await pg.evaluate(() => setTab('G'));
  await pg.click('#hSesCand'); await pg.waitForTimeout(400);
  si('tocar el candado cerrado abre la pestaña COORDINACIÓN', await pg.evaluate(() => document.getElementById('tcC').classList.contains('on')));
  si('…y deja el foco en la clave', await pg.evaluate(() => document.activeElement && document.activeElement.id === 'coordClave'));

  // Con sesión: abierto, verde, con la firma — por el MISMO camino que usa la app (coordInit).
  await pg.evaluate(() => { COORD_TK = 'tk'; COORD_FIRMA = 'MCC'; coordInit(); }); await pg.waitForTimeout(350);
  si('con sesión el candado se abre (🔓)', (await pg.locator('#hSesCand').innerText()).includes('🔓'));
  si('…y muestra quién lo abrió y los minutos que quedan', /^MCC · 30'$/.test((await pg.locator('#hSesCandTxt').innerText()).trim()), await pg.locator('#hSesCandTxt').innerText());
  si('…en verde', await pg.evaluate(() => document.getElementById('hSesCand').classList.contains('hses-ok')));
  const cC = await pg.evaluate(() => { const e=document.getElementById('hSesCand'); const cs=getComputedStyle(e); return [cs.color, cs.backgroundColor]; });
  si('contraste del candado abierto ≥ 4,5:1', ratio(cC[0], cC[1]) >= 4.5, ratio(cC[0], cC[1]).toFixed(2)+':1');
  si('…y el fondo es verde de verdad (verde > rojo y > azul)', (p=>p[1]>p[0]&&p[1]>p[2])(parse(cC[1])), cC[1]);

  // ── Cierre por inactividad (21-ago-2026): 30 min sin actividad → se cierra sola.
  si('con sesión, el vigilante de inactividad está armado', await pg.evaluate(() => !!_coordIdleTmr));
  // Actividad real renueva la ventana: se envejece la última actividad y se teclea.
  await pg.evaluate(() => { _coordUltimaAct = Date.now() - 20*60000; });
  si('…a los 20 min sin tocar quedan 10', await pg.evaluate(() => _coordIdleRestanteMin()) === 10);
  await pg.keyboard.press('Shift');
  si('…y una tecla devuelve la ventana a 30', await pg.evaluate(() => _coordIdleRestanteMin()) === 30);
  await pg.evaluate(() => { _coordUltimaAct = Date.now() - 29*60000; _coordIdleCheck(); });
  si('a los 29 min sigue abierta', await pg.evaluate(() => !!COORD_TK));
  await pg.evaluate(() => { _coordUltimaAct = Date.now() - 30*60000; _coordIdleCheck(); });
  await pg.waitForTimeout(400);
  si('a los 30 min sin actividad la sesión se CIERRA', await pg.evaluate(() => !COORD_TK));
  si('…el candado vuelve a 🔒', (await pg.locator('#hSesCand').innerText()).includes('🔒'));
  si('…el vigilante queda desarmado', await pg.evaluate(() => !_coordIdleTmr));
  si('…y la pestaña vuelve a pedir la clave', await pg.evaluate(() => !document.getElementById('coordPuerta').classList.contains('hidden')));
  // Se reabre para probar el clic con sesión.
  await pg.evaluate(() => { COORD_TK = 'tk'; COORD_FIRMA = 'MCC'; coordInit(); }); await pg.waitForTimeout(350);

  // Tocar el candado abierto pide confirmación (no cierra a la primera).
  await pg.click('#hSesCand'); await pg.waitForTimeout(300);
  si('tocar el candado abierto pide confirmar', await pg.evaluate(() => document.getElementById('ucOvl').classList.contains('on')));
  si('…y no cerró la sesión sin confirmar', await pg.evaluate(() => !!COORD_TK));

  si('sin errores JS en toda la corrida', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ Sesión en la cabecera OK');
  process.exit(fails.length ? 1 : 0);
})();
