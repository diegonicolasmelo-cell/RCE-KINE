/**
 * paquete_maqueta.js — El proyecto listo para pegar en una planilla DEMO.
 *
 * Es el paquete de producción MÁS el sembrador de pacientes ficticios
 * (`demo_datos.gs`), que a propósito no viaja al proyecto de la unidad. Sirve
 * para montar una maqueta mostrable en 15 minutos sin tocar la base real.
 *
 * Uso: node build/paquete_maqueta.js [carpeta_salida]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const B = __dirname;
const V2 = path.join(B, '..', 'v2');
const salida = process.argv[2] || path.join(B, 'paquete_maqueta');

// El paquete de producción, tal cual (única fuente: no se duplica su lógica).
execFileSync('node', [path.join(B, 'paquete_migracion.js'), salida], { stdio: 'inherit' });

// …y encima el sembrador, que es lo único propio de la maqueta.
fs.copyFileSync(path.join(V2, 'demo_datos.gs'), path.join(salida, 'demo_datos.gs'));

const GUION = `# Maqueta de RCE-KINE — cómo montarla (15 minutos)

Datos ficticios de punta a punta. **No toca la planilla de la unidad**: todo pasa
en una planilla nueva. El sembrador tiene dos candados que lo impiden.

## 1. La planilla

1. Entra a <https://sheets.new> y llámala **RCE-KINE — MAQUETA (datos ficticios)**.
2. Menú **Extensiones → Apps Script**. Se abre el editor con un proyecto vacío
   pegado a esa planilla (que es lo que hace falta: el sistema lee la planilla
   que lo contiene).
3. Ponle nombre al proyecto: *RCE-KINE MAQUETA*.

## 2. Pegar los archivos

En el editor, el archivo se crea con el **+** de la izquierda → *Script* (o
*HTML* para \`index\`). Pega el contenido y **guarda con Ctrl+S** cada uno.

| Archivo del editor | Qué pegar |
|---|---|
| \`esquema\` | esquema.gs |
| \`repo\` | repo.gs |
| \`infra\` | infra.gs |
| \`dominio\` | dominio.gs |
| \`servicios\` | servicios.gs |
| \`api\` | api.gs |
| \`webapp\` | webapp.gs |
| \`mantenimiento\` | mantenimiento.gs |
| \`mantenimiento_manuel\` | mantenimiento_manuel.gs |
| \`spike\` | spike.gs |
| \`demo_datos\` | **demo_datos.gs** ← solo va en la maqueta |
| \`index\` (HTML) | index.html |
| \`spike_gis\` (HTML) | spike_gis.html |

El manifiesto \`appsscript.json\`: **⚙︎ Configuración del proyecto → marcar
«Mostrar el archivo de manifiesto appsscript.json en el editor»**, y pegarlo.

## 3. Llenarla de pacientes

En el selector de funciones del editor, elige y **Ejecutar**, en este orden:

1. \`crearORepararEstructura\` — crea las 23 hojas y las 18 camas. (La primera
   vez Google pide autorizar: *Revisar permisos → tu cuenta → Configuración
   avanzada → Ir a RCE-KINE MAQUETA → Permitir*.)
2. \`prepararPlanillaDemo\` — marca la planilla como maqueta. **Se niega si la
   planilla tiene registros**, que es lo que hace imposible confundirla con la
   de la unidad.
3. \`sembrarDemoRCE\` — siembra el mes pasado completo y el mes en curso hasta
   hoy: ~58 episodios, ~650 evoluciones, 18 camas ocupadas. Demora un par de
   minutos.
4. \`generarREM\` — abre el editor de la función y córrela como
   \`generarREM(2026, 7)\` para el mes cerrado. Mira la hoja **REM_28**: el
   formulario oficial lleno solo.

## 4. Publicar la app para mostrarla

**Implementar → Nueva implementación → Aplicación web**, ejecutar como *yo*,
acceso *cualquier persona*. La URL \`/exec\` es la que se muestra.

Para que entre sin pedir cuenta de Google, en la hoja **CONFIG** deja
\`AUTH_DEV_MODE\` en \`TRUE\` (\`prepararPlanillaDemo\` ya lo hace).

## 5. Encadenarla con REM Hospital (la parte del REM automático)

En la hoja **CONFIG** de la maqueta, agrega dos filas:

| CLAVE | VALOR |
|---|---|
| \`REM_HOSPITAL_URL\` | la dirección de REM Hospital |
| \`REM_HOSPITAL_TOKEN\` | el token de carga de la unidad |

Y corre \`enviarRegistrosREM(2026, 7)\`. Devuelve cuántos episodios, atenciones y
procedimientos entraron, y el **contraste**: las cifras que calculó el RCE junto
a las que derivó REM Hospital de los mismos registros. Tienen que ser iguales.

## Volver a empezar

\`limpiarDemoRCE\` vacía los pacientes; \`sembrarDemoRCE\` los repone. La semilla
es fija: sale el mismo mes, con las mismas cifras, todas las veces.

## Lo que se puede decir de estos datos

- Ningún dato viene de un paciente real. Los RUT son del rango **77.xxx.xxx**
  (personas jurídicas): no pueden ser de una persona.
- Los códigos de paciente llevan el prefijo \`DEMO-\`.
- El generador es determinista: la demostración se repite idéntica.
`;
fs.writeFileSync(path.join(salida, 'LEEME-maqueta.md'), GUION);

console.log('\n✅ Paquete de la MAQUETA en ' + salida);
console.log('   incluye demo_datos.gs y LEEME-maqueta.md (guion clic a clic)');
