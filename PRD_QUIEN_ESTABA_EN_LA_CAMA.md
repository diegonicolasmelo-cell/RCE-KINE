# PRD — Corregir quién estaba en la cama

**Estado:** Borrador · **Dueño:** Manuel Fuentes Blanco · **Creado:** 2026-08-20

**Alcance:** desde el modo Coordinación, **cambiar o quitar el paciente asignado a una
cama en un rango de fechas**. La app propone el rango que detecta —«del 1 al 8 de
agosto»— y quien corrige lo confirma o lo ajusta antes de que se escriba nada.

**NO toca:** los procedimientos, KTR, KTM ni las evaluaciones de un turno (eso es
`PRD_PROCEDIMIENTOS_DIAS_PASADOS.md`) · el egreso ni el alta (eso es
`PRD_REPARAR_ALTAS.md`) · los eventos de vía aérea, el prono ni la cadena clínica
hacia adelante.

---

## 1 · Resumen

**Hoy:** si una cama quedó con el paciente equivocado en un tramo de días, no hay
ningún botón que lo arregle. Ni en la app, ni en coordinación. Se corrige a mano en la
planilla o no se corrige.

**Después:** con sesión de coordinación abierta, la cama de un día pasado ofrece
**«corregir quién estaba»**; se elige al paciente correcto —o se declara que ahí no
había nadie—, la app propone el rango de fechas completo, y al confirmar la corrección
queda firmada y auditada.

## 2 · La historia

### ANTES

Manuel cierra el mes y cruza el RCE contra la planilla antigua. En la cama 1, el 1 de
agosto, la planilla dice que estaba una paciente que llevaba **15 días de estadía y 11
de ventilación**. Abre el RCE, retrocede al 1 de agosto, y en esa cama aparece **otra
paciente** — la que la ocupa hoy, ingresada diez días después.

Busca cómo arreglarlo. La ficha deja corregir fechas, el nombre, el diagnóstico. Pero
no hay ningún lugar donde decir *«en esta cama, entre el 1 y el 8 de agosto, no estaba
ella: estaba otra»*. El dato que hay que mover no es un campo de una ficha, es **una
asignación entre una cama, un paciente y un tramo de días**, y esa relación no tiene
pantalla.

Peor: hay una cama donde **dos pacientes figuran a la vez durante 23 turnos seguidos**,
del 1 al 14 de agosto. Físicamente imposible, y nadie puede tocarlo.

### DESPUÉS

Manuel abre la coordinación con su clave y retrocede al 1 de agosto. En la cama 1 toca
**«corregir quién estaba»**.

La app le muestra lo que hoy tiene registrado ese turno y le deja buscar al paciente
correcto por nombre, apellido o RUT — incluidos los egresados, que son la mayoría de
los casos. Elige a la paciente que corresponde.

Antes de escribir nada, la app le dice: *«Según sus evoluciones, esta paciente estuvo
en esta cama del 1 al 8 de agosto. Se van a corregir 13 turnos. ¿Confirmas ese rango?»*
Manuel ajusta el final al 8, confirma, y la pantalla resume qué se movió.

Al mes siguiente el RCE y la planilla dicen lo mismo, y en la ficha queda escrito quién
lo corrigió y cuándo.

## 3 · Objetivos / No-objetivos

