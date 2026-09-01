// anexo_anular.js — LA × DEL SELLO: un anexo del ➕ se borra ENTERO o no se
// borra nada (24-ago-2026, pedido de Manuel).
//
// 🔴 DE DÓNDE SALE. El sello de un anexo tardaba en pintarse en el Registro
// (nada repintaba tras ANEXAR_EVENTO), la gente reintentaba «cargando» y
// quedaban KTM DOBLES en la planilla — y la estadística y el REM B.4 cuentan
// filas de PROCEDIMIENTOS, así que el duplicado inflaba cifras que salen del
// hospital. No existía ninguna forma de borrar la sobrante.
//
// Lo que esta guardia fija de ANULAR_ANEXO (svc_eventos.gs · anularAnexo):
//  · borra EXACTAMENTE la fila señalada por ID_PROC — jamás «la más parecida»;
//    con dos anexos idénticos, el que sobrevive es el otro (se mide por hora).
//  · las TRES caras juntas o ninguna: fila de PROCEDIMIENTOS + hito de
//    TIMELINE + instancia del nombre en PROC_JSON. Si el hito no aparece, NO
//    se borra nada (borrar solo la fila dejaría línea de tiempo y estadística
//    diciendo cosas distintas — la discrepancia que este proyecto ya pagó).
//  · TIMELINE_JSON de la cama se reescribe SIEMPRE, y si queda sin hitos se
//    vacía explícito (la sincronización normal no escribe listas vacías:
//    sin esto, la tarjeta mostraría un sello fantasma).
//  · el candado del pasado es el MISMO del ➕ (candado_mas.js): episodio
//    cerrado o fecha pasada exigen coordinación; el anexo de HOY en su cama
//    se borra sin llave.
//  · solo TIPO_PROC='anexo': los procedimientos del guardado se corrigen
//    re-guardando la evolución, no desde la ×.
//
// Y de GET_EVOS_DEL_DIA: los anexos del día viajan pegados a su evolución
// (e.ANEXOS con su ID_PROC) — es lo que la × necesita para tener identidad.
//
// El fixture se construye por RUTA REAL (anexarEventoRapido, el mismo ➕),
// no fabricando filas; solo los rechazos declaran su estado a mano y lo dicen.
//
// Uso: node build/checks/anexo_anular.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

/* ══ Arnés (mismo modelo que evento_paciente.js: dos hojas, fila real,
   «la primera y corta») + TIMELINE como hoja de verdad, porque aquí lo que
   se mide es justamente el borrado dentro de ella. ═══════════════════════ */
const FILA = 4;
let DB;
const reset = () => {
  DB = {
    EVOLUCIONES: [
      { ID_EVOLUCION: 'CAMA_7_2026-08-20-Dia', ID_CAMA: '7', PATIENT_ID: 'pLUIS',
        TURNO_KEY: '2026-08-20-Dia', FECHA: '2026-08-20', TURNO: 'Dia',
        PAC_NOMBRE: 'Luis (en su cama, hoy)', PROC_JSON: '[]', PROC_CANTIDAD: 0, PROC_RESUMEN: '' },
    ],
    EVOLUCIONES_ARCHIVO: [
      { ID_EVOLUCION: 'CAMA_3_2026-08-04-Dia', ID_CAMA: '3', PATIENT_ID: 'pCARLA',
        TURNO_KEY: '2026-08-04-Dia', FECHA: '2026-08-04', TURNO: 'Dia',
        PAC_NOMBRE: 'Carla (egresada, cama vacía)', PROC_JSON: '[]', PROC_CANTIDAD: 0, PROC_RESUMEN: '' },
    ],
    CAMAS_ESTADO: [
      { ID_CAMA: '7', OCUPADA: true, PATIENT_ID: 'pLUIS', TIMELINE_JSON: '' },
      { ID_CAMA: '3', OCUPADA: false, PATIENT_ID: '', TIMELINE_JSON: '' },
    ],
    PROCEDIMIENTOS: [],
    TIMELINE: [],
  };
};
reset();

