# Esquema de datos — RCE‑KINE v2 (fuente única de verdad)

> Define **todas** las hojas y columnas. De aquí se generan índices, encabezados, lectura,
> escritura y migración (`esquema.gs`). Regla de oro: **el índice de una columna = su posición
> en esta lista** (1‑based). No se hardcodea ningún número en ningún otro lado.
>
> Estado: **candidato a congelar.** Incorpora todas las decisiones (D1–D9) y el contraste
> formulario↔hoja (`CONTRASTE.md`): huérfanos promovidos, ventilatorio avanzado reactivado,
> nombres unificados, apnea/BDT repetibles, fase clínica. Relacionado: `PLAN_PROYECTO.md`.

---

## 0. Convenciones

**Tipos:** `texto` · `entero` · `decimal` · `bool` (TRUE/FALSE) · `fecha` (ISO `yyyy-MM-dd`) ·
`ts` (`yyyy-MM-dd HH:mm:ss`, TZ America/Santiago) · `uuid` · `email` · `json` · `enum(...)`.

**Naming:** `MAYÚSCULAS_CON_GUION_BAJO`, prefijo por bloque. Índice = posición en la lista.

**Globales v2:** −`RUT` → +`COD_PACIENTE` (D9) · +`PATIENT_ID` (uuid interno) en toda hoja clínica ·
+`AUTOR_EMAIL` (identidad GIS verificada) en toda escritura · se eliminan `JSON_SNAPSHOT`/`JSON_BACKUP`.

---

## 1. CONFIG · `headerRows: 1`
| # | Columna | Tipo |
|---|---------|------|
| 1 | CLAVE | texto |
| 2 | VALOR | texto |

**Claves semilla:** `NUM_CAMAS`=18 · `TIMEZONE`=America/Santiago · `ULTIMO_BACKUP` ·
`OAUTH_CLIENT_ID` · `BACKUP_MAX_DIARIOS`=30 · `VERSION_ESQUEMA`=2.0

---

## 2. CATALOGOS · `headerRows: 1`  *(nueva — listas ampliables sin tocar código)*

Catálogos controlados (fases clínicas, motivos, destinos, etc.). Se amplían agregando filas.

| # | Columna | Tipo | Nota |
|---|---------|------|------|
| 1 | TIPO | texto | p.ej. `FASE_CLINICA`, `MOTIVO_EGRESO`, `DESTINO` |
| 2 | VALOR | texto | Etiqueta visible |
| 3 | ORDEN | entero | Orden de despliegue |
| 4 | ACTIVO | bool | Permite retirar sin borrar histórico |

**Semilla `FASE_CLINICA` (D‑Punto 6, ampliable):** Reanimación inicial · Protección pulmonar ·
Neuroprotección · Postoperatorio inmediato · Espera de second look · Weaning · Rehabilitación.

---

## 3. CAMAS_ESTADO · `headerRows: 2`

Estado **actual** de cada cama (censo). Una fila por cama.

