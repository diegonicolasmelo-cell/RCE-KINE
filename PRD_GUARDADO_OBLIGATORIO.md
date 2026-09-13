# PRD — Que no quede ninguna evolución sin guardar

**Estado:** Aprobado por Manuel 2026-09-13 — listo para implementar · **Dueño:** Manuel Fuentes Blanco · **Creado:** 2026-09-13
**Actualizado:** 2026-09-13, con las ocho decisiones de Manuel incorporadas (§9). **Sin preguntas abiertas.**

**Alcance:** el panel del paciente (`#sp`) y su ciclo abrir → escribir → guardar → cerrar.
Se **elimina el minimizar**, el cierre pasa por un **diálogo propio de tres acciones** cuya
tercera salida **conserva un borrador local** en vez de descartar, el guardado **se confirma
con hora sin tapar el formulario** y **el fallo de guardado se avisa clara y visiblemente
con opción de reintentar**, y aparece un **pop-up modal de fin de turno** (30 min antes de
la **hora de salida real**, configurable) que nombra las camas del turno sin evolución
guardada. Se reutiliza
`_avisosTransicion()` para ofrecer registrar el evento de vía aérea que se olvidó anotar,
con su hora real, en TIMELINE.

**NO toca:** los procedimientos, KTR, KTM, cultivos y evaluaciones de días pasados — eso es
`PRD_PROCEDIMIENTOS_DIAS_PASADOS.md` y no se reescribe aquí. Tampoco la franja
`⚠️ Sin guardar` ni el recordatorio de los 10 minutos, que quedan **tal como Diego los
validó**. Tampoco cambia el cálculo de indicadores, ni la definición de turno, ni el modo
Coordinación, ni el defecto abierto de los GCS con valor por defecto.

---

## 1 · Resumen

**Hoy:** el panel tiene un botón `−` que minimiza. Minimizar **esquiva la confirmación de
cierre** (v2/index.html:5322), se lleva el borrador a un array en memoria
(`_minStack`, v2/index.html:5206) y pinta una pastilla abajo a la izquierda
(`_renderMinTray`, v2/index.html:5208). El kinesiólogo cree que "lo dejó abierto", nunca
vuelve, y cuando se cierra el navegador el borrador se pierde: no hay persistencia en disco
ni en servidor (hallazgo §2). Al guardar bien sí hay confirmación, pero es **transitoria**:
`toast('✅ Evolución guardada correctamente')` (v2/index.html:6748) que dura 3,2 segundos y
**no dice a qué hora** — decisión tomada con Diego y vigente (BITACORA.md:3552-3557).

**Después:** el panel solo se puede **cerrar**, y cerrar con cambios abre un diálogo de tres
acciones donde la opción cómoda es guardar y **ninguna de las tres pierde lo escrito**: la
tercera deja un **borrador local** por cama y turno que vuelve solo al reabrir. La
confirmación de guardado deja de ser solo un destello: la franja del botón 💾 queda en
`✓ Guardado hh:mm`, a la vista, sin tapar nada — y si el guardado **falla**, la misma franja
queda en `❌ NO se guardó · Reintentar` hasta que se resuelva. Y media hora antes de la **hora en que
el equipo se va** —20:00 en el turno día, 08:00 en el noche; configurable—, un **pop-up
modal** interrumpe una sola vez con la lista de camas que se van a quedar sin evolución.

## 2 · La historia

### ANTES

Turno de noche, 03:10. Diego abre la cama 6, escribe la evolución completa —el paciente
se extubó a las 01:40 y hay que dejarlo escrito— y en ese momento suena el monitor de la
cama 11. Toca el `−` para no perder lo escrito. Aparece la pastilla abajo a la izquierda.

Atiende la 11, después ingresan un paciente nuevo, después la entrega de turno. A las 08:00
apaga el equipo y se va. La pastilla estaba ahí todo el rato y nadie la miró; el `beforeunload`
(v2/index.html:5350-5355) alcanza a avisar solo si el navegador se cierra ordenadamente, y
en un equipo que se apaga a la fuerza no alcanza a nada.

A la mañana siguiente la cama 6 aparece **sin evolución del turno de noche**. La extubación
de las 01:40 no existe en ninguna parte: no está en EVOLUCIONES, no está en TIMELINE, y el
día de VM de ese paciente queda contado de más. Diego se acuerda de haberla escrito. Nadie
puede recuperar lo que escribió.

### DESPUÉS

Mismo turno, 03:10. Diego abre la cama 6, escribe, suena la 11. **No hay botón de
minimizar**: toca la ✕. La app le muestra un diálogo con tres salidas y la primera es
**«Guardar y cerrar»**. La toca: la franja del botón 💾 se pone `✓ Guardado 03:11`, el panel
se cierra, y antes de cerrarse le dice que el paciente venía con TOT y quedó sin vía aérea
sin extubación registrada, y le ofrece anotarla —él escribe 01:40 y queda en TIMELINE con su
hora real.

Al rato pasa lo contrario: escribe la cama 11 y al guardar se cae la red. El toast ❌ avisa,
y **la franja se queda en rojo**: `❌ NO se guardó · Reintentar`. Diego lo ve cinco minutos
después, cuando vuelve, aprieta `Reintentar` y ahí sí queda. Lo escrito nunca se movió.

A las 07:30, media hora antes de irse, un **pop-up modal** ocupa la
pantalla una sola vez: **«Faltan 30 minutos para tu salida. Sin evolución guardada:
cama 11, cama 14 (de alta 04:20).»** Con un botón `Abrir` por cama y `Ya lo vi` al pie.
Diego abre la 11 —donde lo esperaba su borrador de las 03:10, tal como lo dejó—, la
completa, guarda, y se va.

## 3 · Objetivos / No-objetivos

