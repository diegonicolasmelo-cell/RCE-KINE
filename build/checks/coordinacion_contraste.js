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
// 🔴 ESTA GUARDIA YA FALLÓ UNA VEZ, Y ASÍ (20-ago-2026, misma tarde). Nació
// midiendo solo NODOS DE TEXTO y montando una ficha INVENTADA. Dio verde, se
// publicó la V36 — y Manuel mandó una captura donde los valores de la ficha
// seguían sin verse. Dos agujeros a la vez:
//
//   1. Un <input value="…"> NO TIENE NODOS DE TEXTO. La guardia era ciega a
//      todos los campos de formulario, que es JUSTO de lo que está hecha la
//      pantalla donde se corrigen fichas.
//   2. Montaba markup falso en #coordFicha en vez de llamar a la función real
//      que la pinta, así que medía una ficha que no existe.
//
// Lección, la de siempre en este proyecto: VERDE NO ES CORRECTO. Una guardia
// que no reproduce la pantalla real solo se mide a sí misma.
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
const MEDIR = async () => {
  const tc = document.getElementById('tcC');
  tc.style.display = 'block'; tc.classList.add('on');
  document.getElementById('coordPanel').classList.remove('hidden');

  // 🔴 La ficha se pinta con la FUNCIÓN REAL del front, no con markup inventado.
  // Es la diferencia entre medir la pantalla y medir una maqueta.
  coordPintarFicha({
    tipo: 'egresado', nombre: 'PACIENTE DE PRUEBA', idCama: '10', dias: 28,
    campos: [
      { campo: 'FECHA_INGRESO', etiqueta: 'Fecha de ingreso', tipo: 'fecha',
        valor: '2026-08-01', hora: '07:06', corregido: false },
      { campo: 'FECHA_INICIO_VM', etiqueta: 'Inicio de ventilación', tipo: 'fecha',
        valor: '2026-08-01', hora: '07:06', corregido: true },
      { campo: 'NOMBRE', etiqueta: 'Nombre', tipo: 'texto', valor: 'PACIENTE DE PRUEBA' },
      { campo: 'RUT', etiqueta: 'RUT', tipo: 'texto', valor: '11111111-1' },
      { campo: 'EDAD', etiqueta: 'Edad', tipo: 'texto', valor: '86' },
    ],
    correcciones: [{ c: 'FECHA_INGRESO', a: '2026-08-01', n: '2026-07-06',
                     f: 'MCC', ts: '2026-08-20 15:00' }],
  });

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

  // 🔑 El dialogo de clave se monta llamando a la funcion REAL del front. No se
  // hace `await`: solo interesa que quede montado en el DOM. Ahi viven los
  // campos con los que se cambia la clave — y tambien son fondo blanco.
  try { coordCambiarClavePedir(false); } catch (e) {}
  await new Promise(r => setTimeout(r, 150));

  const out = [];
  const medir = (el, txt, queEs) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return;
    const fg = rgb(cs.color); if (!fg) return;
    // El fondo de un input es el SUYO si es opaco; si es translúcido (el caso de
    // .datein, blanco al 12%), lo que manda es lo que hay debajo.
    const L1 = lum(fg.c), L2 = lum(fondoDe(el));
    const ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const px = parseFloat(cs.fontSize);
    const grande = px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700);
    out.push({ txt: String(txt).slice(0, 44), ratio: Math.round(ratio * 100) / 100,
      exige: grande ? 3 : 4.5, color: cs.color, queEs: queEs,
      cls: String(el.className || '').slice(0, 20) });
  };

  // Las zonas a medir: la pestaña entera MAS la tarjeta del dialogo, que cuelga
  // del body y no de #tcC.
  const zonas = [tc];
  const card = document.querySelector('.uc-card');
  if (card) zonas.push(card);

  zonas.forEach(z => z.querySelectorAll('*').forEach(el => {
    const txt = Array.from(el.childNodes).filter(n => n.nodeType === 3)
      .map(n => n.textContent.trim()).join(' ').trim();
    if (txt) medir(el, txt, 'texto');
  }));

  // 🔴 LO QUE FALTABA: los campos de formulario. Un <input value="…"> no tiene
  // nodos de texto, así que el barrido de arriba NO LO VE — y la pantalla de
  // coordinación es casi toda inputs.
  zonas.forEach(z => z.querySelectorAll('input, textarea, select').forEach(el => {
    if (el.type === 'hidden' || el.type === 'button' || el.type === 'submit') return;
    if (el.value) medir(el, el.value, 'valor de campo');
    if (el.placeholder) medir(el, el.placeholder, 'placeholder');
    if (!el.value && !el.placeholder) medir(el, '(campo vacío)', 'campo vacío');
  }));
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

  // Los campos de formulario son el grueso de esta pantalla: si el barrido no
  // los ve, la guardia vuelve a ser la de antes (verde y ciega).
  const campos = filas.filter(f => /valor de campo|placeholder|campo vacío/.test(f.queEs || ''));
  eq('la guardia MIDE campos de formulario, no solo texto', campos.length >= 8, true);
  const claves = filas.filter(f => /campo vacío/.test(f.queEs || ''));
  eq('los campos de clave se leen', claves.every(c => c.ratio >= 4.5), true);

  eq('sin errores JS', errores.join(' | '), '');
  await br.close();

  console.log(fails.length ? '\n❌ coordinacion_contraste: ' + fails.length + ' fallo(s)' : '\n✅ coordinacion_contraste OK');
  process.exit(fails.length ? 1 : 0);
})();
