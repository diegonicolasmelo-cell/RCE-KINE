// desvinculacion.js — El paciente queda donde la desvinculación lo dejó.
//
// 🔴 DE DÓNDE SALE (Diego, 11-ago-2026): «el turno anterior me entregó un
// paciente desvinculado y aún sin reconexión, porque evolucionó
// favorablemente. Sale la hora de desvinculación y todo el detalle de la VM,
// pero como estado actual no salía la cánula de alto flujo sino CPAP/PS
// todavía; recién al evolucionar pude cambiarlo».
//
// La causa no era un cálculo malo: la cascada que decide el estado con que
// TERMINA el turno pregunta por la intubación, la TQT, la extubación y la
// decanulación — y **no preguntaba por la desvinculación**. El dato «Queda
// con» ya se capturaba desde la v4.2 y solo servía para narrar.
//
// DECISIONES DE DIEGO QUE ESTA GUARDIA FIJA (12-ago-2026):
//   · El alto flujo por traqueostomía se llama **CTAF**, no «OAF/CTAF» ni
//     «CNAF» — «así nos entendemos». CNAF es nasal; CTAF es traqueal.
//   · La válvula de fonación **puede ir con o sin O2 adicional** ⇒ son dos
//     destinos distintos, y el soporte que resulta es distinto.
//   · «TQT con naricera/máscara» **sale del desplegable**: no tiene sentido
//     clínico. El paso previo a la decanulación es el O2 adicional por
//     válvula de fonación.
//   · **Los días de VM no se reinician.** Su ejemplo textual: 8° día de
//     estadía, desvinculado hace 2 días, 6 días de VM incluyendo el de la
//     desvinculación ⇒ se consideran 6. Si se reconecta, «se retoma esos 6
//     días y empieza a sumar»; los siguientes suman al previo y NO cuentan
//     desde 0. Eso ya era la regla de tramos de la v5.42 — esta guardia lo
//     fija con el número para que nadie la cambie sin darse cuenta.
//
// Uso: node build/checks/desvinculacion.js
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', 'node_modules', 'playwright-core'));
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l);
};

const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');

/* ══ 1 · EL CATÁLOGO Y EL DESPLEGABLE ════════════════════════════════════ */
console.log('\n1 · CTAF, la válvula en dos y la naricera fuera');

const tqt = (idx.match(/'TQT':\s*\{sops:.*?\}\},/s) || [''])[0];
eq('el modo de alto flujo por TQT se llama CTAF', /'CTAF'/.test(tqt), true);
eq('…y ya no dice OAF/CTAF', /'OAF\/CTAF'/.test(tqt), false);
eq('CTAF se explica en el desplegable', /'CTAF':'CTAF \(alto flujo por TQT\)'/.test(idx), true);

const sel = (idx.match(/id="fDesvincA"[\s\S]{0,600}?<\/select>/) || [''])[0];
eq('el desplegable «Queda con» existe', sel !== '', true);
['Tubo T', 'HME', 'CTAF', 'Válvula de fonación con O2', 'Válvula de fonación sin O2', 'Ambiente']
  .forEach(o => eq('  ofrece ' + o, sel.includes('<option>' + o + '</option>'), true));
eq('la naricera/máscara por TQT salió del desplegable', /naricera/.test(sel), false);
eq('…y la válvula suelta también (ahora se declara con o sin O2)',
  sel.includes('<option>Válvula de fonación</option>'), false);

/* ══ 2 · UN VALOR GUARDADO NO SE PIERDE AL RENOMBRAR ═════════════════════ */
console.log('\n2 · Renombrar una opción no le borra el dato a las evoluciones viejas');
eq('poblar conserva el valor guardado fuera del catálogo',
  /if\(def && !lista\.includes\(def\)\) lista\.push\(def\);/.test(idx), true);
eq('…y lo marca como registro anterior', /\(registro anterior\)/.test(idx), true);

