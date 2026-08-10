// tabla_soporte.js — La columna SOPORTE dice CUÁL oxigenoterapia
// (10-ago-2026, pedido de Manuel desde el turno).
//
// «Oxigenoterapia/OAF» a secas no sirve en la ronda: el equipo necesita ver si
// el paciente está con CNAF, naricera (NRC), mascarilla multiventilada (MMV) o
// mascarilla de reservorio (MR). El dato ya existía en `VENT_MODO` —el formulario lo pide— pero la
// grilla lo tiraba a la basura y mostraba solo la palabra genérica.
//
// Lo que esta guardia cuida: que el modo salga cuando lo hay, que NO se invente
// cuando falta, que se lea tanto de la evolución como del estado de la cama, y
// que los otros soportes (VM, VNI, CNAF, Ambiente) sigan mostrándose igual —
// el pedido era para la oxigenoterapia, no para todo.
//
// Uso: node build/checks/tabla_soporte.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 8, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

  const R = await p.evaluate(() => {
    ATAB = 'P';
    $('gDate').value = '2026-08-10'; SHIFT = 'Dia';
    DB = [
      // 1-3 · oxigenoterapia con su modo, vía la EVOLUCIÓN del turno
      { ID_CAMA: '1', OCUPADA: true, NOMBRE: 'Con Naricera', SEXO: 'M', EDAD: 70, FECHA_INGRESO: '2026-08-08' },
      { ID_CAMA: '2', OCUPADA: true, NOMBRE: 'Con Cnaf', SEXO: 'F', EDAD: 60, FECHA_INGRESO: '2026-08-08' },
      { ID_CAMA: '3', OCUPADA: true, NOMBRE: 'Sin Modo', SEXO: 'M', EDAD: 55, FECHA_INGRESO: '2026-08-08' },
      // 4 · VM CON modo: la columna NO lo agrega (el pedido era la oxigenoterapia)
      { ID_CAMA: '4', OCUPADA: true, NOMBRE: 'En Vm', SEXO: 'F', EDAD: 65, FECHA_INGRESO: '2026-08-06' },
      // 5 · oxigenoterapia SIN evolución: se lee del estado de la cama
      { ID_CAMA: '5', OCUPADA: true, NOMBRE: 'Sin Evolucion', SEXO: 'M', EDAD: 72,
        FECHA_INGRESO: '2026-08-09', SOPORTE: 'Oxigenoterapia/OAF', MODO: 'MMV' },
      // 6 · el soporte CNAF propiamente tal sigue igual
      { ID_CAMA: '6', OCUPADA: true, NOMBRE: 'Soporte Cnaf', SEXO: 'F', EDAD: 58,
        FECHA_INGRESO: '2026-08-09', SOPORTE: 'CNAF' },
      // 7 · evolución VIEJA que guardó «Mascarilla» (antes del renombre a MR)
      { ID_CAMA: '7', OCUPADA: true, NOMBRE: 'Historico Mascarilla', SEXO: 'F', EDAD: 80, FECHA_INGRESO: '2026-08-07' },
      { ID_CAMA: '8', OCUPADA: false },
    ];
    EVOS_DIA = [
      { ID_CAMA: '1', TURNO_KEY: '2026-08-10-Dia', PAC_NOMBRE: 'Con Naricera', VENT_SOPORTE: 'Oxigenoterapia/OAF', VENT_MODO: 'NRC' },
      { ID_CAMA: '2', TURNO_KEY: '2026-08-10-Dia', PAC_NOMBRE: 'Con Cnaf', VENT_SOPORTE: 'Oxigenoterapia/OAF', VENT_MODO: 'CNAF' },
      { ID_CAMA: '3', TURNO_KEY: '2026-08-10-Dia', PAC_NOMBRE: 'Sin Modo', VENT_SOPORTE: 'Oxigenoterapia/OAF', VENT_MODO: '' },
      { ID_CAMA: '4', TURNO_KEY: '2026-08-10-Dia', PAC_NOMBRE: 'En Vm', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC' },
      { ID_CAMA: '7', TURNO_KEY: '2026-08-10-Dia', PAC_NOMBRE: 'Historico Mascarilla', VENT_SOPORTE: 'Oxigenoterapia/OAF', VENT_MODO: 'Mascarilla' },
    ];
    EVO_SET = new Set(['1', '2', '3', '4', '7']);
    renderTabla();
    const filas = [...document.querySelectorAll('#notionTable tbody tr')].map(tr => {
      const td = [...tr.querySelectorAll('td')];
      const sopTd = td[8];                                   // 9ª columna = SOPORTE
      return { nombre: (td[1] || {}).textContent || '', sop: sopTd ? sopTd.textContent.trim() : '',
               tip: sopTd && sopTd.querySelector('.bs') ? (sopTd.querySelector('.bs').getAttribute('title') || '') : '' };
    });
    const de = n => filas.find(f => new RegExp(n, 'i').test(f.nombre)) || {};
    return { nrc: de('Con Naricera'), cnaf: de('Con Cnaf'), sinModo: de('Sin Modo'),
             vm: de('En Vm'), sinEvo: de('Sin Evolucion'), sopCnaf: de('Soporte Cnaf'),
             hist: de('Historico Mascarilla'),
             // El renombre de ago-2026: el catálogo ofrece MR, no «Mascarilla»
             catalogo: VMAPS['Natural'].modos['Oxigenoterapia/OAF'].join(','),
             etiqueta: _MODO_ETIQ['MR'] || '', largo: _MODO_LARGO['MR'] || '' };
  });

  eq('naricera → «O2 · NRC», no la palabra genérica', R.nrc.sop, 'O2 · NRC');
  eq('…y el nombre largo queda en el tooltip', R.nrc.tip, 'Oxigenoterapia/OAF — NRC');
  eq('CNAF por oxigenoterapia → «O2 · CNAF»', R.cnaf.sop, 'O2 · CNAF');
  eq('sin modo registrado NO se inventa: queda el genérico', R.sinModo.sop, 'Oxigenoterapia/OAF');
  eq('VM no se toca aunque tenga modo (ACVC no entra)', R.vm.sop, 'VM');
  eq('sin evolución, el modo se lee del estado de la cama', R.sinEvo.sop, 'O2 · MMV');
  eq('el soporte CNAF propiamente tal sigue igual', R.sopCnaf.sop, 'CNAF');
  // ── Renombre «Mascarilla» → «MR (mascarilla de reservorio)», 10-ago-2026 ──
  eq('el catálogo ofrece MR, ya no «Mascarilla»', R.catalogo, 'NRC,MMV,MR,CNAF');
  eq('el desplegable lo muestra con su nombre', R.etiqueta, 'MR (reservorio)');
  eq('y la evolución lo escribe completo', R.largo, 'mascarilla de reservorio');
  eq('una evolución vieja con «Mascarilla» se muestra como MR', R.hist.sop, 'O2 · MR');
  eq('…y su tooltip trae el nombre largo', R.hist.tip, 'Oxigenoterapia/OAF — mascarilla de reservorio');

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ tabla_soporte OK');
  process.exit(fails.length ? 1 : 0);
})();
