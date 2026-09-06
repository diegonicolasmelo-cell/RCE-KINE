// fss_ne.js — 📋 EL «NO EVALUABLE» DEL FSS-ICU SEGÚN EL MANUAL (v5.95,
// 5-sep-2026). Diego citó la regla del manual oficial (improvelto.com;
// versión chilena de González-Seguel/Merino-Osorio) y la literatura la
// confirma: lo no realizable por causa DISTINTA a debilidad NO se puntúa
// (no es 0); hasta 2 ítems así se imputan con el PROMEDIO de los
// puntuados; con más de 2 el total NO se calcula. El 0 queda reservado
// para la debilidad real. Antes la app sumaba a secas y el colega debía
// elegir entre mentir un 0 o perder la evaluación.
// Uso: node build/checks/fss_ne.js (requiere playwright-core)
const path = require('path');
const { chromium } = require('playwright-core');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);

  const R = await p.evaluate(() => {
    const r = {};
    const pon = xs => { [1, 2, 3, 4, 5].forEach((i) => { $('fFssIt' + i).value = xs[i - 1]; }); sumFSS(); };
    r.opcionNE = [...$('fFssIt1').options].some(o => o.value === 'NE' && /distinta a debilidad/.test(o.textContent));
    r.cero = [...$('fFssIt1').options].some(o => o.value === '0' && /debilidad/.test(o.textContent));
    // Los 5 puntuados: suma normal
    pon(['3', '4', '5', '2', '1']); r.normal = v('fFSS');
    // 2 NE: promedio imputado — 3+4+5=12, prom 4 ⇒ 12+2·4=20
    pon(['3', '4', '5', 'NE', 'NE']); r.dosNE = v('fFSS'); r.msj2 = $('fssItSum').textContent;
    // 3 NE: NO calculable
    pon(['3', '4', 'NE', 'NE', 'NE']); r.tresNE = v('fFSS'); r.msj3 = $('fssItSum').textContent;
    // Promedio con redondeo: 3+4+6=13, prom 4,33 ⇒ 13+2·4,33=21,67 → 22
    pon(['3', '4', '6', 'NE', 'NE']); r.redondeo = v('fFSS');
    // Un ítem sin declarar: parcial, sin total
    pon(['3', '4', '5', 'NE', '']); r.parcial = v('fFSS'); r.msjP = $('fssItSum').textContent;
    // El payload del guardado viaja con el NE literal
    pon(['3', '4', '5', 'NE', 'NE']);
    r.payload = v('fFssIt4');
    return r;
  });
  si('★ los 5 ítems ofrecen «NE — no evaluable por causa distinta a debilidad»', R.opcionNE);
  si('…y el 0 sigue reservado para la debilidad real', R.cero);
  eq('con los 5 puntuados, suma normal (3+4+5+2+1)', R.normal, '15');
  eq('★ 2 NE: imputa el promedio del manual (12 + 2×4 = 20)', R.dosNE, '20');
  si('…y el mensaje lo explica', /2 ítem\(s\) NE imputado/.test(R.msj2) && /promedio 4\.0/.test(R.msj2));
  eq('★ 3 NE: el total NO se calcula', R.tresNE, '');
  si('…y lo dice con la regla («hasta 2»)', /NO calculable/.test(R.msj3) && /hasta 2/.test(R.msj3));
  eq('★ el promedio imputado se redondea (13+2×4,33 → 22)', R.redondeo, '22');
  eq('un ítem sin declarar deja el total vacío', R.parcial, '');
  si('…pidiendo declararlo (puntaje o NE)', /por declarar/.test(R.msjP));
  eq('el NE viaja literal en el ítem al guardar', R.payload, 'NE');

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
