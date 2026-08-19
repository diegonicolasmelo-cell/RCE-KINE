/**
 * svc_coordinacion.gs — Modo Coordinación: buscar y corregir fichas de pacientes.
 *
 * Nace del caso de la cama 10 (ago-2026): un paciente estuvo 28 días y al
 * egresar quedó archivado con UN día de estadía, porque los días se congelan
 * al dar de alta y su fecha de ingreso estaba mal. Corregirlo obligaba a abrir
 * el editor de Apps Script y escribir una función de mantenimiento a mano.
 *
 * Tres personas con clave propia (PRD_MODO_COORDINACION.md, D5): MCC (uso
 * diario), DMV y MFB (respaldo), para que la unidad no dependa de una sola.
 *
 * ── EL CANDADO VIVE AQUÍ, NO EN LA PANTALLA ───────────────────────────────
 * Con AUTH_DEV_MODE=TRUE cualquiera con el enlace llega al dispatcher: esconder
 * la pestaña no protege nada, porque quien conozca el nombre de la acción la
 * llama igual. Por eso CADA acción de escritura vuelve a exigir la sesión.
 *
 * ── LAS CLAVES NO VIVEN EN LA PLANILLA ────────────────────────────────────
 * Se guarda su huella (SHA-256 con sal por persona) en PropertiesService, no en
 * CONFIG: CONFIG es una hoja del Sheet y cualquiera con acceso al archivo la
 * lee — o la exporta sin darse cuenta.
 */

// Las tres firmas autorizadas. Cambiar esta lista es dar o quitar el acceso.
var COORD_FIRMAS = ['MCC', 'DMV', 'MFB'];

var _COORD_SESION_MIN   = 30;   // minutos de vida de una sesión
var _COORD_MAX_INTENTOS = 3;    // fallidos antes de la espera
var _COORD_ESPERA_MIN   = 15;   // minutos de espera tras agotar los intentos

/** Campos que se pueden corregir. Lista BLANCA: nada fuera de aquí se escribe. */
var COORD_CAMPOS = {
  // fechas semilla — cada una con su marca de hora
  FECHA_INGRESO:        { tipo: 'fecha', ts: 'TS_INGRESO',        etiqueta: 'Fecha de ingreso' },
  FECHA_INICIO_SOPORTE: { tipo: 'fecha', ts: 'TS_INICIO_SOPORTE', etiqueta: 'Inicio de ventilación' },
  FECHA_INICIO_VA:      { tipo: 'fecha', ts: 'TS_INICIO_VA',      etiqueta: 'Inicio de vía aérea' },
  FECHA_EGRESO:         { tipo: 'fecha', soloArchivo: true,       etiqueta: 'Fecha de egreso' },
  // administrativos
  NOMBRE:          { tipo: 'texto',  etiqueta: 'Nombre' },
  RUT:             { tipo: 'rut',    etiqueta: 'RUT' },
  EDAD:            { tipo: 'entero', etiqueta: 'Edad' },
  SEXO:            { tipo: 'texto',  etiqueta: 'Sexo' },
  DIAGNOSTICO:     { tipo: 'texto',  etiqueta: 'Diagnóstico' },
  DIAG_REM:        { tipo: 'texto',  etiqueta: 'Diagnóstico REM' },
  MOTIVO_EGRESO:   { tipo: 'texto',  soloArchivo: true, etiqueta: 'Motivo de egreso' },
  DESTINO_EGRESO:  { tipo: 'texto',  soloArchivo: true, etiqueta: 'Destino de egreso' },
};

// ─────────────────────────────────────────────────────────────────────────────
// CLAVES
// ─────────────────────────────────────────────────────────────────────────────

