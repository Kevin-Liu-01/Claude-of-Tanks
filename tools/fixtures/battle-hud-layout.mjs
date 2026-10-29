import '../../src/ui/tokens/tokens.css';
// the shared kit, as the game's entry loads it (main.ts): the HUD's flags, silhouettes, chips and key caps
import '../../src/ui/components/components.css';
// (the kit picker's sheet, which main.ts loads for the game: the spectator bar's picker of allies)
import '../../src/ui/components/pickers.css';
// (the kit's notices, which main.ts loads for the game: the battle's notice region, UI-LOCKDOWN B14)
import '../../src/ui/components/notices.css';
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
// the tablet layer (main.ts loads it at boot): the touch HUD's tablet sizes, item 262
import '../../src/ui/tablet.css';
import { PerspectiveCamera, Vector3, WebGLRenderer } from 'three';
import { installResponsiveLayout } from '../../src/ui/responsiveLayout.ts';
import { createBus } from '../../src/game/stateCore.ts';
import { sightFurniture, sightNotice } from '../../src/ui/sightFurniture.ts';
import { createInput } from '../../src/game/input.ts';
import { installMedalToasts } from '../../src/ui/medalToast.ts';
import { initHud } from '../../src/ui/hud.ts';
import { createDamagePanel } from '../../src/ui/damagePanel.ts';
import { initTopMaskRig } from '../../src/ui/tankThumbs.ts';
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
import { setLocale, t } from '../../src/ui/i18n.ts';
import { battleNotices } from '../../src/ui/battleNotices.ts';
import { zhTypeFloorStyle } from '../../src/ui/zhTypeFloor.ts';

// the catalog lands before the HUD builds (the game awaits it too), and a zh-CN capture carries the label floor its /cn/
// document ships (src/presentation/localizedHtml.ts), as the end-screen fixture does
await setLocale(new URLSearchParams(location.search).get('locale') || 'en-US');
if (document.documentElement.lang === 'zh-CN') document.head.insertAdjacentHTML('beforeend', zhTypeFloorStyle('game'));
// ?coarse=1 lays the HUD out for a touch screen (an iPad's pointer: coarse, no hover) in a desktop browser
if(new URLSearchParams(location.search).has('coarse')){const native=window.matchMedia.bind(window);
 window.matchMedia=query=>query==='(pointer: coarse)'||query==='(hover: hover)'?{matches:query==='(pointer: coarse)',media:query,addEventListener(){},removeEventListener(){}}:native(query);}
