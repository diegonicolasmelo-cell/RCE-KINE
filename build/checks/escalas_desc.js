// escalas_desc.js — FSS-ICU y MRC con la descripción a la vista.
//
// Pedido de Diego (brainstorm de terreno, 11-ago-2026): «hoy solo aparecen
// números; existe la versión con descripción de cada ítem. Quizás se pueda
// evaluar mejor con feedback visual de qué se trata cada puntaje».
//
// No es cosmética: TODA la confiabilidad interobservador publicada de las dos
// escalas se midió con evaluadores usando las definiciones operacionales
// estandarizadas. Un equipo que puntúa de memoria está usando una escala
// distinta de la que se validó — y con turnos rotando, ése es justo el
// escenario donde la concordancia se cae.
//
// DE DÓNDE SALE EL TEXTO, que es lo que esta guardia protege:
//   · FSS-ICU → **versión chilena de bolsillo** (PocketCard 28.08.18, González-
//     Seguel, Camus-Molina, Guimarães, Needham, Zanni y el grupo OACIS de Johns
//     Hopkins), que mandó Diego. Los ítems 1 a 4 comparten escala; la marcha
//     tiene la suya, con distancias.
//   · El ORDEN de los ítems es el de la unidad, no el del documento largo
//     (Diego: «el FSS-ICU es como sale en nuestra plataforma»). El total es la
//     suma, así que el orden no mueve ningún número.
//   · MRC → graduación estándar 0-5. ⚠️ Diego no encontró una traducción
//     oficial de la unidad («es la comúnmente usada»), así que va como leyenda
//     ÚNICA y se cambia en un solo lugar si el protocolo local dice otra cosa.
//
// 🔴 LO QUE MÁS IMPORTA AQUÍ: el VALOR guardado sigue siendo el NÚMERO. Si
// alguien escribe la descripción como contenido de la opción sin `value`, la
// planilla empieza a guardar la frase entera y se rompen el total, la
// interpretación y todo el histórico. Ese es el modo de fallo que esta guardia
// existe para impedir.
//
// Uso: node build/checks/escalas_desc.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');

/* ══ 1 · EL VALOR SIGUE SIENDO EL NÚMERO ════════════════════════════════ */
console.log('\n1 · ★ Lo que se guarda es el número, no la frase');
const sel = id => (idx.match(new RegExp('id="' + id + '"[\\s\\S]{0,1400}?</select>')) || [''])[0];
for (let i = 1; i <= 5; i++) {
  const s = sel('fFssIt' + i);
  eq('  el ítem ' + i + ' existe', s !== '', true);
  for (let p = 0; p <= 7; p++) {
    if (!new RegExp('<option value="' + p + '">').test(s)) {
      eq('  ítem ' + i + ' · el puntaje ' + p + ' guarda el número', false, true);
    }
  }
  // Ninguna opción puede quedar sin `value` (ahí el valor sería el texto).
  const sinValue = (s.match(/<option(?!\s+value=)/g) || []).length;
  eq('  ítem ' + i + ' · ninguna opción sin value', sinValue, 0);
}

/* ══ 2 · LOS TEXTOS SON LOS DE LA TARJETA DE BOLSILLO ═══════════════════ */
console.log('\n2 · Las descripciones, de la versión chilena de bolsillo');
const comun = sel('fFssIt1');
[['0', 'Incapaz de intentar o completar por debilidad'],
 ['1', 'Dependiente'], ['2', 'realiza ≤25%'], ['3', 'realiza 26-74%'],
 ['4', 'realiza ≥75%'], ['5', 'Supervisión'],
 ['6', 'Independiente modificado'], ['7', 'Independiente']].forEach(([p, t]) =>
  eq('  ítems 1-4 · ' + p + ' dice «' + t + '»', comun.includes(t), true));

