import '../../src/ui/endScreenPresentation.css';
import '../../src/ui/richTooltip.css';
// Real production components, deterministic presentation data, no WebGL/simulation.
import '../../src/ui/motion.css';
import '../../src/ui/battleUiVisibility.css';
import '../../src/ui/hudCustomization.css';
import '../../src/ui/responsiveSurfaces.css';
import { Vector3 } from 'three';
import { installResponsiveLayout } from '../../src/ui/responsiveLayout.ts';
import { createBus } from '../../src/game/stateCore.ts';
import { createInput } from '../../src/game/input.ts';
import { installMedalToasts } from '../../src/ui/medalToast.ts';
import { initHud } from '../../src/ui/hud.ts';
import { createDamagePanel } from '../../src/ui/damagePanel.ts';
import { createTouchControls } from '../../src/ui/touchControls.ts';
import { createSettings } from '../../src/ui/settings.ts';
import { createEndOverlayRuntime } from '../../src/ui/endOverlayRuntime.ts';
import '../../src/vehicles/fleetRegistration.ts';
import { TANK_SPECS } from '../../src/vehicles/specs.ts';
import { magazineFeedRounds, magazineIndicator } from '../../src/sim/magazineIndicator.ts';
import { matchRulesetFor } from '../../src/sim/matchRuleset.ts';
import { createTankState } from '../../src/sim/movement.ts';
import { createCombatState } from '../../src/sim/damage.ts';
import { createSpecialActionState } from '../../src/sim/specialActionPolicy.ts';
import {createMultiplayerStatusSurface} from '../../src/ui/multiplayerStatus.ts';
import {NetworkStatusModel} from '../../src/mp/session/networkStatus.ts';
import { setLocale } from '../../src/ui/i18n.ts';

setLocale(new URLSearchParams(location.search).get('locale') || 'en-US');
installResponsiveLayout();
const bus = createBus();
const input = createInput();
const hud = initHud(bus);
installMedalToasts(bus);
createEndOverlayRuntime({bus,onReturnToGarage:()=>hud.setMode('hidden')});
const panel = createDamagePanel();
const settings = createSettings({input, bus, isBattleActive:()=>true, gearVisible:()=>false});
const touch = createTouchControls({input, bus, isBattleActive:()=>true, onOpenSettings:()=>settings.open()});
const tanks = Array.from({length:14},(_,i)=>{
  const spec = TANK_SPECS[['leo2a4_v','m1a1_abrams_hc','t90am'][i%3]];
  return {id:`tank-${i}`, isPlayer:i===0, team:i<7?'player':'enemy', displayName:`Commander_Long_Name_${i}`,
    spec, state:createTankState(spec,new Vector3(i*10,0,50),0), combat:createCombatState(spec)};
});
const player = tanks[0];
hud.setDamagePanel(panel);
panel.setTank(player.spec);
panel.setState(player.combat);
const defaultAim = () => ({shellSlot:0, reload:{t:0,totalS:6}, shells:[
  {name:'DM53',type:'APFSDS',count:24},{name:'DM12A2',type:'HEAT',count:16},{name:'DM11',type:'HE',count:12}
]});
const frame = {matchModeState:{id:'mars'}, auxiliaryKeyLabels:{smoke:'G',lights:'N',roofGun:'B',missile:'E'}, timeS:60, mode:'battle', player, tanks, spotting:{isSpotted:()=>true},
  aim:defaultAim()};
