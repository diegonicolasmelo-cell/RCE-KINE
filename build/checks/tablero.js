// tablero.js — Guardia del tablero (pestaña Estadísticas): svc_stats.gs +
// svc_indicadores.gs, ago-2026, Ola 2.
//
// ── Por qué existe ─────────────────────────────────────────────────────────
// La Ola 2 iba a fusionar GET_STATS y GET_INDICADORES en un GET_TABLERO. Se
// midió y se descartó: las dos mitades salen EN PARALELO desde el front, la
// respuesta fusionada llegaría cuando llega la más lenta, y la más lenta
// (indicadores, que además baja EVOLUCIONES_ARCHIVO entero) cuesta ~7× lo que
// cuesta stats. Fusionar habría multiplicado por 7 el tiempo hasta el primer
// dato pintado para ahorrar 4 viajes que solo coinciden una vez por sesión.
//
// Lo que sí se hizo: el criterio clínico de las 48 h estaba escrito DOS VECES
// dentro de calcularIndicadores —una para el total del rango y otra para la
// tendencia mensual—. Coincidían por suerte. Bastaba que alguien corrigiera una
// definición (la ventana, qué reintubación gana) para que el tablero mostrara
// dos verdades distintas sobre el mismo mes, sin que nada fallara. Ahora se
// empareja una sola vez y de ahí salen los dos consumidores.
//
// ── Qué fija esta guardia ──────────────────────────────────────────────────
// A/B contra el código congelado en 04808a7 (lo que corría en producción antes
// de tocar nada): sobre los mismos datos sembrados, campo por campo, ningún
// número puede cambiar. Si uno cambia, esto falla y dice cuál.
// Además fija los viajes a la planilla, el contrato que consume el front 5.22
// desplegado, la privacidad de los dos payloads y la regla 1 del proyecto.
//
// ⚠️ LO QUE ESTA GUARDIA **NO** PUEDE DECIR (revisión adversarial, 6-ago-2026).
// Es A/B: prueba que un número NO CAMBIÓ, jamás que ESTÉ BIEN. Los dos lados
// comparten los errores previos, así que un indicador equivocado desde antes
// pasa en verde. No leer su ✅ como «el tablero está correcto».
//
// 🔴 Y hay uno equivocado desde antes, encontrado al auditarla — PREEXISTENTE,
// no lo introdujo la Ola 2: `calcularIndicadores` tiene DOS definiciones de
// «día con VM» en la misma función.
//   · `svc_indicadores.gs:37`  → `VENT_SOPORTE === 'VM'` (estrecho). Alimenta
//     diasVM, ventilados, vmProlongadaPct y el DENOMINADOR de autoextPor100VM.
//   · `svc_indicadores.gs:114` → `VENT_SOPORTE !== 'VM' && VENT_SOPORTE_FINAL !== 'VM'`
//     (ancho). Alimenta vmProlongada y medianaVMpreTQT.
// `VENT_SOPORTE_FINAL` es columna viva (`esquema.gs:89`), la escribe
// `svc_evoluciones.gs:764` en los eventos de vía aérea, y `svc_camas.gs:207` usa
// el criterio ancho: el raro es el estrecho. Con un paciente cuyo soporte TERMINA
// en VM, el mismo payload llega a decir «el traqueostomizado llevaba 10 días de
// VM» y «hubo 1 día-VM y ningún paciente con VM prolongada»; peor,
// **autoextPor100VM se infla ~11×** (dio 100 contra una meta de 1–2) porque el
// denominador pierde días-VM reales. Indicador centinela.
// El fixture de aquí NO tiene ni una fila con `VENT_SOPORTE_FINAL`, así que es
// estructuralmente incapaz de verlo. Arreglarlo exige decidir CUÁL criterio es
// el clínicamente correcto: es decisión de Manuel y Diego, no de quien pase.
//
// Uso: node build/checks/tablero.js
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const RAIZ = path.resolve(__dirname, '..', '..');
const V2 = path.join(RAIZ, 'v2');
// SHA congelado a propósito, no HEAD~1: la referencia de comparación tiene que
// seguir siendo la misma después de commitear esto y de los commits siguientes.
const BASE = '04808a7';

const fails = [];
const eq = (l, g, w) => {
  const okk = String(g) === String(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')'));
  if (!okk) fails.push(l);
};

