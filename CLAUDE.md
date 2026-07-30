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
- `esquema.gs`: 19 hojas; **EVOLUCIONES tiene 359 columnas** y `testEsquema`
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

## Hoja UCI (historial · jul-2026)

Primera pestaña del historial: reproduce **la hoja de registro kinésico de la
unidad** (el papel que el equipo lee hace años) día a día, con columnas
`fecha → DÍA | NOCHE`. Se arma **en el cliente** desde `TL_EVOS` (el historial
ya trae vivas + archivadas); no hubo cambios de servidor.

- **Segmentos** (`hjSetSeg`): Todo · Ventilatorio · **Weaning** · Neuromuscular ·
  Dispositivos y NAVM · Eventos. El weaning va **dentro de Ventilatorio** y
  además como bloque propio (en «Todo» no se duplica). Las filas **ancla**
  (fase, soporte, firma) sobreviven a todos los filtros.
- Rango 7/14/toda la estadía, colapso de filas sin datos, columna de
  TENDENCIA con curva, cruz de lectura al pasar el cursor y «▸ ver» que abre
  el desglose de MRC-ss y FSS-ICU.
- El bloque **NAVM** reúne el paquete de prevención: días de VM, cuff,
  cabecera, Trachcare, HEPA, HME, humidificación y cultivo.
- Filas definidas en `HJ_F` (cómo se lee cada dato) y bloques en `HJ_BLOQUES`.
- **Trampas ya pagadas**: las clases de franja necesitan prefijo `hjb-` porque
  `.mon`, `.nm`, `.ev` YA existen en la app y pisaban el estilo; y los
  decimales se guardan con coma («5,9»), así que `parseFloat` directo los
  truncaba — usar `_hjNum`. Guardia: `checks/hoja_uci.js`.

## Estado y pendientes (julio 2026)

- En marcha blanca con DATOS DE PRUEBA; **implementación real el 1-ago-2026**
  (ahí se afina el registro con uso real). Deployment: cohete **v4.4-modulo**
  (antes v4.3-viaaerea, v4.2-clinico, v4.1-apache). Exige
  `crearORepararEstructura()` (EVOLUCIONES 359 columnas).
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
- **APACHE II — CERRADO (jul-2026, cohete v4.1-apache).** Decisión de Diego:
  «lo robaremos de la evolución médica; agrégalo al egreso como opción si no
  se pudo anotar antes». Campo opcional 0-71 junto a Charlson (datos del
  paciente); viaja TRANSITORIO como PAC_APACHE2 (patrón PAC_RUT — NO es
  columna de EVOLUCIONES) y persiste en CAMAS_ESTADO.APACHE2 →
  ARCHIVO_PACIENTES.APACHE2 al egresar. El egreso lo ofrece SOLO si está
  vacío (si existe, lo informa); el valor de la cama manda sobre el tardío.
  `_apacheNorm` en svc_camas: entero 0-71 o vacío (inválido → vacío, jamás
  basura). Exigió `crearORepararEstructura()`. Guardia: `checks/apache.js`.
- **PAQUETE v4.2 — APLICADO (jul-2026, cohete v4.2-clinico).** Decisiones de
  Diego sobre los hallazgos de la simulación (EVOLUCIONES pasa a **328 col**;
  exige `crearORepararEstructura()`). Guardia: `checks/v42.js`.
  1. A1 CORREGIDO: `DIAS_VM_TOTAL`/`DIAS_VA_TOTAL` del archivo se DERIVAN de las
     evoluciones del episodio (días calendario distintos con VM / con TOT-TQT);
     el contador del censo solo gana si es mayor (egresa ventilado).
  2. A3 CORREGIDO: `EXTUBACION_OK`/`REINTUBACION` se derivan del episodio
     (extubación programada sin reintubación / alguna reintubación). El egreso
     puede forzarlos si los envía.
  3. **A2 — «sin condiciones de PVE» JAMÁS es extubación** (regla dura): salió
     de los tipos de extubación y ahora es «no se realizó PVE» **con razón
     obligatoria de catálogo** (`PVE_SC_RAZON` + `PVE_SC_DET`). La extubación
     sin PVE se declara aparte (`cExtSinPve`) y solo entonces se elige tipo
     (sin protocolo / autoextubación / accidental). Indicadores: `sin_condiciones`
     se ignora siempre; una extubación con <24 h de VM se registra como «sin
     protocolo» con motivo «≤ 24 h de VM». **AVISAR A MANUEL**: su serie
     histórica contaba `sin_condiciones` como programada — hay que recalcular.
  4. A4 SIN CAMBIO (decisión de Diego): PVE superada ⇒ extubación automática.
  5. Módulo «TERAPIA FÍSICA» renombrado a **REHABILITACIÓN**; dentro, uso de
     **válvula de fonación** (minutos + tolerancia + observación, gate TQT →
     `VFON_*`). Además es MODO ventilatorio de TQT en Oxigenoterapia **y en
     Ambiente** (TQT ahora admite soporte Ambiente). Tubo T/HME aceptan FiO2.
  6. **GSA** opcional (casilla que despliega, patrón SmartEvo): pH, PaO2, PaCO2,
     HCO3, EB, lactato, SaO2, FiO2 + hora; interpreta el trastorno ácido-base y
     calcula PaFi (rellena `r_pafi` si está vacío). No se replica.
  7. **DESVINCULACIÓN de VM (TQT)** en Terapia ventilatoria, después de la
     terapia: hora + a qué queda + motivo, casilla de reconexión con hora y
     **delta de horas** (cruza medianoche). Genera hito `DESVINCULACIÓN`, va a
     la entrega de turno, a la Hoja UCI y a indicadores (`desvinculaciones`,
     `desvincReconexiones`, `desvincHorasTotal`, `desvincMedianaHoras`).
     Anulable como evento (`desvinc`).
  Trampa reconfirmada: `fPVEval` es hidden ⇒ `form.reset()` NO lo limpia (lo
  limpia abrirPanel); en arneses hay que vaciarlo antes de togglear.
