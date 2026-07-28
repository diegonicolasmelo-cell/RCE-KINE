# RCE-KINE v2 — Registro Clínico Electrónico de Kinesiología UCI

Google Apps Script + Google Sheets. Hospital San Pablo de Coquimbo, unidad
de kinesiología UCI. El usuario es **Diego Melo Villagrán** (coordinador de
kinesiólogos, no programador): trabaja en español, actualiza el proyecto
**pegando a mano** los archivos en el editor de Apps Script, y prueba en el
navegador del hospital o de su casa.

## Cómo trabajar con Diego

- Todo en **español**. Explicar sin jerga; él decide, tú propones opciones
  ANTES de tocar código cuando el cambio es de diseño/UX ("dame opciones").
- **Cada entrega de archivos** debe decir: qué archivos pegar, si hay que
  correr `crearORepararEstructura()`, y recordar el paso **Nueva versión**
  (usar la skill `entrega-gas`; el index SIEMPRE en formato cohete).
- No agregar funcionalidades que no pidió (p. ej. rechazó envío de correos).
- Los eventos de vía aérea (intubación, extubación, TQT, decanulación) se
  registran **manualmente** por decisión clínica; las alertas solo detectan
  olvidos, nunca automatizan el registro.

## Arquitectura

- **Repo = verdad.** `v2/*.gs` + `v2/index.html` (fuente, sin minificar).
  El proyecto GAS de producción usa un layout de 9 .gs: los 11 `svc_*.gs`
  viajan fusionados como `servicios.gs` (`build/fusionar_servicios.js`).
- `api.gs`: dispatcher único `api(accion, datos, token)`; escrituras pasan
  por `_auditar`. `GET_LOGIN_INFO` es pre-auth (público).
- `esquema.gs`: 19 hojas; **EVOLUCIONES tiene 302 columnas** y `testEsquema`
  las asserta — al agregar columnas, SIEMPRE al final de la lista (la
  reparación reescribe encabezados: insertar al medio desalinea los datos)
  y avisar que hay que correr `crearORepararEstructura()`.
- **RUT** (uso interno autorizado): identidad de PERSONA en CAMAS_ESTADO y
  ARCHIVO_PACIENTES; PATIENT_ID sigue siendo el episodio. PAC_RUT viaja
  transitorio en el guardado (no se persiste en EVOLUCIONES). El RUT jamás
  sale en REM, tablero ni exportaciones.
- Identidad de paciente = `PATIENT_ID` (episodio); los traslados re-estampan
  EVOLUCIONES y TIMELINE (`_reetiquetarEpisodioACama`).
- `AUTH_DEV_MODE=TRUE` en CONFIG: acceso abierto intencional (marcha
  blanca). **Login/demo RETIRADOS DE LA VISTA** (jul-2026, pedido de Diego):
  `LOGIN_UI_ACTIVO=false` en index oculta la devbar y reemplaza el overlay
  GIS por un mensaje neutro de reconexión. Para REINCORPORAR cuando Diego lo
  pida: poner `LOGIN_UI_ACTIVO=true` (todo el mecanismo GIS + GET_LOGIN_INFO
  sigue intacto detrás del flag) y, para exigir identidad real, además
  AUTH_DEV_MODE=FALSE en CONFIG + OAUTH_CLIENT_ID configurado.
- Frontend: `v2/index.html` único (~9.300 líneas fuente). Piel estilo
  Notion (variables `--n-*`, portadas `.tbanner` por pestaña). Convención
  **`uiConfirm`** (jamás `confirm()` nativo). Módulos heredados del turno
  anterior usan la clase `.heredado` + chip «✓ Sin cambios» por bloque.

## La saga del boot (léela antes de tocar el arranque o la entrega)

Días de fallos con `Uncaught SyntaxError: Invalid regular expression:
missing / @userCodeAppPanel...`. Lo aprendido, pagado caro:

1. La línea del error pertenece al **bootstrap de Google**, no a nuestro
   archivo (misma línea 1842 con dos contenidos distintos lo demostró).
2. Google re-procesa el HTML servido con un parser más estricto que Chrome:
   los `<`/`>` **crudos** en markup (p.ej. `VM < 24 h` en un comentario, o
   `value="PAS > 180"`) lo tumban. Guardia: `build/checks/convenciones.js`.
