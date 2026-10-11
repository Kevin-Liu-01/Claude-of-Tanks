import { Vector3 } from 'three';
import type { SmokeSource } from './smokeReceipt.ts';
import { smokeCanisterPosition, SMOKE_CANISTER_RADIUS_M, type SmokeCanister, type SmokePoint, type SmokeWorld } from './smokeBallistics.ts';
/** Shared deterministic smoke envelope, used by spotting and presentation. `clip` (per canister, its bank's walls:
 * decimetres per SMOKE_CLIP_DIRS bearing, or 0 in the open) and `paths` (per canister, its bounces as the receipt's
 * groups, or 0) are the wire's; the authority's own screens carry the bounces in their canisters. */
export interface SmokeScreen {
  x:number; y:number; z:number; yaw:number; born:number; canisters?:readonly SmokeCanister[]; banks?:readonly number[];
  source?:SmokeSource; flightMs?:readonly number[]; clip?:readonly (readonly number[] | 0)[]; paths?:readonly (readonly number[] | 0)[];
}
export interface SmokeVolume { x:number; y:number; z:number; radius:number; height:number; density:number }
export type SmokeGround = (x:number,z:number) => number;
export const SMOKE_DURATION_S = 18;
export const smokeBankCount = (screen:SmokeScreen):number => screen.banks?.length ?? 5;
export const SMOKE_WIND_X = .18;
export const SMOKE_WIND_Z = .10;
const WIND = Math.hypot(SMOKE_WIND_X, SMOKE_WIND_Z), WIND_UX = SMOKE_WIND_X / WIND, WIND_UZ = SMOKE_WIND_Z / WIND;
const clamp = (v:number) => Math.max(0,Math.min(1,v));
const smooth = (v:number) => {const t=clamp(v);return t*t*(3-2*t);};

// ---- walls (2026-10-09, the owner: "smoke can go into buildings instead of bouncing off them") -----------------------
/** Bearings a bank's walls are read along at launch (from +x toward +z, evenly). */
export const SMOKE_CLIP_DIRS = 12;
/** How far they are read: the cloud's full radius (10.5 m) and the breeze's drift (3.7 m over 18 s) past it. */
const CLIP_REACH_M = 14.2;
/** Read at three heights over the rest; the middle distance counts, so the cloud spills over a low wall (two of the three
 * pass over it) and through an open doorway, while a house's wall, and a wall with a window in it, stop it. */
const CLIP_HEIGHTS_M = [.6, 1.6, 2.8] as const;
/** The cloud keeps this far off a wall, and reaches at least this far from its centre. */
const WALL_MARGIN_M = .3, REACH_MIN_M = .6;

/** At launch: how far a bank's cloud may spread from its canister's rest toward each SMOKE_CLIP_DIRS bearing before a
 * wall (whole decimetres, at least 1), or 0 when nothing stands within reach (the open field sends nothing). */
export function smokeClip(rest: SmokePoint, world: SmokeWorld): number[] | 0 {
  const out: number[] = [];
  const from = new Vector3(), dir = new Vector3();
  const read = [0, 0, 0];
  let walled = false;
  for (let k = 0; k < SMOKE_CLIP_DIRS; k++) {
    const a = k / SMOKE_CLIP_DIRS * Math.PI * 2;
    dir.x = Math.cos(a); dir.z = Math.sin(a);
    // (the low and the high read first: both free, and the middle distance is free whatever the middle reads)
    for (const h of [0, 2, 1]) {
      if (h === 1 && read[0]! >= CLIP_REACH_M && read[2]! >= CLIP_REACH_M) { read[1] = CLIP_REACH_M; break; }
      from.x = rest.x; from.y = rest.y + CLIP_HEIGHTS_M[h]!; from.z = rest.z;
      const hit = world.raycast(from, dir, CLIP_REACH_M);
      read[h] = hit && hit.kind !== 'terrain' && hit.dist < CLIP_REACH_M ? hit.dist : CLIP_REACH_M;
    }
    const free = read.slice().sort((p, q) => p - q)[1]!;
    const dm = Math.max(1, Math.round(free * 10));
    if (dm < Math.round(CLIP_REACH_M * 10)) walled = true;
    out.push(dm);
  }
  return walled ? out : 0;
}