/* ══ Arnés: una copia aislada del servicio, con los viajes contados ═════════ */
// Cada versión (vieja y nueva) vive en su propio ámbito y en su propio contador,
// pero ambas leen la MISMA semilla: cualquier diferencia que aparezca es del
// código, no de los datos.
function montar(fuenteInd, fuenteStats) {
  const DB = {};
  const LECT = [];
  const g = {
    repoLeerTodos: h => { LECT.push(h); return (DB[h] || []).map(r => Object.assign({}, r)); },
    // Doble de la Ola 3 (lectura por columnas): esta guardia nació antes de la
    // ola y su arnés no traía la primitiva — el A/B daba «error» en vez de
    // comparar. Mismo doble que en checks/indicadores.js.
    repoLeerColumnas: (h, campos) => { LECT.push(h); return (DB[h] || []).map(o => { if (!campos || !campos.length) return Object.assign({}, o); const r = {}; campos.forEach(c => { r[c] = (o[c] === undefined) ? '' : o[c]; }); return r; }); },
    esVerdadero: v => v === true || v === 'TRUE' || v === 'true',
    leerConfig: (k, d) => d,
    ok: d => ({ ok: true, data: d }),
    err: (m, c) => ({ ok: false, error: m, codigo: c }),
    ERR: { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO' },
    _rutNormal: rut => {
      const s = String(rut || '').toUpperCase().replace(/[^0-9K]/g, '');
      return s.length < 2 ? '' : s.slice(0, -1) + '-' + s.slice(-1);
    },
    Utilities: { formatDate: d => d.toISOString().slice(0, 10) },
  };
  const nombres = Object.keys(g);
  const cuerpo = fuenteStats + '\n;\n' + fuenteInd +
    '\n;return { obtenerStats: obtenerStats, calcularIndicadores: calcularIndicadores };';
  const api = new Function(...nombres, cuerpo)(...nombres.map(n => g[n]));
  return {
    DB, api,
    viajes: () => LECT.slice(),
    reset: () => { LECT.length = 0; },
  };
}

const leerBase = f => {
  try {
    return cp.execSync('git show ' + BASE + ':v2/' + f, { cwd: RAIZ, maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch (e) {
    // Sin el commit de referencia no hay A/B posible: mejor decirlo que dar un
    // verde que no probó nada.
    console.log('❌ No se pudo leer ' + f + ' del commit ' + BASE + '. ' +
      'Esta guardia compara contra ese commit: hace falta el repo completo (git fetch --unshallow).');
    process.exit(1);
  }
};
const FUENTE_IND = fs.readFileSync(path.join(V2, 'svc_indicadores.gs'), 'utf8');
const FUENTE_STATS = fs.readFileSync(path.join(V2, 'svc_stats.gs'), 'utf8');
const FUENTE_API = fs.readFileSync(path.join(V2, 'api.gs'), 'utf8');

const VIEJO = montar(leerBase('svc_indicadores.gs'), leerBase('svc_stats.gs'));
const NUEVO = montar(FUENTE_IND, FUENTE_STATS);

/* ══ Semilla clínica ════════════════════════════════════════════════════════ */
// Ocho episodios cubriendo lo que el tablero mide: VM y VNI, extubación con y
// sin protocolo, fracaso precoz y tardío, extubación exitosa, autoextubación,
// «sin_condiciones» (que NO es extubación), TQT sobre episodio partido entre
// EVOLUCIONES y EVOLUCIONES_ARCHIVO, decanulación, desvinculación, válvula de
// fonación, cuff, reingreso por RUT, egresos vivos y fallecido, y un paciente
// SIN PATIENT_ID (la rendija conocida: darAltaPaciente solo limpia si hay pid).
const RUT_TESTIGO = '11.222.333-4';
const NOMBRE_TESTIGO = 'Paciente Testigo Uno';

function sembrar(destino) {
  const EV = [], AR = [];
  const evo = (o, archivada) => { (archivada ? AR : EV).push(o); };
  const base = (pid, f, turno, extra) => Object.assign({
    PATIENT_ID: pid, ID_CAMA: pid.replace(/\D/g, ''), FECHA: f, TURNO: turno,
    TURNO_KEY: f + '-' + turno, PAC_NOMBRE: NOMBRE_TESTIGO,
  }, extra || {});

  // P1 · VM 5 días, PVE superada, extubación con protocolo el 05 a las 10:00.
  //      Reintubado el mismo día a las 23:00 (13 h) → fracaso PRECOZ.
  for (let d = 1; d <= 5; d++) {
    const f = '2026-07-0' + d;
    evo(base('p1', f, 'Dia', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT', VENT_CUFF_EST: 'rango',
      RESP_KTR_CANT: 2, KTM_REALIZADA: 'TRUE', KTM_CANT: '2', KTM_NIVEL_KTR: '3',
      KTM_TIEMPO_MIN: '35', PAC_DIAG_REM: 'Respiratorio', PAC_SEXO: 'M', PAC_EDAD: 64,
      ES_INGRESO: d === 1 ? 'TRUE' : '', EVAL_T_MRC: 44, CAT_RESP_PJE: 8, CAT_MOTOR_PJE: 5,
      PROC_JSON: JSON.stringify(['ASPIRACIÓN DE SECRECIONES']) }));
  }
  EV[1].PVE_VAL = 'si'; EV[1].PVE_RESULTADO = 'superada';
  EV[4].EXT_OCURRIO = 'TRUE'; EV[4].EXT_TIPO = 'protocolo'; EV[4].EXT_HORA = '10:00';
  EV[4].PVE_VAL = 'si'; EV[4].PVE_RESULTADO = 'superada';

  // P2 · Extubación FUERA de protocolo, turno Noche, sin hora registrada, el 10.
  //      Reintubado el 12 → 48 h exactas → fracaso TARDÍO.
  evo(base('p2', '2026-07-09', 'Dia', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
    VENT_CUFF_EST: 'ajuste', RESP_KTR_CANT: 3, KTM_SUSPENDIDA: 'TRUE',
    KTM_CONTRA_RAZON: 'Inestabilidad hemodinámica', PAC_DIAG_REM: 'Neurológico' }));
  evo(base('p2', '2026-07-10', 'Noche', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
    VENT_CUFF_EST: 'rango', EXT_OCURRIO: 'TRUE', EXT_TIPO: 'sin_protocolo',
    EXT_MOTIVO: 'Agitación psicomotora', RESP_KTR_CANT: 1 }));

  // P3 · Episodio partido: 6 turnos en ARCHIVO (junio) + 8 en EVOLUCIONES (julio).
  //      TQT el 08 de julio → 14 días de VM previos → VM prolongada.
  for (let d = 25; d <= 30; d++) {
    evo(base('p3', '2026-06-' + d, 'Dia', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
      VENT_CUFF_EST: 'rango', RESP_KTR_CANT: 2 }), true);
  }
  for (let d = 1; d <= 8; d++) {
    const f = '2026-07-0' + d;
    evo(base('p3', f, 'Dia', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: d >= 8 ? 'TQT' : 'TOT',
      // día 6 sin verificar (baja la adherencia) y día 7 desinflado (con válvula
      // de fonación no corresponde medir presión → sale del denominador).
      VENT_CUFF_EST: d === 7 ? 'desinflado' : (d === 6 ? '' : 'rango'), RESP_KTR_CANT: 2,
      // El día 5 va con 12 atenciones para ejercitar el tope de 9 del cálculo
      // (un dedazo en la planilla no puede inflar la carga kinésica del mes).
      KTM_REALIZADA: 'TRUE', KTM_CANT: d === 5 ? '12' : '1', KTM_IMT: d % 2 ? 'TRUE' : '',
      TQT_OCURRIO: d === 8 ? 'TRUE' : '', PAC_DIAG_REM: 'Respiratorio' }));
  }
  // Weaning de TQT: desvinculaciones con y sin reconexión, y válvula de fonación.
  evo(base('p3', '2026-07-12', 'Dia', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TQT',
    VENT_CUFF_EST: 'rango', DESVINC_OCURRIO: 'TRUE', DESVINC_HORAS: '4,5',
    DESVINC_RECONEXION: 'TRUE', VFON_USADA: 'TRUE', VFON_MIN: 30 }));
  evo(base('p3', '2026-07-13', 'Dia', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TQT',
    VENT_CUFF_EST: 'ajuste', DESVINC_OCURRIO: 'TRUE', DESVINC_HORAS: '8',
    VFON_USADA: 'TRUE', VFON_MIN: 45, DECAN_OCURRIO: 'TRUE' }));

  // P4 · VNI puro (no entra en días-VM) + extubación con protocolo SIN fracaso.
  for (let d = 14; d <= 16; d++) {
    evo(base('p4', '2026-07-' + d, 'Dia', { VENT_SOPORTE: 'VNI', VENT_VIA_AEREA: 'Natural',
      RESP_KTR_CANT: 1, KTM_NO_REALIZADA: d === 14 ? 'TRUE' : '',
      KTM_NO_RAZON: d === 14 ? 'Paciente en pabellón' : '', PAC_DIAG_REM: 'Cardiovascular',
      CAT_RESP_NIVEL: 'Media', CAT_MOTOR_NIVEL: 'Baja' }));
  }
  EV[EV.length - 1].EXT_OCURRIO = 'TRUE'; EV[EV.length - 1].EXT_TIPO = 'protocolo';
  EV[EV.length - 1].EXT_HORA = '12:00'; EV[EV.length - 1].PVE_VAL = 'si';
  EV[EV.length - 1].PVE_RESULTADO = 'frustra';

  // P5 · Autoextubación: fuera del denominador de extubaciones programadas.
  evo(base('p5', '2026-07-18', 'Noche', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
    VENT_CUFF_EST: 'rango', EXT_OCURRIO: 'TRUE', EXT_TIPO: 'autoextubacion',
    INTUB_OCURRIO: 'TRUE', TOT_CAMBIO: 'TRUE' }));

  // P6 · «sin_condiciones»: fila histórica que NO es una extubación.
  evo(base('p6', '2026-07-20', 'Dia', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
    VENT_CUFF_EST: 'rango', EXT_OCURRIO: 'TRUE', EXT_TIPO: 'sin_condiciones' }));

  // P7 · SIN PATIENT_ID: la rendija de darAltaPaciente (si no hay pid, no limpia).
  evo(base('', '2026-07-21', 'Dia', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
    VENT_CUFF_EST: 'rango', RESP_KTR_CANT: 2, COD_PACIENTE: 'PAC-HUERFANO' }));
  EV[EV.length - 1].PATIENT_ID = '';

  // P9 · Reintubado a las 60 h: JUSTO FUERA de la ventana → no es fracaso.
  //      Es el caso que hace fallar cualquier ensanche de la ventana clínica
  //      (48→72). Sin él, mover el criterio no cambiaría ningún número y esta
  //      guardia daría verde a un cambio de definición.
  evo(base('p9', '2026-07-23', 'Dia', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
    VENT_CUFF_EST: 'rango', RESP_KTR_CANT: 2, EXT_OCURRIO: 'TRUE', EXT_TIPO: 'protocolo',
    EXT_HORA: '08:00' }));

  // P10 · Reintubado a las 24 h EXACTAS: el borde entre precoz y tardío. Manda
  //       a tardío porque el corte es «< 24». Si alguien lo vuelve «≤ 24», aquí
  //       se nota.
  evo(base('p10', '2026-07-24', 'Dia', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
    VENT_CUFF_EST: 'rango', RESP_KTR_CANT: 2, EXT_OCURRIO: 'TRUE', EXT_TIPO: 'protocolo',
    EXT_HORA: '08:00' }));

  // P11 · Exactamente 7 días de VM: el corte de «VM prolongada» es «> 7», así
  //       que NO debe contar. Es el borde que hace fallar cualquier
  //       corrimiento del umbral.
  for (let d = 1; d <= 7; d++) {
    evo(base('p11', '2026-07-0' + d, 'Noche', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
      VENT_CUFF_EST: 'rango', RESP_KTR_CANT: 1, PAC_DIAG_REM: 'Sepsis' }));
  }

  // P8 · Fuera del rango del mes: agosto, para que el filtro tenga qué dejar afuera.
  evo(base('p8', '2026-08-03', 'Dia', { VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT',
    VENT_CUFF_EST: 'rango', EXT_OCURRIO: 'TRUE', EXT_TIPO: 'protocolo', EXT_HORA: '09:00' }));

  destino.EVOLUCIONES = EV;
  destino.EVOLUCIONES_ARCHIVO = AR;
  destino.REINTUBACIONES = [
    { PATIENT_ID: 'p1', FECHA: '2026-07-05', HORA_REINTUBACION: '23:00' },   // 13 h → precoz
    { PATIENT_ID: 'p1', FECHA: '2026-07-06', HORA_REINTUBACION: '22:00' },   // 36 h: gana la primera
    { PATIENT_ID: 'p2', FECHA: '2026-07-12', HORA_REINTUBACION: '' },        // 48 h → tardío
    { PATIENT_ID: 'p5', FECHA: '2026-07-19', HORA_REINTUBACION: '02:00' },   // tras autoext: no cuenta
    { PATIENT_ID: 'p9', FECHA: '2026-07-25', HORA_REINTUBACION: '20:00' },   // 60 h → fuera de ventana
    { PATIENT_ID: 'p10', FECHA: '2026-07-25', HORA_REINTUBACION: '08:00' },  // 24 h exactas → tardío
    { PATIENT_ID: 'p8', FECHA: '2026-08-04', HORA_REINTUBACION: '09:00' },
  ];
  destino.ARCHIVO_PACIENTES = [
    { PATIENT_ID: 'p1', RUT: RUT_TESTIGO, NOMBRE: NOMBRE_TESTIGO, FECHA_EGRESO: '2026-07-07',
      MOTIVO_EGRESO: 'Traslado a sala', DESTINO_EGRESO: 'Medicina', DIAS_TOTAL: 6,
      MRC_SS_EGRESO: 44, MRC_INTERP: 'Debilidad', FSS_EGRESO: 30, CPAX_EGRESO: 40, DAUCI: 'TRUE' },
    { PATIENT_ID: 'p0', RUT: '11222333-4', FECHA_EGRESO: '2026-02-01',
      MOTIVO_EGRESO: 'Alta', DESTINO_EGRESO: 'Domicilio', DIAS_TOTAL: 3 },   // mismo RUT → reingreso
    { PATIENT_ID: 'p2', RUT: '9.876.543-3', FECHA_EGRESO: '2026-07-14',
      MOTIVO_EGRESO: 'Fallecimiento', DESTINO_EGRESO: 'Fallecido', DIAS_TOTAL: 5,
      MRC_SS_EGRESO: 30, MRC_INTERP: 'Debilidad severa', FSS_EGRESO: 20 },
    { PATIENT_ID: 'p4', RUT: '7.654.321-K', FECHA_EGRESO: '2026-07-17',
      MOTIVO_EGRESO: 'Alta', DESTINO_EGRESO: 'Domicilio', DIAS_TOTAL: 4, FSS_EGRESO: 35 },
  ];
  destino.CAMAS_ESTADO = [
    { ID_CAMA: '3', OCUPADA: 'TRUE', PATIENT_ID: 'p3', RUT: '5.555.555-5', NOMBRE: NOMBRE_TESTIGO },
    { ID_CAMA: '6', OCUPADA: 'TRUE', PATIENT_ID: 'p6', RUT: RUT_TESTIGO, NOMBRE: NOMBRE_TESTIGO },
    { ID_CAMA: '9', OCUPADA: '', PATIENT_ID: '', RUT: '' },
  ];
  destino.INDICADORES_HISTORICO = [
    { MES: '2026-05', FUENTE: 'planilla', EXTUBACIONES: 20, REINTUB_48H: 4 },
    { MES: '2026-06', FUENTE: 'planilla', EXTUBACIONES: 0, REINTUB_48H: 0 },
  ];
}
sembrar(VIEJO.DB);
sembrar(NUEVO.DB);

