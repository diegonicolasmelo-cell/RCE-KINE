// equipos_grilla.js — Guardia de la LISTA DE VENTILADORES POR CAMA (sep-2026,
// feedback de los colegas: «revisar en el móvil los ventiladores se hace
// engorroso»). Es la hoja de papel «Entrega de turno Kinesiología» en la app.
//
// Lo que fija, con el servidor REAL corriendo en el simulador:
//  1. Tres estados por cama (Diego: «puede tener VM sin uso o que no exista
//     VM en esa sala»): sin equipo · equipo sin uso · equipo en uso. Y los
//     cruces que avisan sin bloquear: paciente en VM sin equipo, equipo «en
//     uso» en una cama que no está en VM, paciente en VM con equipo «sin uso».
//  2. Los filtros vencen con la MISMA regla que la hoja diaria y «Cambios de
//     esta noche» (estadoDispositivos): no se recalcula distinto acá.
//  3. La bodega se desglosa por NOMBRE (lo numerado, por categoría) y por
//     CANTIDAD (el stock sin número); lo dado de baja no cuenta.
//  4. El check es por cama y SE REINICIA CADA TURNO sin borrar nada: hoja de
//     solo agregar, marcar = fila 'ok', desmarcar = fila 'anulado', y el turno
//     lo decide el reloj del SERVIDOR (a las 02:00 sigue siendo la noche de ayer).
//  5. «VM en uso» solo se puede marcar en un equipo que está EN una cama; salir
//     de la cama lo apaga solo.
//  6. La fecha de un filtro escrita desde la lista deja su sello de procedencia.
//  7. Movimientos y fallas salen en UNA línea de tiempo, lo más reciente primero.
//
// Uso: node build/checks/equipos_grilla.js
const fails = [];
const eq = (l, g, w) => { const ok = String(g) === String(w);
  console.log((ok ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g));
  if (!ok) { fails.push(l); console.log('   esperado: ' + JSON.stringify(w)); } };
const si = (l, g) => eq(l, !!g, 'true');

