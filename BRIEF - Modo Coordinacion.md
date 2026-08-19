# 🔐 Modo Coordinación — RCE-KINE

*Para Klga. Magdalena Contardo · 19 de agosto de 2026*

---

## Para qué sirve

Hasta ahora, si un dato de un paciente quedaba mal —una fecha de ingreso, un RUT mal
tecleado— no había forma de arreglarlo desde la aplicación. Había que pedirle a alguien
que entrara al código.

**Ahora se corrige desde la app, en menos de un minuto.**

El caso que lo motivó: un paciente estuvo **28 días** en la unidad y quedó archivado con
**un día de estadía**, porque su fecha de ingreso estaba mal y los días se congelan al dar
el alta. Ese número se iba directo al promedio del mes.

---

## Dónde está

En el RCE, arriba, la última pestaña: **🔐 COORDINACIÓN**

La pestaña la ve todo el equipo, pero está con candado: sin clave no muestra nada.

---

## Cómo se entra

| | |
|---|---|
| **Usuario** | `coord1` |
| **Clave** | la que te entregaron en persona |

La primera vez te va a pedir que **cambies la clave por una tuya**. Elígela de al menos
8 caracteres. Nadie más la sabe, ni queda escrita en ninguna parte.

> **Si la olvidas:** Manuel o Diego te generan una nueva desde su propio acceso. No hay
> forma de recuperar la vieja — se reemplaza.

La sesión se cierra sola a los 30 minutos sin uso, para que un computador del box no quede
abierto.

---

## Qué se puede hacer

### 1. Buscar a cualquier paciente

Escribe **nombre, apellido o RUT**. Encuentra tanto a los que están en cama como a los que
ya egresaron, por lejos que sea.

Ahora acepta el RUT con puntos o sin ellos, y las palabras en cualquier orden: «Diego
Villagrán» encuentra a Diego Melo Villagrán, cosa que antes no pasaba.

### 2. Corregir sus datos

**Fechas** — ingreso, egreso, inicio de ventilación, inicio de vía aérea (cada una con su hora).

**Datos administrativos** — nombre, RUT, edad, sexo, diagnóstico, diagnóstico REM, motivo y
destino de egreso.

Al guardar, **los días se recalculan solos**. Si corriges la fecha de ingreso de alguien que
egresó, sus días de estadía se ajustan al número real.

---

## Qué NO se puede hacer

- **Escribir los días a mano.** Los días salen de las fechas: si el número está mal, la
  fecha está mal. Corriges la fecha y el número se acomoda.
- **Tocar el texto clínico** de las evoluciones. Eso lo firmó un colega en su turno y no se
  reescribe desde aquí.
- **Corregir sin dejar huella.** No existe el modo silencioso (ver abajo).

---

## Toda corrección queda registrada

Cada cambio guarda **quién, cuándo, qué campo, y qué decía antes**. Queda de dos formas:

- **A la vista en la ficha del paciente** — cualquiera que la abra después entiende por qué
  el número cambió.
- **En el registro de auditoría** del sistema, con tu firma (`MCC`).

Es a propósito: es una ficha clínica, y un dato que cambia sin explicación vale menos que el
dato equivocado.

---

## Una cosa importante sobre las fechas

Cuando corriges una fecha, **el turno ya no la puede cambiar**. Queda fija.

Se sueltan solas en un caso: si el paciente cambia de tipo de soporte (por ejemplo de VM a
VNI) o de vía aérea. Ahí empieza un tramo clínico nuevo y el contador arranca de nuevo, como
corresponde.

---

## Si algo no cuadra

Avísale a Manuel. Todo queda registrado, así que siempre se puede ver qué pasó y cuándo.