/* ══ Comparación campo por campo ════════════════════════════════════════════ */
// No basta con JSON.stringify: si algo cambia, hay que poder decir QUÉ campo.
function diferencias(a, b, ruta, salida) {
  ruta = ruta || ''; salida = salida || [];
  if (a === b) return salida;
  const ta = Object.prototype.toString.call(a), tb = Object.prototype.toString.call(b);
  if (ta !== tb) { salida.push(ruta + ': ' + ta + ' vs ' + tb); return salida; }
  if (ta === '[object Object]' || ta === '[object Array]') {
    const claves = Object.keys(a).concat(Object.keys(b))
      .filter((k, i, arr) => arr.indexOf(k) === i).sort();
    claves.forEach(k => {
      if (!(k in a)) { salida.push(ruta + '.' + k + ': falta en el viejo'); return; }
      if (!(k in b)) { salida.push(ruta + '.' + k + ': falta en el nuevo'); return; }
      diferencias(a[k], b[k], ruta + (ta === '[object Array]' ? '[' + k + ']' : '.' + k), salida);
    });
    return salida;
  }
  if (a !== b) salida.push(ruta + ': ' + JSON.stringify(a) + ' → ' + JSON.stringify(b));
  return salida;
}

/* ══ 1 · A/B: ningún número cambia ══════════════════════════════════════════ */
console.log('\n1 · Mismos datos, mismos números que ' + BASE);
// Los rangos incluyen los que pide el front 5.22 al abrir la pestaña: stats con
// el MES y, en paralelo, indicadores con el AÑO. No es el mismo rango: cualquier
// cambio tiene que ser inocuo para los dos por separado.
const RANGOS = [
  ['mes en curso (lo que pide GET_STATS)', '2026-07-01', '2026-07-31'],
  ['año en curso (lo que pide GET_INDICADORES)', '2026-01-01', '2026-12-31'],
  ['12 meses hacia atrás', '2025-08-01', '2026-07-31'],
  ['un solo día con extubación y reintubación', '2026-07-05', '2026-07-05'],
  ['rango que parte el episodio de P3 al medio', '2026-07-06', '2026-07-20'],
  ['rango sin ningún dato', '2024-01-01', '2024-01-31'],
  ['rango invertido (stats lo da vuelta, indicadores lo rechaza)', '2026-07-31', '2026-07-01'],
  ['fechas vacías', '', ''],
  ['fecha con basura', 'ayer', '2026-07-31'],
];
// 🔴 28-ago-2026 · `obtenerStats` CAMBIÓ DE UNIVERSO A PROPÓSITO: ahora lee
// también EVOLUCIONES_ARCHIVO. Comparar los dos lados con el archivo poblado
// diría «42 campos cambiaron» y no probaría nada — el A/B se volvería un
// semáforo que hay que apagar. La propiedad que lo reemplaza es más fina y sigue
// midiendo lo mismo que antes: CON EL ARCHIVO VACÍO, ningún número puede
// moverse. Eso demuestra que no se tocó ninguna fórmula, solo el universo. Lo
// que el archivo aporta se verifica aparte, en 1a.
const ARCH = { viejo: VIEJO.DB.EVOLUCIONES_ARCHIVO, nuevo: NUEVO.DB.EVOLUCIONES_ARCHIVO };
let difs = 0;
RANGOS.forEach(([etiqueta, d, h]) => {
  ['obtenerStats', 'calcularIndicadores'].forEach(fn => {
    const soloVivos = fn === 'obtenerStats';
    if (soloVivos) { VIEJO.DB.EVOLUCIONES_ARCHIVO = []; NUEVO.DB.EVOLUCIONES_ARCHIVO = []; }
    const a = VIEJO.api[fn](d, h);
    const b = NUEVO.api[fn](d, h);
    if (soloVivos) { VIEJO.DB.EVOLUCIONES_ARCHIVO = ARCH.viejo; NUEVO.DB.EVOLUCIONES_ARCHIVO = ARCH.nuevo; }
    // Campos AGREGADOS al payload el 28-ago-2026 (subregistro de «otros»). Se
    // listan uno por uno: una adición no declarada sigue haciendo caer el A/B,
    // que es lo que impide que esta excepción se convierta en un colador.
    const NUEVOS = ['obtenerStats.data.ktm.motivosContra', 'obtenerStats.data.ktm.motivosNoReal',
                    'obtenerStats.data.ktm.otros', 'obtenerStats.data.ktm.sinFundamento',
                    'obtenerStats.data.ktm.sinMotivo',
                    // 28-ago-2026 · el porqué de la PVE no realizada, que estaba
                    // guardado en la planilla desde jul-2026 y la pestaña no
                    // miraba. Es un bloque nuevo y aditivo: ningún campo de los
                    // que ya existían se mueve (por eso sigue habiendo A/B).
                    'obtenerStats.data.pve'];
    const ds = diferencias(a, b, fn)
      .filter(x => !NUEVOS.some(n => x === n + ': falta en el viejo'));
    if (ds.length) { difs += ds.length; ds.slice(0, 8).forEach(x => console.log('   ⚠ ' + x)); }
    eq(fn + ' · ' + etiqueta + (soloVivos ? ' [mismos vivos]' : ''),
      ds.length ? ds.length + ' campos distintos' : 'idéntico', 'idéntico');
  });
});

