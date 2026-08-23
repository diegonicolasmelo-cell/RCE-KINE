// maqueta_demo.js — La MAQUETA con pacientes ficticios: candados, ficción
// verificable, determinismo y un REM 28 que sale con números vivos.
//
// Existe porque una maqueta que se muestra a jefatura tiene dos formas de
// salir mal, y las dos son caras:
//   1. Que el sembrador toque la planilla REAL. Por eso hay dos candados y
//      aquí se prueba que muerden.
//   2. Que los números que se proyectan en la pantalla estén mal. Un REM en
//      cero, o uno que no cuadra consigo mismo, hunde la demostración.
//
// Y de paso fija el defecto que encontró esta maqueta: el conteo de inicios
// de VNI del código 601171 comparaba contra 'VMNI', un valor que NO existe en
// el sistema (el catálogo guarda 'VNI'), así que esa parte del código REM
// siempre valía 0 — subregistro en un dato que se le entrega a Estadística.
//
// Uso: node build/checks/maqueta_demo.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };
const ok_ = (l, c) => { console.log((c ? '✅' : '❌') + ' ' + l); if (!c) fails.push(l); };

// ── Simulador de repositorio ───────────────────────────────────────────────
// Va por `global` a propósito: este arnés lo reutiliza la guardia del puente
// (puente_rem.js) cargándolo con eval, y lo declarado con let/const no sale del
// eval. Un arnés que no se puede prestar se acaba copiando, y las dos copias se
// separan.
global.DB = {};
global.vaciarDB = () => { DB = { CAMAS_ESTADO: [], EVOLUCIONES: [], EVOLUCIONES_ARCHIVO: [],
  ARCHIVO_PACIENTES: [], REINTUBACIONES: [], ESTADISTICAS_REM: [], PROCEDIMIENTOS: [],
  TIMELINE: [], ENTREGAS_TURNO: [], AUDIT_LOG: [] }; };
vaciarDB();

