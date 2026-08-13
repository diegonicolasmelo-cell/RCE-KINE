// cat_etiqueta.js — La etiqueta de categorización está retirada de la vista,
// pero el cálculo sigue corriendo.
//
// Decisión de Diego (ago-2026): «por ahora sigue categorizando pero saca de
// todos los lugares la etiqueta de categorización respiratoria y motora».
//
// «Todos los lugares» son TRES, y por eso esto es una guardia y no un borrado:
//   · la tarjeta de cama (chip junto a las alertas),
//   · el panel de evolución (los dos globos 🫁 R / 🦾 M),
//   · la ficha de la entrega de turno.
// Quitar dos de tres es el modo de fallo típico de este proyecto —pasó con la
// fecha de los filtros y con las secreciones—, y aquí se notaría poco porque
// cada vista se mira en un momento distinto.
//
// Lo que NO se toca, y esta guardia también lo vigila: el cálculo, las
// columnas que se guardan y la serie agregada de Estadísticas. El día que
// Diego quiera la etiqueta de vuelta es una línea, no un rescate.
//
// Uso: node build/checks/cat_etiqueta.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');

console.log('1 · El interruptor existe y está apagado');
eq('hay un interruptor único', /const _CAT_ETIQUETA_VISIBLE = (true|false);/.test(idx), true);
eq('…y está en false', /const _CAT_ETIQUETA_VISIBLE = false;/.test(idx), true);

console.log('\n2 · Los TRES lugares lo consultan');
// (a) tarjeta de cama
const cama = (idx.match(/if\(_CAT_ETIQUETA_VISIBLE\)\s*\n\s*al\+=_catChip/) || [''])[0];
eq('la tarjeta de cama lo consulta', cama !== '', true);
// (b) panel de evolución
const panel = (idx.match(/if\(_CAT_ETIQUETA_VISIBLE\)\{[\s\S]{0,220}?pinta\('catMotor'/) || [''])[0];
eq('el panel de evolución lo consulta', panel !== '', true);
// (c) ficha de la entrega
const ent = (idx.match(/const catChip=[\s\S]{0,160}?_CAT_ETIQUETA_VISIBLE/) || [''])[0];
eq('la ficha de la entrega lo consulta', ent !== '', true);
// Y ninguno de los tres pinta sin preguntar. Se cuenta el CÓDIGO, no las
// menciones: los comentarios que explican el interruptor deben poder nombrarlo
// (misma lección que `memo_episodio.js` con el campo retirado).
const codigo = idx.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
const usos = (codigo.match(/_CAT_ETIQUETA_VISIBLE/g) || []).length;
eq('son 3 consultas + la declaración', usos, 4);

console.log('\n3 · El cálculo y el guardado siguen intactos');
eq('la matriz se sigue calculando', /function calcCatResp\(\)\{ return _calcMatriz\('RESP'\); \}/.test(idx), true);
eq('…y la motora también', /function calcCatMotor\(\)\{ return _calcMatriz\('MOTOR'\); \}/.test(idx), true);
['CAT_RESP_PJE', 'CAT_RESP_NIVEL', 'CAT_MOTOR_PJE', 'CAT_MOTOR_NIVEL'].forEach(c =>
  eq('  el payload sigue mandando ' + c, new RegExp(c + ':\\s').test(idx), true));
eq('el guardado sigue llamando al cálculo',
  /const _cR=calcCatResp\(\), _cM=calcCatMotor\(\);/.test(idx), true);

console.log('\n4 · La serie agregada de Estadísticas se conserva');
// Es donde se mira la tendencia para decidir si la etiqueta vuelve: sacarla
// también dejaría a la coordinación sin el dato que justifica la decisión.
eq('el gráfico de categorización respiratoria sigue', /Categorización respiratoria \(turnos\)/.test(idx), true);
eq('…y el de motora', /Categorización motora \(turnos\)/.test(idx), true);
const stats = fs.readFileSync(path.join(v2, 'svc_stats.gs'), 'utf8');
eq('el servidor sigue agregando la serie', /catResp: catResp, catMotor: catMotor/.test(stats), true);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
