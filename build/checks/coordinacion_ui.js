// Prueba de humo de la pestaña Coordinación en Chromium real.
//
// 🪤 21-ago-2026: nació con la ruta FIJA del Mac de Manuel y apuntando a un
// `build/index_cohete.html` que no viaja en el repo — en cualquier otra
// máquina moría con ERR_FILE_NOT_FOUND antes del primer assert (la misma
// clase de trampa que las 37 rutas fijas de Chromium). Ahora usa el fuente
// del repo por ruta relativa, como coordinacion_contraste.js; se le puede
// pasar un cohete como argumento para probar el empaquetado.
// Uso: node build/checks/coordinacion_ui.js [ruta.html]
const { chromium } = require('playwright-core');
const path = require('path');
const ARCHIVO = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'v2', 'index.html'));
const fails = [];
const si = (l, c, d) => { console.log((c?'✅':'❌')+' '+l+(d!==undefined?': '+d:'')); if(!c) fails.push(l); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const pg = await b.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + ARCHIVO);
  await pg.waitForTimeout(2500);

  // Sin servidor el arranque se queda en el overlay de reconexion, que tapa la
  // pagina entera y se come los clics. Se retira igual que hace arranque.js con
  // su puente simulado: lo que se prueba aqui es la pestana, no el boot.
  await pg.evaluate(() => { const o = document.getElementById('loginOvl'); if (o) o.style.display = 'none'; });

  si('el botón COORDINACIÓN existe en la barra',
    await pg.locator('#tabC').count() === 1);
  si('…y la vista también', await pg.locator('#tcC').count() === 1);

  // Entrar a la pestaña
  await pg.evaluate(() => setTab('C'));
  await pg.waitForTimeout(400);
  si('la vista queda activa', await pg.evaluate(() => document.getElementById('tcC').classList.contains('on')));
  si('se ve la PUERTA (pide clave)', await pg.locator('#coordPuerta').isVisible());
  si('el panel está oculto mientras no haya sesión', await pg.locator('#coordPanel').isHidden());
  // La puerta pide un USUARIO genérico (coord1/2/3), no un nombre — la
  // pantalla no debe revelar quién tiene acceso con solo mirarla (19-ago).
  si('el usuario se pide con un campo de texto, no un selector con nombres',
    await pg.locator('#coordUsuario').count() === 1);
  si('…y NO quedó ningún selector viejo de firma en la puerta',
    await pg.locator('#coordPuerta select').count() === 0);
  si('la clave se escribe enmascarada',
    await pg.getAttribute('#coordClave', 'type') === 'password');

  // El HTML servido no debe traer nombres reales en la puerta: ni el de
  // Magdalena (ninguna forma) ni ninguna sigla clínica, sea cual sea.
  const puertaHTML = await pg.locator('#coordPuerta').innerHTML();
  si('el HTML de la puerta no menciona a Magdalena', !/Magdalena|Contardo|Contando/i.test(puertaHTML));
  si('…ni ninguna de las tres firmas clínicas (MCC/DMV/MFB)',
    !/\bMCC\b|\bDMV\b|\bMFB\b/.test(puertaHTML));

  // Entrar sin usuario ni clave no debe llamar al servidor
  await pg.click('#coordPuerta button.btn-p');
  await pg.waitForTimeout(300);
  si('entrar sin nada avisa y no llama al servidor',
    (await pg.locator('#coordErr').innerText()).length > 0,
    await pg.locator('#coordErr').innerText());

  // Con usuario pero sin clave, el aviso es el de la clave (orden de validación).
  await pg.fill('#coordUsuario', 'coord1');
  await pg.click('#coordPuerta button.btn-p');
  await pg.waitForTimeout(300);
  si('con usuario y sin clave, avisa específicamente por la clave',
    (await pg.locator('#coordErr').innerText()).toLowerCase().includes('clave'),
    await pg.locator('#coordErr').innerText());

  // El enlace de recuperacion por correo NO debe ofrecerse mientras el
  // interruptor este apagado: prometer un camino que el servidor va a rechazar
  // es peor que no ofrecerlo. Sin servidor, COORD_ESTADO nunca responde, asi
  // que debe seguir oculto — que es exactamente el comportamiento seguro.
  si('el enlace «¿Olvidaste tu clave?» existe pero está oculto',
    await pg.locator('#coordOlvide').count() === 1 && await pg.locator('#coordOlvide').isHidden());

  si('sin errores JS en toda la corrida', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ UI de coordinación OK');
  process.exit(fails.length ? 1 : 0);
})();
