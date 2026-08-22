// ktm_contra_observacion.js — LA OBSERVACIÓN DE UNA KTM CONTRAINDICADA LLEGA
// AL TEXTO DE LA EVOLUCIÓN.
//
// 🔴 DE DÓNDE SALE (22-ago-2026, reportado por Manuel desde el turno): al
// marcar la KTM como contraindicada, elegir el ítem del catálogo y escribir
// una observación, la observación NO aparecía en la evolución. La causa era un
// `||`: `KTM_CONTRA_RAZON || KTM_CONTRA_MANUAL`. El ítem y la observación son
// DOS datos distintos, y unidos por un OR el segundo solo se veía cuando
// faltaba el primero — o sea, casi nunca. Se perdía justo lo que el colega se
// tomó el trabajo de escribir, y el guardado sí lo estaba grabando: el dato
// estaba en la planilla y no en el papel que se lee.
//
// 🔴 Y ESTABA EN LOS DOS MOTORES, REDACTANDO DISTINTO. El cliente escribía
// «KTM contraindicada por X.» y el servidor «KTM no realizada.
// Contraindicación absoluta: X.» — dos textos del MISMO turno que no
// coincidían. Ahora dicen lo mismo, y esta guardia lo fija: la paridad entre
// `genTexto()` (index.html) y `generarTextoEvolucion()` (dominio_texto.gs) es
// la propiedad que hay que vigilar, no la frase de uno solo.
//
// Decisiones de Manuel: el tipo (Absoluta/Relativa) NO entra en el texto —vive
// en la planilla y en el historial—; sin ítem, la observación se narra tal cual
// («KTM contraindicada. <obs>»), sin ocupar el lugar del motivo.
//
// Uso: node build/checks/ktm_contra_observacion.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const v2 = path.resolve(__dirname, '..', '..', 'v2');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2, 'index.html'));
  await p.waitForTimeout(500);

  const fails = [];
  const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
  const si = (l, c) => eq(l, !!c, true);

  // Escenario por las rutas REALES: se marca el estado con setKTMstate('s') y
  // se elige en el select del catálogo, que es lo que hace el colega — no se
  // rellenan los hidden a mano (eso probaría el arnés, no la pantalla).
  const linea = (item, obs) => p.evaluate(([it, ob]) => {
    if (typeof poblarKTMcontra === 'function') poblarKTMcontra();
    setKTMstate('s');
    const sel = document.getElementById('fKTMcontra');
    if (it) {
      const o = [...sel.options].find(x => x.value === it);
      if (!o) return '(ítem no está en el catálogo: ' + it + ')';
      sel.value = it; hKTMcontra(sel);
    } else {
      sel.value = ''; hKTMcontra(sel);
    }
    document.getElementById('fKTMman').value = ob || '';
    const t = String(genTexto() || '');
    return (t.split('\n').find(l => /KTM contraindicada/.test(l)) || '(no hay línea de KTM)');
  }, [item, obs]);

  /* ══ 1 · EL CASO QUE SE PERDÍA ════════════════════════════════════════ */
  console.log('1 · Ítem del catálogo + observación: salen LOS DOS');
  const item = await p.evaluate(() => {
    if (typeof poblarKTMcontra === 'function') poblarKTMcontra();
    const o = [...document.getElementById('fKTMcontra').options].find(x => x.value);
    return o ? o.value : '';
  });
  si('el catálogo de contraindicaciones tiene ítems', !!item);
  const L1 = await linea(item, 'se reevalúa en el próximo turno');
  si('la línea nombra el ítem elegido', L1.toLowerCase().includes(item.toLowerCase().slice(0, 12)));
  si('…y la observación TAMBIÉN aparece (esto es lo que se perdía)',
    /[Ss]e reeval[uú]a en el pr[oó]ximo turno/.test(L1));
  console.log('   → ' + L1);

  /* ══ 2 · LOS OTROS TRES CASOS ═════════════════════════════════════════ */
  console.log('\n2 · Solo ítem, solo observación, ninguno');
  const L2 = await linea(item, '');
  si('solo ítem: se narra el motivo', L2.toLowerCase().includes(item.toLowerCase().slice(0, 12)));
  si('…sin arrastrar restos de la observación anterior', !/reeval/.test(L2));

  const L3 = await linea('', 'paciente en pabellón durante todo el turno');
  si('solo observación: se narra tal cual', /[Pp]aciente en pabell[oó]n/.test(L3));
  si('…sin inventar un motivo del catálogo («por …»)', !/contraindicada por/.test(L3));

  const L4 = await linea('', '');
  eq('sin ninguno de los dos, la frase queda limpia', L4.trim(), 'KTM contraindicada.');

  /* ══ 3 · PUNTUACIÓN: NI DOBLE PUNTO NI FRASE SIN CERRAR ═══════════════ */
  console.log('\n3 · Puntuación');
  const L5 = await linea(item, 'se reevalúa mañana.');
  si('una observación que ya trae punto no lo duplica', !/\.\./.test(L5));
  si('la observación abre oración en mayúscula (va después de un punto)',
    / Se reeval/.test(L5) || / Se reeval/.test(L1));
  si('…y la frase cierra con punto', /\.$/.test(L5.trim()));

  /* ══ 4 · LOS DOS MOTORES DICEN LO MISMO ═══════════════════════════════ */
  console.log('\n4 · Cliente y servidor en paridad');
  const dom = fs.readFileSync(path.join(v2, 'dominio_texto.gs'), 'utf8');
  si('el servidor usa la misma frase «KTM contraindicada por …»',
    /KTM contraindicada por \$\{_lcIni\(item\)\}/.test(dom));
  si('…y agrega la observación como oración aparte, con mayúscula inicial',
    /ktmC \+= ` \$\{\(obsC\.charAt\(0\)\.toUpperCase\(\)/.test(dom));
  si('el `||` que se comía la observación ya no existe',
    !/KTM_CONTRA_RAZON'\) \|\| v\('KTM_CONTRA_MANUAL/.test(dom));
  si('…tampoco en el cliente',
    !/gv\('fKTMraz'\)\|\|gv\('fKTMman'\)/.test(fs.readFileSync(path.join(v2, 'index.html'), 'utf8')));
  si('y el servidor ya no redacta «KTM no realizada. Contraindicación …»',
    !/KTM no realizada\. Contraindicaci[oó]n/.test(dom));

  eq('sin errores JS', errs.join(' | '), '');
  await b.close();
  console.log(fails.length ? `\n❌ ${fails.length} fallos: ${fails.join(' · ')}` : '\n✅ Todo OK');
  process.exit(fails.length ? 1 : 0);
})();
