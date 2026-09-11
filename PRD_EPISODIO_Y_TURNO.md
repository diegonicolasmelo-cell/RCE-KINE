# PRD · Episodio y turno — la rama paralela

**Estado**: en programación (rama `separacion-episodio-turno`, planilla propia).
**Dueño**: Diego Melo Villagrán. **Escribe**: Claude, 11-sep-2026.
**Alcance**: lo que Diego decidió el 11-sep en bloque. **Fuera**: la PWA y el
login real (bloqueados por informática), el laboratorio CSV (pendiente por su
pedido), la fusión a `develop`/`main` (solo con su OK después de probar).

## 1 · Hoy → después, en dos líneas

Hoy la fila del turno carga con todo: quién es el paciente, las escalas que se
miden cada tantos días, los eventos que pasaron una vez y cómo está hoy. Un dato
del episodio solo existe si el turno lo escribe, y por eso se pierden.
Después, cada cosa vive donde le corresponde y el turno la **cita**.

## 2 · La historia

**Antes.** Álvaro recibe un ingreso a las 22:00 y lo llena entero. Al otro día
Magdalena quiere aplicarle la ECF y no la encuentra: el bloque está plegado
arriba del formulario. No la aplica. Tres semanas después el paciente egresa y
nadie supo cuál era su fragilidad previa. En la cama 13, un colega cambia la vía
aérea de TOT a natural porque el paciente se extubó, la app le avisa que falta
la extubación y él aprieta «Guardar igual». Para el REM esa extubación nunca
ocurrió y el reloj de VM siguió corriendo.

**Después.** En la tarjeta de la cama hay tres íconos —ECF, Barthel, Charlson—
y el de la ECF se ve pendiente. Magdalena lo toca, aparece la escala, elige el
nivel y queda guardado en el episodio con su fecha y sus iniciales. No abrió la
evolución. Cuando el colega de la 13 abre el formulario, lo primero que ve es
«¿Qué pasó hoy con la vía aérea?». Marca Extubación, se despliega el bloque de
siempre, y el select de vía aérea se pone en natural solo. Si intentara cambiar
el select sin declarar nada, no podría. Al guardar, la extubación queda como
hito con su hora, su tipo y con qué quedó el paciente — y el turno sigue
escribiendo `EXT_OCURRIO` para que el REM no cambie.

## 3 · Objetivos y no-objetivos

- **O1** Las escalas pre-UCI (ECF, Barthel, Charlson) se miden desde la tarjeta,
  sin abrir la evolución, y se ven pendientes mientras falten.
- **O2** Las escalas repetidas (MRC, FSS, CPAx, Pimáx, dinamometría, ecografía,
  deglución) quedan como **serie fechada con firma** en una hoja propia; el
  turno sigue escribiendo su columna cuando la mide en ese turno.
- **O3** La firma viaja con la medición: `MRC-ss 36 · 02-09 · MCC`.
- **O4** SBC (KTM nivel 3) exige al menos un FSS-ICU en el episodio; el mensaje
  manda a medirlo ahí mismo.
- **O5** El evento de vía aérea se declara primero; la vía aérea y el soporte
  solo los cambia un evento (línea fina). Cambio sin evento → motivo escrito,
  en el cliente y en el servidor.
- **O6** Cada evento deja un hito estructurado en `TIMELINE.DATOS_JSON`.
- **O7** Una auditoría de solo lectura encuentra la huella «vía aérea cambiada
  sin evento» en vivos y egresados.
- **O8** AET, procuramiento y fechas de dispositivos se leen del episodio, no
  se heredan.
- **O9** Los cultivos van «ambas» (Diego, 11-sep): la TOMA del turno abre una
  entrada de la serie (hora, tipo, ATB, firma de quien la tomó, resultado
  «pendiente») y el RESULTADO que llega días después se escribe SOBRE esa
  misma entrada, con fecha y firma de quien lo anotó; el hito «Cultivo de
  secreciones» de la línea de tiempo lleva el mismo detalle.
- **N1** No se toca ninguna de las 396 columnas de EVOLUCIONES (el `testEsquema`
  las asserta y 27 archivos las leen).
- **N2** No se reescriben los consumidores de `EXT_OCURRIO`: la fila de eventos
  escribe esas mismas casillas.
- **N3** No se cambia el texto narrativo: sigue cronológico (ejemplo de Diego).
- **N4** Nada de esto se pega en la planilla de producción.

## 4 · El flujo, dos veces

