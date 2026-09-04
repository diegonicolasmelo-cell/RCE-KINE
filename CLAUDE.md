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

**89 guardias** en `build/checks/*.js`; **48 usan navegador**
(`chromium.launch`) y 41 son Node puro. Se juzgan **SOLO por el código de
salida** (`0` = pasa) — varias imprimen a propósito fallos SIMULADOS para
demostrar que los detectan, así que leer el texto y no el exit code lleva a
«arreglar» código sano.

```bash
node build/verificar.js                  # la batería entera, 4 en paralelo (~70 s)
node build/verificar.js eventos          # solo las que contengan «eventos»
node build/verificar.js --ver arranque   # la salida completa de una
```

**Estado al 21-ago-2026: 89 verdes, 0 rojas.** El corredor
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
- **Pendiente de publicar**: **v5.88-vence-hoy-hojas** (4-sep, rama
  `filtros-vence-hoy`, que INCLUYE la v5.87 y la v5.86-nota-synapse-cumple).
  La v5.88 lleva «Vencen hoy» a la hoja diaria impresa (asterisco + acción,
  sin fecha futura) y al modal «Cambios de esta noche». La v5.86 **cambia esquema**
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

El repo tiene 31 `.gs` y el editor 9, así que **qué archivos pegar no se
recuerda: se calcula**. La herramienta agrupa los cambios por archivo del
editor y avisa si cambió el esquema. Se le pasa **la referencia de lo que está
publicado de verdad** (`e48dcf4` para la v5.50), no `main` — main puede ir
adelante de producción, que es exactamente lo que pasó el 14-ago.

### 🗺️ El plan de todo lo pendiente, en una página

Al cerrar el 2-sep-2026 Diego pidió «un resumen con las cosas que hay que
implementar y qué falta por cerrar, para posteriormente hacer la programación».
Está publicado y **es el mejor punto de entrada para retomar**:
`https://claude.ai/code/artifact/f12ae3e1-ea58-4e88-af4e-954d51017aa6`

- **Tanda 1 — sin cambio de esquema**: eventos manuales + botón de Synapse con
  copia del RUT + cumpleaños de la mascota. Un solo pegado.
- **Tanda 2 — con cambio de esquema**: PVE superada sin extubar + hoja de gases
  importados. **Van juntas a propósito** para correr `crearORepararEstructura()`
  UNA vez.
- **Tanda 3 — las plantillas** (PRD escrito + prototipo andando).

Para arrancar la tanda 1 solo faltan tres respuestas de Diego: ① C1 o C2 para
los eventos manuales ② si le sirve el Synapse con copiar-y-pegar el RUT ③ la
lista de cumpleaños.

### Esperando decisión de Diego

- 🔔 **Buzón de notificaciones + campana de alertas en la barra superior**
  (pedido de Diego, 4-sep-2026). ✅ **Reparto APROBADO por Diego el 4-sep**
  («okye me parece»): la **campana** agrega lo
  que la app YA calcula regado por las vistas (HME/Trach Care vencidos,
  evaluaciones envejecidas >EVAL_DIAS_ALERTA, VM en cama sin ventilador
  ~13901, mantención por vencer ~13729, cierre de año) — se limpia sola al
  resolverse porque es cálculo en vivo, sin estado de leído; el **buzón**
  lleva lo humano (notas 📌 del turno, cumpleaños, avisos de coordinación,
  «se publicó vX.Y») con leído/no-leído POR NAVEGADOR (localStorage; no hay
  login, así que no puede ser por persona). Nada sale por correo. Falta solo
  que confirme qué entra al buzón el día uno (propuesto: notas 📌 +
  cumpleaños + avisos de versión; el «aviso de coordinación» escrito desde
  la pestaña 🔐 es un mini-agregado aparte, esperando si lo quiere ya).

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

- 🎂 **Pose cumpleañera de Don Mauri: PROPUESTA ENVIADA** (4-sep). No se
  redibujó al personaje: se compuso gorro + confeti + serpentinas SOBRE la
  pose `festejo` de Diego (PIL, lienzo +30 px arriba; script reproducible en
  el scratchpad de la sesión). Esperando su visto bueno — si le gusta, se
  integra como novena pose `cumple` en `MAURI` (WebP base64) y
  `cumpleAplicar` la usa cuando la mascota es la persona; si no, la dibuja
  él y se integra la suya.

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
  redactadas. Solo queda abierta la SELECCIÓN (chips vs evolución tipo),
  que él pidió dejar para el final.
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
