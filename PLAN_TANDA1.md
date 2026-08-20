# Plan de implementación — Tanda 1 de RCE-KINE (cama rotada · egresado corregible · KTM en el servidor)

> Estado de entrada: **los 3 diseños recibieron "sirve con cambios" en las 9 lentes**. Ninguno se implementa tal como está escrito. Este plan incorpora las refutaciones medidas, se alinea con `PRD_PROCEDIMIENTOS_DIAS_PASADOS.md` §5/§6/§8 (fuente de producto, fechada 20-ago) y agrega **cinco reparaciones previas** que ningún diseño vio y que las lentes reprodujeron corriendo rutas reales.

---

## 0 · Reencuadre: por qué el plan no son "tres arreglos"

Las nueve lentes convergen en un mismo hecho: **los tres agujeros son una sola raíz**. `ID_EVOLUCION = 'CAMA_<n>_<turnoKey>'` no identifica al episodio, y todo el sistema (guardado, anexo, procedimientos, timeline, anulación) resuelve por esa clave mientras atribuye por `PATIENT_ID`. Cada arreglo por separado produce un daño nuevo:

| Diseño original | Lo que rompe si se implementa tal cual | Medido en |
|---|---|---|
| **cama-rotada** (candado pid evolución ≠ pid cama) | Bloqueo **permanente e irrecuperable** del ➕: la fusión de `guardarEvolucion` hereda el `PATIENT_ID` del paciente anterior, así que "guarda la evolución del ocupante actual" —lo que dice el propio mensaje de error— no suelta el candado. Y el mensaje receta dar el alta, que **egresa al paciente vivo**. | 3/3 lentes, sobre `sim_srv.js` |
| **egresado-corregible** (localizador de dos hojas) | Escribe por clave duplicada (`repoActualizar` = primera coincidencia) y su promesa central es falsa: `_CAMPOS_INDICADORES` no incluye `PROC_*` y `svc_rem.gs` no lee `PROC_JSON`. La corrección "llega al REM" solo con la Tanda 3 dentro. | 3/3 lentes |
| **razon-ktm-servidor** (regla pura `validarKTM`) | El "paso 5" (razón/nivel huérfano) **bloquea toda evolución nocturna** de un paciente con KTM de día: `fillCama` hereda `KTM_NIVEL` desde la cama (`index.html:5341`), de noche `aplicarGatesEval` apaga el estado y **no limpia el nivel**, y la tarjeta está oculta: no hay forma de destrabarlo desde la pantalla. | 3/3 lentes |

**Regla que ordena el plan:** primero se repara lo que hace irreparable el bloqueo, después se pone el candado. Poner el candado antes es cambiar "le escribe al paciente equivocado" por "al paciente correcto no se le puede escribir" — igual de grave según la regla dura del proyecto.

### Hechos verificados que corrigen los diseños (no re-verificar)

- `obtenerEvosDelDia` (`v2/svc_evoluciones.gs:781`) **ya lee las dos hojas** desde el 20-ago y **ya devuelve `PATIENT_ID`** al front (`:826`). El riesgo nº1 del diseño 2 ("el arreglo se queda sin puerta de entrada, eso es Tanda 4") es **falso**: la puerta está abierta y las guardias `dia_de_egresado.js` / `dia_de_egresado_ui.js` la fijan. Eso hace el arreglo del servidor **urgente**, no cosmético.
- Una cama tiene **dos episodios en el mismo turno 39 veces en agosto** (comentario medido en `svc_evoluciones.gs:800-803`), y hay **2 filas presentes en las dos hojas** en la planilla real. La ambigüedad por clave no es un borde: es el mes normal.
- Son **82 guardias** en `build/checks/`, no 64 ni 80. `build/verificar.js:7` y la skill `rce-kine` dicen 64: texto desactualizado (nadie depende del número, `readdirSync` las descubre).
- Nombres libres verificados en **todo el repo, incluida `V3 colaborativa/`**: `_ubicarEvolucionDeTurno`, `validarKTM`, `_mismoEpisodio`, `_pidDeEvolucion`, `_evoDelEpisodio`, `_normalizarKTM`, `_auditarRechazo` → 0 resultados cada uno. Archivos de guardia libres: `evento_paciente.js`, `ktm_razon_servidor.js`, `egresado_corregible.js`.
- Nombres citados por los diseños que **NO existen**: `repararEvosAjenas`, `diagnosticarEvosAjenas`, `cierreAnio`. Los reales: `repararEvolucionesAjenasSIMULACRO/CONFIRMAR` (`v2/mantenimiento.gs:632/635`), `archivarAnioHistorico` (`:383`). **Ningún mensaje de error puede nombrar una función que no existe.**
- `_coordUbicar` está en `svc_coordinacion.gs:553` (no 702) y es seguro **porque escribe por `ID_ARCHIVO`, que sí es único**. Copiar su forma sobre `ID_EVOLUCION` copia la forma y pierde la garantía.

---

## 1 · Los cinco bugs previos que hay que reparar ANTES del candado

Ninguno estaba en los tres diseños. Los tres se descubrieron ejecutando rutas reales.

