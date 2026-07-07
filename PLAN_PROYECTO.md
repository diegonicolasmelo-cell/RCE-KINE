# Plan Maestro de Proyecto — RCE‑KINE v2 (reconstrucción)

> **Propósito.** Plan de proyecto detallado para reconstruir RCE‑KINE de forma limpia,
> con todas las correcciones y mejoras de la auditoría integradas **desde el diseño**,
> no por goteo. La app sigue siendo **Google Apps Script + Google Sheets como base de datos**.
>
> **Método de trabajo.** Cerramos el plan sobre el papel (este documento) → decidimos los
> puntos abiertos (§14) → recién entonces se construye por fases (§12). Cada sección es
> revisable y ajustable de forma independiente.
>
> **Documentos relacionados:** `INFORME_TECNICO.md` (auditoría del sistema actual),
> `PLAN_MODALES.md` (capa de modales), `SOBRE_LA_APP.md` (descripción funcional).

---

## 0. Índice
1. Objetivos y alcance
2. Principios de diseño (no negociables)
3. Arquitectura objetivo
4. Modelo de datos (fuente única de verdad)
5. Identidad de paciente y episodio
6. Capa de acceso a datos (repositorios)
7. Contrato del dispatcher (API interna)
8. Módulos backend
9. Frontend: sistema de UI y modales
10. Seguridad, privacidad y auditoría
11. Estadística, REM y calidad de datos
12. Fases, hitos y entregables
13. Pruebas, despliegue y operación
14. Decisiones abiertas (requieren tu feedback)
15. Registro de cambios respecto al sistema actual

---

## 1. Objetivos y alcance

### 1.1 Objetivo
Registro clínico electrónico kinésico para UCI de adultos, multiusuario, con integridad de
datos por episodio, trazabilidad de autoría real, y estadística confiable (REM incluido).

### 1.2 Dentro de alcance
- Censo de camas, ingreso/egreso/traslado.
- Evolución por turno (día/noche) con todo el modelo clínico actual.
- Texto clínico autogenerado.
- Timeline de hitos por episodio.
- Entrega de turno imprimible.
- Estadísticas, tabla dinámica de actividad y REM mensual.
- Respaldo automático a Drive.
- Importación masiva de pacientes.

### 1.3 Fuera de alcance (por ahora)
- Migrar fuera de Sheets/Apps Script.
- Integración HL7/FHIR con la ficha institucional (se deja como capacidad futura, §15).
- App móvil nativa (la web responsive cubre el caso).

### 1.4 Restricciones fijas
- Plataforma: Apps Script (V8) + Google Sheets + Google Drive.
- Zona horaria: `America/Santiago`.
- Sin dependencias externas de red en el frontend (todo autocontenido).

---

## 2. Principios de diseño (no negociables)

1. **Fuente única de verdad para el esquema.** Las columnas de cada hoja se definen **una
   sola vez** (en `esquema.gs`) y de ahí se derivan: creación de hojas, encabezados, lectura,
   escritura y migración. Se elimina la posibilidad de desajuste 119≠132 / 40≠41 del sistema actual.
2. **Identidad por episodio.** Todo dato clínico se ancla a un `PATIENT_ID` (episodio), nunca
   solo a la cama. Ninguna agregación filtra por `ID_CAMA` a secas.
3. **Nada de datos sin escapar en la UI.** Todo valor de paciente se inserta con `escapeHtml()`
   o vía nodos DOM. Cero `innerHTML` crudo con datos de usuario.
4. **Identidad real para autoría.** Se registra `Session.getActiveUser().getEmail()` además de
   la firma clínica; la firma deja de ser la única "prueba" de autoría.
5. **Escrituras idempotentes y con lock acotado.** Operaciones cortas dentro del lock; validación
   siempre antes del lock; toda respuesta en formato `{ok, data|error}`.
6. **Crecimiento acotado.** Estrategia de archivado/particionado de EVOLUCIONES desde el día 1.
7. **Testable.** Lógica pura (cálculos, texto, REM, validación) separada de I/O de Sheets, con
   pruebas automatizadas.
8. **Repo gestionable.** Proyecto con `clasp` + `appsscript.json`, sin archivos muertos ni
   nombres con caracteres invisibles.

---

## 3. Arquitectura objetivo

