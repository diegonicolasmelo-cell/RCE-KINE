# PRD — Reparar altas: deshacer un egreso y egresar hacia atrás

**Estado:** Borrador · **Dueño:** Manuel Fuentes Blanco · **Creado:** 2026-08-20
**Alcance:** dos operaciones nuevas de coordinación sobre el alta —
**A · deshacer un egreso** mal hecho y **B · egresar con fecha pasada**.
**NO toca:** el alta normal del turno (sigue igual), el ingreso de un paciente nuevo,
ni la corrección de fechas de un egresado, que ya existe y funciona.

---

## 1 · Resumen

**Hoy:** el alta es un camino de una sola dirección. `darAltaPaciente` congela la
fecha de egreso en `hoyISO()` —literal, no se puede pasar otra— y no existe ninguna
función en todo el sistema que devuelva filas del archivo a la hoja viva.

**Después:** coordinación puede devolver a la unidad a quien se egresó por error, con
su historia intacta, y puede egresar con la fecha real a quien se fue hace días y
quedó ocupando cama.

---

## 2 · La historia

### ANTES · Caso A — el alta que no era

Turno de domingo. Se van dos pacientes casi a la vez, uno de la cama 4 y otro de la
6. En el apuro, el alta se da en la cama equivocada: el sistema egresa al de la 6,
que sigue en la unidad, intubado.

En un segundo pasan cuatro cosas irreversibles: sus evoluciones salen de la hoja
viva y se van al archivo, se le escribe una ficha de egreso con la fecha de hoy, se
le estampa un hito de egreso, y su cama queda en blanco — sin soporte, sin vía
aérea, sin diagnóstico, sin las fechas de inicio de su ventilación.

El paciente sigue ahí, ventilado, pero para el RCE ya no existe. El turno lo vuelve
a ingresar como paciente nuevo: pid nuevo, Día 0, contadores en cero. Sus 12 días de
ventilación mecánica se parten en dos episodios y ninguno dice la verdad. En el REM
del mes aparece un egreso que no ocurrió y un ingreso que tampoco.

### ANTES · Caso B — el que se fue y nadie egresó

A un paciente lo trasladan a sala un viernes por la tarde. Nadie lo egresa en el
sistema. La cama sigue ocupada el sábado, el domingo y el lunes.

El lunes alguien lo nota y le da el alta. La fecha de egreso queda **lunes**, porque
`darAltaPaciente` no acepta otra: tres días de estadía que el paciente no estuvo, y
tres días de ventilación que tampoco. Y esos tres días entran al REM.

### DESPUÉS

Magdalena abre la pestaña de coordinación y busca al paciente. La ficha le muestra
que está egresado y le ofrece **↩️ Deshacer el egreso**.

Le pide confirmar en qué cama lo devuelve —la 6 sigue libre, así que propone esa— y
**antes de tocar nada le muestra el simulacro**: 24 evoluciones vuelven del archivo,
la ficha de egreso se borra, el hito se retira, la cama se reocupa. Le avisa, sin
maquillarlo, que **las horas exactas de inicio de la ventilación no están guardadas
en el archivo** y que va a reponerlas a partir de la última evolución, así que los
contadores pueden quedar corridos en algún día.

Confirma. Lo revisa en la ficha. Todo cuadra.

Para el otro caso busca al paciente que sigue ocupando cama, elige **Egresar con
fecha**, pone el viernes, y el sistema recalcula los días con la misma aritmética que
ya usa para corregir fechas. Tres días de más desaparecen del REM.

---

## 3 · Objetivos / No-objetivos

| | |
|---|---|
| **O1** | Deshacer un egreso devuelve **todas** las evoluciones del episodio a la hoja viva, sin perder una columna. |
| **O2** | …reconstruye la fila de la cama con el estado que tenía el paciente al egresar. |
| **O3** | …borra la ficha de `ARCHIVO_PACIENTES` y el hito de egreso, y reescribe el cache del timeline. |
| **O4** | Egresar con fecha pasada escribe esa fecha y **recalcula los días con ella**, no con hoy. |
| **O5** | Las dos operaciones son **SIMULACRO primero**: muestran exactamente qué van a hacer, y no escriben nada hasta que se confirma. |
| **O6** | Las dos exigen sesión de coordinación, firman con la firma clínica real y dejan `AUDIT_LOG`. |
| **O7** | Antes de escribir, `backupDiario()`. Si el respaldo falla, **no se hace nada** (precedente de `_mtoRepararAjenas`). |
| **O8** | Lo que no se puede reconstruir **se dice**, no se inventa (precedente `_avisoVM`). |
| **NO1** | No se puede deshacer un egreso hacia una cama **ocupada**. O va a su cama original si está libre, o el usuario elige una libre. |
| **NO2** | No repara los dos episodios partidos de un alta equivocada que ya se re-ingresó a mano. Eso es fusionar episodios: otro problema, otro PRD. |
| **NO3** | No cambia el alta normal del turno. Sigue siendo `hoyISO()` y sin simulacro: es el 99% de los casos y no debe ganar fricción. |

