# RCE-KINE v2 — Registro Clínico Electrónico de Kinesiología UCI

Google Apps Script + Google Sheets. Hospital San Pablo de Coquimbo, unidad
de kinesiología UCI. El usuario es **Diego Melo Villagrán** (coordinador de
kinesiólogos, no programador): trabaja en español, actualiza el proyecto
**pegando a mano** los archivos en el editor de Apps Script, y prueba en el
navegador del hospital o de su casa.

## Cómo trabajar con Diego

- Todo en **español**. Explicar sin jerga; él decide, tú propones opciones
  ANTES de tocar código cuando el cambio es de diseño/UX ("dame opciones").
- **Cada entrega de archivos** debe decir: qué archivos pegar, si hay que
  correr `crearORepararEstructura()`, y recordar el paso **Nueva versión**
  (usar la skill `entrega-gas`; el index SIEMPRE en formato cohete).
- No agregar funcionalidades que no pidió (p. ej. rechazó envío de correos).
- Los eventos de vía aérea (intubación, extubación, TQT, decanulación) se
  registran **manualmente** por decisión clínica; las alertas solo detectan
  olvidos, nunca automatizan el registro.

## Arquitectura

- **Repo = verdad.** `v2/*.gs` + `v2/index.html` (fuente, sin minificar).
  El proyecto GAS de producción usa un layout de 9 .gs: los 11 `svc_*.gs`
  viajan fusionados como `servicios.gs` (`build/fusionar_servicios.js`).
- `api.gs`: dispatcher único `api(accion, datos, token)`; escrituras pasan
  por `_auditar`. `GET_LOGIN_INFO` es pre-auth (público).
- `esquema.gs`: 20 hojas; **EVOLUCIONES tiene 380 columnas** y `testEsquema`
  las asserta — al agregar columnas, SIEMPRE al final de la lista (la
  reparación reescribe encabezados: insertar al medio desalinea los datos)
  y avisar que hay que correr `crearORepararEstructura()`.
- **RUT** (uso interno autorizado): identidad de PERSONA en CAMAS_ESTADO y
  ARCHIVO_PACIENTES; PATIENT_ID sigue siendo el episodio. PAC_RUT viaja
  transitorio en el guardado (no se persiste en EVOLUCIONES). El RUT jamás
  sale en REM, tablero ni exportaciones.
- Identidad de paciente = `PATIENT_ID` (episodio); los traslados re-estampan
  EVOLUCIONES y TIMELINE (`_reetiquetarEpisodioACama`).
- `AUTH_DEV_MODE=TRUE` en CONFIG: acceso abierto intencional (marcha
  blanca). **Login/demo RETIRADOS DE LA VISTA** (jul-2026, pedido de Diego):
  `LOGIN_UI_ACTIVO=false` en index oculta la devbar y reemplaza el overlay
  GIS por un mensaje neutro de reconexión. Para REINCORPORAR cuando Diego lo
  pida: poner `LOGIN_UI_ACTIVO=true` (todo el mecanismo GIS + GET_LOGIN_INFO
  sigue intacto detrás del flag) y, para exigir identidad real, además
  AUTH_DEV_MODE=FALSE en CONFIG + OAUTH_CLIENT_ID configurado.
- Frontend: `v2/index.html` único (~9.300 líneas fuente). Piel estilo
  Notion (variables `--n-*`, portadas `.tbanner` por pestaña). Convención
  **`uiConfirm`** (jamás `confirm()` nativo). Módulos heredados del turno
  anterior usan la clase `.heredado` + chip «✓ Sin cambios» por bloque.

## La saga del boot (léela antes de tocar el arranque o la entrega)

Días de fallos con `Uncaught SyntaxError: Invalid regular expression:
missing / @userCodeAppPanel...`. Lo aprendido, pagado caro:

1. La línea del error pertenece al **bootstrap de Google**, no a nuestro
   archivo (misma línea 1842 con dos contenidos distintos lo demostró).
2. Google re-procesa el HTML servido con un parser más estricto que Chrome:
   los `<`/`>` **crudos** en markup (p.ej. `VM < 24 h` en un comentario, o
   `value="PAS > 180"`) lo tumban. Guardia: `build/checks/convenciones.js`.
3. La solución definitiva es el **cohete** (`build/empaquetar_cohete.js`):
   cargador ASCII puro + app en base64 → Google nunca ve el HTML real.
   Costo medido: ~50 ms una vez por carga. El index NUNCA se entrega crudo.
4. `createTemplateFromFile` (plantillas) también rompía el arranque: el
   `doGet` usa `createHtmlOutputFromFile` y así debe quedarse.
5. **`/exec` sirve la versión desplegada** (requiere «Nueva versión» tras
   cada pegado); `/dev` sirve lo recién guardado pero solo para el dueño.
6. El sello de versión (`meta rce-version` + `[index X.Y]` en el watchdog)
   existe para saber siempre qué archivo produjo un error. Mantenerlo al día.
7. Cuidado propio: al generar literales con caracteres invisibles, este
   modelo puede emitir U+2028 real en vez del escape → romper con el mismo
   error. Escribir ` ` con printf/escapes, nunca literal.

## Verificación (skill `verificar`)

`build/checks/`: `convenciones.js` (estáticas), `arranque.js` (boot real en
Chromium con puente simulado; acepta ruta del cohete como argumento),
`regresion_ui.js`, `movil.js`, `piel.js`, `rem.js`, `indicadores.js`,
`eventos.js`, `eventos_ui.js`, `docs.js`, `tutorial.js`, `paquete.js`,
`reset.js`, `mover_camas.js`, `vm_lote.js`, `retro_camas.js`,
`rendimiento.js` (bucles de repintado con la unidad llena),
`texto_bloques.js` (la etiqueta de bloque no altera el texto visible),
`asincronia.js` (Ppl/AutoPEEP inhabilitados con paciente asincrónico).
Correr antes de entregar o commitear. Un bug que costó más de un
intercambio merece guardia nueva.

## Hoja UCI (historial · jul-2026)

Primera pestaña del historial: reproduce **la hoja de registro kinésico de la
unidad** (el papel que el equipo lee hace años) día a día, con columnas
`fecha → DÍA | NOCHE`. Se arma **en el cliente** desde `TL_EVOS` (el historial
ya trae vivas + archivadas); no hubo cambios de servidor.

- **Segmentos** (`hjSetSeg`): Todo · Ventilatorio · **Weaning** · Neuromuscular ·
  Dispositivos y NAVM · Eventos. El weaning va **dentro de Ventilatorio** y
  además como bloque propio (en «Todo» no se duplica). Las filas **ancla**
  (fase, soporte, firma) sobreviven a todos los filtros.
- Rango 7/14/toda la estadía, colapso de filas sin datos, columna de
  TENDENCIA con curva, cruz de lectura al pasar el cursor y «▸ ver» que abre
  el desglose de MRC-ss y FSS-ICU.
- El bloque **NAVM** reúne el paquete de prevención: días de VM, cuff,
  cabecera, Trachcare, HEPA, HME, humidificación y cultivo.
- Filas definidas en `HJ_F` (cómo se lee cada dato) y bloques en `HJ_BLOQUES`.
- **Trampas ya pagadas**: las clases de franja necesitan prefijo `hjb-` porque
  `.mon`, `.nm`, `.ev` YA existen en la app y pisaban el estilo; y los
  decimales se guardan con coma («5,9»), así que `parseFloat` directo los
  truncaba — usar `_hjNum`. Guardia: `checks/hoja_uci.js`.

## Estado y pendientes (julio 2026)

- **VELOCIDAD · LA CONFIGURACIÓN SE LEE UNA VEZ POR PETICIÓN (ago-2026, sin
  cambio de index — NO exige `crearORepararEstructura()`).** Propuesto por
  Manuel Fuentes trayendo el método de otro sistema Apps Script + Sheets (la
  agenda de Colitas): medir por capas antes de tocar, y después demostrar que
  acelerar no cambió ningún dato.
  1. `leerConfig` bajaba la tabla CONFIG **entera cada vez que se le preguntaba
     una clave**, y un arranque pregunta **17 veces** (12 en `_configUI`, 4 en
     camas, 1 en evoluciones) por una tabla de ~20 filas. Ahora hay un memo por
     petición (`_cfgTabla` en esquema.gs): **17 lecturas → 1**.
  2. `configVal` (infra_util.gs) usaba su propio camino por `repoLeerTodos` y
     corre en el de autenticación, o sea en **todas** las llamadas al servidor,
     no solo al arrancar. Ahora comparte el mismo memo.
  3. `catalogo()` y `catMatrices()` igual (GET_BOOT pide fases y matrices).
  4. El memo se olvida en `api()` al entrar y en cada escritura de CONFIG o de
     catálogos ⇒ nadie puede leer configuración vieja. El reseteo en `api()` no
     es decorativo: en producción cada petición es un proceso nuevo, pero **el
     simulador atiende muchas peticiones en un mismo proceso de Node** y sin él
     una prueba vería la configuración de la anterior.
  5. `medirArranque()` (mantenimiento.gs, correr desde el editor) cronometra
     GET_BOOT por capas CON y SIN memo y compara las dos respuestas: si
     difieren en algo, lo dice. Mide con el orden desfavorable al memo a
     propósito (las lecturas quedan tibias del lado de Google).
  6. Guardia: `checks/memo_config.js` (11 asserts: equivalencia de valores
     —incluidas las rarezas de clave duplicada y valor vacío—, 17→1 lecturas,
     e invalidación).
  - **Descartado con evidencia, no por opinión**: el arranque del cliente ya
    hace **un solo viaje** (GET_BOOT, v5.21) y `avisoCierreAnio()` sale por su
    guarda de ventana fuera de dic-feb. **NO se copió de la agenda el caché
    largo con precalentador**: allá el dato es una cita y aquí es un paciente
    en UCI — cachear camas o evoluciones por horas es un riesgo clínico. Solo
    se memoriza lo que no es clínico: CONFIG, CATALOGOS, CAT_MATRICES.
  - **MEDIDO EN EL PROYECTO REAL (5-ago-2026 23:56)**: `GET_BOOT` **3.823 ms →
    1.253 ms** (−2.570 ms, **67%**); solo la configuración **2.717 ms → 345 ms**.
    «Respuesta idéntica con y sin memo: **SÍ ✓**». Referencia sin/con memo:
    camas 294/290 · evoluciones 478/660 · fases 83/138 · matrices 78/0 — esas
    partes varían por ruido de red en ambos sentidos; la que cambia de verdad es
    la config. La medición corrió CON memo primero y SIN memo después, o sea con
    el orden que favorece al comportamiento antiguo: la ganancia real no es menor
    que la medida.
  - **TRAMPA NUEVA (misma sesión)**: el selector de funciones del editor
    **ejecutó la función ANTERIOR** (`cuadrarEncabezados`) aunque la barra ya
    mostraba `medirArranque`; el segundo Ejecutar sí corrió la elegida. Es el
    mismo desfase documentado en la agenda de Colitas. **Antes de creerle a una
    ejecución, leer el registro y confirmar que la salida es la de la función que
    se eligió** — en esa lista conviven `resetearBaseDeDatosCONFIRMAR` y
    `archivarAnioHistoricoCONFIRMAR`. (Aquí no hubo daño: `cuadrarEncabezados`
    es idempotente y el registro dice «ya estaba cuadrada» en las 23 hojas,
    «todas las hojas existían» y `testEsquema: []`.)
  - PUBLICADO: **Versión 21** del 6-ago-2026 1:24, con el mismo ID de
    implementación (la URL del equipo no cambia).
- **OLA 1 · EL EPISODIO SE BAJA UNA SOLA VEZ (6-ago-2026, solo `.gs`, sin tocar
  `index.html` ni rearmar el cohete).** Segunda mitad del trabajo de velocidad:
  el arranque ya estaba resuelto, faltaban los tres flujos que se usan todo el
  día. El diagnóstico no era «algoritmo lento» sino **la misma pregunta repetida
  dentro de una misma acción**.
  1. **`_PRONO_ABIERTO_TS` retirado** (`svc_evoluciones.gs`). Campo transitorio
     que costaba una bajada COMPLETA de EVOLUCIONES por apertura y **no lo leía
     nadie**: 0 usos en los `.gs`, 0 en `index.html` y 0 en el cohete desplegado
     (decodificado íntegro a 960.583 bytes, donde `pronoAbierto` sí sale 5
     veces). Es la ÚNICA respuesta que cambia en toda la Ola 1.
  2. **El episodio viaja por parámetro.** `obtenerEvolucionPrevia(idCama,
     turnoKey, _evos)` y `_pronoAbiertoTS(idCama, turnoKey, _evos)` aceptan las
     evoluciones ya leídas; `obtenerEvoTurno` las lee UNA vez y se las pasa a
     las dos. Antes eran tres bajadas idénticas de la misma hoja, en el mismo
     segundo, dentro de la misma acción.
  3. **`_tz()` memoizado** (`esquema.gs`, `_TZ_MEMO`), invalidado por
     `escribirConfig` y `_memoReset`. **Ojo con el alcance, que es el más ancho
     de los cinco**: `_tz()` no es un rincón raro, lo llaman `hoyISO()` y
     `ahoraTS()` (`infra_fechas.gs`), o sea **cada TIMESTAMP que se escribe** —
     cada evolución, cada hito, cada línea de auditoría. Aparte está la vía de
     `esquemaFilaAObjeto`, que lo pide por cada celda `Date`: esa hoy casi no se
     dispara (`_forzarTexto` mantiene las fechas como texto), pero basta UNA
     celda con formato de fecha para que una pantalla salte a miles de lecturas.
     Medido: 200 filas con celda `Date` pasan de **200 lecturas de CONFIG a 1**,
     con valor idéntico en los casos borde (clave ausente, vacía, duplicada,
     tras escribir, tras resetear). Guardia: `checks/memo_tz.js`.
  4. **`patientId` viaja a los hitos** (`svc_timeline.gs:146`). Sin él,
     `_agregarHitoInternoSinSync` volvía a CAMAS_ESTADO por CADA procedimiento
     del turno a buscar un dato que el guardado ya tenía en la mano.
  5. **Una sola lectura del episodio por guardado** (`_evosCama()`, perezoso y
     local a la invocación). Lo usan el cálculo de días, el histórico de BDT, el
     de test de apnea y la decanulación: los cuatro corren dentro del MISMO
     `conLock` y ANTES del único `repoUpsert`, así que devolvían por fuerza lo
     mismo. **Esto no es cachear datos clínicos** (que sigue prohibido): nada
     sobrevive a la petición.
  - **MEDIDO** (arnés con `repo.gs` y `esquema.gs` reales sobre un
    `SpreadsheetApp` instrumentado; 18 camas, 10 días, 364 filas × 386 columnas):

    | Flujo | Viajes | Celdas |
    |---|---|---|
    | Abrir paciente (turno nuevo) | 11 → **5** (−55%) | 398.638 → **133.120** (−67%) |
    | Abrir paciente (re-editar) | 6 → 6 | sin cambio |
    | Guardar normal | 19 → 19 | sin cambio |
    | Guardar protocolo de decanulación | 40 → **22** (−45%) | 931.357 → **134.803** (−86%) |
    | Guardar con 3 procedimientos | 46 → **37** (−20%) | sin cambio |

    **Los segundos NO están medidos** en estos flujos: lo medido son viajes y
    celdas. Decir «tanto más rápido» sería inventar.
  - **EQUIVALENCIA DEMOSTRADA, no supuesta**: arnés A/B que corre la versión
    anterior y la nueva sobre 12 escenarios clínicos y compara respuesta *y*
    secuela (fila guardada, cama, hitos). **10 de 12 idénticos**; los 2 restantes
    difieren exactamente en el campo retirado a propósito. Las **49 guardias**
    del proyecto pasan, incluida `prono.js` (39 asserts).
  - Guardia nueva: `checks/memo_episodio.js` — fija que el episodio se lea UNA
    vez al abrir y al guardar, que el campo muerto no vuelva (busca la
    asignación, no el nombre: el comentario que lo explica debe poder
    mencionarlo), que los hitos lleven el paciente puesto, y que **la petición
    siguiente vea lo que otro colega acaba de escribir**.
  - Para correr las guardias con navegador en un Mac:
    `export CHROMIUM_PATH="$HOME/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"`.
    Ojo: `checks/rendimiento.js` tiene la ruta `/opt/pw-browsers/chromium`
    **fija** y no lee esa variable — es el único que hay que parchear a mano.
  - **REVISIÓN ADVERSARIAL (11 revisores independientes, encargo de REFUTAR):
    0 refutaciones de 10.** Cada uno montó su propio arnés A/B contra el commit
    anterior; entre ellos sumaron >3.500 escenarios aleatorios comparando la
    base entera (EVOLUCIONES, CAMAS_ESTADO, TIMELINE, PROCEDIMIENTOS,
    REINTUBACIONES) con **0 diferencias**. Lo que dejaron anotado:
    1. ⚠️ **`medirArranque()` ya no es comparable con la cifra del 5-ago.** Su
       `limpiar` ahora apaga también `_TZ_MEMO`, así que la pasada «sin memo»
       mezcla los dos cambios y la línea base es más lenta que la que se midió.
       **No volver a citar el 67% como si saliera de la misma medición.**
    2. ⚠️ **El simulador es ciego a esto por construcción.** `sim_srv.js:26-29`
       devuelve las filas VIVAS de su base, mientras producción arma objetos
       nuevos por lectura (`repo.gs` + `esquemaFilaAObjeto`). O sea: las 32
       guardias de navegador pasarían igual con o sin la Ola 1, y el aliasing no
       se puede cazar ahí. Por eso `memo_episodio.js` lo audita a mano
       (bloque 5) en vez de confiar en el simulador.
    3. El repo REAL (`repoLeerFiltrado`, con su troceado por tramos y el
       fallback del bloque completo) **no lo ejercita ninguna guardia**: las
       cifras de viajes salen del arnés de medición, no de una guardia. Si
       alguien rompe el troceado, las guardias siguen verdes.
