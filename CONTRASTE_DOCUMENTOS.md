# Contraste: documentos de la unidad vs RCE-KINE v2

> Fuente: 14 documentos entregados el 09-07-2026 — informes estadísticos
> 2024 y 2025, hoja de registro diaria (sala y ficha), hoja de seguimiento
> RHB (V5), hoja de registro PVE, protocolos (Weaning/Extubación V0.2,
> Decanulación TQT V2.0, KTM v5, Delirium/Sedación V0.1, Manual EMS V0.1),
> contraindicaciones KTM y orden CCAET.
> Objetivo: que la app capture TODO lo que los informes necesitan y que
> sus catálogos calcen con los protocolos vigentes de la unidad.

## 1. Informe estadístico anual — ¿la app puede producirlo?

Indicadores que usan los informes 2024/2025 y su fuente en la app:

| Indicador del informe | Fuente en la app | Estado |
|---|---|---|
| KTR atenciones/mes | RESP_KTR_CANT + PROCEDIMIENTOS | ✅ |
| KTM atenciones/mes | KTM_REALIZADA/NIVEL/TIEMPO + PROCEDIMIENTOS | ✅ |
| Extubaciones por tipo (c/prot, s/prot, autoext, accidental) | EXT_TIPO (mismas 4 categorías) | ✅ |
| Día de estadía al extubar | DIA_ESTADIA de la fila con EXT_OCURRIO | ✅ |
| Extubación diurna vs nocturna | TURNO + EXT_HORA | ✅ |
| Éxito post extubación programada / falla post autoextubación | EXT_REINTUB + REINTUBACIONES + turnos siguientes por PATIENT_ID | ✅ derivable |
| Ext. s/protocolo ≤24 h VM vs >24 h | FECHA_INICIO_VM + INTUB_HORA/EXT_HORA | ✅ (mejora con horas) |
| **Motivo de extubación s/protocolo** | EXT_MOTIVO **texto libre** | ⚠️ **brecha S1** |
| Reintubación diurna/nocturna | TURNO + REINTUB_HORA | ✅ |
| **Motivos de reintubación** (8 categorías del informe) | select actual con 5 genéricos | ⚠️ **brecha S2** |
| **Dispositivo previo a la reintubación** | columna REINTUBACIONES.SOPORTE_PREVIO existe pero **el panel no la alimenta** | ⚠️ **brecha S3** |
| Tiempo extubado antes de reintubar | EXT_TS previa ↔ REINTUB_HORA | ✅ computable (servidor) |
| TQT: día de estadía + grupo diagnóstico | proc TQT + DIA_ESTADIA + PAC_DIAG_REM | ✅ (grupos REM coinciden con el informe may-dic 2025) |

**El hallazgo más importante**: ambos informes se quejan del subregistro —
"29% sin especificar" (2025) y "40,9% sin especificar" (2024) en motivos de
extubación sin protocolo, y "de 27 reintubaciones solo 23 registradas".
La app elimina ese problema **solo si los motivos son un catálogo
seleccionable, no texto libre**.

## 2. Hoja de registro diaria (Cuidados Respiratorios) — campo a campo

Cubierto ✅: soporte/O2, TOT/TQT calibre y cms, días VM/reintub, VT ajustado
a talla (la app calcula ml/kg reales), auscultación, secreciones, y toda la
terapia ventilatoria (modo, VT, Ti, FR, PEEP/EPAP, PS/IPAP, Pmax, Pmedia,
Pplateau, P. distensión, compliance, autoPEEP, I:E, Tobin, Vol/min, FiO2, SpO2).

Sin lugar en la app ⚠️:
- **Monitorización**: FC, P. arterial, PAM, **PIC/PPC** (unidad neurocrítica) → S9.
- **Laboratorio**: GSA (pH, PaCO2, PaO2, HCO3, EB, SatO2), **PaFi**, lactato,
  PCR, PCT. La PaFi es criterio de weaning (>150) y decanulación (>200) → S8.
- **Fechas de filtros y sonda de aspiración circuito cerrado** → S11.

## 3. Protocolo Weaning/Extubación V0.2 + hoja PVE

- La PVE de la app (sí/no → superada/fracasada) calza con el flujo. Los
  **motivos de fracaso** de la app (4 chips genéricos) no calzan con los
  **criterios de falla del protocolo** (FR>35, SpO2<90% c/FiO2≥40%, FC>140,
  PAS>180 o <90, Vol/min>15, ↑trabajo respiratorio/paradoja, secreciones
  abundantes, caída GCS) → S10.
- La hoja física registra el **checklist de inicio de PVE (8-9 criterios)**
  por turno; la app registra solo el resultado. Propuesta mínima: no
  duplicar el checklist (roce), la hoja física sigue siendo respaldo.
- **VISAGE (≥3)** y **Score de Cuidados de VA (<6)**: predictores para
  extubar pacientes neurológicos — el perfil dominante de la unidad
  (55–61% de las TQT son neuro). No existen en la app → S7.
- Evaluaciones adicionales del protocolo: PIM ✅ (umbral -20/-30), flujo
  pico de tos ✅ (FEM; corte >55 L/min pre-extubación), **FED % (>30%)** y
  **excursión diafragmática (>1,1 cm)** — la app solo tiene "grosor
  diafragmático mm" → S4.
- Reevaluación post-extubación 30/60/120 min/48 h: queda en la hoja física
  + EXT_POST_DET; la falla dura la captura la reintubación de turnos
  siguientes. Sin cambio.

## 4. Hoja de Seguimiento RHB (V5) — la gran oportunidad

