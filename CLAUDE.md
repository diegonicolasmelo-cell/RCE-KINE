# RCE-KINE v2 — Registro Clínico Electrónico de Kinesiología UCI

Google Apps Script + Google Sheets. Hospital San Pablo de Coquimbo, unidad
de kinesiología UCI. El usuario es **Diego Melo Villagrán** (coordinador de
kinesiólogos, no programador): trabaja en español, actualiza el proyecto
**pegando a mano** los archivos en el editor de Apps Script, y prueba en el
navegador del hospital o de su casa.

> 📓 **El historial vive en `BITACORA.md`** — cada versión, qué se midió y con
> qué trampa se tropezó. Se separó de aquí el 14-ago-2026, cuando este archivo
> llegó a 233 mil caracteres y superó el límite que carga la herramienta:
> leído a medias no servía para lo único que existe. **Este archivo son las
> REGLAS VIGENTES y se lee entero**; la bitácora se consulta cuando hace falta
> el porqué de algo. Lo más rápido para buscar ahí no es leerla, es el RAG.
>
> **Al cerrar una tanda, la entrada nueva va a `BITACORA.md`**, no aquí. En
> este archivo solo se toca lo que cambia una regla o el «Estado vivo» del
> final.

## Cómo trabajar con Diego

- Todo en **español**. Explicar sin jerga; él decide, tú propones opciones
  ANTES de tocar código cuando el cambio es de diseño/UX ("dame opciones").
- **Cada entrega de archivos** debe decir: qué archivos pegar, si hay que
  correr `crearORepararEstructura()`, y cómo se publica (ver la regla de abajo;
  usar la skill `entrega-gas`; el index SIEMPRE en formato cohete).
- ☀️ **TODO mockup, artefacto o HTML que se le entregue va en TEMA CLARO**
  (pedido de Diego, 2-sep-2026: «desde ahora en adelante todos los mockup y HTML
  generados que sean con el tema claro o del día»). **Cómo se hace**: definir la
  paleta clara en el `:root` pelado y **no escribir** los bloques
  `@media (prefers-color-scheme: dark)` ni `:root[data-theme="dark"]` — así el
  artefacto no sigue el tema del que lo abre. El `body` **siempre** con
  `background` explícito desde un token; si no, el fondo lo pone el visor y la
  página se ve oscura igual. Vale también para lo que se publique como
  documento (PRD, planes, resúmenes), no solo para los mockups de pantallas.
- 🪤 **Emojis en la interfaz: nada posterior a 2019.** El Chrome del hospital
  corre en Windows 10 y su fuente no trae los emojis nuevos: 🩻 (2021) salió
  como un cuadrado (6-sep-2026). Para íconos nuevos, SVG propio o un emoji
  viejo (🖼️, 📋).
  · 🔴 **La regla es para ELEGIR un ícono nuevo, no para barrer los que ya
  están.** El 8-sep di por roto el 🫁 (2020) solo por la fecha; está en unos 25
  lugares visibles desde hace meses —«🫁 Respiratorio» del formulario, tablero
  de ventiladores, línea de tiempo, entrega, campana— y Diego nunca reportó
  cuadrados. **No se cambió nada.** Antes de declarar roto un emoji que ya vive
  en producción: `grep -rn` para ver dónde más está, y preguntarle a Diego si
  lo ve. El terreno manda sobre la tabla de versiones.

### 🔴 CÓMO SE PUBLICA — regla vigente (14-ago-2026, la cambió Diego)

Esto **reemplaza** a la regla anterior («una sola persona publica»), que quedó
obsoleta y sigue citada más abajo en el bloque de la Ola 1 de Manuel.

1. **Publican DOS personas: Manuel o Diego.** Ya no es una sola.
2. **Quien publica AVISA**, sin excepción: en el repo (commit o nota) o por
   Claude → Slack. El aviso es la mitad de la regla, no un extra — con dos
   personas publicando, lo que evita el choque es que quede escrito.
3. **NO se crea una implementación nueva.** Se **gestiona la implementación
   existente**, apuntándola a la versión correcta, para que la URL del equipo
   NO cambie. La implementación es:
   `AKfycbxMKE6_C6-aU77BRKm-GczD5jIYDIC400hMJxoIL5BUNyxUJzuHL-Ax-HuXaX9BavqVzg`
   (o sea `https://script.google.com/macros/s/AKfycbx…/exec`).
   En el editor: Implementar → Administrar implementaciones → ✏️ sobre ESA
   implementación → versión nueva. Crear una implementación aparte genera otra
   URL y parte a la unidad en dos.
4. `crearORepararEstructura()` **no se puede automatizar**: cuando la entrega
   cambia el esquema, alguien la corre a mano desde el editor.
- No agregar funcionalidades que no pidió (p. ej. rechazó envío de correos).
- **Ramas de GitHub con nombre identificador** (pedido de Diego, ago-2026):
  toda rama nueva debe decir QUÉ contiene, en español y legible para él
  (p. ej. `v544-dispositivos-texto-prono`, `arreglo-dias-vm`), nunca nombres
  genéricos o al azar. Así distingue de un vistazo qué código hay en cada una
  y no se repite la confusión de las ramas viejas. Las ramas que una sesión
  trae pre-asignadas con nombre automático se usan igual (no se pueden
  renombrar), pero al avisarle a Diego siempre decirle en palabras qué trae.
- Los eventos de vía aérea (intubación, extubación, TQT, decanulación) se
  registran **manualmente** por decisión clínica; las alertas solo detectan
  olvidos, nunca automatizan el registro.
- **Rama `rediseno-formulario-bloques` = prototipo PARALELO del formulario.
  ⏸️ EN PAUSA desde el 10-ago-2026 por decisión de Diego** («el rediseño
  empezó pero se dejará para después»): **no trabajar en ella salvo que él lo
  pida**. Carpeta `rediseño/`, evolución por bloques con guardado
  independiente, proyecto de Apps Script APARTE con hojas propias. Diego lo
  pidió «encarecidamente paralelo, jamás lo principal»: esa rama **NO se
  fusiona a main** y nada suyo toca `v2/`. Leer su `OBSERVACIONES.md` antes
  de retomarla (la forma se explora allá; el fondo clínico viene de `v2/`).
  - Estado al pausar: **v0.5**. v0.2 arquetipo de Claude Design adaptado a
    las reglas reales (traía catálogos inventados: extubación «sin
    condiciones», sedación sin escalones, GCS sin T…); v0.3 **ficha del
    episodio separada** (datos personales + pre-UCI en hoja propia, el turno
    viaja sin nombre) y **evaluaciones fechadas** en vez de columnas del
    turno; v0.4 tres temas (**Tinta** por defecto de día, Noche automático en
    turno noche); v0.5 eventos con «queda con», GSA interpretado,
    desvinculación con delta y circuito por fecha de etiqueta.
  - 🪤 **TRAMPA VERIFICADA AL INTENTAR PROBARLO (10-ago)**: Diego copió la
    planilla de producción (con sus scripts) para usarla de banco de pruebas.
    **NO se puede pegar el rediseño junto a los 9 .gs de producción**: en
    Apps Script el espacio de nombres es único y chocan `doGet` (decide qué
    app se sirve) y sobre todo **`_hoja`** — la de `repo.gs` LANZA ERROR si
    la hoja no existe y la del rediseño la CREA, así que pisarla haría que
    producción fabrique hojas vacías sin sus 386 columnas en silencio. El
    proyecto del prototipo debe tener SOLO sus 3 archivos.
  - Pendiente único de captura: decanulación con racha de válvula de fonación
    (exige historial de varios turnos reales).

## Método PRD — «Escribe tu maldito PRD» (14-ago-2026, traído por Diego)

Diego mandó el PDF del método y pidió dejarlo en memoria. Es una forma de
**escribir la estructura ANTES de promptear**: el documento fija el
razonamiento y recién después se pide «implementa al 100% @mi-prd.md».

- **Qué contiene un PRD**: la historia (antes y después) · hoy → mañana ·
  las tablas y entidades que se tocan · pseudo-código · la explicación de
  los cambios.
- **Qué NUNCA contiene**: código final, la implementación exacta, pantallas
  terminadas, configuración.
- **Todo empieza con una historia**, contable en palabras y sin tecnicismos.
  No «escuchar el cambio de estado, agendar la tarea»; sí «Marta cerró su
  compra un viernes a las 6 y nadie la llamó». La historia dice **quién es
  el usuario, cómo lo usa, cuál es el dolor y qué experiencia quiere vivir**;
  todo lo demás existe para hacerla realidad. Si la historia no convence, el
  resto no importa.
- **El tamaño lo decide el cambio**: un ajuste = 1 página · una
  funcionalidad = 3-8 · una funcionalidad grande = 10+ · un producto nuevo =
  varios PRDs anidados (cada uno con su propia historia; ninguno carga con
  todo el peso).
- **Anatomía, en orden**: 0 encabezado (estado · dueño · alcance, y qué
  queda FUERA) · 1 resumen hoy/después en dos líneas · 2 la historia
  (ANTES/DESPUÉS, con nombre y momento) · 3 objetivos y **no-objetivos** con
  identificador, que las secciones siguientes citan y que frenan el «ya que
  estamos…» · 4 el flujo dibujado dos veces (cómo funciona hoy → cómo va a
  funcionar) · 5 los datos (qué dispara, qué interruptores hay, qué candado
  evita hacerlo dos veces) · 6 pseudo-código como acuerdo (CUANDO… ¿guardas?
  → ENTONCES…, más las promesas).
- **La única regla dura**: el PRD fija la estructura en pseudo-código y
  explicaciones, **nunca en código final**. «Si la estructura está bien en
  papel, el código es la parte fácil; si está mal, ningún código la arregla.»

**Cómo aterriza EN ESTE proyecto** (lectura propia, para no aplicarlo a
ciegas):
- La mitad del método ya se practica sin nombrarla: los mockups antes de
  programar (hoja de registro, celular, entrega), las decisiones clínicas
  cerradas con Diego antes de tocar código, y esta bitácora como memoria del
  porqué. Lo que **falta** son los pasos 4-5-6 escritos ANTES: el flujo
  hoy→mañana, el plano de datos y el pseudo-código.
- 🔴 **Adaptación obligatoria**: aquí el trabajo típico no es software nuevo
  sino **cambiar una regla clínica que ya vive en cuatro sitios** (servidor,
  espejo del cliente, imprimible y chip). Un PRD que no traiga el
  **inventario de consumidores** en su sección «los datos» repite el error de
  los filtros, del «día con VM» y de las secreciones. El RAG los encuentra en
  un comando: ése es el insumo de esa sección.
- **Dónde habría cambiado el resultado**: la reversión del filtro por
  `PATIENT_ID` (6-ago) se implementó, pasó su guardia y pasó las 54 de la
  batería — y se revirtió porque escondía pronaciones verdaderas. Un PRD con
  la historia («qué le pasa al paciente al que se le repara la cama y se
  re-ingresa») y con no-objetivos lo habría cazado en papel, gratis.
- **Dónde NO habría servido**: la cama 7 (14-ago). La causa no salió de
  ningún documento sino de un dato de terreno de Diego en una línea.
- **Cuándo se paga**: la mayoría de lo que pide Diego son ajustes de 1
  página. El PRD completo vale la pena en lo que toca esquema y consumidores
  repartidos — la desvinculación con estado posterior, el SAS real, el
  rediseño de captura en el celular.
- El PDF original **no quedó guardado en el repo** (el copiado no se pudo
  aprobar en esa sesión); si hace falta tenerlo a mano, pedírselo de nuevo.

## Arquitectura

- **Repo = verdad.** `v2/*.gs` + `v2/index.html` (fuente, sin minificar).
  Remoto: `git@github.com:diegonicolasmelo-cell/RCE-KINE.git`. **El acceso es
  por SSH**, con la clave dedicada `~/.ssh/github_rce` declarada en
  `~/.ssh/config` (`Host github.com` → `IdentityFile`, `IdentitiesOnly yes`).
  No hay token de por medio: si `git push` pide usuario y contraseña, el
  problema es esa configuración, no las credenciales.
  El proyecto GAS de producción usa un layout de 9 .gs: los 19 `svc_*.gs`
  (de 35 `.gs` en `v2/`) viajan fusionados como `servicios.gs`
  (`build/fusionar_servicios.js`, que los toma por glob: la cifra sube sola al
  agregar un servicio).
- `api.gs`: dispatcher único `api(accion, datos, token)`; escrituras pasan
  por `_auditar`. `GET_LOGIN_INFO` es pre-auth (público).
- `esquema.gs`: 26 hojas (24 NOTIFICACIONES —buzón, de SOLO agregar—, 25 GSA_IMPORTADAS —gases del laboratorio, sin RUT—, 26 PLANTILLAS_EVOLUCION —catálogo, se conserva en el reset—); **EVOLUCIONES tiene 396 columnas** y `testEsquema`
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
- Frontend: `v2/index.html` único (~13.000 líneas fuente). Piel estilo
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

**125 guardias** en `build/checks/*.js` (11-sep-2026); poco más de la mitad usan navegador
(`chromium.launch`) y el resto son Node puro. Se juzgan **SOLO por el código de
salida** (`0` = pasa) — varias imprimen a propósito fallos SIMULADOS para
demostrar que los detectan, así que leer el texto y no el exit code lleva a
«arreglar» código sano.

```bash
node build/verificar.js                  # la batería entera, 4 en paralelo (~70 s)
node build/verificar.js eventos          # solo las que contengan «eventos»
node build/verificar.js --ver arranque   # la salida completa de una
```

