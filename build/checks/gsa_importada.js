// gsa_importada.js — EL GAS DE LA MAÑANA LLEGA SOLO DESDE EL PDF (tanda 2b).
//
// 🔴 DE DÓNDE SALE. Historia de Diego (2-sep-2026): gases a las 04:00,
// resultado a las 06:00, hoja impresa a las 07:00… y los valores pasados a
// mano recién a las 10:00. Tres horas de anticipación clínica perdidas.
// El 6-sep mandó cuatro PDF reales del laboratorio para conocer el formato
// (el sistema NO exporta CSV). Aquí se reproduce ese formato con datos
// inventados — ni un RUT ni un nombre real.
//
// LO QUE FIJA:
//  1. El parser lee el formato real: RUT, petición, fecha/hora de la toma,
//     gases, Hb/Hto/plaquetas/INR/K⁺/glicemia/PCR. Y desdobla los valores en
//     negrita que la capa de texto repite («9.99.9» → 9.9).
//  2. El turno del gas lo calcula el SERVIDOR con la misma regla y los
//     mismos cortes de CONFIG que el cliente: 04:00 → NOCHE del día anterior.
//  3. Regla dura: sin RUT válido o sin episodio en esa fecha NO se escribe en
//     nadie (fila «sin_emparejar», sin RUT) y el PDF va a su bandeja; con
//     certeza se guarda por PATIENT_ID y el PDF se MUEVE a «copiados» (no se
//     borra). Una petición repetida no se importa dos veces.
//  4. La hoja impresa marca lo del laboratorio con asterisco y lo alterado en
//     negrita con flecha (se imprime en B/N); Hb y Hto tienen fila propia;
//     plaquetas/K⁺ solo en observaciones si están alterados.
//  5. La hoja diaria mezcla el gas importado en la columna del turno que le
//     corresponde, aunque ese turno aún no tenga evolución.
//
// Uso: node build/checks/gsa_importada.js (requiere playwright-core)
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);
const lee = f => fs.readFileSync(path.join(v2, f), 'utf8');

/* ── Informe SINTÉTICO con el formato real del laboratorio (glifos dobles y asteriscos incluidos) ── */
const INFORME = (rut, pet, fechaHora, extra) => `
                         SERVICIO DE SALUD COQUIMBO
                          LABORATORIO CLINICO
                                                                     Nº Petición  : ${pet}
  Nombre          : PACIENTE , DE PRUEBA                    Procedencia                      : HOSP. UCI
   Nº RUT             :  ${rut}                                     Fecha de Ingreso              :  ${fechaHora}
  Edad                :  49
 QUIMICA SANGUINEA
  Proteina C Reactiva                       *  175.0                      mg/l         0.0 - 5.0           Inmunoturbidimétrico
 HEMATOLOGÍA
  Hemoglobina                               **  ${extra.hb}${extra.hb}                            g/dlg/dl         14.014.0 -- 17.517.5         ColorimetríaColorimetría
  Hematocrito                                **  20.220.2            %%           38.038.0 -- 52.052.0        ImpedanciaImpedancia
  Rcto. Plaquetas                           *  ${extra.plaq}                        x10³/µL     150 - 450         Impedancia
 PRUEBAS DE COAGULACIÓN
 INR                                     1.07
 PH Y GASES EN SANGRE
  Analizador RapidPoint 500          Muestra: Sangre Heparina
 Gases Arteriales                                    -
 pH                                           *  7.482                                7.350 - 7.450      Potenciometría
  Presión CO2                               *  31.6                 mm/Hg      35.0 - 45.0        Potenciometría modificada
  Exceso de Base                          0.8                   mmoL/L      -2.0 - 3.0
  Bicarbonato                             25.1                  mmoL/L     21.0 - 28.0
  Presión O2                             93.70                mm/Hg      80.00 - 100.00    Medida amperométrica
  FIO2                                   40.00
 PO2 / FIO2                              2.34                mmHg/%                      Calculado Automático
 COOXIMETRIA
  Saturacion de O2                          *  98.1            %           97.0 - 98.0
 OTROS PARAMETROS
 Na+                                   142.00                  mmol/L     135.00 - 145.00    Potenciometría
 K+                                     ${extra.k}                    mmol/L      3.50 - 5.00        Potenciometría
  Glucosa                                     *  141.00                    mg/dl       70.00 - 110.00     Glucosa oxidada
  Lactato                                      *  0.70                    mmol/L      1.00 - 1.80
* Valor fuera de Rangos de Referencia
Fecha de Informe:   04/09/2026   04:41:48
`;

