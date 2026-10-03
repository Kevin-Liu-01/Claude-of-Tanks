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
/** About two pixels of corona at 720p; obey zoom and cap world size at long range. */
export function aerialTracerWidth(profile:AerialTracerProfile,distanceM:number,projectionY:number):number {
  return Math.min(profile.maxWidth,Math.max(profile.width,distanceM*.004/Math.max(.1,projectionY)));
}
/** Never draw the wake farther back than the distance this projectile has flown. */
export function aerialTracerLength(profile:AerialTracerProfile,speed:number,distanceM:number):number {
  return Math.max(0,Math.min(distanceM,profile.maxLength,Math.max(2,speed*profile.exposureS)));
}
