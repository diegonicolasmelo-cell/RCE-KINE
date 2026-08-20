# PRD — Corregir el registro de un día pasado

**Estado:** Borrador · **Dueño:** Manuel Fuentes Blanco · **Creado:** 2026-08-20
**Actualizado:** 2026-08-20, con el alcance real que pidió Manuel y el mecanismo elegido.

**Alcance:** desde el botón **➕** que ya existe en cada fila del Registro Diario,
retrocediendo de día con `◀`, poder **agregar y quitar** lo que no quedó registrado:
procedimientos del catálogo, **KTR**, **KTM (cantidad y nivel)**, tomas de cultivo y
**evaluaciones funcionales y de fuerza**. Con clave de coordinación **solo cuando la
fecha no es la de hoy**.

**NO toca:** los eventos de vía aérea (intubación, extubación, reintubación, PVE,
decanulación, desvinculación, cambio de TOT/TQT, TQT), el prono, el ingreso ni el
fallecimiento — ver NO1. Tampoco el alta ni las fechas de la ficha, que se corrigen
desde la pestaña 🔐 COORDINACIÓN y ya funcionan.

---

## 1 · Resumen

**Hoy:** el ➕ ya escribe en el turno de la fecha que esté puesta en la barra, y **no
tiene ningún candado**: cualquiera puede retroceder tres semanas y anotar. Pero solo
sabe **agregar**, y solo procedimientos, filtros, sonda y cultivo — no KTR, no KTM, no
las evaluaciones. Y no sabe **quitar** nada.

**Después:** el mismo ➕ agrega y quita también KTR, KTM con su nivel y las evaluaciones
funcionales; en el día de hoy sigue siendo de todo el equipo, y en cualquier día pasado
pide clave de coordinación y queda firmado.

## 2 · La historia

### ANTES

Turno de noche. Al paciente de la cama 6 le hacen kinesiterapia motora y queda anotada
**en la ficha de papel, con su nivel**. En el apuro del cambio de turno, la evolución se
guarda sin ese dato.

Semanas después, cerrando el mes, Manuel cruza el RCE contra la planilla antigua y no
cuadran. Va al papel y ahí está: **KTM con nivel, escrito de puño y letra, que en el RCE
no existe**. No es un error de cálculo ni una definición distinta de indicador: es
**subregistro**. La atención se hizo, se anotó en papel, y el sistema no la tiene.

Y no se puede arreglar. Puede retroceder con `◀` y **ver** ese jueves, pero la única
forma de meterle el KTM sería reabrir la evolución de ese turno y guardarla otra vez —
lo que pisa el estado de la cama con el de hace tres semanas. Así que el número que sale
a la estadística sigue siendo el equivocado, y la diferencia con el papel se queda ahí,
mes tras mes.

### DESPUÉS

Manuel retrocede al jueves con `◀`. En la fila de la cama 6 toca el **➕**. Como la fecha
no es la de hoy, la app le pide su clave de coordinación — en el día de hoy no la habría
pedido, porque anotar lo del propio turno sigue siendo de todo el equipo.

Elige **KTM**, pone la cantidad y el nivel que dice el papel. La app le avisa, antes de
guardar, que eso **cambia el REM de agosto**. Confirma.

El KTM aparece en el jueves, en la carga kinésica del mes y en la ficha del paciente, con
la firma de quien lo corrigió y la fecha en que se corrigió — no la del turno, para que
nadie confunda cuándo se hizo la atención con cuándo se registró.

Al mes siguiente el RCE y el papel dicen lo mismo.

## 3 · Objetivos / No-objetivos

