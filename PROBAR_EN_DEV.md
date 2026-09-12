# Probar la v7.01 en la planilla OFICIAL sin que el equipo la vea

**Para**: Diego. **Fecha**: 12-sep-2026. **Sello**: `7.01-episodio-turno-y-relojes`.

Esta es la tanda completa: lo de episodio y turno que ya probaste en tu planilla
nueva, **más** la fecha y hora de ingreso escritas, los días de VM por horas y
las hojas impresas con la hora.

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
| `index_v701_cohete.html` | `index` |

Van los diez porque no sabemos con certeza qué versión está pegada hoy en la
oficial. Pegar de más no rompe nada; pegar de menos sí, y en silencio (pasó el
14-ago).

**Guardar** después de cada uno.

🪤 **Verifica dos cosas antes de seguir**:
- `Ctrl+F` en `servicios` → busca `Diagnóstico`. Si no aparece con acento, el
  portapapeles lo corrompió: vuelve a pegar ese archivo.
- `Ctrl+F` en `index` → busca `7.01-episodio-turno-y-relojes`.

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
