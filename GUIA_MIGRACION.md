# Migración de RCE-KINE al correo de Kinesiología

**Para Diego · versión de la app: cohete 4.9-mascota**

Esto es una **instalación desde cero** en la cuenta de la unidad. Como los
pacientes actuales son inventados (marcha blanca), no hay nada que traspasar:
la planilla nueva parte limpia, que es justo lo que querías para el período
real. **Tu planilla actual no se toca** — queda intacta por si necesitas mirar
algo. Cuando la nueva esté andando, avisas la URL nueva al equipo.

Tiempo estimado: **30-40 minutos**. Hazlo sentado, sin apuro, con esta guía al
lado. Si algo no calza con lo que ves en pantalla, para y me preguntas.

---

## Antes de empezar

- [ ] Tener a mano el **correo y la clave de la cuenta de kinesiología**.
- [ ] Tener descargados los **12 archivos** del paquete que te envié.
- [ ] Saber qué **ventiladores reales** hay en la unidad (marca, modelo, número
      de serie o identificador interno). Los cargas al final.
- [ ] Si ya subiste protocolos o imprimibles a la carpeta de Drive de tu cuenta
      personal, tenerlos ubicados para copiarlos después.

---

## Paso 1 · Crear la planilla nueva

1. Cierra sesión de tu correo personal (o abre una **ventana de incógnito**,
   es más simple: así no se mezclan las cuentas).
2. Entra a Google con el **correo de kinesiología**.
3. Anda a **sheets.google.com** → botón **+ En blanco**.
4. Ponle nombre a la planilla arriba a la izquierda:
   **`RCE-KINE — UCI Adultos`**

> ⚠️ Esta planilla es la **base de datos** del sistema. No borres hojas ni
> edites celdas a mano una vez que esté funcionando.

---

## Paso 2 · Abrir el editor de código

1. En la planilla: menú **Extensiones → Apps Script**.
2. Se abre una pestaña nueva con un archivo llamado `Código.gs`.
3. Arriba a la izquierda, dale nombre al proyecto (donde dice *Proyecto sin
   título*): **`RCE-KINE`**.

---

## Paso 3 · Mostrar el archivo de manifiesto

1. En la barra lateral izquierda, ícono de **engranaje ⚙️ (Configuración del
   proyecto)**.
2. Marca la casilla **«Mostrar el archivo de manifiesto appsscript.json en el
   editor»**.
3. Vuelve al **ícono de código `<>` (Editor)**.

---

## Paso 4 · Pegar los 12 archivos

Ahora vas a crear un archivo por cada uno de los que te mandé.

**Cómo se crea cada archivo:** botón **+** al lado de «Archivos» → elige
**Secuencia de comandos** (para los `.gs`) o **HTML** (para los dos `.html`) →
escribe el nombre **sin la extensión** → se abre vacío → **selecciona todo lo
que haya dentro (Ctrl+A) y pega** el contenido del archivo mío (Ctrl+V) →
**Ctrl+S** para guardar.

### Los archivos, en orden

| # | Archivo mío | Nombre en el editor | Tipo |
|---|---|---|---|
| 1 | `esquema.gs` | `esquema` | Secuencia de comandos |
| 2 | `repo.gs` | `repo` | Secuencia de comandos |
| 3 | `infra.gs` | `infra` | Secuencia de comandos |
| 4 | `dominio.gs` | `dominio` | Secuencia de comandos |
| 5 | `servicios.gs` | `servicios` | Secuencia de comandos |
| 6 | `api.gs` | `api` | Secuencia de comandos |
| 7 | `webapp.gs` | `webapp` | Secuencia de comandos |
| 8 | `mantenimiento.gs` | `mantenimiento` | Secuencia de comandos |
| 9 | `spike.gs` | `spike` | Secuencia de comandos |
| 10 | `index.html` | `index` | HTML |
| 11 | `spike_gis.html` | `spike_gis` | HTML |
| 12 | `appsscript.json` | *(ya existe)* | — |

**Ojo con estos tres:**

- **`Código.gs`**: es el archivo vacío que venía por defecto. Cuando termines
  de pegar todo, **bórralo** (los tres puntos ⋮ al lado del nombre → Eliminar).
- **`index`**: es el más grande (casi 1 MB). Puede demorar unos segundos en
  pegarse y en guardarse. Es normal. **No lo edites a mano nunca.**
- **`appsscript.json`**: ese ya existe (lo mostraste en el Paso 3). No lo crees:
  ábrelo, selecciona todo y reemplaza por mi versión.

✅ **Comprobación:** al final debes tener **9 archivos .gs + 2 HTML +
appsscript.json**, y ningún `Código.gs`.

---

## Paso 5 · Crear la estructura de la planilla

1. En el selector de funciones (arriba, al centro, donde dice un nombre de
   función) elige **`crearORepararEstructura`**.
