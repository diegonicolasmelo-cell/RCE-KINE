# Esquema de datos — RCE‑KINE v2 (fuente única de verdad)

> Define **todas** las hojas y columnas. De aquí se generan índices, encabezados, lectura,
> escritura y migración (`esquema.gs`). Regla de oro: **el índice de una columna = su posición
> en esta lista** (1‑based). No se hardcodea ningún número en ningún otro lado.
>
> Estado: **borrador para revisión columna por columna.** Los puntos marcados 🔶 requieren tu
> confirmación (ver §16). Relacionado: `PLAN_PROYECTO.md`.

---

## 0. Convenciones

**Tipos** (todo vive en celdas de Sheets, formateadas como texto plano `@` salvo números):
| Tipo | Significado |
|------|-------------|
| `texto` | Cadena |
| `entero` | Número entero |
| `decimal` | Número con decimales |
| `bool` | `TRUE`/`FALSE` |
| `fecha` | Texto ISO `yyyy-MM-dd` (comparación por string) |
| `ts` | Texto timestamp `yyyy-MM-dd HH:mm:ss` (TZ America/Santiago) |
| `uuid` | UUID v4 (clave interna) |
| `email` | Correo verificado (GIS) |
| `json` | Texto JSON serializado |
| `enum(...)` | Texto restringido a un conjunto |

**Filas de encabezado** (`headerRows`) por hoja: la primera fila de datos va inmediatamente después.
**Naming:** `MAYÚSCULAS_CON_GUION_BAJO`, prefijo por bloque (`PAC_`, `VENT_`, `KTM_`…).

**Cambios globales respecto a v1** (aplican a todas las hojas):
- ❌ Se elimina `RUT` → ✅ `COD_PACIENTE` (identificador legible, D9).
- ✅ `PATIENT_ID` (uuid) presente en toda hoja clínica.
- ✅ `AUTOR_EMAIL` (email verificado) en toda escritura clínica, junto a la firma.

---

## 1. CONFIG  · `headerRows: 1`

Parámetros del sistema. Formato clave/valor.

| # | Columna | Tipo | Nota |
|---|---------|------|------|
| 1 | CLAVE | texto | Nombre del parámetro |
| 2 | VALOR | texto | Valor |

**Claves semilla:**
| CLAVE | VALOR ejemplo | Uso |
|-------|---------------|-----|
| `NUM_CAMAS` | `18` | Nº de camas (D4 — configurable; pandemia llegó a 20) |
| `TIMEZONE` | `America/Santiago` | Zona horaria |
| `ULTIMO_BACKUP` | `2026-07-07 03:00:00` | Timestamp último respaldo |
| `OAUTH_CLIENT_ID` | `xxx.apps.googleusercontent.com` | Client ID para verificar tokens GIS |
| `BACKUP_MAX_DIARIOS` | `30` | Rotación diaria (D7) |
| `VERSION_ESQUEMA` | `2.0` | Para migraciones futuras |

---

## 2. CAMAS_ESTADO  · `headerRows: 2`

Estado **actual** de cada cama (censo). Una fila por cama. Se sincroniza en cada evolución.

**Identidad y estado**
1. `ID_CAMA` `texto` — nº de cama (1..NUM_CAMAS)
2. `OCUPADA` `bool`
3. `STATUS_CAMA` `enum(Libre|Ocupada)`
4. `PATIENT_ID` `uuid` — episodio activo
5. `COD_PACIENTE` `texto` — identificador legible (reemplaza RUT)

**Datos del paciente actual**
6. `NOMBRE` `texto`
7. `EDAD` `entero`
8. `SEXO` `enum(M|F)`
9. `TALLA_CM` `decimal`
10. `PESO_IDEAL_KG` `decimal`
11. `BARTHEL` `entero`
12. `ECF` `texto`
13. `DIAGNOSTICO` `texto`
14. `DIAG_REM` `texto`

