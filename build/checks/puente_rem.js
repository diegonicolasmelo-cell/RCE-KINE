// puente_rem.js — Lo que sale del RCE hacia REM Hospital.
//
// Dos cosas se protegen aquí, y las dos duelen si fallan:
//
//  1. PRIVACIDAD (Ley 19.628 + criterio del hospital). Del registro clínico NO
//     sale ni NOMBRE ni RUT. La guardia arma el paquete real de un mes sembrado
//     y busca dentro los nombres y los RUT de esos mismos pacientes. Si aparece
//     uno solo, se pone roja. No mide una lista de campos permitidos —mide el
//     texto que efectivamente viaja—, porque el campo que se filtra siempre es
//     el que nadie puso en la lista.
//
//  2. VOCABULARIO. El destino rechaza lo que no está en su catálogo. Un
//     diagnóstico, un turno o un procedimiento mal traducido no rompe nada: se
//     pierde en silencio dentro de los «avisos» y el mes llega incompleto a
//     Estadística. Aquí se compara contra el catálogo REAL del otro proyecto
//     (se lee su db.py si está en el disco), no contra una copia que envejece.
//
// Uso: node build/checks/puente_rem.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };
const ok_ = (l, c) => { console.log((c ? '✅' : '❌') + ' ' + l); if (!c) fails.push(l); };

// El arnés de la maqueta (simulador de repo + siembra) se reutiliza tal cual.
eval(fs.readFileSync(path.join(__dirname, 'maqueta_demo.js'), 'utf8').split('/* ══ 1 ·')[0]);
eval(fs.readFileSync(path.join(v2, 'svc_rem_puente.gs'), 'utf8'));

CONFIG = {};
for (let c = 1; c <= 18; c++) DB.CAMAS_ESTADO.push({ ID_CAMA: String(c), OCUPADA: false });
prepararPlanillaDemo();
sembrarDemoRCE({ hoyISO: '2026-08-22', semilla: 42 });

const res = exportarRegistrosREM('2026', '7');
ok_('el paquete del mes se arma', res.ok === true);
const paq = res.data;
const texto = JSON.stringify(paq);

/* ══ 1 · Ni nombre ni RUT salen del sistema ════════════════════════════ */
console.log('\n1 · Privacidad: lo que viaja no identifica a nadie');
const nombres = new Set(), ruts = new Set();
DB.EVOLUCIONES.concat(DB.EVOLUCIONES_ARCHIVO).forEach(e => { if (e.PAC_NOMBRE) nombres.add(String(e.PAC_NOMBRE)); });
DB.ARCHIVO_PACIENTES.forEach(a => { if (a.RUT) ruts.add(String(a.RUT)); });
DB.CAMAS_ESTADO.forEach(c => { if (c.RUT) ruts.add(String(c.RUT)); });
ok_('hay nombres y RUT en la base de origen (' + nombres.size + ' / ' + ruts.size + ')',
  nombres.size > 5 && ruts.size > 5);
const nombreFiltrado = [...nombres].filter(n => texto.indexOf(n) > -1);
const rutFiltrado = [...ruts].filter(r => texto.indexOf(r) > -1);
eq('ningún NOMBRE viaja en el paquete', nombreFiltrado.join(' | ') || 'ninguno', 'ninguno');
eq('ningún RUT viaja en el paquete', rutFiltrado.join(' | ') || 'ninguno', 'ninguno');
// Ni siquiera un apellido suelto: se buscan las palabras de cada nombre.
const palabras = new Set();
[...nombres].forEach(n => n.split(/\s+/).forEach(p => { if (p.length > 3) palabras.add(p); }));
eq('tampoco un apellido suelto', [...palabras].filter(p => texto.indexOf(p) > -1).join(' | ') || 'ninguno', 'ninguno');
ok_('la identidad que viaja son las iniciales (≤4 letras)',
  paq.episodios.every(e => /^[A-ZÑÁÉÍÓÚ]{1,4}$/.test(e.iniciales)));

