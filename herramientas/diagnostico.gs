// diagnostico.gs — POR QUÉ LA APP DICE «No se pudo verificar la conexión».
//
// Pegar como ARCHIVO NUEVO en el editor (➕ → Secuencia de comandos → nombre
// «diagnostico»), elegir la función `diagnosticoArranque` en el selector y
// ▶ Ejecutar. La respuesta sale en el REGISTRO DE EJECUCIÓN.
//
// Es AUTOCONTENIDO a propósito: no llama a ninguna función del proyecto, así
// que funciona igual aunque falte un archivo por pegar. Solo lectura: no
// escribe nada, no crea hojas, no toca datos. Se puede borrar después.
// Sin nombres ni RUT en la salida.

function diagnosticoArranque() {
  var L = ['🩺 DIAGNÓSTICO DE ARRANQUE — RCE-KINE', ''];
  var problemas = [];

  // ── 1 · ¿El proyecto está VINCULADO a una planilla? ──────────────────
  // Si el proyecto se creó desde script.google.com en vez de
  // Extensiones → Apps Script, no hay planilla activa y TODA lectura falla.
  var ss = null;
  try { ss = SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { ss = null; }
  if (!ss) {
    L.push('❌ 1 · El proyecto NO está vinculado a ninguna planilla.');
    L.push('     Se creó suelto (desde script.google.com) en vez de abrirlo desde');
    L.push('     la planilla con Extensiones → Apps Script. Sin planilla, la app');
    L.push('     no puede leer ni escribir nada.');
    L.push('     👉 Abre TU planilla → Extensiones → Apps Script y pega ahí los archivos.');
    Logger.log(L.join('\n'));
    return L.join('\n');
  }
  L.push('✅ 1 · Planilla vinculada: «' + ss.getName() + '»');

  // ── 2 · ¿Están los archivos del editor? ──────────────────────────────
  // Una función de cada archivo. Si falta una, ese archivo no se pegó (o se
  // pegó a medias) y el dispatcher revienta antes de responder.
  var archivos = [
    ['esquema',       'crearORepararEstructura'],
    ['repo',          'repoLeerTodos'],
    ['infra',         'hoyISO'],
    ['infra (auth)',  'autorizar'],
    ['dominio',       'validarPayloadEvolucion'],
    ['servicios',     'obtenerTodasLasCamas'],
    ['api',           'api'],
    ['webapp',        'doGet'],
    ['mantenimiento', 'cuadrarEncabezados'],
  ];
  var faltan = [];
  archivos.forEach(function (a) {
    var hay = false;
    try { hay = (eval('typeof ' + a[1]) === 'function'); } catch (e) { hay = false; }
    if (!hay) faltan.push(a[0] + ' (falta ' + a[1] + ')');
  });
  if (faltan.length) {
    L.push('❌ 2 · Faltan archivos por pegar: ' + faltan.join(' · '));
    problemas.push('pegar los archivos que faltan');
  } else {
    L.push('✅ 2 · Los 9 archivos del editor están.');
  }

  // ── 3 · ¿Están las hojas? ────────────────────────────────────────────
  var esperadas = ['CONFIG', 'CAMAS_ESTADO', 'EVOLUCIONES', 'KINESIOLOGOS', 'TIMELINE',
                   'PROCEDIMIENTOS', 'ARCHIVO_PACIENTES', 'AUDIT_LOG', 'CATALOGOS'];
  var hay = {};
  ss.getSheets().forEach(function (h) { hay[h.getName()] = true; });
  var sinHoja = esperadas.filter(function (n) { return !hay[n]; });
  L.push('   Hojas en la planilla: ' + ss.getSheets().length);
  if (sinHoja.length) {
    L.push('❌ 3 · Faltan hojas: ' + sinHoja.join(', '));
    L.push('     👉 Ejecuta crearORepararEstructura() desde el editor (archivo «esquema»)');
    L.push('        y CONFIRMA en el registro que corrió ESA función.');
    problemas.push('correr crearORepararEstructura()');
  } else {
    L.push('✅ 3 · Las hojas base están.');
  }

  // ── 4 · ¿Se puede LEER la hoja CONFIG? ───────────────────────────────
  // Es lo primero que hace el servidor en cada llamada (para saber si el
  // acceso está abierto). Si esto falla, la app muestra la pantalla de
  // «No se pudo verificar la conexión» aunque todo lo demás esté bien.
  var dev = '';
  if (hay['CONFIG']) {
    try {
      var vals = ss.getSheetByName('CONFIG').getDataRange().getValues();
      for (var i = 0; i < vals.length; i++) {
        if (String(vals[i][0]).trim() === 'AUTH_DEV_MODE') dev = String(vals[i][1]).trim();
      }
      L.push('✅ 4 · CONFIG se lee. AUTH_DEV_MODE = ' + (dev || '(vacío)'));
      if (dev.toUpperCase() !== 'TRUE') {
        L.push('   ⚠️ Con AUTH_DEV_MODE distinto de TRUE la app EXIGE iniciar sesión con Google.');
        L.push('      👉 Ejecuta activarModoPrueba() para abrirla, o deja TRUE en la hoja CONFIG.');
        problemas.push('poner AUTH_DEV_MODE en TRUE');
      }
    } catch (e) {
      L.push('❌ 4 · No se pudo leer CONFIG: ' + e.message);
      problemas.push('revisar la hoja CONFIG');
    }
  }

  // ── 5 · La prueba de verdad: llamar al servidor como lo hace la app ──
  if (typeof api === 'function') {
    try {
      var r = api('WHOAMI', {}, '');
      if (r && r.ok) L.push('✅ 5 · El servidor responde WHOAMI: firma «' + r.data.firma + '».');
      else {
        L.push('❌ 5 · El servidor RECHAZA la llamada: ' + ((r && r.error) || 'sin mensaje'));
        problemas.push('ver el mensaje del punto 5');
      }
    } catch (e) {
      L.push('❌ 5 · El servidor LANZA ERROR al responder: ' + e.message);
      L.push('     Ése es exactamente el error que hace aparecer la pantalla de reconexión.');
      problemas.push('corregir: ' + e.message);
    }
  }

  // ── 6 · ¿La app está PUBLICADA, y en qué dirección? ──────────────────
  // El servidor puede estar sano y la app fallar igual: /exec sirve la
  // VERSIÓN DESPLEGADA, no lo último guardado. Si la implementación quedó
  // anclada a una versión anterior al pegado, el navegador recibe código
  // viejo. Y si hay más de una implementación, la dirección que se abre
  // puede no ser la que se actualizó.
  try {
    var svc = ScriptApp.getService();
    if (!svc.isEnabled()) {
      L.push('❌ 6 · La aplicación web NO está publicada.');
      L.push('     👉 Implementar → Nueva implementación → Aplicación web.');
      problemas.push('publicar la aplicación web');
    } else {
      L.push('✅ 6 · Aplicación web publicada. La dirección BUENA es:');
      L.push('     ' + svc.getUrl());
      L.push('     👉 Compara ESA dirección con la que tienes abierta en el navegador.');
      L.push('        Si no son iguales, estás entrando a otra implementación.');
      L.push('        Si son iguales: Implementar → Administrar implementaciones → ✏️ →');
      L.push('        Nueva versión (el /exec sirve la versión desplegada, no lo guardado).');
    }
  } catch (e) {
    L.push('⚠️ 6 · No se pudo consultar la publicación: ' + e.message);
  }

  // ── 7 · ¿Cómo se ejecuta la app publicada? ───────────────────────────
  // Si quedó como «Usuario que accede a la aplicación web», cada persona
  // tiene que autorizar los permisos por su cuenta; mientras no lo haga, la
  // pantalla carga pero NINGUNA llamada al servidor responde — que es
  // exactamente el síntoma de «No se pudo verificar la conexión».
  L.push('');
  L.push('📋 7 · Revisa a ojo, en Implementar → Administrar implementaciones:');
  L.push('     · «Ejecutar como» debe decir TU cuenta (no «Usuario que accede»).');
  L.push('     · «Quién tiene acceso» debe decir «Cualquier usuario».');
  L.push('     · La versión debe ser POSTERIOR al último pegado.');
  L.push('     Y en el menú Ejecuciones: al abrir la app debe aparecer una');
  L.push('     ejecución nueva. Si no aparece ninguna, la llamada no está llegando.');

  L.push('');
  L.push(problemas.length
    ? '👉 QUÉ HACER: ' + problemas.join(' · ')
    : '✅ El servidor está sano. Si la pantalla sigue igual: publica de nuevo ' +
      '(Implementar → Administrar implementaciones → ✏️ → Nueva versión) y abre /exec con Ctrl+Shift+R.');
  var txt = L.join('\n');
  Logger.log(txt);
  return txt;
}