global.CONFIG = {};
global.repoLeerTodos = (h) => (DB[h] || []).slice();
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.repoActualizar = (h, c, id, ch) => { const r = global.repoBuscarPorId(h, c, id); if (r) Object.assign(r, ch); return !!r; };
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.repoInsertarVarios = (h, os) => { (os || []).forEach(o => (DB[h] = DB[h] || []).push(o)); return (os || []).length; };
global.repoUpsert = (h, c, id, o) => { const r = global.repoBuscarPorId(h, c, id); if (r) { Object.assign(r, o); return 'actualizar'; } global.repoInsertar(h, o); return 'crear'; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => (CONFIG[k] !== undefined ? CONFIG[k] : d);
global.escribirConfig = (k, v) => { CONFIG[k] = v; };
global.hoyISO = () => '2026-08-22';
global.ahoraTS = () => '2026-08-22 10:00:00';
global._tz = () => 'America/Santiago';
global.FILA_DATOS = new Proxy({}, { get: () => 2 });
global.uid = p => p + '_1';
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global.Logger = { log: () => {} };

global.uuidN = 0;
global.Utilities = {
  getUuid: () => 'uuid' + (++uuidN) + '-aaaabbbb',
  formatDate: (d, tz, f) => {
    const p = n => ('0' + n).slice(-2);
    if (String(f).indexOf('HH') > -1) return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' 10:00:00';
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  },
};
// Hoja falsa: el sembrador solo la usa para limpiar (getLastRow 0 = nada que
// limpiar) y generarREM para pintar la plantilla, que aquí no interesa.
const hojaFalsa = new Proxy({}, { get: (t, k) => {
  if (k === 'getLastRow') return () => 0;
  if (k === 'getMaxRows' || k === 'getMaxColumns') return () => 200;
  return () => hojaFalsa;
} });
global.SpreadsheetApp = {
  getActiveSpreadsheet: () => ({ getSheetByName: () => hojaFalsa, insertSheet: () => hojaFalsa }),
  BorderStyle: { SOLID_MEDIUM: 'sm', DOUBLE: 'db' },
  flush: () => {},
};

eval(['infra_fechas.gs', 'dominio_texto.gs', 'svc_rem_plantilla.gs', 'svc_rem.gs', 'demo_datos.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));
global._statISO = v => (!v ? '' : String(v).slice(0, 10));

/* ══ 1 · Los candados muerden ═══════════════════════════════════════════ */
console.log('\n1 · Candados: la maqueta no puede tocar una planilla real');
CONFIG = {};
let lanzo = false;
try { sembrarDemoRCE(); } catch (e) { lanzo = true; }
ok_('sin CONFIG.MODO_DEMO, sembrarDemoRCE() se niega y no escribe', lanzo);
eq('  …y no dejó ni una evolución', DB.EVOLUCIONES.length, 0);

lanzo = false;
try { limpiarDemoRCE(); } catch (e) { lanzo = true; }
ok_('sin la marca, limpiarDemoRCE() también se niega', lanzo);

// Una planilla CON registros (la de la unidad) no se puede convertir en maqueta.
DB.EVOLUCIONES.push({ ID_EVOLUCION: 'real-1', PATIENT_ID: 'p-real' });
lanzo = false;
try { prepararPlanillaDemo(); } catch (e) { lanzo = true; }
ok_('prepararPlanillaDemo() se niega si la base ya tiene evoluciones', lanzo);
ok_('  …y NO marcó la planilla', String(CONFIG.MODO_DEMO || '') !== 'TRUE');
vaciarDB();

/* ══ 2 · Sembrar la maqueta ════════════════════════════════════════════ */
console.log('\n2 · Siembra de la maqueta');
eq('en una planilla vacía sí se puede preparar', typeof prepararPlanillaDemo(), 'string');
eq('  …y queda marcada', CONFIG.MODO_DEMO, 'TRUE');
// Camas vacías, como las deja crearORepararEstructura()
for (let c = 1; c <= 18; c++) DB.CAMAS_ESTADO.push({ ID_CAMA: String(c), OCUPADA: false });
sembrarDemoRCE({ hoyISO: '2026-08-22', semilla: 42 });

const todas = DB.EVOLUCIONES.concat(DB.EVOLUCIONES_ARCHIVO);
ok_('siembra evoluciones (' + todas.length + ')', todas.length > 200);
ok_('siembra egresados en ARCHIVO_PACIENTES (' + DB.ARCHIVO_PACIENTES.length + ')', DB.ARCHIVO_PACIENTES.length > 5);
ok_('ocupa camas (' + DB.CAMAS_ESTADO.filter(c => c.OCUPADA).length + ')', DB.CAMAS_ESTADO.filter(c => c.OCUPADA).length > 5);
ok_('registra reintubaciones (' + DB.REINTUBACIONES.length + ')', DB.REINTUBACIONES.length >= 1);
ok_('ninguna cama ocupada quedó sin paciente',
  DB.CAMAS_ESTADO.filter(c => c.OCUPADA).every(c => c.PATIENT_ID && c.NOMBRE));

/* ══ 3 · La ficción es verificable ═════════════════════════════════════ */
console.log('\n3 · Los datos se pueden probar inventados');
const ruts = DB.ARCHIVO_PACIENTES.map(a => a.RUT).concat(DB.CAMAS_ESTADO.filter(c => c.OCUPADA).map(c => c.RUT));
ok_('todos los RUT están en el rango de personas jurídicas (77.xxx.xxx)',
  ruts.length > 0 && ruts.every(r => /^77\d{6}-[0-9K]$/.test(String(r))));
const dvOk = r => {
  const [cuerpo, dv] = String(r).split('-');
  let suma = 0, mul = 2;
  cuerpo.split('').reverse().forEach(d => { suma += parseInt(d, 10) * mul; mul = mul === 7 ? 2 : mul + 1; });
  const res = 11 - (suma % 11);
  return (res === 11 ? '0' : res === 10 ? 'K' : String(res)) === dv;
};
ok_('…y su dígito verificador es correcto (la interfaz los acepta)', ruts.every(dvOk));
ok_('todo código de paciente lleva el prefijo DEMO-', todas.every(e => /^DEMO-/.test(String(e.COD_PACIENTE))));
ok_('todo identificador de episodio lleva el prefijo DEMOPID-', todas.every(e => /^DEMOPID-/.test(String(e.PATIENT_ID))));
ok_('el autor de cada registro es la maqueta, no una persona',
  todas.every(e => String(e.AUTOR_EMAIL) === 'maqueta@demo.local'));

/* ══ 4 · Determinismo: la demo se repite igual ═════════════════════════ */
console.log('\n4 · Misma semilla, mismo mes');
const rem1 = generarREM('2026', '7', { email: 'x@y' });
const huella1 = JSON.stringify(rem1.data);
const camasAntes = DB.CAMAS_ESTADO.map(c => ({ ID_CAMA: c.ID_CAMA }));
vaciarDB(); DB.CAMAS_ESTADO = camasAntes.map(c => Object.assign({ OCUPADA: false }, c));
uuidN = 0;
sembrarDemoRCE({ hoyISO: '2026-08-22', semilla: 42 });
const rem2 = generarREM('2026', '7', { email: 'x@y' });
eq('el REM de julio es idéntico en las dos siembras', JSON.stringify(rem2.data), huella1);

/* ══ 5 · El REM 28 sale con números vivos y cuadrados ══════════════════ */
console.log('\n5 · El REM 28 del mes cerrado');
const r = rem2.data;
console.log('   ' + r.textoREM.split('\n').slice(2, 13).join('\n   '));
ok_('hay ingresos (' + r.ingresos + ')', r.ingresos > 0);
ok_('hay egresos (' + (r.egresosAlta + r.egresosFallecimiento) + ')', r.egresosAlta + r.egresosFallecimiento > 0);
ok_('B.2 evaluación inicial = ingresos', r.evalInicial === r.ingresos);
ok_('B.3 evaluación intermedia > 0 (' + r.evalIntermedia + ')', r.evalIntermedia > 0);
eq('B.4 sesiones = KTR + KTM', r.sesiones, r.sumKTR + r.sumKTM);
ok_('B.6 educación registrada (' + r.turnosEdu + ')', r.turnosEdu > 0);
ok_('1010922 PTO: alguien se puso de pie (' + r.pto + ')', r.pto > 0);
ok_('601171 asistencias de vía aérea (' + r.asistenciasVA + ')', r.asistenciasVA > 0);

/* ══ 6 · El código 601171 cuenta los inicios de VNI ════════════════════
 * Prueba dirigida, no estadística: dos episodios iguales salvo que uno pasa a
 * VNI. Si el conteo compara contra un valor que no existe en el catálogo, la
 * diferencia es 0 y esto se pone rojo.                                      */
console.log('\n6 · Los inicios de VNI suman al código 601171');
vaciarDB();
const evoBase = (pid, fecha, turno, sop) => ({
  ID_EVOLUCION: pid + fecha + turno, PATIENT_ID: pid, COD_PACIENTE: 'DEMO-X',
  TURNO_KEY: fecha + '-' + turno, FECHA: fecha, TURNO: turno, PAC_EDAD: 60, PAC_SEXO: 'M',
  PAC_DIAG_REM: 'Enfermedades respiratorias', VENT_SOPORTE: sop,
});
// Paciente A: siempre en oxigenoterapia. Paciente B: pasa a VNI el día 12.
DB.EVOLUCIONES = [
  evoBase('pA', '2026-07-11', 'Dia', 'Oxigenoterapia/OAF'),
  evoBase('pA', '2026-07-12', 'Dia', 'Oxigenoterapia/OAF'),
  evoBase('pB', '2026-07-11', 'Dia', 'Oxigenoterapia/OAF'),
  evoBase('pB', '2026-07-12', 'Dia', 'VNI'),
  evoBase('pB', '2026-07-13', 'Dia', 'VNI'),   // sigue en VNI: NO es un inicio nuevo
];
const soloVNI = generarREM('2026', '7', {}).data;
eq('un paciente que entra en VNI suma 1 asistencia de vía aérea', soloVNI.asistenciasVA, 1);

DB.EVOLUCIONES = DB.EVOLUCIONES.filter(e => e.PATIENT_ID === 'pA');
const sinVNI = generarREM('2026', '7', {}).data;
eq('sin ningún paciente en VNI, quedan 0', sinVNI.asistenciasVA, 0);

/* ══ Cierre ════════════════════════════════════════════════════════════ */
console.log('\n' + (fails.length ? '❌ FALLAN ' + fails.length + ': ' + fails.join(' · ')
  : '✅ TODO OK — la maqueta es mostrable'));
process.exit(fails.length ? 1 : 0);
