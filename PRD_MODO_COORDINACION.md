# PRD — Modo coordinación: buscar y corregir fichas de pacientes

**Estado:** Borrador para revisión de Manuel · **Dueño:** Manuel Fuentes · **Creado:** 2026-08-18
**Versión base:** `main` en v5.62. ⚠️ La versión PUBLICADA no se supone: se pregunta o se mira el editor (regla del 14-ago; suponerla ya salió mal dos veces).

**Quiénes entran (tres, cada uno con su clave y su firma):**

| Persona | Firma | Rol en esto |
|---|---|---|
| **Klga. Magdalena Contardo Cisternas** — coordinadora del equipo | `MCC` | uso diario |
| **Klgo. Diego Melo Villagrán** — dueño del RCE | `DMV` | respaldo |
| **Klgo. Manuel Fuentes Blanco** | `MFB` | respaldo |

Los tres ya están en el roster del sistema. **Tienen el mismo poder**: son tres para que la
unidad no quede detenida si una persona falta o pierde su clave, no para dividir tareas.

**Alcance:** tres usuarios con clave propia que pueden buscar cualquier paciente —activo o
egresado— por nombre, apellido o RUT, y corregir sus **fechas semilla** y sus **datos
administrativos**, dejando huella visible y auditable de cada corrección, firmada por quien la
hizo.

**NO toca:** el texto clínico de las evoluciones ya firmadas · los totales del episodio como
campo editable a mano (se recalculan solos, ver §5) · el acceso del resto del equipo, que sigue
exactamente igual de abierto que hoy · la creación de más usuarios o roles · el formulario del
turno.

⚠️ **Su apellido está mal escrito en el código.** La semilla del roster dice «Magdalena
**Contando** Cisternas» en `v2/esquema.gs:787` y en `v2/index.html:10187`. Ese nombre alimenta la
firma del texto clínico («Klga. Nombre Apellido»), así que **cada evolución que ella firma sale
con el apellido mal escrito**. Hay que verificar cómo está en la planilla real —la semilla solo
se aplica si la hoja está vacía, y pudo corregirse a mano— y arreglar el código de todos modos.
Es un arreglo de dos letras que no depende de este PRD: puede viajar hoy.

---

## 1 · Resumen

**Hoy:** un dato mal ingresado en un paciente que ya egresó no se puede arreglar desde la app.
Hay que abrir el editor de Apps Script y correr una función a mano.

**Después:** la coordinadora entra con su clave, escribe el nombre o el RUT, abre la ficha y
corrige el dato. La corrección queda fechada, firmada y a la vista.

---

## 2 · La historia

### ANTES

Don Ernesto Pizarro *(nombre ficticio)* estuvo veintiocho días en la UCI. Entró antes de que el
RCE existiera, así que cuando el equipo lo cargó al sistema, la app hizo lo único que sabía
hacer: le puso como fecha de ingreso el día en que lo escribieron. Día 0.

El 2 de agosto corregimos esa fecha en diecisiete camas. La de don Ernesto también — pero él ya
había egresado. Su ficha se había archivado el día del alta con los días **congelados**: en
`ARCHIVO_PACIENTES` figura con **un día de estadía**. Veintiocho días de trabajo kinésico
convertidos en uno.

Ese número no se recalcula solo. Y para arreglarlo Manuel tiene que abrir el editor de Apps
Script, escribir una función de mantenimiento, correrla en simulacro, revisar la salida, correrla
de nuevo confirmando, y después acordarse de borrar el archivo. Para cambiar una fecha.

Mientras tanto ese uno se suma al promedio de estadía del mes, que es de los pocos números que
sale de la unidad hacia arriba.

### DESPUÉS

Magdalena abre el RCE, entra a su pestaña con su clave y escribe «Pizarro». Aparece don
Ernesto con el rótulo *egresado*, su fecha de ingreso y su fecha de egreso. Toca la ficha,
corrige la fecha de ingreso al día real, y guarda.

