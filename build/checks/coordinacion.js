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
//   2. USUARIO DE LOGIN ≠ FIRMA CLÍNICA (19-ago-2026). Se entra como «coord1»,
//      no como «MCC»: la pantalla no debe revelar quién tiene acceso. Por
//      dentro, coord1 resuelve a MCC, y es MCC quien queda estampada en cada
//      corrección y en AUDIT_LOG — la trazabilidad no se pierde, solo se
//      esconde de la puerta.
//   3. LA MARCA DE ARRASTRE (D7). Una fecha corregida no la pisa el turno
//      siguiente — «normalmente no se modifica, así que no debería poder
//      modificarla» (Manuel, 18-ago-2026). Sin esto la corrección de don
//      Ernesto duraba hasta que alguien guardara el turno de esa noche.
//   4. …pero sí se suelta cuando arranca un TRAMO CLÍNICO NUEVO (VM→VNI→VM),
//      porque ahí la fecha corregida ya no describe ese tramo.
//   5. La clave no se guarda ni viaja en ninguna parte legible.
//
// Uso: node build/checks/coordinacion.js
const { api, DB, SIM, CONFIG, MAILS } = require('../sim/sim_srv.js');

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

r = api('COORD_ENTRAR', { usuario: 'coord9', clave: 'loquesea' }, null);
ok_('un usuario que no existe no entra', r.ok === false);

