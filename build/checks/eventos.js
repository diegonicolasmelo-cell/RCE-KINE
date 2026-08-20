/**
 * eventos.js — Guardia de eventos rápidos + reloj de dispositivos
 * (svc_eventos.gs). Fixture a mano: fecha efectiva del turno Noche (día
 * siguiente), cambio de HME/HEPA/sonda reinicia el reloj y confirma,
 * procedimiento exige evolución guardada y suma a PROC_JSON + PROCEDIMIENTOS,
 * cultivo/otro → hito, confirmarDispositivos con y sin fecha, y
 * estadoDispositivos (vence / vence mañana).
 */
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');

// ── Stubs de infraestructura ──
const DB = {};
const HITOS = [];
global.repoLeerTodos = h => (DB[h] || []).slice();
global.repoBuscarPorId = (h, campo, id) =>
  (DB[h] || []).find(r => String(r[campo]) === String(id)) || null;
global.repoActualizar = (h, campo, id, cambios) => {
  const r = global.repoBuscarPorId(h, campo, id);
  if (r) Object.assign(r, cambios);
  return !!r;
};
global.repoInsertar = (h, obj) => { (DB[h] = DB[h] || []).push(obj); return obj; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.conLock = fn => fn();
global.uid = p => p + '_x' + Math.random().toString(36).slice(2, 8);
global.hoyISO = () => '2026-07-27';
global.ahoraTS = () => '2026-07-27 16:30';
global._agregarHitoInterno = h => { HITOS.push(h); return h; };
global._agregarHitoInternoSinSync = h => { HITOS.push(h); return h; };

/* 🔴 ARNÉS AMPLIADO (ago-2026). El ➕ dejó de resolver el turno por clave y pasó
   a ubicarlo por EPISODIO, con `_ubicarEvolucionDeTurno` (svc_evoluciones.gs).
   Sin estos tres stubs esta guardia reventaba, y ANTES de eso medía de menos:
   su `repoLeerTodos` ignora el filtro que se le pasa, así que cualquier arreglo
   que leyera filtrado daba verde sobre datos sin filtrar. Aquí se modela lo que
   el ➕ necesita de verdad: las DOS hojas y el NÚMERO DE FILA — escribir «por
   clave» es justamente el bug que se cerró. */
const FILA = 4;                        // primera fila de datos (3 encabezados)
global.repoLeerTodosConFila = h => (DB[h] || []).map((r, i) => ({ obj: Object.assign({}, r), fila: FILA + i }));
global.repoLeerFila = (h, f) => Object.assign({}, (DB[h] || [])[f - FILA]);
global.repoEscribirFila = (h, f, obj) => { DB[h][f - FILA] = Object.assign({}, obj); };
global.SpreadsheetApp = { flush: () => {} };
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO' };
// _fechaEfectivaTurno vive en infra_fechas.gs (se mudó allí en ago-2026, al
// empezar a usarla también los días de estadía). Se copia aquí en vez de
// cargar infra_fechas entero: ese archivo trae hoyISO/ahoraTS reales y pisaría
// los stubs de reloj de este arnés.
global._fechaEfectivaTurno = (fecha, turno) => {
  const f = String(fecha || '').slice(0, 10);
  if (String(turno) !== 'Noche') return f;
  const d = new Date(f + 'T12:00:00');
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

// El prefijo del hito de un procedimiento anexado vive en svc_timeline.gs
// —junto a `_TIPOS_HITO_AUTO`, porque el guardado de la evolución lo usa para
// reconocer el hito rico y no escribirle encima (ago-2026)—. Se copia aquí en
// vez de cargar svc_timeline entero, que traería su `_agregarHitoInterno` real
// y pisaría el espía de este arnés. Que los dos digan lo mismo lo vigila
// `checks/hitos_unicos.js`, que sí usa el de verdad.
global._hitoAnexoPrefijo = n => '🔧 ' + String(n || '');

// La categoría del ventilador vive en svc_equipos.gs; cargarlo entero traería
// todo el tablero de equipos a este arnés. Se copian las dos líneas que usa
// _ventNombreDeCama (la regla real la vigila equipos_categoria.js).
global._vmCategoria = x => String(x.CATEGORIA || 'VM').trim().toUpperCase();
global._vmEsDeCama = cat => String(cat) === 'VM';

// svc_stats.gs aporta _statISO (misma normalización de fechas de producción).
// svc_evoluciones.gs aporta `_ubicarEvolucionDeTurno`, la pieza que ubica el
// turno por episodio. Se CARGA, no se copia: una copia probaría la copia.
eval(['svc_stats.gs', 'svc_evoluciones.gs', 'svc_eventos.gs'].map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + g + (okk ? '' : ' (esperado ' + w + ')'));
  if (!okk) fails.push(l);
};
const CTX = { firma: 'DMV', email: 'diego@test' };

// ── 1. Fecha efectiva del turno ──
eq('fecha efectiva Día 27 = 27', _fechaEfectivaTurno('2026-07-27', 'Dia'), '2026-07-27');
eq('fecha efectiva Noche 27 = 28 (el turno termina al día siguiente)', _fechaEfectivaTurno('2026-07-27', 'Noche'), '2026-07-28');
eq('fecha efectiva Noche fin de mes 31-jul = 01-ago', _fechaEfectivaTurno('2026-07-31', 'Noche'), '2026-08-01');

// ── 2. Cambio de dispositivo reinicia el reloj (turno Noche → fecha efectiva) ──
DB.CAMAS_ESTADO = [{
  ID_CAMA: '3', OCUPADA: true, PATIENT_ID: 'p9', SOPORTE: 'VM',
  DISP_HME_FECHA: '2026-07-25', DISP_HEPA_FECHA: '2026-07-25', DISP_TC_FECHA: '2026-07-25',
  DISP_CONFIRMADO: false,
}];
let r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Noche', tipo: 'hme', hora: '02:30' }, CTX);
eq('cambio HME ok', r.ok, true);
eq('HME resetea a la fecha EFECTIVA (28, no 27)', DB.CAMAS_ESTADO[0].DISP_HME_FECHA, '2026-07-28');
eq('HEPA no se toca', DB.CAMAS_ESTADO[0].DISP_HEPA_FECHA, '2026-07-25');
eq('cambio de dispositivo confirma el reloj', DB.CAMAS_ESTADO[0].DISP_CONFIRMADO, true);
eq('hito de dispositivo con hora y firma', HITOS[0].tipo === 'dispositivo' && HITOS[0].texto.indexOf('02:30 hrs') > -1 && HITOS[0].texto.indexOf('· DMV') > -1, true);

r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'sonda' }, CTX);
eq('cambio sonda usa DISP_TC_FECHA (turno Día = mismo día)', DB.CAMAS_ESTADO[0].DISP_TC_FECHA, '2026-07-27');

