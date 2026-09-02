/**
 * prototipo_plantillas.js — Arma la PÁGINA DE PRUEBA del prototipo de plantillas
 * de evolución: el index real + un puente google.script.run simulado con una
 * unidad de mentira (4 camas ocupadas, sin datos reales) + el catálogo de
 * plantillas en memoria. Sirve para VERLO EN VIVO sin tocar producción ni el
 * editor de Apps Script (Diego, 2-sep-2026: «verlo en vivo pero que no tope
 * nada de lo hecho por Manuel»).
 *
 * Sale en formato cohete (cargador + base64) SIN doctype/html/head/body, para
 * publicarla como artefacto. Nada se persiste: recargar la página lo resetea.
 *
 * Uso: node build/prototipo_plantillas.js [salida.html]
 */
const fs = require('fs');
const path = require('path');

const fuente = path.join(__dirname, '..', 'v2', 'index.html');
const salida = process.argv[2] || path.join(__dirname, 'prototipo_plantillas.html');

// ── El puente simulado y los datos de mentira (corren en el navegador) ────
const STUB = String.raw`
<script>
window.__PROTO = true;
// Catálogo de plantillas del prototipo: dos colegas con las suyas, el juego de
// la unidad de respaldo, y una de otro colega para ver el tercer estante.
window.__PROTO_PLANTILLAS = [
  // ── EVOLUCIONES TIPO (tipo:'base') · la que sale sola, sin apretar nada ──
  { id:'b_unidad', dueno:'UNIDAD', tipo:'base', caso:'general', nombre:'Evolución tipo de la unidad',
    cuerpo:'{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{relato}\n{ktm} {evaluaciones}\nPlan: {plan}\n{nota}' },
  { id:'b_mcc', dueno:'MCC', tipo:'base', caso:'general', nombre:'Mi evolución tipo',
    cuerpo:'{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{relato}\n{ktm} {evaluaciones}\n{posicion}\nPlan: {plan}\n{nota}' },
  { id:'b_dmv', dueno:'DMV', tipo:'base', caso:'general', nombre:'Evolución tipo DMV',
    cuerpo:'{encabezado}\n{dia}\n{soporte} {parametros}\n{via_aerea}\n{secreciones}\n{relato}\n{sedacion}\n{ktm} {evaluaciones}\nPlan: {plan}' },
  // ── FRAGMENTOS DE RELATO (tipo:'frag') · un párrafo, no otra evolución ──
  // El caso dictado por Diego (2-sep): autoextubación seguida de reintubación
  // en el mismo turno. Se encadenan solos, en orden de hora.
  { id:'f_autoext_mcc', dueno:'MCC', tipo:'frag', caso:'autoext', nombre:'Autoextubación',
    cuerpo:'Durante el turno cursa agitación psicomotora, sin alcanzar los objetivos de sedación pese a contención farmacológica. Se autoextuba a las {hora} hrs.' },
  { id:'f_reintub_mcc', dueno:'MCC', tipo:'frag', caso:'reintub', nombre:'Reintubación',
    cuerpo:'Evoluciona de forma desfavorable, por lo que requiere reintubación a las {hora} hrs. Se informa a médico tratante y se registra en la ficha.' },
  { id:'f_pve_mcc', dueno:'MCC', tipo:'frag', caso:'pve_frustra', nombre:'PVE fracasada',
    cuerpo:'{pve_n} PVE del episodio, {weaning_grado}. {pve}\nSe mantiene sedestación y trabajo de musculatura respiratoria según tolerancia.' },
  { id:'f_dest_mcc', dueno:'MCC', tipo:'frag', caso:'destete_dif', nombre:'Destete diferido',
    cuerpo:'{pve}\nSe reevalúa condición para PVE en el próximo turno.' },
  { id:'f_autoext_u', dueno:'UNIDAD', tipo:'frag', caso:'autoext', nombre:'Autoextubación',
    cuerpo:'{extubacion}' },
  { id:'f_reintub_u', dueno:'UNIDAD', tipo:'frag', caso:'reintub', nombre:'Reintubación',
    cuerpo:'{reintubacion}' },
  { id:'f_ext_u', dueno:'UNIDAD', tipo:'frag', caso:'ext', nombre:'Extubación', cuerpo:'{extubacion}' },
  { id:'f_pve_u', dueno:'UNIDAD', tipo:'frag', caso:'pve_frustra', nombre:'PVE fracasada', cuerpo:'{pve}' },
  { id:'f_vmnc_u', dueno:'UNIDAD', tipo:'frag', caso:'vm_nc', nombre:'VM sin destete', cuerpo:'{pve}' },
  { id:'f_dest_u', dueno:'UNIDAD', tipo:'frag', caso:'destete_dif', nombre:'Destete diferido', cuerpo:'{pve}' },
  { id:'f_tqt_u', dueno:'UNIDAD', tipo:'frag', caso:'tqt', nombre:'TQT', cuerpo:'{tqt}' },
  { id:'f_intub_u', dueno:'UNIDAD', tipo:'frag', caso:'intub', nombre:'Intubación', cuerpo:'{intubacion}' },
  { id:'f_decan_u', dueno:'UNIDAD', tipo:'frag', caso:'decan', nombre:'Decanulación', cuerpo:'{decanulacion}' },
  { id:'f_prono_u', dueno:'UNIDAD', tipo:'frag', caso:'prono', nombre:'Prono', cuerpo:'{posicion}' },
  // ── Plantillas por caso del PRIMER modo (se usan con «Una plantilla por caso») ──
  { id:'u_general', tipo:'caso', dueno:'UNIDAD', caso:'general', nombre:'Evolución estándar', cuerpo:'' },
  { id:'u_ingreso', tipo:'caso', dueno:'UNIDAD', caso:'ingreso', nombre:'Ingreso a UCI',
    cuerpo:'{encabezado}\n{dia}\n{aislamiento}\n{fase}\n{sedacion} {hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{ktm}\n{evaluaciones}\nPlan: {plan}' },
  { id:'u_pve_frustra', tipo:'caso', dueno:'UNIDAD', caso:'pve_frustra', nombre:'PVE fracasada',
    cuerpo:'{encabezado}\n{dia} {fase}\n{pve}\n{soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia}\n{ktm} {evaluaciones}\nPlan: {plan}' },
  { id:'mcc_general', tipo:'caso', dueno:'MCC', caso:'general', nombre:'Mi evolución de siempre',
    cuerpo:'{encabezado}\n{dia} {fase}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia} {neurologico}\n{ktm} {evaluaciones}\n{posicion}\nPlan: {plan}\n{nota}' },
  { id:'mcc_pve_frustra', tipo:'caso', dueno:'MCC', caso:'pve_frustra', nombre:'PVE fracasada',
    cuerpo:'{encabezado}\n{dia} {fase}\n{pve_n} PVE del episodio, {weaning_grado}.\n{pve}\n{soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia}\n{ktm}\n{evaluaciones}\nSe mantiene sedestación y trabajo de musculatura respiratoria según tolerancia.\nPlan: {plan}' },
  { id:'mcc_destete_dif', tipo:'caso', dueno:'MCC', caso:'destete_dif', nombre:'Destete diferido',
    cuerpo:'{encabezado}\n{dia} {fase}\n{soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia}\n{ktm}\nSe reevalúa condición para PVE en el próximo turno.\nPlan: {plan}' },
  { id:'mcc_reintub', tipo:'caso', dueno:'MCC', caso:'reintub', nombre:'Reintubación',
    cuerpo:'{encabezado}\n{dia}\n{reintubacion}\n{extubacion}\n{via_aerea} {soporte}\n{parametros}\n{secreciones}\n{sedacion} {hemodinamia}\nSe informa a médico tratante y se registra en la ficha.\nPlan: {plan}' },
  { id:'mcc_vm_nc', tipo:'caso', dueno:'MCC', caso:'vm_nc', nombre:'VM sin destete',
    cuerpo:'{encabezado}\n{dia} {fase}\n{sedacion} {hemodinamia} {neurologico}\n{via_aerea} {soporte}\n{parametros}\n{pve}\n{secreciones}\n{posicion}\n{ktm}\nPlan: {plan}' },
  { id:'dmv_general', tipo:'caso', dueno:'DMV', caso:'general', nombre:'Evolución DMV',
    cuerpo:'{encabezado}\n{dia}\n{soporte} {parametros}\n{via_aerea}\n{secreciones}\n{sedacion}\n{ktm} {evaluaciones}\nPlan: {plan}' },
  { id:'dmv_pve_frustra', tipo:'caso', dueno:'DMV', caso:'pve_frustra', nombre:'PVE fracasada (corta)',
    cuerpo:'{encabezado}\n{dia}\n{soporte} {parametros}\nPVE: {pve} {weaning_grado}.\n{secreciones}\n{ktm}\nPlan: {plan}' },
  { id:'mfb_reintub', tipo:'caso', dueno:'MFB', caso:'reintub', nombre:'Reintubación',
    cuerpo:'{encabezado}\n{dia}\n{reintubacion}\n{via_aerea} {soporte} {parametros}\n{secreciones}\nPlan: {plan}' },
  { id:'fge_destete_tqt', tipo:'caso', dueno:'FGE', caso:'destete_tqt', nombre:'Destete por TQT',
    cuerpo:'{encabezado}\n{dia} {fase}\n{via_aerea} {tqt}\n{soporte}\n{parametros}\n{vfon}\n{secreciones}\n{ktm} {evaluaciones}\nPlan: {plan}' },
];
(function(){
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
  const hace=n=>{ const d=new Date(); d.setDate(d.getDate()-n); return iso(d); };
  const ahora=()=>{ const d=new Date(); return iso(d)+' '+pad(d.getHours())+':'+pad(d.getMinutes())+':'+pad(d.getSeconds()); };
  const FASES=['Reanimación inicial','Protección pulmonar','Neuroprotección','Postoperatorio inmediato',
    'Espera de second look','Weaning','Consolidación de weaning','Rehabilitación','Cuidados postparo'];
  const ASIG={ team:['MCC','DMV','FGE'], assign:{ '4':'MCC','7':'MCC','2':'DMV','1':'FGE' } };
  // Pacientes DE MENTIRA (nombres inventados a propósito; ningún RUT).
  const ocupada=(id,o)=>Object.assign({ ID_CAMA:String(id), OCUPADA:true, STATUS_CAMA:'Ocupada',
    PATIENT_ID:'demo-'+id, COD_PACIENTE:'D'+id, SEXO:'M', TALLA_CM:170, BARTHEL:100, ECF:'3',
    AISLAMIENTO:false, KTM_NIVEL:'', KTM_SUSP:false, TIMELINE_JSON:'[]', CAT_RESP_PJE:'', CAT_MOTOR_PJE:'',
    DISP_HME_FECHA:'', DISP_HEPA_FECHA:'', DISP_TC_FECHA:'', DISP_HUMID_FECHA:'', VM_TAG:'', EQUIPOS_PACIENTE:[] }, o);
  const wean4={}; wean4[hace(8)+'-Dia']='frustra'; wean4[hace(5)+'-Noche']='frustra';
  const CAMAS=[];
  for(let i=1;i<=12;i++) CAMAS.push({ ID_CAMA:String(i), OCUPADA:false, STATUS_CAMA:'Libre' });
  CAMAS[3]=ocupada(4,{ NOMBRE:'PACIENTE DE PRUEBA CUATRO', EDAD:64, DIAGNOSTICO:'Neumonía grave por influenza A',
    VIA_AEREA:'TOT', TOT_NUMERO:'8', TOT_CM_LABIO:'22', SOPORTE:'VM', MODO:'CPAP/PS',
    FECHA_INGRESO:hace(12), TS_INGRESO:hace(12)+' 15:40', FECHA_INICIO_VA:hace(11), FECHA_INICIO_SOPORTE:hace(11),
    FASE_JSON:'["Weaning"]', FIRMA_KINE:'MCC', WEAN_PVE_JSON:JSON.stringify(wean4), WEAN_CAND_PVE:true,
    ULT_MRC:44, ULT_MRC_FECHA:hace(1), ULT_COOP:'Sí' });
  CAMAS[0]=ocupada(1,{ NOMBRE:'PACIENTE DE PRUEBA UNO', EDAD:58, SEXO:'F', DIAGNOSTICO:'Politraumatismo · TEC grave',
    VIA_AEREA:'TQT', TQT_TIPO:'Shiley 8 con cuff', SOPORTE:'VM', MODO:'CPAP/PS',
    FECHA_INGRESO:hace(26), TS_INGRESO:hace(26)+' 03:10', FECHA_INICIO_VA:hace(9), FECHA_INICIO_SOPORTE:hace(25),
    FASE_JSON:'["Consolidación de weaning"]', FIRMA_KINE:'FGE', WEAN_PVE_JSON:'{}' });
  CAMAS[6]=ocupada(7,{ NOMBRE:'PACIENTE DE PRUEBA SIETE', EDAD:71, DIAGNOSTICO:'EPOC exacerbado',
    VIA_AEREA:'Natural', SOPORTE:'CNAF', MODO:'',
    FECHA_INGRESO:hace(6), TS_INGRESO:hace(6)+' 20:05', FECHA_INICIO_VA:'', FECHA_INICIO_SOPORTE:hace(1),
    FASE_JSON:'["Rehabilitación"]', FIRMA_KINE:'MCC', WEAN_PVE_JSON:'{}' });
  CAMAS[1]=ocupada(2,{ NOMBRE:'PACIENTE DE PRUEBA DOS', EDAD:45, DIAGNOSTICO:'Pancreatitis aguda grave',
    VIA_AEREA:'Natural', SOPORTE:'Oxigenoterapia/OAF', MODO:'Naricera',
    FECHA_INGRESO:hace(4), TS_INGRESO:hace(4)+' 11:30', FECHA_INICIO_VA:'', FECHA_INICIO_SOPORTE:hace(4),
    FASE_JSON:'["Rehabilitación"]', FIRMA_KINE:'DMV', WEAN_PVE_JSON:'{}' });
  // El turno ANTERIOR de cada cama (lo que el formulario replica al abrir).
  const ayerNoche=hace(1)+'-Noche';
  const PREVIA={
    '4':{ TURNO_KEY:ayerNoche, PLAN_FIRMA_KINE:'MCC', FASE_JSON:'["Weaning"]',
      VENT_VIA_AEREA:'TOT', VENT_SOPORTE:'VM', VENT_MODO:'CPAP/PS', VENT_TOT_NUM:'8', VENT_TOT_CM:'22',
      VENT_PS:12, VENT_PEEP:6, VENT_FIO2:40, VENT_SPO2:95, VENT_FR:24, VENT_VT:420,
      RESP_SECR_CAR:'Purulentas', RESP_SECR_REOL:'Adherentes', RESP_SECR_QTY:'+++',
      SED_TIPO:'Sin sedación', SED_SAS:'4', SED_COOPERACION:'Sí', HEMO_ESTADO:'Estable',
      PLAN_PLANES:'Nueva PVE mañana si mejora el manejo de secreciones' },
    '1':{ TURNO_KEY:ayerNoche, PLAN_FIRMA_KINE:'FGE', FASE_JSON:'["Consolidación de weaning"]',
      VENT_VIA_AEREA:'TQT', VENT_SOPORTE:'VM', VENT_MODO:'CPAP/PS', VENT_TQT_CALIBRE:'8', VENT_TQT_TIPO:'Shiley con cuff',
      VENT_PS:8, VENT_PEEP:5, VENT_FIO2:30, VENT_SPO2:97, VENT_FR:20,
      RESP_SECR_CAR:'Mucosas', RESP_SECR_REOL:'Fluidas', RESP_SECR_QTY:'+',
      SED_TIPO:'Sin sedación', SED_COOPERACION:'Sí', HEMO_ESTADO:'Estable',
      PLAN_PLANES:'Progresar tiempos fuera de VM; evaluar válvula de fonación' },
    '7':{ TURNO_KEY:ayerNoche, PLAN_FIRMA_KINE:'MCC', FASE_JSON:'["Rehabilitación"]',
      VENT_VIA_AEREA:'Natural', VENT_SOPORTE:'CNAF', VENT_FLUJO:40, VENT_FIO2:35, VENT_SPO2:94,
      RESP_SECR_CAR:'Mucosas', RESP_SECR_REOL:'Fluidas', RESP_SECR_QTY:'++',
      SED_TIPO:'Sin sedación', SED_COOPERACION:'Sí', HEMO_ESTADO:'Estable',
      PLAN_PLANES:'Sedestación al borde de la cama; progresar a bípedo' },
    '2':{ TURNO_KEY:ayerNoche, PLAN_FIRMA_KINE:'DMV', FASE_JSON:'["Rehabilitación"]',
      VENT_VIA_AEREA:'Natural', VENT_SOPORTE:'Oxigenoterapia/OAF', VENT_MODO:'Naricera', VENT_LITROS:2, VENT_SPO2:96,
      RESP_SECR_QTY:'auto', SED_TIPO:'Sin sedación', SED_COOPERACION:'Sí', HEMO_ESTADO:'Estable',
      PLAN_PLANES:'Marcha asistida en pasillo' },
  };
  const GUARDADAS={};
  function responder(a,d){
    switch(a){
      case 'GET_BOOT': return { ahora:ahora(), yo:{ email:'', firma:'MCC', dev:true },
        config:{ NUM_CAMAS:12, BANNERS:{}, CAT_DEF:{} }, fases:FASES, camas:CAMAS, evos:[], asignacion:ASIG, cierre:null };
      case 'WHOAMI': return { email:'', firma:'MCC', dev:true };
      case 'GET_CONFIG_UI': return { NUM_CAMAS:12, BANNERS:{}, CAT_DEF:{} };
      case 'GET_CATALOGO': return FASES;
      case 'GET_FECHA_HOY': return iso(new Date());
      case 'GET_REINTUB_N': return 0;
      case 'GET_TODAS_CAMAS': return CAMAS;
      case 'GET_ASIGNACION_TURNO': return ASIG;
      case 'SET_ASIGNACION_TURNO': return d;
      case 'GET_EVO_TURNO': { const k=String(d.idCama); const g=GUARDADAS[d.turnoKey+'|'+k];
        return { actual:g||null, previa:PREVIA[k]||null, pronoAbierto:'' }; }
      case 'GUARDAR_EVOLUCION': { const k=(d.TURNO_KEY||'')+'|'+String(d.ID_CAMA||d.idCama||'');
        GUARDADAS[k]=Object.assign({}, d); return Object.assign({}, d); }
      default: return null;
    }
  }
  window.google={ script:{ run:{ withSuccessHandler(ok){ return { withFailureHandler(){ return {
    api(a,d){ setTimeout(()=>{ try{ ok({ ok:true, data:responder(a,d||{}) }); }catch(e){ ok({ ok:false, error:String(e&&e.message||e) }); } }, 30); }
  }; } }; } } } };
})();
</script>
`;

