# PRD · La app se instala en el teléfono, y quien escribe tiene nombre

**Estado**: propuesto — esperando dos respuestas de informática y cuatro
decisiones de Diego (§7)
**Dueño clínico**: Diego Melo · **Dueño técnico**: quien programe la tanda
**Alcance**: servir la pantalla de la app desde un sitio propio para que se
instale como aplicación, dejar que Apps Script solo entregue y guarde datos, y
exigir identidad real de Google para escribir.
**Fuera de alcance**: mover la base de datos (sigue en la misma planilla) ·
cambiar una sola regla clínica · agregar columnas u hojas · guardar sin
conexión · notificaciones al teléfono · mensajes por WhatsApp (es otro asunto y
no depende de esta tanda: ver §10) · reemplazar el Modo Coordinación.

> **De dónde sale**: Diego, 8-sep-2026: «la posibilidad de integrar PWA a
> nuestro script… sería que la app fuera una PWA con llamada vía API a Google
> Script. Analiza los beneficios y cuál sería el riesgo.»

---

## 1 · Hoy y después, en dos líneas

- **Hoy**: Google sirve la pantalla y los datos por el mismo tubo. La app vive
  dentro de un marco de Google, se pega a mano cada vez, y cualquiera con el
  enlace entra y firma con el nombre que teclee.
- **Después**: la pantalla se sirve desde un sitio propio y se instala como
  aplicación; Apps Script solo contesta datos, y para escribir hay que entrar
  con la cuenta de Google del hospital.

---

## 2 · La historia

### Antes

**03:40, turno de noche. Álvaro, cama 12.** El paciente se desatura durante la
aspiración y hay que registrarlo. Saca el teléfono.

La app es una pestaña más del navegador, entre las diez que quedaron abiertas
del turno pasado. Busca cuál era. La encuentra, toca, y la pantalla queda en
blanco tres segundos largos: el teléfono baja **1,7 MB de pantalla** cada vez,
porque Google no la deja guardar nada. Con el wifi de la unidad, a veces son
ocho segundos. Álvaro ya aprendió a tocar y esperar mirando al paciente.

Entra. Nadie le preguntó quién es: la app está en marcha blanca y **cualquiera
con el enlace pasa**. Escribe la evolución y firma tecleando sus iniciales en un
campo de texto. Si mañana alguien pregunta quién escribió eso, la respuesta es
«dice AWE» — no «lo escribió Álvaro».

**Y del otro lado.** Diego recibe seis archivos y los pega a mano en el editor,
uno por uno. El más grande y el más frágil es la pantalla: **1,7 MB** que viajan
disfrazados de base64 porque, servidos en limpio, el bootstrap de Google los
rompe. Esa historia costó días de depuración y está escrita en `CLAUDE.md` con
el nombre de «la saga del boot». Cada entrega la vuelve a pagar.

### Después

**03:40, cama 12.** Álvaro toca el ícono de RCE-KINE en la pantalla de inicio
del teléfono, junto a las otras apps. Abre a pantalla completa, sin barra del
navegador, **en menos de un segundo**: la pantalla ya está guardada en el
teléfono y solo va a buscar los datos de las camas.

La primera vez de la semana le pidió entrar con su cuenta del hospital. Hoy
entra directo. Escribe la evolución, guarda, y la fila queda con **su identidad
real**, no con las tres letras que tecleó.

Diego, esa semana, pega **cinco** archivos en el editor. La pantalla ya no: se
publica sola desde el repositorio, y el equipo la recibe la próxima vez que abre
la app.

---

## 3 · Objetivos y no-objetivos

### Objetivos

| | |
|---|---|
| **O1** | La app se instala como aplicación en el teléfono y en el PC de la unidad, y abre en menos de 2 segundos con la pantalla ya guardada. |
| **O2** | La pantalla deja de pegarse a mano: se publica desde el repositorio. En el editor solo quedan los `.gs`. |
| **O3** | Toda escritura queda firmada con una identidad real de Google, no con un campo de texto. |
| **O4** | Apps Script sigue siendo **lo único** que toca la planilla. |
| **O5** | Se acaba la saga del boot: sin cohete, sin base64, sin el parser de Google reprocesando el HTML. |
| **O6** | Hay vía de vuelta: la dirección de hoy sigue sirviendo la app durante la transición. |

