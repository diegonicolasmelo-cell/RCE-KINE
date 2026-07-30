/**
 * sim_e2e.js — Simulación ingreso→egreso con el CLIENTE REAL (index.html en
 * Chromium) conectado al SERVIDOR REAL (.gs en Node vía sim_srv.js).
 * 8 pacientes de perfiles distintos, día y noche, generando los textos reales
 * y registrando toasts, avisos de transición y estado de las hojas.
 * Salida: build/sim/sim_out.json (crudo) + resumen por consola.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'));
const S = require('./sim_srv.js');

// Compilar la plantilla como lo hace GAS (scriptlet → '')
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'v2', 'index.html'), 'utf8');
fs.writeFileSync(path.join(__dirname, 'sim_compilado.html'), src.replace(/<\?=[\s\S]*?\?>/g, ''));

const LOG = { turnos: [], egresos: [], eventos: [], errores: [], notas: [] };
const nota = (tag, msg) => { LOG.notas.push({ tag, msg }); console.log('  📝 ' + tag + ': ' + msg); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  p.on('pageerror', e => { LOG.errores.push('PAGEERROR: ' + e.message); console.log('❌ PAGEERROR', e.message); });
  p.on('console', m => { if (m.type() === 'error') LOG.errores.push('CONSOLE: ' + m.text()); });

  // Puente REAL: google.script.run → api() de Node (sim_srv)
  await p.exposeFunction('__gasApi', (a, d, t) => {
    let r;
    try { r = S.api(a, d, t); } catch (e) { r = { ok: false, error: 'EXCEPCIÓN: ' + e.message }; }
    return JSON.stringify(r);
  });
  await p.addInitScript(() => {
    window._apiLog = [];
    window._toasts = [];
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler(failF) { return {
      async api(a, d, t) {
        const r = JSON.parse(await window.__gasApi(a, d || {}, t || null));
        window._apiLog.push({ a, ok: r.ok, err: r.ok ? '' : r.error });
        if (r.ok) okF(r); else failF(r.error || 'error');
      }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(__dirname, 'sim_compilado.html'));
  await p.waitForTimeout(900);

  // Instrumentación post-boot: toasts, confirmaciones automáticas, firma en roster
  await p.evaluate(() => {
    const _t = window.toast; window.toast = m => { window._toasts.push(String(m)); try { _t(m); } catch (e) {} };
    window.uiConfirm = () => Promise.resolve(true);
    ['fFirma', 'egFirma'].forEach(id => {
      const sel = document.getElementById(id); if (!sel) return;
      ['DMV', 'MFB', 'CSR'].forEach(f => {
        if (![...sel.options].some(o => o.value === f)) {
          const o = document.createElement('option'); o.value = f; o.textContent = f; sel.appendChild(o);
        }
      });
    });
  });

  const boot = await p.evaluate(() => ({ grilla: document.querySelectorAll('#bedGrid .bcard').length, camas: DB.length }));
  console.log('ARRANQUE: grilla=' + boot.grilla + ' camas=' + boot.camas);
  if (!boot.grilla) { console.log('❌ sin grilla — abortando'); process.exit(1); }

  /* ── Driver de un turno ──
     campos: [ [id, valor] ... ] en orden (se despacha change tras cada uno)
     checks: [ [id, true/false] ... ]   radios: [ [name, value] ... ]
     js: código a evaluar tras llenar (para chips/funciones propias)        */
  async function turno(o) {
    S.SIM.fecha = o.fecha; S.SIM.hora = o.t === 'Noche' ? '23:00:00' : '11:00:00';
    const r = await p.evaluate(async (o) => {
      window._toasts.length = 0;
      SHIFT = o.t; $('gDate').value = o.fecha;
      // como la app real: el censo se recarga antes de abrir el panel
      await new Promise(r2 => { gs('GET_TODAS_CAMAS', {}, c => { DB = c || []; r2(); }, () => r2()); });
      abrirPanel(String(o.cama), !!o.ingreso);
      await new Promise(r2 => setTimeout(r2, 350));
      const aplicar = (id, val) => {
        const el = $(id); if (!el) { window._toasts.push('SIM⚠ no existe #' + id); return; }
        if (el.type === 'checkbox') { if (el.checked !== !!val) el.click(); return; }
        el.value = String(val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      };
      (o.campos || []).forEach(([id, val]) => aplicar(id, val));
      (o.checks || []).forEach(([id, val]) => aplicar(id, val));
      (o.radios || []).forEach(([name, val]) => {
        const el = document.querySelector(`input[name="${name}"][value="${val}"]`);
        if (el) el.click(); else window._toasts.push('SIM⚠ no existe radio ' + name + '=' + val);
      });
      if (o.js) { try { (0, eval)(o.js); } catch (e) { window._toasts.push('SIM⚠ js: ' + e.message); } }
      await new Promise(r2 => setTimeout(r2, 120));
      const antes = _apiLog.filter(x => x.a === 'GUARDAR_EVOLUCION').length;
      guardar();
      await new Promise(r2 => setTimeout(r2, 350));
      // Aviso de transición no bloqueante → registrar y guardar igual
      let avisos = '';
      const modal = $('transAviso');
      if (modal && modal.classList.contains('on')) {
        avisos = $('transAvisoLista') ? $('transAvisoLista').innerText : '(aviso)';
        transAvisoGuardar();
        await new Promise(r2 => setTimeout(r2, 350));
      }
      const despues = _apiLog.filter(x => x.a === 'GUARDAR_EVOLUCION');
      const guardo = despues.length > antes;
      const ultimo = despues[despues.length - 1] || null;
      // cerrar el panel para el siguiente turno
      if (typeof cerrarPanel === 'function') { try { cerrarPanel(true); } catch (e) {} }
      $('sp').classList.remove('on'); $('ovl').classList.remove('on');
      return { guardo, resp: ultimo, toasts: window._toasts.slice(), avisos };
    }, o);
    // Texto real generado (lo que quedó en la hoja)
    const tk = o.fecha + '-' + o.t;
    const evo = S.api('GET_EVOLUCION', { idCama: String(o.cama), turnoKey: tk }, null);
    const texto = (evo.ok && evo.data) ? String(evo.data.TEXTO_GENERADO || '') : '(SIN EVOLUCIÓN GUARDADA)';
    const cama = S.DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === String(o.cama));
    LOG.turnos.push({
      pac: o.pac, cama: o.cama, tk, ingreso: !!o.ingreso, guardo: r.guardo,
      toasts: r.toasts, avisos: r.avisos, texto,
      camaSnap: cama ? { VA: cama.VIA_AEREA, SOP: cama.SOPORTE, MODO: cama.MODO, FASE: cama.FASE_JSON,
        F_VA: cama.FECHA_INICIO_VA, F_SOP: cama.FECHA_INICIO_SOPORTE, APACHE2: cama.APACHE2 } : null,
    });
    const flag = r.guardo ? '✅' : '❌';
    console.log(`${flag} [${o.pac}] cama ${o.cama} ${tk}${o.ingreso ? ' INGRESO' : ''}` +
      (r.avisos ? ' · avisos⚠' : '') + (r.toasts.some(t => t.startsWith('SIM⚠')) ? ' · SIM⚠' : ''));
    if (!r.guardo) console.log('   toasts:', r.toasts.join(' | '));
    return r;
  }

  async function egresar(o) {
    S.SIM.fecha = o.fecha; S.SIM.hora = '12:00:00';
    const r = await p.evaluate(async (o) => {
      window._toasts.length = 0;
      SHIFT = 'Dia'; $('gDate').value = o.fecha;
      // el cliente exige DB fresco
      await new Promise(r2 => { gs('GET_TODAS_CAMAS', {}, c => { DB = c || []; r2(); }, () => r2()); });
      egreso(String(o.cama));
      await new Promise(r2 => setTimeout(r2, 120));
      if (o.destino) { $('egDestino').value = o.destino; egDestinoChange(); }
      if (o.destinoOtro) { $('egDestino').value = 'Otro'; egDestinoChange(); $('egOtroVal').value = o.destinoOtro; }
      $('egFirma').value = o.firma || 'DMV';
      if (o.barthel !== undefined) $('egBarthel').value = String(o.barthel);
      if (o.apache !== undefined) $('egApache').value = String(o.apache);
      if (o.obs) $('egObs').value = o.obs;
      const apacheUI = { pide: !$('egApacheBox').classList.contains('hidden'), informa: !$('egApacheInfo').classList.contains('hidden') };
      const antes = _apiLog.filter(x => x.a === 'DAR_ALTA').length;
      confirmarEgreso();
      await new Promise(r2 => setTimeout(r2, 500));
      const despues = _apiLog.filter(x => x.a === 'DAR_ALTA');
      return { egreso: despues.length > antes, ultimo: despues[despues.length - 1] || null, toasts: window._toasts.slice(), apacheUI };
    }, o);
    const arch = S.DB.ARCHIVO_PACIENTES[S.DB.ARCHIVO_PACIENTES.length - 1];
    LOG.egresos.push({ pac: o.pac, cama: o.cama, fecha: o.fecha, ok: r.egreso, toasts: r.toasts, apacheUI: r.apacheUI,
      archivo: arch ? { MOTIVO: arch.MOTIVO_EGRESO, DESTINO: arch.DESTINO_EGRESO, DIAS: arch.DIAS_TOTAL,
        DIAS_VM: arch.DIAS_VM_TOTAL, DIAS_VA: arch.DIAS_VA_TOTAL, APACHE2: arch.APACHE2, EXTUB_OK: arch.EXTUBACION_OK, REINTUB: arch.REINTUBACION,
        MRC: arch.MRC_SS_EGRESO, DAUCI: arch.DAUCI, FASE_FINAL: arch.FASE_FINAL } : null });
    console.log((r.egreso ? '✅' : '❌') + ` [${o.pac}] EGRESO cama ${o.cama} → ${o.destino || o.destinoOtro}` +
      (r.egreso ? '' : ' · ' + r.toasts.join(' | ')));
    return r;
  }

  // Evento rápido ➕ y otras acciones directas contra el servidor real
  function evento(pac, accion, datos) {
    const r = S.api(accion, datos, null);
    LOG.eventos.push({ pac, accion, ok: r.ok, err: r.ok ? '' : r.error, data: r.ok ? r.data : null });
    console.log((r.ok ? '✅' : '❌') + ` [${pac}] ${accion}` + (r.ok ? '' : ' · ' + r.error));
    return r;
  }

  /* ════ ESCENARIOS ════ */
  const F = 'DMV';
  const base = [['fFirma', F]];
  const vmDia = (vt, fio2, peep, spo2) => [
    ['fVA', 'TOT'], ['fSop', 'VM'], ['fModo', 'ACVC'],
    ['r_vt', vt], ['r_fr', 18], ['r_peep', peep], ['r_fio2', fio2], ['r_spo2', spo2], ['r_pmax', 24],
  ];

  /* ── P1 · Séptico: IOT al ingreso → weaning clásico → extubación protocolo → egreso ── */
  console.log('\n── P1 · Shock séptico, IOT desde el ingreso ──');
  await turno({ pac: 'P1', cama: 1, fecha: '2026-07-01', t: 'Dia', ingreso: true, campos: [
    ...base, ['fNombre', 'Pedro Rojas Díaz'], ['fEdad', 58], ['fSexo', 'M'], ['fTalla', 172],
    ['fRut', '7.111.111-1'], ['fDx', 'Shock séptico foco pulmonar'], ['fRem', 'Otras respiratorias'],
    ['fIngTipo', 'Urgencia'], ['fApache', 24], ['fBarthel', 100], ['fEcf', 2], ['fCharlson', 3],
    ...vmDia(420, 60, 10, 94), ['fTOTn', '8.0'], ['fTOTcm', 22],
    ['fSed', 'Sedación profunda'], ['fSAS', 2], ['fGCSO', 1], ['fGCSV', 1], ['fGCSM', 4],
    ['fHEst', 'Inestable'], ['fDVA', 'NA dosis moderadas'],
    ['fCuffEst', 'rango'],
  ], js: `toggleFase('Reanimación inicial')` });
  await turno({ pac: 'P1', cama: 1, fecha: '2026-07-01', t: 'Noche', campos: [
    ...base, ['fCuffEst', 'ajuste'], ['fCuffVal', 26], ['fKTRcnt', 2],
  ] });
  S.SIM.fecha = '2026-07-03';
  await turno({ pac: 'P1', cama: 1, fecha: '2026-07-03', t: 'Dia', campos: [
    ...base, ['fVA', 'TOT'], ['fSop', 'VM'], ['fModo', 'CPAP/PS'], ['r_ps', 10], ['r_peep', 6], ['r_fio2', 40], ['r_spo2', 96],
    ['fSed', 'Sin sedación'], ['fSAS', 4], ['fCoop', 'Cooperador'], ['fS5Q', 5],
    ['fHEst', 'Estable'], ['fDVA', 'Sin requerimientos'], ['fCuffEst', 'rango'], ['fKTRcnt', 2],
    ['fPVEval', 'si'],
  ], radios: [['pveRes', 'frustra']], checks: [['cKTMr', true]],
    js: `toggleFase('Weaning'); document.querySelectorAll('input[name="pveFrMot"]')[0]?.click()` });
  await turno({ pac: 'P1', cama: 1, fecha: '2026-07-05', t: 'Dia', campos: [
    ...base, ['fVA', 'TOT'], ['fSop', 'VM'], ['fModo', 'CPAP/PS'], ['r_ps', 8], ['r_peep', 5], ['r_fio2', 30], ['r_spo2', 97],
    ['fSed', 'Sin sedación'], ['fSAS', 4], ['fCoop', 'Cooperador'], ['fCuffEst', 'rango'],
    ['fPVEval', 'si'],
  ], radios: [['pveRes', 'superada']], js: `
    $('fExtHora').value='11:30'; $('fExtHora').dispatchEvent(new Event('change'));
    $('peModo').value='CNAF'; $('peModo').dispatchEvent(new Event('change'));
  ` });
  await turno({ pac: 'P1', cama: 1, fecha: '2026-07-06', t: 'Dia', campos: [
    ...base, ['fVA', 'Natural'], ['fSop', 'Oxigenoterapia/OAF'], ['fModo', 'CNAF'],
    ['r_fio2', 30], ['r_spo2', 96], ['fKTRcnt', 1], ['fMRC', 52], ['fFSS', 28], ['fIMS', 7],
  ], checks: [['cKTMr', true]], js: `toggleFase('Rehabilitación')` });
  await egresar({ pac: 'P1', cama: 1, fecha: '2026-07-07', destino: 'Medicina', barthel: 70 });

  /* ── P2 · Natural→IOT mismo turno; autoextubación nocturna; TQT; egresa con TQT ── */
  console.log('\n── P2 · IOT el mismo turno del ingreso, autoextubación, TQT ──');
  await turno({ pac: 'P2', cama: 2, fecha: '2026-07-02', t: 'Dia', ingreso: true, campos: [
    ...base, ['fNombre', 'María Vega Luna'], ['fEdad', 47], ['fSexo', 'F'], ['fTalla', 158],
    ['fRut', '9.222.222-2'], ['fDx', 'Insuficiencia respiratoria aguda por NAC'], ['fRem', 'Otras respiratorias'],
    ['fIngTipo', 'Urgencia'], ['fApache', 19],
    ['fVA', 'Natural'], ['fSop', 'Oxigenoterapia/OAF'], ['fModo', 'Mascarilla de recirculación'],
  ], checks: [['cIntubO', true]], js: `
    $('fIntubHora').value='13:40';
    $('fIntubSopPrevio').value='Ambiente'; $('fIntubSopPrevio').dispatchEvent(new Event('change'));
    $('fVA').value='TOT'; $('fVA').dispatchEvent(new Event('change'));
    $('fSop').value='VM'; $('fSop').dispatchEvent(new Event('change'));
    $('fModo').value='ACVC'; $('fModo').dispatchEvent(new Event('change'));
    $('r_vt').value='380'; $('r_fio2').value='50'; $('r_peep').value='8'; $('r_spo2').value='95';
  ` });
  await turno({ pac: 'P2', cama: 2, fecha: '2026-07-04', t: 'Noche', campos: [
    ...base, ['fVA', 'TOT'], ['fSop', 'VM'], ['fModo', 'CPAP/PS'], ['r_ps', 12], ['r_peep', 6], ['r_fio2', 40], ['r_spo2', 95],
    ['fSed', 'Sedación superficial'], ['fSAS', 5], ['fPVEval', 'no'], ['fCuffEst', 'rango'],
  ], js: `
    $('fPveSCraz').value='Sedación profunda / BNM';
    $('cExtSinPve').click();
    document.querySelector('input[name="extTipo"][value="autoextubacion"]').click();
    $('fExtHoraNo').value='03:20'; $('cReintubNo')?.click();
    setTimeout(()=>{ const h=$('fReintubHoraN2'); if(h) h.value='03:50'; },50);
  ` });
  await turno({ pac: 'P2', cama: 2, fecha: '2026-07-10', t: 'Dia', campos: [
    ...base, ['fVA', 'TOT'], ['fSop', 'VM'], ['fModo', 'CPAP/PS'], ['r_ps', 10], ['r_peep', 6], ['r_fio2', 35], ['r_spo2', 96],
    ['fCuffEst', 'rango'],
  ], checks: [['cTqtO', true]], js: `
    $('fTqtHora').value='10:30'; $('fTqtTec').value='Percutánea';
    $('fVA').value='TQT'; $('fVA').dispatchEvent(new Event('change'));
    $('fTQTn').value='8'; $('fTQTt').value='Con balón';
  ` });
  await turno({ pac: 'P2', cama: 2, fecha: '2026-07-12', t: 'Dia', campos: [
    ...base, ['fVA', 'TQT'], ['fSop', 'Oxigenoterapia/OAF'], ['fModo', 'Tubo T'],
    ['r_fio2', 28], ['r_spo2', 96], ['fCuffEst', 'desinflado'], ['fPVA', 8], ['fKTRcnt', 2], ['fMRC', 44],
  ], checks: [['cKTMr', true]] });
  await egresar({ pac: 'P2', cama: 2, fecha: '2026-07-13', destino: 'UTI', barthel: 40 });

  /* ── P3 · EPOC: VNI que fracasa → IOT → fallece ── */
  console.log('\n── P3 · VNI fracasa → IOT → fallecimiento ──');
  await turno({ pac: 'P3', cama: 3, fecha: '2026-07-03', t: 'Dia', ingreso: true, campos: [
    ...base, ['fNombre', 'Luis Carvajal Pinto'], ['fEdad', 71], ['fSexo', 'M'], ['fTalla', 165],
    ['fRut', '5.333.333-3'], ['fDx', 'EPOC exacerbado, acidosis respiratoria'], ['fRem', 'Otras respiratorias'],
    ['fIngTipo', 'Urgencia'],  // sin APACHE a propósito (probar el fallback del egreso)
    ['fVA', 'Full Face'], ['fSop', 'VNI'], ['fModo', 'S/T'],
    ['r_ipap', 16], ['r_epap', 6], ['r_fio2', 40], ['r_spo2', 90],
  ] });
  await turno({ pac: 'P3', cama: 3, fecha: '2026-07-04', t: 'Noche', campos: [
    ...base,
  ], checks: [['cIntubO', true]], js: `
    $('fIntubHora').value='02:10';
    $('fIntubSopPrevio').value='VNI'; $('fIntubSopPrevio').dispatchEvent(new Event('change'));
    $('fVA').value='TOT'; $('fVA').dispatchEvent(new Event('change'));
    $('fSop').value='VM'; $('fSop').dispatchEvent(new Event('change'));
    $('fModo').value='ACVC'; $('fModo').dispatchEvent(new Event('change'));
    $('r_vt').value='400'; $('r_fio2').value='60'; $('r_peep').value='8'; $('r_spo2').value='91';
    $('fSed').value='Sedación profunda'; $('fSAS').value='1';
  ` });
  await turno({ pac: 'P3', cama: 3, fecha: '2026-07-06', t: 'Dia', campos: [
    ...base, ['fVA', 'TOT'], ['fSop', 'VM'], ['fModo', 'ACVC'], ['r_vt', 400], ['r_fio2', 80], ['r_peep', 12], ['r_spo2', 86],
    ['fSed', 'Sedación profunda'], ['fSAS', 1], ['fHEst', 'Inestable'], ['fDVA', 'NA dosis altas'], ['fCuffEst', 'rango'],
  ], checks: [['cBNM', true], ['cProno', true]], js: `$('fPronoHora')&&($('fPronoHora').value='10:00')` });
  await egresar({ pac: 'P3', cama: 3, fecha: '2026-07-06', destino: 'Anatomía patológica', apache: 31 });

  /* ── P4 · Llega traqueostomizado de otro centro → decanulación → domicilio ── */
  console.log('\n── P4 · TQT externa, weaning de cánula, decanulación ──');
  await turno({ pac: 'P4', cama: 4, fecha: '2026-07-05', t: 'Dia', ingreso: true, campos: [
    ...base, ['fNombre', 'Rosa Milla Paz'], ['fEdad', 63], ['fSexo', 'F'], ['fTalla', 160],
    ['fRut', '6.444.444-4'], ['fDx', 'Polineuropatía del paciente crítico, TQT prolongada'], ['fRem', 'ENM agudas'],
    ['fIngTipo', 'Electivo'], ['fApache', 12],
    ['fVA', 'TQT'], ['fSop', 'VM'], ['fModo', 'CPAP/PS'], ['r_ps', 8], ['r_peep', 5], ['r_fio2', 30], ['r_spo2', 97],
    ['fCoop', 'Cooperador'], ['fCuffEst', 'rango'],
  ], checks: [['cVAExtPrev', true]], js: `$('fVAExtDias').value='21'; $('fVAExtDias').dispatchEvent(new Event('change'))` });
  // Desvinculación de VM con reconexión (weaning de cánula) + GSA del turno
  await turno({ pac: 'P4', cama: 4, fecha: '2026-07-06', t: 'Dia', campos: [
    ...base, ['fVA', 'TQT'], ['fSop', 'VM'], ['fModo', 'CPAP/PS'], ['r_ps', 8], ['r_peep', 5],
    ['r_fio2', 28], ['r_spo2', 97], ['fCuffEst', 'rango'], ['fKTRcnt', 2],
  ], checks: [['cDesvinc', true]], js: `
    $('fDesvincHora').value='09:00'; $('fDesvincA').value='Tubo T';
    $('fDesvincMotivo').value='Entrenamiento de weaning programado';
    $('cDesvincRecon').click(); $('fDesvincHoraRecon').value='15:30'; calcDesvinc();
    $('fDesvincDet').value='Buena tolerancia, sin taquipnea';
    $('cGSA').click(); $('fGsaHora').value='14:00'; $('fGsaPh').value='7.41';
    $('fGsaPao2').value='92'; $('fGsaPaco2').value='42'; $('fGsaHco3').value='25';
    $('fGsaFio2').value='28'; interpGSA();
  ` });
  // Válvula de fonación: modo ventilatorio + uso como intervención de rehabilitación
  await turno({ pac: 'P4', cama: 4, fecha: '2026-07-07', t: 'Dia', campos: [
    ...base, ['fVA', 'TQT'], ['fSop', 'Oxigenoterapia/OAF'], ['fModo', 'Válvula de fonación'],
    ['r_fio2', 26], ['r_spo2', 96], ['fCuffEst', 'desinflado'], ['fPVA', 12],
    ['fMRC', 40], ['fFSS', 22], ['fKTRcnt', 1],
  ], checks: [['cKTMr', true], ['cIMT', true], ['cVfon', true]], js: `
    $('fIMTfreq').value='2x30'; $('fKTMniv').value='3';
    $('fVfonMin').value='45'; $('fVfonTol').value='Buena';
    $('fVfonDet').value='Fonación audible, sin desaturación';
  ` });
  await turno({ pac: 'P4', cama: 4, fecha: '2026-07-09', t: 'Dia', campos: [
    ...base, ['fVA', 'TQT'], ['fSop', 'Oxigenoterapia/OAF'], ['fModo', 'Válvula de fonación'],
    ['r_fio2', 26], ['r_spo2', 97], ['fCuffEst', 'desinflado'], ['fPVA', 9],
  ], checks: [['cDecanOcurrio', true]], js: `
    $('fDecanHora').value='11:00';
    document.querySelector('input[name="decanTipo"][value="programada"]')?.click();
    $('fDecanQueda').value='Naricera-NRC'; $('fDecanQueda').dispatchEvent(new Event('change'));
    $('fDecanFlujo').value='2'; $('fDecanSpo2').value='95';
  ` });
  await egresar({ pac: 'P4', cama: 4, fecha: '2026-07-11', destino: 'Domicilio', barthel: 45 });

  /* ── P5 · Sin soporte: O2 bajo flujo, KTR/KTM, egreso rápido ── */
  console.log('\n── P5 · Paciente respiratorio simple, sin VM ──');
  await turno({ pac: 'P5', cama: 5, fecha: '2026-07-08', t: 'Dia', ingreso: true, campos: [
    ...base, ['fNombre', 'Jorge Soto Vidal'], ['fEdad', 35], ['fSexo', 'M'], ['fTalla', 178],
    ['fRut', '10.555.555-5'], ['fDx', 'Contusión pulmonar por accidente de tránsito'], ['fRem', 'Politraumatizado'],
    ['fIngTipo', 'Urgencia'], ['fApache', 8], ['fBarthel', 100],
    ['fVA', 'Natural'], ['fSop', 'Oxigenoterapia/OAF'], ['fModo', 'Naricera-NRC'],
    ['r_litros', 3], ['r_spo2', 95], ['fKTRcnt', 2], ['fCoop', 'Cooperador'], ['fIMS', 8],
  ], checks: [['cSOF', true], ['cATos', true]] });
  await turno({ pac: 'P5', cama: 5, fecha: '2026-07-08', t: 'Noche', campos: [
    ...base, ['fKTRcnt', 1],
  ] });
  await turno({ pac: 'P5', cama: 5, fecha: '2026-07-09', t: 'Dia', campos: [
    ...base, ['fVA', 'Natural'], ['fSop', 'Ambiente'], ['r_spo2', 96], ['fKTRcnt', 1],
    ['fMRC', 58], ['fIMS', 10],
  ], checks: [['cKTMr', true]], js: `$('fKTMniv').value='5'` });
  await egresar({ pac: 'P5', cama: 5, fecha: '2026-07-09', destino: 'Traumatología', barthel: 90 });

  /* ── P6 · Post-op electivo: extubación <24 h VM («sin condiciones») ── */
  console.log('\n── P6 · Post-operado, extubación precoz sin condiciones de PVE ──');
  await turno({ pac: 'P6', cama: 6, fecha: '2026-07-10', t: 'Dia', ingreso: true, campos: [
    ...base, ['fNombre', 'Elena Ruiz Bravo'], ['fEdad', 52], ['fSexo', 'F'], ['fTalla', 162],
    ['fRut', '8.666.666-6'], ['fDx', 'Postoperatorio laparotomía electiva'], ['fRem', 'Quirúrgicas'],
    ['fIngTipo', 'Electivo'], ['fApache', 10],
    ...vmDia(400, 40, 5, 98), ['fSed', 'Sedación superficial'], ['fSAS', 3], ['fCuffEst', 'rango'],
  ], js: `toggleFase('Postoperatorio inmediato')` });
  await turno({ pac: 'P6', cama: 6, fecha: '2026-07-10', t: 'Noche', campos: [
    ...base, ['fPVEval', 'no'], ['fCuffEst', 'rango'],
  ], js: `
    $('fPveSCraz').value='Menos de 24 h de VM';
    $('cExtSinPve').click();
    document.querySelector('input[name="extTipo"][value="sin_protocolo"]').click();
    const h=$('fExtHoraNo'); if(h) h.value='22:30';
    $('fExtMotivoCat').value='≤ 24 h de VM'; $('fExtMotivoCat').dispatchEvent(new Event('change'));
    $('peModoNo').value='Naricera-NRC'; $('peModoNo').dispatchEvent(new Event('change'));
  ` });
  await egresar({ pac: 'P6', cama: 6, fecha: '2026-07-11', destino: 'Cirugía' });

  /* ── P7 · Traslado de cama a mitad de estadía + reingreso posterior (mismo RUT) ── */
  console.log('\n── P7 · Traslado de cama y reingreso por RUT ──');
  await turno({ pac: 'P7', cama: 7, fecha: '2026-07-12', t: 'Dia', ingreso: true, campos: [
    ...base, ['fNombre', 'Ana Prado Soto'], ['fEdad', 68], ['fSexo', 'F'], ['fTalla', 155],
    ['fRut', '4.777.777-7'], ['fDx', 'ACV isquémico extenso'], ['fRem', 'ACV'],
    ['fIngTipo', 'Urgencia'], ['fApache', 22], ...vmDia(360, 45, 8, 96),
    ['fSed', 'Sedación moderada'], ['fSAS', 3], ['fCuffEst', 'rango'],
  ], js: `toggleFase('Neuroprotección')` });
  evento('P7', 'MOVER_A_CAMA_VACIA', { idOrigen: '7', idDestino: '12' });
  await turno({ pac: 'P7', cama: 12, fecha: '2026-07-13', t: 'Dia', campos: [
    ...base, ['fCuffEst', 'rango'], ['fKTRcnt', 1],
  ] });
  await egresar({ pac: 'P7', cama: 12, fecha: '2026-07-14', destino: 'UTI' });
  // Reingreso 3 días después, mismo RUT → debe avisar reingreso
  const rutPrev = evento('P7', 'GET_RUT_PREVIO', { rut: '4.777.777-7' });
  await turno({ pac: 'P7b', cama: 7, fecha: '2026-07-17', t: 'Dia', ingreso: true, campos: [
    ...base, ['fNombre', 'Ana Prado Soto'], ['fEdad', 68], ['fSexo', 'F'],
    ['fRut', '4.777.777-7'], ['fDx', 'Reingreso: neumonía aspirativa'], ['fRem', 'Otras respiratorias'],
    ['fIngTipo', 'Urgencia'], ['fVA', 'Natural'], ['fSop', 'Oxigenoterapia/OAF'], ['fModo', 'CNAF'],
    ['r_flujo', 40], ['r_fio2', 45], ['r_spo2', 93],
  ], checks: [['cReing', true]] });
  await egresar({ pac: 'P7b', cama: 7, fecha: '2026-07-19', destino: 'Medicina' });

  /* ── P8 · Aislamiento + cultivos + eventos ➕ + ventilador con falla ── */
  console.log('\n── P8 · Aislamiento, eventos posteriores, ventilador asignado con falla ──');
  evento('P8', 'MOVER_VENTILADOR', { idVm: 'vm1', tipo: 'CAMA', detalle: '8', firmaKine: F });
  await turno({ pac: 'P8', cama: 8, fecha: '2026-07-15', t: 'Dia', ingreso: true, campos: [
    ...base, ['fNombre', 'Iván Leiva Cruz'], ['fEdad', 44], ['fSexo', 'M'], ['fTalla', 180],
    ['fRut', '11.888.888-8'], ['fDx', 'SDRA por influenza'], ['fRem', 'Otras respiratorias'],
    ['fIngTipo', 'Urgencia'], ['fApache', 28], ...vmDia(440, 70, 12, 90),
    ['fSed', 'Sedación profunda'], ['fSAS', 1], ['fCuffEst', 'rango'],
    ['fSecrReol', 'Fluidas'], ['fSecrCar', 'Mucopurulentas'], ['fSecrQty', 'Moderadas'],
  ], checks: [['cAisl', true], ['cBNM', true]], js: `
    _aislTags=['Influenza A']; renderAislTags();
  ` });
  // Eventos ➕ DESPUÉS de evolucionar (servicio real)
  evento('P8', 'ANEXAR_EVENTO', { idCama: '8', turnoKey: '2026-07-15-Dia', tipo: 'procedimiento', proc: 'FIBROBRONCOSCOPÍA', hora: '16:30', firma: 'MFB' });
  evento('P8', 'ANEXAR_EVENTO', { idCama: '8', turnoKey: '2026-07-15-Dia', tipo: 'hme', hora: '17:00', firma: 'MFB' });
  evento('P8', 'ANEXAR_EVENTO', { idCama: '8', turnoKey: '2026-07-15-Dia', tipo: 'cultivo', cultTipo: 'Aspirado traqueal', cultHallazgo: 'Influenza A (+)', hora: '18:00', firma: 'CSR' });
  evento('P8', 'REGISTRAR_FALLA_VM', { idVm: 'vm1', descripcion: 'Alarma de presión alta persistente en ACVC', firmaKine: F });
  await turno({ pac: 'P8', cama: 8, fecha: '2026-07-15', t: 'Noche', campos: [
    ...base, ['fCuffEst', 'rango'], ['fKTRcnt', 1],
  ], js: `
    hPVEtoggle('no'); $('fPveSCraz').value='Sedación profunda / BNM';
    $('fPveSCdet').value='En BNM por SDRA severo';
  ` });

  /* ════ CIERRE: estadísticas, indicadores, auditoría, pivot, hoja UCI ════ */
  console.log('\n── Lecturas de cierre (servicios reales) ──');
  S.SIM.fecha = '2026-07-20';
  const IND = S.api('GET_INDICADORES', { desde: '2026-07-01', hasta: '2026-07-20' }, null);
  const STATS = S.api('GET_STATS', { desde: '2026-07-01', hasta: '2026-07-20' }, null);
  const AUD = S.api('GET_AUDITORIA', {}, null);
  const PIV = S.api('GET_PIVOT', { desde: '2026-07-01', hasta: '2026-07-20' }, null);
  const ARCH = S.api('GET_ARCHIVADOS', {}, null);
  LOG.cierre = {
    indicadores: IND.ok ? IND.data : IND.error,
    stats: STATS.ok ? { rem28: STATS.data && STATS.data.rem28 ? 'ok' : 'sin rem28', keys: Object.keys(STATS.data || {}) } : STATS.error,
    auditoria: AUD.ok ? AUD.data : AUD.error,
    pivotFilas: PIV.ok ? PIV.data.filas.length : PIV.error,
    pivotSinIdentidad: PIV.ok ? !JSON.stringify(PIV.data).match(/Rojas|Vega|Carvajal|777-7|888-8/) : null,
    archivados: ARCH.ok ? (ARCH.data.length || (ARCH.data.filas || []).length) : ARCH.error,
  };
  console.log('INDICADORES:', IND.ok ? 'ok' : IND.error);
  console.log('AUDITORÍA:', AUD.ok ? 'ok' : AUD.error);
  console.log('PIVOT filas:', LOG.cierre.pivotFilas, '· sin identidad:', LOG.cierre.pivotSinIdentidad);

  // Historial + Hoja UCI del P1 en el CLIENTE real (episodio archivado)
  const HOJA = await p.evaluate(async () => {
    await new Promise(r2 => { gs('GET_TODAS_CAMAS', {}, c => { DB = c || []; r2(); }, () => r2()); });
    const arch = await new Promise(r2 => gs('GET_ARCHIVADOS', {}, d => r2(d), () => r2(null)));
    return { archivados: arch ? (arch.length || (arch.filas || []).length || 0) : -1 };
  });
  LOG.cierre.clienteArchivados = HOJA.archivados;

  fs.writeFileSync(path.join(__dirname, 'sim_out.json'), JSON.stringify(LOG, null, 2));
  const errsReales = LOG.errores.filter(e => !/favicon/i.test(e));
  console.log('\n═══ RESUMEN ═══');
  console.log('turnos guardados:', LOG.turnos.filter(t => t.guardo).length + '/' + LOG.turnos.length);
  console.log('egresos ok:', LOG.egresos.filter(e => e.ok).length + '/' + LOG.egresos.length);
  console.log('eventos ok:', LOG.eventos.filter(e => e.ok).length + '/' + LOG.eventos.length);
  console.log('errores JS:', errsReales.length ? errsReales.slice(0, 8).join('\n') : 'ninguno');
  console.log('salida: build/sim/sim_out.json');
  await b.close();
})();
