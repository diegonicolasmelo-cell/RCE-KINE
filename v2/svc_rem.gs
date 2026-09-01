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
 *    601171 = intubaciones + reintubaciones + inicios de VNI + cambios de cánula.
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

/**
 * Palabras que pueden significar un fallecimiento pero NO calzan con el
 * detector oficial (`/fallec/i`), así que hoy caen en «alta». No se cambia la
 * regla —eso sería decidir por la unidad— pero la conciliación las MARCA para
 * revisar, junto a los egresos sin motivo escrito. Diego, 30-ago-2026: «en
 * egresos por fallecimiento también hay discrepancia».
 */
var _REM_EGRESO_DUDOSO = /[óo]bito|deceso|muerte|difunt|paro cardio|\bpcr\b|falleci/i;

/**
 * Conciliación del REM: de qué está hecha cada casilla.
 *
 * 🔴 DE DÓNDE SALE (Diego, 30-ago-2026): «la discrepancia entre REM real y el
 * que genera RCE… da la impresión de no estar considerando los mismos valores
 * para ingresos, procedimientos, lo mismo para evaluaciones intermedias; en
 * extubaciones sin protocolo o egresos por fallecimiento también».
 *
 * La regla de la casa es no tocar una cifra sin saber por qué difiere. Esto NO
 * cambia ningún cálculo: acumula, para cada casilla, la LISTA de filas que la
 * componen —cama, paciente, fecha y el porqué— para poder ponerla al lado del
 * REM de papel y ver cuál sobra o cuál falta. Sin RUT: es la regla del REM y
 * esta vista viaja con él.
 */
