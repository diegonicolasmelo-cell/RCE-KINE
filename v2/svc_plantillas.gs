/**
 * svc_plantillas.gs — Plantillas de evolución (tanda 3, sep-2026,
 * PRD_PLANTILLAS_EVOLUCION.md). v6.04 (Diego, 6-sep): las plantillas nacen
 * desde el cuadro de texto (📋 y ➕ al seleccionar); comodines por BLOQUE y
 * por DATO; la evolución tipo se aplica sola.
 *
 * Una plantilla es DE UNA PERSONA (su firma) o DE LA UNIDAD, y tiene un CASO
 * que la ofrece (PVE fracasada, reintubación, TQT…). Vive en la hoja
 * PLANTILLAS_EVOLUCION — un catálogo aparte: EVOLUCIONES no cambia (NO2 del
 * PRD). El texto se arma en el CLIENTE con los bloques del motor (genTexto
 * etiqueta cada frase con _B) y viaja al servidor como TEXTO_GENERADO, que
 * el guardado ya respeta tal cual: el dato sigue saliendo del único motor.
 *
 * Reglas que se hacen cumplir AQUÍ (por aquí pasa todo, también lo que no
 * venga del navegador):
 *   · Una plantilla de la UNIDAD la publica solo coordinación (sesión viva
 *     en el servidor, como toda acción COORD_*). NO5: un typo guardado se
 *     replica en cada ficha.
 *   · Comodines SOLO del catálogo: uno desconocido rechaza el guardado
 *     (lección TrakCare: un typo = plantilla rota en silencio).
 *   · Nombre legible y caso obligatorios; cuerpo acotado.
 *   · Nadie borra: se desactiva (ACTIVO=false) y queda en la hoja.
 */

const PLANT_CASOS_SRV = ['general', 'ingreso', 'vm_nc', 'destete_dif', 'pve_frustra', 'pve_sup_sin_ext', 'ext',
  'post_ext', 'reintub', 'intub', 'autoext', 'tqt', 'destete_tqt', 'decan', 'prono', 'rehab', 'sin_nov'];

// 🔴 MISMA LISTA que PLANT_COMODINES del cliente (la guardia las compara).
const PLANT_COMODINES_SRV = ['encabezado', 'dia', 'fase', 'via_aerea', 'soporte', 'parametros',
  'pve', 'pve_n', 'weaning_grado', 'secreciones', 'sedacion', 'hemodinamia', 'neurologico',
  'reintubacion', 'extubacion', 'tqt', 'decanulacion', 'ktm', 'evaluaciones', 'posicion',
  'gases', 'anotaciones', 'plan', 'nota', 'relato',
  'intubacion', 'desvinculacion', 'aislamiento', 'auscultacion', 'cultivos', 'inhalo', 'vfon',
  'imt', 'ems', 'educacion',
  'aet', 'reingreso', 'upot',
  'dia_estadia', 'diagnostico', 'edad',
  'via_aerea_tipo', 'tot_numero', 'tot_cm', 'tqt_numero', 'dias_vm', 'dias_va', 'soporte_tipo',
  'modo', 'vt', 'fr', 'ti', 'pmax', 'pmedia', 'peep', 'ppl', 'autopeep', 'ps', 'fio2', 'spo2',
  'pafi', 'sedacion_escalon', 'sas', 'sas_meta', 'gcs', 'cooperacion', 'hdn', 'dva',
  'secr_tipo', 'secr_cantidad',
  'gcs_o', 'gcs_v', 'gcs_m', 's5q', 'camicu', 'mp', 'ruidos',
  'ph', 'paco2', 'pao2', 'hco3', 'eb', 'lactato', 'sato2', 'mrc', 'fss', 'pimax',
  'dias_tot', 'dias_tqt', 'dva_n', 'ipap', 'epap', 'flujo', 'litros', 'uma'];

const PLANT_NOMBRE_MAX = 40, PLANT_CUERPO_MAX = 4000;

