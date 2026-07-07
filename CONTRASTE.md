# Contraste: formulario actual vs. esquema de hoja (EVOLUCIONES)

> Comparación entre lo que el **formulario SmartEvo realmente envía** (payload de `guardar()`)
> y lo que la **hoja `EVOLUCIONES` guarda como columna** (mapa `COL_EVO`). Sirve para decidir,
> antes de congelar el esquema v2, qué campos **promover** a columnas, qué columnas **podar** y
> qué **renombrar**. Relacionado: `ESQUEMA.md`, `PLAN_PROYECTO.md`.

---

## 0. Resumen ejecutivo

- El formulario envía **~130 campos**; la hoja tiene **~120 columnas**, pero **no coinciden**:
  ~**90 campos del formulario no existen como columna** y varias columnas ya **no reciben datos**.
- Los ~90 campos huérfanos **solo se guardan dentro de `JSON_SNAPSHOT`** (blob), que **nunca se
  lee de vuelta** de forma estructurada. → No son consultables, ni estadísticos, ni se replican
  al turno siguiente.
- **Implicancia para v2:** promover esos campos a columnas reales cumple dos objetivos a la vez:
  (a) hacerlos consultables/estadísticos, y (b) que **se repliquen turno a turno** (Punto 1).
  Solo **después** de promoverlos es seguro eliminar `JSON_SNAPSHOT`.

---

## 1. Campos que el formulario ENVÍA pero la hoja NO guarda (huérfanos → promover)

> Agrupados por bloque clínico. Recomendación por defecto: **promover a columna** (salvo los
> marcados). Muchos son datos clínicos valiosos que hoy se pierden.

### 1.1 Aislamiento *(hoy no existe como columna — relevante para tu caso de mover a cama vacía)*
`PAC_AISLAMIENTO` (bool), `PAC_AISL_MICRO` (texto), `PAC_AISL_LISTA` (texto/json)

### 1.2 Vía aérea — datos extendidos
`VA_EXTERNO` (bool), `VA_EXTERNO_DIAS` (entero), `TOT_FIJACION` (texto),
`FECHA_INICIO_TQT` (fecha), `VENT_TQT_CALIBRE` (texto)

### 1.3 Contadores por episodio (VM / VNI / reintubación)
`DIAS_VM_PREVIOS`, `FECHA_INICIO_VM`, `DIAS_VNI_PREVIOS`, `FECHA_INICIO_VNI`, `N_REINTUB`

### 1.4 Decanulación *(bloque completo hoy perdido)*
`DECAN_OCURRIO` (bool), `DECAN_TIPO`, `DECAN_QUEDA_DISP`, `DECAN_QUEDA_FLUJO`,
`DECAN_QUEDA_SPO2`, `DECAN_DET`, `DECAN_RECANUL` (bool)

### 1.5 Reingreso / AET
`ES_REINGRESO` (bool), `AET_ACTIVA` (bool), `AET_NIVEL`

### 1.6 Sedación / examen físico extra
`SED_CAM_ICU`, `EX_RUIDOS_LOC`, `EX_CULT_RESULTADO`

### 1.7 KTM extendido *(entrenamiento y suspensión por alerta)*
`KTM_ASISTENCIA`, `KTM_IMT` (bool), `KTM_IMT_FREQ`, `KTM_IMT_INT`, `KTM_IMT_T`, `KTM_IMT_DES`,
`KTM_NO_REALIZADA` (bool), `KTM_NO_RAZON`, `KTM_NO_COMENTARIO`,
`KTM_ALERTA` (bool), `KTM_ALERTA_CAT`, `KTM_ALERTA_RAZ`, `VENT_UMA`

### 1.8 Terapia respiratoria (RESP_*) *(bloque grande hoy perdido)*
`RESP_KTR_CANT`, `RESP_SIN_KTR`, `RESP_SOF`, `RESP_SNF`, `RESP_SET`, `RESP_ATOS`, `RESP_INHALO`,
`RESP_SECR_REOL`, `RESP_SECR_CAR`, `RESP_SECR_QTY`, `RESP_POS_SED`, `RESP_POS_DCLD`,
`RESP_POS_DCLI`, `RESP_POS_PRONO`, `RESP_POS_SUPINO`, `RESP_POS_LIBRE`, `RESP_PRONO_TS`,
`RESP_SUPINO_TS`, `RESP_PRONO_HORA`, `RESP_SUPINO_HORA`, `RESP_CULT_FECHAS`, `RESP_CULT_OBJ`

