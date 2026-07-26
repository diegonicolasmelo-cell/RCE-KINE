/**
 * svc_rem.gs — REM 28 mensual (Rehabilitación · Kinesiología UCI).
 *
 * Agrega EVOLUCIONES + EVOLUCIONES_ARCHIVO (¡los egresados también cuentan!)
 * + ARCHIVO_PACIENTES + REINTUBACIONES del mes y produce:
 *   1. La hoja REM_28 en la planilla, con las secciones del formulario oficial
 *      (A ingresos/egresos, B.2/B.3/B.4, B.6 y códigos de prestaciones) lista
 *      para transcribir/copiar.
 *   2. Un resumen de texto para revisar en pantalla (pestaña Estadísticas).
 *   3. La fila del mes en ESTADISTICAS_REM (upsert por MES, compatibilidad v1).
 *
 * Reglas acordadas con la coordinación (jul-2026):
 *  - Ingresos = pacientes con ES_INGRESO en el mes; todos con PTI (UCI cerrada).
 *  - Egresos por alta incluye traslados; fallecimiento aparte.
 *  - Eval inicial = ingreso (1/paciente). Eval intermedia = 1 por DÍA con al
 *    menos una escala formal post-ingreso (varias escalas el mismo día = 1).
 *  - Sesiones = cantidad KTR + cantidad KTM (KTM_CANT, default 1 si realizada).
 *  - B.6: Fisioterapia=EMS · Ejercicios terapéuticos=sesiones KTM ·
 *    Terapia respiratoria=KTR+IMT · Educación=EDU_REALIZADA.
 *  - Códigos: 601101/601104/601024/601030 = 1 por paciente ingresado;
 *    102501 = turnos con IMT; 1010922 PTO = 1 por paciente en su PRIMERA
 *    bipedestación (primer turno con KTM nivel 4-5 del episodio);
 *    601171 = intubaciones + reintubaciones + inicios de VMNI + cambios de cánula.
 */

const _REM_RANGOS = ['15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49',
  '50-54', '55-59', '60-64', '65-69', '70-74', '75-79', '80+'];

const _REM_DIAGS = ['ACV', 'TEC', 'LM', 'ENM agudas', 'ENM crónicas', 'Otras neurológicas',
  'Sd. Post-UCI', 'COVID-19', 'Enfermedades respiratorias', 'Enfermedades cardíacas',
  'Otras reumatológicas', 'Traumatológicos', 'Otros pre y post quirúrgicos',
  'Oncológicos', 'Genitourinarias', 'Quemados', 'Otros'];

// Escalas que cuentan como "evaluación" (B.2/B.3). La IMS y la deglución quedan
// fuera a propósito: la IMS se registra a diario con la KTM (inflaría el conteo)
// y la deglución es tamizaje, no evaluación kinesiológica formal.
const _REM_EVAL_CAMPOS = ['EVAL_T_MRC', 'EVAL_T_FSS', 'CPAX_TOTAL', 'EVAL_T_DINAMO',
  'EVAL_T_CUAD_D', 'EVAL_T_CUAD_I', 'EVAL_T_FED_D', 'EVAL_T_FED_I', 'EVAL_T_EXC_D',
  'EVAL_T_EXC_I', 'EVAL_T_PIM', 'EVAL_T_PEM', 'EVAL_T_FEM', 'EVAL_T_GROSOR', 'EVAL_T_HECKMATT'];

function _remRango(edad) {
  const e = parseInt(edad);
  if (!(e >= 15)) return '';
  if (e >= 80) return '80+';
  for (let i = 0; i < 13; i++) { const lo = 15 + i * 5; if (e <= lo + 4) return lo + '-' + (lo + 4); }
  return '80+';
}

function _remSexo(s) {
  const x = String(s || '').trim().toUpperCase().charAt(0);
  return x === 'M' ? 'H' : (x === 'F' ? 'M' : '');   // M(asculino)→H(ombre), F(emenino)→M(ujer)
}

