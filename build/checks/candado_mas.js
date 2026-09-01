// candado_mas.js — Corregir el PASADO desde el ➕ exige clave de coordinación.
//
// 🔴 DE DÓNDE SALE (traspaso de Manuel, 20-ago-2026, y su decisión ya tomada):
// el ➕ del Registro Diario quedó abierto para todos, todo el tiempo, y la
// pestaña 🔐 Coordinación quedaba inútil — lo que ella protege con clave se
// conseguía por otra puerta sin clave. La causa era doble: el candado del
// dispatcher protege solo las acciones COORD_*, y la Versión 38 quitó un freno
// ACCIDENTAL («la cama no está ocupada») que de rebote impedía tocar a un
// egresado — había que quitarlo para corregir al paciente correcto, pero dejó
// el pasado abierto.
//
// EL ALCANCE DECIDIDO: pide clave cuando el episodio está CERRADO (egresado,
// cama rotada) o la fecha es PASADA; el ➕ del turno de HOY sobre el paciente
// que está en la cama sigue libre, para no meterle fricción a la ronda. «Hoy»
// incluye el turno noche en curso: a las 2 AM la ronda sigue siendo la noche
// de ayer, y su fecha EFECTIVA es hoy.
//
// El candado vive en el SERVIDOR (svc_eventos.gs): con AUTH_DEV_MODE=TRUE
// cualquiera con el enlace llega al dispatcher, así que esconder el botón no
// protege nada. El rechazo queda auditado por el dispatcher
// (ANEXAR_EVENTO_RECHAZADO, evento_paciente.js sección 6). La sesión real
// (claves, expiración) la vigilan las guardias de coordinación: aquí se prueba
// el CONTRATO — coordExigirSesion(token) → {ok, firma, usuario}.
//
// Uso: node build/checks/candado_mas.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