| | |
|---|---|
| **O1** | **Minimizar deja de existir**: se elimina el botón, `_minStack`, `minimizarPanel()`, `restaurarDesdeMin()`, `_renderMinTray()`, la bandeja `#minTray` y su CSS. No queda ninguna vía de salir del panel que esquive la guardia de cambios sin guardar. |
| **O2** | Cerrar con cambios sin guardar abre un **diálogo modal propio** (no `confirm()` nativo) con tres acciones nombradas, donde guardar es la acción por defecto. **Ninguna de las tres pierde lo escrito** (ver O7). |
| **O3** | La confirmación de guardado deja de ser solo **transitoria**. Hoy el toast de éxito existe (v2/index.html:6748), dura 3,2 s y no lleva hora; se agrega una marca **persistente y con hora** —`✓ Guardado hh:mm`— que sigue a la vista mientras el panel esté abierto y **no tapa ningún campo**. |
| **O3b** | 🔴 **El guardado que FALLA se ve.** Ante error de red, excepción del backend o timeout de `google.script.run`, la franja del botón 💾 pasa a un **estado de error persistente** —`❌ NO se guardó · Reintentar`— con botón de reintento, `_formDirty` **sigue en `true`** y los datos del formulario no se tocan. Requisito explícito de Manuel (13-sep). |
| **O4** | **A los `AVISO_FIN_TURNO_MIN` minutos (default 30) antes de la HORA DE SALIDA del turno activo** —`SALIDA_TURNO_DIA` 20:00 / `SALIDA_TURNO_NOCHE` 08:00, que **no** es el cambio de turno de la app—, un **pop-up modal** —no un toast— lista las camas del turno **sin evolución guardada** y, si hay un panel abierto con cambios, lo nombra primero. Una sola vez por turno y por dispositivo. |
| **O7** | 🔴 **Cerrar dentro del mismo turno no pierde nada.** La tercera acción del modal es **«Cerrar y conservar borrador»**: el estado completo del formulario (texto, KTR, KTM, procedimientos, selects) queda en un borrador local con llave `CAMA_<idCama>_<turnoKey>`, y al reabrir esa cama **en el mismo turno** se restaura solo, con una franja `Borrador sin guardar recuperado hh:mm`. Decisión de Manuel (13-sep): *«si se llegase a cerrar dentro del mismo turno sin guardar, las KTR o todo lo evolucionado debe mantenerse sin cambios hasta donde quedó dejado el clínico»*. |
| **O5** | Cuando el sistema detecta que **se olvidó anotar un cambio de vía aérea o de soporte**, ofrece registrar el evento faltante con su **fecha y hora reales** en TIMELINE, sin que una hora inventada mueva un indicador. |
| **O6** | El aviso de fin de turno respeta la privacidad: **cama + identificador interno o iniciales**, nunca nombre completo ni RUT, ni en pantalla ni en consola ni en AUDIT_LOG. |
| **NO1** | 🔴 **No se cambia la franja `⚠️ Sin guardar` ni el recordatorio de los 10 minutos.** Son regla vigente acordada con Diego (BITACORA.md:2040-2051) y su guardia `build/checks/sin_guardar.js` tiene que seguir verde. El aviso de fin de turno es una pieza **nueva y distinta**, no un reemplazo. |
| **NO2** | 🔄 **Revisado el 13-sep por decisión de Manuel (O7).** El borrador local **sí entra** en alcance, porque sin él «cerrar» pierde las KTR y lo evolucionado. Lo que **sigue fuera** es el **autoguardado al servidor**: el borrador vive solo en el navegador, no escribe en EVOLUCIONES, no cuenta como evolución del turno y **no saca la cama de la lista del aviso de fin de turno**. Una cama con borrador sigue siendo una cama pendiente. |
| **NO3** | No corrige procedimientos, KTR, KTM, cultivos ni evaluaciones de días pasados — `PRD_PROCEDIMIENTOS_DIAS_PASADOS.md`. Aquí el único evento retroactivo permitido es el de **vía aérea / soporte del episodio abierto**, y solo dentro del turno que se está guardando. |
| **NO4** | No toca el defecto de los selects GCS con valor por defecto «normal» (memoria `rce-orden-bloque-neuro-evolucion.md`). Queda anotado porque es el mismo género de problema —registro que parece hecho y no lo está— pero es otro PRD. |
| **NO5** | No hay notificación push ni recordatorio servidor: Apps Script no puede empujar nada al navegador. El temporizador vive **en el cliente**; si nadie tiene la app abierta a esa hora, el aviso **no ocurre en ese turno** y se recupera al inicio del turno siguiente reusando `_avisoGapTurnos()` (decisión 5 de §9). |

### ⚠️ Lo que este PRD SÍ quita, y hay que decirlo fuerte

**Minimizar hoy tiene un uso legítimo:** dejar la evolución a medio escribir para atender
otra cosa, sin perderla. Quitarlo sin más obligaría a Diego a elegir entre guardar una
evolución incompleta o descartar lo escrito.

Por eso O1 solo es aceptable junto a O2 **y O7**: la salida de emergencia deja de ser «lo
escondo» y pasa a ser una de dos cosas, ninguna de las cuales pierde trabajo:

1. **«lo guardo incompleto y lo sigo después»** — una evolución guardada a medias **sí
   existe** en EVOLUCIONES, se puede reabrir y editar en el mismo turno, y no desaparece
   cuando se apaga el equipo. Hay que decirlo en el diálogo con esas palabras: guardar ahora
   no cierra nada.
2. **«lo cierro y el borrador me espera»** (O7) — lo escrito queda en el navegador con la
   llave de esa cama y ese turno, y vuelve solo al reabrirla.

Lo que desaparece del diseño anterior es la salida **destructiva**: ya no hay «Cerrar sin
guardar», y por lo tanto **tampoco hace falta la doble confirmación** que ese camino exigía.
Manuel lo justifica además desde el formato de la ficha, que ya evoluciona mostrando
**«cambios vs. sin cambios respecto al turno anterior»**: con el borrador de vuelta, el
clínico retoma donde quedó y el formulario le sigue diciendo qué cambió, así que no hay
escenario en que convenga tirar lo escrito a la basura.

## 4 · Cómo funciona hoy → cómo va a funcionar

### Lo que se encontró antes de diseñar (inventario de consumidores)

Inventario obligatorio de **todo lo que toca el minimizar**, porque borrarlo a medias deja
un `beforeunload` mintiendo o un panel que no se puede reabrir:

| # | Consumidor | Dónde | Qué hay que hacer |
|---|---|---|---|
| 1 | CSS de la bandeja `#minTray` | v2/index.html:937 | eliminar |
| 2 | CSS `.min-pill` (+ `:hover`, `::before`) | v2/index.html:938-940 | eliminar |
| 3 | Contenedor `<div id="minTray">` | v2/index.html:2458 | eliminar |
| 4 | Botón `−` con `onclick="minimizarPanel()"` | v2/index.html:2496 | eliminar (queda solo ✕) |
| 5 | Rehidratación del borrador al reabrir la cama | v2/index.html:5044-5047 | eliminar el bloque; `abrirPanel` deja de buscar en `_minStack` |
| 6 | Declaración `const _minStack = []` | v2/index.html:5206 | eliminar |
| 7 | `_renderMinTray()` | v2/index.html:5208-5212 | eliminar |
| 8 | `minimizarPanel()` | v2/index.html:5295-5310 | eliminar |
| 9 | `restaurarDesdeMin(i)` | v2/index.html:5313-5317 | eliminar (es global, la llamaba el `onclick` de la pastilla) |
| 10 | Limpieza del stack dentro de `cerrarPanel` | v2/index.html:5345-5346 | eliminar |
| 11 | `beforeunload`: condición `|| _minStack.length` | v2/index.html:5351 | **reescribir**: queda solo `_formDirty && panel abierto` |
| 12 | Texto del `uiConfirm` de cierre: «…usa − Minimizar: el borrador se conserva» | v2/index.html:5330 (bloque `uiConfirm` 5326-5332) | **reescribir**: ese consejo deja de existir |
| 13 | `_snapPanel()` — toma la foto del panel; hoy la llama **solo** `minimizarPanel` (desde v2/index.html:5304) | v2/index.html:5224-5246 | eliminar: queda huérfana |
| 14 | `_restaurarMin(m)` — reconstruye el panel completo desde el snapshot (innerHTML, valores de campo, ~20 variables de estado, turno, scroll). Es el cuerpo más grande del mecanismo | v2/index.html:5247-5286 (40 líneas) | eliminar |
| 15 | Cuatro **comentarios** que describen el minimizar y quedarían documentando algo inexistente | v2/index.html:6114, 6266, 8458, 11580 | reescribir o borrar junto con el código. Ninguno obliga a tocar código funcional, pero si no se limpian queda documentación que miente |
| 16 | `.gs` y guardias | grep en `v2/*.gs` y `build/checks/*.js` | **cero coincidencias de `minimizar`/`minTray`/`_restaurarMin`**: el servidor no sabe nada del minimizar y ninguna guardia lo cubre |

Dos consecuencias de diseño que salen de este inventario:

**a.** El minimizar es **puramente cliente y no toca el servidor** — sacarlo no puede
romper un dato ya escrito. El riesgo es de UX, no de integridad.

**b.** Hoy **ninguna guardia** vigila el minimizar. Quitarlo sin escribir la guardia de §7
significa que vuelve solo la próxima vez que alguien reponga un botón «para no perder lo
escrito». Por eso la guardia 1 de §7 es la que cierra la puerta.