**Estado al 11-sep-2026: 125 verdes, 0 rojas** (en la rama `separacion-episodio-turno`; `develop` sigue en 124). El corredor
(`build/verificar.js`, ago-2026) **busca el Chromium de Playwright solo** y se
lo pasa a cada hijo: antes eso se exportaba a mano y era la causa de la mayoría
de las «rojas» —el navegador no estaba y el código estaba sano—. `rendimiento.js`
era la única guardia con la ruta escrita fija y por eso fallaba siempre en el
Mac; ahora lee `CHROMIUM_PATH` como el resto. El corredor **no tiene lista de
rojas conocidas** a propósito: una guardia que falla se arregla o se borra con
su razón escrita.

Las cabeceras: `convenciones.js` (estáticas), `arranque.js` (boot real en
Chromium con puente simulado; acepta ruta del cohete como argumento),
`integridad.js`, `regresion_ui.js`, `movil.js`, `piel.js`, `rem.js`,
`indicadores.js`, `eventos.js`, `eventos_ui.js`, `docs.js`, `tutorial.js`,
`paquete.js`, `reset.js`, `mover_camas.js`, `vm_lote.js`, `retro_camas.js`,
`camas_prueba.js`, `entrega_impresion.js`, `memo_config.js`, `memo_tz.js`,
`memo_episodio.js`, `rendimiento.js` (bucles de repintado con la unidad llena),
`texto_bloques.js` (la etiqueta de bloque no altera el texto visible),
`asincronia.js` (Ppl/AutoPEEP inhabilitados con paciente asincrónico).
Enumerar aquí las 89 es garantía de desfase: la lista buena es `ls
build/checks/`.

Correr antes de entregar o commitear. Un bug que costó más de un
intercambio merece guardia nueva.

🪤 **FECHAS EN LOS BANCOS DE PRUEBA: SIEMPRE RELATIVAS, NUNCA FIJAS**
(9-sep-2026). Dos guardias se pusieron rojas solas al cambiar el día:
`pve_no_toca_los_dias` anclaba el tramo en un `'2026-08-25'` escrito a mano y
esperaba «16/13» —dos días después la app decía «18/15», correctamente—, y
`plantillas_evolucion` clavaba las PVE en septiembre, así que al pasar de 7 días
el weaning dejó de ser *difícil* y pasó a *prolongado* sin que nadie tocara
nada. Las dos se arreglaron con un `hace(n)` local. **Una guardia que se cae
sola por el calendario es peor que no tenerla: enseña a ignorar el rojo.** Al
escribir cualquier banco que toque días, fechas o relojes, anclar contra hoy.
Y ante una roja inesperada: `git stash` y volver a correrla antes de «arreglar»
código sano.

## Buscador del proyecto (skill `rce-kine-rag`)

`v2/index.html` pasa de las 10.000 líneas y este archivo de las 1.500: abrir
cualquiera de los dos «para ver cómo se hace X» quema media sesión y encima
suele devolver la parte equivocada. Hay un índice SQLite FTS5 **troceado por
función** sobre los `.gs`, el index, las guardias, esta bitácora, las skills
y la memoria:

```bash
python3 ~/Documents/RCE-KINE-rag/rag_buscar.py "vencimiento de filtros HME"
python3 ~/Documents/RCE-KINE-rag/rag_buscar.py "fechaEfectivaTurno" --tipo función
python3 ~/Documents/RCE-KINE-rag/rag_index.py        # reindexar tras cada tanda
```

Vive **fuera del repo** para no ensuciar el proyecto de Diego con herramientas
que no le sirven. Aborta el indexado si aparece un RUT fuera de su lista blanca
de RUT de ejemplo. Su mejor uso no es buscar texto sino **encontrar todos los
lugares donde vive una misma regla** antes de cambiarla — así apareció que la
entrega de turno se había quedado con la regla vieja de los filtros.

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


## Estado vivo (14-ago-2026)

Lo que está abierto. **El historial completo —cada versión, qué se midió y con
qué trampa se tropezó— vive en `BITACORA.md`**, que se consulta cuando hace
falta el detalle. Este índice existe para saber QUÉ está abierto; el porqué
está allá.

### Dónde está el código

- 🚧 **Rama paralela `separacion-episodio-turno` — v7.00 PROGRAMADA (11-sep),
  esperando que Diego la instale en SU planilla nueva.** Paquete de 12
  archivos + paso a paso en `INSTALAR_PLANILLA_NUEVA.md`; detalle en
  BITACORA v7.00; plan en `PRD_EPISODIO_Y_TURNO.md`. **NO se fusiona a
  develop/main ni se pega en producción sin su OK.** Si él reporta algo de
  esa planilla, el código es el de esa rama, no el de `develop`.

🔴 **NUNCA suponer qué está publicado: preguntárselo a Diego o mirar el editor.**
El 14-ago yo di por publicada la v5.48 (lo decía la bitácora) y en realidad
corría la **v5.50**; encima `main` iba en la v5.54. Con las dos cifras malas, la
entrega que armé se calculó contra la referencia equivocada y salió incompleta
DOS veces seguidas. La cifra de abajo se actualiza cuando alguien publica —
si tiene más de unos días, se confirma antes de usarla.

- **Publicado en producción**: **Versión 38, sello 5.66-episodio** (fuente:
  el traspaso de Manuel del 20-ago, posterior a su bitácora que decía V37; el
  /exec no se pudo medir desde la sesión del 21-ago porque el proxy bloquea
  script.google.com). Incluye v5.59–v5.62, Modo Coordinación y la tanda del
  episodio; `crearORepararEstructura()` y `coordSembrarClaves()` ya corridos.
- **Pegado y con `crearORepararEstructura()` corrido (Diego, 6-sep 04:24)**:
  la v6.04 completa (index + servicios, 6-sep 08:58; el ➕ funciona en el
  hospital). **Pendiente de pegar: index + servicios de la v6.07** (trae el
  ícono de Synapse de la v6.05, el traspaso de la entrega en blanco y negro
  de Manuel de la v6.06 — su 5.86-entrega-bn-negrita estaba publicada y la
  tanda la pisó — y el arreglo del importador de gases de la v6.07: el texto
  que devuelve Drive parte etiqueta y valor en renglones distintos y el
  parser línea a línea perdía fecha, hora y PATIENT_ID; ahora reintenta solo
  la bandeja «sin emparejar» y hay `gsaDiagnostico()` para ver el texto real
  desde el editor) y **la bandeja 📥 de la v6.08** para emparejar a mano lo
  que la máquina no pudo, desde los valores que YA están en la base (se pega
  también **api**) y **la v6.09** (Hb, Hto y K⁺ a observaciones de la hoja
  impresa, que vuelve a las filas oficiales) y **la v6.10** (el último cultivo
  del episodio con su resultado, en la última fila de observaciones; ver
  BITACORA v6.10…v6.06) y **la v6.11** (revisión de las 17 plantillas de la
  unidad: diez comodines que el motor escribía y ninguna plantilla podía
  nombrar —`{intubacion}` entre ellos— más dos semillas corregidas;
  revisión publicada en
  `https://claude.ai/code/artifact/6bfc0c67-d807-4cc8-a234-f2fe6d28d85b`,
  con tres preguntas abiertas para Diego) y **la v6.12** (el aviso de versión
  del buzón lleva un resumen escrito para el equipo: catálogo `NOVEDADES` en
  `svc_notificaciones.gs` — la entrada resume LA TANDA que el equipo verá al
  pasar a ese sello, no solo esa versión, porque el servidor solo ve el sello
  que arranca) y **la v6.13** (la pantalla de carga celebra con la pose
  festejo, gorro y confeti 🎊 cuando alguien cumple —el día se recuerda en el
  navegador porque el boot llega después de pintarla— y el botón que anuncia
  crece de 62 a 92 px) y **la v6.14** (la cama 17 con los días de VM y TOT en
  0: el turno heredado copiaba el estado final del turno anterior por encima
  de la cama y la «destubaba» en silencio; ahora MANDA LA CAMA. Guardia nueva
  `pve_no_toca_los_dias` con la regla de Diego —ninguna PVE toca los relojes—
  y `revisarRelojesCama(n)` en mantenimiento para diagnosticar una cama) y
  **la v6.15** (🔴 **plantillas APAGADAS para el equipo** por pedido de
  Diego —«tuvimos problemas de experiencia de usuario negativas»—: interruptor
  `CONFIG.PLANTILLAS_ACTIVAS`, FALSE por defecto; el texto es el motor de
  siempre y el editor 📋 lo ve solo coordinación con sesión 🔐, para armar
  las 17 de la unidad. Se enciende poniendo TRUE en la planilla, sin pegar) y
  **la v6.16** (equivocarse en el select de vía aérea y volver atrás ya no
  destruye los contadores: `_snapIniEstado` guarda el estado de llegada y
  `cascadeVA` lo restaura si no hay evento declarado; PRD de Diego en
  BITACORA v6.16) y **la v6.17** (el total de VM se perdía al turno siguiente:
  `fillFormReplica` no reponía DIAS_VM_PREVIOS ni N_REINTUB, así que un
  episodio reintubado perdía su tramo anterior en silencio —«13» en vez de
  «16/13»— y eso viajaba al REM) y **la v6.18** (se probaron los 99 controles
  del panel uno por uno: `fVA` seguía perdiendo los contadores si el select
  pasaba por la opción EN BLANCO —`_vaAnterior` quedaba falsy y el deshacer no
  entraba—; 8 cascadas clínicas más no se revierten y esperan decisión de
  Diego, ver BITACORA v6.18) y **la v6.20** (lo que reportó Álvaro: la auscultación
  narraba UN ruido de los varios que se anotan —`EX_RUIDOS_JSON` se guardaba y
  nunca se leía—, en los dos motores; de paso «sin ruidos agregados» sin
  murmullo ya no sale con coma suelta. Además `{aet}`, `{reingreso}` y `{upot}`
  pasan a ser comodines —tres bloques huérfanos más, como los diez de la
  v6.11— y entran **25 comodines de dato** para poder REESCRIBIR un bloque con
  palabras propias, que es lo que pidió Diego: «quiero cambiar sedoanalgesia
  por sedado». Taller con los 95 comodines y las recetas:
  `https://claude.ai/code/artifact/2ca6d76b-8246-46f6-9638-c99cf0f8dd5a`.
  Guardia `auscultacion_ruidos`) y **la v6.19** (esas ocho se deshacen: si el
  control vuelve al valor con que se abrió el panel, lo que su cascada
  escribió vuelve también —tabla `_CASCADAS` + oyente en el formulario—;
  medido 0 de 99, y guardia nueva `panel_no_pisa_datos` que lo vigila). 🔜 **Pendiente que dejó anotado Diego**: la carilla
  2 de la hoja impresa (neuromuscular) «sale apilada, no en el formato
  correcto» — sin diseñar. **Fusionado el 6-sep**: `filtros-vence-hoy` →
  `develop` → `main`. 🔴 La rama `fix/la-vni-viaja-al-rem-hospital` de Manuel
  (puente «REM Hospital» + maqueta de pacientes ficticios) quedó SIN fusionar
  a propósito: destino externo no aprobado por Diego. Historia de la v6.04: index + servicios
  (plantillas desde el cuadro de texto, sin barra de chips; interacción P-VM
  que no se arrastra; incluye el tooltip acotado y el ícono Rx de la v6.03).
  Sin cambio de esquema. Lo que sigue describe la tanda entera:
  **v6.02-plantillas-de-evolucion** (6-sep, rama
  `filtros-vence-hoy`, que INCLUYE v6.01…v5.86). 🔴 **Se pegan 8 archivos**
  (`node build/que_pegar.js origin/main`): index (cohete) + servicios + api +
  esquema + dominio + infra + repo + mantenimiento, y UN
  `crearORepararEstructura()` (EVOLUCIONES 396 columnas; hojas
  GSA_IMPORTADAS y PLANTILLAS_EVOLUCION con sus semillas). Después, desde el
  editor: `instalarTriggerGSA()` (crea la carpeta de Drive de los PDF y el
  disparador de las 06:30) y, cuando quiera medir la marcha blanca,
  `auditoriaIntegridad()` (solo lectura). La v5.99 arregla el R1 de la
  auditoría (la cama que rota sin alta ya no pisa la evolución del
  anterior), la v6.00 es la PVE superada sin extubar (PRD), la v6.01 la
  importación del gas de la mañana desde los PDF del laboratorio y la v6.02
  las plantillas de evolución en modo chips. Detalle de cada una en
  BITACORA. Lo que sigue es la historia previa de la tanda:
  la v5.97 (5-sep). La v5.97 agrega las
  «📌 Anotaciones del turno» (constancia sin estadística, narradas en la
  evolución antes de la Nota; hora opcional) y **cambia esquema**
  (EVOLUCIONES suma ANOTACIONES_JSON al final ⇒ 394 columnas) — el MISMO
  crearORepararEstructura() de la tanda lo cubre; se pega también
  **dominio** (cambió dominio_texto). La v5.96 agrega el aviso
  📣 de coordinación al buzón (index + servicios + api, sin esquema nuevo) y
  actualiza NOTA_PARA_MANUEL.md (Diego: «dile a Manuel que no programe nada
  hasta fusionar»). La v5.95 agrega el «NE»
  del FSS-ICU según el manual oficial (hasta 2 se promedian, con más no hay
  total; guardia fss_ne — solo index). La v5.94 deriva el MOTIVO
  de las MRC/FSS que faltan desde la cooperación registrada (campana solo al
  cooperador sin medir; tooltip en tarjeta; motivo escrito en la entrega —
  sin esquema). La v5.93 agrega la alerta
  «Pendiente medir pimometría» a la campana y **cambia esquema** (CAMAS_ESTADO
  suma ULT_PS/ULT_PIM/ULT_PIM_FECHA al final + CONFIG PIMO_PS_MAX=14 y
  PIMO_VM_DIAS=21) — el MISMO crearORepararEstructura() de la v5.91 lo
  cubre. La v5.92 imprime el chip
  de la cama de la entrega invertido (cuadro negro en papel B/N) y hace
  OBLIGATORIO el criterio de la suspensión de KTM en sesión, que ahora sale
  también en la ficha de entrega (guardia ktm_suspension_motivo). La v5.91
  **cambia esquema** (hoja NOTIFICACIONES) ⇒
  `crearORepararEstructura()`, y toca servicios + api + esquema +
  mantenimiento + index: se pegan LOS CINCO.
  La v5.88 lleva «Vencen hoy» a la hoja diaria impresa y al modal; la v5.89
  arregla el botón 🩻 (copiar ANTES de window.open: la apertura consume la
  activación del clic y la copia fallaba en silencio — guardia que fija el
  orden en nota_synapse_cumple.js). Diego YA publicó la tanda anterior
  (probó Synapse en el hospital el 4-sep): esta entrega es solo el index. La v5.86 **cambia esquema**
  (KINESIOLOGOS.CUMPLE + CONFIG.SYNAPSE_URL) ⇒ `crearORepararEstructura()`;
  la v5.87 es solo index. Si la v5.86 aún no se pegó, se pega TODO junto con
  el index de la 5.87 (index + servicios + api + esquema); si ya se pegó,
  solo el index. Lo anterior pendiente (v5.67-candado) quedó incluido en
  entregas previas — confirmar contra el editor, nunca suponer.
