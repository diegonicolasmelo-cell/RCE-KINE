# Plan de Modales — RCE‑KINE

> Hoja de ruta de la capa de modales del frontend. Estado actual, problemas y
> plan de rediseño. Se usa junto con `PLAN_PROYECTO.md` (plan maestro).
>
> **Inventario actual:** 5 modales reales (overlay `ovl` + contenedor con clase `.on`)
> y 6 vistas de pestaña que no son modales. Solo existe **una** función que escapa
> HTML (`_esc`) y se usa únicamente en la tabla dinámica; el resto de los modales
> inyecta datos de paciente con `innerHTML` crudo.

---

## 1. Panel SmartEvo — Evolución / Ingreso (`sp`)

**Rol:** núcleo clínico. Registro completo de un turno UCI (ingreso o evolución).

**Funciones que lo componen (~120):** `abrirPanel`, `cerrarPanel`, `cerrarTodo`,
`minimizarPanel`/`_renderMinTray`/`restaurarDesdeMin`, `fillCama`, `fillForm`,
`fillFormReplica`, `limpiarReplica`, `guardar`, `actualizarTituloPanel`,
`previewTexto`/`genTexto`/`copiar`, y los sub‑bloques:
- Ventilatorio: `cascadeVA`, `cascadeSop`, `updateVAUI`, `renderParams`, `renderParamsPE`
- Sedación: `hSed`, `calcGCS`, `autoCoopera`
- Cálculos: `calcPI`, `calcResp`
- KTM: `hKTM`, `setKTMstate`, `setKTMniv`, `onKTMnivChange`, `updateKTMcat/raz`
- Procedimientos: `addProc`, `quitarProc`, `renderChips`
- Muestras/cultivos: `hMue`, `hSecr`, `hCultTec`, `addCultRes`
- Evaluación funcional: `hEgr`, `interpMRC`, `interpFSS`, `interpPIM`, `interpDinamo`
- Vía aérea/PVE/extubación: `hExt`, `hPVE`, `hAET`, `hReintubCheck`
- Posicionamiento: `hPos`, prono/supino
- Tags/aislamiento: `ti*`, `hAisl`
- Control duplicados: `chkNombreDB`, `confirmarReingreso`

| Fuerte | Malo |
|--------|------|
| Cobertura clínica completa del turno UCI | ~120 funciones y estado global disperso (`PROCS`, `_minStack`, `_tiState`, `_aislTags`) — inmanejable, sin tests |
| Cascadas condicionales (vía aérea→soporte→modo→parámetros) | Sin autosave/borrador: caída de red o sesión bota el turno |
| Replicación del turno anterior | Minimizar guarda solo una etiqueta; restaurar **recarga del servidor** y pierde cambios no guardados |
| Texto narrativo autogenerado | Resets manuales por sub‑bloque, frágiles ante bloques nuevos |
| Minimizar múltiples pacientes | Backdrop no cierra (inconsistente con los otros 4 modales) |
| Firma obligatoria, chequeo de reingreso | Ingreso por este panel genera `PATIENT_ID` distinto de `ingresarPaciente` |
| | XSS: nombre/diagnóstico sin escape |

**Prioridad de refactor:** #1 (partir en módulos por sub‑bloque).

**Diseño del formulario — divulgación progresiva (decisión):**
- **Un solo botón de guardar** para todo el turno (atómico: una escritura, un registro de
  auditoría, sin turnos guardados a medias). Se descarta el segundo botón por riesgo de pérdida de
  datos. El "no contar como acción del día" se resuelve en las **reglas de conteo** (ver
  `PLAN_PROYECTO.md §11.0`), no con un botón aparte.
- Los bloques ocasionales o avanzados van como **secciones colapsables (toggle desplegable)**,
  cerradas por defecto: **Evaluación funcional por turno** y **Monitorización avanzada (ventilatorio
  avanzado:** P0.1, ΔPocc, Pmusc, auto‑PEEP, rise time, IPAP min/max, etc.**)**.
- Solo se despliegan si el kine las necesita ese turno → menos ruido, evolución más rápida.
- **No afecta el esquema:** las columnas existen igual; esto es solo presentación.
- Mismo criterio aplicable (a revisar) a otros bloques condicionales: IMT, decanulación, PVE,
  extubación, apnea/BDT. Los campos núcleo (sedación, hemodinamia, ventilatorio básico, KTM,
  plan/firma) quedan siempre visibles.

---

## 2. Modal Egreso / Alta (`egMod`)

**Funciones:** `egreso`, `cerrarEgreso`, `egDestinoChange`, `confirmarEgreso`,
mapa `DEST_TO_MOTIVO`, `updBarthelLbl`.

