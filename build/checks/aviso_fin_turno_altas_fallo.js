// aviso_fin_turno_altas_fallo.js — PRD «que no quede ninguna evolución sin
// guardar», O4. Corrección 3b tras la revisión del verificador (13-sep-2026).
//
// El aviso de fin de turno pide las altas del día con `GET_ARCHIVADOS`. Esa
// llamada terminaba en `.catch(()=>cb([]))`: si el servidor no respondía, el
// modal salía **limpio** —sin altas y sin decir nada—, y hasta se cerraba solo
// cuando no quedaba ninguna otra cama pendiente.
//
// Eso es peor que no avisar. Un aviso que dice «no queda nadie» cuando en
// realidad no pudo mirar manda a alguien para la casa a las 19:30 creyendo que
// el turno está cerrado, y lo que no se pudo mirar es justamente la lista de
// camas que egresaron hoy sin evolucionar — las que ya no están en el censo y
// que nadie va a ver por casualidad.
//
// 🪤 El reloj va FIJADO: el escenario depende del calendario.
//
// Uso: node build/checks/aviso_fin_turno_altas_fallo.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');
const IDX = path.resolve(__dirname, '..', '..', 'v2', 'index.html');

const NOMBRE_SEMILLA = 'ZZPRUEBA SINTETICA SEMILLA';

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

  // Escenario común: turno día del 2026-09-14, aviso a las 19:30, GET_BOOT sano
  // y GET_ARCHIVADOS CAÍDO. Datos sintéticos; el nombre se siembra para probar
  // que ni siquiera en el camino de error se escapa.
  const montar = (camas) => p.evaluate(async ([camas, nom]) => {
    window.CFG = { SALIDA_TURNO_DIA: '20:00', SALIDA_TURNO_NOCHE: '08:00',
                   AVISO_FIN_TURNO_MIN: 30, AVISO_FIN_TURNO_REPETIR: false,
                   TURNO_DIA_INICIO: 9, TURNO_NOCHE_INICIO: 21 };
    window.DB = camas.map(n => ({ ID_CAMA: String(n), OCUPADA: true, COD_PACIENTE: 'P-00' + n, NOMBRE: nom }));
    window.EVOS_DIA = []; window.toast = () => {};
    window.__pedidas = [];
    window.api = (a) => {
      window.__pedidas.push(a);
      if (a === 'GET_ARCHIVADOS') return Promise.reject(new Error('sin conexión'));
      if (a === 'GET_BOOT') return Promise.resolve({ camas: window.DB, evos: [] });
      return Promise.resolve([]);
    };
    sessionStorage.clear();
    $('aftOvl')?.classList.remove('on');
    _aftTick(new Date(2026, 8, 14, 19, 30, 0));
    await new Promise(r => setTimeout(r, 350));
  }, [camas, NOMBRE_SEMILLA]);

  /* ── 1 · Con camas pendientes: el modal sale Y dice que las altas no se verificaron ── */
  await montar([1, 2, 3]);
  const conCamas = await p.evaluate(() => ({
    seIntento: window.__pedidas.includes('GET_ARCHIVADOS'),
    abierto: $('aftOvl').classList.contains('on'),
    pieVisible: $('aftPie').style.display !== 'none',
    pie: ($('aftPie').textContent || '').trim(),
    filas: $('aftLista').querySelectorAll('.aft-row').length,
  }));
  eq('se intentó verificar las altas', conCamas.seIntento, true);
  eq('el modal está abierto', conCamas.abierto, true);
  eq('…con el pie a la vista', conCamas.pieVisible, true);
  eq('…y el pie avisa que las altas no se pudieron verificar',
    /no se pudieron verificar las altas/i.test(conCamas.pie), true);
  eq('…sin tragarse las camas pendientes que sí conocía', conCamas.filas, 3);

  /* ── 2 · LA PROPIEDAD QUE IMPORTA: sin ninguna otra cama pendiente, el modal
     NO se cierra en silencio. «No queda nadie» sería mentira. ── */
  await montar([]);
  const sinCamas = await p.evaluate(() => ({
    abierto: $('aftOvl').classList.contains('on'),
    pie: ($('aftPie').textContent || '').trim(),
    msg: ($('aftMsg').textContent || '').trim(),
  }));
  eq('sin otras camas pendientes el aviso IGUAL sale', sinCamas.abierto, true);
  eq('…y dice por qué', /no se pudieron verificar las altas/i.test(sinCamas.pie), true);

  /* ── 3 · El texto vive en UN solo sitio (lo escribe el modal, lo exige esta
     guardia): si alguien lo reescribe distinto en otro lado, se nota ── */
  const unSoloTexto = await p.evaluate(() => ({
    existe: typeof _AFT_PIE_ALTAS_FALLO === 'string' && _AFT_PIE_ALTAS_FALLO.length > 20,
    esElMismo: ($('aftPie').textContent || '').indexOf(_AFT_PIE_ALTAS_FALLO.trim()) !== -1,
  }));
  eq('el texto del fallo está en una sola constante', unSoloTexto.existe, true);
  eq('…y es el que se pinta', unSoloTexto.esElMismo, true);

  /* ── 4 · Ley 19.628: el camino de ERROR tampoco filtra nada ── */
  const privacidad = await p.evaluate((nom) => ({
    nombre: $('aftOvl').innerHTML.includes(nom),
    rut: /\d{1,2}\.\d{3}\.\d{3}-[\dkK]/.test($('aftOvl').innerHTML),
  }), NOMBRE_SEMILLA);
  eq('ni un nombre en el aviso de fallo', privacidad.nombre, false);
  eq('ni un RUT', privacidad.rut, false);

  /* ── 5 · Cuando GET_ARCHIVADOS SÍ responde, no se avisa de nada ── */
  await p.evaluate(async () => {
    window.api = (a) => {
      if (a === 'GET_ARCHIVADOS') return Promise.resolve([]);
      if (a === 'GET_BOOT') return Promise.resolve({ camas: window.DB, evos: [] });
      return Promise.resolve([]);
    };
    window.DB = [{ ID_CAMA: '4', OCUPADA: true, COD_PACIENTE: 'P-004' }];
    sessionStorage.clear(); $('aftOvl').classList.remove('on');
    _aftTick(new Date(2026, 8, 14, 19, 30, 0));
    await new Promise(r => setTimeout(r, 350));
  });
  const sano = await p.evaluate(() => ({
    abierto: $('aftOvl').classList.contains('on'),
    pie: ($('aftPie').textContent || '').trim(),
  }));
  eq('con el servidor sano el modal sale igual', sano.abierto, true);
  eq('…y NO inventa una advertencia de altas', /no se pudieron verificar las altas/i.test(sano.pie), false);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ aviso_fin_turno_altas_fallo OK');
  process.exit(fails.length ? 1 : 0);
})();