```
┌─────────────────────────────────────────────┐
│  Frontend (HtmlService)                       │
│  index.html + módulos JS por responsabilidad  │
│  · core/ (bridge gs, modal manager, escape)   │
│  · views/ (grid, tabla, dashboard, entrega…)  │
│  · modals/ (evolucion, egreso, historial…)    │
└───────────────┬───────────────────────────────┘
                │ google.script.run → api(accion, datos)
┌───────────────▼───────────────────────────────┐
│  Backend (Apps Script)                         │
│  api.gs         → router + validación + auth   │
│  servicios/*    → lógica de negocio            │
│  repos/*        → acceso a Sheets (CRUD)       │
│  dominio/*      → cálculos puros, texto, REM   │
│  esquema.gs     → definición única de columnas │
│  infra/*        → lock, fechas, respuesta, log │
└───────────────┬───────────────────────────────┘
                │
        Google Sheets (BD)  +  Google Drive (backup)
```

**Capas y regla de dependencia:** `api → servicios → repos → Sheets`. `dominio/*` es puro (sin
Sheets) y lo consumen los servicios. Nada salta capas (la UI nunca toca repos directamente).

---

## 4. Modelo de datos (fuente única de verdad)

### 4.1 Definición
En `esquema.gs` cada hoja se define como lista ordenada de columnas con nombre y tipo:

```
ESQUEMA = {
  CAMAS_ESTADO: { headerRows: 2, cols: [ {k:'ID_CAMA', t:'texto'}, ... ] },
  EVOLUCIONES:  { headerRows: 3, cols: [ ... ] },
  ...
}
```
De aquí se generan automáticamente: `COL.<HOJA>.<CAMPO>` (índice 1‑based), el total de columnas,
los encabezados y la migración de ancho. **Se prohíbe** hardcodear índices o totales en otro lado.

### 4.2 Hojas
| Hoja | Rol | Clave |
|------|-----|-------|
| `CONFIG` | Parámetros (nº camas, timezone, último backup) | CLAVE |
| `CAMAS_ESTADO` | Censo/estado actual de cada cama | ID_CAMA |
| `EVOLUCIONES` | Un registro por turno | ID_EVOLUCION + PATIENT_ID |
| `PROCEDIMIENTOS` | Procedimientos por evolución | ID_PROC → ID_EVOLUCION |
| `TIMELINE` | Hitos del episodio | ID_HITO → PATIENT_ID |
| `ARCHIVO_PACIENTES` | Episodios egresados (snapshot) | ID_ARCHIVO + PATIENT_ID |
| `KINESIOTERAPEUTAS` | Catálogo de firmas/usuarios + `EMAIL` (mapeo firma↔identidad GIS) | FIRMA |
| `ESTADISTICAS_REM` | REM mensual consolidado | MES |
| `TURNOS` | Asignación cama↔kine por turno | KEY |
| `REINTUBACIONES` | Eventos de reintubación | ID_REINTUB |
| `ENTREGAS_TURNO` | Historial de handoffs | ID |
| `IMPORTAR` | Staging de carga masiva | — |
| `AUDIT_LOG` *(nuevo)* | Bitácora de acciones (quién/qué/cuándo) | ID |
| `EVOLUCIONES_ARCHIVO` *(nuevo)* | Partición histórica de evoluciones cerradas | ID_EVOLUCION |

### 4.3 Cambios de esquema respecto al actual
- **`PATIENT_ID` presente y poblado en todas las hojas clínicas desde el ingreso** (no como columna añadida al final que puede faltar).
- **Encabezados nombrados para el 100% de las columnas** (se elimina el rango 120–132 sin nombre).
- **`AUDIT_LOG`**: `id, timestamp, usuarioEmail, firma, accion, entidad, idEntidad, resumen`.
- **`EVOLUCIONES_ARCHIVO`**: destino de evoluciones de episodios ya egresados (ver §11.3).
- `CONFIG.NUM_CAMAS` para no hardcodear "18".

---

## 5. Identidad de paciente y episodio

**Problema que resuelve:** en el sistema actual los datos se contaminan entre pacientes que
ocupan la misma cama, y hay dos rutas de ingreso que generan `PATIENT_ID` distintos.

**Reglas v2:**
1. `PATIENT_ID` (UUID) se genera **una sola vez**, en el servicio de ingreso, sin importar si el
   ingreso viene del botón "Ingresar" o de la primera evolución. Ruta única.
