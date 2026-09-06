/**
 * svc_gsa.gs — El gas de la mañana llega solo desde los PDF del laboratorio
 * (tanda 2b, sep-2026).
 *
 * LA HISTORIA (Diego, 2-sep-2026): de turno noche, los gases se toman a las
 * 04:00, el resultado llega a las 06:00 y la hoja se imprime a las 07:00 —
 * pero la GSA, la Hb, el Hto y los valores para la rehabilitación se pasan a
 * mano, y eso termina a las 10:00. «Ya se perdieron horas valiosas para
 * corregir algún valor alterado o plantear la posibilidad de rehabilitación».
 * El valor no es ahorrar tecleo: son tres horas de anticipación clínica.
 *
 * QUÉ HACE: lee los PDF que Diego deja en una carpeta de Drive (CONFIG
 * GSA_CARPETA_ID; si no existe, se crea «RCE-KINE — Gases del laboratorio» en
 * la raíz), saca el texto con la conversión PDF→Documento de la propia API de
 * Drive (los PDF del laboratorio traen capa de texto: no hay OCR de por
 * medio), empareja por RUT con el episodio y guarda los valores en la hoja
 * GSA_IMPORTADAS. Después mueve el PDF a «copiados» o a «sin emparejar».
 *
 * DECISIONES DE DIEGO (2-sep-2026), todas respetadas aquí:
 *   · Solo el gas de la mañana: el resto se escribe a mano. Es una rutina de
 *     una vez al día (instalarTriggerGSA, 06:30) más el botón 🧪 de la app.
 *   · El gas importado NO entra a la evolución ni al REM: va a la hoja diaria
 *     y a la hoja impresa. Por eso vive en una hoja aparte y EVOLUCIONES no
 *     cambia.
 *   · Hb y Hto en fila propia; plaquetas, K⁺, INR y glicemia solo si están
 *     alterados (eso lo decide la hoja impresa, aquí se guardan todos).
 *   · No borrar: MOVER a subcarpeta. Un dato mal copiado con el original
 *     borrado no tiene a qué volver.
 *   · Regla dura: si no se puede emparejar con certeza NO se escribe en
 *     ningún paciente. La fila queda «sin_emparejar» (sin RUT) y el archivo
 *     en su bandeja. Un gas en la cama equivocada es peor que uno que falta.
 *
 * 🔒 El RUT se usa para emparejar y NO se persiste aquí: la fila guarda
 * PATIENT_ID. El nombre del informe tampoco se guarda. Los PDF SÍ son dato
 * identificable: la carpeta de Drive va restringida (eso es de Diego).
 *
 * 🪤 Los PDF traen los VALORES EN NEGRITA DUPLICADOS en el texto («9.99.9»
 * por 9.9, «14.314.3» por 14.3): la capa de texto repite el glifo. Por eso
 * _gsaDesdoblar existe y la guardia lo prueba con el formato real.
 *
 * 🪤 El turno se calcula en el SERVIDOR con turnoLogicoServidor
 * (infra_fechas.gs), que lee TURNO_DIA_INICIO / TURNO_NOCHE_INICIO de CONFIG
 * igual que el cliente: un gas de las 04:00 cae en la NOCHE del día anterior
 * (columna NOCHE de la hoja diaria); la hoja impresa lo busca por FECHA de
 * reloj (es la hoja del día en que se tomó).
 */

const GSA_CARPETA_NOMBRE = 'RCE-KINE — Gases del laboratorio';
const GSA_SUB_COPIADOS = 'copiados';
const GSA_SUB_SIN = 'sin emparejar';
const GSA_MAX_POR_CORRIDA = 40;