// ── Inyectar el puente antes del primer <script> del index ────────────────
const src = fs.readFileSync(fuente, 'utf8');
const idx = src.indexOf('<script');
if (idx < 0) { console.error('ERROR: no encuentro <script> en el index'); process.exit(1); }
const html = src.slice(0, idx) + STUB + src.slice(idx);

// ── Cohete sin envoltorio de documento (lo pone quien publica) ────────────
const b64 = Buffer.from(html, 'utf8').toString('base64');
const trozos = [];
for (let i = 0; i < b64.length; i += 16000) trozos.push(b64.slice(i, i + 16000));
const loader = [
  '<title>RCE-KINE · prototipo de plantillas</title>',
  '<div id="ld" style="font-family:sans-serif;padding:30px">Cargando el prototipo de plantillas...</div>',
  '<script>',
  "var B = ''",
]
  .concat(trozos.map(t => "+'" + t + "'"))
  .concat([
    ';',
    'try {',
    'var bin = atob(B), n = bin.length, u = new Uint8Array(n);',
    'for (var i = 0; i < n; i++) u[i] = bin.charCodeAt(i);',
    'var html = new TextDecoder("utf-8").decode(u);',
    'document.open(); document.write(html); document.close();',
    '} catch (e) {',
    'var el = document.getElementById("ld");',
    'if (el) el.textContent = "Error del cargador: " + (e && e.message ? e.message : e);',
    '}',
    '</' + 'script>',
  ])
  .join('\n');

fs.writeFileSync(salida, loader);
console.log('prototipo generado: ' + salida + ' (' + loader.length + ' caracteres)');