| | |
|---|---|
| **O1** | Desde el ➕ del Registro Diario, retrocediendo de día, se puede **agregar** lo que no quedó registrado: procedimientos del catálogo, **KTR**, **KTM con su nivel**, evaluaciones funcionales y de fuerza, y cultivos. |
| **O2** | …y **quitar** lo que se anotó por error, **anulándolo con traza**: desaparece de los conteos y de la ficha, pero queda en `AUDIT_LOG` quién lo quitó, cuándo y qué era. Nada se borra en silencio. |
| **O3** | En la fecha de **hoy** el ➕ sigue siendo de todo el equipo. En **cualquier día pasado** exige sesión de coordinación y firma con la firma clínica real. |
| **O4** | El candado se verifica **en el servidor**, en cada acción — no en si el botón se ve. |
| **O5** | Corregir un turno pasado **no cambia el estado actual de la cama**: ni soporte, ni vía aérea, ni contadores, ni el último turno, ni los textos. |
| **O6** | Las tres capas quedan coherentes: hoja `PROCEDIMIENTOS`, `PROC_JSON` de la evolución, y `TIMELINE` con su cache. |
| **O7** | El hito corregido aparece en el riel **en su fecha real**, no al tope por haberse escrito hoy. |
| **O8** | La coordinación se enciende desde un **botón en la barra superior**, que **marca a la vista de quién es la sesión abierta**. La pestaña 🔐 COORDINACIÓN desaparece. |
| **O9** | Se llega al paciente de dos formas: **por fecha** (`◀ ▶`, viendo quién estaba ese día) y **por el buscador** (nombre, apellido o RUT, con **Enter**), que es la única vía para un **egresado**. |
| **NO1** | 🔴 **No se pueden corregir eventos que arrastran estado.** Intubación, extubación, reintubación, PVE, decanulación, desvinculación, cambio de TOT/TQT, TQT, prono, supinación, ingreso y fallecimiento quedan fuera: los turnos posteriores se construyeron sobre ellos. Esos siguen exigiendo la última evolución. |
| **NO2** | No recalcula la cadena clínica hacia adelante. Es la contracara de NO1. |
| **NO3** | No arregla la deuda de `anularEvento` para los eventos de vía aérea (§4). Se documenta y se acota. |
| **NO4** | No toca el alta ni el egreso — eso es `PRD_REPARAR_ALTAS.md`. |

### ⚠️ Lo que este PRD SÍ mueve, y hay que decirlo fuerte

La versión anterior de este documento prometía que nada de esto tocaba el REM. **Con
KTR y KTM dentro, eso dejó de ser cierto** y sería peligroso dejarlo escrito: esos dos
campos alimentan el **REM 28** que se le reporta al hospital.

Corregir el KTM de un turno de hace tres semanas **cambia el REM de ese mes**. Si ese mes
ya se envió, las cifras dejan de coincidir con lo enviado. Es exactamente lo que Manuel
quiere —el dato real está en el papel y el sistema no lo tiene— pero obliga a dos cosas:

1. La pantalla **avisa qué mes se está moviendo** antes de guardar.
2. `AUDIT_LOG` deja la traza para poder explicar, meses después, por qué una cifra
   cambió después de haberse reportado.

Las **evaluaciones funcionales** (MRC, FSS, dinamometría, CPAx) tampoco son inocuas:
alimentan interpretaciones de egreso y el tablero. Mismo trato.

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

---

## 4bis · La interfaz: todo ocurre en Registro (decisión de Manuel, 20-ago)

### El principio

**La pestaña 🔐 COORDINACIÓN desaparece.** Coordinación deja de ser *un lugar* y pasa a
ser *un estado*: se enciende con un botón en la barra superior y, mientras está
encendida, el Registro Diario deja corregir. Se trabaja donde ya se trabaja.

### Lo que YA existe y NO hay que construir

Antes de diseñar nada se midió qué había. Casi todo el camino está hecho:

| Pieza | Estado | Dónde |
|---|---|---|
| Navegar por fecha, un clic = un día | ✅ existe | `cambiarDia(±1)`, index.html:1595-1599 |
| **Ver quién estaba ese día** (no el ocupante de hoy) | ✅ existe desde v5.8 | guardia `retro_camas.js` |
| Buscar por nombre, apellido o **RUT**, incluidos **egresados** | ✅ existe | `hSrch` → `GET_BUSCAR_PACIENTE`, index.html:6903 |
| El buscador distingue `🛏️ Cama N` de `🗃️ Egresado` | ✅ existe | `hSrchRender` |
| El ➕ por fila, con su popover y 6 tipos | ✅ existe | `evAbrir`, index.html:4783 |
| El ➕ escribe en **la fecha de la barra** | ✅ existe… y ese es el problema | `turnoKey`, index.html:9950 |