### No-objetivos

Estos frenan el «ya que estamos». Cada uno se puede reabrir después, con su
propio PRD.

| | |
|---|---|
| **NO1** | **No se guarda sin conexión.** Sin red no se escribe: dos personas guardando la misma cama en modo avión y sincronizando después es la forma más rápida de perder una evolución. |
| **NO2** | **No se guardan datos clínicos en el dispositivo.** Lo que se guarda es la pantalla (el HTML, el CSS, el JavaScript). Ningún nombre, ningún RUT, ninguna evolución. Los PC de la unidad los usan cinco personas. |
| **NO3** | **No cambia el modelo de datos.** Cero columnas nuevas, cero hojas nuevas. `crearORepararEstructura()` no se corre por esta tanda. |
| **NO4** | **No cambia ninguna regla clínica.** Ni los días de VM, ni el REM, ni el texto de la evolución, ni una cifra. |
| **NO5** | **No reemplaza el Modo Coordinación.** Las claves de MCC, DMV y MFB siguen igual: entrar con Google dice *quién eres*; la clave de coordinación dice *qué puedes corregir*. Son dos candados distintos y los dos se quedan. |
| **NO6** | **No hay notificaciones al teléfono.** La campana y el buzón siguen viviendo dentro de la app. |
| **NO7** | **No se publica en un dominio que el hospital no haya autorizado.** |
| **NO8** | **La aplicación nunca habla con la planilla.** No tiene ni tendrá llave de la hoja de cálculo. |

---

## 4 · El flujo, dibujado dos veces

### 4.1 · La duda de Diego, respondida primero

> «¿Si el repo vive en GitHub, qué se implementa en Script? ¿Y cómo almacena el
> dato en la base de datos de Sheets?»

**Nada se mueve de lugar salvo la pantalla.** Hoy Apps Script hace dos trabajos
distintos con el mismo tubo: **entrega la pantalla** y **guarda los datos**. Lo
único que cambia es que deja de hacer el primero.

- **GitHub sigue siendo lo que ya es**: donde vive el código fuente. Eso no
  cambia en nada — hoy también está ahí.
- **En Apps Script se sigue implementando lo mismo de siempre**: los archivos
  `.gs`. Son los que leen y escriben la planilla, calculan los días de VM, arman
  el texto, generan el REM. **Menos uno**: el `index`, que se va.
- **La base de datos no se toca.** Sigue siendo la misma planilla de Google, con
  sus 26 hojas y sus 396 columnas. **Y sigue siendo Apps Script el único que la
  abre.**

El camino del dato, hoy:

```
     pantalla (dentro del marco de Google)
        │  api('GUARDAR_EVOLUCION', datos)
        ▼
     puente interno de Google        ← esto es lo que desaparece
        ▼
     api.gs · despachador  →  _auditar  →  repo  →  📗 PLANILLA
```

El camino del dato, después:

```
     pantalla (instalada en el teléfono, servida desde el sitio)
        │  api('GUARDAR_EVOLUCION', datos, quién soy, n° de petición)
        ▼
     una llamada por internet, con candado    ← esto es lo nuevo
        ▼
     puerta nueva en el servidor  →  ¿quién eres? ¿ya te atendí?
        ▼
     api.gs · despachador  →  _auditar  →  repo  →  📗 LA MISMA PLANILLA
```

**Todo lo que está de `api.gs` hacia abajo queda idéntico.** El despachador, la
auditoría, el repositorio, las hojas. La evolución se guarda exactamente igual
que hoy, en la misma fila, con las mismas reglas. Lo único que cambia es cómo
llega el mensaje hasta ahí: en vez de un tubo interno de Google, un llamado por
internet con un candado adelante.

### 4.2 · Cómo entra una persona

**Hoy**

1. Abre el enlace de `/exec`.
2. **No se le pregunta nada** (`AUTH_DEV_MODE=TRUE`, marcha blanca).
3. Elige su firma de una lista, o la teclea.
4. Guarda. La fila queda con esa firma.

**Después**

