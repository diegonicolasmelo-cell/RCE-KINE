// fio2_venturi.js — CON MASCARILLA DE VENTURI (MMV) HAY DÓNDE ANOTAR LA FiO₂,
// Y ES LA QUE ENTREGA EL CONECTOR.
//
// 🔴 DE DÓNDE SALE (22-ago-2026, Manuel con captura desde el turno): con
// SOPORTE = Oxigenoterapia/OAF y MODO = MMV, el módulo de Terapia Ventilatoria
// dibujaba FR, SpO₂ y UMA — y nada más. MMV caía en el `else` final de
// `renderParams()`, el mismo que atiende a los modos sin parámetros propios.
// O sea: el ÚNICO dato que define la terapia de ese paciente —a qué porcentaje
// está la Venturi— no tenía casilla, y se perdía turno a turno. El resto del
// sistema sí lo esperaba: `_entParams` (svc_entrega.gs) imprime la FiO₂ de la
// Venturi en la entrega de turno, y el motor de texto la narra si está.
//
// POR QUÉ UN DESPLEGABLE CERRADO Y NO UN CAMPO LIBRE: en Venturi la FiO₂ no se
// estima desde los litros (naricera) ni se titula continua (CNAF, VM): la fija
// el conector, y son siete. «33» con una Venturi es un dato que no existe.
// Los siete valores los dio Manuel: 24 · 26 · 28 · 30 · 35 · 40 · 50.
//
// Y POR QUÉ LA MITAD DE ESTA GUARDIA MIRA LO QUE **NO** CAMBIÓ: un desplegable
// es más estricto que un input, así que el riesgo simétrico es esconder un dato
// verdadero — la FiO₂ escrita libre ANTES de este cambio, o un valor tecleado a
// mano en la planilla, que al reabrir la evolución dejaría el select vacío y el
// re-guardado escribiría ese vacío EN SILENCIO. Por eso `_fillParamsVent()`
// rescata el valor fuera de catálogo como opción rotulada (igual que `poblar()`
// con los catálogos clínicos), y por eso las secciones 4 y 5 exigen que naricera,
// CNAF, VM y Ambiente sigan exactamente como estaban.
//
// Uso: node build/checks/fio2_venturi.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const v2 = path.resolve(__dirname, '..', '..', 'v2');

