// paquete.js — Guardia del paquete de migración (v4.9): el proyecto completo
// que se pega en un Apps Script nuevo debe traer TODO el código del repo, sin
// funciones perdidas ni duplicadas, con sintaxis válida y el manifiesto con
// los scopes que la app necesita.
// Uso: node build/checks/paquete.js   (regenera el paquete y lo verifica)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const B = path.join(__dirname, '..');
const V2 = path.join(B, '..', 'v2');
const PAQ = path.join(B, 'paquete_migracion');

const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

execFileSync('node', [path.join(B, 'paquete_migracion.js')], { stdio: 'pipe' });

const fnsDe = dir => {
  const m = new Map();
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.gs'))) {
    for (const g of fs.readFileSync(path.join(dir, f), 'utf8').matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)) {
      m.set(g[1], (m.get(g[1]) || []).concat(f));
    }
  }
  return m;
};
const repo = fnsDe(V2), paq = fnsDe(PAQ);

eq('mismo número de funciones que el repo', paq.size, repo.size);
eq('ninguna función del repo quedó fuera', [...repo.keys()].filter(k => !paq.has(k)).join(',') || 'ninguna', 'ninguna');
eq('sin funciones que el repo no tenga', [...paq.keys()].filter(k => !repo.has(k)).join(',') || 'ninguna', 'ninguna');
eq('sin funciones duplicadas entre archivos', [...paq].filter(([, v]) => v.length > 1).map(([k]) => k).join(',') || 'ninguna', 'ninguna');

const gs = fs.readdirSync(PAQ).filter(f => f.endsWith('.gs'));
eq('layout de producción: 9 archivos .gs', gs.length, 9);

// Sintaxis real (node no reconoce .gs: se comprueba copiando a .js)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'paq-'));
const malos = gs.filter(f => {
  const d = path.join(tmp, f.replace(/\.gs$/, '.js'));
  fs.copyFileSync(path.join(PAQ, f), d);
  try { execFileSync('node', ['--check', d], { stdio: 'pipe' }); return false; } catch (e) { return true; }
});
fs.rmSync(tmp, { recursive: true, force: true });
eq('todos los .gs compilan', malos.join(',') || 'ninguno con error', 'ninguno con error');

// Piezas imprescindibles para que la app arranque en un proyecto nuevo
const leer = f => fs.readFileSync(path.join(PAQ, f), 'utf8');
eq('doGet presente (punto de entrada de la Web App)', /function doGet\s*\(/.test(leer('webapp.gs')), true);
eq('el index viaja en formato cohete (no crudo)', /rce-version/.test(leer('index.html')) && /atob|base64/i.test(leer('index.html')), true);
eq('crearORepararEstructura disponible', paq.has('crearORepararEstructura'), true);
eq('instalarTriggerBackup disponible (respaldo diario)', paq.has('instalarTriggerBackup'), true);
eq('obtenerDocumentos disponible (carpeta de la unidad)', paq.has('obtenerDocumentos'), true);

const man = JSON.parse(leer('appsscript.json'));
const scopes = man.oauthScopes || [];
eq('manifiesto: scope de planilla', scopes.some(s => s.indexOf('spreadsheets') > -1), true);
eq('manifiesto: scope de Drive (documentos, respaldos, fotos)', scopes.some(s => s.endsWith('/drive')), true);
eq('manifiesto: scope de activadores (respaldo automático)', scopes.some(s => s.indexOf('script.scriptapp') > -1), true);
eq('manifiesto: se publica como app web accesible', (man.webapp || {}).access, 'ANYONE_ANONYMOUS');
eq('manifiesto: zona horaria de Chile', man.timeZone, 'America/Santiago');

console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
process.exit(fails.length ? 1 : 0);
