// rendimiento.js — Guardia contra BUCLES DE REPINTADO (ago-2026).
// Nació de un reporte de Diego («se pega, bucle infinito»): con la unidad llena
// se mide cuántas veces se repinta la grilla en reposo y al viajar a una fecha
// pasada. Un repintado que se dispara solo, en cadena, cuelga el navegador.
// Uso: node build/checks/rendimiento.js
const { chromium } = require('playwright-core');
const path = require('path');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1200, height: 850 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.__n = { api: 0 };
    const CAMAS = []; for (let i=1;i<=18;i++) CAMAS.push({ID_CAMA:String(i),OCUPADA:i<=12,
      NOMBRE:'Paciente '+i,EDAD:60+i,SEXO:i%2?'M':'F',DIAGNOSTICO:'Dx '+i,VIA_AEREA:i%3?'TOT':'Natural',
      SOPORTE:i%3?'VM':'CNAF',MODO:'ACVC',FECHA_INGRESO:'2026-07-25',FECHA_INICIO_SOPORTE:'2026-07-25',FECHA_INICIO_VA:'2026-07-25'});
    const EVOS = []; for (let i=1;i<=12;i++) for (const t of ['Dia','Noche'])
      EVOS.push({ID_CAMA:String(i),TURNO_KEY:'2026-07-28-'+t,PAC_NOMBRE:'Antiguo '+i,PAC_EDAD:50+i,PAC_SEXO:'M',
        VENT_SOPORTE:'VM',VENT_VIA_AEREA:'TOT',VENT_MODO:'ACVC',DIA_ESTADIA:4,DIAS_VM:4,PLAN_FIRMA_KINE:'DMV',
        PATIENT_ID:'P'+i,COD_PACIENTE:'C'+i});
    window.__acciones = [];
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) { window.__n.api++; window.__acciones.push(a);
        const R = { GET_CONFIG_UI:{NUM_CAMAS:18,BANNERS:{}}, GET_TODAS_CAMAS:CAMAS, GET_CATALOGO:['Weaning'],
          GET_EVOS_DEL_DIA:(d&&d.fecha==='2026-07-28')?EVOS:[], GET_ASIGNACION_TURNO:{team:[],assign:{}},
          GET_BOOT:{ yo:{email:'',firma:'DEV',dev:true}, config:{NUM_CAMAS:18,BANNERS:{}},
            fases:['Weaning'], camas:CAMAS, evos:[], asignacion:{team:[],assign:{}} } };
        setTimeout(() => ok({ ok: true, data: R[a] !== undefined ? R[a] : null }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve('..', 'v2', 'index.html'));
  await p.waitForTimeout(1500);
  const ARRANQUE = await p.evaluate(() => ({ acciones: window.__acciones.slice(), camas: document.querySelectorAll('#bedGrid .bcard').length }));
  const fails0 = [];
  {
    const eq0 = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails0.push(l); };
    eq0('el arranque usa GET_BOOT (un solo viaje de datos)', ARRANQUE.acciones.filter(x => x === 'GET_BOOT').length, 1);
    eq0('sin viajes redundantes al arrancar (máx. 2 llamadas)', ARRANQUE.acciones.length <= 2, true);
    eq0('ya sin «Verificando identidad» (WHOAMI fuera del arranque)', ARRANQUE.acciones.indexOf('WHOAMI'), -1);
    eq0('las 18 camas pintadas tras el boot rápido', ARRANQUE.camas, 18);
  }
  // Día↔Noche: el censo de camas y las evoluciones de una fecha ya vista
  // salen del caché. Legítimos: la asignación de colegas (es POR TURNO y se
  // carga en segundo plano) y UNA lectura de evos si el turno cruza de fecha
  // (la noche parte el día anterior).
  const TOGGLE = await p.evaluate(async () => {
    const antes = window.__acciones.length;
    toggleShift(); await new Promise(r => setTimeout(r, 250));
    toggleShift(); await new Promise(r => setTimeout(r, 250));
    return window.__acciones.slice(antes);
  });
  {
    const eq0 = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails0.push(l); };
    eq0('Día↔Noche no recarga el censo de camas', TOGGLE.filter(x => x === 'GET_TODAS_CAMAS').length, 0);
    eq0('Día↔Noche lee evos a lo sumo una vez (fechas nuevas)', TOGGLE.filter(x => x === 'GET_EVOS_DEL_DIA').length <= 1, true);
    eq0('el resto son solo asignaciones de turno en 2º plano',
        TOGGLE.every(x => ['GET_ASIGNACION_TURNO', 'GET_EVOS_DEL_DIA'].indexOf(x) > -1), true);
  }
  // instrumentar renderGrid
  await p.evaluate(() => { window.__n.grid = 0; const o = window.renderGrid;
    window.renderGrid = function(){ window.__n.grid++; return o.apply(this, arguments); }; });
  const base = await p.evaluate(() => ({ ...window.__n }));
  await p.waitForTimeout(3000);
  const reposo = await p.evaluate(() => ({ ...window.__n }));
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };
  eq('en reposo la grilla NO se repinta sola', reposo.grid - base.grid, 0);
  eq('en reposo no se llama al servidor', reposo.api - base.api, 0);
  // ahora viajar al pasado
  const t0 = Date.now();
  await p.evaluate(() => { $('gDate').value='2026-07-28'; onFechaChange(); });
  await p.waitForTimeout(3000);
  const retro = await p.evaluate(() => ({ ...window.__n, camas: document.querySelectorAll('#bedGrid .bcard').length }));
  const nGrid = retro.grid - reposo.grid;
  eq('viajar al pasado repinta pocas veces (<= 5)', nGrid > 0 && nGrid <= 5, true);
  eq('y pide los datos del día una sola vez (<= 3 llamadas)', (retro.api - reposo.api) <= 3, true);
  eq('se dibujan las 18 camas', retro.camas, 18);
  await p.waitForTimeout(3000);
  const retro2 = await p.evaluate(() => ({ ...window.__n }));
  eq('ya en vista retrospectiva, la grilla queda quieta', retro2.grid - retro.grid, 0);
  eq('y no sigue llamando al servidor', retro2.api - retro.api, 0);
  eq('la página sigue respondiendo', await p.evaluate(() => 1 + 1), 2);
  await b.close();
  fails.push(...fails0);
  if (errs.length) { console.log('❌ errores JS: ' + errs.slice(0, 3).join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