| Fuerte | Malo |
|--------|------|
| Enfocado y simple | **Captura de outcome incompleta:** el backend espera `fssEgreso`, `mrcSsEgreso`, apnea, `extubacionOk`, `reintubacion`; el modal solo envía Barthel/motivo/destino/obs/firma → `ARCHIVO` queda con FSS/MRC/apnea vacíos |
| Mapea destino→motivo REM automáticamente | No prellena la última MRC/FSS/Barthel de las evoluciones |
| Firma obligatoria + `confirm()` antes de liberar | Sin validación de rango del Barthel de egreso |
| Feedback de estado del botón | Estadísticas de egreso calculadas por `ID_CAMA` (contaminación entre pacientes) |

**Prioridad de fix:** #1 de datos (barato, alto impacto — completar campos de outcome).

---

## 3. Modal Historial / Timeline (`tlp`)

**Funciones:** `abrirTL`, `cerrarTL`, `setTLtab`, `setTLturno`, `_updateTLTabsUI`,
`_updateTLFiltersUI`, `_renderTLVarChips`, `toggleTLVar`, `renderTL`,
`_renderTLEventos`, `_renderTLChart`, `_svgMultiChart`, `_svgLineChart`,
`_statsSummary`, `_parseNum`, `_niceMax`.

| Fuerte | Malo |
|--------|------|
| 3 sub‑tabs (Eventos, Ventilatorio, Rehabilitación) | Llama `GET_HISTORIAL_PACIENTE` solo con `idCama` → mezcla episodios en pacientes sin `PATIENT_ID` |
| Gráficos SVG propios (livianos, sin librería) | SVG artesanal: sin accesibilidad, sin tooltips, re‑render completo por toggle |
| Carga hitos+evoluciones en 1 llamada | Texto/autor de hitos con `innerHTML` sin escape |
| Defaults inteligentes de variables | Solo lectura; no permite corregir un hito |

---

## 4. Modal Detalle de Archivado (`arcDet`)

**Funciones:** `abrirArcDetalle`, `cerrarArcDet`, `renderArcDetalle`
(vista lista: `loadArchivos`, `renderArchivos`, `exportArchivosCSV`).

| Fuerte | Malo |
|--------|------|
| Reconstruye la ficha del egresado desde snapshot congelado | Expone `JSON_BACKUP` completo al cliente |
| No depende del estado actual de la cama | `innerHTML` sin escape (nombre/RUT/diagnóstico) |
| | Solo lectura; sin exportar ficha individual a PDF |
| | Si `darAlta` falló a medias, snapshot incompleto sin señal |

---

## 5. Modal Confirmación de Reintubación (`modalReintub`)

**Funciones:** `confirmarReintubacion`, `_mrResolver`.

| Fuerte | Malo |
|--------|------|
| Patrón Promise limpio (`await` de confirmación con UI propia) | Usa su propio overlay (`modalReintubOverlay`/`.visible`) fuera del sistema `ovl`/`.on` — duplica CSS/patrón |
| Mensaje claro del efecto sobre contadores | `_mrResolver` global mutable: confirmaciones concurrentes se pisan |
| Opción de cancelar sin afectar | Sin cierre por Escape/backdrop |

---

## 6. Vistas de pestaña (no son modales, referencia)

General (grid de camas), Pacientes (tabla), Estadísticas (dashboard + pivot),
Entrega, Archivados, REM. Se documentan en `PLAN_PROYECTO.md`.

---

## 7. Problemas transversales a TODOS los modales

1. **No hay helper único de apertura/cierre** — cada modal repite
   `classList.add/remove('on')`. Falta `openModal(id)`/`closeModal(id)` central.
2. **Escape de HTML ausente** salvo `_esc` (solo en el pivot).
3. **Sin cierre por Escape** ni manejador global de teclado.
4. **Accesibilidad nula** — sin `aria-modal`, sin *focus trap*, sin retorno de foco.
5. **Estado global disperso** en vez de encapsular por modal.

---

## 8. Plan de acción (orden sugerido)

| # | Acción | Tipo | Costo | Impacto |
|---|--------|------|-------|---------|
| 1 | Egreso: enviar todos los campos de outcome que el backend espera | Bug de datos | Bajo | Alto |
| 2 | `escapeHtml()` aplicado a los 5 modales | Seguridad | Bajo | Alto |
| 3 | Helper `openModal`/`closeModal` + cierre por Escape + `aria-modal` | Infra UI | Medio | Medio |
| 4 | Normalizar `modalReintub` al sistema `ovl`/`.on` | Consistencia | Bajo | Bajo |
| 5 | Historial: pasar `patientId` explícito | Integridad | Bajo | Medio |
| 6 | Autosave/borrador local en SmartEvo (evitar pérdida de turno) | Robustez | Medio | Alto |
| 7 | Partir SmartEvo en módulos por sub‑bloque | Arquitectura | Alto | Alto |

> Nota: los ítems 1–5 son mejoras acotadas sobre la app actual; los ítems 6–7 se
> integran de forma nativa en la reconstrucción descrita en `PLAN_PROYECTO.md`.
