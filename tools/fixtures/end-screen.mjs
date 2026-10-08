import '../../src/ui/motion.css';
import '../../src/ui/responsiveSurfaces.css';
import '../../src/ui/endScreenPresentation.css';
import '../../src/ui/richTooltip.css';
import {installResponsiveLayout} from '../../src/ui/responsiveLayout.ts';
import {createBus} from '../../src/game/stateCore.ts';
import {createEndScreen} from '../../src/ui/endScreen.ts';
import {createEndOverlayRuntime} from '../../src/ui/endOverlayRuntime.ts';
import {setLocale} from '../../src/ui/i18n.ts';
setLocale(new URLSearchParams(location.search).get('locale')||'en-US');installResponsiveLayout();
const bus=createBus();createEndOverlayRuntime({bus,onReturnToGarage:()=>{window.__RETURNED=true;report.hide();}});
const host=document.createElement('div');host.className='cot-si-stats';document.body.append(host);
const report=createEndScreen(bus,host);
const rows=(side,count)=>Array.from({length:count},(_,i)=>({id:`${side}-${i}`,name:i?'Commander_Long_Name_'+i:'Your commander',specId:i%2?'t90m':'m1a2',kills:i%5,dmg:8400-i*310,dead:i>4,isPlayer:side==='ally'&&i===0}));
const summary={playerVehicle:'M1A2 Abrams',playerSpecId:'m1a2',map:'Verdant Fields',timeS:480,reason:'elimination',stats:{dealt:8420,received:1230,blocked:3600,fired:20,hits:17,pens:12,assist:900},kills:rows('kill',5),bestShot:{damage:1840,targetName:'T-90M',zone:'Turret',distM:630,destroyed:true},allies:rows('ally',21),enemies:rows('enemy',21),awards:{medals:['chain_of_thought','ace_gunner','first_blood','long_shot'],achievements:[{id:'chain_thinker',tier:2}],bestChain:4}};
function show(result='victory',room=false,awards=true){
 bus.emit('network:roomState',room?{role:'host',playerId:'a',state:{phase:'waiting',round:1,roomCode:'ABC123',mode:'private',gameMode:'standard',hostId:'a',players:[{id:'a',name:'You',specId:'m1a2',team:'alpha',ready:false,connected:true},{id:'b',name:'Ally',specId:'t90m',team:'bravo',ready:true,connected:true}]}}:null);
 bus.emit('battle:ended',{result,roster:[]});report.show(result,{...summary,awards:awards?summary.awards:null});
}
window.__DEBRIEF={show,report,bus};show();
