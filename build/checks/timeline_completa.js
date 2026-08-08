// timeline_completa.js — TODO lo que ocurrió aparece en la línea de tiempo,
// y la fase clínica corre en paralelo (ago-2026, reporte de Diego).
//
// EL BUG: los hitos se creaban traduciendo cada procedimiento con una lista
// FIJA (PROC_TO_HITO) y lo que no estaba en ella se descartaba EN SILENCIO.
// Se perdían la asistencia en procedimiento médico, la educación al usuario,
// la evaluación intermedia, la recanulación y TODO lo que el colega agregara
// a mano del catálogo. Como la estadística cuenta filas de PROCEDIMIENTOS y
// la línea de tiempo contaba solo lo traducido, las dos NUNCA cuadraban.
//
// LA REGLA NUEVA: lo que entra a PROCEDIMIENTOS entra a TIMELINE. Los eventos
// conocidos conservan su nombre clínico; el resto entra con etiqueta genérica
// en vez de desaparecer. Así no pueden volver a discrepar, ni siquiera con
// procedimientos que se inventen después.
//
// Uso: node build/checks/timeline_completa.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const ok_ = (l, c, extra) => { console.log((c ? '✅' : '❌') + ' ' + l + (extra !== undefined ? ': ' + JSON.stringify(extra) : '')); if (!c) fails.push(l); };

/* ══ 1 · SERVICIO: ningún procedimiento se pierde ═══════════════════════ */
console.log('\n1 · Ningún procedimiento se pierde por el camino');
const HITOS = [];
global.repoLeerTodos = () => [];
global.repoInsertar = (h, o) => { if (h === 'TIMELINE') HITOS.push(o); return o; };
global.repoEliminarDonde = () => {};
// Ola 4: los hitos del guardado nacen juntos y viajan juntos en un lote.
global.repoLeerTodosConFila = () => [];
global.repoEliminarFilas = () => 0;
global.repoInsertarVarios = (h, os) => { (os || []).forEach(o => { if (h === 'TIMELINE') HITOS.push(o); }); return (os || []).length; };
global.repoActualizar = () => true;
global.repoBuscarPorId = () => null;
global.esVerdadero = v => v === true || v === 'TRUE';
global.uid = p => p + '_' + HITOS.length;
global.hoyISO = () => '2026-08-03';
global.ahoraTS = () => '2026-08-03 16:00:00';
global._tz = () => 'America/Santiago';
global.Utilities = { getUuid: () => 'u' + HITOS.length, formatDate: () => '2026-08-03' };
global.SpreadsheetApp = { flush: () => {} };
global.ok = d => ({ ok: true, data: d });
global.err = m => ({ ok: false, error: m });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
eval(['infra_fechas.gs', 'svc_timeline.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

// Mezcla real: eventos con nombre clínico propio + los que ANTES se perdían.
const PROCS = [
  'INTUBACIÓN',                          // conocido
  'PRONO 19:00 HRS',                     // conocido, con la hora pegada
  'RCP 3 CICLOS',                        // conocido, con los ciclos pegados
  'ASISTENCIA EN PROCEDIMIENTO MÉDICO',  // ← antes DESAPARECÍA
  'EDUCACIÓN A USUARIO/FAMILIA',         // ← antes DESAPARECÍA
  'EVALUACIÓN INTERMEDIA',               // ← antes DESAPARECÍA
  'RECANULACIÓN',                        // ← antes DESAPARECÍA
  'PCR COVID',                           // ← antes DESAPARECÍA (sigla)
  'ASPIRACIÓN SUBGLÓTICA',               // ← inventado: cualquiera futuro
];
_timelineDelGuardado('4', '2026-08-03', 'Dia', PROCS, 'DMV', 'x@y', 'pid4', []);

ok_('se crea UN hito por CADA procedimiento — ninguno se pierde',
  HITOS.length === PROCS.length, HITOS.length + '/' + PROCS.length);

const textos = HITOS.map(h => String(h.TEXTO));
ok_('los conocidos conservan su nombre clínico',
  textos.some(t => /Intubación orotraqueal/.test(t)) &&
  textos.some(t => /Decúbito prono/.test(t)) &&
  textos.some(t => /Reanimación cardiopulmonar/.test(t)));
ok_('la asistencia en procedimiento médico YA aparece',
  textos.some(t => /Asistencia en procedimiento médico/i.test(t)));
ok_('la educación al usuario también', textos.some(t => /Educación a usuario/i.test(t)));
ok_('la recanulación también', textos.some(t => /Recanulación/i.test(t)));
ok_('y uno inventado que nadie mapeó nunca',
  textos.some(t => /Aspiración subglótica/i.test(t)));
ok_('las SIGLAS no se destrozan al dar formato',
  textos.some(t => /PCR COVID/.test(t)), textos.find(t => /PCR/i.test(t)));
ok_('ningún hito queda con texto vacío', textos.every(t => t.trim() !== ''));

// Un procedimiento vacío no debe generar una fila fantasma.
HITOS.length = 0;
_timelineDelGuardado('4', '2026-08-03', 'Dia', ['', '   ', 'ECOGRAFÍA'], 'DMV', 'x@y', 'pid4', []);
ok_('los procedimientos vacíos NO generan hitos', HITOS.length === 1, HITOS.length);

/* ══ 2 · CLIENTE: el riel los muestra + banda de fase ═══════════════════ */
console.log('\n2 · El riel muestra todo y la fase corre en paralelo');
const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');

ok_('el riel se alimenta también de TIMELINE, no solo de la evolución',
  /TL_HITOS\|\|\[\]\)\.filter\(x=>\['procedimiento','kine','general','nota'\]/.test(idx));
ok_('…y excluye los de vía aérea para no duplicarlos',
  /esos ya vienen[\s\S]{0,120}duplicados/.test(idx));
ok_('los hitos del riel se ordenan por fecha', /hk\.sort\(\(a,b\)=>String\(a\.fecha\)/.test(idx));
ok_('existe la banda de fase clínica', /function _tlBandaFase/.test(idx));
ok_('…y se dibuja bajo el riel', /h\+=_tlBandaFase\(evos\);/.test(idx));
ok_('los turnos consecutivos con la misma fase se agrupan en un tramo',
  /if\(ult&&ult\.fase===f\)\{ ult\.n\+\+;/.test(idx));
ok_('el ancho del tramo es proporcional a su duración', /flex:\$\{t\.n\}/.test(idx));
ok_('la banda tiene estilos propios', /\.tlr-fase-t\{flex:1/.test(idx));
ok_('sin fases registradas la banda no se dibuja', /if\(!tramos\.length\) return '';/.test(idx));

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ timeline_completa OK');
process.exit(fails.length ? 1 : 0);