| | |
|---|---|
| **O1** | Desde una cama en fecha pasada, con sesión de coordinación, se puede **cambiar** el paciente asignado a esa cama en un **rango de fechas**. |
| **O2** | …y **quitar** la asignación, dejando esos turnos sin paciente: es la forma honesta de decir «esto no era de nadie», sin borrar el registro. |
| **O3** | El rango **lo propone la app** a partir de los turnos que encuentra, y **nadie escribe sin confirmarlo**. El rango propuesto se puede achicar o agrandar. |
| **O4** | Antes de confirmar se ve **cuántos turnos** se van a mover y **de quién a quién** — el conteo es parte del acuerdo, no una sorpresa posterior. |
| **O5** | El candado se verifica **en el servidor**, en la acción, no en si el botón se ve. |
| **O6** | Todo queda en `AUDIT_LOG` con el **valor anterior** de cada turno movido: quién corrigió, cuándo, qué cama, qué rango, qué paciente salió y cuál entró. |
| **O7** | La corrección alcanza las **tres capas** donde vive la asignación: la evolución del turno, la hoja `PROCEDIMIENTOS` y el `TIMELINE` con su cache. |
| **O8** | 🔴 Una cama con **dos pacientes en el mismo turno** se puede desenredar: se elige a cuál de los dos se le corrige el tramo. |
| **NO1** | No recalcula la cadena clínica hacia adelante: días de VM, vía aérea y contadores sellados no se re-derivan solos (ver §5). Se avisa qué quedó por revisar. |
| **NO2** | No inventa un paciente que no existe en el sistema. Solo se asigna a alguien que ya tiene ficha, en cama o archivada. |
| **NO3** | No toca el egreso, el alta ni las fechas de la ficha — eso ya se corrige desde la ficha de coordinación y desde `PRD_REPARAR_ALTAS.md`. |
| **NO4** | No es una papelera: quitar la asignación **no borra** las evoluciones ni lo registrado en ellas. |

### ⚠️ Lo que esto SÍ mueve, y hay que decirlo fuerte

Reasignar turnos de una cama cambia **a quién se le cuentan esas atenciones**. Los días
de estadía, los días de VM, el KTR y el KTM de esos turnos dejan de sumarle a una
persona y pasan a sumarle a otra. Eso mueve el **REM del mes** y los indicadores de ese
tramo.

Es exactamente lo que se busca —hoy están contados en la persona equivocada— pero la
pantalla tiene que **decir qué mes se está moviendo** antes de confirmar, y `AUDIT_LOG`
tiene que dejar la traza para poder explicarlo meses después.

## 4 · Cómo funciona hoy → cómo va a funcionar

### Lo que ya existe y NO hay que construir

| Pieza | Estado | Dónde |
|---|---|---|
| Sesión de coordinación con firma clínica real | ✅ existe | `coordExigirSesion` · `svc_coordinacion.gs` |
| Buscar cualquier paciente por nombre, apellido o RUT, **incluidos egresados** | ✅ existe | `GET_BUSCAR_PACIENTE` · `_coordUbicar` |
| Corregir campos de una ficha con firma y sello a la vista | ✅ existe | `coordCorregirFicha` |
| Guardar el **valor anterior** de cada campo corregido | ✅ existe | `aplicados[]` → `AUDIT_LOG` |
| Re-etiquetar las evoluciones de un episodio a otra cama | ✅ existe (traslado) | `_reetiquetarEpisodioACama` · `svc_camas.gs` |
| Ver quién estaba en una cama un día pasado | ✅ existe | vista retrospectiva + lectura del archivo |
| Navegar por fecha con `◀ ▶` | ✅ existe | `cambiarDia(±1)` |

Casi toda la plomería está. **Lo que no existe es la operación por rango de fechas**: hoy
todo se corrige por episodio completo (el traslado) o por campo suelto (la ficha).

```
HOY                                    DESPUÉS

cama del 1 de agosto                   cama del 1 de agosto
   │                                      │
   ├ se ve quién estaba                   ├ se ve quién estaba
   └ ⛔ no hay forma de corregirlo        └ «corregir quién estaba»  [🔐 sesión]
                                             │
traslado (_reetiquetarEpisodioACama)         ├ buscar al paciente correcto
   └ mueve el episodio ENTERO,               │    (o «aquí no había nadie»)
     y solo de un paciente vivo              │
                                             ├ la app PROPONE el rango
ficha de coordinación                        │    «del 1 al 8 · 13 turnos»
   └ corrige campos, no asignaciones         │    …y se puede ajustar
                                             │
                                             ├ resumen: de quién → a quién,
                                             │    cuántos turnos, qué mes mueve
                                             └ confirmar → COORD_REASIGNAR_CAMA
                                                   ├ las TRES capas
                                                   ├ AUDIT_LOG con el valor anterior
                                                   └ avisa qué quedó por revisar
```

## 5 · Los datos

**Disparador:** confirmar el diálogo «corregir quién estaba», con la cama y el rango ya
a la vista.

