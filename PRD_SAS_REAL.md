# PRD — El SAS que tiene el paciente y el SAS que se persigue

**Estado:** Borrador, esperando cuatro decisiones de Diego
**Dueño:** Diego Melo Villagrán (coordinador de kinesiología UCI)
**Creado:** 12-08-2026
**Alcance:** separar el SAS **actual** de la **meta**, y poder declarar una
sedación que no es sedación profunda sin que ensucie la fecha en que se
suspendió la sedación profunda de verdad.

**Qué queda FUERA:**

- No se cambia la escala SAS ni sus cortes.
- No se toca el GCS, el S5Q ni el CAM-ICU como instrumentos — solo **con qué
  número** se decide si corresponde aplicarlos.
- No se registran dosis de fármacos. Se registra **cuáles** están puestos, no
  cuánto.
- No se toca la matriz de categorización SOCHIMI, que la coordinación
  configura desde la planilla.

---

## 1 · Resumen

**Hoy:** hay un solo campo SAS. La evolución lo narra como «meta SAS», pero
cuatro decisiones automáticas de la app lo leen como si fuera el estado del
paciente. Escribas el que escribas, algo queda mintiendo.

**Después:** se registran los dos —el que tiene y el que se busca—, y una
sedación para controlar la agitación se puede declarar como tal sin que la app
la confunda con volver a sedación profunda.

---

## 2 · La historia

### ANTES

Diego va a evolucionar. Tiene un paciente en **SAS 6** y el objetivo es llegar
a **SAS 4** — pero a pesar de las medidas no se logra de forma consistente.

Abre el formulario y hay **un solo casillero que dice SAS**. Y ahí empieza el
problema, porque los dos números que tiene en la cabeza no caben en uno:

- Si escribe **6**, que es lo que el paciente tiene, la evolución sale diciendo
  «para meta SAS 6» — como si el objetivo fuera tener al paciente agitado.
- Si escribe **4**, que es la meta, la app entiende que el paciente está
  tranquilo y cooperador: le habilita el S5Q y el CAM-ICU, le abre todos los
  niveles de KTM y lo puntúa como de bajo riesgo en la categorización. Con un
  paciente que está agitado.

Y hay un segundo problema encima. Ese paciente **está sedado, pero no con
sedación profunda**: lleva algo para controlar la agitación. Diego no tiene
cómo decir eso. Si lo anota como sedación —que es lo que es—, la app lo lee
como que la sedación **se reinició**, y la fecha de «sedación suspendida», que
es el antes y el después para evaluar la respuesta a la suspensión de
hipnóticos y para interpretar el GCS, **desaparece de la entrega**.

Así que lo anota igual, porque es lo que corresponde clínicamente, y pierde el
dato de cuándo se suspendió la sedación profunda.

### DESPUÉS

Diego escribe **SAS 6** en «actual» y **4** en «meta». La evolución dice «SAS 6
(meta 4)». El S5Q y el CAM-ICU quedan ocultos, como corresponde a un paciente
agitado, y la KTM no le ofrece niveles que hoy no puede hacer.

Marca la casilla **«sedación vigil / control de agitación»** y elige, de una
lista corta, cuáles tiene puestos: precedex. La entrega sigue mostrando
**«💤 Sedación profunda suspendida el 09-08»**, porque eso no cambió — el
paciente no volvió a sedación profunda.

El colega que reciba el turno lee, de una sola vez: está agitado, buscamos 4,
está con precedex para eso, y lleva tres días fuera de sedación profunda.

---

## 3 · Objetivos y no-objetivos

| | |
|---|---|
| **O1** | Se registran los dos números: el SAS **actual** del paciente y la **meta** perseguida. |
| **O2** | Las cuatro decisiones automáticas de la app usan el **actual**, no la meta. |
| **O3** | Una sedación que no es profunda se puede declarar como tal, y **no reinicia** la fecha de suspensión de sedación profunda. |
| **O4** | Se puede registrar **cuáles** sedantes están puestos, de una lista corta. |
| **O5** | La entrega muestra el SAS **actual** y no pierde la fecha de suspensión. |

| | |
|---|---|
| **NO1** | **No** se piden dosis ni velocidades de infusión. Eso vive en la ficha médica. |
| **NO2** | **No** se cambia la escala SAS ni sus cortes clínicos. |
| **NO3** | **No** se recalculan las evoluciones ya guardadas. Lo de antes queda como está y se documenta que ese número es ambiguo. |
| **NO4** | **No** se agrega un campo obligatorio más. Meta, casilla y fármacos son opcionales; el turno se guarda sin ellos como hoy. |

---