**Identidad/estado:** 1.`ID_CAMA` `texto` · 2.`OCUPADA` `bool` · 3.`STATUS_CAMA` `enum(Libre|Ocupada)`
· 4.`PATIENT_ID` `uuid` · 5.`COD_PACIENTE` `texto`
**Paciente:** 6.`NOMBRE` · 7.`EDAD` `entero` · 8.`SEXO` `enum(M|F)` · 9.`TALLA_CM` `decimal`
· 10.`PESO_IDEAL_KG` `decimal` · 11.`BARTHEL` `entero` · 12.`ECF` · 13.`DIAGNOSTICO` · 14.`DIAG_REM`
· 15.`AISLAMIENTO` `bool` · 16.`AISL_MICRO` `texto`
**Vía aérea/ventilación:** 17.`VIA_AEREA` · 18.`TOT_NUMERO` · 19.`TOT_CM_LABIO` · 20.`TQT_TIPO`
· 21.`SOPORTE` · 22.`MODO`
**Fechas de conteo:** 23.`FECHA_INGRESO` `fecha` · 24.`FECHA_INICIO_VA` `fecha` · 25.`FECHA_INICIO_SOPORTE` `fecha`
**Fase/KTM/firma:** 26.`FASE_JSON` `json` · 27.`KTM_NIVEL` · 28.`KTM_SUSP` `bool` · 29.`FIRMA_KINE`
· 30.`AUTOR_EMAIL` `email`
**Cachés de render (snapshot por turno):** 31.`TEXTO_EVO_DIA` · 32.`TEXTO_EVO_NOCHE` · 33.`ULTIMO_TURNO_KEY`
· 34.`TIMELINE_JSON` `json` · 35.`KTR_DIA` `entero` · 36.`KTM_DIA` · 37.`PROC_DIA` · 38.`FIRMA_DIA`
· 39.`KEY_DIA` · 40.`KTR_NOCHE` `entero` · 41.`PROC_NOCHE` · 42.`FIRMA_NOCHE` · 43.`KEY_NOCHE`

> vs v1: −`RUT`(→`COD_PACIENTE`), −`JSON_BACKUP`; +`PATIENT_ID`, +`AISLAMIENTO`/`AISL_MICRO`, +`FASE_JSON`, +`AUTOR_EMAIL`. **43 columnas.**

---

## 4. EVOLUCIONES · `headerRows: 3`  — **LISTA DEFINITIVA**

Núcleo: una fila por turno (`ID_EVOLUCION = CAMA_<id>_<turnoKey>`). Al egresar, las filas del
episodio se mueven a `EVOLUCIONES_ARCHIVO` (mismo esquema). Todo lo que el formulario captura queda
como columna → consultable, estadístico y **replicable turno a turno** (Punto 1).

### A. Metadatos e identidad
1.`ID_EVOLUCION` · 2.`ID_CAMA` (cama real del turno) · 3.`PATIENT_ID` `uuid` · 4.`COD_PACIENTE`
· 5.`TURNO_KEY` · 6.`FECHA` `fecha` · 7.`TURNO` `enum(Dia|Noche)` · 8.`ES_INGRESO` `bool`
· 9.`ES_REINGRESO` `bool` · 10.`TIMESTAMP` `ts` · 11.`AUTOR_EMAIL` `email` · 12.`DIA_ESTADIA` `entero`
· 13.`DIAS_VM` `entero` · 14.`DIAS_VA` `entero`

### B. Identificación del paciente (snapshot del turno)
15.`PAC_NOMBRE` · 16.`PAC_COD` · 17.`PAC_EDAD` `entero` · 18.`PAC_SEXO` `enum(M|F)` · 19.`PAC_TALLA` `decimal`
· 20.`PAC_PESO_IDEAL` `decimal` · 21.`PAC_BARTHEL` `entero` · 22.`PAC_ECF` · 23.`PAC_DIAGNOSTICO`
· 24.`PAC_DIAG_REM` · 25.`PAC_AISLAMIENTO` `bool` · 26.`PAC_AISL_MICRO` · 27.`PAC_AISL_LISTA` `json`

### C. Fase clínica
28.`FASE_JSON` `json` (multi‑selección desde `CATALOGOS.FASE_CLINICA`; también va al texto)

### D. Sedación y conciencia
29.`SED_TIPO` · 30.`SED_SAS` · 31.`SED_S5Q` · 32.`SED_COOPERACION` · 33.`SED_CAM_ICU` · 34.`SED_GCS_O` `entero`
· 35.`SED_GCS_V` `entero` · 36.`SED_GCS_M` `entero` · 37.`SED_GCS_TOT` `entero` · 38.`SED_BNM` `bool`

### E. Hemodinamia
39.`HEMO_ESTADO` · 40.`HEMO_DVA` · 41.`HEMO_MULTI_DVA` `bool` · 42.`HEMO_NUM_DVA` `entero`
· 43.`HEMO_TENDENCIA` `bool` · 44.`HEMO_TEND_TIPO`

