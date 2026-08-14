// vm_no_es_vni.js — «VM» en este sistema es SIEMPRE ventilación mecánica
// INVASIVA. La VNI es ventilación mecánica en lo clínico, pero aquí cuenta
// aparte y NUNCA suma a los días de VM.
//
// De dónde sale: pregunta de Diego (14-ago-2026), textual: «VNI no se debe
// considerar como VM. Es VM pero para nuestro sistema VM solo es VMI, ¿está
// considerado así? Porque finalmente esto influye en el conteo de días de VMI
// para que no se confundan los conceptos».
//
// Al auditarlo la respuesta era que SÍ, en los siete lugares que cuentan. Esta
// guardia existe para que siga siendo verdad: es una regla que vive repartida
// —contador de tramos, indicadores, archivo del episodio, REM, tarjeta de
// cama, rutinas de reparación— y este proyecto ya pagó tres veces el precio de
// una regla que se separa (la fecha de los filtros, «día con VM» con dos
// definiciones, las secreciones en tres vistas).
//
// LA GARANTÍA MÁS FUERTE NO ES ESTA GUARDIA, ES EL CATÁLOGO: una vía aérea no
// invasiva (Full Face / Oronasal) solo ofrece el soporte 'VNI', y el soporte
// 'VM' solo se ofrece con TOT o TQT. O sea que marcar VNI como VM no es que
// esté prohibido: es que no se puede. El bloque 1 vigila eso.
//
// Uso: node build/checks/vm_no_es_vni.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
const lee = f => fs.readFileSync(path.join(v2, f), 'utf8');

