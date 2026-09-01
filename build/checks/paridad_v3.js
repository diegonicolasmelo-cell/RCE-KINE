// paridad_v3.js — Guardia de paridad entre el código FUENTE (`v2/`) y el espejo
// que se pega en el editor de Apps Script (`V3 colaborativa/`), que es lo que
// de verdad corre en producción.
//
// 🪤 Por qué existe (25-ago-2026): el arreglo del código REM 601171 (los inicios
// de VNI) se aplicó a `v2/svc_rem.gs` y la batería dio 99/99 en verde — pero
// `V3 colaborativa/servicios.gs` seguía con el bug, así que lo pegado en el
// editor lo conservaba. NINGUNA guardia comparaba las dos capas: la fuente y lo
// que corre podían separarse en silencio, y un arreglo "verde" no llegaba nunca
// al hospital. Esta guardia cierra ese hueco.
//
// Uso: node build/checks/paridad_v3.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const raiz = path.join(__dirname, '..', '..');
const v2 = path.join(raiz, 'v2');
const v3 = path.join(raiz, 'V3 colaborativa');
const build = path.join(raiz, 'build');
const leer = p => fs.readFileSync(p, 'utf8');
const tmp = n => path.join(os.tmpdir(), n);

const fails = [];
const si = (l, cond, detalle) => {
  console.log((cond ? '✅' : '❌') + ' ' + l + (cond || !detalle ? '' : ' — ' + detalle));
  if (!cond) fails.push(l);
};

/* ── 1 · Copias 1:1 — el archivo del editor es el fuente, carácter a carácter ── */
const COPIAS = ['api.gs', 'esquema.gs', 'repo.gs', 'webapp.gs', 'mantenimiento.gs',
  'mantenimiento_manuel.gs', 'spike.gs', 'appsscript.json', 'spike_gis.html'];
for (const f of COPIAS) {
  const a = leer(path.join(v2, f)), b = leer(path.join(v3, f));
  si('copia 1:1 · ' + f, a === b, 'la fuente tiene ' + a.length + ' chars y el espejo ' + b.length);
}

/* ── 2 · servicios.gs — la fusión real, regenerada con el mismo script ── */
const salidaSvc = tmp('paridad_servicios.gs');
execFileSync('node', [path.join(build, 'fusionar_servicios.js'), salidaSvc], { stdio: 'pipe' });
si('fusión · servicios.gs = fusión de los v2/svc_*.gs',
  leer(salidaSvc) === leer(path.join(v3, 'servicios.gs')),
  'regenerá con: node build/fusionar_servicios.js "V3 colaborativa/servicios.gs"');

/* ── 3 · index.html — el cohete, regenerado con el mismo empaquetador ── */
const salidaCoh = tmp('paridad_cohete.html');
execFileSync('node', [path.join(build, 'empaquetar_cohete.js'), salidaCoh], { stdio: 'pipe' });
si('cohete · index.html = v2/index.html empaquetado',
  leer(salidaCoh) === leer(path.join(v3, 'index.html')),
  'regenerá con: node build/empaquetar_cohete.js "V3 colaborativa/index.html" (y subí VERSION)');

/* ── 4 · infra.gs y dominio.gs — no tienen script propio: se comprueba que el
       texto íntegro de cada fuente esté dentro del fusionado del editor ── */
const GRUPOS = { 'infra.gs': 'infra_', 'dominio.gs': 'dominio_' };
for (const [destino, prefijo] of Object.entries(GRUPOS)) {
  const txt = leer(path.join(v3, destino));
  const fuentes = fs.readdirSync(v2).filter(f => f.startsWith(prefijo) && f.endsWith('.gs')).sort();
  si('fusión · ' + destino + ' contiene sus ' + fuentes.length + ' fuentes',
    fuentes.length > 0 && fuentes.every(f => txt.includes(leer(path.join(v2, f)).trim())),
    'quedaron fuera: ' + fuentes.filter(f => !txt.includes(leer(path.join(v2, f)).trim())).join(', '));
}

/* ── 5 · El sello de versión tiene que ser el mismo en las dos capas ── */
const sello = t => (t.match(/rce-version"\s+content="([^"]*)"/) || [])[1];
const sFuente = sello(leer(path.join(v2, 'index.html')));
const sEspejo = sello(leer(path.join(v3, 'index.html')));
si('sello de versión igual en fuente y espejo: ' + sFuente, sFuente === sEspejo, 'el espejo dice ' + sEspejo);

console.log(fails.length ? '\n❌ ' + fails.length + ' FALLOS' : '\n✅ TODO OK');
process.exit(fails.length ? 1 : 0);
