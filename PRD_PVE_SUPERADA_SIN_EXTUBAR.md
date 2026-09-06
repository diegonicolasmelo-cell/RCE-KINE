# PRD · PVE superada sin extubar

**Estado**: propuesto — esperando el visto bueno de Diego
**Dueño clínico**: Diego Melo · **Dueño técnico**: quien programe la tanda
**Alcance**: poder registrar que una PVE se superó y el paciente **igual quedó en
ventilación mecánica**, con la razón.
**Fuera de alcance**: cambiar cómo se cuentan las extubaciones (siguen contándose
por `EXT_OCURRIO`) · tocar el protocolo de PVE ni el aviso de las 24 h de VM ·
modificar el catálogo de motivos de fracaso · las plantillas de evolución (ése es
el PRD hermano).

> **De dónde sale**: al definir los casos de las plantillas pregunté si existía
> «PVE superada sin extubar». Diego, 2-sep-2026: **«sí existe»**.

---

## 1 · Hoy y después, en dos líneas

- **Hoy**: marcar «PVE superada» *es* decir «se extubó». El formulario pide la
  hora de extubación y el texto escribe «progresando a extubación».
- **Después**: se puede decir que la prueba se superó y que el paciente no se
  extubó, con la razón — sin que ninguna cifra de extubaciones cambie.

---

## 2 · La historia

### Antes

Turno de día, cama 6. Paciente con 9 días de VM. Se hace PVE en tubo en T y la
tolera dos horas: **superada**. Pero a mediodía baja a pabellón por un aseo
quirúrgico programado y vuelve intubado. Nadie se extubó.

El kinesiólogo marca «superada» y la app le pide la hora de extubación. Sus tres
salidas son todas malas:

1. **Inventar una hora** → el REM cuenta una extubación que no ocurrió y el reloj
   del tiempo extubado arranca solo.
2. **Marcar «fracasada»** → miente al revés: la prueba se superó, y ese fracaso
   falso empuja al paciente a «weaning difícil».
3. **Dejar la PVE en «No»** → la prueba desaparece. No cuenta para el destete, no
   sale en la entrega, y el turno siguiente cree que hace tres días que no se
   prueba.

Elige la tercera, porque es la que menos daño hace. Y ahí se pierde el dato.

### Después

Marca «superada». Aparece una pregunta: **¿se extubó?** Responde **No**, razón
«pabellón o procedimiento programado». El texto sale solo:

> «Se realiza PVE con resultado superado. No se extuba por pabellón programado;
> mantiene ventilación mecánica.»

La PVE queda contada como realizada y superada, la entrega la muestra, el REM no
suma una extubación, y el turno de la noche sabe exactamente qué pasó.

---

## 3 · Objetivos y no-objetivos

| | |
|---|---|
| **O1** | Registrar PVE superada sin extubación, con su razón. |
| **O2** | Que esa PVE cuente como **PVE realizada y superada** (destete, entrega, línea de tiempo, hoja UCI). |
| **O3** | Que **no** cuente como extubación en ningún consumidor. |
| **O4** | Que las evoluciones ya guardadas signifiquen exactamente lo mismo que hoy. |

| | |
|---|---|
| **NO1** | No se cambia la definición de extubación: sigue siendo `EXT_OCURRIO`. |
| **NO2** | No se agrega un flujo de «reprogramar la PVE» ni recordatorios. |
| **NO3** | No se toca el aviso informativo de las 24 h de VM. |
| **NO4** | No se toca el catálogo de motivos de fracaso de PVE. |
| **NO5** | No se corrige hacia atrás ninguna evolución vieja (si hace falta, es una rutina aparte con simulacro). |

---

## 4 · El flujo, dibujado dos veces

### Cómo funciona hoy

```
PVE = Sí ──┬── Superada ──► SIEMPRE extubación
           │                 pide hora + soporte post-extubación
           │                 EXT_OCURRIO = verdadero
           └── Fracasada ──► sigue en VM, con motivos

PVE = No ──┬── (casilla «hubo extubación sin PVE») ──► extubación
           └── razón ──────────────────────────────► sigue en VM

PVE = No corresponde ──► sigue en VM, causa de base no resuelta
```

**El hueco**: de las cuatro combinaciones posibles entre «se hizo la prueba» y
«se extubó», el formulario cubre tres. Falta *prueba superada + no se extubó*.
Ya existe su espejo («extubación sin PVE», casilla `cExtSinPve`), lo que hace más
evidente que ésta faltaba.

### Cómo va a funcionar

```
PVE = Sí ──┬── Superada ──┬── ¿se extubó?  Sí (por defecto) ──► igual que hoy
           │              └── ¿se extubó?  No ──► razón obligatoria
           │                                     sin hora, sin soporte PE
           │                                     EXT_OCURRIO = falso
           │                                     PVE_SUP_SIN_EXT = verdadero
           └── Fracasada ──► sin cambios
```

---

## 5 · Los datos

### Qué se guarda

Dos columnas nuevas **al final** de EVOLUCIONES (la reparación reescribe
encabezados: insertar al medio desalinea los datos):