/** Huella de una clave. La sal es por persona: dos claves iguales no coinciden. */
function _coordHuella(firma, clave, sal) {
  const crudo = String(sal) + '|' + String(firma).toUpperCase() + '|' + String(clave);
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, crudo, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function _coordProps() { return PropertiesService.getScriptProperties(); }

/** Escribe la clave de una firma. Genera una sal nueva en cada cambio. */
function _coordGuardarClave(firma, clave) {
  const f = String(firma).toUpperCase();
  const sal = Utilities.getUuid();
  _coordProps().setProperty('coord_sal_' + f, sal);
  _coordProps().setProperty('coord_hash_' + f, _coordHuella(f, clave, sal));
  _coordProps().deleteProperty('coord_fallidos_' + f);
  return true;
}

/** ¿La clave enviada es la de esa firma? */
function _coordClaveOk(firma, clave) {
  const f = String(firma).toUpperCase();
  const sal = _coordProps().getProperty('coord_sal_' + f);
  const hash = _coordProps().getProperty('coord_hash_' + f);
  if (!sal || !hash) return false;
  return _coordHuella(f, clave, sal) === hash;
}

/** Marca temporal de un solo uso: obliga a cambiar la clave al entrar. */
function _coordMarcarTemporal(firma, esTemporal) {
  const k = 'coord_temp_' + String(firma).toUpperCase();
  if (esTemporal) _coordProps().setProperty(k, '1'); else _coordProps().deleteProperty(k);
}
function _coordEsTemporal(firma) {
  return _coordProps().getProperty('coord_temp_' + String(firma).toUpperCase()) === '1';
}

// ─────────────────────────────────────────────────────────────────────────────
// INTENTOS FALLIDOS Y SESIONES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Los fallidos se cuentan POR FIRMA, nunca globales: si fueran globales,
 * cualquiera podría dejar afuera a las tres tecleando mal a propósito.
 */
function _coordFallidos(firma) {
  const v = _coordProps().getProperty('coord_fallidos_' + String(firma).toUpperCase());
  if (!v) return { n: 0, hasta: 0 };
  try { return JSON.parse(v); } catch (e) { return { n: 0, hasta: 0 }; }
}

function _coordSumarFallido(firma) {
  const f = String(firma).toUpperCase();
  const est = _coordFallidos(f);
  est.n = (est.n || 0) + 1;
  if (est.n >= _COORD_MAX_INTENTOS) {
    est.hasta = Date.now() + _COORD_ESPERA_MIN * 60000;
    est.n = 0;
  }
  _coordProps().setProperty('coord_fallidos_' + f, JSON.stringify(est));
  return est;
}

/** Minutos que faltan de espera, o 0 si puede intentar. */
function _coordEsperaRestante(firma) {
  const est = _coordFallidos(firma);
  if (!est.hasta || est.hasta <= Date.now()) return 0;
  return Math.ceil((est.hasta - Date.now()) / 60000);
}

/** Abre una sesión atada a una firma y devuelve su token. */
function _coordAbrirSesion(firma) {
  const token = Utilities.getUuid();
  const seg = _COORD_SESION_MIN * 60;
  CacheService.getScriptCache().put('coordses_' + token,
    JSON.stringify({ firma: String(firma).toUpperCase(), desde: Date.now() }), seg);
  return token;
}

/**
 * Resuelve un token a su firma, o null. Renueva la ventana en cada uso: la
 * sesión muere por INACTIVIDAD, no a los 30 minutos de haber entrado.
 */
function coordSesionFirma(token) {
  if (!token) return null;
  const cache = CacheService.getScriptCache();
  const hit = cache.get('coordses_' + token);
  if (!hit) return null;
  let s;
  try { s = JSON.parse(hit); } catch (e) { return null; }
  if (!s || !s.firma) return null;
  cache.put('coordses_' + token, hit, _COORD_SESION_MIN * 60);
  return s.firma;
}

/**
 * Guardia de TODA acción del modo. Devuelve {ok:true, firma} o una respuesta
 * de error lista para retornar. Es el candado real del que habla la cabecera.
 */
function coordExigirSesion(token) {
  const firma = coordSesionFirma(token);
  if (!firma) return { ok: false, error: 'Tu sesión de coordinación expiró. Vuelve a entrar con tu clave.', codigo: ERR.NO_AUTORIZADO };
  return { ok: true, firma: firma };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENTRAR / CAMBIAR CLAVE / RESTABLECER
// ─────────────────────────────────────────────────────────────────────────────

function coordEntrar(datos) {
  try {
    const firma = String((datos && datos.firma) || '').toUpperCase().trim();
    const clave = String((datos && datos.clave) || '');
    if (COORD_FIRMAS.indexOf(firma) === -1) {
      return err('Esa firma no tiene acceso al modo Coordinación.', ERR.NO_AUTORIZADO);
    }
    const espera = _coordEsperaRestante(firma);
    if (espera > 0) {
      return err('Demasiados intentos. Vuelve a probar en ' + espera + ' minuto' + (espera === 1 ? '' : 's') + '.', ERR.NO_AUTORIZADO);
    }
    if (!_coordClaveOk(firma, clave)) {
      _coordSumarFallido(firma);
      auditar({ email: 'coordinacion', firma: firma, accion: 'COORD_INTENTO_FALLIDO',
        entidad: 'COORDINACION', idEntidad: '', patientId: '', resumen: 'clave incorrecta' });
      // Mismo mensaje siempre: decir «esa firma no tiene clave» delata cuáles sí.
      return err('Clave incorrecta.', ERR.NO_AUTORIZADO);
    }
    _coordProps().deleteProperty('coord_fallidos_' + firma);
    const token = _coordAbrirSesion(firma);
    auditar({ email: 'coordinacion', firma: firma, accion: 'COORD_ENTRADA',
      entidad: 'COORDINACION', idEntidad: '', patientId: '', resumen: 'entró al modo coordinación' });
    return ok({ token: token, firma: firma, minutos: _COORD_SESION_MIN, debeCambiarClave: _coordEsTemporal(firma) });
  } catch (e) { return err('coordEntrar: ' + e.message, ERR.INTERNO, e); }
}

function coordCambiarClave(datos) {
  try {
    const g = coordExigirSesion(datos && datos.token);
    if (!g.ok) return g;
    const nueva = String((datos && datos.nueva) || '');
    if (nueva.length < 8) return err('La clave nueva debe tener al menos 8 caracteres.', ERR.VALIDACION);
    // Sin sesión temporal hay que confirmar la actual: una sesión olvidada
    // abierta en un box no puede servir para quedarse con la cuenta.
    if (!_coordEsTemporal(g.firma) && !_coordClaveOk(g.firma, String((datos && datos.actual) || ''))) {
      return err('La clave actual no coincide.', ERR.NO_AUTORIZADO);
    }
    _coordGuardarClave(g.firma, nueva);
    _coordMarcarTemporal(g.firma, false);
    auditar({ email: 'coordinacion', firma: g.firma, accion: 'COORD_CAMBIO_CLAVE',
      entidad: 'COORDINACION', idEntidad: '', patientId: '', resumen: 'cambió su clave' });
    return ok({ firma: g.firma });
  } catch (e) { return err('coordCambiarClave: ' + e.message, ERR.INTERNO, e); }
}

/**
 * Una de las tres le restablece la clave a otra (D8: sin segundo factor por
 * ahora — se aplazó; el punto de enganche es esta función y solo esta).
 * Devuelve una clave temporal que hay que entregar en persona.
 */
function coordRestablecerClave(datos) {
  try {
    const g = coordExigirSesion(datos && datos.token);
    if (!g.ok) return g;
    const destino = String((datos && datos.firma) || '').toUpperCase().trim();
    if (COORD_FIRMAS.indexOf(destino) === -1) return err('Esa firma no tiene acceso al modo Coordinación.', ERR.VALIDACION);
    if (destino === g.firma) return err('Para cambiar tu propia clave usa «Cambiar mi clave».', ERR.VALIDACION);
    const temporal = _coordClaveTemporal();
    _coordGuardarClave(destino, temporal);
    _coordMarcarTemporal(destino, true);
    auditar({ email: 'coordinacion', firma: g.firma, accion: 'COORD_RESTABLECE_CLAVE',
      entidad: 'COORDINACION', idEntidad: destino, patientId: '',
      resumen: g.firma + ' le restableció la clave a ' + destino });
    return ok({ firma: destino, temporal: temporal });
  } catch (e) { return err('coordRestablecerClave: ' + e.message, ERR.INTERNO, e); }
}

/** Clave temporal legible: se dicta en voz alta una vez y se cambia al entrar. */
function _coordClaveTemporal() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  // sin I, O, 0, 1: se confunden al dictar
  let s = '';
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, Utilities.getUuid());
  for (let i = 0; i < 10; i++) s += abc.charAt(Math.abs(bytes[i]) % abc.length);
  return s.slice(0, 5) + '-' + s.slice(5);
}

