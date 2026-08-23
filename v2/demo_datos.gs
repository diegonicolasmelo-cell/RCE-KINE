/**
 * demo_datos.gs — MAQUETA: pacientes ficticios para DEMOSTRAR el sistema.
 *
 * Puebla una planilla DEMO con un mes de UPC inventado —ingresos, turnos día y
 * noche, ventilación, weaning, extubaciones, reintubaciones, traqueostomías,
 * rehabilitación y egresos— para poder mostrar el registro y el REM 28 que
 * sale solo, sin exponer ni un dato de un paciente real.
 *
 * ── DOS CANDADOS, porque este archivo BORRA datos ──────────────────────────
 *  1. `prepararPlanillaDemo()` marca la planilla como demo (CONFIG.MODO_DEMO)
 *     y **se niega si la base tiene alguna evolución escrita**. O sea: una
 *     planilla con pacientes NO se puede convertir en demo.
 *  2. `sembrarDemoRCE()` y `limpiarDemoRCE()` **exigen esa marca**. En la
 *     planilla de producción no hacen nada: lanzan y se detienen.
 *  Correr cualquiera de las dos en producción es, por diseño, un error ruidoso
 *  y sin efecto — no un desastre silencioso.
 *
 * ── Los datos son inventados y verificables como tales ────────────────────
 *  · RUT en el rango 77.xxx.xxx (personas jurídicas): NO puede ser el RUT de
 *    una persona. El dígito verificador es correcto para que la interfaz lo
 *    acepte, pero el número no identifica a nadie.
 *  · COD_PACIENTE con prefijo `DEMO-`.
 *  · Generador DETERMINISTA (semilla fija): la misma semilla produce el mismo
 *    mes, así que las cifras del REM se pueden anunciar antes de mostrarlas y
 *    la demo se puede repetir igual delante de otra audiencia.
 *
 * Uso, en el editor de Apps Script de la planilla DEMO:
 *    crearORepararEstructura()   → crea las 23 hojas y las 18 camas
 *    prepararPlanillaDemo()      → marca la planilla como demo
 *    sembrarDemoRCE()            → siembra el mes anterior + el mes en curso
 *    generarREM(2026, 8)         → el REM 28 del mes, lleno solo
 */

// ── Vocabulario ficticio ───────────────────────────────────────────────────
const _DEMO_NOMBRES_H = ['Aníbal', 'Baltazar', 'Ceferino', 'Domingo', 'Eleuterio', 'Fulgencio',
  'Gaspar', 'Hipólito', 'Isidoro', 'Jacinto', 'Leandro', 'Melquiades', 'Norberto', 'Onofre',
  'Pancracio', 'Quintín', 'Rosendo', 'Saturnino', 'Teodosio', 'Ulpiano'];
const _DEMO_NOMBRES_M = ['Amaranta', 'Bernarda', 'Casilda', 'Domitila', 'Eufrasia', 'Felipa',
  'Genoveva', 'Herminia', 'Ilduara', 'Jacinta', 'Leocadia', 'Macarena', 'Nicolasa', 'Obdulia',
  'Petronila', 'Querubina', 'Ramona', 'Saturnina', 'Teodolinda', 'Urbana'];
const _DEMO_APELLIDOS = ['Bustamante', 'Cifuentes', 'Del Solar', 'Errázuriz', 'Fontecilla',
  'Guzmán', 'Hurtado', 'Izquierdo', 'Jaramillo', 'Krebs', 'Larraín', 'Montenegro', 'Ñanculeo',
  'Ossandón', 'Prieto', 'Quiroga', 'Riquelme', 'Subercaseaux', 'Tagle', 'Undurraga', 'Valdivieso',
  'Wachholtz', 'Yávar', 'Zañartu'];

// Perfiles clínicos: reparto de la UPC adulto. Cada uno decide la vía aérea de
// ingreso, la trayectoria de weaning y la carga kinésica.
const _DEMO_PERFILES = [
  { id: 'resp',   peso: 32, dias: [5, 14], diags: ['Enfermedades respiratorias', 'COVID-19'],       vm: true,  apache: [14, 26] },
  { id: 'neuro',  peso: 20, dias: [8, 21], diags: ['ACV', 'TEC', 'Otras neurológicas'],             vm: true,  apache: [16, 28] },
  { id: 'postop', peso: 24, dias: [2, 5],  diags: ['Otros pre y post quirúrgicos', 'Traumatológicos'], vm: true,  apache: [8, 16] },
  { id: 'vni',    peso: 14, dias: [3, 7],  diags: ['Enfermedades cardíacas', 'Enfermedades respiratorias'], vm: false, apache: [10, 20] },
  { id: 'medico', peso: 10, dias: [3, 9],  diags: ['Oncológicos', 'Genitourinarias', 'Otros'],      vm: false, apache: [12, 22] },
];

