# PRD — Publicar sin computador

**Estado:** Borrador, esperando cuatro decisiones de Diego
**Dueño:** Diego Melo Villagrán (coordinador de kinesiología UCI)
**Creado:** 14-08-2026
**Alcance:** que un cambio de código llegue a la unidad **sin pegar archivos a
mano y sin necesitar un computador**, conservando quién decide publicar.

**Qué queda FUERA:**

- **No** se publica solo. Nada llega a la unidad sin que una persona autorizada
  lo decida (ver NO1 — es el no-objetivo que sostiene todo lo demás).
- **No** se automatiza `crearORepararEstructura()`: cuando la entrega cambia el
  esquema, alguien la corre a mano desde el editor.
- **No** se cambia la URL del equipo. Se gestiona la implementación de siempre.
- **No** se toca el flujo de emergencia: pegar a mano en el editor sigue
  existiendo y funcionando, para el día que esto falle.

---

## 1 · Resumen

**Hoy:** el cambio queda listo en media hora, y después espera a que alguien
llegue a un computador, descargue dos archivos y los pegue completos en el
editor sin equivocarse.

**Después:** quien está autorizado abre una página en el teléfono, ve que las
74 guardias pasaron, y aprieta **Publicar**.

---

## 2 · La historia

### ANTES

Son las once de la noche. Manuel le escribe a Diego desde el turno: la fecha de
los filtros está avisando un día tarde y la ronda de la madrugada se va a
guiar por un dato equivocado.

Diego está en su casa, sin el computador. Me lo cuenta desde el celular, y en
media hora el arreglo está hecho, con las guardias corriendo y el commit
subido.

**Y ahí se detiene todo.** Para que ese arreglo llegue a la unidad hay que:
descargar dos archivos, abrir el editor de Apps Script **en un computador**,
pegar cada uno reemplazando todo el contenido, comprobar el sello con Ctrl+F y
gestionar la implementación. Desde el teléfono no se puede hacer ninguna de
esas cosas.

El arreglo espera al día siguiente. La ronda de la madrugada usa el dato malo.

Y cuando por fin llega el momento de pegarlo, el riesgo no es teórico —
**ya pasó dos veces**, y las dos están escritas en la bitácora:

- pegar archivos sueltos del repositorio dejó `_firmaCache` duplicado y **rompió
  el editor** (el `/exec` se salvó solo porque servía la versión anterior);
- y en el editor, elegir el archivo por su contenido en vez de por su nombre
  casi escribe `servicios.gs` **encima de `api.gs`** — se detectó comparando
  longitudes carácter a carácter, no porque algo avisara.

### DESPUÉS

Son las once de la noche. Manuel escribe. Diego me lo cuenta desde el celular
y en media hora el cambio está hecho.

Diego abre una página en el teléfono. Dice: **74 guardias verdes · el paquete
arma sus 9 archivos · listo para publicar**. Aprieta **Publicar**.

Dos minutos después el `/exec` de siempre —la misma dirección que tiene
guardada todo el equipo— sirve el código nuevo. En el repositorio queda escrito
qué se publicó y quién apretó, y llega el aviso a Slack.

Diego entra a la app desde el mismo teléfono y prueba que el filtro ahora avisa
la noche que corresponde.

---

## 3 · Objetivos y no-objetivos

| | |
|---|---|
| **O1** | Se puede publicar **desde el teléfono**, sin computador. |
| **O2** | **Se acaba el pegado a mano**: los archivos los arma y los sube la máquina. |
| **O3** | Antes de publicar corren **las 74 guardias**. Si alguna falla, no se publica. |
| **O4** | Publicar sigue siendo una **decisión de Manuel o de Diego** — un botón, no un automatismo. |
| **O5** | Queda **constancia** de quién publicó y qué, en el repositorio y en Slack. |
| **O6** | La **URL del equipo no cambia**: se apunta la implementación de siempre a la versión nueva. |

