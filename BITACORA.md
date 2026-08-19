# BITÁCORA — RCE-KINE

Historial del proyecto, versión por versión: qué se cambió, por qué, qué se
midió y con qué trampa se tropezó en el camino.

**Esto NO son las reglas vigentes.** Las reglas —cómo se trabaja con Diego,
la arquitectura, cómo se publica, la saga del boot, la verificación— viven en
`CLAUDE.md`, que se lee entero en cada sesión. Este archivo se consulta cuando
hace falta el detalle: por qué se decidió algo, qué se midió, o qué pasó la
última vez que alguien tocó esta parte.

Se separó de `CLAUDE.md` el 14-ago-2026, cuando el archivo llegó a 233 mil
caracteres y superó el límite que carga la herramienta: leído a medias, no
servía para lo único que existe. Nada se perdió — lo que sigue es idéntico a
lo que estaba, movido tal cual.

👉 **Lo más rápido para encontrar algo aquí no es leerlo: es el buscador del
proyecto** (`rag_buscar.py`), que lo tiene indizado junto al código.

---

## Usuario de login ≠ firma clínica, claves de 12 (19-ago-2026)

Manuel, sobre la marcha: «cuando estemos ahí, usuarios serán coord1/coord2/coord3»
y «dame una combinación alfanumérica de 12 dígitos cambiable después por el
usuario». Dos cambios al modo Coordinación, antes de la primera entrega:

- **La puerta pide `coord1/coord2/coord3`, no MCC/DMV/MFB.** `COORD_USUARIOS`
  en `svc_coordinacion.gs` es la única tabla que conoce el emparejamiento
  (coord1→MCC, coord2→DMV, coord3→MFB). Todo lo de credenciales (claves,
  intentos fallidos, sesión) se guarda y busca por USUARIO; todo lo de
  trazabilidad (correcciones, AUDIT_LOG) sigue firmando con la FIRMA real —
  se separaron las dos identidades a propósito, no por accidente de nombres.
  El selector de nombres reales en la puerta se reemplazó por un campo de
  texto; hay guardia (`coordinacion_ui.js`) que confirma que el HTML servido
  **no menciona ningún nombre ni sigla clínica** antes de entrar.
- **Claves temporales de 12 caracteres alfanuméricos**, agrupadas 4-4-4
  (antes 10). Se cambian al primer ingreso, como siempre.
- **Botón «Restablecer otra»** en el panel: existía la función del lado del
  servidor desde el 18-ago pero no tenía UI. Ahora cualquiera de las tres
  puede generarle una temporal a otra sin salir de la pantalla.

Batería: 79/79 (misma cuenta — se reescribieron los tests existentes, no se
sumaron guardias nuevas).

## Modo Coordinación — buscar y corregir fichas (18/19-ago-2026)

Rama `feature/modo-coordinacion-buscador-y-correcciones`, desde `develop`.
PRD: `PRD_MODO_COORDINACION.md`. **Batería: 78/78 verdes** (76 previas + 2
nuevas). **Sin publicar** — espera el visto bueno de Diego.

**De dónde sale.** El paciente de la cama 10 estuvo 28 días y al egresar quedó
archivado con **UN día de estadía**: los días se congelan al dar de alta
(`svc_camas.gs`, `DIAS_TOTAL: cama.DIA_ESTADIA`) y su fecha de ingreso estaba
mal. Corregirlo obligaba a abrir el editor de Apps Script y escribir una
función de mantenimiento a mano — para cambiar una fecha.

**Qué trae.**

1. **Tres usuarios con clave propia** (`svc_coordinacion.gs`): `MCC` (Magdalena,
   uso diario), `DMV` y `MFB` (respaldo). Tres, para que la unidad no dependa de
   una persona. La huella de la clave (SHA-256 con sal por persona) vive en
   `PropertiesService`, **no en CONFIG**: CONFIG es una hoja de la planilla y
   cualquiera con acceso al archivo la lee, o la exporta sin querer.
2. **Pestaña 🔐 COORDINACIÓN**: buscador + ficha editable con el historial de
   correcciones a la vista.
3. **El buscador acepta RUT y palabras sueltas** — esto lo gana TODO el equipo,
   no solo la coordinación. Antes «Melo Villagrán» encontraba a Diego pero
   «Diego Villagrán» no, y el RUT no se buscaba pese a estar en las dos hojas.
4. **Corregir una fecha de un egresado recalcula sus días** con `diasEntre`
   (calendario, regla BUDA) — **no** con bloques de 24 h, que es la regla que
   se revirtió en la v5.37.

**🪤 Lo que encontró el inventario de consumidores, y por qué existe esa sección.**
Antes de escribir una línea, el método pide listar quién más toca el dato. Salió
que `svc_evoluciones.gs` **reescribe las fechas semilla en el guardado normal**:
la hora de ingreso desde el formulario (`:137`) y `anularEvento` restando los
días de la evolución (`:903`). Sin eso, la corrección de un egresado de 28 días
**duraba hasta que alguien guardara el turno de esa noche**. Es el error de los
filtros otra vez, cazado en papel en vez de en producción.

**La marca de arrastre (D7, decisión de Manuel).** «Normalmente no se modifica,
así que no debería poder modificarla»: una fecha corregida queda marcada en
`CORRECCIONES_JSON` y el turno la **hereda sin poder cambiarla**. Pero se suelta
cuando arranca un **tramo clínico nuevo de verdad** (VM→VNI, TOT→TQT), porque
ahí la fecha corregida ya no describe ese tramo y congelarla sería peor que el
error original. La misma columna sirve para las dos cosas: el sello visible y
la marca.

**🪤 Trampas del camino.**
- `node --check` **rechaza la extensión `.gs`** y devuelve un error de módulo
  que se lee como éxito si uno encadena `&&`. Hay que copiar a `.js` primero.
- El `CacheService` del simulador **devolvía `null` siempre**: no era un caché,
  era su ausencia. Las sesiones viven ahí, así que ninguna guardia habría podido
  probar que expiran. Ahora tiene memoria real con TTL. Igual `computeDigest`,
  que no existía: con un digest de mentira, «la clave no se guarda» pasaba en
  verde sin probar nada.
- **Diez guardias arman su propia lista de `.gs`**, así que un `svc_*` nuevo del
  que dependa `svc_evoluciones` las pone rojas a todas.
- `guardado_viajes.js` es un A/B contra un commit fijo y corre el
  `medir_guardado.js` de HOY contra el árbol de ENTONCES: los archivos que aún
  no existían allá se saltan, no revientan. Y su descuento de columnas nuevas
  solo cubría `EVOLUCIONES`; ahora también `CAMAS_ESTADO`. Ojo: hay que
  **quitar** la celda con `splice`, no rellenarla — rellenarla la hace más
  distinta, no menos. Las filas se unen con `\x01`, no con cadena vacía.

**Pendiente antes de publicar:** correr `coordSembrarClaves()` UNA vez desde el
editor y entregar las temporales en persona.

**Recuperación por correo: escrita y APAGADA** (19-ago, pedido de Manuel «déjalo
listo si fuéramos a cambiar las contraseñas a correo»). Está completa —código de
6 dígitos de un solo uso, con vencimiento, límite de intentos, correo ofuscado
en pantalla y traza en `AUDIT_LOG`— detrás de `CONFIG.COORD_RECUPERA_CORREO`,
que nace en `FALSE`. Encenderla es cambiar ese valor; queda como decisión de
Diego, que fue quien rechazó los correos. `coordDiagnosticoCorreo()` chequea
correos y cuota antes de encender.
🪤 Lo que más importaba probar no era que funcione encendida sino que **apagada
no mande absolutamente nada**: una funcionalidad «lista para encender» que igual
manda correos no está apagada, está suelta. La guardia lo verifica en los dos
estados, y también que el código **nunca vuelve en la respuesta** —si volviera,
pedirlo bastaría para entrar y el correo no probaría nada— ni queda escrito en
`AUDIT_LOG`. El `MailApp` del simulador se agregó para eso.

De paso, arreglo suelto: el apellido de Magdalena estaba escrito **«Contando»**
en `esquema.gs` y en `index.html`, y ese nombre alimenta la firma del texto
clínico — cada evolución suya salía con el apellido mal. Corregido a
**«Contardo»**. Falta verificar cómo está en la hoja `KINESIOLOGOS` real: la
semilla solo se aplica si la hoja está vacía.

---

## Estado y pendientes (julio 2026)

- **CUATRO PEDIDOS DE TERRENO DE MANUEL (9-ago-2026, rama
  `mejoras-de-terreno-snt-pve-copiar-entrega`).** Index + `esquema.gs` +
  `dominio_texto.gs` + `svc_evoluciones.gs` + `svc_entrega.gs`.
  ✅ **EN PRODUCCIÓN: Versión 26 del 9-ago-2026, 23:33**, creada editando la
  implementación existente (mismo ID, la URL del equipo no cambió), con
  `cuadrarEncabezados()` ya corrido → **✅ Esquema OK (23 hojas)**.
  🪤 Al correrlo saltó `❌ EVOLUCIONES != 386 columnas: 387`: **el total de
  columnas está ESCRITO A MANO en `testEsquema()`** y hay que subirlo con cada
  columna nueva (la planilla estaba bien; ya quedó en 387).
  1. **SNT — succión nasotraqueal.** Cuarta técnica de permeabilización junto a
     SOF/SNF/SET, con columna nueva **al final** del esquema (regla de la casa)
     y narrativa en los dos generadores (cliente y `dominio_texto.gs`). Se
     **esconde y se desmarca con TOT o TQT**: la sonda entra por la nariz y
     pasa la glotis, así que con vía aérea artificial no existe — es el espejo
     exacto de lo que ya hacía SET al revés (`_updateSinKTR`). Decisión de
     Manuel, no supuesto: se le preguntó antes de programar.
  2. **🚫 «No corresponde» en Extubación/PVE** (`PVE_VAL='nc'`, sin columna
     nueva). Tercer botón del toggle para el paciente que sigue en VM porque su
     causa de base no está resuelta: no procede ni PVE ni extubación. Apaga las
     dos ramas y las limpia, satisface la declaración obligatoria, narra «No
     procede PVE ni extubación en este turno: causa de base no resuelta», y
     **corta el tamizaje y la racha de candidato a PVE** (`svc_evoluciones` no
     marca `WEAN_CAND_PVE`; `_turnoCandidatoPve` lo trata como turno resuelto).
     Vale **solo para ese turno** — el siguiente vuelve a preguntar, para que
     nadie se olvide de reactivarlo cuando la causa se resuelva. Cuidado al
     tocar consumidores de `PVE_VAL`: 'nc' NO es evento (`_renderEvStrip`,
     `_evoEventoGuardado`) ni PVE hecha (Hoja UCI: chip «No corresponde»;
     tabla del historial: «NC»).
  3. **Copiar texto ya no marca la evolución como modificada.** El formulario
     tenía un listener de clic que ponía `_formDirty=true` en **cualquier**
     `<button>` de `#kf` — nació para los chips, que no emiten `input`/`change`
     — y la barra de acciones vive dentro del mismo form: copiar el texto para
     pegarlo en el BUDA dejaba el turno «sin guardar» y pedía guardar de nuevo.
     Ahora se salta los botones con **`data-nodirty`** (copiar, preview,
     guardar, cerrar). Es un atributo y no una lista en el JS a propósito: el
     que agregue un botón decide en el mismo lugar donde lo escribe.
  4. **La entrega de turno se imprime VERTICAL** (pedido: «1 o 2 hojas»). El
     `@page` **global** pasó a `portrait` —manda también con Ctrl+P, que es
     como imprime medio equipo— y lo que necesita ancho, el historial, inyecta
     el suyo (`_imprimirApaisado`, antes era al revés). **Medido, no estimado**
     (`build/medir_entrega.js`, 17 camas, la entrega real montada en Chromium):
     carga normal **2,42 hojas apaisadas → 1,89 verticales**; carga alta 2,50 →
     2,22 (o sea 3 hojas en un día malo, y así se dijo). El ahorro no vino de
     achicar letra sino del interlineado, de la franja del plan (etiqueta y
     pendientes **en línea**) y del encabezado/pie del documento, que se comían
     271 px sin un solo dato de paciente. **De paso se arregló el diagnóstico**:
     con la cabecera forzada a una línea se comprimía a 32 px —0 con muchos
     chips—, o sea gastaba renglón sin decir nada; ahora pide un tercio del
     ancho y si no lo tiene baja de línea y se lee entero.
  - Guardias: `entrega_impresion.js` ampliada (orientación del papel, dx
    legible, y **cuenta hojas de verdad** con el escenario de
    `medir_entrega.js` en vez de proyectar con regla de tres).
    `guardado_viajes.js` se hizo **tolerante a columnas nacidas después de la
    ola**: deriva la lista comparando el esquema de los dos árboles y las
    descuenta — si no, cada campo nuevo la haría fallar por una diferencia
    ajena a lo que vigila. `dias_vni` ya no exige que `DIAS_VNI` cierre la
    lista de columnas (detrás va RESP_SNT); `hojas_dia`, `panel_ux` y
    `reporte_colega` se ajustaron al id del `<style>` de orientación y al nuevo
    texto del aviso. Batería: **62 de 63** (la roja es `rendimiento.js`, de ruta
    fija, como siempre).
  - **Conocido y DEJADO ASÍ por decisión de Manuel (9-ago-2026)**: al reabrir
    una evolución guardada, `fillForm` desmarca SOF/SNF/SET/A.Tos/inhalo aunque
    su propio comentario diga que «carga exactamente lo que se registró» — si
    alguien reabre el turno para corregir otra cosa y guarda, esas marcas **se
    borran de la planilla**. Se le reportó con el detalle y respondió «deja
    como está el punto de las succiones». No tocarlo sin pedírselo de nuevo (el
    mismo patrón afecta al bloque KTM, que sí pesa en el REM).

- **DOS HOJAS PARA LA RONDA (9-ago-2026, pedido de Manuel; misma rama).** Las
  revisó **en maqueta antes de montarse** — pidió verlas primero, y de esa
  revisión salieron la columna de ventilador, las 18 camas y el cambio de la
  casilla al lugar de la firma. Solo index.
  1. **🖨️ Lista del día — REEMPLAZA a «Hojas del día»** en la pestaña Registro
     (decisión suya, explícita). Antes ese botón sacaba la hoja de registro
     completa de CADA paciente: 17 pacientes = **34 carillas**. Ahora sale UNA
     hoja vertical con todos los presentes, con la misma franja de
     identificación del formato oficial (cama · edad · nombre · RUT · días ·
     fecha), el diagnóstico debajo y las escalas **que estén registradas** —
     APACHE II, Barthel, Charlson, FSS-ICU, MRC-ss; la que nadie midió no
     aparece, no se inventa un «—». La hoja de registro oficial NO se perdió:
     se imprime por paciente desde su historial (`imprimirHojaUCIpaciente`,
     botón «🖨️ Hoja de registro», junto a Hoja PVE/APK/RHB). Medido: 17
     pacientes = **0,79 hojas**.
  2. **🖨️ Filtros** — la hoja de la ronda de la noche: HME, HEPA y Trach Care
     de **las 18 camas** (no solo las ocupadas: así se ve dónde hay
     ventiladores libres), con el **equipo de cada sala** y si está EN USO o
     DISPONIBLE, la fecha de cambio de cada filtro, los vencidos marcados con
     su atraso y una **casilla por filtro que toque cambiar** ese día — la
     casilla quedó donde estaba la columna de firma, que se eliminó. Medido:
     18 camas = **0,70 hojas**.
  - Detalles que costaron una vuelta: el cliente **replica la regla del
    servidor** (`estadoDispositivos`: etiqueta = día 0, cambio en el turno
    NOCHE del día etiqueta+frecuencia) y lee las frecuencias de `CFG` — si se
    calculara distinto, la hoja contradiría al modal «Cambios de esta noche».
    Un ventilador **con falla que además está ventilando** muestra las dos
    cosas («EN USO · FALLA»): al principio el estado tapaba el uso y eso
    escondía justo el caso que hay que mirar. Y `white-space:nowrap` en la
    marca desbordaba sobre la columna vecina: la solución fue **acortar el
    texto** («VENCIDO (3d)»), no forzar la línea.
  - Guardia: `checks/lista_y_filtros.js` (39 asserts, incluidas las cuentas de
    hojas al ancho real del A4 vertical). `hojas_dia.js` pasó a verificar la
    hoja de registro **desde el historial**.