const _DEMO_FASES = ['Reanimación inicial', 'Protección pulmonar', 'Neuroprotección',
  'Weaning', 'Consolidación de weaning', 'Rehabilitación'];
const _DEMO_FIRMAS = ['MFB', 'DMV', 'CSR', 'PAL'];

// ── Azar determinista (mulberry32): misma semilla, mismo mes ──────────────
function _demoAzar(semilla) {
  let s = (semilla || 1) >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _demoEntre(rnd, a, b) { return a + Math.floor(rnd() * (b - a + 1)); }
function _demoElegir(rnd, lista) { return lista[Math.floor(rnd() * lista.length)]; }
function _demoPasa(rnd, prob) { return rnd() < prob; }

/** RUT ficticio del rango de personas jurídicas (77.xxx.xxx) con DV correcto. */
function _demoRut(n) {
  const cuerpo = 77000000 + (n * 7919) % 999999;
  let suma = 0, mul = 2;
  String(cuerpo).split('').reverse().forEach(function (d) {
    suma += parseInt(d, 10) * mul;
    mul = mul === 7 ? 2 : mul + 1;
  });
  const r = 11 - (suma % 11);
  const dv = r === 11 ? '0' : (r === 10 ? 'K' : String(r));
  return String(cuerpo) + '-' + dv;
}

function _demoISO(d) { return Utilities.formatDate(d, _tz(), 'yyyy-MM-dd'); }
function _demoFecha(iso) { return new Date(String(iso).slice(0, 10) + 'T12:00:00'); }
function _demoSumarDias(iso, n) {
  const d = _demoFecha(iso);
  d.setDate(d.getDate() + n);
  return _demoISO(d);
}

// ── Candados ───────────────────────────────────────────────────────────────

/** ¿Esta planilla está marcada como maqueta? */
function _demoEsPlanillaDemo() {
  return String(leerConfig('MODO_DEMO', '')).trim().toUpperCase() === 'TRUE';
}

function _demoExigirModoDemo(quien) {
  if (_demoEsPlanillaDemo()) return;
  throw new Error(quien + ' solo corre en una planilla MAQUETA. Esta no lo es ' +
    '(CONFIG.MODO_DEMO no es TRUE), así que no se tocó ni una fila. Si de verdad ' +
    'quieres una maqueta, hazla en una planilla NUEVA y vacía con prepararPlanillaDemo().');
}

/**
 * Marca esta planilla como maqueta. Se NIEGA si ya hay evoluciones escritas:
 * ese es el candado que hace imposible convertir la base real en un campo de
 * pruebas por equivocarse de pestaña del navegador.
 */
function prepararPlanillaDemo() {
  const vivas = repoLeerTodos('EVOLUCIONES').length;
  const archivadas = repoLeerTodos('EVOLUCIONES_ARCHIVO').length;
  if (vivas + archivadas > 0) {
    throw new Error('Esta planilla YA TIENE ' + (vivas + archivadas) + ' evoluciones. ' +
      'No se marca como maqueta: una base con registros puede ser la de la unidad. ' +
      'Crea una planilla nueva, corre crearORepararEstructura() y vuelve a intentarlo.');
  }
  escribirConfig('MODO_DEMO', 'TRUE');
  escribirConfig('AUTH_DEV_MODE', 'TRUE');   // la maqueta se muestra sin pedir cuenta
  escribirConfig('AUTH_DEV_FIRMA', 'MFB');
  return 'Planilla marcada como MAQUETA. Ahora corre sembrarDemoRCE().';
}

// ── Siembra ────────────────────────────────────────────────────────────────

/**
 * Siembra el escenario completo: el mes anterior cerrado (para mostrar su REM
 * ya listo) y el mes en curso hasta hoy (para mostrar la unidad funcionando).
 *
 * @param {Object} [opts] {ingresosPorMes, semilla, hoyISO}
 */
function sembrarDemoRCE(opts) {
  _demoExigirModoDemo('sembrarDemoRCE');
  opts = opts || {};
  const ingresosMes = opts.ingresosPorMes || 22;
  const rnd = _demoAzar(opts.semilla || 42);   // 42: mes cerrado con los cuatro eventos de vía aérea
  const hoy = String(opts.hoyISO || hoyISO()).slice(0, 10);

  _demoVaciarDatos();

  // Ventana: del día 1 del mes anterior hasta hoy.
  const d = _demoFecha(hoy);
  const inicioMesActual = _demoISO(new Date(d.getFullYear(), d.getMonth(), 1, 12));
  const inicioVentana = _demoISO(new Date(d.getFullYear(), d.getMonth() - 1, 1, 12));
  const diasMesAnterior = Math.round(
    (_demoFecha(inicioMesActual) - _demoFecha(inicioVentana)) / 86400000);
  const diasMesActual = Math.round((_demoFecha(hoy) - _demoFecha(inicioMesActual)) / 86400000) + 1;

  // Cuántos ingresos por mes (el mes en curso, a prorrata de los días corridos).
  const nAnterior = ingresosMes;
  const nActual = Math.max(4, Math.round(ingresosMes * diasMesActual / 30));

  const numCamas = parseInt(leerConfig('NUM_CAMAS', '18'), 10) || 18;
  const enCamaHoy = opts.enCamaHoy === undefined
    ? Math.round(numCamas * 0.83)     // la UPC trabaja casi llena, no a medias
    : opts.enCamaHoy;

  const episodios = [];
  let seq = 0;
  for (let i = 0; i < nAnterior; i++) {
    episodios.push(_demoEpisodio(rnd, ++seq, inicioVentana, diasMesAnterior, hoy));
  }
  for (let j = 0; j < nActual; j++) {
    episodios.push(_demoEpisodio(rnd, ++seq, inicioMesActual, diasMesActual, hoy));
  }
  for (let k = 0; k < enCamaHoy; k++) {
    episodios.push(_demoEpisodio(rnd, ++seq, inicioMesActual, diasMesActual, hoy, true));
  }

  const abiertos = episodios.filter(function (e) { return !e.egreso; });
  const cerrados = episodios.filter(function (e) { return e.egreso; });
  abiertos.slice(numCamas).forEach(function (e) {   // si sobran, se les da el alta ayer
    e.egreso = { fecha: e.evoluciones[e.evoluciones.length - 1].FECHA, motivo: 'Alta', destino: 'Sala médica' };
  });
  const vivos = abiertos.slice(0, numCamas);
  const archivados = cerrados.concat(abiertos.slice(numCamas));

  // Repartir camas entre los vivos (las libres quedan libres, como en la unidad).
  const camasLibres = [];
  for (let c = 1; c <= numCamas; c++) camasLibres.push(String(c));
  vivos.forEach(function (e, idx) { e.idCama = camasLibres[idx]; });
  archivados.forEach(function (e, idx) { e.idCama = camasLibres[(idx * 5 + 3) % numCamas]; });

  // Escribir
  const evosVivas = [], evosArchivo = [], fichas = [], reintubaciones = [];
  episodios.forEach(function (e) {
    const destino = e.egreso ? evosArchivo : evosVivas;
    e.evoluciones.forEach(function (evo) {
      evo.ID_CAMA = e.idCama;
      destino.push(_demoEvolucionFila(evo));
    });
    e.reintubaciones.forEach(function (r) {
      r.ID_CAMA = e.idCama;
      reintubaciones.push(r);
    });
    if (e.egreso) fichas.push(_demoFichaArchivo(e));
  });

  _demoInsertarLotes('EVOLUCIONES', evosVivas);
  _demoInsertarLotes('EVOLUCIONES_ARCHIVO', evosArchivo);
  _demoInsertarLotes('ARCHIVO_PACIENTES', fichas);
  _demoInsertarLotes('REINTUBACIONES', reintubaciones);
  vivos.forEach(function (e) { _demoOcuparCama(e); });

  const resumen = 'Maqueta sembrada: ' + episodios.length + ' episodios ficticios (' +
    vivos.length + ' en cama, ' + archivados.length + ' egresados) · ' +
    (evosVivas.length + evosArchivo.length) + ' evoluciones · ' +
    reintubaciones.length + ' reintubaciones. Ahora corre generarREM(año, mes).';
  Logger.log(resumen);
  return resumen;
}

/** Deja la maqueta sin pacientes (no toca CONFIG ni catálogos). */
function limpiarDemoRCE() {
  _demoExigirModoDemo('limpiarDemoRCE');
  _demoVaciarDatos();
  return 'Maqueta vacía. Corre sembrarDemoRCE() para volver a llenarla.';
}

function _demoVaciarDatos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ['EVOLUCIONES', 'EVOLUCIONES_ARCHIVO', 'ARCHIVO_PACIENTES', 'REINTUBACIONES',
    'PROCEDIMIENTOS', 'TIMELINE', 'ENTREGAS_TURNO', 'AUDIT_LOG'].forEach(function (hoja) {
    const h = ss.getSheetByName(hoja);
    if (!h) return;
    const desde = FILA_DATOS[hoja];
    const n = h.getLastRow() - desde + 1;
    if (n > 0) h.getRange(desde, 1, n, h.getMaxColumns()).clearContent();
  });
  // Camas: vaciar el contenido de cada fila salvo el número de cama.
  const numCamas = parseInt(leerConfig('NUM_CAMAS', '18'), 10) || 18;
  for (let c = 1; c <= numCamas; c++) {
    const vacio = { OCUPADA: false, STATUS_CAMA: '', PATIENT_ID: '', COD_PACIENTE: '', NOMBRE: '',
      EDAD: '', SEXO: '', TALLA_CM: '', PESO_IDEAL_KG: '', BARTHEL: '', ECF: '', DIAGNOSTICO: '',
      DIAG_REM: '', AISLAMIENTO: false, AISL_MICRO: '', VIA_AEREA: '', TOT_NUMERO: '',
      TOT_CM_LABIO: '', TQT_TIPO: '', SOPORTE: '', MODO: '', FECHA_INGRESO: '', FECHA_INICIO_VA: '',
      FECHA_INICIO_SOPORTE: '', FASE_JSON: '', KTM_NIVEL: '', KTM_SUSP: false, FIRMA_KINE: '',
      AUTOR_EMAIL: '', TEXTO_EVO_DIA: '', TEXTO_EVO_NOCHE: '', ULTIMO_TURNO_KEY: '',
      TIMELINE_JSON: '', KTR_DIA: '', KTM_DIA: '', PROC_DIA: '', FIRMA_DIA: '', KEY_DIA: '',
      KTR_NOCHE: '', PROC_NOCHE: '', FIRMA_NOCHE: '', KEY_NOCHE: '', CHARLSON: '',
      INGRESO_TIPO: '', RUT: '', APACHE2: '', TS_INGRESO: '', WEAN_PVE_JSON: '' };
    repoActualizar('CAMAS_ESTADO', 'ID_CAMA', String(c), vacio);
  }
}