- **Flujo de ramas vigente (traspaso de Manuel)**: rama nueva por cambio
  salida de `develop` (nombre en español) → `git merge --no-ff -m` a
  `develop` (el `-m` NO es opcional: sin él el merge queda colgado a medias)
  → PR develop→main. `git push -u origin HEAD` siempre, y
  `git branch --show-current` antes de commitear (dos sesiones sobre la
  misma carpeta ya se pisaron).
- 🪤 `mantenimiento_manuel.gs` **se borró del editor a propósito** (llevaba
  apellidos reales; ya purgado también en el repo). `que_pegar.js` puede
  volver a pedirlo: NO se re-pega salvo decisión explícita.
- Marcha blanca con datos reales desde el 1-ago-2026.

### 🔴 Antes de armar una entrega: `node build/que_pegar.js <ref-publicada>`

El repo tiene 35 `.gs` y el editor 9, así que **qué archivos pegar no se
recuerda: se calcula**. La herramienta agrupa los cambios por archivo del
editor y avisa si cambió el esquema. Se le pasa **la referencia de lo que está
publicado de verdad** (`e48dcf4` para la v5.50), no `main` — main puede ir
adelante de producción, que es exactamente lo que pasó el 14-ago.

### 🔍 Auditoría del guardado (5-sep-2026) — leerla antes de tocar el guardado o de hacer la estadística

Diego pidió revisar cómo se guarda la información («lo guardado no se puede
perder ni sobreescribir con otra acción que no sea guardar»; «no programes
nada, solo audita»). El detalle vive en `BITACORA.md` (entrada «Auditoría del
guardado») y el informe publicado en
`https://claude.ai/code/artifact/9446deef-c67e-464f-9fc0-21b79e38bb5a`.
Lo que hay que tener presente:

- ✅ **R1 ARREGLADO en la v5.99** (6-sep; Diego: «debería crear fila
  nueva»): `_ubicarFilaGuardado` ubica la fila por episodio y, si la de la
  clave es de otra persona, abre una fila aparte (`CAMA_n_turno~pid`). La del
  anterior queda intacta; la campana avisa las filas que siguen colgando de
  la cama. 🪤 Los lectores por cama (previa, prono, contadores) siguen SIN
  filtrar por pid a propósito (decisión del 6-ago, `checks/prono_paciente.js`).
  Pendiente de fondo que dejó Diego: «obligatorio pedir el RUT y ligar los
  eventos a ese ID y no a la cama» — es el camino para que un re-ingreso no
  estrene pid; no está programado.
- 🔴 **R3**: el backup diario solo corre si `instalarTriggerBackup` se
  ejecutó una vez — verificar el disparador es el pendiente nº1 antes de la
  estadística de fin de mes.
- ✅ C1/C2 cerrados en la v5.99: `coordCorregirFicha` y
  `guardarAsignacionTurno` corren en `conLock`. ✅ M4: `auditoriaIntegridad()`
  (mantenimiento.gs, solo lectura) busca las huellas A-E; correrla antes de
  la estadística y leer el registro. M3 (guardia neutralización↔fusión) y M5
  quedan abiertos.
- El checklist pre-estadística (①-⑦) está en el informe; incluye la
  conciliación REM (faltan las cifras de papel de agosto) y publicar la
  tanda (hoy v6.02) antes de generar cifras.

### 🗺️ El plan de todo lo pendiente, en una página

🔌 **VIGENTE — «Cables sueltos» (11-sep-2026), el mejor punto de entrada para
retomar**: `https://claude.ai/code/artifact/b9defc45-a2cd-42da-93cf-81730e977056`
Diego lo pidió «para ir atando cables». **29 pendientes ordenados por quién los
destraba**: 7 solo él · 4 para informática · 11 decisiones suyas · 3 acordados y
listos para programar · 4 en el banco. Arriba, las tres de la semana: verificar
el respaldo, publicar la v6.24 y mirar la cama 13.
· 🪤 **Cable rescatado del plan viejo que NO estaba en esta memoria**: el 2-sep
quedó anotado que **la planilla estaba compartida como «cualquiera con el
enlace»** —y ahí viven los RUT—. No se sabe si Diego ya lo cambió; quedó en la
página como «confirmar». No dejar que se pierda otra vez.

⬛ **SUPERADO — el plan del 2-sep** queda como foto histórica de ese día (su
tanda 1, 2 y 3 ya están hechas):
`https://claude.ai/code/artifact/f12ae3e1-ea58-4e88-af4e-954d51017aa6`

- ✅ **Tanda 1**: Synapse (v5.89) + cumpleaños (v5.86/v5.90/v5.98) hechos; los
  eventos manuales se resolvieron como «📌 Anotaciones del turno» (v5.97) y la
  barra de eventos vive dentro de las plantillas (v6.02).
- ✅ **Tanda 2** (6-sep): PVE superada sin extubar (v6.00) + gases importados
  (v6.01). Un solo `crearORepararEstructura()`.
- ⏸️ **Tanda 3** (6-sep): plantillas de evolución. Los chips (v6.02) NO le
  sirvieron a Diego; la **v6.04** las lleva al cuadro de texto (📋 abajo a la
  derecha, ➕ verde al seleccionar frases, se aplica sola, comodines por dato
  y por bloque). Detalle y trampas en BITACORA v6.04.
  🔴 **APAGADAS PARA EL EQUIPO desde la v6.15 (7-sep, Diego: «volver al
  sistema anterior tal cual… la plantilla solo la verá coordinación»)**:
  `CONFIG.PLANTILLAS_ACTIVAS=FALSE`. El texto es el motor de siempre; el 📋
  solo aparece con sesión de coordinación y solo como EDITOR. Se reactivan
  para todos poniendo TRUE en CONFIG cuando las 17 de la unidad estén listas
  y revisadas (la página de revisión de la v6.11 sirve para eso). Pendiente:
  Diego debe decir QUÉ campo «no salía» en el editor.
- 🎂 **Cumpleaños: CERRADO** (Diego, 6-sep: «cierra los cumpleaños con
  Rodrigo pendiente»; el 6-sep mandó la fecha que faltaba). La lista se
  escribe directo en `KINESIOLOGOS.CUMPLE` (dd-mm) y **la escribe Diego en la
  planilla**: son datos personales de los funcionarios y este repo es
  público, así que ninguna fecha se anota aquí ni en el código — ni siquiera
  «de paso» al cerrar un pendiente.
- 🔒 Seguridad (Diego, 6-sep): la clave de Synapse la maneja el hospital (no
  depende de nosotros); **pendiente poner el repo en privado** (lo hace Diego
  en GitHub: Settings → General → Danger zone → Change visibility).

### 🚧 RAMA PARALELA `separacion-episodio-turno` — decisiones de Diego del 11-sep-2026 (voz)

Diego respondió los cables en bloque y dio la orden: **«PROGRAMA todo lo demás,
ya que esto irá por rama paralela; lo que haré es iniciar otro Sheet con otro
nombre… es importante que esté en paralelo la rama, para no afectar el trabajo
de nadie más; luego los archivos los pego en Script. Al final dame el paquete
de documentos para subir e implementar en el nuevo archivo.»** Y: «actúa en
loop hasta terminar; si se acaba Fable sigue con el modelo siguiente».
· 🔴 **Esto NO toca producción**: rama nueva salida de `develop`, y Diego crea
UNA PLANILLA NUEVA con su propio proyecto de Apps Script donde pega los 9
archivos completos. Sus mitigaciones responden a las contras del 11-sep
(sin riesgo a la marcha blanca, sin «dos verdades» en producción, el equipo
no reaprende hasta que él decida). **No se fusiona a develop/main sin su OK.**
· **Decisiones cerradas por él (textual)**:
  - 2.1 extensión de Chrome del LIS: «se puede instalar en cualquiera» → cerrado.
  - 2.2 laboratorio CSV/TXT: «omite el laboratorio por ahora y déjalo pendiente».
  - 2.3 enlace directo Synapse: «ok» → cerrado como está.
  - 2.4 PWA + login real: «hay que hacerlo pero de forma que no afecte al uso
    diario, quizás una rama paralela y progresar con el login y PWA». ⚠️ Sigue
    bloqueado por informática (correo institucional) y decisiones suyas; NO
    entra en esta tanda — ver la nota al final.
  - 3 «arranca las escalas» → T1 en marcha.
  - **SBC exige FSS-ICU**: «del episodio, al menos 1; eso quiere decir: lo
    evalué, después lo traté» → basta UN FSS en el episodio (no por turno).
    Bloqueo suave: cliente y servidor rechazan SBC sin FSS, y el mensaje
    manda a medirlo ahí mismo (el FSS está en el mismo formulario).
  - **Panel de extubación**: «mejor que anuncie a la entrada para evitar
    problemas» → fila «¿Qué pasó hoy con la vía aérea?» arriba; el TEXTO
    sigue cronológico como su ejemplo (no lo cambió).
  - **Línea fina de ventilación y cultivos: «ambas»** → parámetros = turno;
    vía aérea y soporte = episodio y solo los cambia un evento. Cultivos =
    serie fechada (como se propuso) y además hito en la línea de tiempo.
· 🔑 **ESTRATEGIA TÉCNICA: migración ADITIVA, no destructiva.** Las 396
columnas de EVOLUCIONES no se tocan (testEsquema las asserta). Se agregan
fuentes nuevas —hoja `EVALUACIONES` (serie fechada con firma), `DATOS_JSON`
en `TIMELINE`, `ULT_*_FIRMA` en CAMAS_ESTADO— y el turno SIGUE escribiendo
sus columnas cuando el dato se mide EN ese turno (eso es verdad). Lo que se
corta es la HERENCIA de evaluaciones al turno siguiente (la foto retocada).
Los 27 archivos que leen EXT_OCURRIO no se reescriben: la fila de eventos
del panel ESCRIBE esas mismas casillas, y además el hito estructurado. Así
la batería sigue verde y cada consumidor migra cuando toque.
· ✅ **HECHO (11-sep-2026, sello `7.00-episodio-y-turno`)**: T1-T7 completas,
guardia `episodio_turno.js`, 125 verdes. Paquete y paso a paso en
`INSTALAR_PLANILLA_NUEVA.md`. Lo que trae, en BITACORA v7.00.
· 🔴 **Corrección que hay que decirle a Diego (ya va en la entrega)**: la fila
heredada NO afirmaba «MRC 33 evaluado hoy» — `fillFormReplica` no hereda las
evaluaciones (solo las recarga si `EVAL_FECHA` es hoy). Lo que faltaba de
verdad era la firma y la serie. No repetir la afirmación de la «foto retocada».
· 🪤 Para probar guardias con navegador: `function guardar()` no se puede
`delete` de `window` (guardar la real aparte); el simulador tiene el reloj en
julio (las fechas del navegador se arman con SU `hoy()`); y el catálogo
`NOVEDADES` no admite comentarios entre la llave y la primera clave.

### Esperando decisión de Diego

