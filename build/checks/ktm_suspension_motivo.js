// ktm_suspension_motivo.js — ⚠️ LA SUSPENSIÓN DE KTM EN SESIÓN LLEVA SU
// MOTIVO, OBLIGATORIO Y VISIBLE (v5.92, pedido de Diego del 4-sep-2026:
// «cuando se inició y se suspendió… debería salir el motivo en entrega y
// evolución y además hacer obligatorio el campo»).
//
// LO QUE FIJA:
//  1. El guardado se BLOQUEA si «Suspendida por señal de alerta» está
//     marcada sin criterio; con criterio, ese bloqueo no aparece.
//  2. La ficha de entrega trae ktmAlerta + ktmAlertaRaz (servidor) y el
//     cliente los pinta («KTM suspendida en sesión (…)»).
//  3. El chip de la CAMA de la entrega impresa va INVERTIDO en papel
//     (fondo blanco, número negro, borde): el fondo azul comprimido salía
//     como cuadro negro en la impresora B/N (reporte de Diego, 4-sep).
// Uso: node build/checks/ktm_suspension_motivo.js (requiere playwright-core)
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

console.log('1 · Las fuentes traen las tres piezas');
const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
const ent = fs.readFileSync(path.join(v2, 'svc_entrega.gs'), 'utf8');
si('el servidor manda ktmAlerta y su razón a la entrega',
  /ktmAlerta: e \? esVerdadero\(e\.KTM_ALERTA\)/.test(ent) && ent.includes('ktmAlertaRaz'));
si('la ficha de entrega pinta «KTM suspendida en sesión (motivo)»',
  idx.includes('KTM suspendida en sesión') && idx.includes('f.ktmAlertaRaz'));
si('en papel el chip de la cama va invertido (fondo blanco, borde)',
  /\.ent-ficha-cama\{font-size:\.68rem;[^}]*background:#fff!important;color:#000!important;border:1\.5px solid #000/.test(idx));

/* ── 2 · el guardado exige el criterio ── */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window._ll = [];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) { window._ll.push(a); setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2, 'index.html'));
  await p.waitForTimeout(600);

  const R = await p.evaluate(async () => {
    const r = {};
    // Se captura el toast para leer el motivo del bloqueo.
    window.__t = ''; window.toast = m => { window.__t = String(m); };
    DB = [{ ID_CAMA: '3', OCUPADA: true, NOMBRE: 'PACIENTE PRUEBA' }];
    $('kf').reset(); $('cBed').value = '3';
    const setSel = (id, val) => { const e = $(id); if (!e) return;
      if (![...e.options].some(o => o.value === val)) e.add(new Option(val, val));
      e.value = val; };
    setSel('fFirma', 'DMV'); setSel('fVA', 'Natural');
    // Volver visible el bloque de la suspensión (offsetParent decide).
    let n = $('cKTMalert');
    while (n && n !== document.body) { if (n.classList) n.classList.remove('hidden'); n = n.parentElement; }
    $('cKTMalert').checked = true;
    $('dKTMalert').classList.remove('hidden');
    r.visible = $('cKTMalert').offsetParent !== null;

    const antes = window._ll.filter(a => a === 'GUARDAR_EVOLUCION').length;
    guardar(); await new Promise(x => setTimeout(x, 80));
    r.bloqueo = window.__t;
    r.guardoSin = window._ll.filter(a => a === 'GUARDAR_EVOLUCION').length - antes;

    // Con el criterio puesto, ESE bloqueo desaparece.
    setSel('fKTMalertRaz', 'Desaturación sostenida');
    window.__t = '';
    guardar(); await new Promise(x => setTimeout(x, 80));
    r.despues = window.__t;
    return r;
  });
  console.log('\n2 · El guardado exige el criterio de la suspensión');
  si('el bloque de la suspensión quedó visible para la prueba', R.visible);
  si('★ marcada SIN criterio: el guardado se bloquea y lo dice',
    /criterio/i.test(R.bloqueo) && /suspend/i.test(R.bloqueo));
  eq('★ …y NO viajó ningún guardado al servidor', R.guardoSin, 0);
  si('★ con el criterio puesto, ese bloqueo ya no aparece',
    !/criterio.*suspend/i.test(R.despues || ''));

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
