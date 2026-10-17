import { Vector3 } from 'three';
import type { SmokeSource } from './smokeReceipt.ts';
import { smokeCanisterPosition, SMOKE_CANISTER_RADIUS_M, type SmokeCanister, type SmokePoint, type SmokeWorld } from './smokeBallistics.ts';
import { sceneWindFor } from '../world/sceneWind.ts';
/** Shared deterministic smoke envelope, used by spotting and presentation. `clip` (per canister, its bank's walls:
 * decimetres per SMOKE_CLIP_DIRS bearing, or 0 in the open) and `paths` (per canister, its bounces as the receipt's
 * groups, or 0) are the wire's; the authority's own screens carry the bounces in their canisters. */
export interface SmokeScreen {
  x:number; y:number; z:number; yaw:number; born:number; canisters?:readonly SmokeCanister[]; banks?:readonly number[];
  source?:SmokeSource; flightMs?:readonly number[]; clip?:readonly (readonly number[] | 0)[]; paths?:readonly (readonly number[] | 0)[];
  /** (FX lane 2026-10-17) the drift the authority launched it on (m/s, world xz): its map's surface wind at
   *  SMOKE_DRIFT_SHARE (smokeWindForMap); absent, the legacy breeze (SMOKE_WIND_X/Z). It crosses the wire with the screen,
   *  so a client's screen drifts exactly as the authority's sight block does. */
  wind?:readonly [number, number];
}
export interface SmokeVolume { x:number; y:number; z:number; radius:number; height:number; density:number }
export type SmokeGround = (x:number,z:number) => number;
export const SMOKE_DURATION_S = 18;
export const smokeBankCount = (screen:SmokeScreen):number => screen.banks?.length ?? 5;
/** The legacy breeze (m/s): a screen launched without its map's wind (a receipt, an older record) drifts on it. */
export const SMOKE_WIND_X = .18;
export const SMOKE_WIND_Z = .10;
/**
 * (FX lane 2026-10-17, the owner's backlog: "smoke-screen sim on the map wind") a screen drifts along its map's surface
 * wind (world/sceneWind.ts, the one wind the trees, the grass, the columns and the clouds share) at this share of its
 * speed: Verdant's 3.6 m/s carries a screen ~0.54 m/s, ~10 m over its 18 s, Tarkhan Steppe's 5.4 m/s ~15 m. A screen
 * blown at the full wind would leave the cover it was fired to make within seconds; this keeps it a screen that leans
 * and creeps the way every other smoke on the map goes.
 */
export const SMOKE_DRIFT_SHARE = .15;
/** A map's smoke drift (m/s, world xz), rounded to the wire's 1e-4 so the authority and every client hold the same. */
export function smokeWindForMap(mapId: string | null | undefined): readonly [number, number] {
  const w = sceneWindFor(mapId);
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return [round(w.dirX * w.speed * SMOKE_DRIFT_SHARE), round(w.dirZ * w.speed * SMOKE_DRIFT_SHARE)];
}
/** A screen's drift (its own, else the legacy breeze). */
function windX(screen: SmokeScreen): number { return screen.wind ? screen.wind[0] : SMOKE_WIND_X; }
function windZ(screen: SmokeScreen): number { return screen.wind ? screen.wind[1] : SMOKE_WIND_Z; }
const clamp = (v:number) => Math.max(0,Math.min(1,v));
const smooth = (v:number) => {const t=clamp(v);return t*t*(3-2*t);};

// ---- walls (2026-10-09, the owner: "smoke can go into buildings instead of bouncing off them") -----------------------
/** Bearings a bank's walls are read along at launch (from +x toward +z, evenly). */
export const SMOKE_CLIP_DIRS = 12;
/** How far they are read: the cloud's full radius (10.5 m) and the breeze's drift over its 18 s past it (the legacy
 *  breeze's 3.7 m: 14.2 m; a screen on its map's wind reads as far as that wind carries it, smokeClipReach). */
const CLIP_REACH_M = 14.2;
const CLOUD_RADIUS_M = 10.5;
/** How far a screen's walls are read at launch for its drift (m/s, world xz; none: the legacy breeze's 14.2 m), in
 *  whole decimetres so the authority and the wire agree. */
export function smokeClipReach(wind?: readonly [number, number] | null): number {
  if (!wind) return CLIP_REACH_M;
  return Math.max(CLIP_REACH_M, Math.round((CLOUD_RADIUS_M + Math.hypot(wind[0], wind[1]) * SMOKE_DURATION_S) * 10) / 10);
}
/** Read at three heights over the rest; the middle distance counts, so the cloud spills over a low wall (two of the three
 * pass over it) and through an open doorway, while a house's wall, and a wall with a window in it, stop it. */