### 1.9 Evaluación funcional POR TURNO (EVAL_T_*)
`EVAL_FECHA`, `EVAL_T_REALIZAR`, `EVAL_T_MRC`, `EVAL_T_DINAMO`, `EVAL_T_FSS`, `EVAL_T_PIM`,
`EVAL_T_PEM`, `EVAL_T_FEM`, `EVAL_T_GROSOR`, `EVAL_T_HALLAZGOS`, `EVAL_T_BDT_POS`,
`EVAL_T_BDT_NEG`, `EVAL_T_PMANT_VA`
> ⚠️ **Redundancia:** el formulario envía estos **y también** los `EGR_*` (MRC, FSS, PIM, PEM,
> FEM, grosor, dinamometría, BDT, presión VA) con **los mismos valores**. Hay que **quedarse con
> un solo set** en v2 (recomiendo `EVAL_T_*`, que es "por turno", y derivar el de egreso).

### 1.10 PVE (prueba de ventilación espontánea)
`PVE_RESULTADO`, `PVE_FR_MOTIVOS` (json), `PVE_SC_RAZON`, `PVE_VAL`

### 1.11 Extubación (EXT_*)
`EXT_OCURRIO` (bool), `EXT_HORA`, `RESP_EXTUB_TS` (json), `EXT_TIPO`, `EXT_MOTIVO`,
`EXT_POST_DET`, `EXT_REINTUB` (bool), `EXT_REINTUB_RAZ`, `EXT_PE_VA`, `EXT_PE_SOP`, `EXT_PE_MODO`

### 1.12 Estado FINAL de vía aérea (tras extubación/decanulación)
`VENT_VIA_AEREA_FINAL`, `VENT_SOPORTE_FINAL`, `VENT_MODO_FINAL`

### 1.13 Muestras
`MUE_RESULTADOS_JSON` (json)

---

## 2. Columnas de la hoja que el formulario YA NO alimenta (podar o revisar)

> Están en `COL_EVO` pero el payload actual **no las envía**. Candidatas a **eliminar** en v2,
> salvo que las uses por otra vía.

- **Ventilatorio en desuso:** `VENT_ADAPTADO`, `VENT_AUTOPEEP`, `VENT_IPAP_MIN`, `VENT_IPAP_MAX`,
  `VENT_VT_ASEG`, `VENT_PMUSC`, `VENT_P01`, `VENT_DPOCC`, `VENT_RISETIME`, `VENT_CAB_RSS`,
  `VENT_CAB_RSS_DESC`
- **Post‑extubación viejo** (reemplazado por `EXT_*`): `VENT_POST_EXT`, `VENT_POST_EXT_VAL`
- **KTM UMA viejo** (el form manda `VENT_UMA`): `KTM_UMA`, `KTM_UMA_VAL`
- **Muestras viejas:** `MUE_MECANISMO`, `MUE_OTRO`
- **Examen físico viejo** (el form manda `EX_RUIDOS_LOC` / `RESP_SECR_*`): `EX_RUIDOS_MAN`,
  `EX_SECR_CANT`, `EX_SECR_TIPO`
- **Eval viejo** (reemplazado por `EVAL_T_*`): `EVAL_TIMEPOINT`, `EVAL_T_GROSOR_QUAD`,
  `EVAL_T_HECKMATT`, `EVO_UPOT`, `EGR_FED`
- **Reintubación vieja** (reemplazada por `EXT_REINTUB*` / `N_REINTUB`): `REINTUB_BLOQUE`,
  `REINTUB_HORA`, `REINTUB_MOTIVO`, `REINTUB_SOP_PREV`, `REINTUB_TIEMPO`
  > ⚠️ Ojo: la hoja `REINTUBACIONES` sí depende de `REINTUB_BLOQUE`. Si migramos a `EXT_REINTUB`,
  > hay que reconectar ese registro dedicado a los nuevos campos.

