// timeline_no_ajeno.js — LA TARJETA DE UNA CAMA MUESTRA LOS HITOS DE QUIEN ESTÁ
// EN ELLA, Y NO PIERDE LOS SUYOS POR LOS DE OTRO.
//
// 🔴 DE DÓNDE SALE (20-ago-2026). `_sincronizarTimelineCama` y el cache que arma
// `_timelineDelGuardado` leían TIMELINE solo por `ID_CAMA`. Y `_limpiarCamaInterno`
// vacía el cache pero NO purga TIMELINE, así que los hitos del ocupante anterior
// se quedaban en la hoja. De ahí salían dos daños a la vez, y el segundo es el
// que de verdad importa:
//
//   1. Se VE lo ajeno: el ingreso y el diagnóstico de otra persona aparecían en
//      la tarjeta del paciente actual.
//   2. Se DEJA DE VER lo propio: el cache corta en los últimos 30 por TIMESTAMP,
//      así que los hitos ajenos empujan fuera hitos verdaderos del paciente que
//      está en la cama.
//
// La pregunta correcta de este proyecto no es «¿desapareció el dato falso?» sino
// «¿qué dato VERDADERO deja de verse?». El bloque 2 mide eso.
//
// 🪤 LA TRAMPA QUE ESTA GUARDIA CUIDA: el cache no se reconstruye solo. Si se
// comprueba justo después de sembrar, sale VERDE con el bug vivo, porque
// TIMELINE_JSON todavía es el de antes. Hay que DISPARAR un hito rutinario de esa
// cama y comprobar DESPUÉS. Sin ese disparo, esta guardia se mediría a sí misma.
//
// Uso: node build/checks/timeline_no_ajeno.js
const { api, DB } = require('../sim/sim_srv.js');

const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l);
};
const si = (l, c) => eq(l, !!c, true);

const cama = id => DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === String(id)) || {};
const cacheDe = id => { try { return JSON.parse(cama(id).TIMELINE_JSON || '[]'); } catch (e) { return []; } };

const TK = '2026-08-01-Dia';
const evo = (idCama, nombre, procs) => ({
  idCama, turnoKey: TK, FECHA: '2026-08-01', TURNO: 'Dia', PAC_NOMBRE: nombre,
  VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC',
  VENT_VT: 450, VENT_FR: 16, VENT_PEEP: 8, VENT_FIO2: 50,
  SED_TIPO: 'Escalón 2', SED_SAS: '2', HEMO_ESTADO: 'Estable',
  PLAN_PLANES: 'Protección pulmonar', PLAN_FIRMA_KINE: 'DMV',
  PROC_JSON: JSON.stringify(procs || []),
});