```
HOY                                          DESPUÉS

panel abierto (#sp.on)                       panel abierto (#sp.on)
  ├ [−] minimizar ──────────┐                  ├ (no existe)
  │    · NO pregunta nada   │
  │    · _snapPanel → _minStack
  │    · pastilla en #minTray                  │
  │    · el borrador vive en RAM               │
  │      y muere con la pestaña                │
  │                                            │
  ├ [✕] cerrarPanel(force)                     ├ [✕] cerrarPanel(force)
  │    · si _formDirty → uiConfirm             │    · si _formDirty → MODAL DE 3
  │      «…usa − Minimizar»                    │      1 Guardar y cerrar  (defecto)
  │      → Cerrar y descartar                  │      2 Seguir editando
  │                                            │      3 Cerrar y CONSERVAR borrador
  │                                            │        (sin doble confirmación:
  │                                            │         no se pierde nada)
  │                                            │
  └ [💾] guardar()                             └ [💾] guardar()
       · error → toast ❌ 3,2 s                     · error → toast ❌ (igual) Y ADEMÁS
                (_falloFinal, index.html:6772)         franja 💾 en ERROR persistente:
                + _formDirty sigue true                «❌ NO se guardó · Reintentar»
                  (nada visible después)               + _formDirty sigue true
       · OK   → toast ✅ 3,2 s, sin hora            · OK → toast ✅ (igual) Y ADEMÁS
                (index.html:6748)                         franja 💾 persistente:
                + _formDirty=false                        «✓ Guardado hh:mm»
                                                       + borrador local descartado
                                                       + si venía de «Guardar y cerrar»,
                                                         cierra el panel
                                                       + _avisosTransicion() ofrece
                                                         anotar el evento faltante

franja ⚠️ Sin guardar + aviso 10 min          IGUAL, sin cambios (NO1)
(_tickSinGuardar, index.html:5367)

(no existe)                                   borrador local por CAMA_<id>_<turnoKey>
                                                 └ se restaura solo al reabrir esa cama
                                                    en el MISMO turno, con franja
                                                    «Borrador sin guardar recuperado hh:mm»

(no existe)                                   hora de SALIDA − AVISO_FIN_TURNO_MIN (30)
                                              (20:00/08:00 de CONFIG, NO el cambio
                                               de turno de la app)
                                                 └ POP-UP MODAL, una vez por
                                                    turno/dispositivo
                                                    lista de camas sin evolución
                                                    + [Abrir] por cama + [Ya lo vi]
```

## 5 · Los datos

### Qué dispara cada pieza

| Pieza | Evento disparador | De dónde sale el dato |
|---|---|---|
| Modal de cierre | clic en ✕ con `_formDirty === true` | `_formDirty` (v2/index.html:10809) |
| Confirmación de guardado | `guardar()` termina OK (donde hoy se hace `_formDirty=false`, v2/index.html:6767) | hora local del cliente |
| Aviso de guardado FALLIDO | `_falloFinal(m)` (v2/index.html:6772), tras el reintento automático a los 3 s | el mensaje de error que ya recibe `_falloFinal` |
| Borrador local | al cerrar conservando, y al reabrir la cama | `localStorage`, llave `CAMA_<idCama>_<turnoKey>` |
| Aviso de fin de turno | temporizador de cliente: `hora_de_salida − AVISO_FIN_TURNO_MIN` | 🔴 **NO sale de `_horasTurno()`**: sale de `CFG.SALIDA_TURNO_DIA` / `CFG.SALIDA_TURNO_NOCHE`. `_horasTurno()` (v2/index.html:4577) se sigue usando solo para saber **qué turno** está activo |
| Lista de camas pendientes | al armar el aviso | censo de camas ocupadas + `EVOS_DIA` / la categoría `huecos: 'Turnos sin evolución'` de `GET_AUDITORIA` |
| Evento olvidado | `guardar()` OK, y además al abrir el paciente | `_avisosTransicion()` (v2/index.html:6069), ya llamada en 6411 |

### Cómo se sabe que una cama «no está evolucionada»

Ya existe la llave y no hay que inventarla: `idEvolucion = 'CAMA_' + idCama + '_' + turnoKey`,
con `turnoKey = FECHA-TURNO` (hallazgo §5). Una cama está **pendiente** si está ocupada en el
censo del turno activo y **no** hay fila en EVOLUCIONES con esa llave.

Dos fuentes posibles para la misma pregunta, y hay que elegir una sola:

- **`EVOS_DIA`** — cache que ya vive en el front. Barata, sin viaje al servidor, pero puede
  estar vieja si otro kinesiólogo guardó desde otro equipo.
- **`GET_AUDITORIA`** categoría `huecos: 'Turnos sin evolución'` (v2/index.html:14174-14195) —
  autoritativa, pero es una llamada pensada para una pestaña on-demand, no para un timer.

**Decidido:** el aviso hace **una** llamada fresca al servidor en el momento de dispararse
(una sola vez por turno, el costo es despreciable) y usa `EVOS_DIA` solo para pintar de
inmediato mientras llega la respuesta. Si la llamada falla, el aviso se muestra igual con el
cache y lo dice: «lista según el último refresco».

**Camas con alta en el mismo turno: se incluyen, marcadas** (decisión 6 de §9). Si el
paciente estuvo en la cama durante el turno, la atención debería estar registrada; la fila
aparece como `Cama N (de alta en el día)` para que se vea de inmediato por qué está ahí y el
clínico decida al ojo si corresponde evolucionar.

> 🪤 **Decía «(de alta hh:mm)» y no se puede.** `ARCHIVO_PACIENTES` guarda `FECHA_EGRESO`,
> no la hora. Inventar una hora en una fila que el kinesiólogo lee a las 19:30 es
> exactamente lo que este PRD existe para evitar, así que la marca dice **«de alta en el
> día»** y el modal agrega al pie que el registro no guarda la hora del egreso. Corregido
> el 13-sep-2026 tras implementar la tanda 3; ver la nota de §9.

**Una cama con borrador local NO deja de estar pendiente** (NO2): el borrador vive en el
navegador y el servidor no sabe de él. Si la cama tiene borrador, la fila lo dice —
`Cama N · borrador sin guardar` — porque es la que más urge.

### Campo por campo — lo nuevo en CONFIG

| Clave | Tipo | Default | Qué controla |
|---|---|---|---|
| `SALIDA_TURNO_DIA` | hora `HH:MM` | `20:00` | **Hora real en que se va el equipo del turno día** (decisión 8 de §9). Independiente de `TURNO_DIA_INICIO` |
| `SALIDA_TURNO_NOCHE` | hora `HH:MM` | `08:00` | Lo mismo para el turno noche. Independiente de `TURNO_NOCHE_INICIO` |
| `AVISO_FIN_TURNO_MIN` | entero, minutos | `30` | **Decidido (§9.1 y §9.8): configurable, default 30** → el pop-up sale a las **19:30** y a las **07:30**. Manuel pidió el rango 19:30-19:45 («el horario en el que los últimos están escribiendo»); se toma el borde temprano para dejar margen de escritura. En 0 o vacío → **apagado** (interruptor de emergencia sin tocar código ni publicar versión) |
| `AVISO_FIN_TURNO_REPETIR` | booleano | `FALSE` | si vuelve a saltar al llegar la hora de fin de turno cuando siguen quedando camas pendientes. Nace apagado: la recuperación del caso «nadie tenía la app abierta» ya la cubre el aviso al inicio del turno siguiente (§9.5) |

`SIN_GUARDAR_AVISO_MS` (v2/index.html:5366, 10 min) **no se toca**: es otra cosa y ya está
acordada.