// ── 3. Procedimiento: exige evolución guardada, suma a PROC_JSON y PROCEDIMIENTOS ──
r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'procedimiento', proc: 'ECOGRAFÍA' }, CTX);
eq('procedimiento SIN evolución → rechazado', r.ok, false);
eq('mensaje pide guardar la evolución primero', /Primero guarda la evoluci/.test(r.error), true);

DB.EVOLUCIONES = [{ ID_EVOLUCION: 'CAMA_3_2026-07-27-Dia', PROC_JSON: JSON.stringify(['KTR']), PROC_CANTIDAD: 1 }];
DB.PROCEDIMIENTOS = [];
r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'procedimiento', proc: 'ECOGRAFÍA', hora: '16:30', detalle: 'derrame leve' }, CTX);
eq('procedimiento anexo ok', r.ok, true);
eq('PROC_JSON acumula', DB.EVOLUCIONES[0].PROC_JSON, JSON.stringify(['KTR', 'ECOGRAFÍA']));
eq('PROC_CANTIDAD = 2', DB.EVOLUCIONES[0].PROC_CANTIDAD, 2);
eq('PROC_RESUMEN legible', DB.EVOLUCIONES[0].PROC_RESUMEN, 'KTR, ECOGRAFÍA');
eq('fila en PROCEDIMIENTOS tipo anexo', DB.PROCEDIMIENTOS.length === 1 && DB.PROCEDIMIENTOS[0].TIPO_PROC === 'anexo' && DB.PROCEDIMIENTOS[0].NOMBRE_PROC === 'ECOGRAFÍA', true);
eq('procedimiento sin nombre → rechazado', anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'procedimiento' }, CTX).ok, false);

