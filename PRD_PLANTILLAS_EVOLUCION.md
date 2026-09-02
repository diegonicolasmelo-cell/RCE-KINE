# PRD · Plantillas de evolución

**Estado**: propuesto — esperando el visto bueno de Diego
**Dueño clínico**: Diego Melo · **Dueño técnico**: quien programe la tanda
**Alcance**: que cada kinesiólogo tenga sus propias plantillas de evolución, una
por caso clínico; que la cama asignada traiga la de su colega; y que una barra de
chips arriba del formulario anuncie de entrada qué plantilla se va a usar.
**Fuera de alcance**: las frases rápidas (opción C — queda en el banco, no
descartada) · aprender el estilo de cada uno leyendo sus evoluciones (era el plan
viejo de «Mi estilo»: **este PRD lo reemplaza**) · texto con formato · plantillas
para otros servicios · el registro de PVE superada sin extubar (**PRD hermano**,
prerrequisito del caso «Extubación»).

> **De dónde sale**: Diego, en una capacitación de TrakCare (2-sep-2026): *«me
> interesó la evolución tipo plantilla según el caso y la posibilidad de que los
> clínicos creen plantillas personalizadas»*. El diseño se cerró con él en tres
> vueltas de mockup.

---

## 1 · Hoy y después, en dos líneas

- **Hoy**: el texto se arma solo, con un único molde igual para los doce
  kinesiólogos y para los veinte escenarios clínicos. El que quiere otro orden u
  otras palabras, lo edita a mano todos los turnos.
- **Después**: el texto se arma con **la plantilla del colega para el caso de hoy**,
  con los datos del formulario ya puestos; lo que se edita es el matiz, no la
  estructura.

---

## 2 · La historia

### Antes

Magdalena entra a las 8. Le tocan las camas 1, 4 y 7. La 4 es un paciente con su
**tercera PVE fracasada** en ocho días.

El texto se arma solo, pero con el orden de siempre: vía aérea, soporte,
secreciones, motor, plan. Ella escribe distinto: parte por el destete, porque es
lo que le importa al que lee, y siempre agrega su frase sobre el trabajo de
musculatura respiratoria, que el molde no tiene. Así que corta, pega, reordena y
escribe esa frase. Otra vez. Como los últimos veinte turnos.

Cuando el sábado la cama la toma Felipe, la evolución vuelve al orden de fábrica.
El que la lee el lunes no sabe si el destete se estancó o si cambió el que
escribe.

### Después

Magdalena abre la cama 4. Arriba, donde está la fase clínica, aparece una línea
más: **caso sugerido «PVE fracasada»**, en ámbar, y la plantilla que aparece es
**la de ella**, porque la cama es suya en el tablero de turno.

El texto llega escrito con su orden y sus palabras:

> «3ª PVE del episodio, weaning prolongado (8 días desde la 1ª prueba). Se
> suspende a los 18 min por taquipnea y uso de musculatura accesoria. Vuelve a VM
> PSV: PS 12, PEEP 6, FiO₂ 0,40. Secreciones abundantes, purulentas, se aspira por
> TOT. Se mantiene sedestación y trabajo de musculatura respiratoria según
> tolerancia. Plan: nueva PVE mañana si mejora el manejo de secreciones.»

Toca el plan, agrega una línea y guarda. El sábado Felipe abre la misma cama y le
sale **la suya**, con su forma de escribir — y si quiere usar la de Magdalena, la
encuentra más abajo en el catálogo.

---

## 3 · Objetivos y no-objetivos

| | |
|---|---|
| **O1** | Cada colega puede tener **varias plantillas, una por caso**, y editar las suyas. |
| **O2** | Existe **un juego de plantillas de la unidad** como respaldo, para quien no quiera tener las propias. Solo coordinación las edita. |
| **O3** | Al elegir la cama, el catálogo se ordena: **las del colega asignado → las de la unidad → las de otros colegas**. Las de otros se pueden usar igual. |
| **O4** | El **caso se sugiere solo** desde lo que ya se registró en el turno; el colega lo confirma o lo cambia. |
| **O5** | Los comodines se rellenan con los datos del formulario. **Sin dato, la frase entera desaparece.** |
| **O6** | La barra de chips **reemplaza la fila de eventos** que se había diseñado para la tanda D: al elegir el evento se anuncia de entrada qué plantilla se va a usar. |

| | |
|---|---|
| **NO1** | **Nunca se pisa texto tocado o guardado** (regla de la v5.85). La plantilla se ofrece; no se impone. |
| **NO2** | **No se cambia el esquema de EVOLUCIONES.** Las plantillas viven en una hoja-catálogo aparte. |
| **NO3** | No hay códigos que teclear de memoria (el `RHMAB1` de TrakCare). Se elige por nombre. |
| **NO4** | No se inserta texto pegado al cursor sin separación ni mayúscula (el `holaPaciente` de TrakCare). |
| **NO5** | Una plantilla **de la unidad** no la publica una sola persona: solo las tres firmas de coordinación. Un typo guardado se replica en cada ficha. |
| **NO6** | Usar la plantilla de otro **no cambia la firma**: quien escribe es quien firma. |
| **NO7** | No se guarda versión «con formato». La evolución es texto plano. |
| **NO8** | No se toca el catálogo de fases clínicas ni su significado. |

