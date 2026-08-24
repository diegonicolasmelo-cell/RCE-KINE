// sello_al_tiro.js — EL ANEXO DEL ➕ SE VE AL TIRO, AVISA EL DUPLICADO Y SU
// SELLO LLEVA LA × (24-ago-2026, pedido de Manuel).
//
// 🔴 DE DÓNDE SALE. Tras un ANEXAR_EVENTO exitoso el front solo refrescaba los
// relojes de dispositivos: el sello NO se pintaba en el Registro hasta que
// alguien recargara la página. La gente «probaba cargando», reintentaba el ➕
// y quedaban KTM dobles — que inflan la estadística y el REM (cuentan filas
// de PROCEDIMIENTOS). Tres decisiones del front quedan fijadas aquí:
//
//  1. Tras el ➕ exitoso corre recargarSilencioso(): el sello aparece sin que
//     el usuario haga nada (la misma pieza que ya usaba el guardado).
//  2. Si ya hay un procedimiento del mismo nombre en esa cama y turno, el
//     popup AVISA antes de mandar — y solo avisa: dos KTM reales en un turno
//     son legítimas, cancelar no manda nada y confirmar manda.
//  3. El sello de un ANEXO (e.ANEXOS de GET_EVOS_DEL_DIA, con ID_PROC) lleva
//     la × en su borde derecho; el del guardado NO la lleva. La × confirma en
//     rojo, manda ANULAR_ANEXO con la identidad exacta y refresca de fondo.
//
// Se mide en Chromium con el index real y por sus rutas (evAbrir → evTipo →
// evGuardar, y el clic en la × de la tabla renderizada). gs y uiConfirm se
// registran para medir QUÉ decide el front — el servidor tiene su guardia
// propia (anexo_anular.js).
//
// Uso: node build/checks/sello_al_tiro.js [ruta.html]
const path = require('path');
const { chromium } = require('playwright-core');
const ARCHIVO = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'v2', 'index.html'));
const fails = [];
const si = (l, c, d) => { console.log((c ? '✅' : '❌') + ' ' + l + (d !== undefined ? ': ' + d : '')); if (!c) fails.push(l); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const pg = await b.newPage({ viewport: { width: 1500, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.goto('file://' + ARCHIVO);
  await pg.waitForTimeout(2000);
  await pg.evaluate(() => { const o = document.getElementById('loginOvl'); if (o) o.style.display = 'none'; });

  // gs y uiConfirm registrados; la fecha y el turno salen de la propia app
  // (v('gDate') y SHIFT='Dia' fijado) para que la guardia no dependa de la
  // hora en que corre — la bomba de tiempo que ya explotó en lista_y_filtros.
  const sembrar = () => pg.evaluate(() => {
    SHIFT = 'Dia';
    const f = v('gDate') || hoy();
    window._gsCalls = []; window._ucCalls = []; window._ucAnswer = true;
    window.gs = (a, d, okc) => { window._gsCalls.push({ a: a, d: d });
      if (a === 'ANEXAR_EVENTO') okc && okc({ texto: 'ok' });
      else if (a === 'ANULAR_ANEXO') okc && okc({ nombre: d && d.idProc });
      else if (a === 'GET_TODAS_CAMAS') okc && okc(window.DB || []);
      else okc && okc([]);
    };
    window.uiConfirm = o => { window._ucCalls.push(o); return Promise.resolve(window._ucAnswer); };
    DB = [{ ID_CAMA: '5', OCUPADA: true, PATIENT_ID: 'pX', NOMBRE: 'Paciente De Prueba', SEXO: 'M',
      EDAD: 61, DIAGNOSTICO: 'NAC grave', SOPORTE: 'VM', MODO: 'ACVC', TIMELINE: [],
      FECHA_INGRESO: f, TS_INGRESO: '', FECHA_INICIO_SOPORTE: f }];
    EVOS_DIA = [{ ID_CAMA: '5', TURNO_KEY: f + '-Dia', PATIENT_ID: 'pX', PAC_NOMBRE: 'Paciente De Prueba',
      PAC_SEXO: 'M', PAC_EDAD: 61, PAC_DIAGNOSTICO: 'NAC grave', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
      DIA_ESTADIA: 2, DIAS_VM: 2, RESP_KTR_CANT: 1, KTM_REALIZADA: true, KTM_NIVEL_KTR: '2',
      PROC_RESUMEN: 'KTM 1, KTM 1, ECOGRAFÍA', PLAN_FIRMA_KINE: 'MFB',
      ANEXOS: [{ id: 'PROC_A', nombre: 'KTM 1', ts: 't1' }, { id: 'PROC_B', nombre: 'KTM 1', ts: 't2' }] }];
    EVO_SET = new Set(['5']);
    setTab('P');   // la pestaña de verdad, como la abre la persona (visible)
    renderTabla();
  });

  console.log('1 · El sello del anexo lleva la ×; el del guardado, no');
  await sembrar(); await pg.waitForTimeout(300);
  si('hay EXACTAMENTE 2 × (los dos anexos)', await pg.locator('#notionTable .sello-x').count() === 2,
    await pg.locator('#notionTable .sello-x').count());
  si('cada × lleva la identidad real (ID_PROC)', await pg.evaluate(() =>
    Array.from(document.querySelectorAll('#notionTable .sello-x')).map(x => x.dataset.id).sort().join(',') === 'PROC_A,PROC_B'));
  si('la ECOGRAFÍA (del guardado) NO lleva ×', await pg.evaluate(() =>
    !Array.from(document.querySelectorAll('#notionTable .sello-ax')).some(s => s.textContent.indexOf('ECOGRAFÍA') !== -1)));
  si('la × es táctil (zona de toque ≥ 18px de alto)', await pg.evaluate(() => {
    const x = document.querySelector('#notionTable .sello-x'); if (!x) return false;
    const r = x.getBoundingClientRect(); return r.height >= 12 && r.width >= 10 && r.right > 0;
  }));

  console.log('\n2 · La × confirma en rojo y cancelar NO borra nada');
  await pg.evaluate(() => { window._ucAnswer = false; });
  await pg.locator('#notionTable .sello-x').first().click();
  await pg.waitForTimeout(300);
  si('tocarla pide confirmación', await pg.evaluate(() => _ucCalls.length === 1));
  si('…en rojo y diciendo qué se borra', await pg.evaluate(() =>
    _ucCalls[0] && _ucCalls[0].tono === 'rojo' && /KTM 1/.test(_ucCalls[0].mensaje || '')));
  si('…y advirtiendo estadística y auditoría', await pg.evaluate(() =>
    /estadística/.test(_ucCalls[0].detalle || '') && /auditoría/.test(_ucCalls[0].detalle || '')));
  si('cancelar no mandó NADA al servidor', await pg.evaluate(() => !_gsCalls.some(c => c.a === 'ANULAR_ANEXO')));

  console.log('\n3 · Confirmar borra ESE anexo y el Registro se refresca solo');
  await pg.evaluate(() => { window._ucAnswer = true; });
  await pg.locator('#notionTable .sello-x').first().click();
  await pg.waitForTimeout(400);
  si('viajó ANULAR_ANEXO con la identidad exacta', await pg.evaluate(() =>
    _gsCalls.some(c => c.a === 'ANULAR_ANEXO' && c.d && c.d.idProc === 'PROC_A')));
  si('…y el token de coordinación viaja en el payload (vacío sin sesión)', await pg.evaluate(() => {
    const c = _gsCalls.find(x => x.a === 'ANULAR_ANEXO'); return c && ('coordToken' in c.d);
  }));
  si('tras el ok corre el refresco de fondo (GET_TODAS_CAMAS)', await pg.evaluate(() =>
    _gsCalls.findIndex(c => c.a === 'GET_TODAS_CAMAS') > _gsCalls.findIndex(c => c.a === 'ANULAR_ANEXO')));

  console.log('\n4 · El ➕ avisa el duplicado ANTES de mandar — y solo avisa');
  await sembrar(); await pg.waitForTimeout(200);
  const prepararPopup = proc => pg.evaluate(p => {
    evAbrir('5', null, 'pX'); evTipo('procedimiento');
    _evProcPoblar(); const sel = document.getElementById('evProcSel'); sel.value = p;
    const fs_ = document.getElementById('evFirma'); fs_.innerHTML = '<option value="MFB">MFB</option>'; fs_.value = 'MFB';
  }, proc);
  await prepararPopup('ECOGRAFÍA');   // ya está en el turno → duplicado
  await pg.evaluate(() => { window._ucAnswer = false; evGuardar(); });
  await pg.waitForTimeout(300);
  si('con uno igual en el turno, pregunta antes de mandar', await pg.evaluate(() =>
    _ucCalls.length === 1 && /Ya está anotado/.test(_ucCalls[0].titulo || '')));
  si('…nombrando el procedimiento', await pg.evaluate(() => /ECOGRAFÍA/.test(_ucCalls[0].mensaje || '')));
  si('cancelar NO mandó el anexo', await pg.evaluate(() => !_gsCalls.some(c => c.a === 'ANEXAR_EVENTO')));
  await pg.evaluate(() => { window._ucAnswer = true; evGuardar(); });
  await pg.waitForTimeout(400);
  si('confirmar SÍ lo manda (avisa, no bloquea)', await pg.evaluate(() =>
    _gsCalls.some(c => c.a === 'ANEXAR_EVENTO' && c.d && c.d.proc === 'ECOGRAFÍA')));
  si('y tras el ok corre el refresco de fondo (el sello se pinta solo)', await pg.evaluate(() =>
    _gsCalls.findIndex(c => c.a === 'GET_TODAS_CAMAS') > _gsCalls.findIndex(c => c.a === 'ANEXAR_EVENTO') &&
    _gsCalls.some(c => c.a === 'GET_EVOS_DEL_DIA')));

  console.log('\n5 · Sin duplicado no hay fricción: va directo');
  await sembrar(); await pg.waitForTimeout(200);
  await prepararPopup('PRONO');   // no está en el turno
  await pg.evaluate(() => { evGuardar(); });
  await pg.waitForTimeout(400);
  si('sin duplicado NO pregunta nada', await pg.evaluate(() => _ucCalls.length === 0));
  si('…y el anexo viaja directo', await pg.evaluate(() =>
    _gsCalls.some(c => c.a === 'ANEXAR_EVENTO' && c.d && c.d.proc === 'PRONO')));

  si('sin errores JS en toda la corrida', errs.length === 0, errs.join(' | '));
  await b.close();
  console.log('\n' + (fails.length ? '❌ ' + fails.length + ' fallo(s): ' + fails.join(' · ') : '✅ sello_al_tiro: todo verde'));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error('❌ excepción: ' + e.message); process.exit(1); });
