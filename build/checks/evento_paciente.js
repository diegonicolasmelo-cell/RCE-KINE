// evento_paciente.js — El ➕ le escribe al paciente que se está mirando.
//
// EL BUG QUE CIERRA. `ID_EVOLUCION = 'CAMA_<n>_<turnoKey>'` identifica una CAMA
// en un turno, no a una persona. Cuando una cama rota —un paciente egresa y otro
// ingresa el mismo día, incluso el mismo turno— las dos filas comparten esa
// clave. En la planilla real pasa 39 veces en agosto-2026, y la cama 6 estuvo
// así 23 turnos seguidos, del 1 al 14.
//
// `anexarEventoRapido` resolvía por esa clave con `repoBuscarPorId`, que
// devuelve LA PRIMERA y corta. Consecuencia medida: el kinesiólogo abre en el
// Registro Diario el turno del paciente que egresó, anexa una ecografía, y la
// ecografía aterriza en la ficha del que está ahora en esa cama. Además tomaba
// el `PATIENT_ID` de la CAMA —el ocupante de hoy— para la fila de
// PROCEDIMIENTOS, así que nacía una fila mixta: pid de uno, evolución de otro.
//
// 🪤 LO QUE ESTA GUARDIA CUIDA POR EL OTRO LADO. Cerrar esto de más es tan malo
// como dejarlo abierto: si el candado se pasa de celoso, al paciente correcto no
// se le puede escribir. Por eso hay asserts de RECUPERACIÓN (el mismo anexo con
// el episodio declarado tiene que entrar) y de NO REGRESIÓN (el ➕ de todos los
// días, sobre una cama sin rotar, sigue funcionando igual).
//
// 🔴 EL FIXTURE ES DECLARADO A MANO, y se dice aquí. Reproduce el estado que
// deja una cama rotada (episodio archivado + episodio vivo con la MISMA clave),
// que en producción se alcanza por ruta de interfaz. No se disfraza de ruta real.
//
// Uso: node build/checks/evento_paciente.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

/* ══ Arnés ═══════════════════════════════════════════════════════════════
   Modela lo que el arnés viejo de `eventos.js` NO modelaba y por eso no medía:
   · las DOS hojas (viva y archivo), porque el egresado vive en el archivo;
   · el NÚMERO DE FILA, porque escribir «por clave» es justamente el bug;
   · `repoBuscarPorId`/`repoActualizar` devolviendo LA PRIMERA coincidencia,
     que es el comportamiento real de repo.gs y la causa del daño.            */
const FILA = 4;                       // primera fila de datos (hay 3 encabezados)
let DB, HITOS;