| | |
|---|---|
| **NO1** | **No se publica solo al subir código.** Que yo deje un cambio listo no lo pone en la unidad. Es el no-objetivo que sostiene la regla del 14-ago: publican Manuel o Diego. |
| **NO2** | **La credencial de Google no vive en el contenedor de Claude ni pasa por el chat.** Ver §5 y D1. |
| **NO3** | **No** se automatiza `crearORepararEstructura()`. |
| **NO4** | **No** se crea una implementación nueva, nunca. |
| **NO5** | **No** se elimina el camino manual. Si esto falla un domingo, se pega a mano como siempre. |

---

## 4 · Cómo funciona hoy → Cómo va a funcionar

### HOY

```
Diego pide un cambio (desde donde sea)
   └─ Claude programa, corre las guardias y sube el commit        ✔ sin PC
        │
        └─ …y aquí se corta ─────────────────────────────► necesita un PC
                 ├─ descargar los archivos del chat
                 ├─ abrir el editor de Apps Script
                 ├─ pegar cada uno reemplazando TODO
                 ├─ verificar el sello a mano (Ctrl+F)
                 └─ gestionar la implementación
```

### VA A FUNCIONAR

```
Diego pide un cambio (desde donde sea)
   └─ Claude programa, corre las guardias y sube el commit
        │
        └─ una página que se abre en el teléfono muestra:
             ✅ 74 guardias verdes
             ✅ el paquete arma sus 9 archivos
             📦 v5.58-escalas · «FSS-ICU y MRC con la descripción a la vista»
             ⚠️ esta entrega CAMBIA EL ESQUEMA — hay que correr
                crearORepararEstructura() en el editor
                  │
                  └─ [ Publicar ]  ← solo Manuel o Diego
                          │
                          ├─ corre las guardias otra vez, en limpio
                          ├─ arma los 9 archivos desde el repositorio
                          ├─ los sube al proyecto de Apps Script
                          ├─ apunta LA implementación de siempre a la
                          │  versión nueva  (la URL no cambia)
                          └─ deja el aviso: repositorio + Slack
```

---

## 5 · Los datos

### Qué se necesita, y dónde vive cada cosa

| Pieza | Qué es | Dónde vive |
|---|---|---|
| El código fuente | los 31 `.gs` + el index | el repositorio (ya está) |
| El paquete de producción | los 9 `.gs` + el index en cohete | se **construye** en cada publicación, no se guarda |
| **La credencial de Google** | el permiso de clasp para escribir en el proyecto | 🔴 **la decisión D1** |
| El identificador de la implementación | `AKfycbx…HuXaX9BavqVzg` | escrito en el flujo, fijo |
| El disparador | el botón que aprieta la persona | GitHub, desde el navegador del teléfono |

### 🔴 La credencial, dicho sin adornos

Para escribir en el proyecto de Apps Script hace falta un permiso de Google que
clasp guarda tras el login. **Ese permiso no es solo del proyecto**: alcanza al
Drive de la cuenta, y ahí está la planilla de producción con nombres y RUT.

Eso significa que quien controle el lugar donde se guarde ese permiso puede,
en la práctica, llegar a los datos de los pacientes. No es un detalle de
configuración: es la decisión más importante de este PRD.

Por eso:

- **no va en el contenedor de Claude** (se recicla, y yo no debo tenerlo);
- **no se pega en el chat** por ningún motivo;
- va donde el acceso esté controlado y se pueda revocar en un clic.

### Inventario de consumidores

*(Qué otras cosas del proyecto toca este cambio.)*