### Candado anti-duplicado del aviso

Una marca por **turno y dispositivo**, del tipo `avisoFinTurno:<turnoKey>`, guardada en
`sessionStorage`. Elección deliberada:

- `sessionStorage` y no `localStorage`: si el equipo se reinicia a mitad de turno, el aviso
  **vuelve a poder salir** — que es lo que uno quiere, porque el reinicio probablemente se
  llevó un borrador.
- Por dispositivo y no por usuario: no hay sesión de usuario fiable en el front
  (`AUTH_DEV_MODE`), y el aviso es inocuo de mostrar de más.

### 🪤 El cambio de turno de la app NO es la hora de salida del kinesiólogo

Es la trampa que este PRD estuvo a punto de programar mal, y por eso queda escrita.

| | Cambio de turno de la app | Hora de salida del equipo |
|---|---|---|
| **Dónde vive** | `CFG.TURNO_DIA_INICIO` (9) / `TURNO_NOCHE_INICIO` (21), v2/index.html:4579 | `CFG.SALIDA_TURNO_DIA` (20:00) / `SALIDA_TURNO_NOCHE` (08:00) — **claves nuevas** |
| **Para qué sirve** | indexar el registro: `turnoKey`, `idEvolucion`, censo, auditoría, `_horasTurno()` | **solo** para saber cuándo avisar |
| **Turno día** | 09:00-20:59 | se van a las **20:00** |
| **Turno noche** | 21:00-08:59 | se van a las **08:00** |

🔴 **No se reutiliza una por la otra, en ninguna dirección.** Calcular el aviso desde
`_horasTurno()` lo haría salir a las 20:45 y a las 08:45 — cuarenta y cinco minutos después
de que el último kinesiólogo apagó el equipo y se fue, o sea inútil. Y al revés: mover
`TURNO_*_INICIO` para que «calce» con la salida rompería el `turnoKey` de todo el sistema.

**Consecuencia que hay que tener clara: entre las 20:00 y las 20:59 la evolución sigue
contando para el turno DÍA.** El equipo ya se fue, pero el turno de la app no ha cambiado:
si alguien guarda a las 20:30, eso entra en el turno día, con su `turnoKey` y su
`idEvolucion` de siempre. El aviso no altera eso ni un milímetro — solo mira el reloj.

**El candado «una sola vez por turno» sigue calzando.** Se guarda con el `turnoKey` de la
app, y las dos horas de aviso caen **dentro de su propio turno**: las 19:30 están en el
turno día (09:00-20:59) y las 07:30 en el turno noche (21:00-08:59). O sea que el aviso y
la marca que impide repetirlo pertenecen siempre al mismo turno, y ninguno de los dos se
cruza con el turno siguiente. No hay inconsistencia que arreglar.

### El aviso de fin de turno es un POP-UP MODAL, no un toast (decisión 7 de §9)

Manuel lo pidió con esas palabras: un aviso **dentro de la app**, *«claramente en la
pantalla»*, que diga **qué paciente(s) no están evolucionados**. Eso fija la forma:

- **Modal, centrado, sobre un velo** — no un toast de esquina, no una franja, no algo que se
  desvanezca solo a los 3,2 s.
- **Bloqueante hasta que la persona actúe**: no se cierra con la tecla Escape, ni con un clic
  fuera, ni solo. Sale con `Ya lo vi` (o abriendo una cama desde la propia lista).
- **La lista de camas se ve entera**, una fila por cama, con `Abrir` al lado. Si no cupieran,
  la lista tiene su propio scroll: el modal nunca recorta camas.
- **Sigue sin exigir resolver nada**: `Ya lo vi` cierra aunque queden camas pendientes. La
  presión es que **no se puede ignorar**, no que no se pueda salir — en una UCI un diálogo
  del que no se puede escapar es un peligro, porque tapa la pantalla justo cuando alguien
  necesita mirar un dato para una decisión clínica.
- Usa la convención de la casa (`uiConfirm` / modal propio), **jamás `confirm()` nativo**.

### El borrador local: qué guarda, cuándo vuelve, cuándo muere (O7)

| | |
|---|---|
| **Llave** | `CAMA_<idCama>_<turnoKey>` — la misma forma que `idEvolucion`, para que el borrador y la evolución hablen el mismo idioma |
| **Dónde** | `localStorage` (no `sessionStorage`): tiene que sobrevivir a que se cierre el navegador o se reinicie el equipo a mitad de turno — que es justamente el caso que hoy pierde todo |
| **Qué guarda** | el estado completo del formulario del turno: texto, **KTR**, **KTM con su nivel**, procedimientos marcados, selects y casillas, y la hora en que se dejó |
| **Qué NO guarda** | 🔴 **ni nombre, ni RUT, ni diagnóstico libre que identifique**. Solo `idCama`, `turnoKey` y los valores clínicos del turno |
| **Cuándo vuelve** | al reabrir **esa** cama con **ese mismo** `turnoKey`: se restaura solo y aparece la franja `Borrador sin guardar recuperado hh:mm` |
| **Cuándo muere** | al **guardar con éxito** esa cama en ese turno, o cuando el `turnoKey` ya no es el vigente (el borrador de un turno pasado se limpia al arrancar, no se ofrece nunca) |
| **Qué NO es** | no es una evolución. No escribe en EVOLUCIONES, no cuenta para el censo, y la cama sigue apareciendo como pendiente en el aviso de fin de turno (NO2) |

### 🪤 El PC de la unidad es compartido: el borrador es POR CAMA, no por persona

`localStorage` es del **navegador**, no del usuario, y en la unidad varios kinesiólogos usan
el mismo equipo sin sesión propia (`AUTH_DEV_MODE=TRUE`, no hay identidad fiable en el
front). Consecuencia que hay que decir en voz alta y no esconder:

**Si Diego deja un borrador en la cama 6 y después otro colega abre la cama 6 en ese mismo
turno desde el mismo equipo, va a ver el borrador de Diego.** Eso es *deseable* —es el
registro del turno de esa cama, no un documento privado— pero tiene que ser **visible**: por
eso la franja de recuperación dice la hora (`recuperado 03:12`) y la firma que traía el
borrador, para que nadie confunda lo que escribió otro con lo propio y lo guarde a ciegas.

Dos consecuencias más de la misma trampa:

1. El borrador **nunca lleva nombre ni RUT**: un equipo compartido con datos personales en
   `localStorage` es exactamente lo que la Ley 19.628 no quiere. Cama y turno alcanzan.
2. El borrador **no viaja entre equipos**. Lo dejado en el PC del box no aparece en el
   notebook. Es una limitación aceptada, no un defecto: la solución de verdad a eso es
   guardar, que es lo que todo este PRD empuja.

### 🪤 Por qué desaparece «Cerrar sin guardar» (y con él, la doble confirmación)

La versión anterior de este documento defendía mantener una salida destructiva con segunda
confirmación. **Manuel la cerró en contra** el 13-sep, con el dato de terreno que faltaba:
hoy, al cerrar sin guardar, **se pierden las KTR y todo lo evolucionado**, y eso no es
aceptable ni siquiera con un cartel de advertencia.

Con el borrador de O7 el dilema se disuelve. El caso que justificaba la salida destructiva
—abrir la cama equivocada y ensuciar `_formDirty` con un solo `input` (listeners de
v2/index.html:8500-8501)— deja de doler: cerrar conserva un borrador **local, invisible para
la estadística y que no escribe nada**, y ese borrador se descarta solo al cambiar de turno.
Nadie queda obligado a escribir una evolución falsa para poder salir, y nadie pierde trabajo.