const filasDe = h => (DB[h] || []).map((r, i) => ({ obj: Object.assign({}, r), fila: FILA + i }));
global.repoLeerTodosConFila = h => filasDe(h);
global.repoLeerFila = (h, f) => Object.assign({}, (DB[h] || [])[f - FILA]);
global.repoEscribirFila = (h, f, obj) => { DB[h][f - FILA] = Object.assign({}, obj); };
global.repoUpsertEnFila = (h, f, obj) => { if (f === -1) { DB[h].push(obj); return 'crear'; } DB[h][f - FILA] = Object.assign({}, obj); return 'actualizar'; };
global.repoBuscarPorId = (h, campo, id) => (DB[h] || []).find(r => String(r[campo]) === String(id)) || null;
global.repoActualizar = (h, campo, id, cambios) => { const r = global.repoBuscarPorId(h, campo, id); if (r) Object.assign(r, cambios); return !!r; };
global.repoLeerTodos = (h, k, v) => (DB[h] || []).filter(r => k === undefined || String(r[k]) === String(v)).map(r => Object.assign({}, r));
global.repoLeerFiltrado = (h, k, pred) => (DB[h] || []).filter(r => pred(r[k])).map(r => Object.assign({}, r));
global.repoInsertar = (h, obj) => { (DB[h] = DB[h] || []).push(obj); return obj; };
global.repoInsertarVarios = (h, objs) => { (objs || []).forEach(o => global.repoInsertar(h, o)); return (objs || []).length; };
// Fieles a repo.gs: eliminar por número de fila y por predicado.
global.repoEliminarFilas = (h, filas) => { (filas || []).slice().sort((a, b) => b - a).forEach(f => { DB[h].splice(f - FILA, 1); }); return (filas || []).length; };
global.repoEliminarDonde = (h, fn) => { const antes = (DB[h] || []).length; DB[h] = (DB[h] || []).filter(r => !fn(Object.assign({}, r))); return antes - DB[h].length; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.conLock = fn => fn();
let _uid = 0;
global.uid = p => p + '_' + (++_uid);
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I', NO_ENCONTRADO: 'NE', NO_AUTORIZADO: 'NA' };
global.Logger = { log: () => {} };
global.console.warn = global.console.warn || (() => {});
global.SpreadsheetApp = { flush: () => {} };
global.Session = { getScriptTimeZone: () => 'America/Santiago' };
global._tz = () => 'America/Santiago';
global._statISO = v => {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return global.Utilities.formatDate(v, 'America/Santiago', 'yyyy-MM-dd');
  }
  return String(v).slice(0, 10);
};
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
// Contrato de la llave, igual que en candado_mas.js: aquí se mide el FLUJO.
global.coordExigirSesion = t => t === 'COORD_OK'
  ? { ok: true, firma: 'MCC', usuario: 'coord1' }
  : { ok: false, error: 'Tu sesión de coordinación expiró. Vuelve a entrar con tu clave.', codigo: 'NA' };

// svc_timeline REAL (prefijo del hito, sincronización, inserción): el borrado
// se mide contra la misma maquinaria que escribe.
eval(fs.readFileSync(path.join(v2, 'infra_fechas.gs'), 'utf8'));
eval(fs.readFileSync(path.join(v2, 'svc_timeline.gs'), 'utf8'));
eval(fs.readFileSync(path.join(v2, 'svc_evoluciones.gs'), 'utf8'));
eval(fs.readFileSync(path.join(v2, 'svc_eventos.gs'), 'utf8'));

// 🪤 El reloj se fija DESPUÉS de los eval y COMO DECLARACIÓN en este mismo
// scope: infra_fechas.gs entró por eval directo, así que sus hoyISO/ahoraTS
// viven en el scope del módulo y un `global.hoyISO=` NO los pisa — solo otra
// declaración aquí los reemplaza. El timestamp AVANZA en cada uso: el
// emparejamiento fila↔hito por cercanía de hora es parte de lo que se mide,
// con un reloj plano no mediría nada.
// El reloj modela lo que pasa de verdad: dentro de UN ➕ la fila y su hito
// nacen a segundos (aquí 1 s), y entre un ➕ y su reintento pasa ~1 min — si
// avanzara parejo, el emparejamiento por cercanía quedaría empatado y la
// guardia mediría el empate, no la decisión.
eval("function hoyISO(){ return '2026-08-20'; }\n" +
     "var _segGuardia = 0;\n" +
     "function ahoraTS(){ const s = _segGuardia++; const p = n => String(n).padStart(2, '0');\n" +
     "  return '2026-08-20 10:' + p(Math.floor(s / 60)) + ':' + p(s % 60); }");

