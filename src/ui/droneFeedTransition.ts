/** Presentation-only signal break, triggered only after entering the FPV feed. */
export function createDroneFeedTransition(){
 let watching=false,until=0;
 return {step(fpv:boolean,active:boolean,visible:boolean,nowMs:number):number {
  if(!visible){watching=false;until=0;return 0;}
  if(fpv)watching=true;
  if(watching&&!active){watching=false;until=nowMs+620;}
  if(active)until=0;
  return Math.max(0,Math.min(1,(until-nowMs)/620));
 }};
}
