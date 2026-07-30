// docs.js — Guardia del módulo 📂 Documentos de la unidad (v4.7):
// servicio obtenerDocumentos (carpeta auto-creada con subcarpetas, cache,
// listado agrupado) y UI (botón en el Registro Diario, modal, enlaces
// seguros, refresco). Uso: node build/checks/docs.js
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };

/* ── 1 · Servicio en Node con stubs de Drive/Cache ── */
(function servicio() {
  const CONF = {};
  let seq = 0;
  const mkFolder = (nombre) => {
    const f = {
      _id: 'F' + (++seq), _nombre: nombre, _folders: [], _files: [],
      getId() { return this._id; }, getName() { return this._nombre; },
      getUrl() { return 'https://drive/folder/' + this._id; },
      createFolder(n) { const s = mkFolder(n); this._folders.push(s); return s; },
      getFolders() { const a = [...this._folders]; return { hasNext: () => a.length > 0, next: () => a.shift() }; },
      getFiles() { const a = [...this._files]; return { hasNext: () => a.length > 0, next: () => a.shift() }; },
    };
    return f;
  };
  const RAICES = [];
  const sandbox = {
    leerConfig: (k, d) => (k in CONF ? CONF[k] : d),
    escribirConfig: (k, v) => { CONF[k] = v; },
    DriveApp: {
      createFolder(n) { const f = mkFolder(n); RAICES.push(f); return f; },
      getFolderById(id) { const busca = (fs2) => { for (const f of fs2) { if (f._id === id) return f; const s = busca(f._folders); if (s) return s; } return null; }; const f = busca(RAICES); if (!f) throw new Error('not found'); return f; },
    },
    CacheService: { _c: {}, getScriptCache() { const c = this._c; return { get: k => c[k] || null, put: (k, v) => { c[k] = v; } }; } },
    Utilities: { formatDate: () => '29-07-2026' },
    ok: d => ({ ok: true, data: d }), err: (m) => ({ ok: false, error: m }), ERR: { INTERNO: 'INTERNO' },
    console,
  };
  const src = fs.readFileSync(path.resolve(__dirname, '..', '..', 'v2', 'svc_docs.gs'), 'utf8');
  const fn = new Function(...Object.keys(sandbox), src + '\n;return { obtenerDocumentos };');
  const { obtenerDocumentos } = fn(...Object.values(sandbox));

  const r1 = obtenerDocumentos(false);
  eq('svc · primera llamada crea la carpeta y responde ok', r1.ok, true);
  eq('svc · ID persistido en CONFIG.DOCS_FOLDER', !!CONF.DOCS_FOLDER, true);
  const raiz = sandbox.DriveApp.getFolderById(CONF.DOCS_FOLDER);
  eq('svc · subcarpetas Imprimibles y Protocolos creadas', raiz._folders.map(f => f._nombre).sort().join(','), 'Imprimibles,Protocolos');
  eq('svc · sin archivos aún: grupos con listas vacías', r1.data.grupos.every(g => g.archivos.length === 0), true);

  // Archivos nuevos: el cache de 5 min los oculta hasta refrescar
  const mkFile = (n, mime) => ({ getName: () => n, getUrl: () => 'https://drive/file/' + n, getMimeType: () => mime, getLastUpdated: () => new Date() });
  raiz._folders.find(f => f._nombre === 'Protocolos')._files.push(mkFile('Protocolo weaning.pdf', 'application/pdf'));
  raiz._folders.find(f => f._nombre === 'Imprimibles')._files.push(mkFile('Hoja de registro.pdf', 'application/pdf'));
  raiz._files.push(mkFile('Suelto.docx', 'application/vnd.google-apps.document'));
  const r2 = obtenerDocumentos(false);
  eq('svc · con cache vigente sigue la lista vieja', r2.data.grupos.every(g => g.archivos.length === 0), true);
  const r3 = obtenerDocumentos(true);
  const nom = g => (r3.data.grupos.find(x => x.nombre === g) || { archivos: [] }).archivos.map(a => a.nombre).join(',');
  eq('svc · refrescar=true lista Protocolos', nom('Protocolos'), 'Protocolo weaning.pdf');
  eq('svc · refrescar=true lista Imprimibles', nom('Imprimibles'), 'Hoja de registro.pdf');
  eq('svc · archivos en la raíz van a «Otros documentos»', nom('Otros documentos'), 'Suelto.docx');
  eq('svc · carpetaUrl presente para el botón de Drive', /^https:/.test(r3.data.carpetaUrl), true);
})();