---

## 4 · El flujo, dibujado dos veces

### Cómo funciona hoy

```
El colega elige cama y fecha
        ↓
El formulario se llena (vía aérea, soporte, KTM, secreciones…)
        ↓
El motor arma el texto  ─ un solo molde, igual para todos ─
   · en el cliente:  genTexto()            (index.html ~8648)
   · en el servidor: generarTextoEvolucion() (dominio_texto.gs:42)
        ↓
El colega edita a mano lo que no le acomoda
        ↓
Guarda — y desde la v5.85 el texto queda congelado
```

### Cómo va a funcionar

```
El colega elige cama y fecha
        ↓
La cama trae su firma asignada (tablero de turno — YA EXISTE)
        ↓
Se arma el CATÁLOGO ordenado:  del colega → de la unidad → de otros
        ↓
El formulario se llena
        ↓
Del turno sale el CASO sugerido  (PVE fracasada, reintubación, TQT…)
        ↓
La barra de chips lo muestra en ámbar: fase · evento · plantilla
        ↓
El motor arma el texto CON LA PLANTILLA ELEGIDA
   · comodines → los rellena el formulario
   · el resto  → las palabras del colega
        ↓
El colega ajusta el matiz y guarda — el texto sigue siendo suyo
```

---

## 5 · Los datos

### La hoja nueva (no toca EVOLUCIONES)

`PLANTILLAS_EVOLUCION`

| Columna | Qué guarda |
|---|---|
| `ID` | Identificador de la plantilla |
| `DUENO` | La firma del colega (`MCC`, `DMV`…) o `UNIDAD` |
| `CASO` | Uno de los 13 casos, o `general` |
| `NOMBRE` | Como la ve el colega en el catálogo |
| `CUERPO` | El texto con comodines |
| `ACTIVO` | Para retirarla sin borrarla |
| `ORDEN` | Empate dentro del mismo estante |
| `ACTUALIZADO` | Fecha y firma de la última edición |

### Los 13 casos y qué los dispara

Ninguno hay que programarlo desde cero: **todos se registran ya** en el
formulario.

| Caso | Se ofrece cuando | De dónde sale |
|---|---|---|
| VM sin destete | Sigue en VM, causa de base no resuelta | `PVE_VAL = 'nc'` |
| Destete diferido | Se evaluó y hoy no se pudo | `PVE_VAL = 'no'` + una de las 9 razones |
| PVE fracasada | La prueba no se toleró | `PVE_RESULTADO = 'frustra'` |
| Extubación | Prueba superada y se extuba | `PVE_RESULTADO = 'superada'` + `EXT_OCURRIO` |
| PVE superada sin extubar | Se superó y no se extubó | `PVE_SUP_SIN_EXT` — **PRD hermano** |
| Post-extubación | Turnos siguientes, con soporte PE | Extubado + soporte post-extubación |
| Reintubación | Vuelve a vía aérea artificial | Evento de reintubación |
| TQT | El día que se traqueostomiza | Vía aérea → TQT |
| Destete por TQT | Destete largo con cánula | TQT + soporte |
| Decanulación | Se retira la cánula | Evento de decanulación |
| Ingreso | Primera evolución del episodio | Primer turno del episodio |
| Prono | Turno con pronación | Prono marcado |
| Rehabilitación | El eje motor al frente | Fase Rehabilitación |
| Sin novedades | Todo sigue igual | Elección manual |

> Diego cerró este catálogo el 2-sep-2026: *«el catálogo está bien… si faltan más,
> revisando después te aviso»*. Agregar uno es una fila en la hoja, no código.

### La regla que evita que el catálogo explote

El **grado del destete no abre casos nuevos**: viaja como comodín
`{weaning_grado}`. «PVE fracasada» en un destete simple y en uno prolongado son la
misma plantilla con un dato distinto — si se abriera una por combinación,
serían treinta plantillas que nadie mantiene.

La app ya calcula ese grado sola, en **`_weanClase`** (`index.html` ~4513):
*difícil* = 1 o más PVE fracasadas · *prolongado* = 3 o más fracasos, o más de 7
días desde la primera prueba. Hoy solo se usa para pintar la tarjeta de la cama.

### Los comodines

Cada uno sale de un dato que el formulario **ya tiene**. La regla que fijó Diego:
*«el formulario aporta datos que son rellenables, lo demás es narrativa»*.