> 🔶 **Confirmar poda:** ¿alguno de estos parámetros ventilatorios avanzados (P0.1, ΔPocc, Pmusc,
> auto‑PEEP, rise time) los quieres **reactivar** en el formulario en vez de eliminarlos? Son
> clínicamente válidos; hoy simplemente el formulario no los envía.

---

## 3. Desajustes de NOMBRE (mismo dato, distinto nombre)

| Formulario | Columna hoja | Decisión v2 |
|-----------|--------------|-------------|
| `PAC_RUT` | `PAC_RUT` | → `PAC_COD` (D9, sin RUT) |
| `VENT_UMA` | `KTM_UMA`/`KTM_UMA_VAL` | Unificar en un solo nombre |
| `EX_RUIDOS_LOC` | `EX_RUIDOS_MAN` | Unificar |
| `RESP_SECR_QTY`/`_CAR` | `EX_SECR_CANT`/`_TIPO` | Unificar |
| `EXT_POST_DET` | `VENT_POST_EXT_VAL` | Unificar en bloque `EXT_*` |
| `EVAL_T_*` | `EGR_*` | Quedarse con un set |

---

## 4. Conceptos clínicos NUEVOS (tu Punto 6)

### 4.1 Test de apnea repetible
Hoy: `APNEA_RESULTADO` / `APNEA_MOTIVO` / `APNEA_TEXTO` = **un solo** test.
v2: **`APNEA_JSON`** = arreglo de tests `[{n, hora, resultado(positivo|negativo|no concluyente),
motivo, texto}]`. Permite repetir si uno resulta negativo. (Mantener `APNEA_RESULTADO` como
"resultado del último test" derivado, para filtros rápidos.)

### 4.2 Test de azul (BDT) repetible
Hoy: `EGR_BDT_POS` / `EGR_BDT_NEG` = **un solo** test.
v2: **`BDT_JSON`** = arreglo `[{n, fecha, resultado(positivo|negativo)}]`. Mismo patrón que apnea.

### 4.3 Fase clínica del paciente
Valores propuestos (extensible): *Reanimación inicial · Protección pulmonar · Neuroprotección ·
Postoperatorio inmediato · Espera de second look · Weaning (destete) · Rehabilitación · …*

**Recomendación: columna estructurada, no solo texto.** Razones:
- Permite estadística ("¿cuántos pacientes/turnos en weaning vs rehabilitación?").
- Da contexto al turno y puede alimentar el generador de texto automáticamente.
- Como un paciente puede estar en más de una fase a la vez (p. ej. neuroprotección + postop),
  se modela como **multi‑selección**: `FASE_JSON` (arreglo de valores del catálogo).
- El catálogo de fases vive en `CONFIG` o en una hoja `CATALOGOS` para poder ampliarlo sin tocar código.

> Además de la columna, la fase se **incluye en el texto clínico** generado (lo mejor de ambos mundos).

---

## 5. Decisiones — RESUELTAS ✅

1. **Promoción de huérfanos (§1):** promover **todos** a columnas. ✅
2. **Redundancia `EVAL_T_*` vs `EGR_*` (§1.9):** quedarse con `EVAL_T_*` (por turno), derivar egreso. ✅
3. **Ventilatorio avanzado (§2):** **reactivar en el formulario** (no eliminar). ✅
4. **Nombres a unificar (§3):** aprobados — ver tabla en `ESQUEMA.md §17`. ✅
5. **Fase clínica (§4.3):** columna estructurada multi‑selección (`FASE_JSON`) + texto; catálogo en
   hoja **`CATALOGOS`** (ampliable sin código). ✅
6. **Reconexión de `REINTUBACIONES`** al bloque `EXT_*`: sí — ver `ESQUEMA.md §11`. ✅

> Esquema definitivo en `ESQUEMA.md` (EVOLUCIONES = **195 columnas**). Único punto abierto:
> confirmar si el flujo "Evaluaciones" usa Heckmatt / grosor cuádriceps por timepoint.