function _remDetalle() {
  const d = {};
  return {
    add: function (casilla, fila) { (d[casilla] = d[casilla] || []).push(fila); return fila; },
    /** Ordena cada lista por fecha y recorta: la vista es para comparar, no un volcado. */
    cerrar: function (tope) {
      const out = {};
      Object.keys(d).forEach(function (k) {
        const filas = d[k].slice().sort(function (a, b) { return String(a.fecha).localeCompare(String(b.fecha)); });
        out[k] = { n: filas.length, filas: filas.slice(0, tope || 300), recortada: filas.length > (tope || 300) };
      });
      return out;
    },
  };
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

    // Fecha de ingreso real del episodio: ficha del archivo → cama.
    const fIngresoPid = {};
    archivo.forEach(a => { if (a.PATIENT_ID && a.FECHA_INGRESO) fIngresoPid[String(a.PATIENT_ID)] = a.FECHA_INGRESO; });
    camas.forEach(c => { if (c.PATIENT_ID && c.FECHA_INGRESO) fIngresoPid[String(c.PATIENT_ID)] = c.FECHA_INGRESO; });

    // Nombre por paciente, solo para la conciliación (nunca RUT).
    const nombrePid = {};
    archivo.forEach(a => { if (a.PATIENT_ID && a.NOMBRE) nombrePid[String(a.PATIENT_ID)] = a.NOMBRE; });
    camas.forEach(c => { if (c.PATIENT_ID && c.NOMBRE) nombrePid[String(c.PATIENT_ID)] = c.NOMBRE; });
    todasEvos.forEach(e => { if (e.PATIENT_ID && e.PAC_NOMBRE && !nombrePid[String(e.PATIENT_ID)]) nombrePid[String(e.PATIENT_ID)] = e.PAC_NOMBRE; });
    const _nom = pid => String(nombrePid[String(pid)] || '(sin nombre)');
    const DET = _remDetalle();

    // ── Sección A: ingresos del mes ──
    // Un ES_INGRESO cuenta como ingreso DEL MES solo si el episodio empezó dentro
    // del mes. Al arrancar el sistema (1-ago-2026) se marcó ES_INGRESO a todo el
    // censo, incluidos 12 pacientes que ya venían de julio y que julio ya había
    // reportado: contarlos otra vez es doble conteo entre meses.
    // Sin fecha de ingreso conocida SÍ cuenta: se excluye solo con evidencia, para
    // que una ficha incompleta no haga desaparecer un ingreso verdadero.
    const ingresosPids = {};
    const ingresosFuera = {};   // marcados ES_INGRESO pero de un episodio anterior
    evoMes.forEach(e => {
      if (!esVerdadero(e.ES_INGRESO) || !e.PATIENT_ID) return;
      const pid = String(e.PATIENT_ID);
      const fIng = fIngresoPid[pid];
      if (fIng && !enMes(fIng)) { ingresosFuera[pid] = _statISO(fIng); return; }
      ingresosPids[pid] = true;
    });
    Object.keys(ingresosPids).forEach(pid => DET.add('ingresos', {
      cama: '', nombre: _nom(pid), fecha: _statISO(fIngresoPid[pid] || ''),
      porque: fIngresoPid[pid] ? 'ingresó en el mes' : 'sin fecha de ingreso en ficha: se cuenta igual' }));
    // Los excluidos también se muestran: son la diferencia contra el conteo viejo
    // y lo primero que alguien va a querer revisar contra el papel.
    Object.keys(ingresosFuera).forEach(pid => DET.add('ingresosExcluidos', {
      cama: '', nombre: _nom(pid), fecha: ingresosFuera[pid],
      porque: 'marcado como ingreso, pero su episodio empezó antes del mes' }));
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
      const motivo = String(a.MOTIVO_EGRESO || '');
      const fallece = /fallec/i.test(motivo);
      const o = fallece ? egFallece : egAlta;   // alta incluye traslados (acuerdo jul-2026)
      const rg = _remRango(a.EDAD), sx = _remSexo(a.SEXO);
      o.T++; if (sx) o[sx]++; if (rg && sx) o[rg + sx]++;
      // 🔎 Lo que la conciliación viene a mostrar: un egreso que NO dice
      // «fallec…» cae en alta, aunque el motivo escrito suene a fallecimiento
      // («óbito», «paro») o esté en blanco. No se cambia la regla; se marca.
      const dudoso = !fallece && (!motivo.trim() || _REM_EGRESO_DUDOSO.test(motivo));
      DET.add(fallece ? 'egresosFallecimiento' : 'egresosAlta', {
        cama: String(a.ID_CAMA || ''), nombre: String(a.NOMBRE || _nom(a.PATIENT_ID)),
        fecha: _statISO(a.FECHA_EGRESO),
        porque: motivo.trim() ? 'motivo: ' + motivo : 'sin motivo escrito',
        revisar: dudoso ? (motivo.trim() ? 'el motivo no dice «fallec…», así que cuenta como ALTA'
                                         : 'sin motivo: cuenta como ALTA') : '' });
    });

    // ── B.2 eval inicial (= ingresos) y B.3 eval intermedia (1 por día evaluado) ──
    const evalIni = cero();
    Object.keys(ingresosPids).forEach(pid => {
      const p = pacAttr[pid] || {}, rg = _remRango(p.edad), sx = p.sexo;
      evalIni.T++; if (sx) evalIni[sx]++; if (rg && sx) evalIni[rg + sx]++;
    });
    // Días de ingreso por paciente, para excluirlos de la intermedia: esa evaluación
    // ya se contó como inicial (B.2). Solo los del episodio que SÍ cuenta como
    // ingreso del mes — al heredado del arranque no se le suma B.2, así que su
    // evaluación de ese día es intermedia y tiene que aparecer en el B.3.
    const diaIngreso = {};
    todasEvos.forEach(e => {
      const pid = String(e.PATIENT_ID);
      if (esVerdadero(e.ES_INGRESO) && ingresosPids[pid]) diaIngreso[pid + '|' + _statISO(e.FECHA)] = true;
    });
    const evalInt = cero(); const diasEvaluados = {};
    evoMes.forEach(e => {
      const pid = String(e.PATIENT_ID || ''), dia = _statISO(e.FECHA), key = pid + '|' + dia;
      if (diaIngreso[key] || diasEvaluados[key]) return;
      const cuales = _REM_EVAL_CAMPOS.filter(c => String(e[c] === undefined ? '' : e[c]).trim() !== '');
      if (!cuales.length) return;
      diasEvaluados[key] = true;
      const p = pacAttr[pid] || {}, rg = _remRango(p.edad), sx = p.sexo;
      evalInt.T++; if (sx) evalInt[sx]++; if (rg && sx) evalInt[rg + sx]++;
      // QUÉ medición la hizo contar: si el papel cuenta otra cosa —o cuenta por
      // TURNO y no por día— la diferencia se ve aquí sin adivinar.
      DET.add('evalIntermedia', { cama: String(e.ID_CAMA || ''), nombre: _nom(pid), fecha: dia,
        porque: 'turno ' + String(e.TURNO || '') + ' · ' +
          cuales.map(c => c.replace(/^EVAL_T_/, '').replace('CPAX_TOTAL', 'CPAx')).join(', ') });
    });
    // Los días que NO contaron y por qué: el otro lado de la resta.
    evoMes.forEach(e => {
      const pid = String(e.PATIENT_ID || ''), dia = _statISO(e.FECHA), key = pid + '|' + dia;
      if (!diaIngreso[key]) return;
      const cuales = _REM_EVAL_CAMPOS.filter(c => String(e[c] === undefined ? '' : e[c]).trim() !== '');
      if (!cuales.length) return;
      DET.add('evalIntermediaExcluida', { cama: String(e.ID_CAMA || ''), nombre: _nom(pid), fecha: dia,
        porque: 'es el día del ingreso: su evaluación ya se contó en B.2 (inicial)',
        revisar: 'si en el papel la cuentas también como intermedia, aquí está la diferencia' });
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
    evoMes.forEach(e => {
      const pid = String(e.PATIENT_ID || '');
      if (esVerdadero(e.INTUB_OCURRIO)) DET.add('asistenciasVA', { cama: String(e.ID_CAMA || ''),
        nombre: _nom(pid), fecha: _statISO(e.FECHA), porque: 'intubación' + (e.INTUB_HORA ? ' ' + e.INTUB_HORA : '') });
      if (esVerdadero(e.TQT_CAMBIO)) DET.add('asistenciasVA', { cama: String(e.ID_CAMA || ''),
        nombre: _nom(pid), fecha: _statISO(e.FECHA), porque: 'cambio de cánula de TQT' });
    });
    repoLeerTodos('REINTUBACIONES').filter(r => enMes(r.FECHA)).forEach(r => DET.add('asistenciasVA', {
      cama: String(r.ID_CAMA || ''), nombre: _nom(r.PATIENT_ID), fecha: _statISO(r.FECHA),
      porque: 'reintubación' + (r.HORA ? ' ' + r.HORA : '') }));
    // Inicios de VNI: turno en VNI cuyo turno previo del episodio no lo estaba.
    // ⚠️ El valor que guarda el catálogo es 'VNI' (VENT_SOPORTE); 'VMNI' es el
    // nombre del código en el formulario REM, no un valor del sistema. Comparar
    // contra 'VMNI' —como se hacía— dejaba esta parte del 601171 SIEMPRE en 0.
    // Se aceptan los dos por si algún registro viejo trae la sigla larga.
    const _esVNI = s => s === 'VNI' || s === 'VMNI';
    let nVMNIini = 0;
    const porPac = {};
    todasEvos.forEach(e => { const pid = String(e.PATIENT_ID || ''); (porPac[pid] = porPac[pid] || []).push(e); });
    Object.keys(porPac).forEach(pid => {
      const evs = porPac[pid].slice().sort((a, b) => String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)));
      let prev = '';
      evs.forEach(e => {
        const sop = String(e.VENT_SOPORTE || '');
        if (_esVNI(sop) && !_esVNI(prev) && enMes(e.FECHA)) {
          nVMNIini++;
          DET.add('asistenciasVA', { cama: String(e.ID_CAMA || ''), nombre: _nom(pid),
            fecha: _statISO(e.FECHA), porque: 'inicio de VNI' });
        }
        prev = sop;
      });
    });
    const nAsistVA = nIntub + nReintub + nVMNIini + nCanula;

    /* ── Fuera del REM, pero pedido en la misma conversación (Diego, 30-ago):
       las EXTUBACIONES —donde «sin condiciones» no cuenta como extubación
       (decisión clínica de jul-2026, y candidata firme a explicar su
       discrepancia)— y las PVE del mes, que él vio en 3. */
    evoMes.forEach(e => {
      const pid = String(e.PATIENT_ID || ''), f = _statISO(e.FECHA), cama = String(e.ID_CAMA || '');
      const tipo = String(e.EXT_TIPO || '');
      if (esVerdadero(e.EXT_OCURRIO)) {
        DET.add('extubaciones', { cama: cama, nombre: _nom(pid), fecha: f,
          porque: (tipo || 'sin tipo declarado') + (e.EXT_HORA ? ' · ' + e.EXT_HORA : '') });
      } else if (tipo === 'sin_condiciones') {
        DET.add('extubacionesNoContadas', { cama: cama, nombre: _nom(pid), fecha: f,
          porque: 'marcada «sin condiciones»',
          revisar: 'por decisión clínica de jul-2026 NO cuenta como extubación' });
      }
      if (String(e.PVE_VAL) === 'si') DET.add('pve', { cama: cama, nombre: _nom(pid), fecha: f,
        porque: 'PVE realizada' + (e.PVE_RESULTADO ? ' · ' + e.PVE_RESULTADO : '') });
    });

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
    const D = _REM_TPL_DESTINO;   // el informe comienza en la fila 4
    const filaFin = D + M.length - 1;
    if (hoja.getMaxRows() < filaFin) hoja.insertRowsAfter(hoja.getMaxRows(), filaFin - hoja.getMaxRows());

    // Contenido + formato celda a celda (matrices alineadas con la plantilla).
    const zona = hoja.getRange(D, 1, M.length, _REM_TPL_NCOLS);
    zona.setValues(M);
    zona.setBackgrounds(_REM_TPL_FONDOS.map(s => s.split('').map(ch => _REM_TPL_PALETA[parseInt(ch, 16)] || null)));
    zona.setFontWeights(_REM_TPL_NEGRITAS.map(s => s.split('').map(b => b === '1' ? 'bold' : 'normal')));
    zona.setFontColors(_REM_TPL_LETRAS.map(s => s.split('').map(b => b === '1' ? _REM_TPL_LETRA_AZUL : null)));
    const fam = _REM_TPL_FUENTES_PAL.map(x => x.split('|')[0]);
    const tam = _REM_TPL_FUENTES_PAL.map(x => parseInt(x.split('|')[1]));
    zona.setFontFamilies(_REM_TPL_FUENTES.map(s => s.split('').map(ch => fam[parseInt(ch, 16)])));
    zona.setFontSizes(_REM_TPL_FUENTES.map(s => s.split('').map(ch => tam[parseInt(ch, 16)])));
    zona.setHorizontalAlignments(_REM_TPL_ALINEA.map(s => s.split('').map(ch => ch === 'r' ? 'right' : (ch === 'c' ? 'center' : null))));
    zona.setWraps(_REM_TPL_WRAPS.map(s => s.split('').map(b => b === '1')));

    // Celdas combinadas y bordes (rectángulos relativos extraídos del original).
    _REM_TPL_MERGES.forEach(m => { try { hoja.getRange(D + m[0], m[1] + 1, m[2] - m[0] + 1, m[3] - m[1] + 1).merge(); } catch (ig) {} });
    const rango = m => hoja.getRange(D + m[0], m[1] + 1, m[2] - m[0] + 1, m[3] - m[1] + 1);
    const SM = SpreadsheetApp.BorderStyle.SOLID_MEDIUM, DBL = SpreadsheetApp.BorderStyle.DOUBLE;
    _REM_TPL_BORDES.gris.forEach(m => rango(m).setBorder(true, true, true, true, true, true, '#cccccc', SM));
    const ladoNegro = { top: [true, null, null, null], left: [null, true, null, null], bottom: [null, null, true, null], right: [null, null, null, true] };
    Object.keys(_REM_TPL_BORDES.negro).forEach(lado => {
      const p = ladoNegro[lado];
      _REM_TPL_BORDES.negro[lado].forEach(m => rango(m).setBorder(p[0], p[1], p[2], p[3], null, null, '#000000', SM));
    });
    Object.keys(_REM_TPL_BORDES.doble).forEach(lado => {
      const p = ladoNegro[lado];
      _REM_TPL_BORDES.doble[lado].forEach(m => rango(m).setBorder(p[0], p[1], p[2], p[3], null, null, '#000000', DBL));
    });

    // Anchos de columna y alturas de fila del original (alturas agrupadas por tramos).
    _REM_TPL_ANCHOS.forEach((w, i) => hoja.setColumnWidth(i + 1, w));
    for (let i = 0; i < _REM_TPL_ALTURAS.length;) {
      let j = i;
      while (j + 1 < _REM_TPL_ALTURAS.length && _REM_TPL_ALTURAS[j + 1] === _REM_TPL_ALTURAS[i]) j++;
      hoja.setRowHeights(D + i, j - i + 1, _REM_TPL_ALTURAS[i]);
      i = j + 1;
    }
    hoja.setFrozenRows(0);

    // Cabecera informativa en la zona libre (filas 1-2; el informe parte en la 4).
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
    L.push('601171 Asistencias vía aérea:    ' + nAsistVA + '  (' + nIntub + ' IOT · ' + nReintub + ' reintub · ' + nVMNIini + ' VNI · ' + nCanula + ' cánula)');
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
      // Conciliación: de qué está hecha cada casilla (no cambia ninguna cifra).
      detalle: DET.cerrar(300),
      ingresos: nIngresos, egresosAlta: egAlta.T, egresosFallecimiento: egFallece.T,
      evalInicial: evalIni.T, evalIntermedia: evalInt.T, sesiones: sesiones.T,
      sumKTR: sumKTR, sumKTM: sumKTM, turnosIMT: turnosIMT, turnosEMS: turnosEMS,
      turnosEdu: turnosEdu, pto: nPTO, asistenciasVA: nAsistVA,
    });
  } catch (e) { return err('generarREM: ' + e.message, ERR.INTERNO, e); }
}