2. Botón **▶ Ejecutar**.
3. **Google te va a pedir autorización** (primera vez):
   - «Se requiere autorización» → **Revisar permisos**
   - Elige la cuenta de **kinesiología**
   - Aparece «Google no ha verificado esta aplicación» → **Configuración
     avanzada** → **Ir a RCE-KINE (no seguro)**
     *(Es tu propio código: ese aviso sale siempre con proyectos propios.)*
   - **Permitir**
4. Espera a que termine. Abajo debe decir **«Ejecución completada»**.
5. Anda a la planilla: deben haber aparecido **19 hojas** (CAMAS_ESTADO,
   EVOLUCIONES, CONFIG, etc.).

> Si sale error, cópiamelo tal cual y lo vemos.

---

## Paso 6 · Publicar la aplicación web

1. Arriba a la derecha: **Implementar → Nueva implementación**.
2. Ícono de engranaje ⚙️ junto a «Seleccionar tipo» → **Aplicación web**.
3. Completa:
   - **Descripción:** `RCE-KINE v4.9`
   - **Ejecutar como:** `Yo` *(la cuenta de kinesiología)*
   - **Quién tiene acceso:** `Cualquier usuario`
4. **Implementar** → autoriza si lo pide otra vez.
5. **Copia la URL** que termina en **`/exec`**. ⭐ **Esa es la dirección nueva
   del sistema**: la que le pasas al equipo y la que se guarda en el celular.

📌 Guárdala en un lugar seguro (pégala en un correo a ti mismo, por ejemplo).

---

## Paso 7 · Activar el respaldo automático

1. Vuelve al editor de código.
2. Selecciona la función **`instalarTriggerBackup`** → **▶ Ejecutar**.
3. Autoriza si lo pide.
4. En el registro de abajo debe decir «Activador diario instalado» y
   «Backup de prueba OK».

Desde ahí, **todas las noches a las 3 AM** se guarda una copia completa de la
planilla en una carpeta `RCE_KINE_backups` del Drive de kinesiología, y se
mantienen las últimas 30.

---

## Paso 8 · Cargar los ventiladores reales

1. Abre la app con la URL `/exec` nueva.
2. Pestaña **🔧 VENTILADORES** → agrega **solo los equipos que realmente están
   en la unidad** (los de la planilla vieja eran de prueba).
3. Deja fuera los dados de baja o prestados a otro servicio.

---

## Paso 9 · Los documentos de la unidad

1. En la app: pestaña **📋 REGISTRO** → botón **📂 Documentos** → **📁 Abrir
   carpeta en Drive**.
2. Se creó sola la carpeta **«RCE-KINE — Documentos de la unidad»** con
   subcarpetas **Imprimibles** y **Protocolos**.
3. Sube ahí los PDF (o cópialos desde tu carpeta personal si ya los tenías).
4. Vuelve a la app y toca **🔄 Actualizar**: deben aparecer listados.

---

## Paso 10 · Prueba final antes de avisar al equipo

Haz este recorrido completo con un paciente de mentira y **elimínalo después**:

- [ ] Ingresar un paciente en una cama.
- [ ] Evolucionar el turno Día y revisar que el texto se genere bien.
- [ ] Abrir el **historial** (botón Hist.) y ver la Hoja UCI.
- [ ] Anotar un evento con el **➕**.
- [ ] Ir a **📑 ENTREGA** y ver que aparezca.
- [ ] Ir a **📊 ESTADÍSTICAS** y que carguen los indicadores.
- [ ] **Egresar** al paciente de prueba y verificar que pase a 🗃️ ARCHIVADOS.
- [ ] Borrar el archivado de prueba (hoja ARCHIVO_PACIENTES de la planilla:
      elimina esa fila) para partir en cero de verdad.
- [ ] Abrir la URL en el **celular** y probar que se vea bien.

---

## Paso 11 · Avisar al equipo

Mensaje sugerido:

> **Equipo: cambió la dirección del registro kinésico.**
> La nueva es: `[pega aquí la URL /exec]`
> Guárdenla en favoritos y en el celular (Añadir a pantalla de inicio).
> La dirección anterior queda sin uso — no registren nada ahí.
> Al entrar, la mascota abajo a la derecha les muestra un recorrido de 2 minutos.

---

## Cosas que quedan igual (no te preocupes por ellas)

- Todo el código es idéntico al que ya probaste: mismos módulos, mismos textos.
- Las carpetas de Drive (respaldos, documentos, fotos de fallas) se crean solas
  bajo la cuenta de kinesiología.
- La planilla vieja y su URL siguen existiendo mientras no las borres.

## Si algo falla

Anota **en qué paso ibas** y **el mensaje de error completo** (cópialo), y me lo
mandas. Los errores más comunes:

| Síntoma | Causa casi siempre |
|---|---|
| «Acción desconocida» al usar la app | Falta pegar algún archivo `.gs` |
| La app carga en blanco | El `index` quedó a medio pegar: pégalo de nuevo completo |
| «Se requiere autorización» al usar la app | Falta ejecutar el Paso 5 con la cuenta nueva |
| No aparecen las 19 hojas | No se ejecutó `crearORepararEstructura` |
| El respaldo no corre | Falta el Paso 7 (`instalarTriggerBackup`) |