El sistema recalcula solo los veintiocho días, y deja escrito en la ficha: **«fecha de ingreso
corregida el 18-ago-2026 por MCC»**. Cualquiera que abra esa ficha en marzo va a entender por qué
el número cambió, sin tener que preguntarle a nadie.

Tardó cuarenta segundos y no tocó una línea de código.

---

## 3 · Objetivos / No-objetivos

**O1 — Encontrar a cualquier paciente sin saber dónde está.** Por nombre, apellido o RUT,
esté en cama o egresado hace ocho meses. Hoy el buscador no acepta RUT y exige que las palabras
del nombre vayan pegadas y en orden.

**O2 — Corregir sin salir de la app.** Las cuatro fechas semilla y los datos administrativos,
desde la ficha, sin editor de Apps Script y sin tocar celdas de la planilla.

**O3 — Que el dato derivado siga a su fuente.** Corregir una fecha de ingreso recalcula los días
de estadía, de ventilación y de vía aérea, también en un paciente ya archivado. Es la reparación
del caso de don Ernesto y la razón principal por la que existe este PRD.

**O4 — Que nadie más pueda hacerlo.** El resto del equipo entra como siempre, ve lo de siempre y
no tiene manera de llegar a estas acciones, ni por la pantalla ni por debajo de ella.

**O5 — Que toda corrección deje huella, con nombre.** Auditable siempre; visible en la ficha
siempre; y **firmada por quien la hizo**, no por el rol.

**O6 — Que la unidad no dependa de una sola persona.** Si Magdalena está con licencia, de
vacaciones o simplemente olvidó su clave, las fichas se siguen pudiendo corregir. Ninguna
corrección debe quedar esperando a que vuelva alguien.

**NO1 — No es un sistema de usuarios.** Son **tres personas fijas**, escritas en la
configuración: sin pantalla de altas y bajas, sin registro público, sin perfiles ni permisos
graduados. Los tres tienen exactamente el mismo poder. Cuando haga falta una cuarta, se agrega a
mano; cuando hagan falta perfiles distintos, eso es otro PRD.

**NO2 — No se toca el registro clínico firmado.** El texto de una evolución la firmó un
kinesiólogo con su sigla en un turno concreto. La coordinadora no puede reescribirlo. Si algo del
contenido clínico está mal, la vía sana es la que ya existe (anular o anexar un evento), no
sobrescribir la firma de un colega.

**NO3 — No cambia el acceso del resto del equipo.** `AUTH_DEV_MODE` sigue en TRUE y la pantalla
de login sigue oculta, tal como Diego lo pidió. Este PRD **agrega un candado adentro de la casa
abierta**; no cierra la casa.

**NO4 — No permite editar totales a mano.** Ver §5: los días son consecuencia de las fechas, no
un dato independiente.

---

## 4 · Cómo funciona hoy → cómo va a funcionar

### HOY

```
Buscar a un paciente
  Buscador del header (ya existe: activos + egresados)
    busca por: nombre · código · diagnóstico · número de cama
    NO busca por: RUT            ← aunque la columna existe en las dos hojas
    exige palabras pegadas       ← "Melo Villagrán" sí, "Diego Villagrán" no
  → abre el historial del episodio  ...en SOLO LECTURA

Corregir un dato de un egresado
  → no hay camino en la app
  → editor de Apps Script → escribir una función → simulacro → confirmar → borrar el archivo

Corregir una fecha semilla de un paciente ACTIVO
  → tampoco hay camino en la app (el formulario del turno no las toca)
  → mismo rodeo por el editor

Quién puede hacer todo esto
  → cualquiera que tenga el enlace          ← AUTH_DEV_MODE=TRUE, sin usuarios
```

### DESPUÉS

