import type { SmokeSource } from './smokeReceipt.ts';
import { smokeCanisterPosition, type SmokeCanister } from './smokeBallistics.ts';
/** Shared deterministic smoke envelope, used by spotting and presentation. */
export interface SmokeScreen { x:number; y:number; z:number; yaw:number; born:number; canisters?:readonly SmokeCanister[]; banks?:readonly number[]; source?:SmokeSource; flightMs?:readonly number[] }
export interface SmokeVolume { x:number; y:number; z:number; radius:number; height:number; density:number }
export type SmokeGround = (x:number,z:number) => number;
export const SMOKE_DURATION_S = 18;
export const smokeBankCount = (screen:SmokeScreen):number => screen.banks?.length ?? 5;
export const SMOKE_WIND_X = .18;
export const SMOKE_WIND_Z = .10;
const clamp = (v:number) => Math.max(0,Math.min(1,v));
const smooth = (v:number) => {const t=clamp(v);return t*t*(3-2*t);};
/** Five overlapping, staggered lobes form a shallow arc. A small fixed breeze
 * advects the complete screen; age is match time, never render frame count. */
export function smokeVolume(screen:SmokeScreen,now:number,bank:number,out:SmokeVolume,ground?:SmokeGround):SmokeVolume{
  const age=now-screen.born;
  const shot=screen.canisters?.[screen.banks?.[bank+2] ?? -1];
  if(screen.canisters&&!shot){out.density=0;return out;}
  if(shot){
    smokeCanisterPosition(shot,shot[6],out);
    const landedAge=Math.max(0,age-shot[6]);
    out.x+=SMOKE_WIND_X*landedAge;out.z+=SMOKE_WIND_Z*landedAge;
    out.y=(ground ? ground(out.x,out.z)+1.4 : out.y+1.32)+landedAge*.055;
    const growth=smooth(landedAge/2.2);
    out.radius=1.2+growth*9.3;
    out.height=.8+growth*3.2;
    out.density=growth*(1-smooth((age-13.5)/4.5));
    return out;
  }
  const growth=smooth((age-.85-Math.abs(bank)*.06)/2.2);
  const fade=1-smooth((age-13.5)/4.5);
  const side=bank*3.6+Math.sin(bank*4.1+screen.born)*.45;
  const fore=-bank*bank*.45;
  out.x=screen.x+Math.cos(screen.yaw)*side+Math.sin(screen.yaw)*fore+SMOKE_WIND_X*Math.max(0,age-1);
  out.z=screen.z-Math.sin(screen.yaw)*side+Math.cos(screen.yaw)*fore+SMOKE_WIND_Z*Math.max(0,age-1);
  out.y=(ground ? ground(out.x,out.z)+1.4 : screen.y)+Math.max(0,age-1)*.055;
  out.radius=1.2+growth*(4.4+Math.sin(bank*2.7)*.35);
  out.height=.8+growth*3.2;
  out.density=growth*fade;
  return out;
}
const volume:SmokeVolume={x:0,y:0,z:0,radius:0,height:0,density:0};
/** Optical cover only: no shell collision or mobility effect. Segment against
 * each ellipsoid keeps overhead sight lines clear and follows the actual drift. */
export function smokeBlocks(screens:Iterable<SmokeScreen>,a:{x:number;y:number;z:number},b:{x:number;y:number;z:number},now:number,ground?:SmokeGround):boolean{
  for(const screen of screens){
    if(now<screen.born || now-screen.born>SMOKE_DURATION_S)continue;
    for(let bank=-2;bank<smokeBankCount(screen)-2;bank++){
      smokeVolume(screen,now,bank,volume,ground);
      if(volume.density<.22)continue;
      const ax=(a.x-volume.x)/volume.radius,ay=(a.y-volume.y)/volume.height,az=(a.z-volume.z)/volume.radius;
      const dx=(b.x-a.x)/volume.radius,dy=(b.y-a.y)/volume.height,dz=(b.z-a.z)/volume.radius;
      const length=dx*dx+dy*dy+dz*dz;
      const t=clamp(-(ax*dx+ay*dy+az*dz)/(length||1));
      if((ax+t*dx)**2+(ay+t*dy)**2+(az+t*dz)**2<1)return true;
    }
  }
  return false;
}

/** Per-vehicle HUD state stays small; the match-owned screen list carries flights once. */
export function smokeScreenSummary(screen:SmokeScreen):SmokeScreen {
  const {x,y,z,yaw,born}=screen;
  return {x,y,z,yaw,born};
}
