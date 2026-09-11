// vm_por_horas.js — FECHA DE INGRESO MANUAL y DÍAS DE VM POR BLOQUES DE 24 h
// (Diego, 11-sep-2026: «los días de VM se cuentan respecto a las horas de VM:
// hora de ingreso si vienen ventilados, o fecha y hora de intubación… la
// sugerencia es la fecha actual, no la del turno». Y «1 sí»: la ESTADÍA sigue
// por calendario como BUDA, solo la VM pasa a bloques de 24 h.)
//
// Lo que fija:
//   1 · servidor: el ingreso escribe FECHA_INGRESO/TS_INGRESO con la fecha y
//       hora ESCRITAS (no la del turno); llegado ventilado, el reloj de la VM
//       es ese mismo momento; el censo y el turno cuentan bloques de 24 h;
//       la estadía sigue por calendario; CONFIG.VM_POR_HORAS=FALSE vuelve a
//       calendario; sin hora guardada, calendario.
//   2 · navegador: el panel de ingreso sugiere hoy + ahora, editable; la
//       evolución posterior lo muestra bloqueado; el payload lleva
//       PAC_FECHA_INGRESO; la tarjeta cuenta bloques contra ahora.
//
// 🪤 Fechas relativas: el simulador tiene su reloj (hoyISO) y el navegador el
// suyo (hoy()); cada bloque usa el que le toca.
//
// Uso: node build/checks/vm_por_horas.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright-core');
const V2 = path.resolve(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const ok = String(g) === String(w);
  console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g));
  if (!ok) { fails.push(l); console.log('   esperado: ' + JSON.stringify(w)); } };
const si = (l, g) => eq(l, !!g, 'true');