const CLIP_HEIGHTS_M = [.6, 1.6, 2.8] as const;
/** The cloud keeps this far off a wall, and reaches at least this far from its centre. */
const WALL_MARGIN_M = .3, REACH_MIN_M = .6;

/** At launch: how far a bank's cloud may spread from its canister's rest toward each SMOKE_CLIP_DIRS bearing before a
 * wall (whole decimetres, at least 1), or 0 when nothing stands within reach (the open field sends nothing). */
export function smokeClip(rest: SmokePoint, world: SmokeWorld, reach = CLIP_REACH_M): number[] | 0 {
  const out: number[] = [];
  const from = new Vector3(), dir = new Vector3();
  const read = [0, 0, 0];
  let walled = false;
  for (let k = 0; k < SMOKE_CLIP_DIRS; k++) {
    const a = k / SMOKE_CLIP_DIRS * Math.PI * 2;
    dir.x = Math.cos(a); dir.z = Math.sin(a);
    // (the low and the high read first: both free, and the middle distance is free whatever the middle reads)
    for (const h of [0, 2, 1]) {
      if (h === 1 && read[0]! >= reach && read[2]! >= reach) { read[1] = reach; break; }
      from.x = rest.x; from.y = rest.y + CLIP_HEIGHTS_M[h]!; from.z = rest.z;
      const hit = world.raycast(from, dir, reach);
      read[h] = hit && hit.kind !== 'terrain' && hit.dist < reach ? hit.dist : reach;
    }
    const free = read.slice().sort((p, q) => p - q)[1]!;
    const dm = Math.max(1, Math.round(free * 10));
    if (dm < Math.round(reach * 10)) walled = true;
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
  const open = Math.round(smokeClipReach(screen.wind) * 10);
  for (let k = 0; k < SMOKE_CLIP_DIRS; k++) {
    if (clip[k]! >= open) continue;
    const a = k / SMOKE_CLIP_DIRS * Math.PI * 2;
    room = Math.min(room, clip[k]! / 10 - (dx * Math.cos(a) + dz * Math.sin(a)));
  }
  return Math.max(0, room - WALL_MARGIN_M);
}

/** The height a bank's cloud stands on at (x, z): the ground, or the surface its canister rests on when that stands over
 * the ground (a roof: the cloud stays on it, not in the rooms under it), whether it bounced there or landed straight on
 * it (2026-10-11: a canister lobbed onto a roof without a bounce carries only its launch's seven numbers, and its cloud
 * and sight block stood in the rooms under the roof). */
export function smokeBankBase(screen: SmokeScreen, bank: number, x: number, z: number, ground: SmokeGround): number {
  const shot = screen.canisters?.[screen.banks?.[bank + 2] ?? -1];
  if (shot && shot.length >= 7) {
    smokeCanisterPosition(shot, shot[6], _rest);
    const surface = _rest.y - SMOKE_CANISTER_RADIUS_M;
    if (surface - ground(_rest.x, _rest.z) > .5) return surface;
  }
  return ground(x, z);
}

/** What the bank's height needs once its footprint is placed (bankFootprint → bankHeight; module scratch, one bank at a time). */
const footing = { shot: false, restY: 0, rise: 0 };

/** A bank's footprint at `now` — x, z, radius, height and density — everything but its standing height over the ground,
 * which costs a ground lookup (two for a canister bank). False when the bank holds no smoke (a canister bank whose
 * canister is missing). bankHeight completes out.y with the same arithmetic smokeVolume always used. */
function bankFootprint(screen:SmokeScreen,now:number,bank:number,out:SmokeVolume):boolean{
  const age=now-screen.born;
  const shot=screen.canisters?.[screen.banks?.[bank+2] ?? -1];
  if(screen.canisters&&!shot){out.density=0;return false;}
  if(shot){
    smokeCanisterPosition(shot,shot[6],out);
    const landedAge=Math.max(0,age-shot[6]);
    // (a walled bank: the breeze carries it no nearer its downwind wall than its margin and a metre)
    const clip=screen.clip?.[screen.banks![bank+2]!];
    const wx=windX(screen),wz=windZ(screen);
    if(clip){
      const wind=Math.hypot(wx,wz);
      if(wind>1e-9){
        const ux=wx/wind,uz=wz/wind;
        const drift=Math.min(wind*landedAge,Math.max(0,wallDistance(clip,ux,uz)-WALL_MARGIN_M-1));
        out.x+=ux*drift;out.z+=uz*drift;
      }
    }else{out.x+=wx*landedAge;out.z+=wz*landedAge;}
    footing.shot=true;footing.restY=out.y;footing.rise=landedAge*.055;
    const growth=smooth(landedAge/2.2);
    out.radius=1.2+growth*9.3;
    out.height=.8+growth*3.2;
    out.density=growth*(1-smooth((age-13.5)/4.5));
    return true;
  }
  const growth=smooth((age-.85-Math.abs(bank)*.06)/2.2);
  const fade=1-smooth((age-13.5)/4.5);
  const side=bank*3.6+Math.sin(bank*4.1+screen.born)*.45;
  const fore=-bank*bank*.45;
  out.x=screen.x+Math.cos(screen.yaw)*side+Math.sin(screen.yaw)*fore+windX(screen)*Math.max(0,age-1);
  out.z=screen.z-Math.sin(screen.yaw)*side+Math.cos(screen.yaw)*fore+windZ(screen)*Math.max(0,age-1);
  footing.shot=false;footing.restY=screen.y;footing.rise=Math.max(0,age-1)*.055;
  out.radius=1.2+growth*(4.4+Math.sin(bank*2.7)*.35);
  out.height=.8+growth*3.2;
  out.density=growth*fade;
  return true;
}

/** The footprint's standing height (out.y), after bankFootprint of the same bank. */
function bankHeight(screen:SmokeScreen,bank:number,out:SmokeVolume,ground?:SmokeGround):void{
  if(footing.shot)out.y=(ground ? smokeBankBase(screen,bank,out.x,out.z,ground)+1.4 : footing.restY+1.32)+footing.rise;
  else out.y=(ground ? ground(out.x,out.z)+1.4 : footing.restY)+footing.rise;
}

/** Five overlapping, staggered lobes form a shallow arc. A small fixed breeze
 * advects the complete screen; age is match time, never render frame count. */
export function smokeVolume(screen:SmokeScreen,now:number,bank:number,out:SmokeVolume,ground?:SmokeGround):SmokeVolume{
  if(!bankFootprint(screen,now,bank,out))return out;
  bankHeight(screen,bank,out,ground);
  return out;
}
const volume:SmokeVolume={x:0,y:0,z:0,radius:0,height:0,density:0};
/** The least horizontal distance from (px, pz) to the segment a→b. */
function segmentPointDistanceXZ(a:{x:number;z:number},b:{x:number;z:number},px:number,pz:number):number{
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length>0?clamp(((px-a.x)*dx+(pz-a.z)*dz)/length):0;
  return Math.hypot(a.x+t*dx-px,a.z+t*dz-pz);
}
/** Samples along a sight line's chord through a walled bank's full envelope, each held to the bank's reach. */
const WALLED_SAMPLES = 8;
/** Optical cover only: no shell collision or mobility effect. Segment against
 * each ellipsoid keeps overhead sight lines clear and follows the actual drift. A walled bank (screen.clip) blocks only
 * where the line passes inside its reach: smoke that stopped at a house's wall hides nothing in the house. */
export function smokeBlocks(screens:Iterable<SmokeScreen>,a:{x:number;y:number;z:number},b:{x:number;y:number;z:number},now:number,ground?:SmokeGround):boolean{
  for(const screen of screens){
    if(now<screen.born || now-screen.born>SMOKE_DURATION_S)continue;
    for(let bank=-2;bank<smokeBankCount(screen)-2;bank++){
      // (2026-10-13, the MP stream: the host's tick) the footprint first, no ground lookup: a bank too thin to block, or
      // one whose radius the line's horizontal path never comes within, cannot block it — the ellipsoid test below needs
      // the horizontal term under 1, and a walled bank's reach never exceeds its radius. Only a bank the line passes
      // over pays its ground lookups, which were most of a 28-bot authority tick (roof guns test every target).
      if(!bankFootprint(screen,now,bank,volume)||volume.density<.22)continue;
      if(segmentPointDistanceXZ(a,b,volume.x,volume.z)>=volume.radius*(1+1e-9)+1e-9)continue;
      bankHeight(screen,bank,volume,ground);
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

/** A screen's drift for the presentation (its own, else the legacy breeze), written into `out`. */
export function smokeScreenWind(screen: SmokeScreen | null | undefined, out: { x: number; z: number }): { x: number; z: number } {
  out.x = screen ? windX(screen) : SMOKE_WIND_X; out.z = screen ? windZ(screen) : SMOKE_WIND_Z;
  return out;
}
