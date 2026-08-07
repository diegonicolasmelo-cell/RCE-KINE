// limpiar_archiva.js — Liberar una cama archiva el episodio, igual que el alta
// (ago-2026, decisión de Diego).
//
// EL BUG QUE CIERRA (lo encontró Manuel en su revisión de la Ola 1): solo
// `darAltaPaciente` archivaba las evoluciones. Una cama limpiada SIN alta
// formal las dejaba vivas en la hoja, y como la pronación abierta se busca por
// ID_CAMA y no por paciente, el ocupante siguiente heredaba una pronación
// ajena: en su prueba salió «tras 108,5 h en prono» con horas de otra persona.
//
// LA TRAMPA QUE ESTA GUARDIA CUIDA (bloque 3): el archivado NO puede vivir
// dentro de `_limpiarCamaInterno`, porque ese helper también lo usa el TRASLADO
// a cama vacía — que limpia el origen y enseguida re-etiqueta las evoluciones a
// la cama nueva. Si archivara ahí, un traslado le borraría la historia a un
// paciente que sigue hospitalizado.
//
// Uso: node build/checks/limpiar_archiva.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
// OJO: no llamar `ok` a este helper — taparía al ok() del servidor dentro del eval.
const si = (l, c) => eq(l, !!c, true);

let DB;
const reset = () => {
  DB = {
    CAMAS_ESTADO: [
      { ID_CAMA: '4', OCUPADA: true, PATIENT_ID: 'pVIEJO', NOMBRE: 'Caterina Villalobos',
        FECHA_INGRESO: '2026-07-29', VIA_AEREA: 'TOT', SOPORTE: 'VM' },
      { ID_CAMA: '7', OCUPADA: false, PATIENT_ID: '', NOMBRE: '' },
    ],
    EVOLUCIONES: [
      // Episodio con una PRONACIÓN ABIERTA: es el arrastre que se quiere cortar.
      { ID_EVOLUCION: 'CAMA_4_a', ID_CAMA: '4', PATIENT_ID: 'pVIEJO', TURNO_KEY: '2026-08-02-Dia',
        RESP_PRONO_EVENTO: true, PRONO_INICIO_TS: '2026-08-02 19:00' },
      { ID_EVOLUCION: 'CAMA_4_b', ID_CAMA: '4', PATIENT_ID: 'pVIEJO', TURNO_KEY: '2026-08-03-Dia' },
      // Otro paciente, otra cama: no se debe tocar.
      { ID_EVOLUCION: 'CAMA_9_a', ID_CAMA: '9', PATIENT_ID: 'pOTRO', TURNO_KEY: '2026-08-03-Dia' },
    ],
    EVOLUCIONES_ARCHIVO: [], TIMELINE: [], ARCHIVO_PACIENTES: [], AUDIT_LOG: [],
  };
};
reset();

