// aviso_fin_turno_privacidad.js — PRD «que no quede ninguna evolución sin
// guardar», O6 · Ley 19.628.
//
// El aviso de fin de turno muestra «Cama N» y, a lo sumo, el identificador
// interno del episodio. NUNCA nombre completo ni RUT — ni en el modal, ni en la
// consola, ni en la traza. Se prueba con pacientes SEMBRADOS (datos
// sintéticos) de nombre y RUT conocidos, en las dos fuentes de las que se arma
// la lista: el censo de camas y las fichas archivadas de los egresos del día.
//
// Uso: node build/checks/aviso_fin_turno_privacidad.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');
const IDX = path.resolve(__dirname, '..', '..', 'v2', 'index.html');

const NOMBRE = 'JUANA SINTETICA DE PRUEBA';
const NOMBRE2 = 'PEDRO EGRESADO SINTETICO';
const RUT = '11.111.111-1';
const RUT2 = '22222222-2';

(async () => {
  const fails = [];
  const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!ok) fails.push(l); };

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; const consola = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { consola.push(m.text()); if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : []) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + IDX);
  await p.waitForTimeout(400);

  const r = await p.evaluate(async (o) => {
    window.CFG = { SALIDA_TURNO_DIA: '20:00', SALIDA_TURNO_NOCHE: '08:00',
                   AVISO_FIN_TURNO_MIN: 30, AVISO_FIN_TURNO_REPETIR: false,
                   TURNO_DIA_INICIO: 9, TURNO_NOCHE_INICIO: 21 };
    // Cama ocupada CON nombre y RUT sembrados, como los trae el censo real
    window.DB = [{ ID_CAMA: '4', OCUPADA: true, COD_PACIENTE: 'P-004',
                   NOMBRE: o.NOMBRE, RUT: o.RUT, DIAGNOSTICO: 'Neumonía sintética' }];
    window.EVOS_DIA = []; window.toast = () => {};
    const t = _turnoLogico(new Date(2026, 8, 14, 19, 30, 0));
    const fecha = t.fecha;
    window.api = (a) => Promise.resolve(
      a === 'GET_BOOT' ? { camas: window.DB, evos: [] }
      : a === 'GET_ARCHIVADOS' ? [{ cama: '8', cod: 'P-008', fEgreso: fecha,
                                    nombre: o.NOMBRE2, rut: o.RUT2 }]
      : []);
    sessionStorage.clear();
    _aftTick(new Date(2026, 8, 14, 19, 30, 0));
    await new Promise(r2 => setTimeout(r2, 250));
    return {
      on: $('aftOvl').classList.contains('on'),
      html: $('aftOvl').innerHTML,
      texto: $('aftOvl').textContent.replace(/\s+/g, ' ').trim(),
      marcas: Object.keys(sessionStorage).join(' | '),
    };
  }, { NOMBRE, NOMBRE2, RUT, RUT2 });

  eq('el aviso salió con el paciente sembrado', r.on, true);
  eq('…y nombra la cama ocupada', /Cama 4/.test(r.texto), true);
  eq('…y también la cama dada de alta en el día', /Cama 8/.test(r.texto), true);

  eq('🔒 el aviso NO muestra el nombre del paciente', new RegExp(NOMBRE).test(r.html), false);
  eq('🔒 …ni el del paciente egresado', new RegExp(NOMBRE2).test(r.html), false);
  eq('🔒 …ni RUT con puntos', /\d{1,2}\.\d{3}\.\d{3}-[\dkK]/.test(r.html), false);
  eq('🔒 …ni RUT sin puntos', /\b\d{7,8}-[\dkK]\b/.test(r.html), false);
  eq('🔒 …ni el diagnóstico libre', /Neumonía sintética/.test(r.html), false);
  eq('…pero sí el identificador interno del episodio', /P-004/.test(r.texto), true);

  eq('🔒 la traza del aviso solo lleva turnoKey (nada de identidad)',
     /^avisoFinTurno:\d{4}-\d{2}-\d{2}-(Dia|Noche)$/.test(r.marcas), true);
  eq('🔒 la consola no imprime el nombre', consola.some(t => t.indexOf(NOMBRE) !== -1 || t.indexOf(NOMBRE2) !== -1), false);
  eq('🔒 la consola no imprime un RUT', consola.some(t => /\b\d{7,8}-[\dkK]\b/.test(t)), false);

  eq('sin errores JS', errs.filter(e => !/favicon/.test(e)).join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ aviso_fin_turno_privacidad OK');
  process.exit(fails.length ? 1 : 0);
})();
