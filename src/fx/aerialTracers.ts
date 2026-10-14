/** Presentation only. Weapon reload groups survive local and authority shell specs. */
export interface AerialTracerProfile {
  core: number; glow: number; width: number; maxWidth: number;
  exposureS: number; maxLength: number; brightness: number; headScale: number;
}
const cannon: AerialTracerProfile = {core:0xfff5d9,glow:0xffac48,width:.22,maxWidth:.8,exposureS:.016,maxLength:24,brightness:1.65,headScale:1.7};
const howitzer: AerialTracerProfile = {core:0xffeed0,glow:0xff8135,width:.36,maxWidth:1.2,exposureS:.032,maxLength:32,brightness:1.85,headScale:2.1};
const missile: AerialTracerProfile = {core:0xfff5dc,glow:0xffc16c,width:.3,maxWidth:1,exposureS:.035,maxLength:18,brightness:1.7,headScale:2.3};
export function aerialTracerProfile(reloadGroup?: string): AerialTracerProfile | null {
  switch(reloadGroup){
    case 'gunship-cannon':return cannon;
    case 'gunship-howitzer':return howitzer;
    case 'gunship-missile':return missile;
    default:return null;
  }
}
/** (EF.09, MASTER 18: the gunship's bolts "look the same at noon and at midnight") the night term, from the scene's dark
 *  level (projectileTracers' darkLevel: 0 day .. 1 night), as the ballistic tracers take it: by day a bolt is a thinner,
 *  dimmer streak against the bright sky; at night its corona widens, it burns brighter and the eye's longer exposure
 *  smears it farther back. */
export const AERIAL_DAY_GAIN=.8, AERIAL_NIGHT_GAIN=1.25, AERIAL_NIGHT_WIDTH=.3, AERIAL_NIGHT_EXPOSURE=.6;
export function aerialTracerBrightness(profile:AerialTracerProfile,dark=0):number {
  const d=Math.min(1,Math.max(0,dark));
  return profile.brightness*(AERIAL_DAY_GAIN+(AERIAL_NIGHT_GAIN-AERIAL_DAY_GAIN)*d);
}
/** About two pixels of corona at 720p; obey zoom and cap world size at long range (wider at night). */
export function aerialTracerWidth(profile:AerialTracerProfile,distanceM:number,projectionY:number,dark=0):number {
  const k=1+AERIAL_NIGHT_WIDTH*Math.min(1,Math.max(0,dark));
  return Math.min(profile.maxWidth*k,Math.max(profile.width,distanceM*.004/Math.max(.1,projectionY))*k);
}
/** Never draw the wake farther back than the distance this projectile has flown (a longer exposure at night). */
export function aerialTracerLength(profile:AerialTracerProfile,speed:number,distanceM:number,dark=0):number {
  const exposure=profile.exposureS*(1+AERIAL_NIGHT_EXPOSURE*Math.min(1,Math.max(0,dark)));
  return Math.max(0,Math.min(distanceM,profile.maxLength,Math.max(2,speed*exposure)));
}
