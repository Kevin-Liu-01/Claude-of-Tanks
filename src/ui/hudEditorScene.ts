import { getLocale } from './i18n.ts';
import { HUD_PARTS, type HudPartId, type HudProfile } from './hudPreferences.ts';

export interface HudPreviewPart { element: HTMLElement; x: number; y: number; width: number; height: number }
export interface HudPreviewScene { frame: HTMLIFrameElement; parts: Map<HudPartId,HudPreviewPart> }

/** The iframe isolates production HUD listeners and viewport rules from the live game. */
export async function loadHudPreview(parent: HTMLElement, profile: HudProfile, width: number, height: number, signal: AbortSignal, focus: HudPartId): Promise<HudPreviewScene> {
  const frame = document.createElement('iframe');
  frame.className='hud-edit-scene'; frame.title='Battle preview'; frame.tabIndex=-1; frame.setAttribute('aria-hidden','true');
  frame.style.width=`${width}px`; frame.style.height=`${height}px`;
  const ready = new Promise<void>((resolve,reject)=>{
    const finish=(error?: Error) => { clearTimeout(timer); window.removeEventListener('message',message); signal.removeEventListener('abort',abort); error?reject(error):resolve(); };
    const abort=()=>finish(new DOMException('Preview closed','AbortError'));
    const message=(event: MessageEvent)=>{
      if(event.source!==frame.contentWindow || event.origin!==location.origin)return;
      if(event.data?.type==='cot:hud-preview-ready')finish();
      if(event.data?.type==='cot:hud-preview-error')finish(new Error('Preview unavailable'));
    };
    const timer=setTimeout(()=>finish(new Error('Preview timed out')),30000);
    window.addEventListener('message',message); signal.addEventListener('abort',abort,{once:true});
  });
  frame.src=`${import.meta.env.DEV?'/site':''}/hud-preview.html?profile=${profile}&locale=${getLocale()}&focus=${focus}`;
  parent.prepend(frame);
  const remove=()=>frame.remove();signal.addEventListener('abort',remove,{once:true});
  try { await ready; } catch(error) { frame.remove(); throw error; }
  const doc=frame.contentDocument!; const parts=new Map<HudPartId,HudPreviewPart>();
  for(const part of HUD_PARTS){
    const element=doc.querySelector<HTMLElement>(part.selector); if(!element)continue;
    const rect=element.getBoundingClientRect(); const style=frame.contentWindow!.getComputedStyle(element);
    if(!rect.width || !rect.height || style.visibility==='hidden' || style.opacity==='0')continue;
    parts.set(part.id,{element,x:(rect.left+rect.width/2)/width,y:(rect.top+rect.height/2)/height,width:rect.width,height:rect.height});
  }
  return {frame,parts};
}
