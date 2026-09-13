# Instalar la v7.00 «episodio y turno» en una planilla NUEVA

**Para**: Diego. **Rama**: `separacion-episodio-turno` (paralela: NO toca
producción). **Fecha**: 11-sep-2026.

Esta versión se prueba en **una planilla propia con su propio proyecto de
Apps Script**, como pediste («iniciar otro Sheet con otro nombre… para no
afectar el trabajo de nadie más»). Nada de aquí se pega en la planilla de la
unidad. Cuando digas que sirve, se fusiona a `develop` y ahí sí se planifica
el pegado en producción con su `crearORepararEstructura()`.

---

## 0 · Qué trae el paquete

La carpeta `paquete_v7.00_episodio_y_turno/` (o el zip con ese nombre) trae
**12 archivos**. Van todos, porque el proyecto parte de cero:

| Archivo del paquete | Nombre en el editor de Apps Script | Tipo |
|---|---|---|
| `esquema.gs` | `esquema` | Script |
| `repo.gs` | `repo` | Script |
| `infra.gs` | `infra` | Script |
| `dominio.gs` | `dominio` | Script |
| `servicios.gs` | `servicios` | Script |
| `api.gs` | `api` | Script |
| `webapp.gs` | `webapp` | Script |
| `mantenimiento.gs` | `mantenimiento` | Script |
| `spike.gs` | `spike` | Script |
| `index.html` | `index` | HTML (formato cohete, ya empaquetado) |
| `spike_gis.html` | `spike_gis` | HTML |
| `appsscript.json` | manifiesto | Configuración → «Mostrar appsscript.json» |

🔴 **No va `mantenimiento_manuel`**: ese archivo se borró del editor a
propósito y no se vuelve a pegar en ningún proyecto.

---

## 1 · Crear la planilla y el proyecto (5 minutos)

1. En Google Drive: **Nuevo → Hojas de cálculo de Google**. Ponle un nombre
   que se distinga de la de producción, por ejemplo
   `RCE-KINE PRUEBA episodio y turno`.
2. 🔒 **Compartir → Acceso general → Restringido.** Aunque sea de prueba: en
   cuanto alguien escriba un RUT, ahí hay datos de personas.
3. Dentro de la planilla: **Extensiones → Apps Script**. Se abre un proyecto
   nuevo, vacío, con un `Código.gs`.
4. Renombra el proyecto (arriba a la izquierda) igual que la planilla.

---

## 2 · Pegar los 12 archivos

Por cada archivo del paquete:

1. En el editor, **➕ → Secuencia de comandos** (para los `.gs`) o **➕ → HTML**
   (para `index` y `spike_gis`). El nombre va **sin extensión**.
2. Abre el archivo del paquete en un editor de texto, **selecciona todo, copia,
   pega** en el editor de Apps Script reemplazando TODO lo que tenga.
3. El `Código.gs` que trae el proyecto se borra (o se usa para `esquema`).

Para el manifiesto: **⚙️ Configuración del proyecto → ☑ Mostrar el archivo de
manifiesto «appsscript.json»**, y ahí se pega el contenido de `appsscript.json`.

🪤 **Verifica los acentos después de pegar `servicios`** (el archivo grande):
`Ctrl+F` → busca `Diagnóstico`. Si no aparece con acento, el portapapeles lo
corrompió y hay que pegarlo de nuevo (ya pasó en agosto y no se ve a ojo).

Verifica el sello del `index`: `Ctrl+F` → `7.00-episodio-y-turno`.

**Guardar** (💾 o Ctrl+S) después de cada archivo.

---

## 3 · Crear la estructura (una sola vez)

En el editor, selecciona el archivo `esquema`, en el selector de funciones
elige **`crearORepararEstructura`** y ▶ **Ejecutar**.

- La primera vez Google pide **autorizar** el proyecto: «Revisar permisos» →
  tu cuenta → «Avanzado» → «Ir a … (no seguro)» → «Permitir». Es normal: el
  proyecto es tuyo y la pantalla sale porque no está verificado por Google.
- 🪤 **Confirma en el registro de ejecución que corrió ESA función** (el
  selector a veces ejecuta la anterior).
- Crea las **26 hojas** con sus encabezados, siembra CONFIG, KINESIOLOGOS
  (las 15 firmas), FASES, PLANTILLAS_EVOLUCION y las camas vacías. EVOLUCIONES
  queda con 396 columnas (igual que producción) y aparece la hoja nueva
  **EVALUACIONES**.

Después, para comprobar: función **`testEsquema`** → ▶ Ejecutar → el registro
debe terminar sin error.

---

## 4 · Configurar (hoja CONFIG de la planilla, o desde el editor)

| Qué | Cómo | Por qué |
|---|---|---|
| **Abrir la app sin login** | función `activarModoPrueba` → ▶ Ejecutar (deja `AUTH_DEV_MODE=TRUE`) | Igual que la marcha blanca: cada uno firma con su sigla |
| Número de camas | CONFIG → `NUM_CAMAS` (viene 18) | Solo si la prueba quiere menos camas |
| Botón de imágenes | CONFIG → `SYNAPSE_URL` = la dirección base del visor | Vacío = sin botón |
| Botón del laboratorio | CONFIG → `LIS_URL` = la dirección interna | 🔴 Se escribe SOLO en la planilla, nunca en el repo |
| Claves de coordinación | función `coordSembrarClaves` → ▶ Ejecutar y anotar las temporales | Solo si vas a probar el panel 🔐 |
| Respaldo diario | función `instalarTriggerBackup` → ▶ Ejecutar | Opcional en la planilla de prueba |
| Gases del laboratorio | función `instalarTriggerGSA` → ▶ Ejecutar | Opcional; crea la carpeta de Drive |

