// pve_no_toca_los_dias.js — 🔴 UNA PVE NO ES UNA EXTUBACIÓN, Y NADIE REINICIA
// LOS DÍAS SIN UN EVENTO DECLARADO (v6.14, 7-sep-2026).
//
// DE DÓNDE SALE. Reporte de Diego desde el uso: «Aline evolucionó al paciente
// de la cama 17, registró PVE/extubación: NO —pero NO extubó— y le reinició
// los días de VM y de TOT a 0. Recuerda que PVE no significa extubar, por lo
// que no debe tocar los días».
//
// LO QUE SE ENCONTRÓ AL REPRODUCIRLO. La PVE no tuvo nada que ver: el «No»
// deja `_extOcurrio()` en falso y el formulario intacto (bloque 1). La causa
// estaba en el turno HEREDADO: `fillFormReplica` copiaba el estado FINAL del
// turno anterior POR ENCIMA de la cama. Con una fila previa que terminaba en
// «Natural / Ambiente», el formulario se abría sin tubo aunque la cama dijera
// TOT —y los contadores seguían mostrando los días de la cama, así que no se
// veía nada raro—. Al guardar, el servidor leía «Natural», concluía cambio de
// vía aérea, borraba FECHA_INICIO_VA y bajaba el soporte a Ambiente: días de
// VM y de TOT a 0.
//
// LO QUE FIJA:
//  1. Con PVE «No» (y «no corresponde») el formulario no toca vía aérea,
//     soporte ni contadores, y no declara extubación.
//  2. Si la fila del turno anterior discrepa de la cama, MANDA LA CAMA.
//  3. Ninguna variante de PVE mueve FECHA_INICIO_VA ni FECHA_INICIO_SOPORTE
//     en el servidor (incluida «superada sin extubar», que es PVE ganada y
//     paciente todavía intubado).
//  4. Una extubación DECLARADA sí cambia el estado: la regla protege del
//     accidente, no del registro clínico verdadero.
//
// Uso: node build/checks/pve_no_toca_los_dias.js
const path = require('path');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

/* ══ 1 y 2 · EL FORMULARIO ═══════════════════════════════════════════════ */
const { chromium } = require('playwright-core');
/* 🪤 9-sep-2026 — FECHAS RELATIVAS, NUNCA FIJAS. Esta guardia se puso roja sola
   al cambiar el día: el banco anclaba el tramo en un '2026-08-25' escrito a
   mano y la app cuenta los días contra HOY, así que la cifra esperada crecía
   una por jornada («16/13» pasó a «18/15» en dos días). Una guardia que se cae
   sola por el calendario es peor que no tenerla: enseña a ignorar el rojo.
   Todo ancla de fecha se escribe con `hace(n)`. */
