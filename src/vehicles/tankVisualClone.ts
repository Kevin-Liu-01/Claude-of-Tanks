// The clone path for finished tank visuals (cloneTankVisual), kept out of the factory's own chunk so only its users
// (the multiplayer roster) load it: the factory records what a clone copies (TANK_CLONE_SOURCES, GEAR_RUNTIME_ENVS) and
// runs the same runtimes over the copy (createTankRuntimeSteps, createRunningGearRuntime).
import * as THREE from 'three';
import { mulberry32 } from './factoryGeometry.ts';
import { acquireTankTextureLease, copyVehicleMaterial, resolveMultiplayerCamoPattern } from './materials.ts';
import { runningGearMotionScaleOf, scaleRunningGearMotion } from './scaledGroundSampler.ts';
import {
  GEAR_OWN_METHODS, GEAR_RUNTIME_ENVS, TANK_CLONE_SOURCES, combineGearUnits, createRunningGearRuntime,
  createTankRuntimeSteps, installCoplanarDepthLayers, installVehicleGroundReference, isVehicleMaterial,
  normalizeTankEngineContext,
  type DisposableVehicleResource, type RunningGearUnit, type TankFactoryOptions, type TankMaterials, type TankRuntimeEnv,
  type TankVisual,
} from './tankFactoryCore.ts';
import { VehicleGraphCopy } from './vehicleGraphClone.ts';
import { copyVehicleNightLighting } from './vehicleNightLighting.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';

/** A clone's own paint and texture tier (cloneTankVisual); the geometry tier and the paint scheme are its source's. */
export interface TankCloneOptions {
  camoSeed?: number;
  camoPattern?: string | null;
  quality?: TankFactoryOptions['quality'];
}

/**
 * A second visual of a finished one's vehicle, built by copying it instead of running its build (the multiplayer
 * roster's repeated vehicles: 1-1.5 s of build each, the clone a few ms). The copy shares every buffer its runtime never
 * writes and the camouflage textures; its tree, transforms, materials, ERA, equipment and weapon damage buffers,
 * running-gear state, track bands and texture scroll, burn mask, dents and lamps are its own, driven by its own runtime
 * (createTankRuntimeSteps over its copies). `camoSeed` seeds the clone's runtime randomness (the wreck's burn, pop and
 * dents); its stowage is its source's, the one thing a fresh build's seed would also move.
 *
 * The source must be pristine: built but never shown, synced, warmed, damaged or destroyed (the roster clones it
 * before it adds it to the scene). Battle-batched builds (batchStatic) cannot be cloned. Anything the copy cannot
 * carry faithfully throws, and the caller builds the visual from scratch instead.
 */
