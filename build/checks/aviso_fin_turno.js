// aviso_fin_turno.js — PRD «que no quede ninguna evolución sin guardar», O4.
//
// Existe el temporizador de fin de turno, y la hora a la que avisa sale de las
// TRES claves de CONFIG (SALIDA_TURNO_DIA 20:00, SALIDA_TURNO_NOCHE 08:00,
// AVISO_FIN_TURNO_MIN 30).
//
// 🔴 Falla si la hora del aviso se calcula con _horasTurno() o con
// TURNO_DIA_INICIO / TURNO_NOCHE_INICIO — el cambio de turno de la APP (09:00 /
// 21:00) no es la hora en que se va el equipo (20:00 / 08:00), y calcularlo con
// el primero sacaría el aviso a las 20:45, con la unidad ya vacía. Es el error
// exacto que el PRD corrigió el 13-sep-2026.
//
// Se mide la PROPIEDAD, no la lista de horas que se vio en pantalla: mover
// TURNO_*_INICIO no puede mover el aviso ni un minuto, y mover SALIDA_* sí.
// El reloj va FIJO: el escenario depende de la hora, no se espera a las 19:30.
//
// Uso: node build/checks/aviso_fin_turno.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const IDX = path.resolve(__dirname, '..', '..', 'v2', 'index.html');

