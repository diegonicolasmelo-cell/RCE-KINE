// orden_neuro_en_plantillas.js — EL BLOQUE SEDOANALGESIA/GCS/HEMODINAMIA VUELVE
// ARRIBA (7-sep-2026, reporte de Manuel desde el turno).
//
// QUÉ PASÓ. Hasta v6.01 el orden del texto de la evolución lo ponía UN solo
// motor: genTexto() en el cliente (y su espejo generarTextoEvolucion() en
// dominio_texto.gs). Ahí sedoanalgesia, GCS, hemodinamia y neurológico van
// INMEDIATAMENTE después del día y la fase clínica — antes de la vía aérea.
// v6.02 metió las PLANTILLAS DE EVOLUCIÓN y con ellas una segunda fuente de
// orden: cuando hay plantilla activa, _textoSalida() ya no llama al motor para
// ordenar, sino que rellena el CUERPO de la plantilla. Y la plantilla de la
// UNIDAD se aplica SOLA (_plantGanadora cae a unidad·general), así que el turno
// entero pasó a leer el orden de la plantilla sin haber elegido nada.
// Las 17 semillas ponían ese bloque DEBAJO de vía aérea, soporte, parámetros y
// —en 14 de ellas— también de secreciones. Como _plantRellenar() descarta las
// líneas cuyos comodines vienen vacíos, en un turno tranquilo el bloque quedaba
// como PENÚLTIMA línea, justo encima de «Plan:». Eso fue lo que Manuel leyó.
//
// 🪤 LA MISMA REGLA VIVE EN DOS SITIOS. El orden del texto está en el motor
// (genTexto/_B) Y en el cuerpo de cada plantilla. Tocar uno sin el otro deja
// dos evoluciones de la misma unidad con distinto orden. Es el mismo desfase
// que v6.11 arregló para la intubación («salía al final, después de los gases»).
//
// LA PROPIEDAD QUE FIJA ESTA GUARDIA — no la lista de semillas que vi hoy:
//   En toda plantilla de la unidad que nombre el bloque neuro-hemodinámico,
//   ese bloque aparece ANTES que cualquier comodín cuyo bloque el MOTOR narre
//   después. El orden canónico NO está escrito a mano aquí: se extrae de las
//   marcas _B() de genTexto() en v2/index.html, así que si el motor cambia de
//   orden, esta guardia cambia con él y no se queda mintiendo.
//
// Uso: node build/checks/orden_neuro_en_plantillas.js  (sin navegador)
const fs = require('fs');
const path = require('path');

const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g));
  if (!okk) fails.push(l);
};

const v2 = (f) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'v2', f), 'utf8');
const IDX = v2('index.html');
const SRV = v2('svc_plantillas.gs');

/* ── 1 · El orden CANÓNICO, leído del motor de verdad ────────────────────── */
// Las marcas _B('x') dentro de genTexto() son, en orden de aparición, el orden
// en que el motor narra los bloques.
const gi = IDX.indexOf('\nfunction genTexto() {');
const gf = IDX.indexOf('\n}\n', gi);
eq('genTexto() se encuentra en el index', gi > 0 && gf > gi, true);
const cuerpoMotor = IDX.slice(gi, gf);
const ORDEN = [];
for (const m of cuerpoMotor.matchAll(/_B\('([a-zA-Z]+)'\)/g)) {
  if (!ORDEN.includes(m[1])) ORDEN.push(m[1]);
}
eq('el motor etiqueta bloques suficientes para ordenar', ORDEN.length > 20, true);
eq('el encabezado sigue abriendo el texto del motor', ORDEN[0], 'enc');
eq('el plan sigue cerrándolo', ORDEN[ORDEN.length - 1], 'plan');

/* ── 2 · El mapa comodín → bloques del motor (PLANT_ALIAS del cliente) ───── */
const ai = IDX.indexOf('const PLANT_ALIAS={');
const af = IDX.indexOf('};', ai) + 2;
const PLANT_ALIAS = new Function(IDX.slice(ai, af) + '\nreturn PLANT_ALIAS;')();
eq('PLANT_ALIAS se lee del index', Object.keys(PLANT_ALIAS).length > 25, true);

