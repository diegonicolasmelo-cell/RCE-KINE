/**
 * piel.js — Guardia de la piel institucional San Pablo (conmutable).
 * 1. Contraste AA (≥4.5:1) calculado para los pares de texto clave del tema.
 * 2. En navegador: la piel por defecto es 'inst', el toggle vuelve a Notion
 *    (portadas .tbanner reaparecen), persiste en localStorage, y el cromo
 *    cambia de color de verdad.
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
    const fondo = () => getComputedStyle(document.querySelector('.hdr')).backgroundColor;
    const r = {};
    r.pielInicial = document.documentElement.getAttribute('data-piel');
    r.hdrInst = fondo();
    pielToggle();
    r.pielTrasToggle = document.documentElement.getAttribute('data-piel');
    r.hdrNotion = fondo();
    r.guardada = localStorage.getItem('RCE_PIEL');
    pielToggle();
    r.hdrVuelta = fondo();
    return r;
  });
  eq('piel por defecto: institucional', R.pielInicial, 'inst');
  eq('cromo institucional azul profundo', R.hdrInst, 'rgb(4, 52, 94)');
  eq('toggle vuelve a Notion', R.pielTrasToggle, 'notion');
  eq('cromo Notion restaurado', R.hdrNotion, 'rgb(14, 58, 95)');
  eq('elección persistida (localStorage)', R.guardada, 'notion');
  eq('segundo toggle regresa a San Pablo', R.hdrVuelta, 'rgb(4, 52, 94)');
  await b.close();
  console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