function generarREM(anio, mes, ctx) {
  try {
    anio = String(anio || '').trim(); mes = String(mes || '').trim();
    if (!/^\d{4}$/.test(anio) || !/^\d{1,2}$/.test(mes)) return err('Indica año y mes válidos.', ERR.VALIDACION);
    const mm = mes.length === 1 ? '0' + mes : mes;
    const prefijo = anio + '-' + mm;
    const enMes = f => _statISO(f).indexOf(prefijo) === 0;

    // ── Fuentes: episodio completo (activos + archivados) ──
    const todasEvos = repoLeerTodos('EVOLUCIONES').concat(repoLeerTodos('EVOLUCIONES_ARCHIVO'));
    const evoMes = todasEvos.filter(e => enMes(e.FECHA));
    const archivo = repoLeerTodos('ARCHIVO_PACIENTES');
    const camas = repoLeerTodos('CAMAS_ESTADO');

    // Atributos por paciente (edad/sexo/diagnóstico REM): evolución → cama → archivo.
    const pacAttr = {};
    const attr = pid => (pacAttr[pid] = pacAttr[pid] || { edad: '', sexo: '', diag: '' });
    archivo.forEach(a => { if (a.PATIENT_ID) { const p = attr(String(a.PATIENT_ID)); p.edad = a.EDAD; p.sexo = _remSexo(a.SEXO); p.diag = a.DIAG_REM || p.diag; } });
    camas.forEach(c => { if (c.PATIENT_ID) { const p = attr(String(c.PATIENT_ID)); p.edad = c.EDAD; p.sexo = _remSexo(c.SEXO); p.diag = c.DIAG_REM || p.diag; } });
    todasEvos.forEach(e => {
      const p = attr(String(e.PATIENT_ID || ''));
      if (e.PAC_EDAD) p.edad = e.PAC_EDAD;
      if (e.PAC_SEXO) p.sexo = _remSexo(e.PAC_SEXO);
      if (e.PAC_DIAG_REM) p.diag = e.PAC_DIAG_REM;
    });

    // ── Sección A: ingresos del mes ──
    const ingresosPids = {};
    evoMes.forEach(e => { if (esVerdadero(e.ES_INGRESO) && e.PATIENT_ID) ingresosPids[String(e.PATIENT_ID)] = true; });
    const nIngresos = Object.keys(ingresosPids).length;

    // matriz diagnóstico × sexo × rango (+ totales)
    const cero = () => { const o = { T: 0, H: 0, M: 0 }; _REM_RANGOS.forEach(r => { o[r + 'H'] = 0; o[r + 'M'] = 0; }); return o; };
    const ingPorDiag = {}; _REM_DIAGS.forEach(d => ingPorDiag[d] = cero());
    const ingTotal = cero();
    Object.keys(ingresosPids).forEach(pid => {
      const p = pacAttr[pid] || {};
      const dg = _REM_DIAGS.indexOf(p.diag) >= 0 ? p.diag : 'Otros';
      const rg = _remRango(p.edad), sx = p.sexo;
      [ingPorDiag[dg], ingTotal].forEach(o => {
        o.T++;
        if (sx) o[sx]++;
        if (rg && sx) o[rg + sx]++;
      });
    });

    // ── Sección A: egresos del mes ──
    const egresosMes = archivo.filter(a => enMes(a.FECHA_EGRESO));
    const egAlta = cero(), egFallece = cero();
    egresosMes.forEach(a => {
      const fallece = /fallec/i.test(String(a.MOTIVO_EGRESO || ''));
      const o = fallece ? egFallece : egAlta;   // alta incluye traslados (acuerdo jul-2026)
      const rg = _remRango(a.EDAD), sx = _remSexo(a.SEXO);
      o.T++; if (sx) o[sx]++; if (rg && sx) o[rg + sx]++;
    });

    // ── B.2 eval inicial (= ingresos) y B.3 eval intermedia (1 por día evaluado) ──
    const evalIni = cero();
    Object.keys(ingresosPids).forEach(pid => {
      const p = pacAttr[pid] || {}, rg = _remRango(p.edad), sx = p.sexo;
      evalIni.T++; if (sx) evalIni[sx]++; if (rg && sx) evalIni[rg + sx]++;
    });
    // días de ingreso por paciente (para excluirlos de la intermedia)
    const diaIngreso = {};
    todasEvos.forEach(e => { if (esVerdadero(e.ES_INGRESO)) diaIngreso[String(e.PATIENT_ID) + '|' + _statISO(e.FECHA)] = true; });
    const evalInt = cero(); const diasEvaluados = {};
    evoMes.forEach(e => {
      const pid = String(e.PATIENT_ID || ''), dia = _statISO(e.FECHA), key = pid + '|' + dia;
      if (diaIngreso[key] || diasEvaluados[key]) return;
      const tiene = _REM_EVAL_CAMPOS.some(c => String(e[c] === undefined ? '' : e[c]).trim() !== '');
      if (!tiene) return;
      diasEvaluados[key] = true;
      const p = pacAttr[pid] || {}, rg = _remRango(p.edad), sx = p.sexo;
      evalInt.T++; if (sx) evalInt[sx]++; if (rg && sx) evalInt[rg + sx]++;
    });

    // ── B.4 sesiones (KTR cantidad + KTM cantidad) y B.6 procedimientos ──
    const sesiones = cero();
    let sumKTR = 0, sumKTM = 0, turnosIMT = 0, turnosEMS = 0, turnosEdu = 0;
    let turnosVM = 0, turnosKTM = 0, turnosKTMC = 0;
    const pacIMT = {}, pacSes = {};
    evoMes.forEach(e => {
      const pid = String(e.PATIENT_ID || '');
      const ktr = Math.max(0, parseInt(e.RESP_KTR_CANT) || 0);
      const ktm = esVerdadero(e.KTM_REALIZADA) ? Math.min(9, Math.max(1, parseInt(e.KTM_CANT) || 1)) : 0;
      if (e.VENT_SOPORTE === 'VM') turnosVM++;
      if (esVerdadero(e.KTM_REALIZADA)) turnosKTM++;
      if (esVerdadero(e.KTM_SUSPENDIDA)) turnosKTMC++;
      if (esVerdadero(e.KTM_IMT)) { turnosIMT++; pacIMT[pid] = true; }
      if (esVerdadero(e.KTM_EMS)) turnosEMS++;
      if (esVerdadero(e.EDU_REALIZADA)) turnosEdu++;
      sumKTR += ktr; sumKTM += ktm;
      const n = ktr + ktm;
      if (n > 0) {
        pacSes[pid] = true;
        const p = pacAttr[pid] || {}, rg = _remRango(p.edad), sx = p.sexo;
        sesiones.T += n; if (sx) sesiones[sx] += n; if (rg && sx) sesiones[rg + sx] += n;
      }
    });

    // ── Códigos: PTO (primera bipedestación del episodio dentro del mes) ──
    const primeraBip = {};   // pid → fecha ISO de su primer turno KTM nivel 4-5
    todasEvos.forEach(e => {
      if (!esVerdadero(e.KTM_REALIZADA) || !(parseInt(e.KTM_NIVEL_KTR) >= 4)) return;
      const pid = String(e.PATIENT_ID || ''), f = _statISO(e.FECHA);
      if (!primeraBip[pid] || f < primeraBip[pid]) primeraBip[pid] = f;
    });
    const nPTO = Object.keys(primeraBip).filter(pid => primeraBip[pid].indexOf(prefijo) === 0).length;

    // ── Códigos: 601171 asistencias de vía aérea ──
    const nIntub = evoMes.filter(e => esVerdadero(e.INTUB_OCURRIO)).length;
    const nReintub = repoLeerTodos('REINTUBACIONES').filter(r => enMes(r.FECHA)).length;
    const nCanula = evoMes.filter(e => esVerdadero(e.TQT_CAMBIO)).length;
    // inicios de VMNI: turno VMNI cuyo turno previo del episodio no era VMNI
    let nVMNIini = 0;
    const porPac = {};
    todasEvos.forEach(e => { const pid = String(e.PATIENT_ID || ''); (porPac[pid] = porPac[pid] || []).push(e); });
    Object.keys(porPac).forEach(pid => {
      const evs = porPac[pid].slice().sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));
      let prev = '';
      evs.forEach(e => {
        const sop = String(e.VENT_SOPORTE || '');
        if (sop === 'VMNI' && prev !== 'VMNI' && enMes(e.FECHA)) nVMNIini++;
        prev = sop;
      });
    });
    const nAsistVA = nIntub + nReintub + nVMNIini + nCanula;

    // ── Escribir la hoja REM_28 ──
    const nombreMes = new Date(parseInt(anio), parseInt(mm) - 1, 1)
      .toLocaleString('es-CL', { month: 'long', year: 'numeric' });
    // ── Copia EXACTA del formulario oficial (svc_rem_plantilla.gs) ──
    // La plantilla reproduce el REM 28 de estadística celda a celda (filas 24-190,
    // columnas A-AK): textos, colores, negritas, combinadas y anchos, incluidas las
    // casillas que quedan en 0. Aquí solo se escriben los valores del mes en las
    // posiciones de _REM_POS.
    const M = _REM_TPL_VALS.map(f => f.slice());
    const F0 = _REM_TPL_FILA0;
    const setC = (fila, col, val) => { M[fila - F0][col - 1] = val; };

    // Sección A: D=Ambos, E=H, F=M, G..AH=rangos 15-19…80+ (H/M), AJ=Cerrado (UCI).
    const filaA = (fila, o) => {
      setC(fila, 4, o.T); setC(fila, 5, o.H); setC(fila, 6, o.M);
      _REM_RANGOS.forEach((r, i) => { setC(fila, 7 + i * 2, o[r + 'H']); setC(fila, 8 + i * 2, o[r + 'M']); });
      setC(fila, 36, o.T);
    };
    filaA(_REM_POS.totalIng, ingTotal);
    filaA(_REM_POS.pti, ingTotal);   // atención cerrada: todos los ingresos con PTI
    Object.keys(_REM_POS.diag).forEach(d => filaA(_REM_POS.diag[d], ingPorDiag[d]));
    filaA(_REM_POS.egAlta, egAlta);
    filaA(_REM_POS.egFallece, egFallece);

    // Secciones B.2/B.3/B.4: D=total, rangos 0-4…80+ en E..U (15-19 parte en col H=8),
    // tipo de atención UPC en col Y=25. La fila TOTAL repite a Kinesiología (somos
    // el único profesional que registra en esta plataforma).
    const filaB = (fila, o) => {
      setC(fila, 4, o.T);
      _REM_RANGOS.forEach((r, i) => setC(fila, 8 + i, o[r + 'H'] + o[r + 'M']));
      setC(fila, 25, o.T);
    };
    filaB(_REM_POS.b2Kine, evalIni); filaB(_REM_POS.b2Total, evalIni);
    filaB(_REM_POS.b3Kine, evalInt); filaB(_REM_POS.b3Total, evalInt);
    filaB(_REM_POS.b4Kine, sesiones); filaB(_REM_POS.b4Total, sesiones);

    // B.6 (columna D).
    setC(_REM_POS.b6Fisio, 4, turnosEMS);
    setC(_REM_POS.b6Ejerc, 4, sumKTM);
    setC(_REM_POS.b6Educ, 4, turnosEdu);
    setC(_REM_POS.b6Resp, 4, sumKTR + turnosIMT);
    setC(_REM_POS.b6Total, 4, turnosEMS + sumKTM + turnosEdu + sumKTR + turnosIMT);

    // Códigos: patrón del original → E=actividades, F=G=beneficiarios (MAI),
    // J=atención cerrada=actividades; H/I/K/L quedan en 0 como en el formulario.
    const filaCod = (cod, actividades, beneficiarios) => {
      const fila = _REM_POS.cod[cod];
      setC(fila, 5, actividades); setC(fila, 6, beneficiarios);
      setC(fila, 7, beneficiarios); setC(fila, 10, actividades);
    };
    filaCod('601101', nIngresos, nIngresos);
    filaCod('601104', nIngresos, nIngresos);
    filaCod('601024', nIngresos, nIngresos);
    filaCod('601030', nIngresos, nIngresos);
    filaCod('102501', turnosIMT, Object.keys(pacIMT).length);
    filaCod('1010922', nPTO, nPTO);
    filaCod('601171', nAsistVA, nAsistVA);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let hoja = ss.getSheetByName('REM_28');
    if (!hoja) hoja = ss.insertSheet('REM_28');
    hoja.clear();
    hoja.getRange(1, 1, hoja.getMaxRows(), hoja.getMaxColumns()).breakApart();
    if (hoja.getMaxColumns() < _REM_TPL_NCOLS) hoja.insertColumnsAfter(hoja.getMaxColumns(), _REM_TPL_NCOLS - hoja.getMaxColumns());
    const filaFin = F0 + M.length - 1;
    if (hoja.getMaxRows() < filaFin) hoja.insertRowsAfter(hoja.getMaxRows(), filaFin - hoja.getMaxRows());

    hoja.getRange(F0, 1, M.length, _REM_TPL_NCOLS).setValues(M);
    const fondos = _REM_TPL_FONDOS.map(s => s.split('').map(ch => _REM_TPL_PALETA[parseInt(ch, 16)] || null));
    hoja.getRange(F0, 1, M.length, _REM_TPL_NCOLS).setBackgrounds(fondos);
    const pesos = _REM_TPL_NEGRITAS.map(s => s.split('').map(b => b === '1' ? 'bold' : 'normal'));
    hoja.getRange(F0, 1, M.length, _REM_TPL_NCOLS).setFontWeights(pesos);
    _REM_TPL_MERGES.forEach(a1 => { try { hoja.getRange(a1).merge(); } catch (ig) {} });
    _REM_TPL_ANCHOS.forEach((w, i) => hoja.setColumnWidth(i + 1, w));
    hoja.setFrozenRows(0);

    // Cabecera informativa en la zona libre (filas 1-2, vacías también en el original).
    hoja.getRange(1, 1).setValue('REM 28 · KINESIOLOGÍA UCI · ' + nombreMes.toUpperCase()).setFontWeight('bold');
    hoja.getRange(2, 1).setValue('Generado ' + ahoraTS() + ' · copia del formulario oficial; las casillas sin actividad quedan en 0.');

    // ── Resumen de pantalla ──
    const L = [];
    L.push('REM 28 · ' + nombreMes.toUpperCase());
    L.push('════════════════════════════════════════');
    L.push('Ingresos (todos con PTI):        ' + nIngresos + '  (H ' + ingTotal.H + ' · M ' + ingTotal.M + ')');
    L.push('Egresos por alta:                ' + egAlta.T + '   · fallecimiento: ' + egFallece.T);
    L.push('B.2 Eval. inicial (kine):        ' + evalIni.T);
    L.push('B.3 Eval. intermedia (días):     ' + evalInt.T);
    L.push('B.4 Sesiones (KTR+KTM):          ' + sesiones.T + '  (KTR ' + sumKTR + ' + KTM ' + sumKTM + ')');
    L.push('B.6 Fisioterapia (EMS):          ' + turnosEMS);
    L.push('B.6 Ejercicios terapéuticos:     ' + sumKTM);
    L.push('B.6 Educación usuario/cuidador:  ' + turnosEdu);
    L.push('B.6 Terapia respiratoria:        ' + (sumKTR + turnosIMT) + '  (KTR ' + sumKTR + ' + IMT ' + turnosIMT + ')');
    L.push('102501 Reeducación tos (IMT):    ' + turnosIMT);
    L.push('1010922 PTO (1ª bipedestación):  ' + nPTO);
    L.push('601171 Asistencias vía aérea:    ' + nAsistVA + '  (' + nIntub + ' IOT · ' + nReintub + ' reintub · ' + nVMNIini + ' VMNI · ' + nCanula + ' cánula)');
    L.push('');
    L.push('✅ Hoja «REM_28» actualizada en la planilla con el detalle por sexo, edad y diagnóstico.');
    const textoREM = L.join('\n');

    // ── Compatibilidad: fila mensual en ESTADISTICAS_REM ──
    const diagRemCount = {}; _REM_DIAGS.forEach(d => { if (ingPorDiag[d].T) diagRemCount[d] = ingPorDiag[d].T; });
    repoUpsert('ESTADISTICAS_REM', 'MES', prefijo, {
      MES: prefijo, INGRESOS: nIngresos, DIAS_CAMA: evoMes.length,
      TURNOS_VM: turnosVM, TURNOS_KTM: turnosKTM, TURNOS_KTMC: turnosKTMC,
      SUM_KTR: sumKTR, KTR_PROM: evoMes.length ? Math.round((sumKTR / evoMes.length) * 100) / 100 : 0,
      DIAG_JSON: JSON.stringify(diagRemCount), TEXTO_REM: textoREM,
      GENERADO_TS: ahoraTS(), GENERADO_POR: (ctx && ctx.email) || '',
    });

    return ok({
      mesKey: prefijo, textoREM: textoREM, hoja: 'REM_28',
      ingresos: nIngresos, egresosAlta: egAlta.T, egresosFallecimiento: egFallece.T,
      evalInicial: evalIni.T, evalIntermedia: evalInt.T, sesiones: sesiones.T,
      sumKTR: sumKTR, sumKTM: sumKTM, turnosIMT: turnosIMT, turnosEMS: turnosEMS,
      turnosEdu: turnosEdu, pto: nPTO, asistenciasVA: nAsistVA,
    });
  } catch (e) { return err('generarREM: ' + e.message, ERR.INTERNO, e); }
}