// ── 4. Cultivo y otro ──
r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'cultivo', cultTipo: 'Aspirado traqueal' }, CTX);
eq('cultivo sin hallazgo → "resultado pendiente"', r.ok && r.data.texto.indexOf('resultado pendiente') > -1, true);
r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'cultivo', cultTipo: 'Aspirado traqueal', cultHallazgo: 'K. pneumoniae' }, CTX);
eq('cultivo con hallazgo lo incluye', r.ok && r.data.texto.indexOf('K. pneumoniae') > -1, true);
eq('cultivo sin tipo → rechazado', anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'cultivo' }, CTX).ok, false);
r = anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'otro', detalle: 'Familia informada' }, CTX);
eq('otro con detalle ok', r.ok, true);
eq('otro sin detalle → rechazado', anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'otro' }, CTX).ok, false);
eq('tipo desconocido → rechazado', anexarEventoRapido({ idCama: '3', turnoKey: '2026-07-27-Dia', tipo: 'zzz' }, CTX).ok, false);
eq('turnoKey inválido → rechazado', anexarEventoRapido({ idCama: '3', turnoKey: '27/07/2026', tipo: 'otro', detalle: 'x' }, CTX).ok, false);
eq('cama desocupada → rechazado', anexarEventoRapido({ idCama: '99', turnoKey: '2026-07-27-Dia', tipo: 'otro', detalle: 'x' }, CTX).ok, false);

// ── 5. confirmarDispositivos: con y sin fecha ──
DB.CAMAS_ESTADO[0].DISP_CONFIRMADO = false;
r = confirmarDispositivos({ idCama: '3' }, CTX);
eq('confirmar sin fecha ok', r.ok, true);
eq('confirma sin tocar fechas', DB.CAMAS_ESTADO[0].DISP_CONFIRMADO === true && DB.CAMAS_ESTADO[0].DISP_HME_FECHA === '2026-07-28', true);
r = confirmarDispositivos({ idCama: '3', fecha: '2026-07-26' }, CTX);
eq('confirmar con fecha ajusta los 3 relojes', DB.CAMAS_ESTADO[0].DISP_HME_FECHA === '2026-07-26' && DB.CAMAS_ESTADO[0].DISP_HEPA_FECHA === '2026-07-26' && DB.CAMAS_ESTADO[0].DISP_TC_FECHA === '2026-07-26', true);