/* ══ 1a · Y lo que el archivo SÍ aporta ═════════════════════════════════════ */
// El lado simétrico del cambio de universo: no basta con que nada se rompa, el
// egresado tiene que APARECER. Si alguien revierte la lectura del archivo, el
// A/B de arriba seguiría verde (compara sin archivo) y esto se pondría rojo.
console.log('\n1a · El mes cuenta también a los egresados');
// 🪤 La semilla compartida NO tiene ni una fila en EVOLUCIONES_ARCHIVO (nunca se
// llamó a `evo(o, true)`), así que esta guardia jamás habría visto el problema:
// medía un archivo vacío contra otro archivo vacío. El egresado se siembra aquí
// y se retira, para no mover los controles positivos de 1b ni los de
// `calcularIndicadores`, que también lee el archivo.
const EGRESADO = [
  { PATIENT_ID: 'pEgr', ID_CAMA: '17', FECHA: '2026-07-14', TURNO: 'Dia',
    TURNO_KEY: '2026-07-14-Dia', PAC_DIAG_REM: 'Sepsis', RESP_KTR_CANT: 2,
    KTM_NO_REALIZADA: 'TRUE', KTM_NO_RAZON: 'Otro', KTM_NO_COMENTARIO: 'En pabellón todo el turno' },
];
const sinArchivo = NUEVO.api.obtenerStats('2026-07-01', '2026-07-31').data;   // archivo vacío
NUEVO.DB.EVOLUCIONES_ARCHIVO = EGRESADO;
const conArchivo = NUEVO.api.obtenerStats('2026-07-01', '2026-07-31').data;
const viejoConArchivo = VIEJO.api.obtenerStats('2026-07-01', '2026-07-31').data;
NUEVO.DB.EVOLUCIONES_ARCHIVO = ARCH.nuevo;                                    // se retira
eq('el archivo aporta evoluciones al mes', conArchivo.evos.total, sinArchivo.evos.total + 1);
eq('y su paciente al mes', conArchivo.pacientes.atendidos, sinArchivo.pacientes.atendidos + 1);
eq('y su KTM no realizada', conArchivo.ktm.noRealizada, sinArchivo.ktm.noRealizada + 1);
eq('y su fundamento llega al subregistro',
  (conArchivo.ktm.otros.find(x => x.fundamento === 'En pabellón todo el turno') || {}).n, 1);