2. La cama guarda el `PATIENT_ID` activo; toda evolución/hito/procedimiento hereda ese valor.
3. **Todas** las lecturas y agregaciones (historial, evaluación funcional, días ventilatorios,
   estadísticas de egreso, REM) filtran por `PATIENT_ID`, nunca por `ID_CAMA` a secas.
4. **Traslado de cama** = evento del mismo episodio: se registra un hito y el `PATIENT_ID` se
   mueve con el paciente; las filas históricas se consultan por `PATIENT_ID`, por lo que el
   traslado ya no rompe el historial. (Ver decisión §14‑D3 sobre reasignar `ID_CAMA` histórico.)
5. **Importación masiva** asigna `PATIENT_ID` a cada paciente cargado.
6. **Autoría por acción:** cada evolución/hito/egreso guarda la identidad del autor (según D1b)
   además de la firma clínica, y queda espejada en `AUDIT_LOG`.

---

## 6. Capa de acceso a datos (repositorios)

Un repositorio por hoja, con API uniforme y **una** lectura en bloque:

```
Repo(hoja) → {
  leerTodos(filtro?)   // 1 getValues, filtra en memoria, devuelve objetos
  buscarPorId(id)
  insertar(obj)
  actualizar(id, campos)   // lee fila, muta, 1 setValues (batch)
  eliminar(id)
}
```
- Conversión fila↔objeto centralizada y basada en `ESQUEMA` (fechas → ISO, tipos consistentes).
- Sin patrón N+1: se elimina el `getRange` por fila.
- Escrituras siempre batch (un `setValues`).

---

## 7. Contrato del dispatcher (API interna)

Punto único `api(accion, datos, token)` con:
- **Verificación de identidad** (valida el ID token de GIS vía `infra_auth.gs`; sin token válido
  se rechazan las escrituras).
- **Validación por acción** (un validador declarativo por cada acción).
- **Autorización** (¿el usuario/firma puede ejecutar esta acción?).
- **Registro en `AUDIT_LOG`** de toda acción de escritura.
- **Respuesta uniforme** `{ok, data}` / `{ok:false, error, codigo}`.

### 7.1 Catálogo de acciones (heredado + corregido)
Lectura: `GET_DASHBOARD_INIT`, `GET_CAMA`, `GET_EVOLUCION`, `GET_EVOLUCION_PREVIA`,
`GET_EVOLUCIONES_HOY`, `GET_HISTORIAL_PACIENTE`, `GET_PROCEDIMIENTOS`, `GET_TIMELINE`,
`GET_ARCHIVOS`, `GET_ARCHIVO_DETALLE`, `GET_ESTADISTICAS`, `GET_ACTIVIDAD`, `GET_DIAS_VENT`,
`GET_ASIGNACION_TURNO`, `GET_ENTREGA_TURNO`, `GET_ENTREGAS_TURNO`, `GET_FECHA_HOY`.
Escritura: `INGRESAR_PACIENTE`, `GUARDAR_EVOLUCION`, `DAR_ALTA`, `LIMPIAR_CAMA`,
`TRASLADAR_PACIENTE`, `AGREGAR_HITO`, `SET_ASIGNACION_TURNO`, `GUARDAR_ENTREGA_TURNO`,
`GENERAR_REM`.
> Se congela el catálogo en el plan; cada acción tendrá su ficha (entrada/salida/validación/permiso).

---

## 8. Módulos backend