const reset = () => {
  DB = {
    // Cama 6: rotó el 6-ago. Ana egresó (archivada), Bruno ingresó (viva).
    // Las dos filas comparten ID_EVOLUCION: es el duplicado real.
    EVOLUCIONES: [
      { ID_EVOLUCION: 'CAMA_6_2026-08-06-Noche', ID_CAMA: '6', PATIENT_ID: 'pBRUNO',
        TURNO_KEY: '2026-08-06-Noche', FECHA: '2026-08-06', TURNO: 'Noche',
        PAC_NOMBRE: 'Bruno (ocupa la cama ahora)', PROC_JSON: '[]', PROC_CANTIDAD: 0, PROC_RESUMEN: '' },
      { ID_EVOLUCION: 'CAMA_9_2026-08-06-Noche', ID_CAMA: '9', PATIENT_ID: 'pDANIELA',
        TURNO_KEY: '2026-08-06-Noche', FECHA: '2026-08-06', TURNO: 'Noche',
        PAC_NOMBRE: 'Daniela (cama sin rotar)', PROC_JSON: '[]', PROC_CANTIDAD: 0, PROC_RESUMEN: '' },
      // Fila anónima: quedó sin pid tras reparar la cama a mano. Debe poder
      // recibir anexos (si no, se esconderían procedimientos verdaderos).
      { ID_EVOLUCION: 'CAMA_12_2026-08-06-Noche', ID_CAMA: '12', PATIENT_ID: '',
        TURNO_KEY: '2026-08-06-Noche', FECHA: '2026-08-06', TURNO: 'Noche',
        PAC_NOMBRE: 'Sin identidad (cama reparada)', PROC_JSON: '[]', PROC_CANTIDAD: 0, PROC_RESUMEN: '' },
    ],
    EVOLUCIONES_ARCHIVO: [
      { ID_EVOLUCION: 'CAMA_6_2026-08-06-Noche', ID_CAMA: '6', PATIENT_ID: 'pANA',
        TURNO_KEY: '2026-08-06-Noche', FECHA: '2026-08-06', TURNO: 'Noche',
        PAC_NOMBRE: 'Ana (egresó ese turno)',
        PROC_JSON: '["KTR","BRONCOSCOPÍA"]', PROC_CANTIDAD: 2, PROC_RESUMEN: 'KTR, BRONCOSCOPÍA' },
      // Carla egresó y su cama quedó VACÍA: el egresado corregible sin ocupante.
      { ID_EVOLUCION: 'CAMA_3_2026-08-04-Dia', ID_CAMA: '3', PATIENT_ID: 'pCARLA',
        TURNO_KEY: '2026-08-04-Dia', FECHA: '2026-08-04', TURNO: 'Dia',
        PAC_NOMBRE: 'Carla (egresada, cama vacía)', PROC_JSON: '[]', PROC_CANTIDAD: 0, PROC_RESUMEN: '' },
    ],
    CAMAS_ESTADO: [
      { ID_CAMA: '6', OCUPADA: true, PATIENT_ID: 'pBRUNO', DISP_HME_FECHA: '2026-08-14', DISP_CONFIRMADO: true },
      { ID_CAMA: '9', OCUPADA: true, PATIENT_ID: 'pDANIELA', DISP_HME_FECHA: '2026-08-10', DISP_CONFIRMADO: true },
      { ID_CAMA: '12', OCUPADA: true, PATIENT_ID: 'pEVA', DISP_HME_FECHA: '2026-08-12', DISP_CONFIRMADO: true },
      { ID_CAMA: '3', OCUPADA: false, PATIENT_ID: '', DISP_HME_FECHA: '', DISP_CONFIRMADO: false },
    ],
    PROCEDIMIENTOS: [],
  };
  HITOS = [];
};
reset();

