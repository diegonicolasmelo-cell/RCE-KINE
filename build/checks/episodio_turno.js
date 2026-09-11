// episodio_turno.js — Rama paralela «episodio y turno» (11-sep-2026, decisiones
// de Diego en bloque). Cuatro casas para el dato: episodio (una vez) · serie
// fechada (N veces, con fecha y firma) · evento (un hecho a una hora) · turno.
//
// Lo que esta guardia fija:
//   1 · el esquema (hoja EVALUACIONES, DATOS_JSON en TIMELINE, firmas en la
//       cama) SIN tocar las 396 columnas de EVOLUCIONES;
//   2 · el servidor: escalas del episodio desde la tarjeta, la serie con firma,
//       lo que mide un turno pasa a la serie con SU firma, SBC exige FSS, la
//       vía aérea no cambia sin evento o sin motivo, los hitos llevan detalle,
//       la auditoría encuentra la huella F;
//   3 · el navegador: chips en la tarjeta, medir sin abrir la evolución, la
//       fila de eventos y la línea fina, el motivo obligatorio, el banner.
//
// 🪤 Fechas SIEMPRE relativas (regla del 9-sep): nada anclado a un día fijo.
//
// Uso: node build/checks/episodio_turno.js
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
  console.log('\n1 · Esquema — aditivo, EVOLUCIONES intacta');
  const esq = fs.readFileSync(path.join(V2, 'esquema.gs'), 'utf8');
  si('hoja EVALUACIONES declarada', /\n  EVALUACIONES: \{ headerRows: 1, cols: \[/.test(esq));
  const tl = (esq.match(/\n  TIMELINE: \{ headerRows: 1, cols: \[([\s\S]*?)\n  \]\}/) || [])[1] || '';
  si('TIMELINE termina en DATOS_JSON', /\['DATOS_JSON','json'\],\s*$/.test(tl.trim()) || /DATOS_JSON[^\n]*\n\s*$/.test(tl));
  const ce = (esq.match(/\n  CAMAS_ESTADO: \{ headerRows: 2, cols: \[([\s\S]*?)\n  \]\}/) || [])[1] || '';
  ['ULT_MRC_FIRMA', 'ULT_FSS_FIRMA', 'ULT_PIM_FIRMA', 'AET_ACTIVA', 'AET_NIVEL', 'UPOT_ACTIVO'].forEach(c =>
    si('CAMAS_ESTADO tiene ' + c, ce.indexOf("['" + c + "'") !== -1));
  si('★ EVOLUCIONES sigue en 396 columnas (no se toca)', /TOTAL_COLS\.EVOLUCIONES !== 396/.test(esq));
  si('la entrega imprime la firma junto a la fecha', /ULT_MRC_FIRMA/.test(fs.readFileSync(path.join(V2, 'svc_entrega.gs'), 'utf8')));

  console.log('\n2 · Servidor (simulador con hojas en memoria)');
  const { api, DB } = require('../sim/sim_srv.js');
  const hoy = () => global.hoyISO();
  const hace = n => { const d = new Date(hoy() + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
  const cama = id => DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === String(id)) || {};
  const base = (id, tk, extra) => Object.assign({
    idCama: String(id), turnoKey: tk, FECHA: tk.slice(0, 10), TURNO: tk.slice(11),
    VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
    VENT_VT: 450, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 50,
    SED_TIPO: 'Escalón 2', SED_SAS: '2', HEMO_ESTADO: 'Estable',
    PLAN_PLANES: 'Protección pulmonar', PLAN_FIRMA_KINE: 'ARM',
  }, extra || {});
  const ingresar = (id, va) => api('INGRESAR_PACIENTE', { idCama: String(id), nombre: 'Paciente Episodio ' + id, edad: 58, sexo: 'F',
    diagnostico: 'NAC', fechaIngreso: hace(3), viaAerea: va || 'TOT', soporte: 'VM', modo: 'ACVC', firmaKine: 'DMV' }, null);

  console.log('\n2a · ECF desde la tarjeta → al episodio, se corrige encima, deja hito');
  ingresar(6);
  let r = api('EPISODIO_ESCALA', { idCama: '6', escala: 'ECF', valor: '5', firma: 'MCC' }, null);
  si('★ EPISODIO_ESCALA responde ok', r.ok);
  eq('★ ECF quedó en la CAMA (no en un turno)', String(cama(6).ECF), '5');
  si('…y dejó hito con su detalle', (DB.TIMELINE || []).some(h => h.TIPO === 'evaluacion' && /ECF 5/.test(h.TEXTO) && /"escala":"ECF"/.test(String(h.DATOS_JSON || ''))));
  r = api('EPISODIO_ESCALA', { idCama: '6', escala: 'ECF', valor: '4', firma: 'DMV' }, null);
  eq('corregir = se pisa el mismo dato (Diego: «es la que es»)', String(cama(6).ECF), '4');
  eq('…y el hito dice que corrige', (DB.TIMELINE || []).filter(h => /ECF 4 \(corrige 5\)/.test(h.TEXTO)).length, 1);
  r = api('EPISODIO_ESCALA', { idCama: '6', escala: 'ECF', valor: '12' }, null);
  si('ECF fuera de 1-9 se rechaza', !r.ok);
  r = api('EPISODIO_ESCALA', { idCama: '11', escala: 'BARTHEL', valor: '80' }, null);
  si('cama sin paciente se rechaza', !r.ok);

  console.log('\n2b · MRC desde la tarjeta → serie fechada con firma + espejo en la cama');
  r = api('EVAL_REGISTRAR', { idCama: '6', escala: 'MRC', total: '36', items: { D: [3, 3, 3, 3, 3, 3], I: [3, 3, 3, 3, 3, 3] }, firma: 'MCC' }, null);
  si('★ EVAL_REGISTRAR responde ok', r.ok);
  eq('★ la serie tiene la medición', (DB.EVALUACIONES || []).filter(e => e.ESCALA === 'MRC').length, 1);
  eq('ULT_MRC en la cama', String(cama(6).ULT_MRC), '36');
  eq('★ ULT_MRC_FIRMA = quien midió', String(cama(6).ULT_MRC_FIRMA), 'MCC');
  eq('ULT_MRC_FECHA = hoy', String(cama(6).ULT_MRC_FECHA), hoy());
  r = api('EVAL_REGISTRAR', { idCama: '6', escala: 'MRC', total: '99', firma: 'MCC' }, null);
  si('MRC fuera de 0-60 se rechaza', !r.ok);
  r = api('GET_EVALUACIONES', { idCama: '6' }, null);
  eq('GET_EVALUACIONES: el ordinal se DERIVA (1ª)', (r.data.serie || []).filter(e => e.escala === 'MRC').map(e => e.n).join(','), '1');

  console.log('\n2c · Lo que mide un TURNO pasa a la serie con la firma del turno');
  const tk1 = hace(1) + '-Dia';
  r = api('GUARDAR_EVOLUCION', base(6, tk1, { EVAL_T_FSS: 21, EVAL_FSS_IT1: 4, EVAL_FSS_IT2: 4, EVAL_FSS_IT3: 4, EVAL_FSS_IT4: 4, EVAL_FSS_IT5: 5 }), null);
  si('el turno con FSS guarda', r.ok);
  const fss = (DB.EVALUACIONES || []).filter(e => e.ESCALA === 'FSS');
  eq('★ la serie recibió el FSS del turno', fss.length, 1);
  eq('…con la firma DEL TURNO, no la de la tarjeta', String((fss[0] || {}).FIRMA), 'ARM');
  eq('…origen: turno', String((fss[0] || {}).ORIGEN), 'turno');
  eq('…ítems guardados', String((fss[0] || {}).ITEMS_JSON), JSON.stringify(['4', '4', '4', '4', '5']).replace(/"(\d)"/g, '$1'));
  eq('ULT_FSS_FIRMA en la cama', String(cama(6).ULT_FSS_FIRMA), 'ARM');
  r = api('GUARDAR_EVOLUCION', base(6, tk1, { EVAL_T_FSS: 21, EVAL_FSS_IT1: 4, EVAL_FSS_IT2: 4, EVAL_FSS_IT3: 4, EVAL_FSS_IT4: 4, EVAL_FSS_IT5: 5 }), null);
  eq('★ re-guardar el mismo turno NO duplica la medición', (DB.EVALUACIONES || []).filter(e => e.ESCALA === 'FSS').length, 1);
  const tk2 = hoy() + '-Dia';
  r = api('GUARDAR_EVOLUCION', base(6, tk2, {}), null);
  eq('un turno sin medir no agrega nada a la serie', (DB.EVALUACIONES || []).filter(e => !e.ANULADA).length, 2);

  console.log('\n2d · SBC (KTM nivel 3) exige al menos un FSS-ICU del episodio');
  ingresar(7);
  r = api('GUARDAR_EVOLUCION', base(7, tk1, { KTM_REALIZADA: true, KTM_NIVEL_KTR: '3' }), null);
  si('★ sin ningún FSS en el episodio: se RECHAZA', !r.ok && /FSS-ICU/.test(String(r.error || '')));
  r = api('GUARDAR_EVOLUCION', base(7, tk1, { KTM_REALIZADA: true, KTM_NIVEL_KTR: '3', EVAL_T_FSS: 15 }), null);
  si('con el FSS medido en el mismo turno: pasa', r.ok);
  r = api('GUARDAR_EVOLUCION', base(7, tk2, { KTM_REALIZADA: true, KTM_NIVEL_KTR: '3' }), null);
  si('★ al turno siguiente basta el FSS del EPISODIO («lo evalué, después lo traté»)', r.ok);
  r = api('GUARDAR_EVOLUCION', base(7, hoy() + '-Noche', { KTM_REALIZADA: false, KTM_NIVEL_KTR: '' }), null);
  si('sin KTM realizada la regla no aplica', r.ok);

  console.log('\n2e · La vía aérea no cambia sin evento (o sin motivo escrito)');
  ingresar(8);
  r = api('GUARDAR_EVOLUCION', base(8, hace(2) + '-Dia', {}), null);   // un turno con TOT, para que la auditoría tenga con qué comparar
  si('el turno previo con TOT guarda', r.ok);
  r = api('GUARDAR_EVOLUCION', base(8, tk1, { VENT_VIA_AEREA: 'Natural', VENT_SOPORTE: 'Oxigenoterapia', VENT_MODO: '' }), null);
  si('★ TOT → Natural sin extubación declarada: se RECHAZA', !r.ok && /extubaci/i.test(String(r.error || '')));
  eq('…y la cama sigue con TOT', String(cama(8).VIA_AEREA), 'TOT');
  r = api('GUARDAR_EVOLUCION', base(8, tk1, { VENT_VIA_AEREA: 'Natural', VENT_SOPORTE: 'Oxigenoterapia', VENT_MODO: '', TRANS_MOTIVO: 'llegó extubado desde pabellón, el evento lo registró cirugía' }), null);
  si('★ con motivo escrito: pasa', r.ok);
  eq('…la cama queda con Natural', String(cama(8).VIA_AEREA), 'Natural');
  const hTr = (DB.TIMELINE || []).find(h => String(h.ID_CAMA) === '8' && /sin evento declarado/.test(String(h.TEXTO)));
  si('★ …y queda el hito con el motivo y su detalle', !!hTr && /"evento":"transicion_sin_evento"/.test(String(hTr.DATOS_JSON || '')) && /pabell/.test(String(hTr.DATOS_JSON || '')));
  ingresar(9);
  r = api('GUARDAR_EVOLUCION', base(9, tk1, {
    VENT_VIA_AEREA: 'TOT', VENT_VIA_AEREA_FINAL: 'Natural', VENT_SOPORTE_FINAL: 'Oxigenoterapia',
    PVE_VAL: 'si', PVE_RESULTADO: 'superada', EXT_OCURRIO: true, EXT_HORA: '10:00', EXT_TIPO: 'programada',
    EXT_PE_VA: 'Natural', EXT_PE_SOP: 'Oxigenoterapia',
    PROC_JSON: JSON.stringify(['PVE', 'EXTUBACIÓN C/PROTOCOLO']), PROC_RESUMEN: 'PVE, EXTUBACIÓN C/PROTOCOLO', PROC_CANTIDAD: 2,
  }), null);
  si('con la extubación declarada: pasa', r.ok);
  const hEx = (DB.TIMELINE || []).find(h => String(h.ID_CAMA) === '9' && /Extubaci/.test(String(h.TEXTO)));
  si('★ el hito de la extubación lleva su detalle (hora, tipo, queda con)', !!hEx && /"evento":"extubacion"/.test(String(hEx.DATOS_JSON || '')) && /"hora":"10:00"/.test(String(hEx.DATOS_JSON || '')) && /"quedaVA":"Natural"/.test(String(hEx.DATOS_JSON || '')));
  r = api('GUARDAR_EVOLUCION', base(9, tk1, { VENT_VIA_AEREA: 'TOT', VENT_VIA_AEREA_FINAL: 'Natural', VENT_SOPORTE_FINAL: 'Oxigenoterapia', PVE_VAL: 'si', PVE_RESULTADO: 'superada', EXT_OCURRIO: true, EXT_HORA: '10:00', EXT_TIPO: 'programada', EXT_PE_VA: 'Natural', EXT_PE_SOP: 'Oxigenoterapia', PROC_JSON: JSON.stringify(['PVE', 'EXTUBACIÓN C/PROTOCOLO']), PROC_RESUMEN: 'PVE, EXTUBACIÓN C/PROTOCOLO', PROC_CANTIDAD: 2 }), null);
  eq('re-guardar no duplica el hito de la extubación', (DB.TIMELINE || []).filter(h => String(h.ID_CAMA) === '9' && /Extubaci/.test(String(h.TEXTO))).length, 1);

  console.log('\n2g · Cultivos «ambas»: la toma abre la serie, el resultado se escribe encima, el hito lleva detalle');
  ingresar(10);
  r = api('GUARDAR_EVOLUCION', base(10, tk1, { MUE_REALIZADAS: true, MUE_TIPOS_JSON: JSON.stringify(['CCAET']), MUE_HORA_TOMA: '04:30', MUE_CON_ATB: true,
    RESP_CULT_OBJ: 'PCR jirovecii', PROC_JSON: JSON.stringify(['CULTIVO DE SECRECIONES']), PROC_RESUMEN: 'CULTIVO DE SECRECIONES', PROC_CANTIDAD: 1 }), null);
  si('el turno con la toma guarda', r.ok);
  let cul = (DB.EVALUACIONES || []).filter(e => e.ESCALA === 'CULTIVO' && !e.ANULADA);
  eq('★ la toma abre UNA entrada de la serie', cul.length, 1);
  eq('…pendiente de resultado', String((cul[0] || {}).TOTAL), 'pendiente');
  si('…con hora, tipo, ATB y la firma de quien la tomó', /"hora":"04:30"/.test(String((cul[0] || {}).ITEMS_JSON)) && /CCAET/.test(String((cul[0] || {}).ITEMS_JSON)) && /"conATB":true/.test(String((cul[0] || {}).ITEMS_JSON)) && String((cul[0] || {}).FIRMA) === 'ARM');
  const hCu = (DB.TIMELINE || []).find(h => String(h.ID_CAMA) === '10' && /Cultivo/.test(String(h.TEXTO)));
  si('★ el hito del cultivo lleva su detalle', !!hCu && /"evento":"cultivo"/.test(String(hCu.DATOS_JSON || '')) && /"hora":"04:30"/.test(String(hCu.DATOS_JSON || '')));
  r = api('GUARDAR_EVOLUCION', base(10, tk1, { MUE_REALIZADAS: true, MUE_TIPOS_JSON: JSON.stringify(['CCAET']), MUE_HORA_TOMA: '04:30', MUE_CON_ATB: true,
    RESP_CULT_OBJ: 'PCR jirovecii', PROC_JSON: JSON.stringify(['CULTIVO DE SECRECIONES']), PROC_RESUMEN: 'CULTIVO DE SECRECIONES', PROC_CANTIDAD: 1 }), null);
  eq('re-guardar el mismo turno no duplica la toma', (DB.EVALUACIONES || []).filter(e => e.ESCALA === 'CULTIVO' && !e.ANULADA).length, 1);
  r = api('GUARDAR_EVOLUCION', base(10, tk2, { EX_CULT_RESULTADO: 'Klebsiella pneumoniae', PLAN_FIRMA_KINE: 'MCC' }), null);
  si('el turno siguiente trae el resultado', r.ok);
  cul = (DB.EVALUACIONES || []).filter(e => e.ESCALA === 'CULTIVO' && !e.ANULADA);
  eq('★ el resultado se escribe SOBRE la toma (mismo cultivo, no otro)', cul.length, 1);
  eq('…y la entrada ahora dice el resultado', String((cul[0] || {}).TOTAL), 'Klebsiella pneumoniae');
  si('…con la firma de quien lo anotó, aparte de quien lo tomó', /"resultadoFirma":"MCC"/.test(String((cul[0] || {}).ITEMS_JSON)) && String((cul[0] || {}).FIRMA) === 'ARM');
  r = api('GUARDAR_EVOLUCION', base(10, hoy() + '-Noche', { EX_CULT_RESULTADO: 'Klebsiella pneumoniae', PLAN_FIRMA_KINE: 'DMV' }), null);
  eq('el resultado heredado turno tras turno no abre entradas nuevas', (DB.EVALUACIONES || []).filter(e => e.ESCALA === 'CULTIVO' && !e.ANULADA).length, 1);
  r = api('GET_EVALUACIONES', { idCama: '10' }, null);
  eq('GET_EVALUACIONES la trae como 1ª de su serie', (r.data.serie || []).filter(e => e.escala === 'CULTIVO').map(e => e.n + ':' + e.total).join(','), '1:Klebsiella pneumoniae');

  console.log('\n2f · La auditoría encuentra la huella F (vía aérea cambiada sin evento)');
  try {
    global.ERR = global.ERR || { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE' };
    global.Logger = global.Logger || { log() {} };
    if (typeof global.auditoriaIntegridad !== 'function') {
      eval(fs.readFileSync(path.join(V2, 'mantenimiento.gs'), 'utf8'));   // como via_aerea_previo.js
    }
    // Se planta a mano el caso de la cama 13: dos turnos del mismo episodio,
    // el segundo queda en Natural y ninguna casilla de evento marcada.
    DB.EVOLUCIONES.push({ ID_EVOLUCION: 'CAMA_13_' + hace(2) + '-Dia', ID_CAMA: '13', PATIENT_ID: 'pid-cama13', TURNO_KEY: hace(2) + '-Dia', VENT_VIA_AEREA: 'TOT' });
    DB.EVOLUCIONES.push({ ID_EVOLUCION: 'CAMA_13_' + hace(1) + '-Dia', ID_CAMA: '13', PATIENT_ID: 'pid-cama13', TURNO_KEY: hace(1) + '-Dia', VENT_VIA_AEREA: 'Natural' });
    const au = (typeof auditoriaIntegridad === 'function' ? auditoriaIntegridad : global.auditoriaIntegridad)();
    const F = ((au && au.data) || {}).F_viaAereaSinEvento || [];
    si('★ la huella F encuentra la cama 13', F.some(x => x.cama === '13' && x.de === 'TOT' && x.a === 'Natural' && /extubaci/.test(x.que)));
    si('…y NO acusa la extubación declarada de la cama 9', !F.some(x => x.cama === '9'));
    si('…ni la salida con motivo de la cama 8 (tiene hito, pero sí la lista: cambió sin casilla)', F.some(x => x.cama === '8'));
    si('el informe lo dice en palabras', /F · Vía aérea cambiada SIN evento/.test(String((au.data || {}).mensaje || '')));
  } catch (e) { fails.push('huella F'); console.log('❌ huella F: ' + e.message); }

  console.log('\n3 · Navegador');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.__llamadas = [];
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) {
        window.__llamadas.push({ a: a, d: d });
        const R = { GET_CONFIG_UI: { NUM_CAMAS: 12, BANNERS: {}, EVAL_DIAS_ALERTA: 5 },
                    EPISODIO_ESCALA: { entidad: 'CAMAS_ESTADO' }, EVAL_REGISTRAR: { entidad: 'EVALUACIONES' } };
        setTimeout(() => ok({ ok: true, data: R[a] !== undefined ? R[a] : null }), 5);
      }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(V2, 'index.html'));
  await p.waitForTimeout(800);
  // 🪤 Las fechas del navegador se arman con SU reloj (hoy()), no con el del
  // simulador (fijo en julio): si no, «hace 1 día» son meses y el badge cambia.
  await p.evaluate(() => {
    const hb = n => { const d = new Date(hoy() + 'T12:00:00'); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
    const h2 = hb(2), h1 = hb(1);
    DB = [{ ID_CAMA: '3', OCUPADA: true, PATIENT_ID: 'p3', NOMBRE: 'PACIENTE PRUEBA', EDAD: 60, SEXO: 'M',
            VIA_AEREA: 'TOT', SOPORTE: 'VM', FECHA_INGRESO: h2, FECHA_INICIO_SOPORTE: h2,
            ULT_COOP: 'Cooperador', ULT_MRC: '36', ULT_MRC_FECHA: h1, ULT_MRC_FIRMA: 'MCC',
            ULT_FSS: '', ECF: '', BARTHEL: '80', CHARLSON: '' }];
    window.recargarSilencioso = () => {};
    renderGrid();
  });
  const card = await p.evaluate(() => (document.querySelector('.ep-escalas') || {}).textContent || '');
  si('★ la tarjeta muestra ECF pendiente', /ECF pend\./.test(card));
  si('…Barthel con su valor', /Barthel 80/.test(card));
  si('…Charlson pendiente', /Charlson pend\./.test(card));
  const mrcTxt = await p.evaluate(() => Array.from(document.querySelectorAll('.abadge')).map(e => e.textContent).find(t => /^MRC/.test(t)) || '');
  si('★ el badge del MRC lleva la FIRMA junto a la fecha', /MRC 36 · .* · MCC/.test(mrcTxt));

  console.log('\n3a · Medir la ECF desde la tarjeta, sin abrir la evolución');
  await p.evaluate(() => { window._pedirFirma = () => Promise.resolve('MCC'); });
  await p.evaluate(() => { document.querySelector('.ep-escalas .abadge').click(); });
  await p.waitForTimeout(200);
  si('se abre la calculadora de ECF', await p.evaluate(() => document.getElementById('mEcf').classList.contains('on')));
  await p.evaluate(() => _pickEcf(4));
  await p.waitForTimeout(300);
  const llam = await p.evaluate(() => window.__llamadas.filter(x => x.a === 'EPISODIO_ESCALA'));
  eq('★ viaja EPISODIO_ESCALA a la cama 3 con ECF 4 y la firma', JSON.stringify((llam[0] || {}).d), JSON.stringify({ idCama: '3', escala: 'ECF', valor: '4', items: '', firma: 'MCC' }));
  si('…y el formulario NO se abrió', await p.evaluate(() => !document.getElementById('sp').classList.contains('on')));
  si('…ni se tocó el campo fEcf del formulario', await p.evaluate(() => (document.getElementById('fEcf') || {}).value === ''));

  console.log('\n3b · La fila de eventos y la línea fina');
  await p.evaluate(() => {
    document.getElementById('cBed').value = '3';
    document.getElementById('cIng').value = 'false';
    document.getElementById('fVA').value = 'TOT'; cascadeVA();
    _snapIniEstado();
  });
  si('★ la fila «¿Qué pasó hoy con la vía aérea?» está visible', await p.evaluate(() => !document.getElementById('evVAfila').classList.contains('hidden')));
  si('★ sin evento declarado, el select de vía aérea está bloqueado', await p.evaluate(() => document.getElementById('fVA').disabled === true));
  await p.evaluate(() => setEventoVA('tqt'));
  await p.waitForTimeout(150);
  si('TQT: marca el bloque de traqueostomía', await p.evaluate(() => document.getElementById('cTqtO').checked));
  eq('★ …y fija la vía aérea en TQT', await p.evaluate(() => document.getElementById('fVA').value), 'TQT');
  si('…con evento declarado, el select vuelve a estar libre', await p.evaluate(() => document.getElementById('fVA').disabled === false));
  await p.evaluate(() => setEventoVA('nada'));
  await p.waitForTimeout(150);
  si('Nada: desmarca la TQT', await p.evaluate(() => !document.getElementById('cTqtO').checked));
  eq('★ …y la vía aérea vuelve a la de llegada', await p.evaluate(() => document.getElementById('fVA').value), 'TOT');
  await p.evaluate(() => setEventoVA('ext'));
  await p.waitForTimeout(150);
  eq('Extubación: anuncia y deja Natural (el detalle se completa en la PVE)', await p.evaluate(() => document.getElementById('fVA').value), 'Natural');
  si('…y el hint lo dice', /queda con Natural/.test(await p.evaluate(() => document.getElementById('evVAhint').textContent)));

  console.log('\n3c · «Guardar igual» ya no es un clic: pide el motivo');
  // 🪤 `function guardar()` es propiedad NO configurable de window: se puede
  // pisar por asignación pero `delete` no la devuelve. Se guarda la real aparte.
  await p.evaluate(() => { window.__guardarReal = guardar; window.guardar = () => { window.__guardo = true; }; window.__guardo = false; _transAvisoOk = false; _transMotivo = ''; });
  const avisos = await p.evaluate(() => _avisosTransicion());
  si('la app detecta TOT → Natural sin extubación (como antes)', avisos.some(a => /no hay extubación registrada/.test(a)));
  await p.evaluate(() => _mostrarTransAviso(_avisosTransicion()));
  si('★ aparece el cuadro del motivo', await p.evaluate(() => !document.getElementById('transMotivoBox').classList.contains('hidden')));
  await p.evaluate(() => { document.getElementById('transMotivo').value = ''; transAvisoGuardar(); });
  si('★ sin motivo, NO guarda', await p.evaluate(() => window.__guardo === false && _transAvisoOk === false));
  await p.evaluate(() => { document.getElementById('transMotivo').value = 'llegó extubado desde pabellón'; transAvisoGuardar(); });
  si('★ con motivo, guarda y el motivo viaja', await p.evaluate(() => window.__guardo === true && _transMotivo === 'llegó extubado desde pabellón'));

  console.log('\n3d · SBC exige FSS también en la pantalla');
  await p.evaluate(() => {
    window.__toasts = []; window.toast = (m) => { window.__toasts.push(String(m)); };
    setEventoVA('nada');
    // Lo mínimo que guardar() exige antes de llegar a la regla del SBC: firma
    // vía aérea y la PVE declarada.
    const ff = document.getElementById('fFirma');
    let of = Array.from(ff.options).find(o => o.value);
    if (!of) { of = document.createElement('option'); of.value = 'ARM'; of.textContent = 'ARM'; ff.appendChild(of); }
    ff.value = of.value;
    document.getElementById('fVA').value = 'TOT';
    document.getElementById('fPVEval').value = 'nc';   // la PVE hay que declararla (Sí/No/No corresponde)
    document.getElementById('bKTMr').classList.add('on');
    document.getElementById('fKTMniv').value = '3';
    document.getElementById('fFSS').value = '';
  });
  // Se llama a guardar() REAL; debe cortar en la regla del SBC antes de armar el payload.
  await p.evaluate(() => { window.guardar = window.__guardarReal; });
  await p.evaluate(() => { try { guardar(); } catch (e) { window.__guardarErr = String(e); } });
  await p.waitForTimeout(200);
  const toastsSBC = await p.evaluate(() => window.__toasts.join(' | '));
  si('★ guardar() se detiene con el mensaje del SBC', toastsSBC.indexOf('SBC') !== -1);
  if (toastsSBC.indexOf('SBC') === -1) console.log('   toasts: ' + toastsSBC + (await p.evaluate(() => window.__guardarErr ? ' · error: ' + window.__guardarErr : '')));
  si('…y no salió ningún GUARDAR_EVOLUCION', await p.evaluate(() => !window.__llamadas.some(x => x.a === 'GUARDAR_EVOLUCION')));

  console.log('\n3e · El banner del episodio');
  await p.evaluate(() => renderBannerEpisodio());
  const ban = await p.evaluate(() => (document.getElementById('epBanner') || {}).textContent || '');
  si('★ el banner se pinta con el nombre y los chips', /PACIENTE PRUEBA/.test(ban) && /ECF pend\./.test(ban) && /Barthel 80/.test(ban));
  si('…y el día de estadía', /Día 2/.test(ban));

  eq('sin errores de JavaScript', errs.join(' | '), '');
  await b.close();
  console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS' : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
