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
  'dia_estadia', 'diagnostico', 'edad',
  'via_aerea_tipo', 'tot_numero', 'tot_cm', 'tqt_numero', 'dias_vm', 'dias_va', 'soporte_tipo',
  'modo', 'vt', 'fr', 'ti', 'pmax', 'pmedia', 'peep', 'ppl', 'autopeep', 'ps', 'fio2', 'spo2',
  'pafi', 'sedacion_escalon', 'sas', 'sas_meta', 'gcs', 'cooperacion', 'hdn', 'dva',
  'secr_tipo', 'secr_cantidad'];

const PLANT_NOMBRE_MAX = 40, PLANT_CUERPO_MAX = 4000;

/** Las 13 de la unidad (Diego cerró el catálogo el 2-sep). Se siembran UNA vez. */
const PLANTILLAS_UNIDAD_SEMILLA = [
  ['general', 'Evolución de la unidad', '{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{sedacion} {hemodinamia} {neurologico}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['ingreso', 'Ingreso a la unidad', '{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{sedacion} {hemodinamia} {neurologico}\n{secreciones}\n{evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['vm_nc', 'VM sin destete', '{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{sedacion} {hemodinamia} {neurologico}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['destete_dif', 'Destete diferido', '{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{sedacion} {hemodinamia}\n{secreciones}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['pve_frustra', 'PVE fracasada', '{encabezado}\n{dia} {fase}\n{pve_n} PVE del episodio, {weaning_grado}.\n{pve}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['pve_sup_sin_ext', 'PVE superada sin extubar', '{encabezado}\n{dia} {fase}\n{pve_n} PVE del episodio, {weaning_grado}.\n{pve}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['ext', 'Extubación', '{encabezado}\n{dia} {fase}\n{pve}\n{extubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['post_ext', 'Post-extubación', '{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['reintub', 'Reintubación', '{encabezado}\n{dia} {fase}\n{extubacion}\n{reintubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['intub', 'Intubación', '{encabezado}\n{dia} {fase}\n{intubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['autoext', 'Autoextubación', '{encabezado}\n{dia} {fase}\n{extubacion}\n{reintubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['tqt', 'Traqueostomía', '{encabezado}\n{dia} {fase}\n{tqt}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['destete_tqt', 'Destete por TQT', '{encabezado}\n{dia} {fase}\n{weaning_grado}.\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{secreciones}\n{sedacion} {hemodinamia}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['decan', 'Decanulación', '{encabezado}\n{dia} {fase}\n{decanulacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['prono', 'Prono', '{encabezado}\n{dia} {fase}\n{posicion}\n{via_aerea} {soporte}\n{parametros}\n{gases}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['rehab', 'Rehabilitación', '{encabezado}\n{dia} {fase}\n{evaluaciones}\n{ktm}\n{posicion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{gases}\n{anotaciones}\n{nota}\nPlan: {plan}'],
  ['sin_nov', 'Sin novedades', '{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm} {evaluaciones}\n{anotaciones}\n{nota}\nPlan: {plan}'],
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
