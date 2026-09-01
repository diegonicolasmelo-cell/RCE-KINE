/**
 * pve_otra_motivo.js — LA PVE QUE NO SE HIZO TIENE QUE DECIR POR QUÉ, Y ESE
 * PORQUÉ TIENE QUE LLEGAR A LA ESTADÍSTICA.
 *
 * 🔴 DE DÓNDE SALE (28-ago-2026, pedido de Manuel): con la PVE marcada en «No»,
 * el desplegable de razón se podía dejar en blanco y el campo de al lado decía
 * literalmente «Detalle (opcional)». Nadie validaba `PVE_SC_RAZON`: ni
 * `guardar()` ni el servidor. Y aunque la razón estaba guardada en la planilla
 * desde jul-2026, la pestaña Estadísticas NO la miraba: contaba las PVE
 * realizadas y su éxito, y de las que no se hicieron no decía ni cuántas.
 *
 * LO QUE SE FIJA AQUÍ:
 *  1. `validarPVE` rechaza «No» sin razón, y «Otra» sin motivo escrito — en el
 *     SERVIDOR, que es la única capa por la que pasa también el ➕ del Registro
 *     Diario (corrección retroactiva), que no pasa por `guardar()`.
 *  2. Las otras ocho razones NO exigen el detalle: se explican solas.
 *  3. `obtenerStats` cuenta las PVE no realizadas y las desglosa por motivo,
 *     con el subregistro de «Otra» y el hueco aparte.
 *  4. La regla dice lo mismo en sus tres sitios (pantalla, validación,
 *     estadística).
 *
 * ⚖️ EL LADO SIMÉTRICO, que es lo que esta guardia cuida de verdad — «¿qué dato
 * VERDADERO deja de verse?»:
 *
 *  · **Un turno viejo no se puede quedar trabado.** Las evoluciones guardadas
 *    antes de esta regla no tienen razón, y la rama PVE NO se repuebla al
 *    reabrir el turno: si la validación disparara con `PVE_VAL` ausente del
 *    payload, re-guardar cualquiera de esos turnos sería imposible y no habría
 *    salida desde la pantalla. Por eso `PVE_VAL` ausente = nada que validar, y
 *    aquí se comprueba explícitamente.
 *  · **La extubación sin PVE no es un hueco.** Ahí el formulario manda razón y
 *    detalle vacíos A PROPÓSITO (el evento del turno es la extubación, con su
 *    tipo). Ni se le exige razón ni se cuenta como «sin motivo registrado», o la
 *    barra del hueco se llenaría de turnos que sí están explicados.
 *  · **Y `EXT_TIPO='sin_condiciones'` NO es una extubación** (decisión clínica
 *    jul-2026): significa justamente que no hubo PVE. Esas filas históricas
 *    tienen que seguir mostrando su razón, no la etiqueta de extubado.
 *
 * Uso: node build/checks/pve_otra_motivo.js
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
const orden = o => Object.keys(o).sort().reduce((r, k) => (r[k] = o[k], r), {});
const eqT = (l, got, want) => eq(l, orden(got), orden(want));

/* ══ 1 · EL CASO QUE SE COLABA ═════════════════════════════════════════ */
console.log('\n1 · validarPVE — «No» exige razón, y «Otra» exige el motivo');

const base = { ID_CAMA: 'C1', TURNO_KEY: '2026-08-05-Dia', TURNO: 'Dia', PLAN_FIRMA_KINE: 'MFB' };
const val = extra => validarPayloadEvolucion(Object.assign({}, base, extra));
const hayPVE = errs => errs.filter(m => /^PVE:/.test(m));

const sinRaz = hayPVE(val({ PVE_VAL: 'no', PVE_SC_RAZON: '', PVE_SC_DET: '' }));
si('«No» sin razón → rechazado', sinRaz.length === 1);
si('el mensaje dice de qué se trata', /no se realiz/i.test(sinRaz[0] || ''));

const sinMot = hayPVE(val({ PVE_VAL: 'no', PVE_SC_RAZON: 'Otra', PVE_SC_DET: '' }));
si('«Otra» sin motivo → rechazado', sinMot.length === 1);
si('el mensaje nombra el motivo', /motivo/i.test(sinMot[0] || ''));
si('y nombra la razón elegida', /Otra/.test(sinMot[0] || ''));

