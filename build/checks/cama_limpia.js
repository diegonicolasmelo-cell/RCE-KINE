// cama_limpia.js — Al liberar una cama NO puede quedar ni una fecha ni un
// reloj del paciente anterior (ago-2026).
//
// BUG ENCONTRADO: `_limpiarCamaInterno` limpiaba FECHA_INGRESO /
// FECHA_INICIO_VA / FECHA_INICIO_SOPORTE, pero los relojes TS_INGRESO /
// TS_INICIO_VA / TS_INICIO_SOPORTE — columnas nuevas de v5.19 — nunca se
// agregaron a la lista. El siguiente paciente de la cama los heredaba: la
// tarjeta cuenta los días EN VIVO contra ellos, y el bloque de ingreso de
// guardarEvolucion solo los escribe `if (!cama.TS_INGRESO)`, así que con el
// valor viejo presente ni los miraba.
//
// La guardia es GENÉRICA a propósito: recorre el esquema real de
// CAMAS_ESTADO y exige que TODA columna de fecha o reloj quede vacía. Si
// mañana se agrega otro TS_*, esto falla hasta que se clasifique.
//
// Uso: node build/checks/cama_limpia.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

const DB = { CAMAS_ESTADO: [], EVOLUCIONES: [], TIMELINE: [], ARCHIVO_PACIENTES: [] };
global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoActualizar = (h, c, id, ch) => { const r = global.repoBuscarPorId(h, c, id); if (r) Object.assign(r, ch); return !!r; };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoEliminarDonde = () => {}; global.repoActualizarDonde = () => {}; global.repoUpsert = () => 'crear';
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d; global.conLock = fn => fn();
global.uid = p => p + '_x'; global.hoyISO = () => '2026-08-04'; global.ahoraTS = () => '2026-08-04 10:00';
global.diasEntre = (a, b) => (!a || !b) ? 0 : Math.max(0, Math.round((new Date(b) - new Date(a)) / 864e5));
global._tz = () => 'America/Santiago';
global.Utilities = { getUuid: () => 'u1', formatDate: () => '2026-08-04' };
global.SpreadsheetApp = { flush: () => {} };
global.calcularPI = () => 60; global._rutNormal = r => String(r || ''); global._apacheNorm = () => '';
global.generarCodPaciente = () => 'PAC'; global._codUnico = c => c;
global._agregarHitoInterno = () => {}; global.auditar = () => {};
global.console = console; global.Logger = { log: () => {} };
global.ok = d => ({ ok: true, data: d }); global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE' };
// ESQUEMA se declara con `const`, así que no queda en el scope global: se
// captura como valor de retorno del eval (última expresión del programa).
const ESQUEMA = eval(['infra_fechas.gs', 'esquema.gs', 'svc_camas.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n') + '\n;ESQUEMA');

/* ── 1 · Una cama ocupada, con TODAS sus fechas y relojes puestos ── */
const OCUPADA = {
  ID_CAMA: '10', OCUPADA: true, STATUS_CAMA: 'Ocupada', PATIENT_ID: 'pViejo', NOMBRE: 'Ismael Molina',
  FECHA_INGRESO: '2026-07-30', FECHA_INICIO_VA: '2026-07-30', FECHA_INICIO_SOPORTE: '2026-07-30',
  TS_INGRESO: '2026-07-30 08:00', TS_INICIO_VA: '2026-07-30 08:00', TS_INICIO_SOPORTE: '2026-07-30 08:00',
  VIA_AEREA: 'TOT', SOPORTE: 'VM', MODO: 'ACVC',
};
DB.CAMAS_ESTADO = [Object.assign({}, OCUPADA)];
_limpiarCamaInterno('10');
const c = DB.CAMAS_ESTADO[0];

eq('la cama queda libre', c.OCUPADA, false);
eq('sin paciente', String(c.NOMBRE || '') + String(c.PATIENT_ID || ''), '');

/* ── 2 · NINGUNA fecha ni reloj del esquema sobrevive ── */
const cols = ESQUEMA.CAMAS_ESTADO.cols.map(x => x[0]);
const relojes = cols.filter(n => /^FECHA_|^TS_/.test(n));
console.log('\ncolumnas de fecha/reloj en CAMAS_ESTADO:', relojes.join(', '));
const sucias = relojes.filter(n => String(c[n] || '') !== '');
eq('ninguna fecha ni reloj sobrevive al liberar la cama', sucias.join(', ') || 'ninguna', 'ninguna');

// Explícito, para que el motivo del bug quede nombrado si vuelve a romperse
eq('  · TS_INGRESO limpio (el que se escapó)', String(c.TS_INGRESO || ''), '');
eq('  · TS_INICIO_VA limpio', String(c.TS_INICIO_VA || ''), '');
eq('  · TS_INICIO_SOPORTE limpio', String(c.TS_INICIO_SOPORTE || ''), '');

/* ── 3 · El paciente SIGUIENTE parte de cero, no hereda el reloj ── */
// Antes: la cama liberada conservaba TS_INGRESO del anterior, y como el
// bloque de ingreso solo escribe `if (!cama.TS_INGRESO)`, el nuevo paciente
// arrancaba con el momento del que se fue (días en vivo inflados).
eq('un ingreso nuevo NO encuentra reloj heredado', !c.TS_INGRESO, true);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ cama_limpia OK');
process.exit(fails.length ? 1 : 0);
