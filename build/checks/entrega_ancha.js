// entrega_ancha.js — Guardia de la ENTREGA DE TURNO rediseñada (ago-2026).
//
// Dos cambios pedidos por Diego, ambos nacidos de usarla en turno real:
//
//  1. FICHA ANCHA EN DOS PISOS (mockup «opción C»): cada paciente ocupa el
//     ancho COMPLETO de la hoja y se lee de izquierda a derecha. Antes eran
//     dos columnas de tarjetas angostas: se desperdiciaba media hoja de ancho
//     y los bloques con más texto (eventos del episodio, plan) quedaban
//     espachurrados. Diagnóstico junto al nombre, aprovechando el hueco de la
//     barra de identidad.
//
//  2. LA FICHA SIN EVOLUCIÓN MUESTRA EL TURNO ANTERIOR. Antes salía HUECA
//     —sedación, SAS, parámetros, plan, todo vacío— y la hoja impresa no
//     servía. Ahora se rellena con el último turno evolucionado del episodio
//     Y LO AVISA: leer datos de hace 12 h creyéndolos de ahora es peor que el
//     vacío, así que la franja de aviso es parte del arreglo, no un adorno.
//     El contador «sin evolución» del encabezado NO cambia: la cama sigue
//     pendiente de registro aunque la ficha venga rellenada.
//
// Uso: node build/checks/entrega_ancha.js
const fs = require('fs');
const path = require('path');
const v2 = path.join(__dirname, '..', '..', 'v2');
const fails = [];
const eq = (l, g, w) => { const okk = String(g) === String(w); console.log((okk ? '✅' : '❌') + ' ' + l + ': ' + JSON.stringify(g)); if (!okk) fails.push(l); };
const ok_ = (l, c) => { console.log((c ? '✅' : '❌') + ' ' + l); if (!c) fails.push(l); };

/* ══ PARTE 1 · SERVICIO: la ficha hereda del turno anterior ══════════════ */
console.log('\n1 · La ficha sin evolución trae los datos del turno anterior');

const DB = {
  CAMAS_ESTADO: [
    { ID_CAMA: '4', OCUPADA: 'TRUE', PATIENT_ID: 'p4', NOMBRE: 'Paciente Con Evo',
      EDAD: 68, SEXO: 'F', DIAGNOSTICO: 'Neumonía grave', FECHA_INGRESO: '2026-07-25',
      VIA_AEREA: 'TOT', SOPORTE: 'VM', FECHA_INICIO_SOPORTE: '2026-07-25' },
    { ID_CAMA: '11', OCUPADA: 'TRUE', PATIENT_ID: 'p11', NOMBRE: 'Paciente Sin Evo',
      EDAD: 71, SEXO: 'F', DIAGNOSTICO: 'EPOC reagudizado', FECHA_INGRESO: '2026-08-01',
      VIA_AEREA: 'Natural', SOPORTE: 'CNAF' },
  ],
  EVOLUCIONES: [
    // Cama 4: SÍ evolucionó el turno que se entrega
    { ID_CAMA: '4', PATIENT_ID: 'p4', TURNO_KEY: '2026-08-03-Dia', FECHA: '2026-08-03',
      SED_SAS: 3, SED_TIPO: 'Propofol', HEMO_DVA: 'dosis bajas', VENT_SOPORTE: 'VM',
      VENT_MODO: 'ACVC', DIAS_VM: 9, DIA_ESTADIA: 9, PLAN_PLANES: 'Plan de hoy',
      PLAN_FIRMA_KINE: 'Klga. Hoy', RESP_SECR_QTY: 'abundantes' },
    // Cama 11: su ÚLTIMA evolución es del turno ANTERIOR (noche del 2)
    { ID_CAMA: '11', PATIENT_ID: 'p11', TURNO_KEY: '2026-08-02-Noche', FECHA: '2026-08-02',
      SED_SAS: 4, SED_TIPO: 'Sin sedación', SED_COOPERACION: 'Cooperador',
      VENT_SOPORTE: 'CNAF', VENT_MODO: '', DIA_ESTADIA: 1,
      PLAN_PLANES: 'Continuar CNAF', PLAN_FIRMA_KINE: 'Klga. Anoche',
      RESP_SECR_QTY: 'escasas' },
  ],
  PROCEDIMIENTOS: [],
};
global.repoLeerTodos = (h, c, v) => { let f = (DB[h] || []).slice(); if (c !== undefined) f = f.filter(r => String(r[c]) === String(v)); return f; };
global.repoLeerFiltrado = (h, col, pred) => (DB[h] || []).filter(r => pred(r[col]));
global.repoBuscarPorId = (h, c, id) => (DB[h] || []).find(r => String(r[c]) === String(id)) || null;
global.esVerdadero = v => v === true || v === 'TRUE' || v === 'true';
global.leerConfig = (k, d) => d;
global.hoyISO = () => '2026-08-03';
global.ahoraTS = () => '2026-08-03 16:00:00';
global._tz = () => 'America/Santiago';
global.Utilities = { formatDate: () => '2026-08-03' };
global.ok = d => ({ ok: true, data: d });
global.err = (m, c) => ({ ok: false, error: m, codigo: c });
global.ERR = { VALIDACION: 'V', INTERNO: 'I' };
// La regla del HEPA por ventilador (v5.60) vive en svc_eventos.gs; cargarlo
// entero traería el reloj de dispositivos a un arnés que no mira dispositivos
// (estas fichas no traen fechas de circuito). Sin inventario ⇒ sin HEPA, que
// es exactamente la regla.
global._ventNombreDeCama = () => '';
global._hepaFijoEquipo = () => false;
eval(['infra_fechas.gs', 'svc_stats.gs', 'svc_entrega.gs']
  .map(f => fs.readFileSync(path.join(v2, f), 'utf8')).join('\n;\n'));

