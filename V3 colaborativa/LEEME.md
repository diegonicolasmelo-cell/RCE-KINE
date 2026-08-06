# V3 colaborativa

**Esta carpeta es el espejo exacto del proyecto de Apps Script en producción.**
Lo que está aquí es lo que hay que pegar en el editor, archivo por archivo, sin
armar ni fusionar nada.

Generada el 4-ago-2026 · index **v5.43-cierres**

---

## Para qué sirve

El repositorio guarda el código **fuente** en `v2/`, repartido en 34 archivos
por tema (`svc_camas.gs`, `svc_evoluciones.gs`, `dominio_texto.gs`…). Eso es
cómodo para programar, pero **el proyecto de Apps Script no usa ese reparto**:
usa 9 archivos, porque los 15 servicios viajan fusionados en uno solo.

Pegar los archivos sueltos de `v2/` en el editor **rompe el proyecto** (ya pasó:
funciones duplicadas). Esta carpeta evita ese error: cada archivo de aquí
corresponde 1 a 1 con un archivo del editor.

---

## Qué pegar y dónde

| Archivo de esta carpeta | Archivo en el editor de Apps Script |
|---|---|
| `esquema.gs` | `esquema` |
| `repo.gs` | `repo` |
| `infra.gs` | `infra` |
| `dominio.gs` | `dominio` |
| `servicios.gs` | `servicios` |
| `api.gs` | `api` |
| `webapp.gs` | `webapp` |
| `mantenimiento.gs` | `mantenimiento` |
| `spike.gs` | `spike` |
| `index.html` | `index` |
| `spike_gis.html` | `spike_gis` |
| `appsscript.json` | manifiesto (Configuración → «Mostrar appsscript.json») |

`mantenimiento_manuel.gs` va **aparte**, como archivo propio llamado
`mantenimiento_manuel`. Es temporal: contiene las correcciones de fechas de la
marcha blanca y se borra cuando esas tandas terminen.

En todos los casos se **reemplaza TODO el contenido** del archivo, no se pega
al final.

---

## Después de pegar (esto no es opcional)

1. Guardar.
2. Verificar el sello: `Ctrl+F` en `index` → buscar `5.43-cierres`.
3. **Implementar → Administrar implementaciones → ✏️ → Nueva versión.**

Sin ese último paso, `/exec` (la dirección que usa el equipo) **sigue sirviendo
la versión anterior**. La regla que evita caídas: no tocar «Nueva versión»
hasta que `/dev` cargue bien.

---

## Sobre `index.html`

No es HTML legible: es el **cohete**, un cargador que lleva la aplicación
empaquetada en base64. Se ve así a propósito.

Google reprocesa el HTML que se le sirve con un lector más estricto que el
navegador, y con el archivo crudo el arranque se caía con un error engañoso
(`Invalid regular expression`) que además apuntaba a una línea que no era la
nuestra. Costó días encontrarlo. El empaquetado lo resuelve de raíz: Google
nunca ve el HTML real. Cuesta unos 50 ms una sola vez por carga.

**No editar este archivo a mano.** Se genera desde `v2/index.html` con
`node build/empaquetar_cohete.js`.

---

## Dónde se trabaja

- **Para modificar código:** en `v2/` (los archivos fuente). Esa es la verdad
  del proyecto.
- **Esta carpeta se REGENERA**, no se edita: `node build/paquete_migracion.js`
  y se copia el resultado acá.

Editar directamente aquí es trabajo que se pierde en la próxima regeneración.

---

## Antes de entregar cualquier cambio

```bash
node build/checks/convenciones.js    # revisiones estáticas
node build/checks/arranque.js        # arranque real en un navegador
```

Hay 48 guardias en `build/checks/`. Cada una nació de un error que costó caro:
correrlas antes de entregar evita repetirlo. Necesitan `playwright-core`
instalado (`npm install --prefix build --no-save playwright-core`).

---

## Estructura de base de datos

Esta versión **no** exige `crearORepararEstructura()`. Cuando una entrega lo
pida, se avisa explícitamente: significa que hay columnas u hojas nuevas y que
sin ese paso la app guarda en el lugar equivocado.
