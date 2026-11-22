import type { CombatState } from '../sim/damage.ts';
import { ensureStyle } from './styleLayers.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import { createRichTooltip } from './richTooltip.ts';
import { markDatum } from './dom.ts';
import { createVehicleStatusReader, vehicleStatusCapacity, MAX_VEHICLE_STATUS_BOXES,
  type ConcealmentStatus, type VehicleStatus } from './vehicleStatusPolicy.ts';

// The status chips over the damage panel on the direction's grammar (brand-ui H4, 06-battle-hud.html .al): each on the
// HUD plate, a 3 px edge and a hairline in its severity's ink, the repair filling it from the floor.
const CSS = `
.cot-vehicle-status{position:absolute;left:0;bottom:calc(100% + var(--hud-status-lift,5px));display:flex;gap:4px;width:100%;pointer-events:auto;}
.cot-vehicle-status[hidden],.cot-status-box[hidden]{display:none!important}
.cot-status-box{position:relative;isolation:isolate;flex:0 0 34px;height:34px;padding:5px;display:grid;place-items:center;overflow:hidden;
 border:0;border-radius:var(--r1);background:var(--hud-plate);color:var(--danger);font:700 var(--battle-fs-11)/1 var(--font-ui);cursor:help;
 box-shadow:var(--battle-chip-danger);}
.cot-status-box[data-tone=warning]{color:var(--warn);box-shadow:var(--battle-chip-warn)}
.cot-status-box[data-tone=positive]{color:var(--ok);box-shadow:var(--battle-chip-ok)}
.cot-status-box svg{width:23px;height:23px;position:relative;z-index:var(--z-lift)}
.cot-status-fill{position:absolute;inset:0;background:currentColor;opacity:.25;transform-origin:bottom;transform:scaleY(var(--repair-fill,0));pointer-events:none;}
.cot-status-mark{position:absolute;bottom:1px;right:2px;z-index:var(--z-lift);min-width:9px;text-align:center;font:700 var(--battle-fs-11)/1 var(--font-ui);color:inherit}
.cot-status-box:focus-visible{outline:2px solid var(--focus-ink);outline-offset:2px}
.cot-status-box:hover{background:var(--hud-plate-strong)}
.cot-status-summary{white-space:pre-line}
.cot-touch-layout .cot-status-box{flex-basis:44px;height:44px;padding:9px}
/* fire-visible-275 (Kevin 2026-11-22: "if a tank is on fire or our tank we have to see the fire effects"; his pick, an
   edge flicker with the notice): in the sight our own hull's flames are out of frame, so the sight's bottom edge burns
   while we do. Shown only scoped (html[data-cot-scoped]); the compositor alone (opacity, scale); still under reduced
   motion, where it keeps its glow. */
.cot-scope-fire{position:absolute;left:0;right:0;bottom:0;height:26%;pointer-events:none;opacity:0;visibility:hidden;
 transition:opacity var(--dur-base) ease-out,visibility 0s linear var(--dur-base);
 background:linear-gradient(to top,rgba(255,96,16,.42),rgba(255,96,16,.14) 38%,rgba(255,96,16,0) 72%);}
.cot-scope-fire::before,.cot-scope-fire::after{content:"";position:absolute;inset:0;transform-origin:50% 100%;will-change:transform,opacity;
 background:radial-gradient(14% 62% at 9% 100%,rgba(255,176,64,.75),rgba(255,96,16,0)),radial-gradient(11% 48% at 27% 100%,rgba(255,150,40,.7),rgba(255,96,16,0)),
 radial-gradient(15% 70% at 46% 100%,rgba(255,170,56,.62),rgba(255,96,16,0)),radial-gradient(12% 52% at 66% 100%,rgba(255,150,40,.7),rgba(255,96,16,0)),
 radial-gradient(14% 64% at 87% 100%,rgba(255,176,64,.75),rgba(255,96,16,0));}
.cot-scope-fire::after{transform:scaleX(-1);opacity:.7}
html[data-cot-scoped] .cot-scope-fire[data-burning]{opacity:1;visibility:visible;transition:opacity var(--dur-fast) ease-out}
html[data-cot-scoped] .cot-scope-fire[data-burning]::before{animation:cot-scope-lick .62s ease-in-out infinite alternate}
html[data-cot-scoped] .cot-scope-fire[data-burning]::after{animation:cot-scope-lick-b .47s ease-in-out infinite alternate}
@keyframes cot-scope-lick{0%{transform:scaleY(.78);opacity:.7}45%{transform:scaleY(1.08);opacity:1}100%{transform:scaleY(.9);opacity:.82}}
@keyframes cot-scope-lick-b{0%{transform:scale(-1,1.06);opacity:.5}60%{transform:scale(-1,.8);opacity:.8}100%{transform:scale(-1,1);opacity:.62}}
:root[data-motion=reduce] .cot-scope-fire::before,:root[data-motion=reduce] .cot-scope-fire::after{animation:none!important}
@media (prefers-reduced-motion:reduce){:root:not([data-motion]) .cot-scope-fire::before,:root:not([data-motion]) .cot-scope-fire::after{animation:none!important}}
`;
function label(status: VehicleStatus): string {
  const name=t(status.labelKey);
  if (status.id==='crew') return t('hud.status.crewCount',{count:status.count});
  if (status.id==='fire'||status.id==='conceal') return name;
  return t(status.tone==='danger'?'hud.status.disabled':'hud.status.damaged',{name});
}
function detail(status: VehicleStatus): string {
  const title=label(status);
  return status.progress===null ? title : `${title} — ${t('hud.status.repairProgress',{percent:status.progress})}`;
}
/** A bounded child of the damage panel: follows HUD editing, scaling and visibility. */
export function createVehicleStatusStrip() {
  ensureStyle('cot-vehicle-status-style',CSS,'surfaces');
  const root=document.createElement('div');root.className='cot-vehicle-status';root.hidden=true;
  // fire's, the modules' and the crew's one place, with their severity and the repair's fill (UI-LOCKDOWN B2)
  markDatum(root,'vehicle-status');
  root.setAttribute('role','group');root.setAttribute('aria-label',t('hud.status.title'));
  // fire-visible-275: the sight's burning edge, the fire chip's own state in the sight (mounted on the HUD's layer, not the
  // panel: a scaled or moved panel must not carry it), decoration only
  const edge=document.createElement('div');edge.className='cot-scope-fire';edge.setAttribute('aria-hidden','true');
  let edgeBurning=false;
  function paintEdge(burning:boolean){if(burning===edgeBurning)return;edgeBurning=burning;edge.toggleAttribute('data-burning',burning);}
  const read=createVehicleStatusReader();let active:readonly VehicleStatus[]=[];
  let capacity=MAX_VEHICLE_STATUS_BOXES;
  const cells=Array.from({length:MAX_VEHICLE_STATUS_BOXES},()=>{
    const button=document.createElement('button');button.type='button';button.className='cot-status-box';button.hidden=true;
    const fill=document.createElement('span');fill.className='cot-status-fill';fill.setAttribute('aria-hidden','true');
    const icon=document.createElement('span');icon.setAttribute('aria-hidden','true');
    const mark=document.createElement('span');mark.className='cot-status-mark';mark.setAttribute('aria-hidden','true');
    button.append(fill,icon,mark);root.append(button);
    return {button,icon,mark,key:'',text:'',tone:'',progress:-1};
  });
  const tooltip=createRichTooltip(root,'.cot-status-box',button=>{
    const content=document.createElement('div');content.className='cot-status-summary';content.textContent=button.getAttribute('aria-label');return content;
  });
  // These are readouts, never a second fire/drive binding while pointer lock is released.
  root.addEventListener('pointerdown',event=>event.stopPropagation());
  root.addEventListener('mousedown',event=>event.stopPropagation());
  root.addEventListener('click',event=>event.stopPropagation());
  type Cell = (typeof cells)[number];
  function overflowText(cell:Cell,index:number):string {
    let summary='';
    for(let n=index;n<active.length;n++)summary+=(n===index?'':'\n')+detail(active[n]!);
    const count=active.length-index,badge=`+${count}`;
    if(cell.icon.textContent!==badge)cell.icon.textContent=badge;
    return `${t('hud.status.more',{count})}\n${summary}`;
  }
  function paintCell(cell:Cell,index:number,more:boolean) {
    const entry=active[index]!,key=more?'more':entry.id;
    if(key!==cell.key){
      tooltip.hide();cell.key=key;cell.button.dataset.status=key;
      cell.icon.innerHTML=more?'':uiIconSVG(entry.icon,23,'currentColor');
    }
    const text=more?overflowText(cell,index):detail(entry);
    if(cell.text!==text){cell.text=text;cell.button.setAttribute('aria-label',text);}
    const tone=entry.tone;
    if(cell.tone!==tone){cell.tone=tone;cell.button.dataset.tone=tone;}
    const progress=more?-1:entry.progress??-1;
    if(cell.progress!==progress){cell.progress=progress;cell.button.style.setProperty('--repair-fill',String(Math.max(0,progress)/100));}
    const mark=more?'':tone==='danger'?'!':tone==='warning'?'•':'';
    if(cell.mark.textContent!==mark)cell.mark.textContent=mark;
  }
  function paint() {
    const visible=Math.min(capacity,active.length),overflow=active.length>capacity;
    const wasHidden=root.hidden;root.hidden=visible===0;
    if(root.hidden)tooltip.hide();
    let changed=wasHidden!==root.hidden;
    for(let i=0;i<cells.length;i++){
      const cell=cells[i]!,hidden=i>=visible;
      if(cell.button.hidden!==hidden){cell.button.hidden=hidden;changed=true;if(hidden)tooltip.hide();}
      if(!hidden)paintCell(cell,i,overflow&&i===visible-1);
    }
    if(changed)window.dispatchEvent(new Event('cot-hud-relayout'));
  }
  // The chips that fit the room the strip may take (its panel, less the touch strip's --status-room-inset) at a chip's own
  // width, never the strip's own width: on touch the strip hugs its chips (hud.ts), so its width is what it already shows,
  // and a capacity read from it never grew past two (266).
  let room:HTMLElement|null=null;
  const resize=new ResizeObserver(()=>{
    if(!root.getClientRects().length)tooltip.hide();
    if(!room)return;
    const style=getComputedStyle(root),chip=parseFloat(getComputedStyle(cells[0]!.button).flexBasis)||34;
    capacity=vehicleStatusCapacity(room.clientWidth-(parseFloat(style.getPropertyValue('--status-room-inset'))||0),chip,parseFloat(style.columnGap)||0);
    paint();
  });
  resize.observe(root);
  // Cache primitive snapshots because the reader intentionally reuses its records.
  const previous=Array.from({length:18},()=>({id:'',tone:'',progress:null as number|null,count:0}));
  let previousCount=-1;
  function update(combat:CombatState|null|undefined,spotting?:ConcealmentStatus|null){
    paintEdge(!!combat&&!combat.destroyed&&combat.fire.burning===true);
    active=read(combat,spotting);let changed=previousCount!==active.length;previousCount=active.length;
    for(let i=0;i<active.length;i++){
      const value=active[i]!,last=previous[i]!;
      if(last.id!==value.id||last.tone!==value.tone||last.progress!==value.progress||last.count!==value.count){
        changed=true;last.id=value.id;last.tone=value.tone;last.progress=value.progress;last.count=value.count;
      }
    }
    if(changed)paint();
  }
  return {root,update,
    /** Mount on the damage panel, whose width is the strip's room. */
    mount(panel:HTMLElement){panel.appendChild(root);room=panel;resize.observe(panel);},
    /** fire-visible-275: the sight's burning edge, on the HUD's own layer (full width, under the panels). */
    mountEdge(layer:HTMLElement){if(edge.parentNode!==layer)layer.prepend(edge);},
    clear(){previousCount=-1;active=read(null);paint();paintEdge(false);},dispose(){resize.disconnect();tooltip.dispose();root.remove();edge.remove();}};
}
