// reparar_ajenas.js — Guardia de repararEvolucionesAjenas (ago-2026).
//
// La rutina archiva las evoluciones VIVAS que quedaron de un ocupante anterior
// de la cama (resaca de antes del archivado por cama). Lo que esta guardia
// fija, en el orden en que se pagó aprenderlo:
//   1. El SIMULACRO no toca nada y no respalda.
//   2. Solo se archiva lo INEQUÍVOCO: pid distinto y no vacío en cama ocupada,
//      o cualquier fila en cama libre.
//   3. Las filas sin PATIENT_ID (o en cama ocupada sin pid en el censo) JAMÁS
//      se archivan — es la lección de la reversión del 6-ago: el pid se
//      regenera al re-ingresar y esas filas pueden ser del propio ocupante.
//      Solo se informan.
//   4. CONFIRMAR respalda primero y si el respaldo falla CANCELA entero.
//   5. Se COPIA al archivo ANTES de borrar de la hoja viva (nunca al revés).
//   6. Queda traza en la auditoría y la rutina es idempotente.
//
// Uso: node build/checks/reparar_ajenas.js
const fs = require('fs');
const path = require('path');

const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

/** Base en memoria + sandbox que carga mantenimiento.gs real. */
function montar(opciones) {
  opciones = opciones || {};
  const db = {
    CAMAS_ESTADO: [
      { ID_CAMA: '3', OCUPADA: 'TRUE', PATIENT_ID: 'P3_ACTUAL', NOMBRE: 'Rosa Actual' },
      { ID_CAMA: '5', OCUPADA: 'FALSE', PATIENT_ID: '', NOMBRE: '' },
      { ID_CAMA: '7', OCUPADA: 'TRUE', PATIENT_ID: '', NOMBRE: 'Sin Pid' },
      { ID_CAMA: '9', OCUPADA: 'TRUE', PATIENT_ID: 'P9', NOMBRE: 'Limpia Total' },
    ],
    EVOLUCIONES: [
      // cama 3: dos propias, dos del ocupante ANTERIOR, una anónima
      { ID_EVOLUCION: 'CAMA_3_2026-08-01-Dia', ID_CAMA: '3', PATIENT_ID: 'P3_ACTUAL', TURNO_KEY: '2026-08-01-Dia', PLAN_FIRMA_KINE: 'K1' },
      { ID_EVOLUCION: 'CAMA_3_2026-08-01-Noche', ID_CAMA: '3', PATIENT_ID: 'P3_ACTUAL', TURNO_KEY: '2026-08-01-Noche', PLAN_FIRMA_KINE: 'K2' },
      { ID_EVOLUCION: 'CAMA_3_2026-07-20-Dia', ID_CAMA: '3', PATIENT_ID: 'P3_VIEJO', TURNO_KEY: '2026-07-20-Dia', PLAN_FIRMA_KINE: 'K1' },
      { ID_EVOLUCION: 'CAMA_3_2026-07-20-Noche', ID_CAMA: '3', PATIENT_ID: 'P3_VIEJO', TURNO_KEY: '2026-07-20-Noche', PLAN_FIRMA_KINE: 'K3' },
      { ID_EVOLUCION: 'CAMA_3_2026-07-25-Dia', ID_CAMA: '3', PATIENT_ID: '', TURNO_KEY: '2026-07-25-Dia', PLAN_FIRMA_KINE: 'K1' },
      // cama 5 LIBRE: dos filas huérfanas (una con pid, otra sin él)
      { ID_EVOLUCION: 'CAMA_5_2026-07-10-Dia', ID_CAMA: '5', PATIENT_ID: 'P5_EX', TURNO_KEY: '2026-07-10-Dia', PLAN_FIRMA_KINE: 'K2' },
      { ID_EVOLUCION: 'CAMA_5_2026-07-10-Noche', ID_CAMA: '5', PATIENT_ID: '', TURNO_KEY: '2026-07-10-Noche', PLAN_FIRMA_KINE: 'K2' },
      // cama 7 ocupada pero el CENSO no tiene pid: nada es comparable
      { ID_EVOLUCION: 'CAMA_7_2026-07-30-Dia', ID_CAMA: '7', PATIENT_ID: 'P7_QUIZAS', TURNO_KEY: '2026-07-30-Dia', PLAN_FIRMA_KINE: 'K4' },
      // cama 9: solo filas propias — no debe aparecer en ningún listado
      { ID_EVOLUCION: 'CAMA_9_2026-08-02-Dia', ID_CAMA: '9', PATIENT_ID: 'P9', TURNO_KEY: '2026-08-02-Dia', PLAN_FIRMA_KINE: 'K1' },
    ],
    EVOLUCIONES_ARCHIVO: [],
  };
  const estado = { backups: 0, auditado: [], orden: [] };
  const sandbox = {
    repoLeerTodos: h => (db[h] || []).slice(),
    repoInsertar: (h, o) => { estado.orden.push('insertar:' + h); (db[h] = db[h] || []).push(Object.assign({}, o)); },
    repoEliminarDonde: (h, fn) => {
      estado.orden.push('eliminar:' + h);
      const antes = db[h].length;
      db[h] = db[h].filter(x => !fn(x));
      return antes - db[h].length;
    },
    esVerdadero: v => v === true || String(v).toUpperCase() === 'TRUE',
    ok: d => ({ ok: true, data: d }),
    err: m => ({ ok: false, error: m }),
    auditar: a => estado.auditado.push(a),
    backupDiario: () => {
      estado.backups++;
      if (opciones.backupFalla) return { ok: false, error: 'Drive sin permiso' };
      return { ok: true };
    },
    Logger: { log() {} },
    console: { log() {}, warn() {}, error() {} },
  };
  const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'v2', 'mantenimiento.gs'), 'utf8');
  const api = new Function(...Object.keys(sandbox),
    src + '\n;return { sim: repararEvolucionesAjenasSIMULACRO, conf: repararEvolucionesAjenasCONFIRMAR };')(
    ...Object.values(sandbox));
  return { db, estado, api };
}

