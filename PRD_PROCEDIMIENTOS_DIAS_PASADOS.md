# PRD — Corregir los procedimientos de un día pasado

**Estado:** Borrador · **Dueño:** Manuel Fuentes Blanco · **Creado:** 2026-08-20
**Alcance:** agregar y quitar **procedimientos sueltos** de un turno ya guardado,
desde la pestaña Registro Diario, retrocediendo con los botones `◀ ▶` que ya
existen, con clave de coordinación.
**NO toca:** los eventos de vía aérea (intubación, extubación, reintubación, PVE,
decanulación, desvinculación, cambio de TOT/TQT, TQT), el prono/supinación, el
ingreso ni el fallecimiento — ver NO1, que es la decisión clínica central de este
documento. Tampoco toca el texto de la evolución, el REM, ni los indicadores.

---

## 1 · Resumen

**Hoy:** si un procedimiento no quedó anotado, o se anotó uno que no fue, la única
salida es `anularEvento` — y solo funciona **desde la última evolución del
paciente**. Tres días después, no hay forma desde la app.

**Después:** se retrocede al día, se entra con clave de coordinación, y se agrega o
se quita el procedimiento suelto que falta o que sobra. Firmado, sellado y auditado.

---

## 2 · La historia

### ANTES

Turno noche del jueves. Al paciente de la cama 6 le hacen una ecografía diafragmática
a las 3 de la mañana, en medio de un destete difícil. El kinesiólogo la hace, la
comenta en la entrega, y con el apuro del cambio de turno guarda la evolución sin
marcar la casilla.

El domingo, Magdalena está cerrando el conteo del mes y ve que la unidad registró
cuatro ecografías cuando ella sabe que fueron cinco. Sabe cuál falta, sabe el día,
sabe la cama. No puede hacer nada: la app la deja mirar el jueves, pero no tocarlo,
y `anularEvento` le responde que solo se puede corregir desde la última evolución —
que ya es la del domingo, tres turnos más adelante.

La corrección queda en un papel pegado en el office: «ojo, la eco del jueves no está
en el sistema». El número que sale a la estadística es cuatro, y la diferencia con la
planilla antigua es exactamente esa.

### DESPUÉS

Magdalena retrocede con `◀` hasta el jueves. La barra le muestra el turno noche.
En la fila de la cama 6 toca el botón de corregir procedimientos. Como no tiene
sesión abierta, la app le pide su clave de coordinación.

Ve la lista de lo que quedó anotado ese turno, y debajo, la lista de lo que **puede**
agregar. Toca `ECOGRAFÍA`. La app le avisa que la corrección quedará firmada como
MCC y con la fecha de hoy, aunque el procedimiento sea del jueves.

Confirma. El procedimiento aparece en el jueves, en el conteo del mes, en la Hoja UCI
del paciente y en el riel de hitos — pero **en su lugar cronológico, no arriba de
todo**. En `AUDIT_LOG` queda: quién, qué agregó, a qué turno, y cuándo lo hizo.

Al mes siguiente el número que sale a la estadística es cinco.

---

## 3 · Objetivos / No-objetivos

| | |
|---|---|
| **O1** | Desde Registro Diario, retrocediendo de día, se puede **agregar** un procedimiento suelto a un turno ya guardado. |
| **O2** | …y **quitar** uno que se anotó por error, dejándolo trazado (no un borrado silencioso). |
| **O3** | Solo con clave de coordinación (`MCC`/`DMV`/`MFB`), y cada corrección firmada con la firma clínica real. |
| **O4** | Cada corrección deja fila en `AUDIT_LOG` con turno, procedimiento y sentido (agregado/quitado). |
| **O5** | Corregir un turno pasado **no cambia el estado actual de la cama**: ni el soporte, ni la vía aérea, ni los contadores de días, ni el texto de la evolución. |
| **O6** | Las tres capas quedan coherentes entre sí: hoja `PROCEDIMIENTOS`, `PROC_JSON` de la evolución, y `TIMELINE` + su cache. Hoy no lo están (ver §4). |
| **O7** | El hito corregido aparece en el riel **en su fecha real**, no al tope por haberse escrito hoy. |
| **NO1** | 🔴 **No se pueden corregir eventos que arrastran estado.** Intubación, extubación, reintubación, PVE, decanulación, recanulación, desvinculación, cambio de TOT/TQT, TQT, prono, supinación, ingreso y fallecimiento quedan fuera: los turnos posteriores se construyeron sobre ellos y cambiarlos hacia atrás deja la ficha mintiendo. Esos siguen exigiendo la última evolución. |
| **NO2** | No recalcula nada hacia adelante. Es la contracara de NO1: como solo entran procedimientos que no arrastran, no hay cadena que rehacer. |
| **NO3** | No arregla `anularEvento` para los eventos de vía aérea. La deuda que se encontró (§4) se documenta y se acota; arreglarla es otro PRD. |
| **NO4** | No cambia el REM, los indicadores ni la carga kinésica — porque **ninguno lee procedimientos** (verificado, ver §5). |