La tabla diaria de la hoja (SAS, GCS, S5Q, dosis DVA, modo/O2, vía aérea,
PVE diaria, reintubación, FiO2, nivel KTM, motivo suspensión, IMT cmH2O,
kine responsable) **ya existe completa en EVOLUCIONES, turno a turno**.
→ La hoja de seguimiento se puede **generar automáticamente** desde el
historial (vista imprimible), en vez de transcribirla a mano → S14.

Lo que falta para completarla:
- Cabecera: **Índice de Charlson** y **motivo de ingreso (electivo/urgencia)** → S5.
  (ECF y Barthel ya están; se levantan con referencia 2 semanas pre-admisión ✅.)
- Timepoints (Ev. inicial <48 h / Día 7 desde despertar S5Q>3 / Egreso):
  MRC ✅, FSS ✅, PIM ✅, PEM ✅, pero faltan **grosor de cuádriceps izq/der**,
  **índice de Heckmatt (I–IV)**, **FED izq/der**, **excursión izq/der** → S4.
  Los timepoints son derivables de las fechas (no requieren campo extra).

## 5. Protocolo KTM v5 + contraindicaciones

- Fases y niveles: protección (S5Q≤3 → nivel 1) / actividad (S5Q>3 →
  niveles 2–5 por hitos: giro, sedente borde cama, bípedo, marcha). La app
  tiene nivel 1–5 + hito motor 1–6 ✅. Alinear los textos de ayuda del
  selector de nivel con las definiciones del protocolo (menor).
- **Discrepancia de catálogo (corregir)**: el protocolo clasifica como
  **RELATIVAS** la inestabilidad neuroquirúrgica, PIC>20, CVC/línea
  arterial insegura y ELP alterado — la app las tiene como ABSOLUTAS → S6.
- Criterios de seguridad para detener sesión: calzan con KTM_ALERT_MAP ✅
  (incluye PTO+ y SvO2<65).
- Percepción de esfuerzo (Borg) en pacientes que responden → S12 (opcional).
- HSA: consideraciones específicas (aneurisma excluido, metas PAM 90–100 /
  100–110 con vasoespasmo, DVE) — documentales; la fase clínica y las
  contraindicaciones ya dan el marco. Sin cambio.
- EMS/NEMS: ya es procedimiento registrable ✅; parámetros (Hz, pulso,
  intensidad) quedan en nota — no amerita columnas.

## 6. Protocolo Delirium/Sedación V0.1

SAS c/2 h con **meta diaria concreta** (habitualmente 3 o 4) y CAM-ICU
c/12 h. La app registra SAS y CAM-ICU por turno — suficiente para el rol
kinésico (el registro horario es de enfermería). El texto generado ya usa
"para meta SAS X". Sin cambio estructural.

## 7. Orden CCAET

La app cubre técnica/objetivo/resultados/fechas del cultivo. Faltan
**hora de toma** y **si está con tratamiento antibiótico** (campos de la
orden) → S13. A futuro, la app podría generar la orden pre-llenada.

## 8. REM

Los grupos diagnósticos del selector coinciden con el informe may–dic 2025
✅. Pero antes de construir el generador REM: **pedir a la coordinadora la
planilla REM oficial** (qué serie/celdas rellena) → S15.

---

## Sugerencias priorizadas (para aprobación)

**ALTA — impacto directo en los informes anuales, costo bajo:**
- **S1.** Motivo de extubación s/protocolo → select: `≤24 h de VM ·
  Agitación psicomotora · Dependiente de presión positiva · Post pabellón ·
  Indicación médica · Otro (especificar)`. Mata el 29–41% "sin especificar".
- **S2.** Motivos de reintubación → catálogo del informe: `Falla
  respiratoria post extubación · Mal manejo de secreciones (no deglute) ·
  No protege VA · Edema laríngeo post extubación · Compromiso de conciencia ·
  Debilidad muscular respiratoria · Broncoespasmo · Extubación accidental`.
- **S3.** "Soporte previo" en el bloque de reintubación (CNAF/VNI/MMV/NRC/
  Mascarilla/Ambiente/VMI) → alimenta REINTUBACIONES.SOPORTE_PREVIO; el
  tiempo extubado lo computa el servidor (EXT_TS previa ↔ REINTUB_HORA).
- **S4.** Completar evaluaciones: grosor cuádriceps izq/der, Heckmatt
  (I–IV), FED %, excursión diafragmática (columnas append-only). Habilita
  la Hoja RHB digital completa.
- **S5.** Identificación: índice de Charlson + motivo ingreso electivo/urgencia.
- **S6.** Corregir catálogo de contraindicaciones KTM (4 ítems de
  Absoluta → Relativa, según protocolo v5).

**MEDIA:**
- **S7.** VISAGE + Score de Cuidados de VA en el bloque PVE/Extubación.
- **S8.** PaFi (o mini-bloque GSA opcional) — criterio de weaning y decanulación.
- **S9.** FC / PAM (+ PIC/PPC) en Hemodinamia.
- **S10.** Motivos de falla de PVE = criterios del protocolo.

**BAJA / módulos posteriores:**
- **S11.** Fechas de filtros/sonda de circuito cerrado (con alerta de vencimiento).
- **S12.** Borg post-KTM (opcional).
- **S13.** Cultivo: hora de toma + con/sin antibiótico.
- **S14.** Vista imprimible "Hoja de Seguimiento RHB" generada del historial.
- **S15.** Confirmar formato REM oficial con la coordinadora antes del generador.
