# Módulo Ingreso / Evoluciones — RCE-KINE v2

> Resumen funcional del módulo central de la app: cómo se ingresa un
> paciente, cómo se evoluciona un turno, qué condicionantes gobiernan el
> panel y qué pasa exactamente con la información al guardar.
> Base para el futuro manual de uso.

## 1. Idea central

No existe un formulario de ingreso separado: **todo pasa por el mismo
panel de evolución** (el modal heredado del v1, que la unidad ya conoce).
La diferencia es cómo se abre:

| Acción en el grid | Qué abre |
|---|---|
| Cama libre → **+ Ingresar Paciente** | Panel con la tarjeta **👤 Identificación** visible (solo existe en ingreso) |
| Cama ocupada → **📝 Evolución** | Panel sin identificación (el nombre va en el encabezado) |

Un solo botón **💾 Guardar** hace todo de forma atómica:
- En **ingreso**: crea el episodio (PATIENT_ID) + primera evolución + hito de ingreso, en un paso.
- En **evolución**: guarda (o actualiza) el turno.

## 2. Flujo de ingreso

1. **Nombre** (obligatorio) — con detector de reingreso: si coincide con
   pacientes anteriores, avisa y ofrece "Sí, es reingreso".
2. Edad, sexo, talla (→ **peso ideal automático**), Barthel, ECF,
   diagnóstico (datalist sugerido), grupo REM.
3. **Sin RUT** (decisión D9): se genera el **COD_PACIENTE**
   `ddmmyy + inicial nombre + apellido(≤8, minúsculas) + inicial 2º apellido + edad`
   (ej. `080726Dmelov34`; colisión → sufijo -2). Es el identificador humano
   en grid, egreso e historial.
4. Internamente se crea el **PATIENT_ID** (UUID, ruta única de generación)
   que amarra evoluciones, procedimientos, hitos y archivo del episodio.

## 3. Flujo de evolución de turno

- **Turno automático**: 08:00–20:00 = Día; resto = Noche. Entre 00:00 y
  07:59 se sigue en la **Noche del día anterior** (turno que cruza medianoche).
- **TURNO_KEY** = `fecha-Turno` (ej. `2026-07-09-Noche`). Hay **una sola
  fila por cama+turno**: re-guardar el mismo turno actualiza, nunca duplica.
- Al abrir la cama (una sola llamada al servidor):
  - Turno **ya guardado** → carga exacta para editar.
  - Turno **nuevo** → **réplica del turno anterior** + aviso
    "Datos replicados del turno X del día Y".
- **La réplica copia solo el estado clínico**: ventilación, sedación,
  hemodinamia, examen físico, fase, planes estructurales, contadores.
- **La réplica NUNCA copia** (acciones del turno, parten desmarcadas):
  firma, nota libre, extubación/PVE, decanulación, intubación,
  reintubación, cultivo, KTM realizada (estado/tiempo), maniobras KTR,
  evaluación funcional. Cada acción cuenta actividad individual por firma.

## 4. Condicionantes del panel

### Vía aérea — matriz de eventos (acordada julio 2026)
| Estado | Bloque visible |
|---|---|
| No invasiva (Natural/Full Face/Oronasal) + **sin** historial VM | 🫁 **Intubación** (hora + contexto) |
| No invasiva + **con** historial VM (estuvo ventilado / extubado reciente) | 🔁 **Reintubación** (manual, con confirmación; hora + razón) |
| **TOT** | ✂️ **PVE / Extubación** (reintubación anidada para el mismo turno) |
| **TQT** | ✂️ **Decanulación** (con re-canulación) |

- El **cambio de vía aérea nunca registra reintubación por sí solo**: solo
  resetea contadores del episodio (con toast recordatorio).
- Historial VM = contadores del episodio + señales de los datos
  (días VM previos, N° reintubaciones, extubación/decanulación previa).
  Al quedar extubado/decanulado, los días del episodio se pliegan a
  DIAS_VM_PREVIOS → el historial persiste turno a turno.
- Contadores visibles: Días VM, Días TOT/TQT/VNI/VAA, N° reintubaciones;
  "+prev" para días de vía aérea externa (llegó de otro centro).

### Cascada ventilatoria (VMAPS)
Vía aérea → soportes válidos → modos válidos → **parámetros propios de
cada modo** (ACVC ≠ ACPC ≠ CPAP/PS ≠ S/T ≠ AVAPS ≠ CNAF ≠ NRC), con
calculados en vivo: ml/kg PI, Vol/min, I:E, Driving Pressure, Cesr,
Tobin, IROX. Monitorización avanzada (AutoPEEP, P0.1, ΔPocc, Pmusc,
rise time) en colapsable.

### Otros condicionantes
- **Sedación**: escalón → muestra SAS; BNM fuerza "no cooperador";
  GCS auto-suma; cooperación se infiere de S5Q/SAS.