/* ── Arnés del servidor ── */
global.esVerdadero = x => x === true || x === 'TRUE' || x === 'true';
const CFG = { TURNO_DIA_INICIO: '9', TURNO_NOCHE_INICIO: '21' };
global.leerConfig = (k, d) => (k in CFG && CFG[k] !== '') ? CFG[k] : d;
global.escribirConfig = (k, v) => { CFG[k] = v; };
global.ok = d => ({ ok: true, data: d }); global.err = (m, c, e) => ({ ok: false, error: m + (e ? ' ' + e.stack : ''), codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global._tz = () => 'America/Santiago';
global.Utilities = { formatDate: (d, tz, f) => { const p = n => ('0' + n).slice(-2); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + (f.indexOf('HH') > -1 ? ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':00' : ''); } };
global.conLock = fn => fn();
let _u = 0; global.uid = p => p + '_' + (++_u);
global.ahoraTS = () => '2026-09-04 06:31:00'; global.hoyISO = () => '2026-09-04';
global.Logger = { log: () => {} }; global.console = console;
const DB = { GSA_IMPORTADAS: [], CAMAS_ESTADO: [], ARCHIVO_PACIENTES: [], NOTIFICACIONES: [], AUDIT_LOG: [] };
global.repoLeerTodos = (h, k, val) => (DB[h] || []).filter(r => k === undefined || String(r[k]) === String(val)).map(r => Object.assign({}, r));
global.repoLeerFiltrado = (h, k, pred) => (DB[h] || []).filter(r => pred(r[k])).map(r => Object.assign({}, r));
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(Object.assign({}, o)); return o; };
global.repoActualizar = (h, k, id, campos) => { const r = (DB[h] || []).find(x => String(x[k]) === String(id)); if (!r) return false; Object.assign(r, campos); return true; };
global.repoActualizarDonde = (h, fn, mut) => { let n = 0; (DB[h] || []).forEach(r => { if (fn(r)) { Object.assign(r, mut(r) || {}); n++; } }); return n; };
const NOTIFS = []; global.notifRegistrar = n => { NOTIFS.push(n); return 'n'; };
global.auditar = a => { DB.AUDIT_LOG.push(a); };
// _rutNormal / rutValido son las reales de svc_camas.gs (se recortan del fuente)
const camasSrc = lee('svc_camas.gs');
const corta = (src, nombre) => { const i = src.indexOf('function ' + nombre + '('); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3); };
eval(corta(camasSrc, '_rutNormal') + '\n' + corta(camasSrc, 'rutValido'));
eval(corta(lee('infra_fechas.gs'), '_restarDias') + '\n' + corta(lee('infra_fechas.gs'), 'turnoLogicoServidor'));

// Drive de mentira: carpeta con archivos PDF, subcarpetas y moveTo.
const mkFolder = (nombre) => { const f = { nombre, archivos: [], sub: {}, getName: () => nombre, getUrl: () => 'url:' + nombre,
  getId: () => 'id:' + nombre,
  getFoldersByName(n) { const l = f.sub[n] ? [f.sub[n]] : []; let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; },
  createFolder(n) { f.sub[n] = mkFolder(n); return f.sub[n]; },
  getFilesByType() { const l = f.archivos.slice(); let i = 0; return { hasNext: () => i < l.length, next: () => l[i++] }; } }; return f; };
const RAIZ = mkFolder('raíz'); const ENTRADA = mkFolder('RCE-KINE — Gases del laboratorio'); RAIZ.sub[ENTRADA.nombre] = ENTRADA;
const mkPdf = (nombre, texto) => { const a = { nombre, texto, en: ENTRADA, getName: () => nombre, getId: () => 'pdf:' + nombre,
  moveTo(dest) { a.en.archivos = a.en.archivos.filter(x => x !== a); a.en = dest; dest.archivos.push(a); } }; ENTRADA.archivos.push(a); return a; };
const TEXTOS = {};
global.DriveApp = { getRootFolder: () => RAIZ, getFolderById: id => { if (id === ENTRADA.getId()) return ENTRADA; throw new Error('no existe'); },
  getFileById: id => {
    const todos = [ENTRADA].concat(Object.keys(ENTRADA.sub).map(k => ENTRADA.sub[k]));
    for (const c of todos) { const f = c.archivos.find(x => x.getId() === id); if (f) return f; }
    return { setTrashed: () => {}, moveTo: () => {} };
  } };
global.ScriptApp = { getOAuthToken: () => 'tok', getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyDays: () => ({ atHour: () => ({ nearMinute: () => ({ create: () => {} }) }) }) }) }) };
global.UrlFetchApp = { fetch: (url, opt) => {
  if (/\/copy/.test(url)) { const id = decodeURIComponent(url.match(/files\/([^/]+)\/copy/)[1]); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ id: 'doc:' + id }) }; }
  if (/export/.test(url)) { const id = decodeURIComponent(url.match(/files\/([^/]+)\/export/)[1]).replace(/^doc:/, ''); return { getResponseCode: () => 200, getContentText: () => TEXTOS[id] || '' }; }
  return { getResponseCode: () => 404, getContentText: () => 'x' };
} };
global.MimeType = { PDF: 'application/pdf' };
eval(lee('svc_gsa.gs'));

