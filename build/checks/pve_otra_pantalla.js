/**
 * pve_otra_pantalla.js — LO QUE VE EL COLEGA EN EL TURNO cuando la PVE no se
 * hizo: la razón dejó de ser opcional, «Otra» pide describir cuál a la vista, y
 * la extubación sin PVE no le cobra ninguna de las dos.
 *
 * 🔴 POR QUÉ NO BASTA CON LA GUARDIA DEL SERVIDOR. `validarPVE` rechaza el
 * guardado, pero si la pantalla no dice QUÉ falta ni DÓNDE, el turno se topa con
 * un error al final y no sabe qué arreglar. Acá se fija lo que se ve.
 *
 * 🪤 LA LECCIÓN DEL LOGIN ILEGIBLE (20-ago-2026): una guardia que monta el
 * escenario con `innerHTML` o que mira solo el DOM se mide a sí misma. Acá se
 * usan las RUTAS REALES —`hPVEtoggle('no')`, el select con su `change`, el input
 * con su `input`, la casilla con su `onchange`— y el rojo se comprueba con
 * `getComputedStyle`, que es lo único que dice si llegó al píxel. El aviso se
 * mide además por CONTRASTE: un texto rojo sobre fondo rojo cumpliría «está
 * visible» y sería ilegible igual.
 *
 * ⚖️ EL LADO SIMÉTRICO, que es lo que de verdad cuida: obligar en «Otra» no
 * puede convertir las otras ocho razones en obligatorias (se prueban una por
 * una, por su nombre), y marcar «Hubo extubación en este turno (sin PVE)» tiene
 * que APAGAR las dos obligaciones — si no, el turno queda trabado pidiendo un
 * campo que el propio formulario descarta antes de mandarlo.
 *
 * Uso: node build/checks/pve_otra_pantalla.js (requiere playwright-core)
 */
