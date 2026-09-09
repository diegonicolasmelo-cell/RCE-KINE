// fiestas_patrias.js — Don Mauri de huaso (v6.23, 9-sep-2026, pedido de Diego).
//
// Diego mandó dos videos de 8 s y 2,6 MB cada uno. Tal cual no entraban —el
// archivo que se pega habría pasado de 1,78 a 6,4 MB—, así que se convirtieron
// a DOCE CUADROS cada uno, a 5 por segundo, que es lo que él eligió:
//   · el del TERREMOTO en la pantalla de carga,
//   · el del EMBOQUE en la mascota de abajo a la derecha.
//
// 🪤 LA FECHA SE INVENTA, NO SE ESPERA. Esta guardia probaría una vez al año si
// dependiera del calendario — y esta misma mañana dos guardias se pusieron
// rojas solas justamente por anclar fechas. `esFiestasPatrias(d)` recibe la
// fecha para poder empujarla a septiembre y a cualquier otro mes.
//
// Uso: node build/checks/fiestas_patrias.js
const path = require('path');
const { chromium } = require('playwright-core');
const V2 = path.resolve(__dirname, '..', '..', 'v2');

(async () => {
  const fails = [];
  const eq = (l, g, w) => { const ok = String(g) === String(w);
    console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g));
    if (!ok) { fails.push(l); console.log('   esperado: ' + JSON.stringify(w)); } };
  const si = (l, g) => eq(l, !!g, 'true');

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { const R = { GET_CONFIG_UI: { NUM_CAMAS: 12, BANNERS: {}, FIESTAS_PATRIAS: '16-20' } };
        setTimeout(() => ok({ ok: true, data: R[a] !== undefined ? R[a] : null }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(V2, 'index.html'));
  await p.waitForTimeout(800);

  console.log('\n1 · Qué días celebra (la fecha se inventa)');
  const dias = await p.evaluate(() => ({
    d15: esFiestasPatrias(new Date(2026, 8, 15)),
    d16: esFiestasPatrias(new Date(2026, 8, 16)),
    d18: esFiestasPatrias(new Date(2026, 8, 18)),
    d20: esFiestasPatrias(new Date(2026, 8, 20)),
    d21: esFiestasPatrias(new Date(2026, 8, 21)),
    agosto: esFiestasPatrias(new Date(2026, 7, 18)),
    otroAnio: esFiestasPatrias(new Date(2031, 8, 18)),
  }));
  eq('★ el 15 todavía no', dias.d15, 'false');
  eq('★ del 16 al 20 sí', [dias.d16, dias.d18, dias.d20].join(','), 'true,true,true');
  eq('★ el 21 ya no', dias.d21, 'false');
  eq('★ un 18 de AGOSTO no celebra (el mes también se mira)', dias.agosto, 'false');
  eq('…y cualquier otro año sí, porque es fecha fija', dias.otroAnio, 'true');

  console.log('\n2 · La ventana se puede mover desde la planilla');
  const vent = await p.evaluate(() => {
    localStorage.setItem('rce_f18_dias', '18-19');
    const a = { d17: esFiestasPatrias(new Date(2026,8,17)), d18: esFiestasPatrias(new Date(2026,8,18)) };
    localStorage.setItem('rce_f18_dias', 'cualquier cosa');   // basura: se cae al defecto
    a.basura16 = esFiestasPatrias(new Date(2026,8,16));
    localStorage.removeItem('rce_f18_dias');
    return a;
  });
  eq('★ con «18-19» en CONFIG, el 17 queda fuera', vent.d17, 'false');
  eq('…y el 18 adentro', vent.d18, 'true');
  eq('★ con un valor mal escrito se cae al defecto, no se apaga', vent.basura16, 'true');

  console.log('\n3 · Los cuadros son los que pidió Diego');
  const cu = await p.evaluate(() => ({
    carga: M18.carga.length, esquina: M18.esquina.length,
    webp: M18.carga.concat(M18.esquina).every(x => x.slice(0,4) === 'UklG'),
    ms: F18_MS,
    distintos: new Set(M18.carga).size,
  }));
  eq('★ doce cuadros para la carga', cu.carga, 12);
  eq('★ doce para la esquina', cu.esquina, 12);
  eq('★ los 24 son WebP de verdad', cu.webp, 'true');
  eq('★ cinco cuadros por segundo (200 ms)', cu.ms, 200);
  eq('…y los doce son distintos entre sí (no se repite uno)', cu.distintos, 12);

  console.log('\n4 · La pantalla de carga celebra, y el cumpleaños le gana');
  const carga = await p.evaluate(async () => {
    const l = document.getElementById('lov');
    l.className = ''; localStorage.removeItem('rce_cumple_dia');
    // se fuerza la fecha empujando la ventana al día de hoy
    const h = new Date(); localStorage.setItem('rce_f18_dias', h.getDate() + '-' + h.getDate());
    const era = esFiestasPatrias(new Date(h.getFullYear(), 8, h.getDate()));
    // se llama con la fecha de septiembre inyectada
    const orig = window.esFiestasPatrias;
    window.esFiestasPatrias = () => true;
    lov18();
    const r = { clase: l.classList.contains('f18'),
                banderas: document.querySelectorAll('#lovF18 svg').length,
                msg: document.getElementById('lmsg').textContent };
    const img = l.querySelector('.masc-persona');
    const a = img.src; await new Promise(s => setTimeout(s, 460)); r.cambio = (img.src !== a);
    // ahora con cumpleaños: manda el cumpleaños
    clearInterval(_f18Carga); l.className = '';
    localStorage.setItem('rce_cumple_dia', hoy());
    document.getElementById('lovF18').innerHTML = '';
    lov18();
    r.conCumple = l.classList.contains('f18');
    window.esFiestasPatrias = orig; localStorage.removeItem('rce_cumple_dia');
    localStorage.removeItem('rce_f18_dias');
    return r;
  });
  si('★ la pantalla de carga se pone de fiesta', carga.clase);
  si('★ …con las banderitas DIBUJADAS (no el emoji, que en Windows sale «CL»)', carga.banderas >= 20);
  eq('★ …y el saludo del 18', carga.msg, '¡Felices Fiestas Patrias!');
  si('★ …y la animación corre de verdad (el cuadro cambia)', carga.cambio);
  eq('★ si alguien cumple años ese día, GANA EL CUMPLEAÑOS', carga.conCumple, 'false');

  console.log('\n5 · Un día normal no cambia nada');
  const normal = await p.evaluate(() => {
    const l = document.getElementById('lov'); l.className = '';
    document.getElementById('lovF18').innerHTML = '';
    const orig = window.esFiestasPatrias; window.esFiestasPatrias = () => false;
    lov18();
    const r = { clase: l.classList.contains('f18'), adornos: document.querySelectorAll('#lovF18 svg').length };
    window.esFiestasPatrias = orig; return r;
  });
  eq('★ sin fiesta no hay clase de fiesta', normal.clase, 'false');
  eq('…ni adornos colgando', normal.adornos, 0);

  console.log('\n6 · La mascota de la esquina juega al emboque');
  const esq = await p.evaluate(async () => {
    CUMPLES = [];
    const orig = window.esFiestasPatrias; window.esFiestasPatrias = () => true;
    try { localStorage.setItem('rce_mascota', 'persona'); } catch(e) {}
    document.documentElement.setAttribute('data-masc', 'persona');
    mauriEstado();
    const im = document.querySelector('#tutBtn .masc-persona');
    const a = im.src; await new Promise(s => setTimeout(s, 460));
    const r = { anima: im.src !== a, corriendo: _f18Esq !== null };
    // con cumpleaños manda el cumpleaños, igual que en la carga
    CUMPLES = [{ firma: 'DMV', nombre: 'Diego' }];
    mauriEstado();
    r.conCumple = (_f18Esq !== null);
    CUMPLES = []; window.esFiestasPatrias = orig;
    return r;
  });
  si('★ la mascota de abajo a la derecha se anima', esq.anima);
  si('…con su propio intervalo', esq.corriendo);
  eq('★ y el cumpleaños también le gana acá', esq.conCumple, 'false');

  console.log('\n6b · Los cuadros no traen el suelo pintado');
  // 🪤 El video venía con el huaso parado sobre ARENA, y ese suelo es opaco.
  // En la pantalla de carga no se nota; en el botón de 62 px, encima de una
  // tarjeta, se veía un ladrillo beige de borde duro. Se recortó (v6.24).
  // 🔴 NO se mide «hay algo opaco abajo»: los ZAPATOS llegan al borde y eso es
  // correcto. Lo que delata al suelo es que CRUZA TODO EL ANCHO. Medido: con
  // suelo la fila de abajo iba al 100 %; sin él, la esquina marca 0 % y los
  // pies de la pantalla de carga llegan a 26 %. El corte va en 60 %.
  const suelo = await p.evaluate(async () => {
    const ancho = (b64) => new Promise(res => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas');
        c.width = im.width; c.height = im.height;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        let peor = 0;
        for (let y = 1; y <= 3; y++) {
          const d = x.getImageData(0, im.height - y, im.width, 1).data;
          let op = 0;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 200) op++;
          peor = Math.max(peor, Math.round(100 * op / im.width));
        }
        res(peor);
      };
      im.src = 'data:image/webp;base64,' + b64;
    });
    const r = { esquina: 0, carga: 0 };
    for (const c of M18.esquina) r.esquina = Math.max(r.esquina, await ancho(c));
    for (const c of M18.carga)   r.carga   = Math.max(r.carga,   await ancho(c));
    return r;
  });
  si('★ la esquina flota: nada cruza el borde de abajo (' + suelo.esquina + ' %)', suelo.esquina < 60);
  si('…y la pantalla de carga tampoco (' + suelo.carga + ' %)', suelo.carga < 60);

  console.log('\n7 · Con «reducir movimiento» no anima nada');
  const p2 = await b.newPage({ viewport: { width: 1400, height: 950 }, reducedMotion: 'reduce' });
  const e2 = []; p2.on('pageerror', e => e2.push(e.message));
  await p2.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api() { setTimeout(() => ok({ ok: true, data: null }), 5); } }; } }; } } } };
  });
  await p2.goto('file://' + path.join(V2, 'index.html'));
  await p2.waitForTimeout(700);
  const quieto = await p2.evaluate(async () => {
    const im = document.querySelector('#tutBtn .masc-persona');
    const t = _flip18(im, M18.esquina);
    const a = im.src; await new Promise(s => setTimeout(s, 460));
    return { sinReloj: t === null, mismoCuadro: im.src === a, tieneImagen: im.src.indexOf('UklG') > 0 };
  });
  si('★ no se enciende ningún reloj', quieto.sinReloj);
  si('★ …y el dibujo se queda quieto en un cuadro', quieto.mismoCuadro && quieto.tieneImagen);
  await p2.close();

  eq('sin errores de JavaScript', errs.concat(e2).join(' | '), '');
  await b.close();
  console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS' : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
