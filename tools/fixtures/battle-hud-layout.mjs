import '../../src/ui/endScreenPresentation.css';
import '../../src/ui/richTooltip.css';
// Real production components, deterministic presentation data, no WebGL/simulation.
import '../../src/ui/motion.css';
import '../../src/ui/battleUiVisibility.css';
import '../../src/ui/hudCustomization.css';
import '../../src/ui/responsiveSurfaces.css';
// The battle HUD loads with its aerial sheet (battleHudAccess): without it the flight controls render as stray white
// boxes over the score (critic r3, every phone frame).
import '../../src/ui/aerialHud.css';
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
import { matchRulesetFor, rulesetUnlimitedFor } from '../../src/sim/matchRuleset.ts';
import { createAimController } from '../../src/game/aimController.ts';
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
// combat state and the real game/aimController composes its aim frame (the magazine capped by the stowage feed, the
// shell cards carrying the ruleset's unlimited mark), so the screenshots show what a battle shows.
const AMMO_STAGES = {
  'ammo-reload': {spec:'m1a1_abrams_hc', reload:{t:3.2,totalS:6,kind:'shell'}},
  'ammo-dry-cannon': {spec:'m1a1_abrams_hc', ammo:[0,0,0], reload:{t:3.2,totalS:6,kind:'shell'}},
  'ammo-low-autoloader': {spec:'m1a3', ammo:[2,4,0], magazineRounds:4, reload:{t:0,totalS:2.5,kind:'ready'}},
  // dry between clips (the magazine reload pending) and mid-clip (stowage ran out with the clip counter at two: the
  // intra-clip cycle still runs in the simulation, the rack shows no round)
  'ammo-dry-autoloader': {spec:'m1a3', ammo:[0,0,0], magazineRounds:0, reload:{t:12,totalS:21,kind:'magazine'}},
  'ammo-dry-autoloader-midclip': {spec:'m1a3', ammo:[0,0,0], magazineRounds:2, reload:{t:1.2,totalS:2.5,kind:'intraClip'}},
  'ammo-dry-salvo': {spec:'ztz100_prototype', ammo:[0,0,0], salvoShots:0, reload:{t:7,totalS:12,kind:'shell'}},
  'ammo-dry-atgm': {spec:'bwp1', ammo:[180,0,220], reload:{t:0,totalS:0.32,kind:'ready'}},
  // Juggernaut with unlimited rounds (its ruleset row since the merged rules head, gameplay-modes-227 ab82b3403)
  'ammo-unlimited': {spec:'m1a3', mode:'juggernaut', magazineRounds:3, reload:{t:1.4,totalS:2.5,kind:'intraClip'}},
  // An AC-130 escort out of rounds: the mode plays unlimited rounds, but only the gunship refills (rulesetUnlimitedFor),
  // so the escort's cards carry no ∞ and its gun reads empty (critic r3)
  'ammo-escort-dry': {spec:'m1a1_abrams_hc', mode:'ac130', ammo:[0,0,0], reload:{t:3.2,totalS:6,kind:'shell'}},
  // The ×8 sight (critic r3: on a landscape phone the struck round and the rack sat on the scope's ammo readout).
  'ammo-reload-sniper': {spec:'m1a1_abrams_hc', reload:{t:3.2,totalS:6,kind:'shell'}, sniper:true},
  'ammo-dry-cannon-sniper': {spec:'m1a1_abrams_hc', ammo:[0,0,0], reload:{t:3.2,totalS:6,kind:'shell'}, sniper:true},
  // (14 rounds stowed, so the readout's count never reads as the 12 s countdown beside it; critic r8)
  'ammo-reload-autoloader-sniper': {spec:'m1a3', ammo:[14,4,10], magazineRounds:0,
    reload:{t:12,totalS:21,kind:'magazine'}, sniper:true},
  'ammo-dry-autoloader-sniper': {spec:'m1a3', ammo:[0,0,0], magazineRounds:0, reload:{t:12,totalS:21,kind:'magazine'},
    sniper:true},
  // critic r8: the gun travel warning's chip on the sight (a mouse layout paints it on the canvas), with the default ring
  // and with the widest one (ring: the multiple of the default 5% of the short side; 3 reaches the 15% ceiling), where a
  // rack reloading under it left the chip's row no room above the controls on windows 431 to 450 px tall; the same rack
  // without the warning (its countdown joins the readout row there); and an empty rack under the widest ring, which drops
  // the rack and the readouts below it
  'ammo-reload-sniper-warn': {spec:'m1a1_abrams_hc', reload:{t:3.2,totalS:6,kind:'shell'}, sniper:true, warning:true},
  'ammo-reload-autoloader-sniper-warn-wide': {spec:'m1a3', ammo:[14,4,10], magazineRounds:0,
    reload:{t:12,totalS:21,kind:'magazine'}, sniper:true, warning:true, ring:3},
  'ammo-reload-autoloader-sniper-wide': {spec:'m1a3', ammo:[14,4,10], magazineRounds:0,
    reload:{t:12,totalS:21,kind:'magazine'}, sniper:true, ring:3},
  'ammo-dry-autoloader-sniper-wide': {spec:'m1a3', ammo:[0,0,0], magazineRounds:0, reload:{t:12,totalS:21,kind:'magazine'},
    sniper:true, ring:3},
};
let ammoSniper = false;
let ammoUnlimited = false;
let ammoRing = 1;
const ammoAim = createAimController({
  getGame: () => ({player, tanks:[player]}),
  getRig: () => ({aimPoint:new Vector3(0, 2, 200), aimDist:200, mode:ammoSniper ? 'SNIPER' : 'CHASE', zoom:ammoSniper ? 8 : 1}),
  worldRaycast: () => null,
  targetVisible: () => true,
  // The shell cards as game/playerBattleActions builds them (the ruleset's mark per entity); the controller writes the
  // counts.
  getShellCards: () => player.spec.gun.shells.map((shell) => ({name:shell.name, type:shell.guided === true ? 'ATGM' : shell.type,
    dmg:shell.dmg, penLabel:`${Math.round(shell.pen100Mm)} mm`, count:0, ...(ammoUnlimited ? {unlimited:true} : {})})),
  // Sized to the fixture's default ring (5% of the short side) at the 200 m aim distance and the HUD's 60° fallback FOV.
  computeDispersion: (_spec, _state, distM) => ammoRing * 0.05 * Math.min(innerWidth, innerHeight) * Math.tan(Math.PI / 6) * distM
    / (innerHeight * 0.5),
  now: () => 0,
});
const ammoVisual = {gunMuzzleWorld(out) { return out.set(0, 2, 0); }, gunDirWorld(out) { return out.set(0, 0, 1); }};
function stageAmmo(name) {
  const stage = AMMO_STAGES[name];
  if (!stage) return;
  const spec = TANK_SPECS[stage.spec];
  const combat = createCombatState(spec);
  player.spec = spec; player.combat = combat; player.specialAction = createSpecialActionState(spec);
  player.visual = ammoVisual;
  stage.ammo?.forEach((count, slot) => { if (slot < combat.ammo.length) combat.ammo[slot] = count; });
  if (combat.magazine && stage.magazineRounds != null) combat.magazine.rounds = stage.magazineRounds;
  if (stage.salvoShots != null) combat.launcherSalvoShots = stage.salvoShots;
  Object.assign(combat.reload, stage.reload);
  const ruleset = matchRulesetFor(stage.mode || 'standard');
  delete player.aerial; // a ground seat (the AC-130's gunship alone is aerial)
  ammoUnlimited = rulesetUnlimitedFor(ruleset, player);
  ammoSniper = stage.sniper === true;
  ammoRing = stage.ring ?? 1;
  player.state.gunLimitSpec = stage.warning === true;
  const aim = {singleReticle:false, point:new Vector3(), distM:0, dispersionRadM:0, gunLimitSpec:false,
    reload:{t:0, totalS:0}, magazine:{rounds:0, capacity:0, launcher:false}, shellSlot:0, shells:[], zoom:1, gunDistM:0,
    gunTargetId:null, gunMarker:new Vector3(), blockedDistM:null, blockedLabel:false, penRatio:null};
  ammoAim.update(aim);
  frame.aim = aim;
  frame.matchModeState = {id:ruleset.mode, score:{alpha:2,bravo:1}, target:750,
    ...(ruleset.mode === 'juggernaut' ? {boss:{id:tanks[8].id, hp:5200, maxHp:8000}} : {})};
  panel.setTank(spec); panel.setState(combat);
  hud.setMode('hidden'); hud.setMode('battle');
  frame.mode = ammoSniper ? 'sniper' : 'battle';
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
  delete frame.rosterTanks; frame.tanks=tanks; frame.aim=defaultAim(); frame.mode='battle';
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
