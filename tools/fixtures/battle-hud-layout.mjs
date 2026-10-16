import '../../src/ui/endScreenPresentation.css';
import '../../src/ui/richTooltip.css';
// Real production components, deterministic presentation data, no WebGL/simulation.
import '../../src/ui/motion.css';
import '../../src/ui/battleUiVisibility.css';
import '../../src/ui/hudCustomization.css';
import '../../src/ui/responsiveSurfaces.css';
// The HUD's own lazy sheet (battleHudAccess.ts loads it with hud.ts): the flight console and the drone tile's phases.
import '../../src/ui/aerialHud.css';
import { PerspectiveCamera, Vector3 } from 'three';
import { touchAimKeepOut, touchReticleFootprint } from '../../src/ui/touchActionDock.ts';
import { reticleTiers } from '../../src/ui/centreNotices.ts';
import { installResponsiveLayout } from '../../src/ui/responsiveLayout.ts';
import { createBus } from '../../src/game/stateCore.ts';
import { createInput } from '../../src/game/input.ts';
import { installMedalToasts } from '../../src/ui/medalToast.ts';
import { initHud } from '../../src/ui/hud.ts';
import { createDamagePanel } from '../../src/ui/damagePanel.ts';
import { createTouchControls } from '../../src/ui/touchControls.ts';
import { createSettings } from '../../src/ui/settings.ts';
import { createEndOverlayRuntime } from '../../src/ui/endOverlayRuntime.ts';
import { TANK_SPECS } from '../../src/vehicles/specs.ts';
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
  const spec = TANK_SPECS[['leo2a5','m1a2','t90m'][i%3]];
  return {id:`tank-${i}`, isPlayer:i===0, team:i<7?'player':'enemy', displayName:`Commander_Long_Name_${i}`,
    spec, state:createTankState(spec,new Vector3(i*10,0,50),0), combat:createCombatState(spec)};
});
const player = tanks[0];
hud.setDamagePanel(panel);
panel.setTank(player.spec);
panel.setState(player.combat);
const frame = {matchModeState:{id:'mars'}, auxiliaryKeyLabels:{smoke:'G',lights:'N',roofGun:'B',missile:'E'}, timeS:60, mode:'battle', player, tanks, spotting:{isSpotted:()=>true},
  aim:{shellSlot:0, reload:{t:0,totalS:6}, shells:[
    {name:'DM53',type:'APFSDS',count:24},{name:'DM12A2',type:'HEAT',count:16},{name:'DM11',type:'HE',count:12}
  ]}};