- 🔴 ✂️ **EL PANEL DEBERÍA ANUNCIAR EL EVENTO PRIMERO — caso real de terreno
  (Diego, 9-sep-2026).** «Un paciente que estaba para extubar se extubó, pero se
  le cambió la vía aérea y no se le hizo PVE ni pasó por Extubación, lo que
  ensuciaría mucho los resultados.» Pidió ideas; **no se programó nada**.
  · 🪤 **LO QUE HAY QUE SABER ANTES DE DISEÑAR: la app YA DETECTA ese caso, y
  lo deja pasar igual.** `_avisosTransicion()` (index ~6485) compara la vía
  aérea de llegada con la de salida y levanta textual: «Venía con TOT y quedó
  con —, pero no hay extubación registrada». El modal ⚠️ dice **«Nada se
  bloquea: puedes guardar igual»** y trae el botón **«Guardar igual»**
  (`transAvisoGuardar`, ~6511). O sea el problema **no es de detección: es que
  la salida cuesta un clic y no pide ninguna razón.**
  · 🔴 **Y el aviso vive SOLO en el cliente.** El servidor no revisa la
  transición: `dominio_validacion.gs` valida la PVE y el tipo de extubación,
  pero nadie compara la vía aérea de entrada con la de salida. Una fila así
  entra a la base sin que el servidor se entere.
  · **Por qué ensucia de verdad, medido en el código**: todos los consumidores
  cuentan la extubación por **`EXT_OCURRIO`** (REM, estadística, entrega,
  tiempo extubado) — con la casilla sin marcar, **para las cifras esa
  extubación nunca ocurrió**. Y además **no se cierra el tramo de VM**:
  `DIAS_VM_PREVIOS` solo se sella cuando `_extOcurrio()` es verdadero (index
  ~6875), así que los relojes siguen corriendo sobre un paciente ya extubado.
  Son dos contaminaciones distintas de un mismo olvido.
  · 🔑 **CONEXIÓN QUE NO HAY QUE PERDER: esto ES la tanda D**, que quedó
  detenida en el mockup (ver más abajo) porque **«la barra de plantillas absorbe
  la fila de eventos»**. Pero las plantillas quedaron **APAGADAS para el equipo
  en la v6.15** (`PLANTILLAS_ACTIVAS=FALSE`), o sea **lo que iba a tapar este
  hueco está desactivado**: por eso el hueco sigue abierto. Su opción **D2
  (tres celdas previo → evento → queda con)** es casi exactamente lo que Diego
  está describiendo ahora, incluido el «queda con…» de su ejemplo.
  · 📖 **Su ejemplo de texto, textual (9-sep)**: «paciente en proceso de
  Weaning, cuadro agudo resuelto, sin sedación, GCS 11, HDN estable; hoy con
  mínimo soporte ventilatorio y en condiciones de realizar PVE, por lo que se
  realiza sin incidentes; posterior a eso se progresa a extubación programada
  según protocolo; evoluciona favorablemente hasta el momento. Queda con… todo
  deglución…».
  · ❓ **Lo que hay que separar al diseñarlo, porque su mensaje mezcla las dos
  cosas**: el **PANEL** anuncia el evento de entrada (primero «¿qué pasó con la
  vía aérea?», después el detalle), pero el **TEXTO** de su ejemplo va en orden
  CRONOLÓGICO y nombra la extubación al medio, no al principio. Confirmarle
  cuál quiere en cada lado antes de programar: son dos cambios independientes y
  el texto ya lo arma `genTexto` en ese orden.
  · 🔜 **Pendiente de dato, no de diseño**: preguntarle **qué cama/paciente
  fue**, porque esa evolución ya guardada sigue con `EXT_OCURRIO` en falso y
  con el tramo de VM abierto. Hay que repararla **antes de la estadística de fin
  de mes**, y de paso ver si hay más casos así (`auditoriaIntegridad()` no busca
  esta huella hoy — sería huella nueva).

- 🔴 📋 **LAS ESCALAS PRE-UCI NO SE APLICAN PORQUE NO SE VEN — PRD dictado por
  Diego (10-sep-2026).** Su historia, textual: el kinesiólogo recibe un ingreso
  y llena todo; **al día siguiente otro colega quiere aplicar una ECF «pero no
  sabe dónde, por lo tanto no lo aplica y se pierde el dato»**, y así hasta que
  el paciente egresa «y nunca se supo cuál era la escala clínica de fragilidad
  que el paciente traía». Lo llamó **«requisito diferenciador respecto a la
  planilla vieja»**. Pidió ideas; **no se programó nada**.
  · **Las escalas son tres y ya existen**: **Barthel** (`fBarthel`), **ECF** =
  escala clínica de fragilidad (`fEcf`) y **Charlson** (`fCharlson`), las tres
  con su calculadora 🧮 (`abrirEscala`). 🪤 Al dictar por voz «ECF» sale
  transcrito como **«cartel»** y «FCIQ»; es la misma escala.
  · 🔴 **EL PLIEGUE LO PIDIÓ ÉL, y ahora cobra.** El bloque `#fPreUci` está
  plegado desde ago-2026 por pedido suyo — el comentario del código lo dice:
  «se llenan UNA vez al ingreso y después solo estorban arriba del formulario».
  Se resume en `#fichaChip` («✏️ Editar ficha»). O sea **no es un olvido de
  diseño: es un intercambio que se dio vuelta** — plegado dejó de estorbar y
  pasó a costar el dato. Decirlo así cuando se retome, sin buscar culpable.
  · 🔑 **EL HALLAZGO QUE DESTRABA TODO: las tres escalas YA SON DEL EPISODIO,
  no del turno.** `BARTHEL`, `ECF` y `CHARLSON` son columnas de **CAMAS_ESTADO**
  (esquema ~315 y ~323, con el comentario «persisten con el episodio, se cargan
  al abrir»); en la evolución viajan como `PAC_BARTHEL`/`PAC_ECF`/`PAC_CHARLSON`.
  **Consecuencia**: medir una ECF **no necesita el modal de evolución** — el dato
  ya tiene su casa fuera del turno. Un botón en la tarjeta de la cama (donde ya
  viven Synapse y cobas) puede escribirla directo al episodio. Eso responde solo
  su problema 2.
  · **Lo que pidió en pantalla**: al ingresar, un módulo individual (nombre, RUT)
  y después el modal; arriba **una franja/banner a lo ancho** con los datos
  personales (y quizá los días de VM); y las escalas pre-UCI **detrás de un
  botón con ícono propio** que despliega al hacer clic — «un ícono diferenciador
  de ECF o de Barthel». 🪤 `#fPreUci` usa `display:contents`, así que **mover
  esos campos es cambio de presentación, no de datos**: siguen en el formulario
  y su valor viaja igual.
  · 🗂️ **DIEGO LO AMPLIÓ EL 10-sep A LA SEPARACIÓN EPISODIO / TURNO (voz)**:
  «hay datos que van al episodio y otros que son la evolución diaria… son dos
  cosas completamente distintas». Barthel, ECF y Charlson se miden **una vez**
  (pueden diferirse días). MRC, FSS-ICU, CPAx y Pimáx **se repiten** —«a los 7
  días debería volver a medir MRC»— y propuso columnas «MRC 1, MRC 2, MRC 3»
  ligadas al episodio, no al turno, **sin fecha fija** porque «hay veces que hay
  cambio clínico y uno lo puede evaluar antes». La **AET** también «podría ir
  al episodio, porque durante esa hospitalización se adecuó». Al turno le
  quedan «conciencia, hemodinámica, parámetros ventilatorios». Su motivación,
  textual: «se han perdido datos y eso me tiene bastante preocupado… ejemplo,
  las PVE y las extubaciones… ojalá poder solucionarle el problema al usuario,
  que sea mucho más intuitivo». Pidió **una tabla** de qué va a cada modal y
  el feedback de ventajas. 🪤 Por voz: «cartel» = ECF, «Richardson» = Charlson,
  «FC cinco / FS ESIQ» = FSS-ICU, «CPACS PIMP» = CPAx y PIM.
  · 📄 **La tabla está publicada, familia por familia con las columnas reales**:
  `https://claude.ai/code/artifact/271fd6dd-2be1-46fc-a6b8-5156ac997e00`.
  Tesis: **no son dos casas sino cuatro** — episodio (una vez) · **serie
  fechada** (N veces, cada una con fecha y firma) · **evento** (un hecho a una
  hora) · turno (cómo está hoy). Cuenta gruesa: ~un tercio de las 396 columnas
  no pertenece al turno; es justo lo que hoy se hereda en ámbar cada 12 h.
  · 🔑 **La conexión con sus pérdidas**: PVE, extubación, TQT, prono y decanulación
  son EVENTOS guardados como casillas de la fila del turno — por eso solo
  existen si el turno los marca (la cama 13). Como evento del episodio (el
  `TIMELINE` ya existe), la vía aérea solo cambia por evento y el REM y el reloj
  leen de ahí. Y las escalas como serie fechada hacen que el dato que falta **se
  vea faltando** (ícono pendiente), que es la única forma de que se mida.
  · **Sobre «MRC 1/2/3»**: recomendado guardar la FECHA y derivar el ordinal
  (1ª, 2ª, 3ª): sin tope, los 7 días son alerta y no candado
  (`EVAL_DIAS_ALERTA` ya existe), y la hoja UCI, la tarjeta y el «de egreso»
  del archivo salen de la misma lista. `ULT_MRC/ULT_MRC_FECHA/ULT_FSS/ULT_PIM`
  ya son «la última de la serie»: la serie es la generalización, no un invento.
  · 🔴 **ESTO ES LA RAMA `rediseno-formulario-bloques` v0.3** («ficha del
  episodio separada» + «evaluaciones fechadas en vez de columnas del turno»),
  pausada por Diego el 10-ago. La misma conclusión llegando por el terreno.
  Camino recomendado: **no el big-bang de la rama, sino por tandas, una casa a
  la vez**, cada una con su `crearORepararEstructura()` y su inventario de
  consumidores — ① series + banner con íconos (cierra ECF/Barthel/MRC-7-días,
  no toca ventilación) · ② eventos como fuente de verdad (cierra la cama 13; ES
  la tanda D y necesita sus respuestas del 2-sep) · ③ estado del episodio
  fuera del turno (cierra el ámbar) · ④ recién ahí reordenar el modal.
  · ❓ **Tres preguntas abiertas para pasar de la tabla al PRD**: si la línea
  fina de ventilación está bien (parámetros = turno; vía aérea y soporte =
  episodio y solo los cambia un evento — es lo más invasivo); cultivos como
  serie o como evento; y si se parte por la tanda ①.
  · ✅ **ACORDADO EL 11-sep — LA FIRMA VIAJA CON LA MEDICIÓN («dale»)**. Diego:
  «ocupamos el valor del colega pero debemos saber quién firmó… al lado de la
  fecha podrían salir sus iniciales, pero el dato lo ocupa cualquiera para sus
  fines». **Medido: hoy falta.** El episodio arrastra `ULT_MRC`+`ULT_MRC_FECHA`,
  `ULT_FSS`+`ULT_FSS_FECHA`, `ULT_PIM`+`ULT_PIM_FECHA` — **ninguna columna de
  quién**; la entrega imprime `MRC-SS 36 (02-09)` (`svc_entrega.gs:295`). La
  firma existe pero se queda en la fila de la evolución (`PLAN_FIRMA_KINE`):
  recuperable buceando, invisible donde se usa el dato. Queda
  `MRC-ss 36 · 02-09 · MCC`. **Sumado a la tanda de las escalas.**
  · 🔑 **REGLA QUE FIJÓ DIEGO: la firma es PROCEDENCIA, NO PROPIEDAD.** No
  restringe quién puede usar el valor —cualquiera lo cita para sus fines, que
  es lo correcto clínicamente—, solo dice de dónde salió. Y separa **dos firmas
  que hoy se colapsan en una**: quién MIDIÓ (MCC, 02-09) y quién EVOLUCIONA hoy
  citándolo. 🪤 Sin login, esas iniciales son la firma DECLARADA en el
  formulario, no una identidad verificada (lo resolvería el PRD de la PWA).
  · ✅ **Y EL PUNTO 4 (el registro firmado) SE CAYÓ — se da vuelta, 11-sep.**
  Diego lo rebatió con clínica («el paciente tenía un MRC de 33 de hace varios
  turnos; ese número es el que tengo y el que me sirve») y el código le da la
  razón: `EVAL_FECHA: v('gDate')||hoy()` (index ~7011) graba **la fecha del
  TURNO, no la de la evaluación**, así que hoy la fila heredada ya afirma «MRC
  33, evaluado hoy, firmado por mí» cuando se midió hace cinco turnos y otra
  persona. **La foto firmada YA está retocada y la serie es la que la arregla**:
  el valor queda una vez con su fecha y firma reales y la evolución lo CITA.
  Lo único que queda de la objeción lo cubre la regla madre (una corrección no
  reescribe el texto de una evolución vieja).
  · 🔴 **CORRECCIÓN CLÍNICA DE DIEGO QUE CAMBIA EL MODELO (11-sep): la ECF, el
  Barthel y el Charlson NO son serie.** «La escala clínica de fragilidad no va a
  cambiar durante la estadía, es la que es, porque es previa a la UCI; si hay
  alguna corrección se corrige el mismo dato, no sería un dato nuevo.» O sea son
  **dato único corregible del episodio** (estado pre-UCI), y solo MRC, FSS,
  CPAx, Pimáx y mecánica respiratoria llevan historial fechado. Yo las tenía
  como serie en la tabla: **estaba mal** — habría dejado tres ECF del mismo
  paciente sin saber cuál vale. El criterio de si algo lleva historial es
  clínico, no técnico.
  · ✅ **Y SU PREGUNTA CLAVE RESPONDIDA: el vínculo es el EPISODIO, y ya existe.**
  La hoja `TIMELINE` ya tiene `ID_HITO · ID_CAMA · **PATIENT_ID** · FECHA ·
  TURNO · TIPO · TEXTO · AUTOR · AUTOR_EMAIL · TIMESTAMP`, y
  `_reetiquetarEpisodioACama` ya la re-estampa en los traslados: la amarra está
  probada. **Lo que falta no es el vínculo sino el DETALLE** — hoy el hito
  guarda TEXTO libre; para ser fuente de verdad necesita los datos
  estructurados al lado (hora, tipo, con qué queda, motivo). Es una columna
  nueva en esa hoja, no una hoja nueva. 🪤 `PATIENT_ID` amarra dentro de UN
  episodio: un re-ingreso estrena pid, así que unir a la PERSONA entre
  episodios es el RUT — el pendiente que él mismo dejó en la auditoría.
  · ❓ **SU PROBLEMA 2, RESPONDIDO CON PRECISIÓN** («si uno quiere solo hacer ECF
  igual abre el modal completo y puede causar pérdida de información respecto a
  la evolución anterior»). Verificado: **la evolución anterior NO se puede
  pisar** — `fillFormReplica` solo PRE-LLENA el turno de hoy desde la previa, y
  el guardado escribe en la fila del turno actual. Pero hay **dos riesgos reales
  y son otros**:
    ① **Turno nuevo**: abrir y guardar solo para anotar una escala **fabrica una
    evolución completa que nadie evaluó** — todo lo heredado (sedación,
    hemodinamia, ventilación) se guarda como si fuera de hoy. No se pierde el
    ayer: se inventa el hoy, que para la estadística es peor.
    ② **Reabrir una evolución YA GUARDADA**: los botones no heredables se
    desmarcan y hay que re-marcarlos a mano. 🔴 **Eso choca con el punto 9, que
    él mismo cerró el 5-sep con «déjalo como Manuel»** — y una escala es
    justamente el motivo por el que alguien reabriría una evolución guardada.
    **Al retomar esto hay que reabrir el punto 9 con él.**