### 🔴 Lo que hay que saber antes de diseñar nada

**1 · La clave de una evolución NO incluye al paciente, y ya hay filas repetidas.**
`ID_EVOLUCION` vale `CAMA_<n>_<fecha>-<turno>`. Medido en la planilla real el
20-ago-2026: **38 turnos tienen dos filas con la MISMA clave y dos pacientes
distintos** — `CAMA_1_2026-08-06-Noche` existe dos veces. Consecuencia directa:
`repoBuscarPorId` devuelve **la primera y esconde la otra**, así que cualquier
corrección que identifique la fila solo por `ID_EVOLUCION` le va a escribir al paciente
equivocado, que es justo el error que se quiere arreglar.

⇒ **La fila se identifica por `ID_EVOLUCION` + `PATIENT_ID`, siempre.** Y donde haya dos,
la pantalla los muestra a los dos y pregunta cuál (O8).

**2 · La asignación vive en tres capas, no en una.** Cambiar solo la evolución deja la
hoja `PROCEDIMIENTOS` y el `TIMELINE` apuntando al paciente anterior — el mismo modo de
fallo que documenta `PRD_PROCEDIMIENTOS_DIAS_PASADOS.md` §5: una **fila mixta**, que no
deja ninguna vista vacía y por eso es invisible.

**3 · Los contadores del turno vienen sellados por el servidor.** `DIA_ESTADIA`,
`DIAS_VM` y `DIAS_VA` se calcularon para el paciente que estaba. Al reasignar el turno a
otra persona esos números **dejan de corresponder**, y re-derivarlos exige recorrer toda
la cadena del episodio nuevo (NO1). Se dejan como están y **se avisa en pantalla cuáles
quedaron por revisar**, con el enlace a la ficha donde se corrigen. Inventar un número
sellado sería peor que dejarlo visible y marcado.

### Qué se toca, capa por capa

| Capa | Hoja | Qué cambia | Ojo |
|---|---|---|---|
| Evolución del turno | `EVOLUCIONES` y `EVOLUCIONES_ARCHIVO` | `PATIENT_ID`, `COD_PACIENTE`, `PAC_NOMBRE`, `PAC_EDAD`, `PAC_SEXO`, `PAC_DIAGNOSTICO` | la fila puede estar **en cualquiera de las dos hojas** — hay que buscar en ambas |
| Procedimientos | `PROCEDIMIENTOS` | `PATIENT_ID` de las filas de ese turno y esa cama | |
| Riel de hitos | `TIMELINE` + su cache | `PATIENT_ID` de los hitos de esos turnos | el cache es lo que se olvida |
| Auditoría | `AUDIT_LOG` | una entrada por corrección, con el detalle de los turnos | con el **valor anterior** (O6) |

**Lo que NO se toca:** `CAMAS_ESTADO` (el estado de hoy no se mueve por corregir el
pasado), `ARCHIVO_PACIENTES` (las fichas se corrigen desde la ficha) y los contadores
sellados (NO1).

### Quitar la asignación

Quitar **no borra**: deja la evolución con su `PATIENT_ID` vacío y marcada como turno
sin paciente asignado. El registro de lo que se hizo ese turno se conserva; lo que se
retira es la afirmación de a quién se le hizo. Es el mismo criterio de
`PRD_PROCEDIMIENTOS_DIAS_PASADOS.md`: **vaciar, nunca poner un valor que nadie sabe
leer**.

## 6 · Pseudo-código — el acuerdo

### El candado

```
EN toda acción de reasignación, ANTES de tocar nada:
  ¿viene token de coordinación y está vigente?  → si no, rechazar en el SERVIDOR
  ¿la fecha del rango es anterior a hoy?        → si es hoy, esto no aplica:
                                                   el turno de hoy se corrige registrando
  guardar la firma clínica real de quien corrige
```

### Proponer el rango (antes de escribir nada)

