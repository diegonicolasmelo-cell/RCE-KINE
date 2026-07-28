# Respuestas a las consultas · enlace RCE-KINE ↔ pipeline de indicadores

*28-jul-2026 · para Klgo. Manuel Fuentes · verificado contra el código fuente
(`v2/svc_indicadores.gs`, `v2/esquema.gs`, `v2/index.html`)*

Primero lo importante: el contraste de fuentes y las reintubaciones coincidiendo
exacto son una gran noticia, y el hallazgo de la PVE (3 contra 0) es justo la
evidencia que necesitábamos para mostrarle al equipo que el registro nuevo
corrige el subregistro. Gracias por el trabajo.

Van las cuatro. Las tres primeras están respondidas desde el código; la cuarta
es una decisión que toma Diego y va con recomendación.

---

## 1 · `INDICADORES_HISTORICO`

### `EXTUBACIONES` → **programadas**, tu lectura es la correcta

Confirmado en `svc_indicadores.gs`: el denominador del sistema son las
programadas, y autoextubación/accidental van por su cuenta. Una precisión que
conviene incorporar: **las programadas son tres tipos, no dos.**

```
programadas  = EXT_TIPO ∈ {protocolo, sin_protocolo, sin_condiciones}
accidentales = EXT_TIPO ∈ {autoextubacion, accidental}     → fuera del denominador
fuera de protocolo = EXT_TIPO ∈ {sin_protocolo, sin_condiciones}
```

`sin_condiciones` son las extubaciones con **≤24 h de VM**: son programadas
(entran en `EXTUBACIONES`) **y además** cuentan como fuera de protocolo. Si tu
serie histórica las dejó fuera del total, el denominador queda corto y el
porcentaje de fracaso sale inflado.

### `ATENCIONES` → **KTR + KTM**, también correcto

La fórmula exacta de la app:

```
atenciones = Σ RESP_KTR_CANT + Σ (KTM_REALIZADA ? KTM_CANT : 0)
```

Cuenta **sesiones, no turnos**: 3 KTR en un turno son 3 atenciones, y la KTM
suma su propia cantidad (acotada 1-9; si viene marcada sin cantidad, cuenta 1).
La KTM suspendida o no realizada no suma.

### `REINTUB_24H` → tu criterio es equivalente

La app mide **horas reales** cuando tiene `EXT_HORA` y `HORA_REINTUBACION`, y
cuando falta alguna cae a días × 24 (mismo día = precoz, día siguiente =
tardío). Es decir: para el histórico sin horas, «mismo día calendario» **es
exactamente** lo que hace la plataforma. Déjalo así. Desde que el registro tiene
horas —ya las tiene— manda la hora real.

---

## 2 · La VNI: hay que corregir la regla

Aquí sí hay un problema, y prefiero avisarlo antes de que el indicador se
publique. **La VNI no es «ventilación mecánica sobre vía aérea Natural».** El
modelo acopla vía aérea y soporte con una matriz cerrada:

| `VENT_VIA_AEREA` | `VENT_SOPORTE` posibles |
|---|---|
| `Natural` | `Ambiente`, `Oxigenoterapia/OAF` |
| `TOT` · `TQT` | `VM`, `Oxigenoterapia/OAF` |
| `Full Face` · `Oronasal` | `VNI` |

O sea: la vía aérea de un paciente en VNI es **la interfaz** (`Full Face` u
`Oronasal`), nunca `Natural`. Y `VM` solo existe sobre TOT o TQT. Consecuencias:

- La regla «VM sobre Natural = VNI» devuelve **cero casos** — esa combinación no
  existe en la matriz.
- Las reglas correctas son directas: **VNI = `VENT_SOPORTE='VNI'`** y
  **VMI = `VENT_SOPORTE='VM'`** (invasiva por construcción, no hay que mirar la
  vía aérea).

Y para tu indicador de **VNI que termina en intubación** no hace falta inferir
nada: la evolución del turno en que se intuba registra

