# PRD — La desvinculación deja al paciente donde quedó

**Estado:** Borrador, esperando cuatro decisiones de Diego
**Dueño:** Diego Melo Villagrán (coordinador de kinesiología UCI)
**Creado:** 12-08-2026
**Alcance:** el estado ventilatorio con que el paciente QUEDA tras desvincularse
de la VM, y que ese estado sea el que hereda el turno siguiente.

**Qué queda FUERA de este PRD:**

- La desvinculación no se convierte en un módulo ventilatorio completo (Ppl,
  DP, Cest, AutoPEEP). Un paciente que queda en cánula de alto flujo por TQT no
  tiene esos números.
- No se toca la reconexión ni el cálculo de horas de desvinculación: funcionan.
- No se toca la extubación, la decanulación ni la TQT.
- No se agregan columnas al esquema si se puede evitar (ver §5).

---

## 1 · Resumen

**Hoy:** al desvincular a un paciente de la VM se anota la hora, a qué queda y
el motivo — pero la cama sigue diciendo que está en CPAP/PS, y el turno
siguiente arranca con ese dato viejo.

**Después:** el «queda con» de la desvinculación manda sobre el estado de la
cama, igual que ya manda el de una intubación o una extubación.

---

## 2 · La historia

### ANTES

Diego entra a las 8 de la mañana a recibir el turno. El colega de la noche le
entrega al paciente de la 12: evolucionó bien, se desvinculó de la VM a las
02:30 y quedó con cánula de alto flujo por la traqueostomía. Todavía no se
reconecta y ojalá no haga falta.

Abre la app. La ficha del paciente dice, en el casillero de soporte,
**«VM · CPAP/PS»**.

Diego sabe que eso no es cierto porque acaba de escucharlo en la entrega. Pero
el papel que se imprimió a las 7 lo dice, la tarjeta de la cama lo dice, y la
evolución que él está por escribir arranca replicando ese mismo dato. Si no lo
corrige a mano, el turno de la tarde lo va a heredar otra vez.

Y lo corrige a mano — pero es el único que estaba en esa entrega. El médico que
pase a la ronda a las 9 y mire la pantalla va a ver un paciente conectado a
ventilador que en realidad lleva seis horas respirando por su cuenta.

### DESPUÉS

El colega de la noche marca la desvinculación, elige «CNAF / OAF» en **Queda
con** y guarda. Nada más.

A las 8 de la mañana la ficha de la 12 dice **«Oxigenoterapia/OAF · CNAF»**, con
la línea de abajo que avisa **«Antes: VM · CPAP/PS → Oxigenoterapia/OAF ·
CNAF»**. Diego recibe el turno leyendo lo mismo que le contaron. La evolución
que escribe arranca del estado correcto, y el papel de la ronda también.

---

## 3 · Objetivos y no-objetivos

| | |
|---|---|
| **O1** | El estado con que queda el paciente tras la desvinculación es el que hereda la cama y el turno siguiente. |
| **O2** | Se registra **sin campos nuevos que llenar**: el colega ya elige «Queda con»; ese dato pasa a servir para algo más que la narración. |
| **O3** | Si en el mismo turno se reconecta a VM, manda la reconexión — el paciente termina el turno ventilado y así debe quedar. |
| **O4** | La desvinculación se lee como las demás transiciones: en la línea «Antes: X → Y», en la Hoja UCI y en la entrega. |

| | |
|---|---|
| **NO1** | **No** se pide el módulo ventilatorio completo al desvincular. |
| **NO2** | **No** se cambia el catálogo de soporte/modo de la TQT. Si un destino no calza con lo que existe hoy, se decide con Diego, no se inventa una opción nueva (§7, D1). |
| **NO3** | **No** se toca la extubación, la decanulación ni la TQT — funcionan y ya tienen su panel. |
| **NO4** | **No** se cambia cómo se cuentan los días de VM sin que Diego lo decida explícitamente (§7, D2). Esto mueve indicadores que el equipo ya vio. |
| **NO5** | **No** se agrega una columna al esquema si el dato ya existe. |

