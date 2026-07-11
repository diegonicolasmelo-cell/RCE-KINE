/**
 * dominio_texto.gs — Generador de texto clínico PURO.
 * Portado desde v1 (se conserva la estética/salida, D8), adaptado a nombres v2:
 *   EX_RUIDOS_MAN→EX_RUIDOS_LOC · EX_SECR_CANT/TIPO→RESP_SECR_QTY/CAR ·
 *   VENT_POST_EXT(_VAL)→EXT_OCURRIO/EXT_POST_DET. Se agrega la fase clínica (FASE_JSON).
 */
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
  if (fases.length) txt.push(`En fase de ${fases.join(', ').toLowerCase()}.`);

  // 3. Sedación / GCS
  const sed = v('SED_TIPO') || 'Sin sedación';
  const sas = v('SED_SAS');
  const gcsO = v('SED_GCS_O') || '?', gcsV = v('SED_GCS_V') || '?', gcsM = v('SED_GCS_M') || '?';
  const gcsTot = v('SED_GCS_TOT') || '?';
  const s5q = v('SED_S5Q'), coop = v('SED_COOPERACION');
  const bnm = esVerdadero(d.SED_BNM);
  const va = v('VENT_VIA_AEREA') || 'Natural';
  const intubado = va === 'TOT' || va === 'TQT';

  let sedStr = bnm                           ? `Sedado+BNM para meta SAS ${sas || '1'}.`
             : (sed === 'Sin sedación')      ? 'Sin sedoanalgesia.'
             : (sed === 'Fuera de escalón')   ? `Sedación fuera de escalón${sas ? ' (SAS ' + sas + ')' : ''}.`
             : `Sedado en ${sed.toLowerCase()}${sas ? ' para SAS ' + sas : ''}.`;
  sedStr += ` GCS ${gcsTot}${intubado ? '' : '/15'}(O:${gcsO}, V:${gcsV}, M:${gcsM})`;
  if (s5q)  sedStr += `, S5Q ${s5q}/5`;
  if (coop) sedStr += ` (${coop})`;
  sedStr += '.';
  if (bnm) sedStr += ' Bajo BNM.';
  txt.push(sedStr);

  // 4. Hemodinamia
  const hEst = v('HEMO_ESTADO') || 'Estable';
  const dva  = v('HEMO_DVA') || 'sin DVA';
  const mDVA = esVerdadero(d.HEMO_MULTI_DVA), nDVA = v('HEMO_NUM_DVA');
  const tend = esVerdadero(d.HEMO_TENDENCIA), tendT = v('HEMO_TEND_TIPO');
  let hemoStr = `Hemodinámicamente ${hEst === 'Estable' ? 'estable' : 'inestable'}`;
  if (dva === 'sin DVA') hemoStr += ', sin requerimientos de drogas vasoactivas';
  else {
    hemoStr += `, con requerimiento de DVA en ${dva.replace(/^DVA\s*/i, '').toLowerCase().replace(/dosis (baja|media|alta)/, 'dosis $1s')}`;
    if (mDVA && nDVA) hemoStr += ` (${nDVA} drogas en paralelo)`;
  }
  if (tend && tendT) hemoStr += `, con tendencia a ${tendT}`;
  txt.push(hemoStr + '.');
  const pic = vn('HEMO_PIC'), ppc = vn('HEMO_PPC');
  if (pic > 0 || ppc > 0) {
    const nm = [];
    if (pic > 0) nm.push(`PIC ${pic} mmHg`);
    if (ppc > 0) nm.push(`PPC ${ppc} mmHg`);
    txt.push('Neuromonitoreo: ' + nm.join(', ') + '.');
  }

  // 5. Vía aérea
  const diasVA = v('DIAS_VA');
  const totN = v('VENT_TOT_NUM'), totCm = v('VENT_TOT_CM'), tqtT = v('VENT_TQT_TIPO');
  if (va === 'TOT') {
    const desc = (totN || totCm) ? ` N° ${totN || '?'} fijado en ${totCm || '?'} cm` : '';
    txt.push(`Paciente con tubo orotraqueal${desc}, en día ${diasVA || '?'} de VA artificial.`);
  } else if (va === 'TQT') {
    const tqtN = v('VENT_TQT_CALIBRE');
    const desc = (tqtN ? ` N° ${tqtN}` : '') + (tqtT ? ` tipo ${tqtT}` : '');
    txt.push(`Paciente con traqueostomía${desc}, en día ${diasVA || '?'} de VA artificial.`);
  } else if (va === 'Full Face' || va === 'Oronasal') {
    txt.push(`Paciente con máscara ${va} de VNI.`);
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

  let ventStr = '';
  if (sop === 'VM') {
    // Intro + parámetros en 3 líneas: volúmenes/frecuencia · presiones/mecánica · oxigenación
    const pinsp = vn('VENT_PINSP'), pmedia = vn('VENT_PMEDIA'), ppl = vn('VENT_PPL');
    const autopeep = vn('VENT_AUTOPEEP'), cesr = vn('CALC_CESR'), ie = v('CALC_IE'), ti = vn('VENT_TI');
    let intro = `En VMI, modo ${modo || '?'}`;
    if (d.VENT_ADAPTADO !== undefined && d.VENT_ADAPTADO !== null && d.VENT_ADAPTADO !== '') {
      intro += `, con ${esVerdadero(d.VENT_ADAPTADO) ? 'adecuada' : 'inadecuada'} interacción P-VM`;
    }
    intro += `, en día ${diasSop || '?'} de VM`;
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
      umaVM ? `UMA ${umaVM}` : null,
    ]);
    if (l1) txt.push(`TV: ${l1}.`);
    if (l2) txt.push(l2 + '.');
    if (l3) txt.push(l3 + '.');
  } else if (sop === 'VNI') {
    const ipapMax = vn('VENT_IPAP_MAX');
    ventStr = `En VNI modo ${modo}, IPAP ${ipap > 0 ? ipap : '?'}${ipapMax > 0 ? '–' + ipapMax : ''}/${epap > 0 ? epap : '?'} cmH₂O`;
    if (vt > 0) ventStr += `, VT ${vt} ml`;
    if (fio2 > 0) ventStr += `, FiO₂ ${fio2}%`;
    if (spo2 > 0) ventStr += `, SpO₂ ${spo2}%`;
    txt.push(ventStr + '.');
  } else if (sop === 'CNAF') {
    ventStr = `En CNAF con flujo ${flujo > 0 ? flujo : '?'} L/min, FiO₂ ${fio2 > 0 ? fio2 : '?'}%`;
    if (spo2 > 0) ventStr += `, SpO₂ ${spo2}%`;
    if (irox > 0) ventStr += `, Índice ROX ${irox}`;
    txt.push(ventStr + '.');
  } else if (sop === 'Oxigenoterapia') {
    const litros = vn('VENT_LITROS');
    ventStr = `En oxigenoterapia`;
    if (litros > 0) ventStr += ` con ${litros} L/min`;
    if (fio2 > 0) ventStr += `, FiO₂ ${fio2}%`;
    if (spo2 > 0) ventStr += `, SpO₂ ${spo2}%`;
    txt.push(ventStr + '.');
  } else if (spo2 > 0) {
    txt.push(`En ventilación espontánea en ambiente, SpO₂ ${spo2}%.`);
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
    if (pveVal === 'si') {
      if (pveRes === 'superada') {
        txt.push(`Se realiza PVE con resultado superado, progresando a extubación${horaTxt}.`);
        if (esVerdadero(d.EXT_REINTUB)) {
          const rz = v('EXT_REINTUB_RAZ'), rh = v('REINTUB_HORA');
          txt.push(`Sin embargo, paciente evoluciona con ${(rz || 'falla respiratoria').toLowerCase()} por lo que se reintuba${rh ? ' a las ' + rh + ' hrs' : ''}.`);
        } else queda();
      } else if (pveRes === 'frustra') {
        let mots = [];
        try { mots = JSON.parse(d.PVE_FR_MOTIVOS || '[]') || []; } catch (e) {}
        const mstr = mots.length ? mots.join(', ') : 'aspectos clínicos';
        txt.push(`Se realiza PVE según protocolo con resultado fallido desde lo ${mstr}. Paciente continúa con soporte ventilatorio.`);
      } else txt.push('Se realiza PVE según protocolo.');
    } else if (esVerdadero(d.EXT_OCURRIO)) {
      let e2 = extTipo === 'autoextubacion' ? `Paciente se autoextuba${horaTxt}`
             : extTipo === 'accidental' ? `Extubación accidental${horaTxt}`
             : `Se realiza extubación${extTipo === 'sin_protocolo' ? ' sin protocolo' : ''}${horaTxt}`;
      if (extMot) e2 += `. ${extMot}`;
      txt.push(e2 + '.');
      if (esVerdadero(d.EXT_REINTUB)) {
        const rz = v('EXT_REINTUB_RAZ'), rh = v('REINTUB_HORA');
        txt.push(`Posteriormente requiere reintubación${rh ? ' a las ' + rh + ' hrs' : ''}${rz ? ' por ' + rz.toLowerCase() : ''}.`);
      } else queda();
    }
  })();

  // Decanulación (evento del turno, VA=TQT)
  if (esVerdadero(d.DECAN_OCURRIO)) {
    const dt = v('DECAN_TIPO');
    const dtTxt = dt === 'protocolo' ? ' según protocolo' : dt === 'sin_protocolo' ? ' sin protocolo' : dt === 'accidental' ? ' accidental' : '';
    let t2 = `Se realiza decanulación${dtTxt}`;
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
    txt.push(`Paciente requirió reintubación${rh ? ' a las ' + rh + ' hrs' : ''}${rz ? ' por ' + rz.toLowerCase() : ''}.`);
  }
  // Intubación nueva este turno (sin historial de VM)
  if (esVerdadero(d.INTUB_OCURRIO)) {
    const ih = v('INTUB_HORA'), idt = v('INTUB_DET'), isp = v('INTUB_SOP_PREVIO');
    const prevTxt = isp ? `Previo en ${isp.toLowerCase()}, p` : 'P';
    txt.push(`${prevTxt}aciente requiere intubación orotraqueal${ih ? ' a las ' + ih + ' hrs' : ''}${idt ? ' en contexto de ' + idt : ''}.`);
  }

  // 7. Examen físico
  const mp = v('EX_MP'), ruidos = v('EX_RUIDOS'), ruidosLoc = v('EX_RUIDOS_LOC');
  const secrC = v('RESP_SECR_QTY'), secrT = v('RESP_SECR_CAR');
  const ruidosText = ruidos === 'Otro' && ruidosLoc ? ruidosLoc : ruidos;
  let exStr = '';
  if (mp) {
    const mpTxt = mp === 'Presente Bilateral' ? 'MP(+) bilateral'
                : /^Abolido/i.test(mp) ? 'MP(−) ' + mp.replace(/^Abolido\s*/i, 'abolido ')
                : 'MP(+), ' + mp;
    exStr += `Al examen físico: ${mpTxt}`;
  }
  if (ruidosText && ruidosText !== 'sin ruidos agregados') exStr += `, con ${ruidosText}`;
  else if (ruidosText) exStr += `, sin ruidos agregados`;
  if (secrC) { exStr += `. Secreciones ${secrC}`; if (secrT) exStr += ` de característica ${secrT}`; }
  if (exStr) txt.push(exStr + '.');

  // 8. KTM
  const ktmR = esVerdadero(d.KTM_REALIZADA), ktmS = esVerdadero(d.KTM_SUSPENDIDA);
  const nivel = v('KTM_NIVEL_KTR'), tiempo = v('KTM_TIEMPO_MIN');
  const contra = v('KTM_CONTRA_RAZON') || v('KTM_CONTRA_MANUAL');
  const uma = v('KTM_UMA');
  if (ktmR) {
    let ktmStr = `Se realiza KTM nivel ${nivel || '?'}`;
    if (tiempo) ktmStr += ` durante ${tiempo} minutos`;
    if (uma) ktmStr += `. UMA ${uma}`;
    txt.push(ktmStr + '.');
  } else if (ktmS) {
    const tipoContra = v('KTM_CONTRA_TIPO');
    txt.push(`KTM no realizada. Contraindicación ${tipoContra ? tipoContra.toLowerCase() : ''}: ${contra || 'sin especificar'}.`);
  } else if (esVerdadero(d.KTM_NO_REALIZADA)) {
    const nr = v('KTM_NO_RAZON'), nc = v('KTM_NO_COMENTARIO');
    let s2 = 'KTM no realizada';
    if (nr) s2 += ` por ${nr.toLowerCase()}`;
    if (nc) s2 += `. ${nc}`;
    txt.push(s2 + '.');
  }

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
    if (v('EVAL_NIVEL_MOTOR')) ev.push(`Hito motor ${v('EVAL_NIVEL_MOTOR')}/6`);
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
  if (firma)  txt.push(`Kinesiólogo: ${firma}`);

  return txt.filter(Boolean).join('\n');
}

function _parseFases(faseJson) {
  if (!faseJson) return [];
  try { const a = JSON.parse(faseJson); return Array.isArray(a) ? a.filter(Boolean) : []; }
  catch (e) { return []; }
}