3. La solución definitiva es el **cohete** (`build/empaquetar_cohete.js`):
   cargador ASCII puro + app en base64 → Google nunca ve el HTML real.
   Costo medido: ~50 ms una vez por carga. El index NUNCA se entrega crudo.
4. `createTemplateFromFile` (plantillas) también rompía el arranque: el
   `doGet` usa `createHtmlOutputFromFile` y así debe quedarse.
5. **`/exec` sirve la versión desplegada** (requiere «Nueva versión» tras
   cada pegado); `/dev` sirve lo recién guardado pero solo para el dueño.
6. El sello de versión (`meta rce-version` + `[index X.Y]` en el watchdog)
   existe para saber siempre qué archivo produjo un error. Mantenerlo al día.
7. Cuidado propio: al generar literales con caracteres invisibles, este
   modelo puede emitir U+2028 real en vez del escape → romper con el mismo
   error. Escribir ` ` con printf/escapes, nunca literal.

## Verificación (skill `verificar`)

`build/checks/`: `convenciones.js` (estáticas), `arranque.js` (boot real en
Chromium con puente simulado; acepta ruta del cohete como argumento),
`regresion_ui.js`, `movil.js`, `piel.js`, `rem.js`, `indicadores.js`,
`eventos.js`, `eventos_ui.js`. Correr antes de entregar o commitear. Un bug
que costó más de un intercambio merece guardia nueva.

## Estado y pendientes (julio 2026)

- En marcha blanca con DATOS DE PRUEBA; **implementación real el 1-ago-2026**
  (ahí se afina el registro con uso real). Deployment estable: cohete
  v3.2-ktmdia (REM 28 celda a celda, tablero centinela, RUT, versión móvil
  instalable, eventos rápidos, firma clínica con tratamiento).
- **Réplicas por turno** (reglas ganadas a punta de bugs, jul-2026):
  los PROCEDIMIENTOS son del turno — la réplica parte SIEMPRE con la lista
  manual vacía (el PROC_JSON guardado une manuales+automáticos; arrastrarlo
  duplicaba INGRESO/IMT y sumaba doble en estadística). TERAPIA FÍSICA
  (KTM/IMT/EMS) se replica **DÍA→DÍA**: de noche el bloque va oculto por el
  gate y parte LIMPIO (si replicara se guardaban sesiones IMT fantasma que
  nadie ve); el servidor adjunta `_PREVIA_DIA` en obtenerEvolucionPrevia y
  el cliente usa esa fila para el bloque (`_tf` en fillFormReplica).
  Guardias: BUG 4 y BUG 5 en `checks/regresion_ui.js`.
  MEJORA EVENTUAL (pedir confirmación a Diego si surge la necesidad):
  permitir anotar IMT/EMS nocturno — hoy es «jamás», pero él anticipa que
  podría necesitarse; sería mostrar el bloque de noche desmarcado.
- **Eventos rápidos + reloj de dispositivos** (jul-2026): botón ➕ en la
  fila del Registro Diario y en la tarjeta de cama abre un popover (estilo
  lista de Sheets) para anotar DESPUÉS de evolucionar: procedimiento del
  catálogo (exige evolución guardada; suma a PROC_JSON y PROCEDIMIENTOS
  como `TIPO_PROC:'anexo'`), cambio de HME/HEPA/sonda (resetea el reloj
  con la FECHA EFECTIVA: turno Noche fecha al día siguiente), resultado de
  cultivo (sin sugerir aislamiento) y otro. Nada toca el TEXTO: va a
  timeline + estadística. Cualquier colega firma (select del roster).
  Reloj: parte al conectar VM con `DISP_CONFIRMADO=false`; franja «✓
  Aceptar» en el panel corrobora (o se ajustan las fechas y se guarda).
  `svc_eventos.gs` (API `ANEXAR_EVENTO`/`CONFIRMAR_DISPOSITIVOS`) +
  guardias `checks/eventos.js` (servicio) y `checks/eventos_ui.js` (UI).
- **Firma en texto clínico** (jul-2026): «Klgo./Klga. Nombre Apellido» —
  cliente `Turnos.firmaTexto()` (ROSTER con campo `t`), servidor
  `_firmaTextoClinico()` (hoja KINESIOLOGOS, columna TRATAMIENTO nueva;
  llenar «Klga.» para las colegas tras reparar estructura).
