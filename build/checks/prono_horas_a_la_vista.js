// prono_horas_a_la_vista.js — LAS HORAS DE PRONO SE LEEN SIN PASAR EL MOUSE.
//
// 🔴 DE DÓNDE SALE (30-ago-2026, Manuel desde el turno): «no marca cuántas
// horas lleva de PRONO en la evolución». El cálculo estaba BIEN —en su caso,
// 36,1 h desde el 28-08 20:03— pero la pantalla dibujaba solo el icono ⏱ y el
// número vivía en el atributo `data-tip`, o sea en un tooltip. En el CELULAR,
// que es donde se registra la ronda, no hay hover: ahí el dato no se veía nunca.
//
// Cuántas horas lleva prono un paciente es lo que decide cuándo supinarlo, así
// que va escrito en la franja, no escondido. Esta guardia fija que:
//  1. Con una pronación abierta, las horas se LEEN en la pantalla (texto), y el
//     número que se lee es el mismo que calcula el motor.
//  2. Se leen también a 390×844 (el celular de la ronda), que es el escenario
//     que el tooltip no cubría.
//  3. Al marcar el supino, el total del ciclo que se sella también se lee.
//  4. Sin pronación abierta no se inventa ningún número.
//  5. El tooltip conserva el detalle (desde cuándo) — se suma, no se reemplaza.
//
// 🪤 Se mide el RECTÁNGULO y la opacidad caminando los ancestros, no
// `offsetParent` (trampa de Diego, ago-2026: un panel con opacity:0 da
// display:block, visibility:visible y rect de 508×153 y sale en blanco).
//
// Uso: node build/checks/prono_horas_a_la_vista.js [ruta.html]
const { chromium } = require('playwright-core');
const path = require('path');
const ARCHIVO = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'v2', 'index.html'));
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c, d) => { console.log((c ? '✅' : '❌') + ' ' + l + (d !== undefined ? ': ' + JSON.stringify(d) : '')); if (!c) fails.push(l); };

/* Prepara el turno 29-Noche mirando una pronación abierta del 28 a las 20:03.
   Se llama a las funciones REALES del front, nunca a HTML inventado. */
/* Abre el panel de la cama 8 por su RUTA REAL y deja la franja 🔃 en el estado
   pedido. Dos fases porque `abrirPanel` va al servidor y repinta: montar el
   estado antes sería montarlo sobre un panel que después se borra solo.
   🪤 `#sp` nace con opacity:0 y solo `.on` lo pinta; y la franja del prono solo
   existe con el paciente en VM (`_gatePronoStrip`), así que el soporte se pone
   por el campo real, no forzando el `display`. */
const abrirElPanel = async (pg) => {
  await pg.evaluate(() => {
    const el = document.getElementById('loginOvl'); if (el) el.style.display = 'none';
    window.DB = [{ ID_CAMA: '8', OCUPADA: 'TRUE', PATIENT_ID: 'pTEST', PAC_NOMBRE: 'Paciente de prueba' }];
    window.PRONO_ABIERTO_DOBLE = '';
    window.api = (a) => {
      if (a === 'GET_EVOLUCION') return Promise.resolve({ actual: null, previa: null, pronoAbierto: window.PRONO_ABIERTO_DOBLE });
      if (a === 'GET_TODAS_CAMAS') return Promise.resolve(window.DB);
      if (a === 'GET_EVOS_DEL_DIA') return Promise.resolve([]);
      return Promise.resolve({});
    };
    document.getElementById('gDate').value = '2026-08-29';
    window.SHIFT = 'Noche';
    try { abrirPanel('8'); } catch (e) { window.__errAbrir = e.message; }
  });
  await pg.waitForTimeout(1200);
  await pg.evaluate(() => { document.getElementById('sp').classList.add('on'); });
};

const montar = (pg, opts) => pg.evaluate((o) => {
  /* El paciente en VM: es lo que hace existir la franja del prono. El <select>
     se puebla desde el catálogo del servidor, que aquí está doblado, así que se
     le pone la opción y se dispara su `change` REAL (cascadeSop → el gate), en
     vez de forzarle el `display` a la franja — forzarlo sería pintar a mano una
     pantalla que en el hospital podría no aparecer. */
  const sop = document.getElementById('fSop');
  if (sop) {
    if (!Array.from(sop.options).some(o => o.value === 'VM')) sop.insertAdjacentHTML('beforeend', '<option value="VM">VM</option>');
    sop.value = 'VM';
    sop.dispatchEvent(new Event('change'));
  }
  window._pronoAbierto = o.abierto || '';
  const c = document.getElementById('cProno'); c.checked = !!o.prono;
  document.getElementById('dPronoHora').classList.toggle('hidden', !o.prono);
  const s = document.getElementById('cSupino'); if (s) s.checked = !!o.supino;
  const se = document.getElementById('cSupinoEv'); if (se) se.checked = !!o.supino;
  if (o.supino) {
    document.getElementById('dSupinoHora').classList.remove('hidden');
    document.getElementById('fSupinoHora').value = o.horaSupino || '';
  }
  _updatePronoTip(); _updateSupinoTip();
  return { franjaOculta: document.getElementById('dPronoStrip').classList.contains('hidden') };
}, opts);

