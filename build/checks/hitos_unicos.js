// hitos_unicos.js — Un hecho, un hito. Y el hito no se degrada solo.
//
// 🔴 DE DÓNDE SALE (14-ago-2026, reporte de Diego: «el ingreso en el timeline
// se duplica, una de color verde y otro color morado»). El ingreso lo
// escribían TRES sitios que no se conocían entre sí:
//
//   svc_camas.gs        · ingresarPaciente ............ hito 'ingreso'  (verde)
//   svc_evoluciones.gs  · bloque de ingreso ........... hito 'ingreso'  (verde)
//   svc_timeline.gs     · el procedimiento 'INGRESO' .. 'procedimiento' (morado)
//
// El morado venía de un nombre mal escrito: el mapa PROC_TO_HITO tenía la
// clave 'INGRESO UCI' y el formulario manda 'INGRESO', así que NUNCA calzaba y
// el ingreso caía al respaldo genérico de la v5.39. Los verdes, de que el tipo
// 'ingreso' está fuera de `_TIPOS_HITO_AUTO` —correcto: un re-guardado no debe
// borrar el ingreso— y por tanto nadie limpiaba el sobrante.
//
// Buscando eso apareció el hermano silencioso: el hito de un EVENTO RÁPIDO
// («🔧 EEG 14:00 — control post crisis (anexo) · Klgo. …») nacía con tipo
// 'procedimiento', que SÍ está en la lista auto, así que el siguiente guardado
// del turno lo borraba y lo regeneraba como «Eeg» — sin hora, sin detalle, sin
// la marca (anexo) y sin firma. Ningún error, ningún dato clínico movido: solo
// el registro diciendo menos de lo que decía.
//
// LO QUE FIJA ESTA GUARDIA
//   1 · La lista de procedimientos se deriva del FUENTE del formulario, no de
//       la memoria de quien la escribió: un procedimiento nuevo que nadie mapee
//       pone esto en rojo en vez de aparecer en la línea de tiempo sin nombre.
//   2 · El ingreso se escribe UNA vez… y la deduplicación jamás esconde el
//       ingreso de OTRO episodio (bloque 2c: la trampa de la pronación
//       heredada, que en TIMELINE es real porque la hoja no se limpia al alta).
//   3 · El hito del evento rápido sobrevive a un re-guardado, entero.
//   4 · La entrega muestra la reintubación con HORA y CAUSA, y no sacrifica un
//       evento de vía aérea por llenarse de repetitivos.
//   5 · El tiempo extubado se mide con el RELOJ, no con la fecha del turno.
//
// Uso: node build/checks/hitos_unicos.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l);
};

const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
const srcTl = fs.readFileSync(path.join(v2, 'svc_timeline.gs'), 'utf8');
const srcEv = fs.readFileSync(path.join(v2, 'svc_eventos.gs'), 'utf8');
const srcEvo = fs.readFileSync(path.join(v2, 'svc_evoluciones.gs'), 'utf8');
const srcDom = fs.readFileSync(path.join(v2, 'dominio_texto.gs'), 'utf8');

/* ══ 1 · EL MAPA SE DERIVA DEL FUENTE ════════════════════════════════════ */
console.log('\n1 · Todo procedimiento del formulario tiene nombre clínico');

