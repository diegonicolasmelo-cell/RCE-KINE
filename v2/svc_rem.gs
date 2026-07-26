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

function _remColLetra(n) {
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
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
    // Colores tomados del formulario original de estadística (REM.xlsx):
    // crema FFFFCC datos · amarillo FFF2CC cabeceras · FFE599 etiquetas/totales ·
    // gris D9D9D9 códigos · celeste DDEBF7 valores de códigos · CCFFFF su cabecera ·
    // azules 2F5496 / B4C6E7 para títulos.
    const filas = [], tags = [];
    const anchoA = 4 + _REM_RANGOS.length * 2;
    const pad = arr => { const f = arr.slice(); while (f.length < anchoA) f.push(''); return f; };
    const add = (arr, tag) => { filas.push(pad(arr)); tags.push(tag); };
    const filaMatriz = (lbl, o, tag) => add([lbl, o.T, o.H, o.M].concat(_REM_RANGOS.reduce((acc, r) => acc.concat([o[r + 'H'], o[r + 'M']]), [])), tag || 'dato');
    const cabMatriz = lbl => add([lbl, 'Total', 'H', 'M'].concat(_REM_RANGOS.reduce((acc, r) => acc.concat([r + ' H', r + ' M']), [])), 'cab');

    add(['REM 28 · KINESIOLOGÍA UCI · ' + nombreMes.toUpperCase()], 'titulo');
    add(['Generado ' + ahoraTS() + ' · tipo de atención: UPC · atención cerrada (todos los ingresos con PTI)'], 'sub');
    add([], '');
    add(['SECCIÓN A — INGRESOS DEL MES (Nº de personas; todos con PTI)'], 'seccion');
    cabMatriz('Diagnóstico');
    _REM_DIAGS.forEach(d => filaMatriz(d, ingPorDiag[d]));
    filaMatriz('TOTAL INGRESOS', ingTotal, 'total');
    add([], '');
    add(['SECCIÓN A — EGRESOS DEL MES'], 'seccion');
    cabMatriz('Motivo');
    filaMatriz('Egresos por alta (incluye sala y traslados)', egAlta);
    filaMatriz('Egresos por fallecimiento', egFallece);
    add([], '');
    add(['SECCIÓN B.2 — EVALUACIÓN INICIAL (Kinesiólogo/a · UPC)'], 'seccion');
    cabMatriz('Profesional');
    filaMatriz('Kinesiólogo/a', evalIni);
    add([], '');
    add(['SECCIÓN B.3 — EVALUACIÓN INTERMEDIA (1 por día evaluado · Kinesiólogo/a · UPC)'], 'seccion');
    cabMatriz('Profesional');
    filaMatriz('Kinesiólogo/a', evalInt);
    add([], '');
    add(['SECCIÓN B.4 — SESIONES DE REHABILITACIÓN (KTR + KTM · Kinesiólogo/a · UPC)'], 'seccion');
    cabMatriz('Profesional');
    filaMatriz('Kinesiólogo/a', sesiones);
    add([], '');
    add(['SECCIÓN B.6 — PROCEDIMIENTOS Y ACTIVIDADES'], 'seccion');
    add(['Tipo', 'Total'], 'cab');
    add(['Fisioterapia (= EMS)', turnosEMS], 'dato');
    add(['Ejercicios terapéuticos (= sesiones KTM)', sumKTM], 'dato');
    add(['Educación a usuario/a, cuidador/a y/o familiar', turnosEdu], 'dato');
    add(['Terapia respiratoria y funcional pulmonar (= KTR + IMT)', sumKTR + turnosIMT], 'dato');
    add(['TOTAL', turnosEMS + sumKTM + turnosEdu + sumKTR + turnosIMT], 'total');
    add([], '');
    add(['CÓDIGOS DE PRESTACIONES'], 'seccion');
    add(['Código', 'Prestación', 'Actividades', 'Beneficiarios'], 'codcab');
    add(['601101', 'Evaluación Kinesiológica Integral (1 por paciente)', nIngresos, nIngresos], 'codigo');
    add(['601104', 'Atención Kinesiológica Integral UPC (1 por paciente)', nIngresos, nIngresos], 'codigo');
    add(['601024', 'Reeducación motriz (1 por paciente)', nIngresos, nIngresos], 'codigo');
    add(['601030', 'Maniobras permeabilización de la vía aérea (1 por paciente)', nIngresos, nIngresos], 'codigo');
    add(['102501', 'Reeducación de la tos y respiración en pacientes con TQT (= turnos con IMT)', turnosIMT, Object.keys(pacIMT).length], 'codigo');
    add(['1010922', 'Prueba de tolerancia ortostática (1ª bipedestación del episodio)', nPTO, nPTO], 'codigo');
    add(['601171', 'Asistencia en IOT, VMNI, cambio de cánula (' + nIntub + ' IOT + ' + nReintub + ' reintub + ' + nVMNIini + ' VMNI + ' + nCanula + ' cánula)', nAsistVA, ''], 'codigo');

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let hoja = ss.getSheetByName('REM_28');
    if (!hoja) hoja = ss.insertSheet('REM_28');
    hoja.clear();   // contenido Y formatos (una regeneración no arrastra colores viejos)
    if (hoja.getMaxColumns() < anchoA) hoja.insertColumnsAfter(hoja.getMaxColumns(), anchoA - hoja.getMaxColumns());
    hoja.getRange(1, 1, filas.length, anchoA).setValues(filas);
    hoja.setFrozenRows(0);

    // Aplicar la paleta por tipo de fila (una llamada por estilo vía RangeList).
    const zonas = {};   // clave de estilo → lista de rangos A1
    const zona = (k, a1) => { (zonas[k] = zonas[k] || []).push(a1); };
    const colFin = _remColLetra(anchoA);
    tags.forEach((tag, i) => {
      const r = i + 1;
      if (tag === 'titulo') zona('titulo', 'A' + r + ':' + colFin + r);
      else if (tag === 'sub') zona('sub', 'A' + r + ':' + colFin + r);
      else if (tag === 'seccion') zona('seccion', 'A' + r + ':' + colFin + r);
      else if (tag === 'cab') zona('cab', 'A' + r + ':' + colFin + r);
      else if (tag === 'codcab') zona('codcab', 'A' + r + ':D' + r);
      else if (tag === 'dato') { zona('etiqueta', 'A' + r); zona('datos', 'B' + r + ':' + colFin + r); }
      else if (tag === 'total') zona('totalFila', 'A' + r + ':' + colFin + r);
      else if (tag === 'codigo') { zona('codNum', 'A' + r); zona('codDesc', 'B' + r); zona('codVal', 'C' + r + ':D' + r); }
    });
    const pinta = (k, fondo, opts) => {
      if (!zonas[k]) return;
      const rl = hoja.getRangeList(zonas[k]);
      if (fondo) rl.setBackground(fondo);
      if (opts && opts.negrita) rl.setFontWeight('bold');
      if (opts && opts.letra) rl.setFontColor(opts.letra);
    };
    pinta('titulo', '#2f5496', { negrita: true, letra: '#ffffff' });
    pinta('sub', '#dce6f4', {});
    pinta('seccion', '#b4c6e7', { negrita: true });
    pinta('cab', '#fff2cc', { negrita: true });
    pinta('etiqueta', '#ffe599', {});
    pinta('datos', '#ffffcc', {});
    pinta('totalFila', '#ffe599', { negrita: true });
    pinta('codcab', '#ccffff', { negrita: true });
    pinta('codNum', '#d9d9d9', {});
    pinta('codDesc', '#ffffcc', {});
    pinta('codVal', '#ddebf7', {});
    hoja.setColumnWidth(1, 330);
    for (let c = 2; c <= anchoA; c++) hoja.setColumnWidth(c, 52);

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
