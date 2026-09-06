// buzon_campana.js — 🔔📨 La campana y el buzón (v5.91, 4-sep-2026).
//
// LO QUE FIJA:
//  1. El registro del buzón es DE SOLO AGREGAR (regla textual de Diego:
//     «que la información perdure si se cambia y no pise nada de lo
//     anterior»): la nota re-guardada idéntica no se duplica; la CAMBIADA
//     entra como fila nueva y la anterior QUEDA.
//  2. El aviso de versión se registra UNA sola vez por versión.
//  3. El formato de alerta que dictó Diego: «HME vencido (fecha en que
//     vence) · cama 7 · rótulo 31-08», con las rojas primero.
//  4. En el cliente: los números salen del boot, la campana lista el
//     «Ir a la cama», y abrir el buzón marca leído POR NAVEGADOR (el
//     registro no se toca).
// Uso: node build/checks/buzon_campana.js (requiere playwright-core)
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g) + (okk ? '' : ' (esperado ' + JSON.stringify(w) + ')')); if (!okk) fails.push(l); };
const si = (l, c) => eq(l, !!c, true);

/* ── Parte 1 · servidor ── */
const DB = { NOTIFICACIONES: [], CAMAS_ESTADO: [], VENTILADORES: [] };
global.repoLeerTodos = h => (DB[h] || []).slice();
global.repoInsertar = (h, o) => { (DB[h] = DB[h] || []).push(o); return o; };
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
let _n = 0; global.uid = p => p + '_' + (++_n);
global.hoyISO = () => '2026-09-03';
global.ahoraTS = () => '2026-09-03 10:0' + (_n % 10) + ':00';
global.ok = d => ({ ok: true, data: d }); global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
global._statISO = f => String(f || '').slice(0, 10);
global._vmCategoria = x => String(x.CATEGORIA || 'VM').trim().toUpperCase();
global._vmEsDeCama = c => String(c) === 'VM';
global.conLock = fn => fn();
eval(['svc_eventos.gs', 'svc_notificaciones.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

console.log('1 · El registro es de solo agregar (la regla de Diego, textual)');
const id1 = notifRegistrar({ tipo: 'nota', titulo: '📌 Nota del turno — cama 5', detalle: 'Familia pide hablar con el médico', refCama: '5', autor: 'MCC', origenId: 'evo_1' });
si('la primera nota entra al registro', id1 && DB.NOTIFICACIONES.length === 1);
const id2 = notifRegistrar({ tipo: 'nota', titulo: '📌 Nota del turno — cama 5', detalle: 'Familia pide hablar con el médico', refCama: '5', autor: 'MCC', origenId: 'evo_1' });
eq('★ re-guardada IDÉNTICA: no se duplica', id2 === null && DB.NOTIFICACIONES.length, 1);
const id3 = notifRegistrar({ tipo: 'nota', titulo: '📌 Nota del turno — cama 5', detalle: 'Familia YA habló con el médico', refCama: '5', autor: 'MCC', origenId: 'evo_1' });
eq('★ re-guardada CAMBIADA: entra como fila nueva', !!id3 && DB.NOTIFICACIONES.length, 2);
eq('★ …y la versión anterior QUEDA, sin pisarse',
  DB.NOTIFICACIONES[0].DETALLE, 'Familia pide hablar con el médico');

console.log('\n2 · El aviso de versión se registra una sola vez');
notifVersionVista('5.91-buzon-campana'); notifVersionVista('5.91-buzon-campana');
eq('dos boots con la misma versión = un solo aviso',
  DB.NOTIFICACIONES.filter(x => x.TIPO === 'version').length, 1);
si('…con el título esperado', /Se publicó la versión 5\.91/.test(DB.NOTIFICACIONES[2].TITULO));

console.log('\n3 · La campana, con el formato que dictó Diego');
DB.CAMAS_ESTADO = [
  // Cama 7: HME etiqueta 31-08 (frec 2 ⇒ venció el 01-09; hoy 03-09 va atrasado)
  // y MRC de hace 9 días en paciente cooperador.
  { ID_CAMA: '7', OCUPADA: 'TRUE', SOPORTE: 'VM', VIA_AEREA: 'TOT',
    DISP_HME_FECHA: '2026-08-31', ULT_COOP: 'Cooperador', ULT_MRC: 44, ULT_MRC_FECHA: '2026-08-25' },
  // Cama 10: en VM y el tablero no le tiene ventilador.
  { ID_CAMA: '10', OCUPADA: 'TRUE', SOPORTE: 'VM', VIA_AEREA: 'TOT' },
];
DB.VENTILADORES = [
  { NOMBRE: 'Vela 9', ACTIVO: 'TRUE', UBIC_TIPO: 'CAMA', UBIC_DETALLE: '7', CATEGORIA: 'VM',
    FECHA_MANT_PROX: '2026-09-01' },
];
_ventPorCamaMemo = null;
const AL = alertasUnidad('2026-09-03');
const hme = AL.find(a => /HME vencido/.test(a.titulo));
si('★ «HME vencido (01-09)» — la fecha en que venció, no la futura', hme && hme.titulo === 'HME vencido (01-09)');
eq('★ …con la cama', hme && hme.cama, '7');
eq('★ …y el rótulo aparte', hme && hme.detalle, 'rótulo 31-08');
eq('★ …en rojo y con «ir a la cama»', hme && (hme.nivel + '/' + hme.ir), 'rojo/cama');
const mrc = AL.find(a => /MRC-ss sin re-evaluar/.test(a.titulo));
si('MRC envejecida: «hace 9 días», ámbar', mrc && /hace 9 días/.test(mrc.titulo) && mrc.nivel === 'ambar');
const sinVent = AL.find(a => /VM sin ventilador/.test(a.titulo));
eq('VM sin ventilador asignado: cama 10, rojo → tablero', sinVent && (sinVent.cama + '/' + sinVent.nivel + '/' + sinVent.ir), '10/rojo/tablero');
const mant = AL.find(a => /Mantención vencida/.test(a.titulo));
si('mantención vencida de la Vela 9, en rojo', mant && /Vela 9/.test(mant.titulo) && mant.nivel === 'rojo');
si('★ las rojas van primero', AL.length >= 4 && AL[0].nivel === 'rojo' && AL.findIndex(a => a.nivel === 'ambar') > AL.map(a => a.nivel).lastIndexOf('rojo'));

console.log('\n3b · Pendiente medir pimometría (v5.93, Diego 5-sep)');
// Cama 4: CPAP/PS con soporte 12 y destete prolongado (3 PVE fracasadas).
// Cama 5: igual pero CON Pimáx registrada → la alerta se apaga.
// Cama 6: soporte 16 (no es bajo) → sin alerta.
// Cama 8: soporte 12 SIN destete prolongado pero VM de 25 días (NAMDRC) → alerta.
const _pveJson = JSON.stringify({ '2026-08-25-Dia': 'frustra', '2026-08-28-Dia': 'frustra', '2026-09-01-Dia': 'frustra' });
DB.CAMAS_ESTADO = [
  { ID_CAMA: '4', OCUPADA: 'TRUE', SOPORTE: 'VM', VIA_AEREA: 'TQT', MODO: 'CPAP/PS',
    ULT_PS: 12, WEAN_PVE_JSON: _pveJson, FECHA_INICIO_SOPORTE: '2026-08-20' },
  { ID_CAMA: '5', OCUPADA: 'TRUE', SOPORTE: 'VM', VIA_AEREA: 'TQT', MODO: 'CPAP/PS',
    ULT_PS: 12, ULT_PIM: 45, WEAN_PVE_JSON: _pveJson, FECHA_INICIO_SOPORTE: '2026-08-20' },
  { ID_CAMA: '6', OCUPADA: 'TRUE', SOPORTE: 'VM', VIA_AEREA: 'TQT', MODO: 'CPAP/PS',
    ULT_PS: 16, WEAN_PVE_JSON: _pveJson, FECHA_INICIO_SOPORTE: '2026-08-20' },
  { ID_CAMA: '8', OCUPADA: 'TRUE', SOPORTE: 'VM', VIA_AEREA: 'TQT', MODO: 'CPAP/PS',
    ULT_PS: 12, FECHA_INICIO_SOPORTE: '2026-08-09' },
];
DB.VENTILADORES = [4, 5, 6, 8].map(n => ({ NOMBRE: 'Vela ' + n, ACTIVO: 'TRUE', UBIC_TIPO: 'CAMA', UBIC_DETALLE: String(n), CATEGORIA: 'VM' }));
_ventPorCamaMemo = null;
const AP = alertasUnidad('2026-09-03');
const pim4 = AP.find(a => a.cama === '4' && /pimometría/.test(a.titulo));
si('★ CPAP/PS 12 + destete prolongado (3 PVE fracasadas): alerta',
  pim4 && pim4.titulo === 'Pendiente medir pimometría (soporte 12 cmH2O)' && /destete prolongado: 3 PVE fracasadas/.test(pim4.detalle));
si('…ámbar y con «ir a la cama»', pim4 && pim4.nivel === 'ambar' && pim4.ir === 'cama');
si('★ con la Pimáx YA registrada, la alerta se apaga', !AP.some(a => a.cama === '5' && /pimometría/.test(a.titulo)));
si('★ con soporte 16 (no es bajo) no hay alerta', !AP.some(a => a.cama === '6' && /pimometría/.test(a.titulo)));
const pim8 = AP.find(a => a.cama === '8' && /pimometría/.test(a.titulo));
si('★ sin PVE pero con 25 días de VM (NAMDRC ≥21): alerta por el otro camino',
  pim8 && /VM prolongada: 25 días/.test(pim8.detalle));
// El espejo del weaning no puede separarse del cliente:
const idxSrc = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
si('★ el espejo _weanClaseSrv usa la MISMA regla que _weanClase del cliente',
  /frustras>=3\|\|d>7/.test(idxSrc.replace(/\s+/g, '')) &&
  /frustras>=3\|\|d>7/.test(fs.readFileSync(path.join(v2, 'svc_notificaciones.gs'), 'utf8').replace(/\s+/g, '')));

console.log('\n3c · MRC/FSS pendientes con motivo (v5.94, Diego 5-sep)');
// Cama 2: cooperador SIN MRC ni FSS → dos alertas «pendiente» con su motivo.
// Cama 3: NO cooperador sin mediciones → SIN campana (no es olvido).
DB.CAMAS_ESTADO = [
  { ID_CAMA: '2', OCUPADA: 'TRUE', SOPORTE: 'Ninguno', ULT_COOP: 'Cooperador' },
  { ID_CAMA: '3', OCUPADA: 'TRUE', SOPORTE: 'Ninguno', ULT_COOP: 'No evaluable' },
];
DB.VENTILADORES = [];
_ventPorCamaMemo = null;
const AE = alertasUnidad('2026-09-03');
const pend2 = AE.filter(a => a.cama === '2' && /pendiente/.test(a.titulo));
si('★ cooperador sin medir: MRC-ss y FSS-ICU pendientes en la campana',
  pend2.length === 2 && pend2.every(a => /cooperador sin medición.*evaluable desde ya/.test(a.detalle) && a.nivel === 'ambar'));
si('★ al NO cooperador no se le alerta (no es olvido)',
  !AE.some(a => a.cama === '3'));
// El motivo escrito en la entrega y el tooltip de la tarjeta:
const entSrc = fs.readFileSync(path.join(v2, 'svc_entrega.gs'), 'utf8');
si('★ la entrega escribe el motivo al lado del chip pendiente',
  entSrc.includes('MRC-SS pendiente — cooperador, evaluable desde ya') &&
  entSrc.includes('MRC/FSS no evaluables aún — '));
const idxS = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');
si('★ el badge de la tarjeta lleva tooltip con el motivo',
  idxS.includes('pendiente: paciente cooperador sin medición registrada') &&
  idxS.includes('MRC/FSS no evaluables aún'));

console.log('\n3d · El aviso de coordinación exige la sesión (v5.96)');
// El candado vive en el servicio: sin sesión válida, nada entra al registro.
global.coordExigirSesion = t => t === 'tok_ok'
  ? { ok: true, firma: 'MCC' }
  : { ok: false, error: 'Sesión de coordinación inválida o vencida.' };
global.ERR.NO_AUTORIZADO = 'NA';
const antesAviso = DB.NOTIFICACIONES.length;
const sinSesion = coordAviso({ token: 'malo', texto: 'Cambio de protocolo el viernes' });
si('★ sin sesión: rechaza y NO registra nada',
  sinSesion && sinSesion.ok === false && DB.NOTIFICACIONES.length === antesAviso);
const vacio = coordAviso({ token: 'tok_ok', texto: '   ' });
si('con sesión pero sin texto: rechaza', vacio && vacio.ok === false && DB.NOTIFICACIONES.length === antesAviso);
const conSesion = coordAviso({ token: 'tok_ok', texto: 'Cambio de protocolo el viernes — leer la circular' });
const filaAviso = DB.NOTIFICACIONES[DB.NOTIFICACIONES.length - 1];
si('★ con sesión: entra al buzón como tipo coord y con la FIRMA de quien avisa',
  conSesion && conSesion.ok === true && filaAviso.TIPO === 'coord' &&
  filaAviso.AUTOR === 'MCC' && /📣 Aviso de coordinación/.test(filaAviso.TITULO) &&
  /Cambio de protocolo/.test(filaAviso.DETALLE));

/* ── Parte 2 · cliente ── */
const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1300, height: 950 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.__boot = null;
    window.google = { script: { run: { withSuccessHandler(okF) { return { withFailureHandler() { return {
      api(a, d) {
        if (a === 'GET_BOOT') window.__boot = d;
        const R = {
          GET_BOOT: { ahora: '2026-09-03 10:00:00', yo: { email: '', firma: 'DMV', dev: true },
            config: { NUM_CAMAS: 12, BANNERS: {} }, fases: [], cumples: [],
            camas: [{ ID_CAMA: '7', OCUPADA: true, NOMBRE: 'PACIENTE PRUEBA', EDAD: 60 }],
            evos: [], asignacion: { team: [], assign: {} },
            alertas: [
              { nivel: 'rojo', icono: '🫧', cama: '7', ir: 'cama', titulo: 'HME vencido (01-09)', detalle: 'rótulo 31-08' },
              { nivel: 'ambar', icono: '📋', cama: '3', ir: 'cama', titulo: 'MRC-ss sin re-evaluar (hace 6 días)', detalle: 'última 44 el 28-08' },
            ],
            notifs: [
              { ID_NOTIF: 'ntf_1', TS: '2026-09-03 08:00:00', TIPO: 'nota', TITULO: '📌 Nota del turno — cama 5', DETALLE: 'Familia pide hablar con el médico', REF_CAMA: '5', AUTOR: 'MCC' },
              { ID_NOTIF: 'ntf_2', TS: '2026-09-03 07:00:00', TIPO: 'version', TITULO: '🚀 Se publicó la versión 5.91', DETALLE: '' },
            ] },
          GET_ALERTAS: { alertas: [
            { nivel: 'rojo', icono: '🫧', cama: '7', ir: 'cama', titulo: 'HME vencido (01-09)', detalle: 'rótulo 31-08' },
          ] },
          GET_NOTIFICACIONES: { notifs: [
            { ID_NOTIF: 'ntf_1', TS: '2026-09-03 08:00:00', TIPO: 'nota', TITULO: '📌 Nota del turno — cama 5', DETALLE: 'Familia pide hablar con el médico', REF_CAMA: '5', AUTOR: 'MCC' },
            { ID_NOTIF: 'ntf_2', TS: '2026-09-03 07:00:00', TIPO: 'version', TITULO: '🚀 Se publicó la versión 5.91', DETALLE: '' },
          ] },
        };
        setTimeout(() => okF({ ok: true, data: R[a] !== undefined ? R[a] : null }), 5);
      } }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2, 'index.html'));
  await p.waitForTimeout(2500);

  const R = await p.evaluate(() => ({
    version: (window.__boot && window.__boot.version) || '',
    campNum: $('campNum').textContent, campOculto: $('campNum').classList.contains('hidden'),
    buzNum: $('buzNum').textContent, buzOculto: $('buzNum').classList.contains('hidden'),
  }));
  console.log('\n4 · Cliente: los números salen del boot');
  si('★ el boot manda el sello de versión al servidor', /^\d+\.\d+/.test(R.version));
  eq('★ la campana marca 2 alertas', R.campNum + '/' + R.campOculto, '2/false');
  eq('★ el buzón marca 2 sin leer', R.buzNum + '/' + R.buzOculto, '2/false');

  const C = await p.evaluate(async () => {
    campAbrir(); await new Promise(r => setTimeout(r, 120));
    const t = $('campLista').textContent;
    const btn = !!$('campLista').querySelector('button');
    campCerrar();
    return { t, btn };
  });
  console.log('\n5 · La campana lista y navega');
  si('★ la fila dice «HME vencido (01-09) · cama 7» y «rótulo 31-08»',
    /HME vencido \(01-09\)/.test(C.t) && /cama 7/.test(C.t) && /rótulo 31-08/.test(C.t));
  si('…con su botón «Ir a la cama 7»', C.btn && /Ir a la cama 7/.test(C.t));

  const Z = await p.evaluate(async () => {
    buzAbrir(); await new Promise(r => setTimeout(r, 120));
    const conPunto = ($('buzLista').innerHTML.match(/●/g) || []).length;
    buzCerrar(); buzRender();   // re-pintar: ya deben estar leídas
    const sinPunto = ($('buzLista').innerHTML.match(/●/g) || []).length;
    return { conPunto, sinPunto, num: $('buzNum').classList.contains('hidden'),
             guardadas: (JSON.parse(localStorage.getItem('rce_notif_leidas') || '[]')).length };
  });
  console.log('\n6 · El buzón marca leído por navegador (el registro no se toca)');
  eq('★ al abrir, las 2 traen su punto azul de no-leídas', Z.conPunto, 2);
  eq('★ …y verlas las deja leídas: el punto se va', Z.sinPunto, 0);
  si('…el número del buzón se apaga', Z.num);
  eq('…lo leído quedó en localStorage (por computador)', Z.guardadas, 2);

  await b.close();
  if (errs.length) { console.log('❌ errores JS: ' + errs.join(' | ')); fails.push('js'); }
  console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