export function cloneTankVisual(source: TankVisual, engineContext: RuntimeValue, cloneOpts: TankCloneOptions = {}): TankVisual {
  const record = TANK_CLONE_SOURCES.get(source);
  if (!record) throw new Error(`${source.specId}: not a finished factory visual`);
  const { env } = record;
  const quality = cloneOpts.quality ?? env.opts.quality ?? 'high';
  const camoPattern = cloneOpts.camoPattern === undefined ? env.opts.camoPattern ?? null : cloneOpts.camoPattern;
  const camoSeed = cloneOpts.camoSeed ?? 4000;
  const engineCtx = normalizeTankEngineContext(engineContext);
  if (env.batchStatic) throw new Error(`${env.specId}: a battle-batched visual cannot be cloned`);
  if ((quality === 'low' ? 'low' : 'high') !== env.geometryQuality) throw new Error(`${env.specId}: a clone keeps its source's geometry tier`);
  // the scheme as painted now: 'auto' is the active battlefield's pick, so a source built with that pick named outright
  // (a returning tab's boot, main.ts) is the same paint, and 'auto' built under another battlefield is not
  const paint = (pattern: string | null) => (pattern == null ? null : resolveMultiplayerCamoPattern(env.specId, pattern));
  if (paint(camoPattern) !== paint(env.opts.camoPattern ?? null)) throw new Error(`${env.specId}: a clone keeps its source's paint scheme`);
  if (engineCtx !== env.engineCtx) throw new Error(`${env.specId}: a clone registers through its source's engine context`);
  if (source.isDestroyed() || source.root.parent) throw new Error(`${env.specId}: only a pristine visual can be cloned`);
  for (const cluster of env.destructibleClusters.values()) {
    if (cluster.spent) throw new Error(`${env.specId}: only a pristine visual can be cloned`);
  }

  const disposables: DisposableVehicleResource[] = [];
  let lease: { release(): void } | null = null;
  try {
    const sourceMats = env.mats;
    // the track bands scroll their own textures (updateGearSurface): the copy's share the image, not the offset
    const textures = new Map<THREE.Texture, THREE.Texture>();
    for (const texture of [sourceMats.trackTexL, sourceMats.trackTexR]) {
      const own = texture.clone();
      textures.set(texture, own);
      disposables.push(own);
    }
    const materials = new Map<THREE.Material, THREE.Material>();
    const copy = new VehicleGraphCopy((material) => {
      let own = materials.get(material);
      if (!own) {
        own = copyVehicleMaterial(material);
        for (const [key, value] of Object.entries(own)) {
          const texture = value as THREE.Texture | null;
          if (texture?.isTexture && textures.has(texture)) (own as unknown as Record<string, unknown>)[key] = textures.get(texture);
        }
        materials.set(material, own);
        disposables.push(own);
      }
      return own;
    }, new Set(['runningGearRoadWheels', 'runningGearGroundRun']));
    if (!env.geometryOnly) lease = acquireTankTextureLease(env.spec, engineCtx, quality, camoPattern);
    const mats = {} as TankMaterials;
    for (const [key, value] of Object.entries(sourceMats)) {
      (mats as unknown as Record<string, unknown>)[key] = value instanceof THREE.Material ? copy.material(value)
        : value instanceof THREE.Texture ? textures.get(value) ?? value : value;
    }
    mats.prepareBurnt = () => {
      // the shared char atlases, attached to the copy's own wreck fallback as its source attaches them
      sourceMats.prepareBurnt?.();
      if (mats.burnt.map === sourceMats.burnt.map && mats.burnt.emissiveMap === sourceMats.burnt.emissiveMap) return;
      mats.burnt.map = sourceMats.burnt.map;
      mats.burnt.emissiveMap = sourceMats.burnt.emissiveMap;
      mats.burnt.needsUpdate = true;
    };
    mats.decal = () => { throw new Error('a cloned visual paints no new markings'); };
    const held = lease;
    mats.dispose = () => { held?.release(); };

    // the buffers the runtime writes: the ERA clusters' and drapes' positions, the equipment lids, the weapons' scorch
    // colours and every dynamic buffer (the track bands)
    const written = new Set<THREE.BufferAttribute | THREE.InterleavedBufferAttribute>();
    for (const cluster of env.destructibleClusters.values()) {
      for (const range of cluster.ranges) written.add(range.position);
      for (const drape of cluster.drapes ?? []) written.add(drape.position);
    }
    source.root.traverse((object) => {
      const geometry = (object as THREE.Mesh).isMesh ? (object as THREE.Mesh).geometry : null;
      if (!geometry) return;
      const attributes = Object.values(geometry.attributes);
      if (env.equipmentDamage.ownsGeometry(geometry) || env.weaponDamage.ownsGeometry(geometry)
          || attributes.some((attribute) => written.has(attribute)
            || ('usage' in attribute && attribute.usage !== THREE.StaticDrawUsage))) {
        disposables.push(copy.ownGeometry(geometry));
      }
    });
    const root = copy.tree(source.root);
    copy.userData();
    root.userData.textureQuality = quality;

    const object = <T extends THREE.Object3D>(value: T): T => copy.object(value);
    const geometryOf = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => copy.geometry(geometry);
    const cloneEnv: TankRuntimeEnv = {
      ...env,
      opts: { ...env.opts, camoSeed, camoPattern, quality },
      engineCtx,
      mats,
      rng: mulberry32((camoSeed | 0) ^ 0x9e37),
      root, hullG: object(env.hullG), turretG: object(env.turretG), gunG: object(env.gunG), recoilG: object(env.recoilG),
      barrelGs: env.barrelGs.map(object),
      eraPlacements: env.eraPlacements.map((placement) => ({ ...placement, _mesh: placement._mesh && object(placement._mesh) })),
      eraLocal: env.eraLocal.map(object),
      destructibleClusters: new Map([...env.destructibleClusters].map(([name, cluster]) => [name, {
        ranges: cluster.ranges.map((range) => ({ ...range, position: copy.attribute(range.position) })),
        spent: false,
        ...(cluster.drapes ? { drapes: cluster.drapes.map((drape) => ({ ...drape, position: copy.attribute(drape.position) })) } : {}),
      }])),
      disposables,
      equipmentDamage: env.equipmentDamage.cloneFor(geometryOf),
      weaponDamage: env.weaponDamage.cloneFor(geometryOf),
      P: { gear: cloneRunningGear(env.P.gear, copy, mats, disposables), muzzleZ: env.P.muzzleZ },
      decalMeshes: env.decalMeshes.map(object),
      proceduralShadowSources: env.proceduralShadowSources.map(object),
      muzzle: object(env.muzzle),
      launcherTips: env.launcherTips.map(object),
      muzzleTips: env.muzzleTips.map(object),
      carvedMuzzleFrames: env.carvedMuzzleFrames.map(object),
      turretTop: object(env.turretTop),
      restScan: copy.value(env.restScan),
      gearCG: copy.value(env.gearCG),
      drawnCG: copy.value(env.drawnCG),
      ownsTree: false,
    };
    const mobileDetailObjects = record.mobileDetailObjects.map((entry) => ({ ...entry, object: object(entry.object) }));
    const steps = createTankRuntimeSteps(cloneEnv, { mobileDetailObjects });
    const made = steps.next();
    if (!made.done) throw new Error(`${env.specId}: a clone's runtime yielded`);
    const visual = made.value;
    // the render hooks every finished mesh carries: its coplanar depth layer, then the ground reference around it
    const depthLayers = record.depthLayers.map((layer) => ({
      object: object(layer.object), materials: layer.materials.map((material) => copy.material(material)), layer: layer.layer,
    }));
    installCoplanarDepthLayers(root, depthLayers);
    installVehicleGroundReference(root);
    copyVehicleNightLighting(source.root, root, (value) => copy.objects.get(value),
      (material) => copy.material(material));
    root.userData.cloneSourceSpecId = env.specId;
    TANK_CLONE_SOURCES.set(visual, { env: cloneEnv, mobileDetailObjects, depthLayers });
    return visual;
  } catch (error) {
    for (const resource of disposables) {
      if (isVehicleMaterial(resource)) engineCtx?.releaseShadowMaterial?.(resource);
      resource.dispose();
    }
    lease?.release();
    throw error;
  }
}