const filasDe = h => (DB[h] || []).map((r, i) => ({ obj: Object.assign({}, r), fila: FILA + i }));
global.repoLeerTodosConFila = h => filasDe(h);
global.repoLeerFila = (h, f) => Object.assign({}, (DB[h] || [])[f - FILA]);
global.repoEscribirFila = (h, f, obj) => { DB[h][f - FILA] = Object.assign({}, obj); };
global.repoUpsertEnFila = (h, f, obj) => { if (f === -1) { DB[h].push(obj); return 'crear'; } DB[h][f - FILA] = Object.assign({}, obj); return 'actualizar'; };
// LA PRIMERA y corta — fiel a repo.gs, y por eso reproduce el daño.
global.repoBuscarPorId = (h, campo, id) => (DB[h] || []).find(r => String(r[campo]) === String(id)) || null;
global.repoActualizar = (h, campo, id, cambios) => { const r = global.repoBuscarPorId(h, campo, id); if (r) Object.assign(r, cambios); return !!r; };
global.repoLeerTodos = (h, k, v) => (DB[h] || []).filter(r => k === undefined || String(r[k]) === String(v)).map(r => Object.assign({}, r));
global.repoInsertar = (h, obj) => { (DB[h] = DB[h] || []).push(obj); return obj; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.conLock = fn => fn();
global.uid = p => p + '_x' + (HITOS.length + DB.PROCEDIMIENTOS.length);
global.hoyISO = () => '2026-08-20';
global.ahoraTS = () => '2026-08-20 10:00';
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE' };
global.Logger = { log: () => {} };
global.SpreadsheetApp = { flush: () => {} };
global.Session = { getScriptTimeZone: () => 'America/Santiago' };
global._tz = () => 'America/Santiago';   // vive en infra.gs, que aquí no se carga
// Copia FIEL de svc_stats.gs:9 — cargar la hoja entera arrastraría medio motor.
global._statISO = v => {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return global.Utilities.formatDate(v, 'America/Santiago', 'yyyy-MM-dd');
  }
  return String(v).slice(0, 10);
};
// formatDate FORMATEA de verdad: devolver una fecha fija (como hacen otras
// guardias) haría que `_fechaEfectivaTurno` diera siempre lo mismo y el assert
// «el hito se fecha en SU turno» pasaría sin medir nada.
global.Utilities = {
  getUuid: () => 'uuid-prueba',
  formatDate: (d, tz, fmt) => {
    const p = n => String(n).padStart(2, '0');
    const iso = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    return String(fmt).indexOf('HH') >= 0
      ? iso + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds())
      : iso;
  },
};
// El hito se stubea a propósito: lo que hay que medir es CON QUÉ PID lo llama
// el ➕, que es la decisión bajo prueba, no cómo lo escribe svc_timeline.
global._agregarHitoInterno = h => { HITOS.push(Object.assign({ via: 'sync' }, h)); };
global._agregarHitoInternoSinSync = h => { HITOS.push(Object.assign({ via: 'sinsync' }, h)); };
global._hitoAnexoPrefijo = n => '🔬 ' + n;
/* `_procClaveHito` (svc_timeline.gs) se trae del FUENTE, no se imita: normaliza
   «PRONO 19:00 HRS» → «PRONO», y de esa clave depende que el ➕ reconozca el
   ciclo de posición (`anexarEventoRapido`, ago-2026). Un doble escrito a mano
   aquí podría divergir de la normalización real y dejar esta guardia verde
   sobre una regla que no existe. Se trae la función sola para no cargar
   svc_timeline entero, por la misma razón de siempre: traería sus hitos reales. */
global._procClaveHito = (function () {
  const _s = fs.readFileSync(path.join(v2, 'svc_timeline.gs'), 'utf8');
  const _i = _s.indexOf('function _procClaveHito');
  if (_i < 0) throw new Error('svc_timeline.gs ya no declara _procClaveHito');
  return (0, eval)('(' + _s.slice(_i, _s.indexOf('\n}', _i) + 2) + ')');
})();
// El motor de texto vive en dominio_texto.gs; aquí solo interesa que anular
// llegue (o no llegue) al camino de escritura, no qué narra.
global.generarTextoEvolucion = () => 'texto de prueba';

// El candado del ➕ (21-ago-2026, candado_mas.js): corregir el PASADO exige
// sesión de coordinación. Aquí se stubea su CONTRATO — esta guardia mide el
// RUTEO por episodio, y sus correcciones viajan con la llave puesta; la
// libertad del turno de hoy (sin llave) la mide candado_mas.js sección 1.
global.coordExigirSesion = t => t === 'COORD_OK'
  ? { ok: true, firma: 'MCC', usuario: 'coord1' }
  : { ok: false, error: 'Tu sesión de coordinación expiró. Vuelve a entrar con tu clave.', codigo: 'NA' };

eval(fs.readFileSync(path.join(v2, 'infra_fechas.gs'), 'utf8'));
eval(fs.readFileSync(path.join(v2, 'svc_evoluciones.gs'), 'utf8'));
eval(fs.readFileSync(path.join(v2, 'svc_eventos.gs'), 'utf8'));

/* 🪤 El reloj se fija DESPUÉS de los eval, no antes: `infra_fechas.gs` define
   `hoyISO`/`ahoraTS` y PISA cualquier stub previo. Con las reales, la guardia
   dependería del día en que se corre — la bomba de tiempo que ya explotó una vez
   en este repo (`lista_y_filtros.js`, verde solo el día que se escribió). */
global.hoyISO = () => '2026-08-20';
global.ahoraTS = () => '2026-08-20 10:00';

