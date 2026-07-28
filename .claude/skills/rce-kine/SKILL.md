---
name: rce-kine
description: Contexto completo de RCE-KINE (Registro Clínico Electrónico de Kinesiología UCI, Hospital San Pablo de Coquimbo — Google Apps Script + Sheets). Usar SIEMPRE que se lea, analice o exporte la base de datos de RCE-KINE (hojas EVOLUCIONES, TIMELINE, ARCHIVO_PACIENTES, REINTUBACIONES, INDICADORES_HISTORICO); cuando se construya o corrija un pipeline de indicadores sobre ella; cuando se calculen indicadores de UCI (fracaso de extubación, autoextubaciones, PVE, días de VM, atenciones, VNI); o cuando se desarrolle código de la plataforma (v2/*.gs, index.html). Contiene el modelo de datos real, las definiciones exactas de cada indicador, las reglas de privacidad y las convenciones de desarrollo y entrega.
---

# RCE-KINE — contexto para trabajar con el registro y su base de datos

RCE-KINE es el registro clínico electrónico de la unidad de kinesiología de UCI
adultos del **Hospital San Pablo de Coquimbo**. Sustituye una planilla de
registro en papel/Excel que arrastraba subregistro y errores de fórmula.

- **Plataforma:** Google Apps Script + Google Sheets (una web app servida por
  `doGet`, más 19 hojas de datos en un único archivo Sheets).
- **Coordinación clínica y del producto:** Klgo. **Diego Melo Villagrán**
  (coordinador de kinesiólogos; no es programador — trabaja en español y
  actualiza la app pegando archivos a mano en el editor de Apps Script).
- **Análisis e indicadores:** Klgo. **Manuel Fuentes Blanco** (pipeline propio en
  Python que lee la base y produce los indicadores de calidad y seguridad).
- **Repositorio (fuente de verdad):** `diegonicolasmelo-cell/RCE-KINE`.
- **Estado:** marcha blanca con **datos de prueba** hasta el 31-jul-2026;
  **implementación real desde el 1-ago-2026**. Antes de esa fecha, cualquier
  cifra que salga de la base es de prueba y no debe interpretarse clínicamente.

Quien trabaje aquí debe tener presente **tres invariantes**: el repositorio es la
verdad (no el archivo pegado en producción), la identidad del paciente tiene dos
niveles (episodio y persona), y los indicadores tienen definiciones únicas —
las de esta skill — para que la app y el pipeline nunca reporten cifras
distintas del mismo mes.

## Cómo está organizado este contexto

| Necesito… | Leer |
|---|---|
| Leer la base, entender las hojas, el grano y la identidad | `references/modelo-datos.md` |
| Calcular indicadores con las definiciones exactas de la app | `references/indicadores.md` |
| Modificar la app, verificar y entregar código | `references/arquitectura-y-entrega.md` |

## Lo que más se malinterpreta (leer antes de escribir un pipeline)

**1. La VNI no es «ventilación sobre vía aérea natural».** El modelo tiene dos
campos acoplados por una matriz cerrada, `VENT_VIA_AEREA` × `VENT_SOPORTE`:

| `VENT_VIA_AEREA` | `VENT_SOPORTE` posibles |
|---|---|
| `Natural` | `Ambiente`, `Oxigenoterapia/OAF` |
| `TOT` · `TQT` | `VM`, `Oxigenoterapia/OAF` |
| `Full Face` · `Oronasal` | `VNI` |

De ahí se deduce que **`VENT_SOPORTE='VM'` es siempre invasiva** (solo existe
sobre TOT o TQT) y que **la VNI se identifica por `VENT_SOPORTE='VNI'`**, cuya
vía aérea es la interfaz (`Full Face` u `Oronasal`), nunca `Natural`. Inferir
VNI como «VM sobre Natural» devuelve **cero casos**, porque esa combinación no
existe en la matriz.

Para «VNI que termina en intubación» no hay que inferir nada: la evolución del
turno en que se intuba registra `INTUB_OCURRIO`, `INTUB_HORA` y
**`INTUB_SOP_PREVIO`** (soporte inmediatamente anterior: `Ambiente`,
`Naricera-NRC`, `CNAF` o `VNI`). El indicador es
`INTUB_OCURRIO && INTUB_SOP_PREVIO='VNI'`.

**2. El grano de EVOLUCIONES es paciente × fecha × turno**, no paciente-día.
Hay dos turnos (`Dia`, `Noche`) y ambos pueden traer datos distintos del mismo
día. Agregar a paciente-día exige decidir por variable si se toma el turno día,
el último valor o la suma (ver `references/modelo-datos.md`).

**3. El turno Noche pertenece al día que lo inicia, pero su «fecha efectiva»
es el día siguiente.** El turno noche del 27 termina el 28: los recambios de
dispositivos anotados esa noche se fechan **28**. Esta convención está en el
código (`_fechaEfectivaTurno`) y hay que respetarla al analizar dispositivos.

**4. Hay datos que NUNCA se replican de un turno al siguiente**, por decisión
clínica: procedimientos, cultivos, eventos de vía aérea y —desde jul-2026— todo
el bloque de terapia física (KTM/IMT/EMS), que se replica **día→día** y de
noche parte limpio. Si un análisis asume continuidad automática de esos campos,
está mal.

**5. `EVOLUCIONES` guarda solo los episodios vivos.** Al dar de alta, las filas
se mueven a `EVOLUCIONES_ARCHIVO`. Todo análisis histórico debe leer **las dos
hojas**, con el mismo esquema de columnas.

## Privacidad — regla dura

Rige la **Ley 19.628** chilena y el criterio institucional del hospital:

- La identidad de persona (`NOMBRE`, `RUT`) **se usa solo dentro** del sistema y
  del hospital. **Jamás** sale en REM, tablero, exportaciones ni en la salida de
  ningún análisis externo.
- Toda salida hacia herramientas externas (incluido cualquier LLM) va
  **anonimizada**: identidad por `PATIENT_ID` (UUID de episodio), sin nombre ni
  RUT. Verificar la ausencia de ambos en cada corrida es parte del pipeline, no
  un extra.
- Mientras la base tenga datos de prueba (hasta el 1-ago-2026) el riesgo es
  nulo, pero la regla se aplica igual para que el hábito ya esté instalado
  cuando entren pacientes reales.

## Trabajar en equipo sin pisarse

- **Todo cambio nace en el repositorio.** Lo que se pega en el proyecto de Apps
  Script debe estar commiteado antes; si no, la próxima entrega lo sobrescribe.
- **Hay un solo proyecto publicado.** Avisarse antes de pegar en producción.
  Por defecto, quien publica («Nueva versión») es Diego; el resto prueba en el
  enlace `/dev`.
- Ramas separadas por persona; integra Diego.
- El sello de versión (`meta rce-version` en el index, visible con Ctrl+F) dice
  siempre qué versión está publicada. Verificarlo antes de diagnosticar un bug.
- **Diego decide el producto.** Las funcionalidades nuevas se proponen con
  opciones o un mockup **antes** de escribir código; él prefiere iterar sobre
  imágenes y acumular ideas para entregar varias juntas.
- Un bug que costó más de un intercambio merece una guardia automática nueva en
  `build/checks/` para que no vuelva.

## Dos hechos clínicos que enmarcan el análisis

- **El registro nuevo corrige subregistro real.** El contraste entre RCE-KINE y
  la planilla vieja (11-27 jul 2026) mostró coincidencia exacta en
  reintubaciones y **PVE capturadas solo por RCE-KINE** (3 contra 0), coherente
  con el 70% de subregistro de PVE medido en la planilla.
- **La gravedad al ingreso predice la mortalidad; los días de VM no.** El
  análisis de Manuel (2025-2026) da APACHE II con OR 1,94 por cada 5 puntos
  (p<0,001) y la capacidad predictiva del modelo sube de 0,633 a 0,795 al
  incorporarlo. Consecuencia práctica: **comparar meses, turnos o servicios sin
  ajuste por gravedad compara poblaciones, no desempeños.** Por eso el tablero
  muestra la mortalidad explícitamente **sin ajustar** y con la advertencia a la
  vista; el ajuste se hace en el análisis externo. APACHE II **no se captura
  hoy** en RCE-KINE (decisión pendiente de Diego: capturarlo al ingreso como
  campo numérico, o cruzarlo internamente por RUT con la planilla médica).
