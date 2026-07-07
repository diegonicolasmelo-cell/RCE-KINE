# Informe Técnico — RCE‑KINE (Registro Clínico Electrónico de Kinesiología UCI)

> Documento de auditoría y arquitectura. Elaborado sobre la revisión del código
> backend (Google Apps Script) y frontend (HTML/JS) del proyecto RCE‑KINE.
> **Alcance:** revisión estática, sin ejecución ni modificación del código de la aplicación.
> Tono deliberadamente crítico: el objetivo es servir de asesoría técnica, no de validación.

---

## 1. Qué es la aplicación

RCE‑KINE es un **registro clínico electrónico especializado para el equipo de kinesiología
de una Unidad de Cuidados Intensivos de adultos (UCIA)**. No es una ficha clínica general:
está construido alrededor del flujo de trabajo kinésico en paciente crítico —
ventilación mecánica, vía aérea artificial, movilización temprana (KTM), destete
ventilatorio, evaluación funcional y entrega de turno.

Técnicamente es una **Google Apps Script Web App** que usa un **Google Spreadsheet como
base de datos**. Todo el backend son archivos `.gs` (Apps Script / JavaScript del lado del
servidor) y el frontend es una única página `index.html` servida por `doGet()` mediante
`HtmlService`, que se comunica con el servidor por `google.script.run`.

### Público objetivo
- Kinesiólogos de turno (día/noche) de la UCI.
- Coordinación/jefatura de kinesiología (estadística, REM, tablero de asignación).

### Ámbito clínico cubierto
- Censo de camas (18 camas) con estado ocupada/libre.
- Ingreso, egreso (alta), traslado y limpieza de cama.
- Evolución kinésica por turno (día/noche) con decenas de variables:
  sedación/conciencia (SAS, GCS, S5Q, cooperación), hemodinamia (DVA),
  examen físico respiratorio, configuración y parámetros ventilatorios,
  cálculos respiratorios derivados, KTM/rehabilitación, procedimientos,
  muestras microbiológicas, evaluación funcional de egreso (MRC‑SS, FSS‑ICU,
  dinamometría, PIM/PEM, ecografía diafragmática), test de apnea.
- Generación automática de **texto clínico narrativo** a partir de los datos estructurados.
- Línea de tiempo (timeline) de hitos por episodio de hospitalización.
- Entrega de turno (handoff) imprimible.
- Reporte estadístico mensual **REM** (Registro Estadístico Mensual, exigencia MINSAL Chile).
- Panel de estadísticas e indicadores (extubaciones, tasa de reintubación, KTM por nivel,
  sedación, demografía, outcomes de egreso, hitos motores).
- Tabla dinámica de actividad por kinesiólogo (quién hizo qué).
- Respaldo diario automático a Google Drive con rotación.

---

## 2. Arquitectura

### 2.1 Stack
| Capa | Tecnología |
|------|------------|
| Presentación | HTML + CSS + JavaScript vanilla (una sola página, ~6.600 líneas) |
| Transporte | `google.script.run` (RPC de Apps Script), único endpoint lógico `procesarRequest(accion, datos)` |
| Lógica de negocio | Google Apps Script (V8), 12 archivos `.gs` |
| Persistencia | Google Spreadsheet (una hoja por entidad) |
| Respaldo | Google Drive (copias del Spreadsheet) |
| Concurrencia | `LockService` (script lock, 10 s) |