/* ── 2 · UI en Chromium con puente simulado ── */
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('c:' + m.text()); });
  await p.addInitScript(() => {
    window._ll = [];
    const DOCS = { carpetaUrl: 'https://drive.google.com/drive/folders/XYZ', grupos: [
      { nombre: 'Imprimibles', url: 'u1', archivos: [{ nombre: 'Hoja de registro.pdf', url: 'https://drive/f1', mime: 'application/pdf', actualizado: '28-07-2026' }] },
      { nombre: 'Protocolos', url: 'u2', archivos: [
        { nombre: 'Protocolo weaning "2026" <borrador>.pdf', url: 'https://drive/f2', mime: 'application/pdf', actualizado: '29-07-2026' },
        { nombre: 'Cuff y válvula.gdoc', url: 'https://drive/f3', mime: 'application/vnd.google-apps.document', actualizado: '29-07-2026' },
      ] },
    ] };
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a, d) { window._ll.push({ a, d }); setTimeout(() => ok({ ok: true, data: a === 'GET_DOCUMENTOS' ? DOCS : null }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.resolve(__dirname, '..', '..', 'v2', 'index.html'));
  await p.waitForTimeout(500);

  const UI = await p.evaluate(async () => {
    const btn = [...document.querySelectorAll('.tbl-bar button')].find(x => x.textContent.indexOf('Documentos') > -1);
    if (btn) btn.click(); else docsAbrir();
    await new Promise(r => setTimeout(r, 60));
    const links = [...document.querySelectorAll('#docsLista a')];
    return {
      modal: $('docsMod').classList.contains('on') && $('ovl').classList.contains('on'),
      botonEnBarra: !!btn,
      grupos: [...document.querySelectorAll('#docsLista div')].filter(d => /IMPRIMIBLES|PROTOCOLOS/i.test(d.textContent) && d.style.textTransform === 'uppercase').length,
      links: links.length,
      blank: links.every(a => a.target === '_blank' && a.rel.indexOf('noopener') > -1),
      escapado: links.some(a => a.textContent.indexOf('<borrador>') > -1) && !document.querySelector('#docsLista borrador'),
      payload1: window._ll.filter(x => x.a === 'GET_DOCUMENTOS').map(x => !!(x.d && x.d.refrescar)).join(','),
    };
  });
  eq('ui · botón 📂 Documentos en la barra del Registro Diario', UI.botonEnBarra, true);
  eq('ui · modal y velo abiertos', UI.modal, true);
  eq('ui · dos grupos rotulados', UI.grupos, 2);
  eq('ui · 3 enlaces listados', UI.links, 3);
  eq('ui · enlaces con target _blank + noopener', UI.blank, true);
  eq('ui · nombres de archivo escapados (no inyectan HTML)', UI.escapado, true);
  eq('ui · primera carga pide refrescar=false', UI.payload1, 'false');

  const REF = await p.evaluate(async () => {
    docsCargar(true);
    await new Promise(r => setTimeout(r, 60));
    return {
      payloads: window._ll.filter(x => x.a === 'GET_DOCUMENTOS').map(x => !!(x.d && x.d.refrescar)).join(','),
      cierra: (docsCerrar(), !$('docsMod').classList.contains('on') && !$('ovl').classList.contains('on')),
      reabre: (docsAbrir(), window._ll.filter(x => x.a === 'GET_DOCUMENTOS').length),
    };
  });
  eq('ui · 🔄 Actualizar pide refrescar=true', REF.payloads, 'false,true');
  eq('ui · la X cierra modal y velo', REF.cierra, true);
  eq('ui · reabrir usa el cache del cliente (sin nueva llamada)', REF.reabre, 2);

  const VACIO = await p.evaluate(() => { docsRender({ carpetaUrl: 'x', grupos: [] }); return $('docsLista').textContent.indexOf('vacía') > -1; });
  eq('ui · estado vacío con instrucción de subir a Drive', VACIO, true);

  await b.close();
  if (errs.length) { console.log('❌ errores JS:', errs.join(' | ')); fails.push('errores JS'); }
  else console.log('\nsin errores JS');
  console.log(fails.length ? `❌ ${fails.length} FALLOS` : '✅ TODO OK');
  process.exit(fails.length ? 1 : 0);
})();