Por eso **no hay doble confirmación en ninguna de las tres acciones**: la doble confirmación
existía para frenar una pérdida, y ya no hay pérdida que frenar. Manuel agrega el argumento
de forma: la ficha ya evoluciona mostrando **«cambios vs. sin cambios respecto al turno
anterior»**, así que al volver al borrador el clínico ve de inmediato dónde quedó.

### Privacidad (O6)

El aviso de fin de turno muestra **`Cama N`** y, si hace falta distinguir, **iniciales** o
el identificador interno del episodio. Nunca nombre completo ni RUT. Tampoco en
`console.log` ni en AUDIT_LOG: si el aviso deja traza, la deja con `idCama` y `turnoKey`,
que es todo lo que se necesita para auditar y nada de lo que identifica a una persona.

### Cuando el guardado FALLA (O3b) — qué hay hoy y qué falta

Requisito nuevo y explícito de Manuel (13-sep): *«si el guardado falla, que avise clara y
visiblemente en pantalla que NO se guardó, con opción de reintentar, y que no se pierdan los
datos»*. Lo que el código ya hace, verificado:

- `guardar()` **ya reintenta solo una vez a los 3 s** si la red parpadea, avisando
  `⚠️ Sin respuesta del servidor — reintentando en 3 s…` (v2/index.html:6777-6788). Eso se
  conserva tal cual: es bueno y evita molestar por un parpadeo.
- Si el reintento también falla, corre `_falloFinal(m)` (v2/index.html:6772-6775), que
  devuelve el botón a `💾 Guardar Evolución` y lanza un **toast**:
  `❌ No se pudo guardar: <motivo> — tu evolución sigue en pantalla, revisa la red y aprieta 💾 de nuevo`.
- **Los datos ya NO se pierden hoy**: el formulario no se toca y `_formDirty` sigue en `true`,
  así que la franja `⚠️ Sin guardar` sigue encendida. Esa parte del requisito ya está cumplida
  y no hay que construirla — hay que **decirlo** en el PRD para no "arreglar" algo sano.

Lo que **falta**, y es el cambio de esta pieza: ese aviso es un **toast de 3,2 segundos**.
Si el kinesiólogo estaba mirando al paciente cuando apretó guardar, el error se apaga solo y
vuelve a una pantalla donde el botón dice `💾 Guardar Evolución` como si nada hubiera pasado.
**Un fallo silencioso es peor que no avisar**, porque la persona cree que guardó.

Por eso:

1. El toast ❌ se mantiene (avisa al tiro, con el motivo).
2. **Y además** la franja del botón 💾 —la misma de `⚠️ Sin guardar`— entra en **estado de
   error persistente**: `❌ NO se guardó · Reintentar`, en rojo, y **se queda ahí** hasta que
   un guardado termine bien. Es el mismo sitio donde la mirada ya está entrenada.
3. Esa franja lleva el botón **`Reintentar`**, que vuelve a disparar el mismo guardado con
   los mismos datos (re-guardar el mismo turno actualiza, no duplica — así ya está razonado
   el reintento automático en el código).
4. `_formDirty` **sigue en `true`** y el borrador local de O7 se escribe también en este
   camino: si el equipo se apaga justo después del fallo, lo escrito vuelve al reabrir.

### Registrar el evento que se olvidó anotar (O5)

`_avisosTransicion()` (v2/index.html:6069) ya compara el estado de vía aérea/soporte con que
se abrió el turno contra el que se guarda y **ya avisa** sin bloquear («venía con TOT y quedó
sin TOT/TQT, pero no hay extubación registrada»). Hoy el aviso muere ahí: informa y no ofrece
nada. Lo que se agrega es la **acción**.

| Transición detectada | Evento que se ofrece anotar |
|---|---|
| TOT → sin vía aérea artificial | extubación (o autoextubación, a elección) |
| sin vía aérea → TOT | intubación |
| TOT → TQT | traqueostomía |
| TQT → sin vía aérea | decanulación |
| VM → VNI, VNI → O2, VM → O2 (y vuelta) | cambio de soporte |

Reglas duras de esta pieza:

1. Solo se ofrecen las transiciones que `_avisosTransicion()` ya sabe detectar. Ninguna
   inferencia nueva.
2. La hora la **escribe la persona**, con el turno que se está guardando como marco: se
   acepta cualquier hora dentro de ese turno y se rechaza cualquiera fuera de él. No se
   inventa «ahora» como hora del evento, porque eso es exactamente lo que corrompe los días
   de VM.
3. Si la persona no quiere anotar el evento, **se guarda igual**. El aviso no es un candado
   (es el comportamiento que ya tiene, y se conserva).
4. El hito entra en TIMELINE con la **hora real del evento**, y el registro de *cuándo se
   anotó* queda aparte — mismo criterio que ya usa `PRD_PROCEDIMIENTOS_DIAS_PASADOS.md`.
5. Fuera de alcance: eventos de turnos anteriores al que se está guardando. Esos siguen su
   camino (modo Coordinación).

## 6 · Pseudo-código — el acuerdo

```
CUANDO se toca ✕ en el panel del paciente
  ¿_formDirty es falso? → cerrar de inmediato, sin preguntar nada
  ¿_formDirty es verdadero? → abrir el MODAL DE CIERRE, tres acciones:
      1 «Guardar y cerrar»     → ejecuta el guardado normal; si sale bien, cierra
                                  el panel; si falla, NO cierra y deja el texto intacto
      2 «Seguir editando»      → cierra el modal, foco al formulario, nada más
      3 «Cerrar y conservar borrador» → escribe el borrador local con la llave
                                  CAMA_<id>_<turnoKey> y cierra. SIN segunda
                                  confirmación: no se pierde nada que confirmar
ENTONCES no existe ninguna otra salida del panel: el minimizar fue eliminado,
  y NINGUNA de las tres acciones pierde lo escrito
```

```
CUANDO se abre el panel de una cama
  ¿hay borrador local con la llave CAMA_<id>_<turnoKey> del turno VIGENTE?
     → restaurar el formulario completo tal como quedó (texto, KTR, KTM,
       procedimientos, selects) y mostrar la franja
       «Borrador sin guardar recuperado hh:mm», con la firma que lo dejó
     → dejar _formDirty en true: sigue siendo trabajo sin guardar
  ¿hay borrador de un turnoKey que ya no es el vigente? → borrarlo sin ofrecerlo
ENTONCES el clínico retoma donde quedó, y la ficha le sigue mostrando
  «cambios vs. sin cambios respecto al turno anterior» como siempre
```

```
CUANDO el guardado FALLA (tras el reintento automático de 3 s que ya existe)
  ENTONCES sale el toast ❌ con el motivo, como hoy, Y ADEMÁS:
     · la franja del botón 💾 entra en ERROR PERSISTENTE: «❌ NO se guardó · Reintentar»
     · el botón «Reintentar» vuelve a mandar los MISMOS datos (re-guardar el mismo
       turno actualiza, no duplica)
     · _formDirty sigue en true y el formulario NO se toca
     · se escribe el borrador local, por si el equipo se apaga después del fallo
  ¿el error es de sesión («Sesión no válida»)? → el camino de login que ya existe,
     y la franja queda igual en error
ENTONCES el estado de error se queda a la vista hasta que un guardado termine bien.
  Nunca se vuelve solo al botón «💾 Guardar Evolución» como si nada hubiera pasado
```

