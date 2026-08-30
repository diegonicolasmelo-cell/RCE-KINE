// prono_desde_el_mas.js — EL PRONO ANEXADO CON EL ➕ TIENE QUE CONTAR SUS HORAS.
//
// 🔴 DE DÓNDE SALE (30-ago-2026, Manuel desde el turno): anexó «Decúbito prono»
// a las 20:03 en la cama 8 desde el Registro Diario, y 24 horas después la app
// no le decía ni una hora de prono, ni el Posicionamiento del historial lo
// mostraba. El dato clínico estaba escrito —fila en PROCEDIMIENTOS y hito en la
// línea de tiempo— y aun así el reloj de la pronación nunca arrancó.
//
// La causa: el ciclo de prono NO vive en PROCEDIMIENTOS. Vive en cuatro campos
// de la evolución (RESP_POS_PRONO, RESP_PRONO_EVENTO, RESP_PRONO_HORA,
// PRONO_INICIO_TS) que son los que leen `_pronoAbiertoTS` —«lleva X horas en
// prono»— y la columna Posicionamiento del historial. `anexarEventoRapido` no
// tocaba ninguno: el catálogo del ➕ ofrecía una puerta que no conectaba con el
// reloj. Clínicamente eso decide mal cuándo supinar, que es la decisión que el
// número existe para tomar.
//
// Lo que esta guardia fija:
//  1. El caso de Manuel, completo: anexar el prono con su hora sella el ciclo,
//     el turno siguiente ve la pronación abierta y el historial la pinta.
//  2. La otra mitad: anexar el supino CIERRA el ciclo y sella las horas, aunque
//     el prono lo haya puesto otro colega en otro turno (un ciclo dura días).
//  3. UN ciclo = UN evento: prono+supino anexados dejan UNA fila en
//     PROCEDIMIENTOS, no dos. (Antes el ➕ insertaba las dos, así que anexar el
//     ciclo completo contaba dos pronaciones donde hubo una.)
//  4. El nombre canónico es el MISMO que arma `_autoProcs()` en el front —se lee
//     del index.html, no se memoriza— para que el `Set` del guardado deduplique
//     y la misma pronación no entre dos veces a la estadística.
//  5. No se pisa lo ya declarado en el turno.
//  6. Anular el anexo del prono APAGA su reloj: si no, el botón de deshacer
//     dejaría una pronación abierta que nadie declaró — la familia de la
//     pronación heredada (ver prono_paciente.js).
//  7. Un procedimiento que no es de posición (ECOGRAFÍA) sigue exactamente igual.
//
// Uso: node build/checks/prono_desde_el_mas.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