function _demoInsertarLotes(hoja, objs) {
  for (let i = 0; i < objs.length; i += 150) {
    repoInsertarVarios(hoja, objs.slice(i, i + 150));
  }
}

// ── Un episodio completo, turno a turno ────────────────────────────────────

/**
 * Simula un paciente: ingreso, trayectoria ventilatoria, rehabilitación y
 * egreso. Devuelve {evoluciones[], reintubaciones[], egreso|null, ...}.
 */
function _demoEpisodio(rnd, n, inicioVentana, diasVentana, hoy, forzarEnCama) {
  // Perfil por peso
  const total = _DEMO_PERFILES.reduce(function (s, p) { return s + p.peso; }, 0);
  let tirada = rnd() * total, perfil = _DEMO_PERFILES[0];
  for (let i = 0; i < _DEMO_PERFILES.length; i++) {
    tirada -= _DEMO_PERFILES[i].peso;
    if (tirada <= 0) { perfil = _DEMO_PERFILES[i]; break; }
  }

  const sexo = _demoPasa(rnd, 0.56) ? 'M' : 'F';
  const nombre = _demoElegir(rnd, sexo === 'M' ? _DEMO_NOMBRES_H : _DEMO_NOMBRES_M) + ' ' +
    _demoElegir(rnd, _DEMO_APELLIDOS) + ' ' + _demoElegir(rnd, _DEMO_APELLIDOS);
  const edad = _demoEntre(rnd, 19, 89);
  const diag = _demoElegir(rnd, perfil.diags);
  const pid = 'DEMOPID-' + ('000' + n).slice(-3) + '-' + Utilities.getUuid().slice(0, 8);
  const cod = 'DEMO-' + ('000' + n).slice(-3);
  let estadia = _demoEntre(rnd, perfil.dias[0], perfil.dias[1]);
  let fechaIngreso;
  if (forzarEnCama) {
    // Paciente que HOY está en la unidad: ingresó hace menos días que lo que
    // durará su estadía. Sin esto la maqueta se muestra medio vacía, que es
    // justo lo que una UPC no es.
    const llevaDias = _demoEntre(rnd, 0, Math.max(0, estadia - 2));
    fechaIngreso = _demoSumarDias(hoy, -llevaDias);
    estadia = llevaDias + _demoEntre(rnd, 2, 8);
  } else {
    fechaIngreso = _demoSumarDias(inicioVentana, _demoEntre(rnd, 0, Math.max(0, diasVentana - 2)));
  }

  const ep = {
    pid: pid, cod: cod, nombre: nombre, edad: edad, sexo: sexo, diag: diag, perfil: perfil.id,
    rut: _demoRut(n), apache: _demoEntre(rnd, perfil.apache[0], perfil.apache[1]),
    talla: _demoEntre(rnd, 150, 186), fechaIngreso: fechaIngreso,
    evoluciones: [], reintubaciones: [], egreso: null, idCama: '',
    barthelIngreso: _demoEntre(rnd, 40, 100),
  };
  ep.pesoIdeal = Math.round((sexo === 'M' ? 50 + 0.91 * (ep.talla - 152.4) : 45.5 + 0.91 * (ep.talla - 152.4)) * 10) / 10;

  // Estado ventilatorio inicial
  let va, sop, modo;
  if (perfil.vm) { va = 'TOT'; sop = 'VM'; modo = _demoPasa(rnd, 0.6) ? 'VC' : 'PC'; }
  else if (perfil.id === 'vni') { va = 'Full Face'; sop = 'VNI'; modo = 'VNI'; }
  else { va = 'Natural'; sop = 'Oxigenoterapia/OAF'; modo = _demoElegir(rnd, ['NRC', 'MMV', 'CNAF']); }

  // Hitos de la trayectoria
  const diaExtubacion = perfil.vm ? Math.min(estadia - 1, _demoEntre(rnd, 2, Math.max(2, estadia - 2))) : -1;
  const haceTQT = perfil.vm && estadia >= 12 && _demoPasa(rnd, 0.45);
  const diaTQT = haceTQT ? _demoEntre(rnd, 9, Math.max(9, estadia - 3)) : -1;
  const reintuba = perfil.vm && diaExtubacion > 0 && !haceTQT && _demoPasa(rnd, 0.14);
  const diaReintub = reintuba ? diaExtubacion + _demoEntre(rnd, 1, 2) : -1;
  const vniFracasa = perfil.id === 'vni' && _demoPasa(rnd, 0.4);
  const diaIntubVNI = vniFracasa ? _demoEntre(rnd, 1, Math.max(1, estadia - 2)) : -1;
  // Evaluaciones formales: al 2.º día y luego cada 4-6 días (B.3 del REM)
  const diasEval = [];
  for (let dEv = 2; dEv <= estadia; dEv += _demoEntre(rnd, 4, 6)) diasEval.push(dEv);

  let diasVM = perfil.vm ? 0 : 0, diasVNI = 0, nivelKTM = 0, pveHechas = 0;

  for (let dia = 1; dia <= estadia; dia++) {
    const fecha = _demoSumarDias(fechaIngreso, dia - 1);
    if (fecha > hoy) break;                       // no se registra el futuro

    ['Dia', 'Noche'].forEach(function (turno) {
      if (fecha === hoy && turno === 'Noche' && _demoPasa(rnd, 0.5)) return;  // turno en curso

      // ── Eventos de vía aérea del turno ──
      let intubO = false, extO = false, reintubO = false, tqtO = false;
      if (dia === diaTQT && turno === 'Dia') { tqtO = true; va = 'TQT'; sop = 'VM'; }
      else if (dia === diaExtubacion && turno === 'Dia' && !haceTQT) {
        extO = true; va = 'Natural'; sop = 'Oxigenoterapia/OAF'; modo = _demoElegir(rnd, ['NRC', 'CNAF', 'MMV']);
      } else if (dia === diaReintub && turno === 'Dia') {
        reintubO = true; va = 'TOT'; sop = 'VM'; modo = 'VC';
      } else if (dia === diaIntubVNI && turno === 'Dia') {
        intubO = true; va = 'TOT'; sop = 'VM'; modo = 'VC';
      }
      if (sop === 'VM') diasVM++;
      if (sop === 'VNI') diasVNI++;

      // ── Rehabilitación del turno ──
      const sedado = sop === 'VM' && dia <= 2;
      const ktmHecha = !sedado && _demoPasa(rnd, turno === 'Dia' ? 0.88 : 0.35);
      if (ktmHecha) nivelKTM = Math.min(5, Math.max(nivelKTM, Math.min(5, Math.floor(dia / 2) + (sop === 'VM' ? 0 : 1))));
      const ktr = _demoEntre(rnd, sop === 'VM' ? 1 : 0, sop === 'VM' ? 3 : 2);
      const evaluaHoy = diasEval.indexOf(dia) >= 0 && turno === 'Dia' && !sedado;
      const pveHoy = sop === 'VM' && va === 'TOT' && dia >= 3 && dia === diaExtubacion && turno === 'Dia';
      if (pveHoy) pveHechas++;

      const evo = {
        ID_EVOLUCION: 'DEMOEVO-' + ('0000' + (ep.evoluciones.length + 1)).slice(-4) + '-' + cod,
        PATIENT_ID: pid, COD_PACIENTE: cod,
        TURNO_KEY: fecha + '-' + turno, FECHA: fecha, TURNO: turno,
        ES_INGRESO: (dia === 1 && turno === 'Dia'),
        TIMESTAMP: fecha + ' ' + (turno === 'Dia' ? '15:20' : '03:10'),
        AUTOR_EMAIL: 'maqueta@demo.local',
        DIA_ESTADIA: dia, DIAS_VM: diasVM, DIAS_VNI: diasVNI, DIAS_VA: diasVM + diasVNI,
        PAC_NOMBRE: nombre, PAC_COD: cod, PAC_EDAD: edad, PAC_SEXO: sexo,
        PAC_TALLA: ep.talla, PAC_PESO_IDEAL: ep.pesoIdeal, PAC_BARTHEL: ep.barthelIngreso,
        PAC_DIAGNOSTICO: _demoDiagnosticoTexto(diag), PAC_DIAG_REM: diag,
        PAC_INGRESO_TIPO: _demoPasa(rnd, 0.8) ? 'Urgencia' : 'Electivo',
        APACHE2: ep.apache,
        FASE_JSON: JSON.stringify([_demoFase(perfil.id, dia, estadia)]),
        SED_TIPO: sedado ? 'Profunda' : '', SED_SAS: sedado ? '2' : String(_demoEntre(rnd, 3, 4)),
        HEMO_ESTADO: dia <= 2 ? 'Inestable' : 'Estable',
        HEMO_FC: _demoElegir(rnd, ['Eucárdico', 'Eucárdico', 'Taquicárdico']),
        EX_MP: _demoElegir(rnd, ['Presente simétrico', 'Disminuido bibasal', 'Disminuido derecho']),
        VENT_VIA_AEREA: va, VENT_SOPORTE: sop, VENT_MODO: modo,
        VENT_FIO2: sop === 'VM' ? _demoEntre(rnd, 30, 60) : _demoEntre(rnd, 24, 40),
        VENT_SPO2: _demoEntre(rnd, 92, 99),
        RESP_KTR_CANT: ktr,
        RESP_SECR_QTY: ktr > 0 ? _demoElegir(rnd, ['Escasa', 'Moderada', 'Abundante']) : '',
        RESP_SECR_CAR: ktr > 0 ? _demoElegir(rnd, ['Mucosa', 'Mucopurulenta']) : '',
        KTM_REALIZADA: ktmHecha,
        KTM_CANT: ktmHecha ? (_demoPasa(rnd, 0.25) ? 2 : 1) : '',
        KTM_NIVEL_KTR: ktmHecha ? String(nivelKTM) : '',
        KTM_TIEMPO_MIN: ktmHecha ? _demoEntre(rnd, 20, 45) : '',
        KTM_SUSPENDIDA: !ktmHecha && !sedado && _demoPasa(rnd, 0.15),
        KTM_IMT: sop !== 'VM' && dia > 3 && _demoPasa(rnd, 0.3),
        KTM_EMS: sedado && _demoPasa(rnd, 0.35),
        EDU_REALIZADA: turno === 'Dia' && _demoPasa(rnd, 0.22),
        PLAN_FIRMA_KINE: _demoElegir(rnd, _DEMO_FIRMAS),
      };
      if (sop === 'VM') {
        evo.VENT_VT = Math.round(ep.pesoIdeal * _demoEntre(rnd, 6, 8));
        evo.VENT_FR = _demoEntre(rnd, 12, 22);
        evo.VENT_PEEP = _demoEntre(rnd, 5, 12);
        evo.VENT_PMAX = _demoEntre(rnd, 18, 30);
      }
      if (va === 'TOT') { evo.VENT_TOT_NUM = String(sexo === 'M' ? 8 : 7.5); evo.VENT_TOT_CM = String(_demoEntre(rnd, 21, 24)); }
      if (va === 'TQT') { evo.VENT_TQT_TIPO = 'Con cuff'; evo.VENT_TQT_CALIBRE = String(sexo === 'M' ? 8 : 7); }
      if (evaluaHoy) {
        evo.EVAL_FECHA = fecha;
        evo.EVAL_T_REALIZAR = true;
        evo.EVAL_T_MRC = _demoEntre(rnd, 24, 58);
        evo.EVAL_T_FSS = _demoEntre(rnd, 8, 33);
        evo.EVAL_IMS = String(Math.min(10, nivelKTM * 2));
        if (_demoPasa(rnd, 0.5)) evo.EVAL_T_DINAMO = _demoEntre(rnd, 5, 24);
        if (_demoPasa(rnd, 0.35)) evo.CPAX_TOTAL = _demoEntre(rnd, 10, 46);
      }
      if (pveHoy) {
        evo.PVE_RESULTADO = reintuba ? 'Superada' : _demoElegir(rnd, ['Superada', 'Superada', 'Fracasada']);
        evo.PVE_VAL = 'Tubo en T 30 min';
      }
      if (extO) {
        evo.EXT_OCURRIO = true; evo.EXT_HORA = '11:' + ('0' + _demoEntre(rnd, 10, 55)).slice(-2);
        evo.EXT_TIPO = 'Programada'; evo.EXT_PE_VA = 'Natural';
        evo.EXT_PE_SOP = 'Oxigenoterapia/OAF'; evo.EXT_PE_MODO = modo;
        evo.EXT_REINTUB = reintuba;
      }
      if (intubO) {
        evo.INTUB_OCURRIO = true; evo.INTUB_HORA = '0' + _demoEntre(rnd, 1, 9) + ':30';
        evo.INTUB_SOP_PREVIO = 'VNI'; evo.INTUB_VA_POST = 'TOT'; evo.INTUB_SOP_POST = 'VM';
        evo.INTUB_MODO_POST = 'VC'; evo.INTUB_DET = 'Fracaso de VNI (maqueta)';
      }
      if (reintubO) {
        evo.REINTUB_HORA = '0' + _demoEntre(rnd, 2, 9) + ':15';
        evo.REINTUB_SOP_PREV = _demoElegir(rnd, ['CNAF', 'VNI', 'Naricera-NRC']);
        evo.REINTUB_SOP_POST = 'VM'; evo.REINTUB_MODO = 'VC';
        ep.reintubaciones.push({
          ID_REINTUB: 'DEMOREINT-' + cod + '-' + dia,
          PATIENT_ID: pid, TIMESTAMP: fecha + ' ' + evo.REINTUB_HORA, FECHA: fecha, TURNO: turno,
          ID_EVOLUCION: evo.ID_EVOLUCION, NOMBRE: nombre, COD_PACIENTE: cod,
          DIAGNOSTICO: _demoDiagnosticoTexto(diag), TIPO_DESVINCULACION: 'Extubación programada',
          MOTIVO: _demoElegir(rnd, ['Insuficiencia respiratoria', 'Compromiso de conciencia', 'Manejo de secreciones']),
          SOPORTE_PREVIO: evo.REINTUB_SOP_PREV,
          TIEMPO_EXTUBADO: String(_demoEntre(rnd, 12, 46)) + ' h',
          HORA_REINTUBACION: evo.REINTUB_HORA, KINESIOLOGO: evo.PLAN_FIRMA_KINE,
          AUTOR_EMAIL: 'maqueta@demo.local',
        });
      }
      if (tqtO) {
        evo.TQT_OCURRIO = true; evo.TQT_HORA = '10:00';
        evo.TQT_TECNICA = _demoPasa(rnd, 0.7) ? 'Percutánea' : 'Quirúrgica';
        evo.TQT_SOP_POST = 'VM'; evo.TQT_MODO_POST = modo;
        evo.FECHA_INICIO_TQT = fecha;
      }
      if (sop === 'VM' && _demoPasa(rnd, 0.06)) evo.TQT_CAMBIO = va === 'TQT';

      ep.evoluciones.push(evo);
    });
  }

  // Egreso: si la estadía terminó antes de hoy, el episodio está cerrado.
  const ultima = ep.evoluciones[ep.evoluciones.length - 1];
  if (!ultima) return ep;
  const fechaFin = _demoSumarDias(fechaIngreso, estadia - 1);
  if (fechaFin < hoy) {
    const fallece = _demoPasa(rnd, 0.13);
    ep.egreso = {
      fecha: fechaFin,
      motivo: fallece ? 'Fallecimiento' : 'Alta',
      destino: fallece ? '' : _demoElegir(rnd, ['Sala médica', 'Intermedio', 'Traslado a otro centro']),
    };
  }
  ep.diasVM = diasVM;
  ep.diasVNI = diasVNI;
  ep.estadia = estadia;
  ep.nivelKTM = nivelKTM;
  ep.reintubado = ep.reintubaciones.length > 0;
  return ep;
}