/* ══ 1 · EL PARSER LEE EL FORMATO REAL ═══════════════════════════════════ */
console.log('1 · El parser lee el formato del laboratorio (con sus glifos dobles)');
const t1 = INFORME('11111111-1', '9040527', '04/09/2026  03:40:04', { hb: '6.8', plaq: '55', k: '3.20' });
const p1 = gsaParsear(t1);
eq('RUT', p1.rut, '11111111-1');
eq('petición', p1.peticion, '9040527');
eq('fecha de la toma', p1.fecha, '2026-09-04');
eq('hora de la toma', p1.hora, '03:40');
eq('pH (con asterisco delante)', p1.valores.PH, 7.482);
eq('PaCO₂', p1.valores.PACO2, 31.6);
eq('PaO₂', p1.valores.PAO2, 93.7);
eq('HCO₃', p1.valores.HCO3, 25.1);
eq('EB', p1.valores.EB, 0.8);
eq('FiO₂', p1.valores.FIO2, 40);
eq('★ PaFi: el informe da 2.34 mmHg/% → 234', p1.valores.PAFI, 234);
eq('SatO₂', p1.valores.SATO2, 98.1);
eq('lactato', p1.valores.LACTATO, 0.7);
eq('★ Hb en negrita doble «6.86.8» → 6.8', p1.valores.HB, 6.8);
eq('★ Hto «20.220.2» → 20.2', p1.valores.HTO, 20.2);
eq('plaquetas', p1.valores.PLAQUETAS, 55);
eq('INR', p1.valores.INR, 1.07);
eq('K⁺', p1.valores.K, 3.2);
eq('Na⁺', p1.valores.NA, 142);
eq('glicemia', p1.valores.GLICEMIA, 141);
eq('PCR', p1.valores.PCR, 175);
eq('no es venoso', p1.venoso, false);
eq('desdoblar no toca un número normal', _gsaDesdoblar('12.5'), '12.5');
eq('★ «55» plaquetas siguen siendo 55 (no se parte un número válido)', _gsaDesdoblar('55'), '55');
eq('…salvo marcado crítico con mitades iguales', _gsaDesdoblar('5555', true), '55');
eq('desdoblar «14.314.3»', _gsaDesdoblar('14.314.3', true), '14.3');

/* ══ 1b · EL TEXTO COMO LO DEVUELVE DRIVE (6-sep-2026, reporte de Diego) ══
   La conversión PDF→Documento no respeta las columnas: «Fecha de Ingreso :»
   puede quedar en un renglón y la fecha en el siguiente; la hora, en otro; y
   la etiqueta de un examen separada de su valor. Con el parser línea a línea
   eso daba «sin fecha de toma» → sin hora → sin PATIENT_ID: importaba la fila
   pero nunca llegaba a la hoja diaria. */
console.log('\n1b · El parser lee el texto partido por renglones (como lo devuelve Drive)');
const T_DRIVE = `SERVICIO DE SALUD COQUIMBO
Nº Petición
:
9040599
Nombre
: PACIENTE , DE PRUEBA
Nº RUT
:
11.111.111-1
Fecha de Ingreso
:
04/09/2026
03:41:37
F.Nacimiento : 30/03/1961
HEMATOLOGÍA
Hemoglobina
**
9.9
g/dl
14.0 - 17.5
Hematocrito
29.4
%
Rcto. Plaquetas
253
x10³/µL
PH Y GASES EN SANGRE
Gases Arteriales
pH
*
7.482
7.350 - 7.450
Presión CO2
*
31.6
mm/Hg
Presión O2
93.70
mm/Hg
Bicarbonato
25.1
mmoL/L
Exceso de Base
0.8
FIO2
40.00
PO2 / FIO2
2.34
mmHg/%
Saturacion de O2
98.1
%
K+
3.20
mmol/L
Lactato
0.70
mmol/L
Fecha de Informe:
04/09/2026
05:02:20
`;
const pd = gsaParsear(T_DRIVE);
eq('★ RUT en el renglón siguiente a la etiqueta', pd.rut, '11.111.111-1');
eq('petición partida', pd.peticion, '9040599');
eq('★ fecha de toma en su propio renglón', pd.fecha, '2026-09-04');
eq('★ hora en el renglón siguiente a la fecha', pd.hora, '03:41');
eq('…y viene de «Fecha de Ingreso»', pd.horaOrigen, 'ingreso');
eq('pH con el asterisco en renglón aparte', pd.valores.PH, 7.482);
eq('PaCO₂', pd.valores.PACO2, 31.6);
eq('Hb crítica «9.9» sin glifo doble', pd.valores.HB, 9.9);
eq('Hto', pd.valores.HTO, 29.4);
eq('plaquetas', pd.valores.PLAQUETAS, 253);
eq('PaFi 2.34 → 234', pd.valores.PAFI, 234);
eq('K⁺', pd.valores.K, 3.2);
eq('lactato', pd.valores.LACTATO, 0.7);
const T_SIN_HORA = T_DRIVE.replace('04/09/2026\n03:41:37', '04/09/2026');
const ps = gsaParsear(T_SIN_HORA);
eq('★ sin hora en la toma: se usa la del informe', ps.hora, '05:02');
eq('…y queda dicho', ps.horaOrigen, 'informe');
eq('la fecha sigue siendo la de la toma', ps.fecha, '2026-09-04');
const T_VACIO = T_DRIVE.replace('Bicarbonato\n25.1\nmmoL/L\n', 'Bicarbonato\nmmoL/L\n');
eq('un examen sin valor NO se roba el número del siguiente', gsaParsear(T_VACIO).valores.HCO3, undefined);
eq('el texto original por columnas sigue leyéndose igual', gsaParsear(t1).hora, '03:40');

