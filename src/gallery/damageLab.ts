import * as THREE from 'three';
import { createCombatState, type ModuleStateName } from '../sim/damage.ts';
import { createTankState } from '../sim/movement.ts';
import { traceTank, type ArmorModel, type ArmorPlate } from '../sim/armor.ts';
import type { ModuleId } from '../sim/moduleCatalog.ts';
import type { getSpec } from '../vehicles/specs.ts';
import type { createTank } from '../vehicles/fleetFactory.ts';

export type DamageLabSpec = ReturnType<typeof getSpec>;
export type DamageLabVisual = Pick<ReturnType<typeof createTank>, 'root' | 'stripEra' | 'resetEra' | 'setTrackState' | 'setWeaponModuleState' | 'setDestroyed' | 'resetForGaragePresentation' | 'syncFromState' | 'setGroundSampler'>;
export type DamageAction = 'damage' | 'disable' | 'remove' | 'detonate' | 'repair';
export interface DamageTarget {
  key: string;
  kind: 'era' | 'equipment' | 'module' | 'crew';
  name: string;
  owner: 'hull' | 'turret';
  module?: ModuleId;
  plate?: ArmorPlate;
}

function removablePlates(spec: DamageLabSpec, owner: 'hull' | 'turret'): readonly ArmorPlate[] {
  const armor = spec.armor;
  const body = owner === 'hull' ? armor.hullPlates : armor.turretPlates;
  return [...body || [], ...armor.droneScreens?.[owner] || []];
}

/** A disposable Gallery specimen. Registry specs and saved/battle state are never mutated. */
export function createDamageLab(spec: DamageLabSpec, visual: DamageLabVisual, floorY: number) {
  let combat = createCombatState(spec);
  const pose = createTankState(spec, visual.root.position.clone(), visual.root.rotation.y);
  const removed = new Set<string>();
  const clusters = new Set<string>(visual.root.userData.eraClusterNames || []);
  const targets: DamageTarget[] = [];
  for (const owner of ['hull', 'turret'] as const) {
    for (const plate of removablePlates(spec, owner)) {
      if (!clusters.has(plate.name) || targets.some(target => target.key === `plate:${plate.name}`)) continue;
      targets.push({ key: `plate:${plate.name}`, name: plate.name, kind: plate.kind === 'era' ? 'era' : 'equipment', owner, plate });
    }
  }
  for (const module of Object.keys(combat.modules) as ModuleId[]) {
    const volume = spec.armor?.modules?.find(part => part.module === module);
    targets.push({ key: `module:${module}`, name: module, kind: 'module', module, owner: volume?.turretLocal ? 'turret' : 'hull' });
  }
  for (const name of Object.keys(combat.crew)) {
    const volume = spec.armor?.crew?.find(part => part.crew === name);
    targets.push({ key: `crew:${name}`, name, kind: 'crew', owner: volume?.turretLocal ? 'turret' : 'hull' });
  }
  let selected = targets[0]?.key || '';
  let animationActive = false;
  visual.setGroundSampler(() => floorY);

  function condition(target: DamageTarget): 'ok' | 'yellow' | 'red' | 'removed' {
    if (target.plate) return removed.has(target.name) ? 'removed' : 'ok';
    if (target.module) return combat.modules[target.module]?.state || 'ok';
    return combat.crew[target.name] ? 'ok' : 'red';
  }
  function setModule(module: ModuleId, state: ModuleStateName): void {
    const part = combat.modules[module];
    if (!part) return;
    part.state = state; part.hp = state === 'ok' ? part.maxHp : state === 'yellow' ? part.maxHp * .4 : 0;
    part.repairT = 0;
    visual.setWeaponModuleState(module, state);
    if (module === 'trackL' || module === 'trackR') {
      visual.setTrackState(module, state === 'red');
      animationActive = true;
    }
  }
  function repair(target: DamageTarget): void {
    if (target.plate) {
      removed.delete(target.name); combat.eraSpent.delete(target.name);
      visual.resetEra();
      for (const name of removed) visual.stripEra(name);
    } else if (target.module) setModule(target.module, 'ok');
    else combat.crew[target.name] = true;
  }
  function apply(action: DamageAction, key = selected): boolean {
    const target = targets.find(part => part.key === key);
    if (!target || combat.destroyed) return false;
    if (action === 'repair') { repair(target); return true; }
    if (target.plate) {
      if (!['remove', 'detonate'].includes(action) || removed.has(target.name)) return false;
      if (action === 'detonate' && target.kind !== 'era') return false;
      if (!visual.stripEra(target.name)) return false;
      removed.add(target.name); combat.eraSpent.add(target.name); return true;
    }
    if (action !== 'damage' && action !== 'disable') return false;
    if (target.module) setModule(target.module, action === 'disable' ? 'red' : 'yellow');
    else combat.crew[target.name] = false;
    return true;
  }
  function armor(): ArmorModel {
    const source = spec.armor;
    // Non-ERA destructibles use the same exact named visual binding. Remove
    // those surfaces from this specimen's query model, never from the registry.
    return { ...source,
      hullPlates: source.hullPlates?.filter(part => !removed.has(part.name)),
      turretPlates: source.turretPlates?.filter(part => !removed.has(part.name)),
      droneScreens: source.droneScreens && {
        hull: source.droneScreens.hull?.filter(part => !removed.has(part.name)),
        turret: source.droneScreens.turret?.filter(part => !removed.has(part.name)),
      },
    };
  }
  function syncPose(): void {
    pose.pos.copy(visual.root.position); pose.yaw = visual.root.rotation.y;
    pose.turretYaw = visual.root.getObjectByName('rig_turret')?.rotation.y || 0;
    pose.gunPitch = -(visual.root.getObjectByName('rig_gun')?.rotation.x || 0);
  }
  return {
    targets,
    get selected() { return selected; },
    get combat() { return combat; },
    condition, armor, apply, syncPose,
    select(key: string) { if (targets.some(part => part.key === key)) selected = key; },
    removeAll() { for (const target of targets) if (target.plate) apply('remove', target.key); },
    destroy() { if (combat.destroyed) return; combat.destroyed = true; combat.hp = 0; syncPose(); visual.setDestroyed({ pop: true, ageS: 0 }); animationActive = true; },
    reset() {
      visual.resetForGaragePresentation(); removed.clear(); combat = createCombatState(spec);
      for (const target of targets) if (target.module) setModule(target.module, 'ok');
      visual.setGroundSampler(() => floorY); animationActive = false;
    },
    update(dt: number) { if (animationActive) visual.syncFromState(pose, Math.min(dt, .05)); },
    trace(from: THREE.Vector3, to: THREE.Vector3) {
      syncPose();
      return traceTank(from, to, { pos: pose.pos, yaw: pose.yaw, pitch: 0, roll: 0, turretYaw: pose.turretYaw, gunPitch: pose.gunPitch }, armor(), combat.eraSpent);
    },
    snapshot() { syncPose(); return { pose: { position: pose.pos.toArray(), yaw: pose.yaw, turretYaw: pose.turretYaw, gunPitch: pose.gunPitch }, selected, destroyed: combat.destroyed, removed: [...removed], parts: targets.map(target => ({ key: target.key, kind: target.kind, state: condition(target) })) }; },
    dispose() { visual.setGroundSampler(null); },
  };
}
export type DamageLab = ReturnType<typeof createDamageLab>;