---

## 4 · Cómo funciona hoy → Cómo va a funcionar

### HOY

```
El colega marca «Se desvincula de VM»
  ├─ escribe hora, elige «Queda con», elige motivo
  ├─ (opcional) marca reconexión + su hora
  └─ guarda
        │
        ├─ se guardan DESVINC_OCURRIO, DESVINC_HORA, DESVINC_A,
        │  DESVINC_MOTIVO, DESVINC_RECONEXION, DESVINC_HORA_RECON,
        │  DESVINC_HORAS, DESVINC_DET                                   ✔
        │
        ├─ el texto narra «Se desvincula a las 02:30, queda con …»      ✔
        ├─ va a la entrega, a la Hoja UCI y a la línea de tiempo        ✔
        │
        └─ estado FINAL del turno  ──►  se calcula SIN mirar la
                                        desvinculación                 ✘
                 │
                 └─ la cama guarda el soporte de ARRIBA (CPAP/PS)
                          │
                          └─ el turno siguiente lo replica
                                   └─ el papel de la ronda lo imprime
```

**El punto exacto de la falla** está en la cascada que decide el estado final
del turno (`VENT_VIA_AEREA_FINAL` · `VENT_SOPORTE_FINAL` · `VENT_MODO_FINAL`,
index ~6288). Hoy pregunta, en este orden: ¿hubo intubación? ¿hubo TQT? ¿hubo
extubación sin reintubación? ¿hubo decanulación sin recanulación? Y si no,
deja lo que había arriba.

**La desvinculación no está en esa lista.** No es que esté mal calculada: es
que nadie la preguntó.

### VA A FUNCIONAR

```
El colega marca «Se desvincula de VM»
  └─ (lo mismo de siempre — no cambia ni un campo del formulario)
        │
        └─ estado FINAL del turno
                 │
                 ├─ ¿hubo intubación? ─────────────► queda en lo del panel
                 ├─ ¿hubo TQT? ────────────────────► queda en lo del panel
                 ├─ ¿hubo extubación sin reintub? ─► queda en el post-extubación
                 ├─ ¿hubo decanulación sin recan? ─► queda en lo de la decan
                 ├─ ¿hubo desvinculación…            ◄── NUEVO
                 │     …y NO se reconectó? ─────────► queda con DESVINC_A
                 │     …y SÍ se reconectó? ─────────► queda en VM (O3)
                 └─ si no ─────────────────────────► lo que había arriba
                          │
                          └─ la cama guarda «Oxigenoterapia/OAF · CNAF»
                                   └─ el turno siguiente lo replica
                                            └─ y la línea dice
                                               «Antes: VM · CPAP/PS → …»
```

---

## 5 · Los datos

### Lo que ya existe (y por eso esto es más barato de lo que parecía)

| Columna | Qué guarda | ¿Sirve? |
|---|---|---|
| `DESVINC_OCURRIO` | el interruptor del evento | ✔ |
| `DESVINC_HORA` | hora de la desvinculación | ✔ |
| **`DESVINC_A`** | **a qué queda — ya es un desplegable de 6 opciones** | **✔ es el dato que falta usar** |
| `DESVINC_MOTIVO` | weaning programado · prueba · definitiva · indicación médica · otro | ✔ |
| `DESVINC_RECONEXION` + `DESVINC_HORA_RECON` + `DESVINC_HORAS` | el candado y el delta | ✔ |
| `DESVINC_DET` | texto libre | ✔ |

**No hace falta ninguna columna nueva.** El «cómo queda» que Diego pidió ya se
está capturando desde la v4.2; lo que falta es traducirlo a soporte y modo.

### El traductor

`DESVINC_A` tiene 6 valores y el catálogo de la TQT tiene sus soportes y modos.
La correspondencia es casi directa, y donde **no** lo es hay que decidir (§7):