- **LA FECHA DE UN PAPEL ES LA DEL RELOJ, NO LA DEL TURNO (10-ago-2026,
  reportado en terreno por Manuel: imprimió la lista a la 1 AM del 10 y salió
  fechada el 9).** No era un huso horario. `gDate` guarda la fecha del **turno
  lógico**, y `_turnoLogico()` la deja en el DÍA ANTERIOR entre las 00:00 y las
  09:00 **a propósito**: la noche del 9 se sigue escribiendo hasta las 9 de la
  mañana del 10 (ventana de gracia para la evolución atrasada). Eso es correcto
  para el registro clínico y es un error para el papel que se lleva en la mano.
  - **`_fechaPapel()`** (index) devuelve la fecha del calendario, y la usan la
    **lista del día** y la **hoja de registro por paciente**: las dos llevan a
    los pacientes que están presentes AHORA. Se recalcula en cada clic, así que
    una app abierta desde ayer imprime bien igual. La lista además estampa la
    **hora** («FECHA 10/08/2026 · 02:30 h»), que avisa qué tan fresca es la hoja
    que anda dando vueltas por la unidad.
  - **La excepción es el control de filtros**, que sigue fechándose con el
    turno: ahí la fecha decide *qué filtro toca cambiar*, y a las 2 AM la ronda
    en curso es todavía la noche del día anterior — la misma fecha que muestra
    «Cambios de esta noche». Para que no se lea como un día atrasado, su
    encabezado pasó de «FECHA …» a **«NOCHE DEL …»**.
  - Al mirar la vista previa apareció un defecto **que no tiene que ver con la
    fecha**: la columna RUT de la lista tenía **96 px** y un RUT real
    («22.222.222-2») se partía en dos líneas — los datos de prueba de la guardia
    eran RUT cortos («1-9») y por eso nunca se vio. Subida a **112 px**; el
    nombre, que es la única columna flexible, absorbe la diferencia. Al probar
    un imprimible, usa datos **del largo real**, no los mínimos.
  - 🪤 **La guardia dependía del día en que se corriera:** sus asserts estaban
    escritos contra el 09-08 y pasaban porque se escribió ese día (había un
    `const FECHA` declarado y sin usar — la intención estaba, la ejecución no).
    Hoy `lista_y_filtros.js` **fija el reloj** con un `Date` de clase derivada
    en `addInitScript` (10-ago-2026 02:30, dentro de la ventana de gracia), que
    es el escenario exacto del bug. Uno de los asserts nuevos comprueba que el
    turno lógico **sigue** en la noche del 9: el arreglo es del papel, no de la
    regla clínica.

- **EL CAMBIO DE FILTROS SE AVISABA UNA NOCHE TARDE (10-ago-2026, reportado por
  Manuel desde el turno; `svc_eventos.gs` + index).** Dijo que el HME etiquetado
  el 08 y el HEPA/Trach Care del 07 debían cambiarse en la madrugada del 10 —
  o sea en el turno noche del 09— y la app no los marcaba. Tenía razón, y la
  prueba estaba en la propia guardia de validación de la regla anterior: HME
  cambiado en la noche del 06 → se etiqueta **07** (fecha efectiva = la
  madrugada en que se cambió) → volvía a pedirse la noche del 09 = madrugada del
  10. **Tres días de HME cuando el HME dura dos.** El ejemplo con que se validó
  aquella regla (ingreso el 04 en turno día → noches del 06 y 07) solo miraba el
  PRIMER ciclo, donde la etiqueta es un día real y no una madrugada; ahí la
  diferencia no se veía.
  - Regla vigente: `fechaCambio` = etiqueta + frecuencia **se ejecuta en la
    madrugada de esa fecha**, o sea en el turno noche de la víspera →
    `cambiaEstaNoche` es `dias === frec-1`, `vence` es `dias >= frec` y el
    atraso se cuenta desde `frec-1`. Espejado en `_flEstado` (index) y alineado
    con `_hjDisp`, el chip de la Hoja UCI, **que ya usaba `frec-1`**: llevaba
    semanas contradiciendo al servidor sin que nadie lo notara.
  - Textos: la hoja dice «ESTA NOCHE» en vez de «CAMBIAR HOY» (la usan de
    madrugada y «hoy» se leía como la víspera) y encabeza con «Ronda de la
    madrugada del dd-mm»; el modal agrega «· madrugada del dd-mm».
  - 🪤 **La guardia memorizaba fechas y por eso dejó pasar el error.**
    `eventos.js` ahora encadena los ciclos y mide **el intervalo entre dos
    cambios del mismo dispositivo** (2 días el HME, 3 el HEPA/TC), que es la
    propiedad que de verdad importa. Un solo ciclo se ve bien y miente.
  - ⚠️ Esto **invierte en un día** lo que se publicó el 7-ago con el visto bueno
    de Diego: su ejemplo pasa de «noches del 06 y 07» a «noches del 05 y 06».
    Avisarle antes de publicar.
  - 🔴 **Y LA CORRECCIÓN LLEGÓ A TRES DE LOS CUATRO LUGARES.** Unas horas
    después, buscando con el RAG recién construido, apareció que
    `svc_entrega.gs` —**la entrega de turno**, el papel que se pasan los
    kinesiólogos— seguía con `dias === frec ? 'cambiar'`, o sea avisando una
    noche tarde, mientras `estadoDispositivos`, `_flEstado` y `_hjDisp` ya iban
    en `frec-1`. Dos papeles de la misma unidad dando fechas distintas del mismo
    filtro es exactamente lo que hace que el equipo deje de creerle a los dos.
    Corregido a `dias >= frec ? 'vencido' : (dias === frec-1 ? 'cambiar' : 'ok')`,
    con `disp_fecha.js` reescrita: sus asserts codificaban la regla vieja como
    «SEMÁNTICA VALIDADA POR DIEGO» y ahora, además de las fechas, **miden el
    intervalo entre dos cambios encadenados**.
    👉 **Lección para la próxima regla clínica: búscala en TODAS partes antes de
    tocarla.** Una regla de este sistema vive típicamente en cuatro sitios
    —servidor, espejo del cliente, imprimible y chip— y el RAG los encuentra en
    un comando.
    ✅ **EN PRODUCCIÓN: Versión 28 del 10-ago-2026, 3:00, sello `5.48-terreno`**
    (verificado con `fetch` al `/exec`: 200 y el sello nuevo), sobre la misma
    implementación de siempre. Se pegaron **DOS** archivos —`index.html` y
    `servicios.gs`—; `dominio.gs` no cambió en esta tanda y **no** hizo falta
    `cuadrarEncabezados()`. Avisado a Diego en `#mejoras-rce`.
    🪤 **Al pegar por Monaco, elegir el modelo por su URI, no por su contenido.**
    Buscar «el modelo que contenga `obtenerEntregaTurno`» devolvió `api.gs`
    —el dispatcher también nombra esa función— y le escribió encima el
    `servicios.gs` entero. No llegó a guardarse, pero el modo de fallo es real y
    silencioso: la comprobación que lo cazó fue **comparar las 13 longitudes
    UTF-16 del editor contra el paquete, archivo por archivo, antes de ⌘S**.

- **LA COLUMNA SOPORTE DICE CUÁL OXIGENOTERAPIA (10-ago-2026, pedido de Manuel;
  solo index).** «Oxigenoterapia/OAF» a secas no sirve en la ronda. El dato ya
  existía en `VENT_MODO` —el formulario lo pide— y la grilla lo tiraba: ahora la
  etiqueta pasa a **«O2 · NRC»** (CNAF, NRC, MMV, mascarilla; con vía aérea
  artificial, HME o tubo en T) y el nombre largo queda en el tooltip. Si no hay
  modo registrado **no se inventa**: queda el genérico. VM y VNI no se tocan —
  el pedido era la oxigenoterapia. Se lee igual que el soporte: manda la
  evolución del turno, si no el estado de la cama (`c.MODO`).
  - **Y «Mascarilla» pasó a llamarse «MR» (mascarilla de reservorio)**, que es
    como la nombra la unidad; decisión de Manuel al preguntarle. El renombre va
    en el catálogo `VMAPS`, en los selects de modo post-extubación y de soporte
    previo a la reintubación, y en `_PE_META`. Tres capas para que nada se
    rompa: **valor** guardado = `MR`; **etiqueta** del desplegable = «MR
    (reservorio)» vía `_MODO_ETIQ`; y **nombre largo** dentro de la evolución
    vía `_MODO_LARGO` (espejado en `dominio_texto.gs`) — «por MR» no le dice
    nada a quien lee la ficha desde fuera de la unidad, «por mascarilla de
    reservorio» sí. Ojo: `_MODO_LARGO` expande **solo MR**. Al principio expandí
    también NRC y MMV y `via_aerea_previo.js` se puso roja: la narrativa ya
    tenía esas siglas fijadas («Previo en naricera-NRC»). La guardia hizo su
    trabajo — expandir de más es cambiar textos que nadie pidió cambiar. Las evoluciones anteriores guardaron `Mascarilla` y se
    siguen leyendo en todos los consumidores y en la grilla.
    NO se tocó el select de dispositivo post-decanulación (`fDecanQueda`): ahí
    «Mascarilla de oxígeno» es otro vocabulario y no implica reservorio.
  Guardia nueva: `checks/tabla_soporte.js` (13 asserts).

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
    difieren exactamente en el campo retirado a propósito. Las **53 guardias**
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
       nuevos por lectura (`repo.gs` + `esquemaFilaAObjeto`). O sea: las 33
       guardias de navegador pasarían igual con o sin la Ola 1, y el aliasing no
       se puede cazar ahí. Por eso `memo_episodio.js` lo audita a mano
       (bloque 5) en vez de confiar en el simulador.
    3. El repo REAL (`repoLeerFiltrado`, con su troceado por tramos y el
       fallback del bloque completo) **no lo ejercita ninguna guardia**: las
       cifras de viajes salen del arnés de medición, no de una guardia. Si
       alguien rompe el troceado, las guardias siguen verdes.
- ⚠️ **`obtenerStats` SOLO VE PACIENTES ACTIVOS — y NO se pierde ningún dato
  (verificado a fondo el 6-ago-2026, no hay nada que arreglar).**
  `obtenerStats(desde, hasta)` filtra por fecha pero lee únicamente
  `EVOLUCIONES`, sin `EVOLUCIONES_ARCHIVO` (su comentario lo asume: «todas =
  episodios activos; al egresar se archivan»). O sea que un paciente dado de alta
  dentro del rango no suma en **esa** vista.
  **La cadena de custodia del dato está intacta**, que era la pregunta que
  importaba:
  1. El alta **copia antes de borrar** (`repoInsertar` en el archivo → recién
     después `repoEliminarDonde`), nunca al revés.
  2. Las dos hojas tienen **las mismas 386 columnas**: al archivar no se pierde
     ni un campo.
  3. **Casi todo lee las dos hojas**: `calcularIndicadores` (`svc_indicadores.gs:27`),
     el **REM** (`svc_rem.gs:63`), `datosPivot` (`svc_stats.gs:194`) y
     `obtenerHistorialPaciente` (`svc_evoluciones.gs:659`). La única excepción es
     `obtenerStats`.
  4. Lo único que borra del archivo es el **cierre anual**
     (`archivarAnioHistoricoCONFIRMAR`), que copia a otra planilla, cuenta las
     filas copiadas y **si no cuadran no borra nada** (`mantenimiento.gs:444`).
  Conclusión de Manuel: mientras los datos queden guardados, no se toca. Anotado
  por si algún día una cifra de esa pestaña parece baja: no faltan datos, es que
  esa vista mira solo a los que siguen en la unidad.

- 🔴 **HALLAZGO PREEXISTENTE (6-ago-2026): DOS DEFINICIONES DE «DÍA CON VM» EN
  `calcularIndicadores`, y una infla un indicador centinela.**
  - `svc_indicadores.gs:37` usa `VENT_SOPORTE === 'VM'` (**estrecho**) y alimenta
    `diasVM`, `ventilados`, `vmProlongadaPct` y el **denominador de
    `autoextPor100VM`**.
  - `svc_indicadores.gs:114` usa `VENT_SOPORTE !== 'VM' && VENT_SOPORTE_FINAL !== 'VM'`
    (**ancho**) y alimenta `vmProlongada` y `medianaVMpreTQT`.
  - `VENT_SOPORTE_FINAL` es columna viva (`esquema.gs:89`), la escribe
    `svc_evoluciones.gs:764` en los eventos de vía aérea, y `svc_camas.gs:207`
    usa el criterio ancho: **el raro es el estrecho**.
  - Efecto medido con un paciente cuyo soporte TERMINA en VM: el mismo payload
    dice «el traqueostomizado llevaba 10 días de VM» y a la vez «hubo 1 día-VM y
    ningún paciente con VM prolongada»; y **`autoextPor100VM` salió 100 contra
    una meta de 1–2 (~11× inflado)** porque el denominador pierde días-VM reales.
  - **Arreglarlo exige decidir cuál criterio es el clínicamente correcto** — eso
    es de Manuel y Diego, no de quien pase por el código. Anotado también en la
    cabecera de `checks/tablero.js`, cuyo fixture no tiene ni una fila con
    `VENT_SOPORTE_FINAL` y por eso no puede verlo.

- 🔴 **HALLAZGO PREEXISTENTE, NO de la Ola 1: LA PRONACIÓN HEREDADA — un
  paciente puede ver las horas de prono del ocupante anterior de su cama.**
  Riesgo asistencial, no cosmético: la app dice «lleva X horas en prono» de otra
  persona, y eso puede inducir a supinar antes de tiempo o a buscar lesiones por
  presión que no existen. Dos revisores lo reprodujeron por separado («tras
  108,5 h en prono», horas de otro paciente).
  - **La causa son TRES lectores que filtran solo por `ID_CAMA`**, no uno:
    `obtenerEvolucionPrevia` (`svc_evoluciones.gs:536`),
    `obtenerEvolucionesRecientes` (`:597`) y `_pronoAbiertoTS` (`:811`). Si en
    EVOLUCIONES quedan filas de un episodio terminado en esa cama, se las comen
    como propias.
  - **Y `_limpiarCamaInterno` (`svc_camas.gs:376`) deja esas filas vivas**: vacía
    CAMAS_ESTADO campo por campo pero **no toca EVOLUCIONES** (0 menciones en la
    función).
  - **RENDIJAS REALMENTE ALCANZABLES** (verificadas, para no re-investigarlas):
    1. **`limpiarCamasManual('3,5,8')`** (`svc_camas.gs:412`), que se corre a
       mano desde el editor: llama a `_limpiarCamaInterno` y **no archiva nada**.
       Es la vía más probable de las que ya ocurrieron.
    2. **Alta de un episodio SIN `PATIENT_ID`.** `darAltaPaciente` archiva y
       borra dentro de un `if (pid)` (`svc_camas.gs:278-280`): sin pid, el alta
       ocurre y las evoluciones **se quedan para siempre** en la hoja viva.
    3. `LIMPIAR_CAMA` por la API (`api.gs:86`). Ojo: **no se dispara desde la
       interfaz** — 0 menciones en `v2/index.html`.
  - **RUTAS SANAS, ya verificadas (no volver a auditarlas):** `darAltaPaciente`
    con pid archiva a EVOLUCIONES_ARCHIVO y borra por `PATIENT_ID`;
    `moverACamaVacia` reetiqueta el episodio (`_reetiquetarEpisodioACama`);
    `_mtoLimpiarPaciente` (`mantenimiento_manuel.gs:332`) borra por `PATIENT_ID`
    en las seis hojas de `_MTO_HOJAS_PACIENTE` (EVOLUCIONES,
    EVOLUCIONES_ARCHIVO, PROCEDIMIENTOS, TIMELINE, REINTUBACIONES,
    ARCHIVO_PACIENTES) **antes** de llamar a `_limpiarCamaInterno`; y `_epiPrev`
    del guardado sí filtra por `PATIENT_ID`, así que los días de VM/VNI/VA están
    a salvo.
  - **NINGUNA GUARDIA CUBRE LA HERENCIA.** `prono.js` tiene 39 asserts y **cero
    menciones de `PATIENT_ID`** (todos son de estado-vs-evento); `cama_limpia.js`
    solo mira las columnas de CAMAS_ESTADO, no EVOLUCIONES. Es exactamente el
    caso de «bug que costó más de un intercambio ⇒ guardia nueva».
  - 🧪 **FILTRAR POR `PATIENT_ID` SE PROBÓ EL 6-AGO Y SE REVIRTIÓ. No volver a
    intentarlo sin leer esto.** Se implementó (filtro por paciente en los tres
    lectores, con `_delEpisodio`/`_pacienteDeCama`), pasó su guardia nueva y pasó
    las 54 guardias del harness. Aun así **se revirtió**, porque tres revisores
    independientes reprodujeron el daño:
    1. **Oculta pronaciones VERDADERAS del mismo paciente.** `ingresarPaciente`
       genera un `PATIENT_ID` nuevo SIEMPRE. Si a un paciente pronado se le
       repara la cama con `limpiarCamasManual` y se le re-ingresa —el uso para el
       que esa herramienta existe—, sus propias evoluciones conservan el pid
       viejo: `pronoAbierto` pasa de `2026-08-01 19:00` a `""`, la previa a
       `null`, y un ciclo real de 36,5 h no queda registrado en ninguna parte.
       Basta **una sola fila anónima** para lo mismo; que las hay lo asume el
       propio código en `mantenimiento.gs:524` (`f.PATIENT_ID || f.ID_CAMA`).
    2. **El riesgo es simétrico, y este lado es peor.** Mostrar horas ajenas es
       malo; ocultar que un paciente lleva 36 h prono decide igual de mal cuándo
       supinar y dónde buscar lesiones por presión.
    3. **Hay un CUARTO lector, y es el que escribe**: `obtenerEvolucion`
       (`svc_evoluciones.gs:525`) busca por `ID_EVOLUCION = CAMA_<cama>_<turnoKey>`,
       sin paciente, y `guardarEvolucion` fusiona esa fila en el payload. Si la
       cama rota **dentro del mismo turno** (alta 10:00, ingreso 14:00), le
       inyecta al nuevo el pid del anterior. Filtrar en los tres lectores no toca
       esto.
    - Moraleja de método: **el harness en verde no valida un cambio clínico.** La
      guardia la escribió quien hizo el cambio, y solo medía la ausencia de la
      herencia — nunca lo que se perdía por el camino.
  - ✅ **CERRADO POR EL ALTA (6-ago-2026), con la regla clínica que dio Manuel:**
    «cada vez que se da de alta al paciente debe eliminarse el conteo de horas de
    prono; lo mismo si se marca el supino». Se atacó la CAUSA, no los lectores:
    - `darAltaPaciente` llama ahora a **`_archivarEvolucionesDeCama(idCama)`**
      después del bloque `if (pid)`. Archiva a `EVOLUCIONES_ARCHIVO` y saca de la
      hoja viva **todas** las filas de esa cama — las del episodio sin
      `PATIENT_ID` y las huérfanas de un ocupante anterior. Nada se borra sin
      archivar antes. Con eso el siguiente ocupante ya no puede heredar nada.
    - La otra mitad de la regla **ya se cumplía**: `_pronoAbiertoTS` cierra el
      ciclo en cuanto ve `RESP_SUPINO_EVENTO` (`svc_evoluciones.gs:821`).
    - `_archivarEvolucionesDeCama` **NO** se llama desde `_limpiarCamaInterno`, a
      propósito: `moverACamaVacia` lo usa con el paciente vivo y ahí las filas se
      reetiquetan. Fijado en el bloque 10c de la guardia (el traslado archiva 0).
  - ⚠️ **Lo que sigue abierto: `limpiarCamasManual`.** No archiva, y es correcto
    que no lo haga: es una herramienta de reparación que puede correrse con el
    paciente todavía en la cama, y ahí archivarle sus evoluciones lo dejaría sin
    historia en pantalla. Ahora **avisa por consola** cuántas filas vivas deja y
    recomienda dar el alta si la cama va a recibir a otro paciente. Los bloques
    1, 2 y 9 de `checks/prono_paciente.js` miden esa ruta con su número (87 h).
  - ✅ **LA RESACA YA TIENE RUTINA (10-ago-2026, `mantenimiento.gs`, solo
    servidor).** El archivado por cama impide que se ensucie de aquí en
    adelante, pero no limpia lo que quedó de antes: camas cuya hoja viva mezcla
    filas de DOS pacientes. `repararEvolucionesAjenasSIMULACRO()` /
    `...CONFIRMAR()` archivan a EVOLUCIONES_ARCHIVO **solo lo inequívoco**:
    filas con `PATIENT_ID` distinto y no vacío al del ocupante, o cualquier fila
    en cama LIBRE. **Las filas sin `PATIENT_ID` no se tocan jamás** —y tampoco
    las de una cama ocupada cuyo censo perdió el pid—: solo se informan al final
    del registro. Es la lección de la reversión del 6-ago escrita en código; el
    pid se regenera al re-ingresar, así que archivar una fila anónima puede
    borrarle la historia al paciente que está en la cama. Respalda antes de
    tocar nada (si el respaldo falla, cancela entero), copia al archivo ANTES de
    borrar y deja `REPARAR_EVOS_AJENAS` en AUDIT_LOG. Idempotente. Guardia
    `checks/reparar_ajenas.js` (26 asserts, **verificada fallando**: al
    archivar también las filas anónimas se ponen 6 en rojo).
  - Ojo: **deroga la premisa «la hoja viva solo tiene el episodio en curso»**,
    que aparece escrita como verificada en revisiones anteriores y que sigue
    guiando a quien escriba un pipeline. Regla que la reemplaza, con su límite:
    **en análisis y pipelines, filtrar por `PATIENT_ID`, nunca por `ID_CAMA`
    sola. En los lectores del episodio EN VIVO, no**: ahí el pid puede faltar o
    haber sido regenerado, y filtrar esconde datos verdaderos del paciente que
    está en la cama.
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
  - **Ola 2: MEDIDA Y DESCARTADA (6-ago-2026). No reabrirla sin datos nuevos.**
    Fusionar `GET_STATS`+`GET_INDICADORES` no se hace, y el motivo es medición:
    las dos mitades ya salen **en paralelo** desde el front, así que el reloj es
    el de la más lenta; y la más lenta (indicadores) cuesta **~7×** lo que cuesta
    stats. Fusionar multiplicaría por 7 el tiempo hasta el primer dato pintado
    para ahorrar 4 viajes que coinciden una vez por sesión. Tampoco había
    lecturas duplicadas *dentro* de cada función (indicadores baja 6 hojas una
    vez cada una; stats, 4). Lo que sí salió de ahí: el criterio de las 48 h
    estaba escrito **dos veces** en `calcularIndicadores` y coincidían por
    suerte; ahora se empareja una sola vez.
