/**
 * studioLightRuntime.ts — applies a Scene Studio light plan (studioLight.ts) to the live battlefield and restores it.
 *
 * Demand-loaded by main.ts's Studio port only (never by battle, Garage or boot code). One plan application:
 *
 *   1. the sky preset through the composition root's atomic sky + key-light transaction (atmosphere LUTs, PMREM
 *      environment, fog, cloud decks, CSM key, hemisphere, fill) — the sky's own caches re-key on the preset,
 *   2. vehicle readability,
 *   3. the world's BAKED light: the horizon ring, its treeline and far range are unlit materials whose sun direction,
 *      gains and haze were captured at build time from the map's authored day. They take the plan's key direction,
 *      key/ambient balance, fog tint and an overall dim; the terrain's wall sky light turns with the key,
 *   4. temporal histories that integrate light (the volumetric cloud history, TAA) restart, so a still or the first
 *      film frame after a change never blends the previous light.
 *
 * Every mutated value is saved once and restored exactly: on a return to the authored day, on a world switch and
 * on Studio exit (the battlefield is cached and may host a battle next).
 */
import * as THREE from 'three';
import {
  planStudioLight, type StudioCloudIdentity, type StudioLight, type StudioLightPlan, type StudioTimeOfDay,
} from './studioLight.ts';
import { deriveCloudLayerPreset } from '../engine/cloudPresets.ts';
import { DEFAULT_SKY_PRESET } from '../engine/sky.ts';
import { MARS_SKY_PRESET } from '../engine/marsAtmosphere.ts';
import { setVehicleReadabilityScale } from '../vehicles/vehicleReadability.ts';
import { horizonSkyTint, type MapSkyConfig } from '../world/maps/horizon.ts';
import type { CloudscapeConfig } from '../engine/cloudscapes.ts';

interface StudioLightWorld {
  readonly mapId: string;
  readonly group: THREE.Object3D;
  readonly config: { readonly sky?: MapSkyConfig; readonly clouds?: CloudscapeConfig };
}

export interface StudioLightRuntimeOptions {
  getWorld(): StudioLightWorld | null;
  /** The composition root's sky + key transaction (sky.applyPreset, lighting.setSun, fog baseline, IBL receipt). */
  applySky(preset: MapSkyConfig, keyDirection: THREE.Vector3 | null): void;
  /** Restart light-integrating temporal histories (TAA); the cloud history restarts through the scene's layer. */
  resetTemporalHistory?(): void;
  scene: THREE.Scene;
}

export interface StudioLightRuntime {
  /** Apply the plan for the active world. Returns the plan as rendered. */
  apply(time: StudioTimeOfDay, light: StudioLight | null): StudioLightPlan;
  /** Put every mutated world value and the readability back (the sky belongs to the battle atmosphere owner). */
  restore(): void;
  readonly plan: StudioLightPlan | null;
}

type Uniform<T> = { value: T };
interface VistaUniforms {
  uVAmbient?: Uniform<number>;
  uVSunGain?: Uniform<number>;
  uVSkyTint?: Uniform<THREE.Vector3>;
  uVFogTint?: Uniform<THREE.Vector3>;
}
interface FarShading {
  uFSun: Uniform<THREE.Vector3>;
  uFGains: Uniform<THREE.Vector2>;
  uFRock: Uniform<THREE.Color>;
  uFSnow: Uniform<THREE.Color>;
  uFFog: Uniform<THREE.Color>;
}

const HORIZON_MESHES = new Set(['horizon-ring', 'horizon-treeline', 'horizon-detail', 'horizon-far-range']);
const AUTHORED_DAY = 'authored-day';

/** The map's authored sky as the battle atmosphere starts from it (main.ts getAuthoredPreset; Mars's shared preset). */
export function studioAuthoredSky(world: StudioLightWorld): MapSkyConfig {
  if (world.mapId === 'mars') return { ...MARS_SKY_PRESET };
  const sky = world.config.sky ?? {};
  return world.config.clouds ? { ...sky, cloudscape: world.config.clouds } : { ...sky };
}