```
CUANDO el guardado termina bien
  ¿venía de «Guardar y cerrar»? → confirmar y cerrar el panel
  ¿venía del botón 💾 normal?  → confirmar y DEJAR EL PANEL ABIERTO
ENTONCES el toast ✅ de éxito sigue saliendo como hoy, y ADEMÁS la franja del botón 💾
  —la misma que dice «⚠️ Sin guardar»— queda en «✓ Guardado hh:mm»: persistente, con
  hora, sin overlay y sin tapar ningún campo
  · se DESCARTA el borrador local de esa cama y ese turno: ya está en el servidor
  ¿_avisosTransicion() detectó un cambio sin evento? → ofrecer anotarlo (§5), sin bloquear
```

```
CADA MINUTO, mientras la app está abierta
  ¿AVISO_FIN_TURNO_MIN es 0 o vacío? → no hacer nada (interruptor apagado)
  ¿qué turno está activo? → _horasTurno(), como siempre (eso NO cambia)
  ¿cuál es su HORA DE SALIDA? → SALIDA_TURNO_DIA (20:00) o SALIDA_TURNO_NOCHE (08:00)
     de CONFIG. NUNCA TURNO_DIA_INICIO/TURNO_NOCHE_INICIO: esos son el cambio de
     turno de la app y no tienen nada que ver con cuándo se va la gente
  ¿faltan AVISO_FIN_TURNO_MIN minutos o menos para esa hora de salida?
     ¿ya se avisó en este turno en este dispositivo? → no hacer nada
     ¿no? → pedir la lista fresca de camas ocupadas sin evolución del turno
            ¿la lista está vacía Y no hay panel abierto con cambios? → no molestar,
              pero marcar el turno como avisado
            ¿hay algo? → MOSTRAR EL POP-UP MODAL, centrado y sobre velo:
                 · primero, si existe, el panel abierto con cambios sin guardar
                 · después, una fila por cama pendiente: «Cama N» + [Abrir],
                   marcando «(de alta en el día)» si el paciente egresó en la fecha
                   (el registro no guarda la hora del egreso)
                   y «· borrador sin guardar» si esa cama tiene borrador local
                 · la lista se ve entera (scroll propio si no cabe)
                 · al pie: [Ya lo vi] — única salida, no cierra con Escape ni
                   con un clic fuera
ENTONCES marcar el turno como avisado en sessionStorage
```

```
CUANDO arranca el primer turno después de uno que quedó con camas sin evolución
  (nadie tenía la app abierta a la hora del aviso)
  ENTONCES reusar _avisoGapTurnos() para avisar, al inicio del turno nuevo, qué
    quedó sin evolución del turno anterior. Es la única recuperación posible:
    Apps Script no puede empujar nada al navegador (NO5)
```

**Promesas:**

- **Una sola salida del panel.** Cerrar. Ninguna vía esquiva la guardia de cambios sin guardar.
- **Ninguna acción del modal pierde trabajo**: se guarda, se sigue editando, o queda borrador.
- **Una sola vez por turno y por dispositivo**, salvo reinicio del navegador o la repetición
  opcional de `AVISO_FIN_TURNO_REPETIR`.
- **El pop-up de fin de turno interrumpe de verdad** (modal, bloqueante hasta `Ya lo vi`),
  pero **nunca exige resolver**: se puede cerrar con camas pendientes. El aviso de evento
  olvidado tampoco impide guardar.
- **Un guardado fallido nunca es silencioso**: el estado de error persiste hasta que uno
  termine bien, y los datos del formulario no se tocan.
- **El borrador nunca reemplaza a una evolución**: no escribe en EVOLUCIONES y no saca la
  cama de la lista de pendientes.
- **Nunca un nombre ni un RUT** en el aviso, en la consola o en la traza.
- **Nunca una hora inventada** en TIMELINE: la hora del evento retroactivo la escribe la
  persona y tiene que caer dentro del turno que se guarda.
- **Si el servidor no responde**, el aviso sale con el cache y lo dice; no se calla.
- **La franja `⚠️ Sin guardar` y el aviso de los 10 minutos siguen intactos** (NO1).

## 7 · Guardias: las que se van a poner rojas y las que faltan

| Guardia existente | Por qué la toca este cambio |
|---|---|
| `build/checks/sin_guardar.js` | vigila la franja `#gSinGuardar` y el recordatorio de 10 min. Este PRD **reusa esa franja** para el mensaje `✓ Guardado hh:mm`: si la guardia asume que el texto es siempre «Sin guardar», se pone roja y hay que ampliarla, no relajarla |
| `build/checks/panel_ux.js` | **por confirmar en la rama con el cambio.** No menciona literalmente `minTray`, `min-pill` ni `mbtn`, pero el panel pierde un botón de su barra: hay que correrla y ver si mide esa barra por otra vía (layout o captura) |
| `build/checks/movil_panel.js` | **por confirmar en la rama con el cambio.** Tampoco nombra esas cadenas; el `#minTray` estaba fijo abajo a la izquierda y al sacarlo cambia lo que se ve en móvil |
| `build/checks/guardado_viajes.js` | el camino de guardado gana un «guardar y después cerrar»; hay que confirmar que no se duplica el viaje al servidor |
| `build/checks/regresion_ui.js` | barrido general de UI tras quitar CSS y nodos |
| `build/checks/memo_config.js` | entran cuatro claves nuevas de CONFIG (`SALIDA_TURNO_DIA`, `SALIDA_TURNO_NOCHE`, `AVISO_FIN_TURNO_MIN`, `AVISO_FIN_TURNO_REPETIR`) |
| `build/checks/guardado_viajes.js` (2.º motivo) | el camino de fallo gana el botón `Reintentar`: hay que confirmar que un reintento manual **no** se suma al automático de 3 s ni duplica el viaje |

Guardias **nuevas** que hay que escribir (y ver fallar primero contra el estado actual del
código, que es la lección del 20-ago citada en los otros dos PRD):

1. **`sin_minimizar.js`** — no existe en `v2/index.html` ninguna de estas cadenas:
   `minimizarPanel`, `restaurarDesdeMin`, `_renderMinTray`, `_minStack`, `minTray`,
   `min-pill`. Y en la barra del panel no hay ningún botón cuyo título o texto sea
   `Minimizar` o `−`. Es la guardia que impide que el botón vuelva.
2. **`cierre_tres_acciones.js`** — `cerrarPanel` con `_formDirty` abre el modal propio y ese
   modal ofrece exactamente las tres acciones, en ese orden, con «Guardar y cerrar» como
   acción por defecto. Falla si aparece un `confirm()` nativo en ese camino, si la tercera
   acción descarta en vez de conservar borrador, o si alguna de las tres pide una segunda
   confirmación (ya no hay pérdida que confirmar).
3. **`confirma_guardado.js`** — tras un guardado OK **el toast de éxito sigue existiendo**
   (v2/index.html:6748, no se perdió en el camino) y además la franja muestra una
   confirmación **con hora** que persiste tras los 3,2 s del toast; esa confirmación **no es
   un overlay sobre el formulario** (ningún nodo nuevo encima de `#sp` que tape campos).
4. **`aviso_fin_turno.js`** — existe el temporizador; lee de CONFIG **las tres claves**
   (`SALIDA_TURNO_DIA` 20:00, `SALIDA_TURNO_NOCHE` 08:00, `AVISO_FIN_TURNO_MIN` 30) y **no**
   tiene ninguna de las tres escrita a mano en el código. 🔴 Falla si la hora del aviso se
   calcula con `_horasTurno()` / `TURNO_*_INICIO` en vez de con las horas de salida — es el
   error exacto que este PRD corrigió el 13-sep. Se dispara una sola vez por `turnoKey` por
   dispositivo.
4bis. **`aviso_fin_turno_modal.js`** — lo que sale es un **modal sobre velo**, no un toast ni
   una franja: tiene la lista de camas visible con un `Abrir` por fila, no se cierra con
   Escape ni con un clic fuera, y **sí** se cierra con `Ya lo vi` aunque queden camas
   pendientes. Falla si el aviso se desvanece solo.