const anexo = extra => Object.assign({
  idCama: '6', turnoKey: '2026-08-06-Noche', tipo: 'procedimiento',
  proc: 'ECOGRAFÍA DIAFRAGMÁTICA', hora: '14:30',
}, extra);
const evoDe = (hoja, pid) => (DB[hoja] || []).find(r => String(r.PATIENT_ID) === pid) || {};
const mixtas = () => DB.PROCEDIMIENTOS.filter(p => {
  // Se empareja por el PAR (clave, pid), no por la clave sola: emparejar solo
  // por ID_EVOLUCION da falso rojo sobre un estado correcto.
  const todas = (DB.EVOLUCIONES || []).concat(DB.EVOLUCIONES_ARCHIVO || []);
  const calza = todas.some(e => String(e.ID_EVOLUCION) === String(p.ID_EVOLUCION) &&
                                String(e.PATIENT_ID) === String(p.PATIENT_ID));
  return !calza;
});

/* ══ 1 · El anexo a ciegas sobre una cama rotada NO se escribe ══════════ */
console.log('1 · Cama rotada, sin declarar el episodio: no se elige por la clave');
const antesAna = evoDe('EVOLUCIONES_ARCHIVO', 'pANA').PROC_JSON;
const nProcs0 = DB.PROCEDIMIENTOS.length, nHitos0 = HITOS.length;
const r1 = anexarEventoRapido(anexo(), { firma: 'Klgo. Prueba' });
eq('el anexo ambiguo se rechaza', r1.ok, false);
eq('…y con código de validación', r1.codigo, 'V');
eq('el PROC_JSON de Ana queda intacto', evoDe('EVOLUCIONES_ARCHIVO', 'pANA').PROC_JSON, antesAna);
eq('el PROC_JSON de Bruno tampoco recibe lo ajeno', evoDe('EVOLUCIONES', 'pBRUNO').PROC_JSON, '[]');
eq('PROCEDIMIENTOS no crece', DB.PROCEDIMIENTOS.length, nProcs0);
eq('TIMELINE no crece', HITOS.length, nHitos0);
eq('no nace ninguna fila mixta (pid de uno, evolución de otro)', mixtas().length, 0);
si('el mensaje no nombra al otro paciente',
  !/Ana|Bruno|pANA|pBRUNO/.test(String(r1.error || '')));
si('…y sí dice de qué cama habla', /cama 6|cama  ?6/i.test(String(r1.error || '')));

/* ══ 2 · Recuperación: con el episodio declarado, SÍ se escribe ═════════ */
console.log('\n2 · El mismo anexo, declarando el episodio, entra donde corresponde');
reset();
const nP2 = DB.PROCEDIMIENTOS.length;
const r2 = anexarEventoRapido(anexo({ patientId: 'pANA', coordToken: 'COORD_OK' }), { firma: 'Klgo. Prueba' });
si('el anexo al episodio correcto se acepta', r2.ok);
si('entra en el PROC_JSON de Ana', /ECOGRAFÍA/.test(evoDe('EVOLUCIONES_ARCHIVO', 'pANA').PROC_JSON || ''));
eq('…y NO en el de Bruno', evoDe('EVOLUCIONES', 'pBRUNO').PROC_JSON, '[]');
eq('nace exactamente una fila de PROCEDIMIENTOS', DB.PROCEDIMIENTOS.length, nP2 + 1);
eq('con el pid del EPISODIO, no el de la cama', (DB.PROCEDIMIENTOS[0] || {}).PATIENT_ID, 'pANA');
eq('sin filas mixtas', mixtas().length, 0);
eq('el hito se fecha en SU turno y con SU pid', (HITOS[0] || {}).patientId, 'pANA');

