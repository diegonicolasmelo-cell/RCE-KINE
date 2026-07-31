/**
 * piel.js — Guardia de la piel institucional San Pablo (v5.4: piel ÚNICA).
 * 1. Contraste AA (≥4.5:1) calculado para los pares de texto clave del tema.
 * 2. En navegador: la piel institucional es la única (sin alternador), el
 *    logo va incrustado y el encabezado es una sola franja compacta.
 */
const path = require('path');
const { chromium } = require('playwright-core');

const lum = hex => {
  const c = hex.replace('#', '');
  const f = i => { let v = parseInt(c.slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4);
};
const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };

const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + g + (okk ? '' : ' (esperado ' + w + ')')); if (!okk) fails.push(l); };

// ── 1. Contraste AA de los pares del tema ──
[
  ['texto sobre fondo app', '#0D2B4E', '#EEF3F9'],
  ['texto atenuado sobre tarjeta', '#5B7793', '#ffffff'],
  ['blanco sobre azul San Pablo', '#ffffff', '#0058A0'],
  ['blanco sobre azul profundo', '#ffffff', '#04345E'],
  ['dorado sobre azul profundo', '#F0A000', '#04345E'],
  ['pestaña inactiva sobre azul', '#cfe3f5', '#0058A0'],
  ['chip ámbar heredado', '#8a5c00', '#fdf3df'],
].forEach(([nombre, fg, bg]) => {
  const r = Math.round(ratio(fg, bg) * 100) / 100;
  eq('AA ' + nombre + ' (' + r + ':1)', r >= 4.5, true);
});

// ── 2. Conmutación real en navegador ──
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
  p.on('pageerror', e => { console.log('❌ error JS: ' + e.message); fails.push('js'); });
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) { setTimeout(() => ok({ ok: true, data: a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {}, CAT_DEF: {} } : (a === 'GET_TODAS_CAMAS' ? [] : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(600);
  const R = await p.evaluate(() => {
    const r = {};
    r.piel = document.documentElement.getAttribute('data-piel');
    r.hdr = getComputedStyle(document.querySelector('.hdr')).backgroundColor;
    r.logoVisible = getComputedStyle(document.querySelector('.hlogo')).display !== 'none';
    r.logoIncrustado = document.querySelector('.hlogo').src.indexOf('data:image/png;base64,') === 0;
    r.logoAlto = Math.round(document.querySelector('.hlogo').getBoundingClientRect().height);
    r.sinAlternador = typeof pielToggle === 'undefined' && !document.getElementById('btnPiel')
      && ![...document.querySelectorAll('#msheet .mit')].some(x => /piel/i.test(x.textContent));
    // encabezado compacto: una sola franja
    const h = document.querySelector('.hdr').getBoundingClientRect();
    r.unaFranja = h.height <= 74;
    // el logo y el reloj conviven en la misma línea
    const lg = document.querySelector('.hlogo').getBoundingClientRect();
    const ck = document.getElementById('clk').getBoundingClientRect();
    r.mismaLinea = Math.abs(lg.top - ck.top) < 40 && ck.left > lg.right;
    return r;
  });
  eq('piel única: institucional', R.piel, 'inst');
  eq('cromo institucional azul profundo', R.hdr, 'rgb(4, 52, 94)');
  eq('logo visible', R.logoVisible, true);
  eq('logo incrustado (base64, sin red)', R.logoIncrustado, true);
  eq('logo grande (>= 44 px)', R.logoAlto >= 44, true);
  eq('sin alternador de piel (Notion retirada de la app)', R.sinAlternador, true);
  eq('encabezado en UNA sola franja (<= 74 px)', R.unaFranja, true);
  eq('logo y reloj en la misma línea', R.mismaLinea, true);
  await b.close();
  console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
