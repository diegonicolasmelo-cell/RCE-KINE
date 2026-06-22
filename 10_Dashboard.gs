/**
 * ============================================================
 *  10_Dashboard.gs — Agregación de estadísticas para el panel
 *  ------------------------------------------------------------
 *  Una sola función pública: obtenerEstadisticas(desde, hasta)
 *  Lee EVOLUCIONES, PROCEDIMIENTOS, ARCHIVO_PACIENTES, CAMAS_ESTADO
 *  y TIMELINE en bloque y devuelve un objeto listo para graficar.
 *
 *  Reglas de población (acordadas con el usuario):
 *   • Actividad (extubaciones, prono/supino, KTM, sedación) → todos
 *     los turnos/eventos con FECHA dentro del rango.
 *   • Outcome (estadía, días VM/VA, Barthel/MRC egreso) → solo
 *     pacientes EGRESADOS (ARCHIVO) con FECHA_EGRESO en rango.
 *   • Demografía / patologías → censo de pacientes únicos (por RUT)
 *     con al menos una evolución dentro del rango (activos + egresados).
 * ============================================================
 */

// ── Helpers de fecha ───────────────────────────────────────
function _isoDe(val) {
  // Normaliza un valor de celda (Date o string) a "YYYY-MM-DD".
  if (val === null || val === undefined || val === '') return '';
  if (Object.prototype.toString.call(val) === '[object Date]') {
    // Misma zona horaria que el resto de la app (_fechaAISO / fechaHoyISO)
    return Utilities.formatDate(val, 'America/Santiago', 'yyyy-MM-dd');
  }
  const s = String(val).trim();
  // Ya viene ISO (posible con hora) → recorta a 10
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s;
}
function _enRango(iso, desde, hasta) {
  if (!iso) return false;
  return iso >= desde && iso <= hasta;
}
function _num(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }
function _esTrue(v) { return v === true || v === 'TRUE' || v === 'true' || v === 1; }

// ── Normaliza nombre de procedimiento/evento para conteo ───
function _normProc(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // sin acentos
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string} desde  "YYYY-MM-DD"
 * @param {string} hasta  "YYYY-MM-DD" (inclusive)
 */