5bis. **`borrador_local.js`** — cerrar conservando escribe la llave
   `CAMA_<idCama>_<turnoKey>` en `localStorage`; reabrir esa cama en el mismo turno restaura
   texto, KTR, KTM, procedimientos y selects, y muestra la franja de recuperación con hora;
   un guardado exitoso **borra** la llave; un borrador de otro `turnoKey` se limpia y no se
   ofrece; y el contenido del borrador **no contiene nombre ni patrón de RUT** (se prueba con
   un paciente sembrado de nombre conocido).
5ter. **`fallo_guardado_visible.js`** — forzando el fallo del guardado (y del reintento
   automático), la franja del botón 💾 queda en estado de error **persistente** con opción de
   reintentar, `_formDirty` sigue en `true`, el texto del formulario no cambió, y el botón
   **no** vuelve solo a decir `💾 Guardar Evolución` como si nada. Falla si el único aviso es
   el toast de 3,2 s.
5. **`aviso_fin_turno_privacidad.js`** — el texto y la traza del aviso no contienen nombre
   completo ni patrón de RUT. Se prueba con un paciente sembrado de nombre conocido: si su
   nombre aparece en el aviso, la guardia falla.
6. **`transicion_ofrece_evento.js`** — cuando `_avisosTransicion()` detecta una transición
   de la tabla de §5, se ofrece anotar el evento; la hora se acepta solo dentro del turno que
   se guarda, y rechazar la oferta **no** impide guardar.
7. **`beforeunload_sin_stack.js`** — el `beforeunload` (hoy v2/index.html:5350-5355) ya no
   menciona `_minStack` y sigue avisando con `_formDirty` y panel abierto.

Cada tanda cierra con **la batería completa en verde** más la guardia nueva de esa tanda
vista **fallar primero** contra el código sin el cambio.

## 8 · Orden de trabajo propuesto

Cada tanda = una rama `feature/...` desde `develop` → merge `--no-ff` a `develop` → PR
`develop → main`. **El merge lo autoriza Manuel** después de correr el checklist.

| Tanda | Qué | Por qué en ese orden |
|---|---|---|
| **1** | **Borrador local** (O7) + modal de cierre de tres acciones + confirmación de guardado con hora (O2, O3) + **estado de error persistente al fallar** (O3b) | Es la salida de reemplazo. Tiene que existir **antes** de quitar el minimizar, o se deja a Diego sin ninguna forma de pausar una evolución. El borrador va aquí y no después, porque es lo que hace que la tercera acción del modal no pierda las KTR |
| **2** | Eliminar el minimizar completo (O1) según el inventario de 16 puntos, + `beforeunload` limpio | Ya hay dónde ir. Borrado mecánico y verificable por grep |
| **3** | Pop-up modal de fin de turno (O4, O6) + las **cuatro** claves de CONFIG (incluidas las dos horas de salida) + recuperación al inicio del turno siguiente vía `_avisoGapTurnos()` | Pieza nueva, independiente de las dos anteriores; la más grande y la que más conviene poder apagar desde CONFIG |
| **4** | Ofrecer registrar el evento olvidado (O5) sobre `_avisosTransicion()` | La que toca datos clínicos. Va última, con las tres anteriores ya probadas en turno real |

### Tanda 1 — cómo probarlo

- Abrir una cama, escribir algo, tocar ✕: aparece el modal propio, no el diálogo del navegador.
- «Seguir editando»: el panel queda igual y el texto intacto.
- «Guardar y cerrar»: guarda y cierra; la franja alcanza a mostrar `✓ Guardado hh:mm`.
- «Cerrar y conservar borrador»: cierra al tiro, **sin segunda confirmación**.
- Reabrir esa misma cama en el mismo turno: vuelve todo —texto, KTR, KTM, procedimientos,
  selects— exactamente donde quedó, con la franja `Borrador sin guardar recuperado hh:mm`.
- Cerrar el navegador entero y volver a entrar en el mismo turno: el borrador **sigue ahí**.
- Guardar esa cama: la franja de borrador desaparece y el borrador queda descartado (reabrir
  no lo vuelve a ofrecer).
- Cambiar de turno (o esperar al cambio) y abrir la misma cama: **no** se ofrece el borrador viejo.
- Mirar el borrador en el navegador: no contiene nombre ni RUT, solo cama, turno y datos clínicos.
- Guardar con el botón 💾 normal: sale el toast ✅ de siempre, el panel **queda abierto**, y
  pasados los 3,2 s del toast la franja sigue diciendo `✓ Guardado hh:mm`.
- Cortar la red y guardar: reintenta solo a los 3 s; al fallar, sale el toast ❌ **y** la franja
  queda en `❌ NO se guardó · Reintentar` — y **sigue ahí** pasados los 3,2 s del toast.
- Reconectar y tocar `Reintentar`: guarda, y la franja pasa a `✓ Guardado hh:mm`.
- Tras un fallo: el texto escrito sigue intacto y `⚠️ Sin guardar` no se apagó.
- Abrir una cama y tocar ✕ sin escribir nada: cierra al tiro, sin preguntar ni dejar borrador.

### Tanda 2 — cómo probarlo

- `grep -n "minimizarPanel\|_minStack\|minTray\|min-pill\|restaurarDesdeMin" v2/index.html` no devuelve nada.
- La barra del panel tiene solo ✕; no hay `−` ni pastillas abajo a la izquierda.
- Escribir en una cama, cerrar la pestaña del navegador: sigue apareciendo el aviso del navegador.
- Guardar y después cerrar la pestaña: **no** aparece ningún aviso.
- Abrir una cama, cerrarla conservando, y volver a abrirla: el borrador de la tanda 1 se
  restaura igual que antes (quitar el minimizar no rompió el camino nuevo).
- En móvil, la esquina inferior izquierda queda libre.

### Tanda 3 — cómo probarlo

- Con los valores por defecto (`SALIDA_TURNO_DIA = 20:00`, `AVISO_FIN_TURNO_MIN = 30`), adelantar el reloj del equipo a 19:30: el pop-up sale una vez.
- Poner `SALIDA_TURNO_DIA` a un minuto futuro (p. ej. dentro de 31 min) y esperar: el pop-up sale a la hora nueva, sin tocar código.
- Confirmar que a las 20:45 —vieja hora del cálculo por `_horasTurno()`— **no** pasa nada.
- Es un **modal sobre velo**, centrado: no se desvanece solo, no se cierra con Escape ni con un clic fuera.
- Lista solo camas ocupadas sin evolución de ese turno, con `Cama N`, sin nombres ni RUT.
- Una cama cuyo paciente egresó en la fecha aparece marcada `(de alta en el día)` — no `hh:mm`:
  `ARCHIVO_PACIENTES` no guarda la hora del egreso (ver la nota de §9).
- Una cama con borrador local aparece marcada `· borrador sin guardar`.
- `Abrir` lleva al panel de esa cama; `Ya lo vi` cierra el pop-up aunque queden camas pendientes.
- Recargar la página a las 20:50: el pop-up **no** vuelve a salir.
- Cambiar `AVISO_FIN_TURNO_MIN` a 45 en CONFIG y repetir: sale a las 19:15, sin tocar código.
- Guardar una evolución a las 20:30 (después de la salida, antes del cambio de turno): sigue contando como **turno día**, el `turnoKey` no cambió.
- Poner `AVISO_FIN_TURNO_MIN = 0` en CONFIG: no sale nada.
- Con un panel abierto con cambios sin guardar, ese panel aparece nombrado primero en el pop-up.
- Dejar una cama sin evolucionar, cerrar la app antes de las 19:30 y entrar al turno siguiente:
  el aviso de `_avisoGapTurnos()` nombra lo que quedó del turno anterior.