**Vía aérea / ventilación (estado actual)**
15. `VIA_AEREA` `enum(Natural|TOT|TQT|Full Face|Oronasal)`
16. `TOT_NUMERO` `texto`
17. `TOT_CM_LABIO` `texto`
18. `TQT_TIPO` `texto`
19. `SOPORTE` `texto`
20. `MODO` `texto`

**Fechas de conteo**
21. `FECHA_INGRESO` `fecha`
22. `FECHA_INICIO_VA` `fecha`
23. `FECHA_INICIO_SOPORTE` `fecha`

**KTM / firma**
24. `KTM_NIVEL` `texto`
25. `KTM_SUSP` `bool`
26. `FIRMA_KINE` `texto`
27. `AUTOR_EMAIL` `email` — quién dejó el último estado

**Cachés de render (snapshot por turno para la tabla de Registro Diario)**
28. `TEXTO_EVO_DIA` `texto`
29. `TEXTO_EVO_NOCHE` `texto`
30. `ULTIMO_TURNO_KEY` `texto`
31. `TIMELINE_JSON` `json` — últimos ~30 hitos, cache
32. `KTR_DIA` `entero`
33. `KTM_DIA` `texto` — nivel / `C` contraindicada / ''
34. `PROC_DIA` `texto`
35. `FIRMA_DIA` `texto`
36. `KEY_DIA` `texto`
37. `KTR_NOCHE` `entero`
38. `PROC_NOCHE` `texto`
39. `FIRMA_NOCHE` `texto`
40. `KEY_NOCHE` `texto`

> **Cambio vs v1 (decisión):** se elimina `JSON_BACKUP` de esta hoja. El estado activo se reconstruye
> desde las columnas; el snapshot del episodio se congela en `ARCHIVO_PACIENTES` al egresar.

---

## 3. EVOLUCIONES  · `headerRows: 3`

Núcleo: **una fila por turno** (`ID_EVOLUCION = CAMA_<id>_<turnoKey>`). Al egresar, las filas del
episodio se mueven a `EVOLUCIONES_ARCHIVO` (mismo esquema, D5).

### 3.1 Metadatos e identidad
1. `ID_EVOLUCION` `texto`
2. `ID_CAMA` `texto` — **cama real del turno** (se conserva; habilita reporte por cama, D3)
3. `PATIENT_ID` `uuid`
4. `COD_PACIENTE` `texto`
5. `TURNO_KEY` `texto` — `yyyy-MM-dd-Dia|Noche`
6. `FECHA` `fecha`
7. `TURNO` `enum(Dia|Noche)`
8. `ES_INGRESO` `bool`
9. `TIMESTAMP` `ts`
10. `AUTOR_EMAIL` `email` — identidad verificada del autor
11. `DIA_ESTADIA` `entero`
12. `DIAS_VM` `entero`
13. `DIAS_VA` `entero`

### 3.2 Identificación del paciente (snapshot del turno)
14. `PAC_NOMBRE` `texto`
15. `PAC_COD` `texto` — (era `PAC_RUT`)
16. `PAC_EDAD` `entero`
17. `PAC_SEXO` `enum(M|F)`
18. `PAC_TALLA` `decimal`
19. `PAC_PESO_IDEAL` `decimal`
20. `PAC_BARTHEL` `entero`
21. `PAC_ECF` `texto`
22. `PAC_DIAGNOSTICO` `texto`
23. `PAC_DIAG_REM` `texto`

### 3.3 Sedación y conciencia
24. `SED_TIPO` `texto` · 25. `SED_SAS` `texto` · 26. `SED_S5Q` `texto` · 27. `SED_COOPERACION` `texto`
· 28. `SED_GCS_O` `entero` · 29. `SED_GCS_V` `entero` · 30. `SED_GCS_M` `entero` · 31. `SED_GCS_TOT` `entero`
· 32. `SED_BNM` `bool`

