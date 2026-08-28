/**
 * ktm_otro_fundamento.js — «OTRO» SIN FUNDAMENTO NO SE GUARDA, Y EL MES SE
 * CUENTA COMPLETO.
 *
 * 🔴 DE DÓNDE SALE (28-ago-2026, pedido de Manuel desde el turno): una KTM se
 * podía dejar «no realizada» eligiendo la razón «Otro» y sin escribir nada, y
 * una «contraindicada» eligiendo del catálogo el ítem 'KTMC manual' —que
 * literalmente significa «escríbela a mano»— también sin escribir nada. Las dos
 * validaciones existentes (`guardar()` y `validarKTM`) daban esos casos por
 * buenos, porque la regla era `RAZON || MANUAL` y la razón sí tenía valor. El
 * resultado llegaba a la estadística del mes como un motivo hueco.
 *
 * LO QUE SE FIJA AQUÍ:
 *  1. `validarKTM` rechaza «Otro» sin fundamento — en el SERVIDOR, que es la
 *     única capa por la que pasa también el ➕ del Registro Diario.
 *  2. Las otras siete razones NO exigen fundamento: se explican solas y
 *     convertirlas en un campo más sería cobrarle al turno por un caso que no
 *     tiene.
 *  3. La pestaña Estadísticas cuenta el mes COMPLETO. Hasta hoy `obtenerStats`
 *     leía solo la hoja viva: un paciente que egresaba desaparecía del mes en
 *     que se atendió, mientras los egresos sí venían del archivo — numerador y
 *     denominador de universos distintos.
 *  4. El subregistro de «otros» trae el fundamento escrito, y marca los que no
 *     lo tienen en vez de esconderlos.
 *
 * ⚖️ EL LADO SIMÉTRICO, que es lo que esta guardia cuida de verdad: separar los
 * motivos en dos barras (contraindicada ≠ no realizada) no puede PERDER ninguno.
 * La suma de `motivosContra` + `motivosNoReal` tiene que dar exactamente el
 * `motivosNo` de siempre, motivo por motivo. Si alguien afina la clasificación y
 * un caso se cae por el medio, esto se pone rojo.
 *
 * Uso: node build/checks/ktm_otro_fundamento.js
 */
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');

// ── Stubs de infraestructura ──
const DB = {};
global.repoLeerTodos = h => (DB[h] || []).slice();
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO' };
global.Utilities = { formatDate: (d) => d.toISOString().slice(0, 10) };

eval(['dominio_validacion.gs', 'svc_stats.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

const fails = [];
const eq = (l, got, want) => {
  const okk = JSON.stringify(got) === JSON.stringify(want);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(got) + (okk ? '' : ' (esperado ' + JSON.stringify(want) + ')'));
  if (!okk) fails.push(l);
};
const si = (l, c) => eq(l, !!c, true);
// Comparar tallies sin que el ORDEN DE INSERCIÓN de las claves cuente como
// diferencia: `{a:1,b:2}` y `{b:2,a:1}` son el mismo conteo.
const orden = o => Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {});
const eqT = (l, got, want) => eq(l, orden(got), orden(want));

/* ══ 1 · EL CASO QUE SE COLABA: «Otro» sin fundamento ═══════════════════ */
console.log('\n1 · validarKTM — «No realizada · Otro» exige el fundamento');

const base = { ID_CAMA: 'C1', TURNO_KEY: '2026-08-05-Dia', TURNO: 'Dia', PLAN_FIRMA_KINE: 'MFB' };
const val = extra => validarPayloadEvolucion(Object.assign({}, base, extra));
const hayKTM = errs => errs.filter(m => /^KTM:/.test(m));

