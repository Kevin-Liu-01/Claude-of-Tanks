/** Local sensor preference; never changes authoritative spotting or flight state. */
export const AERIAL_VIEWS = ['infrared','thermal','night','daylight'] as const;
export type AerialVision = typeof AERIAL_VIEWS[number];
const STORAGE_KEY='cot.aerialVision';
let selected:AerialVision='infrared',loaded=false;
export function getAerialVision():AerialVision {
  if(!loaded){loaded=true;try{const saved=globalThis.localStorage?.getItem(STORAGE_KEY);if(AERIAL_VIEWS.includes(saved as AerialVision))selected=saved as AerialVision;}catch{ /* Storage is optional in private browsing. */ }}
  return selected;
}
export function setAerialVision(value:AerialVision):void {
  if(!AERIAL_VIEWS.includes(value))return;
  selected=value;loaded=true;try{globalThis.localStorage?.setItem(STORAGE_KEY,value);}catch{ /* Keep the session preference. */ }
}
export function nextAerialVision():AerialVision {return AERIAL_VIEWS[(AERIAL_VIEWS.indexOf(getAerialVision())+1)%AERIAL_VIEWS.length]!;}
export function aerialVisionCode(value:AerialVision):number {return value==='daylight'?0:value==='infrared'?1:value==='thermal'?2:3;}
