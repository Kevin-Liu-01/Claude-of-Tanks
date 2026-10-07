/** Versioned player layout. Default entries never override responsive HUD placement. */
export const HUD_PARTS = [
  { id:'score', selector:'.cot-top', x:.5, y:.06, w:360, h:70 },
  { id:'objective', selector:'.cot-mode-status', x:.5, y:.125, w:290, h:32 },
  { id:'allies', selector:'.cot-ear.l', x:.12, y:.23, w:230, h:200 },
  { id:'enemies', selector:'.cot-ear.r', x:.88, y:.23, w:230, h:200 },
  { id:'health', selector:'.cot-dp', x:.08, y:.85, w:170, h:160 },
  { id:'drive', selector:'.cot-drive', x:.21, y:.9, w:90, h:90 },
  { id:'ammo', selector:'.cot-shells', x:.5, y:.93, w:420, h:66 },
  { id:'systems', selector:'.cot-vehicle-controls', x:.5, y:.85, w:360, h:32 },
  { id:'map', selector:'.cot-minimap', x:.9, y:.83, w:210, h:210 },
  { id:'damage', selector:'.cot-si-toasthost', x:.13, y:.48, w:260, h:70 },
  { id:'killsLeft', selector:'.cot-kill-lane.l', x:.13, y:.58, w:260, h:45 },
  { id:'killsRight', selector:'.cot-kill-lane.r', x:.87, y:.48, w:260, h:45 },
  { id:'report', selector:'.cot-si-cardhost', x:.87, y:.62, w:260, h:120 },
  { id:'detected', selector:'.cot-sixth', x:.5, y:.2, w:240, h:48 },
  { id:'alerts', selector:'.cot-alert', x:.5, y:.29, w:240, h:38 },
  { id:'chat', selector:'.cot-room-chat', x:.14, y:.68, w:280, h:66 },
  { id:'network', selector:'.cot-net', x:.9, y:.025, w:170, h:24 },
  { id:'medals', selector:'.cot-medal-toasts', x:.5, y:.38, w:280, h:64 },
  { id:'aircraft', selector:'.flight-console', x:.5, y:.86, w:420, h:120, optional:true },
  { id:'joystick', selector:'.cot-touch .joy', x:.12, y:.8, w:96, h:96, touch:true },
  { id:'fire', selector:'.cot-touch .fire:not(.alt)', x:.9, y:.8, w:70, h:70, touch:true },
  { id:'scopeButton', selector:'.cot-touch .scope', x:.88, y:.6, w:54, h:54, touch:true },
  { id:'autoAim', selector:'.cot-touch .autoaim', x:.76, y:.8, w:54, h:54, touch:true },
  { id:'labels', selector:'.cot-hpbars,.cot-tgt', x:.7, y:.42, w:200, h:36, anchored:true },
  { id:'damageNumbers', selector:'.cot-dmglayer', x:.7, y:.5, w:70, h:36, anchored:true },
] as const;
export type HudPartId = typeof HUD_PARTS[number]['id'];
export type HudProfile = 'desktop' | 'portrait' | 'landscape';
export type HudPlacement = { hidden:boolean; x?:number; y?:number };
export type HudLayout = Partial<Record<HudPartId,HudPlacement>>;
export type HudPreferences = Record<HudProfile,HudLayout>;
export const HUD_LAYOUT_KEY = 'cot.hud-layout.v1';
export function hudProfile(width:number,height:number,touch:boolean):HudProfile {
  return touch ? width>height?'landscape':'portrait' : 'desktop';
}
export function normalizeHudPreferences(value:unknown):HudPreferences {
  const result:HudPreferences={desktop:{},portrait:{},landscape:{}};
  if(!value||typeof value!=='object')return result;
  for(const profile of ['desktop','portrait','landscape'] as const){
    const layout=(value as Record<string,unknown>)[profile];
    if(!layout||typeof layout!=='object')continue;
    for(const part of HUD_PARTS){
      const entry=(layout as Record<string,unknown>)[part.id];
      if(!entry||typeof entry!=='object')continue;
      const {hidden,x,y}=entry as Record<string,unknown>;
      const placement:HudPlacement={hidden:hidden===true};
      if(!('anchored' in part)&&typeof x==='number'&&Number.isFinite(x)&&typeof y==='number'&&Number.isFinite(y)){
        placement.x=Math.max(0,Math.min(1,x));placement.y=Math.max(0,Math.min(1,y));
      }
      result[profile][part.id]=placement;
    }
  }
  return result;
}
export function readHudPreferences():HudPreferences {
  try{return normalizeHudPreferences(JSON.parse(localStorage.getItem(HUD_LAYOUT_KEY)||'null'));}
  catch{return normalizeHudPreferences(null);}
}
export function saveHudPreferences(value:HudPreferences):boolean {
  try{localStorage.setItem(HUD_LAYOUT_KEY,JSON.stringify(normalizeHudPreferences(value)));}
  catch{return false;}
  window.dispatchEvent(new Event('cot:hud-preferences'));return true;
}
/** Clamp the complete visible box inside the viewport, including after rotation. */
export function hudCenter(x:number,y:number,w:number,h:number,vw:number,vh:number):[number,number] {
  const halfW=Math.min(w/2+6,vw/2),halfH=Math.min(h/2+6,vh/2);
  return [Math.max(halfW,Math.min(vw-halfW,x*vw)),Math.max(halfH,Math.min(vh-halfH,y*vh))];
}