const { chromium } = require('playwright-core');
const path = require('path');
const v2 = path.resolve(__dirname, '..', '..', 'v2');

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(() => {
    window.google = { script: { run: { withSuccessHandler(ok) { return { withFailureHandler() { return {
      api(a) { setTimeout(() => ok({ ok: true, data: (a === 'GET_CONFIG_UI' ? { NUM_CAMAS: 12, BANNERS: {} } : null) }), 5); }
    }; } }; } } } };
  });
  await p.goto('file://' + path.join(v2, 'index.html'));
  await p.waitForTimeout(600);

  const fails = [];
  const eq = (l, got, want) => {
    const okk = JSON.stringify(got) === JSON.stringify(want);
    console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(got) + (okk ? '' : ' (esperado ' + JSON.stringify(want) + ')'));
    if (!okk) fails.push(l);
  };
  const si = (l, c) => eq(l, !!c, true);
  // Si el bloque no está a la vista, NADA de lo que se lea prueba algo: cada
  // escenario lo comprueba antes de mirar sus campos.
  const conBloqueALaVista = (etiqueta, st) => {
    if (st.ausentes && st.ausentes.length) {
      eq('[' + etiqueta + '] la pantalla tiene sus piezas', st.ausentes.join(', '), 'ninguna falta');
      return false;
    }
    return si('[' + etiqueta + '] el bloque está a la vista', st.visible);
  };

  // 🔴 EL PANEL SE ABRE POR SU RUTA REAL, Y NO ES UN DETALLE. `#sp` nace con
  // `opacity:0` y solo la clase `.on` lo pinta. Sin abrirlo, el bloque de PVE
  // tiene tamaño, `display:block`, `visibility:visible` y `offsetParent` NO nulo
  // —o sea, pasa todas las pruebas de «visible» del DOM— y no pinta un solo
  // píxel. Esta guardia se escribió así la primera vez y la captura salió en
  // blanco: es exactamente la familia del login ilegible del 20-ago-2026.
  // La rama PVE además solo existe con vía aérea TOT.
  await p.evaluate(() => {
    abrirPanel('1', false, false);                                   // ruta real
    const va = document.getElementById('fVA');
    va.value = 'TOT'; va.dispatchEvent(new Event('change'));
    if (typeof updateVAUI === 'function') updateVAUI();
  });
  await p.waitForTimeout(400);                                       // > .25s del panel

  /* ══ 1 · EL CATÁLOGO ═══════════════════════════════════════════════════ */
  console.log('\n1 · El catálogo de razones ofrece lo que la regla nombra');
  const cat = await p.evaluate(() => {
    const sel = document.getElementById('fPveSCraz');
    return [...sel.options].map(o => o.value).filter(Boolean);
  });
  si('«Otra» está en el desplegable, con esa grafía', cat.indexOf('Otra') !== -1);
  eq('y son nueve razones', cat.length, 9);

  /* ══ 2 · LA RUTA REAL ══════════════════════════════════════════════════ */
  // 🪤 El color se mide DESPUÉS de la transición: leer `getComputedStyle` en el
  // mismo tick devuelve el valor interpolado (el de partida) y la guardia
  // reportaría «no cambió» sobre un código que sí cambia.
  const poner = async (razon, detalle, extubado) => {
    await p.evaluate(([r, d, ext]) => {
      // 🪤 `hPVEtoggle` es un TOGGLE: llamarlo dos veces con 'no' DESELECCIONA y
      // esconde la rama. Escrito ingenuamente, esta guardia apagaba el bloque en
      // cada escenario par y las aserciones pasaban en verde por estar oculto —
      // midiéndose a sí misma. Se entra solo si no está ya puesto.
      if (document.getElementById('fPVEval').value !== 'no') hPVEtoggle('no');
      const c = document.getElementById('cExtSinPve');
      if (!!c.checked !== !!ext) { c.checked = !!ext; hExtSinPve(); } // ruta real
      const sel = document.getElementById('fPveSCraz');
      sel.value = r; sel.dispatchEvent(new Event('change'));          // ruta real
      const inp = document.getElementById('fPveSCdet');
      inp.value = d; inp.dispatchEvent(new Event('input'));           // ruta real
      if (typeof rielRender === 'function') rielRender();
    }, [razon, detalle, !!extubado]);
    await p.waitForTimeout(260);                                     // > .15s
    return p.evaluate(() => {
      const inp = document.getElementById('fPveSCdet');
      const sel = document.getElementById('fPveSCraz');
      const hint = document.getElementById('dPveSCotra');
      // Si la pieza todavía no existe, esta guardia tiene que DECIRLO y seguir
      // corriendo. Reventar da el exit 1 correcto pero deja al que rompió algo
      // sin saber qué rompió, y sin ver las secciones de abajo — que son las que
      // dicen si además se perdió un dato verdadero.
      const ausentes = [
        !inp && '#fPveSCdet', !sel && '#fPveSCraz', !hint && '#dPveSCotra',
        typeof _pveRazonFalta !== 'function' && '_pveRazonFalta()',
        typeof _pveOtraSinMotivo !== 'function' && '_pveOtraSinMotivo()',
        typeof hPveSCraz !== 'function' && 'hPveSCraz()',
        typeof _pveExtSinTipo !== 'function' && '_pveExtSinTipo()',
      ].filter(Boolean);
      if (ausentes.length) return { ausentes: ausentes, visible: false };
      const cs = getComputedStyle(hint);
      // Contraste real del aviso contra el fondo que efectivamente lo pinta.
      const lum = c => {
        const [r, g, bl] = c.match(/\d+/g).slice(0, 3).map(Number).map(v => {
          v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4);
        });
        return .2126 * r + .7152 * g + .0722 * bl;
      };
      let fondo = '', el = hint;
      while (el && (!fondo || /rgba\(0, 0, 0, 0\)|transparent/.test(fondo))) {
        fondo = getComputedStyle(el).backgroundColor; el = el.parentElement;
      }
      const l1 = lum(cs.color), l2 = lum(fondo);
      // El rojo se compara contra el TOKEN resuelto, no contra un hex escrito a
      // mano: `--danger` es del design system y si alguien lo cambia la guardia
      // tiene que seguir midiendo «llegó el rojo de la casa», no un valor viejo.
      const probe = document.createElement('span');
      probe.style.color = 'var(--danger)'; document.body.appendChild(probe);
      const danger = getComputedStyle(probe).color; probe.remove();
      return {
        ausentes: [],
        danger: danger,
        faltaTipoExt: !!_pveExtSinTipo(),
        // Lo que el turno manda de verdad: si esto queda vacío Y no hay
        // extubación declarada, el servidor rechaza y la pantalla no lo dijo.
        razonQueViaja: (document.getElementById('fPVEval').value==='no' && !document.getElementById('cExtSinPve').checked)
                        ? String(document.getElementById('fPveSCraz').value||'') : '',
        extOcurrio: (typeof _extOcurrio==='function') ? _extOcurrio() : null,
        faltaRazon: !!_pveRazonFalta(),
        faltaMotivo: !!_pveOtraSinMotivo(),
        motivoEsElInput: _pveOtraSinMotivo() === inp,
        placeholder: inp.placeholder,
        bordeInput: getComputedStyle(inp).borderTopColor,
        bordeSelect: getComputedStyle(sel).borderTopColor,
        avisoVisible: cs.display !== 'none' && cs.visibility !== 'hidden',
        contraste: Math.round(((Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05)) * 100) / 100,
        riel: (document.getElementById('gFalta') || {}).textContent || '',
        // Visibilidad EFECTIVA, no la del DOM: se camina la cadena de ancestros
        // buscando el `opacity:0` que dejaba todo en verde sin pintar nada, y se
        // exige además que el bloque tenga superficie real.
        visible: (() => {
          const d = document.getElementById('dPVENoRama');
          const r = d.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return false;
          for (let el = d; el; el = el.parentElement) {
            const c = getComputedStyle(el);
            if (c.display === 'none' || c.visibility === 'hidden' || parseFloat(c.opacity) === 0) return false;
          }
          return true;
        })(),
      };
    });
  };

  console.log('\n2 · «Otra» sin describir: se ve, se nombra y se puede leer');
  const vacio = await poner('Otra', '');
  conBloqueALaVista('Otra sin motivo', vacio);
  eq('«Otra» sin motivo → falta', vacio.faltaMotivo, true);
  eq('y lo que se enfoca es el campo del motivo', vacio.motivoEsElInput, true);
  eq('el campo dejó de decir «(opcional)»', vacio.placeholder, '¿Cuál? — obligatorio');
  eq('el borde del campo llega rojo AL PÍXEL', vacio.bordeInput, vacio.danger);
  eq('el aviso está a la vista', vacio.avisoVisible, true);
  si('y se puede LEER (contraste ≥ 4.5:1)', vacio.contraste >= 4.5);
  si('el riel lo nombra', /motivo/i.test(vacio.riel));

  console.log('\n3 · Con el motivo escrito, el rojo se va');
  const lleno = await poner('Otra', 'Pabellón de urgencia a media mañana');
  conBloqueALaVista('Otra descrita', lleno);
  eq('ya no falta', lleno.faltaMotivo, false);
  eq('el borde vuelve a la normalidad', lleno.bordeInput, 'rgb(254, 202, 202)');
  eq('y el aviso se esconde', lleno.avisoVisible, false);
  eq('el riel queda limpio de PVE', /motivo de la «Otra»/.test(lleno.riel), false);

  console.log('\n4 · La razón vacía también se exige (antes se podía guardar así)');
  const sinRaz = await poner('', '');
  conBloqueALaVista('sin razón', sinRaz);
  eq('sin razón → falta', sinRaz.faltaRazon, true);
  eq('el desplegable se pinta rojo AL PÍXEL', sinRaz.bordeSelect, sinRaz.danger);
  si('y ese rojo es el token --danger, no un gris', /^rgb\(\s*(1[5-9]\d|2[0-5]\d)\s*,/.test(sinRaz.danger));
  si('el riel nombra la razón', /razón de la PVE/i.test(sinRaz.riel));
  eq('pero NO reclama el motivo (no hay «Otra» elegida)', sinRaz.faltaMotivo, false);

  /* ══ 5 · EL LADO SIMÉTRICO ═════════════════════════════════════════════ */
  console.log('\n5 · Las otras ocho razones no piden nada más');
  for (const r of ['Sin condiciones ventilatorias', 'Inestabilidad hemodinámica',
                   'Sedación profunda / BNM', 'Compromiso de conciencia',
                   'Secreciones abundantes', 'Menos de 24 h de VM',
                   'Indicación médica de mantener soporte', 'Procedimiento o pabellón programado']) {
    const st = await poner(r, '');
    conBloqueALaVista(r, st);
    eq('«' + r + '» no exige motivo', st.faltaMotivo, false);
    // Y el lado simétrico del simétrico: la razón elegida SÍ cuenta como elegida.
    eq('…y tampoco reclama la razón', st.faltaRazon, false);
  }

  console.log('\n6 · La extubación sin PVE apaga las dos obligaciones');
  // Si no las apagara, el turno quedaría pidiendo un campo que el propio
  // formulario manda VACÍO — trabado y sin salida desde la pantalla.
  const ext = await poner('', '', true);
  conBloqueALaVista('extubación sin PVE', ext);
  eq('con extubación marcada no falta la razón', ext.faltaRazon, false);
  eq('ni el motivo', ext.faltaMotivo, false);
  eq('y el aviso no queda colgado', ext.avisoVisible, false);
  // Y al desmarcarla vuelve a exigir: apagar no puede ser una puerta trasera.
  const reExt = await poner('', '', false);
  conBloqueALaVista('extubación desmarcada', reExt);
  eq('al desmarcarla, la razón vuelve a exigirse', reExt.faltaRazon, true);

  /* ══ 7 · EL AGUJERO: CASILLA MARCADA Y NINGÚN TIPO ═════════════════════ */
  // 🔴 Único camino en que una PVE «No» se iba SIN RAZÓN, y encima trabado: la
  // casilla apaga la obligación (el payload manda la razón vacía a propósito)
  // pero `_extOcurrio()` es false sin tipo, así que el servidor rechazaba
  // señalando un campo que la pantalla había dejado de pedir.
  console.log('\n7 · Marcar la extubación sin elegir tipo NO puede dejar el turno sin razón');
  const sinTipo = await poner('', '', true);
  conBloqueALaVista('extubación sin tipo', sinTipo);
  eq('la pantalla AVISA que falta el tipo', sinTipo.faltaTipoExt, true);
  si('el riel lo nombra', /tipo de la extubación/i.test(sinTipo.riel));
  // La propiedad de fondo, que es la que pidió Manuel: por este camino el turno
  // viajaría con la razón vacía y sin extubación declarada — o sea, sin razón.
  eq('sin tipo, la razón que viaja está vacía', sinTipo.razonQueViaja, '');
  eq('…y no hay extubación declarada', sinTipo.extOcurrio, false);
  si('por eso la pantalla TIENE que frenar acá', sinTipo.faltaTipoExt);

  // Y al elegir un tipo, deja de faltar: el tipo ES la razón.
  const conTipo = await p.evaluate(() => {
    const r = document.querySelector('input[name="extTipo"][value="sin_protocolo"]');
    r.checked = true; hExtTipo();
    if (typeof rielRender === 'function') rielRender();
    // Mismo blindaje que arriba: sin la pieza, informar y no reventar.
    if (typeof _pveExtSinTipo !== 'function') return { ausente: '_pveExtSinTipo()' };
    return { falta: !!_pveExtSinTipo(), extOcurrio: _extOcurrio(),
             faltaRazon: !!_pveRazonFalta(), riel: (document.getElementById('gFalta')||{}).textContent||'' };
  });
  if (conTipo.ausente) eq('la pantalla tiene _pveExtSinTipo', conTipo.ausente, 'ninguna falta');
  eq('con el tipo elegido ya no falta', conTipo.falta, false);
  eq('y la extubación queda declarada', conTipo.extOcurrio, true);
  eq('sin pedir además la razón (el tipo la explica)', conTipo.faltaRazon, false);
  eq('el riel queda limpio de PVE', /PVE|extubación/i.test(conTipo.riel), false);

  console.log('\n8 · Sin errores de página');
  eq('la página no tiró ningún error', errs, []);

  await b.close();
  console.log('\n' + (fails.length ? '❌ FALLA (' + fails.length + '): ' + fails.join(' · ')
                                   : '✅ pve_otra_pantalla: todo verde'));
  process.exit(fails.length ? 1 : 0);
})();
