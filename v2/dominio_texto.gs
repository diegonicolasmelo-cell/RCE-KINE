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

  let sedStr = (sed === 'Sin sedación')      ? 'Sin sedoanalgesia.'
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
    hemoStr += `, con requerimiento de DVA en ${dva.replace(/^DVA\s*/i, '').toLowerCase()}`;
    if (mDVA && nDVA) hemoStr += ` (${nDVA} drogas en paralelo)`;
  }
  if (tend && tendT) hemoStr += `, con tendencia a ${tendT}`;
  txt.push(hemoStr + '.');

  // 5. Vía aérea
  const diasVA = v('DIAS_VA');
  const totN = v('VENT_TOT_NUM'), totCm = v('VENT_TOT_CM'), tqtT = v('VENT_TQT_TIPO');
  if (va === 'TOT') {
    const desc = (totN || totCm) ? ` N° ${totN || '?'} fijado en ${totCm || '?'} cm` : '';
    txt.push(`Paciente con tubo orotraqueal${desc}, en día ${diasVA || '?'} de VA artificial.`);
  } else if (va === 'TQT') {
    const desc = tqtT ? ` tipo ${tqtT}` : '';
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
    if (modo === 'ACVC') {
      ventStr = `En VM modalidad ACVC, ` + (vt > 0 ? `VT ${vt} ml` : '');
      if (mlkg > 0) ventStr += ` (${mlkg} ml/kg PI)`;
      ventStr += fr > 0 ? `, FR ${fr} rpm` : '';
      ventStr += vm > 0 ? `, VM ${vm} L/min` : '';
      ventStr += peep > 0 ? `, PEEP ${peep} cmH₂O` : '';
      ventStr += pmax > 0 ? `, Pmax ${pmax} cmH₂O` : '';
      if (dp > 0) ventStr += `, DP ${dp} cmH₂O`;
    } else if (modo === 'ACPC') {
      const pinsp = vn('VENT_PINSP');
      ventStr = `En VM modalidad ACPC, ` + (pinsp > 0 ? `Pinsp ${pinsp} cmH₂O` : '');
      ventStr += vt > 0 ? `, VT ${vt} ml` : '';
      if (mlkg > 0) ventStr += ` (${mlkg} ml/kg PI)`;
      ventStr += fr > 0 ? `, FR ${fr} rpm` : '';
      ventStr += peep > 0 ? `, PEEP ${peep} cmH₂O` : '';
    } else if (modo === 'CPAP/PS') {
      ventStr = `En VM modo CPAP/PS, PS ${ps > 0 ? ps : '?'} cmH₂O + PEEP ${peep > 0 ? peep : '?'} cmH₂O`;
      ventStr += vt > 0 ? `, VT ${vt} ml` : '';
      if (mlkg > 0) ventStr += ` (${mlkg} ml/kg PI)`;
      ventStr += fr > 0 ? `, FR ${fr} rpm` : '';
      if (tobin > 0) ventStr += `, Índice de Tobin ${tobin}`;
    } else {
      ventStr = `En VM modo ${modo}`;
      if (vt > 0) ventStr += `, VT ${vt} ml`;
      if (fr > 0) ventStr += `, FR ${fr} rpm`;
      if (peep > 0) ventStr += `, PEEP ${peep} cmH₂O`;
    }
    if (fio2 > 0) ventStr += `, FiO₂ ${fio2}%`;
    if (spo2 > 0) ventStr += `, SpO₂ ${spo2}%`;
    ventStr += `, en día ${diasSop || '?'} de VM`;
    if (hact) ventStr += '. Con humidificación activa';
    txt.push(ventStr + '.');
  } else if (sop === 'VNI') {
    ventStr = `En VNI modo ${modo}, IPAP ${ipap > 0 ? ipap : '?'}/${epap > 0 ? epap : '?'} cmH₂O`;
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

  // Post-extubación / decanulación (bloque EXT_*)
  if (esVerdadero(d.EXT_OCURRIO)) {
    const det = v('EXT_POST_DET');
    txt.push(`Post-extubación/decanulación${det ? ': ' + det : ''}.`);
  }

  // Reintubación sin extubación este turno (VA venía no invasiva)
  if (esVerdadero(d.EXT_REINTUB) && !esVerdadero(d.EXT_OCURRIO)) {
    const rh = v('REINTUB_HORA'), rz = v('EXT_REINTUB_RAZ');
    txt.push(`Paciente requirió reintubación${rh ? ' a las ' + rh + ' hrs' : ''}${rz ? ' por ' + rz.toLowerCase() : ''}.`);
  }
  // Intubación nueva este turno (sin historial de VM)
  if (esVerdadero(d.INTUB_OCURRIO)) {
    const ih = v('INTUB_HORA'), idt = v('INTUB_DET');
    txt.push(`Paciente requiere intubación orotraqueal${ih ? ' a las ' + ih + ' hrs' : ''}${idt ? ' en contexto de ' + idt : ''}.`);
  }

  // 7. Examen físico
  const mp = v('EX_MP'), ruidos = v('EX_RUIDOS'), ruidosLoc = v('EX_RUIDOS_LOC');
  const secrC = v('RESP_SECR_QTY'), secrT = v('RESP_SECR_CAR');
  const ruidosText = ruidos === 'Otro' && ruidosLoc ? ruidosLoc : ruidos;
  let exStr = '';
  if (mp) exStr += `Al examen físico: murmullo pulmonar ${mp}`;
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
  }

  // 9. Procedimientos
  const procRes = v('PROC_RESUMEN');
  if (procRes) txt.push(`Procedimientos: ${procRes}.`);

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
