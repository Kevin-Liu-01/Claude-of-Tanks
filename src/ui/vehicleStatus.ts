import type { CombatState } from '../sim/damage.ts';
import { ensureStyle } from './dom.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import { createRichTooltip } from './richTooltip.ts';
import { createVehicleStatusReader, vehicleStatusCapacity, MAX_VEHICLE_STATUS_BOXES,
  type ConcealmentStatus, type VehicleStatus } from './vehicleStatusPolicy.ts';

const CSS = `
.cot-vehicle-status{position:absolute;left:0;bottom:calc(100% + var(--hud-status-lift,5px));display:flex;gap:4px;width:100%;pointer-events:auto;}
.cot-vehicle-status[hidden],.cot-status-box[hidden]{display:none!important}
.cot-status-box{position:relative;isolation:isolate;flex:0 0 34px;height:34px;padding:5px;display:grid;place-items:center;overflow:hidden;
 border:1px solid #64727e;background:linear-gradient(#152029f2,#080e14ed);color:#f36e69;font:800 11px/1 sans-serif;cursor:help;box-shadow:0 2px 5px #0006;}
.cot-status-box[data-tone=warning]{color:#ffbf60;border-color:#a77b3e}
.cot-status-box[data-tone=danger]{border-color:#b65551}
.cot-status-box[data-tone=positive]{color:#9ae8a6;border-color:#5b9667}
.cot-status-box svg{width:23px;height:23px;position:relative;z-index:1;filter:drop-shadow(0 1px 2px #000)}
.cot-status-fill{position:absolute;inset:0;background:currentColor;opacity:.25;transform-origin:bottom;transform:scaleY(var(--repair-fill,0));pointer-events:none;}
.cot-status-mark{position:absolute;bottom:0;right:1px;z-index:2;min-width:9px;text-align:center;font:900 10px/1 sans-serif;color:inherit;text-shadow:0 1px 2px #000}
.cot-status-box:focus-visible{outline:2px solid #ffe0a6;outline-offset:2px}
.cot-status-box:hover{background:#253542}
.cot-status-summary{white-space:pre-line}
.cot-touch-layout .cot-status-box{flex-basis:44px;height:44px;padding:9px}
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
  ensureStyle('cot-vehicle-status-style',CSS);
  const root=document.createElement('div');root.className='cot-vehicle-status';root.hidden=true;
  root.setAttribute('role','group');root.setAttribute('aria-label',t('hud.status.title'));
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
  const resize=new ResizeObserver(()=>{
    if(!root.getClientRects().length)tooltip.hide();
    capacity=vehicleStatusCapacity(root.clientWidth,document.body.classList.contains('cot-touch-layout'));paint();
  });
  resize.observe(root);
  // Cache primitive snapshots because the reader intentionally reuses its records.
  const previous=Array.from({length:18},()=>({id:'',tone:'',progress:null as number|null,count:0}));
  let previousCount=-1;
  function update(combat:CombatState|null|undefined,spotting?:ConcealmentStatus|null){
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
    clear(){previousCount=-1;active=read(null);paint();},dispose(){resize.disconnect();tooltip.dispose();root.remove();}};
}
