// Real production components, deterministic presentation data, no WebGL/simulation.
import '../../src/ui/motion.css';
import '../../src/ui/responsiveSurfaces.css';
import { Vector3 } from 'three';
import { installResponsiveLayout } from '../../src/ui/responsiveLayout.ts';
import { createBus } from '../../src/game/stateCore.ts';
import { createInput } from '../../src/game/input.ts';
import { initHud } from '../../src/ui/hud.ts';
import { createDamagePanel } from '../../src/ui/damagePanel.ts';
import { createTouchControls } from '../../src/ui/touchControls.ts';
import { createRoomChat } from '../../src/ui/roomChat.ts';
import { createSettings } from '../../src/ui/settings.ts';
import { createEndOverlayRuntime } from '../../src/ui/endOverlayRuntime.ts';
import { TANK_SPECS } from '../../src/vehicles/specs.ts';
import { createTankState } from '../../src/sim/movement.ts';
import { createCombatState } from '../../src/sim/damage.ts';
import { createSpecialActionState } from '../../src/sim/specialActionPolicy.ts';
import { setLocale } from '../../src/ui/i18n.ts';

setLocale(new URLSearchParams(location.search).get('locale') || 'en-US');
installResponsiveLayout();
const bus = createBus();
const input = createInput();
const hud = initHud(bus);
createEndOverlayRuntime({bus,onReturnToGarage:()=>hud.setMode('hidden')});
const panel = createDamagePanel();
const settings = createSettings({input, bus, isBattleActive:()=>true, gearVisible:()=>false});
const touch = createTouchControls({input, bus, isBattleActive:()=>true, onOpenSettings:()=>settings.open()});
const chat = createRoomChat({input, isAvailable:()=>true, shouldRelock:()=>false, onSend:()=>true});
const tanks = Array.from({length:14},(_,i)=>{
  const spec = TANK_SPECS[['leo2a5','m1a2','t90m'][i%3]];
  return {id:`tank-${i}`, isPlayer:i===0, team:i<7?'player':'enemy', displayName:`Commander_Long_Name_${i}`,
    spec, state:createTankState(spec,new Vector3(i*10,0,50),0), combat:createCombatState(spec)};
});
const player = tanks[0];
hud.setDamagePanel(panel);
panel.setTank(player.spec);
panel.setState(player.combat);
const frame = {timeS:60, mode:'battle', player, tanks, spotting:{isSpotted:()=>true},
  aim:{shellSlot:0, reload:{t:0,totalS:6}, shells:[
    {name:'DM53',type:'APFSDS',count:24},{name:'DM12A2',type:'HEAT',count:16},{name:'DM11',type:'HE',count:12}
  ]}};
function hit(incoming=false) {
  bus.emit('shell:hit',{attackerId:incoming?tanks[8].id:player.id,targetId:incoming?player.id:tanks[8].id,
    attackerName:'Commander_Long_Name_8',targetName:'Leopard 2A5',targetSpecId:'leo2a5',attackerSpecId:'t90m',
    kind:'pen',damage:420,dmgRoll:460,penRoll:560,effectiveArmor:350,baseArmor:220,impactAngleDeg:34,
    shellType:'APFSDS',zone:'hullFront',flightDistM:240,timeS:60,pos:[0,1,50],localPos:[0,1,2],localDir:[0,0,-1]});
}
function state(name) {
  settings.close({noRelock:true});
  chat.close({relock:false}); chat.clear(); chat.setActive(false);
  player.spec = TANK_SPECS[name==='special'?'bwp1':'leo2a5'];
  player.combat = createCombatState(player.spec);
  player.specialAction = createSpecialActionState(player.spec);
  hud.setMode('hidden'); hud.setMode('battle'); hud.update(frame); panel.update(player.combat);
  if(name==='countdown') hud.preBattleCountdown(5);
  if(name==='reports'||name==='log'||name==='chat'||name==='combined') {
    for(let i=0;i<6;i++){hit();hit(true);}
  }
  if(name==='log'||name==='combined')bus.emit('ui:shotLog',{});
  if(name==='chat'||name==='combined'||name==='spectator'){
    chat.setActive(true);
    for(let i=0;i<8;i++)chat.append({id:String(i),senderId:tanks[1].id,senderName:'Commander_Long_Name',team:'alpha',text:'Regroup at the bridge and cover the western approach.'});
    chat.open();
  }
  if(name==='spectator')hud.stageSpectateBar({specId:'leo2a5',name:'Commander_Long_Name',vehicle:'Leopard 2A5',count:7,index:2});
  if(name==='settings')settings.open();
  if(name==='sniper')hud.setMode('sniper');
  if(name==='large-map'){
    hit(); hud.shotInfo.toggleLog();
    bus.emit('ui:minimapZoom',{});
  }
  if(name==='ended')bus.emit('battle:ended',{result:'victory',timeS:320,reason:'elimination',roster:tanks.map(t=>({
    id:t.id,isPlayer:t.isPlayer,team:t.team,specId:t.spec.id,name:t.displayName,hp:t.combat.hp,maxHp:t.combat.maxHp
  }))});
  return name;
}
window.__HUD_LAYOUT = {state, hud, bus, chat, touch, settings, hit};
state('idle');
