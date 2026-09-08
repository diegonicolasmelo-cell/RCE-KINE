// auscultacion_ruidos.js — Guardia del arreglo v6.20.
//
// 🪤 Lo reportó Álvaro desde el turno (8-sep-2026): el formulario deja anotar
// VARIOS ruidos agregados (el bloque «+ ruido» → EX_RUIDOS_JSON) y los guardaba
// bien, pero el TEXTO narraba solo el del select. Quien anotaba crépitos
// bibasales y sibilancias difusas leía uno solo en su propia evolución.
//
// De paso cubre dos cosas más de la misma tanda:
//   · «sin ruidos agregados» sin murmullo ya no sale con coma suelta.
//   · Los tres bloques que el motor escribía y ninguna plantilla podía nombrar
//     (aet, reingreso, upot) son comodines válidos, y los comodines de dato
//     nuevos ({mp}, {ruidos}, {gcs_o}…) devuelven el valor del formulario —
//     que es lo que permite reescribir un bloque con palabras propias.
//
// Uso: node build/checks/auscultacion_ruidos.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const RAIZ = path.resolve(__dirname, '..', '..');

(async () => {
  const fails = [];
  const eq = (l, g, w) => {
    const okk = String(g) === String(w);
    console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g));
    if (!okk) { fails.push(l); console.log('   esperado: ' + JSON.stringify(w)); }
  };
  const tiene = (l, txt, frag) => {
    const okk = String(txt).indexOf(frag) >= 0;
    console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(frag));
    if (!okk) { fails.push(l); console.log('   en: ' + JSON.stringify(txt)); }
  };

  // ── 1. El servidor lee el JSON de ruidos (paridad con el cliente) ──────
  console.log('\n1 · El motor del servidor también los lee');
  const srv = fs.readFileSync(path.join(RAIZ, 'v2', 'dominio_texto.gs'), 'utf8');
  eq('★ dominio_texto.gs mira EX_RUIDOS_JSON', /EX_RUIDOS_JSON/.test(srv), 'true');
  eq('…y ya no depende solo del select (ruidosText murió)', /const ruidosText/.test(srv), 'false');

  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(RAIZ, 'v2', 'index.html'));
  await p.waitForTimeout(500);

  const R = await p.evaluate(async () => {
    const r = {};
    const base = () => {
      $('kf').reset(); $('cBed').value = '3'; DB = [{ ID_CAMA: '3' }];
      setRuidosExtra('');
    };

    // (a) Tres ruidos: el del select y dos del bloque «+ ruido»
    base();
    $('fMPVal').value = 'Disminuido en Bases';
    $('fRuidosVal').value = 'Crépitos'; $('fRuidosLoc').value = 'Bibasales';
    addRuidoRow('Sibilancias', 'Ambos campos pulmonares');
    addRuidoRow('Roncus', 'Base derecha');
    r.tres = (genTexto().split('\n').find(l => /^Auscultación/.test(l)) || '');
    r.comodinRuidos = _auscRuidos().txt;
    r.comodinMp = PLANT_DATOS.mp.v();

    // (b) Uno solo: la redacción de siempre, sin listas ni «y»
    base();
    $('fMPVal').value = 'Presente Bilateral';
    $('fRuidosVal').value = 'Crépitos'; $('fRuidosLoc').value = 'Bibasales';
    r.uno = (genTexto().split('\n').find(l => /^Auscultación/.test(l)) || '');

    // (c) Sin murmullo declarado y «Sin ruidos agregados»: sin coma suelta
    base();
    $('fRuidosVal').value = 'Sin ruidos agregados';
    r.sinMp = (genTexto().split('\n').find(l => /Auscultación|sin ruidos/.test(l)) || '');

    // (d) Nada anotado: la línea no existe
    base();
    r.nada = genTexto().split('\n').some(l => /^Auscultación/.test(l));

    // (e) Los tres bloques huérfanos son comodines válidos
    r.huerfanos = ['aet', 'reingreso', 'upot'].filter(k => PLANT_COMODINES.indexOf(k) >= 0).length;
    r.huerfanosBloque = ['aet', 'reingreso', 'upot'].filter(k => PLANT_COM_BLOQUE.indexOf(k) >= 0).length;
    r.huerfanosAlias = ['aet', 'reingreso', 'upot'].filter(k => !!PLANT_ALIAS[k]).length;

    // (f) El reingreso, que la plantilla de Ingreso no podía nombrar
    base();
    $('cReing').checked = true;
    r.reingreso = (_plantDatos().reingreso || '');
    r.reingRenderizado = _plantRellenar('{reingreso}', _plantDatos());

    // (g) Los comodines de dato nuevos traen el valor del formulario:
    //     con ellos se reescribe {sedacion} a mano («sedado» en vez de
    //     «Sedoanalgesia»), que es lo que pidió Diego.
    base();
    $('fGCSO').value = '3'; $('fGCSV').value = '1'; $('fGCSM').value = '5';
    $('fS5Q').value = 'gte3'; $('fCAMICU').value = 'neg';
    r.datos = ['gcs_o', 'gcs_v', 'gcs_m', 's5q', 'camicu'].map(k => PLANT_DATOS[k].v()).join('|');
    r.aMano = _plantRellenar('Sedado, GCS O:{gcs_o} V:{gcs_v} M:{gcs_m}, S5Q {s5q}, CAM-ICU {camicu}.', _plantDatos());

    // (h) Todo comodín declarado tiene de dónde sacar su valor
    r.sinFuente = PLANT_COMODINES.filter(k => !PLANT_ALIAS[k] && !PLANT_DATOS[k] &&
      ['pve_n', 'weaning_grado', 'relato'].indexOf(k) < 0).join(',');
    return r;
  });

  console.log('\n2 · Tres ruidos anotados, tres ruidos narrados');
  tiene('★ el murmullo va delante', R.tres, 'MP(+), Disminuido en Bases');
  tiene('★ nombra el primer ruido', R.tres, 'Crépitos Bibasales');
  tiene('★ …y el segundo', R.tres, 'Sibilancias Ambos campos pulmonares');
  tiene('★ …y el tercero, con «y» antes del último', R.tres, 'y Roncus Base derecha');
  eq('el comodín {ruidos} dice lo mismo',
    R.comodinRuidos, 'Crépitos Bibasales, Sibilancias Ambos campos pulmonares y Roncus Base derecha');
  eq('el comodín {mp} trae el murmullo', R.comodinMp, 'Disminuido en Bases');

  console.log('\n3 · Un solo ruido: la redacción de siempre');
  eq('★ sin listas ni «y» de más', R.uno, 'Auscultación: MP(+) bilateral, con Crépitos Bibasales.');

  console.log('\n4 · «Sin ruidos agregados» sin murmullo declarado');
  eq('★ ya no sale la coma suelta del principio', R.sinMp, 'Auscultación: sin ruidos agregados.');
  eq('sin nada anotado, no hay línea de auscultación', R.nada, 'false');

  console.log('\n5 · Los tres bloques que ninguna plantilla podía nombrar');
  eq('★ aet, reingreso y upot son comodines permitidos', R.huerfanos, 3);
  eq('…declarados como bloque', R.huerfanosBloque, 3);
  eq('…y con su bloque del motor detrás', R.huerfanosAlias, 3);
  eq('★ {reingreso} se rellena de verdad', R.reingRenderizado, 'Corresponde a reingreso a UCI.');

  console.log('\n6 · Reescribir un bloque con palabras propias (pedido de Diego)');
  eq('los datos sueltos salen del formulario', R.datos, '3|1|5|≥3|negativo');
  eq('★ «Sedado» en vez de «Sedoanalgesia», con el dato intacto',
    R.aMano, 'Sedado, GCS O:3 V:1 M:5, S5Q ≥3, CAM-ICU negativo.');
  eq('★ ningún comodín declarado se quedó sin fuente', R.sinFuente, '');

  eq('sin errores de JavaScript', errs.join(' | '), '');
  await b.close();

  console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS' : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