### F. Examen físico
45.`EX_MP` · 46.`EX_RUIDOS` · 47.`EX_RUIDOS_LOC`  *(unifica `EX_RUIDOS_MAN`)*

### G. Vía aérea — configuración
48.`VENT_VIA_AEREA` · 49.`VA_EXTERNO` `bool` · 50.`VA_EXTERNO_DIAS` `entero` · 51.`VENT_TOT_NUM`
· 52.`VENT_TOT_CM` · 53.`TOT_FIJACION` · 54.`VENT_TQT_TIPO` · 55.`VENT_TQT_CALIBRE` · 56.`FECHA_INICIO_TQT` `fecha`
· 57.`VENT_SOPORTE` · 58.`VENT_MODO` · 59.`VENT_ADAPTADO` · 60.`VENT_H_ACTIVA` `bool`

### H. Contadores por episodio
61.`DIAS_VM_PREVIOS` `entero` · 62.`FECHA_INICIO_VM` `fecha` · 63.`DIAS_VNI_PREVIOS` `entero`
· 64.`FECHA_INICIO_VNI` `fecha` · 65.`N_REINTUB` `entero`

### I. Ventilatorio — parámetros  *(incluye reactivados, Punto 3)*
66.`VENT_VT` · 67.`VENT_FR` · 68.`VENT_PEEP` · 69.`VENT_PMAX` · 70.`VENT_PMEDIA` · 71.`VENT_PPL`
· 72.`VENT_AUTOPEEP` · 73.`VENT_PINSP` · 74.`VENT_PS` · 75.`VENT_IPAP` · 76.`VENT_EPAP` · 77.`VENT_IPAP_MIN`
· 78.`VENT_IPAP_MAX` · 79.`VENT_VT_ASEG` · 80.`VENT_FLUJO` · 81.`VENT_TI` · 82.`VENT_FIO2` · 83.`VENT_SPO2`
· 84.`VENT_TEMP` · 85.`VENT_LITROS` · 86.`VENT_PMUSC` · 87.`VENT_P01` · 88.`VENT_DPOCC` · 89.`VENT_RISETIME`
· 90.`VENT_CAB_RSS` · 91.`VENT_CAB_RSS_DESC`  *(66–89 `decimal`)*

### J. Valores calculados (derivados)
92.`CALC_ML_KG` · 93.`CALC_VOL_MIN` · 94.`CALC_IE` · 95.`CALC_DP` · 96.`CALC_CESR` · 97.`CALC_TOBIN` · 98.`CALC_IROX`

### K. KTM / rehabilitación  *(base + extendido promovido)*
99.`KTM_REALIZADA` `bool` · 100.`KTM_SUSPENDIDA` `bool` · 101.`KTM_NO_REALIZADA` `bool` · 102.`KTM_NO_RAZON`
· 103.`KTM_NO_COMENTARIO` · 104.`KTM_CONTRA_TIPO` · 105.`KTM_CONTRA_CAT` · 106.`KTM_CONTRA_RAZON`
· 107.`KTM_CONTRA_MANUAL` · 108.`KTM_NIVEL_KTR` · 109.`KTM_ASISTENCIA` · 110.`KTM_TIEMPO_MIN` `entero`
· 111.`KTM_ALERTA` `bool` · 112.`KTM_ALERTA_CAT` · 113.`KTM_ALERTA_RAZ` · 114.`KTM_UMA`  *(unifica `VENT_UMA`)*
· 115.`KTM_IMT` `bool` · 116.`KTM_IMT_FREQ` · 117.`KTM_IMT_INT` · 118.`KTM_IMT_T` · 119.`KTM_IMT_DES`