- ✅ 🔔 **Buzón + campana: PROGRAMADOS en la v5.91** (4-sep; Diego aprobó el
  mockup y fijó el formato de alerta «HME vencido (fecha en que vence) ·
  cama 7 · rótulo 31-08» y la regla del registro: de SOLO AGREGAR, nada se
  pisa — hoja NOTIFICACIONES + guardia buzon_campana). Esperando su prueba
  en la mañana. Pendiente del área: el «aviso de coordinación» desde 🔐.
  Historia original:
- 🔔 **Buzón de notificaciones + campana de alertas en la barra superior**
  (pedido de Diego, 4-sep-2026). ✅ **Reparto APROBADO por Diego el 4-sep**
  («okye me parece»): la **campana** agrega lo
  que la app YA calcula regado por las vistas (HME/Trach Care vencidos,
  evaluaciones envejecidas >EVAL_DIAS_ALERTA, VM en cama sin ventilador
  ~13901, mantención por vencer ~13729, cierre de año) — se limpia sola al
  resolverse porque es cálculo en vivo, sin estado de leído; el **buzón**
  lleva lo humano (notas 📌 del turno, cumpleaños, avisos de coordinación,
  «se publicó vX.Y») con leído/no-leído POR NAVEGADOR (localStorage; no hay
  login, así que no puede ser por persona). Nada sale por correo. ✅ **Día uno
  APROBADO por Diego (4-sep)**: notas 📌 + cumpleaños + avisos de versión.
  ✅ **El «aviso de coordinación» quedó PROGRAMADO en la v5.96** (5-sep,
  «prográmalo»): tarjeta 📣 en el panel 🔐 con sesión activa → COORD_AVISO
  (exige la sesión EN EL SERVIDOR, como toda COORD_*) → tipo `coord` en el
  buzón con la firma; guardia 3d en buzon_campana. **Siguiente paso: mockup de la barra con campana y buzón**
  (enviado, esperando su OK visual antes de programar).

- ✅ 🏷️ **Filtros: declarar LO QUE VENCE HOY — RESUELTO en la v5.87** (4-sep,
  Diego eligió la opción B del mockup). Al programarla apareció que el chip
  del formulario (`calcInsumosDias`) era un QUINTO consumidor que la
  corrección del 10-ago no alcanzó: avisaba una noche TARDE (`d===dur` en vez
  de `frec-1`), contradiciendo al panel «Cambios de esta noche» — probable
  raíz de la confusión. Detalle en BITACORA v5.87; guardias `disp_fecha`,
  `dispositivos_reglas` y `hepa_fijo_y_orden_texto` alineadas. Historia
  original del pedido:
  (pedido de Diego, 4-sep-2026, con PRD dictado). Su rutina real: él sabe
  qué FECHAS DE ETIQUETA caducan hoy y recorre el libro buscando
  coincidencias — hoy 03-09 vence el HME etiquetado 02-09 (día 2) y el
  Trach Care/HEPA etiquetado 01-09 (día 3); lo nuevo se etiqueta 04-09
  porque el cambio es en la madrugada del día siguiente. **La aritmética de
  su ejemplo CUADRA con las reglas vigentes de la app** (HME día 2, Trach
  Care/HEPA día 3, cambio nocturno): no cambia ninguna regla, cambia la
  REDACCIÓN. Textual: «no me interesa con qué fecha debería quedar… se ha
  prestado para confusión». En el apartado de filtros del formulario, en
  vez de proyectar la fecha futura de cambio («Cambio: 04-09»), declarar la
  coincidencia como en el libro: «vence hoy lo etiquetado el 02-09». El
  panel «Cambios de esta noche» (GET_CAMBIOS_NOCHE) ya hace la lista por
  cama y se mantiene. Mockup/opciones enviadas, esperando su elección.

- ✅ 🎂 **Pose cumpleañera de Don Mauri: APROBADA e INTEGRADA en la v5.90**
  (4-sep). Es la pose `festejo` de Diego con gorro/confeti compuestos encima
  — novena pose `cumple` en `MAURI`; con la mascota persona reemplaza al
  emoji-gorro (que queda solo para Servi). Guardia en nota_synapse_cumple.

- 🔴 **Tandas C y D (eventos manuales + reintubación) — DETENIDAS EN EL
  MOCKUP esperando 4 respuestas** (2-sep-2026; Diego pidió «recuérdamelo
  después», estaba en capacitación). Mockup publicado:
  `https://claude.ai/code/artifact/52e36ecd-92dc-404e-9ce0-3b212be81f70`.
  Ya decidido por él: A+B ejecutadas (texto tal cual + REM conciliación,
  v5.85 en `develop`/`main`), y **el evento manual SÍ entra en el texto de
  la evolución**. Falta que elija: ① Tanda C: ¿C1 bloque «📌 Eventos del
  turno» (recomendada) o C2 botón al costado? ② Tanda D: ¿D1 fila de pills
  bajo Vía aérea (recomendada), D2 tres celdas previo→evento→queda, o D3
  casilla mínima? ③ Alcance de D: ¿la fila reemplaza también
  intubación/extubación o SOLO reintubación? ✅ La ④ ya la respondió
  (4-sep-2026): **el catálogo de motivos de `fReintubRaz` está bien como
  está**. Ojo: la barra de plantillas absorbe la fila de eventos de la
  tanda D, así que ② y ③ probablemente mueren con ella — confirmarlo al
  programar. Con lo que falte se programa (guardias
  nuevas para ambas tandas; las columnas REINTUB_* y el tiempo extubado se
  conservan tal cual). Pendiente hermano: cifras del REM de papel de agosto
  para correr la conciliación.
- 🖋️ **CÓMO SE VEN LAS PLANTILLAS EN TRAKCARE — detalle de terreno de Diego
  (2-sep-2026), para cuando se retome el diseño de la selección**: el ícono de
  plantillas está en la **esquina inferior derecha del cuadro de texto**; ahí
  aparecen todas, codificadas. Para **agregar una nueva se SELECCIONA texto**,
  lo que habilita un **botón verde en la esquina inferior izquierda** que
  permite personalizarla. Su idea propia encima: que lo que la app ya sabe
  **aparezca como sugerencia al dejar un espacio para autocompletar**.
  · **La otra opción que él plantea**: que salga la evolución personalizada (o
  la de la unidad por defecto) y que **abajo se pueda formatear con el formato
  personalizado por evento**, ya que viene con información prellenada.
  · 🔴 **«Esto es lo que más me está complicando por ahora — déjalo para el
  último.»** O sea: el CATÁLOGO de plantillas por caso se puede ir armando,
  pero **CÓMO SE SELECCIONAN es la tarea abierta** y no se programa hasta que
  él lo cierre.
- 🆕 **Plantillas de evolución tipo TrakCare** (2-sep-2026, idea de Diego
  desde una capacitación). **Diego ya eligió: la B** (plantilla personal con
  comodines) **fusionada con la A** — «plantillas personalizadas desplegadas
  por caso… eso igual es personalizado». O sea A y B dejan de ser dos
  caminos: una plantilla es **de una persona Y tiene un caso que la ofrece**.
  Mockup con la evaluación de TrakCare y el diseño:
  `https://claude.ai/code/artifact/f812cb92-ac90-4950-bc5c-e91188b378d0`.
  Sus dos casos, textuales: ① **barra de chips arriba, «al estilo donde
  están las fases»**, para elegir evento o plantilla — el evento/fase
  **pre-selecciona** la plantilla (esto **absorbe la fila de eventos de la
  tanda D**); ② **la cama asignada a un colega evoluciona con la plantilla
  que él definió** — la cañería ya existe: el tablero de turno reparte
  camas→firma y el formulario abre con esa firma (`renderFases`/Turnos,
  index ~11711 y ~10312). Regla de oro que él fijó: **«el formulario aporta
  datos que son rellenables, lo demás es narrativa»** — el comodín se
  rellena solo, a diferencia de TrakCare.
  · 🔍 **Lo que se aprendió mirando el TrakCare real** (fotos del ambiente
  UAT, módulo `epr.CannedText`): es una biblioteca de textos enlatados con
  **huecos literales que el médico rellena a mano** («Paciente se reintuba a
  las **x** hrs por **motivo**»); **inserta crudo al cursor** (quedó
  `holaPaciente se reintuba…`, sin espacio ni mayúscula); alcance por
  usuario («Guardado por / Guardado para: Usuario»), lo que confirma los dos
  estantes; códigos crípticos por iniciales (`RHMAB1`, `iUEH`, `LGM1`) y
  lista paginada sin filtro; y **los typos guardados se replican** en cada
  ficha («embaazada», «compromispo», «anamanesis»). De ahí salen cinco
  no-objetivos y sus guardias futuras.
  · **Cerrado el 2-sep**: varias plantillas **por caso Y por colega**; el
  catálogo **se filtra al seleccionar la cama** (primero las del colega
  asignado, luego las de la unidad, y las **de otros colegas al final** —
  se pueden usar igual); usar la plantilla de otro NO cambia la firma.
  · 🔴 **Corrección clínica de Diego**: «el proceso de weaning es un proceso
  largo, **no siempre define extubar**». O sea **la fase es del PACIENTE**
  (dura semanas, se hereda) **y el caso de la plantilla es del TURNO**. Un
  caso «Weaning» a secas estaba mal. Catálogo propuesto de 13 casos anclado
  a lo que el formulario YA registra: VM sin destete (`PVE_VAL='nc'`) ·
  Destete diferido (`PVE_VAL='no'` + una de las 9 razones de `fPveSCraz`) ·
  PVE fracasada (`PVE_RESULTADO='frustra'`) · Extubación (`'superada'`) ·
  Post-extubación · Reintubación · TQT · Destete por TQT · Decanulación ·
  Ingreso · Prono · Rehabilitación · Sin novedades.
  · 🔑 **Decisión de diseño para que el catálogo no explote**: el grado del
  destete NO abre casos nuevos, viaja como comodín `{weaning_grado}`. La
  app ya lo calcula en **`_weanClase`** (index ~4513): *difícil* = ≥1 PVE
  fracasada, *prolongado* = ≥3 fracasos o >7 días desde la 1ª PVE; hoy solo
  pinta la tarjeta de cama.
  · ✅ **TODO CERRADO por Diego el 2-sep**: el catálogo de 13 casos está
  bien (si faltan, avisa después) · **«PVE superada sin extubar» SÍ existe**
  (ver la regla clínica más abajo) · cada colega edita las suyas y hay **un
  juego de la unidad** de respaldo «por si alguien no quiere», editable
  **solo por coordinación** · **la barra SÍ reemplaza la fila de eventos de
  la tanda D** («así anunciamos de entrada qué plantilla utilizaremos por
  defecto»).
  · ✅ **Confirmado por Diego el 4-sep-2026**: los motivos de «PVE superada
  sin extubar» del PRD **están bien**, y el catálogo de motivos de
  reintubación actual también. Esas dos preguntas quedan cerradas.
  · ✅ **Cerrado por Diego el 4-sep-2026 — el EDITOR de plantillas tiene DOS
  puertas** (eligió la opción 1): un ícono en el cuadro de texto de la
  evolución (como TrakCare, abre con el caso actual preseleccionado) Y una
  sección «Mis plantillas» para gestionarlas todas. Reglas de configuración
  propuestas y aceptadas con esa elección: nadie parte de página en blanco
  (duplicar la de la unidad/colega, o «guardar esta evolución como
  plantilla»); comodines SOLO por menú, jamás tipeados (typo = plantilla
  rota en silencio, lección TrakCare) y un comodín desconocido rechaza el
  guardado; vista previa obligatoria con paciente de ejemplo; nombre
  legible + caso obligatorio; la primera carga son las 13 de la unidad ya
  redactadas. ✅ **La SELECCIÓN quedó decidida el 5-sep: BARRA DE CHIPS,
  «por mientras»** («la selección de plantilla… como chips, por mientras, y
  después lo vemos con posterioridad») — la tanda 3 quedó desbloqueada; la
  evolución-tipo automática queda en el banco para revisarla después.
  · 📄 **Los dos PRD ya están escritos y esperan su visto bueno**:
  `PRD_PLANTILLAS_EVOLUCION.md` y `PRD_PVE_SUPERADA_SIN_EXTUBAR.md` (con
  historia, no-objetivos, flujo hoy→mañana, inventario de consumidores y
  pseudo-código). Leerlos ANTES de programar nada de esto. Versión leíble
  publicada: `https://claude.ai/code/artifact/b2d465e8-b327-4632-a631-48af529f8631`.
  · 🖥️ **Mockup de las 5 pantallas** con la piel real del formulario (barra
  de chips, catálogo por cama, texto resultante, la pregunta «¿se extubó?»
  y el editor de plantillas):
  `https://claude.ai/code/artifact/3cb8491a-cc2b-4a74-bad3-a343b9998722`.
  · 🧪 **PROTOTIPO EN VIVO en la rama `prototipo-plantillas-evolucion`**
  (2-sep; Diego: «verlo en vivo pero que no tope nada de lo hecho por
  Manuel… mejor es editarlo con una construcción»). **NO se fusiona a
  develop ni a main hasta que él lo apruebe; NO se pega en el editor.**
  Página de prueba (la app real + puente simulado + 4 camas de mentira, sin
  RUT): `https://claude.ai/code/artifact/c0d501cf-6c88-4880-9a37-4c34ae7a935c`
  — se regenera con `node build/prototipo_plantillas.js <salida.html>`.
  Trae la barra (evento + plantilla, con interruptor a una sola fila por su
  duda «mucho chip, mucha información»), el catálogo por cama en tres
  estantes, la sugerencia en ámbar, el editor de plantillas y la regla
  madre (con texto tocado o guardado se pregunta antes). **Los comodines
  son los bloques del motor** (`_B()` de `genTexto`): el dato sigue
  saliendo del único motor, que es lo que sostiene la paridad. Sin catálogo
  cargado la barra no existe: producción no cambia. Batería en la rama:
  108 verdes; `paridad_v3` roja A PROPÓSITO (el espejo de producción no se
  regenera en un prototipo). 🪤 El modo de presión de soporte se llama
  **`CPAP/PS`** en la app, no «PSV»: un dato de prueba con «PSV» deja los
  parámetros vacíos sin avisar.
  · Regla madre intocable: nada pisa texto tocado o guardado (v5.85). Sin
  cambio de esquema en EVOLUCIONES: hoja-catálogo aparte. **La opción C
  (frases rápidas) queda en el banco**, no descartada.