| «Queda con» | → soporte | → modo |
|---|---|---|
| Tubo T | Oxigenoterapia/OAF | Tubo T |
| HME | Oxigenoterapia/OAF | HME |
| Ambiente | Ambiente | Sin soporte |
| CNAF / OAF | Oxigenoterapia/OAF | **CNAF** o **OAF/CTAF** — el catálogo tiene los dos ❓ |
| Válvula de fonación | **Ambiente** u **Oxigenoterapia/OAF** — está en los dos ❓ | Válvula de fonación |
| Traqueostomía con O2 (naricera/máscara) | Oxigenoterapia/OAF | **no existe un modo equivalente** ❓ |

La vía aérea **no cambia**: sigue siendo TQT. La desvinculación no es una
transición de vía aérea; es una transición de soporte. Ésa es la diferencia con
la extubación y la decanulación, y por eso no necesita panel propio.

### 🔴 Inventario de consumidores

*(Esta sección no está en el método original. Se agrega porque en este proyecto
una regla clínica vive típicamente en cuatro sitios, y el que se queda atrás es
el que después contradice a los otros — pasó con la fecha de los filtros, con
«día con VM» y con las secreciones.)*

Todo lo que lee el estado final del turno, y por tanto **cambia con este PRD**:

| Consumidor | Dónde | Qué le pasa |
|---|---|---|
| La cascada del cliente | `index` ~6288 | **Es donde se agrega la rama.** |
| Sincronización de la cama | `_syncCamaDesdeEvolucion` | La cama pasa a guardar el soporte real. **Efecto buscado.** |
| Réplica del turno siguiente | `fillForm` / `fillFormReplica` | Arranca del estado correcto. **Efecto buscado.** |
| Línea «Antes: X → Y» (v5.49) | `_ANTES_CAMPOS` | Pasa a mostrar la transición. **Efecto buscado.** |
| Tarjeta de cama y grilla del registro | `obtenerTodasLasCamas` | Dejan de decir VM. **Efecto buscado.** |
| Entrega de turno | `svc_entrega` | Ya mostraba «→ queda con»; ahora además el casillero de soporte concuerda. |
| Hoja UCI | fila de soporte | Pasa a mostrar «VM→Oxigenoterapia/OAF». |
| Hoja de registro impresa | franja de soporte | Sale el estado real en la ronda. |
| **Días de VM / VNI (tramos, v5.42)** | `guardarEvolucion` | ⚠️ **Consecuencia a decidir** — ver D2. |
| **Indicadores** (`_esDiaVM`, `diasVM`, `ventilados`) | `svc_indicadores` | ⚠️ **Mismo asunto que D2.** |
| Poda de eventos al re-editar | `_podarEventosPayload` | ⚠️ **Hay que sumar la desvinculación a la lista de «algún evento activo»**, o al reabrir el turno para corregir otra cosa el estado final se pierde. Trampa real, ya pagada con la TQT en la v4.6. |
| Anulación del evento | `anularEvento`, grupo `desvinc` | Ya devuelve el estado final al inicial. Sigue sirviendo sin cambios. |

---

## 6 · Pseudo-código — el acuerdo

```
CUANDO se guarda una evolución

  ¿está marcada la desvinculación?          → si no, nada cambia
  ¿la vía aérea es TQT?                     → si no, nada cambia
                                              (la desvinculación solo existe con TQT)

  ENTONCES el estado con que TERMINA el turno es:

      ¿se reconectó a VM en este mismo turno?
          SÍ  → termina en VM, con el modo que traía
                (el paciente cierra el turno ventilado)
          NO  → termina en lo que dice «Queda con»:
                   soporte y modo salen del traductor
                   la vía aérea NO se toca: sigue en TQT

  Y ese estado es el que se guarda en la cama, el que replica el turno
  siguiente y el que se imprime en la ronda.


CUANDO se REABRE un turno que ya tenía una desvinculación guardada

  ¿el colega está corrigiendo otra cosa, sin ningún evento activo?
      → el estado final NO se recalcula ni se borra: se conserva el guardado
        (misma regla que ya protege a la intubación y a la TQT)


CUANDO se anula la desvinculación

  → el estado final vuelve a ser el estado de inicio del turno
    (ya funciona así; no se toca)
```

