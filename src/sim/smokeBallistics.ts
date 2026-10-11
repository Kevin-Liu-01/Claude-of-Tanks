import { Vector3 } from 'three';

/**
 * Match-owned launch receipts. The first seven numbers are the launch (position, velocity) and the time the canister
 * comes to rest (s after launch). A canister that struck a wall carries one more group of SMOKE_SEGMENT numbers per
 * bounce: the time it left the wall, where it left it and its velocity after (2026-10-09, the owner: "smoke can go into
 * buildings instead of bouncing off them. make smoke canisters ... respect hitboxes").
 */
export type SmokeCanister = readonly [number, number, number, number, number, number, number, ...number[]];
export interface SmokePoint { x: number; y: number; z: number }
export const SMOKE_LAUNCH_SPEED_MPS = 14;
export const SMOKE_GRAVITY_MPS2 = 9.81;
export const SMOKE_CANISTER_RADIUS_M = .08;
/** The numbers of one bounce after the launch's seven: time, position, velocity. */
export const SMOKE_SEGMENT = 7;
/** A ray hit in the world a canister flies through (the authority's own query: the solo world's raycast, the match's
 * collision shards through headlessCollisionWorld): distance, the struck surface's normal, 'terrain' for the ground. */
export interface SmokeWorldHit { dist: number; normal?: SmokePoint | null; kind?: string }
export interface SmokeWorld { raycast(origin: SmokePoint, direction: SmokePoint, maxDist: number): SmokeWorldHit | null }
/** Into a wall a steel canister keeps this share of its speed out of it, and this share of its speed along it. */
export const SMOKE_RESTITUTION = .35;
export const SMOKE_FRICTION = .7;
/** A surface facing up at least this much stops a canister where it strikes it (a roof, a rock's top, a ledge). */
export const SMOKE_REST_NORMAL_Y = .6;
/** After this many bounces the next strike stops it (a canister in a corner settles). */
export const SMOKE_MAX_BOUNCES = 3;
const FLIGHT_MAX_S = 6, STEP_S = 1 / 30;
/** The world is read along chords of this many steps (0.1 s), and at the ground contact. */
const WORLD_EVERY = 3;
/** A bounce leaves this far off the wall along its normal, so the next ray starts in the open. */
const BOUNCE_LIFT_M = .02;
const round3 = (v: number) => Math.round(v * 1000) / 1000;

/** The offset of the flight segment a receipt flies at time `t`: 0 for the launch, else its bounce's group. */
function segmentAt(shot: SmokeCanister, t: number): number {
  let at = 0;
  for (let o = 7; o + 6 < shot.length; o += SMOKE_SEGMENT) {
    if (shot[o]! <= t) at = o; else break;
  }
  return at;
}

/** Absolute match age makes delayed snapshots and any frame rate follow the same arc. */
export function smokeCanisterPosition(shot: SmokeCanister, age: number, out: SmokePoint): SmokePoint {
  const t = Math.max(0, Math.min(age, shot[6]));
  const o = shot.length > 7 ? segmentAt(shot, t) : 0;
  if (o === 0) {
    out.x = shot[0] + shot[3] * t;
    out.y = shot[1] + shot[4] * t - .5 * SMOKE_GRAVITY_MPS2 * t * t;
    out.z = shot[2] + shot[5] * t;
    return out;
  }
  const dt = t - shot[o]!;
  out.x = shot[o + 1]! + shot[o + 4]! * dt;
  out.y = shot[o + 2]! + shot[o + 5]! * dt - .5 * SMOKE_GRAVITY_MPS2 * dt * dt;
  out.z = shot[o + 3]! + shot[o + 6]! * dt;
  return out;
}

/** The canister's velocity at `age` (its flight's own segment): what the presentation turns the grenade along. */
export function smokeCanisterVelocity(shot: SmokeCanister, age: number, out: SmokePoint): SmokePoint {
  const t = Math.max(0, Math.min(age, shot[6]));
  const o = shot.length > 7 ? segmentAt(shot, t) : 0;
  const t0 = o ? shot[o]! : 0, v = o ? o + 4 : 3;
  out.x = shot[v]!;
  out.y = shot[v + 1]! - SMOKE_GRAVITY_MPS2 * (t - t0);
  out.z = shot[v + 2]!;
  return out;
}

const _rayFrom = new Vector3(), _rayDir = new Vector3();
const _wall = { f: 0, nx: 0, ny: 0, nz: 0 };
/** The first wall the chord a -> b strikes (a canister's radius out from it): the share of the chord flown before it and
 * the wall's normal, turned against the flight; null in the open. The ground is the terrain test's (it rests there). */
