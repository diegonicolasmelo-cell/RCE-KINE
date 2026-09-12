# Herramientas sueltas para pegar en el editor

Archivos **autocontenidos** que NO forman parte del proyecto: se pegan como
archivo nuevo en el editor de Apps Script cuando hacen falta, y se borran
después. No dependen de ningún otro archivo, así que funcionan aunque el
proyecto esté a medio pegar.

| Archivo | Para qué | Cómo |
|---|---|---|
| `diagnostico.gs` | La app dice «No se pudo verificar la conexión con el servidor» | ➕ → Secuencia de comandos → `diagnostico` → ejecutar `diagnosticoArranque` |
| `relojes.gs` | Ver por cama las dos fechas y los dos conteos (calendario / 24 h) | ➕ → Secuencia de comandos → `relojes` → ejecutar `tablaRelojes` |

🔴 **No se pegan junto a una versión del proyecto que ya traiga la misma
función.** `tablaRelojes` vive además en `mantenimiento.gs` desde la v6.26: si
ya pegaste esa versión, NO pegues `relojes.gs` (en Apps Script el espacio de
nombres es único y una colisión pisa en silencio).

Ninguna escribe nada. Ninguna imprime nombres ni RUT.