### 2.2 Módulos backend
| Archivo | Responsabilidad |
|---------|-----------------|
| `00_constantes` | Nombres de hojas y **mapas de columnas** (índices 1‑based) de cada entidad |
| `01_utilidades` | Acceso a hojas, conversión fila↔objeto, fechas, cálculos clínicos (peso ideal, respiratorios), validación de payloads, `conLock` |
| `02_camasyevoluciones` | CRUD principal: camas, ingreso/alta/traslado, guardado y lectura de evoluciones, historial |
| `03_ProcTimelineTextoREM` | Procedimientos, timeline/hitos, **generador de texto clínico**, reporte REM |
| `06_Backup` | Respaldo diario a Drive + rotación + restauración |
| `07_webapp` | `doGet` (sirve el HTML) y **dispatcher** `procesarRequest` (switch de acciones) |
| `08_turnos` | Tablero de asignación cama↔kinesiólogo por turno |
| `09_Setup` | Creación/reparación de la estructura de hojas, normalización de formatos, reinicio |
| `10_importarpacientes` | Carga masiva de pacientes desde hoja "IMPORTAR" |
| `11_Dashboard` | Agregación de estadísticas e indicadores; días ventilatorios históricos |
| `12_entrega` | Armado y guardado de la entrega de turno |
| `13_tabladinamica` | Datos pre‑agregados de actividad por kinesiólogo |

### 2.3 Modelo de datos (hojas)
`CONFIG`, `CAMAS_ESTADO`, `EVOLUCIONES`, `PROCEDIMIENTOS`, `TIMELINE`,
`ARCHIVO_PACIENTES`, `KINESIOTERAPEUTAS`, `ESTADISTICAS_REM`, `TURNOS`,
`REINTUBACIONES`, `ENTREGAS_TURNO`, `IMPORTAR`.

**Claves e identidad:**
- `ID_CAMA` (1–18): identifica la cama, no al paciente.
- `PATIENT_ID` (UUID): identifica el **episodio de hospitalización**. Introducido para
  no mezclar datos de pacientes distintos que ocuparon la misma cama.
- `ID_EVOLUCION` = `CAMA_<idCama>_<turnoKey>`, donde `turnoKey` = `YYYY-MM-DD-Dia|Noche`.
  El orden alfabético del `turnoKey` coincide con el cronológico (propiedad usada para
  "turno previo").

### 2.4 Patrón de concurrencia
Existe una convención explícita y bien intencionada:
funciones públicas del dispatcher envuelven en `conLock()`; internamente solo se llaman
versiones `_interno` **sin** lock, para evitar deadlock por re‑entrada del script lock.
Varios commits del historial son fixes de deadlock siguiendo esta regla.

---

## 3. Flujos de proceso

### 3.1 Instalación / puesta en marcha
```
Abrir Spreadsheet → menú "⚕️ RCE KINE"
  1 · Crear/reparar estructura   → crearEstructuraBD()  (crea hojas, 18 camas, semilla kinés)
  (opcional) 2 · Crear hoja IMPORTAR → pegar pacientes → 3 · Importar
Desplegar como Web App (doGet sirve index.html)
Configurar trigger diario → backupDiario()
```

### 3.2 Ingreso de paciente
```
Usuario abre cama libre → "Ingresar paciente"
  Frontend → gs('INGRESAR_PACIENTE', datos)
  Backend  → validarPayloadIngreso → conLock:
             _actualizarCamaInterno (marca ocupada, genera PATIENT_ID)
             _agregarHitoInterno (hito 'ingreso')
```

### 3.3 Evolución de turno (núcleo del sistema)
```
Abrir panel de cama → (opcional) GET_EVOLUCION_PREVIA replica el turno anterior
Completar formulario (sedación, ventilatorio, KTM, procedimientos, plan, FIRMA)
  Frontend → gs('GUARDAR_EVOLUCION', datos)
  Backend  → validarPayloadEvolucion → conLock:
             calcularRespiratorio (ml/kg, VM, I:E, DP, Cdyn, Tobin, ROX)
             generarTextoEvolucion (narrativa clínica)
             upsert en EVOLUCIONES (por ID_EVOLUCION)
             sincroniza snapshot en CAMAS_ESTADO (texto día/noche, KTR, KTM, proc, firma)
             _guardarProcedimientosInterno  → hoja PROCEDIMIENTOS
             _crearHitosDesdeProcedimientos → hoja TIMELINE (mapeo proc→hito)
             _registrarReintubacion (si corresponde)
```

