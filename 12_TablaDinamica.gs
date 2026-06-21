/**
 * ============================================================
 *  12_TablaDinamica.gs — Datos para la Tabla Dinámica de actividad
 *  ------------------------------------------------------------
 *  obtenerActividad(desde, hasta)
 *
 *  Devuelve registros PRE-AGREGADOS de actividad clínica con la
 *  dimensión QUIÉN (firma del kinesiólogo), para que el frontend
 *  arme una tabla dinámica (pivote) y responda preguntas como:
 *    • ¿Quién ha realizado más TQT?
 *    • ¿Quién ha tomado más cultivos/muestras?
 *    • ¿Cuántas extubaciones por turno (día/noche)?
 *
 *  Cada registro: { kine, turno, mes, categoria, evento, n }
 *  El frontend suma `n` pivotando por cualquier par de dimensiones.
 *
 *  FUENTES:
 *   • PROCEDIMIENTOS  → se une a EVOLUCIONES por ID_EVOLUCION para
 *                       obtener la firma del kine (PLAN_FIRMA_KINE).
 *   • EVOLUCIONES     → Muestras (MUE_TIPOS_JSON) y KTM (nivel).
 *                       La firma está en la misma fila.
 * ============================================================
 */

// Categoriza un nombre de procedimiento para agruparlo en la tabla.
function _catProc(nom) {
  const n = _normProc(nom);
  if (/EXTUBACION|AUTOEXTUBACION|REINTUBACION|INTUBACION|DESVINCULACION|PVE/.test(n)) return 'Vía aérea';
  if (/TQT|TRAQUEO|DECANULACION|CAMBIO TOT|CAMBIO TQT/.test(n)) return 'Traqueostomía';
  if (/PRONO|SUPINO|POSICIONAMIENTO|DECUBITO/.test(n)) return 'Posicionamiento';
  if (/CULTIVO|MUESTRA|HEMOCULTIVO|UROCULTIVO|GRAM|PCR|BAS/.test(n)) return 'Muestra';
  if (/IMAGEN|ECOGRAF|RADIOGRAF|TAC/.test(n)) return 'Estudio';
  if (/ASPIRACION|LAVADO|TOS|HIGIENE/.test(n)) return 'Higiene bronquial';
  return 'Otro procedimiento';
}

// Nombre "bonito" (title case) para mostrar el evento.
function _titulo(s) {
  const t = String(s || '').trim();
  if (!t) return '—';
  return t.replace(/\w\S*/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
}

/**
 * @param {string} desde  "YYYY-MM-DD"
 * @param {string} hasta  "YYYY-MM-DD" (inclusive)
 */
function obtenerActividad(desde, hasta) {
  try {
    desde = _isoDe(desde); hasta = _isoDe(hasta);
    if (!desde || !hasta) return err('Rango de fechas inválido.');

    // ════════ EVOLUCIONES (para join + muestras + KTM) ════════
    const hE = obtenerHoja(SH.EVOLUCIONES);
    const ultE = hE.getLastRow();
    const evos = (ultE >= EVO_FILA_DATOS)
      ? hE.getRange(EVO_FILA_DATOS, 1, ultE - EVO_FILA_DATOS + 1, EVO_TOTAL_COLS).getValues()
      : [];

    // ════════ PROCEDIMIENTOS ════════
    const hP = obtenerHoja(SH.PROCEDIMIENTOS);
    const ultP = hP.getLastRow();
    const procs = (ultP >= PROC_FILA_DATOS)
      ? hP.getRange(PROC_FILA_DATOS, 1, ultP - PROC_FILA_DATOS + 1, 9).getValues()
      : [];

    const E = k => COL_EVO[k] - 1;
    const P = k => COL_PROC[k] - 1;

    // Mapa: ID_EVOLUCION → firma del kine (para los procedimientos)
    const kinePorEvo = {};
    evos.forEach(r => {
      const id = String(r[E('ID_EVOLUCION')] || '').trim();
      if (id) kinePorEvo[id] = String(r[E('PLAN_FIRMA_KINE')] || '').trim();
    });

    // Acumulador de combinaciones únicas: clave → n
    const acc = {};
    const SIN = 'Sin firma';
    function add(kine, turno, mes, categoria, evento, cantidad) {
      kine = kine && kine.trim() ? kine.trim() : SIN;
      turno = turno && String(turno).trim() ? String(turno).trim() : '—';
      const key = [kine, turno, mes, categoria, evento].join('|||');
      acc[key] = (acc[key] || 0) + (cantidad || 1);
    }

    // ── 1) PROCEDIMIENTOS (une a evolución para la firma) ──
    procs.forEach(r => {
      const iso = _isoDe(r[P('FECHA')]);
      if (!_enRango(iso, desde, hasta)) return;
      const idEvo = String(r[P('ID_EVOLUCION')] || '').trim();
      const kine  = kinePorEvo[idEvo] || '';
      const turno = r[P('TURNO')];
      const mes   = iso.slice(0, 7);
      const nom   = String(r[P('NOMBRE_PROC')] || '').trim();
      if (!nom) return;
      add(kine, turno, mes, _catProc(nom), _titulo(nom), 1);
    });

    // ── 2) MUESTRAS y KTM desde EVOLUCIONES ──
    evos.forEach(r => {
      const iso = _isoDe(r[E('FECHA')]) || String(r[E('TURNO_KEY')]).slice(0, 10);
      if (!_enRango(iso, desde, hasta)) return;
      const kine  = String(r[E('PLAN_FIRMA_KINE')] || '').trim();
      const turno = r[E('TURNO')];
      const mes   = iso.slice(0, 7);

      // Muestras microbiológicas
      if (_esTrue(r[E('MUE_REALIZADAS')])) {
        let tipos = [];
        try { tipos = JSON.parse(r[E('MUE_TIPOS_JSON')] || '[]'); } catch (e) { tipos = []; }
        if (Array.isArray(tipos) && tipos.length) {
          tipos.forEach(t => { if (t && String(t).trim()) add(kine, turno, mes, 'Muestra', _titulo(t), 1); });
        } else {
          add(kine, turno, mes, 'Muestra', 'Muestra microbiológica', 1);
        }
      }

      // KTM por nivel
      const niv = String(r[E('KTM_NIVEL_KTR')] || '').trim();
      if (niv && /^[1-5]$/.test(niv)) {
        add(kine, turno, mes, 'KTM', 'KTM Nivel ' + niv, 1);
      }
    });

    // Aplanar a array de registros
    const registros = Object.keys(acc).map(k => {
      const [kine, turno, mes, categoria, evento] = k.split('|||');
      return { kine, turno, mes, categoria, evento, n: acc[k] };
    });

    // Listas únicas para poblar selectores en el frontend
    const uniq = (arr, key) => Array.from(new Set(arr.map(x => x[key]))).sort();

    return ok({
      meta: { desde, hasta, generado: new Date().toISOString(), totalRegistros: registros.length },
      registros,
      dimensiones: {
        kines:      uniq(registros, 'kine'),
        turnos:     uniq(registros, 'turno'),
        meses:      uniq(registros, 'mes'),
        categorias: uniq(registros, 'categoria'),
        eventos:    uniq(registros, 'evento')
      }
    });
  } catch (e) {
    return err('obtenerActividad: ' + e.message, e);
  }
}