- ✅ **HEPA fijo en PB y Avea: RESUELTO en la v5.60** (14-ago, con las tres
  respuestas de Diego: instalación como referencia sin cambio · la Vela sigue
  con ciclo · sin ventilador no aplica HEPA). La regla vive en
  `_hepaFijoEquipo` + `_dispAplicaCama` contra CONFIG `HEPA_FIJO_EQUIPOS`
  (defecto `PB,Avea`, por prefijo, editable sin código). Detalle en la
  bitácora; guardia `dispositivos_reglas.js`.

- ✅ **FSS-ICU · el «no evaluado»: RESUELTO en la v5.95** (5-sep; Diego citó
  el manual y la fuente oficial —improvelto.com— lo confirma). Opción «NE»
  por ítem; hasta 2 NE se imputan con el promedio (redondeado), con más de 2
  el total no se calcula; el 0 queda solo para debilidad real. La RAZÓN del
  NE no se anota (el manual no la exige); si algún día se quiere, es campo
  nuevo. Guardia fss_ne.js.
- ✅ **MR850 (punto 6 del brainstorm): SON 4, categoría APOYO** (Diego,
  14-ago) — 1 en la cama 2 y 3 en bodega. Falta solo la acción de DATOS en el
  tablero: dar de baja la única cargada con nombre propio y crear el stock por
  cantidad con su reparto (el stock sin numerar existe desde la v5.17 y va a
  camas desde la v5.18).
- **`PRD_PUBLICAR_SIN_PC.md`** — cuatro decisiones, la primera es dónde vive la
  credencial de Google (alcanza al Drive, o sea a la planilla con los RUT).
- 📲 **`PRD_PWA_Y_LOGIN_REAL.md`** (8-sep-2026, lo pidió Diego) — servir la
  pantalla desde un sitio propio para que se instale como app, dejar Apps Script
  solo entregando datos, y exigir identidad real de Google para escribir. **NO
  programado**: espera dos respuestas de informática (¿el hospital permite un
  dominio externo? ¿hay correo institucional?) y cuatro decisiones de Diego.
  Publicado: `https://claude.ai/code/artifact/6fadea55-7e67-43d9-ae49-3cdd7455e1b6`.
  🔑 Lo que hay que tener claro antes de retomarlo: **la base de datos NO se
  mueve** —sigue en la planilla y Apps Script sigue siendo el único que la
  abre—; lo único que cambia es quién sirve la pantalla. El transporte del
  cliente vive en UN solo sitio (`api(accion,datos)`, index ~4736: cuatro
  menciones de `google.script.run` en 13.000 líneas), así que el costo real son
  **las 73 guardias con navegador** que simulan ese puente. Y el riesgo nuevo es
  el reintento: una llamada por internet puede escribir dos veces, así que toda
  escritura necesita número de petición. **PWA sin login real no se hace: son la
  misma tanda.**
- **MRC**: la leyenda usa la graduación estándar. Si el protocolo de la unidad
  tiene otra redacción, se cambia en un solo lugar.

### Anotado y NO programado (pedido explícito de Diego)

- ✅ 📋 **MRC/FSS pendientes con MOTIVO: PROGRAMADO en la v5.94** (5-sep;
  Diego: «es sedación/cooperación… decide tú dónde»). El motivo se DERIVA de
  `ULT_COOP`, sin campo nuevo: cooperador sin medir = campana + tooltip +
  motivo en la entrega («evaluable desde ya»); no cooperador = badge gris
  «no evaluables aún» con la cooperación registrada, SIN campana (no es
  olvido). Detalle en BITACORA v5.94. Sigue abierto el pendiente HERMANO del
  FSS-ICU «no evaluado» (distinguir «incapaz por debilidad» = 0 real de «no
  se pudo evaluar», con la regla del promedio hasta 2 ítems).
- ✅ 🫁 **Pimometría pendiente: PROGRAMADA en la v5.93** (5-sep). Regla:
  VM + CPAP/PS + soporte bajo PIMO_PS_MAX (CONFIG, 14) + (destete prolongado
  por Boles 2007 —espejo `_weanClaseSrv` de `_weanClase`— o VM ≥
  PIMO_VM_DIAS días, CONFIG, 21 por NAMDRC 2005) + sin Pimáx del episodio
  (`ULT_PIM`, arrastre nuevo en CAMAS_ESTADO). Se apaga al registrar fPIM.
  Literatura revisada a pedido de Diego: VM prolongada = ≥21 días (NAMDRC);
  destete prolongado = >7 días desde la 1ª PVE o ≥3 fracasadas (Boles/WIND)
  — su «>7 días» era el del destete. Detalle en BITACORA v5.93.

- 🔴 🧍 **SBC EXIGE FSS-ICU — regla clínica de Diego (9-sep-2026, textual):
  «PARA REGISTRAR SBC DEBE TENER NECESARIAMENTE FSSICU».** Anotada a pedido
  suyo **para programarla después**: no se tocó código.
  · **Qué es cada cosa, confirmado en el código**: SBC es el **nivel 3 de KTM**
  (`KTM_NIV_DESC['3']` = «Sedente al borde de cama (SBC)», index ~12374), y el
  **ítem 3 del FSS-ICU se llama igual** («Sedente borde cama», `fFssIt3`,
  index ~4590). O sea la regla no une dos cosas distintas: dice que si el
  colega declara que el paciente se sentó al borde de la cama, esa misma
  actividad tiene que quedar puntuada en la escala.
  · **Dónde vive el dato hoy**: el nivel es `fKTMniv` → `KTM_NIVEL_KTR`
  (EVOLUCIONES) y `KTM_NIVEL` (CAMAS_ESTADO, que lo arrastra); el FSS son los
  cinco `fFssIt1..5` → `sumFSS()` → `fFSS` → `EVAL_T_FSS` (entero).
  · 🔴 **Inventario de consumidores** (la sección «los datos» del PRD; sin esto
  se repite el error de los filtros): formulario (catálogo ~12369, `setKTMniv`
  ~12380, `sumFSS` ~13941, lectura del nivel ~16141) · texto narrativo
  (`dominio_texto.gs:514` narra el nivel, `:584` narra el FSS) · **hito motor de
  la entrega** (`svc_entrega.gs:621-634`, donde el peldaño SBC sale del nivel
  KTM) · hoja UCI (`_HJ_FSS_ACT` ~8817, fila `fss` ~8673) · egreso
  (`svc_camas.gs:235-239`, que arrastra el FSS al alta) · indicadores
  (`esquema.gs:878`, MOTOR/KTM_NIVEL).
  · 🪤 **`fKTMniv` YA tiene una cascada encima**: con SAS 1 se limpia si no es
  '1' (index ~13496). Cualquier validación nueva tiene que convivir con la
  tabla `_CASCADAS` de la v6.19 (que deshace lo que una cascada escribió si el
  control vuelve a su valor de origen), o se pisan entre las dos.
  · ❓ **Las dos preguntas que hay que hacerle a Diego ANTES de programar** —no
  se le preguntaron ahora porque pidió dejarlo anotado—: ① ¿el FSS tiene que ser
  **del mismo turno**, o basta el **del episodio** aunque sea de días atrás? El
  FSS-ICU no se mide todos los turnos, así que exigirlo por turno cambia mucho
  el trabajo del colega. ② ¿**bloquea el guardado** o solo **avisa** (campana,
  como la pimometría y las MRC/FSS pendientes)? Su «necesariamente» suena a
  bloqueo, pero eso hay que confirmarlo antes de escribirlo.
  · 🪤 Si se programa como bloqueo, el candado va **en el servidor además del
  cliente** — como toda regla de este proyecto, el espejo del cliente solo
  guía, no protege.

- 🧠 **Brainstorm de terreno** — 9 puntos, en `BITACORA.md`. Resueltos el 1, 2,
  3, 4, 5 y 7. **Abierto: solo el 6** (MR850, acción de datos). El 9 quedó
  CERRADO el 5-sep («déjalo como Manuel») y **el 8 quedó RESUELTO en la
  v5.97**: Diego lo afinó a «información que no sume a estadística pero que
  aparezca en la evolución» → bloque 📌 Anotaciones del turno (BITACORA
  v5.97). El ➕ de Manuel queda intacto para anotar sin abrir el formulario. OJO con el
  8: su comentario de voz («marcar un hito no cuenta en las estadísticas, es
  historia narrativa») describe cómo CREE que funciona — pero HOY los eventos
  y procedimientos manuales SÍ van a la estadística además del hito; el punto
  8 es justamente poder separarlos. Aclarado en el mensaje, esperando su
  decisión con los puntos a la vista.
- ✅ **Punto 9 · CERRADO por Diego el 5-sep-2026: «déjalo como Manuel»** — se
  mantiene la decisión de Manuel del 9-ago: al reabrir una evolución guardada
  los botones no heredables se desmarcan y se re-marcan a mano si hace falta.
  No se programa nada. (Si vuelve a molestar en el uso, se retoma como PRD
  con la pregunta de qué botones conservar.)
- **Prono / posicionamiento / HSA** — diseño conversado, falta que Diego mande
  el protocolo HSA de la unidad para poder programarlo.
- **Stock de cánulas TQT** — aprobado en concepto, faltan inventario y umbrales.
- **Mi estilo** (evolución personalizada por colega) — diseño cerrado, esperando
  material: ~20-30 evoluciones editadas por persona. ⚠️ **Lo reemplaza el
  `PRD_PLANTILLAS_EVOLUCION.md`**: con plantillas declaradas por cada uno ya no
  hace falta juntar ese material.
- **Guardado por bloques** — analizado y descartado por ahora, con los números
  en la bitácora. Reabrir solo con datos nuevos de uso.

**Pedidos nuevos del 2-sep-2026 (solo anotados, sin diseño ni código):**

- 🖼️ **Enlazar Synapse para ver imágenes.** Synapse (el visor de imágenes) **no
  aparece en ninguna parte del proyecto**: es integración nueva, no un ajuste.
  Lo que Diego confirmó el 2-sep: **se usa en Chrome**, es una instancia
  **alojada fuera del hospital** (`sscssl.synapsetimed.cl`), y **exige su propio
  usuario y contraseña** con una pantalla de inicio de sesión tipo STS.
  🔴 **Las credenciales NO se guardan en este repo ni en el código** (el repo es
  público y el historial no se borra). Hoy se entra con **una cuenta compartida
  del servicio**, lo que además significa que no queda registro de quién miró
  qué: es decisión de Diego y de informática, no del proyecto.
  · 🪤 **MEDIDO, NO SUPUESTO — SYNAPSE NO SE PUEDE EMBEBER** (2-sep-2026).
  Diego preguntó si se podía verlo dentro de la app. Se le mandó una página de
  prueba con un iframe y la corrió en el Chrome del hospital. La consola:
  `Refused to display 'https://sscssl.synapsetimed.cl/' in a frame because it
  set 'X-Frame-Options' to 'sameorigin'`. O sea **solo se deja mostrar dentro de
  su propio dominio**: no es configuración nuestra ni permiso que se pueda
  pedir, lo decide su servidor. Explica además por qué BUDA lo ABRE en vez de
  incrustarlo. **No volver a proponer iframe, «SPA» ni visor embebido.**
  · 💡 Aclaración que hubo que hacerle: **el RCE ya ES una SPA** (un solo
  index.html con pestañas que cambian sin recargar). Ese término no da la
  capacidad de mostrar otro sitio adentro; lo que haría falta es un iframe, y
  está bloqueado.
  · **Consecuencias de diseño, ya firmes**: lo realista es un botón que abre
  Synapse en otra pestaña. Y el enlace que se usa a mano lleva un **token de
  sesión** en la dirección — pero Diego verificó (4-sep) que **al caducar
  redirige solo al inicio de sesión**: «es un click más pero vale la pena».
  O sea el enlace con token TAMBIÉN sirve como enlace fijo; para
  `CONFIG.SYNAPSE_URL` da lo mismo cuál se pegue, la URL base sigue siendo
  la más limpia.
  · ✅ **HALLAZGO DE TERRENO (8-sep-2026, Diego lo usó en su turno): el botón de
  Synapse YA SIRVE COMO COPIADOR DE RUT PARA CUALQUIER OTRO SISTEMA.** «Me
  ahorré el clic del RUT con el botón de Synapse… solo seleccionaba el ícono del
  paciente que quería revisar, con la otra plataforma abierta, y así acceder de
  forma más expedita.» O sea el valor no estaba en abrir Synapse: estaba en
  **copiar el RUT**, y eso vale para el LIS, para BUDA o para lo que sea.
  · 🔜 **Fricción que quedó a la vista**: hoy, para copiar el RUT hay que abrir
  una pestaña de Synapse **aunque no se quiera**. Falta un atajo que SOLO copie.
  Sin programar: esperando que Diego elija (botón aparte vs. lista de atajos en
  CONFIG, cada uno con nombre y URL; URL vacía = solo copia).

