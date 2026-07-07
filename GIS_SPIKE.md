# Spike Google Sign-In (GIS) — paso a paso

> Objetivo: validar el **único riesgo técnico real** del proyecto — que el login de Google
> funciona **dentro del iframe** de la Web App de Apps Script y entrega un ID token que el backend
> verifica. Se hace ahora (F1), no al final. Requiere PC + ~20–30 min tranquilos.
>
> Archivos: `v2/infra_auth.gs`, `v2/infra_util.gs`, `v2/spike_gis.gs`, `v2/spike_gis.html`.

## Paso 1 — Proyecto de Google Cloud
1. Editor de Apps Script → ⚙️ **Configuración del proyecto** → anota/crea el **proyecto de GCP**
   asociado (puedes usar el que trae por defecto o vincular uno propio).
2. Abre ese proyecto en https://console.cloud.google.com

## Paso 2 — Pantalla de consentimiento OAuth
1. **APIs y servicios → Pantalla de consentimiento OAuth**.
2. Tipo **Externo** → crear.
3. Completa: nombre de la app, correo de soporte, correo del desarrollador.
4. En **Usuarios de prueba**, agrega los correos de los kinesiólogos que probarán (mientras esté
   en modo "prueba"). Para producción, luego se "publica".

## Paso 3 — Credencial OAuth (Client ID Web)
1. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente de OAuth**.
2. Tipo de aplicación: **Aplicación web**.
3. **Orígenes autorizados de JavaScript** — aquí está el punto delicado del iframe. Agrega:
   - `https://script.google.com`
   - `https://<TU-HASH>-script.googleusercontent.com` ← el origen real del iframe. Si no lo sabes
     aún, sigue al Paso 5, abre la consola del navegador (F12), mira el origen que reclama GIS en el
     error, y vuelve a agregarlo aquí. **Es normal tener que hacer esto una vez.**
4. Crea → **copia el Client ID** (`...apps.googleusercontent.com`).

## Paso 4 — Pegar el Client ID en CONFIG
En la hoja **CONFIG**, fila `OAUTH_CLIENT_ID`, pega el valor copiado.

## Paso 5 — Desplegar y probar
1. Apps Script → **Implementar → Nueva implementación → Aplicación web**.
   - Ejecutar como: **Yo (dueño)**. Quién tiene acceso: **Cualquier usuario**.
2. Abre la URL `/exec`.
3. Aparece el botón **"Iniciar sesión con Google"** → inícialo con un correo de prueba.
4. Resultado esperado: **✅ "GIS funciona en el iframe. Identidad verificada en backend."** y el
   JSON con tu email/firma.

## Interpretación del resultado
| Qué ves | Qué significa | Acción |
|---------|---------------|--------|
| ✅ verde + tu email/firma | GIS funciona en el iframe. **Riesgo cerrado.** | Seguimos con auth real |
| Botón no renderiza / error de origen en consola | Falta el origen `googleusercontent` autorizado | Agrégalo (Paso 3.3) y reintenta |
| Token llega pero backend lo rechaza | `OAUTH_CLIENT_ID` de CONFIG ≠ `aud` del token | Corrige CONFIG (Paso 4) |
| Nada funciona pese a orígenes correctos | Bloqueo FedCM/cookies de terceros en el iframe | **Plan B: popup** (abajo) |

## Plan B — si el iframe bloquea GIS (fallback)
En vez de renderizar el botón dentro del iframe, se abre una **ventana emergente** (top-level) a una
página de login que completa el flujo y devuelve el token al padre por `postMessage`. Sale del
sandbox del iframe y evita el problema de cookies de terceros. Si llegamos aquí, adapto
`spike_gis.html` al modo popup (cambio acotado).

## Cuando termines
Dime el resultado (✅, o qué error saliste) y con eso:
- Si ✅: conectamos `autorizar()` al dispatcher y toda escritura queda protegida por identidad real.
- Si plan B: ajusto el frontend a popup antes de seguir.

> Recordá: `spike_gis.gs` trae un `doGet` **temporal**. Cuando construyamos el frontend real, ese
> `doGet` se reemplaza por el que sirve la app.