// Owner 2026-10-17 (out of ammo): the reload indicators' empty edge case and unlimited rounds. Each stage is a real
// combat state; the aim frame is composed the way game/aimController composes it (magazineIndicator capped by the
// stowage feed, shell cards carrying the ruleset's unlimited mark), so the screenshots show what a battle shows.
const AMMO_STAGES = {
  'ammo-reload': {spec:'m1a1_abrams_hc', reload:{t:3.2,totalS:6,kind:'shell'}},
  'ammo-dry-cannon': {spec:'m1a1_abrams_hc', ammo:[0,0,0], reload:{t:3.2,totalS:6,kind:'shell'}},
  'ammo-low-autoloader': {spec:'m1a3', ammo:[2,4,0], magazineRounds:4, reload:{t:0,totalS:2.5,kind:'ready'}},
  'ammo-dry-autoloader': {spec:'m1a3', ammo:[0,0,0], magazineRounds:0, reload:{t:12,totalS:21,kind:'magazine'}},
  'ammo-dry-salvo': {spec:'ztz100_prototype', ammo:[0,0,0], salvoShots:0, reload:{t:7,totalS:12,kind:'shell'}},
  'ammo-dry-atgm': {spec:'bwp1', ammo:[180,0,220], reload:{t:0,totalS:0.32,kind:'ready'}},
  // Juggernaut with unlimited rounds: commit 2 of gameplay-227 writes ammo 'unlimited' into its ruleset row.
  'ammo-unlimited': {spec:'m1a3', mode:'juggernaut', rules:{ammo:'unlimited'}, magazineRounds:3,
    reload:{t:1.4,totalS:2.5,kind:'intraClip'}},
};
function stageAmmo(name) {
  const stage = AMMO_STAGES[name];
  if (!stage) return;
  const spec = TANK_SPECS[stage.spec];
  const combat = createCombatState(spec);
  player.spec = spec; player.combat = combat; player.specialAction = createSpecialActionState(spec);
  stage.ammo?.forEach((count, slot) => { if (slot < combat.ammo.length) combat.ammo[slot] = count; });
  if (combat.magazine && stage.magazineRounds != null) combat.magazine.rounds = stage.magazineRounds;
  if (stage.salvoShots != null) combat.launcherSalvoShots = stage.salvoShots;
  Object.assign(combat.reload, stage.reload);
  const ruleset = {...matchRulesetFor(stage.mode || 'standard'), ...stage.rules};
  const unlimited = ruleset.ammo === 'unlimited';
  const shells = spec.gun.shells.map((shell, slot) => ({name:shell.name, type:shell.guided === true ? 'ATGM' : shell.type,
    dmg:shell.dmg, penLabel:`${Math.round(shell.pen100Mm)} mm`, count:combat.ammo[slot], ...(unlimited ? {unlimited:true} : {})}));
  const indicator = magazineIndicator(combat, spec);
  const capacity = indicator?.capacity || 0;
  const feed = Math.min(capacity, magazineFeedRounds(combat, spec, indicator, unlimited));
  frame.aim = {...defaultAim(), shellSlot:combat.shellSlot, reload:{...stage.reload}, shells,
    magazine:{rounds:Math.min(indicator?.rounds || 0, feed), capacity, feed, launcher:indicator?.launcher === true}};
  frame.matchModeState = {id:ruleset.mode, score:{alpha:2,bravo:1}, target:750,
    ...(ruleset.mode === 'juggernaut' ? {boss:{id:tanks[8].id, hp:5200, maxHp:8000}} : {})};
  panel.setTank(spec); panel.setState(combat);
  hud.setMode('hidden'); hud.setMode('battle');
  for (let i = 0; i < 6; i++) hud.update(frame);
  panel.update(combat);
}
function hit(incoming=false, attackerIndex=8) {
  bus.emit('shell:hit',{attackerId:incoming?tanks[attackerIndex].id:player.id,targetId:incoming?player.id:tanks[8].id,
    attackerName:'Commander_Long_Name_8',targetName:'Leopard 2A5',targetSpecId:'leo2a4_v',attackerSpecId:'t90am',
    kind:'pen',damage:420,dmgRoll:460,penRoll:560,effectiveArmor:350,baseArmor:220,impactAngleDeg:34,
    shellType:'APFSDS',zone:'hullFront',flightDistM:240,timeS:60,pos:[0,1,50],localPos:[0,1,2],localDir:[0,0,-1]});
}
let network=null;
function multiplayer(kind='healthy') {
  network?.dispose();
  network=createMultiplayerStatusSurface({onLeave:()=>window.__HUD_LEFT=true});
  const snapshot=Object.assign(new NetworkStatusModel().snapshot,{attached:true,health:kind==='healthy'?'good':'offline',room:'joined',roomPhase:'playing',link:'live',rttMs:42,rttMedianMs:45,rosterCount:28,seat:1,role:'host',peersConnected:27});
  network.set(snapshot,kind==='healthy'?null:{kind:'reconnecting',scope:'match',attempt:2,nextRetryS:3});
  return network;
}
function state(name) {
  network?.dispose();network=null;
  delete frame.rosterTanks; frame.tanks=tanks; frame.aim=defaultAim();
  frame.aim.gunLimitSpec = name==='notifications';
  settings.close({noRelock:true});
  const modeId = name.startsWith('mode-') ? name.slice(5) : 'mars';
  frame.matchModeState = {id:modeId, score:{alpha:2,bravo:1}, target:modeId==='capture_the_flag'?3:modeId==='turbo_ball'?5:750, horde:{wave:3,alive:12},line:{index:1,total:3},playerAmmo:24,playerAmmoCapacity:40};
  player.spec = TANK_SPECS[name==='special'?'bwp1':'m1a3'];
  player.combat = createCombatState(player.spec);
  player.specialAction = createSpecialActionState(player.spec);
  hud.setMode('hidden'); hud.setMode('battle');
  // Cross the real 30-frame FPS threshold; single-frame fixtures miss this plate.
  for(let i=0;i<31;i++)hud.update(frame);
  panel.update(player.combat);
  for(let i=0;i<(name==='feed-burst'?14:3);i++){
    bus.emit('mode:respawn',{id:tanks[8].id});
    bus.emit('mode:respawn',{id:tanks[1].id});
    bus.emit('tank:destroyed',{id:tanks[8].id,killerId:player.id,cause:'fire'});
    bus.emit('tank:destroyed',{id:tanks[1].id,killerId:tanks[9].id,cause:'fire'});
  }
  if(name==='notifications'||name.startsWith('mode-')) {
    bus.emit('player:spotted',{timeS:frame.timeS-4});
    hud.update(frame);
    if(name==='notifications')bus.emit('ui:magazineReloadStarted',{});
  }
  if(name==='countdown') hud.preBattleCountdown(5);
  if(name==='reports'||name==='log'||name==='chat'||name==='combined'||name==='feed-burst') {
    for(let i=0;i<(name==='feed-burst'?14:6);i++){hit();hit(true,name==='feed-burst'?8+i%2:8);}
  }
  if(name==='log'||name==='combined')bus.emit('ui:shotLog',{});
  if(name==='chat'||name==='combined'||name==='spectator'){
  }
  if(name==='spectator')hud.stageSpectateBar({specId:'leo2a4_v',name:'Commander_Long_Name',vehicle:'Leopard 2A5',count:7,index:2});
  if(name==='settings')settings.open();
  if(name==='sniper')hud.setMode('sniper');
  if(name==='large-map'){
    hit(); hud.shotInfo.toggleLog();
    bus.emit('ui:minimapZoom',{});
  }
  if(name.startsWith('ammo-'))stageAmmo(name);
  if(name==='ended')bus.emit('battle:ended',{result:'victory',timeS:320,reason:'elimination',roster:tanks.map(t=>({
    id:t.id,isPlayer:t.isPlayer,team:t.team,specId:t.spec.id,name:t.displayName,hp:t.combat.hp,maxHp:t.combat.maxHp
  }))});
  return name;
}
function roster(allies, enemies) {
  const entries=Array.from({length:allies+enemies},(_,i)=>{
    const spec=TANK_SPECS[['leo2a4_v','m1a1_abrams_hc','t90am'][i%3]];
    const tank=i===0?player:{id:`large-${i}`,isPlayer:false,team:i<allies?'player':'enemy',
      displayName:`Commander_Long_Name_${i}`,spec,state:createTankState(spec,new Vector3(i*10,0,50),0),combat:createCombatState(spec)};
    if(i>0&&i%3===0)tank.combat.destroyed=true;
    return tank;
  });
  frame.rosterTanks=entries; frame.tanks=entries;
  hud.update(frame);
}
window.__HUD_LAYOUT = {multiplayer,state, roster, hud, bus, touch, settings, hit, frame, tanks, ammoStages:Object.keys(AMMO_STAGES)};
const params = new URLSearchParams(location.search);
state(params.get('state') || 'idle');
if(params.has('allies'))roster(Number(params.get('allies')),Number(params.get('enemies')));
if(params.get('preview')==='1') {
  // Reissue real presentation events so a reviewer can keep a transient notice
  // visible without changing production timers, markup or styles.
  const events = {
    Reload:['ui:magazineReloadStarted',{}],
    Damaged:['module:state',{id:player.id,module:'engine',state:'red'}],
    Repaired:['module:state',{id:player.id,module:'engine',state:'yellow',repaired:true}],
    Ammo:['ammo:empty',{id:player.id}],
  };
  let selected=events.Reload;
  const controls=document.createElement('aside');
  controls.style.cssText='position:fixed;z-index:1000;right:12px;top:45%;display:grid;gap:4px;padding:8px;background:#081016e8;color:#b9c8d3;font:12px system-ui';
  const title=document.createElement('span');title.textContent='Notification preview';controls.append(title);
  for(const [name,event] of Object.entries(events)) {
    const button=document.createElement('button');button.textContent=name;
    button.style.cssText='border:1px solid #53636c;background:#13212c;color:#e6edf2;padding:5px 10px;cursor:pointer';
    button.onclick=()=>{selected=event;bus.emit(...selected);};controls.append(button);
  }
  document.body.append(controls);
  setInterval(()=>bus.emit(...selected),1800);
}