/** A clone's running gear: each of its source's units' runtimes over the clone's copies (createRunningGearRuntime). */
function cloneRunningGear(
  gear: RunningGearUnit | null,
  copy: VehicleGraphCopy,
  mats: TankMaterials,
  disposables: DisposableVehicleResource[],
): RunningGearUnit | null {
  if (!gear) return null;
  const units = (gear.__units || [gear]).map((unit) => {
    const env = GEAR_RUNTIME_ENVS.get(unit);
    if (!env) throw new Error('a running-gear unit without its runtime record cannot be cloned');
    if (env.spinnerInstances.length) throw new Error('a battle-batched running gear cannot be cloned');
    return createRunningGearRuntime({
      ...env,
      disposables,
      hullG: copy.object(env.hullG),
      mats,
      ribMat: copy.material(env.ribMat),
      entries: copy.value(env.entries),
      made: copy.value(env.made),
      suspWheels: copy.value(env.suspWheels),
      suspensionLinks: copy.value(env.suspensionLinks),
      addRoadWheelLayer: () => { throw new Error('a cloned running gear takes no new road-wheel layers'); },
      tl: copy.object(env.tl),
      tr: copy.object(env.tr),
      tgL: copy.geometry(env.tgL),
      tgR: copy.geometry(env.tgR),
      linkMeshes: copy.value(env.linkMeshes),
      spinners: copy.value(env.spinners),
      bandRestPos: copy.value(env.bandRestPos),
      loadedContact: copy.value(env.loadedContact),
      gearContactGeom: copy.value(env.gearContactGeom),
    });
  });
  const clone = units.length === 1 ? units[0]! : combineGearUnits(units);
  // what the builder did to the gear after building it (profiles/vehicleSize.ts rescales its contact, track hitboxes and
  // wheel layout and runs its solver in the authoring frame): the source's data as it stands, and the same motion scale
  for (const [key, value] of Object.entries(gear)) {
    if (key !== '__units' && typeof value !== 'function') (clone as unknown as Record<string, unknown>)[key] = copy.value(value);
  }
  const scale = runningGearMotionScaleOf(gear);
  if (scale) scaleRunningGearMotion(clone, scale.factor);
  const own = GEAR_OWN_METHODS.get(gear);
  for (const [key, value] of Object.entries(gear)) {
    if (typeof value !== 'function' || own?.get(key) === value) continue;
    if (scale && value === scale[key as 'update' | 'updateSurface' | 'conform']) continue;
    throw new Error(`a running gear whose ${key} a profile replaced cannot be cloned`);
  }
  for (const unit of gear.__units ?? []) {
    const unitOwn = GEAR_OWN_METHODS.get(unit);
    for (const [key, value] of Object.entries(unit)) {
      if (typeof value === 'function' && unitOwn?.get(key) !== value) throw new Error(`a running gear whose ${key} a profile replaced cannot be cloned`);
    }
  }
  return clone;
}