/* 🪤 7-sep-2026, Manuel desde el turno: «la sedoanalgesia, GCS y hemodinamia
   quedó al penúltimo punto, sobre PLAN». EL ORDEN DEL TEXTO VIVE EN DOS SITIOS:
   el motor (genTexto/_B en index.html y su espejo generarTextoEvolucion en
   dominio_texto.gs) Y el cuerpo de cada plantilla de aquí abajo. Desde v6.02 la
   plantilla de la UNIDAD se aplica SOLA, así que es ELLA la que ordena lo que
   lee el turno. Estas semillas ponían el bloque neuro-hemodinámico debajo de la
   vía aérea, el soporte y los parámetros; como _plantRellenar() descarta las
   líneas sin valor, en un turno tranquilo terminaba pegado al Plan.
   Ahora va donde lo pone el motor: justo después del día y la fase.

   🪤 7-sep-2026, DOS LÍNEAS Y NO UNA — decisión clínica de Manuel: el GCS y la
   hemodinamia se ven SIEMPRE. La línea de {sedacion} NO es condicional y no
   puede serlo: el motor la emite en TODO turno, y en uno sin sedoanalgesia
   escribe «Sin sedoanalgesia. GCS 15/15 (O:4, V:5, M:6).» — el Glasgow viaja
   dentro de ella (dominio_texto.gs: sedStr += ` GCS ...`, sin condición).
   Ojo con dónde vive cada dato, porque no es donde parece:
     {sedacion}    = bloque `sed` del motor, que junta sedoanalgesia + GCS +
                     cooperación + CAM-ICU EN UNA SOLA LÍNEA. Por eso {sedacion}
                     NO puede compartir línea con nadie ni volverse condicional:
                     esconderla esconde el GCS de Manuel.
     {hemodinamia} = bloque `hdn`. El motor lo emite siempre.
     {neurologico} = NEUROMONITOREO (PIC, PPC, DVE). NO es el GCS, y viene vacío
                     en casi todos los pacientes.
   Como _plantRellenar() bota la línea cuyos comodines vienen TODOS vacíos, el
   neuromonitoreo viaja acompañado de la hemodinamia: la línea sobrevive por
   {hemodinamia} y el neuromonitoreo se suma solo cuando existe.
   Al tocar este catálogo, correr build/checks/orden_neuro_en_plantillas.js.
   ⚠️ CAMBIAR LA SEMILLA NO CAMBIA LO SEMBRADO: plantillasSembrarUnidad() solo
   escribe si PLANTILLAS_EVOLUCION está vacía. En una unidad que ya las tiene,
   el orden nuevo lo lleva la RE-SIEMBRA del final de este archivo
   (plantillasResembrarSimular → plantillasResembrarAplicarAhora), que respeta
   lo que coordinación haya editado a mano. Y el cuerpo que sale de la semilla
   hay que MOVERLO a PLANTILLAS_UNIDAD_PUBLICADAS, o la re-siembra siguiente
   creerá que lo escribió coordinación y no tocará nada. */
