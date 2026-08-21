// evento_paciente_ui.js — El ➕ del Registro Diario manda el episodio de la
// fila que se está mirando, no el del ocupante de hoy.
//
// POR QUÉ EXISTE. `evento_paciente.js` prueba que el SERVIDOR le escribe al
// paciente correcto cuando le declaran el episodio. Esta prueba la otra mitad:
// que el front se lo declare. Sin ella, el servidor haría lo correcto con un
// dato que nunca le llega — y en una cama rotada rechazaría por ambiguo cada
// anexo, dejando al equipo sin poder corregir nada.
//
// EL CASO QUE IMPORTA: fecha pasada, cama cuyo paciente ya egresó. La fila que
// se ve es la de él (viene de EVOLUCIONES_ARCHIVO desde el 20-ago), pero la
// cama la ocupa OTRA persona hoy. Antes, el ➕ no mandaba episodio y el servidor
// caía al `PATIENT_ID` de la cama: la corrección aterrizaba en el ocupante nuevo.
//
// ⚠️ LÍMITE CONOCIDO que esta guardia NO cubre y hay que decir: cuando una cama
// tuvo DOS episodios el mismo turno, la tabla resuelve con `EVOS_DIA.find(...)`
// y muestra UNA sola fila. Elegir cuál se ve es `PRD_QUIEN_ESTABA_EN_LA_CAMA.md`,
// que decide Diego. Aquí se fija lo que sí se puede fijar: el ➕ manda el
// episodio de la fila RENDERIZADA, sea cual sea.
//
// Uso: node build/checks/evento_paciente_ui.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 4, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
  const si = (l, c) => eq(l, !!c, true);

  // Se conduce la ruta REAL: clic en el ➕ → elegir tipo → escribir → Guardar,
  // y se captura el PAYLOAD que sale hacia el servidor. Leer el DOM diría qué
  // pinta tiene el botón; esto dice qué se manda, que es lo que decide a quién
  // se le escribe en la ficha.
  const anexar = (camaBuscada) => p.evaluate((cama) => {
    const CAP = [];
    window.gs = (accion, datos) => { CAP.push({ accion: accion, datos: datos }); };
    const filas = [...document.querySelectorAll('#notionTable tbody tr')];
    let btn = null;
    filas.forEach(tr => {
      const c = (tr.cells[0] || {}).textContent;
      if (String(c || '').trim() === String(cama)) btn = tr.querySelector('button[onclick^="evAbrir"]');
    });
    if (!btn) return { error: 'no hay ➕ en la cama ' + cama };
    btn.click();                       // → evAbrir(id, this, pid)
    evTipo('procedimiento');
    $('evProc').value = 'ECOGRAFÍA DIAFRAGMÁTICA';
    $('evFirma').innerHTML = '<option value="MFB">MFB</option>';
    $('evFirma').value = 'MFB';
    evGuardar();
    return { cap: CAP, pidEnMemoria: window._evPid };
  }, camaBuscada);

  const CAMAS = [
    { ID_CAMA: '1', OCUPADA: true, NOMBRE: 'Elizabeth Ocupante Hoy', PATIENT_ID: 'pELI',
      SEXO: 'F', EDAD: 54, DIAGNOSTICO: 'ACV', SOPORTE: 'VM', FECHA_INGRESO: '2026-08-11' },
    { ID_CAMA: '2', OCUPADA: true, NOMBRE: 'Paciente Estable', PATIENT_ID: 'pEST',
      SEXO: 'M', EDAD: 61, DIAGNOSTICO: 'NAC', SOPORTE: 'VM', FECHA_INGRESO: '2026-07-20' },
    { ID_CAMA: '3', OCUPADA: false },
    { ID_CAMA: '4', OCUPADA: false },
  ];

  /* ══ 1 · Fecha pasada: el ➕ es del que ESTUVO, no del que está ═════════ */
  console.log('1 · En una fecha pasada el ➕ manda el episodio de quien estuvo');
  await p.evaluate((CAMAS) => {
    ATAB = 'P'; SHIFT = 'Noche';
    $('gDate').value = '2026-08-01';
    $('gDate').classList.remove('turno-hoy');           // vista retrospectiva
    DB = CAMAS;
    // La cama 1 la ocupa Elizabeth HOY; el 1 de agosto estaba Francisca, ya
    // egresada — su fila llega desde EVOLUCIONES_ARCHIVO con SU PATIENT_ID.
    EVOS_DIA = [
      { ID_CAMA: '1', TURNO_KEY: '2026-08-01-Noche', PATIENT_ID: 'pFRAN',
        PAC_NOMBRE: 'Francisca Egresada', PAC_SEXO: 'F', PAC_EDAD: 67,
        PAC_DIAGNOSTICO: 'SDRA', VENT_SOPORTE: 'VM', DIA_ESTADIA: 15, DIAS_VM: 11 },
    ];
    EVO_SET = new Set(['1']);
    renderTabla();
  }, CAMAS);

  const r1 = await anexar('1');
  si('el ➕ existe en esa fila y se pudo conducir', !r1.error);
  eq('sale exactamente un envío al servidor', (r1.cap || []).length, 1);
  eq('…y es el anexo', ((r1.cap || [])[0] || {}).accion, 'ANEXAR_EVENTO');
  const d1 = (((r1.cap || [])[0] || {}).datos) || {};
  eq('🎯 lleva el episodio de la paciente que ESTUVO', d1.patientId, 'pFRAN');
  si('y NO el de quien ocupa la cama hoy', d1.patientId !== 'pELI');
  eq('sobre la cama correcta', d1.idCama, '1');
  eq('y el turno que se está mirando', d1.turnoKey, '2026-08-01-Noche');

  /* ══ 2 · NO REGRESIÓN: hoy, cama viva, sigue siendo su ocupante ════════ */
  console.log('\n2 · En el turno de hoy el ➕ manda el episodio del ocupante');
  await p.evaluate((CAMAS) => {
    $('gDate').value = '2026-08-20';
    $('gDate').classList.add('turno-hoy');
    DB = CAMAS;
    EVOS_DIA = [
      { ID_CAMA: '2', TURNO_KEY: '2026-08-20-Noche', PATIENT_ID: 'pEST',
        PAC_NOMBRE: 'Paciente Estable', PAC_SEXO: 'M', PAC_EDAD: 61,
        PAC_DIAGNOSTICO: 'NAC', VENT_SOPORTE: 'VM', DIA_ESTADIA: 31, DIAS_VM: 20 },
    ];
    EVO_SET = new Set(['2']);
    renderTabla();
  }, CAMAS);
  const r2 = await anexar('2');
  const d2 = (((r2.cap || [])[0] || {}).datos) || {};
  eq('lleva el episodio del ocupante', d2.patientId, 'pEST');
  eq('sobre su cama', d2.idCama, '2');

  /* ══ 3 · Una cama sin registro ese día no inventa un episodio ══════════ */
  console.log('\n3 · Sin evolución ese día, el ➕ no se inventa un episodio');
  const r3 = await p.evaluate(() => {
    $('gDate').value = '2026-08-01';
    $('gDate').classList.remove('turno-hoy');
    EVOS_DIA = []; EVO_SET = new Set();
    renderTabla();
    const filas = [...document.querySelectorAll('#notionTable tbody tr')];
    // En retro sin registro la fila no debe ofrecer ➕ apuntando a nadie: si lo
    // ofrece, que al menos vaya sin episodio, para que el servidor decida.
    const conBoton = filas.filter(tr => tr.querySelector('button[onclick^="evAbrir"]'));
    return conBoton.map(tr => (tr.querySelector('button[onclick^="evAbrir"]').getAttribute('onclick') || ''));
  });
  si('ninguna fila sin registro manda un episodio inventado',
    r3.every(oc => !/,'p[A-Z]/.test(oc)));

  eq('sin errores de página', errs.length, 0);
  await b.close();
  console.log('\n' + (fails.length ? '❌ FALLARON ' + fails.length + ': ' + fails.join(' · ')
    : '✅ evento_paciente_ui: el ➕ manda el episodio de la fila que se mira'));
  process.exit(fails.length ? 1 : 0);
})();