| # | Archivo:línea | Qué está mal hoy | Consecuencia medida |
|---|---|---|---|
| **P1** | `v2/svc_evoluciones.gs:68` + `:85` | La fusión copia de la fila previa **toda clave ausente del payload, `PATIENT_ID` incluido**, y luego `datos.PATIENT_ID \|\| cama.PATIENT_ID` hace **ganar al pid heredado**. Cinco líneas más abajo (`:73`) el mismo archivo ya sabe blindar una clave presente-en-falso (`ES_INGRESO`). | El episodio completo del ocupante nuevo queda **atribuido al paciente anterior**, y `_syncCamaDesdeEvolucion` (`:483`) le escribe ese pid **al censo**: `CAMAS_ESTADO.PATIENT_ID = uuid(A)` con `NOMBRE = 'Paciente B'`. `obtenerHistorialPaciente` lee por pid → mezcla los dos episodios (19.628). |
| **P2** | `v2/svc_procedimientos.gs:10-12`, llamada incondicional desde `svc_evoluciones.gs:342` | `repoEliminarPorCols('PROCEDIMIENTOS', ['ID_EVOLUCION'], …)` borra **todas** las filas de esa clave **sin mirar `PATIENT_ID`**. | El guardado rutinario del ocupante siguiente **borra los procedimientos ya registrados del anterior**. Medido: `[KTR(A), BRONCOSCOPÍA(A)] → [KTM(B)]`. Y la "invariante cruzada" del diseño 1 lo lee como **0 filas mixtas = éxito**. |
| **P3** | `v2/svc_timeline.gs:37` y `:277` | `_sincronizarTimelineCama` y `_timelineDelGuardado` reconstruyen `TIMELINE_JSON` leyendo **solo por `ID_CAMA`**; `obtenerTimeline` (`:52`) igual. `_limpiarCamaInterno` vacía el cache pero **no purga TIMELINE**. | El ingreso y el diagnóstico del paciente anterior aparecen en la tarjeta del ocupante actual, y al entrar empujan un hito verdadero fuera del tope de 30. `_agregarHitoInternoSinSync` **no lo evita, solo lo posterga** hasta el siguiente hito de esa cama. |
| **P4** | `v2/svc_camas.gs:303-312` + `:496-503`; `v2/repo.gs:280-292` | `_reetiquetarEpisodioACama` reescribe `ID_EVOLUCION` en EVOLUCIONES y TIMELINE pero **no en PROCEDIMIENTOS**; `_archivarEvolucionesDeCama` archiva conservando la clave. `repoBuscarFila` devuelve **la primera coincidencia y corta**. | `ID_EVOLUCION` duplicado alcanzable **por ruta de interfaz** (`MOVER_A_CAMA_VACIA`), no "pegando filas a mano". Con el candado puesto, el ➕ del ocupante actual queda bloqueado contra la fila del anterior mientras la suya está justo debajo, inalcanzable. |
| **P5** | `v2/api.gs:209-220` | `_auditar` solo escribe en `AUDIT_LOG` `if (r && r.ok)`. | Un rechazo del candado nuevo **no deja rastro**. El riesgo que el propio diseño reconoce ("el procedimiento se pierde por abandono") queda además indetectable a posteriori. |

---

## 2 · Orden exacto de los cambios

El orden no es negociable: cada paso deja al siguiente en condiciones de ser verificable.

| # | Cambio | Por qué va aquí |
|---|---|---|
| **0** | Arnés de guardias (stubs y sim) | Sin esto ninguna guardia mide. `eventos.js:16` tiene `repoLeerTodos = h => (DB[h]\|\|[]).slice()` que **ignora el filtro**: cualquier arreglo que lea filtrado da verde sobre datos sin filtrar. |
| **1** | **P1** — la fusión deja de heredar identidad | Es la que hace **irreparable** cualquier candado y la que contamina el censo hoy, sin candado. Máximo daño vivo. |
| **2** | **P2** — `PROCEDIMIENTOS` se borra por episodio, no por clave | Es la que **borra dato verdadero hoy** por ruta de interfaz. Y es precondición: sin ella, el camino de recuperación del candado destruye evidencia. |
| **3** | **P3** — TIMELINE filtra por paciente | Fuga de dato ajeno + desplazamiento de dato propio. Precondición del assert de "el ocupante no ve el evento del egresado". |
| **4** | **Localizador único de evolución** (`_ubicarEvolucionDeTurno`) | Ahora que la identidad es limpia, se puede resolver por episodio. **Cierra agujeros 1 y 2 con la misma pieza** (PRD §5 y §6). |
| **5** | `anexarEventoRapido` sobre el localizador + candado + camino cerrado | Es el agujero que el PRD manda cerrar. Depende de 1-4. |
| **6** | **P5** — auditar el rechazo | El candado del paso 5 empieza a rechazar; sin esto los rechazos son invisibles. |
| **7** | Front: `evAbrir` manda el episodio | Desambigua la clave repetida (39 casos/mes) sin romper el ➕. Va **después** del servidor: el servidor tiene que aguantar payloads viejos. |
| **8** | **KTM en el servidor** (`validarKTM` acotado) + el front deja de inventar | Va al final porque toca `validarPayloadEvolucion`, que corren 4 guardias sin stub, y porque su alcance depende de decisiones del PRD ya tomadas. |
| **9** | Coherencia mínima de LECTURA (`svc_entrega`, `obtenerEvolucion`, `anularEvento`) | El candado tapa la escritura; hoy la **lectura** sigue mostrando la evolución y el cultivo del paciente anterior como propios. Sin esto la promesa "no toca a nadie más" es falsa. |

---

## 3 · Detalle por paso

### PASO 0 — Arnés (antes de tocar `v2/`)

**Archivos:** `build/checks/eventos.js`, y el arnés nuevo de las guardias de esta tanda.

- Subir el stub de `repoLeerTodos` de `eventos.js:16` al de `build/checks/limpiar_archiva.js:46`, **que sí respeta `filtroKey`/`filtroVal`**. Sin esto cualquier lectura filtrada del arreglo se mide sobre la hoja entera.
- Renombrar el assert de `eventos.js:120` ("cama desocupada → rechazado"): usa `idCama:'99'`, **una cama que no existe en el fixture**, así que hoy pasa por `!cama`, nunca por `!OCUPADA`. Nunca probó lo que su nombre dice.
- Las guardias nuevas de esta tanda corren sobre **`build/sim/sim_srv.js`** (servidor `.gs` real con hojas en memoria y dispatcher real), y **construyen el escenario con rutas reales**, no escribiendo filas en `DB`. Las tres rutas que producen el estado mixto, por orden de honestidad:
  1. `MOVER_A_CAMA_VACIA` — **ruta de interfaz**, limpia el origen con `_limpiarCamaInterno` sin archivar. Es la que hay que usar como escenario canónico.
  2. `limpiarCamasManual` — herramienta del **editor de Apps Script**, no de la app. Vale como escenario secundario, declarado como tal.
  3. Alta + re-ingreso en el mismo turno — produce clave duplicada entre hoja viva y archivo.
