/** Match-owned launch receipts: position, velocity, then terrain-contact time. */
export type SmokeCanister = readonly [number, number, number, number, number, number, number];
export interface SmokePoint { x: number; y: number; z: number }
export const SMOKE_LAUNCH_SPEED_MPS = 14;
export const SMOKE_GRAVITY_MPS2 = 9.81;
export const SMOKE_CANISTER_RADIUS_M = .08;

/** Absolute match age makes delayed snapshots and any frame rate follow the same arc. */
export function smokeCanisterPosition(shot: SmokeCanister, age: number, out: SmokePoint): SmokePoint {
  const t = Math.max(0, Math.min(age, shot[6]));
  out.x = shot[0] + shot[3] * t;
  out.y = shot[1] + shot[4] * t - .5 * SMOKE_GRAVITY_MPS2 * t * t;
  out.z = shot[2] + shot[5] * t;
  return out;
}

/** Sample the trajectory only when fired; fixed subdivisions catch intervening slopes.
 * The receipt is then independent of client terrain detail and subsequent tank motion. */
export function createSmokeCanister(origin: SmokePoint, direction: SmokePoint, ground: (x:number,z:number)=>number): SmokeCanister {
  const speed = SMOKE_LAUNCH_SPEED_MPS / (Math.hypot(direction.x, direction.y, direction.z) || 1);
  const shot: [number, number, number, number, number, number, number] = [
    origin.x, origin.y, origin.z, direction.x*speed, direction.y*speed, direction.z*speed, 6,
  ];
  const point = { x:0, y:0, z:0 };
  let previous = 0;
  for (let t = 1/30; t <= 6; t += 1/30) {
    smokeCanisterPosition(shot,t,point);
    if (point.y <= ground(point.x,point.z)+SMOKE_CANISTER_RADIUS_M) {
      let low = previous, high = t;
      for (let i=0;i<12;i++) {
        const middle=(low+high)*.5;
        smokeCanisterPosition(shot,middle,point);
        if (point.y <= ground(point.x,point.z)+SMOKE_CANISTER_RADIUS_M) high=middle;
        else low=middle;
      }
      shot[6]=high;
      break;
    }
    previous=t;
  }
  return shot;
}

/** Adjacent tubes share a cloud, but each canister remains visible in flight. */
export function smokeCloudBanks(shots: readonly SmokeCanister[]): number[] {
  const banks: number[]=[];
  const point={x:0,y:0,z:0}, other={x:0,y:0,z:0};
  for(let i=0;i<shots.length;i++) {
    const shot=shots[i]!;
    smokeCanisterPosition(shot,shot[6],point);
    if(banks.some(index=>{
      const previous=shots[index]!;smokeCanisterPosition(previous,previous[6],other);
      return Math.hypot(point.x-other.x,point.y-other.y,point.z-other.z)<2.5 && Math.abs(shot[6]-previous[6])<.4;
    }))continue;
    banks.push(i);
  }
  return banks;
}
