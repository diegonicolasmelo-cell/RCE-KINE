// coordinacion.js — Guardia del modo Coordinación.
//
// Existe por un caso real (ago-2026): un paciente estuvo 28 días en la UCI y al
// egresar quedó archivado con UN día de estadía, porque los días se congelan al
// dar de alta y su fecha de ingreso estaba mal. Corregirlo obligaba a abrir el
// editor de Apps Script.
//
// Lo que esta guardia protege, en orden de gravedad:
//
//   1. EL CANDADO ES DEL SERVIDOR. Con AUTH_DEV_MODE=TRUE cualquiera con el
//      enlace llega al dispatcher: si la protección viviera en la pantalla, el
//      modo sería decorativo. Aquí se llaman las acciones SIN sesión y se exige
//      que el servidor las rechace.
//   2. LA MARCA DE ARRASTRE (D7). Una fecha corregida no la pisa el turno
//      siguiente — «normalmente no se modifica, así que no debería poder
//      modificarla» (Manuel, 18-ago-2026). Sin esto la corrección de don
//      Ernesto duraba hasta que alguien guardara el turno de esa noche.
//   3. …pero sí se suelta cuando arranca un TRAMO CLÍNICO NUEVO (VM→VNI→VM),
//      porque ahí la fecha corregida ya no describe ese tramo.
//   4. La clave no se guarda ni viaja en ninguna parte legible.
//
// Uso: node build/checks/coordinacion.js
const { api, DB, SIM, CONFIG } = require('../sim/sim_srv.js');

const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };
const ok_ = (l, cond, det) => { console.log((cond ? '✅' : '❌') + ' ' + l + (det !== undefined ? ': ' + JSON.stringify(det) : '')); if (!cond) fails.push(l); };