// La especificación clínica: los conectores que existen en la unidad.
const CATALOGO = ['24', '26', '28', '30', '35', '40', '50'];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window._ll = [];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) { window._ll.push({ a, d }); setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2, 'index.html'));
  await p.waitForTimeout(500);

  const fails = [];
  const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
  const si = (l, c) => eq(l, !!c, true);

  // Monta el módulo ventilatorio por la ruta REAL (las mismas cascadas que
  // corre fillForm al abrir un paciente), no fabricando HTML.
  const montar = (modo, sop) => p.evaluate(([m, s]) => {
    $('fVA').value = 'Natural'; cascadeVA(s || 'Oxigenoterapia/OAF'); cascadeSop(m);
    const el = $('r_fio2');
    return {
      modoVigente: v('fModo'),
      hayFio2: !!el,
      tag: el ? el.tagName : '',
      opciones: el && el.tagName === 'SELECT' ? [...el.options].map(o => o.value).filter(x => x !== '') : [],
      hayLitros: !!$('r_litros'),
      hayFio2Estimada: !!$('l_fio2nrc'),
      etiqueta: el ? (el.closest('.col')?.querySelector('label')?.textContent || '') : '',
    };
  }, [modo, sop]);

  /* ══ 1 · MMV TIENE FiO₂, Y ES UN CATÁLOGO CERRADO ═════════════════════ */
  console.log('1 · Terapia Ventilatoria con MMV');
  const MMV = await montar('MMV');
  eq('el modo vigente es MMV', MMV.modoVigente, 'MMV');
  si('hay dónde anotar la FiO₂', MMV.hayFio2);
  eq('y es un desplegable, no un campo libre', MMV.tag, 'SELECT');
  eq('con los siete conectores de la Venturi', MMV.opciones.join(','), CATALOGO.join(','));
  si('rotulada como programada, no estimada', /prog/i.test(MMV.etiqueta));
  si('sin litros: en Venturi el flujo lo fija el conector', !MMV.hayLitros);

  /* ══ 2 · EL DATO LLEGA AL SERVIDOR ════════════════════════════════════ */
  console.log('\n2 · Lo elegido viaja como VENT_FIO2');
  // 🪤 Tolerante a que el campo NO exista: contra el código sin arreglar no
  // existe, y un `null.value` reventaría el arnés aquí — dejando sin correr las
  // secciones 4 y 5, que son justo las que tienen que salir VERDES en el base
  // para que sus rojas signifiquen algo.
  const G = await p.evaluate(async () => {
    const set = (id, val) => { const e = $(id); if (e) e.value = val; };
    $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    const opt = document.createElement('option'); opt.value = 'Klgo. Test'; opt.textContent = 'Klgo. Test';
    $('fFirma').appendChild(opt); $('fFirma').value = 'Klgo. Test';
    $('fVA').value = 'Natural'; cascadeVA('Oxigenoterapia/OAF'); cascadeSop('MMV');
    set('r_fio2', '28'); set('r_fr', '22'); set('r_spo2', '95');
    _transAvisoOk = true; window._ll.length = 0; guardar();
    await new Promise(r => setTimeout(r, 80));
    const call = _ll.find(x => x.a === 'GUARDAR_EVOLUCION');
    return { fio2: call ? call.d.VENT_FIO2 : null, modo: call ? call.d.VENT_MODO : null,
             litros: call ? call.d.VENT_LITROS : null };
  });
  eq('la FiO₂ elegida viaja al guardado', G.fio2, '28');
  eq('con su modo', G.modo, 'MMV');
  si('y sin litros inventados', G.litros === '' || G.litros === null || G.litros === undefined);

  /* ══ 3 · EL DATO VIEJO NO DESAPARECE (el riesgo del catálogo cerrado) ══ */
  console.log('\n3 · Una FiO₂ fuera de catálogo se conserva, no se borra');
  const VIEJO = await p.evaluate(async () => {
    // Reapertura de una evolución guardada ANTES de este cambio: la FiO₂ se
    // escribía libre. Misma secuencia que fillForm: cascadas y después valores.
    $('fVA').value = 'Natural'; cascadeVA('Oxigenoterapia/OAF'); cascadeSop('MMV');
    if (typeof _fillParamsVent === 'function') _fillParamsVent({ VENT_FIO2: 33, VENT_FR: 20, VENT_SPO2: 93 });
    const el = $('r_fio2');
    const op = el && el.options ? [...el.options].find(o => o.value === '33') : null;
    // …y un re-guardado lo devuelve tal cual, no lo pisa con vacío
    $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    $('fFirma').value = 'Klgo. Test'; _transAvisoOk = true;
    window._ll.length = 0; guardar();
    await new Promise(r => setTimeout(r, 80));
    const call = _ll.find(x => x.a === 'GUARDAR_EVOLUCION');
    return { valor: el ? el.value : '(sin campo)', rotulo: op ? op.textContent : '', reguardado: call ? call.d.VENT_FIO2 : null };
  });
  eq('la FiO₂ de 33 sigue a la vista', VIEJO.valor, '33');
  si('marcada como registro anterior', /registro anterior/i.test(VIEJO.rotulo));
  eq('y el re-guardado la conserva', VIEJO.reguardado, '33');

  /* ══ 4 · NO REGRESIÓN: LOS OTROS MODOS NO SE TOCARON ══════════════════ */
  console.log('\n4 · Naricera, CNAF y VM siguen igual');
  const NRC = await montar('NRC');
  si('NRC conserva sus litros', NRC.hayLitros);
  si('…y su FiO₂ ESTIMADA (que en naricera se deduce, no se programa)', NRC.hayFio2Estimada);
  si('NRC no tiene desplegable de FiO₂', NRC.tag !== 'SELECT');

  const CNAF = await montar('CNAF');
  eq('CNAF mantiene su FiO₂ como campo libre', CNAF.tag, 'INPUT');
  si('CNAF no hereda el catálogo de la Venturi', CNAF.opciones.length === 0);

  const VM = await p.evaluate(() => {
    $('fVA').value = 'TOT'; cascadeVA('VM'); cascadeSop('ACVC');
    const el = $('r_fio2');
    return { tag: el ? el.tagName : '', hayPeep: !!$('r_peep'), hayPafi: !!$('r_pafi') };
  });
  eq('en VM la FiO₂ sigue siendo campo libre', VM.tag, 'INPUT');
  si('…con su PEEP y su PaFiO₂', VM.hayPeep && VM.hayPafi);

  const AMB = await p.evaluate(() => {
    $('fVA').value = 'Natural'; cascadeVA('Ambiente'); cascadeSop('Sin soporte');
    return { hayFio2: !!$('r_fio2'), hayFr: !!$('r_fr') };
  });
  si('en Ambiente no aparece FiO₂ (no hay oxígeno que programar)', !AMB.hayFio2);
  si('…pero sí la FR', AMB.hayFr);

  /* ══ 5 · LA MISMA REGLA EN LAS TRES PANTALLAS ═════════════════════════ */
  // Regla de la casa: una regla clínica vive en 3-4 sitios. La FiO₂ de la
  // Venturi vive en el módulo del turno, en el «queda con» de post-extubación
  // (PVE superada) y en su rama «no superada» — que hasta hoy pedía LITROS.
  console.log('\n5 · Post-extubación dice lo mismo que el turno');
  const PE = await p.evaluate(() => {
    const sel = $('peModo'); if (sel) sel.value = 'MMV';
    renderParamsPE();
    const e = $('pe_fio2');
    const selNo = $('peModoNo'); if (selNo) selNo.value = 'MMV';
    renderParamsPEno();
    const eNo = $('peFiO2No');
    return {
      pe: e ? [...e.options].map(o => o.value).filter(x => x !== '') : [],
      peTag: e ? e.tagName : '', peLitros: !!$('pe_litros'),
      no: eNo ? [...eNo.options].map(o => o.value).filter(x => x !== '') : [],
      noTag: eNo ? eNo.tagName : '', noLitros: !!$('peLtNo'),
    };
  });
  eq('PVE superada · mismo catálogo', PE.pe.join(','), CATALOGO.join(','));
  si('PVE superada · sin litros', !PE.peLitros);
  eq('PVE no superada · es desplegable', PE.noTag, 'SELECT');
  eq('PVE no superada · mismo catálogo', PE.no.join(','), CATALOGO.join(','));
  si('PVE no superada · ya no pide litros con Venturi', !PE.noLitros);

  /* ══ 6 · EL CATÁLOGO CABE EN LA VALIDACIÓN DEL GUARDADO ═══════════════ */
  // Propiedad, no memoria: los límites se leen del validador del propio front.
  // Un conector agregado fuera de rango bloquearía el guardado en silencio.
  console.log('\n6 · Ningún conector queda fuera del rango que valida el front');
  const src = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
  const m = src.match(/r\('r_fio2'\s*,\s*'[^']*'\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  si('el validador de r_fio2 sigue existiendo', !!m);
  if (m) {
    const min = +m[1], max = +m[2];
    const fuera = CATALOGO.map(Number).filter(x => x < min || x > max);
    eq(`todos los conectores caen entre ${min} y ${max}`, fuera.join(','), '');
  }
  const enPagina = await p.evaluate(() => (typeof _FIO2_VENTURI !== 'undefined' ? _FIO2_VENTURI.map(String) : []));
  eq('y el catálogo vive en UN solo lugar (_FIO2_VENTURI)', enPagina.join(','), CATALOGO.join(','));

  eq('sin errores JS', errs.join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} fallos: ${fails.join(' · ')}` : '\n✅ Todo OK');
  process.exit(fails.length ? 1 : 0);
})();
