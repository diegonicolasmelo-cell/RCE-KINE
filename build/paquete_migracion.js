/**
 * paquete_migracion.js — Genera el proyecto COMPLETO listo para pegar en un
 * Apps Script nuevo (migración de cuenta o reinstalación desde cero).
 *
 * Produce el layout de producción: 9 archivos .gs + 2 .html + el manifiesto.
 * Los archivos infra_, dominio_ y svc_ del repo viajan fusionados (mismo
 * código, menos pegado manual). El index va en formato COHETE (nunca crudo).
 *
 * Uso: node build/paquete_migracion.js [carpeta_salida]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const V2 = path.join(__dirname, '..', 'v2');
const salida = process.argv[2] || path.join(__dirname, 'paquete_migracion');

// Cada entrada = un archivo del editor de Apps Script (el nombre va SIN extensión
// en el editor; los .gs se pegan reemplazando todo el contenido).
const GRUPOS = [
  ['esquema.gs', ['esquema.gs']],
  ['repo.gs', ['repo.gs']],
  ['infra.gs', ['infra_respuesta.gs', 'infra_util.gs', 'infra_fechas.gs', 'infra_lock.gs', 'infra_log.gs', 'infra_auth.gs']],
  ['dominio.gs', ['dominio_calculos.gs', 'dominio_validacion.gs', 'dominio_texto.gs']],
  ['api.gs', ['api.gs']],
  ['webapp.gs', ['webapp.gs']],
  ['mantenimiento.gs', ['mantenimiento.gs']],
  ['spike.gs', ['spike.gs']],
];

fs.rmSync(salida, { recursive: true, force: true });
fs.mkdirSync(salida, { recursive: true });

const generados = [];
for (const [destino, fuentes] of GRUPOS) {
  let out = '';
  if (fuentes.length > 1) {
    out += `/**\n * ${destino} — fusión de ${fuentes.length} archivos del repo (${fuentes.join(', ')}).\n`
         + ' * En Apps Script todos los archivos comparten un mismo espacio global:\n'
         + ' * la fusión es organizativa, el código es idéntico.\n */\n';
    for (const f of fuentes) {
      out += '\n\n// ════════════════════════════════════════════════════════════════════\n'
           + `// ── ${f} ──\n`
           + '// ════════════════════════════════════════════════════════════════════\n\n'
           + fs.readFileSync(path.join(V2, f), 'utf8').trim() + '\n';
    }
  } else {
    out = fs.readFileSync(path.join(V2, fuentes[0]), 'utf8');
  }
  fs.writeFileSync(path.join(salida, destino), out);
  generados.push(destino);
}

// servicios.gs y el cohete se generan con sus scripts propios (única fuente)
execFileSync('node', [path.join(__dirname, 'fusionar_servicios.js'), path.join(salida, 'servicios.gs')], { stdio: 'inherit' });
generados.push('servicios.gs');
execFileSync('node', [path.join(__dirname, 'empaquetar_cohete.js'), path.join(salida, 'index.html')], { stdio: 'inherit' });
generados.push('index.html');

for (const f of ['spike_gis.html', 'appsscript.json']) {
  fs.copyFileSync(path.join(V2, f), path.join(salida, f));
  generados.push(f);
}

// Verificación: ninguna función top-level puede quedar duplicada entre archivos
const vistos = new Map();
const dups = [];
for (const f of generados.filter(x => x.endsWith('.gs'))) {
  const txt = fs.readFileSync(path.join(salida, f), 'utf8');
  for (const m of txt.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)) {
    if (vistos.has(m[1])) dups.push(`${m[1]} (${vistos.get(m[1])} y ${f})`);
    else vistos.set(m[1], f);
  }
}
if (dups.length) { console.error('❌ FUNCIONES DUPLICADAS:\n  ' + dups.join('\n  ')); process.exit(1); }

const gs = generados.filter(f => f.endsWith('.gs'));
console.log(`\n✅ Paquete en ${salida}`);
console.log(`   ${gs.length} archivos .gs · ${vistos.size} funciones · sin duplicados`);
for (const f of generados) {
  console.log('   · ' + f.padEnd(20) + (fs.statSync(path.join(salida, f)).size / 1024).toFixed(1) + ' KB');
}