function obtenerEstadisticas(desde, hasta) {
  try {
    desde = _isoDe(desde); hasta = _isoDe(hasta);
    if (!desde || !hasta) return err('Rango de fechas inválido.');

    // ════════ 1. EVOLUCIONES ════════
    const hE = obtenerHoja(SH.EVOLUCIONES);
    const ultE = hE.getLastRow();
    const evos = (ultE >= EVO_FILA_DATOS)
      ? hE.getRange(EVO_FILA_DATOS, 1, ultE - EVO_FILA_DATOS + 1, EVO_TOTAL_COLS).getValues()
      : [];

    // ════════ 2. PROCEDIMIENTOS ════════
    const hP = obtenerHoja(SH.PROCEDIMIENTOS);
    const ultP = hP.getLastRow();
    const procs = (ultP >= PROC_FILA_DATOS)
      ? hP.getRange(PROC_FILA_DATOS, 1, ultP - PROC_FILA_DATOS + 1, 9).getValues()
      : [];

    // ════════ 3. ARCHIVO ════════
    const hA = obtenerHoja(SH.ARCHIVO);
    const ultA = hA.getLastRow();
    const arch = (ultA >= ARCH_FILA_DATOS)
      ? hA.getRange(ARCH_FILA_DATOS, 1, ultA - ARCH_FILA_DATOS + 1, 28).getValues()
      : [];

    // ════════ 4. TIMELINE ════════
    const hT = obtenerHoja(SH.TIMELINE);
    const ultT = hT.getLastRow();
    const tl = (ultT >= TL_FILA_DATOS)
      ? hT.getRange(TL_FILA_DATOS, 1, ultT - TL_FILA_DATOS + 1, 8).getValues()
      : [];

    // ════════ 5. CAMAS (activos) ════════
    const hC = obtenerHoja(SH.CAMAS);
    const ultC = hC.getLastRow();
    const camas = (ultC >= CAM_FILA_DATOS)
      ? hC.getRange(CAM_FILA_DATOS, 1, ultC - CAM_FILA_DATOS + 1, CAM_TOTAL_COLS).getValues()
      : [];

    // índices de columna (0-based)
    const E = k => COL_EVO[k] - 1;
    const P = k => COL_PROC[k] - 1;
    const A = k => COL_ARCH[k] - 1;
    const T = k => COL_TL[k] - 1;
    const C = k => COL_CAM[k] - 1;

    // ─────────────────────────────────────────────────────
    //  A) EXTUBACIONES / VÍA AÉREA / POSICIÓN  (PROCEDIMIENTOS)
    // ─────────────────────────────────────────────────────
    const viaAerea = {
      'EXTUBACION C/PROTOCOLO': 0, 'EXTUBACION S/PROTOCOLO': 0,
      'AUTOEXTUBACION': 0, 'EXTUBACION ACCIDENTAL': 0,
      'REINTUBACION': 0, 'DECANULACION': 0,
      'DESVINCULACION': 0, 'PVE': 0, 'INTUBACION': 0,
      'TQT': 0, 'CAMBIO TQT': 0, 'CAMBIO TOT': 0
    };
    let pronoN = 0, supinoN = 0;
    const pronoPac = {}; // RUT/cama → veces pronado

    procs.forEach(r => {
      const iso = _isoDe(r[P('FECHA')]);
      if (!_enRango(iso, desde, hasta)) return;
      const nom = _normProc(r[P('NOMBRE_PROC')]);
      if (viaAerea.hasOwnProperty(nom)) viaAerea[nom]++;
      if (nom === 'PRONO')  { pronoN++; const k = String(r[P('ID_CAMA')]); pronoPac[k] = (pronoPac[k]||0)+1; }
      if (nom === 'SUPINO') supinoN++;
    });

    // Totales agrupados de extubación
    const extubExitosas = viaAerea['EXTUBACION C/PROTOCOLO'] + viaAerea['EXTUBACION S/PROTOCOLO'];
    const extubTotales  = extubExitosas + viaAerea['AUTOEXTUBACION'] + viaAerea['EXTUBACION ACCIDENTAL'];
    const tasaReintub   = extubTotales > 0 ? Math.round((viaAerea['REINTUBACION'] / extubTotales) * 1000) / 10 : 0;
    const tasaProtocolo = extubExitosas > 0 ? Math.round((viaAerea['EXTUBACION C/PROTOCOLO'] / extubExitosas) * 1000) / 10 : 0;

    // ─────────────────────────────────────────────────────
    //  B) KTM POR NIVEL  (EVOLUCIONES)
    // ─────────────────────────────────────────────────────
    const ktmNivel = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    let ktmContra = 0, ktmSusp = 0, ktmTotal = 0, ktmMinutos = 0, ktmMinCount = 0;

    // ─────────────────────────────────────────────────────
    //  C) SEDACIÓN  (serie por turno) + censo de pacientes
    // ─────────────────────────────────────────────────────
    const sasDist = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0 };
    const sedTipoDist = {};
    // para suspensión de sedación: agrupar evoluciones por paciente (RUT)
    const porPac = {}; // rut → [{iso, dia, sed}]
    const censo = {};  // rut → {edad, sexo, diag, diagRem, nombre}

    evos.forEach(r => {
      const iso = _isoDe(r[E('FECHA')]) || String(r[E('TURNO_KEY')]).slice(0, 10);
      if (!_enRango(iso, desde, hasta)) return;

      // KTM
      const niv = String(r[E('KTM_NIVEL_KTR')] || '').trim();
      if (ktmNivel.hasOwnProperty(niv)) { ktmNivel[niv]++; ktmTotal++; }
      if (_esTrue(r[E('KTM_SUSPENDIDA')])) ktmSusp++;
      if (r[E('KTM_CONTRA_TIPO')] && String(r[E('KTM_CONTRA_TIPO')]).trim()) ktmContra++;
      const mn = _num(r[E('KTM_TIEMPO_MIN')]);
      if (mn !== null && mn > 0) { ktmMinutos += mn; ktmMinCount++; }

      // SAS
      const sas = String(r[E('SED_SAS')] || '').trim();
      if (sasDist.hasOwnProperty(sas)) sasDist[sas]++;

      // tipo de sedación
      const st = String(r[E('SED_TIPO')] || '').trim();
      if (st) sedTipoDist[st] = (sedTipoDist[st] || 0) + 1;

      // censo por RUT
      const rut = String(r[E('PAC_RUT')] || '').trim() || ('cama_' + r[E('ID_CAMA')]);
      if (!censo[rut]) censo[rut] = {
        edad: _num(r[E('PAC_EDAD')]),
        sexo: String(r[E('PAC_SEXO')] || '').trim(),
        diag: String(r[E('PAC_DIAGNOSTICO')] || '').trim(),
        diagRem: String(r[E('PAC_DIAG_REM')] || '').trim(),
        nombre: String(r[E('PAC_NOMBRE')] || '').trim()
      };

      // serie por paciente para suspensión de sedación
      (porPac[rut] = porPac[rut] || []).push({
        iso, dia: _num(r[E('DIA_ESTADIA')]), sed: st
      });
    });

    // Día de suspensión de sedación: primer turno "Sin sedación" tras estar sedado
    const SEDADO = s => s && /superficial|moderada|profunda|fuera/i.test(s);
    const diasSuspension = [];
    Object.keys(porPac).forEach(rut => {
      const serie = porPac[rut].slice().sort((a, b) => (a.iso < b.iso ? -1 : 1));
      let estuvoSedado = false;
      for (const t of serie) {
        if (SEDADO(t.sed)) estuvoSedado = true;
        else if (estuvoSedado && /sin sedaci/i.test(t.sed) && t.dia !== null) {
          diasSuspension.push(t.dia);
          break;
        }
      }
    });
    const diaSuspProm = diasSuspension.length
      ? Math.round((diasSuspension.reduce((a, b) => a + b, 0) / diasSuspension.length) * 10) / 10 : null;

    // ─────────────────────────────────────────────────────
    //  D) DEMOGRAFÍA / PATOLOGÍAS (censo)
    // ─────────────────────────────────────────────────────
    const edadBuckets = { '≤39': 0, '40-54': 0, '55-69': 0, '70-79': 0, '≥80': 0 };
    let sexoM = 0, sexoF = 0, sexoOtro = 0, edadSum = 0, edadCount = 0;
    const patologias = {};
    Object.values(censo).forEach(p => {
      if (p.edad !== null) {
        edadSum += p.edad; edadCount++;
        if (p.edad <= 39) edadBuckets['≤39']++;
        else if (p.edad <= 54) edadBuckets['40-54']++;
        else if (p.edad <= 69) edadBuckets['55-69']++;
        else if (p.edad <= 79) edadBuckets['70-79']++;
        else edadBuckets['≥80']++;
      }
      const sx = p.sexo.toUpperCase();
      if (sx.startsWith('M') || sx.startsWith('H')) sexoM++;
      else if (sx.startsWith('F')) sexoF++;
      else if (sx) sexoOtro++;

      const pat = (p.diagRem || p.diag || '').trim();
      if (pat) patologias[pat] = (patologias[pat] || 0) + 1;
    });
    const edadProm = edadCount ? Math.round((edadSum / edadCount) * 10) / 10 : null;
    const topPatologias = Object.keys(patologias)
      .map(k => ({ nombre: k, n: patologias[k] }))
      .sort((a, b) => b.n - a.n).slice(0, 8);

    // ─────────────────────────────────────────────────────
    //  E) OUTCOME — EGRESADOS en rango (ARCHIVO)
    // ─────────────────────────────────────────────────────
    let nEgr = 0, sumDias = 0, sumVM = 0, sumVA = 0;
    let sumBarthIng = 0, nBarthIng = 0, sumBarthEgr = 0, nBarthEgr = 0;
    let sumMrc = 0, nMrc = 0, sumFss = 0, nFss = 0;
    let egrReintub = 0, egrExtubOk = 0;
    const motivos = {};
    arch.forEach(r => {
      const iso = _isoDe(r[A('FECHA_EGRESO')]);
      if (!_enRango(iso, desde, hasta)) return;
      nEgr++;
      const dt = _num(r[A('DIAS_TOTAL')]);    if (dt !== null) sumDias += dt;
      const dvm = _num(r[A('DIAS_VM_TOTAL')]); if (dvm !== null) sumVM += dvm;
      const dva = _num(r[A('DIAS_VA_TOTAL')]); if (dva !== null) sumVA += dva;
      const bi = _num(r[A('BARTHEL_INGRESO')]); if (bi !== null) { sumBarthIng += bi; nBarthIng++; }
      const be = _num(r[A('BARTHEL_EGRESO')]);  if (be !== null) { sumBarthEgr += be; nBarthEgr++; }
      const mr = _num(r[A('MRC_SS_EGRESO')]);    if (mr !== null) { sumMrc += mr; nMrc++; }
      const fs = _num(r[A('FSS_EGRESO')]);       if (fs !== null) { sumFss += fs; nFss++; }
      if (_esTrue(r[A('REINTUBACION')])) egrReintub++;
      if (_esTrue(r[A('EXTUBACION_OK')])) egrExtubOk++;
      const mot = String(r[A('MOTIVO_EGRESO')] || '').trim();
      if (mot) motivos[mot] = (motivos[mot] || 0) + 1;
    });
    const prom = (s, n) => n ? Math.round((s / n) * 10) / 10 : null;

    // ─────────────────────────────────────────────────────
    //  F) HITOS MOTORES (TIMELINE)
    // ─────────────────────────────────────────────────────
    const hitos = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    tl.forEach(r => {
      const iso = _isoDe(r[T('FECHA')]);
      if (!_enRango(iso, desde, hasta)) return;
      const txt = _normProc(r[T('TEXTO')]);
      const m = txt.match(/HITO MOTOR\s*([1-5])/);
      if (m) hitos[m[1]]++;
    });

    // ─────────────────────────────────────────────────────
    //  G) CENSO Y ACTIVIDAD GLOBAL
    // ─────────────────────────────────────────────────────
    const activosAhora = camas.filter(r => _esTrue(r[C('OCUPADA')])).length;
    const pacientesRango = Object.keys(censo).length;

    return ok({
      meta: { desde, hasta, generado: new Date().toISOString() },
      resumen: {
        pacientesRango,
        activosAhora,
        egresados: nEgr,
        turnosRegistrados: evos.filter(r => {
          const iso = _isoDe(r[E('FECHA')]) || String(r[E('TURNO_KEY')]).slice(0, 10);
          return _enRango(iso, desde, hasta);
        }).length
      },
      viaAerea: {
        detalle: viaAerea,
        extubExitosas, extubTotales,
        reintubaciones: viaAerea['REINTUBACION'],
        autoextubaciones: viaAerea['AUTOEXTUBACION'],
        accidentales: viaAerea['EXTUBACION ACCIDENTAL'],
        tasaReintub, tasaProtocolo
      },
      posicion: { prono: pronoN, supino: supinoN, pacientesPronados: Object.keys(pronoPac).length },
      ktm: {
        nivel: ktmNivel, total: ktmTotal,
        contraindicadas: ktmContra, suspendidas: ktmSusp,
        minutosProm: ktmMinCount ? Math.round((ktmMinutos / ktmMinCount) * 10) / 10 : null,
        nivel3: ktmNivel['3']
      },
      sedacion: {
        sasDist, tipoDist: sedTipoDist,
        diaSuspProm, nSuspensiones: diasSuspension.length,
        diasSuspension
      },
      demografia: {
        edadProm, edadBuckets,
        sexo: { M: sexoM, F: sexoF, otro: sexoOtro },
        pacientes: pacientesRango
      },
      patologias: topPatologias,
      outcome: {
        n: nEgr,
        estadiaProm: prom(sumDias, nEgr),
        diasVMProm: prom(sumVM, nEgr),
        diasVAProm: prom(sumVA, nEgr),
        barthelIngProm: prom(sumBarthIng, nBarthIng),
        barthelEgrProm: prom(sumBarthEgr, nBarthEgr),
        mrcEgrProm: prom(sumMrc, nMrc),
        fssEgrProm: prom(sumFss, nFss),
        reintubaciones: egrReintub,
        extubacionesOk: egrExtubOk,
        motivos
      },
      hitos
    });
  } catch (e) {
    return err('obtenerEstadisticas: ' + e.message, e);
  }
}

