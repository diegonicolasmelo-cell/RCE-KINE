// camas_prueba.js — Camas de ensayo: se agregan sin tocar a los pacientes
// reales y se retiran SIN dejar rastro en la estadística (ago-2026).
//
// PEDIDO DE DIEGO: quiere probar una versión con la unidad llena de pacientes
// reales, sin arriesgar sus evoluciones.
//
// DOS TRAMPAS QUE ESTA GUARDIA CUIDA:
//  1. Subir NUM_CAMAS a mano NO agrega camas: la siembra de
//     crearORepararEstructura() solo corre con la hoja VACÍA.
//  2. `repoEliminarDonde` SIEMPRE borra — no tiene modo simulacro. Al escribir
//     esta función se le pasó un tercer argumento `!escribir` creyendo que lo
//     tenía: el simulacro habría BORRADO DE VERDAD. El bloque 2 lo asserta.
//
// Uso: node build/checks/camas_prueba.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

let DB;
const reset = () => {
  DB = {
    CAMAS_ESTADO: [
      { ID_CAMA: '1', OCUPADA: true, PATIENT_ID: 'pREAL', NOMBRE: 'Paciente Real' },
      { ID_CAMA: '2', OCUPADA: true, PATIENT_ID: 'pREAL2', NOMBRE: 'Otro Real' },
    ],
    EVOLUCIONES: [
      { ID_CAMA: '1', PATIENT_ID: 'pREAL', TURNO_KEY: '2026-08-04-Dia' },
      { ID_CAMA: '2', PATIENT_ID: 'pREAL2', TURNO_KEY: '2026-08-04-Dia' },
    ],
    EVOLUCIONES_ARCHIVO: [], PROCEDIMIENTOS: [], TIMELINE: [], REINTUBACIONES: [],
    ARCHIVO_PACIENTES: [],
  };
};
reset();

global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoEliminarDonde = (h, fn) => { const antes = (DB[h] || []).length; DB[h] = (DB[h] || []).filter(r => !fn(r)); return antes - DB[h].length; };
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoActualizar = () => true;
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
let NUM_CAMAS = '2';
global.leerConfig = (k, d) => (k === 'NUM_CAMAS' ? NUM_CAMAS : d);
global.conLock = fn => fn();
global.hoyISO = () => '2026-08-04'; global.ahoraTS = () => '2026-08-04 10:00';
global.diasEntre = () => 0; global.uid = p => p + '_x';
global.SpreadsheetApp = { flush: () => {}, getActiveSpreadsheet: () => ({ getSheetByName: () => null }) };
global.CacheService = { getScriptCache: () => ({ removeAll: () => {} }) };
global.Utilities = { getUuid: () => 'u1' };
global.Logger = { log: () => {} };
global.ok = d => ({ ok: true, data: d }); global.err = m => ({ ok: false, error: m });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global.backupDiario = () => ({ ok: true });
global.auditar = () => {};
eval(fs.readFileSync(path.join(v2, 'mantenimiento.gs'), 'utf8'));

/* ══ 1 · Agregar: aparecen al final y nadie real se toca ══════════════ */
console.log('1 · Agregar camas de prueba');
agregarCamasPrueba();
eq('el censo pasa de 2 a 4 camas', DB.CAMAS_ESTADO.length, 4);
eq('las nuevas son la 3 y la 4', DB.CAMAS_ESTADO.slice(2).map(c => c.ID_CAMA).join(','), '3,4');
eq('nacen VACÍAS (nadie ingresado)', DB.CAMAS_ESTADO.slice(2).every(c => c.OCUPADA === false), true);
eq('los pacientes reales quedan intactos', DB.CAMAS_ESTADO.slice(0, 2).map(c => c.NOMBRE).join('|'), 'Paciente Real|Otro Real');
eq('sus evoluciones no se tocan', DB.EVOLUCIONES.length, 2);

console.log('\n1b · Es idempotente (correrla dos veces no duplica)');
agregarCamasPrueba();
eq('sigue habiendo 4 camas', DB.CAMAS_ESTADO.length, 4);

/* ══ 2 · El SIMULACRO no puede borrar NADA ════════════════════════════ */
console.log('\n2 · El simulacro informa pero no toca (la trampa que costó el bug)');
// Se evoluciona en las camas de prueba, como haría Diego al ensayar.
DB.CAMAS_ESTADO[2].OCUPADA = true; DB.CAMAS_ESTADO[2].PATIENT_ID = 'pTEST';
DB.EVOLUCIONES.push({ ID_CAMA: '3', PATIENT_ID: 'pTEST', TURNO_KEY: '2026-08-04-Dia' });
DB.EVOLUCIONES.push({ ID_CAMA: '3', PATIENT_ID: 'pTEST', TURNO_KEY: '2026-08-04-Noche' });
DB.PROCEDIMIENTOS.push({ ID_CAMA: '3', PATIENT_ID: 'pTEST', PROC: 'INGRESO' });
DB.TIMELINE.push({ ID_CAMA: '3', PATIENT_ID: 'pTEST', TIPO: 'ingreso' });

const antesEvos = DB.EVOLUCIONES.length, antesCamas = DB.CAMAS_ESTADO.length;
const sim = quitarCamasPruebaSIMULACRO();
eq('el simulacro NO borró evoluciones', DB.EVOLUCIONES.length, antesEvos);
eq('el simulacro NO borró camas', DB.CAMAS_ESTADO.length, antesCamas);
eq('…pero informa lo que se iría (2 evoluciones)', /EVOLUCIONES: 2 fila\(s\) se borrarían/.test(sim), true);
eq('…y nombra las camas de prueba', /camas de prueba: 3, 4/.test(sim), true);

/* ══ 3 · El retiro real limpia la historia de prueba y SOLO esa ═══════ */
console.log('\n3 · Retiro real: no queda rastro en la estadística');
quitarCamasPruebaCONFIRMAR();
eq('vuelven a quedar las 2 camas reales', DB.CAMAS_ESTADO.length, 2);
eq('…y son las reales', DB.CAMAS_ESTADO.map(c => c.ID_CAMA).join(','), '1,2');
eq('las evoluciones de prueba se fueron', DB.EVOLUCIONES.length, 2);
eq('…y las que quedan son las REALES', DB.EVOLUCIONES.map(e => e.PATIENT_ID).join(','), 'pREAL,pREAL2');
eq('procedimientos de prueba borrados', DB.PROCEDIMIENTOS.length, 0);
eq('timeline de prueba borrada', DB.TIMELINE.length, 0);

/* ══ 4 · Sin camas de prueba, no hace nada ════════════════════════════ */
console.log('\n4 · Sin camas de prueba no hay nada que retirar');
const vacio = quitarCamasPruebaSIMULACRO();
eq('lo dice y no rompe', /No hay camas de prueba/.test(vacio), true);
eq('las camas reales siguen ahí', DB.CAMAS_ESTADO.length, 2);

/* ══ 5 · Distingue prueba de real por NUM_CAMAS ═══════════════════════ */
console.log('\n5 · La frontera la marca NUM_CAMAS, no un número fijo');
eq('con NUM_CAMAS=2, la cama 3 es de prueba', _esCamaPrueba('3'), true);
eq('…y la 2 NO', _esCamaPrueba('2'), false);
NUM_CAMAS = '18';
eq('con NUM_CAMAS=18, la 19 es de prueba', _esCamaPrueba('19'), true);
eq('…y la 18 NO (es real)', _esCamaPrueba('18'), false);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ camas_prueba OK');
process.exit(fails.length ? 1 : 0);