- **Hemodinamia**: DVA "sin requerimientos" oculta multi-DVA; tendencia → tipo.
- **AET** (en tarjeta General): I–IIIC con tooltip; **grupo III suspende
  KTM automáticamente** y bloquea sus botones.
- **KTM — 3 estados**: Realizada (nivel 1–5, hito motor 1–6, asistencia,
  tiempo, IMT, "suspendida por alerta" con catálogo por categoría) /
  Contraindicada (Absoluta-Relativa → categoría → razón, catálogo clínico
  real) / No realizada (razón).
- **Evaluaciones funcionales**: colapsable con check "registrar este
  turno"; **solo turno Día**; interpretación automática (MRC-SS, FSS-ICU,
  dinamometría por sexo, PIM); Pmant VA solo si TQT; BDT +/− (histórico
  repetible por episodio).
- **Cultivo**: técnica (CCAET / Mini Lab / Hisopado) → auto-procedimiento;
  resultados como chips; objetivo de búsqueda condicional.
- **Posicionamiento** colapsable; prono/supino con hora → auto-procedimiento.
- **Fase clínica**: chips desde catálogo (Reanimación inicial …
  Rehabilitación); persiste entre turnos; va al texto clínico.
- **Turno noche**: oculta la tarjeta de evaluaciones funcionales.
- **Minimizar**: varios pacientes a la vez en pastillas (multi-tarea).

## 5. Qué pasa al guardar

Payload de ~170 campos → acción `GUARDAR_EVOLUCION` (auditada). El
servidor, bajo lock anti-concurrencia:

1. **Valida**: firma obligatoria, rangos fisiológicos, nombre si es ingreso.
2. **Identidad**: PATIENT_ID de la cama (o se genera una única vez);
   COD_PACIENTE de la cama (o se genera del nombre).
3. **Calcula**: peso ideal, índices respiratorios, días estadía/VM/VA,
   BDT histórico, y **genera el texto clínico** (TEXTO_GENERADO).
4. **Escribe una fila de 199 columnas en EVOLUCIONES** (fuente de verdad;
   upsert por `CAMA_x_fecha-turno`).
5. **Efectos colaterales**:
   - **CAMAS_ESTADO**: snapshot del último turno (lo que muestra el grid);
     resetea fechas de inicio VA/soporte cuando cambian de tipo.
   - **PROCEDIMIENTOS**: una fila por acción (manuales + automáticos:
     cultivo, prono/supino con hora, PVE, extubación por tipo,
     intubación, reintubación, decanulación) → base del conteo de
     actividad individual por firma/turno.
   - **TIMELINE**: hitos automáticos según procedimiento (historial ⏱️).
   - **REINTUBACIONES**: registro dedicado si hubo reintubación.
   - **AUDIT_LOG**: quién (email+firma), cuándo, qué acción.
6. El cliente muestra el texto generado listo para **copiar y pegar en la
   ficha** y refresca el grid (dot verde = turno evolucionado).

## 6. Egreso (cierre del episodio)

- Modal de egreso (destino → motivo REM automático; Barthel de egreso;
  firma obligatoria).
- El episodio se **resume en ARCHIVO_PACIENTES**: días totales/VM/VA,
  turnos KTM/KTMC, KTR total, extubaciones/reintubaciones, Barthel
  ingreso/egreso, FSS/MRC finales, fase final, motivo y destino.
- Las evoluciones del episodio se **mueven a EVOLUCIONES_ARCHIVO**
  (partición D5): la hoja activa se mantiene liviana.
- La cama queda libre de inmediato.

## 7. Estructura de datos (mapa rápido)

| Hoja | Rol | Encabezados |
|---|---|---|
| EVOLUCIONES | 1 fila por cama+turno, 199 col — fuente de verdad | 3 (datos desde fila 4) |
| EVOLUCIONES_ARCHIVO | idéntica, episodios egresados | 3 |
| CAMAS_ESTADO | snapshot vivo del grid (18 camas) | 2 (datos desde fila 3) |
| PROCEDIMIENTOS | 1 fila por acción → actividad individual | 1 |
| TIMELINE | hitos del historial | 1 |
| ARCHIVO_PACIENTES | resumen por episodio egresado | 1 |
| REINTUBACIONES | registro dedicado | 1 |
| AUDIT_LOG | trazabilidad de escrituras | 1 |
| KINESIOLOGOS | firma ↔ email 1:1 | 1 |
| CONFIG / CATALOGOS | parámetros y catálogos (fases, etc.) | 1 |

> ⚠️ Las filas de encabezado (título / nombres / fila vacía de diseño) son
> parte de la estructura: **no borrarlas**. Si algo se descuadra, ejecutar
> `cuadrarEncabezados()` (mantenimiento.gs).
