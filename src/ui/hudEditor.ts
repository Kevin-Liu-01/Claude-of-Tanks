import { loadHudPreview, type HudPreviewScene } from './hudEditorScene.ts';
import { createModal } from './modal.ts';
import { t } from './i18n.ts';
import { uiIconSVG, type UiIconId } from './uiIcons.ts';
import { HUD_PARTS, hudCenter, hudProfile, readHudPreferences, saveHudPreferences,
  type HudPartId, type HudProfile } from './hudPreferences.ts';

type Part = typeof HUD_PARTS[number];
const PART_ICONS:Record<HudPartId,UiIconId>={score:'clock',objective:'modeZones',allies:'team',enemies:'team',health:'shield',drive:'speed',ammo:'shell',systems:'settings',map:'map',damage:'damage',killsLeft:'skull',killsRight:'skull',report:'penetration',detected:'lightbulb',alerts:'info',chat:'radio',network:'performance',medals:'star',aircraft:'modeAc130',joystick:'controller',fire:'fireGun',scopeButton:'scope',autoAim:'autoAim',labels:'battleBots',damageNumbers:'damage'};
const label=(id:string)=>t(`hudEditor.${id}`);
const PROFILES:HudProfile[]=['desktop','portrait','landscape'];
const SIZES:Record<HudProfile,[number,number]>={desktop:[1440,900],portrait:[390,844],landscape:[844,390]};
const BACKDROP='/media/home/p2_46_verdant_meadow_duel.webp';
function element<K extends keyof HTMLElementTagNameMap>(tag:K,cls:string,parent:HTMLElement){
  const node=document.createElement(tag);node.className=cls;parent.append(node);return node;
}
/** Lazy editor: one still scene, inert HUD snapshots, no second renderer/simulation. */
export function openHudEditor(trigger:HTMLElement):void {
  const draft=readHudPreferences();
  const activeProfile=hudProfile(innerWidth,innerHeight,document.body.classList.contains('cot-touch-layout'));
  let scene:HudPreviewScene|null=null;
  let request:AbortController|null=null, closed=false;
  let zoom=1;
  let profile=activeProfile,selected:HudPartId='score',scale=1,vw=0,vh=0;
  const nodes=new Map<HudPartId,HTMLButtonElement>();
  const dimensions=new Map<HudPartId,[number,number]>();
  const defaults=new Map<HudPartId,[number,number]>();
  let drag:{id:HudPartId;pointer:number;x:number;y:number;startX:number;startY:number}|null=null;
  const modal=createModal({title:label('title'),subtitle:label('help'),size:'wide',eyebrow:label('eyebrow'),onClose:()=>{
    closed=true;request?.abort();scene?.frame.remove();observer.disconnect();queueMicrotask(()=>modal.dispose());
  }});
  modal.root.classList.add('cot-hud-editor');
  const toolbar=element('div','hud-edit-toolbar',modal.body);
  const tabs=element('div','hud-edit-profiles',toolbar);tabs.setAttribute('role','group');tabs.setAttribute('aria-label',label('profile'));
  const profileButtons=new Map<HudProfile,HTMLButtonElement>();
  for(const id of PROFILES){const b=element('button','',tabs);b.type='button';b.textContent=label(id);profileButtons.set(id,b);b.onclick=()=>{if(profile===id&&scene)return;profile=id;void load();};}
  const zoomButton=element('button','hud-edit-zoom',toolbar);zoomButton.type='button';zoomButton.textContent=label('zoom');
  zoomButton.onclick=()=>{zoom=zoom===1?2:1;zoomButton.textContent=label(zoom===1?'zoom':'fit');fit();};
  const reset=element('button','',toolbar);reset.type='button';reset.textContent=label('reset');reset.onclick=()=>{draft[profile]={};render();};
  const content=element('div','hud-edit-content',modal.body);
  const preview=element('div','hud-edit-preview',content);
  const viewport=element('div','hud-edit-viewport',preview);
  const stage=element('div','hud-edit-stage',viewport);
  stage.setAttribute('aria-label',label('preview'));
  stage.style.backgroundImage=`url('${BACKDROP}')`;
  const backdrop=new Image();backdrop.src=BACKDROP;
  const backdropReady=backdrop.decode();void backdropReady.catch(()=>{});
  const loading=element('p','hud-edit-loading',preview);loading.setAttribute('role','status');loading.textContent=label('loading');
  const inspector=element('aside','hud-edit-inspector',content);
  const inspectorTitle=element('h3','',inspector);
  const visibility=element('button','',inspector);visibility.type='button';
  const restore=element('button','',inspector);restore.type='button';restore.textContent=label('restore');
  const nudge=element('div','hud-edit-nudge',inspector);
  for(const [key,dx,dy] of [['left',-10,0],['up',0,-10],['down',0,10],['right',10,0]] as const){
    const b=element('button','',nudge);b.type='button';b.textContent={left:'←',up:'↑',down:'↓',right:'→'}[key];b.setAttribute('aria-label',label(key));
    b.onclick=()=>{const node=nodes.get(selected);if(node)move(selected,(parseFloat(node.style.left)+dx)/vw,(parseFloat(node.style.top)+dy)/vh);};
  }
  const tip=element('p','',inspector);
  const list=element('div','hud-edit-list',inspector);list.setAttribute('role','group');list.setAttribute('aria-label',label('elements'));
  const status=element('p','hud-edit-status',modal.footer);status.setAttribute('role','status');
  status.textContent=label('sample');
  const cancel=element('button','hud-edit-cancel',modal.footer);cancel.type='button';cancel.textContent=label('cancel');cancel.onclick=()=>modal.close();
  const save=element('button','hud-edit-save',modal.footer);save.type='button';save.textContent=label('save');save.onclick=()=>{
    if(saveHudPreferences(draft))modal.close();else status.textContent=label('saveError');
  };
  function currentPart(){return HUD_PARTS.find(part=>part.id===selected)!;}
  function select(id:HudPartId){
    selected=id;
    for(const [key,node] of nodes)node.setAttribute('aria-pressed',String(key===id));
    for(const row of list.querySelectorAll<HTMLButtonElement>('button[data-part]'))row.setAttribute('aria-pressed',String(row.dataset.part===id));
    inspectorTitle.textContent=label(id);
    visibility.textContent=label(draft[profile][id]?.hidden?'show':'hide');
    visibility.setAttribute('aria-pressed',String(!draft[profile][id]?.hidden));
    const absent=!scene?.parts.has(id);
    for(const b of nudge.querySelectorAll('button'))b.disabled=absent||'anchored' in currentPart();
    restore.disabled=absent;
    tip.textContent=label(absent?'unavailable':'anchored' in currentPart()?'anchored':'nudge');
  }
  visibility.onclick=()=>{const old=draft[profile][selected];draft[profile][selected]={...old,hidden:!old?.hidden};render();};
  restore.onclick=()=>{delete draft[profile][selected];render();};
  function position(part:Part){
    const node=nodes.get(part.id);if(!node)return;
    const entry=draft[profile][part.id];
    const [x,y]=defaults.get(part.id)!,[w,h]=dimensions.get(part.id)!;
    const custom=entry?.x!==undefined&&entry.y!==undefined;
    const center=custom?hudCenter(entry.x!,entry.y!,w,h,vw,vh):[x*vw,y*vh];
    const source=scene?.parts.get(part.id)?.element;
    if(source){
      source.toggleAttribute('data-hud-hidden',!!entry?.hidden);
      source.toggleAttribute('data-hud-positioned',custom);
      source.style.setProperty('--hud-user-x',`${center[0]}px`);
      source.style.setProperty('--hud-user-y',`${center[1]}px`);
    }
    node.style.left=`${center[0]}px`;node.style.top=`${center[1]}px`;
    node.hidden=!!entry?.hidden;
  }
  function move(id:HudPartId,x:number,y:number){
    const part=HUD_PARTS.find(p=>p.id===id)!;
    if('anchored' in part)return;
    const [w,h]=dimensions.get(id)!,[cx,cy]=hudCenter(x,y,w,h,vw,vh);
    draft[profile][id]={hidden:false,x:cx/vw,y:cy/vh};position(part);
  }
  function bind(part:Part,node:HTMLButtonElement){
    node.onclick=()=>select(part.id);
    node.onpointerdown=event=>{
      if(event.button!==0)return;select(part.id);if('anchored' in part)return;
      event.preventDefault();node.setPointerCapture(event.pointerId);
      drag={id:part.id,pointer:event.pointerId,x:event.clientX,y:event.clientY,startX:parseFloat(node.style.left),startY:parseFloat(node.style.top)};
    };
    node.onpointermove=event=>{if(!drag||drag.pointer!==event.pointerId)return;
      move(drag.id,(drag.startX+(event.clientX-drag.x)/scale)/vw,(drag.startY+(event.clientY-drag.y)/scale)/vh);
    };
    node.onpointerup=node.onpointercancel=()=>{drag=null;};
    node.onkeydown=event=>{
      const step=event.shiftKey?10:1;
      const delta:Record<string,[number,number]>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
      if(delta[event.key]){event.preventDefault();select(part.id);const [dx,dy]=delta[event.key]!;move(part.id,(parseFloat(node.style.left)+dx)/vw,(parseFloat(node.style.top)+dy)/vh);}
      if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();draft[profile][part.id]={...draft[profile][part.id],hidden:true};render();visibility.focus();}
    };
  }
  function fit(){
    if(!vw||!vh)return;
    scale=Math.min(preview.clientWidth/vw,preview.clientHeight/vh)*zoom;
    preview.classList.toggle('zoomed',zoom>1);
    viewport.style.width=`${vw*scale}px`;viewport.style.height=`${vh*scale}px`;
    stage.style.transform=`scale(${scale})`;
  }
  function addPart(part:Part){
    if('touch' in part&&profile==='desktop')return;
    const source=scene?.parts.get(part.id);
    source?.element.toggleAttribute('data-hud-hidden',!!draft[profile][part.id]?.hidden);
    if(source&&!('anchored' in part)){
      const {width:w,height:h,x,y}=source;
      dimensions.set(part.id,[w,h]);defaults.set(part.id,[x,y]);
      const node=element('button','hud-edit-part',stage);node.type='button';node.dataset.part=part.id;
      node.style.width=`${w}px`;node.style.height=`${h}px`;node.setAttribute('aria-label',label(part.id));
      const tag=element('span','hud-edit-tag',node);tag.textContent=label(part.id);
      nodes.set(part.id,node);bind(part,node);position(part);
    }
    const row=element('button','',list);row.type='button';row.dataset.part=part.id;
    const icon=element('span','hud-edit-list-icon',row);icon.innerHTML=uiIconSVG(PART_ICONS[part.id],18);
    element('span','hud-edit-list-label',row).textContent=label(part.id);
    const state=element('span','hud-edit-list-state',row);state.textContent=draft[profile][part.id]?.hidden?'−':'+';
    state.setAttribute('aria-hidden','true');row.dataset.hidden=String(!!draft[profile][part.id]?.hidden);
    row.setAttribute('aria-pressed',String(part.id===selected));
    row.onclick=()=>{select(part.id);const node=nodes.get(part.id);if(node&&!node.hidden)node.focus();
      else if(!source&&['aircraft','medals','alerts','damage','killsRight'].includes(part.id))void load();};
  }
  function render(){
    drag=null;nodes.clear();dimensions.clear();defaults.clear();
    stage.querySelectorAll('.hud-edit-part').forEach(node=>node.remove());list.replaceChildren();
    for(const part of HUD_PARTS)addPart(part);
    select(selected);fit();
  }
  async function load(){
    request?.abort();scene?.frame.remove();scene=null;delete modal.root.dataset.previewReady;
    stage.querySelectorAll('.hud-edit-part').forEach(node=>node.remove());list.replaceChildren();
    request=new AbortController();const pending=request;
    [vw,vh]=profile===activeProfile?[innerWidth,innerHeight]:SIZES[profile];
    stage.style.width=`${vw}px`;stage.style.height=`${vh}px`;
    for(const [id,b] of profileButtons)b.setAttribute('aria-pressed',String(profile===id));
    loading.hidden=false;loading.textContent=label('loading');save.disabled=true;inspector.inert=true;fit();
    try{
      const [result]=await Promise.all([loadHudPreview(stage,profile,vw,vh,pending.signal,selected),backdropReady]);
      if(closed||pending.signal.aborted){result.frame.remove();return;}
      scene=result;loading.hidden=true;save.disabled=false;inspector.inert=false;
      result.frame.dataset.ready='true';modal.root.dataset.previewReady='true';render();
    }catch(error){
      if(!closed&&!pending.signal.aborted){loading.textContent=label('loadError');status.textContent=label('loadError');}
    }
  }
  const observer=new ResizeObserver(fit);observer.observe(preview);
  modal.open({trigger});void load();
}