const { api, DB, SIM, CONFIG } = require('../sim/sim_srv.js');
// 🪤 El simulador hace que Utilities.formatDate LANCE (para que nadie lo use
// en vez de hoyISO/ahoraTS), y _restarDias lo usa con un catch que devuelve
// la misma fecha: la regla de la madrugada quedaría muda aquí. Se repone una
// resta de días de verdad, como hace gsa_importada.js.
global._restarDias = (f, n) => { const d = new Date(String(f).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - (parseInt(n, 10) || 0)); return d.toISOString().slice(0, 10); };
const ctx = { firmaKine: 'DMV' };
const call = (a, d) => api(a, Object.assign({}, ctx, d || {}), '');
const hace = n => { const d = new Date(SIM.fecha + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

/* ── Banco: 6 camas, un parque chico con las cuatro categorías ─────────── */
CONFIG.NUM_CAMAS = '6';
SIM.fecha = '2026-07-01'; SIM.hora = '10:00:00';
DB.CAMAS_ESTADO.length = 0;
const cama = (id, extra) => Object.assign({ ID_CAMA: String(id), OCUPADA: false, SOPORTE: 'Ambiente', VIA_AEREA: 'Natural', MODO: 'Sin soporte' }, extra || {});
DB.CAMAS_ESTADO.push(
  cama(1),
  cama(2, { OCUPADA: true, PATIENT_ID: 'p2' }),
  cama(3, { OCUPADA: true, PATIENT_ID: 'p3', SOPORTE: 'VM', VIA_AEREA: 'TOT', MODO: 'ACVC',
            DISP_TC_FECHA: hace(3), DISP_HEPA_FECHA: hace(2), DISP_HME_FECHA: hace(0) }),
  cama(4, { OCUPADA: true, PATIENT_ID: 'p4', SOPORTE: 'VM', VIA_AEREA: 'TOT', MODO: 'ACVC' }),
  cama(5, { OCUPADA: true, PATIENT_ID: 'p5' }),
  cama(6, { OCUPADA: true, PATIENT_ID: 'p6', SOPORTE: 'VM', VIA_AEREA: 'TQT', MODO: 'CPAP/PS' }),
);
DB.VENTILADORES.length = 0;
const vm = (id, nombre, marca, cat, tipo, det, extra) => Object.assign({ ID_VM: id, NOMBRE: nombre, MARCA: marca, CATEGORIA: cat,
  ACTIVO: true, ESTADO: 'Operativo', UBIC_TIPO: tipo, UBIC_DETALLE: det || '', EN_USO: false }, extra || {});
DB.VENTILADORES.push(
  vm('MK16', 'MK16', 'Mekics', 'VM', 'CAMA', '2'),
  vm('SV2',  'SV2',  'Servo',  'VM', 'CAMA', '3', { EN_USO: true, OBS: 'circuito nuevo el 30' }),
  vm('MK12', 'MK12', 'Mekics', 'VM', 'CAMA', '5', { EN_USO: true }),
  vm('PB1',  'PB1',  'Puritan Bennett', 'VM', 'CAMA', '6'),
  vm('V60_1', 'V60 N°1', 'Philips', 'VNI', 'CAMA', '6'),
  vm('VELA2', 'Vela 2', 'Vela', 'VM', 'BODEGA'),
  vm('VELA3', 'Vela 3', 'Vela', 'VM', 'BODEGA'),
  vm('AIRVO1', 'Airvo 2 N°1', 'F&P', 'CNAF', 'BODEGA'),
  vm('MR850', 'MR850', 'F&P', 'APOYO', 'BODEGA'),
  vm('CAR1', 'Carina', 'Dräger', 'VNI', 'BODEGA'),
  vm('MK5', 'MK5', 'Mekics', 'VM', 'PASILLO'),
  vm('MK10', 'MK10', 'Mekics', 'VM', 'EQUIPOS'),
  vm('AVEA1', 'Avea 1', 'Avea', 'VM', 'PRESTAMO', 'UTI'),
  vm('VIEJO', 'Savina X', 'Savina', 'VM', 'BODEGA', '', { ACTIVO: false }),
);
DB.STOCK_EQUIPOS.length = 0;
DB.STOCK_EQUIPOS.push(
  { ID_STOCK: 'S1', NOMBRE: 'Capnógrafo', MARCA: 'Medtronic', CATEGORIA: 'Capnografía', CANTIDAD: 5, ESTADO: 'Operativo', ACTIVO: true, ASIGNACION_JSON: '{"3":1}' },
  { ID_STOCK: 'S2', NOMBRE: 'Aerogen', MARCA: 'Aerogen', CATEGORIA: 'Nebulización', CANTIDAD: 4, ESTADO: 'De baja', ACTIVO: true, ASIGNACION_JSON: '' },
);
DB.CHECK_EQUIPOS.length = 0;

console.log('\n1 · La lista: tres estados y los cruces');
let g = call('GET_GRILLA_EQUIPOS');
si('la grilla responde', g.ok);
g = g.data;
eq('una fila por cama, en orden', g.camas.map(c => c.cama).join(','), '1,2,3,4,5,6');
eq('el turno lo dice el servidor', g.turnoKey, '2026-07-01-Dia');
const C = n => g.camas[n - 1];
eq('cama 1: vacía y sin equipo', C(1).vm === null && !C(1).ocupada, true);
eq('cama 2: equipo SIN uso (MK16) y sin alerta', C(2).vm.nombre + '/' + C(2).vm.enUso + '/' + C(2).alerta, 'MK16/false/');
eq('cama 3: equipo EN uso y sin alerta', C(3).vm.nombre + '/' + C(3).vm.enUso + '/' + C(3).alerta, 'SV2/true/');
eq('cama 3 trae la observación del equipo', C(3).vm.obs, 'circuito nuevo el 30');
eq('cama 4: paciente en VM sin ventilador ⇒ alerta', C(4).alerta, 'sin_equipo');
eq('cama 5: equipo «en uso» pero la cama no está en VM ⇒ alerta', C(5).alerta, 'uso_sin_vm');
eq('cama 6: paciente en VM y equipo «sin uso» ⇒ alerta', C(6).alerta, 'vm_sin_uso');
eq('cama 6 lleva además el V60 (del paciente, no de la cama)', C(6).otros.map(o => o.nombre + ':' + o.categoria).join(), 'V60 N°1:VNI');

console.log('\n2 · Los filtros vencen con la regla de siempre');
const F = (n, k) => C(n).filtros.find(f => f.k === k);
eq('cama 3 · Trachcare etiquetado hace 3 días: VENCIDO', F(3, 'tc').vence, true);
eq('cama 3 · HEPA etiquetado hace 2 días: cambia ESTA NOCHE', F(3, 'hepa').estaNoche && !F(3, 'hepa').vence, true);
eq('cama 3 · HME de hoy: ni vence ni es esta noche', !F(3, 'hme').vence && !F(3, 'hme').estaNoche, true);
eq('cama 3 · el HME dice cuándo se cambia', F(3, 'hme').fechaCambio, hace(-2));
eq('cama 1 (vacía): ningún filtro aplica', C(1).filtros.every(f => !f.aplica), true);
eq('cama 2 (Ambiente, natural): ningún filtro aplica', C(2).filtros.every(f => !f.aplica), true);

console.log('\n3 · La bodega, desglosada');
eq('VM en bodega, por NOMBRE', g.bodega.VM.map(x => x.nombre).join(' · '), 'Vela 2 · Vela 3');
eq('VNI en bodega', g.bodega.VNI.map(x => x.nombre).join(), 'Carina');
eq('CNAF en bodega', g.bodega.CNAF.map(x => x.nombre).join(), 'Airvo 2 N°1');
eq('APOYO en bodega', g.bodega.APOYO.map(x => x.nombre).join(), 'MR850');
eq('el dado de baja no aparece', JSON.stringify(g.bodega).indexOf('Savina X'), -1);
eq('el stock sin número va por cantidad (5 total, 4 disponibles: 1 en la cama 3)',
  g.bodega.stock.map(s => s.nombre + ' ' + s.disponible + '/' + s.cantidad).join(), 'Capnógrafo 4/5');
eq('…y el Aerogen de baja no cuenta', g.bodega.stock.some(s => /aerogen/i.test(s.nombre)), false);
eq('pasillo · equipos médicos · préstamo, con nombre', [g.pasillo, g.equipos, g.prestamo].map(a => a.map(x => x.nombre).join()).join(' | '), 'MK5 | MK10 | Avea 1');
eq('el préstamo dice a qué unidad', g.prestamo[0].ubicDetalle, 'UTI');
eq('la flota para el selector: solo VM invasivos activos', g.flota.map(x => x.nombre).sort().join(), 'Avea 1,MK10,MK12,MK16,MK5,PB1,SV2,Vela 2,Vela 3');

console.log('\n4 · El check: por cama, se reinicia cada turno, nada se borra');
eq('parte sin revisadas', g.revisadas, 0);
let r = call('EQUIPO_CHECK', { idCama: '3', detalle: { idVm: 'SV2', enUso: true } });
si('marcar la cama 3', r.ok);
eq('…devuelve hora y firma', r.data.check.hora + ' ' + r.data.check.firma, '10:00 DMV');
g = call('GET_GRILLA_EQUIPOS').data;
eq('la grilla la muestra revisada', C(3).check && C(3).check.firma, 'DMV');
eq('revisadas 1', g.revisadas, 1);
SIM.hora = '10:05:00';
r = call('EQUIPO_CHECK', { idCama: '3', marcar: false });
si('desmarcar la cama 3', r.ok);
g = call('GET_GRILLA_EQUIPOS').data;
eq('la grilla ya no la muestra revisada', C(3).check, null);
eq('…y la hoja conserva LAS DOS filas (solo agregar)', DB.CHECK_EQUIPOS.length, 2);
eq('…la segunda dice «anulado»', DB.CHECK_EQUIPOS[1].ESTADO, 'anulado');
SIM.hora = '10:10:00';
call('EQUIPO_CHECK', { idCama: '3' });
call('EQUIPO_CHECK', { idCama: '1' });
g = call('GET_GRILLA_EQUIPOS').data;
eq('dos camas revisadas en el turno Día (una vacía: revisar «aquí no hay VM» también vale)', g.revisadas, 2);
SIM.hora = '22:00:00';
g = call('GET_GRILLA_EQUIPOS').data;
eq('a las 22:00 es otro turno', g.turnoKey, '2026-07-01-Noche');
eq('…y la lista parte en cero SIN borrar nada', g.revisadas + '/' + DB.CHECK_EQUIPOS.length, '0/4');
call('EQUIPO_CHECK', { idCama: '6' });
SIM.fecha = '2026-07-02'; SIM.hora = '02:30:00';
g = call('GET_GRILLA_EQUIPOS').data;
eq('a las 02:30 sigue siendo la noche del 1 (regla de la madrugada)', g.turnoKey, '2026-07-01-Noche');
eq('…así que el check de las 22:00 sigue vigente', C(6).check !== null, true);
SIM.fecha = '2026-07-01'; SIM.hora = '11:00:00';
r = call('EQUIPO_CHECK', { idCama: '99' });
eq('una cama fuera de rango se rechaza', r.ok, false);

console.log('\n5 · «VM en uso» es del equipo y solo en una cama');
r = call('EQUIPO_EN_USO', { idVm: 'MK16', enUso: true });
si('marcar MK16 en uso', r.ok);
g = call('GET_GRILLA_EQUIPOS').data;
eq('cama 2 ahora dice en uso (y avisa: la cama no está en VM)', C(2).vm.enUso + '/' + C(2).alerta, 'true/uso_sin_vm');
r = call('EQUIPO_EN_USO', { idVm: 'VELA2', enUso: true });
eq('un equipo en bodega NO se puede marcar en uso', r.ok, false);
r = call('MOVER_VENTILADOR', { idVm: 'VELA2', tipo: 'CAMA', detalle: '4', enUso: true, motivo: 'desde la lista' });
si('asignar la Vela 2 a la cama 4 desde la lista, en uso', r.ok);
g = call('GET_GRILLA_EQUIPOS').data;
eq('cama 4 queda con Vela 2 en uso y sin alerta', C(4).vm.nombre + '/' + C(4).vm.enUso + '/' + C(4).alerta, 'Vela 2/true/');
eq('la bodega de VM queda con la Vela 3 sola', g.bodega.VM.map(x => x.nombre).join(), 'Vela 3');
r = call('MOVER_VENTILADOR', { idVm: 'MK12', tipo: 'BODEGA', motivo: 'sale de la cama 5' });
si('mover el MK12 a bodega', r.ok);
eq('…salir de la cama apaga «en uso» solo', DB.VENTILADORES.find(x => x.ID_VM === 'MK12').EN_USO, false);
r = call('MOVER_VENTILADOR', { idVm: 'MK16', tipo: 'CAMA', detalle: '1', motivo: 'reubicación desde el tablero' });
si('el tablero mueve sin opinar sobre el uso', r.ok);
eq('…y el equipo conserva lo que tenía (en uso)', DB.VENTILADORES.find(x => x.ID_VM === 'MK16').EN_USO, true);

console.log('\n6 · La fecha de un filtro desde la lista deja su sello');
r = call('EQUIPO_FILTRO_FECHA', { idCama: '3', k: 'hme', fecha: '2026-06-29' });
si('escribir el HME de la cama 3', r.ok);
g = call('GET_GRILLA_EQUIPOS').data;
eq('la grilla la muestra', F(3, 'hme').fecha, '2026-06-29');
eq('…con quién y desde dónde', F(3, 'hme').edit.f + '/' + F(3, 'hme').edit.o, 'DMV/grilla');
eq('…y ahora ese HME está vencido (2 días)', F(3, 'hme').vence, true);
eq('el dato es el MISMO de la cama (una puerta, no una copia)', DB.CAMAS_ESTADO.find(c => c.ID_CAMA === '3').DISP_HME_FECHA, '2026-06-29');
r = call('EQUIPO_FILTRO_FECHA', { idCama: '1', k: 'hme', fecha: '2026-06-29' });
eq('en una cama sin paciente se rechaza', r.ok, false);
r = call('EQUIPO_FILTRO_FECHA', { idCama: '3', k: 'hepa', fecha: 'ayer' });
eq('una fecha mal escrita se rechaza', r.ok, false);
r = call('EQUIPO_FILTRO_FECHA', { idCama: '3', k: 'hme', fecha: '' });
si('borrar la fecha también es una edición válida', r.ok && DB.CAMAS_ESTADO.find(c => c.ID_CAMA === '3').DISP_HME_FECHA === '');

console.log('\n7 · Historial unificado del equipo');
SIM.hora = '12:00:00';
r = call('REGISTRAR_FALLA_VM', { idVm: 'VELA2', descripcion: 'alarma de flujo intermitente' });
si('registrar una falla', r.ok);
r = call('GET_HISTORIAL_EQUIPO', { idVm: 'VELA2' });
si('el historial responde', r.ok);
eq('trae movimiento Y falla', r.data.items.map(i => i.tipo).join(), 'falla,mov');
eq('lo más reciente primero', r.data.items[0].desc, 'alarma de flujo intermitente');
eq('el movimiento dice desde → hacia', r.data.items[1].desde + ' → ' + r.data.items[1].hacia, 'Bodega → Cama 4');

console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS: ' + fails.join(' | ') : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
