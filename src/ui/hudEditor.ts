import { createModal } from './modal.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import { HUD_PARTS, hudCenter, hudProfile, readHudPreferences, saveHudPreferences,
  type HudPartId, type HudProfile } from './hudPreferences.ts';

type Part = typeof HUD_PARTS[number];
const label=(id:string)=>t(`hudEditor.${id}`);
const PROFILES:HudProfile[]=['desktop','portrait','landscape'];
const SIZES:Record<HudProfile,[number,number]>={desktop:[1440,900],portrait:[390,844],landscape:[844,390]};
const BACKDROP='/media/battle-reels-v3/01_m1a2_sepv3_vs_t90m_verdant.webp';
function element<K extends keyof HTMLElementTagNameMap>(tag:K,cls:string,parent:HTMLElement){
  const node=document.createElement(tag);node.className=cls;parent.append(node);return node;
}
/** Snapshot only: no live game handlers or duplicate IDs enter the editor. */
function snapshot(source:HTMLElement):HTMLElement {
  const clone=source.cloneNode(true) as HTMLElement;
  const originals=[source,...source.querySelectorAll<HTMLElement>('*')];
  const copies=[clone,...clone.querySelectorAll<HTMLElement>('*')];
  originals.forEach((node,index)=>{
    const copy=copies[index]!;const style=getComputedStyle(node);
    copy.removeAttribute('id');copy.removeAttribute('data-hud-hidden');copy.removeAttribute('data-hud-positioned');
    copy.removeAttribute('autofocus');copy.setAttribute('tabindex','-1');
    for(const property of style)copy.style.setProperty(property,style.getPropertyValue(property));
    if(node instanceof HTMLCanvasElement&&copy instanceof HTMLCanvasElement){
      copy.width=node.width;copy.height=node.height;copy.getContext('2d')?.drawImage(node,0,0);
    }
  });
  clone.style.cssText+=';position:relative!important;inset:auto!important;transform:none!important;translate:none!important;margin:0!important;pointer-events:none!important;';
  clone.inert=true;return clone;
}
function sample(part:Part,parent:HTMLElement,w:number,h:number){
  const face=element('div',`hud-edit-sample sample-${part.id}`,parent);
  face.style.width=`${w}px`;face.style.height=`${h}px`;
  if(part.id==='score')face.innerHTML='<span style="color:#85dd8b">4</span><span>12:45</span><span style="color:#f1847c">3</span>';
  else if(part.id==='ammo')face.innerHTML='<span>1<br>APFSDS · 24</span><span>2<br>HEAT · 12</span><span>3<br>HE · 8</span><span>4 · ✚</span>';
  else if(part.id==='map')face.innerHTML='<span class="hud-edit-map-grid">△<br>◇&nbsp;&nbsp;&nbsp;&nbsp;△<br>&nbsp;&nbsp;▲&nbsp;&nbsp;&nbsp;◇</span>';
  else if(part.id==='health')face.innerHTML='<small>HP&nbsp;&nbsp; 2,750 / 2,750</small><i></i><span>▰</span>';
  else if(part.id==='drive')face.innerHTML='<strong>32</strong><small>km/h</small>';
  else {
    const icon=element('span','',face);icon.innerHTML=uiIconSVG('scope',18);
    element('strong','',face).textContent=label(part.id);
    if(part.id==='allies'||part.id==='enemies')for(let i=0;i<4;i++)element('small','',face).textContent=`▰  ${i%2?'Leopard 2A5':'M1A2 Abrams'}`;
  }
}

