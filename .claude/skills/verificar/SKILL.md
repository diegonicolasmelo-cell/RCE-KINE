---
name: verificar
description: Batería de verificación de RCE-KINE. Usar SIEMPRE antes de entregar archivos, después de editar v2/index.html o cualquier v2/*.gs, al investigar un bug reportado por el usuario, y antes de cada commit que toque código de la app. Corre las guardias estáticas (convenciones del proyecto, caracteres hostiles, sintaxis) y el arranque real de la app en Chromium con el puente google.script.run simulado.
---

# Verificación de RCE-KINE

Los chequeos viven en `build/checks/` y son la memoria ejecutable de los
bugs ya pagados: cada guardia existe porque su ausencia costó una sesión de
depuración. Si una guardia falla, no se «ajusta la guardia»: se arregla el
código (o, si la convención cambió de verdad, se documenta en CLAUDE.md).

## Batería

```bash
# 0. Dependencia de navegador (una vez por sesión)
npm install --prefix build --no-save playwright-core

# 1. Guardias estáticas (rápidas, sin navegador)
node build/checks/convenciones.js
#    · cero confirm() nativos (la convención es uiConfirm)
#    · cero '<' o '>' crudos fuera de <script>  ← rompían el bootstrap de Google
#    · cero caracteres invisibles (U+2028/2029/FEFF/200B…)
#    · sintaxis Node válida en todos los v2/*.gs

# 2. Arranque real en Chromium (fuente y/o entregable)
node build/checks/arranque.js                            # v2/index.html
node build/checks/arranque.js build/index_cohete.html    # cohete generado

# 3. Regresión de UI (VA replicada, fase «sin cambios», tablero VM)
node build/checks/regresion_ui.js
```

## Convenciones que las guardias protegen (el porqué)

- **`uiConfirm`, nunca `confirm()`**: el confirm nativo muestra la URL de
  googleusercontent y bloquea el iframe de Apps Script.
- **Cero `<`/`>` crudos en el markup**: el bootstrap de Google re-procesa el
  HTML con un parser más estricto que Chrome; un `<` sin escapar tumbó el
  arranque durante días (usar `&lt;`/`&gt;` — el DOM decodifica al mismo
  string, los datos guardados siguen calzando).
- **Cero caracteres invisibles**: U+2028 dentro de un literal JS es salto de
  línea para el parser → «Invalid regular expression».
- **EVOLUCIONES tiene 300 columnas**: `testEsquema` (en el editor de GAS)
  las asserta; si se agregan columnas, actualizar esquema + assert juntos.

## Al escribir chequeos nuevos

Un bug que costó más de un intercambio con el usuario merece guardia
permanente aquí. Patrón: script Node en `build/checks/`, salida con ✅/❌
por ítem, `process.exit(1)` si algo falla, y un comentario de cabecera que
explique QUÉ protege y POR QUÉ existe. Para pruebas con navegador, copiar
el patrón de `arranque.js` (Chromium de `/opt/pw-browsers/chromium`, puente
`google.script.run` simulado con `addInitScript`).