### 3.4 Hemodinamia
33. `HEMO_ESTADO` `texto` · 34. `HEMO_DVA` `texto` · 35. `HEMO_MULTI_DVA` `bool` · 36. `HEMO_NUM_DVA` `entero`
· 37. `HEMO_TENDENCIA` `bool` · 38. `HEMO_TEND_TIPO` `texto`

### 3.5 Examen físico
39. `EX_MP` `texto` · 40. `EX_RUIDOS` `texto` · 41. `EX_RUIDOS_MAN` `texto` · 42. `EX_SECR_CANT` `texto`
· 43. `EX_SECR_TIPO` `texto`

### 3.6 Ventilatorio — configuración
44. `VENT_VIA_AEREA` `texto` · 45. `VENT_TOT_NUM` `texto` · 46. `VENT_TOT_CM` `texto` · 47. `VENT_TQT_TIPO` `texto`
· 48. `VENT_SOPORTE` `texto` · 49. `VENT_MODO` `texto` · 50. `VENT_ADAPTADO` `texto` · 51. `VENT_H_ACTIVA` `bool`
· 52. `VENT_POST_EXT` `bool` · 53. `VENT_POST_EXT_VAL` `texto`

### 3.7 Ventilatorio — parámetros
54. `VENT_VT` · 55. `VENT_FR` · 56. `VENT_PEEP` · 57. `VENT_PMAX` · 58. `VENT_PMEDIA` · 59. `VENT_PPL`
· 60. `VENT_AUTOPEEP` · 61. `VENT_PINSP` · 62. `VENT_PS` · 63. `VENT_IPAP` · 64. `VENT_EPAP` · 65. `VENT_IPAP_MIN`
· 66. `VENT_IPAP_MAX` · 67. `VENT_VT_ASEG` · 68. `VENT_FLUJO` · 69. `VENT_TI` · 70. `VENT_FIO2` · 71. `VENT_SPO2`
· 72. `VENT_TEMP` · 73. `VENT_LITROS` · 74. `VENT_PMUSC` · 75. `VENT_P01` · 76. `VENT_DPOCC` · 77. `VENT_RISETIME`
· 78. `VENT_CAB_RSS` `texto` · 79. `VENT_CAB_RSS_DESC` `texto`  *(53–77 son `decimal`)*

### 3.8 Valores calculados (derivados, ver `dominio_calculos.gs`)
80. `CALC_ML_KG` · 81. `CALC_VOL_MIN` · 82. `CALC_IE` · 83. `CALC_DP` · 84. `CALC_CESR` · 85. `CALC_TOBIN`
· 86. `CALC_IROX`  *(todos `texto`/`decimal` según formato)*

### 3.9 KTM / rehabilitación
87. `KTM_REALIZADA` `bool` · 88. `KTM_SUSPENDIDA` `bool` · 89. `KTM_CONTRA_TIPO` `texto` · 90. `KTM_CONTRA_CAT` `texto`
· 91. `KTM_CONTRA_RAZON` `texto` · 92. `KTM_CONTRA_MANUAL` `texto` · 93. `KTM_NIVEL_KTR` `texto` · 94. `KTM_TIEMPO_MIN` `entero`
· 95. `KTM_UMA` `bool` · 96. `KTM_UMA_VAL` `texto`

### 3.10 Procedimientos
97. `PROC_RESUMEN` `texto` — derivable de PROC_JSON · 98. `PROC_CANTIDAD` `entero` — derivable
· 99. `PROC_JSON` `json` — **fuente de verdad** de los procedimientos del turno

### 3.11 Muestras microbiológicas
100. `MUE_REALIZADAS` `bool` · 101. `MUE_MECANISMO` `texto` · 102. `MUE_OTRO` `texto` · 103. `MUE_TIPOS_JSON` `json`