### L. Terapia respiratoria
120.`RESP_KTR_CANT` `entero` · 121.`RESP_SIN_KTR` `bool` · 122.`RESP_SOF` `bool` · 123.`RESP_SNF` `bool`
· 124.`RESP_SET` `bool` · 125.`RESP_ATOS` `bool` · 126.`RESP_INHALO` `bool` · 127.`RESP_SECR_QTY`  *(unifica `EX_SECR_CANT`)*
· 128.`RESP_SECR_CAR`  *(unifica `EX_SECR_TIPO`)* · 129.`RESP_SECR_REOL` · 130.`RESP_CULT_FECHAS` · 131.`RESP_CULT_OBJ`

### M. Posicionamiento
132.`RESP_POS_SED` `bool` · 133.`RESP_POS_DCLD` `bool` · 134.`RESP_POS_DCLI` `bool` · 135.`RESP_POS_PRONO` `bool`
· 136.`RESP_POS_SUPINO` `bool` · 137.`RESP_POS_LIBRE` · 138.`RESP_PRONO_TS` · 139.`RESP_SUPINO_TS`
· 140.`RESP_PRONO_HORA` · 141.`RESP_SUPINO_HORA`

### N. PVE (prueba de ventilación espontánea)
142.`PVE_RESULTADO` · 143.`PVE_FR_MOTIVOS` `json` · 144.`PVE_SC_RAZON` · 145.`PVE_VAL`

### O. Extubación (EXT_*)  *(alimenta la hoja REINTUBACIONES vía `EXT_REINTUB`)*
146.`EXT_OCURRIO` `bool` · 147.`EXT_HORA` · 148.`EXT_TS` `json`  *(era `RESP_EXTUB_TS`)* · 149.`EXT_TIPO`
· 150.`EXT_MOTIVO` · 151.`EXT_POST_DET`  *(unifica `VENT_POST_EXT_VAL`)* · 152.`EXT_REINTUB` `bool`
· 153.`EXT_REINTUB_RAZ` · 154.`EXT_PE_VA` · 155.`EXT_PE_SOP` · 156.`EXT_PE_MODO`

### P. Decanulación
157.`DECAN_OCURRIO` `bool` · 158.`DECAN_TIPO` · 159.`DECAN_QUEDA_DISP` · 160.`DECAN_QUEDA_FLUJO`
· 161.`DECAN_QUEDA_SPO2` · 162.`DECAN_DET` · 163.`DECAN_RECANUL` `bool`

### Q. Estado final de vía aérea (tras extubación/decanulación)
164.`VENT_VIA_AEREA_FINAL` · 165.`VENT_SOPORTE_FINAL` · 166.`VENT_MODO_FINAL`

### R. AET (asistencia de tos / entrenamiento)
167.`AET_ACTIVA` `bool` · 168.`AET_NIVEL`

### S. Muestras microbiológicas
169.`MUE_REALIZADAS` `bool` · 170.`MUE_TIPOS_JSON` `json` · 171.`MUE_RESULTADOS_JSON` `json` · 172.`EX_CULT_RESULTADO`

### T. Evaluación funcional POR TURNO  *(reemplaza el bloque `EGR_*` — Punto 2)*
173.`EVAL_FECHA` `fecha` · 174.`EVAL_T_REALIZAR` `bool` · 175.`EVAL_NIVEL_MOTOR` · 176.`EVAL_T_MRC` `entero`
· 177.`EVAL_T_DINAMO` `decimal` · 178.`EVAL_T_FSS` `entero` · 179.`EVAL_T_PIM` `decimal` · 180.`EVAL_T_PEM` `decimal`
· 181.`EVAL_T_FEM` `decimal` · 182.`EVAL_T_GROSOR` `decimal` · 183.`EVAL_T_HALLAZGOS` · 184.`EVAL_T_PMANT_VA`

### U. Test de apnea y test de azul (BDT) — **repetibles** (Punto 6)
185.`APNEA_JSON` `json` `[{n,hora,resultado,motivo,texto}]` · 186.`APNEA_ULTIMO` (derivado)
· 187.`BDT_JSON` `json` `[{n,fecha,resultado}]` · 188.`BDT_ULTIMO` (derivado)