// ── 6. estadoDispositivos — EL CAMBIO SE HACE EN LA MADRUGADA ──
// Etiqueta = día 0 y fechaCambio = etiqueta+frec, pero ese cambio se ejecuta en
// la MADRUGADA de esa fecha: lo hace el turno noche de la VÍSPERA. Por eso el
// aviso sale cuando dias === frec-1. Hasta el 10-ago-2026 salía en dias === frec,
// una noche tarde, y como el dispositivo nuevo se etiqueta con la fecha efectiva
// (la madrugada), el error se acumulaba: el HME terminaba durando 3 días. Lo
// reportó Manuel desde el turno; el intervalo real se mide en la sección 6b.
// Referencia de todos estos casos: 27-07 (turno noche del 27 = madrugada del 28).
// Desde la v5.60 cada dispositivo tiene su propia condición (HEPA = ventilador
// asignado, HME = VM sin humid activa o modo HME, TC = vía aérea artificial),
// así que las camas de este arnés llevan TOT y un ventilador DE CICLO (Vela).
DB.VENTILADORES = [
  { NOMBRE: 'Vela 9', ACTIVO: 'TRUE', UBIC_TIPO: 'CAMA', UBIC_DETALLE: '3', CATEGORIA: 'VM' },
  { NOMBRE: 'Vela 7', ACTIVO: 'TRUE', UBIC_TIPO: 'CAMA', UBIC_DETALLE: '5', CATEGORIA: 'VM' },
];
_ventPorCamaMemo = null;   // las secciones 2-5 ya lo poblaron sin inventario
const cama = { ID_CAMA: '3', SOPORTE: 'VM', VIA_AEREA: 'TOT', DISP_HME_FECHA: '2026-07-26', DISP_HEPA_FECHA: '2026-07-26', DISP_TC_FECHA: '' };
const est = estadoDispositivos(cama, '2026-07-27');
const hme = est.find(d => d.k === 'hme'), hepa = est.find(d => d.k === 'hepa'), tc = est.find(d => d.k === 'sonda');
eq('HME etiqueta de ayer (frec 2) → se cambia ESTA NOCHE, no vencido', hme.cambiaEstaNoche && !hme.vence, true);
eq('…y su fecha de cambio es la madrugada de mañana (etiqueta+2)', hme.fechaCambio, '2026-07-28');
eq('HEPA de ayer (frec 3) → ni esta noche ni vencido', !hepa.vence && !hepa.cambiaEstaNoche, true);
eq('HEPA días=1', hepa.dias, 1);
eq('…con fecha de cambio etiqueta+3', hepa.fechaCambio, '2026-07-29');
eq('…y avisa que le toca la madrugada SIGUIENTE', hepa.venceManana, true);
eq('sonda sin fecha → no aplica', tc.aplica, false);
const est2 = estadoDispositivos({ ID_CAMA: '3', SOPORTE: 'VM', VIA_AEREA: 'TOT', DISP_HME_FECHA: '2026-07-27', DISP_HEPA_FECHA: '2026-07-26', DISP_TC_FECHA: '2026-07-25' }, '2026-07-27');
eq('HME etiquetado hoy (frec 2) → le toca la madrugada siguiente', est2.find(d => d.k === 'hme').venceManana, true);
eq('TC hace 2 días (frec 3) → se cambia ESTA NOCHE', est2.find(d => d.k === 'sonda').cambiaEstaNoche, true);
const est4 = estadoDispositivos({ ID_CAMA: '3', SOPORTE: 'VM', VIA_AEREA: 'TOT', DISP_HME_FECHA: '2026-07-25' }, '2026-07-27');
eq('HME hace 2 días (frec 2): pasó su madrugada sin cambio → vencido', est4.find(d => d.k === 'hme').vence, true);
const est3 = estadoDispositivos({ ID_CAMA: '3', SOPORTE: 'VMNI', DISP_HME_FECHA: '2026-07-20' }, '2026-07-27');
eq('sin VM → el HME no aplica ni vence', (() => { const h = est3.find(d => d.k === 'hme'); return !h.aplica && !h.vence; })(), true);