eq('«Otra» con motivo → pasa',
  hayPVE(val({ PVE_VAL: 'no', PVE_SC_RAZON: 'Otra', PVE_SC_DET: 'Pabellón de urgencia a media mañana' })), []);
eq('«Otra» con motivo de solo espacios → rechazado',
  hayPVE(val({ PVE_VAL: 'no', PVE_SC_RAZON: 'Otra', PVE_SC_DET: '   ' })).length, 1);
eq('razón de solo espacios cuenta como vacía',
  hayPVE(val({ PVE_VAL: 'no', PVE_SC_RAZON: '   ' })).length, 1);

/* ══ 2 · LO QUE NO SE LE COBRA AL TURNO ════════════════════════════════ */
console.log('\n2 · Las razones que se explican solas no piden nada más');
['Sin condiciones ventilatorias', 'Inestabilidad hemodinámica', 'Sedación profunda / BNM',
 'Compromiso de conciencia', 'Secreciones abundantes', 'Menos de 24 h de VM',
 'Indicación médica de mantener soporte', 'Procedimiento o pabellón programado'].forEach(r => {
  eq('«' + r + '» sin detalle pasa', hayPVE(val({ PVE_VAL: 'no', PVE_SC_RAZON: r, PVE_SC_DET: '' })), []);
});

/* ══ 3 · EL LADO SIMÉTRICO: LO QUE NO SE PUEDE TRABAR ══════════════════ */
console.log('\n3 · Nada de esto se puede quedar sin poder guardar');
// `_podarEventosPayload` BORRA el grupo PVE cuando la rama no está activa, y el
// servidor preserva lo guardado. Un turno viejo re-guardado llega SIN PVE_VAL.
eq('payload SIN PVE_VAL → no valida nada', hayPVE(val({ PLAN_FIRMA_KINE: 'MFB' })), []);
eq('PVE = sí → no valida nada', hayPVE(val({ PVE_VAL: 'si', PVE_RESULTADO: 'superada' })), []);
eq('PVE = no corresponde → no valida nada', hayPVE(val({ PVE_VAL: 'nc' })), []);
// Extubación sin PVE: el formulario manda razón y detalle vacíos a propósito.
eq('extubación sin PVE → no se le exige razón',
  hayPVE(val({ PVE_VAL: 'no', EXT_OCURRIO: true, EXT_TIPO: 'sin_protocolo', PVE_SC_RAZON: '' })), []);
eq('y da igual cómo venga escrito el booleano',
  hayPVE(val({ PVE_VAL: 'no', EXT_OCURRIO: 'TRUE', EXT_TIPO: 'autoextubacion', PVE_SC_RAZON: '' })), []);
// 🪤 Pero 'sin_condiciones' NO es una extubación: significa que no hubo PVE.
eq('«sin_condiciones» SÍ exige razón (no es extubación)',
  hayPVE(val({ PVE_VAL: 'no', EXT_OCURRIO: true, EXT_TIPO: 'sin_condiciones', PVE_SC_RAZON: '' })).length, 1);
// Y la validación de PVE no puede haberse comido la de KTM.
si('validarKTM sigue viva en el mismo payload',
  val({ KTM_NO_REALIZADA: true, KTM_NO_RAZON: 'Otro', KTM_NO_COMENTARIO: '' })
    .filter(m => /^KTM:/.test(m)).length === 1);

/* ══ 4 · LA ESTADÍSTICA: EL MES, VIVOS Y EGRESADOS ═════════════════════ */
const evo = (o) => Object.assign({
  PATIENT_ID: 'p1', ID_CAMA: 'C1', FECHA: '2026-08-05', TURNO: 'Dia',
  TURNO_KEY: '2026-08-05-Dia', PAC_DIAG_REM: 'Respiratorio', VENT_SOPORTE: 'VM',
}, o);