### Lo que hay que construir

**1 · El botón de coordinación, en la barra.** Va en `.hbar-actions`, junto a 🔄 y 🤖.

```
APAGADO   [🔓 Coordinación]   gris discreto, como sus vecinos
ENCENDIDO [🔐 MCC]            marcado: color de acento y la FIRMA a la vista
```

Encendido tiene que **notarse desde lejos y decir de quién es la sesión** — es el mismo
criterio que el botón de cierre: una sesión abierta da acceso a corregir el registro de
cualquier paciente, así que nadie debe poder ignorar que está abierta. Al tocarlo
apagado abre el login; encendido, ofrece cerrar sesión, cambiar clave y restablecer la
de otra persona (lo que hoy vive en la barra del panel de coordinación).

**2 · El candado del ➕: por fecha, no por persona.**

```
fecha de la barra == HOY     → el ➕ funciona para todo el equipo, como hoy
fecha de la barra <  HOY     → el ➕ exige sesión de coordinación
```

Es la decisión de Manuel y protege lo que hay que proteger sin quitarle nada al turno:
el kinesiólogo sigue pudiendo anotar la ecografía que olvidó hace dos horas, y nadie
puede tocar el registro de hace tres semanas sin firmar.

🔴 **El candado vive en el SERVIDOR**, en `anexarEventoRapido`, no en si el botón se ve.
Con `AUTH_DEV_MODE=TRUE` cualquiera con el enlace llega al dispatcher: esconder el ➕ no
protegería nada. En el front el botón se muestra igual, y al tocarlo en una fecha pasada
sin sesión, pide la clave — que es más claro que un botón muerto sin explicación.

**3 · El buscador lleva a la ficha corregible.** Hoy `hSrchAbrir` abre el historial del
paciente. Con sesión de coordinación abierta, ese mismo resultado ofrece además
**corregir la ficha** — que es la única vía para un **egresado**, porque un egresado no
está en ninguna grilla de ningún día. Es el caso de la cama 10, el que originó todo.
Y **Enter** en la casilla abre el primer resultado, que es lo que uno espera al escribir
un RUT completo.

**4 · El ➕ crece.** Deja de ser solo «anotar un evento posterior» y pasa a tener dos
zonas:

```
➕ cama 6 — jueves 6 de agosto, turno noche      [🔐 MCC]

ANOTAR LO QUE FALTA          QUITAR LO QUE SOBRA
· Procedimiento (catálogo)   · lista de lo anotado ese turno,
· KTR        (cantidad)        cada uno con su ✕
· KTM        (cantidad+nivel) 
· Evaluación funcional / fuerza
· Cultivo · HME · HEPA · Sonda
· Otro

CORREGIR LA FICHA
· Fecha de ingreso · Inicio de VM · Inicio de vía aérea · datos administrativos
```

La cabecera dice **siempre** qué día y qué turno se está tocando, y con qué firma. El
error más caro de esta pantalla sería creer que se está anotando en hoy.

⚠️ **Aviso obligatorio al tocar KTR/KTM**: esos campos alimentan el **REM 28**. Corregir
un turno de un mes cerrado cambia cifras que quizá ya se enviaron al hospital. La
pantalla tiene que decir **qué mes** se está moviendo, antes de guardar.

### El riesgo que trae mudarse a Registro

🪤 **La cama rotada.** El ➕ identifica al paciente por `ID_CAMA` + `turnoKey`. Si esa
cama cambió de paciente entre el día que se está mirando y hoy, hay que asegurarse de
que el evento se anexe **al episodio que estaba ese día** —el que muestra la vista
retrospectiva— y no al ocupante actual. La ficha del turno lleva `PATIENT_ID`: es él
quien manda, nunca la cama. Sin esto, corregir el pasado le escribe a la persona
equivocada, que es peor que no poder corregir.