- 🔴 **HALLAZGO PREEXISTENTE, NO de la Ola 1: `LIMPIAR_CAMA` deja vivas las
  evoluciones del paciente anterior.** `_limpiarCamaInterno` (`svc_camas.gs:376`)
  vacía CAMAS_ESTADO campo por campo pero **no toca EVOLUCIONES** (verificado: 0
  menciones en la función). Solo `darAltaPaciente` las archiva y borra
  (`svc_camas.gs:279-280`). Como `_pronoAbiertoTS` filtra **solo por `ID_CAMA`**
  y no por `PATIENT_ID`, el siguiente ocupante de esa cama puede heredar una
  pronación abierta ajena: dos revisores lo reprodujeron por separado
  («tras 108,5 h en prono», horas de otro paciente). `_epiPrev` del guardado sí
  filtra por `PATIENT_ID`, así que los días de VM/VNI/VA están a salvo.
  **Decisión pendiente de Diego**: o `LIMPIAR_CAMA` archiva como el alta, o los
  lectores del episodio filtran también por `PATIENT_ID`. Ojo: deroga la premisa
  «la hoja viva solo tiene el episodio en curso», que aparece escrita como
  verificada en revisiones anteriores.
  - ✅ **PUBLICADA: Versión 22 del 6-ago-2026 7:50**, mismo ID de
    implementación. Verificado en el registro de Ejecuciones: `doGet` y `api`
    de la Versión 22, **todas «Completada», cero errores**, con el turno de la
    mañana usándola.
  - 🪤 **TRAMPA (costó un susto):** el editor de Apps Script abierto desde una
    sesión anterior muestra el contenido que tenía **en memoria**, no lo
    guardado. Al verificar un pegado, **recargar la pestaña primero** (mejor
    ⌘⇧R): sin recargar parecía que los archivos no tenían los cambios, y tras
    recargar estaban todos. Y el screenshot del navegador **no pinta el iframe
    de la app** aunque funcione: la app «en blanco» se descarta mirando el
    registro de Ejecuciones, no la captura.
  - PENDIENTE: **Ola 2** (fusionar `GET_STATS`+`GET_INDICADORES`, paralelizar
    los viajes en cadena) exige tocar `index.html` y rearmar el cohete: no
    empezarla hasta que la Ola 1 lleve tiempo en producción.
- 🔴 **EL FRONT DESPLEGADO ESTÁ EN 5.22, NO EN 5.43 (descubierto 6-ago-2026).**
  El `index.html` del proyecto es, **por dentro**, `5.22-cierre` — no es la
  etiqueta desfasada. Verificado decodificando el base64 del cargador desde el
  propio editor (`monaco.editor.getModels()`):

  | | Proyecto (producción) | Repo |
  |---|---|---|
  | Versión declarada y real | 5.22-cierre | 5.43-cierres |
  | Carga útil | 779.883 bytes | 960.583 bytes |
  | `pronoAbierto` | **0** | 5 |
  | `TEXTO_BLOQUES` | **0** | sí |

  Consecuencias: (a) todo el trabajo de interfaz de 5.23→5.43 está en el repo y
  **no** en lo que usa el equipo; (b) hoy corre un **servidor 5.43 con un front
  5.22**, combinación que **ninguna guardia cubre** — las guardias se corren
  siempre contra `v2/index.html`; (c) de rebote, confirma que retirar
  `_PRONO_ABIERTO_TS` es inocuo, porque este front ni siquiera tiene
  `pronoAbierto`. No se sabe cuándo ni cómo se degradó; puede haber sido un
  pegado propio. Consultado a Diego en #mejoras-rce el 6-ago; **no pegar el
  cohete 5.43 hasta que responda**.
- **v5.34–v5.36 · GENERADOR DE TEXTO VIVO + DÍAS COMO BUDA (4-ago-2026,
  cohete v5.36-noche; sin cambio de esquema).** Ronda nacida de reportes de
  Diego en uso real. TRES lecciones caras:
  1. **v5.34 · Los chips no regeneraban el texto.** Reporte: marcó «KTM
     nivel 1» y la evolución siguió diciendo «KTM contraindicada» (la réplica
     del turno anterior). Causa: `_rtxtLive` colgaba de 'input'/'change' del
     form, pero estado/nivel KTM, asistencia, cuff e IMS son
     `<button type="button">` — un botón NO emite esos eventos (mismo tropiezo
     del riel v5.25). Arreglo: listener 'click' delegado en #kf que cubre
     cualquier chip presente o futuro. Además **aviso de desfase al guardar**:
     con edición manual la regeneración queda en pausa por diseño, así que
     antes de guardar se comparan BLOQUE a BLOQUE (etiquetas TEXTO_BLOQUES de
     v5.23) el texto base de la edición vs el que saldría del motor; si no
     calzan, uiConfirm muestra «el texto dice / registraste» y decide el
     colega. Guardia `checks/texto_vivo.js` (11 asserts, verificada fallando
     contra el index anterior).
  2. **v5.35 · LOS DÍAS SE CUENTAN COMO LA LISTA OFICIAL (BUDA): días de
     CALENDARIO, ingreso = Día 0.** Diego mandó FOTO de la «Lista de
     hospitalizados UCI» del 3-ago (sistema BUDA): las 17 camas cuadran con
     `hoy − fecha ingreso`. Esto REVIERTE los bloques de 24 h de v5.19, que
     se construyó sobre un supuesto FALSO mío (que BUDA contaba por bloques).
     TS_INGRESO se sigue guardando (dato válido; ya no decide el número).
     `dias24`→`diasCal` en el index. Y **DIAS_VM/VA se CONGELAN al extubar**
     («se para el día que se extuba») en vez de caer a 0: el turno que extuba
     SÍ suma; el valor congelado se toma del turno anterior (no existe campo
     de fin de soporte — anotado como mejora). Guardia `checks/dias_estadia.js`
     asserta las 17 camas de la lista real (reemplaza a dias24.js).
  3. **v5.36→v5.37 · CAMA = EN VIVO · REGISTRO = LA HOJA DEL TURNO (regla
     DEFINITIVA, afinada por Diego a la 01:00 en pleno turno de noche).**
     Diego preguntó «¿a esta hora ya es otro día?» y en v5.36 respondí
     empujando la evolución de la Noche al día siguiente (fecha efectiva).
     **REVERTIDO ESA MISMA NOCHE**: la regla real tiene DOS vistas a
     propósito — la TARJETA DE CAMA cuenta contra el reloj REAL («en camas
     veo lo que pasa, lo real en vivo»: a las 00:01 ya dice el día nuevo), y
     el REGISTRO/evolución cuenta contra LA FECHA DEL TURNO (la hoja de la
     noche del 3 PERTENECE al 3; «los días se actualizan en la mañana al
     cambio de turno y aparece una planilla nueva limpia» — referencia de
     fecha de los procedimientos). Que difieran en 1 durante la madrugada es
     INTENCIONAL. NO volver a fechar los días con `_fechaEfectivaTurno`: esa
     función sigue vigente SOLO para dispositivos (v5.20) y eventos rápidos.
     De paso se MUDÓ de svc_eventos.gs a infra_fechas.gs (helper puro;
     dejarla allá obligaba a cada arnés a cargar svc_eventos —
     via_aerea_previo dejó de guardar y lo cazó la batería); checks/eventos.js
     la stubea para no pisar sus relojes. Guardia: bloque 3 de
     dias_estadia.js asserta las DOS vistas y la diferencia intencional.
  - **CORRECCIÓN DE FECHAS REALES (`mantenimiento_manuel.gs`, estado 4-ago)**:
    el simulacro de Diego (00:40) reveló que Manuel YA CONFIRMÓ su tanda
    vieja ⇒ 9 camas con fecha escrita, **5 equivocadas por ±1 día** (8, 9,
    13, 15, 18; el registro diario anota la noche bajo el día en que EMPIEZA,
    BUDA no). La tabla `_MTO_FECHAS` quedó con las fechas de la LISTA OFICIAL
    y **guardia POR NOMBRE** (`nom`: fragmento del apellido; cama con otro
    nombre = rotó = se salta — reemplaza a la guardia por fecha-de-carga, que
    murió cuando la tanda vieja escribió fechas). Las camas 11/14/16/17 van
    igual con fecha idéntica: su re-sellado quedó con la regla vieja. El
    re-sellado usa fecha efectiva y CONSERVA los DIAS_VM históricos si el
    reloj de VM no viene en los campos (extubadas 9/15 — antes los borraba a
    0). Camas 7 y 10 egresaron el 4-ago: NO se persiguen (decisión de Diego,
    período de aprendizaje). En cama 7 ahora está la señora trasladada DESDE
    la 3 (fecha 22-jul viajó con ella). PENDIENTE: Diego corre
    SIMULACRO→pega registro→CONFIRMAR.
  - **Diego ROMPIÓ el editor** pegando archivos sueltos del repo
    (dominio_texto → `_firmaCache` duplicado): en producción son 9 .gs
    fusionados. `/exec` NUNCA se cayó (sirve la versión publicada — la regla
    es no tocar «Nueva versión» hasta que `/dev` cargue). Camino de
    recuperación: `build/RCE-KINE_completo_v536.zip` (paquete verificado).
- **v5.38 · ENTREGA ANCHA EN DOS PISOS + DIAGNÓSTICO EN VEZ DEL CÓDIGO
  (4-ago-2026, cohete v5.38-entrega; sin cambio de esquema).**
  1. **Entrega rediseñada al mockup C** (`scratchpad/mockup_entrega_ancho.html`,
     elegido por Diego entre 3): cada paciente ocupa el ancho COMPLETO de la
     hoja. Barra de identidad (cama · nombre · edad/sexo/días · chips ·
     **diagnóstico**) + piso 1 «cómo está AHORA» (vía aérea y soporte ·
     parámetros · neuro/HDN · secreciones y circuito) + piso 2 «qué pasó y qué
     sigue» (eventos del episodio · rehabilitación y evaluaciones · plan).
     Antes eran 2 columnas de tarjetas angostas: se perdía media hoja de ancho
     y eventos/plan quedaban espachurrados. `.ent-fichas` a 1 columna también
     en `@media print`.
  2. **La ficha SIN evolución muestra el turno ANTERIOR** (petición de Diego:
     antes salía hueca — ~15 campos vacíos — y la hoja impresa no servía).
     `obtenerEntregaTurno` calcula `evoPrevPorCama` (última del episodio con
     TURNO_KEY < turnoKey) y `_entFicha` la usa como respaldo. CLAVE: `tieneEvo`
     se captura ANTES de sustituir, así el contador «sin evolución» del
     encabezado y la alerta NO cambian; viaja `heredadoDe` (turnoKey) y la
     ficha lleva franja ámbar «se muestran los datos del turno anterior
     (02-08 · Noche)» + borde ámbar (el rojo queda para la que no tiene NADA).
     El aviso es PARTE del arreglo: leer datos de hace 12 h creyéndolos de
     ahora es peor que la hoja vacía.
  3. **Diagnóstico reemplaza al COD_PACIENTE** en la tarjeta de cama (`.bdx`,
     recortado a 46 car. con el completo en el tooltip) y en la cabecera del
     panel (`#spCod`). El código SIGUE en egreso y archivados, que es donde
     cumple su función (cruce anonimizado).
  - Guardia `checks/entrega_ancha.js` (23 asserts: servicio + layout + que el
    código no desapareció del egreso).

- **v5.39 · LÍNEA DE TIEMPO COMPLETA + BANDA DE FASE (4-ago-2026, cohete
  v5.39-timeline; sin cambio de esquema).**
  1. **BUG: los procedimientos se perdían EN SILENCIO.**
     `_crearHitosDesdeProcedimientos` traducía con la lista fija PROC_TO_HITO y
     hacía `if (!map) return` — desaparecían asistencia en procedimiento
     médico, educación a usuario, evaluación intermedia, recanulación, PCR
     COVID y TODO lo que el colega agregara a mano del catálogo. Como la
     estadística cuenta filas de PROCEDIMIENTOS y la timeline contaba solo lo
     traducido, **las dos nunca cuadraban**. Ahora hay respaldo genérico
     (`_procLabelGenerico`): los conocidos conservan su nombre clínico, el
     resto entra con etiqueta legible. Regla: lo que entra a PROCEDIMIENTOS
     entra a TIMELINE — no pueden volver a discrepar ni con procedimientos
     futuros. `_SIGLAS_UNIDAD` evita destrozar RCP/COVID/NAVM al bajar de
     mayúsculas (la hoja los guarda en alta).
  2. **El riel del historial también se alimentaba de una lista propia**
     (`_tlEventosSlot`, solo eventos de vía aérea de la evolución): ahora suma
     los hitos de TIMELINE con tipo procedimiento/kine/general/nota (los
     `via_aerea` se excluyen porque ya vienen con su ícono y se duplicarían) y
     ordena por fecha.
  3. **Banda de FASE CLÍNICA** bajo el riel (`_tlBandaFase`): agrupa turnos
     consecutivos con la misma fase en tramos de ancho proporcional a su
     duración, para leer en qué fase estaba el paciente cuando ocurrió cada
     evento (p. ej. que la TQT fue en weaning). Sin fases registradas no se
     dibuja.
  - Guardia `checks/timeline_completa.js` (18 asserts, incluido un
    procedimiento inventado que nadie mapeó nunca).

- **v5.40 · VM · VNI · CNAF · DISPOSITIVOS DE APOYO (4-ago-2026, cohete
  v5.40-equipos; EXIGE `crearORepararEstructura()` — VENTILADORES con
  `CATEGORIA`).** Corrección de Diego a un supuesto mío: los 33 equipos NO son
  todos «ventiladores».
  · **VM** = soporte invasivo, parte de la sala, OCUPA la cama.
  · **VNI** (V60, **Carina**) y **CNAF** (Airvo 2) = soporte del PACIENTE
    («queda en una cama pero no vive ahí»), NO de la cama.
  · **APOYO** = «dispositivos de apoyo», nombre elegido por Diego (MR850,
    capnógrafos, Aerogen): no son soporte, acompañan.
  1. Columna `CATEGORIA` al final de VENTILADORES. Los equipos ya cargados la
     traen vacía y `_vmCategoria()` la DERIVA del modelo/nombre/obs, así el
     inventario se clasifica solo sin reescribirlo; `guardarVentilador` la
     persiste para que deje de depender de la deducción.
  2. **Arreglado el problema conocido desde la carga del inventario real**:
     `obtenerTodasLasCamas` metía TODOS los equipos de la cama en un único
     `VM_TAG` y el último pisaba a los anteriores — las camas con VM +
     V60/Airvo mostraban uno solo. Ahora solo el VM ocupa el casillero
     (`_vmEsDeCama`) y el resto viaja en `EQUIPOS_PACIENTE` con chip propio
     (`.eqtag`, punteado, uno por categoría).
  3. **REGRESIÓN CAZADA POR LA BATERÍA**: al hacer que la tarjeta cuente
     contra el reloj real (v5.37) se rompió la vista RETROSPECTIVA, que debe
     mostrar los días de la fecha que se mira. Se distingue con `c._RETRO`
     (`retro_camas.js` lo delató). El COD_PACIENTE salió de esa guardia:
     ahora asserta el diagnóstico.
  - Guardia `checks/equipos_categoria.js` (17 asserts).

- **v5.41 · DÍAS DE VNI: POR SOPORTE Y CONGELADOS (4-ago-2026, cohete
  v5.41-vni; EXIGE `crearORepararEstructura()` — EVOLUCIONES **386 columnas**
  con `DIAS_VNI`).** Reporte de Diego: «varios pacientes que precisamente no
  estuvieron con VNI» mostraban días, «y otro que sí tiene lleva menos». DOS
  defectos distintos:
  1. `_esVNIDb` decidía que había VNI mirando la **INTERFAZ** de vía aérea
     (`Full Face`/`Oronasal`) en vez del SOPORTE. Esas mascarillas también se
     usan en oxigenoterapia y CNAF ⇒ a esos pacientes se les contaban días de
     VNI, y encima desde `FECHA_INICIO_VA` (su ingreso) por el respaldo
     `FECHA_INICIO_SOPORTE||FECHA_INICIO_VA`. Ahora: `c.SOPORTE==='VNI'` y se
     cuenta solo desde el inicio del soporte.
  2. **Asimetría de fondo**: la VM tenía `DIAS_VM` calculado y CONGELADO por
     el servidor; la VNI NO tenía columna y el cliente la recalculaba
     exigiendo `c.SOPORTE==='VNI'` en ESE instante ⇒ al cambiar de soporte el
     número se caía. Columna nueva `DIAS_VNI` (al final) + cálculo en
     `guardarEvolucion` idéntico al de la VM, con el mismo congelado al salir
     de VNI. La grilla del registro lee el contador del servidor.
  - Guardia `checks/dias_vni.js` (14 asserts: mascarilla en oxigenoterapia y
    CNAF ⇒ 0, el de VNI cuenta desde el soporte y no desde el ingreso, y
    queda congelado dos turnos después de salir).
  - NO se tocó la línea equivalente de la VM (que conserva el respaldo a
    `FECHA_INICIO_VA` en el display del formulario): su valor autoritativo es
    `DIAS_VM` del servidor y no es lo reportado.