- 🔴 **UNA SOLA DEFINICIÓN DE «DÍA CON VM» (8-ago-2026). CAMBIA NÚMEROS QUE EL
  EQUIPO YA VEÍA — avisar antes de pegar.** En `calcularIndicadores` convivían
  dos: el denominador de *autoextubaciones por 100 días-VM* contaba solo el
  soporte de INICIO del turno (`VENT_SOPORTE`), mientras que *VM prolongada* y
  la *mediana pre-TQT* ya contaban también el de CIERRE (`VENT_SOPORTE_FINAL`).
  Con un paciente que entraba en VNI y terminaba conectado, ese turno no contaba
  como día-VM: el denominador se quedaba corto y la tasa se disparaba — **medida
  en 100 contra una meta de 1–2, unas 11 veces**.
  - **Decisión clínica de Manuel Fuentes:** día con VM = **el paciente estuvo en
    VM en algún momento del turno**, al empezarlo o al cerrarlo. Queda como
    `_esDiaVM(e)`, usada por los dos sitios; ya no hay dos verdades.
  - **Qué se mueve:** `diasVM`, `ventilados`, `autoextPor100VM` y
    `vmProlongadaPct` (por su denominador). Los valores nuevos son más altos en
    el denominador y por tanto **las tasas bajan**. No es que antes estuvieran
    mal contados los eventos: estaba mal el universo contra el que se dividían.
  - Guardia: `checks/indicadores.js` gana un paciente P4 que entra en VNI y
    termina en VM, con dos asserts (`diasVM = 12`, `ventilados = 4`). Probado que
    protegen: con la definición vieja los dos fallan.
- **OLA 3 · EL TABLERO DEJA DE BAJAR 386 COLUMNAS PARA USAR 21 (8-ago-2026,
  solo `.gs`, sin tocar `index.html`).** Sobre la 5.45. Sale de la Ola 2: si
  indicadores es lo más caro del sistema, el problema no es cuántas veces se
  llama sino **cuánto baja cada vez**.
  1. **Lo medido:** `calcularIndicadores` usa **21 de las 386 columnas** de
     EVOLUCIONES y las bajaba enteras, dos veces (viva + `EVOLUCIONES_ARCHIVO`).
     El costo crece con el historial acumulado **aunque el rango consultado sea
     de un mes**: 2.000 filas ya son 0,77 M de celdas por pantalla.
  2. **`repoLeerColumnas(hoja, campos)`** (repo.gs) baja solo esas columnas,
     agrupadas en como mucho `_COLS_MAX_TRAMOS` bloques contiguos. El techo de
     viajes es lo importante: cada `getRange().getValues()` es un viaje de red
     con costo fijo, así que «pedir solo lo justo» puede salir **más caro** que
     bajar la fila entera. Con las 21 columnas: 1 viaje → 324 columnas, 6 → 85,
     10 → 29; la curva se aplana pasados los 10. Cae a la lectura completa si la
     hoja es chica (≤40.000 celdas) o si igual habría que bajar más de media
     fila.
  3. **`_CAMPOS_INDICADORES`** se declara junto al cálculo, no dentro del repo:
     la lista es parte de la definición del indicador.
  4. ⚠️ **La letra chica, que es lo peligroso: el campo que no se pide llega
     VACÍO, no llega roto.** Un campo olvidado no rompe nada — deja el indicador
     en 0 y nadie se entera. Contra eso hay **tres redes distintas**, y ninguna
     sobra porque cada una falla donde la otra no llega:
     - **La lista sale del código.** `checks/columnas.js` la deriva del propio
       fuente y falla si a la declarada le falta alguno, en vez de confiar en la
       memoria de quien la escribió.
     - **Lo leído a medias no se puede guardar.** Los objetos que devuelve
       `repoLeerColumnas` van marcados (`_PARCIAL`, no enumerable: no sale en
       `JSON.stringify` ni en `Object.keys`, y `esquemaObjetoAFila` recorre el
       esquema, así que no cambia ni un dato) y `repoInsertar`, `repoUpsert`,
       `repoActualizar` y `repoActualizarDonde` los **rechazan con error**. Ese
       es el daño de verdad: 21 columnas leídas y 365 en blanco, guardadas tal
       cual, **borrarían** esas 365. Hoy nadie escribe desde el tablero —lo
       comprueba el punto 9 de la guardia, con lista blanca de archivos— y esto
       existe para que siga siendo verdad sin que nadie tenga que acordarse.
     - **Auditoría con datos reales.** Con `_COLS_AUDIT` encendido, cada fila
       viaja en un `Proxy` que registra los accesos a campos **no declarados**,
       aunque hoy lleguen con valor por caer dentro del bloque de un vecino:
       justo esos son los que se romperían mañana en silencio.
  5. La guardia además **se prueba a sí misma**: quita un campo de la lista y
     exige que el resultado cambie. Anota su propio límite: 10 de los 21 campos
     viajan dentro del bloque de un vecino, así que el A/B **no puede verlos** —
     a esos los cubre la lista derivada del fuente, no la comparación.
  6. Los dobles de `repoLeerColumnas` en `checks/indicadores.js`, `checks/v42.js`
     y `sim/sim_srv.js` **recortan de verdad**: si un cálculo usa un campo que
     no declaró, el número sale mal en la simulación en vez de salir mal en la
     UCI.
  - 🔴 **EL REM NO SE TOCÓ, Y NO POR PEREZA.** `construirREM` usa 18 columnas y
    ganaría más (21×), pero tiene una trampa que ningún análisis de `e.CAMPO`
    puede ver: `_REM_EVAL_CAMPOS` (svc_rem.gs:37) son **15 nombres de columna
    leídos por variable** (`e[c]`), y son justo los que deciden la evaluación
    intermedia del formulario oficial. Olvidarlos dejaría la casilla B.3 del REM
    en 0 sin que nada fallara. Si algún día se hace: declarar
    `_CAMPOS_REM.concat(_REM_EVAL_CAMPOS)` y extender la guardia; el punto 2 de
    `checks/columnas.js` ya sabe reconocer ese patrón.
  - 🔴 **MEDIDA EN LA PLANILLA REAL Y APAGADA. `_COLS_OFF = true`.** Dos
    corridas independientes (8-ago-2026, 18:32 y 18:47) — los datos son el
    resultado de verdad de esta ola:
    | GET_INDICADORES | corrida 1 | corrida 2 |
    |---|---|---|
    | **hoja entera** | **1.465 ms** | **1.545 ms** |
    | hasta 1 lectura | 1.626 (+11%) | 1.898 (+23%) |
    | hasta 3 lecturas | 2.670 (+82%) | 1.688 (+9%) |
    | hasta 6 lecturas | 1.670 (+14%) | 2.382 (+54%) |
    | hasta 10 lecturas | 2.239 (+53%) | 2.839 (+84%) |
    - **Leer la hoja entera ganó las ocho comparaciones.** El ahorro de celdas
      es real (13× medido en Node) pero **en Apps Script el viaje pesa más que
      la celda**, y a este volumen no alcanza a pagarse.
    - **Repetir la medición es lo que la vuelve sólida:** entre las dos corridas
      **el orden de los techos se dio vuelta** (el 3 pasó de peor a mejor, el 6
      al revés) ⇒ las diferencias *entre techos* son ruido de red. Lo que no se
      movió es que la lectura entera gana siempre, y con el tiempo más estable.
      Una sola corrida habría dejado elegir «el mejor techo» sobre puro ruido.
    - **El volumen es la clave, y desmiente la premisa de la que nació la ola:**
      EVOLUCIONES tiene **136 filas** y EVOLUCIONES_ARCHIVO **90** — son
      **87.236 celdas por tablero, no millones**. La lectura por columnas sí se
      activó (136 × 386 = 52.496 > el umbral de 40.000), así que la comparación
      fue real; simplemente no hay bastante dato todavía para que gane. De paso:
      **el tablero no está lento** (1.465 ms), o sea que el problema que esto
      venía a resolver aún no ha llegado.
    - Los números traen ruido —el techo 3 no puede ser peor que el 6— pero
      ninguna corrida quedó por debajo de leer entero.
    - **El código se queda apagado, no se borra**: tiene interruptor, medidor,
      9 bloques de guardia y esta medición anotada. El día que la hoja crezca de
      verdad, `medirTablero()` vuelve a decidir. Si se reactiva, **subir antes
      el umbral de 40.000 celdas**: a 52.496 ya perdía.
    - Lo que **sí queda encendido** y no depende de esto: el blindaje de
      escritura contra registros parciales y la definición única de día-VM.
  - ⏳ **LAS DOS FUNCIONES QUE HAY QUE CORRER EN LA PLANILLA ANTES DE ENCENDERLA
    (fueron las que dieron el veredicto de arriba)**, en este orden:
    1. **`verificarTablero()`** — la que decide si los datos están bien. Con los
       datos REALES, compara el tablero por columnas contra el tablero entero
       **indicador por indicador**, en dos rangos (mes en curso y año completo,
       porque un rango vacío sale «idéntico» sin haber probado nada); revisa
       **cada 0 uno por uno** —un 0 puede ser verdad (no hubo autoextubaciones)
       o ser el síntoma, y la única forma de distinguirlo es que valga 0 en los
       dos caminos—; y lista los campos tocados sin declarar. Veredicto de una
       línea: se puede dejar puesta, o no.
    2. **`medirTablero()`** — la que decide si vale la pena. Corre el tablero
       leyendo entero y con techos de 1, 3, 6 y 10 lecturas por hoja y dice cuál
       ganó. **Si ninguno le gana a leer la hoja entera, lo correcto es poner
       `_COLS_OFF = true` y anotarlo, no dejar el código puesto por si acaso.**
    Lo medido en Node sobre 400 filas sintéticas —154.617 → 34.217 celdas, 4,5×
    menos, a cambio de 10 viajes más— **resultó ser el lado equivocado de la
    balanza**: las celdas ahorradas no pagaron los viajes. Contar celdas en Node
    predijo mal el reloj en Apps Script; por eso la regla es medir en la
    planilla y no declarar segundos que no se midieron ahí.
  - 🪤 **`_auditar` YA EXISTÍA en `api.gs`** — es el envoltorio que escribe la
    traza de auditoría de cada acción. La primera versión de la auditoría de
    columnas se llamaba igual y **la habría pisado en silencio**, porque en Apps
    Script todos los archivos comparten un único espacio global. Lo cazó
    `checks/paquete.js` al fusionar. Por eso la familia nueva lleva prefijo:
    `_colsTramos`, `_colsMarcar`, `_colsAuditar`, `_colsEsParcial`,
    `_colsExigirCompleto`. **Antes de nombrar una función nueva en este
    proyecto, `grep -rn "function nombre" v2/`.**
  - Batería: 56 guardias, la nueva incluida (9 bloques: lista derivada del
    fuente, accesos dinámicos, A/B, mutación, hoja chica, extremos del
    agrupador, escritura bloqueada, auditoría y lista blanca de usuarios). La
    simulación de punta a punta da **exactamente lo mismo que antes del cambio**
    (16/26 turnos, 8/8 egresos, 3/7 eventos, cero errores JS), comparada contra
    un worktree en `59ef890`.

