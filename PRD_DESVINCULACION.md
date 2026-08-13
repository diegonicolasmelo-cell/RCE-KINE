# PRD — La desvinculación deja al paciente donde quedó

**Estado:** ✅ Decidido y programado (v5.56-desvinc, 12-08-2026)
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

## 7 · Las decisiones, resueltas por Diego (12-08-2026)

**D1 · El traductor.** Resuelto, y con una corrección de vocabulario:

> «CNAF, CTAF/OAF son iguales. OAF es oxigenoterapia de alto flujo, CTAF es una
> forma coloquial de decir cánula traqueal de alto flujo y CNAF es cánula nasal
> de alto flujo. Debería en este caso llamarla solamente **CTAF** porque así nos
> entendemos.»
>
> «[La válvula de fonación] puede ir **con o sin O2 adicional**.»
>
> «TQT con NRC no tiene mucho sentido. El paso previo a la decanulación es el
> **O2 adicional por válvula de fonación**.»

⇒ El desplegable «Queda con» queda así, y el traductor con él:

| «Queda con» | → soporte | → modo |
|---|---|---|
| Tubo T | Oxigenoterapia/OAF | Tubo T |
| HME | Oxigenoterapia/OAF | HME |
| **CTAF** | Oxigenoterapia/OAF | CTAF |
| **Válvula de fonación con O2** | Oxigenoterapia/OAF | Válvula de fonación |
| **Válvula de fonación sin O2** | Ambiente | Válvula de fonación |
| Ambiente | Ambiente | Sin soporte |

- «Traqueostomía con O2 (naricera/máscara)» **sale del desplegable**.
- En el catálogo de la TQT, el modo `OAF/CTAF` pasa a llamarse **`CTAF`**.
- Los destinos de registros anteriores («CNAF / OAF», «Válvula de fonación» a
  secas, la naricera) **se siguen entendiendo**: están en el traductor aunque
  ya no se ofrezcan.

**D2 · Los días de VM — resuelto, y no necesitó ni una línea de código.**

> «8vo día de estadía en UCI, si se desvinculó hace 2 días y logró estar 6 días
> con VM incluyendo el día de la desvinculación, se consideran solo los 6 días
> de VM para el cálculo. Si requiere reconexión **se retoma esos 6 días y
> empieza a sumar** a medida que pase el tiempo. En resumen, los días
> siguientes suman al previo y **no se cuentan desde 0**.»

Esa es, textualmente, la regla de tramos que la app implementa desde la v5.42:
el contador se congela al salir del soporte y al volver retoma el acumulado más
el tramo abierto. Lo único que faltaba era que la desvinculación cerrara el
tramo — que es lo que este PRD agrega. **Cero cambios en el conteo**, y la
guardia lo fija con los números del ejemplo.

⚠️ **Un matiz que conviene tener escrito**: Diego contó «6 días» de forma
inclusiva (01 a 06). La app usa la convención **Día 0 = día de conexión**, la
misma de la lista oficial de BUDA validada en la v5.35, así que ese mismo
episodio se muestra como **5**. No es un desacuerdo con su regla —lo que él
fijó es que el contador no se reinicia— pero si algún día se decide contar
inclusivo, hay que cambiarlo aquí y en los días de estadía a la vez.

**D3 · La reconexión en el mismo turno.** Se aplica O3: si el paciente se
reconecta antes de que termine el turno, la cama **no se cambia** — cierra el
turno ventilado, como estaba.

**D4 · La entrega.** Sin chip nuevo. La entrega ya dice «→ queda con …» y
«SIN reconexión registrada»; con este cambio el casillero de soporte concuerda
con esa frase, que era justamente lo que no pasaba.

---

## 9 · Lo que apareció al programarlo

**🔴 Renombrar una opción le borraba el dato a las evoluciones viejas.** Al
pasar `OAF/CTAF` a `CTAF` se destapó que la función que llena los desplegables
descartaba un valor guardado si ya no estaba en el catálogo: al reabrir una
evolución antigua el select se iba a la primera opción y el re-guardado escribía
ésa. **Era un riesgo vivo desde el renombre de «Mascarilla» → «MR» (v5.40)**, no
lo introdujo este cambio. Ahora el valor guardado se conserva como opción,
marcado «(registro anterior)» para que el colega lo vea y pueda actualizarlo.

**La poda de eventos.** Al pasar la desvinculación a decidir el estado final,
hubo que sumarla a la lista de «eventos activos» del payload: sin eso, reabrir
el turno para corregir la firma borraba el estado final y la cama volvía a decir
VM. Es el mismo modo de fallo que ya se pagó con la TQT en la v4.6.

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
