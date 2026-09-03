# 🤝 Nota para Manuel — 2/3-sep-2026

Diego pidió dejar esto escrito **para que no nos crucemos**: *«deja una nota a
Manuel para cuando su Claude intervenga, que no se crucen el trabajo de cada
uno. Después fusionar para prosperar.»*

---

## Lo que hay ahora mismo en el repo

| Rama | Qué es | ¿Se puede publicar? |
|---|---|---|
| `main` / `develop` | Lo aprobado. Última versión conocida: **5.85**. | Sí, como siempre |
| **`nota-timeline-synapse-cumpleanos`** | **v5.86 · lista para pegar.** Ver abajo. | Sí — Diego la implementa la noche del 2-sep |
| **`prototipo-plantillas-evolucion`** | 🚫 **Prototipo. NO se pega ni se fusiona.** Lee su `LEEME_ESTA_RAMA_ES_PROTOTIPO.md`. | **No** |

## Qué trae la v5.86 (rama `nota-timeline-synapse-cumpleanos`)

Tres cosas chicas e independientes, **110 guardias verdes**:

1. **📌 La nota del turno deja hito en la línea de tiempo.** No hay bloque nuevo
   en el formulario: se le dio salida a `PLAN_NOTA_TURNO`, que ya existía. El
   hito es de tipo `nota` y se agregó a `_TIPOS_HITO_AUTO` para que al corregir
   la nota se reemplace en vez de duplicarse.
2. **🩻 Botón de Synapse** en la tarjeta del paciente: copia el RUT al
   portapapeles y abre Synapse en otra pestaña. Sin `CONFIG.SYNAPSE_URL` el
   botón no aparece, así que **hasta que Diego llene esa clave no cambia nada**.
3. **🎂 Cumpleaños en la mascota**, desde la columna nueva `CUMPLE` de
   `KINESIOLOGOS`.

**Archivos a pegar:** `api.gs` · `esquema.gs` · `index.html` (cohete) ·
`servicios.gs`.
⚠️ **Requiere `crearORepararEstructura()`** por la columna `CUMPLE`.

## 🔴 Lo que necesito de tu lado

- **Si Diego pegó la v5.86 y todavía no publicó**, hay código nuevo en el editor
  sin desplegar. **No crees versión ni actualices la implementación** sin
  confirmarle: publicarías lo suyo a medio probar. Es la regla de «quien publica
  avisa», al revés.
- **Nada de la rama del prototipo se pega**, aunque `que_pegar.js` la nombre.

## Lo que está diseñado y NO programado (para que no lo empieces en paralelo)

Todo con su PRD o mockup ya escrito en `develop`:

- **Plantillas de evolución** — `PRD_PLANTILLAS_EVOLUCION.md`. Diego lo está
  evaluando en el prototipo; el «cómo se seleccionan» es la tarea abierta.
- **PVE superada sin extubar** — `PRD_PVE_SUPERADA_SIN_EXTUBAR.md`. Agrega 2
  columnas a EVOLUCIONES.
- **GSA + laboratorio a la hoja diaria** — diseño cerrado en `CLAUDE.md`; espera
  un PDF de ejemplo del informe.

El plan completo, con qué falta para cada cosa, está en la sección
«🗺️ El plan de todo lo pendiente» de `CLAUDE.md`.
