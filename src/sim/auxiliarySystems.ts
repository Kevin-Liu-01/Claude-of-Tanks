import { createSmokeCanister, smokeCloudBanks, smokeCanisterPosition, type SmokePoint, type SmokeWorld, type SmokeWorldHit } from './smokeBallistics.ts';
import { smokeClip, smokeScreenSummary } from './smokeScreen.ts';
import { Euler, Matrix4, Vector3, Quaternion } from 'three';
import { auxiliaryCapabilities, type AuxiliaryInventory } from '../vehicles/auxiliaryInventory.ts';
import { auxiliaryWeaponProfile, type AuxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';
import { penAtDistanceMm } from './ballistics.ts';
export { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import type { DamageShellSpec, CombatState } from './damage.ts';
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
  spec: { id: string; dims?: { heightM: number }; armor?: AuxiliaryArmour | null };
  state: { pos: { x: number; y: number; z: number }; yaw: number; turretYaw: number; visualPitch?: number; visualRoll?: number; roofGunYaw?: number; roofGunPitch?: number };
  combat: { destroyed?: boolean; auxiliary?: AuxiliaryState; modules?: CombatState['modules'] };
  modeActive?: boolean;
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
}
const wrap = (v:number) => Math.atan2(Math.sin(v), Math.cos(v));
type RoofGunMount = AuxiliaryInventory['guns'][number];
/** The yaw a station would need for a target, in its arc's unwrapped range, or NaN outside it (module scratch). */
let arcMount: RoofGunMount | null = null;
const arcLocal = new Vector3();
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
/** VH.14 balance: the station's weapon and range test for selectRoofTarget (module scratch, one scan at a time). */
let engageWeapon: AuxiliaryWeaponProfile | null = null;
/** selectRoofTarget's filter for a station: a target its round can hurt from here (the weapon profile's
 * engagePenRatio over the target's thinnest vertical armour) and, with a traverse arc, a bearing inside it. */
function stationAccepts(target: AuxiliaryEntity): boolean {
  if (engageWeapon) {
    const distance = Math.hypot(target.state.pos.x - origin.x, target.state.pos.z - origin.z);
    if (penAtDistanceMm(engageWeapon.shell, distance) < thinnestVerticalArmourMm(target.spec) * engageWeapon.engagePenRatio) return false;
  }
  return withinStationArc(target);
}
/** The traverse-arc half of stationAccepts: the target's bearing from the mount lies inside the station's arc. */
function withinStationArc(target: AuxiliaryEntity): boolean {
  if (!arcMount?.yawArc) return true;
  arcLocal.set(target.state.pos.x, target.state.pos.y + (target.spec.dims?.heightM ?? 2.5) * .5, target.state.pos.z).applyMatrix4(inverse);
  return !Number.isNaN(arcYaw(arcMount.yawArc, Math.atan2(arcLocal.x, arcLocal.z)));
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
/** One station's aim and burst (AuxiliaryState is its own first station: the same four fields). A station with a
 * traverse arc (gun.yawArc, mount-local radians, unwrapped) only takes targets inside it and turns the long way round
 * rather than through the stock the arc keeps it clear of. */
function stepStation(entity: AuxiliaryEntity, gun: RoofGunMount, state: AuxiliaryStationState, damage: string | undefined,
  now: number, dt: number, context: GunContext): boolean {
  const handling = damage === 'yellow' ? .5 : 1;
  const profile=auxiliaryWeaponProfile(gun.caliberMm,entity.spec.id);
  base.copy(mountFrame(entity, gun.owner));
  gunMatrix.compose(targetPoint.fromArray(gun.position),quaternion.fromArray(gun.rotation),one);base.multiply(gunMatrix);
  inverse.copy(base).invert();pivot.fromArray(gun.pivot);mountScale.fromArray(gun.scale);
  origin.copy(pivot).multiply(mountScale).applyMatrix4(base);
  const arc = gun.yawArc;
  arcMount = arc ? gun : null;
  engageWeapon = profile;
  const target = selectRoofTarget(entity, context, profile.rangeM, origin, stationAccepts);
  arcMount = null; engageWeapon = null;
  if(!target)return false;
  direction.set(target.state.pos.x,target.state.pos.y+(target.spec.dims?.heightM??2.5)*.5,target.state.pos.z).sub(origin);
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
  targetPoint.set(target.state.pos.x,target.state.pos.y+(target.spec.dims?.heightM??2.5)*.5,target.state.pos.z);
  if(!friendlyLaneClear(entity,target,context.entities,origin,targetPoint)||!context.clear(origin,targetPoint))return false;
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
    if(accept && !accept(other)) continue;
    targetPoint.set(other.state.pos.x,other.state.pos.y+(other.spec.dims?.heightM??2.5)*.5,other.state.pos.z);
    const distance=from.distanceToSquared(targetPoint);
    if(!(distance < range2)) continue;
    let slot=count++;
    for(;slot>0&&roofCandidateDistance[slot-1]!>distance;slot--){roofCandidates[slot]=roofCandidates[slot-1]!;roofCandidateDistance[slot]=roofCandidateDistance[slot-1]!;}
    roofCandidates[slot]=other;roofCandidateDistance[slot]=distance;
  }
  for (let index=0;index<count;index++) {
    const other=roofCandidates[index]!;
    targetPoint.set(other.state.pos.x,other.state.pos.y+(other.spec.dims?.heightM??2.5)*.5,other.state.pos.z);
    if(friendlyLaneClear(entity,other,context.entities,from,targetPoint) && context.clear(from,targetPoint))return other;
  }
  return null;
}

function friendlyLaneClear(shooter:AuxiliaryEntity,target:AuxiliaryEntity,entities:readonly AuxiliaryEntity[],a:Vector3,b:Vector3):boolean{
  const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=dx*dx+dy*dy+dz*dz;
  for(const ally of entities){
    if(ally===shooter||ally===target||ally.team!==shooter.team||ally.modeActive===false)continue;
    const p=ally.state.pos, y=p.y+(ally.spec.dims?.heightM??2.5)*.5;
    const t=((p.x-a.x)*dx+(y-a.y)*dy+(p.z-a.z)*dz)/(length||1);
    if(t>0&&t<1&&(a.x+t*dx-p.x)**2+(a.z+t*dz-p.z)**2<9&&Math.abs(a.y+t*dy-y)<2.5)return false;
  }return true;
}