## 4 · Cómo funciona hoy → Cómo va a funcionar

### HOY

```
El colega elige escalón de sedación y escribe UN número en «SAS»
        │
        ├─ la evolución lo narra como  «para meta SAS 6»
        │
        ├─ y CUATRO decisiones lo leen como estado del paciente:
        │     · GCS automático en 3 si SAS = 1
        │     · KTM limitada al nivel 1 si SAS = 1
        │     · S5Q y CAM-ICU se ocultan si SAS < 3
        │     · categorización SOCHIMI, «estado mental»
        │
        └─ y si el escalón es distinto de «Sin sedación»
                 └─ la fecha de «sedación suspendida» se BORRA
                          └─ y la entrega deja de mostrarla
```

**Los dos puntos exactos de la falla:**

1. Un solo campo para dos cosas distintas. La narración lo trata como meta y
   las decisiones como estado real. **No hay número correcto.**
2. La fecha de suspensión se calcula con «¿el escalón es distinto de *Sin
   sedación*?». Cualquier sedación cuenta como volver a sedación profunda,
   aunque sea precedex para que el paciente no se saque el tubo.

### VA A FUNCIONAR

```
El colega registra:
   SAS actual  6      ← lo que el paciente tiene
   Meta SAS    4      ← lo que se persigue
   ☑ sedación vigil / control de agitación
   Sedantes: precedex
        │
        ├─ la evolución narra  «SAS 6 (meta 4)»  con los sedantes puestos
        │
        ├─ las CUATRO decisiones automáticas usan el ACTUAL (6)
        │     → S5Q y CAM-ICU ocultos, como corresponde
        │
        └─ ¿es sedación profunda?
              NO (está marcada como vigil) → la fecha de suspensión
                                              NO se toca                ✔
              SÍ                            → la fecha se reinicia,
                                              como hasta ahora
```

---

## 5 · Los datos

### Lo que hay hoy

| Columna | Qué guarda | Problema |
|---|---|---|
| `SED_TIPO` | Sin sedación · Escalón 1-6 · Fuera de escalón | No distingue profunda de vigil |
| `SED_SAS` | **un** número 1-7 | Narrado como meta, usado como estado real |
| `SED_BNM` | bloqueo neuromuscular | ✔ sin cambios |
| `SED_S5Q`, `SED_COOPERACION` | ✔ | ✔ sin cambios |

### Lo que se agrega — tres columnas, **al final del esquema**

| Columna nueva | Qué guarda |
|---|---|
| `SED_SAS_META` | la meta perseguida (1-7, opcional) |
| `SED_VIGIL` | ☑ esta sedación **no es profunda** (control de agitación / vigil) |
| `SED_FARMACOS` | lista de los sedantes puestos, en JSON |

**`SED_SAS` pasa a ser, oficialmente, el SAS ACTUAL.** Es el cambio más barato
y el menos riesgoso: las cuatro decisiones automáticas ya lo leen así, o sea
que **no hay que tocarlas** y ningún registro viejo cambia de comportamiento.
Lo único que cambia es la narración, que deja de llamarlo meta.

⇒ Exige correr **`crearORepararEstructura()`**.

**El catálogo de sedantes** (lista corta, la que dio Diego): fentanyl ·
propofol · midazolam · ketamina · precedex. Se marcan los que estén puestos;
se pueden marcar varios.

### 🔴 Inventario de consumidores

Todo lo que hoy lee `SED_SAS` o la fecha de suspensión, y qué le pasa:

| Consumidor | Dónde | Qué le pasa |
|---|---|---|
| Narrativa del cliente | `index` ~8280 | «para meta SAS 6» → **«SAS 6 (meta 4)»** |
| Narrativa del servidor | `dominio_texto.gs:52` | Lo mismo. **Los dos a la par o se separan** (lección de las secreciones). |
| GCS automático en 3 si SAS 1 | `autoCoopera` | Sin cambios: ya lee el actual. |
| KTM limitada a nivel 1 si SAS 1 | gates de KTM | Sin cambios. |
| S5Q y CAM-ICU ocultos si SAS < 3 | `aplicarGatesNeuro` | Sin cambios. **Y pasa a acertar**, que hoy no acierta. |
| Categorización SOCHIMI | matriz `SAS` | Sin cambios en código. ⚠️ Ver D4. |
| **Fecha de suspensión de sedación** | `svc_entrega`, el bucle del episodio | **Es la regla que se cambia.** |
| Ficha de la entrega | `svc_entrega` | Muestra el actual + la meta + los sedantes. |
| Hoja UCI (fila SAS) | `HJ_F` | Muestra el actual; la meta puede ir al lado. |
| Hoja de registro impresa | fila «SAS/Escalón» | Sin cambios (se llena a mano). |
| Réplica del turno anterior | `_HER_CAMPOS` | La meta y los sedantes **se replican** (persisten entre turnos); el SAS actual **no**, es una medición. Ver D3. |
| REM e indicadores | — | No leen SAS. Nada que hacer. |