const r = obtenerEntregaTurno(['4', '11'], '2026-08-03', 'Dia');
eq('la entrega se genera', r.ok, true);
const f4 = r.data.fichas.find(x => x.idCama === '4');
const f11 = r.data.fichas.find(x => x.idCama === '11');

eq('la cama que SÍ evolucionó no hereda nada', f4.heredadoDe, '');
eq('…y sus datos son los de su turno', f4.sas, 3);

// El corazón del arreglo: la ficha rellenada, pero MARCADA.
ok_('la cama sin evolución trae el SAS del turno anterior', f11.sas === 4);
ok_('…y su plan', /Continuar CNAF/.test(String(f11.plan)));
ok_('…y su firma', /Anoche/.test(String(f11.firma)));
ok_('…y sus secreciones', /escasas/.test(String(f11.secr)));
eq('AVISA de qué turno vienen los datos', f11.heredadoDe, '2026-08-02-Noche');
eq('pero sigue contando como SIN evolución del turno', f11.tieneEvo, false);
ok_('…y conserva su alerta «Sin evolución de este turno»',
  (f11.alertas || []).some(a => /Sin evolución/i.test(a)));

/* ══ PARTE 2 · CLIENTE: la ficha ancha en dos pisos ═════════════════════ */
console.log('\n2 · Ficha ancha en dos pisos (opción C)');
const idx = fs.readFileSync(path.join(v2, 'index.html'), 'utf8');

ok_('las fichas van en UNA columna (ancho completo), no en dos',
  /\.ent-fichas\{display:grid;grid-template-columns:1fr;/.test(idx));
ok_('…también al imprimir', /@media print[\s\S]{0,3000}?\.ent-fichas\{grid-template-columns:1fr;\}/.test(idx));
ok_('existe el piso 1 (estado actual) con 4 bloques',
  /\.ent-p1\{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;/.test(idx));
ok_('existe el piso 2 (eventos y plan) con 3 bloques',
  /\.ent-p2\{display:grid;grid-template-columns:[^}]+\}/.test(idx));
ok_('el diagnóstico va en la barra de identidad', /ent-fh-dx/.test(idx));
ok_('la franja de datos heredados existe', /ent-heredado/.test(idx));
ok_('…y nombra el turno del que vienen',
  /se muestran los datos del turno anterior/.test(idx));
ok_('en móvil el piso 1 baja a 2 columnas',
  /@media\(max-width:860px\)\{[\s\S]{0,200}\.ent-p1\{grid-template-columns:1fr 1fr;\}/.test(idx));

/* ══ PARTE 3 · El diagnóstico reemplaza al código de paciente ═══════════ */
console.log('\n3 · Diagnóstico en vez del código interno');
ok_('la tarjeta de cama ya NO muestra COD_PACIENTE',
  !/\$\{c\.COD_PACIENTE\|\|''\} · \$\{c\.EDAD/.test(idx));
ok_('…y muestra el diagnóstico recortado', /class="bdx"/.test(idx));
ok_('la cabecera del panel muestra el diagnóstico',
  /_cCod\.textContent=c\.DIAGNOSTICO/.test(idx));
ok_('…también al re-editar una evolución guardada',
  /_cod\.textContent=s\.PAC_DIAGNOSTICO/.test(idx));
// El código NO desaparece del sistema: sigue donde cumple su función.
ok_('el código de paciente SIGUE en la pantalla de egreso',
  /egCama.*COD_PACIENTE/.test(idx));

console.log(fails.length ? `\n❌ ${fails.length} FALLOS` : '\n✅ entrega_ancha OK');
process.exit(fails.length ? 1 : 0);