/* ══ 2 · El vocabulario calza con el catálogo del destino ══════════════ */
console.log('\n2 · Vocabulario: el destino no rechaza nada en silencio');
// El catálogo REAL del otro proyecto, si está en el disco de quien corre esto.
const DB_PY = path.join(process.env.HOME || '', 'Documents', 'rem-hospital', 'app', 'db.py');
const listaPy = (fuente, nombre) => {
  const m = fuente.match(new RegExp(nombre + '\\s*=\\s*\\[([\\s\\S]*?)\\]'));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : null;
};
let DX, PROCS, TIPOS, TURNOS, fuenteCat;
if (fs.existsSync(DB_PY)) {
  const py = fs.readFileSync(DB_PY, 'utf8');
  DX = listaPy(py, 'DX_INGRESO'); PROCS = listaPy(py, 'PROCEDIMIENTOS_KINE');
  TIPOS = listaPy(py, 'TIPOS_ATENCION'); TURNOS = listaPy(py, 'TURNOS_KINE');
  fuenteCat = 'el db.py real de rem-hospital';
} else {
  // Copia de respaldo (28-jul-2026). Si el otro proyecto no está en el disco no
  // se puede comparar contra la verdad, y eso se DICE en vez de aparentar verde.
  DX = ['ACV', 'TEC', 'LM', 'ENM agudas', 'ENM crónicas', 'Otras neurológicas', 'Sd. Post-UCI',
    'COVID-19', 'Enfermedades respiratorias', 'Enfermedades cardíacas', 'Otras reumatológicas',
    'Traumatológicos', 'Otros pre y post quirúrgicos', 'Oncológicos', 'Genitourinarias',
    'Amputación', 'Quemados', 'Otros'];
  PROCS = ['INTUBACIÓN', 'PVE', 'EXTUBACIÓN C/PROTOCOLO', 'EXTUBACIÓN S/PROTOCOLO', 'AUTOEXTUBACIÓN',
    'EXTUBACIÓN ACCIDENTAL', 'REINTUBACIÓN', 'DESVINCULACIÓN', 'CAMBIO TOT', 'TQT', 'CAMBIO TQT'];
  TIPOS = ['KTR', 'KTM', 'KTM contraindicada'];
  TURNOS = ['Largo', 'Noche'];
  fuenteCat = 'la copia de respaldo (rem-hospital no está en este disco)';
}
console.log('   catálogo leído de: ' + fuenteCat);
ok_('el catálogo de destino se pudo leer', !!(DX && PROCS && TIPOS && TURNOS));

const fuera = (valores, permitidos) => [...new Set(valores)].filter(v => permitidos.indexOf(v) === -1);
eq('todos los diagnósticos existen en el destino',
  fuera(paq.episodios.map(e => e.dx), DX).join(' | ') || 'ninguno fuera', 'ninguno fuera');
eq('todos los tipos de atención existen',
  fuera(paq.atenciones.map(a => a.tipo), TIPOS).join(' | ') || 'ninguno fuera', 'ninguno fuera');
eq('todos los procedimientos existen',
  fuera(paq.procedimientos.map(p => p.procedimiento), PROCS).join(' | ') || 'ninguno fuera', 'ninguno fuera');
eq('todos los turnos existen (Día → Largo)',
  fuera(paq.atenciones.map(a => a.turno).concat(paq.procedimientos.map(p => p.turno)), TURNOS).join(' | ') || 'ninguno fuera',
  'ninguno fuera');
eq('los motivos de egreso existen',
  fuera(paq.episodios.filter(e => e.motivo_egreso).map(e => e.motivo_egreso),
    ['Alta', 'Traslado', 'Fallecimiento', 'Abandono', 'Otro']).join(' | ') || 'ninguno fuera', 'ninguno fuera');

