# Manual de uso — RCE-KINE v2 (equipo de Kinesiología UCI)

> Guía práctica para el trabajo de turno. Versión julio 2026, con todas las
> funciones nuevas. Existe una versión ilustrada (HTML con capturas) que se
> comparte al equipo por fuera del repositorio.

## 1. Fecha y turno automáticos
Al abrir, la fecha y el turno se fijan según la hora real: **Día parte a las
09:00** y **Noche a las 21:00** (configurable en CONFIG). La madrugada
pertenece a la noche del día anterior: a las 03:00 del 12, la plataforma
muestra *11 · Noche*. Si la app queda abierta y cruza las 09:00, avanza sola
(si hay una evolución abierta, solo avisa). «Volver a hoy» restaura el turno
vigente desde una vista retrospectiva.

## 2. La grilla de camas
Cada cama es una carpeta: pestaña manila con punto verde (turno evolucionado)
o rojo (pendiente); al evolucionar asoma una hoja blanca. Chips de lectura
rápida: día de estadía, vía aérea, categorización SOCHIMI **R/M**
(Baja/Media/Alta), **🌬️ W. difícil/prolongado** (Boles 2007 desde los PVE),
**🟢 Candidato a PVE** (tamizaje del último turno), **🧬 ICU-AW** (MRC-SS <48
en cooperador), MRC/FSS con fecha o «pendiente», y alertas VM≥14d / ≥21d UCI /
KTMC.

## 3. Ingresar un paciente
Botón *Ingreso* en cama libre. El formulario parte en blanco (vía aérea «-»):
un paciente que llega con TOT se registra directo, sin disparar el bloque de
intubación. Escalas basales con calculadora (Barthel, Charlson, ECF). La
terapia física parte «No realizada: motivo ingreso».

## 4. Evolucionar un turno
Pantalla completa. Replica el turno anterior como punto de partida.
**Se replica**: información general, hemodinamia, ventilatorio, prescripciones
(IMT/EMS), fijación del TOT. **No se replica**: cultivos, procedimientos
puntuales, eventos únicos, pendientes, nota libre, firma.

- **Hemodinamia**: FC categórica (Eucárdico/Taquicárdico/Bradicárdico) +
  checkbox Arritmia con tipo libre. La PAM solo se pide si se marca «Meta PAM».
- **Secreciones**: Características primero; sin características = sin
  secreciones y la Reología queda bloqueada; se desbloquea al elegir una.
- **Dispositivos**: fechas del episodio (mirar otro día no las cambia). HME se
  cambia el día 2; HEPA/Trach Care el día 3. **Humidificación activa** retira
  el filtro HME (campo se vacía y bloquea); al salir de VM el circuito se
  descarta solo.
- **Terapia física**: KTM nivel 1-5 + asistencia + tiempo + Borg. Suspensión
  por alerta: se elige solo el **criterio** (la categoría se infiere). IMT y
  **EMS con parámetros** (Hz, mA, ancho de pulso, tiempo, grupo muscular).
  Movilidad con **IMS 0-10** (selector visual).
- **Evaluaciones**: Fuerza muscular y Funcionalidad visibles; PIM/PEM,
  ecografía y tos/deglución como desplegables. CPAx con leyenda por puntaje.
- **Pendientes del turno**: chips de un clic (CCAET pendiente, progresar
  weaning, pabellón, decanulación…) + texto libre. Son recordatorios para la
  entrega; no se replican ni llevan fecha.
- Al guardar, el servidor genera el **texto clínico definitivo** listo para
  copiar a la ficha.

## 5. Varios pacientes a la vez
El botón **−** minimiza la evolución a una pastilla conservando TODO
(campos, escalas, procedimientos, scroll). Se puede abrir otro paciente y
restaurar después; si cambió el turno mientras tanto, el borrador vuelve a su
fecha/turno original. Cerrar con ✕ descarta el borrador.

## 6. Registro Diario (pestaña 📋)
La sábana del día: una fila por cama con DATOS + TURNO DÍA + TURNO NOCHE
(KTR, KTM, procedimientos, extubación, firma), egresos del día intercalados,
búsqueda, CSV y totales. Borde verde = evolucionado; rojo = pendiente.

## 7. Historial del paciente
Botón *Hist.*: línea de tiempo del episodio (hitos + gráficos ventilatorios y
de rehabilitación, incluida la IMS) y evoluciones completas.

## 8. Estadísticas y REM (pestaña 📊)
Indicadores por rango de fechas + generador del REM mensual (queda guardado
por mes en ESTADISTICAS_REM).

## 9. Entrega de turno (pestaña 📑)
Selección de camas (propias o de un colega), Generar → una ficha por paciente
con: categorización, weaning, candidato a PVE, ICU-AW, eventos fechados
(intubación, PVE, prono/supino con hora, cambios de tubo/cánula), dispositivos
por vencer, último cultivo con microorganismo (o alerta de informe pendiente),
evaluaciones con fecha y pendientes. Imprimible y guardable en historial.

## 10. Archivados (pestaña 🗃️)
Todos los egresos con búsqueda, filtro por fechas y CSV. Clic en una fila →
detalle del episodio con la ficha de egreso y todas las evoluciones.

## 11. Reglas automáticas (resumen)
| Regla | Qué hace sola |
|---|---|
| Turno lógico | Noche = del día en que empezó; avanza sola a las 09:00/21:00 |
| Weaning Boles | ≥1 frustro → difícil; ≥3 o >7 días → prolongado (solo en VM) |
| Candidato a PVE | FiO₂≤50, PEEP≤8, SpO₂≥90, HDN estable, sin BNM |
| ICU-AW | MRC-SS <48 en cooperador; se resuelve con ≥48 |
| Dispositivos | Fechado automático al conectar a VM; humidificación activa excluye HME |
| Procedimientos automáticos | Cultivos, prono/supino, eventos de VA, ecografía, IMT/EMS, evaluación intermedia |
| Categorización SOCHIMI | En vivo; matrices configurables en CAT_MATRICES |
| Respaldo | Copia diaria a Drive (03:00) |
