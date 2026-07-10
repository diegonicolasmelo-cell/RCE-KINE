/**
 * dominio_calculos.gs — Cálculos clínicos PUROS (sin acceso a Sheets).
 * Portados desde v1 sin cambios de fórmula. Testeables aislados.
 */

/** Peso ideal (kg) por sexo y talla (cm). Fórmula de Devine. */
function calcularPI(sexo, tallaCm) {
  const t = parseFloat(tallaCm);
  if (!t || t <= 0 || !sexo) return 0;
  const base = String(sexo).toUpperCase() === 'M' ? 50 : 45.5;
  return Math.round((base + 0.91 * (t - 152.4)) * 10) / 10;
}

/**
 * Cálculos respiratorios derivados de una evolución.
 * @param {Object} evo  objeto con campos ventilatorios, PAC_PESO_IDEAL y VENT_MODO
 * @return {Object} { CALC_ML_KG, CALC_VOL_MIN, CALC_IE, CALC_DP, CALC_CESR, CALC_TOBIN, CALC_IROX }
 */
function calcularRespiratorio(evo) {
  const n = v => parseFloat(v) || 0;
  const vt   = n(evo.VENT_VT);
  const fr   = n(evo.VENT_FR);
  const peep = n(evo.VENT_PEEP);
  const ppl  = n(evo.VENT_PPL);
  const flujo = n(evo.VENT_FLUJO);
  const ti   = n(evo.VENT_TI);
  const fio2 = n(evo.VENT_FIO2);
  const spo2 = n(evo.VENT_SPO2);
  const pi   = n(evo.PAC_PESO_IDEAL);
  const modo = evo.VENT_MODO || '';
  const calc = {};

  if (vt > 0 && pi > 0) calc.CALC_ML_KG = Math.round((vt / pi) * 10) / 10;
  if (vt > 0 && fr > 0) calc.CALC_VOL_MIN = Math.round((vt * fr / 1000) * 100) / 100;
  if (['ACVC', 'ACPC'].indexOf(modo) !== -1 && flujo > 0 && fr > 0 && ti > 0) {
    const te = 60 / fr - ti;
    if (te > 0) calc.CALC_IE = '1:' + (Math.round((te / ti) * 10) / 10);
  }
  if (ppl > 0 && peep >= 0) calc.CALC_DP = Math.round((ppl - peep) * 10) / 10;
  if (vt > 0 && ppl > 0 && (ppl - peep) > 0) calc.CALC_CESR = Math.round((vt / (ppl - peep)) * 10) / 10;
  if (['CPAP/PS', 'CFLEX', 'S/T'].indexOf(modo) !== -1 && fr > 0 && vt > 0) {
    calc.CALC_TOBIN = Math.round((fr / (vt / 1000)) * 10) / 10;
  }
  if (['CNAF', 'OAF/CTAF'].indexOf(modo) !== -1 && spo2 > 0 && fio2 > 0 && fr > 0) {
    // ROX estándar: SpO2 / FiO2 (fracción) / FR — corte clásico 4.88
    calc.CALC_IROX = Math.round(((spo2 / (fio2 / 100)) / fr) * 100) / 100;
  }
  return calc;
}
