// regresion_ui.js — Regresión de UI en Chromium: VA replicada robusta,
// fase clínica con «sin cambios» y tablero VM con ids vacíos.
// Uso: node build/checks/regresion_ui.js (requiere playwright-core)
const { chromium } = require('playwright-core');
const path = require('path');

(async () => {
  const b = await chromium.launch({ executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium' });
  const p = await b.newPage({ viewport:{width:1100,height:900} });
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('c:'+m.text());});
  await p.addInitScript(()=>{
    window._ll=[];
    window.google={script:{run:{withSuccessHandler(ok){return{withFailureHandler(){return{
      api(a,d){ window._ll.push({a,d}); setTimeout(()=>ok({ok:true,data:(a==='GET_CONFIG_UI'?{NUM_CAMAS:12,BANNERS:{}}:null)}),5); }
    };}};}}}};
  });
  await p.goto('file://'+path.resolve(__dirname,'..','..','v2','index.html'));
  await p.waitForTimeout(500);
  const fails=[]; const eq=(l,g,w)=>{const okk=String(g)===String(w);console.log((okk?'✅':'❌')+' '+l+': '+JSON.stringify(g));if(!okk)fails.push(l);};

  // ── BUG 2: VA robusta ──
  const VA = await p.evaluate(()=>{
    $('sp').classList.add('on'); $('kf').reset(); $('cIng').value='false'; $('cBed').value='3';
    DB=[{ID_CAMA:'3',VIA_AEREA:'TQT',SOPORTE:'VM',MODO:'CPAP/PS'}];
    const r={};
    // a) valor válido replica
    $('fVA').value=''; fillFormReplica({VENT_VIA_AEREA:'TOT',VENT_SOPORTE:'VM',VENT_MODO:'CPAP/PS'}); r.valido=$('fVA').value;
    // b) valor con espacio (basura) → NO borra; cae a la cama (fillCama la habría puesto; aquí simulamos fVA ya con la cama)
    $('fVA').value='TQT'; fillFormReplica({VENT_VIA_AEREA:' TOT ',VENT_SOPORTE:'VM'}); r.espacio=$('fVA').value;   // trim → TOT válido
    // c) valor inválido → conserva lo que había (TQT de la cama)
    $('fVA').value='TQT'; fillFormReplica({VENT_VIA_AEREA:'xxx',VENT_SOPORTE:'VM'}); r.invalido=$('fVA').value;
    return r;
  });
  eq('VA válida se replica', VA.valido, 'TOT');
  eq('VA con espacios → trim y aplica', VA.espacio, 'TOT');
  eq('VA basura → NO borra la selección previa', VA.invalido, 'TQT');

  // fillForm (turno guardado) con VA vacía → cae a la cama
  const VF = await p.evaluate(()=>{
    $('kf').reset(); $('cBed').value='3'; DB=[{ID_CAMA:'3',VIA_AEREA:'TQT',SOPORTE:'VM',MODO:'CPAP/PS'}];
    $('fVA').value=''; fillForm({VENT_VIA_AEREA:'',VENT_SOPORTE:''}); return $('fVA').value;
  });
  eq('turno guardado con VA vacía → usa la VA de la cama', VF, 'TQT');

  // ── BUG 3: Fase "sin cambios" ──
  const FA = await p.evaluate(()=>{
    FASES=['Weaning','Rehabilitación','Neuroprotección'];
    $('kf').reset(); $('cBed').value='3';
    fillFormReplica({FASE_JSON:'["Weaning"]',VENT_VIA_AEREA:'TQT',VENT_SOPORTE:'VM'});
    const her=_faseHeredada, amber=!!document.querySelector('#faseChips .fase-chip.her'),
      conf=!!document.querySelector('#faseChips .fase-chip-conf');
    return {her,amber,conf};
  });
  eq('fase replicada → heredada (ámbar)', FA.her && FA.amber, true);
  eq('aparece chip "✓ Sin cambios"', FA.conf, true);
  const FC = await p.evaluate(()=>{ confirmarFaseHeredada();
    return { her:_faseHeredada, amber:!!document.querySelector('#faseChips .fase-chip.her'), conf:!!document.querySelector('#faseChips .fase-chip-conf') }; });
  eq('confirmar quita el ámbar y el chip', !FC.her && !FC.amber && !FC.conf, true);
  const FT = await p.evaluate(()=>{ fillFormReplica({FASE_JSON:'["Weaning"]'}); const antes=_faseHeredada;
    toggleFase('Rehabilitación'); return { antes, despues:_faseHeredada, sel:FASES_SEL.has('Rehabilitación') }; });
  eq('cambiar una fase también confirma (quita heredada)', FT.antes && !FT.despues && FT.sel, true);

  // ── BUG 4: los procedimientos son del turno — la réplica NO los arrastra ──
  const PR = await p.evaluate(()=>{
    $('kf').reset(); $('cBed').value='3'; DB=[{ID_CAMA:'3',VIA_AEREA:'TOT',SOPORTE:'VM'}];
    PROCS=['VIEJO'];
    fillFormReplica({PROC_JSON:'["IMT","INGRESO","ECOGRAFÍA"]',VENT_VIA_AEREA:'TOT',VENT_SOPORTE:'VM'});
    return { n:PROCS.length, chips:document.querySelectorAll('#procChips .chip, #procChips .proc-chip').length };
  });
  eq('réplica: chips manuales parten vacíos (nada arrastrado)', PR.n, 0);

  // ── BUG 5: terapia física replica DÍA→DÍA (la noche parte limpia) ──
  const TF = await p.evaluate(()=>{
    $('kf').reset(); $('cBed').value='3'; DB=[{ID_CAMA:'3',VIA_AEREA:'TOT',SOPORTE:'VM'}];
    const r={};
    // Noche: aunque la previa traiga IMT/EMS, el bloque parte limpio (sin fantasma)
    SHIFT='Noche';
    fillFormReplica({KTM_IMT:'TRUE',KTM_EMS:'TRUE',KTM_REALIZADA:'TRUE',KTM_NIVEL_KTR:'3',VENT_VIA_AEREA:'TOT',VENT_SOPORTE:'VM'});
    r.nocheIMT=$('cIMT').checked; r.nocheEMS=$('cEMS').checked;
    r.nocheKTMr=$('cKTMr').checked; r.nocheOculto=$('fcKtmCard').classList.contains('hidden');
    // Día con previa Noche: la pauta llega desde la última evolución de DÍA adjunta
    SHIFT='Dia'; $('kf').reset();
    fillFormReplica({KTM_IMT:false,KTM_REALIZADA:false,VENT_VIA_AEREA:'TOT',VENT_SOPORTE:'VM',
      _PREVIA_DIA:{KTM_IMT:'TRUE',KTM_IMT_FREQ:'3',KTM_REALIZADA:'TRUE',KTM_NIVEL_KTR:'2'}});
    r.diaIMT=$('cIMT').checked; r.diaFreq=v('fIMTfreq'); r.diaKTMr=$('cKTMr').checked;
    return r;
  });
  eq('noche: IMT/EMS NO se arrastran (sin sesión fantasma)', !TF.nocheIMT && !TF.nocheEMS, true);
  eq('noche: KTM forzada a "no realizada" y tarjeta oculta', !TF.nocheKTMr && TF.nocheOculto, true);
  eq('día: la pauta llega de la última evolución de DÍA', TF.diaIMT && TF.diaKTMr, true);
  eq('día: pauta IMT heredada', TF.diaFreq, '3');

  // ── BUG 1: tablero VM con ids vacíos ──
  const VM = await p.evaluate(()=>{
    window.CFG={NUM_CAMAS:12,BANNERS:{}};
    DB=[]; VM_ALL=[
      { id:'v1', nombre:'AVEA 1', activo:true, ubicTipo:'BODEGA', ubicDetalle:'', estado:'Operativo' },
      { id:'',   nombre:'AVEA 2', activo:true, ubicTipo:'BODEGA', ubicDetalle:'', estado:'Operativo' },
      { id:'',   nombre:'AVEA 3', activo:true, ubicTipo:'BODEGA', ubicDetalle:'', estado:'Operativo' },
    ];
    setTab('V'); vmRender();
    // tocar AVEA 2 (id vacío) NO debe seleccionar a nadie
    const chipsSinId=document.querySelectorAll('#vmBody .vmz-chip.vmz-noid').length;
    vmzChipTap({stopPropagation(){}}, '');
    const marcadosTrasTapVacio=document.querySelectorAll('#vmBody .vmz-chip.sel').length;
    // tocar AVEA 1 (id válido) marca SOLO uno
    vmzChipTap({stopPropagation(){}}, 'v1'); vmRender();
    const marcadosTrasTapValido=document.querySelectorAll('#vmBody .vmz-chip.sel').length;
    return { chipsSinId, marcadosTrasTapVacio, marcadosTrasTapValido };
  });
  eq('los equipos sin id se marcan como no-arrastrables (2)', VM.chipsSinId, 2);
  eq('tocar un equipo sin id NO selecciona a nadie', VM.marcadosTrasTapVacio, 0);
  eq('tocar un equipo con id selecciona SOLO uno', VM.marcadosTrasTapValido, 1);

  console.log(errs.length?('\nERRORES JS:\n'+errs.join('\n')):'\nsin errores JS');
  await b.close();
  console.log(fails.length?('❌ '+fails.length+' FALLOS'):'✅ TODO OK');
  process.exit(fails.length||errs.length?1:0);
})();