1. Toca el ícono de la app.
2. La app pregunta: **¿tienes sesión?**
   - Si sí → entra directo.
   - Si no → «Entrar con Google», elige su cuenta del hospital.
3. El servidor comprueba que esa cuenta **está en la lista de la unidad** antes
   de contestar nada.
4. Guarda. La fila queda con la firma **y** con quién la escribió de verdad.

> El mecanismo ya está escrito y probado: vive detrás del interruptor
> `LOGIN_UI_ACTIVO` desde julio de 2026. No hay que inventarlo, hay que
> encenderlo y ponerlo en la puerta nueva.

---

## 5 · Los datos

### 5.1 · Qué dispara qué

Esta tanda **no dispara nada nuevo**. No hay disparadores nuevos, no hay rutinas
que corran solas, no hay datos que se generen. Es infraestructura: la misma
información, por otro camino.

### 5.2 · Los interruptores

| Interruptor | Dónde vive | Qué hace |
|---|---|---|
| `AUTH_DEV_MODE` | CONFIG (hoja) | Ya existe. En `TRUE` deja pasar a cualquiera. Se apaga cuando el login esté probado, **no antes**. |
| `LOGIN_UI_ACTIVO` | index | Ya existe. Muestra u oculta la pantalla de entrar. Hoy en `false`. |
| `OAUTH_CLIENT_ID` | CONFIG | Ya existe. Identifica la app ante Google. |
| `API_HTTP_ACTIVA` | CONFIG | **Nuevo.** Abre o cierra la puerta HTTP. Nace en `FALSE`: mientras esté apagada, nada cambia para nadie. |
| `ORIGENES_PERMITIDOS` | CONFIG | **Nuevo.** Desde qué direcciones se aceptan llamadas. Cualquier otra se rechaza sin mirar el contenido. |
| `DOMINIO_PERMITIDO` | CONFIG | **Nuevo.** Qué correos pueden entrar. Sin esto, «entrar con Google» significa *cualquier* cuenta de Google del mundo. |

Los tres nuevos son valores en la hoja CONFIG: se cambian sin pegar código.

### 5.3 · El candado que evita hacerlo dos veces

**Este es el riesgo real de la tanda, y hay que decirlo claro.**

Hoy, cuando el navegador le habla al servidor, si algo falla el mensaje
simplemente se pierde y la app avisa. Con una llamada por internet **puede pasar
algo peor**: que el mensaje llegue, se guarde, y la respuesta se pierda de
vuelta. La app cree que falló, reintenta, y **la evolución se guarda dos veces**.
Con un teléfono en un pasillo del hospital, esto no es teórico.

El candado: **cada escritura viaja con un número de petición**. El servidor
anota los últimos que atendió. Si llega uno repetido, **no vuelve a escribir**:
devuelve el resultado que ya había guardado. La app no se entera y el dato queda
una sola vez.

Es la misma idea del `conLock` que ya protege el guardado de dos personas a la
vez; esto protege de **una persona reintentando**.

### 5.4 · Inventario de consumidores

La regla del proyecto: antes de cambiar algo que vive en varios sitios, hay que
listarlos. La buena noticia es corta.

**En el cliente, el transporte está en UN solo lugar.** La función `api(accion,
datos)` de `index.html` (~línea 4736) es la única puerta: hay **cuatro
menciones** del puente de Google en 13.000 líneas, todas ahí dentro. Cambiar el
transporte es reescribir esa función, no la aplicación.

| Consumidor | Qué le pasa |
|---|---|
| `api(accion, datos)` · index ~4736 | Se reescribe: en vez del puente de Google, la llamada por internet con token y número de petición. **Es el único punto del cliente.** |
| `doGet` · webapp.gs | Deja de servir la pantalla. Se conserva un tiempo (O6) y después se apaga. |
| **`doPost`** · webapp.gs | **Nuevo.** La puerta HTTP: comprueba origen, identidad y número de petición, y llama al mismo `api()` de siempre. |
| `api(accion, datos, token)` · api.gs | **No se toca.** Sigue siendo el despachador único. |
| `_auditar` | **No se toca**, salvo que ahora recibe una identidad real para anotar. |
| `GET_LOGIN_INFO` | Sigue siendo la única acción pública, ahora en la puerta nueva. |
| **Las 73 guardias con navegador** | Simulan el puente de Google (`build/sim/sim_srv.js`). Hay que enseñarles el transporte nuevo. **Es el mayor costo de la tanda** y no se puede saltar: son las que prueban que la app arranca y que las reglas clínicas siguen dando lo mismo. |
| `build/empaquetar_cohete.js` | Muere. Con él, la saga del boot. |
| `build/paridad_v3.js`, `que_pegar.js`, la carpeta `V3 colaborativa/` | Se ajustan: el index sale del paquete que se pega. |
| El sello de versión | Se queda, y **se vuelve más importante**: ahora hay dos cosas publicadas (sitio y script) y hay que poder ver si alguna se quedó atrás. |