/** ¿Se VE de verdad? rect con área + opacidad de todos los ancestros. */
const seVe = (pg, id) => pg.evaluate((elId) => {
  const e = document.getElementById(elId); if (!e) return { existe: false };
  const r = e.getBoundingClientRect();
  let n = e, opaco = true;
  while (n && n !== document.documentElement) {
    const cs = getComputedStyle(n);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) { opaco = false; break; }
    n = n.parentElement;
  }
  return { existe: true, texto: e.textContent.trim(), tip: e.getAttribute('data-tip'),
           ancho: Math.round(r.width), alto: Math.round(r.height), opaco };
}, id);

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });

  /* ══ 1 · Escritorio: el número se lee sin tocar nada ═══════════════════ */
  console.log('\n1 · Escritorio · pronación abierta del 28 a las 20:03');
  const pg = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + ARCHIVO);
  await pg.waitForTimeout(2000);
  await abrirElPanel(pg);
  await montar(pg, { prono: true, abierto: '2026-08-28 20:03' });
  await pg.waitForTimeout(300);
  let v = await seVe(pg, 'sPronoTip');
  si('★ el chip se ve (rect con área y sin ancestro apagado)', v.existe && v.ancho > 0 && v.alto > 0 && v.opaco, v);
  si('★ y dice las horas EN EL TEXTO, no solo en el tooltip', /\d+([.,]\d+)?\s*h/.test(v.texto) && /prono/i.test(v.texto), v.texto);
  si('el tooltip conserva el detalle de desde cuándo', /desde/i.test(String(v.tip)), v.tip);
  // El número escrito es el que calcula el motor, no uno inventado por la vista.
  const delMotor = await pg.evaluate(() => {
    const ini = _pronoInicioTS();
    return _hTxt(_horasTS(ini, _tsEvTurno(v('gDate'), SHIFT, _horaAhoraCli())));
  });
  si('★ el número escrito es el del motor', v.texto.indexOf(delMotor) > -1, { enPantalla: v.texto, delMotor });

  /* ══ 2 · Sin pronación abierta no se inventa nada ══════════════════════ */
  console.log('\n2 · Sin pronación abierta');
  await montar(pg, { prono: false, abierto: '' });
  await pg.waitForTimeout(200);
  v = await seVe(pg, 'sPronoTip');
  si('★ el chip queda oculto', !v.opaco || v.ancho === 0, v);
  si('…y sin número pegado de la vez anterior', !/\d+([.,]\d+)?\s*h/.test(v.texto), v.texto);

  /* ══ 3 · El ciclo que se cierra también se lee ═════════════════════════ */
  console.log('\n3 · Al supinar, el total del ciclo');
  await montar(pg, { prono: false, supino: true, horaSupino: '08:00', abierto: '2026-08-28 20:03' });
  await pg.waitForTimeout(200);
  v = await seVe(pg, 'sSupinoTip');
  si('★ el total del ciclo se lee en pantalla', /\d+([.,]\d+)?\s*h/.test(v.texto), v.texto);
  const cierre = await pg.evaluate(() => _pronoHorasCiclo());
  si('★ y es el que se va a sellar en la ficha', v.texto.indexOf(String(cierre).replace('.', ',')) > -1, { enPantalla: v.texto, seSella: cierre });

  /* ══ 4 · EL CELULAR, que es donde el tooltip no existía ════════════════ */
  console.log('\n4 · Celular 390×844 (la ronda se registra ahí)');
  const cel = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await cel.goto('file://' + ARCHIVO);
  await cel.waitForTimeout(2000);
  await abrirElPanel(cel);
  await montar(cel, { prono: true, abierto: '2026-08-28 20:03' });
  /* En el celular las tarjetas nacen PLEGADAS (`.mcol`): el kinesiólogo toca el
     encabezado de Respiratorio para llegar a la franja. Se hace ese toque, no
     se le quita la clase a mano. */
  const plegada = await cel.evaluate(() => {
    const card = document.getElementById('fSop').closest('.fcard');
    const estaba = card.classList.contains('mcol');
    const hdr = card.querySelector('.fcard-hdr');
    if (hdr) hdr.click();
    return { estaba, sigueePlegada: card.classList.contains('mcol') };
  });
  si('la tarjeta Respiratorio se abre al tocarla', !plegada.sigueePlegada, plegada);
  await cel.waitForTimeout(400);
  v = await seVe(cel, 'sPronoTip');
  si('★ el chip se ve en el celular', v.existe && v.ancho > 0 && v.alto > 0 && v.opaco, v);
  si('★ con las horas escritas (sin hover, que en táctil no existe)', /\d+([.,]\d+)?\s*h/.test(v.texto), v.texto);
  const desborda = await cel.evaluate(() => {
    const s = document.getElementById('dPronoStrip');
    return { anchoFranja: Math.round(s.getBoundingClientRect().width),
             scrollW: Math.round(document.documentElement.scrollWidth), ventana: window.innerWidth };
  });
  si('★ y la franja no empuja la página a lo ancho', desborda.scrollW <= desborda.ventana + 1, desborda);

  si('sin errores JS', errs.length === 0, errs.slice(0, 3));
  await b.close();
  console.log('\n' + (fails.length ? '❌ ' + fails.length + ' fallas:\n  · ' + fails.join('\n  · ')
    : '✅ prono_horas_a_la_vista: todo verde'));
  process.exit(fails.length ? 1 : 0);
})();