## 5 · Los datos

**Disparador:** confirmar en el ➕ del Registro Diario, con la fecha de la barra puesta
en el día que se corrige.

### 🔴 Tres agujeros que hay que cerrar ANTES de ampliar el ➕

El inventario encontró tres cosas que ya están rotas hoy. Con el alcance actual del ➕
el daño es un procedimiento suelto; con KTM y KTR dentro sería una sesión completa en la
ficha de otra persona. **Se cierran primero.**

**1 · La cama rotada puede escribirle al paciente equivocado.**
`anexarEventoRapido` toma el paciente del **ocupante de hoy** (`svc_eventos.gs:197`,
`cama.PATIENT_ID`) pero modifica la fila por la clave **`CAMA_<n>_<turnoKey>`**
(`:217`), que **no incluye el paciente**. Nada compara los dos. El flujo normal lo tapa
por accidente —al dar de alta las evoluciones se archivan y la clave ya no existe— pero
hay tres rutas por las que sí contamina: una cama limpiada a mano (que a propósito no
archiva), una cama re-ocupada con evoluciones ajenas vivas, y **dos pacientes en la
misma cama el mismo turno**, que comparten fila por diseño de la clave.

El modo de fallo es el peor posible: **una fila mixta**. El `PROC_JSON` se modifica en el
paciente A, mientras la fila de `PROCEDIMIENTOS` y el hito nacen con el paciente B.
Ninguna vista queda vacía, así que **el error es invisible**. Se cierra comparando
`cama.PATIENT_ID` con `evo.PATIENT_ID` antes de escribir.

**2 · Hoy no se puede corregir a un paciente ya egresado.** El guard
`if (!cama || !esVerdadero(cama.OCUPADA))` (`svc_eventos.gs:196`) rechaza si la cama está
libre. Pero **darse cuenta después del alta es el caso más frecuente** del subregistro
que describe la historia de este PRD. Hay que permitirlo resolviendo el turno por su
episodio, no por quién ocupa la cama hoy.

**3 · La razón obligatoria de KTM vive solo en el navegador.** Las validaciones de
«indica la razón por la que NO se realizó KTM» están en `guardar()`
(`index.html:6160-6172`), y **el ➕ no pasa por ahí**. Esa regla tiene que subir al
servidor, o la corrección retroactiva la esquiva.

### Qué se puede corregir, campo por campo

| Qué | Columnas reales | Ojo |
|---|---|---|
| **KTR** | `RESP_KTR_CANT` (entero), `RESP_SIN_KTR` (bool) | tres estados distintos, ver abajo |
| **KTM** | trío `KTM_REALIZADA` / `KTM_SUSPENDIDA` / `KTM_NO_REALIZADA`, + `KTM_CANT`, + **`KTM_NIVEL_KTR`** (texto 1-5), + razón obligatoria | 🔴 el nudo, ver abajo |
| **Evaluaciones** | `EVAL_T_MRC`, `EVAL_T_FSS`, `EVAL_T_DINAMO`, `CPAX_TOTAL`, `EVAL_T_PIM/PEM/FEM`, `EVAL_T_GROSOR`, `EVAL_T_HECKMATT`, `EVAL_IMS` | `CPAX_TOTAL` exige sus 10 ítems |
| **Cultivos** | `MUE_REALIZADAS`, `MUE_TIPOS_JSON`, `EX_CULT_RESULTADO`, `MUE_HORA_TOMA` | `RESP_CULT_FECHAS` es del episodio, no del turno |
| **Procedimientos** | `PROC_JSON` / `PROC_RESUMEN` / `PROC_CANTIDAD` + hoja `PROCEDIMIENTOS` + `TIMELINE` | lista blanca de §NO1 |
| **Fechas de ficha** | `FECHA_INGRESO`, `FECHA_INICIO_VM`, `FECHA_INICIO_VA` y datos administrativos | reusa `coordCorregirFicha`, que ya existe y funciona |

### 🔴 El nudo de KTM — y por qué explica el problema de Manuel

