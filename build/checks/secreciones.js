// secreciones.js — Las secreciones se describen IGUAL en todas partes.
//
// 🔴 EL DEFECTO QUE ORIGINA ESTA GUARDIA (ago-2026, reportado por Diego:
// «secreciones no sale las características mucosas etc»). La misma regla vivía
// en TRES consumidores y se habían separado sin que nadie lo notara:
//
//   texto de la evolución .... reología · características · cantidad   ✅
//   entrega de turno ......... reología ·        —        · cantidad   ❌
//   Hoja UCI (historial) .....    —     · características · cantidad   ❌
//
// Cada uno perdía un campo DISTINTO, así que ninguna vista estaba vacía y el
// error era invisible: la entrega decía «Secreciones fluidas +» sin decir nunca
// si eran mucosas o purulentas —que es justo lo que orienta a infección— y la
// Hoja UCI decía las características pero no si eran adherentes.
//
// Es el mismo patrón que ya se pagó con la fecha de los filtros (cuatro
// lugares, uno quedó atrás) y con «día con VM» (dos definiciones conviviendo).
// Por eso esta guardia NO comprueba un texto: comprueba que los tres
// consumidores nombren las TRES columnas, leyendo el fuente. Un consumidor
// nuevo que se olvide de una la pone roja.
//
// Uso: node build/checks/secreciones.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');

const CAMPOS = ['RESP_SECR_REOL', 'RESP_SECR_CAR', 'RESP_SECR_QTY'];
const fails = [];
const eq = (l, g, w) => { const ok = String(g) === String(w); console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!ok) fails.push(l); };

const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
const ent = fs.readFileSync(path.join(v2, 'svc_entrega.gs'), 'utf8');
const dom = fs.readFileSync(path.join(v2, 'dominio_texto.gs'), 'utf8');

console.log('1 · Los tres consumidores nombran las tres columnas');

/** Devuelve la línea (o bloque) donde el consumidor arma la descripción. */
const bloque = (src, ancla, largo) => {
  const i = src.indexOf(ancla);
  return i === -1 ? '' : src.slice(i, i + largo);
};

// a) Entrega de turno — la propiedad `secr` de la ficha
const bEnt = bloque(ent, 'secr: e ?', 260);
eq('la entrega arma su campo secr', bEnt !== '', true);
CAMPOS.forEach(c => eq('  entrega usa ' + c, bEnt.includes(c), true));

// b) Hoja UCI — la fila `secr` de HJ_F
const bHoja = bloque(idx, "secr:  {l:'Sec. bronquiales'", 320);
eq('la Hoja UCI define su fila de secreciones', bHoja !== '', true);
CAMPOS.forEach(c => eq('  Hoja UCI usa ' + c, bHoja.includes(c), true));

// c) Narrativa del servidor
const bDom = bloque(dom, "const reol = v('RESP_SECR_REOL')", 620);
eq('el generador de texto del servidor arma la frase', bDom !== '', true);
CAMPOS.forEach(c => eq('  narrativa (servidor) usa ' + c, bDom.includes(c), true));

// d) Narrativa del cliente (usa los ids del formulario, no las columnas)
const bCli = bloque(idx, "const reol=v('fSecrReol')", 620);
eq('el generador de texto del cliente arma la frase', bCli !== '', true);
['fSecrReol', 'fSecrCar', 'fSecrQty'].forEach(c =>
  eq('  narrativa (cliente) usa ' + c, bCli.includes(c), true));

console.log('\n2 · Y las tres viajan en el guardado');
const payload = bloque(idx, 'RESP_SECR_REOL: ', 200);
CAMPOS.forEach(c => eq('  el payload manda ' + c, payload.includes(c), true));

console.log('\n3 · Mismo orden en todas: reología · características · cantidad');
// El orden importa para que el equipo lea siempre la misma frase. Se comprueba
// por la posición de cada columna dentro de su propio bloque.
const orden = (b, cs) => cs.map(c => b.indexOf(c)).every((x, i, a) => i === 0 || (x > a[i - 1] && x !== -1));
eq('entrega: reol → car → qty', orden(bEnt, CAMPOS), true);
eq('Hoja UCI: reol → car → qty', orden(bHoja, CAMPOS), true);
eq('narrativa servidor: reol → car → qty', orden(bDom, CAMPOS), true);

console.log('\n4 · El catálogo de características sigue completo');
const CARACT = ['Mucosas', 'Mucopurulentas', 'Purulentas', 'Mucohemáticas', 'Hemopurulentas',
  'Mucopurulentas con tinte hemático', 'Mucosas con tinte hemático', 'Herrumbrosas', 'Carbonizadas'];
const sel = bloque(idx, 'id="fSecrCar"', 900);
CARACT.forEach(c => eq('  ' + c, sel.includes('<option>' + c + '</option>'), true));
const REOL = ['Fluidas', 'Ligosas', 'Adherentes'];
const selR = bloque(idx, 'id="fSecrReol"', 500);
REOL.forEach(c => eq('  reología ' + c, selR.includes('<option>' + c + '</option>'), true));

console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
process.exit(fails.length ? 1 : 0);