### V. Procedimientos
189.`PROC_JSON` `json` (fuente de verdad) · 190.`PROC_RESUMEN` (materializado) · 191.`PROC_CANTIDAD` `entero` (materializado)

### W. Planes, firma y generado
192.`PLAN_PLANES` · 193.`PLAN_NOTA_TURNO` · 194.`PLAN_FIRMA_KINE` · 195.`TEXTO_GENERADO`

> **Total: 195 columnas**, todas nombradas, consultables y replicables. Eliminadas de v1 por
> duplicidad/desuso: bloque `EGR_*` (→`EVAL_T_*`), `REINTUB_*` viejo (→`EXT_*`), `VENT_POST_EXT*`
> (→`EXT_POST_DET`), `EX_RUIDOS_MAN`/`EX_SECR_*` (→ unificados), `KTM_UMA_VAL`, `EGR_FED`,
> `EVAL_TIMEPOINT`/`EVAL_T_GROSOR_QUAD`/`EVAL_T_HECKMATT`/`EVO_UPOT`, `MUE_MECANISMO`/`MUE_OTRO`,
> `JSON_SNAPSHOT`. 🔶 *Si el flujo "Evaluaciones" usa Heckmatt/grosor cuádriceps por timepoint,
> avísame y los reincorporo como bloque propio.*

### EVOLUCIONES_ARCHIVO
Mismo esquema exacto. Recibe las filas del episodio al egresar (D5).

---

## 5. PROCEDIMIENTOS · `headerRows: 1`
1.`ID_PROC` · 2.`ID_EVOLUCION` · 3.`ID_CAMA` · 4.`PATIENT_ID` `uuid` · 5.`FECHA` `fecha` · 6.`TURNO` `enum(Dia|Noche)`
· 7.`TIPO_PROC` · 8.`NOMBRE_PROC` · 9.`DESCRIPCION` · 10.`AUTOR_EMAIL` `email` · 11.`TIMESTAMP` `ts`

---

## 6. TIMELINE · `headerRows: 1`
1.`ID_HITO` · 2.`ID_CAMA` · 3.`PATIENT_ID` `uuid` · 4.`FECHA` `fecha` · 5.`TURNO` `enum(Dia|Noche)`
· 6.`TIPO` `enum(ingreso|egreso|via_aerea|procedimiento|kine|general)` · 7.`TEXTO` · 8.`AUTOR` · 9.`AUTOR_EMAIL` `email` · 10.`TIMESTAMP` `ts`

---

## 7. ARCHIVO_PACIENTES · `headerRows: 1`
1.`ID_ARCHIVO` · 2.`PATIENT_ID` `uuid` · 3.`CAMA_ORIGEN` · 4.`COD_PACIENTE` · 5.`FECHA_INGRESO` `fecha`
· 6.`FECHA_EGRESO` `fecha` · 7.`DIAS_TOTAL` `entero` · 8.`DIAS_VM_TOTAL` `entero` · 9.`DIAS_VA_TOTAL` `entero`
· 10.`NOMBRE` · 11.`EDAD` `entero` · 12.`SEXO` `enum(M|F)` · 13.`DIAGNOSTICO` · 14.`DIAG_REM` · 15.`MOTIVO_EGRESO`
· 16.`DESTINO_EGRESO` · 17.`KTR_TOTAL` `entero` · 18.`TURNOS_VM` `entero` · 19.`TURNOS_KTM` `entero` · 20.`TURNOS_KTMC` `entero`
· 21.`EXTUBACION_OK` `bool` · 22.`REINTUBACION` `bool` · 23.`BARTHEL_INGRESO` `entero` · 24.`BARTHEL_EGRESO` `entero`
· 25.`FSS_EGRESO` `entero` · 26.`MRC_SS_EGRESO` `entero` · 27.`FIRMA_RESPONSABLE` · 28.`AUTOR_EMAIL` `email`
· 29.`OBSERVACIONES` · 30.`TIMELINE_JSON` `json` · 31.`APNEA_JSON` `json` · 32.`BDT_JSON` `json` · 33.`FASE_FINAL`