const _rest = { x: 0, y: 0, z: 0 };
/** How far a bank's walls stand from its rest toward the bearing (unit ux, uz): the two nearest bearings' distances
 * interpolated as inverse distances (exact for a flat wall between them), in metres; Infinity in the open. */
function wallDistance(clip: readonly number[], ux: number, uz: number): number {
  let a = Math.atan2(uz, ux);
  if (a < 0) a += Math.PI * 2;
  const f = a / (Math.PI * 2) * SMOKE_CLIP_DIRS, k0 = Math.floor(f) % SMOKE_CLIP_DIRS, k1 = (k0 + 1) % SMOKE_CLIP_DIRS, w = f - Math.floor(f);
  // (the samples are decimetres: d = 0.1 / interpolated (1 / decimetres))
  return 0.1 / ((1 - w) / clip[k0]! + w / clip[k1]!);
}

/** The bank's rest when its walls hold it (the reach's origin), else null. */
function walledBank(screen: SmokeScreen, bank: number): readonly number[] | null {
  const index = screen.banks?.[bank + 2] ?? -1;
  const clip = screen.clip?.[index];
  const shot = screen.canisters?.[index];
  if (!clip || !shot) return null;
  smokeCanisterPosition(shot, shot[6], _rest);
  return clip;
}

/** How far a bank's volume (`volume`, from smokeVolume at the same time) reaches from its centre toward the bearing
 * (unit ux, uz): its radius, or less where a wall stood within it at launch (screen.clip), a margin short of the wall. */
export function smokeReach(screen: SmokeScreen, bank: number, volume: SmokeVolume, ux: number, uz: number): number {
  const clip = walledBank(screen, bank);
  if (!clip) return volume.radius;
  const wall = wallDistance(clip, ux, uz) - ((volume.x - _rest.x) * ux + (volume.z - _rest.z) * uz);
  return Math.max(REACH_MIN_M, Math.min(volume.radius, wall - WALL_MARGIN_M));
}

/** Hold a point (out.x, out.z) inside a bank's reach from its volume's centre: pulled back along its bearing where a wall
 * stands nearer. The presentation places its puffs through this, so no puff of a screen stands past a wall. */
export function smokeHoldInside(screen: SmokeScreen, bank: number, volume: SmokeVolume, out: { x: number; z: number }): void {
  if (!screen.clip) return;
  const dx = out.x - volume.x, dz = out.z - volume.z, r = Math.hypot(dx, dz);
  if (!(r > 1e-6)) return;
  const reach = smokeReach(screen, bank, volume, dx / r, dz / r);
  if (r <= reach) return;
  out.x = volume.x + dx / r * reach; out.z = volume.z + dz / r * reach;
}

/** How near the walls a bank read stand to a point (x, z) of its cloud (m, a margin short of them): the least of the
 * wall's distance along each bearing from there; Infinity for an open bank. The presentation holds a puff's size to it,
 * so a puff by a wall does not spread through the wall or over the roof (2026-10-10: the strips' high view). */
export function smokeWallRoom(screen: SmokeScreen, bank: number, x: number, z: number): number {
  const clip = walledBank(screen, bank);
  if (!clip) return Infinity;
  const dx = x - _rest.x, dz = z - _rest.z;
  let room = Infinity;
  for (let k = 0; k < SMOKE_CLIP_DIRS; k++) {
    if (clip[k]! >= Math.round(CLIP_REACH_M * 10)) continue;
    const a = k / SMOKE_CLIP_DIRS * Math.PI * 2;
    room = Math.min(room, clip[k]! / 10 - (dx * Math.cos(a) + dz * Math.sin(a)));
  }
  return Math.max(0, room - WALL_MARGIN_M);
}

/** The height a bank's cloud stands on at (x, z): the ground, or the surface its canister rests on when that stands over
 * the ground (a roof: the cloud stays on it, not in the rooms under it). */
export function smokeBankBase(screen: SmokeScreen, bank: number, x: number, z: number, ground: SmokeGround): number {
  const shot = screen.canisters?.[screen.banks?.[bank + 2] ?? -1];
  if (shot && shot.length > 7) {
    smokeCanisterPosition(shot, shot[6], _rest);
    const surface = _rest.y - SMOKE_CANISTER_RADIUS_M;
    if (surface - ground(_rest.x, _rest.z) > .5) return surface;
  }
  return ground(x, z);
}