```
Entrar al modo coordinación
  Pestaña «Coordinación» (visible para todos, vacía y con candado)
    pide firma + clave → el SERVIDOR la verifica → sesión atada a ESA firma,
                                                    que expira sola
    3 intentos fallidos → espera obligada, solo para esa firma

  Si alguien perdió su clave
    → otra de las tres se la restablece (con su código del teléfono)
    → o la recupera sola con su propio código del teléfono
    ← el segundo factor se pide SOLO aquí, nunca en la entrada de todos los días

Buscar  (el mismo buscador de siempre, con dos mejoras que aprovechan TODOS)
  + acepta RUT (con o sin puntos y guion — ya existe el normalizador)
  + acepta palabras sueltas y en cualquier orden
  → resultados con rótulo «activo» / «egresado», fechas y cama

Corregir  (solo dentro del modo coordinación)
  Ficha editable: 4 fechas semilla + datos administrativos
    → cada campo muestra su valor actual y, si ya fue corregido, quién y cuándo
  Al guardar:
    → el servidor vuelve a exigir la sesión viva   ← no basta con ver la pantalla
    → recalcula los días derivados de las fechas que cambiaron
    → estampa el sello visible en la ficha
    → deja el registro completo en AUDIT_LOG
```

**Piezas que ya existen y se reusan tal cual** (no se inventa infraestructura):
`buscarPacientes()` en `svc_camas.gs` (se le agregan RUT y palabras sueltas) · `_rutNormal()`
para normalizar el RUT · `diasEntre()` para recalcular días, la misma función con la que el
sistema los cuenta en vivo · `AUDIT_LOG` y el envoltorio `_auditar` del dispatcher · el patrón de
las hojas `CAMAS_ESTADO` y `ARCHIVO_PACIENTES` · `uiConfirm` para toda confirmación.

---

## 5 · Los datos

### Dónde viven las claves

```
disparador   una de las tres escribe SU clave en la pestaña Coordinación

las claves   una por persona, cada una atada a su firma (MCC · DMV · MFB)
             NUNCA se guardan ni viajan en texto plano
             se guarda su huella (hash con sal distinta por persona), no la clave
             viven FUERA de la planilla (propiedades del script), no en CONFIG
             ← razón: CONFIG es una hoja de la planilla; cualquiera con acceso al
               archivo la lee. La huella fuera de la planilla no aparece ni al
               exportar ni al compartir el Sheet por error.

la sesión    dura un rato corto y se cae sola al cerrar o por inactividad
             ← razón: en la UCI los computadores son compartidos y quedan
               abiertos. Una sesión sin vencimiento es la puerta abierta.
intentos     3 fallidos → espera obligada, POR PERSONA
             ← que alguien falle su clave no puede dejar afuera a las otras dos:
               sería una forma barata de bloquear la unidad entera
```

### El segundo factor y la recuperación

**Primero, lo que la recuperación es en la práctica:** con tres personas, el camino normal
cuando alguien pierde su clave es que **otra de las tres se la restablezca**. Eso no necesita
nada nuevo — ya requiere una clave válida para hacerse — y cubre el caso realista, que es una
persona sin acceso, no tres.

**El segundo factor existe para el caso que ese camino no cubre:** que nadie pueda entrar. Sin
él, la única salida sería el editor de Apps Script, que solo abre Diego.

```
segundo factor   un código temporal de 6 dígitos que cambia cada 30 segundos,
                 generado por una app de autenticación en el teléfono de cada una
                 (el estándar TOTP: Google Authenticator, Authy, la que sea)
                 ← se registra UNA vez escaneando un código; después funciona
                   sin señal y sin internet
                 ← Apps Script puede validarlo con lo que ya trae; no se agrega
                   ningún servicio externo

cuándo se pide   · para restablecer la clave propia sin ayuda de nadie
                 · para restablecerle la clave a otra persona
                 · NO en el ingreso de todos los días  ← el uso diario es solo la
                   clave; pedir el código en cada entrada convierte una corrección
                   de cuarenta segundos en un trámite, y termina en la clave
                   pegada en un papel bajo el teclado
```

⚠️ **Por qué no un código al correo, que sería lo obvio:** Diego rechazó el envío de correos y
hoy el sistema no manda ni uno. Meter correos por esta puerta contradice una decisión suya
explícita, agrega una cuota diaria que puede agotarse y ata la recuperación a que el correo
llegue. El código en el teléfono no manda nada, no depende de la red y no le pide permiso a
nadie. **Si Diego prefiere el correo, es su llamado** — el resto del PRD no cambia.

