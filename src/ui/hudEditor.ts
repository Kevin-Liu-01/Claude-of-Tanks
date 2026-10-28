import { loadHudPreview, type HudPreviewScene } from './hudEditorScene.ts';
import { createModal } from './modal.ts';
import { t } from './i18n.ts';
import { uiIconSVG } from './uiIcons.ts';
import type { IconId } from './icons/icon.ts';
import { segmented, setRoving, wireRoving } from './components/components.ts';
import { createPicker } from './components/picker.ts';
import { pickerText } from './pickerText.ts';
import { layoutViewportSize } from './responsiveLayout.ts';
import { HUD_PARTS, hudCenter, hudProfile, readHudPreferences, saveHudPreferences,
  type HudPartId, type HudProfile } from './hudPreferences.ts';

type Part = typeof HUD_PARTS[number];
const PART_ICONS:Record<HudPartId,IconId>={score:'clock',objective:'modeZones',allies:'team',enemies:'team',health:'shield',drive:'speed',ammo:'shell',systems:'settings',map:'map',damage:'damage',killsLeft:'skull',killsRight:'skull',report:'penetration',detected:'lightbulb',alerts:'info',chat:'radio',network:'performance',medals:'star',aircraft:'modeAc130',joystick:'controller',fire:'fireGun',scopeButton:'scope',autoAim:'autoAim',labels:'battleBots',damageNumbers:'damage'};
const label=(id:string)=>t(`hudEditor.${id}`);
const PROFILES:HudProfile[]=['desktop','portrait','landscape'];
const SIZES:Record<HudProfile,[number,number]>={desktop:[1440,900],portrait:[390,844],landscape:[844,390]};
const BACKDROP='/media/site50-r14/stills/s19-roof-tiles.webp';
const SECONDARY='cot-c-btn cot-c-btn--36 cot-c-btn--secondary';
function element<K extends keyof HTMLElementTagNameMap>(tag:K,cls:string,parent:HTMLElement){
  const node=document.createElement(tag);node.className=cls;parent.append(node);return node;
}
/** Lazy editor: one still scene, inert HUD snapshots, no second renderer/simulation. */
export function openHudEditor(trigger:HTMLElement):void {
  const draft=readHudPreferences();
  const stored=JSON.stringify(draft);
  // the viewport the runtime HUD customisation places parts in (hudCustomization.ts), so both pick one profile
  const liveSize=():[number,number]=>{const {width,height}=layoutViewportSize(window);return [width,height];};
  const activeProfile=hudProfile(...liveSize(),document.body.classList.contains('cot-touch-layout'));
  let scene:HudPreviewScene|null=null;
  let request:AbortController|null=null, closed=false;
  let zoom=1;
  let profile=activeProfile,selected:HudPartId='score',scale=1,vw=0,vh=0;
  const nodes=new Map<HudPartId,HTMLButtonElement>();
  const dimensions=new Map<HudPartId,[number,number]>();
  const defaults=new Map<HudPartId,[number,number]>();
  let drag:{id:HudPartId;pointer:number;x:number;y:number;startX:number;startY:number}|null=null;
  const modal=createModal({surface:'hud-editor',title:label('title'),size:'wide',unsaved:()=>JSON.stringify(draft)!==stored,onClose:()=>{
    closed=true;request?.abort();scene?.frame.remove();observer.disconnect();queueMicrotask(()=>modal.dispose());
  }});
  modal.root.classList.add('cot-hud-editor');
  const toolbar=element('div','hud-edit-toolbar',modal.body);
  // the screen layouts on the kit's segmented control; the editor's buttons are the kit's
  toolbar.insertAdjacentHTML('beforeend',segmented({label:label('profile'),className:'hud-edit-profiles',value:profile,
    options:PROFILES.map(id=>({value:id,label:label(id)}))}));
  const tabs=toolbar.querySelector<HTMLElement>('.hud-edit-profiles')!;
  wireRoving(tabs,id=>{if(profile===id&&scene)return;profile=id as HudProfile;void load();});
  const zoomButton=element('button',`hud-edit-zoom ${SECONDARY}`,toolbar);zoomButton.type='button';zoomButton.textContent=label('zoom');
  zoomButton.onclick=()=>{zoom=zoom===1?2:1;zoomButton.textContent=label(zoom===1?'zoom':'fit');fit();};
  const reset=element('button',SECONDARY,toolbar);reset.type='button';reset.textContent=label('reset');reset.onclick=()=>{draft[profile]={};render();};
  const content=element('div','hud-edit-content',modal.body);
  const preview=element('div','hud-edit-preview',content);
  const viewport=element('div','hud-edit-viewport',preview);
  const stage=element('div','hud-edit-stage',viewport);
  // the selection's frame, drawn over the scaled preview at the kit's own size: an accent band between two dark lines (it
  // holds over sky or smoke), inside the panel's box so the preview's edge never cuts it. The inspector's heading names
  // it, so the preview carries no tag over the HUD
  const mark=element('div','hud-edit-mark',viewport);mark.hidden=true;mark.setAttribute('aria-hidden','true');
  stage.setAttribute('aria-label',label('preview'));
  stage.style.backgroundImage=`url('${BACKDROP}')`;
  const backdrop=new Image();backdrop.src=BACKDROP;
  const backdropReady=backdrop.decode();void backdropReady.catch(()=>{});
  const loading=element('p','hud-edit-loading',preview);loading.setAttribute('role','status');loading.textContent=label('loading');
  const inspector=element('aside','hud-edit-inspector',content);
  const inspectorTitle=element('h3','',inspector);
  const visibility=element('button',SECONDARY,inspector);visibility.type='button';
  const restore=element('button',SECONDARY,inspector);restore.type='button';restore.textContent=label('restore');
  const nudge=element('div','hud-edit-nudge',inspector);
  for(const [key,dx,dy] of [['left',-10,0],['up',0,-10],['down',0,10],['right',10,0]] as const){
    // the sprite's chevrons; up is the down chevron turned (hudEditor.css)
    const b=element('button',`nudge-${key} ${SECONDARY} cot-c-btn--icon`,nudge);b.type='button';b.innerHTML=uiIconSVG(({left:'chevronLeft',up:'chevronDown',down:'chevronDown',right:'chevronRight'} as const)[key],18);b.setAttribute('aria-label',label(key));
    b.onclick=()=>{const node=nodes.get(selected);if(node)move(selected,(parseFloat(node.style.left)+dx)/vw,(parseFloat(node.style.top)+dy)/vh);};
  }
  const tip=element('p','',inspector);
  // the parts on the kit picker's list: a part under the pointer or the focus is outlined on the preview, a press selects it
  const list=element('div','hud-edit-list',inspector);
  const parts=createPicker(list,{id:'hud-editor-part',label:label('elements'),items:[],value:selected,layout:'list',text:pickerText(),
    onPreview:item=>{for(const [key,node] of nodes)node.classList.toggle('is-previewed',key===item?.id);},
    onChoose:item=>{
      const id=item.id as HudPartId;select(id);const node=nodes.get(id);if(node&&!node.hidden)node.focus();
      else if(!scene?.parts.has(id)&&['aircraft','medals','alerts','damage','killsRight'].includes(id))void load();
    }});
  const status=element('p','hud-edit-status',modal.footer);status.setAttribute('role','status');
  // the status speaks only of a failed load or save
  const cancel=element('button',`hud-edit-cancel ${SECONDARY}`,modal.footer);cancel.type='button';cancel.textContent=label('cancel');cancel.onclick=()=>modal.close();
  const save=element('button','hud-edit-save cot-c-btn cot-c-btn--36 cot-c-btn--primary',modal.footer);save.type='button';save.textContent=label('save');save.onclick=()=>{
    if(saveHudPreferences(draft))modal.close();else status.textContent=label('saveError');
  };
  function currentPart(){return HUD_PARTS.find(part=>part.id===selected)!;}
  function select(id:HudPartId){
    selected=id;
    for(const [key,node] of nodes)node.setAttribute('aria-pressed',String(key===id));
    parts.setValue(id);
    inspectorTitle.textContent=label(id);
    visibility.textContent=label(draft[profile][id]?.hidden?'show':'hide');
    visibility.setAttribute('aria-pressed',String(!draft[profile][id]?.hidden));
    const absent=!scene?.parts.has(id);
    // a hidden or anchored panel is not moved: its arrows wait (in every screen layout alike)
    for(const b of nudge.querySelectorAll('button'))b.disabled=absent||!!draft[profile][id]?.hidden||'anchored' in currentPart();
    restore.disabled=absent;
    tip.textContent=label(absent?'unavailable':'anchored' in currentPart()?'anchored':'nudge');
    placeMark();
  }
  function placeMark(){
    const node=nodes.get(selected);
    if(!node||node.hidden){mark.hidden=true;return;}
    const box=node.getBoundingClientRect(),frame=viewport.getBoundingClientRect();
    const left=Math.max(0,box.left-frame.left),top=Math.max(0,box.top-frame.top);
    const right=Math.min(frame.width,box.right-frame.left),bottom=Math.min(frame.height,box.bottom-frame.top);
    mark.hidden=false;
    Object.assign(mark.style,{left:`${left}px`,top:`${top}px`,width:`${Math.max(0,right-left)}px`,height:`${Math.max(0,bottom-top)}px`});
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
    if(part.id===selected)placeMark();
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
    placeMark();
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
      nodes.set(part.id,node);bind(part,node);position(part);
    }
  }
  function render(){
    drag=null;nodes.clear();dimensions.clear();defaults.clear();
    stage.querySelectorAll('.hud-edit-part').forEach(node=>node.remove());
    for(const part of HUD_PARTS)addPart(part);
    // a hidden part says so on its row (its row stays, so the part can be shown again)
    parts.setItems(HUD_PARTS.filter(part=>!('touch' in part&&profile==='desktop')).map(part=>({id:part.id,name:label(part.id),
      glyph:PART_ICONS[part.id],facts:draft[profile][part.id]?.hidden?[label('hidden')]:undefined})),selected);
    select(selected);fit();
  }
  async function load(){
    request?.abort();scene?.frame.remove();scene=null;delete modal.root.dataset.previewReady;
    stage.querySelectorAll('.hud-edit-part').forEach(node=>node.remove());
    request=new AbortController();const pending=request;
    [vw,vh]=profile===activeProfile?liveSize():SIZES[profile];
    stage.style.width=`${vw}px`;stage.style.height=`${vh}px`;
    setRoving(tabs,profile);
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
