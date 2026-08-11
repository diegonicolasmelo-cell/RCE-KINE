/**
 * indicadores.js — Guardia del tablero de indicadores (svc_indicadores.gs).
 * Fixture calculado a mano: fracaso precoz (<24h) y tardío (24-48h) con y sin
 * hora, autoextubaciones fuera del denominador, motivos por turno, mediana de
 * VM pre-TQT, VM prolongada por episodio, reingresos por RUT y tendencia con
 * histórico sembrado.
 */
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');

const DB = {};
global.repoLeerTodos = h => (DB[h] || []).slice();
// El doble de la lectura por columnas RECORTA de verdad (Ola 3): si el cálculo
// usa un campo que no declaró en _CAMPOS_INDICADORES, aquí lo ve vacío y los
// números de abajo se caen. Esta guardia es la segunda red de esa lista.
global.repoLeerColumnas = (h, campos) => (DB[h] || []).map(o => {
  if (!campos || !campos.length) return Object.assign({}, o);
  const r = {};
  campos.forEach(c => { r[c] = (o[c] === undefined) ? '' : o[c]; });
  return r;
});
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'VALIDACION', INTERNO: 'INTERNO' };
global._rutNormal = rut => { const s = String(rut||'').toUpperCase().replace(/[^0-9K]/g,''); return s.length<2?'':s.slice(0,-1)+'-'+s.slice(-1); };