/** Lazy editor: one still scene, inert HUD snapshots, no second renderer/simulation. */
export function openHudEditor(trigger:HTMLElement):void {
  const draft=readHudPreferences();
  const activeProfile=hudProfile(innerWidth,innerHeight,document.body.classList.contains('cot-touch-layout'));
  let zoom=1;
  let profile=activeProfile,selected:HudPartId='score',scale=1,vw=0,vh=0;
  const nodes=new Map<HudPartId,HTMLButtonElement>();
  const dimensions=new Map<HudPartId,[number,number]>();
  const defaults=new Map<HudPartId,[number,number]>();
  let drag:{id:HudPartId;pointer:number;x:number;y:number;startX:number;startY:number}|null=null;
  const modal=createModal({title:label('title'),subtitle:label('help'),size:'wide',eyebrow:label('eyebrow'),onClose:()=>{
    observer.disconnect();queueMicrotask(()=>modal.dispose());
  }});
  modal.root.classList.add('cot-hud-editor');
  const toolbar=element('div','hud-edit-toolbar',modal.body);
  const tabs=element('div','hud-edit-profiles',toolbar);tabs.setAttribute('role','group');tabs.setAttribute('aria-label',label('profile'));
  const profileButtons=new Map<HudProfile,HTMLButtonElement>();
  for(const id of PROFILES){const b=element('button','',tabs);b.type='button';b.textContent=label(id);profileButtons.set(id,b);b.onclick=()=>{profile=id;render();};}
  const zoomButton=element('button','hud-edit-zoom',toolbar);zoomButton.type='button';zoomButton.textContent=label('zoom');
  zoomButton.onclick=()=>{zoom=zoom===1?2:1;zoomButton.textContent=label(zoom===1?'zoom':'fit');fit();};
  const reset=element('button','',toolbar);reset.type='button';reset.textContent=label('reset');reset.onclick=()=>{draft[profile]={};render();};
  const content=element('div','hud-edit-content',modal.body);
  const preview=element('div','hud-edit-preview',content);
  const viewport=element('div','hud-edit-viewport',preview);
  const stage=element('div','hud-edit-stage',viewport);
  stage.setAttribute('aria-label',label('preview'));
  stage.style.backgroundImage=`url('${BACKDROP}')`;
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
    for(const b of nudge.querySelectorAll('button'))b.disabled='anchored' in currentPart();
    tip.textContent=label('anchored' in currentPart()?'anchored':'nudge');
  }
  visibility.onclick=()=>{const old=draft[profile][selected];draft[profile][selected]={...old,hidden:!old?.hidden};render();};
  restore.onclick=()=>{delete draft[profile][selected];render();};
  function position(part:Part){
    const node=nodes.get(part.id);if(!node)return;
    const entry=draft[profile][part.id];
    const [x,y]=defaults.get(part.id)!,[w,h]=dimensions.get(part.id)!;
    const center=hudCenter(entry?.x??x,entry?.y??y,w,h,vw,vh);
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
    scale=Math.min(preview.clientWidth/vw,preview.clientHeight/vh)*zoom;
    preview.classList.toggle('zoomed',zoom>1);
    viewport.style.width=`${vw*scale}px`;viewport.style.height=`${vh*scale}px`;
    stage.style.transform=`scale(${scale})`;
  }
  function render(){
    drag=null;nodes.clear();dimensions.clear();defaults.clear();stage.replaceChildren();list.replaceChildren();
    [vw,vh]=profile===activeProfile?[innerWidth,innerHeight]:SIZES[profile];
    stage.style.width=`${vw}px`;stage.style.height=`${vh}px`;
    for(const [id,b] of profileButtons)b.setAttribute('aria-pressed',String(profile===id));
    for(const part of HUD_PARTS){
      if('touch' in part&&profile==='desktop')continue;
      const source=profile===activeProfile?document.querySelector<HTMLElement>(part.selector):null;
      const positioned=source?.hasAttribute('data-hud-positioned');
      if(positioned)source!.removeAttribute('data-hud-positioned');
      const rect=source?.getBoundingClientRect();
      if(positioned)source!.setAttribute('data-hud-positioned','');
      const usable=!('anchored' in part)&&!!source&&!!rect?.width&&!!rect.height&&getComputedStyle(source).visibility!=='hidden'&&getComputedStyle(source).opacity!=='0';
      const compact=profile!=='desktop';
      const w=Math.min(usable?rect!.width:part.w*(compact?.65:1),vw-12),h=Math.min(usable?rect!.height:part.h*(compact?.65:1),vh-12);
      dimensions.set(part.id,[w,h]);
      defaults.set(part.id,usable?[(rect!.left+rect!.width/2)/vw,(rect!.top+rect!.height/2)/vh]:[part.x,part.y]);
      const node=element('button','hud-edit-part',stage);node.type='button';node.dataset.part=part.id;
      node.style.width=`${w}px`;node.style.height=`${h}px`;node.setAttribute('aria-label',label(part.id));
      if(usable){const face=snapshot(source!);node.append(face);}
      else sample(part,node,w,h);
      const tag=element('span','hud-edit-tag',node);tag.textContent=label(part.id);
      nodes.set(part.id,node);bind(part,node);position(part);
      if('optional' in part&&!usable&&selected!==part.id)node.hidden=true;
      const row=element('button','',list);row.type='button';row.dataset.part=part.id;row.textContent=`${draft[profile][part.id]?.hidden?'○':'●'} ${label(part.id)}`;row.setAttribute('aria-pressed',String(part.id===selected));
      row.onclick=()=>{select(part.id);if('optional' in part)node.hidden=!!draft[profile][part.id]?.hidden;if(!node.hidden)node.focus();};
    }
    const aim=element('div','hud-edit-aim',stage);aim.innerHTML=`<svg width="42" height="42" viewBox="0 0 42 42" aria-hidden="true"><circle cx="21" cy="21" r="15" fill="none" stroke="#a7d487" stroke-dasharray="4 3"/><path d="M21 2v12m0 14v12M2 21h12m14 0h12" stroke="white" stroke-width="2"/></svg><span>240 m · ×2.0</span><small>APFSDS · 24</small>`;
    aim.setAttribute('aria-label',label('aim'));
    select(selected);fit();
  }
  const observer=new ResizeObserver(fit);observer.observe(preview);
  modal.open({trigger});render();
}