function wallStrike(world: SmokeWorld, a: SmokePoint, b: SmokePoint): typeof _wall | null {
  _rayDir.set(b.x - a.x, b.y - a.y, b.z - a.z);
  const length = _rayDir.length();
  if (!(length > 1e-9)) return null;
  _rayDir.multiplyScalar(1 / length);
  _rayFrom.set(a.x, a.y, a.z);
  const reach = length + SMOKE_CANISTER_RADIUS_M;
  const hit = world.raycast(_rayFrom, _rayDir, reach);
  if (!hit || hit.kind === 'terrain' || !(hit.dist <= reach)) return null;
  let nx = hit.normal?.x ?? 0, ny = hit.normal?.y ?? 0, nz = hit.normal?.z ?? 0;
  const n = Math.hypot(nx, ny, nz);
  if (n > 1e-9) { nx /= n; ny /= n; nz /= n; } else { nx = -_rayDir.x; ny = -_rayDir.y; nz = -_rayDir.z; }
  if (nx * _rayDir.x + ny * _rayDir.y + nz * _rayDir.z > 0) { nx = -nx; ny = -ny; nz = -nz; }
  _wall.f = Math.max(0, Math.min(1, (hit.dist - SMOKE_CANISTER_RADIUS_M) / length));
  _wall.nx = nx; _wall.ny = ny; _wall.nz = nz;
  return _wall;
}

/** Sample the trajectory only when fired; fixed subdivisions catch intervening slopes. The receipt is then independent
 * of client terrain detail and subsequent tank motion. Given the world (the authority's collision), every step's chord
 * is also cast against it: a canister bounces off a wall (SMOKE_RESTITUTION into it, SMOKE_FRICTION along it) and comes
 * to rest on the first surface that faces up (a roof, a rock's top) or on the ground. */
export function createSmokeCanister(
  origin: SmokePoint, direction: SmokePoint, ground: (x: number, z: number) => number, world?: SmokeWorld | null,
): SmokeCanister {
  const speed = SMOKE_LAUNCH_SPEED_MPS / (Math.hypot(direction.x, direction.y, direction.z) || 1);
  const shot: number[] = [origin.x, origin.y, origin.z, direction.x * speed, direction.y * speed, direction.z * speed, FLIGHT_MAX_S];
  const receipt = shot as unknown as SmokeCanister;
  const point = { x: 0, y: 0, z: 0 };
  const velocity = { x: 0, y: 0, z: 0 };
  // the world is read along chords of WORLD_EVERY steps (an arc sags under 1.2 cm from its chord over 0.1 s), and at the
  // ground contact; the ground is read every step as before
  const chordFrom = { x: origin.x, y: origin.y, z: origin.z };
  let chordT = 0, steps = 0;
  let previous = 0, bounces = 0;
  for (let t = STEP_S; t <= FLIGHT_MAX_S; t += STEP_S) {
    smokeCanisterPosition(receipt, t, point);
    const grounded = point.y <= ground(point.x, point.z) + SMOKE_CANISTER_RADIUS_M;
    if (world && (grounded || ++steps >= WORLD_EVERY || t + STEP_S > FLIGHT_MAX_S)) {
      const wall = wallStrike(world, chordFrom, point);
      const strike = wall ? chordT + (t - chordT) * wall.f : 0;
      // (a wall struck under the ground's line is the ground's: the canister met the ground first)
      if (wall && (smokeCanisterPosition(receipt, strike, velocity), velocity.y > ground(velocity.x, velocity.z) + SMOKE_CANISTER_RADIUS_M - 1e-6)) {
        if (wall.ny >= SMOKE_REST_NORMAL_Y || bounces >= SMOKE_MAX_BOUNCES) { shot[6] = strike; return receipt; }
        smokeCanisterPosition(receipt, strike, point);
        smokeCanisterVelocity(receipt, strike, velocity);
        // reflect: the speed into the wall turned out of it and damped, the speed along it scrubbed
        const into = velocity.x * wall.nx + velocity.y * wall.ny + velocity.z * wall.nz;
        const tx = velocity.x - into * wall.nx, ty = velocity.y - into * wall.ny, tz = velocity.z - into * wall.nz;
        const leave = round3(strike);
        shot.push(leave,
          round3(point.x + wall.nx * BOUNCE_LIFT_M), round3(point.y + wall.ny * BOUNCE_LIFT_M), round3(point.z + wall.nz * BOUNCE_LIFT_M),
          round3(tx * SMOKE_FRICTION - into * wall.nx * SMOKE_RESTITUTION),
          round3(ty * SMOKE_FRICTION - into * wall.ny * SMOKE_RESTITUTION),
          round3(tz * SMOKE_FRICTION - into * wall.nz * SMOKE_RESTITUTION));
        bounces++;
        previous = leave; t = leave; chordT = leave; steps = 0;
        smokeCanisterPosition(receipt, leave, chordFrom);
        continue;
      }
      chordFrom.x = point.x; chordFrom.y = point.y; chordFrom.z = point.z; chordT = t; steps = 0;
    }
    if (grounded) {
      let low = previous, high = t;
      for (let i = 0; i < 12; i++) {
        const middle = (low + high) * .5;
        smokeCanisterPosition(receipt, middle, point);
        if (point.y <= ground(point.x, point.z) + SMOKE_CANISTER_RADIUS_M) high = middle;
        else low = middle;
      }
      shot[6] = high;
      break;
    }
    previous = t;
  }
  return receipt;
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
