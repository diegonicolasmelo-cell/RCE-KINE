/**
 * svc_indicadores.gs — Tablero de indicadores centinela (jul-2026).
 *
 * Calcula desde el registro diario (EVOLUCIONES + EVOLUCIONES_ARCHIVO +
 * REINTUBACIONES + ARCHIVO_PACIENTES), con numerador y denominador visibles.
 * Definiciones acordadas con la coordinación (alineadas al análisis M. Fuentes):
 *  - Fracaso de extubación = reintubación ≤48 h tras extubación programada
 *    (precoz <24 h, tardío 24–48 h). Denominador: extubaciones programadas
 *    (protocolo + fuera de protocolo); autoextubación/accidental van aparte.
 *  - Autoextubaciones por 100 días-VM (meta 1–2; días-VM = paciente-días con VM).
 *  - Fuera de protocolo = EXT_TIPO sin_protocolo o sin_condiciones (meta <25%).
 *  - PVE por 100 paciente-día (PVE_VAL='si').
 *  - Mortalidad SIN ajuste por gravedad (el ajuste se hace fuera, por RUT).
 * La tendencia mensual mezcla los meses de la plataforma con la hoja
 * INDICADORES_HISTORICO (sembrada desde el análisis histórico), marcando fuente.
 */

/**
 * Campos de EVOLUCIONES que este cálculo necesita — 21 de 386 (ago-2026, Ola 3).
 *
 * 🔴 **Si agregas un `e.CAMPO` al cálculo, agrégalo también acá.** Lo que no
 * esté en esta lista se lee como vacío y el indicador que dependa de él baja
 * a 0 sin avisar. `build/checks/columnas.js` compara esta lista contra los
 * campos que el archivo realmente toca y falla si falta alguno; no es una
 * lista de memoria, es una lista verificada.
 */
const _CAMPOS_INDICADORES = [
  'PATIENT_ID', 'FECHA', 'TURNO_KEY',
  'VENT_SOPORTE', 'VENT_SOPORTE_FINAL', 'VENT_VIA_AEREA', 'VENT_CUFF_EST',
  'EXT_OCURRIO', 'EXT_TIPO', 'EXT_HORA', 'EXT_MOTIVO',
  'PVE_VAL', 'TQT_OCURRIO',
  'KTM_REALIZADA', 'KTM_CANT', 'RESP_KTR_CANT',
  'DESVINC_OCURRIO', 'DESVINC_RECONEXION', 'DESVINC_HORAS',
  'VFON_USADA', 'VFON_MIN',
];

