// panel_no_pisa_datos.js — 🔴 NINGÚN CONTROL DEL PANEL DEJA RASTRO SI SE
// CAMBIA Y SE DEVUELVE (v6.19, 7-sep-2026).
//
// DE DÓNDE SALE. Diego, tras perder los días de VM de la cama 17: «quedé
// bastante preocupado con los datos que se pierden durante la estadía… me
// gustaría que lo que se modifica no cambie nada hasta guardar. ¿Eso podría
// pasar con otros campos? Revísalo». Se probó en vez de leerlo: de los 99
// controles del panel, NUEVE dejaban rastro. Uno era un bug (la vía aérea
// pasando por la opción en blanco) y ocho eran cascadas clínicas que actuaban
// bien pero no se revertían — marcar BNM y desmarcarlo dejaba al paciente
// como «No cooperador» con contraindicación absoluta que nadie escribió.
// Decisión de Diego: «que se restaure a lo que había al abrir el panel».
//
// QUÉ HACE. Abre el panel con una cama realista y, para CADA control con
// manejador, lo cambia, lo devuelve a su valor original y compara una foto
// completa: todos los campos del formulario más 16 variables internas
// (contadores, anclas, fases, procedimientos). Cualquier diferencia es un dato
// que se modificó sin que nadie guardara.
//
// 🪤 El panel se REABRE entre control y control: sin eso, el daño de uno
// contamina la medición del siguiente y el informe miente.
//
// Uso: node build/checks/panel_no_pisa_datos.js

const path=require('path'); const { chromium }=require('playwright-core');
const CAMA={ID_CAMA:'17',OCUPADA:true,NOMBRE:'PACIENTE 17',PATIENT_ID:'p17',EDAD:64,SEXO:'M',RUT:'11.111.111-1',
 VIA_AEREA:'TOT',SOPORTE:'VM',MODO:'ACVC',TOT_NUMERO:'7.5',TOT_CM_LABIO:'22',TALLA_CM:172,
 DIAGNOSTICO:'Neumonía grave adquirida en la comunidad',FECHA_INGRESO:'2026-08-28',
 FECHA_INICIO_VA:'2026-08-29',FECHA_INICIO_SOPORTE:'2026-08-29',
 TS_INICIO_VA:'2026-08-29 10:00:00',TS_INICIO_SOPORTE:'2026-08-29 10:00:00',DIAS_VA:9,DIAS_VM:9,
 DISP_HME_FECHA:'2026-09-05',DISP_HEPA_FECHA:'2026-09-04',DISP_TC_FECHA:'2026-09-04',ULT_COOP:'cooperador'};
(async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium'});
 const p=await b.newPage({viewport:{width:1400,height:950}});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.addInitScript(()=>{ window.google={script:{run:{withSuccessHandler(o){return{withFailureHandler(){return{
   api(a){ setTimeout(()=>o({ok:true,data:(a==='GET_CONFIG_UI'?{NUM_CAMAS:18,BANNERS:{}}:null)}),5); }};}};}}}}; });
 await p.goto('file://'+path.join('/home/user/RCE-KINE/v2','index.html')); await p.waitForTimeout(700);

 const ids=await p.evaluate(()=>{
   const out=[]; document.querySelectorAll('#kf select[id], #kf input[id]').forEach(e=>{
     if(!e.getAttribute('onchange')&&!e.getAttribute('oninput')) return;
     if(e.type==='hidden'||e.id==='faqQ') return;
     out.push({id:e.id, tipo:e.tagName==='SELECT'?'select':e.type});
   });
   return out;
 });

 await p.evaluate(()=>{ window.__CONF=0;
   window.uiConfirm=(o)=>{ window.__CONF++; return Promise.resolve(false); };  // no confirmar nada
 });

 const sospechosos=[];
 for(const c of ids){
   const r=await p.evaluate(async ({c,CAMA})=>{
     const foto=()=>{
       const o={};
       document.querySelectorAll('#kf select[id], #kf input[id], #kf textarea[id]').forEach(e=>{
         o['F:'+e.id]=(e.type==='checkbox'||e.type==='radio')?String(e.checked):String(e.value);
       });
       ['_diasVABase','_diasTOTBase','_diasTQTBase','_fechaInicioVA','_fechaInicioTQT','_diasVMEpisodio',
        '_diasVMPrevios','_nReintub','_diasVNIEpisodio','_diasVNIPrevios','_fechaInicioVNI','_vaAnterior',
        '_transIntubEsteTurno','_secrQty','_pronoTs','_supinoTs'].forEach(k=>{ try{ o['V:'+k]=String(eval(k)); }catch(e){} });
       try{ o['V:FASES']=[...FASES_SEL].sort().join('|'); }catch(e){}
       try{ o['V:PROCS']=JSON.stringify(PROCS); }catch(e){}
       return o;
     };
     DB=[CAMA]; abrirPanel('17',false,false);
     await new Promise(r=>setTimeout(r,260));
     window.__CONF=0;
     const antes=foto();
     const el=document.getElementById(c.id); if(!el) return null;
     const disparar=()=>{ el.dispatchEvent(new Event('change',{bubbles:true})); el.dispatchEvent(new Event('input',{bubbles:true})); };
     let orig, otro;
     if(c.tipo==='checkbox'||c.tipo==='radio'){ orig=el.checked; el.checked=!orig; disparar(); }
     else if(c.tipo==='select'){
       orig=el.value;
       const ops=[...el.options].map(o=>o.value).filter(v=>v!==orig);
       if(!ops.length) return null; otro=ops[0]; el.value=otro; disparar();
     } else { orig=el.value; otro=(String(orig).trim()==='')?'5':''; el.value=otro; disparar(); }
     await new Promise(r=>setTimeout(r,120));
     // devolverlo
     if(c.tipo==='checkbox'||c.tipo==='radio') el.checked=orig; else el.value=orig;
     disparar();
     await new Promise(r=>setTimeout(r,140));
     const despues=foto();
     const dif=[];
     Object.keys(antes).forEach(k=>{ if(antes[k]!==despues[k]) dif.push(k+': '+antes[k]+' → '+despues[k]); });
     return { id:c.id, tipo:c.tipo, dif, confirmo:window.__CONF };
   }, {c,CAMA});
   if(r && r.dif.length) sospechosos.push(r);
 }
 const okCant = ids.length >= 90;
 console.log((okCant?'✅':'❌')+' se probaron los controles del panel: '+ids.length+' (se esperan 90 o más)');
 console.log((sospechosos.length===0?'✅':'❌')+' ★ ninguno deja rastro tras cambiarlo y devolverlo: '+sospechosos.length);
 sospechosos.forEach(s=>{
   console.log('\n   ▶ '+s.id+' ('+s.tipo+')'+(s.confirmo?'  [pidió confirmación]':''));
   s.dif.slice(0,8).forEach(d=>console.log('       '+d));
   if(s.dif.length>8) console.log('       … y '+(s.dif.length-8)+' más');
 });
 const okJs = errs.length===0;
 console.log((okJs?'✅':'❌')+' sin errores de página: '+(errs.slice(0,2).join(' | ')||'ninguno'));
 await b.close();
 const fallos = (sospechosos.length?1:0)+(okCant?0:1)+(okJs?0:1);
 console.log(fallos ? '\n❌ '+fallos+' FALLOS — un control del panel modifica datos sin guardar'
                    : '\n✅ panel_no_pisa_datos: todo verde');
 process.exit(fallos?1:0);
})();
