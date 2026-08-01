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
- `esquema.gs`: 19 hojas; **EVOLUCIONES tiene 379 columnas** y `testEsquema`
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

- **v5.15 · SERVI INFLA EL GUANTE EN LA CARGA (ago-2026, cohete
  v5.15-guante).** Pose nueva de Diego (llegó como archivo al SEGUNDO
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
  (ahí se afina el registro con uso real). Deployment: cohete **v5.15-guante**
  (antes v5.14-ingreso, v5.13-movil, v5.12-fiesta, v5.11-asinc, v5.10-poses).
  Exige `crearORepararEstructura()` (EVOLUCIONES 379 columnas + CAMAS_ESTADO
  con `TQT_CALIBRE` + CONFIG con `DOCS_FOLDER`).
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
