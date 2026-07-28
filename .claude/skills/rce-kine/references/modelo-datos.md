# Modelo de datos de RCE-KINE

19 hojas en un único archivo de Google Sheets. La definición autoritativa está en
`v2/esquema.gs` (constante `HOJAS`) y `testEsquema()` la verifica; este documento
resume lo que necesita quien lee la base para analizarla.

**Ojo con los encabezados:** `EVOLUCIONES` y `EVOLUCIONES_ARCHIVO` tienen
**3 filas de encabezado** (`headerRows: 3`); `CAMAS_ESTADO` tiene 2; el resto, 1.
Un lector que asuma una sola fila de títulos leerá basura en las primeras filas.

## Identidad: dos niveles

| Campo | Qué identifica | Dónde vive |
|---|---|---|
| `PATIENT_ID` | **el episodio** (una estadía en la unidad) — UUID | EVOLUCIONES, TIMELINE, PROCEDIMIENTOS, REINTUBACIONES, ARCHIVO_PACIENTES, CAMAS_ESTADO |
| `RUT` | **la persona** (permite ver reingresos y cruzar internamente) | solo CAMAS_ESTADO y ARCHIVO_PACIENTES |
| `ID_CAMA` | la cama (1-18) — **no** identifica al paciente: se reutiliza | todas |
| `COD_PACIENTE` | código interno legible del episodio | CAMAS_ESTADO, ARCHIVO_PACIENTES |

Reglas:
- **Todo análisis identifica por `PATIENT_ID`.** Un mismo paciente reingresado
  tiene dos `PATIENT_ID` distintos y eso es correcto: son dos episodios.
- Los **reingresos** se detectan por `RUT` con más de un `PATIENT_ID`
  (normalizar antes: la app usa `_rutNormal`, que deja `12345678-5`, y valida
  dígito verificador módulo 11).
- Un **traslado de cama** re-estampa `ID_CAMA` en EVOLUCIONES y TIMELINE
  conservando el `PATIENT_ID` (`_reetiquetarEpisodioACama`). Nunca reconstruir la
  historia de un paciente por cama.
- `PAC_RUT` puede viajar en el guardado como dato transitorio, pero **no se
  persiste** en EVOLUCIONES.

## Las hojas que importan para análisis

### EVOLUCIONES · EVOLUCIONES_ARCHIVO — el corazón (302 columnas)
Grano: **una fila por paciente × fecha × turno**. Mismo esquema en ambas: la
hoja `_ARCHIVO` recibe las filas al dar de alta, así que **el histórico exige
leer las dos**.

Claves e identificación: `ID_EVOLUCION` (`CAMA_<idCama>_<fecha>-<turno>`),
`ID_CAMA`, `PATIENT_ID`, `TURNO_KEY` (`AAAA-MM-DD-Dia|Noche`), `FECHA`, `TURNO`,
`ES_INGRESO`, `DIA_ESTADIA`, `DIAS_VM`, `DIAS_VM_PREVIOS`, `DIAS_VNI_PREVIOS`,
`PLAN_FIRMA_KINE` (iniciales del kinesiólogo del turno).

Familias de columnas (prefijo → contenido):

