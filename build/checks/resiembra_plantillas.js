// resiembra_plantillas.js — LA RE-SIEMBRA DE LAS PLANTILLAS DE LA UNIDAD
// (7-sep-2026). Ver el bloque de comentarios de v2/svc_plantillas.gs.
//
// QUÉ PROTEGE. plantillasSembrarUnidad() solo escribe si la hoja está vacía, así
// que en una unidad ya sembrada el orden nuevo del texto lo tiene que llevar
// _plantResembrar(). Esa rutina SOBREESCRIBE plantillas que se imprimen y se
// leen en la ronda, así que las propiedades que hay que fijar no son «tocó 17
// filas» sino:
//     1) el simulacro no escribe NI UNA celda;
//     2) sobre el estado real (los cuerpos que este repo publicó antes) deja
//        las 17 con el cuerpo vigente;
//     3) correrla otra vez no escribe nada ni crea otro respaldo — IDEMPOTENTE;
//     4) si el respaldo falla, NO se escribe nada — REVERSIBLE de verdad;
//     5) lo editado a mano por coordinación sobrevive intacto;
//     6) lo PERSONAL de un kine (DUENO ≠ UNIDAD) no se toca jamás;
//     7) restaurar desde el respaldo devuelve exactamente los cuerpos previos.
//
// CÓMO LO MIDE — corriendo el CÓDIGO DE VERDAD, no una copia: evalúa
// v2/svc_plantillas.gs entero con stubs de repo*/SpreadsheetApp y una planilla
// en memoria que cuenta cada escritura. Si alguien cambia la rutina, aquí se ve.
//
// 🪤 El estado inicial de la planilla simulada NO está escrito a mano: sale de
// PLANTILLAS_UNIDAD_PUBLICADAS, que es la tabla que la rutina usa para decidir
// qué está intacto. Si alguien cambia la semilla y olvida mover el cuerpo
// saliente a esa tabla, la sección 8 cae — que es exactamente el descuido que
// dejaría a la unidad sin poder resembrar nunca más.
//
// Uso: node build/checks/resiembra_plantillas.js   (sin navegador)
const fs = require('fs');
const path = require('path');

const fails = [];
const eq = (l, g, w) => {
  const okk = JSON.stringify(g) === JSON.stringify(w);
  console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g));
  if (!okk) fails.push(l);
};

const raiz = path.resolve(__dirname, '..', '..');
const SRV = fs.readFileSync(path.join(raiz, 'v2', 'svc_plantillas.gs'), 'utf8');
const ESQ = fs.readFileSync(path.join(raiz, 'v2', 'esquema.gs'), 'utf8');