### 5.5 · Qué se guarda en el dispositivo, exactamente

| Se guarda | No se guarda |
|---|---|
| El HTML, el CSS y el JavaScript de la pantalla | Nombres, RUT, evoluciones, camas |
| El ícono y el nombre de la app | La sesión de otra persona |
| Las preferencias del navegador que ya existen hoy (pestaña abierta, etc.) | Cualquier respuesta del servidor con datos de pacientes |

Esto es una **regla de construcción**, no una configuración que se pueda olvidar:
el guardado se declara por lista blanca (solo los archivos de la pantalla), no
por lista negra.

---

## 6 · El acuerdo, en pseudo-código

> Esto **no es el código**. Es lo que el código tiene que cumplir, escrito para
> poder discutirlo antes de escribirlo.

```
CUANDO alguien abre la app
    ¿hay sesión válida guardada?
        SÍ    → ENTONCES entra directo
        NO    → ENTONCES muestra «Entrar con Google»
                y no pide ni un dato al servidor hasta que entre

CUANDO la pantalla necesita algo del servidor
    ENTONCES manda: qué acción, qué datos, quién soy, y un número de petición

CUANDO llega una petición al servidor
    ¿viene de un origen permitido?      NO → rechaza, y no mira el contenido
    ¿la identidad es válida y del dominio de la unidad?
                                        NO → rechaza
    ¿es una acción pública (GET_LOGIN_INFO)?
                                        SÍ → contesta sin más
    ¿ese número de petición ya se atendió?
                                        SÍ → devuelve lo que se guardó
                                             la primera vez, SIN escribir
    ENTONCES llama al mismo api() de siempre y contesta lo que él diga

CUANDO se guarda una evolución
    ENTONCES la fila lleva la firma que eligió el colega
             Y ADEMÁS quién la escribió de verdad

CUANDO la red se corta a mitad de un guardado
    ENTONCES la app reintenta con el MISMO número de petición
             y el servidor NO escribe dos veces

CUANDO no hay red
    ENTONCES la app abre y muestra la pantalla,
             pero dice «sin conexión» y NO deja guardar
             (NO1: sin red no se escribe)

CUANDO se publica una versión nueva del sitio
    ENTONCES la app avisa «hay una versión nueva» y se recarga
             — nunca en medio de una evolución sin guardar

CUANDO el sitio y el script no coinciden de versión
    ENTONCES la app lo dice en pantalla, con las dos cifras
```

### Las promesas

1. **La planilla solo la toca Apps Script.** Siempre. La app no tiene llave.
2. **Ninguna evolución se guarda dos veces** por un reintento.
3. **Ningún dato de paciente queda guardado en el dispositivo.**
4. **Nada se escribe sin identidad**, una vez que se apague `AUTH_DEV_MODE`.
5. **Las 73 guardias siguen verdes** antes de publicar. Si una regla clínica
   cambia de resultado, la tanda está mal hecha: esta tanda no toca clínica.
6. **Hay vuelta atrás**: apagando `API_HTTP_ACTIVA` todo vuelve a como está hoy.

---

## 7 · Lo que hay que decidir antes de programar

### I1 · RESPONDIDA por Diego (8-sep-2026)

> **«Sí puede abrir dominio externo, pero solo algunas páginas.»**

O sea el hospital tiene una **lista blanca**: se abre lo que se pide, no todo.
Eso es exactamente lo que hacía falta saber, y convierte el riesgo R1 de «no
sabemos si se puede» en **«hay que pedir bien la lista»**. Una dirección que
falte no da un error claro: la app abre y las llamadas mueren en silencio, que
es la peor forma de fallar en un turno de noche.

