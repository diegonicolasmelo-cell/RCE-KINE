# RCE-KINE — Registro Clínico Electrónico de Kinesiología UCI

Registro clínico kinésico para UCI de adultos. **Google Apps Script + Google Sheets.**

## Estado
Reconstrucción **v2** en curso (código limpio, esquema unificado, identidad real, sin RUT).
El sistema **v1** (en producción) queda archivado como referencia en `legacy/`.

## Estructura del repositorio

| Ruta | Qué es |
|------|--------|
| `v2/` | **Código v2** (en construcción). Apps Script `.gs` + HTML. Fuente única de verdad del esquema. |
| `legacy/` | Sistema **v1** archivado (solo referencia; no se desarrolla más aquí). |
| `ESQUEMA.md` | Definición del modelo de datos v2 (hojas y columnas). |
| `PLAN_PROYECTO.md` | Plan maestro de la reconstrucción y decisiones (D1–D9). |
| `FASE_1.md` | Hoja de ruta de la Fase 1 (fundaciones). |
| `GIS_SPIKE.md` | Guía para validar Google Sign-In (paso a paso). |
| `PLAN_MODALES.md` | Diseño de los modales del frontend. |
| `CONTRASTE.md` | Contraste formulario↔hoja del sistema v1. |
| `INFORME_TECNICO.md` | Auditoría técnica del sistema v1. |
| `SOBRE_LA_APP.md` | Descripción funcional de la app. |

## Cómo se prueba v2 (resumen)
1. Cargar los `.gs` de `v2/` en el proyecto de Apps Script + `spike_gis.html`.
2. Ejecutar `testEsquema()` → debe imprimir `✅ Esquema OK`.
3. Ejecutar `crearORepararEstructura()` → crea las hojas.
4. Seguir `GIS_SPIKE.md` para el login con Google.