> Outcome (FSS/MRC/apnea/BDT) ahora **sí** se llena desde el modal de egreso (fix del informe).
> −`JSON_BACKUP`, −`RUT`; +`DESTINO_EGRESO`, +`AUTOR_EMAIL`, +apnea/BDT como JSON.

---

## 8. KINESIOLOGOS · `headerRows: 1`  *(renombrada desde `KINESIOTERAPEUTAS`)*
1.`FIRMA` (sigla, ej. `DMV`) · 2.`NOMBRE` · 3.`EMAIL` `email` · 4.`APOYO` `bool` · 5.`ACTIVO` `bool`

> **Cardinalidad 1:1** email↔firma. Al guardar, si el email verificado no es dueño de la firma
> elegida, **se rechaza** la escritura (nadie firma por otro).

---

## 9. ESTADISTICAS_REM · `headerRows: 1`
1.`MES` (`yyyy-MM`) · 2.`INGRESOS` `entero` · 3.`DIAS_CAMA` `entero` · 4.`TURNOS_VM` `entero` · 5.`TURNOS_KTM` `entero`
· 6.`TURNOS_KTMC` `entero` · 7.`SUM_KTR` `entero` · 8.`KTR_PROM` `decimal` · 9.`DIAG_JSON` `json` · 10.`TEXTO_REM`
· 11.`GENERADO_TS` `ts` · 12.`GENERADO_POR` `email`

> `INGRESOS` = episodios únicos por `PATIENT_ID` (fin del doble conteo).

---

## 10. TURNOS · `headerRows: 1`
1.`KEY` (`yyyy-MM-dd-Dia|Noche`) · 2.`DATA` `json` · 3.`TIMESTAMP` `ts`

---

## 11. REINTUBACIONES · `headerRows: 1`
1.`ID_REINTUB` · 2.`PATIENT_ID` `uuid` · 3.`TIMESTAMP` `ts` · 4.`FECHA` `fecha` · 5.`TURNO` `enum(Dia|Noche)`
· 6.`ID_CAMA` · 7.`ID_EVOLUCION` · 8.`NOMBRE` · 9.`COD_PACIENTE` · 10.`DIAGNOSTICO` · 11.`TIPO_DESVINCULACION`
· 12.`MOTIVO` · 13.`SOPORTE_PREVIO` · 14.`TIEMPO_EXTUBADO` · 15.`HORA_REINTUBACION` · 16.`KINESIOLOGO` · 17.`AUTOR_EMAIL` `email`

> **Reconectada (Punto 6):** se alimenta cuando `EVOLUCIONES.EXT_REINTUB = TRUE` (antes dependía de
> `REINTUB_BLOQUE`). `MOTIVO`←`EXT_REINTUB_RAZ`, `SOPORTE_PREVIO`←`EXT_PE_SOP`, `HORA`←`EXT_HORA`,
> `TIPO_DESVINCULACION`←`EXT_TIPO`.

---

## 12. ENTREGAS_TURNO · `headerRows: 1`
1.`ID` · 2.`TIMESTAMP` `ts` · 3.`FECHA` `fecha` · 4.`TURNO` `enum(Dia|Noche)` · 5.`KINE_ENTREGA` · 6.`KINE_RECIBE`
· 7.`AUTOR_EMAIL` `email` · 8.`CAMAS_N` `entero` · 9.`OCUPADAS` `entero` · 10.`EN_VM` `entero` · 11.`CAMAS_IDS`
· 12.`NOTAS` · 13.`SNAPSHOT_JSON` `json`

---

