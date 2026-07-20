/**
 * svc_auditoria.gs — Control de calidad del registro (solo lectura).
 * Recorre los episodios ACTIVOS (pacientes ingresados) y detecta:
 *   1. huecos      — turnos sin evolución dentro del episodio + atraso del último registro
 *   2. transicion  — cambios de vía aérea/soporte entre turnos sin evento que los explique
 *   3. evaluacion  — cooperador sin MRC/FSS o con evaluación envejecida (EVAL_DIAS_ALERTA)
 *   4. pve         — candidato a PVE con racha de turnos sin PVE (PVE_TURNOS_ALERTA)
 *   5. clones      — parámetros idénticos N turnos seguidos (evolución fantasma)
 * Es la red de seguridad de las defensas en línea (avisos del panel/entrega):
 * mide lo que igual se escapó. No modifica ninguna hoja.
 */

/** Turno siguiente a una TURNO_KEY: Dia→Noche mismo día; Noche→Dia del día siguiente. */
function _audTurnoSiguiente(key) {
  const p = String(key).split('-');           // [yyyy, mm, dd, turno]
  const fecha = p[0] + '-' + p[1] + '-' + p[2];
  if (p[3] === 'Dia') return fecha + '-Noche';
  const d = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]));
  d.setDate(d.getDate() + 1);
  const pad = function (n) { return ('0' + n).slice(-2); };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '-Dia';
}

/** Estado final de un turno: campos *_FINAL si el evento los dejó; si no, el estado registrado. */
function _audFin(e, base, fin) {
  const f = e[fin];
  return (f !== undefined && f !== null && f !== '') ? f : (e[base] || '');
}

