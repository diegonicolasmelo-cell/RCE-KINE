// hoja_apk.js — Guardia de la HOJA APK (v5.26): la «Pauta de cotejo
// preparación del paciente para ejecución de KTR» debe ser REFLEJO FIEL del
// formato oficial (APK 1.2) y prellenar SOLO Ficha/RUN y Servicio:
//   · título exacto, 10 columnas «Fecha», las 9 actividades con su texto,
//     la nota «1= SI 0= NO o N/A» y los dos logos incrustados;
//   · el RUT de la cama llega al campo Ficha o RUN; el nombre NO entra a la
//     pauta (el formato oficial no lo trae) — va en la línea de generación;
//   · la grilla queda EN BLANCO (ninguna celda de fecha con contenido);
//   · imprimir alterna la clase print-apk y la limpia tras el afterprint.
// Uso: node build/checks/hoja_apk.js
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
    // window.print no debe bloquear el arnés
    window.print = () => { window._PRINTS = (window._PRINTS || 0) + 1; };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);
  const fails = []; const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

  const R = await p.evaluate(() => {
    const r = {};
    const html = apkHojaHTML('13.233.431-4', 'Ignacio Pepito', '7');
    r.titulo = html.indexOf('PAUTA DE COTEJO PREPARACIÓN DEL PACIENTE PARA EJECUCIÓN DE KTR') !== -1;
    r.colsFecha = (html.match(/>Fecha</g) || []).length;
    r.rutPrellenado = html.indexOf('13.233.431-4') !== -1;
    r.servicioUCI = /Servicio:.*UCI/.test(html.replace(/\n/g, ' '));
    r.nombreFueraDePauta = html.indexOf('Ignacio Pepito') > html.indexOf('N/A según corresponda');
    r.nota = html.indexOf('1= SI 0= NO o N/A según corresponda') !== -1;
    r.logos = (html.match(/data:image\/png;base64,/g) || []).length;
    // Las 9 actividades, texto exacto
    r.filas = _APK_FILAS.length;
    r.f1 = _APK_FILAS[0] === 'Ficha clínica y registros de evolución del paciente disponible. (*)';
    r.f8 = _APK_FILAS[7] === 'Alimentación suspendida (*)';
    r.f9 = _APK_FILAS[8] === 'Iniciales del profesional que ejecuta KTR';
    r.conAsterisco = _APK_FILAS.filter(f => f.indexOf('(*)') !== -1).length;
    // Grilla en blanco: ninguna celda de fecha trae contenido
    const celdas = html.match(/<td style="border:1px solid #000;width:56px;height:20px;"><\/td>/g) || [];
    r.celdasVacias = celdas.length;   // 10 del subencabezado + 9×10 de actividades = 100
    // Sin RUT: el campo queda como raya para llenar a mano
    const html2 = apkHojaHTML('', 'Sin Rut', '3');
    r.sinRutRaya = html2.indexOf('min-width:130px') !== -1;

    // Flujo de impresión desde el historial
    TLC = '7';
    DB = [{ ID_CAMA: '7', RUT: '13.233.431-4', NOMBRE: 'Ignacio Pepito' }];
    imprimirHojaAPK();
    r.imprimio = window._PRINTS === 1;
    r.claseOn = document.body.classList.contains('print-apk');
    r.divLleno = $('apkPrint').innerHTML.indexOf('PAUTA DE COTEJO') !== -1;
    window.dispatchEvent(new Event('afterprint'));
    r.claseOffTrasImprimir = !document.body.classList.contains('print-apk');
    // Sin historial abierto no revienta: avisa y no imprime
    TLC = null;
    imprimirHojaAPK();
    r.sinHistorialNoImprime = window._PRINTS === 1;
    return r;
  });

  console.log('── Fidelidad al formato oficial ──');
  eq('título exacto de la pauta', R.titulo, true);
  eq('10 columnas «Fecha»', R.colsFecha, 10);
  eq('9 actividades', R.filas, 9);
  eq('fila 1 con texto exacto', R.f1, true);
  eq('fila 8 (alimentación suspendida)', R.f8, true);
  eq('fila 9 (iniciales del profesional)', R.f9, true);
  eq('5 actividades críticas marcadas (*)', R.conAsterisco, 5);
  eq('nota «1= SI 0= NO o N/A»', R.nota, true);
  eq('los dos logos van incrustados', R.logos, 2);
  eq('grilla EN BLANCO (100 celdas vacías)', R.celdasVacias, 100);

  console.log('\n── Prellenado ──');
  eq('el RUT llega al campo Ficha o RUN', R.rutPrellenado, true);
  eq('Servicio: UCI', R.servicioUCI, true);
  eq('el nombre queda FUERA de la pauta (línea de generación)', R.nombreFueraDePauta, true);
  eq('sin RUT: raya para llenar a mano', R.sinRutRaya, true);

  console.log('\n── Flujo de impresión ──');
  eq('imprime desde el historial', R.imprimio, true);
  eq('la clase print-apk se activa', R.claseOn, true);
  eq('la hoja quedó armada en el div', R.divLleno, true);
  eq('afterprint limpia la clase', R.claseOffTrasImprimir, true);
  eq('sin historial abierto: avisa y no imprime', R.sinHistorialNoImprime, true);

  eq('sin errores de página', errs.length ? errs[0] : 0, 0);
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
