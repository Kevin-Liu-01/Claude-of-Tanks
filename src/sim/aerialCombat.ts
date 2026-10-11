/** Fixed-step flight shared by solo and multiplayer. Hits stay in the normal projectile pipeline. */
import { Vector3, Quaternion } from 'three';
import { createShell, type ShellEntity } from './ballistics.ts';
import { AERIAL_RULES, DRONE_WARHEAD, type MatchRuleset } from './matchRuleset.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { missionAttachmentFor, type MissionCarrierSpec } from './missionAttachment.ts';
import {droneLaunchHeight} from './droneLaunch.ts';
import {missionAttachmentPose,type MissionCarrierPose} from './missionAttachmentPose.ts';
import type { ShellSpec } from './shellSpec.ts';
import type { AerialView } from './matchModes.ts';

// The view type lives with the mode rules (matchModes.ts) so the rules never import this flight model.
export type { AerialView };
export interface AerialEntity {
  id: string; bot?: boolean; isPlayer?: boolean; team: string;
  spec?: MissionCarrierSpec;
  state: MissionCarrierPose & {speed:number};
  combat: { destroyed: boolean };
  input: { throttle: number; steer: number; fire: boolean; brake: boolean; aimPoint: Vector3; auxiliaryBits?: number };
  aerial?: AerialView;
}
interface Flight {
  view: AerialView; shell: ShellEntity<ShellSpec> | null; shellId: number; readyAt: number;
  born: number; center: Vector3; launch: Vector3;
}
const flights = new WeakMap<AerialEntity, Flight>();
const direction = new Vector3();
const launchOrientation=new Quaternion(),launchPosition=new Vector3(),launchUp=new Vector3();
type Point3 = { x: number; y: number; z: number };
/**
 * The match-owned world collision, as both authorities already expose it: the solo world's raycast and the
 * authority's collision lease (terrain plus every live collider record, the same shards the server loads). The
 * smoke canisters use this same structural query. `tankAlong` reports a live tank on the probe (an attack run is
 * never treated as an obstacle); without it every hit is an obstacle.
 */