function _demoFase(perfilId, dia, estadia) {
  if (dia <= 2) return perfilId === 'neuro' ? 'Neuroprotección' : 'Reanimación inicial';
  if (dia >= estadia - 2) return 'Rehabilitación';
  return dia % 2 === 0 ? 'Weaning' : 'Consolidación de weaning';
}

function _demoDiagnosticoTexto(diagREM) {
  const mapa = {
    'ACV': 'Accidente cerebrovascular isquémico extenso',
    'TEC': 'Traumatismo encéfalo craneano grave',
    'Otras neurológicas': 'Estatus convulsivo refractario',
    'Enfermedades respiratorias': 'Neumonía adquirida en la comunidad grave',
    'COVID-19': 'Neumonía por SARS-CoV-2',
    'Enfermedades cardíacas': 'Edema pulmonar agudo cardiogénico',
    'Otros pre y post quirúrgicos': 'Postoperatorio de cirugía abdominal mayor',
    'Traumatológicos': 'Politraumatizado con tórax volante',
    'Oncológicos': 'Neutropenia febril en tratamiento oncológico',
    'Genitourinarias': 'Shock séptico de foco urinario',
    'Otros': 'Shock séptico de foco abdominal',
  };
  return (mapa[diagREM] || diagREM) + ' (maqueta)';
}