---

## 4 · Cómo funciona hoy → cómo va a funcionar

### Lo que hace el alta hoy, y qué tan reversible es cada paso

| Paso del alta | ¿Reversible? |
|---|---|
| Inserta ficha en `ARCHIVO_PACIENTES` | **Sí** — y es la fuente para reconstruir la cama antes de borrarla |
| Inserta hito `egreso` en `TIMELINE` + reescribe `TIMELINE_JSON` | **Sí** |
| Archiva las evoluciones (**por `ID_CAMA`**, copia antes de borrar) | **Sí, sin pérdida**: `EVOLUCIONES_ARCHIVO` usa la **misma constante de columnas** que `EVOLUCIONES` |
| Limpia la cama (66 columnas a vacío) | **Parcialmente** — ver abajo |

### 🔴 Lo que no vuelve: cuatro campos

`ARCHIVO_PACIENTES` **no guarda** las fechas de inicio del soporte, y al limpiar la
cama se pierden:

- `FECHA_INICIO_VA` · `FECHA_INICIO_SOPORTE`
- `TS_INICIO_VA` · `TS_INICIO_SOPORTE` (las horas)

El sistema **ya sabe de este agujero** y lo dice en su propio código: *«Los días de VM
del archivo no guardan su fecha de inicio, así que no se pueden re-derivar: se dejan
como están y se dice, en vez de inventar»*.

**Decisión tomada (Manuel, 20-ago-2026):** reponerlas
**restando** los días sellados de la última evolución a su fecha —el mismo truco que
ya usa `anularEvento`— y **avisarlo en pantalla**. Las horas quedan vacías, que en
este sistema significa «contar por días de calendario». Se descartaron las otras dos: pedírselas al
usuario le carga a la coordinación una pregunta clínica que puede no saber
responder, y dejar que los contadores partan de cero pierde días reales de
ventilación — que es lo que pasa hoy y es justamente el problema.

```
HOY                                   DESPUÉS (A · deshacer)

darAltaPaciente                        coordDeshacerEgreso — SIMULACRO
  fechaEgreso = hoyISO()  ← literal      ├ ¿sesión de coordinación?
  archiva por ID_CAMA                    ├ ¿el episodio está en el archivo?
  limpia la cama                         ├ ¿la cama destino está libre?
  ↓                                      └ informa: N evoluciones, qué cama,
UNA SOLA DIRECCIÓN                          qué campos NO se pueden reponer
No existe ninguna función que                    ↓  (el usuario confirma)
devuelva filas del archivo a la        coordDeshacerEgreso — CONFIRMAR
hoja viva. Cero precedentes.             ├ backupDiario()  → si falla, ABORTA
                                         ├ devuelve evoluciones POR PATIENT_ID
                                         ├ reconstruye la cama (molde:
                                         │   _syncCamaDesdeEvolucion)
                                         ├ si la cama es otra → reetiquetar
                                         │   episodio (ID_CAMA e ID_EVOLUCION)
                                         ├ borra ficha del archivo + hito egreso
                                         ├ reescribe TIMELINE_JSON
                                         └ AUDIT_LOG + sello

                                       DESPUÉS (B · egresar hacia atrás)
                                       coordEgresarConFecha — SIMULACRO
                                         ├ ¿hay evoluciones DESPUÉS de esa fecha?
                                         │   → si las hay, BLOQUEA y las lista
                                         ├ recalcula días con diasEntre(ing, egr)
                                         └ informa el antes/después de cada número
                                                 ↓
                                       CONFIRMAR → el alta normal, pero con la
                                       fecha dada y SIN meter el censo en el máximo
```

---

## 5 · Los datos

### Esto ya está roto hoy, y se puede medir