/* ═══════════════════════════════════════════════════════════════════════════
   2 · USUARIO DE LOGIN ≠ FIRMA CLÍNICA
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n2 · coord1/coord2/coord3, no MCC/DMV/MFB, en la puerta');

eq('coord1 resuelve a MCC', global.COORD_USUARIOS.coord1, 'MCC');
eq('coord2 resuelve a DMV', global.COORD_USUARIOS.coord2, 'DMV');
eq('coord3 resuelve a MFB', global.COORD_USUARIOS.coord3, 'MFB');

const claves = {};
Object.keys(global.COORD_USUARIOS).forEach(u => {
  // La siembra real imprime temporales al azar; aquí se pone una conocida para
  // poder afirmar después que NO aparece guardada en ninguna parte.
  claves[u] = 'clave-de-prueba-' + u;
  global._coordGuardarClave(u, claves[u]);
});

r = api('COORD_ENTRAR', { usuario: 'coord1', clave: 'la-que-no-es' }, null);
ok_('clave incorrecta se rechaza', r.ok === false);
ok_('…con el MISMO mensaje que un usuario inexistente (no delata cuáles existen)',
  r.error === 'Usuario o clave incorrectos.', r.error);
r = api('COORD_ENTRAR', { usuario: 'coord9', clave: 'la-que-no-es' }, null);
eq('…exactamente el mismo texto', r.error, 'Usuario o clave incorrectos.');

r = api('COORD_ENTRAR', { usuario: 'coord1', clave: claves.coord1 }, null);
ok_('con la clave correcta entra', r.ok === true, r.error);
const TK = r.ok ? r.data.token : null;
eq('la sesión devuelve la firma REAL (coord1 → MCC)', r.ok && r.data.firma, 'MCC');
ok_('…y la respuesta no repite el usuario de login en ningún campo',
  JSON.stringify(r.data).indexOf('coord1') === -1, JSON.stringify(r.data));
// Mayúsculas o no, da igual: es un usuario, no una sigla que se escribe siempre igual.
r = api('COORD_ENTRAR', { usuario: 'COORD1', clave: claves.coord1 }, null);
ok_('el usuario no distingue mayúsculas', r.ok === true, r.error);

const rD = api('COORD_ENTRAR', { usuario: 'coord2', clave: claves.coord2 }, null);
const TK_DMV = rD.ok ? rD.data.token : null;
ok_('los tres usuarios entran, cada uno con su firma', !!TK_DMV && rD.data.firma === 'DMV');

// Los fallidos son POR USUARIO: si fueran globales, teclear mal a propósito
// dejaría afuera a los tres, que es una forma barata de parar la unidad.
for (let i = 0; i < 4; i++) api('COORD_ENTRAR', { usuario: 'coord3', clave: 'mala' }, null);
r = api('COORD_ENTRAR', { usuario: 'coord3', clave: claves.coord3 }, null);
ok_('coord3 queda en espera tras agotar los intentos', r.ok === false, r.error);
r = api('COORD_ENTRAR', { usuario: 'coord1', clave: claves.coord1 }, null);
ok_('…y eso NO deja afuera a coord1', r.ok === true);

/* ═══════════════════════════════════════════════════════════════════════════
   3 · LA CLAVE NO SE GUARDA EN NINGUNA PARTE LEGIBLE
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n3 · La clave no aparece en ningún lado');

const P = global.PropertiesService.getScriptProperties();
const guardado = ['coord_hash_coord1', 'coord_sal_coord1'].map(k => String(P.getProperty(k) || '')).join('|');
ok_('lo guardado es una HUELLA, no la clave', guardado.indexOf(claves.coord1) === -1, guardado.slice(0, 24) + '…');
ok_('…y esa huella no está vacía', guardado.length > 20);
ok_('la huella se guarda por USUARIO, no por firma (ni «MCC» aparece como clave interna)',
  P.getProperty('coord_hash_MCC') == null);
ok_('la clave NO está en CONFIG', JSON.stringify(CONFIG).indexOf(claves.coord1) === -1);
ok_('la clave NO está en AUDIT_LOG', JSON.stringify(DB.AUDIT_LOG).indexOf(claves.coord1) === -1);
ok_('la respuesta de entrar NO devuelve la clave', JSON.stringify(r).indexOf(claves.coord1) === -1);

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
eq('…y firmada con la FIRMA REAL de quien entró (no «coord1»)', corr[0].f, 'MCC');

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
   9 · RESTABLECER LA CLAVE DE OTRO USUARIO
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n9 · Restablecer la clave de otra persona');

r = api('COORD_RESTABLECER', { usuario: 'coord3' }, null);
ok_('restablecer SIN sesión es rechazado', r.ok === false);

r = api('COORD_RESTABLECER', { token: TK, usuario: 'coord3' }, null);
ok_('con sesión sí se puede', r.ok === true, r.error);
const temp = r.ok ? r.data.temporal : '';
eq('la temporal se devuelve junto con la firma real', r.ok && r.data.firma, 'MFB');
ok_('es de 12 caracteres alfanuméricos (agrupados 4-4-4, pedido de Manuel 19-ago)',
  /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(temp), temp);

const audR = DB.AUDIT_LOG.filter(x => x.accion === 'COORD_RESTABLECE_CLAVE');
eq('queda registrado quién se la restableció a quién', audR.length, 1);
ok_('…nombrando a las dos firmas reales', /MCC.*MFB/.test(audR[0].resumen), audR[0].resumen);

r = api('COORD_ENTRAR', { usuario: 'coord3', clave: temp }, null);
ok_('coord3 entra con la temporal', r.ok === true, r.error);
ok_('…y se le exige cambiarla', r.ok && r.data.debeCambiarClave === true);

// La cambia por la suya — «cambiable después por el usuario» (Manuel, 19-ago).
r = api('COORD_CAMBIAR_CLAVE', { token: r.data.token, nueva: 'la-clave-que-elijo-yo' }, null);
ok_('y la reemplaza por una propia sin pedir la temporal (sesión ya era temporal)', r.ok === true, r.error);
r = api('COORD_ENTRAR', { usuario: 'coord3', clave: temp }, null);
ok_('…la temporal ya no sirve', r.ok === false);
r = api('COORD_ENTRAR', { usuario: 'coord3', clave: 'la-clave-que-elijo-yo' }, null);
ok_('…la elegida sí', r.ok === true, r.error);

r = api('COORD_RESTABLECER', { token: TK, usuario: 'coord1' }, null);
ok_('nadie se restablece a sí mismo por esta vía', r.ok === false, r.error);

r = api('COORD_RESTABLECER', { token: TK, usuario: 'coord9' }, null);
ok_('restablecer un usuario inexistente se rechaza', r.ok === false, r.error);


/* ═══════════════════════════════════════════════════════════════════════════
   10 · RECUPERAR LA CLAVE POR CORREO — escrita y APAGADA
   ───────────────────────────────────────────────────────────────────────────
   Diego rechazó el envío de correos, así que el mecanismo nace en FALSE. Lo
   que más importa probar es lo primero: que APAGADO no manda absolutamente
   nada. Una funcionalidad «lista para encender» que igual manda correos no
   está apagada, está suelta.
   ═══════════════════════════════════════════════════════════════════════════ */
console.log('\n10 · Recuperación por correo (apagada por defecto)');

eq('el interruptor nace apagado', global.coordRecuperaPorCorreo(), false);
eq('la puerta no ofrece ese camino', api('COORD_ESTADO', {}, null).data.recuperaCorreo, false);