### 3.4 Egreso / alta
```
"Egreso" → gs('DAR_ALTA', datos)
  Backend → conLock:
            calcula estadísticas del período (KTR, turnos VM/KTM/KTMC)
            escribe fila en ARCHIVO_PACIENTES (con JSON_BACKUP + TIMELINE_JSON)
            _agregarHitoInterno (hito 'egreso')
            _limpiarCamaInternoSinLock (libera la cama)
```

### 3.5 Entrega de turno, estadísticas y REM
```
Entrega  → GET_ENTREGA_TURNO (camas seleccionadas) → ficha imprimible → GUARDAR_ENTREGA_TURNO
Panel    → GET_ESTADISTICAS(desde, hasta) → indicadores agregados
Actividad→ GET_ACTIVIDAD(desde, hasta) → registros pivotables por kinesiólogo
REM      → GENERAR_REM(anio, mes) → texto REM + fila en ESTADISTICAS_REM
```

---

## 4. Casos de uso

1. **Kinesiólogo de turno** registra la evolución de cada paciente asignado; el sistema
   genera automáticamente el texto clínico para copiar a la ficha oficial.
2. **Replicación de turno**: al abrir un nuevo turno, se precarga el estado del turno anterior
   y solo se modifica lo que cambió (reduce tiempo de registro).
3. **Entrega de turno**: se genera un handoff imprimible con estado ventilatorio, sedación,
   pendientes funcionales (MRC‑SS/FSS en cooperadores) y últimos hitos.
4. **Coordinación** revisa indicadores del mes: tasa de reintubación, KTM por nivel,
   días de VM, hitos motores, outcomes de egreso.
5. **Estadística oficial**: generación del REM mensual para MINSAL.
6. **Auditoría de actividad**: tabla dinámica "quién realizó más TQT / cultivos / extubaciones".
7. **Trazabilidad del episodio**: timeline de hitos por `PATIENT_ID` con gráficos de tendencia
   (parámetros ventilatorios, Barthel, GCS, etc.).
8. **Continuidad**: respaldo diario automático a Drive con 30 copias rotativas.

---

## 5. Capacidades potenciales (lo que *podría* alcanzar)

- **Indicadores UPP/UCI en tiempo real** (ya tiene los datos): días VM promedio, densidad de
  incidencia de reintubación, cumplimiento de movilización temprana, "sedation vacation".
- **Alertas clínicas** derivadas de reglas ya calculables (p. ej. VT > 8 ml/kg PI sostenido,
  índice de Tobin de destete, ROX de fracaso de CNAF).
- **Exportación estructurada** (FHIR / CSV / HL7) hacia la ficha institucional.
- **Panel de calidad** comparando turnos, kinesiólogos y periodos.
- **Predicción de destete/extubación** con los históricos acumulados por episodio.
- **Integración con identidad institucional** (SSO) para auditoría real por usuario.

Todo esto es *alcanzable* con la base de datos actual, pero está **limitado por la
arquitectura de persistencia (Spreadsheet)** y por la ausencia de identidad/seguridad reales
(ver hallazgos).

---

## 6. Hallazgos de la auditoría (fallas, falencias y riesgos)

Clasificación: **[C]** crítico · **[A]** alto · **[M]** medio · **[B]** bajo/cosmético.

### 6.1 Correctitud / integridad de datos

- **[C] Desajuste de columnas entre `00_constantes` y `09_Setup`.**
  `EVO_TOTAL_COLS = 132` y `CAM_TOTAL_COLS = 41`, pero `crearEstructuraBD()` crea la hoja
  EVOLUCIONES con **119** columnas y CAMAS_ESTADO con **40**. Además la migración de ancho
  solo garantiza `need = 40` para CAMAS (no 41) y **no migra EVOLUCIONES en absoluto**.
  Consecuencia: en una instalación/reparación limpia, cualquier lectura
  `getRange(fila, 1, 1, 41/132)` sobre una hoja más angosta lanza excepción, y las columnas
  `PATIENT_ID`, `REINTUB_*`, `APNEA_*`, `EVAL_*`, `EVO_UPOT` quedan sin encabezado. Toda la
  funcionalidad de `PATIENT_ID` (identidad de episodio) depende de que la hoja ya tenga esas
  columnas creadas manualmente. Es el hallazgo de mayor riesgo estructural.

