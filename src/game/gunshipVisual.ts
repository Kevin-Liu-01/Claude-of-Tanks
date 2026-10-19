import * as THREE from 'three';

/** (ac130-fx-228) The airframe's lit material joins the battle's cascade setup (engineCtx.setupShadowMaterial), as every
 *  lit material in the scene must; the FX runtime installs the hooks when it is built (effects.ts, as it does the
 *  drones'), before any battle frame can show the airframe. */
interface GunshipMaterialHooks { setup(material: THREE.Material): void; release(material: THREE.Material): void }
let materialHooks: GunshipMaterialHooks | null = null;
export function configureGunshipMaterials(hooks: GunshipMaterialHooks | null): void { materialHooks = hooks; }

/**
 * (ac130-fx-228 r2) The airframe itself is gunshipAirframe.ts, its own chunk: this module (the flight anchor every
 * roster needs) ships with the boot set, the model loads with an AC-130 battle. The covered entry awaits the load and
 * stages the airframe for its scene compile (stageGunshipVisual); a sync before the load lands asks for it.
 */
interface Airframe { root: THREE.Group; spin(dt: number): void; dispose(): void }
let build: ((hooks: GunshipMaterialHooks | null) => Airframe) | null = null;
let loading: Promise<void> | null = null;
export function loadGunshipAirframe(): Promise<void> {
  loading ??= import('./gunshipAirframe.ts').then((module) => { build = module.buildGunshipAirframe; }, (error: unknown) => {
    loading = null; // the next sync asks again
    console.warn('[gunship] the airframe did not load:', error);
  });
  return loading;
}

const aircraft = new WeakMap<THREE.Object3D, Airframe>();
/** the pylon turn's bank: the port wing (+x, the guns' side) down toward the orbit's centre */
export const GUNSHIP_BANK_RAD = -0.3;

function airframeOf(tankRoot: THREE.Object3D): Airframe | null {
  const known = aircraft.get(tankRoot);
  if (known) return known;
  if (!build) { void loadGunshipAirframe(); return null; }
  const built = build(materialHooks);
  const release = (): void => {
    built.dispose();
    aircraft.delete(tankRoot);
    tankRoot.removeEventListener('removed', release);
  };
  const model: Airframe = { root: built.root, spin: built.spin, dispose: release };
  aircraft.set(tankRoot, model);
  tankRoot.addEventListener('removed', release);
  return model;
}

/** An orbiting four-engine gunship replaces the tank exterior in aerial mode. (ac130-fx-228) The caller hides the pilot's
 *  own airframe while its gimbal lens (inside the airframe, at the orbit centre) is the camera. */
export function syncGunshipVisual(tankRoot: THREE.Object3D, position: THREE.Vector3, yaw: number, dt: number, visible: boolean): void {
  const model = airframeOf(tankRoot);
  if (model) {
    if (tankRoot.parent && model.root.parent !== tankRoot.parent) tankRoot.parent.add(model.root);
    model.root.visible = visible;
    model.root.position.copy(position);
    model.root.rotation.set(0, yaw, GUNSHIP_BANK_RAD);
    model.spin(dt);
  }
  tankRoot.visible = false;
}

/** (ac130-fx-228 r2) The covered entry: the airframe built, posed and shown for the scene compile under the cover (it is
 *  first seen mid-battle, in a replay or the ending's orbit); null until gunshipAirframe.ts has loaded. */
export function stageGunshipVisual(tankRoot: THREE.Object3D, position: THREE.Vector3, yaw: number): THREE.Object3D | null {
  syncGunshipVisual(tankRoot, position, yaw, 0, true);
  return aircraft.get(tankRoot)?.root ?? null;
}

export function hideGunshipVisual(tankRoot: THREE.Object3D): void { const model=aircraft.get(tankRoot);if(model)model.root.visible=false; }

/** Aircraft-only battle carrier. It never constructs a tank or its textures. */
export function createGunshipBattleVisual(specId: string) {
  const root = new THREE.Group();
  root.name = 'AC-130 flight anchor';
  root.userData.aircraftOnly = true;
  const worldPosition = (out: THREE.Vector3) => root.getWorldPosition(out);
  return {
    specId, root,
    setVisible(visible: boolean) { root.visible = visible; if (!visible) hideGunshipVisual(root); },
    syncFromState(state: { pos: THREE.Vector3; yaw: number }) {
      root.position.copy(state.pos); root.rotation.set(0, state.yaw, 0);
    },
    turretTopWorld: worldPosition, gunPivotWorld: worldPosition, gunMuzzleWorld: worldPosition,
    gunDirWorld(out: THREE.Vector3) { return out.set(0, 0, 1).applyQuaternion(root.quaternion); },
    dispose() { aircraft.get(root)?.dispose(); root.removeFromParent(); },
  };
}