**Hoy** — abrir cama → modal completo → escalas plegadas en «✏️ Editar ficha»
→ vía aérea se cambia a mano → aviso no bloqueante → «Guardar igual» → fila del
turno con todo → CAMAS_ESTADO arrastra el último valor sin firma.

**Mañana** — tarjeta con íconos de escala (pendiente/hecho) → clic → calculadora
existente → `EPISODIO_ESCALA` o `EVAL_REGISTRAR` → CAMAS_ESTADO + EVALUACIONES.
Modal: banner con identidad y días → fila «¿Qué pasó hoy con la vía aérea?» →
el evento abre su bloque y fija fVA/fSop → guardar → EVOLUCIONES (igual que
hoy) + hito con DATOS_JSON + EVALUACIONES si midió algo.

## 5 · Los datos

| Qué | Dónde vive | Quién lo escribe | Candado |
|---|---|---|---|
| ECF, Barthel, Charlson | CAMAS_ESTADO (ya existían) | `EPISODIO_ESCALA` desde la tarjeta, o el turno | se corrige encima, sin historial |
| MRC, FSS, CPAx, PIM, PEM, FEM, dinamo, eco, deglución, cultivo | **EVALUACIONES** (nueva) + ULT_* en cama | `EVAL_REGISTRAR` (tarjeta) o el guardado del turno | solo se agrega; corregir = nueva fila + ANULADA en la vieja |
| Firma de la última | CAMAS_ESTADO `ULT_MRC_FIRMA`, `ULT_FSS_FIRMA`, `ULT_PIM_FIRMA` (nuevas, al final) | arrastre del guardado | — |
| Eventos de vía aérea | EVOLUCIONES (como hoy) + **TIMELINE.DATOS_JSON** (nuevo) | guardado del turno | vía aérea no cambia sin evento o motivo |
| AET, UPOT, dispositivos | CAMAS_ESTADO (AET/UPOT nuevas al final; dispositivos ya estaban) | arrastre del guardado | se leen del episodio, no se heredan |

**Consumidores que leen las escalas** (inventario, 11-sep): tarjeta (`_evalBadge`,
~5136), matriz motora (~16122), hoja impresa (`{{MRCULT}}`, ~16707), entrega
(`svc_entrega.gs:295`), campana (`svc_auditoria.gs:109`), egreso
(`svc_camas.gs:235`), hoja UCI (`HJ_F.mrc/fss`, ~8670). Ninguno se rompe: todos
siguen leyendo `ULT_*` o `EVAL_T_*`; la serie es una fuente MÁS.

## 6 · Pseudo-código como acuerdo

```
CUANDO el colega toca el ícono de ECF en la tarjeta
  → abre la calculadora de siempre
  → al aplicar: EPISODIO_ESCALA {idCama, escala:'ECF', valor}
  → el servidor escribe CAMAS_ESTADO.ECF y un hito «ECF 5 (MCC)»
  → la tarjeta deja de mostrarla pendiente

CUANDO el colega mide un MRC (desde la tarjeta o dentro del turno)
  → EVALUACIONES += {pid, fecha, ESCALA:'MRC', TOTAL, ITEMS_JSON, FIRMA}
  → CAMAS_ESTADO.ULT_MRC / _FECHA / _FIRMA = esta medición
  → si fue dentro del turno, EVOLUCIONES.EVAL_T_MRC también (como hoy)

CUANDO guarda KTM nivel 3 (SBC) y el episodio no tiene ningún FSS
  → cliente: no guarda, marca el FSS y explica
  → servidor: rechaza con el mismo mensaje

CUANDO el turno marca una toma de cultivo
  → EVALUACIONES += {ESCALA:'CULTIVO', TOTAL:'pendiente', ITEMS:{hora,tipos,conATB,objetivo}, FIRMA}
  → el hito «Cultivo de secreciones» lleva ese detalle
CUANDO un turno posterior trae el resultado (sin toma nueva)
  → la última entrada «pendiente» pasa a TOTAL = resultado (+ resultadoFecha, resultadoFirma)
  → el mismo resultado heredado turno tras turno NO abre entradas

CUANDO la vía aérea de salida ≠ la de entrada y no hay evento declarado
  → cliente: pide motivo escrito (no hay «Guardar igual» sin motivo)
  → servidor: rechaza salvo TRANS_MOTIVO no vacío; lo guarda en el hito

PROMESAS
  · EVOLUCIONES sigue con 396 columnas y el REM no cambia de fuente
  · nada pisa texto guardado
  · la serie nunca borra: corregir agrega
  · producción no se toca
```
