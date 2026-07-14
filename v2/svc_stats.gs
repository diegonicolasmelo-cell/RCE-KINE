/**
 * svc_stats.gs — Estadísticas del período para el dashboard.
 * Agrega EVOLUCIONES + REINTUBACIONES + ARCHIVO_PACIENTES entre dos fechas
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

function obtenerStats(desde, hasta) {
  desde = _statISO(desde); hasta = _statISO(hasta);
  if (!desde || !hasta) return err('Faltan fechas desde/hasta.', ERR.VALIDACION);
  if (desde > hasta) { const t = desde; desde = hasta; hasta = t; }

  const tally = (obj, k) => { k = String(k || '').trim(); if (!k) return; obj[k] = (obj[k] || 0) + 1; };
  const r1 = x => Math.round(x * 10) / 10;

  // ── EVOLUCIONES del rango ──
  const evos = repoLeerTodos('EVOLUCIONES').filter(e => {
    const f = _statISO(e.FECHA); return f && f >= desde && f <= hasta;
  });

  const pacientes = {};   // PATIENT_ID → { rem, vm }
  const vmDiasSet = {};   // 'pid|fecha' → true (días-paciente en VM)
  const mrcUlt = {};      // PATIENT_ID → { val, key }  MRC-SS más reciente del rango (DAUCI en vivo)
  let dia = 0, noche = 0, ingresos = 0, turnosVM = 0;
  let intub = 0, ext = 0, extProg = 0, autoext = 0, pveSi = 0, pveSup = 0, pveFrus = 0;
  let decan = 0, recanul = 0, cambiosTOT = 0;
  let ktmR = 0, ktmC = 0, ktmN = 0, ktrSes = 0, imtSes = 0, ktmTiempo = 0, ktmTiempoN = 0;
  const ktmNiveles = {}, ktmMotivosNo = {}, procs = {}, catResp = {}, catMotor = {};
  // Puntaje SOCHIMI → nivel de complejidad (n variables: Baja=n, Media n+1..2n, Alta >2n)
  const catNivel = (p, n) => p <= n ? 'Baja' : (p <= n * 2 ? 'Media' : 'Alta');

  evos.forEach(e => {
    const pid = String(e.PATIENT_ID || e.COD_PACIENTE || 'sin-id');
    const f = _statISO(e.FECHA);
    if (!pacientes[pid]) pacientes[pid] = { rem: '', vm: false };
    if (e.PAC_DIAG_REM) pacientes[pid].rem = e.PAC_DIAG_REM;

    if (String(e.TURNO) === 'Noche') noche++; else dia++;
    if (esVerdadero(e.ES_INGRESO)) ingresos++;

    // MRC-SS más reciente por paciente → DAUCI "en vivo" (no espera al egreso)
    const _mrc = parseFloat(e.EVAL_T_MRC);
    if (!isNaN(_mrc) && _mrc > 0) {
      const kk = String(e.TURNO_KEY || (f + '-' + e.TURNO));
      if (!mrcUlt[pid] || kk > mrcUlt[pid].key) mrcUlt[pid] = { val: _mrc, key: kk };
    }
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
    if (esVerdadero(e.DECAN_OCURRIO)) decan++;
    if (esVerdadero(e.DECAN_RECANUL)) recanul++;
    if (esVerdadero(e.TOT_CAMBIO)) cambiosTOT++;

    // Terapia física
    if (esVerdadero(e.KTM_REALIZADA)) {
      ktmR++;
      tally(ktmNiveles, e.KTM_NIVEL_KTR ? 'Nivel ' + e.KTM_NIVEL_KTR : '');
      const t = parseFloat(e.KTM_TIEMPO_MIN); if (t > 0) { ktmTiempo += t; ktmTiempoN++; }
    } else if (esVerdadero(e.KTM_SUSPENDIDA)) {
      ktmC++; tally(ktmMotivosNo, e.KTM_CONTRA_RAZON || e.KTM_CONTRA_CAT || 'Contraindicada');
    } else if (esVerdadero(e.KTM_NO_REALIZADA)) {
      ktmN++; tally(ktmMotivosNo, e.KTM_NO_RAZON || 'Sin motivo registrado');
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

  // ── DAUCI "en vivo": pacientes evaluados en el rango cuya última MRC-SS
  //    indica debilidad (no espera al egreso). Usa los mismos cortes que el egreso. ──
  const cDauci = parseFloat(leerConfig('CORTE_MRC_DAUCI', '48')) || 48;
  const cSev = parseFloat(leerConfig('CORTE_MRC_SEVERA', '36')) || 36;
  let mrcEval = 0, mrcDauci = 0, mrcSev = 0;
  Object.keys(mrcUlt).forEach(pid => {
    mrcEval++;
    const val = mrcUlt[pid].val;
    if (val < cDauci) mrcDauci++;
    if (val < cSev) mrcSev++;
  });

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
    ktm: {
      realizada: ktmR, contraindicada: ktmC, noRealizada: ktmN,
      realizadaPct: (ktmR + ktmC + ktmN) > 0 ? r1(ktmR / (ktmR + ktmC + ktmN) * 100) : 0,
      niveles: ktmNiveles, motivosNo: ktmMotivosNo,
      tiempoPromMin: ktmTiempoN > 0 ? r1(ktmTiempo / ktmTiempoN) : 0,
      ktrSesiones: ktrSes, imtSesiones: imtSes,
    },
    procs: procs, rem: rem, catResp: catResp, catMotor: catMotor,
    dauciEval: {
      evaluados: mrcEval, dauci: mrcDauci, severa: mrcSev,
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