Consultando `ARCHIVO_PACIENTES` (solo columnas sin identidad) aparecen **cuatro
fichas con más días de ventilación que de estadía**, que es clínicamente imposible:

| Cama | Ingreso | Egreso | `DIAS_TOTAL` | `DIAS_VM_TOTAL` |
|---|---|---|---|---|
| 10 | 2026-08-01 | 2026-08-03 | 1 | **2** |
| 10 | 2026-08-04 | 2026-08-04 | 0 | **1** |
| 15 | 2026-08-12 | 2026-08-16 | 4 | **5** |
| 15 | 2026-08-16 | 2026-08-16 | 0 | **1** |

El patrón es sistemático: **VM = estadía + 1**, siempre. Son candidatos directos a
las discrepancias contra la estadística antigua. Este PRD no las arregla —requieren
su propio diagnóstico— pero **explica de dónde puede venir**: la estadía se cuenta
con `diasEntre` (calendario, ingreso = Día 0, regla BUDA) mientras los días de
soporte pueden venir del **censo de la cama**, que cuenta hasta HOY.

### El censo, que es la trampa del Caso B

Al archivar, los días de VM y de vía aérea salen de un **máximo entre el contador
sellado de la última evolución y el contador del censo de la cama**. Ese censo se
calcula **contra la fecha de hoy**. Con un egreso retroactivo, el censo cuenta días
posteriores al egreso e infla el archivo.

**Decisión:** en un egreso con fecha pasada, **el censo sale del máximo** y manda
solo el contador sellado. Hay una guardia (`v42.js`) que hoy asserta justo lo
contrario —«el contador del censo manda si es mayor»— porque cubre el caso del
paciente que **egresa hoy estando ventilado**. Esa guardia **se separa en dos casos**,
no se silencia: censo para el egreso de hoy, sello para el retroactivo.

### Qué se toca

| Hoja | Caso A | Caso B |
|---|---|---|
| `EVOLUCIONES` | recibe de vuelta las del episodio | — |
| `EVOLUCIONES_ARCHIVO` | pierde las del episodio | recibe las del episodio |
| `ARCHIVO_PACIENTES` | se borra la ficha | se inserta con la fecha dada y días recalculados |
| `CAMAS_ESTADO` | se reconstruye la fila | se limpia (igual que hoy) |
| `TIMELINE` | se borra el hito de egreso | hito con la fecha dada |
| `TIMELINE_JSON` | **se reescribe siempre** | idem |
| `AUDIT_LOG` | `COORD_DESHACE_EGRESO` | `COORD_EGRESO_RETRO` |

### Quién nota el cambio

Todo lo que cuelga de `ARCHIVO_PACIENTES` se mueve: **egresos y mortalidad del
rango, REM 28 del mes, `DIAS_TOTAL` promedio del tablero, DAUCI, la pestaña
Archivados y el buscador**.

En cambio los indicadores, el REM por evoluciones, la tabla dinámica y el historial
del paciente **no cambian ni un número** al mover filas entre la hoja viva y el
archivo, porque todos concatenan las dos. ⚠️ Con una excepción a verificar al
implementar: `estadisticasGenerales` declara leer `EVOLUCIONES` sin mencionar el
archivo — si es así, sus conteos **sí** se moverían con el Caso A.

---

## 6 · Pseudo-código — el acuerdo

### A · Deshacer un egreso

```
CUANDO se pide deshacer un egreso (SIMULACRO o CONFIRMAR)

  ¿hay sesión de coordinación?          → si no, rechazar
  ¿el episodio existe en el archivo?    → si no, rechazar
  ¿ya está vivo en alguna cama?         → si sí, rechazar (nada que deshacer)
  elegir cama destino:
      la original, si está libre
      si no, la que eligió el usuario
  ¿la cama destino está OCUPADA?        → rechazar SIEMPRE (nunca pisar a nadie)

  CONTAR sin escribir:
    evoluciones del episodio en el archivo (por PATIENT_ID)
    evoluciones de esa cama SIN PATIENT_ID → NO se devuelven: se INFORMAN
       (lección ya pagada: el pid se regenera al re-ingresar, así que una fila
        sin pid puede ser de cualquiera — lo ambiguo se informa, no se toca)
    qué campos no se pueden reponer (las fechas y horas de inicio de soporte)

  SI ES SIMULACRO → devolver ese informe y NO ESCRIBIR NADA

  SI ES CONFIRMAR:
    backupDiario()                      → si falla, ABORTAR entero
    copiar las evoluciones del episodio a EVOLUCIONES  (copiar ANTES de borrar)
    verificar que llegaron              → si no, ABORTAR sin borrar nada
    borrarlas del archivo
    reconstruir la fila de la cama:
        identidad y fechas ← la ficha del archivo
        estado clínico    ← la última evolución del episodio
        fechas de inicio de soporte ← restando los días sellados, y AVISARLO
        respetar lo que ya venía corregido por coordinación: no pisarlo
    si la cama destino NO es la original → reetiquetar el episodio a la cama nueva
        (ID_CAMA e ID_EVOLUCION, que lleva la cama dentro del identificador)
    borrar la ficha de ARCHIVO_PACIENTES
    borrar el hito de egreso
    reescribir TIMELINE_JSON de la cama
    AUDIT_LOG: quién, qué episodio, a qué cama, cuántas evoluciones
```