`KTM_CANT` y `KTM_NIVEL_KTR` **son independientes y nadie los cruza**. La cantidad se
acota sola a 1-9 cuando la KTM está marcada como realizada; el nivel sale de un chip
aparte y **puede quedar vacío**.

Cuando eso pasa, el turno queda **contado a medias**:

- el **REM lo cuenta** (B.4 suma `KTM_CANT`),
- pero la **grilla del Registro no lo muestra**: la celda exige
  `KTM_REALIZADA && KTM_NIVEL_KTR` para pintar el chip (`index.html:12084`),
- y el **código PTO 1010922** del REM, que se dispara con `KTM_NIVEL_KTR >= 4`, no lo ve.

👉 Es exactamente el «en el papel está el KTM con nivel y en el RCE no» de la historia,
visto desde dentro: no siempre falta la sesión entera — a veces **falta el nivel**, y con
él desaparece de la pantalla aunque el conteo siga sumando. Por eso la corrección de KTM
**mueve el trío completo o no se aplica**: estado + cantidad + nivel + razón.

⚠️ Y hay un estado inconsistente que hoy **nadie limpia**: `KTM_REALIZADA=false` con
`KTM_NIVEL_KTR='3'` sobreviviendo del valor anterior. Al quitar una KTM hay que vaciar
el nivel explícitamente.

### 🪤 Quitar NO es poner cero

`RESP_KTR_CANT` tiene tres estados con significados clínicos distintos: **vacío** (no
registrado), **0** (cero atenciones) y `RESP_SIN_KTR` (sin requerimientos, declarado).
Pero **los consumidores no los distinguen**: el REM hace `parseInt(...) || 0` y el
tablero `if (kt > 0)`.

⇒ **Quitar = vaciar (`''`), nunca poner 0.** Poner 0 inventaría un dato afirmativo que
ningún consumidor puede separar del vacío. Si alguien quiere afirmar «no hubo KTR», eso
se declara marcando `RESP_SIN_KTR`, que es el campo que existe para eso.

Es la lección de `dia_cero.js` aplicada al revés — allá el 0 se perdía por ser *falsy*;
acá el riesgo es fabricar ceros que nadie sabe leer. **El mismo patrón sigue vivo hoy en
dos sitios** y conviene no empeorarlo: la celda de KTR de la Hoja UCI
(`index.html:7676`, `n ? … : ''`) y el texto de la evolución con un MRC de 0
(`dominio_texto.gs:544`, `if (v('EVAL_T_MRC'))`), donde un MRC de 0 —clínicamente válido
en tetraplejia flácida— **desaparece del texto**.

### Quién nota la corrección

| Consumidor | ¿Cambia? | Detalle |
|---|---|---|
| **REM 28** | 🔴 **SÍ, del mes del turno** | B.3 evaluación intermedia (filas 79/85), B.4 sesiones = `Σ RESP_KTR_CANT + Σ KTM_CANT` (90/94), B.6 fisioterapia/ejercicios/educación/respiratoria (98/100/116/120/123), código PTO 1010922 (177) |
| **Tablero, bloque KTM/KTR** | **Sí**, del rango consultado | niveles, % realizada, motivos, sesiones KTR e IMT |
| **Carga kinésica / «atenciones»** | **Sí** | es literalmente B.4 — el número subregistrado |
| **Registro Diario, export CSV, Hoja UCI, gráficos** | **Sí**, al mirar ese día | |
| **Texto de la evolución del turno** | **Sí**, se regenera | |
| **Auditoría de calidad** | ⚠️ ojo | lee `ULT_MRC/ULT_FSS` de la cama; por la vía del ➕ **no** se tocan, que es lo correcto |
| **Indicadores clínicos** | **No** | ni KTR ni KTM ni evaluaciones entran en ningún indicador |
| **Estado actual de la cama** | **No** (O5) | es la diferencia con reabrir y re-guardar |

### 🪤 Por qué NO se reabre la evolución y se re-guarda