eq('el código congelado lo perdía entero', viejoConArchivo.evos.total, sinArchivo.evos.total);

// Y que la semilla de verdad ejercita el cálculo (si todo diera 0, «idéntico»
// no probaría nada). Números calculados a mano sobre la semilla de arriba.
console.log('\n1b · Control positivo: la semilla produce cifras vivas');
const IND = NUEVO.api.calcularIndicadores('2026-07-01', '2026-07-31').data;
const STA = NUEVO.api.obtenerStats('2026-07-01', '2026-07-31').data;
eq('extubaciones programadas (P1, P2, P4, P9, P10; autoext y sin_condiciones fuera)', IND.extubaciones, 5);
eq('fracaso precoz <24 h (P1 a las 13 h)', IND.fracasoPrecoz, 1);
eq('fracaso tardío 24-48 h (P2 a las 48 h sin hora + P10 a las 24 exactas)', IND.fracasoTardio, 2);
eq('P9 volvió a las 60 h: fuera de la ventana, no es fracaso', IND.fracaso, 3);
eq('P4 se extubó y no volvió: el fracaso no es total', IND.fracasoPct, 60);
eq('autoextubaciones (P5)', IND.autoextubaciones, 1);
eq('«sin_condiciones» de P6 no cuenta como extubación', IND.extubaciones + IND.autoextubaciones, 6);
eq('fuera de protocolo (P2)', IND.fueraProtocolo, 1);
eq('…es el 20% de las programadas', IND.fueraPct, 20);
eq('…registrado en turno noche', IND.motivosFuera['Agitación psicomotora'].noche, 1);
eq('VM prolongada: solo P3 (14 días); P11 con 7 exactos NO cuenta (corte > 7)', IND.vmProlongada, 1);
eq('desvinculaciones de TQT (P3, dos ventanas)', IND.desvinculaciones, 2);
eq('…una terminó en reconexión', IND.desvincReconexiones, 1);
eq('…12,5 h fuera del ventilador', IND.desvincHorasTotal, 12.5);
eq('cuff: denominador = turnos con vía aérea artificial, sin los desinflados', IND.cuffTurnos, 28);
eq('cuff: numerador = en rango + ajustados (el turno sin verificar no suma)', IND.cuffVerificados, 27);
eq('cuff: adherencia 27/28, no el 100% que no probaría nada', IND.cuffAdherenciaPct, 96);
eq('reingreso por RUT (mismo RUT en dos formatos)', IND.reingresos, 1);
eq('egresos del mes', IND.egresos, 3);
eq('un fallecido de tres egresos', IND.fallecidos, 1);
eq('atenciones: el turno con KTM_CANT=12 se topa en 9', IND.atenciones, 72);
eq('la tendencia trae el histórico sembrado y el mes RCE', IND.tendencia.length >= 3, true);
eq('stats: turnos del mes', STA.evos.total > 20, true);
eq('stats: ventilados del mes', STA.pacientes.ventilados >= 4, true);
eq('stats: egresos del mes', STA.egresos.total, 3);

