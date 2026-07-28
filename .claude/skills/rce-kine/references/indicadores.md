# Definiciones de indicadores — únicas para la app y el pipeline

Estas son las definiciones **tal como las calcula la plataforma** en
`v2/svc_indicadores.gs`, verificadas por la guardia `build/checks/indicadores.js`
(18 aserciones con un caso construido a mano). Cualquier análisis externo debe
usar exactamente estas reglas: si el pipeline y el tablero informan cifras
distintas del mismo mes, la unidad pierde confianza en ambos.

Metas acordadas con la coordinación (jul-2026): fracaso de extubación **<20%**,
autoextubaciones **1-2 por 100 días-VM**, extubación fuera de protocolo **<25%**.

## Denominadores

| Concepto | Definición exacta |
|---|---|
| **Paciente-días** | filas de EVOLUCIONES agrupadas por (`PATIENT_ID`, `FECHA`) dentro del rango — cada día cuenta una vez aunque haya dos turnos |
| **Días-VM** | paciente-días con `VENT_SOPORTE='VM'` en alguno de los turnos |
| **Ventilados** | episodios (`PATIENT_ID`) distintos con al menos un día de VM |
| **Egresos** | filas de `ARCHIVO_PACIENTES` con `FECHA_EGRESO` dentro del rango |

## Extubaciones

```
programadas   = EXT_OCURRIO && EXT_TIPO ∈ {protocolo, sin_protocolo, sin_condiciones}
accidentales  = EXT_OCURRIO && EXT_TIPO ∈ {autoextubacion, accidental}   → NO son denominador
fuera de protocolo = EXT_OCURRIO && EXT_TIPO ∈ {sin_protocolo, sin_condiciones}
```

**`EXTUBACIONES` = las programadas** (las tres). Es el denominador de fracaso y
de «fuera de protocolo». Incluir `sin_condiciones` es fácil de omitir: son las
extubaciones con ≤24 h de VM, que son programadas **y** además cuentan como
fuera de protocolo.

- `fueraPct = fueraProtocolo / extubaciones × 100` — meta <25%.
- Los **motivos** de las fuera de protocolo se agrupan por `EXT_MOTIVO` y se
  reportan con su reparto día/noche; cuando el tipo es `sin_condiciones` el
  motivo se rotula «≤24 h de VM».

## Fracaso de extubación (indicador centinela principal)

**Fracaso = reintubación dentro de las 48 h siguientes a una extubación
programada.** Se busca en `REINTUBACIONES` la más cercana del mismo
`PATIENT_ID` con fecha ≥ la de la extubación, y se mide la distancia:

- Si **ambas tienen hora** (`EXT_HORA` y `HORA_REINTUBACION`): horas reales.
- Si falta alguna: aproximación por días × 24 (mismo día = 0 h; día siguiente =
  24 h).

Clasificación: **precoz < 24 h**, **tardío 24-48 h**. Más de 48 h no es fracaso.
`fracaso = precoz + tardío`; `fracasoPct = fracaso / extubaciones × 100`.

`REINTUB_24H` de la serie histórica corresponde al **fracaso precoz**. Llenarlo
como «reintubación el mismo día calendario» es equivalente a lo que hace la
plataforma cuando no hay horas registradas, así que es correcto para el
histórico; desde que hay horas reales, la app usa las horas.

## Autoextubaciones

```
autoextPor100VM = autoextubaciones / días-VM × 100     (meta 1-2)
```
Numerador: `EXT_TIPO='autoextubacion'` (la `accidental` se cuenta aparte del
denominador de programadas, pero **no** entra en este numerador).

## PVE (prueba de ventilación espontánea)

```
PVE = evoluciones con PVE_VAL='si' Y PVE_RESULTADO no vacío
pvePor100PacDia = PVE / paciente-días × 100
```
Exigir el resultado evita contar intenciones. La PVE es el indicador donde
RCE-KINE muestra su mayor ganancia frente a la planilla (subregistro previo
medido: 70%).

## Traqueostomía y VM prolongada

- `TQT` = evoluciones con `TQT_OCURRIO`.
- **Mediana de días de VM antes de la TQT**: para cada episodio con TQT, se
  cuentan sus paciente-días con VM **anteriores o iguales** a la fecha de la
  TQT — leyendo EVOLUCIONES **y** EVOLUCIONES_ARCHIVO. Se reporta la mediana.
- **VM prolongada** = episodios con **más de 7 días** de VM;
  `vmProlongadaPct = vmProlongada / ventilados × 100`.

## Atenciones kinésicas

```
atenciones = Σ RESP_KTR_CANT  +  Σ (KTM_REALIZADA ? KTM_CANT : 0)
```

Es decir **KTR + KTM**, contando **sesiones**, no turnos: `RESP_KTR_CANT` suma su
valor (3 KTR = 3 atenciones) y la KTM suma `KTM_CANT` (acotado entre 1 y 9;
si está marcada como realizada sin cantidad, cuenta 1). La KTM suspendida o no
realizada no suma. `atencionesPorPacDia = atenciones / paciente-días`.

## Reingresos y mortalidad

- **Reingresos** = personas (por `RUT` normalizado) con más de un `PATIENT_ID`.
  Se normaliza antes de comparar, porque el mismo RUT aparece escrito de formas
  distintas (`12.345.678-5` y `12345678-5` son la misma persona).
- **Mortalidad** = egresos con `MOTIVO_EGRESO` que contiene «Fallecimiento»,
  sobre el total de egresos del rango. **Se reporta sin ajuste por gravedad y con
  esa advertencia visible**: no compara desempeño entre períodos ni con otros
  centros. El ajuste por APACHE II se hace fuera, cruzado por RUT dentro del
  hospital y anonimizado para el análisis.

## Tendencia mensual

El tablero une `INDICADORES_HISTORICO` (`FUENTE='planilla'`) con los meses
calculados por la plataforma (`FUENTE='rce'`) y los dibuja con colores
distintos. Por eso las definiciones de las columnas históricas deben coincidir
con las de este documento: si el histórico usara «extubaciones totales» y la app
«programadas», la serie mostraría un salto artificial justo en el mes en que
entró el sistema nuevo.

## Cómo verificar un cambio de definición

`build/checks/indicadores.js` tiene un caso a mano con dos pacientes, una
extubación con protocolo seguida de reintubación a 22 h (precoz), una fuera de
protocolo con reintubación a 48 h sin hora (tardío), una autoextubación, una TQT
con 9 días de VM repartidos entre las dos hojas, reingreso por RUT con formatos
distintos y un mes histórico sembrado. Correrlo con `node build/checks/indicadores.js`
después de tocar cualquier definición: los números esperados están escritos en
el propio archivo.