**El fondo del pozo, que conviene escribir:** si se pierden las tres claves *y* los tres
teléfonos, Diego siempre puede restablecer todo desde el editor de Apps Script. No es una
funcionalidad, es la consecuencia de ser el dueño del proyecto — pero es la razón de que nadie
quede encerrado afuera para siempre.

### Qué se puede corregir

| Grupo | Campos | Dónde viven |
|---|---|---|
| **Fechas semilla** | ingreso, egreso, inicio de ventilación, inicio de vía aérea — cada una con su hora | `CAMAS_ESTADO` (activo) · `ARCHIVO_PACIENTES` (egresado) |
| **Administrativos** | nombre, RUT, edad, sexo, diagnóstico, diagnóstico REM, motivo y destino de egreso | las mismas dos hojas |

### Qué se recalcula solo (y por qué no se edita a mano)

```
días de estadía · días de ventilación · días de vía aérea
  → NO son campos que la coordinadora escriba
  → se derivan de las fechas, con la MISMA función que los cuenta en vivo
```

**La razón, que es la decisión más importante de este documento:** en un paciente activo esos
días ya se calculan solos cada vez que se miran — por eso corregir la fecha de las diecisiete
camas el 2-ago bastó. Pero al egresar **se congelan**: la ficha archivada guarda el número que
tenían ese día, y desde entonces nadie los recalcula. Ahí nació el uno de don Ernesto.

Si se dejara editar el total a mano, la coordinadora podría escribir «28» y que la fecha de
ingreso siguiera diciendo otra cosa: un número correcto sostenido por una fecha falsa, que es
peor que el error visible, porque nadie lo va a volver a mirar. Los días siguen a sus fechas, o
no significan nada.

**Con qué se recalcula: `diasEntre`, días de CALENDARIO.** No con bloques de 24 h — eso fue la
v5.19 y se revirtió, porque la unidad cuenta como la lista oficial del hospital (BUDA): un día
por cada día de calendario, y el día de ingreso es Día 0. Recalcular con la regla equivocada
volvería a despegar la app del papel que el equipo lee en la reunión, que es justo lo que la
v5.37 arregló.

### 🔴 Inventario de consumidores

*(Sección obligatoria del método en este proyecto: aquí el trabajo típico no es software nuevo
sino tocar un dato que ya vive en varios sitios. Saltarse este inventario es lo que produjo el
error de los filtros, el del «día con VM» y el de las secreciones.)*

**Quién más escribe las fechas semilla — el hallazgo que cambia el diseño.** No somos los únicos
que las tocamos: `svc_evoluciones.gs` las reescribe al guardar un turno normal. Una corrección de
la coordinación **puede ser pisada por el turno siguiente**, y eso hay que resolverlo, no
descubrirlo en producción.

| Quién escribe | Cuándo | ¿Pisa una corrección? |
|---|---|---|
| `guardarEvolucion` → `TS_INGRESO` (`svc_evoluciones.gs:137`) | si el formulario trae una **hora de ingreso** distinta de la guardada | **SÍ, la hora.** Conserva el día, pero cualquiera del turno puede cambiar la hora corregida |
| `guardarEvolucion` → `FECHA_INICIO_SOPORTE` (`:378`) | solo si **cambia el tipo de soporte** (VM↔VNI↔Ambiente) o si está vacía | **No, y está bien:** un soporte nuevo es un tramo nuevo. Si el soporte no cambia, la corrección sobrevive |
| `guardarEvolucion` → `FECHA_INICIO_VA` (`:440`) | solo si **cambia el tipo de vía aérea** o si está vacía | **No, mismo criterio** |
| `anularEvento` (`:903-904`) | al anular una intubación/TQT: recalcula la fecha **restando los días de la evolución** | **SÍ.** Deshace la corrección sin avisar |
| `ingresarPaciente` (`svc_camas.gs:122`) | solo al ingresar | No: el episodio recién nace |