- **v5.43 · CUATRO CIERRES DE USO REAL: INGRESO NOCTURNO, PVE, EQUIPOS AL
  TRASLADAR Y AVISO DE GUARDADO (4-ago-2026, cohete v5.43-cierres; sin cambio
  de esquema).** Cuatro reportes de Diego de la misma ronda de uso real,
  todos con la misma raíz: la app usaba días de CALENDARIO donde hacía falta
  HORA real, y algunas validaciones automáticas terminaban BLOQUEANDO el
  criterio clínico en vez de solo informarlo.
  1. **Fecha de ingreso real en turno Noche** (reabre lo cerrado "sin cambio"
     en v5.42): `FECHA_INGRESO`/`TS_INGRESO` en `guardarEvolucion` (bloque de
     ingreso) ahora resuelven fecha+turno+hora con `_tsEventoTurno` (el mismo
     mecanismo del ciclo de prono, v5.33) en vez de fijar siempre la fecha del
     turno. Un ingreso de turno Noche con hora escrita <12:00 fecha al día
     SIGUIENTE, como BUDA; con hora de la tarde/noche se queda en el día del
     turno. No agrega ningún campo: usa la «Hora ingreso» que ya existía.
     Guardia nueva `checks/ingreso_noche.js` (12 asserts).
  2. **El gate de PVE informa, no bloquea**: el botón "Sí" de PVE se ocultaba/
     deshabilitaba con `DIAS_VM<1` (días de calendario) — bloqueó a una colega
     que por horas REALES sí cumplía protocolo. Ahora el botón queda SIEMPRE
     disponible; junto al bloque se informan las horas reales de VM
     (`TS_INICIO_SOPORTE` + `_horasEntreTS`, mismo mecanismo del prono) sin
     decidir por el clínico — si están bajo 24 h y de todos modos se marca
     "Sí", sigue existiendo la vía "fuera de protocolo" al declarar el tipo de
     extubación, igual que siempre. Guardia nueva `checks/pve_horas.js`.
  3. **Al trasladar un paciente, la app pregunta por sus equipos**: traslado
     (`INTERCAMBIAR_CAMAS`/`MOVER_A_CAMA_VACIA`) y movimiento de VENTILADORES
     eran dos acciones totalmente desconectadas — caso real: María Ramírez se
     trasladó de la 3 a la 7 con Airvo+V60+PB1 y nadie los movió a mano. El
     diálogo de `mover()` ahora ofrece una casilla por equipo de la cama de
     ORIGEN («¿viaja con el paciente?»): el VM invasivo parte SIN marcar
     (suele quedarse, es el de la sala), VNI/CNAF/APOYO parten MARCADOS
     (acompañan al paciente) — solo el default, se puede cambiar. Al confirmar
     se encadena `MOVER_VENTILADORES_LOTE` con los marcados. Requirió exponer
     `ID_VM` en el censo (`VM_TAG_ID` + `EQUIPOS_PACIENTE[].id` en
     `obtenerTodasLasCamas`). **BUG relacionado encontrado y corregido de
     paso**: `moverVentilador`/`moverVentiladoresLote` rechazaban CUALQUIER
     segundo equipo en una cama sin mirar la categoría — habría bloqueado
     mover el VNI/CNAF de María a la cama 7, que ya tenía su propio VM (el
     Savina). Ahora solo el VM invasivo es exclusivo por cama (`_vmEsDeCama`);
     VNI/CNAF/APOYO coexisten con él y entre sí, como ya asumía el tablero
     desde v5.40. Guardia nueva `checks/traslado_equipos.js` (con el
     escenario real de María).
  4. **Aviso de "sin guardar" reforzado**: reporte de Diego con Eduardo — el
     texto y la firma de una evolución se vieron generarse en pantalla (el
     texto vivo de v5.34 no pide botón) pero la evolución nunca quedó en
     EVOLUCIONES. `_formDirty` + el aviso al cerrar el panel + `beforeunload`
     YA existían, pero un cierre que no los dispara (equipo apagado, navegador
     cerrado a la fuerza) se los salta enteros. **Decisión tomada con Diego**:
     NO volver a un botón manual de "Generar texto" — reabriría el bug que
     v5.34 cerró (los chips no regeneraban el texto). En vez de eso: franja
     fija junto a 💾 Guardar Evolución («⚠️ Sin guardar») visible TODO el
     tiempo que el panel tiene cambios sin guardar (no solo al salir) +
     recordatorio único si pasan 10 min sin guardar. `genTexto()`/`_rtxtLive`
     intactos. Guardia nueva `checks/sin_guardar.js`.
  - De paso, arreglado un path roto en `checks/rendimiento.js` (resolvía
    relativo al directorio de ejecución en vez de al archivo — fallaba fuera
    de `build/`), sin relación con lo de arriba.

- **EL TEXTO REDACTADO A MANO SE PERDÍA AL GUARDAR (4-ago-2026).** Reporte de
  Diego: «el texto se reinicia al momento de guardar y no queda el texto
  editado a mano». REPRODUCIDO en Chromium: la culpa era del **aviso de
  desfase de v5.34** (mío). El aviso está bien pensado — compara bloque a
  bloque lo retocado contra lo registrado y «decide el colega» — pero
  `uiConfirm` es BINARIO, así que las salidas reales eran «🔄 Actualizar el
  texto y guardar» (REGENERA, borra lo escrito) o Cancelar (no guarda nada):
  **el único camino que guardaba destruía la redacción**, y el botón se leía
  como el de guardar. El colega perdía su evolución por apretar lo que parecía
  correcto.
  - Arreglo: `uiConfirm` acepta una **tercera salida opcional** (`alterno`,
    resuelve con `'alt'`; sin ese parámetro nada cambia para los ~20 diálogos
    que ya la usan). El aviso ahora ofrece **conservar** (primaria) ·
    regenerar · volver. REGLA: lo escrito a mano jamás se descarta sin que
    alguien lo elija explícitamente.
  - Guardia `checks/texto_manual.js` (21 asserts, las cuatro salidas + el
    flujo sin retoques), verificada fallando contra el index anterior.
  - LECCIÓN: un aviso que sirve para «decidir» necesita tantas salidas como
    decisiones haya. Con dos botones para tres caminos, el que falta es
    siempre el que el usuario quería.

- **EL RELOJ DEL SOPORTE ES OTRA FECHA QUE LA DE INGRESO (4-ago-2026).**
  Diego reporta que María Inelda (cama 2) muestra 3 días de VM con estadía 6.
  Reproducido con el código real: su `FECHA_INGRESO` estaba BIEN (29-jul, de
  ahí la estadía correcta) pero su `FECHA_INICIO_SOPORTE` apuntaba a su
  PRIMERA EVOLUCIÓN EN LA APP (1-ago) — `diasEntre(1-ago, 4-ago) = 3`.
  - **NO era un caso aislado**: el simulacro delató que las OCHO camas
    pre-app mostraban exactamente `VM 3` (2, 4, 6, 11, 13, 14, 16 y 17), y el
    re-sellado las devuelve a 6, 6, 8, 8, 7, 4, 11 y 10 — que es EXACTO lo
    que dice la lista oficial. Diego solo había notado dos.
  - **LECCIÓN**: que el ingreso calce con la lista oficial NO significa que el
    reloj del soporte esté bien. Son dos fechas independientes y los días de
    VM/VNI/VA cuelgan de la segunda. En la tanda anterior se dio por buena la
    cama 2 mirando solo el ingreso: ese fue el error.
  - `corregirIngresosCONFIRMAR()` re-sella las evoluciones él mismo (el
    `resellarDiasSoporte*` es el otro mecanismo, por tramos). Es idempotente:
    solo toca las filas que difieren.
  - **BUG aparte, corregido**: `_limpiarCamaInterno` nunca limpió
    `TS_INGRESO`/`TS_INICIO_VA`/`TS_INICIO_SOPORTE` (columnas de v5.19) ⇒ el
    paciente siguiente de la cama heredaba los relojes del anterior. Guardia
    `checks/cama_limpia.js`, genérica sobre el esquema: exige que TODA columna
    `FECHA_*` o `TS_*` quede vacía al liberar.
  - **BUG aparte, corregido**: la grilla del Registro Diario pintaba los días
    de soporte con `${dvm||'-'}` y en JS el 0 es FALSO ⇒ el **Día 0** (ingresa
    y se intuba el mismo día — Rosa, 4-ago) salía como raya mientras la
    estadía, dos líneas más abajo, sí mostraba 0 (usaba `!==''`). Ahora hay
    número si el soporte está vigente o alcanzó a acumular días, y la raya
    queda para quien NUNCA lo tuvo (0 ≠ no aplica). Guardia
    `checks/dia_cero.js`. PENDIENTE menor: la Hoja UCI tiene el mismo patrón
    (`n||''`) en la fila «Días de VM» — no se tocó, consultar a Diego.

- **REPORTES DE UN COLEGA SOBRE LA EVOLUCIÓN — SIN ABORDAR (6-ago-2026).**
  Diego los trae de un colega del equipo; quedan anotados, NO programados. Al
  lado de cada uno, lo que dice el código HOY (verificado, no supuesto):
  1. **«Meta PAM no se refleja en evolución»** — CONFIRMADO: `dominio_texto.gs`
     no menciona PAM ni `HEMO_META_PAM` en ninguna línea (0 apariciones). El
     dato se captura en el formulario pero jamás llega al texto.
  2. **«Decisión médica no se incluye»** — el campo NO EXISTE en el esquema
     (`grep` sin resultados en los .gs). Es funcionalidad nueva, no un bug:
     antes de programar hay que definir qué es «decisión médica» para el
     registro kinésico y si se anota como texto libre o catálogo.
  3. **«Tampoco reología»** — a REVISAR: `dominio_texto.gs:372` SÍ lee
     `RESP_SECR_REOL` y lo arma en «secreciones {reología} {carácter} en
     {cantidad}». Puede ser que el colega no lo viera porque la frase entera
     se omite cuando `qty === '-'`, o porque no llenó el campo. Reproducir
     antes de tocar nada.
  4. **«No es necesario incluir la firma al copiar al BUDA»** — la firma sale
     al final del texto («Klgo./Klga. Nombre Apellido», v3). Al pegar en BUDA
     estorba. OJO antes de sacarla: la firma en el texto fue pedida en su
     momento y es parte del registro clínico. Posible salida: un botón
     «copiar sin firma» en vez de quitarla del texto.
  5. **«¿Se calcula SaFi y no PaFi?»** — las DOS existen y son cosas
     distintas: PaFi está en el texto y en el formulario (11 usos en el
     index), SaFi vive SOLO en la matriz de categorización SOCHIMI
     (`index:11921`, `SAFI:{nombre:'Oxigenación (SAFI)'}`) porque esa matriz
     usa SpO₂/FiO₂ cuando no hay gases. No es un error: son dos usos
     distintos. Conviene explicárselo al equipo antes que cambiar código.
  6. **«El SAS no se refleja en evolución»** — a REVISAR: `dominio_texto.gs:41`
     lee `SED_SAS` y lo usa en la frase de sedación, pero SOLO en algunas
     ramas (con BNM, o «fuera de escalón»). Si el paciente está en un escalón
     normal, el número de SAS no aparece. Ahí está probablemente el reporte.
  - PENDIENTE: confirmar con el colega los casos 3 y 6 (¿en qué paciente lo
    vio?) antes de programar, y decidir con Diego los casos 1, 2 y 4.

- **OLA 1 DE MANUEL FUSIONADA A MAIN (6-ago-2026).** La alarma inicial
  («trabajó sobre la v5.22») resultó FALSA en lo que importa: sus ramas
  (`manuel/velocidad-arranque` y la definitiva
  `manuel/velocidad-y-entrega-turno`) parten del ÚLTIMO commit nuestro —
  hizo fetch antes de trabajar, como acordó. Lo del «5.22» era el contador
  de implementaciones de Google (Versión 22) Y un hallazgo suyo real: el
  index PEGADO en el proyecto de Apps Script era, por contenido, el cohete
  v5.22-cierre mientras el servidor iba en 5.43 — por eso Diego «no veía» la
  caja de sugerencias (nació en v5.28). No era código perdido: era un front
  viejo pegado. Diego repegó el 5.43 y quedó al día.
  - **Qué trae la Ola 1** (solo servidor, JAMÁS toca index.html): CONFIG y
    catálogos se leen UNA vez por petición (`_cfgTabla`/`_CAT_MEMO` con
    `_memoReset()` al entrar a `api()` — en GAS cada petición es proceso
    nuevo; el reseteo existe para el simulador); `_tz()` memorizada (está en
    el camino de CADA timestamp); el episodio de una cama se baja UNA vez por
    guardado (`_evosCama()` en guardarEvolucion, viaja como parámetro
    opcional `_evos` a obtenerEvolucionPrevia/_pronoAbiertoTS — sin él se
    comportan igual que antes); `obtenerEvoTurno` baja el episodio una vez en
    lugar de tres; retirado `_PRONO_ABIERTO_TS` de obtenerEvolucionPrevia
    (verificado: NADIE lo leía; la vía real es `pronoAbierto` de
    GET_EVO_TURNO); `patientId` viaja a `_crearHitosDesdeProcedimientos`.
    Medido por él EN PRODUCCIÓN: GET_BOOT 3.823→1.253 ms (−67%), respuesta
    idéntica antes/después. `medirArranque()` en mantenimiento.gs cronometra
    con/sin memo (orden deliberado: el SIN memo corre segundo, con caché de
    Google tibio — la comparación es conservadora).
  - Guardias suyas: `memo_config.js`, `memo_tz.js`, `memo_episodio.js`. La
    batería completa (56) pasa sobre la fusión.
  - PENDIENTE SUYO anotado en sus commits: al limpiar cama sin alta formal
    las evoluciones no se archivan y `_pronoAbiertoTS` busca por CAMA ⇒ el
    ocupante siguiente puede heredar una pronación abierta ajena («tras
    108,5 h en prono» con horas de otra persona). Es criterio clínico de
    Diego elegir la salida (archivar al limpiar vs filtrar por paciente).
  - Reglas de convivencia que SÍ funcionaron: fetch antes de trabajar, avisar
    por #mejoras-rce antes de pegar, una sola persona publica.

- **PRONO / POSICIONAMIENTO / HSA — DISEÑO EN CURSO, NO PROGRAMADO (ago-2026).**
  Nace del caso de Caterina (cama 4): María José prona a las 19:00 del 2-ago
  y en la noche Mauricio, para reflejar que seguía en prono, vuelve a tildar
  la casilla ⇒ **PRONO duplicado** en PROCEDIMIENTOS. Causa de fondo: «📐
  Posicionamiento» es un bloque **colapsable que arranca cerrado**, lejos, tras
  el examen físico — se pasa por alto, y quien lo abre tarde tilda de más.
  Mockups: `scratchpad/mockup_prono_bloqueado.html` (estado bloqueado) y
  `scratchpad/mockup_prono_ventilatorio.html` (ubicación nueva + BNM).
  - **Prono/supino se MUEVEN al inicio de Terapia ventilatoria** (donde la
    vista ya está), con bloques horarios. El turno que solo CONTINÚA no tilda
    nada: franja bloqueada «En prono desde … (X h)» + botón único «Supinar»,
    que pide la hora y cierra el ciclo. Así el procedimiento no se puede
    duplicar y los turnos intermedios narran «continúa en prono», no un evento.
  - **RAZÓN CLÍNICA (dicha por Diego, corrige un supuesto mío)**: esto se
    ordena por la **escalera terapéutica del SDRA**. **NO todo BNM lleva a
    prono** — «a veces con BNM basta» ⇒ el BNM **PREGUNTA** la posición, jamás
    la asume (mi mockup decía «con bloqueo casi siempre se prona»: FALSO, hay
    que corregir ese texto). Y **el prono SIN BNM existe pero es EXCEPCIONAL**
    (quemadura de espalda, escaras sacras gigantes) ⇒ la vía discreta y
    siempre disponible para registrarlo se queda: es la excepción, no el
    camino principal, pero sin ella se pierde registro.
  - **El resto del posicionamiento se DESARMA (decisiones cerradas por Diego,
    ago-2026)** — el bloque «📐 Posicionamiento» desaparece como tal:
    · **Cabecera en GRADOS, 30-45°** → al bloque de **PREVENCIÓN DE NAVM**
      (es parte del paquete). Reemplaza al posicionamiento como dato de NAVM.
    · **«Sedente >45°»** → NO va a NAVM: **es parte de TERAPIA FÍSICA**
      (dicho por Diego), así que se muda al bloque de rehabilitación/KTM.
    · **DCL D / DCL I** → **SE ELIMINAN las casillas**: «que lo hagan manual
      porque eso es muy puntual». Quedan para el texto libre, no como campo
      propio. Las columnas `RESP_POS_DCLD`/`RESP_POS_DCLI` NO se borran del
      esquema (romperían los registros ya guardados): solo dejan de pedirse.
  - **NUEVO · PROTOCOLO HSA EN EL BLOQUE KTM**: para diagnóstico de hemorragia
    subaracnoidea, KTM debe anexar el protocolo HSA con **inclinaciones
    progresivas de cabecera hasta la verticalización** (está en el protocolo de
    kinesioterapia motora de la unidad). FALTA que Diego mande el documento:
    sin los pasos reales (grados de cada etapa, criterios para avanzar y para
    detener — vasoespasmo, PIC, deterioro neurológico) no se puede programar.
    Ya existe infraestructura reutilizable: `#fcNeuro` (index) se muestra solo
    si el Dx contiene HSA/ACV/TEC/Meningioma/Politrauma, «Hemorragia
    subaracnoidea» ya está en el catálogo de diagnósticos y «verticalización»
    ya clasifica como procedimiento `kine` en svc_procedimientos.
  - PENDIENTE de la misma conversación: Caterina se supinó el **3-ago ~16:00**
    (⇒ 21 h en prono) y falta registrarlo; y está ofrecido correr
    `corregirPronosRepetidos()` en SIMULACRO para el duplicado de esa noche.

