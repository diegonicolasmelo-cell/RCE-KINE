# Fase 1 — Fundaciones (RCE‑KINE v2)

> Primera fase de construcción. Objetivo: dejar la **base técnica** lista antes de tocar la lógica
> clínica. Todo el código v2 vive en `v2/`. Relacionado: `PLAN_PROYECTO.md`, `ESQUEMA.md`.

## Entregables y estado

| # | Entregable | Archivo | Estado |
|---|-----------|---------|--------|
| 1 | Esquema (fuente única de verdad) | `v2/esquema.gs` | ✅ **hecho** |
| 2 | Config del proyecto (clasp/GAS) | `v2/appsscript.json` | ✅ **hecho** |
| 3 | Infra: respuesta estándar | `v2/infra_respuesta.gs` | ⏳ siguiente |
| 4 | Infra: fechas/TZ | `v2/infra_fechas.gs` | ⏳ |
| 5 | Infra: lock (concurrencia) | `v2/infra_lock.gs` | ⏳ |
| 6 | Infra: auditoría | `v2/infra_log.gs` | ⏳ |
| 7 | Infra: verificación de identidad GIS | `v2/infra_auth.gs` | ⏳ |
| 8 | Repositorio genérico (CRUD por hoja) | `v2/repo.gs` | ⏳ |
| 9 | Spike GIS dentro del iframe | (prueba) | ⏳ **crítico** |

## 1. Esquema — `esquema.gs` (hecho)
- Define las 15 hojas y todas las columnas **una sola vez**.
- Genera `COL`, `TOTAL_COLS`, `SH`, `FILA_DATOS` desde esa definición (nada hardcodeado).
- `crearORepararEstructura()` crea/repara hojas, migra ancho, fuerza formato texto y siembra
  (CONFIG, CATALOGOS de fases, KINESIOLOGOS, camas vacías según `NUM_CAMAS`).
- `esquemaFilaAObjeto` / `esquemaObjetoAFila` para convertir fila↔objeto.
- `testEsquema()` valida integridad (sin duplicados; EVOLUCIONES = 195).

**Cómo probarlo (cuando lo subas a Apps Script):**
1. `testEsquema()` → debe imprimir `✅ Esquema OK (15 hojas)`.
2. `crearORepararEstructura()` → crea las hojas vacías con encabezados correctos.

## 2. `appsscript.json`
- `executeAs: USER_DEPLOYING` + `access: ANYONE_ANONYMOUS`: el spreadsheet lo escribe **solo el
  dueño**; los kinés no necesitan permiso de edición sobre la hoja. La identidad la resuelve GIS.
- Scopes: `spreadsheets.currentonly` (BD), `drive` (backup), `script.external_request` (verificar
  el token GIS contra Google).

## 3. Setup de `clasp` (una vez, en tu equipo)
```
npm i -g @google/clasp
clasp login
# En el editor de Apps Script del Spreadsheet: copiar el Script ID (Configuración del proyecto)
clasp clone <SCRIPT_ID> --rootDir v2
```
> Requiere además crear el **proyecto de Google Cloud + OAuth Client ID (Web)** y pegarlo en
> `CONFIG.OAUTH_CLIENT_ID` (necesario para el spike GIS, entregable 9).

## 4. Spike GIS (entregable crítico — se hace pronto, no al final)
**Qué probar:** que el botón de Google Sign‑In renderiza y devuelve un ID token **dentro del
iframe sandbox** de la Web App de Apps Script.
- ✅ Éxito: el token llega al backend y `infra_auth.gs` lo verifica (firma, `aud`, `exp`).
- ❌ Falla (FedCM/cookies de terceros bloqueadas): plan B = login en **popup** que pasa el token a
  la ventana padre. Decidir cuál queda ANTES de construir la capa de auth.

## Criterio de "Fase 1 lista"
- `testEsquema()` verde y `crearORepararEstructura()` genera la estructura correcta.
- Infra (respuesta/fechas/lock/log/auth) con pruebas mínimas.
- Repositorio genérico leyendo/escribiendo por esquema (sin índices hardcodeados).
- Spike GIS resuelto (directo o popup).

## Siguiente artefacto
La capa de **infraestructura** (`infra_respuesta.gs`, `infra_fechas.gs`, `infra_lock.gs`) + el
**repositorio genérico** (`repo.gs`). Son pequeños y sin lógica clínica; los preparo cuando digas.
