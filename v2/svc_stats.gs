/**
 * svc_stats.gs — Estadísticas del período para el dashboard.
 * Agrega EVOLUCIONES + EVOLUCIONES_ARCHIVO + REINTUBACIONES + ARCHIVO_PACIENTES entre dos fechas
 * (inclusive) en una sola pasada por hoja y devuelve SOLO agregados
 * (conteos, promedios y tablas de frecuencia) — nunca filas crudas.
 */

/** Normaliza a 'yyyy-MM-dd' (Sheets puede devolver Date en columnas con formato fecha). */
function _statISO(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, leerConfig('TIMEZONE', 'America/Santiago'), 'yyyy-MM-dd');
  }
  return String(v).slice(0, 10);
}

/**
 * _ktmMotivo — la etiqueta del motivo por el que NO se hizo la KTM.
 * Una sola fórmula para `obtenerStats` y `datosPivot`: escrita dos veces se
 * desincroniza y la pestaña muestra dos verdades del mismo turno.
 * Devuelve '' cuando la KTM se realizó o no se declaró estado.
 *
 * 🪤 Comprueba el booleano por su cuenta en vez de llamar a `esVerdadero`:
 * `datosPivot` no dependía de ningún global de infraestructura (usa su propio
 * `esT`), y arrastrarle uno rompe su guardia sin que nada esté mal en el dato.
 */
function _ktmMotivo(e) {
  const vv = v => v === true || v === 'TRUE' || v === 'true';
  if (vv(e.KTM_SUSPENDIDA)) {
    return String(e.KTM_CONTRA_RAZON || '').trim()
        || String(e.KTM_CONTRA_CAT || '').trim()
        || 'Contraindicada';
  }
  if (vv(e.KTM_NO_REALIZADA)) {
    return String(e.KTM_NO_RAZON || '').trim() || 'Sin motivo registrado';
  }
  return '';
}

/**
 * Razones de «no realizada» cuyo detalle se desglosa en el subregistro: SOLO
 * «Otro» — la única que no dice nada por sí sola y la única que obliga a
 * escribir el porqué. Del resto no interesa el comentario (decisión de Manuel,
 * 28-ago-2026): «Indicación médica» se probó dentro y quedó fuera, porque la
 * razón ya explica el turno y su detalle no aporta a la estadística mensual.
 *
 * Hoy es la MISMA regla que `_KTM_RAZON_EXIGE_FUNDAMENTO` (dominio_validacion.gs)
 * y `KTM_RAZONES_CON_FUNDAMENTO` (index.html) — se pide el porqué exactamente
 * donde se va a leer. Está copiada y no importada porque **23 guardias cargan
 * este archivo SIN la validación** y una dependencia cruzada las rompería sin que
 * nada esté mal en el dato. La guardia verifica que las tres digan lo mismo.
 */
var _KTM_RAZON_SUBREGISTRO = ['Otro'];

/**
 * Razones de «PVE no realizada» cuyo detalle se desglosa en el subregistro:
 * SOLO «Otra», que es también la única que obliga a escribirlo. Espejo de
 * `_PVE_RAZON_EXIGE_MOTIVO` (dominio_validacion.gs) y `PVE_RAZONES_CON_MOTIVO`
 * (index.html) — se pide el porqué exactamente donde se va a leer. Copiada y no
 * importada por la misma razón que la de KTM: hay guardias que cargan este
 * archivo SIN la validación. La guardia verifica que las tres digan lo mismo.
 */
var _PVE_RAZON_SUBREGISTRO = ['Otra'];

/**
 * Etiqueta de los turnos en que no hubo PVE porque el paciente se extubó igual.
 * NO son un hueco de registro: el evento del turno es la extubación (con su
 * tipo), y por eso el formulario manda `PVE_SC_RAZON` vacío a propósito.
 * Mezclarlos con los que nadie explicó inflaría la barra de «sin motivo» con
 * turnos que sí están explicados.
 */
var _PVE_MOT_EXTUBADO = 'Extubación en el turno (sin PVE)';