const camaDe = id => DB.CAMAS_ESTADO.find(c => String(c.ID_CAMA) === id);
const evoViva = () => DB.EVOLUCIONES[0];
const anexosDe = () => DB.PROCEDIMIENTOS.filter(p => p.TIPO_PROC === 'anexo');
const hitosAnexo = () => DB.TIMELINE.filter(h => h.TIPO === 'anexo');

/* ══ 1 · El reintento real: dos KTM por el ➕ (ruta real, no fixture) ═════ */
console.log('1 · Dos ➕ seguidos dejan dos filas — el estado que la × viene a poder limpiar');
const base = { idCama: '7', patientId: 'pLUIS', turnoKey: '2026-08-20-Dia', tipo: 'procedimiento' };
const rA = anexarEventoRapido(Object.assign({}, base, { proc: 'KTM 1', hora: '10:00' }), { firma: 'Klgo. Prueba' });
_segGuardia += 58;   // el reintento llega ~1 min después, como en el turno real
const rB = anexarEventoRapido(Object.assign({}, base, { proc: 'KTM 1', hora: '10:05' }), { firma: 'Klgo. Prueba' });
si('los dos anexos entran', rA.ok && rB.ok);
eq('PROCEDIMIENTOS tiene 2 filas de anexo', anexosDe().length, 2);
eq('TIMELINE tiene 2 hitos de anexo', hitosAnexo().length, 2);
eq('PROC_JSON acumula las dos', evoViva().PROC_JSON, '["KTM 1","KTM 1"]');
const idA = anexosDe()[0].ID_PROC, idB = anexosDe()[1].ID_PROC;
si('cada fila nace con identidad propia', !!idA && !!idB && idA !== idB);

/* ══ 2 · GET_EVOS_DEL_DIA lleva los anexos con su identidad ══════════════ */
console.log('\n2 · El Registro recibe e.ANEXOS con el ID_PROC — la identidad que usa la ×');
const rEvos = obtenerEvosDelDia('2026-08-20');
si('la lectura del día responde ok', rEvos.ok);
const evoDia = (rEvos.data || []).find(e => String(e.ID_CAMA) === '7');
si('la evolución de la cama 7 viene con ANEXOS', !!evoDia && Array.isArray(evoDia.ANEXOS));
eq('…con los 2 anexos', evoDia && evoDia.ANEXOS ? evoDia.ANEXOS.length : 0, 2);
si('…y con los ID_PROC reales', !!evoDia && evoDia.ANEXOS.map(a => a.id).sort().join(',') === [idA, idB].sort().join(','));
eq('…y el nombre de cada uno', evoDia && evoDia.ANEXOS[0].nombre, 'KTM 1');

/* ══ 3 · La × borra EXACTAMENTE el señalado, hoy y sin llave ═════════════ */
console.log('\n3 · Anular el segundo: cae él, sobrevive el legítimo, y las tres caras a la vez');
const r3 = anularAnexo({ idProc: idB }, {});
si('el anexo de HOY en su cama se borra SIN llave de coordinación', r3.ok);
eq('queda UNA fila de anexo', anexosDe().length, 1);
eq('…y es el legítimo (por identidad, no «el más parecido»)', anexosDe()[0].ID_PROC, idA);
eq('queda UN hito de anexo', hitosAnexo().length, 1);
si('…y es el de las 10:00 (el emparejamiento respetó la hora)', /10:00/.test(hitosAnexo()[0].TEXTO));
eq('PROC_JSON queda con UNA instancia', evoViva().PROC_JSON, '["KTM 1"]');
eq('…y el contador la sigue', String(evoViva().PROC_CANTIDAD), '1');
si('TIMELINE_JSON de la cama se reescribió sin el borrado', !/10:05/.test(camaDe('7').TIMELINE_JSON) && /10:00/.test(camaDe('7').TIMELINE_JSON));
si('la traza dice qué se anuló', /anexo anulado: KTM 1/.test((r3.data || {}).accion || ''));