- `mantenimiento.gs` **no se puede cargar dentro de `sim_srv`** (no está en `ARCHIVOS`). Una guardia que necesite la herramienta de reparación monta su propio sandbox, como hace `reparar_ajenas.js:24-40`.

---

### PASO 1 — La fusión deja de heredar identidad

**Archivo:** `/Users/manuelfuentes/Documents/RCE-KINE/v2/svc_evoluciones.gs`
**Función:** `guardarEvolucion`, bloque de fusión `:65-88`.

**Qué hace, en palabras:**

1. La fila previa se ubica **por episodio**, no por clave: se busca en `EVOLUCIONES` la fila cuyo `TURNO_KEY` es el pedido **y** cuyo `PATIENT_ID` coincide con el de la cama. Se usa `repoLeerTodosConFila` + `repoEscribirFila`/`repoUpsertEnFila` para escribir **por número de fila**, nunca por `repoActualizar(colKey)` — porque la clave puede repetirse (P4).
2. Si bajo la clave `CAMA_<n>_<turnoKey>` hay una fila **de otro paciente**: **no se fusiona con ella y no se la pisa**. Se inserta una fila nueva para el episodio actual. La fila del anterior queda intacta (hoy la fusión le copia encima los datos clínicos del nuevo y le deja el pid del viejo: lo peor de los dos mundos).
3. `PATIENT_ID` y `COD_PACIENTE` **se excluyen de la copia ciega** de `_prev`. El pid sale de la cama; si la cama no lo tiene, se genera una vez, como hoy.
4. Se conserva sin tocar el blindaje de `ES_INGRESO` de `:73` — es el precedente de estilo del que se copia esta regla.

**Guardia que lo fija:** `build/checks/episodio_no_hereda.js` (nueva).
- ROJA hoy: `INGRESAR A` → `GUARDAR_EVOLUCION(A, T)` → `MOVER_A_CAMA_VACIA` → `INGRESAR B` → `GUARDAR_EVOLUCION(B, mismo T)`; hoy la fila de B queda con `PATIENT_ID = uuid(A)` y `CAMAS_ESTADO.PATIENT_ID = uuid(A)` con `NOMBRE = 'Paciente B'`. Se exige: la fila de B lleva el pid de B, la de A sigue existiendo con su `PROC_JSON` original, y el censo de la cama lleva el pid de B.
- VERDE hoy y después: re-editar el propio turno del propio paciente sigue fusionando igual (no se rompe el caso de todos los días).

---

### PASO 2 — `PROCEDIMIENTOS` se borra por episodio

**Archivo:** `v2/svc_procedimientos.gs`
**Función:** `_guardarProcedimientosInterno` (líneas 7-34).

**Qué hace:** el `repoEliminarPorCols` pasa a exigir **`ID_EVOLUCION` igual Y `PATIENT_ID` igual** al del episodio que está guardando. Las filas de ese turno que pertenecen a otro `PATIENT_ID` no se tocan. Si `patientId` viene vacío (fila legacy), se mantiene el comportamiento actual solo para las filas también sin pid — nunca se borra una fila con pid distinto y no vacío. Es la misma regla "distinto **y** no vacío" que ya usa `_mtoRepararAjenas` (`mantenimiento.gs:659-663`).

**Guardia:** `build/checks/procedimientos_no_pisan.js` (nueva).
- ROJA hoy, por ruta 100% de interfaz: paciente O2 en cama 6 con `KTR` + `ECOGRAFÍA` anexada → `MOVER_A_CAMA_VACIA 6→7` → `INGRESAR` en la 6 → `GUARDAR_EVOLUCION` del nuevo ocupante. Hoy **las dos filas de O2 desaparecen de `PROCEDIMIENTOS`** mientras su `PROC_JSON` en la cama 7 las sigue teniendo. Se exige que sobrevivan.

---

### PASO 3 — TIMELINE filtra por paciente

**Archivo:** `v2/svc_timeline.gs`
**Funciones:** `_sincronizarTimelineCama` (`:35-42`), `_timelineDelGuardado` (`:181`, reconstrucción del cache en `:277-281`), `obtenerTimeline` (`:52`).

**Qué hace:** las tres pasan a filtrar por `ID_CAMA` **y** `PATIENT_ID` del episodio vigente. El borrado de hitos automáticos de `_timelineDelGuardado` (`_TIPOS_HITO_AUTO`, `:185-190`) también exige el pid: hoy borra los hitos de esa cama+fecha+turno **de cualquiera**. `_agregarHitoInternoSinSync` (`:8-13`) conserva su fallback de pid desde la cama, pero se le añade el comentario de que el llamador **debe** pasar `patientId` en el camino de episodio cerrado, porque ese fallback es una puerta trasera que atribuye el hito al ocupante de hoy.

**Guardia:** `build/checks/timeline_no_ajeno.js` (nueva).
- ROJA hoy: tras rotación, `CAMAS_ESTADO['4'].TIMELINE_JSON` empieza con el hito de ingreso y el diagnóstico del paciente anterior.
- ROJA hoy, la que mide el **dato verdadero**: sembrar 30 hitos reales del ocupante nuevo, anexar un evento sobre el turno del anterior, **disparar después un hito rutinario de esa cama** (aquí es donde el diseño 2 se medía a sí mismo: sin ese disparo el cache no se ha reconstruido todavía y sale verde con el bug vivo) y exigir que los 30 propios sigan estando.

---

### PASO 4 — Localizador único de evolución

**Archivo:** `v2/svc_evoluciones.gs`, insertado junto a `obtenerEvolucion` (`:681-686`).
**Función nueva:** `_ubicarEvolucionDeTurno(patientId, turnoKey, idCama)` → `{ hoja, fila, obj, vivo }` o `null` o `{ ambigua: true }`.

**Qué hace:**

