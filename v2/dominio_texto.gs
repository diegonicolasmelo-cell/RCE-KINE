/**
 * dominio_texto.gs — Generador de texto clínico PURO.
 * Portado desde v1 (se conserva la estética/salida, D8), adaptado a nombres v2:
 *   EX_RUIDOS_MAN→EX_RUIDOS_LOC · EX_SECR_CANT/TIPO→RESP_SECR_QTY/CAR ·
 *   VENT_POST_EXT(_VAL)→EXT_OCURRIO/EXT_POST_DET. Se agrega la fase clínica (FASE_JSON).
 */
/** Minúscula SOLO en la inicial: conserva siglas («BNM», «VNI») y nombres propios. */
function _lcIni(s) {
  s = String(s || ''); if (!s) return '';
  // Las siglas se respetan: «VNI», «CNAF», «Naricera-NRC» no pasan a «vNI»
  const t = s.split(/[\s\/-]/)[0];
  if (t.length > 1 && t === t.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(t)) return s;
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * «Queda con» de la reintubación — espejo exacto de `_reintubEquipoTxt` del
 * cliente (index.html), que ya lo narraba en sus TRES ramas.
 *
 * 🔴 El servidor no lo decía en NINGUNA (detectado 14-ago-2026). O sea que el
 * colega leía en pantalla «…se reintuba a las 03:20 con TOT N° 8.0 a 22 cm,
 * quedando en modo ACVC (Vt 420 ml…)» y lo que quedaba ARCHIVADO en la
 * evolución cortaba en «…a las 03:20.». El estado posterior es parte del
 * registro desde la v4.3 —estado previo → evento → estado posterior— y la
 * reintubación era la única transición que lo perdía al guardarse.
 *
 * Es el mismo patrón que ya se pagó con las secreciones y con la fecha de los
 * filtros: dos generadores de la misma frase que se van separando. Si alguien
 * toca uno, tiene que tocar el otro; la guardia lo vigila leyendo el fuente.
 */
function _reintubEquipoTxt(d) {
  const val = k => String((d && d[k]) || '').trim();
  const tn = val('REINTUB_TOT_N'), cm = val('REINTUB_TOT_CM');
  const mo = val('REINTUB_MODO'), pa = val('REINTUB_PARAMS');
  let t = '';
  if (tn) t += ` con TOT N° ${tn}${cm ? ' a ' + cm + ' cm' : ''}`;
  if (mo) t += `, quedando en modo ${mo}${pa ? ' (' + pa + ')' : ''}`;
  else if (pa) t += `, quedando con ${pa}`;
  return t;
}

function generarTextoEvolucion(d) {
  const v  = k => (d[k] !== undefined && d[k] !== null && d[k] !== '') ? String(d[k]) : null;
  const vn = k => parseFloat(d[k]) || 0;
  const txt = [];

  // 1. Encabezado
  const esIngreso = esVerdadero(d.ES_INGRESO);
  const turnoLabel = d.TURNO === 'Noche' ? 'TURNO NOCHE' : 'TURNO DÍA';
  txt.push(esIngreso ? `KINESIOLOGÍA ${turnoLabel} — INGRESO` : `KINESIOLOGÍA ${turnoLabel}`);

  // 2. Diagnóstico
  const dx = v('PAC_DIAGNOSTICO');
  if (esIngreso) {
    txt.push(`Paciente ingresa a UCI${dx ? ' con diagnóstico de ' + dx : ''}.`);
  } else {
    const dias = v('DIA_ESTADIA') || '?';
    txt.push(`Paciente en día ${dias} de estadía en UCI${dx ? '. Dx: ' + dx : ''}.`);
  }

  // 2b. Fase clínica (nuevo)
  const fases = _parseFases(d.FASE_JSON);
  if (fases.length) txt.push(fases.map(_faseIntro).join(' '));

  // 3. Sedación / GCS
  const sed = v('SED_TIPO') || 'Sin sedación';
  const sas = v('SED_SAS');
  const gcsO = v('SED_GCS_O') || '?', gcsV = v('SED_GCS_V') || '?', gcsM = v('SED_GCS_M') || '?';
  const gcsTot = v('SED_GCS_TOT') || '?';
  const s5q = v('SED_S5Q'), coop = v('SED_COOPERACION');
  const bnm = esVerdadero(d.SED_BNM);
  const va = v('VENT_VIA_AEREA') || 'Natural';
  const intubado = va === 'TOT' || va === 'TQT';

  // El escalón SIEMPRE se narra si existe, con su SAS (ago-2026, reporte de
  // Álvaro vía Diego): la rama de BNM se comía el escalón y el SAS solo salía
  // en dos ramas. Con BNM el escalón va igual — el bloqueo no borra la pauta.
  // SAS ACTUAL y META son cosas distintas (ago-2026, PRD_SAS_REAL.md). Hasta
  // esta versión había un solo número y se narraba como meta: con un paciente
  // en SAS 6 y meta 4 no había forma de escribir la verdad. Espejo exacto del
  // cliente — si se cambia uno hay que cambiar el otro (lección de las
  // secreciones), y la guardia lo comprueba leyendo los dos fuentes.
  const meta = v('SED_SAS_META');
  const sasTxt = sas ? ` con SAS ${sas}${meta ? ` (meta ${meta})` : ''}` : (meta ? ` para meta SAS ${meta}` : '');
  const escTxt = (sed && sed !== 'Sin sedación') ? (sed === 'Fuera de escalón' ? 'fuera de escalón' : `en ${sed.toLowerCase()}`) : '';
  // La sedación vigil se nombra: es la que NO cuenta como sedación profunda.
  const vigilTxt = esVerdadero(d.SED_VIGIL) ? ' vigil (control de agitación)' : '';
  let farm = [];
  try { farm = JSON.parse(d.SED_FARMACOS || '[]') || []; } catch (e) { farm = []; }
  const farmTxt = farm.length ? ` con ${farm.map(function (x) { return String(x).toLowerCase(); }).join(', ')}` : '';
  let sedStr = bnm ? `Sedado${escTxt ? ' ' + escTxt : ''}+BNM${sasTxt || ' para meta SAS 1'}${farmTxt}.`
             : (sed === 'Sin sedación') ? 'Sin sedoanalgesia.'
             : `Sedado${vigilTxt} ${escTxt}${sasTxt}${farmTxt}.`;
  // GCS: el total (SED_GCS_TOT="11T") y la verbal (SED_GCS_V="1T") ya vienen con
  // "T" desde el cliente en intubado; /15 solo para paciente sin VA artificial.
  sedStr += ` GCS ${gcsTot}${intubado ? '' : '/15'} (O:${gcsO}, V:${gcsV}, M:${gcsM})`;
  const s5qTxt = s5q === 'lt3' ? '<3' : (s5q === 'gte3' ? '≥3' : s5q);
  if (s5q)  sedStr += `, S5Q ${s5qTxt}/5`;
  // Cooperación: solo si NO está profundamente sedado (SAS ≠ 1-2 o GCS > 7).
  const _sasN = parseInt(sas, 10), _gcsN = parseInt(gcsTot, 10);
  if (coop && ((!isNaN(_sasN) && _sasN !== 1 && _sasN !== 2) || (!isNaN(_gcsN) && _gcsN > 7))) sedStr += `, ${coop}`;
  sedStr += '.';
  if (bnm) sedStr += ' Bajo BNM.';
  txt.push(sedStr);

  // 4. Hemodinamia
  const hEst = v('HEMO_ESTADO') || 'Estable';
  const dva  = v('HEMO_DVA');
  const mDVA = esVerdadero(d.HEMO_MULTI_DVA), nDVA = v('HEMO_NUM_DVA');
  const tend = esVerdadero(d.HEMO_TENDENCIA), tendT = v('HEMO_TEND_TIPO');
  // Formato pedido por Diego (ago-2026): «HDN estable c/DVA en dosis bajas
  // para meta PAM 65» — corto, y la meta PAM (que JAMÁS llegaba al texto,
  // reporte de Álvaro) inmediatamente después de la HDN.
  let hemoStr = `HDN ${hEst === 'Estable' ? 'estable' : 'inestable'}`;
  if (!dva || dva === 'Sin requerimientos' || dva === 'sin DVA') hemoStr += ' s/DVA';
  else {
    hemoStr += ` c/DVA en ${dva.replace(/^DVA\s*/i, '').toLowerCase().replace(/dosis (baja|media|alta)/, 'dosis $1s')}`;
    if (mDVA && nDVA) hemoStr += ` (${nDVA} drogas en paralelo)`;
  }
  if (esVerdadero(d.HEMO_META_PAM) && v('HEMO_PAM')) hemoStr += ` para meta PAM ${v('HEMO_PAM')} mmHg`;
  if (tend && tendT) hemoStr += `, con tendencia a ${tendT}`;
  txt.push(hemoStr + '.');
  const pic = vn('HEMO_PIC'), ppc = vn('HEMO_PPC');
  if (pic > 0 || ppc > 0) {
    const nm = [];
    if (pic > 0) nm.push(`PIC ${pic} mmHg`);
    if (ppc > 0) nm.push(`PPC ${ppc} mmHg`);
    txt.push('Neuromonitoreo: ' + nm.join(', ') + '.');
  }
  // DVE: la sigla se expande porque la evolución la lee también un médico fuera
  // de la UCI. Espejo del cliente (index.html) — mantener en paridad.
  if (esVerdadero(d.NEURO_DVE)) {
    const dveAlt = vn('NEURO_DVE_ALTURA');
    txt.push('Derivación ventricular externa (DVE)' + (dveAlt > 0 ? ` a ${dveAlt} cmH2O` : '') + '.');
  }

  // 5. Vía aérea
  const diasVA = v('DIAS_VA');
  const totN = v('VENT_TOT_NUM'), totCm = v('VENT_TOT_CM'), tqtT = v('VENT_TQT_TIPO');
  const conMotivo = m => { m = String(m || '').trim(); if (!m) return ''; const ml = m.toLowerCase(); return (ml.indexOf('por ') === 0 || ml.indexOf('para ') === 0) ? ' ' + ml : ' por ' + ml; };
  if (va === 'TOT' && esVerdadero(d.TOT_CAMBIO)) {
    txt.push(`Se realiza cambio de TOT${conMotivo(v('TOT_CAMBIO_MOTIVO'))}.`);
  }
  if (va === 'TQT' && esVerdadero(d.TQT_CAMBIO)) {
    txt.push(`Se realiza cambio de cánula de TQT${conMotivo(v('TQT_CAMBIO_MOTIVO'))}.`);
  }
  if (va === 'TOT') {
    // Redacción y norma estandarizadas (ago-2026, Diego): «a X cm de arcada
    // dental» — el punto de fijación es norma de la unidad, no una elección.
    const desc = (totN || totCm) ? ` N° ${totN || '?'} a ${totCm || '?'} cm de arcada dental` : '';
    txt.push(`VAA mediante TOT${desc} (día ${diasVA || '?'})${esVerdadero(d.TOT_CAMBIO) ? ' (tubo nuevo)' : ''}.`);
  } else if (va === 'TQT' && !esVerdadero(d.TQT_OCURRIO)) {
    const tqtN = v('VENT_TQT_CALIBRE');
    const desc = (tqtN ? ` N° ${tqtN}` : '') + (tqtT ? ` tipo ${tqtT}` : '');
    txt.push(`VAA mediante TQT${desc} (día ${diasVA || '?'})${esVerdadero(d.TQT_CAMBIO) ? ' (cánula nueva)' : ''}.`);
  } else if (va === 'Full Face' || va === 'Oronasal') {
    txt.push(`Paciente con máscara ${va} de VNI.`);
  }
  // TQT instalada ESTE turno: puede venir de TOT o Natural. La justificación
  // son los DÍAS DE VM; el previo se guarda pero no se narra, y la ventilación
  // actual la describe el «Queda con».
  if (esVerdadero(d.TQT_OCURRIO)) {
    const tqtN = v('VENT_TQT_CALIBRE');
    const tec = String(v('TQT_TECNICA') || '').toLowerCase();
    const hq = v('TQT_HORA');
    const det = String(v('TQT_DET') || '').trim();
    const dvmN = parseInt(d.DIAS_VM);
    const tras = (!isNaN(dvmN) && dvmN > 0) ? `Tras ${dvmN} día${dvmN === 1 ? '' : 's'} de VM, se` : 'Se';
    txt.push(`${tras} realiza traqueostomía${tec ? ' ' + tec : ''}${hq ? ' a las ' + hq + ' hrs' : ''}, con cánula N° ${tqtN || '?'}${tqtT ? ' ' + String(tqtT).toLowerCase() : ''}${det ? ' (' + det + ')' : ''}.`);
    const tSop = v('TQT_SOP_POST'), tModo = v('TQT_MODO_POST'), tPar = v('TQT_PARAMS');
    if (tSop || tModo) {
      let q = tSop === 'VM' ? `Queda conectado a VM${tModo ? ' en modo ' + tModo : ''}`
            : `Queda en ${tSop || 'oxigenoterapia'}${tModo ? ', ' + _lcIni(tModo) : ''}`;
      txt.push(q + (tPar ? `. ${tPar}` : '') + '.');
    }
  }

  // 6. Parámetros ventilatorios
  const sop = v('VENT_SOPORTE') || 'Ambiente';
  const modo = v('VENT_MODO') || '';
  const diasSop = v('DIAS_VM');
  const vt = vn('VENT_VT'), fr = vn('VENT_FR'), peep = vn('VENT_PEEP');
  const pmax = vn('VENT_PMAX'), fio2 = vn('VENT_FIO2'), spo2 = vn('VENT_SPO2');
  const mlkg = vn('CALC_ML_KG'), vm = vn('CALC_VOL_MIN'), dp = vn('CALC_DP');
  const ipap = vn('VENT_IPAP'), epap = vn('VENT_EPAP'), ps = vn('VENT_PS');
  const flujo = vn('VENT_FLUJO'), irox = vn('CALC_IROX'), tobin = vn('CALC_TOBIN');
  const hact = esVerdadero(d.VENT_H_ACTIVA);
  const pafi = vn('VENT_PAFI');

  let ventStr = '';
  if (esVerdadero(d.TQT_OCURRIO)) {
    // TQT este turno: el estado ventilatorio previo se omite del texto
  } else if (sop === 'VM') {
    // Intro + parámetros en 3 líneas: volúmenes/frecuencia · presiones/mecánica · oxigenación
    const pinsp = vn('VENT_PINSP'), pmedia = vn('VENT_PMEDIA'), ppl = vn('VENT_PPL');
    const autopeep = vn('VENT_AUTOPEEP'), cesr = vn('CALC_CESR'), ie = v('CALC_IE'), ti = vn('VENT_TI');
    let intro = `En VMI, modo ${modo || '?'} (día ${diasSop || '?'} de VM)`;
    if (d.VENT_ADAPTADO !== undefined && d.VENT_ADAPTADO !== null && d.VENT_ADAPTADO !== '') {
      intro += `, con ${esVerdadero(d.VENT_ADAPTADO) ? 'adecuada' : 'inadecuada'} interacción P-VM`;
    }
    if (hact) intro += ', con humidificación activa';
    txt.push(intro + '.');
    const j = a => a.filter(Boolean).join(', ');
    const l1 = j([
      vt > 0 ? `Vti ${vt} ml${mlkg > 0 ? ` (${mlkg} ml/kg PI)` : ''}` : null,
      ps > 0 ? `PS ${ps} cmH₂O` : null,
      pinsp > 0 ? `Pinsp ${pinsp} cmH₂O` : null,
      fr > 0 ? `FR ${fr} rpm` : null,
      vm > 0 ? `VM ${vm} L/min` : null,
      flujo > 0 ? `Flujo ${flujo} L/min` : null,
      ti > 0 ? `Ti ${ti} s` : null,
      ie ? `I:E ${ie}` : null,
      tobin > 0 ? `Índice de Tobin ${tobin}` : null,
    ]);
    const l2 = j([
      pmax > 0 ? `Pmax ${pmax} cmH₂O` : null,
      pmedia > 0 ? `Pmedia ${pmedia} cmH₂O` : null,
      peep > 0 ? `PEEP ${peep} cmH₂O` : null,
      ppl > 0 ? `Ppl ${ppl} cmH₂O` : null,
      autopeep > 0 ? `AutoPEEP ${autopeep} cmH₂O` : null,
      dp > 0 ? `DP ${dp} cmH₂O` : null,
      cesr > 0 ? `Cesr ${cesr} ml/cmH₂O` : null,
    ]);
    const umaVM = v('KTM_UMA');
    const l3 = j([
      fio2 > 0 ? `FiO₂ ${fio2}%` : null,
      spo2 > 0 ? `SpO₂ ${spo2}%` : null,
      pafi > 0 ? `PaFiO₂ ${pafi}` : null,
      umaVM ? `UMA ${umaVM}` : null,
    ]);
    if (l1) txt.push(`Parámetros: ${l1}.`);
    if (l2) txt.push(l2 + '.');
    if (l3) txt.push(l3 + '.');
  } else if (sop === 'VNI') {
    const ipapMax = vn('VENT_IPAP_MAX');
    // Modo CPAP: la presión única viaja en la columna del PEEP — narrar
    // IPAP/EPAP dejaba «IPAP ?/? cmH₂O» (reporte de Diego, ago-2026).
    if (modo === 'CPAP') ventStr = `En VNI modo CPAP, CPAP ${peep > 0 ? peep : '?'} cmH₂O`;
    else ventStr = `En VNI modo ${modo}, IPAP ${ipap > 0 ? ipap : '?'}${ipapMax > 0 ? '–' + ipapMax : ''}/${epap > 0 ? epap : '?'} cmH₂O`;
    if (vt > 0) ventStr += `, VT ${vt} ml`;
    if (fio2 > 0) ventStr += `, FiO₂ ${fio2}%`;
    if (spo2 > 0) ventStr += `, SpO₂ ${spo2}%`;
    if (pafi > 0) ventStr += `, PaFiO₂ ${pafi}`;
    txt.push(ventStr + '.');
  } else if (modo === 'CNAF' || modo === 'OAF/CTAF' || sop === 'CNAF') {
    // v2: CNAF/OAF es un MODO bajo soporte 'Oxigenoterapia/OAF' (sop==='CNAF' cubre filas v1)
    const temp = vn('VENT_TEMP'), umaC = v('KTM_UMA');
    txt.push(`Ventila espontáneo con apoyo de ${modo || 'CNAF'}${hact ? ' con humidificación activa' : ''}.`);
    const pb = [
      flujo > 0 ? `Flujo ${flujo} L/min` : null,
      temp > 0 ? `T° ${temp}°C` : null,
      fio2 > 0 ? `FiO2 ${fio2}%` : null,
      fr > 0 ? `FR ${fr} rpm` : null,
      umaC ? `UMA ${umaC}` : null,
      spo2 > 0 ? `SpO2 ${spo2}%` : null,
      irox > 0 ? `índice ROX ${irox}` : null,
    ].filter(Boolean).join(', ');
    if (pb) txt.push(`Parámetros: ${pb}.`);
  } else if (sop === 'Oxigenoterapia/OAF' || sop === 'Oxigenoterapia') {
    // Naricera/MMV/MR — y HME/Tubo T/válvula de fonación en TQT sin VM
    const litros = vn('VENT_LITROS'), umaO = v('KTM_UMA');
    // La sigla se expande: la evolución la leen también fuera de la unidad, y
    // «por MR» no dice nada. «Mascarilla» sigue mapeada por las evoluciones
    // anteriores a ago-2026, cuando MR se llamaba así. Espejo de _MODO_LARGO
    // en el cliente (index.html) — mantener en paridad.
    const _MODO_LARGO = { 'MR': 'mascarilla de reservorio', 'Mascarilla': 'mascarilla de reservorio' };
    const dev = (modo && modo !== 'Sin soporte') ? (_MODO_LARGO[modo] || modo) : '';
    if (modo === 'Válvula de fonación') {
      txt.push(`Ventila espontáneo con válvula de fonación${(litros > 0 || fio2 > 0) ? ' y O2 adicional' : ''}.`);
    } else {
      txt.push(`Ventila espontáneo con FiO2 adicional${dev ? ' por ' + dev : ''}.`);
    }
    const pb = [
      litros > 0 ? `${litros} Lpm` : null,
      fio2 > 0 ? `FiO2 ${fio2}%` : null,
      fr > 0 ? `FR ${fr} rpm` : null,
      umaO ? `UMA ${umaO}` : null,
      spo2 > 0 ? `SpO2 ${spo2}%` : null,
    ].filter(Boolean).join(', ');
    if (pb) txt.push(`Oxigenoterapia: ${pb}.`);
  } else {
    const umaA = v('KTM_UMA');
    const vfon = (modo === 'Válvula de fonación') ? ' con válvula de fonación' : '';
    const partes = [
      fr > 0 ? `FR ${fr} rpm` : null,
      umaA ? `UMA ${umaA}` : null,
      spo2 > 0 ? `SpO2 ${spo2}%` : null,
    ].filter(Boolean);
    txt.push(`Ventila espontáneo${vfon} sin O2 adicional${partes.length ? ', ' + partes.join(', ') : ''}.`);
  }

  // PVE / extubación — narrativa clínica (paridad con el preview del cliente)
  (function () {
    const pveVal = v('PVE_VAL'), pveRes = v('PVE_RESULTADO');
    const extH = v('EXT_HORA'), extTipo = v('EXT_TIPO'), extMot = v('EXT_MOTIVO');
    const postDet = v('EXT_POST_DET'), peModo = v('EXT_PE_MODO');
    const horaTxt = extH ? ` a las ${extH} hrs` : '';
    const queda = () => {
      if (peModo) txt.push(`Paciente queda con ${peModo === 'Ambiente' ? 'vía aérea natural sin soporte' : peModo}${postDet ? '. ' + postDet : ''}.`);
      else if (postDet) txt.push(postDet + '.');
    };
    // NO CORRESPONDE (ago-2026, pedido de Manuel): el paciente sigue en VM
    // porque la causa que lo llevó ahí no está resuelta, así que no procede ni
    // PVE ni extubación. No es lo mismo que «no se hizo»: aquí la prueba
    // todavía no está sobre la mesa, y por eso el turno no cuenta como
    // candidato a PVE ni suma a la racha de la alerta.
    if (pveVal === 'nc') {
      txt.push('No procede PVE ni extubación en este turno: causa de base no resuelta. Mantiene soporte ventilatorio.');
      return;
    }
    if (pveVal === 'si') {
      if (pveRes === 'superada') {
        txt.push(`Se realiza PVE con resultado superado, progresando a extubación${horaTxt}.`);
        if (esVerdadero(d.EXT_REINTUB)) {
          const rz = v('EXT_REINTUB_RAZ'), rh = v('REINTUB_HORA');
          txt.push(`Sin embargo, paciente evoluciona con ${(rz || 'falla respiratoria').toLowerCase()} por lo que se reintuba${rh ? ' a las ' + rh + ' hrs' : ''}${_reintubEquipoTxt(d)}.`);
        } else queda();
      } else if (pveRes === 'frustra') {
        let mots = [];
        try { mots = JSON.parse(d.PVE_FR_MOTIVOS || '[]') || []; } catch (e) {}
        const mstr = mots.length ? mots.join(', ') : 'aspectos clínicos';
        txt.push(`Se realiza PVE según protocolo con resultado fallido por ${mstr}. Paciente continúa con soporte ventilatorio.`);
      } else txt.push('Se realiza PVE según protocolo.');
    } else if (pveVal === 'no' && !esVerdadero(d.EXT_OCURRIO)) {
      // Paridad con el cliente (ago-2026): la razón de NO hacer PVE —
      // «Decisión médica» entre ellas — no llegaba al texto del servidor.
      const scR = v('PVE_SC_RAZON'), scD = v('PVE_SC_DET');
      txt.push(`No se realiza PVE en este turno${scR ? ' por ' + _lcIni(scR) : ''}${scD ? ' (' + scD + ')' : ''}. Mantiene soporte ventilatorio.`);
    } else if (esVerdadero(d.EXT_OCURRIO)) {
      let e2 = extTipo === 'autoextubacion' ? `Paciente se autoextuba${horaTxt}`
             : extTipo === 'accidental' ? `Extubación accidental${horaTxt}`
             : `Se realiza extubación${extTipo === 'sin_protocolo' ? ' sin protocolo' : ''}${horaTxt}`;
      if (extMot) e2 += `. ${extMot}`;
      txt.push(e2 + '.');
      if (esVerdadero(d.EXT_REINTUB)) {
        const rz = v('EXT_REINTUB_RAZ'), rh = v('REINTUB_HORA');
        txt.push(`Posteriormente requiere reintubación${rh ? ' a las ' + rh + ' hrs' : ''}${rz ? ' por ' + rz.toLowerCase() : ''}${_reintubEquipoTxt(d)}.`);
      } else queda();
    }
  })();

  // RCP del turno (evento no derivable): va al texto, a la entrega y al timeline
  if (esVerdadero(d.PROC_RCP)) {
    const ciclos = v('PROC_RCP_CICLOS'), hr = v('PROC_RCP_HORA'), det = v('PROC_RCP_DET');
    txt.push(`Se realiza reanimación cardiopulmonar${hr ? ' a las ' + hr + ' hrs' : ''}${ciclos ? `, ${ciclos} ciclo${ciclos === '1' ? '' : 's'}` : ''}${det ? '. ' + det : ''}.`);
  }
  // Desvinculación de VM (TQT) — paridad con el preview del cliente
  if (esVerdadero(d.DESVINC_OCURRIO)) {
    const dh = v('DESVINC_HORA'), da = v('DESVINC_A'), dm = v('DESVINC_MOTIVO');
    let t1 = `Se desvincula de ventilación mecánica${dh ? ' a las ' + dh + ' hrs' : ''}${da ? ', quedando con ' + da : ''}`;
    if (dm) t1 += ` (${_lcIni(dm)})`;
    txt.push(t1 + '.');
    if (esVerdadero(d.DESVINC_RECONEXION)) {
      const hrs = String(d.DESVINC_HORAS || '').replace('.', ',');
      txt.push(`Se reconecta a VM${v('DESVINC_HORA_RECON') ? ' a las ' + v('DESVINC_HORA_RECON') + ' hrs' : ''}${hrs ? `, completando ${hrs} h de desvinculación` : ''}.`);
    } else {
      txt.push('Continúa desvinculado de VM al término del turno.');
    }
    if (v('DESVINC_DET')) txt.push(v('DESVINC_DET') + '.');
  }
  // Válvula de fonación — uso del turno (Rehabilitación)
  if (esVerdadero(d.VFON_USADA)) {
    let t2 = `Se instala válvula de fonación${v('VFON_MIN') ? ' por ' + v('VFON_MIN') + ' minutos' : ''}`;
    if (v('VFON_TOL')) t2 += `, con tolerancia ${_lcIni(v('VFON_TOL'))}`;
    if (v('VFON_DET')) t2 += `. ${v('VFON_DET')}`;
    txt.push(t2 + '.');
  }
  // Gases arteriales del turno (bloque opcional)
  if (esVerdadero(d.GSA_TOMADA)) {
    const g = (k, lbl, u) => { const x = v(k); return x ? `${lbl} ${String(x).replace('.', ',')}${u || ''}` : null; };
    const gp = [g('GSA_PH', 'pH'), g('GSA_PAO2', 'PaO2', ' mmHg'), g('GSA_PACO2', 'PaCO2', ' mmHg'),
                g('GSA_HCO3', 'HCO3', ' mEq/L'), g('GSA_EB', 'EB'), g('GSA_LACTATO', 'lactato', ' mmol/L'),
                g('GSA_SAO2', 'SaO2', '%')].filter(Boolean).join(', ');
    if (gp) txt.push(`GSA${v('GSA_HORA') ? ' de las ' + v('GSA_HORA') + ' hrs' : ''}: ${gp}.${v('GSA_INTERP') ? ' ' + v('GSA_INTERP') + '.' : ''}`);
  }

  // Decanulación (evento del turno, VA=TQT)
  if (esVerdadero(d.DECAN_OCURRIO)) {
    const dt = v('DECAN_TIPO');
    const dtTxt = dt === 'protocolo' ? ' según protocolo' : dt === 'sin_protocolo' ? ' sin protocolo' : dt === 'accidental' ? ' accidental' : '';
    const dh = v('DECAN_HORA');
    const vfh = parseInt(d._VFON_HORAS) || 0;
    const cumple = vfh >= 12 ? `Cumple ~${vfh} h con válvula de fonación, por lo que se` : 'Se';
    let t2 = `${cumple} realiza decanulación${dtTxt}${dh ? ' a las ' + dh + ' hrs' : ''}`;
    if (esVerdadero(d.DECAN_RECANUL)) t2 += ', sin embargo paciente requiere recanulación';
    else {
      const dq = v('DECAN_QUEDA_DISP'), df = v('DECAN_QUEDA_FLUJO'), ds = v('DECAN_QUEDA_SPO2');
      if (dq) t2 += `, quedando con ${dq}${df ? ' ' + df : ''}${ds ? `, SpO2 ${ds}%` : ''}`;
    }
    const dd = v('DECAN_DET');
    if (dd) t2 += `. ${dd}`;
    txt.push(t2 + '.');
  }

  // Reintubación sin extubación este turno (VA venía no invasiva)
  if (esVerdadero(d.EXT_REINTUB) && !esVerdadero(d.EXT_OCURRIO)) {
    const rh = v('REINTUB_HORA'), rz = v('EXT_REINTUB_RAZ');
    txt.push(`Paciente requirió reintubación${rh ? ' a las ' + rh + ' hrs' : ''}${rz ? ' por ' + rz.toLowerCase() : ''}${_reintubEquipoTxt(d)}.`);
  }
  // Intubación nueva este turno (sin historial de VM)
  if (esVerdadero(d.INTUB_OCURRIO)) {
    const ih = v('INTUB_HORA'), idt = v('INTUB_DET'), isp = v('INTUB_SOP_PREVIO');
    const prevTxt = isp ? `Previo en ${_lcIni(isp)}, p` : 'P';
    txt.push(`${prevTxt}aciente requiere intubación orotraqueal${ih ? ' a las ' + ih + ' hrs' : ''}${idt ? ' en contexto de ' + idt : ''}.`);
    // Cómo QUEDA tras el procedimiento (el estado previo vive en las VENT_*)
    const pva = v('INTUB_VA_POST') || 'TOT', psop = v('INTUB_SOP_POST') || 'VM', pmodo = v('INTUB_MODO_POST');
    const ptn = v('INTUB_TOT_N'), ptc = v('INTUB_TOT_CM');
    if (pva || psop || pmodo) {
      let q = `Queda con ${pva === 'TQT' ? 'TQT' : 'TOT'}${ptn ? ' N° ' + ptn : ''}${ptc ? ' a ' + ptc + ' cm de arcada dental' : ''}`;
      q += psop === 'VM' ? `, conectado a VM${pmodo ? ' en modo ' + pmodo : ''}` : (pmodo ? ', en ' + pmodo : '');
      const pp = [v('INTUB_VT') ? `Vt ${v('INTUB_VT')} ml` : null, v('INTUB_FR') ? `FR ${v('INTUB_FR')} rpm` : null,
                  v('INTUB_PINSP') ? `Pinsp ${v('INTUB_PINSP')} cmH2O` : null,
                  v('INTUB_PS') ? `PS ${v('INTUB_PS')} cmH2O` : null,
                  v('INTUB_PMAX') ? `Pmax ${v('INTUB_PMAX')} cmH2O` : null,
                  v('INTUB_PPL') ? `Ppl ${v('INTUB_PPL')} cmH2O` : null,
                  v('INTUB_PEEP') ? `PEEP ${v('INTUB_PEEP')} cmH2O` : null,
                  v('INTUB_AUTOPEEP') ? `AutoPEEP ${v('INTUB_AUTOPEEP')} cmH2O` : null,
                  v('INTUB_FIO2') ? `FiO2 ${v('INTUB_FIO2')}%` : null,
                  v('INTUB_SPO2') ? `SpO2 ${v('INTUB_SPO2')}%` : null,
                  v('INTUB_PAFI') ? `PaFiO2 ${v('INTUB_PAFI')}` : null].filter(Boolean).join(', ');
      txt.push(q + (pp ? `. ${pp}` : '') + '.');
    }
  }

  // 7. Auscultación (las secreciones van en la línea de KTR, como el preview)
  const mp = v('EX_MP'), ruidos = v('EX_RUIDOS'), ruidosLoc = v('EX_RUIDOS_LOC');
  const ruidosText = ruidos === 'Otro' && ruidosLoc ? ruidosLoc : ruidos;
  let exStr = '';
  if (mp) {
    const mpTxt = mp === 'Presente Bilateral' ? 'MP(+) bilateral'
                : /^Abolido/i.test(mp) ? 'MP(−) ' + mp.replace(/^Abolido\s*/i, 'abolido ')
                : 'MP(+), ' + mp;
    exStr += `Auscultación: ${mpTxt}`;
  }
  // Comparación SIN distinguir mayúsculas (Diego, ago-2026): el select guarda
  // «Sin ruidos agregados» y la comparación exacta en minúscula nunca calzaba
  // — salía el oxímoron «…con Sin ruidos agregados».
  if (ruidosText && !/^sin ruidos/i.test(ruidosText)) exStr += `${mp ? ', con ' : 'Auscultación: '}${ruidosText}${ruidosLoc && ruidos !== 'Otro' ? ' ' + ruidosLoc : ''}`;
  else if (ruidosText) exStr += `, sin ruidos agregados`;
  if (exStr) txt.push(exStr + '.');

  // 7b. KTR / manejo respiratorio (paridad con el preview del cliente)
  (function () {
    if (esVerdadero(d.RESP_SIN_KTR)) { txt.push('Sin requerimientos de KTR en turno.'); return; }
    const perm = [];
    if (esVerdadero(d.RESP_SET)) perm.push('SET');
    if (esVerdadero(d.RESP_SOF)) perm.push('SOF');
    if (esVerdadero(d.RESP_SNF)) perm.push('SNF');
    if (esVerdadero(d.RESP_SNT)) perm.push('SNT');
    if (esVerdadero(d.RESP_ATOS)) perm.push('asistencia de tos');
    const reol = v('RESP_SECR_REOL'), car = v('RESP_SECR_CAR'), qty = v('RESP_SECR_QTY');
    const qtyTxt = { '+': 'escasa cantidad', '++': 'moderada cantidad', '+++': 'abundante cantidad' }[qty] || '';
    // La reología DESCRITA siempre se narra (ago-2026, reporte de Álvaro):
    // antes la frase entera dependía de la cantidad, y una reología sin
    // cantidad marcada desaparecía del texto. Y el «−» explícito SE NARRA
    // como «sin secreciones» (Diego, ago-2026, mismo criterio de la UMA (−)):
    // evaluar y no encontrar nada es un hallazgo, no una omisión. Solo el
    // no-registro ('') queda en silencio.
    // Y 'auto' (15-ago-2026, rescatado del SmartEvo, redacción de Diego): hay
    // secreciones pero NO se aspiran — el paciente las tose, moviliza y
    // deglute. Solo se ofrece SIN vía aérea artificial (con TOT/TQT se aspira
    // y se ve); sin nada aspirado, no hay reología ni características que
    // narrar.
    const secrParts = [];
    if (qty !== '-' && qty !== 'auto') {
      if (reol) secrParts.push(reol.toLowerCase());
      if (car) secrParts.push(car.toLowerCase());
      if (qtyTxt) secrParts.push('en ' + qtyTxt);
    }
    const secrTxt = secrParts.length ? `, secreciones ${secrParts.join(' ')}`
      : (qty === '-' ? ', sin secreciones' : (qty === 'auto' ? ', tose, moviliza y deglute secreciones' : ''));
    if (v('EX_CULT_RESULTADO')) txt.push('Resultado de cultivo: ' + v('EX_CULT_RESULTADO') + '.');
    let linea = '';
    if (perm.length) linea = `KTR + ${perm.join(' + ')}${secrTxt}`;
    else if (secrParts.length) linea = `Secreciones ${secrParts.join(' ')}`;
    else if (qty === '-') linea = 'Sin secreciones';
    else if (qty === 'auto') linea = 'Tose, moviliza y deglute secreciones';
    if (linea) txt.push(linea + '.');
    if (esVerdadero(d.RESP_INHALO)) txt.push('Se administra inhaloterapia según indicación médica (SOS).');
    // «Posicionamiento:» SALIÓ del generador (ago-2026, Bloque C de Diego):
    // sedente/DCL/texto libre ya no se narran (las columnas siguen guardándose).
    // El prono y el supino se narran SOLOS, como eventos con su hora.
    if (esVerdadero(d.RESP_POS_PRONO) && esVerdadero(d.RESP_PRONO_EVENTO)) {
      txt.push(v('RESP_PRONO_HORA') ? `Se prona a las ${v('RESP_PRONO_HORA')} hrs.` : 'Se prona en este turno.');
    } else if (esVerdadero(d.RESP_POS_PRONO)) {
      txt.push('Paciente continúa en prono.');
    }
    if (esVerdadero(d.RESP_POS_SUPINO) && esVerdadero(d.RESP_SUPINO_EVENTO)) {
      // El ciclo de prono puede durar varios días: al supinar se narra cuánto duró.
      const ph = String(d.PRONO_HORAS === 0 ? '0' : (d.PRONO_HORAS || '')).replace('.', ',');
      const cierre = ph ? `, tras ${ph} h en prono` : '';
      txt.push(v('RESP_SUPINO_HORA') ? `Se supina a las ${v('RESP_SUPINO_HORA')} hrs${cierre}.` : `Se supina en este turno${cierre}.`);
    }
  })();

  // 8. KTM
  const ktmR = esVerdadero(d.KTM_REALIZADA), ktmS = esVerdadero(d.KTM_SUSPENDIDA);
  const nivel = v('KTM_NIVEL_KTR'), tiempo = v('KTM_TIEMPO_MIN');
  const contra = v('KTM_CONTRA_RAZON') || v('KTM_CONTRA_MANUAL');
  const uma = v('KTM_UMA');
  if (ktmR) {
    const ktmCant = Math.min(9, Math.max(1, parseInt(v('KTM_CANT')) || 1));
    const nivTxt = nivel ? ` nivel ${nivel}` : '';
    let ktmStr = ktmCant > 1 ? `Se realizan ${ktmCant} sesiones de KTM${nivTxt}` : `Se realiza KTM${nivTxt}`;
    if (v('KTM_ASISTENCIA')) ktmStr += ` con asistencia ${v('KTM_ASISTENCIA').toLowerCase()}`;
    if (tiempo) ktmStr += ` durante ${tiempo} minutos`;
    if (uma) ktmStr += `. UMA ${uma}`;
    txt.push(ktmStr + '.');
  } else if (ktmS) {
    const tipoContra = v('KTM_CONTRA_TIPO');
    txt.push(`KTM no realizada. Contraindicación ${tipoContra ? tipoContra.toLowerCase() : ''}: ${contra || 'sin especificar'}.`);
  } else if (esVerdadero(d.KTM_NO_REALIZADA)) {
    const nr = v('KTM_NO_RAZON'), nc = v('KTM_NO_COMENTARIO');
    let s2 = 'KTM no realizada';
    // Las razones son etiquetas del catálogo; en el texto se narran natural
    if (nr) s2 += ` por ${({ 'Motivo ingreso': 'ingreso reciente', 'Sin equipo o tiempo disponible': 'falta de equipo o tiempo disponible' })[nr] || nr.toLowerCase()}`;
    if (nc) s2 += `. ${nc}`;
    txt.push(s2 + '.');
  }
  // IMT / EMS — paridad con el preview del cliente (genTexto)
  if (esVerdadero(d.KTM_IMT)) {
    let imt = 'Se realiza IMT';
    if (v('KTM_IMT_FREQ')) imt += ` ${v('KTM_IMT_FREQ')} series`;
    if (v('KTM_IMT_INT')) imt += ` al ${v('KTM_IMT_INT')}% de PiMáx`;
    if (v('KTM_IMT_T')) imt += ` por ${v('KTM_IMT_T')} min`;
    if (v('KTM_IMT_DES')) imt += `, descanso ${v('KTM_IMT_DES')} seg entre series`;
    txt.push(imt + '.');
  }
  if (esVerdadero(d.KTM_EMS)) {
    let ems = 'Se realiza electroestimulación neuromuscular (EMS)';
    if (v('KTM_EMS_GRUPO')) ems += ` en ${v('KTM_EMS_GRUPO').toLowerCase()}`;
    const emsP = [v('KTM_EMS_FREQ') ? `${v('KTM_EMS_FREQ')} Hz` : '',
                  v('KTM_EMS_INT') ? `${v('KTM_EMS_INT')} mA` : '',
                  v('KTM_EMS_PULSO') ? `ancho de pulso ${v('KTM_EMS_PULSO')} µs` : ''].filter(Boolean);
    if (emsP.length) ems += ` (${emsP.join(', ')})`;
    if (v('KTM_EMS_T')) ems += ` por ${v('KTM_EMS_T')} min`;
    txt.push(ems + '.');
  }
  if (esVerdadero(d.KTM_ALERTA)) {
    txt.push(`KTM suspendida durante la sesión por señal de alerta ${(v('KTM_ALERTA_CAT') || '').toLowerCase()}: ${v('KTM_ALERTA_RAZ') || 'sin especificar'}.`);
  }
  if (esVerdadero(d.EDU_REALIZADA)) txt.push('Se realiza educación a usuario/cuidador/familia.');

  // 9. Procedimientos: NO se imprimen como lista cruda (van narrados en el texto);
  // PROC_JSON/PROC_RESUMEN quedan solo para la BD y la estadística.

  // Evaluaciones funcionales del turno
  (function () {
    const ev = [];
    if (v('EVAL_T_MRC')) ev.push(`MRC-ss ${v('EVAL_T_MRC')}/60`);
    if (v('EVAL_T_DINAMO')) ev.push(`Dinamometría ${v('EVAL_T_DINAMO')} kg`);
    if (v('EVAL_T_FSS')) ev.push(`FSS-ICU ${v('EVAL_T_FSS')}/35`);
    if (v('CPAX_TOTAL')) ev.push(`CPAx ${v('CPAX_TOTAL')}/50`);
    if (v('EVAL_T_PIM')) ev.push(`PIM ${v('EVAL_T_PIM')} cmH₂O`);
    if (v('EVAL_T_PEM')) ev.push(`PEM ${v('EVAL_T_PEM')} cmH₂O`);
    if (v('EVAL_T_FEM')) ev.push(`FEM ${v('EVAL_T_FEM')} L/min`);
    if (v('EVAL_T_GROSOR')) ev.push(`Grosor diafragmático ${v('EVAL_T_GROSOR')} mm`);
    if (v('EVAL_T_HALLAZGOS')) ev.push(`Ecografía: ${v('EVAL_T_HALLAZGOS')}`);
    if (v('EVAL_T_CUAD_D') || v('EVAL_T_CUAD_I')) ev.push(`Grosor cuádriceps D/I ${v('EVAL_T_CUAD_D') || '—'}/${v('EVAL_T_CUAD_I') || '—'} mm`);
    if (v('EVAL_DEGLUCION')) ev.push(`Deglución: ${v('EVAL_DEGLUCION')}`);
    if (v('EVAL_IMS')) ev.push(`IMS ${v('EVAL_IMS')}/10`);
    else if (v('EVAL_NIVEL_MOTOR')) ev.push(`Hito motor ${v('EVAL_NIVEL_MOTOR')}/6`); // legacy
    if (ev.length) txt.push('Evaluaciones funcionales: ' + ev.join('; ') + '.');
  })();

  // UPOT (procuramiento)
  if (esVerdadero(d.UPOT_ACTIVO)) {
    let u = 'Paciente en seguimiento por UPOT, con sospecha de muerte cerebral';
    const ap = v('APNEA_TEST');
    if (ap) u += `. Test de apnea ${ap.toLowerCase()}`;
    if (esVerdadero(d.UPOT_MEDIDAS)) u += '. Se mantienen medidas de protección de órganos';
    txt.push(u + '.');
  }

  // 10. Muestras
  if (esVerdadero(d.MUE_REALIZADAS)) {
    const tiposStr = v('MUE_TIPOS_JSON');
    let mueStr = `Se obtienen muestras microbiológicas`;
    if (tiposStr) { try { const t = JSON.parse(tiposStr); if (t.length) mueStr += ` (${t.join(', ')})`; } catch (e) {} }
    txt.push(mueStr + '.');
  }

  // 11. Planes y firma
  const planes = v('PLAN_PLANES'), nota = v('PLAN_NOTA_TURNO'), firma = v('PLAN_FIRMA_KINE');
  if (planes) txt.push(`Plan: ${planes}`);
  if (nota)   txt.push(`Nota: ${nota}`);
  // La firma SALIÓ del texto generado (ago-2026, decisión de Diego): al copiar
  // al BUDA estorbaba. La autoría NO se pierde: queda en PLAN_FIRMA_KINE y en
  // la auditoría. _firmaTextoClinico se conserva (la usa la entrega de turno).

  return txt.filter(Boolean).join('\n');
}

/**
 * Inicio propio por fase clínica (ago-2026, pedido de Diego): las fases que
 * son un PROCESO van con «En proceso de …»; second look es una ESPERA y las
 * demás son un estado. Una fase nueva del catálogo cae al genérico «En fase
 * de …» hasta que se le defina inicio.
 */
function _faseIntro(fase) {
  const f = String(fase || '').toLowerCase();
  if (/second look/.test(f)) return 'A la espera de second look.';
  if (/reanimaci|weaning|rehabilitaci/.test(f)) return `En proceso de ${f}.`;
  if (/protecci|neuroprotecci|postoperatorio|postparo/.test(f)) return `En ${f}.`;
  return `En fase de ${f}.`;
}

function _parseFases(faseJson) {
  if (!faseJson) return [];
  try { const a = JSON.parse(faseJson); return Array.isArray(a) ? a.filter(Boolean) : []; }
  catch (e) { return []; }
}

/**
 * Firma → «Klgo./Klga. Nombre Apellido» para el texto clínico (jul-2026).
 * Resuelve desde KINESIOLOGOS (NOMBRE + TRATAMIENTO, default Klgo.);
 * si la firma no está en el roster, cae a «Klgo. <firma>».
 */
let _firmaCache = null;
function _firmaTextoClinico(firma) {
  const f = String(firma || '').trim();
  if (!f) return '';
  try {
    if (!_firmaCache) {
      _firmaCache = {};
      repoLeerTodos('KINESIOLOGOS').forEach(k => {
        if (k.FIRMA) _firmaCache[String(k.FIRMA).trim()] =
          (String(k.TRATAMIENTO || '').trim() || 'Klgo.') + ' ' + String(k.NOMBRE || '').trim();
      });
    }
    return _firmaCache[f] || ('Klgo. ' + f);
  } catch (e) { return 'Klgo. ' + f; }
}