```
INTUB_OCURRIO = true
INTUB_HORA
INTUB_SOP_PREVIO ∈ {Ambiente, Naricera-NRC, CNAF, VNI}
```

El indicador es `INTUB_OCURRIO && INTUB_SOP_PREVIO='VNI'`, con denominador los
episodios que tuvieron algún turno con `VENT_SOPORTE='VNI'`. Vale la pena
recalcular el 27-32% con esta definición antes de reportarlo.

---

## 3 · El RUT está vacío porque todavía no hay pacientes reales

La columna existe y el sistema ya la usa: valida dígito verificador (módulo 11),
normaliza el formato, detecta reingresos comparando `RUT` con más de un
`PATIENT_ID`, y avisa en pantalla cuando el paciente ya estuvo antes. Vive en
`CAMAS_ESTADO` y `ARCHIVO_PACIENTES`; en `EVOLUCIONES` no se persiste.

Está en 0% simplemente porque **lo que hay hoy son datos de prueba**. Desde el
**1-ago-2026**, con la implementación real, se llena en cada ingreso. Diego ya
autorizó su uso interno con ese fin: cruzar con la estadística médica —de donde
sale el APACHE II— dentro del hospital.

La regla se mantiene sin excepciones: **hacia afuera sale solo `PATIENT_ID`**,
nunca nombre ni RUT. Tu verificación por corrida es exactamente el control que
corresponde; propongo que quede permanente, igual que el contraste de fuentes.

---

## 4 · APACHE II — la decisión de Diego, con recomendación

Tu hallazgo está claro y tiene consecuencia directa sobre el tablero: **la
gravedad al ingreso predice la mortalidad y los días de VM no** (OR 1,94 por
cada 5 puntos, p<0,001; capacidad predictiva de 0,633 a 0,795). Comparar meses o
turnos sin ajustar compara poblaciones, no desempeños.

Parte de eso ya está reconocido en la plataforma: el tablero muestra la
mortalidad **explícitamente sin ajustar**, con la advertencia a la vista de que
no compara desempeño entre períodos ni con otros centros, y dice que el ajuste
se hace en el análisis externo. Pero hoy **el dato no se captura**.

**Mi recomendación: capturarlo en RCE-KINE al ingreso.** Un campo numérico
opcional (0-71), una vez por paciente, en el formulario de ingreso. Razones:

- El cruce por RUT depende de un archivo de otro equipo, con su propio ritmo y
  sus propios errores de tipeo; el campo propio no depende de nadie.
- Es barato: una columna al final de `EVOLUCIONES` y un campo en el ingreso.
  Cambia el esquema, así que exige correr `crearORepararEstructura()`.
- Habilita que el **propio tablero** muestre la gravedad promedio del período
  junto a la mortalidad, que es la forma honesta de presentarla.
- No excluye el cruce por RUT: los dos caminos conviven y se validan entre sí.

La contra: es un dato que el kinesiólogo no calcula (lo calcula el médico), así
que hay que definir de dónde lo copia y qué pasa si no está disponible al
ingreso — probablemente dejarlo editable después, como otros campos.

**Queda a la espera de que Diego lo defina.** Si aprueba, entra en el próximo
paquete de cambios; el trabajo es de una tarde.

---

## Sobre trabajar juntos

Junto con estas respuestas va la skill **`rce-kine`**: el contexto completo del
sistema —modelo de datos hoja por hoja, definiciones exactas de todos los
indicadores, arquitectura, convenciones y reglas de privacidad— en formato de
skill para que tu Claude lo cargue automáticamente. Con eso, ambos lados
calculan lo mismo y ninguno tiene que adivinar cómo está guardado un dato.

Si al leerla encuentras que algo del modelo no calza con lo que ve tu pipeline,
avísalo: es la mejor señal de que hay un supuesto equivocado en alguno de los
dos lados, y prefiero corregirlo antes del 1 de agosto.