/* ══ 2 · El criterio de las 48 h existe UNA sola vez ════════════════════════ */
console.log('\n2 · Un solo emparejamiento ≤48 h en el archivo');
// Este es el cambio de la Ola 2. Si vuelve a haber dos, el tablero puede
// terminar diciendo dos verdades distintas sobre el mismo mes sin fallar nada.
const pasadasExt = (FUENTE_IND.match(/extProg\.forEach/g) || []).length;
const ventanas48 = (FUENTE_IND.match(/<=\s*48/g) || []).length;
eq('pasadas sobre extProg', pasadasExt, 1);
eq('sitios que aplican la ventana de 48 h', ventanas48, 1);
// Control positivo: la versión congelada sí tenía dos (si no, la prueba de
// arriba pasaría por estar contando mal).
const IND_VIEJO = leerBase('svc_indicadores.gs');
eq('control: en ' + BASE + ' había 3 pasadas', (IND_VIEJO.match(/extProg\.forEach/g) || []).length, 3);
eq('control: y 2 ventanas de 48 h', (IND_VIEJO.match(/<=\s*48/g) || []).length, 2);

/* ══ 3 · Viajes a la planilla ═══════════════════════════════════════════════ */
console.log('\n3 · Cada hoja se baja UNA vez por petición');
const cuenta = viajes => viajes.reduce((m, h) => (m[h] = (m[h] || 0) + 1, m), {});
// Texto estable para poder comparar dos repartos con eq() (que compara cadenas).
const reparto = viajes => { const m = cuenta(viajes); return Object.keys(m).sort().map(h => h + '×' + m[h]).join(' '); };
NUEVO.reset(); NUEVO.api.calcularIndicadores('2026-01-01', '2026-12-31');
const vInd = cuenta(NUEVO.viajes());
eq('indicadores: total de lecturas', NUEVO.viajes().length, 6);
eq('indicadores: hojas repetidas', Object.keys(vInd).filter(h => vInd[h] > 1).join(',') || 'ninguna', 'ninguna');
eq('indicadores: baja EVOLUCIONES + su archivo', (vInd.EVOLUCIONES || 0) + (vInd.EVOLUCIONES_ARCHIVO || 0), 2);