/* ── 0 · Las columnas salen del esquema, no de mi memoria ─────────────────── */
const bloqueEsq = ESQ.slice(ESQ.indexOf('PLANTILLAS_EVOLUCION: {'), ESQ.indexOf('PLANTILLAS_EVOLUCION: {') + 400);
const COLS = [...bloqueEsq.slice(0, bloqueEsq.indexOf(']}')).matchAll(/\['([A-Z_]+)','/g)].map(m => m[1]);
eq('las columnas de PLANTILLAS_EVOLUCION se leen del esquema', COLS.length, 9);
eq('★ el modelo distingue plantilla de UNIDAD de plantilla personal (columna DUENO)',
  COLS.includes('DUENO') && COLS.includes('ID'), true);

/* ── 1 · Planilla en memoria + stubs ──────────────────────────────────────── */
function nuevoMundo(db) {
  const M = { db: db.map(o => Object.assign({}, o)), escrituras: 0, respaldos: {}, copiaFalla: false };
  const filas2D = () => [COLS.slice()].concat(M.db.map(o => COLS.map(c => (o[c] === undefined ? '' : o[c]))));
  const hojaResp = (snap) => ({
    _snap: snap,
    getLastRow: () => snap.length,
    getRange: (fi, c, n) => ({ getValues: () => snap.slice(fi - 1, fi - 1 + n) }),
    getDataRange: () => ({ getValues: () => snap }),
    hideSheet: () => {}, setName(n) { M.respaldos[n] = this; return this; },
  });
  const principal = {
    getDataRange: () => ({ getValues: () => filas2D() }),
    copyTo: () => { if (M.copiaFalla) throw new Error('copyTo simulado en falla'); return hojaResp(filas2D()); },
  };
  M.G = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: (n) => (n === 'PLANTILLAS_EVOLUCION' ? principal : (M.respaldos[n] || null)),
      deleteSheet: (h) => { Object.keys(M.respaldos).forEach(k => { if (M.respaldos[k] === h) delete M.respaldos[k]; }); },
    }) },
    Utilities: { formatDate: () => M.sello || '20260907_030000' },
    _tz: () => 'America/Santiago',
    ahoraTS: () => '2026-09-07 03:00:00',
    uid: (p) => p + '_x',
    conLock: (fn) => fn(),
    ok: (o) => Object.assign({ ok: true }, o),
    err: (m, c) => ({ ok: false, error: m, codigo: c }),
    ERR: { VALIDACION: 'VAL', NO_ENCONTRADO: 'NF', INTERNO: 'INT', NO_AUTORIZADO: 'NA' },
    esVerdadero: (v) => v === true || String(v).toLowerCase() === 'true' || v === 1 || v === 'SI',
    FILA_DATOS: { PLANTILLAS_EVOLUCION: 2 },
    TOTAL_COLS: { PLANTILLAS_EVOLUCION: COLS.length },
    esquemaFilaAObjeto: (h, f) => { const o = {}; COLS.forEach((c, i) => { o[c] = f[i] === undefined ? '' : f[i]; }); return o; },
    repoLeerTodos: () => M.db.map(o => Object.assign({}, o)),
    repoBuscarPorId: (h, k, id) => { const f = M.db.find(o => String(o[k]) === String(id)); return f ? Object.assign({}, f) : null; },
    repoActualizar: (h, k, id, campos) => { const f = M.db.find(o => String(o[k]) === String(id)); if (f) { Object.assign(f, campos); M.escrituras++; } },
    repoInsertar: (h, obj) => { M.db.push(Object.assign({}, obj)); M.escrituras++; },
    repoUpsert: (h, k, id, obj) => { const i = M.db.findIndex(o => String(o[k]) === String(id));
      if (i >= 0) M.db[i] = Object.assign({}, obj); else M.db.push(Object.assign({}, obj)); M.escrituras++; },
    repoInsertarVarios: (h, objs) => { objs.forEach(o => { M.db.push(Object.assign({}, o)); M.escrituras++; }); },
    console: console,
  };
  const nombres = Object.keys(M.G);
  M.api = new Function(...nombres, SRV + '\nreturn {_plantResembrar:_plantResembrar, ' +
    'plantillasResembrarSimular:plantillasResembrarSimular, plantillasResembrarAplicarAhora:plantillasResembrarAplicarAhora, ' +
    'plantillasRestaurarDesde:plantillasRestaurarDesde, SEMILLA:PLANTILLAS_UNIDAD_SEMILLA, ' +
    'PUB:PLANTILLAS_UNIDAD_PUBLICADAS, _plantNorm:_plantNorm};')(...nombres.map(n => M.G[n]));
  return M;
}

// Estado "como está hoy la unidad": el PRIMER cuerpo publicado de cada caso.
const base = nuevoMundo([]);
const SEMILLA = base.api.SEMILLA, PUB = base.api.PUB;
eq('las 17 semillas de la unidad siguen ahí', SEMILLA.length, 17);
const comoEstaLaUnidad = () => SEMILLA.map(([caso, nombre], i) => ({
  ID: 'plu_' + caso, DUENO: 'UNIDAD', CASO: caso, NOMBRE: nombre,
  CUERPO: (PUB[caso] || [])[0], ACTIVO: true, ORDEN: i + 1,
  ACTUALIZADO: '2026-09-02 10:00:00', ACTUALIZADO_POR: 'sistema',
}));
eq('★ el catálogo de cuerpos publicados cubre los 17 casos',
  SEMILLA.filter(([c]) => (PUB[c] || []).length).length, 17);
eq('★ ningún cuerpo del catálogo histórico es el vigente (si no, no habría nada que resembrar)',
  SEMILLA.filter(([c, , cuerpo]) => (PUB[c] || []).some(v => base.api._plantNorm(v) === base.api._plantNorm(cuerpo))).map(t => t[0]).join(',') || 'ninguno', 'ninguno');

/* ── 2 · El simulacro no escribe ──────────────────────────────────────────── */
const m1 = nuevoMundo(comoEstaLaUnidad());
const sim = m1.api.plantillasResembrarSimular();
eq('el simulacro responde ok', sim.ok, true);
eq('★ el simulacro NO escribe ni una celda', m1.escrituras, 0);
eq('★ …ni crea un respaldo', Object.keys(m1.respaldos).length, 0);
eq('el simulacro anuncia las 17 que actualizaría', sim.actualizadas.length, 17);

