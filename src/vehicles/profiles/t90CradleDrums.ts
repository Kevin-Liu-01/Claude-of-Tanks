// 2026-10-30 (lane t90-family-266; Main's ruling A, the critics' "rear hooks"): the T-90, T-90MS and T-90SM source
// builds carried their four rear drum cradles empty, and the bare U-webs read as hooks or tusks off the stern. Two
// 200 L drums (585 mm across, 880 mm long) now ride each pair of cradles, as on the service tanks.
import {KIT} from './kit.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const DRUM_R=.2925,DRUM_LEN=.88;

/** Two transverse drums, each centred on a pair of cradles, resting in the cradle bowl at (y, z). */
export function addT90CradleDrums(P:TankBuilderPort,y:number,z:number,pairs:readonly(readonly[number,number])[]):void{
  const {cylX}=KIT;
  for(const [a,b]of pairs){
    const x=(a+b)/2;
    P.addEquipment('hullDetail',cylX(DRUM_R,DRUM_LEN,32),x,y,z);
    // rolling hoops and the rolled end rims stand proud of the shell
    for(const dx of [-.29,.29])P.addEquipment('hullDetail',cylX(DRUM_R+.009,.026,32),x+dx,y,z);
    for(const dx of [-DRUM_LEN/2+.012,DRUM_LEN/2-.012])P.addEquipment('hullDetail',cylX(DRUM_R+.006,.022,32),x+dx,y,z);
    // a strap over each cradle holds the drum down; the filler bung sits on the outboard end
    for(const cx of [a,b])P.addEquipment('hullDark',cylX(DRUM_R+.014,.032,32),cx,y,z);
    P.addEquipment('hullDark',cylX(.032,.022,12),x+Math.sign(x)*(DRUM_LEN/2+.009),y+.16,z);
  }
}