NUEVO.reset(); NUEVO.api.obtenerStats('2026-07-01', '2026-07-31');
const vSta = cuenta(NUEVO.viajes());
eq('stats: total de lecturas', NUEVO.viajes().length, 5);
eq('stats: hojas repetidas', Object.keys(vSta).filter(h => vSta[h] > 1).join(',') || 'ninguna', 'ninguna');
// 🔴 CAMBIÓ EL 28-ago-2026. Hasta entonces esto fijaba lo contrario —«stats NO
// baja el archivo (es la mitad barata)»— y esa era su ventaja: pintaba primero.
// Se aceptó el viaje extra porque sin el archivo la pestaña MIENTE en el corte
// mensual: el paciente que egresaba desaparecía del mes en que se atendió,
// mientras sus egresos sí se contaban desde ARCHIVO_PACIENTES — numerador y
// denominador de universos distintos. Decisión de Manuel: primero que el número
// sea verdadero. Stats sigue SIN fusionarse con indicadores (eso multiplicaba
// por 7 el tiempo hasta el primer dato), así que el pintado en dos mitades se
// mantiene; lo que se paga es un viaje más en la mitad rápida.
eq('stats baja EVOLUCIONES y su archivo', (vSta.EVOLUCIONES || 0) + (vSta.EVOLUCIONES_ARCHIVO || 0), 2);
VIEJO.reset(); VIEJO.api.calcularIndicadores('2026-01-01', '2026-12-31');
NUEVO.reset(); NUEVO.api.calcularIndicadores('2026-01-01', '2026-12-31');
eq('el cambio no agregó ni quitó viajes respecto de ' + BASE,
  reparto(NUEVO.viajes()), reparto(VIEJO.viajes()));

/* ══ 4 · El contrato que consume el front 5.22 desplegado ═══════════════════ */
console.log('\n4 · GET_STATS y GET_INDICADORES siguen intactos para el 5.22');
// En producción corre el front 5.22 (el repo va en 5.43). Ese front llama a los
// dos endpoints por separado y lee estos campos. Cualquiera que falte es una
// tarjeta en blanco en el tablero del hospital, sin error visible.
eq('api.gs enruta GET_STATS igual que siempre',
  /case 'GET_STATS':\s*return obtenerStats\(datos\.desde, datos\.hasta\);/.test(FUENTE_API), true);