/* ═══════════════════════════════════════════════════════════════════════════
   1 · EL CANDADO VIVE EN EL SERVIDOR
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n1 · Sin sesión no se escribe (aunque se llame la acción directo)');

let r = api('COORD_CORREGIR', { patientId: 'lo-que-sea', cambios: { NOMBRE: 'X' } }, null);
ok_('corregir SIN token es rechazado', r.ok === false, r.error);
eq('…y con el código correcto', r.codigo, 'NO_AUTORIZADO');

r = api('COORD_CORREGIR', { token: 'token-inventado', patientId: 'x', cambios: { NOMBRE: 'X' } }, null);
ok_('corregir con un token inventado también', r.ok === false);

r = api('COORD_FICHA', { token: 'token-inventado' }, null);
ok_('leer la ficha con token falso también', r.ok === false);

r = api('COORD_ENTRAR', { firma: 'XXX', clave: 'loquesea' }, null);
ok_('una firma que no está en la lista no entra', r.ok === false);

/* ═══════════════════════════════════════════════════════════════════════════
   2 · ENTRAR
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n2 · Entrar con clave');

const claves = {};
global.COORD_FIRMAS.forEach(f => {
  // La siembra real imprime temporales al azar; aquí se pone una conocida para
  // poder afirmar después que NO aparece guardada en ninguna parte.
  claves[f] = 'clave-de-prueba-' + f;
  global._coordGuardarClave(f, claves[f]);
});

r = api('COORD_ENTRAR', { firma: 'MCC', clave: 'la-que-no-es' }, null);
ok_('clave incorrecta se rechaza', r.ok === false);
ok_('…sin delatar si esa firma tiene clave o no', r.error === 'Clave incorrecta.', r.error);

r = api('COORD_ENTRAR', { firma: 'MCC', clave: claves.MCC }, null);
ok_('con la clave correcta entra', r.ok === true, r.error);
const TK = r.ok ? r.data.token : null;
eq('la sesión sabe de quién es', r.ok && r.data.firma, 'MCC');

const rD = api('COORD_ENTRAR', { firma: 'DMV', clave: claves.DMV }, null);
const TK_DMV = rD.ok ? rD.data.token : null;
ok_('las tres firmas entran, cada una con la suya', !!TK_DMV);

// Los fallidos son POR FIRMA: si fueran globales, teclear mal a propósito
// dejaría afuera a las tres, que es una forma barata de parar la unidad.
for (let i = 0; i < 4; i++) api('COORD_ENTRAR', { firma: 'MFB', clave: 'mala' }, null);
r = api('COORD_ENTRAR', { firma: 'MFB', clave: claves.MFB }, null);
ok_('MFB queda en espera tras agotar los intentos', r.ok === false, r.error);
r = api('COORD_ENTRAR', { firma: 'MCC', clave: claves.MCC }, null);
ok_('…y eso NO deja afuera a MCC', r.ok === true);

/* ═══════════════════════════════════════════════════════════════════════════
   3 · LA CLAVE NO SE GUARDA EN NINGUNA PARTE LEGIBLE
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n3 · La clave no aparece en ningún lado');

const P = global.PropertiesService.getScriptProperties();
const guardado = ['coord_hash_MCC', 'coord_sal_MCC'].map(k => String(P.getProperty(k) || '')).join('|');
ok_('lo guardado es una HUELLA, no la clave', guardado.indexOf(claves.MCC) === -1, guardado.slice(0, 24) + '…');
ok_('…y esa huella no está vacía', guardado.length > 20);
ok_('la clave NO está en CONFIG', JSON.stringify(CONFIG).indexOf(claves.MCC) === -1);
ok_('la clave NO está en AUDIT_LOG', JSON.stringify(DB.AUDIT_LOG).indexOf(claves.MCC) === -1);
ok_('la respuesta de entrar NO devuelve la clave', JSON.stringify(r).indexOf(claves.MCC) === -1);

/* ═══════════════════════════════════════════════════════════════════════════
   4 · EL CASO DE DON ERNESTO — corregir un EGRESADO recalcula sus días
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n4 · El egresado de 28 días archivado con 1');

DB.ARCHIVO_PACIENTES.push({
  ID_ARCHIVO: 'ARCH_1', PATIENT_ID: 'PID_ERNESTO', CAMA_ORIGEN: '10',
  NOMBRE: 'Ernesto Pizarro Soto', RUT: '11.111.111-1', EDAD: 71, SEXO: 'M',
  DIAGNOSTICO: 'Neumonía grave',
  FECHA_INGRESO: '2026-08-01', TS_INGRESO: '2026-08-01 08:00',
  FECHA_EGRESO: '2026-08-02', DIAS_TOTAL: 1, DIAS_VM_TOTAL: 1, DIAS_VA_TOTAL: 1,
  CORRECCIONES_JSON: '',
});

r = api('COORD_CORREGIR', { token: TK, patientId: 'PID_ERNESTO',
  cambios: { FECHA_INGRESO: '2026-07-05' }, horas: { FECHA_INGRESO: '14:30' } }, null);
ok_('la corrección se acepta', r.ok === true, r.error);
const arch = DB.ARCHIVO_PACIENTES.find(a => a.PATIENT_ID === 'PID_ERNESTO');
eq('la fecha quedó corregida', arch.FECHA_INGRESO, '2026-07-05');
eq('la hora viajó pegada a su fecha', arch.TS_INGRESO, '2026-07-05 14:30');
eq('LOS DÍAS CONGELADOS SE RECALCULARON', arch.DIAS_TOTAL, 28);

const corr = JSON.parse(arch.CORRECCIONES_JSON || '[]');
eq('quedó una corrección sellada en la ficha', corr.length, 1);
eq('…con el valor anterior', corr[0].a, '2026-08-01');
eq('…y firmada por QUIEN entró', corr[0].f, 'MCC');

const aud = DB.AUDIT_LOG.filter(x => x.accion === 'COORD_CORRIGE_FICHA');
eq('quedó en AUDIT_LOG', aud.length, 1);
ok_('…nombrando el valor viejo y el nuevo', /2026-08-01.*2026-07-05/.test(aud[0].resumen), aud[0].resumen);

// Guardar dos veces lo mismo no debe sellar dos veces.
r = api('COORD_CORREGIR', { token: TK, patientId: 'PID_ERNESTO', cambios: { FECHA_INGRESO: '2026-07-05' } }, null);
ok_('re-guardar el MISMO valor no sella otra corrección', r.ok && r.data.sinCambios === true);

/* ═══════════════════════════════════════════════════════════════════════════
   5 · LISTA BLANCA Y VALIDACIÓN
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n5 · Lista blanca y validación');

r = api('COORD_CORREGIR', { token: TK, patientId: 'PID_ERNESTO', cambios: { DIAS_TOTAL: 999 } }, null);
ok_('un campo fuera de la lista blanca se rechaza', r.ok === false, r.error);
eq('…y los días no se tocaron', DB.ARCHIVO_PACIENTES[0].DIAS_TOTAL, 28);

r = api('COORD_CORREGIR', { token: TK, patientId: 'PID_ERNESTO', cambios: { TEXTO_EVO_DIA: 'reescrito' } }, null);
ok_('el texto clínico NO se puede tocar desde aquí', r.ok === false);

r = api('COORD_CORREGIR', { token: TK, patientId: 'PID_ERNESTO', cambios: { FECHA_INGRESO: '05-07-2026' } }, null);
ok_('una fecha mal formada se rechaza', r.ok === false, r.error);

r = api('COORD_CORREGIR', { token: TK, patientId: 'PID_ERNESTO', cambios: { FECHA_INGRESO: '2026-09-01' } }, null);
ok_('el ingreso no puede quedar después del egreso', r.ok === false, r.error);

r = api('COORD_CORREGIR', { token: TK, patientId: 'PID_ERNESTO', cambios: { RUT: '11.111.111-9' } }, null);
ok_('un RUT con dígito verificador malo se rechaza', r.ok === false, r.error);

r = api('COORD_CORREGIR', { token: TK, patientId: 'PID_ERNESTO', cambios: { RUT: '' } }, null);
ok_('el RUT vacío SÍ se acepta (es opcional)', r.ok === true, r.error);

/* ═══════════════════════════════════════════════════════════════════════════
   6 · LA MARCA DE ARRASTRE (D7) — el corazón del asunto
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n6 · Una fecha corregida sobrevive al turno siguiente');

SIM.fecha = '2026-08-10'; SIM.hora = '10:00:00';
api('INGRESAR_PACIENTE', { idCama: '3', nombre: 'Paciente Arrastre', edad: 60, sexo: 'M',
  talla: 170, diagnostico: 'IRA', viaAerea: 'TOT', soporte: 'VM', modo: 'ACVC',
  horaIngreso: '09:00', firmaKine: 'DMV' }, null);

const camaAntes = DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === '3');
const pidArr = camaAntes.PATIENT_ID;
eq('el paciente entró con la fecha del día', String(camaAntes.FECHA_INGRESO).slice(0, 10), '2026-08-10');

// La coordinación corrige: en realidad llevaba hospitalizado desde el 1.
r = api('COORD_CORREGIR', { token: TK, patientId: pidArr,
  cambios: { FECHA_INGRESO: '2026-08-01' }, horas: { FECHA_INGRESO: '07:30' } }, null);
ok_('se corrige la fecha de un paciente EN CAMA', r.ok === true, r.error);
eq('la cama quedó con la fecha corregida',
  String(DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === '3').FECHA_INGRESO).slice(0, 10), '2026-08-01');

// El turno siguiente guarda con OTRA hora de ingreso en el formulario:
// antes de D7 esto pisaba la hora corregida.
SIM.fecha = '2026-08-11'; SIM.hora = '11:00:00';
api('GUARDAR_EVOLUCION', { ID_CAMA: '3', TURNO_KEY: '2026-08-11-Dia', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Arrastre', PAC_HORA_INGRESO: '23:45',
  VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC' }, null);

const camaPost = DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === '3');
eq('el turno NO pisó la fecha corregida', String(camaPost.FECHA_INGRESO).slice(0, 10), '2026-08-01');
eq('…ni la hora corregida', camaPost.TS_INGRESO, '2026-08-01 07:30');

/* ═══════════════════════════════════════════════════════════════════════════
   7 · …PERO UN TRAMO CLÍNICO NUEVO SÍ SUELTA LA MARCA
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n7 · Un tramo nuevo suelta la marca (VM → VNI)');

r = api('COORD_CORREGIR', { token: TK, patientId: pidArr, cambios: { FECHA_INICIO_SOPORTE: '2026-08-02' } }, null);
ok_('se corrige el inicio de ventilación', r.ok === true, r.error);

// Mismo soporte → la corrección se hereda.
SIM.fecha = '2026-08-12';
api('GUARDAR_EVOLUCION', { ID_CAMA: '3', TURNO_KEY: '2026-08-12-Dia', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Arrastre', VENT_VIA_AEREA: 'TOT', VENT_SOPORTE: 'VM', VENT_MODO: 'ACVC' }, null);
eq('sigue en VM → la fecha corregida se hereda',
  String(DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === '3').FECHA_INICIO_SOPORTE).slice(0, 10), '2026-08-02');

// Cambia el soporte → tramo nuevo de verdad: la marca cae y la fecha se reinicia.
SIM.fecha = '2026-08-13';
api('GUARDAR_EVOLUCION', { ID_CAMA: '3', TURNO_KEY: '2026-08-13-Dia', PLAN_FIRMA_KINE: 'DMV',
  PAC_NOMBRE: 'Paciente Arrastre', VENT_VIA_AEREA: 'Full Face', VENT_SOPORTE: 'VNI' }, null);
const camaVNI = DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === '3');
eq('pasó a VNI → arranca tramo nuevo, no se queda en la corregida',
  String(camaVNI.FECHA_INICIO_SOPORTE).slice(0, 10), '2026-08-13');
ok_('…y la marca de esa fecha se soltó',
  !global.coordCampoCorregido(camaVNI, 'FECHA_INICIO_SOPORTE'));
ok_('…pero la del INGRESO sigue puesta (ese tramo no cambió)',
  global.coordCampoCorregido(camaVNI, 'FECHA_INGRESO'));

/* ═══════════════════════════════════════════════════════════════════════════
   8 · BUSCADOR: RUT Y PALABRAS SUELTAS
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n8 · Buscador por RUT y por palabras en cualquier orden');

DB.ARCHIVO_PACIENTES.push({
  ID_ARCHIVO: 'ARCH_2', PATIENT_ID: 'PID_2', CAMA_ORIGEN: '5',
  NOMBRE: 'Diego Melo Villagrán', RUT: '22.222.222-2', EDAD: 34, SEXO: 'M',
  DIAGNOSTICO: 'IRA', FECHA_INGRESO: '2026-06-01', FECHA_EGRESO: '2026-06-10', DIAS_TOTAL: 9,
});

const buscar = q => { const b = api('GET_BUSCAR_PACIENTE', { q }, null); return b.ok ? b.data : []; };

ok_('encuentra por RUT con puntos y guion', buscar('22.222.222-2').some(x => x.patientId === 'PID_2'));
ok_('encuentra por RUT sin puntos', buscar('22222222-2').some(x => x.patientId === 'PID_2'));
ok_('encuentra por RUT sin guion', buscar('222222222').some(x => x.patientId === 'PID_2'));
ok_('sigue encontrando por la frase pegada (como antes)', buscar('melo villagran').some(x => x.patientId === 'PID_2'));
ok_('AHORA encuentra por nombre + apellido salteado', buscar('diego villagran').some(x => x.patientId === 'PID_2'));
ok_('…y en orden invertido', buscar('villagran diego').some(x => x.patientId === 'PID_2'));
ok_('…sin acentos', buscar('villagran').some(x => x.patientId === 'PID_2'));
ok_('no inventa coincidencias', buscar('zzzz nadie').length === 0);

/* ═══════════════════════════════════════════════════════════════════════════
   9 · RESTABLECER CLAVE
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n9 · Restablecer la clave de otra persona');

r = api('COORD_RESTABLECER', { firma: 'MFB' }, null);
ok_('restablecer SIN sesión es rechazado', r.ok === false);

r = api('COORD_RESTABLECER', { token: TK, firma: 'MFB' }, null);
ok_('con sesión sí se puede', r.ok === true, r.error);
const temp = r.ok ? r.data.temporal : '';
ok_('devuelve una clave temporal para entregar en persona', !!temp && temp.length >= 8, temp);

const audR = DB.AUDIT_LOG.filter(x => x.accion === 'COORD_RESTABLECE_CLAVE');
eq('queda registrado quién se la restableció a quién', audR.length, 1);
ok_('…nombrando a los dos', /MCC.*MFB/.test(audR[0].resumen), audR[0].resumen);

r = api('COORD_ENTRAR', { firma: 'MFB', clave: temp }, null);
ok_('MFB entra con la temporal', r.ok === true, r.error);
ok_('…y se le exige cambiarla', r.ok && r.data.debeCambiarClave === true);

r = api('COORD_RESTABLECER', { token: TK, firma: 'MCC' }, null);
ok_('nadie se restablece a sí mismo por esta vía', r.ok === false, r.error);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS:\n  - ${fails.join('\n  - ')}` : '\n✅ coordinacion OK');
process.exit(fails.length ? 1 : 0);