/** Completa la fila de evolución con el texto clínico del propio motor. */
function _demoEvolucionFila(evo) {
  try {
    evo.TEXTO_GENERADO = generarTextoEvolucion(evo);
    evo.TEXTO_AUTO = evo.TEXTO_GENERADO;
  } catch (err) {
    evo.TEXTO_GENERADO = '';
  }
  evo.TEXTO_MANUAL = false;
  return evo;
}

function _demoFichaArchivo(ep) {
  const evos = ep.evoluciones;
  const ultima = evos[evos.length - 1] || {};
  const turnosVM = evos.filter(function (e) { return e.VENT_SOPORTE === 'VM'; }).length;
  const turnosKTM = evos.filter(function (e) { return e.KTM_REALIZADA === true; }).length;
  const turnosKTMC = evos.filter(function (e) { return e.KTM_SUSPENDIDA === true; }).length;
  const ktrTotal = evos.reduce(function (s, e) { return s + (parseInt(e.RESP_KTR_CANT, 10) || 0); }, 0);
  const conMRC = evos.filter(function (e) { return e.EVAL_T_MRC; });
  const mrcEgreso = conMRC.length ? conMRC[conMRC.length - 1].EVAL_T_MRC : '';
  const conFSS = evos.filter(function (e) { return e.EVAL_T_FSS; });
  return {
    ID_ARCHIVO: 'DEMOARCH-' + ep.cod,
    PATIENT_ID: ep.pid, CAMA_ORIGEN: ep.idCama, COD_PACIENTE: ep.cod,
    FECHA_INGRESO: ep.fechaIngreso, FECHA_EGRESO: ep.egreso.fecha,
    DIAS_TOTAL: ep.estadia, DIAS_VM_TOTAL: Math.round(ep.diasVM / 2),
    DIAS_VA_TOTAL: Math.round((ep.diasVM + ep.diasVNI) / 2),
    NOMBRE: ep.nombre, EDAD: ep.edad, SEXO: ep.sexo,
    DIAGNOSTICO: _demoDiagnosticoTexto(ep.diag), DIAG_REM: ep.diag,
    MOTIVO_EGRESO: ep.egreso.motivo, DESTINO_EGRESO: ep.egreso.destino,
    KTR_TOTAL: ktrTotal, TURNOS_VM: turnosVM, TURNOS_KTM: turnosKTM, TURNOS_KTMC: turnosKTMC,
    EXTUBACION_OK: !ep.reintubado, REINTUBACION: ep.reintubado,
    BARTHEL_INGRESO: ep.barthelIngreso,
    MRC_SS_EGRESO: mrcEgreso,
    FSS_EGRESO: conFSS.length ? conFSS[conFSS.length - 1].EVAL_T_FSS : '',
    FIRMA_RESPONSABLE: ultima.PLAN_FIRMA_KINE || 'MFB',
    AUTOR_EMAIL: 'maqueta@demo.local',
    OBSERVACIONES: 'Episodio de la MAQUETA (datos ficticios).',
    FASE_FINAL: 'Rehabilitación',
    RUT: ep.rut, APACHE2: ep.apache, TS_INGRESO: ep.fechaIngreso + ' 08:00',
  };
}