- **Con `patientId`** (el caso bueno): busca en `EVOLUCIONES` y luego en `EVOLUCIONES_ARCHIVO` la fila con ese `PATIENT_ID` **y** ese `TURNO_KEY`. Se resuelve por episodio porque tras un traslado el `ID_EVOLUCION` lleva la cama nueva. Devuelve **el número de fila**, no la clave.
- **Sin `patientId`** (payload viejo): arma la clave `CAMA_<n>_<turnoKey>` y busca en las dos hojas **contando coincidencias**. Si hay **más de una en total** —dentro de una hoja o entre las dos— devuelve `ambigua` y **no elige**. La detección "aparece en las dos hojas" del diseño 2 es insuficiente: el duplicado dentro de `EVOLUCIONES_ARCHIVO` es el que se acumula solo (P4).
- **Nunca** devuelve una fila cuyo `PATIENT_ID` esté vacío junto a un pid pedido no vacío: eso lo decide el llamador, no el localizador.
- No cachea nada: lee, resuelve y descarta dentro de la misma petición.

**Consumidores de `ID_EVOLUCION` que hay que mirar al tocar esto** (mapa completo, ya levantado): `svc_eventos.gs:218/223/228`, `svc_evoluciones.gs:65/315/609/684/947`, `svc_procedimientos.gs:11/21/38`, `svc_camas.gs:308`, `mantenimiento.gs:540/572/577/584/706/758/764`, `mantenimiento_manuel.gs:255/360/361`. En esta tanda **solo** cambian los de `svc_eventos.gs`, `svc_evoluciones.gs:65` y `svc_procedimientos.gs:11`. El resto se deja documentado.

**Guardia:** cubierta por las de los pasos 5 y 8.

---

### PASO 5 — `anexarEventoRapido` sobre el localizador

**Archivo:** `v2/svc_eventos.gs`, función `anexarEventoRapido` (empieza en `:178`, todo dentro del `conLock` de `:180`).

**Qué hace, tramo por tramo:**

- **`:193-195`** — se sustituye el guard `if (!cama || !esVerdadero(cama.OCUPADA))`. La cama deja de **autorizar** y pasa a **clasificar**:
  - `pid` = `datos.patientId` si viene; si no, el de la cama.
  - se ubica la evolución con `_ubicarEvolucionDeTurno`.
  - **no existe** → rechazo `ERR.VALIDACION`: "no hay evolución guardada de ese turno; no se inventan turnos hacia atrás".
  - **ambigua** → rechazo nombrando la ambigüedad (dos episodios comparten ese turno en esa cama) **sin nombrar al otro paciente ni su pid** (19.628 — el mensaje va a un toast, a diferencia del `Logger` de mantención).
  - **evolución sin `PATIENT_ID`** → se deja pasar solo si la cama tampoco lo tiene; con pid de cama presente y pid de evolución vacío → **pasa** (regla copiada de `_mtoRepararAjenas`; bloquear escondería procedimientos verdaderos de camas reparadas, y rompería `eventos.js` §3, que debe seguir verde).
  - **pid de evolución ≠ pid pedido, ambos no vacíos** → rechazo (agujero 1 del PRD).
  - **`EN CAMA`** = la evolución está viva y su pid es el del ocupante de esa cama. **`CERRADO`** = todo lo demás (egresado, cama limpiada, cama re-ocupada, trasladada).
- **`:204-210` (rama dispositivo)** — en `CERRADO` se **rechaza** `hme`/`hepa`/`sonda` con el motivo: el reloj `DISP_*_FECHA` vive en `CAMAS_ESTADO`, una fila que hoy es de otra persona; aplicarlo le reinicia el reloj al ocupante actual y `cambiosEstaNoche` (`:150`) deja de avisar un cambio real. En `EN CAMA` no cambia nada.
- **`:217-232`** — `idEvo` y la búsqueda desaparecen: la evolución ya viene resuelta. `PROC_JSON`/`PROC_CANTIDAD`/`PROC_RESUMEN` se escriben **por fila** en `ubic.hoja`. La fila de `PROCEDIMIENTOS` toma `ID_EVOLUCION = ubic.obj.ID_EVOLUCION`, `ID_CAMA = ubic.obj.ID_CAMA` (la cama del turno, no la del payload) y `PATIENT_ID` **del episodio**, nunca de la cama de hoy.
- **`:254-259`** — el hito se fecha siempre en **su** turno. `EN CAMA` → `_agregarHitoInterno`. `CERRADO` → `_agregarHitoInternoSinSync` con `patientId` explícito. Con el PASO 3 hecho, esto ya no es "un retardo de minutos": el cache filtra por paciente, así que el hito del egresado no puede entrar en la tarjeta del ocupante ni cuando la sincronización corra después.
- **`:261-264`** — en `CERRADO` no se lee `CAMAS_ESTADO` y se omite `dispositivos` (el front lo usa con `if (r && r.dispositivos)`, `index.html:9958`: omitirlo es seguro). Se devuelve `patientId` **y** `idCama`/`idEvolucion` para que `_auditar` (`api.gs:209-216`) no deje la fila sin `idEntidad`.
- **Cero escrituras antes del rechazo.** Todo corre en el mismo `conLock` y la fila se resuelve por número de fila: no hay ventana entre el chequeo y la escritura.

**Lo que el mensaje de error NO puede decir** (los tres diseños lo decían y las tres lentes lo refutaron): "dale el alta al paciente anterior" —`darAltaPaciente` opera sobre la cama y **egresaría al paciente vivo**, escribiendo una fila falsa en `ARCHIVO_PACIENTES` y contaminando egresos y REM— y "corre `repararEvolucionesAjenas…`" —función del editor de Apps Script, inalcanzable desde el turno, y que **jamás toca filas sin pid** por decisión explícita (`mantenimiento.gs:659-662`)—. Con el localizador puesto, la mayoría de esos casos **ya no necesita salida**: se resuelven al episodio correcto.

**Guardia:** `build/checks/evento_paciente.js` (nueva), sobre `sim_srv`, escenario armado con `MOVER_A_CAMA_VACIA`.