**Promesas:**

- Ni un campo nuevo que llenar en el formulario.
- Ninguna columna nueva en el esquema ⇒ **no exige `crearORepararEstructura()`**.
- Las evoluciones ya guardadas no se recalculan: esto vale hacia adelante.
- Si «Queda con» quedó vacío, **no se inventa un estado**: la cama conserva el
  que tenía y el turno siguiente hereda lo de siempre. Callar es mejor que
  adivinar.

---

## 7 · Lo que hay que decidir antes de programar

**D1 · El traductor.** Tres casillas del cuadro de §5 tienen ❓:

- **«CNAF / OAF»** → ¿el modo es `CNAF` o `OAF/CTAF`? El catálogo de la TQT
  tiene los dos y no sé cuál usa la unidad para un traqueostomizado.
- **«Válvula de fonación»** → ¿soporte `Ambiente` u `Oxigenoterapia/OAF`? El
  catálogo la ofrece en los dos, y la diferencia es si además lleva oxígeno.
- **«Traqueostomía con O2 (naricera/máscara)»** → hoy **no existe** un modo
  equivalente en el catálogo de la TQT. Salidas posibles: (a) mapearla al modo
  más cercano, (b) agregar el modo al catálogo, (c) sacar esa opción del
  desplegable si en la práctica no se usa.

**D2 · ¿La desvinculación corta el tramo de VM?** Es la decisión que mueve
números. Con la regla de tramos de la v5.42, si el paciente termina el turno
fuera de VM:

- el turno de la desvinculación **sigue contando** como día con VM (empezó
  ventilado) — eso no cambia;
- pero los turnos siguientes en que siga desvinculado **dejarían de contar**,
  y si se reconecta a los dos días se abriría un tramo nuevo.

Clínicamente parece correcto para una desvinculación definitiva y discutible
para un entrenamiento de weaning de varias horas. Diego decide, y hay que
avisarle al equipo porque cambia cifras que ya vieron.

**D3 · La reconexión en el mismo turno.** Propongo que termine en VM con el
modo que traía (O3). Si en la práctica el paciente se reconecta a un modo
distinto del que tenía, esto necesita un campo y deja de ser gratis.

**D4 · ¿La desvinculación sin reconexión debería avisar en la entrega?** Hoy la
entrega ya dice «SIN reconexión registrada». Con este cambio el casillero de
soporte dirá además CNAF. ¿Basta, o quiere un chip aparte como el de prono?

---

## 8 · Cómo se comprueba que quedó bien

Guardia nueva, con el caso de la historia:

- Paciente en TQT · VM · CPAP/PS. Se desvincula a las 02:30, queda con
  «CNAF / OAF», sin reconexión ⇒ la **cama** queda en Oxigenoterapia/OAF · CNAF
  y la vía aérea sigue en TQT.
- El **turno siguiente** replica eso, y la línea «Antes» muestra la transición.
- Mismo caso **con reconexión** a las 06:00 ⇒ la cama termina en VM.
- **Sin «Queda con»** ⇒ la cama no cambia (no se inventa nada).
- Se **reabre** el turno para corregir la firma ⇒ el estado final sobrevive.
- Se **anula** la desvinculación ⇒ vuelve a VM · CPAP/PS.
- Y el control que importa: los **días de VM** del episodio dan lo que D2 diga
  que tienen que dar, con el número escrito en el assert.

---

*Este documento fija la estructura, no la implementación. Cuando las cuatro
decisiones estén tomadas, se programa contra él.*