// Los nombres que el cliente empuja a PROC_JSON, sacados de `_autoProcs`.
// Se descartan los que llevan un dato pegado (`PRONO ${h} HRS`): esos los
// normaliza `_procClaveHito` y su clave base ya va en la lista.
const empujados = [...idx.matchAll(/auto\.push\('([^']+)'\)/g)].map(m => m[1]);
eq('se leyeron los procedimientos del formulario', empujados.length >= 15, true);

const claves = [...srcTl.matchAll(/^\s*'([^']+)':\s*\{\s*tipo:/gm)].map(m => m[1]);
eq('la clave del ingreso es la que viaja de verdad', claves.includes('INGRESO'), true);
eq('…y la que nunca calzó ya no está', claves.includes('INGRESO UCI'), false);

const huerfanos = empujados.filter(p => !claves.includes(p));
eq('ningún procedimiento cae al cajón genérico', huerfanos.join(', ') || 'ninguno', 'ninguno');

// La recanulación es vía aérea, no «un procedimiento»: se lee con el color y
// el ícono de las transiciones, que es lo que uno busca en el historial.
const tipoDe = n => {
  const m = srcTl.match(new RegExp("'" + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':\\s*\\{\\s*tipo:\\s*'([a-z_]+)'"));
  return m ? m[1] : '(sin mapa)';
};
eq('RECANULACIÓN es vía aérea', tipoDe('RECANULACIÓN'), 'via_aerea');
eq('INGRESO es ingreso', tipoDe('INGRESO'), 'ingreso');

/* ── Los tipos que sobreviven a un re-guardado ── */
const auto = (srcTl.match(/_TIPOS_HITO_AUTO\s*=\s*\[([^\]]+)\]/) || [, ''])[1];
['ingreso', 'egreso', 'cultivo', 'evento', 'anexo'].forEach(t =>
  eq("  '" + t + "' queda FUERA de los tipos que se regeneran", auto.includes("'" + t + "'"), false));
['via_aerea', 'procedimiento', 'kine', 'general'].forEach(t =>
  eq("  '" + t + "' sí se regenera", auto.includes("'" + t + "'"), true));

/* ── Y el cliente sabe pintar todos los tipos que el servidor emite ── */
const tiposEmitidos = [...new Set(claves.map(tipoDe).concat(['ingreso', 'egreso', 'anexo', 'cultivo', 'evento']))];
const dot = (idx.match(/const DOT_COLORS = \{[\s\S]{0,320}?\};/) || [''])[0];
eq('el cliente define su paleta de hitos', dot !== '', true);
// 'anexo', 'cultivo' y 'evento' comparten a propósito el celeste de 'general'
// (son anotaciones, no transiciones); los demás necesitan su color.
['ingreso', 'egreso', 'procedimiento', 'via_aerea', 'kine'].forEach(t =>
  eq('  ' + t + ' tiene color propio', new RegExp(t + '\\s*:').test(dot), true));
eq('control: los tipos emitidos son los esperados', tiposEmitidos.length >= 6, true);

/* ══ 2 · COMPORTAMIENTO DE LA LÍNEA DE TIEMPO ════════════════════════════ */
console.log('\n2 · Un ingreso, un hito');

let DB = {};
global.repoLeerTodosConFila = h => (DB[h] || []).map((o, i) => ({ obj: o, fila: i + 2 }));
global.repoEliminarFilas = (h, filas) => {
  const set = new Set(filas);
  DB[h] = (DB[h] || []).filter((o, i) => !set.has(i + 2));
};
global.repoInsertarVarios = (h, os) => { (os || []).forEach(o => (DB[h] = DB[h] || []).push(Object.assign({}, o))); };
global.repoActualizar = () => {};
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.ok = d => ({ ok: true, data: d });
global.err = m => ({ ok: false, error: m });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global.conLock = fn => fn();
global.Logger = { log: () => {} };
global.SpreadsheetApp = { flush: () => {} };
global.repoLeerTodos = (h, c, v) => {
  let f = (DB[h] || []).map(r => Object.assign({}, r));
  if (c !== undefined) f = f.filter(r => String(r[c]) === String(v));
  return f;
};
global._statISO = f => String(f || '').slice(0, 10);
global._tz = () => 'America/Santiago';
// 🪤 `Utilities` NO es opcional en este arnés: `_restarDias` lo usa y su
// try/catch devuelve la fecha SIN TOCAR cuando falla, así que sin este stub el
// corrimiento del turno Noche desaparece en silencio y los asserts de horas
// pasan a dar el resultado equivocado con cara de correcto.
const _dosD = n => String(n).padStart(2, '0');
global.Utilities = {
  getUuid: () => 'uuid',
  formatDate: (d, tz, f) => {
    const ymd = d.getFullYear() + '-' + _dosD(d.getMonth() + 1) + '-' + _dosD(d.getDate());
    const hm = _dosD(d.getHours()) + ':' + _dosD(d.getMinutes());
    return String(f).indexOf('HH') > -1 ? ymd + ' ' + hm + ':00' : ymd;
  },
};

(0, eval)([srcTl, fs.readFileSync(path.join(v2, 'infra_fechas.gs'), 'utf8')].join('\n;\n'));

// Después del eval: infra_fechas define las suyas contra Utilities/_tz, y aquí
// hacen falta deterministas (el mismo patrón de las otras guardias).
let _n = 0;
global.uid = p => p + '_' + (++_n);
global.ahoraTS = () => '2026-08-14 10:00:00';

const hitos = (cama, tipo) => (DB.TIMELINE || [])
  .filter(h => String(h.ID_CAMA) === String(cama) && (!tipo || h.TIPO === tipo));

// (a) El día del ingreso disparan los TRES autores a la vez.
DB = { TIMELINE: [
  // el que escribe `ingresarPaciente` al abrir la cama
  { ID_HITO: 'H0', ID_CAMA: '7', PATIENT_ID: 'pA', FECHA: '2026-08-12', TURNO: 'Dia',
    TIPO: 'ingreso', TEXTO: 'Ingreso a UCI. Dx: HSA', TIMESTAMP: '2026-08-12 09:00:00' },
] };
_timelineDelGuardado('7', '2026-08-12', 'Dia',
  ['INGRESO', 'INTUBACIÓN'],                       // lo que manda el formulario
  'Klgo. Diego Melo', 'd@x.cl', 'pA',
  [{ tipo: 'ingreso', texto: 'Ingreso UCI. Dx: HSA' }]);   // el de guardarEvolucion
eq('con los tres autores queda UN solo hito de ingreso', hitos('7', 'ingreso').length, 1);
eq('…y es el primero que se escribió, no el último', hitos('7', 'ingreso')[0].TEXTO, 'Ingreso a UCI. Dx: HSA');
eq('la intubación del mismo turno sí entra', hitos('7', 'via_aerea').length, 1);
eq('…y ningún ingreso se coló como procedimiento', hitos('7', 'procedimiento').length, 0);

// (b) Re-guardar el turno no agrega otro.
_timelineDelGuardado('7', '2026-08-12', 'Dia', ['INGRESO', 'INTUBACIÓN'],
  'Klgo. Diego Melo', 'd@x.cl', 'pA', [{ tipo: 'ingreso', texto: 'Ingreso UCI. Dx: HSA' }]);
eq('re-guardar no agrega un segundo ingreso', hitos('7', 'ingreso').length, 1);
eq('…y la intubación tampoco se duplica', hitos('7', 'via_aerea').length, 1);

// (c) ★ CONTROL: el ingreso del ocupante ANTERIOR no puede tapar el nuevo.
// TIMELINE no se limpia al dar el alta (va con el cierre anual), así que la
// cama arrastra los hitos del paciente que se fue. Si la deduplicación mirara
// solo la cama, el paciente nuevo se quedaría SIN su ingreso — que es la misma
// trampa de la pronación heredada, y peor: acá borraría un hecho.
DB = { TIMELINE: [
  { ID_HITO: 'H0', ID_CAMA: '7', PATIENT_ID: 'pVIEJO', FECHA: '2026-07-01', TURNO: 'Dia',
    TIPO: 'ingreso', TEXTO: 'Ingreso a UCI. Dx: otro paciente', TIMESTAMP: '2026-07-01 09:00:00' },
] };
_timelineDelGuardado('7', '2026-08-12', 'Dia', ['INGRESO'], 'Klgo. Diego Melo', 'd@x.cl', 'pNUEVO', []);
eq('★ el paciente nuevo recibe SU ingreso pese al del anterior', hitos('7', 'ingreso').length, 2);
eq('★ …y el del anterior sigue intacto',
  hitos('7', 'ingreso').filter(h => h.PATIENT_ID === 'pVIEJO').length, 1);

// (d) Sin PATIENT_ID (episodio anónimo): solo se evita el duplicado del MISMO
// día, nunca se esconde un ingreso de otra fecha.
DB = { TIMELINE: [
  { ID_HITO: 'H0', ID_CAMA: '9', PATIENT_ID: '', FECHA: '2026-06-02', TURNO: 'Dia',
    TIPO: 'ingreso', TEXTO: 'Ingreso viejo', TIMESTAMP: '2026-06-02 09:00:00' },
] };
_timelineDelGuardado('9', '2026-08-12', 'Dia', ['INGRESO'], 'K', 'd@x.cl', '', []);
eq('sin pid, un ingreso de otra fecha no bloquea el de hoy', hitos('9', 'ingreso').length, 2);

/* ══ 3 · EL EVENTO RÁPIDO NO SE DEGRADA ══════════════════════════════════ */
console.log('\n3 · El hito del evento rápido sobrevive entero');

eq('el evento rápido usa el prefijo compartido', /_hitoAnexoPrefijo\(nombreProc\)/.test(srcEv), true);
eq('…y le da tipo propio al hito', /tipoHito\s*=\s*'anexo'/.test(srcEv), true);
eq('la firma ya no se corta en 15 caracteres', /firma[^\n]*slice\(0,\s*15\)/.test(srcEv), false);

// El prefijo se toma del propio código cuando existe; si no (código anterior),
// se usa el literal para que los bloques 4-6 igual corran y se pueda comprobar
// que esta guardia falla contra la versión vieja.
const PREF = typeof _hitoAnexoPrefijo === 'function' ? _hitoAnexoPrefijo('EEG') : '🔧 EEG';
const RICO = PREF + ' 14:00 — control post crisis (anexo) · Klgo. Diego Melo';
DB = { TIMELINE: [
  { ID_HITO: 'H1', ID_CAMA: '4', PATIENT_ID: 'pB', FECHA: '2026-08-12', TURNO: 'Dia',
    TIPO: 'anexo', TEXTO: RICO, AUTOR: 'Klgo. Diego Melo', TIMESTAMP: '2026-08-12 14:05:00' },
] };
// El anexo también sumó su procedimiento a PROC_JSON, así que el re-guardado
// lo ve en la lista: ahí es donde antes le escribía encima.
_timelineDelGuardado('4', '2026-08-12', 'Dia', ['EEG', 'IMT'], 'Klgo. Diego Melo', 'd@x.cl', 'pB', []);
const anexos = hitos('4', 'anexo');
eq('el hito del anexo sigue vivo', anexos.length, 1);
eq('…con su hora, su detalle y su firma', anexos[0].TEXTO, RICO);
eq('…y NO se le sumó una etiqueta pelada al lado',
  hitos('4').filter(h => h.TEXTO === 'Eeg' || h.TEXTO === 'EEG').length, 0);
eq('el otro procedimiento del turno sí genera el suyo', hitos('4', 'kine').length, 1);

// Dos anexos del mismo procedimiento en el turno descuentan dos.
DB = { TIMELINE: [
  { ID_HITO: 'H1', ID_CAMA: '4', PATIENT_ID: 'pB', FECHA: '2026-08-12', TURNO: 'Dia',
    TIPO: 'anexo', TEXTO: PREF + ' 08:00 (anexo)', TIMESTAMP: '1' },
  { ID_HITO: 'H2', ID_CAMA: '4', PATIENT_ID: 'pB', FECHA: '2026-08-12', TURNO: 'Dia',
    TIPO: 'anexo', TEXTO: PREF + ' 20:00 (anexo)', TIMESTAMP: '2' },
] };
_timelineDelGuardado('4', '2026-08-12', 'Dia', ['EEG', 'EEG'], 'K', 'd@x.cl', 'pB', []);
eq('dos anexos iguales descuentan dos procedimientos', hitos('4').length, 2);

/* ══ 4 · LA ENTREGA ══════════════════════════════════════════════════════ */
console.log('\n4 · Reintubación con hora y causa · la vía aérea no se recorta');

// Un episodio largo: la reintubación del día 1 y DOCE eventos repetitivos
// después. Con el corte anterior (últimos 8) la reintubación desaparecía.
const EVOS = [
  { ID_CAMA: '7', PATIENT_ID: 'p7', TURNO_KEY: '2026-08-01-Dia', FECHA: '2026-08-01', TURNO: 'Dia',
    EXT_OCURRIO: 'TRUE', EXT_HORA: '10:00', EXT_TIPO: 'protocolo',
    EXT_REINTUB: 'TRUE', REINTUB_HORA: '22:30',
    EXT_REINTUB_RAZ: 'Mal manejo de secreciones (no deglute)' },
];
for (let d = 2; d <= 13; d++) {
  EVOS.push({
    ID_CAMA: '7', PATIENT_ID: 'p7', TURNO_KEY: '2026-08-' + String(d).padStart(2, '0') + '-Dia',
    FECHA: '2026-08-' + String(d).padStart(2, '0'), TURNO: 'Dia',
    RESP_PRONO_EVENTO: 'TRUE', RESP_PRONO_HORA: '19:00',
    VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', PLAN_FIRMA_KINE: 'Klgo. Diego Melo',
  });
}
const DBE = {
  CAMAS_ESTADO: [{ ID_CAMA: '7', OCUPADA: 'TRUE', PATIENT_ID: 'p7', NOMBRE: 'Ejemplo',
    DIAGNOSTICO: 'NAC grave', FECHA_INGRESO: '2026-08-01', VIA_AEREA: 'TOT', SOPORTE: 'VM' }],
  EVOLUCIONES: EVOS, PROCEDIMIENTOS: [],
};
global.repoLeerTodos = (h, c, v) => { let f = (DBE[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoLeerFiltrado = (h, col, pred) => (DBE[h] || []).filter(r => pred(r[col]));
global.repoBuscarPorId = (h, c, id) => (DBE[h] || []).find(r => String(r[c]) === String(id)) || null;
global.leerConfig = (k, d) => d;
global.hoyISO = () => '2026-08-13';
// 🪤 Aquí NO se re-stubea `Utilities`: el stub de arriba formatea de verdad y
// pisarlo con uno que devuelve una fecha fija rompe `_restarDias` —y con él el
// corrimiento del turno Noche— tres bloques más abajo. Costó una vuelta.
(0, eval)(['svc_eventos.gs', 'svc_stats.gs', 'svc_entrega.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

const ficha = obtenerEntregaTurno(['7'], '2026-08-13', 'Dia').data.fichas[0];
const linReintub = (ficha.eventos || []).find(t => t.indexOf('Reintubación') !== -1) || '';
eq('★ la reintubación del día 1 sigue en la lista', linReintub !== '', true);
eq('…con su hora', linReintub.indexOf('22:30') !== -1, true);
eq('…y con su causa', linReintub.indexOf('mal manejo de secreciones') !== -1, true);
eq('la extubación tampoco se sacrificó',
  (ficha.eventos || []).some(t => t.indexOf('Extubación') !== -1), true);
eq('los repetitivos sí cedieron espacio',
  (ficha.eventos || []).filter(t => t.indexOf('Prono') !== -1).length < 12, true);
// El «queda con» NO va a la entrega (decisión de Diego): es del formulario.
eq('el estado posterior NO se cuela en la entrega',
  (ficha.eventos || []).some(t => /quedando en modo/.test(t)), false);

/* ══ 5 · EL TIEMPO EXTUBADO SE MIDE CON EL RELOJ ═════════════════════════ */
console.log('\n5 · Manda el reloj, no la fecha del turno');

// Se busca el CÓDIGO, no el nombre: el comentario que explica por qué se
// retiró el parche lo menciona, y debe poder seguir mencionándolo (misma
// lección que `memo_episodio.js` con el campo muerto).
const codigo = srcEvo.split('\n').filter(l => !/^\s*(\*|\/\/)/.test(l)).join('\n');
eq('el parche de las 24 h ya no está', /horas\s*\+=\s*24/.test(codigo), false);
eq('el cálculo recibe el turno', /_tiempoExtubado\(evo, idCama, fecha, turno,/.test(srcEvo), true);

// El caso exacto que estaba mal: extubación el 9 en turno Día a las 20:00 y
// reintubación a las 03:00 del turno NOCHE del 9 — que en el reloj es la
// madrugada del 10. Son 7 h. Con la fecha del turno salían 17 (y solo porque
// el parche le sumaba 24 a un negativo).
const EPI = [
  { ID_CAMA: '7', PATIENT_ID: 'p7', TURNO_KEY: '2026-08-09-Dia', FECHA: '2026-08-09',
    TURNO: 'Dia', EXT_OCURRIO: 'TRUE', EXT_HORA: '20:00' },
];
global.repoLeerTodos = (h, c, v) => { let f = EPI.slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
eval(srcEvo.match(/\/\*\*[\s\S]*?\*\/\s*function _tiempoExtubado[\s\S]*?\n\}\n/)[0]);

eq('★ reintubación de las 03:00 en turno Noche = 7 h',
  _tiempoExtubado({ PATIENT_ID: 'p7', TURNO_KEY: '2026-08-09-Noche', REINTUB_HORA: '03:00' },
    '7', '2026-08-09', 'Noche', () => EPI), '7 h');
eq('…y NO las 17 h que daba la fecha del turno',
  _tiempoExtubado({ PATIENT_ID: 'p7', TURNO_KEY: '2026-08-09-Noche', REINTUB_HORA: '03:00' },
    '7', '2026-08-09', 'Noche', () => EPI) === '17 h', false);
eq('reintubación de la tarde del mismo turno Día = 4 h',
  _tiempoExtubado({ PATIENT_ID: 'p7', TURNO_KEY: '2026-08-10-Dia', REINTUB_HORA: '00:00' },
    '7', '2026-08-10', 'Dia', () => EPI), '4 h');
eq('a los 8 días son 192 h, no un número corto',
  _tiempoExtubado({ PATIENT_ID: 'p7', TURNO_KEY: '2026-08-17-Dia', REINTUB_HORA: '20:00' },
    '7', '2026-08-17', 'Dia', () => EPI), '192 h');
eq('sin hora de reintubación NO se inventa un número',
  _tiempoExtubado({ PATIENT_ID: 'p7', TURNO_KEY: '2026-08-17-Dia' }, '7', '2026-08-17', 'Dia', () => EPI), '');
eq('sin extubación registrada tampoco',
  _tiempoExtubado({ PATIENT_ID: 'pOTRO', TURNO_KEY: '2026-08-17-Dia', REINTUB_HORA: '20:00' },
    '7', '2026-08-17', 'Dia', () => EPI), '');

/* ══ 6 · CLIENTE Y SERVIDOR NARRAN LO MISMO ═════════════════════════════ */
console.log('\n6 · El «queda con» de la reintubación también se archiva');

// El cliente lo narraba en sus TRES ramas y el servidor en NINGUNA: el colega
// leía «…con TOT N° 8.0 a 22 cm, quedando en modo ACVC» y lo archivado cortaba
// en la hora. Es el patrón de las secreciones — dos generadores de la misma
// frase que se separan— y por eso se comprueba leyendo el fuente.
['REINTUB_TOT_N', 'REINTUB_TOT_CM', 'REINTUB_MODO', 'REINTUB_PARAMS'].forEach(c =>
  eq('  el servidor lee ' + c, srcDom.includes(c), true));
eq('el servidor tiene su helper de estado posterior',
  /function _reintubEquipoTxt\(d\)/.test(srcDom), true);
// Se cuentan los USOS, no la declaración (que también calza con el nombre).
const usos = (s, re) => (s.match(re) || []).filter(x => !/function/.test(x)).length;
eq('…y lo usa en las TRES ramas de reintubación',
  usos(srcDom, /(function\s+)?_reintubEquipoTxt\(d\)/g), 3);
eq('el cliente lo sigue narrando en las suyas',
  usos(idx, /(function\s+)?_reintubEquipoTxt\(\)/g), 3);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