- **[C] Contaminación de datos entre pacientes por clave `ID_CAMA`.**
  `EVOLUCIONES`, `PROCEDIMIENTOS` y `TIMELINE` nunca se purgan al dar de alta; conservan
  filas del paciente anterior en la misma cama. Varias funciones agregan/leen por `ID_CAMA`
  **sin filtrar por `PATIENT_ID`**:
  - `darAltaPaciente()` calcula KTR/turnos VM/KTM del egresado con
    `_obtenerEvolucionesIdCama(idCama)` → incluye turnos del paciente previo.
  - `_evalFuncionalPorCama()` toma la última MRC‑SS/FSS/cooperación por cama sin distinguir
    episodio → puede mostrar valores de otro paciente.
  `obtenerHistorialPaciente()` sí filtra por `PATIENT_ID`, lo que evidencia que el resto
  debería hacerlo y no lo hace de forma consistente.

- **[A] Dos rutas de ingreso generan `PATIENT_ID` distintos.**
  `ingresarPaciente()` genera un UUID y crea un hito 'ingreso'. Si además se guarda la primera
  evolución con `ES_INGRESO=true`, `guardarEvolucion()` **genera otro UUID** y lo sobreescribe
  en la cama, más un segundo hito 'ingreso'. Resultado: hitos/evoluciones del mismo episodio
  quedan bajo UUIDs diferentes → el historial por `PATIENT_ID` se fragmenta y puede duplicarse
  el hito de ingreso.

- **[A] El traslado de cama rompe el historial.**
  `trasladarPaciente()` intercambia solo el snapshot en `CAMAS_ESTADO` (incluido `PATIENT_ID`),
  pero **no** reasigna las filas históricas de `EVOLUCIONES`/`PROCEDIMIENTOS`/`TIMELINE`, que
  siguen apuntando al `ID_CAMA` original. Como `obtenerHistorialPaciente()` primero lee por
  `ID_CAMA` y luego filtra por `PATIENT_ID`, tras un traslado el paciente pierde acceso a su
  propia historia (la cama nueva no contiene sus evoluciones).

- **[A] `generarREM` cuenta ingresos con doble conteo.**
  `totalIngresos = camasUnicas.size + archMes.length`. Un paciente ingresado y egresado en el
  mismo mes aparece en ambos términos → se cuenta dos veces. Además `camasUnicas` cuenta por
  `ID_CAMA`, no por paciente: dos pacientes distintos en la misma cama en el mes cuentan como
  uno. Para un reporte oficial (REM MINSAL) es un error estadístico relevante.

- **[M] Pacientes importados nunca reciben `PATIENT_ID`.**
  `importarPacientesActuales()` escribe la cama sin asignar UUID de episodio. Todos los
  pacientes cargados masivamente caen a la ruta "legado por `ID_CAMA`", reintroduciendo la
  contaminación entre pacientes.

- **[M] Censo estadístico por RUT con colapso por cama.**
  En `obtenerEstadisticas`, pacientes sin RUT se agrupan por `('cama_'+idCama)`; dos pacientes
  sin RUT en la misma cama en el rango se fusionan en uno, distorsionando demografía y patologías.

- **[B] Mensajes/comentarios desactualizados** ("9 hojas" vs 10 reales, "31"/"40" en
  comentarios de CAMAS, "18 camas" hardcodeadas). Ruido que induce a error al mantener.

### 6.2 Seguridad y cumplimiento (dato sensible de salud)

- **[C] No hay autenticación ni autorización de aplicación.**
  El acceso depende exclusivamente de la configuración de despliegue de la Web App de Google.
  No existe control de roles ni verificación de identidad dentro de la app. Se manejan datos
  personales sensibles (nombre, RUT, edad, diagnóstico) sujetos en Chile a la Ley 19.628 /
  Ley 21.096 y a normativa de ficha clínica. Falta base legal técnica: control de acceso,
  registro de auditoría y minimización.