`{via_aerea}` · `{soporte}` · `{parametros}` · `{secreciones}` · `{sedacion}` ·
`{ktm}` · `{mrc}` · `{fss}` · `{dispositivos}` · `{plan}` · `{weaning_grado}` ·
`{pve.intento}` · `{pve.duracion}` · `{pve.motivos}` · `{evento.hora}` ·
`{evento.motivo}` · `{evento.previo}` · `{tiempo_extubado}`

### El candado (ya existe, no hay que inventarlo)

La v5.85 dejó dos marcas en el cliente: `_textoManual` (alguien escribió) y
`_textoCongelado` (nadie lo regenera: editado **o** ya guardado). **La plantilla
solo actúa cuando las dos son falsas.** Si hay texto propio, se ofrece con
`uiConfirm` y se aplica solo si el colega acepta.

### Inventario de consumidores del texto

🔴 Éste es el punto donde el proyecto ya se equivocó antes (los filtros, el «día
con VM», las secreciones): la regla del texto vive en **más de un sitio y hay que
tocarlos todos**.

| Dónde | Qué es | Qué pasa |
|---|---|---|
| `index.html:8648` · `genTexto()` | El motor del cliente (lo que se ve en pantalla) | 🔧 **Cambia** — aplica la plantilla |
| `dominio_texto.gs:42` · `generarTextoEvolucion()` | El motor del servidor | 🔧 **Cambia** — paridad obligatoria con el cliente |
| `svc_evoluciones.gs:410` | Decide entre el texto del cliente y el del servidor al guardar | 🔍 **Revisar** — la plantilla debe viajar o reproducirse igual |
| `svc_evoluciones.gs:1195` | Regenera el texto en rutinas de mantenimiento | 🔍 **Revisar** — sin plantilla debe seguir dando lo de hoy |
| `index.html` · `previewTexto` / `_rtxtLive` | Regeneración en vivo | 🔧 **Cambia** — respeta el congelado (ya lo hace) |
| `svc_entrega.gs` | La entrega de turno | 🔍 **Revisar** — lee campos, no el texto: no debería cambiar |
| Hoja de registro imprimible | El papel de la unidad | 🔍 **Revisar** — idem |
| `index.html` · `renderFases` (~11970) | La barra de chips de fase | 🔧 **Cambia** — se le suma la fila de plantilla |
| `index.html` · Turnos (~11711, ~10312) | Reparto de camas → firma | ✅ **No cambia** — la cañería ya existe, solo se lee |

---

## 6 · El acuerdo, en pseudo-código

```
CUANDO se abre una cama
    → firma = la que el tablero de turno asignó a esa cama   (ya existe)
    → catálogo = plantillas de esa firma
                 + plantillas de la unidad
                 + plantillas de otros colegas   (en ese orden, siempre)

CUANDO cambia algo del formulario
    → caso = el que corresponda a lo registrado
             (evento marcado manda sobre la fase clínica)
    → la plantilla de ese caso se muestra SUGERIDA, en ámbar

CUANDO se aplica una plantilla
    SI el texto está congelado o escrito a mano
        → se pregunta con uiConfirm; sin un sí, no se toca nada
    SI NO
        → se arma el texto: cada comodín se reemplaza por su dato
        → un comodín sin dato se lleva su frase completa
        → nunca queda un hueco, un «undefined» ni una coma suelta

CUANDO el colega edita el texto
    → queda congelado, como desde la v5.85: ninguna plantilla vuelve a tocarlo

CUANDO un coordinador edita una plantilla de la unidad
    → se exige sesión de coordinación en el SERVIDOR, en la acción
    → queda registrado quién y cuándo
```

### Las promesas

1. **Quien no configure nada no pierde nada**: sin plantilla propia se usa la de
   la unidad; sin plantilla de la unidad, el texto se arma exactamente como hoy.
2. **La firma no la cambia la plantilla.** Usar la de otro colega no altera quién
   firma la evolución.
3. **El texto escrito por una persona no se pisa nunca** — ni al cambiar de
   plantilla, ni al reabrir el turno, ni al tocar una casilla.
4. **Sin cambios en EVOLUCIONES.** Ninguna columna nueva: la hoja de plantillas es
   un catálogo, como el de fases.
5. **El cliente y el servidor escriben el mismo texto.** Se prueba con guardia,
   porque la paridad es donde este proyecto se ha roto antes.

---

## Lo que este PRD no resuelve todavía

- **Cuántas plantillas de la unidad**: Diego dijo *«hay una de la unidad por si
  alguien no quiere»*. Se asume **una por caso** (el juego de respaldo completo).
  Si él quiere una sola global, es un ajuste de una línea.
- **Dónde se editan**: se propone una sección propia en ⚙️ Ajustes. Falta ver si
  conviene entrar desde el mismo chip de la plantilla.
- **El celular**: la barra de chips en pantalla angosta. La fase clínica ya
  resolvió ese problema; se copia su comportamiento.
