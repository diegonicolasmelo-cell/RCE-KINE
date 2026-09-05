# 🤝 Nota para Manuel — actualizada el 5-sep-2026

**Mensaje de Diego (5-sep, textual):** *«dile a Manuel que no programe nada —
estoy haciendo esto en una rama paralela y, una vez que tengamos todo listo y
probado, podríamos juntar con sus cambios, si es que tiene».*

---

## 🔴 Lo importante, en dos líneas

1. **NO programes ni publiques nada por ahora.** Diego está probando una tanda
   grande (v5.86 → v5.96) que vive completa en la rama **`filtros-vence-hoy`**.
2. Cuando él la dé por probada, **se fusiona con lo tuyo** (si tienes algo en
   curso, guárdalo en su rama y avisa por aquí o por Slack).

## Lo que hay ahora mismo en el repo

| Rama | Qué es | ¿Se toca? |
|---|---|---|
| `main` / `develop` | Lo aprobado hasta la **v5.85**. | Solo leer |
| **`filtros-vence-hoy`** | **La tanda en prueba: v5.86 → v5.96** (incluye y reemplaza a `nota-timeline-synapse-cumpleanos`). Diego la está pegando y probando en producción por partes. | La trabaja Diego con su sesión |
| `prototipo-plantillas-evolucion` | 🚫 Prototipo de plantillas. NO se pega ni se fusiona. | No |

## Qué trae la tanda v5.86 → v5.96 (113 guardias verdes)

- 📌 Nota del turno → hito en timeline · 🩻 botón Synapse (copia RUT) ·
  🎂 cumpleaños en la mascota (v5.86) y pose dibujada (v5.90)
- 🏷️ «Vencen hoy» por coincidencia de etiqueta en el chip del formulario
  (que avisaba una noche TARDE — quinto consumidor que la corrección del
  10-ago no alcanzó), la hoja diaria impresa y el modal (v5.87-v5.88)
- 🩻 el botón copia ANTES de abrir (window.open consume la activación del
  clic) (v5.89)
- 🔔📨 **Campana de alertas + buzón de notificaciones** en la barra — hoja
  nueva `NOTIFICACIONES`, de SOLO agregar (v5.91) · 📣 aviso de coordinación
  desde 🔐 (v5.96)
- 🖨️ chip de cama legible en B/N + motivo de suspensión KTM obligatorio y
  en la entrega (v5.92)
- 🫁 alerta «pendiente medir pimometría» (v5.93) · 📋 motivo de MRC/FSS
  pendientes derivado de la cooperación (v5.94) · «NE» del FSS-ICU según el
  manual (v5.95)

**Cambia esquema** (hoja NOTIFICACIONES + columnas ULT_PS/ULT_PIM/ULT_PIM_FECHA
en CAMAS_ESTADO + CUMPLE en KINESIOLOGOS + claves CONFIG) ⇒ un solo
`crearORepararEstructura()`, que corre Diego.

## Si necesitas tocar algo urgente

Habla primero con Diego (o deja nota aquí). La regla de «quien publica avisa»
aplica doble mientras la tanda esté a medio pegar: **crear una versión nueva en
el editor ahora publicaría código a medio probar.**