/**
 * ============================================================
 *  Días ventilatorios HISTÓRICOS por cama (acumulado del ingreso
 *  actual). Cuenta DÍAS DISTINTOS con VM y con VNI a partir de las
 *  evoluciones, hasta la fecha indicada (retrospectivo-correcto).
 *
 *  Alimenta las columnas D.VM y D.VNI de la tabla de Pacientes con
 *  el total histórico (no solo el episodio actual).
 *
 *  @param {string} fechaHasta  "YYYY-MM-DD" (inclusive). Por defecto hoy.
 *  @returns ok({ '1': {vm: 6, vni: 2}, '2': {...}, ... })
 * ============================================================
 */
function obtenerDiasVentilatorios(fechaHasta) {
  try {
    const hasta = _isoDe(fechaHasta) || fechaHoyISO();

    // Fecha de ingreso del paciente ACTUAL por cama (para no mezclar
    // estadías de pacientes distintos en la misma cama).
    const hC = obtenerHoja(SH.CAMAS);
    const camas = leerHojaObjetos(hC, COL_CAM, CAM_TOTAL_COLS, CAM_FILA_DATOS);
    const ingPorCama = {};
    camas.forEach(c => { ingPorCama[String(c.ID_CAMA)] = _isoDe(c.FECHA_INGRESO); });

    // ★ OPT v1.1: 1 sola lectura de bloque contiguo (cols ID_CAMA→VENT_SOPORTE)
    // en vez de 3 getRange() separados — ahorra ~300-600ms por llamada.
    // Leemos cols ID_CAMA(2) a VENT_SOPORTE(45): 44 columnas en 1 viaje de red.
    const hE = obtenerHoja(SH.EVOLUCIONES);
    const ult = hE.getLastRow();
    if (ult < EVO_FILA_DATOS) return ok({});
    const n = ult - EVO_FILA_DATOS + 1;
    const blk = hE.getRange(EVO_FILA_DATOS, COL_EVO.ID_CAMA, n,
                              COL_EVO.VENT_SOPORTE - COL_EVO.ID_CAMA + 1).getValues();
    const O_FECHA = COL_EVO.FECHA        - COL_EVO.ID_CAMA; // offset 0-based dentro del bloque
    const O_SOP   = COL_EVO.VENT_SOPORTE - COL_EVO.ID_CAMA;

    const acc = {}; // idCama → { vm:{fecha:1}, vni:{fecha:1} }
    for (let i = 0; i < n; i++) {
      const id = String(blk[i][0] || '').trim();
      if (!id) continue;
      const iso = _isoDe(blk[i][O_FECHA]);
      if (!iso || iso > hasta) continue;
      const ing = ingPorCama[id];
      if (ing && iso < ing) continue; // evolución de un ingreso anterior
      const sop = String(blk[i][O_SOP] || '').trim();
      if (sop !== 'VM' && sop !== 'VNI') continue;
      const a = acc[id] || (acc[id] = { vm: {}, vni: {} });
      if (sop === 'VM') a.vm[iso] = 1; else a.vni[iso] = 1;
    }

    const out = {};
    Object.keys(acc).forEach(id => {
      out[id] = { vm: Object.keys(acc[id].vm).length, vni: Object.keys(acc[id].vni).length };
    });
    return ok(out);
  } catch (e) {
    return err('obtenerDiasVentilatorios: ' + e.message, e);
  }
}