Ese camino **ya existe y no tiene candado**: se retrocede la fecha, se abre el panel y se
guarda. Pero `_syncCamaDesdeEvolucion` es incondicional y **pisa `CAMAS_ESTADO` con el
estado de ese turno**: último turno, soporte, vía aérea, fechas de inicio, textos, y
`ULT_MRC_FECHA` / `ULT_FSS_FECHA`. Para «agregar el KTM que faltaba», eso es un efecto
secundario desproporcionado: la tarjeta de la cama retrocede tres semanas.

Por eso la corrección va por el ➕, campo a campo, y **no** por el guardado completo.

## 6 · Pseudo-código — el acuerdo

### Antes de nada: los tres arreglos previos

```
EN anexarEventoRapido, ANTES de escribir nada:
  resolver la evolución del turno pedido
  ¿el paciente de esa evolución es el mismo que el de la cama?
      → si no, RECHAZAR nombrando el choque.
        Nunca escribir una fila mixta: el error sería invisible.
  ¿la cama está libre porque el paciente egresó?
      → NO rechazar: resolver el turno por su EPISODIO.
        Darse cuenta después del alta es el caso más común.
  subir al servidor la regla de la razón obligatoria de KTM
      (hoy vive solo en el navegador y el ➕ no pasa por ahí)
```

### El candado

```
CUANDO llega una corrección desde el ➕
  ¿la fecha del turno es HOY?
      → sí: sigue, con la firma del turno (como hoy, sin fricción)
      → no: EXIGIR sesión de coordinación válida; sin ella, rechazar
             (en el SERVIDOR, no escondiendo el botón)
  ¿existe la evolución de ese turno?      → si no, rechazar: no se inventan turnos
  ¿el paciente calza (arreglo 1)?         → si no, rechazar
```

### Agregar

```
PARA CADA campo pedido
  ¿está en la lista blanca?   → si alguno arrastra estado clínico (NO1),
                                 RECHAZAR LA PETICIÓN ENTERA nombrando cuál y por qué.
                                 Nunca aplicar la mitad.

  si es KTR        → escribir la cantidad. Si se quiere afirmar "no hubo",
                     marcar RESP_SIN_KTR; NO escribir 0.
  si es KTM        → mover el TRÍO COMPLETO: estado + cantidad + nivel + razón.
                     · realizada  ⇒ cantidad ≥ 1 y nivel obligatorio
                     · suspendida ⇒ razón obligatoria
                     · no realizada ⇒ razón obligatoria; y de NOCHE no aplica
                     Nunca dejar nivel sin estado, ni estado sin razón.
  si es evaluación → escribir el total. CPAX solo con sus 10 ítems.
  si es cultivo    → escribir el turno; NO tocar el histórico del episodio.
  si es procedimiento → como hoy: fila + PROC_JSON + hito fechado en SU turno.

  anotar en AUDIT_LOG: firma, turno, campo, antes → después
  acumular el sello en CORRECCIONES_JSON de esa evolución
```

### Quitar (anular con traza)

```
PARA CADA cosa a quitar
  si es un procedimiento → sacarlo de PROC_JSON, borrar su fila y su hito
  si es KTR              → VACIAR (''), nunca poner 0
  si es KTM              → vaciar el trío entero: estado, cantidad Y NIVEL
                            (el nivel huérfano es un estado que hoy nadie limpia)
  si es evaluación       → vaciar el total y sus ítems

  AUDIT_LOG con el valor ANTERIOR, siempre:
      lo que se quita tiene que poder reconstruirse desde la traza
```

### Al terminar, una sola vez

```
regenerar el texto del turno (TEXTO_GENERADO) si cambió algo que lo alimenta
reescribir TIMELINE_JSON de la cama
NO tocar ninguna otra columna de CAMAS_ESTADO
si se tocó KTR, KTM o una evaluación:
    avisar EN PANTALLA qué MES del REM queda afectado
```

**Promesas**

- **Corregir el pasado no cambia el presente de la cama.** Ni soporte, ni vía aérea, ni
  contadores, ni el último turno, ni los textos actuales.
