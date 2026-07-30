# Informe de simulación ingreso→egreso · v4.1 (jul-2026)

**Método.** Se construyó un arnés que corre la **app real de punta a punta**: el
`index.html` verdadero en un navegador, conectado al **código real del servidor**
(los `.gs` de `v2/`) con hojas en memoria (`build/sim/`). Se simularon **8
pacientes** de perfiles distintos — 25 turnos día/noche con sus textos, 8
egresos, traslado de cama, reingreso por RUT, eventos ➕, falla de ventilador —
y al cierre se pidieron indicadores, estadística, auditoría y tabla dinámica.

**Resultado global.** La plataforma aguantó todos los flujos sin un solo error
de JavaScript. Réplicas, gates día/noche, contadores de VM/VA, firma clínica,
APACHE II (incluido el fallback del egreso), eventos rápidos, auditoría de
calidad y anonimización del pivot funcionaron como se diseñaron. Los hallazgos
de abajo son lo que la simulación destapó: **4 descuadres de datos, 3 vacíos de
registro y 5 pulidos menores**. Ninguno se corrigió aún — se listan para
decisión de Diego.

Perfiles simulados: P1 séptico IOT→weaning→extubación protocolo; P2 Natural→IOT
mismo turno→autoextubación nocturna→reintubación→TQT; P3 VNI fracasa→IOT→
fallece; P4 llega traqueostomizada→válvula fonación→decanulación; P5 O2 simple
sin VM; P6 post-op electivo extubado <24 h; P7 traslado de cama + reingreso por
RUT; P8 aislamiento + eventos ➕ + falla de ventilador asignado.

---

## A · Descuadres de datos (afectan la estadística — decidir pronto)

### A1. Los días de VM del episodio se pierden al egresar 🔴
`DIAS_VM_TOTAL` y `DIAS_VA_TOTAL` de ARCHIVO_PACIENTES se copian del **censo al
momento del egreso**, y el censo los calcula solo si el paciente **sigue** en
VM / con vía aérea artificial. Como casi nadie egresa ventilado, quedan en 0:
P1 acumuló 5 días de VM y su archivo dice **0** (igual P2 con 8+). Solo P3
(falleció en VM) y quienes seguían ventilados archivaron un valor.
**Propuesta:** al egresar, derivar ambos totales de las evoluciones del
episodio (fechas con soporte VM / con VA artificial), no del estado actual.

### A2. «Sin condiciones de PVE» significa dos cosas contradictorias 🔴
- **En el formulario**: «no hay condiciones para PVE, *mantiene soporte*» — no
  hay extubación, y el texto lo dice bien.
- **En los indicadores** (y en las definiciones enviadas a Manuel):
  `sin_condiciones` = *extubación programada con ≤24 h de VM*, que suma al
  denominador y a «fuera de protocolo».

Como el formulario guarda esa opción con `EXT_OCURRIO=false`, el indicador
nunca la cuenta, y una extubación real con <24 h de VM solo puede etiquetarse
«sin protocolo» (el motivo «≤24 h de VM» del tablero jamás aparecerá).
**Propuesta:** separar en dos opciones — «🚫 Sin condiciones: mantiene
soporte» (lo de hoy) y «⏱️ Se extuba con <24 h de VM (sin condiciones de
PVE)» (extubación real, programada, fuera de protocolo) — y avisar a Manuel
para que su serie histórica y la app cuenten lo mismo.

### A3. `EXTUBACION_OK` y `REINTUBACION` del archivo siempre quedan en falso 🟠
El egreso no las pregunta ni las deriva: P1 (extubado exitoso) y P2 (con
reintubación) archivaron ambas en falso. La estadística real usa EVOLUCIONES y
REINTUBACIONES, así que los indicadores no se afectan — pero esas columnas
mienten para cualquiera que lea el archivo (Manuel incluido).
**Propuesta:** derivarlas del episodio al egresar (hubo extubación programada
sin reintubación ≤48 h / hubo alguna reintubación), o eliminarlas del esquema.

### A4. «PVE superada» da por hecha la extubación 🟠
Marcar PVE superada implica automáticamente extubación tipo protocolo en ese
turno. No se puede registrar el caso real «PVE superada en la tarde,
extubación diferida a mañana» (o «superada, el médico decide mantener»).
**Propuesta:** en la rama superada, un check «se difiere extubación» que
registre la PVE exitosa sin evento de extubación.

---

## B · Vacíos de registro (cosas que hoy no se pueden anotar)