/* ── Arnés (mismo patrón de candado_mas.js: dos hojas y número de fila) ───── */
const FILA = 4;
let DB, HITOS;
const reset = () => {
  DB = {
    EVOLUCIONES: [
      // La cama 8 de Manuel: turno Día del 29, con su evolución ya guardada.
      { ID_EVOLUCION: 'CAMA_8_2026-08-29-Dia', ID_CAMA: '8', PATIENT_ID: 'pM',
        TURNO_KEY: '2026-08-29-Dia', FECHA: '2026-08-29', TURNO: 'Dia',
        PROC_JSON: '[]', PROC_CANTIDAD: 0, PROC_RESUMEN: '' },
      // El turno siguiente, el que tendrá que supinar.
      { ID_EVOLUCION: 'CAMA_8_2026-08-30-Dia', ID_CAMA: '8', PATIENT_ID: 'pM',
        TURNO_KEY: '2026-08-30-Dia', FECHA: '2026-08-30', TURNO: 'Dia',
        PROC_JSON: '[]', PROC_CANTIDAD: 0, PROC_RESUMEN: '' },
    ],
    EVOLUCIONES_ARCHIVO: [],
    CAMAS_ESTADO: [{ ID_CAMA: '8', OCUPADA: true, PATIENT_ID: 'pM', DISP_CONFIRMADO: true }],
    PROCEDIMIENTOS: [],
    TIMELINE: [],
  };
  HITOS = [];
};
reset();
const filasDe = h => (DB[h] || []).map((r, i) => ({ obj: Object.assign({}, r), fila: FILA + i }));
global.repoLeerTodosConFila = h => filasDe(h);
global.repoLeerFila = (h, f) => Object.assign({}, (DB[h] || [])[f - FILA]);
global.repoEscribirFila = (h, f, obj) => { DB[h][f - FILA] = Object.assign({}, obj); };
global.repoUpsertEnFila = (h, f, obj) => { if (f === -1) { DB[h].push(obj); return 'crear'; } DB[h][f - FILA] = Object.assign({}, obj); return 'actualizar'; };
global.repoBuscarPorId = (h, campo, id) => (DB[h] || []).find(r => String(r[campo]) === String(id)) || null;
global.repoActualizar = (h, campo, id, cambios) => { const r = global.repoBuscarPorId(h, campo, id); if (r) Object.assign(r, cambios); return !!r; };
global.repoLeerTodos = (h, k, v) => (DB[h] || []).filter(r => k === undefined || String(r[k]) === String(v)).map(r => Object.assign({}, r));
global.repoInsertar = (h, obj) => { (DB[h] = DB[h] || []).push(obj); return obj; };
global.repoEliminarFilas = (h, filas) => { filas.slice().sort((a, b) => b - a).forEach(f => DB[h].splice(f - FILA, 1)); return filas.length; };
global.repoEliminarDonde = (h, pred) => { const antes = DB[h].length; DB[h] = DB[h].filter(r => !pred(r)); return antes - DB[h].length; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.conLock = fn => fn();
global.uid = p => p + '_' + (DB.PROCEDIMIENTOS.length + DB.TIMELINE.length);
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE', NO_AUTORIZADO: 'NA' };
global.Logger = { log: () => {} };
global.SpreadsheetApp = { flush: () => {} };
global.Session = { getScriptTimeZone: () => 'America/Santiago' };
global._tz = () => 'America/Santiago';
global._statISO = v => String(v || '').slice(0, 10);
global.Utilities = { getUuid: () => 'uuid', formatDate: (d, tz, fmt) => {
  const p = n => String(n).padStart(2, '0');
  const iso = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  return String(fmt).indexOf('HH') >= 0 ? iso + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) : iso; } };
global.auditar = () => {};
global.coordExigirSesion = () => ({ ok: true, firma: 'MCC', usuario: 'coord' });

eval(fs.readFileSync(path.join(v2, 'infra_fechas.gs'), 'utf8'));
eval(fs.readFileSync(path.join(v2, 'svc_timeline.gs'), 'utf8'));
eval(fs.readFileSync(path.join(v2, 'svc_evoluciones.gs'), 'utf8'));
eval(fs.readFileSync(path.join(v2, 'svc_eventos.gs'), 'utf8'));
/* 🪤 Reasignando la LIGADURA, no global.*: el eval directo declara en el ámbito
   del módulo y un `global.x = …` queda sombreado (ver candado_mas.js). */
hoyISO = () => '2026-08-29';                              // eslint-disable-line no-global-assign
ahoraTS = () => '2026-08-29 20:05';                       // eslint-disable-line no-global-assign
_sincronizarTimelineCama = () => {};                      // eslint-disable-line no-global-assign
_agregarHitoInterno = h => {                              // eslint-disable-line no-global-assign
  HITOS.push(h);
  DB.TIMELINE.push({ ID_HITO: 'H' + DB.TIMELINE.length, ID_CAMA: h.idCama, PATIENT_ID: h.patientId,
    FECHA: h.fecha, TURNO: h.turno, TIPO: h.tipo, TEXTO: h.texto, TIMESTAMP: ahoraTS() });
};
_agregarHitoInternoSinSync = _agregarHitoInterno;          // eslint-disable-line no-global-assign
global.hoyISO = hoyISO; global.ahoraTS = ahoraTS;

const CTX = { firma: 'Klgo. Manuel', email: 'kine@hospital.cl' };
const anexar = (extra) => anexarEventoRapido(Object.assign({
  idCama: '8', patientId: 'pM', turnoKey: '2026-08-29-Dia', tipo: 'procedimiento',
}, extra), CTX);
const evoDe = tk => DB.EVOLUCIONES.find(e => e.TURNO_KEY === tk);