const sinFund = hayKTM(val({ KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Otro', KTM_NO_COMENTARIO: '' }));
si('«Otro» sin fundamento → rechazado', sinFund.length === 1);
si('el mensaje nombra el fundamento', /fundamento/i.test(sinFund[0] || ''));

eq('«Otro» con fundamento → pasa',
  hayKTM(val({ KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Otro', KTM_NO_COMENTARIO: 'En hemodiálisis todo el turno' })), []);

eq('«Otro» con fundamento de solo espacios → rechazado',
  hayKTM(val({ KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Otro', KTM_NO_COMENTARIO: '   ' })).length, 1);

/* ══ 2 · LO QUE NO SE LE COBRA AL TURNO ════════════════════════════════ */
console.log('\n2 · Las otras razones NO exigen fundamento (se explican solas)');
['Motivo ingreso', 'Indicación médica', 'Decisión médica', 'Rechazo del paciente',
 'Rechazo familiar', 'Procedimiento concurrente (pabellón / imagenología)',
 'Sin equipo o tiempo disponible'].forEach(r => {
  eq('«' + r + '» sin comentario pasa',
    hayKTM(val({ KTM_NO_REALIZADA: true, KTM_NO_RAZON: r, KTM_NO_COMENTARIO: '' })), []);
});
// Y la regla vieja sigue viva: sin NINGUNA razón se rechaza igual.
eq('sin razón → sigue rechazado',
  hayKTM(val({ KTM_NO_REALIZADA: true, KTM_NO_RAZON: '' })).length, 1);
eq('contraindicada sin razón ni descripción → sigue rechazada',
  hayKTM(val({ KTM_SUSPENDIDA: true })).length, 1);

/* ══ 3 · FIXTURE DEL MES: hay pacientes VIVOS y pacientes EGRESADOS ════ */
const evo = (o) => Object.assign({
  PATIENT_ID: 'p1', ID_CAMA: 'C1', FECHA: '2026-08-05', TURNO: 'Dia',
  TURNO_KEY: '2026-08-05-Dia', PAC_DIAG_REM: 'Respiratorio',
}, o);

DB.EVOLUCIONES = [
  // vivo, con fundamento escrito
  evo({ FECHA: '2026-08-05', KTM_NO_REALIZADA: 'TRUE', KTM_NO_RAZON: 'Otro',
        KTM_NO_COMENTARIO: 'En hemodiálisis todo el turno' }),
  // vivo, SIN fundamento: es lo que se guardó antes de la regla
  evo({ FECHA: '2026-08-06', KTM_NO_REALIZADA: 'TRUE', KTM_NO_RAZON: 'Otro', KTM_NO_COMENTARIO: '' }),
];
DB.EVOLUCIONES_ARCHIVO = [
  // EGRESADO: hoy este mes entero se pierde de la pestaña
  evo({ PATIENT_ID: 'p2', FECHA: '2026-08-07', KTM_NO_REALIZADA: 'TRUE', KTM_NO_RAZON: 'Otro',
        KTM_NO_COMENTARIO: 'La familia pidió no intervenir ese turno' }),
  evo({ PATIENT_ID: 'p2', FECHA: '2026-08-08', KTM_SUSPENDIDA: 'TRUE', KTM_CONTRA_CAT: 'Otra',
        KTM_CONTRA_RAZON: 'KTMC manual', KTM_CONTRA_MANUAL: 'Laparostomía contenida' }),
  evo({ PATIENT_ID: 'p2', FECHA: '2026-08-09', KTM_REALIZADA: 'TRUE', KTM_NIVEL_KTR: '2' }),
  evo({ PATIENT_ID: 'p2', FECHA: '2026-08-10', KTM_SUSPENDIDA: 'TRUE',
        KTM_CONTRA_CAT: 'Hemodinámica', KTM_CONTRA_RAZON: 'PAM <60 mmHg' }),
];
DB.CAMAS_ESTADO = []; DB.REINTUBACIONES = []; DB.ARCHIVO_PACIENTES = [];

const st = obtenerStats('2026-08-01', '2026-08-31').data;

console.log('\n3 · El mes se cuenta COMPLETO (vivos + egresados)');
eq('evoluciones del mes', st.evos.total, 6);
eq('pacientes atendidos', st.pacientes.atendidos, 2);
eq('KTM realizadas (la del egresado cuenta)', st.ktm.realizada, 1);
eq('KTM contraindicadas', st.ktm.contraindicada, 2);
eq('KTM no realizadas', st.ktm.noRealizada, 3);

/* ══ 4 · EL SUBREGISTRO DE «OTROS» ═════════════════════════════════════ */
console.log('\n4 · Subregistro: el fundamento se ve, y el que falta se marca');
const otros = st.ktm.otros;
const buscar = f => otros.find(x => x.fundamento === f);

si('llega el fundamento del paciente VIVO', !!buscar('En hemodiálisis todo el turno'));
si('llega el fundamento del paciente EGRESADO', !!buscar('La familia pidió no intervenir ese turno'));
si('llega el fundamento de la contraindicación «Otra»', !!buscar('Laparostomía contenida'));
eq('la contraindicación «Otra» se marca como contraindicada', (buscar('Laparostomía contenida') || {}).grupo, 'contra');
eq('el «Otro» de no realizada se marca como tal', (buscar('En hemodiálisis todo el turno') || {}).grupo, 'noReal');
eq('registros sin fundamento contados', st.ktm.sinFundamento, 1);
si('el sin-fundamento aparece en la lista (no se esconde)', otros.some(x => !x.fundamento && x.n === 1));
eq('la contraindicación CLÍNICA no entra al subregistro de otros',
  otros.some(x => x.motivo === 'PAM <60 mmHg'), false);
eq('el mes queda desglosado', (buscar('Laparostomía contenida') || {}).meses, { '2026-08': 1 });

/* ══ 5 · EL LADO SIMÉTRICO: separar no puede PERDER motivos ════════════ */
console.log('\n5 · Separar en dos barras no pierde ningún motivo');
const suma = {};
[st.ktm.motivosContra, st.ktm.motivosNoReal].forEach(t =>
  Object.keys(t).forEach(k => { suma[k] = (suma[k] || 0) + t[k]; }));
eqT('motivosContra + motivosNoReal === motivosNo (el agregado de siempre)', suma, st.ktm.motivosNo);
const tot = o => Object.keys(o).reduce((s, k) => s + o[k], 0);
eq('y el total cuadra con el trío de KTM', tot(st.ktm.motivosNo),
  st.ktm.contraindicada + st.ktm.noRealizada);
eq('ninguna razón de «no realizada» se cuela en contraindicada',
  Object.keys(st.ktm.motivosContra).some(k => k === 'Otro'), false);

/* ══ 6 · UNA SOLA FÓRMULA PARA LA ETIQUETA DEL MOTIVO ══════════════════ */
console.log('\n6 · _ktmMotivo: la misma etiqueta para la pestaña y para el pivot');
eq('contraindicada del catálogo', _ktmMotivo({ KTM_SUSPENDIDA: 'TRUE', KTM_CONTRA_RAZON: 'PAM <60 mmHg' }), 'PAM <60 mmHg');
eq('contraindicada sin razón cae a la categoría', _ktmMotivo({ KTM_SUSPENDIDA: 'TRUE', KTM_CONTRA_CAT: 'Otra' }), 'Otra');
eq('no realizada', _ktmMotivo({ KTM_NO_REALIZADA: 'TRUE', KTM_NO_RAZON: 'Otro' }), 'Otro');
eq('no realizada sin razón', _ktmMotivo({ KTM_NO_REALIZADA: 'TRUE' }), 'Sin motivo registrado');
eq('KTM hecha → sin motivo', _ktmMotivo({ KTM_REALIZADA: 'TRUE' }), '');
eq('nada declarado → sin motivo', _ktmMotivo({}), '');

/* ══ 7 · EL TEXTO CLÍNICO NARRA EL FUNDAMENTO, NO LA ETIQUETA ══════════ */
// «KTM no realizada por otro» no le dice nada a quien lee la ficha desde fuera
// de la unidad. La frase esperada está escrita UNA vez acá y la guardia de
// pantalla la compara contra el motor del cliente: si un motor se cambia solo,
// una de las dos se pone roja. (Los dos textos del mismo turno tienen que decir
// lo mismo — es lo que se rompió en agosto con la contraindicación.)
console.log('\n7 · El texto del servidor con «Otro»');
global.leerConfig = (k, d) => d;
eval(fs.readFileSync(path.join(v2, 'dominio_texto.gs'), 'utf8'));
const linea = d => String(generarTextoEvolucion(d) || '').split('\n').find(l => /KTM no realizada/.test(l)) || '(no hay línea)';

eq('«Otro» narra el fundamento y se salta la etiqueta',
  linea({ KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Otro', KTM_NO_COMENTARIO: 'En hemodiálisis todo el turno' }).trim(),
  'KTM no realizada: En hemodiálisis todo el turno.');
si('y no queda el «por otro»',
  !/por otro/i.test(linea({ KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Otro', KTM_NO_COMENTARIO: 'x' })));
eq('un fundamento que ya trae punto no lo duplica',
  linea({ KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Otro', KTM_NO_COMENTARIO: 'Estaba en pabellón.' }).trim(),
  'KTM no realizada: Estaba en pabellón.');
// El lado simétrico: las otras razones se siguen narrando igual que siempre.
eq('«Motivo ingreso» se sigue narrando natural',
  linea({ KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Motivo ingreso' }).trim(),
  'KTM no realizada por ingreso reciente.');
eq('y con comentario, el comentario va como oración aparte',
  linea({ KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Rechazo familiar', KTM_NO_COMENTARIO: 'La hija pidió esperar' }).trim(),
  'KTM no realizada por rechazo familiar. La hija pidió esperar.');

/* ══ CIERRE ════════════════════════════════════════════════════════════ */
console.log('\n' + (fails.length ? '❌ FALLA (' + fails.length + '): ' + fails.join(' · ')
                                 : '✅ ktm_otro_fundamento: todo verde'));
process.exit(fails.length ? 1 : 0);
