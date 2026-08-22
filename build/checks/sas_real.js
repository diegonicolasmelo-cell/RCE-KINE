// sas_real.js — El SAS que TIENE el paciente y el que se PERSIGUE, y la
// sedación que no es profunda.
//
// 🔴 DE DÓNDE SALE (Diego, 14-ago-2026). Su historia, textual: «tiene un
// paciente en SAS 6, sin embargo el objetivo es lograr el SAS 4, pero a pesar
// de las medidas no se logra de forma consistente. Diego no tiene cómo decir
// que la sedación que tiene es para este fin, ya que si lo anota como sedación
// cuenta como reinicio de sedación para fines de salir de la sedación
// profunda. Lo anota igual y en la entrega se pierde cuando suspenden
// sedación».
//
// Eran DOS defectos encadenados:
//
//  1. UN SOLO CAMPO PARA DOS COSAS. La evolución lo narraba como «meta SAS» y
//     CUATRO decisiones automáticas lo leían como el estado del paciente: el
//     GCS automático con SAS 1, el límite de KTM al nivel 1, el gate de S5Q y
//     CAM-ICU bajo SAS 3, y la categorización SOCHIMI. Con un paciente en 6 y
//     meta 4 no había número correcto: escribiendo el real la evolución mentía
//     sobre el objetivo, y escribiendo la meta la app le abría el S5Q y el
//     CAM-ICU a un paciente agitado.
//     ⇒ `SED_SAS` pasa a ser oficialmente el ACTUAL —que es como esas cuatro
//     decisiones ya lo leían, o sea sin tocarlas— y la meta viaja aparte.
//
//  2. LA FECHA DE SUSPENSIÓN LA BORRABA CUALQUIER SEDACIÓN. Se calculaba con
//     «¿el escalón es distinto de Sin sedación?», así que anotar precedex para
//     controlar la agitación contaba como volver a sedación PROFUNDA y la
//     fecha —el antes y el después para evaluar la respuesta a la suspensión
//     de hipnóticos y para interpretar el GCS— desaparecía de la entrega.
//     ⇒ La regla pasa a preguntar por la sedación PROFUNDA.
//
// Uso: node build/checks/sas_real.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };

const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
const dom = fs.readFileSync(path.join(v2, 'dominio_texto.gs'), 'utf8');
const esq = fs.readFileSync(path.join(v2, 'esquema.gs'), 'utf8');

/* ══ 1 · LAS TRES COLUMNAS, AL FINAL ════════════════════════════════════ */
console.log('\n1 · Esquema');
['SED_SAS_META', 'SED_VIGIL', 'SED_FARMACOS'].forEach(c =>
  eq('  existe ' + c, new RegExp("\\['" + c + "'").test(esq), true));
// 🪤 Aquí decía `/EVOLUCIONES !== 390/`: el número de aquella tanda, escrito a
// mano. Se puso rojo el 22-ago-2026 al sumar las columnas de neuromonitoreo,
// sin que nada estuviera mal — la guardia protegía un valor, no una propiedad.
// Lo que de verdad hay que vigilar es que el total de testEsquema **coincida
// con las columnas realmente declaradas**: ese desajuste es el que hace que la
// prueba acuse a la planilla de un error que no tiene.
{
  const bloque = esq.slice(esq.indexOf('const _COLS_EVOLUCIONES'), esq.indexOf('const ESQUEMA'));
  const declaradas = [...bloque.matchAll(/\['[A-Z0-9_]+','[a-z]+'\]/g)].length;
  const escrito = (esq.match(/TOTAL_COLS\.EVOLUCIONES !== (\d+)/) || [])[1];
  eq('el total de testEsquema calza con las columnas declaradas (' + declaradas + ')',
     String(escrito), String(declaradas));
}
// Regla de la casa: las columnas nuevas van SIEMPRE al final (la reparación
// reescribe encabezados y meterlas al medio desalinea los datos guardados).
const cols = [...esq.matchAll(/\['([A-Z0-9_]+)','(?:texto|bool|entero|decimal|fecha|ts|uuid|email)'\]/g)].map(m => m[1]);
const iSnt = cols.lastIndexOf('RESP_SNT');
eq('★ y van DESPUÉS de la última columna anterior (RESP_SNT)',
  cols.slice(iSnt + 1, iSnt + 4).join(','), 'SED_SAS_META,SED_VIGIL,SED_FARMACOS');