/* ══ 2 · EL TURNO: SERVIDOR = CLIENTE ═════════════════════════════════════ */
console.log('\n2 · El turno del gas se calcula igual en el servidor y en el cliente');
const idx = lee('index.html');
const cli = corta(idx, '_horasTurno') + '\n' + corta(idx, '_turnoLogico');
const turnoCliente = (fecha, hora, cfg) => {
  const ctx = { window: { CFG: cfg }, pad: n => ('0' + n).slice(-2) };
  const fn = new Function('window', 'pad', cli + '\nreturn _turnoLogico;')(ctx.window, ctx.pad);
  const [y, m, d] = fecha.split('-').map(Number); const [hh, mm] = hora.split(':').map(Number);
  const r = fn(new Date(y, m - 1, d, hh, mm)); return r.fecha + '-' + r.turno;
};
[['2026-09-04', '03:40'], ['2026-09-04', '08:59'], ['2026-09-04', '09:00'], ['2026-09-04', '20:59'], ['2026-09-04', '21:00'], ['2026-09-01', '00:10']].forEach(([f, h]) => {
  eq('  ' + f + ' ' + h + ' · servidor = cliente', turnoLogicoServidor(f, h).turnoKey, turnoCliente(f, h, { TURNO_DIA_INICIO: 9, TURNO_NOCHE_INICIO: 21 }));
});
eq('★ 04:00 cae en la NOCHE del día anterior', turnoLogicoServidor('2026-09-04', '03:40').turnoKey, '2026-09-03-Noche');
CFG.TURNO_DIA_INICIO = '8'; CFG.TURNO_NOCHE_INICIO = '20';
eq('★ si la unidad cambia los cortes en CONFIG, los dos lados se mueven juntos (08:30)',
  turnoLogicoServidor('2026-09-04', '08:30').turnoKey, turnoCliente('2026-09-04', '08:30', { TURNO_DIA_INICIO: 8, TURNO_NOCHE_INICIO: 20 }));
CFG.TURNO_DIA_INICIO = '9'; CFG.TURNO_NOCHE_INICIO = '21';

/* ══ 3 · LA IMPORTACIÓN: certeza o nada ═══════════════════════════════════ */
console.log('\n3 · Importar: con certeza se guarda por episodio; sin certeza, en nadie');
DB.CAMAS_ESTADO = [
  { ID_CAMA: '1', OCUPADA: true, PATIENT_ID: 'pid-cama1', RUT: '11.111.111-1', NOMBRE: 'X' },
  { ID_CAMA: '3', OCUPADA: true, PATIENT_ID: 'pid-cama3', RUT: '22.222.222-2', NOMBRE: 'Y' },
];
DB.ARCHIVO_PACIENTES = [{ PATIENT_ID: 'pid-egresado', RUT: '33.333.333-3', FECHA_INGRESO: '2026-08-20', FECHA_EGRESO: '2026-09-04', CAMA_ORIGEN: '7' }];
const a1 = mkPdf('gsa1.pdf', ''); TEXTOS['pdf:gsa1.pdf'] = t1;                                                       // cama 1
const a2 = mkPdf('gsa8.pdf', ''); TEXTOS['pdf:gsa8.pdf'] = INFORME('22222222-3', '9040534', '04/09/2026  03:46:16', { hb: '10.3', plaq: '253', k: '4.30' });   // RUT con dígito malo
const a3 = mkPdf('gsa18.pdf', ''); TEXTOS['pdf:gsa18.pdf'] = INFORME('33333333-3', '9040543', '04/09/2026  03:52:25', { hb: '14.3', plaq: '361', k: '3.90' }); // egresado ese día
const a4 = mkPdf('gsa1_repetido.pdf', ''); TEXTOS['pdf:gsa1_repetido.pdf'] = t1;                                     // misma petición
const a5 = mkPdf('gsa_sin_episodio.pdf', ''); TEXTOS['pdf:gsa_sin_episodio.pdf'] = INFORME('44444444-4', '9040550', '04/09/2026  04:10:00', { hb: '12.0', plaq: '200', k: '4.00' }); // RUT válido, nadie