DB.EVOLUCIONES = [
  evo({ FECHA: '2026-08-01', PVE_VAL: 'no', PVE_SC_RAZON: 'Otra', PVE_SC_DET: 'Pabellón de urgencia' }),
  evo({ FECHA: '2026-08-02', PVE_VAL: 'no', PVE_SC_RAZON: 'Otra', PVE_SC_DET: 'pabellón de urgencia' }),
  evo({ FECHA: '2026-08-03', PVE_VAL: 'no', PVE_SC_RAZON: 'Otra', PVE_SC_DET: '' }),   // antes de la regla
  evo({ FECHA: '2026-08-04', PVE_VAL: 'no', PVE_SC_RAZON: 'Sedación profunda / BNM' }),
  evo({ FECHA: '2026-08-05', PVE_VAL: 'no', PVE_SC_RAZON: '' }),                        // el hueco
  evo({ FECHA: '2026-08-06', PVE_VAL: 'si', PVE_RESULTADO: 'superada' }),
  evo({ FECHA: '2026-08-07', PVE_VAL: 'nc' }),
];
DB.EVOLUCIONES_ARCHIVO = [
  // EGRESADO: si la pestaña leyera solo la hoja viva, este mes se perdería
  evo({ PATIENT_ID: 'p2', FECHA: '2026-08-08', PVE_VAL: 'no', PVE_SC_RAZON: 'Otra', PVE_SC_DET: 'PABELLÓN DE URGENCIA ' }),
  // La cuarta forma empata con la primera: «Pabellón de urgencia» queda 2 a 1 a 1
  // y es la que el equipo tiene que ver en la tabla. Con las tres a 1 no había
  // «variante más escrita» y la fila la ganaba el orden alfabético — que es lo
  // que esta guardia cazó de su propio fixture la primera vez que corrió.
  evo({ PATIENT_ID: 'p2', FECHA: '2026-08-11', PVE_VAL: 'no', PVE_SC_RAZON: 'Otra', PVE_SC_DET: 'Pabellón de urgencia ' }),
  // extubado sin PVE: no es un hueco, es otro evento
  evo({ PATIENT_ID: 'p2', FECHA: '2026-08-09', PVE_VAL: 'no', PVE_SC_RAZON: '',
        EXT_OCURRIO: 'TRUE', EXT_TIPO: 'autoextubacion' }),
  // fila histórica: 'sin_condiciones' con su razón escrita
  evo({ PATIENT_ID: 'p2', FECHA: '2026-08-10', PVE_VAL: 'no', PVE_SC_RAZON: 'Menos de 24 h de VM',
        EXT_OCURRIO: 'TRUE', EXT_TIPO: 'sin_condiciones' }),
];
DB.CAMAS_ESTADO = []; DB.REINTUBACIONES = []; DB.ARCHIVO_PACIENTES = [];

const st = obtenerStats('2026-08-01', '2026-08-31').data;

console.log('\n4 · La pestaña cuenta las PVE que NO se hicieron');
si('la pestaña trae el bloque pve', !!st.pve);
// 🪤 Si el bloque no existe todavía, esta guardia tiene que seguir corriendo y
// LISTAR lo que falta. Reventar con un stack trace en la primera línea deja al
// que rompió algo sin saber qué rompió — y sin ver las secciones de más abajo,
// que son las que dicen si además se perdió un dato verdadero.
const P = st.pve || {};
eq('PVE no realizadas (vivos + egresados)', P.noRealizadas, 9);
eq('PVE realizadas sigue igual', st.eventos.pveRealizadas, 1);

console.log('\n5 · Los motivos, desglosados');
eqT('barra de motivos', P.motivosNo || {}, {
  'Otra': 5,
  'Sedación profunda / BNM': 1,
  'Menos de 24 h de VM': 1,
  'Sin motivo registrado': 1,
  'Extubación en el turno (sin PVE)': 1,
});
// Nada se pierde por el camino: la barra suma exactamente el total.
eq('la barra suma el total de no realizadas',
  Object.keys(P.motivosNo || {}).reduce((t, k) => t + P.motivosNo[k], 0), P.noRealizadas);

console.log('\n6 · Subregistro de «Otra»: el motivo se ve, y el que falta se marca');
const otras = P.otros || [];
eq('solo «Otra» entra al subregistro', otras.every(x => x.motivo === 'Otra'), true);
// «Pabellón de urgencia» / «pabellón de urgencia» / «PABELLÓN DE URGENCIA » son UNA fila.
const pab = otras.find(x => /pabell/i.test(x.detalle));
si('las cuatro formas se cuentan juntas', pab && pab.n === 4);
eq('la etiqueta es la variante MÁS escrita', pab && pab.detalle, 'Pabellón de urgencia');
eq('y avisa cuántas formas unió', pab && pab.variantes, 3);
eq('el mes queda desglosado', pab && pab.meses, { '2026-08': 4 });
const vacia = otras.find(x => !x.detalle);
si('el «Otra» sin motivo aparece, no se esconde', !!vacia && vacia.n === 1);
eq('y se cuenta como deuda', P.sinDetalle, 1);