/* ── Arnés (mismo patrón de evento_paciente.js: dos hojas y número de fila) ── */
const FILA = 4;
let DB, HITOS;
const reset = () => {
  DB = {
    EVOLUCIONES: [
      // Daniela: en cama, con turno de HOY, de ANOCHE (en curso) y uno viejo.
      { ID_EVOLUCION: 'CAMA_9_2026-08-20-Dia', ID_CAMA: '9', PATIENT_ID: 'pDANIELA',
        TURNO_KEY: '2026-08-20-Dia', FECHA: '2026-08-20', TURNO: 'Dia',
        PAC_NOMBRE: 'Daniela', PROC_JSON: '[]', PROC_CANTIDAD: 0, PROC_RESUMEN: '' },
      { ID_EVOLUCION: 'CAMA_9_2026-08-19-Noche', ID_CAMA: '9', PATIENT_ID: 'pDANIELA',
        TURNO_KEY: '2026-08-19-Noche', FECHA: '2026-08-19', TURNO: 'Noche',
        PAC_NOMBRE: 'Daniela', PROC_JSON: '[]', PROC_CANTIDAD: 0, PROC_RESUMEN: '' },
      { ID_EVOLUCION: 'CAMA_9_2026-08-06-Dia', ID_CAMA: '9', PATIENT_ID: 'pDANIELA',
        TURNO_KEY: '2026-08-06-Dia', FECHA: '2026-08-06', TURNO: 'Dia',
        PAC_NOMBRE: 'Daniela', PROC_JSON: '[]', PROC_CANTIDAD: 0, PROC_RESUMEN: '' },
    ],
    EVOLUCIONES_ARCHIVO: [
      // Carla: egresada, cama vacía — el episodio cerrado clásico.
      { ID_EVOLUCION: 'CAMA_3_2026-08-04-Dia', ID_CAMA: '3', PATIENT_ID: 'pCARLA',
        TURNO_KEY: '2026-08-04-Dia', FECHA: '2026-08-04', TURNO: 'Dia',
        PAC_NOMBRE: 'Carla', PROC_JSON: '[]', PROC_CANTIDAD: 0, PROC_RESUMEN: '' },
    ],
    CAMAS_ESTADO: [
      { ID_CAMA: '9', OCUPADA: true, PATIENT_ID: 'pDANIELA', DISP_HME_FECHA: '2026-08-19', DISP_CONFIRMADO: true },
      { ID_CAMA: '3', OCUPADA: false, PATIENT_ID: '', DISP_HME_FECHA: '', DISP_CONFIRMADO: false },
    ],
    PROCEDIMIENTOS: [],
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
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.conLock = fn => fn();
global.uid = p => p + '_x' + (HITOS.length + DB.PROCEDIMIENTOS.length);
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE', NO_AUTORIZADO: 'NA' };
global.Logger = { log: () => {} };
global.SpreadsheetApp = { flush: () => {} };
global.Session = { getScriptTimeZone: () => 'America/Santiago' };
global._tz = () => 'America/Santiago';
global._statISO = v => String(v || '').slice(0, 10);
global.Utilities = {
  getUuid: () => 'uuid-prueba',
  formatDate: (d, tz, fmt) => {
    const p = n => String(n).padStart(2, '0');
    const iso = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    return String(fmt).indexOf('HH') >= 0
      ? iso + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) : iso;
  },
};
global._agregarHitoInterno = h => { HITOS.push(h); };
global._agregarHitoInternoSinSync = h => { HITOS.push(h); };
global._hitoAnexoPrefijo = n => '🔬 ' + n;
/* `_procClaveHito` (svc_timeline.gs) se trae del FUENTE, no se imita: normaliza
   «PRONO 19:00 HRS» → «PRONO», y de esa clave depende que el ➕ reconozca el
   ciclo de posición (`anexarEventoRapido`, ago-2026). Un doble escrito a mano
   aquí podría divergir de la normalización real y dejar esta guardia verde
   sobre una regla que no existe. Se trae la función sola para no cargar
   svc_timeline entero, por la misma razón de siempre: traería sus hitos reales. */
global._procClaveHito = (function () {
  const _s = fs.readFileSync(path.join(v2, 'svc_timeline.gs'), 'utf8');
  const _i = _s.indexOf('function _procClaveHito');
  if (_i < 0) throw new Error('svc_timeline.gs ya no declara _procClaveHito');
  return (0, eval)('(' + _s.slice(_i, _s.indexOf('\n}', _i) + 2) + ')');
})();
global.auditar = () => {};
// El CONTRATO de la sesión (la real la vigilan las guardias de coordinación):
// un solo token bueno, cualquier otro es sesión vencida o inexistente.
global.coordExigirSesion = t => t === 'COORD_OK'
  ? { ok: true, firma: 'MCC', usuario: 'coord1' }
  : { ok: false, error: 'Tu sesión de coordinación expiró. Vuelve a entrar con tu clave.', codigo: 'NA' };

eval(fs.readFileSync(path.join(v2, 'infra_fechas.gs'), 'utf8'));
eval(fs.readFileSync(path.join(v2, 'svc_evoluciones.gs'), 'utf8'));
eval(fs.readFileSync(path.join(v2, 'svc_eventos.gs'), 'utf8'));
/* 🪤 El reloj DESPUÉS de los eval, y REASIGNANDO LA LIGADURA, no solo
   global.*: el eval directo declara `hoyISO` en el ámbito del MÓDULO, así que
   las funciones eval-uadas resuelven ESA ligadura y un `global.hoyISO = …`
   queda sombreado — la guardia daría distinto según el día en que corra
   (verificado el 21-ago: con solo el global, el «turno de hoy» del fixture
   salía como pasado). */
hoyISO = () => '2026-08-20';               // eslint-disable-line no-global-assign
ahoraTS = () => '2026-08-20 10:00';        // eslint-disable-line no-global-assign
global.hoyISO = hoyISO; global.ahoraTS = ahoraTS;

const CTX = { firma: 'Klgo. Prueba', email: 'kine@hospital.cl' };
const anexar = (turnoKey, extra) => anexarEventoRapido(Object.assign({
  idCama: '9', turnoKey: turnoKey, tipo: 'procedimiento', proc: 'ECOGRAFÍA', hora: '10:00',
}, extra), CTX);

/* ══ 1 · EL TURNO DE HOY SIGUE LIBRE — cero fricción en la ronda ═════════ */
console.log('\n1 · El ➕ de todos los días no pide nada');
let r = anexar('2026-08-20-Dia');
si('★ turno de HOY, paciente en cama, sin token → entra', r.ok);
reset();
r = anexar('2026-08-19-Noche');
si('★ la noche EN CURSO (fecha efectiva hoy) tampoco pide clave', r.ok);

/* ══ 2 · EL PASADO PIDE CLAVE, aunque el paciente siga en la cama ════════ */
console.log('\n2 · Una fecha pasada exige sesión de coordinación');
reset();
r = anexar('2026-08-06-Dia');
eq('★ sin token → RECHAZADO', r.ok, false);
si('…y el mensaje manda a la pestaña de coordinación', /coordinaci/i.test(String(r.error || '')));
si('…sin haber escrito nada', DB.PROCEDIMIENTOS.length === 0 && HITOS.length === 0);
reset();
r = anexar('2026-08-06-Dia', { coordToken: 'COORD_OK' });
si('★ con sesión válida → entra', r.ok);
si('…y la acción queda marcada como autorizada por coordinación (MCC)',
  /coordinaci/i.test(String((r.data && r.data.accion) || '')) && /MCC/.test(String((r.data && r.data.accion) || '')));
reset();
r = anexar('2026-08-06-Dia', { coordToken: 'VENCIDO' });
eq('token vencido → rechazado', r.ok, false);
si('…con el mensaje de la sesión, no uno genérico', /sesión de coordinación expiró/i.test(String(r.error || '')));

/* ══ 3 · EL EPISODIO CERRADO PIDE CLAVE, aunque la fecha diera lo mismo ══ */
console.log('\n3 · El egresado exige sesión (episodio cerrado)');
reset();
r = anexarEventoRapido({ idCama: '3', patientId: 'pCARLA', turnoKey: '2026-08-04-Dia',
  tipo: 'procedimiento', proc: 'ECOGRAFÍA' }, CTX);
eq('★ corregir a Carla (egresada) sin token → rechazado', r.ok, false);
reset();
r = anexarEventoRapido({ idCama: '3', patientId: 'pCARLA', turnoKey: '2026-08-04-Dia',
  tipo: 'procedimiento', proc: 'ECOGRAFÍA', coordToken: 'COORD_OK' }, CTX);
si('★ con sesión → la corrección del PRD sigue siendo posible', r.ok);
si('…y aterriza en el archivo, en la ficha de Carla',
  /ECOGRAFÍA/.test(String((DB.EVOLUCIONES_ARCHIVO[0] || {}).PROC_RESUMEN || '')));

/* ══ 4 · EL FRONT MANDA EL TOKEN ═════════════════════════════════════════ */
console.log('\n4 · evGuardar viaja con el token de coordinación');
const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
si('★ el payload del ➕ incluye coordToken desde COORD_TK', /coordToken:[^,\n]*COORD_TK/.test(idx));

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK — el pasado tiene llave, la ronda no');
process.exit(fails.length ? 1 : 0);
