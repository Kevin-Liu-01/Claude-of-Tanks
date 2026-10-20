import { createSmokeCanister, smokeCloudBanks, smokeCanisterPosition, type SmokePoint, type SmokeWorld, type SmokeWorldHit } from './smokeBallistics.ts';
import { smokeClip, smokeScreenSummary } from './smokeScreen.ts';
import { Euler, Matrix4, Vector3, Quaternion } from 'three';
import { auxiliaryCapabilities, type AuxiliaryInventory } from '../vehicles/auxiliaryInventory.ts';
import { auxiliaryWeaponProfile, type AuxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';
import { penAtDistanceMm, shellGravityMps2 } from './ballistics.ts';
export { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import { estimateHurtChance, type DamageShellSpec, type CombatState } from './damage.ts';
import { traceTank, type ArmorModel, type TankArmorPose } from './armor.ts';
import type { SpottingTank } from './spotting.ts';

export type AuxiliaryAction = 'smoke' | 'lights' | 'roofGun' | 'lightsOff';
import type { SmokeScreen } from './smokeScreen.ts';
export type { SmokeScreen } from './smokeScreen.ts';
export { SMOKE_DURATION_S, smokeBlocks } from './smokeScreen.ts';
/** One extra roof station's own aim and bursts (stations after the first; VH.02, the M551A1 TTS's roof M2). */
export interface AuxiliaryStationState {
  gunYaw: number;
  gunPitch: number;
  nextShot: number;
  shots: number;
}
export interface AuxiliaryState {
  lights: -1 | 0 | 1;
  gunOn: boolean;
  gunYaw: number;
  gunPitch: number;
  nextShot: number;
  shots: number;
  smokeCharges: number;
  smokeReadyAt: number;
  smoke: SmokeScreen | null;
  /** The vehicle's second and later roof stations (guns[1..]), present only on a multi-station vehicle. The first
   * station keeps gunYaw/gunPitch/nextShot/shots above; on/off, damage and the roofGun module are shared. */
  stations?: AuxiliaryStationState[];
}
export interface AuxiliaryEntity {
  id: string;
  team: string;
  spec: { id: string; dims?: { heightM: number; widthM?: number; hullLengthM?: number }; armor?: AuxiliaryArmour | null };
  state: { pos: { x: number; y: number; z: number }; yaw: number; turretYaw: number; visualPitch?: number; visualRoll?: number;
    gunPitch?: number; modeScale?: number; roofGunYaw?: number; roofGunPitch?: number; speed?: number; yawRate?: number;
    turretYawRate?: number };
  combat: { destroyed?: boolean; auxiliary?: AuxiliaryState; modules?: CombatState['modules']; eraSpent?: ReadonlySet<string>;
    crew?: CombatState['crew']; modeCriticalDamage?: boolean; modeModuleOnlyDamage?: boolean };
  modeActive?: boolean;
  /** The mode's gravity on the vehicle's rounds (both authorities scale a roof round's drop by it). */
  modeGravityScale?: number;
  aerial?: SpottingTank['aerial'];
}
/** The armour fields the roof gun reads (VH.14): the turret pivot and the main plates' polygons and KE thickness. */
interface AuxiliaryArmourPlate { readonly verts?: readonly (readonly number[])[]; readonly keMm?: number; readonly physicalMm?: number;
  readonly kind?: string }
interface AuxiliaryArmour { turretPivot?: readonly number[]; readonly hullPlates?: readonly AuxiliaryArmourPlate[];
  readonly turretPlates?: readonly AuxiliaryArmourPlate[] }
const thinnestFace = new WeakMap<object, number>();
/**
 * VH.14 balance: a vehicle's thinnest vertical main-armour plate (side or rear, normal within 60 degrees of level),
 * nominal KE millimetres: the best face a roof gun's round can meet. 0 for a target without an armour table or a
 * vertical main plate (a soft target: always engaged, as every target was before). Cached per armour table; pure over
 * the spec, so both authorities agree.
 */
export function thinnestVerticalArmourMm(spec: { armor?: AuxiliaryArmour | null }): number {
  const armour = spec.armor;
  if (!armour) return 0;
  const known = thinnestFace.get(armour);
  if (known !== undefined) return known;
  let thinnest = Infinity;
  for (const plates of [armour.hullPlates, armour.turretPlates]) for (const plate of plates ?? []) {
    const v = plate.verts, mm = plate.keMm ?? plate.physicalMm;
    if (!v || v.length < 3 || (plate.kind && plate.kind !== 'main') || !Number.isFinite(mm)) continue;
    const ux = v[1]![0]! - v[0]![0]!, uy = v[1]![1]! - v[0]![1]!, uz = v[1]![2]! - v[0]![2]!;
    const wx = v[2]![0]! - v[0]![0]!, wy = v[2]![1]! - v[0]![1]!, wz = v[2]![2]! - v[0]![2]!;
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, length = Math.hypot(nx, ny, nz);
    if (length > 1e-12 && Math.abs(ny) / length < .5) thinnest = Math.min(thinnest, mm!);
  }
  if (thinnest === Infinity) thinnest = 0;
  thinnestFace.set(armour, thinnest);
  return thinnest;
}
const facePlates = new WeakMap<object, Float64Array>();
/** VH.14 balance: every main plate (plates run counter-clockwise seen from outside) as a row [unit outward normal x,
 * unit outward normal z, KE mm, owner (0 hull, 1 turret), area m²], cached per armour table. */
function mainPlates(armour: AuxiliaryArmour): Float64Array {
  const known = facePlates.get(armour);
  if (known) return known;
  const rows: number[] = [];
  for (const [owner, plates] of [[0, armour.hullPlates], [1, armour.turretPlates]] as const) for (const plate of plates ?? []) {
    const v = plate.verts, mm = plate.keMm ?? plate.physicalMm;
    if (!v || v.length < 3 || (plate.kind && plate.kind !== 'main') || !Number.isFinite(mm)) continue;
    // the polygon's area vector (half the sum of its edge cross products): its direction is the outward normal
    let ax = 0, ay = 0, az = 0;
    for (let i = 0; i < v.length; i++) {
      const a = v[i]!, b = v[(i + 1) % v.length]!;
      ax += a[1]! * b[2]! - a[2]! * b[1]!; ay += a[2]! * b[0]! - a[0]! * b[2]!; az += a[0]! * b[1]! - a[1]! * b[0]!;
    }
    const twice = Math.hypot(ax, ay, az);
    if (twice > 1e-12) rows.push(ax / twice, az / twice, mm!, owner, twice / 2);
  }
  const table = Float64Array.from(rows);
  facePlates.set(armour, table);
  return table;
}
/**
 * VH.14 balance (the coordinator's check, 2026-10-15: no roof gun spends its fire on a vehicle it cannot hurt): the
 * share of the main armour a target presents to a level round from (fromX, fromZ) that a round of `penMm` defeats.
 * Each plate turned towards the shooter (hull plates by the hull's yaw, turret plates by the turret's too; obliquity
 * under 78 degrees) counts by its presented area (area times the cosine) and is defeated when its line-of-sight
 * thickness (KE mm over the cosine) is at most `penMm`. A thin flank or rear counts by its size; a sight box's thin
 * face on a heavy front does not make the front a target. 1 for a target without an armour table (a soft target, always
 * engaged). Pure over the spec and the two positions and yaws, so both authorities agree.
 */
export function defeatableShare(target: AuxiliaryEntity, fromX: number, fromZ: number, penMm: number): number {
  const armour = target.spec.armor;
  if (!armour) return 1;
  const plates = mainPlates(armour);
  const s = target.state, dx = fromX - s.pos.x, dz = fromZ - s.pos.z, reach = Math.hypot(dx, dz);
  if (!plates.length || reach < 1e-6) return thinnestVerticalArmourMm(target.spec) <= penMm ? 1 : 0;
  let presented = 0, defeated = 0;
  for (let owner = 0; owner < 2; owner++) {
    const yaw = s.yaw + (owner ? s.turretYaw : 0), c = Math.cos(yaw), n = Math.sin(yaw);
    // the shooter's bearing in the plate owner's frame (the inverse of the owner's yaw about +Y)
    const lx = (dx * c - dz * n) / reach, lz = (dx * n + dz * c) / reach;
    for (let i = 0; i < plates.length; i += 5) {
      if (plates[i + 3] !== owner) continue;
      const facing = plates[i]! * lx + plates[i + 1]! * lz;
      if (facing <= .2) continue;
      const seen = plates[i + 4]! * facing;
      presented += seen;
      if (plates[i + 2]! / facing <= penMm) defeated += seen;
    }
  }
  return presented > 0 ? defeated / presented : (thinnestVerticalArmourMm(target.spec) <= penMm ? 1 : 0);
}
/**
 * VH.14 hold fire (owner, 2026-10-19: "Make roof guns hold fire where their rounds cannot hurt"): a round is fired only
 * when its chance to hurt the target where it lands (damage.ts estimateHurtChance: the live hit walk priced over the
 * pen roll, the modules it reaches, one ricochet) is at least HURT_FLOOR — one round in five. Below that the burst only
 * sparks off the armour; above it every burst of five expects a hurting round.
 */
const HURT_FLOOR = .2;
/** The target's armour pose when a round `flightS` from now reaches it (module scratch): dead-reckoned from its hull's
 * speed along its heading (sim/movement.ts: the forward speed carries the hull) and its hull and turret yaw rates. */
const arrivalPose: TankArmorPose = { pos: new Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
/** The share of its hull and turret yaw rates the dead reckoning carries (1; robustHurtChance tries more and less). */
let arrivalTurn = 1;
function poseAtArrival(target: AuxiliaryEntity, flightS: number): TankArmorPose {
  const s = target.state, turn = (s.yawRate ?? 0) * arrivalTurn * flightS, heading = s.yaw + turn * .5, travel = (s.speed ?? 0) * flightS;
  arrivalPose.pos.set(s.pos.x + Math.sin(heading) * travel, s.pos.y, s.pos.z + Math.cos(heading) * travel);
  arrivalPose.yaw = s.yaw + turn; arrivalPose.pitch = s.visualPitch || 0; arrivalPose.roll = s.visualRoll || 0;
  arrivalPose.turretYaw = (s.turretYaw || 0) + (s.turretYawRate ?? 0) * arrivalTurn * flightS; arrivalPose.gunPitch = s.gunPitch || 0;
  arrivalPose.modeScale = s.modeScale ?? 1; arrivalPose.roofGunYaw = s.roofGunYaw ?? 0; arrivalPose.roofGunPitch = s.roofGunPitch ?? 0;
  return arrivalPose;
}
/** The time after the shot of the pose a round `flightS` long meets: both authorities move the hulls, then fire and step
 * the shells, so the tick's swept segment that reaches the target is traced against its pose of the tick before. */
const meetS = (flightS: number): number => Math.max(0, Math.ceil(flightS / PASS_DT - 1e-9) - 1) * PASS_DT;
/** A target-local point (hull frame, before the mode's scale) where it stands `flightS` from now (poseAtArrival), in
 * `out`: the point a station lays on to put its round there. */
function arrivalPoint(target: AuxiliaryEntity, x: number, y: number, z: number, flightS: number, out: Vector3): Vector3 {
  const pose = poseAtArrival(target, flightS), scale = pose.modeScale ?? 1, c = Math.cos(pose.yaw), n = Math.sin(pose.yaw);
  return out.set(pose.pos.x + (x * c + z * n) * scale, pose.pos.y + y * scale, pose.pos.z + (-x * n + z * c) * scale);
}
const hurtRay = new Vector3(), hurtTo = new Vector3();
/** roofHurtChance's view of the target (module scratch, cleared after each estimate). */
const noCombat: AuxiliaryEntity['combat'] = {};
const hurtTarget: { spec: { armor: ArmorModel | null }; combat: AuxiliaryEntity['combat'] } = { spec: { armor: null }, combat: noCombat };
/** The chance a round of `profile` leaving `from` and arriving at `at` (its drop taken) hurts `target` there: the line
 * carried 12 m on through the vehicle, against its pose on the round's arrival. Pure over the poses (the traces
 * allocate: run per shot or per refusal, never per tick). */
function roofHurtChance(target: AuxiliaryEntity, from: Vector3, at: Vector3, profile: AuxiliaryWeaponProfile): number {
  // a target without main armour plates is soft (defeatableShare's 1): always hurt
  if (!target.spec.armor || !mainPlates(target.spec.armor).length) return 1;
  hurtRay.copy(at).sub(from);
  const distance = hurtRay.length();
  if (distance < 1e-6) return 1;
  hurtTo.copy(from).addScaledVector(hurtRay, (distance + 12) / distance);
  hurtTarget.spec.armor = target.spec.armor as ArmorModel; hurtTarget.combat = target.combat;
  const chance = estimateHurtChance(profile.shell, distance, hurtTarget, poseAtArrival(target, meetS(distance / profile.shell.velocityMps)),
    from, hurtTo, profile.shell.velocityMps * PASS_DT);
  hurtTarget.spec.armor = null; hurtTarget.combat = noCombat;
  return chance;
}
/**
 * VH.14 hold fire (the critic's third round, 2026-10-19): a line priced alone can hurt only along itself — a turret
 * roof's edge, a curved tube's grazing face, a hull mid-turn — while the round flies a hair off it or the target turns a
 * little more or less than its rate says. A round's chance is its worst over the line and four beside it (the arrival
 * point moved ROBUST_M — what the drop's curve and the sums leave between the priced line and the flown one at a
 * standing target — plus ROBUST_SPEED of a moving target's travel over the flight, to either side and up and down) and, on
 * a turning target, over TURN_SHARES of its yaw rates; under HURT_FLOOR on any, it is held. Up to seven estimates: per
 * shot or refusal, never per tick.
 */
const ROBUST_M = .02, ROBUST_SPEED = .1, TURN_SHARES = [.5, 1.5] as const;
const ROBUST_STEPS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const robustAt = new Vector3(), robustSide = new Vector3();
function robustHurtChance(target: AuxiliaryEntity, from: Vector3, at: Vector3, profile: AuxiliaryWeaponProfile): number {
  let worst = roofHurtChance(target, from, at, profile);
  if (worst < HURT_FLOOR || !target.spec.armor || !mainPlates(target.spec.armor).length) return worst;
  const s = target.state, flight = from.distanceTo(at) / profile.shell.velocityMps;
  const reach = ROBUST_M + ROBUST_SPEED * Math.abs(s.speed ?? 0) * flight;
  robustSide.set(at.z - from.z, 0, from.x - at.x);
  const side = Math.hypot(robustSide.x, robustSide.z);
  if (side > 1e-6) robustSide.multiplyScalar(1 / side);
  for (const [across, up] of ROBUST_STEPS) {
    robustAt.copy(at).addScaledVector(robustSide, across * reach); robustAt.y += up * reach;
    worst = Math.min(worst, roofHurtChance(target, from, robustAt, profile));
    if (worst < HURT_FLOOR) return worst;
  }
  if (Math.max(Math.abs(s.yawRate ?? 0), Math.abs(s.turretYawRate ?? 0)) * flight > .004) {
    for (const share of TURN_SHARES) {
      arrivalTurn = share;
      worst = Math.min(worst, roofHurtChance(target, from, at, profile));
      arrivalTurn = 1;
      if (worst < HURT_FLOOR) return worst;
    }
  }
  return worst;
}
/** The aim grid on each face the target turns towards the station: along the face and up it, as fractions of its half
 * length (or width) and of its height. */
const AIM_ALONG = [0, -.35, .35, -.7, .7, -.9, .9] as const, AIM_UP = [.5, .3, .75, .15, .92] as const;
/** aimSearch verifies its best AIM_VERIFY points by nominal chance (robustHurtChance, lanes), best first. */
const AIM_VERIFY = 6;
const aimTop = new Float64Array(AIM_VERIFY * 4);
const aimWorld = new Vector3(), aimFrom = new Vector3(), aimArrive = new Vector3();
/** The best aim point aimSearch found (target-local, hull frame before the mode's scale) and its chance. */
let aimX = 0, aimY = 0, aimZ = 0, aimChance = 0;
/**
 * VH.14 hold fire: when the round at the target's centre cannot hurt it, the point on the faces it turns towards the
 * station (the hull box: its dims) where one most likely does — a 7 x 5 grid on each face, each point where the target
 * will stand when the round arrives, priced along the line the round would really fly once the station lays on it
 * (laidLine: the muzzle beside the mount's axis, the drop; roofHurtChance); the nearer the face's middle the better
 * among near-equal chances. The AIM_VERIFY best are then tried best first and the first taken whose lane is clear
 * (laneClear: no ally, ally hull, wreck or seen hull before it; the world; hullsClear: no vehicle's armour on the
 * falling round's flight) and whose chance holds beside the line (robustHurtChance). Leaves it in aimX/Y/Z and
 * aimChance; false when none does. `from`: where the station stands (the faces it sees). At a refusal or a lapsed hold
 * only, never per tick.
 */
function aimSearch(gun: RoofGunMount, profile: AuxiliaryWeaponProfile, shooter: AuxiliaryEntity, target: AuxiliaryEntity,
  from: Vector3, context: GunContext): boolean {
  const s = target.state, dims = target.spec.dims, dx = from.x - s.pos.x, dz = from.z - s.pos.z, reach = Math.hypot(dx, dz);
  aimChance = 0;
  if (reach < 1e-6) return false;
  const c = Math.cos(s.yaw), n = Math.sin(s.yaw), lx = (dx * c - dz * n) / reach, lz = (dx * n + dz * c) / reach;
  // the spec's dims carry the mode's scale already (sim/juggernautScale.ts); arrivalPoint scales hull-frame points
  const scale = s.modeScale ?? 1;
  const halfWidth = (dims?.widthM ?? 3.4) * .5 / scale, halfLength = (dims?.hullLengthM ?? 6.6) * .5 / scale, height = (dims?.heightM ?? 2.5) / scale;
  const flight = meetS(Math.hypot(dx, s.pos.y - from.y, dz) / profile.shell.velocityMps);
  let kept = 0;
  for (let face = 0; face < 2; face++) {
    const facing = face ? lz : lx;
    if (Math.abs(facing) <= .2) continue;
    for (const along of AIM_ALONG) for (const up of AIM_UP) {
      const prior = -.05 * (Math.abs(along) + Math.abs(up - .5));
      // a point no chance can lift into the kept best is not traced
      if (kept === AIM_VERIFY && 1 + prior <= aimTop[(AIM_VERIFY - 1) * 4]!) continue;
      const x = face ? along * halfWidth : Math.sign(facing) * halfWidth, z = face ? Math.sign(facing) * halfLength : along * halfLength;
      const y = up * height;
      arrivalPoint(target, x, y, z, flight, aimWorld);
      if (!laidLine(gun, profile, shooter, aimWorld, aimFrom, aimArrive)) continue;
      const chance = roofHurtChance(target, aimFrom, aimArrive, profile), score = chance + prior;
      if (chance < HURT_FLOOR || (kept === AIM_VERIFY && score <= aimTop[(AIM_VERIFY - 1) * 4]!)) continue;
      // keep the best AIM_VERIFY, best first
      let slot = kept < AIM_VERIFY ? kept++ : AIM_VERIFY - 1;
      for (; slot > 0 && aimTop[(slot - 1) * 4]! < score; slot--) aimTop.copyWithin(slot * 4, (slot - 1) * 4, slot * 4);
      aimTop[slot * 4] = score; aimTop[slot * 4 + 1] = x; aimTop[slot * 4 + 2] = y; aimTop[slot * 4 + 3] = z;
    }
  }
  for (let k = 0; k < kept; k++) {
    const x = aimTop[k * 4 + 1]!, y = aimTop[k * 4 + 2]!, z = aimTop[k * 4 + 3]!;
    arrivalPoint(target, x, y, z, flight, aimWorld);
    if (!laidLine(gun, profile, shooter, aimWorld, aimFrom, aimArrive)) continue;
    if (!laneClear(shooter, target, context, aimFrom, aimWorld) || !context.clear(aimFrom, aimWorld)
      || !hullsClear(shooter, target, context, aimFrom, layDir, aimFrom.distanceTo(aimWorld), profile)) continue;
    const chance = robustHurtChance(target, aimFrom, aimArrive, profile);
    if (chance < HURT_FLOOR) continue;
    aimChance = chance; aimX = x; aimY = y; aimZ = z;
    return true;
  }
  return false;
}
export const SMOKE_COOLDOWN_S = 28;
export const ROOF_GUN_SHELL: DamageShellSpec = auxiliaryWeaponProfile(12.7).shell;
const stationState = (): AuxiliaryStationState => ({ gunYaw: 0, gunPitch: 0, nextShot: 0, shots: 0 });
/** VH.14: the vehicle row's auxiliary JSON (server/match/entityRows.ts). Fractional numbers travel to the millimetre,
 * milliradian and millisecond — the presentation reads aim, bursts and the smoke screen's seat, nothing finer — so a
 * vehicle with several working roof stations stays inside the row's 512-byte field (src/mp/wire/rows.ts);
 * roofStations.selftest pins the worst case of every vehicle in the inventory. */
export function auxiliaryRowJson(aux: AuxiliaryState): string {
  return JSON.stringify({ ...aux, smoke: aux.smoke ? smokeScreenSummary(aux.smoke) : null }, wireNumber);
}
function wireNumber(_key: string, value: unknown): unknown {
  return typeof value === 'number' && !Number.isInteger(value) ? Math.round(value * 1000) / 1000 : value;
}
export function createAuxiliaryState(spec: { id?: string }): AuxiliaryState {
  const guns = auxiliaryCapabilities(spec)?.guns;
  return {
    lights: -1, gunOn: !!guns?.length, gunYaw: 0, gunPitch: 0, nextShot: 0, shots: 0,
    smokeCharges: 3, smokeReadyAt: 0, smoke: null,
    ...(guns && guns.length > 1 ? { stations: guns.slice(1).map(stationState) } : {}),
  };
}
/** How many roof stations the vehicle's roof-gun system drives (guns[0] first, heaviest calibre). */
export function roofStationCount(spec: { id?: string }): number { return auxiliaryCapabilities(spec)?.guns.length ?? 0; }
export function auxiliaryState(entity: Pick<AuxiliaryEntity, 'combat' | 'spec'>): AuxiliaryState {
  return entity.combat.auxiliary ??= createAuxiliaryState(entity.spec);
}
const matrix = new Matrix4(), local = new Matrix4(), euler = new Euler();
const origin = new Vector3(), direction = new Vector3(), targetPoint = new Vector3();
const xAxis=new Vector3(1,0,0),yAxis=new Vector3(0,1,0);
const inverse = new Matrix4(), base = new Matrix4(), gunMatrix = new Matrix4(), one=new Vector3(1,1,1), quaternion=new Quaternion();
const localTarget = new Vector3(), pivot = new Vector3(), bore = new Vector3(), mountScale = new Vector3();
export const auxiliaryShot = { origin, direction, shell:ROOF_GUN_SHELL };
/** Match the authored hull -> turret frame; no camera or rendered model in authority. */
function mountFrame(entity: AuxiliaryEntity, owner: 'hull' | 'turret'): Matrix4 {
  const s = entity.state;
  matrix.makeRotationFromEuler(euler.set(-(s.visualPitch || 0), s.yaw, s.visualRoll || 0, 'YXZ'));
  matrix.setPosition(s.pos.x, s.pos.y, s.pos.z);
  if (owner === 'turret') {
    const p = auxiliaryCapabilities(entity.spec)?.turretPivot ?? entity.spec.armor?.turretPivot ?? [0, (entity.spec.dims?.heightM ?? 2.5) * .7, 0];
    local.makeRotationY(s.turretYaw); local.setPosition(p[0]!, p[1]!, p[2]!); matrix.multiply(local);
  }
  return matrix;
}
/** An authority's world collision as the launch reads it (the solo world; the match's, whose ray query is optional). */
interface AuxiliaryWorld { raycast?(origin: SmokePoint, direction: SmokePoint, maxDist: number): SmokeWorldHit | null }
/** `world` (the authority's collision: the solo world, the match's shards) makes the canisters bounce off what they
 * strike and holds each bank's cloud outside the walls round it (smokeClip); without it they meet the terrain only. */
export function requestAuxiliary(
  entity: AuxiliaryEntity, action: AuxiliaryAction, now: number, ground?: (x:number,z:number)=>number, world?: AuxiliaryWorld | null,
): boolean {
  if (entity.combat.destroyed || entity.modeActive === false) return false;
  const kit = auxiliaryCapabilities(entity.spec);
  if (!kit) return false;
  const state = auxiliaryState(entity);
  if ((action === 'lights' || action === 'lightsOff') && kit.lights) { state.lights = action === 'lights' ? 1 : 0; return true; }
  if (action === 'roofGun' && kit.guns.length && entity.combat.modules?.roofGun?.state !== 'red') { state.gunOn = !state.gunOn; return true; }
  if (action !== 'smoke' || !kit.smoke.length || !state.smokeCharges || now < state.smokeReadyAt) return false;
  const terrain=ground ?? (()=>entity.state.pos.y);
  const query=world&&typeof world.raycast==='function'?world as SmokeWorld:null;
  const canisters=kit.smoke.map(socket=>{
    const frame=mountFrame(entity,socket.owner);
    origin.fromArray(socket.position).applyMatrix4(frame);
    direction.fromArray(socket.direction).transformDirection(frame);
    return createSmokeCanister(origin,direction,terrain,query);
  });
  targetPoint.set(0,0,0);
  for(const shot of canisters){smokeCanisterPosition(shot,shot[6],origin);targetPoint.add(origin);}
  targetPoint.multiplyScalar(1/canisters.length);
  const smokePivot=kit.turretPivot??entity.spec.armor?.turretPivot??[0,(entity.spec.dims?.heightM??2.5)*.7,0];
  const banks=smokeCloudBanks(canisters);
  const clip=query?canisters.map((shot,index)=>banks.includes(index)?smokeClip(smokeCanisterPosition(shot,shot[6],{x:0,y:0,z:0}),query):0):null;
  state.smoke={x:targetPoint.x,y:targetPoint.y+1.32,z:targetPoint.z,
    yaw:entity.state.yaw+entity.state.turretYaw,born:now,canisters,banks,
    ...(clip?.some(c=>c)?{clip}:{}),
    source:[entity.spec.id,entity.state.pos.x,entity.state.pos.y,entity.state.pos.z,entity.state.yaw,entity.state.turretYaw,
      entity.state.visualPitch||0,entity.state.visualRoll||0,smokePivot[0]!,smokePivot[1]!,smokePivot[2]!]};
  state.smokeCharges--; state.smokeReadyAt = now + SMOKE_COOLDOWN_S;
  return true;
}
interface GunContext {
  entities: readonly AuxiliaryEntity[];
  visible(target: AuxiliaryEntity, shooter: AuxiliaryEntity): boolean;
  clear(a: Vector3, b: Vector3): boolean;
  /** VH.15 counter-drone (the mode's ruleset, matchRuleset.ts counterDrone): roof stations engage enemy drones in flight
   * before vehicles. */
  counterDrone?: boolean;
  /** VH.15: the authority charges a round a station fired at a drone to that drone's airframe (aerialCombat.ts
   * strikeDrone): `chance`, the round's share of a strike at its range (weapon profile, droneStrikeChance). */
  droneHit?(carrier: AuxiliaryEntity, chance: number, shooter: AuxiliaryEntity): void;
}
const wrap = (v:number) => Math.atan2(Math.sin(v), Math.cos(v));
type RoofGunMount = AuxiliaryInventory['guns'][number];
/** A target's centre for the station's lay test (module scratch). */
const arcLocal = new Vector3();
/** The yaw a station would need for a bearing, in its arc's unwrapped range, or NaN outside it. */
function arcYaw(arc: readonly [number, number], yaw: number): number {
  if (yaw > arc[1]) yaw -= Math.PI * 2; else if (yaw < arc[0]) yaw += Math.PI * 2;
  return yaw >= arc[0] && yaw <= arc[1] ? yaw : NaN;
}
/** The deepest depression a station may take at a yaw: the weapon's, or less where the mount's table says the roof
 * below the barrel allows less (between two samples the smaller holds). */
function depressionAt(gun: RoofGunMount, yaw: number, weapon: number): number {
  const table = gun.depressionByYaw;
  if (!table?.length || yaw < table[0]![0] || yaw > table[table.length - 1]![0]) return weapon;
  for (let i = 1; i < table.length; i++) if (yaw <= table[i]![0]) return Math.min(weapon, table[i - 1]![1], table[i]![1]);
  return Math.min(weapon, table[table.length - 1]![1]);
}
/** VH.14 balance: the station, its weapon, the clock and the context of the scan selectRoofTarget runs for it (module
 * scratch, one scan at a time). */
let scanGun: RoofGunMount | null = null, engageWeapon: AuxiliaryWeaponProfile | null = null;
let scanStation: AuxiliaryStationState | null = null, scanShooter: AuxiliaryEntity | null = null, scanNow = 0;
let scanContext: GunContext | null = null;
/** The station's penetration at a target's range over the profile's engagePenRatio (from the mount, `origin`). */
function engagePenMm(profile: AuxiliaryWeaponProfile, target: AuxiliaryEntity): number {
  const distance = Math.hypot(target.state.pos.x - origin.x, target.state.pos.z - origin.z);
  return penAtDistanceMm(profile.shell, distance) / profile.engagePenRatio;
}
/** selectRoofTarget's filter for a station: a target its round can hurt from here (at least the weapon profile's
 * engageShare of the armour the target turns towards it defeated at its penetration over engagePenRatio, defeatableShare),
 * that the station does not hold (stationHold: refused where it stands now, judged again in place from the mount when
 * the hold lapses), and that the station can lay on: inside its traverse arc, its depression there and its elevation
 * (stationLay; 2026-10-19: a station no longer idles on a nearest target it cannot lay on while one it can stands
 * further off). */
function stationAccepts(target: AuxiliaryEntity): boolean {
  if (engageWeapon) {
    const share = defeatableShare(target, origin.x, origin.z, engagePenMm(engageWeapon, target));
    if (share < engageWeapon.engageShare) return false;
    if (scanStation && scanShooter && scanGun && scanContext
      && stationHold(scanStation, scanShooter, target, scanNow, share, scanGun, engageWeapon, scanContext)?.aim === false) return false;
  }
  if (!scanGun || !engageWeapon) return true;
  const height = target.spec.dims?.heightM ?? 2.5;
  arcLocal.set(target.state.pos.x, target.state.pos.y + height * .5, target.state.pos.z);
  if (stationLay(scanGun, engageWeapon, arcLocal)) return true;
  // 2026-10-19: a centre below the mount's depression leaves the upper hull to lay on (stepStation searches its faces)
  arcLocal.y = target.state.pos.y + height * .92;
  return stationLay(scanGun, engageWeapon, arcLocal);
}
const layPoint = new Vector3(), boreEnd = new Vector3(), layLocal = new Vector3(), layDir = new Vector3();
/** Can the station lay on the world point: its bearing inside the station's arc, its pitch inside the depression the
 * mount allows at that yaw and the weapon's elevation (aimAndFire's own law, from the mount's frame `inverse`). */
function stationLay(gun: RoofGunMount, profile: AuxiliaryWeaponProfile, point: Vector3): boolean {
  layPoint.copy(point).applyMatrix4(inverse);
  const bearing = Math.atan2(layPoint.x, layPoint.z), yaw = gun.yawArc ? arcYaw(gun.yawArc, bearing) : bearing;
  if (Number.isNaN(yaw)) return false;
  layPoint.applyAxisAngle(yAxis, -bearing).divide(mountScale).sub(pivot);
  const pitch = Math.atan2(layPoint.y, Math.hypot(layPoint.x, layPoint.z));
  return pitch >= -depressionAt(gun, yaw, profile.depressionRad) && pitch <= profile.elevationRad;
}
/** The line a round laid on `point` would fly once the station has settled on it (aimAndFire's lay and bore: the yaw
 * and pitch from the mount's pivot, the round leaving the muzzle along the bore): the muzzle in `from` and where the
 * round arrives at the point's range, its drop over the flight taken (the mode's gravity), in `arrive`. False when the
 * station cannot lay on the point (stationLay's law). From the mount's frame (`base`, `inverse`, `pivot`, `mountScale`). */
function laidLine(gun: RoofGunMount, profile: AuxiliaryWeaponProfile, shooter: AuxiliaryEntity, point: Vector3, from: Vector3,
  arrive: Vector3): boolean {
  layLocal.copy(point).applyMatrix4(inverse);
  const bearing = Math.atan2(layLocal.x, layLocal.z), yaw = gun.yawArc ? arcYaw(gun.yawArc, bearing) : bearing;
  if (Number.isNaN(yaw)) return false;
  layLocal.applyAxisAngle(yAxis, -bearing).divide(mountScale).sub(pivot);
  const pitch = Math.atan2(layLocal.y, Math.hypot(layLocal.x, layLocal.z));
  if (pitch < -depressionAt(gun, yaw, profile.depressionRad) || pitch > profile.elevationRad) return false;
  layDir.set(0, Math.sin(pitch), Math.cos(pitch)).multiply(mountScale).applyAxisAngle(yAxis, yaw).transformDirection(base);
  from.fromArray(gun.muzzle).sub(pivot).applyAxisAngle(xAxis, -pitch).add(pivot).multiply(mountScale).applyAxisAngle(yAxis, yaw)
    .applyMatrix4(base);
  const range = from.distanceTo(point), flight = range / profile.shell.velocityMps;
  arrive.copy(from).addScaledVector(layDir, range);
  arrive.y -= .5 * shellGravityMps2(profile.shell) * (shooter.modeGravityScale ?? 1) * flight * flight;
  return true;
}

/**
 * VH.14 hold fire (owner, 2026-10-19): what a station learnt from its refused rounds. A round whose chance to hurt the
 * target where it lands is under HURT_FLOOR is not fired; the station then lays on the point of the target's faces
 * where one most likely hurts (aimSearch: `aim`, the point in the target's hull frame, led to where it will stand), or
 * holds the target: the scan skips it and takes the next target it can hurt. A hold stands while the target stands as
 * it was refused — the shooter's bearing in its hull and turret frames within HOLD_TURN_RAD, its range within
 * HOLD_RANGE, the share of its presented armour the round defeats (defeatableShare) no more than HOLD_SHARE_RISE above
 * the refused one — for HOLD_S; when it lapses the station judges the target again in place, from the mount, without
 * laying on it (judgeInPlace: the centre, then the faces), so a refused target never draws the gun off the one it is
 * hurting. An aim point stands AIM_S after its last round while the bearings stay within AIM_TURN_RAD. Module memory
 * keyed by the station's own state, in fixed reused slots (never on the wire: the auxiliary row is unchanged); both
 * authorities run the same law, and a migrated host starts with none and learns again at its first refused round.
 */
interface StationHold { target: AuxiliaryEntity | null; untilS: number; aim: boolean; x: number; y: number; z: number;
  hull: number; turret: number; range: number; share: number }
const HOLD_SLOTS = 4, HOLD_S = 4, HOLD_MOVING_S = 1, AIM_S = 4, HOLD_TURN_RAD = .3, AIM_TURN_RAD = .14, HOLD_RANGE = .25,
  HOLD_SHARE_RISE = .15;
const stationHolds = new WeakMap<AuxiliaryStationState, StationHold[]>();
let holdHull = 0, holdTurret = 0, holdRange = 0;
/** The shooter's bearing in the target's hull and turret frames and its range (module scratch holdHull/Turret/Range). */
function holdGeometry(shooter: AuxiliaryEntity, target: AuxiliaryEntity): void {
  const s = target.state, dx = shooter.state.pos.x - s.pos.x, dz = shooter.state.pos.z - s.pos.z;
  const bearing = Math.atan2(dx, dz);
  holdHull = wrap(bearing - s.yaw); holdTurret = wrap(bearing - s.yaw - s.turretYaw); holdRange = Math.hypot(dx, dz);
}
const judgeCentre = new Vector3(), judgeFrom = new Vector3(), judgeArrive = new Vector3();
/** A lapsed hold judged again in place, without laying on the target: the round the station would fire at its centre
 * (laidLine: the line it would fly, its lane and the world clear from that muzzle), then its faces (aimSearch). Renews
 * the hold, turns it into an aim point, or clears it (the centre hurts). */
function judgeInPlace(slot: StationHold, station: AuxiliaryStationState, shooter: AuxiliaryEntity, target: AuxiliaryEntity,
  now: number, share: number, gun: RoofGunMount, profile: AuxiliaryWeaponProfile, context: GunContext): StationHold | null {
  judgeCentre.set(target.state.pos.x, target.state.pos.y + (target.spec.dims?.heightM ?? 2.5) * .5, target.state.pos.z);
  if (laidLine(gun, profile, shooter, judgeCentre, judgeFrom, judgeArrive)
    && laneClear(shooter, target, context, judgeFrom, judgeCentre) && context.clear(judgeFrom, judgeCentre)
    && hullsClear(shooter, target, context, judgeFrom, layDir, judgeFrom.distanceTo(judgeCentre), profile)
    && robustHurtChance(target, judgeFrom, judgeArrive, profile) >= HURT_FLOOR) {
    slot.target = null;
    return null;
  }
  return rememberHold(station, shooter, target, now, aimSearch(gun, profile, shooter, target, origin, context), share);
}
/** The station's standing hold or aim point on `target`, or null. `share`: the target's defeatable share as the scan
 * reads it now (NaN: not read). With the scan's station (`gun`, `profile`, `context`), a lapsed hold is judged again in
 * place (judgeInPlace); otherwise a lapsed slot is cleared. */
function stationHold(station: AuxiliaryStationState, shooter: AuxiliaryEntity, target: AuxiliaryEntity, now: number, share = NaN,
  gun?: RoofGunMount, profile?: AuxiliaryWeaponProfile, context?: GunContext): StationHold | null {
  const slots = stationHolds.get(station);
  if (!slots) return null;
  for (const slot of slots) {
    if (slot.target !== target) continue;
    if (target.combat.destroyed) { slot.target = null; return null; }
    holdGeometry(shooter, target);
    const turned = Math.max(Math.abs(wrap(holdHull - slot.hull)), Math.abs(wrap(holdTurret - slot.turret)));
    if (now < slot.untilS && Math.abs(holdRange - slot.range) <= HOLD_RANGE * Math.max(slot.range, 10)
      && (slot.aim ? turned <= AIM_TURN_RAD : turned <= HOLD_TURN_RAD && !(share > slot.share + HOLD_SHARE_RISE))) return slot;
    if (!slot.aim && gun && profile && context) return judgeInPlace(slot, station, shooter, target, now, share, gun, profile, context);
    slot.target = null;
    return null;
  }
  return null;
}
/** Records a refused round, from the geometry as it stands now: lay on aimSearch's point (`aim`) or hold the target. */
function rememberHold(station: AuxiliaryStationState, shooter: AuxiliaryEntity, target: AuxiliaryEntity, now: number, aim: boolean,
  share: number): StationHold {
  let slots = stationHolds.get(station);
  if (!slots) {
    slots = Array.from({ length: HOLD_SLOTS }, () => ({ target: null, untilS: 0, aim: false, x: 0, y: 0, z: 0, hull: 0, turret: 0,
      range: 0, share: 0 }));
    stationHolds.set(station, slots);
  }
  // the target's own slot, else an empty one, else the one that lapses first
  let slot: StationHold | null = null, empty: StationHold | null = null, oldest = slots[0]!;
  for (const candidate of slots) {
    if (candidate.target === target) { slot = candidate; break; }
    if (!candidate.target) empty ??= candidate;
    else if (candidate.untilS < oldest.untilS) oldest = candidate;
  }
  slot ??= empty ?? oldest;
  if (aim) { slot.x = aimX; slot.y = aimY; slot.z = aimZ; }
  slot.target = target; slot.aim = aim; slot.share = share;
  return refreshHold(slot, shooter, target, now);
}
/** A slot renewed from the geometry as it stands now (a hold for HOLD_S, HOLD_MOVING_S on a target driving, turning or
 * slewing its turret, whose faces come round sooner; an aim point, after each round into it, for AIM_S). */
function refreshHold(slot: StationHold, shooter: AuxiliaryEntity, target: AuxiliaryEntity, now: number): StationHold {
  holdGeometry(shooter, target);
  const s = target.state, moving = Math.abs(s.speed ?? 0) > .5 || Math.abs(s.yawRate ?? 0) > .05 || Math.abs(s.turretYawRate ?? 0) > .05;
  slot.untilS = now + (slot.aim ? AIM_S : moving ? HOLD_MOVING_S : HOLD_S);
  slot.hull = holdHull; slot.turret = holdTurret; slot.range = holdRange;
  return slot;
}
/** Independent weapon-specific bursts. Only spotted enemies with a clear firing lane qualify. */
export function stepRoofGun(entity: AuxiliaryEntity, now: number, dt: number, context: GunContext): boolean {
  if (entity.aerial?.kind === 'gunship') return false;
  const gun = auxiliaryCapabilities(entity.spec)?.guns[0];
  const state = entity.combat.auxiliary ?? (gun ? auxiliaryState(entity) : undefined);
  entity.state.roofGunYaw = state?.gunYaw ?? 0;
  entity.state.roofGunPitch = state?.gunPitch ?? 0;
  if (!state?.gunOn || !gun || entity.combat.destroyed || entity.modeActive === false) return false;
  const damage = entity.combat.modules?.roofGun?.state;
  if (damage === 'red') { state.gunOn = false; return false; }
  const fired = stepStation(entity, gun, state, damage, now, dt, context);
  entity.state.roofGunYaw = state.gunYaw; entity.state.roofGunPitch = state.gunPitch;
  return fired;
}
/** VH.02 (the owner's "no non-functional guns"): station `index` (1 or later) of a multi-station vehicle — the M551A1
 * TTS's roof M2 beside its 30 mm — aims, picks its own target and fires its own bursts. On/off (the B toggle, the bots'
 * toggle), damage and the roofGun module are the vehicle's one roof-gun system, so a red module silences every station.
 * Fills auxiliaryShot when it fires; station 0 is stepRoofGun. */
export function stepRoofStation(entity: AuxiliaryEntity, index: number, now: number, dt: number, context: GunContext): boolean {
  if (index < 1 || entity.aerial?.kind === 'gunship') return false;
  const guns = auxiliaryCapabilities(entity.spec)?.guns, gun = guns?.[index], state = entity.combat.auxiliary;
  if (!gun || !state?.gunOn || entity.combat.destroyed || entity.modeActive === false) return false;
  const damage = entity.combat.modules?.roofGun?.state;
  if (damage === 'red') return false;
  const station = (state.stations ??= guns.slice(1).map(stationState))[index - 1];
  return !!station && stepStation(entity, gun, station, damage, now, dt, context);
}
/** A station's barrel in plan (owner-frame x/z), pivot to muzzle at `yaw` (module scratch a/b). */
const planA = new Vector3(), planB = new Vector3(), planQ = new Quaternion(), planAt = new Vector3();
function barrelPlan(gun: RoofGunMount, yaw: number, a: Vector3, b: Vector3): void {
  planQ.fromArray(gun.rotation);
  planAt.fromArray(gun.position);
  a.fromArray(gun.pivot).applyAxisAngle(yAxis, yaw).applyQuaternion(planQ).add(planAt);
  b.fromArray(gun.muzzle).applyAxisAngle(yAxis, yaw).applyQuaternion(planQ).add(planAt);
}
const otherA = new Vector3(), otherB = new Vector3();
/** Closest distance between two plan segments (x/z). */
function planSegmentGap(a: Vector3, b: Vector3, c: Vector3, d: Vector3): number {
  const ux = b.x - a.x, uz = b.z - a.z, vx = d.x - c.x, vz = d.z - c.z, wx = a.x - c.x, wz = a.z - c.z;
  const A = ux * ux + uz * uz, B = ux * vx + uz * vz, C = vx * vx + vz * vz, D = ux * wx + uz * wz, E = vx * wx + vz * wz;
  const den = A * C - B * B;
  let s = den > 1e-12 ? Math.min(1, Math.max(0, (B * E - C * D) / den)) : 0;
  let t = C > 1e-12 ? Math.min(1, Math.max(0, (B * s + E) / C)) : 0;
  s = A > 1e-12 ? Math.min(1, Math.max(0, (B * t - D) / A)) : 0;
  const dx = wx + s * ux - t * vx, dz = wz + s * uz - t * vz;
  return Math.hypot(dx, dz);
}
/** VH.02 traverse interlock on a multi-station roof: a station never turns its barrel across another station's barrel
 * in plan (their radii plus 4 cm), whatever either one's pitch, so two working stations cannot sweep through each other
 * (the static stock is the traverse arcs' business). Deterministic: the other stations' current yaws. */
function stationTraverseClear(entity: AuxiliaryEntity, gun: RoofGunMount, yaw: number): boolean {
  const guns = auxiliaryCapabilities(entity.spec)?.guns, state = entity.combat.auxiliary;
  if (!guns || guns.length < 2 || !state) return true;
  barrelPlan(gun, yaw, planA, planB);
  const r = Math.max(.03, gun.caliberMm * .0016);
  for (let i = 0; i < guns.length; i++) {
    const other = guns[i]!;
    if (other === gun || other.owner !== gun.owner) continue;
    const otherYaw = i === 0 ? state.gunYaw : state.stations?.[i - 1]?.gunYaw ?? 0;
    barrelPlan(other, otherYaw, otherA, otherB);
    if (planSegmentGap(planA, planB, otherA, otherB) < r + Math.max(.03, other.caliberMm * .0016) + .04) return false;
  }
  return true;
}
/** The launch interlock's park: the station turns towards its rest bearing (yaw 0, inside every arc) and levels at its
 * rates, keeping the multi-station interlock and the depression table. */
function parkStation(entity: AuxiliaryEntity, gun: RoofGunMount, state: AuxiliaryStationState, profile: AuxiliaryWeaponProfile,
  dt: number): void {
  const arc = gun.yawArc, turn = arc ? -state.gunYaw : wrap(-state.gunYaw);
  const step = state.gunYaw + Math.max(-dt * profile.yawRateRadS, Math.min(dt * profile.yawRateRadS, turn));
  const nextYaw = arc ? Math.min(arc[1], Math.max(arc[0], step)) : wrap(step);
  if (stationTraverseClear(entity, gun, nextYaw)) state.gunYaw = nextYaw;
  state.gunPitch += Math.max(-dt * profile.pitchRateRadS, Math.min(dt * profile.pitchRateRadS, -state.gunPitch));
  if (gun.depressionByYaw) state.gunPitch = Math.max(state.gunPitch, -depressionAt(gun, state.gunYaw, profile.depressionRad));
}
/** One station's aim and burst (AuxiliaryState is its own first station: the same four fields). A station with a
 * traverse arc (gun.yawArc, mount-local radians, unwrapped) only takes targets inside it and turns the long way round
 * rather than through the stock the arc keeps it clear of. */
function stepStation(entity: AuxiliaryEntity, gun: RoofGunMount, state: AuxiliaryStationState, damage: string | undefined,
  now: number, dt: number, context: GunContext): boolean {
  const handling = damage === 'yellow' ? .5 : 1;
  const profile=auxiliaryWeaponProfile(gun.caliberMm,entity.spec.id);
  // VH.14 launch interlock (coordinator ruling 2026-10-15): while the vehicle's own drone launches, every roof station
  // turns back to its rest bearing and levels, and holds fire, so the launch column only has to clear the guns at rest
  // (missionAttachment.ts missionAttachmentMotionClear; the T-62MV's and Type 59's stands beside their DShK)
  if (entity.aerial?.kind === 'drone' && entity.aerial.launching) { parkStation(entity, gun, state, profile, dt * handling); return false; }
  base.copy(mountFrame(entity, gun.owner));
  gunMatrix.compose(targetPoint.fromArray(gun.position),quaternion.fromArray(gun.rotation),one);base.multiply(gunMatrix);
  inverse.copy(base).invert();pivot.fromArray(gun.pivot);mountScale.fromArray(gun.scale);
  origin.copy(pivot).multiply(mountScale).applyMatrix4(base);
  // VH.15 counter-drone: an enemy drone in flight inside the station's counter-drone range, arc, lay and line comes first
  const drone = context.counterDrone ? selectDroneTarget(entity, context, gun, profile) : null;
  if (drone) {
    const range = aimPoint.distanceTo(origin);
    const fired = aimAndFire(entity, gun, state, profile, aimPoint, null, damage, now, dt, handling, context);
    if (fired) context.droneHit?.(drone, droneStrikeChance(profile, range), entity);
    return fired;
  }
  scanGun = gun; engageWeapon = profile; scanStation = state; scanShooter = entity; scanNow = now; scanContext = context;
  const target = selectRoofTarget(entity, context, profile.rangeM, origin, stationAccepts);
  scanGun = null; engageWeapon = null; scanStation = null; scanShooter = null; scanContext = null;
  if(!target)return false;
  // VH.14 hold fire: a target refused at its centre is laid on at the point of its faces where a round hurts, led to
  // where it will stand when the round arrives; so is one whose centre lies below the mount's depression
  let hold = stationHold(state, entity, target, now);
  if (!hold) {
    aimPoint.set(target.state.pos.x,target.state.pos.y+(target.spec.dims?.heightM??2.5)*.5,target.state.pos.z);
    if (!stationLay(gun, profile, aimPoint)) {
      hold = rememberHold(state, entity, target, now, aimSearch(gun, profile, entity, target, origin, context),
        defeatableShare(target, origin.x, origin.z, engagePenMm(profile, target)));
      if (!hold.aim) return false;
    }
  }
  const aim = !!hold?.aim;
  if (hold?.aim) arrivalPoint(target, hold.x, hold.y, hold.z,
    meetS(Math.hypot(target.state.pos.x - origin.x, target.state.pos.y - origin.y, target.state.pos.z - origin.z) / profile.shell.velocityMps), aimPoint);
  else aimPoint.set(target.state.pos.x,target.state.pos.y+(target.spec.dims?.heightM??2.5)*.5,target.state.pos.z);
  return aimAndFire(entity, gun, state, profile, aimPoint, target, damage, now, dt, handling, context, aim);
}
/** VH.15: the share of a strike one round lands on a small drone at `range` metres: the weapon profile's droneHitAt100
 * falling with the square of the range (a drone's presented area against the burst's spread), at most droneHitMax. */
export function droneStrikeChance(profile: AuxiliaryWeaponProfile, range: number): number {
  return Math.min(profile.droneHitMax, profile.droneHitAt100 * (100 / Math.max(range, 15)) ** 2);
}
const dronePoint = new Vector3(), aimPoint = new Vector3();
/** VH.15: the nearest enemy drone in flight (not launching) inside the station's counter-drone range that the station
 * can lay on (stationLay: its traverse arc, depression and elevation; 2026-10-19: a drone overhead past the elevation no
 * longer holds the station off the vehicles) with a clear line from the mount; leaves its position in aimPoint (module
 * scratch). Deterministic: entity order breaks ties. */
function selectDroneTarget(entity: AuxiliaryEntity, context: GunContext, gun: RoofGunMount,
  profile: AuxiliaryWeaponProfile): AuxiliaryEntity | null {
  let best: AuxiliaryEntity | null = null, bestD2 = profile.counterDroneRangeM ** 2;
  for (const other of context.entities) {
    const air = other.aerial;
    if (other === entity || other.team === entity.team || !air || air.kind !== 'drone' || !air.active || air.launching) continue;
    dronePoint.set(air.x, air.y, air.z);
    const d2 = dronePoint.distanceToSquared(origin);
    if (d2 > bestD2) continue;
    if (!stationLay(gun, profile, dronePoint)) continue;
    // 2026-10-19: the friendly corridor is the drone round's too (aimAndFire); a drone behind an ally is not taken, so
    // the station turns to a vehicle it can engage instead of idling on it
    if (!friendlyLaneClear(entity, null, context.entities, origin, dronePoint) || !context.clear(origin, dronePoint)) continue;
    best = other; bestD2 = d2; aimPoint.copy(dronePoint);
  }
  return best;
}
/** A station's turn, elevation and burst at a world point (a vehicle's centre of mass or the aim point it lays on, or a
 * drone): fills auxiliaryShot when it fires. `target` is the vehicle, whose lane is checked and on which every round
 * must stand at least HURT_FLOOR's chance to hurt where it lands (roofHurtChance, from the muzzle as it stands at the
 * shot, against the target where it will be; a refused round is not fired: no shot, no flash, the burst's clock
 * untouched, and the station lays on the point of the target's faces where a round hurts or holds it, rememberHold);
 * null for a drone overhead. `aim`: the point is the station's aim point on the target (a refusal there holds it). */
function aimAndFire(entity: AuxiliaryEntity, gun: RoofGunMount, state: AuxiliaryStationState, profile: AuxiliaryWeaponProfile,
  point: Vector3, target: AuxiliaryEntity | null, damage: string | undefined, now: number, dt: number, handling: number,
  context: GunContext, aim = false): boolean {
  const arc = gun.yawArc;
  direction.copy(point).sub(origin);
  localTarget.copy(origin).add(direction).applyMatrix4(inverse);
  const bearing=Math.atan2(localTarget.x,localTarget.z), desiredYaw=arc?arcYaw(arc,bearing):bearing;
  if(Number.isNaN(desiredYaw))return false;
  localTarget.applyAxisAngle(yAxis,-bearing).divide(mountScale).sub(pivot);
  const desiredPitch=Math.atan2(localTarget.y,Math.hypot(localTarget.x,localTarget.z));
  if(desiredPitch < -depressionAt(gun,desiredYaw,profile.depressionRad) || desiredPitch > profile.elevationRad)return false;
  const turn=arc?desiredYaw-state.gunYaw:wrap(desiredYaw-state.gunYaw), pitch=desiredPitch-state.gunPitch;
  const step=state.gunYaw+Math.max(-dt*handling*profile.yawRateRadS,Math.min(dt*handling*profile.yawRateRadS,turn));
  const nextYaw=arc?Math.min(arc[1],Math.max(arc[0],step)):wrap(step);
  // VH.14: every multi-station roof (the Abrams' commander and loader, a Merkava's two roof guns) keeps the interlock,
  // not only the arc-limited TTS stations: a station holds rather than sweep its barrel through another's
  if(!stationTraverseClear(entity,gun,nextYaw))return false;
  state.gunYaw=nextYaw;
  state.gunPitch+=Math.max(-dt*handling*profile.pitchRateRadS,Math.min(dt*handling*profile.pitchRateRadS,pitch));
  // crossing the shallow sector depressed, the barrel lifts clear of the roof first
  if(gun.depressionByYaw)state.gunPitch=Math.max(state.gunPitch,-depressionAt(gun,state.gunYaw,profile.depressionRad));
  if(Math.abs(turn)>.035||Math.abs(pitch)>.035||now<state.nextShot)return false;
  const cp=Math.cos(state.gunPitch);
  // THREE applies local scale before the animated yaw. Doing the reverse
  // displaced the stretched Challenger mount muzzle by over 12 cm.
  direction.set(0,Math.sin(state.gunPitch),cp).multiply(mountScale)
    .applyAxisAngle(yAxis,state.gunYaw).transformDirection(base);
  bore.fromArray(gun.muzzle).sub(pivot).applyAxisAngle(xAxis,-state.gunPitch).add(pivot);
  bore.multiply(mountScale).applyAxisAngle(yAxis,state.gunYaw);origin.copy(bore).applyMatrix4(base);
  // Recheck from the actual moving muzzle, not merely the mount center.
  targetPoint.copy(point);
  const settled=Math.abs(arc?desiredYaw-state.gunYaw:wrap(desiredYaw-state.gunYaw))<=1e-4&&Math.abs(desiredPitch-state.gunPitch)<=1e-4;
  if((target?!laneClear(entity,target,context,origin,targetPoint):!friendlyLaneClear(entity,null,context.entities,origin,targetPoint))
    ||!context.clear(origin,targetPoint)||(target&&!hullsClear(entity,target,context,origin,direction,origin.distanceTo(targetPoint),profile))){
    // VH.14 hold fire (2026-10-19): a settled bore whose line to the vehicle is blocked at the muzzle (another vehicle's
    // armour, a gun barrel swung across the lane included) holds that vehicle (judged again in place when the hold lapses)
    // instead of idling on it
    if(target&&settled)rememberHold(state,entity,target,now,false,
      defeatableShare(target,origin.x,origin.z,penAtDistanceMm(profile.shell,origin.distanceTo(targetPoint))/profile.engagePenRatio));
    return false;
  }
  // VH.14 hold fire (owner 2026-10-19): every round is judged where it lands — along the line it would leave on (this
  // muzzle, the bore as it stands, its drop over the flight) against the target where it will stand when the round
  // arrives (its speed, heading and turn), with the round's chance over its pen roll and the modules it reaches
  if(target){
    const range=origin.distanceTo(targetPoint), flight=range/profile.shell.velocityMps;
    boreEnd.copy(origin).addScaledVector(direction,range);
    boreEnd.y-=.5*shellGravityMps2(profile.shell)*(entity.modeGravityScale??1)*flight*flight;
    if(robustHurtChance(target,origin,boreEnd,profile)<HURT_FLOOR){
      // a barrel still settling on its lay (the step that lays it is the step that fires) holds this round only: the
      // verdict of a settled bore decides. Refused at the centre: the point of the target's faces where a round from
      // this muzzle most likely hurts (aimSearch); refused at that point: held
      if(!settled)return false;
      const share=defeatableShare(target,origin.x,origin.z,penAtDistanceMm(profile.shell,range)/profile.engagePenRatio);
      rememberHold(state,entity,target,now,!aim&&aimSearch(gun,profile,entity,target,origin,context),share);
      return false;
    }
    const hold=aim?stationHold(state,entity,target,now):null;
    if(hold)refreshHold(hold,entity,target,now);
  }
  auxiliaryShot.shell=profile.shell;
  state.shots++; state.nextShot=now+(damage === 'yellow' ? 1.6 : 1)*(state.shots%profile.burstRounds===0?profile.burstPauseS:profile.shotIntervalS);
  return true;
}

/** The roof gun's candidates, nearest first (module scratch, one scan at a time). */
const roofCandidates: AuxiliaryEntity[] = [], roofCandidateDistance: number[] = [];
/** The nearest spotted enemy in range with a clear lane from `from` (ties: the first in entity order). The candidates
 * are ordered by distance before any lane test, so the tests (a smoke check and a world ray each) stop at the first
 * that passes: the target the one-pass scan chose, with fewer rays (2026-10-13, the MP stream: the authority's tick —
 * every bot's roof gun scans every tick). */
export function selectRoofTarget(entity: AuxiliaryEntity, context: GunContext, rangeM:number, from: Vector3 = origin,
  accept?: (target: AuxiliaryEntity) => boolean): AuxiliaryEntity | null {
  const range2=rangeM*rangeM;
  let count=0;
  for (const other of context.entities) {
    if(other===entity || other.team===entity.team || other.combat.destroyed || other.modeActive===false || !context.visible(other,entity)) continue;
    targetPoint.set(other.state.pos.x,other.state.pos.y+(other.spec.dims?.heightM??2.5)*.5,other.state.pos.z);
    const distance=from.distanceToSquared(targetPoint);
    if(!(distance < range2)) continue;
    if(accept && !accept(other)) continue;
    let slot=count++;
    for(;slot>0&&roofCandidateDistance[slot-1]!>distance;slot--){roofCandidates[slot]=roofCandidates[slot-1]!;roofCandidateDistance[slot]=roofCandidateDistance[slot-1]!;}
    roofCandidates[slot]=other;roofCandidateDistance[slot]=distance;
  }
  for (let index=0;index<count;index++) {
    const other=roofCandidates[index]!;
    targetPoint.set(other.state.pos.x,other.state.pos.y+(other.spec.dims?.heightM??2.5)*.5,other.state.pos.z);
    if(laneClear(entity,other,context,from,targetPoint) && context.clear(from,targetPoint))return other;
  }
  return null;
}

/** The lane from `a` to the target's point `b`: no ally inside the friendly-fire corridor (3 m in plan, 2.5 m in
 * height), and (VH.14 hold fire, 2026-10-19) no hull the round would strike before the target — a wreck (inert cover,
 * sim/damage.ts resolveWreckHit) or another enemy the shooter's side sees (spotting: a hidden hull is never read) —
 * inside its hull box. */
function laneClear(shooter:AuxiliaryEntity,target:AuxiliaryEntity,context:GunContext,a:Vector3,b:Vector3):boolean{
  if(!friendlyLaneClear(shooter,target,context.entities,a,b))return false;
  for(const other of context.entities){
    if(other===shooter||other===target||other.modeActive===false||other.team===shooter.team)continue;
    if(other.aerial?.kind==='gunship'||!segmentMeetsHull(other,a,b))continue;
    if(other.combat.destroyed||context.visible(other,shooter))return false;
  }return true;
}
/** The friendly-fire corridor: no ally (a wreck of the shooter's side too) within 3 m in plan and 2.5 m in height of the
 * lane a→b, nor its hull box across the lane (segmentMeetsHull). A round at a drone keeps it as well (2026-10-19: the
 * counter-drone lane read no ally before). */
function friendlyLaneClear(shooter:AuxiliaryEntity,target:AuxiliaryEntity|null,entities:readonly AuxiliaryEntity[],a:Vector3,b:Vector3):boolean{
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=dx*dx+dy*dy+dz*dz;
  for(const ally of entities){
    if(ally===shooter||ally===target||ally.team!==shooter.team||ally.modeActive===false)continue;
    const p=ally.state.pos, y=p.y+(ally.spec.dims?.heightM??2.5)*.5;
    const t=((p.x-a.x)*dx+(y-a.y)*dy+(p.z-a.z)*dz)/(length||1);
    if(t>0&&t<1&&(a.x+t*dx-p.x)**2+(a.z+t*dz-p.z)**2<9&&Math.abs(a.y+t*dy-y)<2.5)return false;
    // 2026-10-19: and its hull box (a long hull reaches past the corridor round its centre)
    if(segmentMeetsHull(ally,a,b))return false;
  }return true;
}
/** Does the segment a→b pass through the hull box of `other` (its yaw, footprint and height; the spec's dims, the
 * mode's scale) strictly before b? Slab test in the hull's plan frame; no allocation. */
function segmentMeetsHull(other:AuxiliaryEntity,a:Vector3,b:Vector3):boolean{
  // the spec's dims carry the mode's scale already (sim/juggernautScale.ts)
  const s=other.state, dims=other.spec.dims;
  const hw=(dims?.widthM??3.4)*.5, hl=(dims?.hullLengthM??6.6)*.5, h=dims?.heightM??2.5;
  const c=Math.cos(s.yaw), n=Math.sin(s.yaw);
  const ax=a.x-s.pos.x, az=a.z-s.pos.z, bx=b.x-s.pos.x, bz=b.z-s.pos.z;
  const lax=ax*c-az*n, laz=ax*n+az*c, lbx=bx*c-bz*n, lbz=bx*n+bz*c;
  slabEnter=0; slabExit=1;
  return clipSlab(lax,lbx,-hw,hw)&&clipSlab(laz,lbz,-hl,hl)&&clipSlab(a.y,b.y,s.pos.y,s.pos.y+h)&&slabExit>0&&slabEnter<1;
}
const passPose: TankArmorPose = { pos: new Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0 };
const passA = new Vector3(), passB = new Vector3();
/** One tick of a flight, as sim/ballistics.ts stepShell integrates it (the drop of the mode's gravity). */
const PASS_DT = 1 / 60;
/** VH.14 hold fire (2026-10-19): no other vehicle's armour on the round's flight from `from` along `dir` to `range` — its
 * plates, gun and stowage as sim/armor.ts traceTank finds them, on each tick's swept segment of the falling round (a
 * barrel swung across the lane reaches past the friendly corridor and the hull boxes, and a round dropping a few
 * centimetres finds it where the straight bore misses), each vehicle carried along its heading at its speed and turn —
 * for an ally or a wreck of either side, or an enemy the shooter's side sees (a hidden one is never read). Only a vehicle whose swept sphere (its armour's bound or its
 * barrel's reach) the line passes is traced; the traces allocate: at a shot or a refusal only, never in the per-tick
 * scan. */
function hullsClear(shooter:AuxiliaryEntity,target:AuxiliaryEntity,context:GunContext,from:Vector3,dir:Vector3,range:number,
  profile:AuxiliaryWeaponProfile):boolean{
  const speed=profile.shell.velocityMps,gravity=shellGravityMps2(profile.shell)*(shooter.modeGravityScale??1),flight=range/speed;
  const drop=.5*gravity*flight*flight;
  for(const other of context.entities){
    const armor=other.spec.armor as ArmorModel|null|undefined;
    if(other===shooter||other===target||other.modeActive===false||!armor||other.aerial?.kind==='gunship')continue;
    if(other.team!==shooter.team&&!other.combat.destroyed&&!context.visible(other,shooter))continue;
    // the sphere the vehicle sweeps over the flight: its armour's bound (the spec's, carrying the mode's scale), or the
    // gun barrel's reach from the turret ring at any traverse (armour units, times the scale), and its travel
    const s=other.state,scale=s.modeScale??1,pivot=armor.turretPivot,drive=s.speed??0;
    const reach=Math.max(armor.boundingRadiusM??6,((armor.gunBarrel?.lengthM??0)+Math.hypot(pivot?.[0]??0,pivot?.[2]??0)+2.5)*scale);
    const radius=reach+drop+Math.abs(drive)*flight,cy=s.pos.y+(other.spec.dims?.heightM??2.5)*.5;
    const along=Math.min(range,Math.max(0,(s.pos.x-from.x)*dir.x+(cy-from.y)*dir.y+(s.pos.z-from.z)*dir.z));
    if((from.x+along*dir.x-s.pos.x)**2+(from.y+along*dir.y-cy)**2+(from.z+along*dir.z-s.pos.z)**2>radius*radius)continue;
    passPose.pitch=s.visualPitch||0;passPose.roll=s.visualRoll||0;passPose.gunPitch=s.gunPitch||0;passPose.modeScale=scale;
    passPose.roofGunYaw=s.roofGunYaw??0;passPose.roofGunPitch=s.roofGunPitch??0;
    // the flight's ticks that pass within the sphere, the vehicle carried along its heading at its speed and turn
    const t0=Math.max(0,(along-radius*1.5)/speed),t1=Math.min(flight,(along+radius*1.5)/speed);
    for(let t=Math.floor(t0/PASS_DT)*PASS_DT;t<t1;t+=PASS_DT){
      // the segment the tick from t sweeps meets the vehicle's pose of that tick (meetS)
      const u=Math.min(flight,t+PASS_DT),turn=(s.yawRate??0)*t,heading=s.yaw+turn*.5;
      passPose.pos.set(s.pos.x+Math.sin(heading)*drive*t,s.pos.y,s.pos.z+Math.cos(heading)*drive*t);
      passPose.yaw=s.yaw+turn;passPose.turretYaw=(s.turretYaw||0)+(s.turretYawRate??0)*t;
      passA.copy(from).addScaledVector(dir,speed*t);passA.y-=.5*gravity*t*t;
      passB.copy(from).addScaledVector(dir,speed*u);passB.y-=.5*gravity*u*u;
      if(traceTank(passA,passB,passPose,armor,other.combat.eraSpent).length)return false;
    }
  }return true;
}
/** segmentMeetsHull's parametric interval (module scratch). */
let slabEnter=0, slabExit=1;
function clipSlab(from:number,to:number,min:number,max:number):boolean{
  const d=to-from;
  if(Math.abs(d)<1e-9)return from>=min&&from<=max;
  let enter=(min-from)/d, exit=(max-from)/d;
  if(enter>exit){const swap=enter;enter=exit;exit=swap;}
  if(enter>slabEnter)slabEnter=enter; if(exit<slabExit)slabExit=exit;
  return slabEnter<=slabExit;
}
