import { createSmokeCanister, smokeCloudBanks, smokeCanisterPosition } from './smokeBallistics.ts';
import { Euler, Matrix4, Vector3, Quaternion } from 'three';
import { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import { auxiliaryWeaponProfile } from '../vehicles/auxiliaryWeapons.ts';
export { auxiliaryCapabilities } from '../vehicles/auxiliaryInventory.ts';
import type { DamageShellSpec } from './damage.ts';

export type AuxiliaryAction = 'smoke' | 'lights' | 'roofGun' | 'lightsOff';
import type { SmokeScreen } from './smokeScreen.ts';
export type { SmokeScreen } from './smokeScreen.ts';
export { SMOKE_DURATION_S, smokeBlocks } from './smokeScreen.ts';
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
}
export interface AuxiliaryEntity {
  id: string;
  team: string;
  spec: { id: string; dims?: { heightM: number }; armor?: { turretPivot?: readonly number[] } | null };
  state: { pos: { x: number; y: number; z: number }; yaw: number; turretYaw: number; visualPitch?: number; visualRoll?: number };
  combat: { destroyed?: boolean; auxiliary?: AuxiliaryState };
  modeActive?: boolean;
}
export const SMOKE_COOLDOWN_S = 28;
export const ROOF_GUN_SHELL: DamageShellSpec = auxiliaryWeaponProfile(12.7).shell;
export function auxiliaryState(entity: Pick<AuxiliaryEntity, 'combat'>): AuxiliaryState {
  return entity.combat.auxiliary ??= {
    lights: -1, gunOn: false, gunYaw: 0, gunPitch: 0, nextShot: 0, shots: 0,
    smokeCharges: 3, smokeReadyAt: 0, smoke: null,
  };
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
    const p = entity.spec.armor?.turretPivot ?? [0, (entity.spec.dims?.heightM ?? 2.5) * .7, 0];
    local.makeRotationY(s.turretYaw); local.setPosition(p[0]!, p[1]!, p[2]!); matrix.multiply(local);
  }
  return matrix;
}
export function requestAuxiliary(entity: AuxiliaryEntity, action: AuxiliaryAction, now: number, ground?: (x:number,z:number)=>number): boolean {
  if (entity.combat.destroyed || entity.modeActive === false) return false;
  const kit = auxiliaryCapabilities(entity.spec);
  if (!kit) return false;
  const state = auxiliaryState(entity);
  if ((action === 'lights' || action === 'lightsOff') && kit.lights) { state.lights = action === 'lights' ? 1 : 0; return true; }
  if (action === 'roofGun' && kit.guns.length) { state.gunOn = !state.gunOn; return true; }
  if (action !== 'smoke' || !kit.smoke.length || !state.smokeCharges || now < state.smokeReadyAt) return false;
  const terrain=ground ?? (()=>entity.state.pos.y);
  const canisters=kit.smoke.map(socket=>{
    const frame=mountFrame(entity,socket.owner);
    origin.fromArray(socket.position).applyMatrix4(frame);
    direction.fromArray(socket.direction).transformDirection(frame);
    return createSmokeCanister(origin,direction,terrain);
  });
  targetPoint.set(0,0,0);
  for(const shot of canisters){smokeCanisterPosition(shot,shot[6],origin);targetPoint.add(origin);}
  targetPoint.multiplyScalar(1/canisters.length);
  const smokePivot=entity.spec.armor?.turretPivot??[0,(entity.spec.dims?.heightM??2.5)*.7,0];
  state.smoke={x:targetPoint.x,y:targetPoint.y+1.32,z:targetPoint.z,
    yaw:entity.state.yaw+entity.state.turretYaw,born:now,canisters,banks:smokeCloudBanks(canisters),
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
/** Independent weapon-specific bursts. Only spotted enemies with a clear firing lane qualify. */
export function stepRoofGun(entity: AuxiliaryEntity, now: number, dt: number, context: GunContext): boolean {
  const state = entity.combat.auxiliary, gun = auxiliaryCapabilities(entity.spec)?.guns[0];
  if (!state?.gunOn || !gun || entity.combat.destroyed || entity.modeActive === false) return false;
  const profile=auxiliaryWeaponProfile(gun.caliberMm,entity.spec.id);
  base.copy(mountFrame(entity, gun.owner));
  gunMatrix.compose(targetPoint.fromArray(gun.position),quaternion.fromArray(gun.rotation),one);base.multiply(gunMatrix);
  inverse.copy(base).invert();pivot.fromArray(gun.pivot);mountScale.fromArray(gun.scale);
  origin.copy(pivot).multiply(mountScale).applyMatrix4(base);
  const target = selectRoofTarget(entity, context, profile.rangeM);
  if(!target)return false;
  direction.set(target.state.pos.x,target.state.pos.y+(target.spec.dims?.heightM??2.5)*.5,target.state.pos.z).sub(origin);
  localTarget.copy(origin).add(direction).applyMatrix4(inverse);
  const desiredYaw=Math.atan2(localTarget.x,localTarget.z);
  localTarget.applyAxisAngle(yAxis,-desiredYaw).divide(mountScale).sub(pivot);
  const desiredPitch=Math.atan2(localTarget.y,Math.hypot(localTarget.x,localTarget.z));
  if(desiredPitch < -profile.depressionRad || desiredPitch > profile.elevationRad)return false;
  const turn=wrap(desiredYaw-state.gunYaw), pitch=desiredPitch-state.gunPitch;
  state.gunYaw=wrap(state.gunYaw+Math.max(-dt*profile.yawRateRadS,Math.min(dt*profile.yawRateRadS,turn)));
  state.gunPitch+=Math.max(-dt*profile.pitchRateRadS,Math.min(dt*profile.pitchRateRadS,pitch));
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
  state.shots++; state.nextShot=now+(state.shots%profile.burstRounds===0?profile.burstPauseS:profile.shotIntervalS);
  return true;
}

function selectRoofTarget(entity: AuxiliaryEntity, context: GunContext, rangeM:number): AuxiliaryEntity | null {
  let target: AuxiliaryEntity | null = null, best=rangeM*rangeM;
  for (const other of context.entities) {
    if(other===entity || other.team===entity.team || other.combat.destroyed || other.modeActive===false || !context.visible(other,entity)) continue;
    targetPoint.set(other.state.pos.x,other.state.pos.y+(other.spec.dims?.heightM??2.5)*.5,other.state.pos.z);
    const distance=origin.distanceToSquared(targetPoint);
    if(distance < best && friendlyLaneClear(entity,other,context.entities,origin,targetPoint) && context.clear(origin,targetPoint)){target=other;best=distance;}
  }
  return target;
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