// Los cuatro primeros comparten escala: si alguien toca uno y no los otros,
// el equipo puntúa con dos varas distintas.
[2, 3, 4].forEach(i => {
  const s = sel('fFssIt' + i);
  ['Incapaz de intentar o completar por debilidad', 'realiza ≤25%', 'realiza 26-74%', 'realiza ≥75%', 'Supervisión']
    .forEach(t => eq('  ítem ' + i + ' comparte «' + t + '»', s.includes(t), true));
});

// La marcha tiene su propia escala, con distancias.
const marcha = sel('fFssIt5');
['≥45 m', '≥15 m', 'Menos de 15 m', 'bastón, andador, órtesis o prótesis', '50-74%']
  .forEach(t => eq('  marcha · «' + t + '»', marcha.includes(t), true));
eq('★ la marcha NO usa la escala de los otros cuatro (no habla de porcentaje ≤25%)',
  marcha.includes('realiza ≤25%'), false);

/* ══ 3 · LAS REGLAS DE PUNTUACIÓN, A LA VISTA ═══════════════════════════ */
console.log('\n3 · Las reglas que decidían mal cuando no estaban escritas');
[['se puntúa la sesión, no lo visto antes', 'en esta sesión'],
 ['la asistencia del evaluador no cuenta', 'no cuenta como asistencia física'],
 ['tecle o grúa por debilidad = 0', 'con tecle o grúa por debilidad'],
 ['marcha sin descanso sentado', 'sin descanso sentado'],
 ['silla de ruedas: máximo 6', 'En silla de ruedas el máximo es'],
 ['la no realizada por otra razón NO se puntúa', 'no se puntúa'],
 ['hasta 2 → promedio de las realizadas', 'promedio de las realizadas'],
 ['más de 2 → el total no se puede calcular', 'el total no se puede calcular'],
].forEach(([l, t]) => eq('  ' + l, idx.includes(t), true));

/* ══ 4 · MRC: UNA SOLA LEYENDA ══════════════════════════════════════════ */
console.log('\n4 · MRC: la escala va UNA vez, no doce');
eq('la leyenda existe', /Graduación MRC \(0-5\)/.test(idx), true);
['sin contracción visible ni palpable', 'sin movimiento', 'eliminando la gravedad',
 'contra gravedad', 'gravedad y resistencia', 'fuerza normal']
  .forEach(t => eq('  ' + t, idx.includes(t), true));
eq('recuerda que exige cooperación', /Requiere cooperación \(S5Q ≥3\)/.test(idx), true);
eq('…y el corte de debilidad adquirida', /total ≤48/.test(idx), true);
// Los 12 selects de MRC siguen siendo numéricos: repetir la escala doce veces
// pesaría en el index y se desincroniza al primer cambio.
const mrc1 = (idx.match(/id="fMrcD1"[\s\S]{0,400}?<\/select>/) || [''])[0];
eq('★ los casilleros de MRC siguen siendo números pelados',
  /<option>0<\/option>/.test(mrc1), true);

/* ══ 5 · EL TOTAL SIGUE EXIGIENDO LOS 5 ÍTEMS DECLARADOS ═══════════════
   (v5.95: «declarado» ahora es puntaje O «NE»; la aritmética del NE —
   promedio hasta 2, no calculable con más— la fija fss_ne.js) ═══════════ */
console.log('\n5 · La suma exige los 5 ítems declarados');
eq('sumFSS sigue sumando los 5 ítems', /const vals=\[1,2,3,4,5\]\.map\(i=>v\('fFssIt'\+i\)\);/.test(idx), true);
eq('…y sin los 5 declarados no hay total', /if\(sinDeclarar>0\)\{/.test(idx) && idx.includes("$('fFSS').value=''; interpFSS();"), true);
eq('sumMRC sigue con sus 6 movimientos por lado',
  /const d=\[1,2,3,4,5,6\]\.map\(i=>v\('fMrcD'\+i\)\)/.test(idx), true);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