/** Las 17 de la unidad (Diego cerró el catálogo el 2-sep). Se siembran UNA vez. */
const PLANTILLAS_UNIDAD_SEMILLA = [
  ['general', 'Evolución de la unidad', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['ingreso', 'Ingreso a la unidad', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['vm_nc', 'VM sin destete', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['destete_dif', 'Destete diferido', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['pve_frustra', 'PVE fracasada', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{pve_n} PVE del episodio, {weaning_grado}.\n{pve}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['pve_sup_sin_ext', 'PVE superada sin extubar', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{pve_n} PVE del episodio, {weaning_grado}.\n{pve}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['ext', 'Extubación', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{pve}\n{extubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['post_ext', 'Post-extubación', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['reintub', 'Reintubación', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{extubacion}\n{reintubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['intub', 'Intubación', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{intubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['autoext', 'Autoextubación', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{extubacion}\n{reintubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['tqt', 'Traqueostomía', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{tqt}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['destete_tqt', 'Destete por TQT', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{weaning_grado}.\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['decan', 'Decanulación', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{decanulacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['prono', 'Prono', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{posicion}\n{via_aerea} {soporte}\n{parametros}\n{gases}\n{secreciones}\n{ktm} {evaluaciones}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['rehab', 'Rehabilitación', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{evaluaciones}\n{ktm}\n{posicion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['sin_nov', 'Sin novedades', '{encabezado}\n{dia} {fase}\n{sedacion}\n{hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{anotaciones}\n{nota}\nPlan: {plan}'],
];

/** Siembra las de la unidad si la hoja está vacía (la llama crearORepararEstructura). */
function plantillasSembrarUnidad() {
  try {
    if (repoLeerTodos('PLANTILLAS_EVOLUCION').length) return 0;
    const filas = PLANTILLAS_UNIDAD_SEMILLA.map(function (t, i) {
      return { ID: 'plu_' + t[0], DUENO: 'UNIDAD', CASO: t[0], NOMBRE: t[1], CUERPO: t[2], ACTIVO: true,
        ORDEN: i + 1, ACTUALIZADO: ahoraTS(), ACTUALIZADO_POR: 'sistema' };
    });
    repoInsertarVarios('PLANTILLAS_EVOLUCION', filas);
    return filas.length;
  } catch (e) { console.warn('plantillasSembrarUnidad: ' + e.message); return 0; }
}

/** Catálogo activo, tal como lo consume la barra (viaja en GET_BOOT). */
function plantillasListar() {
  try {
    return repoLeerTodos('PLANTILLAS_EVOLUCION')
      .filter(function (p) { return esVerdadero(p.ACTIVO); })
      .sort(function (a, b) { return (parseInt(a.ORDEN) || 0) - (parseInt(b.ORDEN) || 0); })
      .map(function (p) {
        return { id: String(p.ID), dueno: String(p.DUENO || ''), caso: String(p.CASO || 'general'),
          nombre: String(p.NOMBRE || ''), cuerpo: String(p.CUERPO || ''), activo: true,
          actualizado: String(p.ACTUALIZADO || ''), por: String(p.ACTUALIZADO_POR || '') };
      });
  } catch (e) { return []; }
}

/** Comodines desconocidos en un cuerpo ('' si todos existen). */
function _plantComodinesMalos(cuerpo) {
  const malos = [];
  String(cuerpo || '').replace(/\{([^{}]*)\}/g, function (m, k) {
    if (PLANT_COMODINES_SRV.indexOf(String(k).trim().toLowerCase()) === -1) malos.push('{' + k + '}');
    return m;
  });
  return malos.join(', ');
}

/**
 * plantillaGuardar — crea o edita. datos: {id?, dueno, caso, nombre, cuerpo, token?}
 * Sin login no hay cómo probar que quien manda «MCC» es MCC: la firma es la
 * misma confianza con la que se firma la evolución. Lo de la UNIDAD sí exige
 * la clave de coordinación.
 */
function plantillaGuardar(datos, ctx) {
  return conLock(function () {
    try {
      datos = datos || {};
      const dueno = String(datos.dueno || '').trim().toUpperCase();
      const caso = String(datos.caso || 'general').trim();
      const nombre = String(datos.nombre || '').trim();
      const cuerpo = String(datos.cuerpo || '').replace(/\r/g, '');
      if (!dueno || dueno.length > 15) return err('Falta la firma dueña de la plantilla.', ERR.VALIDACION);
      if (!nombre) return err('Ponle un nombre a la plantilla.', ERR.VALIDACION);
      if (nombre.length > PLANT_NOMBRE_MAX) return err('El nombre es muy largo (máx. ' + PLANT_NOMBRE_MAX + ').', ERR.VALIDACION);
      if (!cuerpo.trim()) return err('La plantilla está vacía.', ERR.VALIDACION);
      if (cuerpo.length > PLANT_CUERPO_MAX) return err('La plantilla es muy larga (máx. ' + PLANT_CUERPO_MAX + ' caracteres).', ERR.VALIDACION);
      if (PLANT_CASOS_SRV.indexOf(caso) === -1) return err('Caso desconocido: ' + caso, ERR.VALIDACION);
      const malos = _plantComodinesMalos(cuerpo);
      if (malos) return err('Comodín desconocido: ' + malos + '. Los comodines se eligen del menú, no se escriben.', ERR.VALIDACION);
      if (!/\{[a-z0-9_]+\}/i.test(cuerpo)) return err('La plantilla no trae ningún comodín: sería el mismo texto para todos los pacientes.', ERR.VALIDACION);

      let firma = '';
      if (dueno === 'UNIDAD') {
        const g = coordExigirSesion(datos.token);
        if (!g.ok) return g;
        firma = g.firma;
      }
      const id = String(datos.id || '').trim();
      let previa = null;
      if (id) {
        previa = repoBuscarPorId('PLANTILLAS_EVOLUCION', 'ID', id);
        if (!previa) return err('Esa plantilla ya no existe.', ERR.NO_ENCONTRADO);
        // Editar la de OTRO colega no se puede: se copia como propia (lo hace
        // el cliente). Aquí se rechaza por si llega por otra vía.
        if (String(previa.DUENO) !== dueno) return err('No puedes editar la plantilla de otra persona: cópiala como tuya.', ERR.NO_AUTORIZADO);
      }
      const fila = {
        ID: id || uid('pl'), DUENO: dueno, CASO: caso, NOMBRE: nombre, CUERPO: cuerpo, ACTIVO: true,
        ORDEN: previa ? previa.ORDEN : (repoLeerTodos('PLANTILLAS_EVOLUCION').length + 1),
        ACTUALIZADO: ahoraTS(), ACTUALIZADO_POR: firma || dueno,
      };
      repoUpsert('PLANTILLAS_EVOLUCION', 'ID', fila.ID, fila);
      return ok({ id: fila.ID, plantilla: { id: fila.ID, dueno: dueno, caso: caso, nombre: nombre, cuerpo: cuerpo, activo: true,
        actualizado: fila.ACTUALIZADO, por: fila.ACTUALIZADO_POR }, accion: previa ? 'plantilla_editada' : 'plantilla_creada', entidad: 'PLANTILLAS_EVOLUCION' });
    } catch (e) { return err('plantillaGuardar: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Retira una plantilla (ACTIVO=false; nada se borra). La propia, o la de la unidad con clave. */
function plantillaDesactivar(datos) {
  return conLock(function () {
    try {
      datos = datos || {};
      const id = String(datos.id || '').trim();
      const p = id ? repoBuscarPorId('PLANTILLAS_EVOLUCION', 'ID', id) : null;
      if (!p) return err('Esa plantilla no existe.', ERR.NO_ENCONTRADO);
      const dueno = String(datos.dueno || '').trim().toUpperCase();
      if (String(p.DUENO) === 'UNIDAD') {
        const g = coordExigirSesion(datos.token);
        if (!g.ok) return g;
      } else if (String(p.DUENO) !== dueno) {
        return err('Solo el dueño de la plantilla puede retirarla.', ERR.NO_AUTORIZADO);
      }
      repoActualizar('PLANTILLAS_EVOLUCION', 'ID', id, { ACTIVO: false, ACTUALIZADO: ahoraTS(), ACTUALIZADO_POR: dueno || 'coordinacion' });
      return ok({ id: id, accion: 'plantilla_retirada', entidad: 'PLANTILLAS_EVOLUCION' });
    } catch (e) { return err('plantillaDesactivar: ' + e.message, ERR.INTERNO, e); }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   RE-SIEMBRA DE LAS PLANTILLAS DE LA UNIDAD (7-sep-2026)
   ═══════════════════════════════════════════════════════════════════════════
   EL PROBLEMA. plantillasSembrarUnidad() solo escribe si PLANTILLAS_EVOLUCION
   está VACÍA. En la unidad ya está sembrada desde v6.02, así que cambiar
   PLANTILLAS_UNIDAD_SEMILLA arriba NO cambia una sola letra de lo que lee el
   turno. El orden nuevo (sedoanalgesia/GCS/hemodinamia arriba, reporte de
   Manuel del 7-sep) necesita una rutina que ACTUALICE lo ya sembrado.

   EL ALCANCE, Y POR QUÉ ES ESE. Una plantilla de la unidad la puede haber
   editado coordinación desde la app, y ese trabajo NO puede perderse en
   silencio (es la misma clase de error que esconder una pronación real). Así
   que la rutina NO reemplaza «todas»: reemplaza solo las que están **intactas
   desde que se sembraron**, y lo demuestra comparando el cuerpo actual contra
   los cuerpos que ESTE repositorio publicó alguna vez
   (PLANTILLAS_UNIDAD_PUBLICADAS, abajo). Si el cuerpo de la hoja no es
   ninguno de ellos, alguien lo escribió a mano: se salta y se informa.

   No se usa ACTUALIZADO_POR='sistema' como prueba de «intacta»: una edición
   que cambie solo el NOMBRE ya lo pisa, y entonces la rutina saltaría una
   plantilla cuyo cuerpo sí había que corregir. El cuerpo se compara con el
   cuerpo — es el dato que se va a sobrescribir.

   LO QUE NO TOCA, POR DISEÑO:
     · Nada cuyo ID no sea 'plu_<caso>' de la semilla → las plantillas
       PERSONALES (DUENO = firma del kine) quedan fuera por construcción, y
       además se verifica DUENO === 'UNIDAD' antes de escribir. La distinción
       existe en el modelo: columna DUENO de PLANTILLAS_EVOLUCION.
     · Las retiradas (ACTIVO=false): reactivarlas sería revertir una decisión
       de coordinación sin que nadie lo pida.
     · NOMBRE, CASO, ORDEN, DUENO, ACTIVO. Solo se escribe CUERPO (más el
       sello ACTUALIZADO/ACTUALIZADO_POR). Menos superficie, menos daño.

   IDEMPOTENTE. Lo que decide es el cuerpo, no una marca ni una fecha: en la
   segunda corrida las 17 ya tienen el cuerpo nuevo, caen en 'al_dia' y no se
   escribe NADA (tampoco se crea respaldo, porque no hay nada que respaldar).

   REVERSIBLE. Antes de la primera escritura copia la hoja entera a
   PLANTILLAS_BAK_<yyyyMMdd_HHmmss> (oculta) y verifica que la copia sea
   idéntica; si el respaldo falla, no escribe nada. plantillasRestaurarDesde()
   vuelve atrás.

   CÓMO SE CORRE (desde el editor de Apps Script, en este orden):
     1) plantillasResembrarSimular()      → no escribe; dice qué haría.
     2) plantillasResembrarAplicarAhora() → respalda y escribe.
     3) plantillasRestaurarDesde('PLANTILLAS_BAK_...')  ← solo si hay que volver.
   Guardia: build/checks/resiembra_plantillas.js                              */

/** Prefijo de las hojas de respaldo. Fuera de ESQUEMA a propósito: son hojas
 *  libres, crearORepararEstructura no las administra y testEsquema no las ve. */
const PLANT_BAK_PREFIJO = 'PLANTILLAS_BAK_';

/**
 * Cuerpos que ESTE repositorio publicó alguna vez para cada caso, distintos
 * del vigente. Una plantilla cuyo cuerpo está aquí nunca fue editada a mano.
 * 🔴 AL CAMBIAR PLANTILLAS_UNIDAD_SEMILLA hay que mover el cuerpo saliente a
 * esta tabla, o la re-siembra siguiente creerá que coordinación lo escribió y
 * saltará las 17. La guardia resiembra_plantillas.js lo comprueba.
 */
const PLANTILLAS_UNIDAD_PUBLICADAS = {
  "general": [
    "{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{sedacion} {hemodinamia} {neurologico}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "ingreso": [
    "{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{sedacion} {hemodinamia} {neurologico}\n{secreciones}\n{evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "vm_nc": [
    "{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{sedacion} {hemodinamia} {neurologico}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "destete_dif": [
    "{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{sedacion} {hemodinamia}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia}\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "pve_frustra": [
    "{encabezado}\n{dia} {fase}\n{pve_n} PVE del episodio, {weaning_grado}.\n{pve}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia}\n{pve_n} PVE del episodio, {weaning_grado}.\n{pve}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "pve_sup_sin_ext": [
    "{encabezado}\n{dia} {fase}\n{pve_n} PVE del episodio, {weaning_grado}.\n{pve}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia}\n{pve_n} PVE del episodio, {weaning_grado}.\n{pve}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "ext": [
    "{encabezado}\n{dia} {fase}\n{pve}\n{extubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{pve}\n{extubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "post_ext": [
    "{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "reintub": [
    "{encabezado}\n{dia} {fase}\n{extubacion}\n{reintubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{extubacion}\n{reintubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "intub": [
    "{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{intubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{intubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "autoext": [
    "{encabezado}\n{dia} {fase}\n{extubacion}\n{reintubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{extubacion}\n{reintubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "tqt": [
    "{encabezado}\n{dia} {fase}\n{tqt}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{tqt}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "destete_tqt": [
    "{encabezado}\n{dia} {fase} {weaning_grado}.\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{secreciones}\n{sedacion} {hemodinamia}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{weaning_grado}.\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{secreciones}\n{sedacion} {hemodinamia}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia}\n{weaning_grado}.\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "decan": [
    "{encabezado}\n{dia} {fase}\n{decanulacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{decanulacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "prono": [
    "{encabezado}\n{dia} {fase}\n{posicion}\n{via_aerea} {soporte}\n{parametros}\n{gases}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{posicion}\n{via_aerea} {soporte}\n{parametros}\n{gases}\n{secreciones}\n{ktm} {evaluaciones}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "rehab": [
    "{encabezado}\n{dia} {fase}\n{evaluaciones}\n{ktm}\n{posicion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
    "{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{evaluaciones}\n{ktm}\n{posicion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],
  "sin_nov": [
    "{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{anotaciones}\n{nota}\nPlan: {plan}",
  ],

};

/** Comparación de cuerpos: Sheets no toca el texto, pero un \r de copiar y
 *  pegar no puede hacer que una plantilla intacta parezca editada. */
function _plantNorm(t) {
  return String(t == null ? '' : t).replace(/\r/g, '').trim();
}

/**
 * Copia PLANTILLAS_EVOLUCION a una hoja nueva y comprueba que la copia sea
 * idéntica. Devuelve el nombre. Lanza si algo no cuadra: quien llama NO debe
 * escribir si esto falla.
 */
function _plantRespaldar() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const orig = ss.getSheetByName('PLANTILLAS_EVOLUCION');
  if (!orig) throw new Error('No existe la hoja PLANTILLAS_EVOLUCION (corre crearORepararEstructura).');
  const nombre = PLANT_BAK_PREFIJO + Utilities.formatDate(new Date(), _tz(), 'yyyyMMdd_HHmmss');
  if (ss.getSheetByName(nombre)) throw new Error('Ya existe la hoja ' + nombre + ': espera un segundo y repite.');
  const copia = orig.copyTo(ss).setName(nombre);
  const a = orig.getDataRange().getValues(), b = copia.getDataRange().getValues();
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    ss.deleteSheet(copia);
    throw new Error('El respaldo no salió idéntico al original: no se escribió nada.');
  }
  copia.hideSheet();
  return nombre;
}

/**
 * Vuelve atrás: repone por ID lo que guarda una hoja de respaldo.
 * No borra las plantillas creadas después del respaldo (repone, no reemplaza
 * la hoja), y es idempotente: lo que ya coincide no se vuelve a escribir.
 * ⚠️ ACTUALIZADO puede volver sin la hora si Sheets guardó la celda como
 * fecha; es un campo informativo y no cambia qué plantilla se aplica.
 */
function plantillasRestaurarDesde(nombreHoja) {
  return conLock(function () {
    try {
      const nombre = String(nombreHoja || '').trim();
      if (nombre.indexOf(PLANT_BAK_PREFIJO) !== 0) {
        return err('Eso no es un respaldo de plantillas: ' + (nombre || '(vacío)') + '. Debe empezar con ' + PLANT_BAK_PREFIJO, ERR.VALIDACION);
      }
      const h = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nombre);
      if (!h) return err('No existe la hoja de respaldo ' + nombre + '.', ERR.NO_ENCONTRADO);
      const fi = FILA_DATOS.PLANTILLAS_EVOLUCION, total = TOTAL_COLS.PLANTILLAS_EVOLUCION, ult = h.getLastRow();
      if (ult < fi) return err('El respaldo ' + nombre + ' no tiene filas.', ERR.VALIDACION);
      const filas = h.getRange(fi, 1, ult - fi + 1, total).getValues();
      const repuestas = [], iguales = [];
      for (let i = 0; i < filas.length; i++) {
        const o = esquemaFilaAObjeto('PLANTILLAS_EVOLUCION', filas[i]);
        const id = String(o.ID || '').trim();
        if (!id) continue;
        const viva = repoBuscarPorId('PLANTILLAS_EVOLUCION', 'ID', id);
        if (viva && _plantNorm(viva.CUERPO) === _plantNorm(o.CUERPO) &&
            String(viva.NOMBRE || '') === String(o.NOMBRE || '') &&
            esVerdadero(viva.ACTIVO) === esVerdadero(o.ACTIVO)) { iguales.push(id); continue; }
        repoUpsert('PLANTILLAS_EVOLUCION', 'ID', id, o);
        repuestas.push(id);
      }
      console.log('↩️ Restauradas desde ' + nombre + ': ' + repuestas.length +
        ' repuestas, ' + iguales.length + ' ya estaban iguales.');
      return ok({ respaldo: nombre, repuestas: repuestas, iguales: iguales.length,
        accion: 'plantillas_restauradas', entidad: 'PLANTILLAS_EVOLUCION' });
    } catch (e) { return err('plantillasRestaurarDesde: ' + e.message, ERR.INTERNO, e); }
  });
}

/**
 * El plan de re-siembra. `aplicar=false` no escribe una sola celda.
 * Devuelve ok({...}) con el detalle de qué se tocó, qué se saltó y por qué.
 */
function _plantResembrar(aplicar) {
  return conLock(function () {
    try {
      const vivas = repoLeerTodos('PLANTILLAS_EVOLUCION');
      if (!vivas.length) {
        return err('La hoja está vacía: esto no es una re-siembra, es una siembra. Corre plantillasSembrarUnidad().', ERR.VALIDACION);
      }
      const porId = {};
      for (let i = 0; i < vivas.length; i++) porId[String(vivas[i].ID || '').trim()] = vivas[i];

      const plan = [];
      PLANTILLAS_UNIDAD_SEMILLA.forEach(function (t) {
        const caso = t[0], nombre = t[1], cuerpo = t[2], id = 'plu_' + caso;
        const p = porId[id];
        if (!p) { plan.push({ id: id, caso: caso, accion: 'sembrar', motivo: 'no está en la hoja', cuerpo: cuerpo, nombre: nombre }); return; }
        if (String(p.DUENO || '').trim().toUpperCase() !== 'UNIDAD') {
          plan.push({ id: id, caso: caso, accion: 'saltar', motivo: 'esa fila ya no es de la unidad (DUENO distinto de UNIDAD)' }); return;
        }
        if (!esVerdadero(p.ACTIVO)) {
          plan.push({ id: id, caso: caso, accion: 'saltar', motivo: 'retirada por coordinación (ACTIVO=false); reactivarla no me toca' }); return;
        }
        const act = _plantNorm(p.CUERPO);
        if (act === _plantNorm(cuerpo)) { plan.push({ id: id, caso: caso, accion: 'al_dia', motivo: 'ya tiene el orden nuevo' }); return; }
        const previos = (PLANTILLAS_UNIDAD_PUBLICADAS[caso] || []).map(_plantNorm);
        if (previos.indexOf(act) === -1) {
          plan.push({ id: id, caso: caso, accion: 'saltar',
            motivo: 'editada a mano: su cuerpo no es ninguno de los ' + previos.length + ' que publicó el repositorio (última edición: ' + (p.ACTUALIZADO || 'sin fecha') + ')' });
          return;
        }
        plan.push({ id: id, caso: caso, accion: 'actualizar', motivo: 'intacta desde que se sembró', cuerpo: cuerpo });
      });

      // Filas plu_* que la semilla ya no contempla: se informan, no se tocan.
      Object.keys(porId).forEach(function (id) {
        if (id.indexOf('plu_') !== 0) return;
        for (let i = 0; i < PLANTILLAS_UNIDAD_SEMILLA.length; i++) {
          if ('plu_' + PLANTILLAS_UNIDAD_SEMILLA[i][0] === id) return;
        }
        plan.push({ id: id, caso: String(porId[id].CASO || ''), accion: 'saltar', motivo: 'no le corresponde ninguna semilla de hoy' });
      });

      const aEscribir = plan.filter(function (x) { return x.accion === 'actualizar' || x.accion === 'sembrar'; });
      let respaldo = '';
      if (aplicar && aEscribir.length) {
        respaldo = _plantRespaldar();      // si esto lanza, no se escribe nada
        const sello = ahoraTS();
        let extra = 0;
        aEscribir.forEach(function (x) {
          if (x.accion === 'sembrar') {
            repoInsertar('PLANTILLAS_EVOLUCION', {
              ID: x.id, DUENO: 'UNIDAD', CASO: x.caso, NOMBRE: x.nombre, CUERPO: x.cuerpo,
              ACTIVO: true, ORDEN: vivas.length + 1 + (extra++), ACTUALIZADO: sello, ACTUALIZADO_POR: 'resiembra' });
          } else {
            repoActualizar('PLANTILLAS_EVOLUCION', 'ID', x.id,
              { CUERPO: x.cuerpo, ACTUALIZADO: sello, ACTUALIZADO_POR: 'resiembra' });
          }
        });
      }

      const lista = function (a) { return plan.filter(function (x) { return x.accion === a; }); };
      const inf = {
        aplicado: !!aplicar, respaldo: respaldo,
        actualizadas: lista('actualizar').map(function (x) { return x.caso; }),
        sembradas: lista('sembrar').map(function (x) { return x.caso; }),
        alDia: lista('al_dia').map(function (x) { return x.caso; }),
        saltadas: lista('saltar').map(function (x) { return { id: x.id, motivo: x.motivo }; }),
      };
      console.log((aplicar ? '📋 RE-SIEMBRA APLICADA' : '📋 SIMULACRO (no se escribió nada)') +
        (respaldo ? ' · respaldo: ' + respaldo : '') +
        '\n   ' + (aplicar ? 'actualizadas' : 'se actualizarían') + ': ' + (inf.actualizadas.join(', ') || 'ninguna') +
        '\n   ' + (aplicar ? 'sembradas' : 'se sembrarían') + ': ' + (inf.sembradas.join(', ') || 'ninguna') +
        '\n   ya al día: ' + (inf.alDia.join(', ') || 'ninguna') +
        '\n   saltadas: ' + (inf.saltadas.length || 'ninguna'));
      inf.saltadas.forEach(function (s) { console.log('   ⏭️ ' + s.id + ' — ' + s.motivo); });
      return ok(inf);
    } catch (e) { return err('_plantResembrar: ' + e.message, ERR.INTERNO, e); }
  });
}

/** Dice qué haría la re-siembra. NO escribe nada. Correr SIEMPRE esta primero. */
function plantillasResembrarSimular() { return _plantResembrar(false); }

/** ⚠️ ESCRIBE. Respalda y actualiza las plantillas de la unidad que estén intactas. */
function plantillasResembrarAplicarAhora() { return _plantResembrar(true); }