- **OLA 4 — EL GUARDADO Y EL CAMBIO DE PACIENTE CON LA MITAD DE LOS VIAJES
  (8-ago-2026, rama `guardado-con-menos-viajes`, solo `.gs`).** La Ola 1 dejó
  dicho «guardar normal y re-editar no cambian»; esta ola va justo ahí. El
  costo no estaba en EVOLUCIONES sino alrededor: la fila del turno se buscaba
  hasta TRES veces (fusión, histórico de BDT, test de apnea), CAMAS_ESTADO se
  escribía hasta CINCO veces por guardado (PATIENT_ID, 2 fechas de ingreso,
  sync del turno, cache de timeline — cada una busca fila, relee y escribe),
  PROCEDIMIENTOS y TIMELINE se bajaban ENTERAS para reemplazar los 2-4
  registros de un turno (costo que crecía con el año acumulado), cada
  hito/procedimiento pagaba su propio viaje de inserción, `_tz()` bajaba la
  hoja CONFIG aparte del memo de `leerConfig`, y en producción CADA llamada
  autenticada bajaba KINESIOLOGOS para resolver la misma firma.
  - **Viajes medidos con `build/medir_guardado.js`** (repo.gs + esquema.gs
    REALES sobre hojas simuladas que cuentan getValues/setValues/deleteRows,
    con el volumen real: 136 evos + 90 archivo + 12/18 camas):
    | acción | antes | ahora |
    |---|---|---|
    | guardar turno nuevo (2 procs) | 24 | **13** |
    | re-guardar el mismo turno | 30 | **17** |
    | guardado de ingreso | 39 | **13** |
    | decanulación (BDT+apnea+4 procs) | 30 | **13** |
    | reintubación | 26 | **14** |
    | abrir paciente (GET_EVO_TURNO) | 4 | **3** |
    | reabrir turno guardado | 5 | **3** |
    | + cada llamada autenticada (prod) | +2 | **+0** (caché 5 min) |
    ✅ **Y LOS SEGUNDOS, MEDIDOS EN LA PLANILLA REAL (8-ago-2026, 20:09 y
    20:17, `medirGuardado` sobre la cama de prueba 21, antes y después de
    pegar):**
    | ms reales | antes | después |
    |---|---|---|
    | abrir paciente (GET_EVO_TURNO) | 1.414 / 1.373 | **470 / 479** |
    | guardar evolución (crear) | 6.483 | **3.364** |
    | re-guardar el mismo turno | 7.682 | **3.389** |
    Guardar bajó de ~7 s a ~3,4 s y abrir de ~1,4 s a ~0,5 s. Protocolo usado:
    pegar SOLO mantenimiento_manuel → `medirGuardadoEnCamaPrueba()` (= antes)
    → pegar repo/esquema/infra/servicios → correr de nuevo (= después). El
    medidor solo escribe en camas de prueba (valida `_esCamaPrueba`), restaura
    la cama al terminar, y las camas de prueba se retiraron después con la
    rutina quitarCamasPrueba (0 filas de historia tocadas). Pegado verificado
    carácter a carácter contra el repo vía el modelo de Monaco (longitud
    UTF-16: los emojis cuentan doble — un +1 ahí no es corrupción). SIN
    versión nueva: publicar es decisión de Diego.
  - **Cómo quedó el guardado**: la fila del turno se ubica UNA vez
    (`repoBuscarFila` + `repoLeerFila`) y esa misma sirve para la fusión, BDT,
    apnea y el upsert final (`repoUpsertEnFila` — válido porque todo corre en
    el mismo lock y nada mueve filas de EVOLUCIONES entre medio); las fechas
    de ingreso se corrigen EN MEMORIA y viajan en el ÚNICO sync a CAMAS_ESTADO
    del final (`repoEscribirFila`: fila completa desde el objeto leído, sin
    releer — todas las hojas van en formato texto `@`, la ida-vuelta es sin
    pérdida); los procedimientos se reemplazan leyendo SOLO su columna clave
    (`repoEliminarPorCols`) y se insertan en UN setValues
    (`repoInsertarVarios`); la línea de tiempo del guardado es UNA pasada
    (`_timelineDelGuardado`): lee TIMELINE una vez, borra los hitos auto del
    turno por tramos (`repoEliminarFilas`), inserta el lote (hito de ingreso
    incluido) y devuelve el TIMELINE_JSON coherente que viaja en el sync
    único.
  - **Dos bugs reales cazados de paso:**
    1. **El cache de timeline quedaba con HITOS FANTASMA**: si un re-guardado
       quitaba todos los procedimientos, `_crearHitosDesdeProcedimientos`
       borraba los hitos y retornaba SIN resincronizar TIMELINE_JSON — la
       tarjeta de la cama (obtenerTodasLasCamas lo parsea a `c.TIMELINE`)
       seguía mostrando hitos borrados. Ahora el JSON se devuelve SIEMPRE.
    2. **El borde de las filas físicas**: `repoInsertar` hacía getRange más
       allá de `getMaxRows()` cuando la hoja se quedaba sin filas — y las
       hojas de crecimiento (AUDIT_LOG suma una fila por CADA escritura)
       iban directo a ese tope. En PROCEDIMIENTOS/TIMELINE tumbaba el guardado
       entero; en AUDIT_LOG ni siquiera eso: su try/catch se lo traga y la
       traza de auditoría SE PIERDE EN SILENCIO. `_repoAsegurarFilas` expande
       antes de escribir. (La guardia lo prueba con la hoja al borde: en el
       código anterior revienta, ahora expande.)
  - **firmaDeEmail con caché de 5 min POR EMAIL** (CacheService): la lista del
    staff es configuración, no dato clínico. El trade-off dicho entero:
    desactivar a un kinesiólogo tarda hasta 5 min en propagarse al bloqueo de
    escritura. Solo se cachea el HALLAZGO: dar de alta a alguien nuevo
    funciona al instante.
  - **Guardia `checks/guardado_viajes.js`** (A/B contra worktree en
    `e664f3e`, reloj y uid congelados): respuestas de la API IDÉNTICAS en los
    8 escenarios, EVOLUCIONES byte a byte, TIMELINE/PROCEDIMIENTOS como
    conjunto (los ids autogenerados y el orden físico cambian de mecanismo),
    menos viajes con techo anotado, y los DOS controles negativos (el cache
    fantasma existe en el base; el borde revienta en el base). 🪤 El banco
    emite ~3 MB de JSON por stdout: SIN `process.exit()` tras el write —
    sobre un pipe el exit trunca a 64 KB (nos pasó).
  - **Lo que NO se tocó, y por qué**: el retry automático del front (v5.25) ya
    era seguro — repoUpsert/procs/hitos son idempotentes por turno y el hito
    de ingreso solo se crea en `accion==='crear'`; `recargarSilencioso()`
    (GET_TODAS_CAMAS + GET_EVOS_DEL_DIA tras guardar) corre en background sin
    bloquear al kine y tocarlo exigía index.html — fuera del alcance de una
    ola solo-servidor.
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

- **CELULAR · DIAGNÓSTICO MEDIDO Y FORMA ELEGIDA (10-ago-2026, mockup en
  `scratchpad/mockup_movil.html`; NO programado aún).** Diego: «hoy está difícil
  utilizar». Medido sobre la app real a 390×844, no estimado:
  · el **encabezado ocupa 270 px, el 32% de la pantalla**, antes del primer dato;
  · la tarjeta **Respiratorio abierta mide 1.325 px con 133 campos** dentro;
  · las **once secciones del acordeón se ven idénticas** (sin resumen ni estado):
    hay que abrirlas a ciegas;
  · el **nombre del paciente no aparece** en ninguna parte del panel;
  · el riel con los ✓ está **oculto bajo 1.100 px**, o sea nunca en un teléfono.
  Propuesta: encabezado en una fila (270 → 46 px), cabecera con el paciente,
  **resumen + estado por sección** (mismo criterio del riel del escritorio) y
  números en grilla de tres.
  ✅ **Diego eligió la OPCIÓN B** para la sección grande: Respiratorio se parte en
  **sub-bloques dentro del acordeón**, no en pantalla completa. Menos cambio para
  el equipo. Nada de esto toca lo que se guarda: mismas columnas, mismo guardado.

- **v5.58 · FSS-ICU Y MRC CON LA DESCRIPCIÓN A LA VISTA (14-ago-2026, cohete
  v5.58-escalas; SOLO index, sin cambio de esquema — NO exige
  `crearORepararEstructura()`).** Punto 5 del brainstorm de Diego. No es
  cosmética: **toda la confiabilidad interobservador publicada de las dos
  escalas se midió con evaluadores usando las definiciones operacionales
  estandarizadas**, así que un equipo que puntúa de memoria está usando una
  escala distinta de la que se validó — y con turnos rotando, ése es el
  escenario donde la concordancia se cae.
  - **FSS-ICU · versión chilena DE BOLSILLO** (PocketCard 28.08.18 —
    González-Seguel, Camus-Molina, Guimarães, Needham, Zanni y el grupo OACIS
    de Johns Hopkins), que mandó Diego. Cada opción se lee completa
    («4 — Asistencia mínima: realiza ≥75%») y los ítems **1 a 4 comparten
    escala**; la **marcha tiene la suya**, con distancias. Más un recuadro con
    las reglas de puntuación: se puntúa la sesión y no lo visto antes; la
    asistencia de equipos del evaluador no cuenta; lo completado con tecle o
    grúa por debilidad puntúa 0; la marcha es la mayor distancia sin descanso
    sentado y en silla de ruedas el máximo es 6; y la actividad no realizada
    **por una razón distinta a la debilidad no se puntúa** —hasta 2 se les
    asigna el promedio de las realizadas, con más de 2 el total NO se puede
    calcular—.
  - ✅ **EL ORDEN DE LOS ÍTEMS ES EL DE LA UNIDAD, NO EL DEL DOCUMENTO LARGO.**
    Al comparar salió que el documento oficial pone «sedente a bípedo» de 3 y
    «mantenerse sentado» de 4, al revés que la app. Diego: «el FSS-ICU es como
    sale en nuestra plataforma». Se deja como está — el total es la suma, así
    que el orden no mueve ningún número.
  - **MRC: la escala va como LEYENDA ÚNICA**, no repetida en los 12
    casilleros (peso del index y, sobre todo, doce copias que se
    desincronizan al primer cambio). ⚠️ Es la graduación estándar 0-5: Diego
    no encontró una traducción oficial de la unidad («es la comúnmente
    usada»), así que si el protocolo local dice otra cosa **se cambia en un
    solo lugar**.
  - 🔴 **El modo de fallo que la guardia existe para impedir**: el VALOR
    guardado sigue siendo el NÚMERO (`<option value="4">4 — …</option>`). Si
    alguien escribe la descripción sin `value`, la planilla empieza a guardar
    la frase entera y se rompen el total, la interpretación y el histórico.
    `checks/escalas_desc.js` lo asserta opción por opción.
  - ⏳ **Pendiente anotado, no programado**: la regla oficial del promedio /
    «no se puede calcular» está a la VISTA pero `sumFSS` sigue sumando a secas,
    y el `0` de la app no distingue «incapaz por debilidad» de «no evaluado».
    Programarlo exige decidir con Diego cómo se declara el «no evaluado».
  - Batería: **74 verdes**.

- **v5.57 · EL SAS QUE TIENE Y EL SAS QUE SE PERSIGUE + LA ETIQUETA DE
  CATEGORIZACIÓN FUERA DE LA VISTA (14-ago-2026, cohete v5.57-sas; index +
  `esquema.gs` + `dominio_texto.gs` + `svc_entrega.gs` — ⚠️ **EXIGE
  `crearORepararEstructura()`**, EVOLUCIONES pasa a **390 columnas**).**
  Segundo trabajo con el método PRD (`PRD_SAS_REAL.md`). Historia de Diego:
  paciente en SAS 6 con meta 4, y un solo casillero donde escribirlo.
  - 🔴 **EL PROBLEMA ERA MAYOR QUE LA ENTREGA.** El campo se narraba como
    «meta SAS» y **CUATRO decisiones automáticas lo leían como el estado del
    paciente**: el GCS automático con SAS 1, el límite de KTM al nivel 1, el
    gate de S5Q/CAM-ICU bajo SAS 3 y la matriz SOCHIMI. Escribiendo el real la
    evolución mentía sobre el objetivo; escribiendo la meta, la app le abría el
    S5Q y el CAM-ICU a un paciente agitado y lo puntuaba de bajo riesgo. **No
    había número correcto.**
  - **Reparto elegido, y por qué es el barato**: `SED_SAS` pasa a ser
    oficialmente el **ACTUAL** —que es como esas cuatro decisiones ya lo
    leían, o sea **sin tocar ninguna** y sin que ningún registro viejo cambie
    de comportamiento— y la meta viaja en `SED_SAS_META`. Lo único que cambia
    es la narración: «Sedado en escalón 2 con SAS 6 (meta 4)».
  - ⚠️ **Los registros anteriores traen un número AMBIGUO POR ORIGEN.** Diego:
    «el equipo ha sido dispar, a veces la meta a veces lo actual». No se
    recalculan y no se puede. Anotado junto a la columna en `esquema.gs` para
    que nadie lo interprete de más en un análisis futuro.
  - **La fecha de suspensión es de la sedación PROFUNDA.** Se calculaba con
    «¿el escalón es distinto de *Sin sedación*?», así que anotar precedex para
    controlar la agitación contaba como volver a sedación profunda y la fecha
    —el antes y el después para evaluar la respuesta a la suspensión de
    hipnóticos y para interpretar el GCS— **desaparecía de la entrega**. Ahora
    la casilla **`SED_VIGIL`** («😌 Sedación vigil / control de agitación»,
    opción más sencilla, elegida por Diego) la deja intacta. La etiqueta pasó a
    «💤 Sedación **profunda** suspendida el dd-mm», que dice lo que mide.
  - **`SED_FARMACOS`**: fentanyl · propofol · midazolam · ketamina · precedex,
    varios a la vez. **Cuáles, no cuánto** — las dosis viven en la ficha médica.
  - 🪤 **Corrección al propio PRD**: proponía que el SAS actual NO se replicara
    al turno siguiente. Al implementarlo resultó que **ya se replica** y que
    está en `_HER_CAMPOS` desde antes, o sea con la marca ámbar «viene del turno
    anterior» — la protección exacta que yo quería inventar. Se dejó como
    estaba; la meta se sumó a esa misma lista (Diego: «se replica, es de cambio
    diario»).
  - **⏸️ LA ETIQUETA DE CATEGORIZACIÓN, RETIRADA DE LA VISTA** (pedido suyo en
    la misma ronda: «por ahora sigue categorizando pero saca de todos los
    lugares la etiqueta de categorización respiratoria y motora»). El cálculo,
    las columnas y la serie agregada de Estadísticas **siguen intactos**; se
    apaga el chip en las TRES vistas clínicas: tarjeta de cama, panel de
    evolución y ficha de la entrega. Interruptor único
    **`_CAT_ETIQUETA_VISIBLE`** para que reponerla sea una línea. El gráfico de
    Estadísticas se conserva a propósito: es donde se mira la serie para decidir
    si vuelve.
  - Guardias nuevas: `checks/sas_real.js` (la historia turno a turno, con
    **control negativo**: con sedación profunda al día 5 la fecha SÍ se borra) y
    `checks/cat_etiqueta.js` (los tres lugares consultan el interruptor —
    quitar dos de tres es el modo de fallo de esta casa).
  - 🪤 **`guardado_viajes.js` se puso roja, y el arreglo enseña algo.** Es un
    A/B contra un commit fijo y comparaba **el texto de la evolución** byte a
    byte; como la línea de sedación sale en TODAS, los 8 escenarios difirieron.
    La narrativa se reescribe cada vez que Diego pide una frase distinta y tiene
    sus propias guardias, así que ahora se **descuenta** del byte a byte —igual
    que ya se hacía con la evolución previa de GET_EVO_TURNO— y el cambio se
    **verifica aparte** (bloque 4b: el base narraba «para meta SAS», hoy narra
    «con SAS», y el resto de la narrativa quedó palabra por palabra). Descontar
    sin comprobar habría dejado un punto ciego.
    OJO: CAMAS_ESTADO guarda una COPIA del texto (`TEXTO_EVO_DIA`/`_NOCHE`) para
    pintar la tarjeta sin releer EVOLUCIONES — por eso la roja aparecía también
    ahí y no solo en EVOLUCIONES.
  - Batería: **73 verdes**.

- **v5.56 · LA DESVINCULACIÓN DEJA AL PACIENTE DONDE QUEDÓ (14-ago-2026, cohete
  v5.56-desvinc; SOLO index, sin cambio de esquema — NO exige
  `crearORepararEstructura()`).** Punto 1 del brainstorm de Diego, y **el
  primer trabajo escrito con el método PRD** (`PRD_DESVINCULACION.md` en la
  raíz, con la historia, el inventario de consumidores y las decisiones).
  - **La causa no era un cálculo malo: era una pregunta que nadie hacía.** La
    cascada que decide `VENT_*_FINAL` (index ~6288) pregunta por intubación,
    TQT, extubación y decanulación — y **no por la desvinculación**. Por eso la
    cama seguía en «VM · CPAP/PS» con el paciente ya en alto flujo, y el turno
    siguiente lo replicaba.
  - **El dato ya se capturaba**: `DESVINC_A` es un desplegable desde la v4.2 y
    solo servía para narrar. Por eso salió **sin campos nuevos, sin columnas
    nuevas y sin tocar el servidor** — la estimación previa (un día + esquema)
    estaba equivocada y el PRD la corrigió antes de programar.
  - **Vocabulario, decidido por Diego**: el alto flujo por traqueostomía se
    llama **CTAF** (cánula traqueal de alto flujo); CNAF es la nasal y OAF el
    término general. `OAF/CTAF` pasó a `CTAF` en el catálogo de la TQT. La
    **válvula de fonación va con o sin O2 adicional** ⇒ son dos destinos y dan
    soportes distintos (Oxigenoterapia vs Ambiente). «TQT con naricera/máscara»
    **salió del desplegable**: «no tiene mucho sentido; el paso previo a la
    decanulación es el O2 adicional por válvula de fonación».
  - **Los días de VM: cero cambios de código.** Su regla —«si requiere
    reconexión se retoma esos días y empieza a sumar; los siguientes suman al
    previo y no se cuentan desde 0»— **ES** la regla de tramos de la v5.42.
    Faltaba solo que la desvinculación cerrara el tramo. ⚠️ Él contó «6 días»
    de forma inclusiva; la app usa Día 0 = día de conexión (convención BUDA,
    v5.35) y muestra 5 en ese mismo episodio. Anotado en la guardia.
  - 🔴 **HALLAZGO PREEXISTENTE DESTAPADO AL RENOMBRAR: `poblar` descartaba un
    valor guardado que ya no estuviera en el catálogo.** Al reabrir una
    evolución antigua el select se iba a la primera opción y el re-guardado
    escribía ésa — o sea **renombrar una opción le borraba el dato a los
    registros viejos, en silencio**. Era un riesgo vivo desde «Mascarilla» →
    «MR» (v5.40), no lo introdujo esta tanda. Ahora el valor guardado se
    conserva como opción, marcado «(registro anterior)».
  - 🪤 Hubo que sumar `cDesvinc` a `algunEvento` en `_podarEventosPayload`: sin
    eso, reabrir el turno para corregir la firma borraba los `VENT_*_FINAL` y
    la cama volvía a decir VM. Mismo modo de fallo que la TQT en la v4.6.
  - Guardia nueva `checks/desvinculacion.js` (5 bloques: catálogo y
    desplegable, el rescate de valores viejos, la cascada y la poda, el
    traductor corriendo en Chromium con la historia de Diego, y el ejemplo de
    los días de VM turno a turno). Batería: **71 verdes**.