- **[A] La "firma del kinesiólogo" no es identidad.**
  `PLAN_FIRMA_KINE` es un valor **auto‑seleccionado** de un desplegable. No hay ninguna
  garantía de que quien firma sea quien registró. Para un registro clínico, la trazabilidad
  de autoría es un requisito, no un adorno. `Session.getActiveUser()` no se usa.

- **[A] XSS almacenado por `innerHTML` sin escape.**
  Datos libres del paciente (`NOMBRE`, `RUT`, `DIAGNOSTICO`, notas, planes) se insertan
  directamente en plantillas `innerHTML` (p. ej. tarjeta de cama, tablas, timeline) sin
  sanitización. Un diagnóstico o nombre con contenido tipo `<img src=x onerror=…>` se
  ejecutaría en el navegador de todo el equipo. Hay ~91 usos de `innerHTML` en el frontend.

- **[M] `setXFrameOptionsMode(ALLOWALL)`** permite embeber la app en cualquier iframe
  (clickjacking). Salvo que exista un requisito concreto de incrustación, debería restringirse.

- **[B] `JSON_BACKUP`/`SNAPSHOT` se excluyen del cliente en algunas rutas pero se exponen
  completos en `obtenerArchivoDetalle`.** Revisar qué necesita realmente el frontend.

### 6.3 Concurrencia y robustez

- **[M] `conLock` con timeout de 10 s y operaciones largas dentro del lock.**
  `guardarEvolucion` ejecuta muchísimas operaciones de hoja **dentro** del lock (upsert evo,
  sync cama, procedimientos, hitos, reintubación, flush). Con ~15 kinesiólogos en turno, la
  contención puede provocar `waitLock` fallidos. Si `waitLock` expira, lanza excepción que
  **no** queda envuelta en el formato `{ok,error}` y sube como fallo genérico al cliente.

- **[M] Lecturas redundantes de la misma fila dentro de una operación.**
  En un solo `guardarEvolucion` se lee la cama vía `obtenerCama` (buscarFila + getValues),
  luego `_actualizarCamaInterno` (otro buscarFila + read/write) y cada hito hace otro
  `obtenerCama` interno. Es correcto pero derrochador.

- **[B] Fallback offline muestra datos mock.** Si el puente `google.script.run` no existe, el
  panel de estadísticas rellena con `DASH_MOCK`. En producción, un fallo de bridge podría
  mostrar cifras ficticias sin alerta clara.

### 6.4 Escalabilidad y rendimiento

- **[A] Modelo de persistencia no escala.** `EVOLUCIONES` crece sin límite (nunca se archiva
  ni particiona) y varias funciones (`obtenerDashboardInit`, `obtenerEstadisticas`,
  `obtenerActividad`, `generarREM`) **leen la hoja completa** (todas las filas × 132 columnas)
  en cada invocación y filtran en memoria. A meses/años de operación esto degrada la latencia
  de arranque del panel y roza las cuotas de Apps Script. Hay buenas optimizaciones puntuales
  (lecturas en bloque, batch writes) pero el problema es el modelo, no la micro‑optimización.

- **[M] Fragilidad "fecha como texto".** Toda la app almacena fechas como string ISO y compara
  por string, dependiendo de `setNumberFormat('@')`. Cualquier edición manual del Spreadsheet,
  cambio de formato o columna corrida rompe silenciosamente comparaciones (el propio código
  documenta que este fue el origen del bug "Tipo TQT como fecha").

### 6.5 Mantenibilidad y gestión del repositorio

