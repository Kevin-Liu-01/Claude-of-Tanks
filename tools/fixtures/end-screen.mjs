import '../../src/ui/tokens/tokens.css';
// the shared kit, as the game's entry loads it (main.ts): the report's chips and buttons
import '../../src/ui/components/components.css';
import '../../src/ui/motion.css';
import '../../src/ui/responsiveSurfaces.css';
import '../../src/ui/endScreenPresentation.css';
import '../../src/ui/richTooltip.css';
import {installResponsiveLayout} from '../../src/ui/responsiveLayout.ts';
import {createBus} from '../../src/game/stateCore.ts';
import {createEndScreen} from '../../src/ui/endScreen.ts';
import {createEndOverlayRuntime} from '../../src/ui/endOverlayRuntime.ts';
import {setLocale} from '../../src/ui/i18n.ts';
import {zhTypeFloorStyle} from '../../src/ui/zhTypeFloor.ts';
await setLocale(new URLSearchParams(location.search).get('locale')||'en-US');
// A zh-CN capture carries the label floor its /cn/ document ships (src/presentation/localizedHtml.ts).
if(document.documentElement.lang==='zh-CN')document.head.insertAdjacentHTML('beforeend',zhTypeFloorStyle('game'));
installResponsiveLayout();
const bus=createBus();createEndOverlayRuntime({bus,onReturnToGarage:()=>{window.__RETURNED=true;report.hide();}});
// ?scene=1: a battle frame stands in for the scene's canvas under the report (the game's renderer marks its canvas)
if(new URLSearchParams(location.search).has('scene')){
 const scene=document.createElement('canvas');scene.dataset.sceneMsaaSamples='4';scene.style.cssText='position:fixed;inset:0;width:100vw;height:100vh';
 scene.width=innerWidth;scene.height=innerHeight;document.body.prepend(scene);
 const still=new Image();still.onload=()=>{const c=scene.getContext('2d'),k=Math.max(scene.width/still.width,scene.height/still.height);
  c.drawImage(still,(scene.width-still.width*k)/2,(scene.height-still.height*k)/2,still.width*k,still.height*k);};
 still.src='/media/site50-r14/stills/s226-church-duel.webp'; // a HUD-free battle frame (S12 retired presentation-r1's)
}
const host=document.createElement('div');host.className='cot-si-stats';document.body.append(host);
const report=createEndScreen(bus,host);
const rows=(side,count)=>Array.from({length:count},(_,i)=>({id:`${side}-${i}`,name:i?'Commander_Long_Name_'+i:'Your commander',specId:i%2?'t90am':'m1a1_abrams_hc',kills:i%5,dmg:8400-i*310,dead:i>4,isPlayer:side==='ally'&&i===0}));
const summary={playerVehicle:'M1A1 Abrams HC',playerSpecId:'m1a1_abrams_hc',map:'Verdant Fields',mapId:'verdant',mode:'zone_control',timeS:480,reason:'elimination',stats:{dealt:8420,received:1230,blocked:3600,fired:20,hits:17,pens:12,assist:900},kills:rows('kill',5),bestShot:{damage:1840,targetName:'T-90M',zone:'Turret',distM:630,destroyed:true},allies:rows('ally',21),enemies:rows('enemy',21),awards:{medals:['chain_of_thought','ace_gunner','first_blood','long_shot'],achievements:[{id:'chain_thinker',tier:2}],bestChain:4},
 beats:[{t:41,kind:'spot'},{t:135,kind:'kill',id:'enemy-1',specId:'t90am'},{t:278,kind:'zone',own:true,label:'B'},{t:362,kind:'kill',id:'enemy-3',specId:'t90am'},{t:400,kind:'loss',id:'trackL'},{t:455,kind:'kill',id:'enemy-6',specId:'m1a1_abrams_hc'}]};
function show(result='victory',room=false,awards=true){
 bus.emit('network:roomState',room?{role:'host',playerId:'a',state:{phase:'waiting',round:1,roomCode:'ABC123',mode:'private',gameMode:'standard',hostId:'a',players:[{id:'a',name:'You',specId:'m1a1_abrams_hc',team:'alpha',ready:false,connected:true},{id:'b',name:'Ally',specId:'t90am',team:'bravo',ready:true,connected:true}]}}:null);
 bus.emit('battle:ended',{result,roster:[]});report.show(result,{...summary,...(new URLSearchParams(location.search).has('watched')?{watched:true}:{}),awards:awards?summary.awards:null});
}
// ?result=defeat|draw and ?watched=1 (a watched battle's neutral report) stage the other heads
window.__DEBRIEF={show,report,bus};show(new URLSearchParams(location.search).get('result')||'victory');