**Consecuencia para el diseño (queda como decisión, ver §7):** una fecha corregida por la
coordinación se marca como tal, y los dos casos que sí pisan —la hora del formulario y el
recálculo al anular un evento— deben **respetar la marca o avisar**, en vez de sobrescribir en
silencio. Sin esto, la corrección de don Ernesto dura hasta el próximo turno.

**Quién LEE los días (y por eso hereda el error si se recalculan mal):**

| Consumidor | Qué muestra |
|---|---|
| Grilla de camas y tarjeta (`svc_camas.gs:20-22, 65-67`) | día de estadía, días de VM y de vía aérea, en vivo |
| Entrega de turno (`svc_entrega.gs:274-275`) | los mismos días en el papel del cambio de turno |
| `ARCHIVO_PACIENTES` al dar de alta (`svc_camas.gs:247-248`) | **los congela**: `DIAS_TOTAL = cama.DIA_ESTADIA` ← el origen del caso |
| Estadísticas (`svc_stats.gs:136`) | promedio de estadía del período |
| Auditoría de huecos (`svc_auditoria.gs:63`) | avisa de días sin evolucionar desde el ingreso |
| Indicadores y REM | días de VM del período |

**Quién lee lo administrativo que se puede corregir:** el buscador global · la ficha del paciente
· la entrega de turno · la hoja de registro · el REM (diagnóstico) · el aviso de reingreso por
RUT. Corregir un **RUT** es el único que puede cambiar de sitio a un paciente en otra vista: es
la llave que conecta episodios de la misma persona.

### El sello de la corrección

```
por ficha    lista de correcciones: qué campo, valor anterior → nuevo,
             cuándo, quién (la firma de quien entró: MCC · DMV · MFB)
             ← columna nueva, AL FINAL de la lista de columnas de cada hoja
               (insertar al medio desalinea todos los datos existentes)
             ← exige correr crearORepararEstructura() una vez al desplegar

en AUDIT_LOG una fila por corrección, con el formato que ya usan las otras 59
             acciones: hora, correo, firma, acción, entidad, PATIENT_ID, resumen
             ← también las entradas al modo, los intentos fallidos y CADA
               restablecimiento de clave: quién se la restableció a quién
```

**Qué se estampa como identidad.** El resto del sistema identifica por correo de Google, pero
aquí se eligió clave propia: no hay correo que estampar. La identidad de una corrección es
**la firma de quien entró** —`MCC`, `DMV` o `MFB`— más la marca de que vino por el modo
coordinación; el campo de correo lleva esa marca y no queda vacío, porque una fila de auditoría
sin identidad no sirve para auditar nada.

**Tres claves separadas es lo que hace que la traza signifique algo.** Con una sola clave
compartida, cada fila diría «lo hizo la coordinación» y no se podría distinguir quién. Con una
clave por persona, la firma dice quién entró de verdad — siempre que **cada una use la suya y no
la preste**, que es la única regla que este diseño no puede hacer cumplir por su cuenta. La
prestó, firmó el otro.

### Efectos laterales que hay que mirar al implementar

- **Corregir un RUT puede reunir dos episodios de la misma persona** (o separarlos). El sistema
  ya avisa de reingresos por RUT: hay que verificar qué hace ese aviso cuando el RUT cambia
  *después* del ingreso.
- **Corregir la fecha de ingreso NO re-fecha las evoluciones ya escritas.** Cada una está fechada
  por su turno, que es lo correcto: ocurrieron cuando ocurrieron. Solo cambian los días contados
  desde el ingreso.
- **El RUT es visible en este modo**, como ya lo es en la ficha del paciente (uso interno
  autorizado). Este PRD no abre ninguna vía nueva: el RUT sigue sin salir en REM, tablero ni
  exportaciones.

---

## 6 · Pseudo-código — el acuerdo

### Entrar