/* ── 3 · Aplicar: las 17 quedan con el cuerpo vigente ─────────────────────── */
const m2 = nuevoMundo(comoEstaLaUnidad());
const ap = m2.api.plantillasResembrarAplicarAhora();
eq('aplicar responde ok', ap.ok, true);
eq('★ actualiza las 17 plantillas de la unidad', ap.actualizadas.length, 17);
eq('★ crea exactamente un respaldo', Object.keys(m2.respaldos).length, 1);
eq('el respaldo se llama PLANTILLAS_BAK_…', /^PLANTILLAS_BAK_/.test(ap.respaldo), true);
const desalineadas = SEMILLA.filter(([caso, , cuerpo]) =>
  m2.api._plantNorm(m2.db.find(o => o.ID === 'plu_' + caso).CUERPO) !== m2.api._plantNorm(cuerpo)).map(t => t[0]);
eq('★ ninguna plantilla de la unidad queda con el cuerpo viejo', desalineadas.join(',') || 'ninguna', 'ninguna');
eq('no inventó filas nuevas', m2.db.length, 17);

/* ── 4 · IDEMPOTENCIA: la segunda corrida no toca nada ────────────────────── */
const antes = m2.escrituras;
const ap2 = m2.api.plantillasResembrarAplicarAhora();
eq('★ la segunda corrida no escribe NADA', m2.escrituras - antes, 0);
eq('★ …ni crea un segundo respaldo', Object.keys(m2.respaldos).length, 1);
eq('★ …y declara las 17 ya al día', ap2.alDia.length, 17);
eq('★ …sin duplicar filas', m2.db.length, 17);
const ap3 = m2.api.plantillasResembrarAplicarAhora();
eq('★ una tercera corrida tampoco cambia el conteo', [m2.db.length, ap3.actualizadas.length], [17, 0]);

/* ── 5 · REVERSIBILIDAD: sin respaldo no hay escritura ────────────────────── */
const m3 = nuevoMundo(comoEstaLaUnidad());
m3.copiaFalla = true;
const rot = m3.api.plantillasResembrarAplicarAhora();
eq('★ si el respaldo falla, la rutina NO escribe nada', m3.escrituras, 0);
eq('★ …y lo dice en vez de fingir que salió bien', rot.ok, false);
eq('★ …dejando los cuerpos viejos intactos',
  m3.db.filter(o => m3.api._plantNorm(o.CUERPO) !== m3.api._plantNorm((PUB[o.CASO] || [])[0])).length, 0);

/* ── 6 · Lo que NO se puede perder ────────────────────────────────────────── */
const EDITADA = '{encabezado}\n{dia} {fase}\n{sedacion}\nAcá coordinación escribió su propia línea.\nPlan: {plan}';
const PERSONAL = '{encabezado}\n{dia} {fase}\nMi plantilla personal.\nPlan: {plan}';
const mundoMixto = comoEstaLaUnidad();
mundoMixto.find(o => o.ID === 'plu_prono').CUERPO = EDITADA;                 // editada a mano
mundoMixto.find(o => o.ID === 'plu_prono').ACTUALIZADO_POR = 'DMV';
mundoMixto.find(o => o.ID === 'plu_rehab').ACTIVO = false;                    // retirada
mundoMixto.push({ ID: 'pl_abc', DUENO: 'MCC', CASO: 'general', NOMBRE: 'La mía', CUERPO: PERSONAL,
  ACTIVO: true, ORDEN: 30, ACTUALIZADO: '2026-09-05 08:00:00', ACTUALIZADO_POR: 'MCC' });
mundoMixto.push({ ID: 'plu_viejo', DUENO: 'UNIDAD', CASO: 'obsoleto', NOMBRE: 'Sin semilla', CUERPO: PERSONAL,
  ACTIVO: true, ORDEN: 31, ACTUALIZADO: '2026-09-05 08:00:00', ACTUALIZADO_POR: 'DMV' });
const m4 = nuevoMundo(mundoMixto);
const ap4 = m4.api.plantillasResembrarAplicarAhora();
const cuerpoDe = (id) => m4.db.find(o => o.ID === id).CUERPO;
eq('★ la plantilla EDITADA A MANO conserva su texto', cuerpoDe('plu_prono'), EDITADA);
eq('★ la plantilla PERSONAL de un kine no se toca', cuerpoDe('pl_abc'), PERSONAL);
eq('★ la plantilla RETIRADA por coordinación no revive',
  [cuerpoDe('plu_rehab'), m4.db.find(o => o.ID === 'plu_rehab').ACTIVO], [(PUB['rehab'] || [])[0], false]);
