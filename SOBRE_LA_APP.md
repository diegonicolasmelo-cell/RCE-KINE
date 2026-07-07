# RCE‑KINE — Registro Clínico Electrónico de Kinesiología UCI

**RCE‑KINE** es una aplicación web para el **registro clínico kinésico de una Unidad de
Cuidados Intensivos de adultos**. Digitaliza el trabajo diario del kinesiólogo de turno en
paciente crítico: estado ventilatorio, vía aérea, sedación, movilización temprana (KTM),
destete, procedimientos, evaluación funcional y entrega de turno.

Está construida sobre **Google Apps Script** (backend) y **Google Sheets** (base de datos),
y se usa desde el navegador como una única página web.

---

## ¿Para qué sirve?

- Llevar el **censo de las 18 camas** de la UCI (ocupada/libre, paciente, soporte ventilatorio).
- Registrar la **evolución de cada turno** (día/noche) con todas las variables kinésicas y
  ventilatorias del paciente crítico.
- **Generar automáticamente el texto clínico** narrativo a partir de los datos ingresados,
  listo para copiar a la ficha oficial.
- Mantener una **línea de tiempo de hitos** por episodio (ingreso, intubación, prono,
  extubación, hitos motores, egreso…).
- Emitir la **entrega de turno** imprimible entre kinesiólogos.
- Producir el **REM mensual** y un **panel de indicadores** (extubaciones, reintubación,
  KTM por nivel, días de VM, outcomes de egreso, hitos motores).
- **Respaldar** los datos a diario en Google Drive.

---

## ¿Qué registra? (dominio clínico)

| Área | Ejemplos de datos |
|------|-------------------|
| Identificación | Nombre, RUT, edad, sexo, talla, peso ideal, diagnóstico, Barthel |
| Sedación / conciencia | Tipo de sedación, SAS, GCS, S5Q, cooperación, BNM |
| Hemodinamia | Estado, drogas vasoactivas (DVA), tendencia |
| Examen físico | Murmullo pulmonar, ruidos, secreciones |
| Vía aérea / ventilación | TOT/TQT/VNI, soporte (VM/VNI/CNAF/O₂), modo, parámetros |
| Cálculos derivados | ml/kg, volumen minuto, I:E, driving pressure, Cdyn, Tobin, ROX |
| Rehabilitación (KTM) | Nivel, tiempo, UMA, contraindicaciones, hitos motores |
| Procedimientos | Extubación, prono, TQT, cultivos, imagenología, test de apnea… |
| Evaluación funcional | MRC‑SS, FSS‑ICU, dinamometría, PIM/PEM, ecografía diafragmática |
| Egreso | Motivo, días totales/VM/VA, extubación exitosa, reintubación |

---

## ¿Cómo funciona? (visión general)

```
Navegador (index.html)
        │  google.script.run
        ▼
procesarRequest(accion, datos)      ← único punto de entrada del backend
        │
        ├─ Camas / Ingreso / Alta / Traslado
        ├─ Evoluciones (guardar, leer, turno previo, historial)
        ├─ Procedimientos / Timeline / Texto clínico
        ├─ Entrega de turno
        ├─ Estadísticas / Actividad / REM
        └─ Turnos / Backup / Setup
        │
        ▼
Google Spreadsheet (una hoja por entidad)
```

Cada entidad vive en su propia hoja: `CAMAS_ESTADO`, `EVOLUCIONES`, `PROCEDIMIENTOS`,
`TIMELINE`, `ARCHIVO_PACIENTES`, `KINESIOTERAPEUTAS`, `ESTADISTICAS_REM`, `TURNOS`,
`REINTUBACIONES`, `ENTREGAS_TURNO`. El **episodio de hospitalización** se identifica con un
`PATIENT_ID` (UUID) para no mezclar pacientes distintos que ocuparon la misma cama.

---

## Puesta en marcha (resumen)

1. Abrir el Google Sheet → menú **⚕️ RCE KINE** → **1 · Crear/reparar estructura**.
2. (Opcional) **2 · Crear hoja IMPORTAR**, pegar pacientes, **3 · Importar**.
3. Desplegar el proyecto como **Web App** (`doGet` sirve la interfaz).
4. Configurar un **activador diario** para `backupDiario()`.

---

## Estado y advertencias

Esta aplicación maneja **datos personales sensibles de salud** (nombre, RUT, diagnóstico).
Antes de un uso clínico oficial conviene resolver los puntos señalados en
[`INFORME_TECNICO.md`](./INFORME_TECNICO.md), en particular:

- El **control de acceso y la trazabilidad de autoría** (hoy la "firma" es un desplegable
  auto‑seleccionado, no una identidad verificada).
- El **escape de datos del paciente** en la interfaz (prevención de XSS).
- La **consistencia de la estructura de columnas** entre el código y el generador de hojas.
- El **filtrado por episodio (`PATIENT_ID`)** en todas las estadísticas y agregaciones.

Consulta el informe técnico completo para el detalle de arquitectura, flujos de proceso,
casos de uso y la auditoría de hallazgos.

---

*Proyecto: RCE‑KINE · Registro clínico UCI KINE · Plataforma: Google Apps Script + Google Sheets*