### 3.12 Evaluación funcional / egreso clínico
104. `EGR_ACTIVO` `bool` · 105. `EGR_NIVEL_MOTOR` `texto` · 106. `EGR_MRC_SS` `entero` · 107. `EGR_FSS` `entero`
· 108. `EGR_GROSOR_DIAF` `decimal` · 109. `EGR_PIM` `decimal` · 110. `EGR_PEM` `decimal` · 111. `EGR_FEM` `decimal`
· 112. `EGR_FED` `decimal` · 113. `EGR_DIAFRAGMA` `texto` · 114. `EGR_BDT_POS` `texto` · 115. `EGR_BDT_NEG` `texto`
· 116. `EGR_PRESION_VA` `texto` · 117. `EGR_PRENSION` `decimal` — dinamometría

### 3.13 Evaluación por timepoints / ecografía muscular
118. `EVAL_TIMEPOINT` `texto` · 119. `EVAL_T_GROSOR_QUAD` `decimal` · 120. `EVAL_T_HECKMATT` `texto` · 121. `EVO_UPOT` `texto`

### 3.14 Reintubación (desde bloque VAA)
122. `REINTUB_BLOQUE` `bool` · 123. `REINTUB_HORA` `texto` · 124. `REINTUB_MOTIVO` `texto`
· 125. `REINTUB_SOP_PREV` `texto` · 126. `REINTUB_TIEMPO` `texto`

### 3.15 Test de apnea (UPOT) — **repetible** (Punto 6)
127. `APNEA_JSON` `json` — arreglo `[{n, hora, resultado(positivo|negativo|no concluyente), motivo, texto}]`
· 128. `APNEA_ULTIMO` `texto` — resultado del último test (derivado, para filtros rápidos)

### 3.15b Test de azul / BDT — **repetible** (Punto 6)
129. `BDT_JSON` `json` — arreglo `[{n, fecha, resultado(positivo|negativo)}]`
· 130. `BDT_ULTIMO` `texto` — resultado del último test (derivado)

### 3.15c Fase clínica (Punto 6) — **estructurada + al texto**
131. `FASE_JSON` `json` — arreglo de fases (multi‑selección) del catálogo
> Catálogo inicial: *Reanimación inicial · Protección pulmonar · Neuroprotección · Postoperatorio
> inmediato · Espera de second look · Weaning · Rehabilitación* (ampliable en `CONFIG`/`CATALOGOS`).
> Se incluye además en el texto clínico generado.

### 3.16 Planes, firma y generado
`PLAN_PLANES` `texto` · `PLAN_NOTA_TURNO` `texto` · `PLAN_FIRMA_KINE` `texto`
· `TEXTO_GENERADO` `texto` — narrativa clínica autogenerada

> **`JSON_SNAPSHOT` se ELIMINA** (decisión), **pero solo tras promover los campos huérfanos a
> columnas** (ver `CONTRASTE.md`). Hoy ese blob es el único lugar donde sobreviven ~90 campos del
> formulario; si se borra antes de promoverlos, se pierden. Secuencia: promover → blob redundante → borrar.

> **⚠️ Esta lista de EVOLUCIONES está INCOMPLETA a propósito.** El contraste con el formulario
> (`CONTRASTE.md`) reveló ~90 campos que hoy no son columna (aislamiento, decanulación, IMT,
> terapia respiratoria, PVE, extubación, evaluación por turno, estado final de VA…). Al aprobar su
> promoción (§5 de `CONTRASTE.md`), se agregan aquí y el total sube a **~190–200 columnas**.
> Las secciones 3.1–3.16 de arriba son la **base heredada ya limpia**; falta incorporar los huérfanos.

### 3.17 EVOLUCIONES_ARCHIVO
**Mismo esquema exacto** que EVOLUCIONES. Recibe las filas del episodio al egresar (D5). Los repos
leen de EVOLUCIONES (activo) para el panel y de EVOLUCIONES_ARCHIVO para consultas históricas.

---

## 4. PROCEDIMIENTOS  · `headerRows: 1`

1. `ID_PROC` `texto` · 2. `ID_EVOLUCION` `texto` · 3. `ID_CAMA` `texto` · 4. `PATIENT_ID` `uuid`
· 5. `FECHA` `fecha` · 6. `TURNO` `enum(Dia|Noche)` · 7. `TIPO_PROC` `texto` · 8. `NOMBRE_PROC` `texto`
· 9. `DESCRIPCION` `texto` · 10. `AUTOR_EMAIL` `email` · 11. `TIMESTAMP` `ts`