| Assert | Hoy | Después |
|---|---|---|
| 1. Anexo sobre turno de A con la cama re-ocupada por B → rechazo `VALIDACION` | ok:true | ok:false |
| 2. `PROC_JSON` de A intacto (copia literal antes/después) | se le mete la ECOGRAFÍA | intacto |
| 3. `PROCEDIMIENTOS` no crece con fila mixta | nace fila `pid=B → ID_EVOLUCION de A` | no crece |
| 4. `TIMELINE` no crece con pid ajeno | nace hito `pid=B` | no crece |
| 5. **Invariante cruzada, corregida:** toda fila de `PROCEDIMIENTOS` cuya `(ID_EVOLUCION, PATIENT_ID)` exista en `EVOLUCIONES ∪ ARCHIVO` debe calzar en pid. **Se empareja por el par, no por la clave sola** — emparejar por `ID_EVOLUCION` produce falso rojo sobre un estado correcto (medido: 2 filas "mixtas" tras alta + re-ingreso legítimo). Y se acompaña de un **conteo total de filas de `PROCEDIMIENTOS` antes/después**, porque la invariante sola también se satisface **por destrucción**. | 1 mixta | 0 mixtas, conteo igual |
| 6. Privacidad: el mensaje no contiene el nombre ni el pid del otro paciente; sí la cama y una instrucción **ejecutable desde la app** | no hay mensaje | cumple |
| 7. **Recuperación real:** el mismo anexo con `patientId` del episodio correcto → ok:true, entra al `PROC_JSON` de quien corresponde, 1 fila, 1 hito, invariante 0. **Reemplaza al assert 7 del diseño 1**, que recetaba un camino destructivo e inejecutable en `sim_srv` | — | ok |
| 8. Egresado corregible: turno archivado de un paciente egresado, anexo con su `patientId` → ok:true y el `PROC_JSON` crece **en `EVOLUCIONES_ARCHIVO`** | ok:false ("la cama no está ocupada" / "primero guarda la evolución") | ok:true |
| 9. **A/B de la fila completa de `CAMAS_ESTADO`** de la cama del ocupante actual, serializada carácter por carácter, **excepto `TIMELINE_JSON`** (el PRD §7.1 lo exime explícitamente) | — | idéntica |
| 10. `hme`/`cultivo` sobre la misma cama en `EN CAMA` siguen funcionando (el candado no bloqueó la función entera) | ok | ok |
| 11. `hme` sobre episodio `CERRADO` → rechazo y `DISP_HME_FECHA` del ocupante actual intacta | escribe | rechaza |
| 12. Clave ambigua **sin** `patientId` → rechazo **y nada tocado**: ni `PROC_JSON` de ninguna de las dos, ni `PROCEDIMIENTOS`, ni `TIMELINE` | escribe a la primera | rechaza limpio |

Asserts que el diseño 1 declaraba "anti-verde-barato" y que **no son construibles por ruta real** (`guardarEvolucion` siempre estampa pid, `ingresarPaciente` siempre genera uuid): se conservan como **fixture declarado a mano en su propia sección**, con el encabezado diciendo que son filas legacy y por qué no se pueden producir operando el sistema. No se disfrazan de ruta real.

---

### PASO 6 — Auditar el rechazo

**Archivo:** `v2/api.gs`, función `_auditar` (`:209-220`).
**Qué hace:** cuando `r.ok === false` y el `codigo` es `VALIDACION`, escribe igual en `AUDIT_LOG` con `accion` sufijada (p. ej. `ANEXAR_EVENTO_RECHAZADO`) y el motivo, tomando `idEntidad` del payload de entrada cuando la respuesta no trae `data`. **Nunca** el nombre del otro paciente en el resumen.
**Guardia:** assert dentro de `evento_paciente.js`: tras el rechazo hay exactamente una fila nueva en `AUDIT_LOG` con el pid del episodio pedido.

---

### PASO 7 — El front manda el episodio

**Archivo:** `v2/index.html`.
- `evAbrir(id, anchor)` (`:9906`) pasa a `evAbrir(id, anchor, pid)`.
- Llamador del Registro Diario (`:12125`): pasa `evoRef.PATIENT_ID` — **ya viene** en `EVOS_DIA` (`svc_evoluciones.gs:826`).
- Llamador de la tarjeta de cama (`:4783`): pasa `c.PATIENT_ID`.
- `evGuardar` (`:9945-9950`) agrega `patientId` al payload.
- El turnoKey se sigue armando con `${v('gDate')||hoy()}-${_evTurno}`: **no se toca**. Que el ➕ pueda anotar en fecha pasada es deliberado y el PRD lo confirma (`O3`, candado por fecha en Tanda 2).

**El servidor debe seguir aceptando payloads sin `patientId`** (API, smoke tests, `mantenimiento_manuel.gs:352`, `build/medir_guardado.js:311`): sin pid resuelve por clave y rechaza si es ambigua.

**Guardia:** `build/checks/evento_paciente_ui.js` (navegador, patrón de `dia_de_egresado_ui.js`): en el Registro Diario de una fecha pasada, el ➕ de una cama con dos episodios ese turno envía el `patientId` de la fila que se está mirando. Verificar en píxeles/estado del payload, no leyendo el DOM a ojo.

---

### PASO 8 — KTM en el servidor, con el alcance que el PRD ya decidió

El PRD **ya cerró** dos de las tres preguntas abiertas del diseño 3, y hay que respetarlo en vez de re-preguntarlas:

- §6 "Agregar": *"si es KTM → mover el TRÍO COMPLETO … realizada ⇒ cantidad ≥ 1 y **nivel obligatorio** … suspendida ⇒ razón obligatoria … no realizada ⇒ razón obligatoria; y de NOCHE no aplica"*.
- §5: *"al **quitar** una KTM hay que vaciar el nivel explícitamente"* — el nivel huérfano se **normaliza**, no se rechaza.

**Reparto crítico que el diseño 3 no hizo:** esas reglas están escritas para **la ruta de corrección del ➕** (Tanda 3), no para el guardado diario. Aplicar "nivel obligatorio" a `validarPayloadEvolucion` **rompe el camino por defecto** (verificado: `limpiarFormulario:4955` y `fillFormReplica:5694` dejan el estado en `'r'` con `fKTMniv` vacío; y `aplicarGatesEval:11497` **borra el nivel** cuando SAS=1). Por eso:

**8.a — `v2/dominio_validacion.gs`: función nueva `validarKTM(d)`**, pura, después de `_rango` (`:56`). Devuelve arreglo de mensajes.

| Regla | ¿Entra en el guardado diario? | Por qué |
|---|---|---|
| **Turno noche**: si algún estado del trío viene verdadero → error | **Sí** | Hoy la regla vive solo en `aplicarGatesEval` (`index.html:11453-11459`); por API o por el ➕ nocturno entra una KTM que la estadística manual nunca tuvo. |
| **Exclusividad**: dos estados verdaderos a la vez → error | **Sí** | Imposible desde la UI (`setKTMstate` es excluyente), alcanzable por API. |
| **`NO_REALIZADA` verdadera sin `NO_RAZON`** → error | **Sí** | Es literalmente la regla de Diego que hoy solo vive en el toast (`index.html:6160`). |
| **`SUSPENDIDA` verdadera sin `CONTRA_RAZON` ni `CONTRA_MANUAL`** → error | **Sí** | Ídem `index.html:6166`. |
| **`REALIZADA` sin nivel 1..5** → error | **NO en el guardado diario. Sí en la ruta del ➕ (Tanda 3)** | Rompería el default `'r'` sin nivel y el caso SAS 1. |
| **Razón/nivel huérfano (cero estados + satélites con contenido)** → error | **NO. Se elimina del alcance** | Bloquearía **toda evolución nocturna** de un paciente con KTM de día (`fillCama:5341` hereda el nivel, la noche no lo limpia, la tarjeta está oculta: sin salida desde la pantalla). |
| **`'' ` vs `false` en `KTM_NO_REALIZADA`** | **NO. Se elimina** | Ningún lector del sistema los distingue (`esVerdadero` los trata igual; `esquemaObjetoAFila` no coacciona por tipo). Rechazar por eso pierde la evolución entera para defender una diferencia que nadie honra. |

**8.b — Normalización, no rechazo** (`v2/svc_evoluciones.gs`, dentro de `guardarEvolucion`, antes del upsert):
- **Nivel huérfano**: si ningún estado del trío es verdadero, se **vacía `KTM_NIVEL_KTR`** (regla del PRD §5). También si `NO_REALIZADA` o `SUSPENDIDA` son verdaderos —hoy `setKTMstate('n')` no limpia `fKTMniv` y la fila guarda un nivel para una KTM que no se hizo.
- **`KTM_CANT`**: se acota a 1..9 con `Math.min(9, Math.max(1, parseInt||1))`, la **misma** fórmula de `dominio_texto.gs:496`. Ojo: hoy **no existe acotado en el guardado** (las tres del servidor son de lectura, la única de escritura está en `index.html:6337`) — el assert "I" del diseño 3 **falla hoy**, contra lo que ese diseño afirmaba. Esto añade una cuarta copia de la fórmula: **extraer un helper compartido** en vez de copiarla.

**8.c — `v2/index.html`: el front deja de inventar.**
- `:6346` — `KTM_NO_REALIZADA` deja de inferirse (`(!cKTMr && !cKTMs)`) y solo es verdadero cuando el botón `bKTMn` está declarado; si no hay estado declarado viaja como `''`.
- Una sola fuente de verdad del trío: una función que lea el estado declarado (`'r'`/`'s'`/`'n'`/nada) y de la que dependan el payload (`:6332-6346`), las dos validaciones (`:6160`, `:6166`) y el riel (`:4842`, `:4843`, `:4855`, `:4856` — son **seis** sitios, no tres). Los hidden `cKTMr`/`cKTMs` (`:3728`) y los botones pueden desalinearse: el botón nace con clase `on` y el hidden con `checked=false`.
- Se quita el escape `offsetParent` de las validaciones: si el estado está declarado, la razón se exige aunque la tarjeta esté plegada. El único camino que esconde la tarjeta con estado puesto es AET IIIC/BNM (`:11480-11490`), que **rellena la razón solo** y por lo tanto pasa.

**Guardia:** `build/checks/ktm_razon_servidor.js` (nueva). **No puede stubear `validarPayloadEvolucion`** — 6 de las 10 guardias de servidor lo hacen, y con ese stub esta se mediría a sí misma para siempre. Primer assert: `validarKTM` existe y es invocable; si no, falla de entrada.

Asserts, corregidos respecto del diseño 3:
1. **Razón obligatoria** (`NO_REALIZADA:true`, razón `''`, turno Día) → rechazo; **contraprueba** con razón puesta → ok. ROJA hoy.
2. **Contraindicada sin razón** → rechazo; contraprueba con `CONTRA_MANUAL` → ok. ROJA hoy.
3. **Noche**: `NO_REALIZADA:true` → rechazo; `REALIZADA:true` → rechazo; los tres vacíos → **ok** (no se testea `''` vs `false`). ROJA hoy.
4. **Exclusividad** → rechazo. ROJA hoy.
5. **Nivel huérfano se normaliza, no se rechaza**: `NO_REALIZADA:true` + razón + `NIVEL_KTR:'3'` → **ok:true** y la fila queda con nivel `''`. ROJA hoy (hoy guarda el nivel fantasma).
6. **Evolución nocturna con nivel heredado y cero estados → ok:true.** Este assert es el que impide que se reintroduzca el paso 5 del diseño original y bloquee la noche. ROJA si alguien lo pone.
7. **Ingreso intacto**: `ES_INGRESO:true`, `NO_REALIZADA:true`, razón `'Motivo ingreso'` → ok. Verde hoy y después. Es el flujo más usado del sistema.
8. **Default de Día intacto**: `REALIZADA:true` con `NIVEL_KTR:''` → **ok:true**. Verde hoy y después. Impide que "nivel obligatorio" se cuele al guardado diario.
9. **`KTM_CANT`** `'0'` → fila con `1`; `'25'` → `9`; ausente → ok. **ROJA hoy** (no existe acotado en escritura).
10. **Turno de Día sin ninguna clave KTM → ok**: lo mandan `cama_limpia.js`, `hitos_unicos.js`, `memo_episodio.js` y `prono_paciente.js`, que **no stubean** la validación.

