import * as THREE from 'three';
import { createLazyChunk } from '../app/lazyChunk.ts';

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
type AirframeModule = typeof import('./gunshipAirframe.ts');
let build: ((hooks: GunshipMaterialHooks | null) => Airframe) | null = null;
// (2026-11-02 audit R6, review round 2) one lazyChunk (app/lazyChunk.ts) for the airframe and the FX runtime's lens guns:
// a memo nulled on failure was asked again by every frame's sync (and the lens guns' own latch the same), so one failed
// chunk was a new import and a warning each frame for the rest of an AC-130 battle; the policy asks at once, then past
// its backoff (2, 4, 8 ... s, at most a minute), and never while offline
const airframeChunk = createLazyChunk((): Promise<AirframeModule> => import('./gunshipAirframe.ts').then((module) => {
  build = module.buildGunshipAirframe;
  return module;
}, (error: unknown) => {
  console.warn('[gunship] the airframe did not load:', error);
  throw error;
}));
let airframeAsk: Promise<void> | null = null;
let airframeAsked: Promise<AirframeModule> | null = null;
/** The airframe's chunk: resolves once it is in, or once this ask failed (nothing drawn until a later ask loads it). The
 *  same handled promise until the load's state moves, so a sync on every frame allocates nothing. */
export function loadGunshipAirframe(): Promise<void> {
  const request = airframeChunk.load();
  if (request !== airframeAsked) {
    airframeAsked = request;
    airframeAsk = request.then(() => undefined, () => undefined);
  }
  return airframeAsk!;
}
/** The airframe's module once its chunk is in (the FX runtime's lens guns build from it), else null: ask with
 *  loadGunshipAirframe. */
export function loadedGunshipAirframe(): AirframeModule | null { return airframeChunk.value; }

const aircraft = new WeakMap<THREE.Object3D, Airframe>();
/** (ac130-fx-228 r3) a camera nearer the airframe's origin than this is inside it (half its 40.4 m span, and a margin) */
const GUNSHIP_HULL_CLEAR_M = 24;
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

/** An orbiting four-engine gunship replaces the tank exterior in aerial mode, drawn while `visible`. (ac130-fx-228 r2)
 *  The anchor (`tankRoot`, an empty group) keeps the visibility the camera rig and the streamer give it: the rig hides
 *  the pilot's own vehicle on every frame its gimbal lens (inside the airframe, at the orbit centre) is the camera and
 *  shows it for an external pose (the killcam, the ending's replay and orbit), so the caller passes it straight on. */
export function syncGunshipVisual(tankRoot: THREE.Object3D, position: THREE.Vector3, yaw: number, dt: number, visible: boolean,
  eye: THREE.Vector3 | null = null, bank = GUNSHIP_BANK_RAD, pitch = 0): void {
  const model = airframeOf(tankRoot);
  if (model) {
    if (tankRoot.parent && model.root.parent !== tankRoot.parent) tankRoot.parent.add(model.root);
    // (ac130-fx-228 r3, the engineering critic: every AC-130 ending's camera blends out from the gimbal lens, at the
    // airframe's own origin, so its first second filmed the plane from inside) a camera inside the hull never draws it;
    // leaving, it looks away from the aircraft toward the ending's focus, so the airframe is behind it when it returns
    model.root.visible = visible && !(eye && eye.distanceToSquared(position) < GUNSHIP_HULL_CLEAR_M * GUNSHIP_HULL_CLEAR_M);
    model.root.position.copy(position);
    // the bank its flight gives it (Air Support's run: sim/strikeRuns.ts), else the AC-130 mode's fixed one; nose-up pitch
    model.root.rotation.set(-pitch, yaw, bank, 'YXZ');
    model.spin(dt);
  }
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
  // (ac130-fx-228 r2) a carrier exists only in an AC-130 battle, built while its loading cover is up: the airframe's
  // chunk starts loading with it (solo and online), so the first sync finds it
  void loadGunshipAirframe();
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