// Posición canónica de un comodín = la del PRIMER bloque suyo que narra el motor.
const pos = (com) => {
  const ks = PLANT_ALIAS[com] || [];
  const is = ks.map(k => ORDEN.indexOf(k)).filter(i => i >= 0);
  return is.length ? Math.min(...is) : -1;   // -1 = comodín por DATO, sin posición
};

const GRUPO = ['sedacion', 'hemodinamia', 'neurologico'];
GRUPO.forEach(c => eq('el motor narra el bloque de ' + c, pos(c) >= 0, true));
// La premisa del arreglo: el motor pone este bloque arriba, antes de la vía aérea.
eq('★ en el motor, sedoanalgesia va ANTES que la vía aérea', pos('sedacion') < pos('via_aerea'), true);
eq('★ …y antes que el soporte, los parámetros y las secreciones',
  pos('sedacion') < Math.min(pos('soporte'), pos('parametros'), pos('secreciones')), true);

/* ── 3 · Las semillas de la unidad ───────────────────────────────────────── */
const si = SRV.indexOf('const PLANTILLAS_UNIDAD_SEMILLA');
const sf = SRV.indexOf('\n];', si) + 3;
const PLANTILLAS_UNIDAD_SEMILLA =
  new Function(SRV.slice(si, sf) + '\nreturn PLANTILLAS_UNIDAD_SEMILLA;')();
eq('las semillas de la unidad se leen del servidor', PLANTILLAS_UNIDAD_SEMILLA.length > 10, true);

// La propiedad, aplicada a cualquier cuerpo de plantilla.
const adelantados = (cuerpo) => {
  const orden = [];
  for (const m of String(cuerpo).matchAll(/\{([a-z0-9_]+)\}/g)) orden.push(m[1]);
  const iG = orden.findIndex(c => GRUPO.includes(c));
  if (iG < 0) return null;                       // no nombra el bloque: no aplica
  const pG = Math.min(...GRUPO.filter(c => orden.includes(c)).map(pos));
  return orden.slice(0, iG)
    .filter(c => pos(c) >= 0 && pos(c) > pG)     // solo comodines de BLOQUE
    .filter((c, i, a) => a.indexOf(c) === i);
};

let conBloque = 0;
const rotas = [];
PLANTILLAS_UNIDAD_SEMILLA.forEach(([caso, , cuerpo]) => {
  const ad = adelantados(cuerpo);
  if (ad === null) return;
  conBloque++;
  if (ad.length) rotas.push(caso + ' ← ' + ad.join(','));
});
eq('la mayoría de las semillas narra el bloque neuro-hemodinámico', conBloque >= 10, true);
eq('★ ninguna semilla de la unidad lo baja por debajo de un bloque posterior',
  rotas.join(' | ') || 'ninguna rota', 'ninguna rota');

// Y explícitamente lo que Manuel leyó en el turno: nunca pegado al Plan.
const pegadasAlPlan = PLANTILLAS_UNIDAD_SEMILLA.filter(([, , c]) => {
  const filas = String(c).split('\n');
  const i = filas.findIndex(f => GRUPO.some(g => f.includes('{' + g + '}')));
  return i >= 0 && i >= filas.length - 2;        // última o penúltima fila
}).map(t => t[0]);
eq('★ el bloque no queda como última ni penúltima línea de ninguna semilla',
  pegadasAlPlan.join(',') || 'ninguna', 'ninguna');

/* ── 4 · La guardia mide de verdad: el orden viejo TIENE que caer ─────────── */
// (❌ simulado a propósito — no suma a las fallas.)
const VIEJO = '{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{nota}\nPlan: {plan}';
const detectadas = adelantados(VIEJO) || [];
console.log((detectadas.length ? '✅' : '❌') +
  ' [prueba de la propia guardia] el orden previo a este arreglo se detecta: ' +
  JSON.stringify(detectadas));
if (!detectadas.length) fails.push('la guardia no detecta el orden viejo');
// …y el orden nuevo tiene que pasar limpio.
const NUEVO = '{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{nota}\nPlan: {plan}';
eq('[prueba de la propia guardia] el orden corregido pasa limpio',
  (adelantados(NUEVO) || []).join(',') || 'sin adelantados', 'sin adelantados');

/* ── 5 · Cierre ──────────────────────────────────────────────────────────── */
console.log(fails.length ? '\n❌ FALLA: ' + fails.join(' · ') : '\n✅ Todo en orden.');
process.exit(fails.length ? 1 : 0);