const hace = n => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
const CAMA = { ID_CAMA: '17', OCUPADA: true, NOMBRE: 'PACIENTE 17', PATIENT_ID: 'p17',
  VIA_AEREA: 'TOT', SOPORTE: 'VM', MODO: 'ACVC', TOT_NUMERO: '7.5', TOT_CM_LABIO: '22',
  FECHA_INICIO_VA: hace(13), FECHA_INICIO_SOPORTE: hace(13),
  TS_INICIO_VA: hace(13) + ' 10:00:00', TS_INICIO_SOPORTE: hace(13) + ' 10:00:00',
  DIAS_VA: 13, DIAS_VM: 13, FECHA_INGRESO: hace(13) };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const abrir = async (previa) => {
    const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
    await p.addInitScript((prev) => {
      window.google = { script: { run: { withSuccessHandler(o) { return { withFailureHandler() { return {
        api(a) { const data = a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 18, BANNERS: {} }
                            : a === 'GET_EVO_TURNO' ? { actual: null, previa: prev } : null;
          setTimeout(() => o({ ok: true, data }), 5); } }; } }; } } } };
    }, previa);
    await p.goto('file://' + path.join(__dirname, '..', '..', 'v2', 'index.html'));
    await p.waitForTimeout(600);
    // 🪤 ANCLA DE FECHA Y TURNO (12-sep-2026): la app cuenta los días contra
    // `gDate` (la fecha del TURNO), no contra hoy(). Corriendo de MADRUGADA el
    // turno lógico es «Noche del día anterior» y gDate queda un día atrás: el
    // banco, armado con hoy(), daba un día de más y esta guardia se ponía roja
    // SOLA a partir de cierta hora. Anclar el turno Día y la fecha de hoy.
    await p.evaluate(() => { try { SHIFT = 'Dia'; } catch (e) {}
      const g = document.getElementById('gDate'); if (g) g.value = hoy();
      // Esta guardia fija que la PVE NO MUEVE los contadores, no CÓMO se
      // cuentan: se mide con la regla de CALENDARIO (v5.35), que sigue viva
      // con el interruptor apagado. La cuenta por bloques de 24 h de la v6.26
      // tiene su propia guardia (vm_por_horas.js).
      window.CFG = Object.assign(window.CFG || {}, { VM_POR_HORAS: false }); });
    await p.evaluate((c) => { DB = [c]; abrirPanel('17', false, false); }, CAMA);
    await p.waitForTimeout(350);
    return p;
  };

  console.log('1 · Con PVE «No» el formulario no toca nada de la vía aérea');
  let p = await abrir(null);
  const antes = await p.evaluate(() => ({ va: v('fVA'), sop: v('fSop'), dvа: v('fDiasVA'), dvm: v('fDiasVM') }));
  const conNo = await p.evaluate(() => { hPVEtoggle('no');
    return { va: v('fVA'), sop: v('fSop'), dva: v('fDiasVA'), dvm: v('fDiasVM'),
             ext: _extOcurrio(), tipo: _extTipo() }; });
  eq('la vía aérea sigue siendo TOT', conNo.va, 'TOT');
  eq('el soporte sigue siendo VM', conNo.sop, 'VM');
  si('★ los días NO se mueven', conNo.dva === antes.dvа && conNo.dvm === antes.dvm);
  si('★ «No» no declara extubación', !conNo.ext && conNo.tipo === '');
  const conNc = await p.evaluate(() => { hPVEtoggle('nc');
    return { va: v('fVA'), sop: v('fSop'), ext: _extOcurrio() }; });
  si('«no corresponde» tampoco', conNc.va === 'TOT' && conNc.sop === 'VM' && !conNc.ext);
  const supSin = await p.evaluate(() => { hPVEtoggle('si');
    const r = document.querySelector('input[name="pveRes"][value="superada"]'); r.checked = true; hPVEres();
    const n = document.querySelector('input[name="pveSupExt"][value="no"]'); if (n) { n.checked = true; hPveSupExt(); }
    return { ext: _extOcurrio(), va: v('fVA'), sop: v('fSop') }; });
  si('★ PVE superada SIN extubar: gana la prueba y sigue intubado', !supSin.ext && supSin.va === 'TOT' && supSin.sop === 'VM');
  await p.close();

  /* ── 1b · EL MANOTAZO EN EL SELECT SE DESHACE (PRD de Diego, 7-sep-2026) ──
     «Me equivoco y modifico la vía aérea pero no confirmo nada… al terminar de
     evolucionar me doy cuenta de que se reiniciaron los días de vía aérea y no
     se pueden corregir: confusión, frustración y datos falsos. Cómo debería
     ser: me equivoco pero corrijo de nuevo de Natural a TOT; por suerte aún no
     guardo y no se modificó nada.» */
  console.log('\n1b · Cambiar la vía aérea por error y volver atrás no deja rastro');
  p = await abrir(null);
  const manotazo = await p.evaluate(() => {
    const foto = () => ({ va: v('fVA'), sop: v('fSop'), dTOT: v('fDiasTOT'), dVA: v('fDiasVA'), dVM: v('fDiasVM') });
    const llegada = foto();
    const sel = document.getElementById('fVA');
    sel.value = 'Natural'; cascadeVA(); const enNatural = foto();
    sel.value = 'TOT'; cascadeVA(); const devuelta = foto();
    // Y el camino largo: TOT → TQT → Natural → TOT, todo sin declarar nada.
    sel.value = 'TQT'; cascadeVA(); sel.value = 'Natural'; cascadeVA();
    sel.value = 'TOT'; cascadeVA(); const vueltaLarga = foto();
    // 🪤 Pasando por la opción EN BLANCO: el guardia de la transición empieza
    // con `_vaAnterior &&`, así que por ahí el deshacer no se disparaba
    // (encontrado el 7-sep probando los 99 controles del panel uno por uno).
    sel.value = ''; cascadeVA(); sel.value = 'TOT'; cascadeVA();
    const porElBlanco = foto();
    // Con un evento DECLARADO manda el evento, no el deshacer.
    const ti = document.getElementById('cTqtO');
    ti.checked = true; if (typeof hTqtO === 'function') hTqtO();
    sel.value = 'TQT'; cascadeVA(); sel.value = 'TOT'; cascadeVA();
    const conEvento = foto();
    ti.checked = false; if (typeof hTqtO === 'function') hTqtO();
    return { llegada, enNatural, devuelta, vueltaLarga, porElBlanco, conEvento };
  });
  eq('★ vuelve a TOT y los días quedan como llegaron',
    JSON.stringify(manotazo.devuelta), JSON.stringify(manotazo.llegada));
  si('★ …incluidos los días de VM (el bug los dejaba en 0)', manotazo.devuelta.dVM === manotazo.llegada.dVM && manotazo.llegada.dVM !== '0');
  eq('★ el camino largo TOT→TQT→Natural→TOT tampoco deja rastro',
    JSON.stringify(manotazo.vueltaLarga), JSON.stringify(manotazo.llegada));
  eq('★ …ni pasando por la opción en blanco',
    JSON.stringify(manotazo.porElBlanco), JSON.stringify(manotazo.llegada));
  si('mientras está en Natural los contadores no se pierden (el dato sigue siendo el de la cama)',
    manotazo.enNatural.dVM === manotazo.llegada.dVM);
  si('★ pero con un evento DECLARADO manda el evento, no el deshacer',
    manotazo.conEvento.dVM !== manotazo.llegada.dVM || manotazo.conEvento.dTOT !== manotazo.llegada.dTOT);
  await p.close();

  /* ── 1c · LOS TRAMOS DE VM SE SUMAN Y NO SE PIERDEN ──
     Regla de Diego (7-sep-2026): «los días de VM se cuentan corridos desde la
     primera intubación pero son efectivos hasta la extubación; si requiere
     reintubación se suma a un total de VM, pero son días nuevos de VM desde la
     reintubación». O sea: total = tramos anteriores + tramo vigente, y el
     tramo vigente arranca en la reintubación. */
  console.log('\n1c · Tras una reintubación, el total de VM se conserva turno a turno');
  p = await abrir({ TURNO_KEY: '2026-09-06-Noche', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM',
    VENT_MODO: 'ACVC', VENT_VIA_AEREA_FINAL: 'TOT', VENT_SOPORTE_FINAL: 'VM',
    DIAS_VM_PREVIOS: 3, N_REINTUB: 1, PLAN_FIRMA_KINE: 'ALN' });
  const tramos = await p.evaluate(() => ({ previos: _diasVMPrevios, nReintub: _nReintub,
    muestra: v('fDiasVM'), etiqueta: document.getElementById('lblDiasVM').textContent }));
  eq('★ el turno nuevo conserva los 3 días del tramo anterior', tramos.previos, 3);
  eq('★ …y las reintubaciones del episodio', tramos.nReintub, 1);
  eq('★ el campo muestra total/episodio, no solo el tramo vigente (3 previos + 13 del tramo)', tramos.muestra, '16/13');
  eq('…con su etiqueta', tramos.etiqueta, 'VM tot/ep');
  await p.close();
  // Sin reintubaciones no se inventa nada: un solo tramo se ve como siempre.
  p = await abrir({ TURNO_KEY: '2026-09-06-Noche', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM',
    VENT_MODO: 'ACVC', VENT_VIA_AEREA_FINAL: 'TOT', VENT_SOPORTE_FINAL: 'VM', PLAN_FIRMA_KINE: 'ALN' });
  const unTramo = await p.evaluate(() => ({ previos: _diasVMPrevios, muestra: v('fDiasVM'),
    etiqueta: document.getElementById('lblDiasVM').textContent }));
  si('un episodio de un solo tramo se ve como siempre', unTramo.previos === 0 && unTramo.etiqueta === 'Días VM' && unTramo.muestra === '13');
  await p.close();

  console.log('\n2 · Si el turno anterior discrepa de la cama, manda la CAMA');
  p = await abrir({ TURNO_KEY: '2026-09-06-Noche', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM',
    VENT_MODO: 'ACVC', VENT_VIA_AEREA_FINAL: 'Natural', VENT_SOPORTE_FINAL: 'Ambiente',
    VENT_MODO_FINAL: '', PLAN_FIRMA_KINE: 'ALN' });
  const heredado = await p.evaluate(() => ({ va: v('fVA'), sop: v('fSop'), modo: v('fModo') }));
  eq('★ la vía aérea es la de la cama (TOT), no el «Natural» heredado', heredado.va, 'TOT');
  eq('★ …y el soporte es VM, no «Ambiente»', heredado.sop, 'VM');
  await p.close();

  // …pero cuando coinciden, la continuidad se replica igual que siempre.
  p = await abrir({ TURNO_KEY: '2026-09-06-Noche', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM',
    VENT_MODO: 'PC', VENT_VIA_AEREA_FINAL: 'TOT', VENT_SOPORTE_FINAL: 'VM',
    VENT_MODO_FINAL: 'PC', PLAN_FIRMA_KINE: 'ALN' });
  const igual = await p.evaluate(() => ({ va: v('fVA'), sop: v('fSop'), modo: v('fModo') }));
  si('cuando coinciden, el modo del turno anterior sí se hereda', igual.va === 'TOT' && igual.sop === 'VM' && igual.modo === 'PC');
  await p.close();
  await b.close();

  /* ══ 3 y 4 · EL SERVIDOR ═══════════════════════════════════════════════ */
  console.log('\n3 · Ninguna PVE mueve los relojes en el servidor');
  const { api, DB } = require('../sim/sim_srv.js');
  const bed = () => DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === '6') || {};
  let r = api('INGRESAR_PACIENTE', { idCama: '6', nombre: 'Paciente 17', edad: 60, sexo: 'M',
    diagnostico: 'NAC grave', fechaIngreso: hace(13), viaAerea: 'TOT', soporte: 'VM',
    modo: 'ACVC', firmaKine: 'DMV' }, null);
  si('ingresa el paciente', r.ok);
  const ANCLA_VA = hace(13), ANCLA_SOP = hace(13);
  const reponer = () => { const c = bed(); c.FECHA_INICIO_VA = ANCLA_VA; c.FECHA_INICIO_SOPORTE = ANCLA_SOP;
    c.TS_INICIO_VA = ANCLA_VA + ' 10:00:00'; c.TS_INICIO_SOPORTE = ANCLA_SOP + ' 10:00:00';
    c.VIA_AEREA = 'TOT'; c.SOPORTE = 'VM'; };
  const guardar = (n, extra) => {
    reponer();
    const r2 = api('GUARDAR_EVOLUCION', Object.assign({
      idCama: '6', turnoKey: '2026-09-0' + n + '-Dia', FECHA: '2026-09-0' + n, TURNO: 'Dia',
      PAC_NOMBRE: 'Paciente 17', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
      VENT_VIA_AEREA_FINAL: 'TOT', VENT_SOPORTE_FINAL: 'VM', VENT_MODO_FINAL: 'ACVC',
      VENT_VT: 450, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 40,
      SED_TIPO: 'Escalón 4', SED_SAS: '3', HEMO_ESTADO: 'Estable',
      PLAN_PLANES: 'seguir', PLAN_FIRMA_KINE: 'ALN',
      // Estos tres viajan SIEMPRE desde el formulario, haya o no extubación:
      EXT_PE_VA: 'Natural', EXT_PE_SOP: 'Ambiente', EXT_PE_MODO: '',
    }, extra), null);
    const c = bed();
    return { ok: r2.ok, error: r2.error, va: c.VIA_AEREA, sop: c.SOPORTE,
             fva: c.FECHA_INICIO_VA, fsop: c.FECHA_INICIO_SOPORTE };
  };
  const intacto = (x) => x.ok && x.va === 'TOT' && x.sop === 'VM' && x.fva === ANCLA_VA && x.fsop === ANCLA_SOP;

  si('★ PVE «no» (destete diferido) deja los dos relojes intactos',
    intacto(guardar(1, { PVE_VAL: 'no', PVE_SC_RAZON: 'Sedación profunda' })));
  si('★ PVE «no corresponde» también', intacto(guardar(2, { PVE_VAL: 'nc' })));
  si('★ PVE fracasada también', intacto(guardar(3, { PVE_VAL: 'si', PVE_RESULTADO: 'frustra', PVE_FR_MOTIVOS: '["FR > 35 rpm"]' })));
  si('★ PVE superada SIN extubar también (el paciente sigue conectado)',
    intacto(guardar(4, { PVE_VAL: 'si', PVE_RESULTADO: 'superada',
      PVE_SUP_SIN_EXT: true, PVE_SUP_SIN_EXT_RAZ: 'Sin cupo de vigilancia', EXT_OCURRIO: false })));

  console.log('\n4 · Una extubación DECLARADA sí cambia el estado (no se rompió lo que sí debe pasar)');
  const ext = guardar(5, { PVE_VAL: 'si', PVE_RESULTADO: 'superada', EXT_OCURRIO: true,
    EXT_TIPO: 'protocolo', EXT_HORA: '11:20',
    VENT_VIA_AEREA_FINAL: 'Natural', VENT_SOPORTE_FINAL: 'Oxigenoterapia/OAF', VENT_MODO_FINAL: 'NRC' });
  si('★ con extubación declarada la cama pasa a Natural y suelta el reloj de vía aérea',
    ext.ok && ext.va === 'Natural' && ext.sop === 'Oxigenoterapia/OAF' && ext.fva === '');

  console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS:\n' + fails.map(f => '  - ' + f).join('\n')
                           : '\n✅ pve_no_toca_los_dias: todo verde');
  process.exit(fails.length ? 1 : 0);
})();