/* ══ 3 · El paquete es completo y consistente ══════════════════════════ */
console.log('\n3 · Nada queda huérfano ni fuera del mes');
const refs = new Set(paq.episodios.map(e => e.ref));
eq('toda atención pertenece a un episodio del paquete',
  paq.atenciones.filter(a => !refs.has(a.ref)).length, 0);
eq('todo procedimiento pertenece a un episodio del paquete',
  paq.procedimientos.filter(p => !refs.has(p.ref)).length, 0);
const delMes = f => String(f).slice(0, 7) === '2026-07';
eq('toda atención cae dentro del mes pedido', paq.atenciones.filter(a => !delMes(a.fecha)).length, 0);
eq('todo procedimiento cae dentro del mes pedido', paq.procedimientos.filter(p => !delMes(p.fecha)).length, 0);
// Julio es un mes CERRADO: a estas alturas todos sus episodios egresaron. La
// convivencia de abiertos y cerrados se comprueba en el mes en curso, que es
// donde de verdad ocurre — y de paso se prueba que se puede exportar un mes a
// medio andar sin esperar a que termine.
ok_('el mes cerrado no arrastra episodios abiertos', paq.episodios.every(e => e.f_egreso));
const agosto = exportarRegistrosREM('2026', '8').data;
ok_('el mes en curso trae los que siguen en cama y los que ya egresaron',
  agosto.episodios.some(e => !e.f_egreso) && agosto.episodios.some(e => e.f_egreso));
ok_('y a los que siguen en cama les viaja la cama que ocupan',
  agosto.episodios.filter(e => !e.f_egreso).every(e => String(e.cama).length > 0));
ok_('hay atenciones (' + paq.atenciones.length + ') y procedimientos (' + paq.procedimientos.length + ')',
  paq.atenciones.length > 50 && paq.procedimientos.length > 3);

/* ══ 4 · El control dice lo mismo que el REM 28 ════════════════════════ */
console.log('\n4 · El bloque de control es el REM 28 de este mismo sistema');
const rem = generarREM('2026', '7', {}).data;
eq('ingresos', paq.control.ingresos, rem.ingresos);
// 601171 «Asistencia en IOT, VMNI, cambio de cánula de traqueostomía»: los TRES
// eventos suman a la casilla, así que los tres tienen que VIAJAR — si no, el
// destino no puede derivarla y los dos motores se separan en silencio.
const _va = n => paq.procedimientos.filter(p => p.procedimiento === n).length;
eq('601171 declarado en el control', paq.control.asistencias_va, rem.asistenciasVA);
ok_('la conexión no invasiva viaja como procedimiento (' + _va('CONEXIÓN VNI') + ')', _va('CONEXIÓN VNI') > 0);
eq('los eventos de vía aérea que viajan derivan el mismo 601171',
  _va('INTUBACIÓN') + _va('REINTUBACIÓN') + _va('CAMBIO TQT') + _va('CONEXIÓN VNI'),
  rem.asistenciasVA);
eq('KTR', paq.control.ktr, rem.sumKTR);
eq('KTM', paq.control.ktm, rem.sumKTM);
eq('sesiones', paq.control.sesiones, rem.sesiones);
// Y las atenciones que viajan tienen que SUMAR eso mismo: si el paquete pierde
// registros por el camino, el destino lo cazará, pero mejor cazarlo aquí.
const suma = (tipo) => paq.atenciones.filter(a => a.tipo === tipo).reduce((s, a) => s + a.cantidad, 0);
eq('las atenciones KTR del paquete suman lo declarado', suma('KTR'), rem.sumKTR);
eq('las atenciones KTM del paquete suman lo declarado', suma('KTM'), rem.sumKTM);

console.log('\n' + (fails.length ? '❌ FALLAN ' + fails.length + ': ' + fails.join(' · ')
  : '✅ TODO OK — el puente entrega un mes completo y anónimo'));
process.exit(fails.length ? 1 : 0);