/* ══ 1 · EL CASO DE MANUEL: el prono anexado arranca el reloj ═════════════ */
console.log('\n1 · Cama 8, «Decúbito prono» 20:03 desde el ➕ del Registro');
let r = anexar({ proc: 'PRONO', hora: '20:03' });
si('★ el anexo entra', r.ok);
let evo = evoDe('2026-08-29-Dia');
si('★ queda declarada la pronación del turno (RESP_PRONO_EVENTO)', esVerdadero(evo.RESP_PRONO_EVENTO));
eq('★ con SU hora, la que se escribió en el ➕', evo.RESP_PRONO_HORA, '20:03');
eq('★ y el sello con fecha real, que es lo que cuenta las horas', evo.PRONO_INICIO_TS, '2026-08-29 20:03');
si('★ el historial tiene qué pintar en Posicionamiento (RESP_POS_PRONO)', esVerdadero(evo.RESP_POS_PRONO));
eq('24 h después, el turno siguiente ve la pronación ABIERTA',
  _pronoAbiertoTS('8', '2026-08-30-Dia'), '2026-08-29 20:03');

/* ══ 2 · La otra mitad: el supino anexado CIERRA el ciclo ═════════════════ */
console.log('\n2 · Al día siguiente otro colega anexa el supino a las 08:00');
ahoraTS = () => '2026-08-30 08:05';                        // eslint-disable-line no-global-assign
hoyISO = () => '2026-08-30';                               // eslint-disable-line no-global-assign
r = anexarEventoRapido({ idCama: '8', patientId: 'pM', turnoKey: '2026-08-30-Dia',
  tipo: 'procedimiento', proc: 'SUPINO', hora: '08:00' }, { firma: 'Klga. Otra', email: 'o@h.cl' });
si('★ el anexo del supino entra', r.ok);
const evoSup = evoDe('2026-08-30-Dia');
eq('★ y SELLA las horas del ciclo completo (29 a las 20:03 → 30 a las 08:00)', evoSup.PRONO_HORAS, 12);
eq('el momento del supino queda con fecha real', evoSup.SUPINO_TS, '2026-08-30 08:00');
si('el paciente ya no figura en prono', !esVerdadero(evoSup.RESP_POS_PRONO) && esVerdadero(evoSup.RESP_POS_SUPINO));
eq('y el ciclo queda cerrado para el turno que viene', _pronoAbiertoTS('8', '2026-08-31-Dia'), '');

/* ══ 3 · UN ciclo = UN evento en la estadística ═══════════════════════════ */
console.log('\n3 · El ciclo completo no puede contarse dos veces');
eq('★ prono + supino anexados dejan UNA fila en PROCEDIMIENTOS', DB.PROCEDIMIENTOS.length, 1);
eq('…y es la del prono', String(DB.PROCEDIMIENTOS[0].NOMBRE_PROC).indexOf('PRONO'), 0);
si('la línea de tiempo sí narra las dos maniobras', DB.TIMELINE.length === 2);

