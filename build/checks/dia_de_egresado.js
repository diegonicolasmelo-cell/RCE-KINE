// dia_de_egresado.js — El día de un paciente ya egresado se sigue viendo.
//
// EL BUG QUE CIERRA (lo encontró Manuel el 20-ago-2026, desde el turno):
// pidió la cama 1 del 1 de agosto y el Registro Diario le mostró a OTRA
// paciente — la que ocupa esa cama hoy, ingresada diez días después.
//
// La causa no estaba en la pantalla sino en la lectura: `obtenerEvosDelDia`
// leía SOLO la hoja EVOLUCIONES. Al dar de alta, `_archivarEvolucionesEpisodio`
// mueve las filas del episodio a EVOLUCIONES_ARCHIVO — así que el día de
// cualquier paciente egresado desaparecía del Registro Diario. Medido sobre la
// planilla real ese día: 365 turnos de 45 episodios en 14 camas, el 60,7% del
// registro de agosto.
//
// Lo que NO estaba roto, y por eso el error pasó meses inadvertido: el REM, el
// tablero y los indicadores SÍ leen las dos hojas (svc_rem.gs, svc_stats.gs,
// svc_indicadores.gs). Las cifras estaban bien; mentía la pantalla.
//
// 🪤 La trampa que esta guardia cuida: una cama puede tener DOS episodios en el
// mismo turno —el que egresa y el que ingresa ese día— y en la planilla real
// eso pasa 39 veces. Devolver «la primera que aparezca» volvería a mostrar al
// paciente equivocado, que es justo el bug. Vienen las dos, y el orden es
// estable: primero la viva, después la archivada.
//
// Uso: node build/checks/dia_de_egresado.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

/* ── La planilla de prueba reproduce la cama 1 de agosto ────────────────
   · pFRAN  ingresó el 17-jul y egresó el 8-ago  → sus filas están ARCHIVADAS
   · pELI   ingresó el 11-ago y sigue en la cama → su fila está VIVA
   Pedir el 1 de agosto tiene que devolver a pFRAN, que es quien estaba.   */
let DB;
const reset = () => {
  DB = {
    EVOLUCIONES: [
      { ID_CAMA: '1', PATIENT_ID: 'pELI', TURNO_KEY: '2026-08-11-Noche', FECHA: '2026-08-11',
        PAC_NOMBRE: 'Elizabeth (ocupante de hoy)', DIA_ESTADIA: 0, DIAS_VM: 0 },
      { ID_CAMA: '2', PATIENT_ID: 'pOTRO', TURNO_KEY: '2026-08-01-Dia', FECHA: '2026-08-01',
        PAC_NOMBRE: 'Paciente vivo de otra cama', DIA_ESTADIA: 3, DIAS_VM: 3 },
    ],
    EVOLUCIONES_ARCHIVO: [
      { ID_CAMA: '1', PATIENT_ID: 'pFRAN', TURNO_KEY: '2026-08-01-Noche', FECHA: '2026-08-01',
        PAC_NOMBRE: 'Francisca (egresada el 8)', DIA_ESTADIA: 15, DIAS_VM: 11 },
      { ID_CAMA: '1', PATIENT_ID: 'pFRAN', TURNO_KEY: '2026-08-08-Dia', FECHA: '2026-08-08',
        PAC_NOMBRE: 'Francisca (egresada el 8)', DIA_ESTADIA: 22, DIAS_VM: 16 },
      // El recambio: el 8 de agosto la cama tuvo a los dos. Caso real (39 veces).
      { ID_CAMA: '1', PATIENT_ID: 'pNUEVO', TURNO_KEY: '2026-08-08-Dia', FECHA: '2026-08-08',
        PAC_NOMBRE: 'El que entró ese mismo día', DIA_ESTADIA: 0, DIAS_VM: 0 },
    ],
  };
};
reset();

/* ── Arnés mínimo: repoLeerFiltrado real filtra por una columna clave ─── */
global.repoLeerFiltrado = (hoja, colKey, pred) =>
  (DB[hoja] || []).filter(r => pred(r[colKey]));
global.hoyISO = () => '2026-08-20';
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE' };
global.Logger = { log: () => {} };

eval(fs.readFileSync(path.join(v2, 'svc_evoluciones.gs'), 'utf8'));

/* ══ 1 · El día de una paciente egresada se ve ═════════════════════════ */
console.log('1 · El 1 de agosto de la cama 1 devuelve a quien estaba, no a quien está hoy');
const r1 = obtenerEvosDelDia('2026-08-01');
si('la lectura responde ok', r1.ok);
const cama1 = (r1.data || []).filter(e => String(e.ID_CAMA) === '1');
eq('la cama 1 tiene registro ese día', cama1.length, 1);
eq('…y es la paciente que estaba', (cama1[0] || {}).PAC_NOMBRE, 'Francisca (egresada el 8)');
eq('con SUS contadores, no los de otra', (cama1[0] || {}).DIA_ESTADIA, 15);
eq('y sus días de ventilación', (cama1[0] || {}).DIAS_VM, 11);
si('la ocupante de hoy NO aparece en ese día',
  !(r1.data || []).some(e => String(e.PATIENT_ID) === 'pELI'));

/* ══ 2 · Lo vivo se sigue leyendo igual ════════════════════════════════ */
console.log('\n2 · Las evoluciones vivas no se pierden por leer también el archivo');
si('la cama 2 de ese día sigue viniendo',
  (r1.data || []).some(e => String(e.ID_CAMA) === '2' && String(e.PATIENT_ID) === 'pOTRO'));
const r2 = obtenerEvosDelDia('2026-08-11');
si('el día de hoy trae a la ocupante actual',
  (r2.data || []).some(e => String(e.PATIENT_ID) === 'pELI'));

/* ══ 3 · El recambio: los DOS episodios del mismo turno ════════════════ */
console.log('\n3 · La cama que cambió de paciente ese día devuelve los dos, en orden estable');
const r3 = obtenerEvosDelDia('2026-08-08');
const c1 = (r3.data || []).filter(e => String(e.ID_CAMA) === '1');
eq('vienen los dos episodios del turno', c1.length, 2);
si('está la que egresó', c1.some(e => String(e.PATIENT_ID) === 'pFRAN'));
si('y el que entró', c1.some(e => String(e.PATIENT_ID) === 'pNUEVO'));

/* ══ 4 · Un día sin nada registrado sigue vacío ════════════════════════ */
console.log('\n4 · No se inventan pacientes en un día sin registro');
const r4 = obtenerEvosDelDia('2026-07-04');
eq('el día vacío no devuelve nada', (r4.data || []).length, 0);

console.log('\n' + (fails.length ? '❌ FALLARON ' + fails.length + ': ' + fails.join(' · ')
  : '✅ dia_de_egresado: todo en orden'));
process.exit(fails.length ? 1 : 0);