- **v5.55 · UN HECHO, UN HITO — Y EL HITO NO SE DEGRADA SOLO (14-ago-2026,
  cohete v5.55-hitos; index + `svc_timeline.gs` + `svc_eventos.gs` +
  `svc_entrega.gs` + `svc_evoluciones.gs` + `dominio_texto.gs` +
  `mantenimiento.gs`, sin cambio de esquema — NO exige
  `crearORepararEstructura()`).** Nace del reporte de Diego «el ingreso en el
  timeline se duplica, una de color verde y otro color morado». No se
  duplicaba: se escribía **TRES veces**, desde tres sitios que no se conocían.
  1. **EL INGRESO TENÍA TRES AUTORES.** `ingresarPaciente`
     (`svc_camas.gs:134`) y el bloque de ingreso de `guardarEvolucion`
     (`svc_evoluciones.gs:319`) escriben cada uno su hito `tipo:'ingreso'`
     (verde, `DOT_COLORS.ingreso` = #059669), y encima el procedimiento
     `'INGRESO'` salía **morado**: el mapa `PROC_TO_HITO` tenía la clave
     `'INGRESO UCI'` y el formulario manda `'INGRESO'` (`_autoProcs`,
     index:5595), así que **nunca calzaba** y caía al respaldo genérico de la
     v5.39 como «un procedimiento más». Y como `'ingreso'` NO está en
     `_TIPOS_HITO_AUTO` —correcto: un re-guardado no debe borrar el ingreso—
     nadie limpiaba el sobrante.
     · Arreglo: la clave pasa a `'INGRESO'` y `_timelineDelGuardado`
       **comprueba antes de escribir** si el episodio ya tiene su hito de
       ingreso, sobre los datos que ya leyó (cero viajes nuevos).
     · 🔴 **El alcance de esa comprobación es lo delicado**: TIMELINE **no se
       limpia al dar el alta** (va con el cierre anual), así que mirar solo la
       CAMA encontraría el ingreso del ocupante ANTERIOR y le escondería el
       suyo al paciente nuevo — la trampa de la pronación heredada, y aquí
       peor, porque borraría un hecho. Con `PATIENT_ID` se compara el
       episodio; **sin pid** se cae a misma cama Y misma fecha, que cubre el
       caso reportado sin poder tapar jamás un ingreso verdadero.
  2. **CINCO PROCEDIMIENTOS NO TENÍAN NOMBRE CLÍNICO** y salían morados como
     genéricos: asistencia en procedimiento médico, educación a usuario/
     familia, evaluación intermedia, PCR COVID y **RECANULACIÓN** —esta
     última es vía aérea y se leía igual que un traslado a imagenología—.
     De paso, `DOT_COLORS` **no tenía color para `via_aerea` ni `kine`**: los
     dos caían al celeste de 'general', o sea la intubación se veía igual que
     una nota. Repuestos con los valores del CSS `.dot-*`.
  3. **EL EVENTO RÁPIDO PERDÍA SU DETALLE AL RE-GUARDAR EL TURNO.**
     `anexarEventoRapido` escribía «🔧 EEG 14:00 — control post crisis
     (anexo) · Klgo. …» con `tipo:'procedimiento'`, que SÍ está en
     `_TIPOS_HITO_AUTO`: el siguiente guardado lo borraba y lo regeneraba
     como «Eeg» —sin hora, sin detalle, sin la marca (anexo) y sin firma—.
     Ningún error, ningún dato clínico movido (la fila de PROCEDIMIENTOS
     queda intacta): solo el registro diciendo menos. Ahora nace con tipo
     propio `'anexo'` (fuera de la lista, igual que `'cultivo'`, que por eso
     nunca se degradó) y el guardado **descuenta su procedimiento** por el
     prefijo compartido `_hitoAnexoPrefijo` —que vive en `svc_timeline.gs`
     junto a `_TIPOS_HITO_AUTO` a propósito: lo usan el que escribe y el que
     regenera, y una sola definición es la lección ya pagada tres veces—.
  4. **LA FIRMA DE LOS EVENTOS RÁPIDOS SE CORTABA EN 15 CARACTERES**
     (`svc_eventos.gs:134`): «Klgo. Diego Melo» son 16 y en la línea de
     tiempo salía «Klgo. Diego Mel». A 60, el mismo techo de la auditoría.
  - 🪤 **`checks/eventos.js` se puso roja al mover el prefijo**: carga solo
    `svc_stats` + `svc_eventos` a propósito (svc_timeline traería su
    `_agregarHitoInterno` real y pisaría el espía del arnés). Lleva su stub,
    documentado, y quien vigila que los dos digan lo mismo es
    `hitos_unicos.js`, que usa el de verdad.

- **v5.55 · LA REINTUBACIÓN DICE HORA Y CAUSA, Y EL TIEMPO EXTUBADO SE MIDE
  CON EL RELOJ (14-ago-2026, misma tanda).** Sale del reporte de la cama 7:
  «una paciente con VNI que se intubó y en la entrega no salía la fecha de
  intubación». La primera hipótesis —el recorte de eventos— **la mató Diego
  con un dato**: «la intubación fue reciente e igualmente no aparecía». Un
  evento reciente va al final de la lista, no al principio.
  - **La causa real**: `INTUB_OCURRIO` es, textualmente en `esquema.gs:111`,
    «intubación NUEVA este turno (**paciente sin historial de VM**)», y
    `index:9075-9076` lo aplica sin excepción: con vía aérea no invasiva, si
    hubo VM alguna vez en el episodio **el bloque de intubación no aparece**
    y en su lugar sale el de reintubación. Una vez que hubo VM, todo lo que
    venga después es reintubación para siempre.
  - ✅ **DECISIÓN DE DIEGO (14-ago)**: se **queda como reintubación**, sin
    tocar la clasificación. Lo que se pidió es que quede anotada con **hora**,
    **cómo quedó** y **causa**, «considerando las horas de VM; después en un
    análisis posterior podemos discriminar si es una o la otra». Y para la
    ENTREGA, explícitamente: **evento · hora · causa**; el «cómo queda» es del
    formulario, con el resto de las transiciones de vía aérea, y **no va**.
    Razón suya: «pueden preguntar por qué falló y uno puede decir por manejo
    de secreciones o por mala mecánica».
  - **Lo que ya se guardaba y solo no se mostraba**: hora, razón, soporte
    previo, el panel «Queda con» (v4.5) y la columna `TIEMPO_EXTUBADO` de
    REINTUBACIONES, que la app **calcula sola** desde hace meses.
  - 🔴 **PERO EL TIEMPO EXTUBADO ESTABA MAL POR LOS DOS EXTREMOS.**
    `_tiempoExtubado` fechaba la reintubación con la **FECHA DEL TURNO**, y el
    turno Noche pertenece al día anterior hasta las 09:00 ⇒ una reintubación
    de las 03:00 quedaba **24 h corta**. Y encima había un
    `if (horas < 0) horas += 24`: el síntoma tapado en el resultado en vez de
    arreglado en la fecha. Ahora los dos extremos se resuelven con
    **`_tsEventoTurno`** (el mismo mecanismo del ciclo de prono, v5.33) y el
    parche desapareció. Ejemplo fijado en la guardia: extubación el 09 en
    turno Día a las 20:00 y reintubación a las 03:00 del turno Noche del 09
    —que en el reloj es la madrugada del 10— son **7 h**, no 17.
    · **NO se usa `EXT_TS`** aunque exista: lo arma el navegador con
      `new Date()`, o sea con el día en que alguien ESCRIBIÓ la evolución, que
      no tiene por qué ser el día en que se extubó. Sirve para el globito de
      las 48 h, que es un aviso en vivo; no para medir.
  - **La hora pasa a ser OBLIGATORIA al marcar reintubación**
    (`_reintubHoraFalta`, en `guardar()` y en `#gFalta`/el acordeón móvil):
    sin ella `_tiempoExtubado` devuelve '' y el análisis posterior no existe.
    Las tres ramas tienen su propio campo (`fReintubHoraN1/N2/T`) y se decide
    con las mismas condiciones de `_extReintub`, para no pedirle la hora a una
    casilla que quedó marcada en una rama que ya no aplica.
  - 🔴 **EL «QUEDA CON» SE NARRABA EN PANTALLA Y NO EN LO ARCHIVADO.** El
    cliente lo dice en sus TRES ramas (`_reintubEquipoTxt`) y `dominio_texto.gs`
    **en ninguna**: el colega leía «…se reintuba a las 03:20 con TOT N° 8.0 a
    22 cm, quedando en modo ACVC» y lo guardado cortaba en la hora. Es el
    patrón de las secreciones otra vez. Se agregó el espejo en el servidor,
    **sin tocar el fraseo** de las ramas (que difiere del cliente desde antes:
    eso es otra cosa y nadie pidió cambiar textos).
  - **La entrega deja de recortar los eventos de vía aérea.** El corte a los
    últimos 8 (`svc_entrega.gs`) no distinguía, así que en una estadía larga
    lo primero que se caía era la intubación del día 1. Ahora los eventos
    **fijos** —intubación, extubación, reintubación, TQT, decanulación,
    desvinculación y RCP— no se sacrifican nunca y ceden espacio los
    repetitivos más antiguos (PVE, prono/supino, cambios de tubo, traslados).
    No era la causa de la cama 7, pero es un defecto real por su cuenta.
  - **`corregirTiempoExtubadoSIMULACRO()` / `...CONFIRMAR()`**
    (`mantenimiento.gs`): recalculan lo ya escrito con el reloj real, leyendo
    EVOLUCIONES **y** EVOLUCIONES_ARCHIVO (los episodios cerrados también).
    Respalda antes, y **lo que no se puede calcular no se toca y se lista** —
    sin hora de reintubación o sin extubación registrada—. Idempotente.
  - Guardia nueva `checks/hitos_unicos.js` (6 bloques, **verificada fallando:
    33 asserts en rojo** contra el commit anterior). Deriva la lista de
    procedimientos del FUENTE del formulario, así que el próximo que nadie
    mapee la pone roja en vez de aparecer sin nombre. Batería: **70 verdes**.
    🪤 Al escribirla: `Utilities` no es opcional en el arnés —`_restarDias` lo
    usa y su try/catch devuelve la fecha SIN TOCAR cuando falla, así que sin
    stub el corrimiento del turno Noche desaparece en silencio y los asserts
    de horas dan el número equivocado con cara de correcto—. Y un
    `global.Utilities = {formatDate: () => '2026-08-13'}` copiado de otra
    guardia lo pisaba tres bloques más abajo.
  - 👉 **Método, para la próxima**: la explicación de la cama 7 que yo tenía
    era coherente y estaba equivocada. La tumbó **un dato de terreno de Diego
    en una línea**. Antes de dar por buena una causa, preguntar el dato que la
    puede matar.

- 🧠 **BRAINSTORM DE TERRENO — 6 HALLAZGOS DE DIEGO (11-ago-2026). ANOTADOS,
  *NO* PROGRAMADOS NI ANALIZADOS** (pedido explícito suyo: «no programes ni
  analices nada, haré un brainstorming»). Quedan aquí en sus palabras para
  retomarlos cuando él lo decida.
  1. ✅ **La desvinculación debería tener «estado previo → cómo queda», como la
     extubación.** **RESUELTO en la v5.56** — ver el bloque de arriba y
     `PRD_DESVINCULACION.md`. El turno anterior le entregó un paciente **desvinculado y
     aún sin reconexión**, porque evolucionó favorablemente. Sale la hora de
     desvinculación y todo el detalle de la VM, pero **como estado actual no
     salía la cánula de alto flujo sino CPAP/PS todavía**; recién al evolucionar
     él pudo cambiarlo a CNAF por TQT. Su lectura: la desvinculación debería
     aplicar el último estado y funcionar como el mecanismo de intubación /
     extubación / reintubación — **estado previo y cómo queda**.
  2. ✅ **Entrega de turno: una intubación que no quedó registrada (CAMA 7).**
     Una paciente que tenía VNI y se intubó: en la entrega **no salía la fecha
     de intubación**. Venía de haber sido extubada a VNI y, tras días de VNI,
     se intubó. 🔴 **No es reintubación sino intubación, por los días** que
     pasaron. **ABORDADO en la v5.55** con la decisión que tomó él: se queda
     como reintubación, pero con hora y causa en la entrega y con el tiempo
     extubado bien medido para poder discriminar después. Ver más arriba.
  3. ✅ **Meta SAS ≠ SAS real.** **RESUELTO en la v5.57** — ver el bloque de
     arriba y `PRD_SAS_REAL.md`. Conviene agregar, **además de la meta SAS, el SAS
     actual** — aplica sobre todo a los pacientes difíciles de sedar — y que
     **en la entrega salga el SAS real**.
  4. ✅ **La sedación vigil con precedex ensucia la interpretación.**
     **RESUELTO en la v5.57**: casilla de sedación vigil (no reinicia la fecha
     de suspensión) + lista de sedantes. En estricto
     rigor es sedación y persigue un SAS, pero **lo que se persigue clínicamente
     es saber cuándo se despertó o cuándo se suspendió la sedación profunda,
     porque eso marca un antes y un después** para evaluar la respuesta a la
     suspensión de hipnóticos, opiáceos y sedantes y para evaluar el GCS.
     Quizás convenga agregar **combinación de sedantes**: fentanyl · propofol ·
     midazolam · ketamina · precedex.
  5. ✅ **FSS-ICU (y MRC) con descripción a la vista.** **RESUELTO en la
     v5.58** con la versión chilena de bolsillo que mandó Diego. Hoy solo aparecen números;
     existe la versión **con descripción** de cada ítem. Quizás se pueda evaluar
     mejor con **feedback visual de qué se trata cada puntaje**: tener la info al
     lado refresca la memoria y apoya el recuerdo.
  6. **Las bases calefactoras de humidificación activa MR850 son STOCK y son
     APOYO, y hoy no están determinadas así.** Son 5 (si no se equivoca).
  7. ✅ **El INGRESO aparece DUPLICADO en la línea de tiempo**, una vez en verde
     y otra en morado. **RESUELTO en la v5.55**: eran TRES autores, no dos, y
     el morado venía de una clave mal escrita en `PROC_TO_HITO`. Ver el bloque
     de la v5.55 más arriba.
  8. **Separar «marca un hito» de «cuenta en la estadística».** Hoy los eventos
     y procedimientos manuales del turno van a la línea de tiempo *y* a la
     estadística. Diego propone que algunos puedan ser **solo hito**, para
     dejar constancia de algo que pasó sin que sume en los números. Sus
     ejemplos, tal como los dio:
     · **Ingreso a UCI** y **PCR** → se marcan **y sí van a estadística**;
     · **EEG** → **no va a ninguna parte**, pero lo puede agregar para saber
       que ocurrió;
     · **Pabellón** → **sí va**, y encima quiere poder **agregarle a mano el
       detalle**: «craniectomía descompresiva».

  9. 🔴 **AL REABRIR UNA EVOLUCIÓN YA GUARDADA SE DESMARCAN LOS BOTONES QUE NO
     SE HEREDAN (14-ago-2026, reportado por Diego desde el uso).** Sus palabras:
     «en los pacientes que estamos evolucionando en el modal de evolución, una
     vez que guardamos la evolución del día y necesitamos registrar algo más,
     los botones que son seleccionables y no heredables se desmarcan; por lo
     que al re-guardar esa evolución no conserva los botones no heredables.
     Requiero algún ajuste u otra vía para que se pueda hacer esta acción».
     · O sea: el turno se guarda bien la primera vez, pero **reabrirlo para
       agregar algo cuesta lo que ya estaba marcado** en esos botones. El
       colega no pierde el turno entero: pierde justo las marcas que no se
       replican solas.
     · ⚠️ **NO ES NUEVO Y YA ESTÁ DOCUMENTADO EN ESTA BITÁCORA**: es el mismo
       comportamiento que se le reportó a Manuel el 9-ago-2026 con el detalle
       (`fillForm` desmarca SOF/SNF/SET/A.Tos/inhalo al reabrir, y el mismo
       patrón afecta al bloque KTM, que sí pesa en el REM). Él respondió «deja
       como está el punto de las succiones» y quedó anotado como conocido y
       aceptado. **Que ahora lo reporte Diego desde el terreno reabre esa
       decisión**: son dos personas distintas tropezando con lo mismo, y la
       segunda es el dueño del proyecto.
     · Queda en el brainstorm, **sin programar ni analizar** (pedido explícito
       suyo). Cuando lo retome, es candidato claro a PRD: hay que decidir qué
       botones deben conservarse al reabrir y cuáles no, y eso es una regla
       clínica —no todos son iguales: una succión ocurrida es un hecho, y una
       casilla de estado puede no serlo—.

- **v5.54 · EL VENTILADOR EN LA HOJA + EL TABLERO USABLE EN EL CELULAR
  (11-ago-2026, cohete v5.54-ventilador; solo index, sin cambio de esquema —
  NO exige `crearORepararEstructura()`).** Tres pedidos de Diego en una ronda.
  1. **El ventilador va en la esquina superior derecha de la hoja de registro**,
     sobre el encabezado: el que llega a la ronda ve de una qué equipo tiene ese
     paciente sin abrir la app. Manda el VM de la CAMA (`VM_TAG`) y debajo, en
     letra chica, los equipos del PACIENTE (VNI, CNAF, apoyo), porque esos
     acompañan a la persona y no a la sala. El estado de falla sale en rojo.
     🔴 **Sin ningún equipo NO se dibuja la caja**: un recuadro vacío en el
     papel se lee como «falta anotarlo».
  2. **🔴 EN EL CELULAR LA GRILLA DE CAMAS TAPABA TODO EL RESTO DEL TABLERO**
     («en móvil no se ve otros servicios»). Con 18 camas a dos por fila, el
     pasillo, la bodega, los equipos en mantención y los préstamos quedaban a
     más de una pantalla de scroll. **Medido: «Otro servicio» estaba a 1.428 px
     y ahora está a 924 — 504 px menos.** Bajo 760 px se muestran solo las
     camas CON equipo, y un botón despliega las 18 para cuando hay que soltar
     algo en una vacía. El estado es de la vista: cada repintado vuelve a lo
     compacto.
  3. **Los dispositivos de apoyo (stock sin numerar) dejan de vivir
     desplegados** bajo el tablero y se pliegan dentro de «📋 Tarjetas y
     gestión», que ahora los nombra en su resumen. 🪤 Al moverlo quedaban DOS
     `#stkBody` (el del marcado estático y el nuevo): se eliminó el viejo y
     `stkRender` sale sin pintar si el contenedor todavía no existe, porque
     ahora lo crea `vmRender`.
  - 🪤 **`offsetParent` MIENTE dentro de un `<details>` cerrado** — Chrome usa
    `content-visibility`, no `display:none`. Es la misma trampa de la v5.31 y
    volvió a aparecer al verificar que el stock quedara plegado: hay que
    preguntar por `closest('details:not([open])')` o los asserts pasan solos.
  - Guardias: bloque 5d de `checks/hoja_registro_dia.js` (el ventilador, la
    falla en rojo, y que sin equipo no haya caja) y bloque móvil nuevo en
    `checks/tablero_equipos.js` (las camas vacías escondidas, el botón que las
    despliega, los 400+ px de ahorro y el stock plegado). Batería: **69 verdes**.

- 🔴 **v5.53 · LAS SECRECIONES SE DESCRIBÍAN DISTINTO EN CADA VISTA (11-ago-2026,
  cohete v5.53-secreciones; index + `svc_entrega.gs`, sin cambio de esquema —
  NO exige `crearORepararEstructura()`).** Reportado por Diego: «secreciones no
  sale las características mucosas etc». La misma regla vivía en TRES
  consumidores y **cada uno perdía un campo DISTINTO**:
  | | reología | características | cantidad |
  |---|:---:|:---:|:---:|
  | texto de la evolución | ✅ | ✅ | ✅ |
  | **entrega de turno** | ✅ | ❌ | ✅ |
  | **Hoja UCI (historial)** | ❌ | ✅ | ✅ |
  - **Por qué era invisible**: como cada vista perdía un campo distinto, ninguna
    salía vacía. La entrega decía «Secreciones fluidas +» sin decir NUNCA si
    eran mucosas o purulentas —que es justo lo que orienta a infección— y la
    Hoja UCI decía las características pero no si eran adherentes.
  - Las tres pasan a **reología · características · cantidad**, el mismo orden
    de la narrativa («secreciones fluidas mucosas en escasa cantidad»).
  - **Es el patrón que este proyecto ya pagó dos veces**: la fecha de los
    filtros vivía en cuatro lugares y uno se quedó atrás (10-ago), y «día con
    VM» tenía dos definiciones conviviendo. 👉 **Antes de tocar una regla
    clínica, buscarla en TODAS partes** — acá el `grep` de las tres columnas
    bastó para destapar los dos sitios.
  - Guardia nueva `checks/secreciones.js`: **no comprueba un texto, comprueba
    que los tres consumidores nombren las tres columnas leyendo el fuente**, en
    el mismo orden, y que el catálogo de 9 características y 3 reologías siga
    completo. Verificada fallando: al revertir la entrega se pone roja en 2.
    Batería: **69 verdes**.

- **v5.52 · LA HOJA CUENTA LAS REINTUBACIONES DEL EPISODIO (11-ago-2026, cohete
  v5.52-reintub; index + `svc_evoluciones.gs` + `api.gs`, sin cambio de esquema
  — NO exige `crearORepararEstructura()`).** La v5.51 dejaba esa casilla vacía
  porque la app guardaba SI hubo reintubación, no cuántas. Diego pidió el
  número y preguntó cómo contarlo cuando hay más de una. **La respuesta es que
  son DOS conteos distintos y no hay que mezclarlos:**
  · **La casilla del papel** es del **EPISODIO**: cuántas veces se reintubó a
    ese paciente en esta estadía. `contarReintubaciones(pids)` filtra la hoja
    REINTUBACIONES por `PATIENT_ID` — ya había **una fila por evento**, así que
    no hizo falta ni una columna nueva.
  · **El indicador de fracaso de extubación** tiene como unidad la
    **EXTUBACIÓN**, no el paciente: cada extubación programada es un intento y
    cada reintubación ≤48 h es el fracaso de ESE intento
    (`svc_indicadores.gs:124`). Un paciente extubado tres veces con dos
    reintubaciones son **3 intentos y 2 fracasos**, y su tasa es 67%, no 200%.
    🔴 Ese código NO se tocó y no debe tocarse para «hacerlo calzar» con la
    casilla: son preguntas distintas. Es el mismo error que ya se pagó con
    «día con VM» y con `sin_condiciones` —dos definiciones del mismo número
    conviviendo— y por eso quedó escrito en los dos lados.
  - **No se cuenta en el censo, a propósito.** `obtenerTodasLasCamas` corre en
    cada arranque y cada refresco, y este dato solo se usa al imprimir: va por
    su propia acción `GET_REINTUB_N`, que se paga al apretar el botón. Si esa
    llamada falla, **la impresión NO se cancela**: la hoja sale con la casilla
    en blanco, igual que antes.
  - **Cero no se imprime.** La casilla vacía significa «no ha habido»; un 0
    impreso se lee como «alguien ya lo verificó», y eso es afirmar algo que la
    hoja no sabe.
  - ⚠️ **LÍMITE CONOCIDO, dejado así con razón**: la fila de REINTUBACIONES se
    identifica por TURNO (`ID_EVOLUCION + '_REINTUB'`), así que **dos
    reintubaciones en el MISMO turno cuentan como una**. Exige extubar y
    reintubar dos veces en doce horas. Cambiarlo obliga a otro identificador y
    con eso se pierde la idempotencia que hace que re-guardar una evolución no
    duplique el evento — que es un riesgo mucho más frecuente. Consultado a
    Diego.
  - **VERIFICADO CONTRA EL CÓDIGO REAL, no razonado**: un paciente reintubado
    DOS veces en el mismo episodio (extuba 03 → reintuba 04 a las 22 h; extuba
    08 → reintuba 09 a las 35 h; extuba 14 y se va bien) da **casilla 2** ·
    **3 extubaciones** · **2 fracasos** (1 precoz, 1 tardío) · **66,7%**.
  - Guardias: bloques 5, 5b y 5c de `checks/hoja_registro_dia.js` (el conteo
    llega, el 0 no se imprime, y el servidor caído no cancela la impresión), y
    el bloque `dosEnElMismoPaciente` de `checks/indicadores.js`, que fija los
    cuatro números de arriba para que nadie «haga calzar» los dos conteos.

- **v5.51 · LA HOJA DE REGISTRO SALE CON EL PACIENTE YA ESCRITO (11-ago-2026,
  cohete v5.51-hojaregistro; solo index, sin cambio de esquema — NO exige
  `crearORepararEstructura()`).** Pedido de Diego: «fusiona el encabezado
  individual por paciente con la hoja de registro y así evitamos tener que
  hacerla». Mata el ritual de fotocopiar hojas en blanco y escribirles la
  identificación a mano. Botón **🖨️ Hojas del día** en el Registro Diario,
  junto a «Lista del día» y «Filtros».
  1. **La franja ya era la misma.** Hoja de registro y lista del día comparten
     cama·edad·nombre·RUT·días·fecha desde la v5.27; lo único que le faltaba a
     la hoja era la **línea de diagnóstico con las escalas medidas** (las que
     nadie midió no aparecen, igual que en la lista de Manuel).
  2. **Se prellena lo que la app ya sabe**: volumen tidal ajustado a talla (las
     CUATRO multiplicaciones que se hacían a mano cada día; peso ideal por la
     misma fórmula de Devine del resto de la app), calibre del tubo, cm de
     fijación, días de VA y de VM, y las fechas de los tres filtros.
     🔴 **La casilla de reintubaciones se deja VACÍA a propósito**: la app
     guarda SI hubo, no CUÁNTAS, e inventar un número sería peor que el hueco.
  3. **Sombreado en TOT o TQT** según la vía aérea del paciente (pedido de
     Diego): se ve por dónde va sin leer el número.
  4. **Solo la carilla 1** en la tanda del día (decisión de Diego): la
     neuromuscular es DIURNA y no se llena todos los días para todos. La hoja
     COMPLETA sigue saliendo del historial — `rkHojaHTML(c, fecha, soloCarilla1)`.
     17 pacientes = 17 carillas.
  - 🔴 **LA GEOMETRÍA SE MIDIÓ EN EL PDF OFICIAL A 200 dpi, no se estimó**, y
    destapó cuatro infidelidades que venían de la conversión del docx de la
    v5.27 y que nadie había notado en un año:
    · **la banda de turnos NO lleva recuadro gris** — en el papel es texto en
      negrita suelto sobre la tabla;
    · **la letra estaba en 7,2 pt** cuando el original ronda los **8,4**;
    · **faltaban el encabezado y el pie institucionales** (Hospital San Pablo,
      Unidad de Paciente Crítico Adulto, «Departamento de Calidad y Seguridad
      del Paciente» y los logos). Repuestos SIN peso nuevo: esos logos ya
      viajaban en el index para la Hoja APK;
    · **el laboratorio tenía DOS títulos** —«LABORATORIO» y «PROCEDIMIENTOS Y
      OBSERVACIONES»— y una zona ancha de escritura con línea por fila; la
      conversión los había fundido en una grilla pareja de 5 columnas. Repuesto
      y, por pedido de Diego, con **6 casillas de gases** (el papel traía 4) y
      el bloque de observaciones de 354 px.
  - 🪤 **EL ALTO DE FILA ES 14 px Y NO SE SUBE.** Cuando Diego pidió más espacio
    para soporte ventilatorio y auscultación lo subí a 20, y eso **estiró el
    bloque de vía aérea** —que comparte esas filas— hasta volverlo cuadrado
    (1,5:1) cuando en el papel es **2,5:1**. Él lo cazó a ojo. El espacio que
    hacía falta era de **ancho**: la etiqueta pasó de 56 a 127 px. Regla para la
    próxima: en esta hoja el aire se gana ensanchando la etiqueta, jamás
    subiendo la fila.
  - **Cuadratura**: las cuatro tablas comparten la etiqueta (16,6%) y el 83,4%
    restante va en 9 columnas, que se dividen en **tres grupos de 3** — por eso
    TURNO DÍA, TURNO NOCHE y VÍA AÉREA miden exactamente lo mismo y sus bordes
    caen sobre bordes de columna de los bloques de abajo. La banda dejó de ser
    un div flex de tres tercios (que solo coincidía por casualidad) y es una
    **fila de la misma tabla**, así que se alinea por construcción.
    Horario de atención quedó en **4 y 4** por decisión de Diego (el papel trae
    4 en el día y 5 en la noche).
  - Queda en **2,2:1** contra el 2,5:1 del papel: igualarlo exige darle más
    ancho a vía aérea y ahí se pierde la cuadratura. Diego eligió la cuadratura.
  - Guardia `checks/hoja_registro_dia.js` (11 bloques, incluidas la geometría
    medida y que la hoja **cabe en una carilla** con nombre y diagnóstico
    largos). 🪤 Al escribirla: `#rkPrint` vive oculto y solo se revela en
    `@media print` — hay que destaparlo antes de medir o todo da 0 y los
    asserts pasan solos. Batería: **68 verdes**.

- **v5.50 · EL PANEL EN EL CELULAR (10-ago-2026, cohete v5.50-celular; solo
  index, sin cambio de esquema — NO exige `crearORepararEstructura()`).** La
  opción B, programada. Todo vive bajo 740 px; en el escritorio no cambia nada
  (allá manda el riel lateral, que dice lo mismo con más espacio).
  1. **Cabecera del paciente** (`#mPac`, sticky): cama, nombre y el estado
     clínico del turno (VA · soporte · modo) + días + fecha/turno. Antes el
     panel decía «CAMA 4» y **el nombre no aparecía en ninguna parte**.
  2. **El acordeón dice qué hay adentro.** Cada `.fcard` lleva estado
     (`✓ con datos · ! falta algo obligatorio · — sin registrar`) y un resumen
     de lo registrado. Los obligatorios son **los mismos del riel**, pero se
     ubican por `contains(elemento)` en vez de por el título de la tarjeta —
     un título se cambia y nadie se acuerda del riel.
     - 🔴 **El resumen se DERIVA del formulario, no se escribe a mano.** Un
       texto por sección se desactualiza en silencio en cuanto alguien agrega
       un campo; esto siempre muestra lo que hay.
     - 🪤 **Error cometido y corregido al escribirlo**: la primera versión
       usaba `offsetParent` para saber si un campo cuenta, y con la tarjeta
       PLEGADA todos los campos son invisibles ⇒ el encabezado decía «sin
       registrar» encima de datos que sí estaban. `_mOculto()` distingue los
       tres mecanismos de plegado (`.fcard-body`, `.msub-b`, `.pre-uci`) de un
       gate de verdad (`.hidden` o `display:none` puestos a mano).
  3. **Respiratorio en tres sub-bloques** (💨 Ventilación · ✂️ Eventos de vía
     aérea · 🫁 Manejo respiratorio), cada uno con su estado y su resumen.
     Ventilación arranca abierta; los otros dos plegados.
     - 🔴 **Se agrupa POR RANGOS CONTIGUOS y no se mueve ni un bloque de
       sitio.** El orden de la sábana es una decisión clínica tomada —la TQT
       antes del módulo ventilatorio (v5.1), el prono al inicio de la terapia
       (v5.44)— así que reordenar «para que quede más ordenado» sería deshacer
       eso sin que nadie lo pidiera. Los cortes se declaran por ID (`M_SUBS`),
       no por posición: un bloque nuevo cae solo en el grupo que le toca.
     - El envoltorio **no pisa los gates**: ellos esconden el bloque de adentro
       (`dVentBloque`), el plegado esconde el de afuera.
  4. Medido: el encabezado de la tarjeta Respiratorio pasó de **113 a 76 px**
     (el título largo se llevaba una línea entera y dejaba el ✓ y la flecha
     solos en la suya; `flex:1 1 0` en vez de `auto` lo arregla — con
     `flex-wrap` un ítem que no cabe se va a la línea siguiente en vez de
     encogerse).
  - Guardia `checks/movil_panel.js` (8 bloques, celular + escritorio).
    Batería: **67 verdes**.
  - ⏸️ **NO se tocó el encabezado de la app** (las tres filas que ocupan 270 px)
    aunque el mockup lo proponía: esa maqueta es la **opción C que Diego eligió
    en v5.13** entre tres, y `movil.js` la asserta entera. Cambiarla es
    deshacer una decisión suya — hay que preguntarle primero.
  - ⏸️ Pendiente de la misma ronda: los campos numéricos en grilla de tres
    (~el doble por pantalla). Exige tocar el marcado que comparte `renderParams`
    con el escritorio; se dejó para después de que el equipo pruebe esto.

- **v5.49 · REDISEÑO SUAVE DE LA SÁBANA: LA FICHA SE PLIEGA Y LOS CAMPOS DICEN
  CÓMO ESTABAN (10-ago-2026, cohete v5.49-ficha; sin cambio de esquema — NO
  exige `crearORepararEstructura()`).** Los dos primeros puntos de los tres que
  pidió Diego para traer del prototipo lo que sirve sin tocar lo que funciona
  («sacar las mejores funcionalidades del rediseño a lo que ya tenemos»). El
  tercero —guardado por bloques— quedó **explícitamente fuera por decisión suya**
  tras el análisis (ver más abajo).
  1. **«Antes: X → Y» bajo los campos de ESTADO.** El ámbar de `.heredado` cubre
     las MEDICIONES y deja fuera a propósito vía aérea, soporte, modo y tubo
     («son hechos que persisten entre turnos, no mediciones»). El ejemplo que dio
     Diego —modo CPAP/PS → ACVC— es justo uno de los excluidos: **esto no duplica
     el ámbar, cubre el hueco que deja**. Mientras el valor se mantiene la línea
     dice «Antes: CPAP/PS»; al cambiar pasa a «CPAP/PS → ACVC» resaltado.
     `_ANTES_CAMPOS` son SEIS (`fVA`, `fSop`, `fModo`, `fTOTn`, `fTOTcm`,
     `fTQTn`) y la guardia fija que **ninguno esté además en `_HER_CAMPOS`**:
     un campo con las dos marcas confunde en vez de avisar.
     - **Sin evolución previa no se dibuja NADA** (primer turno del episodio,
       ingreso): inventar un «antes» sería peor que callar.
     - Es la red que habría delatado el incidente de la cama 16 (un GCS de una
       paciente cooperadora arrastrado a otra que llegó intubada y sedada).
     - ⚠️ **Cambio de servidor**: `obtenerEvoTurno` devuelve la previa
       **SIEMPRE**, no solo cuando el turno no existe — al re-editar es cuando
       más se mira qué cambió. **No cuesta una lectura más**: recorre el mismo
       `evos` que la Ola 1 ya deja en memoria (medido: reabrir sigue en 3
       viajes). `guardado_viajes.js` cazó la diferencia en el A/B y ahora la
       **verifica aparte** en vez de disimularla (control: el base mandaba
       `previa: null`).
     - Trampa que NO mordió pero está fijada: `poblar()` cambia las OPCIONES de
       los selects al cascadear, no el elemento, así que el span hermano
       sobrevive. Si alguien reemplaza el contenedor, la guardia se pone roja.
  2. **La ficha del episodio se pliega** («solo la primera vez se ingresa la
     info más a detalle y luego queda solo lo clínico»). Las evaluaciones
     pre-UCI de 📊 General —hora de ingreso, Barthel, Charlson, APACHE II,
     ECF— viven ahora en `#fPreUci` y se resumen en una línea con el nombre y
     los puntajes. **Día Estadía y AET quedan fuera**: el primero se mira todos
     los turnos y el segundo se decide DURANTE la estadía.
     - 🔴 **Lo peligroso, y por eso hay dos asserts con estrella**: plegar es
       `display:none`, **no** sacar del DOM. Los campos siguen en el formulario
       y su valor viaja igual al guardar. Si alguien los quitara, guardar un
       turno **borraría los datos del paciente**. `display:contents` cuando está
       abierto deja la maqueta idéntica a antes de envolverlos.
     - En un INGRESO nunca se pliega, y sin datos tampoco (un resumen vacío
       ocupa lo mismo que los campos y no dice nada).
  3. **✏️ en la tarjeta de cama** (opción A de las dos que se ofrecieron; el pie
     ya tenía cuatro botones). Abre el panel con la ficha desplegada —
     `abrirPanel(id, esIng, verFicha)`. **Tapa un agujero que nadie había
     reportado**: `abrirPanel` hace `esIng ? show('fcId') : hide('fcId')`, así
     que pasado el ingreso **no existía ninguna vía para corregir un nombre mal
     escrito, un RUT o el diagnóstico** hasta el egreso. El mismo control
     destapa 👤 Identificación.
     - 🪤 `.pname` tenía `overflow:hidden` + elipsis: el botón quedaba dentro y
       un nombre largo se lo comía. Ahora el nombre va en su propio `<span>` que
       trunca y el ✏️ es hermano suyo con `flex-shrink:0` — **lo cazó la propia
       guardia**, que primero salió roja por el `flex-shrink` por defecto.
  - Guardia `checks/ficha_y_antes.js` (10 bloques, servidor + cliente).
    Batería: **66 verdes**.
  - 🚫 **GUARDADO POR BLOQUES: ANALIZADO Y NO PROGRAMADO (decisión de Diego,
    10-ago-2026).** Se midió antes de opinar y el veredicto es que **no es
    imposible pero hoy no paga**:
    · La mitad del mecanismo YA existe: `guardarEvolucion` rellena desde la fila
      previa todo lo que el payload no trae (`if (!(k in datos))`), o sea que
      escribir un payload parcial sin borrar el resto ya funciona.
    · Lo caro es otra cosa: **el sistema no tiene el concepto de «turno a
      medias»**. El REM cuenta cada fila de EVOLUCIONES como día-cama
      (`DIAS_CAMA: evoMes.length`, svc_rem) y los indicadores como paciente-día;
      además la grilla, la entrega y la alerta de «faltan evoluciones» leen
      «existe» como «hecha». Un bloque guardado y nunca terminado ya suma.
    · Habría que mapear las 387 columnas a diez bloques, y ese mapa **falla en
      silencio**: la columna nueva que nadie mapee no se guarda nunca desde los
      botones de bloque, sin error.
    · **Sería más lento**: guardar cuesta ~3,4 s medidos (Ola 4); ocho bloques
      por separado son ~27 s contra 3,4. Escribir menos columnas no ahorra nada
      — eso ya lo demostró la Ola 3.
    · Las obligatorias **cruzan bloques**: la firma vive en Planes y la vía aérea
      en Respiratorio, así que guardar «solo la ventilación» exigiría relajarlas
      y empezarían a existir evoluciones sin firma.
    · Y lo que decide: **el navegador siempre tiene el formulario completo
      cargado** (no es como el prototipo, donde cada bloque es otra pantalla),
      así que mandar un pedazo no protege nada que el guardado completo no
      proteja ya. Lo único que agrega el parcial es poder guardar ANTES de tener
      el turno completo — que es a la vez el beneficio y el riesgo.
    · Donde sí tendría futuro es **en el celular**, y eso es rediseño de la
      captura, no un botón. Reabrir solo con datos nuevos de uso.

- **v5.46 · AFINADO DE TERRENO: 12 PUNTOS DE DIEGO EN UNA RONDA (9-ago-2026,
  cohete v5.46-afinado; sin cambio de esquema — NO exige
  `crearORepararEstructura()`).** Todos decididos por Diego tras uso real:
  1. **Entrega limpia**: cooperación FUERA de la ficha (SAS/GCS la dicen
     mejor); litros SOLO con naricera/mascarilla simple; flujo SOLO con CNAF;
     Venturi (MMV) solo FiO₂ (`_entParams` mira soporte y modo). GSA y cuff
     siguen fuera por decisión, no por olvido.
  2. **Bodega en CUATRO divisiones** VMI·VNI·CNAF·APOYO proporcionales al
     número de equipos; las tarjetas de gestión repiten esa distribución;
     «Equipos médicos» y «Otro servicio» comparten fila (`.vmz-fila2`).
  3. **Stock arrastrable**: los chips de Aerogen/capnógrafos viven en la
     división APOYO con su ×disponible y se ARRASTRAN — soltar en una cama
     descuenta 1 (`ASIGNAR_STOCK`), devolver a bodega repone, cama→cama
     encadena las dos. Payload de drag `STK|id|camaOrigen`. Se aplica al
     soltar SIN modal (es conteo reversible; los equipos con nombre siguen
     confirmando). La guardia stock.js pasó de «NO se arrastra» a la regla
     nueva.
  4. **Prono/supino SOLO con VM** (`_gatePronoStrip`): el prono vigil es
     excepcional y sin evidencia hoy; queda el texto libre para ese caso.
     Ocultar NO borra lo marcado.
  5. **Interacción P-VM parte VACÍA** («--»): nada se narra ni se inhabilita
     (Ppl/AutoPEEP) sin elección; elegir Asincrónico sigue bloqueando. Mata el
     «amanecen asincrónicos» de la réplica.
  6. **KTM de noche NO APLICA**: el gate nocturno ponía «no realizada» y cada
     evolución nocturna narraba «KTM no realizada.» — ahora estado NEUTRO
     (`setKTMstate('')`), payload `KTM_NO_REALIZADA=''` con SHIFT Noche, ni
     frase ni estadística (la manual nunca tuvo casilla nocturna).
  7. **«Sin secreciones» evaluado SE NARRA** (botón «−», mismo criterio de la
     UMA (−)); el no-registro sigue mudo; el placeholder de características ya
     no dice «Sin secreciones» (confundía placeholder con hallazgo).
  8. **Días de VM congelados en el formulario**: `_diasVMSellado/_diasVNISellado`
     (de la evolución previa/reeditada) respaldan el campo cuando el soporte no
     está vigente — la extubada mostraba vacío porque el contador vivo daba 0 y
     pisaba el sellado de tramos (v5.42). La grilla ya estaba bien.
  9. **CPAP (VNI) narra su presión única** «CPAP 8 cmH₂O» en ambos motores —
     la línea IPAP/EPAP daba «IPAP ?/?» porque la presión vive en la columna
     del PEEP.
  10. **Auscultación sin oxímoron**: se decide con el VALOR del select y sin
     mayúsculas (cliente miraba chips de otro widget; servidor comparaba
     'sin…' vs 'Sin…') — ya no sale «con Sin ruidos agregados».
  11. **Aviso de desfase → opción B**: mensaje de UNA línea («N partes
     quedaron contando otra cosa»), «Guardar mi texto tal como está» sigue
     primario, y el detalle bloque a bloque queda PLEGADO en «🔍 Ver
     diferencias» con scroll propio. La columna TEXTO_BLOQUES no se tocó.
  12. Guardias: nueva `checks/afinado.js` (30 asserts servidor+cliente) +
     `tablero_equipos.js` a 4 divisiones + `stock.js` a la regla nueva.
     Batería: **62 guardias verdes**.
- **v5.45 · LA ENTREGA CON LOS DATOS QUE FALTABAN (8-ago-2026, cohete
  v5.45-datos; sin cambio de esquema — NO exige `crearORepararEstructura()`).**
  Reporte de Diego: «hay datos importantes que no aparecen en la entrega,
  como el GCS o la mecánica ventilatoria». Se levantó el inventario completo
  (registrado vs mostrado), mockup con 2 opciones y Diego eligió la **A
  (integrada)**: todo entra a los casilleros existentes sin mover la grilla.
  1. **Neuro·HDN**: GCS con desglose `GCS 8T (O2·V1T·M5)`; PIC/PPC solo si
     existen; **«💤 Sedación suspendida el dd-mm»** y «BNM suspendido el
     dd-mm» — fecha de la ÚLTIMA transición sedado→sin (recorre el episodio;
     si lo re-sedan desaparece sola: valor no vacío = HOY sigue suspendida).
  2. **Parámetros**: segunda línea con la mecánica medida `Pmax · Ppl · DP ·
     Cest · PaFi` (`_entMec`; AutoPEEP/Ti/I:E quedan en el historial).
     OJO: la Cest es la columna **CALC_CESR** (no CALC_CEST).
  3. **Vía aérea**: `TOT N° 8.0 · 22 cm` / `TQT N° X` (respaldo en cama).
  4. **Barra**: chip morado `⚕ fase` (FASE_JSON del turno, respaldo cama).
  5. **HITO MOTOR MÁS ALTO** (`_hitoMotorEpisodio`, ejemplo textual de Diego:
     01-08 en cama analítico · 02 SBC · 03 en cama ⇒ «SBC (02-08)»): manda el
     **IMS** si se registró; sin IMS se traduce el **nivel KTM** (1-2 en cama ·
     3 SBC · 4 bípedo · 5 marcha; IMS: 0-2 · 3 · 4-5 · 6-10). Fecha = **última
     vez que se alcanzó** (decisión de Diego: dice qué tan vigente es la
     capacidad). Va primero en Rehabilitación, al lado del KTM de HOY ⇒ el
     retroceso se ve al tiro. Matiz avisado: el nivel KTM dice qué se TRABAJÓ,
     no siempre qué se logró — con IMS anotado se corrige solo (empujón
     natural para llenar el IMS).
  - Sirve HACIA ATRÁS (columnas que ya existían). Guardia
    `checks/entrega_datos.js` (24 asserts, servicio + render, con el ejemplo
    fecha a fecha). Batería: **56 guardias verdes**. Pendiente conversado y
    NO programado: GSA y cuff quedan fuera de la entrega (criterio: son de
    historial); candidatos a sacar (cooperación, litros/flujo con VM) sin
    decidir.
- **v5.44 · BLOQUES A/B/C DE DIEGO: FECHAS DE DISPOSITIVOS, MOTOR DE TEXTO Y
  PRONO JUNTO A LA TQT (7-ago-2026, cohete v5.44-terreno; sin cambio de
  esquema — NO exige `crearORepararEstructura()`).** Ronda pedida por Diego con
  los reportes de un colega (Álvaro) y el desfase de dispositivos visto en
  terreno. Servidor publicado primero (aprobado por Diego), front después.
  1. **Bloque A · dispositivos por FECHA DE ETIQUETA**: etiqueta = día 0; el
     cambio se hace en el turno **NOCHE** del día etiqueta+frec (HME 2 días,
     HEPA y Trach Care 3 — la TC va como el HEPA, confirmado con el ejemplo).
     El chip del formulario y la entrega muestran la **fecha exacta** de
     cambio (dd-mm), no días; `vencido` recién con dias>frec — la regla vieja
     («instalación = día 1» + fecha efectiva) avisaba un día ANTES: ese era el
     desfase. `_sumarDiasISO` suma a mediodía UTC (mata el corrimiento de
     huso). `cambiosEstaNoche()` + API `GET_CAMBIOS_NOCHE` + botón/modal 🌙 en
     el Registro Diario. La medición usa la fecha del TURNO (no la efectiva);
     el dispositivo nuevo instalado de noche se etiqueta D+1 (mecanismo de
     fecha efectiva que ya existía). VALIDADO fecha a fecha con el ejemplo de
     Diego (ingreso 04/08 → noches del 06 y 07) en `eventos.js` sección 6b.
  2. **Bloque B · motor de texto (cliente y servidor a la par)**: meta PAM
     inmediatamente tras la HDN («HDN estable c/DVA en dosis bajas para meta
     PAM 65 mmHg» — JAMÁS llegaba al texto); escalón SIEMPRE con su SAS
     (la rama BNM se lo comía); fases «En proceso de weaning/rehabilitación/
     reanimación» y «A la espera de second look» (`_faseIntro` espejado);
     TOT «N° 8.0 a 22 cm de arcada dental» (fijación ESTANDARIZADA: el select
     pasó a hidden fijo, la norma va en la etiqueta del campo); la no-PVE se
     narra con su razón («Decisión médica» incluida — eso era la «decisión
     médica» del reporte, aclarado por Diego); resultado de cultivo viaja a
     la entrega; **firma y «Posicionamiento:» FUERA del generador** (la firma
     del registro sigue en su columna). **Obligatorias nuevas en guardar() +
     #gFalta**: con TOT hay que declarar PVE sí/no; KTM no realizada exige
     razón; contraindicada exige protocolo o descripción.
  3. **Bloque C · prono/supino junto a la TQT**: franja 🔃 propia al inicio de
     Terapia ventilatoria (mismos IDs de v5.32 ⇒ fillForm/payload/globitos
     intactos: solo se movió el marcado); el colapsable 📐 queda con sedente/
     DCL/texto libre y ya no se narra. Un ciclo prono→supino = **UN evento**
     en estadística (guardarEvolucion filtra SUPINACIÓN de PROCEDIMIENTOS;
     el timeline conserva ambos hitos); el texto narra «Se prona a las X hrs»
     / «Paciente continúa en prono» / «Se supina …, tras Y h en prono».
  - Guardia nueva `checks/reporte_colega.js` (28 asserts: los formatos, la
    franja, las obligatorias y el modal 🌙). Actualizadas a la regla nueva:
    `disp_fecha`, `texto_bloques`, `panel_ux`, `via_aerea_previo`, `eventos`.
    Batería completa: **55 guardias verdes**.
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
  - ✅ **CERRADO (8-ago-2026, decisión de Manuel adoptada por Diego)**: era el
    pendiente de la pronación heredada — al liberar una cama las evoluciones no
    se archivaban y `_pronoAbiertoTS` busca por CAMA, así que el ocupante
    siguiente heredaba una pronación abierta ajena («tras 108,5 h en prono» con
    horas de otra persona). Salida elegida: **archivar POR CAMA**
    (`_archivarEvolucionesDeCama`), único camino tanto del alta como de
    `limpiarCama`. Barrer por PATIENT_ID —el intento anterior— dejaba vivas las
    filas huérfanas y los episodios sin identificador, que es justo lo que se
    hereda; y filtrar en los lectores escondía pronaciones verdaderas del propio
    paciente. `limpiarCamasManual` sigue SIN archivar a propósito (es
    reparación, puede correrse con el paciente en la cama) pero ahora avisa
    cuántas filas vivas deja.
  - Reglas de convivencia que SÍ funcionaron: fetch antes de trabajar, avisar
    por #mejoras-rce antes de pegar, una sola persona publica.
    ⚠️ **«Una sola persona publica» quedó DEROGADO el 14-ago-2026** por Diego:
    publican Manuel o él, y lo que sostiene la convivencia pasó a ser el
    **aviso** (repo o Slack). Ver la regla vigente al inicio de este archivo.

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
  (ahí se afina el registro con uso real). Deployment: cohete **v5.58-escalas**
  (antes v5.57-sas, v5.56-desvinc, v5.55-hitos, v5.54-ventilador, v5.45-datos, v5.44-terreno, v5.43-cierres, v5.42-tramos, v5.41-vni, v5.40-equipos, v5.39-timeline, v5.38-entrega,
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

- **v5.59 · LA HOJA DIARIA CON SUS DOS CARAS (14-ago-2026, cohete
  v5.59-hoja2caras; SOLO index — NO exige `crearORepararEstructura()`).**
  Ronda de terreno de Diego tras publicar él mismo la v5.58.
  - **«VT AJUSTADO A TALLA»**: el título largo del volumen tidal partía la
    fila y desfasaba el bloque. Abreviado, medido en la guardia.
  - **La fecha de cambio de cada dispositivo, impresa**: junto a la etiqueta
    va la fecha que se le ESCRIBE al dispositivo nuevo («hoy en la noche
    cambian los HME del 13 y se les pone fecha del 15»). La cuenta es LA MISMA
    de `_flEstado`/`estadoDispositivos` (cambio = etiqueta + frecuencia) — se
    reusó, no se re-escribió, para que la hoja impresa no contradiga jamás al
    modal «Cambios de esta noche» ni a la entrega. A diferencia de la hoja de
    filtros de la unidad, aquí NO se exige soporte VM: la hoja imprime la
    etiqueta siempre, y una etiqueta sin su cambio sería media verdad.
  - **El nombre largo ya no parte la línea**: la letra baja por tramos (11 →
    9.5 → 8.5 → 7.5pt) hasta caber. La guardia lo mide con un nombre de 50
    caracteres, no lo supone.
  - ⏪ **LA CARILLA 2 VUELVE A LA TANDA DEL DÍA** («me gustaría incluir la
    parte posterior de la hoja que ocupa mi unidad»— revierte el «solo
    carilla 1» de la v5.51). Es la RK_PG2 de siempre (MRC-ss, FSS-ICU,
    protocolo de weaning/PVE, del docx v5.27) más lo nuevo: **la última
    medición de MRC y FSS-ICU impresa con su fecha** («44/60 (10-08)»),
    desde ULT_MRC/ULT_FSS de la cama. Sin medición: «—», nunca un número
    inventado. Toast: «N pacientes × 2 carillas».
  - 🪤 Las carillas 2 CORRIERON LOS ÍNDICES de la guardia
    (`hoja_registro_dia.js`): página [1] pasó a ser el reverso de la cama 4 y
    ocho asserts quedaron mirando la página equivocada. El arreglo bueno no
    fue re-numerar sino FILTRAR (solo carillas con «NOMBRE DE PACIENTE»):
    los bloques son por PACIENTE, no por página. Bloque 12 nuevo con los
    cuatro pedidos. Batería: **75 verdes**.

- 📮 **LAS SUGERENCIAS DEL EQUIPO, AUDITADAS CONTRA EL CÓDIGO (14-ago-2026).**
  Diego pegó las 24 filas del buzón (19 únicas; firman MCC, SOG, AWE, CMF y
  DMV). Veredicto verificado, no supuesto:
  - **Ya resueltas (6)**: motivo de KTM obligatorio (v5.46) · el ciclo de los
    dispositivos (rehecho el 10-ago) · días de VM/VAA «desfasados» (convención
    día 0 = conexión, BUDA, v5.35-42) · el texto editado que se refrescaba al
    guardar (4-ago) · estadía 0 con VM 1 (era pre-tramos, resellado corrido) ·
    **«mostrar qué SAS tuvo y no la meta» (AWE) = la v5.57 tal cual** — el
    terreno pidió lo mismo que Diego, validación independiente del cambio.
  - 🔴 **DOS RAÍCES REALES CONFIRMADAS**, ambas de la partición al archivo:
    (1) `obtenerEvosDelDia` lee SOLO la hoja viva ⇒ **el registro retrospectivo
    pierde a los egresados** (MCC: cama 7 estaba el 2-ago, egresó el 3, y
    desapareció del registro del 2). (2) La estadística tampoco los ve (la
    trampa documentada de `obtenerStats`) ⇒ **dos reportes de KTM marcada que
    «no aparece»** (2-ago y 11-ago). No se pierde ningún dato: se deja de
    MOSTRAR. Arreglo candidato: leer también EVOLUCIONES_ARCHIVO cuando la
    fecha consultada es pasada.
  - **Familia del punto 9 del brainstorm**: «al modificar los dispositivos
    pide de nuevo la PVE» (AWE) — otro caso de los botones que se desmarcan al
    reabrir. Se suma al PRD de ese punto.
  - **Candidatos nuevos**: checkbox «tiene un solo apellido» (MCC) · DVE en
    neuro (CMF — falta definición clínica: ¿presencia, altura, débito?) ·
    pendientes al texto de la evolución (AWE — hoy van SOLO a la entrega, por
    diseño; decidir si pertenecen al texto clínico) · procedimientos
    post-egreso (MCC — toca episodio cerrado y estadística, regla de Diego) ·
    revisar el cálculo de PaFi vs GSA (AWE — reproducir primero).
  - **Seguridad (AWE, 4 sugerencias)**: usuario/contraseña EXISTE completo
    detrás de `LOGIN_UI_ACTIVO` (encenderlo es decisión, no desarrollo) · el
    CSV «para evitar la nube» no la evita (los datos viven en Sheets; respaldo
    diario y archivo anual ya existen) · data masking: el RUT ya jamás sale en
    REM/tablero/exportaciones y el episodio viaja por PATIENT_ID · `.env` no
    aplica a Apps Script y no hay credenciales en el código.

## v5.60-dispositivos (14-ago-2026) — cada dispositivo sigue a lo que le da sentido

- 🛡️ **HEPA FIJO EN PB Y AVEA** (hallazgo de Diego: «no ocupan HEPA
  intercambiable cada 3 días — se mantiene desde su instalación»). Sus tres
  respuestas de borde: la fecha de instalación se muestra como referencia sin
  cambio · la Vela SÍ sigue con el ciclo · la cama sin ventilador asignado no
  aplica HEPA («podría ser HME si está con TQT o tubo a HME, y con vía aérea
  artificial podría tener Trach Care»).
- **La regla quedó en UNA función por lado**: `_hepaFijoEquipo` (servidor en
  `svc_eventos.gs`, espejo en el index) decide por PREFIJO del nombre del
  ventilador contra **CONFIG `HEPA_FIJO_EQUIPOS`** (por defecto `PB,Avea` —
  no hace falta crear la fila; si Diego la crea, manda la suya, editable sin
  código como las frecuencias). El ventilador de la cama lo resuelve
  `_ventNombreDeCama` (memo: UNA lectura de VENTILADORES por ejecución,
  mismo criterio del censo — categoría VM, ubicado en CAMA).
- **Y cada dispositivo dejó de colgar del soporte VM**: HEPA = del
  VENTILADOR (solo VM con equipo asignado; fijo ⇒ referencia sin ciclo) ·
  HME = del CIRCUITO (VM sin humidificación activa, o respirando por HME —
  modo HME con TOT/TQT aunque no haya VM) · Trach Care = de la VÍA AÉREA
  artificial (TOT/TQT, esté o no en VM — el decanulando a CTAF ahora SÍ
  aparece en la ronda y en la entrega; antes salía de todos los radares al
  salir de VM). Consumidores tocados: `estadoDispositivos` + ronda nocturna,
  entrega de turno, hoja de control de filtros (celda «FIJA (del equipo)» y
  leyenda), hoja diaria impresa («→ fija (no se cambia)»), chips del
  formulario, tarjeta Dispositivos visible también con TQT/tubo a HME sin VM,
  y el sync al salir de VM (el Trach Care sobrevive si queda TOT/TQT, el HME
  si queda a modo HME, el HEPA se descarta siempre).
- 🪤 **EL BUG DE LA HUMIDIFICACIÓN ACTIVA** (reporte de Diego: «al instalarla
  no borra la fecha del HME y sigue manteniendo la fecha de cambio»; su
  «cambio de hepa» del final era el HME). La causa fue ESTADO REDUNDANTE: la
  humidificación vive en un checkbox (`VENT_H_ACTIVA`) y en una fecha
  (`DISP_HUMID_FECHA`), y el retiro del HME solo escuchaba al checkbox —
  fechar sin marcar dejaba el filtro retirado pidiendo cambio. Arreglo por
  los dos lados: en el cliente, escribir la fecha marca el checkbox (y
  borrarla lo desmarca — `humidFechaManual`); en el servidor, `humidFinal`
  obedece a CUALQUIERA de los dos, y desmarcarla con fecha vacía la retira
  DE VERDAD (antes `val('')` la resucitaba desde el episodio). La Hoja UCI
  tampoco muestra ya reloj de HME en turnos con humidificación activa.
- **Guardia nueva `dispositivos_reglas.js`** (verificada por mutación: 27
  fallos contra la v5.59): las reglas por dispositivo, la ronda que ignora el
  HEPA fijo, el bug de la humidificación de punta a punta (guardado real),
  extubación vs weaning por TQT, la entrega, y el espejo del cliente.
  Arneses ajustados: `eventos.js` (inventario con Vela + vía aérea en las
  camas), `disp_fecha.js` (ídem) y `entrega_ancha.js` (stubs). Batería: **76
  verdes, 0 rojas**.
- **Sin cambio de esquema**: NO hay que correr `crearORepararEstructura()`.
  Entrega calculada con `que_pegar` contra la v5.58 publicada: dominio +
  index (cohete v5.60) + servicios.
- Límite conocido y aceptado: la fila HEPA de la Hoja UCI (historial) muestra
  el ciclo también para días en que el paciente estuvo en un PB/Avea — el
  historial no guarda qué ventilador había cada día. Es lectura retrospectiva,
  no alerta; se anota por si algún día molesta.
- **v5.60b, mismo día (precisión de Diego sobre los vencidos)**: «si se cambia
  a 3 días y han pasado 5, la fecha del cambio sería la de HOY — la fecha se
  corre, no se le pone la de antes de ayer». El reloj real ya hacía lo
  correcto (el dispositivo nuevo se fecha con el día real del cambio, vía
  fecha efectiva); lo que mentía era lo MOSTRADO: la hoja diaria imprimía
  «→ cambio: 10-08» tres días después. Ahora un vencido lidera con la acción
  en los cuatro lugares: hoja diaria «→ cambiar HOY (venció el dd-mm)» ·
  chip del formulario «VENCIDO — cambiar hoy (debió el dd-mm)» · entrega
  «VENCIDO — cambiar hoy (debió el dd-mm)» · modal «VENCIDO — cambiar ESTA
  NOCHE (debió el dd-mm, hace N días)». La fecha teórica pasada queda como
  dato, nunca como plan. Sección 7 de `dispositivos_reglas.js`.
  🪤 Del arreglo salió una trampa de arnés: el bloque 12 de
  `hoja_registro_dia.js` medía las fechas de cambio sobre la tanda sembrada,
  que se imprime con el RELOJ REAL — con el tag dependiente del día, la
  guardia cambiaba de opinión según el día en que corriera. Las fechas ahora
  se miden en un render de fecha fija (11-08).

## v5.61-smartevo (15-ago-2026) — lo bueno del SmartEvo, sin sus vicios

- Diego trajo el **SmartEvoGen v10** (el generador de texto que usaba el
  equipo antes de la plataforma) y pidió comparar y «hacer algo mejor uniendo
  criterios». El diagnóstico completo quedó en la conversación; lo esencial:
  varias de sus gracias YA estaban (catálogo de contraindicaciones de KTM,
  tendencia HD, PIM/PEM con interpretación, cálculos automáticos), y sus
  vicios NO se trajeron — su «coherencia clínica» corrige datos sola con
  toast (aquí lo incoherente no se puede elegir, VMAPS), mezcla vía aérea con
  soporte, todos los días van digitados a mano, y su GCS bloquea V=1 con tubo
  (lo nuestro es 1T). Dato curioso: la frase que un colega recordaba («tose,
  moviliza y deglute») NO está en el v10 — dice «Secreciones: No se
  observan» — pero el concepto valía oro y se adoptó.
- **Rescate 1 · El tercer estado de secreciones** (redacción textual de
  Diego): «tose, moviliza y deglute secreciones». Valor `'auto'` en
  RESP_SECR_QTY (sin cambio de esquema), botón «tose y deglute» junto al −,
  **solo con vía aérea artificial** (TOT/TQT; si la vía deja de ser
  artificial, se desmarca y esconde solo). Marcado apaga características y
  reología (no hay nada aspirado que caracterizar). Decisión de Diego: NO
  aplicar el rescate 4 (descripciones en el GCS). Los CUATRO consumidores en
  paridad: narrativa servidor y cliente (frase en la línea KTR o sola),
  entrega de turno y Hoja UCI (traducen 'auto' a la frase, nunca la palabra
  pelada). `secreciones.js` sección 5 vigila la paridad.
- **Rescate 2 · FiO₂ como fracción se convierte sola** al salir del campo
  (0.5→50, 0,21→21, 1→100; 55 no se toca), con toast. Delegado al documento
  (los parámetros se reconstruyen con innerHTML) sobre cualquier id con
  «fio2». Solo convierte fracciones: un valor fuera de rango se sigue
  frenando al guardar — no se inventan datos.
- **Rescate 3 · La rueda del mouse no mueve números**: sobre un campo
  numérico enfocado, la rueda lo desenfoca en vez de cambiarle el valor.
- **Guardia nueva `smartevo_rescates.js`** (navegador, verificada por
  mutación): candado de vía aérea de punta a punta, apagado y reactivación de
  características, conversiones de FiO₂ y el desenfoque por rueda.
  🪤 Trampas de arnés pagadas: un `type=number` RECHAZA la asignación de
  «0,21» por script (la coma se prueba en un input de texto propio del
  arnés), y fPIM no recibe foco dentro de su `<details>` cerrado.
  Batería: **77 verdes, 0 rojas**.
- Pendientes del SmartEvo que quedaron ANOTADOS y no programados: editor
  grande para textos largos en celular (rescate 5) y Blue Dye / presión VA al
  egreso con TQT (rescate 6, amarrado al protocolo de decanulación que Diego
  aún no manda).
- Sin cambio de esquema. Entrega calculada contra la v5.58 publicada:
  dominio + index (cohete v5.61) + servicios — la v5.61 CONTIENE a la v5.59
  y la v5.60.
- 🔴 **CORRECCIÓN DE DIEGO EL MISMO DÍA (v5.61, antes de pegar)**: el candado
  del tercer estado iba AL REVÉS. «Tose, moviliza y deglute» es precisamente
  para cuando NO hay vía aérea artificial — con TOT/TQT las secreciones se
  aspiran y se ven, y ahí van cantidad y características. Su mensaje original
  («est**n**aplica solo **son** vía aérea artificial») se había leído como
  «con» siendo «sin». Invertido en el botón, en hSecrAutoVis (con TOT/TQT se
  esconde y se desmarca solo) y en las dos guardias; la narración no cambió.
  Lección para la próxima: ante un mensaje con tecleo ambiguo en una regla
  clínica, confirmar la dirección ANTES de programarla — la lógica clínica
  (¿quién puede deglutir sus secreciones? el que no tiene cuff inflado) habría
  delatado la lectura equivocada.

## v5.62-guardado (15-ago-2026) — guardar sin fricción

- Reporte de Diego desde el uso: el botón de guardado quedaba ARRIBA del
  texto (leyendo/editando el texto había que devolverse a buscarlo) y el
  cuadro de comparación del texto editado detenía cada guardado. Pidió botón
  grande abajo o al costado y «que solo guarde antes de progresar». Se
  implementó la recomendación A+1+2:
- **A · La botonera se movió AL FINAL del formulario** (después del texto) y
  sigue pegada abajo (sticky): el botón queda a la vista SIEMPRE, incluso
  leyendo o editando el texto — que era exactamente donde desaparecía, porque
  el sticky se despega al pasar su posición natural y el texto vivía después.
  El botón además creció (52px). En celular, mismo comportamiento.
- **1 · Guardar guarda AL TIRO, sin preguntar.** El cuadro de desfase de tres
  salidas (v5.34→v5.4x) SALIÓ: se guarda exactamente lo que está en pantalla
  — lo escrito a mano jamás se pierde, que era la invariante por la que ese
  cuadro nació — y el desfase texto↔formulario se avisa con un toast que NO
  bloquea (con el conteo de partes distintas y el recordatorio de 🔄
  Regenerar). Regenerar sigue pidiendo confirmación: ese SÍ destruye la
  redacción. Las cifras clínicas nunca corrieron riesgo: viven en columnas.
- **2 · Después de guardar ya no te arrastra al texto**: éxito por toast, el
  texto queda disponible arriba de la barra por si hay que copiarlo, y
  ✖ Cerrar aparece en la misma barra para pasar al siguiente paciente.
- Guardias: `texto_manual.js` REESCRITA para la regla nueva (guarda sin
  cuadro + toast de aviso + Regenerar con confirmación + geometría de la
  barra: después del texto, sticky, botón ≥50px) y `afinado.js` actualizada
  (fijaba el cuadro viejo «Ver diferencias»; ahora fija que NO vuelva).
  Batería: **77 verdes, 0 rojas**.
- Solo cambió el index (sin esquema, sin .gs). La v5.62 CONTIENE a la v5.59,
  v5.60 y v5.61.