/* ══ 1 · EL CATÁLOGO LO HACE IMPOSIBLE ══════════════════════════════════ */
console.log('\n1 · Ninguna vía aérea permite confundirlos');
const sops = va => {
  const m = idx.match(new RegExp("'" + va + "':\\s*\\{sops:\\s*\\[([^\\]]*)\\]"));
  return m ? m[1].replace(/'/g, '').split(',').map(s => s.trim()) : [];
};
[['TOT', 'VM', 'VNI'], ['TQT', 'VM', 'VNI']].forEach(([va, debe, noDebe]) => {
  eq('  ' + va + ' ofrece ' + debe, sops(va).includes(debe), true);
  eq('  ' + va + ' NO ofrece ' + noDebe, sops(va).includes(noDebe), false);
});
[['Full Face', 'VNI', 'VM'], ['Oronasal', 'VNI', 'VM']].forEach(([va, debe, noDebe]) => {
  eq('  ' + va + ' ofrece ' + debe, sops(va).includes(debe), true);
  eq('  ★ ' + va + ' NO ofrece ' + noDebe, sops(va).includes(noDebe), false);
});
// Y una vía aérea natural no ofrece ninguno de los dos.
eq('  Natural no ofrece VM ni VNI',
  sops('Natural').includes('VM') || sops('Natural').includes('VNI'), false);

/* ══ 2 · LOS CONTADORES SON DOS, SEPARADOS ══════════════════════════════ */
console.log('\n2 · Días de VM y días de VNI se cuentan por separado');
const evo = lee('svc_evoluciones.gs');
const bloqueVM = (evo.match(/datos\.DIAS_VM = _contadorTramos\([\s\S]{0,260}?\);/) || [''])[0];
const bloqueVNI = (evo.match(/datos\.DIAS_VNI = _contadorTramos\([\s\S]{0,260}?\);/) || [''])[0];
eq('el contador de días de VM existe', bloqueVM !== '', true);
eq('el de VNI también, aparte', bloqueVNI !== '', true);
eq("★ el contador de VM NO menciona 'VNI'", /VNI/.test(bloqueVM), false);
eq("★ el contador de VNI NO menciona 'VM'", /'VM'/.test(bloqueVNI), false);

/* ══ 3 · TODO LO QUE CUENTA «DÍA CON VM» USA SOLO 'VM' ══════════════════ */
console.log('\n3 · Los siete consumidores que cuentan');
// Cada uno se comprueba por su línea real: si alguien le agrega VNI, cae.
const CONSUMIDORES = [
  ['indicadores · día con VM', 'svc_indicadores.gs',
   /const _esDiaVM = e => String\(e\.VENT_SOPORTE\) === 'VM' \|\| String\(e\.VENT_SOPORTE_FINAL\) === 'VM';/],
  ['archivo del episodio · turnos en VM', 'svc_camas.gs',
   /if \(e\.VENT_SOPORTE === 'VM'\) turnosVM\+\+;/],
  ['archivo del episodio · días con VM', 'svc_camas.gs',
   /if \(e\.VENT_SOPORTE === 'VM' \|\| e\.VENT_SOPORTE_FINAL === 'VM'\) diasVMset\[f\] = true;/],
  ['REM · turnos en VM', 'svc_rem.gs',
   /if \(e\.VENT_SOPORTE === 'VM'\) turnosVM\+\+;/],
  ['tarjeta de cama · días de VM en vivo', 'svc_camas.gs',
   /c\.DIAS_VM = \(c\.SOPORTE === 'VM'\) \? diasEntre/],
  ['reparación · resellar DIAS_VM', 'mantenimiento_manuel.gs',
   /DIAS_VM: {2}e => String\(e\.VENT_SOPORTE\) === 'VM' {2}\|\| finSop\(e\) === 'VM',/],
  ['reparación · resellar DIAS_VNI aparte', 'mantenimiento_manuel.gs',
   /DIAS_VNI: e => String\(e\.VENT_SOPORTE\) === 'VNI' \|\| finSop\(e\) === 'VNI',/],
];
CONSUMIDORES.forEach(([nombre, archivo, re]) =>
  eq('  ' + nombre, re.test(lee(archivo)), true));

/* ══ 4 · DONDE SÍ VAN JUNTOS, ES OTRA COSA ══════════════════════════════ */
console.log('\n4 · Los dos sitios que agrupan VM y VNI — y por qué está bien');
// Al INGRESAR y al sincronizar la cama se estampa FECHA_INICIO_SOPORTE, que es
// el reloj del SOPORTE VENTILATORIO — y un paciente que llega en VNI sí tiene
// un soporte que empezó ese día. Ese reloj NO es el contador de días de VM: el
// contador lee el soporte de cada turno, y solo usa este reloj cuando la cama
// ya está en VM. Agrupar ahí es correcto; agrupar en un contador no lo sería.
const camas = lee('svc_camas.gs');
eq('al ingresar, VM y VNI comparten una misma bandera',
  /const tieneVM = sop === 'VM' \|\| sop === 'VNI';/.test(camas), true);
eq('  …y esa bandera solo estampa el reloj del soporte',
  /FECHA_INICIO_SOPORTE: tieneVM \? fecha : ''/.test(camas), true);
eq('  …y NUNCA un contador de días',
  /DIAS_VM[^\n]*tieneVM|tieneVM[^\n]*DIAS_VM/.test(camas), false);
eq('★ y el tramo de VM solo arranca del reloj si la cama YA está en VM',
  /String\(cama\.SOPORTE\) === 'VM' \? cama\.FECHA_INICIO_SOPORTE : fecha/.test(evo), true);

/* ══ 5 · LA INTERFAZ NO DECIDE ══════════════════════════════════════════ */
console.log('\n5 · Manda el soporte registrado, no la mascarilla');
// Una Full Face puesta con oxigenoterapia o CNAF NO es VNI: eso se decidió en
// la v5.41 y está escrito junto al contador.
eq('el contador de VNI lo dice en su comentario',
  /VNI manda el SOPORTE registrado, nunca la interfaz/.test(evo), true);

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK — VM es VMI, y la VNI cuenta aparte');
process.exit(fails.length ? 1 : 0);