function _demoOcuparCama(ep) {
  const evos = ep.evoluciones;
  const ultima = evos[evos.length - 1];
  if (!ultima) return;
  const dia = evos.filter(function (e) { return e.TURNO === 'Dia'; }).pop() || {};
  const noche = evos.filter(function (e) { return e.TURNO === 'Noche'; }).pop() || {};
  repoActualizar('CAMAS_ESTADO', 'ID_CAMA', String(ep.idCama), {
    OCUPADA: true, STATUS_CAMA: 'Ocupada',
    PATIENT_ID: ep.pid, COD_PACIENTE: ep.cod, NOMBRE: ep.nombre,
    EDAD: ep.edad, SEXO: ep.sexo, TALLA_CM: ep.talla, PESO_IDEAL_KG: ep.pesoIdeal,
    BARTHEL: ep.barthelIngreso, DIAGNOSTICO: _demoDiagnosticoTexto(ep.diag), DIAG_REM: ep.diag,
    AISLAMIENTO: false,
    VIA_AEREA: ultima.VENT_VIA_AEREA, TOT_NUMERO: ultima.VENT_TOT_NUM || '',
    TOT_CM_LABIO: ultima.VENT_TOT_CM || '', TQT_TIPO: ultima.VENT_TQT_TIPO || '',
    SOPORTE: ultima.VENT_SOPORTE, MODO: ultima.VENT_MODO,
    FECHA_INGRESO: ep.fechaIngreso, FECHA_INICIO_VA: ep.fechaIngreso,
    FECHA_INICIO_SOPORTE: ep.fechaIngreso,
    FASE_JSON: ultima.FASE_JSON, KTM_NIVEL: String(ep.nivelKTM || ''),
    FIRMA_KINE: ultima.PLAN_FIRMA_KINE, AUTOR_EMAIL: 'maqueta@demo.local',
    TEXTO_EVO_DIA: dia.TEXTO_GENERADO || '', TEXTO_EVO_NOCHE: noche.TEXTO_GENERADO || '',
    ULTIMO_TURNO_KEY: ultima.TURNO_KEY,
    KTR_DIA: dia.RESP_KTR_CANT || '', KTM_DIA: dia.KTM_NIVEL_KTR || '',
    FIRMA_DIA: dia.PLAN_FIRMA_KINE || '', KEY_DIA: dia.TURNO_KEY || '',
    KTR_NOCHE: noche.RESP_KTR_CANT || '', FIRMA_NOCHE: noche.PLAN_FIRMA_KINE || '',
    KEY_NOCHE: noche.TURNO_KEY || '',
    INGRESO_TIPO: ultima.PAC_INGRESO_TIPO || 'Urgencia',
    RUT: ep.rut, APACHE2: ep.apache, TS_INGRESO: ep.fechaIngreso + ' 08:00',
  });
}