- **Estadísticas**: centinelas protagonistas — `indBox` al tope de la
  pestaña, desplegado y auto-calculado (año en curso) al entrar; REM y
  auditoría quedan como secundarios (son para jefatura).
- **Cuff y presión transtraqueal** (jul-2026): el cuff se verifica **1 vez
  por turno** (protocolo de la unidad) con chips de UN TOQUE
  (`✓ En rango · ⚠ Ajusté · ○ Desinflado`) que solo aparecen con VA
  artificial; el número se pide SOLO al ajustar (Diego: «que no agregue más
  roce a evolucionar»). No se replica: heredarlo daría por hecha una
  medición que nadie hizo. Columnas `VENT_CUFF_EST`/`VENT_CUFF_CMH2O`;
  rango en CONFIG (`CUFF_MIN`/`CUFF_MAX`, IDSA 20-30). Indicador nuevo en el
  tablero: adherencia = verificados/turnos con VA artificial (los
  «desinflado» salen del denominador: con válvula de fonación no
  corresponde medir). **`EVAL_T_PMANT_VA` NO es cuff**: es la presión
  transtraqueal con válvula de fonación (permeabilidad de vía aérea /
  cánula sobredimensionada); semáforo con cortes `PTT_OK`=10 y
  `PTT_ALERTA`=12 en CONFIG — Diego los revisará contra el protocolo de la
  unidad (literatura: ≤10 permeable; 86% de tolerancia con ≤9, 93% con ≤5).
- **REM 28**: `svc_rem.gs` agrega los totales; falta el formulario oficial
  de estadística (Diego lo enviará) para mapear la salida celda a celda.
- **Motor de texto**: `TEXTO_AUTO` vs `TEXTO_MANUAL` se guardan por turno;
  tras semanas de uso, comparar y refinar el motor con los patrones de
  edición reales.
- **Versión móvil**: LISTA (jul-2026): barra inferior + hoja «Más», acordeón
  en evolución, web instalable; guardia `checks/movil.js`. Pulir con feedback
  de uso real del equipo.
- **Tablero de indicadores centinela** (jul-2026): en Estadísticas; fracaso
  de extubación ≤48 h (precoz <24 h / tardío 24-48 h, meta <20%),
  autoextubaciones/100 días-VM (1-2), fuera de protocolo (<25%) con motivos
  por turno, PVE/100 pac-día, mediana VM pre-TQT, reingresos por RUT,
  mortalidad SIN ajuste (el ajuste por APACHE II se hace fuera, cruzado por
  RUT, anonimizado). `svc_indicadores.gs` + guardia `checks/indicadores.js`.
- **APACHE II — PENDIENTE DE CERRAR CON DIEGO** (jul-2026, pedido explícito:
  «recuérdamelo cuando terminemos las otras tareas y lo cerramos»). Hallazgo de
  Manuel: la gravedad al ingreso predice la mortalidad (OR 1,94 por cada 5
  puntos, p<0,001; AUC 0,633→0,795) y los días de VM no ⇒ comparar meses o
  turnos sin ajuste compara poblaciones, no desempeños. Hoy el dato NO se
  captura. Recomendación entregada: campo numérico opcional (0-71) al ingreso,
  editable después (lo calcula el médico, el kine lo copia); columna al final de
  EVOLUCIONES ⇒ exige `crearORepararEstructura()`. Alternativa: cruce por RUT
  con la planilla médica (depende de otro equipo). Probablemente Manuel trabaje
  en ello; igual hay que decidir el lado RCE-KINE.
- **En el tintero** (iniciativa de Klgo. Manuel Fuentes, coordinar y sumar):
  sembrar INDICADORES_HISTORICO con su tabla mensual 2025-2026 (solo
  agregados) cuando la envíe, y la exportación anonimizada paciente-día
  para su pipeline de análisis (sin nombre ni RUT).
- **Stock de cánulas TQT** (aprobado en concepto, NO implementar aún):
  descuento automático por número+tipo al guardar TQT instalada o cambio de
  cánula (paciente que llega traqueostomizado NO descuenta), libro de
  movimientos + reposición manual + alerta de stock bajo, patrón del módulo
  de ventiladores. Falta que Diego mande: inventario actual, si el cambio
  puede variar de calibre, flujo de reposición y umbrales de alerta.
  Mockup antes de código.
- Privacidad: datos clínicos reales NO salen a APIs externas sin
  anonimización + aprobación institucional (Ley 19.628).