- ✅ 🧪 **LIS del laboratorio (cobas): PROGRAMADO en la v6.21, con su logo en la
  v6.22** (9-sep-2026). Botón con la marca de **cobas** en la tarjeta de la
  cama, al lado del de Synapse: copia el RUT y abre el laboratorio. El ícono va
  dibujado a mano en SVG, como la «A» de Synapse. 🪤 **Un ícono con texto
  adentro se mira AMPLIADO antes de darlo por bueno**: a 17 px «se ve bien»
  cualquier cosa, y en la primera pasada la palabra se salía del marco. 🔴 **La dirección NO se escribe en este repo** (es una IP interna
  del hospital y el repo sigue siendo público): vive en **`CONFIG.LIS_URL`**, que
  nace vacía en `esquema.gs` — sin ella, no hay botón. La guardia lo verifica de
  forma estática, para que nadie la escriba «de paso».
  · 🪤 **MEDIDO EN EL HOSPITAL (9-sep)**: solo lo usaban en Firefox porque así
  quedó en los escritorios, y **nunca lo habían intentado en Chrome**. Diego lo
  probó y **carga — pero tuvo que instalar una extensión**. O sea el botón
  funciona en SU equipo; en un PC sin esa extensión la pestaña puede no servir.
  **Falta preguntarle a informática si esa extensión se puede desplegar en los
  PC de la unidad, y cuál es** (una extensión con permisos amplios también lee
  las páginas que el colega abre, incluida esta app con datos de pacientes: es
  decisión de ellos, no del proyecto).
  · **Por eso el copiado va PRIMERO, siempre**: aunque la pestaña falle, el RUT
  queda en el portapapeles y se pega en el Firefox de al lado. El portapapeles de
  Windows es uno solo. Es la misma trampa del 4-sep con Synapse: `window.open`
  consume la activación del clic y el copiado posterior falla en silencio.
  · **Una página web no puede elegir en qué navegador se abre un enlace**:
  `firefox://` no es estándar y un manejador propio en cada PC es proyecto de
  informática. Si el LIS terminara siendo solo-Firefox, el botón igual sirve
  para copiar.
  · 🔴 **Y un límite de arquitectura que conviene tener escrito**: el servidor
  **NUNCA va a poder leer del LIS**. Es una IP interna del hospital y nuestro
  servidor corre en los computadores de Google, fuera de esa red — solo el
  NAVEGADOR de un PC del hospital llega ahí. Por eso los gases se importan desde
  una carpeta de Drive y no del LIS, **y eso no cambia con la PWA**: la PWA mueve
  la pantalla, no el servidor.

  · **Truco sin código que da el «verlos juntos»**: abrir Synapse en una segunda
  ventana de Chrome y usar ⊞ Win + ← / ⊞ Win + → para dejarlos lado a lado.
  · 🔑 **CÓMO FUNCIONA HOY, contado por Diego (2-sep)**: Synapse **ya está
  integrado en BUDA**. Hace clic en «Imaginología» y **entra directo, sin pedir
  usuario ni contraseña** (probablemente SSO o por IP del hospital). Lo único
  que NO hace es **copiar el RUT**: eso lo teclea a mano cada vez. Su pedido es
  «lo más similar a eso».
  · ✅ **La parte que SÍ se puede hacer, y es justo el paso que él repite**:
  **copiar el RUT al portapapeles con un clic**. La app ya copia al
  portapapeles en dos lugares (`copiar()` con `execCommand`, y el informe REM
  con `navigator.clipboard`), así que la técnica está probada aquí dentro.
  Flujo propuesto: ícono 🩻 en la tarjeta del paciente → **copia el RUT** y
  **abre Synapse en otra pestaña** → él pega. Chrome ya tiene guardada la
  credencial. 🔴 El RUT viaja al portapapeles del propio equipo, **nunca en la
  URL ni a ninguna exportación**: la regla se respeta.
  · **Lo que falta preguntar a informática o al proveedor**: si la instancia
  admite enlace directo al paciente o al estudio (Synapse suele tener uno con
  parámetro) y con qué identificador. Con eso el clic llevaría directo a las
  imágenes; sin eso, el flujo de arriba ya ahorra el tecleo. 🔴 Si ese parámetro
  fuera el RUT, **no va en la dirección**: el RUT no sale de la app.
- 🩸 **La GSA arterial se copie sola a la hoja de registro diaria.** 🪤 Precisión
  verificada: la fila de GSA **YA EXISTE** en la hoja diaria (`gsa` en `HJ_F`,
  index ~7939, se pinta con `GSA_TOMADA`) y el formulario ya guarda pH, PaO₂,
  PaCO₂, HCO₃, EB, lactato, SaO₂, FiO₂ e interpretación. Lo que falta **no es la
  fila: es la captura automática**.
  · **Formato confirmado por Diego (2-sep): se descarga del sistema en PDF**, y
  se puede dejar en una carpeta o un lugar fijo.
  · 🔴 **Preguntar ANTES de programar el camino difícil**: ¿el sistema exporta
  también **CSV, TXT o HL7**? Apps Script no lee PDF; habría que convertirlo con
  el OCR de Drive y sacar los valores con expresiones, que se rompe en silencio
  el día que cambie el formato del informe. Un CSV hace el trabajo diez veces
  más confiable. Los analizadores de gases habituales exportan texto.
  · **Confirmado por Diego (2-sep): el informe de GSA trae NOMBRE y RUT.** Con
  eso el emparejamiento deja de ser una adivinanza, y **la cañería ya está
  escrita**: `episodiosPorRut()` (`svc_camas.gs:676`) busca un RUT en
  CAMAS_ESTADO (camas ocupadas) **y** en ARCHIVO_PACIENTES (egresados) y
  devuelve el episodio; se escribió para el aviso de reingreso y sirve igual
  aquí. Normaliza con `_rutNormal()` (quita puntos y guión, K mayúscula), así
  que el formato con que venga en el PDF no importa.
  · 🔑 **`rutValido()` (módulo 11) es un verificador de OCR gratis**: si la
  lectura del PDF equivoca un dígito del RUT, el dígito verificador lo caza casi
  siempre. Convierte el campo más peligroso del parseo en el más seguro — si el
  RUT no valida, el archivo va directo a «sin emparejar» y no se escribe nada.
  · **El RUT se usa para emparejar y NO se escribe** en EVOLUCIONES: la regla
  del `PAC_RUT` transitorio ya existe y aplica igual. El PDF sí es dato
  identificable (nombre + RUT), así que su carpeta de Drive va restringida.
  · **Confirmado por Diego (2-sep): el informe trae la fecha cronológica de la
  toma y su horario.** Con eso el turno se calcula solo y **la regla ya está
  escrita**: `_turnoLogico(now)` (index ~4543) convierte un momento en
  `{fecha, turno}` y ya resuelve el cruce de medianoche — antes de las 9 es
  turno **Noche del día anterior**. Lee los cortes de CONFIG
  (`TURNO_DIA_INICIO`=9, `TURNO_NOCHE_INICIO`=21), o sea que si la unidad
  cambia los horarios no hay que tocar código.
  🪤 Pero `_turnoLogico` **vive solo en el cliente**; la importación de la GSA
  corre en el SERVIDOR (rutina que lee Drive), así que hay que llevar esa misma
  regla a `infra_fechas.gs` — **leyendo la CONFIG, no con el 9 y el 21
  escritos a mano**, o el día que Diego cambie el horario los gases se irán al
  turno equivocado en silencio. Guardia obligatoria: los dos lados dan el mismo
  turno para la misma hora.
  · ✅ **Alcance cerrado por Diego (2-sep): SOLO el gas de la mañana.** «El resto
  se escribe a mano; es para optimizar la mañana.» Eso mata la pregunta de los
  varios gases por turno (queda uno, el de la mañana) y convierte esto en una
  **rutina que corre una vez al día**, no en un vigilante permanente.
  · ✅ **Decisión de Diego (2-sep): el gas importado NO entra a la evolución.
  «Iría solo a la hoja diaria, por el momento.»** Es la decisión que más riesgo
  saca del proyecto: no toca EVOLUCIONES (ni sus 386 columnas), no toca el REM
  ni las estadísticas, no puede pisar un registro firmado, y **desaparece la
  trampa del corte de turno** —el gas de las 07:00 ya no tiene que elegir
  evolución, solo columna en la hoja—.
  · 🪤 **Pero la hoja diaria no tiene de dónde leerlo hoy.** Se arma **en el
  cliente desde `TL_EVOS`**, o sea desde las evoluciones: la fila `gsa` (`HJ_F`,
  index ~7877) lee `e.GSA_TOMADA`. Si el dato no entra a la evolución, hace
  falta **una fuente aparte**: hoja nueva tipo `GSA_IMPORTADAS`
  (PATIENT_ID · fecha · hora · pH · PaO₂ · PaCO₂ · HCO₃ · EB · lactato · SaO₂ ·
  FiO₂ · archivo de origen) que viaje al cliente junto al historial y que la
  fila `gsa` **mezcle** con lo que ya venga de la evolución. Esto sí es cambio
  de servidor — la hoja UCI hasta hoy no tenía ninguno.
  · **Cómo conviven los dos gases del día**: el de la mañana llega importado y
  el resto los escribe el colega a mano en su evolución. Los dos caen en la
  columna DÍA, así que la celda tiene que poder mostrar más de uno, con su hora
  y marcando cuál vino del laboratorio.
  · **Consecuencia que Diego debe tener clara**: al no entrar a la evolución, el
  gas importado **no se narra en el texto** (`dominio_texto.gs:369` solo mira
  `GSA_TOMADA` de la fila del turno) ni aparece en la entrega. Se ve en la hoja
  diaria y nada más — que es exactamente lo que pidió, y por eso dijo «por el
  momento». Guardar los valores completos en la hoja nueva deja la puerta
  abierta a alimentar la evolución después sin volver a importar nada.
  · **Recomendación sobre el borrado**: Diego pidió que el archivo «se borre
  después de copiar». Propuesta a discutir: **no borrar, mover** a una
  subcarpeta «copiados» con retención corta. Con un dato clínico mal copiado y
  el original borrado no hay a qué volver ni cómo auditar.
  · **Regla dura del emparejamiento**: si no se puede emparejar con certeza,
  **no se escribe nada** y el archivo queda en una bandeja «sin emparejar» para
  hacerlo a mano. Un gas en la cama equivocada es peor que un gas que falta.
  · 📖 **LA HISTORIA DEL PRD, dictada por Diego (2-sep)**: está de turno noche.
  Los gases se toman a las **04:00**, el resultado llega a las **06:00** y la
  hoja se imprime a las **07:00** — pero la GSA, la Hb, el Hto y otros valores
  para la rehabilitación se pasan **a mano**, y eso termina a las **10:00**.
  «Ya se perdieron horas valiosas para corregir algún valor alterado o plantear
  la posibilidad de rehabilitación.» Después: descarga los PDF, los archiva, y a
  las 07:00 la hoja sale impresa con todo — identifica errores y deja el plan al
  colega entrante. 🔑 **El valor no es ahorrar tecleo: son tres horas de
  anticipación clínica.**
  · 🆕 **NO es solo la GSA.** Diego nombró **Hb, Hto y «otros valores importantes
  para la rhb», que hoy van en la columna de comentarios**. La hoja impresa
  (`rkHojaHTML`) ya tiene el bloque LABORATORIO con filas GSA: pH · PaCO₂ · PaO₂ ·
  HCO₃ · EB · SatO₂ · PaFi · Lactato · PCR · PCT, **seis columnas de horario en
  blanco** y la columna ancha «Procedimientos y observaciones». Hb/Hto/plaquetas
  **no tienen fila**: por eso van en observaciones.
  · 🖼️ **Mockup sobre la hoja real**:
  `https://claude.ai/code/artifact/c33c487d-948c-4187-9eb6-1cc98efe61e4`
  — el gas de las 04:00 ocupa la 1ª columna (las otras 5 quedan para los gases
  del día, a mano), los valores de laboratorio van en observaciones, y lo
  importado se marca con `°` y sombreado suave para distinguir lo que copió una
  máquina de lo que escribió una persona.
  · **Turno**: el gas de las 04:00 cae en la columna **NOCHE**, que es cuando se
  toma y quién está de turno. No hay conflicto con la evolución porque el dato
  no entra ahí.
  · ✅ **Cerrado por Diego (2-sep)**: **Hb y Hto en fila propia** («no sé si
  calza» → 📏 **medido: sí calza**. La carilla útil es 1093 px y la hoja usa
  **914 px** con cualquier paciente —TOT, TQT o natural, nombre corto o largo—,
  o sea sobran **179 px = 12 filas** de 14 px; con Hb y Hto quedan 942 px y aún
  sobran 10 filas). **Plaquetas y K⁺ NO llevan fila fija**: aparecen en
  observaciones **solo cuando están alterados**. La lista de valores para la
  rehabilitación (Hb · Hto · Plaquetas · INR · K⁺ · Glicemia) quedó confirmada.
  · 🖨️ **CERRADO (2-sep) y ojo con esto: LA HOJA SE IMPRIME EN BLANCO Y NEGRO.**
  Diego lo dijo al ver el mockup, y tumba cualquier diseño que dependa del color
  —el rojo de «alterado» tampoco se veía—. Las marcas que sí salen en la
  impresora: **asterisco** para lo que vino del laboratorio y **negrita + flecha
  ↑↓** para lo que está fuera de rango (la flecha además dice hacia dónde, que
  el color no decía). Vale para cualquier cosa que se diseñe sobre la hoja
  impresa, no solo para la GSA.
  · ✅ **Cortes confirmados**: **Hb < 7** (lo corrigió Diego; yo había propuesto
  8) · Plaquetas <100.000 · K⁺ <3,5 o >5,5 · pH <7,30 o >7,50 · PaCO₂ >50 ·
  PaFi <200.
  · **Estado del formato**: Diego confirma que **el sistema exporta en PDF** y no
  sabe si ofrece otra opción; preguntó qué era un CSV. Queda explicado en el
  mockup, con dónde mirar («Exportar / Descargar como / Guardar como») y la
  pregunta para informática. **Mientras no se sepa, el diseño asume PDF.**
  · Falta todavía **un PDF de ejemplo real** (anonimizado o con paciente de
  prueba) para saber qué se puede sacar de él.
