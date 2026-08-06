// memo_tz.js — Guardia del memo de zona horaria (Ola 1, ago-2026).
//
// Por qué importa más de lo que parece. `_tz()` no se usa solo para formatear
// un informe raro: lo llaman `hoyISO()` y `ahoraTS()` (infra_fechas.gs), o sea
// CADA timestamp que se escribe —cada evolución, cada hito, cada línea de
// auditoría—, y además `esquemaFilaAObjeto` lo pide por CADA celda que venga
// como fecha. Sin memo, esa última vía convierte una sola celda con formato de
// fecha en miles de lecturas de CONFIG.
//
// Lo que fija esta guardia: el memo NO puede cambiar ningún valor (ni en los
// casos raros: clave ausente, valor vacío, clave duplicada), tiene que
// invalidarse cuando se escribe la configuración y cuando arranca la petición
// siguiente, y tiene que dejar UNA sola lectura por petición.
// Uso: node build/checks/memo_tz.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l);
};

let LECTURAS = 0;
let FILAS = [];
const hojaConfig = {
  getLastRow: () => FILAS.length,
  getRange: (f, c, nf, nc) => ({
    getValues: () => {
      LECTURAS++;
      const out = [];
      for (let i = 0; i < nf; i++) {
        const fila = FILAS[f - 1 + i] || [];
        const r = [];
        for (let j = 0; j < nc; j++) r.push(fila[c - 1 + j] === undefined ? '' : fila[c - 1 + j]);
        out.push(r);
      }
      return out;
    },
    setValues: () => {}, setValue: () => {}, setNumberFormat: () => {},
  }),
};
global.SpreadsheetApp = {
  flush: () => {},
  getActiveSpreadsheet: () => ({ getSheetByName: n => (n === 'CONFIG' ? hojaConfig : null), getSheets: () => [] }),
};
// formatDate devuelve la zona horaria recibida: así se ve QUÉ tz llegó de verdad.
global.Utilities = { formatDate: (d, tz) => 'tz=' + tz, getUuid: () => 'u' };
global.Logger = { log: () => {} };
console.warn = () => {};

const EPILOGO = ';globalThis.__X = { esquemaFilaAObjeto: esquemaFilaAObjeto, TOTAL_COLS: TOTAL_COLS, COL: COL };';
(0, eval)(['esquema.gs', 'infra_util.gs', 'infra_respuesta.gs', 'infra_fechas.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n') + EPILOGO);
const { esquemaFilaAObjeto, TOTAL_COLS, COL } = globalThis.__X;

const sembrar = filas => { FILAS = filas; _memoReset(); LECTURAS = 0; };
const DEF = 'America/Santiago';

/* ══ 1 · El valor no cambia, ni en los casos raros ══════════════════════════ */
console.log('\n1 · Mismo valor que antes del memo');
sembrar([['CLAVE', 'VALOR'], ['TIMEZONE', 'America/Lima']]);
eq('lee la zona configurada', _tz(), 'America/Lima');

sembrar([['CLAVE', 'VALOR'], ['AUTH_DEV_MODE', 'TRUE']]);
eq('sin la clave TIMEZONE cae al valor por defecto', _tz(), DEF);

sembrar([['CLAVE', 'VALOR'], ['TIMEZONE', '']]);
eq('con la clave vacía también', _tz(), DEF);

sembrar([['CLAVE', 'VALOR'], ['TIMEZONE', 'America/Lima'], ['TIMEZONE', 'Europe/Madrid']]);
eq('con la clave duplicada gana la primera', _tz(), 'America/Lima');

/* ══ 2 · Una sola lectura por petición ══════════════════════════════════════ */
console.log('\n2 · Una sola lectura por petición');
sembrar([['CLAVE', 'VALOR'], ['TIMEZONE', DEF]]);
for (let i = 0; i < 20; i++) _tz();
eq('20 llamadas a _tz() → 1 lectura de CONFIG', LECTURAS, 1);

// El camino caliente: cada timestamp que se escribe pasa por aquí.
sembrar([['CLAVE', 'VALOR'], ['TIMEZONE', DEF]]);
for (let i = 0; i < 50; i++) { hoyISO(); ahoraTS(); }
eq('50 hoyISO + 50 ahoraTS → 1 lectura', LECTURAS, 1);
eq('…y la zona que reciben es la configurada', hoyISO(), 'tz=' + DEF);

// La bomba: una columna con formato de fecha en vez de texto.
sembrar([['CLAVE', 'VALOR'], ['TIMEZONE', DEF]]);
const colFecha = COL.EVOLUCIONES.FECHA;
let ultima = null;
for (let i = 0; i < 200; i++) {
  const fila = new Array(TOTAL_COLS.EVOLUCIONES).fill('');
  fila[colFecha - 1] = new Date(2026, 7, 4);
  ultima = esquemaFilaAObjeto('EVOLUCIONES', fila);
}
eq('200 filas con celda Date → 1 lectura (antes 200)', LECTURAS, 1);
eq('…y la fecha se formatea con la zona correcta', ultima.FECHA, 'tz=' + DEF);

/* ══ 3 · Se invalida cuando debe ════════════════════════════════════════════ */
console.log('\n3 · El memo se olvida cuando corresponde');
sembrar([['CLAVE', 'VALOR'], ['TIMEZONE', DEF]]);
_tz();
FILAS = [['CLAVE', 'VALOR'], ['TIMEZONE', 'Pacific/Easter']];
escribirConfig('TIMEZONE', 'Pacific/Easter');
eq('tras escribirConfig ve el valor nuevo', _tz(), 'Pacific/Easter');

sembrar([['CLAVE', 'VALOR'], ['TIMEZONE', DEF]]);
_tz();
FILAS = [['CLAVE', 'VALOR'], ['TIMEZONE', 'Atlantic/Azores']];
eq('sin resetear, la MISMA petición conserva su valor', _tz(), DEF);
_memoReset();
eq('tras _memoReset (petición nueva) relee la hoja', _tz(), 'Atlantic/Azores');

/* ══ 4 · La medición puede apagar el memo ═══════════════════════════════════ */
console.log('\n4 · medirArranque() puede comparar con y sin memo');
sembrar([['CLAVE', 'VALOR'], ['TIMEZONE', DEF]]);
_MEMO_OFF = true;
for (let i = 0; i < 5; i++) _tz();
eq('con _MEMO_OFF vuelve a leer cada vez', LECTURAS, 5);
eq('…y devuelve lo mismo', _tz(), DEF);
_MEMO_OFF = false;

console.log('');
if (fails.length) { console.log('❌ FALLARON ' + fails.length + ':\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('✅ TODO OK');