**La lista es corta, porque la app casi no usa nada de afuera.** Se revisó el
index entero: la única dirección externa que aparece hoy es la del login de
Google. No hay tipografías de internet, ni librerías, ni imágenes remotas — todo
viaja dentro del archivo.

| Dirección | Para qué | ¿Ya está permitida? |
|---|---|---|
| **el dominio del sitio** (se define en D1) | Servir la pantalla de la app | No — **es la que hay que pedir** |
| `script.google.com` | Donde vive el servidor y adonde van las llamadas | Sí: es donde corre la app hoy |
| `script.googleusercontent.com` | 🪤 Apps Script **no contesta directo**: responde con un desvío a esta dirección. Si está bloqueada, **todas las llamadas fallan aunque `script.google.com` esté permitida** | Casi seguro que sí (hoy la app corre dentro de ahí), pero **hay que confirmarlo**: es la trampa más probable de toda la tanda |
| `accounts.google.com` | El login de Google (la librería `gsi/client` y la pantalla de entrar) | Es la única dirección externa que la app usa hoy — confirmar |

**Lo que hay que pedirle a informática**, en una frase: *«habilitar el dominio X
para la unidad de kinesiología UCI, y confirmar que `script.google.com`,
`script.googleusercontent.com` y `accounts.google.com` están habilitados»*.

Con la lista blanca en juego, **D1 deja de ser una preferencia técnica**:
conviene elegir el dominio antes de pedir nada, y pedir uno solo.

### La pregunta que queda para informática

| | |
|---|---|
| **I2** | ¿Existe un dominio de correo institucional para el equipo (`@hospital…`), o entran con cuentas personales de Gmail? De esto depende a quién se le abre la puerta. |

### Cuatro decisiones de Diego

| | | Recomendación |
|---|---|---|
| **D1** | **Dónde se aloja el sitio.** GitHub Pages es gratis pero **exige repositorio público**, y tú quieres ponerlo privado. Las otras opciones (Firebase Hosting, Cloudflare Pages) sirven con repositorio privado y también son gratis a esta escala. | **Firebase Hosting**: es de Google, misma cuenta, mismo mundo que la planilla, y menos probable que el proxy del hospital lo bloquee. |
| **D2** | **Quién puede entrar.** Por dominio de correo (todos los del hospital) o por lista de personas (las de la unidad). | **Lista de personas**, con la columna que ya existe en `KINESIOLOGOS.EMAIL`. Es una UCI de 17 camas, no una empresa. |
| **D3** | **Qué pasa con la marcha blanca.** ¿Se apaga `AUTH_DEV_MODE` el mismo día, o convive un tiempo? | **Convive**. Primero la PWA con login **opcional**, y cuando todos entren sin problema, se apaga. Apagarlo el día uno deja a la unidad afuera si algo falla a las 3 AM. |
| **D4** | **Hasta cuándo vive la dirección de hoy.** El `/exec` de siempre puede seguir sirviendo la app como respaldo. | **Un mes**, y después se apaga. Más tiempo son dos cosas que mantener. |

---

## 8 · Riesgos, ordenados por lo que duelen

| | Riesgo | Qué lo contiene |
|---|---|---|
| **R1** | **Falta una dirección en la lista blanca del hospital.** Ya no es «¿se puede?» (Diego confirmó que sí) sino «¿se pidieron todas?». La más peligrosa es `script.googleusercontent.com`: si falta, la app abre bien y **todas las llamadas mueren en silencio**. | Pedir la lista completa de §7 **antes** de escribir una línea, y probarla en un PC del hospital antes de dársela a nadie. |
| **R2** | **Una evolución guardada dos veces** por un reintento de red. | El número de petición (§5.3). Guardia obligatoria: mandar la misma escritura dos veces y comprobar que hay UNA fila. |
| **R3** | **Datos de pacientes en el caché de un PC compartido.** | NO2 + lista blanca de archivos (§5.5). Guardia que revise que la lista no incluye respuestas del servidor. |
| **R4** | **La puerta HTTP queda abierta al mundo.** El enlace del script viaja dentro de la pantalla. | `ORIGENES_PERMITIDOS` + identidad obligatoria + `API_HTTP_ACTIVA` apagada hasta que esté probado. **Por esto la PWA no se hace sin login real: son la misma tanda.** |
| **R5** | **Las 73 guardias quedan a medias** y se pierde la red de seguridad que protege lo clínico. | Se enseña el transporte nuevo al simulador **antes** de tocar el cliente, y la batería tiene que estar en 123 verdes en todo momento. |
| **R6** | **Sitio y script desincronizados**: alguien publica uno y no el otro. | El sello de versión en las dos partes y el aviso en pantalla (§6). |
| **R7** | **Cada llamada es algo más lenta** que el puente interno. | Se mide antes y después con `medirArranque` y `medirGuardado`. Si el guardado se pone lento de verdad, se revisa; la carga inicial mejora mucho más de lo que empeora cada llamada. |

