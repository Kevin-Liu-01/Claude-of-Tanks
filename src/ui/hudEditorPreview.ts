import { installMedalToasts } from './medalToast.ts';
import { MEDALS } from '../game/serviceRecord.ts';
import { getSupportedLocales, setLocale } from './i18n.ts';
/** Isolated, presentation-only battle. No renderer, tank builders or simulation loop. */
import { Vector3 } from 'three';
import { createBus } from '../game/stateCore.ts';
import { createTankState } from '../sim/movement.ts';
import { createCombatState } from '../sim/damage.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { initHud, type HudFrame, type HudTank } from './hud.ts';
import { installResponsiveLayout } from './responsiveLayout.ts';
import { createTouchControls } from './touchControls.ts';
import { DAMAGE_PANEL_CSS } from './damagePanelStyle.ts';
import { ensureStyle } from './dom.ts';
import { ensureFonts } from './fonts.ts';

const params = new URLSearchParams(location.search);
const touch = params.get('profile') !== 'desktop';
const focus=params.get('focus');
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

async function imageAt(src: string): Promise<HTMLImageElement> {
  const image = new Image(); image.src = src; await image.decode(); return image;
}

async function healthPanel(parent: HTMLElement): Promise<void> {
  ensureStyle('cot-dp-style', DAMAGE_PANEL_CSS);
  const panel = document.createElement('div'); panel.className = 'cot-dp'; panel.style.width = '160px';
  panel.innerHTML = '<div class="hprow"><span class="hplabel">HP</span><span class="hpnum">2,750 / 2,750</span></div><div class="hptrack"><div class="hpfill" style="background:#7ee87e"></div></div>';
  const canvas = document.createElement('canvas'); canvas.width = 284; canvas.height = 276;
  canvas.style.cssText = 'width:142px;height:138px'; panel.append(canvas); parent.append(panel);
  const image = await imageAt('/icons/m1a2_top.webp');
  const scale = Math.min(264 / image.width, 256 / image.height);
  canvas.getContext('2d')?.drawImage(image, (284-image.width*scale)/2, (276-image.height*scale)/2, image.width*scale, image.height*scale);
}

/** Freeze the production DOM, preserving canvases and pseudo-element frames.
 * Old transient timers only own detached nodes; nothing disappears mid-edit. */
function freezePresentation(): void {
  for (const source of [...document.body.children]) {
    if (!(source instanceof HTMLElement) || source.tagName === 'SCRIPT') continue;
    const copy = source.cloneNode(true) as HTMLElement;
    const canvases = copy.querySelectorAll('canvas');
    source.querySelectorAll('canvas').forEach((canvas,index) => canvases[index]?.getContext('2d')?.drawImage(canvas,0,0));
    source.replaceWith(copy);
  }
}

async function prepare(): Promise<void> {
  const locale=getSupportedLocales().find(value=>value===params.get('locale'));if(locale)setLocale(locale);
  ensureFonts(); installResponsiveLayout();
  const bus = createBus(); const hud = initHud(bus);
  createTouchControls({bus, input:{isTouchLayout:()=>touch,setVirtualMove:()=>{},addVirtualAim:()=>{},pressVirtual:()=>{},releaseVirtual:()=>{},tapVirtual:()=>{}},
    isBattleActive:()=>true,isSniper:()=>false,onOpenSettings:()=>{},onToggleSound:()=>false});
  const names = ['Vanguard','LongStop','SteppeWolf','OldNikolai','TotTokkie','PakWagen','SteelFox'];
  const tanks = Array.from({length:14},(_,i)=>{
    const spec = TANK_SPECS[['m1a2','leo2a5','t90m'][i%3]!]!;
    return {id:`preview-${i}`,isPlayer:i===0,team:i<7?'player':'enemy',displayName:names[i%7]!,spec,
      state:createTankState(spec,new Vector3((i%7-3)*24,0,i<7?90:-150),0),combat:createCombatState(spec)};
  });
  const player:HudTank=tanks[0]!;
  if(focus==='aircraft')player.aerial={kind:'gunship',active:true,launching:false,x:0,y:220,z:0,yaw:0,pitch:-.6,batteryS:100,cooldownS:0};
  const frame: HudFrame = {timeS:135,mode:'battle',player,tanks,spotting:{isSpotted:()=>true},
    matchModeState:{id:focus==='aircraft'?'ac130':'zone_control',score:{alpha:240,bravo:180},target:750},
    auxiliaryKeyLabels:{smoke:'G',lights:'N',roofGun:'B',missile:'E'},
    aim:{distM:240,shellSlot:0,reload:{t:0,totalS:6},shells:[{name:'M829A2',type:'APFSDS',count:24},{name:'M830',type:'HEAT',count:12},{name:'M908',type:'HE',count:8}]}};
  await Promise.all([healthPanel(hud.root),hud.buildMinimapFromAsset({size:1200,minY:0,maxY:80,getHeightAt:()=>0,getGroundType:()=> 'grass'},'/minimaps/verdant.webp'),document.fonts.ready]);
  hud.setMode('battle'); for(let i=0;i<31;i++)hud.update(frame);
  bus.emit('tank:destroyed',{id:tanks[8]!.id,killerId:player.id,cause:'fire'});
  bus.emit('shell:hit',{attackerId:player.id,targetId:tanks[8]!.id,attackerName:'Vanguard',targetName:'T-90M',targetSpecId:'t90m',attackerSpecId:'m1a2',
    kind:'pen',damage:420,dmgRoll:460,penRoll:560,effectiveArmor:350,baseArmor:220,impactAngleDeg:34,shellType:'APFSDS',zone:'hullFront',flightDistM:240,timeS:135,pos:[0,1,50],localPos:[0,1,2],localDir:[0,0,-1]});
  if(focus==='medals'){installMedalToasts(bus);bus.emit('service:medal',{id:MEDALS[0]!.id});}
  else if(focus==='alerts')bus.emit('ui:magazineReloadStarted',{});
  else bus.emit('player:spotted',{timeS:131});
  if(focus==='damage')bus.emit('shell:hit',{attackerId:tanks[8]!.id,targetId:player.id,attackerName:'SteelFox',targetName:'Vanguard',targetSpecId:'m1a2',attackerSpecId:'t90m',kind:'pen',damage:320,shellType:'APFSDS',timeS:135});
  if(focus==='killsRight')bus.emit('tank:destroyed',{id:tanks[1]!.id,killerId:tanks[9]!.id,cause:'fire'});
  hud.update(frame);
  await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));
  // Shared layout owners batch their measurements across animation frames.
  for(let i=0;i<6;i++)await nextFrame();
  freezePresentation();await nextFrame();await nextFrame();
  document.documentElement.dataset.previewReady='true';
  parent.postMessage({type:'cot:hud-preview-ready'},location.origin);
}
void prepare().catch(()=>parent.postMessage({type:'cot:hud-preview-error'},location.origin));