/**
 * _pveMotivo — la etiqueta del motivo por el que NO se realizó la PVE.
 * Una sola fórmula para `obtenerStats` y `datosPivot`, por lo mismo que
 * `_ktmMotivo`: escrita dos veces se desincroniza y la pestaña muestra dos
 * verdades del mismo turno. Devuelve '' cuando la PVE se hizo, no corresponde
 * o no se declaró.
 * 🪤 `EXT_TIPO='sin_condiciones'` NO es una extubación (decisión clínica
 * jul-2026): significa justamente que ese turno no hubo PVE, así que esas filas
 * históricas siguen mostrando su razón, no la etiqueta de extubado.
 * 🪤 Comprueba el booleano por su cuenta en vez de llamar a `esVerdadero`:
 * `datosPivot` no depende de ningún global de infraestructura.
 */
function _pveMotivo(e) {
  if (String(e.PVE_VAL || '') !== 'no') return '';
  const vv = v => v === true || v === 'TRUE' || v === 'true';
  if (vv(e.EXT_OCURRIO) && String(e.EXT_TIPO || '') !== 'sin_condiciones') return _PVE_MOT_EXTUBADO;
  return String(e.PVE_SC_RAZON || '').trim() || 'Sin motivo registrado';
}

/**
 * _ktmFundNorm — clave para agrupar fundamentos escritos a mano.
 * Sin esto, «egreso» y «Egreso» salían como dos filas de 2 en vez de una de 4
 * (visto en producción el 28-ago-2026). Se ignoran mayúsculas, tildes y espacios
 * de más; la fila muestra después la variante MÁS ESCRITA, no esta clave.
 */
