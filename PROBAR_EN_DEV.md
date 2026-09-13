# Probar la v7.01 en la planilla OFICIAL sin que el equipo la vea

**Para**: Diego. **Fecha**: 12-sep-2026. **Sello**: `7.02-con-resiembra-plantillas`.

Esta es la tanda completa: lo de episodio y turno que ya probaste en tu planilla
nueva, **más** la fecha y hora de ingreso escritas, los días de VM por horas,
las hojas impresas con la hora **y el último trabajo de Manuel** (la re-siembra
de las plantillas de la unidad).

🔴 **La regla de oro de esta prueba: NO toques la implementación.** Mientras no
crees una versión nueva, el equipo sigue entrando a `/exec` con la versión de
siempre y no se entera de nada. Tú pruebas en `/dev`.

---

## 1 · Pegar los archivos (10)

En el editor de Apps Script de la planilla **oficial**, reemplazando TODO el
contenido de cada archivo:

| Archivo del paquete | Archivo en el editor |
|---|---|
| `esquema.gs` | `esquema` |
| `repo.gs` | `repo` |
| `infra.gs` | `infra` |
| `dominio.gs` | `dominio` |
| `servicios.gs` | `servicios` |
| `api.gs` | `api` |
| `webapp.gs` | `webapp` |
| `mantenimiento.gs` | `mantenimiento` |
| `spike.gs` | `spike` |
| `index_v702_cohete.html` | `index` |

Van los diez porque no sabemos con certeza qué versión está pegada hoy en la
oficial. Pegar de más no rompe nada; pegar de menos sí, y en silencio (pasó el
14-ago).

**Guardar** después de cada uno.

🪤 **Verifica dos cosas antes de seguir**:
- `Ctrl+F` en `servicios` → busca `Diagnóstico`. Si no aparece con acento, el
  portapapeles lo corrompió: vuelve a pegar ese archivo.
- `Ctrl+F` en `index` → busca `7.02-con-resiembra-plantillas`.

---

## 2 · Crear las columnas y hojas nuevas

Selecciona el archivo `esquema`, elige **`crearORepararEstructura`** y ▶ Ejecutar.

- Es **aditivo**: agrega la hoja `EVALUACIONES` y columnas nuevas **al final**
  de las que ya existen. La versión que el equipo está usando sigue leyendo lo
  suyo exactamente igual, así que no se rompe nada mientras pruebas.
- 🪤 Confirma en el registro de ejecución que corrió ESA función. El selector a
  veces ejecuta la anterior.

---

## 3 · Abrir `/dev` (aquí está la gracia)

La dirección del equipo termina en **`/exec`**. La tuya para probar termina en
**`/dev`**: es la misma dirección con esas tres letras cambiadas.

- `/dev` sirve **lo último guardado**, sin necesidad de publicar.
- **Solo funciona para ti**, que eres el dueño del proyecto. Si otro la abre, no
  entra.
- Es un poco más lenta que `/exec`. Es normal.

Ábrela con **Ctrl+Shift+R**.

🔴 **La planilla es UNA SOLA.** Todo lo que guardes en `/dev` es dato real de la
unidad, igual que si lo hubieras escrito en la app de siempre. Si quieres
probar un ingreso inventado, no lo hagas aquí.

---

## 4 · Qué mirar (lo nuevo respecto de lo que ya probaste)

1. **Ingreso**: al abrir un ingreso, «Fecha ingreso» y «Hora ingreso» vienen
   sugeridas con el momento actual y se pueden corregir. De ahí salen los días.
2. **Días de VM**: ahora se cuentan por bloques de 24 horas desde la hora de
   ingreso (si llegó ventilado) o desde la hora de intubación. **Algunas camas
   van a mostrar un día menos que antes**, y eso es lo que fuimos a buscar.
3. **Hojas impresas**: la diaria, la lista del día y la de rehabilitación traen
   la fecha y la hora de ingreso. En la carilla neuromuscular, VISAGE y los
   scores de vía aérea ya no salen apilados.
4. **La tabla para cotejar**: en el editor, ejecuta **`tablaRelojes`** (está en
   `mantenimiento`). Imprime cama por cama las dos fechas y los dos conteos, sin
   nombres ni RUT. **Esa es la tabla que te pedí** para comparar con el otro
   programa.

---

## 4b · Cómo volver atrás si no te convence

**Esta es la parte tranquilizadora: no hay que copiar código de ninguna rama.**

- **Si solo probaste en `/dev`**: no hay nada que deshacer. El equipo nunca dejó
  de usar la versión de siempre. Cierras la pestaña y listo.
- **Si ya publicaste y quieres volver**: Implementar → Administrar
  implementaciones → ✏️ → en **Versión** eliges del desplegable una versión
  ANTERIOR → Implementar. Apps Script guarda todas las versiones que se han
  creado: volver son treinta segundos y la dirección del equipo no cambia.
- **Las hojas y columnas nuevas se quedan, y está bien.** Se agregaron al final
  y la versión anterior simplemente no las mira. No hay que borrar nada.
- 🪤 **Lo único que sí queda**: lo que se haya guardado con la versión nueva
  sigue guardado (es dato real). Y los **disparadores automáticos** —el respaldo
  diario, los gases de las 06:30— corren el código GUARDADO, no el publicado,
  así que desde que pegues usan el nuevo aunque no publiques. Es compatible,
  pero conviene saberlo.

---

## 5 · Si decides soltarlo para el equipo

Recién ahí: **Implementar → Administrar implementaciones → ✏️ sobre la
implementación de siempre → Versión: Nueva versión → Implementar**. La dirección
del equipo no cambia.

Y avisa, que es la otra mitad de la regla: el equipo se encuentra de golpe con
la vía aérea bloqueada sin evento, el motivo obligatorio y el SBC exigiendo FSS.
El buzón les muestra el resumen solo, pero conviene decirlo en persona.

## 6 · Si algo falla

- Pantalla «No se pudo verificar la conexión»: pega `diagnostico.gs` como
  archivo nuevo y ejecuta `diagnosticoArranque`.
- Para volver atrás: no publiques. `/exec` sigue sirviendo la versión anterior
  hasta que crees una versión nueva.
