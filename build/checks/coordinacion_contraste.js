// coordinacion_contraste.js — NINGÚN TEXTO DE LA PESTAÑA 🔐 COORDINACIÓN POR
// DEBAJO DEL MÍNIMO LEGIBLE.
//
// 🔴 DE DÓNDE SALE (20-ago-2026, reporte de Manuel: «tiene texto que no se ve o
// se ve muy claro»). Medido en Chromium antes de tocar nada:
//
//   · .pivot-empty  #94a3b8 sobre #eef3f9  →  2,30:1   (mínimo 4,5:1)
//   · .dpset        #64748b sobre #eef3f9  →  4,27:1   (mínimo 4,5:1)
//
// El primero no es decorativo: es la ÚNICA instrucción que ve quien acaba de
// entrar al modo Coordinación («Escribe al menos dos letras, o un RUT»). Y el
// segundo incluye el botón de cerrar sesión. El mismo día, Magdalena entró al
// modo por primera vez y no llegó a corregir nada — no está probado que fuera
// por esto, pero un texto a la mitad del mínimo legible no puede quedar en la
// pantalla que estrena la coordinación.
//
// POR QUÉ UNA GUARDIA Y NO SOLO EL ARREGLO: un color se aclara de nuevo sin que
// nadie lo note, porque en la pantalla del que lo escribe casi siempre se ve.
// Esto lo mide, en píxeles, en cada corrida.
//
// EL UMBRAL es WCAG AA: 4,5:1 para texto normal y 3:1 para texto grande
// (>=24px, o >=18,66px en negrita). No es un gusto: es el mínimo por debajo del
// cual una persona con visión normal ya no lee cómodo bajo la luz de un office.
//
// Uso: node build/checks/coordinacion_contraste.js   (necesita CHROMIUM_PATH)
const path = require('path');
const { chromium } = require('playwright-core');
const INDEX = path.join(__dirname, '..', '..', 'v2', 'index.html');

const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l);
};

const PUENTE = () => {
  window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
    api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
  }; } }; } } } };
};

/** Mide el contraste de cada texto visible de la pestaña, en el navegador. */
const MEDIR = () => {
  const tc = document.getElementById('tcC');
  tc.style.display = 'block'; tc.classList.add('on');
  document.getElementById('coordPanel').classList.remove('hidden');

  // La ficha se pinta por JS, así que se le siembra markup representativo:
  // sin esto la guardia mediría solo la puerta y el panel vacío.
  document.getElementById('coordFicha').innerHTML =
    '<div class="pivot-empty">sin correcciones</div>' +
    '<div class="ficha-chip">Ingreso <b>2026-08-01</b></div>' +
    '<div class="sub-sec-title">Datos corregibles</div>';

  const lum = ([r, g, b]) => {
    const a = [r, g, b].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return .2126 * a[0] + .7152 * a[1] + .0722 * a[2];
  };
  const rgb = s => {
    const m = String(s).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? { c: [+m[1], +m[2], +m[3]], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  // El fondo efectivo NO es el del propio elemento: casi todos son
  // transparentes. Hay que subir por los padres hasta el primero opaco.
  const fondoDe = el => {
    let n = el;
    while (n && n !== document.documentElement) {
      const b = rgb(getComputedStyle(n).backgroundColor);
      if (b && b.a > 0) return b.c;
      n = n.parentElement;
    }
    return [255, 255, 255];
  };

  const out = [];
  tc.querySelectorAll('*').forEach(el => {
    const txt = Array.from(el.childNodes).filter(n => n.nodeType === 3)
      .map(n => n.textContent.trim()).join(' ').trim();
    if (!txt) return;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const fg = rgb(cs.color); if (!fg) return;
    const L1 = lum(fg.c), L2 = lum(fondoDe(el));
    const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const px = parseFloat(cs.fontSize);
    const grande = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
    out.push({ txt: txt.slice(0, 44), ratio: Math.round(ratio * 100) / 100,
      exige: grande ? 3 : 4.5, color: cs.color, cls: String(el.className || '').slice(0, 20) });
  });
  return out;
};

(async () => {
  const br = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
  const pg = await br.newPage({ viewport: { width: 1280, height: 900 } });
  const errores = [];
  pg.on('pageerror', e => errores.push(String(e)));
  await pg.addInitScript(PUENTE);
  await pg.goto('file://' + INDEX);
  await pg.waitForTimeout(700);

  const filas = await pg.evaluate(MEDIR);
  const malos = filas.filter(f => f.ratio < f.exige).sort((a, b) => a.ratio - b.ratio);

  console.log('\nTextos medidos en la pestaña COORDINACIÓN: ' + filas.length);
  malos.forEach(m => console.log('   ⚠️  ' + m.ratio + ':1 (exige ' + m.exige + ')  ' +
    m.color + '  .' + m.cls + '  «' + m.txt + '»'));

  eq('la guardia encontró textos que medir (si es 0, el montaje se rompió)', filas.length > 8, true);
  eq('ningún texto de la pestaña baja del mínimo legible', malos.length, 0);

  // Los dos que originaron la guardia, fijados por su nombre: si alguien los
  // vuelve a aclarar, falla acá y lee arriba por qué.
  const vacio = filas.find(f => /Escribe al menos dos letras/.test(f.txt));
  eq('la instrucción del buscador existe y se lee', vacio ? vacio.ratio >= 4.5 : false, true);
  const salir = filas.find(f => /Cerrar sesi/.test(f.txt));
  eq('el botón de cerrar sesión existe y se lee', salir ? salir.ratio >= 4.5 : false, true);

  eq('sin errores JS', errores.join(' | '), '');
  await br.close();

  console.log(fails.length ? '\n❌ coordinacion_contraste: ' + fails.length + ' fallo(s)' : '\n✅ coordinacion_contraste OK');
  process.exit(fails.length ? 1 : 0);
})();
