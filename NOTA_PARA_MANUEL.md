# 🤝 Nota para Manuel — actualizada el 6-sep-2026 (tanda fusionada)

**Mensaje de Diego (5-sep, textual):** *«dile a Manuel que no programe nada —
estoy haciendo esto en una rama paralela y, una vez que tengamos todo listo y
probado, podríamos juntar con sus cambios, si es que tiene».*

---

## 🔴 Lo importante (6-sep-2026, después de fusionar)

1. **La tanda de Diego (v5.86 → v6.06) YA ESTÁ en `develop` y en `main`.**
   Diego la probó en producción y pidió fusionarla. Rama nueva = sale de
   `develop`, como siempre.
2. **Tu `entrega-blanco-negro-linea-tiempo` (5.86-entrega-bn-negrita) no
   había llegado a main y la tanda la pisó en producción.** Se traspasó a
   mano en la **v6.06**: negrita en los eventos, «🔄 Cambio de soporte», el
   `@media print` blanco y negro y `construirEventos` del medidor. Lo único
   que NO se trajo es el chip de cama invertido (fondo negro): Diego lo
   reportó como «cuadro negro» el 4-sep y la v5.92 lo dejó blanco con borde.
   Si ves algo más tuyo que falte, dilo aquí.
3. **Tu `fix/la-vni-viaja-al-rem-hospital` sigue SIN fusionar, a propósito.**
   Los inicios de VNI en el 601171 ya están en main. Lo que queda (puente
   «REM Hospital», `demo_datos.gs`, `paquete_maqueta.js` y sus guardias) es
   una integración con una planilla externa que no está documentada ni
   aprobada por Diego: hay que contarle qué es y que él decida.

## Lo que hay ahora mismo en el repo

| Rama | Qué es | ¿Se toca? |
|---|---|---|
| `main` / `develop` | **Todo hasta la v6.06** (incluye tu 5.85 y tu 5.86-entrega-bn). | Rama nueva desde `develop` |
| `filtros-vence-hoy` | La tanda ya fusionada; queda como historia. | No |
| `fix/la-vni-viaja-al-rem-hospital` | Tu puente REM Hospital + maqueta. **Pendiente de decisión de Diego.** | Tú, después de hablar con él |
| `prototipo-plantillas-evolucion` | 🚫 Prototipo de plantillas. NO se pega ni se fusiona. | No |

## Qué trae la tanda v5.86 → v6.02 (118 guardias verdes)

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
- 📌 Anotaciones del turno (v5.97) · 🎂 pose de Don Mauri dibujada por Diego (v5.98)
- 🔴 **v5.99 — la evolución se guarda POR EPISODIO**: tu `_ubicarEvolucionDeTurno`
  cubría las lecturas y el ➕; el guardado seguía ubicando la fila por
  `CAMA_n_turno` y pisaba la del anterior en una rotación sin alta. Ahora
  `_ubicarFilaGuardado` abre fila aparte (`CAMA_n_turno~pid`). Los lectores por
  cama siguen sin filtrar por pid (tu decisión del 6-ago, respetada). Además:
  `conLock` en coordCorregirFicha y guardarAsignacionTurno; `auditoriaIntegridad()`.
- 🫁 PVE superada sin extubar (v6.00, 2 columnas al final de EVOLUCIONES ⇒ 396)
- 🧪 Gases del laboratorio importados desde PDF (v6.01, hoja GSA_IMPORTADAS,
  `svc_gsa.gs`, `turnoLogicoServidor` en infra_fechas)
- 📋 Plantillas de evolución en modo chips (v6.02, hoja PLANTILLAS_EVOLUCION,
  `svc_plantillas.gs`)

**Cambia esquema** (hojas NOTIFICACIONES, GSA_IMPORTADAS y PLANTILLAS_EVOLUCION
+ columnas ULT_PS/ULT_PIM/ULT_PIM_FECHA en CAMAS_ESTADO + CUMPLE en KINESIOLOGOS
+ ANOTACIONES_JSON, PVE_SUP_SIN_EXT, PVE_SUP_SIN_EXT_RAZ al final de EVOLUCIONES
+ claves CONFIG) ⇒ un solo `crearORepararEstructura()`, que corre Diego. Se
pegan 8 archivos del editor (`node build/que_pegar.js origin/main`).

## Si necesitas tocar algo urgente

Habla primero con Diego (o deja nota aquí). La regla de «quien publica avisa»
aplica doble mientras la tanda esté a medio pegar: **crear una versión nueva en
el editor ahora publicaría código a medio probar.**