- **v5.42 · DÍAS DE SOPORTE POR TRAMOS: ACUMULADOS Y SIN SOLAPARSE
  (4-ago-2026, cohete v5.42-tramos; sin cambio de esquema — usa la DIAS_VNI
  de v5.41).** Hallazgo de Diego con la historia REAL de María del Carmen
  (cama 3→7: intubada 22-jul → extubación c/protocolo A VNI 23-jul →
  reintubación 25-jul → extubación ACCIDENTAL a VNI 30-jul hasta hoy): su
  estadística manual sumaba VM 8 + VNI 7 = 15 días en una estadía de 13
  («días falsos» — el día de cada transición contaba PARA LOS DOS soportes).
  Y Ricardo Flores egresó con MÁS días de VM que de estadía.
  - **REGLA DEFINITIVA**: cada TRAMO aporta `diasEntre(inicio, fin)`; el día
    de la transición pertenece al soporte SALIENTE (el turno que extuba aún
    estuvo ventilado) y es el Día 0 del entrante ⇒ los tramos consecutivos
    SUMAN EXACTO la estadía (María: VM 6 + VNI 7 = 13 ✓; al 5-ago VNI 8,
    el número que dio Diego). Una reintubación NO reinicia la cuenta.
  - `_contadorTramos` en guardarEvolucion: si el turno TIENE el soporte
    (inicial o final), valor = BASE (congelado de la última evolución del
    episodio que terminó SIN él = tramos cerrados) + días del tramo abierto
    (desde el reloj de la cama; si la transición es EN este turno, desde hoy;
    si NUNCA salió del soporte, desde la PRIMERA evolución — el reloj puede
    haberse re-estampado a mitad de tramo, p.ej. TOT→Full Face). Si NO lo
    tiene, hereda el congelado. Reemplaza a `_congelado`.
  - **Egreso**: DIAS_VM_TOTAL/DIAS_VA_TOTAL archivan el TOTAL SELLADO de la
    última evolución (los «días calendario tocados» quedan de respaldo para
    episodios sin sellar) — era lo que hacía VM > estadía en Ricardo.
  - **Grilla del registro**: lee DIAS_VM/DIAS_VNI sellados SIN sumar la
    mochila `_PREVIOS` del cliente (la duplicaría; quedó obsoleta).
  - **`resellarDiasSoporteSIMULACRO/CONFIRMAR`** en mantenimiento_manuel:
    recorre las evoluciones de cada cama ocupada en orden y re-sella los tres
    contadores por tramos (idempotente). Es lo que corrige a María, Morelia y
    Eugenia. PENDIENTE: Diego lo corre.
  - **Ingreso nocturno — CERRADO SIN CAMBIO (decisión de Diego, 5-ago)**: el
    desfase de Ricardo vs BUDA lo atribuye a la carga forzada de la marcha
    blanca, no a los ingresos reales. NO se toca FECHA_INGRESO. Caso residual
    conocido: un ingreso REAL registrado pasada la medianoche (turno Noche)
    quedará fechado con el día del turno y BUDA lo fechará al siguiente; el
    colega puede corregirlo eligiendo la fecha en el formulario de ingreso.
    Si se repite en la práctica, reabrir la conversación.
  - **Regla de la transición — CONFIRMADA por Diego (5-ago)**: el día de la
    transición pertenece al soporte SALIENTE. La planilla manual actualizaba
    días A MANO al cierre del turno de día: turnos sin actualizar ⇒ días
    perdidos, o corregidos de más. Es la clase de error que el RCE elimina
    por diseño (los días se DERIVAN de fechas y eventos registrados, nunca
    se digitan).
  - **REVERSIÓN Morelia (cama 9, 5-ago) — CORRIGE lo anterior**: la primera
    lectura de esta ronda daba por buena la fecha de ingreso 30-jul del
    listado BUDA y atribuía el "VM debería ser 3, no el 2 de la planilla" a
    un error humano de actualización manual. Diego investigó más: Morelia
    ingresó el **31-jul a las 23:00** (hora real); BUDA muestra 30-jul por
    SU PROPIO error de tipeo. Prueba: cama 8 (Alberto, ingreso ~07:00 del
    1-ago) y cama 9 llegaron con solo 8 h de diferencia real, pero con el
    30-jul de BUDA el listado las separa por 2 días de calendario en vez de
    1 — la fecha de BUDA no cuadra ni con su propio vecino de cama. Con el
    31-jul corregido (`mantenimiento_manuel.gs`, `_MTO_FECHAS` + hora real
    vía el nuevo campo `hora` por entrada), la regla de tramos da
    estadía=5 y **VM=2 (31-jul→2-ago)** — EXACTAMENTE lo que decía la
    planilla manual desde el principio. Necesitó sembrarse en
    `_MTO_SEED_TRAMOS` (mismo mecanismo de Francisca/María): sin el sembrado,
    el re-sellado ancla el tramo a la primera evolución de Morelia EN LA APP
    (1-ago) en vez de su ingreso real (31-jul), y daba VM=1 en vez de 2.
    Sección 5 de `checks/dias_soporte.js` (4 asserts nuevos).
  - Guardia `checks/dias_soporte.js` (24 asserts: la historia de María turno a
    turno, el re-sellado idempotente y el egreso de Ricardo).

  - **PENDIENTES**: capnógrafos/Aerogen aún dentro de la pestaña Ventiladores
    (Diego los quiere en su propia sección de «dispositivos de apoyo» — el
    dato ya está clasificado, falta la vista). SUGERENCIAS de los colegas SIN
    LEER (Drive MCP pide aprobación; Diego las pegará cuando se acumulen).
    Segunda tanda de corrección de fechas (camas 1, 2 y 7) pendiente de que
    Diego confirme los inicios de VM derivados: Francisca 21-jul y la señora
    trasladada de la 3 a la 7, 26-jul.

- **v5.33 · HORAS EN PRONO CON FECHA REAL + VIAJAN A LA ENTREGA (ago-2026,
  cohete v5.33-ciclo; EXIGE `crearORepararEstructura()`, EVOLUCIONES **385
  columnas**).** Pregunta de Diego sobre la v5.32: «¿supino igual tiene su hora
  asignada, para el cálculo de cuántas horas estuvo en prono?». Sí la tenía y se
  guardaba, pero el ÚNICO cálculo era un globito al pasar el cursor y estaba
  roto de tres formas: (a) contaba con el reloj del CLIC, no con la hora
  escrita; (b) el marcador era del navegador, así que si pronaba un turno y
  supinaba otro NUNCA aparecía; (c) no se guardaba en ninguna parte.
  Regla clínica que dio Diego: **una sesión de prono PUEDE durar más de 24 h**.
  1. Columnas nuevas `PRONO_INICIO_TS`, `SUPINO_TS` (ambas 'yyyy-MM-dd HH:mm')
     y `PRONO_HORAS` (decimal, al final). El servidor SELLA el momento real al
     guardar y `_pronoSellarCiclo` cierra la cuenta en la evolución que supina.
  2. **`_tsEventoTurno(fecha, turno, hora)`** en infra_fechas: resuelve la fecha
     real contra la hora ESCRITA. El turno Noche cruza la medianoche — 22:00 es
     del día del turno, 03:00 ya es del siguiente. NO sirve
     `_fechaEfectivaTurno` a secas (empuja todo al día siguiente: correcto para
     el reloj de dispositivos, incorrecto para una hora del anochecer).
     `_msDeTS` parsea a mano (no depender del parser de cada motor) y
     `_horasEntreTS` da 1 decimal; delta negativo ⇒ '' (jamás horas inventadas).
  3. **`_pronoAbiertoTS(idCama, turnoKey, _evos)`**: recorre el episodio en
     orden y deja la última pronación SIN supinación posterior. Da igual quién
     prone y quién supine, ni cuántos turnos y días pasen en medio. Viaja al
     cliente como `pronoAbierto` en GET_EVO_TURNO (también al RE-EDITAR, donde
     la supinación puede agregarse recién ahora). El tercer parámetro es el
     episodio ya leído por quien llama, para no bajar la hoja dos veces en la
     misma petición; sin él se comporta igual que siempre.
     ⚠️ Hasta ago-2026 `obtenerEvolucionPrevia` adjuntaba además un
     `_PRONO_ABIERTO_TS` transitorio (patrón `_VFON_HORAS`). **Se retiró**: no
     lo leía nadie —ni el servidor, ni el index, ni el cohete desplegado— y
     costaba una bajada completa de EVOLUCIONES por apertura de paciente.
  4. Texto (cliente y servidor a la par): «Se supina a las 07:30 hrs, **tras
     36,5 h en prono**». Los globitos ⏱ ahora dicen «Lleva X h en prono (desde
     01-08 19:00)» y «Ciclo de prono cerrado: X h», calculados igual.
  5. **Entrega de turno** (pedido explícito): la supinación lleva «· tras X h en
     prono» y el paciente que SIGUE prono trae chip propio
     `🔃 En prono 36,5 h (desde 01-08 19:00)` — chip, **no alerta**: estar en
     prono es tratamiento, no aviso, y no se inventó ningún umbral de horas.
  - 17 asserts nuevos en `checks/prono.js` (36 en total).
  - LÍMITE CONOCIDO: prono y supino son EXCLUYENTES en la posición (describen
    cómo queda el paciente), así que un ciclo que empieza y termina DENTRO del
    mismo turno no puede declararse por formulario — el servidor sí lo calcula
    si llegan ambos eventos por API. Avisado a Diego; si el equipo lo necesita,
    sale con un campo de hora de prono visible al supinar.

- **v5.32 · POSICIÓN = ESTADO, PRONACIÓN = EVENTO (ago-2026, cohete
  v5.32-prono; EXIGE `crearORepararEstructura()`, EVOLUCIONES **382
  columnas**).** Reporte de Diego: la paciente de la cama 4 se pronó UNA vez a
  las 19:00 (turno de María José) y apareció una segunda pronación en el turno
  siguiente. NO fue error de tipeo: la casilla «Prono» hacía las dos cosas —
  describir la posición y registrar el procedimiento — así que el colega que
  describía el estado sumaba una pronación inexistente. Es el mismo error de
  fondo que v4.3 corrigió en la vía aérea; el posicionamiento se había quedado
  con el diseño viejo.
  1. Columnas nuevas `RESP_PRONO_EVENTO` / `RESP_SUPINO_EVENTO` (al final) +
     casillas ámbar «Se prona/supina este turno» dentro del despliegue de la
     hora. `_autoProcs` exige **posición Y evento**; la posición sola no
     registra nada. Al desmarcar la posición se apaga el evento, y prono ⇄
     supino se excluyen con todo y evento.
  2. **BUG GRAVE encontrado de paso**: `fillForm` NUNCA restauró el bloque de
     posicionamiento ⇒ re-editar una evolución lo devolvía VACÍO y al guardar
     se **perdía la posición registrada**. Restaurados estado, evento, horas,
     texto libre y los timestamps (sin reiniciar `_pronoTs`: el reloj de horas
     en prono es del episodio, no de esta apertura del panel).
  3. **Hitos del historial**: `PROC_TO_HITO` se buscaba por texto EXACTO, así
     que `PRONO 19:00 HRS` no generaba hito y el `PRONO` pelado sí — el hito
     caía en el turno equivocado. `_procClaveHito()` recorta la hora pegada y
     los ciclos del RCP y traduce SUPINACIÓN→SUPINO.
  4. Entrega de turno: la lista de eventos usa el EVENTO (con respaldo a la
     posición para los episodios anteriores al cambio), ya no repite «🔃 Prono»
     turno a turno.
  5. **Corrección de lo ya guardado** (elegida por Diego):
     `corregirPronosRepetidos()` = SIMULACRO y
     `corregirPronosRepetidosCONFIRMAR()` = real, en `mantenimiento.gs`.
     Criterio conservador: solo saca el procedimiento cuando el turno anterior
     YA estaba en esa posición **y** el registro viene SIN hora (el que pronó
     de verdad anotó la hora). Respalda primero y si el respaldo falla CANCELA;
     limpia PROC_JSON/RESUMEN/CANTIDAD, la fila de PROCEDIMIENTOS y el hito.
     El texto clínico y la posición quedan INTACTOS.
  - Guardia `checks/prono.js` (19 asserts, servidor + formulario), verificada
    contra el index anterior (falla).
  - PENDIENTE menor: hoy la posición NO se replica al turno siguiente (cada
    colega la vuelve a marcar). Con la separación ya sería inofensivo
    replicarla, pero se dejó como está por el precedente del cuff («heredarlo
    daría por hecha una medición que nadie hizo»). Consultar a Diego si el
    equipo lo pide.

- **v5.31 · EL ANILLO DEL TUTORIAL DESPLIEGA LO PLEGADO (ago-2026, cohete
  v5.31-foco).** Reporte de Diego con captura: en el recorrido de equipos el
  anillo caía sobre un recuadro vacío. La tarjeta del 🎓 VM DE PRUEBA vive
  dentro de «📋 Tarjetas y gestión», un `<details>` que arranca PLEGADO.
  1. **TRAMPA (nueva, anotar)**: Chrome le da `getBoundingClientRect()` con
     tamaño Y `offsetParent` no nulo a lo que está dentro de un `<details>`
     cerrado (usa `content-visibility`, no `display:none`) ⇒ ni el rect ni
     `offsetParent` delataban que la tarjeta era invisible, y el `selAlt` del
     paso nunca entraba. **Para saber si algo se ve de verdad hay que
     preguntar por `closest('details:not([open])')`.**
  2. `_tutRevelar(el)` sube por los ancestros y abre los `<details>` cerrados
     antes de medir; `_tutVisible(el)` reemplaza al `!el.offsetParent` suelto.
     Vale para cualquier paso futuro, no solo este.
  3. El paso «📦 Varios de una vez» apuntaba a `#vmCola`, que solo existe con
     movimientos pendientes ⇒ su `selAlt` era `#tcV` (anillo alrededor de la
     pestaña entera). Ahora cae en la tarjeta de práctica.
  - 3 asserts nuevos en `checks/ayuda.js` (ningún paso enfoca con el bloque
    plegado, los 4 pasos caen en la tarjeta, el anillo nunca sale de la
    pantalla). Verificado que con el index anterior FALLAN.

- **v5.30 · DON MAURI EN REPOSO: SILLÓN DE DÍA, BOSTEZO DE NOCHE (ago-2026,
  cohete v5.30-reposo).** Pedido de Diego al ver v5.29: «de día descansa en la
  esquina sentado en el sofá y de noche se duerme de pie y bosteza; el resto
  altérnalo en cualquier parte del recorrido».
  1. **Dos poses estaban MAL BAUTIZADAS** al recortarlas: la que llamé
     `piensa` es en realidad un BOSTEZO y `cafe` es el hombre sentado en el
     SILLÓN con un café. Renombradas a `bosteza` y `sofa` — el nombre de la
     pose es la única documentación de qué dibujo es cuál.
  2. `mauriEstado()` (espejo de `serviEstado`) manda en el botón de la
     esquina: turno DÍA ⇒ `sofa` fijo; turno NOCHE ⇒ `duerme` ⇄ `bosteza`
     cada `MAURI_BOSTEZO_MS`=7 s. La alternancia se apaga con
     `prefers-reduced-motion` y al volver al día (`clearInterval` primero,
     así el temporizador nunca se duplica). Se re-evalúa en `mascAplicar` y
     en `refrescarVista` (junto a Servi). NO usa el temporizador de
     inactividad de Servi: Diego lo pidió por TURNO, no por inactividad.
  3. Recorrido: `MAURI_RECORRIDO=['tablet','idea','confirma']` rota por
     índice de paso; el paso final con `_tutI>0` sigue siendo `festejo`. Las
     poses de reposo NO entran al recorrido (viven en la esquina).
  4. `error` (el facepalm) tiene un uso REAL: el watchdog de los 8 s la pone
     en la mascota de la pantalla de carga cuando la app no arrancó. Va
     dentro de su propio try + `typeof mauriPose==='function'` (el watchdog
     es defensivo por diseño: no puede romperse si el resto no cargó).
  - 6 asserts nuevos en `checks/tutorial.js` (día sillón, noche dormido, el
    bostezo entra SOLO tras 7 s, vuelve a dormirse, de día no se mueve, y el
    recorrido no usa poses de reposo).

- **v5.29 · DON MAURI, LA MASCOTA KINESIÓLOGA (ago-2026, cohete v5.29-mauri).**
  Diego mandó DOS láminas dibujadas con poses de un kinesiólogo y las bautizó
  **«Don Mauri»**. Reemplaza por completo a la «persona antigua» (la mascota
  genérica que venía desde v4.9), que se ELIMINÓ del index.
  1. **8 poses recortadas** de las láminas con `scratchpad/mauri/recortar.py`
     (segmentación por componentes conexos + quita de fondo, sombra de piso y
     bolsas blancas encerradas): `tablet` (📋 mostrando información, la pose
     por defecto), `confirma` (👍), `duerme` (😴), `error` (😡), `festejo`
     (🎉), `piensa` (🤔), `idea` (💡) y `cafe` (☕ procesando).
     TRAMPA: el filtro de residuos por componente conexo (≥260 px) se comía
     el ✓ azul de la pose «confirma» ⇒ bajado a 95 px.
  2. **Formato WebP 140 px calidad 85**, no PNG: 50,0 KB las 8 poses contra
     149 KB en PNG cuantizado, y el tamaño MÁXIMO en que se muestran es
     104 px (medido) ⇒ 140 px basta y sobra. Verificado antes de incrustar
     que Chromium renderiza data-URI WebP («✅ 104x140»). Viven en el objeto
     `MAURI` del index; `mauriSrc(p)` arma el data-URI y `mauriPose(sel,p)`
     cambia la pose de un `<img>`.
  3. **Pose por contexto** en `_tutColocar`: paso final de un recorrido con
     `_tutI>0` ⇒ `festejo`; recorrido de equipos ⇒ `confirma`; paso impar del
     esencial ⇒ `idea`; el resto ⇒ `tablet`. El botón flotante va con
     `tablet` y la pantalla de carga con `cafe`.
  4. **Servi conserva 5 poses** (decisión de Diego, «dejar a las dos para ver
     cuál tiene mayor aceptación»): saludo, dormido, duda, idea y celebración.
     Se BORRARON la de la jeringa (`sg-alerta`) y la del guante. La regla CSS
     `#tutGlobo.rec-evo` dejaba a Servi sin ninguna pose al irse la jeringa:
     ahora solo apaga `sg-idea` y queda la duda.
  5. Balance de peso medido: −14,9 KB (jeringa 5,9 + persona antigua 9,0) y
     +50,0 KB de Don Mauri ⇒ index 0,88 → 0,95 MB, cohete 1.225 KB.
  - `MASC_NOMBRE='Servi U'` + `MASC_NOMBRE_P='Don Mauri'`; el saludo de la
    primera vez elige el nombre según `mascActual()`.
  - Guardia `checks/tutorial.js` actualizada (acepta `data:image/webp`, ya no
    exige la jeringa).