---

## 4 · Cómo funciona hoy → cómo va a funcionar

### Lo que se encontró antes de diseñar (inventario de consumidores)

Tres hallazgos cambiaron el diseño. Van explícitos porque son la razón de que el
flujo nuevo no sea «reusar el guardado normal»:

**1. No se puede reusar `guardarEvolucion`.** Ese camino llama a
`_syncCamaDesdeEvolucion`, que escribe `CAMAS_ESTADO` **incondicionalmente** con el
estado del turno que se guardó: soporte, vía aérea, fechas de inicio, último turno,
textos, firmas. Guardar el jueves un domingo haría **retroceder la tarjeta de la cama
al jueves**. Es el riesgo mayor de este cambio.

**2. El molde correcto ya existe y es `anexarEventoRapido`.** Esa función **ya
permite** agregar un procedimiento a cualquier turno pasado —acepta el turno que le
pasen, sin compararlo con la última evolución— y ya escribe las tres capas y
sincroniza el cache del timeline. Lo que no existe es su simétrico para quitar.

**3. `anularEvento` está a medias, y ninguna guardia lo cubre.** Cuando anula, saca
el procedimiento de `PROC_JSON` pero **no borra la fila de la hoja `PROCEDIMIENTOS`
ni el hito de `TIMELINE`, ni reescribe el cache**. Hoy queda tapado porque el guard
de «última evolución» hace que el siguiente guardado del mismo turno lo repare por
accidente. Es deuda preexistente: este PRD no la hereda (NO3), pero el flujo nuevo
**sí** tiene que hacer las tres cosas bien desde el principio.

```
HOY                                      DESPUÉS

Registro Diario ◀ ▶ (ya existe)          Registro Diario ◀ ▶ (igual)
   │                                        │
   ├ mira cualquier día                     ├ mira cualquier día
   └ NO puede tocarlo                       └ botón «corregir procedimientos»
                                               │
anularEvento                                   ├ ¿hay sesión de coordinación?
   └ ⛔ «solo desde la ÚLTIMA evolución»        │    └ no → pedir clave (reusa la puerta)
        (y cuando funciona, deja la hoja        │
         PROCEDIMIENTOS y TIMELINE             ├ muestra: lo anotado ese turno
         desincronizados)                       │           + lo que se puede agregar
                                                │             (lista blanca, §5)
                                                └ al confirmar → COORD_PROCS_TURNO
                                                      ├ escribe las TRES capas
                                                      ├ hito con la fecha del TURNO
                                                      ├ NO toca CAMAS_ESTADO
                                                      └ AUDIT_LOG + sello visible
```

---

## 5 · Los datos

**Disparador:** confirmar la corrección en el modal de procedimientos de un turno
pasado, con sesión de coordinación válida.

### La lista blanca — hay que construirla

⚠️ **Hoy no existe un catálogo de procedimientos.** Lo que hay son 28 literales
dentro de la función que los deriva del formulario, más un diccionario que los mapea
a hitos, más un campo de texto libre sin validación. Este PRD **crea** la lista
cerrada de lo que se puede corregir hacia atrás, como constante compartida entre
servidor y cliente.

| Se puede corregir hacia atrás | Por qué |
|---|---|
| `ECOGRAFÍA`, `IMAGENOLOGÍA`, `PABELLÓN` | solo dejan fila y hito |
| `ASISTENCIA EN PROCEDIMIENTO MÉDICO`, `RCP` | ídem |
| `EDUCACIÓN A USUARIO/FAMILIA` | el REM la cuenta por su propio campo, no por el procedimiento |
| `IMT`, `EMS` | el indicador usa sus campos, no la fila |
| `CULTIVO DE SECRECIONES`, `PCR COVID` | ⚠️ ver la trampa de la entrega, abajo |
| `TEST APNEA` | el acumulado va por su propio campo |
| `EVALUACIÓN INTERMEDIA` | el REM la cuenta por evolución |
| texto libre (chip manual) | sin consumidor fuera del conteo y el riel |

| **Queda fuera (NO1)** | Qué arrastra |
|---|---|
| `INTUBACIÓN`, `REINTUBACIÓN` | vía aérea, fechas de inicio, fila en `REINTUBACIONES`, REM |
| `PVE`, las cuatro `EXTUBACIÓN*`, `AUTOEXTUBACIÓN` | 14 columnas del turno y el pliegue de días de VM |
| `DECANULACIÓN`, `RECANULACIÓN` | vía aérea y pliegue de días |
| `DESVINCULACIÓN` | decide el soporte final del turno |
| `CAMBIO TOT`, `CAMBIO TQT`, `TQT` | vía aérea y REM |
| `PRONO`, `SUPINACIÓN` | 🪤 **sellan horas a través de turnos**: un ciclo puede durar días. Es el arrastre menos obvio del sistema y ya costó dos guardias. |
| `INGRESO`, `FALLECE` | hitos de episodio, no de turno |

### Qué se toca al corregir