- ✅ 🎊 **FIESTAS PATRIAS: PROGRAMADO en la v6.23, cuadros corregidos en la v6.24** (9-sep-2026). Diego mandó dos
  videos de Mauri de huaso; se convirtieron a **12 cuadros a 5/s** cada uno
  (terremoto → pantalla de carga, emboque → mascota de la esquina). Ventana
  **16-20 de septiembre**, movible desde `CONFIG.FIESTAS_PATRIAS`.
  · 🪤 **Un video NO entra en el index**: 2,6 MB pasan a 6,4 MB en el archivo que
  se pega. Cualquier animación futura va como CUADROS (~8 KB c/u), nunca como
  video. El pipeline quedó descrito en BITACORA v6.23.
  · 🪤 **«Fondo transparente» de un generador puede venir PINTADO** como
  cuadriculado. Al recortarlo, distinguir los dos tonos alternados del blanco
  liso de los ojos, o el personaje queda sin cara.
  · 🪤 **Y la que casi se escapa: la mayoría del equipo tiene SERVI**, y el CSS
  esconde `.masc-persona`. Cualquier cosa que se le haga a Mauri hay que
  MIRARLA renderizada, o se publica algo que no ve nadie. Durante la ventana
  `.f18` destapa a Mauri por encima de esa preferencia.
  · 🪤 **Quitar el cuadriculado NO quita el suelo: son dos cosas** (v6.24). Los
  doce cuadros del emboque venían con el piso de ARENA del video, opaco. En la
  pantalla de carga pasaba por sombra; en el botón de 62 px era un ladrillo
  beige de borde duro sobre la tarjeta. Apareció al capturar el botón REAL para
  un mockup, no leyendo el código. Los de la pantalla de carga estaban limpios:
  se verificó cuadro por cuadro antes de recortar los 24 a ciegas.
  · 🪤 **Y cómo se mide un suelo: por el ANCHO, no por «hay algo abajo»** — los
  zapatos llegan al borde y está bien. Medido: con suelo la fila de abajo va al
  100 %, sin él la esquina marca 0 % y los pies de la carga 26 %. Corte en 60 %.
  La primera versión de esa guardia se puso roja por los zapatos: la guardia
  tenía razón en gritar, la pregunta estaba mal escrita.
  · La fecha se le pasa a `esFiestasPatrias(d)` para poder probarla sin esperar
  a septiembre. Guardia `fiestas_patrias.js` (bloque 6b para el suelo).
- 🎂 **Cumpleaños de los funcionarios en la mascota virtual.** La mascota ya
  existe: es **Servi**, seleccionable entre Servi y el kinesiólogo (`mascToggle`,
  index ~1681), y hoy solo hace el tutorial y los globos.
  · ✅ **Diseño contado por Diego (2-sep)**: el día del cumpleaños la mascota
  aparece **con gorro y globos** — el cambio visual es el anzuelo, «la gente se
  va a interesar visualmente y va a hacerle clic»— y al tocarla sale un **globo
  de diálogo**: «Hoy está de cumpleaños tal», que se puede cerrar. Su intención,
  textual: **«darle un toque mucho más humano y más cercano a la plataforma»**.
  · Falta decidir: dónde vive la lista (natural: una columna nueva en
  `KINESIOLOGOS`, como el `EMAIL` que ya está ahí) y qué pasa si hay **dos
  cumpleaños el mismo día**.
  🔴 Son datos personales de los funcionarios: van en la planilla, nunca
  escritos en el código, y no salen a ninguna exportación.
- 💭 **Que la mascota recuerde situaciones.** Idea abierta y sin definir todavía
  qué es «una situación»: hitos de la unidad, cosas que pasaron con un paciente,
  o logros del equipo. **Antes de diseñar hay que preguntarle a Diego qué tiene
  en la cabeza**, porque «recordar situaciones de pacientes» y «recordar
  situaciones del equipo» son dos productos distintos — y el primero toca datos
  clínicos.

### Reglas clínicas que conviene tener a mano

- ⏱️ **CÓMO SE CUENTAN LOS DÍAS DE VM** (Diego, 7-sep-2026, textual): «se
  cuentan corridos desde la primera intubación **pero son efectivos hasta la
  extubación**; si requiere reintubación **se suma a un total de VM**, pero
  son **días nuevos de VM desde la reintubación**». O sea: total = tramos
  anteriores (`DIAS_VM_PREVIOS`) + tramo vigente (desde el ancla de la cama),
  y la pantalla lo muestra como «VM tot/ep» cuando hubo reintubaciones. Los
  días de ESTADÍA son otro reloj (`FECHA_INGRESO`) y no se detienen nunca.
  Guardia: `pve_no_toca_los_dias` bloque 1c.
- 🫁 **UNA PVE SUPERADA NO SIEMPRE TERMINA EN EXTUBACIÓN** (Diego, 2-sep-2026:
  «sí existe»). El formulario **hoy asume que sí**: al marcar «superada» pide la
  hora de extubación y `_extOcurrio()` (index ~11390) devuelve verdadero. Eso
  obliga al colega a mentir —inventar una hora, marcar «fracasada», o dejar la
  PVE en «No» y perder la prueba—. Es un hueco en una matriz por lo demás
  completa: el caso espejo, «extubación SIN PVE», ya existe (`cExtSinPve`).
  · **La buena noticia**: ningún consumidor cuenta extubaciones por
  `PVE_RESULTADO`; **todos leen `EXT_OCURRIO`** (REM, stats, entrega, tiempo
  extubado). `_extOcurrio()` es el punto único donde vive la suposición.
  · Arreglo escrito en `PRD_PVE_SUPERADA_SIN_EXTUBAR.md` (2 columnas nuevas al
  final de EVOLUCIONES ⇒ **exige `crearORepararEstructura()`**). **No programado
  todavía.**
- 🌀 **El weaning es un proceso largo y la fase NO es el caso** (Diego,
  2-sep-2026: «el proceso de weaning es un proceso largo, no siempre define
  extubar»). La **fase clínica es del PACIENTE** y dura semanas (se hereda); lo
  que hay que escribir **hoy** es del TURNO. Un paciente puede pasar veinte días
  en fase Weaning con turnos «no corresponde» → «PVE fracasada» → «TQT» →
  «destete por TQT». Vale para cualquier cosa que se diseñe sobre el destete, no
  solo para las plantillas.

- 🫁 **«VM» ES SIEMPRE VENTILACIÓN MECÁNICA INVASIVA.** La VNI es ventilación
  mecánica en lo clínico, pero **aquí cuenta aparte y jamás suma a los días de
  VM** (confirmado con Diego el 14-ago: «VM solo es VMI, para que no se
  confundan los conceptos»). Auditado en los siete consumidores que cuentan —
  contador de tramos, indicadores, archivo del episodio, REM, tarjeta de cama y
  las dos rutinas de resellado— y fijado por `checks/vm_no_es_vni.js`.
  · **La garantía real no es la guardia, es el catálogo**: `Full Face` y
    `Oronasal` solo ofrecen el soporte `VNI`, y `VM` solo se ofrece con TOT o
    TQT. Marcar VNI como VM no está prohibido: **no se puede**.
  · VM y VNI SÍ comparten una cosa, y está bien: el reloj
    `FECHA_INICIO_SOPORTE` que se estampa al ingresar. Es el reloj del soporte
    ventilatorio, no un contador de días — y el tramo de VM solo arranca de ese
    reloj cuando la cama YA está en VM.
  · Y manda el SOPORTE registrado, nunca la interfaz: una Full Face puesta con
    oxigenoterapia o CNAF no es VNI (v5.41).

### Trampas que siguen activas

- **`limpiarCamasManual` no archiva**, a propósito: es reparación y puede
  correrse con el paciente en la cama. Avisa por consola cuántas filas vivas
  deja. Si la cama va a recibir a otro paciente, hay que dar el alta.
- **`obtenerStats` solo ve pacientes activos** — no falta ningún dato (la
  cadena de custodia se verificó entera), pero si una cifra de esa pestaña
  parece baja, es que esa vista mira solo a los que siguen en la unidad.
- **El selector de funciones del editor puede ejecutar la función ANTERIOR.**
  Antes de creerle a una ejecución, leer el registro y confirmar que la salida
  es de la función que se eligió — en esa lista conviven `resetearBaseDeDatos…`
  y `archivarAnioHistorico…`.
- **El editor abierto de una sesión anterior muestra lo que tenía en memoria.**
  Al verificar un pegado, recargar la pestaña primero (⌘⇧R).
- **`offsetParent` miente dentro de un `<details>` cerrado** (Chrome usa
  `content-visibility`): para saber si algo se ve, preguntar por
  `closest('details:not([open])')`.
- **Antes de nombrar una función nueva**: `grep -rn "function nombre" v2/`.
  Apps Script comparte un único espacio global y una colisión pisa en silencio.

### Modo Coordinación — corregir fichas desde la app (ago-2026)

Tres personas con clave propia (`COORD_FIRMAS` en `svc_coordinacion.gs`): `MCC`
(Magdalena, uso diario), `DMV` y `MFB` (respaldo). Corrigen fechas semilla y
datos administrativos de cualquier paciente, en cama o egresado, desde la
pestaña 🔐 COORDINACIÓN — sin abrir el editor.

- **El candado vive en el SERVIDOR, en cada acción.** Con `AUTH_DEV_MODE=TRUE`
  cualquiera con el enlace llega al dispatcher: esconder la pestaña no protege
  nada. Toda acción `COORD_*` vuelve a exigir la sesión dentro del servicio.
- **Las claves NO van a CONFIG**: su huella vive en `PropertiesService`. CONFIG
  es una hoja de la planilla y se lee —o se exporta— sin querer.
- **`CORRECCIONES_JSON` (CAMAS_ESTADO y ARCHIVO_PACIENTES) es el sello visible
  Y la marca de arrastre.** Una fecha que figura ahí **el guardado del turno no
  la pisa** (decisión de Manuel, 18-ago). Se suelta sola cuando cambia el TIPO
  de soporte o de vía aérea, porque eso abre un tramo clínico nuevo.
  ⚠️ Al tocar cualquier fecha semilla en `svc_evoluciones.gs`, preguntar
  primero por `coordCampoCorregido()`.
- **Los días se recalculan con `diasEntre`** (calendario, BUDA), nunca con
  bloques de 24 h. Solo hace falta en el ARCHIVO: ahí están congelados.
- Antes de usarlo: correr **`coordSembrarClaves()`** una vez desde el editor y
  entregar las temporales en persona. Si alguien pierde la clave, otra de las
  tres se la restablece.
- **Recuperar la clave por CORREO: escrito y APAGADO.** El interruptor es
  `CONFIG.COORD_RECUPERA_CORREO` (nace en `FALSE` porque Diego rechazó el envío
  de correos y el sistema no manda ninguno). Encenderlo es cambiar ese valor,
  no programar. **Antes de encenderlo**: llenar la columna `EMAIL` de las tres
  firmas en `KINESIOLOGOS` y correr **`coordDiagnosticoCorreo()`**, que verifica
  los correos y la cuota. Los correos saldrían desde la cuenta dueña del
  proyecto. Apagado, `COORD_PEDIR_CODIGO` y `COORD_RECUPERAR` rechazan y **no
  se manda nada** — hay guardia que lo prueba en los dos estados.

### Rutinas de mantenimiento disponibles (simulacro primero, siempre)

`auditoriaDeUso` (qué funciones se usan y cuáles nunca; solo lectura) ·
`repararEvolucionesAjenasSIMULACRO/CONFIRMAR` · `corregirTiempoExtubadoSIMULACRO/CONFIRMAR`
· `corregirPronosRepetidos` · `resellarDiasSoporte*` · `corregirIngresos*` ·
`archivarAnioHistorico*` · `resetearBaseDeDatos*` · `cargarInventarioInicial` ·
`medirArranque` · `medirGuardado` · `verificarTablero` / `medirTablero`.
El detalle de cada una, en `BITACORA.md`.

### Privacidad — no se negocia

Los datos clínicos reales **no salen a APIs externas** sin anonimización y
aprobación institucional (Ley 19.628). El RUT jamás aparece en REM, tablero ni
exportaciones. En análisis y pipelines, filtrar por `PATIENT_ID`, nunca por
`ID_CAMA` sola — pero **en los lectores del episodio EN VIVO, no**: ahí el pid
puede faltar y filtrar esconde datos verdaderos del paciente que está en la cama.
