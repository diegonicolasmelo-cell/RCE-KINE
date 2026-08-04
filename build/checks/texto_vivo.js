/**
 * texto_vivo.js — El texto clínico se regenera con los CHIPS, no solo con los
 * campos escritos.
 *
 * BUG QUE LA ORIGINA (ago-2026, reporte de Diego): marcó «KTM nivel 1» y la
 * evolución siguió diciendo «KTM contraindicada». Causa: la regeneración en
 * vivo se enganchaba a 'input' y 'change' del formulario, pero el estado y el
 * nivel de KTM son <button type="button"> — un botón NO emite esos eventos, y
 * marcar .checked por código tampoco. El texto quedaba congelado narrando la
 * réplica del TURNO ANTERIOR hasta que el colega tocara por casualidad un
 * campo escrito. Mismo tropiezo que ya había costado el riel en v5.25.
 *
 * Uso: node build/checks/texto_vivo.js [ruta.html]   (por defecto v2/index.html)
 */
const path = require('path');
const { chromium } = require('playwright-core');
const archivo = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'v2', 'index.html'));

let fallas = 0;
const ok = (cond, msg) => { if (!cond) { fallas++; console.log('  ✗ ' + msg); } else console.log('  ✓ ' + msg); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(k) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => k({ ok: true, data:
        a === 'WHOAMI' ? { email: 'x@y.cl', firma: 'DMV', dev: true } :
        a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {}, CAT_DEF: {} } :
        a === 'GET_TODAS_CAMAS' ? [] : null }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + archivo);
  await p.waitForTimeout(2200);

  console.log('\nTEXTO EN VIVO — los chips también regeneran');

  // Punto de partida: la réplica del turno anterior dejó KTM CONTRAINDICADA.
  await p.evaluate(() => {
    document.getElementById('rarea')?.classList.remove('hidden');
    setKTMstate('s');
    document.getElementById('fKTMraz').value = 'inestabilidad hemodinámica';
    document.getElementById('rtxt').value = genTexto();
    _marcarTextoGenerado(document.getElementById('rtxt').value);
  });
  const antes = await p.evaluate(() => document.getElementById('rtxt').value);
  ok(/KTM contraindicada/i.test(antes), 'parte narrando la contraindicación heredada');

  // El colega marca «Realizada» y «nivel 1» — SOLO con clics, sin tocar campos.
  await p.evaluate(() => {
    document.getElementById('bKTMr').click();
    document.querySelector('.ktm-niv-btn[data-niv="1"]').click();
  });
  await p.waitForTimeout(500); // debounce de _rtxtLive (250 ms)
  const despues = await p.evaluate(() => document.getElementById('rtxt').value);

  ok(/Se realiza KTM nivel 1/i.test(despues), 'el clic en los chips REGENERA el texto');
  ok(!/KTM contraindicada/i.test(despues), 'la frase heredada ya NO aparece');

  // El nivel también manda: cambiar de chip cambia la frase.
  await p.evaluate(() => document.querySelector('.ktm-niv-btn[data-niv="4"]').click());
  await p.waitForTimeout(500);
  const niv4 = await p.evaluate(() => document.getElementById('rtxt').value);
  ok(/nivel 4/i.test(niv4), 'cambiar de nivel actualiza la frase');

  // Con edición manual en curso la regeneración sigue EN PAUSA (no se pisa
  // lo que el colega escribió a mano) — el clic no puede saltarse ese guard.
  await p.evaluate(() => {
    const t = document.getElementById('rtxt');
    t.value = 'Texto escrito a mano por el colega.';
    t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await p.evaluate(() => document.querySelector('.ktm-niv-btn[data-niv="2"]').click());
  await p.waitForTimeout(500);
  const manual = await p.evaluate(() => document.getElementById('rtxt').value);
  ok(manual === 'Texto escrito a mano por el colega.', 'con edición manual el clic NO pisa el texto');

  // ── Red de seguridad: con edición manual, el desfase se DETECTA ──
  // (la regeneración está en pausa por diseño, así que el texto puede quedar
  // narrando una versión vieja del turno sin que nadie lo note)
  console.log('\nDESFASE — el texto contradice lo registrado');
  const D = await p.evaluate(() => {
    // El colega parte de un texto del motor con KTM contraindicada…
    setKTMstate('s');
    document.getElementById('fKTMraz').value = 'inestabilidad hemodinámica';
    const t = document.getElementById('rtxt');
    t.value = genTexto();
    _marcarTextoGenerado(t.value);
    // …lo retoca a mano (la regeneración queda EN PAUSA)…
    t.value = t.value + '\nSe agrega observación del colega.';
    t.dispatchEvent(new Event('input', { bubbles: true }));
    const pausada = _textoManual;
    // …y DESPUÉS registra que la KTM sí se hizo.
    document.getElementById('bKTMr').click();
    document.querySelector('.ktm-niv-btn[data-niv="1"]').click();
    return { pausada, desfases: _bloquesDesfasados(), textoIntacto: /observación del colega/.test(t.value) };
  });
  ok(D.pausada, 'el retoque a mano pausa la regeneración (comportamiento de siempre)');
  ok(D.textoIntacto, 'lo escrito a mano NO se pisa');
  ok(D.desfases.some(x => /KTM/i.test(x.bloque)), 'se detecta que el bloque KTM quedó desfasado');
  ok(D.desfases.some(x => /contraindicada/i.test(x.antes) && /nivel 1/i.test(x.ahora)),
     'el aviso dice qué narra el texto y qué se registró de verdad');

  // Sin edición manual NO hay nada que avisar: el texto se regeneró solo.
  const sinManual = await p.evaluate(() => {
    document.getElementById('rtxt').value = genTexto();
    _marcarTextoGenerado(document.getElementById('rtxt').value);
    return _bloquesDesfasados().length;
  });
  ok(sinManual === 0, 'sin edición manual no se avisa nada');

  ok(errs.length === 0, 'sin errores de JavaScript' + (errs.length ? ': ' + errs[0] : ''));

  await b.close();
  console.log(fallas ? `\n❌ ${fallas} falla(s)` : '\n✅ texto_vivo OK');
  process.exit(fallas ? 1 : 0);
})();