const r = gsaImportarPendientes({ email: 'x' });
si('la rutina responde ok', r.ok);
if (!r.ok) console.log(r.error);
eq('importados: 2 (cama 1 y el egresado)', r.data.importados.length, 2);
eq('sin emparejar: 2 (RUT malo y RUT sin episodio)', r.data.sinEmparejar.length, 2);
eq('repetidos: 1 (misma petición)', r.data.repetidos, 1);
eq('errores: 0', r.data.errores.length, 0);
const f1 = DB.GSA_IMPORTADAS.find(g => g.PATIENT_ID === 'pid-cama1');
si('★ el gas de la cama 1 quedó bajo SU PATIENT_ID', !!f1);
eq('…en la NOCHE del 3 (turno calculado por el servidor)', f1 && f1.TURNO_KEY, '2026-09-03-Noche');
eq('…con la fecha de reloj del 4 (la hoja impresa lo busca por ahí)', f1 && f1.FECHA, '2026-09-04');
eq('…y los valores', f1 && [f1.PH, f1.HB, f1.PLAQUETAS, f1.K, f1.PAFI].join('|'), '7.482|6.8|55|3.2|234');
si('el egresado se emparejó por su estadía', DB.GSA_IMPORTADAS.some(g => g.PATIENT_ID === 'pid-egresado' && g.ESTADO === 'ok'));
const sinEmp = DB.GSA_IMPORTADAS.filter(g => g.ESTADO === 'sin_emparejar');
eq('las dos filas sin emparejar existen', sinEmp.length, 2);
si('★ …y NINGUNA lleva PATIENT_ID ni RUT', sinEmp.every(g => !g.PATIENT_ID) && !JSON.stringify(DB.GSA_IMPORTADAS).match(/2222222|4444444/));
si('la del dígito malo dice por qué', sinEmp.some(g => /dígito verificador/.test(g.DETALLE)));
si('★ la del RUT válido sin cama dice qué revisar (6-sep)', sinEmp.some(g => /revisar el RUT en la ficha de la cama/.test(g.DETALLE)));
si('★ ningún nombre del informe se guardó', !/PACIENTE|DE PRUEBA/.test(JSON.stringify(DB.GSA_IMPORTADAS)));
eq('★ los PDF emparejados se MOVIERON a «copiados» (no se borran)', ENTRADA.sub['copiados'].archivos.map(x => x.nombre).sort().join(','), 'gsa1.pdf,gsa18.pdf,gsa1_repetido.pdf');
eq('los sin emparejar, a su bandeja', ENTRADA.sub['sin emparejar'].archivos.map(x => x.nombre).sort().join(','), 'gsa8.pdf,gsa_sin_episodio.pdf');
eq('la carpeta de entrada quedó vacía', ENTRADA.archivos.length, 0);
eq('la petición repetida NO se importó dos veces', DB.GSA_IMPORTADAS.filter(g => g.PETICION === '9040527').length, 1);
si('el buzón recibió el resumen', NOTIFS.length === 1 && /Gases importados: 2/.test(NOTIFS[0].titulo) && /sin emparejar: 2/.test(NOTIFS[0].titulo));
const r2 = gsaImportarPendientes({});
eq('una segunda corrida sin PDF nuevos no hace nada', r2.data.importados.length + r2.data.sinEmparejar.length, 0);
/* ── 3b · La bandeja «sin emparejar» se reintenta sola (6-sep-2026) ── */
console.log('\n3b · Un PDF que ayer no se pudo emparejar se reintenta solo en la corrida siguiente');
// El RUT del PDF gsa_sin_episodio.pdf (44444444-4) recién se registra en la cama 5.
DB.CAMAS_ESTADO.push({ ID_CAMA: '5', OCUPADA: true, PATIENT_ID: 'pid-cama5', RUT: '44.444.444-4', NOMBRE: 'Z' });
const r3 = gsaImportarPendientes({});
eq('★ importados: 1 (el reintento que ahora sí empareja)', r3.data.importados.length, 1);
eq('reintentados: 1', r3.data.reintentados, 1);
eq('★ el del dígito malo sigue en la bandeja SIN fila nueva', ENTRADA.sub['sin emparejar'].archivos.map(x => x.nombre).join(','), 'gsa8.pdf');
eq('…y sin sumar a «sin emparejar» del resumen', r3.data.sinEmparejar.length, 0);
const g5 = DB.GSA_IMPORTADAS.find(g => g.PATIENT_ID === 'pid-cama5');
si('★ el gas quedó bajo el episodio de la cama 5, marcado como reintento', !!g5 && g5.ESTADO === 'ok' && /reintento/.test(g5.DETALLE));
const vieja = DB.GSA_IMPORTADAS.find(g => g.ARCHIVO_ID === 'pdf:gsa_sin_episodio.pdf' && g !== g5);
si('★ la fila vieja «sin_emparejar» quedó marcada «reintentado», no borrada', !!vieja && vieja.ESTADO === 'reintentado');
eq('el PDF se movió a «copiados»', ENTRADA.sub['copiados'].archivos.some(x => x.nombre === 'gsa_sin_episodio.pdf'), true);
const r4 = gsaImportarPendientes({});
eq('otra corrida sin novedades no hace nada (ni reintenta con fila nueva)', r4.data.importados.length + r4.data.sinEmparejar.length + DB.GSA_IMPORTADAS.filter(g => g.ESTADO === 'sin_emparejar').length, 1);
si('gsaDiagnostico existe para el editor y tapa el RUT', /function gsaDiagnostico\(/.test(lee('svc_gsa.gs')) && /<RUT>/.test(lee('svc_gsa.gs')));

/* ── 3c · LA BANDEJA: emparejar a mano desde lo que YA está en la base ──
   Diego (6-sep-2026): «si la info está en base de datos, ¿no es más fácil
   emparejar desde ahí a la hoja de registro?». Sí: los valores ya están
   guardados, lo único que falta es la cama, y eso lo pone una persona —la
   fila sin emparejar NO guarda el RUT, así que la app no puede sola. */
console.log('\n3c · La bandeja: una persona le pone la cama y el gas llega a la hoja diaria');
eq('el nombre del archivo sugiere la cama (gsa7.pdf)', _gsaCamaDelNombre('gsa7.pdf'), '7');
eq('…con separador y mayúsculas (GSA 18.pdf)', _gsaCamaDelNombre('GSA 18.pdf'), '18');
eq('…sin ceros de más (gsa01_repetido.pdf)', _gsaCamaDelNombre('gsa01_repetido.pdf'), '1');
eq('un nombre cualquiera no sugiere nada', _gsaCamaDelNombre('informe_laboratorio.pdf'), '');
const pend = gsaPendientes().data.pendientes;
eq('★ la bandeja muestra el que sigue sin emparejar', pend.length, 1);
eq('…con su archivo', pend[0].ARCHIVO, 'gsa8.pdf');
si('★ …y con los VALORES ya guardados (por eso no hay que volver al PDF)', !pend[0].vacio && pend[0].valores.PH === 7.482);
si('★ la bandeja NO devuelve el RUT ni el nombre del paciente', !/\d{7,8}\s?-\s?[\dkK]|2\.222\.222|PACIENTE|DE PRUEBA/.test(JSON.stringify(pend)));
eq('la cama 8 no está ocupada, así que no se sugiere nada', pend[0].camaSugerida, '');
DB.CAMAS_ESTADO.push({ ID_CAMA: '8', OCUPADA: true, PATIENT_ID: 'pid-cama8', RUT: '55.555.555-5', NOMBRE: 'W' });
eq('★ con la cama 8 ocupada, el nombre del archivo la sugiere', gsaPendientes().data.pendientes[0].camaSugerida, '8');
const idPend = pend[0].ID_GSA;
si('sin cama no se asigna', !gsaAsignar({ idGsa: idPend, idCama: '' }, {}).ok);
si('a una cama vacía tampoco', !gsaAsignar({ idGsa: idPend, idCama: '12' }, {}).ok);
si('un gas que no existe tampoco', !gsaAsignar({ idGsa: 'nope', idCama: '3' }, {}).ok);
const rA = gsaAsignar({ idGsa: idPend, idCama: '3', fecha: '2026-09-04', hora: '03:46' }, { firma: 'DMV' });
si('★ una persona lo asigna a la cama 3 (el RUT del informe venía mal escrito)', rA.ok);
const gA = DB.GSA_IMPORTADAS.find(g => g.ID_GSA === idPend);
eq('…queda bajo el PATIENT_ID de esa cama', gA.PATIENT_ID, 'pid-cama3');
eq('…con estado ok', gA.ESTADO, 'ok');
eq('…y el turno calculado con la MISMA regla del importador', gA.TURNO_KEY, '2026-09-03-Noche');
si('…dejando dicho quién lo hizo', /asignado a mano por DMV/.test(gA.DETALLE));
si('★ el PDF pasó a «copiados», como los que emparejan solos', ENTRADA.sub['copiados'].archivos.some(x => x.nombre === 'gsa8.pdf'));
eq('la bandeja queda vacía', gsaPendientes().data.pendientes.length, 0);
si('★ …y AHORA el gas llega a la hoja diaria de ese paciente', !!gsaDelDia('2026-09-04', ['pid-cama3']).data['pid-cama3']);
eq('★ …con sus valores completos', gsaDelDia('2026-09-04', ['pid-cama3']).data['pid-cama3'][0].PH, 7.482);
si('un gas ya asignado no se puede volver a asignar', !gsaAsignar({ idGsa: idPend, idCama: '1' }, {}).ok);
// Descartar: no borra, marca.
DB.GSA_IMPORTADAS.push({ ID_GSA: 'gsa_desc', ESTADO: 'sin_emparejar', ARCHIVO: 'ajeno.pdf', FECHA: '2026-09-04', HORA: '05:00', PETICION: '', ARCHIVO_ID: '', PATIENT_ID: '', TS_IMPORT: '2026-09-04 06:31:00', PH: 7.4 });
si('descartar responde ok', gsaDescartar({ idGsa: 'gsa_desc', motivo: 'no es de la unidad' }, { firma: 'DMV' }).ok);
const gD = DB.GSA_IMPORTADAS.find(g => g.ID_GSA === 'gsa_desc');
eq('★ el descartado NO se borra: queda marcado', gD.ESTADO, 'descartado');
si('…con quién y por qué', /descartado por DMV: no es de la unidad/.test(gD.DETALLE));
eq('y sale de la bandeja', gsaPendientes().data.pendientes.length, 0);
si('el dispatcher expone la bandeja (asignar y descartar, auditados)',
  /case 'GET_GSA_PENDIENTES'/.test(lee('api.gs')) && /case 'GSA_ASIGNAR':\s*return _auditar/.test(lee('api.gs')) && /case 'GSA_DESCARTAR':\s*return _auditar/.test(lee('api.gs')));

const dia = gsaDelDia('2026-09-04', ['pid-cama1', 'pid-egresado']).data;
eq('gsaDelDia entrega por pid la fecha de reloj', Object.keys(dia).sort().join(','), 'pid-cama1,pid-egresado');
eq('gsaDeEpisodio devuelve solo lo emparejado', gsaDeEpisodio('pid-cama1').length, 1);

/* ══ 4 · ESQUEMA, API, RESET ══════════════════════════════════════════════ */
console.log('\n4 · Esquema, dispatcher y reset');
const esq = lee('esquema.gs'), api = lee('api.gs'), mto = lee('mantenimiento.gs');
si('la hoja GSA_IMPORTADAS existe y guarda PATIENT_ID (no RUT)', /GSA_IMPORTADAS: \{ headerRows: 1/.test(esq) && !/GSA_IMPORTADAS[\s\S]{0,900}?\['RUT'/.test(esq));
si('CONFIG trae GSA_CARPETA_ID', /\['GSA_CARPETA_ID', ''\]/.test(esq));
si('el dispatcher expone GET_GSA_DIA y GSA_IMPORTAR (auditado)', /case 'GET_GSA_DIA'/.test(api) && /case 'GSA_IMPORTAR':\s*return _auditar/.test(api));
si('el reset vacía GSA_IMPORTADAS', /'GSA_IMPORTADAS'/.test(mto.match(/const _RESET_VACIAR = \[[\s\S]*?\];/)[0]));
si('el historial manda los gases del episodio', /gsa: gsa/.test(lee('svc_evoluciones.gs')));
si('la conversión PDF→texto usa solo la API de Drive (sin permisos nuevos)', !/DocumentApp|Drive\.Files/.test(lee('svc_gsa.gs')) && /drive\/v3\/files\/.*\/copy/.test(lee('svc_gsa.gs')));
si('el manifiesto no cambió de alcances', /"https:\/\/www.googleapis.com\/auth\/drive"/.test(lee('appsscript.json')) && !/documents/.test(lee('appsscript.json')));

/* ══ 5 · PANTALLA: hoja impresa y hoja diaria ═════════════════════════════ */
const { chromium } = require('playwright-core');
(async () => {
  console.log('\n5 · Hoja impresa (B/N) y hoja diaria');
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => okF({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2, 'index.html'));
  await p.waitForTimeout(500);
  const R = await p.evaluate(() => {
    const c = { OCUPADA: 'TRUE', ID_CAMA: '1', PATIENT_ID: 'pid-cama1', NOMBRE: 'PRUEBA', FECHA_INGRESO: '2026-09-01', VIA_AEREA: 'TOT' };
    // El último cultivo va en la ÚLTIMA fila de observaciones (Diego, 6-sep).
    window.RK_CULT = { 'pid-cama1': { fecha: '02-09', nombre: 'Cultivo de secreciones', resultado: 'Klebsiella pneumoniae BLEE' } };
    window.GSA_DIA = { 'pid-cama1': [{ HORA: '03:40', PH: 7.482, PACO2: 31.6, PAO2: 93.7, HCO3: 25.1, EB: 0.8, SATO2: 98.1, FIO2: 40, PAFI: 234, LACTATO: 0.7, HB: 6.8, HTO: 20.2, PLAQUETAS: 55, INR: 1.07, K: 3.2, GLICEMIA: 141, PCR: 175 }] };
    const html = rkHojaHTML(c, '2026-09-04', true);
    window.GSA_DIA = {};
    const vacia = rkHojaHTML(c, '2026-09-04', true);        // sin gas, pero CON cultivo
    window.RK_CULT = { 'pid-cama1': { fecha: '05-09', nombre: 'Hisopado nasal', resultado: '' } };
    const pendiente = rkHojaHTML(c, '2026-09-04', true);
    window.RK_CULT = {};
    const sinCultivo = rkHojaHTML(c, '2026-09-04', true);
    // Hoja diaria: un turno con gas y sin evolución + un turno con las dos
    TL_EVOS = [{ TURNO_KEY: '2026-09-04-Dia', FECHA: '2026-09-04', TURNO: 'Dia', GSA_TOMADA: true, GSA_HORA: '14:00', GSA_PH: 7.4, VENT_SOPORTE: 'VM' }];
    TL_GSA = [{ TURNO_KEY: '2026-09-03-Noche', FECHA: '2026-09-04', HORA: '03:40', PH: 7.482, PACO2: 31.6, PAO2: 93.7, PAFI: 234, HB: 6.8, HTO: 20.2, PLAQUETAS: 55, K: 3.2 },
              { TURNO_KEY: '2026-09-04-Dia', FECHA: '2026-09-04', HORA: '10:30', PH: 7.35, PACO2: 44, PAO2: 80, PAFI: 200 }];
    HJ_SEG = 'todo'; HJ_RANGO = 99; HJ_VACIAS = false;
    const hoja = hojaUCI();
    return { html, vacia, pendiente, sinCultivo, hoja };
  });
  si('★ el pH va con asterisco y en NEGRITA con flecha ↑ (7,48 > 7,50? no: 7,482 → sin flecha)', /<td class="rk-c rk-lab">7,48\*<\/td>/.test(R.html));
  si('★ la hoja tiene SOLO las filas del formulario oficial: sin fila Hb ni Hto (Diego, 6-sep)', !/<td class="rk-c">Hb<\/td>/.test(R.html) && !/<td class="rk-c">Hto<\/td>/.test(R.html));
  si('la hora del gas va en la 1ª columna con asterisco', /<td class="rk-c rk-lab">03:40\*<\/td>/.test(R.html));
  si('PaFi 234 sin flecha (≥ 200)', /<td class="rk-c rk-lab">234\*<\/td>/.test(R.html));
  si('★ observaciones: Hb (6,8↓ negrita), Hto y K⁺ SIEMPRE; plaquetas solo por alteradas; ni INR ni glicemia normales',
    /Lab 03:40\*: <b>Hb 6,8↓<\/b> · Hto 20,2 · <b>K⁺ 3,2↓<\/b> · <b>Plaq 55↓<\/b>/.test(R.html) && !/Glic/.test(R.html) && !/INR 1,07/.test(R.html));
  si('sin gases importados la hoja sale como antes (laboratorio en blanco, sin marcadores)', !/\{\{L_/.test(R.vacia) && !/\*<\/td>/.test(R.vacia));
  si('★ el último cultivo va en la ÚLTIMA fila de observaciones, con su fecha y resultado en negrita (Diego, 6-sep)',
    /<td class="rk-c">PCT<\/td>[\s\S]{0,260}?Cultivo de secreciones 02-09: <b>Klebsiella pneumoniae BLEE<\/b>/.test(R.html));
  si('★ …y SIN asterisco: no lo copió el laboratorio, lo escribió la unidad', !/Cultivo de secreciones 02-09\*/.test(R.html));
  si('★ el cultivo sale aunque NO haya gas importado (son datos distintos)', /Cultivo de secreciones 02-09/.test(R.vacia));
  si('★ una muestra tomada sin informe todavía dice «pendiente» (avisa que está en curso)', /Hisopado nasal 05-09: resultado pendiente/.test(R.pendiente));
  si('sin cultivo del episodio la celda queda en blanco', !/resultado pendiente|Cultivo de secreciones/.test(R.sinCultivo) && !/\{\{L_/.test(R.sinCultivo));
  si('ningún marcador {{L_…}} quedó sin reemplazar', !/\{\{L_/.test(R.html));
  si('★ la hoja diaria muestra el gas del lab en la NOCHE del 3 aunque ese turno no tenga evolución', /🧪 lab 03:40/.test(R.hoja) && /03-sep/.test(R.hoja));
  si('…y en el DÍA del 4 conviven el gas del colega (14:00) y el del lab (10:30)', /pH 7,4/.test(R.hoja) && /🧪 lab 10:30/.test(R.hoja));
  si('…con Hb/Hto/Plaq/K⁺ en su fila', /Hb 6,8 · Hto 20,2 · Plaq 55 · K⁺ 3,2/.test(R.hoja));
  eq('sin errores de página', errs.length, 0);
  await b.close();
  console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS:\n' + fails.map(f => '  - ' + f).join('\n') : '\n✅ gsa_importada: todo verde');
  process.exit(fails.length ? 1 : 0);
})();
