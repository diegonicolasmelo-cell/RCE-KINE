# rediseño/ — prototipo del formulario por bloques (rama paralela)

> Carpeta **independiente** de la app en producción (`v2/`). Se pega en un
> **proyecto de Apps Script aparte** y escribe en hojas propias
> (`REDISENO_TURNOS`, `REDISENO_LOG`) — **no toca** EVOLUCIONES ni
> CAMAS_ESTADO. Aquí se prueban ideas de captura sin riesgo; lo que funcione
> se migra a `v2/` como ronda normal, con sus guardias.
>
> ⚠️ **ENCARECIDAMENTE PARALELO, JAMÁS LO PRINCIPAL** (Diego, ago-2026).
> La rama `rediseno-formulario-bloques` no se fusiona a `main`.

## Qué es

El formulario de evolución rediseñado como **7 bloques clínicos** con guardado
independiente (hora + firma por bloque), réplica visible campo a campo
(«Antes: 30 → 35») y validación por rango fisiológico al escribir:

1. 🫁 Vía aérea — estado, cuff (1×turno, no se hereda) y eventos con la regla
   previo→posterior (v4.3); PVE sí/no obligatoria con TOT (v5.44)
2. 🌬️ Ventilación — matriz VMAPS **real**, parámetros por modo con las reglas
   vigentes (CPAP presión única, Venturi solo FiO₂, CNAF flujo), P-VM que
   parte vacía, prono/supino solo con VM (estado ≠ evento)
3. 🧠 Sedación y conciencia — escalones reales, BNM aparte, GCS con «T»,
   cooperación automática con la regla de producción
4. ❤️ Hemodinamia — DVA real, **meta PAM**, tendencia, PIC/PPC
5. 🩺 Respiratorio y KTR — «sin secreciones» evaluado se narra, cultivo con
   técnicas reales, anti-oxímoron de auscultación
6. 🏃 Rehabilitación — KTM con Tabla 1 y Tabla 3 **reales**, IMS 0-10,
   **KTM no aplica de noche**, eval. funcional con cortes reales (DAUCI <48)
7. 📋 Plan y firma — fases del catálogo, texto con los formatos de
   producción y **sin firma dentro del texto**

**La versión 0.1 (arquetipo de Claude Design) traía reglas inventadas; la 0.2
las reemplazó por las de producción.** El detalle campo a campo, lo corregido
y lo pendiente está en `OBSERVACIONES.md` — leerlo antes de tocar esta carpeta.

## Cómo probarlo

**Sin instalar nada:** abrir `index.html` en un navegador. Funciona en modo
demo (paciente de prueba, persistencia en localStorage).

**En Apps Script (paralelo real):**
1. Proyecto NUEVO (no el de producción) → pegar `codigo.gs`, `index.html` y
   el manifiesto `appsscript.json`.
2. Apuntar `SPREADSHEET_ID` en `codigo.gs` a una **planilla de prueba** (o
   dejarlo vacío para usar la planilla contenedora). Las hojas se crean solas.
3. Implementar como web app. La URL es independiente del `/exec` del equipo.

## Integración futura (cuando el diseño gane)

`codigo.gs` incluye `MAPA_ESQUEMA`: campo del prototipo → columna canónica de
EVOLUCIONES. Migrar = llevar el patrón ganador a `v2/index.html` como ronda
normal (guardias incluidas), no publicar este proyecto como app del equipo.