/* ══ 4 · Rechazos que protegen el registro ═══════════════════════════════ */
console.log('\n4 · Lo que la × NO puede hacer');
const n4 = anexosDe().length;
const r4a = anularAnexo({ idProc: 'PROC_fantasma' }, {});
eq('un ID inexistente se rechaza', r4a.ok, false);
// Fixture declarado: así queda una fila del GUARDADO (TIPO_PROC vacío) — la ×
// no la toca porque su corrección es re-guardar la evolución.
DB.PROCEDIMIENTOS.push({ ID_PROC: 'PROC_guardado', ID_EVOLUCION: 'CAMA_7_2026-08-20-Dia', ID_CAMA: '7',
  PATIENT_ID: 'pLUIS', FECHA: '2026-08-20', TURNO: 'Dia', TIPO_PROC: '', NOMBRE_PROC: 'ECOGRAFÍA',
  DESCRIPCION: '', TIMESTAMP: '2026-08-20 09:00' });
const r4b = anularAnexo({ idProc: 'PROC_guardado' }, {});
eq('un procedimiento del guardado se rechaza', r4b.ok, false);
si('…explicando el camino correcto', /re-guardando/.test(String(r4b.error || '')));
si('…y la fila sigue', !!DB.PROCEDIMIENTOS.find(p => p.ID_PROC === 'PROC_guardado'));
eq('ningún rechazo borró anexos', anexosDe().length, n4);

/* ══ 5 · El pasado tiene la MISMA llave que el ➕ ═════════════════════════ */
console.log('\n5 · Borrar sobre una egresada exige coordinación');
const rC = anexarEventoRapido({ idCama: '3', patientId: 'pCARLA', turnoKey: '2026-08-04-Dia',
  tipo: 'procedimiento', proc: 'IMAGENOLOGÍA', hora: '11:00', coordToken: 'COORD_OK' }, { firma: 'Klgo. Prueba' });
si('el anexo al pasado entra con llave (ruta real)', rC.ok);
const idC = anexosDe().find(p => p.PATIENT_ID === 'pCARLA').ID_PROC;
const r5a = anularAnexo({ idProc: idC }, {});
eq('sin token se rechaza', r5a.ok, false);
eq('…como NO_AUTORIZADO', r5a.codigo, 'NA');
si('…diciendo el camino (🔐 COORDINACIÓN)', /COORDINACIÓN/.test(String(r5a.error || '')));
si('…y la fila sigue', !!anexosDe().find(p => p.ID_PROC === idC));
const r5b = anularAnexo({ idProc: idC, coordToken: 'COORD_OK' }, {});
si('con la llave se borra', r5b.ok);
si('…y la traza nombra a quien autorizó', /autorizado por coordinación \(MCC\)/.test((r5b.data || {}).accion || ''));
si('…sin dejar su hito', !DB.TIMELINE.some(h => String(h.PATIENT_ID) === 'pCARLA'));
eq('la cama sin hitos queda con TIMELINE_JSON vacío explícito (sin sellos fantasma)', camaDe('3').TIMELINE_JSON, '[]');

/* ══ 6 · Las dos caras o ninguna ═════════════════════════════════════════ */
console.log('\n6 · Si el hito no aparece, NO se borra nada');
// Fixture declarado: se simula la inconsistencia (hito perdido) que el
// contrato promete no agrandar.
DB.TIMELINE = DB.TIMELINE.filter(h => h.TIPO !== 'anexo');
const nAntes = anexosDe().length;
const r6 = anularAnexo({ idProc: idA }, {});
eq('sin hito emparejable se rechaza completo', r6.ok, false);
si('…explicando la discrepancia', /línea de tiempo/.test(String(r6.error || '')));
eq('…y la fila de PROCEDIMIENTOS sigue (no quedó a medias)', anexosDe().length, nAntes);

console.log('\n' + (fails.length ? '❌ ' + fails.length + ' fallo(s): ' + fails.join(' · ') : '✅ anexo_anular: todo verde'));
process.exit(fails.length ? 1 : 0);