/* ══ 4 · El nombre es el MISMO que arma el formulario ═════════════════════ */
console.log('\n4 · Mismo nombre que `_autoProcs()` del front (leído, no memorizado)');
const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
const bloque = idx.slice(idx.indexOf('function _autoProcs()'), idx.indexOf('function _autoProcs()') + 2500);
const plantillas = [...bloque.matchAll(/auto\.push\(h\?`([^`]+)`:'([^']+)'\)/g)].map(m => ({ con: m[1], sin: m[2] }));
eq('el front declara sus dos formas (prono y supino)', plantillas.length, 2);
const frontPRONO = (plantillas[0] || {}).con ? plantillas[0].con.replace('${h}', '20:03') : '';
// Tolera que el servidor todavía no tenga el helper: así, contra el código sin
// arreglar, la guardia LISTA sus fallas en vez de reventar en la primera.
const _nombreCiclo = (c, h) => (typeof _procNombreCiclo === 'function') ? _procNombreCiclo(c, h) : '(sin _procNombreCiclo)';
const frontSUPINO = (plantillas[1] || {}).con ? plantillas[1].con.replace('${h}', '08:00') : '';
eq('★ PRONO: servidor y front escriben lo mismo', _nombreCiclo('PRONO', '20:03'), frontPRONO);
eq('★ SUPINO: servidor y front escriben lo mismo', _nombreCiclo('SUPINO', '08:00'), frontSUPINO);
eq('sin hora, también', _nombreCiclo('PRONO', ''), (plantillas[0] || {}).sin || '');
si('★ y por eso el Set del guardado no lo cuenta dos veces',
  new Set([DB.PROCEDIMIENTOS[0].NOMBRE_PROC, frontPRONO]).size === 1);

/* ══ 5 · No se pisa lo que el turno ya declaró ════════════════════════════ */
console.log('\n5 · Un turno que ya declaró su pronación no se corrige por esta puerta');
reset();
hoyISO = () => '2026-08-29'; ahoraTS = () => '2026-08-29 20:05';   // eslint-disable-line no-global-assign
DB.EVOLUCIONES[0].RESP_PRONO_EVENTO = true;
DB.EVOLUCIONES[0].RESP_PRONO_HORA = '19:00';
DB.EVOLUCIONES[0].PRONO_INICIO_TS = '2026-08-29 19:00';
r = anexar({ proc: 'PRONO', hora: '20:03' });
eq('★ el anexo se rechaza', r.ok, false);
si('…diciendo la hora que ya está y dónde se corrige', /19:00/.test(String(r.error)) && /evoluci/i.test(String(r.error)));
eq('★ y el reloj que ya corría no se movió', DB.EVOLUCIONES[0].PRONO_INICIO_TS, '2026-08-29 19:00');
eq('…sin escribir nada en la estadística', DB.PROCEDIMIENTOS.length, 0);

/* ══ 6 · Deshacer el prono APAGA su reloj ════════════════════════════════ */
console.log('\n6 · Anular el anexo no puede dejar una pronación abierta');
reset();
hoyISO = () => '2026-08-29'; ahoraTS = () => '2026-08-29 20:05';   // eslint-disable-line no-global-assign
r = anexar({ proc: 'PRONO', hora: '20:03' });
si('el prono anexado abrió el ciclo', !!evoDe('2026-08-29-Dia').PRONO_INICIO_TS);
const idProc = DB.PROCEDIMIENTOS[0].ID_PROC;
r = anularAnexo({ idProc: idProc }, CTX);
si('★ la anulación entra', r.ok);
evo = evoDe('2026-08-29-Dia');
eq('★ el sello de inicio se borra', evo.PRONO_INICIO_TS, '');
si('★ y no queda pronación abierta para el que venga', !_pronoAbiertoTS('8', '2026-08-30-Dia'));
si('el turno ya no figura en prono', !esVerdadero(evo.RESP_POS_PRONO) && !esVerdadero(evo.RESP_PRONO_EVENTO));
eq('la fila de la estadística también se fue', DB.PROCEDIMIENTOS.length, 0);

/* ══ 7 · Lo que no es posición sigue exactamente igual ═══════════════════ */
console.log('\n7 · Un procedimiento normal no cambia en nada');
reset();
hoyISO = () => '2026-08-29'; ahoraTS = () => '2026-08-29 20:05';   // eslint-disable-line no-global-assign
r = anexar({ proc: 'ECOGRAFÍA', hora: '10:00', detalle: 'diafragma' });
si('entra', r.ok);
evo = evoDe('2026-08-29-Dia');
eq('★ el nombre no se toca', DB.PROCEDIMIENTOS[0].NOMBRE_PROC, 'ECOGRAFÍA');
eq('★ su fila entra a la estadística', DB.PROCEDIMIENTOS.length, 1);
eq('★ el hito conserva la hora suelta y el detalle',
  DB.TIMELINE[0].TEXTO, '🔧 ECOGRAFÍA 10:00 hrs — diafragma (anexo) · Klgo. Manuel');
si('★ y NO le inventa un ciclo de prono a nadie',
  !evo.PRONO_INICIO_TS && !esVerdadero(evo.RESP_POS_PRONO));

console.log('\n' + (fails.length ? '❌ ' + fails.length + ' fallas:\n  · ' + fails.join('\n  · ')
  : '✅ prono_desde_el_mas: todo verde'));
process.exit(fails.length ? 1 : 0);