- **Nunca se escribe una fila mixta.** Si el paciente del turno y el de la cama no
  coinciden, se rechaza — no se adivina.
- Si la petición trae algo que arrastra estado clínico, **se rechaza entera**.
- **Quitar vacía, no pone cero.** El sistema conserva la diferencia entre «no registrado»,
  «cero» y «sin requerimientos».
- **KTM se mueve completa o no se mueve**: estado, cantidad, nivel y razón.
- Nada se borra en silencio: todo pasa por `AUDIT_LOG` **con el valor anterior**.
- En el día de hoy, el equipo trabaja **exactamente como hoy**. La fricción aparece solo
  al tocar el pasado.
- Antes de guardar algo que mueve el REM, **la pantalla dice qué mes se está moviendo**.

## 7 · Guardias: las que se van a poner rojas y las que faltan

**Se van a poner rojas, y cada una hay que mirarla, no silenciarla:**

| Guardia | Por qué |
|---|---|
| `eventos.js` · `eventos_ui.js` | son el punto de entrada del ➕, que es lo que se amplía |
| `rem.js` | la de mayor superficie: B.3, B.4, B.6 y el código PTO |
| `tablero.js` | A/B congelado — ningún número del tablero puede cambiar sobre los mismos datos |
| `integridad.js` | fija hoy la semántica de omitir-vs-vaciar del KTR, que este PRD toca |
| `entrega_datos.js` | el hito motor más alto del episodio se deriva del nivel de KTM |
| `columnas.js` | si se leen columnas nuevas en el pipeline |
| `dia_cero.js` | si se introdujeran ceros explícitos |

**No existe hoy ninguna guardia de esto, y hay que escribirla:**

1. Corregir un turno de hace 3 semanas **no mueve** ni una columna de `CAMAS_ESTADO`
   fuera de `TIMELINE_JSON` (A/B del estado completo, antes y después).
2. **La cama rotada se rechaza**: turno cuyo paciente no coincide con el de la cama.
3. **No se puede escribir una fila mixta**: si se rechaza, ni `PROC_JSON` ni
   `PROCEDIMIENTOS` ni `TIMELINE` quedan tocados.
4. **Sin sesión de coordinación, un turno pasado se rechaza en el SERVIDOR** — no por
   esconder el botón.
5. **Con la fecha de hoy, el equipo sigue pudiendo anotar sin clave.**
6. **KTM se mueve completa**: no se puede dejar nivel sin estado, ni «no realizada» sin
   razón — y la regla se verifica en el servidor.
7. **Quitar un KTR lo deja vacío, no en 0**, y `RESP_SIN_KTR` sigue distinguiéndose.
8. **El egresado se puede corregir** (la cama libre ya no bloquea).
9. `AUDIT_LOG` guarda el **valor anterior** de todo lo que se quita.
10. El REM del mes corregido **cambia**, y cambia **solo el de ese mes**.

---

## 8 · Orden de trabajo propuesto

Este PRD es grande. Se entrega por tandas, y **la primera no es una funcionalidad: es
cerrar los agujeros que ya existen**, porque ampliar el ➕ encima de ellos multiplica el
daño.

| Tanda | Qué | Por qué en ese orden |
|---|---|---|
| **1** | Los tres arreglos previos de §5: cama rotada, egresado corregible, razón de KTM en el servidor | hoy el ➕ ya escribe en el pasado sin candado; esto para el daño |
| **2** | Botón de coordinación en la barra + candado del ➕ por fecha + adiós a la pestaña | pone la llave, sin cambiar aún qué se puede corregir |
| **3** | El ➕ crece: KTR, KTM completa, evaluaciones, cultivos — y **quitar** | el pedido de fondo |
| **4** | Corregir fechas desde el ➕ y llegar al egresado por el buscador (Enter) | cierra «todo desde Registro» |

Cada tanda: batería completa verde **y** la guardia nueva vista **fallar** contra el bug
que dice cazar, antes de darla por buena. Es la lección del 20-ago: una guardia verde que
no reproduce la pantalla real solo se mide a sí misma.