eval(['svc_stats.gs', 'svc_indicadores.gs'].map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

const P1='p1', P2='p2', P3='p3', P4='p4';
DB.EVOLUCIONES = [
  // P1: VM 3 días; extubación c/protocolo el 03 a las 10:00 → reintub 04 a las 08:00 (22h = PRECOZ)
  { PATIENT_ID:P1, FECHA:'2026-07-01', TURNO_KEY:'2026-07-01-Dia', VENT_SOPORTE:'VM', RESP_KTR_CANT:2 },
  { PATIENT_ID:P1, FECHA:'2026-07-02', TURNO_KEY:'2026-07-02-Dia', VENT_SOPORTE:'VM', PVE_VAL:'si', PVE_RESULTADO:'superada', RESP_KTR_CANT:3 },
  { PATIENT_ID:P1, FECHA:'2026-07-03', TURNO_KEY:'2026-07-03-Dia', VENT_SOPORTE:'VM', EXT_OCURRIO:true, EXT_TIPO:'protocolo', EXT_HORA:'10:00', KTM_REALIZADA:true, KTM_CANT:'2' },
  // P2: extubación fuera de protocolo (sin_protocolo, agitación, turno NOCHE) el 10 sin hora → reintub el 12 (48h = TARDÍO)
  { PATIENT_ID:P2, FECHA:'2026-07-09', TURNO_KEY:'2026-07-09-Dia', VENT_SOPORTE:'VM' },
  { PATIENT_ID:P2, FECHA:'2026-07-10', TURNO_KEY:'2026-07-10-Noche', VENT_SOPORTE:'VM', EXT_OCURRIO:true, EXT_TIPO:'sin_protocolo', EXT_MOTIVO:'Agitación psicomotora' },
  // P2: autoextubación posterior el 20 (no cuenta en denominador programadas)
  { PATIENT_ID:P2, FECHA:'2026-07-20', TURNO_KEY:'2026-07-20-Dia', VENT_SOPORTE:'VM', EXT_OCURRIO:true, EXT_TIPO:'autoextubacion' },
  // P4: empieza el turno en VNI y termina CONECTADO a VM (VENT_SOPORTE_FINAL).
  // Decisión de Manuel (8-ago-2026): ese día CUENTA como día con VM, porque el
  // paciente estuvo ventilado en el turno. Antes solo se miraba el soporte de
  // inicio, el denominador de autoextubaciones por 100 días-VM se quedaba corto
  // y la tasa se disparaba. Si alguien vuelve a mirar solo VENT_SOPORTE, los
  // dos asserts de más abajo se caen.
  { PATIENT_ID:P4, FECHA:'2026-07-14', TURNO_KEY:'2026-07-14-Dia', VENT_SOPORTE:'VMNI', VENT_SOPORTE_FINAL:'VM' },
  // P3: TQT el 05 con 9 días de VM previos (jun 27 - jul 05) → VM prolongada
  { PATIENT_ID:P3, FECHA:'2026-07-05', TURNO_KEY:'2026-07-05-Dia', VENT_SOPORTE:'VM', TQT_OCURRIO:true },
  // Cuff (verificación por turno, solo con vía aérea artificial):
  { PATIENT_ID:P1, FECHA:'2026-07-06', TURNO_KEY:'2026-07-06-Dia',   VENT_VIA_AEREA:'TOT', VENT_CUFF_EST:'rango' },
  { PATIENT_ID:P1, FECHA:'2026-07-06', TURNO_KEY:'2026-07-06-Noche', VENT_VIA_AEREA:'TOT', VENT_CUFF_EST:'ajuste', VENT_CUFF_CMH2O:16 },
  { PATIENT_ID:P1, FECHA:'2026-07-07', TURNO_KEY:'2026-07-07-Dia',   VENT_VIA_AEREA:'TQT', VENT_CUFF_EST:'' },        // sin verificar → baja adherencia
  { PATIENT_ID:P1, FECHA:'2026-07-07', TURNO_KEY:'2026-07-07-Noche', VENT_VIA_AEREA:'TQT', VENT_CUFF_EST:'desinflado' }, // válvula de fonación → fuera del denominador
  { PATIENT_ID:P1, FECHA:'2026-07-08', TURNO_KEY:'2026-07-08-Dia',   VENT_VIA_AEREA:'Natural', VENT_CUFF_EST:'' },   // sin VA artificial → no aplica
];
DB.EVOLUCIONES_ARCHIVO = [];
for (let d = 27; d <= 30; d++) DB.EVOLUCIONES_ARCHIVO.push({ PATIENT_ID:P3, FECHA:'2026-06-'+d, TURNO_KEY:'2026-06-'+d+'-Dia', VENT_SOPORTE:'VM' });
for (let d = 1; d <= 4; d++) DB.EVOLUCIONES.push({ PATIENT_ID:P3, FECHA:'2026-07-0'+d, TURNO_KEY:'2026-07-0'+d+'-Dia', VENT_SOPORTE:'VM' });
DB.REINTUBACIONES = [
  { PATIENT_ID:P1, FECHA:'2026-07-04', HORA_REINTUBACION:'08:00' },
  { PATIENT_ID:P2, FECHA:'2026-07-12', HORA_REINTUBACION:'' },
];
DB.ARCHIVO_PACIENTES = [
  { PATIENT_ID:P1, RUT:'12.345.678-5', FECHA_EGRESO:'2026-07-15', MOTIVO_EGRESO:'Traslado a sala' },
  { PATIENT_ID:'p0', RUT:'12345678-5', FECHA_EGRESO:'2026-03-01', MOTIVO_EGRESO:'Alta' },   // mismo RUT → reingreso
  { PATIENT_ID:P2, RUT:'9.876.543-3', FECHA_EGRESO:'2026-07-25', MOTIVO_EGRESO:'Fallecimiento' },
];
DB.CAMAS_ESTADO = [{ PATIENT_ID:P3, OCUPADA:true, RUT:'' }];
DB.INDICADORES_HISTORICO = [
  { MES:'2026-05', FUENTE:'planilla', EXTUBACIONES:20, REINTUB_48H:4 },
];

const r = calcularIndicadores('2026-07-01', '2026-07-31');
const fails=[]; const eq=(l,g,w)=>{const okk=String(g)===String(w);console.log((okk?'✅':'❌')+' '+l+': '+g+(okk?'':' (esperado '+w+')'));if(!okk)fails.push(l);};
eq('calcula ok', r.ok, true);
const d = r.data || {};
eq('extubaciones programadas (protocolo + fuera; autoext NO)', d.extubaciones, 2);
eq('fracaso total ≤48h', d.fracaso, 2);
eq('fracaso precoz <24h (P1: 22h con horas reales)', d.fracasoPrecoz, 1);
eq('fracaso tardío 24-48h (P2: 2 días sin hora)', d.fracasoTardio, 1);
eq('autoextubaciones', d.autoextubaciones, 1);
eq('fuera de protocolo', d.fueraProtocolo, 1);
eq('motivo agitación en turno noche', d.motivosFuera['Agitación psicomotora'] && d.motivosFuera['Agitación psicomotora'].noche, 1);
eq('PVE del rango', d.pve, 1);
eq('mediana días-VM antes de TQT (4 jun archivadas + 5 jul = 9)', d.medianaVMpreTQT, 9);
eq('VM prolongada (solo P3 con 9 días de episodio)', d.vmProlongada, 1);
// Día con VM = estuvo en VM en algún momento del turno (inicio O cierre).
// P1 los días 01-03, P2 el 09/10/20, P3 el 01-05, y P4 el 14 SOLO por haber
// terminado el turno conectado: 3+3+5+1 = 12.
eq('días-VM cuenta el turno que TERMINA en VM (P4 el 14)', d.diasVM, 12);
eq('ventilados incluye al que solo terminó el turno en VM', d.ventilados, 4);
eq('atenciones (KTR 2+3 + KTM 2)', d.atenciones, 7);
eq('cuff: denominador = turnos con VA artificial, sin los desinflados', d.cuffTurnos, 3);
eq('cuff: verificados = en rango + ajustados', d.cuffVerificados, 2);
eq('cuff: ajustes contados aparte', d.cuffAjustes, 1);
eq('cuff: adherencia 2/3 = 67%', d.cuffAdherenciaPct, 67);
eq('reingresos por RUT (12345678-5 con 2 episodios, formatos distintos)', d.reingresos, 1);
eq('egresos del rango', d.egresos, 2);
eq('mortalidad 50%', d.mortalidadPct, 50);
eq('tendencia incluye histórico sembrado (2026-05 = 20%)', JSON.stringify(d.tendencia[0]), JSON.stringify({mes:'2026-05',fuente:'planilla',fracasoPct:20}));
eq('tendencia incluye mes RCE (2026-07 = 100%)', d.tendencia.some(t=>t.mes==='2026-07'&&t.fuente==='rce'&&t.fracasoPct===100), true);

// ── UN paciente con DOS reintubaciones en el MISMO episodio ─────────────────
// Pregunta de Diego (ago-2026) al pedir el número para la hoja de registro:
// «¿cuando se dé más de 1 en el mismo paciente, cómo lo contabilizaremos?».
// La respuesta es que son DOS conteos distintos y se mantienen separados:
//   · la CASILLA DEL PAPEL es del EPISODIO — dice 2;
//   · el INDICADOR tiene como unidad la EXTUBACIÓN — 3 intentos y 2 fracasos,
//     o sea 67%, NO 200%.
// Esta guardia existe para que nadie los «haga calzar»: es el mismo error que
// ya se pagó con «día con VM» y con `sin_condiciones`.
(function dosEnElMismoPaciente(){
  const PID = 'dosveces';
  Object.keys(DB).forEach(k => { DB[k] = []; });
  DB.EVOLUCIONES = [
    { PATIENT_ID:PID, FECHA:'2026-07-01', TURNO_KEY:'2026-07-01-Dia', VENT_SOPORTE:'VM' },
    // extuba 03 10:00 → reintuba 04 08:00 (22 h ⇒ PRECOZ)
    { PATIENT_ID:PID, FECHA:'2026-07-03', TURNO_KEY:'2026-07-03-Dia', VENT_SOPORTE:'VM',
      EXT_OCURRIO:true, EXT_TIPO:'protocolo', EXT_HORA:'10:00' },
    // extuba 08 09:00 → reintuba 09 20:00 (35 h ⇒ TARDÍO)
    { PATIENT_ID:PID, FECHA:'2026-07-08', TURNO_KEY:'2026-07-08-Dia', VENT_SOPORTE:'VM',
      EXT_OCURRIO:true, EXT_TIPO:'protocolo', EXT_HORA:'09:00' },
    // extuba 14 10:00 y esta vez se va bien
    { PATIENT_ID:PID, FECHA:'2026-07-14', TURNO_KEY:'2026-07-14-Dia', VENT_SOPORTE:'VM',
      EXT_OCURRIO:true, EXT_TIPO:'protocolo', EXT_HORA:'10:00' },
  ];
  DB.REINTUBACIONES = [
    { ID_REINTUB:'CAMA_4_2026-07-04-Dia_REINTUB',   PATIENT_ID:PID, FECHA:'2026-07-04', HORA_REINTUBACION:'08:00' },
    { ID_REINTUB:'CAMA_4_2026-07-09-Noche_REINTUB', PATIENT_ID:PID, FECHA:'2026-07-09', HORA_REINTUBACION:'20:00' },
  ];
  const r = calcularIndicadores('2026-07-01','2026-07-31').data;
  eq('★ dos en el mismo paciente: la casilla del papel dice 2',
     DB.REINTUBACIONES.filter(x => x.PATIENT_ID === PID).length, 2);
  eq('★ …y el indicador cuenta 3 INTENTOS, no 1 paciente', r.extubaciones, 3);
  eq('★ …con 2 fracasos (uno precoz y uno tardío)',
     r.fracaso + '/' + r.fracasoPrecoz + '/' + r.fracasoTardio, '2/1/1');
  eq('★ …o sea 67%, jamás 200%', r.fracasoPct, 66.7);
})();

console.log(fails.length?('❌ '+fails.length+' FALLOS'):'✅ TODO OK');
process.exit(fails.length?1:0);