function calcularIndicadores(desde, hasta) {
  try {
    desde = String(desde || '').slice(0, 10);
    hasta = String(hasta || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta) {
      return err('Rango de fechas inválido.', ERR.VALIDACION);
    }
    const enR = f => { const s = _statISO(f); return s >= desde && s <= hasta; };

    const todasEvos = repoLeerColumnas('EVOLUCIONES', _CAMPOS_INDICADORES)
      .concat(repoLeerColumnas('EVOLUCIONES_ARCHIVO', _CAMPOS_INDICADORES));
    const evosR = todasEvos.filter(e => enR(e.FECHA));
    const archivo = repoLeerTodos('ARCHIVO_PACIENTES');
    const camas = repoLeerTodos('CAMAS_ESTADO');

    // ── Denominadores base ──
    // **Día con VM = el paciente estuvo en VM en algún momento del turno**,
    // ya sea al empezarlo (`VENT_SOPORTE`) o al cerrarlo (`VENT_SOPORTE_FINAL`).
    // Decisión de Manuel Fuentes, 8-ago-2026, y corrige un error real: hasta hoy
    // este denominador contaba SOLO el soporte de inicio mientras que la VM
    // prolongada y la mediana pre-TQT (más abajo) ya usaban la definición
    // amplia. Con un paciente que entraba en VNI y terminaba en VM el turno no
    // contaba como día-VM, el denominador se quedaba corto y
    // `autoextPor100VM` se disparaba — medido en 100 contra una meta de 1-2.
    // Ahora el tablero usa UNA sola definición; si se cambia, se cambia en los
    // dos sitios (lo exige `checks/indicadores.js`).
    const _esDiaVM = e => String(e.VENT_SOPORTE) === 'VM' || String(e.VENT_SOPORTE_FINAL) === 'VM';
    const pacDias = {}, vmDias = {};
    evosR.forEach(e => {
      const k = String(e.PATIENT_ID) + '|' + _statISO(e.FECHA);
      pacDias[k] = true;
      if (_esDiaVM(e)) vmDias[k] = true;
    });
    const nPacDias = Object.keys(pacDias).length;
    const nVmDias = Object.keys(vmDias).length;
    const diasRango = Math.round((new Date(hasta) - new Date(desde)) / 864e5) + 1;

    // ── Extubaciones del rango ──
    const PROGRAMADAS = { protocolo: 1, sin_protocolo: 1 };
    const FUERA = { sin_protocolo: 1 };
    // «sin_condiciones» era, hasta v4.1, un tipo dentro de «tipo de extubación».
    // Decisión clínica (jul-2026): NO es una extubación — significa que ese turno
    // no se realizó PVE, y ahora se registra con su razón (PVE_SC_RAZON). Se
    // ignora aquí para que ninguna fila histórica lo cuente como extubación.
    const NO_ES_EXTUBACION = { sin_condiciones: 1 };
    const ACCIDENTALES = { autoextubacion: 1, accidental: 1 };
    const extProg = [];
    let nFuera = 0, nAutoext = 0;
    const motivosFuera = {};   // motivo → {total, noche}
    evosR.forEach(e => {
      if (!esVerdadero(e.EXT_OCURRIO)) return;
      const tipo = String(e.EXT_TIPO || '');
      const esNoche = /Noche$/i.test(String(e.TURNO_KEY || ''));
      if (NO_ES_EXTUBACION[tipo]) return;
      if (ACCIDENTALES[tipo]) { nAutoext++; return; }
      if (!PROGRAMADAS[tipo]) return;
      extProg.push({ pid: String(e.PATIENT_ID), fecha: _statISO(e.FECHA), hora: String(e.EXT_HORA || '') });
      if (FUERA[tipo]) {
        nFuera++;
        const mot = String(e.EXT_MOTIVO || '').trim() || 'Sin motivo registrado';
        const m = motivosFuera[mot] = motivosFuera[mot] || { total: 0, noche: 0 };
        m.total++; if (esNoche) m.noche++;
      }
    });

    // ── Fracaso: reintubación ≤48 h tras la extubación programada ──
    const reintubs = repoLeerTodos('REINTUBACIONES');
    const reintubPorPid = {};
    reintubs.forEach(r => {
      const pid = String(r.PATIENT_ID || '');
      (reintubPorPid[pid] = reintubPorPid[pid] || []).push({ fecha: _statISO(r.FECHA), hora: String(r.HORA_REINTUBACION || '') });
    });
    const horasEntre = (f1, h1, f2, h2) => {
      const dias = Math.round((new Date(f2) - new Date(f1)) / 864e5);
      const m1 = /^\d{1,2}:\d{2}/.test(h1) ? parseInt(h1) * 60 + parseInt(h1.split(':')[1]) : null;
      const m2 = /^\d{1,2}:\d{2}/.test(h2) ? parseInt(h2) * 60 + parseInt(h2.split(':')[1]) : null;
      if (m1 !== null && m2 !== null) return dias * 24 + (m2 - m1) / 60;
      return dias * 24;   // sin horas: aproximación por días (0=mismo día→precoz, 1→24h, 2→48h)
    };
    // El criterio de las 48 h se aplica UNA sola vez por extubación y de aquí
    // salen los dos consumidores: el total del rango y la tendencia mensual.
    // Antes se emparejaba dos veces (aquí y al armar la tendencia) con dos
    // copias del mismo criterio clínico: coincidían por suerte, y si alguien
    // corregía una definición —la ventana, el orden de los candidatos— el
    // tablero podía quedar diciendo dos verdades distintas sobre el mismo mes.
    let nPrecoz = 0, nTardio = 0;
    const porMes = {};   // 'aaaa-mm' → { ext, fra }
    extProg.forEach(x => {
      const m = x.fecha.slice(0, 7);
      const mes = porMes[m] = porMes[m] || { ext: 0, fra: 0 };
      mes.ext++;
      let mejor = null;
      (reintubPorPid[x.pid] || []).forEach(r => {
        if (r.fecha < x.fecha) return;
        const h = horasEntre(x.fecha, x.hora, r.fecha, r.hora);
        if (h >= 0 && h <= 48 && (mejor === null || h < mejor)) mejor = h;
      });
      if (mejor === null) return;
      mes.fra++;
      if (mejor < 24) nPrecoz++; else nTardio++;
    });
    const nFracaso = nPrecoz + nTardio;

    // ── PVE, TQT, VM prolongada, atenciones ──
    const nPVE = evosR.filter(e => String(e.PVE_VAL) === 'si').length;

    const vmDiasEpisodio = {};   // pid → Set de días con VM (episodio completo)
    todasEvos.forEach(e => {
      if (!_esDiaVM(e)) return;   // misma definición que el denominador de arriba
      const pid = String(e.PATIENT_ID);
      (vmDiasEpisodio[pid] = vmDiasEpisodio[pid] || {})[_statISO(e.FECHA)] = true;
    });
    const diasVMpreTQT = [];
    evosR.forEach(e => {
      if (!esVerdadero(e.TQT_OCURRIO)) return;
      const dias = Object.keys(vmDiasEpisodio[String(e.PATIENT_ID)] || {}).filter(d => d <= _statISO(e.FECHA)).length;
      diasVMpreTQT.push(dias);
    });
    diasVMpreTQT.sort((a, b) => a - b);
    const medianaTQT = diasVMpreTQT.length
      ? (diasVMpreTQT.length % 2 ? diasVMpreTQT[(diasVMpreTQT.length - 1) / 2]
        : (diasVMpreTQT[diasVMpreTQT.length / 2 - 1] + diasVMpreTQT[diasVMpreTQT.length / 2]) / 2)
      : null;

    const pidsVMenRango = {};
    Object.keys(vmDias).forEach(k => { pidsVMenRango[k.split('|')[0]] = true; });
    const nVentilados = Object.keys(pidsVMenRango).length;
    const nVMProlongada = Object.keys(pidsVMenRango)
      .filter(pid => Object.keys(vmDiasEpisodio[pid] || {}).length > 7).length;

    let atenciones = 0;
    evosR.forEach(e => {
      atenciones += Math.max(0, parseInt(e.RESP_KTR_CANT) || 0);
      if (esVerdadero(e.KTM_REALIZADA)) atenciones += Math.min(9, Math.max(1, parseInt(e.KTM_CANT) || 1));
    });

    // ── Desvinculación de VM del paciente traqueostomizado (weaning de TQT) ──
    // Ventanas registradas en el turno: cuántas, cuántas terminaron en
    // reconexión y cuántas horas se acumularon fuera del ventilador.
    let desvincN = 0, desvincRecon = 0, desvincHoras = 0;
    const desvincPacs = {}, desvincDur = [];
    evosR.forEach(e => {
      if (!esVerdadero(e.DESVINC_OCURRIO)) return;
      desvincN++;
      desvincPacs[String(e.PATIENT_ID)] = true;
      if (esVerdadero(e.DESVINC_RECONEXION)) desvincRecon++;
      const h = parseFloat(String(e.DESVINC_HORAS || '').replace(',', '.'));
      if (!isNaN(h) && h > 0) { desvincHoras += h; desvincDur.push(h); }
    });
    desvincDur.sort((a, b) => a - b);
    const desvincMediana = desvincDur.length
      ? (desvincDur.length % 2 ? desvincDur[(desvincDur.length - 1) / 2]
        : Math.round(((desvincDur[desvincDur.length / 2 - 1] + desvincDur[desvincDur.length / 2]) / 2) * 10) / 10)
      : null;

    // Uso de válvula de fonación (intervención de rehabilitación en TQT)
    let vfonTurnos = 0, vfonMin = 0;
    evosR.forEach(e => {
      if (!esVerdadero(e.VFON_USADA)) return;
      vfonTurnos++;
      vfonMin += Math.max(0, parseInt(e.VFON_MIN) || 0);
    });

    // ── Adherencia a la verificación de cuff (paquete de prevención de NAVM) ──
    // Denominador: turnos con vía aérea artificial (donde el protocolo pide
    // verificar 1 vez por turno). Numerador: turnos con el cuff verificado —
    // en rango o ajustado; ambos son verificación efectiva. «Desinflado» sale
    // del denominador: con válvula de fonación no corresponde medir presión.
    let cuffTurnos = 0, cuffVerif = 0, cuffAjuste = 0;
    evosR.forEach(e => {
      const va = String(e.VENT_VIA_AEREA || '');
      if (va !== 'TOT' && va !== 'TQT') return;
      const est = String(e.VENT_CUFF_EST || '');
      if (est === 'desinflado') return;
      cuffTurnos++;
      if (est === 'rango' || est === 'ajuste') cuffVerif++;
      if (est === 'ajuste') cuffAjuste++;
    });

    // ── Reingresos por RUT (histórico completo, no depende del rango) ──
    const episodiosPorRutMap = {};
    archivo.forEach(a => { const r = _rutNormal(a.RUT); if (r) (episodiosPorRutMap[r] = episodiosPorRutMap[r] || []).push(1); });
    camas.forEach(c => { if (esVerdadero(c.OCUPADA)) { const r = _rutNormal(c.RUT); if (r) (episodiosPorRutMap[r] = episodiosPorRutMap[r] || []).push(1); } });
    const ruts = Object.keys(episodiosPorRutMap);
    const nReingresos = ruts.filter(r => episodiosPorRutMap[r].length > 1).length;

    // ── Egresos y mortalidad (sin ajuste) ──
    const egresosR = archivo.filter(a => enR(a.FECHA_EGRESO));
    const nFallecidos = egresosR.filter(a => /fallec/i.test(String(a.MOTIVO_EGRESO || ''))).length;

    // ── Tendencia mensual (histórico sembrado + meses de la plataforma) ──
    const tendencia = [];
    repoLeerTodos('INDICADORES_HISTORICO').forEach(h => {
      const ext = parseInt(h.EXTUBACIONES) || 0;
      tendencia.push({ mes: String(h.MES || ''), fuente: String(h.FUENTE || 'planilla'),
        fracasoPct: ext ? Math.round(1000 * (parseInt(h.REINTUB_48H) || 0) / ext) / 10 : null });
    });
    Object.keys(porMes).sort().forEach(m => {
      tendencia.push({ mes: m, fuente: 'rce', fracasoPct: porMes[m].ext ? Math.round(1000 * porMes[m].fra / porMes[m].ext) / 10 : null });
    });
    tendencia.sort((a, b) => a.mes.localeCompare(b.mes));

    return ok({
      desde, hasta, diasRango,
      pacienteDias: nPacDias, diasVM: nVmDias,
      extubaciones: extProg.length, fracaso: nFracaso, fracasoPrecoz: nPrecoz, fracasoTardio: nTardio,
      fracasoPct: extProg.length ? Math.round(1000 * nFracaso / extProg.length) / 10 : null,
      autoextubaciones: nAutoext,
      autoextPor100VM: nVmDias ? Math.round(100 * 100 * nAutoext / nVmDias) / 100 : null,
      fueraProtocolo: nFuera,
      fueraPct: extProg.length ? Math.round(1000 * nFuera / extProg.length) / 10 : null,
      motivosFuera: motivosFuera,
      pve: nPVE, pvePor100PacDia: nPacDias ? Math.round(100 * 100 * nPVE / nPacDias) / 100 : null,
      tqt: diasVMpreTQT.length, medianaVMpreTQT: medianaTQT,
      ventilados: nVentilados, vmProlongada: nVMProlongada,
      vmProlongadaPct: nVentilados ? Math.round(1000 * nVMProlongada / nVentilados) / 10 : null,
      atenciones: atenciones,
      desvinculaciones: desvincN, desvincPacientes: Object.keys(desvincPacs).length,
      desvincReconexiones: desvincRecon,
      desvincHorasTotal: Math.round(desvincHoras * 10) / 10, desvincMedianaHoras: desvincMediana,
      vfonTurnos: vfonTurnos, vfonMinutos: vfonMin,
      cuffTurnos: cuffTurnos, cuffVerificados: cuffVerif, cuffAjustes: cuffAjuste,
      cuffAdherenciaPct: cuffTurnos ? Math.round(100 * cuffVerif / cuffTurnos) : null,
      atencionesPorPacDia: nPacDias ? Math.round(100 * atenciones / nPacDias) / 100 : null,
      ocupacionProm: diasRango ? Math.round(10 * nPacDias / diasRango) / 10 : null,
      personasConRut: ruts.length, reingresos: nReingresos,
      egresos: egresosR.length, fallecidos: nFallecidos,
      mortalidadPct: egresosR.length ? Math.round(1000 * nFallecidos / egresosR.length) / 10 : null,
      tendencia: tendencia,
    });
  } catch (e) { return err('calcularIndicadores: ' + e.message, ERR.INTERNO, e); }
}
