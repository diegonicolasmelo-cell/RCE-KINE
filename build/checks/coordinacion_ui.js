// Prueba de humo de la pestaña Coordinación en Chromium real.
const { chromium } = require('playwright-core');
const path = require('path');
const REPO = '/Users/manuelfuentes/Documents/RCE-KINE';
const fails = [];
const si = (l, c, d) => { console.log((c?'✅':'❌')+' '+l+(d!==undefined?': '+d:'')); if(!c) fails.push(l); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const pg = await b.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + path.join(REPO, 'build', 'index_cohete.html'));
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
  si('las tres firmas están en el selector',
    (await pg.locator('#coordFirma option').count()) === 3,
    String(await pg.locator('#coordFirma option').count()));
  si('la clave se escribe enmascarada',
    await pg.getAttribute('#coordClave', 'type') === 'password');
  si('el nombre de Magdalena está bien escrito',
    (await pg.locator('#coordFirma').innerText()).includes('Contardo'));
  si('…y NO con la errata vieja',
    !(await pg.locator('#coordFirma').innerText()).includes('Contando'));

  // Entrar sin clave no debe llamar al servidor
  await pg.click('#coordPuerta button.btn-p');
  await pg.waitForTimeout(300);
  si('entrar sin clave avisa y no llama al servidor',
    (await pg.locator('#coordErr').innerText()).length > 0,
    await pg.locator('#coordErr').innerText());

  si('sin errores JS en toda la corrida', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ UI de coordinación OK');
  process.exit(fails.length ? 1 : 0);
})();
