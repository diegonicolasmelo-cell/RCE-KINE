# Triage de condicionantes del formulario (v1 → v2)

> Cada fila es un comportamiento que el formulario **viejo** hace solo y el **nuevo** (v2) todavía
> no. Agrupadas por la misma sección donde viven en el panel de evolución actual. Marca en la
> columna **Tu decisión** con `Sí` / `No` / `Después` (o coméntame directo). La columna
> **Recomendado** es solo mi sugerencia de partida — cámbiala si no calza con tu práctica real.
>
> Al cerrar esta tabla, implemento en lote las marcadas `Sí`, en el orden de prioridad que
> resulte. Nada se construye a ciegas.

---

## 🫁 Vía aérea y ventilación

| # | Condicionante | Qué hace en v1 | Recomendado | Tu decisión |
|---|---------------|----------------|:-----------:|:-----------:|
| 1 | Vía aérea → soporte disponible | Al elegir TOT/TQT/Natural/VNI, la lista de "Soporte" se filtra a las opciones válidas para esa vía (ya lo tenemos parcial vía `MODOS`, falta el filtro de soporte) | Sí | |
| 2 | Cambio de vía aérea → recalcula días | Si venías de TOT/TQT y pasas a Natural (o viceversa), reinicia el contador de "días de vía aérea" | Sí | |
| 3 | "Vía externa previa" (checkbox) | Si el paciente llegó con TOT/TQT puesto de otro centro, permite declarar días previos y los suma al contador | Sí | |
| 4 | Decanulación → detalle | Al marcar "ocurrió decanulación", despliega el bloque de detalle (a qué dispositivo queda, flujo, SpO₂) | Sí | |
| 5 | PVE (prueba vent. espontánea) → rama Sí/No | Al marcar PVE=Sí despliega "superada/fracasada" + motivos; PVE=No limpia esa rama | Sí | |
| 6 | Extubación: tipo → detalle | Si el tipo de extubación no es "sin condiciones", exige detalle adicional | Sí | |
| 7 | Reintubación → modal de confirmación | Al marcar reintubación, pide confirmar antes de sumar al contador (ya lo tenías identificado en `PLAN_MODALES.md` como modal a normalizar) | Sí | |
| 8 | UMA (asistencia manual) → tooltip de interpretación | Muestra un ⓘ con interpretación clínica según el valor elegido | Después | |

## 🩺 Auscultación

| # | Condicionante | Qué hace en v1 | Recomendado | Tu decisión |
|---|---|---|:-:|:-:|
| 9 | "Sin ruidos agregados" es excluyente | Si marcas "sin ruidos", desmarca cualquier otro ruido seleccionado (y viceversa) | Sí | |
| 10 | Ruidos = "Otro" → detalle | *(ya la agregué esta semana)* | ✅ Hecho | |

## 🧠 Sedación y Conciencia

| # | Condicionante | Qué hace en v1 | Recomendado | Tu decisión |
|---|---|---|:-:|:-:|
| 11 | Sedación ≠ "Sin sedación" → muestra SAS | El campo SAS solo aparece si hay algún tipo de sedación activa | Sí | |
| 12 | Auto-cooperación por BNM/SAS 1 | Si el paciente está en BNM o SAS=1, fuerza GCS en 1-1-1 (no evaluable) automáticamente | Sí | |

## ❤️ Hemodinamia

| # | Condicionante | Qué hace en v1 | Recomendado | Tu decisión |
|---|---|---|:-:|:-:|
| 13 | DVA ≠ "sin requerimientos" → habilita "múltiples DVA" | El checkbox de "multi-DVA" y el conteo de nº de drogas solo aparecen si ya hay alguna DVA | Sí | |
| 14 | Tendencia hemodinámica → tipo | Al marcar "con tendencia", despliega el campo de qué tipo de tendencia | Sí | |

## 🏃 Terapia Física — KTM

| # | Condicionante | Qué hace en v1 | Recomendado | Tu decisión |
|---|---|---|:-:|:-:|
| 15 | Contraindicación KTM en cascada | Tipo → Categoría → Razón: cada select se llena según lo elegido en el anterior (3 niveles) | Sí | |
| 16 | Alerta de suspensión KTM en sesión | Categoría de alerta → lista de criterios específicos de esa categoría (Tabla 3 del protocolo) | Sí | |
| 17 | AET (adecuación de esfuerzo) → nivel + tooltip | Al activar AET, despliega el nivel (I, II, IIIA…) con interpretación, y si corresponde **suspende KTM automáticamente** | Sí | |

## 🌬️ Terapia Respiratoria

| # | Condicionante | Qué hace en v1 | Recomendado | Tu decisión |
|---|---|---|:-:|:-:|
| 18 | Muestras microbiológicas → detalle | Checkbox "muestra" despliega el bloque de tipo/técnica | Sí | |
| 19 | Cantidad de secreciones (botones -,+,++,+++) | Selector tipo semáforo en vez de dropdown (mismo dato, otra interacción) | Después | |
| 20 | Posicionamiento colapsable + resumen en vivo | Al marcar prono/supino/sedente, arma un resumen de texto en vivo y guarda la hora de inicio | Sí | |

## 🔧 Procedimientos del turno

| # | Condicionante | Qué hace en v1 | Recomendado | Tu decisión |
|---|---|---|:-:|:-:|
| 21 | Cultivo especial → objetivo | Si el tipo de cultivo es "Mini Lab" o "Hisopado", exige declarar el objetivo | Sí | |

## 📋 Evaluación funcional / turno

| # | Condicionante | Qué hace en v1 | Recomendado | Tu decisión |
|---|---|---|:-:|:-:|
| 22 | Bloque visible solo de día | La evaluación funcional (RHB) se oculta completa en turno Noche — no se registra de noche | Sí | |

---

## Resumen de esfuerzo estimado

| Prioridad | Cantidad | Costo aprox. |
|-----------|----------|--------------|
| Bajo (1 condición simple) | ~14 | 1 línea de JS cada una |
| Medio (cascada 2-3 niveles) | ~6 | función corta + wiring a guardado |
| Con lógica de negocio (AET suspende KTM, modal reintubación) | ~3 | requiere tocar backend o modal ya planificado |

**Mi recomendación de secuencia:** hacer primero las de "Bajo" (rápidas, alto volumen, se notan
enseguida en el uso diario), luego las de "Medio", y dejar el modal de reintubación para cuando
normalicemos todos los modales (ya está en `PLAN_MODALES.md §8`).

---

> **Cómo seguimos:** revisa la columna "Tu decisión" (puedes responderme por chat en bloque, ej.
> "1-14 sí, 15-17 sí, 18-21 después" es suficiente, no hace falta ítem por ítem) y construyo el
> siguiente lote completo, probado, de una vez.