| Módulo | Contenido |
|--------|-----------|
| `esquema.gs` | Definición única de hojas/columnas + generadores |
| `infra_respuesta.gs` | `ok`/`err`, códigos de error |
| `infra_fechas.gs` | ISO, timestamp, `calcularDias` (todo en TZ Santiago) |
| `infra_lock.gs` | `conLock` con timeout y manejo de `waitLock` envuelto en `err` |
| `infra_log.gs` | `AUDIT_LOG` |
| `repos/*.gs` | Un repositorio por hoja |
| `dominio_calculos.gs` | Peso ideal, respiratorios (ml/kg, VM, I:E, DP, Cdyn, Tobin, ROX) — **puro** |
| `dominio_texto.gs` | `generarTextoEvolucion` — **puro**. Se **porta el generador actual sin grandes cambios** (D8); solo se aísla como función testeable. La estética/salida de la evolución se conserva. |
| `dominio_rem.gs` | Cálculo REM (conteo de episodios único, sin doble conteo) — **puro** |
| `dominio_validacion.gs` | Validadores de payload — **puro** |
| `svc_camas.gs` | Ingreso/alta/traslado/limpieza |
| `svc_evoluciones.gs` | Guardar/leer evoluciones, historial, replicación |
| `svc_procedimientos.gs` | Procedimientos + hitos automáticos |
| `svc_timeline.gs` | Hitos, sincronización cache |
| `svc_entrega.gs` | Handoff |
| `svc_estadisticas.gs` | Dashboard + actividad + días ventilatorios |
| `svc_backup.gs` | Respaldo Drive + rotación |
| `svc_setup.gs` | Crear/reparar estructura desde `esquema.gs`, importar, normalizar |
| `infra_auth.gs` | Verifica el ID token de GIS (JWT: firma, `aud`, `exp`), resuelve email→firma vía `KINESIOTERAPEUTAS` |
| `api.gs` | `doGet`, router `api`, **verificación de token por request**, autorización, auditoría |

---

## 9. Frontend: sistema de UI y modales

### 9.1 Infraestructura común (nueva)
- `core/auth.js` — Google Identity Services: renderiza el Sign‑In, guarda el ID token y lo adjunta
  a cada llamada; gestiona expiración/re‑login. Bloquea la app hasta que haya sesión válida.
- `core/bridge.js` — `gs(accion, datos)` que devuelve Promise (adiós callbacks anidados) y adjunta
  el ID token de `core/auth.js` en cada request.
- `core/escape.js` — `escapeHtml()` / `h\`\`` (template tag que escapa) usado en **toda** inserción.
- `core/modal.js` — `abrirModal(id)`, `cerrarModal(id)`: backdrop único, cierre por Escape,
  `aria-modal`, *focus trap*, retorno de foco. **Todos** los modales lo usan (incluido reintubación).
- `core/estado.js` — estado encapsulado por modal (fin de globales sueltas).

### 9.2 Especificación por modal
Cada modal se implementa como módulo con `abrir/cerrar/render/guardar` y su propio estado.
Detalle de fuerte/malo y mejoras en `PLAN_MODALES.md`. Mejoras clave integradas:
1. **Evolución (SmartEvo):** partido en sub‑componentes (ventilatorio, sedación, KTM, procedimientos,
   evaluación funcional, vía aérea). **Autosave/borrador local** (localStorage por cama+turno) para
   no perder el turno. Minimizar preserva el borrador real, no solo una etiqueta.
2. **Egreso:** envía **todos** los campos de outcome (FSS, MRC‑SS, apnea, extubación, reintubación) y
   prellena con la última evaluación registrada.
3. **Historial:** recibe `patientId` explícito; gráficos con accesibilidad básica.
4. **Detalle archivado:** no expone `JSON_BACKUP` completo; exportación a PDF/impresión.
5. **Reintubación:** normalizado al `core/modal.js`.

### 9.3 Vistas (pestañas)
General (grid), Pacientes (tabla), Estadísticas (dashboard+pivot), Entrega, Archivados, REM.
Cada una como módulo de vista; sin datos mock en producción (los fallbacks muestran error claro,
no cifras ficticias).

---

## 10. Seguridad, privacidad y auditoría

Datos personales sensibles de salud (Ley 19.628 / 21.096, normativa de ficha clínica).
- **Cuentas personales (D1):** el acceso es con Gmail personal, por lo que
  `Session.getActiveUser().getEmail()` **no es fiable** y NO se usa como fuente de identidad.
- **Identidad real (D1b → Google Sign‑In):** login GIS en el frontend → ID token (JWT) con email
  verificado. **Todo request de escritura viaja con el token**; el backend lo verifica (firma del
  JWT + `aud` = OAuth Client ID propio + `exp` vigente) antes de actuar. El email verificado se
  escribe en cada acción → `AUDIT_LOG`.
- **Autoría (D2):** la firma clínica queda **ligada** al email verificado vía la columna `EMAIL` de
  `KINESIOTERAPEUTAS`. Un usuario solo puede firmar con la(s) firma(s) asociadas a su email; se
  rechaza firmar como otro.
- **XSS:** `escapeHtml` obligatorio en toda la UI.
- **Clickjacking:** `XFrameOptionsMode` restringido salvo requisito explícito de embebido.
- **Minimización:** el cliente recibe solo los campos que necesita (no `JSON_BACKUP` completo).
- **Backups:** copias en Drive con acceso restringido; política de retención definida en `CONFIG`.