```
CUANDO se pide corregir la cama C del día D
  buscar en EVOLUCIONES y EVOLUCIONES_ARCHIVO los turnos de la cama C
  agrupar por PATIENT_ID
  SI hay más de un paciente en ese turno
      → mostrarlos TODOS y preguntar a cuál se le corrige el tramo   (O8)
  para el paciente elegido:
      rango propuesto = primer turno suyo en esa cama → último turno suyo en esa cama
  mostrar: de quién → a quién · cuántos turnos · qué mes se mueve
  ⛔ no se escribe nada hasta que se confirme el rango                 (O3)
```

### Aplicar

```
CUANDO se confirma
  resolver la lista exacta de turnos: cama C, fechas dentro del rango confirmado,
      identificados por ID_EVOLUCION + PATIENT_ID                     (§5.1)
  ¿algún turno de esa lista ya no existe o cambió desde que se propuso?
      → abortar entero y volver a proponer: nada a medias
  para cada turno de la lista:
      anotar el valor ANTERIOR (paciente, código, nombre)
      escribir el paciente nuevo —o vaciarlo, si es «quitar»— en las TRES capas
  escribir UNA entrada en AUDIT_LOG con: cama, rango, turnos movidos,
      paciente que salió, paciente que entró, firma, momento
  devolver el resumen y la lista de contadores que quedaron por revisar (NO1)
```

**Promesas:**

- Nada se escribe sin que el rango se haya confirmado a la vista.
- O se mueven todos los turnos del rango, o no se mueve ninguno.
- Ninguna fila se identifica solo por `ID_EVOLUCION`.
- El estado de hoy de la cama no se altera nunca.
- Quitar vacía, no borra: el registro del turno se conserva.
- Todo lo que se movió se puede reconstruir desde `AUDIT_LOG`.

## 7 · Guardias

**Se van a poner rojas, y cada una hay que mirarla:**
`retro_camas.js` · `dia_de_egresado.js` · `dia_de_egresado_ui.js` · `coordinacion.js` ·
`mover_camas.js` · `limpiar_archiva.js` · `rem.js` · `tablero.js`.

**No existe hoy ninguna guardia de esto, y hay que escribirla:**

1. Sin sesión de coordinación, una reasignación se rechaza **en el servidor**.
2. El rango propuesto sale de los turnos reales del paciente, no de la fecha mirada.
3. **Nada se escribe hasta confirmar**: pedir la propuesta no deja rastro.
4. Con **dos pacientes en el mismo turno y el mismo `ID_EVOLUCION`**, se corrige al
   elegido y **el otro no se toca** — la trampa de §5.1, reproducida con dos filas de
   clave repetida.
5. Reasignar mueve las **tres capas**; ninguna queda apuntando al paciente anterior.
6. Si un turno del rango cambió entre la propuesta y la confirmación, **no se aplica
   nada** (ni siquiera los turnos sanos).
7. `AUDIT_LOG` guarda el **valor anterior** de cada turno movido.
8. Corregir el pasado **no mueve una sola columna** de `CAMAS_ESTADO`.
9. **Quitar** deja el turno sin paciente pero con su registro intacto.
10. El REM del mes corregido cambia, y **solo el de ese mes**.

Cada tanda: batería completa verde **y** la guardia nueva vista **fallar** contra el bug
que dice cazar, antes de darla por buena.

## 8 · Orden de trabajo propuesto

| Tanda | Qué | Por qué en ese orden |
|---|---|---|
| **1** | Identificar filas por `ID_EVOLUCION` + `PATIENT_ID` en las rutas que hoy usan solo el ID | es el agujero que haría escribirle al paciente equivocado; se cierra antes de ampliar nada |
| **2** | Proponer el rango y mostrarlo, **sin escribir** | pone a la vista lo que hoy no se puede ni mirar, sin riesgo |
| **3** | Aplicar la reasignación en las tres capas, con auditoría | el pedido de fondo |
| **4** | Quitar la asignación, y el aviso de contadores por revisar | cierra el caso «aquí no había nadie» |

---

### Antes de implementar

Esto es funcionalidad nueva sobre datos clínicos y **el producto lo decide Diego**. El
caso que lo motiva está medido y es concreto: 38 turnos con dos pacientes a la vez, una
cama con 23 turnos solapados, y ninguna forma de corregirlo desde la app.