## 13. AUDIT_LOG · `headerRows: 1`  *(nueva)*
1.`ID` · 2.`TIMESTAMP` `ts` · 3.`USUARIO_EMAIL` `email` (verificado) · 4.`FIRMA` · 5.`ACCION` · 6.`ENTIDAD`
· 7.`ID_ENTIDAD` · 8.`PATIENT_ID` `uuid` · 9.`RESUMEN`

> Sin `IP_UA` (no fiable en Apps Script). La traza real = email verificado + timestamp.

---

## 14. IMPORTAR · `headerRows: 1`  (staging, sin RUT)
1.`CAMA` · 2.`NOMBRE` · 3.`EDAD` · 4.`SEXO` · 5.`FECHA_INGRESO` · 6.`DIAGNOSTICO` · 7.`DIAG_REM` · 8.`VIA_SOPORTE` · 9.`TALLA`

> La importación genera `PATIENT_ID` + `COD_PACIENTE` por fila.

---

## 15. Generación de `COD_PACIENTE`
Formato: `ddmmyy` + `Inicial_nombre(may)` + `primer_apellido(min, tope 8)` + `inicial_2º_apellido(min)` + `edad`.
Ej.: *Diego Melo Villagrán, 34, 07/07/26* → **`070726Dmelov34`**.
- Normaliza acentos/`ñ`; sin espacios. Sin 2º apellido → se omite. Compuesto → primer token.
- Colisión (mismo COD activo) → sufijo `-2`, `-3`… El **UUID sigue siendo la clave**; el COD es etiqueta.
- Edad congelada al ingreso.

---

## 16. Conteos por hoja

| Hoja | headerRows | Columnas |
|------|-----------|----------|
| CONFIG | 1 | 2 |
| CATALOGOS | 1 | 4 |
| CAMAS_ESTADO | 2 | 43 |
| EVOLUCIONES | 3 | 195 |
| EVOLUCIONES_ARCHIVO | 3 | 195 |
| PROCEDIMIENTOS | 1 | 11 |
| TIMELINE | 1 | 10 |
| ARCHIVO_PACIENTES | 1 | 33 |
| KINESIOLOGOS | 1 | 5 |
| ESTADISTICAS_REM | 1 | 12 |
| TURNOS | 1 | 3 |
| REINTUBACIONES | 1 | 17 |
| ENTREGAS_TURNO | 1 | 13 |
| AUDIT_LOG | 1 | 9 |
| IMPORTAR | 1 | 9 |

---

## 17. Nombres unificados (Punto 4) — decididos

| Nombre viejo(s) | Canónico v2 |
|-----------------|-------------|
| `PAC_RUT` | `PAC_COD` |
| `EX_RUIDOS_MAN` | `EX_RUIDOS_LOC` |
| `EX_SECR_CANT` / `EX_SECR_TIPO` | `RESP_SECR_QTY` / `RESP_SECR_CAR` |
| `VENT_POST_EXT` / `VENT_POST_EXT_VAL` | `EXT_OCURRIO` / `EXT_POST_DET` |
| `VENT_UMA` | `KTM_UMA` (movido al bloque KTM) |
| `RESP_EXTUB_TS` | `EXT_TS` |
| bloque `EGR_*` (funcional por turno) | bloque `EVAL_T_*` |
| `REINTUB_*` | bloque `EXT_*` (+ hoja REINTUBACIONES derivada) |

---

## 18. Estado del esquema

**Cerrado ✅** (D1–D9, Puntos 1–6): huérfanos promovidos · ventilatorio avanzado reactivado ·
nombres unificados · apnea/BDT repetibles · fase clínica estructurada (`CATALOGOS`) ·
REINTUBACIONES reconectada · `JSON_SNAPSHOT`/`JSON_BACKUP` eliminados · sin RUT · sin IP_UA.

**Único pendiente 🔶:** confirmar si el flujo "Evaluaciones" usa Heckmatt / grosor cuádriceps por
timepoint (§4, bloque T) para reincorporarlos. El resto queda **congelado** y listo para traducir a
`esquema.gs` (primer artefacto de la Fase 1).