> Cambio vs v1: +`PATIENT_ID`, +`AUTOR_EMAIL`.

---

## 5. TIMELINE  · `headerRows: 1`

1. `ID_HITO` `texto` · 2. `ID_CAMA` `texto` · 3. `PATIENT_ID` `uuid` · 4. `FECHA` `fecha`
· 5. `TURNO` `enum(Dia|Noche)` · 6. `TIPO` `enum(ingreso|egreso|via_aerea|procedimiento|kine|general)`
· 7. `TEXTO` `texto` · 8. `AUTOR` `texto` · 9. `AUTOR_EMAIL` `email` · 10. `TIMESTAMP` `ts`

> Cambio vs v1: `PATIENT_ID` pasa a posición fija (no columna al final); +`AUTOR_EMAIL`.

---

## 6. ARCHIVO_PACIENTES  · `headerRows: 1`

Snapshot congelado de cada episodio egresado.

1. `ID_ARCHIVO` `texto` · 2. `PATIENT_ID` `uuid` · 3. `CAMA_ORIGEN` `texto` · 4. `COD_PACIENTE` `texto`
· 5. `FECHA_INGRESO` `fecha` · 6. `FECHA_EGRESO` `fecha` · 7. `DIAS_TOTAL` `entero` · 8. `DIAS_VM_TOTAL` `entero`
· 9. `DIAS_VA_TOTAL` `entero` · 10. `NOMBRE` `texto` · 11. `EDAD` `entero` · 12. `SEXO` `enum(M|F)`
· 13. `DIAGNOSTICO` `texto` · 14. `DIAG_REM` `texto` · 15. `MOTIVO_EGRESO` `texto` · 16. `DESTINO_EGRESO` `texto`
· 17. `KTR_TOTAL` `entero` · 18. `TURNOS_VM` `entero` · 19. `TURNOS_KTM` `entero` · 20. `TURNOS_KTMC` `entero`
· 21. `EXTUBACION_OK` `bool` · 22. `REINTUBACION` `bool` · 23. `BARTHEL_INGRESO` `entero` · 24. `BARTHEL_EGRESO` `entero`
· 25. `FSS_EGRESO` `entero` · 26. `MRC_SS_EGRESO` `entero` · 27. `FIRMA_RESPONSABLE` `texto` · 28. `AUTOR_EMAIL` `email`
· 29. `OBSERVACIONES` `texto` · 30. `TIMELINE_JSON` `json` · 31. `APNEA_RESULTADO` `texto` · 32. `APNEA_MOTIVO` `texto`
· 33. `APNEA_TEXTO` `texto`

> Cambios vs v1: `PATIENT_ID` y `COD_PACIENTE` arriba; +`DESTINO_EGRESO`, +`AUTOR_EMAIL`; −`RUT`.
> **`JSON_BACKUP` eliminado (decisión):** con `EVOLUCIONES_ARCHIVO` + `TIMELINE_JSON` se reconstruye
> el detalle. Las columnas de outcome (FSS/MRC/apnea) ahora **sí** las llena el modal de egreso (fix del informe).

---

## 7. KINESIOLOGOS  · `headerRows: 1`

> Renombrada desde `KINESIOTERAPEUTAS` → `KINESIOLOGOS` (término correcto en Chile).

Catálogo de firmas ↔ identidad (clave de la auditoría, D2/D1b).

1. `FIRMA` `texto` — sigla (ej. `DMV`) · 2. `NOMBRE` `texto` · 3. `EMAIL` `email` — cuenta Google que puede usar esta firma
· 4. `APOYO` `bool` · 5. `ACTIVO` `bool`

