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
  El proyecto GAS de producción usa un layout de 9 .gs: los 15 `svc_*.gs`
  (de 31 `.gs` en `v2/`) viajan fusionados como `servicios.gs`
  (`build/fusionar_servicios.js`, que los toma por glob: la cifra sube sola al
  agregar un servicio).
- `api.gs`: dispatcher único `api(accion, datos, token)`; escrituras pasan
  por `_auditar`. `GET_LOGIN_INFO` es pre-auth (público).
- `esquema.gs`: 23 hojas; **EVOLUCIONES tiene 386 columnas** y `testEsquema`
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

**69 guardias** en `build/checks/*.js`; **42 usan navegador**
(`chromium.launch`) y 25 son Node puro. Se juzgan **SOLO por el código de
salida** (`0` = pasa) — varias imprimen a propósito fallos SIMULADOS para
demostrar que los detectan, así que leer el texto y no el exit code lleva a
«arreglar» código sano.

```bash
node build/verificar.js                  # la batería entera, 4 en paralelo (~70 s)
node build/verificar.js eventos          # solo las que contengan «eventos»
node build/verificar.js --ver arranque   # la salida completa de una
```

**Estado al 10-ago-2026: 64 verdes, 0 rojas.** El corredor
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
Enumerar aquí las 64 es garantía de desfase: la lista buena es `ls
build/checks/`.

Correr antes de entregar o commitear. Un bug que costó más de un
intercambio merece guardia nueva.

## Buscador del proyecto (skill `rce-kine-rag`)

`v2/index.html` pasa de las 10.000 líneas y este archivo de las 1.500: abrir
cualquiera de los dos «para ver cómo se hace X» quema media sesión y encima
suele devolver la parte equivocada. Hay un índice SQLite FTS5 **troceado por
función** sobre los `.gs`, el index, las 64 guardias, esta bitácora, las skills
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

🔴 **NUNCA suponer qué está publicado: preguntárselo a Diego o mirar el editor.**
El 14-ago yo di por publicada la v5.48 (lo decía la bitácora) y en realidad
corría la **v5.50**; encima `main` iba en la v5.54. Con las dos cifras malas, la
entrega que armé se calculó contra la referencia equivocada y salió incompleta
DOS veces seguidas. La cifra de abajo se actualiza cuando alguien publica —
si tiene más de unos días, se confirma antes de usarla.

- **Publicado en producción**: cohete **v5.58-escalas** — lo pegó Diego el
  14-ago con la entrega de 6 archivos (este apunte ES el aviso que pide la
  regla de publicación). `main` y la rama de trabajo van en lo mismo.
- ⚠️ Pendiente de CONFIRMAR con Diego: que tras pegar corriera
  `crearORepararEstructura()` (la v5.57 lo exige: EVOLUCIONES pasa a 390
  columnas). Sin eso, el SAS meta/vigil/fármacos se escribe a columnas que no
  existen y se pierde en silencio.
- Marcha blanca con datos reales desde el 1-ago-2026.

### 🔴 Antes de armar una entrega: `node build/que_pegar.js <ref-publicada>`

El repo tiene 31 `.gs` y el editor 9, así que **qué archivos pegar no se
recuerda: se calcula**. La herramienta agrupa los cambios por archivo del
editor y avisa si cambió el esquema. Se le pasa **la referencia de lo que está
publicado de verdad** (`e48dcf4` para la v5.50), no `main` — main puede ir
adelante de producción, que es exactamente lo que pasó el 14-ago.

### Esperando decisión de Diego

- 🛡️ **HEPA FIJO EN PB Y AVEA (hallazgo de Diego, 14-ago)**: los ventiladores
  PB (Puritan Bennett) y AVEA **no ocupan HEPA intercambiable cada 3 días** —
  se mantiene desde la instalación y no requiere cambio. La regla del ciclo
  vive en OCHO consumidores (estadoDispositivos, entrega, modal «Cambios de
  esta noche», hoja de filtros de la unidad, hoja diaria impresa, formulario
  de dispositivos, Hoja UCI y el evento rápido «Cambio de HEPA»). Propuesta:
  UNA función que decida por el ventilador asignado (`VM_TAG` contra una lista
  en CONFIG, `HEPA_FIJO_EQUIPOS`, por defecto «PB,Avea» — editable sin código,
  como las frecuencias). Tres preguntas abiertas: si la fecha de instalación
  se sigue mostrando como referencia; si el Vela (Vyaire) SÍ usa HEPA
  intercambiable (no lo nombró); y qué pasa con la cama sin ventilador
  asignado (propuesta: ciclo normal, conservador).

- **FSS-ICU · el «no evaluado»** (mockup en `scratchpad/mockup_fss_no_evaluado.html`).
  La app suma a secas: falta distinguir «incapaz por debilidad» (que es el 0 de
  la escala) de «no se pudo evaluar», y aplicar la regla oficial —hasta 2 sin
  evaluar se les asigna el promedio, con más de 2 el total no se calcula—.
  Tres preguntas abiertas: cómo se declara, qué pasa con el campo cuando no se
  puede calcular, y si se anota la razón.
- ✅ **MR850 (punto 6 del brainstorm): SON 4, categoría APOYO** (Diego,
  14-ago) — 1 en la cama 2 y 3 en bodega. Falta solo la acción de DATOS en el
  tablero: dar de baja la única cargada con nombre propio y crear el stock por
  cantidad con su reparto (el stock sin numerar existe desde la v5.17 y va a
  camas desde la v5.18).
- **`PRD_PUBLICAR_SIN_PC.md`** — cuatro decisiones, la primera es dónde vive la
  credencial de Google (alcanza al Drive, o sea a la planilla con los RUT).
- **MRC**: la leyenda usa la graduación estándar. Si el protocolo de la unidad
  tiene otra redacción, se cambia en un solo lugar.

### Anotado y NO programado (pedido explícito de Diego)

- 🧠 **Brainstorm de terreno** — 9 puntos, en `BITACORA.md`. Resueltos el 1, 2,
  3, 4, 5 y 7. **Abiertos: el 6** (MR850), **el 8** (separar «marca un hito» de
  «cuenta en la estadística») y **el 9**.
- 🔴 **Punto 9 · Al reabrir una evolución guardada se desmarcan los botones que
  no se heredan** (reportado por Diego el 14-ago desde el uso). Es el mismo
  comportamiento que Manuel decidió dejar como estaba el 9-ago; que lo reporte
  ahora el dueño del proyecto **reabre esa decisión**. Candidato a PRD: hay que
  decidir qué botones se conservan al reabrir, y eso es regla clínica.
- **Prono / posicionamiento / HSA** — diseño conversado, falta que Diego mande
  el protocolo HSA de la unidad para poder programarlo.
- **Stock de cánulas TQT** — aprobado en concepto, faltan inventario y umbrales.
- **Mi estilo** (evolución personalizada por colega) — diseño cerrado, esperando
  material: ~20-30 evoluciones editadas por persona.
- **Guardado por bloques** — analizado y descartado por ahora, con los números
  en la bitácora. Reabrir solo con datos nuevos de uso.

### Reglas clínicas que conviene tener a mano

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

### Rutinas de mantenimiento disponibles (simulacro primero, siempre)

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
