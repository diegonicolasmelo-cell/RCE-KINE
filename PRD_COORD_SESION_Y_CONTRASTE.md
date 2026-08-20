# PRD — Coordinación: la sesión se cierra de verdad y el texto se lee

**Estado:** Borrador · **Dueño:** Manuel Fuentes Blanco · **Creado:** 2026-08-20
**Alcance:** el cierre de sesión del modo Coordinación (cliente **y** servidor) y el
contraste de los textos de la pestaña 🔐 COORDINACIÓN.
**NO toca:** el login, las claves, la recuperación por correo, el buscador, la ficha
editable, ni ninguna regla clínica. Tampoco toca las otras pestañas, salvo por el
color de los botones `.dpset`, que se declara y se mide (§5).

---

## 1 · Resumen

**Hoy:** el botón que cierra la sesión de coordinación existe, pero no se ve (4,27:1
de contraste, bajo el mínimo legible) y **no cierra nada en el servidor**: borra unas
variables del navegador y el token sigue vivo hasta 30 minutos.

**Después:** un botón rojo con candado, imposible de no ver, que **mata la sesión en
el servidor** y deja constancia en `AUDIT_LOG`. Y todo el texto de la pestaña por
encima del mínimo de legibilidad, medido.

---

## 2 · La historia

### ANTES

Magdalena entra al modo Coordinación desde la tablet del office para corregir la
ficha de un egresado. La llaman a la cama 12, deja la tablet sobre el mesón y no
vuelve en toda la tarde. La tablet queda abierta en la pestaña que **puede cambiar
fechas de ingreso de cualquier paciente de la unidad**, con su firma clínica lista
para estampar cada corrección.

Cuando se acuerda, ya en su casa, abre el RCE en el teléfono para cerrarla. Busca
cómo salir: entre `🔑 Mi clave` y `👥 Restablecer otra` hay una palabra gris pálido
que dice `Salir`, del mismo color que las otras dos y sin icono. La toca. El
teléfono le dice «Saliste del modo Coordinación» y ella se queda tranquila.

**No pasó nada.** Su sesión en el teléfono se limpió; la de la tablet del office
sigue exactamente igual de abierta. Y aunque hubiera tocado Salir *en la tablet*,
el token habría seguido vivo en el servidor.

Al día siguiente abre la pestaña de nuevo y el panel le muestra, en un gris que casi
no se distingue del fondo, un mensaje que no alcanza a leer bajo la luz del office.
Escribe tres letras a ciegas hasta que aparece algo.

### DESPUÉS

Magdalena entra desde la tablet. Arriba a la derecha, en rojo y con un candado, hay
un botón que dice **🔒 Cerrar sesión (MCC)** — con su firma adentro, para que se vea
de quién es la sesión que está abierta.

La llaman a la cama 12. Antes de soltar la tablet lo toca, porque es lo único rojo
de la pantalla. El servidor mata el token, `AUDIT_LOG` anota `COORD_SALIDA` con su
firma y la hora, y la tablet vuelve a la puerta pidiendo usuario y clave.

Y cuando entra, el mensaje del buscador se lee: negro sobre blanco, como el resto
de la ficha.

---

### 🔴 Lo que pasó de verdad hoy (20-ago-2026), y por qué esto no es cosmético

No hay que imaginarse el escenario: ya ocurrió, y está en `AUDIT_LOG`. En toda la
historia del modo Coordinación hay **exactamente dos** entradas, las dos de hoy:

```
2026-08-20 13:05:04   MCC   COORD_ENTRADA        entró al modo coordinación
2026-08-20 13:05:41   MCC   COORD_CAMBIO_CLAVE   cambió su clave
```

Magdalena **entró a la primera** —no hay ni un `COORD_INTENTO_FALLIDO`—, cambió su
clave temporal en 37 segundos… y **no corrigió nada**. No existe ningún
`COORD_CORRIGE_FICHA`. La ficha de la cama 10, que es para lo que se construyó todo
el modo, sigue con `DIAS_TOTAL = 1`.

O sea: el problema **no es el acceso, es lo que pasa después de entrar**. Y lo
primero que ve alguien que acaba de entrar es el panel vacío con una sola
instrucción — «Escribe al menos dos letras, o un RUT» — que es exactamente el texto
medido a **2,30:1**, la mitad del mínimo legible.

No está demostrado que sea la causa (podrían haberla llamado a una cama). Pero es
la hipótesis más barata de descartar, y arreglarla cuesta una línea de CSS.

## 3 · Objetivos / No-objetivos

| | |
|---|---|
| **O1** | Tocar el botón invalida la sesión **en el servidor**: el mismo token, reusado después, es rechazado. |
| **O2** | Cada cierre queda en `AUDIT_LOG` con acción `COORD_SALIDA`, la firma y la hora — igual que ya queda `COORD_ENTRADA`. |
| **O3** | El botón de cierre es el elemento más visible de la barra: color de peligro, icono de candado y la firma de quien tiene la sesión abierta. |
| **O4** | **Ningún** texto de la pestaña 🔐 COORDINACIÓN baja de 4,5:1 de contraste (3:1 para texto grande), medido en el navegador, no revisado a ojo. |
| **O5** | Una guardia nueva mide O4 y se pone roja si alguien vuelve a aclarar un texto. |
| **NO1** | **No** cierra las sesiones de OTROS dispositivos. Cierra la del dispositivo donde se toca. Cerrar todas exige un índice de sesiones vivas por usuario, que hoy no existe — queda para un PRD aparte si el caso se repite. |
| **NO2** | No cambia la duración de la sesión (30 min por inactividad) ni el login. |
| **NO3** | No rediseña la pestaña. Cambia colores de texto y el tratamiento de un botón; no mueve nada de sitio. |

