import { HUD_PARTS, hudCenter, hudProfile, readHudPreferences } from './hudPreferences.ts';
/** Event-driven overrides layered on the normal layout owner; no frame-loop work. */
export function installHudCustomization():()=>void {
  let preferences=readHudPreferences(),frame=0;
  const observed=new Set<HTMLElement>();
  const resize=new ResizeObserver(schedule);
  function refresh(){
    frame=0;
    const w=window.visualViewport?.width||innerWidth,h=window.visualViewport?.height||innerHeight;
    const profile=hudProfile(w,h,document.body.classList.contains('cot-touch-layout'));
    for(const part of HUD_PARTS)for(const node of document.querySelectorAll<HTMLElement>(part.selector)){
      if(node.closest('.cot-hud-editor'))continue;
      if(!observed.has(node)){observed.add(node);resize.observe(node);}
      const entry=preferences[profile][part.id];
      node.toggleAttribute('data-hud-hidden',entry?.hidden===true);
      const positioned=entry?.x!==undefined&&entry.y!==undefined;
      node.toggleAttribute('data-hud-positioned',positioned);
      if(positioned){
        const [x,y]=hudCenter(entry.x!,entry.y!,node.offsetWidth,node.offsetHeight,w,h);
        node.style.setProperty('--hud-user-x',`${x}px`);node.style.setProperty('--hud-user-y',`${y}px`);
      }
    }
    for(const node of observed)if(!node.isConnected){resize.unobserve(node);observed.delete(node);}
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(refresh);}
  const selector=HUD_PARTS.map(part=>part.selector).join(',');
  const changes=new MutationObserver(records=>{
    if(records.some(record=>[...record.addedNodes].some(node=>node instanceof Element&&(node.matches(selector)||node.querySelector(selector)))))schedule();
  });
  changes.observe(document.body,{childList:true,subtree:true});
  const reload=()=>{preferences=readHudPreferences();schedule();window.dispatchEvent(new Event('cot-hud-relayout'));};
  window.addEventListener('cot:hud-preferences',reload);
  window.addEventListener('storage',reload);
  window.addEventListener('resize',schedule);
  window.addEventListener('cot:layoutchange',schedule);
  window.visualViewport?.addEventListener('resize',schedule);
  schedule();
  return ()=>{changes.disconnect();resize.disconnect();cancelAnimationFrame(frame);window.removeEventListener('cot:hud-preferences',reload);window.removeEventListener('storage',reload);window.removeEventListener('resize',schedule);window.removeEventListener('cot:layoutchange',schedule);window.visualViewport?.removeEventListener('resize',schedule);};
}