(async () => {
  console.log('\n1 · Servidor (simulador)');
  const { api, DB, CONFIG } = require('../sim/sim_srv.js');
  const hoy = () => global.hoyISO();
  const hace = n => { const d = new Date(hoy() + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const cama = id => DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === String(id)) || {};
  const base = (id, tk, extra) => Object.assign({
    idCama: String(id), turnoKey: tk, FECHA: tk.slice(0, 10), TURNO: tk.slice(11),
    VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC', VENT_VT: 450, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 50,
    SED_TIPO: 'Escalón 2', SED_SAS: '2', HEMO_ESTADO: 'Estable', PLAN_PLANES: 'x', PLAN_FIRMA_KINE: 'DMV',
  }, extra || {});
  const ahora = global._tsAhora();
  si('el simulador tiene reloj fijo', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(ahora));
  si('CONFIG trae VM_POR_HORAS en TRUE', global.vmPorHoras() === true);

  console.log('\n1a · Ingreso con fecha y hora ESCRITAS (llegó ventilado hace 2 días y 5 horas)');
  const f2 = hace(2);
  let r = api('GUARDAR_EVOLUCION', base(4, hoy() + '-Dia', { ES_INGRESO: true, PAC_NOMBRE: 'PRUEBA RELOJ', PAC_EDAD: 60, PAC_SEXO: 'M',
    PAC_FECHA_INGRESO: f2, PAC_HORA_INGRESO: '05:00' }), null);
  si('★ el ingreso guarda', r.ok);
  eq('★ FECHA_INGRESO = la fecha ESCRITA, no la del turno', String(cama(4).FECHA_INGRESO), f2);
  eq('★ TS_INGRESO = fecha + hora escritas', String(cama(4).TS_INGRESO), f2 + ' 05:00');
  eq('★ llegó ventilado: el reloj de la VM es el momento de ingreso', String(cama(4).TS_INICIO_SOPORTE), f2 + ' 05:00');
  eq('…y la fecha de inicio del soporte también', String(cama(4).FECHA_INICIO_SOPORTE), f2);
  eq('…igual el reloj de la vía aérea', String(cama(4).TS_INICIO_VA), f2 + ' 05:00');
  const evoIng = DB.EVOLUCIONES.find(e => String(e.ID_CAMA) === '4');
  si('PAC_FECHA_INGRESO NO es columna de EVOLUCIONES (transitorio, como PAC_RUT)', !/PAC_FECHA_INGRESO/.test(fs.readFileSync(path.join(V2, 'esquema.gs'), 'utf8')));
  // El turno de HOY parte a las 09:00 (CONFIG): desde hace 2 días 05:00 son 52 h ⇒ 2 bloques.
  eq('★ el turno de ingreso cuenta la VM por bloques: 2 (52 h)', String(evoIng.DIAS_VM), '2');
  eq('…y la estadía por CALENDARIO: 2', String(evoIng.DIA_ESTADIA), '2');

  console.log('\n1b · El censo (tarjetas) cuenta bloques contra AHORA');
  r = api('GET_TODAS_CAMAS', {}, null);
  const c4 = (r.data || []).find(c => String(c.ID_CAMA) === '4') || {};
  const hReal = global._horasEntreTS(f2 + ' 05:00', ahora);
  eq('★ DIAS_VM del censo = floor(horas/24)', String(c4.DIAS_VM), String(Math.floor(hReal / 24)));
  eq('DIA_ESTADIA del censo = calendario', String(c4.DIA_ESTADIA), String(global.diasEntre(f2, hoy())));

  console.log('\n1c · Intubado EN la unidad: el reloj es la hora de intubación');
  r = api('GUARDAR_EVOLUCION', base(5, hace(3) + '-Dia', { ES_INGRESO: true, PAC_NOMBRE: 'PRUEBA INTUB', PAC_EDAD: 50, PAC_SEXO: 'F',
    PAC_FECHA_INGRESO: hace(3), PAC_HORA_INGRESO: '10:00', VENT_VIA_AEREA: 'Natural', VENT_SOPORTE: 'Oxigenoterapia', VENT_MODO: '' }), null);
  si('ingresa sin ventilación', r.ok);
  eq('…sin reloj de VM', String(cama(5).TS_INICIO_SOPORTE || ''), '');
  r = api('GUARDAR_EVOLUCION', base(5, hace(1) + '-Noche', { INTUB_OCURRIO: true, INTUB_HORA: '22:30', VENT_VIA_AEREA: 'Natural', VENT_VIA_AEREA_FINAL: 'TOT',
    VENT_SOPORTE: 'Oxigenoterapia', VENT_SOPORTE_FINAL: 'VM', PROC_JSON: JSON.stringify(['INTUBACIÓN']), PROC_RESUMEN: 'INTUBACIÓN', PROC_CANTIDAD: 1 }), null);
  si('★ se intuba en el turno noche a las 22:30', r.ok);
  // _tsDesdeHora es relativo a AHORA (reloj fijo del simulador): la ocurrencia más reciente de las 22:30.
  si('★ el reloj de la VM lleva la hora de intubación', /22:30$/.test(String(cama(5).TS_INICIO_SOPORTE)));
  const ts5 = String(cama(5).TS_INICIO_SOPORTE);
  r = api('GUARDAR_EVOLUCION', base(5, hoy() + '-Dia', {}), null);
  const e5 = DB.EVOLUCIONES.find(e => String(e.ID_CAMA) === '5' && e.TURNO_KEY === hoy() + '-Dia');
  eq('★ el turno siguiente cuenta bloques desde esa hora hasta las 09:00 de hoy',
    String(e5.DIAS_VM), String(Math.max(0, global.diasBloques(ts5, hoy() + ' 09:00') || 0)));

  console.log('\n1d · Sin hora guardada (episodio viejo) y con el interruptor apagado: calendario');
  // 🪤 El simulador ya trae las camas sembradas: se actualiza la 9, no se agrega otra.
  global.repoActualizar('CAMAS_ESTADO', 'ID_CAMA', '9', { OCUPADA: true, PATIENT_ID: 'viejo', NOMBRE: 'SIN HORA', VIA_AEREA: 'TOT', SOPORTE: 'VM',
    FECHA_INGRESO: hace(6), FECHA_INICIO_SOPORTE: hace(6), FECHA_INICIO_VA: hace(6), TS_INGRESO: '', TS_INICIO_SOPORTE: '' });
  r = api('GET_TODAS_CAMAS', {}, null);
  eq('sin TS_INICIO_SOPORTE la VM sale por calendario (6)', String((r.data.find(c => String(c.ID_CAMA) === '9') || {}).DIAS_VM), '6');
  CONFIG.VM_POR_HORAS = 'FALSE';
  si('el interruptor apagado se lee', global.vmPorHoras() === false);
  r = api('GET_TODAS_CAMAS', {}, null);
  eq('★ apagado: la cama 4 vuelve a calendario', String((r.data.find(c => String(c.ID_CAMA) === '4') || {}).DIAS_VM), String(global.diasEntre(f2, hoy())));
  CONFIG.VM_POR_HORAS = 'TRUE';

  console.log('\n2 · Navegador');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.__llamadas = [];
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) { window.__llamadas.push({ a, d });
        setTimeout(() => ok({ ok: true, data: a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {}, VM_POR_HORAS: true, TURNO_DIA_INICIO: 9, TURNO_NOCHE_INICIO: 21 } : null }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(V2, 'index.html'));
  await p.waitForTimeout(800);
  await p.evaluate(() => { window.CFG = Object.assign(window.CFG || {}, { VM_POR_HORAS: true, TURNO_DIA_INICIO: 9, TURNO_NOCHE_INICIO: 21 }); window._horaAhoraCli = () => '10:00'; });
  const R = await p.evaluate(() => {
    const hb = n => { const d = new Date(hoy() + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const h15 = hb(15);
    DB = [{ ID_CAMA: '3', OCUPADA: true, PATIENT_ID: 'p3', NOMBRE: 'PRUEBA', EDAD: 60, SEXO: 'M', VIA_AEREA: 'TOT', SOPORTE: 'VM',
            FECHA_INGRESO: h15, TS_INGRESO: h15 + ' 14:30', FECHA_INICIO_SOPORTE: h15, TS_INICIO_SOPORTE: h15 + ' 14:30', FECHA_INICIO_VA: h15, TS_INICIO_VA: h15 + ' 14:30' }];
    renderGrid();
    const txt = (document.querySelector('#bedGrid') || {}).textContent || '';
    const fn = diasVMCli(h15 + ' 14:30', h15, hoy(), hoy() + ' 10:00');
    const fnCal = diasCal('', h15, hoy());
    return { txt, fn, fnCal, h15, hoy: hoy() };
  });
  // Desde hace 15 días 14:30 hasta hoy 10:00 = 355,5 h ⇒ 14 bloques (calendario diría 15).
  eq('★ diasVMCli cuenta bloques de 24 h: 14', R.fn, 14);
  eq('…mientras el calendario daría 15', R.fnCal, 15);
  si('★ la tarjeta dice «VM 14d» y no «VM 15d»', /VM 14d/.test(R.txt) && !/VM 15d/.test(R.txt));
  si('…y la estadía por calendario: Día 15', /Día 15/.test(R.txt));
  // Panel de INGRESO: sugiere hoy + ahora, editable
  await p.evaluate(() => abrirPanel('7', true)); await p.waitForTimeout(400);
  const ING = await p.evaluate(() => { const fi = document.getElementById('fFechaIng'), hi = document.getElementById('fHoraIng'); return { fecha: fi.value, hora: hi.value, editable: !fi.disabled, hoy: hoy() }; });
  eq('★ el panel de INGRESO sugiere la fecha de HOY', ING.fecha, ING.hoy);
  eq('…y la hora de ahora', ING.hora, '10:00');
  si('…editables', ING.editable);
  // Panel de EVOLUCIÓN de la cama 3: muestra lo guardado, bloqueado
  // 🪤 El turno de la app sale del reloj real (de noche sería «Noche» y la
  // referencia las 21:00): se fija el turno Día para que el número sea estable.
  await p.evaluate(() => { try { SHIFT = 'Dia'; } catch (e) {} abrirPanel('3', false); }); await p.waitForTimeout(600);
  const EVO = await p.evaluate(() => { const fi = document.getElementById('fFechaIng'), hi = document.getElementById('fHoraIng');
    return { fecha: fi.value, hora: hi.value, editable: !fi.disabled, diasVM: document.getElementById('fDiasVM').value, dias: document.getElementById('fDias').value }; });
  eq('★ la evolución posterior muestra la fecha guardada', EVO.fecha, R.h15);
  eq('…y la hora guardada', EVO.hora, '14:30');
  si('…bloqueada la fecha (se corrige en coordinación)', !EVO.editable);
  eq('★ el formulario cuenta la VM por bloques hasta las 09:00 del turno: 14', EVO.diasVM, '14');
  eq('…y la estadía por calendario: 15', EVO.dias, '15');
  si('el payload lleva PAC_FECHA_INGRESO', /PAC_FECHA_INGRESO:v\('fFechaIng'\)/.test(fs.readFileSync(path.join(V2, 'index.html'), 'utf8')));
  eq('sin errores de JavaScript', errs.join(' | '), '');
  await b.close();
  console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS' : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