/**
 * Siembra las tres claves la PRIMERA vez. Se corre desde el editor, una sola
 * vez, y devuelve las claves temporales para entregarlas en persona.
 * Idempotente: no pisa una clave ya puesta.
 */
function coordSembrarClaves() {
  const out = [];
  COORD_FIRMAS.forEach(function (f) {
    if (_coordProps().getProperty('coord_hash_' + f)) { out.push(f + ': ya tiene clave (no se toca)'); return; }
    const t = _coordClaveTemporal();
    _coordGuardarClave(f, t);
    _coordMarcarTemporal(f, true);
    out.push(f + ': ' + t + '  (temporal — la cambia al entrar)');
  });
  console.log('── Claves del modo Coordinación ──\n' + out.join('\n') +
    '\n\nEntrégalas EN PERSONA. No las dejes escritas en un chat ni en la planilla.');
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// LA MARCA DE ARRASTRE  (D7 — decisión de Manuel, 18-ago-2026)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lee las correcciones de una ficha. Formato de cada entrada:
 *   { c: campo, a: valor anterior, n: valor nuevo, f: firma, ts: 'yyyy-MM-dd HH:mm' }
 */
function coordCorrecciones(obj) {
  if (!obj) return [];
  try {
    const j = obj.CORRECCIONES_JSON;
    if (!j) return [];
    const arr = (typeof j === 'string') ? JSON.parse(j) : j;
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

/**
 * ¿Este campo fue corregido por la coordinación?  ← la marca de arrastre.
 *
 * Un campo marcado NO lo pisa el guardado del turno: «normalmente no se
 * modifica, así que no debería poder modificarla» (Manuel, 18-ago-2026).
 * Lo consulta svc_evoluciones antes de reescribir una fecha semilla.
 */
function coordCampoCorregido(obj, campo) {
  const arr = coordCorrecciones(obj);
  for (let i = 0; i < arr.length; i++) if (arr[i] && arr[i].c === campo) return true;
  return false;
}

/**
 * Suelta la marca de un campo. Se usa cuando arranca un TRAMO CLÍNICO NUEVO
 * de verdad — el paciente pasó de VM a VNI, o de TOT a TQT — porque entonces
 * la fecha corregida ya no describe ese tramo y congelarla sería peor que el
 * error original.
 */
function coordSoltarMarca(hoja, colKey, id, obj, campo) {
  const arr = coordCorrecciones(obj).filter(function (x) { return !x || x.c !== campo; });
  const campos = {};
  campos.CORRECCIONES_JSON = arr.length ? JSON.stringify(arr) : '';
  try { repoActualizar(hoja, colKey, id, campos); } catch (e) { console.warn('coordSoltarMarca: ' + e.message); }
  return arr;
}

// ─────────────────────────────────────────────────────────────────────────────
// CORREGIR UNA FICHA
// ─────────────────────────────────────────────────────────────────────────────

/** Ubica al paciente por PATIENT_ID: primero en cama, después en el archivo. */
function _coordUbicar(patientId, idCama) {
  const pid = String(patientId || '').trim();
  if (pid) {
    const camas = repoLeerTodos('CAMAS_ESTADO');
    for (let i = 0; i < camas.length; i++) {
      if (esVerdadero(camas[i].OCUPADA) && String(camas[i].PATIENT_ID || '') === pid) {
        return { tipo: 'activo', hoja: 'CAMAS_ESTADO', colKey: 'ID_CAMA', id: String(camas[i].ID_CAMA), obj: camas[i] };
      }
    }
    const arch = repoLeerTodos('ARCHIVO_PACIENTES');
    for (let j = 0; j < arch.length; j++) {
      if (String(arch[j].PATIENT_ID || '') === pid) {
        return { tipo: 'egresado', hoja: 'ARCHIVO_PACIENTES', colKey: 'ID_ARCHIVO', id: String(arch[j].ID_ARCHIVO), obj: arch[j] };
      }
    }
  }
  if (idCama) {
    const c = repoBuscarPorId('CAMAS_ESTADO', 'ID_CAMA', String(idCama));
    if (c && esVerdadero(c.OCUPADA)) {
      return { tipo: 'activo', hoja: 'CAMAS_ESTADO', colKey: 'ID_CAMA', id: String(c.ID_CAMA), obj: c };
    }
  }
  return null;
}

/** Valida un valor contra el tipo declarado en COORD_CAMPOS. */
function _coordValidar(campo, meta, valor) {
  const v = String(valor == null ? '' : valor).trim();
  if (meta.tipo === 'fecha') {
    if (v === '') return { ok: true, valor: '' };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { ok: false, error: meta.etiqueta + ': la fecha debe ser AAAA-MM-DD.' };
    const d = new Date(v + 'T12:00:00');
    if (isNaN(d.getTime())) return { ok: false, error: meta.etiqueta + ': esa fecha no existe.' };
    return { ok: true, valor: v };
  }
  if (meta.tipo === 'entero') {
    if (v === '') return { ok: true, valor: '' };
    if (!/^\d{1,3}$/.test(v)) return { ok: false, error: meta.etiqueta + ': debe ser un número entero.' };
    return { ok: true, valor: parseInt(v, 10) };
  }
  if (meta.tipo === 'rut') {
    if (v === '') return { ok: true, valor: '' };   // el RUT es opcional
    if (typeof rutValido === 'function' && !rutValido(v)) {
      return { ok: false, error: 'El RUT no es válido (dígito verificador).' };
    }
    return { ok: true, valor: (typeof _rutNormal === 'function') ? _rutNormal(v) : v };
  }
  return { ok: true, valor: v };
}

/** Hora del par de una fecha semilla, si viene declarada. */
function _coordHoraValida(h) {
  const s = String(h || '').trim();
  return /^\d{2}:\d{2}$/.test(s) ? s : '';
}

/**
 * Recalcula los días que dependen de las fechas. Con `diasEntre` — días de
 * CALENDARIO, como la lista oficial del hospital (BUDA). NO con bloques de
 * 24 h: eso fue la v5.19 y se revirtió en la v5.37 porque despegaba la app del
 * papel que el equipo lee en la reunión.
 *
 * Solo tiene efecto en un EGRESADO: en un activo los días ya se calculan solos
 * cada vez que se miran. En el archivo están congelados desde el alta — y ese
 * congelamiento es justo el origen del caso que motivó todo esto.
 */
function _coordRecalcularDias(ubic, campos) {
  if (ubic.tipo !== 'egresado') return {};
  const a = ubic.obj;
  const ing = campos.FECHA_INGRESO !== undefined ? campos.FECHA_INGRESO : a.FECHA_INGRESO;
  const egr = campos.FECHA_EGRESO  !== undefined ? campos.FECHA_EGRESO  : a.FECHA_EGRESO;
  const iso = function (x) { const s = String(x || ''); return s ? s.slice(0, 10) : ''; };
  const out = {};
  if (iso(ing) && iso(egr)) {
    out.DIAS_TOTAL = diasEntre(iso(ing), iso(egr));
    if (a.DIAS_VM_TOTAL !== '' && a.DIAS_VM_TOTAL != null) {
      // Los días de VM del archivo no guardan su fecha de inicio, así que no se
      // pueden re-derivar: se dejan como están y se dice, en vez de inventar.
      out._avisoVM = true;
    }
  }
  return out;
}

/**
 * Corrige campos de una ficha (activa o archivada).
 *
 * Promesas que cumple, en este orden:
 *   1. sesión viva verificada en el SERVIDOR
 *   2. lista blanca: nada fuera de COORD_CAMPOS se escribe
 *   3. validación por tipo
 *   4. los días siguen a sus fechas
 *   5. sello visible + AUDIT_LOG, con la firma de QUIEN entró
 */
function coordCorregirFicha(datos) {
  try {
    const g = coordExigirSesion(datos && datos.token);
    if (!g.ok) return g;

    const ubic = _coordUbicar(datos && datos.patientId, datos && datos.idCama);
    if (!ubic) return err('No se encontró ese paciente, ni en cama ni en el archivo.', ERR.NO_ENCONTRADO);

    const cambios = (datos && datos.cambios) || {};
    const horas   = (datos && datos.horas) || {};
    const campos = {}, aplicados = [];

    for (const campo in cambios) {
      if (!Object.prototype.hasOwnProperty.call(cambios, campo)) continue;
      const meta = COORD_CAMPOS[campo];
      if (!meta) return err('El campo «' + campo + '» no se puede corregir desde aquí.', ERR.VALIDACION);
      if (meta.soloArchivo && ubic.tipo !== 'egresado') {
        return err(meta.etiqueta + ' solo existe en un paciente que ya egresó.', ERR.VALIDACION);
      }
      const v = _coordValidar(campo, meta, cambios[campo]);
      if (!v.ok) return err(v.error, ERR.VALIDACION);

      const antes = String(ubic.obj[campo] == null ? '' : ubic.obj[campo]);
      const antesN = (meta.tipo === 'fecha') ? antes.slice(0, 10) : antes;
      if (String(v.valor) === antesN) continue;   // sin cambio: no se escribe ni se sella

      campos[campo] = v.valor;
      aplicados.push({ c: campo, a: antesN, n: String(v.valor), f: g.firma, ts: _tsAhora() });

      // La marca de hora viaja pegada a su fecha: corregir el día y dejar la
      // hora vieja deja el momento a medio corregir.
      if (meta.ts) {
        const h = _coordHoraValida(horas[campo]);
        if (v.valor === '') campos[meta.ts] = '';
        else if (h) campos[meta.ts] = String(v.valor) + ' ' + h;
        else {
          const tsAnt = String(ubic.obj[meta.ts] || '');
          const hAnt = tsAnt.length >= 16 ? tsAnt.slice(11, 16) : '08:00';
          campos[meta.ts] = String(v.valor) + ' ' + hAnt;
        }
      }
    }

    if (!aplicados.length) return ok({ sinCambios: true, tipo: ubic.tipo });

    // Las fechas nunca pueden quedar al revés, se hayan tocado ahora o antes.
    const fIng = String(campos.FECHA_INGRESO !== undefined ? campos.FECHA_INGRESO : (ubic.obj.FECHA_INGRESO || '')).slice(0, 10);
    const fEgr = String(campos.FECHA_EGRESO  !== undefined ? campos.FECHA_EGRESO  : (ubic.obj.FECHA_EGRESO  || '')).slice(0, 10);
    if (fIng && fEgr && fIng > fEgr) {
      return err('La fecha de ingreso (' + fIng + ') no puede ser posterior a la de egreso (' + fEgr + ').', ERR.VALIDACION);
    }

    const recalc = _coordRecalcularDias(ubic, campos);
    const avisoVM = !!recalc._avisoVM; delete recalc._avisoVM;
    for (const k in recalc) if (Object.prototype.hasOwnProperty.call(recalc, k)) campos[k] = recalc[k];

    // Sello visible + marca de arrastre: la misma columna sirve para las dos.
    const previas = coordCorrecciones(ubic.obj);
    campos.CORRECCIONES_JSON = JSON.stringify(previas.concat(aplicados));

    repoActualizar(ubic.hoja, ubic.colKey, ubic.id, campos);

    aplicados.forEach(function (x) {
      auditar({ email: 'coordinacion', firma: g.firma, accion: 'COORD_CORRIGE_FICHA',
        entidad: ubic.hoja, idEntidad: ubic.id, patientId: String(ubic.obj.PATIENT_ID || ''),
        resumen: (COORD_CAMPOS[x.c] ? COORD_CAMPOS[x.c].etiqueta : x.c) + ': «' + x.a + '» → «' + x.n + '»' });
    });

    return ok({
      tipo: ubic.tipo, idCama: ubic.tipo === 'activo' ? ubic.id : '',
      patientId: String(ubic.obj.PATIENT_ID || ''),
      corregidos: aplicados.length,
      diasTotal: (recalc.DIAS_TOTAL !== undefined) ? recalc.DIAS_TOTAL : null,
      avisoVM: avisoVM,
      correcciones: previas.concat(aplicados),
      accion: 'corregir_ficha', entidad: ubic.hoja,
    });
  } catch (e) { return err('coordCorregirFicha: ' + e.message, ERR.INTERNO, e); }
}

/** Ficha completa para el panel: valores actuales, qué se puede tocar y el historial. */
function coordFicha(datos) {
  try {
    const g = coordExigirSesion(datos && datos.token);
    if (!g.ok) return g;
    const ubic = _coordUbicar(datos && datos.patientId, datos && datos.idCama);
    if (!ubic) return err('No se encontró ese paciente, ni en cama ni en el archivo.', ERR.NO_ENCONTRADO);

    const o = ubic.obj, campos = [];
    for (const c in COORD_CAMPOS) {
      if (!Object.prototype.hasOwnProperty.call(COORD_CAMPOS, c)) continue;
      const meta = COORD_CAMPOS[c];
      if (meta.soloArchivo && ubic.tipo !== 'egresado') continue;
      const val = o[c] == null ? '' : String(o[c]);
      const tsv = meta.ts ? String(o[meta.ts] || '') : '';
      campos.push({
        campo: c, etiqueta: meta.etiqueta, tipo: meta.tipo,
        valor: (meta.tipo === 'fecha') ? val.slice(0, 10) : val,
        hora: tsv.length >= 16 ? tsv.slice(11, 16) : '',
        corregido: coordCampoCorregido(o, c),
      });
    }
    return ok({
      tipo: ubic.tipo, idCama: ubic.tipo === 'activo' ? ubic.id : String(o.CAMA_ORIGEN || ''),
      patientId: String(o.PATIENT_ID || ''), nombre: String(o.NOMBRE || ''),
      dias: ubic.tipo === 'egresado' ? o.DIAS_TOTAL : null,
      campos: campos, correcciones: coordCorrecciones(o),
    });
  } catch (e) { return err('coordFicha: ' + e.message, ERR.INTERNO, e); }
}