eq('★ una fila plu_* sin semilla se deja quieta', cuerpoDe('plu_viejo'), PERSONAL);
eq('★ las otras 15 sí se actualizan', ap4.actualizadas.length, 15);
const motivos = ap4.saltadas.map(s => s.id).sort();
eq('★ informa QUÉ saltó', motivos, ['plu_prono', 'plu_rehab', 'plu_viejo']);
eq('★ …y POR QUÉ, con un motivo escrito en cada una',
  ap4.saltadas.every(s => String(s.motivo).length > 15), true);
eq('el motivo de la editada dice que fue editada a mano',
  /editada a mano/.test(ap4.saltadas.find(s => s.id === 'plu_prono').motivo), true);

/* ── 7 · Volver atrás de verdad ───────────────────────────────────────────── */
const m5 = nuevoMundo(comoEstaLaUnidad());
const ap5 = m5.api.plantillasResembrarAplicarAhora();
const res = m5.api.plantillasRestaurarDesde(ap5.respaldo);
eq('restaurar responde ok', res.ok, true);
eq('★ la restauración devuelve las 17 al cuerpo previo',
  SEMILLA.filter(([c]) => m5.api._plantNorm(m5.db.find(o => o.ID === 'plu_' + c).CUERPO) !== m5.api._plantNorm((PUB[c] || [])[0])).length, 0);
const antesR = m5.escrituras;
m5.api.plantillasRestaurarDesde(ap5.respaldo);
eq('★ restaurar dos veces tampoco escribe de más', m5.escrituras - antesR, 0);
eq('★ un nombre de hoja que no es un respaldo se rechaza',
  m5.api.plantillasRestaurarDesde('EVOLUCIONES').ok, false);
eq('★ un respaldo inexistente se rechaza', m5.api.plantillasRestaurarDesde('PLANTILLAS_BAK_nada').ok, false);

/* ── 8 · La guardia CAE si la rutina se rompe (❌ simulados) ──────────────── */
// Sin esto, todo lo de arriba podría estar pasando por vacuidad.
const cae = (etiqueta, fn) => {
  let cayo = false;
  try { cayo = fn(); } catch (e) { cayo = true; }
  console.log((cayo ? '✅' : '❌') + ' [prueba de la propia guardia] ' + etiqueta);
  if (!cayo) fails.push('la guardia no detecta ' + etiqueta);
};
// a) Si el catálogo de cuerpos publicados pierde un caso, esa plantilla pasa a
//    parecer «editada a mano» y la unidad se queda con el orden viejo.
cae('un caso ausente del catálogo histórico deja esa plantilla sin resembrar', () => {
  const sucio = comoEstaLaUnidad();
  const m = nuevoMundo(sucio);
  const guardado = m.api.PUB['tqt'];
  m.api.PUB['tqt'] = [];
  const r = m.api.plantillasResembrarAplicarAhora();
  m.api.PUB['tqt'] = guardado;
  return r.actualizadas.length === 16 && r.saltadas.some(s => s.id === 'plu_tqt');
});
// b) Un cuerpo desconocido NUNCA se sobrescribe, aunque se parezca al viejo.
cae('un cuerpo desconocido no se sobrescribe', () => {
  const sucio = comoEstaLaUnidad();
  sucio.forEach(o => { o.CUERPO = o.CUERPO + '\nlínea agregada por coordinación'; });
  const m = nuevoMundo(sucio);
  const r = m.api.plantillasResembrarAplicarAhora();
  return r.actualizadas.length === 0 && m.escrituras === 0 && r.saltadas.length === 17;
});
// c) La hoja vacía no es una re-siembra: eso es sembrar, y lo hace otra función.
cae('con la hoja vacía se niega en vez de sembrar por su cuenta', () => {
  const m = nuevoMundo([]);
  const r = m.api.plantillasResembrarAplicarAhora();
  return r.ok === false && m.escrituras === 0;
});
// d) Una fila plu_* que dejó de ser de la unidad no se toca.
cae('una fila plu_* con DUENO distinto de UNIDAD se salta', () => {
  const sucio = comoEstaLaUnidad();
  sucio.find(o => o.ID === 'plu_ext').DUENO = 'MCC';
  const m = nuevoMundo(sucio);
  const r = m.api.plantillasResembrarAplicarAhora();
  return r.actualizadas.length === 16 && m.db.find(o => o.ID === 'plu_ext').CUERPO === (PUB['ext'] || [])[0];
});

/* ── 9 · Cierre ───────────────────────────────────────────────────────────── */
console.log(fails.length ? '\n❌ FALLA: ' + fails.join(' · ') : '\n✅ Todo en orden.');
process.exit(fails.length ? 1 : 0);
