// entrega_no_ajena.js — La ficha de la entrega de turno es del paciente que
// está en la cama, no del que estuvo.
//
// POR QUÉ EXISTE. El resto de la tanda cerró la ESCRITURA: que lo anotado para
// un paciente no aterrice en la ficha de otro. Esto cierra la LECTURA, que
// estaba abierta por dos sitios distintos de `svc_entrega.gs`:
//
//   · `evoTurnoPorCama` comparaba SOLO el TURNO_KEY. El filtro por paciente que
//     está dos líneas más abajo alimenta `episodioPorCama`, que es otra cosa —
//     es fácil leer el archivo y creer que la ficha ya filtraba. No filtraba.
//   · `cultivoPorCama` buscaba el último cultivo por ID_CAMA y por el nombre del
//     procedimiento, sin mirar de quién era.
//
// Consecuencia: en una cama que rotó, quien RECIBE el turno lee la sedación, el
// modo ventilatorio, la firma y el último aspirado traqueal del paciente
// anterior como si fueran del que tiene delante. Un cultivo ajeno en la ficha
// puede cambiar una decisión de antibióticos.
//
// 🪤 EL FIXTURE ES DECLARADO y reproduce la ruta conocida por la que quedan
// filas de un episodio terminado en la hoja VIVA: la cama limpiada a mano, que
// a propósito no archiva. La fila del paciente anterior va DESPUÉS en el
// arreglo, que es el orden en que el bug se manifiesta (la última pisa a la
// primera).
//
// Uso: node build/checks/entrega_no_ajena.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

const DB = {
  CAMAS_ESTADO: [
    { ID_CAMA: '5', OCUPADA: 'TRUE', PATIENT_ID: 'pNUEVO', NOMBRE: 'Ocupante De Ahora',
      EDAD: 40, SEXO: 'M', DIAGNOSTICO: 'NAC', FECHA_INGRESO: '2026-08-06',
      VIA_AEREA: 'TOT', SOPORTE: 'VM' },
    // Cama de control: nunca rotó. Nada de lo que hace esta guardia debe moverla.
    { ID_CAMA: '7', OCUPADA: 'TRUE', PATIENT_ID: 'pSOLO', NOMBRE: 'Paciente Estable',
      EDAD: 55, SEXO: 'F', DIAGNOSTICO: 'EPOC', FECHA_INGRESO: '2026-08-01',
      VIA_AEREA: 'TOT', SOPORTE: 'VM' },
  ],
  EVOLUCIONES: [
    { ID_CAMA: '5', PATIENT_ID: 'pNUEVO', TURNO_KEY: '2026-08-06-Noche', FECHA: '2026-08-06',
      SED_TIPO: 'Sin sedación', VENT_MODO: 'PSV', PLAN_FIRMA_KINE: 'Klgo. Del Nuevo' },
    // ↓ el episodio anterior, que quedó vivo por una limpieza manual de cama
    { ID_CAMA: '5', PATIENT_ID: 'pVIEJO', TURNO_KEY: '2026-08-06-Noche', FECHA: '2026-08-06',
      SED_TIPO: 'Escalón 3', VENT_MODO: 'ACVC', PLAN_FIRMA_KINE: 'Klgo. Del Viejo' },
    { ID_CAMA: '7', PATIENT_ID: 'pSOLO', TURNO_KEY: '2026-08-06-Noche', FECHA: '2026-08-06',
      SED_TIPO: 'Escalón 2', VENT_MODO: 'ACVC', PLAN_FIRMA_KINE: 'Klga. Estable' },
  ],
  PROCEDIMIENTOS: [
    { ID_CAMA: '5', PATIENT_ID: 'pVIEJO', NOMBRE_PROC: 'CULTIVO ASPIRADO TRAQUEAL', FECHA: '2026-08-05' },
    { ID_CAMA: '7', PATIENT_ID: 'pSOLO', NOMBRE_PROC: 'CULTIVO ASPIRADO TRAQUEAL', FECHA: '2026-08-05' },
  ],
};

global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoLeerFiltrado = (h, col, pred) => (DB[h] || []).filter(r => pred(r[col]));
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.hoyISO = () => '2026-08-06';
global.ahoraTS = () => '2026-08-06 23:00:00';
global._tz = () => 'America/Santiago';
global.Utilities = { formatDate: () => '2026-08-06' };
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global._statISO = f => String(f || '').slice(0, 10);
eval(['infra_fechas.gs', 'svc_eventos.gs', 'svc_stats.gs', 'svc_entrega.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

const r = obtenerEntregaTurno(['5', '7'], '2026-08-06', 'Noche');
si('la entrega responde ok', r.ok);
const F = {};
((r.data || {}).fichas || []).forEach(f => { F[String(f.idCama)] = f; });
const f5 = F['5'] || {}, f7 = F['7'] || {};

/* ══ 1 · La cama que rotó ═════════════════════════════════════════════════ */
console.log('1 · La ficha de una cama que rotó no habla por el paciente anterior');
eq('🎯 el modo ventilatorio es el del ocupante', f5.modo, 'PSV');
eq('🎯 la sedación es la del ocupante', f5.sedTipo, 'Sin sedación');
eq('la firma es la de quien lo evolucionó a él', f5.firma, 'Klgo. Del Nuevo');
si('y no aparece nada firmado por el turno del paciente anterior',
  !/Del Viejo/.test(JSON.stringify(f5)));

console.log('\n2 · Y el último cultivo tampoco se hereda de la cama');
si('🎯 no se le atribuye el cultivo del paciente anterior',
  !f5.ultimoCultivo || !/ASPIRADO/.test(JSON.stringify(f5.ultimoCultivo)));

/* ══ 3 · NO REGRESIÓN ═════════════════════════════════════════════════════ */
console.log('\n3 · La cama que NO rotó sigue mostrando todo lo suyo');
eq('su modo sigue estando', f7.modo, 'ACVC');
eq('su sedación sigue estando', f7.sedTipo, 'Escalón 2');
eq('su firma sigue estando', f7.firma, 'Klga. Estable');
si('y su propio cultivo NO se pierde por el filtro nuevo',
  !!f7.ultimoCultivo && /ASPIRADO/.test(JSON.stringify(f7.ultimoCultivo)));
si('la ficha de esa cama sigue marcada con evolución del turno', f7.tieneEvo);

console.log('\n' + (fails.length ? '❌ FALLARON ' + fails.length + ': ' + fails.join(' · ')
  : '✅ entrega_no_ajena: la ficha es de quien está en la cama'));
process.exit(fails.length ? 1 : 0);