installResponsiveLayout();
const bus = createBus();
const input = createInput();
const hud = initHud(bus);
// (the nations' flags land before the first kill, as in a battle, whose load screen imports them long before one: the
// HUD imports them on demand, and the fixture's kills come at once, so some sizes' feeds drew flags and others none,
// gauntlet r17)
await import('../../src/ui/flags.ts');
await new Promise((resolve) => setTimeout(resolve, 0));
// (a gentle field under the battle, as a battle's map hands the HUD one: the minimap draws its relief and the drone reads
// its altitude off it; without one the altitude read a dash, gauntlet r5)
hud.buildMinimap({size:1024, minY:0, maxY:24, getHeightAt:(x,z)=>8+6*Math.sin(x/140)*Math.cos(z/170), getGroundType:()=>'grass'});
installMedalToasts(bus);
createEndOverlayRuntime({bus,onReturnToGarage:()=>hud.setMode('hidden')});
// ?masks: the damage panel's plan. Its top-down masks need a renderer (main.ts hands the game's over at boot); review
// renders on the WebGL path pass it, while the layout probes keep this fixture WebGL-free.
if (new URLSearchParams(location.search).has('masks')) initTopMaskRig({ renderer: new WebGLRenderer({ alpha: true }) });
const panel = createDamagePanel();
const settings = createSettings({input, bus, isBattleActive:()=>true, gearVisible:()=>false});
const touch = createTouchControls({input, bus, isBattleActive:()=>true, onOpenSettings:()=>settings.open()});
// ?tanks=N: a larger bot room (two even sides; the HUD's per-frame cost probes, brand-ui 249); 7 v 7 by default
const TANK_COUNT = Math.max(2, Math.min(64, Number(new URLSearchParams(location.search).get('tanks')) || 14));
// (each side spread over its own half of the map, as a battle's opening is: gauntlet r4 read the fixture's row of tanks
// near the centre as one hatched blob on the minimap)
const spread = (i, ally) => {
  const k = ally ? i : i - TANK_COUNT / 2, col = k % 4, row = Math.floor(k / 4);
  return ally ? new Vector3(-60 - col * 55, 0, 90 + row * 60) : new Vector3(60 + col * 55, 0, -90 - row * 60);
};
const tanks = Array.from({length:TANK_COUNT},(_,i)=>{
  const spec = TANK_SPECS[['leo2a4_v','m1a1_abrams_hc','t90am'][i%3]];
  const ally = i<TANK_COUNT/2;
  return {id:`tank-${i}`, isPlayer:i===0, team:ally?'player':'enemy', displayName:`Commander_Long_Name_${i}`,
    spec, state:createTankState(spec,i===0?new Vector3(0,0,50):spread(i,ally),0), combat:createCombatState(spec)};
});
const player = tanks[0];
// ?state=markers: the in-world markers over the tanks in view (the hull bars over allies and enemies, the target plate
// over the enemy under the gun), a camera at the player's roof looking down the field where the other states have none
const homes = tanks.map((tank) => tank.state.pos.clone());
// (the other enemies wide of the plate over the one under the gun: the bars decluttered, a bar crossing it waits hidden)
const MARKER_SEATS = [[8, 0, 150], [9, -95, 200], [10, 110, 240], [2, -26, 80], [3, 30, 104]];
const markerCamera = new PerspectiveCamera(60, 1, 0.5, 4000);
// (the two enemies wide of the plate stand whole on the window, and beside the plate where the window leaves the room: a
// phone's narrow view put the desktop's seats out of view, and a short window's put their bars across the plate, which
// the declutter holds back, so no bar showed; a desktop keeps its seats)
const MARKER_BAR_EDGE = 96, MARKER_PLATE_ROOM = 196;
function markerSeats() {
  const spread = Math.tan(markerCamera.fov * Math.PI / 360) * innerWidth / innerHeight, cx = innerWidth / 2;
  return MARKER_SEATS.map(([i, x, z]) => {
    if (tanks[i].team !== 'enemy' || x === 0) return [i, x, z];
    const column = cx * (1 - x / (z * spread));
    const seat = x > 0 ? Math.max(MARKER_BAR_EDGE, Math.min(column, cx - MARKER_PLATE_ROOM))
      : Math.min(innerWidth - MARKER_BAR_EDGE, Math.max(column, cx + MARKER_PLATE_ROOM));
    return [i, (1 - seat / cx) * z * spread, z];
  });
}
const flightCamera = new PerspectiveCamera(55, 1, 0.5, 6000);
flightCamera.userData.thermalFlight = true;
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
  // r10: Juggernaut's unlimited rounds through the scope (critic r9: no frame showed the ∞ readout); the scope with a
  // shot report up, and with the combat log open too, in the right lane over the vision switch's seat
  'ammo-unlimited-sniper': {spec:'m1a3', mode:'juggernaut', magazineRounds:3, reload:{t:1.4,totalS:2.5,kind:'intraClip'},
    sniper:true},
  'ammo-reload-sniper-report': {spec:'m1a1_abrams_hc', reload:{t:3.2,totalS:6,kind:'shell'}, sniper:true, report:true},
  'ammo-reload-sniper-log': {spec:'m1a1_abrams_hc', reload:{t:3.2,totalS:6,kind:'shell'}, sniper:true, report:true, log:true},
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
  if (stage.report) for (let i = 0; i < 3; i++) { hit(); hit(true); }
  if (stage.log && !document.querySelector('.cot-si-log.open')) bus.emit('ui:shotLog', {});
}
function hit(incoming=false, attackerIndex=8) {
  bus.emit('shell:hit',{attackerId:incoming?tanks[attackerIndex].id:player.id,targetId:incoming?player.id:tanks[8].id,
    attackerName:'Commander_Long_Name_8',targetName:'Leopard 2A5',targetSpecId:'leo2a4_v',attackerSpecId:'t90am',
    // (the event's own field names: the card read effectiveArmor/baseArmor/penRoll as missing, "Armor –", gauntlet r3)
    kind:'pen',damage:420,dmgRoll:460,penRollMm:560,penRollFreshMm:560,effectiveMm:350,nominalMm:220,impactAngleDeg:34,
    shellType:'APFSDS',zone:'hullFront',flightDistM:240,timeS:60,pos:[0,1,50],localPos:[0,1,2],localDir:[0,0,-1]});
}
// The consumables tray as a crew's loadout sets it (ui:battleConsumables, game/consumableLoadout.ts): each state one of
// five threes from the catalog in turn (sim/consumableRules.ts, thirteen items), so between them the states show every
// item's glyph and its uses left; a tree without the catalog keeps the three kits. (Its path is built, so the dev server
// leaves the import to the page.)
const CATALOG_PATH=['..','..','src','sim','consumableRules.ts'].join('/');
const consumableIds=await import(/* @vite-ignore */ CATALOG_PATH).then((module)=>module.CONSUMABLE_CATALOG.map((item)=>item.id),()=>[]);
function stageTray(name){
  if(!consumableIds.length)return;
  const three=[...name].reduce((sum,c)=>sum+c.charCodeAt(0),0)%5;
  bus.emit('ui:battleConsumables',{items:[0,1,2].map((k)=>consumableIds[(three*3+k)%consumableIds.length])});
}
let network=null;
function multiplayer(kind='healthy', role='host') {
  network?.dispose();
  network=createMultiplayerStatusSurface({onLeave:()=>window.__HUD_LEFT=true});
  const snapshot=Object.assign(new NetworkStatusModel().snapshot,{attached:true,health:kind==='healthy'?'good':'offline',room:'joined',roomPhase:'playing',link:'live',rttMs:42,rttMedianMs:45,rosterCount:28,seat:1,role,peersConnected:27});
  network.set(snapshot,kind==='healthy'?null:{kind:'reconnecting',scope:'match',attempt:2,nextRetryS:3});
  return network;
}
function state(name) {
  network?.dispose();network=null;
  battleNotices.dismiss('cot-pointer-lock');
  delete frame.rosterTanks; frame.tanks=tanks; frame.aim=defaultAim(); frame.mode='battle';
  delete frame.camera; tanks.forEach((tank, i) => { tank.state.pos.copy(homes[i]); tank.combat.hp = tank.combat.maxHp; });
  // (a networked state's link round trip from its first frame: the corner chip reads it at most once a second)
  frame.pingMs=name==='mp-host'||name==='mp-client'||name==='notices'?42:0;
  frame.aim.gunLimitSpec = name==='notifications';
  settings.close({noRelock:true});
  const modeId = name.startsWith('mode-') ? name.slice(5) : 'mars';
  // (the Horde's hostiles left are the enemy roster's living; a flag battle carries its two flags at their bases)
  frame.matchModeState = {id:modeId, score:{alpha:2,bravo:1}, target:modeId==='capture_the_flag'?3:modeId==='turbo_ball'?5:750,
    horde:{wave:3,alive:tanks.filter(t=>t.team==='enemy'&&!t.combat.destroyed).length},line:{index:1,total:3},playerAmmo:24,playerAmmoCapacity:40};
  if(modeId==='capture_the_flag')frame.matchModeState.flags=[{team:'alpha',x:-240,z:200,baseX:-240,baseZ:200,status:'home'},
    {team:'bravo',x:240,z:-200,baseX:240,baseZ:-200,status:'home'}];
  // zone control's three zones (the sector chips under the score and the map's badges): held, contested, lost
  if(modeId==='zone_control')frame.matchModeState.zones=[{x:-150,z:90,control:1,owner:'alpha',contested:false},
    {x:0,z:0,control:.4,owner:null,contested:true},{x:150,z:-90,control:-1,owner:'bravo',contested:false}];
  // (?tank=<id> stages another vehicle's controls row, e.g. strv103b's suspension or mbt70's suspension and ATGM)
  player.spec = TANK_SPECS[new URLSearchParams(location.search).get('tank')||(name==='special'?'bwp1':'m1a3')];
  player.combat = createCombatState(player.spec);
  player.specialAction = createSpecialActionState(player.spec);
  hud.setMode('hidden'); hud.setMode('battle');
  // Cross the real 30-frame FPS threshold; single-frame fixtures miss this plate.
  for(let i=0;i<31;i++)hud.update(frame);
  panel.update(player.combat);
  // (a watched battle is watched from its start, so its kills are never the viewer's: the watch side before the first,
  // as watchRuntime.ts sets it; set after them, the lane read "You" in Watch, gauntlet r17)
  if(name.startsWith('watch-'))hud.setWatchSide('player');
  // (the first battles' strip stands at the rollout, before the player's first engagement: no kills staged)
  for(let i=0;i<(name==='hints'?0:name==='feed-burst'?14:3);i++){
    bus.emit('mode:respawn',{id:tanks[8].id});
    bus.emit('mode:respawn',{id:tanks[1].id});
    bus.emit('tank:destroyed',{id:tanks[8].id,killerId:player.id,cause:'fire'});
    bus.emit('tank:destroyed',{id:tanks[1].id,killerId:tanks[9].id,cause:'fire'});
    // (a burst's allied lane full of a teammate's kills: the player's own go to the kill ribbon wherever it shows,
    // UI-LOCKDOWN B1, so the burst would leave that lane short of its eight rows)
    if(name==='feed-burst'){bus.emit('mode:respawn',{id:tanks[10].id});bus.emit('tank:destroyed',{id:tanks[10].id,killerId:tanks[2].id,cause:'fire'});}
  }
  if(name==='notifications'||name==='notices'||name.startsWith('mode-')) {
    bus.emit('player:spotted',{timeS:frame.timeS-4});
    hud.update(frame);
    if(name==='notifications'||name==='notices')bus.emit('ui:magazineReloadStarted',{});
  }
  // the battle's notice region (UI-LOCKDOWN B14) under the detection and the alert: a lost link's banner with its leave,
  // and on a mouse layout the pointer lock's notice waiting behind it (pointerLockFeedbackRuntime.ts raises it with these
  // options on a durable denial; a touch layout never takes the pointer)
  if(name==='notices'){
    multiplayer('offline');
    if(!document.body.classList.contains('cot-touch-layout'))battleNotices.show({id:'cot-pointer-lock',className:'cot-lock-notice',
      severity:'warning',text:t('pointerLock.toast.unavailable'),durationMs:null,dismissible:false});
    for(let i=0;i<3;i++)hud.update(frame);
  }
  if(name==='countdown') hud.preBattleCountdown(5);
  if(name==='reports'||name==='log'||name==='chat'||name==='combined'||name==='feed-burst') {
    for(let i=0;i<(name==='feed-burst'?14:6);i++){hit();hit(true,name==='feed-burst'?8+i%2:8);}
  }
  if(name==='log'||name==='combined')bus.emit('ui:shotLog',{});
  if(name==='chat'||name==='combined'||name==='spectator'){
  }
  // ?state=spectator-pick: the bar's picker of allies open over it (spectatorSwitcher.ts mountSpectateAllies)
  if(name==='spectator'||name==='spectator-pick'){
    const allies=tanks.filter(t=>t.team==='player'&&!t.isPlayer).map(t=>t.id);
    // (the bar names the ally the picker lists, its own callsign and vehicle: a staged Leopard beside the list's T-90AM
    // read as one player in two tanks, gauntlet r15)
    const seat=tanks.find((tank)=>tank.id===allies[1]);
    hud.stageSpectateBar({id:seat.id,specId:seat.spec.id,name:seat.displayName,vehicle:seat.spec.name,count:allies.length,index:2,allies});
    if(name==='spectator-pick')requestAnimationFrame(()=>document.querySelector('.cot-spec .subject')?.click());
  }
  // ?state=watch-ride | watch-drone: Watch mode's bar over the HUD (src/app/watchRuntime.ts), riding an ally or flying;
  // watch-markers: the markers' frame under the bar, riding
  if(name.startsWith('watch-')){
    const view=name==='watch-markers'?'ride':name.slice(6), seat=tanks[3];
    void import('../../src/ui/watchHud.ts').then(({createWatchHud})=>{
      const watch=createWatchHud(()=>hud.root,{cycle(){},drone(){},toggleSeat(){},setClimb(){}});
      watch.update({view,tank:view==='drone'?null:{id:seat.id,team:'player',spec:{id:seat.spec.id,name:seat.spec.name,nation:seat.spec.nation}},
        canTake:true,speedIndex:2,speedSteps:5});
      window.__HUD_LAYOUT.watch=watch;
      if(name==='watch-markers')settle();
    });
  }
  // ?state=gunship | drone: the player flying (the AC-130's gunship sight, a drone's feed), as the battle's aerial view
  // reaches the HUD (sim/matchModes.ts AerialView); ?state=hints: the first battles' controls strip (settings.ts)
  delete player.aerial;
  if(name==='gunship'||name==='drone'){
    player.aerial={kind:name,active:true,launching:false,x:player.state.pos.x,y:name==='drone'?40:900,z:player.state.pos.z,
      yaw:0,pitch:-0.5,batteryS:80,cooldownS:0,recallS:0,returnS:0};
    frame.matchModeState={...frame.matchModeState,id:name==='gunship'?'ac130':'drone'};
    // (the gunship flown from its gimbal, its airframe hidden: the lens's sight and solution show, gauntlet r4)
    player.visual=name==='gunship'?{root:{visible:false}}:undefined;
    // (the flight's own camera, in its thermal view as a battle's flight camera is: without one the vision switch stood
    // disabled and read as greyed out, gauntlet r14)
    flightCamera.aspect=innerWidth/innerHeight;flightCamera.position.set(player.aerial.x,player.aerial.y,player.aerial.z);
    flightCamera.lookAt(player.state.pos);flightCamera.updateProjectionMatrix();flightCamera.updateMatrixWorld();
    frame.camera=flightCamera;
    for(let i=0;i<5;i++)hud.update(frame);
  }
  if(name==='markers'||name==='watch-markers')markers();
  // ?state=proving | proving-moving: the proving ground's range (sim/matchModes.ts ProvingRangePresentation), its lanes'
  // hulls the markers' enemies, the gun laid on the first: the target plate names its lane (owner 2026-10-27, "always
  // have names their even if not (this is in proving ground)")
  if(name==='proving'||name==='proving-moving')proving(name==='proving-moving');
  if(name==='hints')settings.showHints();
  if(name==='settings')settings.open();
  // (the frame carries the sight too: a mode set alone was undone by the next frame's 'battle', gauntlet r3 read idle)
  if(name==='sniper'){frame.mode='sniper';hud.setMode('sniper');for(let i=0;i<4;i++)hud.update(frame);}
  if(name==='large-map'){
    hit(); hud.shotInfo.toggleLog();
    bus.emit('ui:minimapZoom',{});
  }
  if(name.startsWith('ammo-'))stageAmmo(name);
  // a networked battle's corner (UI-LOCKDOWN part C): the v2 strip up as the host or a client, the frame carrying the
  // link's round trip, so the HUD's own link chip would show beside the strip if the one-readout rule broke
  if(name==='mp-host'||name==='mp-client'){
    multiplayer('healthy',name==='mp-host'?'host':'client');
    for(let i=0;i<3;i++)hud.update(frame);
  }
  stageTray(name);
  if(name==='ended')bus.emit('battle:ended',{result:'victory',timeS:320,reason:'elimination',roster:tanks.map(t=>({
    id:t.id,isPlayer:t.isPlayer,team:t.team,specId:t.spec.id,name:t.displayName,hp:t.combat.hp,maxHp:t.combat.maxHp
  }))});
  return name;
}
// The markers staged over the state on screen (the receipts check them in every state: spectate, Watch, the aerial
// views, a networked battle's host and client): the camera, the seats in view and the enemy under the gun.
function markers() {
  markerCamera.aspect=innerWidth/innerHeight;
  for(const [i,x,z] of markerSeats())tanks[i].state.pos.set(x,0,z);
  markerCamera.position.set(0,6,0);markerCamera.lookAt(0,2,150);
  markerCamera.updateProjectionMatrix();markerCamera.updateMatrixWorld();
  const target=tanks[8].state.pos, at=new Vector3(target.x,1.6,target.z);
  frame.camera=markerCamera;
  frame.aim={...frame.aim,point:at,distM:at.distanceTo(markerCamera.position),dispersionRadM:1.2,gunTargetId:tanks[8].id};
  tanks[8].combat.hp=Math.round(tanks[8].combat.maxHp*.62);tanks[9].combat.hp=Math.round(tanks[9].combat.maxHp*.35);
  for(let i=0;i<4;i++)hud.update(frame);
  nearAlly();
  settle();
}
// (a phone's window leaves the plate over the enemy under the gun no room beside it for a bar, and a tank at its depth
// stands under it, held back: an ally near, its top under the plate, carries the window's bar. Its callsign is a short
// one, as a lobby mixes them: at 320x568 the one band of world left between the panels holds the plate over the sight's
// ring, and a 21-character name's bar fits neither run beside the ring, markers r20)
function nearAlly() {
  const plate=document.querySelector('.cot-tgt')?.getBoundingClientRect();
  if((innerWidth>=720&&innerHeight>=520)||!plate?.width)return;
  const tank=tanks[2], eye=markerCamera.position;
  if(tank.displayName)tank.displayName='Wren';
  const ray=new Vector3((plate.left+plate.width/4)/innerWidth*2-1,1-(plate.bottom+68)/innerHeight*2,.5).unproject(markerCamera).sub(eye);
  const along=((tank.spec.dims?.heightM??2.5)-eye.y)/ray.y;
  tank.state.pos.set(eye.x+ray.x*along,0,eye.z+ray.z*along);
  for(let i=0;i<2;i++)hud.update(frame);
}
// (and frames for a moment more, as a battle runs them: the bars and the plate keep clear of what the layout measures each
// pass, and a still whose last frame ran before a pass, or before Watch's bar mounted, kept a bar under the touch
// ammunition card and the plate under Watch's bar)
let settleUntil=0, settling=false;
function settle() {
  settleUntil=performance.now()+1500;
  if(settling)return;
  settling=true;
  const again=()=>{hud.update(frame);if(performance.now()<settleUntil)requestAnimationFrame(again);else settling=false;};
  requestAnimationFrame(again);
}
function proving(moving) {
  // (each lane's range from the player's seat, as the plate reads it)
  const seat=player.state.pos;
  const lanes=markerSeats().filter(([i])=>tanks[i].team==='enemy').map(([i,x,z],index)=>({index,rangeM:Math.round(Math.hypot(x-seat.x,z-seat.z)),
    presentDeg:0,x,z,targetId:tanks[i].id,targetSpecId:tanks[i].spec.id,targetName:tanks[i].spec.name,
    shells:[{penMm:560,ratio:1.4,outcome:'pen'},{penMm:470,ratio:1.1,outcome:'marginal'},{penMm:300,ratio:.7,outcome:'nopen'}]}));
  frame.matchModeState={id:'proving_ground',score:{alpha:0,bravo:0},target:0,
    range:{mapId:'proving',moving,plateAnglesDeg:[0,30,60],origin:{x:0,z:0},lanes,plates:[],lastShot:null}};
  markers();
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
// (the layout's published sight furniture, the HUD's own module instance: tools/hud-sight-furniture.browser.mjs reads it)
// ?bg=snow | night: a backdrop as bright as snow or as dark as a night battle under the HUD, for the markers' legibility
// (the fixture runs without the 3D scene)
const BACKDROPS={snow:'radial-gradient(120% 80% at 40% 30%,#f4f7fa,#d9e2ea 55%,#c4d0da)',
  night:'radial-gradient(120% 80% at 40% 30%,#1b2433,#0c111b 60%,#05080d)'};
const backdrop=BACKDROPS[new URLSearchParams(location.search).get('bg')];
if(backdrop)document.body.style.background=backdrop;
// ?names=bots: the other hulls without display names, so the plates carry the bots' callsigns (ui/botCallsigns.ts) where
// the long commanders' names stand in for a room's players
if(new URLSearchParams(location.search).get('names')==='bots')for(const tank of tanks)if(!tank.isPlayer)delete tank.displayName;
window.__HUD_LAYOUT = {multiplayer,state, markers, proving, roster, hud, panel, bus, touch, settings, hit, frame, tanks, sightFurniture, sightNotice, ammoStages:Object.keys(AMMO_STAGES)};
const params = new URLSearchParams(location.search);
state(params.get('state') || 'idle');
// (two more frames once layout settles: the HUD's size observers (the minimap's label size, 140 px and under none) land
// after the state's frames, and a live battle's next frame repaints with them)
setTimeout(() => { for (let i = 0; i < 2; i++) hud.update(frame); }, 250);
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