---

## 9 · Por dónde se empieza

En este orden, y cada paso se puede detener sin romper nada:

1. **Preguntar I1 e I2.** Sin respuesta, no se programa.
2. **Enseñarle al simulador el transporte nuevo** (`build/sim/`), con las 123
   guardias verdes. Nadie lo nota, nada cambia.
3. **Abrir la puerta `doPost`** con `API_HTTP_ACTIVA=FALSE`. Está escrita y
   apagada: la app sigue funcionando exactamente como hoy.
4. **Publicar el sitio** y probarlo **solo Diego y Manuel**, con el `/exec` de
   siempre andando en paralelo.
5. **Encender el login**, primero opcional (D3).
6. **Apagar `AUTH_DEV_MODE`** cuando todos hayan entrado al menos una vez.
7. **Apagar el `/exec`** un mes después (D4).

---

---

## 10 · WhatsApp: la pregunta que hizo Diego al leer esto

> «¿Se podría integrar mensaje a WhatsApp si se hace así?»

**Sí se puede — pero no tiene nada que ver con esta tanda.** Los mensajes los
mandaría el **servidor**, no la pantalla, y el servidor ya sabe llamar a
servicios de afuera: lo hace hoy para importar los gases desde Drive
(`UrlFetchApp`, `svc_gsa.gs`). O sea **se podría hacer hoy, sin PWA**. La PWA no
lo habilita ni lo bloquea: son dos cosas independientes y no conviene mezclarlas.

Lo que decide si se hace o no **no es técnico**:

1. 🔴 **Dato clínico que sale del hospital.** Mandar por WhatsApp el nombre de un
   paciente, su cama o su evolución es sacar dato clínico a los servidores de
   Meta, fuera de la institución. La regla del proyecto (Ley 19.628) es que eso
   **no se hace sin anonimización y aprobación institucional**. No es decisión
   del proyecto: es de Diego y del hospital.
2. **La vía oficial cuesta y hay que darla de alta.** WhatsApp Business API
   (Meta) exige cuenta verificada, un número dedicado solo a eso, plantillas de
   mensaje aprobadas por Meta, y se paga por conversación.
3. **Las vías no oficiales no sirven acá.** Las librerías que se conectan como si
   fueran el WhatsApp de una persona violan los términos y terminan con el
   número bloqueado. En un hospital eso no se propone.

**Lo que sí sería seguro y útil**, si Diego lo quiere: un aviso **sin ningún dato
de paciente**. «Hay 3 alertas en la unidad» o «se publicó una versión nueva» — un
empujón para que alguien abra la app, donde el dato sí está protegido. Eso
respeta la regla de privacidad entera.

> Ojo con el antecedente: Diego **rechazó el envío de correos** en su momento, y
> por eso el sistema no manda ninguno (`COORD_RECUPERA_CORREO` nace apagado). Si
> ahora quiere avisos por WhatsApp es un cambio de criterio legítimo — pero
> conviene decirlo explícito, porque la regla escrita hoy dice lo contrario.

**Esto no se programa con este PRD.** Si lo quiere, es un PRD propio de una
página, y la primera línea es qué se manda exactamente.

---

*Este documento fija la estructura. No trae código final, ni la implementación
exacta, ni configuración: si la estructura está bien en papel, el código es la
parte fácil.*