export interface AerialWorldQuery {
  raycast(origin: Point3, direction: Point3, maxDist: number): { dist: number; normal?: Point3 | null } | null;
  tankAlong?(origin: Point3, direction: Point3, maxDist: number, ownerId: string): number | null;
}
/** Deterministic look-ahead avoidance (no randomness, no clock): climb over, side-step, or hold a standoff hover. */
export const DRONE_AVOIDANCE = Object.freeze({
  /** Free air the airframe keeps from any collider: rotor tips (0.34 m) plus margin for the drawn hover wobble. */
  clearanceM: 1.1,
  /** Look-ahead time at the commanded speed, bounded to a short hover probe and a long dash probe. */
  lookaheadS: 1.3, minLookM: 6, maxLookM: 64,
  /** Escape pitches above the commanded path (rad), tried in order: over the top first. */
  climbRad: [.5, .9, 1.35] as readonly number[],
  /** Horizontal side-step yaws (rad), each tried on the side with more room first; never a turn back. */
  sideRad: [.55, 1.1] as readonly number[],
});
const _probe = new Vector3(), _escape = new Vector3(), _axis = new Vector3(), _flat = new Vector3(), _q = new Quaternion();
const WORLD_UP = new Vector3(0, 1, 0);
function probeClear(world: AerialWorldQuery, origin: Vector3, dir: Vector3, reach: number): number {
  const hit = world.raycast(origin, dir, reach);
  return hit ? Math.max(0, hit.dist) : Infinity;
}
/** A tank a drone may be diving at: any live vehicle but the pilot's own, as a bounding sphere around its hull. */
export interface DroneTankTarget {
  id: string; modeActive?: boolean; aerial?: AerialView;
  state: { pos: Point3 } | null; combat?: { destroyed?: boolean } | null;
  spec: { dims: { hullLengthM: number; heightM: number }; armor?: { boundingRadiusM?: number } };
}
/** Distance along a probe to the first live tank sphere (not the owner's), or null; shared by both authorities. */
export function droneTankAlong(tanks: readonly DroneTankTarget[], origin: Point3, dir: Point3, maxDist: number, ownerId: string): number | null {
  let best: number | null = null;
  for (const tank of tanks) {
    if (tank.id === ownerId || tank.modeActive === false || !tank.state || tank.combat?.destroyed || tank.aerial?.kind === 'gunship') continue;
    const radius = Math.max(tank.spec.armor?.boundingRadiusM ?? 0, tank.spec.dims.hullLengthM * .55);
    const cx = tank.state.pos.x - origin.x, cy = tank.state.pos.y + tank.spec.dims.heightM * .5 - origin.y, cz = tank.state.pos.z - origin.z;
    const along = cx * dir.x + cy * dir.y + cz * dir.z;
    if (along < -radius || along - radius > maxDist) continue;
    const miss = cx * cx + cy * cy + cz * cz - along * along;
    if (miss > radius * radius) continue;
    const entry = Math.max(0, along - Math.sqrt(radius * radius - miss));
    if (entry <= maxDist && (best === null || entry < best)) best = entry;
  }
  return best;
}
/** Steer the commanded velocity away from colliders ahead. Mutates `commanded`; returns true when it intervened. */
export function avoidDroneObstacles(world: AerialWorldQuery, ownerId: string, position: Vector3, commanded: Vector3): boolean {
  const rules = DRONE_AVOIDANCE, speed = commanded.length();
  if (speed < 1e-4) return false;
  _probe.copy(commanded).multiplyScalar(1 / speed);
  const look = Math.max(rules.minLookM, Math.min(rules.maxLookM, speed * rules.lookaheadS + 4)), reach = look + rules.clearanceM;
  const hit = world.raycast(position, _probe, reach);
  if (!hit) return false;
  const tank = world.tankAlong?.(position, _probe, reach, ownerId);
  if (tank != null && tank <= hit.dist + .5) return false;
  // Over the top: pitch the path up about the horizontal axis across it.
  _axis.crossVectors(_probe, WORLD_UP);
  if (_axis.lengthSq() < 1e-8) _axis.set(1, 0, 0);
  _axis.normalize();
  for (const pitch of rules.climbRad) {
    _escape.copy(_probe).applyQuaternion(_q.setFromAxisAngle(_axis, pitch));
    if (_escape.y < _probe.y) _escape.copy(_probe).applyQuaternion(_q.setFromAxisAngle(_axis, -pitch));
    if (probeClear(world, position, _escape, reach) >= reach) { commanded.copy(_escape).multiplyScalar(speed); return true; }
  }
  // Around: level side-steps, the roomier side first.
  _flat.set(_probe.x, 0, _probe.z);
  if (_flat.lengthSq() < 1e-8) _flat.set(0, 0, 1);
  _flat.normalize();
  for (const yaw of rules.sideRad) {
    const left = _escape.copy(_flat).applyAxisAngle(WORLD_UP, yaw), leftRoom = probeClear(world, position, left, reach);
    const leftX = left.x, leftZ = left.z;
    const right = _escape.copy(_flat).applyAxisAngle(WORLD_UP, -yaw), rightRoom = probeClear(world, position, right, reach);
    const best = Math.max(leftRoom, rightRoom);
    if (best >= reach * .75) {
      if (leftRoom >= rightRoom) _escape.set(leftX, 0, leftZ);
      commanded.copy(_escape).multiplyScalar(speed * .8);
      return true;
    }
  }
  // Boxed in: hold a standoff hover, easing back out of the clearance along the obstacle's normal.
  commanded.set(0, 0, 0);
  if (hit.dist < rules.clearanceM * 1.5 && hit.normal) commanded.set(hit.normal.x, hit.normal.y, hit.normal.z).multiplyScalar(2);
  return true;
}
export function isGunship(entity: { aerial?: AerialView }): boolean { return entity.aerial?.kind === 'gunship'; }
export function aerialControlsActive(entity: { aerial?: AerialView }): boolean { return !!entity.aerial?.active; }
export function initializeAerial(entity: AerialEntity, ruleset: MatchRuleset): void {
  if (!ruleset.aerial || (ruleset.aerial === 'gunship' && (entity.bot || entity.team === 'enemy' || entity.team === 'bravo'))) {
    delete entity.aerial; flights.delete(entity); return;
  }
  const view: AerialView = { kind: ruleset.aerial === 'drone' ? 'drone' : 'gunship', active: ruleset.aerial === 'gunship', launching: false,
    x: entity.state.pos.x, y: entity.state.pos.y, z: entity.state.pos.z, yaw: entity.state.yaw, pitch: -.6, batteryS: 0, cooldownS: 0 };
  entity.aerial = view;
  const flight = { view, shell: null, shellId: -1, readyAt: 0, born: 0, center: new Vector3(0, entity.state.pos.y, 0), launch: new Vector3() };
  flights.set(entity, flight);
  if(view.kind === 'gunship') positionGunship(entity, flight, 0);
}
function positionGunship(entity: AerialEntity, flight: Flight, timeS: number): void {
  const v=flight.view;
    const rules = AERIAL_RULES.gunship;
    const angle = timeS * rules.orbitRadS;
    v.x = flight.center.x + Math.sin(angle) * rules.radiusM;
    v.z = flight.center.z + Math.cos(angle) * rules.radiusM;
    v.y = flight.center.y + rules.altitudeM;
    v.yaw = angle + Math.PI / 2;
    entity.state.pos.set(v.x, v.y, v.z); entity.state.yaw = v.yaw; entity.state.speed = 0;
    entity.input.throttle = 0; entity.input.steer = 0; entity.input.brake = true;
}
function launchOrigin(entity:AerialEntity,out:Vector3):void {
 if(entity.spec)missionAttachmentPose(entity.spec,entity.state,out,launchOrientation);
 else {out.copy(entity.state.pos);out.y+=3.5;launchOrientation.identity();}
}
function steerDrone(entity: AerialEntity, v: AerialView, shell: ShellEntity<ShellSpec>, dt: number): void {
  const rules = AERIAL_RULES.drone;
  direction.copy(entity.input.aimPoint).sub(shell.pos).normalize();
  const wantedYaw = Math.atan2(direction.x, direction.z), wantedPitch = Math.asin(Math.max(-1, Math.min(1, direction.y)));
  const delta = Math.atan2(Math.sin(wantedYaw - v.yaw), Math.cos(wantedYaw - v.yaw));
  v.yaw += Math.max(-rules.turnRadS * dt, Math.min(rules.turnRadS * dt, delta));
  v.pitch += Math.max(-rules.turnRadS * dt, Math.min(rules.turnRadS * dt, wantedPitch - v.pitch));
  const speed = rules.speedMps * (entity.bot ? 1 : Math.max(-.5, Math.min(1, entity.input.throttle)));
  direction.set(Math.sin(v.yaw) * Math.cos(v.pitch), Math.sin(v.pitch), Math.cos(v.yaw) * Math.cos(v.pitch)).multiplyScalar(speed);
  const strafe = entity.bot ? 0 : Math.max(-1, Math.min(1, entity.input.steer)) * rules.speedMps * .6;
  direction.x += Math.cos(v.yaw) * strafe; direction.z -= Math.sin(v.yaw) * strafe;
  if (!entity.bot && entity.input.brake) direction.y += rules.climbMps;
}