---

## 6 · Pseudo-código — el acuerdo

```
CUANDO se guarda una evolución

  el SAS que se registra es el ACTUAL — lo que el paciente tiene ahora
  la META es aparte, y es opcional

  ¿hay meta escrita?
      SÍ → el texto dice «SAS 6 (meta 4)»
      NO → el texto dice «SAS 6», como hasta ahora


CUANDO se calcula desde cuándo está suspendida la sedación profunda

  se recorre el episodio, turno por turno, y en cada uno se pregunta:

      ¿este turno tiene sedación PROFUNDA?
          · «Sin sedación»                      → no
          · marcado como vigil / agitación      → no        ← LO NUEVO
          · cualquier otro escalón              → sí

      si tiene profunda      → se olvida la fecha (volvió a estar sedado)
      si NO tiene, y antes sí → se anota la fecha de este turno

  ⇒ un paciente con precedex para la agitación conserva su fecha de
    suspensión, porque nunca volvió a sedación profunda.


CUANDO el colega marca «sedación vigil»

  el escalón se sigue pidiendo: la casilla dice de qué NATURALEZA es la
  sedación, no la reemplaza.
```

**Promesas:**

- La meta, la casilla y los sedantes son **opcionales**: el turno se guarda sin
  ellos igual que hoy.
- Ninguna evolución ya guardada se recalcula ni cambia de significado.
- El SAS actual **no se replica** del turno anterior: es una medición, y
  heredarla daría por hecho algo que nadie evaluó (misma regla del cuff).
- Si no hay meta, no se inventa una.

---

## 7 · Lo que hay que decidir antes de programar

**D1 · ¿El número que el equipo ha estado escribiendo es el actual o la meta?**
La app lo narra como meta y lo usa como actual, así que cada colega pudo elegir
distinto. Necesito saber qué han estado haciendo en la práctica para escribir
la nota que acompañe a los registros anteriores. **No se van a recalcular**;
solo se documenta.

**D2 · Cómo se declara que la sedación no es profunda.** Tres formas:

- **(a) Una casilla** «sedación vigil / control de agitación» junto al escalón
  — *mi recomendación*. Un clic, conserva el escalón, y dice explícitamente lo
  que hay que decir.
- **(b) Un tipo nuevo** en el desplegable de sedación. Más simple de ver, pero
  se pierde el escalón.
- **(c) Derivarlo de la meta**: si la meta es 3 o más, no es profunda. Cero
  campos nuevos, pero la regla queda implícita — y este proyecto ya se quemó
  derivando una regla clínica sin declararla (la interfaz que «decidía» que
  había VNI, v5.41).

**D3 · ¿La meta se replica al turno siguiente?** Propongo que **sí** (es una
indicación que persiste) y que el SAS actual **no** (es una medición). Si en la
unidad la meta se revisa cada turno, mejor que no se replique.

**D4 · La categorización SOCHIMI, que no es parte del pedido pero conviene
mirar.** Con los cortes actuales, un SAS 6 —agitado— puntúa igual que un SAS 4
—tranquilo y cooperador—: la matriz premia «más despierto». Con el SAS actual
bien registrado eso se va a ver más seguido. Los cortes se configuran desde la
planilla sin tocar código, así que es decisión de la coordinación si se ajusta.

---

## 8 · Cómo se comprueba que quedó bien

Guardia nueva, con el caso de la historia:

- Paciente SAS 6, meta 4 ⇒ el texto dice «SAS 6 (meta 4)» **en el cliente y en
  el servidor**, con la misma frase.
- Con SAS actual 6, el S5Q y el CAM-ICU quedan **ocultos** (hoy, escribiendo la
  meta 4, se mostraban).
- Episodio: sedado profundo días 1-3, «sin sedación» el día 4, **sedación vigil
  con precedex** los días 5 a 8 ⇒ la fecha de suspensión sigue siendo **el día
  4**, no se pierde.
- Control negativo: el mismo episodio con sedación **profunda** el día 5 ⇒ la
  fecha **sí** se borra.
- La meta se replica al turno siguiente y el SAS actual **no**.
- Sin meta escrita, el texto no inventa una.

---

*Este documento fija la estructura, no la implementación. Cuando las cuatro
decisiones estén tomadas, se programa contra él.*