```
CUANDO una de las tres envía su firma y su clave desde la pestaña Coordinación
  ¿esa firma es una de las tres autorizadas?      → no: se rechaza
  ¿hay una espera activa por intentos fallidos DE ESA FIRMA? → sí: se rechaza diciendo
                                                                    cuánto falta
  ¿la huella de lo enviado coincide con la huella guardada de esa firma?
                                                 → no: se suma un intento fallido
                                                       y se rechaza sin decir por qué
ENTONCES se abre una sesión atada a ESA firma, que expira sola por tiempo y por
         inactividad, y queda registrada en AUDIT_LOG (también los intentos fallidos)
```

### Recuperar una clave

```
CAMINO NORMAL — otra de las tres la restablece
CUANDO alguien con sesión viva pide restablecer la clave de otra persona
  ¿su sesión sigue viva?                        → no: se rechaza
  ¿la firma que quiere restablecer es una de las tres? → no: se rechaza
  ¿acompaña su propio código de 6 dígitos y es el válido de este momento?
                                                → no: se rechaza
      ↑ el segundo factor va aquí, no en la entrada diaria: restablecer la clave
        de otra persona es tomar su identidad, y esa es la acción que hay que
        proteger de una sesión olvidada abierta en un computador del box
ENTONCES se genera una clave nueva de un solo uso, que la persona debe cambiar al
         entrar, y queda en AUDIT_LOG quién se la restableció a quién

CAMINO SIN AYUDA — la persona recupera la suya
CUANDO alguien pide restablecer su propia clave sin poder entrar
  ¿la firma es una de las tres?                 → no: se rechaza
  ¿el código de 6 dígitos de SU app es el válido de este momento? → no: se rechaza,
                                                       y cuenta como intento fallido
ENTONCES puede fijar una clave nueva, y queda en AUDIT_LOG
```

### Buscar

```
CUANDO se escribe algo en el buscador
  ¿son menos de 2 caracteres? → no se busca
  ¿parece un RUT? → se normaliza (sin puntos, con guion, K mayúscula) y se compara normalizado
  si no → se parte en palabras y se exige que TODAS aparezcan, en cualquier orden
ENTONCES devuelve activos primero y egresados del más reciente al más antiguo,
         cada uno rotulado, con sus fechas
```

*(Estas dos mejoras del buscador no dependen del modo coordinación: sirven para todo el equipo y
pueden viajar antes que el resto, si conviene desplegarlas por separado.)*

### Corregir

```
CUANDO una de las tres guarda una corrección
  ¿su sesión sigue viva? → no: se rechaza y se pide la clave otra vez
      ↑ ESTA GUARDIA VIVE EN EL SERVIDOR, no en la pantalla.
        Con el acceso abierto, esconder la pestaña no protege nada: quien conozca el
        nombre de la acción la llama igual. La pantalla es comodidad; el candado es este.
  ¿el paciente existe, activo o archivado?              → no: se rechaza
  ¿el campo está en la lista de lo corregible?          → no: se rechaza
      ↑ lista blanca explícita. Nada fuera de ella se escribe, aunque venga en la petición.
  ¿el valor nuevo es válido para su tipo?               → no: se rechaza, diciendo cuál
      · fechas: reales, y el ingreso nunca después del egreso
      · RUT: dígito verificador correcto (vacío es válido, el RUT es opcional)
  ¿el valor nuevo es distinto del actual?               → no: no se escribe ni se sella
ENTONCES
  escribe el valor nuevo
  recalcula los días derivados de las fechas que cambiaron, con diasEntre (días de calendario, regla BUDA)
  agrega la corrección al sello visible de la ficha, con la firma de quien entró
  registra en AUDIT_LOG: campo, valor anterior, valor nuevo, quién y cuándo
```

### Promesas

1. **Ninguna corrección se escribe sin una sesión verificada en el servidor**, ni siquiera si
   alguien llama la acción por fuera de la pantalla.
2. **Ninguna corrección pasa sin dejar rastro**: fila en `AUDIT_LOG` con el valor anterior, y
   sello visible en la ficha. No hay modo silencioso.
3. **Toda corrección lleva el nombre de quien la hizo** — `MCC`, `DMV` o `MFB`, nunca «la
   coordinación» en abstracto.
