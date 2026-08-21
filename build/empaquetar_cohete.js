/**
 * empaquetar_cohete.js — Genera el index "cohete" de dos etapas para Apps Script.
 *
 * Etapa 1 (cargador): página mínima 100% ASCII que Google sirve sin procesar
 * nada especial. Etapa 2 (carga útil): el index real minificado, empaquetado
 * como base64 inerte, decodificado e inyectado por el navegador en runtime.
 * Motivo: el bootstrap de Google (userCodeAppPanel) fallaba al escribir el
 * HTML grande con caracteres especiales; al viajar como base64 no hay nada
 * que sus parsers puedan malinterpretar.
 *
 * Uso: node build/empaquetar_cohete.js [salida.html]
 */
const fs = require('fs');
const path = require('path');

// 🪤 ESCRITO A MANO: hay que SUBIRLO en cada tanda que se pegue. Es el sello que
// se ve en el editor y en la pantalla de carga, y es la única forma barata de
// confirmar que lo pegado es lo nuevo (misma clase de trampa que el total de
// columnas de testEsquema()).
const VERSION = '5.67-candado';
const fuente = path.join(__dirname, '..', 'v2', 'index.html');
const salida = process.argv[2] || path.join(__dirname, 'index_cohete.html');

// 1) Minificar: sin sangría, sin líneas vacías, sin comentarios HTML de línea
//    completa fuera de <script>.
const src = fs.readFileSync(fuente, 'utf8');
let inScript = false;
const min = src.split('\n')
  .map(l => l.replace(/^[\t ]+/, '').replace(/[\t ]+$/, ''))
  .filter(l => {
    if (/<script[\s>]/.test(l)) inScript = true;
    const drop = !inScript && /^<!--.*-->$/.test(l.trim());
    if (/<\/script>/.test(l)) inScript = false;
    return l !== '' && !drop;
  })
  .join('\n');

// 2) Empaquetar como base64 en trozos (líneas manejables para el editor).
const b64 = Buffer.from(min, 'utf8').toString('base64');
const trozos = [];
for (let i = 0; i < b64.length; i += 16000) trozos.push(b64.slice(i, i + 16000));

// 3) Cargador ASCII puro. document.write durante el parseo inserta el
//    contenido en el documento actual (los <script> internos sí se ejecutan);
//    si el entorno lo trata como reemplazo total, la limpieza posterior
//    simplemente no encuentra nada que limpiar.
const loader = [
  '<!DOCTYPE html>',
  '<html><head><meta charset="utf-8"><meta name="rce-version" content="' + VERSION + '"><title>RCE KINE UCIA v2</title></head>',
  '<body>',
  '<div id="ld" style="font-family:sans-serif;padding:30px">Cargando RCE-KINE (' + VERSION + ')...</div>',
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
    'var ld = document.getElementById("ld");',
    'if (ld && ld.parentNode) ld.parentNode.removeChild(ld);',
    '} catch (e) {',
    'var el = document.getElementById("ld");',
    'if (el) el.innerHTML = "Error del cargador ' + VERSION + ': " + (e && e.message ? e.message : e) + " <button onclick=\\"location.reload()\\">Reintentar</button>";',
    '}',
    '</' + 'script>',
    '</body></html>',
  ])
  .join('\n');

if (/[^\x00-\x7F]/.test(loader)) { console.error('ERROR: el cargador contiene caracteres no ASCII'); process.exit(1); }
fs.writeFileSync(salida, loader);
console.log('cohete generado: ' + salida + ' (' + loader.length + ' caracteres, carga util ' + min.length + ')');