/* ══ 3 · Egresado corregible: cama vacía, turno archivado ═══════════════ */
console.log('\n3 · A un egresado se le puede corregir el turno aunque su cama esté vacía');
reset();
const r3 = anexarEventoRapido({
  idCama: '3', turnoKey: '2026-08-04-Dia', tipo: 'procedimiento',
  proc: 'KTR', patientId: 'pCARLA', coordToken: 'COORD_OK',
}, { firma: 'Klgo. Prueba' });
si('el anexo sobre el episodio archivado se acepta', r3.ok);
si('crece el PROC_JSON en EVOLUCIONES_ARCHIVO', /KTR/.test(evoDe('EVOLUCIONES_ARCHIVO', 'pCARLA').PROC_JSON || ''));
eq('con el pid de Carla', (DB.PROCEDIMIENTOS[0] || {}).PATIENT_ID, 'pCARLA');

/* ══ 4 · NO REGRESIÓN: el ➕ de todos los días sigue igual ══════════════ */
console.log('\n4 · La cama que NO rotó funciona exactamente como antes');
reset();
const r4 = anexarEventoRapido({
  idCama: '9', turnoKey: '2026-08-06-Noche', tipo: 'procedimiento', proc: 'KTR', coordToken: 'COORD_OK',
}, { firma: 'Klgo. Prueba' });
si('el anexo sin declarar episodio se acepta en cama sin rotar', r4.ok);
si('entra en el PROC_JSON de Daniela', /KTR/.test(evoDe('EVOLUCIONES', 'pDANIELA').PROC_JSON || ''));
eq('con su pid', (DB.PROCEDIMIENTOS[0] || {}).PATIENT_ID, 'pDANIELA');

console.log('\n4b · La fila sin identidad sigue aceptando anexos (cama reparada a mano)');
reset();
const r4b = anexarEventoRapido({
  idCama: '12', turnoKey: '2026-08-06-Noche', tipo: 'procedimiento', proc: 'KTR', coordToken: 'COORD_OK',
}, { firma: 'Klgo. Prueba' });
si('el anexo sobre la fila anónima se acepta', r4b.ok);
eq('y la fila sigue SIN pid: no se le adopta identidad por inferencia',
  evoDe('EVOLUCIONES', '').PATIENT_ID, '');

/* ══ 5 · Dispositivos: el reloj es de la CAMA, no del episodio ══════════ */
console.log('\n5 · Un cambio de HME sobre un episodio cerrado no le reinicia el reloj al de ahora');
reset();
const hmeAntes = DB.CAMAS_ESTADO.find(c => c.ID_CAMA === '6').DISP_HME_FECHA;
const r5 = anexarEventoRapido({
  idCama: '6', turnoKey: '2026-08-06-Noche', tipo: 'hme', patientId: 'pANA', coordToken: 'COORD_OK',
}, { firma: 'Klgo. Prueba' });
eq('el cambio de dispositivo sobre episodio cerrado se rechaza', r5.ok, false);
eq('la fecha de HME del ocupante actual queda intacta',
  DB.CAMAS_ESTADO.find(c => c.ID_CAMA === '6').DISP_HME_FECHA, hmeAntes);

console.log('\n5b · Y sobre el episodio EN CAMA sigue funcionando');
reset();
const r5b = anexarEventoRapido({ idCama: '9', turnoKey: '2026-08-06-Noche', tipo: 'hme', coordToken: 'COORD_OK' }, { firma: 'K' });
si('el cambio de HME normal se acepta', r5b.ok);

/* ══ 6 · El rechazo deja rastro ═══════════════════════════════════════════
   Sin esto, alguien intenta corregir un turno, el candado lo rechaza, abandona
   — y no queda ni una línea de que haya pasado. Es el riesgo que el propio
   diseño del candado reconoce y que, sin auditar, es indetectable después. */