4. **Nunca queda un total contradiciendo a su fecha**: si cambia la fecha, cambian los días.
5. **El texto clínico firmado no se toca**, en ninguna circunstancia y por ninguna vía de este
   modo.
6. **Nada cambia para el resto del equipo**: mismo acceso, mismas pantallas, mismo formulario.
   Lo único que gana todo el mundo son las dos mejoras del buscador.
7. **Ninguna clave se guarda ni se muestra en ninguna parte** — ni en la planilla, ni en el
   registro de auditoría, ni en pantalla. Se restablece; no se recupera la vieja.
8. **La unidad nunca queda encerrada afuera**: tres personas, y un segundo factor para el caso de
   que ninguna pueda entrar.
9. **Restablecerle la clave a otra persona siempre exige el segundo factor** y siempre queda
   registrado: quién, a quién y cuándo.

---

## 7 · Las decisiones

### Resueltas por Manuel (18-08-2026)

| | |
|---|---|
| **D1** | **Se entra con clave propia de la app**, no con Google. Simple, no depende del computador, y encaja con que el resto del sistema siga abierto. |
| **D2** | **Se corrigen fechas semilla y datos administrativos.** Nada más. |
| **D3** | **Sobre egresados Y activos.** El error casi siempre se ve con el paciente todavía en cama. |
| **D4** | **La huella se registra siempre y además se ve en la ficha.** No hay modo silencioso. |
| **D5** | **Tres personas** con la misma capacidad: `MCC` (uso diario), `DMV` y `MFB` (respaldo), para que la unidad no dependa de una sola. |
| **D6** | **La recuperación lleva segundo factor**, y solo la recuperación — no la entrada de todos los días. |

### Derivadas del inventario

| | |
|---|---|
| **D7** ✅ | **La fecha corregida es de arrastre: el turno la hereda y NO la puede cambiar.** Resuelto por Manuel (18-08): «normalmente no se modifica, así que no debería poder modificarla». Es más fuerte que avisar — se bloquea. Una vez corregida, esa fecha solo la vuelve a tocar la coordinación. |
| **D8** ⏸️→✅ | **El segundo factor queda para más adelante** (Manuel, 18-08). Se implementó sin él: la recuperación normal es que **otra de las tres restablezca la clave**. **El 19-08 Manuel pidió dejarlo listo por correo**, así que el camino por correo quedó **escrito, probado y APAGADO** tras `CONFIG.COORD_RECUPERA_CORREO=FALSE`. Encenderlo es cambiar ese valor — la decisión sigue siendo de Diego, que fue quien rechazó los correos. |

**El matiz de D7 que hay que respetar para no romper la clínica.** «No se puede modificar» no
puede significar «se congela para siempre», porque hay fechas que **deben** reiniciarse por
motivos clínicos legítimos:

| Fecha | ¿Hay tramo nuevo legítimo? | Qué se hace |
|---|---|---|
| ingreso (`FECHA_INGRESO` / `TS_INGRESO`) | **No.** El ingreso del episodio es uno solo | Se bloquea entero: ni el formulario ni anular un evento la tocan |
| inicio de soporte (`FECHA_INICIO_SOPORTE`) | **Sí:** si el paciente pasa de VM a VNI y vuelve a VM, arranca un tramo nuevo de verdad | Se bloquea el pisado silencioso (anular evento, y el caso «no cambió el soporte»). Si el **tipo de soporte cambia**, el reinicio ocurre igual — y la marca de corregida **cae**, porque ya no describe ese tramo |
| inicio de vía aérea (`FECHA_INICIO_VA`) | **Sí:** un cambio de TOT a TQT es otro tramo | Mismo criterio |

Sin este matiz, corregir la fecha de VM de un paciente lo dejaría con esa fecha para siempre
aunque se extubara y se reintubara una semana después.

---

## 8 · Cómo se comprueba que quedó bien

**Guardias nuevas para la batería** (hoy 64/64 verdes; se juzgan solo por el código de salida):