- **v4.3 · ESTADO PREVIO → EVENTO → ESTADO POSTERIOR (jul-2026, cohete
  v4.3-viaaerea).** REGLA CLÍNICA DURA pedida por Diego: un procedimiento que
  cambia la vía aérea **jamás pisa la Terapia ventilatoria de arriba** —
  describir cómo estaba el paciente para ser intubado es parte esencial del
  registro. El bloque superior queda como PREVIO y el evento despliega su
  propio panel «Queda con» (VA + soporte + modo + N° tubo/fijación +
  VT/FR/PEEP/FiO2/SpO2 + hora). Aplica a INTUBACIÓN y TQT (extubación y
  decanulación ya lo tenían con «Soporte PE» / «Queda con»).
  - `hIntub()` YA NO cambia `fVA`/`fSop` (antes sí: era el error).
  - El **soporte previo se deduce** (`_sopPrevioAuto`): VNI / CNAF /
    Naricera-NRC / Ambiente. `fIntubSopPrevio` pasó a hidden.
  - Columnas nuevas (EVOLUCIONES **343**): `INTUB_VA_PREVIA`,
    `INTUB_MODO_PREVIO`, `INTUB_VA_POST`, `INTUB_SOP_POST`, `INTUB_MODO_POST`,
    `INTUB_TOT_N/CM`, `INTUB_VT/FR/PEEP/FIO2/SPO2`, `TQT_SOP_POST`,
    `TQT_MODO_POST`, `TQT_PARAMS`.
  - **C1 CERRADO**: `_syncCamaDesdeEvolucion` sincroniza la cama con el estado
    FINAL (vía aérea, soporte, modo, N° de tubo y fechas de inicio), y
    `DIAS_VM`/`DIAS_VA` del turno se calculan con el final (un turno que
    intuba cuenta como día de VM). Indicadores idem (`VENT_SOPORTE_FINAL`).
  - Texto en orden clínico: cómo estaba → «Previo en VNI, paciente requiere
    intubación orotraqueal a las 02:10 hrs…» → «Queda con TOT N° 8.0 fijado a
    22 cm, conectado a VM en modo ACVC. Vt 400 ml…».
  - `_lcIni` (cliente y servidor) baja SOLO la inicial y **respeta siglas**
    (VNI, CNAF, NRC no se convierten en «vNI»).
  - Guardia: `checks/via_aerea_previo.js`; BUG 6 de `regresion_ui.js`
    actualizado a la regla nueva.
- **v4.4 · MÓDULO COMPLETO EN EL EVENTO + EVENTOS NO DERIVABLES (jul-2026,
  cohete v4.4-modulo).** EVOLUCIONES **359 columnas**.
  1. El panel «Queda con» de la intubación despliega el **módulo ventilatorio
     COMPLETO** (Ppl, Pmedia, AutoPEEP, flujo, Ti, PaFi + derivados vol.min,
     I:E, DP, Cest, ml/kg). `renderParams(o)` y `calcResp(el)` quedaron
     PARAMETRIZADOS por prefijo: bloque del turno `r_`/`l_`, panel posterior
     `pi_`/`pl_` (el prefijo se deduce del input que dispara el cálculo).
     Columnas `INTUB_PMAX/PPL/PMEDIA/AUTOPEEP/PS/PINSP/FLUJO/TI/PAFI`.
  2. **Los dispositivos reaparecen** al quedar en VM: `_gateDispositivos()`
     mira el estado FINAL. TRAMPA PAGADA: refrescar el gate llamando a
     `renderParams()` completo BORRABA los parámetros previos de arriba (el
     innerHTML se reconstruye) — por eso el gate vive en su propia función.
  3. **FilmArray** sumado a las técnicas de cultivo (`name="mtest"`).
  4. **Procedimientos no derivables** = casillas de un toque: traslado a
     imagenología, traslado a pabellón, asistencia en procedimiento médico y
     **RCP con n° de ciclos + hora + detalle** (`PROC_IMAGEN`, `PROC_PABELLON`,
     `PROC_ASIST_MED`, `PROC_RCP`, `PROC_RCP_CICLOS/HORA/DET`). Son eventos del
     día: NO se arrastran. El RCP va al texto, al timeline y **a la entrega de
     turno** (también pabellón e imagenología). EMS y educación al usuario
     SALIERON de la lista manual: ya se derivan de sus casillas
     (`cEMS`, `cEduReal` → «EDUCACIÓN A USUARIO/FAMILIA»).
  Guardia: `checks/via_aerea_previo.js` (extendida).