(async () => {
  const fails = [];
  const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!ok) fails.push(l); };

  /* ── 1 · Estático: de dónde sale la hora ─────────────────────────────── */
  const src = fs.readFileSync(IDX, 'utf8');
  const ini = src.indexOf('function _aftCfg()');
  const fin = src.indexOf('function _aftIniciar()');
  eq('el bloque del aviso de fin de turno existe', ini > 0 && fin > ini, true);
  const bloque = src.slice(ini, fin);

  eq('lee SALIDA_TURNO_DIA de CONFIG', /CFG[\s\S]{0,400}SALIDA_TURNO_DIA|c\.SALIDA_TURNO_DIA/.test(bloque), true);
  eq('lee SALIDA_TURNO_NOCHE de CONFIG', /c\.SALIDA_TURNO_NOCHE/.test(bloque), true);
  eq('lee AVISO_FIN_TURNO_MIN de CONFIG', /c\.AVISO_FIN_TURNO_MIN/.test(bloque), true);
  eq('lee AVISO_FIN_TURNO_REPETIR de CONFIG', /c\.AVISO_FIN_TURNO_REPETIR/.test(bloque), true);

  eq('🔴 el aviso NO usa _horasTurno()', /_horasTurno\s*\(/.test(bloque), false);
  eq('🔴 el aviso NO usa TURNO_DIA_INICIO', /TURNO_DIA_INICIO/.test(bloque), false);
  eq('🔴 el aviso NO usa TURNO_NOCHE_INICIO', /TURNO_NOCHE_INICIO/.test(bloque), false);

  // Las tres horas no están escritas a mano: solo viven como respaldo con
  // nombre (AFT_*_DEF), y solo porque producción no tiene las filas de CONFIG
  // hasta que se corra la reparación de estructura.
  const soloCodigo = bloque.replace(/\/\*[\s\S]*?\*\//g, '').split('\n')
    .filter(l => !/^\s*\/\//.test(l)).map(l => l.replace(/\s\/\/.*$/, ''))
    .filter(l => !/AFT_[A-Z_]*DEF/.test(l)).join('\n');
  const sinDefs = soloCodigo;
  eq('«20:00» no está escrito a mano en la lógica', /20:00/.test(sinDefs), false);
  eq('«08:00» no está escrito a mano en la lógica', /08:00/.test(sinDefs), false);
  eq('los 30 minutos no están escritos a mano en la lógica', /\b30\b/.test(sinDefs), false);
  const defs = src.slice(src.indexOf('const AFT_SALIDA_DIA_DEF'), ini);
  eq('…los respaldos con nombre sí existen', /AFT_SALIDA_DIA_DEF='20:00'[\s\S]*AFT_SALIDA_NOCHE_DEF='08:00'[\s\S]*AFT_MIN_DEF=30/.test(defs), true);

  // Y las cuatro claves están sembradas en la planilla y expuestas al cliente.
  const esq = fs.readFileSync(path.resolve(__dirname, '..', '..', 'v2', 'esquema.gs'), 'utf8');
  const api = fs.readFileSync(path.resolve(__dirname, '..', '..', 'v2', 'api.gs'), 'utf8');
  ['SALIDA_TURNO_DIA', 'SALIDA_TURNO_NOCHE', 'AVISO_FIN_TURNO_MIN', 'AVISO_FIN_TURNO_REPETIR'].forEach(k => {
    eq('CONFIG siembra ' + k, new RegExp("\\['" + k + "'").test(esq), true);
    eq('_configUI() expone ' + k, new RegExp(k + ':').test(api), true);
  });
  eq('AVISO_FIN_TURNO_MIN admite 0 (no lo pisa un «|| 30»)', /AVISO_FIN_TURNO_MIN:[^\n]*\|\|\s*30/.test(api), false);

  /* ── 2 · Runtime con el reloj FIJO ───────────────────────────────────── */
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

  // Escenario: camas 3 y 7 ocupadas, la 3 ya evolucionada. Datos SINTÉTICOS.
  await p.evaluate(() => {
    window._cfgBase = {
      SALIDA_TURNO_DIA: '20:00', SALIDA_TURNO_NOCHE: '08:00',
      AVISO_FIN_TURNO_MIN: 30, AVISO_FIN_TURNO_REPETIR: false,
      TURNO_DIA_INICIO: 9, TURNO_NOCHE_INICIO: 21,
    };
    window.CFG = Object.assign({}, window._cfgBase);
    window.DB = [
      { ID_CAMA: '3', OCUPADA: true, COD_PACIENTE: 'P-003' },
      { ID_CAMA: '7', OCUPADA: true, COD_PACIENTE: 'P-007' },
      { ID_CAMA: '9', OCUPADA: false, COD_PACIENTE: '' },
    ];
    window.EVOS_DIA = [];
    window.toast = () => {};
    window.api = (a) => Promise.resolve(
      a === 'GET_BOOT' ? { camas: window.DB, evos: [{ ID_CAMA: '3', TURNO_KEY: window._tk }] } : []);
  });

  const corre = async (h, m, extra) => p.evaluate(async (o) => {
    sessionStorage.clear();
    window.CFG = Object.assign({}, window._cfgBase, o.extra || {});
    const now = new Date(2026, 8, 14, o.h, o.m, 0);
    const t = _turnoLogico(now); window._tk = t.fecha + '-' + t.turno;
    _aftCerrar();
    _aftTick(now);
    await new Promise(r => setTimeout(r, 120));
    const on = !!$('aftOvl').classList.contains('on');
    return { on, turno: t.turno, texto: on ? $('aftLista').textContent.replace(/\s+/g, ' ').trim() : '',
             marca: sessionStorage.getItem('avisoFinTurno:' + window._tk) };
  }, { h, m, extra });

  const t1930 = await corre(19, 30);
  eq('a las 19:30 (20:00 − 30) el aviso SALE', t1930.on, true);
  eq('…y nombra solo la cama ocupada sin evolución', t1930.texto, 'Cama 7P-007Abrir');
  eq('…y deja la marca del turno en sessionStorage', t1930.marca, '1');

  const t1929 = await corre(19, 29);
  eq('a las 19:29 todavía no sale', t1929.on, false);

  const t2045 = await corre(20, 45);
  eq('🔴 a las 20:45 (la vieja hora por _horasTurno) NO pasa nada', t2045.on, false);
  eq('…y a esa hora el turno de la app sigue siendo el día', t2045.turno, 'Dia');

  const t0730 = await corre(7, 30);
  eq('a las 07:30 (08:00 − 30) el aviso SALE', t0730.on, true);
  eq('…y el turno activo es la noche', t0730.turno, 'Noche');

  const t0845 = await corre(8, 45);
  eq('🔴 a las 08:45 NO pasa nada', t0845.on, false);

  // Propiedad: la hora del aviso depende de SALIDA_*, y de nada más.
  const mueveSalida = await corre(18, 30, { SALIDA_TURNO_DIA: '19:00' });
  eq('mover SALIDA_TURNO_DIA mueve el aviso (18:30 con salida 19:00)', mueveSalida.on, true);
  const mueveMin = await corre(19, 15, { AVISO_FIN_TURNO_MIN: 45 });
  eq('AVISO_FIN_TURNO_MIN 45 adelanta el aviso a las 19:15', mueveMin.on, true);
  const apagado = await corre(19, 30, { AVISO_FIN_TURNO_MIN: 0 });
  eq('AVISO_FIN_TURNO_MIN 0 apaga el aviso', apagado.on, false);

  // 🔴 La propiedad que protege del error del 13-sep: tocar el cambio de turno
  // de la APP no puede mover el aviso ni un minuto.
  const turnoMovido = await corre(19, 30, { TURNO_DIA_INICIO: 7, TURNO_NOCHE_INICIO: 22 });
  eq('mover TURNO_*_INICIO NO mueve el aviso', turnoMovido.on, true);
  const turnoMovido2 = await corre(20, 45, { TURNO_DIA_INICIO: 7, TURNO_NOCHE_INICIO: 22 });
  eq('…ni lo hace aparecer a las 20:45', turnoMovido2.on, false);

  /* ── 3 · Una sola vez por turno y por dispositivo ─────────────────────── */
  const doble = await p.evaluate(async () => {
    sessionStorage.clear();
    window.CFG = Object.assign({}, window._cfgBase);
    const now = new Date(2026, 8, 14, 19, 30, 0);
    const t = _turnoLogico(now); window._tk = t.fecha + '-' + t.turno;
    _aftCerrar(); _aftTick(now); await new Promise(r => setTimeout(r, 120));
    const primera = $('aftOvl').classList.contains('on');
    _aftCerrar();                                   // «Ya lo vi»
    _aftTick(new Date(2026, 8, 14, 19, 40, 0));     // el minuto siguiente
    await new Promise(r => setTimeout(r, 120));
    const segunda = $('aftOvl').classList.contains('on');
    // Un reinicio del navegador (sessionStorage vacío) SÍ puede volver a avisar
    sessionStorage.clear();
    _aftTick(new Date(2026, 8, 14, 19, 45, 0));
    await new Promise(r => setTimeout(r, 120));
    return { primera, segunda, trasReinicio: $('aftOvl').classList.contains('on') };
  });
  eq('sale una vez en el turno', doble.primera, true);
  eq('…y no vuelve a salir en el mismo turno y dispositivo', doble.segunda, false);
  eq('…pero un reinicio del navegador vuelve a poder avisar', doble.trasReinicio, true);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ aviso_fin_turno OK');
  process.exit(fails.length ? 1 : 0);
})();