function auditoriaCalidad() {
  try {
    const hoy = hoyISO();
    const cutEval = parseInt(leerConfig('EVAL_DIAS_ALERTA', '5')) || 5;
    const cutPve = parseInt(leerConfig('PVE_TURNOS_ALERTA', '2')) || 2;
    const inv = function (x) { return x === 'TOT' || x === 'TQT'; };

    const camas = repoLeerTodos('CAMAS_ESTADO').filter(function (c) { return esVerdadero(c.OCUPADA); });
    const evosAll = repoLeerTodos('EVOLUCIONES');
    const porPid = {};
    evosAll.forEach(function (e) {
      if (e.PATIENT_ID) (porPid[e.PATIENT_ID] = porPid[e.PATIENT_ID] || []).push(e);
    });

    // Huella de mediciones para detectar clones (mismos campos que la réplica marca en ámbar)
    const HUELLA = ['VENT_FIO2', 'VENT_PEEP', 'VENT_VT', 'VENT_FR', 'VENT_SPO2', 'VENT_PS',
      'VENT_IPAP', 'VENT_EPAP', 'SED_TIPO', 'SED_SAS', 'HEMO_ESTADO', 'HEMO_DVA'];
    const huella = function (e) {
      const vals = HUELLA.map(function (k) { return (e[k] === undefined || e[k] === null) ? '' : String(e[k]); });
      return vals.join('|') === '|||||||||||' ? '' : vals.join('|');   // '' = sin mediciones
    };

    const resumen = { huecos: 0, transicion: 0, evaluacion: 0, pve: 0, clones: 0 };
    const filas = [];

    camas.forEach(function (c) {
      const h = [];   // hallazgos de esta cama: {tipo, sev:'rojo'|'ambar', texto}
      const add = function (tipo, sev, texto) { h.push({ tipo: tipo, sev: sev, texto: texto }); resumen[tipo]++; };
      const evos = (porPid[c.PATIENT_ID] || []).slice()
        .sort(function (a, b) { return String(a.TURNO_KEY).localeCompare(String(b.TURNO_KEY)); });

      // ── 1) Huecos: turnos faltantes ENTRE registros + atraso del último ──
      if (!evos.length) {
        if (c.FECHA_INGRESO && diasEntre(c.FECHA_INGRESO, hoy) >= 1)
          add('huecos', 'rojo', 'Ingresado el ' + String(c.FECHA_INGRESO).slice(0, 10) + ' sin ninguna evolución del episodio');
      } else {
        let faltantes = [];
        for (let i = 1; i < evos.length; i++) {
          let k = _audTurnoSiguiente(evos[i - 1].TURNO_KEY), tope = 0;
          while (k < String(evos[i].TURNO_KEY) && tope < 90) { faltantes.push(k); k = _audTurnoSiguiente(k); tope++; }
        }
        if (faltantes.length) {
          const det = faltantes.slice(0, 6).map(function (k) {
            const p = k.split('-'); return p[2] + '-' + p[1] + ' ' + (p[3] === 'Dia' ? '☀️' : '🌙');
          }).join(', ');
          add('huecos', 'rojo', faltantes.length + ' turno(s) sin evolución dentro del episodio: ' + det + (faltantes.length > 6 ? '…' : ''));
        }
        const ultFecha = String(evos[evos.length - 1].TURNO_KEY).slice(0, 10);
        const atraso = diasEntre(ultFecha, hoy);
        if (atraso >= 1) add('huecos', atraso >= 2 ? 'rojo' : 'ambar', 'Última evolución hace ' + atraso + ' día(s) (' + ultFecha + ')');
      }

      // ── 2) Transiciones sin evento (entre turnos consecutivos registrados) ──
      for (let i = 1; i < evos.length; i++) {
        const prev = evos[i - 1], cur = evos[i];
        const vaPrev = _audFin(prev, 'VENT_VIA_AEREA', 'VENT_VIA_AEREA_FINAL');
        const sopPrev = _audFin(prev, 'VENT_SOPORTE', 'VENT_SOPORTE_FINAL');
        const vaCur = cur.VENT_VIA_AEREA || '';
        const sopCur = cur.VENT_SOPORTE || '';
        if (!vaPrev || !vaCur) continue;
        const tk = String(cur.TURNO_KEY);
        const et = tk.slice(8, 10) + '-' + tk.slice(5, 7) + ' ' + (tk.indexOf('Noche') !== -1 ? '🌙' : '☀️');
        if (vaPrev === 'TOT' && !inv(vaCur) && !esVerdadero(cur.EXT_OCURRIO))
          add('transicion', 'rojo', 'Salió de TOT (→ ' + vaCur + ') sin extubación registrada — turno ' + et);
        if (vaPrev === 'TQT' && vaCur === 'Natural' && !esVerdadero(cur.DECAN_OCURRIO))
          add('transicion', 'rojo', 'Salió de TQT (→ Natural) sin decanulación registrada — turno ' + et);
        if (!inv(vaPrev) && inv(vaCur) && !esVerdadero(cur.INTUB_OCURRIO) && !esVerdadero(cur.EXT_REINTUB))
          add('transicion', 'rojo', 'Pasó de ' + vaPrev + ' a ' + vaCur + ' sin intubación/reintubación registrada — turno ' + et);
        if (sopPrev === 'VM' && sopCur && sopCur !== 'VM' && vaPrev === 'TQT' && vaCur === 'TQT' &&
            !/DESVINCULACI/i.test(String(cur.PROC_RESUMEN || '')) && !esVerdadero(cur.DECAN_OCURRIO))
          add('transicion', 'ambar', 'Salió de VM con TQT (→ ' + sopCur + ') sin desvinculación registrada — turno ' + et);
      }

      // ── 3) Evaluaciones: cooperador sin MRC/FSS o envejecidas ──
      if (/^cooperador$/i.test(String(c.ULT_COOP || '').trim())) {
        const edad = function (f) { const iso = f ? String(f).slice(0, 10) : ''; return iso ? diasEntre(iso, hoy) : null; };
        if (c.ULT_MRC === '' || c.ULT_MRC == null) add('evaluacion', 'ambar', 'Cooperador sin MRC-SS del episodio');
        else { const e1 = edad(c.ULT_MRC_FECHA); if (e1 != null && e1 > cutEval) add('evaluacion', 'ambar', 'MRC-SS hace ' + e1 + ' días (corte ' + cutEval + ')'); }
        if (c.ULT_FSS === '' || c.ULT_FSS == null) add('evaluacion', 'ambar', 'Cooperador sin FSS-ICU del episodio');
        else { const e2 = edad(c.ULT_FSS_FECHA); if (e2 != null && e2 > cutEval) add('evaluacion', 'ambar', 'FSS-ICU hace ' + e2 + ' días (corte ' + cutEval + ')'); }
      }

      // ── 4) Candidato a PVE que insiste (misma racha que la entrega) ──
      if (String(c.SOPORTE) === 'VM' && esVerdadero(c.WEAN_CAND_PVE)) {
        let racha = 0;
        for (let i = evos.length - 1; i >= 0; i--) {
          if (_turnoCandidatoPve(evos[i])) racha++; else break;
        }
        if (racha >= cutPve) add('pve', 'ambar', 'Candidato a PVE hace ' + racha + ' turnos sin PVE registrada');
      }

      // ── 5) Clones: mediciones idénticas N turnos seguidos ──
      if (evos.length >= 3) {
        const fpUlt = huella(evos[evos.length - 1]);
        if (fpUlt) {
          let n = 1;
          for (let i = evos.length - 2; i >= 0; i--) {
            if (huella(evos[i]) === fpUlt) n++; else break;
          }
          if (n >= 3) add('clones', 'ambar', 'Mediciones idénticas (FiO₂/PEEP/VT/FR/SpO₂/sedación/HDN) en los últimos ' + n + ' turnos — revisar si se están re-midiendo');
        }
      }

      if (h.length) filas.push({ cama: String(c.ID_CAMA), nombre: c.NOMBRE || '', cod: c.COD_PACIENTE || '', hallazgos: h });
    });

    filas.sort(function (a, b) { return (parseInt(a.cama) || 0) - (parseInt(b.cama) || 0); });
    return ok({
      generado: ahoraTS(), fecha: hoy,
      camasRevisadas: camas.length, camasConHallazgos: filas.length,
      cortes: { evalDias: cutEval, pveTurnos: cutPve },
      resumen: resumen, filas: filas,
    });
  } catch (e) { return err('auditoriaCalidad: ' + e.message, ERR.INTERNO, e); }
}