---

## 5 · Publicar (aquí SÍ se crea una implementación nueva)

Esta es la única vez en que la regla «no crear implementaciones» no aplica:
**es un proyecto nuevo y no tiene ninguna**.

1. **Implementar → Nueva implementación**.
2. ⚙️ Tipo: **Aplicación web**.
3. Descripción: `v7.00 episodio y turno`.
4. Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**.
5. **Implementar** → copia la **URL de la aplicación web** (termina en `/exec`).
   Esa es la dirección de prueba. Guárdala: las versiones siguientes se
   publican **editando esa misma implementación** (✏️ → Nueva versión), como
   en producción.

Abre la URL con **Ctrl+Shift+R**. Debe aparecer la pantalla de carga con Don
Mauri y después el tablero con las camas vacías.

---

## 6 · Qué probar (lo que cambió, en orden)

Usa **pacientes inventados**. Nombres y RUT de mentira: la planilla es de
prueba, y un RUT real ahí no aporta nada.

1. **Ingresa un paciente** en una cama con TOT + VM. En la tarjeta aparecen
   los chips `📋 ECF pend.` · `Barthel pend.` · `Charlson pend.`.
2. **Toca `ECF pend.`** en la tarjeta: se abre la calculadora sin abrir la
   evolución. Elige un valor → el chip cambia a `ECF 5`. Tócalo de nuevo y
   corrige: se pisa (no hay historial, «es la que es»). En la línea de tiempo
   queda `📐 ECF 4 (corrige 5) (tu sigla)`.
3. **Toca `MRC pend.`** (paciente cooperador): se abre el medidor de MRC y el
   botón **«💾 Guardar en el episodio»**. Al guardar, el badge dice
   `MRC 36 · 11-09 · SIGLA` — **la firma al lado de la fecha**. Mira la hoja
   EVALUACIONES: ahí está la fila con fecha, firma y origen `tarjeta`.
4. **Abre la evolución** de esa cama. Arriba hay un **banner** con nombre,
   edad, día de estadía, vía aérea y los chips de escalas. Y sobre el bloque
   de vía aérea, la fila **«¿Qué pasó hoy con la vía aérea?»** con los botones
   Nada · Intubación · Extubación · Reintubación · TQT · Decanulación.
5. **El select de vía aérea está bloqueado** mientras no declares un evento.
   Toca **Extubación**: la vía aérea pasa a Natural, y un aviso te manda a
   completar la PVE. Toca **Nada**: vuelve a TOT.
6. **Intenta el caso de la cama 13**: toca Extubación (queda Natural), responde
   la PVE con «No corresponde» —o sea, sin declarar la extubación— y guarda. El aviso ⚠️ ya no
   tiene «Guardar igual»: **pide un motivo escrito**. Sin motivo no guarda; con
   motivo guarda y queda un hito `⚠️ Vía aérea TOT → Natural sin evento
   declarado: «…»`. Y **el servidor también lo rechaza** si le llega sin motivo.
7. **SBC**: marca KTM realizada con nivel 3 (SBC) y sin FSS-ICU en el episodio
   → no guarda; te lleva a la fila del FSS. Mide el FSS (o tenlo de un turno
   anterior) → guarda.
8. **Cultivo**: marca una toma de cultivo con hora y tipo → en EVALUACIONES
   aparece `CULTIVO · pendiente` con quién la tomó. Al turno siguiente escribe
   el resultado → la MISMA fila pasa a decir el resultado con la firma de quien
   lo anotó. En la línea de tiempo el hito «Cultivo de secreciones» lleva el
   detalle.
9. **Entrega de turno**: la línea del MRC dice `MRC-SS 36 (11-09, SIGLA)`.
10. **Auditoría**: función `auditoriaIntegridad` → ▶ Ejecutar → el registro
    trae la línea **«F · Vía aérea cambiada SIN evento declarado»** con la
    cama del punto 6.

---

## 7 · Lo que NO cambió a propósito (y una corrección)

- El **texto** de la evolución sigue cronológico, como tu ejemplo.
- Las **396 columnas** de EVOLUCIONES, el REM y las estadísticas leen lo mismo
  de siempre. La serie es una fuente MÁS, no un reemplazo.
- 🔴 **Corrección a algo que te dije el 11-sep**: afirmé que la fila heredada
  «ya afirma MRC 33, evaluado hoy, firmado por mí». Al programarlo medí que
  **las evaluaciones no se heredan** al turno siguiente (el formulario solo
  las recarga si son de hoy). Lo que sí faltaba era **la firma y la serie**:
  eso es lo que trae esta versión. El diagnóstico era correcto; el ejemplo que
  usé para ilustrarlo, no.
- **PWA + login real**: no entra en esta tanda. Sigue esperando a informática
  (¿dominio externo? ¿correo institucional?) y tus cuatro decisiones del PRD.
- **Laboratorio en CSV/TXT**: pendiente, como pediste.

---

## 8 · Si algo falla

- «La app no pudo iniciar … [index 7.00-episodio-y-turno]» → pegado incompleto
  o sin **Nueva versión**. Revisa el sello con `Ctrl+F` y vuelve a publicar.
- Error al guardar que nombre una columna → faltó `crearORepararEstructura()`
  o no corrió esa función (mira el registro).
- Cualquier otra cosa: copia el mensaje textual (F12 → Consola) y mándamelo.
