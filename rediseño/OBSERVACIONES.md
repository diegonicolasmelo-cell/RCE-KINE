# OBSERVACIONES — estado de la adaptación a las reglas reales

> El arquetipo original (Claude Design) traía catálogos y reglas **inventadas**,
> sin contexto del funcionamiento real. Diego pidió (ago-2026): *«migra y
> realiza todas las condicionantes ya establecidas — es una adaptación de lo
> que ya está a este tipo de formulario»*. Este archivo lleva la cuenta de esa
> migración: qué ya es fiel a producción y qué falta.

## Regla de la carpeta

**La FORMA se explora aquí; el FONDO viene SIEMPRE de producción** (`v2/`).
Ningún catálogo, condicionante ni semántica de columna se inventa ni se
"mejora" en esta carpeta sin decisión explícita de Diego. Ante la duda, el
comportamiento correcto es el de `v2/index.html`.

## Divergencias del arquetipo YA CORREGIDAS (v0.2)

| Tema | Arquetipo decía | Regla real aplicada |
|---|---|---|
| Extubación | tipo «Sin condiciones» | **jamás** es extubación (v4.2·A2): es «no se realizó PVE» + razón de catálogo |
| PVE | seg «No realizada/Superada/Fracasada» | **Sí/No obligatoria con TOT** (v5.44); Sí→resultado; No→razón; superada⇒extubación (A4) |
| Sedación | Superficial/Profunda/BNM | **escalones 1-6 / fuera de escalón**; BNM es checkbox aparte y NO borra el escalón (v5.44) |
| GCS intubado | suma numérica simple | verbal **1T** y total con **T** (p.ej. 8T) |
| Cooperación | inferida solo de S5Q | regla real: **BNM, SAS 1 o GCS<8 ⇒ No cooperador**; si no, S5Q |
| Vía aérea | VNI como vía «(máscara)» | **Full Face / Oronasal** (interfaz ≠ soporte, v5.41) |
| VMAPS | matriz propia | **matriz real** copiada de producción (TQT admite Ambiente, Válvula de fonación, etc.) |
| CPAP (VNI) | IPAP/EPAP | **una sola presión CPAP** (v5.46) |
| Venturi | litros | **solo FiO₂** (v5.46) |
| CNAF | «LITROS» | **flujo** (litros = naricera/mascarilla) |
| P-VM | «Adaptado» preseleccionable 3 estados | **parte vacía**; Sincrónico/Asincrónico; asincrónico inhabilita Ppl/AutoPEEP (v5.11/v5.46) |
| Prono | chip en posicionamiento, cualquier soporte | **solo con VM** (v5.46); **estado ≠ evento** (v5.32); horas del ciclo |
| KTM noche | eval funcional oculta, KTM pedible | **KTM entera NO aplica de noche**: ni estado, ni frase, ni estadística (v5.46) |
| KTM contraindicada | catálogo inventado | **Tabla 1 del protocolo v5** (copiada) + BNM/AET IIIC la fuerzan |
| KTM alerta | catálogo inventado | **Tabla 3 real** |
| KTM no realizada | razones inventadas | **catálogo real** + razón OBLIGATORIA (v5.44) |
| Secreciones | «−» mudo | «−» = **evaluado y SE NARRA** «Sin secreciones.» (v5.46) |
| Auscultación | chips con «sin ruidos» excluyente | select real + regla anti-oxímoron por valor (v5.46) |
| Fijación TOT | «Comercial/Amarra» | **cm de arcada dental** (norma de la unidad, v5.44) |
| Cuff | no existía | 1 verificación por turno, chips ✓/⚠/○, **no se hereda** |
| Meta PAM | no existía | checkbox + valor; va al texto tras la HDN (v5.44) |
| Firma en el texto | al final del texto | **fuera del texto** (v5.44); la firma vive en cada guardado de bloque |
| DAUCI | MRC<36 severa/<48 | corte real: **MRC-SS <48 = DAUCI** |
| IMS | «hito motor 1-6» | **IMS 0-10 real** (escala de producción) |
| confirm() nativo | usaba confirm() | diálogo propio (convención uiConfirm) |
| Fuente externa | Google Fonts por URL | fuentes del sistema (la red del hospital no siempre deja salir) |

## Lo que el prototipo PRUEBA (las apuestas de UX)

1. **Guardado por bloque** con hora y firma; `REDISENO_LOG` conserva la
   trayectoria (dos FiO₂ con hora ≠ última escritura gana).
2. **Réplica visible campo a campo** («Antes: 30 → 35»).
3. **Validación por rango fisiológico** al escribir.
4. Rail de bloques con estado (✓ guardado / ● sin guardar).

## Pendientes de la adaptación (por orden)

- [ ] Intubación con panel «queda con» completo (v4.3/v4.4: módulo ventilatorio
      del estado posterior). Hoy el evento se registra y manda al bloque 2.
- [ ] Reintubación con panel propio (v4.5) y decanulación con racha de válvula.
- [ ] TQT ocurrida este turno (evento, no estado — v4.6) con su «queda con».
- [ ] GSA opcional con interpretación (v4.2).
- [ ] Desvinculación de VM en TQT (v4.2·7).
- [ ] Dispositivos HME/HEPA/TC por fecha de etiqueta (v5.44) — decidir si van
      en este formulario o quedan en la app principal.
- [ ] Días de VM/estadía reales (aquí son demo); tramos v5.42 al migrar.
- [ ] Réplica DÍA→DÍA de terapia física (regla de producción) cuando el
      prototipo tenga más de un turno real.
- [ ] Los 39 bloques de TEXTO_BLOQUES si el texto generado se lleva a serio.

## Para la fase 2 (paleta) — decidido por Diego

Primero la captura por bloques; la paleta después. La actual es la del
arquetipo (tinta sobre fondo cálido) con fuentes del sistema.

## Recordatorios duros

- Esta carpeta **NO toca** EVOLUCIONES ni ninguna hoja de producción: escribe
  en `REDISENO_TURNOS`/`REDISENO_LOG` y se implementa con URL propia.
- El banner «PROTOTIPO» **no se quita**: un turno registrado aquí no existe
  para el REM, los indicadores ni la entrega.
- La rama `rediseno-formulario-bloques` es **paralela y no se fusiona a main**.
  Lo que gane aquí se migra a `v2/` como ronda normal, con guardias.