> Cambio vs v1: +`EMAIL` (liga firma a identidad verificada), +`ACTIVO`.
> **Cardinalidad 1:1** (decisión): un email ↔ una firma. Al guardar, si el email verificado no
> coincide con el dueño de la firma seleccionada, **se rechaza** la escritura (nadie firma por otro).

---

## 8. ESTADISTICAS_REM  · `headerRows: 1`

1. `MES` `texto` (`yyyy-MM`) · 2. `INGRESOS` `entero` · 3. `DIAS_CAMA` `entero` · 4. `TURNOS_VM` `entero`
· 5. `TURNOS_KTM` `entero` · 6. `TURNOS_KTMC` `entero` · 7. `SUM_KTR` `entero` · 8. `KTR_PROM` `decimal`
· 9. `DIAG_JSON` `json` · 10. `TEXTO_REM` `texto` · 11. `GENERADO_TS` `ts` · 12. `GENERADO_POR` `email`

> `INGRESOS` = episodios únicos por `PATIENT_ID` (fin del doble conteo, fix del informe).

---

## 9. TURNOS  · `headerRows: 1`

1. `KEY` `texto` (`yyyy-MM-dd-Dia|Noche`) · 2. `DATA` `json` (`{team:[...], assign:{...}}`) · 3. `TIMESTAMP` `ts`

---

## 10. REINTUBACIONES  · `headerRows: 1`

1. `ID_REINTUB` `texto` · 2. `PATIENT_ID` `uuid` · 3. `TIMESTAMP` `ts` · 4. `FECHA` `fecha` · 5. `TURNO` `enum(Dia|Noche)`
· 6. `ID_CAMA` `texto` · 7. `ID_EVOLUCION` `texto` · 8. `NOMBRE` `texto` · 9. `COD_PACIENTE` `texto` · 10. `DIAGNOSTICO` `texto`
· 11. `TIPO_DESVINCULACION` `texto` · 12. `MOTIVO` `texto` · 13. `SOPORTE_PREVIO` `texto` · 14. `TIEMPO_EXTUBADO` `texto`
· 15. `HORA_REINTUBACION` `texto` · 16. `KINESIOLOGO` `texto` · 17. `AUTOR_EMAIL` `email`

> Cambios vs v1: +`PATIENT_ID`, +`AUTOR_EMAIL`; −`RUT`(→`COD_PACIENTE`).

---

## 11. ENTREGAS_TURNO  · `headerRows: 1`

1. `ID` `texto` · 2. `TIMESTAMP` `ts` · 3. `FECHA` `fecha` · 4. `TURNO` `enum(Dia|Noche)` · 5. `KINE_ENTREGA` `texto`
· 6. `KINE_RECIBE` `texto` · 7. `AUTOR_EMAIL` `email` · 8. `CAMAS_N` `entero` · 9. `OCUPADAS` `entero` · 10. `EN_VM` `entero`
· 11. `CAMAS_IDS` `texto` · 12. `NOTAS` `texto` · 13. `SNAPSHOT_JSON` `json`

---

## 12. AUDIT_LOG  · `headerRows: 1`  *(nuevo)*

Bitácora de toda acción de escritura. Base de la trazabilidad real.

1. `ID` `texto` · 2. `TIMESTAMP` `ts` · 3. `USUARIO_EMAIL` `email` — identidad verificada (GIS)
· 4. `FIRMA` `texto` — firma declarada · 5. `ACCION` `texto` (ej. `GUARDAR_EVOLUCION`) · 6. `ENTIDAD` `texto` (hoja/entidad)
· 7. `ID_ENTIDAD` `texto` · 8. `PATIENT_ID` `uuid` · 9. `RESUMEN` `texto`

> Decisión: **se elimina `IP_UA`** — en Apps Script la IP del cliente no es obtenible de forma
> fiable. La traza real es `USUARIO_EMAIL` (verificado) + `TIMESTAMP`, que basta para auditoría.

---

## 13. IMPORTAR  · `headerRows: 1`  (staging)

Plantilla de carga masiva. Sin RUT.