**Fuera de alcance de esta tanda (se documenta, no se implementa):** el bloqueo del ➕ que envía claves `KTM_*` que ninguna rama procesa. La única llamada del front (`:9953`) no las manda; el candado real de KTM en el ➕ es Tanda 3 y ahí llama a `validarKTM` con el nivel obligatorio activado.

---

### PASO 9 — Coherencia mínima de lectura

Sin esto, la promesa "la corrección no toca a nadie más" y la premisa "la escritura solo se alinea con la lectura" son **falsas**. Alcance mínimo, todo verificado:

| Archivo:línea | Qué está mal | Cambio |
|---|---|---|
| `v2/svc_entrega.gs:38` | `evoTurnoPorCama` compara **solo** `TURNO_KEY`, sin pid. El filtro por pid de `:40` alimenta únicamente `episodioPorCama`. La ficha se arma con `evoTurnoPorCama` (`:76`). | Filtrar también por `cama.PATIENT_ID`, con la misma regla "distinto y no vacío". |
| `v2/svc_entrega.gs:50-57` | `cultivoPorCama` filtra por `ID_CAMA` y regex de `NOMBRE_PROC`, **sin pid**: muestra el último cultivo del paciente anterior. | Filtrar por pid del ocupante. |
| `v2/svc_evoluciones.gs:681-686` | `obtenerEvolucion` resuelve por clave compuesta sin pid y solo en la hoja viva; hidrata el panel del cliente (`index.html:5557` carga su `PROC_JSON`). | Delegar en `_ubicarEvolucionDeTurno`, aceptando `patientId` opcional. |
| `v2/svc_evoluciones.gs:849-931` | `anularEvento` localiza con `obtenerEvolucion` (sin pid) y en `:931` hace `_syncCamaDesdeEvolucion(...)` con datos del **episodio ajeno** sobre el censo del ocupante actual: vía aérea, soporte, modo, fechas de inicio. Escribe **más lejos** que el bug que se está arreglando. | Candado mínimo: si el pid de la evolución no calza con el de la cama, rechazar. **No** se arregla la deuda de `anularEvento` sobre episodios cerrados: eso es `NO3` del PRD. |

**Guardia:** `build/checks/entrega_no_ajena.js` (nueva) + assert en `evento_paciente.js` para `anularEvento`.

---

## 4 · Guardias existentes que se van a poner rojas

| Guardia | Por qué se pone roja | ¿Esperado? |
|---|---|---|
| `eventos.js` | Su stub `repoLeerTodos` ignora el filtro (`:16`), y su assert de "cama desocupada" usa una cama inexistente (`:120`). Además el ➕ cambia de forma. | **Esperado — hay que ARREGLAR LA GUARDIA en la misma entrega.** Es un defecto del arnés, no del diseño. Su §3 (evolución sin `PATIENT_ID`, cama `p9`) **debe seguir verde**: si se pone roja, el candado se pasó de celoso. |
| `eventos_ui.js` | Punto de entrada del ➕, que se amplía (PRD §7). | Esperado — actualizar. |
| `reporte_colega.js` | `:100-115` conduce el DOM real y ya prueba "KTM no realizada sin razón NO se guarda" y "sin contraindicación NO se guarda". El PASO 8.c reescribe justo esos botones/hidden. **Ninguno de los tres diseños la vio**, y el diseño 3 afirmaba que la regla "solo vive en el toast". | Esperado — actualizar el conductor, **conservando los asserts**: son la única prueba en pantalla real de la regla. |
| `afinado.js` (`:133-172`), `regresion_ui.js` (`:78-90`), `texto_manual.js` (`:61-123`), `panel_ux.js`, `sin_guardar.js`, `apache.js` | Llaman `guardar()` con el DOM real; el trío KTM cambia de fuente de verdad. | Esperado — verificar una por una, no silenciar. |
| `rem.js` | `:62-63` monta un fixture con **KTM realizada en turno Noche** (`TURNO_KEY:'2026-07-03-Noche'`, nivel `'4'`, cant `'2'`) y `svc_rem.gs:138` la cuenta sin filtrar turno. La regla nueva de noche la contradice. | **SEÑAL, no rutina.** O la regla de la noche es correcta y el REM lleva tiempo contando sesiones imposibles, o el fixture refleja historia real y la regla bloquea datos verdaderos. **Preguntar a Diego antes de tocar el fixture** (ver decisión 3). |
| `tablero.js` | `:175` monta `KTM_CANT:'12'` a propósito para verificar en `:347` que **el tope se aplica AL LEER**. Acotar al escribir cambia la premisa. | **SEÑAL parcial.** El acotado al escribir es correcto (el front ya lo hace), pero el assert de lectura **debe seguir existiendo**: las filas históricas con `'12'` ya están en la planilla. |
| `integridad.js` | Fija la semántica omitir-vs-vaciar del KTR y recorre invariantes cruzadas. PRD §7 la nombra. | Esperado — revisar. |
| `prono_paciente.js`, `hitos_unicos.js`, `memo_episodio.js`, `cama_limpia.js` | Son las 4 que llaman `guardarEvolucion` **sin stubear** `validarPayloadEvolucion`: corren la regla nueva de verdad. Ninguna manda claves KTM → **deben seguir verdes**. | **Si alguna se pone roja, el diseño está mal**: significa que "cero estados declarados" dejó de ser válido. |
| `dias_estadia.js`, `dias_soporte.js`, `dias_vni.js`, `dispositivos_reglas.js`, `ingreso_noche.js`, `via_aerea_previo.js` | Stubean `validarPayloadEvolucion` → **no verán la regla nueva**. Pueden ponerse rojas por los PASOS 1-3 (identidad, procedimientos, timeline). | Esperado — mirar cada una; y **anotar** que el stub las vuelve ciegas a `validarKTM`. |
| `reparar_ajenas.js`, `limpiar_archiva.js`, `timeline_completa.js` | Tocan archivado y timeline (PASOS 2-3). | Esperado — revisar. |
| `dia_de_egresado.js`, `dia_de_egresado_ui.js` | **Deben seguir verdes.** Fijan que el egresado se ve en el Registro y que una cama tiene dos episodios el mismo turno. | **Si se ponen rojas, el diseño está mal.** |
| `entrega_datos.js`, `columnas.js`, `dia_cero.js` | PRD §7 las nombra para Tanda 3. En Tanda 1 solo `entrega_datos.js` puede moverse (PASO 9). | Revisar. |