---

## 4 · Cómo funciona hoy → cómo va a funcionar

```
HOY                                    DESPUÉS

[Salir]  ← gris 4,27:1, sin icono      [🔒 Cerrar sesión (MCC)] ← rojo, candado, firma
   │                                       │
   ▼                                       ▼
coordSalir()  (solo cliente)           coordSalir()
   ├ COORD_TK = null                      ├ pide al servidor COORD_SALIR {token}
   ├ limpia #coordRes / #coordFicha        │     │
   ├ coordInit()                           │     ├ borra coordses_<token> del cache
   └ toast('Saliste…')                     │     ├ auditar COORD_SALIDA (firma, hora)
                                           │     └ responde ok
   El token sigue VIVO en el               │
   servidor hasta 30 min de                ├ limpia el estado del navegador
   inactividad. Cualquiera que             ├ coordInit()  → vuelve a la puerta
   lo tenga sigue entrando.                └ toast('Sesión cerrada')

                                        Si el servidor no contesta: se limpia igual
                                        el navegador y se avisa que la sesión puede
                                        seguir viva hasta 30 min (no se miente).
```

El cierre reusa piezas que ya existen: `_coordAbrirSesion` ya escribe la clave
`coordses_<token>` en `CacheService.getScriptCache()`, y `auditar()` ya es el camino
de toda acción de coordinación (`COORD_ENTRADA`, `COORD_CORRIGE_FICHA`). No hace
falta infraestructura nueva: hace falta la operación simétrica de abrir.

---

## 5 · Los datos

**Disparador:** el usuario toca el botón de cierre en la barra del panel.

| Dónde vive | Qué | Qué controla |
|---|---|---|
| `CacheService` (script) | `coordses_<token>` → `{usuario, firma, desde}` | La sesión. **Borrarla es cerrar sesión.** Es la única fuente de verdad. |
| `AUDIT_LOG` | fila `COORD_SALIDA` con `firma`, `email:'coordinacion'`, hora | La traza. Cierra el par con `COORD_ENTRADA`, que ya se escribe. |
| Cliente | `COORD_TK`, `COORD_FIRMA`, `COORD_USUARIO`, `COORD_PID` | Comodidad, no protección. Se limpian **después** de la respuesta del servidor. |

**Colores a cambiar** (los tres medidos hoy en Chromium, no estimados):

| Selector | Hoy | Contraste hoy | Después |
|---|---|---|---|
| `.pivot-empty` (dentro de la pestaña) | `#94a3b8` | **2,30:1** ❌ | el color de texto normal (`var(--txt)`) |
| `.dpset` (barra, incluye los 3 botones) | `#64748b` | **4,27:1** ❌ | un gris que pase 4,5:1 sobre `#eef3f9` y sobre blanco |
| botón de cierre | `.dpset` genérico | 4,27:1 ❌ | tratamiento de peligro: fondo `var(--danger)`, texto blanco |

⚠️ **`.dpset` se usa en toda la app, no solo aquí.** Oscurecerlo mejora todas las
barras, pero es un cambio global: la guardia de la pestaña no lo cubre entero. Al
implementar hay que correr la batería completa y mirar las guardias de UI
(`movil_panel`, `regresion_ui`, `eventos_ui`) antes de darlo por bueno.

---

## 6 · Pseudo-código — el acuerdo

### Servidor

```
CUANDO llega COORD_SALIR con un token
  ¿viene token?                → si no, responder ok igual (cerrar algo que no
                                  existe no es un error; que el front no se cuelgue)
  resolver el token a sesión
  ¿la sesión existe?           → si no, responder ok (ya estaba cerrada)
  ENTONCES
    borrar coordses_<token> del cache
    anotar en AUDIT_LOG: COORD_SALIDA, con la firma de esa sesión y la hora
    responder ok
```

### Cliente

```
CUANDO el usuario toca el botón de cierre
  pedir COORD_SALIR con el token actual
  PASE LO QUE PASE con esa llamada:
    limpiar COORD_TK / COORD_FIRMA / COORD_USUARIO / COORD_PID
    vaciar el buscador y la ficha
    volver a la puerta
  ¿el servidor confirmó?  → sí: avisar «Sesión cerrada»
                          → no: avisar que se salió AQUÍ, y que la sesión puede
                                seguir viva hasta 30 minutos
```

### Guardia de contraste

```
CUANDO corre la guardia
  abrir el index en el navegador
  mostrar la pestaña de coordinación: puerta, panel y ficha montada
  PARA CADA elemento con texto propio visible
    calcular el contraste entre su color y su fondo efectivo
      (subiendo por los padres hasta el primer fondo opaco)
    exigir 4,5:1 — o 3:1 si es texto grande (>=24px, o >=18,66px en negrita)
  ROJA si alguno no llega
```

**Promesas**

- Tocar el botón **invalida el token en el servidor**, no solo en la pantalla.
- Un cierre siempre deja rastro en `AUDIT_LOG`; ninguno pasa silencioso.
- Si el servidor falla, el front **no miente**: dice que la sesión puede seguir viva.
- Ningún texto de la pestaña queda bajo el mínimo de legibilidad, y hay una guardia
  que lo mide en cada corrida.
- Cerrar sesión **no borra ni cambia ningún dato clínico**: solo mata la sesión.
