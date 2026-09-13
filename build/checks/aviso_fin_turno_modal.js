// aviso_fin_turno_modal.js — PRD «que no quede ninguna evolución sin guardar», O4.
//
// Lo que sale a fin de turno es un MODAL SOBRE VELO, no un toast ni una franja:
// se ve la lista entera de camas con un «Abrir» por fila, NO se cierra con
// Escape ni con un clic fuera, y SÍ se cierra con «Ya lo vi» aunque queden
// camas pendientes. Falla si el aviso se desvanece solo.
//
// El aviso interrumpe de verdad, pero nunca exige resolver: en una UCI un
// diálogo del que no se puede escapar tapa la pantalla justo cuando alguien
// necesita mirar un dato para una decisión clínica.
//
// Uso: node build/checks/aviso_fin_turno_modal.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');
const IDX = path.resolve(__dirname, '..', '..', 'v2', 'index.html');

(async () => {
  const fails = [];
  const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!ok) fails.push(l); };

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : []) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + IDX);
  await p.waitForTimeout(400);

  // Seis camas ocupadas sin evolución (datos SINTÉTICOS): la lista tiene que
  // caber entera, con scroll propio si hace falta.
  await p.evaluate(async () => {
    window.CFG = { SALIDA_TURNO_DIA: '20:00', SALIDA_TURNO_NOCHE: '08:00',
                   AVISO_FIN_TURNO_MIN: 30, AVISO_FIN_TURNO_REPETIR: false,
                   TURNO_DIA_INICIO: 9, TURNO_NOCHE_INICIO: 21 };
    window.DB = [1, 2, 3, 4, 5, 6].map(n => ({ ID_CAMA: String(n), OCUPADA: true, COD_PACIENTE: 'P-00' + n }));
    window.EVOS_DIA = []; window.toast = () => {};
    window.api = (a) => Promise.resolve(a === 'GET_BOOT' ? { camas: window.DB, evos: [] } : []);
    sessionStorage.clear();
    _aftTick(new Date(2026, 8, 14, 19, 30, 0));
    await new Promise(r => setTimeout(r, 150));
  });

  const forma = await p.evaluate(() => {
    const ovl = $('aftOvl'), card = $('aftCard'), li = $('aftLista');
    const cs = getComputedStyle(ovl), cl = getComputedStyle(li);
    return {
      on: ovl.classList.contains('on'),
      pos: cs.position, velo: cs.backgroundColor, z: cs.zIndex,
      centrado: cs.display + '/' + cs.alignItems + '/' + cs.justifyContent,
      rol: card.getAttribute('role'), modal: card.getAttribute('aria-modal'),
      filas: li.querySelectorAll('.aft-row').length,
      abrir: li.querySelectorAll('.aft-abrir').length,
      scroll: cl.overflowY,
      ok: ($('aftOk').textContent || '').trim(),
    };
  });
  eq('el aviso está visible', forma.on, true);
  eq('es un modal sobre velo (fijo, con fondo)', forma.pos + ' ' + /rgba?\(/.test(forma.velo), 'fixed true');
  eq('…por encima de la interfaz', Number(forma.z) >= 300, true);
  eq('…centrado', forma.centrado, 'flex/center/center');
  eq('…anunciado como diálogo modal', forma.rol + '/' + forma.modal, 'alertdialog/true');
  eq('una fila por cama pendiente', forma.filas, 6);
  eq('…con un «Abrir» en cada fila', forma.abrir, 6);
  eq('la lista tiene scroll propio (no recorta camas)', forma.scroll, 'auto');
  eq('la única salida se llama «Ya lo vi»', forma.ok, 'Ya lo vi');

  /* ── No se desvanece solo ───────────────────────────────────────────── */
  await p.waitForTimeout(4200);   // más que los 3,2 s de un toast
  eq('pasados 4 s sigue en pantalla (no es un toast)', await p.evaluate(() => $('aftOvl').classList.contains('on')), true);

  /* ── No se cierra con Escape ni con un clic fuera ────────────────────── */
  await p.keyboard.press('Escape');
  await p.waitForTimeout(150);
  eq('Escape NO lo cierra', await p.evaluate(() => $('aftOvl').classList.contains('on')), true);

  await p.mouse.click(12, 12);    // esquina del velo, fuera de la tarjeta
  await p.waitForTimeout(150);
  eq('un clic fuera NO lo cierra', await p.evaluate(() => $('aftOvl').classList.contains('on')), true);
  eq('…y el clic fuera cayó sobre el velo, no sobre la tarjeta',
     await p.evaluate(() => { const e = document.elementFromPoint(12, 12); return e && e.id; }), 'aftOvl');

  /* ── «Ya lo vi» cierra AUNQUE queden camas pendientes ────────────────── */
  const cierre = await p.evaluate(async () => {
    const pendientes = $('aftLista').querySelectorAll('.aft-row').length;
    $('aftOk').click();
    await new Promise(r => setTimeout(r, 120));
    return { pendientes, on: $('aftOvl').classList.contains('on') };
  });
  eq('quedaban camas pendientes al cerrar', cierre.pendientes, 6);
  eq('…y «Ya lo vi» igual cierra el aviso', cierre.on, false);

  /* ── «Abrir» lleva al panel de esa cama y cierra el aviso ────────────── */
  const abrir = await p.evaluate(async () => {
    sessionStorage.clear();
    window._abierta = null; window.abrirPanel = (id) => { window._abierta = String(id); };
    _aftTick(new Date(2026, 8, 14, 19, 30, 0));
    await new Promise(r => setTimeout(r, 150));
    $('aftLista').querySelectorAll('.aft-abrir')[2].click();
    await new Promise(r => setTimeout(r, 60));
    return { abierta: window._abierta, on: $('aftOvl').classList.contains('on') };
  });
  eq('«Abrir» abre el panel de esa cama', abrir.abierta, '3');
  eq('…y cierra el aviso', abrir.on, false);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ aviso_fin_turno_modal OK');
  process.exit(fails.length ? 1 : 0);
})();
