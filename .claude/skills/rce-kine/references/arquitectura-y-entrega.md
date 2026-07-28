# Arquitectura, verificación y entrega

Para quien vaya a **modificar la plataforma** (no solo leer su base).

## Estructura del repositorio

| Ruta | Qué es |
|---|---|
| `v2/*.gs` | código del servidor (Apps Script), archivos separados — **fuente de verdad** |
| `v2/index.html` | todo el frontend en un archivo (~9.700 líneas, sin minificar) |
| `build/fusionar_servicios.js` | une los 14 `svc_*.gs` en un solo `servicios.gs` entregable |
| `build/empaquetar_cohete.js` | empaqueta el index en formato «cohete» (obligatorio) |
| `build/checks/*.js` | 9 guardias automáticas |
| `.claude/skills/` | skills del proyecto: `verificar`, `entrega-gas`, `rce-kine` |
| `CLAUDE.md` | memoria del proyecto: convenciones, historia, pendientes |
| `legacy/` | sistema v1 archivado, solo referencia |

En Apps Script todos los archivos comparten un mismo espacio global, así que la
separación en archivos es organizativa: el proyecto de producción usa un layout
de **9 archivos .gs** (los `svc_*` viajan fusionados).

## Capas

- **`api.gs`** — dispatcher único `api(accion, datos, token)`. Toda lectura y
  escritura pasa por ahí; las escrituras se envuelven en `_auditar`, que deja
  registro en `AUDIT_LOG` con correo y firma. `GET_LOGIN_INFO` es la única
  acción pre-autenticación.
- **`esquema.gs`** — define las 19 hojas y `crearORepararEstructura()` las crea o
  repara. `testEsquema()` verifica el conteo de columnas (EVOLUCIONES: **302**).
- **`repo.gs`** — acceso a hojas (`repoLeerTodos`, `repoBuscarPorId`,
  `repoInsertar`, `repoActualizar`).
- **`svc_*.gs`** — un servicio por dominio: camas, evoluciones, timeline,
  procedimientos, entrega de turno, estadísticas, REM, indicadores, eventos,
  equipos, turnos, auditoría, backup.
- **`dominio_*.gs`** — cálculos clínicos y el motor de texto.

### Regla dura del esquema
Las columnas nuevas van **SIEMPRE al final** de la lista. La reparación reescribe
la fila de encabezados: insertar una columna al medio desalinea todos los datos
ya guardados. Después de tocar `esquema.gs`, la entrega **debe** avisar que hay
que ejecutar `crearORepararEstructura()`.

## La saga del boot (leer antes de tocar el arranque o la entrega)

Costó días de depuración. Lo aprendido:

1. El error `Uncaught SyntaxError: Invalid regular expression: missing /
   @userCodeAppPanel:1842` **pertenece al bootstrap de Google**, no a nuestro
   archivo. La misma línea 1842 con dos contenidos distintos lo demostró.
2. Google re-procesa el HTML servido con un parser más estricto que Chrome: un
   `<` o `>` **crudo** en el markup (por ejemplo `VM < 24 h` en un comentario, o
   `value="PAS > 180"`) lo tumba. Guardia: `build/checks/convenciones.js`.
3. La solución definitiva es el **cohete** (`build/empaquetar_cohete.js`):
   cargador ASCII puro + la app en base64, de modo que Google nunca ve el HTML
   real. Costo medido: ~50 ms una vez por carga. **El index nunca se entrega
   crudo.**
4. `createTemplateFromFile` también rompía el arranque: el `doGet` usa
   `createHtmlOutputFromFile` y así debe quedarse.
5. **`/exec` sirve la versión desplegada** (requiere «Nueva versión» después de
   cada pegado); `/dev` sirve lo recién guardado, pero solo para el dueño.
6. El sello de versión (`meta rce-version` + `[index X.Y]` en el watchdog) existe
   para saber siempre qué archivo produjo un error. Mantenerlo al día.
7. Cuidado al generar literales con caracteres invisibles: un U+2028 real en vez
   de su escape rompe con el mismo error. Escribirlos con escapes, nunca
   literales.

## Convenciones del frontend

- **`uiConfirm`, jamás `confirm()` nativo** (el nativo no funciona dentro del
  iframe de Apps Script).
- Nada de `<` o `>` crudos fuera de `<script>`.
- Piel estilo Notion con variables `--n-*`, conmutable con la piel institucional
  del hospital (botón 🎨).
- Los módulos heredados del turno anterior se marcan con la clase `.heredado`
  (ámbar) y un chip «✓ Sin cambios» que el kinesiólogo confirma.
- Estados clínicos: además del color, **símbolo** (✓ en meta, ⚠ atención,
  ✕ alerta) — el color por sí solo no distingue bien verde/ámbar/rojo para
  visión con daltonismo, y esto se verificó con un validador de contraste.

## Verificación — antes de entregar o commitear

Skill `verificar`, o directamente:

```bash
node build/checks/convenciones.js     # estáticas: confirm(), <>, invisibles, sintaxis .gs
node build/checks/arranque.js         # arranque real en Chromium con el puente simulado
node build/checks/regresion_ui.js     # regresiones de UI ganadas a punta de bugs
node build/checks/movil.js            # versión móvil
node build/checks/piel.js             # pieles y contraste
node build/checks/rem.js              # REM 28 celda a celda
node build/checks/indicadores.js      # definiciones de indicadores
node build/checks/eventos.js          # eventos rápidos y reloj de dispositivos (servicio)
node build/checks/eventos_ui.js       # eventos rápidos (interfaz)
```

`arranque.js` acepta la ruta del cohete como argumento, para verificar el
archivo que realmente se va a entregar. Playwright se instala con
`npm install --prefix build --no-save playwright-core`; el Chromium ya está en
`/opt/pw-browsers/chromium`.

**Un bug que costó más de un intercambio merece una guardia nueva.** Es la regla
que mantuvo el proyecto estable.

## Entrega (skill `entrega-gas`)

```bash
node build/fusionar_servicios.js                      # si cambió algún svc_*.gs
node build/empaquetar_cohete.js build/index_cohete.html   # si cambió el index (subir VERSION antes)
node build/checks/convenciones.js
node build/checks/arranque.js build/index_cohete.html
```

El mensaje que acompaña a la entrega debe decir siempre: **qué archivos pegar y
en qué archivo del editor**, **si hay que correr `crearORepararEstructura()`**
(explícitamente también cuando no hace falta), y el ritual de publicación:
guardar → verificar el sello con Ctrl+F → Implementar → Administrar
implementaciones → ✏️ → **Nueva versión** → probar en `/exec` con Ctrl+Shift+R.
Sin «Nueva versión», lo pegado no llega a `/exec`.

Cada versión se entrega con **nombre de archivo único** (`index_v32_ktmdia.html`,
no `index.html`): el usuario acumula descargas y ya pegó una vieja por error.