| Consumidor | Qué le pasa |
|---|---|
| `build/fusionar_servicios.js` | se usa tal cual, ya arma los 15 servicios en uno |
| `build/empaquetar_cohete.js` | se usa tal cual (el index NUNCA viaja crudo) |
| `build/paquete_migracion.js` | ya arma el layout de 9 — es la pieza central |
| `build/verificar.js` | corre antes de publicar; si algo está rojo, no se publica |
| El sello de versión | tiene que subir en cada publicación, como hasta ahora |
| La bitácora (`CLAUDE.md`) | sigue registrando qué se publicó y cuándo |
| El flujo manual (skill `entrega-gas`) | **se conserva intacto** como salida de emergencia |

---

## 6 · Pseudo-código — el acuerdo

```
CUANDO alguien aprieta Publicar

  ¿quién aprieta?
      · Manuel o Diego  → sigue
      · cualquier otro  → no se publica

  ¿las 74 guardias pasan, corridas en limpio?
      · no → se detiene, y dice CUÁL falló
  ¿el paquete arma sus 9 archivos sin funciones duplicadas?
      · no → se detiene

  ENTONCES
      sube los 9 archivos al proyecto de Apps Script
      apunta LA implementación de siempre a la versión nueva
      deja el aviso en el repositorio y en Slack:
          qué versión · quién publicó · qué trae

  Y SI la entrega cambia el esquema
      lo dice fuerte: «falta correr crearORepararEstructura() en el editor»
      porque eso no lo puede hacer la máquina
```

**Promesas:**

- **Nunca** crea una implementación nueva. La URL del equipo es intocable.
- **Nunca** publica con una guardia en rojo.
- **Siempre** deja constancia. Con dos personas publicando, el aviso es lo que
  evita el choque.
- Si algo se detiene a mitad de camino, el proyecto de Apps Script queda como
  estaba: se sube todo o no se sube nada.

---

## 7 · Lo que hay que decidir antes de programar

**D1 · Dónde vive la credencial.** Es la decisión de fondo.

- **(a) Secreto en el repositorio de GitHub** — *mi recomendación*. El
  repositorio es privado, el permiso se guarda cifrado, solo lo usa el flujo al
  publicar, y se revoca en un clic desde Google. Requiere que **solo Manuel y
  Diego** sean administradores del repositorio, porque quien lo sea puede
  publicar.
- **(b) Una cuenta de Google dedicada** solo para publicar, con acceso mínimo.
  Más limpio en el papel, pero hay que dársela de alta en el proyecto y en la
  planilla, y es una cuenta más que mantener.
- **(c) No guardarla en ninguna parte** y seguir publicando desde el PC. Es la
  opción honesta si esto te incomoda: se pierde el objetivo O1, pero no pasa
  nada malo.

**D2 · ¿Hay un paso de prueba antes?** Propongo que el botón publique directo a
la implementación del equipo, porque `/dev` desde el teléfono no aporta (solo
lo ve el dueño del proyecto). Pero si prefieres un botón «Probar» y otro
«Publicar», se puede — es un paso más y una espera más.

**D3 · Dónde llega el aviso.** ¿Repositorio y Slack, o solo repositorio? Y si
va a Slack, ¿a `#mejoras-rce`?

**D4 · Qué pasa cuando el permiso caduca.** Google los renueva solo mientras se
usen, pero si pasa mucho tiempo o alguien lo revoca, el botón va a fallar. Hay
que decidir quién lo repone — y que el mensaje de error lo diga en castellano,
no en jerga.

---

## 8 · Cómo se comprueba que quedó bien

- Con una guardia en rojo, el botón **no publica** y dice cuál.
- Con el paquete mal armado (funciones duplicadas), **no publica**.
- Al publicar, la URL del equipo **es la misma de antes** — se comprueba
  pidiéndole el sello de versión al `/exec` y viendo que responde el nuevo.
- El aviso queda escrito, con quién apretó.
- Una entrega que cambia el esquema **avisa** que falta correr la función.
- Y el control que importa: **desde un teléfono, de principio a fin**, sin
  tocar un computador.

---

*Este documento fija la estructura, no la implementación. Cuando las cuatro
decisiones estén tomadas, se programa contra él.*