**Regla de cierre:** batería completa verde **y** cada guardia nueva vista **fallar** contra el código actual antes de darla por buena (PRD §8). Ninguna guardia nueva se declara buena si su assert principal no se puede ver rojo hoy.

---

## 5 · Lo que NO entra en esta tanda (y hay que decirlo al entregar)

- **El candado por fecha / sesión de coordinación** es Tanda 2. Esta entrega **amplía** lo que se puede tocar sin llave: hoy el ➕ ya escribe en el pasado sin candado, y a partir de aquí también sobre episodios cerrados. Con `AUTH_DEV_MODE=TRUE` cualquiera con el enlace llega al dispatcher.
- **KTR, KTM completa, evaluaciones, cultivos y "quitar"** son Tanda 3. Con el alcance de hoy (solo procedimientos por el ➕) **el REM no se mueve**: `_CAMPOS_INDICADORES` (`svc_indicadores.gs:27-35`) no incluye ningún `PROC_*`, `svc_rem.gs` no menciona `PROC_JSON` ni `PROCEDIMIENTOS`, y `obtenerStats` (`svc_stats.gs:26`) lee **solo la hoja viva**. El único consumidor real del `PROC_JSON` corregido es `obtenerEvosDelDia` y la hoja `PROCEDIMIENTOS` vía `svc_entrega`. **No prometer "llega al REM y al tablero"** — los tres diseños lo prometían y las tres lentes lo refutaron campo por campo.
- **La deuda de `anularEvento`** sobre episodios cerrados: `NO3` del PRD. Se acota con el candado mínimo del PASO 9 y se documenta.
- **La raíz** (`ID_EVOLUCION` sin episodio) queda parcheada por consumidor, no resuelta. Tocarla afecta `svc_evoluciones.gs:27/683`, `svc_camas.gs:308`, `mantenimiento_manuel.gs:343`, `svc_eventos.gs:217` y exige migración en producción.
- **Corregir el texto "64 guardias"** en `build/verificar.js:7` y en la skill `rce-kine` (son 82), y el comentario obsoleto de `svc_evoluciones.gs:787` que cita `_archivarEvolucionesEpisodio`, función que no existe (la real es `_archivarEvolucionesDeCama`).

---

## 6 · Decisiones abiertas para Manuel

1. **La KTM que se borra al re-editar el turno.** `fillForm` (`index.html:5455`) neutraliza el trío y limpia el nivel en **cada** reapertura, y la fusión del servidor no protege claves presentes-en-vacío: un turno con KTM realizada nivel 3 y 2 sesiones queda en nivel `''` y cantidad `''` cuando un colega reabre para corregir la FiO₂. **El PASO 8 no lo arregla** (solo quita la narración falsa "KTM no realizada"). Tres salidas, todas de producto:
   **(a)** que el servidor conserve el trío desde la fila previa cuando el payload no declara ningún estado —igual que ya hace con `ES_INGRESO` (`svc_evoluciones.gs:73`)—;
   **(b)** que `fillForm` reponga el estado guardado en vez de neutralizarlo, lo que contradice el comentario deliberado *"KTM — ACCIÓN DIARIA: siempre parte sin estado seleccionado"*;
   **(c)** hacer obligatorio declarar el estado en cada guardado de Día, como la PVE con TOT — cuarta obligatoria en la pantalla, y **encima de un formulario al que ya se le borró el nivel**, o sea obligando a inventar un número.
   *Recomendación técnica: (a). Es la única que no agrega fricción ni obliga a adivinar. Necesita tu OK porque cambia qué significa "no declarado".*

2. **Evolución con `PATIENT_ID` vacío y cama con pid:** el plan **deja pasar** el anexo (regla copiada de `_mtoRepararAjenas`, para no esconder procedimientos verdaderos de camas reparadas). ¿Se confirma? Y en ese caso, **¿el evento debe estampar el pid del ocupante en esa fila anónima?** Eso sería adoptar en silencio una fila que puede ser del paciente anterior — no lo hago sin autorización.

3. **KTM en turno Noche.** El plan la rechaza en el servidor (regla de Diego, ago-2026, hoy solo en el navegador). Pero `build/checks/rem.js:62-63` monta un fixture con KTM realizada nivel 4 y 2 sesiones **en Noche**, y `svc_rem.gs:138` las cuenta sin filtrar turno. **¿El REM lleva tiempo contando sesiones nocturnas que no debían existir, o hay KTM nocturna legítima en la historia?** De esto depende si el fixture se corrige o si la regla se ablanda.

4. **Clave `CAMA_<n>_<turnoKey>` ambigua y payload sin `patientId`:** el plan **rechaza** pidiendo identificar el episodio. Mientras el PASO 7 no esté desplegado, eso rompe el ➕ en los casos de doble episodio (39 veces en agosto). ¿Se aceptan esos pocos días de rechazo, o se prefiere "manda la viva" —el comportamiento que ya eligió `obtenerEvosDelDia`— hasta que el front mande el pid?

5. **Cuántas filas hay ya corrompidas.** Se puede contar sin tocar nada: filas de `EVOLUCIONES` cuyo `PATIENT_ID` no coincide con el de su cama; turnos de Día con `KTM_NO_REALIZADA` verdadera y razón vacía; filas de `PROCEDIMIENTOS` cuyo pid no calza con el de su evolución. **¿Se cuentan antes de desplegar?** Y si son muchas, ¿se reparan, se marcan como no confiables, o se dejan como registro histórico? El dato original de las que perdieron nivel y sesiones **ya no está en ninguna parte**.