- **v5.28 · CENTRO DE AYUDA + VM DE PRÁCTICA (ago-2026, cohete v5.28-ayuda).**
  Reporte de Diego: el equipo «no entiende algunos movimientos» y él era el
  intermediario de todas las dudas. La mascota YA NO lanza el recorrido:
  abre un MENÚ (#ayudaMod) con 5 opciones.
  1. Recorridos: esencial · evolucionar · **Mover ventiladores y equipos**
     (nuevo, 5 pasos). Este último siembra el **🎓 VM DE PRUEBA**
     (`_tutDemoVM`): existe SOLO en el navegador (window._TUT_EQ hace que
     sobreviva a vmCargar), toda acción sobre él se SIMULA — `vmMoverOk` y
     `vmColaAplicar` interceptan id 'TUT_DEMO' y el servidor jamás recibe
     nada; vmBaja lo retira local; desaparece al recargar. Petición textual
     de Diego: «un VM de prueba para que al mover no afecte el inventario
     real».
  2. **FAQ con buscador** (AYUDA_FAQS, 9 preguntas redactadas del uso real,
     2 enlazan a recorridos). Viven en el index: se editan sin estructura.
  3. **Sugerencias**: hoja nueva SUGERENCIAS (⇒ 20 hojas, EXIGE
     `crearORepararEstructura()`), servicio en svc_turnos
     (guardar/obtener/setEstado, estados nueva/considerada/aplicada/
     descartada), API GET_SUGERENCIAS + GUARDAR_SUGERENCIA +
     SET_SUGERENCIA_ESTADO (auditadas). El colega deja la suya con firma
     del ROSTER y ve las PROPIAS con su estado; la coordinación revisa el
     listado completo en **Estadísticas** (#sugCoordBox, decisión de Diego:
     no listado abierto). Clasificada en _RESET_VACIAR.
  4. **Mascota animada: EN MEMORIA, NO HACER** (Diego: «aún no hagas nada»).
     Idea: dejar SOLO al kinesiólogo animado (flotar/parpadear/saludar);
     demo en scratchpad/mockup_centro_ayuda.html.
  - Guardia `checks/ayuda.js` (30 asserts, servicio + cliente + demo VM sin
    llamadas al servidor); `checks/tutorial.js` pasó a exigir TRES recorridos.

- **v5.27 · HOJAS DEL DÍA + HOJA PVE (ago-2026, cohete v5.27-hojas).** Mata
  el ritual diario: imprimir la «Lista de hospitalizados», RECORTAR la franja
  de cada paciente con tijera, pegarla en la hoja de registro y fechar a mano.
  1. **🖨️ Hojas del día** (barra del Registro Diario, junto a 📂): UNA hoja
     por paciente hospitalizado (2 carillas), con la franja prellenada —
     cama · edad · nombre · RUT · días (bloques 24 h) · fecha. «Lo rescatable
     de la lista» según Diego: entre cama y f. ingreso SIN ficha clínica.
     La grilla EN BLANCO (se llena a mano en el turno). Sin selector de camas
     (V1 imprime todas las ocupadas).
  2. La hoja es el **docx oficial V0.2 con protocolo weaning** convertido con
     python-docx (fusiones exactas) a plantillas `RK_PG1/RK_PG2` en el index;
     la tabla «Evaluaciones adicionales» venía ANIDADA y se rescató del
     conversor regex; la fila DAUCI perdía su etiqueta al resolver fusiones
     (reparada a mano). LibreOffice NO pudo abrir el docx («source file could
     not be loaded») — la referencia visual fue la FOTO del papel real.
  3. **🖨️ Hoja PVE** en el historial (junto a RHB y APK): fiel al PDF
     oficial (PVE 1/2/3 inicio·30 min, DOS reevaluaciones post extubación,
     logos extraídos del PDF). Prellena nombre y SOLO el RUT si existe
     (decisión de Diego).
  4. **`_imprimirVertical(clase)`**: estas hojas son verticales y el @page
     global es apaisado ⇒ se inyecta `#pgVertical` (@page portrait, gana por
     cascada) y se retira tras afterprint. Patrón reutilizable.
  5. Guardia `checks/hojas_dia.js` (25 asserts). Deuda anotada: los tics de
     los turnos en la carilla 1 quedan como zonas fusionadas (el equipo
     escribe la hora a mano igual que en el papel); Diego afinará contra la
     versión de imprenta con el piloto.

- **v5.26 · HOJA APK FIEL AL FORMATO OFICIAL (ago-2026, cohete v5.26-apk).**
  Diego mandó el PDF real (APK 1.2, 2017): «Pauta de cotejo preparación del
  paciente para ejecución de KTR» — «debe ser fiel reflejo».
  1. `apkHojaHTML(rut, nombre, cama)` + `imprimirHojaAPK()` en el index,
     patrón calcado de la Hoja RHB (#apkPrint + body.print-apk + afterprint).
     Botón **🖨️ Hoja APK** junto a 🖨️ Hoja RHB en el historial.
  2. FIEL: logos del PDF extraídos con pdfimages e incrustados (11 KB),
     título exacto, 10 columnas Fecha, las 9 actividades con texto exacto
     (5 con asterisco), nota «1= SI 0= NO o N/A». Grilla EN BLANCO.
  3. Prellenado SOLO Ficha o RUN (RUT de la cama, decisión de Diego: el RUT
     SÍ va impreso porque la hoja va a la ficha física) y Servicio (UCI).
     El NOMBRE no entra a la pauta (el formato oficial no lo trae): va en la
     línea chica de generación al pie. Sin RUT ⇒ raya para llenar a mano.
  4. Guardia `checks/hoja_apk.js` (20 asserts). El PDF original quedó en
     los uploads de la sesión; los logos extraídos en scratchpad.
  - PENDIENTE: si el piloto gusta, sumar hoja diaria y de rehabilitación al
    mismo mecanismo (la RHB YA existe desde antes: `imprimirHojaRHB`).

- **v5.25 · PANEL DE PRUEBA + ENLACE AL HISTÓRICO (ago-2026, cohete
  v5.25-panel).** Tras la auditoría pedida por Diego («busca vacíos, dame
  feedback»). Decisiones de esa ronda: histórico = **opción A** (enlace, no
  pestaña ni llamada remota); riel «no me convence tanto pero aplícalo para
  probarlo en real — esta versión no la compartiré aún» ⇒ es VERSIÓN DE
  PRUEBA para Diego; fecha para activar identidad real: «definiremos fecha»
  (pendiente); cierre por lotes + TIMELINE al histórico: propuesta aceptada,
  programar en ronda tranquila ANTES de dic-2026 (el primer cierre real es
  ene-2027 y hoy copia todo en un solo setValues).
  1. **Riel de secciones** (`#spRiel`, solo ≥1100 px; el móvil conserva su
     acordeón): índice armado de las `.fcard` visibles con ✓ verde si la
     sección tiene datos; INFORMATIVO, no agrega obligaciones. `rielRender`
     delegado en document (input/change en #kf, sobrevive a innerHTML);
     réplicas/cargas programáticas no disparan eventos ⇒ `_rielDeb()` al
     inicio de `fillFormReplica` + doble setTimeout en `abrirPanel`.
  2. **`#gFalta`** sobre la act-bar: «Falta: firma y vía aérea» EN VIVO (la
     act-bar ya era sticky — el mockup de «guardar a la vista» ya existía).
  3. **Reintento automático del guardado**: `guardar()` pasó de gs() a api()
     con retry — 1 fallo ⇒ botón «⏳ Reintentando…» + segundo intento a los
     3 s; el upsert por turno lo hace inocuo. Sesión expirada NO reintenta
     (va a mostrarLogin).
  4. **Histórico opción A**: `obtenerHistoricos()` en svc_camas (CONFIG
     HISTORICO_AAAA → URL armada del ID, sin abrir la planilla) + API
     `GET_HISTORICOS`; en el detalle del archivado sin evoluciones y con año
     cerrado aparece el banner «📚 … Abrir Histórico AAAA ↗».
  - Guardia `checks/panel_ux.js` (16 asserts: riel, gFalta, reintento con
    red que parpadea, banner solo en año cerrado).

- **v5.24 · AUDITORÍA: LECTURAS ACOTADAS + ENTREGAS_TURNO ÚNICA (ago-2026,
  sin cambio de index).** Hallazgos de la revisión completa:
  1. `repoLeerTodos` CON FILTRO ahora delega en `repoLeerFiltrado` (todas
     las columnas de filtro son texto ⇒ el valor crudo calza). Optimiza
     panel/historial/egreso/eventos sin tocar llamadores; la entrega además
     filtra por camas seleccionadas. OJO: las evoluciones YA se particionan
     al egreso (EVOLUCIONES chica, EVOLUCIONES_ARCHIVO crece) — el susto de
     «diciembre lento» era menor; los que sí crecen son historial de
     archivados e indicadores/REM (jefatura, se dejaron con lectura completa).
  2. ENTREGAS_TURNO estaba DOS veces en esquema.gs (la 2ª pisaba a la 1ª).
     Se borró la copia muerta y salió el BUG: el servicio escribía
     `ID_ENTREGA` pero la hoja real se llama `ID` ⇒ el identificador quedaba
     vacío y AUTOR_EMAIL nunca se escribía. Corregido servicio (no esquema:
     la definición vigente es la que construyó la hoja — sin reparación).
  3. La SIMULACIÓN venía sin `repoLeerFiltrado` desde v5.21 y los fallos de
     `obtenerEvosDelDia` quedaban como avisos silenciosos ⇒ sim_srv.js y
     disp_fecha.js ahora lo proveen en memoria.
  - AUDITORÍA (informe entregado): AUTH_DEV_MODE sigue TRUE (fecha por
    definir); TIMELINE nunca se limpia (va con el cierre por lotes);
    consultar el histórico = opción A; peso del index (1 MB por visita, no
    cacheable) ACEPTADO — no tocar el empaquetado base64.

- **v5.23 · ETIQUETA DE BLOQUE DEL MOTOR DE TEXTO (ago-2026, cohete
  v5.23-bloques).** Primer paso de «Mi estilo» (evolución personalizada).
  Diego anticipa pedir un análisis de las evoluciones ORIGINALES vs EDITADAS
  por colega para reconocer patrones de escritura («Mauricio saca la fase
  clínica y I:E/Pmax/Pmedia y se queda con PD, Ppl, Cest, FiO2; Eduardo casi
  no deja nada del texto generado»). Para que ese análisis sea EXACTO y no
  aproximado, hay que saber de qué bloque salió cada frase — y eso **solo
  sirve hacia adelante**, por eso se implementó ya.
  1. Columna nueva `TEXTO_BLOQUES` en EVOLUCIONES (⇒ **380 columnas**, EXIGE
     `crearORepararEstructura()`; el assert de `testEsquema` pasó a 380).
     Guarda `["enc","fase","ppres",…]` alineado **1:1 con las líneas** de
     TEXTO_AUTO. En el servidor se descarta si el re-guardado no trae
     TEXTO_AUTO (etiquetas de otra generación quedarían desalineadas).
  2. Cliente: `_B(k)` marca el bloque en curso y `_txbLista()` devuelve un
     arreglo cuyo `push` registra la etiqueta; al cerrar `genTexto` se filtran
     frases y etiquetas EN PARALELO y quedan en `window._TXB_ULT`. Bloques:
     enc · aisl · aet · fase · upot · reing · dia · sed · hdn · neuro ·
     vaCambio · va · tqt · sop · pvol · ppres · poxi · param · reintub ·
     intub · desvinc · vfon · gsa · decan · ausc · ktr · cult · inhalo · pos ·
     ktm · imt · ems · edu · evalf · pve · ext · plan · nota · firma.
     Los parámetros van en TRES bloques (volúmenes · presiones y mecánica ·
     oxigenación) justamente para poder apagar «presiones» sin perder la
     oxigenación; `param` es la línea única de VNI/CNAF/oxigenoterapia.
  3. **INVISIBLE por decisión de Diego** («no quiero generar más roce si ellos
     no lo ven»): el texto en pantalla no cambia ni una coma — verificado
     comparando `genTexto()` del index anterior vs el nuevo en 6 escenarios
     (VM controlada, PSV+PVE+extubación, VNI, CNAF, TQT con desvinculación,
     ambiente): **texto idéntico**.
  4. Guardia `checks/texto_bloques.js` (28 asserts): alineación, cero
     etiquetas vacías, cero saltos de línea internos (romperían la
     alineación), cada etiqueta corresponde a su contenido, plan≠nota y los
     tres bloques de parámetros separados.
  - **«MI ESTILO» — DISEÑO CERRADO CON DIEGO, NO PROGRAMADO** (mockup en
    `scratchpad/mockup_mi_estilo.html`). Cuando haya material (≈20-30
    evoluciones editadas por persona):
    · El clínico ve **UN BOTÓN y nada más** — jamás la pantalla de casillas
      (Diego: «no quiero complicarle más la visual»). La pantalla de casillas
      + la tabla de retención viven en **Estadísticas**, solo coordinación.
    · El botón **aparece cuando ya aprendió**, no antes. Aviso corto la
      primera vez; si el resultado no gusta, el colega edita a mano y el
      botón vuelve a aprender.
    · **El texto NACE COMPLETO** y él aprieta el botón para dejar lo que
      habitualmente deja; después edita el resto. Nunca nace podado (si el
      motor deja de narrar algo sin que lo note, se pierde registro).
    · Regla de Diego: «todo se puede modificar mientras guarde información
      fidedigna» ⇒ **fijos** solo los bloques que narran algo OCURRIDO ese
      turno (intub, reintub, tqt, ext, decan, desvinc, pve, RCP) + enc y
      firma. Todo lo demás, opcional.
    · Apagar un bloque **saca la frase, no borra el dato**: REM, indicadores,
      Hoja UCI y entrega leen columnas, no la narración.
    · **El análisis va CON NOMBRE**, el equipo está en conocimiento y su fin
      es personalizar, no evaluar (dicho por Diego, ago-2026). Corre DENTRO
      de la app: ningún texto clínico sale a APIs externas (Ley 19.628).
    · **Cada uno edita SOLO SU estilo** (Diego, ago-2026: «la evolución es
      personal»). Ni la coordinación edita el de otro; desde Estadísticas se
      VE la tabla de retención de cada uno, pero no se toca su configuración.
  - PENDIENTE menor: si la coordinación fija además un mínimo común que nadie
    pueda apagar. Por la regla anterior el default es **NO** — el único piso
    son los bloques fijos de eventos ocurridos; confirmar con Diego al
    programarlo.

- **v5.22 · CIERRE DE AÑO: TRASLADO AL HISTÓRICO + AVISO (ago-2026, cohete
  v5.22-cierre).** Sheets admite 10 M de celdas y EVOLUCIONES tiene 379
  columnas ⇒ un año lleno ≈ 5 M. En `mantenimiento.gs`:
  `archivarAnioHistorico(anio)` = SIMULACRO y
  `archivarAnioHistoricoCONFIRMAR(anio)` = traslado real a una planilla nueva
  «RCE-KINE — Histórico AAAA» (su ID queda en CONFIG.HISTORICO_AAAA; se
  reutiliza si ya existe). Respalda primero y si el respaldo falla CANCELA;
  copia, VERIFICA el conteo y recién entonces borra.
  - **REGLA DURA de Diego**: los pacientes hospitalizados NO se tocan. El
    traslado va por **EPISODIO EGRESADO** (ARCHIVO_PACIENTES.FECHA_EGRESO del
    año) y mueve su historia COMPLETA, así el que ingresó en diciembre y
    egresó en enero viaja entero en el cierre del año en que se fue.
  - Se queda en la planilla de trabajo: ARCHIVO_PACIENTES (resumen de cada
    egreso ⇒ REM, indicadores y reingresos por RUT siguen funcionando).
  - **Aviso automático**: `avisoCierreAnio()` viaja en GET_BOOT y el cliente
    muestra el banner `#cierreAviso` entre el 26-dic y febrero mientras
    queden evoluciones del año anterior sin trasladar; «Recordar en 7 días»
    lo pospone (localStorage) y `CONFIG.CIERRE_AAAA` lo apaga para siempre.
  - Guardia `checks/cierre_anio.js` (24 asserts, incluido el paciente que
    cruza el año y el hospitalizado intocable).

- **v5.21 · VELOCIDAD: PINTADO INSTANTÁNEO + LECTURA ACOTADA (ago-2026,
  cohete v5.21-veloz).** Pedido de Diego junto con volver la pantalla de
  carga a la pose que saluda (la del guante tenía los dedos transparentes;
  mandará un modelo nuevo). Medido con arnés propio (latencia simulada de
  350 ms por viaje):
  1. **Una llamada menos al arrancar**: `GET_BOOT` devuelve `ahora` (reloj del
     servidor) y `chequearReloj(ts)` ya no gasta un viaje en GET_FECHA_HOY
     (que se conserva para servidores antiguos).
  2. **Pintado instantáneo** (`_bootPintarCache`/`_bootGuardar`): el censo de
     la última carga se guarda en **sessionStorage** (NO localStorage: los
     datos clínicos se van al cerrar la pestaña, nada queda en el equipo del
     hospital) y se pinta antes de que responda el servidor, con el aviso
     `#bootAct` «actualizando…». Recargar dentro del turno: **729 → 292 ms**.
  3. **`repoLeerFiltrado`** (repo.gs): lee una sola columna para ubicar las
     filas y luego SOLO los tramos contiguos que las contienen (une huecos
     ≤25 filas; si quedan >8 tramos colapsa a un bloque). `obtenerEvosDelDia`
     lo usa: antes bajaba EVOLUCIONES entera (379 columnas × todo el
     historial) en CADA arranque — con 1.200 filas, **96% menos celdas**.
  4. Medido: navegación entre pestañas 2-34 ms (ya cacheaba por pestaña) y el
     panel de evolución usa UNA llamada combinada — ahí no había que tocar.
  5. Guardia: bloque nuevo en `checks/rendimiento.js` (sin GET_FECHA_HOY,
     caché de sesión presente, aviso oculto con datos frescos).

- **v5.20 · LOS RELOJES DE DISPOSITIVOS USAN LA FECHA EFECTIVA (ago-2026,
  cohete v5.20-disp).** Reporte de Diego: «si es noche del 31 se anota con la
  fecha del día siguiente (01), por lo que tendrían 1 día y no 2». La fecha
  efectiva (turno Noche → día siguiente) YA existía en el servidor para los
  eventos rápidos (`_fechaEfectivaTurno`), pero el FORMULARIO fechaba y
  contaba con la fecha del turno. Ahora:
  1. Cliente: `_fechaEfTurno(fecha, turno)` nuevo; lo usan
     `autoFechasDispositivos` (al fechar HME/HEPA/Trach Care y la
     humidificación activa) y `calcInsumosDias` (el «Día X/Y» de cada uno).
  2. Servidor: `obtenerEntregaTurno` pasa la fecha efectiva a `_entFicha`
     (parámetro nuevo `fechaEf`), así la alerta de recambio de la entrega
     cuenta igual que el formulario.
  3. Guardia `checks/disp_fecha.js` (13 asserts, servidor + cliente): el
     circuito instalado la noche del 31 se fecha el 1-ago y esa misma noche
     va en su día 1; la noche del 1-ago pasa a día 2 y avisa el cambio.

- **v5.19 · EL NÚMERO QUE SE VE AFUERA ES EL REAL: DÍAS POR BLOQUES DE 24 h
  (ago-2026, cohete v5.19-dias).** Reclamo de Diego el día 2 de uso: «si en
  una reunión los médicos preguntan cuántos días lleva y decimos uno, pero
  llegó hace un par de horas, no tiene concordancia con lo clínico».
  1. Columnas nuevas `TS_INGRESO`, `TS_INICIO_VA`, `TS_INICIO_SOPORTE` en
     CAMAS_ESTADO y `TS_INGRESO` en ARCHIVO_PACIENTES (⇒ EXIGE
     `crearORepararEstructura()`): guardan el **momento real**
     'yyyy-MM-dd HH:mm', APARTE de FECHA_INGRESO, que sigue siendo la fecha
     del TURNO (la noche del 31 es turno del 31 aunque el reloj marque el 1)
     — por eso el REM/estadística no se mueven.
  2. `diasBloques24(ts, fechaCal, hasta, hora)` cuenta bloques de 24 h; SIN
     ts cae al conteo por días calendario (episodios ya registrados intactos).
     Las evoluciones usan `refTurno()` (Día→15:00, Noche→03:00 del día
     siguiente): referencia determinista, re-editar NO cambia los días. El
     tablero/registro/ficha recalculan EN VIVO contra el reloj (`dias24` en
     el cliente).
  3. `_tsDesdeHora` resuelve la hora escrita a mano como la ocurrencia MÁS
     RECIENTE (anotar 02:00 a las 05:00 = hace 3 h). Campo **«Hora ingreso»**
     junto a Día Estadía (viaja como `PAC_HORA_INGRESO`), editable.
  4. TRAMPA: `_horaAhora` DEBE derivar de `ahoraTS()` — el arnés de simulación
     prohíbe `Utilities.formatDate` (reloj simulado). Y los arneses que solo
     stubean fechas necesitan cargar los helpers reales de `infra_fechas.gs`
     (bloque agregado en apache/fallas_vm/v42/via_aerea_previo).
  5. Guardia nueva `checks/dias24.js` (26 asserts, incluido el caso real del
     ingreso de las 02:00 en el turno «31·Noche»). Los pacientes ya
     ingresados SIN TS siguen contando por días calendario hasta que se les
     escriba la hora en el formulario.

- **v5.18 · EL STOCK TAMBIÉN VA A UNA CAMA + VARIOS EQUIPOS POR CASILLERO
  (ago-2026, cohete v5.18-camas).** Corrección de Diego a mi supuesto: «los
  dispositivos que tienen stock igual van a una cama definida». Sin número no
  importa CUÁL de los 10 Aerogen, sino cuántos hay en esa cama:
  1. `STOCK_EQUIPOS.ASIGNACION_JSON` (mapa cama→cantidad, al final) +
     `MOVIMIENTOS_STOCK.DESDE/HACIA` (al final) ⇒ EXIGE
     `crearORepararEstructura()`. `asignarStockACama` mueve unidades entre el
     pool disponible y cada cama (delta ±), valida ambos extremos y deja fila
     con DESDE/HACIA y DELTA 0 (el total no cambia). API `ASIGNAR_STOCK`.
     `ajustarStockEquipo` ahora RECHAZA dar de baja lo que está en camas.
  2. El casillero del tablero apila **TODOS** los equipos de la cama (antes
     `porCama` guardaba uno solo y los demás desaparecían: con el inventario
     real las camas 3, 5, 8, 10 y 12 tienen VM + V60/Airvo) y suma los chips
     de stock (`.vmz-stk`, punteados, NO arrastrables — se tocan para
     repartir). TRAMPA: `vmRender` corre antes de que llegue `GET_STOCK`, así
     que `stkCargar` repinta el tablero al recibirlo (vmRender no vuelve a
     pedir stock ⇒ sin ciclo).
  3. Las tarjetas muestran **disponibles / total**, en qué camas está y
     «🛏️ A una cama». Guardia `checks/stock.js` ampliada (53 asserts).
  - PENDIENTE de la misma conversación: el rediseño del tablero que le
    mockupeé (ficha del equipo plegada bajo el tablero + selección múltiple
    para mover varios) sigue SIN confirmar por Diego.

- **v5.17 · STOCK SIN NUMERAR (ago-2026, cohete v5.17-stock).** Aerogen Pro-X
  (10) y capnógrafos (5 Nihon Kohden en uso · 4 Dräger DE BAJA por decisión de
  Diego) NO tienen número: seguirlos uno por uno obligaría a inventar nombres
  falsos. Se llevan por **CANTIDAD** en hojas nuevas `STOCK_EQUIPOS` +
  `MOVIMIENTOS_STOCK` (⇒ EXIGE `crearORepararEstructura()`), clasificadas en
  `_RESET_VACIAR`. Servicios en svc_equipos.gs (obtener/guardar/ajustar/movs)
  + API GET_STOCK · GET_MOVS_STOCK · GUARDAR_STOCK · AJUSTAR_STOCK. UI: sección
  «🧮 Stock sin numerar» bajo el tablero de la pestaña Ventiladores, con
  ➖ Sacar / ➕ Reponer (cantidad + motivo OBLIGATORIO + detalle; el cliente y
  el servidor rechazan sacar más de lo que hay) y 📜 Historial. NO se asignan a
  camas (dato imposible de verificar sin número). `cargarInventarioInicial()`
  los siembra junto a los 33 equipos con nombre. Guardia: `checks/stock.js`
  (33 asserts, servicio + UI).

- **INVENTARIO REAL CARGABLE (ago-2026)**: `cargarInventarioInicial()` en
  `mantenimiento.gs` traspasa el libro de VM en papel del 31-07: 18 VM en
  cama (Avea 1/3, Vela 9, PB 1/2/980, Savina 1/2/4, Servo U, Mek
  4/5/6/9/10/12/15/16), 5 de bodega con nombre PROVISORIO, V60 Nº1-4,
  Airvo2 Nº1-4 (Nº1 en préstamo UTI; son los «CNAF Nº» del papel), Carina y
  MR850. Idempotente por NOMBRE; usa guardarVentilador (deja ALTA EN
  INVENTARIO en MOVIMIENTOS_VM). OJO: varias camas tienen VM+V60/Airvo a la
  vez y el tablero muestra UN chip por cama (los demás quedan en tarjetas) —
  se resolverá con el rediseño del tablero aprobado en mockup. Pendiente de
  Diego: números reales de bodega, series, inventarios, cantidad de Aerogen.

- **v5.15/v5.16 · SERVI INFLA EL GUANTE EN LA CARGA (ago-2026, cohete
  v5.16-guante — el v5.15 se re-emitió tras el reclamo «sin sombras y
  recorte al mínimo»: la limpieza definitiva conserva SOLO la pieza
  conectada más grande, que mata toda sombra suelta sin cajas de riesgo,
  y la hebra oscura pegada a la rueda se borró por coordenadas).** Pose nueva de Diego (llegó como archivo al SEGUNDO
  intento) para la pantalla de carga, con texto «Cargando unidad…» (antes
  «Cargando la unidad...»). Limpieza con DOS trampas nuevas resueltas:
  el tope de tamaño en las bolsas encerradas (100–9000 px a escala 700)
  protege el GUANTE BLANCO gigante de ser perforado, y la sombra difusa
  exigió tres pasadas (criterio gris neutro + retazos sueltos sat<25 +
  franja inferior lum>172). El botón/globos siguen con sus poses.

- **v5.14 · EXTUBAR DESDE EL INGRESO + «SI SE REGISTRÓ, QUEDÓ» (ago-2026,
  cohete v5.14-ingreso, DÍA DEL LANZAMIENTO).** Pedido de Diego: un paciente
  que llega intubado debe poder extubarse en el MISMO formulario de ingreso
  (reabrir para anotar «es roce que el equipo va a notar»).
  1. El gate del ingreso ya NO oculta extubación/decanulación/TQT — deciden
     las reglas por vía aérea, como en cualquier turno. La reintubación
     conserva su condición propia (historial de VM del episodio).
  2. BUG DE LANZAMIENTO corregido: al RE-EDITAR una evolución de ingreso, el
     cliente (cIng=false) mandaba ES_INGRESO=false y el upsert lo pisaba ⇒ el
     paciente dejaba de contar como ingreso en REM/estadística y perdía el
     hito 🏥 del historial. Ahora `guardarEvolucion` preserva la marca desde
     la fila previa (junto a la fusión de eventos ya existente). El
     procedimiento INGRESO ya sobrevivía vía PROC_JSON→PROCS.
  3. Guardias: bloque nuevo en `regresion_ui.js` (llega intubado ⇒ extubable
     desde el ingreso; llega TQT ⇒ decanulable) y Parte 1b de
     `via_aerea_previo.js` (re-edición conserva ES_INGRESO + extubación
     agregada). CONTEXTO temporal decidido el 1-ago: día de ingreso = Día 0
     (igual que el sistema del hospital, que cuenta bloques de 24 h) — regla
     que sostiene la extubación «<24 h de VM» fuera de protocolo; NO cambiar.

- **v5.13 · ENCABEZADO MÓVIL «BARRA MÍNIMA» + AVISO RETRO CORTO (ago-2026,
  cohete v5.13-movil).** Diego mandó captura: en el celular el encabezado caía
  en dos columnas chuecas con el ▶ huérfano en su propia fila. Le di 3
  maquetas (`scratchpad/mockup_movil.html`) y eligió la **opción C**:
  1. ≤740px: `.hbar` pasa a `display:contents` (sus hijos se ordenan junto al
     logo dentro de `.hdr` en flex-wrap) ⇒ fila 1 = logo 28px EN LÍNEA + marca
     + reloj + contadores; fila 2 = `.hnav` nuevo (◀ fecha ▶ + turno) a todo
     el ancho; fila 3 = buscador + 🔄 + 🤖. El turno queda SOLO con íconos
     (`.stxt` oculto; los textos «DÍA/NOCHE» ahora van en spans .stxt).
     TRAMPA: la regla móvil vive ANTES de la `.stgl` base en el CSS ⇒ usar
     `.hnav .stgl` (más especificidad) o pierde. El desktop no cambió.
  2. Aviso retrospectivo CORTO (pedido de Diego): «Estás viendo {fecha} ·
     Turno {X}» — se fue el «Vista retrospectiva — … lo que se evolucionó».
  3. Guardia: bloque HDR en `checks/movil.js` (10 asserts, incluido
     «nada se desborda de la pantalla»).

- **v5.12 · CELEBRACIÓN E IDEA EN EL TUTORIAL (ago-2026, cohete
  v5.12-fiesta).** Las dos poses que faltaban llegaron como archivo (al
  SEGUNDO intento — la trampa de siempre: pegadas al chat NO llegan los
  píxeles, hay que pedirlas como adjunto).
  1. **Celebración con confeti**: Diego la mandó con TEXTOS pegados
     («Tutorial Paso 6: Éxito» etc.) y pidió obviarlos — se borran por cajas
     (negro/gris neutro con dilatación; el confeti se protege por saturación,
     y una pasada extra mata el halo de «Completado.»). Esa pose necesitó
     además el criterio de fondo **gris neutro pálido** (lum>203, sat<16)
     porque la sombra y la neblina de las estelas dejaban parches.
  2. En el globo: `.sg-idea` y `.sg-exito` se suman a duda/alerta. Clases de
     `#tutGlobo` puestas en `_tutColocar` (tras el guard de vigencia):
     **rec-fin** = paso `fin` con `_tutI>0` (el aviso «sin pacientes» es paso
     único final y NO celebra) → confeti al cerrar AMBOS recorridos;
     **rec-idea** = esencial, paso impar, no final → duda/idea alternan.
     `tutCerrar` limpia rec-evo/rec-idea/rec-fin.
  3. Guardia: bloque POSES de `checks/tutorial.js` reescrito (8 asserts).

- **v5.11 · ASINCRONÍA P-VM (ago-2026, cohete v5.11-asinc).** Regla clínica de
  Diego: «si es asincrónico no se puede medir Ppl ni PD; AutoPEEP no es
  fidedigno». Con `sAdapt='Asincrónico'` (solo existe en ACVC/ACPC), `hAdapt()`
  inhabilita `r_ppl` y `r_autopeep` con nota ámbar explicativa; DP y Cest caen
  solos (derivan de Ppl). Al cambiar el selector A MANO se limpian los campos;
  la re-aplicación programática (réplica/carga, tras `renderParams`) inhabilita
  SIN borrar. BUG preexistente corregido de paso: `calcResp` dejaba DP/Cest
  PEGADOS al valor viejo al borrar la Ppl (ahora vuelven a '--').
  Guardia: `checks/asincronia.js`.
  PENDIENTE de esa ronda: Diego mandó DOS poses nuevas (celebración con
  confeti para el final del tutorial y «idea» con ampolleta) pero llegaron
  como vista previa, NO como archivo — pedidas de nuevo (misma trampa que
  v5.2: al tercer intento llegan como archivo). Al recibirlas: limpieza de
  `limpiar_servi2.py`, quitar los TEXTOS pegados de la de confeti (títulos
  «¡Éxito!» etc., Diego pidió obviarlos), celebración en el paso final
  (`fin:true`) de ambos recorridos y la de idea alternando en los globos.

- **v5.10 · SERVI LIMPIO + POSES POR CONTEXTO + PASO ARCHIVADOS (ago-2026,
  cohete v5.10-poses).** Reclamo de Diego: «se le sigue viendo una zona blanca
  debajo de los corrugados» y «que el brillo se elimine».
  1. **Limpieza profunda** (`scratchpad/limpiar_servi2.py`): el fondo ahora
     incluye el aura celeste pálida (se distingue de la sombra gris porque en
     el aura azul > rojo) y se vacían las **bolsas blancas ENCERRADAS** (blanco
     casi puro no conectado al borde, ≥60 px — el umbral respeta los reflejos
     chicos del dibujo). Los globos de diálogo de las poses quedan con relleno
     transparente (efecto aceptable). Cuantización 160 colores SIN dither
     (el dither inflaba el PNG al triple): 4 poses ≈ 21 KB.
  2. **Poses duda (?) y alerta (jeringa)** integradas al tutorial: el globo
     lleva las DOS incrustadas (`.sg-duda` / `.sg-alerta`) y la clase
     `rec-evo` de `#tutGlobo` (puesta en `tutAbrir`, limpiada en `tutCerrar`)
     elige: **duda en el recorrido esencial, jeringa en el de evolución**
     (también en el aviso «sin pacientes», que es del recorrido clínico).
     Botón y carga siguen con ON/OFF de siempre.
  3. **Paso 🗃️ Archivados** agregado al recorrido esencial (tab 'A', entre
     entrega y ventiladores) ⇒ **12 pasos**. Guardia `checks/tutorial.js`
     actualizada (12 pasos, paso 10 = Archivados, bloque POSES).
  - El reporte de Diego «el tutorial no incluye ventiladores/evolución/
    historial» era **index desactualizado en su deployment** (existen desde
    v5.7): verificar el sello con Ctrl+F «5.10-poses» tras pegar y «Nueva
    versión».

- En marcha blanca con DATOS DE PRUEBA; **implementación real el 1-ago-2026**
  (ahí se afina el registro con uso real). Deployment: cohete **v5.43-cierres**
  (antes v5.42-tramos, v5.41-vni, v5.40-equipos, v5.39-timeline, v5.38-entrega,
  v5.37-vivo). Exige `crearORepararEstructura()` (VENTILADORES con `CATEGORIA` +
  EVOLUCIONES 386 columnas con `DIAS_VNI` + hoja
  SUGERENCIAS ⇒ 20 hojas + CAMAS_ESTADO con `TQT_CALIBRE` + CONFIG con
  `DOCS_FOLDER`).
- **v4.7 · DOCUMENTOS DE LA UNIDAD + RESPALDO HABILITADO (jul-2026, cohete
  v4.7-docs).**
  1. **📂 Documentos**: botón en la barra del Registro Diario → modal que
     lista una carpeta de Drive («RCE-KINE — Documentos de la unidad»,
     auto-creada con subcarpetas Imprimibles y Protocolos; ID en
     `CONFIG.DOCS_FOLDER`). La app solo LISTA y enlaza (subir/quitar se hace
     en Drive); cache servidor 5 min + botón 🔄. `svc_docs.gs` + API
     `GET_DOCUMENTOS` (lectura). Guardia: `checks/docs.js`.
  2. **Respaldo automático DESBLOQUEADO**: `svc_backup.gs` ya existía
     (diario 03:00, rotación `BACKUP_MAX_DIARIOS`=30, restauración por
     copia) pero el manifiesto no traía el scope `script.scriptapp` y el
     instalador fallaba. Scope agregado a `appsscript.json` ⇒ el próximo
     pegado EXIGE RE-AUTORIZAR y correr `instalarTriggerBackup()` UNA VEZ
     desde el editor (y otra vez tras migrar de cuenta).
  3. **Tutorial anclado — APLICADO en v4.8 (jul-2026, cohete v4.8-tutorial)**:
     Diego eligió «solo el botón ❓» (SIN tarjeta de bienvenida automática).
     Botón ❓ flotante (abajo-derecha; en móvil sube sobre la barra y también
     va en la hoja «Más») + recorrido de 8 globos (`TUT_PASOS` en index) con
     anillo-foco (spotlight por box-shadow) que cambia de pestaña por paso y
     regresa a CAMAS al cerrar; ancla inexistente ⇒ globo centrado con velo.
     Solo lee la UI, no toca datos. El recorrido NO entra al formulario de
     evolución (posible 2ª parte si Diego la pide). Guardia:
     `checks/tutorial.js` (ojo: el anillo anima 0,25 s — en arneses comparar
     `style.left`, no el rect en tránsito).
- **v4.9 · MASCOTA + IDENTIDAD VISUAL (jul-2026, cohete v4.9-mascota).**
  Diego mandó un personaje propio (dos poses) y el logo del hospital en alta.
  Todas las imágenes viajan **incrustadas en base64 dentro del index** (nada
  de URLs externas: la red del hospital no siempre deja salir).
  - **La mascota reemplaza al ❓**: botón flotante SUELTO (sin círculo, con
    sombra y flotación `tutBob`; respeta `prefers-reduced-motion`), la pose
    con tablet acompaña los globos del recorrido (`#tutGlobo` pasó a flex:
    `.tg-masc` + `.tg-cont`; bajo 560 px la mascota se oculta y el texto toma
    todo el ancho) y también aparece en la pantalla de carga.
  - **Saludo de la primera vez** (`#tutHola`, decisión de Diego): burbuja
    junto a la mascota a los 1,8 s de cargar, SIN velo ni ventana (no
    interrumpe), se cierra sola a los 14 s, con la ✕ o al abrir el tutorial;
    `localStorage.rce_tut_saludo` evita que vuelva a salir.
  - **`MASC_NOMBRE`** (constante en index, vacía por defecto): al escribir un
    nombre, el saludo pasa a «Soy X y te muestro la app…». PENDIENTE: Diego
    aún no bautiza la mascota.
  - **Identidad**: logo del encabezado reemplazado por el HD (135×96, piel
    institucional) y **marca de agua** `--marca-agua` en `.tc-wrap:before`
    (opacidad .05, grayscale; .07 sin filtro en piel institucional). No se
    imprime y se oculta bajo 740 px.
  - Peso: +12 KB de imágenes (mascotas 9 KB, logo 2,7 KB, marca 8,8 KB) ⇒
    cohete 897 KB. Las imágenes que llegan con damero pintado (PNG «falso
    transparente») se limpian por saturación: `scratchpad/limpiar_logo.py`.
  - BUG CORREGIDO de v4.8: cerrar el recorrido dentro de los 120 ms del
    cambio de paso reventaba (`_tutColocar` leía `TUT_PASOS[-1]`); ahora
    descarta el posicionamiento obsoleto.
- **PAQUETE DE MIGRACIÓN (jul-2026)**: `build/paquete_migracion.js` genera el
  proyecto COMPLETO listo para pegar en un Apps Script nuevo — layout de
  producción **9 .gs** (`esquema`, `repo`, `infra` = los 6 infra_*, `dominio`
  = los 3 dominio_*, `servicios` = los 15 svc_*, `api`, `webapp`,
  `mantenimiento`, `spike`) + `index` cohete + `spike_gis` + manifiesto.
  Guardia `checks/paquete.js`: las 145 funciones del repo presentes, sin
  duplicados, todos los .gs compilan, doGet/crearORepararEstructura/
  instalarTriggerBackup/obtenerDocumentos presentes y scopes del manifiesto.
  Guía paso a paso para Diego: `scratchpad/GUIA_MIGRACION.md` (11 pasos).
  TRAMPA propia: un comentario de bloque con `infra_*/` cierra el comentario
  antes de tiempo (`*/`) y rompe el archivo.
- **v5.5 · MOVIMIENTOS DE VENTILADORES EN LOTE (ago-2026, cohete
  v5.5-lotevm).** Diego: confirmar uno por uno era lento cuando hay mantención
  y se reorganizan varios equipos.
  - Cliente: `VM_COLA` acumula movimientos («➕ A la lista» en el modal, que
    conserva «🔁 Mover ahora» para el caso simple); barra `#vmCola` fija abajo
    con los pendientes, quitar uno, vaciar y «✅ Aplicar todos». Re-agregar el
    mismo equipo ACTUALIZA su destino en vez de duplicarlo.
  - Servidor `moverVentiladoresLote` + API `MOVER_VENTILADORES_LOTE`: **TODO O
    NADA**, valida el lote completo antes de escribir (equipo existe/activo,
    destino válido, detalle obligatorio en CAMA/PRÉSTAMO, sin repetidos) y el
    choque de camas lo evalúa sobre el **estado FINAL** — por eso el lote
    permite **INTERCAMBIAR ventiladores entre camas**, imposible de a uno
    (obligaba a pasar por pasillo/bodega y ensuciaba el libro con 3 registros).
    Cada movimiento sigue dejando su fila en MOVIMIENTOS_VM.
  - Guardia: `checks/vm_lote.js` (servicio con repo simulado: lote válido,
    intercambio, 7 casos de rechazo verificando que NO se movió nada; + UI).
- **v5.4 · ENCABEZADO COMPACTO, PIEL ÚNICA Y MOVER A CAMA VACÍA (ago-2026,
  cohete v5.4-compacto).**
  1. **BUG CORREGIDO — mover un paciente a una cama VACÍA era imposible**: la
     tarjeta libre solo ofrecía «+ Ingresar Paciente», así que tras tocar ⇄ no
     había dónde completar el movimiento (el cliente ya sabía elegir entre
     `INTERCAMBIAR_CAMAS` y `MOVER_A_CAMA_VACIA`; faltaba el botón). Ahora,
     con un movimiento en curso, CADA tarjeta ofrece su acción: origen =
     «✕ Cancelar», libre = «🛏️ Mover aquí», ocupada = «⇄ Intercambiar».
     Lenguaje unificado a «mover paciente» (para el equipo no son dos cosas
     distintas). Guardia: `checks/mover_camas.js`.
  2. **Encabezado en UNA sola franja** (~65 px, antes dos filas): logo a la
     izquierda ocupando el alto (46-50 px) y a continuación reloj, camas,
     fecha, turno, buscador y acciones. `.hdr` pasó a `flex-nowrap` con la
     `.hbar` desplazable; bajo 900 px vuelve a envolver.
  3. **PIEL ÚNICA — Notion RETIRADA de la app** (pedido de Diego): `data-piel`
     se fija en `'inst'`, se eliminaron `pielToggle`, el botón 🎨 y la entrada
     de la hoja «Más». El CSS de la piel Notion sigue en el index como base de
     tokens: para volver a ofrecer las dos basta reponer el alternador y leer
     `localStorage.RCE_PIEL`. Guardia `checks/piel.js` reescrita.
- **v5.3 · MASCOTA SELECCIONABLE + IDENTIDAD MÁS PRESENTE (ago-2026, cohete
  v5.3-mascota).** Pedido de Diego: «es 1 o la otra», con **Servi por
  defecto**.
  - `html[data-masc]` («servi» | «persona») decide cuál se ve; se guarda en
    `localStorage.rce_mascota` y se aplica ANTES del primer pintado (en
    `window.onload`, para que no parpadee). Las dos viven dentro de `#tutBtn`
    (clases `.masc-servi` / `.masc-persona`), y lo mismo en el globo del
    recorrido y en la pantalla de carga. Servi va quieto; la persona flota.
  - Se cambia con el botón **🤖/🧑** de la barra (junto a 🎨, ambos en una
    fila) o desde la hoja «Más» del móvil.
  - **Marca de agua PROTAGÓNICA**: `.tc-wrap:before` pasó a `position:fixed`
    centrada en pantalla (`min(760px,64vw)`), opacidad .06 (.09 en piel
    institucional). Antes iba chica y pegada a la derecha.
  - **Logo** del encabezado 34 → **50 px** (38 en móvil); **reloj** a 1,22rem
    en blanco y **fecha** a .98rem/38 px de alto.
  - Guardia: bloque v5.3 en `checks/tutorial.js` (incluye identidad visual).
- **v5.2 · SERVI + FIJACIÓN DEL TOT LIBRE (ago-2026, cohete v5.2-servi).**
  1. **Servi U, el ventilador de la unidad**: segunda mascota. En v5.6 el SVG
     dibujado se reemplazó por **las ilustraciones de Diego** (llegaron al
     tercer intento, como archivo): dos poses PNG incrustadas en base64
     (~10 KB), SIN retocar — él pidió dejar la marca del equipo tal cual y
     llamarla **«Servi U»** (`MASC_NOMBRE`). Quedan sin usar dos poses más
     (duda y alerta) por si se necesitan. Va
     **QUIETO** (sin `tutBob`) a la izquierda del botón de la mascota, con dos
     poses: `#serviOn` (despierto) y `#serviOff` (dormido, con zZZ). **Duerme
     en turno NOCHE y tras 4 min sin actividad** (`serviEstado`, re-evaluado en
     `refrescarVista`); se oculta bajo 420 px. Sin marcas comerciales: dice
     «Servi» en vez de Servo-u y no lleva MAQUET (decisión de Diego).
  2. **La FIJACIÓN del TOT ya no se congela**: `_lockTOT` bloquea solo
     `fTOTn` (otro calibre = tubo nuevo = procedimiento); `fTOTcm` queda
     SIEMPRE editable porque el tubo se reposiciona en cualquier turno.
     Deshacer «cambio de tubo» restaura solo el número, no la fijación.
     `fillCama` ahora también bloquea el calibre heredado de la cama (antes
     quedaba editable sin declarar el cambio). Guardia: bloque v5.2 en
     `checks/via_aerea_previo.js` y de Servi en `checks/tutorial.js`.
  - CERRADO: el reporte de «no se puede intubar desde el ingreso» era un error
    de uso — el flujo funciona (confirmado por Diego, ago-2026).
- **v5.1 · LA TQT SE DECIDE ANTES DE LA TERAPIA VENTILATORIA (ago-2026,
  cohete v5.1-tqt).** Pedido de Diego: el día de la TQT había que llenar los
  parámetros DOS veces (el módulo de arriba y el «Queda con»). Ahora el bloque
  🔪 Traqueostomía va **primero** dentro de la sección y, al marcar «Ocurrió
  TQT este turno», `_gateVentPorTqt()` oculta `#dVentBloque` (encabezado con
  soporte/modo + `paramsBox`) y deja un aviso de dónde quedó registrada la
  ventilación. Lo replicado del turno anterior NO se borra: se guarda como
  estado previo, solo deja de pedirse (coherente con el texto de v4.6, que ya
  omitía el previo en la TQT). El gate se re-evalúa en `updateVAUI` y en
  `fillForm`, y si la vía aérea deja de admitir TQT el módulo reaparece
  aunque el check siga marcado. Guardia: bloque v5.1 en
  `checks/via_aerea_previo.js`.
- **RESETEO PARA EL INICIO REAL — v5.0 (ago-2026, cohete v5.0-reinicio).**
  Diego DESCARTÓ migrar de cuenta: se queda en su planilla y la deja en cero.
  `mantenimiento.gs` trae dos funciones, a propósito separadas:
  `resetearBaseDeDatos()` = SIMULACRO (informa filas por hoja, no toca nada) y
  `resetearBaseDeDatosCONFIRMAR()` = borrado real. El borrado **respalda
  primero** (`backupDiario`) y si el respaldo falla CANCELA (todo o nada);
  al final limpia caché, re-siembra camas libres y deja constancia en
  AUDIT_LOG (`RESETEO_INICIAL`).
  - VACÍA (`_RESET_VACIAR`): EVOLUCIONES, EVOLUCIONES_ARCHIVO, PROCEDIMIENTOS,
    TIMELINE, ENTREGAS_TURNO, ARCHIVO_PACIENTES, REINTUBACIONES, **VENTILADORES**
    (decisión de Diego: carga el stock real), MOVIMIENTOS_VM, FALLAS_VM,
    ESTADISTICAS_REM, TURNOS, AUDIT_LOG, IMPORTAR.
  - CONSERVA (`_RESET_CONSERVAR`): CONFIG, CATALOGOS, CAT_MATRICES,
    KINESIOLOGOS, INDICADORES_HISTORICO (serie de Manuel).
  - Guardia `checks/reset.js`: el simulacro no toca nada, sin respaldo no
    borra, encabezados intactos, idempotente y **toda hoja del esquema
    clasificada** (si se agrega una hoja nueva y no se clasifica, falla).
  - OJO: el esquema define `ENTREGAS_TURNO` DOS VECES (líneas ~304 y ~375);
    la segunda pisa a la primera. Revisar cuál es la buena antes de tocarla.
- **MIGRACIÓN AL CORREO DE KINESIOLOGÍA — DESCARTADA (ago-2026)**: Diego
  decidió quedarse en su cuenta. El paquete y la guía siguen sirviendo si
  algún día se retoma.
- **(histórico) MIGRACIÓN AL CORREO DE KINESIOLOGÍA**:
  hacerla JUNTO con la limpieza pre-1-ago (sin datos que migrar): desde la
  cuenta de la unidad crear planilla nueva → Apps Script → pegar los 9
  archivos + manifiesto → `crearORepararEstructura()` → autorizar →
  implementar como app web (nueva URL /exec para el equipo) → cargar
  ventiladores reales → `instalarTriggerBackup()`. Las carpetas de Drive
  (respaldos, documentos, fotos de fallas) se auto-crean bajo la cuenta
  nueva. La implementación vieja de Diego no se traslada: se avisa la URL
  nueva.
- **ANTES DEL 1-AGO (pedido de Diego, jul-2026)**: (1) LIMPIAR todos los
  archivados y los pacientes actuales — son datos INVENTADOS de la marcha
  blanca; el período de prueba real parte de cero. (2) Ordenar la hoja
  VENTILADORES dejando SOLO los equipos que realmente existen en la unidad.
  (3) Evaluar un TUTORIAL anclado a la página principal (idea aprobada en
  concepto; proponer mockup antes de código).
- **Réplicas por turno** (reglas ganadas a punta de bugs, jul-2026):
  los PROCEDIMIENTOS son del turno — la réplica parte SIEMPRE con la lista
  manual vacía (el PROC_JSON guardado une manuales+automáticos; arrastrarlo
  duplicaba INGRESO/IMT y sumaba doble en estadística). TERAPIA FÍSICA
  (KTM/IMT/EMS) se replica **DÍA→DÍA**: de noche el bloque va oculto por el
  gate y parte LIMPIO (si replicara se guardaban sesiones IMT fantasma que
  nadie ve); el servidor adjunta `_PREVIA_DIA` en obtenerEvolucionPrevia y
  el cliente usa esa fila para el bloque (`_tf` en fillFormReplica).
  Guardias: BUG 4 y BUG 5 en `checks/regresion_ui.js`.
  MEJORA EVENTUAL (pedir confirmación a Diego si surge la necesidad):
  permitir anotar IMT/EMS nocturno — hoy es «jamás», pero él anticipa que
  podría necesitarse; sería mostrar el bloque de noche desmarcado.
- **Eventos rápidos + reloj de dispositivos** (jul-2026): botón ➕ en la
  fila del Registro Diario y en la tarjeta de cama abre un popover (estilo
  lista de Sheets) para anotar DESPUÉS de evolucionar: procedimiento del
  catálogo (exige evolución guardada; suma a PROC_JSON y PROCEDIMIENTOS
  como `TIPO_PROC:'anexo'`), cambio de HME/HEPA/sonda (resetea el reloj
  con la FECHA EFECTIVA: turno Noche fecha al día siguiente), resultado de
  cultivo (sin sugerir aislamiento) y otro. Nada toca el TEXTO: va a
  timeline + estadística. Cualquier colega firma (select del roster).
  Reloj: parte al conectar VM con `DISP_CONFIRMADO=false`; franja «✓
  Aceptar» en el panel corrobora (o se ajustan las fechas y se guarda).
  `svc_eventos.gs` (API `ANEXAR_EVENTO`/`CONFIRMAR_DISPOSITIVOS`) +
  guardias `checks/eventos.js` (servicio) y `checks/eventos_ui.js` (UI).
- **Firma en texto clínico** (jul-2026): «Klgo./Klga. Nombre Apellido» —
  cliente `Turnos.firmaTexto()` (ROSTER con campo `t`), servidor
  `_firmaTextoClinico()` (hoja KINESIOLOGOS, columna TRATAMIENTO nueva;
  llenar «Klga.» para las colegas tras reparar estructura).
- **Estadísticas**: centinelas protagonistas — `indBox` al tope de la
  pestaña, desplegado y auto-calculado (año en curso) al entrar; REM y
  auditoría quedan como secundarios (son para jefatura).
- **Cuff y presión transtraqueal** (jul-2026): el cuff se verifica **1 vez
  por turno** (protocolo de la unidad) con chips de UN TOQUE
  (`✓ En rango · ⚠ Ajusté · ○ Desinflado`) que solo aparecen con VA
  artificial; el número se pide SOLO al ajustar (Diego: «que no agregue más
  roce a evolucionar»). No se replica: heredarlo daría por hecha una
  medición que nadie hizo. Columnas `VENT_CUFF_EST`/`VENT_CUFF_CMH2O`;
  rango en CONFIG (`CUFF_MIN`/`CUFF_MAX`, IDSA 20-30). Indicador nuevo en el
  tablero: adherencia = verificados/turnos con VA artificial (los
  «desinflado» salen del denominador: con válvula de fonación no
  corresponde medir). **`EVAL_T_PMANT_VA` NO es cuff**: es la presión
  transtraqueal con válvula de fonación (permeabilidad de vía aérea /
  cánula sobredimensionada); semáforo con cortes `PTT_OK`=10 y
  `PTT_ALERTA`=12 en CONFIG — Diego los revisará contra el protocolo de la
  unidad (literatura: ≤10 permeable; 86% de tolerancia con ≤9, 93% con ≤5).
- **REM 28**: `svc_rem.gs` agrega los totales; falta el formulario oficial
  de estadística (Diego lo enviará) para mapear la salida celda a celda.
- **Motor de texto**: `TEXTO_AUTO` vs `TEXTO_MANUAL` se guardan por turno;
  tras semanas de uso, comparar y refinar el motor con los patrones de
  edición reales.
- **Versión móvil**: LISTA (jul-2026): barra inferior + hoja «Más», acordeón
  en evolución, web instalable; guardia `checks/movil.js`. Pulir con feedback
  de uso real del equipo.
- **Tablero de indicadores centinela** (jul-2026): en Estadísticas; fracaso
  de extubación ≤48 h (precoz <24 h / tardío 24-48 h, meta <20%),
  autoextubaciones/100 días-VM (1-2), fuera de protocolo (<25%) con motivos
  por turno, PVE/100 pac-día, mediana VM pre-TQT, reingresos por RUT,
  mortalidad SIN ajuste (el ajuste por APACHE II se hace fuera, cruzado por
  RUT, anonimizado). `svc_indicadores.gs` + guardia `checks/indicadores.js`.
- **APACHE II — CERRADO (jul-2026, cohete v4.1-apache).** Decisión de Diego:
  «lo robaremos de la evolución médica; agrégalo al egreso como opción si no
  se pudo anotar antes». Campo opcional 0-71 junto a Charlson (datos del
  paciente); viaja TRANSITORIO como PAC_APACHE2 (patrón PAC_RUT — NO es
  columna de EVOLUCIONES) y persiste en CAMAS_ESTADO.APACHE2 →
  ARCHIVO_PACIENTES.APACHE2 al egresar. El egreso lo ofrece SOLO si está
  vacío (si existe, lo informa); el valor de la cama manda sobre el tardío.
  `_apacheNorm` en svc_camas: entero 0-71 o vacío (inválido → vacío, jamás
  basura). Exigió `crearORepararEstructura()`. Guardia: `checks/apache.js`.
- **PAQUETE v4.2 — APLICADO (jul-2026, cohete v4.2-clinico).** Decisiones de
  Diego sobre los hallazgos de la simulación (EVOLUCIONES pasa a **328 col**;
  exige `crearORepararEstructura()`). Guardia: `checks/v42.js`.
  1. A1 CORREGIDO: `DIAS_VM_TOTAL`/`DIAS_VA_TOTAL` del archivo se DERIVAN de las
     evoluciones del episodio (días calendario distintos con VM / con TOT-TQT);
     el contador del censo solo gana si es mayor (egresa ventilado).
  2. A3 CORREGIDO: `EXTUBACION_OK`/`REINTUBACION` se derivan del episodio
     (extubación programada sin reintubación / alguna reintubación). El egreso
     puede forzarlos si los envía.
  3. **A2 — «sin condiciones de PVE» JAMÁS es extubación** (regla dura): salió
     de los tipos de extubación y ahora es «no se realizó PVE» **con razón
     obligatoria de catálogo** (`PVE_SC_RAZON` + `PVE_SC_DET`). La extubación
     sin PVE se declara aparte (`cExtSinPve`) y solo entonces se elige tipo
     (sin protocolo / autoextubación / accidental). Indicadores: `sin_condiciones`
     se ignora siempre; una extubación con <24 h de VM se registra como «sin
     protocolo» con motivo «≤ 24 h de VM». **AVISAR A MANUEL**: su serie
     histórica contaba `sin_condiciones` como programada — hay que recalcular.
  4. A4 SIN CAMBIO (decisión de Diego): PVE superada ⇒ extubación automática.
  5. Módulo «TERAPIA FÍSICA» renombrado a **REHABILITACIÓN**; dentro, uso de
     **válvula de fonación** (minutos + tolerancia + observación, gate TQT →
     `VFON_*`). Además es MODO ventilatorio de TQT en Oxigenoterapia **y en
     Ambiente** (TQT ahora admite soporte Ambiente). Tubo T/HME aceptan FiO2.
  6. **GSA** opcional (casilla que despliega, patrón SmartEvo): pH, PaO2, PaCO2,
     HCO3, EB, lactato, SaO2, FiO2 + hora; interpreta el trastorno ácido-base y
     calcula PaFi (rellena `r_pafi` si está vacío). No se replica.
  7. **DESVINCULACIÓN de VM (TQT)** en Terapia ventilatoria, después de la
     terapia: hora + a qué queda + motivo, casilla de reconexión con hora y
     **delta de horas** (cruza medianoche). Genera hito `DESVINCULACIÓN`, va a
     la entrega de turno, a la Hoja UCI y a indicadores (`desvinculaciones`,
     `desvincReconexiones`, `desvincHorasTotal`, `desvincMedianaHoras`).
     Anulable como evento (`desvinc`).
  Trampa reconfirmada: `fPVEval` es hidden ⇒ `form.reset()` NO lo limpia (lo
  limpia abrirPanel); en arneses hay que vaciarlo antes de togglear.
- **v4.3 · ESTADO PREVIO → EVENTO → ESTADO POSTERIOR (jul-2026, cohete
  v4.3-viaaerea).** REGLA CLÍNICA DURA pedida por Diego: un procedimiento que
  cambia la vía aérea **jamás pisa la Terapia ventilatoria de arriba** —
  describir cómo estaba el paciente para ser intubado es parte esencial del
  registro. El bloque superior queda como PREVIO y el evento despliega su
  propio panel «Queda con» (VA + soporte + modo + N° tubo/fijación +
  VT/FR/PEEP/FiO2/SpO2 + hora). Aplica a INTUBACIÓN y TQT (extubación y
  decanulación ya lo tenían con «Soporte PE» / «Queda con»).
  - `hIntub()` YA NO cambia `fVA`/`fSop` (antes sí: era el error).
  - El **soporte previo se deduce** (`_sopPrevioAuto`): VNI / CNAF /
    Naricera-NRC / Ambiente. `fIntubSopPrevio` pasó a hidden.
  - Columnas nuevas (EVOLUCIONES **343**): `INTUB_VA_PREVIA`,
    `INTUB_MODO_PREVIO`, `INTUB_VA_POST`, `INTUB_SOP_POST`, `INTUB_MODO_POST`,
    `INTUB_TOT_N/CM`, `INTUB_VT/FR/PEEP/FIO2/SPO2`, `TQT_SOP_POST`,
    `TQT_MODO_POST`, `TQT_PARAMS`.
  - **C1 CERRADO**: `_syncCamaDesdeEvolucion` sincroniza la cama con el estado
    FINAL (vía aérea, soporte, modo, N° de tubo y fechas de inicio), y
    `DIAS_VM`/`DIAS_VA` del turno se calculan con el final (un turno que
    intuba cuenta como día de VM). Indicadores idem (`VENT_SOPORTE_FINAL`).
  - Texto en orden clínico: cómo estaba → «Previo en VNI, paciente requiere
    intubación orotraqueal a las 02:10 hrs…» → «Queda con TOT N° 8.0 fijado a
    22 cm, conectado a VM en modo ACVC. Vt 400 ml…».
  - `_lcIni` (cliente y servidor) baja SOLO la inicial y **respeta siglas**
    (VNI, CNAF, NRC no se convierten en «vNI»).
  - Guardia: `checks/via_aerea_previo.js`; BUG 6 de `regresion_ui.js`
    actualizado a la regla nueva.
- **v4.4 · MÓDULO COMPLETO EN EL EVENTO + EVENTOS NO DERIVABLES (jul-2026,
  cohete v4.4-modulo).** EVOLUCIONES **359 columnas**.
  1. El panel «Queda con» de la intubación despliega el **módulo ventilatorio
     COMPLETO** (Ppl, Pmedia, AutoPEEP, flujo, Ti, PaFi + derivados vol.min,
     I:E, DP, Cest, ml/kg). `renderParams(o)` y `calcResp(el)` quedaron
     PARAMETRIZADOS por prefijo: bloque del turno `r_`/`l_`, panel posterior
     `pi_`/`pl_` (el prefijo se deduce del input que dispara el cálculo).
     Columnas `INTUB_PMAX/PPL/PMEDIA/AUTOPEEP/PS/PINSP/FLUJO/TI/PAFI`.
  2. **Los dispositivos reaparecen** al quedar en VM: `_gateDispositivos()`
     mira el estado FINAL. TRAMPA PAGADA: refrescar el gate llamando a
     `renderParams()` completo BORRABA los parámetros previos de arriba (el
     innerHTML se reconstruye) — por eso el gate vive en su propia función.
  3. **FilmArray** sumado a las técnicas de cultivo (`name="mtest"`).
  4. **Procedimientos no derivables** = casillas de un toque: traslado a
     imagenología, traslado a pabellón, asistencia en procedimiento médico y
     **RCP con n° de ciclos + hora + detalle** (`PROC_IMAGEN`, `PROC_PABELLON`,
     `PROC_ASIST_MED`, `PROC_RCP`, `PROC_RCP_CICLOS/HORA/DET`). Son eventos del
     día: NO se arrastran. El RCP va al texto, al timeline y **a la entrega de
     turno** (también pabellón e imagenología). EMS y educación al usuario
     SALIERON de la lista manual: ya se derivan de sus casillas
     (`cEMS`, `cEduReal` → «EDUCACIÓN A USUARIO/FAMILIA»).
  Guardia: `checks/via_aerea_previo.js` (extendida).
- **v4.5 · MÓDULO COMPLETO EN TODAS LAS TRANSICIONES (jul-2026, cohete
  v4.5-transiciones).** EVOLUCIONES **379 columnas**.
  - **Reintubación**: los 3 juegos de campos en texto libre (sufijos N1/N2/T)
    se reemplazaron por UN panel «Queda con» (`dReintubQueda`, prefijo `pr_`)
    que se **mueve por DOM** a la rama activa (`_panelReintub(destinoId)`).
    Columnas `REINTUB_SOP_POST` + VT/FR/PEEP/FIO2/SPO2/PMAX/PPL/AUTOPEEP/PS/PAFI.
  - **TQT**: el campo de parámetros en texto libre pasó a módulo completo
    (`pt_`), con columnas TQT_VT/FR/PEEP/FIO2/SPO2/PMAX/PPL/PS/PAFI, y el texto
    narra «Queda conectado a VM en modo …» (cliente y servidor).
  - `renderParams(o)` conoce los 3 paneles posteriores por prefijo
    (`pi_`/`pr_`/`pt_`); `calcResp(el)` deduce el suyo del input.
  - `_paramsTxt(P,L)` arma el resumen legible (incluye derivados) y lo usan
    intubación, reintubación y TQT.
  - BUG DE TEXTO CORREGIDO: `_vmReintTxt()` describía el equipo de la
    reintubación leyendo los parámetros de ARRIBA (estado previo) y quedaba
    DUPLICADO con el panel nuevo → función eliminada.
  - Orden clínico en el texto: la reintubación también se narra DESPUÉS del
    bloque ventilatorio (como la intubación).
  - Extubación y decanulación conservan sus paneles (post no invasivo, ya
    tenían parámetros por modo).
  - `TEXTOS_MUESTRARIO.md`: los 26 textos de la simulación, para revisión.
- **v4.6 · NARRATIVA DE TRANSICIONES + PULIDOS (jul-2026, cohete
  v4.6-narrativa).** Decisiones de Diego tras revisar los textos:
  - **TQT es evento, no estado** (`cTqtO`/`TQT_OCURRIO`): con la VA en TOT se
    muestra `dTqtSec`; el panel «Queda con» suma cánula (`poTqtN`/`poTqtTipo`).
    El texto OMITE el estado ventilatorio previo (a diferencia de
    intubación/extubación/decanulación, donde el previo importa): «Tras N días
    de VM, se realiza traqueostomía … con cánula N° X …, queda en VM/HME».
    TRAMPA: `_podarEventosPayload` consideraba activo el evento TQT solo con
    `fVA==='TQT'` — con la regla del previo la VA sigue en TOT y podaba
    `TQT_OCURRIO` (el indicador de TQT daba 0). Corregido: TOT o TQT.
  - **Decanulación con racha de válvula**: `_VFON_HORAS` transitorio (12 h por
    turno consecutivo con válvula de fonación; servidor lo adjunta en
    `obtenerEvolucionPrevia` y lo recalcula al guardar con `DECAN_OCURRIO`;
    cliente `window._vfonHoras`). Texto: «Cumple ~X h con válvula de fonación,
    por lo que se realiza decanulación…» («registra tolerancia por turnos»).
  - **UMA negativa registrable**: opción `(-)` («sin uso de musculaturas
    accesorias, evaluado») — distinta de no registrado.
  - **Sin preselecciones**: `fTOTn`/`fTQTn` parten en «--» y `fTOTcm` en
    placeholder (antes 8.0/22 preseleccionados = D3). Para que la réplica no
    quede vacía, `fillCama` baja el tubo/cánula VIGENTE de la cama
    (`TOT_NUMERO`/`TOT_CM_LABIO`/`TQT_CALIBRE`/`TQT_TIPO`); columna nueva
    `TQT_CALIBRE` en CAMAS_ESTADO (al final) sincronizada desde
    `VENT_TQT_CALIBRE`. `EVAL_FECHA` usa la fecha del turno (D4).
  - **Pulidos de redacción** (cliente y servidor a la par): «fallido por …»
    (antes «desde lo»), razones de KTM narradas natural («por ingreso
    reciente», «por falta de equipo o tiempo disponible»), espacio en
    «GCS X (O:…», cláusula de no-PVE al FINAL de la frase de VMI, «Parámetros:»
    en vez de «TV:», KTM sin «nivel ?», PaFiO2 en ASCII en el texto del cliente
    (la guardia v42 asserta la grafía).
- **SIMULACIÓN E2E (jul-2026)** — arnés `build/sim/`: cliente real (index en
  Chromium) + servidor real (.gs en Node, hojas en memoria, reloj simulado
  `SIM.fecha`); `node build/sim/sim_e2e.js` corre 8 pacientes ingreso→egreso.
  Hallazgos en `INFORME_SIMULACION.md` (13, PENDIENTES DE DECISIÓN de Diego);
  los graves: DIAS_VM_TOTAL/DIAS_VA_TOTAL=0 en ARCHIVO si no egresa ventilado
  (A1), doble semántica de `sin_condiciones` formulario vs indicadores/Manuel
  (A2), EXTUBACION_OK/REINTUBACION del archivo siempre false (A3), PVE
  superada fuerza extubación (A4), modo «Válvula de fonación» inexistente
  (B1), Tubo T/HME sin FiO2 (B2), la cama no refleja el estado *_FINAL tras
  extubar/decanular (C1), TOT 8.0/22 preseleccionados (D3), EVAL_FECHA en UTC
  real (D4). **A1, A2, A3, B1, B2 y B3 ya CORREGIDOS en v4.2**; quedan
  PENDIENTES: D1-D5 (pulidos de texto y formulario) y A4 cerrado sin cambio.
  **C1 CERRADO en v4.3** junto con la regla de estado previo → posterior.
- **PAQUETE v4 — APLICADO (jul-2026, cohete v4.0-paquete).** Lo que quedó:
  1. BUG ingreso Natural→IOT mismo turno CORREGIDO: el gate del ingreso ya
     no oculta `dIntubSec` (solo reintub/ext/decan/tqt); texto cliente con
     «Previo en …» (paridad con servidor); `_autoProcs` registra INGRESO +
     INTUBACIÓN. Guardia: BUG 6 en `checks/regresion_ui.js` (ojo: el arnés
     arrastra contadores VM entre tests — resetear `_vmHistFlag` etc.).
  2. HISTORIAL: pestañas **Resumen (inicial) → Hoja UCI**; Seguimiento
     eliminado de la vista pero su diseño vive en `tlImprimir()` (#tlPrint +
     `@media print`, botón 🖨️ — ventana de impresión del navegador, permite
     guardar PDF). Modal `#tlp` a PANTALLA COMPLETA (overrides solo en #tlp,
     NO en `.tlmodal`: la clase la comparten ~12 modales) y cierra SOLO con
     la X (ni backdrop ni Escape). Resumen con evoluciones PLEGADAS
     (`<details class="tlr-fold">`, solo la última open; cabecera fecha +
     turno + fase + firma). Toggle «tendencia por día» eliminado.
     Guardia: bloque v4 en `checks/hoja_uci.js`.
  3. REGISTRO DIARIO: ➕ junto al nombre del paciente (celda `.tc-n`); el
     popover elige turno Día/Noche (`evSetTurno`, preselección por SHIFT) y
     el motivo queda a la vista. Guardia: `checks/eventos_ui.js`.
  4. ESTADÍSTICAS en orden Indicadores → General → **Tabla dinámica** → REM
     → Control de calidad. Pivot 100% vanilla: servidor `datosPivot()` en
     svc_stats.gs (LISTA BLANCA sin nombre/RUT/PATIENT_ID, tope 2.500,
     MES derivado) + API `GET_PIVOT`; cliente pivCargar/pivRender
     (conteo/suma/promedio, coma decimal, límite 80×32). Guardia:
     `checks/pivot.js`.
  5. VENTILADORES: fallas por equipo — `registrarFallaVM`/`obtenerFallasVM`
     en svc_equipos.gs (descripción OBLIGATORIA, foto opcional base64→Drive
     TODO-O-NADA, mime validado en servidor, deja ESTADO='Con falla'), hoja
     FALLAS_VM + seed `FALLAS_FOTOS_FOLDER` (la carpeta se crea sola al
     primer uso y persiste su ID; el scope Drive YA estaba en
     appsscript.json ⇒ no exigió re-autorización). Foto comprimida en
     cliente (canvas 1280 px JPEG 0,8). CAMAS: tag `.vmtag` del ventilador
     asignado (cruce en servidor en obtenerTodasLasCamas, una sola lectura),
     rojo si «Con falla», clic → pestaña Ventiladores. Guardia:
     `checks/fallas_vm.js`.
  DECISIONES POR DEFECTO (avisadas a Diego, puede pedir cambio): impresión =
  ventana del navegador (sirve como PDF); fotos de fallas en carpeta Drive
  auto-creada del dueño, sin compartir público; sin migración de registros
  históricos del bug de vía aérea (eran datos de prueba).
- **MANUEL FUENTES = GESTOR DEL CAMBIO (ago-2026)**: Diego lo incorporó con
  autorización de edición y el repositorio compartido. Mitiga la dependencia
  de una sola persona (hallazgo de la auditoría). Puede correr respaldos,
  cierre anual y pegados. La identidad real (AUTH_DEV_MODE=FALSE) sigue
  «para luego», sin fecha.
- **En el tintero** (iniciativa de Klgo. Manuel Fuentes, coordinar y sumar):
  sembrar INDICADORES_HISTORICO con su tabla mensual 2025-2026 (solo
  agregados) cuando la envíe, y la exportación anonimizada paciente-día
  para su pipeline de análisis (sin nombre ni RUT).
- **Stock de cánulas TQT** (aprobado en concepto, NO implementar aún):
  descuento automático por número+tipo al guardar TQT instalada o cambio de
  cánula (paciente que llega traqueostomizado NO descuenta), libro de
  movimientos + reposición manual + alerta de stock bajo, patrón del módulo
  de ventiladores. Falta que Diego mande: inventario actual, si el cambio
  puede variar de calibre, flujo de reposición y umbrales de alerta.
  Mockup antes de código.
- Privacidad: datos clínicos reales NO salen a APIs externas sin
  anonimización + aprobación institucional (Ley 19.628).
