// memo_config.js — Guardia del memo de configuración (ago-2026).
// El arranque preguntaba 17 veces por claves de CONFIG y cada consulta bajaba
// la tabla entera. Ahora se lee UNA vez por petición. Esta guardia protege las
// dos mitades del trato: que se lea una sola vez, y que los valores devueltos
// sean EXACTAMENTE los mismos que antes (incluidas las rarezas: gana la
// primera aparición de una clave, y un valor vacío cae al por-defecto).
// Uso: node build/checks/memo_config.js
const fs = require('fs');
const path = require('path');

const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g));
  if (!okk) fails.push(l);
};

/* ── Hoja CONFIG falsa que cuenta cuántas veces la bajan ── */
let LECTURAS = 0;
let FILAS = [
  ['NUM_CAMAS', '18'],
  ['TIMEZONE', 'America/Santiago'],
  ['VACIA', ''],
  ['NUM_CAMAS', '99'],   // duplicada a propósito: debe ganar la PRIMERA
];
const SpreadsheetApp = {
  getActiveSpreadsheet: () => ({
    getSheetByName: (n) => (n !== 'CONFIG' ? null : {
      getLastRow: () => FILAS.length + 1,
      getRange: () => ({
        getValues: () => { LECTURAS++; return FILAS.map(f => f.slice()); },
        setValue: () => {},
      }),
      appendRow: () => {},
    }),
  }),
};

/* ── Código REAL bajo prueba ── */
const v2 = (f) => fs.readFileSync(path.resolve(__dirname, '..', '..', 'v2', f), 'utf8');
const sandbox = {
  SpreadsheetApp,
  repoLeerTodos: () => [],
  repoInsertar: () => {},
  ok: d => ({ ok: true, data: d }),
  err: m => ({ ok: false, error: m }),
  ERR: { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO' },
  console,
};
const src = v2('infra_util.gs') + '\n;\n' + v2('esquema.gs') +
  '\n;return { leerConfig, escribirConfig, configVal, _memoReset, catalogo, _apagar: (v) => { _MEMO_OFF = v; } };';
const API = new Function(...Object.keys(sandbox), src)(...Object.values(sandbox));

/* ── 1 · Equivalencia: mismos valores que la versión anterior ── */
API._memoReset(); LECTURAS = 0;
eq('clave normal', API.leerConfig('NUM_CAMAS', '12'), '18');
eq('clave duplicada: gana la primera', API.leerConfig('NUM_CAMAS', '12'), '18');
eq('valor vacío cae al por-defecto', API.leerConfig('VACIA', 'porDefecto'), 'porDefecto');
eq('clave inexistente cae al por-defecto', API.leerConfig('NO_EXISTE', 'porDefecto'), 'porDefecto');
eq('configVal comparte el memo', API.configVal('TIMEZONE', 'X'), 'America/Santiago');
eq('configVal sin default devuelve cadena vacía', API.configVal('NO_EXISTE'), '');

/* ── 2 · El objetivo: una sola lectura por petición ── */
eq('las 6 consultas anteriores costaron N lecturas', LECTURAS, 1);

API._memoReset(); LECTURAS = 0;
for (let i = 0; i < 17; i++) API.leerConfig('NUM_CAMAS', '12');
eq('las 17 consultas del arranque cuestan', LECTURAS, 1);

API._apagar(true); API._memoReset(); LECTURAS = 0;
for (let i = 0; i < 17; i++) API.leerConfig('NUM_CAMAS', '12');
eq('con el memo apagado (comportamiento anterior)', LECTURAS, 17);
API._apagar(false);

/* ── 3 · Nadie puede leer configuración vieja ── */
API._memoReset(); LECTURAS = 0;
API.leerConfig('NUM_CAMAS', '12');
API.escribirConfig('NUM_CAMAS', '20');
FILAS[0][1] = '20';
eq('tras escribir, la lectura ve el valor nuevo', API.leerConfig('NUM_CAMAS', '12'), '20');
FILAS[0][1] = '18';

API._memoReset(); LECTURAS = 0;
API.leerConfig('NUM_CAMAS', '12');
API._memoReset();                       // borde de petición (lo llama api())
API.leerConfig('NUM_CAMAS', '12');
eq('_memoReset() obliga a releer en la petición siguiente', LECTURAS, 2);

console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
process.exit(fails.length ? 1 : 0);