/* ══ 2 · EL FORMULARIO ══════════════════════════════════════════════════ */
console.log('\n2 · Formulario: actual, meta, vigil y sedantes');
eq('el casillero de siempre pasó a decir «SAS actual»', /<label>SAS actual<\/label>/.test(idx), true);
eq('hay un casillero para la meta', /id="fSASmeta"/.test(idx), true);
eq('hay casilla de sedación vigil', /id="cSedVigil"/.test(idx), true);
['Fentanyl', 'Propofol', 'Midazolam', 'Ketamina', 'Precedex'].forEach(f =>
  eq('  sedante ' + f, new RegExp('data-f="' + f + '"').test(idx), true));
eq('los tres viajan en el guardado',
  /SED_SAS_META:v\('fSASmeta'\)/.test(idx) && /SED_VIGIL:bv\('cSedVigil'\)/.test(idx) &&
  /SED_FARMACOS:JSON\.stringify\(_sedFarmLista\(\)\)/.test(idx), true);
// Sin sedación no hay meta ni sedantes que declarar.
eq('«Sin sedación» limpia y esconde el bloque',
  /const m=\$\('fSASmeta'\);if\(m\)m\.value='';hide\('gSASmeta'\);/.test(idx), true);

console.log('\n2b · Las CUATRO decisiones automáticas siguen leyendo el ACTUAL');
// No se tocan a propósito: ya leían `fSAS`, que ahora es oficialmente el
// actual. Ese es el motivo de haber elegido este reparto y no el inverso.
eq('  GCS automático con SAS 1', /const sas=parseInt\(v\('fSAS'\)\)\|\|0;/.test(idx), true);
eq('  KTM limitada al nivel 1', /const sas1 = parseInt\(v\('fSAS'\)\)===1;/.test(idx), true);
eq('  gate de S5Q y CAM-ICU', /const sas=parseInt\(v\('fSAS'\)\);/.test(idx), true);
eq('  matriz SOCHIMI', /const s=parseInt\(v\('fSAS'\)\)\|\|0;/.test(idx), true);
eq('★ y NINGUNA lee la meta', /parseInt\(v\('fSASmeta'\)\)/.test(idx), false);