| Prefijo | Contenido |
|---|---|
| `PAC_*` | copia del paciente al momento del turno: `PAC_NOMBRE`, `PAC_EDAD`, `PAC_SEXO`, `PAC_TALLA`, `PAC_PESO_IDEAL`, `PAC_DIAGNOSTICO`, `PAC_DIAG_REM`, `PAC_CHARLSON`, `PAC_BARTHEL`, `PAC_AISLAMIENTO` |
| `VENT_*` | vía aérea y ventilación: `VENT_VIA_AEREA`, `VENT_SOPORTE`, `VENT_MODO`, `VENT_VT`, `VENT_FR`, `VENT_PEEP`, `VENT_PS`, `VENT_FIO2`, `VENT_SPO2`, `VENT_PMAX`, `VENT_PMEDIA`, `VENT_PPL`, `VENT_AUTOPEEP`, `VENT_PAFI`, `VENT_TOT_NUM`, `VENT_TOT_CM`, `VENT_TQT_CALIBRE`, `VENT_H_ACTIVA`… y los `*_FINAL` (estado al cierre del turno, tras una transición) |
| `CALC_*` | derivados calculados por la app: `CALC_ML_KG`, `CALC_DP` (driving pressure), `CALC_TOBIN`, `CALC_IE`, `CALC_VOL_MIN`, `CALC_IROX`, `CALC_CESR` |
| `RESP_*` | kinesiterapia respiratoria: **`RESP_KTR_CANT`** (sesiones del turno), `RESP_SECR_CAR`, `RESP_SECR_QTY`, posicionamiento (`RESP_POS_PRONO`, `RESP_POS_SED`…), `RESP_PRONO_HORA`, cultivos (`RESP_CULT_FECHAS`) |
| `KTM_*` | terapia física: **`KTM_REALIZADA`**, `KTM_SUSPENDIDA`, `KTM_NO_REALIZADA`, `KTM_NO_RAZON`, `KTM_NIVEL_KTR`, **`KTM_CANT`** (sesiones), `KTM_ASISTENCIA`, `KTM_IMT`, `KTM_EMS` (+ sus parámetros), `KTM_CONTRA_TIPO` |
| `EVAL_*` | evaluación funcional: `EVAL_T_MRC` (+ ítems `EVAL_MRC_D1..D6`, `EVAL_MRC_I1..I6`), `EVAL_T_FSS` (+ `EVAL_FSS_IT1..5`), `EVAL_IMS`, `CPAX_TOTAL`, `EVAL_T_DINAMO`, `EVAL_T_PIM`, `EVAL_T_PEM`, `EVAL_T_FEM`, ecografía diafragmática (`EVAL_T_GROSOR`, `EVAL_T_FED_D/I`, `EVAL_T_EXC_D/I`, `EVAL_T_HECKMATT`), `EVAL_DEGLUCION` |
| `SED_*` | sedación y conciencia: `SED_SAS`, `SED_S5Q`, `SED_GCS_O/V/M/TOT`, `SED_COOPERACION`, `SED_BNM`, `SED_CAM_ICU` |
| `HEMO_*` | hemodinamia: `HEMO_ESTADO` (estable/inestable), `HEMO_DVA`, `HEMO_NUM_DVA`, `HEMO_PAM`, `HEMO_FC`, `HEMO_PIC`, `HEMO_PPC` |
| `EXT_*` `INTUB_*` `TQT_*` `DECAN_*` | eventos de vía aérea (ver más abajo) |
| `PVE_*` | prueba de ventilación espontánea: `PVE_VAL` (`si`/`no`), `PVE_RESULTADO`, `PVE_JSON` (criterios), `PVE_SC_RAZON` |
| `PROC_*` | procedimientos del turno: `PROC_JSON` (lista), `PROC_RESUMEN`, `PROC_CANTIDAD` |
| `DISP_*` | reloj de dispositivos: `DISP_HME_FECHA`, `DISP_HEPA_FECHA`, `DISP_TC_FECHA` (sonda de aspiración/Trachcare), `DISP_HUMID_FECHA` |
| `FASE_JSON` | fases clínicas seleccionadas (agudo, weaning, rehabilitación…) |
| `TEXTO_AUTO` / `TEXTO_MANUAL` | texto clínico generado por el motor vs. el editado a mano — se guardan los dos para poder refinar el motor comparándolos |

**Eventos de vía aérea** (se registran **manualmente** por decisión clínica; las
alertas solo detectan olvidos, nunca automatizan el registro):

| Evento | Columnas |
|---|---|
| Intubación | `INTUB_OCURRIO`, `INTUB_HORA`, `INTUB_DET`, **`INTUB_SOP_PREVIO`** (`Ambiente` \| `Naricera-NRC` \| `CNAF` \| `VNI`) |
| Extubación | `EXT_OCURRIO`, **`EXT_TIPO`**, `EXT_HORA`, `EXT_MOTIVO`, `EXT_TS` |
| Traqueostomía | `TQT_OCURRIO` |
| Decanulación | `DECAN_OCURRIO` |

`EXT_TIPO` toma exactamente estos valores:

| Valor | Significado | Cuenta como |
|---|---|---|
| `protocolo` | extubación programada, cumpliendo protocolo | programada |
| `sin_protocolo` | programada pero sin protocolo | programada **y** fuera de protocolo |
| `sin_condiciones` | programada con ≤24 h de VM | programada **y** fuera de protocolo |
| `autoextubacion` | el paciente se extuba solo | accidental (**no** programada) |
| `accidental` | extubación accidental durante manejo | accidental (**no** programada) |

### CAMAS_ESTADO — la foto de ahora (2 filas de encabezado)
Una fila por cama (1-18) con el ocupante actual: `ID_CAMA`, `OCUPADA`, `NOMBRE`,
`RUT`, `PATIENT_ID`, `EDAD`, `SEXO`, `DIAGNOSTICO`, `VIA_AEREA`, `SOPORTE`,
`MODO`, `FECHA_INGRESO`, `FECHA_INICIO_VA`, `FECHA_INICIO_SOPORTE`,
`FECHA_INICIO_VM`, `FECHA_INICIO_TQT`, `DIAS_VM_PREVIOS`, `DIAS_VNI_PREVIOS`,
`N_REINTUB`, `FASE_JSON`, los `DISP_*_FECHA` + `DISP_CONFIRMADO`.
Es estado mutable: **no sirve para series temporales**, sí para saber quién está
en cama hoy y para los relojes de dispositivos.