eq('api.gs enruta GET_INDICADORES igual que siempre',
  /case 'GET_INDICADORES':\s*return calcularIndicadores\(datos\.desde, datos\.hasta\);/.test(FUENTE_API), true);
eq('obtenerStats sigue recibiendo 2 argumentos', NUEVO.api.obtenerStats.length, 2);
eq('calcularIndicadores sigue recibiendo 2 argumentos', NUEVO.api.calcularIndicadores.length, 2);

// Lista extraída del index 5.22 REAL desplegado (commit 92c9f60), no del repo.
const CAMPOS_IND_522 = ['atenciones', 'atencionesPorPacDia', 'autoextPor100VM', 'autoextubaciones',
  'cuffAdherenciaPct', 'cuffAjustes', 'cuffTurnos', 'cuffVerificados', 'desde', 'diasRango', 'diasVM',
  'egresos', 'extubaciones', 'fallecidos', 'fracaso', 'fracasoPct', 'fracasoPrecoz', 'fracasoTardio',
  'fueraPct', 'fueraProtocolo', 'hasta', 'medianaVMpreTQT', 'mortalidadPct', 'motivosFuera',
  'ocupacionProm', 'pacienteDias', 'personasConRut', 'pve', 'pvePor100PacDia', 'reingresos',
  'tendencia', 'tqt', 'ventilados', 'vmProlongada', 'vmProlongadaPct'];
const CAMPOS_STATS_522 = ['catMotor', 'catResp', 'dauciActual', 'egresos', 'eventos', 'evos',
  'ktm', 'pacientes', 'procs', 'rem', 'vm'];
eq('los 35 campos que lee el 5.22 de indicadores siguen ahí',
  CAMPOS_IND_522.filter(c => !(c in IND)).join(',') || 'todos', 'todos');
eq('los 11 campos que lee el 5.22 de stats siguen ahí',
  CAMPOS_STATS_522.filter(c => !(c in STA)).join(',') || 'todos', 'todos');

// La Ola 2 midió la fusión y la descartó (ver cabecera). Si alguien la vuelve a
// intentar, que sea a conciencia: hay que actualizar esta guardia y demostrar
// que el tablero no pierde el pintado progresivo de la mitad barata.
eq('no se coló un GET_TABLERO sin revisar la decisión de la Ola 2',
  FUENTE_API.indexOf('GET_TABLERO') === -1, true);

/* ══ 5 · Privacidad (Ley 19.628) ════════════════════════════════════════════ */
console.log('\n5 · Ni RUT ni nombre salen del servidor');
// Los dos cálculos leen ARCHIVO_PACIENTES y CAMAS_ESTADO, que SÍ traen RUT y
// nombre: el tablero los usa para contar reingresos, nunca para mostrarlos.
const sIND = JSON.stringify(IND), sSTA = JSON.stringify(STA);
eq('indicadores no filtra el RUT', sIND.indexOf('11222333') === -1 && sIND.indexOf('11.222.333') === -1, true);
eq('indicadores no filtra el nombre', sIND.indexOf(NOMBRE_TESTIGO) === -1, true);
eq('stats no filtra el RUT', sSTA.indexOf('11222333') === -1 && sSTA.indexOf('11.222.333') === -1, true);
eq('stats no filtra el nombre', sSTA.indexOf(NOMBRE_TESTIGO) === -1, true);
eq('…y aun así contó el reingreso por RUT', IND.reingresos, 1);

/* ══ 6 · Regla 1: nada sobrevive a la petición ══════════════════════════════ */
console.log('\n6 · Los datos clínicos no se cachean entre peticiones');
const antesInd = NUEVO.api.calcularIndicadores('2026-07-01', '2026-07-31').data.atenciones;
const antesSta = NUEVO.api.obtenerStats('2026-07-01', '2026-07-31').data.evos.total;
// Otro kinesiólogo guarda un turno mientras el tablero está abierto.
NUEVO.DB.EVOLUCIONES.push({ PATIENT_ID: 'p9', ID_CAMA: '9', FECHA: '2026-07-22', TURNO: 'Dia',
  TURNO_KEY: '2026-07-22-Dia', VENT_SOPORTE: 'VM', VENT_VIA_AEREA: 'TOT', VENT_CUFF_EST: 'rango',
  RESP_KTR_CANT: 5 });
eq('la petición siguiente ve las atenciones nuevas',
  NUEVO.api.calcularIndicadores('2026-07-01', '2026-07-31').data.atenciones, antesInd + 5);
eq('…y stats ve el turno nuevo',
  NUEVO.api.obtenerStats('2026-07-01', '2026-07-31').data.evos.total, antesSta + 1);
NUEVO.DB.EVOLUCIONES.pop();

console.log('');
if (difs) console.log('⚠ ' + difs + ' campos cambiaron respecto de ' + BASE);
if (fails.length) { console.log('❌ FALLARON ' + fails.length + ':\n  - ' + fails.join('\n  - ')); process.exit(1); }
console.log('✅ TODO OK');
