// mover_camas.js — Guardia del movimiento de pacientes entre camas (v5.4).
// BUG reportado por Diego (ago-2026): no se podía mover un paciente a una cama
// VACÍA porque esa tarjeta solo ofrecía «+ Ingresar Paciente» — el movimiento
// quedaba a medias y nunca llegaba al servidor.
// Uso: node build/checks/mover_camas.js
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  const llamadas = [];
  await p.exposeFunction('__log', (a, d) => llamadas.push({ a, d }));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) { window.__log(a, d);
        const R = { GET_CONFIG_UI: { NUM_CAMAS: 3, BANNERS: {} },
          GET_TODAS_CAMAS: [
            { ID_CAMA: '1', OCUPADA: true, NOMBRE: 'Juan Pérez', EDAD: 64, SEXO: 'M', DIAGNOSTICO: 'NAC', VIA_AEREA: 'TOT', SOPORTE: 'VM', FECHA_INGRESO: '2026-07-26' },
            { ID_CAMA: '2', OCUPADA: false },
            { ID_CAMA: '3', OCUPADA: true, NOMBRE: 'Rosa Rojas', EDAD: 70, SEXO: 'F', DIAGNOSTICO: 'EPOC', VIA_AEREA: 'Natural', SOPORTE: 'CNAF', FECHA_INGRESO: '2026-07-29' }],
          GET_CATALOGO: ['Weaning'], MOVER_A_CAMA_VACIA: { ok: true }, INTERCAMBIAR_CAMAS: { ok: true } };
        setTimeout(() => ok({ ok: true, data: R[a] !== undefined ? R[a] : null }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(900);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  // ── Estado normal: ninguna tarjeta ofrece acciones de movimiento ──
  const NORMAL = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('#bedGrid .bcard')];
    return { sinBotones: cards.every(c => !/Mover aquí|Intercambiar con|Cancelar movimiento/.test(c.textContent)),
      hayBotonMover: !!document.querySelector('#bedGrid .bmov') };
  });
  eq('sin movimiento en curso: no hay botones de destino', NORMAL.sinBotones, true);
  eq('la cama ocupada ofrece el botón para mover al paciente', NORMAL.hayBotonMover, true);

  // ── Con un movimiento en curso, CADA tarjeta ofrece su acción ──
  const EN_CURSO = await p.evaluate(async () => {
    document.querySelector('#bedGrid .bcard .bmov').click();   // ⇄ de la cama 1
    await new Promise(r => setTimeout(r, 150));
    const cards = [...document.querySelectorAll('#bedGrid .bcard')];
    return {
      origen: /Cancelar movimiento/.test(cards[0].textContent),
      libre: /Mover aquí/.test(cards[1].textContent),
      ocupada: /Intercambiar con esta cama/.test(cards[2].textContent),
      resaltada: cards[0].classList.contains('sel'),
    };
  });
  eq('la cama de origen ofrece cancelar', EN_CURSO.origen, true);
  eq('LA CAMA VACÍA ofrece «Mover aquí» (bug corregido)', EN_CURSO.libre, true);
  eq('otra cama ocupada ofrece intercambiar', EN_CURSO.ocupada, true);
  eq('la cama de origen queda resaltada', EN_CURSO.resaltada, true);

  // ── Mover a la cama vacía: llega al servidor con la acción correcta ──
  await p.evaluate(async () => {
    [...document.querySelectorAll('#bedGrid .bcard')][1].querySelector('.bfoot button').click();
    await new Promise(r => setTimeout(r, 200));
    $('ucOk').click();
    await new Promise(r => setTimeout(r, 300));
  });
  const mov = llamadas.filter(x => x.a === 'MOVER_A_CAMA_VACIA');
  eq('se llamó MOVER_A_CAMA_VACIA', mov.length, 1);
  eq('con origen y destino correctos', mov[0] && mov[0].d.idOrigen === '1' && mov[0].d.idDestino === '2', true);

  // ── Intercambio entre dos camas ocupadas ──
  await p.evaluate(async () => {
    DB = [{ ID_CAMA: '1', OCUPADA: true, NOMBRE: 'Juan Pérez', FECHA_INGRESO: '2026-07-26' },
      { ID_CAMA: '2', OCUPADA: false },
      { ID_CAMA: '3', OCUPADA: true, NOMBRE: 'Rosa Rojas', FECHA_INGRESO: '2026-07-29' }];
    MOVECAMA = null; renderGrid();
    document.querySelector('#bedGrid .bcard .bmov').click();
    await new Promise(r => setTimeout(r, 120));
    [...document.querySelectorAll('#bedGrid .bcard')][2].querySelector('.bfoot button').click();
    await new Promise(r => setTimeout(r, 200));
    $('ucOk').click();
    await new Promise(r => setTimeout(r, 300));
  });
  const inter = llamadas.filter(x => x.a === 'INTERCAMBIAR_CAMAS');
  eq('se llamó INTERCAMBIAR_CAMAS entre dos ocupadas', inter.length, 1);

  // ── Cancelar deja todo como estaba ──
  const CANCEL = await p.evaluate(async () => {
    MOVECAMA = null; renderGrid();
    document.querySelector('#bedGrid .bcard .bmov').click();
    await new Promise(r => setTimeout(r, 120));
    document.querySelector('#bedGrid .bcard .bfoot button').click();   // Cancelar
    await new Promise(r => setTimeout(r, 150));
    return { movecama: MOVECAMA,
      sinBotones: [...document.querySelectorAll('#bedGrid .bcard')].every(c => !/Mover aquí/.test(c.textContent)) };
  });
  eq('cancelar limpia el movimiento en curso', CANCEL.movecama, null);
  eq('y las tarjetas vuelven a su estado normal', CANCEL.sinBotones, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