### ARCHIVO_PACIENTES — un registro por episodio cerrado
`PATIENT_ID`, `RUT`, `FECHA_INGRESO`, `FECHA_EGRESO`, `DIAS_TOTAL`,
`DIAS_VM_TOTAL`, `DIAS_VA_TOTAL`, `MOTIVO_EGRESO`, `DESTINO_EGRESO`,
`KTR_TOTAL`, `TURNOS_VM`, `TURNOS_KTM`, `EXTUBACION_OK`, `REINTUBACION`,
`BARTHEL_INGRESO/EGRESO`, `MRC_SS_EGRESO`, `FSS_EGRESO`, `CPAX_EGRESO`,
`DINAMO_EGRESO`, `DAUCI`, `FASE_FINAL`, `TIMELINE_JSON`.
**La mortalidad se deduce de `MOTIVO_EGRESO`** (contiene «Fallecimiento»); no hay
un booleano de fallecido.

### TIMELINE — hitos con hora
`ID_HITO`, `ID_CAMA`, `PATIENT_ID`, `FECHA`, `TURNO`, `TIPO`, `TEXTO`, `AUTOR`,
`AUTOR_EMAIL`, `TIMESTAMP`. Tipos usados: `evento`, `dispositivo`,
`procedimiento`, `cultivo`, más los hitos clínicos (intubación, extubación,
traqueostomía…). Es la fuente narrativa; los conteos salen de EVOLUCIONES.

### REINTUBACIONES — una fila por reintubación, **con hora**
`PATIENT_ID`, `FECHA`, **`HORA_REINTUBACION`**, `ID_CAMA`, `ID_EVOLUCION`,
`TIPO_DESVINCULACION`, `MOTIVO`, `SOPORTE_PREVIO`, `TIEMPO_EXTUBADO`,
`KINESIOLOGO`. Es la hoja que permite calcular el fracaso de extubación con
precisión horaria.

### PROCEDIMIENTOS — desglose por procedimiento
`ID_PROC`, `ID_EVOLUCION`, `ID_CAMA`, `PATIENT_ID`, `FECHA`, `TURNO`,
**`TIPO_PROC`**, `NOMBRE_PROC`, `DESCRIPCION`, `TIMESTAMP`.
`TIPO_PROC='anexo'` marca los anotados **después** de cerrar la evolución (con el
botón ➕ de eventos rápidos). Cuidado al sumar: los procedimientos también están
en `PROC_JSON` de EVOLUCIONES — **no sumar las dos fuentes**, elegir una.

### INDICADORES_HISTORICO — serie mensual agregada
`MES`, `FUENTE`, `PACIENTE_DIAS`, `DIAS_VM`, `EXTUBACIONES`, `REINTUB_48H`,
`REINTUB_24H`, `AUTOEXTUBACIONES`, `FUERA_PROTOCOLO`, `PVE`, `TQT`, `ATENCIONES`,
`EGRESOS`, `FALLECIDOS`, `NOTAS`.
Solo agregados, sin identidad. `FUENTE` distingue `planilla` (histórico anterior
al sistema) de `rce` (calculado por la plataforma); el tablero dibuja la
tendencia uniendo ambas y las pinta distinto. **Las definiciones de cada columna
deben ser las de `indicadores.md`** o la serie histórica y la del sistema no son
comparables.

### Otras
`CONFIG` (parámetros: `NUM_CAMAS`, frecuencias de dispositivos `FREC_HME_DIAS`
=2 / `FREC_HEPA_DIAS`=3 / `FREC_SONDA_DIAS`=3, umbrales de alerta, banners),
`CATALOGOS` + `CAT_MATRICES` (listas y matrices clínicas: fases, procedimientos,
niveles KTM), `KINESIOLOGOS` (roster: firma, nombre, `TRATAMIENTO` = «Klgo.» o
«Klga.»), `TURNOS` (asignación de camas por turno), `VENTILADORES` +
`MOVIMIENTOS_VM` (inventario de equipos), `ENTREGAS_TURNO`, `ESTADISTICAS_REM`,
`AUDIT_LOG` (toda escritura queda auditada con correo y firma), `IMPORTAR`.

## Agregar a paciente-día: qué hacer con los dos turnos

No hay una regla única; depende de la variable:

| Tipo de variable | Regla correcta |
|---|---|
| Conteos de actividad (`RESP_KTR_CANT`, `KTM_CANT`, procedimientos) | **sumar** los dos turnos |
| Eventos (extubación, intubación, TQT, PVE) | **son del turno**: contar la fila donde ocurrió, nunca duplicar al día |
| Parámetros ventilatorios (PEEP, FiO2, VT…) | elegir explícitamente: turno día (comparable con el registro en papel) o el último del día |
| Evaluaciones funcionales (MRC, FSS, CPAx, IMS, PIM/PEM) | **solo turno día** — de noche el bloque está oculto por diseño y no se registra |
| Estado (fase, soporte, vía aérea) | el último valor del día (o `*_FINAL` del turno noche) |
| Dispositivos (`DISP_*`) | por **fecha efectiva** (el turno noche fecha al día siguiente) |

Días-VM = cantidad de **paciente-días con `VENT_SOPORTE='VM'`** (no la resta de
fechas), que es como los calcula la plataforma.