### Tanda 4 — cómo probarlo

- Paciente con TOT; guardar el turno dejándolo sin vía aérea: se ofrece anotar la extubación.
- Poner una hora dentro del turno: el hito queda en TIMELINE con esa hora, no con la del guardado.
- Poner una hora fuera del turno: se rechaza con un mensaje claro.
- Rechazar la oferta: la evolución **se guarda igual**.
- Recorrer VM→VNI, VNI→O2, TOT→TQT y TQT→sin vía aérea: cada una ofrece su evento.
- Revisar los días de VM del paciente antes y después: solo cambian por la hora real anotada.

## 9 · Decisiones tomadas (13-sep-2026)

Manuel respondió las seis preguntas abiertas del borrador. Quedan aquí escritas para que, en
seis meses, se pueda saber **quién decidió qué y por qué** sin reconstruirlo de memoria.
Cada una está ya incorporada en las secciones que corresponden.

| # | Pregunta | Decisión de Manuel | Dónde vive ahora |
|---|---|---|---|
| **1** | ¿Los 15 minutos son configurables o fijos? | **Configurables**, clave `AVISO_FIN_TURNO_MIN`, default **15**, `0` = apagado | O4 · §5 tabla de CONFIG · guardia `aviso_fin_turno.js` |
| **2** | ¿Basta el toast de guardado, se suma la franja o se reemplaza? | **Se suma**: toast actual **+** franja persistente `✓ Guardado hh:mm`. **Y además**, requisito nuevo: el guardado que **falla** tiene que avisarse clara y visiblemente, con opción de **reintentar** y sin perder los datos | O3, **O3b** · §5 «Cuando el guardado FALLA» · guardia `fallo_guardado_visible.js` |
| **3** | ¿El fin de turno a avisar es el de la app o la hora real de salida? | **La hora real de salida**, que **no** coincide con el cambio de turno de la app. Ver la decisión 8 | O4 · §5 disparadores y la trampa del cambio de turno |
| **4** | ¿Se mantiene «Cerrar sin guardar»? | **No.** Hoy cerrar sin guardar **pierde las KTR y todo lo evolucionado**, y eso no es aceptable. La tercera acción pasa a ser **«Cerrar y conservar borrador»**, con borrador local por cama y turno. Sin doble confirmación: ya no hay pérdida que confirmar | **O7** · §3 ⚠️ · §5 borrador local y sus dos trampas · §6 |
| **5** | ¿Qué pasa si nadie tiene la app abierta a esa hora? | **Avisar al inicio del turno siguiente**, reusando `_avisoGapTurnos()` | NO5 · §6 tercer bloque · tanda 3 |
| **6** | ¿El aviso incluye camas con alta en el mismo turno? | **Sí, marcadas `(de alta en el día)`** — se pidieron con hora, pero el registro no la guarda (ver la nota de desvíos al final de §9) | §5 «Cómo se sabe que una cama no está evolucionada» · tanda 3 |
| **7** | *(añadida por Manuel)* ¿Qué forma tiene el aviso de fin de turno? | **Pop-up modal dentro de la app**, *«claramente en la pantalla»*, que diga qué paciente(s) no están evolucionados. Bloqueante hasta `Ya lo vi`, con la lista visible. **No un toast** | O4 · §5 «El aviso de fin de turno es un POP-UP MODAL» · guardia `aviso_fin_turno_modal.js` |
| **8** | ¿A qué hora exacta sale el aviso? | *«El aviso tiene que salir entre las 19:45 o 19:30, que es más o menos el horario en el que los últimos están escribiendo. Nuestro horario de salida es a las 20:00 (turno día) y a las 08:00 (turno noche).»* → dos claves nuevas de CONFIG, `SALIDA_TURNO_DIA` = **20:00** y `SALIDA_TURNO_NOCHE` = **08:00**, y `AVISO_FIN_TURNO_MIN` sube a **30** → aviso a las **19:30** y **07:30** | O4 · §5 tabla de CONFIG y la trampa · §6 · guardia `aviso_fin_turno.js` · tanda 3 |

### Lo que cambió en el PRD por estas decisiones

- **Entró un objetivo nuevo, O7** (borrador local), y con él **NO2 quedó revisado**: el
  borrador local sí está en alcance; lo que sigue fuera es el autoguardado al servidor.
- **Entró O3b** (fallo de guardado visible), que no estaba en el borrador original.
- **Salió** la salida destructiva «Cerrar sin guardar» y, con ella, la doble confirmación.
- El aviso de fin de turno **dejó de ser «no bloqueante»** para pasar a ser un modal que
  interrumpe de verdad — sin dejar de poder cerrarse con camas pendientes.
- Tres guardias nuevas: `borrador_local.js`, `fallo_guardado_visible.js`,
  `aviso_fin_turno_modal.js`.

### ✅ No quedan preguntas abiertas

La última —si el cambio de turno de la app coincidía con la hora real de salida— se cerró el
13-sep con un **no**: el equipo se va a las **20:00** y a las **08:00**, mientras que el
turno de la app cambia a las 21:00 y a las 09:00. Eso obligó a separar las dos cosas en
CONFIG (decisión 8) y es la corrección de diseño más importante que trajo esta ronda: con el
cálculo anterior el aviso habría salido a las 20:45 y a las 08:45, con la unidad ya vacía.

Con eso, el PRD queda **cerrado y listo para implementar** por tandas (§8). Lo que aparezca
de aquí en adelante son hallazgos de implementación, y van a `BITACORA.md`, no a este
documento: el PRD solo se toca para una revisión formal de alcance.

### Desvíos de implementación anotados en el PRD (13-sep-2026)

Este documento se cierra con la regla de que «lo que aparezca de aquí en adelante son
hallazgos de implementación, y van a `BITACORA.md`, no a este documento». Se hace **una
excepción**, y solo para esto: cuando la implementación demuestra que algo escrito aquí
**no se puede cumplir como está escrito**, dejarlo intacto convierte al PRD en una
especificación que contradice al producto — y el que lo lea en seis meses va a creerle al
papel. El porqué sigue viviendo en la bitácora; aquí queda solo la corrección del hecho.

| Qué decía | Qué dice el código | Por qué |
|---|---|---|
| La fila del aviso de fin de turno marca `(de alta hh:mm)` (§5, §6, tanda 3, decisión 6) | `(de alta en el día)`, y el modal agrega al pie que el registro no guarda la hora del egreso | `ARCHIVO_PACIENTES` guarda `FECHA_EGRESO`, sin hora. La alternativa era inventarla, que es justo lo que este PRD prohíbe |
| El evento olvidado «entra en TIMELINE con la hora real» (§5, O5) | Se rellenan los campos del formulario y el hito llega a TIMELINE por el camino canónico, con la hora real | `_timelineDelGuardado()` borra y regenera los hitos `via_aerea` en cada guardado: un hito escrito a mano lo borraría el guardado siguiente. Detalle en `BITACORA.md` |

**Mejora futura, no incluida en este PRD: guardar la hora de egreso.** Hoy no existe en
ninguna hoja. Con ella, la marca podría volver a ser `(de alta hh:mm)` y el kinesiólogo
sabría de un vistazo si el paciente alcanzó a estar en el turno. Requiere una columna nueva
en `ARCHIVO_PACIENTES` (al final de la lista), subir el total de `testEsquema()` y correr
`crearORepararEstructura()` — o sea, es su propia tanda, y toca a quien da el alta, no al
aviso.