const _mails0 = MAILS.length;
r = api('COORD_PEDIR_CODIGO', { usuario: 'coord1' }, null);
ok_('apagada, pedir código se rechaza', r.ok === false, r.error);
ok_('…y NO se mandó ningún correo', MAILS.length === _mails0, String(MAILS.length - _mails0));
ok_('…y el mensaje dice qué hacer en su lugar', /restablezca la clave/i.test(r.error || ''));

r = api('COORD_RECUPERAR', { usuario: 'coord1', codigo: '123456', nueva: 'otra-clave-larga' }, null);
ok_('apagada, recuperar con código también se rechaza', r.ok === false);
ok_('…y la clave de coord1 sigue siendo la suya',
  api('COORD_ENTRAR', { usuario: 'coord1', clave: claves.coord1 }, null).ok === true);

console.log('\n10b · …y encendida funciona entera');
CONFIG.COORD_RECUPERA_CORREO = 'TRUE';
eq('el interruptor quedó encendido', global.coordRecuperaPorCorreo(), true);
eq('ahora la puerta sí lo ofrece', api('COORD_ESTADO', {}, null).data.recuperaCorreo, true);

// Sin correo cargado no se puede: la semilla de KINESIOLOGOS los deja vacíos.
r = api('COORD_PEDIR_CODIGO', { usuario: 'coord1' }, null);
ok_('sin correo en KINESIOLOGOS avisa y no manda nada', r.ok === false, r.error);
ok_('…sin gastar un envío', MAILS.length === _mails0);

DB.KINESIOLOGOS.push({ FIRMA: 'MCC', NOMBRE: 'Magdalena Contardo Cisternas',
  TRATAMIENTO: 'Klga.', EMAIL: 'magdalena@hospital.cl', ACTIVO: true });

r = api('COORD_PEDIR_CODIGO', { usuario: 'coord1' }, null);
ok_('con correo cargado sí manda', r.ok === true, r.error);
eq('…un solo correo', MAILS.length - _mails0, 1);
const mail = MAILS[MAILS.length - 1];
eq('…al correo de la firma real (MCC), no de «coord1»', mail.to, 'magdalena@hospital.cl');
ok_('el correo que se muestra viene OCULTO', /…/.test(r.data.enviadoA), r.data.enviadoA);
ok_('…y no revela el correo entero', r.data.enviadoA.indexOf('magdalena@') === -1);
ok_('EL CÓDIGO NO VUELVE EN LA RESPUESTA',
  !/\d{6}/.test(JSON.stringify(r.data)), JSON.stringify(r.data));

const cod = (String(mail.body || '').match(/\b(\d{6})\b/) || [])[1];
ok_('el código viaja en el cuerpo del correo', !!cod, cod);
ok_('…y dice que vence', /vence en \d+ minutos/.test(String(mail.body || '')));

r = api('COORD_RECUPERAR', { usuario: 'coord1', codigo: '000000', nueva: 'clave-nueva-larga' }, null);
ok_('un código equivocado se rechaza', r.ok === false, r.error);

r = api('COORD_RECUPERAR', { usuario: 'coord1', codigo: cod, nueva: 'corta' }, null);
ok_('una clave nueva muy corta se rechaza', r.ok === false, r.error);

r = api('COORD_RECUPERAR', { usuario: 'coord1', codigo: cod, nueva: 'clave-nueva-larga' }, null);
ok_('con el código correcto se fija la clave nueva', r.ok === true, r.error);
ok_('…y la vieja ya no sirve',
  api('COORD_ENTRAR', { usuario: 'coord1', clave: claves.coord1 }, null).ok === false);
ok_('…y la nueva sí',
  api('COORD_ENTRAR', { usuario: 'coord1', clave: 'clave-nueva-larga' }, null).ok === true);

r = api('COORD_RECUPERAR', { usuario: 'coord1', codigo: cod, nueva: 'otra-mas-larga-aun' }, null);
ok_('EL CÓDIGO ES DE UN SOLO USO', r.ok === false, r.error);

const audC = DB.AUDIT_LOG.filter(x => x.accion === 'COORD_RECUPERA_CLAVE');
eq('la recuperación quedó en AUDIT_LOG', audC.length, 1);
ok_('ningún código quedó escrito en AUDIT_LOG',
  JSON.stringify(DB.AUDIT_LOG).indexOf(cod) === -1);

CONFIG.COORD_RECUPERA_CORREO = 'FALSE';   // se deja como estaba

console.log(fails.length ? `\n❌ ${fails.length} FALLOS:\n  - ${fails.join('\n  - ')}` : '\n✅ coordinacion OK');
process.exit(fails.length ? 1 : 0);