/** Qué se lee de cada informe: [columna, expresión que ubica la línea]. */
const _GSA_CAMPOS = [
  ['PH', /^\s*pH\s/],                          // sensible a mayúsculas: «PH Y GASES» es el título
  ['PACO2', /Presi[oó]n\s+CO2/i], ['PAO2', /Presi[oó]n\s+O2/i],
  ['EB', /Exceso de Base/i], ['HCO3', /Bicarbonato/i],
  ['FIO2', /^\s*FIO2\b/i], ['PAFI', /PO2\s*\/\s*FIO2/i],
  ['SATO2', /Saturaci[oó]n de O2/i], ['LACTATO', /^\s*Lactato\b/i],
  ['HB', /^\s*Hemoglobina\b/i], ['HTO', /^\s*Hematocrito\b/i],
  ['PLAQUETAS', /Rcto\.?\s*Plaquetas/i], ['INR', /^\s*INR\b/],
  ['K', /^\s*K\+/], ['NA', /^\s*Na\+/], ['GLICEMIA', /^\s*Glucosa\b/i],
  ['PCR', /Prote[ií]na C Reactiva/i],
];

/**
 * «9.99.9» → «9.9»: el texto del PDF repite lo que va en NEGRITA (los valores
 * críticos, marcados «**»). Un número que ya es válido no se toca — «55»
 * plaquetas son 55, no 5 — salvo que venga marcado crítico y sus dos mitades
 * sean idénticas («5555» tras «**»).
 */
function _gsaDesdoblar(tok, critico) {
  const t = String(tok || '');
  const n = t.length;
  const esNum = /^-?\d+([.,]\d+)?$/.test(t);
  if (esNum && !critico) return t;
  if (n >= 2 && n % 2 === 0 && t.slice(0, n / 2) === t.slice(n / 2)) return t.slice(0, n / 2);
  return t;
}

/** Primer número después de la etiqueta en la línea; null si no lo hay. */
function _gsaNumeroTras(linea, re) {
  const m = String(linea).match(re);
  if (!m) return null;
  const resto = String(linea).slice(m.index + m[0].length);
  const crudos = resto.split(/\s+/).filter(function (t) { return t && t !== ':' && t !== '-'; });
  let critico = false;
  for (let i = 0; i < crudos.length; i++) {
    if (/^\*+$/.test(crudos[i])) { critico = crudos[i].length >= 2; continue; }
    const t = _gsaDesdoblar(crudos[i], critico);
    const x = t.replace(',', '.');
    if (/^-?\d+(\.\d+)?$/.test(x)) return parseFloat(x);
    if (/[A-Za-zµ%\/]/.test(t)) return null;   // llegó la unidad sin número: no hay valor
  }
  return null;
}

/**
 * gsaParsear — del texto del informe a {rut, peticion, fecha, hora, valores}.
 * Tolerante al orden: recorre línea a línea y toma la PRIMERA aparición de
 * cada dato (en el informe los gases arteriales van antes que cualquier otro
 * bloque que repita etiquetas).
 */
function gsaParsear(texto) {
  const out = { rut: '', peticion: '', fecha: '', hora: '', valores: {}, venoso: false };
  const lineas = String(texto || '').split(/\r?\n/);
  lineas.forEach(function (l) {
    if (!out.rut) {
      const m = l.match(/RUT\s*:?\s*([0-9][0-9.]{4,}\s?-?\s?[0-9kK])\b/);
      if (m) out.rut = m[1].replace(/\s/g, '');
    }
    if (!out.peticion) { const m = l.match(/Petici[oó]n\s*:?\s*(\d{4,})/i); if (m) out.peticion = m[1]; }
    if (!out.fecha) {
      const m = l.match(/Fecha de Ingreso\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})\s+(\d{1,2}):(\d{2})/i);
      if (m) { out.fecha = m[3] + '-' + m[2] + '-' + m[1]; out.hora = ('0' + m[4]).slice(-2) + ':' + m[5]; }
    }
    _GSA_CAMPOS.forEach(function (c) {
      if (out.valores[c[0]] !== undefined) return;
      const n = _gsaNumeroTras(l, c[1]);
      if (n !== null) out.valores[c[0]] = n;
    });
  });
  out.venoso = /Gases Venosos/i.test(texto) && !/Gases Arteriales/i.test(texto);
  // PaFi: si el informe no la trae calculada, se deriva (PaO₂ / FiO₂ en fracción).
  if (out.valores.PAFI === undefined && out.valores.PAO2 !== undefined && out.valores.FIO2 > 0) {
    out.valores.PAFI = Math.round(out.valores.PAO2 / (out.valores.FIO2 / 100));
  } else if (out.valores.PAFI !== undefined && out.valores.PAFI < 10) {
    // El informe la expresa en mmHg/% (2.34): la hoja la lee en mmHg (234).
    out.valores.PAFI = Math.round(out.valores.PAFI * 100);
  }
  return out;
}