### B · Egresar con fecha pasada

```
CUANDO se pide egresar con una fecha

  ¿hay sesión de coordinación?          → si no, rechazar
  ¿la cama está ocupada?                → si no, rechazar
  ¿la fecha es posterior al ingreso?    → si no, rechazar
  ¿la fecha es futura?                  → rechazar
  ¿hay evoluciones con fecha POSTERIOR a la de egreso?
        → BLOQUEAR y listarlas. Son turnos registrados de un paciente que,
          según esa fecha, ya no estaba. O la fecha está mal, o esos turnos
          están mal: lo decide una persona, no el sistema.

  SI ES SIMULACRO → mostrar el antes/después de estadía, días de VM y de vía
                    aérea, y NO ESCRIBIR NADA

  SI ES CONFIRMAR:
    backupDiario()                      → si falla, ABORTAR
    hacer el alta normal, con DOS diferencias:
       la fecha de egreso es la dada, no hoy
       los días de soporte salen SOLO del contador sellado (el censo NO entra)
    estadía = diasEntre(ingreso, fecha dada)   ← misma regla de siempre
    el hito de egreso lleva la fecha dada
    AUDIT_LOG: quién, qué episodio, con qué fecha, y qué días quedaron
```

**Promesas**

- **Nada se escribe sin simulacro previo.** Las dos operaciones muestran primero
  qué van a hacer.
- **Nada se escribe sin respaldo.** Si el respaldo falla, no se toca la base.
- **Se copia antes de borrar, siempre**, y se verifica la copia antes del borrado.
- **Nunca se pisa a un paciente vivo.** Una cama ocupada no recibe a nadie.
- Lo que no se puede reconstruir **se dice en pantalla**; no se inventa un dato.
- Las filas ambiguas (sin identificador de paciente) **se informan y se dejan
  quietas**.
- Todo queda firmado con la firma clínica real y en `AUDIT_LOG`.
- El alta normal del turno **no cambia en nada**.

---

## 7 · Guardias que hay que escribir o actualizar

No existe **ninguna** guardia sobre deshacer ni sobre egreso retroactivo. Y hay seis
que van a ponerse rojas y **cada una hay que mirarla, no silenciarla**:

| Guardia | Por qué se mueve |
|---|---|
| `v42.js` | asserta que el censo manda si es mayor — hay que **separarlo en dos casos** (egreso de hoy vs. retroactivo) |
| `limpiar_archiva.js` | cualquier cambio al archivado o a la limpieza de cama |
| `prono_paciente.js` | asserta que el alta archiva **todas** las filas de la cama, incluso sin identificador |
| `cama_limpia.js` | ningún reloj sobrevive al liberar la cama |
| `integridad.js` | copiar antes de borrar, y no borrar si la copia falla |
| `dias_estadia.js` | la aritmética de días contra la lista oficial del hospital |

Y las nuevas, como mínimo:

1. Deshacer devuelve **exactamente** las mismas filas, con las mismas columnas.
2. Deshacer hacia una cama ocupada **falla siempre**.
3. Las filas sin identificador **no vuelven**, y el informe las nombra.
4. El simulacro **no escribe nada** (A/B de la base entera antes y después).
5. Si el respaldo falla, la base queda intacta.
6. Egreso retroactivo con evoluciones posteriores **se bloquea**.
7. Egreso retroactivo **no** infla los días con el censo.
8. Deshacer y volver a egresar el mismo día deja la ficha **igual que al principio**.
