/** Fixed-step flight shared by solo and multiplayer. Hits stay in the normal projectile pipeline. */
import { Vector3, Euler } from 'three';
import { createShell, type ShellEntity } from './ballistics.ts';
import { AERIAL_RULES, DRONE_WARHEAD, type MatchRuleset } from './matchRuleset.ts';
import { PLAYER_ACTION_BITS } from './playerActions.ts';
import { missionAttachmentFor, DRONE_DOCK_HEIGHT_M, type MissionCarrierSpec } from './missionAttachment.ts';
import type { ShellSpec } from '../vehicles/specHelpers.ts';

export interface AerialView {
  kind: 'drone' | 'gunship'; active: boolean; launching: boolean;
  x: number; y: number; z: number; yaw: number; pitch: number;
  batteryS: number; cooldownS: number;
}
export interface AerialEntity {
  id: string; bot?: boolean; isPlayer?: boolean; team: string;
  spec?: MissionCarrierSpec;
  state: { pos: Vector3; yaw: number; speed: number; visualPitch?: number; visualRoll?: number };
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
const attitude = new Euler(0,0,0,'YXZ');
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
function launchOrigin(entity: AerialEntity, out: Vector3): void {
  if(entity.spec){
    const mount=missionAttachmentFor(entity.spec);
    out.set(mount.x,mount.y+DRONE_DOCK_HEIGHT_M,mount.z);
  }else out.set(0,3.5,0);
  attitude.set(-(entity.state.visualPitch ?? 0),entity.state.yaw,entity.state.visualRoll ?? 0);
  out.applyEuler(attitude).add(entity.state.pos);
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

export function stepAerial(entity: AerialEntity, timeS: number, dt: number, nextId: () => number, launchShell: (shell: ShellEntity<ShellSpec>) => void): void {
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
  const toggle = !!((entity.input.auxiliaryBits ?? 0) & PLAYER_ACTION_BITS.DRONE) ||
    (!!entity.bot && !flight.shell && entity.input.fire && timeS > 8 && timeS >= flight.readyAt);
  entity.input.auxiliaryBits = (entity.input.auxiliaryBits ?? 0) & ~PLAYER_ACTION_BITS.DRONE;
  if (flight.shell && flightExpired(flight, timeS, toggle)) {
    if (flight.shell.id === flight.shellId) flight.shell.dead = true;
    flight.shell = null; v.active = false; v.launching = false; flight.readyAt = timeS + rules.cooldownS;
  } else if (toggle && !flight.shell && timeS >= flight.readyAt) {
    launchOrigin(entity, flight.launch);
    direction.set(Math.sin(entity.state.yaw), .4, Math.cos(entity.state.yaw)).normalize();
    const shell = createShell(DRONE_WARHEAD, entity.id, !!entity.isPlayer, flight.launch, direction, nextId());
    shell.gravityMps2 = 0; shell.vel.set(0,0,0);
    flight.shell = shell; flight.shellId = shell.id; flight.born = timeS;
    v.active = true; v.launching = true; v.yaw = entity.state.yaw; v.pitch = .2;
    launchShell(shell);
  }
  v.cooldownS = Math.max(0, flight.readyAt - timeS);
  const shell = flight.shell;
  if (!shell) return;
  advanceDrone(entity,flight,shell,timeS,dt);
}

function advanceDrone(entity:AerialEntity,flight:Flight,shell:ShellEntity<ShellSpec>,timeS:number,dt:number):void {
  const v=flight.view,rules=AERIAL_RULES.drone;
  const age = timeS - flight.born;
  v.launching = age < rules.launchS;
  if (v.launching) {
    // Smooth rotor spool-up, lift clear of the carrier, then ease into a hover.
    const u=Math.min(1,Math.max(0,age/rules.launchS));
    const lift=rules.launchHeightM*30*u*u*(1-u)*(1-u)/rules.launchS;
    direction.set(Math.sin(v.yaw)*2*u, lift, Math.cos(v.yaw)*2*u);
  }
  else {
    steerDrone(entity, v, shell, dt);
    // Small zero-mean air disturbances; the velocity controller continuously corrects them.
    const phase=flight.born*.73;
    direction.x+=.1*Math.sin(age*1.7+phase);
    direction.y+=.12*Math.sin(age*2.3+phase);
    direction.z+=.08*Math.sin(age*1.9+phase);

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