---

## 11. Estadística, REM y calidad de datos

### 11.1 REM
- Contar **episodios únicos** por `PATIENT_ID` (fin del doble conteo activos+archivo).
- Fórmulas puras y testeadas en `dominio_rem.gs`.

### 11.2 Estadísticas
- Censo por `PATIENT_ID` (no por RUT con fallback a cama).
- Días ventilatorios, evaluación funcional y outcomes filtrados por episodio.

### 11.3 Crecimiento acotado
- Al egresar, las evoluciones del episodio se mueven a `EVOLUCIONES_ARCHIVO` (partición).
- El dashboard opera sobre la partición "activa" + consultas puntuales al archivo por rango.
- Objetivo: que la carga del panel no dependa del histórico total.

---

## 12. Fases, hitos y entregables

> Cada fase termina en algo demostrable. No se pasa de fase sin revisión.

| Fase | Nombre | Entregable | Criterio de "listo" |
|------|--------|-----------|---------------------|
| **F0** | Cierre del plan | Este documento aprobado + decisiones §14 resueltas | Acuerdo explícito |
| **F1** | Fundaciones + spike auth | `esquema.gs`, repos, infra (lock/fechas/respuesta/log), `clasp`, **GCP+OAuth Client**, **spike GIS dentro del iframe** | Estructura creada desde esquema; tests de repos verdes; **GIS confirmado funcionando en el iframe (o decidido el fallback popup)** |
| **F2** | Dominio puro | Cálculos, texto, REM, validación con tests | Cobertura de casos clínicos clave |
| **F3** | Servicios + API + auth | Ingreso/evolución/alta/traslado + router + **verificación de token** + auditoría | Flujo completo por API rechazando requests sin token válido |
| **F4** | Frontend base + login | `core/*` (auth, bridge, escape, modal), grid, tabla | Login GIS obligatorio; navegación y censo funcionando con identidad real |
| **F5** | Modal Evolución | SmartEvo modular + autosave | Registrar un turno completo con replicación |
| **F6** | Egreso + Historial + Archivados | 3 modales | Outcome completo en ARCHIVO; historial por episodio |
| **F7** | Entrega + Estadísticas + REM | Vistas + pivot + REM | REM sin doble conteo; handoff imprimible |
| **F8** | Backup + Importar | Respaldo Drive + carga masiva (arranque limpio, sin migración — D6) | Importar asigna `PATIENT_ID`; backup diario operativo |
| **F9** | Endurecimiento | Seguridad, accesibilidad, auditoría, pruebas de carga | Checklist §10 cumplido |

---

## 13. Pruebas, despliegue y operación

- **Pruebas unitarias** del dominio puro (ejecutables en Apps Script con un runner simple o
  `clasp run`), fixtures de evoluciones representativas.
- **Pruebas de integración** por acción del dispatcher (payload → efecto en hojas de prueba).
- **Despliegue** con `clasp` + `appsscript.json` versionado; entornos "dev" y "prod" (spreadsheets
  separados).
- **Sin migración (D6):** v2 arranca limpio. El spreadsheet actual se conserva **solo como
  consulta/prueba** (de solo lectura); no se reescribe ni se importa su histórico.
- **Operación:** trigger diario de backup; trigger opcional de archivado de episodios cerrados;
  monitoreo de `AUDIT_LOG`.

---

## 14. Decisiones

> Estado al cierre de esta iteración. Las resueltas se congelan; las pendientes se cierran antes de F1.

### 14.1 Resueltas
- **D1 · Acceso → cuentas personales (Gmail).** La app no se restringe a un dominio Workspace.
  Implicancia técnica: `Session.getActiveUser().getEmail()` **no es fiable** con cuentas de
  consumidor (devuelve vacío fuera del dominio del dueño). Por tanto la auditoría por email
  **no** puede basarse en `getActiveUser()`; se resuelve con D1b.
- **D2 · Firma ligada al email.** La firma clínica queda **atada a la identidad** del usuario
  (no firma libre). El mecanismo concreto para obtener esa identidad depende de D1b.
- **D6 · Arranque limpio.** v2 arranca sin datos. El histórico actual queda **solo como prueba/
  consulta** en el spreadsheet antiguo; **no se migra**. Se elimina la fase de migración.