console.log('\n7 · El hueco va aparte y no se lleva a los explicados');
eq('turnos sin ninguna razón', (P.sinMotivo || {}).n, 1);
eq('y su mes', (P.sinMotivo || {}).meses, { '2026-08': 1 });
eq('el extubado NO cuenta como hueco', (P.motivosNo || {})['Extubación en el turno (sin PVE)'], 1);
eq('«sin_condiciones» conserva SU razón',
  (P.motivosNo || {})['Menos de 24 h de VM'], 1);
eq('el hueco está FUERA de la tabla de «Otra»',
  otras.some(x => x.motivo === 'Sin motivo registrado'), false);

console.log('\n8 · El pivot lleva el porqué junto al «no»');
const piv = datosPivot('2026-08-01', '2026-08-31').data.filas;
const fPiv = piv.find(r => r.FECHA === '2026-08-01');
eq('columna PVE_MOTIVO', fPiv && fPiv.PVE_MOTIVO, 'Otra');
eq('columna PVE_DETALLE', fPiv && fPiv.PVE_DETALLE, 'Pabellón de urgencia');
eq('la PVE realizada no inventa motivo',
  piv.find(r => r.FECHA === '2026-08-06').PVE_MOTIVO, '');
eq('«no corresponde» tampoco', piv.find(r => r.FECHA === '2026-08-07').PVE_MOTIVO, '');
// Y la fórmula es UNA: pestaña y pivot no pueden decir cosas distintas.
eq('pivot y pestaña usan la misma etiqueta',
  piv.filter(r => r.PVE_MOTIVO === 'Otra').length, (P.motivosNo || {})['Otra']);

/* ══ 9 · LA REGLA DICE LO MISMO EN SUS TRES SITIOS ═════════════════════ */
// Si pantalla y servidor se separan, el turno ve un campo opcional que el
// servidor va a rechazar, sin forma de destrabarlo. Si se separa el subregistro,
// se pide un porqué que después nadie muestra.
console.log('\n9 · La regla dice lo mismo en sus tres sitios');
const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
const lista = (txt, nombre) => {
  const m = new RegExp(nombre + "\\s*=\\s*\\[([^\\]]*)\\]").exec(txt);
  return m ? m[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : null;
};
const enFront = lista(idx, 'PVE_RAZONES_CON_MOTIVO');
si('index.html declara su lista', !!enFront);
eq('pantalla y servidor obligan en lo MISMO', _PVE_RAZON_EXIGE_MOTIVO, enFront);
eq('el subregistro muestra exactamente eso', _PVE_RAZON_SUBREGISTRO, enFront);
eq('y la regla es solo «Otra»', enFront, ['Otra']);
// El catálogo del desplegable tiene que ofrecer lo que la regla nombra, con esa
// grafía exacta: «Otra» con A. Un renombre a «Otro» dejaría la regla apuntando
// a una opción que ya no existe y nadie se enteraría.
const bloquePVE = idx.slice(idx.indexOf('id="fPveSCraz"'), idx.indexOf('id="fPveSCdet"'));
const opcPVE = (bloquePVE.match(/<option>([^<]+)<\/option>/g) || []).map(o => o.replace(/<\/?option>/g, ''));
si('el desplegable de PVE ofrece «Otra»', opcPVE.indexOf('Otra') !== -1);
eq('las nueve razones siguen en el catálogo', opcPVE.length, 9);
// El campo dejó de anunciarse como opcional, que era la mitad del problema.
si('el detalle ya no se llama «(opcional)» a secas',
  /id="fPveSCdet"[^>]*oninput="hPveSCraz\(\)"/.test(idx));
si('la pantalla llama al pintado al elegir razón',
  /id="fPveSCraz"[^>]*onchange="hPveSCraz\(\)"/.test(idx));
si('el guardado del front bloquea con el mismo predicado',
  /_pveOtraSinMotivo\(\)/.test(idx) && /_pveRazonFalta\(\)/.test(idx));

/* ══ CIERRE ════════════════════════════════════════════════════════════ */
console.log('\n' + (fails.length ? '❌ FALLA (' + fails.length + '): ' + fails.join(' · ')
                                 : '✅ pve_otra_motivo: todo verde'));
process.exit(fails.length ? 1 : 0);