1. Una corrección **sin sesión viva es rechazada por el servidor**, aunque se llame la acción por
   fuera de la pantalla. Es el candado real: si esta guardia pasa en verde estando la pantalla
   oculta, el modo es decorativo.
2. Un campo **fuera de la lista blanca no se escribe**, aunque venga en la petición.
3. Corregir la fecha de ingreso de un **egresado recalcula sus días** — el caso de don Ernesto,
   con días de calendario (`diasEntre`), no bloques de 24 h.
4. La **firma estampada es la de quien entró**, no la de otra de las tres.
5. **Restablecer una clave sin el segundo factor es rechazado.**
6. Los intentos fallidos de una firma **no bloquean a las otras dos**.
7. **Una fecha corregida sobrevive a un guardado normal del turno siguiente** (la que cubre D7 —
   es la que evita repetir el error de los filtros).
8. Ninguna clave ni su huella aparece en `AUDIT_LOG` ni en ninguna respuesta al cliente.

**Prueba a mano, con datos reales, antes de darlo por bueno:** buscar a un egresado por RUT,
corregirle la fecha de ingreso, y confirmar que sus días cambiaron en la ficha **y** que el sello
quedó a la vista con la firma correcta.

---

## 9 · Antes de implementar

- [x] ~~Confirmar quién es la coordinadora~~ ✅ **Klga. Magdalena Contardo Cisternas, firma `MCC`**
      (18-ago-2026). Ya está en el roster con el tratamiento `Klga.` correcto.
- [ ] **Corregir su apellido: «Contando» → «Contardo»** en `v2/esquema.gs:787` y
      `v2/index.html:10187`, y verificar cómo está escrito en la hoja `KINESIOLOGOS` de la
      planilla real (la semilla solo se aplica si la hoja está vacía). Sale en la firma de cada
      evolución suya. **No depende de este PRD: puede viajar hoy.**
- [ ] **Resolver D7 y D8 con Diego** (arriba). D8 bloquea el segundo factor; D7 bloquea que la
      corrección dure más de un turno.
- [ ] Definir cómo recibe cada una su clave la primera vez y cómo registra su código en el
      teléfono. Nunca por escrito en un chat ni en la planilla; en persona o por un canal que se
      borre.
- [ ] Decidir si las dos mejoras del buscador (RUT y palabras sueltas) viajan antes, sueltas —
      no dependen del resto y le sirven a todo el equipo desde el primer día.
- [ ] Al desplegar: `crearORepararEstructura()`, subir el número de columnas escrito a mano en
      `testEsquema()`, y **avisar** — publican Manuel o Diego, y quien publica avisa (regla del
      14-ago). No se crea implementación nueva: se apunta la existente.

---

## 10 · Cambio del 19-ago-2026: usuario de login ≠ firma clínica

Manuel pidió que, en la puerta, se entre como **coord1 / coord2 / coord3** —
no como MCC/DMV/MFB. Es una separación deliberada: la pantalla de entrada no
tiene por qué revelar quién tiene acceso privilegiado con solo mirarla.

- `coord1` → MCC (Magdalena) · `coord2` → DMV (Diego) · `coord3` → MFB (Manuel).
- El servidor resuelve el usuario a la firma real al validar la clave; **la
  firma real sigue siendo la que queda estampada** en cada corrección y en
  `AUDIT_LOG` — nada de la trazabilidad se pierde, solo se esconde de la
  pantalla de login.
- Un usuario que no existe y una clave incorrecta dan el **mismo mensaje**
  («Usuario o clave incorrectos.»): antes se distinguía «esa firma no tiene
  acceso», que ya delataba cuáles firmas eran válidas.
- Las claves temporales pasan a ser **12 caracteres alfanuméricos**
  (agrupados 4-4-4 para dictarlos fácil), pedido explícito de Manuel — antes
  eran 10. Siguen siendo de un solo uso: la persona las cambia al entrar.
- Se agregó al panel un botón **«Restablecer otra»**: elegís el usuario (sin
  mostrarte a ti mismo) y el sistema genera su temporal — es el camino normal
  de D8, que ya existía en el servidor pero no tenía botón en la pantalla.