function flightExpired(flight: Flight, timeS: number, toggle: boolean): boolean {
  const shell = flight.shell;
  const rules = AERIAL_RULES.drone;
  return !!shell && (shell.id !== flight.shellId || shell.dead || timeS - flight.born >= rules.batteryS ||
    shell.pos.distanceToSquared(flight.launch) > rules.rangeM ** 2 || toggle);
}

function droneToggleRequested(entity:AerialEntity,flight:Flight,timeS:number):boolean {
  return !!((entity.input.auxiliaryBits??0)&PLAYER_ACTION_BITS.DRONE)
    || (!!entity.bot&&!flight.shell&&entity.input.fire&&timeS>8&&timeS>=flight.readyAt);
}

export function stepAerial(entity: AerialEntity, timeS: number, dt: number, nextId: () => number, launchShell: (shell: ShellEntity<ShellSpec>) => void, world: AerialWorldQuery | null = null): void {
  const flight = flights.get(entity); if (!flight) return;
  const v = flight.view;
  if (entity.combat.destroyed) {
    if (flight.shell && flight.shell.id === flight.shellId) flight.shell.dead = true;
    v.active = false; flight.shell = null; return;
  }
  if (v.kind === 'gunship') {
    positionGunship(entity, flight, timeS);
    return;
  }
  const rules = AERIAL_RULES.drone;
  const toggle = droneToggleRequested(entity,flight,timeS);
  entity.input.auxiliaryBits = (entity.input.auxiliaryBits ?? 0) & ~PLAYER_ACTION_BITS.DRONE;
  if (flight.shell && flightExpired(flight, timeS, toggle)) {
    if (flight.shell.id === flight.shellId) flight.shell.dead = true;
    flight.shell = null; v.active = false; v.launching = false; flight.readyAt = timeS + rules.cooldownS;
  } else if (toggle && !flight.shell && timeS >= flight.readyAt) {
    launchOrigin(entity, flight.launch);
    const launchYaw=entity.state.yaw+(entity.spec && missionAttachmentFor(entity.spec).frame==='turret' ? entity.state.turretYaw??0 : 0);
    direction.set(Math.sin(launchYaw), .4, Math.cos(launchYaw)).normalize();
    const shell = createShell(DRONE_WARHEAD, entity.id, !!entity.isPlayer, flight.launch, direction, nextId());
    shell.gravityMps2 = 0; shell.vel.set(0,0,0);
    flight.shell = shell; flight.shellId = shell.id; flight.born = timeS;
    v.active = true; v.launching = true; v.yaw = launchYaw; v.pitch = .2;
    launchShell(shell);
  }
  v.cooldownS = Math.max(0, flight.readyAt - timeS);
  const shell = flight.shell;
  if (!shell) return;
  advanceDrone(entity,flight,shell,timeS,dt,world);
}