/** La carpeta de entrada (CONFIG GSA_CARPETA_ID; si falta, se crea y se anota). */
function _gsaCarpeta() {
  const id = String(leerConfig('GSA_CARPETA_ID', '')).trim();
  if (id) {
    try { return DriveApp.getFolderById(id); }
    catch (e) { throw new Error('GSA_CARPETA_ID de CONFIG no abre ninguna carpeta: ' + e.message); }
  }
  const ex = DriveApp.getRootFolder().getFoldersByName(GSA_CARPETA_NOMBRE);
  const f = ex.hasNext() ? ex.next() : DriveApp.createFolder(GSA_CARPETA_NOMBRE);
  try { escribirConfig('GSA_CARPETA_ID', f.getId()); } catch (e) { /* sin CONFIG igual sirve */ }
  return f;
}
function _gsaSub(carpeta, nombre) {
  const it = carpeta.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : carpeta.createFolder(nombre);
}

/**
 * Texto de un PDF vía la API de Drive: copia como Documento de Google
 * (conversión con la capa de texto del PDF), exporta a texto plano y bota la
 * copia. Usa el alcance de Drive que el proyecto ya tiene: sin servicios
 * avanzados ni permisos nuevos.
 */
function _gsaTextoDePdf(file) {
  const token = ScriptApp.getOAuthToken();
  const r = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(file.getId()) + '/copy', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify({ name: 'tmp_gsa_' + file.getName(), mimeType: 'application/vnd.google-apps.document' }),
    muteHttpExceptions: true,
  });
  if (r.getResponseCode() >= 300) {
    throw new Error('Drive no pudo convertir el PDF (' + r.getResponseCode() + '): ' + String(r.getContentText()).slice(0, 160));
  }
  const docId = JSON.parse(r.getContentText()).id;
  try {
    const t = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(docId) + '/export?mimeType=text%2Fplain', {
      headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true,
    });
    if (t.getResponseCode() >= 300) throw new Error('Drive no pudo exportar el texto (' + t.getResponseCode() + ')');
    return t.getContentText('UTF-8');
  } finally {
    try { DriveApp.getFileById(docId).setTrashed(true); } catch (e) { /* la copia temporal no importa */ }
  }
}

/**
 * Episodio de un RUT en la fecha de la toma: la cama ocupada primero; si no,
 * el egresado cuya estadía contiene la fecha. Sin certeza → null.
 */
function _gsaEpisodioPorRut(rut, fechaISO) {
  const r = _rutNormal(rut);
  if (!r) return null;
  const camas = repoLeerTodos('CAMAS_ESTADO').filter(function (c) { return esVerdadero(c.OCUPADA) && _rutNormal(c.RUT) === r; });
  if (camas.length === 1 && camas[0].PATIENT_ID) return { pid: String(camas[0].PATIENT_ID), idCama: String(camas[0].ID_CAMA), tipo: 'activo' };
  if (camas.length > 1) return null;   // dos camas con el mismo RUT: nadie decide por el colega
  const f = String(fechaISO || '').slice(0, 10);
  const eg = repoLeerTodos('ARCHIVO_PACIENTES').filter(function (a) {
    if (_rutNormal(a.RUT) !== r || !a.PATIENT_ID) return false;
    const fi = String(a.FECHA_INGRESO || '').slice(0, 10), fe = String(a.FECHA_EGRESO || '').slice(0, 10);
    return f && fi && fe && fi <= f && f <= fe;
  });
  if (eg.length === 1) return { pid: String(eg[0].PATIENT_ID), idCama: String(eg[0].CAMA_ORIGEN || ''), tipo: 'egresado' };
  return null;
}