global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoActualizar = (h, c, id, ch) => { const r = global.repoBuscarPorId(h, c, id); if (r) Object.assign(r, ch); return !!r; };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoEliminarDonde = (h, fn) => { const a = (DB[h] || []).length; DB[h] = (DB[h] || []).filter(r => !fn(r)); return a - DB[h].length; };
global.repoActualizarDonde = () => 0; global.repoUpsert = () => 'crear';
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d; global.escribirConfig = () => {}; global.conLock = fn => fn();
global.hoyISO = () => '2026-08-06'; global.ahoraTS = () => '2026-08-06 10:00';
global.diasEntre = () => 0; global.uid = p => p + '_x'; global._tz = () => 'America/Santiago';
global.Utilities = { getUuid: () => 'u1', formatDate: () => '2026-08-06' };
global.SpreadsheetApp = { flush: () => {}, getActiveSpreadsheet: () => ({ getSheetByName: () => null }) };
global.CacheService = { getScriptCache: () => ({ removeAll: () => {} }) };
global.calcularPI = () => 60; global._rutNormal = r => String(r || ''); global._apacheNorm = () => '';
global.generarCodPaciente = () => 'PAC'; global._codUnico = c => c;
global._agregarHitoInterno = () => {}; global._interpEgreso = () => ({});
global._statISO = s => String(s || '').slice(0, 10);
const AUDIT = [];
global.auditar = o => AUDIT.push(o);
global.Logger = { log: () => {} }; global.console = console;
global.ok = d => ({ ok: true, data: d }); global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE' };
eval(['infra_fechas.gs', 'svc_camas.gs'].map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

/* ══ 1 · Limpiar una cama ocupada archiva su episodio ══════════════════ */
console.log('1 · Limpiar la cama archiva, ya no deja las evoluciones vivas');
const r = limpiarCama('4');
eq('la operación responde ok', r.ok, true);
eq('informa cuántas archivó', r.data.archivadas, 2);
eq('las evoluciones salieron de la hoja viva', DB.EVOLUCIONES.filter(e => e.PATIENT_ID === 'pVIEJO').length, 0);
eq('…y están en el archivo histórico', DB.EVOLUCIONES_ARCHIVO.filter(e => e.PATIENT_ID === 'pVIEJO').length, 2);
eq('el episodio de OTRA cama no se tocó', DB.EVOLUCIONES.filter(e => e.PATIENT_ID === 'pOTRO').length, 1);
eq('la cama queda libre', DB.CAMAS_ESTADO[0].OCUPADA, false);
si('queda constancia en la auditoría', AUDIT.some(a => a.accion === 'LIMPIAR_CAMA_ARCHIVA'));

/* ══ 2 · El siguiente ocupante NO hereda la pronación abierta ══════════ */
console.log('\n2 · El arrastre entre pacientes queda cortado');
// La pronación abierta se busca por ID_CAMA: si quedara alguna fila viva de la
// cama 4, el paciente nuevo la heredaría.
const vivasCama4 = DB.EVOLUCIONES.filter(e => String(e.ID_CAMA) === '4');
eq('no queda ninguna evolución viva de la cama 4', vivasCama4.length, 0);
si('…y ninguna con pronación abierta', !vivasCama4.some(e => e.RESP_PRONO_EVENTO));

/* ══ 3 · EL TRASLADO NO PUEDE ARCHIVAR (el paciente sigue vivo) ════════ */
console.log('\n3 · Trasladar a cama vacía NO archiva: el paciente sigue hospitalizado');
reset(); AUDIT.length = 0;
const rt = moverACamaVacia('4', '7', { firma: 'DMV', email: 'x@y' });
eq('el traslado responde ok', rt.ok, true);
eq('las evoluciones SIGUEN vivas (no se archivaron)', DB.EVOLUCIONES.filter(e => e.PATIENT_ID === 'pVIEJO').length, 2);
eq('el archivo histórico quedó vacío', DB.EVOLUCIONES_ARCHIVO.length, 0);
eq('el paciente quedó en la cama destino', DB.CAMAS_ESTADO.find(c => c.ID_CAMA === '7').PATIENT_ID, 'pVIEJO');
si('la cama de origen quedó libre', DB.CAMAS_ESTADO.find(c => c.ID_CAMA === '4').OCUPADA === false);

/* ══ 4 · El alta sigue archivando igual (misma vía, no divergen) ═══════ */
console.log('\n4 · El alta usa el mismo helper y se comporta igual');
reset(); AUDIT.length = 0;
const ra = darAltaPaciente({ idCama: '4', motivoEgreso: 'Traslado a sala', turno: 'Dia' }, { firma: 'DMV', email: 'x@y' });
eq('el alta responde ok', ra.ok, true);
eq('archivó las 2 evoluciones', DB.EVOLUCIONES_ARCHIVO.filter(e => e.PATIENT_ID === 'pVIEJO').length, 2);
eq('…y las sacó de la hoja viva', DB.EVOLUCIONES.filter(e => e.PATIENT_ID === 'pVIEJO').length, 0);
si('el alta SÍ deja fila en ARCHIVO_PACIENTES', DB.ARCHIVO_PACIENTES.length === 1);

/* ══ 5 · Limpiar NO inventa un egreso clínico ══════════════════════════ */
console.log('\n5 · Limpiar no escribe un egreso que nadie registró');
reset(); AUDIT.length = 0;
limpiarCama('4');
eq('ARCHIVO_PACIENTES sigue vacío (no hay egreso falso)', DB.ARCHIVO_PACIENTES.length, 0);

/* ══ 6 · Cama vacía: no rompe ni archiva de más ════════════════════════ */
console.log('\n6 · Limpiar una cama ya libre es inofensivo');
reset();
const rv = limpiarCama('7');
eq('responde ok', rv.ok, true);
eq('no archivó nada', rv.data.archivadas, 0);
eq('las evoluciones de los demás siguen intactas', DB.EVOLUCIONES.length, 3);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ limpiar_archiva OK');
process.exit(fails.length ? 1 : 0);