/* ══ 3 · LA CASCADA Y LA PODA ═══════════════════════════════════════════ */
console.log('\n3 · La desvinculación entra donde se decide el estado final');
const casc = (idx.match(/VENT_SOPORTE_FINAL:[\s\S]{0,600}?VENT_MODO_FINAL:[\s\S]{0,600}?,\n/) || [''])[0];
eq('el soporte final consulta la desvinculación', /_desvincQueda\(\)\.sop/.test(casc), true);
eq('el modo final también', /_desvincQueda\(\)\.modo/.test(casc), true);
// La vía aérea NO cambia: el paciente sigue traqueostomizado.
const cascVA = (idx.match(/VENT_VIA_AEREA_FINAL:[\s\S]{0,400}?\n\s*VENT_SOPORTE_FINAL/) || [''])[0];
eq('★ la vía aérea NO la toca (sigue en TQT)', /_desvincQueda/.test(cascVA), false);
eq('la poda cuenta la desvinculación como evento activo',
  /algunEvento=[^\n]*cDesvinc/.test(idx), true);

/* ══ 4 · COMPORTAMIENTO EN EL NAVEGADOR ═════════════════════════════════ */
(async () => {
  console.log('\n4 · La historia de Diego, en el formulario');
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium',
  });
  const page = await browser.newPage();
  await page.setContent('<body></body>');

  // Solo el traductor y su decisión: se extraen del fuente para probar la
  // regla real, no una copia.
  const mapa = (idx.match(/const _DESVINC_ESTADO=\{[\s\S]*?\n\};/) || [''])[0];
  const fn = (idx.match(/function _desvincQueda\(\)\{[\s\S]*?\n\}/) || [''])[0];
  eq('se extrajeron el traductor y su decisión', mapa !== '' && fn !== '', true);

  await page.evaluate(([m, f]) => {
    window._campos = { cDesvinc: false, cDesvincRecon: false, fDesvincA: '' };
    window.$ = id => (id in window._campos ? { checked: window._campos[id] } : null);
    window.v = id => (id in window._campos ? window._campos[id] : '');
    // Indirecto: un `const` dentro de un eval DIRECTO queda encerrado en el
    // bloque del eval y no se puede leer desde fuera.
    (0, eval)(m + '\n;\n' + f + '\n;\nwindow._desvincQueda=_desvincQueda;');
  }, [mapa, fn]);

  const queda = (a, recon) => page.evaluate(([a2, r]) => {
    window._campos.cDesvinc = true;
    window._campos.cDesvincRecon = r;
    window._campos.fDesvincA = a2;
    const q = window._desvincQueda();
    return q ? q.sop + ' · ' + q.modo : '(sin cambio)';
  }, [a, recon]);

  // La historia: queda con alto flujo por la traqueostomía, sin reconexión.
  eq('★ desvinculado a CTAF ⇒ Oxigenoterapia/OAF · CTAF',
    await queda('CTAF', false), 'Oxigenoterapia/OAF · CTAF');
  eq('válvula de fonación CON O2 ⇒ oxigenoterapia',
    await queda('Válvula de fonación con O2', false), 'Oxigenoterapia/OAF · Válvula de fonación');
  eq('★ válvula de fonación SIN O2 ⇒ ambiente',
    await queda('Válvula de fonación sin O2', false), 'Ambiente · Válvula de fonación');
  eq('tubo T', await queda('Tubo T', false), 'Oxigenoterapia/OAF · Tubo T');
  eq('HME', await queda('HME', false), 'Oxigenoterapia/OAF · HME');
  eq('ambiente', await queda('Ambiente', false), 'Ambiente · Sin soporte');

  // Reconexión en el mismo turno: manda la reconexión, el turno cierra en VM.
  eq('★ con reconexión en el turno, la cama NO se cambia',
    await queda('CTAF', true), '(sin cambio)');
  // Sin destino elegido no se inventa un estado.
  eq('★ sin «Queda con», no se inventa nada', await queda('', false), '(sin cambio)');
  // Destinos de registros anteriores al ajuste siguen entendiéndose.
  eq('un registro viejo con «CNAF / OAF» se sigue traduciendo',
    await queda('CNAF / OAF', false), 'Oxigenoterapia/OAF · CTAF');

  await browser.close();

  /* ══ 5 · LOS DÍAS DE VM NO SE REINICIAN ═══════════════════════════════ */
  console.log('\n5 · El ejemplo de Diego: 6 días de VM, y al reconectar se retoman');

  // Arnés del contador real de tramos (v5.42), con el episodio de su ejemplo:
  // ingresa y se conecta el 01; se desvincula el 06 (ese día CUENTA); el 07 y
  // el 08 sigue desvinculado; si se reconecta, retoma desde 6.
  const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);
  // Copia fiel de `_contadorTramos` (svc_evoluciones.gs): base = congelado de
  // la última evolución que terminó FUERA del soporte, + el tramo abierto.
  const contador = (epiPrev, campo, enS, terminoSinS, fInicioTramo, fecha) => {
    if (!enS) return epiPrev.length ? (parseInt(epiPrev[0][campo], 10) || 0) : 0;
    let base = 0, huboSalida = false;
    for (let i = 0; i < epiPrev.length; i++) {
      if (terminoSinS(epiPrev[i])) { base = parseInt(epiPrev[i][campo], 10) || 0; huboSalida = true; break; }
    }
    let ini = fInicioTramo;
    if (!huboSalida && epiPrev.length) {
      const f0 = String(epiPrev[epiPrev.length - 1].FECHA || '').slice(0, 10);
      if (f0 && (!ini || f0 < ini)) ini = f0;
    }
    return base + Math.max(0, diasEntre(ini, fecha) || 0);
  };
  const fin = x => String(x.VENT_SOPORTE_FINAL || x.VENT_SOPORTE || '');
  const sinVM = x => fin(x) !== 'VM';

  // Episodio en orden DESCENDENTE (el más reciente primero), como lo entrega
  // el guardado. Del 01 al 05 en VM; el 06 se desvincula.
  const epi = [];
  for (let d = 5; d >= 1; d--) {
    epi.push({ FECHA: '2026-08-0' + d, VENT_SOPORTE: 'VM', VENT_SOPORTE_FINAL: 'VM', DIAS_VM: d - 1 });
  }
  // Turno del 06: EMPIEZA en VM y TERMINA desvinculado.
  // ⚠️ OJO CON EL NÚMERO. Diego contó «6 días» de forma inclusiva (01, 02, 03,
  // 04, 05 y 06). La app cuenta con la convención **Día 0 = día de conexión**,
  // la misma de la lista oficial de BUDA validada en la v5.35, así que el
  // mismo episodio se muestra como 5. No es un desacuerdo con su regla —lo que
  // él fijó es que el contador NO se reinicia— pero conviene tenerlo escrito:
  // si alguna vez se decide contar inclusivo, se cambia aquí y en dias_estadia.
  const dia6 = contador(epi, 'DIAS_VM', true, sinVM, '2026-08-01', '2026-08-06');
  eq('★ el día de la desvinculación SÍ cuenta (empezó ventilado)', dia6, 5);
  const evo6 = { FECHA: '2026-08-06', VENT_SOPORTE: 'VM', VENT_SOPORTE_FINAL: 'Oxigenoterapia/OAF', DIAS_VM: dia6 };
  epi.unshift(evo6);

  // 07 y 08: desvinculado, ni al empezar ni al cerrar está en VM.
  const dia7 = contador(epi, 'DIAS_VM', false, sinVM, '', '2026-08-07');
  eq('desvinculado, el contador se congela', dia7, dia6);
  epi.unshift({ FECHA: '2026-08-07', VENT_SOPORTE: 'Oxigenoterapia/OAF', VENT_SOPORTE_FINAL: 'Oxigenoterapia/OAF', DIAS_VM: dia7 });
  const dia8 = contador(epi, 'DIAS_VM', false, sinVM, '', '2026-08-08');
  eq('★ dos días después sigue congelado, no baja ni sube', dia8, dia6);
  epi.unshift({ FECHA: '2026-08-08', VENT_SOPORTE: 'Oxigenoterapia/OAF', VENT_SOPORTE_FINAL: 'Oxigenoterapia/OAF', DIAS_VM: dia8 });

  // Se reconecta el 09: RETOMA el acumulado, no parte de 0.
  const recon = contador(epi, 'DIAS_VM', true, sinVM, '2026-08-09', '2026-08-09');
  eq('★ al reconectar RETOMA el acumulado, no cuenta desde 0', recon, dia6);
  epi.unshift({ FECHA: '2026-08-09', VENT_SOPORTE: 'VM', VENT_SOPORTE_FINAL: 'VM', DIAS_VM: recon });
  const recon2 = contador(epi, 'DIAS_VM', true, sinVM, '2026-08-09', '2026-08-10');
  eq('★ …y desde ahí vuelve a sumar', recon2, dia6 + 1);

  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
