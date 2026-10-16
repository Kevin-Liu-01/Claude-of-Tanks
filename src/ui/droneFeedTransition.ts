/** Presentation-only signal break, triggered only after entering the FPV feed. A recall the pilot made (`recalled`: the
 * authority accepted it and the airframe is flying home, owner 2026-10-14) closes the feed cleanly: no static. */
export function createDroneFeedTransition(){
 let watching=false,until=0;
 return {step(fpv:boolean,active:boolean,visible:boolean,nowMs:number,recalled=false):number {
  if(!visible){watching=false;until=0;return 0;}
  if(fpv)watching=true;
  if(watching&&!active){watching=false;until=recalled?0:nowMs+620;}
  if(active)until=0;
  return Math.max(0,Math.min(1,(until-nowMs)/620));
 }};
}