- **[A] El repositorio no es apto para control de versiones de GAS.**
  - Los archivos backend están como `*.gs.txt` y, peor aún, los nombres contienen un
    **carácter Unicode invisible (U+E5D4)** entre `.gs` y `.txt` — rompe globbing y herramientas
    (`*.gs.txt` no expande). Son exports/pegados manuales, no un proyecto gestionado con `clasp`.
  - No hay `.clasp.json` ni `appsscript.json` → no hay despliegue reproducible.
  - Conviven **múltiples HTML gigantes casi duplicados** (`index (12).html`,
    `index-2col-test.html`, `index-clean-test.html`, `index-tags-test.html`, `SmartEvoGen.html`,
    `Informe.html.txt`) sumando ~1,6 MB de código muerto/experimental. No está claro cuál es la
    fuente de verdad de `index`.
  - `README.md` de 2 líneas, sin licencia, sin documentación, sin `.gitignore`.

- **[M] Frontend monolítico** (~6.600 líneas en un archivo, lógica + estilos + plantillas HTML
  embebidas). Difícil de testear y de mantener; sin ninguna prueba automatizada en todo el repo.

- **[M] Un solo endpoint `procesarRequest` con `switch` gigante** concentra el ruteo; sin
  validación de esquema homogénea por acción ni tipos.

- **[B] Deprecaciones y micro‑detalles:** `String.prototype.substr` (obsoleto) en generadores
  de ID; rama muerta `if (via === 'Natural') via = 'Natural';` en `_parseViaSop`; IDs basados
  en `Date.now()+random` (colisión improbable pero no garantizada bajo alta concurrencia).

---

## 7. Recomendaciones priorizadas

**Ahora (bloqueantes / integridad):**
1. Unificar la definición de columnas: que `09_Setup` derive los encabezados desde los mapas
   de `00_constantes` (una sola fuente de verdad) y migre ancho a `EVO_TOTAL_COLS`/`CAM_TOTAL_COLS`.
2. Filtrar **todas** las agregaciones por `PATIENT_ID` (alta, evaluación funcional, días
   ventilatorios), no por `ID_CAMA`. Asignar `PATIENT_ID` también en la importación.
3. Unificar la generación de `PATIENT_ID` en una sola ruta de ingreso (evitar doble UUID/hito).
4. Corregir el conteo de ingresos del REM (contar episodios únicos, sin sumar activos + archivo).
5. Rediseñar `trasladarPaciente` para reasignar filas históricas o para modelar el traslado
   como evento del mismo episodio.

**Pronto (seguridad):**
6. Escapar toda inserción de datos de paciente en `innerHTML` (helper `escapeHtml` o
   `textContent`/nodos).
7. Registrar identidad real (`Session.getActiveUser().getEmail()`) para autoría/auditoría, y
   definir control de acceso acorde a normativa de datos de salud.
8. Restringir `XFrameOptionsMode` salvo necesidad de embebido.

**Después (arquitectura / mantenibilidad):**
9. Gestionar el proyecto con `clasp` (+`appsscript.json`); eliminar los HTML de prueba
   duplicados y renombrar los `.gs.txt` (quitar el carácter invisible).
10. Plan de archivado/particionado de `EVOLUCIONES` (por año o por episodio cerrado) para
    acotar el crecimiento y el costo de las lecturas completas.
11. Añadir pruebas (al menos de `calcularRespiratorio`, `generarTextoEvolucion`, `generarREM`
    y las validaciones) y documentar el contrato de cada acción del dispatcher.

---

## 8. Balance

El proyecto es funcionalmente ambicioso y está claramente escrito por alguien con dominio del
dominio clínico: la modelación kinésica (KTM, destete, ventilatorio, evaluación funcional) es
rica y el generador de texto clínico es un acierto real de producto. También hay señales de
madurez en el manejo de concurrencia (patrón `_interno` sin lock) y en optimizaciones de I/O.

Sin embargo, **como sistema de información clínica tiene deudas serias en tres ejes**:
integridad de datos entre pacientes/episodios, seguridad/cumplimiento sobre datos sensibles,
y una base de persistencia (Spreadsheet) y de repositorio que no sostienen crecimiento ni
operación multiusuario a largo plazo. Los hallazgos **[C]** deberían resolverse antes de
considerar la aplicación confiable para el registro clínico oficial.