/**
 * gsaImportarPendientes — la rutina. Corre desde el disparador de las 06:30 y
 * desde el botón 🧪 de la app. Devuelve el resumen y lo deja en el buzón.
 */
function gsaImportarPendientes(ctx) {
  return conLock(function () {
    try {
      const carpeta = _gsaCarpeta();
      const copiados = _gsaSub(carpeta, GSA_SUB_COPIADOS);
      const sinEmp = _gsaSub(carpeta, GSA_SUB_SIN);
      const yaPet = {};
      repoLeerTodos('GSA_IMPORTADAS').forEach(function (g) { if (g.PETICION && String(g.ESTADO) === 'ok') yaPet[String(g.PETICION)] = true; });
      const res = { importados: [], sinEmparejar: [], repetidos: 0, errores: [] };
      const it = carpeta.getFilesByType(MimeType.PDF);
      let n = 0;
      while (it.hasNext() && n < GSA_MAX_POR_CORRIDA) {
        const f = it.next(); n++;
        try {
          const p = gsaParsear(_gsaTextoDePdf(f));
          if (p.peticion && yaPet[p.peticion]) { res.repetidos++; f.moveTo(copiados); continue; }
          const motivo = !p.rut ? 'sin RUT legible' : !rutValido(p.rut) ? 'RUT no valida (dígito verificador)'
            : !p.fecha ? 'sin fecha de toma' : '';
          const ep = motivo ? null : _gsaEpisodioPorRut(p.rut, p.fecha);
          const base = {
            ID_GSA: uid('gsa'), FECHA: p.fecha, HORA: p.hora,
            PH: p.valores.PH, PACO2: p.valores.PACO2, PAO2: p.valores.PAO2, HCO3: p.valores.HCO3, EB: p.valores.EB,
            SATO2: p.valores.SATO2, FIO2: p.valores.FIO2, PAFI: p.valores.PAFI, LACTATO: p.valores.LACTATO,
            HB: p.valores.HB, HTO: p.valores.HTO, PLAQUETAS: p.valores.PLAQUETAS, INR: p.valores.INR,
            K: p.valores.K, NA: p.valores.NA, GLICEMIA: p.valores.GLICEMIA, PCR: p.valores.PCR,
            ARCHIVO: f.getName(), ARCHIVO_ID: f.getId(), PETICION: p.peticion, TS_IMPORT: ahoraTS(),
          };
          Object.keys(base).forEach(function (k) { if (base[k] === undefined || base[k] === null) base[k] = ''; });
          if (!ep) {
            // 🔴 Regla dura: sin certeza no se escribe en nadie. Ni el RUT se guarda.
            repoInsertar('GSA_IMPORTADAS', Object.assign(base, { PATIENT_ID: '', ID_CAMA: '', TURNO_KEY: '',
              ESTADO: 'sin_emparejar', DETALLE: motivo || 'RUT sin episodio en esa fecha' }));
            f.moveTo(sinEmp);
            res.sinEmparejar.push(f.getName() + ' — ' + (motivo || 'RUT sin episodio en esa fecha'));
            continue;
          }
          const tl = turnoLogicoServidor(p.fecha, p.hora);
          repoInsertar('GSA_IMPORTADAS', Object.assign(base, { PATIENT_ID: ep.pid, ID_CAMA: ep.idCama, TURNO_KEY: tl.turnoKey,
            ESTADO: 'ok', DETALLE: (p.venoso ? 'venoso' : '') + (ep.tipo === 'egresado' ? ' (episodio egresado)' : '') }));
          if (p.peticion) yaPet[p.peticion] = true;
          f.moveTo(copiados);
          res.importados.push({ cama: ep.idCama, hora: p.hora, fecha: p.fecha });
        } catch (e) { res.errores.push(f.getName() + ': ' + e.message); }
      }
      if (res.importados.length || res.sinEmparejar.length || res.errores.length) {
        try {
          const camas = res.importados.map(function (x) { return x.cama; }).filter(Boolean).sort(function (a, b) { return a - b; });
          notifRegistrar({ tipo: 'gsa',
            titulo: '🧪 Gases importados: ' + res.importados.length + (res.sinEmparejar.length ? ' · sin emparejar: ' + res.sinEmparejar.length : '') + (res.errores.length ? ' · con error: ' + res.errores.length : ''),
            detalle: (camas.length ? 'camas ' + camas.join(', ') : '') + (res.sinEmparejar.length ? ' · revisar la carpeta «sin emparejar»' : ''),
            origenId: 'gsa:' + ahoraTS() });
        } catch (e) { /* el buzón nunca tumba la importación */ }
      }
      return ok(Object.assign(res, { accion: 'gsa_importar', entidad: 'GSA_IMPORTADAS' }));
    } catch (e) { return err('gsaImportarPendientes: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Gases importados de una FECHA de reloj, por PATIENT_ID (para la hoja impresa). */
function gsaDelDia(fecha, pids) {
  try {
    const f = String(fecha || hoyISO()).slice(0, 10);
    const quiero = {};
    (pids || []).forEach(function (p) { if (p) quiero[String(p)] = true; });
    const out = {};
    repoLeerFiltrado('GSA_IMPORTADAS', 'FECHA', function (k) { return String(k).slice(0, 10) === f; }).forEach(function (g) {
      const pid = String(g.PATIENT_ID || '');
      if (!pid || String(g.ESTADO) !== 'ok') return;
      if (Object.keys(quiero).length && !quiero[pid]) return;
      (out[pid] = out[pid] || []).push(g);
    });
    Object.keys(out).forEach(function (pid) { out[pid].sort(function (a, b) { return String(a.HORA).localeCompare(String(b.HORA)); }); });
    return ok(out);
  } catch (e) { return err('gsaDelDia: ' + e.message, ERR.INTERNO, e); }
}

/** Gases importados de un episodio (viajan con el historial → hoja diaria). */
function gsaDeEpisodio(patientId) {
  const pid = String(patientId || '');
  if (!pid) return [];
  try {
    return repoLeerTodos('GSA_IMPORTADAS', 'PATIENT_ID', pid)
      .filter(function (g) { return String(g.ESTADO) === 'ok'; })
      .sort(function (a, b) { return (String(a.FECHA) + a.HORA).localeCompare(String(b.FECHA) + b.HORA); });
  } catch (e) { return []; }
}

/** Disparador diario (06:30 ± 15 min): los resultados llegan ~06:00, la hoja se imprime a las 07:00. */
function instalarTriggerGSA() {
  const ya = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'gsaImportarDesdeTrigger'; });
  if (!ya) {
    ScriptApp.newTrigger('gsaImportarDesdeTrigger').timeBased().everyDays(1).atHour(6).nearMinute(30).create();
    console.log('⏰ Disparador de gases instalado (06:30 aprox.).');
  } else console.log('⏰ El disparador de gases ya estaba instalado.');
  const c = _gsaCarpeta();
  console.log('📂 Carpeta de entrada: ' + c.getUrl());
  return ok({ carpeta: c.getUrl() });
}
function gsaImportarDesdeTrigger() {
  const r = gsaImportarPendientes({ email: 'trigger', firma: '' });
  try { auditar({ email: 'trigger', accion: 'GSA_IMPORTAR', entidad: 'GSA_IMPORTADAS', resumen: r.ok ? (r.data.importados.length + ' importados, ' + r.data.sinEmparejar.length + ' sin emparejar') : ('ERROR ' + r.error) }); } catch (e) {}
  return r;
}
/** Para correrla a mano desde el editor y ver el resumen en el registro. */
function gsaImportarAhora() {
  const r = gsaImportarPendientes({ email: 'editor', firma: '' });
  Logger.log(JSON.stringify(r, null, 2));
  return r;
}