| Columna | Tipo | Qué guarda |
|---|---|---|
| `PVE_SUP_SIN_EXT` | booleano | La prueba se superó y no se extubó |
| `PVE_SUP_SIN_EXT_RAZ` | texto | Por qué no se extubó |

🔴 **Requiere correr `crearORepararEstructura()`** desde el editor al pegar la
entrega. Es lo único del proyecto que no se puede automatizar.

### Razones propuestas (necesitan tu confirmación)

Pabellón o procedimiento programado · Indicación médica de mantener soporte ·
Sin condiciones de vía aérea (tos débil, secreciones) · Se difiere al turno
siguiente · Otra (con detalle obligatorio, como en el resto del formulario).

### El candado: un solo punto de verdad

Todo el sistema traduce «superada ⇒ se extubó» **en un solo lugar**:
`_extOcurrio()` (`v2/index.html` ~11390), que hoy dice:

```
si PVE = Sí  →  devuelve (resultado == 'superada')
```

Ése es el candado. Arreglarlo ahí corrige de una vez a todos los consumidores que
cuentan extubaciones, porque **ninguno mira `PVE_RESULTADO` para eso**: todos
leen `EXT_OCURRIO`. Es la razón por la que este cambio es chico.

### Inventario de consumidores

Los 14 archivos que leen `PVE_RESULTADO` o `EXT_OCURRIO`, con su veredicto:

| Dónde | Qué hace | Veredicto |
|---|---|---|
| `svc_rem.gs:313` | Cuenta extubaciones del REM | ✅ **No cambia** — lee `EXT_OCURRIO` |
| `svc_stats.gs:199` | Extubaciones del tablero | ✅ **No cambia** — lee `EXT_OCURRIO` |
| `svc_stats.gs:89` | Motivo «ya extubado» de la alerta de PVE | ✅ **No cambia** — lee `EXT_OCURRIO` |
| `svc_evoluciones.gs:770` | Reloj del tiempo extubado | ✅ **No cambia** — exige `EXT_OCURRIO` + hora |
| `svc_evoluciones.gs:547` | `WEAN_PVE_JSON` (alimenta el grado del destete) | ✅ **No cambia** — guarda 'superada'; el reloj del destete sigue corriendo, que es lo correcto |
| `svc_stats.gs:205` | `pveSup++` (PVE superadas) | ⚠️ **Decidir** — ver abajo |
| `svc_entrega.gs:136` | Hito «▲ PVE superada» | 🔧 **Cambia** — debe decir que no se extubó |
| `dominio_texto.gs:311` | «progresando a extubación» | 🔧 **Cambia** — rama nueva |
| `index.html` · `genTexto` | Espejo del texto en el cliente | 🔧 **Cambia** — paridad obligatoria con el servidor |
| `index.html:11390` · `_extOcurrio` | El candado | 🔧 **Cambia** |
| `index.html:11118` · `hPVEres` | Muestra/oculta la rama superada | 🔧 **Cambia** — agrega el interruptor |
| `index.html` · hoja UCI (`pveRes`) | Fila «Resultado PVE» del historial | 🔧 **Cambia** — mostrar el matiz |
| `checks/indicadores.js`, `pivot.js`, `tablero.js`, `integridad.js`, `hoja_uci.js`, `pve_otra_motivo.js`, `rem_conciliacion.js` | Guardias | 🔍 **Revisar** — más una guardia nueva propia |

> ⚠️ **La decisión pendiente (`pveSup`)**: una PVE superada sin extubar ¿suma al
> indicador «PVE superadas»? **Propuesta: sí** —la prueba se superó, y decir lo
> contrario sería el mismo error que hoy obliga a mentir—, pero mostrándolas
> **aparte** en el tablero, para que nadie lea ese número como si fueran
> extubaciones.

---

## 6 · El acuerdo, en pseudo-código

```
CUANDO el colega marca PVE = Sí y resultado = Superada
    → aparece «¿Se extubó?» con Sí (por defecto) / No

    SI responde Sí
        → todo sigue exactamente como hoy

    SI responde No
        → se esconden la hora de extubación y el soporte post-extubación
        → se pide la razón (obligatoria)
        → EXT_OCURRIO queda en FALSO
        → PVE_SUP_SIN_EXT queda en VERDADERO, con su razón

CUANDO se guarda
    → la PVE cuenta como realizada y superada
    → la extubación NO se cuenta en ninguna parte
    → el texto narra la prueba y por qué no se extubó
```

### Las promesas

1. **Una evolución guardada antes de este cambio se lee igual que hoy.**
   `PVE_SUP_SIN_EXT` vacío = comportamiento de siempre.
2. **Ninguna cifra de extubaciones cambia por este cambio** — REM, tablero,
   entrega y tiempo extubado dan lo mismo antes y después. Se prueba con guardia
   sobre datos de ejemplo con las cuatro combinaciones.
3. **Volver atrás no deja residuos**: si el colega vuelve a «Sí, se extubó», se
   recupera el flujo completo y las columnas nuevas quedan vacías.
4. **La razón es obligatoria**: sin ella no se guarda, igual que «Otra» exige
   detalle en el resto del formulario.
