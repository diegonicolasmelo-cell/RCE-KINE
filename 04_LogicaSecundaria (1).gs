/**
 * ============================================================
 *  04_LogicaSecundaria.gs — [CONSOLIDADO / VACÍO A PROPÓSITO]
 *  ------------------------------------------------------------
 *  Este archivo SOLÍA contener copias de:
 *    · guardarProcedimientos      · obtenerProcedimientos
 *    · _clasificarProcedimiento   · agregarHito
 *    · obtenerTimeline            · _sincronizarTimelineCama
 *    · generarTextoEvolucion      · generarREM   · _remVacio
 *
 *  Todas esas funciones eran DUPLICADOS de una versión más
 *  antigua (v1.0). Las versiones vigentes, corregidas y
 *  optimizadas, viven AHORA EXCLUSIVAMENTE en:
 *        03_ProcTimelineTextoREM.gs
 *
 *  ¿Por qué se vació en vez de borrar el archivo?
 *  En Apps Script todos los .gs comparten el mismo ámbito
 *  global y se cargan en orden alfabético. Como "04_" cargaba
 *  DESPUÉS de "03_", sus copias ANTIGUAS sobreescribían a las
 *  nuevas en tiempo de ejecución. Eso provocaba que corrieran:
 *    - agregarHito SIN bloqueo de concurrencia (riesgo de que
 *      dos kinesiólogos se pisaran al guardar a la vez), y
 *    - _sincronizarTimelineCama con un bug de "deadlock" ya
 *      corregido en 03_ (llamaba a actualizarCama CON lock
 *      estando ya dentro de un lock).
 *
 *  Al dejar este archivo vacío, las definiciones de 03_ quedan
 *  como únicas y se activan las versiones correctas.
 *
 *  ⚠️  NO agregues lógica nueva aquí. Si necesitas tocar
 *      procedimientos, timeline, texto de evolución o REM,
 *      edita 03_ProcTimelineTextoREM.gs.
 *
 *  (Puedes eliminar este archivo por completo de tu proyecto
 *   de Apps Script si prefieres; dejarlo vacío también es
 *   inofensivo.)
 * ============================================================
 */