function _ktmFundNorm(t) {
  return String(t || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function obtenerStats(desde, hasta) {
  desde = _statISO(desde); hasta = _statISO(hasta);
  if (!desde || !hasta) return err('Faltan fechas desde/hasta.', ERR.VALIDACION);
  if (desde > hasta) { const t = desde; desde = hasta; hasta = t; }

  const tally = (obj, k) => { k = String(k || '').trim(); if (!k) return; obj[k] = (obj[k] || 0) + 1; };
  const r1 = x => Math.round(x * 10) / 10;

  // ── EVOLUCIONES + EVOLUCIONES_ARCHIVO ────────────────────────────────────
  // 🔴 Hasta el 28-ago-2026 esta vista leía SOLO la hoja viva, así que un
  // paciente que egresaba DESAPARECÍA de la estadística del mes en que se
  // atendió — mientras los egresos sí se contaban desde ARCHIVO_PACIENTES.
  // O sea: numerador y denominador de universos distintos. Para un corte
  // mensual (que es como se usa la pestaña) eso deja fuera a todos los que se
  // fueron. El REM, los indicadores y `datosPivot` ya leían las dos hojas;
  // esta era la única que no. Sube TODAS las cifras de la pestaña.
  const allEvos = repoLeerTodos('EVOLUCIONES').concat(repoLeerTodos('EVOLUCIONES_ARCHIVO'));
  const evos = allEvos.filter(e => {
    const f = _statISO(e.FECHA); return f && f >= desde && f <= hasta;
  });

  const pacientes = {};   // PATIENT_ID → { rem, vm }
  const vmDiasSet = {};   // 'pid|fecha' → true (días-paciente en VM)
  let dia = 0, noche = 0, ingresos = 0, turnosVM = 0;
  let intub = 0, ext = 0, extProg = 0, autoext = 0, pveSi = 0, pveSup = 0, pveFrus = 0;
  let decan = 0, recanul = 0, cambiosTOT = 0;
  let ktmR = 0, ktmC = 0, ktmN = 0, ktrSes = 0, imtSes = 0, ktmTiempo = 0, ktmTiempoN = 0;
  const ktmNiveles = {}, ktmMotivosNo = {}, procs = {}, catResp = {}, catMotor = {};
  // Subregistro de motivos: separados por estado (contraindicada ≠ no realizada
  // son dos decisiones clínicas distintas y estaban en una misma barra), más el
  // detalle de los «otros» con su fundamento textual. `ktmMotivosNo` se mantiene
  // tal cual — es el agregado de siempre y hay quien lo lee.
  const ktmMotivosContra = {}, ktmMotivosNoReal = {};
  const ktmOtros = {};   // 'grupo|motivo|fundamentoNormalizado' → fila del subregistro
  const _otro = (grupo, motivo, fundamento, mes) => {
    motivo = String(motivo || '').trim() || '(sin motivo)';
    fundamento = String(fundamento || '').trim();
    const k = grupo + '|' + motivo + '|' + _ktmFundNorm(fundamento);
    if (!ktmOtros[k]) ktmOtros[k] = { grupo: grupo, motivo: motivo, fundamento: fundamento, n: 0, meses: {}, _var: {} };
    const f = ktmOtros[k];
    f.n++;
    if (fundamento) f._var[fundamento] = (f._var[fundamento] || 0) + 1;
    if (mes) f.meses[mes] = (f.meses[mes] || 0) + 1;
  };
  // Los que quedaron SIN ninguna razón no son un motivo: son un hueco. Van a su
  // propia línea para no competir en la tabla con fundamentos de verdad — en
  // agosto eran 113 y se comían el resto (reporte de Manuel, 28-ago-2026).
  const ktmSinMotivo = { n: 0, noReal: 0, contra: 0, meses: {} };
  const _sinMotivo = (grupo, mes) => {
    ktmSinMotivo.n++;
    ktmSinMotivo[grupo === 'contra' ? 'contra' : 'noReal']++;
    if (mes) ktmSinMotivo.meses[mes] = (ktmSinMotivo.meses[mes] || 0) + 1;
  };

  // ── PVE no realizada: los mismos tres niveles que la KTM (28-ago-2026) ──
  // Hasta hoy la pestaña contaba las PVE que SÍ se hicieron y su éxito, y de las
  // que no se hicieron no decía absolutamente nada — ni cuántas ni por qué,
  // aunque la razón estaba guardada en la planilla desde jul-2026.
  //   `pveMotivosNo` = la barra (cuántos por cada razón del catálogo)
  //   `pveOtros`     = el desglose de «Otra», que sin su texto no dice nada
  //   `pveSinMotivo` = el hueco, aparte, para que no compita con los motivos
  let pveNo = 0;
  const pveMotivosNo = {};
  const pveOtros = {};   // 'motivo|detalleNormalizado' → fila del subregistro
  const _pveOtro = (motivo, detalle, mes) => {
    motivo = String(motivo || '').trim() || '(sin motivo)';
    detalle = String(detalle || '').trim();
    const k = motivo + '|' + _ktmFundNorm(detalle);
    if (!pveOtros[k]) pveOtros[k] = { motivo: motivo, detalle: detalle, n: 0, meses: {}, _var: {} };
    const f = pveOtros[k];
    f.n++;
    if (detalle) f._var[detalle] = (f._var[detalle] || 0) + 1;
    if (mes) f.meses[mes] = (f.meses[mes] || 0) + 1;
  };
  const pveSinMotivo = { n: 0, meses: {} };
  const _pveSinMotivo = mes => {
    pveSinMotivo.n++;
    if (mes) pveSinMotivo.meses[mes] = (pveSinMotivo.meses[mes] || 0) + 1;
  };
  // Puntaje SOCHIMI → nivel de complejidad (n variables: Baja=n, Media n+1..2n, Alta >2n)
  const catNivel = (p, n) => p <= n ? 'Baja' : (p <= n * 2 ? 'Media' : 'Alta');

  evos.forEach(e => {
    const pid = String(e.PATIENT_ID || e.COD_PACIENTE || 'sin-id');
    const f = _statISO(e.FECHA);
    if (!pacientes[pid]) pacientes[pid] = { rem: '', vm: false };
    if (e.PAC_DIAG_REM) pacientes[pid].rem = e.PAC_DIAG_REM;

    if (String(e.TURNO) === 'Noche') noche++; else dia++;
    if (esVerdadero(e.ES_INGRESO)) ingresos++;
    if (e.VENT_SOPORTE === 'VM') { turnosVM++; vmDiasSet[pid + '|' + f] = true; pacientes[pid].vm = true; }

    // Eventos únicos de vía aérea
    if (esVerdadero(e.INTUB_OCURRIO)) intub++;
    if (esVerdadero(e.EXT_OCURRIO)) {
      ext++;
      if (e.PVE_VAL === 'si') extProg++;
      if (String(e.EXT_TIPO || '').toLowerCase().indexOf('autoext') !== -1) autoext++;
    }
    if (e.PVE_VAL === 'si') pveSi++;
    if (e.PVE_RESULTADO === 'superada') pveSup++;
    if (e.PVE_RESULTADO === 'frustra') pveFrus++;
    if (e.PVE_VAL === 'no') {
      pveNo++;
      const pRaz = _pveMotivo(e);
      tally(pveMotivosNo, pRaz);
      if (pRaz === 'Sin motivo registrado') _pveSinMotivo(f.slice(0, 7));
      else if (_PVE_RAZON_SUBREGISTRO.indexOf(pRaz) !== -1) _pveOtro(pRaz, e.PVE_SC_DET, f.slice(0, 7));
    }
    if (esVerdadero(e.DECAN_OCURRIO)) decan++;
    if (esVerdadero(e.DECAN_RECANUL)) recanul++;
    if (esVerdadero(e.TOT_CAMBIO)) cambiosTOT++;

    // Terapia física
    if (esVerdadero(e.KTM_REALIZADA)) {
      ktmR++;
      tally(ktmNiveles, e.KTM_NIVEL_KTR ? 'Nivel ' + e.KTM_NIVEL_KTR : '');
      const t = parseFloat(e.KTM_TIEMPO_MIN); if (t > 0) { ktmTiempo += t; ktmTiempoN++; }
    } else if (esVerdadero(e.KTM_SUSPENDIDA)) {
      ktmC++;
      const cRaz = String(e.KTM_CONTRA_RAZON || '').trim();
      const cMan = String(e.KTM_CONTRA_MANUAL || '').trim();
      const cCat = String(e.KTM_CONTRA_CAT || '').trim();
      const cEtq = _ktmMotivo(e);
      tally(ktmMotivosNo, cEtq);
      tally(ktmMotivosContra, cEtq);
      // «Otros» de la contraindicación: la categoría 'Otra' —que salió del
      // catálogo el 28-ago-2026 pero sigue viva en las filas ya guardadas y en
      // la ruta automática de AET IIIC— y el caso en que se escribió una
      // descripción sin elegir ítem del protocolo.
      if (cEtq === 'Contraindicada') _sinMotivo('contra', f.slice(0, 7));
      else if (cCat === 'Otra' || (!cRaz && cMan)) _otro('contra', cEtq, cMan, f.slice(0, 7));
    } else if (esVerdadero(e.KTM_NO_REALIZADA)) {
      ktmN++;
      const nRaz = _ktmMotivo(e);
      tally(ktmMotivosNo, nRaz);
      tally(ktmMotivosNoReal, nRaz);
      if (nRaz === 'Sin motivo registrado') _sinMotivo('noReal', f.slice(0, 7));
      else if (_KTM_RAZON_SUBREGISTRO.indexOf(nRaz) !== -1) {
        _otro('noReal', nRaz, e.KTM_NO_COMENTARIO, f.slice(0, 7));
      }
    }
    const kt = parseInt(e.RESP_KTR_CANT); if (kt > 0) ktrSes += kt;
    if (esVerdadero(e.KTM_IMT)) imtSes++;
    if (e.PROC_JSON) { try { (JSON.parse(e.PROC_JSON) || []).forEach(p => tally(procs, p)); } catch (x) {} }
    // Nivel guardado con la configuración vigente ese turno; filas anteriores
    // a CAT_MATRICES (solo puntaje) se derivan con el n° de variables default.
    const nR = String(e.CAT_RESP_NIVEL || '').trim();
    const cr = parseInt(e.CAT_RESP_PJE) || 0;
    if (nR) tally(catResp, nR); else if (cr) tally(catResp, catNivel(cr, 5));
    const nM = String(e.CAT_MOTOR_NIVEL || '').trim();
    const cm = parseInt(e.CAT_MOTOR_PJE) || 0;
    if (nM) tally(catMotor, nM); else if (cm) tally(catMotor, catNivel(cm, 4));
  });

  // ── DAUCI ACTUAL: pacientes actualmente ingresados cuya MRC-SS más reciente
  //    indica debilidad. No depende del rango de fechas: es una foto del estado
  //    de hoy. Se filtra por los PATIENT_ID de las camas ocupadas y se toma su
  //    TURNO_KEY más alto, así que da igual que `allEvos` traiga también el
  //    archivo: un episodio archivado no está ocupando cama. ──
  const cDauci = parseFloat(leerConfig('CORTE_MRC_DAUCI', '48')) || 48;
  const cSev = parseFloat(leerConfig('CORTE_MRC_SEVERA', '36')) || 36;
  const activos = {}; // PATIENT_ID → true (camas ocupadas)
  repoLeerTodos('CAMAS_ESTADO').forEach(c => { if (esVerdadero(c.OCUPADA) && c.PATIENT_ID) activos[String(c.PATIENT_ID)] = true; });
  const mrcAct = {};  // PATIENT_ID ingresado → { val, key } (MRC-SS más reciente)
  allEvos.forEach(e => {
    const pid = String(e.PATIENT_ID || '');
    if (!activos[pid]) return;
    const m = parseFloat(e.EVAL_T_MRC);
    if (isNaN(m) || m <= 0) return;
    const kk = String(e.TURNO_KEY || (_statISO(e.FECHA) + '-' + e.TURNO));
    if (!mrcAct[pid] || kk > mrcAct[pid].key) mrcAct[pid] = { val: m, key: kk };
  });
  let mrcEval = 0, mrcDauci = 0, mrcSev = 0;
  Object.keys(mrcAct).forEach(pid => {
    mrcEval++;
    const val = mrcAct[pid].val;
    if (val < cDauci) mrcDauci++;
    if (val < cSev) mrcSev++;
  });
  const ingresadosN = Object.keys(activos).length;

  // Grupo REM: por paciente (último valor registrado), no por evolución
  const rem = {};
  Object.keys(pacientes).forEach(pid => tally(rem, pacientes[pid].rem || 'Sin grupo'));

  // ── REINTUBACIONES del rango (una fila por evento) ──
  let reintubs = 0;
  try {
    reintubs = repoLeerTodos('REINTUBACIONES').filter(r => {
      const f = _statISO(r.FECHA); return f && f >= desde && f <= hasta;
    }).length;
  } catch (x) {}

  // ── Egresos del rango (ARCHIVO_PACIENTES) ──
  const arch = repoLeerTodos('ARCHIVO_PACIENTES').filter(a => {
    const f = _statISO(a.FECHA_EGRESO); return f && f >= desde && f <= hasta;
  });
  const destinos = {}, motivosEgr = {}, mrcInterp = {}, fssInterp = {};
  let diasTot = 0, diasN = 0, dauci = 0;
  let mrcSum = 0, mrcN = 0, fssSum = 0, fssN = 0, cpaxSum = 0, cpaxN = 0;
  arch.forEach(a => {
    tally(destinos, a.DESTINO_EGRESO || 'Sin destino');
    tally(motivosEgr, a.MOTIVO_EGRESO || 'Sin motivo');
    const d = parseFloat(a.DIAS_TOTAL); if (d > 0) { diasTot += d; diasN++; }
    if (esVerdadero(a.DAUCI)) dauci++;
    if (a.MRC_INTERP) tally(mrcInterp, a.MRC_INTERP);
    if (a.FSS_INTERP) tally(fssInterp, a.FSS_INTERP);
    const m = parseFloat(a.MRC_SS_EGRESO); if (m > 0) { mrcSum += m; mrcN++; }
    const fs = parseFloat(a.FSS_EGRESO); if (fs > 0) { fssSum += fs; fssN++; }
    const cp = parseFloat(a.CPAX_EGRESO); if (cp > 0) { cpaxSum += cp; cpaxN++; }
  });

  return ok({
    desde: desde, hasta: hasta,
    evos: { total: evos.length, dia: dia, noche: noche },
    pacientes: {
      atendidos: Object.keys(pacientes).length, ingresos: ingresos, egresos: arch.length,
      ventilados: Object.keys(pacientes).filter(p => pacientes[p].vm).length,
    },
    vm: { turnosVM: turnosVM, diasPacienteVM: Object.keys(vmDiasSet).length },
    eventos: {
      intubaciones: intub, extubaciones: ext, extubProgramadas: extProg, autoextubaciones: autoext,
      reintubaciones: reintubs, tasaReintubPct: ext > 0 ? r1(reintubs / ext * 100) : 0,
      pveRealizadas: pveSi, pveSuperadas: pveSup, pveFrustras: pveFrus,
      pveExitoPct: (pveSup + pveFrus) > 0 ? r1(pveSup / (pveSup + pveFrus) * 100) : 0,
      decanulaciones: decan, recanulaciones: recanul, cambiosTOT: cambiosTOT,
    },
    // ── PVE no realizada, con su porqué (28-ago-2026) ──
    // Mismo trato que la KTM: la barra dice CUÁNTOS por cada razón; el
    // subregistro dice QUÉ se escribió en los «Otra», que es la única razón que
    // por sí sola no informa nada; y el hueco va aparte para no competir con
    // los motivos de verdad.
    pve: {
      noRealizadas: pveNo,
      motivosNo: pveMotivosNo,
      otros: Object.keys(pveOtros).map(function (k) {
        const f = pveOtros[k];
        // La etiqueta es la forma MÁS ESCRITA por el equipo, no la primera que
        // llegó ni la clave normalizada: es la que ellos reconocen.
        const vs = Object.keys(f._var);
        if (vs.length) f.detalle = vs.sort((x, y) => f._var[y] - f._var[x] || x.localeCompare(y))[0];
        f.variantes = vs.length > 1 ? vs.length : 0;   // >0 avisa que se unieron formas distintas
        delete f._var;
        return f;
      }).sort((a, b) => b.n - a.n),
      // Lo que se guardó sin describir el «Otra»: solo puede venir de antes de
      // la regla, porque hoy la pantalla y el servidor lo rechazan.
      sinDetalle: Object.keys(pveOtros).reduce((t, k) => t + (pveOtros[k].detalle ? 0 : pveOtros[k].n), 0),
      sinMotivo: pveSinMotivo,
    },
    ktm: {
      realizada: ktmR, contraindicada: ktmC, noRealizada: ktmN,
      realizadaPct: (ktmR + ktmC + ktmN) > 0 ? r1(ktmR / (ktmR + ktmC + ktmN) * 100) : 0,
      niveles: ktmNiveles, motivosNo: ktmMotivosNo,
      motivosContra: ktmMotivosContra, motivosNoReal: ktmMotivosNoReal,
      // Subregistro de «otros» ordenado por frecuencia, con su fundamento y el
      // desglose por mes. `sinFundamento` es lo que quedó registrado sin el
      // porqué — antes de la regla del 28-ago-2026 se podía guardar así.
      otros: Object.keys(ktmOtros).map(function (k) {
        const f = ktmOtros[k];
        // La etiqueta es la forma MÁS ESCRITA por el equipo, no la primera que
        // llegó ni la clave normalizada: es la que ellos reconocen.
        const vs = Object.keys(f._var);
        if (vs.length) f.fundamento = vs.sort((x, y) => f._var[y] - f._var[x] || x.localeCompare(y))[0];
        f.variantes = vs.length > 1 ? vs.length : 0;   // >0 avisa que se unieron formas distintas
        delete f._var;
        return f;
      }).sort((a, b) => b.n - a.n),
      sinFundamento: Object.keys(ktmOtros).reduce((t, k) => t + (ktmOtros[k].fundamento ? 0 : ktmOtros[k].n), 0),
      sinMotivo: ktmSinMotivo,
      tiempoPromMin: ktmTiempoN > 0 ? r1(ktmTiempo / ktmTiempoN) : 0,
      ktrSesiones: ktrSes, imtSesiones: imtSes,
    },
    procs: procs, rem: rem, catResp: catResp, catMotor: catMotor,
    dauciActual: {
      ingresados: ingresadosN, evaluados: mrcEval, dauci: mrcDauci, severa: mrcSev,
      dauciPct: mrcEval > 0 ? r1(mrcDauci / mrcEval * 100) : 0,
      corte: cDauci, corteSev: cSev,
    },
    egresos: {
      total: arch.length, destinos: destinos, motivos: motivosEgr,
      diasEstadiaProm: diasN > 0 ? r1(diasTot / diasN) : 0,
      dauci: dauci, dauciPct: arch.length > 0 ? r1(dauci / arch.length * 100) : 0,
      mrcProm: mrcN > 0 ? r1(mrcSum / mrcN) : 0, fssProm: fssN > 0 ? r1(fssSum / fssN) : 0,
      cpaxProm: cpaxN > 0 ? r1(cpaxSum / cpaxN) : 0,
      mrcInterp: mrcInterp, fssInterp: fssInterp,
    },
  });
}

/**
 * Datos crudos ANONIMIZADOS para la tabla dinámica (pestaña Estadísticas).
 * Una fila por turno registrado, SOLO campos de lista blanca — jamás nombre
 * ni RUT (regla dura del proyecto). Fechas normalizadas AAAA-MM-DD y tope de
 * filas para no colgar el navegador del hospital.
 */
function datosPivot(desde, hasta) {
  try {
    const d0 = String(desde || '').slice(0, 10), d1 = String(hasta || '').slice(0, 10);
    const LIM = 2500;
    const todas = repoLeerTodos('EVOLUCIONES').concat(repoLeerTodos('EVOLUCIONES_ARCHIVO'))
      .filter(e => { const f = _statISO(e.FECHA); return f && (!d0 || f >= d0) && (!d1 || f <= d1); })
      .sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));
    const esT = v => v === true || v === 'TRUE';
    const filas = todas.slice(0, LIM).map(e => {
      const f = _statISO(e.FECHA);
      let fase = ''; try { fase = (JSON.parse(e.FASE_JSON || '[]') || [])[0] || ''; } catch (err) { fase = ''; }
      return {
        FECHA: f, MES: f.slice(0, 7), TURNO: String(e.TURNO || ''), CAMA: String(e.ID_CAMA || ''),
        SEXO: String(e.PAC_SEXO || ''), EDAD: e.PAC_EDAD || '', DIAG_REM: String(e.PAC_DIAG_REM || ''),
        FASE: fase, VIA_AEREA: String(e.VENT_VIA_AEREA || ''), SOPORTE: String(e.VENT_SOPORTE || ''),
        MODO: String(e.VENT_MODO || ''), DIA_ESTADIA: e.DIA_ESTADIA || '',
        KTR: parseInt(e.RESP_KTR_CANT) || 0,
        KTM: esT(e.KTM_REALIZADA) ? 'Sí' : (esT(e.KTM_SUSPENDIDA) ? 'Suspendida' : 'No'),
        KTM_MOTIVO: _ktmMotivo(e),
        NIVEL_KTM: String(e.KTM_NIVEL_KTR || ''), IMT: esT(e.KTM_IMT) ? 'Sí' : 'No',
        EMS: esT(e.KTM_EMS) ? 'Sí' : 'No', IMS: e.EVAL_IMS !== '' && e.EVAL_IMS != null ? String(e.EVAL_IMS) : '',
        PVE: String(e.PVE_VAL || ''), PVE_RESULTADO: String(e.PVE_RESULTADO || ''),
        // El porqué viaja junto al «no», igual que KTM_MOTIVO junto a KTM: quien
        // exporta el pivot para analizar el weaning necesita las dos columnas.
        PVE_MOTIVO: _pveMotivo(e), PVE_DETALLE: String(e.PVE_SC_DET || ''),
        EXTUBACION: esT(e.EXT_OCURRIO) ? String(e.EXT_TIPO || 'sí') : '',
        CUFF: String(e.VENT_CUFF_EST || ''),
        FIO2: e.VENT_FIO2 || '', PEEP: e.VENT_PEEP || '', PAFI: e.VENT_PAFI || '',
        MRC: e.EVAL_T_MRC || '', CPAX: e.CPAX_TOTAL || '',
      };
    });
    return ok({ filas: filas, total: todas.length, truncado: todas.length > LIM });
  } catch (e) { return err('datosPivot: ' + e.message, ERR.INTERNO, e); }
}