/* ═══════════════════════════════════════════════════════════════════════════
   1 · LO AJENO NO SE VE
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n1 · La tarjeta no muestra los hitos del ocupante anterior');

let r = api('INGRESAR_PACIENTE', { idCama: '4', nombre: 'Paciente Alfa', edad: 61, sexo: 'M',
  diagnostico: 'NAC grave', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM',
  modo: 'ACVC', firmaKine: 'DMV' }, null);
eq('ingresa A en la cama 4', r.ok, true);
const PID_A = cama('4').PATIENT_ID;

r = api('GUARDAR_EVOLUCION', evo('4', 'Paciente Alfa', ['ECOGRAFÍA', 'PABELLÓN', 'RCP']), null);
eq('se guarda el turno de A con 3 procedimientos', r.ok, true);
const hitosA = DB.TIMELINE.filter(h => String(h.PATIENT_ID) === String(PID_A)).length;
si('A dejó hitos en TIMELINE', hitosA >= 3);

// Limpieza manual de cama: no archiva ni purga TIMELINE (es su comportamiento
// deliberado — puede correrse con el paciente dentro). Se reproduce su efecto
// porque mantenimiento.gs no se carga en sim_srv.
const c4 = cama('4');
c4.OCUPADA = false; c4.PATIENT_ID = ''; c4.NOMBRE = ''; c4.TIMELINE_JSON = '';
si('los hitos de A siguen en la hoja TIMELINE',
  DB.TIMELINE.filter(h => String(h.PATIENT_ID) === String(PID_A)).length === hitosA);

r = api('INGRESAR_PACIENTE', { idCama: '4', nombre: 'Paciente Bravo', edad: 47, sexo: 'F',
  diagnostico: 'Shock séptico', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM',
  modo: 'ACVC', firmaKine: 'DMV' }, null);
eq('ingresa B en la misma cama', r.ok, true);
const PID_B = cama('4').PATIENT_ID;
si('B tiene pid propio', !!PID_B && PID_B !== PID_A);

r = api('GUARDAR_EVOLUCION', evo('4', 'Paciente Bravo', ['IMAGENOLOGÍA']), null);
eq('se guarda el turno de B', r.ok, true);

// 🔴 EL ASSERT QUE IMPORTA.
const cacheB = cacheDe('4');
const ajenos = cacheB.filter(h => String(h.PATIENT_ID) === String(PID_A));
eq('EN LA TARJETA DE B NO HAY NI UN HITO DE A', ajenos.length, 0);
si('…y sí están los suyos', cacheB.some(h => String(h.PATIENT_ID) === String(PID_B)));

/* ═══════════════════════════════════════════════════════════════════════════
   2 · LO PROPIO NO SE PIERDE  ← la pregunta que de verdad importa
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n2 · Los hitos ajenos no empujan fuera los del paciente actual');

// La cama 5 con un ocupante que acumula MÁS de 30 hitos propios: el cache corta
// en 30, así que aquí es donde un hito ajeno cuesta uno verdadero.
r = api('INGRESAR_PACIENTE', { idCama: '5', nombre: 'Paciente Charlie', edad: 70, sexo: 'M',
  diagnostico: 'SDRA', fechaIngreso: '2026-08-01', viaAerea: 'TOT', soporte: 'VM',
  modo: 'ACVC', firmaKine: 'DMV' }, null);
eq('ingresa C en la cama 5', r.ok, true);
const PID_C = cama('5').PATIENT_ID;

// 12 hitos ajenos, con sello de tiempo POSTERIOR: son los que ganan el orden y
// desplazan. Es exactamente lo que deja una cama que rotó.
for (let i = 0; i < 12; i++) {
  DB.TIMELINE.push({ ID_HITO: 'AJENO_' + i, ID_CAMA: '5', PATIENT_ID: 'pid-de-otro',
    FECHA: '2026-08-01', TURNO: 'Dia', TIPO: 'evento', TEXTO: 'hito de otro episodio ' + i,
    TIMESTAMP: '2026-08-01 23:' + String(i).padStart(2, '0') + ':00' });
}
// 32 hitos propios, anteriores en el tiempo.
for (let i = 0; i < 32; i++) {
  DB.TIMELINE.push({ ID_HITO: 'PROPIO_' + i, ID_CAMA: '5', PATIENT_ID: PID_C,
    FECHA: '2026-08-01', TURNO: 'Dia', TIPO: 'evento', TEXTO: 'hito propio ' + i,
    TIMESTAMP: '2026-08-01 1' + String(i % 10) + ':' + String(i).padStart(2, '0') + ':00' });
}

// 🪤 EL DISPARO. Sin esto el cache sigue siendo el de antes y la guardia daría
// verde con el bug vivo. Un hito rutinario de la cama fuerza la reconstrucción.
r = api('AGREGAR_HITO', { idCama: '5', patientId: PID_C, tipo: 'general',
  texto: 'control de rutina', fecha: '2026-08-01', turno: 'Dia' }, null);
si('se dispara un hito rutinario que reconstruye el cache', r && r.ok !== false);

const cacheC = cacheDe('5');
si('el cache se reconstruyó', cacheC.length > 0);
eq('EN LA TARJETA DE C NO HAY HITOS AJENOS',
  cacheC.filter(h => String(h.PATIENT_ID) === 'pid-de-otro').length, 0);
// El corte son 30: si no entrara ninguno ajeno, los 30 son todos suyos.
eq('…y los 30 del corte son TODOS SUYOS',
  cacheC.filter(h => String(h.PATIENT_ID) === String(PID_C)).length, cacheC.length);
si('el cache llegó al tope de 30 (si no, el escenario no midió el desplazamiento)',
  cacheC.length === 30);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS:\n  - ${fails.join('\n  - ')}` : '\n✅ timeline_no_ajeno OK');
process.exit(fails.length ? 1 : 0);