1. `CAMA` · 2. `NOMBRE` · 3. `EDAD` · 4. `SEXO` · 5. `FECHA_INGRESO` · 6. `DIAGNOSTICO` · 7. `DIAG_REM`
· 8. `VIA_SOPORTE` · 9. `TALLA`

> La importación genera `PATIENT_ID` + `COD_PACIENTE` por fila (fix del informe).

---

## 14. Reglas de generación de `COD_PACIENTE`

Formato: `ddmmyy` + `Inicial_nombre(may)` + `primer_apellido(min)` + `inicial_2º_apellido(min)` + `edad`.
Ejemplo: *Diego Melo Villagrán, 34, ingreso 07/07/26* → **`070726Dmelov34`**.

Reglas a fijar:
- Normalizar acentos/`ñ` (Villagrán→v; Muñoz→m). Sin espacios ni signos.
- Sin segundo apellido → se omite esa inicial.
- Apellido compuesto → primer token.
- **Primer apellido con tope de 8 caracteres** (decisión): Villagrán → `villagra`. Es solo un código.
- Colisión (mismo `COD` activo) → sufijo `-2`, `-3`… El **UUID sigue siendo la clave**; el `COD` es etiqueta.
- Edad: congelada al ingreso (no se recalcula si cumple años hospitalizado).

---

## 15. Resumen de conteos por hoja

| Hoja | headerRows | Nº columnas |
|------|-----------|-------------|
| CONFIG | 1 | 2 |
| CAMAS_ESTADO | 2 | 40 |
| EVOLUCIONES | 3 | 134 |
| EVOLUCIONES_ARCHIVO | 3 | 134 (idéntico) |
| PROCEDIMIENTOS | 1 | 11 |
| TIMELINE | 1 | 10 |
| ARCHIVO_PACIENTES | 1 | 33 |
| KINESIOLOGOS | 1 | 5 |
| ESTADISTICAS_REM | 1 | 12 |
| TURNOS | 1 | 3 |
| REINTUBACIONES | 1 | 17 |
| ENTREGAS_TURNO | 1 | 13 |
| AUDIT_LOG | 1 | 10 |
| IMPORTAR | 1 | 9 |

---

## 16. Estado de decisiones del esquema

### Cerradas ✅
- **Renombre** `KINESIOTERAPEUTAS` → `KINESIOLOGOS`.
- **`JSON_SNAPSHOT` / `JSON_BACKUP`:** se eliminan (tras promover huérfanos — ver `CONTRASTE.md`).
- **`COD_PACIENTE`:** primer apellido con tope de **8 caracteres**.
- **email ↔ firma:** **1:1**, con rechazo si no coincide (nadie firma por otro).
- **`AUDIT_LOG.IP_UA`:** eliminado (no fiable en Apps Script).
- **`PROC_RESUMEN` / `PROC_CANTIDAD`:** se mantienen materializados (reflejan la carga diaria).
- **Punto 6 clínico:** apnea y BDT repetibles (`APNEA_JSON` / `BDT_JSON`); `FASE_JSON` estructurada + al texto.

### Pendientes (en `CONTRASTE.md` §5, para completar EVOLUCIONES)
1. Aprobar la **promoción de los ~90 campos huérfanos** a columnas (¿todos o podas?).
2. Resolver la **redundancia `EVAL_T_*` vs `EGR_*`** (recomendado: quedarse con `EVAL_T_*`).
3. **Podar o reactivar** el ventilatorio avanzado en desuso (P0.1, ΔPocc, Pmusc, auto‑PEEP, rise time).
4. Confirmar **nombres unificados** (§3 de `CONTRASTE.md`).
5. Confirmar **catálogo de fases** y dónde se amplía (CONFIG vs hoja `CATALOGOS`).
6. **Reconectar `REINTUBACIONES`** al nuevo bloque `EXT_*`.

> Al cerrar estos 6 puntos, EVOLUCIONES queda completo (~190–200 columnas), el esquema se congela
> y se traduce a `esquema.gs`. Recién ahí empieza F1.