// ── 6b. cambiosEstaNoche, ciclo completo — LA PROPIEDAD ES EL INTERVALO ──
// Lo que hay que conservar no es una lista de fechas, es que entre dos cambios
// del MISMO dispositivo pasen exactamente `frec` días. Memorizar fechas fue lo
// que dejó pasar el error corregido el 10-ago-2026: la secuencia parecía bien
// (HME etiqueta 04 → noche del 06) pero al encadenar los ciclos el HME duraba 3
// días, porque el que se cambia de noche se etiqueta con la MADRUGADA (D+1) y
// el aviso se calculaba sobre la fecha nominal del turno.
// Paciente ingresa el 04/08: sus 3 dispositivos quedan etiquetados 04/08.
DB.CAMAS_ESTADO = [
  { ID_CAMA: '5', OCUPADA: 'TRUE', NOMBRE: 'Paciente Ejemplo', SOPORTE: 'VM', VIA_AEREA: 'TOT',
    DISP_HME_FECHA: '2026-08-04', DISP_HEPA_FECHA: '2026-08-04', DISP_TC_FECHA: '2026-08-04' },
  { ID_CAMA: '6', OCUPADA: 'TRUE', NOMBRE: 'Sin VM', SOPORTE: 'Ambiente',
    DISP_HME_FECHA: '2026-08-01' },
];
// Noche del 04/08: recién etiquetados, nada que cambiar todavía.
let cn = cambiosEstaNoche('2026-08-04');
eq('ciclo · noche del 04/08: nada que cambiar', cn.data.camas.length, 0);
// Noche del 05/08 (madrugada del 06): toca el HME, y solo él.
cn = cambiosEstaNoche('2026-08-05');
eq('ciclo · noche del 05/08: una cama con cambios', cn.data.camas.length, 1);
eq('…y es SOLO el HME', cn.data.camas[0].dispositivos.map(d => d.k).join(','), 'hme');
eq('…marcado para esta noche, no vencido', cn.data.camas[0].dispositivos[0].estado, 'esta_noche');
eq('…y su fecha de cambio es esa madrugada', cn.data.camas[0].dispositivos[0].fechaCambio, '2026-08-06');
// Se cambia en esa madrugada → se etiqueta 06/08 (fecha efectiva, ya existía).
DB.CAMAS_ESTADO[0].DISP_HME_FECHA = '2026-08-06';
// Noche del 06/08 (madrugada del 07): HEPA y TC (etiqueta 04, frec 3). El HME no.
cn = cambiosEstaNoche('2026-08-06');
eq('ciclo · noche del 06/08: HEPA y TC', cn.data.camas[0].dispositivos.map(d => d.k).sort().join(','), 'hepa,sonda');
DB.CAMAS_ESTADO[0].DISP_HEPA_FECHA = '2026-08-07';
DB.CAMAS_ESTADO[0].DISP_TC_FECHA = '2026-08-07';
// Noche del 07/08 (madrugada del 08): vuelve a tocar el HME.
cn = cambiosEstaNoche('2026-08-07');
eq('ciclo · noche del 07/08: el HME de nuevo', cn.data.camas[0].dispositivos.map(d => d.k).join(','), 'hme');
// 🎯 LA PROPIEDAD: del cambio anterior (madrugada del 06) a éste (madrugada del
// 08) pasan 2 días = la frecuencia del HME. Con la regla vieja eran 3.
const intervalo = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);
eq('🎯 entre dos cambios de HME pasan exactamente 2 días', intervalo('2026-08-06', '2026-08-08'), 2);
// Y si esa noche NADIE lo cambia, la madrugada siguiente sale VENCIDO.
cn = cambiosEstaNoche('2026-08-08');
const hmeV = cn.data.camas[0].dispositivos.find(d => d.k === 'hme');
eq('ciclo · 08/08 sin cambio: el HME sale VENCIDO con 1 día de atraso', hmeV.estado + '/' + hmeV.diasAtraso, 'vencido/1');
// Noche del 09/08: al HEPA y al TC (etiqueta 07) les toca la madrugada del 10 →
// 3 días exactos. Es el caso que Manuel reportó desde el turno el 10-ago-2026.
cn = cambiosEstaNoche('2026-08-09');
const n9 = cn.data.camas[0].dispositivos;
eq('caso de terreno · HEPA y TC del 07 se cambian en la noche del 09', n9.filter(d => d.estado === 'esta_noche').map(d => d.k).sort().join(','), 'hepa,sonda');
eq('…o sea en la madrugada del 10', n9.find(d => d.k === 'hepa').fechaCambio, '2026-08-10');
eq('🎯 y del 07 al 10 pasan exactamente 3 días', intervalo('2026-08-07', '2026-08-10'), 3);
// El HME etiquetado el 08 también toca esa noche (el otro caso de Manuel).
DB.CAMAS_ESTADO[0].DISP_HME_FECHA = '2026-08-08';
cn = cambiosEstaNoche('2026-08-09');
eq('caso de terreno · el HME del 08 también entra en la noche del 09',
   cn.data.camas[0].dispositivos.filter(d => d.k === 'hme' && d.estado === 'esta_noche').length, 1);

console.log(fails.length ? ('❌ ' + fails.length + ' FALLOS') : '✅ TODO OK');
process.exit(fails.length ? 1 : 0);