// ── 1 · El simulacro informa y no toca nada ──
{
  const { db, estado, api } = montar();
  const r = api.sim();
  console.log('── 1 · SIMULACRO ──');
  eq('detecta las 4 filas archivables (2 ajenas + 2 de cama libre)', r.data.archivar, 4);
  eq('informa las 2 no verificables (anónima de la 3 + la de la cama 7 sin pid)', r.data.anonimas, 2);
  eq('la hoja viva sigue con sus 9 filas', db.EVOLUCIONES.length, 9);
  eq('el archivo sigue vacío', db.EVOLUCIONES_ARCHIVO.length, 0);
  eq('NO respalda (informar no amerita backup)', estado.backups, 0);
  eq('NO deja traza de auditoría', estado.auditado.length, 0);
  eq('el mensaje dice cómo confirmar', /CONFIRMAR\(\)/.test(r.data.mensaje), true);
}

// ── 2 · CONFIRMAR archiva lo inequívoco y respeta lo dudoso ──
{
  const { db, estado, api } = montar();
  const r = api.conf();
  console.log('\n── 2 · CONFIRMAR ──');
  eq('archiva exactamente 4', r.data.archivadas, 4);
  eq('respaldó primero', estado.backups, 1);
  const vivos = db.EVOLUCIONES.map(e => e.ID_EVOLUCION).sort().join('|');
  eq('en la viva quedan las propias + las no verificables',
    vivos, ['CAMA_3_2026-07-25-Dia', 'CAMA_3_2026-08-01-Dia', 'CAMA_3_2026-08-01-Noche',
      'CAMA_7_2026-07-30-Dia', 'CAMA_9_2026-08-02-Dia'].join('|'));
  const arch = db.EVOLUCIONES_ARCHIVO.map(e => e.ID_EVOLUCION).sort().join('|');
  eq('el archivo tiene las 4 completas (ajenas de la 3 + huérfanas de la 5)',
    arch, ['CAMA_3_2026-07-20-Dia', 'CAMA_3_2026-07-20-Noche',
      'CAMA_5_2026-07-10-Dia', 'CAMA_5_2026-07-10-Noche'].join('|'));
  eq('la fila anónima de la cama ocupada NO se movió',
    db.EVOLUCIONES.some(e => e.ID_EVOLUCION === 'CAMA_3_2026-07-25-Dia'), true);
  // El orden importa: nada se borra sin estar ya copiado.
  const primerBorrado = estado.orden.indexOf('eliminar:EVOLUCIONES');
  const ultimaCopia = estado.orden.lastIndexOf('insertar:EVOLUCIONES_ARCHIVO');
  eq('copia al archivo ANTES de borrar de la viva', ultimaCopia < primerBorrado, true);
  eq('queda traza en la auditoría', estado.auditado.length, 1);
  eq('…con la acción correcta', estado.auditado[0].accion, 'REPARAR_EVOS_AJENAS');
  eq('…y menciona las no verificables', /sin PATIENT_ID/.test(estado.auditado[0].resumen), true);

  // idempotencia: la segunda pasada no encuentra nada
  const r2 = api.conf();
  eq('la segunda corrida archiva 0', r2.data.archivadas, 0);
  eq('…y no vuelve a respaldar', estado.backups, 1);
}

// ── 3 · Si el respaldo falla, se cancela entero ──
{
  const { db, estado, api } = montar({ backupFalla: true });
  const r = api.conf();
  console.log('\n── 3 · Respaldo caído ──');
  eq('devuelve error', r.ok, false);
  eq('…que dice CANCELADO', /CANCELADO/.test(r.error), true);
  eq('la hoja viva quedó intacta', db.EVOLUCIONES.length, 9);
  eq('el archivo quedó intacto', db.EVOLUCIONES_ARCHIVO.length, 0);
  eq('sin traza de auditoría (no pasó nada)', estado.auditado.length, 0);
}

// ── 4 · Unidad sana: nada que archivar, nada que avisar ──
{
  const { db, estado, api } = montar();
  db.EVOLUCIONES = db.EVOLUCIONES.filter(e => e.PATIENT_ID === 'P9' || e.PATIENT_ID === 'P3_ACTUAL');
  const r = api.sim();
  console.log('\n── 4 · Unidad sana ──');
  eq('archivar = 0', r.data.archivar, 0);
  eq('anónimas = 0', r.data.anonimas, 0);
  eq('el mensaje lo dice sin alarmar', /no tiene evoluciones ajenas/.test(r.data.mensaje), true);
  eq('CONFIRMAR en unidad sana no respalda', (api.conf(), estado.backups), 0);
}

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