function hit(incoming=false, attackerIndex=8) {
  bus.emit('shell:hit',{attackerId:incoming?tanks[attackerIndex].id:player.id,targetId:incoming?player.id:tanks[8].id,
    attackerName:'Commander_Long_Name_8',targetName:'Leopard 2A5',targetSpecId:'leo2a5',attackerSpecId:'t90m',
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
  delete player.aerial;
  delete frame.camera; delete frame.aim.point; delete frame.aim.gunMarker; delete frame.aim.singleReticle;
  delete frame.rosterTanks; frame.tanks=tanks;
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
function roster(allies, enemies) {
  const entries=Array.from({length:allies+enemies},(_,i)=>{
    const spec=TANK_SPECS[['leo2a5','m1a2','t90m'][i%3]];
    const tank=i===0?player:{id:`large-${i}`,isPlayer:false,team:i<allies?'player':'enemy',
      displayName:`Commander_Long_Name_${i}`,spec,state:createTankState(spec,new Vector3(i*10,0,50),0),combat:createCombatState(spec)};
    if(i>0&&i%3===0)tank.combat.destroyed=true;
    return tank;
  });
  frame.rosterTanks=entries; frame.tanks=entries;
  hud.update(frame);
}
// A richer kit for the vehicle-controls layout: six controls add the drone (the HUD's own path). The seventh, a
// gun-launched missile beside a special action that is not the missile (the MBT-70's pairing: hydropneumatic aim and
// the Shillelagh), comes from the kit itself, so every hud.update keeps it shown (round 4: un-hiding the button by hand
// lasted only until the next update re-hid it, and the "seven-control" reticle stages ran with six). SEVEN_KIT is the
// M1A3 (smoke, lights, roof gun, a guided round among conventional ones) with the MBT-70's hydropneumatic gear.
const SEVEN_KIT = {...TANK_SPECS.m1a3, hydropneumaticAim:{noseDownDeg:10, noseUpDeg:10, rateDegS:8, compressionM:.65, droopM:.65}};
function controls(count) {
  if (count >= 6) player.aerial = {kind:'drone', active:false, cooldownS:0}; else delete player.aerial;
  const spec = count >= 7 ? SEVEN_KIT : TANK_SPECS.m1a3;
  if (player.spec !== spec) {
    player.spec = spec;
    player.combat = createCombatState(spec);
    player.specialAction = createSpecialActionState(spec);
  }
  hud.update(frame);
  window.dispatchEvent(new Event('cot-hud-relayout'));
  return [...document.querySelector('.cot-vehicle-controls').children].filter(button=>!button.classList.contains('cot-dock-more')&&button.getClientRects().length).length;
}
// The world camera for the stages that need one (the fixture otherwise has none: the aim point is the screen centre).
// Behind the player, looking down +Z, so a point's bearing from the player is its bearing on the hit indicator ring.
const camera = new PerspectiveCamera(60, 1, .1, 4000);
function withCamera() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  const p = player.state.pos;
  camera.position.set(p.x, p.y + 3, p.z - 8);
  camera.lookAt(p.x, p.y + 1.5, p.z + 60);
  camera.updateMatrixWorld();
  frame.camera = camera;
}
const unproject = (sx, sy) => new Vector3(sx / innerWidth * 2 - 1, 1 - sy / innerHeight * 2, .5).unproject(camera);
// The gun's own point away from the crosshair (a lagging or pinned gun): the ring and gun mark draw at (gx, gy); with
// `single` (a turretless sight: Strv 103, Jagdpanzer E100) the whole sight, readouts included, moves there. The camera's
// aim point stays the screen centre. aimAt(null) puts the gun back on the crosshair and drops the camera.
function aimAt(gun, {single=false}={}) {
  if (!gun) { delete frame.aim.point; delete frame.aim.gunMarker; delete frame.aim.singleReticle; delete frame.camera; hud.update(frame); return; }
  withCamera();
  frame.aim.point = unproject(innerWidth / 2, innerHeight / 2);
  frame.aim.gunMarker = unproject(gun.x, gun.y);
  frame.aim.singleReticle = single;
  for (let i = 0; i < 20; i++) { frame.timeS += 1 / 60; hud.update(frame); }
}
// An incoming penetration from `bearingDeg` (0 ahead of the camera, clockwise from above), 120 m out: the HUD draws its
// wedge round the screen centre and its damage figure beyond it. Earlier wedges are expired first (six seconds on).
function hitFrom(bearingDeg, {crit=false}={}) {
  withCamera();
  frame.timeS += 6; hud.update(frame);
  const attacker = tanks[8], p = player.state.pos, a = bearingDeg * Math.PI / 180;
  attacker.state.pos.set(p.x - Math.sin(a) * 120, p.y, p.z + Math.cos(a) * 120);
  bus.emit('shell:hit',{attackerId:attacker.id,targetId:player.id,attackerName:'Commander_Long_Name_8',targetName:'M1A3',
    targetSpecId:player.spec.id,attackerSpecId:'t90m',kind:'pen',damage:420,dmgRoll:460,penRoll:560,effectiveArmor:350,baseArmor:220,
    impactAngleDeg:34,shellType:'APFSDS',zone:'hullFront',flightDistM:120,timeS:frame.timeS,pos:[0,1,50],localPos:[0,1,2],localDir:[0,0,-1],
    ...(crit ? {modulesHit:[{module:'engine',newState:'red'}]} : {})});
  // Past the wedge's 0.12 s attack, so it draws at full size and strength.
  for (let i = 0; i < 15; i++) { frame.timeS += 1 / 60; hud.update(frame); }
  return window.__HUD_DEBUG?.getHitArcs?.() ?? [];
}
function clearHits() { frame.timeS += 6; hud.update(frame); delete frame.camera; hud.update(frame); }
// The reticle as the dock's keep-out check needs it: the battle sight or the scope, the ring at rest or at full bloom
// (the fixture has no camera, so the aim point is the screen centre and the ring's px size follows dispersionRadM and
// distM), the readouts at their widest: x25.0, a 1500 m range, a twelve-round magazine reloading (rack, +8, 13 s) or
// a round being chosen (SWITCHING). repaint() paints one more frame of the same view.
const restingAim = {...frame.aim}, restingTime = frame.timeS;
function reticle({sight='battle', bloom='full', readout='magazine'}={}) {
  frame.mode = sight==='scope'?'sniper':'battle'; // hud.update() follows frame.mode
  hud.setMode(frame.mode);
  Object.assign(frame.aim, {zoom:sight==='scope'?25:1, distM:1500, dispersionRadM:bloom==='full'?1e4:1e-4,
    magazine:readout==='magazine'?{capacity:12,rounds:7}:null,
    reload:readout==='magazine'?{t:12.6,totalS:15,kind:'magazine'}:readout==='switching'?{t:2,totalS:4,kind:'shell'}:{t:0,totalS:6},
    ammoSelectionPending:readout==='switching'});
  for(let i=0;i<150;i++){frame.timeS+=1/60;hud.update(frame);}
}
function repaint() { frame.aim.distM+=.3; frame.timeS+=1/60; hud.update(frame); }
function restAim() { for(const key of Object.keys(frame.aim))if(!(key in restingAim))delete frame.aim[key]; Object.assign(frame.aim,restingAim); frame.timeS=restingTime; frame.mode='battle'; hud.setMode('battle'); hud.update(frame); }
// The drone tile while a recalled drone flies home (droneControlState.ts reads returnS; item/drone-recall).
function droneReturning() { player.aerial = {kind:'drone', active:false, cooldownS:14, recallS:0, returnS:5}; hud.update(frame); }
window.__HUD_LAYOUT = {multiplayer,state, roster, controls, hud, bus, touch, settings, hit, frame, tanks, input,
  reticle, repaint, restAim, droneReturning, touchReticleFootprint, touchAimKeepOut, reticleTiers, aimAt, hitFrom, clearHits};
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
