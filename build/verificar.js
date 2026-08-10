#!/usr/bin/env node
// verificar.js — CORREDOR DE LA BATERÍA (ago-2026).
//
// Hasta hoy la batería se corría con un bucle escrito a mano en cada sesión, y
// exportando CHROMIUM_PATH de memoria: la mitad de las «rojas» que aparecían no
// eran código roto sino la variable olvidada. Este corredor resuelve el binario
// solo, corre las 64 guardias y juzga **por código de salida**, que es la única
// lectura válida —varias guardias imprimen ❌ SIMULADOS a propósito, montando el
// escenario roto para demostrar que lo detectan—.
//
//   node build/verificar.js              → todas
//   node build/verificar.js eventos      → solo las que contengan «eventos»
//   node build/verificar.js -j 1         → en serie (para leer una salida entera)
//   node build/verificar.js --ver eventos_ui   → imprime la salida completa
//
// Sale 0 si todas pasan, 1 si alguna falla. Nada de listas de «rojas conocidas»:
// una guardia que falla es una guardia que hay que arreglar o borrar con su
// razón escrita; esconderla detrás de una excepción es cómo se pudren.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = path.join(__dirname, 'checks');

// ── Dónde está Chromium ──────────────────────────────────────────────────────
// Playwright lo instala versionado bajo ms-playwright/, así que la ruta cambia
// con cada actualización: se busca, no se escribe a mano.
function buscarChromium() {
  if (process.env.CHROMIUM_PATH && fs.existsSync(process.env.CHROMIUM_PATH)) return process.env.CHROMIUM_PATH;
  const cache = process.platform === 'darwin'
    ? path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
    : path.join(os.homedir(), '.cache', 'ms-playwright');
  if (fs.existsSync(cache)) {
    for (const d of fs.readdirSync(cache).filter(x => /^chromium-\d+$/.test(x)).sort().reverse()) {
      for (const sub of ['chrome-mac-arm64', 'chrome-mac', 'chrome-linux']) {
        for (const bin of ['Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing', 'chrome']) {
          const c = path.join(cache, d, sub, bin);
          if (fs.existsSync(c)) return c;
        }
      }
    }
  }
  for (const c of ['/opt/pw-browsers/chromium',
                   '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

// ── Argumentos ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let paralelo = 4, verboso = false;
const i = args.indexOf('-j'); if (i >= 0) { paralelo = Math.max(1, parseInt(args[i + 1], 10) || 1); args.splice(i, 2); }
const v = args.indexOf('--ver'); if (v >= 0) { verboso = true; args.splice(v, 1); }
const filtros = args.filter(a => !a.startsWith('-'));

const guardias = fs.readdirSync(DIR).filter(f => f.endsWith('.js'))
  .filter(f => !filtros.length || filtros.some(q => f.includes(q))).sort();

if (!guardias.length) { console.error('No hay guardias que coincidan con: ' + filtros.join(' ')); process.exit(1); }

const chromium = buscarChromium();
if (!chromium) {
  console.error('⚠️  No encontré Chromium. Las guardias con navegador van a fallar por eso,\n' +
                '    no por el código. Instalar con:  npx playwright install chromium');
}
const env = Object.assign({}, process.env, chromium ? { CHROMIUM_PATH: chromium } : {});

// ── Correr ───────────────────────────────────────────────────────────────────
const t0 = Date.now();
const verdes = [], rojas = [];
let siguiente = 0, vivos = 0;

function lanzar() {
  while (vivos < paralelo && siguiente < guardias.length) {
    const f = guardias[siguiente++];
    vivos++;
    let salida = '';
    const hijo = spawn(process.execPath, [path.join(DIR, f)], { env, cwd: path.join(__dirname, '..') });
    hijo.stdout.on('data', d => salida += d);
    hijo.stderr.on('data', d => salida += d);
    hijo.on('close', code => {
      vivos--;
      if (code === 0) { verdes.push(f); process.stdout.write('.'); }
      else { rojas.push({ f, code, salida }); process.stdout.write('✗'); }
      if (verboso) console.log('\n──── ' + f + ' (exit ' + code + ') ────\n' + salida);
      if (siguiente < guardias.length) lanzar();
      else if (vivos === 0) informe();
    });
  }
}

function informe() {
  const seg = ((Date.now() - t0) / 1000).toFixed(0);
  console.log('\n\n' + '═'.repeat(72));
  console.log(`  ${verdes.length} verdes · ${rojas.length} rojas   de ${guardias.length} guardias   (${seg} s)`);
  console.log('═'.repeat(72));
  if (chromium) console.log('  Chromium: ' + chromium);
  for (const r of rojas) {
    // Las últimas líneas son las que dicen qué assert cayó; la salida entera
    // se pide con --ver <nombre>.
    const cola = r.salida.trim().split('\n').slice(-12).join('\n    ');
    console.log(`\n❌ ${r.f}  (exit ${r.code})\n    ${cola}`);
  }
  if (rojas.length) console.log(`\n  Salida completa de una:  node build/verificar.js --ver ${rojas[0].f.replace('.js', '')}`);
  process.exit(rojas.length ? 1 : 0);
}

console.log(`Corriendo ${guardias.length} guardias (${paralelo} en paralelo)…`);
lanzar();