- **D8 · Reúso del generador de texto.** El generador de texto clínico y su estética se
  **mantienen sin grandes cambios**: se porta `dominio_texto.gs` casi tal cual (solo se aísla
  como función pura y testeable) y la salida/estilo de la evolución conserva el look actual.
- **D1b · Identidad → Google Sign‑In (GIS).** Login real en el frontend con **Google Identity
  Services**; Google entrega un **ID token (JWT)** con el email verificado, válido incluso con
  Gmail personal. El backend **verifica el token** antes de aceptar cualquier escritura y liga el
  email verificado a la firma clínica vía `KINESIOTERAPEUTAS` (columna `EMAIL`).
  - **Dependencia de setup:** requiere un **proyecto de Google Cloud propio** con un **OAuth
    Client ID (tipo Web)**; el `appsscript.json` se asocia a ese GCP.
  - **⚠️ Riesgo a validar en un spike temprano (F1):** la Web App de Apps Script se sirve dentro
    de un **iframe sandbox** (`googleusercontent.com`). GIS/FedCM y las cookies de terceros pueden
    comportarse distinto dentro de ese iframe. **Antes de comprometer la arquitectura de auth hay
    que probar** que el botón de Sign‑In renderiza y devuelve el token dentro del iframe; si no,
    el plan B técnico es abrir el login en una ventana emergente (popup) que pase el token al
    padre. Esto se prueba en F1, no en F9.

### 14.2 Pendientes (cerrar antes de F1)
- **D3 · Traslado e historial.** ¿Reescribir `ID_CAMA` histórico a la cama nueva, o consultar
  siempre por `PATIENT_ID` y dejar el `ID_CAMA` histórico como estaba? (Recomendado: por
  `PATIENT_ID`, más barato y suficiente.)
- **D4 · Nº de camas.** ¿18 fijo o configurable en `CONFIG.NUM_CAMAS`? (Recomendado: configurable.)
- **D5 · Archivado de evoluciones.** ¿Mover al egresar (partición estricta) o mantener todo junto
  e indexar? (Recomendado: partición al egresar, por rendimiento a largo plazo.)
- **D7 · Retención de backups.** ¿30 copias basta o hay requisito legal de retención mayor?

---

## 15. Registro de cambios respecto al sistema actual

| Área | Antes | En v2 |
|------|-------|-------|
| Esquema de columnas | Duplicado en constantes y setup (119≠132, 40≠41) | Fuente única en `esquema.gs` |
| Identidad | Mezcla por `ID_CAMA`; doble `PATIENT_ID` | Episodio único por `PATIENT_ID`, ruta de ingreso única |
| REM | Doble conteo de ingresos | Conteo por episodio único |
| Egreso | Outcome incompleto en ARCHIVO | Captura completa (FSS/MRC/apnea/extubación) |
| Traslado | Rompe el historial | Historial por episodio, íntegro |
| Seguridad | Sin identidad ni auditoría; XSS | Google Sign‑In (token verificado) + firma ligada a email + `AUDIT_LOG` + `escapeHtml` |
| Arranque | Histórico mezclado en producción | v2 limpio; histórico antiguo solo de consulta (D6) |
| Texto clínico | Bueno pero acoplado a I/O | Se conserva (D8), aislado como función pura |
| Modales | 5 patrones distintos, sin escape ni foco | `core/modal.js` unificado, accesible |
| SmartEvo | ~120 funciones, sin autosave | Modular + autosave/borrador |
| Persistencia | Lectura del histórico completo por request | Partición + repos con lectura en bloque |
| Repo | `.gs.txt` con carácter invisible, HTML duplicados | `clasp` + `appsscript.json`, sin código muerto |
| Pruebas | Ninguna | Dominio puro testeado |

### Capacidades futuras (post‑v2)
Alertas clínicas por reglas (VT/kg, Tobin, ROX), exportación FHIR/CSV a la ficha institucional,
panel de calidad comparativo, SSO institucional.

---

> **Siguiente paso:** D1b cerrado (Google Sign‑In). Solo restan D3/D4/D5/D7, que tienen
> recomendación y se pueden aceptar tal cual. Al confirmarlas, propongo el detalle de la Fase 1
> (esquema + repos + infra + spike GIS). No se escribe código hasta cerrar el plan.