/** The cloud field's identity under the authored sun (its weather offset and wind), pinned across Studio times. */
function cloudIdentity(authored: MapSkyConfig): StudioCloudIdentity {
  const layer = deriveCloudLayerPreset({ ...DEFAULT_SKY_PRESET, ...authored } as Parameters<typeof deriveCloudLayerPreset>[0]);
  return { offset: [layer.offset[0], layer.offset[1]], windDirRad: layer.windDirRad };
}

function linearHex(hex: number): THREE.Color {
  return new THREE.Color(hex);
}

export function createStudioLightRuntime(options: StudioLightRuntimeOptions): StudioLightRuntime {
  const savedColors = new Map<THREE.Color, THREE.Color>();
  const savedValues = new Map<Uniform<unknown>, unknown>();
  let appliedRoot: THREE.Object3D | null = null;
  let appliedKey = AUTHORED_DAY;
  let current: StudioLightPlan | null = null;
  const keyScratch = new THREE.Vector3();

  function saveColor(color: THREE.Color): void {
    if (!savedColors.has(color)) savedColors.set(color, color.clone());
  }
  function saveUniform<T>(uniform: Uniform<T> | undefined): uniform is Uniform<T> {
    if (!uniform) return false;
    if (!savedValues.has(uniform as Uniform<unknown>)) {
      const value = uniform.value as unknown;
      savedValues.set(uniform as Uniform<unknown>, (value as { clone?: () => unknown })?.clone ? (value as { clone: () => unknown }).clone() : value);
    }
    return true;
  }
  function original<T>(uniform: Uniform<T>): T {
    return (savedValues.has(uniform as Uniform<unknown>) ? savedValues.get(uniform as Uniform<unknown>) : uniform.value) as T;
  }

  function restoreWorld(): void {
    for (const [color, value] of savedColors) color.copy(value);
    for (const [uniform, value] of savedValues) {
      const live = uniform.value as { copy?: (v: unknown) => unknown };
      if (live && typeof live === 'object' && typeof live.copy === 'function') live.copy(value);
      else uniform.value = value;
    }
    savedColors.clear();
    savedValues.clear();
  }

  /** Unlit horizon materials used only by the named horizon meshes (an alias shared with any other mesh is left alone). */
  function horizonMaterials(root: THREE.Object3D): THREE.MeshBasicMaterial[] {
    const eligible = new Set<THREE.MeshBasicMaterial>(), blocked = new Set<THREE.MeshBasicMaterial>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      const selected = HORIZON_MESHES.has(mesh.name);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const basic = material as THREE.MeshBasicMaterial;
        if (basic?.isMeshBasicMaterial) (selected ? eligible : blocked).add(basic);
      }
    });
    return [...eligible].filter((material) => !blocked.has(material));
  }

  function terrainSunUniforms(root: THREE.Object3D): Uniform<THREE.Vector3>[] {
    const out = new Set<Uniform<THREE.Vector3>>();
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        const list = material?.userData?.sunDirUniforms as Uniform<THREE.Vector3>[] | undefined;
        if (list) for (const uniform of list) out.add(uniform);
      }
    });
    return [...out];
  }

  function gradeWorld(root: THREE.Object3D, plan: StudioLightPlan, authored: MapSkyConfig, key: THREE.Vector3): void {
    const dim = plan.horizon.dim;
    const sky = plan.sky;
    // the balance of the baked lighting follows the plan's key and ambient against the map's authored day
    const keyScale = (sky.sunIntensity ?? 4.5) / Math.max(1e-3, authored.sunIntensity ?? 4.5);
    const ambientScale = (sky.hemiIntensity ?? 0.36) / Math.max(1e-3, authored.hemiIntensity ?? 0.36);
    const fog = linearHex(sky.fogTintHex ?? 0x7e97b8);
    const skyTint = horizonSkyTint(fog);
    for (const material of horizonMaterials(root)) {
      saveColor(material.color);
      material.color.copy(savedColors.get(material.color)!).multiplyScalar(dim);
      const sun = material.userData.horizonSunDir as Uniform<THREE.Vector3> | undefined;
      if (saveUniform(sun)) sun.value.copy(key);
      const vista = (material.userData.horizonVista as { uniforms?: VistaUniforms } | undefined)?.uniforms;
      if (vista) {
        if (saveUniform(vista.uVSunGain)) vista.uVSunGain.value = original(vista.uVSunGain) * keyScale;
        if (saveUniform(vista.uVAmbient)) vista.uVAmbient.value = original(vista.uVAmbient) * ambientScale;
        if (saveUniform(vista.uVSkyTint)) vista.uVSkyTint.value.copy(skyTint);
        if (saveUniform(vista.uVFogTint)) vista.uVFogTint.value.set(fog.r, fog.g, fog.b);
      }
      const far = material.userData.horizonFarShading as FarShading | undefined;
      if (far) {
        if (saveUniform(far.uFSun)) far.uFSun.value.copy(key);
        if (saveUniform(far.uFGains)) {
          const authoredGains = original(far.uFGains);
          far.uFGains.value.set(authoredGains.x * ambientScale, authoredGains.y * keyScale);
        }
        // the far range's rock, snow and haze are absolute colours (the material colour dims only its base albedo)
        if (saveUniform(far.uFRock)) far.uFRock.value.copy(original(far.uFRock)).multiplyScalar(dim);
        if (saveUniform(far.uFSnow)) far.uFSnow.value.copy(original(far.uFSnow)).multiplyScalar(dim);
        if (saveUniform(far.uFFog)) far.uFFog.value.copy(fog).multiplyScalar(dim);
      }
    }
    for (const uniform of terrainSunUniforms(root)) {
      if (saveUniform(uniform)) uniform.value.copy(key);
    }
  }

  function planKey(plan: StudioLightPlan, exactDay: boolean): string {
    return exactDay ? AUTHORED_DAY : JSON.stringify([plan.sky, plan.keyDirection, plan.readability, plan.horizon]);
  }

  function apply(time: StudioTimeOfDay, light: StudioLight | null): StudioLightPlan {
    const world = options.getWorld();
    if (!world) throw new Error('Studio light requires an active battlefield');
    const authored = studioAuthoredSky(world);
    const plan = planStudioLight(world.mapId, authored, time, light, cloudIdentity(authored));
    const exactDay = plan.time === 'day' && plan.sunAzimuthDeg === (authored.sunAzimuthDeg ?? 115)
      && plan.sunElevationDeg === (authored.sunElevationDeg ?? 32);
    if (appliedRoot !== world.group) {
      // a different battlefield: the previous one gets its baked light back; the battle atmosphere owner has just
      // installed this one's authored day (main.ts prepares it before every Studio plan)
      restoreWorld();
      appliedRoot = world.group;
      appliedKey = AUTHORED_DAY;
    }
    const key = planKey(plan, exactDay);
    if (key !== appliedKey) {
      const direction = plan.keyDirection ? keyScratch.set(plan.keyDirection[0], plan.keyDirection[1], plan.keyDirection[2]) : null;
      options.applySky(plan.sky, direction);
      appliedKey = key;
      restoreWorld();
      if (!exactDay) {
        const sunWorld = options.scene.userData.sunDirWorld as THREE.Vector3 | undefined;
        const keyDir = direction ? direction.clone() : (sunWorld ? sunWorld.clone() : new THREE.Vector3(0, 1, 0));
        gradeWorld(world.group, plan, authored, keyDir.normalize());
      }
      setVehicleReadabilityScale(plan.readability);
      // light-integrating histories restart: a capture right after the change rebuilds them at this light
      (options.scene.userData.volumetricClouds as { resetHistory?: () => void } | null | undefined)?.resetHistory?.();
      options.resetTemporalHistory?.();
    }
    current = plan;
    return plan;
  }

  function restore(): void {
    restoreWorld();
    setVehicleReadabilityScale(1);
    appliedRoot = null;
    appliedKey = AUTHORED_DAY;
    current = null;
  }

  return { apply, restore, get plan() { return current; } };
}