console.log('\n6 · Un rechazo del candado queda escrito en AUDIT_LOG');
reset();
const AUDIT = [];
global.auditar = a => { AUDIT.push(a); };
eval(fs.readFileSync(path.join(v2, 'api.gs'), 'utf8'));
const ctx6 = { email: 'kine@hospital.cl', firma: 'Klgo. Prueba' };
const datos6 = anexo();
const r6 = _auditar(ctx6, 'ANEXAR_EVENTO', () => anexarEventoRapido(datos6, ctx6), datos6);
eq('el anexo sigue rechazándose', r6.ok, false);
eq('y deja exactamente UNA fila de auditoría', AUDIT.length, 1);
eq('con la acción marcada como rechazo', (AUDIT[0] || {}).accion, 'ANEXAR_EVENTO_RECHAZADO');
eq('apuntando a la cama del intento', (AUDIT[0] || {}).idEntidad, '6');
si('con el motivo tal como lo vio la persona', /dos pacientes/.test((AUDIT[0] || {}).resumen || ''));
si('y sin el nombre ni el pid del otro paciente',
  !/Ana|Bruno|pANA|pBRUNO/.test((AUDIT[0] || {}).resumen || ''));

console.log('\n6b · Un anexo que SÍ entra sigue auditándose como antes');
reset();
AUDIT.length = 0;
const datos6b = anexo({ patientId: 'pANA', coordToken: 'COORD_OK' });
const r6b = _auditar(ctx6, 'ANEXAR_EVENTO', () => anexarEventoRapido(datos6b, ctx6), datos6b);
si('el anexo correcto se acepta', r6b.ok);
eq('y deja una sola fila, sin sufijo de rechazo', (AUDIT[0] || {}).accion, 'ANEXAR_EVENTO');
eq('con el pid del episodio corregido', (AUDIT[0] || {}).patientId, 'pANA');

/* ══ 7 · Anular no le reescribe el estado al de al lado ═══════════════════
   `anularEvento` termina llamando a `_syncCamaDesdeEvolucion`, que vuelca vía
   aérea, soporte, modo y fechas de inicio sobre CAMAS_ESTADO. Si la evolución
   es de un episodio que ya no ocupa la cama, eso le reescribe el censo AL
   OCUPANTE ACTUAL — escribe más lejos que el bug que esta tanda vino a cerrar. */
console.log('\n7 · Anular un evento de un episodio anterior no toca al ocupante de ahora');
reset();
const camaAntes = JSON.stringify(DB.CAMAS_ESTADO.find(c => c.ID_CAMA === '6'));
const r7 = anularEvento({ idCama: '6', turnoKey: '2026-08-06-Noche', tipo: 'pve_ext', patientId: 'pANA' },
  { firma: 'Klgo. Prueba' });
eq('la anulación sobre el episodio anterior se rechaza', r7.ok, false);
si('y el mensaje explica que le reescribiría el estado a otro',
  /paciente que está ahora|episodio anterior/i.test(String(r7.error || '')));
eq('la fila de la cama del ocupante actual queda byte a byte igual',
  JSON.stringify(DB.CAMAS_ESTADO.find(c => c.ID_CAMA === '6')), camaAntes);
si('el mensaje no nombra al otro paciente',
  !/Ana|Bruno|pANA|pBRUNO/.test(String(r7.error || '')));

console.log('\n7b · Y sobre su propio episodio el candado no se mete');
reset();
/* Se envuelve en try/catch a propósito: anular arrastra medio motor de texto y
   de censo, que este arnés no monta. Lo que hay que probar aquí NO es que anular
   funcione entero —eso lo cubren otras guardias— sino que el candado de
   identidad NO se dispare sobre el propio episodio. Un candado que también frena
   al paciente correcto es tan malo como no tenerlo. */
let msg7b = '';
try {
  const r7b = anularEvento({ idCama: '9', turnoKey: '2026-08-06-Noche', tipo: 'pve_ext' },
    { firma: 'Klgo. Prueba' });
  msg7b = String((r7b && r7b.error) || '');
} catch (e) { msg7b = String(e.message || ''); }
si('no lo frena el candado de identidad (puede fallar por otra cosa, no por esto)',
  !/paciente que está ahora|episodio anterior/i.test(msg7b));

console.log('\n' + (fails.length ? '❌ FALLARON ' + fails.length + ': ' + fails.join(' · ')
  : '✅ evento_paciente: el ➕ le escribe a quien corresponde'));
process.exit(fails.length ? 1 : 0);