### B1. No existe el modo «Válvula de fonación» 🔴
La matriz TQT + Oxigenoterapia ofrece HME · Tubo T · OAF/CTAF · CNAF. La
válvula de fonación — que el protocolo de presión transtraqueal y el chip de
cuff «desinflado» presuponen — no es un modo registrable: P4 quedó con el modo
anterior y sin parámetros de O2. **Propuesta:** agregar «Válvula de fonación»
a los modos de TQT+O2 (con litros de O2 y FiO2 estimada como la naricera).

### B2. Tubo T y HME no permiten FiO2 🟠
Solo aceptan litros/FR/SpO2. Un tubo T con venturi entrega FiO2 conocida y hoy
no se puede anotar (el texto dice «con FiO2 adicional» sin poder decir cuánta).

### B3. Sin campos para gases arteriales ni desvinculación de VM en TQT 🟡
- La PaFi se anota a mano; no hay pH/PaCO2/PaO2 (¿los quiere registrar la
  unidad? — decisión, no defecto).
- La salida de VM del paciente traqueostomizado (weaning de TQT) no tiene
  evento estructurado con hora: solo el aviso «sin desvinculación registrada
  (agrégala en Procedimientos)». La extubación sí es evento; la desvinculación
  no. ¿Se quiere como evento con hora, para medianas de weaning de TQT?

---

## C · Estado de la cama tras los eventos del turno

### C1. La tarjeta no refleja el estado FINAL del turno 🟠
Tras registrar extubación o decanulación, el **censo** sigue mostrando TOT/TQT
+ VM (con relojes de dispositivos y días de VM corriendo) hasta que se guarda
el turno siguiente. La réplica sí usa el estado final (correcto), así que no
se arrastran datos malos — pero la grilla miente media jornada y el circuito
no se «limpia» hasta el próximo guardado. **Propuesta:** sincronizar la cama
con `VENT_*_FINAL` al guardar.

---

## D · Pulido de texto y formulario

| # | Detalle | Propuesta |
|---|---------|-----------|
| D1 | «Previo en **vni**…» — el soporte previo va en minúscula | Mantener siglas (VNI, CNAF) en mayúscula |
| D2 | «Se realiza KTM nivel **?**» cuando falta el nivel | Exigir nivel al marcar KTM realizada (u omitir la frase) |
| D3 | TOT **N° 8.0** y fijación **22 cm** vienen preseleccionados y se estampan solos | Partir en «--»: el dato honesto exige que alguien lo escriba |
| D4 | `EVAL_FECHA` usa la fecha real del computador **en UTC**: pasadas las ~20 h de Chile queda fechada al día siguiente; en registro retrospectivo no coincide con el turno | Usar la fecha del turno (gDate) |
| D5 | «TV: PS 8 cmH2O» — el prefijo «TV:» antecede parámetros que no son volumen corriente | Revisar el prefijo del bloque de parámetros |

---

## E · Lo que la simulación confirmó que funciona

- **Ingreso Natural→IOT el mismo turno** (bug v4): texto «Previo en ambiente,
  paciente requiere intubación…» + ambos procedimientos. ✓
- **Autoextubación nocturna + reintubación**: texto completo, cuenta 1
  autoextubación/100 días-VM y NO ensucia el fracaso de extubación (que se
  calcula sobre programadas). ✓
- **Traslado de cama** re-etiqueta el episodio; **reingreso detectado por RUT**
  (indicador reingresos=1). ✓
- **APACHE II**: se captura al ingreso, viaja transitorio (no queda en
  EVOLUCIONES), el egreso solo lo ofrece si falta y el valor del episodio manda
  (P3 lo anotó recién al egreso → quedó 31). ✓
- **Eventos ➕**: procedimiento anexo exige evolución guardada, cambio de HME
  resetea el reloj, cultivo a timeline; **falla de ventilador** deja el equipo
  «Con falla» y el tag rojo en la cama. ✓
- **Auditoría de calidad** detectó el hueco de registro dejado a propósito. ✓
- **Tabla dinámica** sin nombre ni RUT en 25 filas. ✓
- **Cuff**: adherencia 88% con un ajuste anotado (26 cmH2O). ✓
- Los avisos no bloqueantes funcionan: «valores heredados sin revisar»,
  «venía en VM y quedó en O2 sin desvinculación registrada». ✓

**Nota metodológica** que refuerza la meta de adherencia: los días de VM y la
mediana pre-TQT se calculan desde los **turnos registrados** — cada día sin
evolución resta un día de VM a la estadística. Con registro completo son
exactos; con huecos, subcuentan (la auditoría los delata).

---

*Arnés reproducible en `build/sim/` (`node build/sim/sim_e2e.js`); salida cruda
en `build/sim/sim_out.json`. Ningún hallazgo fue corregido en esta pasada: se
esperan las decisiones de Diego.*