/* ══ 3 · LA NARRATIVA, EN LOS DOS GENERADORES ═══════════════════════════ */
console.log('\n3 · Cliente y servidor dicen lo mismo');
// Es el patrón de las secreciones: dos generadores de la misma frase que se
// separan. Se comprueba leyendo los dos fuentes, no un texto.
[['cliente', idx], ['servidor', dom]].forEach(([quien, src]) => {
  eq('  ' + quien + ': narra el SAS actual con la meta al lado',
    /con SAS \$\{(sas|_?meta|[a-z]+)\}\$\{\s*_?meta \?/.test(src) ||
    /con SAS \$\{sas\}\$\{_meta\?/.test(src), true);
  eq('  ' + quien + ': nombra la sedación vigil', /vigil \(control de agitación\)/.test(src), true);
  eq('  ' + quien + ': lista los sedantes', /farmTxt|_farmTxt/.test(src), true);
});

/* ══ 4 · LA FECHA DE SUSPENSIÓN ES DE LA SEDACIÓN PROFUNDA ══════════════ */
console.log('\n4 · La historia de Diego, turno a turno');

const DB = {
  CAMAS_ESTADO: [{ ID_CAMA: '12', OCUPADA: 'TRUE', PATIENT_ID: 'p12', NOMBRE: 'Ejemplo',
    DIAGNOSTICO: 'TEC grave', FECHA_INGRESO: '2026-08-01', VIA_AEREA: 'TQT', SOPORTE: 'VM' }],
  EVOLUCIONES: [], PROCEDIMIENTOS: [],
};
const evo = (d, extra) => Object.assign({
  ID_CAMA: '12', PATIENT_ID: 'p12', FECHA: '2026-08-' + String(d).padStart(2, '0'),
  TURNO_KEY: '2026-08-' + String(d).padStart(2, '0') + '-Dia', TURNO: 'Dia',
  VENT_VIA_AEREA: 'TQT', VENT_SOPORTE: 'VM', PLAN_FIRMA_KINE: 'Klgo. Diego Melo',
}, extra);

global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoLeerFiltrado = (h, col, pred) => (DB[h] || []).filter(r => pred(r[col]));
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.hoyISO = () => '2026-08-08';
global.ahoraTS = () => '2026-08-08 10:00:00';
global._tz = () => 'America/Santiago';
global.Utilities = { formatDate: () => '2026-08-08' };
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global._statISO = f => String(f || '').slice(0, 10);
eval(['infra_fechas.gs', 'svc_eventos.gs', 'svc_stats.gs', 'svc_entrega.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

const ficha = (evos) => {
  DB.EVOLUCIONES = evos;
  return obtenerEntregaTurno(['12'], evos[evos.length - 1].TURNO_KEY.slice(0, 10), 'Dia').data.fichas[0];
};

// Sedado profundo del 01 al 03, sin sedación el 04, y del 05 al 08 con
// PRECEDEX para controlar la agitación: SAS 6 con meta 4.
const historia = [
  evo(1, { SED_TIPO: 'Escalón 3', SED_SAS: '2', SED_SAS_META: '2' }),
  evo(2, { SED_TIPO: 'Escalón 3', SED_SAS: '2', SED_SAS_META: '2' }),
  evo(3, { SED_TIPO: 'Escalón 2', SED_SAS: '3', SED_SAS_META: '3' }),
  evo(4, { SED_TIPO: 'Sin sedación', SED_SAS: '', SED_SAS_META: '' }),
];
for (let d = 5; d <= 8; d++) {
  historia.push(evo(d, {
    SED_TIPO: 'Fuera de escalón', SED_SAS: '6', SED_SAS_META: '4',
    SED_VIGIL: 'TRUE', SED_FARMACOS: '["Precedex"]',
  }));
}
const f1 = ficha(historia);
eq('★ la fecha de suspensión sobrevive a la sedación vigil', f1.sedSusp, '04-08');
eq('la entrega muestra el SAS ACTUAL', f1.sas, '6');
eq('…y la meta al lado', f1.sasMeta, '4');
eq('…y marca que es vigil', f1.sedVigil, true);
eq('…y qué sedante tiene puesto', (f1.sedFarmacos || []).join(','), 'Precedex');

// ★ CONTROL NEGATIVO: el mismo episodio, pero la sedación del 05 es PROFUNDA
// (nadie marcó la casilla). Ahí la fecha SÍ tiene que borrarse — si no, la
// guardia estaría pasando por no mirar nada.
const control = historia.map(e => Object.assign({}, e, e.SED_VIGIL ? { SED_VIGIL: '' } : {}));
eq('★ control: con sedación profunda al día 5, la fecha SÍ se borra',
  ficha(control).sedSusp, '');

// Y el caso de siempre: nunca volvió a sedarse ⇒ la fecha se mantiene.
eq('sin volver a sedar, la fecha se mantiene',
  ficha(historia.slice(0, 4)).sedSusp, '04-08');

// Un episodio que pasa de profunda DIRECTO a vigil, sin «Sin sedación» de por
// medio: la suspensión de la profunda es ese mismo día.
const directo = [
  evo(1, { SED_TIPO: 'Escalón 3', SED_SAS: '2' }),
  evo(2, { SED_TIPO: 'Escalón 3', SED_SAS: '2' }),
  evo(3, { SED_TIPO: 'Fuera de escalón', SED_SAS: '5', SED_SAS_META: '4', SED_VIGIL: 'TRUE' }),
];
eq('★ de profunda directo a vigil: suspendida ese día', ficha(directo).sedSusp, '03-08');

// Sin ningún registro de sedación no se inventa una fecha.
eq('sin dato de sedación, no se inventa fecha',
  ficha([evo(1, {}), evo(2, {})]).sedSusp, '');

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