function advanceDrone(entity:AerialEntity,flight:Flight,shell:ShellEntity<ShellSpec>,timeS:number,dt:number,world:AerialWorldQuery|null):void {
  const v=flight.view,rules=AERIAL_RULES.drone;
  const age = timeS - flight.born;
  v.launching = age < rules.launchS;
  if (v.launching) {
    // Lift in the current carrier frame until clear. Tracking the dock during
    // this short phase keeps a moving/rocking carrier from driving into its
    // own payload; free flight resumes at full launch height.
    const height=droneLaunchHeight(age);
    launchOrigin(entity,launchPosition);
    launchUp.set(0,height,0).applyQuaternion(launchOrientation);launchPosition.add(launchUp);
    direction.copy(launchPosition).sub(shell.pos);
    // A deck, bough or overhang above the dock ends the climb short of it, never through it.
    const rise=direction.length();
    if(world&&rise>1e-6){
      _probe.copy(direction).multiplyScalar(1/rise);
      const hit=world.raycast(shell.pos,_probe,rise+DRONE_AVOIDANCE.clearanceM);
      if(hit)direction.multiplyScalar(Math.max(0,Math.min(rise,hit.dist-DRONE_AVOIDANCE.clearanceM))/rise);
    }
    direction.multiplyScalar(1/Math.max(dt,1e-6));

  }
  else {
    steerDrone(entity, v, shell, dt);
    // Bounded, zero-mean gusts; the velocity controller continuously corrects them.
    const phase=flight.born*.73;
    direction.x+=.85*Math.sin(age*1.7+phase)+.35*Math.sin(age*4.3+phase);
    direction.y+=.65*Math.sin(age*2.3+phase)+.25*Math.sin(age*5.7+phase);
    direction.z+=.7*Math.sin(age*1.9+phase)+.3*Math.sin(age*3.7+phase);
    if(world)avoidDroneObstacles(world,entity.id,shell.pos,direction);
  }
  if(v.launching) shell.vel.copy(direction);
  else shell.vel.lerp(direction, 1-Math.exp(-dt*AERIAL_RULES.drone.responseHz));
  v.x = shell.pos.x; v.y = shell.pos.y; v.z = shell.pos.z;
  v.batteryS = Math.max(0, rules.batteryS - age);
}

/** Flight state rides only the encrypted host-migration checkpoint. */
export interface AerialCheckpoint {
  view: AerialView; readyAt: number; born: number;
  center: number[]; launch: number[];
  shell: { pos: number[]; velocity: number[]; ageS: number; distM: number } | null;
}
export function captureAerial(entity: AerialEntity): AerialCheckpoint | null {
  const flight = flights.get(entity); if (!flight) return null;
  const shell = flight.shell;
  return { view: { ...flight.view }, readyAt: flight.readyAt, born: flight.born,
    center: flight.center.toArray(), launch: flight.launch.toArray(),
    shell: shell && !shell.dead && shell.id === flight.shellId ? { pos: shell.pos.toArray(), velocity: shell.vel.toArray(), ageS: shell.ageS, distM: shell.distM } : null };
}
export function restoreAerial(entity: AerialEntity, checkpoint: AerialCheckpoint, nextId: () => number, launchShell: (shell: ShellEntity<ShellSpec>) => void): void {
  const flight = flights.get(entity); if (!flight) return;
  Object.assign(flight.view, checkpoint.view); flight.readyAt = checkpoint.readyAt; flight.born = checkpoint.born;
  flight.center.fromArray(checkpoint.center); flight.launch.fromArray(checkpoint.launch);
  flight.shell = null;
  if (checkpoint.shell) {
    const saved = checkpoint.shell;
    direction.fromArray(saved.velocity).normalize();
    const shell = createShell(DRONE_WARHEAD, entity.id, !!entity.isPlayer, new Vector3().fromArray(saved.pos), direction, nextId());
    shell.vel.fromArray(saved.velocity); shell.ageS = saved.ageS; shell.distM = saved.distM; shell.gravityMps2 = 0; shell.vel.set(0,0,0);
    flight.shell = shell; flight.shellId = shell.id; launchShell(shell);
  }
}
