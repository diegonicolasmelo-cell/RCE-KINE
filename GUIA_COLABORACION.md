# Guía de colaboración — incorporarse al desarrollo de RCE-KINE

Escrita para el equipo de kinesiología UCI del Hospital San Pablo de Coquimbo
que se suma al desarrollo (primer caso: **Klgo. Manuel Fuentes**, iniciativa de
indicadores y pipeline de análisis). Sirve tanto para la persona como para el
Claude con el que trabaje: al abrir este repositorio, cualquier Claude lee
automáticamente `CLAUDE.md` y hereda toda la memoria del proyecto.

## Los 3 lugares donde vive el proyecto (y cómo conectarse)

| Lugar | Qué contiene | Cómo se accede |
|-------|--------------|----------------|
| **Repositorio GitHub** (`diegonicolasmelo-cell/RCE-KINE`) | LA VERDAD: todo el código fuente, la memoria del proyecto, las guardias de verificación y las skills de entrega | Diego te invita como colaborador (GitHub → Settings → Collaborators). Tu Claude trabaja aquí. |
| **Google Sheets** (base de datos) | Las 19 hojas de datos + CONFIG | Diego comparte el archivo con tu cuenta Google (editor). |
| **Proyecto Apps Script** (la app publicada) | Los 9 archivos .gs pegados + index; los links `/dev` y `/exec` | Diego lo comparte desde el editor de Apps Script (editor). |

Con el repo tienes TODO el conocimiento; con el Sheets y el Apps Script puedes
probar y publicar. No hace falta MCP, RAG ni servidores intermedios: el
conector de Google Drive de Claude puede leer el Sheets directamente si tu
análisis lo necesita.

## Cómo leer el repositorio (mapa de 1 minuto)

- **`CLAUDE.md`** — la memoria: arquitectura, convenciones, historia de los
  errores caros, estado y pendientes. **Empieza por aquí siempre.**
- **`v2/`** — el código fuente real: 20+ archivos `.gs` separados (los
  `svc_*.gs` viajan fusionados a producción) y `v2/index.html` (~9.700 líneas,
  todo el frontend).
- **`build/`** — herramientas: `fusionar_servicios.js` (une los svc en un
  `servicios.gs`), `empaquetar_cohete.js` (el index NUNCA se pega crudo; viaja
  «en cohete»: cargador + base64) y `build/checks/` (9 guardias automáticas).
- **`.claude/skills/`** — `verificar` (batería de pruebas) y `entrega-gas`
  (formato obligatorio de toda entrega de archivos). Tu Claude las tendrá
  disponibles automáticamente.
- **`legacy/`** — el sistema v1 archivado; solo referencia.

## El ciclo de trabajo (el mismo para todos)

1. **Todo cambio nace en el repo**, nunca directamente en el editor de Apps
   Script. Lo que se pega en producción debe estar commiteado — si se pega
   código que no está en el repo, la próxima entrega lo pisa y se pierde.
2. Tu Claude edita los fuentes de `v2/` y **corre la skill `verificar`**
   (o las guardias de `build/checks/`) antes de cualquier entrega o commit.
3. Para publicar: skill `entrega-gas` → genera `servicios.gs` fusionado y el
   index en formato cohete con sello de versión nuevo → pegar en Apps Script →
   **Implementar → Nueva versión** (sin ese paso, `/exec` sigue sirviendo la
   versión anterior; `/dev` muestra lo pegado al instante, solo al dueño).
4. Si cambió `esquema.gs`: correr `crearORepararEstructura()` en el editor.
   Las columnas de EVOLUCIONES se agregan SIEMPRE al final de la lista
   (insertar al medio desalinea los datos existentes).

## Reglas que no se negocian (aprendidas a costo alto)

- **El index jamás se entrega como HTML crudo** — el bootstrap de Google lo
  rompe. Siempre cohete. La historia completa está en `CLAUDE.md` («la saga
  del boot»); no repetirla.
- **`uiConfirm`, nunca `confirm()` nativo**; nada de `<` o `>` crudos en
  markup fuera de `<script>`.
- **El RUT jamás sale** en REM, tablero ni exportaciones. Hoy la plataforma es
  un prototipo en marcha blanca; el día que corra con datos reales de
  pacientes, nada identificable (nombre, RUT) puede salir a servicios externos
  —incluido Claude— sin anonimización y visto bueno institucional (Ley
  19.628). El análisis externo se hace con la exportación anonimizada.
- Los eventos de vía aérea (intubación, extubación, TQT, decanulación) se
  registran manualmente por decisión clínica; las alertas solo detectan
  olvidos.
- Diego coordina el producto: funcionalidades nuevas se proponen con opciones
  o mockup ANTES de programarlas.

## Coordinación entre dos personas desarrollando

- **Avisarse antes de pegar en el Apps Script de producción**: hay un solo
  proyecto publicado; dos pegados cruzados se pisan.
- Trabajar en **ramas separadas** del repo y avisarse para integrar. En caso
  de duda, el que integra es Diego.
- El sello de versión (`meta rce-version`, visible con Ctrl+F en el index
  pegado) siempre dice qué versión está en producción — verificarlo antes de
  asumir nada.
- Un bug que costó más de un intercambio merece una guardia nueva en
  `build/checks/` para que no vuelva.

## Pendientes donde la sinergia con Manuel ya está acordada

(Detalle en `CLAUDE.md`, sección «Estado y pendientes».)

1. **INDICADORES_HISTORICO**: sembrar la tabla mensual 2025-2026 de Manuel
   (solo agregados) cuando la envíe — alimenta la tendencia del tablero
   centinela que ya está en Estadísticas.
2. **Exportación anonimizada paciente-día** para su pipeline de análisis:
   falta definir juntos las columnas exactas que su pipeline espera. Mockup
   antes de código.
3. Su tablero de indicadores ya está implementado en la pestaña Estadísticas
   (`svc_indicadores.gs` + guardia `checks/indicadores.js`) con las metas que
   él propuso; los refinamientos se conversan sobre eso.
