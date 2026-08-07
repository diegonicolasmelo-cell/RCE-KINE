// reporte_colega.js — Guardia de la ronda «Bloques A/B/C» (ago-2026): los
// reportes del colega (Álvaro, vía Diego) sobre el motor de texto + la franja
// de prono/supino junto a la TQT + las obligatorias nuevas del guardado.
//
// Reglas duras que asserta esta guardia (todas dichas por Diego):
//   · Meta PAM va INMEDIATAMENTE después de la HDN («HDN estable c/DVA en
//     dosis bajas para meta PAM 65 mmHg») — antes JAMÁS llegaba al texto.
//   · El escalón de sedación SIEMPRE sale con su SAS (la rama BNM se lo comía).
//   · Fases: «En proceso de weaning», «A la espera de second look».
//   · TOT: «N° 8.0 a 22 cm de arcada dental» — la fijación es norma, no opción.
//   · La FIRMA y el bloque «Posicionamiento:» salieron del texto generado.
//   · Prono/supino viven JUNTO a la TQT (no dentro del colapsable 📐) y se
//     narran solos, con hora.
//   · Con TOT es OBLIGATORIO declarar la PVE (sí/no); si la KTM no se realiza
//     o está contraindicada, la razón es OBLIGATORIA.
// Uso: node build/checks/reporte_colega.js
const path = require('path');
const { chromium } = require('playwright-core');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  const R = await p.evaluate(async () => {
    const r = {};
    $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
    SHIFT = 'Dia';
    $('fDias').value = '4';
    FASES_SEL = new Set(['Weaning']);
    $('fSed').value = 'Escalón 2'; $('fSAS').value = '3';
    $('cBNM').checked = true;                       // el BNM no borra el escalón
    $('fHEst').value = 'Estable';
    $('fDVA').value = 'DVA dosis baja';
    $('cMetaPAM').checked = true; $('fPAM').value = '65';
    $('fVA').value = 'TOT'; cascadeVA();
    $('fTOTn').value = '8.0'; $('fTOTcm').value = '22';
    $('fSop').value = 'VM'; cascadeSop();
    $('fModo').value = 'ACVC'; renderParams();
    $('fFirma').innerHTML = '<option value="Mauricio Rojas">Mauricio Rojas</option>';
    $('fFirma').value = 'Mauricio Rojas';

    // ── Prono declarado en la franja nueva ──
    $('cProno').checked = true; hPosEspecial('prono');
    $('cPronoEv').checked = true;
    $('fPronoHora').value = '19:00';

    const txt = genTexto();
    r.texto = txt;
    r.fase = /En proceso de weaning\./.test(txt);
    r.faseVieja = /Fase clínica:/.test(txt);
    r.sedEscalonConBNM = /Sedado en escalón 2\+BNM para meta SAS 3\./.test(txt);
    r.hdnMetaPam = /HDN estable c\/DVA en dosis bajas para meta PAM 65 mmHg\./.test(txt);
    r.totArcada = /TOT N° 8\.0 a 22 cm de arcada dental/.test(txt);
    r.sinFijado = !/fijado a/.test(txt);
    r.sinFirma = !/Rojas/.test(txt);
    r.sinPosicionamiento = !/Posicionamiento:/.test(txt);
    r.pronoNarrado = /Se prona a las 19:00 hrs\./.test(txt);

    // ── La franja de prono vive JUNTO a la TQT, fuera del colapsable 📐 ──
    const strip = $('dPronoStrip');
    r.stripExiste = !!strip;
    r.stripFueraDelColapsable = !!strip && !strip.closest('#dPosBody');
    r.stripJuntoATqt = !!strip && !!strip.closest('.sub-sec') &&
      strip.closest('.sub-sec') === $('dTqtSec')?.closest('.sub-sec');
    r.pronoYaNoEnPos = !document.querySelector('#dPosBody #cProno');

    // ── Turno que solo CONTINÚA en prono: narra el estado, no el evento ──
    $('cPronoEv').checked = false;
    const txtCont = genTexto();
    r.continuaProno = /Paciente continúa en prono\./.test(txtCont);
    r.continuaNoEvento = !/Se prona a las/.test(txtCont);

    // ── OBLIGATORIA: con TOT hay que declarar la PVE ──
    window._GUARDAR_INTENTOS = 0;
    const _api0 = window.api; let llamadas = 0;
    // El stub cuenta las llamadas y devuelve una promesa que jamás resuelve
    // (guardar() encadena .then — lo que se prueba es si el envío SALE).
    window.api = function () { llamadas++; return new Promise(() => {}); };
    $('fPVEval').value = '';
    guardar();
    r.bloqueaSinPve = llamadas === 0;
    // gFalta lo anuncia antes de apretar Guardar
    rielRender();
    r.gFaltaPve = /PVE sí\/no/.test($('gFalta').textContent);

    // ── OBLIGATORIA: la razón de KTM no realizada ──
    $('fPVEval').value = 'no';
    setKTMstate('n'); $('fKTMnoRaz').value = '';
    guardar();
    r.bloqueaSinRazonKTM = llamadas === 0;
    rielRender();
    r.gFaltaKtm = /razón de KTM no realizada/.test($('gFalta').textContent);
    $('fKTMnoRaz').value = 'Decisión médica';
    const txtKtm = genTexto();
    r.decisionMedicaNarrada = /KTM no realizada por decisión médica\./.test(txtKtm);
    // ── OBLIGATORIA: la contraindicación de KTM ──
    setKTMstate('s'); $('fKTMraz').value = ''; $('fKTMman').value = '';
    guardar();
    r.bloqueaSinContra = llamadas === 0;
    $('fKTMman').value = 'Fractura inestable de pelvis';
    guardar();
    r.guardaConRazon = llamadas > 0;
    window.api = _api0;

    // ── El formulario muestra la norma de fijación ──
    r.labelArcada = /arcada dental/i.test($('fTOTcm').closest('.col')?.textContent || '');
    r.fijHidden = $('fTOTfij')?.type === 'hidden' && $('fTOTfij')?.value === 'Arcada dental';

    // ── 🌙 Cambios de esta noche: botón + render ──
    r.botonCn = !!document.querySelector('button[onclick="cnAbrir()"]');
    cnRender({ fecha: '2026-08-07', camas: [
      { idCama: '4', nombre: 'Caterina P.', dispositivos: [
        { k: 'hme', nombre: 'HME', icono: '💨', etiqueta: '2026-08-05', fechaCambio: '2026-08-07', estado: 'esta_noche', diasAtraso: 0 },
        { k: 'tc', nombre: 'Trach Care', icono: '🧹', etiqueta: '2026-08-03', fechaCambio: '2026-08-06', estado: 'vencido', diasAtraso: 1 }
      ] }
    ] });
    const cnHtml = $('cnLista').innerHTML;
    r.cnEstaNoche = /se cambia esta noche/.test(cnHtml) && /05-08/.test(cnHtml);
    r.cnVencido = /VENCIDO — debió cambiarse el 06-08/.test(cnHtml);
    cnRender({ fecha: '2026-08-07', camas: [] });
    r.cnVacio = /Ningún dispositivo/.test($('cnLista').innerHTML);
    return r;
  });

  console.log('── Motor de texto (reportes del colega) ──');
  eq('la fase se narra «En proceso de weaning»', R.fase, true);
  eq('…y la redacción vieja «Fase clínica:» se fue', R.faseVieja, false);
  eq('el escalón sale CON su SAS aunque haya BNM', R.sedEscalonConBNM, true);
  eq('meta PAM inmediatamente después de la HDN (c/DVA)', R.hdnMetaPam, true);
  eq('TOT «a 22 cm de arcada dental»', R.totArcada, true);
  eq('…sin el «fijado a» viejo', R.sinFijado, true);
  eq('la firma salió del texto generado', R.sinFirma, true);
  eq('el bloque «Posicionamiento:» salió del texto', R.sinPosicionamiento, true);
  eq('la pronación se narra sola, con su hora', R.pronoNarrado, true);
  eq('el turno que solo continúa narra el estado', R.continuaProno, true);
  eq('…sin inventar un evento de prono', R.continuaNoEvento, true);

  console.log('\n── Franja de prono junto a la TQT ──');
  eq('existe la franja 🔃', R.stripExiste, true);
  eq('vive FUERA del colapsable 📐', R.stripFueraDelColapsable, true);
  eq('en la misma sección que la TQT', R.stripJuntoATqt, true);
  eq('el colapsable ya no tiene la casilla de prono', R.pronoYaNoEnPos, true);

  console.log('\n── Obligatorias nuevas del guardado ──');
  eq('con TOT y PVE sin declarar NO se guarda', R.bloqueaSinPve, true);
  eq('#gFalta anuncia la PVE pendiente', R.gFaltaPve, true);
  eq('KTM no realizada sin razón NO se guarda', R.bloqueaSinRazonKTM, true);
  eq('#gFalta anuncia la razón de KTM', R.gFaltaKtm, true);
  eq('la «decisión médica» se narra en el texto', R.decisionMedicaNarrada, true);
  eq('KTM contraindicada sin razón NO se guarda', R.bloqueaSinContra, true);
  eq('con la razón puesta, el guardado sale', R.guardaConRazon, true);

  console.log('\n── Formulario y Cambios de esta noche ──');
  eq('la etiqueta del campo dice «arcada dental»', R.labelArcada, true);
  eq('el punto de fijación quedó fijo (hidden = Arcada dental)', R.fijHidden, true);
  eq('está el botón 🌙 en el Registro Diario', R.botonCn, true);
  eq('el modal lista el cambio de esta noche con su etiqueta', R.cnEstaNoche, true);
  eq('…y el vencido con la fecha que se saltó', R.cnVencido, true);
  eq('sin cambios pendientes lo dice en limpio', R.cnVacio, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