| Capa | Qué pasa |
|---|---|
| hoja `PROCEDIMIENTOS` | se inserta o se borra la fila de ese `ID_EVOLUCION` |
| `EVOLUCIONES.PROC_JSON` / `PROC_RESUMEN` / `PROC_CANTIDAD` | se recalculan desde la lista resultante |
| `TIMELINE` | se inserta o se borra el hito — **con el sello de tiempo del TURNO, no de hoy** (O7) |
| `TIMELINE_JSON` de la cama | se reescribe siempre, aunque la corrección sea de hace días |
| `CAMAS_ESTADO` (lo demás) | 🔴 **no se toca nada más** (O5) |
| `AUDIT_LOG` | fila nueva: firma, turno corregido, procedimiento, sentido |
| `CORRECCIONES_JSON` de la evolución | sello visible, mismo mecanismo que ya usa la corrección de fichas |

### Los consumidores, y qué les pasa

| Consumidor | ¿Le afecta? |
|---|---|
| Tablero, tarjeta «Procedimientos» | **Sí** — es el punto: el conteo del rango cambia |
| Registro Diario (columnas PROC) y su exportación | **Sí**, al mirar ese día |
| Hoja UCI / historial del paciente | **Sí** |
| Riel de hitos | **Sí** — y por O7 aparece en su fecha |
| **Entrega de turno** | ⚠️ **Sí, y hay que decirlo en pantalla**: la entrega muestra el **último** cultivo de cada cama. Quitar el cultivo más reciente hace **retroceder** esa fecha. Es el único consumidor donde quitar tiene efecto no obvio. |
| REM 28 | **No** — no lee procedimientos en ninguna línea |
| Indicadores | **No** |
| Tabla dinámica | **No** — su lista blanca no incluye los campos de procedimientos |
| Carga kinésica / «atenciones» | **No** — se calcula de las cantidades de KTR y KTM. Los procedimientos **no** suman a la carga. |
| Texto de la evolución e imprimibles | **No** — no imprimen la lista cruda |

---

## 6 · Pseudo-código — el acuerdo

```
CUANDO llega una corrección de procedimientos para un turno

  ¿hay sesión de coordinación válida?     → si no, rechazar y pedir clave
  ¿existe la evolución de ese turno?      → si no, rechazar (no se inventan turnos)
  ¿está la cama ocupada por ese paciente
    o el episodio existe en el archivo?   → si no, rechazar
  ¿TODOS los procedimientos de la petición
    están en la lista blanca?             → si alguno arrastra estado, rechazar
                                             ENTERA, nombrando cuál y por qué
                                             (nunca aplicar la mitad)

  ENTONCES, para cada uno:
    si es AGREGAR y ya estaba   → no hacer nada (idempotente, no duplicar)
    si es QUITAR y no estaba    → no hacer nada
    si corresponde:
      escribir/borrar la fila en PROCEDIMIENTOS
      recalcular PROC_JSON / PROC_RESUMEN / PROC_CANTIDAD del turno
      insertar/borrar el hito en TIMELINE, fechado con el TURNO
      anotar en AUDIT_LOG: firma, turno, procedimiento, sentido
      acumular el sello en CORRECCIONES_JSON de esa evolución

  AL TERMINAR (una sola vez, no por procedimiento):
    reescribir TIMELINE_JSON de la cama
    NO tocar ninguna otra columna de CAMAS_ESTADO

  SI se quitó un cultivo:
    avisar en la respuesta que la fecha de cultivo de la entrega puede retroceder
```

**Promesas**

- **Corregir el pasado nunca cambia el presente de la cama.** Ni soporte, ni vía
  aérea, ni días, ni el último turno, ni los textos.
- Solo entra lo que está en la lista blanca. Si la petición trae algo que arrastra
  estado, **se rechaza entera** — no se aplica a medias.
- Es idempotente: agregar dos veces lo mismo deja una sola fila.
- Las tres capas terminan coherentes, siempre, incluso si la corrección es de hace
  semanas.
- Un hito corregido aparece **en su fecha**, no al tope del riel.
- Nada se borra en silencio: todo pasa por `AUDIT_LOG` y por el sello visible.
- Ningún indicador del REM cambia por esto, porque el REM no lee procedimientos.

---

## 7 · Lo que hay que dejar cubierto con guardias

`anularEvento` no tiene **ninguna** guardia hoy, y este flujo va a vivir al lado.
Antes de dar por bueno el cambio:

1. Corregir un turno de hace 3 días **no mueve** ni una columna de `CAMAS_ESTADO`
   fuera de `TIMELINE_JSON` (A/B contra el estado previo).
2. Las tres capas quedan coherentes: lo que dice `PROC_JSON` es lo que hay en la
   hoja y lo que hay en el riel.
3. Un procedimiento de la lista negra es rechazado, uno por uno, con su nombre.
4. Agregar dos veces el mismo procedimiento deja **una** fila.
5. El hito retroactivo **no** queda al tope del cache de la cama.
6. Sin sesión de coordinación, la acción es rechazada por el servidor — no por
   esconder el botón.