/** Five overlapping, staggered lobes form a shallow arc. A small fixed breeze
 * advects the complete screen; age is match time, never render frame count. */
export function smokeVolume(screen:SmokeScreen,now:number,bank:number,out:SmokeVolume,ground?:SmokeGround):SmokeVolume{
  const age=now-screen.born;
  const shot=screen.canisters?.[screen.banks?.[bank+2] ?? -1];
  if(screen.canisters&&!shot){out.density=0;return out;}
  if(shot){
    smokeCanisterPosition(shot,shot[6],out);
    const landedAge=Math.max(0,age-shot[6]);
    // (a walled bank: the breeze carries it no nearer its downwind wall than its margin and a metre)
    const clip=screen.clip?.[screen.banks![bank+2]!];
    if(clip){
      const drift=Math.min(WIND*landedAge,Math.max(0,wallDistance(clip,WIND_UX,WIND_UZ)-WALL_MARGIN_M-1));
      out.x+=WIND_UX*drift;out.z+=WIND_UZ*drift;
    }else{out.x+=SMOKE_WIND_X*landedAge;out.z+=SMOKE_WIND_Z*landedAge;}
    out.y=(ground ? smokeBankBase(screen,bank,out.x,out.z,ground)+1.4 : out.y+1.32)+landedAge*.055;
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
/** Samples along a sight line's chord through a walled bank's full envelope, each held to the bank's reach. */
const WALLED_SAMPLES = 8;
/** Optical cover only: no shell collision or mobility effect. Segment against
 * each ellipsoid keeps overhead sight lines clear and follows the actual drift. A walled bank (screen.clip) blocks only
 * where the line passes inside its reach: smoke that stopped at a house's wall hides nothing in the house. */
export function smokeBlocks(screens:Iterable<SmokeScreen>,a:{x:number;y:number;z:number},b:{x:number;y:number;z:number},now:number,ground?:SmokeGround):boolean{
  for(const screen of screens){
    if(now<screen.born || now-screen.born>SMOKE_DURATION_S)continue;
    for(let bank=-2;bank<smokeBankCount(screen)-2;bank++){
      smokeVolume(screen,now,bank,volume,ground);
      if(volume.density<.22)continue;
      const ax=(a.x-volume.x)/volume.radius,ay=(a.y-volume.y)/volume.height,az=(a.z-volume.z)/volume.radius;
      const dx=(b.x-a.x)/volume.radius,dy=(b.y-a.y)/volume.height,dz=(b.z-a.z)/volume.radius;
      const length=dx*dx+dy*dy+dz*dz;
      if(!screen.clip?.[screen.banks?.[bank+2] ?? -1]){
        const t=clamp(-(ax*dx+ay*dy+az*dz)/(length||1));
        if((ax+t*dx)**2+(ay+t*dy)**2+(az+t*dz)**2<1)return true;
        continue;
      }
      // the chord through the full envelope, then samples along it held to the walls
      const bq=ax*dx+ay*dy+az*dz,cq=ax*ax+ay*ay+az*az-1,disc=bq*bq-length*cq;
      if(!(length>0)||disc<=0)continue;
      const root=Math.sqrt(disc),t0=Math.max(0,(-bq-root)/length),t1=Math.min(1,(-bq+root)/length);
      for(let s=0;s<=WALLED_SAMPLES&&t0<=t1;s++){
        const t=t0+(t1-t0)*s/WALLED_SAMPLES;
        const px=a.x+(b.x-a.x)*t-volume.x,pz=a.z+(b.z-a.z)*t-volume.z,eta=(a.y+(b.y-a.y)*t-volume.y)/volume.height;
        if(eta*eta>=1)continue;
        const rho=Math.hypot(px,pz);
        if(rho<1e-6||rho<smokeReach(screen,bank,volume,px/rho,pz/rho)*Math.sqrt(1-eta*eta))return true;
      }
    }
  }
  return false;
}

/** Per-vehicle HUD state stays small; the match-owned screen list carries flights once. */
export function smokeScreenSummary(screen:SmokeScreen):SmokeScreen {
  const {x,y,z,yaw,born}=screen;
  return {x,y,z,yaw,born};
}