- **SIMULACIÓN E2E (jul-2026)** — arnés `build/sim/`: cliente real (index en
  Chromium) + servidor real (.gs en Node, hojas en memoria, reloj simulado
  `SIM.fecha`); `node build/sim/sim_e2e.js` corre 8 pacientes ingreso→egreso.
  Hallazgos en `INFORME_SIMULACION.md` (13, PENDIENTES DE DECISIÓN de Diego);
  los graves: DIAS_VM_TOTAL/DIAS_VA_TOTAL=0 en ARCHIVO si no egresa ventilado
  (A1), doble semántica de `sin_condiciones` formulario vs indicadores/Manuel
  (A2), EXTUBACION_OK/REINTUBACION del archivo siempre false (A3), PVE
  superada fuerza extubación (A4), modo «Válvula de fonación» inexistente
  (B1), Tubo T/HME sin FiO2 (B2), la cama no refleja el estado *_FINAL tras
  extubar/decanular (C1), TOT 8.0/22 preseleccionados (D3), EVAL_FECHA en UTC
  real (D4). **A1, A2, A3, B1, B2 y B3 ya CORREGIDOS en v4.2**; quedan
  PENDIENTES: D1-D5 (pulidos de texto y formulario) y A4 cerrado sin cambio.
  **C1 CERRADO en v4.3** junto con la regla de estado previo → posterior.
- **PAQUETE v4 — APLICADO (jul-2026, cohete v4.0-paquete).** Lo que quedó:
  1. BUG ingreso Natural→IOT mismo turno CORREGIDO: el gate del ingreso ya
     no oculta `dIntubSec` (solo reintub/ext/decan/tqt); texto cliente con
     «Previo en …» (paridad con servidor); `_autoProcs` registra INGRESO +
     INTUBACIÓN. Guardia: BUG 6 en `checks/regresion_ui.js` (ojo: el arnés
     arrastra contadores VM entre tests — resetear `_vmHistFlag` etc.).
  2. HISTORIAL: pestañas **Resumen (inicial) → Hoja UCI**; Seguimiento
     eliminado de la vista pero su diseño vive en `tlImprimir()` (#tlPrint +
     `@media print`, botón 🖨️ — ventana de impresión del navegador, permite
     guardar PDF). Modal `#tlp` a PANTALLA COMPLETA (overrides solo en #tlp,
     NO en `.tlmodal`: la clase la comparten ~12 modales) y cierra SOLO con
     la X (ni backdrop ni Escape). Resumen con evoluciones PLEGADAS
     (`<details class="tlr-fold">`, solo la última open; cabecera fecha +
     turno + fase + firma). Toggle «tendencia por día» eliminado.
     Guardia: bloque v4 en `checks/hoja_uci.js`.
  3. REGISTRO DIARIO: ➕ junto al nombre del paciente (celda `.tc-n`); el
     popover elige turno Día/Noche (`evSetTurno`, preselección por SHIFT) y
     el motivo queda a la vista. Guardia: `checks/eventos_ui.js`.
  4. ESTADÍSTICAS en orden Indicadores → General → **Tabla dinámica** → REM
     → Control de calidad. Pivot 100% vanilla: servidor `datosPivot()` en
     svc_stats.gs (LISTA BLANCA sin nombre/RUT/PATIENT_ID, tope 2.500,
     MES derivado) + API `GET_PIVOT`; cliente pivCargar/pivRender
     (conteo/suma/promedio, coma decimal, límite 80×32). Guardia:
     `checks/pivot.js`.
  5. VENTILADORES: fallas por equipo — `registrarFallaVM`/`obtenerFallasVM`
     en svc_equipos.gs (descripción OBLIGATORIA, foto opcional base64→Drive
     TODO-O-NADA, mime validado en servidor, deja ESTADO='Con falla'), hoja
     FALLAS_VM + seed `FALLAS_FOTOS_FOLDER` (la carpeta se crea sola al
     primer uso y persiste su ID; el scope Drive YA estaba en
     appsscript.json ⇒ no exigió re-autorización). Foto comprimida en
     cliente (canvas 1280 px JPEG 0,8). CAMAS: tag `.vmtag` del ventilador
     asignado (cruce en servidor en obtenerTodasLasCamas, una sola lectura),
     rojo si «Con falla», clic → pestaña Ventiladores. Guardia:
     `checks/fallas_vm.js`.
  DECISIONES POR DEFECTO (avisadas a Diego, puede pedir cambio): impresión =
  ventana del navegador (sirve como PDF); fotos de fallas en carpeta Drive
  auto-creada del dueño, sin compartir público; sin migración de registros
  históricos del bug de vía aérea (eran datos de prueba).
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
